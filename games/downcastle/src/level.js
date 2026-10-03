/* El pozo: bloques de 12×12 hechos a mano en ASCII, apilados por semilla.
   Cada tramo es INICIO + (5 + n, tope 9) intermedios (al menos un BUNGEE) + FIN.
   El anfitrión manda { seed, n, chunks, mods } y cada teléfono construye el mismo mapa.

   Leyenda: # piedra · - madera (se cruza desde abajo y con la picada) · ^ pinchos
            * gema · G gema grande · g goblin · i diablillo · c cubo · f hada
            ? criatura al azar según el nivel · T antorcha · . vacío            */
import { CFG } from './config.js';

export const EMPTY = 0, STONE = 1, WOOD = 2, SPIKE = 3;

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

export const BLOCKS = {
  inicio: [
    '############',
    '#T........T#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#...########',
    '#..........#',
    '#......*...#',
    '#..........#',
    '#...--..*..#',
    '#..........#',
  ],
  fin: [
    '#..........#',
    '#..........#',
    '#.*......*.#',
    '#..........#',
    '#T........T#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#T........T#',
    '#..........#',
    '############',
  ],
  cornisas: [
    '#..........#',
    '#..........#',
    '#.g....*...#',
    '######.....#',
    '#..........#',
    '#......T...#',
    '#.....g....#',
    '#....#######',
    '#..........#',
    '#.*........#',
    '####.......#',
    '#......*...#',
  ],
  madera: [
    '#..........#',
    '#..........#',
    '#.---..---.#',
    '#..........#',
    '#....**....#',
    '#...----...#',
    '#..........#',
    '#i.........#',
    '#.--....--.#',
    '#..........#',
    '#T...?....T#',
    '#...----...#',
  ],
  pinchos: [
    '#..........#',
    '#..........#',
    '#..........#',
    '#.^^....^^.#',
    '#.##....##.#',
    '#..........#',
    '#....*.....#',
    '##^^....^^##',
    '####....####',
    '#..........#',
    '#...*..*...#',
    '#..........#',
  ],
  cubo: [
    '#..........#',
    '#..........#',
    '#c.........#',
    '#.....*....#',
    '#..........#',
    '#...######.#',
    '#..........#',
    '#.........c#',
    '#..*.......#',
    '#.######...#',
    '#..........#',
    '#..........#',
  ],
  hadas: [
    '#..........#',
    '#..........#',
    '#....f.....#',
    '#..........#',
    '#.--....--.#',
    '#..........#',
    '#..i....i..#',
    '#..........#',
    '#####..#####',
    '#..........#',
    '#.T..*...T.#',
    '#..........#',
  ],
  goblins: [
    '#..........#',
    '#..........#',
    '#...g...g..#',
    '#.########.#',
    '#..........#',
    '#.*......*.#',
    '#..........#',
    '###......###',
    '#...g......#',
    '#..#####...#',
    '#..........#',
    '#..........#',
  ],
  estrecho: [
    '#..........#',
    '#..........#',
    '####....####',
    '####....####',
    '###......###',
    '###..*...###',
    '###......###',
    '####....####',
    '####.i..####',
    '###......###',
    '###.*..*.###',
    '##........##',
  ],
  torres: [
    '#..........#',
    '#..........#',
    '#.*..##..*.#',
    '#....##....#',
    '#....##....#',
    '#.?..##....#',
    '###..##..###',
    '#....##....#',
    '#....##..?.#',
    '#.--.##.--.#',
    '#..........#',
    '#..........#',
  ],
  zigzag: [
    '#..........#',
    '#..........#',
    '#........*.#',
    '#..#########',
    '#..........#',
    '#...i......#',
    '#########..#',
    '#..........#',
    '#.*....g...#',
    '#..#########',
    '#..........#',
    '#..........#',
  ],
  saltos: [
    '#..........#',
    '#..........#',
    '#...*..*...#',
    '#..........#',
    '#^^......^^#',
    '###......###',
    '#..........#',
    '#...?..?...#',
    '#...----...#',
    '#..........#',
    '#^........^#',
    '##........##',
  ],
  /* Bloques BUNGEE: gema grande sobre un foso de pinchos, bajo una saliente. Uno se ancla
     en la saliente y otro se tira: la cuerda (máx. 96 px) llega a la gema pero no a los
     pinchos del fondo. Si el ancla suelta antes, cae; si suelta tarde, el rebote lo
     estrella contra los pinchos del techo. */
  bungee: [
    '#..........#',
    '#####......#',
    '#^^^^......#',
    '#.....*....#',
    '#....####..#',
    '#....#.....#',
    '#....#..*..#',
    '#.G..#.....#',
    '#....#.--..#',
    '#....#.....#',
    '#..........#',
    '#^^^^......#',
  ],
  bungee2: [
    '#..........#',
    '#...####...#',
    '#....^^....#',
    '#..........#',
    '#.###..###.#',
    '#..#....#..#',
    '#..#....#..#',
    '#..#.G..#..#',
    '#..#....#..#',
    '#.*#....#*.#',
    '#..........#',
    '#...#^^#...#',
  ],
};

export const MIDDLE = ['cornisas', 'madera', 'pinchos', 'cubo', 'hadas', 'goblins', 'estrecho', 'torres', 'zigzag', 'saltos'];
export const BUNGEE = ['bungee', 'bungee2'];

const SOLID_CH = new Set(['#', '^']);

/* Verificaciones al cargar: 12×12, paredes en su lugar, huecos de ≥ 3 tiles arriba y abajo
   y que el bloque se pueda atravesar de arriba abajo. */
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
for (const [id, rows] of Object.entries(BLOCKS)) {
  console.assert(rows.length === 12 && rows.every((r) => r.length === 12), `bloque ${id}: no mide 12×12`);
  console.assert(rows.every((r) => r[0] === '#' && r[11] === '#'), `bloque ${id}: faltan paredes`);
  if (id !== 'inicio') console.assert(maxGap(rows[0]) >= 3, `bloque ${id}: fila de arriba sin hueco de 3`);
  if (id !== 'fin') console.assert(maxGap(rows[11]) >= 3, `bloque ${id}: fila de abajo sin hueco de 3`);
  if (id !== 'inicio' && id !== 'fin') console.assert(crossable(rows), `bloque ${id}: no se puede atravesar`);
}

const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));

/* Describe un tramo con datos. n empieza en 0. */
export function genTramo(seed, n) {
  const rnd = mulberry32(seed ^ Math.imul(n + 1, 0x9e3779b1));
  const count = Math.min(5 + n, 9);
  const mids = [];
  let last = '';
  for (let i = 0; i < count; i++) {
    const pool = rnd() < 0.16 ? BUNGEE : MIDDLE;
    let id;
    do { id = pool[Math.floor(rnd() * pool.length)]; } while (id === last && pool.length > 1);
    last = id;
    mids.push(id + (rnd() < 0.5 ? '~' : '')); // ~ = espejado
  }
  if (!mids.some((c) => BUNGEE.includes(c.replace('~', '')))) {
    const at = 1 + Math.floor(rnd() * (count - 1));
    mids[at] = BUNGEE[Math.floor(rnd() * BUNGEE.length)] + (rnd() < 0.5 ? '~' : '');
  }
  return { seed, n, chunks: ['inicio', ...mids, 'fin'], mods: [] };
}

// Criaturas que salen de '?' según el nivel del tramo
function randomCreature(rnd, n) {
  const pool = ['g', 'g', 'i'];
  if (n >= 1) pool.push('i', 'c');
  if (n >= 2) pool.push('f');
  return pool[Math.floor(rnd() * pool.length)];
}

const KIND = { g: 'goblin', i: 'imp', c: 'cube', f: 'fairy' };

/* Arma el mapa del tramo: tiles, gemas, criaturas, antorchas y puntos de aparición. */
export function buildLevel(tramo) {
  const T = CFG.TILE, W = CFG.COLS;
  const rnd = mulberry32(tramo.seed + 77 + tramo.n * 1013);
  const rows = [];
  const blocks = [];
  for (const c of tramo.chunks) {
    const id = c.replace('~', '');
    const src = BLOCKS[id];
    blocks.push({ id, y0: rows.length * T, bungee: BUNGEE.includes(id) });
    rows.push(...(c.endsWith('~') ? mirror(src) : src));
  }
  const h = rows.length;
  const tiles = new Uint8Array(W * h);
  const gems = [], creatures = [], torches = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      let ch = rows[y][x];
      const cx = x * T + T / 2, cy = y * T + T / 2;
      if (ch === '?') ch = randomCreature(rnd, tramo.n);
      switch (ch) {
        case '#': tiles[y * W + x] = STONE; break;
        case '-': tiles[y * W + x] = WOOD; break;
        case '^': tiles[y * W + x] = SPIKE; break;
        case '*': gems.push({ x: cx, y: cy, big: false }); break;
        case 'G': gems.push({ x: cx, y: cy, big: true }); break;
        case 'T': torches.push({ x: cx, y: cy }); break;
        default: if (KIND[ch]) creatures.push({ kind: KIND[ch], x: cx, y: cy });
      }
    }
  }
  // Aparición en el INICIO: sobre el piso de la fila 6, de izquierda a derecha
  const spawns = [0, 1, 2, 3].map((i) => ({ x: 80 + i * 24, y: 6 * T - CFG.PH / 2 }));
  const lv = { tramo, w: W, h, tiles, wrap: false, gems, creatures, torches, spawns, blocks, rows,
    pxH: h * T, finY: (h - 1) * T, decoSeed: Math.floor(rnd() * 1e9) };
  console.assert(reachable(lv), `tramo ${tramo.seed}/${tramo.n}: el FIN no se alcanza`);
  return lv;
}

/* Consulta de tiles. Con lv.wrap (la torre exterior del futuro) la x da la vuelta;
   fuera del mapa todo es piedra. */
export function tileAt(lv, tx, ty) {
  if (ty < 0 || ty >= lv.h) return STONE;
  if (tx < 0 || tx >= lv.w) {
    if (!lv.wrap) return STONE;
    tx = ((tx % lv.w) + lv.w) % lv.w;
  }
  return lv.tiles[ty * lv.w + tx];
}
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
      const nx = x + dx, ny = y + dy;
      if (solidAt(lv, nx, ny) || seen[ny * w + nx]) continue;
      seen[ny * w + nx] = 1;
      q.push([nx, ny]);
    }
  }
  return false;
}
