import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { setStatusBarHidden } from 'expo-status-bar';

/** Hide Android nav buttons + status bar (immersive). No-op on iOS/web. */
export async function enterImmersiveMode(): Promise<void> {
  setStatusBarHidden(true, 'none');
  if (Platform.OS !== 'android') return;
  try {
    await NavigationBar.setPositionAsync('absolute');
    await NavigationBar.setVisibilityAsync('hidden');
    await NavigationBar.setBehaviorAsync('overlay-swipe');
    await NavigationBar.setBackgroundColorAsync('#00000000');
  } catch {
    // Some devices / gesture nav / edge-to-edge reject parts of the API
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
