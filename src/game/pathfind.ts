import { GRID_H, GRID_W } from "./config";
import { biomeAt, cellBiome, isWaterBiome } from "./worldGen";
import type { GameState } from "./types";

/** Safe to stand on water: Bridge underfoot or a docked Boat. */
export function hasWaterCrossing(state: GameState, gx: number, gy: number): boolean {
  return state.buildings.some(
    (b) => b.x === gx && b.y === gy && (b.type === "bridge" || b.type === "boat"),
  );
}

/**
 * Cells a single Bridge placement should cover — spans the river/lake
 * to dry land on both sides (shortest axis), so townsfolk can actually cross.
 */
export function bridgeSpanCells(gx: number, gy: number): { x: number; y: number }[] {
  if (!isWaterBiome(biomeAt(gx, gy))) return [{ x: gx, y: gy }];

  const wet = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && isWaterBiome(biomeAt(x, y));
  const land = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !isWaterBiome(biomeAt(x, y));

  const tryAxis = (dx: number, dy: number): { x: number; y: number }[] | null => {
    const forward: { x: number; y: number }[] = [];
    let x = gx + dx;
    let y = gy + dy;
    while (wet(x, y) && forward.length < 14) {
      forward.push({ x, y });
      x += dx;
      y += dy;
    }
    if (!land(x, y)) return null;

    const back: { x: number; y: number }[] = [];
    x = gx - dx;
    y = gy - dy;
    while (wet(x, y) && back.length + forward.length < 14) {
      back.push({ x, y });
      x -= dx;
      y -= dy;
    }
    if (!land(x, y)) return null;

    return [...back.reverse(), { x: gx, y: gy }, ...forward];
  };

  const spans = [tryAxis(1, 0), tryAxis(0, 1)].filter(
    (s): s is { x: number; y: number }[] => !!s && s.length > 0,
  );
  if (!spans.length) return [{ x: gx, y: gy }];
  spans.sort((a, b) => a.length - b.length);
  return spans[0];
}

/**
 * Walkable on land. Any blue river/lake tile (channel or bank) needs a Bridge or Boat.
 */
export function isFootWalkable(state: GameState, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  const biome = cellBiome(gx, gy, state.buildings);
  if (isWaterBiome(biome)) return hasWaterCrossing(state, gx, gy);
  return true;
}

/** Blue tiles without Bridge/Boat — townsfolk must leave or drown. */
export function isDrowningCell(state: GameState, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  const biome = cellBiome(gx, gy, state.buildings);
  if (!isWaterBiome(biome)) return false;
  return !hasWaterCrossing(state, gx, gy);
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
  const open: Node[] = [];
  const came = new Map<number, Node>();
  const gScore = new Map<number, number>();

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
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestI].f) bestI = i;
    }
    const cur = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();

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
      // Smooth: drop collinear points, keep bridges and turns
      const simplified = simplifyPath(state, cells);
      return simplified.map((c) => ({
        x: c.x + 0.5 + (Math.random() - 0.5) * 0.15,
        y: c.y + 0.5 + (Math.random() - 0.5) * 0.15,
      }));
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isFootWalkable(state, nx, ny)) continue;
      // No cutting corners through water
      if (dx !== 0 && dy !== 0) {
        if (!isFootWalkable(state, cur.x + dx, cur.y) || !isFootWalkable(state, cur.x, cur.y + dy)) {
          continue;
        }
      }
      const stepCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
      // Prefer roads and bridges so townsfolk funnel across crossings
      const biome = cellBiome(nx, ny, state.buildings);
      const onBridge = state.buildings.some(
        (b) => b.x === nx && b.y === ny && (b.type === "bridge" || b.type === "boat"),
      );
      const terrain = onBridge
        ? 0.55
        : biome === "path" || state.buildings.some((b) => b.x === nx && b.y === ny && b.type === "road")
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
    const onBridge = state.buildings.some(
      (b) => b.type === "bridge" && b.x === cur.x && b.y === cur.y,
    );
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
