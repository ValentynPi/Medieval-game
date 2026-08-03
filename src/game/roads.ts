import { GRID_H, GRID_W } from "./config";
import { hasWaterCrossing } from "./pathfind";
import { buildingAt, fieldAt, hasRoadAt, uid } from "./state";
import { biomeAt, hasStandingTimber, isWaterBiome } from "./worldGen";
import type { Building, BuildingType, GameState } from "./types";

/** Terrain / water works — no driveway of their own */
const SKIP_AUTO_ROAD: BuildingType[] = ["road", "forest", "mountain", "boat", "keep"];

function key(x: number, y: number): number {
  return y * GRID_W + x;
}

function facingDelta(rotation: number): { dx: number; dy: number } {
  const r = ((rotation % 4) + 4) % 4;
  if (r === 0) return { dx: 0, dy: 1 };
  if (r === 1) return { dx: 1, dy: 0 };
  if (r === 2) return { dx: 0, dy: -1 };
  return { dx: -1, dy: 0 };
}

/**
 * Cell directly in front of the building (door / entrance).
 * Farms face their fields, so the driveway is on the opposite side.
 */
function entranceCell(
  type: BuildingType,
  x: number,
  y: number,
  rotation: number,
): { x: number; y: number } {
  const { dx, dy } = facingDelta(rotation);
  if (type === "farm") return { x: x - dx, y: y - dy };
  return { x: x + dx, y: y + dy };
}

function neighbors4(x: number, y: number): { x: number; y: number }[] {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}

/** Cells the pathfinder may cross when laying roads (orthogonal only). */
function canTraverseForRoad(
  state: GameState,
  x: number,
  y: number,
  endpoints: Set<number>,
): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  if (endpoints.has(key(x, y))) return true;
  if (hasRoadAt(state, x, y)) return true;
  if (hasWaterCrossing(state, x, y)) return true;

  const biome = biomeAt(x, y);
  if (isWaterBiome(biome)) return false;
  if (biome === "mountain") return false;
  if (hasStandingTimber(state, x, y)) return false;
  if (fieldAt(state, x, y)) return false;

  const b = buildingAt(state, x, y);
  if (b && b.type !== "road") return false;
  if (state.constructionSites.some((s) => s.x === x && s.y === y)) return false;
  return true;
}

/** Empty land where a free road tile may be created. */
function canPlaceAutoRoad(state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  if (hasRoadAt(state, x, y)) return false;
  if (hasWaterCrossing(state, x, y)) return false;
  const biome = biomeAt(x, y);
  if (isWaterBiome(biome) || biome === "mountain") return false;
  if (hasStandingTimber(state, x, y)) return false;
  if (fieldAt(state, x, y)) return false;
  if (buildingAt(state, x, y)) return false;
  if (state.constructionSites.some((s) => s.x === x && s.y === y)) return false;
  return true;
}

function findKeep(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === "keep");
}

/** Keep doorstep + adjacent cells — every road network must reach here. */
function keepGoalKeys(state: GameState, keep: Building, endpoints: Set<number>): Set<number> {
  const goals = new Set<number>();
  endpoints.add(key(keep.x, keep.y));
  const door = entranceCell("keep", keep.x, keep.y, keep.rotation ?? 0);
  const candidates = [door, ...neighbors4(keep.x, keep.y)];
  for (const c of candidates) {
    if (c.x < 0 || c.y < 0 || c.x >= GRID_W || c.y >= GRID_H) continue;
    if (
      canTraverseForRoad(state, c.x, c.y, endpoints) ||
      canPlaceAutoRoad(state, c.x, c.y) ||
      hasRoadAt(state, c.x, c.y)
    ) {
      goals.add(key(c.x, c.y));
    }
  }
  // Prefer existing roads touching the keep
  for (const n of neighbors4(keep.x, keep.y)) {
    if (hasRoadAt(state, n.x, n.y)) goals.add(key(n.x, n.y));
  }
  return goals;
}

/** Entrance cell plus slight side offsets if the doorstep is blocked. */
function entranceStarts(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: number,
  endpoints: Set<number>,
): Set<number> {
  const starts = new Set<number>();
  const door = entranceCell(type, x, y, rotation);
  const { dx, dy } = facingDelta(rotation);
  const sideX = -dy;
  const sideY = dx;

  const candidates = [
    door,
    { x: door.x + sideX, y: door.y + sideY },
    { x: door.x - sideX, y: door.y - sideY },
  ];

  for (const c of candidates) {
    if (c.x < 0 || c.y < 0 || c.x >= GRID_W || c.y >= GRID_H) continue;
    if (canTraverseForRoad(state, c.x, c.y, endpoints) || canPlaceAutoRoad(state, c.x, c.y)) {
      starts.add(key(c.x, c.y));
    }
  }
  return starts;
}

/**
 * Dijkstra toward the Keep. Existing roads/bridges are cheap so the path
 * reuses the network but always terminates at the Keep.
 */
function pathToKeep(
  state: GameState,
  starts: Set<number>,
  goals: Set<number>,
  endpoints: Set<number>,
): { x: number; y: number }[] | null {
  if (!starts.size || !goals.size) return null;
  for (const s of starts) {
    if (goals.has(s)) return [];
  }

  const dist = new Map<number, number>();
  const came = new Map<number, number>();
  const open: { k: number; g: number }[] = [];

  for (const s of starts) {
    dist.set(s, 0);
    came.set(s, s);
    open.push({ k: s, g: 0 });
  }

  let found: number | null = null;
  let steps = 0;
  while (open.length && steps < 20000) {
    steps++;
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].g < open[bestI].g) bestI = i;
    }
    const cur = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();
    if (cur.g !== dist.get(cur.k)) continue;

    if (goals.has(cur.k)) {
      found = cur.k;
      break;
    }

    const cx = cur.k % GRID_W;
    const cy = Math.floor(cur.k / GRID_W);
    for (const n of neighbors4(cx, cy)) {
      const nk = key(n.x, n.y);
      const onRoad = hasRoadAt(state, n.x, n.y) || hasWaterCrossing(state, n.x, n.y);
      const layable = canPlaceAutoRoad(state, n.x, n.y);
      const endpt = endpoints.has(nk);
      if (!onRoad && !layable && !endpt && !canTraverseForRoad(state, n.x, n.y, endpoints)) {
        continue;
      }
      // Prefer paving along existing roads; new dirt is expensive
      const step = onRoad ? 0.05 : endpt ? 0.2 : 1;
      const ng = cur.g + step;
      if (ng >= (dist.get(nk) ?? Infinity)) continue;
      dist.set(nk, ng);
      came.set(nk, cur.k);
      open.push({ k: nk, g: ng });
    }
  }

  if (found == null) return null;

  const path: { x: number; y: number }[] = [];
  let cur = found;
  const seen = new Set<number>();
  while (!seen.has(cur)) {
    seen.add(cur);
    path.push({ x: cur % GRID_W, y: Math.floor(cur / GRID_W) });
    const prev = came.get(cur);
    if (prev == null || prev === cur) break;
    cur = prev;
  }
  path.reverse();
  return path;
}

function layRoadsAlong(state: GameState, path: { x: number; y: number }[]): number {
  let added = 0;
  for (const c of path) {
    if (!canPlaceAutoRoad(state, c.x, c.y)) continue;
    state.buildings.push({
      id: uid("bld"),
      type: "road",
      level: 1,
      x: c.x,
      y: c.y,
      rotation: 0,
    });
    added += 1;
  }
  return added;
}

function connectOne(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: number,
  selfFoot: { x: number; y: number }[],
): number {
  const keep = findKeep(state);
  if (!keep) return 0;

  const endpoints = new Set<number>();
  for (const c of selfFoot) endpoints.add(key(c.x, c.y));
  endpoints.add(key(keep.x, keep.y));

  const starts =
    type === "bridge"
      ? (() => {
          const s = new Set<number>();
          for (const c of selfFoot) {
            for (const n of neighbors4(c.x, c.y)) {
              if (n.x < 0 || n.y < 0 || n.x >= GRID_W || n.y >= GRID_H) continue;
              if (isWaterBiome(biomeAt(n.x, n.y))) continue;
              if (canTraverseForRoad(state, n.x, n.y, endpoints) || canPlaceAutoRoad(state, n.x, n.y)) {
                s.add(key(n.x, n.y));
              }
            }
          }
          return s;
        })()
      : entranceStarts(state, type, x, y, rotation, endpoints);

  if (!starts.size) return 0;

  const goals = keepGoalKeys(state, keep, endpoints);
  const path = pathToKeep(state, starts, goals, endpoints);
  if (!path) return 0;
  return layRoadsAlong(state, path);
}

/**
 * Pave the entrance, then guarantee a road link all the way to the Keep
 * (reusing existing roads when they already lead there).
 */
export function autoConnectRoads(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  span?: { x: number; y: number }[],
  rotation = 0,
): number {
  if (SKIP_AUTO_ROAD.includes(type)) return 0;

  if (type === "bridge" && span?.length) {
    const selfFoot = span.map((c) => ({ x: c.x, y: c.y }));
    let added = 0;
    const ends = [span[0], span[span.length - 1]];
    for (const end of ends) {
      for (const n of neighbors4(end.x, end.y)) {
        if (n.x < 0 || n.y < 0 || n.x >= GRID_W || n.y >= GRID_H) continue;
        if (isWaterBiome(biomeAt(n.x, n.y))) continue;
        if (canPlaceAutoRoad(state, n.x, n.y)) {
          state.buildings.push({
            id: uid("bld"),
            type: "road",
            level: 1,
            x: n.x,
            y: n.y,
            rotation: 0,
          });
          added += 1;
        }
      }
    }
    added += connectOne(state, "bridge", x, y, rotation, selfFoot);
    return added;
  }

  const selfFoot = [{ x, y }];
  const door = entranceCell(type, x, y, rotation);
  let added = 0;

  if (canPlaceAutoRoad(state, door.x, door.y)) {
    state.buildings.push({
      id: uid("bld"),
      type: "road",
      level: 1,
      x: door.x,
      y: door.y,
      rotation: 0,
    });
    added += 1;
  }

  added += connectOne(state, type, x, y, rotation, selfFoot);
  return added;
}

/** Relink every structure so the whole village reaches the Keep by road. */
export function reconnectAllToKeep(state: GameState): number {
  let added = 0;
  const structures = state.buildings.filter((b) => !SKIP_AUTO_ROAD.includes(b.type));
  for (const b of structures) {
    added += autoConnectRoads(
      state,
      b.type,
      b.x,
      b.y,
      b.type === "bridge" ? b.span : undefined,
      b.rotation ?? 0,
    );
  }
  return added;
}
