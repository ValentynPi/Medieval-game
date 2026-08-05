import { BATTLE_H, BATTLE_W, CELL, GRID_H, GRID_W } from "./config";
import type { BattleState, BattleUnit, FormationType, GameState, TroopCounts, TroopType, TroopVariant } from "./types";
import { cellBiome, cellBiomeState, getWorldLayout, isWaterBiome } from "./worldGen";
import { barracksLevel, hasBoatAt, hasBridgeAt } from "./state";

/** Same cells drawn as blue river tiles in the 3D scene */
let waterCellKeys: Set<number> | null = null;
function riverCellKeys(): Set<number> {
  if (!waterCellKeys) {
    waterCellKeys = new Set();
    for (const c of getWorldLayout().waterCells) {
      waterCellKeys.add(c.gy * GRID_W + c.gx);
    }
  }
  return waterCellKeys;
}

export interface TerrainMods {
  speedMult: number;
  rangeMult: number;
  label: string;
}

export function battleToGrid(x: number, y: number): { gx: number; gy: number } {
  return {
    gx: Math.max(0, Math.min(GRID_W - 1, Math.floor(x / CELL))),
    gy: Math.max(0, Math.min(GRID_H - 1, Math.floor(y / CELL))),
  };
}

/** Deep river/lake channel grid cell. */
export function isDeepWaterCell(gx: number, gy: number, state?: GameState): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  if (!state) return cellBiome(gx, gy) === "water";
  return cellBiomeState(state, gx, gy) === "water";
}

export function isDeepWaterAt(x: number, y: number, state?: GameState): boolean {
  const { gx, gy } = battleToGrid(x, y);
  return isDeepWaterCell(gx, gy, state);
}

/**
 * True on any blue river/lake tile (channel + banks) from world gen.
 * Troops may only stand here on a Bridge or Boat deck.
 */
export function isWaterAt(x: number, y: number, state?: GameState): boolean {
  const { gx, gy } = battleToGrid(x, y);
  return isRiverGridCell(gx, gy, state);
}

export function isRiverGridCell(gx: number, gy: number, state?: GameState): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  if (riverCellKeys().has(gy * GRID_W + gx)) return true;
  const biome = state
    ? cellBiomeState(state, gx, gy)
    : cellBiome(gx, gy);
  return biome === "water" || biome === "water_shore";
}

/** Any blue tile needs Bridge / Boat — banks look like water and are not for marching. */
export function canEnterWaterCell(
  state: GameState,
  gx: number,
  gy: number,
  _unit?: BattleUnit,
): boolean {
  if (!isRiverGridCell(gx, gy, state)) return true;
  if (hasBridgeAt(state, gx, gy)) return true;
  if (hasBoatAt(state, gx, gy)) return true;
  return false;
}

export function isTroopWalkableAt(
  state: GameState,
  x: number,
  y: number,
  unit?: BattleUnit,
): boolean {
  const { gx, gy } = battleToGrid(x, y);
  return canEnterWaterCell(state, gx, gy, unit ?? ({ side: "player" } as BattleUnit));
}

/** Snap onto land or a Bridge/Boat deck — never open blue water. */
export function nearestDryBattlePos(
  state: GameState,
  x: number,
  y: number,
  maxR = 10,
): { x: number; y: number } | null {
  const { gx, gy } = battleToGrid(x, y);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const cx = gx + dx;
        const cy = gy + dy;
        if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) continue;
        if (isRiverGridCell(cx, cy, state)) {
          if (!hasBridgeAt(state, cx, cy) && !hasBoatAt(state, cx, cy)) continue;
        }
        return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
      }
    }
  }
  return null;
}

/**
 * Best Bridge/Boat deck to walk via when a straight path hits the river.
 * Prefers the deck cell on the route from the unit toward the goal (so they cross).
 */
export function nearestCrossingToward(
  state: GameState,
  fromX: number,
  fromY: number,
  towardX: number,
  towardY: number,
  maxVia = 1600,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestVia = maxVia;
  for (const b of state.buildings) {
    if (b.type !== "bridge" && b.type !== "boat") continue;
    const cells =
      b.type === "bridge" && b.span?.length ? b.span : [{ x: b.x, y: b.y }];
    for (const c of cells) {
      const bx = c.x * CELL + CELL / 2;
      const by = c.y * CELL + CELL / 2;
      const via = Math.hypot(bx - fromX, by - fromY) + Math.hypot(towardX - bx, towardY - by);
      if (via < bestVia) {
        bestVia = via;
        best = { x: bx, y: by };
      }
    }
  }
  return best;
}

export function isTroopCellWalkable(state: GameState, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  return canEnterWaterCell(state, gx, gy);
}

type TroopPathNode = { x: number; y: number; g: number; f: number; px: number; py: number };

/**
 * A* for battle troops: land + Bridge/Boat only (no open blue tiles).
 * Returns battle-coord waypoints along cell centers.
 */
export function findTroopPath(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number }[] | null {
  const start = nearestDryBattlePos(state, fromX, fromY, 16);
  const goal = nearestDryBattlePos(state, toX, toY, 16);
  if (!start || !goal) return null;

  const sx = Math.floor(start.x / CELL);
  const sy = Math.floor(start.y / CELL);
  const gx = Math.floor(goal.x / CELL);
  const gy = Math.floor(goal.y / CELL);
  if (sx === gx && sy === gy) {
    return [{ x: goal.x, y: goal.y }];
  }

  const key = (x: number, y: number) => y * GRID_W + x;
  const open: TroopPathNode[] = [];
  const came = new Map<number, TroopPathNode>();
  const gScore = new Map<number, number>();
  const startNode: TroopPathNode = {
    x: sx,
    y: sy,
    g: 0,
    f: Math.hypot(gx - sx, gy - sy),
    px: sx,
    py: sy,
  };
  open.push(startNode);
  gScore.set(key(sx, sy), 0);
  came.set(key(sx, sy), startNode);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  let steps = 0;
  const MAX_STEPS = 10000;
  while (open.length && steps < MAX_STEPS) {
    steps++;
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestI].f) bestI = i;
    }
    const cur = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();

    if (cur.x === gx && cur.y === gy) {
      const cells: { x: number; y: number }[] = [];
      let n: TroopPathNode | undefined = cur;
      const seen = new Set<number>();
      while (n) {
        const k = key(n.x, n.y);
        if (seen.has(k)) break;
        seen.add(k);
        cells.push({ x: n.x, y: n.y });
        if (n.x === sx && n.y === sy) break;
        n = came.get(key(n.px, n.py));
      }
      cells.reverse();
      const simplified = simplifyTroopPath(state, cells);
      return simplified.map((c, i) => {
        const last = i === simplified.length - 1;
        return {
          x: last ? goal.x : c.x * CELL + CELL / 2,
          y: last ? goal.y : c.y * CELL + CELL / 2,
        };
      });
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isTroopCellWalkable(state, nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (!isTroopCellWalkable(state, cur.x + dx, cur.y) || !isTroopCellWalkable(state, cur.x, cur.y + dy)) {
          continue;
        }
      }
      const onBridge = hasBridgeAt(state, nx, ny) || hasBoatAt(state, nx, ny);
      const stepCost = (dx !== 0 && dy !== 0 ? 1.414 : 1) * (onBridge ? 0.55 : 1);
      const tentative = cur.g + stepCost;
      const nk = key(nx, ny);
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      gScore.set(nk, tentative);
      const node: TroopPathNode = {
        x: nx,
        y: ny,
        g: tentative,
        f: tentative + Math.hypot(gx - nx, gy - ny),
        px: cur.x,
        py: cur.y,
      };
      came.set(nk, node);
      open.push(node);
    }
  }
  return null;
}

function simplifyTroopPath(
  state: GameState,
  cells: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (cells.length <= 2) return cells;
  const out: { x: number; y: number }[] = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = cells[i];
    const next = cells[i + 1];
    const onDeck = hasBridgeAt(state, cur.x, cur.y) || hasBoatAt(state, cur.x, cur.y);
    const ax = cur.x - prev.x;
    const ay = cur.y - prev.y;
    const bx = next.x - cur.x;
    const by = next.y - cur.y;
    if (onDeck || ax * by !== ay * bx) out.push(cur);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

/** Assign a bridge-aware march path; falls back to a direct point if already clear. */
export function setTroopMarch(
  state: GameState,
  u: BattleUnit,
  toX: number,
  toY: number,
): boolean {
  const path = findTroopPath(state, u.x, u.y, toX, toY);
  if (path && path.length) {
    u.path = path;
    u.pathI = 0;
    return true;
  }
  // Same bank / short hop with clear line
  if (isTroopWalkableAt(state, toX, toY, u)) {
    u.path = [{ x: toX, y: toY }];
    u.pathI = 0;
    return true;
  }
  u.path = [];
  u.pathI = 0;
  return false;
}

export function terrainAtBattle(x: number, y: number, state?: GameState): TerrainMods {
  const { gx, gy } = battleToGrid(x, y);
  const biome = state
    ? cellBiomeState(state, gx, gy)
    : cellBiome(gx, gy);
  if (state && isWaterBiome(biome)) {
    if (hasBridgeAt(state, gx, gy)) return { speedMult: 1.05, rangeMult: 1, label: "Bridge" };
    if (hasBoatAt(state, gx, gy)) return { speedMult: 0.9, rangeMult: 1, label: "Boat dock" };
  }
  switch (biome) {
    case "forest":
      return { speedMult: 0.82, rangeMult: 0.92, label: "Forest" };
    case "deep_forest":
      return { speedMult: 0.62, rangeMult: 0.88, label: "Deep woods" };
    case "rocky":
      return { speedMult: 0.92, rangeMult: 1.18, label: "High ground" };
    case "mountain":
      return { speedMult: 0.55, rangeMult: 1.22, label: "Mountain" };
    case "water":
      return { speedMult: 0.85, rangeMult: 0.9, label: "River" };
    case "water_shore":
      return { speedMult: 0.9, rangeMult: 1, label: "Shore" };
    case "path":
      return { speedMult: 1.12, rangeMult: 1, label: "Road" };
    default:
      return { speedMult: 1, rangeMult: 1, label: "Meadow" };
  }
}

export function isBlockedTerrain(
  x: number,
  y: number,
  state?: GameState,
  unit?: BattleUnit,
): boolean {
  const { gx, gy } = battleToGrid(x, y);
  if (!isRiverGridCell(gx, gy, state)) return false;
  if (!state) return true;
  if (unit) return !canEnterWaterCell(state, gx, gy, unit);
  return !(hasBridgeAt(state, gx, gy) || hasBoatAt(state, gx, gy));
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function flankingMultiplier(attacker: BattleUnit, defender: BattleUnit): number {
  if (defender.kind === "keep" || defender.kind === "tower" || defender.speed === 0) return 1;
  if (defender.facing == null) return 1;
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  if (Math.hypot(dx, dy) < 1) return 1;
  const attackAngle = Math.atan2(dy, dx);
  let diff = Math.abs(normalizeAngle(attackAngle - defender.facing));
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  if (diff < Math.PI / 6) return 0.88;
  if (diff < (Math.PI * 2) / 3) return 1.2;
  return 1.5;
}

export function formationSlots(
  formation: FormationType,
  count: number,
  cx: number,
  cy: number,
  facing: number,
): { x: number; y: number }[] {
  const spacing = 44;
  const slots: { x: number; y: number }[] = [];

  for (let i = 0; i < count; i++) {
    let lx = 0;
    let ly = 0;
    switch (formation) {
      case "line": {
        const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
        const row = Math.floor(i / cols);
        const col = i % cols;
        lx = (col - (cols - 1) / 2) * spacing;
        ly = row * spacing * 0.55;
        break;
      }
      case "wedge": {
        const row = Math.floor((-1 + Math.sqrt(1 + 8 * i)) / 2);
        const col = i - (row * (row + 1)) / 2;
        lx = (col - row / 2) * spacing * 0.9;
        ly = row * spacing * 0.65;
        break;
      }
      case "block": {
        const cols = Math.max(2, Math.ceil(Math.sqrt(count)));
        const row = Math.floor(i / cols);
        const col = i % cols;
        lx = (col - (cols - 1) / 2) * spacing * 0.85;
        ly = (row - Math.floor(count / cols) / 2) * spacing * 0.85;
        break;
      }
      case "circle": {
        const angle = (i / Math.max(1, count)) * Math.PI * 2;
        const ring = spacing * (0.75 + Math.floor(i / 8) * 0.35);
        lx = Math.cos(angle) * ring;
        ly = Math.sin(angle) * ring;
        break;
      }
    }
    const rx = cx + lx * Math.cos(facing) - ly * Math.sin(facing);
    const ry = cy + lx * Math.sin(facing) + ly * Math.cos(facing);
    slots.push({
      x: Math.max(24, Math.min(BATTLE_W - 24, rx)),
      y: Math.max(24, Math.min(BATTLE_H - 24, ry)),
    });
  }
  return slots;
}

export function computeScoutRadius(state: GameState): number {
  let radius = 260;
  for (const b of state.buildings) {
    if (b.type === "tower") radius += 35 + b.level * 18;
    if (b.type === "keep") radius += 40 + b.level * 12;
  }
  return radius;
}

export function refreshFogOfWar(state: GameState): void {
  const battle = state.battle;
  if (!battle) return;
  const scouts: { x: number; y: number; r: number }[] = [];

  for (const u of battle.units) {
    if (u.hp <= 0 || u.side !== "player") continue;
    if (u.kind === "keep") scouts.push({ x: u.x, y: u.y, r: battle.scoutRadius * 0.85 });
    else if (u.kind === "tower" && u.atk > 0) scouts.push({ x: u.x, y: u.y, r: 180 });
    else if (u.speed > 0 && !u.routing) scouts.push({ x: u.x, y: u.y, r: 120 + (u.troopType === "archers" ? 40 : 0) });
  }

  const visible = new Set<string>();
  for (const u of battle.units) {
    if (u.side !== "enemy" || u.hp <= 0) continue;
    for (const s of scouts) {
      if (Math.hypot(u.x - s.x, u.y - s.y) <= s.r) {
        visible.add(u.id);
        break;
      }
    }
  }
  battle.visibleEnemyIds = [...visible];
}

export function isEnemyVisible(battle: BattleState, enemyId: string): boolean {
  return battle.visibleEnemyIds.includes(enemyId);
}

export function troopVariantForLevel(type: TroopType, level: number): TroopVariant {
  if (type === "infantry") {
    if (level >= 4) return "pikemen";
    if (level >= 2) return "spearmen";
    return "levy";
  }
  if (type === "archers") {
    if (level >= 5) return "crossbow";
    if (level >= 3) return "longbow";
    return "shortbow";
  }
  if (level >= 4) return "heavy_cav";
  return "light_cav";
}

export function troopVariant(type: TroopType, state: GameState): TroopVariant {
  return troopVariantForLevel(type, barracksLevel(state));
}

export function variantUnlockedAt(type: TroopType, level: number): string | null {
  if (type === "infantry") {
    if (level === 2) return "Spearmen";
    if (level === 4) return "Pikemen";
  }
  if (type === "archers") {
    if (level === 3) return "Longbowmen";
    if (level === 5) return "Crossbowmen";
  }
  if (type === "cavalry" && level === 4) return "Heavy cavalry";
  return null;
}

export function nextVariantUnlock(type: TroopType, level: number): string | null {
  if (type === "infantry") {
    if (level < 2) return "Lv 2 → Spearmen";
    if (level < 4) return "Lv 4 → Pikemen";
    return null;
  }
  if (type === "archers") {
    if (level < 3) return "Lv 3 → Longbowmen";
    if (level < 5) return "Lv 5 → Crossbowmen";
    return null;
  }
  if (level < 4) return "Lv 4 → Heavy cavalry";
  return null;
}

export function variantModifiers(variant: TroopVariant): {
  hpMult: number;
  atkMult: number;
  rangeMult: number;
  speedMult: number;
} {
  switch (variant) {
    case "spearmen":
      return { hpMult: 1.12, atkMult: 1.05, rangeMult: 1, speedMult: 0.98 };
    case "pikemen":
      return { hpMult: 1.25, atkMult: 1.1, rangeMult: 1.05, speedMult: 0.92 };
    case "longbow":
      return { hpMult: 0.95, atkMult: 1.05, rangeMult: 1.2, speedMult: 0.95 };
    case "crossbow":
      return { hpMult: 1, atkMult: 1.18, rangeMult: 1.05, speedMult: 0.9 };
    case "heavy_cav":
      return { hpMult: 1.2, atkMult: 1.15, rangeMult: 1, speedMult: 0.92 };
    default:
      return { hpMult: 1, atkMult: 1, rangeMult: 1, speedMult: 1 };
  }
}

export function variantLabel(variant: TroopVariant): string {
  return variant.replace("_", " ");
}

export function applyMoraleHit(unit: BattleUnit, dmg: number): void {
  if (unit.morale == null) return;
  unit.morale = Math.max(0, unit.morale - (dmg / unit.maxHp) * 22);
}

export function tickMoraleAndFatigue(units: BattleUnit[], dt: number, keepDamaged: boolean): void {
  for (const u of units) {
    if (u.hp <= 0 || u.morale == null) continue;
    if (u.side === "player" && keepDamaged) u.morale = Math.max(0, u.morale - dt * 4);

    if (u.fatigue != null) {
      const active = u.order !== "hold" && u.speed > 0;
      u.fatigue = Math.max(0, Math.min(120, u.fatigue + (active ? dt * 0.9 : -dt * 0.35)));
    }

    if (u.morale < 12 && u.side === "player" && u.speed > 0 && u.kind !== "hero") {
      u.routing = true;
      u.order = "move";
    } else if (u.morale > 35 && u.routing) {
      u.routing = false;
    }

    if (u.morale > 0 && u.morale < 100 && !u.routing) {
      u.morale = Math.min(100, u.morale + dt * 1.5);
    }
  }
}

export function moraleCombatMult(unit: BattleUnit): number {
  if (unit.morale == null) return 1;
  if (unit.routing) return 0.55;
  if (unit.morale < 30) return 0.78;
  if (unit.morale < 55) return 0.9;
  return 1;
}

export function fatigueSpeedMult(unit: BattleUnit): number {
  if (unit.fatigue == null) return 1;
  return Math.max(0.55, 1 - unit.fatigue / 140);
}

export function terrainSpeedMult(unit: BattleUnit, terrain: TerrainMods): number {
  let mult = terrain.speedMult;
  if (unit.troopType === "cavalry" && terrain.label === "Deep woods") mult *= 0.75;
  if (unit.troopType === "cavalry" && terrain.label === "Forest") mult *= 0.88;
  // (water blocking handled in movement — cavalry no longer wades rivers)
  return mult;
}

export function heroAuraMult(hero: BattleUnit | undefined, unit: BattleUnit): number {
  if (!hero || hero.hp <= 0) return 1;
  if (unit.side !== "player" || unit.speed <= 0) return 1;
  const d = Math.hypot(unit.x - hero.x, unit.y - hero.y);
  if (d > 95) return 1;
  return 1.12;
}

export function heroSkillDefenseMult(unit: BattleUnit, skillUntil: number, now: number): number {
  if (now >= skillUntil || unit.side !== "player") return 1;
  if (unit.troopType !== "infantry" && unit.kind !== "hero") return 1;
  return 0.72;
}

export function addCombatFloat(
  battle: BattleState,
  x: number,
  y: number,
  text: string,
  color = "#ffd080",
): void {
  battle.combatFloats.push({ x, y, text, ttl: 1.1, color });
  if (battle.combatFloats.length > 40) battle.combatFloats.shift();
}

export function tickCombatFloats(battle: BattleState, dt: number): void {
  battle.combatFloats = battle.combatFloats.filter((f) => {
    f.ttl -= dt;
    f.y -= dt * 28;
    return f.ttl > 0;
  });
}

export function countNearbyAllies(units: BattleUnit[], unit: BattleUnit, radius: number): number {
  return units.filter(
    (u) =>
      u.id !== unit.id &&
      u.side === unit.side &&
      u.hp > 0 &&
      u.speed > 0 &&
      Math.hypot(u.x - unit.x, u.y - unit.y) < radius,
  ).length;
}

export function isFlanked(units: BattleUnit[], unit: BattleUnit): boolean {
  if (unit.side !== "player" || unit.speed <= 0 || unit.facing == null) return false;
  const foes = units.filter((u) => u.side === "enemy" && u.hp > 0 && u.speed > 0);
  let front = 0;
  let rear = 0;
  for (const f of foes) {
    const dx = f.x - unit.x;
    const dy = f.y - unit.y;
    if (Math.hypot(dx, dy) > 80) continue;
    const angle = Math.atan2(dy, dx);
    const diff = Math.abs(normalizeAngle(angle - unit.facing));
    if (diff < Math.PI / 2) front++;
    else rear++;
  }
  return rear >= 2 && front === 0;
}

export function emptyCasualties(): TroopCounts {
  return { infantry: 0, archers: 0, cavalry: 0 };
}
