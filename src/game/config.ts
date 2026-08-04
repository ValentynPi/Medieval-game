import type { BuildingDef, BuildingType, Resources, TroopType } from "./types";

/** Village map is 5× wider and 5× taller than the original (25× area). */
export const GRID_W = 240;
export const GRID_H = 180;
export const CELL = 56;
/** World units per village grid cell in the 3D scene */
export const TILE = 2.0;

export const BATTLE_W = GRID_W * CELL;
export const BATTLE_H = GRID_H * CELL;

export function gridToBattleX(gx: number): number {
  return gx * CELL + CELL / 2;
}

export function gridToBattleY(gy: number): number {
  return gy * CELL + CELL / 2;
}

/** Food consumed per second per troop in the field + garrison (kept light so food stays net-positive early) */
export const FOOD_UPKEEP: Record<TroopType, number> = {
  infantry: 0.005,
  archers: 0.004,
  cavalry: 0.008,
};

export const EMPTY_COST: Resources = { wood: 0, stone: 0, food: 0, gold: 0 };

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  keep: {
    type: "keep",
    name: "Keep",
    description: "Gates progression. Tiny crown tithe; traders here earn gold.",
    maxLevel: 8,
    baseCost: { wood: 80, stone: 120, food: 40, gold: 50 },
    costGrowth: 1.65,
    production: { gold: 0.08 },
    defense: 40,
    color: "#5c4634",
    roof: "#8b3a2a",
    keepRequired: 1,
  },
  farm: {
    type: "farm",
    name: "Mill",
    description: "Grain mill — buy crop fields separately and place them nearby for more food.",
    maxLevel: 6,
    baseCost: { wood: 40, stone: 10, food: 0, gold: 15 },
    costGrowth: 1.45,
    color: "#6b8f3c",
    roof: "#c4a35a",
    keepRequired: 1,
  },
  lumber: {
    type: "lumber",
    name: "Lumber Camp",
    description: "Timber yard — woodcutters working here haul more wood.",
    maxLevel: 6,
    baseCost: { wood: 20, stone: 15, food: 20, gold: 10 },
    costGrowth: 1.45,
    color: "#7a5c3a",
    roof: "#4a6b3a",
    keepRequired: 1,
  },
  quarry: {
    type: "quarry",
    name: "Quarry",
    description: "Stone works — needs a quarryman on site.",
    maxLevel: 6,
    baseCost: { wood: 35, stone: 5, food: 25, gold: 20 },
    costGrowth: 1.45,
    color: "#7d7f86",
    roof: "#5a5c62",
    keepRequired: 1,
  },
  mine: {
    type: "mine",
    name: "Gold Mine",
    description: "Mountain dig — assign a miner to pull gold and stone.",
    maxLevel: 6,
    baseCost: { wood: 40, stone: 40, food: 30, gold: 0 },
    costGrowth: 1.5,
    color: "#8a7429",
    roof: "#4e4630",
    keepRequired: 2,
  },
  bridge: {
    type: "bridge",
    name: "Bridge",
    description: "Select Bridge, click the river — builders raise a shore-to-shore deck.",
    maxLevel: 3,
    baseCost: { wood: 70, stone: 40, food: 10, gold: 20 },
    costGrowth: 1.45,
    color: "#6a5340",
    roof: "#4a3a28",
    keepRequired: 1,
  },
  boat: {
    type: "boat",
    name: "Boat",
    description: "Dock a boat on water — troops board here to sail, then land on shore.",
    maxLevel: 2,
    baseCost: { wood: 70, stone: 10, food: 15, gold: 20 },
    costGrowth: 1.35,
    color: "#5a4030",
    roof: "#3a6ea5",
    keepRequired: 1,
  },
  road: {
    type: "road",
    name: "Road",
    description: "Lay dirt roads by hand. New buildings auto-link by road all the way to the Keep.",
    maxLevel: 1,
    baseCost: { wood: 8, stone: 12, food: 0, gold: 2 },
    costGrowth: 1,
    color: "#c4a882",
    roof: "#a08860",
    keepRequired: 1,
  },
  forest: {
    type: "forest",
    name: "Forest",
    description: "Plant a wooded plot. Blocks most buildings.",
    maxLevel: 1,
    baseCost: { wood: 5, stone: 0, food: 15, gold: 2 },
    costGrowth: 1,
    color: "#3a6840",
    roof: "#2f5a38",
    keepRequired: 1,
  },
  mountain: {
    type: "mountain",
    name: "Mountain",
    description: "Raise stone peaks — Gold Mines can be dug here.",
    maxLevel: 1,
    baseCost: { wood: 10, stone: 40, food: 5, gold: 8 },
    costGrowth: 1,
    color: "#6a7068",
    roof: "#8a9098",
    keepRequired: 1,
  },
  barracks: {
    type: "barracks",
    name: "Barracks",
    description: "Houses levies — each Barracks has a troop cap. Assign wall garrison here.",
    maxLevel: 5,
    baseCost: { wood: 60, stone: 40, food: 40, gold: 30 },
    costGrowth: 1.55,
    color: "#4a3f35",
    roof: "#6b2f2f",
    keepRequired: 1,
  },
  trainingGround: {
    type: "trainingGround",
    name: "Training Ground",
    description: "Recruit and drill new troops here. Needs Barracks beds for the muster.",
    maxLevel: 4,
    baseCost: { wood: 45, stone: 25, food: 35, gold: 25 },
    costGrowth: 1.5,
    color: "#5a4a38",
    roof: "#8b3a2a",
    keepRequired: 1,
  },
  tower: {
    type: "tower",
    name: "Watchtower",
    description: "Fires on raiders during village defense.",
    maxLevel: 5,
    baseCost: { wood: 50, stone: 70, food: 20, gold: 25 },
    costGrowth: 1.5,
    defense: 18,
    color: "#5a5348",
    roof: "#3d4a5c",
    keepRequired: 2,
  },
  wall: {
    type: "wall",
    name: "Wall",
    description: "Slows and absorbs enemy advances.",
    maxLevel: 4,
    baseCost: { wood: 20, stone: 45, food: 10, gold: 10 },
    costGrowth: 1.4,
    defense: 28,
    color: "#6e6a63",
    roof: "#55524c",
    keepRequired: 2,
  },
  blacksmith: {
    type: "blacksmith",
    name: "Blacksmith",
    description: "+10% troop attack per level in battle.",
    maxLevel: 4,
    baseCost: { wood: 45, stone: 55, food: 25, gold: 40 },
    costGrowth: 1.55,
    color: "#3f3a38",
    roof: "#b45a1a",
    keepRequired: 3,
  },
  market: {
    type: "market",
    name: "Market",
    description: "Trade stall — assign a trader to earn gold here.",
    maxLevel: 4,
    baseCost: { wood: 50, stone: 30, food: 35, gold: 20 },
    costGrowth: 1.5,
    color: "#8b5a3c",
    roof: "#2f5d4a",
    keepRequired: 2,
  },
  buildersHall: {
    type: "buildersHall",
    name: "Builders Hall",
    description: "Hire builders who walk out and raise other buildings for you.",
    maxLevel: 4,
    baseCost: { wood: 70, stone: 50, food: 30, gold: 35 },
    costGrowth: 1.5,
    color: "#6a5340",
    roof: "#8a6a28",
    keepRequired: 1,
  },
};

/** Buildings that appear instantly (paths, terrain, early camps). Others need builders. */
export const INSTANT_BUILD: BuildingType[] = [
  "road",
  "forest",
  "mountain",
  "boat",
  "buildersHall",
  "lumber",
  "quarry",
];

export const HIRE_BUILDER_COST: Resources = { wood: 0, stone: 0, food: 28, gold: 22 };

/** Cost to add one crop plot to a mill (no food — fields are what make food) */
export const FIELD_PLOT_COST: Resources = { wood: 8, stone: 0, food: 0, gold: 4 };

/** Soft cap: base plots + extra per mill level */
export function maxFarmFields(level: number): number {
  return 4 + Math.max(0, level) * 3;
}

/** Troop beds provided by one Barracks of the given level */
export function barracksTroopCap(level: number): number {
  return 10 + Math.max(1, level) * 6;
}

export const TRAIN_COST: Record<TroopType, Resources> = {
  infantry: { wood: 5, stone: 0, food: 12, gold: 8 },
  archers: { wood: 12, stone: 0, food: 10, gold: 10 },
  cavalry: { wood: 8, stone: 0, food: 18, gold: 16 },
};

export const TROOP_STATS: Record<
  TroopType,
  { hp: number; atk: number; range: number; speed: number; beats: TroopType }
> = {
  infantry: { hp: 110, atk: 14, range: 36, speed: 42, beats: "cavalry" },
  archers: { hp: 70, atk: 16, range: 110, speed: 38, beats: "infantry" },
  cavalry: { hp: 90, atk: 18, range: 40, speed: 72, beats: "archers" },
};

export const PLACEABLE: BuildingType[] = [
  "bridge",
  "boat",
  "farm",
  "lumber",
  "quarry",
  "mine",
  "road",
  "forest",
  "mountain",
  "barracks",
  "trainingGround",
  "buildersHall",
  "tower",
  "wall",
  "blacksmith",
  "market",
];

/** Build menu sections — Bridge first so river crossings are easy to find */
export const BUILD_MENU_SECTIONS: { title: string; types: BuildingType[] }[] = [
  { title: "River crossing", types: ["bridge", "boat"] },
  { title: "Economy", types: ["farm", "lumber", "quarry", "mine", "market"] },
  { title: "Terrain", types: ["road", "forest", "mountain"] },
  { title: "Military & civic", types: ["barracks", "trainingGround", "tower", "wall", "blacksmith"] },
];

export function scaleCost(base: Resources, level: number, growth: number): Resources {
  const m = Math.pow(growth, level - 1);
  return {
    wood: Math.floor(base.wood * m),
    stone: Math.floor(base.stone * m),
    food: Math.floor(base.food * m),
    gold: Math.floor(base.gold * m),
  };
}

export function canAfford(have: Resources, cost: Resources): boolean {
  return (
    have.wood >= cost.wood &&
    have.stone >= cost.stone &&
    have.food >= cost.food &&
    have.gold >= cost.gold
  );
}

export function pay(have: Resources, cost: Resources): Resources {
  return {
    wood: have.wood - cost.wood,
    stone: have.stone - cost.stone,
    food: have.food - cost.food,
    gold: have.gold - cost.gold,
  };
}

export function triangleMultiplier(attacker: TroopType, defender: TroopType): number {
  if (TROOP_STATS[attacker].beats === defender) return 1.35;
  if (TROOP_STATS[defender].beats === attacker) return 0.72;
  return 1;
}

export function buildingYaw(rotation: number): number {
  return (((rotation % 4) + 4) % 4) * (Math.PI / 2);
}
