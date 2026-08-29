import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  Picture,
  RoundedRect,
  Skia,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  runOnJS,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import type { CombatState, GameState, PlacedBuilding } from '../sim/types';
import { getBuildingDef, getTroopDef, META } from '../sim/content';
import { canMove, canPlace, canStartMove } from '../sim/buildings';
import { resolveBuildingSprite } from './assets';
import { getBuildingsPicture, clearBuildingsPictureCache, layoutDrawItem } from './buildingsPicture';
import { worldLayout } from './buildWorldPicture';
import { MoveHoldRing } from './MoveHoldRing';
import { preloadAllSprites } from './spriteCache';
import { getSkiaImage } from './spriteCache';
import { getTerrainPicture } from './terrainPicture';
import {
  TILE_H,
  TILE_W,
  depthKey,
  footprintCenterScreen,
  gridToScreen,
  screenToGrid,
} from '../sim/iso';
import { mapLog, mapLogMount, mapLogPanBegin, mapLogPanEnd } from '../debug/mapPerfLog';
import { logCrash } from '../debug/crashLog';

/**
 * CoC-style renderer: cached terrain Picture + buildings Picture, pan = camera matrix only.
 */

interface Props {
  state: GameState;
  width?: number;
  height?: number;
  mode?: 'village' | 'combat';
  combat?: CombatState | null;
  placementBuildingId?: string | null;
  movingBuildingId?: string | null;
  hoverTile?: { x: number; y: number } | null;
  onHoverTile?: (gx: number, gy: number) => void;
  onConfirmPlace?: (gx: number, gy: number) => void;
  onConfirmMove?: (gx: number, gy: number) => void;
  onStartMoveBuilding?: (instanceId: string, gx: number, gy: number) => void;
  onMoveHoldBlocked?: (reason: string) => void;
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
  anchorX: number;
  anchorY: number;
};

const PAN_MARGIN = 48;
const MIN_SCALE = 0.55;
const MAX_SCALE = 2.2;
const MOVE_HOLD_MS = 750;

function findBuildingAt(
  buildings: PlacedBuilding[],
  gx: number,
  gy: number,
): PlacedBuilding | undefined {
  return buildings.find((b) => {
    const def = getBuildingDef(b.buildingId);
    return gx >= b.x && gx < b.x + def.footprint.w && gy >= b.y && gy < b.y + def.footprint.h;
  });
}

function clampPan(
  ox: number,
  oy: number,
  viewW: number,
  viewH: number,
  scale: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
) {
  'worklet';
  const s = scale > 0.01 ? scale : 1;
  const m = PAN_MARGIN;
  const loX = (viewW - m) / s - maxX;
  const hiX = m / s - minX;
  const loY = (viewH - m) / s - maxY;
  const hiY = m / s - minY;
  const cx = loX <= hiX ? Math.max(loX, Math.min(hiX, ox)) : (loX + hiX) / 2;
  const cy = loY <= hiY ? Math.max(loY, Math.min(hiY, oy)) : (loY + hiY) / 2;
  return { x: cx, y: cy };
}

const PreviewOverlay = memo(function PreviewOverlay({
  cells,
  valid,
  originX,
  originY,
}: {
  cells: { x: number; y: number }[];
  valid: boolean;
  originX: number;
  originY: number;
}) {
  const cellKey = cells.map((c) => `${c.x},${c.y}`).join('|');
  // Bake into SkPicture — live <Path> under animated Group crashes on Android.
  const picture = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const path = Skia.Path.Make();
    for (const c of cells) {
      const center = gridToScreen(c.x, c.y);
      const x = center.x + originX;
      const y = center.y + originY;
      path.moveTo(x, y - TILE_H / 2);
      path.lineTo(x + TILE_W / 2, y);
      path.lineTo(x, y + TILE_H / 2);
      path.lineTo(x - TILE_W / 2, y);
      path.close();
      minX = Math.min(minX, x - TILE_W / 2);
      maxX = Math.max(maxX, x + TILE_W / 2);
      minY = Math.min(minY, y - TILE_H / 2);
      maxY = Math.max(maxY, y + TILE_H / 2);
    }
    if (!Number.isFinite(minX)) return null;
    const pad = 2;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2),
    );
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(valid ? 'rgba(76,175,80,0.5)' : 'rgba(229,57,53,0.5)'));
    canvas.drawPath(path, paint);
    return recorder.finishRecordingAsPicture();
  }, [cellKey, originX, originY, valid, cells]);

  if (!picture) return null;
  return <Picture picture={picture} />;
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
    anchorX: def.anchor.x,
    anchorY: def.anchor.y,
  };
}

function eventToGrid(
  ex: number,
  ey: number,
  offsetX: number,
  offsetY: number,
  scale: number,
  originX: number,
  originY: number,
) {
  const s = scale > 0.01 ? scale : 1;
  return screenToGrid(ex / s - offsetX - originX, ey / s - offsetY - originY);
}

const UnitLayer = memo(function UnitLayer({
  units,
  originX,
  originY,
}: {
  units: DrawItem[];
  originX: number;
  originY: number;
}) {
  return (
    <>
      {units.map((item) => {
        const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
        const size = Math.max(14, TILE_W * 0.45);
        return (
          <RoundedRect
            key={item.key}
            x={c.x + originX - size / 2}
            y={c.y + originY - size / 2}
            width={size}
            height={size}
            r={3}
            color={item.color}
          />
        );
      })}
    </>
  );
});

const BuildingGhost = memo(function BuildingGhost({
  item,
  originX,
  originY,
}: {
  item: DrawItem;
  originX: number;
  originY: number;
}) {
  const rect = useMemo(() => layoutDrawItem(item), [item]);
  if (!item.sprite) return null;
  const img = getSkiaImage(item.sprite);
  if (!img) return null;
  return (
    <SkiaImage
      image={img}
      x={rect.left + originX}
      y={rect.top + originY}
      width={rect.bw}
      height={rect.bh}
      opacity={0.9}
    />
  );
});

const IsometricWorldInner = memo(function IsometricWorldInner({
  state,
  width,
  height,
  mode = 'village',
  combat,
  placementBuildingId,
  movingBuildingId,
  hoverTile,
  onHoverTile,
  onConfirmPlace,
  onConfirmMove,
  onStartMoveBuilding,
  onMoveHoldBlocked,
  onTapTile,
  onSelectBuilding,
}: Props & { width: number; height: number }) {
  const gridSize = combat?.mapSize ?? META.gridSize;
  const placing = mode === 'village' && !!placementBuildingId;
  const relocating = mode === 'village' && !!movingBuildingId;
  const interacting = placing || relocating;
  const layout = useMemo(() => worldLayout(gridSize), [gridSize]);
  const { worldW, worldH, originX, originY, minX, maxX, minY, maxY } = layout;

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const viewW = useSharedValue(width);
  const viewH = useSharedValue(height);
  const boundsMinX = useSharedValue(minX);
  const boundsMaxX = useSharedValue(maxX);
  const boundsMinY = useSharedValue(minY);
  const boundsMaxY = useSharedValue(maxY);
  const worldOriginX = useSharedValue(originX);
  const worldOriginY = useSharedValue(originY);
  const interactingSV = useSharedValue(interacting ? 1 : 0);
  const holdActiveSV = useSharedValue(0);
  const centered = useRef(false);
  const mounted = useRef(false);
  const buildingsCountRef = useRef(state.buildings.length);
  const modeRef = useRef(mode);
  const interactingRef = useRef(interacting);
  buildingsCountRef.current = state.buildings.length;
  modeRef.current = mode;
  interactingRef.current = interacting;

  const [spritesReady, setSpritesReady] = useState(false);
  const [holdRing, setHoldRing] = useState<{ x: number; y: number } | null>(null);
  const holdProgress = useSharedValue(0);
  const holdTargetRef = useRef<string | null>(null);
  const buildingsRef = useRef(state.buildings);
  buildingsRef.current = state.buildings;
  const stateRef = useRef(state);
  stateRef.current = state;
  const hoverThrottleRef = useRef({ x: -1, y: -1, t: 0 });

  useEffect(() => {
    interactingSV.value = interacting ? 1 : 0;
  }, [interacting, interactingSV]);

  useEffect(() => {
    holdActiveSV.value = holdRing ? 1 : 0;
  }, [holdRing, holdActiveSV]);

  useEffect(() => {
    viewW.value = width;
    viewH.value = height;
    boundsMinX.value = minX;
    boundsMaxX.value = maxX;
    boundsMinY.value = minY;
    boundsMaxY.value = maxY;
    worldOriginX.value = originX;
    worldOriginY.value = originY;
  }, [
    width,
    height,
    minX,
    maxX,
    minY,
    maxY,
    originX,
    originY,
    viewW,
    viewH,
    boundsMinX,
    boundsMaxX,
    boundsMinY,
    boundsMaxY,
    worldOriginX,
    worldOriginY,
  ]);

  useEffect(() => {
    return () => {
      clearBuildingsPictureCache();
    };
  }, []);

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
    if (width <= 0 || height <= 0 || centered.current) return;
    const center = gridToScreen(gridSize / 2, gridSize / 2);
    const next = clampPan(
      width / 2 / scale.value - (center.x + originX),
      height / 2 / scale.value - (center.y + originY),
      width,
      height,
      scale.value,
      minX,
      maxX,
      minY,
      maxY,
    );
    offsetX.value = next.x;
    offsetY.value = next.y;
    centered.current = true;
    if (!mounted.current) {
      mounted.current = true;
      mapLogMount({
        mode,
        w: Math.round(width),
        h: Math.round(height),
        grid: gridSize,
        buildings: state.buildings.length,
        placing: interacting ? 1 : 0,
        renderer: 'skia-coc-layers',
      });
    }
  }, [
    width,
    height,
    gridSize,
    mode,
    state.buildings.length,
    placing,
    worldW,
    worldH,
    originX,
    originY,
    minX,
    maxX,
    minY,
    maxY,
    offsetX,
    offsetY,
    scale,
  ]);

  const reportHover = useCallback(
    (gx: number, gy: number) => {
      const now = Date.now();
      const last = hoverThrottleRef.current;
      if (last.x === gx && last.y === gy) return;
      if (now - last.t < 48) return;
      hoverThrottleRef.current = { x: gx, y: gy, t: now };
      onHoverTile?.(gx, gy);
    },
    [onHoverTile],
  );

  const beginHoldJS = useCallback(
    (screenX: number, screenY: number, gx: number, gy: number) => {
      try {
        if (modeRef.current !== 'village' || interactingRef.current) return;
        const hit = findBuildingAt(buildingsRef.current as PlacedBuilding[], gx, gy);
        if (!hit) return;
        const check = canStartMove(stateRef.current, hit.instanceId);
        if (!check.ok) {
          onMoveHoldBlocked?.(check.reason);
          return;
        }
        mapLog('hold.begin', { building: hit.buildingId, gx, gy });
        holdTargetRef.current = hit.instanceId;
        setHoldRing({ x: screenX, y: screenY });
        holdProgress.value = 0;
        holdProgress.value = withTiming(1, { duration: MOVE_HOLD_MS });
      } catch (e) {
        logCrash('action', 'map.hold.begin', e, { screenX, screenY, gx, gy });
      }
    },
    [holdProgress, onMoveHoldBlocked],
  );

  const completeHoldJS = useCallback(
    (gx: number, gy: number) => {
      try {
        const id = holdTargetRef.current;
        holdTargetRef.current = null;
        setHoldRing(null);
        holdProgress.value = 0;
        if (!id) return;
        mapLog('hold.complete', { id, gx, gy });
        onStartMoveBuilding?.(id, gx, gy);
      } catch (e) {
        logCrash('action', 'map.hold.complete', e, { gx, gy });
      }
    },
    [holdProgress, onStartMoveBuilding],
  );

  const cancelHoldJS = useCallback(() => {
    try {
      if (holdTargetRef.current) mapLog('hold.cancel', { id: holdTargetRef.current });
      holdTargetRef.current = null;
      setHoldRing(null);
      cancelAnimation(holdProgress);
      holdProgress.value = 0;
    } catch (e) {
      logCrash('action', 'map.hold.cancel', e);
    }
  }, [holdProgress]);

  const handleTap = useCallback(
    (gx: number, gy: number) => {
      try {
        if (mode === 'combat') {
          onTapTile?.(gx, gy);
          return;
        }
        if (placementBuildingId) {
          mapLog('place.tap', { gx, gy, building: placementBuildingId });
          onConfirmPlace?.(gx, gy);
          return;
        }
        if (movingBuildingId) {
          onConfirmMove?.(gx, gy);
          return;
        }
        const hit = findBuildingAt(state.buildings as PlacedBuilding[], gx, gy);
        mapLog('tap', { gx, gy, hit: hit?.buildingId ?? 'none' });
        onSelectBuilding?.(hit?.instanceId ?? null);
        onTapTile?.(gx, gy);
      } catch (e) {
        logCrash('action', 'map.tap', e, { gx, gy, mode });
      }
    },
    [
      mode,
      onConfirmPlace,
      onConfirmMove,
      onSelectBuilding,
      onTapTile,
      placementBuildingId,
      movingBuildingId,
      state.buildings,
    ],
  );

  const onPanBeginJS = useCallback(() => {
    mapLogPanBegin(modeRef.current, buildingsCountRef.current);
  }, []);

  const onPanTickJS = useCallback((ox: number, oy: number, s: number) => {
    mapLog('pan.tick', {
      ox: Math.round(ox),
      oy: Math.round(oy),
      s: Math.round(s * 100) / 100,
    });
  }, []);

  const onPanEndJS = useCallback(() => {
    mapLogPanEnd();
    setTimeout(() => mapLog('pan.alive', { afterMs: 400 }), 400);
    setTimeout(() => mapLog('pan.alive', { afterMs: 1200 }), 1200);
  }, []);

  const onPinchBeginJS = useCallback(() => {
    mapLog('pinch.begin', { mode: modeRef.current });
  }, []);

  const onPinchEndJS = useCallback(() => {
    mapLog('pinch.end', { mode: modeRef.current });
    setTimeout(() => mapLog('pinch.alive', { afterMs: 400 }), 400);
  }, []);

  const panTickGate = useSharedValue(0);

  // Keep gesture overlay (not wrapping Canvas). Re-enable camera writes + pinch.
  const PAN_VISUAL = true;

  const cameraPan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        .activeOffsetX([-12, 12])
        .activeOffsetY([-12, 12])
        .onBegin((e) => {
          startX.value = offsetX.value;
          startY.value = offsetY.value;
          panTickGate.value = 0;
          runOnJS(onPanBeginJS)();
          if (interactingSV.value > 0) {
            const g = eventToGrid(
              e.x,
              e.y,
              offsetX.value,
              offsetY.value,
              scale.value,
              worldOriginX.value,
              worldOriginY.value,
            );
            runOnJS(reportHover)(g.x, g.y);
          }
        })
        .onUpdate((e) => {
          const s = scale.value > 0.01 ? scale.value : 1;
          const next = clampPan(
            startX.value + e.translationX / s,
            startY.value + e.translationY / s,
            viewW.value,
            viewH.value,
            s,
            boundsMinX.value,
            boundsMaxX.value,
            boundsMinY.value,
            boundsMaxY.value,
          );
          if (PAN_VISUAL) {
            offsetX.value = next.x;
            offsetY.value = next.y;
          }
          if (panTickGate.value === 0) {
            panTickGate.value = 1;
            runOnJS(onPanTickJS)(next.x, next.y, s);
          }
          if (interactingSV.value > 0) {
            const g = eventToGrid(
              e.x,
              e.y,
              offsetX.value,
              offsetY.value,
              scale.value,
              worldOriginX.value,
              worldOriginY.value,
            );
            runOnJS(reportHover)(g.x, g.y);
          }
        })
        .onFinalize(() => {
          runOnJS(onPanEndJS)();
        }),
    [
      offsetX,
      offsetY,
      startX,
      startY,
      viewW,
      viewH,
      scale,
      boundsMinX,
      boundsMaxX,
      boundsMinY,
      boundsMaxY,
      worldOriginX,
      worldOriginY,
      interactingSV,
      panTickGate,
      onPanBeginJS,
      onPanTickJS,
      onPanEndJS,
      reportHover,
    ],
  );

  const cameraPinch = useMemo(
    () =>
      Gesture.Pinch()
        .manualActivation(true)
        .onTouchesMove((e, state) => {
          'worklet';
          if (interactingSV.value > 0 || holdActiveSV.value > 0) {
            state.fail();
            return;
          }
          if (e.numberOfTouches >= 2) {
            state.activate();
          }
        })
        .onTouchesUp((e, state) => {
          'worklet';
          if (e.numberOfTouches < 2) {
            state.fail();
          }
        })
        .onStart((e) => {
          focalX.value = e.focalX;
          focalY.value = e.focalY;
          runOnJS(onPinchBeginJS)();
        })
        .onUpdate((e) => {
          if (e.numberOfPointers < 2) return;
          const prev = scale.value;
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
          if (prev <= 0.01) return;
          offsetX.value =
            offsetX.value + focalX.value * (1 / next - 1 / prev);
          offsetY.value =
            offsetY.value + focalY.value * (1 / next - 1 / prev);
          scale.value = next;
          const clamped = clampPan(
            offsetX.value,
            offsetY.value,
            viewW.value,
            viewH.value,
            next,
            boundsMinX.value,
            boundsMaxX.value,
            boundsMinY.value,
            boundsMaxY.value,
          );
          offsetX.value = clamped.x;
          offsetY.value = clamped.y;
        })
        .onEnd(() => {
          savedScale.value = scale.value;
        })
        .onFinalize(() => {
          runOnJS(onPinchEndJS)();
        }),
    [
      interactingSV,
      holdActiveSV,
      offsetX,
      offsetY,
      scale,
      savedScale,
      focalX,
      focalY,
      viewW,
      viewH,
      boundsMinX,
      boundsMaxX,
      boundsMinY,
      boundsMaxY,
      onPinchBeginJS,
      onPinchEndJS,
    ],
  );

  const tap = useMemo(() => {
    const g = Gesture.Tap().maxDuration(250).onEnd((e) => {
      const gxy = eventToGrid(
        e.x,
        e.y,
        offsetX.value,
        offsetY.value,
        scale.value,
        worldOriginX.value,
        worldOriginY.value,
      );
      if (interactingSV.value > 0) runOnJS(reportHover)(gxy.x, gxy.y);
      runOnJS(handleTap)(gxy.x, gxy.y);
    });
    g.requireExternalGestureToFail(cameraPan);
    return g;
  }, [
    cameraPan,
    offsetX,
    offsetY,
    scale,
    worldOriginX,
    worldOriginY,
    interactingSV,
    reportHover,
    handleTap,
  ]);

  // Stable tree — never swap when entering place mode (Android crash).
  const composed = useMemo(
    () => Gesture.Simultaneous(cameraPinch, cameraPan, tap),
    [cameraPinch, cameraPan, tap],
  );

  useEffect(() => {
    if (!interacting) return;
    mapLog('place.mode', {
      placing: placing ? 1 : 0,
      relocating: relocating ? 1 : 0,
      building: placementBuildingId ?? movingBuildingId ?? 'none',
    });
  }, [interacting, placing, relocating, placementBuildingId, movingBuildingId]);

  /** Camera INSIDE Skia — Picture is world-sized; viewport Canvas must transform content, not the View. */
  const cameraTransform = useDerivedValue(() => [
    { translateX: offsetX.value },
    { translateY: offsetY.value },
    { scale: scale.value },
  ]);

  const buildingVisualKey = useMemo(
    () =>
      [...(state.buildings as PlacedBuilding[])]
        .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
        .map(
          (b) =>
            `${b.instanceId}:${b.buildingId}:${b.level}:${b.x}:${b.y}:${b.buildEndsAt ?? 0}`,
        )
        .join('|'),
    [state.buildings],
  );

  const combatBuildingKey = useMemo(() => {
    if (!combat) return '';
    return combat.buildings.map((b) => `${b.instanceId}:${b.destroyed}`).join('|');
  }, [combat]);

  const buildingItems = useMemo((): DrawItem[] => {
    if (mode === 'combat' && combat) {
      return combat.buildings
        .filter((b) => !b.destroyed)
        .map((b) => {
          const def = getBuildingDef(b.buildingId);
          return toDrawItem(b.instanceId, b.x, b.y, b.w, b.h, b.buildingId, b.level, def.color);
        })
        .sort(
          (a, b) => depthKey(a.x, a.y, a.w, a.h, 1) - depthKey(b.x, b.y, b.w, b.h, 1),
        );
    }

    return (state.buildings as PlacedBuilding[])
      .filter((b) => b.instanceId !== movingBuildingId)
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
  }, [buildingVisualKey, combatBuildingKey, mode, movingBuildingId]);

  const movingGhostItem = useMemo((): DrawItem | null => {
    if (!relocating || !movingBuildingId || !hoverTile) return null;
    const b = (state.buildings as PlacedBuilding[]).find((x) => x.instanceId === movingBuildingId);
    if (!b) return null;
    const def = getBuildingDef(b.buildingId);
    return toDrawItem(
      b.instanceId,
      hoverTile.x,
      hoverTile.y,
      def.footprint.w,
      def.footprint.h,
      b.buildingId,
      b.level,
      def.color,
    );
  }, [relocating, movingBuildingId, hoverTile, state.buildings]);

  const placementGhostItem = useMemo((): DrawItem | null => {
    if (!placing || !placementBuildingId || !hoverTile) return null;
    const def = getBuildingDef(placementBuildingId);
    return toDrawItem(
      'ghost-place',
      hoverTile.x,
      hoverTile.y,
      def.footprint.w,
      def.footprint.h,
      placementBuildingId,
      1,
      def.color,
    );
  }, [placing, placementBuildingId, hoverTile]);

  const interactGhostItem = movingGhostItem ?? placementGhostItem;

  const combatUnits = useMemo((): DrawItem[] => {
    if (mode !== 'combat' || !combat) return [];
    return combat.units
      .map((u) => {
        const def = getTroopDef(u.troopId);
        return {
          key: u.id,
          x: u.x,
          y: u.y,
          w: 1,
          h: 1,
          color: def.color,
          sprite: null,
          anchorX: 0.5,
          anchorY: 1,
        };
      })
      .sort(
        (a, b) => depthKey(a.x, a.y, a.w, a.h, 2) - depthKey(b.x, b.y, b.w, b.h, 2),
      );
  }, [mode, combat]);

  const terrainPicture = useMemo(
    () => getTerrainPicture(worldW, worldH, gridSize),
    [worldW, worldH, gridSize],
  );

  const buildingsPicture = useMemo(() => {
    if (!spritesReady) return null;
    return getBuildingsPicture(
      buildingVisualKey + combatBuildingKey + (movingBuildingId ?? ''),
      worldW,
      worldH,
      originX,
      originY,
      buildingItems,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spritesReady, buildingVisualKey, combatBuildingKey, movingBuildingId, worldW, worldH, originX, originY]);

  const previewCells = useMemo(() => {
    if (mode !== 'village' || !hoverTile) return null;
    let buildingId: string | null = null;
    let instanceId: string | null = null;
    if (placing && placementBuildingId) {
      buildingId = placementBuildingId;
    } else if (relocating && movingBuildingId) {
      instanceId = movingBuildingId;
      const b = state.buildings.find((x) => x.instanceId === movingBuildingId);
      buildingId = b?.buildingId ?? null;
    }
    if (!buildingId) return null;
    const def = getBuildingDef(buildingId);
    const check = instanceId
      ? canMove(state, instanceId, hoverTile.x, hoverTile.y)
      : canPlace(state, buildingId, hoverTile.x, hoverTile.y);
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < def.footprint.h; dy++) {
      for (let dx = 0; dx < def.footprint.w; dx++) {
        cells.push({ x: hoverTile.x + dx, y: hoverTile.y + dy });
      }
    }
    return { valid: check.ok, cells };
  }, [mode, placing, relocating, placementBuildingId, movingBuildingId, hoverTile, state]);

  if (width <= 0 || height <= 0) return null;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Group transform={cameraTransform}>
          <Picture picture={terrainPicture} />
          {buildingsPicture ? <Picture picture={buildingsPicture} /> : null}
          {combatUnits.length > 0 ? (
            <UnitLayer units={combatUnits} originX={originX} originY={originY} />
          ) : null}
          {interactGhostItem ? (
            <BuildingGhost item={interactGhostItem} originX={originX} originY={originY} />
          ) : null}
          {previewCells ? (
            <PreviewOverlay
              cells={previewCells.cells}
              valid={previewCells.valid}
              originX={originX}
              originY={originY}
            />
          ) : null}
        </Group>
      </Canvas>
      <GestureDetector gesture={composed}>
        <View style={StyleSheet.absoluteFillObject} collapsable={false} />
      </GestureDetector>
      {holdRing ? <MoveHoldRing x={holdRing.x} y={holdRing.y} progress={holdProgress} /> : null}
      {interacting ? (
        <View style={styles.placeBanner} pointerEvents="none">
          <Text style={styles.placeBannerText}>
            {relocating
              ? 'Sposta · verde=ok · rosso=no · tocca per confermare'
              : 'Trascina · verde=ok · rosso=no · tocca per confermare'}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

export const IsometricWorld = memo(function IsometricWorld(props: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setSize((prev) => {
      if (prev && Math.abs(prev.w - width) < 2 && Math.abs(prev.h - height) < 2) return prev;
      return { w: width, h: height };
    });
  }, []);

  const width = props.width ?? size?.w ?? 0;
  const height = props.height ?? size?.h ?? 0;

  return (
    <View style={styles.fill} onLayout={props.width == null ? onLayout : undefined}>
      {width > 0 && height > 0 ? (
        <IsometricWorldInner {...props} width={width} height={height} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
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
