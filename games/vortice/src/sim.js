// VÓRTICE — simulación pura (sin DOM): la corre main.js a 120 Hz y tools/simrun.mjs en Node.
// El jugador gira sobre el hexágono de radio P; los muros son tramos de anillo (un lado
// cada uno) que caen hacia el centro. Chocar de frente mata; de costado, frena.
// La rotación del mundo es solo visual: colisiones en el marco del mundo sin rotar.
// SALTO (`requestFlip`): cruza por el centro al lado opuesto en FLIP_T, sin colisión en el
// vuelo; saltar con el muro de frente a punto de pegar paga ¡ESCAPE! / ¡POR UN PELO!.
import {
  SIDES, SEG, TAU, P, PSIZE, CENTER, SPAWN, THIN, DT, ROCE_ANG, COMBO_T, MODES, stageAt,
  FLIP_T, FLIP_CD, FLIP_BUF, ESCAPE_T, PELO_T,
} from './const.js';
import { nextPattern } from './patterns.js';

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (n, m) => ((n % m) + m) % m;
export const sideOf = (a) => Math.floor(mod(a, TAU) / SEG) % SIDES;

// Dificultad en función del tiempo «efectivo» (tiempo + desfase del modo)
export function params(d) {
  return {
    v: Math.min(880, 300 + 4.6 * d),       // velocidad de los muros (u/s)
    w: Math.min(11.5, 9.0 + 0.03 * d),     // giro del jugador (rad/s)
    m: Math.max(0.085, 0.3 - 0.003 * d),   // margen de reacción entre anillos (s)
    rot: Math.min(3.4, 0.5 + 0.024 * d),   // giro visual del mundo (rad/s)
  };
}

export function createSim({ seed = 1, mode = 'normal' } = {}) {
  const rng = mulberry32(seed);
  const s = {
    seed, mode, rng, off: MODES[mode].off, scoreMul: MODES[mode].scoreMul,
    t: 0, a: SEG * 2.5, walls: [], shards: [], tail: { r: SPAWN * 0.55, open: [2] },
    rot: 0, rotDir: 1, rotT: 4, spin: 0, stage: 0, dead: false,
    score: 0, combo: 0, comboT: 0, maxCombo: 0, roces: 0, shardsGot: 0,
    events: [], pv: params(MODES[mode].off), patterns: 0,
    fever: false, fevers: 0, casis: 0, inv: 0, revives: 0,
    flipT: 0, flipCd: 0, flipBuf: 0, flipFrom: 0, flipTti: 99, flips: 0, escapes: 0, pelos: 0,
  };
  return s;
}

export const FEVER_AT = 12; // combo que enciende la FIEBRE (puntos ×2 hasta perder el combo)
const mult = (s) => Math.min(8, 1 + Math.floor(s.combo / 2) * 0.25) * (s.fever ? 2 : 1);
export const multOf = mult;

// Máxima distancia (en lados) que hay que recorrer desde un lado libre de A hasta B
function shift(openA, openB) {
  let worst = 0;
  for (const a of openA) {
    let best = SIDES;
    for (const b of openB) { const d = Math.abs(a - b); best = Math.min(best, d, SIDES - d); }
    worst = Math.max(worst, best);
  }
  return worst;
}

function spawnPattern(s) {
  const pv = s.pv, tau = SEG / pv.w;
  const pat = nextPattern(s.rng, s.t + s.off);
  s.patterns++;
  let prev = s.tail.open, r = s.tail.r + 0.12 * pv.v; // pausa entre patrones
  const shardRing = s.rng() < 0.45 ? Math.floor(s.rng() * pat.rings.length) : -1;
  pat.rings.forEach((ring, i) => {
    const gap = (shift(prev, ring.open) * tau + pv.m) * pv.v + PSIZE + 4;
    r = Math.max(i === 0 ? SPAWN : 0, r + gap);
    const th = ring.dur ? Math.max(THIN, ring.dur * pv.v) : THIN;
    for (let k = 0; k < SIDES; k++) {
      if (!ring.open.includes(k)) s.walls.push({ side: k, r, th, minD: 9, done: false });
    }
    if (i === shardRing) {
      const sd = ring.open[Math.floor(s.rng() * ring.open.length)];
      s.shards.push({ side: sd, r: r + th / 2 });
    }
    r += th; prev = ring.open;
  });
  s.tail = { r, open: prev };
}

const overlaps = (w) => w.r <= P + PSIZE && w.r + w.th >= P;

function blocked(s, side) {
  for (const w of s.walls) if (w.side === side && overlaps(w)) return true;
  return false;
}

function addCombo(s, n) {
  s.combo += n; s.comboT = COMBO_T;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  if (!s.fever && s.combo >= FEVER_AT) { s.fever = true; s.fevers++; s.events.push({ type: 'fever' }); }
}

// Pide un SALTO; si está recargando, se recuerda FLIP_BUF s
export function requestFlip(s) { s.flipBuf = FLIP_BUF; }

// Segundos hasta que el muro más cercano del lado actual pegue de frente (99 = ninguno)
function threat(s) {
  const side = sideOf(s.a);
  let tti = 99;
  for (const w of s.walls) if (w.side === side && w.r + w.th > P) tti = Math.min(tti, Math.max(0, (w.r - P - PSIZE) / s.pv.v));
  return tti;
}

function startFlip(s) {
  s.flipTti = s.inv > 0 ? 99 : threat(s); // invulnerable no hay de qué escapar
  s.flipFrom = s.a; s.a = mod(s.a + Math.PI, TAU); // mismo lugar dentro del lado de enfrente
  s.flipT = FLIP_T; s.flipCd = FLIP_CD; s.flipBuf = 0; s.flips++;
  s.events.push({ type: 'salto', from: s.flipFrom, to: s.a, tti: s.flipTti });
}

// Al aterrizar vivo: recompensa si el muro del lado de partida estaba por pegar
function land(s) {
  const tti = s.flipTti;
  if (tti >= ESCAPE_T) { s.events.push({ type: 'llegada', tier: 0 }); return; }
  const pelo = tti < PELO_T;
  addCombo(s, pelo ? 3 : 2); s.escapes++;
  if (pelo) { s.pelos++; s.flipCd = 0; }
  const pts = (pelo ? 200 : 60) * mult(s) * s.scoreMul; s.score += pts;
  s.events.push({ type: 'llegada', tier: pelo ? 2 : 1, pts, tti, combo: s.combo });
}

// Revivir: limpia los muros cercanos y da un respiro sin colisión
export function revive(s) {
  s.dead = false; s.inv = 1.6; s.revives++;
  s.walls = s.walls.filter((w) => w.r > P + 420);
  s.shards = s.shards.filter((f) => f.r > P + 420);
}

// Un paso fijo. dir ∈ {-1, 0, 1}
export function step(s, dir) {
  if (s.dead) return;
  const pv = (s.pv = params(s.t + s.off));
  s.t += DT;

  // Giro del mundo (visual): cambia de sentido cada tanto, más seguido con la dificultad
  s.rotT -= DT;
  if (s.rotT <= 0) {
    s.rotDir *= -1; s.rotT = 2.5 + s.rng() * Math.max(1.5, 6 - (s.t + s.off) * 0.04);
    if (s.rng() < 0.3) s.spin = 1; // latigazo
    s.events.push({ type: 'flip' });
  }
  s.spin = Math.max(0, s.spin - DT * 1.8);
  s.rot += s.rotDir * pv.rot * (1 + s.spin * 2.2) * DT;

  // SALTO: recarga, pedido recordado y vuelo
  if (s.flipCd > 0) { s.flipCd -= DT; if (s.flipCd <= 0) s.events.push({ type: 'listo' }); }
  if (s.flipBuf > 0) s.flipBuf -= DT;
  let landed = false;
  if (s.flipT > 0) { s.flipT -= DT; if (s.flipT <= 0) { s.flipT = 0; landed = true; } }
  else if (s.flipBuf > 0 && s.flipCd <= 0) startFlip(s);
  const flying = s.flipT > 0;

  // Jugador: girar, salvo que el lado de al lado tenga un muro a su altura
  if (dir && !flying) {
    const side = sideOf(s.a);
    const na = s.a + dir * pv.w * DT;
    const ns = sideOf(na);
    if (ns !== side && blocked(s, ns)) {
      const base = Math.floor(s.a / SEG) * SEG; // borde del lado actual, sin envolver
      s.a = dir > 0 ? base + SEG - 1e-4 : base + 1e-4;
    } else s.a = na;
  }
  s.a = mod(s.a, TAU);
  const side = sideOf(s.a), local = s.a - side * SEG;

  // Muros
  const dv = pv.v * DT;
  s.tail.r -= dv;
  for (const w of s.walls) {
    w.r -= dv;
    if (overlaps(w)) {
      if (flying) continue; // en el vuelo no hay colisión ni roce
      if (w.side === side) { if (s.inv <= 0) s.dead = true; }
      else if (w.side === (side + 1) % SIDES) w.minD = Math.min(w.minD, SEG - local);
      else if (w.side === (side + SIDES - 1) % SIDES) w.minD = Math.min(w.minD, local);
    } else if (!w.done && w.r + w.th < P) {
      w.done = true;
      if (w.minD < ROCE_ANG) {
        const casi = w.minD < ROCE_ANG * 0.35; // al ras: vale el triple
        addCombo(s, casi ? 2 : 1); s.roces++; if (casi) s.casis++;
        const pts = (casi ? 75 : 25) * mult(s) * s.scoreMul; s.score += pts;
        s.events.push({ type: 'roce', pts, side: w.side, combo: s.combo, casi });
      }
    }
  }
  if (s.walls.length && s.walls[0].r + s.walls[0].th < CENTER) s.walls = s.walls.filter((w) => w.r + w.th >= CENTER);

  // Fragmentos
  for (let i = s.shards.length - 1; i >= 0; i--) {
    const f = s.shards[i];
    f.r -= dv;
    if (!flying && f.side === side && Math.abs(f.r - (P + PSIZE / 2)) < 14) {
      s.shards.splice(i, 1); addCombo(s, 2); s.shardsGot++;
      const pts = 100 * mult(s) * s.scoreMul; s.score += pts;
      s.events.push({ type: 'shard', pts, side, combo: s.combo });
    } else if (f.r < CENTER) s.shards.splice(i, 1);
  }

  if (s.dead) { s.events.push({ type: 'dead' }); return; }
  if (landed) land(s);

  // Combo, puntos por tiempo y etapa
  if (s.comboT > 0) {
    s.comboT -= DT;
    if (s.comboT <= 0) {
      if (s.combo >= 4) s.events.push({ type: 'combo-lost', combo: s.combo });
      s.combo = 0; s.fever = false;
    }
  }
  if (s.inv > 0) s.inv -= DT;
  s.score += 10 * mult(s) * s.scoreMul * DT;
  const st = stageAt(s.t);
  if (st !== s.stage) { s.stage = st; s.spin = 1; s.rotDir *= -1; s.events.push({ type: 'stage', stage: st }); }

  while (s.tail.r < SPAWN) spawnPattern(s);
}

// Piloto automático: elige el lado al que se llega a tiempo y que queda libre más tiempo.
// Sirve de bot para pruebas y de fondo animado en el título. Con `flip`, también salta
// (llama a requestFlip) cuando el lado opuesto es claramente mejor.
export function botDir(s, flip = false) {
  if (s.flipT > 0) return 0;
  const pv = s.pv, tau = SEG / pv.w, cur = sideOf(s.a), local = s.a - cur * SEG;
  // ventanas bloqueadas por lado, en segundos desde ahora
  const win = Array.from({ length: SIDES }, () => []);
  for (const w of s.walls) {
    const t0 = (w.r - P - PSIZE) / pv.v, t1 = (w.r + w.th - P) / pv.v;
    if (t1 > 0) win[w.side].push([t0 - 0.02, t1 + 0.02]);
  }
  const freeAt = (k, a, b) => win[k].every(([t0, t1]) => t1 < a || t0 > b);
  const clearance = (k, from) => {
    let c = 99; for (const [t0, t1] of win[k]) if (t1 >= from) c = Math.min(c, Math.max(t0, from)); return c;
  };
  let best = { score: -1, dir: 0 };
  for (const dir of [0, 1, -1]) {
    for (let n = 0; n <= 3; n++) {
      if (dir === 0 && n > 0) break;
      if (dir !== 0 && n === 0) continue;
      // tiempo para entrar a cada lado del camino
      const lead = dir > 0 ? SEG - local : local;
      let ok = true, tEnter = 0;
      for (let j = 1; j <= n; j++) {
        const k = mod(cur + dir * j, SIDES);
        tEnter = (lead + (j - 1) * SEG) / pv.w;
        const tExit = j < n ? tEnter + tau : tEnter + 0.05;
        if (!freeAt(k, tEnter, tExit)) { ok = false; break; }
      }
      if (!ok) break;
      const k = mod(cur + dir * n, SIDES);
      // si me quedo, también tengo que poder seguir ahí desde ya
      if (n === 0 && !freeAt(k, 0, 0.01)) continue;
      const c = clearance(k, tEnter);
      const sh = s.shards.some((f) => f.side === k && f.r > P) ? 0.05 : 0;
      const sc = Math.min(c, 3) - n * 0.03 + sh;
      if (sc > best.score) best = { score: sc, dir: n === 0 ? 0 : dir, n };
    }
  }
  if (flip && s.flipCd <= 0) {
    const k = mod(cur + 3, SIDES);
    if (freeAt(k, FLIP_T - 0.02, FLIP_T + 0.08)) {
      const sc = Math.min(clearance(k, FLIP_T), 3);
      if (sc > best.score + 0.4 || (best.score < 0.2 && sc > best.score)) { requestFlip(s); return 0; }
    }
  }
  // ya en el lado elegido: centrarse un poco
  if (best.dir === 0) {
    if (local < SEG * 0.3) return 1;
    if (local > SEG * 0.7) return -1;
  }
  return best.dir;
}
