import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Group,
  Picture,
  Rect,
  RoundedRect,
  type SkPicture,
} from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, runOnJS } from 'react-native-reanimated';
import type { CombatState, GameState, PlacedBuilding } from '../sim/types';
import { getBuildingDef, getTroopDef, META } from '../sim/content';
import { canPlace } from '../sim/buildings';
import { resolveBuildingSprite } from './assets';
import { recordBuildingsPicture } from './buildingsPicture';
import { worldDimensions } from './buildWorldPicture';
import { preloadAllSprites } from './spriteCache';
import { getTerrainPicture } from './terrainPicture';
import {
  TILE_H,
  TILE_W,
  depthKey,
  footprintCenterScreen,
  gridToScreen,
  screenToGrid,
} from '../sim/iso';
import { mapLog, mapLogMount, mapLogPanBegin, mapLogPanEnd } from '../debug/mapPerfLog';

/**
 * CoC-style renderer: cached terrain Picture + buildings Picture, pan = camera matrix only.
 */

interface Props {
  state: GameState;
  width?: number;
  height?: number;
  mode?: 'village' | 'combat';
  combat?: CombatState | null;
  selectedBuildingId?: string | null;
  placementBuildingId?: string | null;
  hoverTile?: { x: number; y: number } | null;
  onHoverTile?: (gx: number, gy: number) => void;
  onConfirmPlace?: (gx: number, gy: number) => void;
  onTapTile?: (gx: number, gy: number) => void;
  onSelectBuilding?: (instanceId: string | null) => void;
}

type DrawItem = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  sprite: number | null;
};

const PAN_MARGIN = 48;
const MIN_SCALE = 0.55;
const MAX_SCALE = 2.2;

function clampPan(
  ox: number,
  oy: number,
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number,
) {
  'worklet';
  const minX = Math.min(PAN_MARGIN, viewW - worldW - PAN_MARGIN);
  const maxX = PAN_MARGIN;
  const minY = Math.min(PAN_MARGIN, viewH - worldH - PAN_MARGIN);
  const maxY = PAN_MARGIN;
  return {
    x: Math.max(minX, Math.min(maxX, ox)),
    y: Math.max(minY, Math.min(maxY, oy)),
  };
}

const PreviewOverlay = memo(function PreviewOverlay({
  cells,
  valid,
}: {
  cells: { x: number; y: number }[];
  valid: boolean;
}) {
  return (
    <>
      {cells.map((c) => {
        const p = gridToScreen(c.x, c.y);
        return (
          <Rect
            key={`p-${c.x}-${c.y}`}
            x={p.x - TILE_W / 2}
            y={p.y - TILE_H / 2}
            width={TILE_W}
            height={TILE_H}
            color={valid ? 'rgba(76,175,80,0.5)' : 'rgba(229,57,53,0.5)'}
          />
        );
      })}
    </>
  );
});

function selectionRing(item: DrawItem) {
  const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
  const bw = Math.max(36, (item.w + item.h) * (TILE_W / 2) * 0.9);
  const bh = item.sprite ? Math.max(48, bw * 0.9) : Math.max(24, item.h * TILE_H * 0.85 + 14);
  const southY = c.y + ((item.w + item.h - 2) * TILE_H) / 4;
  return {
    left: c.x - bw / 2 - 2,
    top: southY - bh + TILE_H * 0.15 - 2,
    bw: bw + 4,
    bh: bh + 4,
  };
}

function toDrawItem(
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  buildingId: string,
  level: number,
  color: string,
): DrawItem {
  const def = getBuildingDef(buildingId);
  return {
    key,
    x,
    y,
    w,
    h,
    color,
    sprite: resolveBuildingSprite(def.spriteKey, level),
  };
}

function eventToGrid(
  ex: number,
  ey: number,
  offsetX: number,
  offsetY: number,
  scale: number,
) {
  const s = scale > 0 ? scale : 1;
  return screenToGrid((ex - offsetX) / s, (ey - offsetY) / s);
}

const UnitLayer = memo(function UnitLayer({ units }: { units: DrawItem[] }) {
  return (
    <>
      {units.map((item) => {
        const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
        const size = Math.max(14, TILE_W * 0.45);
        return (
          <RoundedRect
            key={item.key}
            x={c.x - size / 2}
            y={c.y - size / 2}
            width={size}
            height={size}
            r={3}
            color={item.color}
          />
        );
      })}
    </>
  );
});

const IsometricWorldInner = memo(function IsometricWorldInner({
  state,
  width,
  height,
  mode = 'village',
  combat,
  selectedBuildingId,
  placementBuildingId,
  hoverTile,
  onHoverTile,
  onConfirmPlace,
  onTapTile,
  onSelectBuilding,
}: Props & { width: number; height: number }) {
  const gridSize = combat?.mapSize ?? META.gridSize;
  const placing = mode === 'village' && !!placementBuildingId;
  const { worldW, worldH } = worldDimensions(gridSize);

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const viewW = useSharedValue(width);
  const viewH = useSharedValue(height);
  const worldWsv = useSharedValue(worldW);
  const worldHsv = useSharedValue(worldH);
  const buildingsPicRef = useRef<SkPicture | null>(null);
  const centered = useRef(false);
  const mounted = useRef(false);
  const buildingsCountRef = useRef(state.buildings.length);
  const modeRef = useRef(mode);
  buildingsCountRef.current = state.buildings.length;
  modeRef.current = mode;

  const [spritesReady, setSpritesReady] = useState(false);

  useEffect(() => {
    viewW.value = width;
    viewH.value = height;
    worldWsv.value = worldW;
    worldHsv.value = worldH;
  }, [width, height, worldW, worldH, viewW, viewH, worldWsv, worldHsv]);

  useEffect(() => {
    return () => {
      buildingsPicRef.current?.dispose?.();
      buildingsPicRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    preloadAllSprites().then(() => {
      if (!cancelled) setSpritesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (width <= 0 || height <= 0 || centered.current) return;
    const center = gridToScreen(gridSize / 2, gridSize / 2);
    const next = clampPan(
      width / 2 - center.x,
      height / 2 - center.y,
      width,
      height,
      worldW,
      worldH,
    );
    offsetX.value = next.x;
    offsetY.value = next.y;
    centered.current = true;
    if (!mounted.current) {
      mounted.current = true;
      mapLogMount({
        mode,
        w: Math.round(width),
        h: Math.round(height),
        grid: gridSize,
        buildings: state.buildings.length,
        placing: placing ? 1 : 0,
        renderer: 'skia-coc-layers',
      });
    }
  }, [
    width,
    height,
    gridSize,
    mode,
    state.buildings.length,
    placing,
    worldW,
    worldH,
    offsetX,
    offsetY,
  ]);

  const reportHover = useCallback(
    (gx: number, gy: number) => onHoverTile?.(gx, gy),
    [onHoverTile],
  );

  const handleTap = useCallback(
    (gx: number, gy: number) => {
      if (mode === 'combat') {
        onTapTile?.(gx, gy);
        return;
      }
      if (placementBuildingId) {
        onConfirmPlace?.(gx, gy);
        return;
      }
      const hit = state.buildings.find((b) => {
        const def = getBuildingDef(b.buildingId);
        return gx >= b.x && gx < b.x + def.footprint.w && gy >= b.y && gy < b.y + def.footprint.h;
      });
      onSelectBuilding?.(hit?.instanceId ?? null);
      onTapTile?.(gx, gy);
    },
    [mode, onConfirmPlace, onSelectBuilding, onTapTile, placementBuildingId, state.buildings],
  );

  const onPanBeginJS = useCallback(() => {
    mapLogPanBegin(modeRef.current, buildingsCountRef.current);
  }, []);

  const onPanEndJS = useCallback(() => {
    mapLogPanEnd();
    setTimeout(() => mapLog('pan.alive', { afterMs: 400 }), 400);
    setTimeout(() => mapLog('pan.alive', { afterMs: 1200 }), 1200);
  }, []);

  const onPinchBeginJS = useCallback(() => {
    mapLog('pinch.begin', { mode: modeRef.current });
  }, []);

  const onPinchEndJS = useCallback(() => {
    mapLog('pinch.end', { mode: modeRef.current });
    setTimeout(() => mapLog('pinch.alive', { afterMs: 400 }), 400);
  }, []);

  const cameraPan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(placing ? 2 : 1)
        .maxPointers(placing ? 2 : 1)
        .activeOffsetX([-8, 8])
        .activeOffsetY([-8, 8])
        .onBegin(() => {
          startX.value = offsetX.value;
          startY.value = offsetY.value;
          runOnJS(onPanBeginJS)();
        })
        .onUpdate((e) => {
          const next = clampPan(
            startX.value + e.translationX,
            startY.value + e.translationY,
            viewW.value,
            viewH.value,
            worldWsv.value,
            worldHsv.value,
          );
          offsetX.value = next.x;
          offsetY.value = next.y;
        })
        .onFinalize(() => {
          runOnJS(onPanEndJS)();
        }),
    [
      placing,
      offsetX,
      offsetY,
      startX,
      startY,
      viewW,
      viewH,
      worldWsv,
      worldHsv,
      onPanBeginJS,
      onPanEndJS,
    ],
  );

  const cameraPinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(!placing)
        .onBegin((e) => {
          focalX.value = e.focalX;
          focalY.value = e.focalY;
          runOnJS(onPinchBeginJS)();
        })
        .onUpdate((e) => {
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
          const ratio = next / scale.value;
          offsetX.value = focalX.value - (focalX.value - offsetX.value) * ratio;
          offsetY.value = focalY.value - (focalY.value - offsetY.value) * ratio;
          scale.value = next;
        })
        .onEnd(() => {
          savedScale.value = scale.value;
        })
        .onFinalize(() => {
          runOnJS(onPinchEndJS)();
        }),
    [placing, offsetX, offsetY, scale, savedScale, focalX, focalY, onPinchBeginJS, onPinchEndJS],
  );

  const placePointer = useMemo(
    () =>
      Gesture.Pan()
        .enabled(placing)
        .minPointers(1)
        .maxPointers(1)
        .onBegin((e) => {
          const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value, scale.value);
          runOnJS(reportHover)(g.x, g.y);
        })
        .onUpdate((e) => {
          const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value, scale.value);
          runOnJS(reportHover)(g.x, g.y);
        }),
    [placing, offsetX, offsetY, scale, reportHover],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value, scale.value);
        if (placing) runOnJS(reportHover)(g.x, g.y);
        runOnJS(handleTap)(g.x, g.y);
      }),
    [placing, offsetX, offsetY, scale, reportHover, handleTap],
  );

  const composed = useMemo(
    () =>
      placing
        ? Gesture.Simultaneous(placePointer, cameraPan, cameraPinch, tap)
        : Gesture.Simultaneous(cameraPan, cameraPinch, tap),
    [placing, placePointer, cameraPan, cameraPinch, tap],
  );

  const cameraTransform = useDerivedValue(() => [
    { translateX: offsetX.value },
    { translateY: offsetY.value },
    { scale: scale.value },
  ]);

  const buildingVisualKey = useMemo(
    () =>
      (state.buildings as PlacedBuilding[])
        .map(
          (b) =>
            `${b.instanceId}:${b.buildingId}:${b.level}:${b.x}:${b.y}:${b.buildEndsAt ?? 0}`,
        )
        .join('|'),
    [state.buildings],
  );

  const combatBuildingKey = useMemo(() => {
    if (!combat) return '';
    return combat.buildings.map((b) => `${b.instanceId}:${b.destroyed}`).join('|');
  }, [combat]);

  const buildingItems = useMemo((): DrawItem[] => {
    if (mode === 'combat' && combat) {
      return combat.buildings
        .filter((b) => !b.destroyed)
        .map((b) => {
          const def = getBuildingDef(b.buildingId);
          return toDrawItem(b.instanceId, b.x, b.y, b.w, b.h, b.buildingId, b.level, def.color);
        })
        .sort(
          (a, b) => depthKey(a.x, a.y, a.w, a.h, 1) - depthKey(b.x, b.y, b.w, b.h, 1),
        );
    }

    return (state.buildings as PlacedBuilding[])
      .map((b) => {
        const def = getBuildingDef(b.buildingId);
        return toDrawItem(
          b.instanceId,
          b.x,
          b.y,
          def.footprint.w,
          def.footprint.h,
          b.buildingId,
          b.level,
          def.color,
        );
      })
      .sort(
        (a, b) => depthKey(a.x, a.y, a.w, a.h, 1) - depthKey(b.x, b.y, b.w, b.h, 1),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingVisualKey, combatBuildingKey, mode]);

  const combatUnits = useMemo((): DrawItem[] => {
    if (mode !== 'combat' || !combat) return [];
    return combat.units
      .map((u) => {
        const def = getTroopDef(u.troopId);
        return {
          key: u.id,
          x: u.x,
          y: u.y,
          w: 1,
          h: 1,
          color: def.color,
          sprite: null,
        };
      })
      .sort(
        (a, b) => depthKey(a.x, a.y, a.w, a.h, 2) - depthKey(b.x, b.y, b.w, b.h, 2),
      );
  }, [mode, combat]);

  const terrainPicture = useMemo(
    () => getTerrainPicture(worldW, worldH, gridSize),
    [worldW, worldH, gridSize],
  );

  const buildingsPicture = useMemo(() => {
    if (!spritesReady) return null;
    buildingsPicRef.current?.dispose?.();
    const pic = recordBuildingsPicture(worldW, worldH, buildingItems);
    buildingsPicRef.current = pic;
    return pic;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spritesReady, buildingVisualKey, combatBuildingKey, worldW, worldH]);

  const selectedItem = useMemo(() => {
    if (!selectedBuildingId) return null;
    const b = (state.buildings as PlacedBuilding[]).find(
      (x) => x.instanceId === selectedBuildingId,
    );
    if (!b) return null;
    const def = getBuildingDef(b.buildingId);
    return toDrawItem(
      b.instanceId,
      b.x,
      b.y,
      def.footprint.w,
      def.footprint.h,
      b.buildingId,
      b.level,
      def.color,
    );
  }, [selectedBuildingId, state.buildings]);

  const previewCells = useMemo(() => {
    if (!placing || !placementBuildingId || !hoverTile) return null;
    const def = getBuildingDef(placementBuildingId);
    const check = canPlace(state, placementBuildingId, hoverTile.x, hoverTile.y);
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < def.footprint.h; dy++) {
      for (let dx = 0; dx < def.footprint.w; dx++) {
        cells.push({ x: hoverTile.x + dx, y: hoverTile.y + dy });
      }
    }
    return { valid: check.ok, cells };
  }, [placing, placementBuildingId, hoverTile, state]);

  if (width <= 0 || height <= 0) return null;

  const ring = selectedItem ? selectionRing(selectedItem) : null;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <GestureDetector gesture={composed}>
        <View style={{ width, height }} collapsable={false}>
          <Canvas style={{ width, height }}>
            <Group transform={cameraTransform}>
              <Picture picture={terrainPicture} />
              {buildingsPicture ? <Picture picture={buildingsPicture} /> : null}
              {combatUnits.length > 0 ? <UnitLayer units={combatUnits} /> : null}
              {previewCells ? (
                <PreviewOverlay cells={previewCells.cells} valid={previewCells.valid} />
              ) : null}
              {ring ? (
                <RoundedRect
                  x={ring.left}
                  y={ring.top}
                  width={ring.bw}
                  height={ring.bh}
                  r={4}
                  color="rgba(255,245,157,0.85)"
                  style="stroke"
                  strokeWidth={2}
                />
              ) : null}
            </Group>
          </Canvas>
        </View>
      </GestureDetector>
      {placing ? (
        <View style={styles.placeBanner} pointerEvents="none">
          <Text style={styles.placeBannerText}>
            Trascina · verde=ok · rosso=no · tocca per confermare
          </Text>
        </View>
      ) : null}
    </View>
  );
});

export const IsometricWorld = memo(function IsometricWorld(props: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setSize((prev) => {
      if (prev && Math.abs(prev.w - width) < 2 && Math.abs(prev.h - height) < 2) return prev;
      return { w: width, h: height };
    });
  }, []);

  const width = props.width ?? size?.w ?? 0;
  const height = props.height ?? size?.h ?? 0;

  return (
    <View style={styles.fill} onLayout={props.width == null ? onLayout : undefined}>
      {width > 0 && height > 0 ? (
        <IsometricWorldInner {...props} width={width} height={height} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#1A3A28',
  },
  placeBanner: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  placeBannerText: {
    color: '#FFFDE7',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
});
