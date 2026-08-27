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

/** Placement footprint highlight (few cells only). */
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
        zIndex: 5000,
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

const BuildingSprite = memo(function BuildingSprite({ item }: { item: DrawItem }) {
  const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
  const bw = Math.max(36, (item.w + item.h) * (TILE_W / 2) * 0.9);
  const bh = item.sprite ? Math.max(48, bw * 0.9) : Math.max(24, item.h * TILE_H * 0.85 + 14);
  const southY = c.y + ((item.w + item.h - 2) * TILE_H) / 4;

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={{
        position: 'absolute',
        left: c.x - bw / 2,
        top: southY - bh + TILE_H * 0.15,
        width: bw,
        height: bh,
        zIndex: Math.floor(item.depth),
        alignItems: 'center',
        justifyContent: item.sprite ? 'flex-end' : 'center',
        backgroundColor: item.sprite ? 'transparent' : item.color,
        borderRadius: item.sprite ? 0 : 4,
        borderWidth: item.selected ? 2 : 0,
        borderColor: '#FFF59D',
      }}
    >
      {item.sprite ? (
        <Image
          source={item.sprite}
          style={{ width: bw, height: bh }}
          resizeMode="contain"
          // Android: decode closer to display size → less RAM
          resizeMethod="resize"
          fadeDuration={0}
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

/** Static layer: ground + buildings. Rasterized so pan moves 1 texture, not N views. */
const StaticWorldLayer = memo(function StaticWorldLayer({
  items,
  gridSize,
}: {
  items: DrawItem[];
  gridSize: number;
}) {
  const groundLeft = gridToScreen(0, gridSize - 1).x - TILE_W;
  const groundRight = gridToScreen(gridSize - 1, 0).x + TILE_W;
  const groundTop = gridToScreen(0, 0).y - TILE_H;
  const groundBottom = gridToScreen(gridSize - 1, gridSize - 1).y + TILE_H * 2;

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      // Flatten to one GPU texture → fluid pan without OOM in Expo Go
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      style={StyleSheet.absoluteFill}
    >
      <View
        style={{
          position: 'absolute',
          left: groundLeft,
          top: groundTop,
          width: Math.max(80, groundRight - groundLeft),
          height: Math.max(80, groundBottom - groundTop),
          backgroundColor: '#3F7A3B',
          borderRadius: 10,
        }}
      />
      {items.map((item) => (
        <BuildingSprite key={item.key} item={item} />
      ))}
    </View>
  );
});

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

  const reportHover = useCallback(
    (gx: number, gy: number) => {
      onHoverTile?.(gx, gy);
    },
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
    [
      mode,
      onConfirmPlace,
      onSelectBuilding,
      onTapTile,
      placementBuildingId,
      state.buildings,
    ],
  );

  const cameraPan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(placing ? 2 : 1)
        .onBegin(() => {
          startX.value = offsetX.value;
          startY.value = offsetY.value;
        })
        .onUpdate((e) => {
          offsetX.value = startX.value + e.translationX;
          offsetY.value = startY.value + e.translationY;
        }),
    [placing, offsetX, offsetY, startX, startY],
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

  // Soft pinch — keep scale range narrow to avoid huge offscreen bitmaps
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          startScale.value = scale.value;
        })
        .onUpdate((e) => {
          scale.value = Math.min(1.45, Math.max(0.7, startScale.value * e.scale));
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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  const preview = useMemo(() => {
    if (!placing || !placementBuildingId || !hoverTile) return null;
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
  }, [placing, placementBuildingId, hoverTile, state]);

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
        <Animated.View style={[{ width, height }, styles.gestureRoot]}>
          <Animated.View
            collapsable={false}
            style={[{ width: worldW, height: worldH }, animatedStyle]}
          >
            <StaticWorldLayer items={sorted} gridSize={gridSize} />
            {/* Dynamic overlays stay outside the rasterized layer */}
            {preview
              ? preview.cells.map((c) => (
                  <IsoCell key={`prev-${c.x}-${c.y}`} x={c.x} y={c.y} valid={preview.valid} />
                ))
              : null}
            {preview ? (
              <View style={{ opacity: preview.valid ? 0.85 : 0.45 }} pointerEvents="none">
                <BuildingSprite item={preview.ghost} />
              </View>
            ) : null}
          </Animated.View>
        </Animated.View>
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
  gestureRoot: {
    overflow: 'hidden',
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
