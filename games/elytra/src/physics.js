/* Mundo físico Rapier: colliders estáticos del escenario, props dinámicos,
   ragdoll y consultas (shape-cast / ray / proyección) para el jugador. */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CFG } from './config.js';

export { RAPIER };

export const phys = {
  world: null,
  events: null,
  tracked: [],      // cuerpos dinámicos con malla: { body, mesh, p0, p1, q0, q1, still }
  acc: 0,
  alpha: 1,         // fracción entre los dos últimos pasos, para interpolar el render
  dirty: false,     // hay que dar al menos un paso (p. ej. tras quitar cuerpos)
  STEP: 1 / 60,
};

export async function initPhysics() {
  await RAPIER.init();
  phys.world = new RAPIER.World({ x: 0, y: -CFG.RAGDOLL_GRAVITY, z: 0 });
  phys.world.timestep = phys.STEP;
  phys.world.integrationParameters.numSolverIterations = 8;
  phys.events = new RAPIER.EventQueue(true);
  return phys.world;
}

/* Avanza el mundo con paso fijo. Si no hay nada despierto no se simula: el mundo
   estático no cambia y un paso con ~5000 colliders cuesta ~2 ms. Devuelve los pasos. */
export function stepPhysics(dt, onStep) {
  if (!phys.tracked.some((e) => !e.body.isSleeping())) {
    if (phys.dirty) phys.world.step(phys.events); // actualiza la broad-phase tras quitar cuerpos
    phys.dirty = false;
    phys.acc = 0;
    phys.alpha = 1;
    return 0;
  }
  phys.acc += dt;
  let n = 0;
  while (phys.acc >= phys.STEP && n < 5) {
    for (const e of phys.tracked) { e.p0.copy(e.p1); e.q0.copy(e.q1); }
    phys.world.step(phys.events);
    onStep?.(phys.events);
    for (const e of phys.tracked) {
      const t = e.body.translation(), r = e.body.rotation();
      e.p1.set(t.x, t.y, t.z);
      e.q1.set(r.x, r.y, r.z, r.w);
    }
    phys.acc -= phys.STEP;
    n++;
  }
  if (n >= 5) phys.acc = 0;
  phys.dirty = false;
  phys.alpha = phys.acc / phys.STEP;
  return n;
}

/* Registra un cuerpo cuya malla se interpola entre pasos (ver syncDynamic). */
export function track(body, mesh) {
  const t = body.translation(), r = body.rotation();
  const p = new THREE.Vector3(t.x, t.y, t.z), q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  const e = { body, mesh, p0: p.clone(), p1: p, q0: q.clone(), q1: q, still: false };
  phys.tracked.push(e);
  return e;
}

/* Deja de seguir y elimina del mundo los cuerpos dados. */
export function removeBodies(bodies) {
  const set = new Set(bodies);
  phys.tracked = phys.tracked.filter((e) => !set.has(e.body));
  for (const b of bodies) phys.world.removeRigidBody(b);
  phys.dirty = true;
}

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/* Collider estático con casco convexo a partir de puntos en espacio local + matriz. */
export function addStaticHull(points, userData = {}) {
  const desc = RAPIER.ColliderDesc.convexHull(points);
  if (!desc) return null;
  desc.setFriction(0.8).setRestitution(0.15);
  const c = phys.world.createCollider(desc);
  c.userData = userData;
  return c;
}

/* Collider estático trimesh (geometría ya en espacio mundo). */
export function addStaticTrimesh(geometry, matrix, userData = {}) {
  const g = geometry.index ? geometry : geometry.clone();
  const pos = g.attributes.position;
  const verts = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    verts[i * 3] = v.x; verts[i * 3 + 1] = v.y; verts[i * 3 + 2] = v.z;
  }
  let idx;
  if (g.index) idx = new Uint32Array(g.index.array);
  else { idx = new Uint32Array(pos.count); for (let i = 0; i < pos.count; i++) idx[i] = i; }
  const desc = RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(0.8).setRestitution(0.15);
  const c = phys.world.createCollider(desc);
  c.userData = userData;
  return c;
}

export function addStaticCuboid(hx, hy, hz, pos, quat, userData = {}) {
  const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
    .setTranslation(pos.x, pos.y, pos.z)
    .setRotation(quat ? { x: quat.x, y: quat.y, z: quat.z, w: quat.w } : { x: 0, y: 0, z: 0, w: 1 })
    .setFriction(0.8).setRestitution(0.15);
  const c = phys.world.createCollider(desc);
  c.userData = userData;
  return c;
}

export function addStaticCylinder(halfH, r, pos, userData = {}) {
  const desc = RAPIER.ColliderDesc.cylinder(halfH, r)
    .setTranslation(pos.x, pos.y, pos.z)
    .setFriction(0.7).setRestitution(0.2);
  const c = phys.world.createCollider(desc);
  c.userData = userData;
  return c;
}

/* Cuerpo dinámico sincronizado con una malla. La malla debe tener su origen en
   el centro de masa del collider (o pasar offset). */
export function addDynamicBody(mesh, colliderDesc, { sleeping = true, density = 1, ccd = false, userData = {} } = {}) {
  mesh.updateMatrixWorld(true);
  mesh.matrixWorld.decompose(_p, _q, _s);
  const bd = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(_p.x, _p.y, _p.z)
    .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
    .setCanSleep(true)
    .setSleeping(sleeping)
    .setCcdEnabled(ccd);
  const body = phys.world.createRigidBody(bd);
  colliderDesc.setDensity(density);
  const c = phys.world.createCollider(colliderDesc, body);
  c.userData = userData;
  track(body, mesh);
  return { body, collider: c };
}

/* Coloca las mallas interpolando entre los dos últimos pasos de física: se ve fluido a
   cualquier tasa de refresco y en cámara lenta (cuando no hay paso en cada frame). */
export function syncDynamic() {
  const a = phys.alpha;
  for (const e of phys.tracked) {
    const sleeping = e.body.isSleeping();
    if (sleeping && e.still) continue;
    e.mesh.position.lerpVectors(e.p0, e.p1, sleeping ? 1 : a);
    e.mesh.quaternion.slerpQuaternions(e.q0, e.q1, sleeping ? 1 : a);
    e.still = sleeping;
  }
}

/* ── Consultas para el jugador ───────────────────────────────── */
let _ball = null;
export function castPlayer(pos, delta, radius, excludeBody) {
  if (!_ball || _ball.radius !== radius) _ball = new RAPIER.Ball(radius);
  return phys.world.castShape(
    { x: pos.x, y: pos.y, z: pos.z }, { x: 0, y: 0, z: 0, w: 1 },
    { x: delta.x, y: delta.y, z: delta.z }, _ball,
    0.0, 1.0, true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, excludeBody,
  );
}

const notRagdoll = (c) => c.userData?.kind !== 'ragdoll';
export function castRay(origin, dir, maxDist, solid = true, filterFlags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS) {
  const ray = new RAPIER.Ray(origin, dir);
  return phys.world.castRay(ray, maxDist, solid, filterFlags, undefined, undefined, undefined, notRagdoll);
}

export function castRayNormal(origin, dir, maxDist) {
  const ray = new RAPIER.Ray(origin, dir);
  return phys.world.castRayAndGetNormal(ray, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
}

/* Distancia al obstáculo más cercano en una esfera (para "rasante" / near-miss). */
const _probeDirs = [];
for (let i = 0; i < 14; i++) {
  // Distribución de Fibonacci en la esfera
  const y = 1 - (i / 13) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = i * 2.399963;
  _probeDirs.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
}
export function nearestObstacle(pos, maxDist) {
  let best = maxDist;
  for (const d of _probeDirs) {
    const h = castRay(pos, d, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    if (h && h.timeOfImpact < best) best = h.timeOfImpact;
  }
  return best;
}
