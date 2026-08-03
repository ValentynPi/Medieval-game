import { GRID_H, GRID_W } from "./config";
import { createInitialState, refreshKeepHpCap } from "./state";
import type { GameState } from "./types";

const SAVE_KEY = "holdfast-save-v2";
const SAVE_VERSION = 2;
const LEGACY_KEY = "holdfast-save-v1";

/** Persisted slice — no battle, no UI selection, no intro overlay */
export interface SavePayload {
  version: number;
  savedAt: number;
  resources: GameState["resources"];
  buildings: GameState["buildings"];
  troops: GameState["troops"];
  garrison: GameState["garrison"];
  hero: GameState["hero"];
  keepHp: number;
  keepMaxHp: number;
  day: number;
  timeToRaid: number;
  raidCount: number;
  sites: GameState["sites"];
  cities: GameState["cities"];
  tutorialStep: number;
  victory: boolean;
  defeat: boolean;
  villagers?: GameState["villagers"];
  constructionSites?: GameState["constructionSites"];
  clearedForest?: number[];
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null || localStorage.getItem(LEGACY_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(state: GameState): boolean {
  try {
    const payload: SavePayload = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      resources: { ...state.resources },
      buildings: state.buildings.map((b) => ({
        ...b,
        fields: b.fields?.map((f) => ({ ...f })),
      })),
      troops: { ...state.troops },
      garrison: { ...state.garrison },
      hero: { ...state.hero },
      keepHp: state.keepHp,
      keepMaxHp: state.keepMaxHp,
      day: state.day,
      timeToRaid: state.timeToRaid,
      raidCount: state.raidCount,
      sites: state.sites.map((s) => ({ ...s })),
      cities: state.cities.map((c) => ({
        ...c,
        stock: { ...c.stock },
        buyPrice: { ...c.buyPrice },
        sellPrice: { ...c.sellPrice },
      })),
      tutorialStep: state.tutorialStep,
      victory: state.victory,
      defeat: state.defeat,
      villagers: state.villagers.map((v) => ({
        ...v,
        path: v.path.map((p) => ({ ...p })),
      })),
      constructionSites: state.constructionSites.map((s) => ({ ...s })),
      clearedForest: [...state.clearedForest],
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    let fromLegacy = false;
    if (!raw) {
      raw = localStorage.getItem(LEGACY_KEY);
      fromLegacy = !!raw;
    }
    if (!raw) return null;
    const data = JSON.parse(raw) as SavePayload & { version: number };
    if (data.version !== 1 && data.version !== SAVE_VERSION) return null;

    const base = createInitialState();
    const ox = fromLegacy || data.version === 1 ? Math.floor(GRID_W / 2) - 1 - 23 : 0;
    const oy = fromLegacy || data.version === 1 ? Math.floor(GRID_H / 2) - 1 - 17 : 0;

    const state: GameState = {
      ...base,
      mode: "village",
      resources: data.resources,
      buildings: data.buildings.map((b) => ({
        ...b,
        rotation: b.rotation ?? 0,
        x: b.x + ox,
        y: b.y + oy,
        fields: b.fields?.map((f) => ({ x: f.x + ox, y: f.y + oy })),
      })),
      troops: data.troops,
      garrison: data.garrison,
      hero: { ...base.hero, ...data.hero },
      keepHp: data.keepHp,
      keepMaxHp: data.keepMaxHp,
      day: data.day,
      timeToRaid: data.timeToRaid,
      raidCount: data.raidCount,
      sites: data.sites,
      cities: (data.cities?.length ? data.cities : base.cities).map((c) =>
        c.id === "city_easthollow" ? { ...c, x: 0.24, y: 0.4 } : c,
      ),
      selectedCityId: null,
      selectedSiteId: null,
      villagers: (data.villagers ?? []).map((v) => ({
        ...v,
        x: v.x + ox,
        y: v.y + oy,
        tx: v.tx + ox,
        ty: v.ty + oy,
        workGx: v.workGx != null ? v.workGx + ox : null,
        workGy: v.workGy != null ? v.workGy + oy : null,
        path: (v.path ?? []).map((p) => ({ x: p.x + ox, y: p.y + oy })),
        pathI: v.pathI ?? 0,
        pace: v.pace ?? 1,
        pause: v.pause ?? 0,
        siteId: v.siteId ?? null,
        phase: v.phase === "build" ? "walk" : v.phase,
      })),
      constructionSites: (data.constructionSites ?? []).map((s) => ({
        ...s,
        x: s.x + ox,
        y: s.y + oy,
        builderId: null,
        progress: s.progress ?? 0,
      })),
      clearedForest: data.clearedForest ?? [],
      selectedVillagerId: null,
      assignWorkplace: false,
      tutorialStep: data.tutorialStep,
      victory: data.victory,
      defeat: data.defeat,
      battle: null,
      paused: false,
      selectedBuild: null,
      selectedBuildingId: null,
      buildRotation: 0,
      message: `Welcome back — Day ${Math.floor(data.day)}. Townsfolk are about their work.`,
      messageTimer: 5,
    };
    refreshKeepHpCap(state);
    return state;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function lastSavedLabel(): string | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavePayload;
    return new Date(data.savedAt).toLocaleString();
  } catch {
    return null;
  }
}
