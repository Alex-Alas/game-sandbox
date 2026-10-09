// Arnés en Node: partidas solo de bots para ver que el juego fluye (KOs por minuto, cuántos se caen solos, cartas,
// trucos), qué herramientas usan los bots y cuánto cuesta un paso. Uso:
//   node games/catapum/tools/simrun.mjs [--mapa id] [--bots 4] [--dif 3|1,4,2,3] [--chars bombin,lia,…]
//                                       [--seg 120] [--semillas 3] [--json] [--uso] [--causas] [--duelo 4:1]
//   --dif       dificultad 1–4 (FÁCIL…CAÓTICO); con comas, una por bot (se repite): sirve para enfrentar dificultades.
//   --chars     personajes por bot (se repiten); por defecto rotan con la semilla.
//   --uso       tabla de herramientas por bot-minuto (liga, dash, picada, barrida, saltos, trucos, tipos de carta).
//   --causas    por qué se cayeron solos (modo del bot en el KO).
//   --duelo a:b 1 contra 1, dificultad a contra b, cada semilla dos veces (cambiando de personaje y de lugar);
//               informa victorias/empates/derrotas de a y la diferencia de puntos.
import { newState, step, standings } from '../src/sim/sim.ts';
import { botInput, newMem, DIFFS } from '../src/sim/bot.ts';
import { MAPS } from '../src/sim/maps.ts';
import { CHARS } from '../src/sim/chars.ts';
import { CARD } from '../src/sim/cards.ts';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes('--' + k);
const maps = arg('mapa') ? [arg('mapa')] : MAPS.map(m => m.id);
const seg = +arg('seg', 120), seeds = +arg('semillas', 3), json = flag('json');
const difs = String(arg('dif', '3')).split(',').map(Number);
const charList = arg('chars') ? arg('chars').split(',') : null;
const SUM = (a, b) => { for (const k of Object.keys(b)) a[k] = (a[k] ?? 0) + b[k]; return a; };
const RULES = { time: seg, teams: false, friendly: false, crates: 11, infinite: false, startDmg: 0 };

// Una partida de bots. entries: [{ ch, bot }]. Devuelve contadores y el resultado.
function play(map, sd, entries) {
  const { s, w } = newState(map, sd * 7717, entries.map((e, k) => ({ name: 'B' + k, ch: e.ch, bot: e.bot })), RULES);
  const mem = s.pl.map(p => newMem(p.id));
  const nb = entries.length;
  const st = { kos: 0, self: 0, how: {}, casts: 0, ultis: 0, dmgAtKo: 0, dealt: 0, tricks: {}, uso: {}, tipos: {}, ultiBy: {}, causas: {}, picks: 0 };
  const uso = k => { st.uso[k] = (st.uso[k] ?? 0) + 1; };
  let ms = 0, bms = 0, calls = 0;
  while (!s.over && s.t < (seg + 70) * 60) {
    const inp = [];
    const b0 = performance.now();
    for (const p of s.pl) inp.push(botInput(s, w, p, mem[p.id]));
    bms += performance.now() - b0, calls += nb;
    const t0 = performance.now();
    step(s, w, inp);
    ms += performance.now() - t0;
    for (const e of s.ev) {
      switch (e.k) {
        case 'ko': {
          st.kos++; st.how[e.how] = (st.how[e.how] ?? 0) + 1; st.dmgAtKo += s.pl[e.p].dmg;
          if (e.by < 0) { st.self++; const c = (mem[e.p].mode ?? '?') + '/' + e.how; st.causas[c] = (st.causas[c] ?? 0) + 1; }
          break;
        }
        case 'cast': { st.casts++; const t = CARD[e.c].type; st.tipos[t] = (st.tipos[t] ?? 0) + 1; uso('carta:' + e.c); break; }
        case 'ulti': st.ultis++; st.ultiBy[e.u] = (st.ultiBy[e.u] ?? 0) + 1; break;
        case 'trick': st.tricks[e.n] = (st.tricks[e.n] ?? 0) + 1; break;
        case 'hook': uso(e.hit ? 'liga' : 'liga-falla'); break;
        case 'dash': uso('dash'); break;
        case 'pound': uso('picada'); break;
        case 'slide': uso('barrida'); break;
        case 'jump': uso(['salto', 'doble', 'pared', 'liga-salto'][e.j] ?? 'salto'); break;
        case 'pick': st.picks++; break;
        case 'hit': st.dealt += e.d; break;
      }
    }
  }
  const min = s.t / 3600, sd2 = standings(s);
  return { map, seed: sd, min: +min.toFixed(2), nb, st, score: sd2.order.map(p => `${p.ch}:${p.score}`).join(' '), points: s.pl.map(p => p.score),
    ops: w.T.ops.length, stepMs: ms / s.t, botMs: bms / Math.max(1, calls), unique: sd2.unique, winner: sd2.winner };
}
const chars = (sd, nb) => Array.from({ length: nb }, (_, k) => charList ? charList[k % charList.length] : CHARS[(k + sd) % CHARS.length].id);
const rep = (r) => ({ map: r.map, seed: r.seed, min: r.min, kosMin: +(r.st.kos / r.min / r.nb).toFixed(2), selfPct: Math.round(100 * r.st.self / Math.max(1, r.st.kos)),
  dmgAtKo: Math.round(r.st.dmgAtKo / Math.max(1, r.st.kos)), castsMin: +(r.st.casts / r.min / r.nb).toFixed(1), ultis: r.st.ultis, how: r.st.how, tricks: r.st.tricks,
  score: r.score, ops: r.ops, stepMs: +r.stepMs.toFixed(3), botMs: +r.botMs.toFixed(4) });

// ---- Duelo 1 contra 1 -------------------------------------------------------------------------------------------
if (arg('duelo')) {
  const [a, b] = arg('duelo').split(':').map(Number);
  let W = 0, D = 0, L = 0, diff = 0, n = 0;
  const rows = [];
  for (const map of maps) {
    let w = 0, d = 0, l = 0, df = 0;
    for (let sd = 1; sd <= seeds; sd++) for (const swap of [0, 1]) {
      const cs = [CHARS[sd % CHARS.length].id, CHARS[(sd + 2) % CHARS.length].id];
      const es = swap ? [{ ch: cs[1], bot: b }, { ch: cs[0], bot: a }] : [{ ch: cs[0], bot: a }, { ch: cs[1], bot: b }];
      const r = play(map, sd, es), mine = swap ? 1 : 0, ps = r.points[mine], po = r.points[1 - mine];
      df += ps - po;
      if (ps > po) w++; else if (ps < po) l++; else d++;
    }
    rows.push(`${map.padEnd(8)} ${DIFFS[a - 1].name} ${w}V ${d}E ${l}D  dif. media ${(df / (seeds * 2)).toFixed(1)}`);
    W += w, D += d, L += l, diff += df, n += seeds * 2;
  }
  if (json) console.log(JSON.stringify({ a, b, W, D, L, diff: diff / n }));
  else { for (const r of rows) console.log(r); console.log(`TOTAL ${DIFFS[a - 1].name} contra ${DIFFS[b - 1].name}: ${W}V ${D}E ${L}D (${(100 * W / n).toFixed(0)}% gana), dif. media ${(diff / n).toFixed(1)}`); }
  process.exit(0);
}

// ---- Partidas de varios ----------------------------------------------------------------------------------------
const nb = +arg('bots', 4);
const out = [], byMap = {};
for (const map of maps) for (let sd = 1; sd <= seeds; sd++) {
  const cs = chars(sd, nb);
  const entries = Array.from({ length: nb }, (_, k) => ({ ch: cs[k], bot: difs[k % difs.length] }));
  const r = play(map, sd, entries), x = rep(r);
  out.push(x);
  (byMap[map] ??= []).push(r);
  if (!json) console.log(`${map.padEnd(8)} s${sd} ${x.min}min KO/min/jug ${x.kosMin} solos ${x.selfPct}% %alKO ${x.dmgAtKo} cartas/min ${x.castsMin} ultis ${x.ultis} paso ${x.stepMs}ms bot ${x.botMs}ms | ${x.score} | ${JSON.stringify(x.how)} ${JSON.stringify(x.tricks)}`);
}
if (json) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

// Resumen por mapa
console.log('\nRESUMEN (promedio de las semillas)   KO/min/jug  solos%  cartas/min  ultis/min  bot ms/llamada');
const tot = { kos: 0, self: 0, bm: 0, casts: 0, ultis: 0, n: 0 }, uso = {}, tipos = {}, ultiBy = {}, causas = {};
let totMin = 0;
for (const [map, rs] of Object.entries(byMap)) {
  let bm = 0, kos = 0, self = 0, casts = 0, ultis = 0;
  for (const r of rs) {
    const m = r.min * r.nb;
    kos += r.st.kos / m, self += r.st.self, casts += r.st.casts / m, ultis += r.st.ultis / m, bm += r.botMs;
    tot.kos += r.st.kos, tot.self += r.st.self, tot.casts += r.st.casts, tot.ultis += r.st.ultis, tot.n += r.st.kos, tot.bm += r.botMs, totMin += r.min * r.nb;
    SUM(uso, r.st.uso); SUM(tipos, r.st.tipos); SUM(ultiBy, r.st.ultiBy); SUM(causas, r.st.causas);
  }
  const allKos = rs.reduce((a, r) => a + r.st.kos, 0);
  console.log(`${map.padEnd(8)} ${(kos / rs.length).toFixed(2).padStart(8)} ${(100 * self / Math.max(1, allKos)).toFixed(0).padStart(10)}% ${(casts / rs.length).toFixed(1).padStart(9)} ${(ultis / rs.length).toFixed(2).padStart(10)} ${(bm / rs.length).toFixed(4).padStart(12)}`);
}
console.log(`${'TOTAL'.padEnd(8)} ${(tot.kos / totMin).toFixed(2).padStart(8)} ${(100 * tot.self / Math.max(1, tot.kos)).toFixed(0).padStart(10)}% ${(tot.casts / totMin).toFixed(1).padStart(9)} ${(tot.ultis / totMin).toFixed(2).padStart(10)} ${(tot.bm / out.length).toFixed(4).padStart(12)}`);
if (flag('uso')) {
  const per = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / totMin).toFixed(2)}`).join('  ');
  console.log('\nUSO por bot-minuto:');
  console.log('  herramientas:', per(Object.fromEntries(Object.entries(uso).filter(([k]) => !k.startsWith('carta:')))));
  console.log('  tipos de carta:', per(tipos));
  console.log('  cartas:', per(Object.fromEntries(Object.entries(uso).filter(([k]) => k.startsWith('carta:')).map(([k, v]) => [k.slice(6), v]))));
  console.log('  ultis:', per(ultiBy));
}
if (flag('causas')) {
  console.log('\nCAÍDAS SOLAS (modo/cómo):', Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '));
}
