import { BATTLE_H, BATTLE_W, CELL, GRID_H, GRID_W } from "./config";
import type { BattleState, BattleUnit, FormationType, GameState, TroopCounts, TroopType, TroopVariant } from "./types";
import { cellBiome, isWaterBiome } from "./worldGen";
import { barracksLevel, hasBoatAt, hasBridgeAt } from "./state";

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

/** Deep water channel (not riverbank shores). */
export function isWaterAt(x: number, y: number, state?: GameState): boolean {
  const { gx, gy } = battleToGrid(x, y);
  return cellBiome(gx, gy, state?.buildings) === "water";
}

/** Riverbanks OK. Deep water only with a Bridge or Boat dock — no free swimming. */
export function canEnterWaterCell(
  state: GameState,
  gx: number,
  gy: number,
  _unit: BattleUnit,
): boolean {
  const biome = cellBiome(gx, gy, state.buildings);
  if (biome !== "water") return true;
  if (hasBridgeAt(state, gx, gy)) return true;
  if (hasBoatAt(state, gx, gy)) return true;
  return false;
}

/** Nearest dry / bridge / boat cell in battle pixels */
export function nearestDryBattlePos(
  state: GameState,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const start = battleToGrid(x, y);
  for (let r = 0; r <= 24; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const gx = start.gx + dx;
        const gy = start.gy + dy;
        if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) continue;
        const biome = cellBiome(gx, gy, state.buildings);
        if (biome === "water" && !hasBridgeAt(state, gx, gy) && !hasBoatAt(state, gx, gy)) {
          continue;
        }
        return {
          x: gx * CELL + CELL / 2,
          y: gy * CELL + CELL / 2,
        };
      }
    }
  }
  return null;
}

export function terrainAtBattle(x: number, y: number, state?: GameState): TerrainMods {
  const { gx, gy } = battleToGrid(x, y);
  const biome = cellBiome(gx, gy, state?.buildings);
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
  const biome = cellBiome(gx, gy, state?.buildings);
  // Only the deep channel blocks; shores are walkable banks
  if (biome !== "water") return false;
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
