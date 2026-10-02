/* Viento del circuito (weather.wind): dirección fija y ráfagas que dependen solo del
   tiempo de carrera, así que son iguales en cada intento y el fantasma las vivió igual.
   dir: grados hacia donde sopla (0 = −Z/norte, 90 = +X/este). */
import * as THREE from 'three';
import { ACTIVE } from './course.js';
import { noise2, smoothstep } from './noise.js';

const W = ACTIVE.weather?.wind ?? null;
const DIR = new THREE.Vector3();
if (W) {
  const a = THREE.MathUtils.degToRad(W.dir);
  DIR.set(Math.sin(a), 0, -Math.cos(a));
}

export const hasWind = !!W;

/** Intensidad de ráfaga en [0, 1] para el instante de carrera t: pulsos suaves. */
export function gustAt(t) {
  return W ? smoothstep(0.5, 0.78, noise2(t * 0.34 + 3.1, 7.7)) : 0;
}

/** Vector de viento (m/s) en el instante de carrera t. */
export function windAt(t, out) {
  if (!W) return out.set(0, 0, 0);
  return out.copy(DIR).multiplyScalar(W.speed + W.gust * gustAt(t));
}
