import { BUILDINGS, CELL, GRID_H, GRID_W, TILE } from "./config";
import { siteUnlocked } from "./state";
import { getWorldLayout } from "./worldGen";
import type { BattleUnit, GameState } from "./types";

const W = 1100;
const H = 720;

export function canvasSize(): { w: number; h: number } {
  return { w: W, h: H };
}

export function drawVillage(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  hover: { x: number; y: number } | null,
): void {
  ctx.clearRect(0, 0, W, H);

  // Ground
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#3d5c3a");
  grd.addColorStop(1, "#2f4a32");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Soft patches
  for (let i = 0; i < 40; i++) {
    const x = ((i * 97) % W) + 10;
    const y = ((i * 53) % H) + 10;
    ctx.fillStyle = i % 2 === 0 ? "rgba(90,140,70,0.25)" : "rgba(50,80,45,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y, 28, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_W; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, H);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(W, y * CELL);
    ctx.stroke();
  }

  // Hover ghost
  if (hover && state.selectedBuild && state.mode === "village") {
    const def = BUILDINGS[state.selectedBuild];
    ctx.fillStyle = "rgba(212, 175, 55, 0.28)";
    ctx.fillRect(hover.x * CELL, hover.y * CELL, CELL, CELL);
    ctx.strokeStyle = "#d4af37";
    ctx.strokeRect(hover.x * CELL + 1, hover.y * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = "#f5e6c8";
    ctx.font = "11px 'Source Sans 3', sans-serif";
    ctx.fillText(def.name, hover.x * CELL + 4, hover.y * CELL + 14);
  }

  // Buildings
  for (const b of state.buildings) {
    drawBuilding(ctx, b.x, b.y, b.type, b.level, state.selectedBuildingId === b.id);
  }

  // Keep HP bar in village
  const keep = state.buildings.find((b) => b.type === "keep");
  if (keep) {
    const px = keep.x * CELL;
    const py = keep.y * CELL;
    const ratio = state.keepHp / state.keepMaxHp;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(px + 8, py + CELL - 10, CELL - 16, 5);
    ctx.fillStyle = ratio > 0.4 ? "#6fbf73" : "#c44";
    ctx.fillRect(px + 8, py + CELL - 10, (CELL - 16) * ratio, 5);
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  type: keyof typeof BUILDINGS,
  level: number,
  selected: boolean,
): void {
  const def = BUILDINGS[type];
  const x = gx * CELL;
  const y = gy * CELL;
  const pad = Math.max(4, (type === "wall" ? 6 : 8) - (level - 1) * 1.2);
  const bodyH = CELL - pad * 2 - 4 + Math.min(8, (level - 1) * 2);
  const bodyY = y + pad + 6 + (CELL - pad * 2 - 4 - bodyH);

  if (selected) {
    ctx.fillStyle = "rgba(212,175,55,0.2)";
    ctx.fillRect(x, y, CELL, CELL);
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x + pad + 3, y + pad + 5, CELL - pad * 2, CELL - pad * 2);

  // Body
  ctx.fillStyle = def.color;
  roundRect(ctx, x + pad, bodyY, CELL - pad * 2, bodyH, 4);
  ctx.fill();

  // Roof
  ctx.fillStyle = def.roof;
  const roofTop = bodyY - (type === "keep" || type === "tower" ? 8 + level * 2 : 0);
  if (type === "keep" || type === "tower") {
    ctx.beginPath();
    ctx.moveTo(x + pad - 2, bodyY + 8);
    ctx.lineTo(x + CELL / 2, roofTop);
    ctx.lineTo(x + CELL - pad + 2, bodyY + 8);
    ctx.closePath();
    ctx.fill();
  } else if (type === "wall") {
    ctx.fillRect(x + 4, y + 10, CELL - 8, CELL - 20 + Math.min(10, level * 3));
    if (level >= 2) {
      ctx.fillStyle = "#55524c";
      for (let i = 0; i < 3 + level; i++) {
        ctx.fillRect(x + 8 + i * 10, y + 8, 5, 6);
      }
    }
  } else {
    ctx.fillRect(x + pad, bodyY - 12 - Math.min(6, level), CELL - pad * 2, 12 + Math.min(6, level));
  }

  // Banner for keep
  if (type === "keep") {
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(x + CELL / 2 - 2, y + 6, 4, 18 + level * 2);
    ctx.fillStyle = level >= 5 ? "#c9a227" : "#8b1e1e";
    ctx.fillRect(x + CELL / 2 + 2, y + 8, 12, 8);
    if (level >= 3) {
      ctx.fillStyle = def.color;
      ctx.fillRect(x + pad, bodyY + bodyH - 10, 8, 8);
      ctx.fillRect(x + CELL - pad - 8, bodyY + bodyH - 10, 8, 8);
    }
  }

  if (level >= 4 && type !== "wall") {
    ctx.strokeStyle = "rgba(201,162,39,0.55)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + pad + 1, bodyY + 1, CELL - pad * 2 - 2, bodyH - 2, 4);
    ctx.stroke();
  }

  ctx.fillStyle = "#f0e6d2";
  ctx.font = "bold 11px 'Source Sans 3', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`L${level}`, x + CELL / 2, y + CELL - 14);
  ctx.textAlign = "left";

  // Icon letter
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 13px Cinzel, serif";
  ctx.textAlign = "center";
  ctx.fillText(def.name[0], x + CELL / 2, y + CELL / 2 + 4);
  ctx.textAlign = "left";
}

export function drawBattle(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.clearRect(0, 0, W, H);
  // Night battlefield
  ctx.fillStyle = "#1a2430";
  ctx.fillRect(0, 0, W, H);

  // Dim village footprints
  ctx.globalAlpha = 0.35;
  for (const b of state.buildings) {
    drawBuilding(ctx, b.x, b.y, b.type, b.level, false);
  }
  ctx.globalAlpha = 1;

  // Torches
  for (let i = 0; i < 8; i++) {
    const x = 80 + i * 90;
    ctx.fillStyle = "rgba(255,160,60,0.15)";
    ctx.beginPath();
    ctx.arc(x, H - 40, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!state.battle) return;
  for (const u of state.battle.units) {
    if (u.hp <= 0 && u.kind !== "keep") continue;
    drawUnit(ctx, u);
  }

  // Overlay
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, W, 36);
  ctx.fillStyle = "#f5e6c8";
  ctx.font = "600 16px Cinzel, serif";
  ctx.fillText(state.battle.waveLabel, 16, 24);
  if (state.paused) {
    ctx.fillStyle = "#d4af37";
    ctx.fillText("PAUSED — Space to resume", W - 280, 24);
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, u: BattleUnit): void {
  const colors: Record<string, string> = {
    infantry: "#5b7cfa",
    archers: "#5ecf8a",
    cavalry: "#e0b44e",
    hero: "#f0d78c",
    tower: "#9aa3b2",
    keep: "#c9a227",
    raider: "#c45c5c",
    beast: "#9b4dca",
  };
  const color = colors[u.kind] ?? "#ccc";

  if (u.kind === "keep") {
    const ratio = u.hp / u.maxHp;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(u.x - 40, u.y - 50, 80, 8);
    ctx.fillStyle = ratio > 0.35 ? "#6fbf73" : "#e55";
    ctx.fillRect(u.x - 40, u.y - 50, 80 * ratio, 8);
    return;
  }

  ctx.beginPath();
  ctx.fillStyle = u.side === "player" ? color : color;
  ctx.arc(u.x, u.y, u.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = u.side === "player" ? "#e8f0ff" : "#2a1010";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (u.kind === "hero") {
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // HP
  const ratio = Math.max(0, u.hp / u.maxHp);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(u.x - 12, u.y - u.radius - 8, 24, 3);
  ctx.fillStyle = ratio > 0.4 ? "#7dce7f" : "#d9534f";
  ctx.fillRect(u.x - 12, u.y - u.radius - 8, 24 * ratio, 3);
}

export function drawWorld(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(ensureWorldBiomeLayer(), 0, 0);

  ctx.strokeStyle = "rgba(120,90,50,0.4)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 0.5);
  for (const city of state.cities) {
    ctx.moveTo(W * 0.5, H * 0.5);
    ctx.lineTo(city.x * W, city.y * H);
  }
  ctx.stroke();

  // Home
  const hx = W * 0.5;
  const hy = H * 0.5;
  ctx.fillStyle = "#c9a227";
  ctx.beginPath();
  ctx.arc(hx, hy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f5e6c8";
  ctx.font = "600 13px Cinzel, serif";
  ctx.textAlign = "center";
  ctx.fillText("Holdfast", hx, hy + 32);

  for (const city of state.cities) {
    const x = city.x * W;
    const y = city.y * H;
    const selected = state.selectedCityId === city.id;
    ctx.fillStyle = selected ? "#d4a84b" : "#3a6e8a";
    ctx.beginPath();
    ctx.arc(x, y, selected ? 15 : 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e8d8a8";
    ctx.stroke();
    ctx.fillStyle = "#f5e6c8";
    ctx.font = "12px 'Source Sans 3', sans-serif";
    ctx.fillText(city.name, x, y + 26);
    ctx.fillStyle = "rgba(245,230,200,0.65)";
    ctx.fillText("Trade", x, y + 40);
  }

  for (const site of state.sites) {
    const x = site.x * W;
    const y = site.y * H;
    const unlocked = siteUnlocked(state, site);
    if (site.cleared) ctx.fillStyle = "#5a8f6a";
    else if (!unlocked) ctx.fillStyle = "#555";
    else if (site.kind === "monsters") ctx.fillStyle = "#7b4ea3";
    else if (site.kind === "ruins") ctx.fillStyle = "#8a4a3a";
    else ctx.fillStyle = "#a35a3c";
    ctx.beginPath();
    ctx.arc(x, y, unlocked || site.cleared ? 11 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = site.cleared ? "#a8e0b8" : unlocked ? "#f5e6c8" : "#888";
    ctx.stroke();
    ctx.fillStyle = unlocked || site.cleared ? "#f5e6c8" : "#999";
    ctx.font = "11px 'Source Sans 3', sans-serif";
    const label = site.cleared
      ? `${site.name} (yours)`
      : !unlocked
        ? `${site.name} (locked)`
        : site.name;
    ctx.fillText(label, x, y + 24);
  }
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, W, 36);
  ctx.fillStyle = "#f5e6c8";
  ctx.font = "600 15px Cinzel, serif";
  ctx.fillText("Marches map — blue cities trade · camps for war · rivers & mountains shown", 16, 24);
}

let worldBiomeLayer: HTMLCanvasElement | null = null;

/** Paint rivers/forests/mountains once — the layout never changes at runtime. */
function ensureWorldBiomeLayer(): HTMLCanvasElement {
  if (worldBiomeLayer) return worldBiomeLayer;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#2a3d55");
  sky.addColorStop(0.45, "#3d5a3c");
  sky.addColorStop(1, "#4a6b3a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const layout = getWorldLayout();
  const mapScaleX = W / (GRID_W * TILE);
  const mapScaleY = H / (GRID_H * TILE);
  const step = 4;
  for (let gy = 0; gy < GRID_H; gy += step) {
    for (let gx = 0; gx < GRID_W; gx += step) {
      const b = layout.biomes[gy][gx];
      const px = gx * TILE * mapScaleX;
      const py = gy * TILE * mapScaleY;
      const tw = TILE * step * mapScaleX;
      const th = TILE * step * mapScaleY;
      if (b === "water" || b === "water_shore") {
        ctx.fillStyle = b === "water" ? "rgba(50,110,170,0.55)" : "rgba(70,130,150,0.35)";
        ctx.fillRect(px, py, tw, th);
      } else if (b === "mountain") {
        ctx.fillStyle = "rgba(90,95,100,0.55)";
        ctx.fillRect(px, py, tw, th);
      } else if (b === "rocky") {
        ctx.fillStyle = "rgba(100,110,90,0.3)";
        ctx.fillRect(px, py, tw, th);
      } else if (b === "forest" || b === "deep_forest") {
        ctx.fillStyle = b === "deep_forest" ? "rgba(30,60,35,0.45)" : "rgba(45,80,50,0.3)";
        ctx.fillRect(px, py, tw, th);
      }
    }
  }
  worldBiomeLayer = c;
  return c;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function cellFromPointer(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor(((clientX - rect.left) * scaleX) / CELL);
  const y = Math.floor(((clientY - rect.top) * scaleY) / CELL);
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
  return { x, y };
}

export function worldSiteFromPointer(
  canvas: HTMLCanvasElement,
  state: GameState,
  clientX: number,
  clientY: number,
) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (clientX - rect.left) * scaleX;
  const py = (clientY - rect.top) * scaleY;
  let best: { site: (typeof state.sites)[0]; d: number } | null = null;
  for (const site of state.sites) {
    if (site.cleared) continue;
    const x = site.x * W;
    const y = site.y * H;
    const d = Math.hypot(px - x, py - y);
    if (d < 20 && (!best || d < best.d)) best = { site, d };
  }
  return best?.site ?? null;
}

export function worldCityFromPointer(
  canvas: HTMLCanvasElement,
  state: GameState,
  clientX: number,
  clientY: number,
) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (clientX - rect.left) * scaleX;
  const py = (clientY - rect.top) * scaleY;
  let best: { city: (typeof state.cities)[0]; d: number } | null = null;
  for (const city of state.cities) {
    const x = city.x * W;
    const y = city.y * H;
    const d = Math.hypot(px - x, py - y);
    if (d < 22 && (!best || d < best.d)) best = { city, d };
  }
  return best?.city ?? null;
}
