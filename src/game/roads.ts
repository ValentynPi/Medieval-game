import { GRID_H, GRID_W } from "./config";
import { hasWaterCrossing } from "./pathfind";
import { buildingAt, fieldAt, hasRoadAt, uid } from "./state";
import { biomeAt, hasStandingTimber, isWaterBiome } from "./worldGen";
import type { BuildingType, GameState } from "./types";

/** Terrain / water works — no driveway of their own */
const SKIP_AUTO_ROAD: BuildingType[] = ["road", "forest", "mountain", "boat"];

/** Buildings that act as road hubs */
const HUB_TYPES: BuildingType[] = [
  "keep",
  "market",
  "barracks",
  "buildersHall",
  "blacksmith",
  "farm",
  "lumber",
  "quarry",
  "mine",
  "tower",
  "wall",
  "bridge",
];

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

function neighbors4(x: number, y: number): { x: number; y: number }[] {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}

function buildingFootprint(b: {
  type: BuildingType;
  x: number;
  y: number;
  span?: { x: number; y: number }[];
}): { x: number; y: number }[] {
  if (b.type === "bridge" && b.span?.length) return b.span.map((c) => ({ x: c.x, y: c.y }));
  return [{ x: b.x, y: b.y }];
}

function sameFootprint(a: { x: number; y: number }[], b: { x: number; y: number }[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c) => b.some((o) => o.x === c.x && o.y === c.y));
}

function overlaps(
  a: { x: number; y: number }[],
  b: { x: number; y: number }[],
): boolean {
  return a.some((c) => b.some((o) => o.x === c.x && o.y === c.y));
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
  // Sideways along the facade (perpendicular to facing)
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

function hubEntranceGoals(
  state: GameState,
  b: { type: BuildingType; x: number; y: number; rotation: number; span?: { x: number; y: number }[] },
  endpoints: Set<number>,
  into: Set<number>,
): void {
  if (b.type === "bridge") {
    const foot = buildingFootprint(b);
    for (const c of foot) {
      endpoints.add(key(c.x, c.y));
      into.add(key(c.x, c.y));
      for (const n of neighbors4(c.x, c.y)) {
        if (canTraverseForRoad(state, n.x, n.y, endpoints) || canPlaceAutoRoad(state, n.x, n.y)) {
          into.add(key(n.x, n.y));
        }
      }
    }
    return;
  }
  const door = entranceCell(b.type, b.x, b.y, b.rotation ?? 0);
  endpoints.add(key(b.x, b.y));
  if (canTraverseForRoad(state, door.x, door.y, endpoints) || canPlaceAutoRoad(state, door.x, door.y) || hasRoadAt(state, door.x, door.y)) {
    into.add(key(door.x, door.y));
  }
  // Also accept roads already adjacent to the hub facade
  for (const n of neighbors4(b.x, b.y)) {
    if (hasRoadAt(state, n.x, n.y)) into.add(key(n.x, n.y));
  }
}

function bfsPath(
  state: GameState,
  starts: Set<number>,
  goals: Set<number>,
  endpoints: Set<number>,
): { x: number; y: number }[] | null {
  for (const s of starts) {
    if (goals.has(s)) return [];
  }

  const came = new Map<number, number>();
  const queue: number[] = [];
  for (const s of starts) {
    queue.push(s);
    came.set(s, s);
  }

  let found: number | null = null;
  let qi = 0;
  while (qi < queue.length && qi < 8000) {
    const cur = queue[qi++];
    if (goals.has(cur)) {
      found = cur;
      break;
    }
    const cx = cur % GRID_W;
    const cy = Math.floor(cur / GRID_W);
    for (const n of neighbors4(cx, cy)) {
      const nk = key(n.x, n.y);
      if (came.has(nk)) continue;
      if (!canTraverseForRoad(state, n.x, n.y, endpoints) && !canPlaceAutoRoad(state, n.x, n.y)) {
        continue;
      }
      came.set(nk, cur);
      queue.push(nk);
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

function findConnectPath(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: number,
  selfFoot: { x: number; y: number }[],
): { x: number; y: number }[] | null {
  const endpoints = new Set<number>();
  for (const c of selfFoot) endpoints.add(key(c.x, c.y));

  const starts = entranceStarts(state, type, x, y, rotation, endpoints);
  if (!starts.size) return null;

  const hubGoals = new Set<number>();
  const roadGoals = new Set<number>();

  for (const b of state.buildings) {
    if (b.type === "road") {
      roadGoals.add(key(b.x, b.y));
      continue;
    }
    if (SKIP_AUTO_ROAD.includes(b.type)) continue;
    const foot = buildingFootprint(b);
    if (sameFootprint(foot, selfFoot) || overlaps(foot, selfFoot)) continue;
    if (!HUB_TYPES.includes(b.type)) continue;
    hubEntranceGoals(state, b, endpoints, hubGoals);
  }

  if (roadGoals.size) {
    const viaRoads = bfsPath(state, starts, roadGoals, endpoints);
    if (viaRoads) return viaRoads;
  }
  if (hubGoals.size) return bfsPath(state, starts, hubGoals, endpoints);
  return null;
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

/**
 * Always pave the entrance tile in front of the building, then link to the network.
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
    const fromCells: { x: number; y: number }[] = [];
    const ends = [span[0], span[span.length - 1]];
    for (const end of ends) {
      for (const n of neighbors4(end.x, end.y)) {
        if (n.x < 0 || n.y < 0 || n.x >= GRID_W || n.y >= GRID_H) continue;
        if (!isWaterBiome(biomeAt(n.x, n.y))) fromCells.push(n);
      }
    }
    // Lay shore approach tiles, then path each to the network
    let added = 0;
    for (const shore of fromCells) {
      if (canPlaceAutoRoad(state, shore.x, shore.y)) {
        state.buildings.push({
          id: uid("bld"),
          type: "road",
          level: 1,
          x: shore.x,
          y: shore.y,
          rotation: 0,
        });
        added += 1;
      }
    }
    const path = findConnectPath(state, "bridge", x, y, rotation, selfFoot);
    if (path) added += layRoadsAlong(state, path);
    return added;
  }

  const selfFoot = [{ x, y }];
  const door = entranceCell(type, x, y, rotation);
  let added = 0;

  // Doorstep road — always in front of the building when possible
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

  const path = findConnectPath(state, type, x, y, rotation, selfFoot);
  if (path) added += layRoadsAlong(state, path);
  return added;
}
