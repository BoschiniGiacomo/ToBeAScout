import type { GameState, PlacedBuilding } from './types';
import { ERAS, META, getBuildingDef, getBuildingLevel } from './content';
import {
  assignBuilder,
  canAfford,
  freeBuilderSlots,
  nextId,
  spend,
  syncEraFromQg,
} from './economy';
import { tilesOverlap } from './iso';

export type PlacedBuildingExt = PlacedBuilding & { pendingUpgrade?: boolean };

export function isOccupied(
  state: GameState,
  x: number,
  y: number,
  w: number,
  h: number,
  ignoreId?: string,
): boolean {
  for (const b of state.buildings) {
    if (ignoreId && b.instanceId === ignoreId) continue;
    const def = getBuildingDef(b.buildingId);
    if (tilesOverlap(x, y, w, h, b.x, b.y, def.footprint.w, def.footprint.h)) return true;
  }
  return false;
}

export function isBuildingUnlocked(state: GameState, buildingId: string): boolean {
  if (buildingId === 'qg') return true;
  for (const eraId of state.unlockedEras) {
    const era = ERAS.find((e) => e.id === eraId);
    if (era?.unlocksBuildings.includes(buildingId)) return true;
  }
  return false;
}

export function canPlace(
  state: GameState,
  buildingId: string,
  x: number,
  y: number,
): { ok: true } | { ok: false; reason: string } {
  const def = getBuildingDef(buildingId);
  const { w, h } = def.footprint;
  if (x < 0 || y < 0 || x + w > META.gridSize || y + h > META.gridSize) {
    return { ok: false, reason: 'Fuori mappa' };
  }
  if (def.unique && state.buildings.some((b) => b.buildingId === buildingId)) {
    return { ok: false, reason: 'Già presente' };
  }
  if (isOccupied(state, x, y, w, h)) return { ok: false, reason: 'Occupato' };
  return { ok: true };
}

export function placeBuilding(
  state: GameState,
  buildingId: string,
  x: number,
  y: number,
  now = Date.now(),
): { state: GameState; error?: string } {
  if (!isBuildingUnlocked(state, buildingId)) {
    return { state, error: 'Edificio non sbloccato in questa era' };
  }
  const def = getBuildingDef(buildingId);
  const level = getBuildingLevel(def, 1);
  const placeCheck = canPlace(state, buildingId, x, y);
  if (!placeCheck.ok) return { state, error: placeCheck.reason };
  if (freeBuilderSlots(state, now) < 1) return { state, error: 'Nessun costruttore libero' };
  if (!canAfford(state.resources, level.buildCost)) return { state, error: 'Risorse insufficienti' };

  const endsAt = level.buildTimeSec > 0 ? now + level.buildTimeSec * 1000 : null;
  let next: GameState = {
    ...state,
    resources: spend(state.resources, level.buildCost),
  };
  if (endsAt) next = assignBuilder(next, endsAt, now);

  const placed: PlacedBuildingExt = {
    instanceId: nextId('b'),
    buildingId,
    level: 1,
    x,
    y,
    hp: level.hp,
    buildEndsAt: endsAt,
    stored: 0,
    lastCollectAt: now,
    pendingUpgrade: false,
  };

  return { state: { ...next, buildings: [...next.buildings, placed] } };
}

export function startUpgrade(
  state: GameState,
  instanceId: string,
  now = Date.now(),
): { state: GameState; error?: string } {
  const building = state.buildings.find((b) => b.instanceId === instanceId) as
    | PlacedBuildingExt
    | undefined;
  if (!building) return { state, error: 'Edificio non trovato' };
  if (building.buildEndsAt && building.buildEndsAt > now) {
    return { state, error: 'Costruzione in corso' };
  }
  const def = getBuildingDef(building.buildingId);
  if (building.level >= def.maxLevel) return { state, error: 'Livello massimo' };
  const nextLevel = getBuildingLevel(def, building.level + 1);
  if (building.buildingId !== 'qg' && !state.unlockedEras.includes(nextLevel.unlockEra)) {
    return { state, error: `Richiede era ${nextLevel.unlockEra}` };
  }
  if (freeBuilderSlots(state, now) < 1) return { state, error: 'Nessun costruttore libero' };
  if (!canAfford(state.resources, nextLevel.buildCost)) {
    return { state, error: 'Risorse insufficienti' };
  }

  const endsAt = now + Math.max(1, nextLevel.buildTimeSec) * 1000;
  let next: GameState = {
    ...state,
    resources: spend(state.resources, nextLevel.buildCost),
  };
  next = assignBuilder(next, endsAt, now);
  next = {
    ...next,
    buildings: next.buildings.map((b) =>
      b.instanceId === instanceId
        ? ({ ...b, buildEndsAt: endsAt, pendingUpgrade: true } as PlacedBuildingExt)
        : b,
    ),
  };
  return { state: next };
}

export function applyCompletedConstruction(state: GameState, now: number): GameState {
  let qgChanged = false;
  const buildings = state.buildings.map((raw) => {
    const b = raw as PlacedBuildingExt;
    if (!b.buildEndsAt || b.buildEndsAt > now) return b;
    if (b.pendingUpgrade) {
      const def = getBuildingDef(b.buildingId);
      const newLevel = Math.min(b.level + 1, def.maxLevel);
      const lvl = getBuildingLevel(def, newLevel);
      if (b.buildingId === 'qg') qgChanged = true;
      return {
        ...b,
        level: newLevel,
        hp: lvl.hp,
        buildEndsAt: null,
        pendingUpgrade: false,
      };
    }
    return { ...b, buildEndsAt: null, pendingUpgrade: false };
  });

  let next: GameState = { ...state, buildings };
  if (qgChanged) next = syncEraFromQg(next);
  return next;
}

export function collectFromBuilding(
  state: GameState,
  instanceId: string,
  now = Date.now(),
): GameState {
  const buildings = state.buildings.map((b) => {
    if (b.instanceId !== instanceId) return b;
    const def = getBuildingDef(b.buildingId);
    if (!def.produces || (b.buildEndsAt && b.buildEndsAt > now)) return b;
    return { ...b, stored: 0, lastCollectAt: now };
  });
  const target = state.buildings.find((b) => b.instanceId === instanceId);
  if (!target || target.stored <= 0) return state;
  const def = getBuildingDef(target.buildingId);
  if (!def.produces) return state;
  return {
    ...state,
    buildings,
    resources: {
      ...state.resources,
      [def.produces.resource]: state.resources[def.produces.resource] + Math.floor(target.stored),
    },
  };
}

export function produceResources(state: GameState, now: number): GameState {
  const buildings = state.buildings.map((b) => {
    const def = getBuildingDef(b.buildingId);
    if (!def.produces) return b;
    if (b.buildEndsAt && b.buildEndsAt > now) return b;
    const rate = def.produces.perHour[b.level - 1] ?? def.produces.perHour[0];
    const cap = def.produces.capacity[b.level - 1] ?? def.produces.capacity[0];
    const elapsedHr = Math.max(0, (now - b.lastCollectAt) / 3_600_000);
    // lastCollectAt tracks last production tick base; stored accumulates
    const produced = rate * elapsedHr;
    // Reset lastCollectAt each tick accumulation relative to stored
    const newStored = Math.min(cap, b.stored + produced);
    return { ...b, stored: newStored, lastCollectAt: now };
  });
  return { ...state, buildings };
}
