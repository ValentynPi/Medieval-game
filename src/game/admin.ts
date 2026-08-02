import { BUILDINGS } from "./config";
import { spawnAdminVillagers } from "./villagers";
import { keepLevel, refreshKeepHpCap } from "./state";
import {
  finishBattleReturn,
  finishConstructionSite,
  flash,
  startRaid,
} from "./systems";
import type { GameState, TroopType } from "./types";

export function adminAddResources(state: GameState, amount = 500): void {
  state.resources.wood += amount;
  state.resources.stone += amount;
  state.resources.food += amount;
  state.resources.gold += amount;
  flash(state, `Admin: +${amount} to each resource.`, 3);
}

export function adminFillResources(state: GameState): void {
  state.resources = { wood: 99999, stone: 99999, food: 99999, gold: 99999 };
  flash(state, "Admin: coffers filled.", 3);
}

export function adminHealKeep(state: GameState): void {
  refreshKeepHpCap(state);
  state.keepHp = state.keepMaxHp;
  if (state.battle) {
    const keep = state.battle.units.find((u) => u.kind === "keep");
    if (keep) {
      keep.hp = state.keepMaxHp;
      keep.maxHp = state.keepMaxHp;
    }
  }
  flash(state, "Admin: Keep restored.", 3);
}

export function adminMaxKeep(state: GameState): void {
  const keep = state.buildings.find((b) => b.type === "keep");
  if (!keep) return;
  keep.level = BUILDINGS.keep.maxLevel;
  refreshKeepHpCap(state);
  state.keepHp = state.keepMaxHp;
  flash(state, `Admin: Keep raised to level ${keep.level}.`, 3);
}

export function adminSkipRaidTimer(state: GameState): void {
  state.timeToRaid = 3;
  flash(state, "Admin: raid arrives in 3s.", 3);
}

export function adminForceRaid(state: GameState): void {
  if (state.mode === "battle") {
    flash(state, "Admin: already in a raid.", 3);
    return;
  }
  if (state.mode === "intro") {
    flash(state, "Admin: start the game first.", 3);
    return;
  }
  state.mode = "village";
  state.timeToRaid = 0;
  startRaid(state);
  flash(state, "Admin: raid forced.", 3);
}

export function adminWinRaid(state: GameState): void {
  const battle = state.battle;
  if (!battle || state.mode !== "battle") {
    flash(state, "Admin: not in a raid.", 3);
    return;
  }
  for (const u of battle.units) {
    if (u.side === "enemy") u.hp = 0;
  }
  battle.outcome = "won";
  flash(state, "Admin: raid cleared — use Return.", 3);
}

export function adminAddTroops(state: GameState, amount = 5): void {
  const types: TroopType[] = ["infantry", "archers", "cavalry"];
  for (const t of types) {
    state.troops[t] += amount;
    state.garrison[t] += amount;
  }
  flash(state, `Admin: +${amount} of each troop (garrisoned).`, 3);
}

export function adminLevelHero(state: GameState): void {
  state.hero.level += 1;
  state.hero.xp = 0;
  state.hero.skillCooldown = 0;
  flash(state, `Admin: ${state.hero.name} is now level ${state.hero.level}.`, 3);
}

export function adminFinishBuilds(state: GameState): void {
  const sites = [...state.constructionSites];
  if (!sites.length) {
    flash(state, "Admin: no construction sites.", 3);
    return;
  }
  for (const site of sites) finishConstructionSite(state, site);
  flash(state, `Admin: finished ${sites.length} building(s).`, 3);
}

export function adminClearNextCamp(state: GameState): void {
  const site = state.sites.find((s) => !s.cleared);
  if (!site) {
    flash(state, "Admin: all camps already cleared.", 3);
    return;
  }
  site.cleared = true;
  state.resources.wood += site.reward.wood;
  state.resources.stone += site.reward.stone;
  state.resources.food += site.reward.food;
  state.resources.gold += site.reward.gold;
  flash(state, `Admin: cleared ${site.name}.`, 3);
}

export function adminClearAllCamps(state: GameState): void {
  let n = 0;
  for (const site of state.sites) {
    if (!site.cleared) {
      site.cleared = true;
      n += 1;
    }
  }
  flash(state, n ? `Admin: cleared ${n} camp(s).` : "Admin: nothing left to clear.", 3);
}

export function adminSpawnVillagers(state: GameState, count = 3): void {
  const gained = spawnAdminVillagers(state, count);
  flash(state, `Admin: spawned ${gained} townsfolk.`, 3);
}

export function adminAdvanceDay(state: GameState): void {
  state.day += 1;
  flash(state, `Admin: day ${state.day}.`, 2);
}

export function adminResetEndFlags(state: GameState): void {
  state.victory = false;
  state.defeat = false;
  if (state.mode === "battle" && state.battle?.outcome === "lost") {
    finishBattleReturn(state);
  }
  flash(state, "Admin: victory/defeat flags cleared.", 3);
}

export function adminStatusLine(state: GameState): string {
  return [
    `Day ${state.day}`,
    `Keep L${keepLevel(state)}`,
    `Raid #${state.raidCount} in ${Math.ceil(state.timeToRaid)}s`,
    `Folk ${state.villagers.length}`,
    `Sites ${state.sites.filter((s) => s.cleared).length}/${state.sites.length}`,
  ].join(" · ");
}
