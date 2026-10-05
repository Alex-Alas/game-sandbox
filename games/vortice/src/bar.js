// VÓRTICE — control de BARRA (una mano). Una barra abajo con una sección por lado del
// hexágono: tocar/arrastrar marca a qué lado ir y el jugador gira hacia ahí (con el mismo
// `dir` ∈ {-1, 0, 1} que el teclado, así la sim no cambia). La sección del centro es el
// lado actual; la barra llega a BAR_HALF lados a cada lado y tiene tope (las dos puntas son
// el lado opuesto): se cambia flexibilidad por precisión. El SALTO la recentra: la barra
// se cierra en un hexágono, el jugador cruza por el centro y se vuelve a abrir centrada.
// Lógica pura salvo el layout, que recibe el tamaño de pantalla.
import { SEG, TAU, DT } from './const.js';
import { sideOf } from './sim.js';

export const BAR_HALF = 3.5;   // lados a cada lado del centro: 7 secciones, todos alcanzables
export const MORPH = { in: 0.13, cross: 0.17, out: 0.16 }; // s de cada fase de la animación
export const MORPH_T = MORPH.in + MORPH.cross + MORPH.out;

// pos: dónde está el jugador en la barra (en lados, 0 = centro de la sección del medio)
export function createBar() { return { ref: 0, pos: 0, lastA: 0, anim: null }; }

// Recentra en el lado de `a` (la sección del medio pasa a ser ese lado)
export function barReset(b, a) {
  b.ref = sideOf(a);
  b.pos = (a - (b.ref + 0.5) * SEG) / SEG;
  b.lastA = a;
}

// Tras cada paso: acumula el giro sin envolver. Si otra entrada (teclado) lo sacó de la
// barra, se recentra.
export function barTrack(b, a) {
  let d = (a - b.lastA) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  b.pos += d / SEG; b.lastA = a;
  if (Math.abs(b.pos) > BAR_HALF + 0.02) barReset(b, a);
}

// Giro hacia el objetivo u (en lados); se detiene a menos de medio paso
export function barDir(b, u, w) {
  const d = u - b.pos;
  return Math.abs(d) < (w * DT / SEG) * 0.6 ? 0 : Math.sign(d);
}

// Animación del SALTO: de la barra con `ref` viejo al hexágono, cruce y vuelta a la barra
export function barFlip(b, from, to) {
  const prev = b.anim;
  const fromRef = b.ref, fromPos = b.pos;
  barReset(b, to);
  // un salto encima de otro (¡POR UN PELO! devuelve la recarga) arranca ya cerrado
  const t = prev && prev.t > MORPH.in ? MORPH.in : 0;
  b.anim = { t, fromRef, fromPos, fromA: from, toA: to };
}

// Geometría en pantalla. Vertical: centrada abajo. Horizontal: del lado de la mano.
export function barLayout(W, H, hand = 'der') {
  const land = W > H * 1.1;
  const L = land ? Math.min(W * 0.42, 420) : Math.min(W - 40, 460);
  const cx = land ? (hand === 'izq' ? 28 + L / 2 : W - 28 - L / 2) : W / 2;
  const y = H - (land ? 46 : 68);
  return { x0: cx - L / 2, x1: cx + L / 2, cx, y, h: land ? 18 : 22, sw: L / (2 * BAR_HALF) };
}

// ¿El toque cae en la zona de la barra? (más generosa que lo dibujado)
export const inBarZone = (L, x, y) => x >= L.x0 - 30 && x <= L.x1 + 30 && y >= L.y - 64;

// Posición x en pantalla → objetivo en lados, con tope en las puntas
export function barU(L, x) {
  const u = (x - L.cx) / L.sw;
  return Math.max(-BAR_HALF + 0.03, Math.min(BAR_HALF - 0.03, u));
}
