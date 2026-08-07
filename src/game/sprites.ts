import { BUILDINGS } from "./config";
import { ISO_H, ISO_W } from "./iso";
import {
  buildingArtCanvas,
  preloadArtAssets,
  terrainArtCanvas,
  treeArtCanvas,
  villagerArtCanvas,
} from "./artAssets";
import type { BuildingType, VillagerJob } from "./types";

const cache = new Map<string, HTMLCanvasElement>();
const ART_REV = "v4";

export { preloadArtAssets };

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

function shade(hex: string, amt: number): string {
  const raw = hex.replace("#", "");
  const n = parseInt(raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function diamondPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}

function fillDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fill: string | CanvasGradient,
  stroke?: string,
): void {
  diamondPath(ctx, cx, cy, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawArtCentered(
  ctx: CanvasRenderingContext2D,
  art: HTMLCanvasElement,
  cx: number,
  bottomY: number,
  maxW: number,
  maxH: number,
): void {
  const scale = Math.min(maxW / art.width, maxH / art.height);
  const dw = art.width * scale;
  const dh = art.height * scale;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, bottomY - 2, dw * 0.38, Math.max(4, dh * 0.06), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(art, cx - dw / 2, bottomY - dh, dw, dh);
}

export function terrainSprite(biome: string): HTMLCanvasElement {
  const key = `${ART_REV}:terrain:${biome}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const art = terrainArtCanvas(biome);
  if (art) {
    const c = canvas(ISO_W + 4, ISO_H + 4);
    const ctx = c.getContext("2d")!;
    const cx = c.width / 2;
    const cy = c.height / 2;
    ctx.save();
    diamondPath(ctx, cx, cy, ISO_W, ISO_H);
    ctx.clip();
    const scale = Math.max(ISO_W / art.width, ISO_H / art.height) * 1.15;
    const dw = art.width * scale;
    const dh = art.height * scale;
    ctx.drawImage(art, cx - dw / 2, cy - dh / 2, dw, dh);
    // Biome tint overlays for variants sharing meadow/path art
    if (biome === "forest" || biome === "deep_forest") {
      ctx.fillStyle = biome === "deep_forest" ? "rgba(20,50,30,0.45)" : "rgba(30,70,40,0.35)";
      ctx.fillRect(0, 0, c.width, c.height);
    } else if (biome === "mountain" || biome === "rocky") {
      ctx.fillStyle = "rgba(90,95,100,0.35)";
      ctx.fillRect(0, 0, c.width, c.height);
    } else if (biome === "water_shore") {
      ctx.fillStyle = "rgba(80,160,140,0.25)";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.restore();
    diamondPath(ctx, cx, cy, ISO_W, ISO_H);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    cache.set(key, c);
    return c;
  }

  const c = canvas(ISO_W + 4, ISO_H + 4);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  const cy = c.height / 2;
  const palettes: Record<string, { light: string; base: string; dark: string }> = {
    meadow: { light: "#8bc46a", base: "#6faa52", dark: "#4e8638" },
    path: { light: "#dfc69e", base: "#c9ae86", dark: "#a08860" },
    forest: { light: "#4f8550", base: "#3d6e42", dark: "#2a5230" },
    deep_forest: { light: "#3a6340", base: "#2a4e32", dark: "#1a3824" },
    rocky: { light: "#969c82", base: "#7d846c", dark: "#5e6450" },
    mountain: { light: "#9098a4", base: "#6e7480", dark: "#505860" },
    water: { light: "#4ea4d4", base: "#2f86bc", dark: "#1e5f8e" },
    water_shore: { light: "#5cb0c0", base: "#3f96a8", dark: "#2a7080" },
  };
  const p = palettes[biome] ?? palettes.meadow;
  fillDiamond(ctx, cx, cy + 2, ISO_W, ISO_H, "rgba(0,0,0,0.18)");
  const grad = ctx.createLinearGradient(cx - 20, cy - 15, cx + 20, cy + 15);
  grad.addColorStop(0, p.light);
  grad.addColorStop(0.5, p.base);
  grad.addColorStop(1, p.dark);
  fillDiamond(ctx, cx, cy, ISO_W, ISO_H, grad, "rgba(0,0,0,0.2)");
  cache.set(key, c);
  return c;
}

function proceduralBuilding(type: BuildingType, level: number): HTMLCanvasElement {
  const def = BUILDINGS[type];
  const h = type === "tower" || type === "keep" ? 110 : 86;
  const c = canvas(ISO_W + 28, h);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  const baseY = h - ISO_H / 2 - 6;
  const lv = 1 + Math.min(3, level - 1) * 0.08;
  fillDiamond(ctx, cx, baseY + 1, ISO_W * 0.9, ISO_H * 0.9, "rgba(0,0,0,0.25)");
  if (type === "road") {
    fillDiamond(ctx, cx, baseY, ISO_W * 0.88, ISO_H * 0.88, "#c4a882", "#8a7048");
    return c;
  }
  const bw = (type === "keep" ? 32 : type === "tower" ? 16 : 24) * lv;
  const bh = (type === "keep" ? 36 : type === "tower" ? 42 : 20) * lv;
  const bd = 12 * lv;
  ctx.fillStyle = shade(def.color, -18);
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(def.color, 14);
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = def.roof;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - bh - bd * 0.35);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh + 1);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2 - bh);
  ctx.closePath();
  ctx.fill();
  return c;
}

export function buildingSprite(type: BuildingType, level: number): HTMLCanvasElement {
  const key = `${ART_REV}:b:${type}:${level}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const art = type === "road" ? null : buildingArtCanvas(type);
  if (art) {
    const c = canvas(Math.max(ISO_W + 24, art.width + 16), Math.max(86, art.height + 28));
    const ctx = c.getContext("2d")!;
    const cx = c.width / 2;
    drawArtCentered(ctx, art, cx, c.height - 10, c.width - 8, c.height - 14);
    for (let i = 0; i < Math.min(5, level); i++) {
      ctx.fillStyle = "#d4af37";
      ctx.beginPath();
      ctx.arc(cx - 10 + i * 5, c.height - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    cache.set(key, c);
    return c;
  }

  const proc = proceduralBuilding(type, level);
  cache.set(key, proc);
  return proc;
}

export function constructionSprite(type: BuildingType, progress: number): HTMLCanvasElement {
  const key = `${ART_REV}:c:${type}:${Math.floor(progress * 5)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = buildingSprite(type, 1);
  const c = canvas(base.width, base.height);
  const ctx = c.getContext("2d")!;
  ctx.globalAlpha = 0.35 + progress * 0.55;
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(8, c.height - 10, c.width - 16, 6);
  ctx.fillStyle = "#d4af37";
  ctx.fillRect(8, c.height - 10, (c.width - 16) * progress, 6);
  cache.set(key, c);
  return c;
}

export function fieldSprite(): HTMLCanvasElement {
  const key = `${ART_REV}:field`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(ISO_W + 4, ISO_H + 14);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  const cy = ISO_H / 2 + 4;
  fillDiamond(ctx, cx, cy + 1, ISO_W * 0.9, ISO_H * 0.9, "rgba(0,0,0,0.2)");
  const g = ctx.createLinearGradient(cx, cy - 16, cx, cy + 16);
  g.addColorStop(0, "#7a6240");
  g.addColorStop(1, "#4a3824");
  fillDiamond(ctx, cx, cy, ISO_W * 0.88, ISO_H * 0.88, g, "#3a2818");
  ctx.save();
  diamondPath(ctx, cx, cy, ISO_W * 0.88, ISO_H * 0.88);
  ctx.clip();
  for (let row = 0; row < 5; row++) {
    ctx.strokeStyle = row % 2 ? "#9fd06e" : "#6a9a48";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy - 8 + row * 5);
    ctx.lineTo(cx + 26, cy - 4 + row * 5);
    ctx.stroke();
  }
  ctx.restore();
  cache.set(key, c);
  return c;
}

export function ghostSprite(type: BuildingType): HTMLCanvasElement {
  const key = `${ART_REV}:ghost:${type}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = buildingSprite(type, 1);
  const c = canvas(base.width, base.height);
  const ctx = c.getContext("2d")!;
  ctx.globalAlpha = 0.55;
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#f0d878";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 4]);
  diamondPath(ctx, c.width / 2, c.height - ISO_H / 2 - 4, ISO_W * 0.9, ISO_H * 0.9);
  ctx.stroke();
  ctx.setLineDash([]);
  cache.set(key, c);
  return c;
}

export function villagerSprite(job: VillagerJob, selected: boolean): HTMLCanvasElement {
  const key = `${ART_REV}:v:${job}:${selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const art = villagerArtCanvas();
  if (art) {
    const c = canvas(48, 64);
    const ctx = c.getContext("2d")!;
    if (selected) {
      ctx.strokeStyle = "#f0d878";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(24, 56, 14, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawArtCentered(ctx, art, 24, 58, 44, 54);
    const badge: Record<VillagerJob, string> = {
      idle: "#8a7a68",
      woodcutter: "#4a6a32",
      farmer: "#c4a35a",
      quarryman: "#7d7f86",
      miner: "#8a7429",
      trader: "#2f5d4a",
      builder: "#8a6a28",
    };
    ctx.fillStyle = badge[job];
    ctx.fillRect(4, 4, 10, 10);
    cache.set(key, c);
    return c;
  }

  const c = canvas(36, 52);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8a7a68";
  ctx.fillRect(11, 18, 14, 16);
  ctx.fillStyle = "#e8c48a";
  ctx.beginPath();
  ctx.arc(18, 12, 7, 0, Math.PI * 2);
  ctx.fill();
  cache.set(key, c);
  return c;
}

export function unitSprite(kind: string, side: "player" | "enemy", selected: boolean): HTMLCanvasElement {
  const key = `${ART_REV}:u:${kind}:${side}:${selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(44, 56);
  const ctx = c.getContext("2d")!;
  const cx = 22;
  const friend = side === "player";
  const palette: Record<string, string> = {
    infantry: friend ? "#4a6adf" : "#b84848",
    archers: friend ? "#3cb86e" : "#a05038",
    cavalry: friend ? "#d4a830" : "#7a3ca0",
    hero: "#f0d78c",
    raider: "#c45c5c",
    beast: "#9b4dca",
  };
  const col = palette[kind] ?? "#aaa";
  if (selected) {
    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, 48, 14, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (kind === "cavalry") {
    ctx.fillStyle = shade(col, -25);
    ctx.beginPath();
    ctx.ellipse(cx, 32, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = col;
  ctx.fillRect(cx - 8, 18, 16, 18);
  ctx.fillStyle = "#e8c48a";
  ctx.beginPath();
  ctx.arc(cx, 13, 7, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "hero") {
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.moveTo(cx - 7, 8);
    ctx.lineTo(cx, 2);
    ctx.lineTo(cx + 7, 8);
    ctx.closePath();
    ctx.fill();
  }
  cache.set(key, c);
  return c;
}

export function treeSprite(deep: boolean): HTMLCanvasElement {
  const key = `${ART_REV}:tree:${deep ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const art = treeArtCanvas(deep);
  if (art) {
    const c = canvas(64, 80);
    const ctx = c.getContext("2d")!;
    if (deep) ctx.filter = "brightness(0.82) saturate(1.1)";
    drawArtCentered(ctx, art, 32, 76, 60, 72);
    ctx.filter = "none";
    cache.set(key, c);
    return c;
  }

  const c = canvas(48, 64);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#4a3220";
  ctx.fillRect(22, 40, 5, 16);
  ctx.fillStyle = deep ? "#1f4a28" : "#2a5530";
  ctx.beginPath();
  ctx.moveTo(24, 6);
  ctx.lineTo(40, 42);
  ctx.lineTo(8, 42);
  ctx.closePath();
  ctx.fill();
  cache.set(key, c);
  return c;
}

export function invalidateSpriteCache(): void {
  cache.clear();
}

export function warmSpriteAtlas(): void {
  for (const b of Object.keys(BUILDINGS) as BuildingType[]) buildingSprite(b, 1);
  for (const biome of [
    "meadow",
    "path",
    "forest",
    "deep_forest",
    "rocky",
    "mountain",
    "water",
    "water_shore",
  ]) {
    terrainSprite(biome);
  }
  treeSprite(false);
  treeSprite(true);
  fieldSprite();
}
