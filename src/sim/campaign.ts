import type { EraId, GameState, MissionProgress } from './types';
import { ERAS, MISSIONS, getMissionDef } from './content';
import { addResources } from './economy';
import { armyHousingUsed } from './training';
import { resolveMissionRewards } from './combat';

export function getMissionStars(state: GameState, missionId: string): number {
  return state.missionProgress.find((m) => m.missionId === missionId)?.stars ?? 0;
}

export function isMissionUnlocked(state: GameState, missionId: string): boolean {
  const mission = getMissionDef(missionId);
  if (!state.unlockedEras.includes(mission.era)) return false;
  if (mission.requiresMission) {
    const prev = state.missionProgress.find((m) => m.missionId === mission.requiresMission);
    if (!prev?.completed) return false;
  }
  return true;
}

export function availableMissions(state: GameState) {
  return MISSIONS.filter((m) => isMissionUnlocked(state, m.id));
}

export function canStartMission(
  state: GameState,
  missionId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!isMissionUnlocked(state, missionId)) return { ok: false, reason: 'Missione bloccata' };
  const mission = getMissionDef(missionId);
  const housing = armyHousingUsed(state.army);
  if (housing < mission.requiredHousing) {
    return {
      ok: false,
      reason: `Servono almeno ${mission.requiredHousing} posti esercito (hai ${housing})`,
    };
  }
  if (state.army.length === 0) return { ok: false, reason: 'Esercito vuoto' };
  return { ok: true };
}

export function applyMissionResult(
  state: GameState,
  missionId: string,
  stars: number,
  victory: boolean,
): GameState {
  if (!victory || stars <= 0) {
    return { ...state, army: [] };
  }

  const { rewards, totemReward } = resolveMissionRewards(missionId, stars);
  const existing = state.missionProgress.find((m) => m.missionId === missionId);
  let missionProgress: MissionProgress[];
  if (existing) {
    missionProgress = state.missionProgress.map((m) =>
      m.missionId === missionId
        ? { ...m, stars: Math.max(m.stars, stars), completed: true }
        : m,
    );
  } else {
    missionProgress = [
      ...state.missionProgress,
      { missionId, stars, completed: true },
    ];
  }

  return {
    ...state,
    army: [],
    resources: addResources(state.resources, rewards),
    missionProgress,
    totem: totemReward ?? state.totem,
  };
}

export function eraProgressSummary(state: GameState) {
  return ERAS.map((era) => {
    const missions = MISSIONS.filter((m) => m.era === era.id);
    const done = missions.filter((m) =>
      state.missionProgress.some((p) => p.missionId === m.id && p.completed),
    ).length;
    return {
      era,
      unlocked: state.unlockedEras.includes(era.id as EraId),
      done,
      total: missions.length,
    };
  });
}

export function isCampaignComplete(state: GameState): boolean {
  return MISSIONS.every((m) =>
    state.missionProgress.some((p) => p.missionId === m.id && p.completed),
  );
}
