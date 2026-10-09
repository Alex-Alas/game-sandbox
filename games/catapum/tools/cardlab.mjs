// Laboratorio de cartas y combate: mide lo que hace falta para balancear sin jugar a mano. Dos partes:
//
//  1) CURVAS DE KO: para cada carta, golpe de cuerpo (dash, barrida, picada, liga + DASH) y cada ulti, un rival QUIETO
//     en el centro y en el borde de la isla grande del mapa `islas`, y el atacante lo golpea (con la sim real: se lanza la
//     carta, vuela, pega). Se busca el % que tenía el rival ANTES del golpe a partir del cual sale de la isla y cae
//     (KO por agua, costados o arriba):
//       sin   = el rival no toca nada (sin influencia, sin recuperación): el piso de lo que mata.
//       peor  = con la influencia (DI) más favorable al rival, la mejor de 8 direcciones del joystick sostenidas al
//               recibir el golpe: a partir de acá mata pase lo que pase con la DI. Es la columna con la que se mide.
//       rec   = "con recuperación": el rival lo maneja botInput de bot.ts (DIFÍCIL: DI al centro, tech, doble salto, dash,
//               liga, cartas) apenas lo golpean; mediana de 5 semillas del bot.
//     Las cartas con arco prueban 5 puntos de caída y se queda la mejor puntería. TNT y lata se colocan junto al rival y se
//     detonan (en el juego los detona otro golpe); la mina y la banana se lanzan al piso. Las que no dañan (mover, curar,
//     escudo, pegamento) no tienen curva: se ven en las estadísticas y en los tests.
//  2) ESTADÍSTICAS EN PARTIDAS DE BOTS: usos, impactos, daño, KOs acreditados (el último golpe antes del KO), autodaño y
//     KOs propios tras usarla, por carta (los golpes llevan `src` en el evento 'hit'). Mazos al azar (cada carta con la
//     misma exposición) o los de cada personaje (--mazos base).
//
// Uso:  node games/catapum/tools/cardlab.mjs [--solo curvas|stats] [--cartas id,id] [--partidas 20] [--seg 120] [--dif 3]
//         [--masa personaje] [--cfg CLAVE=valor,...] [--rapido] [--mazos base|azar] [--json]
import { newState, step, NO_INPUT, HZ, GO, HW, H, NEVER } from '../src/sim/sim.ts';
import { groundBelow, cloneTerr } from '../src/sim/terrain.ts';
import { botInput, newMem } from '../src/sim/bot.ts';
import { CARDS, CARD } from '../src/sim/cards.ts';
import { CHARS } from '../src/sim/chars.ts';
import { MAPS } from '../src/sim/maps.ts';
import { DEFAULTS } from '../src/sim/params.ts';
import { newProp } from '../src/sim/combat.ts';
import { HAND_Y, G_PROJ, AIM_R, DT } from '../src/sim/state.ts';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes('--' + k);
const json = flag('json'), fast = flag('rapido'), only = arg('solo', ''), vch = arg('masa', 'bombin');
const cfg = { ...DEFAULTS };
for (const kv of (arg('cfg', '') || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); if (!(k in cfg)) throw new Error('clave desconocida ' + k); cfg[k] = +v; }
const pick = arg('cartas', '') ? arg('cartas').split(',') : null;
const I = (o = {}) => ({ ...NO_INPUT, ...o });
const RULES = { time: 0, teams: false, friendly: false, crates: 0, infinite: false, startDmg: 0 };
const SEED = 11, MAXP = 400;
// Mazos de la víctima cuando la maneja el bot: sin cartas de movimiento (neutra) o con las tres que recuperan (movil)
const DECKS = { neutra: ['laser', 'bate', 'shuriken', 'bomba', 'mina', 'escudo', 'fruta', 'banana'], movil: ['supersalto', 'cohetito', 'tele', 'laser', 'bate', 'bomba', 'mina', 'fruta'] };
const out = { cfg: arg('cfg', ''), curvas: [], stats: null };

// ---- Geometría de la isla grande ----------------------------------------------------------------------------------
const cx = 40;
const surf = (T, x) => groundBelow(T, x, 18, 18);
function edgeX(T) { let x = cx; while (surf(T, x + 0.25) !== null) x += 0.25; return x; }

function ballistic(dx, dy, v, g) {
  if (g < 1e-3) { const n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; }
  const v2 = v * v, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0) return null;
  const a = Math.atan2(v2 - Math.sqrt(disc), g * Math.abs(dx));
  return [Math.sign(dx || 1) * Math.cos(a), Math.sin(a)];
}

// ---- Escenarios ---------------------------------------------------------------------------------------------------
// Cada fuente: { id, kind, ch, D (distancia atacante–rival), pull, air, rand, cands, prep(ctx), script(ctx, cand) → f => Input }
// El atacante queda a la izquierda del rival (dir = +1: lo empuja hacia +x, hacia el borde derecho de la isla).
const SOURCES = [];
const add = o => SOURCES.push({ ch: 'bombin', D: 6, cands: [0], rand: false, ...o });

// Carta con proyectil o rayo apuntada al rival. off = cuántos metros antes de él cae (cartas con arco); feet = al piso.
function shoot(id, o = {}) {
  const card = CARD[id], pd = card.proj;
  add({ id, kind: 'card', D: 6, ...o, script(ctx, off) {
    const { A, V } = ctx;
    const tx = V.x - off, ty = o.feet ? V.y + 0.15 : V.y + 0.55;
    let ax = 1, ay = 0, pw = 1;
    for (let it = 0; it < 3; it++) {
      const hx = A.x + ax * 0.45, hy = A.y + HAND_Y + ay * 0.3, dx = tx - hx, dy = ty - hy;
      if (card.aim === 'arc' && pd) {
        for (const p of [0.75, 1, 0.55, 0.4]) {
          const sol = ballistic(dx, dy, pd.v * (0.3 + 0.7 * p), G_PROJ * pd.g);
          if (sol) { ax = sol[0], ay = sol[1], pw = p; break; }
        }
      } else if (pd && pd.g > 0) {
        const sol = ballistic(dx, dy, pd.v, G_PROJ * pd.g) ?? [dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy)];
        ax = sol[0], ay = sol[1];
      } else { const n = Math.hypot(dx, dy); ax = dx / n, ay = dy / n; }
    }
    return f => f === 0 ? I({ cast: 4, ax: ax * pw, ay: ay * pw }) : NO_INPUT;
  } });
}
shoot('fueguito'); shoot('pegajosa'); shoot('cohetito'); shoot('bola'); shoot('triple'); shoot('palomitas', { rand: true });
shoot('melocoton'); shoot('shuriken'); shoot('boomerang');
// Bombas con mecha: no explotan al tocar, así que dónde caen depende del tiro. Se prueban 64 tiros (ángulo × fuerza) y se
// queda el mejor (los 4 que más empujan se afinan buscando el %).
const sweep = [];
for (let a = 0; a <= 75; a += 5) for (const pw of [0.4, 0.6, 0.8, 1]) sweep.push({ ax: Math.cos(a * Math.PI / 180) * pw, ay: Math.sin(a * Math.PI / 180) * pw });
for (const [id, rand] of [['bomba', false], ['caballo', true], ['racimo', true], ['granbum', false]])
  add({ id, kind: 'card', D: 6, rand, cands: sweep, script: (ctx, c) => f => f === 0 ? I({ cast: 4, ax: c.ax, ay: c.ay }) : NO_INPUT });
shoot('laser'); shoot('megalaser'); shoot('mina', { D: 5, feet: true, cands: [0, 0.4, -0.4] }); shoot('banana', { D: 5, feet: true, cands: [0, 0.3, -0.3] });
// Caparazón: rueda por el piso hacia el rival
add({ id: 'caparazon', kind: 'card', D: 6, script: () => f => f === 0 ? I({ cast: 4, ax: 1, ay: 0 }) : NO_INPUT });
// Imán: el atacante en el borde, el rival adentro (lo tira hacia afuera)
shoot('iman', { pull: true });
// Rayos "en el punto": el ovni de la vaca y el meteorito caen donde apuntás (largo de la mira × AIM_R)
for (const id of ['vaca', 'meteorito']) add({ id, kind: 'card', D: 6, cands: [0, 1, 2], script(ctx, off) {
  const { A, V } = ctx;
  return f => f === 0 ? I({ cast: 4, ax: (V.x - off - A.x) / AIM_R, ay: 0.001 }) : NO_INPUT;
} });
// Cuerpo a cuerpo
add({ id: 'bate', kind: 'card', D: 1.2, script: () => f => f === 0 ? I({ cast: 4, ax: 1, ay: 0 }) : NO_INPUT });
add({ id: 'katana', kind: 'card', D: 5, script: () => f => f === 0 ? I({ cast: 4, ax: 1, ay: 0 }) : NO_INPUT });
add({ id: 'trompeta', kind: 'card', D: 3.5, script: () => f => f === 0 ? I({ cast: 4, ax: 1, ay: 0 }) : NO_INPUT });
add({ id: 'autodestruccion', kind: 'card', D: 1.8, script: () => f => f === 0 ? I({ cast: 4 }) : NO_INPUT });
// Objetos: se colocan junto al rival y se detonan (en el juego los detona cualquier golpe)
for (const id of ['tnt', 'gas']) add({ id, kind: 'card', D: 5, cands: [0.8], script(ctx, off) {
  const { s, A, V } = ctx;
  return f => {
    if (f === 0) { const o = newProp(s, id, V.x - off, V.y + 0.05, 0, 0, A.id); o.chute = false; }
    if (f === 30) for (const o of s.props) if (o.k === id) o.hp = 0;
    return NO_INPUT;
  };
} });
// Golpes de cuerpo
add({ id: 'dash', kind: 'body', D: 2.6, script: () => f => f === 0 ? I({ dash: true, x: 1 }) : NO_INPUT });
add({ id: 'slide', kind: 'body', D: 7, script(ctx) { const { A, V } = ctx; return () => (V.x - A.x) > 3.4 ? I({ x: 1 }) : I({ x: 1, y: -1 }); } });
add({ id: 'pound', kind: 'body', D: 0, air: 5, script: () => f => f === 0 ? I({ dash: true, y: -1 }) : NO_INPUT }); // pisotón desde arriba
add({ id: 'pound-onda', kind: 'body', D: 1.3, air: 5, script: () => f => f === 0 ? I({ dash: true, y: -1 }) : NO_INPUT }); // onda al aterrizar
add({ id: 'yank', kind: 'body', D: 6, pull: true, script(ctx) { // liga al rival, y DASH enganchado: lo lanza hacia vos
  const { s, A, V } = ctx;
  return f => {
    const hand = [A.x, A.y + HAND_Y], n = Math.hypot(V.x - hand[0], V.y + 0.55 - hand[1]);
    const aim = { ax: (V.x - hand[0]) / n, ay: (V.y + 0.55 - hand[1]) / n };
    if (A.hook && s.t >= A.hook.at) return I({ hook: true, dash: true, ...aim });
    return f < 60 ? I({ hook: true, ...aim }) : NO_INPUT;
  };
} });
// Ultis (cada una con el personaje que la tiene, la barra llena y un guion que juega como una persona decente)
add({ id: 'ulti:meteoro', kind: 'ulti', ch: 'bombin', D: 6, cands: [0, 1.5, 3], script(ctx, off) {
  const { A, V } = ctx; let prev = false;
  return f => {
    if (f === 0) return I({ ulti: true });
    const u = A.u; let press = false, x = 0;
    if (u && u.f === 1) { const e = (V.x - off) - u.x; x = Math.max(-1, Math.min(1, e / (26 * DT))); press = Math.abs(e) < 0.3 && ctx.s.t - u.ft > 9 && !prev; }
    prev = press;
    return I({ x, ulti: press });
  };
} });
add({ id: 'ulti:lazo', kind: 'ulti', ch: 'lia', D: 6, script: () => f => f === 0 ? I({ ulti: true }) : NO_INPUT });
add({ id: 'ulti:cohete', kind: 'ulti', ch: 'turbo', D: 6, script(ctx) {
  const { s, A, V } = ctx; let prev = false;
  return f => {
    const n = Math.hypot(V.x - A.x, V.y + 0.55 - A.y - 0.55) || 1, aim = { ax: (V.x - A.x) / n, ay: (V.y - A.y) / n };
    const press = f === 0 || (A.u && s.t - A.u.ft > 90 && !prev);
    prev = !!press;
    return I({ ulti: !!press, ...aim });
  };
} });
add({ id: 'ulti:abduccion', kind: 'ulti', ch: 'muu', D: 6, script(ctx) {
  const { s, w, A, V } = ctx, T = w.T, edge = edgeX(T); let prev = false;
  return f => {
    if (f === 0) return I({ ulti: true });
    const u = A.u; if (!u) return NO_INPUT;
    if (!u.ids.length) return I({ x: Math.sign(V.x - A.x), y: V.y + 4 > A.y ? 1 : -0.6 });
    // los lleva hacia el borde de la isla grande y los suelta 4 m más allá, sobre el agua
    const out = Math.sign(A.x - cx) || 1, past = (A.x - cx) * out > (edge - cx) + 4;
    const press = past && !prev; prev = press;
    return I({ x: out, y: A.y < 12 ? 1 : 0, ulti: press });
  };
} });
add({ id: 'ulti:expreso', kind: 'ulti', ch: 'chuchu', D: 6, script: () => f => f === 0 ? I({ ulti: true }) : NO_INPUT });
add({ id: 'ulti:sombra', kind: 'ulti', ch: 'kunai', D: 5, script(ctx) {
  const { s, A, V } = ctx; let prev = false;
  return f => {
    const n = Math.hypot(V.x - A.x, V.y + 0.55 - A.y - 0.55) || 1, aim = { ax: (V.x - A.x) / n, ay: (V.y - A.y) / n };
    const press = f === 0 || (A.u && s.t - A.u.ft > 8 && !prev);
    prev = !!press;
    return I({ ulti: !!press, ...aim });
  };
} });

// ---- Objetivos por clase (columna rec: el rival con recuperación, sin cartas de movimiento) ---------------------------
// fuerte = los golpes caros o que se arriesgan cerca; media = el grueso; debil = acumulan y arman combos; control y util
// no se miden por KO (valen por lo que habilitan). En las curvas, ▲ = mata antes de la banda, ▼ = después.
// La recuperación (liga de 11 m, doble salto, dash) hace que el borde salga solo ~30 % más abajo que el centro.
const BANDS = { fuerte: [[130, 190], [80, 130]], media: [[190, 260], [120, 190]], debil: [[260, MAXP + 1], [170, MAXP + 1]], ulti: [[120, 200], [60, 140]], epico: [[100, 150], [50, 100]] };
const CLASS = {
  fueguito: 'debil', shuriken: 'control', mina: 'debil', banana: 'control',
  bate: 'fuerte', bomba: 'media', boomerang: 'media', caballo: 'media', cohetito: 'media', gas: 'control', laser: 'media', melocoton: 'control', pegajosa: 'media', tnt: 'media',
  bola: 'media', caparazon: 'media', iman: 'control', katana: 'fuerte', palomitas: 'media', triple: 'media',
  granbum: 'fuerte', racimo: 'fuerte', trompeta: 'fuerte', vaca: 'control', autodestruccion: 'epico', meteorito: 'epico', megalaser: 'epico',
  dash: 'debil', slide: 'debil', pound: 'debil', 'pound-onda': 'debil', yank: 'media',
  'ulti:meteoro': 'ulti', 'ulti:lazo': 'ulti', 'ulti:cohete': 'ulti', 'ulti:abduccion': 'ulti', 'ulti:expreso': 'ulti', 'ulti:sombra': 'ulti',
};
const flagOf = (cls, v, k) => { const b = BANDS[cls]?.[k]; return !b || v === undefined ? ' ' : (v ?? MAXP + 1) < b[0] ? '▲' : (v ?? MAXP + 1) > b[1] ? '▼' : ' '; };

// ---- Un ensayo ----------------------------------------------------------------------------------------------------
const bases = new Map();
function base(sp, pos) {
  const key = sp.id + '|' + pos;
  if (bases.has(key)) return bases.get(key);
  const { s, w } = newState('islas', SEED, [{ name: 'A', ch: sp.ch }, { name: 'V', ch: vch }], RULES, cfg);
  s.t = GO * HZ;
  // arena limpia: solo la isla grande (sin las laterales ni las plataformas: nada contra lo que rebotar o aterrizar)
  const T = w.T;
  for (let j = 0; j < T.rows; j++) for (let i = 0; i < T.cols; i++) if (Math.abs((i + 0.5) * 0.25 - cx) > 15 || (j + 0.5) * 0.25 > 18) T.g[j * T.cols + i] = 0;
  const edge = edgeX(w.T), [A, V] = s.pl;
  let vx, ax;
  if (sp.pull) { ax = pos === 'centro' ? cx + sp.D : edge - 1; vx = pos === 'centro' ? cx : ax - sp.D; }
  else { vx = pos === 'centro' ? cx : edge - 2; ax = vx - sp.D; }
  for (const [p, x] of [[A, ax], [V, vx]]) Object.assign(p, { alive: true, x, y: surf(w.T, x), ground: true, cloudT: NEVER, invT: NEVER, groundT: s.t, face: 1 });
  if (sp.air) A.y += sp.air, A.ground = false;
  if (sp.kind === 'card') A.bonus = sp.id;
  if (sp.kind === 'ulti') A.ulti = 100;
  const b = { s, w, edge };
  bases.set(key, b);
  return b;
}

// o: { pct, di: [x, y] | null, rec: semilla del bot | 0, deck: 'neutra'|'movil', rng, cand }
function trial(sp, pos, o) {
  const b = base(sp, pos), s = structuredClone(b.s), w = { m: b.w.m, T: cloneTerr(b.w.T), c: b.w.c };
  const [A, V] = s.pl, ctx = { s, w, A, V };
  s.rng = o.rng || 1;
  V.dmg = o.pct;
  const script = sp.script(ctx, o.cand ?? sp.cands[0]);
  const mem = o.rec ? Object.assign(newMem(V.id), { seed: o.rec * 7919 + 13 }) : null;
  if (o.rec) { const d = DECKS[o.deck ?? 'neutra']; V.deck = d.slice(), V.hand = d.slice(0, 4), V.queue = d.slice(4); }
  const stick = o.di ? I({ x: o.di[0], y: o.di[1] }) : NO_INPUT;
  let hit = false, f0 = 0, dmgIn = 0, v0 = null, how = '';
  for (let f = 0; f < 900; f++) {
    const iA = script(f);
    let iV = NO_INPUT;
    if (!hit) { if (!mem) V.stopT = 1e9; iV = mem ? NO_INPUT : stick; } // sin recuperación: congelado hasta el golpe (sostiene el joystick)
    else iV = mem ? botInput(s, w, V, mem) : stick;
    step(s, w, [iA, iV]);
    if (o.trace && hit && (o.trace === 2 ? s.ev.length > 0 : (f - f0) % 4 === 0)) console.log(f - f0, V.x.toFixed(1), V.y.toFixed(1), V.vx.toFixed(1), V.vy.toFixed(1), V.ground ? 'G' : '-', s.t < V.stunT ? 'S' : '-', V.hook ? 'H' : '-', V.air, V.dashN, s.ev.filter(e => e.p === V.id || e.k === 'cast').map(e => e.k + (e.c ? ':' + e.c : '')).join(' '));
    for (const e of s.ev) {
      if (e.k === 'hit' && e.p === V.id) { if (!hit) hit = true, f0 = f; dmgIn += e.d; if (v0 === null) v0 = e.v; }
      if (e.k === 'ko' && e.p === V.id) how = e.how;
    }
    if (!V.alive) return { ko: true, hit, dmgIn, v0, how, f };
    if (!hit && f > 600) break;
    if (hit && (f - f0 > 300 || (f - f0 > 70 && V.ground && s.t >= V.stunT && !A.u && !A.atk && !s.beams.length && !s.pr.length && !s.zones.length))) break;
  }
  return { ko: false, hit, dmgIn, v0, how, f: 0 };
}

// ---- Búsqueda del % ----------------------------------------------------------------------------------------------
const RNGS = fast ? [3] : [3, 5, 9, 13, 17], RECS = fast ? [1, 2, 3] : [1, 2, 3, 4, 5];
const DI8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]].map(([x, y]) => { const n = Math.hypot(x, y); return [x / n, y / n]; });
// ¿mata a ese %? mayoría de las variantes (semillas de azar o del bot)
function kills(sp, pos, pct, o) {
  // azar de la carta (caballo, racimo, palomitas): alcanza con que mate 2 de cada 5 veces; la recuperación del bot, la mayoría
  const vars = o.rec ? RECS : sp.rand ? RNGS : [RNGS[0]], need = o.rec ? Math.ceil(vars.length / 2) : sp.rand ? Math.ceil(vars.length * 0.4) : 1;
  let n = 0;
  for (const v of vars) if (trial(sp, pos, { pct, di: o.di, rec: o.rec ? v : 0, deck: o.deck, rng: o.rec ? 5 : v, cand: o.cand }).ko && ++n >= need) return true;
  return false;
}
// Menor % que mata (monótono): desde lo (si ya mata ahí, es lo), o null si ni a MAXP
function search(sp, pos, o, lo = 0) {
  if (kills(sp, pos, lo, o)) return lo;
  if (!kills(sp, pos, MAXP, o)) return null;
  let a = lo, b = MAXP; // a no mata, b mata
  while (b - a > 1) { const m = (a + b) >> 1; if (kills(sp, pos, m, o)) b = m; else a = m; }
  return b;
}
// La mejor puntería: las candidatas se preseleccionan por cuánto empujan a 100 % (las que no pegan quedan afuera) y a las
// 4 mejores se les busca el % sin influencia y con la peor; gana la de menor % con la peor DI (la que se mide).
function aim(sp, pos) {
  const cands = sp.cands.map(c => { const r = trial(sp, pos, { pct: 100, di: null, rng: RNGS[0], cand: c }); return [r.hit ? (r.ko ? 1000 : 0) + r.v0 : -1, c]; })
    .filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).slice(0, 4).map(x => x[1]);
  if (!cands.length) return null;
  let best = null;
  for (const cand of cands) {
    const sin = search(sp, pos, { di: null, cand });
    let peor = sin;
    if (sin !== null) for (const d of DI8) { const p = search(sp, pos, { di: d, cand }, peor); if (p === null) { peor = null; break; } peor = Math.max(peor, p); }
    if (!best || (peor !== null && (best.peor === null || peor < best.peor))) best = { cand, sin, peor };
  }
  return best;
}
function curve(sp, pos) {
  const a = aim(sp, pos);
  if (!a) return null;
  const { cand } = a;
  return { sin: a.sin, peor: a.peor, rec: search(sp, pos, { di: null, rec: 1, deck: 'neutra', cand }), recM: search(sp, pos, { di: null, rec: 1, deck: 'movil', cand }), cand };
}
// Daño del golpe a 0 % y rapidez del empuje a 100 % (con la víctima quieta en el centro)
function hitInfo(sp, cand) {
  const a = trial(sp, 'centro', { pct: 0, di: null, rng: RNGS[0], cand }), b = trial(sp, 'centro', { pct: 100, di: null, rng: RNGS[0], cand });
  return { dmg: a.dmgIn, v100: b.v0 };
}

const fmt = v => v === null ? ' >' + MAXP : String(v).padStart(4);
const label = sp => sp.id.replace('ulti:', 'ULTI ');
function runCurves() {
  const list = SOURCES.filter(sp => !pick || pick.includes(sp.id) || pick.includes(sp.id.replace('ulti:', '')));
  if (!json) console.log(`CURVAS DE KO — % de la víctima (masa ${CHARS.find(c => c.id === vch).mass}) ANTES del golpe desde el que sale de la isla y cae (rec = bot sin cartas de movimiento, rec+ = con ellas)\n` +
    `                   $   daño v@100 | CENTRO  sin peor  rec rec+ | BORDE   sin peor  rec rec+   clase`);
  for (const sp of list) {
    const row = { id: sp.id, kind: sp.kind, cost: sp.kind === 'card' ? CARD[sp.id].cost : null };
    const t0 = performance.now();
    row.centro = curve(sp, 'centro');
    row.borde = row.centro ? curve(sp, 'borde') : null;
    if (row.centro) Object.assign(row, hitInfo(sp, row.centro.cand));
    row.ms = Math.round(performance.now() - t0);
    out.curvas.push(row);
    if (!json) console.log(`${label(sp).padEnd(18)} ${String(row.cost ?? '-').padStart(2)} ${String(row.dmg ?? '-').padStart(6)} ${String(row.v100 ?? '-').padStart(6)} |        ` +
      (row.centro ? `${fmt(row.centro.sin)} ${fmt(row.centro.peor)} ${fmt(row.centro.rec)}${flagOf(CLASS[sp.id], row.centro.rec, 0)}${fmt(row.centro.recM)} |       ${fmt(row.borde.sin)} ${fmt(row.borde.peor)} ${fmt(row.borde.rec)}${flagOf(CLASS[sp.id], row.borde.rec, 1)}${fmt(row.borde.recM)}   ${CLASS[sp.id] ?? ''}` : 'no pega en el escenario'));
  }
}

// ---- Estadísticas en partidas de bots -----------------------------------------------------------------------------
function runStats() {
  const nm = +arg('partidas', 40), seg = +arg('seg', 120), dif = +arg('dif', 3), nb = +arg('bots', 4), base_ = arg('mazos', 'azar') === 'base';
  const maps = MAPS.map(m => m.id), ids = CARDS.map(c => c.id);
  const T = {}; // por carta o golpe
  const row = k => T[k] ??= { uses: 0, hits: 0, dmg: 0, kos: 0, self: 0, selfKo: 0, hitsOn: 0 };
  const tot = { min: 0, kos: 0, selfKos: 0, ultis: 0, ultiHits: 0, ultiKos: 0, players: 0, how: {}, dmgAtKo: 0 };
  let rs = 12345;
  const rnd = () => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let m = 0; m < nm; m++) {
    const map = maps[m % maps.length];
    const entries = Array.from({ length: nb }, (_, k) => {
      const e = { name: 'B' + k, ch: CHARS[(k + m) % CHARS.length].id, bot: dif };
      if (!base_) { const pool = ids.slice(); e.deck = []; while (e.deck.length < 8) e.deck.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]); }
      return e;
    });
    const { s, w } = newState(map, 1000 + m * 31, entries, { ...RULES, time: seg, crates: 11 }, cfg);
    const mem = s.pl.map(p => newMem(p.id));
    const last = {}, prevDmg = s.pl.map(p => p.dmg), lastCast = s.pl.map(() => ({ c: '', t: -1e9 })), lastUlti = s.pl.map(() => ({ k: '', t: -1e9 }));
    while (!s.over && s.t < (seg + 70) * HZ) {
      step(s, w, s.pl.map(p => botInput(s, w, p, mem[p.id])));
      // golpes sin src que vienen de la liga + DASH: el evento 'trick' LANZADO del mismo cuadro
      const evs = s.ev;
      const sumHit = s.pl.map(() => 0);
      for (let k = 0; k < evs.length; k++) {
        const e = evs[k];
        if (e.k === 'cast') { row(e.c).uses++; lastCast[e.p] = { c: e.c, t: s.t }; }
        if (e.k === 'ulti') { const k = 'ulti:' + CHARS.find(c => c.id === s.pl[e.p].ch).ulti; row(k).uses++; tot.ultis++; lastUlti[e.p] = { k, t: s.t }; }
        if (e.k === 'hit') {
          let src = e.src;
          if (!src) src = e.by >= 0 && evs.some(x => x.k === 'trick' && x.n === 'LANZADO' && x.p === e.by) ? 'yank' : 'peligro';
          const dot = src.includes('/'); // golpes con el tiempo (nube, fuego): suman daño pero no se llevan el crédito de un KO
          src = src.split('/')[0];
          const r = row(src);
          r.hits += dot ? 0 : 1, r.dmg += e.d;
          sumHit[e.p] += e.d;
          if (src.startsWith('ulti:') && !dot) tot.ultiHits++;
          if (e.by >= 0) { const k = dot ? 'dot' : 'real'; (last[e.p] ??= {})[k] = { by: e.by, src, t: s.t }; }
        }
        if (e.k === 'ko') {
          tot.kos++, tot.how[e.how] = (tot.how[e.how] ?? 0) + 1; tot.dmgAtKo += s.pl[e.p].dmg;
          if (e.by >= 0) {
            // el último golpe de verdad (hasta KO_CREDIT s antes); si no hubo, el del tiempo; si no, lo arrastró una ulti o la liga
            const l = last[e.p], pick = [l?.real, l?.dot].find(x => x && x.by === e.by && s.t - x.t <= cfg.KO_CREDIT * HZ), u = lastUlti[e.by];
            const src = pick ? pick.src : s.t - u.t < 8 * HZ ? u.k : 'liga';
            row(src).kos++;
            if (src.startsWith('ulti:')) tot.ultiKos++;
          } else {
            tot.selfKos++;
            const lc = lastCast[e.p];
            if (lc.c && s.t - lc.t < 2 * HZ) row(lc.c).selfKo++;
          }
          last[e.p] = undefined;
        }
      }
      // daño que no vino de un golpe (la autodestrucción): a la última carta
      for (const p of s.pl) {
        const d = p.dmg - prevDmg[p.id] - sumHit[p.id];
        if (d > 5 && !s.sudden && p.alive) row(lastCast[p.id].c || '?').self += d;
        prevDmg[p.id] = p.dmg;
      }
    }
    tot.min += s.t / (HZ * 60), tot.players += nb;
  }
  const pm = tot.min * nb / nb; // minutos totales de partida (cada una de nb jugadores)
  out.stats = { partidas: nm, minutos: +tot.min.toFixed(1), kosMinJug: +(tot.kos / tot.min / nb).toFixed(2), propiosPct: Math.round(100 * tot.selfKos / Math.max(1, tot.kos)),
    ultisMinJug: +(tot.ultis / tot.min / nb).toFixed(2), alKO: Math.round(tot.dmgAtKo / Math.max(1, tot.kos)), how: tot.how, ultiKosPct: Math.round(100 * tot.ultiKos / Math.max(1, tot.kos)), rows: {} };
  void pm;
  const keys = Object.keys(T).filter(k => !pick || pick.includes(k) || pick.includes(k.replace('ulti:', ''))).sort((a, b) => (CARD[a]?.cost ?? 9) - (CARD[b]?.cost ?? 9) || a.localeCompare(b));
  if (!json) {
    console.log(`\nESTADÍSTICAS: ${nm} partidas de ${nb} bots (dif ${dif}), ${tot.min.toFixed(0)} min — KO/min/jug ${out.stats.kosMinJug}, propios ${out.stats.propiosPct}%, % al KO ${out.stats.alKO}, ultis/min/jug ${out.stats.ultisMinJug} (${out.stats.ultiKosPct}% de los KOs)`);
    console.log('carta                coste  usos/min impactos tasa  daño  daño/uso  daño/maná  KOs  KO/100usos  KO/100maná  autodaño  KOprop');
  }
  for (const k of keys) {
    const r = T[k], c = CARD[k]?.cost, minCards = tot.min * nb;
    const o = { id: k, cost: c ?? null, usosMin: +(r.uses / minCards).toFixed(2), impactos: r.hits, tasa: r.uses ? +(r.hits / r.uses).toFixed(2) : null, dano: Math.round(r.dmg),
      danoUso: r.uses ? +(r.dmg / r.uses).toFixed(1) : null, danoMana: r.uses && c ? +(r.dmg / (r.uses * c)).toFixed(1) : null, kos: r.kos,
      kosPor100: r.uses ? +(100 * r.kos / r.uses).toFixed(1) : null, kosMana: r.uses && c ? +(100 * r.kos / (r.uses * c)).toFixed(1) : null, autodano: Math.round(r.self), kosPropios: r.selfKo };
    out.stats.rows[k] = o;
    if (!json) console.log(`${k.padEnd(20)} ${String(c ?? '-').padStart(3)} ${String(o.usosMin).padStart(9)} ${String(o.impactos).padStart(8)} ${String(o.tasa ?? '-').padStart(5)} ${String(o.dano).padStart(5)} ${String(o.danoUso ?? '-').padStart(8)} ${String(o.danoMana ?? '-').padStart(10)} ${String(o.kos).padStart(4)} ${String(o.kosPor100 ?? '-').padStart(10)} ${String(o.kosMana ?? '-').padStart(11)} ${String(o.autodano).padStart(9)} ${String(o.kosPropios).padStart(7)}`);
  }
}

export { SOURCES, DI8, trial, base, kills, search, aim, curve, hitInfo };

// Solo por línea de comandos (los tests importan las funciones de arriba)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (only !== 'stats') runCurves();
  if (only !== 'curvas') runStats();
  if (json) console.log(JSON.stringify(out, null, 1));
}
void HW, void H;
