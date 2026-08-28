import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../src/ui/GameContext';
import { IsometricWorld } from '../src/render/IsometricWorld';
import { ResourceBarsHud } from '../src/ui/ResourceBarsHud';
import { ShopSheet } from '../src/ui/ShopSheet';
import { VillageChrome } from '../src/ui/VillageChrome';
import { canPlace } from '../src/sim/buildings';

export default function VillageScreen() {
  const {
    state,
    ready,
    message,
    clearMessage,
    place,
    placementBuilding,
    setPlacementBuilding,
    selectedBuildingId,
    setSelectedBuildingId,
  } = useGame();
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const mapSizeLocked = useRef(false);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => {
    if (!placementBuilding) setHoverTile(null);
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
            selectedBuildingId={selectedBuildingId}
            placementBuildingId={placementBuilding}
            hoverTile={hoverTile}
            onSelectBuilding={setSelectedBuildingId}
            onHoverTile={(gx, gy) => {
              setHoverTile((prev) =>
                prev && prev.x === gx && prev.y === gy ? prev : { x: gx, y: gy },
              );
            }}
            onConfirmPlace={(gx, gy) => {
              if (!placementBuilding) return;
              const check = canPlace(state, placementBuilding, gx, gy);
              if (!check.ok) return;
              place(placementBuilding, gx, gy);
              setHoverTile(null);
            }}
          />
        ) : null}
        <ResourceBarsHud />
        <VillageChrome
          onOpenShop={() => setShopOpen(true)}
          onCancelPlace={() => {
            setPlacementBuilding(null);
            setHoverTile(null);
          }}
        />
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
