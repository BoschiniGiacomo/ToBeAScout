import type { ArmyUnit, GameState, TrainingJob } from './types';
import { ERAS, getBuildingDef, getBuildingLevel, getTroopDef } from './content';
import { canAfford, spend } from './economy';

export function isTroopUnlocked(state: GameState, troopId: string): boolean {
  for (const eraId of state.unlockedEras) {
    const era = ERAS.find((e) => e.id === eraId);
    if (era?.unlocksTroops.includes(troopId)) return true;
  }
  return false;
}

export function armyHousingUsed(army: ArmyUnit[]): number {
  return army.reduce((sum, u) => {
    const def = getTroopDef(u.troopId);
    return sum + def.housing * u.count;
  }, 0);
}

export function armyCampCapacity(state: GameState, now = Date.now()): number {
  return state.buildings.reduce((sum, b) => {
    if (b.buildingId !== 'tenda_squadriglia') return sum;
    if (b.buildEndsAt && b.buildEndsAt > now) return sum;
    const def = getBuildingDef(b.buildingId);
    const lvl = getBuildingLevel(def, b.level);
    return sum + (lvl.capacity ?? 0);
  }, 0);
}

export function barracksQueueSlots(
  state: GameState,
  barracksInstanceId: string,
  now = Date.now(),
): number {
  const b = state.buildings.find((x) => x.instanceId === barracksInstanceId);
  if (!b) return 0;
  if (b.buildEndsAt && b.buildEndsAt > now) return 0;
  const def = getBuildingDef(b.buildingId);
  if (def.category !== 'barracks') return 0;
  const lvl = getBuildingLevel(def, b.level);
  return lvl.queueSlots ?? 1;
}

export function findBarracksForTroop(
  state: GameState,
  troopId: string,
  now = Date.now(),
): string | null {
  const troop = getTroopDef(troopId);
  const candidates = state.buildings.filter((b) => {
    if (b.buildingId !== troop.barracks) return false;
    if (b.buildEndsAt && b.buildEndsAt > now) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  // Pick barracks with fewest jobs
  let best = candidates[0];
  let bestCount = state.trainingQueue.filter((j) => j.barracksInstanceId === best.instanceId)
    .length;
  for (const c of candidates.slice(1)) {
    const count = state.trainingQueue.filter((j) => j.barracksInstanceId === c.instanceId).length;
    if (count < bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best.instanceId;
}

export function enqueueTraining(
  state: GameState,
  troopId: string,
  now = Date.now(),
): { state: GameState; error?: string } {
  if (!isTroopUnlocked(state, troopId)) {
    return { state, error: 'Specialità non sbloccata' };
  }
  const troop = getTroopDef(troopId);
  const barracksId = findBarracksForTroop(state, troopId, now);
  if (!barracksId) {
    return { state, error: `Serve ${troop.barracks} attiva` };
  }
  const slots = barracksQueueSlots(state, barracksId, now);
  const inQueue = state.trainingQueue.filter((j) => j.barracksInstanceId === barracksId).length;
  if (inQueue >= slots) return { state, error: 'Coda tenda piena' };

  const used = armyHousingUsed(state.army);
  const queuedHousing = state.trainingQueue.reduce((s, j) => s + getTroopDef(j.troopId).housing, 0);
  const cap = armyCampCapacity(state, now);
  if (used + queuedHousing + troop.housing > cap) {
    return { state, error: 'Tende di squadriglia piene' };
  }
  if (!canAfford(state.resources, troop.trainCost)) {
    return { state, error: 'Risorse insufficienti' };
  }

  const sameBarracks = state.trainingQueue.filter((j) => j.barracksInstanceId === barracksId);
  const lastEnd = sameBarracks.reduce((m, j) => Math.max(m, j.endsAt), now);
  const start = Math.max(now, lastEnd);
  const job: TrainingJob = {
    troopId,
    endsAt: start + troop.trainTimeSec * 1000,
    barracksInstanceId: barracksId,
  };

  return {
    state: {
      ...state,
      resources: spend(state.resources, troop.trainCost),
      trainingQueue: [...state.trainingQueue, job],
    },
  };
}

export function completeTraining(state: GameState, now: number): GameState {
  const done = state.trainingQueue.filter((j) => j.endsAt <= now);
  const remaining = state.trainingQueue.filter((j) => j.endsAt > now);
  if (done.length === 0) return state;

  const army = [...state.army];
  for (const job of done) {
    const idx = army.findIndex((u) => u.troopId === job.troopId);
    if (idx >= 0) army[idx] = { ...army[idx], count: army[idx].count + 1 };
    else army.push({ troopId: job.troopId, count: 1 });
  }
  return { ...state, trainingQueue: remaining, army };
}

export function clearArmy(state: GameState): GameState {
  return { ...state, army: [] };
}

export function consumeArmy(state: GameState, used: ArmyUnit[]): GameState {
  const map = new Map(state.army.map((u) => [u.troopId, u.count]));
  for (const u of used) {
    map.set(u.troopId, Math.max(0, (map.get(u.troopId) ?? 0) - u.count));
  }
  const army: ArmyUnit[] = [];
  for (const [troopId, count] of map) {
    if (count > 0) army.push({ troopId, count });
  }
  return { ...state, army };
}
