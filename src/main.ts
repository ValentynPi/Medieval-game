import "./style.css";
import { BUILDINGS, PLACEABLE, TROOP_STATS, scaleCost } from "./game/config";
import { drawWorld, worldCityFromPointer, worldSiteFromPointer } from "./game/render";
import { VillageScene } from "./game/scene3d";
import { nextVariantUnlock, troopVariantForLevel, variantLabel, variantModifiers } from "./game/combat";
import { createInitialState, barracksLevel, fieldArmy, keepLevel, resetIdCounter, selectedBarracks, selectedCity, selectedSite, totalTroops } from "./game/state";
import { clearSave, hasSave, lastSavedLabel, loadGame, saveGame } from "./game/save";
import {
  finishBattleReturn,
  flash,
  issueAttackOrder,
  issueHoldOrder,
  issueMoveOrder,
  placeBuilding,
  previewExpedition,
  productionPerSecond,
  repairKeep,
  repairKeepCost,
  resolveExpedition,
  rotateBuildPreview,
  rotateBuilding,
  selectAllBattleUnits,
  selectBattleByType,
  selectBattleUnits,
  setBattleSpeed,
  setFormation,
  setGarrison,
  startRaid,
  tickBattle,
  tickEconomy,
  tradeBuy,
  tradeSell,
  tradeUnitPrices,
  trainTroop,
  trainCostFor,
  upgradeBuilding,
  upkeepPerSecond,
  useHeroSkill,
} from "./game/systems";
import {
  JOB_HINTS,
  JOB_LABELS,
  selectedVillager,
  setVillagerJob,
  setVillagerWorkplace,
  villagerJobYieldLabel,
} from "./game/villagers";
import type { Building, BuildingType, GameState, ResourceId, TroopType, VillagerJob } from "./game/types";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="topbar">
    <div class="brand-row">
      <div class="portrait" title="Ruler"></div>
      <div class="brand">Holdfast<br/><span>Crown of the Marches</span></div>
    </div>
    <div class="resources" id="resources"></div>
    <div class="top-meta">
      <div class="pill" id="day-pill">Day 1</div>
      <div class="pill warn" id="raid-pill">Raid --</div>
      <div class="pill" id="save-pill">Saved</div>
    </div>
  </header>
  <div class="layout">
    <aside class="panel" id="left-panel"></aside>
    <main class="stage-wrap">
      <div class="msg" id="message"></div>
      <div class="stage" id="stage">
        <canvas id="game"></canvas>
        <canvas id="world" class="hidden" width="1100" height="720"></canvas>
      </div>
      <div class="toolbar" id="toolbar"></div>
      <div class="legend">
        <span>Click townsfolk to assign work · Camera: WASD / arrows · right-drag · scroll zoom</span>
        <span>Infantry &gt; Cavalry &gt; Archers &gt; Infantry</span>
        <span>Raids: drag-select · L/V/B/C formations · Q Ironwall · Shift+1/2/3 speed · Space pause</span>
      </div>
    </main>
    <aside class="panel" id="right-panel"></aside>
  </div>
  <nav class="bottom-nav">
    <button class="chapter" id="chapter-btn" type="button">Chapter 1 · Raise farms</button>
    <button id="nav-village" class="active">Village</button>
    <button id="nav-world">World</button>
  </nav>
  <div class="intro-overlay" id="intro">
    <div class="intro-card">
      <h1>The crown is yours</h1>
      <p>Raise a stylized March village in 3D — thatched halls, torchlight, and raids at the gate.</p>
      <ul>
        <li>Place farms &amp; camps, upgrade the Keep</li>
        <li>Barracks: garrison defends raids; leftover troops march the World Map</li>
        <li>Click townsfolk to assign work — chop wood, farm, quarry, mine, trade</li>
        <li>Clear 8 camps in order · Win with Keep level 4</li>
      </ul>
      <button class="primary" id="start-btn">Take the throne</button>
      <button id="continue-btn" class="hidden">Continue saved realm</button>
      <p class="hint" id="save-hint"></p>
    </div>
  </div>
  <div class="end-overlay hidden" id="ending">
    <div class="end-card">
      <h1 id="end-title">Victory</h1>
      <p id="end-body"></p>
      <button class="primary" id="restart-btn">Rule again</button>
    </div>
  </div>
`;

const stage = document.querySelector<HTMLElement>("#stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const worldCanvas = document.querySelector<HTMLCanvasElement>("#world")!;
const worldCtx = worldCanvas.getContext("2d")!;
const village = new VillageScene(canvas, stage);

const resourcesEl = document.querySelector("#resources")!;
const leftPanel = document.querySelector("#left-panel")!;
const rightPanel = document.querySelector("#right-panel")!;
const toolbar = document.querySelector("#toolbar")!;
const messageEl = document.querySelector("#message")!;
const dayPill = document.querySelector("#day-pill")!;
const raidPill = document.querySelector("#raid-pill")!;
const intro = document.querySelector("#intro")!;
const ending = document.querySelector("#ending")!;

let state: GameState = createInitialState();
let last = performance.now();
let hudDirty = true;
let saveTimer = 0;
const SAVE_EVERY = 12;
let dragSelect: { x0: number; y0: number; active: boolean } | null = null;
let dragConsumedClick = false;
let lastGhostCell: { x: number; y: number } | null = null;

function persist(): void {
  if (state.mode === "intro") return;
  saveGame(state);
  const pill = document.querySelector("#save-pill");
  if (pill) pill.textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

function bootFresh(): void {
  resetIdCounter(false);
  state = createInitialState();
  clearSave();
  intro.classList.remove("hidden");
  ending.classList.add("hidden");
  village.setGhost(null, null);
  hudDirty = true;
}

function bootContinue(): void {
  const loaded = loadGame();
  if (!loaded) return;
  resetIdCounter(true);
  state = loaded;
  intro.classList.add("hidden");
  ending.classList.toggle("hidden", !state.victory && !state.defeat);
  village.setGhost(null, null);
  hudDirty = true;
}

if (hasSave()) {
  document.querySelector("#continue-btn")!.classList.remove("hidden");
  const hint = document.querySelector("#save-hint")!;
  hint.textContent = `Saved game found (${lastSavedLabel() ?? "unknown time"})`;
}

document.querySelector("#start-btn")!.addEventListener("click", () => {
  bootFresh();
  intro.classList.add("hidden");
  state.mode = "village";
  flash(state, "Build farms, then click townsfolk to send them chopping, farming, or mining.");
  persist();
  hudDirty = true;
});

document.querySelector("#continue-btn")!.addEventListener("click", () => {
  bootContinue();
  persist();
});

document.querySelector("#restart-btn")!.addEventListener("click", () => {
  bootFresh();
  renderHud();
});

document.querySelector("#nav-village")!.addEventListener("click", () => {
  if (state.mode === "battle" || state.mode === "intro") return;
  state.mode = "village";
  hudDirty = true;
});

document.querySelector("#nav-world")!.addEventListener("click", () => {
  if (state.mode === "battle" || state.mode === "intro") return;
  state.mode = "world";
  state.selectedBuild = null;
  state.selectedBuildingId = null;
  village.setGhost(null, null);
  const field = totalTroops(fieldArmy(state));
  flash(
    state,
    field >= 4
      ? `World map — time paused. Field army ready: ${field} (garrison stays home).`
      : `World map — time paused. Need 4+ field troops to march (now ${field}). Lower garrison at the Barracks.`,
    5,
  );
  hudDirty = true;
});

window.addEventListener("resize", () => village.resize());

canvas.addEventListener("pointermove", (e) => {
  if (state.mode !== "village") return;
  const cell = village.pickCell(e.clientX, e.clientY);
  lastGhostCell = cell;
  if (state.selectedBuild) village.setGhost(state.selectedBuild, cell, state.buildRotation);
});

canvas.addEventListener("pointerleave", () => {
  if (state.selectedBuild) village.setGhost(state.selectedBuild, null, state.buildRotation);
});

canvas.addEventListener("pointerdown", (e) => {
  if (state.mode === "battle" && state.battle?.outcome === "ongoing" && e.button === 0) {
    dragSelect = { x0: e.clientX, y0: e.clientY, active: false };
    dragConsumedClick = false;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragSelect) return;
  if (Math.hypot(e.clientX - dragSelect.x0, e.clientY - dragSelect.y0) > 12) {
    dragSelect.active = true;
    village.showSelectBox(dragSelect.x0, dragSelect.y0, e.clientX, e.clientY);
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (dragSelect?.active) {
    const ids = village.unitsInScreenRect(
      state,
      dragSelect.x0,
      dragSelect.y0,
      e.clientX,
      e.clientY,
    );
    selectBattleUnits(state, ids, e.shiftKey);
    village.hideSelectBox();
    dragConsumedClick = true;
    dragSelect = null;
    hudDirty = true;
  } else {
    dragSelect = null;
  }
});

canvas.addEventListener("click", (e) => {
  if (dragConsumedClick) {
    dragConsumedClick = false;
    return;
  }
  if (state.mode === "battle" && state.battle?.outcome === "ongoing") {
    if (e.button !== 0) return;
    const pick = village.pickBattle(e.clientX, e.clientY, state);
    if (!pick) return;
    if (pick.kind === "unit") {
      selectBattleUnits(state, [pick.id], e.shiftKey);
      hudDirty = true;
      return;
    }
    if (pick.kind === "ground") {
      if (state.battle.selectedIds.length === 0) {
        flash(state, "Select units first (drag-box or press A).", 2);
        return;
      }
      issueMoveOrder(state, pick.x, pick.y);
      hudDirty = true;
    }
    return;
  }

  if (e.shiftKey) return;
  if (state.mode !== "village") return;

  const cell = village.pickCell(e.clientX, e.clientY);

  if (state.assignWorkplace && state.selectedVillagerId && cell) {
    if (setVillagerWorkplace(state, state.selectedVillagerId, cell.x, cell.y)) persist();
    renderHud();
    return;
  }

  const villagerId = village.pickVillager(e.clientX, e.clientY);
  if (villagerId) {
    state.selectedVillagerId = villagerId;
    state.selectedBuildingId = null;
    state.selectedBuild = null;
    state.assignWorkplace = false;
    state.buildRotation = 0;
    village.setGhost(null, null);
    const v = state.villagers.find((x) => x.id === villagerId);
    flash(state, `${v?.name ?? "Villager"} — choose their work on the right, or send them somewhere.`, 4);
    renderHud();
    return;
  }

  const pickedId = village.pickBuilding(e.clientX, e.clientY);
  if (pickedId) {
    state.selectedBuildingId = pickedId;
    state.selectedVillagerId = null;
    state.assignWorkplace = false;
    state.selectedBuild = null;
    state.buildRotation = 0;
    village.setGhost(null, null);
    const picked = state.buildings.find((b) => b.id === pickedId);
    if (picked?.type === "barracks") {
      flash(state, "Training camp open — drill recruits on the right.", 3);
    }
    renderHud();
    return;
  }

  if (!cell) return;
  const existing = state.buildings.find((b) => b.x === cell.x && b.y === cell.y);
  if (existing) {
    state.selectedBuildingId = existing.id;
    state.selectedVillagerId = null;
    state.assignWorkplace = false;
    state.selectedBuild = null;
    village.setGhost(null, null);
    if (existing.type === "barracks") {
      flash(state, "Training camp open — drill recruits on the right.", 3);
    }
    renderHud();
    return;
  }
  state.selectedBuildingId = null;
  state.selectedVillagerId = null;
  state.assignWorkplace = false;
  if (state.selectedBuild) {
    if (placeBuilding(state, state.selectedBuild, cell.x, cell.y)) persist();
  }
  renderHud();
});

worldCanvas.addEventListener("click", (e) => {
  if (state.mode !== "world") return;
  const site = worldSiteFromPointer(worldCanvas, state, e.clientX, e.clientY);
  if (site) {
    state.selectedCityId = null;
    state.selectedSiteId = site.id;
    hudDirty = true;
    return;
  }
  const city = worldCityFromPointer(worldCanvas, state, e.clientX, e.clientY);
  if (city) {
    state.selectedSiteId = null;
    state.selectedCityId = city.id;
    hudDirty = true;
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && state.mode === "battle") {
    e.preventDefault();
    state.paused = !state.paused;
    hudDirty = true;
    return;
  }
  if (state.mode === "battle" && state.battle?.outcome === "ongoing") {
    if (e.shiftKey && (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3")) {
      setBattleSpeed(state, Number(e.code.replace("Digit", "")));
      hudDirty = true;
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "a") {
      selectAllBattleUnits(state);
      hudDirty = true;
      return;
    }
    if (k === "h") {
      issueHoldOrder(state);
      hudDirty = true;
      return;
    }
    if (k === "r") {
      issueAttackOrder(state);
      hudDirty = true;
      return;
    }
    if (k === "1") {
      selectBattleByType(state, "infantry");
      hudDirty = true;
      return;
    }
    if (k === "2") {
      selectBattleByType(state, "archers");
      hudDirty = true;
      return;
    }
    if (k === "3") {
      selectBattleByType(state, "cavalry");
      hudDirty = true;
      return;
    }
    if (k === "4") {
      selectBattleByType(state, "hero");
      hudDirty = true;
      return;
    }
    if (k === "q") {
      useHeroSkill(state);
      hudDirty = true;
      return;
    }
    if (k === "l") {
      setFormation(state, "line");
      hudDirty = true;
      return;
    }
    if (k === "v") {
      setFormation(state, "wedge");
      hudDirty = true;
      return;
    }
    if (k === "b") {
      setFormation(state, "block");
      hudDirty = true;
      return;
    }
    if (k === "c") {
      setFormation(state, "circle");
      hudDirty = true;
      return;
    }
  }
  if (e.key === "Escape") {
    state.selectedBuild = null;
    state.selectedVillagerId = null;
    state.assignWorkplace = false;
    state.buildRotation = 0;
    village.setGhost(null, null);
    if (state.battle) {
      state.battle.selectedIds = [];
      hudDirty = true;
    }
    hudDirty = true;
  }
  if (state.mode === "village" && e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) {
    if (state.selectedBuild) {
      rotateBuildPreview(state);
      if (lastGhostCell) {
        village.setGhost(state.selectedBuild, lastGhostCell, state.buildRotation);
      }
      hudDirty = true;
      return;
    }
    if (state.selectedBuildingId) {
      rotateBuilding(state, state.selectedBuildingId);
      persist();
      hudDirty = true;
    }
  }
});

function fmt(n: number): string {
  return Math.floor(n).toLocaleString();
}

function costLabel(type: BuildingType, level = 1): string {
  const def = BUILDINGS[type];
  const c = scaleCost(def.baseCost, level, def.costGrowth);
  return `${c.wood}w ${c.stone}s ${c.food}f ${c.gold}g`;
}

function showStage(): void {
  const isWorld = state.mode === "world";
  canvas.classList.toggle("hidden", isWorld);
  worldCanvas.classList.toggle("hidden", !isWorld);
  document.querySelector("#nav-village")!.classList.toggle("active", state.mode === "village");
  document.querySelector("#nav-world")!.classList.toggle("active", state.mode === "world");
}

function chapterLabel(step: number): string {
  if (step <= 0) return "Chapter 1 · Raise farms";
  if (step === 1) return "Chapter 1 · Build a Barracks";
  if (step === 2) return "Chapter 1 · Survive a raid";
  return "Chapter 2 · March the World Map";
}

function renderResources(): void {
  const r = state.resources;
  const p = productionPerSecond(state);
  const upkeep = upkeepPerSecond(state);
  const netFood = p.food - upkeep;
  const foodClass = netFood < 0 || r.food < 25 ? "drain" : "";
  resourcesEl.innerHTML = `
    <div class="res wood"><b>Wood</b>${fmt(r.wood)}<small>+${p.wood.toFixed(1)}/s</small></div>
    <div class="res stone"><b>Stone</b>${fmt(r.stone)}<small>+${p.stone.toFixed(1)}/s</small></div>
    <div class="res food"><b>Food</b>${fmt(r.food)}<small class="${foodClass}">${netFood >= 0 ? "+" : ""}${netFood.toFixed(1)}/s</small></div>
    <div class="res gold"><b>Gold</b>${fmt(r.gold)}<small>+${p.gold.toFixed(1)}/s</small></div>
  `;
  dayPill.textContent = `Day ${Math.floor(state.day)} · Keep L${keepLevel(state)}`;
  if (state.mode === "battle") {
    raidPill.textContent = state.paused
      ? "PAUSED"
      : `BATTLE ${state.battle?.battleSpeed ?? 1}x`;
  } else if (state.mode === "world") {
    raidPill.textContent = "TIME PAUSED";
  } else {
    raidPill.textContent = `Raid ${Math.max(0, Math.ceil(state.timeToRaid))}s`;
  }
  const chapterBtn = document.querySelector("#chapter-btn");
  if (chapterBtn) chapterBtn.textContent = chapterLabel(state.tutorialStep);
}

function troopStatLine(type: TroopType, level: number): string {
  const variant = troopVariantForLevel(type, level);
  const base = TROOP_STATS[type];
  const vm = variantModifiers(variant);
  return `${variantLabel(variant)} · ${Math.round(base.hp * vm.hpMult)} HP · ${Math.round(base.atk * vm.atkMult)} ATK`;
}

function wireTrainingCamp(camp: Building): void {
  const bl = camp.level;
  const trainBox = rightPanel.querySelector("#train-box")!;
  (["infantry", "archers", "cavalry"] as TroopType[]).forEach((t) => {
    const c = trainCostFor(state, t);
    const next = nextVariantUnlock(t, bl);
    const row = document.createElement("div");
    row.className = "train-row";
    row.innerHTML = `<div class="train-row-main"><span>${variantLabel(troopVariantForLevel(t, bl))}</span><small>${c.food}f ${c.gold}g</small><button>+1</button></div>${next ? `<small class="hint">${next}</small>` : ""}`;
    row.querySelector("button")!.addEventListener("click", () => {
      if (trainTroop(state, t, 1)) persist();
      renderHud();
    });
    trainBox.appendChild(row);
  });

  const garBox = rightPanel.querySelector("#garrison-box")!;
  (["infantry", "archers", "cavalry"] as TroopType[]).forEach((t) => {
    const row = document.createElement("div");
    row.className = "train-row";
    row.innerHTML = `
      <span>${t}</span>
      <input type="range" min="0" max="${state.troops[t]}" value="${state.garrison[t]}" />
      <span id="g-${t}">${state.garrison[t]}</span>`;
    const input = row.querySelector("input")!;
    input.addEventListener("input", () => {
      setGarrison(state, t, Number(input.value));
      row.querySelector(`#g-${t}`)!.textContent = String(state.garrison[t]);
      persist();
      hudDirty = true;
    });
    garBox.appendChild(row);
  });
}

function renderHud(): void {
  renderResources();
  showStage();
  messageEl.textContent = state.message;
  messageEl.classList.toggle("hidden", !state.message);
  messageEl.classList.toggle(
    "warn",
    /raid|fallen|driven|starvation|food/i.test(state.message) || state.defeat,
  );

  if (state.mode === "battle") {
    const battle = state.battle;
    const sel = battle?.selectedIds.length ?? 0;
    const enemies =
      battle?.units.filter((u) => u.side === "enemy" && u.hp > 0).length ?? 0;
    const visible =
      battle?.visibleEnemyIds.length ?? 0;
    const avgMorale =
      battle && sel > 0
        ? Math.round(
            battle.units
              .filter((u) => battle.selectedIds.includes(u.id))
              .reduce((s, u) => s + (u.morale ?? 100), 0) / Math.max(1, sel),
          )
        : null;
    leftPanel.innerHTML = `
      <h2>Battle commands</h2>
      <p class="hint">${battle?.waveLabel ?? "Raid"}</p>
      <div class="stat-row"><span>Selected</span><span>${sel} units</span></div>
      <div class="stat-row"><span>Enemies</span><span>${visible}/${enemies} spotted</span></div>
      <div class="stat-row"><span>Keep</span><span>${fmt(state.keepHp)}/${fmt(state.keepMaxHp)}</span></div>
      <div class="stat-row"><span>Formation</span><span>${battle?.formation ?? "line"}</span></div>
      ${avgMorale != null ? `<div class="stat-row"><span>Morale</span><span>${avgMorale}</span></div>` : ""}
      <p class="hint">Drag to box-select. Flank for bonus damage. Forest slows cavalry; hills extend archer range.</p>
      <div class="build-grid" id="battle-cmds"></div>
    `;
    const cmds = leftPanel.querySelector("#battle-cmds")!;
    const addCmd = (label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", () => {
        fn();
        hudDirty = true;
        renderHud();
      });
      cmds.appendChild(b);
    };
    addCmd("All (A)", () => selectAllBattleUnits(state));
    addCmd("Inf (1)", () => selectBattleByType(state, "infantry"));
    addCmd("Arc (2)", () => selectBattleByType(state, "archers"));
    addCmd("Cav (3)", () => selectBattleByType(state, "cavalry"));
    addCmd("Hero (4)", () => selectBattleByType(state, "hero"));
    addCmd("Hold (H)", () => issueHoldOrder(state));
    addCmd("Attack (R)", () => issueAttackOrder(state));
    addCmd("Line (L)", () => setFormation(state, "line"));
    addCmd("Wedge (V)", () => setFormation(state, "wedge"));
    addCmd("Block (B)", () => setFormation(state, "block"));
    addCmd("Circle (C)", () => setFormation(state, "circle"));
    addCmd(
      `Ironwall (Q)${state.hero.skillCooldown > 0 ? ` ${Math.ceil(state.hero.skillCooldown)}s` : ""}`,
      () => useHeroSkill(state),
    );
  } else if (state.mode === "world") {
    const wall = totalTroops(state.garrison);
    const march = totalTroops(fieldArmy(state));
    leftPanel.innerHTML = `
      <h2>The Marches</h2>
      <p class="hint">Blue = trade cities. Colored camps = war. Economy &amp; raid timer pause here.</p>
      <div class="stat-row"><span>Wall (garrison)</span><span>${wall}</span></div>
      <div class="stat-row"><span>March (field)</span><span>${march}${march < 4 ? " · need 4+" : ""}</span></div>
      <div class="stat-row"><span>Cities</span><span>${state.cities.length}</span></div>
      <div class="stat-row"><span>Camps</span><span>${state.sites.filter((s) => !s.cleared).length} hostile</span></div>
      <div class="build-grid" id="city-list"></div>
    `;
    const list = leftPanel.querySelector("#city-list")!;
    for (const city of state.cities) {
      const btn = document.createElement("button");
      btn.className = state.selectedCityId === city.id ? "active" : "";
      btn.innerHTML = `<strong>${city.name}</strong><small>${city.hasPort ? "Port market" : "Open market"}</small>`;
      btn.addEventListener("click", () => {
        state.selectedCityId = city.id;
        state.selectedSiteId = null;
        hudDirty = true;
        renderHud();
      });
      list.appendChild(btn);
    }
  } else {
    leftPanel.innerHTML = `
    <h2>Build</h2>
    <p>Roads · forests · mountains · mines on peaks · bridges or boats to cross rivers.</p>
    <div class="build-grid" id="build-grid"></div>
    <h2>Selected</h2>
    <div id="selected-box"></div>
  `;
  }

  if (state.mode === "village") {
  const grid = leftPanel.querySelector("#build-grid")!;
  for (const type of PLACEABLE) {
    const def = BUILDINGS[type];
    const locked = keepLevel(state) < def.keepRequired;
    const btn = document.createElement("button");
    btn.className = state.selectedBuild === type ? "active" : "";
    btn.disabled = locked;
    btn.innerHTML = `<strong>${def.name}</strong><small>${locked ? `Needs Keep ${def.keepRequired}` : costLabel(type)}</small>`;
    btn.addEventListener("click", () => {
      state.selectedBuild = type;
      state.selectedBuildingId = null;
      state.buildRotation = 0;
      village.setGhost(type, null, 0);
      hudDirty = true;
      renderHud();
    });
    grid.appendChild(btn);
  }

  const selectedBox = leftPanel.querySelector("#selected-box")!;
  const selected = state.buildings.find((b) => b.id === state.selectedBuildingId);
  if (selected) {
    const def = BUILDINGS[selected.type];
    const nextCost =
      selected.level < def.maxLevel ? costLabel(selected.type, selected.level + 1) : "Maxed";
    const fieldNote =
      selected.type === "farm"
        ? `<p class="hint">Fields: ${selected.fields?.length ?? 0} plots (more food).</p>`
        : "";
    if (selected.type === "barracks") {
      selectedBox.innerHTML = `
      <div class="stat-row"><span>Training Camp</span><span>Lv ${selected.level}</span></div>
      <p>${def.description}</p>
      <p class="hint">Troop roster and drills are on the right panel.</p>
      <p class="hint">Facing: ${(selected.rotation ?? 0) * 90}° · Next upgrade: ${nextCost}</p>
      <button class="primary" id="upgrade-btn">Upgrade camp</button>
      <button id="rotate-btn">Rotate (R)</button>
    `;
    } else {
    selectedBox.innerHTML = `
      <div class="stat-row"><span>${def.name}</span><span>Lv ${selected.level}</span></div>
      <p>${def.description}</p>
      ${fieldNote}
      <p class="hint">Facing: ${(selected.rotation ?? 0) * 90}° · Next: ${nextCost}</p>
      <button class="primary" id="upgrade-btn">Upgrade</button>
      <button id="rotate-btn">Rotate (R)</button>
    `;
    }
    selectedBox.querySelector("#upgrade-btn")?.addEventListener("click", () => {
      if (upgradeBuilding(state, selected.id)) persist();
      hudDirty = true;
      renderHud();
    });
    selectedBox.querySelector("#rotate-btn")?.addEventListener("click", () => {
      if (rotateBuilding(state, selected.id)) persist();
      hudDirty = true;
      renderHud();
    });
  } else {
    selectedBox.innerHTML = `<p class="hint">Click a building in the village to upgrade.</p>`;
  }
  }

  if (state.mode === "battle") {
    const bl = barracksLevel(state);
    rightPanel.innerHTML = `
      <h2>Field report</h2>
      <p class="hint">Shift+1/2/3 battle speed · Fog fully hides unspotted foes</p>
      <div class="stat-row"><span>Infantry</span><span>${state.garrison.infantry} · ${variantLabel(troopVariantForLevel("infantry", bl))}</span></div>
      <div class="stat-row"><span>Archers</span><span>${state.garrison.archers} · ${variantLabel(troopVariantForLevel("archers", bl))}</span></div>
      <div class="stat-row"><span>Cavalry</span><span>${state.garrison.cavalry} · ${variantLabel(troopVariantForLevel("cavalry", bl))}</span></div>
      <div class="stat-row"><span>Hero</span><span>${state.hero.name}</span></div>
      <div class="stat-row"><span>Casualties</span><span>${state.battle?.casualties.infantry ?? 0}i ${state.battle?.casualties.archers ?? 0}a ${state.battle?.casualties.cavalry ?? 0}c</span></div>
      <p class="hint">${state.hero.skillDesc}</p>
    `;
  } else if (state.mode === "world") {
    const site = selectedSite(state);
    const city = selectedCity(state);
    if (site) {
      const preview = previewExpedition(state, site);
      const odds = !preview.unlocked
        ? "Locked — clear earlier camps first"
        : preview.fieldTotal < 4
          ? "Need 4+ field troops (lower garrison)"
          : preview.likelyWin
            ? "Favorable odds"
            : "Risky — expect defeat";
      rightPanel.innerHTML = `
        <h2>${site.name}</h2>
        <p class="hint">${odds}</p>
        <div class="stat-row"><span>Enemy power</span><span>${preview.sitePower}</span></div>
        <div class="stat-row"><span>Your march power</span><span>${preview.effective}</span></div>
        <div class="stat-row"><span>Enemy mix</span><span>${preview.composition.infantry}i ${preview.composition.archers}a ${preview.composition.cavalry}c</span></div>
        <div class="stat-row"><span>Field troops</span><span>${preview.fieldTotal}</span></div>
        <div class="stat-row"><span>Est. losses</span><span>~${Math.round(preview.lossPct * (preview.likelyWin ? 30 : 65))}%</span></div>
        <p class="hint">Reward: ${site.reward.wood}w ${site.reward.stone}s ${site.reward.food}f ${site.reward.gold}g</p>
        <button class="primary" id="march-btn" ${preview.canMarch ? "" : "disabled"}>Confirm march</button>
        <button id="cancel-march-btn">Cancel</button>
      `;
      rightPanel.querySelector("#march-btn")?.addEventListener("click", () => {
        resolveExpedition(state, site);
        persist();
        hudDirty = true;
        renderHud();
      });
      rightPanel.querySelector("#cancel-march-btn")?.addEventListener("click", () => {
        state.selectedSiteId = null;
        hudDirty = true;
        renderHud();
      });
    } else if (city) {
      const portTag = city.hasPort ? " · Port city" : "";
      const specials = city.exports?.length
        ? `<p class="hint">Exports: ${city.exports.join(", ")} · Imports: ${city.imports?.join(", ") ?? "—"}</p>`
        : "";
      const sailBonus = city.hasPort
        ? `<p class="hint">Sail trade: +8% sell price, −8% buy price (applied).</p>`
        : "";
      rightPanel.innerHTML = `
        <h2>${city.name} Market${portTag}</h2>
        <p class="hint">Village Markets improve prices further.</p>
        ${specials}
        ${sailBonus}
        <div class="stat-row"><span>Your gold</span><span>${fmt(state.resources.gold)}</span></div>
        <div id="trade-box"></div>
      `;
      const box = rightPanel.querySelector("#trade-box")!;
      (["wood", "stone", "food"] as ResourceId[]).forEach((res) => {
        const prices = tradeUnitPrices(state, city, res);
        const row = document.createElement("div");
        row.className = "train-row";
        row.innerHTML = `
          <div class="train-row-main">
            <span>${res}</span>
            <small>Stock ${city.stock[res]} · buy ${prices.buy}g · sell ${prices.sell}g</small>
          </div>
          <div class="train-row-main">
            <button data-act="buy">Buy 10</button>
            <button data-act="sell">Sell 10</button>
          </div>`;
        row.querySelector('[data-act="buy"]')!.addEventListener("click", () => {
          if (tradeBuy(state, city.id, res, 10)) persist();
          hudDirty = true;
          renderHud();
        });
        row.querySelector('[data-act="sell"]')!.addEventListener("click", () => {
          if (tradeSell(state, city.id, res, 10)) persist();
          hudDirty = true;
          renderHud();
        });
        box.appendChild(row);
      });
    } else {
      rightPanel.innerHTML = `
        <h2>Trade &amp; war</h2>
        <p class="hint">Click a blue city to trade, or a camp to preview a march.</p>
        <p class="hint">Ports give better buy/sell prices. Garrison never leaves the village.</p>
        <div class="stat-row"><span>Wall</span><span>${totalTroops(state.garrison)}</span></div>
        <div class="stat-row"><span>March</span><span>${totalTroops(fieldArmy(state))}</span></div>
      `;
    }
  } else {
  const villager = selectedVillager(state);
  if (villager) {
    const jobs: VillagerJob[] = [
      "woodcutter",
      "farmer",
      "quarryman",
      "miner",
      "trader",
      "idle",
    ];
    rightPanel.innerHTML = `
      <h2>${villager.name}</h2>
      <p class="hint">${villager.phase === "work" ? "Working…" : "Walking…"} · ${JOB_LABELS[villager.job]}</p>
      <p class="hint">${JOB_HINTS[villager.job]}</p>
      <div class="stat-row"><span>Yield</span><span>${villagerJobYieldLabel(villager.job)}</span></div>
      <h2>Assign work</h2>
      <div class="job-grid" id="job-grid"></div>
      <button class="primary" id="send-workplace-btn">${
        state.assignWorkplace ? "Click the map for their workplace…" : "Send to a place…"
      }</button>
      <button id="clear-vil-btn">Deselect</button>
      <p class="hint">Townsfolk walk the village and haul resources when they finish a task.</p>
    `;
    const grid = rightPanel.querySelector("#job-grid")!;
    for (const job of jobs) {
      const btn = document.createElement("button");
      btn.className = villager.job === job ? "active" : "";
      btn.innerHTML = `<strong>${JOB_LABELS[job]}</strong><small>${villagerJobYieldLabel(job)}</small>`;
      btn.addEventListener("click", () => {
        setVillagerJob(state, villager.id, job);
        state.assignWorkplace = false;
        persist();
        hudDirty = true;
        renderHud();
      });
      grid.appendChild(btn);
    }
    rightPanel.querySelector("#send-workplace-btn")?.addEventListener("click", () => {
      state.assignWorkplace = !state.assignWorkplace;
      flash(
        state,
        state.assignWorkplace
          ? `Click forest, farm, quarry, mine, or market for ${villager.name}.`
          : "Workplace pick cancelled.",
        3,
      );
      renderHud();
    });
    rightPanel.querySelector("#clear-vil-btn")?.addEventListener("click", () => {
      state.selectedVillagerId = null;
      state.assignWorkplace = false;
      renderHud();
    });
  } else {
  const camp = selectedBarracks(state);
  const repair = repairKeepCost(state);
  const repairLabel =
    state.keepHp >= state.keepMaxHp
      ? `Keep intact (${fmt(state.keepHp)}/${fmt(state.keepMaxHp)})`
      : `Repair Keep (${repair.wood}w ${repair.stone}s ${repair.gold}g)`;
  if (camp) {
    const bl = camp.level;
    rightPanel.innerHTML = `
      <h2>Training Camp</h2>
      <p class="hint">Barracks Lv ${bl} · Wall troops fight raids; March troops claim camps</p>
      <div class="stat-row"><span>Infantry</span><span>${state.troops.infantry} (${state.garrison.infantry} wall)</span></div>
      <div class="stat-row"><span>Archers</span><span>${state.troops.archers} (${state.garrison.archers} wall)</span></div>
      <div class="stat-row"><span>Cavalry</span><span>${state.troops.cavalry} (${state.garrison.cavalry} wall)</span></div>
      <div class="stat-row"><span>Wall / March</span><span>${totalTroops(state.garrison)} / ${totalTroops(fieldArmy(state))}</span></div>
      <p class="hint">${troopStatLine("infantry", bl)}</p>
      <p class="hint">${troopStatLine("archers", bl)}</p>
      <p class="hint">${troopStatLine("cavalry", bl)}</p>
      <h2>Drill recruits</h2>
      <div id="train-box"></div>
      <h2>Garrison (wall)</h2>
      <p class="hint">Sliders assign defenders. Remaining troops form the field army.</p>
      <div id="garrison-box"></div>
      <button id="repair-btn">${repairLabel}</button>
    `;
    wireTrainingCamp(camp);
  } else {
    rightPanel.innerHTML = `
      <h2>Realm</h2>
      <p>${state.hero.name} · Lv ${state.hero.level}</p>
      <div class="stat-row"><span>Total levies</span><span>${totalTroops(state.troops)}</span></div>
      <div class="stat-row"><span>Wall (garrison)</span><span>${totalTroops(state.garrison)}</span></div>
      <div class="stat-row"><span>March (field)</span><span>${totalTroops(fieldArmy(state))}</span></div>
      <div class="stat-row"><span>Townsfolk</span><span>${state.villagers.length}</span></div>
      <p class="hint">Click a person in the village to set their job. Barracks drills troops.</p>
      <button id="repair-btn">${repairLabel}</button>
    `;
  }

  rightPanel.querySelector("#repair-btn")?.addEventListener("click", () => {
    repairKeep(state);
    persist();
    renderHud();
  });
  }
  }

  toolbar.innerHTML = "";
  if (state.mode === "village") {
    const garrisons = totalTroops(state.garrison);
    const raidBtn = document.createElement("button");
    raidBtn.className = "primary";
    raidBtn.textContent = `Call Raid Now · ${garrisons} defenders`;
    raidBtn.addEventListener("click", () => {
      if (garrisons < 3) {
        flash(state, "Garrison is thin — assign more wall troops at the Barracks first.", 4);
        renderHud();
        return;
      }
      if (!window.confirm(`Call a raid now with ${garrisons} garrison defenders?`)) return;
      startRaid(state);
      renderHud();
    });
    toolbar.appendChild(raidBtn);
  }

  if (state.mode === "battle") {
    const pause = document.createElement("button");
    pause.textContent = state.paused ? "Resume (Space)" : "Pause (Space)";
    pause.addEventListener("click", () => {
      state.paused = !state.paused;
      renderHud();
    });
    toolbar.appendChild(pause);

    for (const speed of [1, 2, 3] as const) {
      const btn = document.createElement("button");
      btn.textContent = `${speed}x`;
      btn.className = state.battle?.battleSpeed === speed ? "active" : "";
      btn.addEventListener("click", () => {
        setBattleSpeed(state, speed);
        renderHud();
      });
      toolbar.appendChild(btn);
    }
  }

  if (state.mode === "battle" && state.battle && state.battle.outcome !== "ongoing") {
    const done = document.createElement("button");
    done.className = "primary";
    done.textContent = state.battle.outcome === "won" ? "Return to Village" : "Accept Fate";
    done.addEventListener("click", () => {
      finishBattleReturn(state);
      persist();
      renderHud();
    });
    toolbar.appendChild(done);
  }

  if (state.victory || state.defeat) {
    persist();
    ending.classList.remove("hidden");
    const title = document.querySelector("#end-title")!;
    const body = document.querySelector("#end-body")!;
    if (state.victory) {
      title.textContent = "The Marches are yours";
      body.textContent =
        "Every hostile camp bows to Holdfast. Your Keep stands and the Border Marches finally have a ruler.";
    } else {
      title.textContent = "The Keep has fallen";
      body.textContent =
        "Raiders broke your walls. Rebuild, garrison deeper, and claim the throne again.";
    }
  }

  hudDirty = false;
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.mode !== "intro" && !state.defeat && !state.victory) {
    if (state.mode === "village") tickEconomy(state, dt);
    if (state.mode === "battle") tickBattle(state, dt);
  }

  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    if (state.messageTimer <= 0) state.message = "";
  }

  saveTimer += dt;
  if (saveTimer >= SAVE_EVERY && state.mode !== "intro") {
    saveTimer = 0;
    persist();
  }

  if (state.mode === "world") {
    drawWorld(worldCtx, state);
  } else {
    village.render(state, dt);
  }

  if (hudDirty || Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) {
    renderResources();
    messageEl.textContent = state.message;
    messageEl.classList.toggle("hidden", !state.message);
    if (state.mode === "battle") {
      renderHud();
    } else if (hudDirty) {
      renderHud();
    }
  }

  requestAnimationFrame(frame);
}

village.resize();
if (lastSavedLabel()) {
  const pill = document.querySelector("#save-pill");
  if (pill) pill.textContent = `Last: ${lastSavedLabel()}`;
}
renderHud();
requestAnimationFrame(frame);
