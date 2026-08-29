import React, { useEffect } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../src/ui/GameContext';
import { getBuildingDef, getBuildingLevel } from '../src/sim/content';
import { formatResourceAmount } from '../src/sim/economy';
import { resolveBuildingSprite } from '../src/render/assets';

export default function BuildingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, upgrade, collect } = useGame();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

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
  const spriteSize = landscape ? Math.min(140, height * 0.45) : Math.min(160, width * 0.4);

  const art = sprite ? (
    <Image
      source={sprite}
      style={{ width: spriteSize, height: spriteSize }}
      resizeMode="contain"
    />
  ) : (
    <View
      style={[
        styles.spriteFallback,
        { width: spriteSize * 0.75, height: spriteSize * 0.75, backgroundColor: def.color },
      ]}
    />
  );

  const details = (
    <>
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

      <View style={[styles.actions, landscape && styles.actionsLandscape]}>
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
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Chiudi">
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {def.name}
        </Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          landscape ? styles.scrollLandscape : styles.scrollPortrait,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {landscape ? (
          <>
            <View style={styles.artCol}>{art}</View>
            <View style={styles.infoCol}>{details}</View>
          </>
        ) : (
          <View style={styles.portraitStack}>
            {art}
            {details}
          </View>
        )}
      </ScrollView>
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#4CAF50',
  },
  backBtn: {
    width: 44,
    height: 40,
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
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scrollPortrait: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 24,
  },
  portraitStack: {
    alignItems: 'center',
    gap: 8,
    maxWidth: 420,
  },
  artCol: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    minWidth: 200,
    maxWidth: 360,
    gap: 6,
    justifyContent: 'center',
  },
  spriteFallback: { borderRadius: 12 },
  level: { color: '#E8F5E9', fontSize: 18, fontWeight: '800' },
  meta: { color: '#C8E6C9', fontSize: 13 },
  busy: { color: '#FFE082', fontSize: 12, marginTop: 2 },
  cost: { color: '#A5D6A7', fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  actionsLandscape: { marginTop: 8 },
  btn: {
    backgroundColor: '#33691E',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 110,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#F1F8E9', fontWeight: '800', fontSize: 14 },
});
