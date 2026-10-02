/* Circuito de puertas: definición, visuales, detección de paso y cronómetro. */
import * as THREE from 'three';
import { CFG } from './config.js';
import { canyonZ, canyonTangent, CANYON_FLOOR, surfaceHeight, baseSurface } from './terrain.js';
import { segDist2D } from './noise.js';
import { pickCourse } from './courses.js';

export const GATE_R = 17;
let _segs = null;

/* Circuito activo (?c=<id>) y sus medallas (tiempo máximo en s, de mejor a peor). */
export const ACTIVE = pickCourse();
const BEST_KEY = 'elytra.best.' + ACTIVE.id;
const MEDAL_META = [
  { id: 'author', label: 'AUTOR',  color: '#c86bff' },
  { id: 'gold',   label: 'ORO',    color: '#ffd23f' },
  { id: 'silver', label: 'PLATA',  color: '#dfe9f2' },
  { id: 'bronze', label: 'BRONCE', color: '#e39a5c' },
];
export const MEDALS = MEDAL_META.map((m) => ({ ...m, t: ACTIVE.medals[m.id] }));

/** Mejor medalla conseguida con el tiempo t (o null). */
export const medalFor = (t) => (t == null ? null : MEDALS.find((m) => t <= m.t) ?? null);

/** La medalla más fácil que aún no se consigue con el tiempo t (null si ya tiene todas). */
export function nextMedal(t) {
  for (let i = MEDALS.length - 1; i >= 0; i--) if (t == null || t > MEDALS[i].t) return MEDALS[i];
  return null;
}

export const course = {
  id: ACTIVE.id,      // clave de récords, fantasma y estilo en localStorage
  name: ACTIVE.name,
  kind: ACTIVE.kind,  // 'loop' | 'sprint' | 'desplome'
  gates: [],          // { pos, normal, def, group, ring, mat }
  start: null,        // { pos, dir, speed }
  next: 0,
  running: false,
  t0: 0,
  time: 0,
  lap: 0,
  best: null,
  bestSplits: null,
  splits: [],
  lastSplitDelta: null,
  beam: null,
  lastCheckpoint: null,
};

/* Posición de una definición { x, z | canyon, a | abs } (antes de tallar el terreno). */
function defPos(d) {
  const z = d.canyon ? canyonZ(d.x) : d.z;
  let y;
  if (d.abs !== undefined) y = d.abs;
  else if (d.canyon) y = Math.max(CANYON_FLOOR, CFG.WATER) + d.a;
  else y = baseSurface(d.x, z) + d.a;
  return new THREE.Vector3(d.x, y, z);
}

export function resolveGates() {
  const pts = ACTIVE.gates.map((d) => ({ pos: defPos(d), def: d }));
  course.gates = pts;
  computeGateFrames();
  return pts;
}

/* Normales de las puertas y punto de salida. Se recalcula si el mundo ajusta
   alguna puerta (p. ej. centrarla en el anillo de piedra). */
export function computeGateFrames() {
  const pts = course.gates;
  const n = pts.length;
  const loop = course.kind === 'loop';
  const fixedStart = ACTIVE.start ? defPos(ACTIVE.start) : null;
  _segs = null;
  // Normal = dirección media entre el tramo de llegada y el de salida (en un sprint
  // los extremos no se cierran: la primera mira desde la salida, la última solo llega)
  for (let i = 0; i < n; i++) {
    const p = pts[i].pos;
    const prev = loop || i > 0 ? pts[(i - 1 + n) % n].pos : fixedStart;
    const next = loop || i < n - 1 ? pts[(i + 1) % n].pos : null;
    const nrm = new THREE.Vector3();
    if (prev) nrm.add(p.clone().sub(prev).normalize());
    if (next) nrm.add(next.clone().sub(p).normalize());
    if (pts[i].def.canyon) {
      const t = canyonTangent(pts[i].def.x);
      const sgn = Math.sign(nrm.x * t.x + nrm.z * t.z) || 1;
      nrm.set(t.x * sgn, nrm.y * 0.3, t.z * sgn);
    }
    nrm.y *= 0.5;
    pts[i].normal = nrm.normalize();
  }
  // Inicio: el del circuito, o detrás de la primera puerta y en altura, apuntando a ella
  const g0 = pts[0];
  let startPos = fixedStart;
  if (!startPos) {
    startPos = g0.pos.clone().addScaledVector(g0.normal, -380);
    startPos.y = Math.max(startPos.y + 120, baseSurface(startPos.x, startPos.z) + 160);
  }
  course.start = { pos: startPos, dir: g0.pos.clone().sub(startPos).normalize(), speed: ACTIVE.start?.speed ?? 70 };
}

/* Segmentos 3D del recorrido (para mantener libre el camino al colocar obstáculos). */
export function pathSegments() {
  const G = course.gates.map((g) => g.pos);
  const segs = [[course.start.pos, G[0]]];
  const last = course.kind === 'loop' ? G.length : G.length - 1;   // solo una vuelta vuelve a la salida
  for (let i = 0; i < last; i++) segs.push([G[i], G[(i + 1) % G.length]]);
  return segs;
}

/* ¿Un obstáculo cilíndrico (centro x,z, radio r, alturas yb..yt) deja libre el recorrido? */
export function isPathClear(x, z, r, yb, yt, margin = 26) {
  const A = ACTIVE.arena;   // la arena del DESPLOME queda despejada de obstáculos
  if (A && Math.hypot(x - A.x, z - A.z) < A.r + r) return false;
  if (!_segs) _segs = pathSegments();
  for (const [a, b] of _segs) {
    const { d, t } = segDist2D(x, z, a.x, a.z, b.x, b.z);
    if (d > r + margin + GATE_R) continue;
    const py = a.y + (b.y - a.y) * t;
    if (py + GATE_R + margin * 0.6 > yb && py - GATE_R - margin * 0.6 < yt) return false;
  }
  return true;
}

/* ── Visuales ─────────────────────────────────────────────── */
const COL_NEXT = new THREE.Color(0xffd23f);
const COL_AFTER = new THREE.Color(0x8ef2ff);
const COL_IDLE = new THREE.Color(0xb8c8d8);
const COL_FINISH = new THREE.Color(0x6bff9a);

export function buildCourseVisuals(scene, glowTex) {
  const ringGeo = new THREE.TorusGeometry(GATE_R, 1.25, 10, 48);
  const haloGeo = new THREE.TorusGeometry(GATE_R + 2.6, 0.35, 6, 48);
  course.gates.forEach((g, i) => {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x222222, emissive: COL_IDLE.clone(), emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.6,
    });
    const ring = new THREE.Mesh(ringGeo, mat);
    const haloMat = new THREE.MeshBasicMaterial({
      color: COL_IDLE.clone(), transparent: true, opacity: 0.35, depthWrite: false, fog: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: COL_NEXT, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    glow.scale.setScalar(GATE_R * 5);
    grp.add(ring, halo, glow);
    grp.position.copy(g.pos);
    grp.lookAt(g.pos.clone().add(g.normal));
    scene.add(grp);
    Object.assign(g, { group: grp, ring, mat, halo, haloMat, glow, index: i });
  });

  // Haz vertical que marca la siguiente puerta desde lejos
  const beamGeo = new THREE.CylinderGeometry(3, 3, 900, 12, 1, true);
  beamGeo.translate(0, 450, 0);
  course.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: COL_NEXT, transparent: true, opacity: 0.18, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  }));
  scene.add(course.beam);

  try {
    // Récord por circuito; la GRAN VUELTA hereda la clave antigua 'elytra.best'
    let raw = localStorage.getItem(BEST_KEY);
    if (raw == null && course.id === 'main') raw = localStorage.getItem('elytra.best');
    const s = JSON.parse(raw || 'null');
    if (s) { course.best = s.time; course.bestSplits = s.splits; }
  } catch { /* sin almacenamiento */ }
  refreshGateColors();
}

export function refreshGateColors() {
  const n = course.gates.length;
  course.gates.forEach((g, i) => {
    let c = COL_IDLE, op = 0.18, gl = 0;
    if (i === course.next) { c = i === n - 1 ? COL_FINISH : COL_NEXT; op = 0.7; gl = 0.55; }
    else if (i === (course.next + 1) % n) { c = COL_AFTER; op = 0.4; }
    g.mat.emissive.copy(c);
    g.mat.emissiveIntensity = i === course.next ? 2.2 : 0.9;
    g.haloMat.color.copy(c);
    g.haloMat.opacity = op;
    g.glow.material.color.copy(c);
    g.glow.material.opacity = gl;
  });
  const g = course.gates[course.next];
  course.beam.position.set(g.pos.x, surfaceHeight(g.pos.x, g.pos.z) - 5, g.pos.z);
  course.beam.material.color.copy(course.next === course.gates.length - 1 ? COL_FINISH : COL_NEXT);
}

export function animateCourse(time) {
  const g = course.gates[course.next];
  if (!g) return;
  const s = 1 + Math.sin(time * 5) * 0.04;
  g.group.scale.setScalar(s);
  g.ring.rotation.z = time * 0.6;
}

/* ── Lógica ───────────────────────────────────────────────── */
const _d = new THREE.Vector3();
const _hit = new THREE.Vector3();

/* Comprueba si el segmento p0→p1 cruza la puerta siguiente. Devuelve evento o null. */
export function checkGates(p0, p1, now) {
  const g = course.gates[course.next];
  const s0 = _d.copy(p0).sub(g.pos).dot(g.normal);
  const s1 = _d.copy(p1).sub(g.pos).dot(g.normal);
  if (s0 === s1 || s0 * s1 > 0) return null;
  const t = s0 / (s0 - s1);
  _hit.copy(p0).lerp(p1, t);
  const off = _hit.distanceTo(g.pos);
  if (off > GATE_R + 1.5) return null;

  const idx = course.next;
  const n = course.gates.length;
  // DESPLOME: la única puerta es la ENTRADA a la arena; sin cronómetro de carrera
  if (course.kind === 'desplome') {
    course.lastCheckpoint = { pos: g.pos.clone(), dir: g.normal.clone() };
    return { type: 'arena', index: idx, pos: g.pos.clone(), zone: g.def.zone, off };
  }
  let ev = { type: 'gate', index: idx, pos: g.pos.clone(), zone: g.def.zone, off };

  if (idx === 0 && !course.running) {
    course.running = true;
    course.t0 = now;
    course.splits = [];
    ev.type = 'start';
  }
  if (course.running) {
    const tt = now - course.t0;
    course.splits[idx] = tt;
    course.lastSplitDelta = course.bestSplits?.[idx] != null ? tt - course.bestSplits[idx] : null;
    ev.delta = course.lastSplitDelta;
  }
  course.lastCheckpoint = { pos: g.pos.clone(), dir: g.normal.clone() };

  if (idx === n - 1 && course.running) {
    const total = now - course.t0;
    ev.type = 'finish';
    ev.time = total;
    ev.record = course.best == null || total < course.best;
    if (ev.record) {
      course.best = total;
      course.bestSplits = course.splits.slice();
      try { localStorage.setItem(BEST_KEY, JSON.stringify({ time: total, splits: course.bestSplits })); } catch { /* */ }
    }
    course.running = false;
    course.lap++;
  }
  course.next = (idx + 1) % n;
  refreshGateColors();
  return ev;
}

export function resetCourse() {
  course.next = 0;
  course.running = false;
  course.splits = [];
  course.lastSplitDelta = null;
  course.lastCheckpoint = null;
  refreshGateColors();
}

export function courseTime(now) {
  return course.running ? now - course.t0 : (course.splits.length ? course.time : 0);
}

export function fmtTime(t) {
  if (t == null) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
