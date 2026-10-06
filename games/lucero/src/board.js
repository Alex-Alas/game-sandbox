// LUCERO — motor de match-3, puro (sin DOM): corre en el navegador y en Node (tools/simrun.mjs).
//
// El tablero avanza por fases para que el render las anime una por una:
//   trySwap / tapSpecial / boosters → B.need = 'clear'
//   step(B): 'clear' (combinaciones + explosiones en cadena) → 'fall' (gravedad y relleno) → 'clear'…
//   hasta que no queda nada (B.need = null). Cada fase devuelve sus eventos (B.ev) con un tiempo `t`
//   relativo al comienzo de la fase: el render escalona estallidos, rayos y vuelos con eso.
// Celdas: índice i = y·W + x (y = 0 arriba). Capas por celda: mask (celda jugable), fog (niebla bajo la
// gema, 0–2), frost (escarcha sobre la gema: no se mueve ni cae, 0–2), rock (roca lunar en lugar de
// gema, 0–3; frena la caída). Pieza = { id, c (color 0–5; −1 sin color; −2 inerte), s (S.*) }.
import { S, PTS, T, isComet, isPower, rnd, rndInt } from './const.js';

const emit = (B, e) => { if (B.ev) B.ev.push(e); };

export function createBoard(def, seed, opts = {}) {
  const { W, H } = def, n = W * H;
  const z = () => new Uint8Array(n);
  const B = {
    W, H, n,
    mask: Uint8Array.from(def.mask), fog: def.fog ? Uint8Array.from(def.fog) : z(),
    frost: def.frost ? Uint8Array.from(def.frost) : z(), rock: def.rock ? Uint8Array.from(def.rock) : z(),
    p: new Array(n).fill(null), colors: def.colors, rng: seed >>> 0, nid: 1,
    goals: def.goals.map((g) => ({ ...g, got: 0 })),
    moves: def.moves, used: 0, score: 0, chain: 0, need: null, act: [], prefer: [], moved: z(),
    drops: { left: 0, queue: 0 }, exit: new Int16Array(W).fill(-1),
    ev: opts.quiet ? null : [], inert: !!opts.inert, shuffles: 0,
    stats: { made: [0, 0, 0, 0, 0, 0], combos: 0, maxChain: 0, gems: [0, 0, 0, 0, 0, 0], fog: 0, rock: 0, frost: 0, drops: 0, boosters: 0, gemsTotal: 0 },
  };
  // salida de las estrellas fugaces: la celda jugable más baja de cada columna
  for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (B.mask[y * W + x]) { B.exit[x] = y * W + x; break; }
  fill(B, def.preset);
  const dg = def.drops;
  if (dg) {
    B.drops.left = dg.n - placeDrops(B, Math.min(dg.n, dg.start || 1));
  }
  if (!hasMove(B)) shuffle(B);
  B.ev = opts.quiet ? null : [];
  return B;
}

const mk = (B, c, s = S.NONE) => ({ id: B.nid++, c, s });
export const colorAt = (B, i) => { const q = B.p[i]; return q && q.s !== S.STAR && q.s !== S.DROP ? q.c : -1; };
export const playable = (B, i) => B.mask[i] && !B.rock[i];
const X = (B, i) => i % B.W, Y = (B, i) => (i / B.W) | 0;

// ── combinaciones ──
// ¿La gema en i forma una línea de 3 o un cuadrado 2×2?
export function matchAt(B, i) {
  const c = colorAt(B, i);
  if (c < 0) return false;
  const { W, H } = B, x = X(B, i), y = Y(B, i);
  let a = x, b = x;
  while (a > 0 && colorAt(B, i - (x - a) - 1) === c) a--;
  while (b < W - 1 && colorAt(B, i + (b - x) + 1) === c) b++;
  if (b - a >= 2) return true;
  a = y; b = y;
  while (a > 0 && colorAt(B, i - (y - a + 1) * W) === c) a--;
  while (b < H - 1 && colorAt(B, i + (b - y + 1) * W) === c) b++;
  if (b - a >= 2) return true;
  for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const sx = x + dx, sy = y + dy;
    if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) continue;
    const j = sy * W + sx;
    if (colorAt(B, j) === c && colorAt(B, j + 1) === c && colorAt(B, j + W) === c && colorAt(B, j + W + 1) === c) return true;
  }
  return false;
}

// Todas las combinaciones del tablero, agrupadas: cada grupo conectado del mismo color decide su especial
export function findMatches(B) {
  const { W, H, n } = B, mark = new Uint8Array(n), runs = [], squares = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W;) {
      const c = colorAt(B, y * W + x);
      let e = x + 1;
      if (c >= 0) while (e < W && colorAt(B, y * W + e) === c) e++;
      if (c >= 0 && e - x >= 3) { const cells = []; for (let k = x; k < e; k++) { cells.push(y * W + k); mark[y * W + k] = 1; } runs.push({ o: 'h', cells }); }
      x = e;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H;) {
      const c = colorAt(B, y * W + x);
      let e = y + 1;
      if (c >= 0) while (e < H && colorAt(B, e * W + x) === c) e++;
      if (c >= 0 && e - y >= 3) { const cells = []; for (let k = y; k < e; k++) { cells.push(k * W + x); mark[k * W + x] = 1; } runs.push({ o: 'v', cells }); }
      y = e;
    }
  }
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = y * W + x, c = colorAt(B, i);
    if (c >= 0 && colorAt(B, i + 1) === c && colorAt(B, i + W) === c && colorAt(B, i + W + 1) === c) {
      const cells = [i, i + 1, i + W, i + W + 1];
      squares.push(cells); for (const j of cells) mark[j] = 1;
    }
  }
  const comp = new Int16Array(n).fill(-1), groups = [];
  for (let i = 0; i < n; i++) {
    if (!mark[i] || comp[i] >= 0) continue;
    const c = colorAt(B, i), g = { c, cells: [], h: 0, v: 0, sq: false, runH: null, runV: null };
    const st = [i]; comp[i] = groups.length;
    while (st.length) {
      const j = st.pop(); g.cells.push(j);
      const x = j % W;
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W]) {
        if (k >= 0 && k < n && mark[k] && comp[k] < 0 && colorAt(B, k) === c) { comp[k] = groups.length; st.push(k); }
      }
    }
    groups.push(g);
  }
  for (const r of runs) {
    const g = groups[comp[r.cells[0]]];
    if (r.o === 'h' && r.cells.length > g.h) { g.h = r.cells.length; g.runH = r.cells; }
    if (r.o === 'v' && r.cells.length > g.v) { g.v = r.cells.length; g.runV = r.cells; }
  }
  for (const sq of squares) groups[comp[sq[0]]].sq = true;
  return groups;
}

// Qué especial nace de un grupo: 5 en línea → LUCERO; L/T/+ → NOVA; 4 → COMETA (dispara a lo largo
// de la línea que hiciste); cuadrado 2×2 → LUCIÉRNAGA
function specialFor(g) {
  if (g.h >= 5 || g.v >= 5) return S.STAR;
  if (g.h >= 3 && g.v >= 3) return S.NOVA;
  if (g.h === 4) return S.H;
  if (g.v === 4) return S.V;
  if (g.sq) return S.FLY;
  return S.NONE;
}

// Dónde nace el especial: en la gema que moviste; si es una cascada, en la última que cayó
function pickSpot(B, g, kind) {
  const line = kind === S.H ? g.runH : kind === S.V ? g.runV : kind === S.STAR ? (g.h >= 5 ? g.runH : g.runV) : null;
  const ok = (line || g.cells).filter((i) => !B.frost[i] && B.p[i] && B.p[i].s === S.NONE);
  if (!ok.length) return -1;
  for (const i of B.prefer) if (ok.includes(i)) return i;
  let best = -1;
  for (const i of ok) if (B.moved[i] && i > best) best = i;
  if (best >= 0) return best;
  if (kind === S.NOVA && g.runH && g.runV) { const x = g.runH.find((i) => g.runV.includes(i)); if (x !== undefined && ok.includes(x)) return x; }
  return ok[ok.length >> 1];
}

// ── metas y puntos ──
function goal(B, t, c, i, tm) {
  for (let k = 0; k < B.goals.length; k++) {
    const g = B.goals[k];
    if (g.t === t && (t !== 'color' || g.c === c) && g.got < g.n) { g.got++; emit(B, { k: 'goal', g: k, i, t: tm, c }); return; }
  }
}
export const goalsDone = (B) => B.goals.every((g) => g.got >= g.n);
const goalOpen = (B, t, c) => B.goals.some((g) => g.t === t && (t !== 'color' || g.c === c) && g.got < g.n);
const addScore = (B, pts, i, t) => { const v = pts * Math.max(1, B.chain); B.score += v; return v; };

// ── fase de limpieza ──
function damageRock(B, ctx, i, t) {
  if (ctx.rockHit[i] || !B.rock[i]) return;
  ctx.rockHit[i] = 1;
  B.rock[i]--; B.stats.rock++;
  addScore(B, PTS.rock);
  goal(B, 'rock', -1, i, t);
  emit(B, { k: 'rock', i, left: B.rock[i], t });
}

// Golpe sobre una celda (combinación o explosión). Cada celda recibe a lo sumo un golpe por fase.
function hitCell(B, ctx, i, t, to = -1) {
  if (i < 0 || i >= B.n || !B.mask[i] || ctx.hit[i] || ctx.protect[i]) return;
  if (B.rock[i]) { ctx.hit[i] = 1; damageRock(B, ctx, i, t); return; }
  const q = B.p[i];
  if (!q || q.s === S.DROP) return;
  ctx.hit[i] = 1;
  if (B.frost[i]) {
    B.frost[i]--; B.stats.frost++;
    addScore(B, PTS.frost); goal(B, 'frost', -1, i, t);
    emit(B, { k: 'frost', i, left: B.frost[i], t });
    return;
  }
  B.p[i] = null;
  consume(B, q, i, t, to);
  if (isPower(q.s)) ctx.queue.push({ i, s: q.s, c: q.c, t: t + (to < 0 ? T.chain : 0), id: q.id });
}

// La gema se va: cuenta para las metas, disipa la niebla de abajo y suma puntos
function consume(B, q, i, t, to = -1) {
  if (q.c >= 0) { B.stats.gems[q.c]++; B.stats.gemsTotal++; goal(B, 'color', q.c, i, t); }
  const pts = addScore(B, PTS.gem);
  emit(B, { k: 'pop', i, id: q.id, c: q.c, s: q.s, t, to, pts });
  if (B.fog[i]) {
    B.fog[i]--; B.stats.fog++;
    addScore(B, PTS.fog); goal(B, 'fog', -1, i, t);
    emit(B, { k: 'fog', i, left: B.fog[i], t });
  }
}

const inBoard = (B, x, y) => x >= 0 && y >= 0 && x < B.W && y < B.H;

// Celdas que barre cada efecto, con su retardo
function area(B, kind, i) {
  const { W, H } = B, x0 = X(B, i), y0 = Y(B, i), out = [];
  const add = (x, y, d) => { if (inBoard(B, x, y)) out.push([y * W + x, d]); };
  const row = (y) => { for (let x = 0; x < W; x++) add(x, y, Math.abs(x - x0) * T.beam); };
  const col = (x) => { for (let y = 0; y < H; y++) add(x, y, Math.abs(y - y0) * T.beam); };
  if (kind === 'h') row(y0);
  else if (kind === 'v') col(x0);
  else if (kind === 'cross') { row(y0); col(x0); }
  else if (kind === 'big') { for (let d = -1; d <= 1; d++) { row(y0 + d); col(x0 + d); } }
  else if (kind === 'nova' || kind === 'nova2') {
    const r = kind === 'nova' ? 2 : 3.3;
    for (let y = Math.floor(y0 - r); y <= y0 + r; y++) for (let x = Math.floor(x0 - r); x <= x0 + r; x++) {
      const d = kind === 'nova' ? Math.abs(x - x0) + Math.abs(y - y0) : Math.hypot(x - x0, y - y0);
      if (d <= r) add(x, y, d * T.nova);
    }
  } else if (kind === 'plus') { add(x0, y0, 0); add(x0 - 1, y0, 0.03); add(x0 + 1, y0, 0.03); add(x0, y0 - 1, 0.03); add(x0, y0 + 1, 0.03); }
  else if (kind === 'all') { for (let k = 0; k < B.n; k++) add(k % W, (k / W) | 0, Math.hypot(k % W - x0, ((k / W) | 0) - y0) * 0.045); }
  return out;
}

function mostCommonColor(B) {
  const cnt = new Array(6).fill(0);
  for (let i = 0; i < B.n; i++) { const c = colorAt(B, i); if (c >= 0 && !B.frost[i]) cnt[c]++; }
  let best = -1, bv = 0;
  for (let c = 0; c < 6; c++) if (cnt[c] > bv || (cnt[c] === bv && bv > 0 && rnd(B) < 0.5)) { bv = cnt[c]; best = c; }
  return best;
}

// Adónde vuela la luciérnaga: a lo que más ayuda con las metas que faltan
function pickTarget(B, ctx, from) {
  let best = -1, bv = -1;
  const rockG = goalOpen(B, 'rock'), fogG = goalOpen(B, 'fog'), frostG = goalOpen(B, 'frost'), dropG = goalOpen(B, 'drop');
  for (let i = 0; i < B.n; i++) {
    if (!B.mask[i] || ctx.hit[i] || ctx.protect[i] || ctx.aim[i] || i === from) continue;
    let v = 0;
    if (B.rock[i]) v = (rockG ? 10 : 3) + B.rock[i];
    else {
      const q = B.p[i];
      if (!q || q.s === S.DROP) continue;
      v = 1;
      if (B.frost[i]) v = frostG ? 9 + B.frost[i] : 2;
      if (B.fog[i] && fogG) v = Math.max(v, 8 + B.fog[i]);
      if (q.c >= 0 && goalOpen(B, 'color', q.c)) v = Math.max(v, 5);
      if (dropG) for (let j = i - B.W; j >= 0; j -= B.W) { if (!B.mask[j]) continue; if (B.p[j]?.s === S.DROP) v = Math.max(v, 7); break; }
    }
    v += rnd(B) * 0.9;
    if (v > bv) { bv = v; best = i; }
  }
  if (best >= 0) ctx.aim[best] = 1;
  return best;
}

// Dispara un especial (o una combinación de dos). a = { i, s, c, t, combo?, color? }
function activate(B, ctx, a) {
  const t = a.t;
  const sweep = (kind, i, t0 = t) => { for (const [j, d] of area(B, kind, i)) hitCell(B, ctx, j, t0 + d); };
  const kind = a.combo || a.s;
  if (kind === S.H || kind === S.V) {
    emit(B, { k: 'beam', i: a.i, dir: kind === S.H ? 'h' : 'v', c: a.c, t });
    sweep(kind === S.H ? 'h' : 'v', a.i);
  } else if (kind === S.NOVA) {
    emit(B, { k: 'nova', i: a.i, r: 2, c: a.c, t });
    sweep('nova', a.i);
  } else if (kind === S.FLY || kind === 'fly3' || kind === 'flyCarry') {
    emit(B, { k: 'flap', i: a.i, c: a.c, t });
    sweep('plus', a.i);
    const n = kind === 'fly3' ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const to = pickTarget(B, ctx, a.i);
      if (to < 0) break;
      const ta = t + T.flyTo + k * 0.08;
      emit(B, { k: 'fly', i: a.i, to, c: a.c, t: t + k * 0.08, ta, carry: kind === 'flyCarry' ? a.carry : 0 });
      if (kind === 'flyCarry') ctx.queue.push({ i: to, s: a.carry, c: a.c, t: ta, landed: true });
      else ctx.later.push({ i: to, t: ta });
    }
  } else if (kind === S.STAR) {
    const c = a.color >= 0 ? a.color : mostCommonColor(B);
    const cells = [];
    if (c >= 0) for (let i = 0; i < B.n; i++) if (colorAt(B, i) === c && !ctx.hit[i]) cells.push(i);
    shuffleArr(B, cells);
    emit(B, { k: 'rays', i: a.i, cells, c, t });
    cells.forEach((j, k) => hitCell(B, ctx, j, t + 0.12 + k * T.ray));
  } else if (kind === 'cross') { emit(B, { k: 'beam', i: a.i, dir: 'h', c: a.c, t }); emit(B, { k: 'beam', i: a.i, dir: 'v', c: a.c, t }); sweep('cross', a.i); }
  else if (kind === 'big') {
    for (let d = -1; d <= 1; d++) {
      const x = X(B, a.i) + d, y = Y(B, a.i) + d;
      if (inBoard(B, X(B, a.i), y)) emit(B, { k: 'beam', i: y * B.W + X(B, a.i), dir: 'h', c: a.c, t, w: 1.4 });
      if (inBoard(B, x, Y(B, a.i))) emit(B, { k: 'beam', i: Y(B, a.i) * B.W + x, dir: 'v', c: a.c, t, w: 1.4 });
    }
    sweep('big', a.i);
  } else if (kind === 'nova2') { emit(B, { k: 'nova', i: a.i, r: 3.3, c: a.c, t }); sweep('nova2', a.i); }
  else if (kind === 'starSpecial') {
    // todas las gemas del color se vuelven ese especial y explotan una tras otra
    const cells = [];
    for (let i = 0; i < B.n; i++) if (colorAt(B, i) === a.color && !B.frost[i] && !ctx.hit[i] && B.p[i].s === S.NONE) cells.push(i);
    shuffleArr(B, cells);
    emit(B, { k: 'rays', i: a.i, cells, c: a.color, t });
    cells.forEach((j, k) => {
      const q = B.p[j], tm = t + 0.12 + k * T.ray;
      q.s = a.into === S.H || a.into === S.V ? (rnd(B) < 0.5 ? S.H : S.V) : a.into;
      emit(B, { k: 'morph', i: j, id: q.id, s: q.s, t: tm });
      ctx.later.push({ i: j, t: tm + 0.35 + k * 0.05 });
    });
  } else if (kind === 'starStar') { emit(B, { k: 'supernova', i: a.i, t }); sweep('all', a.i); }
}

function shuffleArr(B, a) { for (let i = a.length - 1; i > 0; i--) { const j = rndInt(B, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Combinación de dos especiales intercambiados (pa llega a `at`)
function comboOf(pa, pb) {
  const s = [pa.s, pb.s].sort((a, b) => a - b), [a, b] = s;
  if (a === S.STAR && b === S.STAR) return { combo: 'starStar' };
  if (b === S.STAR) { const o = pa.s === S.STAR ? pb : pa; return { combo: 'starSpecial', color: o.c, into: o.s }; }
  if (isComet(a) && isComet(b)) return { combo: 'cross' };
  if (isComet(a) && b === S.NOVA) return { combo: 'big' };
  if (a === S.NOVA && b === S.NOVA) return { combo: 'nova2' };
  if (a === S.FLY && b === S.FLY) return { combo: 'fly3' };
  // luciérnaga + cometa/nova: vuela con el otro especial y lo suelta en el blanco
  const other = a === S.FLY ? b : a;
  return { combo: 'flyCarry', carry: other };
}

function clearPhase(B) {
  const groups = findMatches(B);
  if (!groups.length && !B.act.length) return false;
  B.chain++;
  B.stats.maxChain = Math.max(B.stats.maxChain, B.chain);
  const n = B.n;
  const ctx = { hit: new Uint8Array(n), protect: new Uint8Array(n), rockHit: new Uint8Array(n), aim: new Uint8Array(n), queue: [], later: [] };
  const makes = [];
  for (const g of groups) {
    const kind = specialFor(g);
    if (!kind) continue;
    const spot = pickSpot(B, g, kind);
    if (spot < 0) continue;
    makes.push({ g, spot, kind });
  }
  // las gemas del grupo se juntan en el lugar del especial; las demás estallan
  for (const g of groups) {
    const m = makes.find((x) => x.g === g);
    for (const i of g.cells) {
      if (m && i === m.spot) continue;
      hitCell(B, ctx, i, 0, m ? m.spot : -1);
    }
    for (const i of g.cells) {
      const x = i % B.W;
      for (const j of [x > 0 ? i - 1 : -1, x < B.W - 1 ? i + 1 : -1, i - B.W, i + B.W]) if (j >= 0 && j < n && B.rock[j]) damageRock(B, ctx, j, 0);
    }
  }
  for (const m of makes) {
    const old = B.p[m.spot];
    ctx.hit[m.spot] = 1; ctx.protect[m.spot] = 1;
    consume(B, old, m.spot, 0, m.spot);
    const q = mk(B, m.kind === S.STAR ? -1 : m.g.c, m.kind);
    B.p[m.spot] = q;
    B.stats.made[m.kind === S.V ? S.H : m.kind]++;
    const pts = addScore(B, PTS.make[m.kind]);
    emit(B, { k: 'make', i: m.spot, id: q.id, c: q.c, s: q.s, t: 0.1, pts });
  }
  // lo que dejó pendiente la jugada (especial movido o tocado, combos, boosters, la lluvia final)
  for (const a of B.act) {
    if (a.hit !== undefined) { hitCell(B, ctx, a.hit, a.t || 0); continue; }
    // piezas que la jugada ya consumió (los dos especiales de un combo, el lucero movido)
    for (const [q, i] of a.pieces || []) { ctx.hit[i] = 1; consume(B, q, i, 0, a.i); }
    if (a.combo) { B.stats.combos++; emit(B, { k: 'combo', i: a.i, combo: a.combo, t: 0 }); }
    ctx.queue.push({ ...a, t: a.combo ? 0.12 : a.t || 0 });
  }
  B.act = [];
  // explosiones en cadena en orden de tiempo; los vuelos y conversiones golpean después
  let tMax = 0.1;
  for (let guard = 0; (ctx.queue.length || ctx.later.length) && guard < 5000; guard++) {
    let src = ctx.queue, k = -1;
    for (let j = 0; j < ctx.queue.length; j++) if (k < 0 || ctx.queue[j].t < ctx.queue[k].t) k = j;
    let kl = -1;
    for (let j = 0; j < ctx.later.length; j++) if (kl < 0 || ctx.later[j].t < ctx.later[kl].t) kl = j;
    if (k < 0 || (kl >= 0 && ctx.later[kl].t < ctx.queue[k].t)) { src = ctx.later; k = kl; }
    const a = src.splice(k, 1)[0];
    tMax = Math.max(tMax, a.t);
    if (src === ctx.later) { hitCell(B, ctx, a.i, a.t); continue; }
    // el especial que trajo la luciérnaga cae sobre lo que haya en el blanco
    if (a.landed) hitCell(B, ctx, a.i, a.t);
    activate(B, ctx, a);
  }
  B.prefer = [];
  emit(B, { k: 'chain', n: B.chain, t: 0 });
  B.lastDur = tMax;
  return true;
}

// ── gravedad y relleno ──
function spawnPiece(B) {
  if (B.drops.queue > 0) { B.drops.queue--; return mk(B, -1, S.DROP); }
  if (B.inert) return mk(B, -2);
  return mk(B, rndInt(B, B.colors));
}

function fallPhase(B) {
  const { W, H } = B, moves = [], spawns = [];
  B.moved.fill(0);
  const blocked = (j) => B.rock[j] || B.frost[j];
  for (let guard = 0; guard < 400; guard++) {
    // 1) caída vertical (atraviesa huecos del tablero; la frenan rocas y gemas congeladas)
    for (let x = 0; x < W; x++) {
      for (let y = H - 1; y >= 0; y--) {
        const i = y * W + x;
        if (!B.mask[i] || B.rock[i] || B.p[i]) continue;
        for (let yy = y - 1; yy >= 0; yy--) {
          const j = yy * W + x;
          if (!B.mask[j]) continue;
          if (blocked(j)) break;
          if (!B.p[j]) continue;
          B.p[i] = B.p[j]; B.p[j] = null; B.moved[i] = 1;
          moves.push({ id: B.p[i].id, from: j, to: i });
          break;
        }
      }
    }
    // 2) relleno desde arriba en las celdas que ven el cielo
    for (let x = 0; x < W; x++) {
      const empty = [];
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (!B.mask[i]) continue;
        if (B.rock[i] || B.p[i]) break;
        empty.push(i);
      }
      for (let k = empty.length - 1; k >= 0; k--) {
        const i = empty[k], q = spawnPiece(B);
        B.p[i] = q; B.moved[i] = 1;
        spawns.push({ id: q.id, to: i, c: q.c, s: q.s, y0: Y(B, i) - empty.length });
      }
    }
    // 3) en diagonal hacia las celdas tapadas (una por vuelta, la más baja)
    let did = false;
    for (let y = H - 1; y > 0 && !did; y--) {
      for (let x = 0; x < W && !did; x++) {
        const i = y * W + x;
        if (!B.mask[i] || B.rock[i] || B.p[i]) continue;
        const order = (x + y + B.used) & 1 ? [-1, 1] : [1, -1];
        for (const d of order) {
          const sx = x + d;
          if (sx < 0 || sx >= W) continue;
          const j = (y - 1) * W + sx;
          if (!B.mask[j] || blocked(j) || !B.p[j]) continue;
          B.p[i] = B.p[j]; B.p[j] = null; B.moved[i] = 1;
          moves.push({ id: B.p[i].id, from: j, to: i, diag: true });
          did = true; break;
        }
      }
    }
    if (!did) break;
  }
  emit(B, { k: 'fall', moves, spawns, t: 0 });
  // estrellas fugaces que llegaron al fondo
  let got = 0;
  for (let x = 0; x < W; x++) {
    const e = B.exit[x];
    if (e >= 0 && B.p[e] && B.p[e].s === S.DROP) {
      const q = B.p[e]; B.p[e] = null; got++;
      B.stats.drops++; addScore(B, PTS.drop);
      goal(B, 'drop', -1, e, 0.05);
      emit(B, { k: 'dropout', i: e, id: q.id, t: 0.05 });
      if (B.drops.left > 0) { B.drops.left--; B.drops.queue++; }
    }
  }
  B.need = got ? 'fall' : 'clear';
}

// Un paso de la resolución; devuelve sus eventos, o null si el tablero quedó quieto
export function step(B) {
  if (!B.need) return null;
  if (B.ev) B.ev = [];
  if (B.need === 'clear') {
    if (clearPhase(B)) B.need = 'fall';
    else {
      B.need = null;
      if (!hasMove(B)) shuffle(B);
      return B.ev && B.ev.length ? B.ev : null;
    }
  } else fallPhase(B);
  return B.ev || [];
}
export function settle(B) { while (B.need) step(B); }

// ── jugadas ──
const adj = (B, a, b) => (Math.abs(a - b) === 1 && Y(B, a) === Y(B, b)) || Math.abs(a - b) === B.W;
export const movable = (B, i) => i >= 0 && i < B.n && B.mask[i] && !B.rock[i] && !B.frost[i] && !!B.p[i];
export function canSwap(B, a, b) { return adj(B, a, b) && movable(B, a) && movable(B, b); }
function swapMatches(B, a, b) {
  const t = B.p[a]; B.p[a] = B.p[b]; B.p[b] = t;
  const r = matchAt(B, a) || matchAt(B, b);
  B.p[b] = B.p[a]; B.p[a] = t;
  return r;
}
export function swapValid(B, a, b) {
  if (!canSwap(B, a, b)) return false;
  return isPower(B.p[a].s) || isPower(B.p[b].s) || swapMatches(B, a, b);
}

// Arrastrar la pieza de `a` hacia `b`. Devuelve false si no es válida (el render la hace rebotar)
export function trySwap(B, a, b) {
  if (B.need || !canSwap(B, a, b)) return false;
  if (B.ev) B.ev = [];
  const pa = B.p[a], pb = B.p[b], wa = isPower(pa.s), wb = isPower(pb.s);
  if (!wa && !wb && !swapMatches(B, a, b)) return false;
  B.p[a] = pb; B.p[b] = pa;
  B.used++; B.chain = 0; B.prefer = [b, a];
  emit(B, { k: 'swap', a, b, ia: pa.id, ib: pb.id, t: 0 });
  if (wa && wb) {
    B.p[a] = B.p[b] = null;
    B.act = [{ ...comboOf(pa, pb), i: b, c: pa.c >= 0 ? pa.c : pb.c, pieces: [[pa, b], [pb, a]] }];
  } else if (pa.s === S.STAR || pb.s === S.STAR) {
    const st = pa.s === S.STAR ? pa : pb, other = st === pa ? pb : pa, at = st === pa ? b : a;
    B.p[at] = null;
    B.act = [{ s: S.STAR, i: at, color: other.c, c: -1, pieces: [[st, at]] }];
  } else if (wa) B.act = [{ hit: b }];
  else if (wb) B.act = [{ hit: a }];
  B.need = 'clear';
  return true;
}

// Tocar un especial lo dispara donde está (cuesta un movimiento)
export function tapSpecial(B, i) {
  if (B.need || !movable(B, i) || !isPower(B.p[i].s)) return false;
  if (B.ev) B.ev = [];
  B.used++; B.chain = 0; B.prefer = [];
  B.act = [{ hit: i }]; B.need = 'clear';
  return true;
}

// ── potenciadores (no gastan movimientos) ──
export function useHammer(B, i) {
  if (B.need || !B.mask[i] || (!B.rock[i] && !B.p[i]) || B.p[i]?.s === S.DROP) return false;
  if (B.ev) B.ev = [];
  B.chain = 0; B.act = [{ hit: i }]; B.need = 'clear'; B.stats.boosters++;
  return true;
}
export function useRow(B, i) {
  if (B.need || !B.mask[i]) return false;
  if (B.ev) B.ev = [];
  B.chain = 0; B.act = [{ s: S.H, i, c: -1, t: 0 }]; B.need = 'clear'; B.stats.boosters++;
  return true;
}
export function useShuffle(B) {
  if (B.need) return false;
  if (B.ev) B.ev = [];
  shuffle(B, true); B.stats.boosters++;
  B.need = 'clear';
  return true;
}
// Potenciador previo: convierte gemas al azar en especiales antes de la primera jugada
export function placeSpecial(B, s) {
  const c = [];
  for (let i = 0; i < B.n; i++) { const q = B.p[i]; if (q && q.s === S.NONE && q.c >= 0 && !B.frost[i]) c.push(i); }
  if (!c.length) return -1;
  const i = c[rndInt(B, c.length)], q = B.p[i];
  q.s = s === S.H ? (rnd(B) < 0.5 ? S.H : S.V) : s;
  if (s === S.STAR) q.c = -1;
  emit(B, { k: 'morph', i, id: q.id, s: q.s, c: q.c, t: 0 });
  return i;
}

// Pone un especial en una celda concreta (niveles que enseñan combinaciones)
export function setSpecial(B, i, s) {
  const q = B.p[i];
  if (!q || B.frost[i]) return false;
  q.s = s; if (s === S.STAR) q.c = -1;
  emit(B, { k: 'morph', i, id: q.id, s: q.s, c: q.c, t: 0 });
  return true;
}

// ── lluvia final: cada movimiento que sobra se vuelve una cometa ──
export function bonusConvert(B) {
  if (B.used >= B.moves) return -1;
  const i = placeSpecial(B, S.H);
  if (i < 0) return -1;
  B.used++; B.score += PTS.bonus;
  return i;
}
export function fireAll(B) {
  if (B.need) return 0;
  const acts = [];
  for (let i = 0; i < B.n; i++) { const q = B.p[i]; if (q && isPower(q.s) && !B.frost[i]) acts.push(i); }
  shuffleArr(B, acts);
  B.act = acts.map((i, k) => ({ hit: i, t: k * 0.09 }));
  if (acts.length) { B.need = 'clear'; B.chain = 0; }
  return acts.length;
}
// La lluvia completa sin animación (simulación y pruebas)
export function runBonus(B) {
  while (bonusConvert(B) >= 0) { /* */ }
  for (let k = 0; k < 20 && fireAll(B); k++) settle(B);
}

// ── relleno inicial, mezclas, jugadas posibles ──
function fill(B, preset) {
  const order = [];
  for (let i = 0; i < B.n; i++) if (playable(B, i)) order.push(i);
  if (preset) {
    for (let i = 0; i < B.n; i++) {
      const ch = preset[(i / B.W) | 0]?.[i % B.W];
      if (!ch || ch === '.' || !playable(B, i)) continue;
      if (ch >= '0' && ch <= '5') B.p[i] = mk(B, +ch);
      else if (ch === 'D') B.p[i] = mk(B, -1, S.DROP);
      else if ('HVNFS'.includes(ch)) B.p[i] = mk(B, ch === 'S' ? -1 : rndInt(B, B.colors), { H: S.H, V: S.V, N: S.NOVA, F: S.FLY, S: S.STAR }[ch]);
    }
  }
  for (const i of order) {
    if (B.p[i]) continue;
    const cs = shuffleArr(B, Array.from({ length: B.colors }, (_, k) => k));
    let ok = false;
    for (const c of cs) { B.p[i] = mk(B, c); if (!matchAt(B, i)) { ok = true; break; } B.nid--; }
    if (!ok) B.p[i] = mk(B, cs[0]);
  }
}

function placeDrops(B, k) {
  let placed = 0;
  const xs = shuffleArr(B, Array.from({ length: B.W }, (_, x) => x));
  for (const x of xs) {
    if (placed >= k) break;
    for (let y = 0; y < B.H; y++) {
      const i = y * B.W + x;
      if (!B.mask[i]) continue;
      if (B.rock[i] || B.frost[i] || i === B.exit[x]) break;
      if (B.p[i]?.s === S.NONE) { B.p[i] = mk(B, -1, S.DROP); placed++; }
      break;
    }
  }
  return placed;
}

export function hasMove(B) {
  for (let i = 0; i < B.n; i++) if (movable(B, i) && isPower(B.p[i].s)) return true;
  for (let i = 0; i < B.n; i++) {
    if (!movable(B, i)) continue;
    if (i % B.W < B.W - 1 && movable(B, i + 1) && swapMatches(B, i, i + 1)) return true;
    if (i + B.W < B.n && movable(B, i + B.W) && swapMatches(B, i, i + B.W)) return true;
  }
  return false;
}

// Todas las jugadas válidas: { a, b } (b = −1: tocar el especial en a)
export function listMoves(B) {
  const out = [];
  for (let i = 0; i < B.n; i++) {
    if (!movable(B, i)) continue;
    const pw = isPower(B.p[i].s);
    if (pw) out.push({ a: i, b: -1 });
    for (const j of [i % B.W < B.W - 1 ? i + 1 : -1, i + B.W < B.n ? i + B.W : -1]) {
      if (j < 0 || !movable(B, j)) continue;
      if (pw || isPower(B.p[j].s) || swapMatches(B, i, j)) {
        out.push({ a: i, b: j });
        if (pw && isPower(B.p[j].s)) out.push({ a: j, b: i });
      }
    }
  }
  return out;
}

// Mezcla: las gemas normales sueltas cambian de lugar hasta que no haya combinaciones y sí jugadas
export function shuffle(B, forced = false) {
  const idx = [];
  for (let i = 0; i < B.n; i++) { const q = B.p[i]; if (q && q.s === S.NONE && q.c >= 0 && !B.frost[i]) idx.push(i); }
  const pieces = idx.map((i) => B.p[i]);
  let ok = false;
  for (let tries = 0; tries < 300 && !ok; tries++) {
    shuffleArr(B, pieces);
    idx.forEach((i, k) => { B.p[i] = pieces[k]; });
    ok = idx.every((i) => !matchAt(B, i)) && hasMove(B);
    if (tries > 150 && !ok) for (const q of pieces) q.c = rndInt(B, B.colors); // tablero imposible: recolorear
  }
  B.shuffles++;
  emit(B, { k: 'shuffle', forced, t: 0 });
}

export function cloneBoard(B, opts = {}) {
  const C = { ...B };
  for (const k of ['mask', 'fog', 'frost', 'rock', 'moved', 'exit']) C[k] = B[k].slice();
  C.p = B.p.map((q) => q && { ...q });
  C.goals = B.goals.map((g) => ({ ...g }));
  C.stats = { ...B.stats, made: B.stats.made.slice(), gems: B.stats.gems.slice() };
  C.drops = { ...B.drops }; C.act = B.act.map((a) => ({ ...a })); C.prefer = B.prefer.slice();
  C.ev = opts.quiet ? null : []; C.inert = opts.inert ?? B.inert;
  return C;
}
