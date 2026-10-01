/* Cámaras: tercera persona con brazo-resorte, primera persona, órbita del ragdoll
   y vuelo de presentación por el circuito. Incluye "trauma" para sacudidas. */
import * as THREE from 'three';
import { castRay } from './physics.js';
import { surfaceHeight } from './terrain.js';
import { player, forwardVector } from './player.js';
import { ragdoll, ragdollCenter, ragdollVelocity } from './ragdoll.js';
import { noise2 } from './noise.js';

export const cam = {
  mode: 'third',       // 'third' | 'first'
  trauma: 0,
  offset: new THREE.Vector3(0, 3, 10),
  orbitYaw: 0, orbitPitch: 0.35, orbitDist: 9,
  attract: null, attractT: 0,
  fovKick: 0,
};

const _fwd = new THREE.Vector3();
const _vd = new THREE.Vector3();
const _des = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
const _eul = new THREE.Euler();

export function addTrauma(t) { cam.trauma = Math.min(1, cam.trauma + t); }

function applyShake(camera, time) {
  const s = cam.trauma * cam.trauma;
  if (s <= 0.0001) return;
  camera.position.x += (noise2(time * 25, 1.3) - 0.5) * 2.2 * s;
  camera.position.y += (noise2(time * 25, 7.9) - 0.5) * 2.2 * s;
  camera.rotateZ((noise2(time * 20, 3.1) - 0.5) * 0.18 * s);
}

/* Evita que la cámara atraviese geometría. */
function clampCamera(from, to) {
  _dir.subVectors(to, from);
  const len = _dir.length();
  if (len < 0.01) return;
  _dir.divideScalar(len);
  const hit = castRay(from, _dir, len + 0.6);
  if (hit && hit.timeOfImpact < len + 0.6) to.copy(from).addScaledVector(_dir, Math.max(0.6, hit.timeOfImpact - 0.6));
  const gy = surfaceHeight(to.x, to.z) + 0.8;
  if (to.y < gy) to.y = gy;
}

export function updateFlightCamera(camera, dt, time) {
  const p = player;
  forwardVector(p.yaw, p.pitch, _fwd);
  const spd = p.speed;
  if (cam.mode === 'first') {
    camera.position.copy(p.rpos).addScaledVector(_fwd, 0.4);
    camera.rotation.set(p.pitch, p.yaw, p.bank * 0.6, 'YXZ');
  } else {
    // Mezcla entre la dirección de mira y la de la velocidad: se nota el derrape
    if (spd > 1) _vd.copy(p.vel).divideScalar(spd); else _vd.copy(_fwd);
    const look = _tmp.copy(_fwd).lerp(_vd, 0.35).normalize();
    const dist = 6.2 + Math.min(spd * 0.014, 3.5) - p.tuck * 0.8 + p.flare * 0.8;
    _q.setFromEuler(_eul.set(p.pitch, p.yaw, p.bank * 0.35, 'YXZ'));
    _up.set(0, 1, 0).applyQuaternion(_q);
    _des.copy(look).multiplyScalar(-dist).addScaledVector(_up, 1.7);
    cam.offset.lerp(_des, 1 - Math.exp(-dt * 9));
    camera.position.copy(p.rpos).add(cam.offset);
    clampCamera(p.rpos, camera.position);
    _look.copy(p.rpos).addScaledVector(_fwd, 24).addScaledVector(_up, 1.0);
    camera.up.copy(_up);
    camera.lookAt(_look);
    camera.up.set(0, 1, 0);
  }
  const fov = 70 + Math.min(spd * 0.075, 30) + p.boostFlash * 9 + cam.fovKick - p.flare * 3;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
  cam.fovKick = Math.max(0, cam.fovKick - dt * 20);
  applyShake(camera, time);
  cam.trauma = Math.max(0, cam.trauma - dt * 1.4);
}

export function startRagdollCamera(camera) {
  ragdollCenter(_tmp);
  _dir.subVectors(camera.position, _tmp);
  cam.orbitDist = THREE.MathUtils.clamp(_dir.length(), 6, 12);
  cam.orbitYaw = Math.atan2(_dir.x, _dir.z);
  cam.orbitPitch = THREE.MathUtils.clamp(Math.asin(_dir.y / Math.max(0.01, _dir.length())), 0.18, 0.7);
}

export function orbitInput(dx, dy) {
  cam.orbitYaw -= dx * 0.004;
  cam.orbitPitch = THREE.MathUtils.clamp(cam.orbitPitch + dy * 0.003, -0.2, 1.35);
}

export function zoomInput(delta) {
  cam.orbitDist = THREE.MathUtils.clamp(cam.orbitDist + delta * 0.01, 4, 30);
}

export function updateRagdollCamera(camera, dt, time) {
  if (!ragdoll.active) return;
  ragdollCenter(_look);
  ragdollVelocity(_vd);
  const spd = _vd.length();
  const dist = cam.orbitDist + Math.min(spd * 0.06, 8);
  _des.set(
    Math.sin(cam.orbitYaw) * Math.cos(cam.orbitPitch),
    Math.sin(cam.orbitPitch),
    Math.cos(cam.orbitYaw) * Math.cos(cam.orbitPitch),
  ).multiplyScalar(dist).add(_look);
  clampCamera(_look, _des);
  camera.position.lerp(_des, 1 - Math.exp(-dt * 6));
  camera.lookAt(_look);
  camera.fov += (62 - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
  applyShake(camera, time);
  cam.trauma = Math.max(0, cam.trauma - dt * 1.2);
}

/* Cámara de presentación: recorre el circuito. */
export function updateAttractCamera(camera, dt, gates) {
  if (!cam.attract) {
    const pts = gates.map((g) => g.pos.clone().add(new THREE.Vector3(0, 6, 0)));
    cam.attract = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    cam.attractLen = cam.attract.getLength();
  }
  cam.attractT = (cam.attractT + (dt * 55) / cam.attractLen) % 1;
  const p = cam.attract.getPointAt(cam.attractT);
  const a = cam.attract.getPointAt((cam.attractT + 0.012) % 1);
  p.y = Math.max(p.y, surfaceHeight(p.x, p.z) + 6);
  camera.position.lerp(p, 1 - Math.exp(-dt * 3));
  camera.lookAt(a);
  camera.fov = 68;
  camera.updateProjectionMatrix();
}
