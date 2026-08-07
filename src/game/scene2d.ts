import { CELL, GRID_H, GRID_W } from "./config";
import { isEnemyVisible } from "./combat";
import { ISO_H, ISO_W, battleToGridFloat, gridFloatToIso, gridToIso, isoToGrid } from "./iso";
import { JOB_LABELS } from "./villagers";
import { getWorldLayout } from "./worldGen";
import {
  buildingSprite,
  constructionSprite,
  fieldSprite,
  ghostSprite,
  terrainSprite,
  treeSprite,
  unitSprite,
  villagerSprite,
  warmSpriteAtlas,
  invalidateSpriteCache,
  preloadArtAssets,
} from "./sprites";
import type { BuildingType, GameState } from "./types";

const CHUNK = 16;

/**
 * Forge of Empires–style 2D isometric village:
 * pre-drawn tile/building pictures, viewport culling, no WebGL meshes.
 */
export class VillageScene {
  readonly selectBoxEl: HTMLDivElement;
  readonly minimapCanvas: HTMLCanvasElement;

  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;

  /** Camera focus in isometric world space */
  private camX = 0;
  private camY = 0;
  private zoom = 1.15;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly keys = new Set<string>();

  private ghostType: BuildingType | null = null;
  private ghostCell: { x: number; y: number } | null = null;
  private fieldGhost: { x: number; y: number } | null = null;

  private terrainChunks = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas;
    this.host = host;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d canvas unsupported");
    this.ctx = ctx;

    this.selectBoxEl = document.createElement("div");
    this.selectBoxEl.className = "select-box hidden";
    host.appendChild(this.selectBoxEl);

    this.minimapCanvas = document.createElement("canvas");
    this.minimapCanvas.className = "battle-minimap hidden";
    this.minimapCanvas.width = 150;
    this.minimapCanvas.height = 105;
    host.appendChild(this.minimapCanvas);

    warmSpriteAtlas();
    this.centerOnKeep();
    this.bindInput();
    this.resize();
    void preloadArtAssets().then(() => {
      invalidateSpriteCache();
      this.terrainChunks.clear();
      warmSpriteAtlas();
    });
  }

  private getTerrainChunk(cx: number, cy: number): HTMLCanvasElement | null {
    if (cx < 0 || cy < 0) return null;
    const chunksX = Math.ceil(GRID_W / CHUNK);
    const chunksY = Math.ceil(GRID_H / CHUNK);
    if (cx >= chunksX || cy >= chunksY) return null;
    const key = this.chunkKey(cx, cy);
    const hit = this.terrainChunks.get(key);
    if (hit) return hit;
    return this.buildOneChunk(cx, cy);
  }

  private buildOneChunk(cx: number, cy: number): HTMLCanvasElement {
    const layout = getWorldLayout();
    const key = this.chunkKey(cx, cy);
    const corners = [
      gridToIso(cx * CHUNK, cy * CHUNK),
      gridToIso(Math.min(GRID_W, (cx + 1) * CHUNK), cy * CHUNK),
      gridToIso(cx * CHUNK, Math.min(GRID_H, (cy + 1) * CHUNK)),
      gridToIso(Math.min(GRID_W, (cx + 1) * CHUNK), Math.min(GRID_H, (cy + 1) * CHUNK)),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of corners) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    minX -= ISO_W;
    minY -= ISO_H;
    maxX += ISO_W;
    maxY += ISO_H + 24;

    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(maxX - minX));
    c.height = Math.max(1, Math.ceil(maxY - minY));
    const ctx = c.getContext("2d")!;

    for (let gy = cy * CHUNK; gy < Math.min(GRID_H, (cy + 1) * CHUNK); gy++) {
      for (let gx = cx * CHUNK; gx < Math.min(GRID_W, (cx + 1) * CHUNK); gx++) {
        const biome = layout.biomes[gy][gx];
        const iso = gridToIso(gx, gy);
        const spr = terrainSprite(biome);
        ctx.drawImage(spr, iso.x - minX - spr.width / 2, iso.y - minY - spr.height / 2);
        if (biome === "forest" || biome === "deep_forest") {
          if ((gx + gy * 3) % 2 === 0) {
            const tree = treeSprite(biome === "deep_forest");
            ctx.drawImage(tree, iso.x - minX - tree.width / 2, iso.y - minY - tree.height + 8);
          }
        }
      }
    }

    (c as HTMLCanvasElement & { _ox: number; _oy: number })._ox = minX;
    (c as HTMLCanvasElement & { _ox: number; _oy: number })._oy = minY;
    this.terrainChunks.set(key, c);
    return c;
  }

  private centerOnKeep(): void {
    const layout = getWorldLayout();
    const p = gridToIso(layout.centerGx, layout.centerGy);
    this.camX = p.x;
    this.camY = p.y;
  }

  private chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private panScale(): number {
    return 1.1 / this.zoom;
  }

  private bindInput(): void {
    this.canvas.addEventListener("pointerdown", (e) => {
      // FoE-style pan: right-drag, middle-drag, or Alt+left-drag
      if (e.button === 2 || e.button === 1 || (e.button === 0 && e.altKey)) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.canvas.setPointerCapture?.(e.pointerId);
      }
    });
    window.addEventListener("pointerup", () => {
      this.dragging = false;
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      const s = this.panScale();
      this.camX -= dx * s;
      this.camY -= dy * s;
      this.clampCam();
    });
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.12;
        this.zoom = Math.min(2.2, Math.max(0.35, this.zoom * factor));
      },
      { passive: false },
    );
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        this.keys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private clampCam(): void {
    const a = gridToIso(0, 0);
    const b = gridToIso(GRID_W - 1, GRID_H - 1);
    const c = gridToIso(GRID_W - 1, 0);
    const d = gridToIso(0, GRID_H - 1);
    const minX = Math.min(a.x, b.x, c.x, d.x) - 200;
    const maxX = Math.max(a.x, b.x, c.x, d.x) + 200;
    const minY = Math.min(a.y, b.y, c.y, d.y) - 200;
    const maxY = Math.max(a.y, b.y, c.y, d.y) + 200;
    this.camX = Math.min(maxX, Math.max(minX, this.camX));
    this.camY = Math.min(maxY, Math.max(minY, this.camY));
  }

  private tickCamera(dt: number, allowWasd: boolean): void {
    if (!allowWasd || !this.keys.size) return;
    const speed = 420 * dt * this.panScale();
    if (this.keys.has("w") || this.keys.has("arrowup")) this.camY -= speed;
    if (this.keys.has("s") || this.keys.has("arrowdown")) this.camY += speed;
    if (this.keys.has("a") || this.keys.has("arrowleft")) this.camX -= speed;
    if (this.keys.has("d") || this.keys.has("arrowright")) this.camX += speed;
    this.clampCam();
  }

  /** Iso world → screen pixels */
  private toScreen(ix: number, iy: number): { x: number; y: number } {
    return {
      x: (ix - this.camX) * this.zoom + this.w / 2,
      y: (iy - this.camY) * this.zoom + this.h / 2,
    };
  }

  /** Screen → iso world */
  private toIso(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.w / 2) / this.zoom + this.camX,
      y: (sy - this.h / 2) / this.zoom + this.camY,
    };
  }

  private onScreen(sx: number, sy: number, pad = 80): boolean {
    return sx > -pad && sy > -pad && sx < this.w + pad && sy < this.h + pad;
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  pickCell(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const iso = this.toIso(sx, sy);
    const g = isoToGrid(iso.x, iso.y);
    const x = Math.round(g.x);
    const y = Math.round(g.y);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return { x, y };
  }

  pickVillager(clientX: number, clientY: number): string | null {
    // Resolved in render via last frame positions — use hit test against state in main? 
    // Store last villager screen positions
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    let best: { id: string; d: number } | null = null;
    for (const p of this.lastVillagerHits) {
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < 18 && (!best || d < best.d)) best = { id: p.id, d };
    }
    return best?.id ?? null;
  }

  pickBuilding(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    let best: { id: string; d: number } | null = null;
    for (const p of this.lastBuildingHits) {
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < 28 && (!best || d < best.d)) best = { id: p.id, d };
    }
    return best?.id ?? null;
  }

  pickBattle(
    clientX: number,
    clientY: number,
    state: GameState,
  ): { kind: "unit"; id: string } | { kind: "ground"; x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    let best: { id: string; d: number } | null = null;
    for (const p of this.lastUnitHits) {
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < 20 && (!best || d < best.d)) best = { id: p.id, d };
    }
    if (best) return { kind: "unit", id: best.id };
    const cell = this.pickCell(clientX, clientY);
    if (!cell || !state.battle) return null;
    return {
      kind: "ground",
      x: cell.x * CELL + CELL / 2,
      y: cell.y * CELL + CELL / 2,
    };
  }

  private lastVillagerHits: { id: string; x: number; y: number }[] = [];
  private lastBuildingHits: { id: string; x: number; y: number }[] = [];
  private lastUnitHits: { id: string; x: number; y: number }[] = [];

  setGhost(type: BuildingType | null, cell: { x: number; y: number } | null, _rotation = 0): void {
    this.ghostType = type;
    this.ghostCell = cell;
  }

  setFieldGhost(cell: { x: number; y: number } | null): void {
    this.fieldGhost = cell;
  }

  showSelectBox(x0: number, y0: number, x1: number, y1: number): void {
    const rect = this.host.getBoundingClientRect();
    const left = Math.min(x0, x1) - rect.left;
    const top = Math.min(y0, y1) - rect.top;
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    this.selectBoxEl.classList.remove("hidden");
    this.selectBoxEl.style.left = `${left}px`;
    this.selectBoxEl.style.top = `${top}px`;
    this.selectBoxEl.style.width = `${w}px`;
    this.selectBoxEl.style.height = `${h}px`;
  }

  hideSelectBox(): void {
    this.selectBoxEl.classList.add("hidden");
  }

  unitsInScreenRect(state: GameState, x0: number, y0: number, x1: number, y2: number): string[] {
    const rect = this.host.getBoundingClientRect();
    const left = Math.min(x0, x1) - rect.left;
    const right = Math.max(x0, x1) - rect.left;
    const top = Math.min(y0, y2) - rect.top;
    const bottom = Math.max(y0, y2) - rect.top;
    const ids: string[] = [];
    for (const p of this.lastUnitHits) {
      if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) ids.push(p.id);
    }
    // Prefer player units from battle selection helper — filter side in main via selectBattleUnits
    if (state.battle) {
      return ids.filter((id) => {
        const u = state.battle!.units.find((x) => x.id === id);
        return u && u.side === "player" && u.hp > 0;
      });
    }
    return ids;
  }

  resetBattleOverlay(): void {
    this.minimapCanvas.classList.add("hidden");
    this.hideSelectBox();
  }

  render(state: GameState, dt: number): void {
    this.tickCamera(dt, state.mode === "village" || state.mode === "battle");

    const ctx = this.ctx;
    // FoE-like sky wash behind the map
    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    sky.addColorStop(0, "#7eb6e0");
    sky.addColorStop(0.45, "#9bc4a0");
    sky.addColorStop(1, "#5a8a58");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawTerrain();
    this.drawFields(state);
    this.drawBuildings(state);
    this.drawSites(state);
    this.drawVillagers(state);
    this.drawBattle(state);
    this.drawGhost();
    this.drawHudLabels(state);

    if (state.mode === "battle") {
      this.minimapCanvas.classList.remove("hidden");
      this.drawMinimap(state);
    } else {
      this.minimapCanvas.classList.add("hidden");
    }
  }

  private drawTerrain(): void {
    const pad = 120;
    const tl = this.toIso(-pad, -pad);
    const br = this.toIso(this.w + pad, this.h + pad);
    const g0 = isoToGrid(tl.x, tl.y);
    const g1 = isoToGrid(br.x, br.y);
    // Expand range for iso skew
    const minGx = Math.max(0, Math.floor(Math.min(g0.x, g1.x) - 8));
    const maxGx = Math.min(GRID_W - 1, Math.ceil(Math.max(g0.x, g1.x) + 8));
    const minGy = Math.max(0, Math.floor(Math.min(g0.y, g1.y) - 8));
    const maxGy = Math.min(GRID_H - 1, Math.ceil(Math.max(g0.y, g1.y) + 8));

    const cx0 = Math.floor(minGx / CHUNK);
    const cx1 = Math.floor(maxGx / CHUNK);
    const cy0 = Math.floor(minGy / CHUNK);
    const cy1 = Math.floor(maxGy / CHUNK);

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.getTerrainChunk(cx, cy);
        if (!chunk) continue;
        const ox = (chunk as HTMLCanvasElement & { _ox?: number })._ox ?? 0;
        const oy = (chunk as HTMLCanvasElement & { _oy?: number })._oy ?? 0;
        const s = this.toScreen(ox, oy);
        this.ctx.drawImage(
          chunk,
          s.x,
          s.y,
          chunk.width * this.zoom,
          chunk.height * this.zoom,
        );
      }
    }
  }

  private drawFields(state: GameState): void {
    const spr = fieldSprite();
    for (const b of state.buildings) {
      if (b.type !== "farm" || !b.fields) continue;
      for (const f of b.fields) {
        const iso = gridToIso(f.x, f.y);
        const s = this.toScreen(iso.x, iso.y);
        if (!this.onScreen(s.x, s.y)) continue;
        this.ctx.drawImage(
          spr,
          s.x - (spr.width * this.zoom) / 2,
          s.y - (spr.height * this.zoom) / 2,
          spr.width * this.zoom,
          spr.height * this.zoom,
        );
      }
    }
  }

  private drawBuildings(state: GameState): void {
    this.lastBuildingHits = [];
    // Painter's algorithm: far (low gx+gy) first
    const list = state.buildings
      .filter((b) => b.type !== "road" || true)
      .slice()
      .sort((a, b) => a.x + a.y - (b.x + b.y));

    for (const b of list) {
      const iso = gridToIso(b.x, b.y);
      if (b.type === "bridge" && b.span?.length) {
        const ax = b.span.reduce((n, c) => n + c.x, 0) / b.span.length;
        const ay = b.span.reduce((n, c) => n + c.y, 0) / b.span.length;
        const p = gridToIso(ax, ay);
        iso.x = p.x;
        iso.y = p.y;
      }
      const s = this.toScreen(iso.x, iso.y);
      if (!this.onScreen(s.x, s.y, 100)) continue;

      const spr = buildingSprite(b.type, b.level);
      const dw = spr.width * this.zoom * 1.05;
      const dh = spr.height * this.zoom * 1.05;
      this.ctx.drawImage(spr, s.x - dw / 2, s.y - dh + ISO_H * 0.28 * this.zoom, dw, dh);

      if (b.type !== "road") {
        this.lastBuildingHits.push({ id: b.id, x: s.x, y: s.y - dh * 0.4 });
      }

      if (state.selectedBuildingId === b.id && b.type !== "road") {
        this.ctx.strokeStyle = "#d4af37";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.ellipse(s.x, s.y, 18 * this.zoom, 9 * this.zoom, 0, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  private drawSites(state: GameState): void {
    for (const site of state.constructionSites) {
      const iso = gridToIso(site.x, site.y);
      const s = this.toScreen(iso.x, iso.y);
      if (!this.onScreen(s.x, s.y)) continue;
      const spr = constructionSprite(site.type, site.progress);
      const dw = spr.width * this.zoom;
      const dh = spr.height * this.zoom;
      this.ctx.drawImage(spr, s.x - dw / 2, s.y - dh + ISO_H * 0.35 * this.zoom, dw, dh);
    }
  }

  private drawVillagers(state: GameState): void {
    this.lastVillagerHits = [];
    if (state.mode !== "village") return;
    const sorted = state.villagers.slice().sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const v of sorted) {
      const iso = gridFloatToIso(v.x, v.y);
      const s = this.toScreen(iso.x, iso.y);
      if (!this.onScreen(s.x, s.y)) continue;
      const selected = state.selectedVillagerId === v.id;
      const spr = villagerSprite(v.job, selected);
      const bob = Math.sin(v.anim) * 2;
      const dw = spr.width * this.zoom;
      const dh = spr.height * this.zoom;
      this.ctx.drawImage(spr, s.x - dw / 2, s.y - dh + bob * this.zoom, dw, dh);
      this.lastVillagerHits.push({ id: v.id, x: s.x, y: s.y - dh * 0.5 });

      if (selected || v.phase === "work" || v.phase === "build") {
        this.ctx.fillStyle = "#f5e6c8";
        this.ctx.font = `${11 * Math.min(1.2, this.zoom)}px 'Source Sans 3', sans-serif`;
        this.ctx.textAlign = "center";
        const label = selected
          ? `${v.name} · ${JOB_LABELS[v.job]}`
          : v.phase === "build"
            ? "Building…"
            : JOB_LABELS[v.job];
        this.ctx.fillText(label, s.x, s.y - dh - 2);
      }
    }
  }

  private drawBattle(state: GameState): void {
    this.lastUnitHits = [];
    if (state.mode !== "battle" || !state.battle) return;
    const battle = state.battle;
    const selected = new Set(battle.selectedIds);

    const units = battle.units
      .filter((u) => u.hp > 0)
      .slice()
      .sort((a, b) => a.x + a.y - (b.x + b.y));

    for (const u of units) {
      if (u.side === "enemy" && !isEnemyVisible(battle, u.id)) continue;
      const g = battleToGridFloat(u.x, u.y, CELL);
      const iso = gridFloatToIso(g.x, g.y);
      const s = this.toScreen(iso.x, iso.y);
      if (!this.onScreen(s.x, s.y)) continue;

      if (u.kind === "keep" || u.kind === "tower") {
        // Keep/tower already drawn as buildings; just HP bar
        const ratio = Math.max(0, u.hp / u.maxHp);
        this.ctx.fillStyle = "rgba(0,0,0,0.5)";
        this.ctx.fillRect(s.x - 20, s.y - 50 * this.zoom, 40, 5);
        this.ctx.fillStyle = ratio > 0.35 ? "#6fbf73" : "#e55";
        this.ctx.fillRect(s.x - 20, s.y - 50 * this.zoom, 40 * ratio, 5);
        continue;
      }

      const spr = unitSprite(u.kind, u.side, selected.has(u.id));
      const dw = spr.width * this.zoom;
      const dh = spr.height * this.zoom;
      this.ctx.drawImage(spr, s.x - dw / 2, s.y - dh, dw, dh);
      this.lastUnitHits.push({ id: u.id, x: s.x, y: s.y - dh * 0.5 });

      const ratio = Math.max(0, u.hp / u.maxHp);
      this.ctx.fillStyle = "rgba(0,0,0,0.5)";
      this.ctx.fillRect(s.x - 12, s.y - dh - 6, 24, 3);
      this.ctx.fillStyle = ratio > 0.4 ? "#7dce7f" : "#d9534f";
      this.ctx.fillRect(s.x - 12, s.y - dh - 6, 24 * ratio, 3);
    }

    // Order marker
    if (battle.selectedIds.length) {
      const u = battle.units.find((x) => x.id === battle.selectedIds[0]);
      if (u?.orderX != null && u.orderY != null) {
        const g = battleToGridFloat(u.orderX, u.orderY, CELL);
        const iso = gridFloatToIso(g.x, g.y);
        const s = this.toScreen(iso.x, iso.y);
        this.ctx.strokeStyle = "#6fef7a";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.ellipse(s.x, s.y, 10 * this.zoom, 5 * this.zoom, 0, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  private drawGhost(): void {
    if (this.fieldGhost) {
      const iso = gridToIso(this.fieldGhost.x, this.fieldGhost.y);
      const s = this.toScreen(iso.x, iso.y);
      const spr = fieldSprite();
      this.ctx.globalAlpha = 0.55;
      this.ctx.drawImage(
        spr,
        s.x - (spr.width * this.zoom) / 2,
        s.y - (spr.height * this.zoom) / 2,
        spr.width * this.zoom,
        spr.height * this.zoom,
      );
      this.ctx.globalAlpha = 1;
    }
    if (this.ghostType && this.ghostCell) {
      const iso = gridToIso(this.ghostCell.x, this.ghostCell.y);
      const s = this.toScreen(iso.x, iso.y);
      const spr = ghostSprite(this.ghostType);
      const dw = spr.width * this.zoom;
      const dh = spr.height * this.zoom;
      this.ctx.drawImage(spr, s.x - dw / 2, s.y - dh + ISO_H * 0.35 * this.zoom, dw, dh);
    }
  }

  private drawHudLabels(state: GameState): void {
    if (state.mode === "battle" && state.battle) {
      this.ctx.fillStyle = "#f5e6c8";
      this.ctx.font = "600 14px Cinzel, serif";
      this.ctx.textAlign = "left";
      this.ctx.fillText(state.battle.waveLabel, 12, 22);
      if (state.paused) {
        this.ctx.fillStyle = "#d4af37";
        this.ctx.fillText("PAUSED", this.w - 100, 22);
      }
    }
  }

  private drawMinimap(state: GameState): void {
    const m = this.minimapCanvas;
    const ctx = m.getContext("2d");
    if (!ctx || !state.battle) return;
    ctx.fillStyle = "#1a2820";
    ctx.fillRect(0, 0, m.width, m.height);
    const sx = m.width / (GRID_W * CELL);
    const sy = m.height / (GRID_H * CELL);
    for (const u of state.battle.units) {
      if (u.hp <= 0) continue;
      if (u.side === "enemy" && !isEnemyVisible(state.battle, u.id)) continue;
      ctx.fillStyle = u.side === "player" ? "#6fbf73" : "#c45c5c";
      ctx.fillRect(u.x * sx - 1, u.y * sy - 1, 3, 3);
    }
  }
}
