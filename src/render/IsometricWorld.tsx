import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import { recordWorldPicture, worldDimensions } from './buildWorldPicture';
import { preloadAllSprites } from './spriteCache';
import {
  TILE_H,
  TILE_W,
  depthKey,
  footprintCenterScreen,
  gridToScreen,
  screenToGrid,
} from '../sim/iso';
import { mapLogMount, mapLogPanBegin, mapLogPanEnd } from '../debug/mapPerfLog';

/**
 * CoC-style: bake terrain + buildings into one Skia Picture, pan = matrix only.
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

function eventToGrid(ex: number, ey: number, offsetX: number, offsetY: number) {
  return screenToGrid(ex - offsetX, ey - offsetY);
}

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
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pictureRef = useRef<SkPicture | null>(null);
  const mounted = useRef(false);
  const [spritesReady, setSpritesReady] = useState(false);

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
    const center = gridToScreen(gridSize / 2, gridSize / 2);
    offsetX.value = width / 2 - center.x;
    offsetY.value = height / 2 - center.y;
    if (!mounted.current) {
      mounted.current = true;
      mapLogMount({
        mode,
        w: Math.round(width),
        h: Math.round(height),
        grid: gridSize,
        buildings: state.buildings.length,
        placing: placing ? 1 : 0,
        renderer: 'skia-picture-camera',
      });
    }
  }, [width, height, gridSize, mode, state.buildings.length, placing, offsetX, offsetY]);

  useEffect(() => {
    return () => {
      pictureRef.current?.dispose?.();
      pictureRef.current = null;
    };
  }, []);

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
    mapLogPanBegin(mode, state.buildings.length);
  }, [mode, state.buildings.length]);

  const onPanEndJS = useCallback(() => {
    mapLogPanEnd();
  }, []);

  const cameraPan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(placing ? 2 : 1)
        .activeOffsetX([-6, 6])
        .activeOffsetY([-6, 6])
        .onBegin(() => {
          startX.value = offsetX.value;
          startY.value = offsetY.value;
          runOnJS(onPanBeginJS)();
        })
        .onUpdate((e) => {
          offsetX.value = startX.value + e.translationX;
          offsetY.value = startY.value + e.translationY;
        })
        .onFinalize(() => {
          runOnJS(onPanEndJS)();
        }),
    [placing, offsetX, offsetY, startX, startY, onPanBeginJS, onPanEndJS],
  );

  const placePointer = useMemo(
    () =>
      Gesture.Pan()
        .enabled(placing)
        .minPointers(1)
        .maxPointers(1)
        .onBegin((e) => {
          const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value);
          runOnJS(reportHover)(g.x, g.y);
        })
        .onUpdate((e) => {
          const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value);
          runOnJS(reportHover)(g.x, g.y);
        }),
    [placing, offsetX, offsetY, reportHover],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value);
        if (placing) runOnJS(reportHover)(g.x, g.y);
        runOnJS(handleTap)(g.x, g.y);
      }),
    [placing, offsetX, offsetY, reportHover, handleTap],
  );

  const composed = useMemo(
    () =>
      placing
        ? Gesture.Simultaneous(placePointer, cameraPan, tap)
        : Gesture.Simultaneous(cameraPan, tap),
    [placing, placePointer, cameraPan, tap],
  );

  const cameraTransform = useDerivedValue(() => [
    { translateX: offsetX.value },
    { translateY: offsetY.value },
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

  const sorted = useMemo((): DrawItem[] => {
    if (mode === 'combat' && combat) {
      const items: DrawItem[] = combat.buildings
        .filter((b) => !b.destroyed)
        .map((b) => {
          const def = getBuildingDef(b.buildingId);
          return toDrawItem(b.instanceId, b.x, b.y, b.w, b.h, b.buildingId, b.level, def.color);
        });
      for (const u of combat.units) {
        const def = getTroopDef(u.troopId);
        items.push({
          key: u.id,
          x: u.x,
          y: u.y,
          w: 1,
          h: 1,
          color: def.color,
          sprite: null,
        });
      }
      return items.sort(
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
  }, [buildingVisualKey, combat, mode]);

  const worldPicture = useMemo(() => {
    if (!spritesReady) return null;
    pictureRef.current?.dispose?.();
    const pic = recordWorldPicture(worldW, worldH, gridSize, sorted);
    pictureRef.current = pic;
    return pic;
  }, [spritesReady, buildingVisualKey, gridSize, worldW, worldH, sorted]);

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
              {worldPicture ? <Picture picture={worldPicture} /> : null}
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
  const win = useWindowDimensions();
  const width = props.width ?? win.width;
  const height = props.height ?? win.height;
  return <IsometricWorldInner {...props} width={width} height={height} />;
});

const styles = StyleSheet.create({
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
