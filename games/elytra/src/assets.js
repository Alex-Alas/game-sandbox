/* Carga de assets (Kenney Nature Kit / Blocky Characters + texturas ambientCG, todo CC0). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSET_BASE } from './config.js';

export const NATURE = [
  'tree_pineTallA_detailed', 'tree_pineTallB_detailed', 'tree_pineRoundA', 'tree_pineRoundC',
  'tree_oak', 'tree_default', 'tree_fat', 'tree_detailed', 'tree_oak_fall', 'tree_tall',
  'rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallE', 'rock_tallG',
  'rock_largeA', 'rock_largeB', 'rock_largeD', 'stone_tallA', 'stone_tallC',
  'statue_ring', 'statue_column', 'statue_columnDamaged', 'statue_obelisk', 'statue_head',
  'platform_grass', 'log_large', 'plant_bushLarge',
];
export const CHARACTERS = ['a', 'b', 'e', 'h', 'k'];

export const assets = { tex: {}, models: {}, characters: {} };

export async function loadAssets(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);
  const texLoader = new THREE.TextureLoader(manager);
  const gltfLoader = new GLTFLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const loadTex = (name, file, srgb) => new Promise((res, rej) => {
    texLoader.load(ASSET_BASE + 'textures/' + file, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      assets.tex[name] = t;
      res(t);
    }, undefined, rej);
  });

  const loadGltf = (url) => new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));

  const jobs = [
    loadTex('grass', 'Grass004_color.jpg', true),
    loadTex('rock', 'Rock058_color.jpg', true),
    loadTex('snow', 'Snow010A_color.jpg', true),
    ...NATURE.map(async (n) => {
      const g = await loadGltf(ASSET_BASE + 'models/nature/' + n + '.glb');
      sanitizeMaterials(g.scene);
      assets.models[n] = g.scene;
    }),
    ...CHARACTERS.map(async (c) => {
      const g = await loadGltf(ASSET_BASE + 'models/characters/character-' + c + '.glb');
      assets.characters[c] = g.scene;
    }),
  ];
  await Promise.all(jobs);
  return assets;
}

/* Kenney exporta con metalness=1 y paleta muy saturada: se corrige a algo
   más natural para que encaje con el terreno PBR. */
const PALETTE = {
  leafsGreen: 0x4f8a34, leafsDark: 0x2f6a34, leafsFall: 0xd9822e,
  woodBark: 0x6e4a30, woodBarkDark: 0x4e3424, woodBirch: 0xe6ddcc,
  grass: 0x5e9a3c, dirt: 0x7a5a3c, woodInner: 0xc9a27a, stone: 0xb9b4a8, stoneDark: 0x8e8a80,
};
const matCache = new Map();
function sanitizeMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const fix = (m) => {
      if (matCache.has(m.name)) return matCache.get(m.name);
      const c = m.clone();
      c.metalness = 0;
      c.roughness = 0.85;
      if (PALETTE[m.name] !== undefined) c.color.setHex(PALETTE[m.name]);
      if (m.name) matCache.set(m.name, c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
}

/* Aplana un modelo GLTF en una lista {geometry, material} con transformaciones
   horneadas, lista para InstancedMesh o colliders. */
export function flattenModel(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const g = o.geometry.clone().applyMatrix4(m);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.length > 1 && g.groups.length) {
      for (const grp of g.groups) {
        const sub = g.clone();
        sub.setIndex(Array.from(g.index.array.slice(grp.start, grp.start + grp.count)));
        sub.clearGroups();
        parts.push({ geometry: sub, material: mats[grp.materialIndex] });
      }
    } else {
      parts.push({ geometry: g, material: mats[0] });
    }
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox);
  }
  return { parts, box };
}

/* Todos los vértices de un modelo aplanado (para cascos convexos). */
export function modelPoints(flat, matrix) {
  const pts = [];
  const v = new THREE.Vector3();
  for (const p of flat.parts) {
    const a = p.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      if (matrix) v.applyMatrix4(matrix);
      pts.push(v.x, v.y, v.z);
    }
  }
  return new Float32Array(pts);
}
