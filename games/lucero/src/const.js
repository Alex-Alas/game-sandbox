// LUCERO — constantes compartidas por el motor (puro, corre en Node), el render y la UI.

// Gemas: color + silueta distinta (se distinguen también sin color)
export const GEMS = [
  { name: 'rubí', plural: 'rubíes', shape: 'heart', c: '#ff3d63', hi: '#ffb3c1', lo: '#a3002a' },
  { name: 'sol', plural: 'soles', shape: 'sun', c: '#ff9a1f', hi: '#ffe0a3', lo: '#b34d00' },
  { name: 'estrella', plural: 'estrellas', shape: 'star', c: '#ffd72e', hi: '#fff6c2', lo: '#b58a00' },
  { name: 'esmeralda', plural: 'esmeraldas', shape: 'hex', c: '#31d97a', hi: '#b8ffd5', lo: '#00804a' },
  { name: 'zafiro', plural: 'zafiros', shape: 'diamond', c: '#3a9dff', hi: '#bfe3ff', lo: '#0047a8' },
  { name: 'luna', plural: 'lunas', shape: 'moon', c: '#b26bff', hi: '#e6ccff', lo: '#5a1fa8' },
];

// Especiales (pieza.s). Las de color (H, V, NOVA, FLY) siguen combinando por color.
export const S = { NONE: 0, H: 1, V: 2, NOVA: 3, FLY: 4, STAR: 5, DROP: 6 };
export const SPECIAL_NAME = { 1: 'COMETA', 2: 'COMETA', 3: 'NOVA', 4: 'LUCIÉRNAGA', 5: 'LUCERO' };
export const isComet = (s) => s === S.H || s === S.V;
// pieza que dispara algo al activarse
export const isPower = (s) => s >= S.H && s <= S.STAR;

// Puntos (× número de cascada dentro de la jugada)
export const PTS = { gem: 20, make: { 1: 60, 2: 60, 3: 120, 4: 60, 5: 200 }, fog: 40, rock: 60, frost: 40, drop: 400, bonus: 300 };

// Tiempos de la explosión en cadena (s); el render los respeta
export const T = { beam: 0.032, nova: 0.05, chain: 0.07, flyTo: 0.5, ray: 0.04 };

// Ritmo de la partida en el navegador (s)
export const ANIM = { swap: 0.16, bad: 0.26, pop: 0.2, gravity: 64, vmax: 20, hintAfter: 5 };

// Hash FNV + mulberry32: RNG determinista con el estado en un número (se clona fácil)
export function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function rnd(o) { // o = { rng: estado uint32 }
  let t = (o.rng = (o.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rndInt = (o, n) => Math.floor(rnd(o) * n);
