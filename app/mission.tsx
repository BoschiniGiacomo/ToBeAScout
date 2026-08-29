import React, { useEffect, useState } from 'react';
import {
  Image,
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
import { resolveTroopSprite } from '../src/render/assets';
import { getPlayerTroopLevel } from '../src/sim/troopUpgrades';

export default function MissionCombatScreen() {
  const { state, combat, deploy, autoDeploy, finishCombat } = useGame();
  const { width, height } = useWindowDimensions();
  const [selectedTroop, setSelectedTroop] = useState<string | null>(null);
  const bottomH = Math.max(88, Math.min(110, height * 0.28));
  const mapH = Math.max(120, height - bottomH);

  useEffect(() => {
    if (!combat) router.replace('/missions');
  }, [combat]);

  useEffect(() => {
    if (!combat || combat.finished) return;
    if (selectedTroop && combat.deployRemaining.some((u) => u.troopId === selectedTroop && u.count > 0)) {
      return;
    }
    const first = combat.deployRemaining.find((u) => u.count > 0);
    setSelectedTroop(first?.troopId ?? null);
  }, [combat, selectedTroop]);

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
  const remaining = combat.deployRemaining.filter((u) => u.count > 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.wrap}>
        <View style={[styles.mapWrap, { height: mapH }]}>
          <IsometricWorld
            state={state}
            width={width}
            height={mapH}
            mode="combat"
            combat={combat}
            onTapTile={(gx, gy) => {
              if (selectedTroop) deploy(selectedTroop, gx, gy);
            }}
          />

          <View style={styles.topHud} pointerEvents="box-none">
            <View style={styles.topTitle}>
              <Text style={styles.title} numberOfLines={1}>
                {mission.name}
              </Text>
              <Text style={styles.meta}>
                {Math.ceil(combat.timeLeft)}s · {combat.stars}★
              </Text>
            </View>
            {combat.finished ? (
              <Text style={styles.result}>
                {combat.victory ? `Vittoria ${combat.stars}★` : 'Sconfitta'}
              </Text>
            ) : (
              <Text style={styles.hint}>Tocca la mappa per schierare</Text>
            )}
          </View>

          <View style={styles.aboveTroops} pointerEvents="box-none">
            <Pressable
              style={styles.retreatBtn}
              onPress={() => {
                finishCombat();
                router.replace('/missions');
              }}
            >
              <Text style={styles.retreatText}>Ritirata</Text>
            </Pressable>

            <View style={styles.aboveRight}>
              <Text style={styles.damageText}>{combat.destroyPct.toFixed(0)}%</Text>
              {!combat.finished && remaining.length > 0 ? (
                <Pressable style={styles.autoBtn} onPress={autoDeploy}>
                  <Text style={styles.autoText}>Schiera tutto</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={[styles.troopBar, { height: bottomH }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.troopRow}
          >
            {remaining.length === 0 ? (
              <Text style={styles.emptyTroops}>Nessuna unità da schierare</Text>
            ) : (
              remaining.map((u) => {
                const t = getTroopDef(u.troopId);
                const level = getPlayerTroopLevel(state, u.troopId);
                const sprite = resolveTroopSprite(t.spriteKey, level);
                const active = selectedTroop === u.troopId;
                return (
                  <Pressable
                    key={u.troopId}
                    style={[styles.troopCard, active && styles.troopCardActive]}
                    onPress={() => setSelectedTroop(u.troopId)}
                  >
                    <View style={[styles.countBadge, active && styles.countBadgeActive]}>
                      <Text style={styles.countText}>×{u.count}</Text>
                    </View>
                    {sprite ? (
                      <Image source={sprite} style={styles.troopSprite} resizeMode="contain" />
                    ) : (
                      <Text style={styles.troopNameFallback} numberOfLines={2}>
                        {t.name}
                      </Text>
                    )}
                    {sprite ? (
                      <Text style={styles.troopName} numberOfLines={1}>
                        {t.name}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B4332' },
  wrap: { flex: 1 },
  mapWrap: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B4332',
  },
  text: { color: '#C8E6C9' },
  topHud: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    gap: 4,
  },
  topTitle: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '70%',
  },
  title: { color: '#E8F5E9', fontSize: 15, fontWeight: '800' },
  meta: { color: '#A5D6A7', fontSize: 12, fontWeight: '700', marginTop: 2 },
  hint: {
    alignSelf: 'flex-start',
    color: '#DCEDC8',
    fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  result: {
    alignSelf: 'flex-start',
    color: '#FFE082',
    fontWeight: '800',
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  aboveTroops: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  retreatBtn: {
    backgroundColor: 'rgba(93,64,55,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  retreatText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  aboveRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  damageText: {
    color: '#FFE082',
    fontWeight: '900',
    fontSize: 18,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  autoBtn: {
    backgroundColor: 'rgba(46,125,50,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  autoText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  troopBar: {
    backgroundColor: 'rgba(10,20,12,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#4CAF50',
    justifyContent: 'center',
  },
  troopRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 10,
    alignItems: 'center',
    flexGrow: 1,
  },
  emptyTroops: { color: '#A5D6A7', fontSize: 12, alignSelf: 'center' },
  troopCard: {
    width: 78,
    height: 72,
    backgroundColor: '#2E4A32',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#3E5C42',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  troopCardActive: {
    backgroundColor: '#558B2F',
    borderColor: '#DCEDC8',
  },
  countBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 26,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    zIndex: 2,
  },
  countBadgeActive: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: '#FFF59D',
  },
  countText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  troopSprite: { width: 44, height: 44 },
  troopName: {
    color: '#E8F5E9',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 2,
  },
  troopNameFallback: {
    color: '#F1F8E9',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
});
