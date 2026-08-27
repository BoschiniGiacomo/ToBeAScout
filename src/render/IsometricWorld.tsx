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
import { resolveBuildingSprite } from './assets';
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

const TileDot = memo(function TileDot({ x, y }: { x: number; y: number }) {
  const p = gridToScreen(x, y);
  const shade = (x + y) % 2 === 0 ? '#4C8C47' : '#3F7A3B';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: p.x - 7,
        top: p.y - 3,
        width: 14,
        height: 7,
        borderRadius: 2,
        backgroundColor: shade,
        opacity: 0.7,
      }}
    />
  );
});

const BuildingSprite = memo(function BuildingSprite({ item }: { item: DrawItem }) {
  const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
  // Sprite art is taller than footprint; size from tiles + vertical room for roof/frame
  const bw = Math.max(36, item.w * TILE_W * 0.95);
  const bh = item.sprite
    ? Math.max(48, item.h * TILE_H * 1.15 + bw * 0.55)
    : Math.max(26, item.h * TILE_H * 0.9 + 18);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: c.x - bw / 2,
        top: c.y - bh,
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
        <Image
          source={item.sprite}
          style={{ width: bw, height: bh }}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.label} numberOfLines={1}>
          {item.label}
        </Text>
      )}
    </View>
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

export function IsometricWorld({
  state,
  width,
  height,
  mode = 'village',
  combat,
  selectedBuildingId,
  onTapTile,
  onSelectBuilding,
}: Props) {
  const gridSize = combat?.mapSize ?? META.gridSize;
  const offsetX = useSharedValue(width * 0.35);
  const offsetY = useSharedValue(height * 0.2);
  const scale = useSharedValue(0.9);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  const handleTap = useCallback(
    (gx: number, gy: number) => {
      if (mode === 'combat') {
        onTapTile?.(gx, gy);
        return;
      }
      const hit = state.buildings.find((b) => {
        const def = getBuildingDef(b.buildingId);
        return gx >= b.x && gx < b.x + def.footprint.w && gy >= b.y && gy < b.y + def.footprint.h;
      });
      onSelectBuilding?.(hit?.instanceId ?? null);
      onTapTile?.(gx, gy);
    },
    [mode, onSelectBuilding, onTapTile, state.buildings],
  );

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = offsetX.value;
      startY.value = offsetY.value;
    })
    .onUpdate((e) => {
      offsetX.value = startX.value + e.translationX;
      offsetY.value = startY.value + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(2.2, Math.max(0.45, startScale.value * e.scale));
    });

  const tap = Gesture.Tap().onEnd((e) => {
    const localX = (e.x - offsetX.value) / scale.value;
    const localY = (e.y - offsetY.value) / scale.value;
    const g = screenToGrid(localX, localY);
    runOnJS(handleTap)(g.x, g.y);
  });

  const composed = Gesture.Simultaneous(pan, pinch, tap);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  const tiles = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) list.push({ x, y });
    }
    return list;
  }, [gridSize]);

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
  }, [combat, mode, selectedBuildingId, state.buildings]);

  const worldW = gridSize * TILE_W + 80;
  const worldH = gridSize * TILE_H + 120;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <GestureDetector gesture={composed}>
        <View style={{ width, height }}>
          <Animated.View style={[{ width: worldW, height: worldH }, animatedStyle]}>
            {tiles.map((t) => (
              <TileDot key={`t-${t.x}-${t.y}`} x={t.x} y={t.y} />
            ))}
            {sorted.map((item) => (
              <BuildingSprite key={item.key} item={item} />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#1B4332',
  },
  label: {
    color: '#FFFDE7',
    fontSize: 10,
    fontWeight: '700',
  },
});
