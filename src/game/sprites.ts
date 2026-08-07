import { BUILDINGS } from "./config";
import { ISO_H, ISO_W } from "./iso";
import type { BuildingType, VillagerJob } from "./types";

const cache = new Map<string, HTMLCanvasElement>();
const ART_REV = "v3";

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

function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function speckles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  color: string,
  count: number,
  seed: number,
): void {
  ctx.save();
  diamondPath(ctx, cx, cy, w, h);
  ctx.clip();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const t = hash(seed + i * 17);
    const u = hash(seed + i * 31 + 3);
    const x = cx + (t - 0.5) * w * 0.9;
    const y = cy + (u - 0.5) * h * 0.9;
    // Keep points roughly inside diamond
    if (Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2) > 0.95) continue;
    ctx.globalAlpha = 0.15 + hash(seed + i) * 0.35;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Painted ground tile — FoE-style diamond with texture. */
export function terrainSprite(biome: string): HTMLCanvasElement {
  const key = `${ART_REV}:terrain:${biome}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = canvas(ISO_W + 4, ISO_H + 4);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  const cy = c.height / 2;

  const palettes: Record<string, { base: string; light: string; dark: string; accent: string }> = {
    meadow: { base: "#6faa52", light: "#8bc46a", dark: "#4e8638", accent: "#a8d478" },
    path: { base: "#c9ae86", light: "#dfc69e", dark: "#a08860", accent: "#b89870" },
    forest: { base: "#3d6e42", light: "#4f8550", dark: "#2a5230", accent: "#5a9a58" },
    deep_forest: { base: "#2a4e32", light: "#3a6340", dark: "#1a3824", accent: "#456848" },
    rocky: { base: "#7d846c", light: "#969c82", dark: "#5e6450", accent: "#a8a890" },
    mountain: { base: "#6e7480", light: "#9098a4", dark: "#505860", accent: "#c0c8d0" },
    water: { base: "#2f86bc", light: "#4ea4d4", dark: "#1e5f8e", accent: "#a8dff0" },
    water_shore: { base: "#3f96a8", light: "#5cb0c0", dark: "#2a7080", accent: "#90d0d8" },
  };
  const p = palettes[biome] ?? palettes.meadow;

  // Soft drop under tile
  fillDiamond(ctx, cx, cy + 2, ISO_W, ISO_H, "rgba(0,0,0,0.18)");

  const grad = ctx.createLinearGradient(cx - ISO_W / 2, cy - ISO_H / 2, cx + ISO_W / 2, cy + ISO_H / 2);
  grad.addColorStop(0, p.light);
  grad.addColorStop(0.45, p.base);
  grad.addColorStop(1, p.dark);
  fillDiamond(ctx, cx, cy, ISO_W, ISO_H, grad, "rgba(0,0,0,0.22)");

  // Lit edge (top-left)
  ctx.save();
  diamondPath(ctx, cx, cy, ISO_W, ISO_H);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - ISO_W / 2 + 2, cy);
  ctx.lineTo(cx, cy - ISO_H / 2 + 2);
  ctx.stroke();
  ctx.restore();

  speckles(ctx, cx, cy, ISO_W, ISO_H, p.accent, biome === "meadow" ? 28 : 18, biome.length * 99);

  if (biome === "meadow") {
    ctx.save();
    diamondPath(ctx, cx, cy, ISO_W, ISO_H);
    ctx.clip();
    ctx.strokeStyle = "rgba(200,230,120,0.45)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const t = hash(40 + i);
      const u = hash(80 + i);
      const x = cx + (t - 0.5) * ISO_W * 0.7;
      const y = cy + (u - 0.5) * ISO_H * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x + 1, y - 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (biome === "water" || biome === "water_shore") {
    ctx.save();
    diamondPath(ctx, cx, cy, ISO_W, ISO_H);
    ctx.clip();
    ctx.strokeStyle = p.accent;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 4 + i * 5);
      ctx.quadraticCurveTo(cx, cy - 8 + i * 5, cx + 18, cy - 2 + i * 5);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  if (biome === "path") {
    fillDiamond(ctx, cx, cy, ISO_W * 0.42, ISO_H * 0.28, shade(p.dark, 10));
  }

  cache.set(key, c);
  return c;
}

/** Classic FoE isometric block: left face, right face, top. */
function isoBlock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  bw: number,
  bh: number,
  bd: number,
  left: string,
  right: string,
  top: string,
): void {
  // Right face
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh);
  ctx.closePath();
  ctx.fill();

  // Left face
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh);
  ctx.closePath();
  ctx.fill();

  // Top / roof plane
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - bh - bd * 0.4);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh + 1);
  ctx.lineTo(cx - bw / 2, baseY - bd / 2 - bh);
  ctx.closePath();
  ctx.fill();

  // Rim highlight
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, baseY - bd / 2 - bh);
  ctx.lineTo(cx, baseY - bh - bd * 0.4);
  ctx.lineTo(cx + bw / 2, baseY - bd / 2 - bh);
  ctx.stroke();
}

function windowGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w = 5,
  h = 6,
): void {
  ctx.fillStyle = "#2a2118";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#ffe0a0");
  g.addColorStop(1, "#e09040");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function door(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#5a4030";
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = "#d4af37";
  ctx.beginPath();
  ctx.arc(x + w - 3, y + h / 2, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function banner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  ctx.strokeStyle = "#5a4634";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 16);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x + 12, y - 12);
  ctx.lineTo(x, y - 8);
  ctx.closePath();
  ctx.fill();
}

function drawPine(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  scale: number,
  deep: boolean,
): void {
  const trunkH = 14 * scale;
  ctx.fillStyle = "#4a3220";
  ctx.fillRect(x - 2 * scale, groundY - trunkH, 4 * scale, trunkH);

  const layers = [
    { y: 0.95, w: 0.55, c: deep ? "#1a3d28" : "#2a5530" },
    { y: 0.62, w: 0.72, c: deep ? "#244a32" : "#35663a" },
    { y: 0.32, w: 0.9, c: deep ? "#2f5a3a" : "#3f7644" },
  ];
  for (const L of layers) {
    const top = groundY - trunkH - 28 * scale * L.y;
    const bot = groundY - trunkH + 4 * scale;
    const half = 14 * scale * L.w;
    ctx.fillStyle = L.c;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, bot - 8 * scale * L.y);
    ctx.lineTo(x - half, bot - 8 * scale * L.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(180,220,140,0.12)";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - half * 0.35, bot - 8 * scale * L.y);
    ctx.lineTo(x, bot - 10 * scale * L.y);
    ctx.closePath();
    ctx.fill();
  }
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
  const baseY = h - ISO_H / 2 - 6;
  const lv = 1 + Math.min(4, level - 1) * 0.1;

  fillDiamond(ctx, cx, baseY + 1, ISO_W * 0.95, ISO_H * 0.95, "rgba(0,0,0,0.28)");

  if (type === "road") {
    fillDiamond(ctx, cx, baseY, ISO_W * 0.9, ISO_H * 0.9, "#c4a882", "#8a7048");
    fillDiamond(ctx, cx, baseY, ISO_W * 0.55, ISO_H * 0.35, "#b09068");
    fillDiamond(ctx, cx, baseY, ISO_W * 0.22, ISO_H * 0.14, "#d4c4a0");
    return;
  }

  if (type === "forest") {
    drawPine(ctx, cx - 14, baseY, 0.85, false);
    drawPine(ctx, cx + 12, baseY - 2, 1.0, false);
    drawPine(ctx, cx - 2, baseY - 6, 1.15, true);
    return;
  }

  if (type === "mountain") {
    ctx.fillStyle = "#5a6068";
    ctx.beginPath();
    ctx.moveTo(cx - 28 * lv, baseY);
    ctx.lineTo(cx - 8 * lv, baseY - 42 * lv);
    ctx.lineTo(cx + 6 * lv, baseY - 22 * lv);
    ctx.lineTo(cx + 26 * lv, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7a828c";
    ctx.beginPath();
    ctx.moveTo(cx - 6 * lv, baseY);
    ctx.lineTo(cx + 10 * lv, baseY - 48 * lv);
    ctx.lineTo(cx + 28 * lv, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8eef4";
    ctx.beginPath();
    ctx.moveTo(cx + 10 * lv, baseY - 48 * lv);
    ctx.lineTo(cx + 16 * lv, baseY - 32 * lv);
    ctx.lineTo(cx + 4 * lv, baseY - 30 * lv);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (type === "bridge") {
    const span = 0.75 + Math.min(4, level) * 0.08;
    fillDiamond(ctx, cx, baseY, ISO_W * span, ISO_H * 0.5, "#5a4634", "#3a2a1c");
    // Planks
    ctx.strokeStyle = "#8a6a48";
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 22 * span, baseY - 2 + i * 3);
      ctx.lineTo(cx + 22 * span, baseY - 4 + i * 3);
      ctx.stroke();
    }
    // Rails
    ctx.strokeStyle = "#4a3a28";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 24 * span, baseY - 10);
    ctx.lineTo(cx + 24 * span, baseY - 12);
    ctx.moveTo(cx - 24 * span, baseY + 4);
    ctx.lineTo(cx + 24 * span, baseY + 2);
    ctx.stroke();
    return;
  }

  if (type === "boat") {
    ctx.fillStyle = "#3a6ea5";
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 2, 22, 9, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a4030";
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 4, 20, 7, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8e8f8";
    ctx.beginPath();
    ctx.moveTo(cx - 2, baseY - 6);
    ctx.lineTo(cx - 2, baseY - 34);
    ctx.lineTo(cx + 18, baseY - 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#5a4634";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 2, baseY - 6);
    ctx.lineTo(cx - 2, baseY - 34);
    ctx.stroke();
    return;
  }

  if (type === "wall") {
    const bw = 36 * lv;
    const bh = 16 * lv;
    const bd = 14 * lv;
    isoBlock(ctx, cx, baseY, bw, bh, bd, "#7a766c", "#5e5a52", "#8a8680");
    ctx.fillStyle = "#9a9690";
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) / 2;
      ctx.fillRect(cx + t * 14 * lv - 3, baseY - bh - bd * 0.55 - 8 * lv, 6, 9 * lv);
    }
    return;
  }

  // --- Distinct building portraits ---
  if (type === "keep") {
    const bw = 34 * lv;
    const bh = 40 * lv;
    const bd = 16 * lv;
    isoBlock(ctx, cx, baseY, bw, bh, bd, shade(def.color, 15), shade(def.color, -20), def.roof);
    // Corner towers
    isoBlock(ctx, cx - 16 * lv, baseY - 6, 12 * lv, 28 * lv, 8 * lv, "#6a5644", "#4a3a30", "#8b3a2a");
    isoBlock(ctx, cx + 16 * lv, baseY - 6, 12 * lv, 28 * lv, 8 * lv, "#6a5644", "#4a3a30", "#8b3a2a");
    door(ctx, cx - 5, baseY - 16 * lv, 10, 14 * lv);
    windowGlow(ctx, cx - 14, baseY - 28 * lv);
    windowGlow(ctx, cx + 8, baseY - 28 * lv);
    banner(ctx, cx + 4, baseY - bh - 4, "#3a6ea5");
    // Crenellations
    ctx.fillStyle = shade(def.color, 5);
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(cx - 14 * lv + i * 9 * lv, baseY - bh - bd * 0.5 - 6, 5, 7);
    }
  } else if (type === "farm") {
    const bw = 26 * lv;
    const bh = 18 * lv;
    const bd = 14 * lv;
    isoBlock(ctx, cx - 4, baseY, bw, bh, bd, shade(def.color, 12), shade(def.color, -15), def.roof);
    // Mill tower + blades
    isoBlock(ctx, cx + 14, baseY - 2, 12 * lv, 26 * lv, 8 * lv, "#8a7a58", "#6a5a40", "#c4a35a");
    ctx.strokeStyle = "#e8d8b0";
    ctx.lineWidth = 3.5;
    const mx = cx + 14;
    const my = baseY - 28 * lv;
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(ang) * 16, my + Math.sin(ang) * 16);
      ctx.stroke();
    }
    ctx.fillStyle = "#5a4634";
    ctx.beginPath();
    ctx.arc(mx, my, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "lumber") {
    isoBlock(ctx, cx, baseY, 24 * lv, 16 * lv, 12 * lv, shade(def.color, 10), shade(def.color, -18), def.roof);
    // Log piles
    ctx.fillStyle = "#5a3d22";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx - 16 + i * 5, baseY - 4, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#3a2818";
    ctx.strokeRect(cx + 8, baseY - 22, 3, 16);
  } else if (type === "quarry") {
    isoBlock(ctx, cx, baseY, 22 * lv, 12 * lv, 12 * lv, "#8a8e96", "#6a6e76", "#a0a4ac");
    ctx.fillStyle = "#9aa0a8";
    ctx.beginPath();
    ctx.moveTo(cx - 18, baseY - 2);
    ctx.lineTo(cx - 6, baseY - 20);
    ctx.lineTo(cx + 8, baseY - 8);
    ctx.lineTo(cx + 18, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c0c4c8";
    ctx.fillRect(cx + 6, baseY - 14, 10, 8);
  } else if (type === "mine") {
    isoBlock(ctx, cx, baseY, 20 * lv, 14 * lv, 12 * lv, shade(def.color, 8), shade(def.color, -20), def.roof);
    // Adit
    ctx.fillStyle = "#1a1810";
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 6, 8, 10, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(cx - 10, baseY - 28 * lv, 4, 12);
    ctx.fillRect(cx + 6, baseY - 28 * lv, 4, 12);
  } else if (type === "barracks") {
    isoBlock(ctx, cx, baseY, 30 * lv, 20 * lv, 14 * lv, shade(def.color, 12), shade(def.color, -18), def.roof);
    door(ctx, cx - 5, baseY - 14 * lv, 10, 12 * lv);
    windowGlow(ctx, cx - 12, baseY - 22 * lv, 4, 5);
    windowGlow(ctx, cx + 8, baseY - 22 * lv, 4, 5);
    banner(ctx, cx + 10, baseY - 22 * lv, "#6b2f2f");
    // Weapon rack hint
    ctx.strokeStyle = "#8a8a90";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 16, baseY - 8);
    ctx.lineTo(cx - 16, baseY - 20);
    ctx.stroke();
  } else if (type === "trainingGround") {
    fillDiamond(ctx, cx, baseY, ISO_W * 0.85, ISO_H * 0.75, "#6a5a40", "#4a3a28");
    // Dummy posts
    for (const ox of [-12, 0, 12]) {
      ctx.fillStyle = "#5a4634";
      ctx.fillRect(cx + ox - 2, baseY - 18, 4, 16);
      ctx.fillStyle = "#c45c4a";
      ctx.beginPath();
      ctx.arc(cx + ox, baseY - 20, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    isoBlock(ctx, cx + 18, baseY - 2, 12 * lv, 10 * lv, 8 * lv, "#5a4a38", "#3a3028", "#8b3a2a");
  } else if (type === "tower") {
    isoBlock(ctx, cx, baseY, 16 * lv, 44 * lv, 10 * lv, shade(def.color, 14), shade(def.color, -22), def.roof);
    windowGlow(ctx, cx - 3, baseY - 20 * lv);
    windowGlow(ctx, cx - 3, baseY - 34 * lv);
    ctx.fillStyle = "#ffb45a";
    ctx.beginPath();
    ctx.arc(cx, baseY - 48 * lv, 4, 0, Math.PI * 2);
    ctx.fill();
    banner(ctx, cx + 6, baseY - 40 * lv, "#3d4a5c");
  } else if (type === "blacksmith") {
    isoBlock(ctx, cx, baseY, 24 * lv, 16 * lv, 12 * lv, shade(def.color, 10), shade(def.color, -15), def.roof);
    // Chimney smoke glow
    ctx.fillStyle = "#2a2218";
    ctx.fillRect(cx + 8, baseY - 28 * lv, 7, 14 * lv);
    ctx.fillStyle = "#b45a1a";
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(cx + 11, baseY - 30 * lv, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Anvil
    ctx.fillStyle = "#4a4a50";
    ctx.fillRect(cx - 14, baseY - 8, 12, 5);
    ctx.fillRect(cx - 10, baseY - 12, 6, 4);
  } else if (type === "market") {
    isoBlock(ctx, cx, baseY, 28 * lv, 14 * lv, 14 * lv, shade(def.color, 12), shade(def.color, -18), def.roof);
    // Awning stripes
    ctx.fillStyle = "#e8d8a8";
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = i % 2 ? 0.55 : 0.25;
      ctx.beginPath();
      ctx.moveTo(cx - 14 + i * 7, baseY - 14);
      ctx.lineTo(cx - 10 + i * 7, baseY - 4);
      ctx.lineTo(cx - 4 + i * 7, baseY - 4);
      ctx.lineTo(cx - 8 + i * 7, baseY - 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Crates
    ctx.fillStyle = "#8a6a28";
    ctx.fillRect(cx - 16, baseY - 6, 8, 6);
    ctx.fillRect(cx + 6, baseY - 5, 7, 5);
  } else if (type === "buildersHall") {
    isoBlock(ctx, cx, baseY, 28 * lv, 18 * lv, 14 * lv, shade(def.color, 12), shade(def.color, -18), def.roof);
    door(ctx, cx - 5, baseY - 14 * lv, 10, 12 * lv);
    // Scaffold / timber
    ctx.strokeStyle = "#c4a882";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 8, baseY - 22, 14, 16);
    ctx.beginPath();
    ctx.moveTo(cx + 8, baseY - 22);
    ctx.lineTo(cx + 22, baseY - 6);
    ctx.stroke();
    banner(ctx, cx - 8, baseY - 20 * lv, "#8a6a28");
  } else {
    isoBlock(
      ctx,
      cx,
      baseY,
      24 * lv,
      18 * lv,
      12 * lv,
      shade(def.color, 12),
      shade(def.color, -18),
      def.roof,
    );
    door(ctx, cx - 4, baseY - 12 * lv, 8, 10 * lv);
  }

  // Level gem row
  for (let i = 0; i < Math.min(5, level); i++) {
    ctx.fillStyle = i < level ? "#d4af37" : "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(cx - 10 + i * 5, baseY + 8, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function buildingSprite(type: BuildingType, level: number): HTMLCanvasElement {
  const key = `${ART_REV}:b:${type}:${level}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const h =
    type === "tower" || type === "keep"
      ? 110
      : type === "mountain" || type === "forest" || type === "boat"
        ? 90
        : 78;
  const c = canvas(ISO_W + 24, h);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  drawBuildingArt(ctx, type, level, c.width, c.height);
  cache.set(key, c);
  return c;
}

export function constructionSprite(type: BuildingType, progress: number): HTMLCanvasElement {
  const key = `${ART_REV}:c:${type}:${Math.floor(progress * 5)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = buildingSprite(type, 1);
  const c = canvas(base.width, base.height);
  const ctx = c.getContext("2d")!;
  ctx.globalAlpha = 0.3 + progress * 0.6;
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = 1;
  // Scaffold overlay
  ctx.strokeStyle = "rgba(212,175,55,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 8, c.width - 20, c.height - 24);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(10, c.height - 12, c.width - 20, 6);
  ctx.fillStyle = "#d4af37";
  ctx.fillRect(10, c.height - 12, (c.width - 20) * progress, 6);
  cache.set(key, c);
  return c;
}

export function fieldSprite(): HTMLCanvasElement {
  const key = `${ART_REV}:field`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(ISO_W + 4, ISO_H + 16);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  const cy = ISO_H / 2 + 4;
  fillDiamond(ctx, cx, cy + 1, ISO_W * 0.92, ISO_H * 0.92, "rgba(0,0,0,0.2)");
  const g = ctx.createLinearGradient(cx, cy - 20, cx, cy + 20);
  g.addColorStop(0, "#7a6240");
  g.addColorStop(1, "#4a3824");
  fillDiamond(ctx, cx, cy, ISO_W * 0.9, ISO_H * 0.9, g, "#3a2818");
  ctx.save();
  diamondPath(ctx, cx, cy, ISO_W * 0.9, ISO_H * 0.9);
  ctx.clip();
  for (let row = 0; row < 5; row++) {
    ctx.strokeStyle = row % 2 ? "#8fbf6a" : "#6a9a48";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(cx - 28, cy - 10 + row * 5);
    ctx.lineTo(cx + 28, cy - 6 + row * 5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
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
  ctx.globalAlpha = 0.5;
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#f0d878";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 3]);
  const gcx = c.width / 2;
  const gcy = c.height - ISO_H / 2 - 6;
  diamondPath(ctx, gcx, gcy, ISO_W * 0.92, ISO_H * 0.92);
  ctx.stroke();
  ctx.setLineDash([]);
  cache.set(key, c);
  return c;
}

export function villagerSprite(job: VillagerJob, selected: boolean): HTMLCanvasElement {
  const key = `${ART_REV}:v:${job}:${selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(36, 52);
  const ctx = c.getContext("2d")!;
  const colors: Record<VillagerJob, { tunic: string; accent: string }> = {
    idle: { tunic: "#8a7a68", accent: "#c4b49a" },
    woodcutter: { tunic: "#4a6a32", accent: "#8a5a28" },
    farmer: { tunic: "#c4a35a", accent: "#6a8f3c" },
    quarryman: { tunic: "#7d7f86", accent: "#a8adb8" },
    miner: { tunic: "#8a7429", accent: "#d4af37" },
    trader: { tunic: "#2f5d4a", accent: "#c9a227" },
    builder: { tunic: "#8a6a28", accent: "#e0c15a" },
  };
  const col = colors[job];
  const cx = 18;

  if (selected) {
    ctx.strokeStyle = "#f0d878";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, 44, 12, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Legs
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(cx - 5, 34, 4, 10);
  ctx.fillRect(cx + 1, 34, 4, 10);
  // Body
  ctx.fillStyle = col.tunic;
  ctx.fillRect(cx - 7, 18, 14, 17);
  ctx.fillStyle = shade(col.tunic, 20);
  ctx.fillRect(cx - 7, 18, 5, 17);
  // Head
  const skin = ctx.createRadialGradient(cx - 1, 11, 1, cx, 12, 7);
  skin.addColorStop(0, "#f0d0a8");
  skin.addColorStop(1, "#d4a878");
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, 12, 7, 0, Math.PI * 2);
  ctx.fill();
  // Hair / hat
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.arc(cx, 9, 6, Math.PI, 0);
  ctx.fill();
  if (job === "builder") {
    ctx.fillStyle = col.accent;
    ctx.fillRect(cx - 8, 6, 16, 4);
  }
  if (job === "woodcutter") {
    ctx.fillStyle = col.accent;
    ctx.fillRect(cx + 6, 22, 3, 14);
    ctx.fillRect(cx + 4, 20, 7, 3);
  }
  if (job === "farmer") {
    ctx.fillStyle = col.accent;
    ctx.beginPath();
    ctx.ellipse(cx, 8, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  cache.set(key, c);
  return c;
}

export function unitSprite(kind: string, side: "player" | "enemy", selected: boolean): HTMLCanvasElement {
  const key = `${ART_REV}:u:${kind}:${side}:${selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(40, 52);
  const ctx = c.getContext("2d")!;
  const cx = 20;
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
    ctx.ellipse(cx, 45, 14, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (kind === "cavalry") {
    ctx.fillStyle = shade(col, -30);
    ctx.beginPath();
    ctx.ellipse(cx, 30, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2a18";
    ctx.fillRect(cx - 10, 34, 4, 8);
    ctx.fillRect(cx + 6, 34, 4, 8);
  }

  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx - 8, 34);
  ctx.lineTo(cx - 9, 18);
  ctx.lineTo(cx + 9, 18);
  ctx.lineTo(cx + 8, 34);
  ctx.closePath();
  ctx.fill();

  const skin = "#e8c48a";
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, 13, 6.5, 0, Math.PI * 2);
  ctx.fill();

  if (kind === "infantry" || kind === "raider") {
    ctx.fillStyle = "#c0c4c8";
    ctx.beginPath();
    ctx.arc(cx, 12, 7, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = "#8a9098";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 8, 20);
    ctx.lineTo(cx + 8, 36);
    ctx.stroke();
  }
  if (kind === "archers") {
    ctx.strokeStyle = "#5a3d22";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + 10, 24, 8, -1.1, 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 10, 16);
    ctx.lineTo(cx + 10, 32);
    ctx.stroke();
  }
  if (kind === "hero") {
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.moveTo(cx - 7, 8);
    ctx.lineTo(cx, 2);
    ctx.lineTo(cx + 7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f0d78c";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 10, 18, 20, 14);
  }
  if (kind === "beast") {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, 28, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1018";
    ctx.beginPath();
    ctx.arc(cx - 4, 24, 2, 0, Math.PI * 2);
    ctx.arc(cx + 4, 24, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  cache.set(key, c);
  return c;
}

export function treeSprite(deep: boolean): HTMLCanvasElement {
  const key = `${ART_REV}:tree:${deep ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(52, 68);
  const ctx = c.getContext("2d")!;
  drawPine(ctx, 26, 62, deep ? 1.15 : 1, deep);
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
    villagerSprite(job, true);
  }
  for (const t of ["infantry", "archers", "cavalry", "hero", "raider", "beast"] as string[]) {
    unitSprite(t, "player", false);
    unitSprite(t, "enemy", false);
  }
}
