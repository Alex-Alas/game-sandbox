// LUCERO — niveles procedurales sin fin. `levelDef(n)` arma el nivel n de forma determinista (forma
// del tablero, capas, colores y metas); los movimientos y las estrellas salen de calibrarlo con el
// bot (`calibrate`): se juega R veces sin límite y los movimientos son el cuantil `q` de lo que
// necesitó, así el bot gana ≈ q de las veces. Dificultad en serrucho: cada 5 niveles DIFÍCIL, cada
// 10 SÚPER DIFÍCIL y el siguiente es un respiro. La tabla precalculada vive en cal.js
// (`node games/lucero/tools/simrun.mjs --calibrar`); si GEN_V no coincide, se calibra en el navegador.
import { hash, rnd, rndInt, S } from './const.js';
import { createBoard, step, trySwap, tapSpecial, goalsDone, runBonus, cloneBoard, listMoves } from './board.js';
import { bestMove } from './bot.js';

export const GEN_V = 3; // subir al cambiar el generador o el motor de forma que cambie la calibración

// Formas (simétricas). '#' = sin celda
const SHAPES = [
  ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
  ['##.....##', '#.......#', '.........', '.........', '.........', '.........', '.........', '#.......#', '##.....##'],
  ['###...###', '##.....##', '#.......#', '.........', '.........', '.........', '#.......#', '##.....##', '###...###'],
  ['.........', '.........', '#.......#', '##.....##', '###...###', '##.....##', '#.......#', '.........', '.........'],
  ['.........', '.........', '..##.##..', '..##.##..', '.........', '.........', '.........', '.........', '.........'],
  ['....#....', '....#....', '....#....', '.........', '.........', '.........', '.........', '.........', '.........'],
  ['...###...', '...###...', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
  ['#..###..#', '.........', '.........', '.........', '.........', '#.......#', '##.....##', '###...###', '####.####'],
  ['.........', '.........', '.........', '...###...', '...###...', '...###...', '.........', '.........', '.........'],
  ['##.....##', '##.....##', '.........', '.........', '.........', '.........', '.........', '##.....##', '##.....##'],
  ['.........', '.#.....#.', '.........', '.........', '....#....', '.........', '.........', '.#.....#.', '.........'],
  ['..#...#..', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '#.......#'],
  ['........', '........', '........', '........', '........', '........', '........', '........'],
  ['#......#', '........', '........', '........', '........', '........', '........', '#......#'],
  ['.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......'],
  ['#.......#', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
  ['.......', '.......', '.......', '.......', '.......', '.......', '.......'],
  ['##....##', '#......#', '........', '........', '........', '........', '#......#', '##....##'],
];
const SMALL = [12, 13, 14, 16, 17]; // para los primeros niveles

// q: fracción de corridas del bot que entra en los movimientos. El bot simula las cascadas de cada
// jugada (juega mejor que una persona), así que los cuantiles van un poco holgados
export const TIERS = [
  { name: '', q: 0.78 },
  { name: 'DIFÍCIL', q: 0.6 },
  { name: 'SÚPER DIFÍCIL', q: 0.45 },
  { name: '', q: 0.9 }, // respiro tras un nivel difícil
];
export function tierOf(n) {
  if (n >= 20 && n % 10 === 0) return 2;
  if (n >= 10 && n % 5 === 0) return 1;
  if (n > 10 && (n % 5 === 1)) return 3;
  return 0;
}
const quantileFor = (n, tier) => (n <= 10 ? 0.97 : TIERS[tier].q);

// Mecánicas nuevas: el nivel en que aparecen lleva una tarjeta de presentación
export const INTRO = { fog: 3, rock: 6, frost: 12, drop: 17 };
// Enseñanza de especiales: el primer intento de ese nivel tiene esa jugada a mano (y la pista la marca)
export const TEACH = { 1: 'match', 2: S.H, 4: S.FLY, 5: S.NOVA, 8: 'combo', 9: S.STAR };

function sym(W, H, f) { // f(x, y) solo para la mitad izquierda; se espeja
  const a = new Array(W * H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const xx = Math.min(x, W - 1 - x); a[y * W + x] = f(xx, y); }
  return a;
}

const FOG = [
  (W, H) => sym(W, H, () => 1),
  (W, H) => sym(W, H, (x, y) => (y >= H - 4 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => (y >= H - 3 ? 2 : y >= H - 5 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => (Math.abs(x - (W - 1) / 2) + Math.abs(y - (H - 1) / 2) <= 3 ? 2 : 0)),
  (W, H) => sym(W, H, (x, y) => (x === 0 || y === 0 || y === H - 1 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => ((x + y) % 2 === 0 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => (x <= 2 && (y <= 2 || y >= H - 3) ? 2 : 0)),
  (W, H) => sym(W, H, (x, y) => (y < 3 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => (Math.abs(y - (H - 1) / 2) <= 1 ? 2 : 0)),
  (W, H) => sym(W, H, (x, y) => (x % 2 === 0 ? 1 : 0)),
];
const ROCK = [
  (W, H) => sym(W, H, (x, y) => (y === (H >> 1) && x % 2 === 0 ? 2 : 0)),
  (W, H) => sym(W, H, (x, y) => (x <= 1 && y >= H - 2 ? 2 : 0)),
  (W, H) => sym(W, H, (x, y) => (Math.abs(x - (W - 1) / 2) <= 1 && Math.abs(y - (H - 1) / 2) <= 1 ? 3 : 0)),
  (W, H) => sym(W, H, (x, y) => (x === 1 && y >= 2 && y <= H - 3 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => (y === H - 1 && x !== (W >> 1) ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => ((x === 1 || x === 3) && (y === 2 || y === H - 3) ? 2 : 0)),
  (W, H) => sym(W, H, (x, y) => (y >= H - 3 && (x + y) % 2 === 0 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => (x === y - 1 && y >= 2 && y <= 5 ? 2 : 0)),
];
const FROST = [
  (W, H) => sym(W, H, (x, y) => (y >= 2 && y <= H - 3 && (x + y) % 3 === 0 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => (y === (H >> 1) && x % 2 === 0 ? 2 : 0)),
  (W, H) => sym(W, H, (x, y) => (x === 0 && y > 0 && y < H - 1 ? 1 : 0)),
  (W, H) => sym(W, H, (x, y) => (Math.abs(x - (W - 1) / 2) + Math.abs(y - (H - 1) / 2) === 2 ? 2 : 0)),
  (W, H) => sym(W, H, (x, y) => ((y === 2 || y === H - 3) && (x + y) % 2 === 0 ? 1 : 0)),
];

const rate = (colors) => (colors >= 6 ? 2.1 : 3.4); // gemas de un color por jugada que junta el bot

// Qué metas tiene el nivel n: los primeros 20 a mano (una cosa nueva por vez); después al azar,
// con la mecánica más nueva más seguido cerca de su presentación y sin repetir la del nivel anterior
const PLAN = [null, ['color'], ['color'], ['fog'], ['color'], ['fog'], ['rock'], ['color', 'fog'], ['fog'], ['color'], ['rock'],
  ['fog'], ['frost'], ['color'], ['rock', 'color'], ['frost'], ['fog', 'rock'], ['drop'], ['color'], ['frost', 'fog'], ['drop', 'color']];
function primary(n) {
  const o = { rng: hash(`plan:${n}`) };
  const pool = ['color', ...Object.keys(INTRO)];
  const w = pool.map((k) => (k === 'color' ? 1.2 : 1.5 + (n - INTRO[k] < 12 ? 1.5 : 0)));
  let x = rnd(o) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
  return pool[0];
}
export function plan(n) {
  if (n < PLAN.length) return PLAN[n];
  const o = { rng: hash(`plan2:${n}`) }, pool = ['color', ...Object.keys(INTRO)];
  let k0 = primary(n);
  if (k0 === primary(n - 1)) k0 = pool[(pool.indexOf(k0) + 1 + rndInt(o, pool.length - 1)) % pool.length];
  const kinds = [k0];
  if (rnd(o) < 0.45 || tierOf(n) === 2) { const k1 = pool[rndInt(o, pool.length)]; if (k1 !== k0) kinds.push(k1); }
  return kinds;
}

// Nivel n: variante v (forma y capas) y amp (cuánto juntar), que ajusta la calibración
export function levelDef(n, v = 0, amp = 1) {
  const o = { rng: hash(`lucero:${n}:${v}`) };
  const tier = tierOf(n);
  let shape = SHAPES[n <= 6 ? SMALL[rndInt(o, 3)] : n <= 14 ? (rnd(o) < 0.5 ? SMALL[rndInt(o, SMALL.length)] : rndInt(o, 12)) : rndInt(o, SHAPES.length)];
  if (n === 1) shape = SHAPES[16];
  const H = shape.length, W = shape[0].length, N = W * H;
  const mask = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask.push(shape[y][x] === '#' ? 0 : 1);
  const colors = n <= 8 || tier === 3 ? 5 : n <= 20 ? (tier ? 6 : 5) : rnd(o) < 0.85 ? 6 : 5;
  const intro = Object.entries(INTRO).find(([, at]) => at === n)?.[0];
  const kinds = plan(n).slice();
  const fog = new Array(N).fill(0), rock = new Array(N).fill(0), frost = new Array(N).fill(0);
  const put = (dst, src, cap = 3) => { for (let i = 0; i < N; i++) if (mask[i] && src[i]) dst[i] = Math.min(cap, src[i]); };
  const lvl = Math.min(1, n / 60); // capas dobles más seguido con el tiempo
  if (kinds.includes('fog')) { const f = FOG[rndInt(o, n < 10 ? 2 : FOG.length)](W, H); put(fog, f.map((v) => (v === 2 && rnd(o) > 0.3 + lvl ? 1 : v))); }
  if (kinds.includes('rock')) put(rock, ROCK[rndInt(o, ROCK.length)](W, H).map((v) => (n < 10 ? Math.min(v, 1) : v)));
  if (kinds.includes('frost')) put(frost, FROST[rndInt(o, FROST.length)](W, H).map((v) => (n < 16 ? Math.min(v, 1) : v)));
  for (let i = 0; i < N; i++) if (rock[i]) { frost[i] = 0; fog[i] = 0; }
  const goals = [];
  const Mt = (n <= 3 ? 9 : Math.min(26, 12 + n / 6)) * (tier === 3 ? 0.85 : 1);
  if (kinds.includes('drop')) {
    // la salida (fila de abajo de cada columna) no puede quedar tapada
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) { const i = y * W + x; if (mask[i]) { rock[i] = 0; frost[i] = 0; break; } }
    const dn = 2 + Math.min(3, Math.floor(n / 25)) + (tier === 2 ? 1 : 0);
    goals.push({ t: 'drop', n: dn });
  }
  for (const [t, a] of [['fog', fog], ['rock', rock], ['frost', frost]]) {
    const tot = a.reduce((s, v) => s + v, 0);
    if (tot) goals.push({ t, n: tot });
  }
  // amp > 1 y sin meta de color: se suma una para que el nivel no quede demasiado corto
  if (kinds.includes('color') || !goals.length || amp > 1.15) {
    const solo = !kinds.some((k) => k !== 'color');
    const k = !solo ? 1 : 1 + (n > 4 ? rndInt(o, 2) : 0) + (n > 25 && rnd(o) < 0.3 ? 1 : 0);
    const cs = [];
    while (cs.length < k) { const c = rndInt(o, colors); if (!cs.includes(c)) cs.push(c); }
    const share = [0, 0.8, 0.5, 0.36][k] * (solo ? 1 : kinds.includes('color') ? 0.5 : 0.35 * (amp - 1));
    for (const c of cs) goals.push({ t: 'color', c, n: Math.max(6, Math.round((Mt * rate(colors) * share * (solo ? amp : 1)) / 5) * 5) });
  }
  const def = { n, v, amp, W, H, mask, fog, rock, frost, colors, goals, tier, kinds, moves: 99 };
  if (kinds.includes('drop')) def.drops = { n: goals.find((g) => g.t === 'drop').n, start: Math.min(2, 1 + (n > 40 ? 1 : 0)) };
  if (TEACH[n]) def.teach = TEACH[n];
  if (intro) def.intro = intro;
  // celdas que la gravedad no puede rellenar: se saca el bloqueo de arriba (y su espejo)
  for (let h = fillable(def), k = 0; h >= 0 && k < 40; h = fillable(def), k++) {
    let fixed = false;
    for (let j = h - W; j >= 0 && !fixed; j -= W) {
      if (!rock[j] && !frost[j]) continue;
      const m = Math.floor(j / W) * W + (W - 1 - (j % W));
      rock[j] = frost[j] = rock[m] = frost[m] = 0;
      fixed = true;
    }
    if (!fixed) { rock.fill(0); frost.fill(0); }
  }
  for (const g of def.goals) if (g.t === 'rock' || g.t === 'frost') g.n = (g.t === 'rock' ? rock : frost).reduce((s, x) => s + x, 0);
  def.goals = def.goals.filter((g) => g.n > 0);
  if (!def.goals.length) def.goals.push({ t: 'color', c: 0, n: Math.round(Mt * rate(colors) * 0.8) });
  return def;
}

// ¿La gravedad llena todas las celdas con estas rocas y escarchas, también cuando se rompe una roca o
// se derrite una escarcha y su gema se va? Con más bloqueos quitados solo hay más caminos, así que
// alcanza con probar cada uno por separado. Devuelve el primer agujero o −1
export function fillable(def) {
  const holes = (rock, frost) => {
    const B = createBoard({ ...def, rock, frost, goals: [], drops: null }, 7, { quiet: true });
    for (let i = 0; i < B.n; i++) if (B.p[i] && !B.frost[i]) B.p[i] = null;
    B.need = 'fall'; step(B);
    for (let i = 0; i < B.n; i++) if (B.mask[i] && !B.rock[i] && !B.p[i]) return i;
    return -1;
  };
  let h = holes(def.rock, def.frost);
  for (let r = 0; h < 0 && r < def.mask.length; r++) {
    if (!def.rock[r] && !def.frost[r]) continue;
    const rock = def.rock.slice(), frost = def.frost.slice();
    rock[r] = frost[r] = 0;
    h = holes(rock, frost);
  }
  return h;
}

// ── calibración ──
const qt = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
const nice = (v) => (v < 5000 ? Math.round(v / 250) * 250 : Math.round(v / 500) * 500);
const CAP = 70;

// Una corrida del bot sin límite de movimientos: cuántos necesitó y el tablero al terminar
export function botRun(def, seed) {
  const B = createBoard({ ...def, moves: CAP }, seed, { quiet: true });
  const o = { rng: seed * 7 + 1 };
  while (B.used < CAP && !goalsDone(B)) {
    const m = bestMove(B, o);
    if (!m) break;
    if (m.b < 0) tapSpecial(B, m.a); else trySwap(B, m.a, m.b);
    while (B.need) step(B);
  }
  return { need: goalsDone(B) ? B.used : 99, B };
}

// Movimientos y umbrales de 2★/3★ a partir de las corridas
export function fromRuns(def, runs) {
  const q = quantileFor(def.n, def.tier);
  const moves = Math.max(8, Math.min(60, qt(runs.map((r) => r.need), q)));
  const scores = [];
  for (const r of runs) {
    if (r.need > moves) continue;
    const C = cloneBoard(r.B, { quiet: true });
    C.moves = moves; runBonus(C);
    scores.push(C.score);
  }
  if (!scores.length) scores.push(1000);
  const s2 = nice(qt(scores, 0.3)), s3 = Math.max(s2 + 500, nice(qt(scores, 0.75)));
  return { moves, s2, s3, med: qt(runs.map((r) => r.need), 0.5) };
}

export const RUNS = 20;
const TARGET = (n) => (n <= 3 ? 9 : Math.min(24, 13 + n / 8));
// Calibra el nivel n: prueba variantes y ajusta amp hasta que el bot tarde un largo razonable
export function calibrate(n, runs = RUNS) {
  let best = null, amp = 1;
  for (let v = 0; v < 8; v++) {
    const def = levelDef(n, v, amp), rs = [];
    for (let s = 1; s <= runs; s++) rs.push(botRun(def, hash(`cal:${n}:${v}:${s}`)));
    const c = fromRuns(def, rs), tg = TARGET(n);
    const err = Math.abs(Math.log(c.med / tg)) + (rs.filter((r) => r.need < 99).length < runs * 0.85 ? 9 : 0);
    if (!best || err < best.err) best = { v, amp, err, ...c };
    if (err < 0.22) break;
    amp = Math.round(Math.max(0.5, Math.min(3, amp * (tg / c.med) ** 0.8)) * 20) / 20;
  }
  return [best.v, best.amp, best.moves, best.s2, best.s3];
}

// Nivel listo para jugar: definición + movimientos + umbrales (cal = [v, amp, moves, s2, s3])
export function makeLevel(n, cal) {
  const def = levelDef(n, cal[0], cal[1]);
  def.moves = cal[2]; def.stars = [0, cal[3], cal[4]];
  return def;
}

// Para los niveles que enseñan: una semilla cuyo primer tablero tenga a mano la jugada a enseñar
export function teachSeed(def) {
  for (let k = 0; k < 400; k++) {
    const seed = hash(`teach:${def.n}:${k}`);
    const B = createBoard(def, seed, { quiet: true });
    if (def.teach === 'match' || def.teach === 'combo') return { seed, move: def.teach === 'match' ? listMoves(B)[0] : null };
    for (const m of listMoves(B)) {
      if (m.b < 0) continue;
      const C = cloneBoard(B, { quiet: true, inert: true });
      trySwap(C, m.a, m.b); step(C);
      if (C.stats.made[def.teach] > 0) return { seed, move: m };
    }
  }
  return null;
}
