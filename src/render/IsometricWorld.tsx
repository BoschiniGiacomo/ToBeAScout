import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
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
 * RN-native renderer (no Skia): static world layer + GPU-moved Animated.View.
 * Avoids Skia useImage memory leaks that crash Expo Go after a few pans.
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

const TILE_DIAMOND = Math.round(TILE_W * 0.52);

const GroundGrid = memo(function GroundGrid({ gridSize }: { gridSize: number }) {
  const bounds = useMemo(() => {
    const tl = gridToScreen(0, 0);
    const br = gridToScreen(gridSize - 1, gridSize - 1);
    const bl = gridToScreen(0, gridSize - 1);
    const tr = gridToScreen(gridSize - 1, 0);
    const minX = Math.min(tl.x, br.x, bl.x, tr.x) - TILE_W;
    const maxX = Math.max(tl.x, br.x, bl.x, tr.x) + TILE_W;
    const minY = Math.min(tl.y, br.y, bl.y, tr.y) - TILE_H;
    const maxY = Math.max(tl.y, br.y, bl.y, tr.y) + TILE_H * 1.5;
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  }, [gridSize]);

  const markers = useMemo(() => {
    const list: { key: string; cx: number; cy: number; color: string }[] = [];
    const step = 2;
    for (let gy = 0; gy < gridSize; gy += step) {
      for (let gx = 0; gx < gridSize; gx += step) {
        const c = gridToScreen(gx, gy);
        list.push({
          key: `${gx}-${gy}`,
          cx: c.x - bounds.left,
          cy: c.y - bounds.top,
          color: (gx + gy) % 4 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        });
      }
    }
    return list;
  }, [gridSize, bounds.left, bounds.top]);

  return (
    <View pointerEvents="none" style={[styles.ground, bounds]}>
      {markers.map((m) => (
        <View
          key={m.key}
          style={{
            position: 'absolute',
            left: m.cx - TILE_DIAMOND / 2,
            top: m.cy - TILE_DIAMOND / 2,
            width: TILE_DIAMOND,
            height: TILE_DIAMOND,
            backgroundColor: m.color,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
});

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

const BuildingMarker = memo(function BuildingMarker({ item }: { item: DrawItem }) {
  const { left, top, bw, bh } = layoutSprite(item);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.building,
        { left, top, width: bw, height: bh },
        item.selected && styles.buildingSelected,
      ]}
    >
      {item.sprite ? (
        <Image source={item.sprite} style={{ width: bw, height: bh }} resizeMode="contain" />
      ) : (
        <View style={[styles.buildingFallback, { backgroundColor: item.color }]} />
      )}
    </View>
  );
});

const WorldContent = memo(function WorldContent({
  gridSize,
  items,
  previewCells,
  placementBuildingId,
}: {
  gridSize: number;
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
    mapLog('world.draw', { items: items.length, preview: previewCells ? 1 : 0 });
  }, [items.length, previewCells]);

  return (
    <>
      <GroundGrid gridSize={gridSize} />
      {previewCells
        ? previewCells.cells.map((c) => {
            const p = gridToScreen(c.x, c.y);
            return (
              <View
                key={`p-${c.x}-${c.y}`}
                pointerEvents="none"
                style={[
                  styles.previewCell,
                  {
                    left: p.x - TILE_W / 2,
                    top: p.y - TILE_H / 2,
                    backgroundColor: previewCells.valid
                      ? 'rgba(76,175,80,0.5)'
                      : 'rgba(229,57,53,0.5)',
                  },
                ]}
              />
            );
          })
        : null}
      {items.map((item) => (
        <BuildingMarker key={item.key} item={item} />
      ))}
      {previewCells && placementBuildingId ? (
        <View
          pointerEvents="none"
          style={{ opacity: previewCells.valid ? 0.9 : 0.45 }}
        >
          <BuildingMarker
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
        </View>
      ) : null}
    </>
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

function worldSize(gridSize: number) {
  return {
    worldW: gridSize * TILE_W + 80,
    worldH: gridSize * TILE_H + 120,
  };
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
  const { worldW, worldH } = worldSize(gridSize);

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    const center = gridToScreen(gridSize / 2, gridSize / 2);
    offsetX.value = width / 2 - center.x;
    offsetY.value = height / 2 - center.y;
  }, [width, height, gridSize, offsetX, offsetY]);

  useEffect(() => {
    mapLogMount({
      mode,
      w: Math.round(width),
      h: Math.round(height),
      grid: gridSize,
      buildings: state.buildings.length,
      placing: placing ? 1 : 0,
      renderer: 'rn-animated-world',
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
    setTimeout(() => mapLog('pan.alive', { afterMs: 400 }), 400);
    setTimeout(() => mapLog('pan.alive', { afterMs: 1200 }), 1200);
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
        ? Gesture.Simultaneous(placePointer, cameraPan, tap)
        : Gesture.Simultaneous(cameraPan, tap),
    [placing, placePointer, cameraPan, tap],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingVisualKey, combat, mode]);

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
            renderToHardwareTextureAndroid
            needsOffscreenAlphaCompositing={false}
            style={[
              styles.world,
              { width: worldW, height: worldH },
              cameraStyle,
            ]}
          >
            <WorldContent
              gridSize={gridSize}
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
  world: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  ground: {
    backgroundColor: '#4A8F47',
    borderWidth: 2,
    borderColor: '#356832',
    borderRadius: 8,
    overflow: 'hidden',
  },
  building: {
    position: 'absolute',
  },
  buildingSelected: {
    borderWidth: 2,
    borderColor: '#FFF59D',
    borderRadius: 6,
  },
  buildingFallback: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  previewCell: {
    position: 'absolute',
    width: TILE_W,
    height: TILE_H,
    borderRadius: 2,
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
