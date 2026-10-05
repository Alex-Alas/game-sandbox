// Arnés en Node: el piloto automático juega N partidas por modo y reporta cuánto dura.
// node games/vortice/tools/simrun.mjs [--semillas N] [--max S]
import { createSim, step, botDir } from '../src/sim.js';
import { DT } from '../src/const.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const N = arg('--semillas', 20), MAX = arg('--max', 240);

for (const mode of ['normal', 'hiper', 'diario']) {
  const times = [], scores = [];
  for (let seed = 1; seed <= N; seed++) {
    const s = createSim({ seed, mode });
    while (!s.dead && s.t < MAX) { step(s, botDir(s)); s.events.length = 0; }
    times.push(s.t); scores.push(s.score);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / N;
  console.log(`${mode.padEnd(7)} prom ${avg.toFixed(1)} s · mediana ${times[N >> 1].toFixed(1)} · mín ${times[0].toFixed(1)} · completas ${times.filter((t) => t >= MAX).length}/${N} · pts prom ${Math.round(scores.reduce((a, b) => a + b, 0) / N)}`);
}
