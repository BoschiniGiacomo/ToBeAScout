import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { setStatusBarHidden } from 'expo-status-bar';

/**
 * Hide status bar + Android nav bar when possible.
 * With edge-to-edge (Expo SDK 54+), position/behavior/background APIs are unsupported —
 * only setVisibilityAsync works.
 */
export async function enterImmersiveMode(): Promise<void> {
  setStatusBarHidden(true, 'none');
  if (Platform.OS !== 'android') return;
  try {
    await NavigationBar.setVisibilityAsync('hidden');
  } catch {
    // Gesture nav / Expo Go may ignore this
  }
}

/** Keep system bars hidden while the game is active. */
export function useImmersiveMode(): void {
  useEffect(() => {
    void enterImmersiveMode();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void enterImmersiveMode();
    });

    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const visSub = NavigationBar.addVisibilityListener(({ visibility }) => {
      if (visibility !== 'visible') return;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        void enterImmersiveMode();
      }, 2500);
    });

    return () => {
      appSub.remove();
      visSub.remove();
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);
}
