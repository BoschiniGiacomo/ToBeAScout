import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGame } from './GameContext';
import { getStorageCaps, formatResourceAmount } from '../sim/economy';
import type { ResourceId } from '../sim/types';

const BAR_WIDTH = 148;

const BARS: {
  id: ResourceId;
  name: string;
  fill: string;
  iconBg: string;
  icon: string;
}[] = [
  { id: 'legna', name: 'Legna', fill: '#E8B923', iconBg: '#C9A227', icon: 'L' },
  { id: 'acqua', name: 'Acqua', fill: '#4FC3F7', iconBg: '#0288D1', icon: 'A' },
  { id: 'impegno', name: 'Impegno', fill: '#AB47BC', iconBg: '#6A1B9A', icon: 'I' },
];

/** Clash-of-Clans style resource bars (top-right overlay). */
export function ResourceBarsHud() {
  const { state } = useGame();
  const caps = useMemo(() => getStorageCaps(state), [state]);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  const showName = (name: string) => {
    setHint(name);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1600);
  };

  return (
    <View style={styles.wrap}>
      {hint ? (
        <View style={styles.hintBubble}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      ) : null}
      {BARS.map((bar) => {
        const amount = Math.floor(state.resources[bar.id]);
        const max = Math.max(1, caps[bar.id]);
        const pct = Math.min(1, Math.max(0, amount / max));
        return (
          <Pressable
            key={bar.id}
            style={styles.row}
            onPress={() => showName(bar.name)}
            accessibilityRole="button"
            accessibilityLabel={bar.name}
          >
            <View style={styles.barShell}>
              <View
                style={[
                  styles.barFill,
                  { width: BAR_WIDTH * pct, backgroundColor: bar.fill },
                ]}
              />
              <Text style={styles.amount} numberOfLines={1}>
                {formatResourceAmount(amount)}
              </Text>
            </View>
            <View style={[styles.icon, { backgroundColor: bar.iconBg, borderColor: bar.fill }]}>
              <Text style={styles.iconText}>{bar.icon}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 50,
    gap: 6,
    alignItems: 'flex-end',
  },
  hintBubble: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 2,
  },
  hintText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barShell: {
    width: BAR_WIDTH,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(20, 20, 20, 0.82)',
    borderWidth: 1.5,
    borderColor: 'rgba(180, 180, 180, 0.45)',
    overflow: 'hidden',
    justifyContent: 'center',
    marginRight: -6,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 13,
    opacity: 0.92,
  },
  amount: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'right',
    paddingRight: 18,
    paddingLeft: 10,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 13,
  },
});
