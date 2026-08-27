import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useGame } from './GameContext';
import { BUILDINGS, TROOPS } from '../sim/content';
import { isBuildingUnlocked } from '../sim/buildings';
import { armyCampCapacity, armyHousingUsed, isTroopUnlocked } from '../sim/training';
import { freeBuilderSlots } from '../sim/economy';

type ShopTab = 'edifici' | 'truppe';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Clash-style shop: buildings + troops, only when opened. */
export function ShopSheet({ visible, onClose }: Props) {
  const { state, placementBuilding, setPlacementBuilding, train, setSelectedBuildingId } =
    useGame();
  const [tab, setTab] = useState<ShopTab>('edifici');
  const builders = freeBuilderSlots(state, Date.now());
  const used = armyHousingUsed(state.army);
  const cap = armyCampCapacity(state);
  const unlockedBuildings = BUILDINGS.filter(
    (b) => b.id !== 'qg' && isBuildingUnlocked(state, b.id),
  );
  const unlockedTroops = TROOPS.filter((t) => isTroopUnlocked(state, t.id));

  const pickBuilding = (id: string) => {
    setSelectedBuildingId(null);
    setPlacementBuilding(placementBuilding === id ? null : id);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Negozio</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, tab === 'edifici' && styles.tabOn]}
              onPress={() => setTab('edifici')}
            >
              <Text style={[styles.tabText, tab === 'edifici' && styles.tabTextOn]}>Edifici</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, tab === 'truppe' && styles.tabOn]}
              onPress={() => setTab('truppe')}
            >
              <Text style={[styles.tabText, tab === 'truppe' && styles.tabTextOn]}>Truppe</Text>
            </Pressable>
          </View>

          {tab === 'edifici' ? (
            <>
              <Text style={styles.meta}>Costruttori liberi: {builders}</Text>
              <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
                {unlockedBuildings.map((b) => {
                  const cost = b.levels[0].buildCost;
                  const active = placementBuilding === b.id;
                  return (
                    <Pressable
                      key={b.id}
                      style={[styles.card, active && styles.cardActive]}
                      onPress={() => pickBuilding(b.id)}
                    >
                      <View style={[styles.swatch, { backgroundColor: b.color }]} />
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {b.name}
                      </Text>
                      <Text style={styles.cardSub}>
                        {cost.legna}L · {cost.acqua}A
                        {cost.impegno ? ` · ${cost.impegno}I` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <>
              <Text style={styles.meta}>
                Esercito {used}/{cap}
                {state.trainingQueue.length > 0
                  ? ` · in coda ${state.trainingQueue.length}`
                  : ''}
              </Text>
              <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
                {unlockedTroops.map((t) => (
                  <Pressable key={t.id} style={styles.card} onPress={() => train(t.id)}>
                    <View style={[styles.swatch, { backgroundColor: '#5D4037' }]} />
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {t.name}
                    </Text>
                    <Text style={styles.cardSub}>
                      {t.trainCost.legna}L · {t.housing} posti · {t.trainTimeSec}s
                    </Text>
                  </Pressable>
                ))}
                {unlockedTroops.length === 0 ? (
                  <Text style={styles.empty}>Nessuna truppa sbloccata</Text>
                ) : null}
              </ScrollView>
              {state.army.length > 0 ? (
                <View style={styles.armyRow}>
                  {state.army.map((u) => {
                    const t = TROOPS.find((x) => x.id === u.troopId);
                    return (
                      <Text key={u.troopId} style={styles.armyChip}>
                        {t?.name ?? u.troopId} ×{u.count}
                      </Text>
                    );
                  })}
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '72%',
    backgroundColor: '#1A2E22',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 2,
    borderColor: '#C9A227',
    paddingBottom: 20,
    paddingHorizontal: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 8,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { color: '#FFF8E1', fontSize: 20, fontWeight: '800' },
  close: { color: '#ECEFF1', fontSize: 20, fontWeight: '700', paddingHorizontal: 6 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#243528',
    alignItems: 'center',
  },
  tabOn: { backgroundColor: '#C9A227' },
  tabText: { color: '#A5D6A7', fontWeight: '700' },
  tabTextOn: { color: '#1A1200' },
  meta: { color: '#C8E6C9', fontSize: 12, marginBottom: 8 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 12,
  },
  card: {
    width: '30%',
    minWidth: 100,
    flexGrow: 1,
    backgroundColor: '#2E4A32',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardActive: {
    borderColor: '#DCEDC8',
    backgroundColor: '#558B2F',
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginBottom: 6,
  },
  cardTitle: { color: '#F1F8E9', fontWeight: '800', fontSize: 12 },
  cardSub: { color: '#A5D6A7', fontSize: 11, marginTop: 4 },
  empty: { color: '#FFF59D', padding: 12 },
  armyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  armyChip: {
    color: '#C8E6C9',
    fontSize: 11,
    backgroundColor: '#243528',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
