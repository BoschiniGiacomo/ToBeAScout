import type { GameState } from './types';
import { applyCompletedConstruction, produceResources } from './buildings';
import { completeTraining } from './training';

/** Advance offline timers: builds, production, training. */
export function tick(state: GameState, now = Date.now()): GameState {
  let next = applyCompletedConstruction(state, now);
  next = completeTraining(next, now);
  next = produceResources(next, now);
  return { ...next, lastTickAt: now };
}
