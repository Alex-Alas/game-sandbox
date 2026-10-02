/* Fantasma de la mejor vuelta: mientras corre el crono se graba al piloto a 20 Hz
   (rejilla fija de tiempo de carrera, interpolando entre frames) y la mejor vuelta
   se guarda por circuito en localStorage. La reproducción es un piloto translúcido
   con estela que sale a la vez que tú al cruzar la primera puerta. */
import * as THREE from 'three';
import { CHARACTERS } from './assets.js';
import { buildCharacter, poseFlight, wingTips } from './character.js';
import { Ribbon } from './effects.js';

const HZ = 20;
const STRIDE = 10;                  // x y z · yaw pitch roll · tuck flare flap bank
const MAX_SAMPLES = HZ * 60 * 15;   // 15 min: más es una vuelta abandonada
const JUMP2 = 40 * 40;              // salto entre muestras (reaparición): no se interpola
const FADE_OUT = 1.5;               // s que tarda en desvanecerse al terminar su vuelta
const ON_KEY = 'elytra.ghostOn';
const dataKey = (id) => 'elytra.ghost.' + id;

export const ghost = {
  visible: loadVisible(),
  saved: null,      // { time, skin, n, data: Float32Array }
  runT0: null,      // state.time en que arrancó la vuelta en curso (null = esperando en la salida)
};

const rec = {
  buf: new Float32Array(HZ * 60 * 4 * STRIDE),
  n: 0, active: false, has: false, prevT: 0, prev: new Float32Array(STRIDE),
};
const cur = new Float32Array(STRIDE);
const smp = new Float32Array(STRIDE);

let scene = null;
let rig = null;
let rigSkin = -1;
let mats = [];
let trailL = null, trailR = null;
let halo = null;
let wasShown = false;

/* ── Persistencia ─────────────────────────────────────────── */
function loadVisible() {
  try { return localStorage.getItem(ON_KEY) !== '0'; } catch { return true; }
}

function persist(id, s) {
  try {
    const u8 = new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength);
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    localStorage.setItem(dataKey(id), JSON.stringify({
      v: 1, hz: HZ, stride: STRIDE, time: s.time, skin: s.skin, n: s.n, data: btoa(bin),
    }));
  } catch { /* sin storage o sin cuota: el fantasma dura solo esta sesión */ }
}

function load(id) {
  try {
    const o = JSON.parse(localStorage.getItem(dataKey(id)) || 'null');
    if (!o || o.v !== 1 || o.hz !== HZ || o.stride !== STRIDE || o.n < 2) return null;
    const bin = atob(o.data);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const data = new Float32Array(u8.buffer);
    if (data.length !== o.n * STRIDE) return null;
    return { time: o.time, skin: o.skin, n: o.n, data };
  } catch { return null; }
}

/* ── Visual ───────────────────────────────────────────────── */
function buildRig(skin) {
  if (rig && rigSkin === skin) return;
  if (rig) scene.remove(rig.root);
  rig = buildCharacter(CHARACTERS[skin] ?? CHARACTERS[0]);
  rigSkin = skin;
  mats = [];
  rig.root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false;
    const m = o.material.clone();
    m.transparent = true;
    m.depthWrite = false;
    m.color.multiply(new THREE.Color(0xa8e8ff));
    if (!m.emissiveMap) { m.emissive.set(0x3aaee0); m.emissiveIntensity = 1.1; }
    m.userData.base = m.emissiveMap ? 0.65 : 0.58;
    o.material = m;
    mats.push(m);
  });
  rig.root.visible = false;
  scene.add(rig.root);
}

export function initGhost(sc, courseId, glowTex) {
  scene = sc;
  ghost.saved = load(courseId);
  trailL = new Ribbon(scene, 0x5fb4ff);
  trailR = new Ribbon(scene, 0x5fb4ff);
  // Halo: lo hace legible de lejos y contra el cielo
  halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x6fd0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(7);
  halo.visible = false;
  scene.add(halo);
  if (ghost.saved) buildRig(ghost.saved.skin);
}

export function toggleGhost() {
  ghost.visible = !ghost.visible;
  try { localStorage.setItem(ON_KEY, ghost.visible ? '1' : '0'); } catch { /* */ }
  return ghost.visible;
}

/* ── Grabación ────────────────────────────────────────────── */
function capture(p, out) {
  out[0] = p.rpos.x; out[1] = p.rpos.y; out[2] = p.rpos.z;
  out[3] = p.yaw; out[4] = p.pitch; out[5] = p.roll;
  out[6] = p.tuck; out[7] = p.flare; out[8] = p.flap; out[9] = p.bank;
}

function push(a, b, f) {
  if (rec.n >= MAX_SAMPLES) { rec.active = false; return; }
  if ((rec.n + 1) * STRIDE > rec.buf.length) {
    const nb = new Float32Array(rec.buf.length * 2);
    nb.set(rec.buf);
    rec.buf = nb;
  }
  const o = rec.n * STRIDE;
  for (let i = 0; i < STRIDE; i++) rec.buf[o + i] = a[i] + (b[i] - a[i]) * f;
  rec.n++;
}

/** Arranca la grabación (y la reproducción) al cruzar la primera puerta. */
export function ghostStart(t0) {
  ghost.runT0 = t0;
  rec.n = 0;
  rec.has = false;
  rec.active = true;
}

/** Vuelta abandonada (reiniciar carrera): ni se graba ni se reproduce. */
export function ghostCancel() {
  rec.active = false;
  ghost.runT0 = null;
}

/** Muestra del jugador en el instante de carrera t. teleport: acaba de reaparecer
    (el hueco se rellena con la última posición, sin interpolar el salto). */
export function ghostRecord(t, p, teleport = false) {
  if (!rec.active) return;
  capture(p, cur);
  if (!rec.has) { rec.prev.set(cur); rec.prevT = t; rec.has = true; }
  const span = t - rec.prevT;
  while (rec.active && rec.n / HZ <= t + 1e-6) {
    if (teleport || span < 1e-6) push(teleport ? rec.prev : cur, cur, 0);
    else push(rec.prev, cur, THREE.MathUtils.clamp((rec.n / HZ - rec.prevT) / span, 0, 1));
  }
  rec.prev.set(cur);
  rec.prevT = t;
}

/** Cierra la vuelta. Si mejora al fantasma guardado (o no había), lo sustituye. */
export function ghostFinish(time, skin, courseId) {
  if (!rec.active) return false;
  while (rec.active && rec.n / HZ <= time + 1e-6) push(rec.prev, rec.prev, 0);
  rec.active = false;
  if (rec.n < 2 || (ghost.saved && ghost.saved.time <= time)) return false;
  ghost.saved = { time, skin, n: rec.n, data: rec.buf.slice(0, rec.n * STRIDE) };
  persist(courseId, ghost.saved);
  buildRig(skin);
  return true;
}

/* ── Reproducción ─────────────────────────────────────────── */
const cr = (p0, p1, p2, p3, f) =>
  0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);

function far(d, a, b) {
  const dx = d[a] - d[b], dy = d[a + 1] - d[b + 1], dz = d[a + 2] - d[b + 2];
  return dx * dx + dy * dy + dz * dz > JUMP2;
}

/* Interpola la muestra del instante t: Catmull-Rom en posición, lineal en el resto.
   Devuelve la velocidad aproximada (m/s), o -1 si hay un salto (reaparición). */
function sampleAt(s, t, out) {
  const d = s.data, n = s.n;
  const x = THREE.MathUtils.clamp(t * HZ, 0, n - 1);
  const i = Math.min(Math.floor(x), n - 2), f = x - i;
  const o1 = i * STRIDE, o2 = o1 + STRIDE;
  if (far(d, o1, o2)) {
    const o = f < 0.5 ? o1 : o2;
    for (let k = 0; k < STRIDE; k++) out[k] = d[o + k];
    return -1;
  }
  let o0 = Math.max(0, i - 1) * STRIDE, o3 = Math.min(n - 1, i + 2) * STRIDE;
  if (far(d, o0, o1)) o0 = o1;
  if (far(d, o2, o3)) o3 = o2;
  for (let k = 0; k < 3; k++) out[k] = cr(d[o0 + k], d[o1 + k], d[o2 + k], d[o3 + k], f);
  for (let k = 3; k < STRIDE; k++) out[k] = d[o1 + k] + (d[o2 + k] - d[o1 + k]) * f;
  const dx = d[o2] - d[o1], dy = d[o2 + 1] - d[o1 + 1], dz = d[o2 + 2] - d[o1 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * HZ;
}

const _p = new THREE.Vector3();
const _tipL = new THREE.Vector3();
const _tipR = new THREE.Vector3();

/** Por frame. active: hay vuelo en curso (no título); running: el crono corre. */
export function updateGhost(now, camera, active, running) {
  const s = ghost.saved;
  if (!rig) return;
  let alpha = s && ghost.visible && active ? 1 : 0;
  let t = 0, idle = ghost.runT0 == null;
  if (alpha && !idle) {
    t = now - ghost.runT0;
    const dur = (s.n - 1) / HZ;
    if (t > dur) {
      const k = (t - dur) / FADE_OUT;
      if (k < 1) { alpha = 1 - k; t = dur; }
      else if (running) alpha = 0;           // ya llegó: no estorba el resto de tu vuelta
      else { idle = true; t = 0; }           // esperando la siguiente vuelta en la salida
    }
  }
  if (alpha <= 0) {
    rig.root.visible = false;
    halo.visible = false;
    trailL.update(camera.position, 0, 0);
    trailR.update(camera.position, 0, 0);
    wasShown = false;
    return;
  }

  const spd = sampleAt(s, t, smp);
  _p.set(smp[0], smp[1] + (idle ? Math.sin(now * 2) * 0.6 : 0), smp[2]);
  rig.root.position.copy(_p);
  rig.root.rotation.set(smp[4], smp[3], smp[5], 'YXZ');
  rig.root.visible = true;
  poseFlight(rig, {
    tuck: smp[6], flare: smp[7], flap: smp[8], flapPhase: t * 16,
    turn: THREE.MathUtils.clamp(smp[9], -1, 1), speed: idle ? 40 : Math.max(0, spd), time: now,
  });
  rig.root.updateMatrixWorld(true);

  // Cerca de la cámara se desvanece para no tapar la vista
  const near = THREE.MathUtils.clamp((camera.position.distanceTo(_p) - 3) / 7, 0, 1);
  const a = alpha * near;
  for (const m of mats) m.opacity = m.userData.base * a;
  halo.position.copy(_p);
  halo.material.opacity = 0.45 * a;
  halo.visible = true;

  wingTips(rig, _tipL, _tipR);
  if (!wasShown || spd < 0 || idle) { trailL.reset(_tipL); trailR.reset(_tipR); }
  else { trailL.push(_tipL); trailR.push(_tipR); }
  const trailOp = idle ? 0 : 0.55 * a * THREE.MathUtils.clamp((spd - 30) / 60, 0, 1);
  trailL.update(camera.position, 0.12, trailOp);
  trailR.update(camera.position, 0.12, trailOp);
  wasShown = true;
}
