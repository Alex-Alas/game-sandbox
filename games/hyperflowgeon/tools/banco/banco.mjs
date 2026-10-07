// Banco del Patio: los cuatro héroes en ocho recorridos, con la liga como está hoy y con el tope propuesto (decisión A
// de la propuesta de arquetipos, docs/superpowers/specs/2026-10-07-hyperflowgeon-arquetipos-propuesta.md).
//   node games/hyperflowgeon/tools/banco/banco.mjs [--honda] [--envolvente] [--n 2500]
// Una búsqueda ciega con semilla fija elige la mejor ejecución por héroe y recorrido: mide techos, no es un bot jugable.
import { init, step, DT } from '../../src/sim/sim.ts';
import { DEFAULTS as C } from '../../src/sim/params.ts';
import { COURSES, HEROES, REGLAS, search } from './prototipos.mjs';

const arg = process.argv.slice(2), n = arg.indexOf('--n');
if (n >= 0) REGLAS.N = +arg[n + 1];
const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
const H = Object.keys(HEROES), base = Object.keys(COURSES);
const fmt = t => t === Infinity ? '✕' : t.toFixed(2);

function bench(nombre, reglas) {
  Object.assign(REGLAS, reglas);
  const rows = {}, sc = Object.fromEntries(H.map(h => [h, []])), wins = Object.fromEntries(H.map(h => [h, 0]));
  for (const c of base) {
    const t = Object.fromEntries(H.map(h => [h, search(h, c).t])), best = Math.min(...Object.values(t));
    rows[c] = Object.fromEntries(H.map(h => [h, fmt(t[h])]));
    for (const h of H) { sc[h].push(t[h] === Infinity ? 0 : best / t[h]); if (t[h] === best) wins[h]++; }
  }
  rows['puntaje · gana'] = Object.fromEntries(H.map(h => [h, `${(sc[h].reduce((a, b) => a + b) / sc[h].length).toFixed(2)} · ${wins[h]}`]));
  console.log(`\n${nombre}`);
  console.table(rows);
}
bench('Liga como está hoy', { SWING_ONLY: false, V_PULL: 0, BELOW: false });
bench('Con el tope propuesto (hacia anclas bajo la mano, hasta RUN; devolución solo de columpio)', { SWING_ONLY: true, V_PULL: C.RUN, BELOW: true });

// La honda con la sim tal cual: en el aire, enganchar el piso adelante y soltar antes de llegar
if (arg.includes('--honda')) {
  const w = { spawn: [0, 0], rects: [R(-10, -2, 2000, 0)] };
  let best = null;
  for (const ahead of [6, 8, 10, 11.5]) for (const hold of [4, 8, 12, 16, 20, 25, 30]) {
    const s = init(w); let held = 0, vmax = 0, refunds = 0, t120 = null;
    for (let k = 0; k < 600; k++) {
      const p = s.p, r0 = p.refundT;
      held = p.hook ? held + 1 : 0;
      const hook = (!p.hook && !p.ground && p.vy < 0 && p.charge >= 1) || (p.hook && held < hold);
      step(s, w, { x: 1, jump: p.ground, hook, ax: ahead, ay: -(p.y + 1.2) }, C);
      if (s.p.refundT !== r0) refunds++;
      vmax = Math.max(vmax, Math.abs(s.p.vx));
      if (t120 === null && s.p.x >= 120) t120 = s.t * DT;
    }
    if (t120 !== null && (!best || t120 < best.t120)) best = { ahead, hold, t120: +t120.toFixed(2), vmax: +vmax.toFixed(1), refunds };
  }
  console.log('\nLa honda (sim actual):', best);
}

// Envolvente: foso más ancho sin nada arriba y pared más alta que sube cada héroe (con las reglas propuestas)
if (arg.includes('--envolvente')) {
  const can = (h, key) => search(h, key, 900).t < Infinity, out = {};
  for (const h of H) {
    let lo = 6, hi = 140;
    while (hi - lo > 2) {
      const W = (lo + hi) / 2;
      COURSES.tmp = { w: { spawn: [0, 0], rects: [R(-40, -2, 20, 0), R(20 + W, -2, 400, 0), R(-42, -2, -40, 30)] }, done: p => p.x >= 22 + W && p.y >= -0.1, T: 12 };
      if (can(h, 'tmp')) lo = W; else hi = W;
    }
    let lo2 = 1, hi2 = 40;
    while (hi2 - lo2 > 1) {
      const Hh = (lo2 + hi2) / 2;
      COURSES.tmp = { w: { spawn: [0, 0], rects: [R(-40, -2, 200, 0), R(40, 0, 60, Hh), R(-42, -2, -40, 30)] }, done: p => p.x >= 40 && p.y >= Hh - 0.1 && p.ground, T: 12 };
      if (can(h, 'tmp')) lo2 = Hh; else hi2 = Hh;
    }
    out[h] = { 'foso máx m': Math.round(lo), 'pared máx m': Math.round(lo2) };
  }
  delete COURSES.tmp;
  console.log('\nEnvolvente (reglas propuestas)');
  console.table(out);
}
