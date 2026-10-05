// VÓRTICE — control de BARRA (una mano). Una barra abajo con una sección por lado del
// hexágono: tocar/arrastrar marca a qué lado ir y el jugador gira hacia ahí (con el mismo
// `dir` ∈ {-1, 0, 1} que el teclado, así la sim no cambia). La sección del centro es el
// lado de partida y se ven BAR_HALF lados a cada lado. La barra es una ventana sobre una
// banda sin fin: con el dedo cerca de una punta (EDGE) la banda se corre hacia ese lado
// (`view`) y se puede seguir girando más allá. El SALTO la recentra: la barra se cierra en
// un hexágono, el jugador cruza por el centro y se vuelve a abrir centrada.
// Lógica pura salvo el layout, que recibe el tamaño de pantalla.
import { SEG, TAU, DT } from './const.js';
import { sideOf } from './sim.js';

export const BAR_HALF = 3.5;   // lados a cada lado del centro: 7 secciones, todos alcanzables
export const EDGE = 0.6;       // lados desde cada punta en los que la banda empieza a correrse
export const MORPH = { in: 0.13, cross: 0.17, out: 0.16 }; // s de cada fase de la animación
export const MORPH_T = MORPH.in + MORPH.cross + MORPH.out;

// pos: dónde está el jugador en la banda (en lados, 0 = centro de la sección `ref`);
// view: qué punto de la banda está en el centro de la barra; scroll: hacia dónde se corre (−1…1)
export function createBar() { return { ref: 0, pos: 0, view: 0, scroll: 0, lastA: 0, anim: null }; }

// Recentra en el lado de `a` (la sección del medio pasa a ser ese lado)
export function barReset(b, a) {
  b.ref = sideOf(a);
  b.pos = (a - (b.ref + 0.5) * SEG) / SEG;
  b.view = 0; b.scroll = 0;
  b.lastA = a;
}

// Tras cada paso: acumula el giro sin envolver. Si otra entrada (teclado) lo sacó de la
// barra, se recentra.
export function barTrack(b, a) {
  let d = (a - b.lastA) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  b.pos += d / SEG; b.lastA = a;
  if (Math.abs(b.pos - b.view) > BAR_HALF + 0.02) barReset(b, a);
}

// Banda: con el dedo a `f` lados del centro de la barra (o null sin dedo) en la zona de una
// punta, el objetivo se adelanta LEAD lados (el jugador sigue de largo) y la banda se corre
// para dejar al jugador bajo el dedo: se ve la banda pasar y nunca se llega al tope.
const LEAD = 0.8;
export function barScroll(b, f, w) {
  const k = f == null ? 0 : Math.max(0, Math.min(1, (Math.abs(f) - (BAR_HALF - EDGE)) / (EDGE - 0.15)));
  b.scroll = Math.sign(f || 0) * k;
  if (!k) return;
  const want = b.pos - f, d = want - b.view, max = 1.5 * (w / SEG) * DT;
  if (Math.sign(d) === Math.sign(f)) b.view += Math.sign(d) * Math.min(Math.abs(d), max);
}
// Objetivo en la banda para el dedo en `f`
export const barGoal = (b, f) => b.view + f + b.scroll * LEAD;

// Giro hacia el objetivo u (en lados); se detiene a menos de medio paso
export function barDir(b, u, w) {
  const d = u - b.pos;
  return Math.abs(d) < (w * DT / SEG) * 0.6 ? 0 : Math.sign(d);
}

// Animación del SALTO: de la barra con `ref` viejo al hexágono, cruce y vuelta a la barra
export function barFlip(b, from, to) {
  const prev = b.anim;
  const fromRef = b.ref, fromPos = b.pos, fromView = b.view;
  barReset(b, to);
  // un salto encima de otro (¡POR UN PELO! devuelve la recarga) arranca ya cerrado
  const t = prev && prev.t > MORPH.in ? MORPH.in : 0;
  b.anim = { t, fromRef, fromPos, fromView, fromA: from, toA: to };
}

// Tamaños en % (Ajustes): la barra escala largo y grosor; el botón SALTO, su radio (en
// BARRA es el centro del hexágono en que se cierra, así que escala ese hexágono)
export const SIZE_MIN = 50, SIZE_MAX = 200;
const kOf = (pct) => Math.max(SIZE_MIN, Math.min(SIZE_MAX, +pct || 100)) / 100;

// Geometría en pantalla. Vertical: centrada abajo. Horizontal: del lado de la mano.
export function barLayout(W, H, hand = 'der', barPct = 100, jumpPct = 100) {
  const land = W > H * 1.1, bk = kOf(barPct);
  const L0 = land ? Math.min(W * 0.42, 420) : Math.min(W - 40, 460);
  const L = Math.min(L0 * bk, W - (land ? 56 : 24));
  const cx = land ? (hand === 'izq' ? 28 + L / 2 : W - 28 - L / 2) : W / 2;
  const h = Math.max(8, Math.min(48, (land ? 18 : 22) * bk));
  const y = H - (land ? 37 : 57) - h / 2, sw = L / (2 * BAR_HALF);
  // R: radio del hexágono en que se cierra; su centro (by) es también el botón SALTO
  const R = Math.min((L0 / (2 * BAR_HALF)) * 1.05, 58) * kOf(jumpPct);
  return { x0: cx - L / 2, x1: cx + L / 2, cx, y, h, sw, R, by: y - h / 2 - R * 0.86 - 5 };
}

// Botón SALTO en táctil, cerca del pulgar: abajo al centro (CLÁSICO) o en el centro del
// hexágono de la barra (BARRA). Salta al tocar, sin esperar a reconocer un gesto.
export function jumpLayout(W, H, L = null, jumpPct = 100) {
  if (L) return { x: L.cx, y: L.by, r: L.R * 0.62 };
  const r = 34 * kOf(jumpPct);
  return { x: W / 2, y: H - (W > H * 1.1 ? 24 : 54) - r, r };
}
export const inJump = (J, x, y) => Math.hypot(x - J.x, y - J.y) < J.r * 1.3;

// ¿El toque cae en la zona de la barra? (más generosa que lo dibujado)
export const inBarZone = (L, x, y) => x >= L.x0 - 30 && x <= L.x1 + 30 && y >= L.y - 42 - L.h; // el botón SALTO se mira antes

// Posición x en pantalla → lados desde el centro de la barra (el objetivo es view + esto)
export function barU(L, x) {
  const u = (x - L.cx) / L.sw;
  return Math.max(-BAR_HALF + 0.03, Math.min(BAR_HALF - 0.03, u));
}
