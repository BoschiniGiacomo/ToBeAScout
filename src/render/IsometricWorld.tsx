import React, { memo, useCallback, useMemo } from 'react';
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
import { resolveBuildingSprite } from './assets';
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

/** Placement highlight cell. */
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

/**
 * Empty ground tile WITHOUT Image (Views only).
 * Hundreds of PNG Image nodes were crashing Expo Go on startup.
 */
const LightGrassTile = memo(function LightGrassTile({ x, y }: { x: number; y: number }) {
  const p = gridToScreen(x, y);
  const top = (x + y) % 2 === 0 ? '#5DAE45' : '#4F9A3C';
  const dirt = '#6B4A2E';
  const dirtDark = '#543820';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: p.x - TILE_W / 2,
        top: p.y - TILE_H / 2,
        width: TILE_W,
        height: TILE_H + 10,
      }}
    >
      {/* dirt face */}
      <View
        style={{
          position: 'absolute',
          left: 2,
          top: TILE_H / 2,
          width: TILE_W - 4,
          height: 10,
          backgroundColor: dirt,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 4,
          top: TILE_H / 2 + 7,
          width: TILE_W - 8,
          height: 3,
          backgroundColor: dirtDark,
          opacity: 0.5,
        }}
      />
      {/* grass diamond */}
      <View
        style={{
          position: 'absolute',
          left: TILE_W / 2 - TILE_H / 2,
          top: 0,
          width: TILE_H,
          height: TILE_H,
          backgroundColor: top,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: '#3E7A30',
          transform: [{ rotate: '45deg' }, { scaleX: TILE_W / TILE_H }],
        }}
      />
    </View>
  );
});

/** Ground never depends on selection → no remount when tapping buildings. */
const GroundLayer = memo(function GroundLayer({ gridSize }: { gridSize: number }) {
  const tiles = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) list.push({ x, y });
    }
    return list;
  }, [gridSize]);

  return (
    <>
      {tiles.map((t) => (
        <LightGrassTile key={`t-${t.x}-${t.y}`} x={t.x} y={t.y} />
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
  const scale = useSharedValue(0.85);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

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
      scale.value = Math.min(2.0, Math.max(0.5, startScale.value * e.scale));
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
            <GroundLayer gridSize={gridSize} />
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
