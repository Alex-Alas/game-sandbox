// Generador de rompecabezas (puro y determinista: misma especificación y semilla, mismo tablero).
// Se arma al revés de como se resuelve: cada flecha nueva sale antes que todas las que ya están, así que su recta tiene que
// estar libre de ellas; su cuerpo, en cambio, puede tapar las rectas de las anteriores (eso crea las dependencias). Así
// todo tablero generado tiene solución por construcción. `block` empuja los cuerpos a pisar rectas ajenas, `pick` prueba
// varias flechas por lugar y se queda con la que traba más flechas todavía libres (menos libres al empezar), y entre `k`
// tableros candidatos queda el más profundo (más rondas para resolverlo).
import { rng, next, int, shuffle, hash, type Rng } from './rng.ts';
import { DX, DY, layers, type Arrow, type Board } from './puzzle.ts';

export type Shape = 'rect' | 'diamond' | 'circle' | 'cross' | 'heart' | 'star';
export type Spec = {
  w: number, h: number,
  len: [number, number], // largo de las flechas en celdas
  turn: number,          // probabilidad de doblar en cada paso
  fill: number,          // fracción de la figura que se intenta llenar
  block: number,         // preferencia por pisar rectas ajenas
  pick: number,          // flechas candidatas por lugar (queda la que traba más flechas libres)
  shape: Shape,
  k: number,             // candidatos (se queda el más profundo)
};
export const PALETTE = 10; // colores (el dibujo los define)

// Figura del tablero: 1 = se pueden poner flechas
export function maskOf(shape: Shape, w: number, h: number): number[] {
  const m: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = ((x + 0.5) / w) * 2 - 1, v = ((y + 0.5) / h) * 2 - 1;
    let ok = true;
    if (shape === 'diamond') ok = Math.abs(u) + Math.abs(v) <= 1.08;
    else if (shape === 'circle') ok = u * u + v * v <= 1.08;
    else if (shape === 'cross') ok = Math.abs(u) <= 0.42 || Math.abs(v) <= 0.42;
    else if (shape === 'heart') { const X = u * 1.25, Y = -v * 1.25 + 0.25; ok = (X * X + Y * Y - 1) ** 3 - X * X * Y * Y * Y <= 0; }
    else if (shape === 'star') {
      const r = Math.hypot(u, v), a = Math.atan2(v, u) + Math.PI / 2, f = (((a / (2 * Math.PI / 5)) % 1) + 1) % 1;
      ok = r <= 0.42 + 0.62 * Math.abs(1 - 2 * f) ** 1.6;
    }
    m.push(ok ? 1 : 0);
  }
  return m;
}

function build(sp: Spec, r: Rng): Board {
  const { w, h } = sp, N = w * h, mask = maskOf(sp.shape, w, h);
  const occ = new Int16Array(N).fill(-1), cover = new Uint16Array(N);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const empty = (x: number, y: number) => inside(x, y) && occ[y * w + x] < 0;
  const rayClear = (x: number, y: number, d: number) => {
    for (x += DX[d], y += DY[d]; x >= 0 && y >= 0 && x < w && y < h; x += DX[d], y += DY[d]) if (occ[y * w + x] >= 0) return false;
    return true;
  };
  const arrows: Arrow[] = [], rays: number[][] = [], blocked: boolean[] = [];
  const total = mask.reduce((s, v) => s + v, 0), target = Math.floor(total * sp.fill);
  // una flecha candidata desde una punta al azar: su camino (de la punta a la cola) y su recta
  const candidate = (late: boolean): { path: number[], ray: number[] } | null => {
    const hi = int(r, N), hx = hi % w, hy = (hi / w) | 0;
    if (!empty(hx, hy)) return null;
    const dirs = shuffle(r, [0, 1, 2, 3]).filter(d => empty(hx - DX[d], hy - DY[d]) && rayClear(hx, hy, d));
    if (!dirs.length) return null;
    const d = dirs[0], ray: number[] = [];
    for (let x = hx + DX[d], y = hy + DY[d]; x >= 0 && y >= 0 && x < w && y < h; x += DX[d], y += DY[d]) ray.push(y * w + x);
    const want = sp.len[0] + int(r, sp.len[1] - sp.len[0] + 1);
    const path = [hi, (hy - DY[d]) * w + hx - DX[d]];
    let px = hx - DX[d], py = hy - DY[d], heading = (d + 2) % 4; // crece desde la punta hacia la cola
    while (path.length < want) {
      const opts = [heading, (heading + 1) % 4, (heading + 3) % 4].filter(g => {
        const nx = px + DX[g], ny = py + DY[g], ni = ny * w + nx;
        return empty(nx, ny) && !path.includes(ni) && !ray.includes(ni);
      });
      if (!opts.length) break;
      let g = opts[0] === heading && next(r) > sp.turn ? heading : opts[int(r, opts.length)];
      if (next(r) < sp.block) { // si hay alguna opción que pisa una recta ajena, esa
        const hit = opts.filter(o => cover[(py + DY[o]) * w + px + DX[o]] > 0);
        if (hit.length) g = hit.includes(g) ? g : hit[int(r, hit.length)];
      }
      px += DX[g], py += DY[g], heading = g;
      path.push(py * w + px);
    }
    return path.length < (late ? 2 : sp.len[0]) ? null : { path, ray };
  };
  // cuántas flechas todavía libres trabaría
  const gain = (path: number[]) => arrows.reduce((n, a) => n + (!blocked[a.id] && rays[a.id].some(i => path.includes(i)) ? 1 : 0), 0);
  let filled = 0;
  for (let tries = 0; tries < N * 24 && filled < target; tries++) {
    const late = tries > N * 16; // al final se aceptan flechas más cortas para tapar huecos
    let best: { path: number[], ray: number[] } | null = null, bestScore = -1;
    for (let k = 0; k < Math.max(1, sp.pick); k++) {
      const c = candidate(late);
      if (!c) continue;
      const score = gain(c.path) * 3 + c.path.length * 0.25 + next(r) * 0.1;
      if (score > bestScore) best = c, bestScore = score;
    }
    if (!best) continue;
    const id = arrows.length, path = best.path.reverse();
    for (const i of path) occ[i] = id;
    for (const i of best.ray) cover[i]++;
    for (const a of arrows) if (!blocked[a.id] && rays[a.id].some(i => path.includes(i))) blocked[a.id] = true;
    arrows.push({ id, cells: path, c: 0 });
    rays.push(best.ray), blocked.push(false);
    filled += path.length;
  }
  // colores: ninguna flecha del mismo color que una vecina
  const near = (a: Arrow, b: Arrow) => a.cells.some(i => b.cells.some(j => Math.abs(i % w - j % w) + Math.abs(((i / w) | 0) - ((j / w) | 0)) <= 1));
  for (const a of arrows) {
    const used = new Set(arrows.filter(b => b.id < a.id && near(a, b)).map(b => b.c));
    const free = [...Array(PALETTE).keys()].filter(c => !used.has(c));
    a.c = free.length ? free[int(r, free.length)] : int(r, PALETTE);
  }
  return { w, h, arrows, mask: sp.shape === 'rect' ? null : mask };
}

export function generate(sp: Spec, seed: number): Board {
  let best: Board | null = null, bestScore = -Infinity;
  for (let k = 0; k < Math.max(1, sp.k); k++) {
    const b = build(sp, rng(hash(seed, k, 0x51ec))), L = layers(b);
    const score = L + b.arrows.length * 0.01;
    if (score > bestScore) best = b, bestScore = score;
  }
  return best!;
}
