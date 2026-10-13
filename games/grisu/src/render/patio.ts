// El patio gris en 3D (F1): la grilla de la sim hecha cajas (rectángulos fundidos por material: roca y vigas de hierro)
// con el pipeline pixelado del escaparate. Detrás, la pared de pizarra con relieve por facetas, apuntalamientos y
// faroles que prenden los 6 más cercanos a la cámara (toon.ts → LIGHT.uPL), como en LAS GALERÍAS. Gris a propósito:
// lo que se calibra son las mecánicas; el arte del estrato llega en F4.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, glowMat, LIGHT } from './toon.ts';
import { EMIT } from './palette.ts';
import { flat } from './models/kit.ts';
import { CELL, ROCK, type World } from '../sim/state.ts';

const Z_FRONT = 0.9, Z_BACK = -2.6;     // el espesor de lo sólido (el plano de juego es z = 0)

type L = { p: THREE.Vector3, r: number, k: number, ph: number };
export type PatioMesh = { root: THREE.Group, lights: L[], update: (t: number, cx: number, cy: number) => void };

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildPatioMesh(w: World): PatioMesh {
  const root = new THREE.Group();
  const r = rng(11);
  const M = {
    rock: toon('rock'), iron: toon('iron', { metal: 0.8, rough: 0.4, flat: true }), wood: toon('wood'), brass: toon('brass', { metal: 1, rough: 0.3 }),
    wall: toon({ base: '#5e5468', S: '#4a4358', D: '#3d354c', R: '#7c7080', H: '#7c7080' }),
    rockD: toon({ base: '#3f3f45', S: '#2e2a3a', D: '#20202c', R: '#4f5a70', H: '#635a5b' }),
  };
  const buckets = new Map<string, { m: THREE.Material, g: THREE.BufferGeometry[], outline: boolean }>();
  const add = (key: string, m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, outline = true, rz = 0) => {
    const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.z = rz; o.updateMatrix();
    let gg = g.index ? g.toNonIndexed() : g.clone();
    gg.applyMatrix4(o.matrix);
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal') gg.deleteAttribute(k);
    gg = flat(gg);
    const chunk = Math.floor(x / 40) + ':' + Math.floor(y / 40);
    const id = key + ':' + chunk + (outline ? '' : ':no');
    if (!buckets.has(id)) buckets.set(id, { m, g: [], outline });
    buckets.get(id)!.g.push(gg);
  };

  // ---- lo sólido: rectángulos máximos por fila, fundidos hacia arriba
  const runs: { i0: number, i1: number, j0: number, j1: number, v: number }[] = [];
  let open: typeof runs = [];
  for (let j = 0; j < w.rows; j++) {
    const row: typeof runs = [];
    for (let i = 0; i < w.cols;) {
      const v = w.g[j * w.cols + i];
      if (!v) { i++; continue; }
      let e = i; while (e < w.cols && w.g[j * w.cols + e] === v) e++;
      row.push({ i0: i, i1: e, j0: j, j1: j + 1, v });
      i = e;
    }
    const next: typeof runs = [];
    for (const q of row) {
      const o = open.find((p) => p.i0 === q.i0 && p.i1 === q.i1 && p.v === q.v && p.j1 === j);
      if (o) { o.j1 = j + 1; next.push(o); } else next.push(q);
    }
    for (const o of open) if (!next.includes(o)) runs.push(o);
    open = next;
  }
  runs.push(...open);
  for (const q of runs) {
    const x0 = q.i0 * CELL, x1 = q.i1 * CELL, y0 = q.j0 * CELL, y1 = q.j1 * CELL;
    const metal = q.v !== ROCK;
    const d = metal ? 1.2 : Z_FRONT - Z_BACK, zc = metal ? -0.1 : (Z_FRONT + Z_BACK) / 2;
    add(metal ? 'iron' : 'rock', metal ? M.iron : M.rock, new THREE.BoxGeometry(x1 - x0, y1 - y0, d), (x0 + x1) / 2, (y0 + y1) / 2, zc);
    // los bordes de arriba de la roca llevan una franja más oscura (se lee dónde se pisa)
    if (!metal && y1 - y0 >= 1) add('rockD', M.rockD, new THREE.BoxGeometry(x1 - x0 + 0.02, 0.18, d + 0.02), (x0 + x1) / 2, y1 - 0.09, zc);
    // remaches en las vigas
    if (metal) for (let x = x0 + 0.3; x < x1 - 0.1; x += 0.8) add('brass', M.brass, new THREE.SphereGeometry(0.06, 5, 4), x, (y0 + y1) / 2, zc + 0.62);
  }

  // ---- la pared de atrás de cada zona (relieve por facetas), apuntalamientos y faroles
  const lights: L[] = [];
  const wall = (x0: number, x1: number, y0: number, y1: number) => {
    for (let x = x0; x < x1; x += 8) for (let y = y0; y < y1; y += 12) {
      const g = new THREE.PlaneGeometry(8.2, 12.2, 10, 14);
      const pp = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) {
        const vx = pp.getX(i) + x, vy = pp.getY(i) + y;
        pp.setZ(i, Math.sin(vx * 1.7 + Math.sin(vy * 0.9) * 2) * 0.3 + Math.sin(vy * 2.3 + vx * 0.4) * 0.22 + (r() - 0.5) * 0.3);
      }
      add('wall', M.wall, g, x + 4, y + 6, -4.2, false);
    }
  };
  const lamp = (x: number, y: number, z: number, rad = 9, k = 1.1) => {
    add('iron', M.iron, new THREE.CylinderGeometry(0.16, 0.2, 0.08, 6), x, y + 0.3, z);
    add('iron', M.iron, new THREE.CylinderGeometry(0.2, 0.16, 0.08, 6), x, y - 0.3, z);
    for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + 0.4; add('iron', M.iron, new THREE.BoxGeometry(0.03, 0.6, 0.03), x + Math.cos(an) * 0.17, y, z + Math.sin(an) * 0.17); }
    const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), glowMat(EMIT.farol[1], 1, 2.2));
    f.position.set(x, y, z); f.scale.set(1, 1.6, 1); f.layers.enable(0);
    root.add(f);
    lights.push({ p: new THREE.Vector3(x, y, z), r: rad, k, ph: r() * 10 });
  };
  const post = (x: number, y0: number, y1: number) => {
    add('wood', M.wood, new THREE.BoxGeometry(0.4, y1 - y0, 0.4), x, (y0 + y1) / 2, -3.4);
    add('wood', M.wood, new THREE.BoxGeometry(0.5, 0.42, 2.2), x, y1 - 0.2, -2.4);
  };
  for (const z of w.zones) {
    if (z.id === 'pasillo') {
      wall(z.x0, z.x1, 6, 28);
      for (let x = z.x0 + 6; x < z.x1; x += 8) post(x, 10, 26);
      for (let x = z.x0 + 10; x < z.x1; x += 16) lamp(x, 17.5, -2.2);
    } else if (z.id === 'pozo') {
      wall(z.x0 - 4, z.x1 + 4, 6, z.y1 + 4);
      for (let y = z.y0 + 8; y < z.y1; y += 11) lamp(((y / 11) | 0) % 2 ? z.x0 + 0.8 : z.x1 - 0.8, y, -1.6, 10, 1.15);
    } else {
      wall(z.x0 - 4, z.x1 + 4, 6, 30);
      for (const x of [z.x0 + 2, z.x1 - 2]) post(x, 10, 24);
      for (const x of [z.x0 + 5, z.x0 + 14, z.x1 - 5]) lamp(x, 21.5, -2, 11, 1.2);
    }
  }

  for (const v of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(v.g, false), v.m);
    mesh.layers.enable(0);
    if (v.outline) mesh.layers.enable(1);
    root.add(mesh);
  }

  const update = (t: number, cx: number, cy: number) => {
    LIGHT.uTime.value = t;
    const near = lights.slice().sort((p, q) => (Math.abs(p.p.x - cx) + Math.abs(p.p.y - cy)) - (Math.abs(q.p.x - cx) + Math.abs(q.p.y - cy))).slice(0, 6);
    for (let i = 0; i < 6; i++) {
      const L = near[i];
      if (!L) { LIGHT.uPL.value[i].set(0, -999, 0, 1); LIGHT.uPLk.value[i] = 0; continue; }
      const fl = Math.floor((t + L.ph) * 8);
      LIGHT.uPL.value[i].set(L.p.x, L.p.y, L.p.z, L.r);
      LIGHT.uPLk.value[i] = L.k * (0.88 + 0.12 * (((fl * 2654435761) >>> 0) % 7) / 6);
    }
  };
  return { root, lights, update };
}
