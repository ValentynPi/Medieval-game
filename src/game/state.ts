import { BUILDINGS, GRID_H, GRID_W } from "./config";
import type { Building, FieldCell, GameState, TradeCity, WorldSite } from "./types";

let nextId = 1000;
export function uid(prefix = "id"): string {
  nextId += 1;
  return `${prefix}_${nextId}`;
}

export function resetIdCounter(fromSave = false): void {
  nextId = fromSave ? 5000 : 1000;
}

function makeKeep(): Building {
  return {
    id: uid("bld"),
    type: "keep",
    level: 1,
    x: Math.floor(GRID_W / 2) - 1,
    y: Math.floor(GRID_H / 2) - 1,
    rotation: 0,
  };
}

function makeSites(): WorldSite[] {
  return [
    {
      id: "camp_bandits",
      name: "Bandit Hollow",
      kind: "bandits",
      x: 0.12,
      y: 0.28,
      power: 45,
      composition: { infantry: 8, archers: 4, cavalry: 2 },
      reward: { wood: 80, stone: 40, food: 60, gold: 50 },
      cleared: false,
    },
    {
      id: "camp_forest",
      name: "Thornwood Camp",
      kind: "bandits",
      x: 0.28,
      y: 0.14,
      power: 62,
      composition: { infantry: 10, archers: 8, cavalry: 3 },
      reward: { wood: 100, stone: 50, food: 70, gold: 65 },
      cleared: false,
    },
    {
      id: "camp_cross",
      name: "Crossroads Outpost",
      kind: "bandits",
      x: 0.42,
      y: 0.22,
      power: 78,
      composition: { infantry: 12, archers: 6, cavalry: 5 },
      reward: { wood: 110, stone: 60, food: 80, gold: 75 },
      cleared: false,
    },
    {
      id: "camp_wolves",
      name: "Wolfwood Den",
      kind: "monsters",
      x: 0.82,
      y: 0.18,
      power: 95,
      composition: { infantry: 10, archers: 5, cavalry: 9 },
      reward: { wood: 80, stone: 110, food: 55, gold: 95 },
      cleared: false,
    },
    {
      id: "camp_marsh",
      name: "Mirewatch Ruins",
      kind: "monsters",
      x: 0.88,
      y: 0.48,
      power: 115,
      composition: { infantry: 14, archers: 8, cavalry: 11 },
      reward: { wood: 95, stone: 120, food: 85, gold: 130 },
      cleared: false,
    },
    {
      id: "camp_hills",
      name: "Greyhill Lodge",
      kind: "monsters",
      x: 0.72,
      y: 0.72,
      power: 135,
      composition: { infantry: 16, archers: 10, cavalry: 12 },
      reward: { wood: 100, stone: 140, food: 90, gold: 150 },
      cleared: false,
    },
    {
      id: "camp_ruins",
      name: "Ashen Ruins",
      kind: "ruins",
      x: 0.48,
      y: 0.82,
      power: 155,
      composition: { infantry: 18, archers: 14, cavalry: 12 },
      reward: { wood: 150, stone: 170, food: 100, gold: 190 },
      cleared: false,
    },
    {
      id: "camp_fort",
      name: "Blackridge Fort",
      kind: "ruins",
      x: 0.16,
      y: 0.78,
      power: 185,
      composition: { infantry: 22, archers: 16, cavalry: 16 },
      reward: { wood: 180, stone: 220, food: 130, gold: 260 },
      cleared: false,
    },
  ];
}

/** Sites unlock in order — must clear earlier camps first */
export function siteUnlocked(state: GameState, site: WorldSite): boolean {
  const order = state.sites.map((s) => s.id);
  const idx = order.indexOf(site.id);
  if (idx <= 0) return true;
  return state.sites.slice(0, idx).every((s) => s.cleared);
}

function makeCities(): TradeCity[] {
  return [
    {
      id: "city_easthollow",
      name: "Easthollow",
      kind: "trade",
      x: 0.16,
      y: 0.28,
      stock: { wood: 120, stone: 60, food: 160, gold: 0 },
      buyPrice: { wood: 3, stone: 4, food: 2, gold: 1 },
      sellPrice: { wood: 2, stone: 2, food: 1, gold: 1 },
      imports: ["wood"],
      exports: ["food"],
    },
    {
      id: "city_riverford",
      name: "Riverford",
      kind: "port",
      x: 0.8,
      y: 0.56,
      hasPort: true,
      stock: { wood: 80, stone: 140, food: 100, gold: 0 },
      buyPrice: { wood: 4, stone: 3, food: 3, gold: 1 },
      sellPrice: { wood: 2, stone: 2, food: 1, gold: 1 },
      imports: ["stone"],
      exports: ["food"],
    },
    {
      id: "city_stonebridge",
      name: "Stonebridge",
      kind: "trade",
      x: 0.34,
      y: 0.78,
      stock: { wood: 90, stone: 160, food: 80, gold: 0 },
      buyPrice: { wood: 3, stone: 3, food: 3, gold: 1 },
      sellPrice: { wood: 1, stone: 2, food: 1, gold: 1 },
      imports: ["food"],
      exports: ["stone"],
    },
    {
      id: "city_goldmere",
      name: "Goldmere",
      kind: "port",
      x: 0.66,
      y: 0.2,
      hasPort: true,
      stock: { wood: 60, stone: 70, food: 130, gold: 0 },
      buyPrice: { wood: 5, stone: 5, food: 2, gold: 1 },
      sellPrice: { wood: 3, stone: 3, food: 1, gold: 1 },
      imports: ["food"],
      exports: ["gold"],
    },
    {
      id: "city_thornhaven",
      name: "Thornhaven",
      kind: "port",
      x: 0.52,
      y: 0.65,
      hasPort: true,
      stock: { wood: 150, stone: 50, food: 90, gold: 0 },
      buyPrice: { wood: 2, stone: 6, food: 4, gold: 1 },
      sellPrice: { wood: 1, stone: 3, food: 2, gold: 1 },
      imports: ["stone"],
      exports: ["wood"],
    },
    {
      id: "city_saltport",
      name: "Saltport",
      kind: "port",
      x: 0.88,
      y: 0.8,
      hasPort: true,
      stock: { wood: 50, stone: 90, food: 150, gold: 0 },
      buyPrice: { wood: 6, stone: 4, food: 2, gold: 1 },
      sellPrice: { wood: 3, stone: 2, food: 1, gold: 1 },
      imports: ["wood"],
      exports: ["food"],
    },
  ];
}

export function createInitialState(): GameState {
  return {
    mode: "intro",
    resources: { wood: 200, stone: 130, food: 180, gold: 110 },
    buildings: [makeKeep()],
    troops: { infantry: 8, archers: 5, cavalry: 2 },
    garrison: { infantry: 5, archers: 4, cavalry: 1 },
    hero: {
      id: "aldric",
      name: "Sir Aldric",
      title: "Shield of the Marches",
      level: 1,
      xp: 0,
      skill: "Ironwall",
      skillDesc: "Infantry deal +25% damage while Aldric leads. Q: Rally shield wall.",
      buffTroop: "infantry",
      buffAmount: 0.25,
      skillCooldown: 0,
      skillCooldownMax: 42,
    },
    keepHp: BUILDINGS.keep.defense! * 12,
    keepMaxHp: BUILDINGS.keep.defense! * 12,
    day: 1,
    timeToRaid: 75,
    raidCount: 0,
    message: "A crown sits heavy. Raise farms, train levies, survive the raids.",
    messageTimer: 6,
    selectedBuild: null,
    selectedBuildingId: null,
    buildRotation: 0,
    paused: false,
    battle: null,
    sites: makeSites(),
    cities: makeCities(),
    selectedCityId: null,
    tutorialStep: 0,
    victory: false,
    defeat: false,
  };
}

export function keepLevel(state: GameState): number {
  const keep = state.buildings.find((b) => b.type === "keep");
  return keep?.level ?? 1;
}

/** Highest Barracks tier in the realm — sets recruit quality */
export function barracksLevel(state: GameState): number {
  let max = 0;
  for (const b of state.buildings) {
    if (b.type === "barracks") max = Math.max(max, b.level);
  }
  return max;
}

export function selectedBarracks(state: GameState): Building | undefined {
  if (!state.selectedBuildingId) return undefined;
  const b = state.buildings.find((x) => x.id === state.selectedBuildingId);
  return b?.type === "barracks" ? b : undefined;
}

export function buildingAt(state: GameState, x: number, y: number): Building | undefined {
  return state.buildings.find((b) => b.x === x && b.y === y);
}

export function fieldAt(state: GameState, x: number, y: number): FieldCell | undefined {
  for (const b of state.buildings) {
    if (!b.fields) continue;
    const f = b.fields.find((c) => c.x === x && c.y === y);
    if (f) return f;
  }
  return undefined;
}

export function hasBridgeAt(state: GameState, x: number, y: number): boolean {
  return state.buildings.some((b) => b.type === "bridge" && b.x === x && b.y === y);
}

export function hasBoatAt(state: GameState, x: number, y: number): boolean {
  return state.buildings.some((b) => b.type === "boat" && b.x === x && b.y === y);
}

export function selectedCity(state: GameState): TradeCity | undefined {
  if (!state.selectedCityId) return undefined;
  return state.cities.find((c) => c.id === state.selectedCityId);
}

export function countType(state: GameState, type: Building["type"]): number {
  return state.buildings.filter((b) => b.type === type).length;
}

export function totalTroops(t: GameState["troops"]): number {
  return t.infantry + t.archers + t.cavalry;
}

export function fieldArmy(state: GameState): GameState["troops"] {
  return {
    infantry: Math.max(0, state.troops.infantry - state.garrison.infantry),
    archers: Math.max(0, state.troops.archers - state.garrison.archers),
    cavalry: Math.max(0, state.troops.cavalry - state.garrison.cavalry),
  };
}

export function refreshKeepHpCap(state: GameState): void {
  const keep = state.buildings.find((b) => b.type === "keep");
  if (!keep) return;
  const cap = (BUILDINGS.keep.defense ?? 40) * 10 + keep.level * 80;
  const ratio = state.keepHp / Math.max(1, state.keepMaxHp);
  state.keepMaxHp = cap;
  state.keepHp = Math.min(cap, Math.max(state.keepHp, Math.floor(cap * ratio)));
}

export function wealthScore(state: GameState): number {
  const r = state.resources;
  return r.wood * 0.2 + r.stone * 0.25 + r.food * 0.15 + r.gold * 0.5;
}
