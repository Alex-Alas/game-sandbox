/* Ragdoll con cuerpos rígidos Rapier: una caja por parte del personaje (cabeza,
   torso, brazos, piernas y alas), articulaciones esféricas con "tono muscular"
   (motores que se relajan tras el impacto), CCD y eventos de fuerza de contacto
   para sonido, partículas y el contador de daño. */
import * as THREE from 'three';
import { RAPIER, phys } from './physics.js';
import { CFG } from './config.js';
import { JOINTS } from './character.js';

export const ragdoll = {
  active: false,
  bodies: {},       // name → body
  meshes: {},       // name → mesh (clones)
  joints: [],
  handleToPart: new Map(),
  group: null,
  t: 0,
  tone: 1,
  stats: null,
  settleTimer: 0,
  settled: false,
  lastImpact: {},
};

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Vector3();

const PART_DENSITY = { 'wing-left': 40, 'wing-right': 40, head: 520 };

/* Límites angulares (rad) en el marco de reposo (de pie): X = cabeceo, Y = giro,
   Z = apertura lateral. Evitan hiperextensiones grotescas pero dejan mucho juego. */
const LIMITS = {
  head:        { x: [-1.25, 0.6], y: [-1.1, 1.1], z: [-0.55, 0.55] },
  'arm-left':  { x: [-3.0, 1.1],  y: [-1.3, 1.3], z: [-0.25, 2.8] },
  'arm-right': { x: [-3.0, 1.1],  y: [-1.3, 1.3], z: [-2.8, 0.25] },
  'leg-left':  { x: [-2.1, 0.7],  y: [-0.7, 0.7], z: [-0.25, 1.25] },
  'leg-right': { x: [-2.1, 0.7],  y: [-0.7, 0.7], z: [-1.25, 0.25] },
  'wing-left': { x: [-0.9, 0.9],  y: [-1.7, 1.7], z: [-1.7, 0.6] },
  'wing-right':{ x: [-0.9, 0.9],  y: [-1.7, 1.7], z: [-0.6, 1.7] },
};
const AXES = () => [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ];

/* En rapier3d-compat 0.21 JointData.spherical crea una articulación "Generic"
   sin envoltorio de motores: usamos el conjunto raw. */
function jointMotor(j, axis, stiff, damp) {
  if (typeof j.configureMotorPosition === 'function') j.configureMotorPosition(axis, 0, stiff, damp);
  else j.rawSet.jointConfigureMotorPosition(j.handle, axis, 0, stiff, damp);
}
function jointLimits(j, axis, min, max) {
  j.rawSet.jointSetLimits(j.handle, axis, min, max);
}

export function spawnRagdoll(scene, rig, vel, angVel) {
  clearRagdoll(scene);
  const W = phys.world;
  rig.root.updateMatrixWorld(true);
  ragdoll.group = new THREE.Group();
  scene.add(ragdoll.group);

  // Centro de masas aproximado = torso
  rig.parts.torso.getWorldPosition(_c);

  for (const name of Object.keys(rig.parts)) {
    const src = rig.parts[name];
    src.matrixWorld.decompose(_p, _q, _s);
    const mesh = new THREE.Mesh(src.geometry, src.material);
    mesh.castShadow = true;
    mesh.position.copy(_p);
    mesh.quaternion.copy(_q);
    ragdoll.group.add(mesh);
    ragdoll.meshes[name] = mesh;

    const r = new THREE.Vector3().subVectors(_p, _c);
    const v = new THREE.Vector3().crossVectors(angVel, r).add(vel);
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(_p.x, _p.y, _p.z)
      .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setLinvel(v.x, v.y, v.z)
      .setAngvel({ x: angVel.x, y: angVel.y, z: angVel.z })
      .setLinearDamping(name.startsWith('wing') ? 0.6 : 0.03)
      .setAngularDamping(name.startsWith('wing') ? 1.5 : 0.35)
      .setCcdEnabled(true);
    const body = W.createRigidBody(bd);

    src.geometry.computeBoundingBox();
    const bb = src.geometry.boundingBox;
    const he = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const ctr = bb.getCenter(new THREE.Vector3());
    const cd = RAPIER.ColliderDesc.cuboid(Math.max(0.03, he.x), Math.max(0.03, he.y), Math.max(0.03, he.z))
      .setTranslation(ctr.x, ctr.y, ctr.z)
      .setDensity(PART_DENSITY[name] ?? CFG.RAGDOLL_DENSITY)
      .setFriction(0.65)
      .setRestitution(0.28)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(2500);
    const col = W.createCollider(cd, body);
    col.userData = { kind: 'ragdoll', part: name };
    ragdoll.handleToPart.set(col.handle, name);
    ragdoll.bodies[name] = body;
  }

  // Articulaciones esféricas en el pivote del hijo
  for (const [pa, ch] of JOINTS) {
    const parent = rig.parts[pa], child = rig.parts[ch];
    child.getWorldPosition(_p);
    const a1 = parent.worldToLocal(_p.clone());
    const data = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: 0, y: 0, z: 0 });
    const j = W.createImpulseJoint(data, ragdoll.bodies[pa], ragdoll.bodies[ch], true);
    j.setContactsEnabled(false);
    const lim = LIMITS[ch];
    if (lim) {
      const [ax, ay, az] = AXES();
      jointLimits(j, ax, lim.x[0], lim.x[1]);
      jointLimits(j, ay, lim.y[0], lim.y[1]);
      jointLimits(j, az, lim.z[0], lim.z[1]);
    }
    ragdoll.joints.push({ j, name: ch });
  }
  // Sin colisión brazo-torso/pierna-pierna inmediata gracias a las articulaciones;
  // las alas no chocan con las piernas para evitar enganches.
  ragdoll.active = true;
  ragdoll.t = 0;
  ragdoll.tone = 1;
  ragdoll.settleTimer = 0;
  ragdoll.settled = false;
  ragdoll.lastImpact = {};
  ragdoll.stats = {
    damage: 0, fractures: 0, bounces: 0, distance: 0, maxSpeed: vel.length(),
    start: _c.clone(), last: _c.clone(), airtime: 0,
  };
  applyTone(1);
}

function applyTone(k) {
  for (const { j, name } of ragdoll.joints) {
    const wing = name.startsWith('wing');
    const stiff = (wing ? 6 : 26) * k + (wing ? 0.6 : 1.4);
    const damp = (wing ? 1.2 : 3.5) * k + 0.5;
    for (const ax of AXES()) jointMotor(j, ax, stiff, damp);
  }
}

/* Impulso extra (p. ej. al ser golpeado por una columna). */
export function kickRagdoll(impulse) {
  const b = ragdoll.bodies.torso;
  if (b) b.applyImpulse(impulse, true);
}

/* Procesa eventos de fuerza de contacto. onImpact(part, force, pos) */
export function handleContactForces(events, now, onImpact) {
  if (!ragdoll.active) return;
  events.drainContactForceEvents((ev) => {
    let part = ragdoll.handleToPart.get(ev.collider1());
    if (!part) part = ragdoll.handleToPart.get(ev.collider2());
    if (!part) return;
    const f = ev.totalForceMagnitude();
    const last = ragdoll.lastImpact[part] ?? -1;
    if (now - last < 0.09) return;
    ragdoll.lastImpact[part] = now;
    const st = ragdoll.stats;
    st.damage += Math.max(0, f - 2500) / 220 * (part === 'head' ? 1.8 : 1);
    st.bounces++;
    if (f > 38000 && !part.startsWith('wing')) st.fractures++;
    const t = ragdoll.bodies[part].translation();
    onImpact?.(part, f, _p.set(t.x, t.y, t.z));
  });
}

export function updateRagdoll(dt) {
  if (!ragdoll.active) return;
  ragdoll.t += dt;
  // El tono muscular se relaja en ~2 s
  const tone = Math.exp(-ragdoll.t * 1.4);
  if (Math.abs(tone - ragdoll.tone) > 0.08) { ragdoll.tone = tone; applyTone(tone); }

  let maxV = 0;
  for (const name in ragdoll.bodies) {
    const b = ragdoll.bodies[name];
    const t = b.translation(), r = b.rotation();
    const m = ragdoll.meshes[name];
    m.position.set(t.x, t.y, t.z);
    m.quaternion.set(r.x, r.y, r.z, r.w);
    const lv = b.linvel();
    maxV = Math.max(maxV, Math.hypot(lv.x, lv.y, lv.z));
  }
  const st = ragdoll.stats;
  const tt = ragdoll.bodies.torso.translation();
  _p.set(tt.x, tt.y, tt.z);
  st.distance += _p.distanceTo(st.last);
  st.last.copy(_p);
  st.maxSpeed = Math.max(st.maxSpeed, maxV);
  if (maxV < 0.8) ragdoll.settleTimer += dt; else ragdoll.settleTimer = 0;
  if (ragdoll.settleTimer > 1.2) ragdoll.settled = true;
}

export function ragdollCenter(out) {
  const t = ragdoll.bodies.torso.translation();
  return out.set(t.x, t.y, t.z);
}

export function ragdollVelocity(out) {
  const v = ragdoll.bodies.torso.linvel();
  return out.set(v.x, v.y, v.z);
}

export function clearRagdoll(scene) {
  const W = phys.world;
  for (const { j } of ragdoll.joints) W.removeImpulseJoint(j, true);
  for (const name in ragdoll.bodies) W.removeRigidBody(ragdoll.bodies[name]);
  if (ragdoll.group) scene.remove(ragdoll.group);
  ragdoll.bodies = {};
  ragdoll.meshes = {};
  ragdoll.joints = [];
  ragdoll.handleToPart.clear();
  ragdoll.group = null;
  ragdoll.active = false;
}
