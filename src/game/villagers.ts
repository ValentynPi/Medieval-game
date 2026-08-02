import { GRID_H, GRID_W, HIRE_BUILDER_COST, canAfford, pay } from "./config";
import { findPath, isFootWalkable, nearestWalkable } from "./pathfind";
import { keepLevel, uid } from "./state";
import { cellBiome } from "./worldGen";
import type {
  ConstructionSite,
  GameState,
  Resources,
  Villager,
  VillagerJob,
} from "./types";

function tell(state: GameState, text: string, seconds = 3): void {
  state.message = text;
  state.messageTimer = seconds;
}

const NAMES = [
  "Edda",
  "Bram",
  "Mira",
  "Oswin",
  "Greta",
  "Torin",
  "Lina",
  "Haldor",
  "Sigrid",
  "Rowan",
  "Elric",
  "Nessa",
  "Cedric",
  "Willa",
  "Fen",
  "Anya",
];

export const JOB_LABELS: Record<VillagerJob, string> = {
  idle: "Idle wander",
  woodcutter: "Chop wood",
  farmer: "Tend crops",
  quarryman: "Cut stone",
  miner: "Mine ore",
  trader: "Trade goods",
  builder: "Build houses",
};

export const JOB_HINTS: Record<VillagerJob, string> = {
  idle: "Strolls near the Keep — never walks rivers without a bridge.",
  woodcutter: "Takes forest paths and brings back wood.",
  farmer: "Works farms and fields for food.",
  quarryman: "Works quarries / rocky ground for stone.",
  miner: "Works mines for stone and gold.",
  trader: "Visits markets and the Keep for gold.",
  builder: "Hired at the Builders Hall — walks to sites and raises buildings.",
};

const WORK_YIELD: Record<VillagerJob, Partial<Resources>> = {
  idle: {},
  woodcutter: { wood: 2.2 },
  farmer: { food: 2.4 },
  quarryman: { stone: 1.8 },
  miner: { stone: 1.0, gold: 0.45 },
  trader: { gold: 0.9 },
  builder: {},
};

const WORK_DURATION = 3.6;
const BASE_WALK = 2.15;
const ARRIVE = 0.28;

function keepCell(state: GameState): { x: number; y: number } {
  const keep = state.buildings.find((b) => b.type === "keep");
  return keep
    ? { x: keep.x, y: keep.y }
    : { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) };
}

function randName(used: Set<string>): string {
  for (let i = 0; i < NAMES.length; i++) {
    const n = NAMES[Math.floor(Math.random() * NAMES.length)];
    if (!used.has(n)) return n;
  }
  return `Serf ${used.size + 1}`;
}

function desiredVillagerCount(state: GameState): number {
  const builders = state.villagers.filter((v) => v.job === "builder").length;
  return Math.min(16, 6 + keepLevel(state) * 2) + builders;
}

function blankPath(): { x: number; y: number }[] {
  return [];
}

function spawnNearKeep(state: GameState): Villager {
  const k = keepCell(state);
  const used = new Set(state.villagers.map((v) => v.name));
  let x = k.x;
  let y = k.y;
  for (let tries = 0; tries < 24; tries++) {
    const ox = (Math.random() - 0.5) * 12;
    const oy = (Math.random() - 0.5) * 12;
    const nx = Math.max(2, Math.min(GRID_W - 3, k.x + ox));
    const ny = Math.max(2, Math.min(GRID_H - 3, k.y + oy));
    const land = nearestWalkable(state, nx, ny, 8);
    if (land) {
      x = land.x + 0.5;
      y = land.y + 0.5;
      break;
    }
  }
  return {
    id: uid("vil"),
    name: randName(used),
    job: "idle",
    x,
    y,
    tx: x,
    ty: y,
    phase: "walk",
    workTimer: 0,
    anim: Math.random() * Math.PI * 2,
    workGx: null,
    workGy: null,
    path: blankPath(),
    pathI: 0,
    pace: 0.88 + Math.random() * 0.28,
    pause: Math.random() * 1.5,
    siteId: null,
  };
}

function setDestination(state: GameState, v: Villager, tx: number, ty: number): boolean {
  const path = findPath(state, v.x, v.y, tx, ty);
  if (!path || !path.length) {
    v.path = [];
    v.pathI = 0;
    v.tx = v.x;
    v.ty = v.y;
    return false;
  }
  v.path = path;
  v.pathI = 0;
  v.tx = path[0].x;
  v.ty = path[0].y;
  v.phase = v.job === "builder" && v.siteId ? "walk" : "walk";
  v.pause = Math.random() < 0.2 ? 0.4 + Math.random() * 0.8 : 0;
  return true;
}

export function ensureVillagers(state: GameState): void {
  const want = desiredVillagerCount(state);
  const before = state.villagers.length;
  while (state.villagers.length < want) {
    // Cap non-builder serfs separately — builders are hired
    const serfs = state.villagers.filter((v) => v.job !== "builder").length;
    const serfCap = Math.min(16, 6 + keepLevel(state) * 2);
    if (serfs >= serfCap) break;
    state.villagers.push(spawnNearKeep(state));
  }
  if (before === 0 && state.villagers.length > 0) {
    seedVillagerJobs(state);
  }
  // Rescue anyone stranded on water
  for (const v of state.villagers) {
    if (!isFootWalkable(state, Math.floor(v.x), Math.floor(v.y))) {
      const land = nearestWalkable(state, v.x, v.y, 16);
      if (land) {
        v.x = land.x + 0.5;
        v.y = land.y + 0.5;
        v.path = [];
        v.pathI = 0;
      }
    }
  }
}

export function seedVillagerJobs(state: GameState): void {
  const starters: VillagerJob[] = ["farmer", "woodcutter", "quarryman", "idle", "idle", "trader"];
  state.villagers.forEach((v, i) => {
    if (v.job !== "idle") return;
    const job = starters[i] ?? "idle";
    if (job === "idle") {
      assignJobSite(state, v);
      return;
    }
    v.job = job;
    assignJobSite(state, v);
  });
}

function scoreSite(
  state: GameState,
  job: VillagerJob,
  gx: number,
  gy: number,
  fromX: number,
  fromY: number,
): number {
  if (!isFootWalkable(state, gx, gy)) return -1;
  const biome = cellBiome(gx, gy, state.buildings);
  const b = state.buildings.find((x) => x.x === gx && x.y === gy);
  let ok = false;
  if (job === "woodcutter") {
    ok = biome === "forest" || biome === "deep_forest" || b?.type === "forest" || b?.type === "lumber";
  } else if (job === "farmer") {
    ok =
      b?.type === "farm" ||
      state.buildings.some((f) => f.type === "farm" && f.fields?.some((c) => c.x === gx && c.y === gy));
  } else if (job === "quarryman") {
    ok = b?.type === "quarry" || biome === "rocky" || biome === "mountain";
  } else if (job === "miner") {
    ok = b?.type === "mine";
  } else if (job === "trader") {
    ok = b?.type === "market" || b?.type === "keep";
  } else if (job === "builder") {
    ok = b?.type === "buildersHall" || biome === "meadow" || biome === "path";
  } else {
    ok = biome === "meadow" || biome === "path" || b?.type === "road";
  }
  if (!ok) return -1;
  const dist = Math.hypot(gx - fromX, gy - fromY);
  return 1000 - dist + Math.random() * 8;
}

function findJobSite(
  state: GameState,
  v: Villager,
  job: VillagerJob,
): { x: number; y: number } | null {
  const k = keepCell(state);
  const originX = v.x;
  const originY = v.y;
  let best: { x: number; y: number; s: number } | null = null;

  for (const b of state.buildings) {
    const s = scoreSite(state, job, b.x, b.y, originX, originY);
    if (s > (best?.s ?? -1)) best = { x: b.x, y: b.y, s };
    if (b.type === "farm" && job === "farmer" && b.fields) {
      for (const f of b.fields) {
        const fs = scoreSite(state, job, f.x, f.y, originX, originY);
        if (fs > (best?.s ?? -1)) best = { x: f.x, y: f.y, s: fs };
      }
    }
  }

  if (job === "woodcutter" || job === "quarryman" || job === "idle" || job === "builder") {
    const cx = Math.round(job === "idle" || job === "builder" ? k.x : originX);
    const cy = Math.round(job === "idle" || job === "builder" ? k.y : originY);
    const radius = job === "idle" || job === "builder" ? 8 : 28;
    for (let dy = -radius; dy <= radius; dy += 2) {
      for (let dx = -radius; dx <= radius; dx += 2) {
        const gx = cx + dx;
        const gy = cy + dy;
        const s = scoreSite(state, job, gx, gy, originX, originY);
        if (s > (best?.s ?? -1)) best = { x: gx, y: gy, s };
      }
    }
  }

  return best ? { x: best.x, y: best.y } : null;
}

export function assignJobSite(state: GameState, v: Villager): boolean {
  if (v.job === "builder") {
    const hall = state.buildings.find((b) => b.type === "buildersHall");
    if (hall) {
      v.workGx = hall.x;
      v.workGy = hall.y;
      return setDestination(state, v, hall.x + 0.5, hall.y + 0.5);
    }
  }
  const site = findJobSite(state, v, v.job);
  if (!site) {
    v.tx = v.x;
    v.ty = v.y;
    v.workGx = null;
    v.workGy = null;
    v.path = [];
    return false;
  }
  v.workGx = site.x;
  v.workGy = site.y;
  return setDestination(state, v, site.x + 0.5, site.y + 0.5);
}

export function setVillagerJob(state: GameState, id: string, job: VillagerJob): boolean {
  const v = state.villagers.find((x) => x.id === id);
  if (!v) return false;
  if (job === "builder") {
    tell(state, "Builders are hired at the Builders Hall — they are not assigned from the street.", 4);
    return false;
  }
  if (v.job === "builder") {
    tell(state, `${v.name} is a hired builder — dismiss them at the Hall to reassign.`, 4);
    return false;
  }
  v.job = job;
  v.siteId = null;
  const ok = assignJobSite(state, v);
  if (!ok && job !== "idle") {
    tell(
      state,
      `${v.name} needs a place to ${JOB_LABELS[job].toLowerCase()} — build or click a workplace.`,
      4,
    );
  } else {
    tell(state, `${v.name} will ${JOB_LABELS[job].toLowerCase()}.`, 3);
  }
  return true;
}

export function setVillagerWorkplace(
  state: GameState,
  id: string,
  gx: number,
  gy: number,
): boolean {
  const v = state.villagers.find((x) => x.id === id);
  if (!v) return false;
  if (v.job === "builder") {
    tell(state, `${v.name} follows construction sites, not manual workplaces.`, 3);
    return false;
  }
  if (!isFootWalkable(state, gx, gy)) {
    tell(state, "No path — rivers need a Bridge before anyone can cross.", 3);
    return false;
  }
  if (v.job === "idle") {
    const biome = cellBiome(gx, gy, state.buildings);
    const b = state.buildings.find((x) => x.x === gx && x.y === gy);
    if (b?.type === "farm" || state.buildings.some((f) => f.fields?.some((c) => c.x === gx && c.y === gy))) {
      v.job = "farmer";
    } else if (b?.type === "lumber" || biome === "forest" || biome === "deep_forest" || b?.type === "forest") {
      v.job = "woodcutter";
    } else if (b?.type === "quarry" || biome === "rocky" || biome === "mountain") {
      v.job = "quarryman";
    } else if (b?.type === "mine") {
      v.job = "miner";
    } else if (b?.type === "market" || b?.type === "keep") {
      v.job = "trader";
    }
  }
  v.workGx = gx;
  v.workGy = gy;
  v.siteId = null;
  state.assignWorkplace = false;
  if (!setDestination(state, v, gx + 0.5, gy + 0.5)) {
    tell(state, `${v.name} cannot reach that spot without a bridge path.`, 3);
    return false;
  }
  tell(state, `${v.name} heads out to ${JOB_LABELS[v.job].toLowerCase()}.`, 3);
  return true;
}

function hallLevel(state: GameState): number {
  let max = 0;
  for (const b of state.buildings) {
    if (b.type === "buildersHall") max = Math.max(max, b.level);
  }
  return max;
}

export function builderCap(state: GameState): number {
  const lv = hallLevel(state);
  return lv > 0 ? lv * 3 : 0;
}

export function builderCount(state: GameState): number {
  return state.villagers.filter((v) => v.job === "builder").length;
}

export function hireBuilder(state: GameState): boolean {
  const hall = state.buildings.find((b) => b.type === "buildersHall");
  if (!hall) {
    tell(state, "Raise a Builders Hall first, then hire a crew.", 4);
    return false;
  }
  if (builderCount(state) >= builderCap(state)) {
    tell(state, `Crew full — upgrade the Hall for more builders (${builderCap(state)} max).`, 4);
    return false;
  }
  if (!canAfford(state.resources, HIRE_BUILDER_COST)) {
    tell(state, "Need more food and gold to hire a builder.", 3);
    return false;
  }
  state.resources = pay(state.resources, HIRE_BUILDER_COST);
  const v = spawnNearKeep(state);
  v.job = "builder";
  v.x = hall.x + 0.5 + (Math.random() - 0.5);
  v.y = hall.y + 0.5 + (Math.random() - 0.5);
  if (!isFootWalkable(state, Math.floor(v.x), Math.floor(v.y))) {
    const land = nearestWalkable(state, hall.x, hall.y, 6);
    if (land) {
      v.x = land.x + 0.5;
      v.y = land.y + 0.5;
    }
  }
  assignJobSite(state, v);
  state.villagers.push(v);
  tell(state, `${v.name} joins the building crew.`, 3);
  return true;
}

function separateFromCrowd(state: GameState, v: Villager, dt: number): void {
  let sx = 0;
  let sy = 0;
  for (const o of state.villagers) {
    if (o.id === v.id) continue;
    const dx = v.x - o.x;
    const dy = v.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.55 && d > 0.01) {
      sx += dx / d;
      sy += dy / d;
    }
  }
  if (sx === 0 && sy === 0) return;
  const len = Math.hypot(sx, sy) || 1;
  const nx = v.x + (sx / len) * 0.9 * dt;
  const ny = v.y + (sy / len) * 0.9 * dt;
  if (isFootWalkable(state, Math.floor(nx), Math.floor(ny))) {
    v.x = nx;
    v.y = ny;
  }
}

function followPath(state: GameState, v: Villager, dt: number): boolean {
  if (v.pause > 0) {
    v.pause -= dt;
    return false;
  }
  if (!v.path.length) return true;

  const target = v.path[Math.min(v.pathI, v.path.length - 1)];
  v.tx = target.x;
  v.ty = target.y;
  const dx = target.x - v.x;
  const dy = target.y - v.y;
  const dist = Math.hypot(dx, dy);
  if (dist < ARRIVE) {
    v.pathI += 1;
    if (v.pathI >= v.path.length) {
      v.x = target.x;
      v.y = target.y;
      v.path = [];
      v.pathI = 0;
      // Occasional look-around pause at arrival
      v.pause = 0.15 + Math.random() * 0.45;
      return true;
    }
    // Micro-pause at turns feels human
    if (Math.random() < 0.18) v.pause = 0.12 + Math.random() * 0.35;
    return false;
  }

  const speed = BASE_WALK * v.pace * (0.92 + Math.sin(v.anim * 0.7) * 0.08);
  const step = Math.min(dist, speed * dt);
  const nx = v.x + (dx / dist) * step;
  const ny = v.y + (dy / dist) * step;
  const cellX = Math.floor(nx);
  const cellY = Math.floor(ny);
  if (isFootWalkable(state, cellX, cellY)) {
    v.x = nx;
    v.y = ny;
  } else {
    // Path went stale (bridge removed?) — repath
    const goal = v.path[v.path.length - 1];
    if (!setDestination(state, v, goal.x, goal.y)) {
      v.path = [];
      assignJobSite(state, v);
    }
  }
  separateFromCrowd(state, v, dt);
  return false;
}

function deliverWork(state: GameState, v: Villager): void {
  const yieldAmt = WORK_YIELD[v.job];
  for (const key of Object.keys(yieldAmt) as (keyof Resources)[]) {
    state.resources[key] += yieldAmt[key] ?? 0;
  }
}

function claimConstruction(state: GameState, v: Villager): ConstructionSite | null {
  if (v.job !== "builder" || v.siteId) {
    return v.siteId ? state.constructionSites.find((s) => s.id === v.siteId) ?? null : null;
  }
  const free = state.constructionSites.find((s) => !s.builderId);
  if (!free) return null;
  free.builderId = v.id;
  v.siteId = free.id;
  setDestination(state, v, free.x + 0.5, free.y + 0.5);
  return free;
}

/** Called from systems when a site finishes — kept here to avoid cycles for hire/path only */
export type FinishSiteFn = (state: GameState, site: ConstructionSite) => void;

let finishSiteHandler: FinishSiteFn | null = null;

export function registerFinishSite(fn: FinishSiteFn): void {
  finishSiteHandler = fn;
}

function tickBuilders(state: GameState, dt: number): void {
  for (const v of state.villagers) {
    if (v.job !== "builder") continue;
    let site = claimConstruction(state, v);
    if (!site && v.siteId) {
      site = state.constructionSites.find((s) => s.id === v.siteId) ?? null;
      if (!site) {
        v.siteId = null;
        v.phase = "walk";
        assignJobSite(state, v);
      }
    }
    if (!site) {
      if (v.phase === "build") v.phase = "walk";
      if (!v.path.length && Math.hypot(v.tx - v.x, v.ty - v.y) < ARRIVE) {
        if (Math.random() < dt * 0.15) assignJobSite(state, v);
      }
      continue;
    }

    if (v.phase !== "build") {
      const arrived = followPath(state, v, dt);
      if (arrived || Math.hypot(site.x + 0.5 - v.x, site.y + 0.5 - v.y) < 0.55) {
        v.phase = "build";
        v.path = [];
      }
      continue;
    }

    // Build at site
    const hall = hallLevel(state);
    const rate = 0.1 + hall * 0.035;
    site.progress = Math.min(1, site.progress + rate * dt);
    v.anim += dt * 10;
    if (site.progress >= 1) {
      finishSiteHandler?.(state, site);
      v.siteId = null;
      v.phase = "walk";
      assignJobSite(state, v);
    }
  }
}

export function tickVillagers(state: GameState, dt: number): void {
  if (state.mode !== "village" || state.defeat || state.victory) return;
  ensureVillagers(state);
  tickBuilders(state, dt);

  for (const v of state.villagers) {
    if (v.job === "builder") continue;
    v.anim += dt * (v.phase === "walk" ? 7.5 : 3.2);

    if (v.phase === "walk") {
      const arrived = followPath(state, v, dt);
      if (arrived) {
        if (v.job === "idle") {
          assignJobSite(state, v);
        } else {
          v.phase = "work";
          v.workTimer = WORK_DURATION * (0.85 + Math.random() * 0.3);
        }
      }
      continue;
    }

    v.workTimer -= dt;
    if (v.workTimer <= 0) {
      deliverWork(state, v);
      const wx = v.workGx;
      const wy = v.workGy;
      if (Math.random() < 0.35 || wx == null || wy == null) {
        assignJobSite(state, v);
      } else {
        v.phase = "walk";
        setDestination(state, v, wx + 0.5 + (Math.random() - 0.5) * 0.5, wy + 0.5 + (Math.random() - 0.5) * 0.5);
      }
    }
  }
}

export function selectedVillager(state: GameState): Villager | undefined {
  if (!state.selectedVillagerId) return undefined;
  return state.villagers.find((v) => v.id === state.selectedVillagerId);
}

export function villagerJobYieldLabel(job: VillagerJob): string {
  if (job === "builder") return "Raises buildings";
  const y = WORK_YIELD[job];
  const parts: string[] = [];
  if (y.wood) parts.push(`+${y.wood} wood`);
  if (y.stone) parts.push(`+${y.stone} stone`);
  if (y.food) parts.push(`+${y.food} food`);
  if (y.gold) parts.push(`+${y.gold} gold`);
  return parts.length ? `${parts.join(", ")} / haul` : "No yield";
}
