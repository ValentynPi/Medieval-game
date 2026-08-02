import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { buildingYaw, CELL, GRID_H, GRID_W, TILE } from "./config";
import { buildMusterField, musterCamp, musterSignature } from "./armyField";
import { createBuildingMesh, createRock } from "./buildings3d";
import { isEnemyVisible } from "./combat";
import { buildForestChunks, updateForestVisibility, type TreeChunk } from "./forests";
import { createUnitMesh, updateUnitMesh } from "./units3d";
import { getWorldLayout } from "./worldGen";
import type { Building, BuildingType, GameState } from "./types";

export { TILE };

export class VillageScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene = new THREE.Scene();

  private readonly root = new THREE.Group();
  private readonly buildingsGroup = new THREE.Group();
  private readonly ghostGroup = new THREE.Group();
  private readonly battleGroup = new THREE.Group();
  private readonly orderMarkerGroup = new THREE.Group();
  private readonly musterFieldGroup = new THREE.Group();
  private readonly groundPlane: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly buildingMeshes = new Map<string, THREE.Group>();
  private readonly battleMeshes = new Map<string, THREE.Group>();
  private readonly floatLabels = new Map<string, CSS2DObject>();
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.AmbientLight;
  readonly minimapCanvas: HTMLCanvasElement;
  readonly selectBoxEl: HTMLDivElement;

  private target = new THREE.Vector3(
    ((GRID_W - 1) * TILE) / 2,
    0,
    ((GRID_H - 1) * TILE) / 2,
  );
  private camOffset = new THREE.Vector3(55, 72, 55);
  private readonly fieldGroup = new THREE.Group();
  private fieldSig = "";
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly keys = new Set<string>();
  private night = false;
  private signature = "";
  private musterSig = "";
  private minimapBiome: HTMLCanvasElement | null = null;
  private treeChunks: TreeChunk[] = [];
  private forestCullAcc = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas;
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = "absolute";
    this.labelRenderer.domElement.style.inset = "0";
    this.labelRenderer.domElement.style.pointerEvents = "none";
    host.style.position = "relative";
    host.appendChild(this.labelRenderer.domElement);

    this.minimapCanvas = document.createElement("canvas");
    this.minimapCanvas.className = "battle-minimap hidden";
    this.minimapCanvas.width = 150;
    this.minimapCanvas.height = 105;
    host.appendChild(this.minimapCanvas);

    this.selectBoxEl = document.createElement("div");
    this.selectBoxEl.className = "select-box hidden";
    host.appendChild(this.selectBoxEl);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1200);
    this.scene.fog = new THREE.FogExp2("#4a6a88", 0.0028);
    this.scene.background = new THREE.Color("#6a9ac8");

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(520, 28, 18),
      new THREE.MeshBasicMaterial({ color: "#8ab8e8", side: THREE.BackSide }),
    );
    sky.position.copy(this.target);
    this.scene.add(sky);

    this.hemi = new THREE.HemisphereLight("#9ec4f0", "#4a7a3e", 0.72);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight("#8aa0b8", 0.42);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight("#ffe8c8", 1.35);
    this.sun.position.set(45, 55, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.camera.left = -90;
    this.sun.shadow.camera.right = 90;
    this.sun.shadow.camera.top = 90;
    this.sun.shadow.camera.bottom = -90;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const fill = new THREE.DirectionalLight("#a8c8f0", 0.35);
    fill.position.set(-30, 20, -25);
    this.scene.add(fill);

    this.scene.add(this.root);
    this.root.add(this.buildingsGroup);
    this.root.add(this.ghostGroup);
    this.root.add(this.battleGroup);
    this.root.add(this.orderMarkerGroup);
    this.root.add(this.musterFieldGroup);
    this.root.add(this.fieldGroup);

    this.groundPlane = this.buildTerrain();
    this.resize();
    this.bindInput();
    this.updateCamera();
  }

  private buildTerrain(): THREE.Mesh {
    const layout = getWorldLayout();
    const gw = GRID_W * TILE + 12;
    const gh = GRID_H * TILE + 12;
    const dummy = new THREE.Object3D();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(gw, gh, 24, 18),
      new THREE.MeshStandardMaterial({ color: "#4a7a40", roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.target.x, 0, this.target.z);
    ground.receiveShadow = true;
    this.root.add(ground);

    // Forest carpet (cheap tinted tiles) so woods read without thousands of trees
    const forestCells: { gx: number; gy: number; deep: boolean }[] = [];
    for (let gy = 0; gy < GRID_H; gy += 2) {
      for (let gx = 0; gx < GRID_W; gx += 2) {
        const b = layout.biomes[gy][gx];
        if (b === "forest" || b === "deep_forest") {
          forestCells.push({ gx, gy, deep: b === "deep_forest" });
        }
      }
    }
    if (forestCells.length) {
      const forestGeo = new THREE.PlaneGeometry(TILE * 2.05, TILE * 2.05);
      const forestMat = new THREE.MeshBasicMaterial({ color: "#2f5a34" });
      const deepMat = new THREE.MeshBasicMaterial({ color: "#234a2c" });
      const forestMesh = new THREE.InstancedMesh(forestGeo, forestMat, forestCells.length);
      const deepMesh = new THREE.InstancedMesh(forestGeo, deepMat, forestCells.length);
      let fi = 0;
      let di = 0;
      for (const cell of forestCells) {
        dummy.position.set(cell.gx * TILE + TILE, 0.015, cell.gy * TILE + TILE);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        if (cell.deep) deepMesh.setMatrixAt(di++, dummy.matrix);
        else forestMesh.setMatrixAt(fi++, dummy.matrix);
      }
      forestMesh.count = fi;
      deepMesh.count = di;
      forestMesh.instanceMatrix.needsUpdate = true;
      deepMesh.instanceMatrix.needsUpdate = true;
      this.root.add(forestMesh);
      this.root.add(deepMesh);
    }

    // Rivers & lakes — brighter, raised, oversized tiles (sample for FPS)
    if (layout.waterCells.length > 0) {
      const step = layout.waterCells.length > 2500 ? 2 : 1;
      const count = Math.ceil(layout.waterCells.length / step);
      const waterGeo = new THREE.PlaneGeometry(TILE * (1.2 + step * 0.35), TILE * (1.2 + step * 0.35));
      const waterMat = new THREE.MeshBasicMaterial({
        color: "#3d9ad4",
        transparent: true,
        opacity: 0.92,
      });
      const waterMesh = new THREE.InstancedMesh(waterGeo, waterMat, count);
      let wi = 0;
      for (let i = 0; i < layout.waterCells.length; i += step) {
        const cell = layout.waterCells[i];
        dummy.position.set(cell.gx * TILE + TILE / 2, 0.07, cell.gy * TILE + TILE / 2);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        waterMesh.setMatrixAt(wi++, dummy.matrix);
      }
      waterMesh.count = wi;
      waterMesh.instanceMatrix.needsUpdate = true;
      this.root.add(waterMesh);
    }

    // Mountain rises (capped)
    if (layout.mountainCells.length > 0) {
      const step = Math.max(2, Math.floor(layout.mountainCells.length / 280));
      const count = Math.ceil(layout.mountainCells.length / step);
      const mtnGeo = new THREE.ConeGeometry(TILE * 0.75, TILE * 1.5, 4);
      const mtnMat = new THREE.MeshStandardMaterial({ color: "#6a7068", roughness: 1 });
      const mtnMesh = new THREE.InstancedMesh(mtnGeo, mtnMat, count);
      let idx = 0;
      for (let i = 0; i < layout.mountainCells.length; i += step) {
        const cell = layout.mountainCells[i];
        dummy.position.set(cell.gx * TILE + TILE / 2, TILE * 0.55, cell.gy * TILE + TILE / 2);
        dummy.rotation.set(0, (i % 7) * 0.4, 0);
        dummy.scale.setScalar(0.75 + (i % 5) * 0.1);
        dummy.updateMatrix();
        mtnMesh.setMatrixAt(idx++, dummy.matrix);
      }
      mtnMesh.count = idx;
      mtnMesh.instanceMatrix.needsUpdate = true;
      mtnMesh.castShadow = false;
      this.root.add(mtnMesh);
    }

    // Dense forests: chunked InstancedMeshes — only chunks near the camera draw
    if (layout.trees.length > 0) {
      const forest = buildForestChunks(layout.trees);
      this.treeChunks = forest.chunks;
      this.root.add(forest.group);
      updateForestVisibility(this.treeChunks, this.target.x, this.target.z);
    }

    const decor = new THREE.Group();
    decor.name = "world_decor";
    for (const slot of layout.rocks) {
      const rock = createRock(slot.scale);
      rock.position.set(slot.x, 0, slot.z);
      rock.rotation.y = slot.rotation;
      rock.castShadow = false;
      decor.add(rock);
    }
    this.root.add(decor);

    // Distant town landmarks
    for (const town of layout.landmarks) {
      const marker = createBuildingMesh("market", 2);
      marker.position.set(town.gx * TILE + TILE / 2, 0, town.gy * TILE + TILE / 2);
      marker.scale.setScalar(1.35);
      this.root.add(marker);
      const el = document.createElement("div");
      el.className = "muster-label";
      el.textContent = town.name;
      const label = new CSS2DObject(el);
      label.position.set(town.gx * TILE + TILE / 2, 2.8, town.gy * TILE + TILE / 2);
      this.root.add(label);
    }

    return ground;
  }

  private panScale(): number {
    // Zoomed-out views move faster across the large map
    return 0.12 + this.camOffset.y * 0.0045;
  }

  private panByScreenDelta(dx: number, dy: number): void {
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    right.y = 0;
    right.normalize();
    const forward = new THREE.Vector3().crossVectors(this.camera.up, right).normalize();
    const s = this.panScale();
    this.target.addScaledVector(right, -dx * s);
    this.target.addScaledVector(forward, -dy * s);
    this.clampTarget();
    this.updateCamera();
  }

  private bindInput(): void {
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.button === 1 || e.button === 2 || e.shiftKey || e.altKey) {
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
      this.panByScreenDelta(dx, dy);
    });
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.9;
      this.camOffset.multiplyScalar(factor);
      this.camOffset.y = THREE.MathUtils.clamp(this.camOffset.y, 14, 280);
      this.camOffset.x = THREE.MathUtils.clamp(this.camOffset.x, 12, 280);
      this.camOffset.z = THREE.MathUtils.clamp(this.camOffset.z, 12, 280);
      this.updateCamera();
    }, { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        this.keys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener("blur", () => this.keys.clear());
  }

  private tickCameraPan(dt: number, allowWasd: boolean): void {
    if (this.keys.size === 0) return;
    let mx = 0;
    let mz = 0;
    if (this.keys.has("arrowleft") || (allowWasd && this.keys.has("a"))) mx -= 1;
    if (this.keys.has("arrowright") || (allowWasd && this.keys.has("d"))) mx += 1;
    if (this.keys.has("arrowup") || (allowWasd && this.keys.has("w"))) mz -= 1;
    if (this.keys.has("arrowdown") || (allowWasd && this.keys.has("s"))) mz += 1;
    if (mx === 0 && mz === 0) return;

    const len = Math.hypot(mx, mz) || 1;
    mx /= len;
    mz /= len;
    const speed = (38 + this.camOffset.y * 0.85) * dt;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    right.y = 0;
    right.normalize();
    const forward = new THREE.Vector3().crossVectors(this.camera.up, right).normalize();
    this.target.addScaledVector(right, mx * speed);
    this.target.addScaledVector(forward, -mz * speed);
    this.clampTarget();
    this.updateCamera();
  }

  private clampTarget(): void {
    const margin = 4;
    this.target.x = THREE.MathUtils.clamp(this.target.x, margin, GRID_W * TILE - margin);
    this.target.z = THREE.MathUtils.clamp(this.target.z, margin, GRID_H * TILE - margin);
  }

  private updateCamera(): void {
    this.camera.position.copy(this.target).add(this.camOffset);
    this.camera.lookAt(this.target);
    this.sun.target.position.copy(this.target);
  }

  resize(): void {
    const w = this.host.clientWidth || 784;
    const h = this.host.clientHeight || 560;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
  }

  setNight(night: boolean): void {
    if (this.night === night) return;
    this.night = night;
    if (night) {
      // Moonlit evening — readable, not pitch black
      this.scene.background = new THREE.Color("#243548");
      this.scene.fog = new THREE.FogExp2("#243548", 0.012);
      this.hemi.intensity = 0.65;
      this.ambient.intensity = 0.55;
      this.sun.intensity = 0.85;
      this.sun.color.set("#b8c8e8");
      this.renderer.toneMappingExposure = 1.15;
    } else {
      // Daylight — match initial scene setup
      this.scene.background = new THREE.Color("#6a9ac8");
      this.scene.fog = new THREE.FogExp2("#4a6a88", 0.0028);
      this.hemi.intensity = 0.72;
      this.ambient.intensity = 0.42;
      this.sun.intensity = 1.55;
      this.sun.color.set("#ffe8c8");
      this.renderer.toneMappingExposure = 1.05;
    }
  }

  cellToWorld(gx: number, gy: number): THREE.Vector3 {
    return new THREE.Vector3(gx * TILE, 0, gy * TILE);
  }

  pickBuilding(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const meshList = [...this.buildingMeshes.values()];
    if (!meshList.length) return null;
    const hits = this.raycaster.intersectObjects(meshList, true);
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        const id = node.userData.buildingId as string | undefined;
        if (id) return id;
        node = node.parent;
      }
    }
    return null;
  }

  pickBattle(
    clientX: number,
    clientY: number,
    state: GameState,
  ): { kind: "unit"; id: string } | { kind: "ground"; x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const meshList = [...this.battleMeshes.values()];
    if (meshList.length) {
      const hits = this.raycaster.intersectObjects(meshList, true);
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          const id = node.userData.unitId as string | undefined;
          if (id) {
            const unit = state.battle?.units.find((u) => u.id === id);
            if (unit && unit.side === "player" && unit.hp > 0 && unit.speed > 0) {
              return { kind: "unit", id };
            }
          }
          node = node.parent;
        }
      }
    }

    const groundHits = this.raycaster.intersectObject(this.groundPlane);
    if (!groundHits.length) return null;
    const p = groundHits[0].point;
    return { kind: "ground", x: (p.x / TILE) * CELL, y: (p.z / TILE) * CELL };
  }

  unitsInScreenRect(
    state: GameState,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): string[] {
    const battle = state.battle;
    if (!battle) return [];
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const rect = this.canvas.getBoundingClientRect();
    const ids: string[] = [];
    const v = new THREE.Vector3();

    for (const u of battle.units) {
      if (u.side !== "player" || u.hp <= 0 || u.speed <= 0) continue;
      if (u.kind === "keep" || u.kind === "tower") continue;
      const wx = (u.x / CELL) * TILE;
      const wz = (u.y / CELL) * TILE;
      v.set(wx, 0.5, wz).project(this.camera);
      const sx = rect.left + ((v.x + 1) / 2) * rect.width;
      const sy = rect.top + ((-v.y + 1) / 2) * rect.height;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) ids.push(u.id);
    }
    return ids;
  }

  showSelectBox(x0: number, y0: number, x1: number, y1: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const left = Math.min(x0, x1) - rect.left;
    const top = Math.min(y0, y1) - rect.top;
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    this.selectBoxEl.classList.remove("hidden");
    this.selectBoxEl.style.left = `${left}px`;
    this.selectBoxEl.style.top = `${top}px`;
    this.selectBoxEl.style.width = `${width}px`;
    this.selectBoxEl.style.height = `${height}px`;
  }

  hideSelectBox(): void {
    this.selectBoxEl.classList.add("hidden");
  }

  private syncCombatFloats(state: GameState): void {
    for (const [, label] of this.floatLabels) {
      this.battleGroup.remove(label);
      label.element.remove();
    }
    this.floatLabels.clear();

    const battle = state.battle;
    if (!battle) return;

    battle.combatFloats.forEach((f, i) => {
      const el = document.createElement("div");
      el.className = "combat-float";
      el.textContent = f.text;
      el.style.color = f.color;
      const label = new CSS2DObject(el);
      label.position.set((f.x / CELL) * TILE, 1.6 + (1.1 - f.ttl) * 0.4, (f.y / CELL) * TILE);
      this.floatLabels.set(`f${i}`, label);
      this.battleGroup.add(label);
    });
  }

  private ensureMinimapBiome(w: number, h: number): HTMLCanvasElement {
    if (this.minimapBiome && this.minimapBiome.width === w && this.minimapBiome.height === h) {
      return this.minimapBiome;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const layout = getWorldLayout();
    const step = 4;
    const sx = w / GRID_W;
    const sy = h / GRID_H;
    ctx.fillStyle = "#3a6840";
    ctx.fillRect(0, 0, w, h);
    for (let gy = 0; gy < GRID_H; gy += step) {
      for (let gx = 0; gx < GRID_W; gx += step) {
        const b = layout.biomes[gy][gx];
        if (b === "water" || b === "water_shore") ctx.fillStyle = "#3d9ad4";
        else if (b === "mountain") ctx.fillStyle = "#6a7068";
        else if (b === "rocky") ctx.fillStyle = "#7a7e88";
        else if (b === "deep_forest") ctx.fillStyle = "#234a2c";
        else if (b === "forest") ctx.fillStyle = "#2f5a34";
        else if (b === "meadow") ctx.fillStyle = "#5a9348";
        else continue;
        ctx.fillRect(gx * sx, gy * sy, Math.ceil(sx * step) + 1, Math.ceil(sy * step) + 1);
      }
    }
    this.minimapBiome = canvas;
    return canvas;
  }

  private drawMinimap(state: GameState): void {
    const battle = state.battle;
    const show = state.mode === "battle" && !!battle;
    this.minimapCanvas.classList.toggle("hidden", !show);
    if (!show || !battle) return;

    const ctx = this.minimapCanvas.getContext("2d");
    if (!ctx) return;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const sx = w / GRID_W;
    const sy = h / GRID_H;

    ctx.drawImage(this.ensureMinimapBiome(w, h), 0, 0);

    for (const b of state.buildings) {
      if (b.type !== "keep") continue;
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(b.x * sx, b.y * sy, Math.max(3, sx * 2), Math.max(3, sy * 2));
    }

    for (const u of battle.units) {
      if (u.hp <= 0 || u.kind === "keep") continue;
      if (u.side === "enemy" && !isEnemyVisible(battle, u.id)) continue;
      ctx.fillStyle =
        u.side === "player"
          ? u.kind === "hero"
            ? "#3a6ea5"
            : "#6fbf73"
          : u.kind === "beast"
            ? "#8b3a8b"
            : "#c45c4a";
      ctx.beginPath();
      ctx.arc((u.x / CELL) * sx, (u.y / CELL) * sy, u.side === "player" ? 2.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(201,162,39,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  private syncOrderMarker(state: GameState): void {
    while (this.orderMarkerGroup.children.length) {
      const c = this.orderMarkerGroup.children[0];
      this.orderMarkerGroup.remove(c);
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    }
    const marker = state.battle?.orderMarker;
    if (!marker || state.mode !== "battle") return;
    const wx = (marker.x / CELL) * TILE;
    const wz = (marker.y / CELL) * TILE;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.1, 24),
      new THREE.MeshBasicMaterial({ color: "#6fef7a", side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(wx, 0.06, wz);
    this.orderMarkerGroup.add(ring);
    const flag = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.5, 4),
      new THREE.MeshBasicMaterial({ color: "#6fef7a" }),
    );
    flag.position.set(wx, 0.35, wz);
    this.orderMarkerGroup.add(flag);
  }

  private syncSelectionRings(state: GameState): void {
    const selected = new Set(state.battle?.selectedIds ?? []);
    for (const [id, mesh] of this.battleMeshes) {
      const existing = mesh.getObjectByName("sel_ring");
      if (selected.has(id)) {
        if (!existing) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.55, 0.72, 20),
            new THREE.MeshBasicMaterial({ color: "#ffe08a", side: THREE.DoubleSide }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.08;
          ring.name = "sel_ring";
          mesh.add(ring);
        }
      } else if (existing) {
        mesh.remove(existing);
        if (existing instanceof THREE.Mesh) {
          existing.geometry.dispose();
          (existing.material as THREE.Material).dispose();
        }
      }
    }
  }

  pickCell(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.groundPlane);
    if (!hits.length) return null;
    const p = hits[0].point;
    const x = Math.round(p.x / TILE);
    const y = Math.round(p.z / TILE);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return { x, y };
  }

  setGhost(type: BuildingType | null, cell: { x: number; y: number } | null, rotation = 0): void {
    while (this.ghostGroup.children.length) {
      const c = this.ghostGroup.children[0];
      this.ghostGroup.remove(c);
      this.disposeObject(c);
    }
    if (!type || !cell) return;
    const mesh = createBuildingMesh(type, 1);
    mesh.rotation.y = buildingYaw(rotation);
    mesh.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if ("transparent" in m) {
            m.transparent = true;
            m.opacity = 0.55;
          }
        }
      }
    });
    const pos = this.cellToWorld(cell.x, cell.y);
    mesh.position.copy(pos);
    this.ghostGroup.add(mesh);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.05, 24),
      new THREE.MeshBasicMaterial({ color: "#d4af37", side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.05, pos.z);
    this.ghostGroup.add(ring);
  }

  private syncFarmFields(state: GameState): void {
    const sig = state.buildings
      .filter((b) => b.type === "farm")
      .map((b) => `${b.id}:${(b.fields ?? []).map((f) => `${f.x},${f.y}`).join(";")}`)
      .join("|");
    if (sig === this.fieldSig) return;
    this.fieldSig = sig;

    while (this.fieldGroup.children.length) {
      const child = this.fieldGroup.children[0];
      this.fieldGroup.remove(child);
      this.disposeObject(child);
    }

    for (const b of state.buildings) {
      if (b.type !== "farm" || !b.fields) continue;
      for (const f of b.fields) {
        const soil = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92),
          new THREE.MeshStandardMaterial({ color: "#6a5438", roughness: 1 }),
        );
        soil.rotation.x = -Math.PI / 2;
        soil.position.set(f.x * TILE + TILE / 2, 0.04, f.y * TILE + TILE / 2);
        soil.receiveShadow = true;
        this.fieldGroup.add(soil);
        for (let i = 0; i < 4; i++) {
          const row = new THREE.Mesh(
            new THREE.BoxGeometry(TILE * 0.78, 0.08, 0.12),
            new THREE.MeshStandardMaterial({
              color: i % 2 ? "#6f9a3c" : "#8aaf4a",
              roughness: 1,
            }),
          );
          row.position.set(
            f.x * TILE + TILE / 2,
            0.1,
            f.y * TILE + TILE / 2 - TILE * 0.28 + i * TILE * 0.18,
          );
          this.fieldGroup.add(row);
        }
      }
    }
  }

  syncBuildings(state: GameState): void {
    const sig = state.buildings
      .map(
        (b) =>
          `${b.id}:${b.type}:${b.level}:${b.x},${b.y}:${b.rotation ?? 0}:${b.fields?.length ?? 0}`,
      )
      .join("|");
    if (sig === this.signature) {
      this.animateDecor(0.016);
      return;
    }
    this.signature = sig;
    this.syncFarmFields(state);

    const alive = new Set(state.buildings.map((b) => b.id));
    for (const [id, mesh] of this.buildingMeshes) {
      if (!alive.has(id)) {
        this.buildingsGroup.remove(mesh);
        this.disposeObject(mesh);
        this.buildingMeshes.delete(id);
      }
    }

    for (const b of state.buildings) {
      let mesh = this.buildingMeshes.get(b.id);
      if (!mesh) {
        mesh = this.spawnBuilding(b);
        this.buildingMeshes.set(b.id, mesh);
        this.buildingsGroup.add(mesh);
      } else {
        // rebuild on level change
        const key = mesh.userData.key as string;
        const next = `${b.type}:${b.level}`;
        if (key !== next) {
          this.buildingsGroup.remove(mesh);
          this.disposeObject(mesh);
          mesh = this.spawnBuilding(b, true);
          this.buildingMeshes.set(b.id, mesh);
          this.buildingsGroup.add(mesh);
        }
      }
      const pos = this.cellToWorld(b.x, b.y);
      mesh.position.copy(pos);
      mesh.rotation.y = buildingYaw(b.rotation ?? 0);
      this.refreshLabel(mesh, b, state.selectedBuildingId === b.id);
    }
  }

  private spawnBuilding(b: Building, pulse = false): THREE.Group {
    const mesh = createBuildingMesh(b.type, b.level);
    mesh.userData.key = `${b.type}:${b.level}`;
    mesh.userData.buildingId = b.id;
    mesh.userData.baseScale = mesh.scale.x;
    if (pulse) mesh.userData.pulse = 1;
    const labelDiv = document.createElement("div");
    labelDiv.className = "bld-label";
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, 2.4, 0);
    mesh.add(label);
    mesh.userData.label = label;
    return mesh;
  }

  private refreshLabel(mesh: THREE.Group, b: Building, selected: boolean): void {
    const label = mesh.userData.label as CSS2DObject;
    const el = label.element as HTMLDivElement;
    const canUpgrade = b.level < 8;
    el.className = `bld-label${selected ? " selected" : ""}${b.type === "barracks" ? " camp" : ""}`;
    el.innerHTML = `<span class="lvl">${b.level}</span>${b.type === "barracks" ? '<span class="up">⚔</span>' : canUpgrade ? '<span class="up">▲</span>' : ""}`;
  }

  syncBattle(state: GameState): void {
    if (!state.battle) {
      for (const [, m] of this.battleMeshes) {
        this.battleGroup.remove(m);
        this.disposeObject(m);
      }
      this.battleMeshes.clear();
      this.syncOrderMarker(state);
      return;
    }

    const alive = new Set(
      state.battle.units.filter((u) => u.hp > 0 && u.kind !== "keep" && u.kind !== "tower").map((u) => u.id),
    );
    for (const [id, m] of this.battleMeshes) {
      if (!alive.has(id)) {
        this.battleGroup.remove(m);
        this.disposeObject(m);
        this.battleMeshes.delete(id);
      }
    }

    for (const u of state.battle.units) {
      if (u.hp <= 0 || u.kind === "keep" || u.kind === "tower") continue;
      let mesh = this.battleMeshes.get(u.id);
      if (!mesh) {
        mesh = createUnitMesh(u);
        // HP bar for all unit types
        if (!mesh.getObjectByName("hp_bar")) {
          const barBg = new THREE.Mesh(
            new THREE.PlaneGeometry(0.7, 0.08),
            new THREE.MeshBasicMaterial({ color: "#222", side: THREE.DoubleSide }),
          );
          const barY = u.troopType === "cavalry" || u.kind === "beast" ? 2.2 : 1.85;
          barBg.position.set(0, barY, 0);
          barBg.name = "hp_bg";
          mesh.add(barBg);
          const bar = new THREE.Mesh(
            new THREE.PlaneGeometry(0.66, 0.05),
            new THREE.MeshBasicMaterial({ color: "#6fbf73", side: THREE.DoubleSide }),
          );
          bar.position.set(0, barY, 0.01);
          bar.name = "hp_bar";
          mesh.add(bar);
        }
        this.battleMeshes.set(u.id, mesh);
        this.battleGroup.add(mesh);
      }
      updateUnitMesh(mesh, u);
      const spotted =
        u.side === "player" || !state.battle || isEnemyVisible(state.battle, u.id);
      mesh.visible = true;
      mesh.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (!("opacity" in m)) continue;
            m.transparent = true;
            if (!spotted) {
              m.opacity = 0.35;
            } else if (u.routing) {
              m.opacity = 0.65;
            } else if (u.morale != null && u.morale < 30) {
              m.opacity = 0.82;
            } else {
              m.opacity = 1;
            }
          }
        }
      });
    }
    this.syncSelectionRings(state);
    this.syncOrderMarker(state);
    this.syncCombatFloats(state);
    this.drawMinimap(state);
  }

  private animateDecor(dt: number): void {
    for (const mesh of this.buildingMeshes.values()) {
      const pulse = mesh.userData.pulse as number | undefined;
      if (pulse && pulse > 0) {
        mesh.userData.pulse = Math.max(0, pulse - dt * 2.5);
        const base = (mesh.userData.baseScale as number) ?? 1;
        mesh.scale.setScalar(base * (1 + pulse * 0.18));
      }
      mesh.traverse((o) => {
        if (o.name === "mill_blades") o.rotation.z += dt * 1.2;
      });
    }
  }

  private syncMusterField(state: GameState): void {
    const sig = musterSignature(state);
    if (sig === this.musterSig) return;
    this.musterSig = sig;

    for (const child of [...this.musterFieldGroup.children]) {
      this.musterFieldGroup.remove(child);
      this.disposeObject(child);
    }

    const camp = musterCamp(state);
    if (!camp || state.mode !== "village") return;

    buildMusterField(
      this.musterFieldGroup,
      state,
      camp,
      state.selectedBuildingId === camp.id,
    );
  }

  render(state: GameState, dt: number): void {
    // Raids keep daylight — night is not tied to combat
    this.setNight(false);
    this.tickCameraPan(dt, state.mode === "village");
    // Cull distant forest chunks a few times per second (cheap)
    this.forestCullAcc += dt;
    if (this.forestCullAcc > 0.12 && this.treeChunks.length) {
      this.forestCullAcc = 0;
      const reach = 70 + this.camOffset.y * 0.55;
      updateForestVisibility(this.treeChunks, this.target.x, this.target.z, reach);
    }
    this.syncBuildings(state);
    this.syncMusterField(state);
    this.syncBattle(state);
    this.animateDecor(dt);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose?.();
      }
      if (o instanceof CSS2DObject) {
        o.element.remove();
      }
    });
  }
}
