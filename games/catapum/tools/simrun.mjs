// Arnés en Node: partidas solo de bots para ver que el juego fluye (KOs por minuto, cuántos se caen solos, cartas,
// trucos) y medir el costo de un paso. Uso:
//   node games/catapum/tools/simrun.mjs [--mapa id] [--bots 4] [--dif 1-4] [--seg 120] [--semillas 4] [--json]
import { newState, step, standings } from '../src/sim/sim.ts';
import { botInput, newMem } from '../src/sim/bot.ts';
import { MAPS } from '../src/sim/maps.ts';
import { CHARS } from '../src/sim/chars.ts';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const maps = arg('mapa') ? [arg('mapa')] : MAPS.map(m => m.id);
const nb = +arg('bots', 4), dif = +arg('dif', 3), seg = +arg('seg', 120), seeds = +arg('semillas', 3), json = process.argv.includes('--json');
const out = [];
for (const map of maps) for (let sd = 1; sd <= seeds; sd++) {
  const entries = Array.from({ length: nb }, (_, k) => ({ name: 'B' + k, ch: CHARS[(k + sd) % CHARS.length].id, bot: dif }));
  const { s, w } = newState(map, sd * 7717, entries, { time: seg, teams: false, friendly: false, crates: 11, infinite: false, startDmg: 0 });
  const mem = s.pl.map(p => newMem(p.id));
  const st = { kos: 0, self: 0, how: {}, casts: 0, tricks: {}, ultis: 0, dmgAtKo: 0 };
  let ms = 0;
  while (!s.over && s.t < (seg + 70) * 60) {
    const inp = s.pl.map(p => botInput(s, w, p, mem[p.id]));
    const t0 = performance.now();
    step(s, w, inp);
    ms += performance.now() - t0;
    for (const e of s.ev) {
      if (e.k === 'ko') { st.kos++; if (e.by < 0) st.self++; st.how[e.how] = (st.how[e.how] ?? 0) + 1; st.dmgAtKo += s.pl[e.p].dmg; }
      if (e.k === 'cast') st.casts++;
      if (e.k === 'ulti') st.ultis++;
      if (e.k === 'trick') st.tricks[e.n] = (st.tricks[e.n] ?? 0) + 1;
    }
  }
  const min = s.t / 3600, sd2 = standings(s);
  const r = { map, seed: sd, min: +min.toFixed(2), kosMin: +(st.kos / min / nb).toFixed(2), selfPct: Math.round(100 * st.self / Math.max(1, st.kos)),
    dmgAtKo: Math.round(st.dmgAtKo / Math.max(1, st.kos)), castsMin: +(st.casts / min / nb).toFixed(1), ultis: st.ultis, how: st.how, tricks: st.tricks,
    score: sd2.order.map(p => `${p.ch}:${p.score}`).join(' '), ops: w.T.ops.length, stepMs: +(ms / s.t).toFixed(3) };
  out.push(r);
  if (!json) console.log(`${map.padEnd(8)} s${sd} ${r.min}min KO/min/jug ${r.kosMin} solos ${r.selfPct}% %alKO ${r.dmgAtKo} cartas/min ${r.castsMin} ultis ${r.ultis} paso ${r.stepMs}ms | ${r.score} | ${JSON.stringify(r.how)} ${JSON.stringify(r.tricks)}`);
}
if (json) console.log(JSON.stringify(out, null, 1));
