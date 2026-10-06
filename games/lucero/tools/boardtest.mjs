// LUCERO — prueba del motor: juega niveles generados con jugadas al azar y del bot (combos,
// especiales tocados, potenciadores, lluvia final) y revisa invariantes después de cada fase.
//   node games/lucero/tools/boardtest.mjs [--niveles N] [--semillas S]
import { createBoard, step, trySwap, tapSpecial, listMoves, findMatches, goalsDone, runBonus, useHammer, useRow, useShuffle, hasMove } from '../src/board.js';
import { bestMove } from '../src/bot.js';
import { levelDef, fillable } from '../src/levels.js';
import { S } from '../src/const.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const NL = arg('--niveles', 60), NS = arg('--semillas', 4);
let fails = 0, moves = 0;
const bad = (msg, n, seed) => { fails++; if (fails < 20) console.log(`✗ nivel ${n} semilla ${seed}: ${msg}`); };

function check(B, n, seed, ctx) {
  const ids = new Set();
  for (let i = 0; i < B.n; i++) {
    const q = B.p[i];
    if (!B.mask[i] && q) return bad(`pieza fuera del tablero (${ctx})`, n, seed);
    if (B.rock[i] && q) return bad(`pieza sobre una roca (${ctx})`, n, seed);
    if (B.frost[i] && !q) return bad(`escarcha sin gema (${ctx})`, n, seed);
    if (q) { if (ids.has(q.id)) return bad(`id repetido (${ctx})`, n, seed); ids.add(q.id); }
    if (B.mask[i] && !B.rock[i] && !q && !B.need) return bad(`hueco sin rellenar en ${i} (${ctx})`, n, seed);
  }
  if (!B.need && findMatches(B).length) return bad(`quedaron combinaciones (${ctx})`, n, seed);
  if (!B.need && !hasMove(B)) return bad(`sin jugadas tras resolver (${ctx})`, n, seed);
  for (const g of B.goals) if (g.got > g.n) return bad(`meta pasada (${ctx})`, n, seed);
}

for (let n = 1; n <= NL; n++) {
  const def = { ...levelDef(n), moves: 60 };
  if (fillable(def) >= 0) bad('la gravedad deja agujeros', n, 0);
  for (let seed = 1; seed <= NS; seed++) {
    const B = createBoard(def, seed * 7919 + n);
    check(B, n, seed, 'inicio');
    const o = { rng: seed };
    let k = 0;
    while (B.used < B.moves && !goalsDone(B) && k++ < 200) {
      const ms = listMoves(B);
      if (!ms.length) { bad('listMoves vacío', n, seed); break; }
      // mitad bot, mitad azar; de vez en cuando un potenciador
      const r = (k * 2654435761 + seed) % 100;
      let ok;
      if (r < 4) ok = useHammer(B, (k * 31) % B.n) || useShuffle(B);
      else if (r < 7) ok = useRow(B, (k * 17) % B.n) || useShuffle(B);
      else {
        const m = r < 55 ? bestMove(B, o) : ms[r % ms.length];
        ok = m.b < 0 ? tapSpecial(B, m.a) : trySwap(B, m.a, m.b);
      }
      if (!ok) continue;
      moves++;
      for (let guard = 0; B.need && guard < 500; guard++) { step(B); }
      if (B.need) { bad('la resolución no termina', n, seed); break; }
      check(B, n, seed, `jugada ${k}`);
    }
    if (goalsDone(B)) { runBonus(B); check(B, n, seed, 'lluvia final'); }
    for (let i = 0; i < B.n; i++) if (B.p[i]?.s === S.DROP && !def.drops) bad('estrella fugaz en nivel sin metas de bajar', n, seed);
  }
}
console.log(fails ? `${fails} fallas en ${moves} jugadas` : `ok · ${NL} niveles × ${NS} semillas · ${moves} jugadas`);
process.exit(fails ? 1 : 0);
