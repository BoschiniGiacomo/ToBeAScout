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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
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
 * Camera = RN Animated.View (1 native view, UI-thread pan).
 * World = static Skia Canvas (redraw only when buildings change).
 * Clash-like: one GPU surface moved, not N Views / not Skia re-record every frame.
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

  return <RoundedRect x={left} y={top} width={bw} height={bh} r={4} color={item.color} />;
});

/** Memoized static world — only re-renders when draw list / grid / preview change. */
const WorldCanvas = memo(function WorldCanvas({
  worldW,
  worldH,
  groundLeft,
  groundTop,
  groundW,
  groundH,
  items,
  previewCells,
  placementBuildingId,
}: {
  worldW: number;
  worldH: number;
  groundLeft: number;
  groundTop: number;
  groundW: number;
  groundH: number;
  items: DrawItem[];
  previewCells: {
    valid: boolean;
    cells: { x: number; y: number }[];
    hoverTile: { x: number; y: number };
    def: ReturnType<typeof getBuildingDef>;
  } | null;
  placementBuildingId: string | null;
}) {
  useEffect(() => {
    mapLog('canvas.draw', { items: items.length, preview: previewCells ? 1 : 0 });
    // intentionally only when item count / preview toggles — not every parent render
  }, [items.length, previewCells]);

  return (
    <Canvas style={{ width: worldW, height: worldH }}>
      <RoundedRect
        x={groundLeft}
        y={groundTop}
        width={groundW}
        height={groundH}
        r={10}
        color="#3F7A3B"
      />
      {items.map((item) => (
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
                  previewCells.valid ? 'rgba(76,175,80,0.5)' : 'rgba(229,57,53,0.5)'
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
              depthKey(
                previewCells.hoverTile.x,
                previewCells.hoverTile.y,
                previewCells.def.footprint.w,
                previewCells.def.footprint.h,
                9,
              ),
              false,
            )}
          />
        </Group>
      ) : null}
    </Canvas>
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

  useEffect(() => {
    mapLogMount({
      mode,
      w: Math.round(width),
      h: Math.round(height),
      grid: gridSize,
      buildings: state.buildings.length,
      placing: placing ? 1 : 0,
      renderer: 'skia-static+rn-camera',
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
    // If we never see this log after pan.end, crash is async/OOM after gesture
    setTimeout(() => mapLog('pan.alive', { afterMs: 400 }), 400);
    setTimeout(() => mapLog('pan.alive', { afterMs: 1200 }), 1200);
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
      // Pinch disabled for Expo Go stability (scale×Canvas = OOM). Re-enable in native build.
      Gesture.Pinch().enabled(false),
    [],
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

  const cameraStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  const buildingVisualKey = useMemo(
    () =>
      (state.buildings as PlacedBuilding[])
        .map(
          (b) =>
            `${b.instanceId}:${b.buildingId}:${b.level}:${b.x}:${b.y}:${b.buildEndsAt ?? 0}`,
        )
        .join('|') + `|sel=${selectedBuildingId ?? ''}`,
    [state.buildings, selectedBuildingId],
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
          depthKey(b.x, b.y, def.footprint.w, def.footprint.h, 1),
          b.instanceId === selectedBuildingId,
        );
      })
      .sort((a, b) => a.depth - b.depth);
    // Visual-only key: ignore resource `stored` churn from produceResources tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingVisualKey, combat, mode]);

  const worldW = gridSize * TILE_W + 80;
  const worldH = gridSize * TILE_H + 120;
  const groundLeft = gridToScreen(0, gridSize - 1).x - TILE_W;
  const groundRight = gridToScreen(gridSize - 1, 0).x + TILE_W;
  const groundTop = gridToScreen(0, 0).y - TILE_H;
  const groundBottom = gridToScreen(gridSize - 1, gridSize - 1).y + TILE_H * 2;

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
          <Animated.View
            collapsable={false}
            style={[{ width: worldW, height: worldH }, cameraStyle]}
          >
            <WorldCanvas
              worldW={worldW}
              worldH={worldH}
              groundLeft={groundLeft}
              groundTop={groundTop}
              groundW={Math.max(80, groundRight - groundLeft)}
              groundH={Math.max(80, groundBottom - groundTop)}
              items={sorted}
              previewCells={previewCells}
              placementBuildingId={placementBuildingId ?? null}
            />
          </Animated.View>
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
