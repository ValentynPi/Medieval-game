import { GRID_W } from "./config";
import type { Building, GameState } from "./types";

/** Invalidate when buildings array is replaced or road tiles change. */
let cacheRef: Building[] | null = null;
let cacheLen = -1;
let roadSet = new Set<number>();
let structMap = new Map<number, Building>();

function cellKey(x: number, y: number): number {
  return y * GRID_W + x;
}

function rebuild(buildings: Building[]): void {
  roadSet = new Set();
  structMap = new Map();
  for (const b of buildings) {
    if (b.type === "road") {
      roadSet.add(cellKey(b.x, b.y));
      continue;
    }
    structMap.set(cellKey(b.x, b.y), b);
    if (b.type === "bridge" && b.span) {
      for (const c of b.span) structMap.set(cellKey(c.x, c.y), b);
    }
  }
  cacheRef = buildings;
  cacheLen = buildings.length;
}

function ensure(state: GameState): void {
  if (cacheRef !== state.buildings || cacheLen !== state.buildings.length) {
    rebuild(state.buildings);
  }
}

/** Call after mutating buildings in place without changing array length (rare). */
export function invalidateSpatialIndex(): void {
  cacheRef = null;
  cacheLen = -1;
}

export function roadKeySet(state: GameState): Set<number> {
  ensure(state);
  return roadSet;
}

export function hasRoadAtFast(state: GameState, x: number, y: number): boolean {
  ensure(state);
  return roadSet.has(cellKey(x, y));
}

export function structureAtFast(state: GameState, x: number, y: number): Building | undefined {
  ensure(state);
  return structMap.get(cellKey(x, y));
}

export function noteRoadAdded(x: number, y: number): void {
  roadSet.add(cellKey(x, y));
}
