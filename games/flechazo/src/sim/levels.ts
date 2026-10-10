// Niveles: tres dificultades y el modo ISLAS, cada uno con su propia escalera infinita de niveles (determinista: modo +
// número = el mismo tablero en cualquier máquina). Lo que crece es el tamaño del tablero, el largo y las vueltas de las
// flechas, cuánto se tapan entre sí y las trampas de los juegos de flechas: anillos que encierran (desde FÁCIL 3),
// escaleras y gemelas entrelazadas, islas con portales y huecos al medio (bordes falsos). EXTREMO suma anillos dobles,
// gemelas del mismo color y menos colores. En ISLAS todo mapa es una grilla de islas iguales (de 2 a 9) y el generador
// prefiere trabar flechas de otras islas: hay que mirar más allá de la propia. FÁCIL 1 es el tutorial, armado a mano.
import { generate, GAP, PALETTE, type Layout, type Shape, type Spec } from './gen.ts';
import { hash } from './rng.ts';
import type { Board } from './puzzle.ts';

export const DIFFS = ['facil', 'dificil', 'extremo', 'islas'] as const; // 'islas' al final: no cambia las semillas de las otras
export type Diff = typeof DIFFS[number];
export const DIFF_NAME: Record<Diff, string> = { facil: 'FÁCIL', dificil: 'DIFÍCIL', extremo: 'EXTREMO', islas: 'ISLAS' };

// Tutorial (7 × 6). Las letras son las flechas; el número de cada celda, el orden de la cola a la punta:
//   y\x 0  1  2  3  4  5  6
//   0   D0 D1 D2 .  .  E1 .      D → este, trabada por E        E ↑ libre
//   1   .  B0 G0 G1 .  E0 .      G ↓ trabada por A               B → trabada por C
//   2   .  B1 .  G2 C2 .  .      C ↑ libre (tapa a B)
//   3   .  B2 B3 .  C1 .  .
//   4   .  .  .  .  C0 .  F2     F ↑ libre
//   5   .  A2 A1 A0 .  F0 F1     A ← libre (la primera)
const T = (cells: [number, number][]) => cells.map(([x, y]) => y * 7 + x);
export const TUT = { A: 0, C: 1, B: 2, D: 3, E: 4, F: 5, G: 6 } as const;
export const TUTORIAL: Board = {
  w: 7, h: 6, mask: null,
  arrows: [
    { id: 0, c: 0, cells: T([[3, 5], [2, 5], [1, 5]]) },                 // A
    { id: 1, c: 6, cells: T([[4, 4], [4, 3], [4, 2]]) },                 // C
    { id: 2, c: 2, cells: T([[1, 1], [1, 2], [1, 3], [2, 3]]) },         // B
    { id: 3, c: 4, cells: T([[0, 0], [1, 0], [2, 0]]) },                 // D
    { id: 4, c: 8, cells: T([[5, 1], [5, 0]]) },                         // E
    { id: 5, c: 7, cells: T([[5, 5], [6, 5], [6, 4]]) },                 // F
    { id: 6, c: 9, cells: T([[2, 1], [3, 1], [3, 2]]) },                 // G
  ],
};

const SHAPES: Shape[] = ['diamond', 'circle', 'heart', 'cross', 'star'];
const ramp = (n: number, a: number, b: number, per: number, max: number) => Math.min(max, a + Math.floor((n - 1) / per) * b);

// El tema de cada nivel: figura cada 4; islas (dos o cuatro, con portales) y huecos al medio según la dificultad
export function themeOf(d: Diff, n: number): { shape: Shape, isl: Layout } {
  if (d === 'islas') return { shape: 'rect', isl: 'grid' };
  if (n % 4 === 0) return { shape: SHAPES[(n / 4 - 1) % SHAPES.length], isl: 'one' };
  const isl: Layout =
    d === 'facil' ? (n >= 6 && n % 4 === 2 ? (n % 8 === 6 ? 'two' : 'hole') : 'one')
    : d === 'dificil' ? (n % 4 === 2 ? (['two', 'hole', 'four'] as const)[((n - 2) / 4) % 3] : 'one')
    : n % 4 === 2 ? (((n - 2) / 4) % 2 ? 'four' : 'two') : n % 4 === 3 ? 'hole' : 'one';
  return { shape: 'rect', isl };
}

// Medidas: con islas el tablero crece lo que ocupa el vacío (las dos islas, una al lado de la otra o una arriba de la otra);
// las islas, todas del mismo tamaño
function dims(s: number, isl: Layout, n: number, dh: number): [number, number] {
  const a = Math.ceil((s + 3) / 2), q = Math.ceil((s + 2) / 2);
  if (isl === 'two') return Math.floor(n / 8) % 2 ? [s, 2 * a + GAP] : [2 * a + GAP, s];
  if (isl === 'four') return [2 * q + GAP, 2 * q + GAP];
  if (isl === 'hole') return [s + 2, s + 2];
  return [s, s + dh];
}

// ISLAS: [columnas, filas, lado de cada isla]. Después de la lista, la grilla rota y las islas crecen (3 × 3, hasta 7)
const ISLE_PLAN: [number, number, number][] = [
  [2, 1, 5], [1, 2, 5], [2, 1, 7], [2, 2, 5], [3, 1, 5], [1, 3, 5], [2, 2, 7], [3, 2, 5], [2, 3, 5], [3, 1, 7], [3, 2, 7], [3, 3, 5],
];
export function islePlan(n: number): [number, number, number] {
  if (n <= ISLE_PLAN.length) return ISLE_PLAN[n - 1];
  const k = n - ISLE_PLAN.length - 1, [c, r] = ([[2, 2], [3, 2], [2, 3], [3, 3]] as const)[k % 4];
  return [c, r, Math.min(c * r >= 9 ? 7 : 9, 7 + 2 * Math.floor(k / 12))];
}

export function specOf(d: Diff, n: number): Spec {
  const { shape, isl } = themeOf(d, n), shaped = shape !== 'rect';
  if (d === 'islas') {
    const [c, r, s] = islePlan(n), many = c * r;
    return { w: c * s + (c - 1) * GAP, h: r * s + (r - 1) * GAP, len: [3, s >= 7 ? 9 : 7], turn: 0.4, fill: 0.8, block: 0.75, pick: 4, shape, k: 5,
      isl, grid: [c, r], cross: 3, aim: 0.85, rooms: many >= 4 ? Math.floor(many / 3) : 0, room: [2, 2], stair: 0.15, twin: 0.1 };
  }
  if (d === 'facil') {
    const [w, h] = dims(ramp(n, 6, 1, 3, 10) + (shaped ? 2 : 0), isl, n, n % 3 === 2 ? 1 : 0);
    return { w, h, len: [2, n < 5 ? 5 : 6], turn: 0.35, fill: 0.76, block: 0.5, pick: 2, shape, k: 5, isl, aim: Math.min(0.45, 0.09 * (n - 1)),
      rooms: n >= 3 && n % 2 === 1 ? 1 : 0, room: [2, 2], stair: n >= 4 ? 0.12 : 0, twin: n >= 7 ? 0.08 : 0 };
  }
  if (d === 'dificil') {
    const [w, h] = dims(ramp(n, 10, 1, 2, 16) + (shaped ? 3 : 0), isl, n, (n % 3) - 1);
    return { w, h, len: [3, 10], turn: 0.45, fill: 0.82, block: 0.7, pick: 4, shape, k: 5, isl, aim: 0.7,
      rooms: n >= 5 ? 2 : 1, room: [2, 3], nest: n >= 7 ? 0.2 : 0, stair: 0.25, twin: 0.15 };
  }
  const [w, h] = dims(ramp(n, 15, 1, 2, 24) + (shaped ? 3 : 0), isl, n, (n % 3) - 1);
  return { w, h, len: [5, 16], turn: 0.5, fill: 0.88, block: 0.92, pick: 6, shape, k: 6, isl, aim: 0.9,
    rooms: Math.min(4, 2 + Math.floor(n / 6)), room: [2, 4], nest: 0.5, stair: 0.45, twin: 0.35, same: true,
    colors: Math.min(PALETTE, n < 6 ? 6 : n < 12 ? 5 : 4) };
}

const cache = new Map<string, Board>();
export function levelOf(d: Diff, n: number): Board {
  if (d === 'facil' && n === 1) return TUTORIAL;
  const key = `${d}:${n}`;
  let b = cache.get(key);
  if (!b) cache.set(key, b = generate(specOf(d, n), hash(DIFFS.indexOf(d) + 1, n, 0xf1ec)));
  return b;
}

// Monedas al resolverlo (sin errores, ×1,5)
export function reward(d: Diff, n: number, errors: number): number {
  const base = d === 'facil' ? (n === 1 ? 40 : 10 + 2 * Math.min(n, 20)) : d === 'dificil' ? 30 + 3 * Math.min(n, 30)
    : d === 'islas' ? 40 + 4 * Math.min(n, 30) : 70 + 5 * Math.min(n, 40);
  return Math.round(errors ? base : base * 1.5);
}
