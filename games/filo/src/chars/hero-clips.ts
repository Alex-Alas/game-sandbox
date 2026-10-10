// Clips de LA ERRANTE, escritos pose a pose como una hoja de animación.
// Coordenadas locales: x hacia donde mira, y hacia abajo, raíz en el suelo bajo la cadera.
// ff/fb = tobillo de la pierna de adelante/atrás, hf/hb = manos, bl = ángulo del filo (en el marco
// del cuerpo), sm = barrido del smear (rad), x = avance de la raíz, yw = altura en el mundo,
// rot = giro de todo el cuerpo alrededor de la cadera, sq = estirar/aplastar, gl = brillo del filo.
// Las claves con e: 'snap' llegan de golpe (el cuadro del tajo); 'h' sostiene la pose anterior.
import type { Clip, Pose } from '../rig.ts';

// la guardia, a la que vuelven todos los ataques
const G: Pose = { hip: [-2, -22.5], lean: 0.32, head: -0.24, ff: [9, 0], tf: -0.05, fb: [-10, 0], tb: 0.15, hf: [5, -17], hb: [-2, -16], ef: -1, eb: 1, bl: 2.78, cl: 0.1, sm: 0, eye: 1, sq: 1, rot: 0, yw: 0, gl: 0 };
const at = (x: number, extra: Pose = {}): Pose => ({ ...G, x, ...extra });

const idle: Clip = {
  id: 'idle', label: 'En guardia', fps: 12, loop: true, frames: 24,
  keys: [
    { f: 0, p: { ...G }, e: 'io' },
    { f: 12, p: { hip: [-2, -21.6], lean: 0.36, head: -0.2, hf: [5.3, -16.3], hb: [-1.6, -15.4], bl: 2.74, cl: 0.16 }, e: 'io' },
  ],
};

const run: Clip = {
  id: 'run', label: 'Correr', fps: 16, loop: true, frames: 8,
  keys: [
    { f: 0, p: { ...G, hip: [1, -24.6], lean: 0.46, head: -0.32, ff: [15, 0], tf: -0.25, fb: [-12, -5], tb: 0.8, hf: [-8, -19.5], hb: [9, -19], ef: 1, bl: 2.86, cl: 0.55 } },
    { f: 1, p: { hip: [1, -22.6], ff: [7, 0], tf: 0, fb: [-6, -11], tb: 0.6, hf: [-7.5, -18.5], hb: [5, -17.5], bl: 2.9 } },
    { f: 2, p: { hip: [1, -24.8], ff: [-3, 0], tf: 0.25, fb: [6, -13], tb: 0.1, hf: [-8, -19.5], hb: [-1, -16.5], bl: 2.86 } },
    { f: 3, p: { hip: [1, -26.8], ff: [-11, -3], tf: 0.8, fb: [14, -6], tb: -0.25, hf: [-8.5, -20.5], hb: [-6, -18], bl: 2.82 } },
    { f: 4, p: { hip: [1, -24.6], ff: [-12, -5], tf: 0.8, fb: [15, 0], tb: -0.25, hf: [-8, -19.5], hb: [-8.5, -19.5], bl: 2.86 } },
    { f: 5, p: { hip: [1, -22.6], ff: [-6, -11], tf: 0.6, fb: [7, 0], tb: 0, hf: [-7.5, -18.5], hb: [-4, -18], bl: 2.9 } },
    { f: 6, p: { hip: [1, -24.8], ff: [6, -13], tf: 0.1, fb: [-3, 0], tb: 0.25, hf: [-8, -19.5], hb: [2, -16.5], bl: 2.86 } },
    { f: 7, p: { hip: [1, -26.8], ff: [14, -6], tf: -0.25, fb: [-11, -3], tb: 0.8, hf: [-8.5, -20.5], hb: [7, -18], bl: 2.82 } },
  ],
  ev: [{ f: 0, k: 'step', foot: 'ff' }, { f: 4, k: 'step', foot: 'fb' }],
};

// 1 · TAJO: se enrosca con el filo sobre el hombro y lo descarga en diagonal hacia adelante
const slash1: Clip = {
  id: 'slash1', label: 'Tajo', fps: 20, loop: false, frames: 13,
  keys: [
    { f: 0, p: at(0) },
    { f: 1, p: { hip: [-4, -21.5], lean: -0.04, head: -0.04, hf: [-11, -42], ef: 1, bl: -2.25, hb: [6, -29], eye: 0.55, ff: [10, 0], tf: -0.1, fb: [-11, 0], cl: 0.2 }, e: 'o' },
    { f: 2, p: { hip: [-4.5, -21], lean: -0.08, hf: [-12, -43.5], bl: -2.42 }, e: 'io' },
    { f: 3, p: { x: 7, hip: [5, -21], lean: 0.55, head: -0.36, hf: [26, -27], bl: 0.35, sm: 2.77, hb: [-6, -24], ff: [20, 0], tf: -0.2, fb: [-6, -1], tb: 0.6, eye: 0.35, cl: 0.55 }, e: 'snap' },
    { f: 4, p: { x: 9, hip: [6, -20.5], lean: 0.62, hf: [27, -21], bl: 0.6, sm: 0.3 }, e: 'o' },
    { f: 7, p: { x: 9.5, hip: [6, -20.3], lean: 0.6, hf: [26.5, -20.5], bl: 0.64, sm: 0 }, e: 'io' },
    { f: 9, p: { x: 10, hip: [2, -23.4], lean: 0.3, head: -0.26, hf: [10, -36], bl: -1.7, eye: 0.8, ff: [12, 0], fb: [-10, 0], tb: 0.15 }, e: 'io' },
    { f: 12, p: at(10, { bl: 2.78 - Math.PI * 2 }), e: 'io' },
  ],
  ev: [{ f: 3, k: 'hit', reach: 60, dmg: 1, kb: 60 }, { f: 3, k: 'swing' }],
};

// 2 · REVÉS: baja, y sube cortando de abajo hacia arriba con un saltito
const slash2: Clip = {
  id: 'slash2', label: 'Revés ascendente', fps: 20, loop: false, frames: 14,
  keys: [
    { f: 0, p: at(0) },
    { f: 1, p: { hip: [-3, -19], lean: 0.48, head: -0.34, hf: [-9, -12], ef: 1, bl: 2.5, hb: [4, -22], eye: 0.5, ff: [10, 0], fb: [-11, 0], tb: 0.25, cl: 0.25 }, e: 'o' },
    { f: 2, p: { hip: [-3.5, -18.4], hf: [-10, -11], bl: 2.62 }, e: 'io' },
    { f: 3, p: { x: 6, yw: 4, hip: [4, -27], lean: 0.06, head: -0.14, hf: [14, -45], bl: -1.15, sm: -3.77, hb: [-8, -30], ff: [12, -1], tf: 0.35, fb: [-6, -3], tb: 0.7, eye: 0.3, cl: 0.65 }, e: 'snap' },
    { f: 4, p: { x: 8, yw: 6, hip: [4, -28], lean: 0.0, hf: [9, -51], bl: -1.6, sm: -0.5 }, e: 'o' },
    { f: 6, p: { x: 8.5, yw: 5.5, hf: [8.6, -51], bl: -1.66, sm: 0 }, e: 'io' },
    { f: 8, p: { x: 9, yw: 0, hip: [2, -20.5], lean: 0.4, sq: 0.92, hf: [6, -36], bl: -2.4, ff: [11, 0], tf: 0, fb: [-9, 0], tb: 0.2, eye: 0.7 }, e: 'i' },
    { f: 10, p: { sq: 1, hip: [0, -22], hf: [2, -26], bl: -3.0 }, e: 'o' },
    { f: 13, p: at(9, { bl: 2.78 - Math.PI * 2 }), e: 'io' },
  ],
  ev: [{ f: 3, k: 'hit', reach: 58, dmg: 1, kb: 40, up: 120 }, { f: 3, k: 'swing' }, { f: 8, k: 'land', power: 0.5 }],
};

// 3 · MEDIA LUNA: se agacha, salta girando con el filo extendido (un círculo entero) y lo clava
const slash3: Clip = {
  id: 'slash3', label: 'Media luna', fps: 20, loop: false, frames: 20,
  keys: [
    { f: 0, p: at(0) },
    { f: 2, p: { hip: [-4, -15], lean: 0.6, head: -0.5, hf: [-6, -12], ef: 1, bl: 2.75, hb: [6, -14], ff: [10, 0], fb: [-12, 0], tb: 0.3, sq: 0.86, eye: 0.4, cl: 0.3 }, e: 'o' },
    { f: 4, p: { hip: [-4, -14.5], sq: 0.84, hf: [-7, -11.5], bl: 2.8 }, e: 'io' },
    { f: 5, p: { x: 6, yw: 12, sq: 1.16, hip: [2, -27], lean: 0.1, head: -0.1, hf: [14, -36], bl: 0.2, rot: 0.35, ff: [4, -6], tf: 0.6, fb: [-6, -4], tb: 0.7, cl: 0.85, eye: 0.3 }, e: 'snap' },
    { f: 6, p: { x: 11, yw: 26, sq: 1, rot: 1.9, sm: 1.45, hf: [16, -32], bl: 0.25, ff: [6, -14], tf: 0.4, fb: [-2, -12], tb: 0.5, hb: [-4, -30] }, e: 'l' },
    { f: 7, p: { x: 15, yw: 32, rot: 3.45, sm: 1.5 }, e: 'l' },
    { f: 8, p: { x: 19, yw: 27, rot: 5.0, sm: 1.5 }, e: 'l' },
    { f: 9, p: { x: 22, yw: 10, rot: 6.28, sm: 1.3, hf: [17, -18], bl: 0.95, ff: [8, -4], fb: [-6, -2] }, e: 'l' },
    { f: 10, p: { x: 23, yw: 0, rot: 6.28, sm: 0.3, sq: 0.8, hip: [3, -15], lean: 0.62, head: -0.5, hf: [20, -11], bl: 1.28, ff: [13, 0], tf: 0, fb: [-12, 0], tb: 0.3, cl: 0.4 }, e: 'snap' },
    { f: 11, p: { sq: 0.84, sm: 0 }, e: 'o' },
    { f: 14, p: { sq: 0.86, hip: [3, -15.4] }, e: 'io' },
    { f: 16, p: { sq: 0.96, hip: [1, -20], lean: 0.45, hf: [12, -16], bl: 1.7, eye: 0.8 }, e: 'io' },
    { f: 19, p: at(23, { rot: 6.28 }), e: 'io' },
  ],
  ev: [{ f: 5, k: 'jumpdust' }, { f: 6, k: 'swing' }, { f: 7, k: 'hit', reach: 64, dmg: 2, kb: 80, up: 60 }, { f: 10, k: 'impact' }],
};

// ESTOCADA: retrocede el filo a la cadera y se lanza recta, se frena derrapando
const thrust: Clip = {
  id: 'thrust', label: 'Estocada', fps: 20, loop: false, frames: 15,
  keys: [
    { f: 0, p: at(0) },
    { f: 1, p: { hip: [-6, -19.5], lean: 0.18, head: -0.12, hf: [-12, -24], ef: 1, bl: 0.02, hb: [10, -31], eb: -1, eye: 0.45, ff: [8, 0], fb: [-14, 0], tb: 0.3, cl: 0.2 }, e: 'o' },
    { f: 2, p: { hip: [-7, -19], hf: [-13, -23.5] }, e: 'io' },
    { f: 3, p: { x: 46, hip: [8, -22], lean: 0.78, head: -0.62, hf: [31, -27], bl: -0.04, hb: [-14, -26], eb: 1, sq: 0.88, ff: [22, -2], tf: -0.3, fb: [-17, -4], tb: 0.95, cl: 1, eye: 0.25 }, e: 'snap' },
    { f: 4, p: { x: 55, hf: [32, -26.5], sq: 0.92 }, e: 'o' },
    { f: 6, p: { x: 61, hip: [4, -19], lean: 0.52, head: -0.4, sq: 0.97, hf: [27, -24], bl: 0.1, ff: [18, 0], tf: -0.1, fb: [-13, 0], tb: 0.2, cl: 0.6 }, e: 'o' },
    { f: 9, p: { x: 62, hip: [4, -19.2], hf: [26, -23.5] }, e: 'io' },
    { f: 11, p: { x: 62, hip: [1, -22.5], lean: 0.3, head: -0.25, hf: [10, -38], bl: -1.6, sq: 1, eye: 0.8, cl: 0.3 }, e: 'io' },
    { f: 14, p: at(62, { bl: 2.78 - Math.PI * 2 }), e: 'io' },
  ],
  ev: [{ f: 3, k: 'dash' }, { f: 3, k: 'hit', reach: 40, dmg: 1, kb: 90, line: true }, { f: 6, k: 'skid' }],
};

// TAJO CARGADO: se agacha, el filo se enciende de a poco (tiembla), y libera una onda
const charge: Clip = {
  id: 'charge', label: 'Tajo cargado', fps: 16, loop: false, frames: 24,
  keys: [
    { f: 0, p: at(0) },
    { f: 2, p: { hip: [-5, -18.5], lean: 0.42, head: -0.32, hf: [-11, -15], ef: 1, bl: 2.95, hb: [6, -22], ff: [10, 0], fb: [-13, 0], tb: 0.3, eye: 0.35, cl: 0.25, gl: 0.1 }, e: 'o' },
    { f: 4, p: { hip: [-5.4, -18.2], gl: 0.3 }, e: 'l' },
    { f: 5, p: { hip: [-4.6, -18.3], gl: 0.4 }, e: 'l' },
    { f: 6, p: { hip: [-5.4, -18.1], gl: 0.5 }, e: 'l' },
    { f: 7, p: { hip: [-4.6, -18.3], gl: 0.6 }, e: 'l' },
    { f: 8, p: { hip: [-5.5, -18.0], gl: 0.72 }, e: 'l' },
    { f: 9, p: { hip: [-4.5, -18.2], gl: 0.82 }, e: 'l' },
    { f: 10, p: { hip: [-5.6, -17.9], gl: 0.92, eye: 0.2 }, e: 'l' },
    { f: 11, p: { hip: [-4.4, -18.1], gl: 1 }, e: 'l' },
    { f: 12, p: { hip: [-5, -17.8], gl: 1, sq: 0.94 }, e: 'h' },
    { f: 13, p: { x: 10, hip: [5, -21], lean: 0.62, head: -0.4, hf: [26, -28], bl: 0.12, sm: 2.83, hb: [-8, -24], ff: [20, 0], tf: -0.2, fb: [-8, -1], tb: 0.6, sq: 1, cl: 0.8, gl: 1 }, e: 'snap' },
    { f: 14, p: { x: 12, hf: [27, -22], bl: 0.62, sm: 0.5, gl: 0.7 }, e: 'o' },
    { f: 17, p: { x: 12.5, sm: 0, gl: 0.3 }, e: 'io' },
    { f: 20, p: { x: 12.5, hip: [2, -23], lean: 0.3, head: -0.25, hf: [10, -38], bl: -1.6, gl: 0.1, eye: 0.8, cl: 0.3 }, e: 'io' },
    { f: 23, p: at(12.5, { bl: 2.78 - Math.PI * 2 }), e: 'io' },
  ],
  ev: [{ f: 3, k: 'charge' }, { f: 13, k: 'wave' }, { f: 13, k: 'swing' }],
};

// SALTO: anticipación, impulso, vuelo con las piernas recogidas, caída y aterrizaje aplastado
const jump: Clip = {
  id: 'jump', label: 'Salto', fps: 16, loop: false, frames: 14,
  keys: [
    { f: 0, p: at(0) },
    { f: 1, p: { hip: [-1, -18.5], lean: 0.42, head: -0.3, sq: 0.84, hf: [-2, -14], bl: 2.6, hb: [-6, -14], cl: 0.2 }, e: 'o' },
    { f: 2, p: { yw: 8, sq: 1.2, hip: [0, -28], lean: 0.12, head: -0.1, ff: [3, -2], tf: 0.9, fb: [-4, -4], tb: 1, hf: [-8, -40], bl: 2.2, hb: [8, -42], cl: 0.9 }, e: 'snap' },
    { f: 3, p: { yw: 26, sq: 1.06, ff: [7, -12], tf: 0.3, fb: [-3, -9], tb: 0.6 }, e: 'o' },
    { f: 4, p: { yw: 38, sq: 1.0, ff: [8, -13], fb: [-1, -12], hf: [-9, -32], bl: 2.6, hb: [6, -34], lean: 0.25 }, e: 'o' },
    { f: 5, p: { yw: 41 }, e: 'io' },
    { f: 6, p: { yw: 38, ff: [6, -7], tf: 0, fb: [-4, -5], tb: 0.2, hf: [-10, -30], hb: [8, -36] }, e: 'i' },
    { f: 7, p: { yw: 26, sq: 1.06, ff: [6, -3], fb: [-6, -2] }, e: 'i' },
    { f: 8, p: { yw: 8, sq: 1.08, ff: [7, -1], fb: [-8, 0] }, e: 'i' },
    { f: 9, p: { yw: 0, sq: 0.8, hip: [-1, -17], lean: 0.5, head: -0.36, ff: [10, 0], fb: [-11, 0], tb: 0.2, hf: [3, -12], bl: 2.6, hb: [-4, -12], cl: 0.4 }, e: 'snap' },
    { f: 10, p: { sq: 0.88 }, e: 'o' },
    { f: 13, p: at(0), e: 'io' },
  ],
  ev: [{ f: 2, k: 'jumpdust' }, { f: 9, k: 'land', power: 1 }],
};

// AMAGUE (dash): se inclina y desaparece hacia adelante dejando estelas
const dash: Clip = {
  id: 'dash', label: 'Amague', fps: 20, loop: false, frames: 11,
  keys: [
    { f: 0, p: at(0) },
    { f: 1, p: { hip: [-3, -20], lean: 0.6, head: -0.5, sq: 0.92, hf: [-10, -18], ef: 1, bl: 3.0, cl: 0.4, eye: 0.5 }, e: 'o' },
    { f: 2, p: { x: 30, hip: [2, -21], lean: 0.95, head: -0.75, sq: 0.84, ff: [14, -3], tf: -0.3, fb: [-16, -6], tb: 1, hf: [-14, -22], bl: 3.05, hb: [-12, -24], cl: 1 }, e: 'snap' },
    { f: 3, p: { x: 58 }, e: 'l' },
    { f: 4, p: { x: 72, sq: 0.95, lean: 0.7, ff: [14, 0], fb: [-12, 0], tb: 0.3 }, e: 'o' },
    { f: 6, p: { x: 76, hip: [0, -20], lean: 0.5, sq: 1, cl: 0.5 }, e: 'o' },
    { f: 10, p: at(77), e: 'io' },
  ],
  ev: [{ f: 2, k: 'dash' }, { f: 4, k: 'skid' }],
};

// GOLPE RECIBIDO: la cabeza se va atrás, el cuerpo se arquea, retrocede
const hurt: Clip = {
  id: 'hurt', label: 'Golpe recibido', fps: 16, loop: false, frames: 10,
  keys: [
    { f: 0, p: { ...G, x: -6, hip: [-5, -24], lean: -0.42, head: 0.38, eye: 0.1, hf: [-2, -30], ef: 1, bl: -1.9, hb: [-12, -30], ff: [10, -2], tf: -0.4, fb: [-9, 0], cl: 0.7 }, e: 'snap' },
    { f: 2, p: { x: -11, hip: [-5, -23], lean: -0.3, head: 0.25, eye: 0.2, hf: [0, -26], bl: -1.2 }, e: 'o' },
    { f: 5, p: { x: -13, hip: [-3, -21], lean: 0.2, head: -0.1, eye: 0.6, hf: [4, -18], bl: 1.4, ff: [9, 0], fb: [-10, 0] }, e: 'io' },
    { f: 9, p: at(-13), e: 'io' },
  ],
  ev: [{ f: 0, k: 'hurt' }],
};

export const HERO_CLIPS: Record<string, Clip> = { idle, run, slash1, slash2, slash3, thrust, charge, jump, dash, hurt };
