import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../src/ui/GameContext';
import { IsometricWorld } from '../src/render/IsometricWorld';
import { ResourceBarsHud } from '../src/ui/ResourceBarsHud';
import { ShopSheet } from '../src/ui/ShopSheet';
import { VillageChrome } from '../src/ui/VillageChrome';
import { canMove, canPlace } from '../src/sim/buildings';
import { META } from '../src/sim/content';

export default function VillageScreen() {
  const {
    state,
    ready,
    message,
    clearMessage,
    place,
    move,
    placementBuilding,
    setPlacementBuilding,
    movingBuildingId,
    setMovingBuildingId,
    showMessage,
  } = useGame();
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const mapSizeLocked = useRef(false);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => {
    if (!placementBuilding && !movingBuildingId) setHoverTile(null);
  }, [placementBuilding, movingBuildingId]);

  useEffect(() => {
    if (!placementBuilding) return;
    const c = Math.floor(META.gridSize / 2) - 1;
    setHoverTile({ x: c, y: c });
  }, [placementBuilding]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clearMessage, 2500);
    return () => clearTimeout(t);
  }, [message, clearMessage]);

  const onMapLayout = (e: LayoutChangeEvent) => {
    if (mapSizeLocked.current) return;
    const { width, height } = e.nativeEvent.layout;
    const w = Math.floor(width);
    const h = Math.floor(height);
    if (w <= 0 || h <= 0) return;
    mapSizeLocked.current = true;
    setMapSize({ width: w, height: h });
  };

  const onSelectBuilding = useCallback((id: string | null) => {
    if (id) router.push({ pathname: '/building', params: { id } });
  }, []);

  const onHoverTile = useCallback((gx: number, gy: number) => {
    setHoverTile((prev) =>
      prev && prev.x === gx && prev.y === gy ? prev : { x: gx, y: gy },
    );
  }, []);

  const onConfirmPlace = useCallback(
    (gx: number, gy: number) => {
      if (!placementBuilding) return;
      const check = canPlace(state, placementBuilding, gx, gy);
      if (!check.ok) {
        showMessage(check.reason);
        return;
      }
      place(placementBuilding, gx, gy);
      setHoverTile(null);
    },
    [placementBuilding, place, state, showMessage],
  );

  const onStartMoveBuilding = useCallback(
    (instanceId: string, _gx: number, _gy: number) => {
      const b = state.buildings.find((x) => x.instanceId === instanceId);
      if (!b) return;
      setMovingBuildingId(instanceId);
      setHoverTile({ x: b.x, y: b.y });
    },
    [state.buildings, setMovingBuildingId],
  );

  const onConfirmMove = useCallback(
    (gx: number, gy: number) => {
      if (!movingBuildingId) return;
      const check = canMove(state, movingBuildingId, gx, gy);
      if (!check.ok) return;
      move(movingBuildingId, gx, gy);
      setHoverTile(null);
    },
    [movingBuildingId, move, state],
  );

  const onCancelInteract = useCallback(() => {
    setPlacementBuilding(null);
    setMovingBuildingId(null);
    setHoverTile(null);
  }, [setPlacementBuilding, setMovingBuildingId]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#A5D6A7" size="large" />
        <Text style={styles.loadingText}>Carico il campo…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.mapCol} onLayout={onMapLayout}>
        {mapSize.width > 0 && mapSize.height > 0 ? (
          <IsometricWorld
            state={state}
            width={mapSize.width}
            height={mapSize.height}
            placementBuildingId={placementBuilding}
            movingBuildingId={movingBuildingId}
            hoverTile={hoverTile}
            onSelectBuilding={onSelectBuilding}
            onHoverTile={onHoverTile}
            onConfirmPlace={onConfirmPlace}
            onStartMoveBuilding={onStartMoveBuilding}
            onConfirmMove={onConfirmMove}
            onMoveHoldBlocked={showMessage}
          />
        ) : null}
        <ResourceBarsHud />
        <VillageChrome onOpenShop={() => setShopOpen(true)} onCancelPlace={onCancelInteract} />
        {message ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{message}</Text>
          </View>
        ) : null}
      </View>

      <ShopSheet visible={shopOpen} onClose={() => setShopOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B4332' },
  mapCol: { position: 'relative', flex: 1, overflow: 'hidden' },
  loading: {
    flex: 1,
    backgroundColor: '#1B4332',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#C8E6C9' },
  toast: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 80,
  },
  toastText: { color: '#FFF' },
});
