import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../src/ui/GameContext';
import { IsometricWorld } from '../src/render/IsometricWorld';
import { getMissionDef, getTroopDef } from '../src/sim/content';

export default function MissionCombatScreen() {
  const { state, combat, deploy, autoDeploy, finishCombat } = useGame();
  const { width, height } = useWindowDimensions();
  const [selectedTroop, setSelectedTroop] = useState<string | null>(null);
  const sideW = Math.min(300, Math.max(220, width * 0.32));
  const mapW = width - sideW;

  useEffect(() => {
    if (!combat) router.replace('/missions');
  }, [combat]);

  useEffect(() => {
    if (combat?.finished) {
      const t = setTimeout(() => {
        finishCombat();
        router.replace('/missions');
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [combat?.finished, finishCombat]);

  if (!combat) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Nessuna missione attiva</Text>
      </View>
    );
  }

  const mission = getMissionDef(combat.missionId);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.row}>
        <IsometricWorld
          state={state}
          width={mapW}
          height={height}
          mode="combat"
          combat={combat}
          onTapTile={(gx, gy) => {
            if (selectedTroop) deploy(selectedTroop, gx, gy);
          }}
        />

        <View style={[styles.side, { width: sideW }]}>
          <ScrollView contentContainerStyle={styles.sideContent}>
            <Text style={styles.title}>{mission.name}</Text>
            <Text style={styles.meta}>
              {Math.ceil(combat.timeLeft)}s · {combat.destroyPct.toFixed(0)}% · {combat.stars}★
            </Text>
            {combat.finished ? (
              <Text style={styles.result}>
                {combat.victory ? `Vittoria ${combat.stars}★` : 'Sconfitta'}
              </Text>
            ) : null}

            <Text style={styles.hint}>Tocca la mappa per schierare</Text>

            {combat.deployRemaining.map((u) => {
              const t = getTroopDef(u.troopId);
              const active = selectedTroop === u.troopId;
              return (
                <Pressable
                  key={u.troopId}
                  style={[styles.troop, active && styles.troopActive]}
                  onPress={() => setSelectedTroop(u.troopId)}
                >
                  <Text style={styles.troopText}>
                    {t.name} ×{u.count}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable style={styles.btn} onPress={autoDeploy}>
              <Text style={styles.btnText}>Schiera tutto</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.secondary]}
              onPress={() => {
                finishCombat();
                router.replace('/missions');
              }}
            >
              <Text style={styles.btnText}>Ritirata</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B4332' },
  row: { flex: 1, flexDirection: 'row' },
  side: {
    backgroundColor: 'rgba(10,20,12,0.96)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#4CAF50',
  },
  sideContent: { padding: 12, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1B4332' },
  text: { color: '#C8E6C9' },
  title: { color: '#E8F5E9', fontSize: 16, fontWeight: '800' },
  meta: { color: '#A5D6A7', marginBottom: 4 },
  result: { color: '#FFE082', fontWeight: '800', fontSize: 15 },
  hint: { color: '#DCEDC8', fontSize: 12, marginTop: 4 },
  troop: {
    backgroundColor: '#2E4A32',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  troopActive: { backgroundColor: '#558B2F', borderWidth: 1, borderColor: '#DCEDC8' },
  troopText: { color: '#F1F8E9', fontWeight: '700' },
  btn: {
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondary: { backgroundColor: '#5D4037' },
  btnText: { color: '#FFF', fontWeight: '800' },
});
