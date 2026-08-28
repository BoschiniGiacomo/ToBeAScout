export type ResourceId = 'legna' | 'acqua' | 'impegno';

export type Resources = Record<ResourceId, number>;

export type EraId = 'lupetti' | 'reparto' | 'noviziato' | 'clan' | 'comunita_capi';

export type BuildingCategory =
  | 'hq'
  | 'resource'
  | 'barracks'
  | 'army_camp'
  | 'wall'
  | 'defense'
  | 'lab'
  | 'support'
  | 'clan_castle';

export interface Footprint {
  w: number;
  h: number;
}

export interface Anchor {
  x: number;
  y: number;
}

export interface BuildingLevelDef {
  level: number;
  hp: number;
  buildCost: Resources;
  buildTimeSec: number;
  unlockEra: EraId;
  queueSlots?: number;
  capacity?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  maxLevel: number;
  footprint: Footprint;
  anchor: Anchor;
  spriteKey: string;
  color: string;
  unique?: boolean;
  produces?: {
    resource: ResourceId;
    perHour: number[];
    capacity: number[];
  };
  defense?: {
    damage: number[];
    range: number[];
    fireRate: number;
  };
  levels: BuildingLevelDef[];
}

export interface TroopLevelDef {
  level: number;
  hp: number;
  damage: number;
  heal?: number;
  trainCost: Resources;
  trainTimeSec: number;
  unlockEra: EraId;
  /** Cost to upgrade from previous level to this one */
  upgradeCost?: Resources;
  upgradeTimeSec?: number;
}

export interface TroopDef {
  id: string;
  name: string;
  housing: number;
  speed: number;
  range: number;
  prefer: 'any' | 'resource' | 'defense' | 'wall';
  unlockEra: EraId;
  barracks: string;
  color: string;
  spriteKey: string;
  anchor: Anchor;
  footprint: Footprint;
  brevettoOf?: string;
  maxLevel: number;
  levels: TroopLevelDef[];
}

export interface EraDef {
  id: EraId;
  name: string;
  order: number;
  qgLevelRequired: number;
  description: string;
  unlocksBuildings: string[];
  unlocksTroops: string[];
  missionIds: string[];
}

export interface EnemyPlacement {
  buildingId: string;
  level: number;
  x: number;
  y: number;
}

export interface MissionDef {
  id: string;
  name: string;
  era: EraId;
  difficulty: number;
  durationHintMin: number;
  description: string;
  mapSize: number;
  stars: { destroyPct: number[]; qgDestroyed: boolean };
  rewards: Resources;
  enemyLayout: EnemyPlacement[];
  requiredHousing: number;
  requiresMission?: string;
  totemReward?: string;
}

export interface PlacedBuilding {
  instanceId: string;
  buildingId: string;
  level: number;
  x: number;
  y: number;
  hp: number;
  /** Unix ms when construction/upgrade completes; null if idle */
  buildEndsAt: number | null;
  /** Stored resource amount for collectors */
  stored: number;
  lastCollectAt: number;
}

export interface TrainingJob {
  troopId: string;
  level: number;
  endsAt: number;
  barracksInstanceId: string;
}

export interface TroopUpgradeJob {
  troopId: string;
  targetLevel: number;
  endsAt: number;
}

export interface ArmyUnit {
  troopId: string;
  count: number;
}

export interface MissionProgress {
  missionId: string;
  stars: number;
  completed: boolean;
}

export interface GameState {
  version: number;
  resources: Resources;
  buildings: PlacedBuilding[];
  trainingQueue: TrainingJob[];
  troopLevels: Record<string, number>;
  troopUpgrade: TroopUpgradeJob | null;
  army: ArmyUnit[];
  currentEra: EraId;
  unlockedEras: EraId[];
  missionProgress: MissionProgress[];
  totem: string | null;
  lastTickAt: number;
  builderBusyUntil: number[];
}

export interface CombatBuilding {
  instanceId: string;
  buildingId: string;
  level: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  category: BuildingCategory;
  destroyed: boolean;
}

export interface CombatUnit {
  id: string;
  troopId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  targetId: string | null;
  cooldown: number;
}

export interface CombatState {
  missionId: string;
  mapSize: number;
  buildings: CombatBuilding[];
  units: CombatUnit[];
  deployRemaining: ArmyUnit[];
  troopLevels: Record<string, number>;
  timeLeft: number;
  destroyPct: number;
  stars: number;
  finished: boolean;
  victory: boolean;
  qgDestroyed: boolean;
}
