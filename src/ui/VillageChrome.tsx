import React from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGame } from './GameContext';
import { getBuildingDef, getEraDef } from '../sim/content';
import type { PlacedBuildingExt } from '../sim/buildings';

type Props = {
  onOpenShop: () => void;
  onCancelPlace: () => void;
};

/** Clash-style bottom chrome: missions left, shop right. */
export function VillageChrome({ onOpenShop, onCancelPlace }: Props) {
  const { state, placementBuilding, selectedBuildingId, upgrade, collect, setSelectedBuildingId } =
    useGame();
  const era = getEraDef(state.currentEra);

  const selected = selectedBuildingId
    ? (state.buildings.find((x) => x.instanceId === selectedBuildingId) as
        | PlacedBuildingExt
        | undefined)
    : undefined;
  const selectedDef = selected ? getBuildingDef(selected.buildingId) : null;
  const busy = !!(selected?.buildEndsAt && selected.buildEndsAt > Date.now());

  return (
    <>
      <View style={styles.topLeft} pointerEvents="none">
        <Text style={styles.brand}>ToBeAScout</Text>
        <Text style={styles.era}>{era.name}</Text>
      </View>

      {placementBuilding ? (
        <View style={styles.cancelWrap} pointerEvents="box-none">
          <Pressable style={styles.cancelPlace} onPress={onCancelPlace}>
            <Text style={styles.cancelPlaceText}>Annulla</Text>
          </Pressable>
        </View>
      ) : null}

      {selected && selectedDef && !placementBuilding ? (
        <View style={styles.selectCard}>
          <View style={styles.selectHeader}>
            <Text style={styles.selectTitle}>
              {selectedDef.name} · Lv {selected.level}
              {busy ? '…' : ''}
            </Text>
            <Pressable onPress={() => setSelectedBuildingId(null)} hitSlop={10}>
              <Text style={styles.selectClose}>✕</Text>
            </Pressable>
          </View>
          {selectedDef.produces ? (
            <Text style={styles.selectMeta}>
              Magazzino: {Math.floor(selected.stored)} {selectedDef.produces.resource}
            </Text>
          ) : null}
          <View style={styles.selectRow}>
            {selectedDef.produces ? (
              <Pressable style={styles.actionBtn} onPress={() => collect(selected.instanceId)}>
                <Text style={styles.actionText}>Raccogli</Text>
              </Pressable>
            ) : null}
            {selected.level < selectedDef.maxLevel ? (
              <Pressable
                style={[styles.actionBtn, busy && styles.actionDisabled]}
                onPress={() => upgrade(selected.instanceId)}
                disabled={busy}
              >
                <Text style={styles.actionText}>Upgrade</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.bottomBar} pointerEvents="box-none">
        <Link href="/missions" asChild>
          <Pressable style={[styles.fab, styles.missionsFab]}>
            <Text style={styles.fabIcon}>M</Text>
            <Text style={styles.fabLabel}>Missioni</Text>
          </Pressable>
        </Link>

        <Pressable style={[styles.fab, styles.shopFab]} onPress={onOpenShop}>
          <Text style={styles.fabIcon}>+</Text>
          <Text style={styles.fabLabel}>Shop</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topLeft: {
    position: 'absolute',
    top: 8,
    left: 10,
    zIndex: 40,
  },
  brand: {
    color: '#E8F5E9',
    fontSize: 16,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  era: {
    color: '#FFF59D',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 60,
  },
  fab: {
    width: 78,
    height: 78,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF8E1',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  missionsFab: {
    backgroundColor: '#E65100',
  },
  shopFab: {
    backgroundColor: '#F9A825',
  },
  fabIcon: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1A1200',
    lineHeight: 30,
    marginBottom: 1,
  },
  fabLabel: {
    color: '#1A1200',
    fontWeight: '900',
    fontSize: 11,
  },
  cancelWrap: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 55,
  },
  cancelPlace: {
    width: 108,
    backgroundColor: '#5D4037',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFE0B2',
  },
  cancelPlaceText: { color: '#FFE0B2', fontWeight: '800' },
  selectCard: {
    position: 'absolute',
    left: 90,
    right: 90,
    bottom: 100,
    backgroundColor: 'rgba(15, 30, 18, 0.95)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#C9A227',
    zIndex: 55,
  },
  selectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectTitle: { color: '#E8F5E9', fontWeight: '800', fontSize: 14, flex: 1 },
  selectClose: { color: '#ECEFF1', fontSize: 16, paddingHorizontal: 4 },
  selectMeta: { color: '#FFF59D', fontSize: 12, marginTop: 4 },
  selectRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: {
    backgroundColor: '#33691E',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionDisabled: { opacity: 0.45 },
  actionText: { color: '#F1F8E9', fontWeight: '700' },
});
