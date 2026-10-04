/* El pozo: bloques de 12×12 (blocks.js) apilados por semilla. La run va en ciclos de 4
   tramos + jefe: genTramo(seed, c, k) describe el tramo con datos ({ seed, c, k, n, kind,
   chunks, mods, budget }) y cada teléfono construye el mismo mapa con buildLevel.
   Tiles dinámicos (plataformas que se derrumban, entrada y salida de la sala del jefe): lv.dyn
   es un mapa índice → tile que tileAt consulta antes que lv.tiles. */
import { CFG } from './config.js';
import { BLOCKS } from './blocks.js';
import { RINGS } from './rings.js';
import { BLOCK_META, CURRICULUM, ELEMENTS, MIDDLE, BUNGEE, RING_META, RING_MIDDLE, EXT_NEWS } from './content.js';

export { BLOCKS, MIDDLE, BUNGEE, RINGS };
export const EMPTY = 0, STONE = 1, WOOD = 2, SPIKE = 3, CRUMBLE = 4;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SOLID_CH = new Set(['#', '^']);

/* Verificaciones al cargar: 12×12, paredes en su lugar, huecos de ≥ 3 tiles arriba y abajo,
   que el bloque se pueda atravesar de arriba abajo, que todo carácter sea un elemento conocido
   y que los bloques aptos para el derrumbe cumplan sus reglas. */
function maxGap(row) {
  let best = 0, run = 0;
  for (const ch of row) { run = (ch === '.' || !SOLID_CH.has(ch) && ch !== '-') ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}
function crossable(rows) {
  const seen = new Set();
  const q = [];
  for (let x = 1; x < 11; x++) if (!SOLID_CH.has(rows[0][x])) { q.push([x, 0]); seen.add(x); }
  while (q.length) {
    const [x, y] = q.shift();
    if (y === 11) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx > 11 || ny < 0 || ny > 11 || SOLID_CH.has(rows[ny][nx])) continue;
      const k = ny * 12 + nx;
      if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  return false;
}

/* Errores de los asserts (también los muestra ?ver=bloques). */
export const BLOCK_ERRORS = [];
function check(ok, msg) {
  if (ok) return;
  BLOCK_ERRORS.push(msg);
  console.assert(false, msg);
}
const edgeGap = (row) => maxGap(row.replace(/=/g, '-'));
for (const [id, rows] of Object.entries(BLOCKS)) {
  check(rows.length === 12 && rows.every((r) => r.length === 12), `bloque ${id}: no mide 12×12`);
  check(rows.every((r) => r[0] === '#' && r[11] === '#'), `bloque ${id}: faltan paredes`);
  // Entre ojo_a y ojo_b (la sala del jefe va siempre junta) no hace falta el hueco
  if (id !== 'inicio' && id !== 'ojo_b') check(maxGap(rows[0]) >= 3, `bloque ${id}: fila de arriba sin hueco de 3`);
  if (id !== 'fin' && id !== 'ojo_a') check(maxGap(rows[11]) >= 3, `bloque ${id}: fila de abajo sin hueco de 3`);
  if (id !== 'inicio' && id !== 'fin') check(crossable(rows), `bloque ${id}: no se puede atravesar`);
  const m = BLOCK_META[id];
  check(!m.unknown.length, `bloque ${id}: caracteres sin elemento: ${m.unknown.join(' ')}`);
  if (m.chase) {
    check(!m.tags.includes('cube') && !m.tags.includes('bungee'), `bloque ${id}: con derrumbe no puede tener cubo ni bungee`);
    check(edgeGap(rows[0]) >= 4 && edgeGap(rows[11]) >= 4, `bloque ${id}: con derrumbe necesita hueco ≥ 4 arriba y abajo`);
  }
}

/* Anillos: 32×8, caracteres conocidos, murciélagos colgados de piedra, gárgolas sobre piedra,
   plataformas con riel (sin cruzar la columna 31→0) y la fila de arriba con ≥ 6 celdas libres
   seguidas (así el giro al azar siempre deja paso desde el anillo de arriba). */
const RW = CFG.EXT_COLS, RH = CFG.RING_H;
for (const [id, rows] of Object.entries(RINGS)) {
  check(rows.length === RH && rows.every((r) => r.length === RW), `anillo ${id}: no mide ${RW}×${RH}`);
  const m = RING_META[id];
  check(!m.unknown.length, `anillo ${id}: caracteres sin elemento: ${m.unknown.join(' ')}`);
  if (id !== 'ventana') check(maxGap(rows[0]) >= 6, `anillo ${id}: fila de arriba sin hueco de 6`);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === 'b') check(y > 0 && rows[y - 1][x] === '#', `anillo ${id}: murciélago sin techo en ${x},${y}`);
    if (ch === 'w') check(y < RH - 1 && rows[y + 1][x] === '#', `anillo ${id}: gárgola sin piso en ${x},${y}`);
  }));
  try { ringMovers(rows); } catch (e) { check(false, `anillo ${id}: ${e.message}`); }
}

/* Plataformas móviles de un anillo (coordenadas locales, en tiles): { x, y, w, axis, a, b } con
   a..b el recorrido de la columna izquierda (h) o de la fila (v). */
function ringMovers(rows) {
  const out = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      if (r[x] !== 'm' || r[x - 1] === 'm') continue;
      let w = 0;
      while (r[x + w] === 'm') w++;
      if (w < 2 || w > 3) throw new Error(`plataforma de ${w} tiles en ${x},${y}`);
      let l = x, rr = x + w - 1;
      while (r[l - 1] === 'h') l--;
      while (r[rr + 1] === 'h') rr++;
      let top = y, bot = y;
      const isV = (yy) => yy >= 0 && yy < rows.length && [...Array(w).keys()].some((k) => rows[yy][x + k] === 'v');
      while (isV(top - 1)) top--;
      while (isV(bot + 1)) bot++;
      if (l < x || rr > x + w - 1) out.push({ x, y, w, axis: 'h', a: l, b: rr - w + 1 });
      else if (top < y || bot > y) out.push({ x, y, w, axis: 'v', a: top, b: bot });
      else throw new Error(`plataforma sin riel en ${x},${y}`);
    }
  });
  return out;
}

const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));
const rotate = (rows, k) => rows.map((r) => (k ? r.slice(-k) + r.slice(0, -k) : r));

/* ¿Lleva derrumbe el tramo k del ciclo c? Nunca en k = 0 ni en el jefe (así nunca hay dos
   seguidos entre ciclos); en el ciclo que lo presenta, exactamente en el tramo 2 o el 3; en los
   ciclos «+1», al azar sin dos seguidos; nunca en el ciclo de presentación de otra novedad. */
export function chaseAt(seed, c, k) {
  if (k <= 0 || k >= 4) return false;
  const news = CURRICULUM(c).news;
  if (news.length && !news.includes('derrumbe')) return false;
  const r = mulberry32(seed ^ Math.imul(c + 1, 0x85ebca6b));
  if (news.includes('derrumbe')) return k === (r() < 0.5 ? 2 : 3);
  let prev = false;
  for (let j = 1; j <= k; j++) {
    const on = !prev && r() < CFG.CHASE_P(c);
    if (j === k) return on;
    prev = on;
  }
  return false;
}

/* Presupuesto de complejidad por bloque intermedio. */
export const budgetPer = (c, k) => CFG.B0 + CFG.Bc * c + CFG.Bk * k;

/* Cantidad de intermedios: 5 + k + 3c (tope); el primero del ciclo, corto (5 + c). */
export const blockCount = (c, k) => Math.min(k === 0 ? 5 + c : 5 + k + 3 * c, CFG.MAX_BLOCKS);

/* Elige al azar con peso: más probable cuanto más cerca del costo objetivo. */
function pickNear(rnd, ids, target, meta = BLOCK_META) {
  const w = ids.map((id) => 1 / (0.4 + Math.abs(meta[id].cost - target)) ** 1.5);
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) if ((r -= w[i]) <= 0) return ids[i];
  return ids[ids.length - 1];
}

/* Describe un tramo con datos. c y k empiezan en 0; k = 4 es el jefe.
   opts: { mods } fuerza modificadores; { boss } fuerza el jefe; { only } = INICIO + ese bloque + FIN. */
export function genTramo(seed, c = 0, k = 0, opts = {}) {
  if (opts.boss) k = 4;
  const n = c * 5 + k;
  const rnd = mulberry32(seed ^ Math.imul(n + 1, 0x9e3779b1));
  const cur = CURRICULUM(c);
  const flip = (id) => id + (rnd() < 0.5 ? '~' : ''); // ~ = espejado
  const base = { seed, c, k, n, biome: cur.biome };
  if (opts.only) return { ...base, kind: 'normal', chunks: ['inicio', opts.only, 'fin'], mods: opts.mods || [], budget: 0 };
  if (k >= 4) {
    return { ...base, kind: 'boss', boss: cur.boss, chunks: ['inicio', flip('antesala'), flip('antesala2'), 'ojo_a', 'ojo_b', 'fin'], mods: [], budget: 0 };
  }
  const mods = opts.mods || (chaseAt(seed, c, k) ? ['derrumbe'] : []);
  const chase = mods.includes('derrumbe');
  const count = blockCount(c, k);
  const budget = Math.round(budgetPer(c, k) * (chase ? CFG.CHASE_BUDGET : 1) * count * 10) / 10;
  const meta = BLOCK_META;
  let pool = MIDDLE.filter((id) => meta[id].minCycle <= c);
  if (chase) pool = pool.filter((id) => meta[id].chase && meta[id].cost <= CFG.CHASE_MAX_COST);
  const news = cur.news.filter((e) => ELEMENTS[e].kind !== 'modificador');
  const isNews = (id) => meta[id].tags.some((t) => news.includes(t));
  const cheapest = Math.min(...pool.map((id) => meta[id].cost));

  const mids = [];
  // Presentaciones primero en el tramo k = 0 del ciclo
  if (k === 0) for (const e of news) { const intro = MIDDLE.find((id) => meta[id].intro === e); if (intro) mids.push(intro); }
  const wantNews = news.length ? Math.round(count * CFG.NEWS_FRAC) : 0;
  let haveNews = mids.filter(isNews).length;
  let spent = mids.reduce((a, id) => a + meta[id].cost, 0);
  while (mids.length < count) {
    const slots = count - mids.length, last = mids[mids.length - 1];
    const target = (budget - spent) / slots;
    let id;
    if (!chase && rnd() < CFG.BUNGEE_P) id = BUNGEE[Math.floor(rnd() * BUNGEE.length)];
    else {
      const newsSlot = news.length > 0 && rnd() < (wantNews - haveNews) / slots;
      let cls = pool.filter((b) => b !== last && (!news.length || isNews(b) === newsSlot));
      if (!cls.length) cls = pool.filter((b) => b !== last);
      const afford = cls.filter((b) => meta[b].cost <= budget - spent - (slots - 1) * cheapest + 1e-6);
      // Sin presupuesto: respiro (los más baratos de la clase)
      id = afford.length ? pickNear(rnd, afford, target)
        : pickNear(rnd, cls.slice().sort((x, y) => meta[x].cost - meta[y].cost).slice(0, 2), 0);
    }
    if (isNews(id)) haveNews++;
    spent += meta[id].cost;
    mids.push(id);
  }
  // Al menos un bungee (salvo con derrumbe), sin pisar presentaciones ni novedades
  if (!chase && !mids.some((id) => BUNGEE.includes(id))) {
    const free = mids.map((id, i) => i).filter((i) => !meta[mids[i]].intro && !isNews(mids[i]));
    const at = free.length ? free[Math.floor(rnd() * free.length)] : mids.length - 1;
    mids[at] = BUNGEE[Math.floor(rnd() * BUNGEE.length)];
  }
  return { ...base, kind: 'normal', chunks: ['inicio', ...mids.map(flip), 'fin'], mods, budget };
}

/* Exterior de la torre: el mini (2 anillos; 3 desde c = 1) va entre el tramo 2 y el 3 de cada
   ciclo, y la bajada (4 + c, con tope) después del jefe. En la bajada del ciclo 0 se presentan
   las novedades del exterior, un anillo cada una; el mini del ciclo 0 solo usa anillos básicos.
   s: posición en la secuencia del ciclo (main.js). */
export function genExterior(seed, c = 0, sub = 'bajada', s = sub === 'mini' ? 2 : 6) {
  const n = c * 5 + (sub === 'mini' ? 2 : 5);
  const rnd = mulberry32(seed ^ Math.imul(c * 7 + s + 101, 0x9e3779b1));
  const meta = RING_META;
  const ring = (id) => ({ id, shift: Math.floor(rnd() * CFG.EXT_COLS), mirror: rnd() < 0.5 });
  const mids = [];
  const per = CFG.EXT_B0 + CFG.EXT_Bc * c;
  let count;
  if (c === 0 && sub === 'bajada') {
    for (const e of EXT_NEWS) mids.push(RING_MIDDLE.find((id) => meta[id].intro === e));
    const mixed = RING_MIDDLE.filter((id) => meta[id].minCycle > 0 && !meta[id].intro);
    mids.push(mixed[Math.floor(rnd() * mixed.length)]);
    count = mids.length;
  } else {
    count = sub === 'mini' ? (c === 0 ? 2 : 3) : Math.min(4 + c, CFG.EXT_MAX_RINGS);
    const pool = RING_MIDDLE.filter((id) => meta[id].minCycle <= c);
    let spent = 0;
    while (mids.length < count) {
      const last = mids[mids.length - 1];
      const cls = pool.filter((id) => id !== last);
      const id = pickNear(rnd, cls, (per * count - spent) / (count - mids.length), meta);
      spent += meta[id].cost;
      mids.push(id);
    }
  }
  const rings = [{ id: 'ventana', shift: 0, mirror: false }, ...mids.map(ring), ring('entrada')];
  return { seed, c, k: null, s, n, kind: 'exterior', sub, biome: 'exterior', rings, chunks: rings.map((r) => r.id), mods: [], budget: Math.round(per * count * 10) / 10 };
}

// Criaturas que salen de '?' según el nivel del tramo (n global)
function randomCreature(rnd, n, ext = false) {
  const pool = ['g', 'g', 'i'];
  if (n >= 1) pool.push('i');
  if (n >= 1 && !ext) pool.push('c'); // afuera no hay cubo
  if (n >= 2) pool.push('f');
  return pool[Math.floor(rnd() * pool.length)];
}

const KIND = { g: 'goblin', i: 'imp', c: 'cube', f: 'fairy', s: 'skeleton', b: 'bat' };
export const EYELETS = 6; // ojitos de El Ojo: lugares fijos, dormidos hasta que los suelta

/* Arma el mapa del tramo: tiles, gemas, criaturas, antorchas y puntos de aparición.
   check = false: sin el assert de alcanzabilidad (el visor arma bloques sueltos). */
export function buildLevel(tramo, check = true) {
  if (tramo.kind === 'exterior') return buildExterior(tramo, check);
  const T = CFG.TILE, W = CFG.COLS;
  const rnd = mulberry32(tramo.seed + 77 + tramo.n * 1013);
  const rows = [];
  const blocks = [];
  for (const c of tramo.chunks) {
    const id = c.replace('~', '');
    const src = BLOCKS[id];
    blocks.push({ id, y0: rows.length * T, bungee: BUNGEE.includes(id), cost: BLOCK_META[id]?.cost || 0 });
    rows.push(...(c.endsWith('~') ? mirror(src) : src));
  }
  const h = rows.length;
  const tiles = new Uint8Array(W * h);
  const gems = [], creatures = [], torches = [], gate = [], exit = [];
  let bossAt = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      let ch = rows[y][x];
      const cx = x * T + T / 2, cy = y * T + T / 2, i = y * W + x;
      if (ch === '?') ch = randomCreature(rnd, tramo.n);
      switch (ch) {
        case '#': tiles[i] = STONE; break;
        case '-': tiles[i] = WOOD; break;
        case '^': tiles[i] = SPIKE; break;
        case '=': tiles[i] = CRUMBLE; break;
        case 'D': gate.push(i); break;
        case 'X': exit.push(i); break;
        case 'O': bossAt = { x: cx + T / 2, y: cy + T / 2 }; break;
        case '*': gems.push({ x: cx, y: cy, big: false }); break;
        case 'G': gems.push({ x: cx, y: cy, big: true }); break;
        case 'T': torches.push({ x: cx, y: cy }); break;
        default: if (KIND[ch]) creatures.push({ kind: KIND[ch], x: cx, y: cy });
      }
    }
  }
  if (bossAt) {
    for (let k = 0; k < EYELETS; k++) creatures.push({ kind: 'eyelet', x: bossAt.x, y: bossAt.y, dormant: true });
    // Lluvia de gemas al morir: ocultas hasta entonces, sobre el piso que se abre
    const floorY = Math.floor(exit[0] / W) * T;
    for (let k = 0; k < 8; k++) gems.push({ x: 2 * T + 8 + rnd() * 8 * T, y: floorY - 20 - rnd() * 60, big: false, boss: true });
    gems.push({ x: (W * T) / 2, y: floorY - 40, big: true, boss: true });
  }
  const gateRow = gate.length ? Math.floor(gate[0] / W) : -1;
  // Aparición en el INICIO: sobre el piso de la fila 6, de izquierda a derecha
  const spawns = [0, 1, 2, 3].map((i) => ({ x: 80 + i * 24, y: 6 * T - CFG.PH / 2 }));
  const lv = { tramo, w: W, h, tiles, dyn: new Map(), shaking: new Map(), wrap: false, gems, creatures, torches, spawns, blocks, rows,
    gate, gateRow, exit, bossAt, pxH: h * T, finY: (h - 1) * T, decoSeed: Math.floor(rnd() * 1e9), movers: [], winds: [] };
  if (check) console.assert(reachable(lv), `tramo ${tramo.seed}/${tramo.n}: el FIN no se alcanza`);
  resetDyn(lv);
  return lv;
}

/* Arma el exterior: anillos apilados (espejados y girados) sobre un cilindro de EXT_COLS tiles
   (lv.wrap). Plataformas móviles en lv.movers (px; x0/y0 = el extremo izquierdo o de arriba del
   recorrido) y anillos con viento en lv.winds ({ y0, y1, calm, ph }). */
function buildExterior(tramo, check) {
  const T = CFG.TILE, W = CFG.EXT_COLS, RH = CFG.RING_H;
  const rnd = mulberry32(tramo.seed + 91 + tramo.n * 1013);
  const rows = [], blocks = [], movers = [], winds = [];
  tramo.rings.forEach((r) => {
    const y0 = rows.length;
    let src = RINGS[r.id];
    if (r.mirror) src = mirror(src);
    const meta = RING_META[r.id];
    blocks.push({ id: r.id, y0: y0 * T, bungee: false, cost: meta.cost });
    for (const m of ringMovers(src)) {
      const len = (m.b - m.a) * T, sx = r.shift * T;
      const mv = m.axis === 'h'
        ? { axis: 'h', w: m.w * T, x0: m.a * T + sx, y0: (y0 + m.y) * T, len, u0: (m.x - m.a) / (m.b - m.a) }
        : { axis: 'v', w: m.w * T, x0: m.x * T + sx, y0: (y0 + m.a) * T, len, u0: (m.y - m.a) / (m.b - m.a) };
      mv.period = (2 * len) / CFG.MOVER_V;
      movers.push(mv);
    }
    if (meta.wind) winds.push({ y0: y0 * T, y1: (y0 + RH) * T, calm: 4 + rnd() * 3, ph: rnd() * 7 });
    rows.push(...rotate(src, r.shift));
  });
  const h = rows.length;
  const tiles = new Uint8Array(W * h);
  const gems = [], creatures = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      let ch = rows[y][x];
      const cx = x * T + T / 2, cy = y * T + T / 2, i = y * W + x;
      if (ch === '?') ch = randomCreature(rnd, tramo.n, true);
      switch (ch) {
        case '#': tiles[i] = STONE; break;
        case '-': tiles[i] = WOOD; break;
        case '^': tiles[i] = SPIKE; break;
        case '=': tiles[i] = CRUMBLE; break;
        case '*': gems.push({ x: cx, y: cy, big: false }); break;
        case 'G': gems.push({ x: cx, y: cy, big: true }); break;
        case 'w': { // sopla hacia su lado libre (si los dos lo están, según la columna)
          const l = rows[y][(x + W - 1) % W] === '#', rr = rows[y][(x + 1) % W] === '#';
          creatures.push({ kind: 'gargoyle', x: cx, y: cy, dir: l && !rr ? 1 : rr && !l ? -1 : (x % 2 ? 1 : -1) });
          break;
        }
        default: if (KIND[ch]) creatures.push({ kind: KIND[ch], x: cx, y: cy });
      }
    }
  }
  const spawns = [0, 1, 2, 3].map((i) => ({ x: 80 + i * 24, y: 6 * T - CFG.PH / 2 }));
  const lv = { tramo, w: W, h, tiles, dyn: new Map(), shaking: new Map(), wrap: true, gems, creatures, torches: [], spawns, blocks, rows,
    gate: [], gateRow: -1, exit: [], bossAt: null, pxH: h * T, finY: (h - 1) * T, decoSeed: Math.floor(rnd() * 1e9), movers, winds };
  if (check) console.assert(reachable(lv), `exterior ${tramo.seed}/${tramo.c}/${tramo.sub}: el FIN no se alcanza`);
  resetDyn(lv);
  return lv;
}

/* Estado inicial de los tiles dinámicos: el piso de la sala del jefe, cerrado. */
export function resetDyn(lv) {
  lv.dyn.clear();
  lv.shaking.clear();
  for (const i of lv.exit) lv.dyn.set(i, STONE);
}

/* Consulta de tiles. Con lv.wrap (la torre exterior del futuro) la x da la vuelta;
   fuera del mapa todo es piedra. */
export function tileAt(lv, tx, ty) {
  if (ty < 0 || ty >= lv.h) return STONE;
  if (tx < 0 || tx >= lv.w) {
    if (!lv.wrap) return STONE;
    tx = ((tx % lv.w) + lv.w) % lv.w;
  }
  const i = ty * lv.w + tx;
  if (lv.dyn.size) { const d = lv.dyn.get(i); if (d !== undefined) return d; }
  return lv.tiles[i];
}
/* Sin los tiles dinámicos (el campo de los bots ve la salida del jefe abierta). */
export function baseTileAt(lv, tx, ty) {
  if (ty < 0 || ty >= lv.h || tx < 0 || tx >= lv.w) return STONE;
  return lv.tiles[ty * lv.w + tx];
}
export const isWoodLike = (t) => t === WOOD || t === CRUMBLE;
export const solidAt = (lv, tx, ty) => { const t = tileAt(lv, tx, ty); return t === STONE || t === SPIKE; };

function reachable(lv) {
  const { w, h } = lv;
  const seen = new Uint8Array(w * h);
  const q = [[5, 5]];
  seen[5 * w + 5] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    if (y === h - 2) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = lv.wrap ? (x + dx + w) % w : x + dx, ny = y + dy;
      if (solidAt(lv, nx, ny) || seen[ny * w + nx]) continue;
      seen[ny * w + nx] = 1;
      q.push([nx, ny]);
    }
  }
  return false;
}
