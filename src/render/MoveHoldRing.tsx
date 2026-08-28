import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue } from 'react-native-reanimated';

const SIZE = 64;
const R = 26;

type Props = {
  x: number;
  y: number;
  progress: SharedValue<number>;
};

/** CoC-style circular hold indicator while preparing to move a building. */
export function MoveHoldRing({ x, y, progress }: Props) {
  const arc = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const sweep = Math.max(0.5, progress.value * 360);
    p.addArc(Skia.XYWHRect(SIZE / 2 - R, SIZE / 2 - R, R * 2, R * 2), -90, sweep);
    return p;
  });

  return (
    <View
      style={[styles.wrap, { left: x - SIZE / 2, top: y - SIZE / 2 }]}
      pointerEvents="none"
    >
      <Canvas style={styles.canvas}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          color="rgba(255,255,255,0.22)"
          style="stroke"
          strokeWidth={4}
        />
        <Path
          path={arc}
          style="stroke"
          strokeWidth={4}
          color="#FFF59D"
          strokeCap="round"
        />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    zIndex: 70,
  },
  canvas: {
    width: SIZE,
    height: SIZE,
  },
});
