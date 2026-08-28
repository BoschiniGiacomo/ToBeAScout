import type { GameState } from './types';
import { applyCompletedConstruction, produceResources } from './buildings';
import { completeTraining } from './training';
import { completeTroopUpgrades } from './troopUpgrades';

/** Advance offline timers: builds, production, training. */
export function tick(state: GameState, now = Date.now()): GameState {
  const afterBuild = applyCompletedConstruction(state, now);
  const afterTrain = completeTraining(afterBuild, now);
  const afterTroopUp = completeTroopUpgrades(afterTrain, now);
  const afterProd = produceResources(afterTroopUp, now);

  const sameGameplay =
    afterProd.buildings === state.buildings &&
    afterProd.trainingQueue === state.trainingQueue &&
    afterProd.troopUpgrade === state.troopUpgrade &&
    afterProd.troopLevels === state.troopLevels &&
    afterProd.army === state.army &&
    afterProd.resources === state.resources &&
    afterProd.currentEra === state.currentEra &&
    afterProd.unlockedEras === state.unlockedEras;

  // Nothing visible changed → keep same object (no React re-render / no Skia redraw)
  if (sameGameplay) return state;

  return { ...afterProd, lastTickAt: now };
}
