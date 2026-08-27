import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGame } from './GameContext';
import { BUILDINGS, ERAS, TROOPS, getBuildingDef, getEraDef } from '../sim/content';
import { isBuildingUnlocked } from '../sim/buildings';
import { armyCampCapacity, armyHousingUsed, isTroopUnlocked } from '../sim/training';
import { freeBuilderSlots } from '../sim/economy';
import type { PlacedBuildingExt } from '../sim/buildings';

export function ResourceBar() {
  const { state } = useGame();
  const era = getEraDef(state.currentEra);
  return (
    <View style={styles.resourceBar}>
      <Text style={styles.brand}>ToBeAScout</Text>
      <Text style={styles.res}>Legna {Math.floor(state.resources.legna)}</Text>
      <Text style={styles.res}>Acqua {Math.floor(state.resources.acqua)}</Text>
      <Text style={styles.res}>Impegno {Math.floor(state.resources.impegno)}</Text>
      <Text style={styles.era}>{era.name}</Text>
      {state.totem ? <Text style={styles.totem}>Totem: {state.totem}</Text> : null}
    </View>
  );
}

export function BuildPanel() {
  const { state, placementBuilding, setPlacementBuilding } = useGame();
  const builders = freeBuilderSlots(state, Date.now());
  const unlocked = BUILDINGS.filter(
    (b) => b.id !== 'qg' && isBuildingUnlocked(state, b.id),
  );

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Costruisci · costruttori liberi: {builders}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {unlocked.map((b) => {
          const cost = b.levels[0].buildCost;
          const active = placementBuilding === b.id;
          return (
            <Pressable
              key={b.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setPlacementBuilding(active ? null : b.id)}
            >
              <Text style={styles.chipTitle}>{b.name}</Text>
              <Text style={styles.chipSub}>
                {cost.legna}L {cost.acqua}A
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {placementBuilding ? (
        <Text style={styles.hint}>Tocca la mappa per piazzare</Text>
      ) : null}
    </View>
  );
}

export function SelectedBuildingPanel() {
  const { state, selectedBuildingId, upgrade, collect } = useGame();
  if (!selectedBuildingId) return null;
  const b = state.buildings.find((x) => x.instanceId === selectedBuildingId) as
    | PlacedBuildingExt
    | undefined;
  if (!b) return null;
  const def = getBuildingDef(b.buildingId);
  const busy = !!(b.buildEndsAt && b.buildEndsAt > Date.now());

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>
        {def.name} · Lv {b.level}
        {busy ? ' (in corso…)' : ''}
      </Text>
      {def.produces ? (
        <Text style={styles.hint}>
          Magazzino: {Math.floor(b.stored)} {def.produces.resource}
        </Text>
      ) : null}
      <View style={styles.row}>
        {def.produces ? (
          <Pressable style={styles.btn} onPress={() => collect(b.instanceId)}>
            <Text style={styles.btnText}>Raccogli</Text>
          </Pressable>
        ) : null}
        {b.level < def.maxLevel ? (
          <Pressable style={styles.btn} onPress={() => upgrade(b.instanceId)} disabled={busy}>
            <Text style={styles.btnText}>Upgrade</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function TrainPanel() {
  const { state, train } = useGame();
  const used = armyHousingUsed(state.army);
  const cap = armyCampCapacity(state);
  const unlocked = TROOPS.filter((t) => isTroopUnlocked(state, t.id));

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>
        Addestra · esercito {used}/{cap}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {unlocked.map((t) => (
          <Pressable key={t.id} style={styles.chip} onPress={() => train(t.id)}>
            <Text style={styles.chipTitle}>{t.name}</Text>
            <Text style={styles.chipSub}>
              {t.trainCost.legna}L · {t.housing} posti · {t.trainTimeSec}s
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal style={{ marginTop: 6 }}>
        {state.army.map((u) => {
          const t = TROOPS.find((x) => x.id === u.troopId);
          return (
            <Text key={u.troopId} style={styles.armyItem}>
              {t?.name ?? u.troopId} ×{u.count}
            </Text>
          );
        })}
        {state.trainingQueue.length > 0 ? (
          <Text style={styles.armyItem}>In coda: {state.trainingQueue.length}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function EraStrip() {
  const { state } = useGame();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eraStrip}>
      {ERAS.map((e) => {
        const on = state.unlockedEras.includes(e.id);
        const current = state.currentEra === e.id;
        return (
          <View
            key={e.id}
            style={[styles.eraChip, on && styles.eraOn, current && styles.eraCurrent]}
          >
            <Text style={styles.eraChipText}>{e.name}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  resourceBar: {
    backgroundColor: 'rgba(20,40,24,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  brand: {
    color: '#E8F5E9',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  res: { color: '#C8E6C9', fontSize: 13 },
  era: { color: '#FFF59D', fontSize: 12, marginTop: 2 },
  totem: { color: '#FFE082', fontSize: 12 },
  panel: {
    backgroundColor: 'rgba(15,30,18,0.94)',
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#4CAF50',
  },
  panelTitle: { color: '#E8F5E9', fontWeight: '700', marginBottom: 6, fontSize: 13 },
  chip: {
    backgroundColor: '#2E4A32',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 110,
  },
  chipActive: { backgroundColor: '#558B2F', borderWidth: 1, borderColor: '#DCEDC8' },
  chipTitle: { color: '#F1F8E9', fontWeight: '700', fontSize: 12 },
  chipSub: { color: '#A5D6A7', fontSize: 11, marginTop: 2 },
  hint: { color: '#FFF59D', fontSize: 12, marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: {
    backgroundColor: '#33691E',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnText: { color: '#F1F8E9', fontWeight: '700' },
  armyItem: {
    color: '#C8E6C9',
    marginRight: 12,
    fontSize: 12,
  },
  eraStrip: { maxHeight: 36, marginVertical: 4, paddingHorizontal: 8 },
  eraChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#263238',
    marginRight: 6,
  },
  eraOn: { backgroundColor: '#37474F' },
  eraCurrent: { backgroundColor: '#2E7D32' },
  eraChipText: { color: '#ECEFF1', fontSize: 11, fontWeight: '600' },
});
