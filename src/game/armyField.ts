import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { TILE } from "./config";
import { selectedBarracks } from "./state";
import { createUnitMesh } from "./units3d";
import type { BattleUnit, Building, GameState, TroopType } from "./types";

const MAX_PER_TYPE = 12;

export function musterCamp(state: GameState): Building | undefined {
  return selectedBarracks(state) ?? state.buildings.find((b) => b.type === "barracks");
}

export function musterSignature(state: GameState): string {
  const camp = musterCamp(state);
  if (!camp || state.mode !== "village") return "";
  const t = state.troops;
  const g = state.garrison;
  return `${camp.id}:${camp.x},${camp.y}:${camp.rotation ?? 0}:${t.infantry},${t.archers},${t.cavalry}:${g.infantry},${g.archers},${g.cavalry}:${state.selectedBuildingId ?? ""}`;
}

export function musterAnchor(camp: Building): { x: number; z: number; facing: number } {
  const facing = (camp.rotation ?? 0) * (Math.PI / 2);
  const cx = camp.x * TILE + TILE / 2;
  const cz = camp.y * TILE + TILE / 2;
  const dist = TILE * 2.4;
  return {
    x: cx + Math.sin(facing) * dist,
    z: cz + Math.cos(facing) * dist,
    facing,
  };
}

function paradeUnit(type: TroopType, id: string): BattleUnit {
  return {
    id,
    side: "player",
    kind: type,
    troopType: type,
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    atk: 10,
    range: 40,
    speed: 40,
    radius: 10,
    cooldown: 0,
  };
}

function addCountLabel(group: THREE.Group, x: number, z: number, text: string): void {
  const el = document.createElement("div");
  el.className = "muster-count";
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.position.set(x, 1.2, z);
  group.add(label);
}

export function buildMusterField(
  group: THREE.Group,
  state: GameState,
  camp: Building,
  highlighted: boolean,
): void {
  const anchor = musterAnchor(camp);
  const facing = anchor.facing;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(TILE * 4.2, TILE * 3.2),
    new THREE.MeshStandardMaterial({
      color: highlighted ? "#9a8060" : "#7a6848",
      roughness: 1,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.rotation.z = -facing;
  ground.position.set(anchor.x, 0.045, anchor.z);
  ground.receiveShadow = true;
  group.add(ground);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(TILE * 1.45, TILE * 1.55, 32),
    new THREE.MeshBasicMaterial({
      color: highlighted ? "#c9a227" : "#8a7a50",
      transparent: true,
      opacity: highlighted ? 0.55 : 0.28,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(anchor.x, 0.05, anchor.z);
  group.add(ring);

  for (const corner of [
    [-1.8, -1.3],
    [1.8, -1.3],
    [-1.8, 1.3],
    [1.8, 1.3],
  ]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: "#5a4634", roughness: 0.9 }),
    );
    const lx = corner[0];
    const lz = corner[1];
    const wx = anchor.x + lx * Math.cos(facing) - lz * Math.sin(facing);
    const wz = anchor.z + lx * Math.sin(facing) + lz * Math.cos(facing);
    post.position.set(wx, 0.275, wz);
    post.castShadow = true;
    group.add(post);
  }

  const titleEl = document.createElement("div");
  titleEl.className = "muster-label";
  titleEl.textContent = highlighted ? "Muster Field — your army" : "Muster Field";
  const title = new CSS2DObject(titleEl);
  title.position.set(
    anchor.x - Math.sin(facing) * TILE * 1.35,
    0.35,
    anchor.z - Math.cos(facing) * TILE * 1.35,
  );
  group.add(title);

  const sections: { type: TroopType; row: number; label: string }[] = [
    { type: "infantry", row: -0.9, label: "Infantry" },
    { type: "archers", row: 0, label: "Archers" },
    { type: "cavalry", row: 0.9, label: "Cavalry" },
  ];

  for (const section of sections) {
    const total = state.troops[section.type];
    const garrison = state.garrison[section.type];
    const show = Math.min(total, MAX_PER_TYPE);

    for (let i = 0; i < show; i++) {
      const mesh = createUnitMesh(paradeUnit(section.type, `muster_${section.type}_${i}`));
      mesh.scale.setScalar(section.type === "cavalry" ? 0.62 : 0.72);
      const col = i % 6;
      const depth = Math.floor(i / 6);
      const lx = (col - 2.5) * 0.52;
      const lz = section.row - depth * 0.32;
      const wx = anchor.x + lx * Math.cos(facing) - lz * Math.sin(facing);
      const wz = anchor.z + lx * Math.sin(facing) + lz * Math.cos(facing);
      mesh.position.set(wx, 0, wz);
      mesh.rotation.y = facing + Math.PI;
      mesh.traverse((o) => {
        if (o instanceof THREE.Mesh && o.name === "hp_bg") o.visible = false;
        if (o instanceof THREE.Mesh && o.name === "hp_bar") o.visible = false;
        if (o instanceof THREE.Mesh && o.name === "morale_bg") o.visible = false;
        if (o instanceof THREE.Mesh && o.name === "morale_bar") o.visible = false;
      });
      group.add(mesh);
    }

    if (total > 0) {
      const lx = 1.55;
      const lz = section.row;
      const wx = anchor.x + lx * Math.cos(facing) - lz * Math.sin(facing);
      const wz = anchor.z + lx * Math.sin(facing) + lz * Math.cos(facing);
      const extra = total > MAX_PER_TYPE ? ` (+${total - MAX_PER_TYPE})` : "";
      addCountLabel(group, wx, wz, `${section.label}: ${total}${extra} · ${garrison} on wall`);
    }
  }

  if (totalTroops(state) === 0) {
    addCountLabel(group, anchor.x, anchor.z, "Empty — drill recruits at the camp");
  }
}

function totalTroops(state: GameState): number {
  return state.troops.infantry + state.troops.archers + state.troops.cavalry;
}
