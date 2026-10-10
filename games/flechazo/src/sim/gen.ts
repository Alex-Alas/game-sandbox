// Generador de rompecabezas (puro y determinista: misma especificación y semilla, mismo tablero).
// Se arma al revés de como se resuelve: cada flecha nueva sale antes que todas las que ya están, así que su recta tiene que
// estar libre de ellas; su cuerpo, en cambio, puede tapar las rectas de las anteriores (eso crea las dependencias). Así
// todo tablero generado tiene solución por construcción. `block` empuja los cuerpos a pisar rectas ajenas, `pick` prueba
// varias flechas por lugar y se queda con la que traba más flechas todavía libres (menos libres al empezar), y entre `k`
// tableros candidatos queda el más difícil (más rondas para resolverlo y menos flechas libres al empezar).
// Lo que sube la dificultad, como en los juegos de flechas:
// - Anillos (`rooms`): una flecha larguísima que rodea por completo un cuarto lleno de flechas cortas; ninguna de adentro
//   sale hasta que sale el anillo. Los cuartos se reservan al principio y se arman a mitad del llenado, así el anillo
//   también traba flechas de afuera. Con `nest`, un anillo alrededor de otro.
// - Escaleras (`stair`): flechas que doblan a un lado y al otro cada uno o dos pasos, difíciles de seguir con la vista; y
//   gemelas (`twin`): el mismo camino corrido una celda, entrelazado con el original (con `same`, del mismo color).
// - Menos colores (`colors`): vecinas del mismo color.
// - Islas (`isl`): el tablero partido en dos o cuatro islas sobre el vacío (se pasa por portales) o con un hueco al medio.
//   Las rectas cruzan el vacío: una flecha que apunta al borde de una isla puede chocar con la de enfrente (bordes falsos).
import { rng, next, int, shuffle, hash, type Rng } from './rng.ts';
import { DX, DY, layers, freeArrows, type Arrow, type Board, type Rect, type Pad } from './puzzle.ts';

export type Shape = 'rect' | 'diamond' | 'circle' | 'cross' | 'heart' | 'star';
export type Layout = 'one' | 'two' | 'four' | 'hole';
export type Spec = {
  w: number, h: number,
  len: [number, number], // largo de las flechas en celdas
  turn: number,          // probabilidad de doblar en cada paso
  fill: number,          // fracción de la figura que se intenta llenar
  block: number,         // preferencia por pisar rectas ajenas
  pick: number,          // flechas candidatas por lugar (queda la que traba más flechas libres)
  shape: Shape,
  k: number,             // candidatos (se queda el más difícil)
  isl?: Layout,          // una isla, dos, cuatro o una con un hueco al medio (sin figura)
  rooms?: number,        // anillos que encierran un cuarto
  room?: [number, number], // lado del cuarto (celdas adentro del anillo)
  nest?: number,         // probabilidad de un segundo anillo alrededor del primero
  stair?: number,        // probabilidad de que una flecha sea una escalera
  twin?: number,         // probabilidad de que una flecha larga tenga una gemela entrelazada
  same?: boolean,        // las gemelas, del mismo color
  colors?: number,       // colores distintos en el tablero
  aim?: number,          // probabilidad de apuntar la flecha hacia adentro (la recta más larga): menos libres al empezar
};
export const PALETTE = 10; // colores (el dibujo los define)
export const GAP = 2;      // columnas (o filas) de vacío entre islas

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

// Islas, huecos y portales. Los portales van en una celda del borde de cada isla que mira a la otra, en el medio, y esa
// celda queda fuera de la figura (sin flechas, para pararse).
export function layoutOf(isl: Layout, w: number, h: number): { mask: number[], isles: Rect[], holes: Rect[], pads: Pad[] } {
  const isles: Rect[] = [], holes: Rect[] = [], pads: Pad[] = [];
  const link = (a: number, ca: number, b: number, cb: number) => {
    const i = pads.length;
    pads.push({ cell: ca, to: i + 1, isle: a }, { cell: cb, to: i, isle: b });
  };
  const at = (x: number, y: number) => y * w + x;
  if (isl === 'two' && w >= h) {
    const a = Math.floor((w - GAP) / 2), py = Math.floor(h / 2);
    isles.push([0, 0, a - 1, h - 1], [a + GAP, 0, w - 1, h - 1]);
    link(0, at(a - 1, py), 1, at(a + GAP, py));
  } else if (isl === 'two') {
    const b = Math.floor((h - GAP) / 2), px = Math.floor(w / 2);
    isles.push([0, 0, w - 1, b - 1], [0, b + GAP, w - 1, h - 1]);
    link(0, at(px, b - 1), 1, at(px, b + GAP));
  } else if (isl === 'four') {
    const a = Math.floor((w - GAP) / 2), b = Math.floor((h - GAP) / 2);
    isles.push([0, 0, a - 1, b - 1], [a + GAP, 0, w - 1, b - 1], [0, b + GAP, a - 1, h - 1], [a + GAP, b + GAP, w - 1, h - 1]);
    const yT = Math.floor(b / 2), yB = b + GAP + Math.floor((h - b - GAP) / 2), xL = Math.floor(a / 2), xR = a + GAP + Math.floor((w - a - GAP) / 2);
    link(0, at(a - 1, yT), 1, at(a + GAP, yT));
    link(2, at(a - 1, yB), 3, at(a + GAP, yB));
    link(0, at(xL, b - 1), 2, at(xL, b + GAP));
    link(1, at(xR, b - 1), 3, at(xR, b + GAP));
  } else {
    isles.push([0, 0, w - 1, h - 1]);
    if (isl === 'hole') {
      const hw = Math.max(2, Math.round(w * 0.3)), hh = Math.max(2, Math.round(h * 0.3)), x0 = Math.floor((w - hw) / 2), y0 = Math.floor((h - hh) / 2);
      holes.push([x0, y0, x0 + hw - 1, y0 + hh - 1]);
    }
  }
  const inR = (x: number, y: number, [x0, y0, x1, y1]: Rect) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const mask: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask.push(isles.some(r => inR(x, y, r)) && !holes.some(r => inR(x, y, r)) ? 1 : 0);
  for (const p of pads) mask[p.cell] = 0;
  return { mask, isles, holes, pads };
}

type Cand = { path: number[], ray: number[] };
const OFFS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function build(sp: Spec, r: Rng): Board {
  const { w, h } = sp, N = w * h, lay = sp.isl && sp.isl !== 'one' ? layoutOf(sp.isl, w, h) : null;
  const mask = lay ? lay.mask : maskOf(sp.shape, w, h);
  const occ = new Int16Array(N).fill(-1), cover = new Uint16Array(N), res = new Uint8Array(N); // res: reservada para un cuarto
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const empty = (x: number, y: number) => inside(x, y) && occ[y * w + x] < 0 && !res[y * w + x];
  const rayCells = (x: number, y: number, d: number) => {
    const out: number[] = [];
    for (x += DX[d], y += DY[d]; x >= 0 && y >= 0 && x < w && y < h; x += DX[d], y += DY[d]) out.push(y * w + x);
    return out;
  };
  const rayClear = (x: number, y: number, d: number) => rayCells(x, y, d).every(i => occ[i] < 0);
  const arrows: Arrow[] = [], rays: number[][] = [], blocked: boolean[] = [], twinOf: number[] = [], ringIds: number[] = [];
  const total = mask.reduce((s, v) => s + v, 0), target = Math.floor(total * sp.fill);
  let filled = 0;

  // una flecha candidata desde una punta al azar dentro de la región `ok`: su camino (de la punta a la cola) y su recta
  const candidate = (ok: (x: number, y: number) => boolean, len: [number, number], late: boolean, stair: boolean, area?: Rect): Cand | null => {
    const hx = area ? area[0] + int(r, area[2] - area[0] + 1) : int(r, w), hy = area ? area[1] + int(r, area[3] - area[1] + 1) : int(r, h), hi = hy * w + hx;
    if (!ok(hx, hy)) return null;
    const dirs = shuffle(r, [0, 1, 2, 3]).filter(d => ok(hx - DX[d], hy - DY[d]) && rayClear(hx, hy, d));
    if (!dirs.length) return null;
    // con `aim`, la dirección de recta más larga: apunta hacia adentro, así lo que se ponga después la puede tapar
    const rl = (d: number) => d === 0 ? w - 1 - hx : d === 1 ? h - 1 - hy : d === 2 ? hx : hy;
    const d = next(r) < (sp.aim ?? 0) ? dirs.reduce((a, b) => rl(b) > rl(a) ? b : a) : dirs[0], ray = rayCells(hx, hy, d);
    let want = len[0] + int(r, len[1] - len[0] + 1);
    if (stair) want = Math.max(want, len[1] - int(r, Math.ceil((len[1] - len[0]) / 3) + 1)); // las escaleras, largas
    const path = [hi, (hy - DY[d]) * w + hx - DX[d]];
    let px = hx - DX[d], py = hy - DY[d], heading = (d + 2) % 4; // crece desde la punta hacia la cola
    const can = (g: number) => {
      const nx = px + DX[g], ny = py + DY[g], ni = ny * w + nx;
      return ok(nx, ny) && !path.includes(ni) && !ray.includes(ni);
    };
    if (stair) {
      // escalera: se aleja de la punta (a) y dobla a un costado (b) de a uno o dos pasos; a veces cambia de costado
      const a = heading;
      let b = (a + (next(r) < 0.5 ? 1 : 3)) % 4, cur = b, run = 0, runLen = 1;
      while (path.length < want) {
        if (run >= runLen) {
          cur = cur === a ? b : a, run = 0, runLen = next(r) < 0.75 ? 1 : 2;
          if (cur === b && next(r) < 0.18) cur = b = (b + 2) % 4;
        }
        if (!can(cur)) break;
        px += DX[cur], py += DY[cur], run++;
        path.push(py * w + px);
      }
    } else {
      while (path.length < want) {
        const opts = [heading, (heading + 1) % 4, (heading + 3) % 4].filter(can);
        if (!opts.length) break;
        let g = opts[0] === heading && next(r) > sp.turn ? heading : opts[int(r, opts.length)];
        if (next(r) < sp.block) { // si hay alguna opción que pisa una recta ajena, esa
          const hit = opts.filter(o => cover[(py + DY[o]) * w + px + DX[o]] > 0);
          if (hit.length) g = hit.includes(g) ? g : hit[int(r, hit.length)];
        }
        px += DX[g], py += DY[g], heading = g;
        path.push(py * w + px);
      }
    }
    return path.length < (late ? 2 : len[0]) ? null : { path, ray };
  };
  // cuántas flechas todavía libres trabaría
  const gain = (path: number[]) => arrows.reduce((n, a) => n + (!blocked[a.id] && rays[a.id].some(i => path.includes(i)) ? 1 : 0), 0);
  const best = (n: number, make: () => Cand | null) => {
    let out: Cand | null = null, top = -1;
    for (let k = 0; k < Math.max(1, n); k++) {
      const c = make();
      if (!c) continue;
      const score = gain(c.path) * 3 + c.path.length * 0.25 + next(r) * 0.1;
      if (score > top) out = c, top = score;
    }
    return out;
  };
  // pone una flecha (path de la cola a la punta)
  const place = (path: number[], ray: number[], twin = -1) => {
    const id = arrows.length;
    for (const i of path) occ[i] = id;
    for (const i of ray) cover[i]++;
    for (const a of arrows) if (!blocked[a.id] && rays[a.id].some(i => path.includes(i))) blocked[a.id] = true;
    arrows.push({ id, cells: path, c: 0 });
    rays.push(ray), blocked.push(false), twinOf.push(twin);
    filled += path.length;
    return id;
  };
  const dirOfPath = (p: number[]) => {
    const a = p[p.length - 2], b = p[p.length - 1], dx = (b % w) - (a % w), dy = ((b / w) | 0) - ((a / w) | 0);
    return dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
  };
  // gemela: el mismo camino corrido una celda (en cualquiera de los dos sentidos), pegada al original en casi todo su largo.
  // `src` (de la cola a la punta) puede no estar puesta todavía: la gemela sale antes, así que su recta tampoco la cruza
  const twinFor = (src: number[]): Cand | null => {
    let out: Cand | null = null, top = 0;
    const mine = new Set(src);
    for (const [vx, vy] of shuffle(r, OFFS)) {
      const cells = src.map(i => { const x = (i % w) + vx, y = ((i / w) | 0) + vy; return empty(x, y) && !mine.has(y * w + x) ? y * w + x : -1; });
      if (cells.includes(-1)) continue;
      const adj = cells.filter(i => [0, 1, 2, 3].some(d => { const x = (i % w) + DX[d], y = ((i / w) | 0) + DY[d]; return x >= 0 && y >= 0 && x < w && y < h && mine.has(y * w + x); })).length;
      if (adj < Math.ceil(cells.length * 0.6)) continue;
      for (const path of [cells, cells.slice().reverse()]) {
        const hd = path[path.length - 1], d = dirOfPath(path), hx = hd % w, hy = (hd / w) | 0, ray = rayCells(hx, hy, d);
        if (ray.some(i => path.includes(i) || mine.has(i)) || !rayClear(hx, hy, d)) continue;
        const score = adj + gain(path) * 0.5 + next(r);
        if (score > top) out = { path: path.slice(), ray }, top = score;
      }
    }
    return out;
  };

  // ---- Cuartos con anillo: se reservan ahora y se arman a mitad del llenado ----
  type Room = { o: Rect, rings: number, at: number };
  const rooms: Room[] = [];
  for (let j = 0; j < (sp.rooms ?? 0); j++) {
    const [lo, hi] = sp.room ?? [2, 3];
    for (let t = 0; t < 80; t++) {
      const rings = next(r) < (sp.nest ?? 0) ? 2 : 1, iw = lo + int(r, hi - lo + 1), ih = lo + int(r, hi - lo + 1);
      const W = iw + 2 * rings, H = ih + 2 * rings;
      if (W > w || H > h) continue;
      const x0 = int(r, w - W + 1), y0 = int(r, h - H + 1);
      let ok = true;
      for (let y = y0 - 1; y <= y0 + H && ok; y++) for (let x = x0 - 1; x <= x0 + W && ok; x++) {
        const edge = x < x0 || y < y0 || x >= x0 + W || y >= y0 + H;
        if (edge ? x >= 0 && y >= 0 && x < w && y < h && res[y * w + x] : !inside(x, y) || res[y * w + x]) ok = false; // un cuarto no toca a otro
      }
      if (!ok) continue;
      for (let y = y0; y < y0 + H; y++) for (let x = x0; x < x0 + W; x++) res[y * w + x] = 1;
      rooms.push({ o: [x0, y0, x0 + W - 1, y0 + H - 1], rings, at: target * (0.12 + next(r) * 0.38) });
      break;
    }
  }
  rooms.sort((a, b) => a.at - b.at);
  // el anillo alrededor del rectángulo R: su camino en el sentido de las agujas (o al revés) con la punta en una esquina,
  // mirando hacia afuera por la prolongación del último lado (así su recta nunca cruza su cuerpo)
  const ringPaths = ([x0, y0, x1, y1]: Rect) => {
    const cyc: number[] = [];
    for (let x = x0; x <= x1; x++) cyc.push(y0 * w + x);
    for (let y = y0 + 1; y <= y1; y++) cyc.push(y * w + x1);
    for (let x = x1 - 1; x >= x0; x--) cyc.push(y1 * w + x);
    for (let y = y1 - 1; y > y0; y--) cyc.push(y * w + x0);
    const corners = [y0 * w + x0, y0 * w + x1, y1 * w + x1, y1 * w + x0], out: number[][] = [];
    for (const c of [cyc, cyc.slice().reverse()]) for (const k of corners) {
      const i = c.indexOf(k);
      out.push([...c.slice(i + 1), ...c.slice(0, i + 1)]);
    }
    return out;
  };
  const buildRoom = (rm: Room) => {
    const [X0, Y0, X1, Y1] = rm.o, I: Rect = [X0 + rm.rings, Y0 + rm.rings, X1 - rm.rings, Y1 - rm.rings];
    for (let y = I[1]; y <= I[3]; y++) for (let x = I[0]; x <= I[2]; x++) res[y * w + x] = 0;
    const inI = (x: number, y: number) => x >= I[0] && x <= I[2] && y >= I[1] && y <= I[3] && occ[y * w + x] < 0;
    const area = (I[2] - I[0] + 1) * (I[3] - I[1] + 1);
    let got = 0;
    for (let t = 0; t < area * 16 && got < area * 0.8; t++) {
      const c = best(3, () => candidate(inI, [2, 3], true, false, I));
      if (c) got += place(c.path.reverse(), c.ray) >= 0 ? c.path.length : 0;
    }
    let ok = got > 0;
    for (let k = 1; k <= rm.rings; k++) {
      const R: Rect = [I[0] - k, I[1] - k, I[2] + k, I[3] + k];
      for (let y = R[1]; y <= R[3]; y++) for (let x = R[0]; x <= R[2]; x++) if (x === R[0] || x === R[2] || y === R[1] || y === R[3]) res[y * w + x] = 0;
      if (!ok) continue;
      const opts = shuffle(r, ringPaths(R)).map(p => { const hd = p[p.length - 1], d = dirOfPath(p); return { p, hd, d }; })
        .filter(o => rayClear(o.hd % w, (o.hd / w) | 0, o.d));
      if (!opts.length) { ok = false; continue; }
      const o = opts.reduce((a, b) => gain(b.p) > gain(a.p) ? b : a);
      ringIds.push(place(o.p, rayCells(o.hd % w, (o.hd / w) | 0, o.d)));
    }
  };

  // ---- Llenado ----
  let ri = 0;
  for (let tries = 0; tries < N * 24 && filled < target; tries++) {
    while (ri < rooms.length && filled >= rooms[ri].at) buildRoom(rooms[ri++]);
    const late = tries > N * 16; // al final se aceptan flechas más cortas para tapar huecos
    if (next(r) < (sp.twin ?? 0)) { // un par de gemelas entrelazadas (más seguido, escaleras)
      let pair: { src: number[], ray: number[], t: Cand } | null = null, top = -1;
      for (let k = 0; k < Math.max(2, sp.pick * 2); k++) {
        const c = candidate(empty, sp.len, late, next(r) < Math.min(1, (sp.stair ?? 0) * 1.5));
        if (!c || c.path.length < 5) continue;
        const src = c.path.slice().reverse(), t = twinFor(src);
        if (!t) continue;
        const score = (gain(src) + gain(t.path)) * 3 + src.length * 0.25 + next(r) * 0.1;
        if (score > top) pair = { src, ray: c.ray, t }, top = score;
      }
      if (pair) { place(pair.t.path, pair.t.ray, place(pair.src, pair.ray)); continue; }
    }
    const c = best(sp.pick, () => candidate(empty, sp.len, late, next(r) < (sp.stair ?? 0)));
    if (c) place(c.path.reverse(), c.ray);
  }
  while (ri < rooms.length) buildRoom(rooms[ri++]);

  // colores: ninguna flecha del mismo color que una vecina (si alcanzan); las gemelas, con `same`, del color de la original
  const near = (a: Arrow, b: Arrow) => a.cells.some(i => b.cells.some(j => Math.abs(i % w - j % w) + Math.abs(((i / w) | 0) - ((j / w) | 0)) <= 1));
  const pal = shuffle(r, [...Array(PALETTE).keys()]).slice(0, Math.max(2, Math.min(PALETTE, sp.colors ?? PALETTE)));
  for (const a of arrows) {
    if (sp.same && twinOf[a.id] >= 0) { a.c = arrows[twinOf[a.id]].c; continue; }
    const used = new Set(arrows.filter(b => b.id < a.id && near(a, b)).map(b => b.c));
    const free = pal.filter(c => !used.has(c));
    a.c = free.length ? free[int(r, free.length)] : pal[int(r, pal.length)];
  }
  const b: Board = { w, h, arrows, mask: lay || sp.shape !== 'rect' ? mask : null };
  if (lay) b.isles = lay.isles, b.holes = lay.holes, b.pads = lay.pads;
  if (ringIds.length) b.rings = ringIds;
  if (twinOf.some(t => t >= 0)) b.twins = twinOf.flatMap((t, id) => t >= 0 ? [[t, id] as [number, number]] : []);
  return b;
}

// Qué tan difícil es: rondas para resolverlo, castigando las flechas libres al empezar y los tableros medio vacíos
export function hardness(b: Board): number {
  const n = b.arrows.length, cells = b.mask ? b.mask.reduce((s, v) => s + v, 0) : b.w * b.h;
  const fill = b.arrows.reduce((s, a) => s + a.cells.length, 0) / cells;
  return n ? layers(b) - (freeArrows(b).length / n) * 4 + Math.min(fill, 0.8) * 10 + n * 0.01 : 0;
}

export function generate(sp: Spec, seed: number): Board {
  let top: Board | null = null, topScore = -Infinity;
  for (let k = 0; k < Math.max(1, sp.k); k++) {
    const b = build(sp, rng(hash(seed, k, 0x51ec))), score = hardness(b);
    if (score > topScore) top = b, topScore = score;
  }
  return top!;
}
