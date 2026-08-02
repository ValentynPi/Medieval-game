import * as THREE from "three";
import type { BuildingType } from "./types";

const mat = (
  color: string,
  opts?: { rough?: number; metal?: number; emissive?: string; emInt?: number },
) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.rough ?? 0.85,
    metalness: opts?.metal ?? 0.05,
    emissive: opts?.emissive ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts?.emInt ?? 0,
  });

function addShadow(mesh: THREE.Mesh): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function box(
  w: number,
  h: number,
  d: number,
  color: string,
  y = h / 2,
  opts?: Parameters<typeof mat>[1],
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.y = y;
  addShadow(m);
  return m;
}

function roof(w: number, h: number, d: number, color: string, y: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(Math.max(w, d) * 0.72, h, 4);
  const m = new THREE.Mesh(geo, mat(color, { rough: 0.95 }));
  m.position.y = y;
  m.rotation.y = Math.PI / 4;
  addShadow(m);
  return m;
}

function windowGlow(x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.35),
    mat("#ffb45a", { emissive: "#ff9a3a", emInt: 1.2, rough: 1 }),
  );
  m.position.set(x, y, z);
  return m;
}

function flag(group: THREE.Group, y: number, color = "#3a6ea5"): void {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), mat("#5a4634"));
  pole.position.y = y + 0.6;
  addShadow(pole);
  group.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.35), mat(color, { rough: 0.7 }));
  cloth.position.set(0.28, y + 1.0, 0);
  cloth.rotation.y = -0.2;
  group.add(cloth);
}

function levelScale(level: number, rate = 0.09): number {
  return 1 + (level - 1) * rate;
}

function tier(level: number): number {
  return Math.min(4, Math.ceil(level / 2));
}

function addCrenellations(
  group: THREE.Group,
  width: number,
  depth: number,
  baseY: number,
  color: string,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const tooth = box(0.16, 0.14, depth, color, baseY + 0.07);
    tooth.position.x = -width / 2 + 0.18 + (i * width) / Math.max(1, count - 1);
    group.add(tooth);
  }
}

function addCornerTower(
  group: THREE.Group,
  x: number,
  z: number,
  height: number,
  wallColor: string,
  roofColor: string,
): void {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, height, 6), mat(wallColor));
  shaft.position.set(x, height / 2, z);
  addShadow(shaft);
  group.add(shaft);
  const cap = roof(0.45, 0.38, 0.45, roofColor, height + 0.15);
  cap.position.set(x, 0, z);
  group.add(cap);
}

function addLogPile(group: THREE.Group, x: number, z: number, rows: number): void {
  for (let r = 0; r < rows; r++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9 + r * 0.08, 6), mat("#5a3d22"));
    log.rotation.z = Math.PI / 2;
    log.position.set(x + r * 0.12, 0.1 + r * 0.08, z);
    addShadow(log);
    group.add(log);
  }
}

export function createBuildingMesh(type: BuildingType, level: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `bld_${type}`;
  const scale = levelScale(level);
  const t = tier(level);
  const grow = levelScale(level, 0.06);

  switch (type) {
    case "keep": {
      const wall = t >= 3 ? "#7a6248" : "#6b5540";
      const trim = t >= 4 ? "#c9a227" : "#5c4634";
      g.add(box(1.6 * grow, 1.1 * grow, 1.6 * grow, wall));
      g.add(box(1.2 * grow, 0.9 * grow, 1.2 * grow, trim, 1.55 * grow));
      g.add(roof(1.8 * grow, 0.85 * grow, 1.8 * grow, t >= 3 ? "#a06830" : "#8a5a32", 2.4 * grow));
      g.add(windowGlow(0, 0.7 * grow, 0.81 * grow));
      g.add(windowGlow(0.4 * grow, 1.5 * grow, 0.61 * grow));
      g.add(windowGlow(-0.35 * grow, 1.5 * grow, 0.61 * grow));
      if (level >= 2) g.add(windowGlow(-0.4 * grow, 0.7 * grow, 0.81 * grow));
      if (level >= 4) {
        g.add(box(1.0 * grow, 0.55 * grow, 1.0 * grow, trim, 2.05 * grow));
        g.add(roof(1.2 * grow, 0.55 * grow, 1.2 * grow, "#8a5a32", 2.65 * grow));
      }
      if (level >= 3) {
        addCornerTower(g, -0.95 * grow, -0.95 * grow, 1.1 * grow, wall, "#8a5a32");
        addCornerTower(g, 0.95 * grow, -0.95 * grow, 1.1 * grow, wall, "#8a5a32");
      }
      if (level >= 5) {
        addCornerTower(g, -0.95 * grow, 0.95 * grow, 1.25 * grow, wall, "#8a5a32");
        addCornerTower(g, 0.95 * grow, 0.95 * grow, 1.25 * grow, wall, "#8a5a32");
        const ring = box(2.3 * grow, 0.35 * grow, 2.3 * grow, "#5a5040", 0.175 * grow);
        g.add(ring);
      }
      if (level >= 6) addCrenellations(g, 2.0 * grow, 0.25 * grow, 0.35 * grow, "#6b5540", 7);
      flag(g, 2.5 * grow, t >= 4 ? "#c9a227" : "#3a6ea5");
      if (level >= 7) flag(g, 2.2 * grow, "#8b1e1e");
      const porch = box(0.7 * grow, 0.55 * grow, 0.45 * grow, wall, 0.275 * grow);
      porch.position.z = 1.0 * grow;
      g.add(porch);
      const keepLight = new THREE.PointLight("#ffb060", 0.9 + level * 0.15, 7, 2);
      keepLight.position.set(0, 1.8 * grow, 0.8 * grow);
      g.add(keepLight);
      break;
    }
    case "farm": {
      g.add(box(1.3 * grow, 0.75 * grow, 1.1 * grow, "#7a6248"));
      g.add(roof(1.5 * grow, 0.7 * grow, 1.3 * grow, "#c4a35a", 1.15 * grow));
      g.add(windowGlow(0, 0.55 * grow, 0.56 * grow));
      const towerH = 1.4 + level * 0.18;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, towerH, 8), mat("#8a7355"));
      tower.position.set(0.95 * grow, towerH / 2, -0.2 * grow);
      addShadow(tower);
      g.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.45, 8), mat("#9a6b3a"));
      cap.position.set(0.95 * grow, towerH + 0.2, -0.2 * grow);
      addShadow(cap);
      g.add(cap);
      const blades = new THREE.Group();
      blades.name = "mill_blades";
      const bladeCount = 4 + Math.min(2, Math.floor(level / 3));
      for (let i = 0; i < bladeCount; i++) {
        const blade = box(0.12, 0.75 + level * 0.05, 0.08, "#d9c29a", 0);
        blade.position.y = 0.35;
        const arm = new THREE.Group();
        arm.rotation.z = (i * Math.PI * 2) / bladeCount;
        arm.add(blade);
        blades.add(arm);
      }
      blades.position.set(0.95 * grow, towerH - 0.15, 0.15 * grow);
      g.add(blades);
      const cropCount = 4 + level * 2;
      for (let i = 0; i < cropCount; i++) {
        const crop = box(0.25, 0.15 + level * 0.02, 0.25, i % 2 ? "#6f9a3c" : "#8aaf4a", 0.1);
        crop.position.set(-0.95 * grow + (i % 4) * 0.35, 0, 0.55 * grow + Math.floor(i / 4) * 0.35);
        g.add(crop);
      }
      if (level >= 3) {
        const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9 + level * 0.08, 8), mat("#9a8a70"));
        silo.position.set(-0.85 * grow, 0.45, -0.55 * grow);
        addShadow(silo);
        g.add(silo);
      }
      break;
    }
    case "lumber": {
      g.add(box(1.2 * grow, 0.7 * grow, 1.0 * grow, "#6a4e32"));
      g.add(roof(1.4 * grow, 0.55 * grow, 1.2 * grow, "#4a6b3a", 1.05 * grow));
      addLogPile(g, 0, 0.7 * grow, 1 + Math.min(3, level - 1));
      if (level >= 2) addLogPile(g, -0.55 * grow, 0.55 * grow, 1 + Math.floor(level / 2));
      if (level >= 4) {
        const crane = box(0.12, 1.1 + level * 0.08, 0.12, "#4a3a28", 0.55);
        crane.position.set(0.75 * grow, 0, 0.35 * grow);
        g.add(crane);
        const arm = box(0.12, 0.12, 0.9, "#4a3a28", 0.85);
        arm.position.set(0.75 * grow, 1.0 + level * 0.05, 0.75 * grow);
        g.add(arm);
      }
      break;
    }
    case "quarry": {
      const pitDepth = 0.35 + level * 0.06;
      g.add(box(1.1 * grow, 0.5 * grow, 1.1 * grow, "#7d7f86"));
      const rockCount = 3 + level;
      for (let i = 0; i < rockCount; i++) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.07 + level * 0.02, 0),
          mat(i % 2 ? "#9aa0a8" : "#8a9098", { rough: 1 }),
        );
        rock.position.set(-0.45 * grow + (i % 4) * 0.28, pitDepth, -0.25 * grow + Math.floor(i / 4) * 0.35);
        addShadow(rock);
        g.add(rock);
      }
      if (level >= 2) {
        const scaffold = box(0.08, 0.9 + level * 0.12, 0.08, "#6a5038", 0.45);
        scaffold.position.set(-0.75 * grow, 0, 0.45 * grow);
        g.add(scaffold);
      }
      if (level >= 4) {
        const cart = box(0.45, 0.25, 0.35, "#5a4030", 0.125);
        cart.position.set(0.55 * grow, 0, 0.65 * grow);
        g.add(cart);
      }
      break;
    }
    case "mine": {
      g.add(box(1.2 * grow, 0.65 * grow, 1.0 * grow, "#5a5340"));
      g.add(roof(1.3 * grow, 0.5 * grow, 1.1 * grow, t >= 3 ? "#b8922a" : "#8a7429", 1.0 * grow));
      const mouthW = 0.45 + level * 0.04;
      const mouth = box(mouthW, 0.4 + level * 0.05, 0.2, "#2a2420", 0.3 + level * 0.03);
      mouth.position.z = 0.55 * grow;
      g.add(mouth);
      if (level >= 2) {
        const ore = box(0.35, 0.25, 0.35, "#c9a227", 0.125, { metal: 0.35, emissive: "#8a7429", emInt: 0.15 });
        ore.position.set(-0.55 * grow, 0, 0.45 * grow);
        g.add(ore);
      }
      if (level >= 3) {
        for (let i = 0; i < level - 1; i++) {
          const rail = box(0.08, 0.05, 0.6, "#4a4030", 0.025);
          rail.position.set(-0.2 + i * 0.25, 0, 0.85 * grow);
          g.add(rail);
        }
      }
      if (level >= 5) {
        const glow = new THREE.PointLight("#ffd060", 0.5 + level * 0.08, 4, 2);
        glow.position.set(0, 0.5, 0.65 * grow);
        g.add(glow);
      }
      break;
    }
    case "barracks": {
      g.add(box(1.5 * grow, 0.85 * grow, 1.2 * grow, "#4a3f35"));
      g.add(roof(1.7 * grow, 0.65 * grow, 1.4 * grow, "#6b2f2f", 1.3 * grow));
      g.add(windowGlow(-0.35 * grow, 0.55 * grow, 0.61 * grow));
      g.add(windowGlow(0.35 * grow, 0.55 * grow, 0.61 * grow));
      if (level >= 2) g.add(windowGlow(0, 0.55 * grow, -0.61 * grow));
      for (let i = 0; i < Math.min(4, level); i++) {
        const rack = box(0.15, 0.65 + i * 0.05, 0.15, "#3a332c", 0.35);
        rack.position.set(0.75 * grow + i * 0.18, 0, 0.45 * grow);
        g.add(rack);
      }
      if (level >= 3) flag(g, 1.55 * grow, "#8b1e1e");
      if (level >= 4) {
        const yard = box(0.9, 0.08, 0.7, "#5a5048", 0.04);
        yard.position.set(-0.55 * grow, 0, 0.65 * grow);
        g.add(yard);
      }
      break;
    }
    case "tower": {
      const shaftH = 1.5 + level * 0.38;
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38 + level * 0.02, 0.48 + level * 0.02, shaftH, 8),
        mat(t >= 3 ? "#6a6458" : "#5a5348"),
      );
      shaft.position.y = shaftH / 2;
      addShadow(shaft);
      g.add(shaft);
      g.add(roof(1.0 + level * 0.06, 0.65 + level * 0.05, 1.0 + level * 0.06, "#3d4a5c", shaftH + 0.35));
      g.add(windowGlow(0, shaftH * 0.55, 0.42 + level * 0.02));
      if (level >= 2) g.add(windowGlow(0.35, shaftH * 0.75, 0));
      if (level >= 3) addCrenellations(g, 0.95 + level * 0.05, 0.22, shaftH + 0.05, "#5a5348", 5);
      const torch = new THREE.PointLight("#ff9a3a", 0.7 + level * 0.12, 5, 2);
      torch.position.set(0.55 * grow, shaftH * 0.65, 0.55 * grow);
      g.add(torch);
      break;
    }
    case "wall": {
      const wallH = 0.7 + level * 0.22;
      g.add(box(1.7 * grow, wallH, 0.45 * grow, "#6e6a63", wallH / 2));
      const postH = wallH + 0.35;
      const postL = box(0.25, postH, 0.45 * grow, "#5e5a53", postH / 2);
      postL.position.x = -0.75 * grow;
      g.add(postL);
      const postR = box(0.25, postH, 0.45 * grow, "#5e5a53", postH / 2);
      postR.position.x = 0.75 * grow;
      g.add(postR);
      if (level >= 2) addCrenellations(g, 1.5 * grow, 0.45 * grow, wallH, "#5e5a53", 5 + level);
      if (level >= 3) {
        const walk = box(1.4 * grow, 0.08, 0.35, "#55524c", wallH + 0.04);
        g.add(walk);
      }
      break;
    }
    case "blacksmith": {
      g.add(box(1.3 * grow, 0.8 * grow, 1.1 * grow, "#3f3a38"));
      g.add(roof(1.5 * grow, 0.6 * grow, 1.3 * grow, "#b45a1a", 1.2 * grow));
      if (level >= 2) {
        const chimney = box(0.25, 0.9 + level * 0.15, 0.25, "#2a2420", 1.35 * grow);
        chimney.position.set(-0.45 * grow, 0, -0.35 * grow);
        g.add(chimney);
      }
      const forge = new THREE.Mesh(
        new THREE.BoxGeometry(0.4 + level * 0.04, 0.35, 0.4 + level * 0.04),
        mat("#ff6a20", { emissive: "#ff4a00", emInt: 0.6 + level * 0.15 }),
      );
      forge.position.set(0.5 * grow, 0.35, 0.55 * grow);
      g.add(forge);
      const glow = new THREE.PointLight("#ff6a20", 0.5 + level * 0.15, 4, 2);
      glow.position.set(0.5 * grow, 0.65, 0.55 * grow);
      g.add(glow);
      if (level >= 3) {
        const anvil = box(0.35, 0.18, 0.25, "#3a3a40", 0.09);
        anvil.position.set(0.1 * grow, 0, 0.65 * grow);
        g.add(anvil);
      }
      break;
    }
    case "market": {
      g.add(box(1.5 * grow, 0.55 * grow, 1.2 * grow, "#8b5a3c"));
      g.add(box(1.7 * grow, 0.08, 1.4 * grow, t >= 3 ? "#3a7a58" : "#2f5d4a", 0.75 * grow));
      const stallCount = 1 + Math.min(3, Math.floor(level / 2));
      for (let i = 0; i < stallCount; i++) {
        const px = -0.7 * grow + i * 0.7 * grow;
        const pole = box(0.1, 0.65 + level * 0.08, 0.1, "#5a4030", 0.35);
        pole.position.set(px, 0, 0.55 * grow);
        g.add(pole);
        const stall = box(0.55 + level * 0.05, 0.22, 0.45, i % 2 ? "#c4a37a" : "#d4b38a", 0.4);
        stall.position.set(px, 0, 0.45 * grow);
        g.add(stall);
      }
      if (level >= 4) {
        const banner = box(0.5, 0.3, 0.05, "#c9a227", 1.1 * grow);
        banner.position.set(0, 0, 0.72 * grow);
        g.add(banner);
      }
      break;
    }
    case "bridge": {
      const deck = box(1.9, 0.12, 1.1, "#7a6248", 0.35);
      g.add(deck);
      const railL = box(1.8, 0.22, 0.08, "#5a4634", 0.5);
      railL.position.z = 0.28;
      g.add(railL);
      const railR = box(1.8, 0.22, 0.08, "#5a4634", 0.5);
      railR.position.z = -0.28;
      g.add(railR);
      for (const sx of [-0.7, 0.7]) {
        const post = box(0.12, 0.7 + level * 0.1, 0.12, "#4a3a28", 0.35);
        post.position.x = sx;
        g.add(post);
      }
      break;
    }
    case "boat": {
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.28, 0.7),
        mat("#5a4030", { rough: 0.9 }),
      );
      hull.position.y = 0.2;
      addShadow(hull);
      g.add(hull);
      const bow = new THREE.Mesh(
        new THREE.ConeGeometry(0.38, 0.7, 4),
        mat("#4a3428", { rough: 0.9 }),
      );
      bow.rotation.z = Math.PI / 2;
      bow.position.set(0.95, 0.22, 0);
      addShadow(bow);
      g.add(bow);
      const mast = box(0.08, 1.1 + level * 0.15, 0.08, "#3a2a1c", 0.7);
      g.add(mast);
      const sail = box(0.08, 0.7, 0.55, level >= 2 ? "#d8e8f8" : "#c4d4e8", 1.15);
      sail.position.x = 0.12;
      g.add(sail);
      break;
    }
    case "road": {
      const dirt = new THREE.Mesh(
        new THREE.PlaneGeometry(1.85, 1.85),
        mat("#c4a882", { rough: 1 }),
      );
      dirt.rotation.x = -Math.PI / 2;
      dirt.position.y = 0.05;
      dirt.receiveShadow = true;
      g.add(dirt);
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.2),
        mat("#b09068", { rough: 1 }),
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.y = 0.06;
      g.add(stripe);
      break;
    }
    case "forest": {
      for (let i = 0; i < 3; i++) {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.12, 0.55, 5),
          mat("#5a3d22", { rough: 1 }),
        );
        trunk.position.set(-0.35 + i * 0.35, 0.28, (i % 2) * 0.25 - 0.1);
        addShadow(trunk);
        g.add(trunk);
        const leaves = new THREE.Mesh(
          new THREE.ConeGeometry(0.4 - i * 0.04, 0.85, 6),
          mat(i % 2 ? "#2f5a38" : "#3a6b42", { rough: 1 }),
        );
        leaves.position.set(trunk.position.x, 0.85, trunk.position.z);
        addShadow(leaves);
        g.add(leaves);
      }
      break;
    }
    case "mountain": {
      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 1.6, 5),
        mat("#6a7068", { rough: 1 }),
      );
      peak.position.y = 0.8;
      addShadow(peak);
      g.add(peak);
      const shoulder = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 1.0, 5),
        mat("#7a8088", { rough: 1 }),
      );
      shoulder.position.set(0.45, 0.5, -0.2);
      addShadow(shoulder);
      g.add(shoulder);
      break;
    }
    default:
      g.add(box(1, 0.8, 1, "#777"));
  }

  g.scale.setScalar(scale);
  return g;
}

export function createTree(variant: 0 | 1 | 2 = 0): THREE.Group {
  const g = new THREE.Group();
  if (variant === 1) {
    // Broad oak — wider crown
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.65, 6), mat("#5a3d22"));
    trunk.position.y = 0.32;
    addShadow(trunk);
    g.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), mat("#3a6b42", { rough: 1 }));
    crown.scale.set(1, 0.75, 1);
    crown.position.y = 1.15;
    addShadow(crown);
    g.add(crown);
    return g;
  }
  if (variant === 2) {
    // Tall pine — narrower, taller
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.0, 6), mat("#4a3320"));
    trunk.position.y = 0.5;
    addShadow(trunk);
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const layer = new THREE.Mesh(
        new THREE.ConeGeometry(0.55 - i * 0.12, 0.85, 7),
        mat(i === 0 ? "#2a5230" : "#3a6840", { rough: 1 }),
      );
      layer.position.y = 0.95 + i * 0.55;
      addShadow(layer);
      g.add(layer);
    }
    return g;
  }
  // Default pine (original)
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6), mat("#5a3d22"));
  trunk.position.y = 0.35;
  addShadow(trunk);
  g.add(trunk);
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.5, 7), mat("#2f5a38", { rough: 1 }));
  leaves.position.y = 1.35;
  addShadow(leaves);
  g.add(leaves);
  const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 7), mat("#3a6b42", { rough: 1 }));
  leaves2.position.y = 1.9;
  addShadow(leaves2);
  g.add(leaves2);
  return g;
}

export function createRock(scale = 1): THREE.Mesh {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.25 * scale + Math.random() * 0.15 * scale, 0),
    mat("#8a9098", { rough: 1 }),
  );
  rock.position.y = 0.15 * scale;
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  addShadow(rock);
  return rock;
}
