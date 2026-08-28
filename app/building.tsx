import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../src/ui/GameContext';
import { getBuildingDef, getBuildingLevel } from '../src/sim/content';
import { formatResourceAmount } from '../src/sim/economy';
import { resolveBuildingSprite } from '../src/render/assets';

export default function BuildingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, upgrade, collect } = useGame();

  const building = id
    ? state.buildings.find((b) => b.instanceId === id)
    : undefined;

  useEffect(() => {
    if (!id || !building) router.replace('/');
  }, [id, building]);

  if (!building) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Edificio non trovato</Text>
      </View>
    );
  }

  const def = getBuildingDef(building.buildingId);
  const levelDef = getBuildingLevel(def, building.level);
  const nextLevel =
    building.level < def.maxLevel ? getBuildingLevel(def, building.level + 1) : null;
  const busy = !!(building.buildEndsAt && building.buildEndsAt > Date.now());
  const sprite = resolveBuildingSprite(def.spriteKey, building.level);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Chiudi">
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>{def.name}</Text>
        <View style={styles.backSpacer} />
      </View>

      <View style={styles.body}>
        {sprite ? (
          <Image source={sprite} style={styles.sprite} resizeMode="contain" />
        ) : (
          <View style={[styles.spriteFallback, { backgroundColor: def.color }]} />
        )}

        <Text style={styles.level}>Livello {building.level}</Text>
        <Text style={styles.meta}>HP {levelDef.hp}</Text>

        {def.produces ? (
          <Text style={styles.meta}>
            Magazzino: {Math.floor(building.stored ?? 0)} /{' '}
            {def.produces.capacity[building.level - 1] ?? def.produces.capacity[0]}{' '}
            {def.produces.resource}
          </Text>
        ) : null}

        {busy ? <Text style={styles.busy}>Costruzione / upgrade in corso…</Text> : null}

        {nextLevel ? (
          <Text style={styles.cost}>
            Prossimo livello: {formatResourceAmount(nextLevel.buildCost.legna)} legna ·{' '}
            {formatResourceAmount(nextLevel.buildCost.acqua)} acqua
          </Text>
        ) : null}

        <View style={styles.actions}>
          {def.produces ? (
            <Pressable style={styles.btn} onPress={() => collect(building.instanceId)}>
              <Text style={styles.btnText}>Raccogli</Text>
            </Pressable>
          ) : null}
          {building.level < def.maxLevel ? (
            <Pressable
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={() => upgrade(building.instanceId)}
              disabled={busy}
            >
              <Text style={styles.btnText}>Upgrade</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B4332' },
  center: {
    flex: 1,
    backgroundColor: '#1B4332',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { color: '#A5D6A7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#4CAF50',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { color: '#E8F5E9', fontSize: 24, fontWeight: '700' },
  backSpacer: { width: 44 },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#FFF59D',
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  sprite: { width: 160, height: 160 },
  spriteFallback: { width: 120, height: 120, borderRadius: 12 },
  level: { color: '#E8F5E9', fontSize: 20, fontWeight: '800' },
  meta: { color: '#C8E6C9', fontSize: 14 },
  busy: { color: '#FFE082', fontSize: 13, marginTop: 4 },
  cost: { color: '#A5D6A7', fontSize: 12, textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: {
    backgroundColor: '#33691E',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#F1F8E9', fontWeight: '800', fontSize: 15 },
});
