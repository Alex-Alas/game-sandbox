// Terreno destructible: una grilla de celdas de CELL m (0 aire, 1 tierra, 2 piedra, 3 madera). La piedra no se
// rompe nunca (el esqueleto de cada mapa); tierra y madera se rompen con explosiones, rayos y ultis.
// Solo se quita terreno, nunca se agrega: así nada queda encerrado adentro de una celda.
// Cada corte se anota en ops: el terreno de una partida es el mapa (por semilla) más esos cortes en orden, y así se
// sincroniza con quien entra a mitad de partida. Los pedazos sueltos que quedan (≤ LOOSE celdas sin piedra) caen.
export const CELL = 0.25;
export const AIR = 0, DIRT = 1, ROCK = 2, WOOD = 3;
export const LOOSE = 48; // celdas: un pedazo suelto de hasta este tamaño (sin piedra) se cae
const EPS = 1e-6;

// Un corte: círculo [0, x, y, r] o cápsula (segmento con radio) [1, x0, y0, x1, y1, r]
export type Op = number[];
export type Terr = {
  cols: number, rows: number, g: Uint8Array,
  ops: Op[],
  dirty: [number, number, number, number][], // rectángulos de celdas a redibujar (los consume el render)
  fall: number[],                            // pedazos sueltos que cayeron [i, j, material]… (los consume el dibujo)
  vis: Int32Array, gen: number,              // marcas de la búsqueda de pedazos sueltos (no viajan)
};

export function newTerr(cols: number, rows: number): Terr {
  return { cols, rows, g: new Uint8Array(cols * rows), ops: [], dirty: [[0, 0, cols - 1, rows - 1]], fall: [], vis: new Int32Array(cols * rows), gen: 0 };
}

export const cell = (T: Terr, i: number, j: number) => i < 0 || j < 0 || i >= T.cols || j >= T.rows ? AIR : T.g[j * T.cols + i];
export const solidAt = (T: Terr, x: number, y: number) => cell(T, Math.floor(x / CELL), Math.floor(y / CELL)) !== AIR;
export const set = (T: Terr, i: number, j: number, v: number) => { if (i >= 0 && j >= 0 && i < T.cols && j < T.rows) T.g[j * T.cols + i] = v; };

// ¿Hay algo sólido en la columna i entre las filas j0 y j1?
function colSolid(T: Terr, i: number, j0: number, j1: number) {
  if (i < 0 || i >= T.cols) return false;
  for (let j = Math.max(0, j0); j <= Math.min(T.rows - 1, j1); j++) if (T.g[j * T.cols + i]) return true;
  return false;
}
function rowSolid(T: Terr, j: number, i0: number, i1: number) {
  if (j < 0 || j >= T.rows) return false;
  for (let i = Math.max(0, i0); i <= Math.min(T.cols - 1, i1); i++) if (T.g[j * T.cols + i]) return true;
  return false;
}

// Hasta dónde llega una caja (centro x, pies y, media anchura hw, alto h) moviéndose d por un eje sin entrar en
// ninguna celda sólida. Exacto (recorre las columnas o filas que cruza): no atraviesa nada por rápido que vaya.
export function sweepX(T: Terr, x: number, y: number, hw: number, h: number, d: number): number {
  if (d === 0) return 0;
  const j0 = Math.floor((y + EPS) / CELL), j1 = Math.floor((y + h - EPS) / CELL);
  if (d > 0) {
    const e = x + hw, last = Math.floor((e + d) / CELL);
    for (let i = Math.floor(e / CELL); i <= last; i++) if (colSolid(T, i, j0, j1)) return Math.max(0, Math.min(d, i * CELL - e));
  } else {
    const e = x - hw, last = Math.floor((e + d) / CELL);
    for (let i = Math.ceil(e / CELL) - 1; i >= last; i--) if (colSolid(T, i, j0, j1)) return Math.min(0, Math.max(d, (i + 1) * CELL - e));
  }
  return d;
}
export function sweepY(T: Terr, x: number, y: number, hw: number, h: number, d: number): number {
  if (d === 0) return 0;
  const i0 = Math.floor((x - hw + EPS) / CELL), i1 = Math.floor((x + hw - EPS) / CELL);
  if (d > 0) {
    const e = y + h, last = Math.floor((e + d) / CELL);
    for (let j = Math.floor(e / CELL); j <= last; j++) if (rowSolid(T, j, i0, i1)) return Math.max(0, Math.min(d, j * CELL - e));
  } else {
    const e = y, last = Math.floor((e + d) / CELL);
    for (let j = Math.ceil(e / CELL) - 1; j >= last; j--) if (rowSolid(T, j, i0, i1)) return Math.min(0, Math.max(d, (j + 1) * CELL - e));
  }
  return d;
}
// ¿La caja está libre (sin solaparse con nada)?
export function boxFree(T: Terr, x: number, y: number, hw: number, h: number): boolean {
  const i0 = Math.floor((x - hw + EPS) / CELL), i1 = Math.floor((x + hw - EPS) / CELL);
  const j0 = Math.floor((y + EPS) / CELL), j1 = Math.floor((y + h - EPS) / CELL);
  for (let i = i0; i <= i1; i++) if (colSolid(T, i, j0, j1)) return false;
  return true;
}

// Rayo unitario (dx, dy) desde (ox, oy): distancia a la primera celda sólida antes de max y la normal de la cara que
// pega, o d = −1 (DDA por la grilla).
export function raycast(T: Terr, ox: number, oy: number, dx: number, dy: number, max: number): { d: number, nx: number, ny: number } {
  let i = Math.floor(ox / CELL), j = Math.floor(oy / CELL);
  if (cell(T, i, j)) return { d: 0, nx: -dx, ny: -dy };
  const si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? CELL / Math.abs(dx) : Infinity, tdy = dy !== 0 ? CELL / Math.abs(dy) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? (i + 1) * CELL - ox : ox - i * CELL) / Math.abs(dx)) : Infinity;
  let ty = dy !== 0 ? ((dy > 0 ? (j + 1) * CELL - oy : oy - j * CELL) / Math.abs(dy)) : Infinity;
  for (let n = 0; n < 4000; n++) {
    let t: number, nx = 0, ny = 0;
    if (tx < ty) { t = tx; i += si; tx += tdx; nx = -si; } else { t = ty; j += sj; ty += tdy; ny = -sj; }
    if (t > max) break;
    if (cell(T, i, j)) return { d: t, nx, ny };
    // fuera de la grilla por un lado que ya no vuelve: nada más que pegar
    if ((i < 0 && si < 0) || (i >= T.cols && si > 0) || (j < 0 && sj < 0) || (j >= T.rows && sj > 0)) break;
  }
  return { d: -1, nx: 0, ny: 0 };
}

const mark = (T: Terr, i0: number, j0: number, i1: number, j1: number) =>
  T.dirty.push([Math.max(0, i0 - 1), Math.max(0, j0 - 1), Math.min(T.cols - 1, i1 + 1), Math.min(T.rows - 1, j1 + 1)]);

// Distancia² del centro de la celda al segmento (x0, y0)–(x1, y1)
function segD2(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const vx = x1 - x0, vy = y1 - y0, L = vx * vx + vy * vy;
  let u = L > 0 ? ((px - x0) * vx + (py - y0) * vy) / L : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - x0 - vx * u, ey = py - y0 - vy * u;
  return ex * ex + ey * ey;
}

// Aplica un corte (sin anotarlo) y devuelve las celdas que cayeron como pedazos sueltos: [i, j, material]...
export function applyOp(T: Terr, op: Op): number[] {
  const cap = op[0] === 1;
  const [x0, y0, x1, y1, r] = cap ? [op[1], op[2], op[3], op[4], op[5]] : [op[1], op[2], op[1], op[2], op[3]];
  const i0 = Math.floor((Math.min(x0, x1) - r) / CELL), i1 = Math.floor((Math.max(x0, x1) + r) / CELL);
  const j0 = Math.floor((Math.min(y0, y1) - r) / CELL), j1 = Math.floor((Math.max(y0, y1) + r) / CELL);
  let any = false;
  for (let j = Math.max(0, j0); j <= Math.min(T.rows - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(T.cols - 1, i1); i++) {
    const k = j * T.cols + i, m = T.g[k];
    if (m === AIR || m === ROCK) continue;
    if (segD2((i + 0.5) * CELL, (j + 0.5) * CELL, x0, y0, x1, y1) <= r * r) T.g[k] = AIR, any = true;
  }
  if (!any) return [];
  mark(T, i0, j0, i1, j1);
  const out = loose(T, i0 - 1, j0 - 1, i1 + 1, j1 + 1);
  if (out.length && T.fall.length < 6000) T.fall.push(...out);
  return out;
}
// Corta y anota (lo que llama la simulación)
export function carve(T: Terr, op: Op): number[] {
  T.ops.push(op.map(v => Math.round(v * 100) / 100));
  return applyOp(T, T.ops[T.ops.length - 1]);
}

// Pedazos sueltos alrededor de un corte: desde cada celda sólida del borde del rectángulo, componente 4-conexa; si
// no tiene piedra y tiene ≤ LOOSE celdas, se quita entera. Determinista (mismo orden de recorrido).
// Cada búsqueda marca sus celdas con su propia gen; una celda marcada por una búsqueda anterior de este mismo corte
// (gen > base) es de una componente anclada (las sueltas ya se quitaron), así que tocarla también ancla.
const stack: number[] = [];
function loose(T: Terr, i0: number, j0: number, i1: number, j1: number): number[] {
  const out: number[] = [], base = T.gen;
  for (let j = Math.max(0, j0); j <= Math.min(T.rows - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(T.cols - 1, i1); i++) {
    const k = j * T.cols + i;
    if (!T.g[k] || T.vis[k] > base) continue;
    const gen = ++T.gen, comp: number[] = [];
    let anchored = false;
    stack.length = 0;
    stack.push(k), T.vis[k] = gen;
    search: while (stack.length) {
      const q = stack.pop()!;
      if (T.g[q] === ROCK || comp.length >= LOOSE) { anchored = true; break; }
      comp.push(q);
      const qi = q % T.cols, qj = (q - qi) / T.cols;
      for (let d = 0; d < 4; d++) {
        const ni = qi + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = qj + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= T.cols || nj >= T.rows) continue;
        const n = nj * T.cols + ni;
        if (!T.g[n] || T.vis[n] === gen) continue;
        if (T.vis[n] > base) { anchored = true; break search; }
        T.vis[n] = gen, stack.push(n);
      }
    }
    if (anchored) continue;
    let bi0 = T.cols, bj0 = T.rows, bi1 = 0, bj1 = 0;
    for (const q of comp) {
      const qi = q % T.cols, qj = (q - qi) / T.cols;
      out.push(qi, qj, T.g[q]);
      T.g[q] = AIR;
      bi0 = Math.min(bi0, qi), bi1 = Math.max(bi1, qi), bj0 = Math.min(bj0, qj), bj1 = Math.max(bj1, qj);
    }
    mark(T, bi0, bj0, bi1, bj1);
  }
  return out;
}

// Altura del primer suelo bajo (x, y) dentro de depth m (los pies quedarían ahí), o null
export function groundBelow(T: Terr, x: number, y: number, depth: number): number | null {
  const i = Math.floor(x / CELL);
  for (let j = Math.floor((y - EPS) / CELL); j >= Math.floor((y - depth) / CELL); j--) if (cell(T, i, j)) return (j + 1) * CELL;
  return null;
}

// Copia profunda del terreno (para las pruebas y el visor)
export function cloneTerr(T: Terr): Terr {
  return { cols: T.cols, rows: T.rows, g: T.g.slice(), ops: T.ops.map(o => o.slice()), dirty: [], fall: [], vis: new Int32Array(T.cols * T.rows), gen: 0 };
}
