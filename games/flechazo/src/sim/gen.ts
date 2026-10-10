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
// - Sin huecos (regla del juego): toda celda de la figura es parte de una flecha. Después del llenado al azar, cada celda
//   vacía que queda es la punta de una flecha nueva (si su recta está libre) y, si no se puede, se la lleva una vecina (por
//   la cola, por la punta o partiéndola en dos), siempre que el tablero siga teniendo solución. Un tablero que igual
//   queda con huecos se descarta.
// - Islas (`isl`): el tablero partido en una grilla de islas iguales sobre el vacío (se pasa por portales) o con un hueco al
//   medio. Las rectas cruzan el vacío: una flecha sale solo si su recta está libre en su isla y en todas las que cruza hasta
//   el borde (bordes falsos). Con `cross`, el generador prefiere trabar flechas de otras islas.
import { rng, next, int, shuffle, hash, type Rng } from './rng.ts';
import { DX, DY, layers, freeArrows, occupancy, blockerOf, isleOf, solveOrder, type Arrow, type Board, type Rect, type Pad } from './puzzle.ts';

export type Shape = 'rect' | 'diamond' | 'circle' | 'cross' | 'heart' | 'star';
export type Layout = 'one' | 'two' | 'four' | 'grid' | 'hole';
export type Spec = {
  w: number, h: number,
  len: [number, number], // largo de las flechas en celdas
  turn: number,          // probabilidad de doblar en cada paso
  fill: number,          // fracción de la figura que se llena al azar (el resto se completa: no quedan huecos)
  block: number,         // preferencia por pisar rectas ajenas
  pick: number,          // flechas candidatas por lugar (queda la que traba más flechas libres)
  shape: Shape,
  k: number,             // candidatos (se queda el más difícil)
  isl?: Layout,          // una isla, dos, cuatro, una grilla (`grid`) o una con un hueco al medio (sin figura)
  grid?: [number, number], // con `grid`: columnas y filas de islas
  cross?: number,        // peso extra por trabar una flecha de otra isla
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
export const GAP = 6;      // columnas (o filas) de vacío entre islas (10,8 m entre pisos: solo se cruza con el equipo)

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

// Saca de la figura las celdas sin vecinas (una flecha ocupa al menos dos celdas: quedarían vacías)
function clean(mask: number[], w: number, h: number): number[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  return mask.map((v, i) => v && [0, 1, 2, 3].some(d => at((i % w) + DX[d], ((i / w) | 0) + DY[d])) ? 1 : 0);
}

// Islas, huecos y portales. Las islas son una grilla de rectángulos iguales (si sobran columnas o filas, quedan repartidas
// en los bordes) y cada isla tiene un portal a cada vecina, en el medio del lado que la mira; esa celda queda fuera de la
// figura (sin flechas, para pararse). Las islas van numeradas por filas, de arriba a la izquierda.
export function layoutOf(isl: Layout, w: number, h: number, grid?: [number, number]): { mask: number[], isles: Rect[], holes: Rect[], pads: Pad[] } {
  const isles: Rect[] = [], holes: Rect[] = [], pads: Pad[] = [];
  const [gc, gr] = isl === 'grid' && grid ? grid : isl === 'four' ? [2, 2] : isl === 'two' ? (w >= h ? [2, 1] : [1, 2]) : [1, 1];
  const iw = Math.floor((w - (gc - 1) * GAP) / gc), ih = Math.floor((h - (gr - 1) * GAP) / gr);
  const sx = Math.floor((w - gc * iw - (gc - 1) * GAP) / 2), sy = Math.floor((h - gr * ih - (gr - 1) * GAP) / 2);
  for (let r = 0; r < gr; r++) for (let c = 0; c < gc; c++) {
    const x0 = sx + c * (iw + GAP), y0 = sy + r * (ih + GAP);
    isles.push([x0, y0, x0 + iw - 1, y0 + ih - 1]);
  }
  const at = (x: number, y: number) => y * w + x;
  const link = (a: number, ca: number, b: number, cb: number) => {
    const i = pads.length;
    pads.push({ cell: ca, to: i + 1, isle: a }, { cell: cb, to: i, isle: b });
  };
  for (let r = 0; r < gr; r++) for (let c = 0; c < gc; c++) {
    const i = r * gc + c, [x0, y0, x1, y1] = isles[i], my = y0 + (ih >> 1), mx = x0 + (iw >> 1);
    if (c + 1 < gc) link(i, at(x1, my), i + 1, at(isles[i + 1][0], my));
    if (r + 1 < gr) link(i, at(mx, y1), i + gc, at(mx, isles[i + gc][1]));
  }
  if (isl === 'hole') {
    const hw = Math.max(2, Math.round(w * 0.3)), hh = Math.max(2, Math.round(h * 0.3)), x0 = Math.floor((w - hw) / 2), y0 = Math.floor((h - hh) / 2);
    holes.push([x0, y0, x0 + hw - 1, y0 + hh - 1]);
  }
  const inR = (x: number, y: number, [x0, y0, x1, y1]: Rect) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const mask: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask.push(isles.some(r => inR(x, y, r)) && !holes.some(r => inR(x, y, r)) ? 1 : 0);
  for (const p of pads) mask[p.cell] = 0;
  return { mask, isles, holes, pads };
}

type Cand = { path: number[], ray: number[] };
const OFFS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function build(sp: Spec, r: Rng): { b: Board, gaps: number[] } {
  const { w, h } = sp, N = w * h, lay = sp.isl && sp.isl !== 'one' ? layoutOf(sp.isl, w, h, sp.grid) : null;
  const mask = clean(lay ? lay.mask : maskOf(sp.shape, w, h), w, h);
  const isleIx = new Int8Array(N).fill(-1); // isla de cada celda (para `cross`)
  lay?.isles.forEach(([x0, y0, x1, y1], k) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) isleIx[y * w + x] = k; });
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
  // `edge`: punta y dirección forzadas (en el borde de una isla, mirando a otra)
  const candidate = (ok: (x: number, y: number) => boolean, len: [number, number], late: boolean, stair: boolean, area?: Rect, edge?: [number, number]): Cand | null => {
    const hx = edge ? edge[0] % w : area ? area[0] + int(r, area[2] - area[0] + 1) : int(r, w);
    const hy = edge ? (edge[0] / w) | 0 : area ? area[1] + int(r, area[3] - area[1] + 1) : int(r, h), hi = hy * w + hx;
    if (!ok(hx, hy)) return null;
    const dirs = (edge ? [edge[1]] : shuffle(r, [0, 1, 2, 3])).filter(d => ok(hx - DX[d], hy - DY[d]) && rayClear(hx, hy, d));
    if (!dirs.length) return null;
    // con `aim`, la dirección de recta más larga: apunta hacia adentro, así lo que se ponga después la puede tapar
    const rl = (d: number) => d === 0 ? w - 1 - hx : d === 1 ? h - 1 - hy : d === 2 ? hx : hy;
    const d = !edge && next(r) < (sp.aim ?? 0) ? dirs.reduce((a, b) => rl(b) > rl(a) ? b : a) : dirs[0], ray = rayCells(hx, hy, d);
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
  // cuántas flechas todavía libres trabaría (las de otra isla, con `cross`, pesan más)
  const gain = (path: number[]) => arrows.reduce((n, a) => n + (!blocked[a.id] && rays[a.id].some(i => path.includes(i))
    ? 1 + (isleIx[a.cells[0]] !== isleIx[path[0]] ? sp.cross ?? 0 : 0) : 0), 0);
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
    for (let t = 0; t < area * 24 && got < area; t++) {
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

  // bordes de isla que miran a otra isla (punta, dirección): una flecha ahí parece libre en su isla y choca en la de enfrente
  const edges: [number, number][] = [];
  if (sp.cross && lay && lay.isles.length > 1) for (let i = 0; i < N; i++) {
    if (isleIx[i] < 0 || !mask[i]) continue;
    for (let d = 0; d < 4; d++) {
      const x = (i % w) + DX[d], y = ((i / w) | 0) + DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h || isleIx[y * w + x] >= 0) continue;
      if (rayCells(i % w, (i / w) | 0, d).some(j => isleIx[j] >= 0 && isleIx[j] !== isleIx[i])) edges.push([i, d]);
    }
  }

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
    const c = edges.length && next(r) < 0.6
      ? best(2, () => candidate(empty, sp.len, late, false, undefined, edges[int(r, edges.length)]))
      : best(sp.pick, () => candidate(empty, sp.len, late, next(r) < (sp.stair ?? 0)));
    if (c) place(c.path.reverse(), c.ray);
  }
  while (ri < rooms.length) buildRoom(rooms[ri++]);

  // ---- Sin huecos: las celdas vacías se las llevan las flechas vecinas (alargándolas por la cola o la punta, hasta el largo
  // máximo); con lo que queda se arman flechas nuevas con la punta ahí y, si no, se parte una vecina en dos ----
  const holes = () => { const out: number[] = []; for (let i = 0; i < N; i++) if (mask[i] && occ[i] < 0) out.push(i); return out; };
  const rayFor = (cells: number[]) => { const hd = cells[cells.length - 1]; return rayCells(hd % w, (hd / w) | 0, dirOfPath(cells)); };
  const selfOk = (cells: number[]) => !rayFor(cells).some(i => cells.includes(i));
  const tmp: Board = { w, h, arrows, mask: null };
  // reemplaza la flecha `id` por `a` (y suma `b`, si la parte en dos) solo si el tablero sigue teniendo solución
  const apply = (id: number, a: number[], b: number[] | null) => {
    if (!selfOk(a) || (b && !selfOk(b))) return false;
    const old = arrows[id].cells, nid = arrows.length;
    arrows[id].cells = a;
    if (b) arrows.push({ id: nid, cells: b, c: 0 });
    if (!solveOrder(tmp)) { arrows[id].cells = old; if (b) arrows.pop(); return false; }
    for (const i of a) occ[i] = id;
    if (b) { for (const i of b) occ[i] = nid; rays.push(rayFor(b)); blocked.push(false); twinOf.push(-1); }
    rays[id] = rayFor(a);
    // si era parte de un anillo o de unas gemelas, deja de serlo
    if (ringIds.includes(id)) ringIds.splice(ringIds.indexOf(id), 1);
    for (let k = 0; k < twinOf.length; k++) if (twinOf[k] === id || (k === id && twinOf[k] >= 0)) twinOf[k] = -1;
    return true;
  };
  const special = (id: number) => ringIds.includes(id) || twinOf[id] >= 0 || twinOf.includes(id);
  // mode 0: alargar (sin pasar el largo máximo); 1: también partir; 2: también anillos y gemelas
  const absorb = (e: number, mode: number) => {
    const x = e % w, y = (e / w) | 0;
    for (const d of shuffle(r, [0, 1, 2, 3])) {
      const nx = x + DX[d], ny = y + DY[d], j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || occ[j] < 0 || (mode < 2 && special(occ[j]))) continue;
      const id = occ[j], A = arrows[id].cells, k = A.indexOf(j), n = A.length, opts: [number[], number[] | null][] = [];
      if (mode || n < Math.ceil(sp.len[1] * 1.5)) {
        if (k === 0) opts.push([[e, ...A], null]);                                   // por la cola
        if (k === n - 1 && (mode || !sp.cross)) opts.push([[...A, e], null]);        // por la punta (con `cross`, no: la punta queda en el borde)
      }
      if (mode) {
        if (n - k - 1 >= 2) opts.push([[...A.slice(0, k + 1), e], A.slice(k + 1)]); // partida: la primera parte termina en e
        if (k >= 2) opts.push([A.slice(0, k), [e, ...A.slice(k)]]);                  // partida: e es la cola de la segunda
      }
      for (const [a, b] of shuffle(r, opts)) if (apply(id, a, b)) return;
    }
  };
  const fresh = () => {
    for (const i of shuffle(r, holes())) {
      if (occ[i] >= 0) continue;
      // con `cross`, primero mirando a otra isla
      const ds = shuffle(r, [0, 1, 2, 3]).sort((a, b) => +edges.some(e => e[0] === i && e[1] === b) - +edges.some(e => e[0] === i && e[1] === a));
      const c = best(2, () => { for (const d of ds) { const k = candidate(empty, [2, sp.len[1]], true, false, undefined, [i, d]); if (k) return k; } return null; });
      if (c) place(c.path.reverse(), c.ray);
    }
  };
  for (let pass = 0; pass < 6; pass++) for (const e of shuffle(r, holes())) if (occ[e] < 0) absorb(e, 0);
  fresh();
  for (let pass = 0; pass < 2; pass++) for (const e of shuffle(r, holes())) if (occ[e] < 0) absorb(e, 0);
  fresh();
  for (let pass = 0; pass < 4; pass++) for (const e of shuffle(r, holes())) if (occ[e] < 0) absorb(e, pass < 2 ? 1 : 2);

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
  return { b, gaps: holes() };
}

// Celdas de la figura sin flecha (la regla: ninguna)
export function gapsOf(b: Board): number[] {
  const used = new Uint8Array(b.w * b.h), out: number[] = [];
  for (const a of b.arrows) for (const i of a.cells) used[i] = 1;
  for (let i = 0; i < b.w * b.h; i++) if ((!b.mask || b.mask[i]) && !used[i]) out.push(i);
  return out;
}

// Qué tan difícil es: rondas para resolverlo, castigando las flechas libres al empezar y los tableros medio vacíos; con
// islas, premiando las flechas que choca con una de otra isla
export function hardness(b: Board): number {
  const n = b.arrows.length, cells = b.mask ? b.mask.reduce((s, v) => s + v, 0) : b.w * b.h;
  if (!n) return 0;
  const fill = b.arrows.reduce((s, a) => s + a.cells.length, 0) / cells;
  return layers(b) - (freeArrows(b).length / n) * 4 + Math.min(fill, 0.8) * 10 + n * 0.01 + (crossBlocked(b) / n) * 8;
}

// Cuántas flechas chocan primero con una de otra isla (su recta está libre en su isla)
export function crossBlocked(b: Board): number {
  if (!b.isles || b.isles.length < 2) return 0;
  const occ = occupancy(b);
  return b.arrows.filter(a => { const k = blockerOf(b, a, occ); return k && isleOf(b, a.cells[0]) !== isleOf(b, b.arrows[k.id].cells[0]); }).length;
}

// Entre `k` candidatos sin huecos, el más difícil. Si alguno queda con huecos se prueban más; en el peor caso (no pasa en
// los niveles del juego: lo vigila un test) las celdas que sobran salen de la figura.
export function generate(sp: Spec, seed: number): Board {
  let top: Board | null = null, topScore = -Infinity, low: { b: Board, gaps: number[] } | null = null;
  for (let k = 0; k < Math.max(1, sp.k) || (!top && k < sp.k + 40); k++) {
    const c = build(sp, rng(hash(seed, k, 0x51ec)));
    if (c.gaps.length) { if (!low || c.gaps.length < low.gaps.length) low = c; continue; }
    const score = hardness(c.b);
    if (score > topScore) top = c.b, topScore = score;
  }
  if (top) return top;
  const b = low!.b, mask = b.mask ?? Array(b.w * b.h).fill(1);
  for (const i of low!.gaps) mask[i] = 0;
  b.mask = mask;
  return b;
}
