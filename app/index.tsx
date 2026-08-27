import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../src/ui/GameContext';
import { IsometricWorld } from '../src/render/IsometricWorld';
import {
  BuildPanel,
  EraStrip,
  ResourceBar,
  SelectedBuildingPanel,
  TrainPanel,
} from '../src/ui/Hud';

export default function VillageScreen() {
  const {
    state,
    ready,
    message,
    clearMessage,
    place,
    placementBuilding,
    selectedBuildingId,
    setSelectedBuildingId,
    reset,
  } = useGame();
  const { width, height } = useWindowDimensions();
  const sideW = Math.min(320, Math.max(240, width * 0.34));
  const mapW = width - sideW;
  const mapH = height;

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clearMessage, 2500);
    return () => clearTimeout(t);
  }, [message, clearMessage]);

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
      <View style={styles.row}>
        <View style={[styles.mapCol, { width: mapW, height: mapH }]}>
          <IsometricWorld
            state={state}
            width={mapW}
            height={mapH}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={setSelectedBuildingId}
            onTapTile={(gx, gy) => {
              if (placementBuilding) place(placementBuilding, gx, gy);
            }}
          />
          {message ? (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{message}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.side, { width: sideW }]}>
          <ScrollView contentContainerStyle={styles.sideContent}>
            <ResourceBar />
            <EraStrip />
            <SelectedBuildingPanel />
            <BuildPanel />
            <TrainPanel />
            <View style={styles.footer}>
              <Link href="/missions" asChild>
                <Pressable style={styles.footerBtn}>
                  <Text style={styles.footerBtnText}>Missioni</Text>
                </Pressable>
              </Link>
              <Pressable style={[styles.footerBtn, styles.danger]} onPress={() => void reset()}>
                <Text style={styles.footerBtnText}>Nuova</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B4332' },
  row: { flex: 1, flexDirection: 'row' },
  mapCol: { position: 'relative' },
  side: {
    backgroundColor: 'rgba(10,20,12,0.96)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#4CAF50',
  },
  sideContent: { paddingBottom: 16 },
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
    zIndex: 20,
  },
  toastText: { color: '#FFF' },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  footerBtn: {
    flex: 1,
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  danger: { backgroundColor: '#5D4037' },
  footerBtnText: { color: '#E8F5E9', fontWeight: '800', fontSize: 13 },
});
