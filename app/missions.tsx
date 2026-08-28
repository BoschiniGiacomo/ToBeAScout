import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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
import { formatResourceAmount } from '../src/sim/economy';

export default function MissionsScreen() {
  const { width } = useWindowDimensions();
  const { state, startMission, message } = useGame();
  const unlocked = availableMissions(state);
  const progress = eraProgressSummary(state);
  const housing = armyHousingUsed(state.army);
  const complete = isCampaignComplete(state);
  const cardW = Math.floor((width - 12 * 2 - 10) / 2);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header strip — stile tab shop */}
      <View style={styles.topStrip}>
        <Link href="/" asChild>
          <Pressable style={styles.backBtn} accessibilityLabel="Torna al campo">
            <Text style={styles.back}>←</Text>
          </Pressable>
        </Link>
        <Text style={styles.topTitle}>Missioni AGESCI</Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={styles.sub}>
          Esercito {housing} posti · Era {getEraDef(state.currentEra).name}
        </Text>
        {complete ? (
          <Text style={styles.win}>Campagna completata — Brevetto di Capo!</Text>
        ) : null}

        <ScrollView
          horizontal
          style={styles.eraRow}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.eraRowContent}
        >
          {progress.map((p) => {
            const active = p.era.id === state.currentEra;
            return (
              <View
                key={p.era.id}
                style={[
                  styles.eraChip,
                  p.unlocked && styles.eraChipOn,
                  active && styles.eraChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.eraChipText,
                    p.unlocked && styles.eraChipTextOn,
                    active && styles.eraChipTextActive,
                  ]}
                >
                  {p.era.name}: {p.done}/{p.total}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {message ? <Text style={styles.msg}>{message}</Text> : null}

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {MISSIONS.map((m) => {
              const open = isMissionUnlocked(state, m.id);
              const stars = getMissionStars(state, m.id);
              const check = canStartMission(state, m.id);
              const canGo = open && check.ok;
              return (
                <View
                  key={m.id}
                  style={[
                    styles.card,
                    { width: cardW },
                    !open && styles.cardLocked,
                    canGo && styles.cardReady,
                  ]}
                >
                  <Text style={styles.cardName} numberOfLines={2}>
                    {m.name}
                    {stars > 0 ? ` ${'★'.repeat(stars)}` : ''}
                  </Text>

                  <View style={styles.cardBody}>
                    <Text style={styles.cardMeta}>
                      {getEraDef(m.era).name} · diff. {m.difficulty}/5 · ~{m.durationHintMin}{' '}
                      min
                    </Text>
                    <Text style={styles.cardMeta}>Serve {m.requiredHousing} posti esercito</Text>
                    <Text style={styles.cardDesc} numberOfLines={3}>
                      {m.description}
                    </Text>
                    <Text style={styles.reward}>
                      {formatResourceAmount(m.rewards.legna)}L ·{' '}
                      {formatResourceAmount(m.rewards.acqua)}A · {m.rewards.impegno} Imp
                      {m.totemReward ? ` · Totem ${m.totemReward}` : ''}
                    </Text>
                  </View>

                  <View style={styles.cardFooter}>
                    <Pressable
                      style={[styles.goBtn, !canGo && styles.goBtnDisabled]}
                      disabled={!open}
                      onPress={() => {
                        const combat = startMission(m.id);
                        if (combat) router.push('/mission');
                      }}
                    >
                      <Text style={styles.goText} numberOfLines={2}>
                        {!open ? 'Bloccata' : !check.ok ? check.reason : 'Parti →'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          {unlocked.length === 0 ? (
            <Text style={styles.empty}>Potenzia il QG e completa le missioni precedenti.</Text>
          ) : null}
        </ScrollView>
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>Esercito {housing} posti</Text>
        </View>
        <Link href="/" asChild>
          <Pressable style={styles.statusPill}>
            <Text style={styles.statusText}>← Campo</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#2A2A2A',
  },
  topStrip: {
    backgroundColor: '#E8DCC8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#A89070',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: '#3A3A3A',
    borderWidth: 2,
    borderColor: '#F9A825',
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { color: '#FFE082', fontWeight: '900', fontSize: 18 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#4E342E',
    fontSize: 18,
    fontWeight: '900',
  },
  topSpacer: { width: 34 },
  body: {
    flex: 1,
    backgroundColor: '#2F2F2F',
    paddingTop: 6,
  },
  sub: {
    textAlign: 'center',
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  win: {
    textAlign: 'center',
    color: '#FFE082',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 4,
  },
  eraRow: {
    maxHeight: 36,
    marginBottom: 6,
  },
  eraRowContent: {
    paddingHorizontal: 10,
    gap: 6,
    alignItems: 'center',
  },
  eraChip: {
    backgroundColor: '#C4B59A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#8D7B5E',
  },
  eraChipOn: {
    backgroundColor: '#3A3A3A',
    borderColor: '#6D5A45',
  },
  eraChipActive: {
    borderColor: '#F9A825',
    borderWidth: 2,
  },
  eraChipText: {
    color: '#4E342E',
    fontSize: 11,
    fontWeight: '800',
  },
  eraChipTextOn: {
    color: '#ECEFF1',
  },
  eraChipTextActive: {
    color: '#FFF8E1',
  },
  msg: {
    color: '#FFF59D',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingBottom: 10 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#5BA3D9',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2E6FA0',
    minHeight: 200,
    flexDirection: 'column',
  },
  cardReady: {
    borderColor: '#FFF59D',
  },
  cardLocked: {
    backgroundColor: '#4A6B82',
    borderColor: '#5A6A78',
  },
  cardName: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 3,
  },
  cardMeta: {
    color: '#E3F2FD',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  cardDesc: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  reward: {
    color: '#FFE082',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  cardFooter: {
    backgroundColor: 'rgba(20,20,20,0.88)',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.25)',
  },
  goBtn: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1B5E20',
  },
  goBtnDisabled: {
    backgroundColor: '#455A64',
    borderColor: '#37474F',
  },
  goText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },
  empty: {
    color: '#B0BEC5',
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '700',
  },
  bottomBar: {
    backgroundColor: '#7A8F3A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: '#5D6F2A',
  },
  statusPill: {
    backgroundColor: '#3E4A1C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: { color: '#F1F8E9', fontWeight: '800', fontSize: 12 },
});
