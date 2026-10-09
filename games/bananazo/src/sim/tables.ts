// Las tablas del manual: salen de la semilla de la bomba (cada bomba trae su propio manual), así nadie se las aprende de
// memoria y el MUDO siempre hace falta. El anfitrión y los invitados las calculan igual a partir de la semilla.
import { rng, int, shuffle, pick, hash, type Rng } from './rng.ts';
import { COLORS, LIGHTS } from './const.ts';

export type WireRule =
  | { t: 'pos', i: number }                          // cortá el cable i
  | { t: 'any', c: number, last: boolean, i: number } // si hay algún c, el primero/último c; si no, el i
  | { t: 'many', c: number, a: number, b: number }    // si hay más de un c, el a; si no, el b
  | { t: 'end', c: number, a: number, b: number }     // si el último es c, el a; si no, el b
  | { t: 'none', c: number, a: number, b: number };   // si no hay ningún c, el a; si no, el b

// Laberinto de 5×5: wr[i] = pared a la derecha de la celda i, wd[i] = pared debajo (i = fila · 5 + columna)
export type Maze = { wr: boolean[], wd: boolean[] };
export const MAZE_N = 5;

export type Tables = {
  cables: WireRule[][],  // [luz][cables − 3]
  calc: number[][],      // [luz][0 par · 1 impar] → botón 0..3
  dir: number[][],       // [número − 1][luz] → dirección 0..3
  slide: number[][],     // [color][corredera] → posición 0 abajo · 1 medio · 2 arriba
  bells: number[][][],   // [número − 1][luz] → tres timbres 0..8
  piano: number[][][],   // [octava − 1][luz] → cuatro teclas 0..6
  dial: number[],        // [símbolo] → luz
  simon: number[][],     // [etapa][luz del que quema] → luz a apretar
  morse: string[],       // [dígito] → código de 4 ('.' corto, '-' largo)
  maze: Maze[],          // 6
  sw: boolean[][],       // [luz][número − 1] → arriba
};

function wireRule(r: Rng, n: number): WireRule {
  const c = int(r, COLORS.length), i = int(r, n);
  let b = int(r, n - 1); if (b >= i) b++;
  switch (int(r, 9)) {
    case 0: return { t: 'pos', i };
    case 1: case 2: return { t: 'any', c, last: int(r, 2) === 1, i };
    case 3: case 4: return { t: 'many', c, a: i, b };
    case 5: case 6: return { t: 'end', c, a: i, b };
    default: return { t: 'none', c, a: i, b };
  }
}
export function evalWire(w: WireRule, wires: readonly number[]): number {
  const has = wires.filter(x => x === (w as { c?: number }).c).length;
  switch (w.t) {
    case 'pos': return w.i;
    case 'any': return has ? (w.last ? wires.lastIndexOf(w.c) : wires.indexOf(w.c)) : w.i;
    case 'many': return has > 1 ? w.a : w.b;
    case 'end': return wires[wires.length - 1] === w.c ? w.a : w.b;
    case 'none': return has === 0 ? w.a : w.b;
  }
}

function genMaze(r: Rng): Maze {
  const N = MAZE_N, wr = Array(N * N).fill(true), wd = Array(N * N).fill(true), seen = Array(N * N).fill(false);
  const stack = [int(r, N * N)];
  seen[stack[0]] = true;
  while (stack.length) {
    const c = stack[stack.length - 1], x = c % N, y = (c / N) | 0;
    const opts = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < N && ny < N && !seen[ny * N + nx];
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = pick(r, opts), n = (y + dy) * N + x + dx;
    if (dx === 1) wr[c] = false; else if (dx === -1) wr[n] = false; else if (dy === 1) wd[c] = false; else wd[n] = false;
    seen[n] = true;
    stack.push(n);
  }
  // un par de atajos: con un solo camino hay que comunicar demasiado poco
  for (let k = 0; k < 2; k++) {
    const c = int(r, N * N), x = c % N, y = (c / N) | 0;
    if (x < N - 1 && int(r, 2)) wr[c] = false; else if (y < N - 1) wd[c] = false;
  }
  for (let y = 0; y < N; y++) wr[y * N + N - 1] = true;
  for (let x = 0; x < N; x++) wd[(N - 1) * N + x] = true;
  return { wr, wd };
}
// ¿Se puede pasar de la celda (x, y) en la dirección d (0 ↑, 1 →, 2 ↓, 3 ←)?
export function open(mz: Maze, x: number, y: number, d: number) {
  const N = MAZE_N, i = y * N + x;
  if (d === 0) return y > 0 && !mz.wd[i - N];
  if (d === 1) return x < N - 1 && !mz.wr[i];
  if (d === 2) return y < N - 1 && !mz.wd[i];
  return x > 0 && !mz.wr[i - 1];
}

const MEMO = new Map<number, Tables>();
export function tables(seed: number): Tables {
  const hit = MEMO.get(seed);
  if (hit) return hit;
  const r = rng(hash(seed, 0x6d616e));
  const L = LIGHTS;
  const tb: Tables = {
    cables: Array.from({ length: L }, () => [3, 4, 5, 6].map(n => wireRule(r, n))),
    calc: Array.from({ length: L }, () => { const p = shuffle(r, [0, 1, 2, 3]); return [p[0], p[1]]; }),
    dir: Array.from({ length: 6 }, () => Array.from({ length: L }, () => int(r, 4))),
    slide: Array.from({ length: COLORS.length }, () => [0, 1, 2].map(() => int(r, 3))),
    bells: Array.from({ length: 9 }, () => Array.from({ length: L }, () => shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3))),
    piano: Array.from({ length: 3 }, () => Array.from({ length: L }, () => {
      const m = [int(r, 7)];
      while (m.length < 4) { const k = int(r, 7); if (k !== m[m.length - 1]) m.push(k); }
      return m;
    })),
    dial: shuffle(r, [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]),
    simon: [0, 1, 2].map(() => shuffle(r, [0, 1, 2, 3])),
    morse: shuffle(r, Array.from({ length: 16 }, (_, k) => [8, 4, 2, 1].map(b => k & b ? '-' : '.').join(''))).slice(0, 10),
    maze: Array.from({ length: 6 }, () => genMaze(r)),
    sw: Array.from({ length: L }, () => Array.from({ length: 6 }, () => int(r, 2) === 1)),
  };
  if (MEMO.size > 32) MEMO.clear();
  MEMO.set(seed, tb);
  return tb;
}
