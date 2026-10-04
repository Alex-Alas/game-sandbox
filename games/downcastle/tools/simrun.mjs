#!/usr/bin/env node
/* Arnés de bots en Node: simula tramos con N bots y mide resultado, duración, golpes, KO,
   derrumbe (golpes, tiempo dentro, rubber banding) y daño a El Ojo.

   Sin opciones corre la suite de aceptación (spec F1.8) y termina con código ≠ 0 si algún
   umbral no se cumple. Con opciones corre un solo grupo:
     node games/downcastle/tools/simrun.mjs [--ciclo c] [--tramo k|a-b] [--mods derrumbe|ninguno]
       [--jefe] [--ext mini|bajada] [--semillas N] [--jugadores 2] [--seed0 S] [--humano] [--json]
   --humano: los bots hacen pausas al azar (ritmo de persona); la suite lo usa con el derrumbe. */
import { CFG } from '../src/config.js';
import { genTramo, genExterior, buildLevel } from '../src/level.js';
import { createSim, step } from '../src/sim.js';
import { botFields, botView, botThink, newBotMemory } from '../src/bots.js';

const STEP = 1 / CFG.SIM_HZ;
const args = process.argv.slice(2);
const opt = (k, def) => { const i = args.indexOf('--' + k); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };

function runOne({ seed, c, k, mods, boss, ext, players, limit, pace = '' }) {
  const tramo = ext ? genExterior(seed, c, ext) : genTramo(seed, c, k, { mods, boss });
  const lv = buildLevel(tramo);
  const f = botFields(lv);
  const roster = Array.from({ length: players }, (_, i) => ({ id: -(i + 1), name: 'bot' + i, color: '#fff', hero: 'knight_m', bot: true }));
  const sim = createSim(lv, roster);
  const mem = sim.players.map((p, i) => newBotMemory(i + (seed % 97) * 4, pace));
  mem.forEach((m, i) => { m.pauseT = ((seed * 31 + i * 17) % 10) / 10; }); // arranques distintos: rompe el determinismo
  const t0 = process.hrtime.bigint();
  let steps = 0, bossT = null;
  while (sim.status === 'play' && sim.t < limit) {
    const view = botView(sim, f);
    for (const p of sim.players) {
      const o = botThink(view, view.players[p.idx], mem[p.idx], STEP);
      p.input.tilt = o.tilt; p.input.hold = o.hold; p.events.push(...o.events);
    }
    step(sim, STEP);
    sim.fx.length = 0;
    steps++;
    if (sim.boss?.dead && bossT == null) bossT = sim.t;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const P = sim.players;
  return {
    seed, c, k: tramo.k, kind: tramo.kind, mods: tramo.mods, chunks: tramo.chunks.length - 2, ids: tramo.chunks,
    result: sim.status === 'play' ? 'timeout' : sim.status, dur: sim.t,
    hits: P.map((p) => p.stats.hits), kos: P.map((p) => p.stats.kos),
    chaseHits: sim.metrics.chaseHits, chaseIn: sim.metrics.chaseInT / Math.max(1e-6, sim.t * P.length),
    rubberLead: sim.metrics.rubberLead, rubberEase: sim.metrics.rubberEase,
    bossDmg: sim.metrics.bossDmg, bossT, stepMs: ms / Math.max(1, steps),
  };
}

function group(name, specs, players) {
  const rows = specs.map((s) => runOne({ players, limit: 240, ...s }));
  const n = rows.length, mean = (f) => rows.reduce((a, r) => a + f(r), 0) / n;
  const sum = {
    name, n,
    won: rows.filter((r) => r.result === 'won').length / n,
    wiped: rows.filter((r) => r.result === 'wiped').length / n,
    timeout: rows.filter((r) => r.result === 'timeout').length / n,
    dur: mean((r) => r.dur),
    hits: mean((r) => r.hits.reduce((a, b) => a + b, 0) / players),
    kos: mean((r) => r.kos.reduce((a, b) => a + b, 0) / players),
    chaseHits: mean((r) => r.chaseHits / players),
    chaseIn: mean((r) => r.chaseIn),
    rubber: mean((r) => r.rubberLead + r.rubberEase),
    bossDmg: mean((r) => r.bossDmg),
    bossWin120: rows.filter((r) => r.bossT != null && r.bossT <= 120 && r.result === 'won').length / n,
    stepMs: mean((r) => r.stepMs),
  };
  return { sum, rows };
}

const pct = (v) => (v * 100).toFixed(0).padStart(4) + '%';
function table(groups) {
  console.log('grupo                     n   gana  cae  tiempo  dur s  golpes  KO   derr.golpes  dentro  rubber  daño jefe  paso ms');
  for (const { sum: s } of groups) {
    console.log(`${s.name.padEnd(24)}${String(s.n).padStart(3)} ${pct(s.won)} ${pct(s.wiped)} ${pct(s.timeout)} ${s.dur.toFixed(1).padStart(6)} ${s.hits.toFixed(2).padStart(7)} ${s.kos.toFixed(2).padStart(5)} ${s.chaseHits.toFixed(2).padStart(11)} ${pct(s.chaseIn).padStart(7)} ${s.rubber.toFixed(1).padStart(7)} ${s.bossDmg.toFixed(1).padStart(10)} ${s.stepMs.toFixed(4).padStart(8)}`);
  }
}

const N = +opt('semillas', 50), players = +opt('jugadores', 2), seed0 = +opt('seed0', 1000);
const seeds = Array.from({ length: N }, (_, i) => seed0 + i * 7919);
const json = !!opt('json', false);
const custom = ['ciclo', 'tramo', 'mods', 'jefe', 'humano', 'ext'].some((k) => args.includes('--' + k));
const human = opt('humano', false) ? 'humano' : '';

if (custom) {
  const c = +opt('ciclo', 0), boss = !!opt('jefe', false), ext = opt('ext', null);
  const tr = String(opt('tramo', '0'));
  const [a, b] = tr.includes('-') ? tr.split('-').map(Number) : [+tr, +tr];
  const m = opt('mods', null);
  const mods = m == null ? undefined : (m === 'ninguno' ? [] : String(m).split(','));
  const specs = [];
  for (let k = a; k <= b; k++) for (const seed of seeds) specs.push({ seed, c, k, mods, boss, ext, pace: human });
  const g = group((ext ? `ciclo ${c} exterior ${ext}` : boss ? `ciclo ${c} jefe` : `ciclo ${c} tramo ${tr}${mods ? ' ' + (mods.join(',') || 'sin mods') : ''}`) + (human ? ' (humano)' : ''), specs, players);
  if (json) console.log(JSON.stringify(g, null, 1));
  else {
    table([g]);
    for (const r of g.rows) if (r.result !== 'won') console.log(' ', r.seed, r.result, r.dur.toFixed(1), (r.ids || []).join(','));
  }
  process.exit(0);
}

// Suite de aceptación (spec F1.8)
const all = (c, ks, mods, boss, pace) => ks.flatMap((k) => seeds.map((seed, i) => ({ seed, c, k: typeof k === 'function' ? k(i) : k, mods, boss, pace })));
const G = [
  group('c0 normales k0-3', all(0, [0, 1, 2, 3], []), players),
  group('c0 derrumbe (humano)', all(0, [(i) => 2 + (i % 2)], ['derrumbe'], false, 'humano'), players),
  group('c0 jefe El Ojo', all(0, [4], [], true), players),
  group('c1 k0-3', all(1, [0, 1, 2, 3]), players),
  group('exterior mini c0-1', [0, 1].flatMap((c) => seeds.map((seed) => ({ seed, c, ext: 'mini' }))), players),
  group('exterior bajada c0-1', [0, 1].flatMap((c) => seeds.map((seed) => ({ seed, c, ext: 'bajada' }))), players),
];
const [nor, der, jefe, c1, mini, baj] = G.map((g) => g.sum);
const stepMs = Math.max(...G.map((g) => g.sum.stepMs));
const checks = [
  ['c0 normales ≥ 90 % completados', nor.won >= 0.9],
  ['derrumbe ≥ 90 % completados', der.won >= 0.9],
  ['derrumbe < 5 % del tiempo dentro', der.chaseIn < 0.05],
  ['derrumbe ≤ 1 golpe por jugador (media)', der.chaseHits <= 1],
  ['El Ojo ≥ 80 % vencido en ≤ 120 s', jefe.bossWin120 >= 0.8],
  ['c1 ≥ 80 % completados', c1.won >= 0.8],
  ['exterior mini ≥ 90 % completados', mini.won >= 0.9],
  ['exterior bajada ≥ 85 % completados', baj.won >= 0.85],
  ['paso ≲ 0,05 ms', stepMs <= 0.05],
];
if (json) console.log(JSON.stringify({ groups: G.map((g) => g.sum), checks }, null, 1));
else {
  table(G);
  console.log('');
  for (const [name, ok] of checks) console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}`);
}
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
