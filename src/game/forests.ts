import * as THREE from "three";
import { TILE } from "./config";
import type { TreeSlot } from "./worldGen";

const CHUNK = 16; // cells per chunk side
/** How far from camera (in world units) chunks stay visible */
export const TREE_VIEW_RADIUS = 78;

export interface TreeChunk {
  cx: number;
  cz: number;
  mesh: THREE.InstancedMesh;
  centerX: number;
  centerZ: number;
}

/** Single low-poly pine: trunk + two foliage cones merged into one geometry */
export function createPineGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.06, 0.1, 0.55, 4);
  trunk.translate(0, 0.28, 0);

  const mid = new THREE.ConeGeometry(0.55, 0.95, 5);
  mid.translate(0, 0.95, 0);

  const top = new THREE.ConeGeometry(0.32, 0.7, 5);
  top.translate(0, 1.55, 0);

  const geo = mergeGeometries([trunk, mid, top]);
  trunk.dispose();
  mid.dispose();
  top.dispose();
  return geo;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  let indexOffset = 0;
  const indices: number[] = [];

  for (const g of geos) {
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    const idx = g.getIndex();
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      else normals.push(0, 1, 0);
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
      else uvs.push(0, 0);
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + indexOffset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(indexOffset + i);
    }
    indexOffset += pos.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(indices);
  out.computeBoundingSphere();
  return out;
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/**
 * Build chunked InstancedMeshes so only nearby forests are drawn.
 * Returns the chunk list + a parent group to add to the scene.
 */
export function buildForestChunks(trees: TreeSlot[]): {
  group: THREE.Group;
  chunks: TreeChunk[];
} {
  const group = new THREE.Group();
  group.name = "forest_chunks";
  const buckets = new Map<string, TreeSlot[]>();

  for (const t of trees) {
    const cx = Math.floor(t.x / (CHUNK * TILE));
    const cz = Math.floor(t.z / (CHUNK * TILE));
    const key = chunkKey(cx, cz);
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(t);
  }

  const geo = createPineGeometry();
  const matA = new THREE.MeshBasicMaterial({ color: "#2a5530" });
  const matB = new THREE.MeshBasicMaterial({ color: "#35663a" });
  const matC = new THREE.MeshBasicMaterial({ color: "#1f4a28" });
  const mats = [matA, matB, matC];
  const dummy = new THREE.Object3D();
  const chunks: TreeChunk[] = [];

  for (const [key, slots] of buckets) {
    const [cxStr, czStr] = key.split(",");
    const cx = Number(cxStr);
    const cz = Number(czStr);
    // One material per chunk by majority variant — keeps draw calls low
    const mat = mats[Math.abs(cx + cz * 3) % 3];
    const mesh = new THREE.InstancedMesh(geo, mat, slots.length);
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    let sumX = 0;
    let sumZ = 0;
    slots.forEach((slot, i) => {
      const lean = (slot.variant - 1) * 0.04;
      dummy.position.set(slot.x, 0, slot.z);
      dummy.rotation.set(lean, slot.rotation, -lean * 0.5);
      dummy.scale.setScalar(slot.scale * (0.9 + slot.variant * 0.08));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      sumX += slot.x;
      sumZ += slot.z;
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();

    const chunk: TreeChunk = {
      cx,
      cz,
      mesh,
      centerX: sumX / slots.length,
      centerZ: sumZ / slots.length,
    };
    chunks.push(chunk);
    group.add(mesh);
  }

  return { group, chunks };
}

export function updateForestVisibility(
  chunks: TreeChunk[],
  camX: number,
  camZ: number,
  radius = TREE_VIEW_RADIUS,
): void {
  const r2 = radius * radius;
  for (const c of chunks) {
    const dx = c.centerX - camX;
    const dz = c.centerZ - camZ;
    c.mesh.visible = dx * dx + dz * dz <= r2;
  }
}
