/* Construcción del mundo: cielo, luz, agua, terreno y toda la geometría de obstáculos
   (agujas, arcos, puentes, anillo de piedra, ruinas con columnas derribables,
   islas flotantes, bosques, rocas), además de corrientes térmicas y cristales. */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CFG, HALF } from './config.js';
import { assets, flattenModel, modelPoints } from './assets.js';
import { rng, fbm, smoothstep } from './noise.js';
import {
  buildHeightGrid, buildTerrainMesh, buildTerrainCollider, groundHeight, surfaceHeight,
  canyonZ, canyonDist, canyonTangent, canyonWidth, CANYON_FLOOR, ZONES, setCarveSegments,
} from './terrain.js';
import { makeTerrainMaterial, makeTriplanarMaterial, makeWaterNormalTexture, makeGlowTexture } from './materials.js';
import {
  RAPIER, phys, addStaticHull, addStaticTrimesh, addStaticCuboid, addStaticCylinder, addDynamicBody,
} from './physics.js';
import { course, resolveGates, computeGateFrames, isPathClear, GATE_R, buildCourseVisuals, pathSegments } from './course.js';

export const world = {
  scene: null,
  sun: null,
  sunDir: new THREE.Vector3(),
  water: null,
  waterNormal: null,
  glowTex: null,
  crystals: [],
  thermals: [],
  thermalPoints: null,
  clouds: null,
  stats: {},
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

const flatCache = {};
function flat(name) {
  return (flatCache[name] ??= flattenModel(assets.models[name]));
}

const matCache = {};
function rockMat(tint = 0xffffff, scale = 0.035) {
  const k = tint + ':' + scale;
  return (matCache[k] ??= makeTriplanarMaterial({ map: assets.tex.rock, tint, scale }));
}

/* Crea InstancedMesh por cada sub-malla del modelo. */
function instanced(name, matrices, { shadow = true, material = null, receive = true, vary = 0 } = {}) {
  if (!matrices.length) return [];
  const f = flat(name);
  const out = [];
  for (const part of f.parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, material ?? part.material, matrices.length);
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    if (vary > 0) {
      const c = new THREE.Color();
      for (let i = 0; i < matrices.length; i++) {
        const h = Math.sin(i * 12.9898 + matrices[i].elements[12] * 0.01) * 43758.5453;
        const f = 1 - vary + (h - Math.floor(h)) * vary * 2;
        mesh.setColorAt(i, c.setRGB(f, f * (0.97 + (h * 7 % 1) * 0.06), f));
      }
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.castShadow = shadow;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    world.scene.add(mesh);
    out.push(mesh);
  }
  return out;
}

function slopeAt(x, z) {
  const e = 6;
  const dx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const dz = groundHeight(x, z + e) - groundHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/* ═════════════ CIELO, LUZ, AGUA ═════════════ */
function buildSky(renderer) {
  const scene = world.scene;
  const sky = new Sky();
  sky.scale.setScalar(8000);
  const u = sky.material.uniforms;
  u.turbidity.value = 5.5;
  u.rayleigh.value = 1.5;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  const phi = THREE.MathUtils.degToRad(90 - 34);
  const theta = THREE.MathUtils.degToRad(145);
  world.sunDir.setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(world.sunDir);
  scene.add(sky);
  world.sky = sky;

  // Entorno IBL a partir del cielo
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.scale.setScalar(1000);
  Object.keys(u).forEach((k) => {
    const v = u[k].value;
    sky2.material.uniforms[k].value = v?.clone ? v.clone() : v;
  });
  envScene.add(sky2);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;

  const fogColor = new THREE.Color(0xb9d3e6);
  scene.fog = new THREE.FogExp2(fogColor, 0.00034);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4f5a3a, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.7);
  sun.position.copy(world.sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(CFG.SHADOW_SIZE, CFG.SHADOW_SIZE);
  const sc = sun.shadow.camera;
  sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160;
  sc.near = 10; sc.far = 1600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.8;
  scene.add(sun, sun.target);
  world.sun = sun;
}

/* La sombra sigue al jugador (texel-snapping para que no "nade"). */
export function updateSunShadow(focus) {
  const sun = world.sun;
  const texel = 320 / CFG.SHADOW_SIZE;
  const fx = Math.round(focus.x / texel) * texel;
  const fz = Math.round(focus.z / texel) * texel;
  sun.target.position.set(fx, focus.y, fz);
  sun.position.copy(sun.target.position).addScaledVector(world.sunDir, 700);
  sun.target.updateMatrixWorld();
}

function buildWater() {
  const tex = makeWaterNormalTexture();
  tex.repeat.set(70, 70);
  world.waterNormal = tex;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1d5d78, roughness: 0.06, metalness: 0.05,
    normalMap: tex, normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true, opacity: 0.86,
  });
  const g = new THREE.PlaneGeometry(CFG.WORLD_SIZE * 1.6, CFG.WORLD_SIZE * 1.6);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.y = CFG.WATER;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  world.scene.add(mesh);
  world.water = mesh;
}

function buildClouds(r) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = 60 + r() * 136, y = 90 + r() * 70, rad = 30 + r() * 55;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.55 + r() * 0.3, depthWrite: false, color: 0xffffff,
    }));
    const sz = 260 + r() * 420;
    s.scale.set(sz * 1.8, sz, 1);
    s.position.set((r() * 2 - 1) * HALF * 1.1, 680 + r() * 380, (r() * 2 - 1) * HALF * 1.1);
    group.add(s);
  }
  world.scene.add(group);
  world.clouds = group;
}

/* ═════════════ OBSTÁCULOS ═════════════ */

/* Agujas de roca: llanura NO (slalom) y algunas dentro del cañón. */
const PILLAR_MODELS = ['rock_tallA', 'rock_tallB', 'rock_tallC', 'rock_tallG', 'stone_tallA', 'stone_tallC'];

function buildPillars(r) {
  const byModel = Object.fromEntries(PILLAR_MODELS.map((m) => [m, []]));
  const place = (x, z, h, rad, sink = 8) => {
    const name = PILLAR_MODELS[Math.floor(r() * PILLAR_MODELS.length)];
    const f = flat(name);
    const size = f.box.getSize(_s);
    const gy = groundHeight(x, z) - sink;
    if (!isPathClear(x, z, rad, gy, gy + h)) return false;
    const sx = (rad * 2) / Math.max(size.x, size.z);
    const sy = h / size.y;
    _q.setFromAxisAngle(UP, r() * Math.PI * 2);
    const m = new THREE.Matrix4().compose(_p.set(x, gy, z), _q, _s.set(sx, sy, sx));
    byModel[name].push(m);
    addStaticHull(modelPoints(f, m), { kind: 'rock' });
    return true;
  };

  let n = 0;
  const Z = ZONES.pillars;
  for (let gx = -560; gx <= 560; gx += 74) {
    for (let gz = -560; gz <= 560; gz += 74) {
      const x = Z.x + gx + (r() - 0.5) * 50, z = Z.z + gz + (r() - 0.5) * 50;
      const d = Math.hypot(x - Z.x, z - Z.z);
      if (d > 580 || r() < 0.18) continue;
      const big = 1 - d / 700;
      if (place(x, z, 90 + r() * 170 * big + 40, 12 + r() * 20)) n++;
    }
  }
  // Agujas en el fondo del cañón
  for (let i = 0; i < 70; i++) {
    const x = -1500 + r() * 3000;
    const w = canyonWidth(x);
    const t = canyonTangent(x);
    const off = (r() - 0.5) * w * 0.9;
    const z = canyonZ(x) + off * t.x;
    const xx = x - off * t.z;
    if (place(xx, z, 35 + r() * 70, 6 + r() * 9, 4)) n++;
  }
  // Monolitos dispersos por el mapa
  for (let i = 0; i < 90; i++) {
    const x = (r() * 2 - 1) * 1500, z = (r() * 2 - 1) * 1500;
    if (groundHeight(x, z) < 4 || canyonDist(x, z) < canyonWidth(x) + 30) continue;
    if (place(x, z, 40 + r() * 110, 10 + r() * 16)) n++;
  }

  const sandstone = rockMat(0xe9c39a, 0.03);
  for (const name of PILLAR_MODELS) instanced(name, byModel[name], { material: sandstone });
  world.stats.pillars = n;
}

/* Arco natural de roca orientado perpendicular a la dirección dada. */
function buildArch(center, dir, R, tube, r) {
  const geo = new THREE.TorusGeometry(R, tube, 14, 56, Math.PI * 1.22);
  geo.rotateZ(-Math.PI * 0.11);
  // Rugosidad rocosa
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seed = r() * 100;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 0.05 + seed, v.y * 0.05 + v.z * 0.05, 3) - 0.5;
    const ang = Math.atan2(v.y, v.x);
    const cx = Math.cos(ang) * R, cy = Math.sin(ang) * R;
    const off = new THREE.Vector3(v.x - cx, v.y - cy, v.z);
    off.multiplyScalar(1 + n * 0.55);
    v.set(cx + off.x, cy + off.y, off.z);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, rockMat(0xd8b089, 0.03));
  mesh.position.copy(center);
  mesh.rotation.y = Math.atan2(dir.x, dir.z);
  mesh.castShadow = mesh.receiveShadow = true;
  world.scene.add(mesh);
  mesh.updateMatrixWorld(true);
  addStaticTrimesh(geo, mesh.matrixWorld, { kind: 'rock' });
  return mesh;
}

function buildFeatureArches(r) {
  for (const g of course.gates) {
    if (g.def.feature !== 'arch') continue;
    const base = g.def.canyon ? CANYON_FLOOR : surfaceHeight(g.pos.x, g.pos.z) - 6;
    const R = Math.max(70, g.pos.y - base + GATE_R + 22);
    const dir = new THREE.Vector3(g.normal.x, 0, g.normal.z).normalize();
    buildArch(new THREE.Vector3(g.pos.x, base, g.pos.z), dir, R, 13 + r() * 5, r);
  }
  // Arcos sueltos por el mapa (para pasar por debajo en vuelo libre)
  let n = 0;
  for (let i = 0; i < 40 && n < 7; i++) {
    const x = (r() * 2 - 1) * 1400, z = (r() * 2 - 1) * 1400;
    const gy = groundHeight(x, z);
    if (gy < 5 || slopeAt(x, z) > 0.35 || canyonDist(x, z) < canyonWidth(x) + 120) continue;
    const R = 50 + r() * 50;
    if (!isPathClear(x, z, R + 20, gy, gy + R + 20)) continue;
    const a = r() * Math.PI;
    buildArch(new THREE.Vector3(x, gy - 4, z), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), R, 10 + r() * 6, r);
    n++;
  }
}

/* Puentes de piedra sobre el cañón. */
function buildBridges() {
  const stone = rockMat(0xcfc6b8, 0.05);
  const make = (x, y) => {
    const t = canyonTangent(x);
    const w = canyonWidth(x);
    const len = (w + 170) * 2;
    const grp = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 6, len), stone);
    const railGeo = new THREE.BoxGeometry(1.4, 3, len);
    const railL = new THREE.Mesh(railGeo, stone); railL.position.set(-8.3, 4.5, 0);
    const railR = new THREE.Mesh(railGeo, stone); railR.position.set(8.3, 4.5, 0);
    // Arco de sustentación bajo el tablero (achatado)
    const R = w * 0.95;
    const archGeo = new THREE.TorusGeometry(R, 3.4, 8, 40, Math.PI);
    archGeo.rotateY(Math.PI / 2);
    const arch = new THREE.Mesh(archGeo, stone);
    arch.scale.set(1, 0.55, 1);
    arch.position.y = -R * 0.55 - 3;
    grp.add(deck, railL, railR, arch);
    grp.position.set(x, y, canyonZ(x));
    grp.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    world.scene.add(grp);
    grp.updateMatrixWorld(true);
    grp.getWorldQuaternion(_q);
    addStaticCuboid(9, 6, len / 2, new THREE.Vector3(x, y + 1.5, canyonZ(x)), _q, { kind: 'stone' });
    const am = new THREE.Matrix4().copy(arch.matrixWorld);
    addStaticTrimesh(archGeo, am, { kind: 'stone' });
  };
  for (const g of course.gates) {
    if (g.def.feature === 'bridge') make(g.def.x, g.pos.y + GATE_R + 15);
  }
  // Puentes altos adicionales
  make(150, 75);
  make(-500, 60);
  make(1500, 55);
}

/* Anillo de piedra gigante (Kenney statue_ring) con la puerta centrada en su hueco. */
function buildStoneRing() {
  const g = course.gates.find((gg) => gg.def.feature === 'ring');
  if (!g) return;
  const f = flat('statue_ring');
  // Medimos el hueco del anillo lanzando rayos en su plano (XY local)
  const tmp = new THREE.Group();
  for (const p of f.parts) tmp.add(new THREE.Mesh(p.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  tmp.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const c = f.box.getCenter(new THREE.Vector3());
  c.z = 0;
  let rad = 0;
  for (let it = 0; it < 4; it++) {
    const acc = new THREE.Vector3();
    let cnt = 0;
    rad = Infinity;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      rc.set(c, new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
      const hit = rc.intersectObject(tmp, true)[0];
      if (!hit) continue;
      acc.add(hit.point); cnt++;
      rad = Math.min(rad, hit.distance);
    }
    if (cnt) c.copy(acc.divideScalar(cnt));
  }
  if (!isFinite(rad) || rad <= 0) rad = 0.2;
  const scale = (GATE_R + 9) / rad;
  const gy = surfaceHeight(g.pos.x, g.pos.z) - 2;
  const dir = new THREE.Vector3(g.normal.x, 0, g.normal.z).normalize();
  _q.setFromAxisAngle(UP, Math.atan2(dir.x, dir.z));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(g.pos.x, gy - f.box.min.y * scale, g.pos.z), _q, _s.setScalar(scale));
  instanced('statue_ring', [m], { material: rockMat(0xe8dfcf, 0.05) });
  for (const p of f.parts) addStaticTrimesh(p.geometry, m, { kind: 'stone' });
  // Recentrar la puerta en el hueco
  g.pos.copy(c).applyMatrix4(m);
  computeGateFrames();
}

/* Ruinas: columnas de tambores dinámicos que se derrumban, obeliscos y una cabeza colosal. */
function buildRuins(r) {
  const marble = rockMat(0xeee6d6, 0.06);
  const Z = ZONES.ruins;
  world.ruinBodies = [];
  let cols = 0;
  for (let i = 0; i < 80 && cols < 16; i++) {
    const a = r() * Math.PI * 2, d = 60 + r() * 380;
    const x = Z.x + Math.cos(a) * d, z = Z.z + Math.sin(a) * d;
    const gy = groundHeight(x, z);
    if (gy < 3 || slopeAt(x, z) > 0.3) continue;
    const drums = 4 + Math.floor(r() * 3);
    const dh = 9, rad = 5.5 + r() * 1.5;
    if (!isPathClear(x, z, rad + 4, gy, gy + drums * dh + 6, 10)) continue;
    // Plinto (estático)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(rad * 3, 4, rad * 3), marble);
    plinth.position.set(x, gy + 1, z);
    plinth.castShadow = plinth.receiveShadow = true;
    world.scene.add(plinth);
    addStaticCuboid(rad * 1.5, 2, rad * 1.5, plinth.position, null, { kind: 'stone' });
    let y = gy + 3;
    const drumGeo = new THREE.CylinderGeometry(rad, rad * 1.03, dh, 14);
    for (let k = 0; k < drums; k++) {
      const mesh = new THREE.Mesh(drumGeo, marble);
      mesh.position.set(x, y + dh / 2, z);
      mesh.rotation.y = r() * Math.PI;
      mesh.castShadow = mesh.receiveShadow = true;
      world.scene.add(mesh);
      const { body } = addDynamicBody(mesh, RAPIER.ColliderDesc.cylinder(dh / 2, rad).setFriction(0.9).setRestitution(0.05),
        { density: 260, userData: { kind: 'drum' } });
      world.ruinBodies.push(body);
      y += dh;
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(rad * 2.6, 4, rad * 2.6), marble);
    cap.position.set(x, y + 2, z);
    cap.castShadow = cap.receiveShadow = true;
    world.scene.add(cap);
    const { body } = addDynamicBody(cap, RAPIER.ColliderDesc.cuboid(rad * 1.3, 2, rad * 1.3).setFriction(0.9),
      { density: 260, userData: { kind: 'drum' } });
    world.ruinBodies.push(body);
    cols++;
  }

  // Obeliscos y columnas rotas estáticas
  const obel = [], broken = [];
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = 80 + r() * 420;
    const x = Z.x + Math.cos(a) * d, z = Z.z + Math.sin(a) * d;
    const gy = groundHeight(x, z);
    if (gy < 3) continue;
    const isOb = r() < 0.45;
    const name = isOb ? 'statue_obelisk' : 'statue_columnDamaged';
    const f = flat(name);
    const size = f.box.getSize(_s);
    const h = isOb ? 70 + r() * 50 : 25 + r() * 25;
    const sc = h / size.y;
    const rad = (size.x * sc) / 2;
    if (!isPathClear(x, z, rad, gy, gy + h, 14)) continue;
    _q.setFromAxisAngle(UP, r() * Math.PI);
    const m = new THREE.Matrix4().compose(_p.set(x, gy - 1, z), _q, _s.setScalar(sc));
    (isOb ? obel : broken).push(m);
    addStaticHull(modelPoints(f, m), { kind: 'stone' });
  }
  instanced('statue_obelisk', obel, { material: marble });
  instanced('statue_columnDamaged', broken, { material: marble });

  // Cabeza colosal
  {
    const f = flat('statue_head');
    const x = Z.x + 260, z = Z.z + 230;
    const gy = groundHeight(x, z);
    const sc = 120 / f.box.getSize(_s).y;
    _q.setFromAxisAngle(UP, -2.3);
    const m = new THREE.Matrix4().compose(_p.set(x, gy - 6, z), _q, _s.setScalar(sc));
    if (isPathClear(x, z, 50, gy, gy + 120, 10)) {
      instanced('statue_head', [m], { material: marble });
      addStaticHull(modelPoints(f, m), { kind: 'stone' });
    }
  }
  world.stats.columns = cols;
}

/* Islas flotantes con árboles. */
const TREE_TOP = ['tree_oak', 'tree_default', 'tree_fat', 'tree_pineRoundA', 'tree_detailed'];

function buildIslands(r) {
  const grassTop = flat('platform_grass');
  const topSize = grassTop.box.getSize(new THREE.Vector3());
  const tops = [];
  const treeM = Object.fromEntries(TREE_TOP.map((t) => [t, []]));
  const under = rockMat(0xc9a27d, 0.035);
  const centers = [
    ...Array.from({ length: 22 }, () => ({ zone: ZONES.islands, rad: 460, y0: 230, y1: 500 })),
    ...Array.from({ length: 10 }, () => ({ zone: { x: 0, z: 0 }, rad: 1400, y0: 380, y1: 650 })),
  ];
  let n = 0;
  for (const c of centers) {
    for (let tries = 0; tries < 30; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * c.rad;
      const x = c.zone.x + Math.cos(a) * d, z = c.zone.z + Math.sin(a) * d;
      const s = 28 + r() * 55;
      const y = Math.max(c.y0 + r() * (c.y1 - c.y0), groundHeight(x, z) + s * 1.6 + 60);
      if (!isPathClear(x, z, s, y - s * 1.5, y + 30, 24)) continue;

      // Base rocosa: cono invertido deformado
      const geo = new THREE.ConeGeometry(s * 0.92, s * 1.5, 11, 5);
      geo.rotateX(Math.PI);
      geo.translate(0, -s * 0.75, 0);
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      const sd = r() * 50;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const k = 1 + (fbm(v.x * 0.04 + sd, v.z * 0.04 + v.y * 0.03, 3) - 0.5) * 0.7;
        pos.setXYZ(i, v.x * k, v.y * (v.y < -s * 1.4 ? 1 : k * 0.95 + 0.05), v.z * k);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, under);
      mesh.position.set(x, y, z);
      mesh.rotation.y = r() * Math.PI;
      mesh.castShadow = mesh.receiveShadow = true;
      world.scene.add(mesh);
      mesh.updateMatrixWorld(true);
      const pts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        pts[i * 3] = v.x; pts[i * 3 + 1] = v.y; pts[i * 3 + 2] = v.z;
      }
      addStaticHull(pts, { kind: 'rock' });

      // Cubierta de pasto (Kenney platform_grass)
      const sx = (s * 2.05) / topSize.x, sz = (s * 2.05) / topSize.z;
      _q.setFromAxisAngle(UP, mesh.rotation.y);
      const tm = new THREE.Matrix4().compose(_p.set(x, y - 2, z), _q, _s.set(sx, 70, sz));
      tops.push(tm);
      addStaticHull(modelPoints(grassTop, tm), { kind: 'rock' });

      // Árboles encima
      const nt = 1 + Math.floor(r() * 5);
      for (let k = 0; k < nt; k++) {
        const ta = r() * Math.PI * 2, td = r() * s * 0.6;
        const tx = x + Math.cos(ta) * td, tz = z + Math.sin(ta) * td;
        const name = TREE_TOP[Math.floor(r() * TREE_TOP.length)];
        const ts = 9 + r() * 7;
        const tmm = new THREE.Matrix4().compose(_p.set(tx, y + 3.2, tz), _q.setFromAxisAngle(UP, r() * 6.28), _s.setScalar(ts));
        treeM[name].push(tmm);
        const th = flat(name).box.max.y * ts;
        addStaticCylinder(th / 2, ts * 0.22, new THREE.Vector3(tx, y + 3 + th / 2, tz), { kind: 'tree' });
      }
      n++;
      break;
    }
  }
  instanced('platform_grass', tops);
  for (const t of TREE_TOP) instanced(t, treeM[t], { vary: 0.12 });
  world.stats.islands = n;
}

/* Bosques y rocas dispersas. */
const TREES_LOW = ['tree_oak', 'tree_default', 'tree_fat', 'tree_detailed', 'tree_oak_fall', 'tree_tall'];
const TREES_HIGH = ['tree_pineTallA_detailed', 'tree_pineTallB_detailed', 'tree_pineRoundA', 'tree_pineRoundC'];

function buildForests(r) {
  const all = [...TREES_LOW, ...TREES_HIGH];
  const M = Object.fromEntries(all.map((t) => [t, []]));
  let n = 0;
  for (let i = 0; i < 26000 && n < 4200; i++) {
    const x = (r() * 2 - 1) * 1680, z = (r() * 2 - 1) * 1680;
    const h = groundHeight(x, z);
    if (h < 4 || h > 360) continue;
    if (canyonDist(x, z) < canyonWidth(x) + 30) continue;
    const forest = fbm(x * 0.0024 + 40, z * 0.0024 - 12, 3);
    if (r() > smoothstep(0.42, 0.6, forest) * 0.95 + 0.02) continue;
    if (slopeAt(x, z) > 0.5) continue;
    const list = h > 170 || r() < 0.2 ? TREES_HIGH : TREES_LOW;
    const name = list[Math.floor(r() * list.length)];
    const f = flat(name);
    const H = 13 + r() * 16;
    const sc = H / f.box.max.y;
    const rad = Math.max(f.box.max.x - f.box.min.x, f.box.max.z - f.box.min.z) * sc * 0.5;
    if (!isPathClear(x, z, rad, h, h + H, 10)) continue;
    M[name].push(new THREE.Matrix4().compose(_p.set(x, h - 0.4, z), _q.setFromAxisAngle(UP, r() * 6.28), _s.setScalar(sc)));
    addStaticCylinder(H / 2, Math.max(1.2, rad * 0.62), new THREE.Vector3(x, h + H / 2, z), { kind: 'tree' });
    n++;
  }
  for (const t of all) instanced(t, M[t], { vary: 0.16 });

  // Rocas grandes
  const ROCKS = ['rock_largeA', 'rock_largeB', 'rock_largeD'];
  const RM = Object.fromEntries(ROCKS.map((t) => [t, []]));
  let nr = 0;
  for (let i = 0; i < 2000 && nr < 340; i++) {
    const x = (r() * 2 - 1) * 1700, z = (r() * 2 - 1) * 1700;
    const h = groundHeight(x, z);
    if (h < -12) continue;
    const name = ROCKS[Math.floor(r() * ROCKS.length)];
    const f = flat(name);
    const sc = 10 + r() * 30;
    const rad = 0.5 * sc;
    if (!isPathClear(x, z, rad, h, h + f.box.max.y * sc, 12)) continue;
    _e.set((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4);
    const m = new THREE.Matrix4().compose(_p.set(x, h - sc * 0.08, z), _q.setFromEuler(_e), _s.set(sc, sc * (0.7 + r() * 0.6), sc));
    RM[name].push(m);
    addStaticHull(modelPoints(f, m), { kind: 'rock' });
    nr++;
  }
  const gray = rockMat(0xbfb7aa, 0.05);
  for (const t of ROCKS) instanced(t, RM[t], { material: gray });
  world.stats.trees = n;
  world.stats.rocks = nr;
}

/* ═════════════ CORRIENTES TÉRMICAS ═════════════ */
function buildThermals(r) {
  // Una térmica en cada tramo del circuito con subida fuerte + algunas libres
  const spots = [];
  for (const [a, b] of pathSegments()) {
    if (b.y - a.y > 80) {
      const t = 0.4;
      spots.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, Math.min(a.y, b.y) - 120]);
    }
  }
  spots.push([-150, -300], [700, -150], [-1250, 200], [0, 300]);
  const PER = 220;
  const total = spots.length * PER;
  const pos = new Float32Array(total * 3);
  const seeds = new Float32Array(total * 3);
  spots.forEach(([x, z, yMin], si) => {
    const base = Math.max(surfaceHeight(x, z), yMin ?? -Infinity);
    world.thermals.push({ x, z, r: 40, y0: base, y1: base + 650 });
    for (let k = 0; k < PER; k++) {
      const i = si * PER + k;
      seeds[i * 3] = r() * Math.PI * 2;
      seeds[i * 3 + 1] = r();
      seeds[i * 3 + 2] = Math.sqrt(r()) * 30;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: world.glowTex, size: 5, color: 0xfff6dd, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData = { seeds, PER };
  world.scene.add(pts);
  world.thermalPoints = pts;
}

function updateThermals(time) {
  const pts = world.thermalPoints;
  const { seeds, PER } = pts.userData;
  const a = pts.geometry.attributes.position;
  world.thermals.forEach((t, si) => {
    const span = t.y1 - t.y0;
    for (let k = 0; k < PER; k++) {
      const i = si * PER + k;
      const ph = seeds[i * 3], f = seeds[i * 3 + 1], rr = seeds[i * 3 + 2];
      const y = ((f + time * 0.045) % 1) * span;
      const ang = ph + time * 0.6 + y * 0.01;
      a.setXYZ(i, t.x + Math.cos(ang) * rr, t.y0 + y, t.z + Math.sin(ang) * rr);
    }
  });
  a.needsUpdate = true;
}

export function thermalLift(p) {
  for (const t of world.thermals) {
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    if (d < t.r * 1.6 && p.y > t.y0 && p.y < t.y1) {
      const k = 1 - smoothstep(t.r * 0.6, t.r * 1.6, d);
      return k * (1 - smoothstep(t.y1 - 150, t.y1, p.y));
    }
  }
  return 0;
}

/* ═════════════ CRISTALES ═════════════ */
function buildCrystals(r) {
  const geo = new THREE.OctahedronGeometry(2.6, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6a2bd6, emissive: 0xb86bff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.3, flatShading: true,
  });
  const spots = [];
  // Junto al recorrido, entre puertas
  const G = course.gates;
  for (let i = 0; i < G.length; i++) {
    if (r() < 0.35) continue;
    const a = G[i].pos, b = G[(i + 1) % G.length].pos;
    const p = a.clone().lerp(b, 0.35 + r() * 0.3);
    const side = new THREE.Vector3().subVectors(b, a).cross(UP).normalize();
    p.addScaledVector(side, (r() - 0.5) * 50);
    p.y = Math.max(p.y + (r() - 0.5) * 20, surfaceHeight(p.x, p.z) + 8);
    spots.push(p);
  }
  // Libres por el mapa
  for (let i = 0; i < 30; i++) {
    const x = (r() * 2 - 1) * 1500, z = (r() * 2 - 1) * 1500;
    spots.push(new THREE.Vector3(x, surfaceHeight(x, z) + 30 + r() * 220, z));
  }
  for (const p of spots) {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: world.glowTex, color: 0xc07bff, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(16);
    grp.add(m, glow);
    grp.position.copy(p);
    grp.userData = { active: true, home: p.clone(), phase: r() * 6.28, timer: 0, mesh: m };
    world.scene.add(grp);
    world.crystals.push(grp);
  }
}

function updateCrystals(dt, time) {
  for (const c of world.crystals) {
    const u = c.userData;
    if (!u.active) {
      u.timer -= dt;
      if (u.timer <= 0) { u.active = true; c.visible = true; }
      continue;
    }
    u.mesh.rotation.y += dt * 1.8;
    u.mesh.rotation.x = Math.sin(time + u.phase) * 0.4;
    c.position.y = u.home.y + Math.sin(time * 1.6 + u.phase) * 1.5;
  }
}

/* ═════════════ API ═════════════ */
export async function buildWorld(scene, renderer, onStep) {
  world.scene = scene;
  world.glowTex = makeGlowTexture();
  const r = rng(1337);

  buildSky(renderer);
  await onStep?.('Esculpiendo terreno…');
  resolveGates();
  setCarveSegments(pathSegments());
  buildHeightGrid();
  const terrainMat = makeTerrainMaterial({ grass: assets.tex.grass, rock: assets.tex.rock, snow: assets.tex.snow });
  scene.add(buildTerrainMesh(terrainMat));
  buildTerrainCollider(phys.world);
  buildWater();
  buildClouds(r);

  await onStep?.('Levantando ruinas…');
  buildStoneRing();
  buildFeatureArches(r);
  buildBridges();
  buildRuins(r);
  await onStep?.('Plantando bosques…');
  buildPillars(r);
  buildIslands(r);
  buildForests(r);
  buildThermals(r);
  buildCrystals(r);
  buildCourseVisuals(scene, world.glowTex);

  phys.world.step(); // inicializa estructuras de consulta
  return world;
}

export function updateWorld(dt, time, camera) {
  if (world.waterNormal) {
    world.waterNormal.offset.x = time * 0.004;
    world.waterNormal.offset.y = time * 0.0025;
  }
  if (world.clouds) world.clouds.position.x = (time * 3) % 400;
  updateThermals(time);
  updateCrystals(dt, time);
  world.sky.position.copy(camera.position);
}
