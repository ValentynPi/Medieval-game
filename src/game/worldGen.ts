import { GRID_H, GRID_W, TILE } from "./config";

export type Biome =
  | "meadow"
  | "path"
  | "forest"
  | "deep_forest"
  | "rocky"
  | "mountain"
  | "water"
  | "water_shore";

export interface TreeSlot {
  x: number;
  z: number;
  scale: number;
  variant: 0 | 1 | 2;
  rotation: number;
}

export interface RockSlot {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  tall?: boolean;
}

export interface PathSegment {
  cx: number;
  cz: number;
  width: number;
  length: number;
  angle: number;
}

export interface GrassPatch {
  x: number;
  z: number;
  radius: number;
  color: string;
}

export interface WaterCell {
  gx: number;
  gy: number;
}

export interface Landmark {
  gx: number;
  gy: number;
  name: string;
  kind: "town";
}

export interface WorldLayout {
  rev: number;
  seed: number;
  centerGx: number;
  centerGy: number;
  biomes: Biome[][];
  trees: TreeSlot[];
  rocks: RockSlot[];
  paths: PathSegment[];
  grassPatches: GrassPatch[];
  waterCells: WaterCell[];
  mountainCells: WaterCell[];
  landmarks: Landmark[];
  waterZ: number;
}

const WORLD_SEED = 42857;
/** Data slots only — scene renders nearby chunks so FPS stays stable */
const MAX_TREES = 28000;
const MAX_ROCKS = 220;
const MAX_GRASS = 80;
const LAYOUT_REV = 5;

function hash(gx: number, gy: number, seed: number): number {
  let n = gx * 374761 + gy * 668265 + seed * 982451;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function noise2(gx: number, gy: number, seed: number): number {
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(gx: number, gy: number, seed: number): number {
  return (
    noise2(gx * 0.035, gy * 0.035, seed) * 0.55 +
    noise2(gx * 0.08, gy * 0.08, seed + 11) * 0.3 +
    noise2(gx * 0.16, gy * 0.16, seed + 29) * 0.15
  );
}

function distToCenter(gx: number, gy: number, cx: number, cy: number): number {
  return Math.hypot(gx - cx, gy - cy);
}

function riverDist(gx: number, gy: number): number {
  const mainY = GRID_H * 0.4 + Math.sin(gx * 0.055) * 22 + Math.sin(gx * 0.12) * 6;
  const branchX = GRID_W * 0.62 + Math.sin(gy * 0.065) * 18;
  const dMain = Math.abs(gy - mainY);
  const dBranch = gx > GRID_W * 0.4 ? Math.abs(gx - branchX) : 999;
  return Math.min(dMain, dBranch);
}

function inLake(gx: number, gy: number): number {
  const lakes = [
    { x: GRID_W * 0.16, y: GRID_H * 0.25, r: 16 },
    { x: GRID_W * 0.82, y: GRID_H * 0.58, r: 19 },
    { x: GRID_W * 0.52, y: GRID_H * 0.14, r: 12 },
    { x: GRID_W * 0.35, y: GRID_H * 0.82, r: 14 },
    { x: GRID_W * 0.68, y: GRID_H * 0.32, r: 10 },
  ];
  let best = 999;
  for (const l of lakes) {
    best = Math.min(best, Math.hypot(gx - l.x, gy - l.y));
  }
  return best;
}

function mountainStrength(gx: number, gy: number, seed: number): number {
  const ranges = [
    { x: GRID_W * 0.12, y: GRID_H * 0.68, r: 32 },
    { x: GRID_W * 0.88, y: GRID_H * 0.22, r: 30 },
    { x: GRID_W * 0.72, y: GRID_H * 0.74, r: 24 },
    { x: GRID_W * 0.28, y: GRID_H * 0.18, r: 26 },
    { x: GRID_W * 0.62, y: GRID_H * 0.45, r: 20 },
  ];
  let best = 0;
  for (const r of ranges) {
    const d = Math.hypot(gx - r.x, gy - r.y) / r.r;
    if (d < 1) best = Math.max(best, 1 - d);
  }
  return best * (0.5 + fbm(gx, gy, seed + 400) * 0.5);
}

function classifyBiome(gx: number, gy: number, cx: number, cy: number, seed: number): Biome {
  const lakeD = inLake(gx, gy);
  if (lakeD < 0.7) return "water";
  if (lakeD < 1.5) return "water_shore";

  const rd = riverDist(gx, gy);
  if (rd < 2.2) return "water";
  if (rd < 3.4) return "water_shore";

  const m = mountainStrength(gx, gy, seed);
  if (m > 0.55) return "mountain";
  if (m > 0.28) return "rocky";

  const d = distToCenter(gx, gy, cx, cy);
  if (d <= 10) return "meadow";

  const edgeDist = Math.min(gx, gy, GRID_W - 1 - gx, GRID_H - 1 - gy);
  const n = fbm(gx, gy, seed);

  if (edgeDist <= 3) return n > 0.25 ? "deep_forest" : "forest";
  if (n > 0.6) return "deep_forest";
  if (n > 0.4) return "forest";
  return d < 24 ? "meadow" : "forest";
}

function cellWorld(gx: number, gy: number): { x: number; z: number } {
  return {
    x: gx * TILE + (hash(gx, gy, 3) - 0.5) * TILE * 0.35,
    z: gy * TILE + (hash(gx, gy, 7) - 0.5) * TILE * 0.35,
  };
}

function treeCountForBiome(b: Biome, gx: number, gy: number, seed: number): number {
  const r = hash(gx, gy, seed + 500);
  switch (b) {
    case "deep_forest":
      // Very dense woods
      if (r > 0.12) return 1 + (r > 0.55 ? 1 : 0) + (r > 0.88 ? 1 : 0);
      return 0;
    case "forest":
      if (r > 0.2) return 1 + (r > 0.72 ? 1 : 0);
      return 0;
    case "rocky":
      return r > 0.82 ? 1 : 0;
    case "meadow":
      return r > 0.9 ? 1 : 0;
    case "water_shore":
      return r > 0.93 ? 1 : 0;
    default:
      return 0;
  }
}

function biomeGrassColor(b: Biome): string {
  switch (b) {
    case "meadow":
      return "#6faa58";
    case "path":
      return "#5a9048";
    case "forest":
      return "#4a8040";
    case "deep_forest":
      return "#3a6834";
    case "rocky":
      return "#5a7a48";
    case "mountain":
      return "#6a7068";
    case "water_shore":
      return "#4a8a68";
    case "water":
      return "#3a6a7a";
    default:
      return "#5a9348";
  }
}

export function generateWorldLayout(seed = WORLD_SEED): WorldLayout {
  const centerGx = Math.floor(GRID_W / 2) - 1;
  const centerGy = Math.floor(GRID_H / 2) - 1;
  const biomes: Biome[][] = [];

  for (let gy = 0; gy < GRID_H; gy++) {
    const row: Biome[] = [];
    for (let gx = 0; gx < GRID_W; gx++) {
      row.push(classifyBiome(gx, gy, centerGx, centerGy, seed));
    }
    biomes.push(row);
  }

  // Clear a meadow bowl around the Keep so the village can grow
  for (let gy = centerGy - 8; gy <= centerGy + 8; gy++) {
    for (let gx = centerGx - 8; gx <= centerGx + 8; gx++) {
      if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) continue;
      if (distToCenter(gx, gy, centerGx, centerGy) <= 8) {
        const b = biomes[gy][gx];
        if (b === "water" || b === "water_shore" || b === "mountain") continue;
        biomes[gy][gx] = "meadow";
      }
    }
  }

  // Fix: scatter forest pockets into open meadows so woods dominate the map
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const b = biomes[gy][gx];
      if (b === "meadow" && hash(gx, gy, seed + 9000) > 0.45) {
        biomes[gy][gx] = hash(gx, gy, seed + 9001) > 0.6 ? "deep_forest" : "forest";
      }
    }
  }

  const trees: TreeSlot[] = [];
  const rocks: RockSlot[] = [];
  const grassPatches: GrassPatch[] = [];
  const waterCells: WaterCell[] = [];
  const mountainCells: WaterCell[] = [];

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const b = biomes[gy][gx];
      if (b === "water" || b === "water_shore") waterCells.push({ gx, gy });
      if (b === "mountain") mountainCells.push({ gx, gy });

      if (b === "water" || b === "water_shore") continue;
      if (b === "meadow" && distToCenter(gx, gy, centerGx, centerGy) < 6) continue;

      const { x, z } = cellWorld(gx, gy);

      if (grassPatches.length < MAX_GRASS && hash(gx, gy, seed + 100) > 0.965) {
        grassPatches.push({
          x,
          z,
          radius: 1.2 + hash(gx, gy, seed + 101) * 1.4,
          color: biomeGrassColor(b),
        });
      }

      if (trees.length < MAX_TREES) {
        const count = treeCountForBiome(b, gx, gy, seed);
        for (let t = 0; t < count; t++) {
          if (trees.length >= MAX_TREES) break;
          const jx = (hash(gx, gy, seed + t * 17) - 0.5) * TILE * 0.75;
          const jz = (hash(gx, gy, seed + t * 31) - 0.5) * TILE * 0.75;
          trees.push({
            x: x + jx,
            z: z + jz,
            scale: 0.65 + hash(gx, gy, seed + t * 43) * 0.85,
            variant: Math.floor(hash(gx, gy, seed + t * 59) * 3) as 0 | 1 | 2,
            rotation: hash(gx, gy, seed + t * 71) * Math.PI * 2,
          });
        }
      }

      if ((b === "rocky" || b === "mountain") && rocks.length < MAX_ROCKS) {
        const chance = b === "mountain" ? 0.35 : 0.55;
        if (hash(gx, gy, seed + 800) < chance) {
          rocks.push({
            x: x + (hash(gx, gy, seed) - 0.5) * TILE * 0.4,
            z: z + (hash(gx, gy, seed + 50) - 0.5) * TILE * 0.4,
            scale: (b === "mountain" ? 1.2 : 0.7) + hash(gx, gy, seed + 100) * 0.8,
            rotation: hash(gx, gy, seed + 150) * Math.PI * 2,
            tall: b === "mountain",
          });
        }
      }
    }
  }

  const landmarks: Landmark[] = [
    { gx: Math.floor(GRID_W * 0.16), gy: Math.floor(GRID_H * 0.28), name: "Easthollow", kind: "town" },
    { gx: Math.floor(GRID_W * 0.8), gy: Math.floor(GRID_H * 0.56), name: "Riverford", kind: "town" },
    { gx: Math.floor(GRID_W * 0.34), gy: Math.floor(GRID_H * 0.78), name: "Stonebridge", kind: "town" },
    { gx: Math.floor(GRID_W * 0.66), gy: Math.floor(GRID_H * 0.2), name: "Goldmere", kind: "town" },
    { gx: Math.floor(GRID_W * 0.52), gy: Math.floor(GRID_H * 0.65), name: "Thornhaven", kind: "town" },
  ];

  for (const town of landmarks) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const gx = town.gx + dx;
        const gy = town.gy + dy;
        if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) continue;
        const b = biomes[gy][gx];
        if (b === "water" || b === "mountain") continue;
        biomes[gy][gx] = "meadow";
      }
    }
  }

  return {
    rev: LAYOUT_REV,
    seed,
    centerGx,
    centerGy,
    biomes,
    trees,
    rocks,
    paths: [],
    grassPatches,
    waterCells,
    mountainCells,
    landmarks,
    waterZ: -2,
  };
}

let cachedLayout: WorldLayout | null = null;

export function getWorldLayout(): WorldLayout {
  if (!cachedLayout || cachedLayout.rev !== LAYOUT_REV) {
    cachedLayout = generateWorldLayout();
  }
  return cachedLayout;
}

export function resetWorldLayout(): void {
  cachedLayout = null;
}

export function biomeAt(gx: number, gy: number): Biome {
  const layout = getWorldLayout();
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return "deep_forest";
  return layout.biomes[gy][gx];
}

/** Natural biome plus player-laid road / forest / mountain plots */
export function cellBiome(
  gx: number,
  gy: number,
  buildings?: { type: string; x: number; y: number }[],
): Biome {
  if (buildings) {
    const mark = buildings.find(
      (b) => b.x === gx && b.y === gy && (b.type === "road" || b.type === "forest" || b.type === "mountain"),
    );
    if (mark?.type === "road") return "path";
    if (mark?.type === "forest") return "forest";
    if (mark?.type === "mountain") return "mountain";
  }
  return biomeAt(gx, gy);
}

export function isWaterBiome(b: Biome): boolean {
  return b === "water" || b === "water_shore";
}

export function isBuildableCell(gx: number, gy: number): boolean {
  const b = biomeAt(gx, gy);
  return b !== "deep_forest" && b !== "water" && b !== "water_shore" && b !== "mountain";
}

export function buildBlockedReason(gx: number, gy: number): string | null {
  const b = biomeAt(gx, gy);
  if (b === "water" || b === "water_shore") return "Water — place a Bridge to cross here.";
  if (b === "mountain") return "Mountains — only Gold Mines can be dug here.";
  if (b === "deep_forest") return "Lay a Road through deep forest, or plant elsewhere.";
  return null;
}
