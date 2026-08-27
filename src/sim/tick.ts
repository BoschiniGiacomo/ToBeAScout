import type { GameState } from './types';
import { applyCompletedConstruction, produceResources } from './buildings';
import { completeTraining } from './training';

/** Advance offline timers: builds, production, training. */
export function tick(state: GameState, now = Date.now()): GameState {
  let next = applyCompletedConstruction(state, now);
  next = completeTraining(next, now);
  next = produceResources(next, now);
  if (
    next === state ||
    (next.buildings === state.buildings &&
      next.trainingQueue === state.trainingQueue &&
      next.army === state.army &&
      next.resources === state.resources)
  ) {
    if (next.lastTickAt === now) return state;
    // Avoid useless re-renders when nothing gameplay-visible changed
    if (
      next.buildings === state.buildings &&
      next.trainingQueue === state.trainingQueue &&
      next.army === state.army &&
      next.resources === state.resources &&
      next.currentEra === state.currentEra
    ) {
      return state;
    }
  }
  return { ...next, lastTickAt: now };
}
