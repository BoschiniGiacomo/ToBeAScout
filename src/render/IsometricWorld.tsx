import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  RoundedRect,
  vec,
  Line,
  Group,
  Text as SkText,
  matchFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import type { CombatState, GameState, PlacedBuilding } from '../sim/types';
import { getBuildingDef, getTroopDef, META } from '../sim/content';
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
  const offsetX = useSharedValue(width / 2);
  const offsetY = useSharedValue(80);
  const scale = useSharedValue(0.85);
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
      scale.value = Math.min(2.2, Math.max(0.4, startScale.value * e.scale));
    });

  const canvasSize = Math.max(width, height) * 4;
  const origin = canvasSize / 2;

  const tap = Gesture.Tap().onEnd((e) => {
    const localX = (e.x - offsetX.value) / scale.value - origin;
    const localY = (e.y - offsetY.value) / scale.value - origin;
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

  const sorted = useMemo(() => {
    if (mode === 'combat' && combat) {
      const items = combat.buildings
        .filter((b) => !b.destroyed)
        .map((b) => ({
          key: b.instanceId,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          color: getBuildingDef(b.buildingId).color,
          label: getBuildingDef(b.buildingId).name.slice(0, 3),
          depth: depthKey(b.x, b.y, b.w, b.h, 1),
          hpRatio: b.maxHp > 0 ? b.hp / b.maxHp : 0,
          selected: false,
        }));
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
        });
      }
      return items.sort((a, b) => a.depth - b.depth);
    }

    return (state.buildings as PlacedBuilding[])
      .map((b) => {
        const def = getBuildingDef(b.buildingId);
        return {
          key: b.instanceId,
          x: b.x,
          y: b.y,
          w: def.footprint.w,
          h: def.footprint.h,
          color: def.color,
          label: def.name.slice(0, 4),
          depth: depthKey(b.x, b.y, def.footprint.w, def.footprint.h, 1),
          hpRatio: 1,
          selected: b.instanceId === selectedBuildingId,
        };
      })
      .sort((a, b) => a.depth - b.depth);
  }, [combat, mode, selectedBuildingId, state.buildings]);

  const font = matchFont({ fontFamily: 'System', fontSize: 10 });

  return (
    <View style={[styles.wrap, { width, height }]}>
      <GestureDetector gesture={composed}>
        <View style={{ width, height }}>
          <Animated.View style={[{ width: canvasSize, height: canvasSize }, animatedStyle]}>
            <Canvas style={{ width: canvasSize, height: canvasSize }}>
              <Group>
                {Array.from({ length: gridSize }, (_, y) =>
                  Array.from({ length: gridSize }, (__, x) => {
                    const p = gridToScreen(x, y);
                    const shade = (x + y) % 2 === 0 ? '#4C8C47' : '#3F7A3B';
                    const cx = p.x + origin;
                    const cy = p.y + origin;
                    return (
                      <Group key={`t-${x}-${y}`}>
                        <Line
                          p1={vec(cx, cy - TILE_H / 2)}
                          p2={vec(cx + TILE_W / 2, cy)}
                          color="#2D5A27"
                          strokeWidth={1}
                        />
                        <Line
                          p1={vec(cx + TILE_W / 2, cy)}
                          p2={vec(cx, cy + TILE_H / 2)}
                          color="#2D5A27"
                          strokeWidth={1}
                        />
                        <Line
                          p1={vec(cx, cy + TILE_H / 2)}
                          p2={vec(cx - TILE_W / 2, cy)}
                          color="#2D5A27"
                          strokeWidth={1}
                        />
                        <Line
                          p1={vec(cx - TILE_W / 2, cy)}
                          p2={vec(cx, cy - TILE_H / 2)}
                          color="#2D5A27"
                          strokeWidth={1}
                        />
                        <RoundedRect
                          x={cx - 6}
                          y={cy - 3}
                          width={12}
                          height={6}
                          r={1}
                          color={shade}
                          opacity={0.55}
                        />
                      </Group>
                    );
                  }),
                )}

                {sorted.map((item) => {
                  const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
                  const cx = c.x + origin;
                  const cy = c.y + origin;
                  const bw = Math.max(18, item.w * TILE_W * 0.42);
                  const bh = Math.max(22, item.h * TILE_H * 0.85 + 16);
                  return (
                    <Group key={item.key}>
                      <RoundedRect
                        x={cx - bw / 2}
                        y={cy - bh}
                        width={bw}
                        height={bh}
                        r={4}
                        color={item.color}
                      />
                      {item.selected ? (
                        <RoundedRect
                          x={cx - bw / 2 - 2}
                          y={cy - bh - 2}
                          width={bw + 4}
                          height={bh + 4}
                          r={5}
                          color="#FFF59D"
                          style="stroke"
                          strokeWidth={2}
                        />
                      ) : null}
                      <RoundedRect
                        x={cx - bw / 2}
                        y={cy - bh - 7}
                        width={Math.max(2, bw * item.hpRatio)}
                        height={4}
                        r={1}
                        color="#A5D6A7"
                      />
                      {font ? (
                        <SkText
                          x={cx - bw / 2 + 2}
                          y={cy - bh / 2}
                          text={item.label}
                          font={font}
                          color="#FFFDE7"
                        />
                      ) : null}
                    </Group>
                  );
                })}
              </Group>
            </Canvas>
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
});
