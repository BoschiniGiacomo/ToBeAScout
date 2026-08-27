import buildingsJson from '../content/buildings.json';
import troopsJson from '../content/troops.json';
import erasJson from '../content/eras.json';
import missionsJson from '../content/missions.json';
import metaJson from '../content/meta.json';
import type { BuildingDef, EraDef, MissionDef, TroopDef } from './types';

export const BUILDINGS = buildingsJson as BuildingDef[];
export const TROOPS = troopsJson as TroopDef[];
export const ERAS = erasJson as EraDef[];
export const MISSIONS = missionsJson as MissionDef[];
export const META = metaJson;

export function getBuildingDef(id: string): BuildingDef {
  const def = BUILDINGS.find((b) => b.id === id);
  if (!def) throw new Error(`Unknown building: ${id}`);
  return def;
}

export function getTroopDef(id: string): TroopDef {
  const def = TROOPS.find((t) => t.id === id);
  if (!def) throw new Error(`Unknown troop: ${id}`);
  return def;
}

export function getEraDef(id: string): EraDef {
  const def = ERAS.find((e) => e.id === id);
  if (!def) throw new Error(`Unknown era: ${id}`);
  return def;
}

export function getMissionDef(id: string): MissionDef {
  const def = MISSIONS.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown mission: ${id}`);
  return def;
}

export function getBuildingLevel(def: BuildingDef, level: number) {
  const lvl = def.levels.find((l) => l.level === level);
  if (!lvl) throw new Error(`Missing level ${level} for ${def.id}`);
  return lvl;
}
