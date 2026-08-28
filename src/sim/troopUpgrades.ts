import type { GameState } from './types';
import { getBuildingDef, getTroopDef, getTroopLevel } from './content';
import { canAfford, spend } from './economy';

export function getPlayerTroopLevel(state: GameState, troopId: string): number {
  return state.troopLevels[troopId] ?? 1;
}

/** Max troop level allowed by Maestro di Specialità (lab). 0 if no lab built. */
export function labTroopCap(state: GameState, now = Date.now()): number {
  let cap = 0;
  for (const b of state.buildings) {
    if (b.buildingId !== 'maestro_specialita') continue;
    if (b.buildEndsAt && b.buildEndsAt > now) continue;
    cap = Math.max(cap, b.level);
  }
  return cap;
}

export function canUpgradeTroop(
  state: GameState,
  troopId: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  const def = getTroopDef(troopId);
  const current = getPlayerTroopLevel(state, troopId);
  if (current >= def.maxLevel) return { ok: false, reason: 'Livello massimo' };

  const targetLevel = current + 1;
  const next = getTroopLevel(def, targetLevel);
  if (!state.unlockedEras.includes(next.unlockEra)) {
    return { ok: false, reason: `Richiede era ${next.unlockEra}` };
  }

  const labCap = labTroopCap(state, now);
  if (labCap < targetLevel) {
    return { ok: false, reason: 'Serve Maestro di Specialità di livello superiore' };
  }

  if (state.troopUpgrade) return { ok: false, reason: 'Upgrade truppa in corso' };

  if (!next.upgradeCost || !next.upgradeTimeSec) {
    return { ok: false, reason: 'Upgrade non disponibile' };
  }
  if (!canAfford(state.resources, next.upgradeCost)) {
    return { ok: false, reason: 'Risorse insufficienti' };
  }

  return { ok: true };
}

export function startTroopUpgrade(
  state: GameState,
  troopId: string,
  now = Date.now(),
): { state: GameState; error?: string } {
  const check = canUpgradeTroop(state, troopId, now);
  if (!check.ok) return { state, error: check.reason };

  const def = getTroopDef(troopId);
  const targetLevel = getPlayerTroopLevel(state, troopId) + 1;
  const next = getTroopLevel(def, targetLevel);

  return {
    state: {
      ...state,
      resources: spend(state.resources, next.upgradeCost!),
      troopUpgrade: {
        troopId,
        targetLevel,
        endsAt: now + next.upgradeTimeSec! * 1000,
      },
    },
  };
}

export function completeTroopUpgrades(state: GameState, now: number): GameState {
  const job = state.troopUpgrade;
  if (!job || job.endsAt > now) return state;

  return {
    ...state,
    troopLevels: { ...state.troopLevels, [job.troopId]: job.targetLevel },
    troopUpgrade: null,
  };
}
