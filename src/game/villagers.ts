import { GRID_H, GRID_W } from "./config";
import { keepLevel, uid } from "./state";
import { cellBiome, isWaterBiome } from "./worldGen";
import type { GameState, Resources, Villager, VillagerJob } from "./types";

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
};

export const JOB_HINTS: Record<VillagerJob, string> = {
  idle: "Strolls near the Keep.",
  woodcutter: "Walks to forest and brings back wood.",
  farmer: "Works farms and fields for food.",
  quarryman: "Works quarries / rocky ground for stone.",
  miner: "Works mines for stone and gold.",
  trader: "Visits markets and the Keep for gold.",
};

const WORK_YIELD: Record<VillagerJob, Partial<Resources>> = {
  idle: {},
  woodcutter: { wood: 2.2 },
  farmer: { food: 2.4 },
  quarryman: { stone: 1.8 },
  miner: { stone: 1.0, gold: 0.45 },
  trader: { gold: 0.9 },
};

const WORK_DURATION = 3.6;
const WALK_SPEED = 2.4;
const ARRIVE = 0.35;

function keepCell(state: GameState): { x: number; y: number } {
  const keep = state.buildings.find((b) => b.type === "keep");
  return keep
    ? { x: keep.x, y: keep.y }
    : { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) };
}

function walkable(state: GameState, gx: number, gy: number): boolean {
  if (gx < 1 || gy < 1 || gx >= GRID_W - 1 || gy >= GRID_H - 1) return false;
  const biome = cellBiome(gx, gy, state.buildings);
  if (!isWaterBiome(biome)) return true;
  return state.buildings.some(
    (b) => b.x === gx && b.y === gy && (b.type === "bridge" || b.type === "boat" || b.type === "road"),
  );
}

function randName(used: Set<string>): string {
  for (let i = 0; i < NAMES.length; i++) {
    const n = NAMES[Math.floor(Math.random() * NAMES.length)];
    if (!used.has(n)) return n;
  }
  return `Serf ${used.size + 1}`;
}

function desiredVillagerCount(state: GameState): number {
  return Math.min(16, 6 + keepLevel(state) * 2);
}

function spawnNearKeep(state: GameState): Villager {
  const k = keepCell(state);
  const used = new Set(state.villagers.map((v) => v.name));
  const ox = (Math.random() - 0.5) * 10;
  const oy = (Math.random() - 0.5) * 10;
  const x = Math.max(2, Math.min(GRID_W - 3, k.x + ox));
  const y = Math.max(2, Math.min(GRID_H - 3, k.y + oy));
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
  };
}

export function ensureVillagers(state: GameState): void {
  const want = desiredVillagerCount(state);
  const before = state.villagers.length;
  while (state.villagers.length < want) {
    state.villagers.push(spawnNearKeep(state));
  }
  if (before === 0 && state.villagers.length > 0) {
    seedVillagerJobs(state);
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
  if (!walkable(state, gx, gy)) return -1;
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

  // Prefer buildings of the matching type first
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

  // Scan a ring around keep / villager for biome work
  if (job === "woodcutter" || job === "quarryman" || job === "idle") {
    const cx = Math.round(job === "idle" ? k.x : originX);
    const cy = Math.round(job === "idle" ? k.y : originY);
    const radius = job === "idle" ? 8 : 28;
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
  const site = findJobSite(state, v, v.job);
  if (!site) {
    v.tx = v.x;
    v.ty = v.y;
    v.workGx = null;
    v.workGy = null;
    return false;
  }
  v.tx = site.x + 0.5;
  v.ty = site.y + 0.5;
  v.workGx = site.x;
  v.workGy = site.y;
  v.phase = "walk";
  v.workTimer = 0;
  return true;
}

export function setVillagerJob(state: GameState, id: string, job: VillagerJob): boolean {
  const v = state.villagers.find((x) => x.id === id);
  if (!v) return false;
  v.job = job;
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

/** Send selected villager to a clicked cell as their workplace */
export function setVillagerWorkplace(
  state: GameState,
  id: string,
  gx: number,
  gy: number,
): boolean {
  const v = state.villagers.find((x) => x.id === id);
  if (!v) return false;
  if (!walkable(state, gx, gy)) {
    tell(state, "They cannot work in the water — bridge it or pick land.", 3);
    return false;
  }
  // Infer a sensible job from the destination if currently idle
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
  v.tx = gx + 0.5;
  v.ty = gy + 0.5;
  v.phase = "walk";
  v.workTimer = 0;
  state.assignWorkplace = false;
  tell(state, `${v.name} heads out to ${JOB_LABELS[v.job].toLowerCase()} at (${gx}, ${gy}).`, 3);
  return true;
}

function stepToward(v: Villager, state: GameState, dt: number): void {
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const dist = Math.hypot(dx, dy);
  if (dist < ARRIVE) {
    v.x = v.tx;
    v.y = v.ty;
    return;
  }
  const step = Math.min(dist, WALK_SPEED * dt);
  const nx = v.x + (dx / dist) * step;
  const ny = v.y + (dy / dist) * step;
  const gx = Math.floor(nx);
  const gy = Math.floor(ny);
  if (walkable(state, gx, gy)) {
    v.x = nx;
    v.y = ny;
  } else {
    // Sidestep around water / cliffs
    const tryA = { x: v.x + Math.sign(dx) * step, y: v.y };
    const tryB = { x: v.x, y: v.y + Math.sign(dy) * step };
    if (walkable(state, Math.floor(tryA.x), Math.floor(tryA.y))) {
      v.x = tryA.x;
    } else if (walkable(state, Math.floor(tryB.x), Math.floor(tryB.y))) {
      v.y = tryB.y;
    } else {
      assignJobSite(state, v);
    }
  }
}

function deliverWork(state: GameState, v: Villager): void {
  const yieldAmt = WORK_YIELD[v.job];
  for (const key of Object.keys(yieldAmt) as (keyof Resources)[]) {
    state.resources[key] += yieldAmt[key] ?? 0;
  }
}

export function tickVillagers(state: GameState, dt: number): void {
  if (state.mode !== "village" || state.defeat || state.victory) return;
  ensureVillagers(state);

  for (const v of state.villagers) {
    v.anim += dt * (v.phase === "walk" ? 8 : 3);

    if (v.phase === "walk") {
      stepToward(v, state, dt);
      if (Math.hypot(v.tx - v.x, v.ty - v.y) < ARRIVE) {
        if (v.job === "idle") {
          // Pick a new stroll spot
          assignJobSite(state, v);
        } else {
          v.phase = "work";
          v.workTimer = WORK_DURATION * (0.85 + Math.random() * 0.3);
        }
      }
      continue;
    }

    // Working in place
    v.workTimer -= dt;
    if (v.workTimer <= 0) {
      deliverWork(state, v);
      // Sometimes wander a bit then return, sometimes re-pick site
      const wx = v.workGx;
      const wy = v.workGy;
      if (Math.random() < 0.35 || wx == null || wy == null) {
        assignJobSite(state, v);
      } else {
        v.tx = wx + 0.5 + (Math.random() - 0.5) * 0.6;
        v.ty = wy + 0.5 + (Math.random() - 0.5) * 0.6;
        v.phase = "walk";
      }
    }
  }
}

export function selectedVillager(state: GameState): Villager | undefined {
  if (!state.selectedVillagerId) return undefined;
  return state.villagers.find((v) => v.id === state.selectedVillagerId);
}

export function villagerJobYieldLabel(job: VillagerJob): string {
  const y = WORK_YIELD[job];
  const parts: string[] = [];
  if (y.wood) parts.push(`+${y.wood} wood`);
  if (y.stone) parts.push(`+${y.stone} stone`);
  if (y.food) parts.push(`+${y.food} food`);
  if (y.gold) parts.push(`+${y.gold} gold`);
  return parts.length ? `${parts.join(", ")} / haul` : "No yield";
}
