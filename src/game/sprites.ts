import { BUILDINGS } from "./config";
import { ISO_H, ISO_W } from "./iso";
import type { BuildingType, TroopType, VillagerJob } from "./types";

export type SpriteKey = string;

const cache = new Map<SpriteKey, HTMLCanvasElement>();

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function diamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Ground tile tint by biome — painted diamond like FoE tiles. */
export function terrainSprite(biome: string): HTMLCanvasElement {
  const key = `terrain:${biome}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = canvas(ISO_W + 2, ISO_H + 2);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  const cy = c.height / 2;
  const fills: Record<string, [string, string]> = {
    meadow: ["#6a9a4a", "#5a8a3e"],
    path: ["#c4a882", "#a08860"],
    forest: ["#3a6840", "#2f5a38"],
    deep_forest: ["#2a5530", "#1f4a28"],
    rocky: ["#7a8068", "#6a7060"],
    mountain: ["#6a7068", "#8a9098"],
    water: ["#3a8ec4", "#2a6ea8"],
    water_shore: ["#4a9ab0", "#3a8a98"],
  };
  const [a, b] = fills[biome] ?? fills.meadow;
  diamond(ctx, cx, cy, ISO_W, ISO_H, a, "rgba(0,0,0,0.12)");
  // Soft highlight / shade for depth
  ctx.globalAlpha = 0.22;
  diamond(ctx, cx - 4, cy - 2, ISO_W * 0.55, ISO_H * 0.55, b);
  ctx.globalAlpha = 1;
  if (biome === "water" || biome === "water_shore") {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#a8d8f0";
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.quadraticCurveTo(cx, cy - 4, cx + 10, cy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  cache.set(key, c);
  return c;
}

function drawBuildingArt(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  level: number,
  w: number,
  h: number,
): void {
  const def = BUILDINGS[type];
  const cx = w / 2;
  const baseY = h - ISO_H / 2 - 4;
  const scale = 1 + Math.min(3, level - 1) * 0.08;

  // Tile footprint shadow
  diamond(ctx, cx, baseY, ISO_W * 0.92, ISO_H * 0.92, "rgba(0,0,0,0.25)");

  if (type === "road") {
    diamond(ctx, cx, baseY, ISO_W * 0.88, ISO_H * 0.88, def.color, "#a08860");
    diamond(ctx, cx, baseY, ISO_W * 0.35, ISO_H * 0.2, def.roof);
    return;
  }

  if (type === "forest") {
    for (const [ox, oy, s] of [
      [-10, -6, 0.85],
      [8, -4, 1],
      [0, -14, 1.1],
    ] as const) {
      ctx.fillStyle = "#5a3d22";
      ctx.fillRect(cx + ox - 2, baseY + oy - 8 * s, 4, 14 * s);
      ctx.fillStyle = s > 1 ? "#2f5a38" : "#3a6b42";
      ctx.beginPath();
      ctx.moveTo(cx + ox, baseY + oy - 28 * s);
      ctx.lineTo(cx + ox + 12 * s, baseY + oy - 6 * s);
      ctx.lineTo(cx + ox - 12 * s, baseY + oy - 6 * s);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  if (type === "mountain") {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 36 * scale);
    ctx.lineTo(cx + 22 * scale, baseY);
    ctx.lineTo(cx - 22 * scale, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c8d0d8";
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 36 * scale);
    ctx.lineTo(cx + 8 * scale, baseY - 18 * scale);
    ctx.lineTo(cx - 6 * scale, baseY - 16 * scale);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (type === "bridge") {
    const len = Math.min(5, 2 + level);
    diamond(ctx, cx, baseY, ISO_W * (0.7 + len * 0.08), ISO_H * 0.55, "#6a5340", "#4a3a28");
    ctx.fillStyle = "#8a6a48";
    ctx.fillRect(cx - 18, baseY - 6, 36, 5);
    return;
  }

  if (type === "boat") {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 4, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.roof;
    ctx.beginPath();
    ctx.moveTo(cx - 2, baseY - 4);
    ctx.lineTo(cx - 2, baseY - 28);
    ctx.lineTo(cx + 14, baseY - 12);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (type === "wall") {
    ctx.fillStyle = def.color;
    ctx.fillRect(cx - 20 * scale, baseY - 18 * scale, 40 * scale, 18 * scale);
    ctx.fillStyle = def.roof;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(cx - 18 * scale + i * 10 * scale, baseY - 24 * scale, 6 * scale, 8 * scale);
    }
    return;
  }

  // Generic civic / military / economy buildings — isometric box + roof
  const bw = (type === "keep" ? 28 : type === "tower" ? 16 : 22) * scale;
  const bh = (type === "keep" ? 34 : type === "tower" ? 42 : 22) * scale;
  const bd = 12 * scale;

  // Right face
  ctx.fillStyle = shade(def.color, -18);
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh);
  ctx.closePath();
  ctx.fill();

  // Left face
  ctx.fillStyle = shade(def.color, 12);
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh);
  ctx.closePath();
  ctx.fill();

  // Roof
  ctx.fillStyle = def.roof;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - bh - bd * 0.35);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh + 2);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2 - bh);
  ctx.closePath();
  ctx.fill();

  // Door / window accents
  if (type === "keep" || type === "barracks" || type === "buildersHall" || type === "market") {
    ctx.fillStyle = "#2a2118";
    ctx.fillRect(cx - 4, baseY - 14 * scale, 8, 12 * scale);
  }
  if (type === "farm") {
    // Mill blades
    ctx.strokeStyle = "#d4c4a0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + bw / 2 - 2, baseY - bh);
    ctx.lineTo(cx + bw / 2 + 14, baseY - bh - 14);
    ctx.moveTo(cx + bw / 2 - 2, baseY - bh);
    ctx.lineTo(cx + bw / 2 + 14, baseY - bh + 10);
    ctx.stroke();
  }
  if (type === "tower") {
    ctx.fillStyle = "#ffb45a";
    ctx.fillRect(cx - 3, baseY - bh - 4, 6, 5);
  }
  if (type === "blacksmith") {
    ctx.fillStyle = "#b45a1a";
    ctx.beginPath();
    ctx.arc(cx + 6, baseY - bh + 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Level pips
  ctx.fillStyle = "#d4af37";
  for (let i = 0; i < Math.min(4, level); i++) {
    ctx.fillRect(cx - 10 + i * 6, baseY + 4, 4, 3);
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function buildingSprite(type: BuildingType, level: number): HTMLCanvasElement {
  const key = `b:${type}:${level}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const h =
    type === "tower" || type === "keep"
      ? 88
      : type === "mountain" || type === "forest"
        ? 72
        : 64;
  const c = canvas(ISO_W + 8, h);
  const ctx = c.getContext("2d")!;
  drawBuildingArt(ctx, type, level, c.width, c.height);
  cache.set(key, c);
  return c;
}

export function constructionSprite(type: BuildingType, progress: number): HTMLCanvasElement {
  const key = `c:${type}:${Math.floor(progress * 5)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = buildingSprite(type, 1);
  const c = canvas(base.width, base.height);
  const ctx = c.getContext("2d")!;
  ctx.globalAlpha = 0.35 + progress * 0.55;
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(212,175,55,0.85)";
  ctx.fillRect(8, c.height - 10, (c.width - 16) * progress, 4);
  cache.set(key, c);
  return c;
}

export function fieldSprite(): HTMLCanvasElement {
  const key = "field";
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(ISO_W, ISO_H + 8);
  const ctx = c.getContext("2d")!;
  diamond(ctx, c.width / 2, ISO_H / 2 + 2, ISO_W * 0.9, ISO_H * 0.9, "#6a5438", "#4a3a28");
  ctx.strokeStyle = "#8fbf6a";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(12, 8 + i * 6);
    ctx.lineTo(c.width - 12, 10 + i * 6);
    ctx.stroke();
  }
  cache.set(key, c);
  return c;
}

export function ghostSprite(type: BuildingType): HTMLCanvasElement {
  const key = `ghost:${type}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = buildingSprite(type, 1);
  const c = canvas(base.width, base.height);
  const ctx = c.getContext("2d")!;
  ctx.globalAlpha = 0.45;
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const gcx = c.width / 2;
  const gcy = c.height - ISO_H / 2 - 4;
  ctx.moveTo(gcx, gcy - (ISO_H * 0.9) / 2);
  ctx.lineTo(gcx + (ISO_W * 0.9) / 2, gcy);
  ctx.lineTo(gcx, gcy + (ISO_H * 0.9) / 2);
  ctx.lineTo(gcx - (ISO_W * 0.9) / 2, gcy);
  ctx.closePath();
  ctx.stroke();
  cache.set(key, c);
  return c;
}

export function villagerSprite(job: VillagerJob, selected: boolean): HTMLCanvasElement {
  const key = `v:${job}:${selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(28, 40);
  const ctx = c.getContext("2d")!;
  const colors: Record<VillagerJob, string> = {
    idle: "#8a7a68",
    woodcutter: "#5a7a3a",
    farmer: "#c4a35a",
    quarryman: "#7d7f86",
    miner: "#8a7429",
    trader: "#2f5d4a",
    builder: "#8a6a28",
  };
  const body = colors[job];
  if (selected) {
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(14, 34, 10, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = body;
  ctx.fillRect(9, 14, 10, 14);
  ctx.fillStyle = "#e8c48a";
  ctx.beginPath();
  ctx.arc(14, 10, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(10, 28, 3, 8);
  ctx.fillRect(15, 28, 3, 8);
  cache.set(key, c);
  return c;
}

export function unitSprite(kind: string, side: "player" | "enemy", selected: boolean): HTMLCanvasElement {
  const key = `u:${kind}:${side}:${selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(32, 40);
  const ctx = c.getContext("2d")!;
  const palette: Record<string, string> = {
    infantry: side === "player" ? "#5b7cfa" : "#c45c5c",
    archers: side === "player" ? "#5ecf8a" : "#a35a3c",
    cavalry: side === "player" ? "#e0b44e" : "#9b4dca",
    hero: "#f0d78c",
    tower: "#9aa3b2",
    keep: "#c9a227",
    raider: "#c45c5c",
    beast: "#9b4dca",
  };
  const col = palette[kind] ?? "#ccc";
  if (selected) {
    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(16, 34, 12, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  if (kind === "cavalry") {
    ctx.beginPath();
    ctx.ellipse(16, 24, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(10, 12, 12, 16);
  }
  ctx.fillStyle = "#e8c48a";
  ctx.beginPath();
  ctx.arc(16, 10, 5, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "archers") {
    ctx.strokeStyle = "#5a3d22";
    ctx.beginPath();
    ctx.arc(22, 18, 6, -1, 1);
    ctx.stroke();
  }
  if (kind === "hero") {
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(13, 2, 6, 4);
  }
  cache.set(key, c);
  return c;
}

export function treeSprite(deep: boolean): HTMLCanvasElement {
  const key = `tree:${deep ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(40, 52);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#5a3d22";
  ctx.fillRect(18, 28, 5, 14);
  ctx.fillStyle = deep ? "#1f4a28" : "#2a5530";
  ctx.beginPath();
  ctx.moveTo(20, 4);
  ctx.lineTo(34, 30);
  ctx.lineTo(6, 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = deep ? "#2a5530" : "#35663a";
  ctx.beginPath();
  ctx.moveTo(20, 12);
  ctx.lineTo(30, 34);
  ctx.lineTo(10, 34);
  ctx.closePath();
  ctx.fill();
  cache.set(key, c);
  return c;
}

/** Warm up the common atlas so the first frames stay smooth. */
export function warmSpriteAtlas(): void {
  for (const b of Object.keys(BUILDINGS) as BuildingType[]) {
    buildingSprite(b, 1);
    buildingSprite(b, 3);
  }
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
  for (const job of [
    "idle",
    "woodcutter",
    "farmer",
    "quarryman",
    "miner",
    "trader",
    "builder",
  ] as VillagerJob[]) {
    villagerSprite(job, false);
  }
  for (const t of ["infantry", "archers", "cavalry", "hero"] as TroopType[]) {
    unitSprite(t, "player", false);
    unitSprite(t, "enemy", false);
  }
}
