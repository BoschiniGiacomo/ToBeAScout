import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  Path,
  Rect,
  RoundedRect,
  Skia,
} from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, runOnJS } from 'react-native-reanimated';
import type { CombatState, GameState, PlacedBuilding } from '../sim/types';
import { getBuildingDef, getTroopDef, META } from '../sim/content';
import { canPlace } from '../sim/buildings';
import { resolveBuildingSprite } from './assets';
import { useSpriteImageMap } from './spriteImages';
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
 * CoC-style map: viewport Skia canvas, camera matrix on UI thread,
 * isometric tile paths (no textures), sprites loaded once via atlas hook.
 */

interface Props {
  state: GameState;
  width?: number;
  height?: number;
  selectedBuildingId?: string | null;
  placementBuildingId?: string | null;
  hoverTile?: { x: number; y: number } | null;
  mode?: 'village' | 'combat';
  combat?: CombatState | null;
  onHoverTile?: (gx: number, gy: number) => void;
  onConfirmPlace?: (gx: number, gy: number) => void;
  onTapTile?: (gx: number, y: number) => void;
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

function addTileDiamond(path: ReturnType<typeof Skia.Path.Make>, gx: number, gy: number) {
  const c = gridToScreen(gx, gy);
  path.moveTo(c.x, c.y - TILE_H / 2);
  path.lineTo(c.x + TILE_W / 2, c.y);
  path.lineTo(c.x, c.y + TILE_H / 2);
  path.lineTo(c.x - TILE_W / 2, c.y);
  path.close();
}

function buildGroundPaths(gridSize: number) {
  const even = Skia.Path.Make();
  const odd = Skia.Path.Make();
  const edge = Skia.Path.Make();
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      addTileDiamond((gx + gy) % 2 === 0 ? even : odd, gx, gy);
    }
  }
  for (let i = 0; i < gridSize; i++) {
    addTileDiamond(edge, i, 0);
    addTileDiamond(edge, 0, i);
    addTileDiamond(edge, gridSize - 1, i);
    addTileDiamond(edge, i, gridSize - 1);
  }
  return { evenPath: even, oddPath: odd, edgePath: edge };
}

const GROUND_CACHE = new Map<number, ReturnType<typeof buildGroundPaths>>();

function getGroundPaths(gridSize: number) {
  let cached = GROUND_CACHE.get(gridSize);
  if (!cached) {
    cached = buildGroundPaths(gridSize);
    GROUND_CACHE.set(gridSize, cached);
  }
  return cached;
}

const GroundGrid = memo(function GroundGrid({ gridSize }: { gridSize: number }) {
  const { evenPath, oddPath, edgePath } = getGroundPaths(gridSize);
  return (
    <Group>
      <Path path={evenPath} color="#4E9B4A" style="fill" />
      <Path path={oddPath} color="#468C42" style="fill" />
      <Path path={edgePath} color="#356832" style="stroke" strokeWidth={1.25} />
    </Group>
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

const BuildingLayer = memo(function BuildingLayer({
  items,
  sprites,
}: {
  items: DrawItem[];
  sprites: ReadonlyMap<number, SkImage | null>;
}) {
  return (
    <>
      {items.map((item) => {
        const { left, top, bw, bh } = layoutSprite(item);
        const img = item.sprite ? sprites.get(item.sprite) : null;
        if (img) {
          return (
            <Group key={item.key}>
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
          <RoundedRect key={item.key} x={left} y={top} width={bw} height={bh} r={4} color={item.color} />
        );
      })}
    </>
  );
});

const WorldCanvas = memo(function WorldCanvas({
  viewportW,
  viewportH,
  gridSize,
  cameraX,
  cameraY,
  items,
  previewCells,
  placementBuildingId,
  sprites,
}: {
  viewportW: number;
  viewportH: number;
  gridSize: number;
  cameraX: { value: number };
  cameraY: { value: number };
  items: DrawItem[];
  previewCells: {
    valid: boolean;
    cells: { x: number; y: number }[];
    hoverTile: { x: number; y: number };
    def: ReturnType<typeof getBuildingDef>;
  } | null;
  placementBuildingId: string | null;
  sprites: ReadonlyMap<number, SkImage | null>;
}) {
  const cameraTransform = useDerivedValue(() => [
    { translateX: cameraX.value },
    { translateY: cameraY.value },
  ]);

  const drawKey = useRef(0);
  useEffect(() => {
    drawKey.current += 1;
    mapLog('canvas.draw', { n: drawKey.current, items: items.length, vpW: viewportW });
  }, [items.length, previewCells, viewportW]);

  const ghostItem =
    previewCells && placementBuildingId
      ? toDrawItem(
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
        )
      : null;

  return (
    <Canvas style={{ width: viewportW, height: viewportH }}>
      <Group transform={cameraTransform}>
        <GroundGrid gridSize={gridSize} />
        <BuildingLayer items={items} sprites={sprites} />
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
                  color={previewCells.valid ? 'rgba(76,175,80,0.5)' : 'rgba(229,57,53,0.5)'}
                />
              );
            })
          : null}
        {ghostItem ? (
          <Group opacity={previewCells!.valid ? 0.9 : 0.45}>
            <BuildingLayer items={[ghostItem]} sprites={sprites} />
          </Group>
        ) : null}
      </Group>
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
): { x: number; y: number } {
  return screenToGrid(ex - offsetX, ey - offsetY);
}

function IsometricWorldInner({
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
  const sprites = useSpriteImageMap();

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const cameraReady = useRef(false);

  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    const center = gridToScreen(gridSize / 2, gridSize / 2);
    offsetX.value = width / 2 - center.x;
    offsetY.value = height / 2 - center.y;
    if (!cameraReady.current) {
      cameraReady.current = true;
      mapLogMount({
        mode,
        w: Math.round(width),
        h: Math.round(height),
        grid: gridSize,
        buildings: state.buildings.length,
        placing: placing ? 1 : 0,
        renderer: 'skia-atlas-camera',
      });
    }
  }, [width, height, gridSize, mode, state.buildings.length, placing, offsetX, offsetY]);

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
        .activeOffsetX([-4, 4])
        .activeOffsetY([-4, 4])
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

  if (width <= 0 || height <= 0) return null;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <GestureDetector gesture={composed}>
        <View style={{ width, height }} collapsable={false}>
          <WorldCanvas
            viewportW={width}
            viewportH={height}
            gridSize={gridSize}
            cameraX={offsetX}
            cameraY={offsetY}
            items={sorted}
            previewCells={previewCells}
            placementBuildingId={placementBuildingId ?? null}
            sprites={sprites}
          />
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

export const IsometricWorld = memo(function IsometricWorld(props: Props) {
  const window = useWindowDimensions();
  const width = props.width ?? window.width;
  const height = props.height ?? window.height;
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
