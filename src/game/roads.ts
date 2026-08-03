import { GRID_H, GRID_W } from "./config";
import { hasWaterCrossing } from "./pathfind";
import { buildingAt, fieldAt, uid } from "./state";
import { hasRoadAtFast, invalidateSpatialIndex, roadKeySet } from "./spatial";
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

function canTraverseForRoad(
  state: GameState,
  x: number,
  y: number,
  endpoints: Set<number>,
  roads: Set<number>,
): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  const k = key(x, y);
  if (endpoints.has(k)) return true;
  if (roads.has(k)) return true;
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

function canPlaceAutoRoad(
  state: GameState,
  x: number,
  y: number,
  roads: Set<number>,
): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  if (roads.has(key(x, y))) return false;
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

function keepGoalKeys(state: GameState, keep: Building, endpoints: Set<number>, roads: Set<number>): Set<number> {
  const goals = new Set<number>();
  endpoints.add(key(keep.x, keep.y));
  const door = entranceCell("keep", keep.x, keep.y, keep.rotation ?? 0);
  const candidates = [door, ...neighbors4(keep.x, keep.y)];
  for (const c of candidates) {
    if (c.x < 0 || c.y < 0 || c.x >= GRID_W || c.y >= GRID_H) continue;
    const k = key(c.x, c.y);
    if (
      canTraverseForRoad(state, c.x, c.y, endpoints, roads) ||
      canPlaceAutoRoad(state, c.x, c.y, roads) ||
      roads.has(k)
    ) {
      goals.add(k);
    }
  }
  for (const n of neighbors4(keep.x, keep.y)) {
    if (roads.has(key(n.x, n.y))) goals.add(key(n.x, n.y));
  }
  return goals;
}

function entranceStarts(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: number,
  endpoints: Set<number>,
  roads: Set<number>,
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
    if (
      canTraverseForRoad(state, c.x, c.y, endpoints, roads) ||
      canPlaceAutoRoad(state, c.x, c.y, roads)
    ) {
      starts.add(key(c.x, c.y));
    }
  }
  return starts;
}

/** True if entrance already reaches Keep via existing roads/bridges only. */
function alreadyLinkedToKeep(
  state: GameState,
  starts: Set<number>,
  goals: Set<number>,
  roads: Set<number>,
): boolean {
  for (const s of starts) {
    if (goals.has(s)) return true;
  }
  const seen = new Set<number>();
  const q = [...starts];
  for (const s of starts) seen.add(s);
  let qi = 0;
  while (qi < q.length && qi < 6000) {
    const cur = q[qi++];
    if (goals.has(cur)) return true;
    const cx = cur % GRID_W;
    const cy = Math.floor(cur / GRID_W);
    for (const n of neighbors4(cx, cy)) {
      const nk = key(n.x, n.y);
      if (seen.has(nk)) continue;
      if (!roads.has(nk) && !hasWaterCrossing(state, n.x, n.y) && !goals.has(nk)) continue;
      seen.add(nk);
      q.push(nk);
    }
  }
  return false;
}

/** Binary-heap Dijkstra toward Keep; reuses roads (cheap) and lays dirt (costly). */
function pathToKeep(
  state: GameState,
  starts: Set<number>,
  goals: Set<number>,
  endpoints: Set<number>,
  roads: Set<number>,
): { x: number; y: number }[] | null {
  if (!starts.size || !goals.size) return null;
  if (alreadyLinkedToKeep(state, starts, goals, roads)) return [];

  const dist = new Map<number, number>();
  const came = new Map<number, number>();
  const heap: { k: number; g: number }[] = [];

  const heapPush = (node: { k: number; g: number }) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].g <= heap[i].g) break;
      const t = heap[p];
      heap[p] = heap[i];
      heap[i] = t;
      i = p;
    }
  };
  const heapPop = (): { k: number; g: number } | undefined => {
    if (!heap.length) return undefined;
    const top = heap[0];
    const last = heap.pop()!;
    if (!heap.length) return top;
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let sm = i;
      if (l < heap.length && heap[l].g < heap[sm].g) sm = l;
      if (r < heap.length && heap[r].g < heap[sm].g) sm = r;
      if (sm === i) break;
      const t = heap[i];
      heap[i] = heap[sm];
      heap[sm] = t;
      i = sm;
    }
    return top;
  };

  for (const s of starts) {
    dist.set(s, 0);
    came.set(s, s);
    heapPush({ k: s, g: 0 });
  }

  let found: number | null = null;
  let steps = 0;
  while (heap.length && steps < 12000) {
    steps++;
    const cur = heapPop()!;
    if (cur.g !== dist.get(cur.k)) continue;
    if (goals.has(cur.k)) {
      found = cur.k;
      break;
    }
    const cx = cur.k % GRID_W;
    const cy = Math.floor(cur.k / GRID_W);
    for (const n of neighbors4(cx, cy)) {
      const nk = key(n.x, n.y);
      const onRoad = roads.has(nk) || hasWaterCrossing(state, n.x, n.y);
      const layable = canPlaceAutoRoad(state, n.x, n.y, roads);
      const endpt = endpoints.has(nk);
      if (!onRoad && !layable && !endpt && !canTraverseForRoad(state, n.x, n.y, endpoints, roads)) {
        continue;
      }
      const step = onRoad ? 0.05 : endpt ? 0.2 : 1;
      const ng = cur.g + step;
      if (ng >= (dist.get(nk) ?? Infinity)) continue;
      dist.set(nk, ng);
      came.set(nk, cur.k);
      heapPush({ k: nk, g: ng });
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

function layRoadsAlong(state: GameState, path: { x: number; y: number }[], roads: Set<number>): number {
  let added = 0;
  for (const c of path) {
    if (!canPlaceAutoRoad(state, c.x, c.y, roads)) continue;
    state.buildings.push({
      id: uid("bld"),
      type: "road",
      level: 1,
      x: c.x,
      y: c.y,
      rotation: 0,
    });
    roads.add(key(c.x, c.y));
    added += 1;
  }
  if (added) invalidateSpatialIndex();
  return added;
}

function connectOne(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: number,
  selfFoot: { x: number; y: number }[],
  roads: Set<number>,
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
              if (
                canTraverseForRoad(state, n.x, n.y, endpoints, roads) ||
                canPlaceAutoRoad(state, n.x, n.y, roads)
              ) {
                s.add(key(n.x, n.y));
              }
            }
          }
          return s;
        })()
      : entranceStarts(state, type, x, y, rotation, endpoints, roads);

  if (!starts.size) return 0;

  const goals = keepGoalKeys(state, keep, endpoints, roads);
  const path = pathToKeep(state, starts, goals, endpoints, roads);
  if (!path) return 0;
  return layRoadsAlong(state, path, roads);
}

export function autoConnectRoads(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  span?: { x: number; y: number }[],
  rotation = 0,
): number {
  if (SKIP_AUTO_ROAD.includes(type)) return 0;
  const roads = roadKeySet(state);

  if (type === "bridge" && span?.length) {
    const selfFoot = span.map((c) => ({ x: c.x, y: c.y }));
    let added = 0;
    const ends = [span[0], span[span.length - 1]];
    for (const end of ends) {
      for (const n of neighbors4(end.x, end.y)) {
        if (n.x < 0 || n.y < 0 || n.x >= GRID_W || n.y >= GRID_H) continue;
        if (isWaterBiome(biomeAt(n.x, n.y))) continue;
        if (canPlaceAutoRoad(state, n.x, n.y, roads)) {
          state.buildings.push({
            id: uid("bld"),
            type: "road",
            level: 1,
            x: n.x,
            y: n.y,
            rotation: 0,
          });
          roads.add(key(n.x, n.y));
          added += 1;
        }
      }
    }
    if (added) invalidateSpatialIndex();
    added += connectOne(state, "bridge", x, y, rotation, selfFoot, roads);
    return added;
  }

  const selfFoot = [{ x, y }];
  const door = entranceCell(type, x, y, rotation);
  let added = 0;

  if (canPlaceAutoRoad(state, door.x, door.y, roads)) {
    state.buildings.push({
      id: uid("bld"),
      type: "road",
      level: 1,
      x: door.x,
      y: door.y,
      rotation: 0,
    });
    roads.add(key(door.x, door.y));
    added += 1;
    invalidateSpatialIndex();
  }

  added += connectOne(state, type, x, y, rotation, selfFoot, roads);
  return added;
}

/** Relink structures that are not already on a Keep road (admin / repair). */
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

// Re-export for callers that still check roads via state helper
export { hasRoadAtFast };
