import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameState } from '../sim/types';
import { createInitialState } from '../sim/economy';
import { tick } from '../sim/tick';

const SAVE_KEY = 'tobeascout_save_v1';

export async function loadGame(): Promise<GameState> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed.version) return createInitialState();
    // Rename legacy building id
    for (const b of parsed.buildings ?? []) {
      if (b.buildingId === 'palisata') b.buildingId = 'sopraelevata';
    }
    if (!parsed.troopLevels) parsed.troopLevels = {};
    if (parsed.troopUpgrade === undefined) parsed.troopUpgrade = null;
    for (const job of parsed.trainingQueue ?? []) {
      if (job.level === undefined) job.level = parsed.troopLevels[job.troopId] ?? 1;
    }
    return tick(parsed, Date.now());
  } catch {
    return createInitialState();
  }
}

export async function saveGame(state: GameState): Promise<void> {
  await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export async function resetGame(): Promise<GameState> {
  const fresh = createInitialState();
  await saveGame(fresh);
  return fresh;
}
