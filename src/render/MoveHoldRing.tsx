import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

const SIZE = 64;
const R = 26;

type Props = {
  x: number;
  y: number;
  progress: SharedValue<number>;
};

/** CoC-style hold ring — Reanimated only (no Skia Path; avoids native crash). */
export function MoveHoldRing({ x, y, progress }: Props) {
  const pulse = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, progress.value));
    return {
      opacity: 0.4 + t * 0.6,
      transform: [{ scale: 0.92 + t * 0.08 }],
    };
  });

  const arm = useAnimatedStyle(() => {
    const deg = progress.value * 360 - 90;
    return { transform: [{ rotate: `${deg}deg` }] };
  });

  return (
    <View
      style={[styles.wrap, { left: x - SIZE / 2, top: y - SIZE / 2 }]}
      pointerEvents="none"
    >
      <View style={styles.track} />
      <Animated.View style={[styles.arm, arm]}>
        <Animated.View style={[styles.head, pulse]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    zIndex: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    width: R * 2,
    height: R * 2,
    borderRadius: R,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  arm: {
    position: 'absolute',
    width: R * 2,
    height: R * 2,
    alignItems: 'center',
  },
  head: {
    width: 10,
    height: 10,
    marginTop: -2,
    borderRadius: 5,
    backgroundColor: '#FFF59D',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
});
