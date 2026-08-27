import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../src/ui/GameContext';
import { MISSIONS, getEraDef } from '../src/sim/content';
import {
  availableMissions,
  canStartMission,
  eraProgressSummary,
  getMissionStars,
  isCampaignComplete,
  isMissionUnlocked,
} from '../src/sim/campaign';
import { armyHousingUsed } from '../src/sim/training';

export default function MissionsScreen() {
  const { state, startMission, message } = useGame();
  const unlocked = availableMissions(state);
  const progress = eraProgressSummary(state);
  const housing = armyHousingUsed(state.army);
  const complete = isCampaignComplete(state);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Link href="/" asChild>
          <Pressable>
            <Text style={styles.back}>← Campo</Text>
          </Pressable>
        </Link>
        <Text style={styles.title}>Missioni AGESCI</Text>
        <Text style={styles.sub}>Esercito: {housing} posti · Era {getEraDef(state.currentEra).name}</Text>
        {complete ? (
          <Text style={styles.win}>Campagna completata — Brevetto di Capo!</Text>
        ) : null}
      </View>

      <ScrollView horizontal style={styles.progressRow} showsHorizontalScrollIndicator={false}>
        {progress.map((p) => (
          <View key={p.era.id} style={[styles.progChip, p.unlocked && styles.progOn]}>
            <Text style={styles.progText}>
              {p.era.name}: {p.done}/{p.total}
            </Text>
          </View>
        ))}
      </ScrollView>

      {message ? <Text style={styles.msg}>{message}</Text> : null}

      <ScrollView contentContainerStyle={styles.list} horizontal={false}>
        <View style={styles.grid}>
        {MISSIONS.map((m) => {
          const open = isMissionUnlocked(state, m.id);
          const stars = getMissionStars(state, m.id);
          const check = canStartMission(state, m.id);
          return (
            <View key={m.id} style={[styles.card, !open && styles.cardLocked]}>
              <Text style={styles.cardTitle}>
                {m.name} {stars > 0 ? '★'.repeat(stars) : ''}
              </Text>
              <Text style={styles.cardMeta}>
                {getEraDef(m.era).name} · difficoltà {m.difficulty}/5 · ~{m.durationHintMin} min · serve{' '}
                {m.requiredHousing} posti
              </Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{m.description}</Text>
              <Text style={styles.reward}>
                Premio max: {m.rewards.legna}L / {m.rewards.acqua}A / {m.rewards.impegno} Imp
                {m.totemReward ? ` · Totem: ${m.totemReward}` : ''}
              </Text>
              <Pressable
                style={[styles.go, (!open || !check.ok) && styles.goDisabled]}
                disabled={!open}
                onPress={() => {
                  const combat = startMission(m.id);
                  if (combat) router.push('/mission');
                }}
              >
                <Text style={styles.goText}>
                  {!open ? 'Bloccata' : !check.ok ? check.reason : 'Parti'}
                </Text>
              </Pressable>
            </View>
          );
        })}
        </View>
        {unlocked.length === 0 ? (
          <Text style={styles.empty}>Potenzia il QG e completa le missioni precedenti.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B4332' },
  header: { padding: 14, gap: 4 },
  back: { color: '#A5D6A7', fontSize: 16, fontWeight: '700' },
  title: { color: '#E8F5E9', fontSize: 24, fontWeight: '800' },
  sub: { color: '#C8E6C9' },
  win: { color: '#FFE082', fontWeight: '800', marginTop: 6 },
  progressRow: { paddingHorizontal: 12, maxHeight: 44 },
  progChip: {
    backgroundColor: '#263238',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
  },
  progOn: { backgroundColor: '#33691E' },
  progText: { color: '#ECEFF1', fontSize: 12 },
  msg: { color: '#FFF59D', paddingHorizontal: 14, marginBottom: 6 },
  list: { padding: 12, paddingBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    backgroundColor: 'rgba(15,30,18,0.95)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2E7D32',
    width: '48%',
    minWidth: 280,
    flexGrow: 1,
  },
  cardLocked: { opacity: 0.55, borderColor: '#455A64' },
  cardTitle: { color: '#F1F8E9', fontWeight: '800', fontSize: 14 },
  cardMeta: { color: '#A5D6A7', fontSize: 11, marginTop: 4 },
  cardDesc: { color: '#DCEDC8', marginTop: 6, lineHeight: 16, fontSize: 12 },
  reward: { color: '#FFE082', fontSize: 11, marginTop: 6 },
  go: {
    marginTop: 8,
    backgroundColor: '#2E7D32',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  goDisabled: { backgroundColor: '#455A64' },
  goText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  empty: { color: '#B0BEC5', textAlign: 'center', marginTop: 20 },
});
