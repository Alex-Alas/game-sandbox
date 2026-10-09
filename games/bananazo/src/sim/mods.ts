// Los módulos de la bomba: cómo nacen (de la semilla), qué hace cada acción del CIEGO, qué corre solo (los de caos) y la
// solución (para las pruebas, el piloto automático de la práctica y la grabación de la portada).
// Lo que ve cada uno: los colores, luces y pantallas, solo el SORDO; el braille y el calor, solo el CIEGO (con la mano);
// los sonidos chicos de la bomba, solo el CIEGO; las tablas, solo el MUDO.
import { int, range, shuffle, type Rng } from './rng.ts';
import { COLORS, LIGHTS, DXY } from './const.ts';
import { evalWire, open, MAZE_N, type Tables } from './tables.ts';

export type Ev = { e: string, m?: number, v?: number, s?: string };
export type Act = { m: number, a: string, v?: number };
export type MAct = { a: string, v?: number };

export type Mod =
  | { k: 'cables', done: boolean, wires: number[], cut: boolean[], led: number }
  | { k: 'calc', done: boolean, a: number, op: number, b: number, stage: number, typed: string, led: number }
  | { k: 'dir', done: boolean, stage: number, n: number[], led: number[] }
  | { k: 'slide', done: boolean, col: number[], pos: number[] }
  | { k: 'bells', done: boolean, col: number[], num: number[], ring: number, prog: number }
  | { k: 'piano', done: boolean, oct: number, led: number, prog: number }
  | { k: 'dial', done: boolean, stage: number, sym: number[], ptr: number, buzz: number[], col: number[] }
  | { k: 'simon', done: boolean, stage: number, prog: number, hot: number[], col: number[] }
  | { k: 'morse', done: boolean, d: number[], ring: number[], order: number[], typed: string }
  | { k: 'maze', done: boolean, n: number, x: number, y: number, gx: number, gy: number }
  | { k: 'switch', done: boolean, led: number[], num: number[], up: boolean[] }
  | { k: 'press', done: boolean, p: number }
  | { k: 'alarm', done: boolean, next: number, on: boolean, left: number, hot: boolean[] };
export type Kind = Mod['k'];
type Of<K extends Kind> = Extract<Mod, { k: K }>;

export type Ctx = { tb: Tables, r: Rng, chaos: number, strike(): void, ok(): void, ev(e: Ev): void };
type Def<K extends Kind> = {
  name: string, tier: 1 | 2 | 3, chaos?: boolean,
  gen(r: Rng): Of<K>,
  act(m: Of<K>, a: string, v: number, c: Ctx): void,
  tick?(m: Of<K>, dt: number, c: Ctx): void,
  solve(m: Of<K>, tb: Tables): MAct[],
};

const snd = (c: Ctx, s: string, v?: number) => c.ev(v == null ? { e: 'snd', s } : { e: 'snd', s, v });
const stage = (c: Ctx) => c.ev({ e: 'stage' });
// Teclear `ans` desde lo que ya está escrito (borra solo si lo escrito no es el principio de la respuesta)
const digits = (typed: string, ans: string): MAct[] => {
  const keep = ans.startsWith(typed);
  return [...(keep ? [] : [{ a: 'clr' }]), ...[...ans.slice(keep ? typed.length : 0)].map(d => ({ a: 'key', v: +d })), { a: 'ok' }];
};
function typeKey(m: { typed: string }, a: string, v: number, c: Ctx, max = 3) {
  if (a === 'key' && v >= 0 && v <= 9) { if (m.typed.length < max) m.typed += v; snd(c, 'key', v); return true; }
  if (a === 'clr') { m.typed = ''; snd(c, 'key', -1); return true; }
  return false;
}

export const calcResult = (m: Of<'calc'>) => m.op === 0 ? m.a + m.b : m.op === 1 ? m.a - m.b : m.a * m.b;
export const OPS = ['+', '−', '×'];
export const wireAnswer = (m: Of<'cables'>, tb: Tables) => evalWire(tb.cables[m.led][m.wires.length - 3], m.wires);
export const simonAnswer = (m: Of<'simon'>, tb: Tables, s: number) => tb.simon[s][m.col[m.hot[s]]];
export const morseAnswer = (m: Of<'morse'>) => m.order.map(c => m.d[m.ring.indexOf(c)]).join('');
export const SIMON_N = 3, DIR_N = 2, DIAL_N = 2, ALARM_T = 12;

export function mazePath(mz: Tables['maze'][number], x: number, y: number, gx: number, gy: number): number[] {
  const N = MAZE_N, prev = new Map<number, [number, number]>(), q = [y * N + x];
  prev.set(q[0], [-1, -1]);
  while (q.length) {
    const c = q.shift()!, cx = c % N, cy = (c / N) | 0;
    if (cx === gx && cy === gy) break;
    for (let d = 0; d < 4; d++) {
      if (!open(mz, cx, cy, d)) continue;
      const n = (cy + DXY[d][1]) * N + cx + DXY[d][0];
      if (!prev.has(n)) { prev.set(n, [c, d]); q.push(n); }
    }
  }
  const out: number[] = [];
  for (let c = gy * N + gx; prev.get(c)![0] >= 0; c = prev.get(c)![0]) out.unshift(prev.get(c)![1]);
  return out;
}

const DEFS: { [K in Kind]: Def<K> } = {
  cables: {
    name: 'CABLES', tier: 1,
    gen(r) {
      const n = 3 + int(r, 4);
      let wires: number[];
      do wires = Array.from({ length: n }, () => int(r, COLORS.length)); while (new Set(wires).size < 2);
      return { k: 'cables', done: false, wires, cut: wires.map(() => false), led: int(r, LIGHTS) };
    },
    act(m, a, v, c) {
      if (a !== 'cut' || !(v >= 0 && v < m.wires.length) || m.cut[v]) return;
      m.cut[v] = true;
      snd(c, 'cut');
      if (v === wireAnswer(m, c.tb)) c.ok(); else c.strike();
    },
    solve: (m, tb) => [{ a: 'cut', v: wireAnswer(m, tb) }],
  },
  calc: {
    name: 'CALCULADORA', tier: 1,
    gen(r) {
      const op = int(r, 3);
      let a: number, b: number;
      if (op === 0) a = 2 + int(r, 48), b = 2 + int(r, 48);
      else if (op === 1) a = 10 + int(r, 90), b = 1 + int(r, a - 1);
      else a = 2 + int(r, 11), b = 2 + int(r, 8);
      return { k: 'calc', done: false, a, op, b, stage: 0, typed: '', led: int(r, LIGHTS) };
    },
    act(m, a, v, c) {
      if (m.stage === 0 && typeKey(m, a, v, c)) return;
      if (a === 'ok' && m.stage === 0) {
        if (m.typed !== '' && +m.typed === calcResult(m)) { m.stage = 1; stage(c); } else { m.typed = ''; c.strike(); }
      } else if (a === 'btn' && v >= 0 && v < 4) {
        snd(c, 'btn');
        if (m.stage === 1 && v === c.tb.calc[m.led][calcResult(m) % 2]) c.ok(); else c.strike();
      } else if (a === 'key') snd(c, 'key', v);
    },
    solve: (m, tb) => [...(m.stage === 0 ? digits(m.typed, String(calcResult(m))) : []), { a: 'btn', v: tb.calc[m.led][calcResult(m) % 2] }],
  },
  dir: {
    name: 'FLECHAS', tier: 1,
    gen: r => ({ k: 'dir', done: false, stage: 0, n: Array.from({ length: DIR_N }, () => 1 + int(r, 6)), led: Array.from({ length: DIR_N }, () => int(r, LIGHTS)) }),
    act(m, a, v, c) {
      if (a !== 'dir' || !(v >= 0 && v < 4)) return;
      snd(c, 'btn');
      if (v !== c.tb.dir[m.n[m.stage] - 1][m.led[m.stage]]) { c.strike(); return; }
      if (++m.stage >= DIR_N) c.ok(); else stage(c);
    },
    solve: (m, tb) => m.n.slice(m.stage).map((n, j) => ({ a: 'dir', v: tb.dir[n - 1][m.led[m.stage + j]] })),
  },
  slide: {
    name: 'CORREDERAS', tier: 1,
    gen(r) { return { k: 'slide', done: false, col: shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, 3), pos: [0, 1, 2].map(() => int(r, 3)) }; },
    act(m, a, v, c) {
      if (a === 'set' && v >= 0 && v < 9) { const i = (v / 3) | 0; if (m.pos[i] !== v % 3) { m.pos[i] = v % 3; snd(c, 'slide'); } return; }
      if (a !== 'ok') return;
      snd(c, 'btn');
      if (m.col.every((col, i) => c.tb.slide[col][i] === m.pos[i])) c.ok(); else c.strike();
    },
    solve: (m, tb) => [...m.col.flatMap((col, i) => tb.slide[col][i] === m.pos[i] ? [] : [{ a: 'set', v: i * 3 + tb.slide[col][i] }]), { a: 'ok' }],
  },
  bells: {
    name: 'TIMBRES', tier: 2,
    gen: r => ({ k: 'bells', done: false, col: Array.from({ length: 9 }, () => int(r, LIGHTS)), num: shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]), ring: int(r, 9), prog: 0 }),
    act(m, a, v, c) {
      if (a !== 'press' || !(v >= 0 && v < 9)) return;
      snd(c, 'btn', v);
      const seq = c.tb.bells[m.num[m.ring] - 1][m.col[m.ring]];
      if (v !== seq[m.prog]) { m.prog = 0; c.strike(); return; }
      if (++m.prog >= seq.length) c.ok(); else stage(c);
    },
    solve: (m, tb) => tb.bells[m.num[m.ring] - 1][m.col[m.ring]].slice(m.prog).map(v => ({ a: 'press', v })),
  },
  piano: {
    name: 'PIANO', tier: 2,
    gen: r => ({ k: 'piano', done: false, oct: 1 + int(r, 3), led: int(r, LIGHTS), prog: 0 }),
    act(m, a, v, c) {
      if (a !== 'key' || !(v >= 0 && v < 7)) return;
      c.ev({ e: 'note', v, s: String(m.oct) });
      const mel = c.tb.piano[m.oct - 1][m.led];
      if (v !== mel[m.prog]) { m.prog = 0; c.strike(); return; }
      if (++m.prog >= mel.length) c.ok();
    },
    solve: (m, tb) => tb.piano[m.oct - 1][m.led].slice(m.prog).map(v => ({ a: 'key', v })),
  },
  dial: {
    name: 'RULETA', tier: 2,
    gen(r) {
      const b0 = int(r, 6);
      let b1 = int(r, 5); if (b1 >= b0) b1++;
      return { k: 'dial', done: false, stage: 0, sym: shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).slice(0, 6), ptr: int(r, 6), buzz: [b0, b1], col: shuffle(r, [0, 1, 2, 3]) };
    },
    act(m, a, v, c) {
      if (a === 'turn' && (v === 1 || v === -1)) { m.ptr = (m.ptr + v + 6) % 6; snd(c, 'turn'); return; }
      if (a !== 'btn' || !(v >= 0 && v < 4)) return;
      snd(c, 'btn');
      if (m.col[v] !== c.tb.dial[m.sym[m.buzz[m.stage]]]) { c.strike(); return; }
      if (++m.stage >= DIAL_N) c.ok(); else stage(c);
    },
    solve: (m, tb) => m.buzz.slice(m.stage).map(b => ({ a: 'btn', v: m.col.indexOf(tb.dial[m.sym[b]]) })),
  },
  simon: {
    name: 'MONO DICE', tier: 3,
    gen: r => ({ k: 'simon', done: false, stage: 0, prog: 0, hot: Array.from({ length: SIMON_N }, () => int(r, 4)), col: shuffle(r, [0, 1, 2, 3]) }),
    act(m, a, v, c) {
      if (a !== 'btn' || !(v >= 0 && v < 4)) return;
      snd(c, 'btn', v);
      if (m.col[v] !== simonAnswer(m, c.tb, m.prog)) { m.prog = 0; c.strike(); return; }
      if (++m.prog <= m.stage) return;
      m.prog = 0;
      if (++m.stage >= SIMON_N) c.ok(); else stage(c);
    },
    solve(m, tb) {
      const out: MAct[] = [];
      for (let s = m.stage; s < SIMON_N; s++) for (let j = s === m.stage ? m.prog : 0; j <= s; j++) out.push({ a: 'btn', v: m.col.indexOf(simonAnswer(m, tb, j)) });
      return out;
    },
  },
  morse: {
    name: 'MORSE', tier: 3,
    gen(r) {
      const ring = shuffle(r, [0, 1, 2, 3]).slice(0, 3);
      return { k: 'morse', done: false, d: shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3), ring, order: shuffle(r, ring), typed: '' };
    },
    act(m, a, v, c) {
      if (typeKey(m, a, v, c) || a !== 'ok') return;
      snd(c, 'btn');
      if (m.typed === morseAnswer(m)) c.ok(); else { m.typed = ''; c.strike(); }
    },
    solve: m => digits(m.typed, morseAnswer(m)),
  },
  maze: {
    name: 'LABERINTO', tier: 3,
    gen(r) {
      const n = 1 + int(r, 6);
      let x: number, y: number, gx: number, gy: number;
      do x = int(r, 5), y = int(r, 5), gx = int(r, 5), gy = int(r, 5); while (Math.abs(x - gx) + Math.abs(y - gy) < 4);
      return { k: 'maze', done: false, n, x, y, gx, gy };
    },
    act(m, a, v, c) {
      if (a !== 'dir' || !(v >= 0 && v < 4)) return;
      if (!open(c.tb.maze[m.n - 1], m.x, m.y, v)) { snd(c, 'wall'); c.strike(); return; }
      m.x += DXY[v][0], m.y += DXY[v][1];
      snd(c, 'btn');
      if (m.x === m.gx && m.y === m.gy) c.ok();
    },
    solve: (m, tb) => mazePath(tb.maze[m.n - 1], m.x, m.y, m.gx, m.gy).map(v => ({ a: 'dir', v })),
  },
  switch: {
    name: 'PALANCAS', tier: 3,
    gen(r) {
      const m: Of<'switch'> = { k: 'switch', done: false, led: [0, 1, 2, 3].map(() => int(r, LIGHTS)), num: [0, 1, 2, 3].map(() => 1 + int(r, 6)), up: [0, 1, 2, 3].map(() => int(r, 2) === 1) };
      return m;
    },
    act(m, a, v, c) {
      if (a === 'flip' && v >= 0 && v < 4) { m.up[v] = !m.up[v]; snd(c, 'flip'); return; }
      if (a !== 'ok') return;
      snd(c, 'btn');
      if (m.up.every((u, i) => u === c.tb.sw[m.led[i]][m.num[i] - 1])) c.ok(); else c.strike();
    },
    solve: (m, tb) => [...m.up.flatMap((u, i) => u === tb.sw[m.led[i]][m.num[i] - 1] ? [] : [{ a: 'flip', v: i }]), { a: 'ok' }],
  },
  // ---- Caos: no se desactivan; hay que atenderlos hasta que caiga el último módulo de los otros ----
  press: {
    name: 'PRESIÓN', tier: 2, chaos: true,
    gen: () => ({ k: 'press', done: false, p: 0.15 }),
    act(m, a, _v, c) { if (a === 'pump') { m.p = Math.max(0, m.p - 0.12); snd(c, 'pump'); } },
    tick(m, dt, c) {
      m.p += dt * c.chaos / 50;
      if (m.p >= 1) { m.p = 0.35; c.ev({ e: 'vent' }); c.strike(); }
    },
    solve: m => m.p > 0.45 ? [{ a: 'pump' }] : [],
  },
  alarm: {
    name: 'ALARMA', tier: 3, chaos: true,
    gen: r => ({ k: 'alarm', done: false, next: range(r, 22, 34), on: false, left: 0, hot: Array(6).fill(false) }),
    act(m, a, v, c) {
      if (a !== 'btn' || !(v >= 0 && v < 6)) return;
      snd(c, 'btn', v);
      if (!m.on || !m.hot[v]) return;
      m.hot[v] = false;
      if (!m.hot.some(Boolean)) { m.on = false; m.next = range(c.r, 28, 48) / c.chaos; c.ev({ e: 'alarm', v: 0 }); }
    },
    tick(m, dt, c) {
      if (!m.on) {
        if ((m.next -= dt) > 0) return;
        m.on = true, m.left = ALARM_T;
        m.hot = Array(6).fill(false);
        for (const k of shuffle(c.r, [0, 1, 2, 3, 4, 5]).slice(0, 2 + int(c.r, 2))) m.hot[k] = true;
        c.ev({ e: 'alarm', v: 1 });
      } else if ((m.left -= dt) <= 0) {
        m.on = false, m.hot = Array(6).fill(false), m.next = range(c.r, 28, 48) / c.chaos;
        c.ev({ e: 'alarm', v: 0 });
        c.strike();
      }
    },
    solve: m => m.on ? m.hot.flatMap((h, v) => h ? [{ a: 'btn', v }] : []) : [],
  },
};

export const KINDS = Object.keys(DEFS) as Kind[];
export const isKind = (k: unknown): k is Kind => typeof k === 'string' && k in DEFS;
export const modName = (k: Kind) => DEFS[k].name;
export const modTier = (k: Kind) => DEFS[k].tier;
export const isChaos = (k: Kind) => !!DEFS[k].chaos;
export const genMod = (k: Kind, r: Rng): Mod => DEFS[k].gen(r);
export function actMod(m: Mod, a: string, v: number, c: Ctx) { (DEFS[m.k] as Def<Kind>).act(m as never, a, v, c); }
export function tickMod(m: Mod, dt: number, c: Ctx) { (DEFS[m.k] as Def<Kind>).tick?.(m as never, dt, c); }
export const solveMod = (m: Mod, tb: Tables): MAct[] => m.done ? [] : (DEFS[m.k] as Def<Kind>).solve(m as never, tb);
