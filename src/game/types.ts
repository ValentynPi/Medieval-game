export type ResourceId = "wood" | "stone" | "food" | "gold";

export type BuildingType =
  | "keep"
  | "farm"
  | "lumber"
  | "quarry"
  | "mine"
  | "bridge"
  | "boat"
  | "road"
  | "forest"
  | "mountain"
  | "barracks"
  | "tower"
  | "wall"
  | "blacksmith"
  | "market"
  | "buildersHall";

export type TroopType = "infantry" | "archers" | "cavalry";

export type TroopVariant =
  | "levy"
  | "spearmen"
  | "pikemen"
  | "shortbow"
  | "longbow"
  | "crossbow"
  | "light_cav"
  | "heavy_cav";

export type FormationType = "line" | "wedge" | "block" | "circle";

export type GameMode = "village" | "battle" | "world" | "intro";

export type VillagerJob =
  | "idle"
  | "woodcutter"
  | "farmer"
  | "quarryman"
  | "miner"
  | "trader"
  | "builder";

export interface Villager {
  id: string;
  name: string;
  job: VillagerJob;
  /** Continuous grid coordinates */
  x: number;
  y: number;
  tx: number;
  ty: number;
  phase: "walk" | "work" | "build";
  workTimer: number;
  anim: number;
  /** Last assigned workplace cell */
  workGx: number | null;
  workGy: number | null;
  /** Waypoints from pathfinding (cell centers) */
  path: { x: number; y: number }[];
  pathI: number;
  /** Personal walk pace multiplier */
  pace: number;
  /** Brief idle pause while walking (seconds) */
  pause: number;
  /** Construction site this builder is raising */
  siteId: string | null;
}

export interface ConstructionSite {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  rotation: number;
  /** 0–1 */
  progress: number;
  builderId: string | null;
  /** Water cells reserved while a Timber Bridge is under construction */
  span?: FieldCell[];
}

export type Resources = Record<ResourceId, number>;

export interface BuildingDef {
  type: BuildingType;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: Resources;
  costGrowth: number;
  production?: Partial<Resources>;
  defense?: number;
  color: string;
  roof: string;
  keepRequired: number;
}

export interface FieldCell {
  x: number;
  y: number;
}

export interface Building {
  id: string;
  type: BuildingType;
  level: number;
  x: number;
  y: number;
  /** Quarter-turns clockwise: 0–3 */
  rotation: number;
  /** Crop plots claimed by a farm */
  fields?: FieldCell[];
  /** Water cells covered by a Bridge (one structure, many tiles) */
  span?: FieldCell[];
}

export type CityKind = "trade" | "port";

export interface TradeCity {
  id: string;
  name: string;
  kind: CityKind;
  /** Normalized world-map position 0–1 */
  x: number;
  y: number;
  stock: Resources;
  /** Gold paid to buy one unit from the city */
  buyPrice: Resources;
  /** Gold received when selling one unit to the city */
  sellPrice: Resources;
  /** Port cities are reachable by sea trade routes */
  hasPort?: boolean;
  /** Extra goods for port trade: gold, grain, spices, wine, furs */
  imports?: ResourceId[];
  exports?: ResourceId[];
}

export interface TroopCounts {
  infantry: number;
  archers: number;
  cavalry: number;
}

export interface Hero {
  id: string;
  name: string;
  title: string;
  level: number;
  xp: number;
  skill: string;
  skillDesc: string;
  /** Buff multiplier for a troop type in combat */
  buffTroop: TroopType;
  buffAmount: number;
  skillCooldown: number;
  skillCooldownMax: number;
}

export interface CombatFloat {
  x: number;
  y: number;
  text: string;
  ttl: number;
  color: string;
}

export interface BattleUnit {
  id: string;
  side: "player" | "enemy";
  kind: TroopType | "hero" | "tower" | "keep" | "raider" | "beast";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  range: number;
  speed: number;
  radius: number;
  cooldown: number;
  troopType?: TroopType;
  variant?: TroopVariant;
  morale?: number;
  fatigue?: number;
  facing?: number;
  routing?: boolean;
  /** Player command — auto chase, move to point, or hold ground */
  order?: "auto" | "move" | "hold";
  orderX?: number;
  orderY?: number;
  /** March waypoints in battle coords (bridge-aware path) */
  path?: { x: number; y: number }[];
  pathI?: number;
  /** Unit is aboard a boat — can traverse water until landing */
  embarked?: boolean;
}

export interface WorldSite {
  id: string;
  name: string;
  kind: "bandits" | "monsters" | "ruins";
  x: number;
  y: number;
  power: number;
  composition: TroopCounts;
  reward: Resources;
  cleared: boolean;
}

export interface GameState {
  mode: GameMode;
  resources: Resources;
  buildings: Building[];
  troops: TroopCounts;
  garrison: TroopCounts;
  hero: Hero;
  keepHp: number;
  keepMaxHp: number;
  day: number;
  timeToRaid: number;
  raidCount: number;
  message: string;
  messageTimer: number;
  selectedBuild: BuildingType | null;
  selectedBuildingId: string | null;
  /** Relocate mode — next valid click moves this building */
  movingBuildingId: string | null;
  /** Placement preview facing (0–3 quarter turns) */
  buildRotation: number;
  paused: boolean;
  battle: BattleState | null;
  sites: WorldSite[];
  cities: TradeCity[];
  selectedCityId: string | null;
  /** World-map camp staged for confirm-march */
  selectedSiteId: string | null;
  villagers: Villager[];
  selectedVillagerId: string | null;
  /** Next map click sets workplace for selected villager */
  assignWorkplace: boolean;
  constructionSites: ConstructionSite[];
  /** Grid keys (gy * GRID_W + gx) of natural forest cleared by woodcutters */
  clearedForest: number[];
  tutorialStep: number;
  victory: boolean;
  defeat: boolean;
}

export interface BattleState {
  units: BattleUnit[];
  elapsed: number;
  outcome: "ongoing" | "won" | "lost";
  waveLabel: string;
  selectedIds: string[];
  orderMarker: { x: number; y: number } | null;
  formation: FormationType;
  battleSpeed: number;
  combatFloats: CombatFloat[];
  visibleEnemyIds: string[];
  scoutRadius: number;
  heroSkillUntil: number;
  casualties: TroopCounts;
  keepDamagedThisTick: boolean;
  /** Seconds with no living enemy visible — used to end stalled raids */
  noEnemySightSeconds: number;
}
