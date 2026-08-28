import type {
  ArmyUnit,
  CombatBuilding,
  CombatState,
  CombatUnit,
  MissionDef,
} from './types';
import { getBuildingDef, getBuildingLevel, getMissionDef, getTroopDef, getTroopLevel } from './content';
import { nextId } from './economy';

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function buildingCenter(b: CombatBuilding): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function createCombatState(
  missionId: string,
  army: ArmyUnit[],
  troopLevels: Record<string, number>,
): CombatState {
  const mission = getMissionDef(missionId);
  const buildings: CombatBuilding[] = mission.enemyLayout.map((p, i) => {
    const def = getBuildingDef(p.buildingId);
    const lvl = getBuildingLevel(def, p.level);
    return {
      instanceId: `enemy_${i}`,
      buildingId: p.buildingId,
      level: p.level,
      x: p.x,
      y: p.y,
      w: def.footprint.w,
      h: def.footprint.h,
      hp: lvl.hp,
      maxHp: lvl.hp,
      category: def.category,
      destroyed: false,
    };
  });

  return {
    missionId,
    mapSize: mission.mapSize,
    buildings,
    units: [],
    deployRemaining: army.map((u) => ({ ...u })),
    troopLevels: { ...troopLevels },
    timeLeft: 180,
    destroyPct: 0,
    stars: 0,
    finished: false,
    victory: false,
    qgDestroyed: false,
  };
}

function nearestTarget(
  ux: number,
  uy: number,
  unitTroopId: string,
  buildings: CombatBuilding[],
): CombatBuilding | null {
  const alive = buildings.filter((b) => !b.destroyed && b.hp > 0);
  if (alive.length === 0) return null;
  const prefer = getTroopDef(unitTroopId).prefer;
  let pool = alive;
  if (prefer !== 'any') {
    const preferred = alive.filter((b) => {
      if (prefer === 'resource') return b.category === 'resource';
      if (prefer === 'defense') return b.category === 'defense';
      if (prefer === 'wall') return b.category === 'wall';
      return true;
    });
    if (preferred.length > 0) pool = preferred;
  }
  let best = pool[0];
  let bestD = Infinity;
  for (const b of pool) {
    const c = buildingCenter(b);
    const d = dist(ux, uy, c.x, c.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function deployTroop(
  combat: CombatState,
  troopId: string,
  x: number,
  y: number,
): CombatState {
  if (combat.finished) return combat;
  const remaining = combat.deployRemaining.find((u) => u.troopId === troopId && u.count > 0);
  if (!remaining) return combat;
  if (x < 0 || y < 0 || x >= combat.mapSize || y >= combat.mapSize) return combat;

  const def = getTroopDef(troopId);
  const level = combat.troopLevels[troopId] ?? 1;
  const stats = getTroopLevel(def, level);
  const unit: CombatUnit = {
    id: nextId('u'),
    troopId,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    targetId: null,
    cooldown: 0,
  };

  const deployRemaining = combat.deployRemaining
    .map((u) => (u.troopId === troopId ? { ...u, count: u.count - 1 } : u))
    .filter((u) => u.count > 0);

  return {
    ...combat,
    units: [...combat.units, unit],
    deployRemaining,
  };
}

function computeStars(combat: CombatState, mission: MissionDef): number {
  let stars = 0;
  const thresholds = mission.stars.destroyPct;
  for (const t of thresholds) {
    if (combat.destroyPct >= t) stars += 1;
  }
  if (mission.stars.qgDestroyed && combat.qgDestroyed && stars < 3) {
    // QG kill guarantees at least consideration; already in destroy pct usually
  }
  if (combat.qgDestroyed && combat.destroyPct >= 100) stars = 3;
  return Math.min(3, stars);
}

export function stepCombat(combat: CombatState, dt: number): CombatState {
  if (combat.finished) return combat;
  const mission = getMissionDef(combat.missionId);
  let timeLeft = combat.timeLeft - dt;
  let buildings = combat.buildings.map((b) => ({ ...b }));
  let units = combat.units.map((u) => ({ ...u }));

  // Move & attack units
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const troop = getTroopDef(unit.troopId);
    const level = combat.troopLevels[unit.troopId] ?? 1;
    const stats = getTroopLevel(troop, level);
    let target = buildings.find((b) => b.instanceId === unit.targetId && !b.destroyed);
    if (!target) {
      target = nearestTarget(unit.x, unit.y, unit.troopId, buildings) ?? undefined;
      unit.targetId = target?.instanceId ?? null;
    }
    if (!target) continue;

    const center = buildingCenter(target);
    const d = dist(unit.x, unit.y, center.x, center.y);
    const attackRange = troop.range + Math.max(target.w, target.h) * 0.35;

    if (d > attackRange) {
      const step = troop.speed * dt;
      const angle = Math.atan2(center.y - unit.y, center.x - unit.x);
      unit.x += Math.cos(angle) * step;
      unit.y += Math.sin(angle) * step;
    } else {
      unit.cooldown -= dt;
      if (unit.cooldown <= 0) {
        if (stats.heal && stats.heal > 0) {
          // Heal nearest ally
          let ally: CombatUnit | null = null;
          let best = Infinity;
          for (const o of units) {
            if (o.id === unit.id || o.hp <= 0 || o.hp >= o.maxHp) continue;
            const dd = dist(unit.x, unit.y, o.x, o.y);
            if (dd < best && dd <= troop.range + 1) {
              best = dd;
              ally = o;
            }
          }
          if (ally) ally.hp = Math.min(ally.maxHp, ally.hp + stats.heal);
          else target.hp -= stats.damage;
        } else {
          target.hp -= stats.damage;
        }
        unit.cooldown = 1;
        if (target.hp <= 0) {
          target.hp = 0;
          target.destroyed = true;
          unit.targetId = null;
        }
      }
    }
  }

  // Defenses shoot
  for (const b of buildings) {
    if (b.destroyed) continue;
    const def = getBuildingDef(b.buildingId);
    if (!def.defense) continue;
    const dmg = def.defense.damage[b.level - 1] ?? def.defense.damage[0];
    const range = def.defense.range[b.level - 1] ?? def.defense.range[0];
    const center = buildingCenter(b);
    let closest: CombatUnit | null = null;
    let best = Infinity;
    for (const u of units) {
      if (u.hp <= 0) continue;
      const dd = dist(center.x, center.y, u.x, u.y);
      if (dd <= range && dd < best) {
        best = dd;
        closest = u;
      }
    }
    if (closest) {
      closest.hp -= dmg * def.defense.fireRate * dt;
      if (closest.hp < 0) closest.hp = 0;
    }
  }

  units = units.filter((u) => u.hp > 0);

  const totalHp = buildings.reduce((s, b) => s + b.maxHp, 0);
  const remainHp = buildings.reduce((s, b) => s + Math.max(0, b.hp), 0);
  const destroyPct = totalHp > 0 ? ((totalHp - remainHp) / totalHp) * 100 : 100;
  const qg = buildings.find((b) => b.buildingId === 'qg');
  const qgDestroyed = !!qg?.destroyed;

  const allDeployed = combat.deployRemaining.every((u) => u.count <= 0);
  const noUnits = units.length === 0 && allDeployed;
  const allDestroyed = buildings.every((b) => b.destroyed);
  let finished = false;
  let victory = false;

  if (allDestroyed) {
    finished = true;
    victory = true;
  } else if (timeLeft <= 0 || noUnits) {
    finished = true;
    victory = destroyPct >= mission.stars.destroyPct[0];
    timeLeft = Math.max(0, timeLeft);
  }

  const next: CombatState = {
    ...combat,
    buildings,
    units,
    timeLeft,
    destroyPct,
    qgDestroyed,
    finished,
    victory,
    stars: 0,
  };
  next.stars = computeStars(next, mission);
  if (finished && victory && next.stars === 0) next.stars = 1;
  return next;
}

export function autoDeployAll(combat: CombatState): CombatState {
  let next = combat;
  const edge = 0;
  let i = 0;
  for (const stack of [...combat.deployRemaining]) {
    for (let n = 0; n < stack.count; n++) {
      const x = edge + (i % Math.max(1, combat.mapSize - 1));
      const y = edge;
      next = deployTroop(next, stack.troopId, x, y);
      i += 1;
    }
  }
  return next;
}

export function resolveMissionRewards(missionId: string, stars: number) {
  const mission = getMissionDef(missionId);
  const factor = stars / 3;
  return {
    rewards: {
      legna: Math.floor(mission.rewards.legna * factor),
      acqua: Math.floor(mission.rewards.acqua * factor),
      impegno: Math.floor(mission.rewards.impegno * factor),
    },
    totemReward: stars >= 1 ? mission.totemReward : undefined,
  };
}
