/* Terreno: función de altura diseñada a mano (cañón, macizo, lago, llanura de
   pilares, valle de ruinas, muralla montañosa en los bordes), malla y collider. */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CFG, HALF } from './config.js';
import { fbm, ridged, smoothstep, lerp, segDist2D } from './noise.js';

export const CANYON_FLOOR = -16;

/* Línea central del cañón (z en función de x) y su pendiente. */
export function canyonZ(x) {
  return 430 * Math.sin(x * 0.0016 + 0.4) + 150 * Math.sin(x * 0.0041 + 1.3);
}
function canyonSlope(x) {
  return 430 * 0.0016 * Math.cos(x * 0.0016 + 0.4) + 150 * 0.0041 * Math.cos(x * 0.0041 + 1.3);
}
export function canyonDist(x, z) {
  const s = canyonSlope(x);
  return Math.abs(z - canyonZ(x)) / Math.sqrt(1 + s * s);
}
/* Tangente horizontal (normalizada) del cañón en x. */
export function canyonTangent(x) {
  const s = canyonSlope(x);
  const l = Math.sqrt(1 + s * s);
  return { x: 1 / l, z: s / l };
}
export function canyonWidth(x) {
  return 70 + 34 * fbm(x * 0.004, 3.3, 2);
}

/* Zonas con nombre: el resto del juego (obstáculos, recorrido) las reutiliza. */
export const ZONES = {
  massif:  { x: 700,  z: -800, r: 720 },
  pillars: { x: -800, z: -1050, r: 600 },
  lake:    { x: -950, z: 950,  r: 420 },
  ruins:   { x: 850,  z: 1000, r: 480 },
  islands: { x: -250, z: 1050, r: 420 },
};

export function baseHeight(x, z) {
  // Colinas base + detalle
  let h = 55 + (fbm(x * 0.0009 + 13.7, z * 0.0009 - 4.1, 5) - 0.5) * 190;
  h += (fbm(x * 0.0045 + 2.2, z * 0.0045 + 9.1, 3) - 0.5) * 26;

  // Crestas rocosas dispersas
  const cragMask = smoothstep(0.5, 0.75, fbm(x * 0.0007 - 31, z * 0.0007 + 17, 3));
  h += ridged(x * 0.0022, z * 0.0022, 4) * 170 * cragMask;

  // Macizo nevado (NE)
  {
    const m = 1 - smoothstep(0, ZONES.massif.r, Math.hypot((x - ZONES.massif.x) * 0.9, z - ZONES.massif.z));
    h += m * m * (3 - 2 * m) * 560 * (0.7 + 0.6 * ridged(x * 0.003 + 5, z * 0.003 + 1, 4));
  }

  // Muralla montañosa en los bordes (límite natural del mapa)
  const e = Math.max(Math.abs(x), Math.abs(z)) / HALF;
  h += Math.pow(smoothstep(0.70, 0.98, e), 1.4) * (650 + 350 * ridged(x * 0.0018, z * 0.0018, 4));

  // Llanura de pilares (NO): se aplana para que destaquen las agujas
  {
    const t = 1 - smoothstep(250, ZONES.pillars.r, Math.hypot(x - ZONES.pillars.x, z - ZONES.pillars.z));
    h = lerp(h, 70 + (h - 70) * 0.35, t);
  }
  // Valle de las ruinas (SE)
  {
    const t = 1 - smoothstep(200, ZONES.ruins.r, Math.hypot(x - ZONES.ruins.x, z - ZONES.ruins.z));
    h = lerp(h, 45 + (h - 45) * 0.25, t);
  }
  // Lago (SO)
  {
    const warp = (fbm(x * 0.004 + 9, z * 0.004 - 3, 3) - 0.5) * 260;
    const t = 1 - smoothstep(150, ZONES.lake.r, Math.hypot(x - ZONES.lake.x, (z - ZONES.lake.z) * 1.35) + warp);
    h = lerp(h, -30, t);
  }

  // Cañón: meseta elevada a los lados + tallado con paredes casi verticales
  const cd = canyonDist(x, z);
  const xm = 1 - smoothstep(1700, 1900, Math.abs(x));
  const w = canyonWidth(x);
  h += xm * (1 - smoothstep(w + 40, w + 420, cd)) * (110 + 40 * fbm(x * 0.006, z * 0.006, 2));
  const carve = xm * (1 - smoothstep(w * 0.55, w + 55, cd));
  const floor = CANYON_FLOOR + (fbm(x * 0.01, z * 0.01, 2) - 0.5) * 6;
  h = lerp(h, floor, carve);

  return h;
}

/* Superficie analítica sin tallar (para colocar las puertas antes de tallar). */
export function baseSurface(x, z) {
  return Math.max(baseHeight(x, z), CFG.WATER);
}

/* Tallado del recorrido: donde el tramo recto entre puertas atraviesa una cresta,
   se abre un paso/barranco natural con ~30 m de holgura bajo la trayectoria. */
let carveSegs = [];
const CARVE_CLEAR = 30, CARVE_IN = 40, CARVE_OUT = 150;
export function setCarveSegments(segs) {
  carveSegs = segs.map(([a, b]) => ({
    ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y,
    minx: Math.min(a.x, b.x) - CARVE_OUT, maxx: Math.max(a.x, b.x) + CARVE_OUT,
    minz: Math.min(a.z, b.z) - CARVE_OUT, maxz: Math.max(a.z, b.z) + CARVE_OUT,
  }));
}

export function terrainHeight(x, z) {
  let h = baseHeight(x, z);
  for (const s of carveSegs) {
    if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
    const { d, t } = segDist2D(x, z, s.ax, s.az, s.bx, s.bz);
    if (d > CARVE_OUT) continue;
    const limit = s.ay + (s.by - s.ay) * t - CARVE_CLEAR;
    if (h <= limit) continue;
    const k = 1 - smoothstep(CARVE_IN, CARVE_OUT, d);
    // Fondo irregular para que parezca erosión y no un corte limpio
    const target = limit - (fbm(x * 0.02, z * 0.02, 2) - 0.5) * 12;
    h = lerp(h, Math.min(h, target), k);
  }
  return h;
}

/* ── Rejilla de alturas (compartida por malla, collider y consultas) ── */
const N = CFG.GRID;
const CELL = CFG.WORLD_SIZE / N;
let H = null; // Float32Array, índice i*(N+1)+j (i: x, j: z) — column-major para Rapier

export function buildHeightGrid() {
  H = new Float32Array((N + 1) * (N + 1));
  for (let i = 0; i <= N; i++) {
    const x = -HALF + i * CELL;
    for (let j = 0; j <= N; j++) {
      H[i * (N + 1) + j] = terrainHeight(x, -HALF + j * CELL);
    }
  }
  return H;
}

/* Altura exacta del triángulo renderizado (misma triangulación que PlaneGeometry). */
export function groundHeight(x, z) {
  const fx0 = (x + HALF) / CELL, fz0 = (z + HALF) / CELL;
  const i = Math.max(0, Math.min(N - 1, Math.floor(fx0)));
  const j = Math.max(0, Math.min(N - 1, Math.floor(fz0)));
  const fx = Math.max(0, Math.min(1, fx0 - i)), fz = Math.max(0, Math.min(1, fz0 - j));
  const h00 = H[i * (N + 1) + j], h10 = H[(i + 1) * (N + 1) + j];
  const h01 = H[i * (N + 1) + j + 1], h11 = H[(i + 1) * (N + 1) + j + 1];
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

/* Altura del suelo o del agua (lo que esté más alto). */
export function surfaceHeight(x, z) {
  return Math.max(groundHeight(x, z), CFG.WATER);
}

export function buildTerrainMesh(material) {
  const geo = new THREE.PlaneGeometry(CFG.WORLD_SIZE, CFG.WORLD_SIZE, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      pos.setY(j * (N + 1) + i, H[i * (N + 1) + j]);
    }
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

export function buildTerrainCollider(world) {
  const desc = RAPIER.ColliderDesc.heightfield(N, N, H, { x: CFG.WORLD_SIZE, y: 1, z: CFG.WORLD_SIZE })
    .setFriction(0.85)
    .setRestitution(0.1);
  const col = world.createCollider(desc);
  col.userData = { kind: 'terrain' };
  return col;
}
