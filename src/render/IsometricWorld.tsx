import React, { memo, useCallback, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import type { CombatState, GameState, PlacedBuilding } from '../sim/types';
import { getBuildingDef, getTroopDef, META } from '../sim/content';
import { canPlace } from '../sim/buildings';
import { resolveBuildingSprite, resolveTileSprite } from './assets';
import { logCrash } from '../debug/crashLog';
import {
  TILE_H,
  TILE_W,
  depthKey,
  footprintCenterScreen,
  gridToScreen,
  screenToGrid,
} from '../sim/iso';

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
  hpRatio: number;
  selected: boolean;
  sprite: number | null;
};

const EMPTY_TILE = resolveTileSprite('tile_grass_empty');
const TILE_SPRITE_W = TILE_W + 2;
const TILE_SPRITE_H = Math.round(TILE_H * 1.75);

/** Lightweight iso cell highlight for placement preview. */
const IsoCell = memo(function IsoCell({
  x,
  y,
  valid,
}: {
  x: number;
  y: number;
  valid: boolean;
}) {
  const p = gridToScreen(x, y);
  const color = valid ? 'rgba(76, 175, 80, 0.55)' : 'rgba(229, 57, 53, 0.55)';
  const border = valid ? '#81C784' : '#EF9A9A';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: p.x - TILE_W / 2,
        top: p.y - TILE_H / 2,
        width: TILE_W,
        height: TILE_H,
        zIndex: 9000,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: TILE_W / 2 - TILE_H / 2,
          top: 0,
          width: TILE_H,
          height: TILE_H,
          backgroundColor: color,
          borderWidth: 1.5,
          borderColor: border,
          transform: [{ rotate: '45deg' }, { scaleX: TILE_W / TILE_H }],
        }}
      />
    </View>
  );
});

const GrassTile = memo(function GrassTile({ x, y }: { x: number; y: number }) {
  const p = gridToScreen(x, y);
  if (!EMPTY_TILE) {
    const shade = (x + y) % 2 === 0 ? '#4C8C47' : '#3F7A3B';
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: p.x - 8,
          top: p.y - 4,
          width: 16,
          height: 8,
          borderRadius: 2,
          backgroundColor: shade,
          opacity: 0.75,
        }}
      />
    );
  }
  return (
    <Image
      pointerEvents="none"
      source={EMPTY_TILE}
      style={{
        position: 'absolute',
        left: p.x - TILE_SPRITE_W / 2,
        top: p.y - TILE_H / 2,
        width: TILE_SPRITE_W,
        height: TILE_SPRITE_H,
      }}
      resizeMode="contain"
    />
  );
});

/**
 * Isolated ground layer: does NOT re-render when you select a building.
 * That was crashing Expo Go (400 Images remounted on every tap).
 */
const GroundLayer = memo(function GroundLayer({
  gridSize,
  cam,
  viewW,
  viewH,
}: {
  gridSize: number;
  cam: { ox: number; oy: number; sc: number };
  viewW: number;
  viewH: number;
}) {
  const tiles = useMemo(() => {
    const pad = 3;
    const corners = [
      eventToGrid(0, 0, cam.ox, cam.oy, cam.sc),
      eventToGrid(viewW, 0, cam.ox, cam.oy, cam.sc),
      eventToGrid(0, viewH, cam.ox, cam.oy, cam.sc),
      eventToGrid(viewW, viewH, cam.ox, cam.oy, cam.sc),
    ];
    let minX = Math.min(...corners.map((c) => c.x)) - pad;
    let maxX = Math.max(...corners.map((c) => c.x)) + pad;
    let minY = Math.min(...corners.map((c) => c.y)) - pad;
    let maxY = Math.max(...corners.map((c) => c.y)) + pad;
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    maxX = Math.min(gridSize - 1, maxX);
    maxY = Math.min(gridSize - 1, maxY);

    const list: { x: number; y: number }[] = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) list.push({ x, y });
    }
    // Hard cap to avoid OOM if camera math goes wild
    if (list.length > 220) {
      return list.filter((_, i) => i % Math.ceil(list.length / 200) === 0);
    }
    return list;
  }, [gridSize, cam.ox, cam.oy, cam.sc, viewW, viewH]);

  return (
    <>
      {tiles.map((t) => (
        <GrassTile key={`t-${t.x}-${t.y}`} x={t.x} y={t.y} />
      ))}
    </>
  );
});

const BuildingSprite = memo(
  function BuildingSprite({ item }: { item: DrawItem }) {
    const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
    const bw = Math.max(40, (item.w + item.h) * (TILE_W / 2) * 0.98);
    const bh = item.sprite
      ? Math.max(56, bw * 0.92)
      : Math.max(26, item.h * TILE_H * 0.9 + 18);
    const southY = c.y + ((item.w + item.h - 2) * TILE_H) / 4;

    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: c.x - bw / 2,
          top: southY - bh + TILE_H * 0.15,
          width: bw,
          height: bh,
          borderRadius: item.sprite ? 0 : 4,
          backgroundColor: item.sprite ? 'transparent' : item.color,
          borderWidth: item.selected ? 2 : 0,
          borderColor: '#FFF59D',
          alignItems: 'center',
          justifyContent: item.sprite ? 'flex-end' : 'center',
          zIndex: Math.floor(item.depth),
          overflow: 'visible',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: -6,
            left: 0,
            height: 4,
            width: Math.max(4, bw * item.hpRatio),
            backgroundColor: '#A5D6A7',
            borderRadius: 1,
            zIndex: 2,
          }}
        />
        {item.sprite ? (
          <Image source={item.sprite} style={{ width: bw, height: bh }} resizeMode="contain" />
        ) : (
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
        )}
      </View>
    );
  },
  (a, b) =>
    a.item.key === b.item.key &&
    a.item.selected === b.item.selected &&
    a.item.sprite === b.item.sprite &&
    a.item.x === b.item.x &&
    a.item.y === b.item.y &&
    a.item.hpRatio === b.item.hpRatio,
);

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
  hpRatio: number,
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
    hpRatio,
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
  const offsetX = useSharedValue(width * 0.35);
  const offsetY = useSharedValue(height * 0.2);
  const scale = useSharedValue(0.9);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const [cam, setCam] = useState({ ox: width * 0.35, oy: height * 0.2, sc: 0.9 });

  const syncCam = useCallback((ox: number, oy: number, sc: number) => {
    setCam((prev) => {
      if (
        Math.abs(prev.ox - ox) < 8 &&
        Math.abs(prev.oy - oy) < 8 &&
        Math.abs(prev.sc - sc) < 0.03
      ) {
        return prev;
      }
      return { ox, oy, sc };
    });
  }, []);

  const reportHover = useCallback(
    (gx: number, gy: number) => {
      onHoverTile?.(gx, gy);
    },
    [onHoverTile],
  );

  const handleTap = useCallback(
    (gx: number, gy: number) => {
      try {
        if (mode === 'combat') {
          onTapTile?.(gx, gy);
          return;
        }
        if (placementBuildingId) {
          onConfirmPlace?.(gx, gy);
          return;
        }
        const hit = state.buildings.find((b) => {
          try {
            const def = getBuildingDef(b.buildingId);
            return (
              gx >= b.x &&
              gx < b.x + def.footprint.w &&
              gy >= b.y &&
              gy < b.y + def.footprint.h
            );
          } catch (e) {
            logCrash('action', 'hitTestBuilding', e, { buildingId: b.buildingId });
            return false;
          }
        });
        onSelectBuilding?.(hit?.instanceId ?? null);
      } catch (e) {
        logCrash('action', 'handleTapSelect', e, { gx, gy });
      }
    },
    [mode, onConfirmPlace, onSelectBuilding, onTapTile, placementBuildingId, state.buildings],
  );

  const cameraPan = Gesture.Pan()
    .minPointers(placing ? 2 : 1)
    .onBegin(() => {
      startX.value = offsetX.value;
      startY.value = offsetY.value;
    })
    .onUpdate((e) => {
      offsetX.value = startX.value + e.translationX;
      offsetY.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      runOnJS(syncCam)(offsetX.value, offsetY.value, scale.value);
    });

  const placePointer = Gesture.Pan()
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
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(2.2, Math.max(0.45, startScale.value * e.scale));
    })
    .onEnd(() => {
      runOnJS(syncCam)(offsetX.value, offsetY.value, scale.value);
    });

  const tap = Gesture.Tap().onEnd((e) => {
    const g = eventToGrid(e.x, e.y, offsetX.value, offsetY.value, scale.value);
    if (placing) runOnJS(reportHover)(g.x, g.y);
    runOnJS(handleTap)(g.x, g.y);
  });

  const composed = placing
    ? Gesture.Simultaneous(placePointer, cameraPan, pinch, tap)
    : Gesture.Simultaneous(cameraPan, pinch, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  const preview = useMemo(() => {
    if (!placing || !placementBuildingId || !hoverTile) return null;
    try {
      const def = getBuildingDef(placementBuildingId);
      const check = canPlace(state, placementBuildingId, hoverTile.x, hoverTile.y);
      const cells: { x: number; y: number }[] = [];
      for (let dy = 0; dy < def.footprint.h; dy++) {
        for (let dx = 0; dx < def.footprint.w; dx++) {
          cells.push({ x: hoverTile.x + dx, y: hoverTile.y + dy });
        }
      }
      return {
        valid: check.ok,
        cells,
        ghost: toDrawItem(
          'ghost',
          hoverTile.x,
          hoverTile.y,
          def.footprint.w,
          def.footprint.h,
          placementBuildingId,
          1,
          def.color,
          def.name.slice(0, 4),
          depthKey(hoverTile.x, hoverTile.y, def.footprint.w, def.footprint.h, 9),
          1,
          false,
        ),
      };
    } catch (e) {
      logCrash('action', 'placementPreview', e);
      return null;
    }
  }, [placing, placementBuildingId, hoverTile, state]);

  const sorted = useMemo((): DrawItem[] => {
    try {
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
              b.maxHp > 0 ? b.hp / b.maxHp : 0,
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
            hpRatio: u.maxHp > 0 ? u.hp / u.maxHp : 0,
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
            1,
            b.instanceId === selectedBuildingId,
          );
        })
        .sort((a, b) => a.depth - b.depth);
    } catch (e) {
      logCrash('render', 'buildSortedSprites', e);
      return [];
    }
  }, [combat, mode, selectedBuildingId, state.buildings]);

  const worldW = gridSize * TILE_W + 80;
  const worldH = gridSize * TILE_H + 120;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <GestureDetector gesture={composed}>
        <View style={{ width, height }}>
          <Animated.View style={[{ width: worldW, height: worldH }, animatedStyle]}>
            <GroundLayer gridSize={gridSize} cam={cam} viewW={width} viewH={height} />
            {sorted.map((item) => (
              <BuildingSprite key={item.key} item={item} />
            ))}
            {preview
              ? preview.cells.map((c) => (
                  <IsoCell key={`prev-${c.x}-${c.y}`} x={c.x} y={c.y} valid={preview.valid} />
                ))
              : null}
            {preview ? (
              <View style={{ opacity: preview.valid ? 0.85 : 0.45 }}>
                <BuildingSprite item={preview.ghost} />
              </View>
            ) : null}
          </Animated.View>
        </View>
      </GestureDetector>
      {placing ? (
        <View style={styles.placeBanner} pointerEvents="none">
          <Text style={styles.placeBannerText}>
            Trascina sulla griglia · verde = ok · rosso = no · tocca per confermare
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
  label: {
    color: '#FFFDE7',
    fontSize: 10,
    fontWeight: '700',
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
