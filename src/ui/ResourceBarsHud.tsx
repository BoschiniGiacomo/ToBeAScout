import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGame } from './GameContext';
import {
  getStorageCaps,
  getHourlyProduction,
  formatResourceAmount,
} from '../sim/economy';
import type { ResourceId } from '../sim/types';

const BAR_WIDTH = 148;

const LEGNA_ICON = require('../../assets/ui/resource_legna.png');
const ACQUA_ICON = require('../../assets/ui/resource_acqua.png');
const IMPEGNO_ICON = require('../../assets/ui/resource_impegno.png');

const BARS: {
  id: ResourceId;
  name: string;
  fill: string;
  iconBg: string;
  icon?: string;
  iconSource?: number;
}[] = [
  {
    id: 'legna',
    name: 'Legna',
    fill: '#C4783A',
    iconBg: '#A65C2A',
    iconSource: LEGNA_ICON,
  },
  {
    id: 'acqua',
    name: 'Acqua',
    fill: '#4FC3F7',
    iconBg: '#0288D1',
    iconSource: ACQUA_ICON,
  },
  {
    id: 'impegno',
    name: 'Impegno',
    fill: '#AB47BC',
    iconBg: '#6A1B9A',
    iconSource: IMPEGNO_ICON,
  },
];

/** Clash-of-Clans style resource bars (top-right overlay). */
export function ResourceBarsHud() {
  const { state } = useGame();
  const caps = useMemo(() => getStorageCaps(state), [state]);
  const rates = useMemo(() => getHourlyProduction(state), [state]);
  const [hintId, setHintId] = useState<ResourceId | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  const showHint = (id: ResourceId) => {
    setHintId(id);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintId(null), 2800);
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          top: 8,
          right: 16,
        },
      ]}
    >
      {BARS.map((bar) => {
        const amount = Math.floor(state.resources[bar.id]);
        const max = Math.max(1, caps[bar.id]);
        const pct = Math.min(1, Math.max(0, amount / max));
        const open = hintId === bar.id;
        return (
          <View key={bar.id} style={styles.item}>
            <Pressable
              style={styles.row}
              onPress={() => showHint(bar.id)}
              accessibilityRole="button"
              accessibilityLabel={bar.name}
            >
              <View style={styles.barShell}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: BAR_WIDTH * pct, backgroundColor: bar.fill },
                    ]}
                  />
                </View>
                <Text style={styles.amount} numberOfLines={1}>
                  {formatResourceAmount(amount)}
                </Text>
                <View
                  style={[
                    styles.icon,
                    bar.iconSource
                      ? styles.iconImageWrap
                      : { backgroundColor: bar.iconBg, borderColor: bar.fill },
                  ]}
                >
                  {bar.iconSource ? (
                    <Image source={bar.iconSource} style={styles.iconImage} resizeMode="contain" />
                  ) : (
                    <Text style={styles.iconText}>{bar.icon}</Text>
                  )}
                </View>
              </View>
            </Pressable>
            {open ? (
              <View style={styles.vignette}>
                <Text style={styles.vignetteTitle}>{bar.name}</Text>
                <Text style={styles.vignetteLine}>
                  Max: {formatResourceAmount(max)}
                </Text>
                <Text style={styles.vignetteLine}>
                  Produzione oraria: {formatResourceAmount(Math.floor(rates[bar.id]))}/h
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 50,
    gap: 6,
    alignItems: 'flex-end',
  },
  item: {
    alignItems: 'flex-end',
  },
  vignette: {
    marginTop: 4,
    maxWidth: BAR_WIDTH + 20,
    backgroundColor: 'rgba(0,0,0,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  vignetteTitle: {
    color: '#FFF59D',
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 3,
  },
  vignetteLine: {
    color: '#E8F5E9',
    fontWeight: '700',
    fontSize: 11,
    marginTop: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barShell: {
    width: BAR_WIDTH,
    height: 26,
    justifyContent: 'center',
  },
  barTrack: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 13,
    backgroundColor: 'rgba(20, 20, 20, 0.82)',
    borderWidth: 1.5,
    borderColor: 'rgba(180, 180, 180, 0.45)',
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    right: 0,
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
    paddingRight: 36,
    paddingLeft: 10,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  icon: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconImageWrap: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
  },
  iconImage: {
    width: 34,
    height: 34,
  },
  iconText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 13,
  },
});
