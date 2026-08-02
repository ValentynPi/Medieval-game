import { BATTLE_H, BATTLE_W, BUILDINGS, FOOD_UPKEEP, GRID_H, GRID_W, INSTANT_BUILD, PLACEABLE, TRAIN_COST, TROOP_STATS, canAfford, gridToBattleX, gridToBattleY, pay, scaleCost, triangleMultiplier } from "./config";
import {
  buildingAt,
  countType,
  fieldArmy,
  fieldAt,
  hasBoatAt,
  hasBridgeAt,
  keepLevel,
  refreshKeepHpCap,
  selectedBarracks,
  siteUnlocked,
  totalTroops,
  uid,
  wealthScore,
} from "./state";
import {
  addCombatFloat,
  applyMoraleHit,
  computeScoutRadius,
  emptyCasualties,
  fatigueSpeedMult,
  flankingMultiplier,
  formationSlots,
  heroAuraMult,
  heroSkillDefenseMult,
  battleToGrid,
  canEnterWaterCell,
  isFlanked,
  isWaterAt,
  nearestDryBattlePos,
  moraleCombatMult,
  refreshFogOfWar,
  terrainAtBattle,
  terrainSpeedMult,
  tickCombatFloats,
  tickMoraleAndFatigue,
  troopVariant,
  variantLabel,
  variantModifiers,
  troopVariantForLevel,
  variantUnlockedAt,
} from "./combat";
import { biomeAt, buildBlockedReason, cellBiome, getWorldLayout, isBuildableCell, isWaterBiome } from "./worldGen";
import { registerFinishSite, tickVillagers } from "./villagers";
import type {
  BattleState,
  BattleUnit,
  BuildingType,
  ConstructionSite,
  FieldCell,
  FormationType,
  GameState,
  ResourceId,
  Resources,
  TroopCounts,
  TroopType,
  WorldSite,
} from "./types";

export function flash(state: GameState, text: string, seconds = 4): void {
  state.message = text;
  state.messageTimer = seconds;
}

export function productionPerSecond(state: GameState): Resources {
  const out: Resources = { wood: 0.35, stone: 0.2, food: 0.35, gold: 0.15 };
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def.production) continue;
    for (const key of Object.keys(def.production) as (keyof Resources)[]) {
      let amount = (def.production[key] ?? 0) * b.level;
      if (b.type === "farm" && key === "food") {
        amount += (b.fields?.length ?? 0) * 0.45 * b.level;
      }
      out[key] += amount;
    }
  }
  // Working townsfolk add a steady +rate (same idea as building production)
  for (const v of state.villagers) {
    if (v.job === "woodcutter") out.wood += v.phase === "work" ? 0.55 : 0.25;
    else if (v.job === "farmer") out.food += v.phase === "work" ? 0.5 : 0.22;
    else if (v.job === "quarryman") out.stone += v.phase === "work" ? 0.4 : 0.18;
    else if (v.job === "miner") {
      out.stone += 0.15;
      out.gold += 0.12;
    } else if (v.job === "trader") out.gold += 0.2;
  }
  return out;
}

function facingDelta(rotation: number): { dx: number; dy: number } {
  const r = ((rotation % 4) + 4) % 4;
  if (r === 0) return { dx: 0, dy: 1 };
  if (r === 1) return { dx: 1, dy: 0 };
  if (r === 2) return { dx: 0, dy: -1 };
  return { dx: -1, dy: 0 };
}

function fieldOwnedByOther(
  state: GameState,
  x: number,
  y: number,
  exceptFarmId?: string,
): boolean {
  for (const b of state.buildings) {
    if (exceptFarmId && b.id === exceptFarmId) continue;
    if (b.fields?.some((c) => c.x === x && c.y === y)) return true;
  }
  return false;
}

function claimFarmFields(
  state: GameState,
  farmX: number,
  farmY: number,
  rotation: number,
  level: number,
  exceptFarmId?: string,
): FieldCell[] {
  const { dx, dy } = facingDelta(rotation);
  const sideX = -dy;
  const sideY = dx;
  const depth = 1 + Math.min(2, level);
  const width = 3;
  const fields: FieldCell[] = [];
  for (let row = 1; row <= depth; row++) {
    for (let col = -Math.floor(width / 2); col <= Math.floor(width / 2); col++) {
      const x = farmX + dx * row + sideX * col;
      const y = farmY + dy * row + sideY * col;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
      if (buildingAt(state, x, y)) continue;
      if (fieldOwnedByOther(state, x, y, exceptFarmId)) continue;
      const biome = cellBiome(x, y, state.buildings);
      if (biome !== "meadow" && biome !== "path" && biome !== "forest") continue;
      fields.push({ x, y });
    }
  }
  return fields;
}

export function upkeepPerSecond(state: GameState): number {
  let cost = 0;
  for (const t of ["infantry", "archers", "cavalry"] as TroopType[]) {
    cost += state.troops[t] * FOOD_UPKEEP[t];
  }
  return cost;
}

export function tickEconomy(state: GameState, dt: number): void {
  if (state.mode !== "village" || state.defeat || state.victory) return;
  tickVillagers(state, dt);
  const prod = productionPerSecond(state);
  state.resources.wood += prod.wood * dt;
  state.resources.stone += prod.stone * dt;
  state.resources.food += prod.food * dt;
  state.resources.gold += prod.gold * dt;

  const upkeep = upkeepPerSecond(state);
  state.resources.food -= upkeep * dt;
  if (state.resources.food < 0) {
    state.resources.food = 0;
    if (totalTroops(state.troops) > 0 && Math.random() < dt * 0.15) {
      const types = (["infantry", "archers", "cavalry"] as TroopType[]).filter(
        (t) => state.troops[t] > 0,
      );
      if (types.length) {
        const pick = types[Math.floor(Math.random() * types.length)];
        state.troops[pick] -= 1;
        state.garrison[pick] = Math.min(state.garrison[pick], state.troops[pick]);
        flash(state, "Starvation — a levy deserts. Raise farms or cut the muster.", 3);
      }
    }
  } else if (prod.food < upkeep && state.resources.food < 40 && state.messageTimer <= 0) {
    flash(state, "Food running thin — upkeep exceeds production.", 3);
  }

  state.timeToRaid -= dt;
  if (state.timeToRaid <= 0) {
    startRaid(state);
  }

  state.day += dt / 100;
}

function canPlaceAt(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
): boolean {
  if (!PLACEABLE.includes(type)) return false;
  if (state.constructionSites.some((s) => s.x === x && s.y === y)) {
    flash(state, "Builders are already raising something on that plot.");
    return false;
  }
  const existing = buildingAt(state, x, y);
  if (type === "mine" && existing?.type === "mountain") return true;
  if (existing) {
    flash(state, "That plot is already claimed.");
    return false;
  }
  if (fieldAt(state, x, y) && type !== "farm") {
    flash(state, "Crop fields already cover this plot.");
    return false;
  }
  const biome = biomeAt(x, y);
  if (type === "bridge" || type === "boat") {
    if (!isWaterBiome(biome)) {
      flash(state, `${BUILDINGS[type].name}s can only be placed on rivers and lakes.`);
      return false;
    }
  } else if (type === "mine") {
    if (biome !== "mountain") {
      flash(state, "Gold Mines need a mountain — raise one or find natural peaks.");
      return false;
    }
  } else if (type === "road" || type === "forest" || type === "mountain") {
    if (isWaterBiome(biome)) {
      flash(state, "Cannot shape terrain on water — use a Bridge.");
      return false;
    }
    if (type === "road" && biome === "mountain") {
      flash(state, "Roads cannot cut through mountain peaks.");
      return false;
    }
    if (type === "forest" && biome === "mountain") {
      flash(state, "Trees will not take root on bare mountain.");
      return false;
    }
  } else if (!isBuildableCell(x, y)) {
    flash(state, buildBlockedReason(x, y) ?? "You cannot build here.");
    return false;
  }
  const def = BUILDINGS[type];
  if (keepLevel(state) < def.keepRequired) {
    flash(state, `${def.name} needs Keep level ${def.keepRequired}.`);
    return false;
  }
  if (type === "barracks" && countType(state, "barracks") >= 2) {
    flash(state, "Two Barracks is the limit for this realm.");
    return false;
  }
  if (type === "buildersHall" && countType(state, "buildersHall") >= 1) {
    flash(state, "One Builders Hall is enough — upgrade it for a larger crew.");
    return false;
  }
  return true;
}

function completeBuilding(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: number,
): void {
  const rot = ((rotation % 4) + 4) % 4;
  const existing = buildingAt(state, x, y);
  if (type === "mine" && existing?.type === "mountain") {
    existing.type = "mine";
    existing.level = 1;
    existing.rotation = rot;
    flash(state, "Builders finished the Gold Mine.");
    return;
  }
  const building = {
    id: uid("bld"),
    type,
    level: 1,
    x,
    y,
    rotation: rot,
    fields: type === "farm" ? claimFarmFields(state, x, y, rot, 1) : undefined,
  };
  state.buildings.push(building);
  if (type === "farm") {
    flash(state, `Farm finished — ${building.fields?.length ?? 0} field plots.`);
  } else if (type === "bridge") {
    flash(state, "Bridge spans the water — townsfolk can cross on foot.");
  } else if (type === "boat") {
    flash(state, "Boat docked — move troops onto it to sail the river.");
  } else if (type === "road") {
    flash(state, "Road laid.");
  } else if (type === "forest") {
    flash(state, "Forest planted.");
  } else if (type === "mountain") {
    flash(state, "Mountain raised — dig a Gold Mine here.");
  } else if (type === "buildersHall") {
    flash(state, "Builders Hall ready — hire a crew on the right.");
  } else {
    flash(state, `${BUILDINGS[type].name} finished by the crew.`);
  }
  if (state.tutorialStep === 0 && (type === "farm" || type === "lumber")) {
    state.tutorialStep = 1;
  }
}

export function finishConstructionSite(state: GameState, site: ConstructionSite): void {
  const idx = state.constructionSites.findIndex((s) => s.id === site.id);
  if (idx >= 0) state.constructionSites.splice(idx, 1);
  for (const v of state.villagers) {
    if (v.siteId === site.id) {
      v.siteId = null;
      v.phase = "walk";
    }
  }
  completeBuilding(state, site.type, site.x, site.y, site.rotation);
}

registerFinishSite(finishConstructionSite);

export function placeBuilding(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
  rotation = state.buildRotation,
): boolean {
  if (!canPlaceAt(state, type, x, y)) return false;
  const def = BUILDINGS[type];
  const cost = scaleCost(def.baseCost, 1, def.costGrowth);
  if (!canAfford(state.resources, cost)) {
    flash(state, "Not enough resources.");
    return false;
  }

  const needsCrew = !INSTANT_BUILD.includes(type);
  if (needsCrew) {
    const hasHall = state.buildings.some((b) => b.type === "buildersHall");
    const hasBuilders = state.villagers.some((v) => v.job === "builder");
    if (!hasHall) {
      flash(state, "Build a Builders Hall first, then hire builders to raise this.", 5);
      return false;
    }
    if (!hasBuilders) {
      flash(state, "Hire builders at the Hall — they will walk out and raise this.", 5);
      return false;
    }
  }

  state.resources = pay(state.resources, cost);
  const rot = ((rotation % 4) + 4) % 4;
  const spent = [
    cost.wood ? `${cost.wood} wood` : "",
    cost.stone ? `${cost.stone} stone` : "",
    cost.food ? `${cost.food} food` : "",
    cost.gold ? `${cost.gold} gold` : "",
  ]
    .filter(Boolean)
    .join(", ");

  if (!needsCrew) {
    completeBuilding(state, type, x, y, rot);
    if (spent) flash(state, `${def.name} — paid ${spent}.`, 3);
    return true;
  }

  state.constructionSites.push({
    id: uid("site"),
    type,
    x,
    y,
    rotation: rot,
    progress: 0,
    builderId: null,
  });
  flash(state, `${def.name} foundation — paid ${spent}. A builder is on the way.`, 4);
  return true;
}

export function tradeBuy(
  state: GameState,
  cityId: string,
  resource: ResourceId,
  amount: number,
): boolean {
  if (resource === "gold") return false;
  const city = state.cities.find((c) => c.id === cityId);
  if (!city || amount <= 0) return false;
  const take = Math.min(amount, city.stock[resource]);
  if (take <= 0) {
    flash(state, `${city.name} has no ${resource} left.`);
    return false;
  }
  const marketLv = state.buildings
    .filter((b) => b.type === "market")
    .reduce((m, b) => Math.max(m, b.level), 0);
  const portMult = city.hasPort ? 0.92 : 1;
  const price = Math.ceil((city.buyPrice[resource] * take * portMult) / (1 + marketLv * 0.05));
  if (state.resources.gold < price) {
    flash(state, "Not enough gold to buy.");
    return false;
  }
  state.resources.gold -= price;
  state.resources[resource] += take;
  city.stock[resource] -= take;
  flash(state, `Bought ${take} ${resource} from ${city.name} for ${price}g.`);
  return true;
}

export function tradeSell(
  state: GameState,
  cityId: string,
  resource: ResourceId,
  amount: number,
): boolean {
  if (resource === "gold") return false;
  const city = state.cities.find((c) => c.id === cityId);
  if (!city || amount <= 0) return false;
  const give = Math.min(amount, Math.floor(state.resources[resource]));
  if (give <= 0) {
    flash(state, `No ${resource} to sell.`);
    return false;
  }
  const marketLv = state.buildings
    .filter((b) => b.type === "market")
    .reduce((m, b) => Math.max(m, b.level), 0);
  const portMult = city.hasPort ? 1.08 : 1;
  const gain = Math.floor(city.sellPrice[resource] * give * (1 + marketLv * 0.05) * portMult);
  state.resources[resource] -= give;
  state.resources.gold += gain;
  city.stock[resource] += give;
  flash(state, `Sold ${give} ${resource} to ${city.name} for ${gain}g.`);
  return true;
}

/** Display unit prices after market + port modifiers */
export function tradeUnitPrices(
  state: GameState,
  city: { hasPort?: boolean; buyPrice: Resources; sellPrice: Resources },
  resource: ResourceId,
): { buy: number; sell: number } {
  const marketLv = state.buildings
    .filter((b) => b.type === "market")
    .reduce((m, b) => Math.max(m, b.level), 0);
  const buyPort = city.hasPort ? 0.92 : 1;
  const sellPort = city.hasPort ? 1.08 : 1;
  return {
    buy: Math.ceil((city.buyPrice[resource] * buyPort) / (1 + marketLv * 0.05)),
    sell: Math.floor(city.sellPrice[resource] * (1 + marketLv * 0.05) * sellPort),
  };
}

export function rotateBuildPreview(state: GameState): void {
  if (state.mode !== "village" || !state.selectedBuild) return;
  state.buildRotation = (state.buildRotation + 1) % 4;
  flash(state, `Facing: ${state.buildRotation * 90}°`, 1.5);
}

export function rotateBuilding(state: GameState, id: string): boolean {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) return false;
  if (b.type === "keep") {
    flash(state, "The Keep cannot be turned.");
    return false;
  }
  b.rotation = (b.rotation + 1) % 4;
  if (b.type === "farm") {
    b.fields = claimFarmFields(state, b.x, b.y, b.rotation, b.level, b.id);
  }
  flash(state, `${BUILDINGS[b.type].name} turned — ${b.rotation * 90}°`, 2);
  return true;
}

export function upgradeBuilding(state: GameState, id: string): boolean {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) return false;
  const def = BUILDINGS[b.type];
  if (b.level >= def.maxLevel) {
    flash(state, "Already at maximum tier.");
    return false;
  }
  const kl = keepLevel(state);
  if (b.type !== "keep" && b.level >= kl) {
    flash(state, "Upgrade the Keep to raise this further.");
    return false;
  }
  const next = b.level + 1;
  const cost = scaleCost(def.baseCost, next, def.costGrowth);
  if (!canAfford(state.resources, cost)) {
    flash(state, "Not enough resources to upgrade.");
    return false;
  }
  state.resources = pay(state.resources, cost);
  b.level = next;
  if (b.type === "farm") {
    b.fields = claimFarmFields(state, b.x, b.y, b.rotation, b.level, b.id);
  }
  if (b.type === "keep") {
    refreshKeepHpCap(state);
    state.keepHp = state.keepMaxHp;
    flash(state, `Keep rises to level ${b.level}. New crafts unlock.`);
  } else {
    flash(state, `${def.name} upgraded to ${b.level}.`);
    if (b.type === "barracks") {
      const unlocked = (["infantry", "archers", "cavalry"] as TroopType[])
        .map((t) => variantUnlockedAt(t, b.level))
        .filter((x): x is string => !!x);
      if (unlocked.length) {
        flash(state, `Veteran drills unlocked: ${unlocked.join(", ")}`, 5);
      }
    }
  }
  return true;
}

export function trainCostFor(state: GameState, type: TroopType): Resources {
  let cost = { ...TRAIN_COST[type] };
  const market = state.buildings.find((b) => b.type === "market");
  if (market) {
    const discount = 1 - Math.min(0.25, market.level * 0.05);
    cost = {
      wood: Math.floor(cost.wood * discount),
      stone: Math.floor(cost.stone * discount),
      food: Math.floor(cost.food * discount),
      gold: Math.floor(cost.gold * discount),
    };
  }
  return cost;
}

export function trainTroop(state: GameState, type: TroopType, amount = 1): boolean {
  if (countType(state, "barracks") < 1) {
    flash(state, "Build a Barracks first.");
    return false;
  }
  const camp = state.buildings.find(
    (b) => b.id === state.selectedBuildingId && b.type === "barracks",
  );
  if (!camp) {
    flash(state, "Click your Training Camp (Barracks) to drill recruits.");
    return false;
  }
  const cost = trainCostFor(state, type);
  const total: Resources = {
    wood: cost.wood * amount,
    stone: cost.stone * amount,
    food: cost.food * amount,
    gold: cost.gold * amount,
  };
  if (!canAfford(state.resources, total)) {
    flash(state, "Cannot afford those recruits.");
    return false;
  }
  state.resources = pay(state.resources, total);
  state.troops[type] += amount;
  const variant = troopVariantForLevel(type, camp.level);
  flash(state, `Trained ${amount} ${variantLabel(variant)}.`);
  if (state.tutorialStep === 1) state.tutorialStep = 2;
  return true;
}

export function setGarrison(state: GameState, type: TroopType, value: number): void {
  if (!selectedBarracks(state)) return;
  const max = state.troops[type];
  state.garrison[type] = Math.max(0, Math.min(max, value));
}

export function armyPower(troops: TroopCounts, heroBonus = 0): number {
  return troops.infantry * 10 + troops.archers * 11 + troops.cavalry * 13 + heroBonus;
}

function smithBonus(state: GameState): number {
  const smith = state.buildings.find((b) => b.type === "blacksmith");
  return smith ? 1 + smith.level * 0.1 : 1;
}

function raidThreat(state: GameState): number {
  const wave = state.raidCount + 1;
  const wealth = wealthScore(state) / 80;
  const keep = keepLevel(state);
  return wave + wealth * 0.35 + keep * 0.4;
}

export function startRaid(state: GameState): void {
  state.raidCount += 1;
  state.timeToRaid = 80 + state.raidCount * 10;
  const wave = state.raidCount;
  const threat = raidThreat(state);
  const enemyCount = Math.floor(5 + threat * 2.2);
  const units: BattleUnit[] = [];

  const keep = state.buildings.find((b) => b.type === "keep")!;
  units.push({
    id: uid("u"),
    side: "player",
    kind: "keep",
    x: gridToBattleX(keep.x),
    y: gridToBattleY(keep.y),
    hp: state.keepHp,
    maxHp: state.keepMaxHp,
    atk: 0,
    range: 0,
    speed: 0,
    radius: 28,
    cooldown: 0,
  });

  for (const b of state.buildings.filter((x) => x.type === "tower")) {
    units.push({
      id: uid("u"),
      side: "player",
      kind: "tower",
      x: gridToBattleX(b.x),
      y: gridToBattleY(b.y),
      hp: 120 + b.level * 40,
      maxHp: 120 + b.level * 40,
      atk: 10 + b.level * 4,
      range: 140 + b.level * 10,
      speed: 0,
      radius: 18,
      cooldown: 0,
    });
  }

  for (const b of state.buildings.filter((x) => x.type === "wall")) {
    units.push({
      id: uid("u"),
      side: "player",
      kind: "tower",
      x: gridToBattleX(b.x),
      y: gridToBattleY(b.y),
      hp: 160 + b.level * 50,
      maxHp: 160 + b.level * 50,
      atk: 0,
      range: 0,
      speed: 0,
      radius: 22,
      cooldown: 0,
    });
  }

  const smith = smithBonus(state);
  const spawnTroop = (type: TroopType, i: number) => {
    const s = TROOP_STATS[type];
    const variant = troopVariant(type, state);
    const vm = variantModifiers(variant);
    const angle = (i / 8) * Math.PI * 2;
    units.push({
      id: uid("u"),
      side: "player",
      kind: type,
      troopType: type,
      variant,
      x: gridToBattleX(keep.x) + Math.cos(angle) * 50,
      y: gridToBattleY(keep.y) + Math.sin(angle) * 50,
      hp: s.hp * vm.hpMult,
      maxHp: s.hp * vm.hpMult,
      atk: s.atk * smith * vm.atkMult * (type === state.hero.buffTroop ? 1 + state.hero.buffAmount : 1),
      range: s.range * vm.rangeMult,
      speed: s.speed * vm.speedMult,
      radius: type === "cavalry" ? 14 : 12,
      cooldown: Math.random() * 0.4,
      morale: 100,
      fatigue: 0,
      facing: -Math.PI / 2,
      order: "auto",
    });
  };

  let idx = 0;
  (["infantry", "archers", "cavalry"] as TroopType[]).forEach((t) => {
    for (let i = 0; i < state.garrison[t]; i++) spawnTroop(t, idx++);
  });

  units.push({
    id: uid("u"),
    side: "player",
    kind: "hero",
    troopType: "infantry",
    x: gridToBattleX(keep.x) + 14,
    y: gridToBattleY(keep.y) - 16,
    hp: 220 + state.hero.level * 40,
    maxHp: 220 + state.hero.level * 40,
    atk: 22 + state.hero.level * 3,
    range: 42,
    speed: 48,
    radius: 15,
    cooldown: 0,
    morale: 100,
    fatigue: 0,
    facing: -Math.PI / 2,
    order: "auto",
  });

  const keepX = gridToBattleX(keep.x);
  const keepY = gridToBattleY(keep.y);
  const scale = 1 + wave * 0.1 + keepLevel(state) * 0.05;

  // Water spawn points for river boat assaults
  const layout = getWorldLayout();
  const riverSpawns = layout.waterCells
    .filter((c) => {
      const bx = gridToBattleX(c.gx);
      const by = gridToBattleY(c.gy);
      const d = Math.hypot(bx - keepX, by - keepY);
      return d > 280 && d < 720;
    })
    .slice(0, 80);
  const boatRaid = riverSpawns.length > 8 && (wave % 2 === 0 || wave >= 3);
  const boatCount = boatRaid ? Math.ceil(enemyCount * 0.45) : 0;

  for (let i = 0; i < enemyCount; i++) {
    const byBoat = i < boatCount;
    let x: number;
    let y: number;
    if (byBoat) {
      const cell = riverSpawns[i % riverSpawns.length];
      x = gridToBattleX(cell.gx) + (Math.random() - 0.5) * 30;
      y = gridToBattleY(cell.gy) + (Math.random() - 0.5) * 30;
    } else {
      const angle = (i / enemyCount) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 320 + Math.random() * 180;
      x = keepX + Math.cos(angle) * dist;
      y = keepY + Math.sin(angle) * dist;
      // Keep land spawns off water
      if (isWaterAt(x, y, state)) {
        x = keepX + Math.cos(angle) * (dist + 80);
        y = keepY + Math.sin(angle) * (dist + 80);
      }
    }
    x = Math.max(40, Math.min(BATTLE_W - 40, x));
    y = Math.max(40, Math.min(BATTLE_H - 40, y));
    const roll = Math.random();
    const troop: TroopType = roll < 0.45 ? "infantry" : roll < 0.75 ? "archers" : "cavalry";
    const s = TROOP_STATS[troop];
    const isBeast = !byBoat && wave >= 3 && i % 8 === 0;
    units.push({
      id: uid("u"),
      side: "enemy",
      kind: isBeast ? "beast" : "raider",
      troopType: troop,
      variant: troopVariant(troop, state),
      x,
      y,
      hp: s.hp * scale * (isBeast ? 1.6 : 1),
      maxHp: s.hp * scale * (isBeast ? 1.6 : 1),
      atk: s.atk * scale,
      range: s.range,
      speed: s.speed * (byBoat ? 0.7 : 0.85),
      radius: 12,
      cooldown: Math.random() * 0.5,
      morale: 85,
      fatigue: 0,
      facing: Math.atan2(keepY - y, keepX - x),
      order: "auto",
      embarked: byBoat,
    });
  }

  state.battle = {
    units,
    elapsed: 0,
    outcome: "ongoing",
    waveLabel: boatRaid
      ? `Raid ${wave} — River boats landing`
      : wave >= 4
        ? `Raid ${wave} — Beasts among them`
        : wave >= 2
          ? `Raid ${wave} — Heavier band`
          : `Bandit Raid ${wave}`,
    selectedIds: [],
    orderMarker: null,
    formation: "line",
    battleSpeed: 1,
    combatFloats: [],
    visibleEnemyIds: [],
    scoutRadius: computeScoutRadius(state),
    heroSkillUntil: 0,
    casualties: emptyCasualties(),
    keepDamagedThisTick: false,
  };
  refreshFogOfWar(state);
  state.mode = "battle";
  state.paused = false;
  flash(
    state,
    boatRaid
      ? "River assault! Raiders sail in — they leave boats on shore. Cross water only by Bridge or Boat."
      : "Formations: L line · V wedge · B block · C circle · Q hero skill · Drag to select",
  );
}

function isPlayerUnit(u: BattleUnit): boolean {
  return (
    u.side === "player" &&
    u.hp > 0 &&
    u.speed > 0 &&
    u.kind !== "keep" &&
    u.kind !== "tower"
  );
}

export function selectBattleUnits(state: GameState, ids: string[], additive = false): void {
  const battle = state.battle;
  if (!battle) return;
  const valid = ids.filter((id) => {
    const u = battle.units.find((x) => x.id === id);
    return u && isPlayerUnit(u);
  });
  if (additive) {
    const set = new Set(battle.selectedIds);
    for (const id of valid) {
      if (set.has(id)) set.delete(id);
      else set.add(id);
    }
    battle.selectedIds = [...set];
  } else {
    battle.selectedIds = valid;
  }
}

export function selectAllBattleUnits(state: GameState): void {
  const battle = state.battle;
  if (!battle) return;
  battle.selectedIds = battle.units.filter(isPlayerUnit).map((u) => u.id);
}

export function selectBattleByType(state: GameState, type: TroopType | "hero"): void {
  const battle = state.battle;
  if (!battle) return;
  battle.selectedIds = battle.units
    .filter((u) => {
      if (!isPlayerUnit(u)) return false;
      if (type === "hero") return u.kind === "hero";
      return u.troopType === type;
    })
    .map((u) => u.id);
}

export function setFormation(state: GameState, formation: FormationType): void {
  const battle = state.battle;
  if (!battle) return;
  battle.formation = formation;
  flash(state, `Formation: ${formation}`, 2);
}

export function setBattleSpeed(state: GameState, speed: number): void {
  const battle = state.battle;
  if (!battle) return;
  battle.battleSpeed = Math.max(1, Math.min(3, speed));
}

export function useHeroSkill(state: GameState): boolean {
  const battle = state.battle;
  if (!battle || battle.outcome !== "ongoing") return false;
  if (state.hero.skillCooldown > 0) {
    flash(state, `Ironwall ready in ${Math.ceil(state.hero.skillCooldown)}s`, 2);
    return false;
  }
  battle.heroSkillUntil = battle.elapsed + 8;
  state.hero.skillCooldown = state.hero.skillCooldownMax;
  flash(state, "Ironwall! Infantry brace — reduced damage for 8s", 3);
  return true;
}

export function issueMoveOrder(state: GameState, x: number, y: number): void {
  if (state.battle && isWaterAt(x, y, state)) {
    const cell = battleToGrid(x, y);
    if (!hasBridgeAt(state, cell.gx, cell.gy) && !hasBoatAt(state, cell.gx, cell.gy)) {
      flash(state, "Cannot march into the river — build a Bridge or Boat dock.", 3);
      return;
    }
  }
  const battle = state.battle;
  if (!battle || battle.selectedIds.length === 0) return;

  const selected = battle.selectedIds
    .map((id) => battle.units.find((u) => u.id === id))
    .filter((u): u is BattleUnit => !!u && isPlayerUnit(u));

  if (!selected.length) return;

  const cx = selected.reduce((s, u) => s + u.x, 0) / selected.length;
  const cy = selected.reduce((s, u) => s + u.y, 0) / selected.length;
  const facing = Math.atan2(y - cy, x - cx);
  const slots = formationSlots(battle.formation, selected.length, x, y, facing);

  selected.forEach((u, i) => {
    u.order = "move";
    u.routing = false;
    u.orderX = slots[i]?.x ?? x;
    u.orderY = slots[i]?.y ?? y;
    u.facing = facing;
  });
  battle.orderMarker = { x, y };
}

export function issueHoldOrder(state: GameState): void {
  const battle = state.battle;
  if (!battle || battle.selectedIds.length === 0) return;
  for (const id of battle.selectedIds) {
    const u = battle.units.find((unit) => unit.id === id);
    if (!u || !isPlayerUnit(u)) continue;
    u.order = "hold";
    u.orderX = undefined;
    u.orderY = undefined;
  }
  battle.orderMarker = null;
  flash(state, "Hold position!", 2);
}

export function issueAttackOrder(state: GameState): void {
  const battle = state.battle;
  if (!battle || battle.selectedIds.length === 0) return;
  for (const id of battle.selectedIds) {
    const u = battle.units.find((unit) => unit.id === id);
    if (!u || !isPlayerUnit(u)) continue;
    u.order = "auto";
    u.orderX = undefined;
    u.orderY = undefined;
  }
  battle.orderMarker = null;
  flash(state, "Attack nearest foes!", 2);
}

function nearestTarget(unit: BattleUnit, units: BattleUnit[]): BattleUnit | null {
  const targets = units.filter((u) => {
    if (u.hp <= 0) return false;
    if (unit.side === "player") return u.side === "enemy";
    return u.side === "player";
  });
  if (!targets.length) return null;

  // Enemies prefer the nearest wall segment, then the Keep when close
  if (unit.side === "enemy") {
    const keep = targets.find((t) => t.kind === "keep");
    if (keep) {
      const dKeep = Math.hypot(keep.x - unit.x, keep.y - unit.y);
      if (dKeep < 420) return keep;
    }
    let nearestWall: BattleUnit | null = null;
    let nearestWallD = Infinity;
    for (const t of targets) {
      if (t.kind !== "tower" || t.atk !== 0) continue;
      const d = Math.hypot(t.x - unit.x, t.y - unit.y);
      if (d < nearestWallD) {
        nearestWallD = d;
        nearestWall = t;
      }
    }
    if (nearestWall && nearestWallD < 200) return nearestWall;
  }

  let best: BattleUnit | null = null;
  let bestScore = Infinity;
  for (const t of targets) {
    const d = Math.hypot(t.x - unit.x, t.y - unit.y);
    let score = d;
    if (t.kind === "keep" && unit.side === "enemy") score *= 0.65;
    if (t.kind === "tower" && unit.side === "enemy" && t.atk > 0) score *= 0.85;
    if (t.routing && unit.side === "player") score *= 0.7;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

function resolveWallBlock(units: BattleUnit[], u: BattleUnit, nx: number, ny: number, dt: number): void {
  const nextX = u.x + nx * u.speed * dt;
  const nextY = u.y + ny * u.speed * dt;
  for (const w of units) {
    if (w.hp <= 0 || w.side === u.side) continue;
    if (w.atk === 0 && w.speed === 0 && w.kind === "tower") {
      const d = Math.hypot(nextX - w.x, nextY - w.y);
      if (d < w.radius + u.radius) {
        u.x -= nx * u.speed * dt * 0.6;
        u.y -= ny * u.speed * dt * 0.6;
        return;
      }
    }
  }
  u.x = nextX;
  u.y = nextY;
}

function tryBoardOrBlockWater(
  state: GameState,
  u: BattleUnit,
  nextX: number,
  nextY: number,
): boolean {
  const next = battleToGrid(nextX, nextY);
  const cur = battleToGrid(u.x, u.y);
  const nextWet = isWaterAt(nextX, nextY, state);
  const curWet = isWaterAt(u.x, u.y, state);

  if (!nextWet) {
    if (u.embarked && curWet) {
      u.embarked = false; // landfall
    }
    return true;
  }

  // Player troops: only bridges / docks — never swim or keep a phantom boat
  if (u.side === "player") {
    u.embarked = false;
    if (hasBridgeAt(state, next.gx, next.gy) || hasBoatAt(state, next.gx, next.gy)) {
      return true;
    }
    if (hasBoatAt(state, cur.gx, cur.gy)) {
      u.embarked = true;
      return true;
    }
    return false;
  }

  // Enemy boat raiders may sail deep water while embarked
  if (canEnterWaterCell(state, next.gx, next.gy, u)) {
    if (hasBoatAt(state, next.gx, next.gy) || hasBoatAt(state, cur.gx, cur.gy)) {
      u.embarked = true;
    }
    return true;
  }

  if (hasBoatAt(state, cur.gx, cur.gy)) {
    u.embarked = true;
    return true;
  }

  return false;
}

function moveUnit(
  units: BattleUnit[],
  u: BattleUnit,
  nx: number,
  ny: number,
  dt: number,
  speedMult: number,
  state?: GameState,
): void {
  if (u.embarked) speedMult *= 0.92;
  const step = u.speed * dt * speedMult;
  const nextX = u.x + nx * step;
  const nextY = u.y + ny * step;

  if (state && isWaterAt(nextX, nextY, state)) {
    if (!tryBoardOrBlockWater(state, u, nextX, nextY)) {
      return;
    }
  } else if (state && u.embarked) {
    tryBoardOrBlockWater(state, u, nextX, nextY);
  }

  resolveWallBlock(units, u, nx, ny, dt * speedMult);
  if (Math.abs(nx) + Math.abs(ny) > 0.01) {
    u.facing = Math.atan2(nx, ny);
  }
}

export function tickBattle(state: GameState, dt: number): void {
  const battle = state.battle;
  if (!battle || battle.outcome !== "ongoing") return;
  if (state.paused) return;

  dt *= battle.battleSpeed;
  battle.elapsed += dt;
  battle.keepDamagedThisTick = false;

  if (state.hero.skillCooldown > 0) {
    state.hero.skillCooldown = Math.max(0, state.hero.skillCooldown - dt);
  }

  const units = battle.units;
  const heroUnit = units.find((u) => u.kind === "hero" && u.side === "player");

  refreshFogOfWar(state);
  tickCombatFloats(battle, dt);

  // River / bank without bridge or boat → shove back to land (or drown if trapped)
  for (const u of units) {
    if (u.hp <= 0 || u.kind === "keep" || u.kind === "tower" || u.speed <= 0) continue;
    if (!isWaterAt(u.x, u.y, state)) {
      if (u.side === "player") u.embarked = false;
      continue;
    }
    const cell = battleToGrid(u.x, u.y);
    if (canEnterWaterCell(state, cell.gx, cell.gy, u)) continue;
    const dry = nearestDryBattlePos(state, u.x, u.y, 12);
    if (dry) {
      u.x = dry.x;
      u.y = dry.y;
      u.embarked = false;
      if (u.order === "move" && u.orderX != null && isWaterAt(u.orderX, u.orderY ?? u.y, state)) {
        u.order = "auto";
        u.orderX = undefined;
        u.orderY = undefined;
      }
      continue;
    }
    u.hp = 0;
    u.routing = true;
    addCombatFloat(battle, u.x, u.y, "Drowned!", "#6a9ec8");
    if (u.side === "player" && u.troopType) {
      battle.casualties[u.troopType] = (battle.casualties[u.troopType] ?? 0) + 1;
    }
  }

  for (const u of units) {
    if (u.hp <= 0) continue;
    if (u.kind === "keep") continue;

    u.cooldown = Math.max(0, u.cooldown - dt);

    if (u.routing && u.side === "player" && u.speed > 0) {
      const keep = units.find((k) => k.kind === "keep");
      if (keep) {
        const dx = keep.x - u.x;
        const dy = keep.y - u.y;
        const d = Math.hypot(dx, dy) || 1;
        const terrain = terrainAtBattle(u.x, u.y, state);
        const spd =
          terrainSpeedMult(u, terrain) * fatigueSpeedMult(u) * moraleCombatMult(u) * 1.15;
        moveUnit(units, u, dx / d, dy / d, dt, spd, state);
      }
      continue;
    }

    if (isFlanked(units, u)) {
      u.morale = Math.max(0, (u.morale ?? 100) - dt * 6);
    }

    const target = nearestTarget(u, units);
    const terrain = terrainAtBattle(u.x, u.y, state);
    const effectiveRange = u.range * terrain.rangeMult;
    const canAttack = target && Math.hypot(target.x - u.x, target.y - u.y) <= effectiveRange;

    if (canAttack && u.cooldown <= 0 && u.atk > 0) {
      let mult = moraleCombatMult(u) * heroAuraMult(heroUnit, u);
      if (u.troopType && target!.troopType) {
        mult *= triangleMultiplier(u.troopType, target!.troopType);
      }
      mult *= flankingMultiplier(u, target!);
      const incomingMult = heroSkillDefenseMult(target!, battle.heroSkillUntil, battle.elapsed);
      const dmg = u.atk * mult * incomingMult * (0.9 + Math.random() * 0.2);
      target!.hp -= dmg;
      applyMoraleHit(target!, dmg);
      addCombatFloat(
        battle,
        target!.x,
        target!.y - 10,
        `${Math.round(dmg)}`,
        mult > 1.2 ? "#ffb060" : "#f0e6d2",
      );
      u.cooldown = u.kind === "tower" ? 0.7 : u.troopType === "archers" ? 0.85 : 0.55;
      if (target!.kind === "keep") {
        state.keepHp = Math.max(0, target!.hp);
        battle.keepDamagedThisTick = true;
      }
      if (target!.hp <= 0 && target!.troopType && target!.side === "player" && target!.kind !== "hero") {
        battle.casualties[target!.troopType] += 1;
      }
      continue;
    }

    if (u.order === "hold") continue;

    if (u.order === "move" && u.orderX != null && u.orderY != null && u.speed > 0) {
      const dm = Math.hypot(u.orderX - u.x, u.orderY - u.y);
      if (dm > 22) {
        const nx = (u.orderX - u.x) / dm;
        const ny = (u.orderY - u.y) / dm;
        const spd =
          terrainSpeedMult(u, terrain) * fatigueSpeedMult(u) * moraleCombatMult(u);
        moveUnit(units, u, nx, ny, dt, spd, state);
        continue;
      }
      u.order = "auto";
      u.orderX = undefined;
      u.orderY = undefined;
    }

    if (!target || u.speed <= 0) continue;

    const dist = Math.hypot(target.x - u.x, target.y - u.y);
    if (dist > effectiveRange) {
      const nx = (target.x - u.x) / dist;
      const ny = (target.y - u.y) / dist;
      const spd =
        terrainSpeedMult(u, terrain) * fatigueSpeedMult(u) * moraleCombatMult(u);
      moveUnit(units, u, nx, ny, dt, spd, state);
    }
  }

  tickMoraleAndFatigue(units, dt, battle.keepDamagedThisTick);

  // Enemy retreat when badly outnumbered and low morale
  const enemiesAlive = units.filter((u) => u.side === "enemy" && u.hp > 0 && u.speed > 0);
  const playersAlive = units.filter((u) => u.side === "player" && u.hp > 0 && u.speed > 0);
  if (enemiesAlive.length > 0 && playersAlive.length > enemiesAlive.length * 1.8) {
    for (const e of enemiesAlive) {
      if ((e.morale ?? 100) < 25) {
        e.order = "move";
        e.orderX = e.x < BATTLE_W / 2 ? 10 : BATTLE_W - 10;
        e.orderY = e.y < BATTLE_H / 2 ? 10 : BATTLE_H - 10;
      }
    }
  }

  const keepUnit = units.find((u) => u.kind === "keep");
  if (keepUnit) {
    state.keepHp = Math.max(0, keepUnit.hp);
    if (keepUnit.hp <= 0) {
      battle.outcome = "lost";
      state.defeat = true;
      applyRaidCasualties(state, battle);
      flash(state, "The Keep has fallen. The crown is lost.", 8);
      return;
    }
  }

  // Active threats only — routing / far / stuck boat leftovers must not freeze the raid
  const activeThreats = units.filter((u) => {
    if (u.side !== "enemy" || u.hp <= 0 || u.speed <= 0) return false;
    if (u.routing) return false;
    if (!keepUnit) return true;
    const d = Math.hypot(u.x - keepUnit.x, u.y - keepUnit.y);
    return d < 920;
  });

  if (activeThreats.length === 0) {
    for (const u of units) {
      if (u.side === "enemy" && u.hp > 0) u.hp = 0;
    }
    battle.outcome = "won";
    applyRaidCasualties(state, battle);
    const reward = {
      wood: 50 + state.raidCount * 22,
      stone: 35 + state.raidCount * 18,
      food: 40 + state.raidCount * 18,
      gold: 45 + state.raidCount * 28,
    };
    state.resources.wood += reward.wood;
    state.resources.stone += reward.stone;
    state.resources.food += reward.food;
    state.resources.gold += reward.gold;
    state.hero.xp += 25 + state.raidCount * 10;
    levelHero(state);
    const c = battle.casualties;
    flash(
      state,
      `Raid broken! +${reward.gold}g · Losses: ${c.infantry}i ${c.archers}a ${c.cavalry}c`,
      5,
    );
    if (state.tutorialStep === 2) state.tutorialStep = 3;
    checkVictory(state);
  }
}

/** Remove fallen garrison troops after a raid */
function applyRaidCasualties(state: GameState, battle: BattleState): void {
  const fallen: TroopCounts = { infantry: 0, archers: 0, cavalry: 0 };
  let heroDown = false;

  for (const u of battle.units) {
    if (u.side !== "player" || u.hp > 0) continue;
    if (u.kind === "hero") heroDown = true;
    if (u.troopType && u.kind !== "hero") {
      fallen[u.troopType] += 1;
    }
  }

  (["infantry", "archers", "cavalry"] as TroopType[]).forEach((t) => {
    const lost = Math.min(fallen[t], state.garrison[t]);
    state.garrison[t] -= lost;
    state.troops[t] = Math.max(0, state.troops[t] - lost);
  });

  if (heroDown && state.battle?.outcome === "lost") {
    state.hero.xp = Math.max(0, state.hero.xp - 20);
  }
}

export function finishBattleReturn(state: GameState): void {
  if (!state.battle) return;
  if (state.battle.outcome === "ongoing") return;
  state.battle = null;
  if (!state.defeat) state.mode = "village";
}

function levelHero(state: GameState): void {
  const need = state.hero.level * 60;
  while (state.hero.xp >= need) {
    state.hero.xp -= need;
    state.hero.level += 1;
    state.hero.buffAmount = 0.25 + (state.hero.level - 1) * 0.03;
    flash(state, `${state.hero.name} reaches level ${state.hero.level}!`, 3);
  }
}

export type ExpeditionPreview = {
  fieldTotal: number;
  power: number;
  sitePower: number;
  effective: number;
  unlocked: boolean;
  canMarch: boolean;
  likelyWin: boolean;
  lossPct: number;
  composition: TroopCounts;
};

export function previewExpedition(state: GameState, site: WorldSite): ExpeditionPreview {
  const army = fieldArmy(state);
  const fieldTotal = totalTroops(army);
  const heroBonus = state.hero.level * 8;
  const power = armyPower(army, heroBonus) * smithBonus(state);
  let edge = 1;
  const theirs = site.composition;
  edge +=
    (army.infantry * theirs.cavalry +
      army.archers * theirs.infantry +
      army.cavalry * theirs.archers) *
    0.012;
  edge -=
    (theirs.infantry * army.cavalry +
      theirs.archers * army.infantry +
      theirs.cavalry * army.archers) *
    0.01;
  const effective = power * edge;
  const unlocked = siteUnlocked(state, site);
  const canMarch = !site.cleared && unlocked && fieldTotal >= 4;
  const likelyWin = effective >= site.power * 0.88;
  const lossPct = Math.min(0.5, Math.max(0.08, site.power / Math.max(25, effective)));
  return {
    fieldTotal,
    power: Math.round(power),
    sitePower: site.power,
    effective: Math.round(effective),
    unlocked,
    canMarch,
    likelyWin,
    lossPct,
    composition: { ...site.composition },
  };
}

export function resolveExpedition(state: GameState, site: WorldSite): void {
  if (site.cleared) {
    flash(state, "This land is already yours.");
    return;
  }
  if (!siteUnlocked(state, site)) {
    const prev = state.sites.find((s) => !s.cleared && state.sites.indexOf(s) < state.sites.indexOf(site));
    flash(state, `Clear ${prev?.name ?? "earlier camps"} first.`, 4);
    return;
  }

  const preview = previewExpedition(state, site);
  if (preview.fieldTotal < 4) {
    flash(state, "Leave garrison behind — need at least 4 field troops to march.", 4);
    return;
  }

  const losses = preview.lossPct;

  if (!preview.likelyWin) {
    applyFieldLosses(state, losses * 0.65);
    flash(state, `Driven back from ${site.name}. Train more field troops.`, 5);
    state.selectedSiteId = null;
    return;
  }

  applyFieldLosses(state, losses * 0.3);
  site.cleared = true;
  state.selectedSiteId = null;
  state.resources.wood += site.reward.wood;
  state.resources.stone += site.reward.stone;
  state.resources.food += site.reward.food;
  state.resources.gold += site.reward.gold;
  state.hero.xp += 40 + Math.floor(site.power / 2);
  levelHero(state);
  flash(state, `${site.name} claimed for the crown!`, 5);
  checkVictory(state);
}

function applyFieldLosses(state: GameState, fraction: number): void {
  const army = fieldArmy(state);
  (["infantry", "archers", "cavalry"] as TroopType[]).forEach((t) => {
    const lost = Math.floor(army[t] * fraction);
    state.troops[t] = Math.max(state.garrison[t], state.troops[t] - lost);
  });
}

function checkVictory(state: GameState): void {
  if (state.sites.every((s) => s.cleared) && keepLevel(state) >= 4) {
    state.victory = true;
    flash(state, "The Marches kneel. Holdfast stands!", 10);
  }
}

export function repairKeepCost(state: GameState): Resources {
  const missing = Math.max(0, state.keepMaxHp - state.keepHp);
  return {
    wood: Math.ceil(missing * 0.15),
    stone: Math.ceil(missing * 0.25),
    food: 0,
    gold: Math.ceil(missing * 0.1),
  };
}

export function repairKeep(state: GameState): void {
  if (state.keepHp >= state.keepMaxHp) {
    flash(state, "The Keep needs no repair.");
    return;
  }
  const cost = repairKeepCost(state);
  if (!canAfford(state.resources, cost)) {
    flash(state, "Cannot afford repairs.");
    return;
  }
  state.resources = pay(state.resources, cost);
  state.keepHp = state.keepMaxHp;
  flash(state, "Masons restore the Keep.");
}

export type { BattleState };
