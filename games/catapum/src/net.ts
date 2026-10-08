// Online: salas por código sobre el mismo relay que DOWNCASTLE (plugin de Vite en desarrollo, Worker en producción).
// El anfitrión corre la simulación (con los bots) y es la verdad; los invitados mandan sus entradas y dibujan.
// Protocolo (JSON):
//   invitado → anfitrión: hello {g, v, name, ch, deck} · pick {name, ch, deck} · in {q: seq, f: [[x, y, bits, ax, ay, cast]…]} a 30 Hz
//   anfitrión → todos: lobby {g, v, cfg, seats, max} · start {map, seed, seats, rules, c} · st (estado compacto a 20 Hz con los
//   eventos y los cortes del terreno desde el anterior) · tolobby
//   anfitrión → uno: me {k, a, p} (su personaje completo y la última entrada aplicada) · sync {ops} (terreno al entrar tarde)
// El invitado dibuja a los demás 100 ms en el pasado (interpolando) y predice su propio personaje con la misma física
// (movePlayer), reconciliando con cada `me`: vuelve al estado del anfitrión y repite las entradas que faltan.
import { NEVER, NO_INPUT, newState, type Input, type State, type World, type Pl, type Proj, type Prop, type Zone, type Beam, type Ev, type HzState } from './sim/sim.ts';
import { movePlayer } from './sim/move.ts';
import { applyOp, type Op } from './sim/terrain.ts';
import type { Rules, Cfg } from './sim/params.ts';
import type { Seat } from './game.ts';

export const GAME = 'catapum', PROTO = 1;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // el mismo alfabeto de códigos que downcastle/server/room.js
type Env = { DEV?: boolean, BASE_URL?: string };
const ENV: Env = (import.meta as unknown as { env?: Env }).env ?? { DEV: false, BASE_URL: '/' };
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const WS_PROD = 'wss://downcastle.libre-flow.workers.dev/ws'; // el Worker de DOWNCASTLE (ver su CLAUDE.md)
export function wsUrl() {
  const q = params.get('ws');
  if (q) return q;
  if (ENV.DEV) return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${ENV.BASE_URL ?? '/'}downcastle-ws`;
  return WS_PROD;
}
export function randomCode() { let c = ''; for (let k = 0; k < 4; k++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
export const validCode = (c: string) => c.length === 4 && [...c].every(ch => CODE_CHARS.includes(ch));
export const ERRORS: Record<string, string> = {
  exists: 'Ese código ya existe.', noroom: 'No existe esa sala.', full: 'La sala está llena.', code: 'Código inválido.',
  host: 'El anfitrión se fue.', kick: 'El anfitrión te sacó.', net: 'No se pudo conectar con el servidor de salas.', game: 'Esa sala es de otro juego.',
  proto: 'El anfitrión tiene otra versión del juego (recargá).',
};

export type Conn = { open: boolean, host: boolean, id: number, max: number, send(o: unknown): void, close(): void };
type On = { welcome(m: { id: number, host: boolean, max: number }): void, message(m: Record<string, unknown>): void, status(st: 'open' | 'reconnecting' | 'closed', why?: string): void };
export function connect(code: string, create: boolean, pid: string, max: number, on: On): Conn {
  let ws: WebSocket | null = null, welcomed = false, fatal = '', tries = 0, closed = false, timer = 0;
  const conn: Conn = {
    open: false, host: false, id: 0, max: 4,
    send(o) { if (ws && ws.readyState === 1 && welcomed) ws.send(JSON.stringify(o)); },
    close() { closed = true; clearTimeout(timer); try { ws?.close(1000); } catch { /* */ } },
  };
  const open = () => {
    const q = `sala=${code}&pid=${encodeURIComponent(pid)}${create && !welcomed ? `&create=1&max=${max}` : ''}`;
    try { ws = new WebSocket(`${wsUrl()}?${q}`); } catch { on.status('closed', 'net'); return; }
    ws.onmessage = e => {
      let m: Record<string, unknown>;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        welcomed = true, tries = 0, conn.open = true, conn.host = !!m.host, conn.id = m.id as number, conn.max = (m.max as number) || 4;
        on.status('open');
        on.welcome({ id: conn.id, host: conn.host, max: conn.max });
      } else if (m.t === 'err' || m.t === 'end') fatal = String(m.err ?? m.why ?? 'net');
      else on.message(m);
    };
    ws.onclose = () => {
      conn.open = false;
      if (closed) return;
      if (fatal || !welcomed || conn.host) { on.status('closed', fatal || 'net'); return; }
      if (++tries > 15) { on.status('closed', 'net'); return; }
      on.status('reconnecting');
      timer = setTimeout(open, 1200) as unknown as number;
    };
  };
  open();
  return conn;
}

// ---- Codificación compacta -----------------------------------------------------------------------------------
const r2 = (v: number) => Math.round(v * 100) / 100;
const tm = (v: number, t: number) => v === NEVER || v < t - 600 ? -1 : v; // tiempos viejos: −1
const ut = (v: number) => v === -1 ? NEVER : v;
const PN = ['x', 'y', 'vx', 'vy', 'dmg', 'ulti', 'mana', 'charge', 'ddx', 'ddy'] as const;
const PT = ['stunT', 'stopT', 'invT', 'shieldT', 'fragT', 'leadT', 'glueT', 'cloudT', 'spawnT', 'castAt', 'dashT', 'castT'] as const;
const PI = ['face', 'score', 'kos', 'falls', 'dealt', 'dashN', 'air', 'tricks'] as const;
const PBOOL = ['alive', 'ground', 'crouch', 'slide', 'pound', 'tumble'] as const;
type Packed = unknown[];
function packPl(p: Pl, t: number): Packed {
  let b = 0;
  PBOOL.forEach((k, j) => { if (p[k]) b |= 1 << j; });
  const h = p.hook, sh = p.shot, u = p.u, a = p.atk;
  return [p.id, b, ...PN.map(k => r2(p[k])), ...PT.map(k => tm(p[k], t)), ...PI.map(k => Math.round(p[k])),
    p.castK, p.hand, p.queue[0] ?? '', p.bonus,
    h ? [r2(h.x), r2(h.y), h.at, h.e, h.ek] : 0,
    sh && t - sh.at < 30 ? [r2(sh.x), r2(sh.y), r2(sh.ox), r2(sh.oy), sh.t, sh.at, sh.hit ? 1 : 0] : 0,
    u ? [u.k, u.t0, u.f, u.ft, r2(u.x), r2(u.y), r2(u.dx), r2(u.dy), u.n, u.ids] : 0,
    a ? [a.k, a.t0, r2(a.dx), r2(a.dy)] : 0];
}
function unpackPl(p: Pl, d: Packed) {
  let k = 1;
  const b = d[k++] as number;
  PBOOL.forEach((key, j) => { (p as Record<string, unknown>)[key] = (b & (1 << j)) !== 0; });
  for (const key of PN) (p as Record<string, unknown>)[key] = d[k++];
  for (const key of PT) (p as Record<string, unknown>)[key] = ut(d[k++] as number);
  for (const key of PI) (p as Record<string, unknown>)[key] = d[k++];
  p.castK = d[k++] as string, p.hand = d[k++] as string[];
  const q0 = d[k++] as string;
  p.queue = q0 ? [q0, ...p.queue.filter(c => c !== q0 && !p.hand.includes(c))].slice(0, 4) : p.queue;
  p.bonus = d[k++] as string;
  const h = d[k++] as number[] | 0, sh = d[k++] as number[] | 0, u = d[k++] as unknown[] | 0, a = d[k++] as unknown[] | 0;
  p.hook = h ? { x: h[0], y: h[1], at: h[2], rest: 0, e: h[3], ek: h[4], ox: 0, oy: 0, ci: 0, cj: 0 } : null;
  p.shot = sh ? { x: sh[0], y: sh[1], ox: sh[2], oy: sh[3], t: sh[4], at: sh[5], hit: !!sh[6] } : null;
  p.u = u ? { k: u[0] as string, t0: u[1] as number, f: u[2] as number, ft: u[3] as number, x: u[4] as number, y: u[5] as number, dx: u[6] as number, dy: u[7] as number, n: u[8] as number, ids: u[9] as number[] } : null;
  p.atk = a ? { k: a[0] as string, t0: a[1] as number, dx: a[2] as number, dy: a[3] as number, hit: [] } : null;
}
const packPr = (q: Proj) => [q.id, q.c, q.o, r2(q.x), r2(q.y), r2(q.vx), r2(q.vy), q.t0, q.fuse === NEVER ? -1 : q.fuse, q.st, q.arm];
const unpackPr = (d: unknown[]): Proj => ({ id: d[0] as number, c: d[1] as string, o: d[2] as number, x: d[3] as number, y: d[4] as number, vx: d[5] as number, vy: d[6] as number,
  t0: d[7] as number, fuse: ut(d[8] as number), b: 0, st: d[9] as number, sp: -1, sx: 0, sy: 0, hit: [], arm: d[10] as number, dead: false });
const packPo = (o: Prop) => [o.id, o.k, r2(o.x), r2(o.y), r2(o.vx), r2(o.vy), o.chute ? 1 : 0, o.card];
const unpackPo = (d: unknown[]): Prop => ({ id: d[0] as number, k: d[1] as string, x: d[2] as number, y: d[3] as number, vx: d[4] as number, vy: d[5] as number,
  hp: 1, o: -1, card: d[7] as string, chute: !!d[6], ground: false, t0: 0, dead: false });
const packZ = (z: Zone) => [z.id, z.k, r2(z.x), r2(z.y), z.r, z.t0, z.until, z.o];
const unpackZ = (d: unknown[]): Zone => ({ id: d[0] as number, k: d[1] as string, x: d[2] as number, y: d[3] as number, r: d[4] as number, t0: d[5] as number, until: d[6] as number, o: d[7] as number });
const packB = (b: Beam) => [b.id, b.k, b.o, r2(b.x), r2(b.y), r2(b.dx), r2(b.dy), b.t0, b.t1, b.len];
const unpackB = (d: unknown[]): Beam => ({ id: d[0] as number, k: d[1] as string, o: d[2] as number, x: d[3] as number, y: d[4] as number, dx: d[5] as number, dy: d[6] as number, t0: d[7] as number, t1: d[8] as number, len: d[9] as number });

export function packInput(i: Input): unknown[] {
  return [r2(i.x), r2(i.y), (i.jump ? 1 : 0) | (i.dash ? 2 : 0) | (i.hook ? 4 : 0) | (i.ulti ? 8 : 0), r2(i.ax), r2(i.ay), i.cast];
}
export function unpackInput(d: unknown): Input | null {
  if (!Array.isArray(d) || d.length < 6) return null;
  const n = (v: unknown, a: number, b: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : 0;
  const bits = n(d[2], 0, 15), cast = Math.round(n(d[5], -1, 4));
  return { x: n(d[0], -1, 1), y: n(d[1], -1, 1), jump: !!(bits & 1), dash: !!(bits & 2), hook: !!(bits & 4), ulti: !!(bits & 8), ax: n(d[3], -1, 1), ay: n(d[4], -1, 1), cast };
}

// Estado compacto del anfitrión (lo que se manda a todos)
export function packState(s: State, ev: Ev[], ops: Op[]) {
  return { t: 'st', k: s.t, T: Math.round(performance.now()), p: s.pl.map(p => packPl(p, s.t)), q: s.pr.map(packPr), o: s.props.map(packPo),
    z: s.zones.map(packZ), b: s.beams.map(packB), hz: s.hz, f: [s.over ? 1 : 0, s.sudden ? 1 : 0, s.suddenT], ev, ops };
}
export function applyState(s: State, m: Record<string, unknown>) {
  s.t = m.k as number;
  const ps = m.p as Packed[];
  for (const d of ps) {
    const id = d[0] as number;
    if (!s.pl[id]) continue;
    unpackPl(s.pl[id], d);
  }
  s.pr = (m.q as unknown[][]).map(unpackPr);
  s.props = (m.o as unknown[][]).map(unpackPo);
  s.zones = (m.z as unknown[][]).map(unpackZ);
  s.beams = (m.b as unknown[][]).map(unpackB);
  s.hz = m.hz as HzState;
  const f = m.f as number[];
  s.over = !!f[0], s.sudden = !!f[1], s.suddenT = f[2];
}
// Personaje completo (para la predicción del invitado): los NEVER viajan como null
export const packFull = (p: Pl) => JSON.parse(JSON.stringify(p, (_k, v) => typeof v === 'number' ? (v === NEVER ? null : Math.round(v * 1000) / 1000) : v));
export function unpackFull(o: Record<string, unknown>): Pl {
  for (const k of Object.keys(o)) if (o[k] === null && k !== 'hook' && k !== 'shot' && k !== 'u' && k !== 'atk') o[k] = NEVER;
  return o as unknown as Pl;
}

// ---- Invitado: búfer de estados, predicción y reconciliación ---------------------------------------------------
export type Snap = { k: number, T: number, recv: number, m: Record<string, unknown>, used: boolean };
export class GuestView {
  s: State; w: World; me: number;
  snaps: Snap[] = [];
  offset: number | null = null;
  pred: Pl | null = null; predT = 0;
  hist: { q: number, i: Input }[] = [];
  seq = 0;
  smooth: [number, number] = [0, 0];
  prevPos = new Map<string, [number, number]>();
  curPos = new Map<string, [number, number]>();
  alpha = 1;
  constructor(map: string, seed: number, seats: Seat[], rules: Rules, c: Cfg, me: number) {
    const { s, w } = newState(map, seed, seats, rules, c);
    this.s = s, this.w = w, this.me = me;
  }
  push(m: Record<string, unknown>, now: number) {
    const T = m.T as number, off = now - T;
    if (this.offset === null || off < this.offset) this.offset = off;
    else this.offset += (off - this.offset) * 0.02;
    this.snaps.push({ k: m.k as number, T, recv: now, m, used: false });
    while (this.snaps.length > 60) { const old = this.snaps.shift()!; if (!old.used) this.consume(old, true); }
  }
  // Aplica un estado: su terreno siempre; sus eventos solo si no son viejos. Devuelve los eventos a mostrar.
  consume(sn: Snap, stale = false): Ev[] {
    sn.used = true;
    for (const op of (sn.m.ops as Op[]) ?? []) { this.w.T.ops.push(op); applyOp(this.w.T, op); }
    if (stale) return [];
    applyState(this.s, sn.m);
    return (sn.m.ev as Ev[]) ?? [];
  }
  // Avanza la vista al tiempo de dibujo (ahora − desfase − delay): devuelve los eventos de los estados que pasó
  advance(now: number, delay = 100): Ev[] {
    const out: Ev[] = [];
    if (!this.snaps.length || this.offset === null) return out;
    const t = now - this.offset - delay;
    let b = this.snaps.findIndex(sn => sn.T >= t);
    if (b < 0) b = this.snaps.length - 1;
    if (b === 0 && this.snaps.length > 1) b = 1;
    for (let k = 0; k <= b; k++) {
      const sn = this.snaps[k];
      if (sn.used) continue;
      if (k < b) { // estados salteados: su estado sirve de "anterior"
        out.push(...this.consume(sn, now - sn.recv > 600));
        this.capture(this.prevPos);
      } else {
        this.capture(this.prevPos);
        out.push(...this.consume(sn));
        this.capture(this.curPos);
      }
    }
    const A = this.snaps[Math.max(0, b - 1)], B = this.snaps[b];
    this.alpha = A === B || B.T === A.T ? 1 : Math.max(0, Math.min(1, (t - A.T) / (B.T - A.T)));
    while (this.snaps.length > 2 && this.snaps[1].used && this.snaps[0].used && this.snaps[1].T < t) this.snaps.shift();
    return out;
  }
  private capture(into: Map<string, [number, number]>) {
    into.clear();
    for (const p of this.s.pl) into.set('p' + p.id, [p.x, p.y]);
    for (const q of this.s.pr) into.set('q' + q.id, [q.x, q.y]);
    for (const o of this.s.props) into.set('o' + o.id, [o.x, o.y]);
  }
  ip() {
    const a = this.alpha, me = this.me, pred = this.pred, sm = this.smooth;
    return (key: string, x: number, y: number): [number, number] => {
      if (key === 'p' + me && pred && pred.alive && !pred.u) return [pred.x + sm[0], pred.y + sm[1]];
      const p0 = this.prevPos.get(key), p1 = this.curPos.get(key) ?? [x, y];
      if (!p0 || (p0[0] - p1[0]) ** 2 + (p0[1] - p1[1]) ** 2 > 16) return p1;
      return [p0[0] + (p1[0] - p0[0]) * a, p0[1] + (p1[1] - p0[1]) * a];
    };
  }
  // Un paso local: guarda la entrada y predice el propio personaje. Devuelve los eventos de la predicción.
  local(i: Input): Ev[] {
    this.seq++;
    this.hist.push({ q: this.seq, i });
    if (this.hist.length > 240) this.hist.shift();
    if (!this.pred || !this.pred.alive || this.pred.u || this.s.over) return [];
    return this.predict(i, true);
  }
  private predict(i: Input, fx: boolean): Ev[] {
    const p = this.pred!;
    this.predT++;
    const fake: State = { ...this.s, t: this.predT, ev: [], pl: this.s.pl.map(q => q.id === this.me ? p : structuredClone(q)) };
    movePlayer(fake, this.w, p, { ...i, cast: -1 });
    return fx ? fake.ev : [];
  }
  // Reconciliar: el estado del anfitrión (tick k, última entrada aplicada a) y repetir las entradas posteriores
  reconcile(k: number, a: number, full: Pl) {
    const old = this.pred && this.pred.alive ? [this.pred.x + this.smooth[0], this.pred.y + this.smooth[1]] : null;
    this.pred = full, this.predT = k;
    this.hist = this.hist.filter(h => h.q > a);
    if (full.alive && !full.u) for (const h of this.hist) this.predict(h.i, false);
    if (old) {
      const dx = old[0] - this.pred.x, dy = old[1] - this.pred.y;
      this.smooth = dx * dx + dy * dy < 9 ? [dx, dy] : [0, 0];
    }
  }
  decay(dt: number) { const f = Math.exp(-dt * 12); this.smooth[0] *= f, this.smooth[1] *= f; }
  // El estado para dibujar: el del anfitrión con el propio personaje predicho
  view(): State {
    if (!this.pred || !this.pred.alive || this.pred.u) return this.s;
    const own = this.s.pl[this.me];
    const merged: Pl = { ...own, x: this.pred.x, y: this.pred.y, vx: this.pred.vx, vy: this.pred.vy, face: this.pred.face, ground: this.pred.ground,
      crouch: this.pred.crouch, slide: this.pred.slide, pound: this.pred.pound, hook: this.pred.hook ?? own.hook, shot: this.pred.shot ?? own.shot, charge: this.pred.charge };
    return { ...this.s, pl: this.s.pl.map(q => q.id === this.me ? merged : q) };
  }
}

export { NO_INPUT };
