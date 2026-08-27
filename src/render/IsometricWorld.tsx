import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  Rect,
  RoundedRect,
  useImage,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import type { CombatState, GameState, PlacedBuilding } from '../sim/types';
import { getBuildingDef, getTroopDef, META } from '../sim/content';
import { canPlace } from '../sim/buildings';
import { resolveBuildingSprite } from './assets';
import {
  TILE_H,
  TILE_W,
  depthKey,
  footprintCenterScreen,
  gridToScreen,
  screenToGrid,
} from '../sim/iso';
import { mapLogMount, mapLogPanBegin, mapLogPanEnd, mapLog } from '../debug/mapPerfLog';

/**
 * Clash-style isometric village:
 * CoC uses a native GPU engine (one scene graph). In RN/Expo we approximate that
 * with a SINGLE Skia Canvas + Group camera transform (UI thread) — not N RN Views.
 */

interface Props {
  state: GameState;
  width: number;
  height: number;
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
  label: string;
  depth: number;
  selected: boolean;
  sprite: number | null;
};

function layoutSprite(item: DrawItem) {
  const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
  const bw = Math.max(36, (item.w + item.h) * (TILE_W / 2) * 0.9);
  const bh = item.sprite ? Math.max(48, bw * 0.9) : Math.max(24, item.h * TILE_H * 0.85 + 14);
  const southY = c.y + ((item.w + item.h - 2) * TILE_H) / 4;
  return {
    left: c.x - bw / 2,
    top: southY - bh + TILE_H * 0.15,
    bw,
    bh,
  };
}

const SkiaBuilding = memo(function SkiaBuilding({ item }: { item: DrawItem }) {
  // useImage accepts require() module id; null → placeholder rect
  const img = useImage(item.sprite ?? undefined);
  const { left, top, bw, bh } = layoutSprite(item);

  if (item.sprite && img) {
    return (
      <Group>
        {item.selected ? (
          <RoundedRect
            x={left - 2}
            y={top - 2}
            width={bw + 4}
            height={bh + 4}
            r={4}
            color="rgba(255,245,157,0.85)"
            style="stroke"
            strokeWidth={2}
          />
        ) : null}
        <SkiaImage image={img} x={left} y={top} width={bw} height={bh} fit="contain" />
      </Group>
    );
  }

  return (
    <RoundedRect x={left} y={top} width={bw} height={bh} r={4} color={item.color} />
  );
});

function toDrawItem(
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  buildingId: string,
  level: number,
  color: string,
  label: string,
  depth: number,
  selected: boolean,
): DrawItem {
  const def = getBuildingDef(buildingId);
  return {
    key,
    x,
    y,
    w,
    h,
    color,
    label,
    depth,
    selected,
    sprite: resolveBuildingSprite(def.spriteKey, level),
  };
}

function eventToGrid(
  ex: number,
  ey: number,
  offsetX: number,
  offsetY: number,
  scale: number,
): { x: number; y: number } {
  const localX = (ex - offsetX) / scale;
  const localY = (ey - offsetY) / scale;
  return screenToGrid(localX, localY);
}

export function IsometricWorld({
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
}: Props) {
  const gridSize = combat?.mapSize ?? META.gridSize;
  const placing = mode === 'village' && !!placementBuildingId;
  const offsetX = useSharedValue(width * 0.28);
  const offsetY = useSharedValue(height * 0.18);
  const scale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  const cameraTransform = useDerivedValue(() => [
    { translateX: offsetX.value },
    { translateY: offsetY.value },
    { scale: scale.value },
  ]);

  useEffect(() => {
    mapLogMount({
      mode,
      w: width,
      h: height,
      grid: gridSize,
      buildings: state.buildings.length,
      placing: placing ? 1 : 0,
      renderer: 'skia-canvas',
    });
  }, [mode, width, height, gridSize, state.buildings.length, placing]);

  const reportHover = useCallback(
    (gx: number, gy: number) => {
      onHoverTile?.(gx, gy);
    },
    [onHoverTile],
  );

  const handleTap = useCallback(
    (gx: number, gy: number) => {
      mapLog('tap', { gx, gy, placing: placing ? 1 : 0 });
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
    [
      mode,
      onConfirmPlace,
      onSelectBuilding,
      onTapTile,
      placementBuildingId,
      placing,
      state.buildings,
    ],
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
          const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value, scale.value);
          runOnJS(reportHover)(g.x, g.y);
        })
        .onUpdate((e) => {
          const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value, scale.value);
          runOnJS(reportHover)(g.x, g.y);
        }),
    [placing, offsetX, offsetY, scale, reportHover],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          startScale.value = scale.value;
        })
        .onUpdate((e) => {
          scale.value = Math.min(1.35, Math.max(0.75, startScale.value * e.scale));
        }),
    [scale, startScale],
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
        ? Gesture.Simultaneous(placePointer, cameraPan, pinch, tap)
        : Gesture.Simultaneous(cameraPan, pinch, tap),
    [placing, placePointer, cameraPan, pinch, tap],
  );

  const sorted = useMemo((): DrawItem[] => {
    if (mode === 'combat' && combat) {
      const items: DrawItem[] = combat.buildings
        .filter((b) => !b.destroyed)
        .map((b) => {
          const def = getBuildingDef(b.buildingId);
          return toDrawItem(
            b.instanceId,
            b.x,
            b.y,
            b.w,
            b.h,
            b.buildingId,
            b.level,
            def.color,
            def.name.slice(0, 3),
            depthKey(b.x, b.y, b.w, b.h, 1),
            false,
          );
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
          label: def.name.slice(0, 2),
          depth: depthKey(u.x, u.y, 1, 1, 2),
          selected: false,
          sprite: null,
        });
      }
      return items.sort((a, b) => a.depth - b.depth);
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
          def.name.slice(0, 4),
          depthKey(b.x, b.y, def.footprint.w, def.footprint.h, 1),
          b.instanceId === selectedBuildingId,
        );
      })
      .sort((a, b) => a.depth - b.depth);
  }, [combat, mode, selectedBuildingId, state.buildings]);

  const groundLeft = gridToScreen(0, gridSize - 1).x - TILE_W;
  const groundRight = gridToScreen(gridSize - 1, 0).x + TILE_W;
  const groundTop = gridToScreen(0, 0).y - TILE_H;
  const groundBottom = gridToScreen(gridSize - 1, gridSize - 1).y + TILE_H * 2;
  const groundW = Math.max(80, groundRight - groundLeft);
  const groundH = Math.max(80, groundBottom - groundTop);

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
    return { valid: check.ok, cells, def, hoverTile };
  }, [placing, placementBuildingId, hoverTile, state]);

  return (
    <View style={[styles.wrap, { width, height }]}>
      <GestureDetector gesture={composed}>
        <View style={{ width, height }} collapsable={false}>
          <Canvas style={{ width, height }}>
            <Group transform={cameraTransform}>
              <RoundedRect
                x={groundLeft}
                y={groundTop}
                width={groundW}
                height={groundH}
                r={10}
                color="#3F7A3B"
              />
              {sorted.map((item) => (
                <SkiaBuilding key={item.key} item={item} />
              ))}
              {previewCells
                ? previewCells.cells.map((c) => {
                    const p = gridToScreen(c.x, c.y);
                    return (
                      <Rect
                        key={`p-${c.x}-${c.y}`}
                        x={p.x - TILE_W / 2}
                        y={p.y - TILE_H / 2}
                        width={TILE_W}
                        height={TILE_H}
                        color={
                          previewCells.valid
                            ? 'rgba(76,175,80,0.5)'
                            : 'rgba(229,57,53,0.5)'
                        }
                      />
                    );
                  })
                : null}
              {previewCells && placementBuildingId ? (
                <Group opacity={previewCells.valid ? 0.9 : 0.45}>
                  <SkiaBuilding
                    item={toDrawItem(
                      'ghost',
                      previewCells.hoverTile.x,
                      previewCells.hoverTile.y,
                      previewCells.def.footprint.w,
                      previewCells.def.footprint.h,
                      placementBuildingId,
                      1,
                      previewCells.def.color,
                      previewCells.def.name.slice(0, 4),
                      9000,
                      false,
                    )}
                  />
                </Group>
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
}

const styles = StyleSheet.create({
  wrap: {
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
