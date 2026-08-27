import type { EraId, GameState, PlacedBuilding, Resources } from './types';
import { META, getBuildingDef, getBuildingLevel, ERAS } from './content';

let idCounter = 1;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}_${Date.now().toString(36)}`;
}

export function emptyResources(): Resources {
  return { legna: 0, acqua: 0, impegno: 0 };
}

export function addResources(a: Resources, b: Resources): Resources {
  return {
    legna: a.legna + b.legna,
    acqua: a.acqua + b.acqua,
    impegno: a.impegno + b.impegno,
  };
}

export function canAfford(have: Resources, cost: Resources): boolean {
  return have.legna >= cost.legna && have.acqua >= cost.acqua && have.impegno >= cost.impegno;
}

export function spend(have: Resources, cost: Resources): Resources {
  return {
    legna: have.legna - cost.legna,
    acqua: have.acqua - cost.acqua,
    impegno: have.impegno - cost.impegno,
  };
}

/** Max wallet storage from collectors / QG (Clash-style capacity). */
export function getStorageCaps(state: GameState): Resources {
  const caps: Resources = { legna: 0, acqua: 0, impegno: 0 };
  const now = Date.now();
  for (const b of state.buildings) {
    if (b.buildEndsAt && b.buildEndsAt > now) continue;
    const def = getBuildingDef(b.buildingId);
    if (def.produces) {
      const c = def.produces.capacity[b.level - 1] ?? def.produces.capacity[0] ?? 0;
      caps[def.produces.resource] += c;
    }
  }
  // Soft caps if no storage built yet
  if (caps.legna < 500) caps.legna = 500;
  if (caps.acqua < 500) caps.acqua = 500;

  const qg = getQgLevel(state);
  const impegnoByQg = [0, 300, 800, 1600, 3200, 6000];
  caps.impegno = impegnoByQg[qg] ?? 6000;

  return caps;
}

export function formatResourceAmount(n: number): string {
  const v = Math.floor(Math.max(0, n));
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Shop packs: buy legna/acqua with impegno (gems-style). */
export type ResourcePackId =
  | 'legna_s'
  | 'legna_m'
  | 'legna_l'
  | 'acqua_s'
  | 'acqua_m'
  | 'acqua_l';

export type ResourcePack = {
  id: ResourcePackId;
  name: string;
  grant: Resources;
  costImpegno: number;
};

export const RESOURCE_PACKS: ResourcePack[] = [
  { id: 'legna_s', name: 'Fascio di Legna', grant: { legna: 500, acqua: 0, impegno: 0 }, costImpegno: 10 },
  { id: 'legna_m', name: 'Catasta di Legna', grant: { legna: 2000, acqua: 0, impegno: 0 }, costImpegno: 30 },
  { id: 'legna_l', name: 'Riserva di Legna', grant: { legna: 5000, acqua: 0, impegno: 0 }, costImpegno: 60 },
  { id: 'acqua_s', name: 'Borraccia', grant: { legna: 0, acqua: 500, impegno: 0 }, costImpegno: 10 },
  { id: 'acqua_m', name: 'Taniche d\'Acqua', grant: { legna: 0, acqua: 2000, impegno: 0 }, costImpegno: 30 },
  { id: 'acqua_l', name: 'Cisterna', grant: { legna: 0, acqua: 5000, impegno: 0 }, costImpegno: 60 },
];

export function buyResourcePack(
  state: GameState,
  packId: ResourcePackId,
): { state: GameState; error?: string } {
  const pack = RESOURCE_PACKS.find((p) => p.id === packId);
  if (!pack) return { state, error: 'Pacchetto non trovato' };
  if (state.resources.impegno < pack.costImpegno) {
    return { state, error: 'Impegno insufficiente' };
  }

  const caps = getStorageCaps(state);
  const roomLegna = Math.max(0, caps.legna - state.resources.legna);
  const roomAcqua = Math.max(0, caps.acqua - state.resources.acqua);
  const addLegna = Math.min(pack.grant.legna, roomLegna);
  const addAcqua = Math.min(pack.grant.acqua, roomAcqua);

  if (addLegna <= 0 && addAcqua <= 0) {
    return { state, error: 'Depositi pieni' };
  }

  return {
    state: {
      ...state,
      resources: {
        legna: state.resources.legna + addLegna,
        acqua: state.resources.acqua + addAcqua,
        impegno: state.resources.impegno - pack.costImpegno,
      },
    },
  };
}

export function createInitialState(now = Date.now()): GameState {
  const make = (buildingId: string, x: number, y: number): PlacedBuilding => {
    const def = getBuildingDef(buildingId);
    const lvl = getBuildingLevel(def, 1);
    return {
      instanceId: nextId('b'),
      buildingId,
      level: 1,
      x,
      y,
      hp: lvl.hp,
      buildEndsAt: null,
      stored: 0,
      lastCollectAt: now,
    };
  };

  return {
    version: 1,
    resources: { ...META.startingResources },
    buildings: [
      make('qg', 8, 8),
      make('deposito_legna', 5, 8),
      make('pozzo', 11, 8),
      make('tenda_specialita', 5, 11),
      make('tenda_squadriglia', 10, 11),
    ],
    trainingQueue: [],
    army: [],
    currentEra: 'lupetti',
    unlockedEras: ['lupetti'],
    missionProgress: [],
    totem: null,
    lastTickAt: now,
    builderBusyUntil: Array(META.builderSlots).fill(0),
  };
}

export function getQgLevel(state: GameState): number {
  const qg = state.buildings.find((b) => b.buildingId === 'qg');
  return qg?.level ?? 1;
}

export function syncEraFromQg(state: GameState): GameState {
  const qgLevel = getQgLevel(state);
  const unlocked: EraId[] = [];
  let current: EraId = 'lupetti';
  for (const era of [...ERAS].sort((a, b) => a.order - b.order)) {
    if (qgLevel >= era.qgLevelRequired) {
      unlocked.push(era.id);
      current = era.id;
    }
  }
  return { ...state, unlockedEras: unlocked, currentEra: current };
}

export function freeBuilderSlots(state: GameState, now: number): number {
  return state.builderBusyUntil.filter((t) => t <= now).length;
}

export function assignBuilder(state: GameState, endsAt: number, now: number): GameState {
  const slots = [...state.builderBusyUntil];
  const idx = slots.findIndex((t) => t <= now);
  if (idx === -1) return state;
  slots[idx] = endsAt;
  return { ...state, builderBusyUntil: slots };
}
