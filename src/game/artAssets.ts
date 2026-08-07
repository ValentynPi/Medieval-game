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

type ArtKind = "building" | "tile" | "actor";

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

/** True neon chroma key only — never natural grass/foliage greens. */
function isNeonChroma(r: number, g: number, b: number): boolean {
  return g >= 200 && r <= 90 && b <= 90 && g - r >= 100 && g - b >= 100;
}

function colorDist(r: number, g: number, b: number, R: number, G: number, B: number): number {
  const dr = r - R;
  const dg = g - G;
  const db = b - B;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function resizeToCanvas(img: CanvasImageSource, sw: number, sh: number, maxSize: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/**
 * Remove only studio backdrop via edge flood-fill + neon green key.
 * Does NOT strip natural greens (that was wiping meadows/trees before).
 */
export function processArtImage(
  img: HTMLImageElement,
  maxSize = 180,
  kind: ArtKind = "building",
): HTMLCanvasElement {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const src = document.createElement("canvas");
  src.width = width;
  src.height = height;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);

  // Terrain tiles: keep pixels; diamond clip happens when drawing
  if (kind === "tile") {
    return resizeToCanvas(src, width, height, maxSize);
  }

  const imageData = sctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const idx = (x: number, y: number) => (y * width + x) * 4;

  const corner = (x: number, y: number) => {
    const i = idx(x, y);
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const samples = [corner(1, 1), corner(width - 2, 1), corner(1, height - 2), corner(width - 2, height - 2)];
  const avg = samples.reduce(
    (a, c) => ({ r: a.r + c.r / 4, g: a.g + c.g / 4, b: a.b + c.b / 4 }),
    { r: 0, g: 0, b: 0 },
  );
  const cornerIsNeon = samples.filter((c) => isNeonChroma(c.r, c.g, c.b)).length >= 2;
  const cornerIsDark =
    samples.filter((c) => {
      const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      return luma < 55 && Math.abs(c.r - c.g) < 30 && Math.abs(c.g - c.b) < 30;
    }).length >= 2;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const pushBorder = (x: number, y: number) => {
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < width; x++) {
    pushBorder(x, 0);
    pushBorder(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushBorder(0, y);
    pushBorder(width - 1, y);
  }

  const threshold = cornerIsNeon ? 70 : cornerIsDark ? 42 : 55;

  while (stack.length) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p / width) | 0;
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const kill =
      isNeonChroma(r, g, b) ||
      (cornerIsNeon && colorDist(r, g, b, avg.r, avg.g, avg.b) < threshold) ||
      (cornerIsDark && colorDist(r, g, b, avg.r, avg.g, avg.b) < threshold);

    if (!kill) continue;
    data[i + 3] = 0;

    const neigh = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const np = ny * width + nx;
      if (visited[np]) continue;
      visited[np] = 1;
      stack.push(np);
    }
  }

  // Also key any remaining neon pockets (holes inside frames)
  for (let i = 0; i < data.length; i += 4) {
    if (isNeonChroma(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0;
  }

  sctx.putImageData(imageData, 0, 0);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[idx(x, y) + 3] < 12) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX <= minX || maxY <= minY) {
    // Fallback: show unprocessed art rather than empty stick figures
    return resizeToCanvas(img, width, height, maxSize);
  }

  minX = Math.max(0, minX - 2);
  minY = Math.max(0, minY - 2);
  maxX = Math.min(width - 1, maxX + 2);
  maxY = Math.min(height - 1, maxY + 2);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cropped = document.createElement("canvas");
  cropped.width = cw;
  cropped.height = ch;
  cropped.getContext("2d")!.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
  return resizeToCanvas(cropped, cw, ch, maxSize);
}

export function preloadArtAssets(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const jobs: { file: string; kind: ArtKind; max: number }[] = [];
    for (const f of Object.values(BUILDING_ART)) {
      if (f) jobs.push({ file: f, kind: "building", max: 240 });
    }
    for (const f of [...new Set(Object.values(TERRAIN_ART))]) {
      jobs.push({ file: f, kind: "tile", max: 128 });
    }
    jobs.push({ file: "villager.png", kind: "actor", max: 72 });

    const results = await Promise.all(
      jobs.map(async ({ file, kind, max }) => {
        try {
          const img = await loadImage(BASE + file);
          processedCache.set(file, processArtImage(img, max, kind));
          return true;
        } catch {
          return false;
        }
      }),
    );
    assetsReady = results.some(Boolean);
  })();
  return readyPromise;
}

export function buildingArtCanvas(type: BuildingType): HTMLCanvasElement | null {
  const file = BUILDING_ART[type];
  if (!file) return null;
  const art = processedCache.get(file);
  return art && art.width > 16 ? art : null;
}

export function terrainArtCanvas(biome: string): HTMLCanvasElement | null {
  const file = TERRAIN_ART[biome];
  if (!file) return null;
  const art = processedCache.get(file);
  return art && art.width > 16 ? art : null;
}

export function villagerArtCanvas(): HTMLCanvasElement | null {
  const art = processedCache.get("villager.png");
  return art && art.width > 16 ? art : null;
}

export function treeArtCanvas(_deep: boolean): HTMLCanvasElement | null {
  const art = processedCache.get("forest.png");
  return art && art.width > 16 ? art : null;
}
