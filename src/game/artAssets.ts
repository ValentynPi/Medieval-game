import type { BuildingType } from "./types";

const BASE = `${import.meta.env.BASE_URL}sprites/`;

export const BUILDING_ART: Partial<Record<BuildingType, string>> = {
  keep: "keep.png",
  farm: "farm.png",
  lumber: "lumber.png",
  quarry: "quarry.png",
  mine: "mine.png",
  barracks: "barracks.png",
  trainingGround: "trainingGround.png",
  tower: "tower.png",
  wall: "wall.png",
  blacksmith: "blacksmith.png",
  market: "market.png",
  buildersHall: "buildersHall.png",
  bridge: "bridge.png",
  boat: "boat.png",
  forest: "forest.png",
  mountain: "mountain.png",
};

export const TERRAIN_ART: Record<string, string> = {
  meadow: "tile_meadow.png",
  path: "tile_path.png",
  water: "tile_water.png",
  water_shore: "tile_water.png",
  forest: "tile_meadow.png",
  deep_forest: "tile_meadow.png",
  rocky: "tile_path.png",
  mountain: "tile_path.png",
};

const imageCache = new Map<string, HTMLImageElement>();
const processedCache = new Map<string, HTMLCanvasElement>();

let readyPromise: Promise<void> | null = null;
let assetsReady = false;

export function areArtAssetsReady(): boolean {
  return assetsReady;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(url);
  if (hit?.complete && hit.naturalWidth) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

function isChromaGreen(r: number, g: number, b: number): boolean {
  return g > 140 && g > r * 1.35 && g > b * 1.35 && r < 160 && b < 160;
}

function isVignetteBg(r: number, g: number, b: number, cornerLuma: number): boolean {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Dark studio backdrop around FoE-style renders
  if (luma < 48 && Math.abs(r - g) < 28 && Math.abs(g - b) < 28) return true;
  // Match sampled corner tone
  if (Math.abs(luma - cornerLuma) < 22 && luma < 90 && Math.abs(r - g) < 35) return true;
  return false;
}

/** Knock out green screen / dark vignette and crop to opaque content. */
export function processArtImage(img: HTMLImageElement, maxSize = 160): HTMLCanvasElement {
  const src = document.createElement("canvas");
  src.width = img.naturalWidth || img.width;
  src.height = img.naturalHeight || img.height;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  const { data, width, height } = sctx.getImageData(0, 0, src.width, src.height);

  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const corners = [sample(2, 2), sample(width - 3, 2), sample(2, height - 3), sample(width - 3, height - 3)];
  const cornerLuma =
    corners.reduce((s, c) => s + 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 0) / corners.length;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isChromaGreen(r, g, b) || isVignetteBg(r, g, b, cornerLuma)) {
        data[i + 3] = 0;
        continue;
      }
      // Soft fringe near green
      if (g > 120 && g > r + 30 && g > b + 30) {
        data[i + 3] = Math.min(data[i + 3], 40);
      }
      if (data[i + 3] > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  sctx.putImageData(new ImageData(data, width, height), 0, 0);

  if (maxX <= minX || maxY <= minY) {
    const empty = document.createElement("canvas");
    empty.width = 8;
    empty.height = 8;
    return empty;
  }

  // Pad slightly
  minX = Math.max(0, minX - 2);
  minY = Math.max(0, minY - 2);
  maxX = Math.min(width - 1, maxX + 2);
  maxY = Math.min(height - 1, maxY + 2);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const scale = Math.min(1, maxSize / Math.max(cw, ch));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * scale));
  out.height = Math.max(1, Math.round(ch * scale));
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, minX, minY, cw, ch, 0, 0, out.width, out.height);
  return out;
}

export function getProcessedArt(path: string): HTMLCanvasElement | null {
  return processedCache.get(path) ?? null;
}

export function preloadArtAssets(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const files = new Set<string>();
    for (const f of Object.values(BUILDING_ART)) if (f) files.add(f);
    for (const f of Object.values(TERRAIN_ART)) files.add(f);
    files.add("villager.png");
    files.add("forest.png");
    files.add("mountain.png");

    await Promise.all(
      [...files].map(async (file) => {
        try {
          const img = await loadImage(BASE + file);
          const max = file.startsWith("tile_") ? 96 : file === "villager.png" ? 56 : 150;
          processedCache.set(file, processArtImage(img, max));
        } catch {
          // Keep procedural fallback
        }
      }),
    );
    assetsReady = true;
  })();
  return readyPromise;
}

export function buildingArtCanvas(type: BuildingType): HTMLCanvasElement | null {
  const file = BUILDING_ART[type];
  if (!file) return null;
  return processedCache.get(file) ?? null;
}

export function terrainArtCanvas(biome: string): HTMLCanvasElement | null {
  const file = TERRAIN_ART[biome];
  if (!file) return null;
  return processedCache.get(file) ?? null;
}

export function villagerArtCanvas(): HTMLCanvasElement | null {
  return processedCache.get("villager.png") ?? null;
}

export function treeArtCanvas(deep: boolean): HTMLCanvasElement | null {
  // Prefer forest cluster art; tint handled by caller scale
  return processedCache.get(deep ? "forest.png" : "forest.png") ?? null;
}
