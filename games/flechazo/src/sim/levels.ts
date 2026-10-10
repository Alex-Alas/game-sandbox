// Niveles: tres dificultades, cada una con su propia escalera infinita de niveles (determinista: dificultad + número = el
// mismo tablero en cualquier máquina). Lo que crece es el tamaño del tablero, el largo y las vueltas de las flechas y cuánto
// se tapan entre sí. FÁCIL 1 es el tutorial, armado a mano.
import { generate, type Shape, type Spec } from './gen.ts';
import { hash } from './rng.ts';
import type { Board } from './puzzle.ts';

export const DIFFS = ['facil', 'dificil', 'extremo'] as const;
export type Diff = typeof DIFFS[number];
export const DIFF_NAME: Record<Diff, string> = { facil: 'FÁCIL', dificil: 'DIFÍCIL', extremo: 'EXTREMO' };

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

export function specOf(d: Diff, n: number): Spec {
  const shaped = n % 4 === 0, shape = shaped ? SHAPES[(n / 4 - 1) % SHAPES.length] : 'rect';
  if (d === 'facil') {
    const s = ramp(n, 6, 1, 3, 10) + (shaped ? 2 : 0);
    return { w: s, h: s + (n % 3 === 2 ? 1 : 0), len: [2, n < 6 ? 4 : 5], turn: 0.3, fill: 0.72, block: 0.3, pick: 1, shape, k: 2 };
  }
  if (d === 'dificil') {
    const s = ramp(n, 10, 1, 2, 16) + (shaped ? 3 : 0);
    return { w: s, h: s + (n % 3) - 1, len: [3, 8], turn: 0.4, fill: 0.8, block: 0.6, pick: 3, shape, k: 4 };
  }
  const s = ramp(n, 15, 1, 2, 24) + (shaped ? 3 : 0);
  return { w: s, h: s + (n % 3) - 1, len: [4, 13], turn: 0.45, fill: 0.86, block: 0.85, pick: 5, shape, k: 5 };
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
  const base = d === 'facil' ? (n === 1 ? 40 : 10 + 2 * Math.min(n, 20)) : d === 'dificil' ? 30 + 3 * Math.min(n, 30) : 70 + 5 * Math.min(n, 40);
  return Math.round(errors ? base : base * 1.5);
}
