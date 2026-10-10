// Clips del VERDUGO: pesados, con anticipaciones largas (se leen de lejos) e impactos que paran el mundo.
import type { Clip, Pose } from '../rig.ts';

// reposo: el hacha descansa sobre el hombro, encorvado, respira con todo el lomo
const G: Pose = { hip: [-4, -37], lean: 0.52, head: -0.28, jaw: 0, hf: [22, -56], hb: [-10, -40], ef: 1, eb: 1, ff: [14, 0], tf: 0, fb: [-17, 0], tb: 0.1, bl: -2.25, sm: 0, eye: 1, cl: 0, br: 0, sq: 1, rot: 0, gl: 0, bz: -1 };
const at = (x: number, extra: Pose = {}): Pose => ({ ...G, x, ...extra });

const idle: Clip = {
  id: 'idle', label: 'Acecho', fps: 10, loop: true, frames: 22,
  keys: [
    { f: 0, p: { ...G }, e: 'io' },
    { f: 11, p: { hip: [-4, -35.4], lean: 0.47, head: -0.34, br: 1.8, hf: [22, -58], hb: [-10, -42], bl: -2.2, cl: 0.1 }, e: 'io' },
  ],
};

const walk: Clip = {
  id: 'walk', label: 'Avance pesado', fps: 10, loop: true, frames: 8,
  keys: [
    { f: 0, p: { ...G, hip: [0, -36], lean: 0.55, ff: [20, 0], tf: -0.1, fb: [-16, 0], tb: 0.2, hb: [-14, -40] } },
    { f: 1, p: { hip: [0, -34], ff: [12, 0], tf: 0, fb: [-10, -6], tb: 0.4, hb: [-10, -40] } },
    { f: 2, p: { hip: [0, -38], ff: [2, 0], fb: [2, -9], tb: 0.2, hb: [-6, -42] } },
    { f: 3, p: { hip: [0, -39], ff: [-10, 0], tf: 0.2, fb: [14, -5], tb: -0.1, hb: [-2, -42] } },
    { f: 4, p: { hip: [0, -36], ff: [-16, 0], tf: 0.2, fb: [20, 0], tb: -0.1, hb: [0, -40] } },
    { f: 5, p: { hip: [0, -34], ff: [-10, -6], tf: 0.4, fb: [12, 0], tb: 0, hb: [-4, -40] } },
    { f: 6, p: { hip: [0, -38], ff: [2, -9], tf: 0.2, fb: [2, 0], hb: [-8, -42] } },
    { f: 7, p: { hip: [0, -39], ff: [14, -5], tf: -0.1, fb: [-10, 0], tb: 0.2, hb: [-12, -42] } },
  ],
  ev: [{ f: 0, k: 'stomp', foot: 'ff' }, { f: 4, k: 'stomp', foot: 'fb' }],
};

// HACHAZO: levanta el hacha sobre la cabeza (se sostiene, tiembla) y parte el suelo
const slam: Clip = {
  id: 'slam', label: 'Hachazo', fps: 14, loop: false, frames: 26,
  keys: [
    { f: 0, p: at(0) },
    { f: 3, p: { hip: [-9, -40], lean: -0.05, head: -0.65, jaw: 0.5, hf: [4, -104], bl: -1.75, hb: [6, -96], eb: -1, ff: [16, 0], fb: [-18, 0], br: 2.5, cl: 0.3, bz: 1, gl: 0.3 }, e: 'o' },
    { f: 5, p: { hip: [-10, -40.5], lean: -0.1, hf: [2, -106], bl: -1.95, jaw: 0.6 }, e: 'io' },
    { f: 6, p: { hip: [-9, -40], hf: [3, -105.5], gl: 0.6 }, e: 'l' },
    { f: 7, p: { hip: [-10, -40.6], hf: [2, -106.5], gl: 0.8 }, e: 'l' },
    { f: 8, p: { x: 8, hip: [6, -29], lean: 0.95, head: -0.5, jaw: 0.2, hf: [54, -32], bl: 1.12, sm: 3.07, hb: [40, -30], ff: [24, 0], tf: -0.1, fb: [-20, 0], tb: 0.3, sq: 0.9, br: 0, cl: 0.8, gl: 1 }, e: 'snap' },
    { f: 9, p: { sq: 0.84, sm: 0.4, hip: [6, -27] }, e: 'o' },
    { f: 16, p: { sq: 0.88, sm: 0, hip: [6, -27.6], gl: 0.4 }, e: 'io' },
    { f: 20, p: { hip: [0, -34], lean: 0.6, head: -0.3, hf: [30, -70], bl: -0.8, hb: [-6, -42], eb: 1, sq: 1, jaw: 0, gl: 0.1 }, e: 'io' },
    { f: 25, p: at(8), e: 'io' },
  ],
  ev: [{ f: 3, k: 'growl' }, { f: 8, k: 'slam', dist: 78 }, { f: 8, k: 'hit', reach: 80, dmg: 2, kb: 120, up: 80 }],
};

// BARRIDO: tuerce el torso hacia atrás y arrastra el hacha por el suelo hacia adelante
const sweep: Clip = {
  id: 'sweep', label: 'Barrido', fps: 14, loop: false, frames: 24,
  keys: [
    { f: 0, p: at(0) },
    { f: 3, p: { hip: [-10, -35], lean: 0.25, head: -0.15, hf: [-30, -52], bl: 2.75, hb: [16, -50], eb: -1, ff: [16, 0], fb: [-18, 0], cl: 0.3, br: 1.6, jaw: 0.3, bz: 1 }, e: 'o' },
    { f: 5, p: { hip: [-11, -34.5], hf: [-32, -51], bl: 2.82 }, e: 'io' },
    { f: 6, p: { x: 14, hip: [8, -34], lean: 0.75, head: -0.4, hf: [58, -46], bl: 0.42, sm: -2.4, hb: [-20, -46], eb: 1, ff: [30, 0], tf: -0.1, fb: [-10, 0], tb: 0.3, cl: 0.9, br: 0, jaw: 0.6 }, e: 'snap' },
    { f: 7, p: { x: 17, hf: [60, -58], bl: -0.05, sm: -0.47 }, e: 'o' },
    { f: 12, p: { x: 18, hf: [58, -60], bl: -0.12, sm: 0, jaw: 0.2 }, e: 'io' },
    { f: 18, p: { hip: [0, -36], lean: 0.55, hf: [32, -66], bl: -1.2, hb: [-10, -40], jaw: 0, cl: 0.2 }, e: 'io' },
    { f: 23, p: at(18), e: 'io' },
  ],
  ev: [{ f: 6, k: 'scrape' }, { f: 6, k: 'hit', reach: 96, dmg: 2, kb: 140 }],
};

// RUGIDO: junta aire, levanta la cabeza y suelta una onda que sacude todo
const roar: Clip = {
  id: 'roar', label: 'Rugido', fps: 12, loop: false, frames: 28,
  keys: [
    { f: 0, p: at(0) },
    { f: 3, p: { hip: [-6, -33], lean: 0.75, head: 0.25, jaw: 0, br: -1, hf: [18, -48], hb: [-4, -34], cl: 0.1 }, e: 'io' },
    { f: 6, p: { hip: [-6, -41], lean: 0.12, head: -0.95, jaw: 1, br: 3.4, hf: [44, -76], bl: -1.0, hb: [-34, -72], eb: -1, cl: 0.6, gl: 1 }, e: 'snap' },
    { f: 7, p: { hip: [-5.4, -41.4] }, e: 'l' },
    { f: 8, p: { hip: [-6.6, -40.8] }, e: 'l' },
    { f: 9, p: { hip: [-5.4, -41.4] }, e: 'l' },
    { f: 10, p: { hip: [-6.6, -40.8] }, e: 'l' },
    { f: 11, p: { hip: [-5.4, -41.4] }, e: 'l' },
    { f: 16, p: { hip: [-6, -40], jaw: 0.8, gl: 0.6 }, e: 'io' },
    { f: 21, p: { hip: [-4, -36], lean: 0.5, head: -0.3, jaw: 0, br: 0.5, hf: [24, -60], bl: -2.0, hb: [-10, -40], eb: 1, gl: 0 }, e: 'io' },
    { f: 27, p: at(0), e: 'io' },
  ],
  ev: [{ f: 6, k: 'roar' }],
};

const hurt: Clip = {
  id: 'hurt', label: 'Golpe recibido', fps: 14, loop: false, frames: 11,
  keys: [
    { f: 0, p: { ...G, x: -4, hip: [-8, -38], lean: 0.18, head: 0.35, eye: 0.3, jaw: 0.5, hf: [16, -62], bl: -2.5, hb: [-18, -46], cl: 0.5 }, e: 'snap' },
    { f: 2, p: { x: -7, lean: 0.25, head: 0.2 }, e: 'o' },
    { f: 6, p: { x: -8, hip: [-5, -36], lean: 0.48, head: -0.2, eye: 0.8, jaw: 0, hf: [22, -57], bl: -2.3 }, e: 'io' },
    { f: 10, p: at(-8), e: 'io' },
  ],
  ev: [{ f: 0, k: 'hurt' }],
};

// CAÍDA: se tambalea, clava una rodilla y se deshace en brasas
const death: Clip = {
  id: 'death', label: 'Caída', fps: 12, loop: false, frames: 30,
  keys: [
    { f: 0, p: { ...G, hip: [-8, -38], lean: 0.15, head: 0.5, eye: 0.2, jaw: 0.8, hf: [20, -64], bl: -2.6, hb: [-20, -50], cl: 0.4 }, e: 'snap' },
    { f: 4, p: { x: -16, hip: [-6, -34], lean: 0.6, head: 0.1 }, e: 'o' },
    { f: 8, p: { x: -22, hip: [-2, -24], lean: 0.85, head: 0.35, ff: [18, 0], fb: [-14, -2], tb: 1.2, hf: [36, -12], bl: 1.45, hb: [10, -20], eye: 0.1, jaw: 0.3, bz: 1 }, e: 'i' },
    { f: 10, p: { x: -22, hip: [-2, -23], sq: 0.94 }, e: 'o' },
    { f: 29, p: { x: -22, hip: [-2, -22.5], sq: 0.95 }, e: 'io' },
  ],
  ev: [{ f: 8, k: 'kneel' }, { f: 12, k: 'die' }],
};

export const BRUTE_CLIPS: Record<string, Clip> = { idle, walk, slam, sweep, roar, hurt, death };
