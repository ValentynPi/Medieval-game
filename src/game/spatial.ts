import { GRID_W } from "./config";
import type { Building, ConstructionSite, GameState } from "./types";

/** Invalidate when buildings array is replaced or road tiles change. */
let cacheRef: Building[] | null = null;
let cacheLen = -1;
let sitesRef: ConstructionSite[] | null = null;
let sitesLen = -1;
let clearedRef: number[] | null = null;
let clearedLen = -1;
let roadSet = new Set<number>();
let structMap = new Map<number, Building>();
/** Bridge / boat / in-progress crossing cells — O(1) water walk checks */
let crossingSet = new Set<number>();
let clearedSet = new Set<number>();

function cellKey(x: number, y: number): number {
  return y * GRID_W + x;
}

function addCrossingCells(b: { x: number; y: number; span?: { x: number; y: number }[] }): void {
  crossingSet.add(cellKey(b.x, b.y));
  if (b.span) {
    for (const c of b.span) crossingSet.add(cellKey(c.x, c.y));
  }
}

function rebuild(buildings: Building[], sites: ConstructionSite[]): void {
  roadSet = new Set();
  structMap = new Map();
  crossingSet = new Set();
  for (const b of buildings) {
    if (b.type === "road") {
      roadSet.add(cellKey(b.x, b.y));
      continue;
    }
    structMap.set(cellKey(b.x, b.y), b);
    if (b.type === "bridge" || b.type === "boat") {
      addCrossingCells(b);
    }
    if (b.type === "bridge" && b.span) {
      for (const c of b.span) structMap.set(cellKey(c.x, c.y), b);
    }
  }
  for (const s of sites) {
    if (s.type === "bridge" || s.type === "boat") addCrossingCells(s);
  }
  cacheRef = buildings;
  cacheLen = buildings.length;
  sitesRef = sites;
  sitesLen = sites.length;
}

function rebuildCleared(cleared: number[]): void {
  clearedSet = new Set(cleared);
  clearedRef = cleared;
  clearedLen = cleared.length;
}

function ensure(state: GameState): void {
  if (
    cacheRef !== state.buildings ||
    cacheLen !== state.buildings.length ||
    sitesRef !== state.constructionSites ||
    sitesLen !== state.constructionSites.length
  ) {
    rebuild(state.buildings, state.constructionSites);
  }
  if (clearedRef !== state.clearedForest || clearedLen !== state.clearedForest.length) {
    rebuildCleared(state.clearedForest);
  }
}

/** Call after mutating buildings in place without changing array length (rare). */
export function invalidateSpatialIndex(): void {
  cacheRef = null;
  cacheLen = -1;
  sitesRef = null;
  sitesLen = -1;
  clearedRef = null;
  clearedLen = -1;
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

export function hasWaterCrossingFast(state: GameState, x: number, y: number): boolean {
  ensure(state);
  return crossingSet.has(cellKey(x, y));
}

export function isForestClearedFast(state: GameState, x: number, y: number): boolean {
  ensure(state);
  return clearedSet.has(cellKey(x, y));
}

export function noteRoadAdded(x: number, y: number): void {
  roadSet.add(cellKey(x, y));
}
