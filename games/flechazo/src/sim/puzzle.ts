// FLECHAZO: el rompecabezas (puro, corre en Node).
// Tablero de w × h celdas (x hacia el este, y hacia el sur); cada flecha es un camino de celdas vecinas de la cola a la punta
// y mira hacia donde va su último tramo. Al liberarla avanza como una víbora: la punta sigue derecho y el cuerpo pasa por
// donde pasó la punta, así que solo importa la recta de la punta al borde. Si está libre, sale; si no, choca con la primera
// flecha de esa recta, vuelve y cuesta una vida. Sacar flechas solo despeja caminos: alcanza con sacar cualquiera libre
// hasta que no quede ninguna (si eso se traba, el tablero no tenía solución).

export type Arrow = { id: number, cells: number[], c: number }; // cells: índices y·w + x de la cola a la punta; c: color
export type Board = { w: number, h: number, arrows: Arrow[], mask: number[] | null }; // mask: 1 = celda de la figura
export type Gone = ArrayLike<boolean>;

export const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // 0 este, 1 sur, 2 oeste, 3 norte
export const cx = (b: Board, i: number) => i % b.w;
export const cy = (b: Board, i: number) => (i / b.w) | 0;
export const head = (a: Arrow) => a.cells[a.cells.length - 1];

export function dirOf(b: Board, a: Arrow) {
  const n = a.cells.length, h = a.cells[n - 1], p = a.cells[n - 2];
  const dx = cx(b, h) - cx(b, p), dy = cy(b, h) - cy(b, p);
  return dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
}

// Celdas de la recta de la punta, de la siguiente a la punta hasta el borde
export function rayOf(b: Board, a: Arrow): number[] {
  const d = dirOf(b, a), out: number[] = [];
  let x = cx(b, head(a)) + DX[d], y = cy(b, head(a)) + DY[d];
  while (x >= 0 && y >= 0 && x < b.w && y < b.h) { out.push(y * b.w + x); x += DX[d]; y += DY[d]; }
  return out;
}

// Qué flecha ocupa cada celda (−1 = nadie), sin las que ya salieron
export function occupancy(b: Board, gone?: Gone): Int16Array {
  const occ = new Int16Array(b.w * b.h).fill(-1);
  for (const a of b.arrows) if (!gone?.[a.id]) for (const i of a.cells) occ[i] = a.id;
  return occ;
}

// La primera flecha en la recta de la punta: con quién choca y cuántas celdas libres avanza antes (k)
export function blockerOf(b: Board, a: Arrow, occ: Int16Array): { id: number, k: number } | null {
  const ray = rayOf(b, a);
  for (let k = 0; k < ray.length; k++) { const o = occ[ray[k]]; if (o >= 0 && o !== a.id) return { id: o, k }; }
  return null;
}

export function freeArrows(b: Board, gone?: Gone): number[] {
  const occ = occupancy(b, gone);
  return b.arrows.filter(a => !gone?.[a.id] && !blockerOf(b, a, occ)).map(a => a.id);
}

// Un orden que las saca a todas (null si se traba)
export function solveOrder(b: Board, gone?: Gone): number[] | null {
  const g = b.arrows.map(a => !!gone?.[a.id]), order: number[] = [];
  for (;;) {
    const f = freeArrows(b, g);
    if (!f.length) return g.every(Boolean) ? order : null;
    for (const id of f) { g[id] = true; order.push(id); }
  }
}

// Rondas para resolverlo sacando de una vez todas las libres (la «profundidad» del rompecabezas); −1 si no tiene solución
export function layers(b: Board): number {
  const g = b.arrows.map(() => false);
  for (let r = 0; ; r++) {
    if (g.every(Boolean)) return r;
    const f = freeArrows(b, g);
    if (!f.length) return -1;
    for (const id of f) g[id] = true;
  }
}

// Errores de forma de un tablero (vacío = válido)
export function validate(b: Board): string[] {
  const err: string[] = [], seen = new Int16Array(b.w * b.h).fill(-1);
  b.arrows.forEach((a, k) => {
    if (a.id !== k) err.push(`flecha ${k}: id ${a.id}`);
    if (a.cells.length < 2) err.push(`flecha ${k}: muy corta`);
    for (let j = 0; j < a.cells.length; j++) {
      const i = a.cells[j];
      if (i < 0 || i >= b.w * b.h) { err.push(`flecha ${k}: celda ${i} afuera`); continue; }
      if (seen[i] >= 0) err.push(`flecha ${k}: pisa a la ${seen[i]} en ${i}`);
      seen[i] = k;
      if (j && Math.abs(cx(b, i) - cx(b, a.cells[j - 1])) + Math.abs(cy(b, i) - cy(b, a.cells[j - 1])) !== 1) err.push(`flecha ${k}: salto en ${i}`);
    }
    if (a.cells.length >= 2 && rayOf(b, a).some(i => a.cells.includes(i))) err.push(`flecha ${k}: su recta cruza su cuerpo`);
  });
  return err;
}
