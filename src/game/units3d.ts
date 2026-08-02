import * as THREE from "three";
import { CELL, TILE } from "./config";
import type { BattleUnit, TroopType, Villager, VillagerJob } from "./types";

function mat(color: string, opts?: { rough?: number; emissive?: string; emInt?: number }) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.rough ?? 0.75,
    metalness: 0.08,
    emissive: opts?.emissive ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts?.emInt ?? 0,
  });
}

function mesh(
  geo: THREE.BufferGeometry,
  color: string,
  y: number,
  opts?: Parameters<typeof mat>[1],
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function skinTone(side: "player" | "enemy"): string {
  return side === "player" ? "#e0b892" : "#c4a07a";
}

function tunicColor(unit: BattleUnit): string {
  if (unit.kind === "hero") return "#3a6ea5";
  if (unit.kind === "beast") return "#5a3a6a";
  if (unit.side === "enemy") {
    return unit.troopType === "archers"
      ? "#6a3a3a"
      : unit.troopType === "cavalry"
        ? "#5a2e2e"
        : "#7a4040";
  }
  if (unit.troopType === "archers") return "#3d6b45";
  if (unit.troopType === "cavalry") return "#8a6a28";
  return "#3a4f8a";
}

function addLimb(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  color: string,
  x: number,
  y: number,
  z: number,
  rotZ = 0,
): THREE.Mesh {
  const limb = mesh(new THREE.BoxGeometry(w, h, d), color, 0);
  limb.position.set(x, y, z);
  limb.rotation.z = rotZ;
  group.add(limb);
  return limb;
}

function buildHumanoid(unit: BattleUnit): THREE.Group {
  const g = new THREE.Group();
  g.name = "unit_person";
  const skin = skinTone(unit.side);
  const cloth = tunicColor(unit);
  const isHero = unit.kind === "hero";
  const troop: TroopType | undefined = unit.troopType;

  // Legs
  addLimb(g, 0.16, 0.42, 0.16, "#3a342e", -0.12, 0.21, 0);
  addLimb(g, 0.16, 0.42, 0.16, "#3a342e", 0.12, 0.21, 0);

  // Torso
  const torsoH = isHero ? 0.55 : 0.48;
  g.add(mesh(new THREE.BoxGeometry(0.42, torsoH, 0.28), cloth, 0.42 + torsoH / 2));

  // Belt
  g.add(mesh(new THREE.BoxGeometry(0.44, 0.08, 0.3), "#5a4030", 0.48));

  // Head
  const head = mesh(new THREE.SphereGeometry(0.16, 10, 8), skin, 0.42 + torsoH + 0.18);
  g.add(head);

  // Hair / helmet
  if (troop === "cavalry" || isHero) {
    const helm = mesh(
      new THREE.SphereGeometry(0.175, 10, 8),
      isHero ? "#d4af37" : "#8a9098",
      0.42 + torsoH + 0.22,
    );
    helm.scale.set(1, 0.7, 1);
    g.add(helm);
  } else {
    const hair = mesh(
      new THREE.SphereGeometry(0.17, 10, 8),
      unit.side === "enemy" ? "#2a1e18" : "#4a3220",
      0.42 + torsoH + 0.24,
    );
    hair.scale.set(1, 0.55, 1);
    g.add(hair);
  }

  // Arms
  addLimb(g, 0.12, 0.38, 0.12, skin, -0.3, 0.7, 0, 0.15);
  addLimb(g, 0.12, 0.38, 0.12, skin, 0.3, 0.7, 0, -0.15);

  // Role props
  if (troop === "archers") {
    // Bow
    const bow = mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 12, Math.PI), "#6b4a2a", 0.75);
    bow.rotation.y = Math.PI / 2;
    bow.rotation.z = Math.PI / 2;
    bow.position.set(0.38, 0.75, 0.05);
    g.add(bow);
  } else if (troop === "cavalry") {
    // Spear
    const spear = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), "#8a6a40", 0.9);
    spear.position.set(0.38, 0.9, 0.1);
    spear.rotation.z = -0.35;
    g.add(spear);
    const tip = mesh(new THREE.ConeGeometry(0.06, 0.16, 6), "#b0b6c0", 0);
    tip.position.set(0.55, 1.45, 0.1);
    g.add(tip);
  } else if (isHero) {
    // Cape
    const cape = mesh(new THREE.BoxGeometry(0.5, 0.7, 0.08), "#8b1e1e", 0.75);
    cape.position.set(0, 0.75, -0.2);
    g.add(cape);
    // Sword
    const blade = mesh(new THREE.BoxGeometry(0.06, 0.7, 0.1), "#cfd5e0", 0.85);
    blade.position.set(0.42, 0.85, 0.12);
    g.add(blade);
    // Crown nub
    const crown = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 6), "#d4af37", 0.42 + torsoH + 0.38);
    g.add(crown);
  } else {
    // Infantry shield + sword
    const shield = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8), "#c9a227", 0.7);
    shield.rotation.z = Math.PI / 2;
    shield.position.set(-0.38, 0.7, 0.12);
    g.add(shield);
    const sword = mesh(new THREE.BoxGeometry(0.06, 0.55, 0.1), "#b8bec8", 0.8);
    sword.position.set(0.4, 0.8, 0.1);
    g.add(sword);
  }

  // Tiny face (eyes)
  const eyeL = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.03), "#1a1a1a", 0.42 + torsoH + 0.2);
  eyeL.position.set(-0.06, 0.42 + torsoH + 0.2, 0.14);
  g.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.06;
  g.add(eyeR);

  return g;
}

function buildBeast(): THREE.Group {
  const g = new THREE.Group();
  g.name = "unit_beast";
  // Body
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.45), "#5a3a6a", 0.45));
  // Head
  g.add(mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), "#6a4a7a", 0.75));
  // Legs
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.12, 0.12]) {
      const leg = mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), "#3a2840", 0.175);
      leg.position.set(x, 0.175, z);
      g.add(leg);
    }
  }
  // Horns
  const hornL = mesh(new THREE.ConeGeometry(0.06, 0.28, 5), "#d4af37", 1.0);
  hornL.position.set(-0.12, 1.0, 0);
  hornL.rotation.z = 0.35;
  g.add(hornL);
  const hornR = hornL.clone();
  hornR.position.x = 0.12;
  hornR.rotation.z = -0.35;
  g.add(hornR);
  const eye = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), "#ff6a3a", 0.8, {
    emissive: "#ff3a00",
    emInt: 0.8,
  });
  eye.position.set(-0.08, 0.8, 0.18);
  g.add(eye);
  const eye2 = eye.clone();
  eye2.position.x = 0.08;
  g.add(eye2);
  return g;
}

function buildCavalryMount(unit: BattleUnit): THREE.Group {
  const g = new THREE.Group();
  // Horse body
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.4, 0.4), "#6b5340", 0.55));
  const neck = mesh(new THREE.BoxGeometry(0.3, 0.28, 0.28), "#6b5340", 0.85);
  neck.position.set(0.45, 0.85, 0);
  g.add(neck);
  // Legs
  for (const x of [-0.28, 0.28]) {
    for (const z of [-0.12, 0.12]) {
      const leg = mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), "#4a3a28", 0.2);
      leg.position.set(x, 0.2, z);
      g.add(leg);
    }
  }
  // Rider (smaller humanoid perched)
  const rider = buildHumanoid({ ...unit, troopType: "infantry", kind: unit.kind === "hero" ? "hero" : "infantry" });
  rider.scale.setScalar(0.72);
  rider.position.y = 0.55;
  // Remove duplicate infantry props clutter — keep simple torso already built
  g.add(rider);
  // Lance
  const lance = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5), "#8a6a40", 1.1);
  lance.position.set(0.35, 1.1, 0.15);
  lance.rotation.z = -0.5;
  g.add(lance);
  return g;
}

function villagerCloth(job: VillagerJob): string {
  if (job === "woodcutter") return "#6b5340";
  if (job === "farmer") return "#5a7a3a";
  if (job === "quarryman") return "#6a6e78";
  if (job === "miner") return "#4a4a52";
  if (job === "trader") return "#6a4a7a";
  if (job === "builder") return "#8a6a28";
  return "#5a6a7a";
}

/** Civilian townsfolk for the village (not combat units) */
export function createVillagerMesh(v: Villager): THREE.Group {
  const fake: BattleUnit = {
    id: v.id,
    side: "player",
    kind: "infantry",
    troopType: "infantry",
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 1,
    atk: 0,
    range: 0,
    speed: 1,
    radius: 0.3,
    cooldown: 0,
    facing: 0,
  };
  const person = buildHumanoid(fake);
  person.userData.villagerId = v.id;
  person.userData.lastX = v.x;
  person.userData.lastZ = v.y;
  person.scale.setScalar(0.85);
  // Tag + recolor tunic (torso box ~0.48 tall)
  person.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.geometry instanceof THREE.BoxGeometry)) return;
    const h = o.geometry.parameters?.height ?? 0;
    if (Math.abs(h - 0.48) < 0.05) {
      o.userData.jobCloth = true;
      if (o.material instanceof THREE.MeshStandardMaterial) {
        o.material.color.set(villagerCloth(v.job));
      }
    }
  });
  // Soft selection ring (toggled in scene)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.48, 20),
    new THREE.MeshBasicMaterial({
      color: "#e8c86a",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.name = "vil_ring";
  ring.visible = false;
  person.add(ring);
  return person;
}

export function updateVillagerMesh(
  mesh: THREE.Group,
  v: Villager,
  selected: boolean,
): void {
  const gx = v.x * TILE;
  const gz = v.y * TILE;
  const prevX = mesh.userData.lastX as number;
  const prevZ = mesh.userData.lastZ as number;
  const dx = v.x - prevX;
  const dz = v.y - prevZ;
  if (Math.abs(dx) + Math.abs(dz) > 0.02) {
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.userData.lastX = v.x;
    mesh.userData.lastZ = v.y;
  }
  const bob =
    v.phase === "build"
      ? Math.abs(Math.sin(v.anim * 1.4)) * 0.08
      : v.phase === "work"
        ? Math.sin(v.anim) * 0.04
        : Math.abs(Math.sin(v.anim)) * 0.06;
  mesh.position.set(gx, bob, gz);
  const ring = mesh.getObjectByName("vil_ring");
  if (ring) ring.visible = selected;
  const cloth = villagerCloth(v.job);
  mesh.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.userData.jobCloth) return;
    if (o.material instanceof THREE.MeshStandardMaterial) o.material.color.set(cloth);
  });
}

export function createUnitMesh(unit: BattleUnit): THREE.Group {
  if (unit.kind === "beast") {
    const beast = buildBeast();
    beast.userData.unitId = unit.id;
    beast.userData.lastX = unit.x;
    beast.userData.lastZ = unit.y;
    return beast;
  }

  if (unit.troopType === "cavalry" && unit.kind !== "hero") {
    const mount = buildCavalryMount(unit);
    mount.userData.unitId = unit.id;
    mount.userData.lastX = unit.x;
    mount.userData.lastZ = unit.y;
    return mount;
  }

  const person = buildHumanoid(unit);
  person.userData.unitId = unit.id;
  person.userData.lastX = unit.x;
  person.userData.lastZ = unit.y;

  // HP bar
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.08),
    new THREE.MeshBasicMaterial({ color: "#222", side: THREE.DoubleSide }),
  );
  barBg.position.set(0, 1.85, 0);
  barBg.name = "hp_bg";
  person.add(barBg);
  const bar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.05),
    new THREE.MeshBasicMaterial({ color: "#6fbf73", side: THREE.DoubleSide }),
  );
  bar.position.set(0, 1.85, 0.01);
  bar.name = "hp_bar";
  person.add(bar);

  return person;
}

export function updateUnitMesh(mesh: THREE.Group, unit: BattleUnit): void {
  const gx = (unit.x / CELL) * TILE;
  const gz = (unit.y / CELL) * TILE;
  const prevX = mesh.userData.lastX as number;
  const prevZ = mesh.userData.lastZ as number;
  const dx = unit.x - prevX;
  const dz = unit.y - prevZ;
  if (Math.abs(dx) + Math.abs(dz) > 0.2) {
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.userData.lastX = unit.x;
    mesh.userData.lastZ = unit.y;
  } else if (unit.facing != null) {
    mesh.rotation.y = unit.facing;
  }
  mesh.position.set(gx, unit.embarked ? 0.12 : 0, gz);

  let boat = mesh.getObjectByName("boat_hull") as THREE.Group | undefined;
  if (unit.embarked) {
    if (!boat) {
      boat = new THREE.Group();
      boat.name = "boat_hull";
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.22, 0.55),
        new THREE.MeshStandardMaterial({ color: "#5a4030", roughness: 0.9 }),
      );
      hull.position.y = 0.08;
      boat.add(hull);
      const bow = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.55, 4),
        new THREE.MeshStandardMaterial({ color: "#4a3428", roughness: 0.9 }),
      );
      bow.rotation.z = Math.PI / 2;
      bow.position.set(0.75, 0.1, 0);
      boat.add(bow);
      mesh.add(boat);
    }
    boat.visible = true;
  } else if (boat) {
    boat.visible = false;
  }

  const ratio = Math.max(0, unit.hp / unit.maxHp);
  const bar = mesh.getObjectByName("hp_bar") as THREE.Mesh | undefined;
  if (bar) {
    bar.scale.x = Math.max(0.05, ratio);
    bar.position.x = -0.33 * (1 - ratio);
    const barMat = bar.material as THREE.MeshBasicMaterial;
    barMat.color.set(ratio > 0.4 ? "#6fbf73" : "#d9534f");
  }

  let moraleBar = mesh.getObjectByName("morale_bar") as THREE.Mesh | undefined;
  if (unit.morale != null && unit.side === "player") {
    if (!moraleBar) {
      const barBg = mesh.getObjectByName("hp_bg");
      const barY = barBg ? barBg.position.y - 0.12 : 1.72;
      const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.06),
        new THREE.MeshBasicMaterial({ color: "#222", side: THREE.DoubleSide }),
      );
      bg.position.set(0, barY, 0);
      bg.name = "morale_bg";
      mesh.add(bg);
      moraleBar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.66, 0.04),
        new THREE.MeshBasicMaterial({ color: "#6a8fd4", side: THREE.DoubleSide }),
      );
      moraleBar.position.set(0, barY, 0.01);
      moraleBar.name = "morale_bar";
      mesh.add(moraleBar);
    }
    const mRatio = Math.max(0, (unit.morale ?? 100) / 100);
    moraleBar.scale.x = Math.max(0.05, mRatio);
    moraleBar.position.x = -0.33 * (1 - mRatio);
    const mMat = moraleBar.material as THREE.MeshBasicMaterial;
    if (unit.routing) mMat.color.set("#c45c4a");
    else if (unit.morale! < 30) mMat.color.set("#e0a040");
    else mMat.color.set("#6a8fd4");
  }
}
