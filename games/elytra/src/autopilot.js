/* Piloto automático de depuración: vuela hacia la siguiente puerta compensando el
   derrape. Sirve para calibrar las medallas y probar el fantasma sin jugar
   (`__elytra.autopilot(true)` + `__elytra.advance(seg)`). No es parte del juego. */
import * as THREE from 'three';
import { course } from './course.js';
import { player, tryBoost, tryFlap } from './player.js';

export const autopilot = { on: false, boost: true, target: null };   // target: picado directo (DESPLOME)

const RATE = 3.2;          // rad/s máximos de giro del morro
const _to = new THREE.Vector3();
const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Ajusta yaw/pitch del jugador y devuelve la postura (tuck/flare) para este frame. */
export function steerAutopilot(dt) {
  const p = player;
  const g = course.gates[course.next];
  const dive = !!autopilot.target;
  _to.copy(dive ? autopilot.target : g.pos).sub(p.pos);
  const dist = _to.length();
  // Lejos: apuntar a un punto delante de la puerta para cruzarla de frente
  if (!dive && dist > 90) _to.addScaledVector(g.normal, -Math.min(70, dist * 0.25));
  _to.normalize();

  // Adelanto: el morro se pasa del objetivo lo que la velocidad va desviada
  const spd = p.vel.length();
  _v.copy(p.vel).divideScalar(Math.max(spd, 1e-3));
  _aim.copy(_to).addScaledVector(_to.clone().sub(_v), 0.9).normalize();
  // Sin margen de suelo: levantar el morro
  if (!dive && p.groundDist < 22 && _aim.y < 0.15) _aim.y = 0.15 + (22 - p.groundDist) * 0.02;
  if (!dive && spd < 32) _aim.y = Math.min(_aim.y, 0.05);
  _aim.normalize();

  const yaw = Math.atan2(-_aim.x, -_aim.z);
  const pitch = Math.asin(THREE.MathUtils.clamp(_aim.y, -1, 1));
  const max = RATE * dt;
  p.yaw += THREE.MathUtils.clamp(wrap(yaw - p.yaw), -max, max);
  p.pitch += THREE.MathUtils.clamp(pitch - p.pitch, -max, max);

  if (spd < 22) tryFlap();
  if (autopilot.boost && p.energy > 70 && _v.dot(_to) > 0.97 && spd < 160 && dist > 120) tryBoost();
  if (dive) return { tuck: true, flare: false };
  return { tuck: _to.y < -0.2 && dist > 160 && p.groundDist > 40, flare: _v.dot(_to) < 0.5 && dist < 140 };
}
