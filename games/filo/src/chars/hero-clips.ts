// Clips de LA ERRANTE, escritos pose a pose como una hoja de animación.
// Coordenadas locales: x hacia donde mira, y hacia abajo, raíz en el suelo bajo la cadera.
// ff/fb = tobillo de la pierna de adelante/atrás, hf/hb = manos, bl = ángulo del filo.
import type { Clip } from '../rig.ts';

const run: Clip = {
  id: 'run', label: 'Correr', fps: 16, loop: true, frames: 8,
  keys: [
    { f: 0, p: { hip: [1, -24.6], lean: 0.46, head: -0.32, ff: [15, 0], tf: -0.25, fb: [-12, -5], tb: 0.8, hf: [-8, -19.5], hb: [9, -19], bl: 2.86, cl: 0.55 } },
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

// En guardia: el filo arrastrado atrás, rodillas abiertas, el peso adelante; respira con hombros y capa
const idle: Clip = {
  id: 'idle', label: 'En guardia', fps: 12, loop: true, frames: 24,
  keys: [
    { f: 0, p: { hip: [-2, -22.5], lean: 0.32, head: -0.24, ff: [9, 0], tf: -0.05, fb: [-10, 0], tb: 0.15, hf: [5, -17], hb: [-2, -16], ef: -1, bl: 2.78, cl: 0.1 }, e: 'io' },
    { f: 12, p: { hip: [-2, -21.6], lean: 0.36, head: -0.2, hf: [5.3, -16.3], hb: [-1.6, -15.4], bl: 2.74, cl: 0.16 }, e: 'io' },
  ],
};

export const HERO_CLIPS: Record<string, Clip> = { idle, run };
