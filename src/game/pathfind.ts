import { GRID_H, GRID_W } from "./config";
import { hasRoadAt } from "./state";
import { hasWaterCrossingFast, isForestClearedFast, structureAtFast } from "./spatial";
import { biomeAt, isWaterBiome, type Biome } from "./worldGen";
import type { GameState } from "./types";

/** Safe to stand on water: finished Bridge/Boat, or a bridge still under construction. */
export function hasWaterCrossing(state: GameState, gx: number, gy: number): boolean {
  return hasWaterCrossingFast(state, gx, gy);
}

/**
 * Cells a Bridge covers — shortest dry-to-dry crossing of the river/lake.
 * axis "ns" = cells run north-south (crosses an east-west channel).
 */
export function bridgeSpanInfo(
  gx: number,
  gy: number,
): { cells: { x: number; y: number }[]; axis: "ns" | "ew" } | null {
  if (!isWaterBiome(biomeAt(gx, gy))) return null;

  const wet = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && isWaterBiome(biomeAt(x, y));
  const land = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !isWaterBiome(biomeAt(x, y));

  const tryAxis = (
    dx: number,
    dy: number,
    axis: "ns" | "ew",
  ): { cells: { x: number; y: number }[]; axis: "ns" | "ew" } | null => {
    const forward: { x: number; y: number }[] = [];
    let x = gx + dx;
    let y = gy + dy;
    while (wet(x, y) && forward.length < 16) {
      forward.push({ x, y });
      x += dx;
      y += dy;
    }
    if (!land(x, y)) return null;

    const back: { x: number; y: number }[] = [];
    x = gx - dx;
    y = gy - dy;
    while (wet(x, y) && back.length + forward.length < 16) {
      back.push({ x, y });
      x -= dx;
      y -= dy;
    }
    if (!land(x, y)) return null;

    return {
      axis,
      cells: [...back.reverse(), { x: gx, y: gy }, ...forward],
    };
  };

  const candidates = [
    tryAxis(0, 1, "ns"),
    tryAxis(1, 0, "ew"),
  ].filter((s): s is { cells: { x: number; y: number }[]; axis: "ns" | "ew" } => !!s);

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.cells.length - b.cells.length);
  return candidates[0];
}

/** @deprecated use bridgeSpanInfo — kept for call sites expecting cell list */
export function bridgeSpanCells(gx: number, gy: number): { x: number; y: number }[] {
  return bridgeSpanInfo(gx, gy)?.cells ?? [{ x: gx, y: gy }];
}

/** Fast biome for pathing — avoids scanning the buildings array each cell. */
function pathBiome(state: GameState, gx: number, gy: number): Biome {
  if (hasRoadAt(state, gx, gy)) return "path";
  const s = structureAtFast(state, gx, gy);
  if (s?.type === "forest") return "forest";
  if (s?.type === "mountain") return "mountain";
  const natural = biomeAt(gx, gy);
  if (
    (natural === "forest" || natural === "deep_forest") &&
    isForestClearedFast(state, gx, gy)
  ) {
    return "meadow";
  }
  return natural;
}

/**
 * Walkable on land. Any blue river/lake tile (channel or bank) needs a Bridge or Boat.
 */
export function isFootWalkable(state: GameState, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  const biome = pathBiome(state, gx, gy);
  if (isWaterBiome(biome)) return hasWaterCrossingFast(state, gx, gy);
  return true;
}

/** Blue tiles without Bridge/Boat — townsfolk must leave or drown. */
export function isDrowningCell(state: GameState, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  const biome = pathBiome(state, gx, gy);
  if (!isWaterBiome(biome)) return false;
  return !hasWaterCrossingFast(state, gx, gy);
}

export function nearestWalkable(
  state: GameState,
  x: number,
  y: number,
  maxR = 12,
): { x: number; y: number } | null {
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (isFootWalkable(state, cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const gx = cx + dx;
        const gy = cy + dy;
        if (isFootWalkable(state, gx, gy)) return { x: gx, y: gy };
      }
    }
  }
  return null;
}

type Node = { x: number; y: number; g: number; f: number; px: number; py: number };

/** Binary min-heap on f-score — avoids O(n) open-list scans on the large map. */
class MinHeap {
  private readonly data: Node[] = [];

  get length(): number {
    return this.data.length;
  }

  push(n: Node): void {
    const d = this.data;
    d.push(n);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (d[p].f <= d[i].f) break;
      const t = d[p];
      d[p] = d[i];
      d[i] = t;
      i = p;
    }
  }

  pop(): Node | undefined {
    const d = this.data;
    if (!d.length) return undefined;
    const top = d[0];
    const last = d.pop()!;
    if (!d.length) return top;
    d[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let smallest = i;
      if (l < d.length && d[l].f < d[smallest].f) smallest = l;
      if (r < d.length && d[r].f < d[smallest].f) smallest = r;
      if (smallest === i) break;
      const t = d[i];
      d[i] = d[smallest];
      d[smallest] = t;
      i = smallest;
    }
    return top;
  }
}

/**
 * A* on the village grid. Returns cell-center waypoints (continuous coords),
 * or null if unreachable within the search budget.
 */
export function findPath(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number }[] | null {
  const start = nearestWalkable(state, fromX, fromY);
  const goalCell = nearestWalkable(state, toX, toY);
  if (!start || !goalCell) return null;
  if (!isFootWalkable(state, goalCell.x, goalCell.y)) return null;

  const sx = start.x;
  const sy = start.y;
  const gx = goalCell.x;
  const gy = goalCell.y;
  if (sx === gx && sy === gy) {
    return [{ x: gx + 0.5, y: gy + 0.5 }];
  }

  const key = (x: number, y: number) => y * GRID_W + x;
  const open = new MinHeap();
  const came = new Map<number, Node>();
  const gScore = new Map<number, number>();
  /** Cache walkability for this search — same cell checked many times via diagonals. */
  const walkCache = new Map<number, boolean>();
  const walkable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
    const k = key(x, y);
    let v = walkCache.get(k);
    if (v === undefined) {
      v = isFootWalkable(state, x, y);
      walkCache.set(k, v);
    }
    return v;
  };

  const h0 = Math.hypot(gx - sx, gy - sy);
  const startNode: Node = { x: sx, y: sy, g: 0, f: h0, px: sx, py: sy };
  open.push(startNode);
  gScore.set(key(sx, sy), 0);
  came.set(key(sx, sy), startNode);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  let steps = 0;
  const MAX_STEPS = 14000;

  while (open.length && steps < MAX_STEPS) {
    steps++;
    const cur = open.pop()!;
    const curG = gScore.get(key(cur.x, cur.y));
    // Stale heap entry after a better path was found
    if (curG !== undefined && cur.g > curG + 1e-6) continue;

    if (cur.x === gx && cur.y === gy) {
      const cells: { x: number; y: number }[] = [];
      let n: Node | undefined = cur;
      const seen = new Set<number>();
      while (n) {
        const k = key(n.x, n.y);
        if (seen.has(k)) break;
        seen.add(k);
        cells.push({ x: n.x, y: n.y });
        if (n.x === sx && n.y === sy) break;
        n = came.get(key(n.px, n.py));
      }
      cells.reverse();
      const simplified = simplifyPath(state, cells);
      return simplified.map((c) => ({
        x: c.x + 0.5 + (Math.random() - 0.5) * 0.15,
        y: c.y + 0.5 + (Math.random() - 0.5) * 0.15,
      }));
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!walkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (!walkable(cur.x + dx, cur.y) || !walkable(cur.x, cur.y + dy)) {
          continue;
        }
      }
      const stepCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
      const biome = pathBiome(state, nx, ny);
      const onBridge = hasWaterCrossingFast(state, nx, ny);
      const terrain = onBridge
        ? 0.55
        : biome === "path"
          ? 0.82
          : biome === "deep_forest"
            ? 1.35
            : biome === "mountain" || biome === "rocky"
              ? 1.25
              : 1;
      const tentative = cur.g + stepCost * terrain;
      const nk = key(nx, ny);
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      gScore.set(nk, tentative);
      const node: Node = {
        x: nx,
        y: ny,
        g: tentative,
        f: tentative + Math.hypot(gx - nx, gy - ny),
        px: cur.x,
        py: cur.y,
      };
      came.set(nk, node);
      open.push(node);
    }
  }
  return null;
}

function simplifyPath(
  state: GameState,
  cells: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (cells.length <= 2) return cells;
  const out: { x: number; y: number }[] = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = cells[i];
    const next = cells[i + 1];
    const onBridge = hasWaterCrossingFast(state, cur.x, cur.y);
    const ax = cur.x - prev.x;
    const ay = cur.y - prev.y;
    const bx = next.x - cur.x;
    const by = next.y - cur.y;
    const collinear = ax * by === ay * bx;
    if (onBridge || !collinear) out.push(cur);
  }
  out.push(cells[cells.length - 1]);
  return out;
}
