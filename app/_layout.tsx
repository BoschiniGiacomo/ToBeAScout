import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GameProvider } from '../src/ui/GameContext';
import { installGlobalCrashHandlers } from '../src/debug/installGlobalHandlers';
import { CrashErrorBoundary, CrashLogOverlay } from '../src/debug/ErrorBoundary';
import { logCrash } from '../src/debug/crashLog';

installGlobalCrashHandlers();

export default function RootLayout() {
  useEffect(() => {
    void (async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        logCrash('action', 'lockOrientation', e);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <CrashErrorBoundary name="Root">
          <GameProvider>
            <StatusBar style="light" hidden />
            <View style={styles.root}>
              <Stack
                screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1B4332' } }}
              />
              <CrashLogOverlay />
            </View>
          </GameProvider>
        </CrashErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
