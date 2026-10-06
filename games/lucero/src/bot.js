// LUCERO — jugador automático: elige la jugada que más avanza las metas. Sirve para la pista
// (`hint`), el piloto automático de depuración y para calibrar los niveles en Node.
// No espía el relleno: evalúa cada jugada con las gemas nuevas inertes (no combinan), como ve
// el tablero una persona; las cascadas con lo que ya está sí cuentan.
import { cloneBoard, trySwap, tapSpecial, settle, listMoves, goalsDone } from './board.js';
import { S, rnd } from './const.js';

const SPV = { [S.H]: 3, [S.V]: 3, [S.NOVA]: 5, [S.FLY]: 3.5, [S.STAR]: 8 };
const GW = { color: 1, fog: 1.6, rock: 2, frost: 1.6, drop: 25 };

function inventory(B) {
  let v = 0;
  for (const q of B.p) if (q && SPV[q.s]) v += SPV[q.s];
  return v;
}
function progress(B) {
  let v = 0, drop = false;
  for (const g of B.goals) { v += Math.min(g.got, g.n) * (GW[g.t] || 1); if (g.t === 'drop' && g.got < g.n) drop = true; }
  // las estrellas fugaces valen por lo que bajaron
  if (drop) for (let i = 0; i < B.n; i++) if (B.p[i]?.s === S.DROP) v += ((i / B.W) | 0) * 1.6;
  return v;
}

export function evalMove(B, m, base = { prog: progress(B), inv: inventory(B) }) {
  const C = cloneBoard(B, { quiet: true, inert: true });
  if (!(m.b < 0 ? tapSpecial(C, m.a) : trySwap(C, m.a, m.b))) return -Infinity;
  settle(C);
  if (goalsDone(C)) return 1e4 - C.used;
  const left = B.moves - B.used;
  const invW = left <= 2 ? 0 : 0.8;
  return progress(C) - base.prog + (inventory(C) - base.inv) * invW + (C.score - B.score) / 4000;
}

// La mejor jugada (empates al azar con `o.rng`); null si no hay
export function bestMove(B, o = { rng: 1 }) {
  const moves = listMoves(B);
  if (!moves.length) return null;
  const base = { prog: progress(B), inv: inventory(B) };
  let best = null, bv = -Infinity;
  for (const m of moves) {
    const v = evalMove(B, m, base) + rnd(o) * 0.01;
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}
