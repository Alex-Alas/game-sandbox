// LUCERO — arnés en Node: calibra niveles con el bot y revisa que todos se puedan armar.
//   node games/lucero/tools/simrun.mjs [--desde a] [--hasta b] [--corridas R]   informe por nivel
//   node games/lucero/tools/simrun.mjs --calibrar [--hasta N]                     reescribe src/cal.js
import { writeFileSync } from 'node:fs';
import { calibrate, makeLevel, levelDef, GEN_V, TIERS, RUNS, botRun, fromRuns } from '../src/levels.js';
import { hash } from '../src/const.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const A = arg('--desde', 1), B = arg('--hasta', 40), R = arg('--corridas', RUNS);
const CAL = process.argv.includes('--calibrar');

const t0 = performance.now();
const rows = [];
for (let n = CAL ? 1 : A; n <= B; n++) {
  const c = calibrate(n, R);
  rows.push(c);
  const def = makeLevel(n, c);
  // verificación independiente: otras semillas con los movimientos fijados
  const rs = [];
  for (let s = 1; s <= (CAL ? 0 : 12); s++) rs.push(botRun(def, hash(`chk:${n}:${s}`)));
  const wins = rs.filter((r) => r.need <= def.moves).length;
  const goals = def.goals.map((g) => `${g.t}${g.t === 'color' ? g.c : ''}:${g.n}`).join(' ');
  console.log(`${String(n).padStart(3)} v${c[0]} amp ${c[1]} ${def.W}x${def.H} ${def.colors}c mov ${String(def.moves).padStart(2)} ★★ ${c[3]} ★★★ ${c[4]} · gana ${CAL ? "-" : wins}/12 · ${TIERS[def.tier].name || '-'} · ${goals}`);
}
console.log(`${((performance.now() - t0) / 1000).toFixed(1)} s`);
if (CAL) {
  const body = rows.map((r) => `[${r.join(',')}]`).join(',\n  ');
  writeFileSync(new URL('../src/cal.js', import.meta.url), `// LUCERO — calibración precalculada (generada por tools/simrun.mjs --calibrar; no editar a mano).\n// Por nivel n (índice n − 1): [variante, amp, movimientos, puntos 2★, puntos 3★].\nexport const CAL_V = ${GEN_V};\nexport const CAL = [\n  ${body},\n];\n`);
  console.log(`src/cal.js: ${rows.length} niveles`);
}
