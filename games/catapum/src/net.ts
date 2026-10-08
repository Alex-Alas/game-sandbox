// Online: salas por código sobre el mismo relay que DOWNCASTLE (plugin de Vite en desarrollo, Worker en producción).
// El anfitrión corre la simulación (con los bots) y es la verdad; los invitados mandan sus entradas y dibujan.
// Protocolo (JSON; PROTO 2, el anfitrión rechaza otro PROTO o otra tabla de cartas `TAB`):
//   invitado → anfitrión: hello {g, v, tab, name, ch, deck} · pick {name, ch, deck} · in {q: seq, f: [[x, y, bits, ax, ay, cast]…]} a 30 Hz
//   anfitrión → todos: lobby {g, v, seats, max, …} · start {map, seed, seats, rules, c} · seat {k, seat} (entra alguien a mitad) ·
//     st (estado compacto a 20 Hz: cada jugador en ~40 B sin lo privado, los eventos y los cortes del terreno desde el anterior;
//     hz solo si cambió, puntajes `sc` a 2 Hz) · tolobby
//   anfitrión → uno: me {d} (tu personaje para predecir y tu HUD: mano, maná, ulti; ~200 B, a 20 Hz y en el acto si te pasó algo
//     que no podés predecir: golpe, carta, KO…) · sync {ops} (el terreno ya anunciado al entrar o volver)
// El invitado dibuja a los demás en el pasado (100–260 ms según el jitter, interpolando) y predice su propio personaje con la misma
// física (movePlayer), reconciliando con cada `me`: vuelve al estado del anfitrión y repite las entradas que faltan. Las entradas
// van numeradas; el anfitrión las gasta una por cuadro de una cola (ver `Match` en game.ts) y devuelve la última aplicada.
// Mejor sin DOM: HostNet y GuestNet son los mismos que usa tools/netlab.mjs (laboratorio de red con latencia y jitter simulados).
import { NEVER, NO_INPUT, HZ, GO, newState, newPlayer, type Input, type State, type World, type Pl, type Proj, type Prop, type Zone, type Beam, type Ev, type HzState, type Hook, type Shot, type Ult } from './sim/sim.ts';
import { movePlayer } from './sim/move.ts';
import { applyOp, type Op } from './sim/terrain.ts';
import type { Rules, Cfg } from './sim/params.ts';
import { CHARS, charOf } from './sim/chars.ts';
import { CARD, SUB, validDeck } from './sim/cards.ts';
import { newMem } from './sim/bot.ts';
import type { Match, Seat } from './game.ts';

export const GAME = 'catapum', PROTO = 2;
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
const r1 = (v: number) => Math.round(v * 10) / 10, r2 = (v: number) => Math.round(v * 100) / 100, r3 = (v: number) => Math.round(v * 1000) / 1000;
// Los tiempos de la sim son cuadros absolutos; viajan relativos al cuadro del mensaje (números chicos, 1–3 cifras).
// `rem`: solo importa lo que falta (invulnerable hasta…, aturdido hasta…). `rel`: también lo reciente (coyote, buffer, dash…),
// con tope REL cuadros hacia atrás (más viejo que eso ya no cambia nada de la física).
const REL = 64;
const rel = (v: number, t: number) => v === NEVER || v < t - REL ? -REL : Math.round(v - t);
const unrel = (r: number, t: number) => r <= -REL ? NEVER : t + r;
const rem = (v: number, t: number) => v > t ? Math.ceil(v - t) : 0;
const unrem = (r: number, t: number) => r > 0 ? t + r : NEVER;
// Cartas y proyectiles viajan como índice de esta tabla (la misma en las dos puntas: `TAB` va en el hello y el anfitrión rechaza
// a quien tenga otra); un id que no esté viaja como texto.
const IDS = [...Object.keys(CARD), ...Object.keys(SUB), '+ulti', '+mana'];
const IDX = new Map(IDS.map((k, i) => [k, i] as const));
const ci = (id: string): number | string => IDX.get(id) ?? id;
const cu = (v: unknown): string => typeof v === 'number' ? IDS[v] ?? '' : typeof v === 'string' ? v : '';
export const TAB = (() => { let h = 7; for (const ch of IDS.join(',')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return h >>> 0; })();

type Packed = unknown[];
const trim = (a: Packed, n: number) => { while (a.length > n && a[a.length - 1] === 0) a.pop(); return a; };
const packHook = (h: Hook, t: number) => [r2(h.x), r2(h.y), Math.max(-REL, h.at - t), h.e, h.ek];
const packHookM = (h: Hook, t: number) => [r3(h.x), r3(h.y), Math.max(-REL, h.at - t), r3(h.rest), h.e, h.ek, r3(h.ox), r3(h.oy), h.ci, h.cj];
const unpackHook = (h: number[], t: number, m: boolean): Hook => m
  ? { x: h[0], y: h[1], at: t + h[2], rest: h[3], e: h[4], ek: h[5], ox: h[6], oy: h[7], ci: h[8], cj: h[9] }
  : { x: h[0], y: h[1], at: t + h[2], rest: 0, e: h[3], ek: h[4], ox: 0, oy: 0, ci: 0, cj: 0 };
const packShot = (s: Shot, t: number) => [r2(s.x), r2(s.y), r2(s.ox), r2(s.oy), s.t - t, s.at - t, s.hit ? 1 : 0];
const unpackShot = (d: number[], t: number): Shot => ({ x: d[0], y: d[1], ox: d[2], oy: d[3], t: t + d[4], at: t + d[5], hit: !!d[6] });

// Un jugador en `st` (lo que hace falta para dibujarlo; la mano, el maná, la ulti y la liga propia viajan solo en el `me` de su dueño)
const SB = ['alive', 'ground', 'crouch', 'slide', 'pound', 'tumble'] as const;
const SBT = ['invT', 'stunT', 'shieldT', 'fragT', 'leadT', 'glueT', 'cloudT', 'spawnT'] as const;
function packPl(p: Pl, t: number): Packed {
  let b = p.face < 0 ? 64 : 0, mask = 0;
  SB.forEach((k, j) => { if (p[k]) b |= 1 << j; });
  const tv: number[] = [];
  SBT.forEach((k, j) => { const r = rem(p[k], t); if (r) mask |= 1 << j, tv.push(r); });
  const h = p.hook, sh = p.shot, u = p.u;
  return trim([p.id, b, r2(p.x), r2(p.y), r1(p.vx), r1(p.vy), Math.round(p.dmg), mask, ...tv,
    h ? packHook(h, t) : 0,
    sh && t - sh.at < 30 ? packShot(sh, t) : 0,
    u ? [u.k, u.t0 - t, u.f, u.ft - t, r2(u.x), r2(u.y), r2(u.dx), r2(u.dy), u.n, u.ids] : 0], 7);
}
function unpackPl(p: Pl, d: Packed, t: number) {
  const b = d[1] as number;
  SB.forEach((k, j) => { p[k] = (b & (1 << j)) !== 0; });
  p.face = b & 64 ? -1 : 1;
  p.x = d[2] as number, p.y = d[3] as number, p.vx = d[4] as number, p.vy = d[5] as number, p.dmg = d[6] as number;
  const mask = (d[7] as number) ?? 0;
  let k = 8;
  SBT.forEach((key, j) => { p[key] = mask & (1 << j) ? unrem(d[k++] as number, t) : NEVER; });
  const h = d[k++] as number[] | 0 | undefined, sh = d[k++] as number[] | 0 | undefined, u = d[k++] as unknown[] | 0 | undefined;
  p.hook = h ? unpackHook(h, t, false) : null;
  p.shot = sh ? unpackShot(sh, t) : null;
  p.u = u ? { k: u[0] as string, t0: t + (u[1] as number), f: u[2] as number, ft: t + (u[3] as number), x: u[4] as number, y: u[5] as number, dx: u[6] as number, dy: u[7] as number, n: u[8] as number, ids: u[9] as number[] } : null;
}
const packPr = (q: Proj) => [q.id, ci(q.c), q.o, r2(q.x), r2(q.y), r1(q.vx), r1(q.vy), q.t0, q.fuse === NEVER ? -1 : q.fuse, q.st, q.arm];
const unpackPr = (d: unknown[]): Proj => ({ id: d[0] as number, c: cu(d[1]), o: d[2] as number, x: d[3] as number, y: d[4] as number, vx: d[5] as number, vy: d[6] as number,
  t0: d[7] as number, fuse: (d[8] as number) === -1 ? NEVER : d[8] as number, b: 0, st: d[9] as number, sp: -1, sx: 0, sy: 0, hit: [], arm: d[10] as number, dead: false });
const packPo = (o: Prop) => [o.id, o.k, r2(o.x), r2(o.y), r1(o.vx), r1(o.vy), o.chute ? 1 : 0, ci(o.card)];
const unpackPo = (d: unknown[]): Prop => ({ id: d[0] as number, k: d[1] as string, x: d[2] as number, y: d[3] as number, vx: d[4] as number, vy: d[5] as number,
  hp: 1, o: -1, card: cu(d[7]), chute: !!d[6], ground: false, t0: 0, dead: false });
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

// Estado compacto del anfitrión (lo que se manda a todos). `hz` (peligros) y `sc` (puntajes) solo cuando cambian o cada tanto.
export function packState(s: State, ev: Ev[], ops: Op[], T = Math.round(performance.now()), o: { hz?: boolean, sc?: boolean } = {}) {
  const m: Record<string, unknown> = { t: 'st', k: s.t, T, p: s.pl.map(p => packPl(p, s.t)) };
  if (s.pr.length) m.q = s.pr.map(packPr);
  if (s.props.length) m.o = s.props.map(packPo);
  if (s.zones.length) m.z = s.zones.map(packZ);
  if (s.beams.length) m.b = s.beams.map(packB);
  if (o.hz !== false) m.hz = s.hz;
  m.f = s.sudden ? [(s.over ? 1 : 0) | 2, s.suddenT] : [s.over ? 1 : 0];
  if (o.sc !== false) m.sc = s.pl.map(p => [p.score, p.kos, p.falls, Math.round(p.dealt), p.tricks]);
  if (ev.length) m.ev = ev;
  if (ops.length) m.ops = ops;
  return m;
}
export function applyState(s: State, m: Record<string, unknown>) {
  const t = s.t = m.k as number;
  for (const d of m.p as Packed[]) {
    const p = s.pl[d[0] as number];
    if (p) unpackPl(p, d, t);
  }
  s.pr = ((m.q as unknown[][]) ?? []).map(unpackPr);
  s.props = ((m.o as unknown[][]) ?? []).map(unpackPo);
  s.zones = ((m.z as unknown[][]) ?? []).map(unpackZ);
  s.beams = ((m.b as unknown[][]) ?? []).map(unpackB);
  if (m.hz) s.hz = m.hz as HzState;
  const f = m.f as number[];
  s.over = !!(f[0] & 1), s.sudden = !!(f[0] & 2), s.suddenT = f[1] ?? 0;
  if (m.sc) (m.sc as number[][]).forEach((v, k) => { const p = s.pl[k]; if (p) p.score = v[0], p.kos = v[1], p.falls = v[2], p.dealt = v[3], p.tricks = v[4]; });
}

// Tu personaje para predecir (`me`, solo para su dueño): todo lo que lee el movimiento más lo que muestra tu HUD. Los tiempos van
// relativos al cuadro k del anfitrión; a es la última entrada tuya que aplicó.
const MB = ['alive', 'ground', 'crouch', 'slide', 'pound', 'tumble', 'held', 'rise', 'dashHeld', 'hookHeld'] as const;
const MN = ['x', 'y', 'vx', 'vy', 'ddx', 'ddy', 'charge'] as const;
const MT = ['groundT', 'pressT', 'wallT', 'lockT', 'dashT', 'dashCdT', 'hookT', 'stunT', 'stopT', 'techT', 'techT0', 'invT', 'glueT', 'leadT', 'cloudT'] as const;
const MI = ['air', 'wall', 'wallSide', 'dashN'] as const;
const FACE = 1 << 10, HASU = 1 << 11, ATK = 1 << 12, KATANA = 1 << 13;
const DUMMY_U: Ult = { k: '', t0: 0, f: 0, ft: 0, x: 0, y: 0, dx: 0, dy: 0, n: 0, ids: [] };
export function packMe(p: Pl, k: number, a: number): Packed {
  let b = (p.face < 0 ? FACE : 0) | (p.u ? HASU : 0) | (p.atk ? p.atk.k === 'katana' ? KATANA : ATK : 0);
  MB.forEach((key, j) => { if (p[key]) b |= 1 << j; });
  const h = p.hook, sh = p.shot;
  return trim([k, a, b, ...MN.map(key => r3(p[key])), ...MT.map(key => rel(p[key], k)), ...MI.map(key => p[key]),
    r2(p.mana), r1(p.ulti), r1(p.dmg), p.hand.map(ci), ci(p.queue[0] ?? ''), ci(p.bonus),
    h ? packHookM(h, k) : 0, sh && k - sh.at < 30 ? packShot(sh, k) : 0], 3 + MN.length + MT.length + MI.length + 6);
}
export function unpackMe(base: Pl, d: Packed): Pl {
  const k = d[0] as number, b = d[2] as number, p: Pl = { ...base };
  MB.forEach((key, j) => { p[key] = (b & (1 << j)) !== 0; });
  p.face = b & FACE ? -1 : 1;
  let i = 3;
  for (const key of MN) p[key] = d[i++] as number;
  for (const key of MT) p[key] = unrel(d[i++] as number, k);
  for (const key of MI) p[key] = d[i++] as number;
  p.mana = d[i++] as number, p.ulti = d[i++] as number, p.dmg = d[i++] as number;
  p.hand = (d[i++] as unknown[]).map(cu);
  const q0 = cu(d[i++]);
  p.queue = q0 ? [q0] : [];
  p.bonus = cu(d[i++]);
  const h = d[i++] as number[] | 0 | undefined, sh = d[i++] as number[] | 0 | undefined;
  p.hook = h ? unpackHook(h, k, true) : null;
  p.shot = sh ? unpackShot(sh, k) : null;
  p.u = b & HASU ? DUMMY_U : null;
  p.atk = b & (ATK | KATANA) ? { k: b & KATANA ? 'katana' : 'bate', t0: k, dx: 0, dy: 0, hit: [] } : null;
  return p;
}
// El personaje completo en JSON (solo lo usan las pruebas; el juego manda `packMe`)
export const packFull = (p: Pl) => JSON.parse(JSON.stringify(p, (_k, v) => typeof v === 'number' ? (v === NEVER ? null : Math.round(v * 1000) / 1000) : v));
export function unpackFull(o: Record<string, unknown>): Pl {
  for (const k of Object.keys(o)) if (o[k] === null && k !== 'hook' && k !== 'shot' && k !== 'u' && k !== 'atk') o[k] = NEVER;
  return o as unknown as Pl;
}

// ---- Invitado: búfer de estados, predicción y reconciliación ---------------------------------------------------
export type Snap = { k: number, T: number, recv: number, m: Record<string, unknown>, used: boolean };
const SMOOTH_MAX = 3; // m: una corrección más chica se desliza (decay); más grande, salta
export class GuestView {
  s: State; w: World; me: number;
  snaps: Snap[] = [];
  offset: number | null = null;
  delay = 100;                         // ms en el pasado a los que se dibuja a los demás (sube con el jitter de los `st`: 100–260)
  late: number[] = [];                 // cuánto se atrasó cada `st` respecto del más rápido (últimos 100)
  pred: Pl | null = null; predT = 0;
  hist: { q: number, i: Input, at: number }[] = [];
  seq = 0;
  rtt = 0;                             // ms entre mandar una entrada y que vuelva confirmada (el ping más la cola del anfitrión)
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
    // retraso de interpolación adaptable: un `st` cada 50 ms más el atraso (p90) de los últimos; sube rápido, baja despacio
    this.late.push(Math.max(0, off - this.offset));
    if (this.late.length > 100) this.late.shift();
    if (this.late.length >= 20) {
      const p90 = [...this.late].sort((a, b) => a - b)[Math.floor(this.late.length * 0.9)];
      const want = Math.max(100, Math.min(260, 70 + p90 * 1.2));
      this.delay += Math.max(-1, Math.min(4, (want - this.delay) * 0.1));
    }
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
  advance(now: number, delay = this.delay): Ev[] {
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
  // ¿Se predice ahora el propio personaje? (no si está muerto, en ulti o con la katana: ahí el anfitrión lo mueve de otra forma)
  private predicting() { const p = this.pred; return !!p && p.alive && !p.u && p.atk?.k !== 'katana' && !this.s.over; }
  // Un paso local: guarda la entrada y predice el propio personaje. Devuelve los eventos de la predicción.
  local(i: Input, now = 0): Ev[] {
    this.seq++;
    this.hist.push({ q: this.seq, i, at: now });
    if (this.hist.length > 240) this.hist.shift();
    if (!this.predicting()) return [];
    const g = this.ghost();
    this.predict(g, i);
    return g.ev;
  }
  // Una copia barata de lo que el movimiento puede tocar de los demás (la liga a un rival o a un objeto les cambia la velocidad;
  // el lanzamiento llama a `hurt`): así predecir no ensucia lo que se dibuja.
  private ghost(): State {
    const s = this.s;
    return { ...s, ev: [], pl: s.pl.map(q => q.id === this.me ? this.pred! : { ...q }), props: s.props.map(o => ({ ...o })) };
  }
  private predict(g: State, i: Input) {
    const p = this.pred!;
    g.t = ++this.predT;
    if (g.t < GO * HZ) { p.vx = p.vy = 0; return; } // la cuenta regresiva: la sim los deja quietos
    movePlayer(g, this.w, p, { ...i, cast: -1 });
  }
  // Reconciliar con un `me`: el estado del anfitrión en el cuadro k (con la entrada a como última aplicada) y repetir las
  // entradas posteriores. Lo que muestra el HUD propio (mano, maná, ulti) se copia al jugador que se dibuja.
  reconcile(d: Packed, now = 0) {
    const base = this.s.pl[this.me];
    if (!base) return;
    const k = d[0] as number, a = d[1] as number;
    const acked = this.hist.find(h => h.q === a);
    if (acked && now) this.rtt = this.rtt ? this.rtt + (now - acked.at - this.rtt) * 0.1 : now - acked.at;
    const old = this.predicting() ? [this.pred!.x + this.smooth[0], this.pred!.y + this.smooth[1]] : null;
    const full = unpackMe(base, d);
    this.pred = full, this.predT = k;
    this.hist = this.hist.filter(h => h.q > a);
    base.hand = full.hand, base.queue = full.queue, base.bonus = full.bonus, base.mana = full.mana, base.ulti = full.ulti;
    if (this.predicting()) {
      const g = this.ghost();
      for (const h of this.hist) this.predict(g, h.i);
    }
    if (old && this.predicting()) {
      const dx = old[0] - this.pred.x, dy = old[1] - this.pred.y;
      this.smooth = dx * dx + dy * dy < SMOOTH_MAX * SMOOTH_MAX ? [dx, dy] : [0, 0];
    } else this.smooth = [0, 0];
  }
  decay(dt: number) { const f = Math.exp(-dt * 12); this.smooth[0] *= f, this.smooth[1] *= f; }
  // El estado para dibujar: el del anfitrión con el propio personaje predicho. Lo propio va en el reloj de la predicción
  // (adelantada `dt` cuadros), así que la liga se corre `dt` cuadros hacia el reloj del estado que se dibuja.
  view(): State {
    const pred = this.pred, own = this.s.pl[this.me];
    if (!pred || !pred.alive || pred.u || !own) return this.s;
    const dt = this.predT - this.s.t, h = pred.hook, sh = pred.shot;
    const merged: Pl = { ...own, x: pred.x, y: pred.y, vx: pred.vx, vy: pred.vy, face: pred.face, ground: pred.ground, crouch: pred.crouch, slide: pred.slide,
      pound: pred.pound, charge: pred.charge, dashN: pred.dashN, air: pred.air,
      hook: h ? { ...h, at: h.at - dt } : null, shot: sh ? { ...sh, t: sh.t - dt, at: sh.at - dt } : null };
    return { ...this.s, pl: this.s.pl.map(q => q.id === this.me ? merged : q) };
  }
}

export { NO_INPUT };

// ---- Anfitrión y invitado sin DOM (los usan main.ts y el laboratorio de red, tools/netlab.mjs) ------------------------
export type Peer = { id: number, name: string, ch: string, deck: string[], on: boolean, ready: boolean }; // on: conectado; ready: ya tiene la partida
export const helloMsg = (name: string, ch: string, deck: string[]) => ({ t: 'hello', g: GAME, v: PROTO, tab: TAB, name, ch, deck });

export function startMsg(m: Match) {
  return { t: 'start', map: m.s.map, seed: m.seed, rules: m.s.rules, c: m.w.c, seats: m.seats.map(s => ({ name: s.name, ch: s.ch, deck: s.deck, team: s.team, bot: s.bot, peer: s.peer ?? -1 })) };
}

// Eventos que cambian a un jugador de formas que la predicción no conoce (golpes, cartas, ulti, trampolín…; el que pega con un dash
// también pierde velocidad): quien los recibe (campos p, a, b, by) tiene el `me` en el acto en vez de esperar al próximo múltiplo de 3.
const RESYNC = new Set(['hit', 'ko', 'spawn', 'cast', 'tele', 'swap', 'pad', 'ulti', 'fizzle', 'slip', 'pick', 'heal']);
const SC_EVERY = 30, HZ_EVERY = 60; // cuadros entre los puntajes y los peligros aunque no hayan cambiado
const OPS_MAX = 200;               // cortes de terreno que caben en un `st` (unos 20 bytes cada uno)

// Lo que sabe hacer el anfitrión con los mensajes de la sala y con cada cuadro de la partida. `send` manda por el relay
// ({ m, to? } o { t: 'drop', id }); `o.lobby` avisa que cambió la lista de la sala; `o.diff` es el nivel del bot que
// maneja a quien se desconecta.
export class HostNet {
  peers = new Map<number, Peer>();
  seatOf = new Map<number, number>();
  match: Match | null = null;
  evAcc: Ev[] = [];
  opsSent = 0;
  hzSent = '';
  send: (o: unknown) => void;
  o: { diff(): number, lobby(): void, now(): number };
  constructor(send: (o: unknown) => void, o: { diff(): number, lobby(): void, now(): number }) { this.send = send, this.o = o; }
  reset() { this.peers.clear(), this.seatOf.clear(), this.match = null, this.evAcc = [], this.opsSent = 0, this.hzSent = ''; }
  message(m: Record<string, unknown>) {
    const match = this.match;
    if (m.t === 'peer') {
      const id = m.id as number, p = this.peers.get(id);
      if (!m.on) {
        if (p) p.on = false;
        const k = this.seatOf.get(id);
        if (match && k !== undefined) match.s.pl[k].bot = this.o.diff(); // mientras no está, juega un bot
        if (!match) this.peers.delete(id);
      } else if (p) p.on = true, p.ready = false; // vuelve: su `hello` (lo manda al reconectar) le reenvía la partida
      this.o.lobby();
      return;
    }
    if (m.t !== 'from') return;
    const id = m.id as number, msg = m.m as Record<string, unknown>;
    if (msg.t === 'hello') {
      const nope = (why: string) => { this.send({ to: id, m: { t: 'nope', why } }); this.send({ t: 'drop', id }); };
      if (msg.g !== GAME) return nope('game');
      if (msg.v !== PROTO || msg.tab !== TAB) return nope('proto');
      const ch = CHARS.some(c => c.id === msg.ch) ? msg.ch as string : 'bombin';
      const deck = validDeck(msg.deck) ? msg.deck : charOf(ch).deck;
      const old = this.peers.get(id);
      this.peers.set(id, { id, name: String(msg.name ?? 'Invitado').slice(0, 14), ch, deck, on: true, ready: true });
      if (match) {
        if (!old && this.seatOf.get(id) === undefined) this.addLatePlayer(id);
        this.sendStart(id);
      }
      this.o.lobby();
    } else if (msg.t === 'pick') {
      const p = this.peers.get(id);
      if (!p) return;
      if (CHARS.some(c => c.id === msg.ch)) p.ch = msg.ch as string;
      if (validDeck(msg.deck)) p.deck = msg.deck;
      if (typeof msg.name === 'string') p.name = msg.name.slice(0, 14);
      this.o.lobby();
    } else if (msg.t === 'in') {
      const k = this.seatOf.get(id);
      if (!match || k === undefined || !Array.isArray(msg.f)) return;
      const ins = (msg.f as unknown[]).map(unpackInput).filter((x): x is Input => !!x).slice(0, 8);
      match.s.pl[k].bot = 0;
      match.push(k, Number(msg.q) || 0, ins);
    }
  }
  // Alguien entra a mitad de partida: un jugador nuevo
  addLatePlayer(peer: number) {
    const m = this.match!, p = this.peers.get(peer)!, id = m.s.pl.length;
    if (id >= 8) return;
    const seat: Seat = { name: p.name, ch: p.ch, deck: p.deck, team: id % 2, bot: 0, peer };
    m.seats.push(seat);
    m.s.pl.push(newPlayer(id, seat, m.w.c, m.s.rules));
    m.s.pl[id].spawnT = m.s.t + 1;
    m.mems.push(newMem(id));
    this.seatOf.set(peer, id);
    this.send({ m: { t: 'seat', k: id, seat: { name: seat.name, ch: seat.ch, deck: seat.deck, team: seat.team, bot: 0, peer } } });
  }
  // La partida entera para quien entra o vuelve: `start` y los cortes del terreno que ya salieron en un `st` (los que faltan los
  // trae el próximo `st`: mandarlos acá también los aplicaría dos veces). Su cola de entradas empieza de cero (su secuencia también).
  sendStart(peer: number) {
    const m = this.match!, k = this.seatOf.get(peer);
    if (k !== undefined) m.forget(k);
    this.send({ to: peer, m: startMsg(m) });
    const ops = m.w.T.ops.slice(0, this.opsSent);
    for (let j = 0; j < ops.length; j += 150) this.send({ to: peer, m: { t: 'sync', ops: ops.slice(j, j + 150) } });
  }
  // Empieza (o reinicia) la partida: los lugares de la sala ya están en `m.seats` (con `peer` los de los invitados)
  begin(m: Match) {
    this.match = m, this.evAcc = [], this.opsSent = 0, this.hzSent = '';
    this.seatOf.clear();
    m.seats.forEach((s, k) => { if (s.peer !== undefined) this.seatOf.set(s.peer, k); });
    this.send({ m: startMsg(m) });
  }
  // Después de cada cuadro de la sim: cada 3 cuadros el estado de todos y, a cada invitado, su personaje; y en el acto el `me`
  // de quien recibió algo que su predicción no puede saber.
  afterTick(evs: Ev[]) {
    const m = this.match!, t = m.s.t;
    this.evAcc.push(...evs);
    const urgent = new Set<number>();
    for (const e of evs) if (RESYNC.has(e.k)) for (const f of ['p', 'a', 'b', 'by']) if (typeof e[f] === 'number') urgent.add(e[f] as number);
    const full = t % 3 === 0;
    if (full) {
      let ops = m.w.T.ops.slice(this.opsSent);
      this.opsSent = m.w.T.ops.length;
      // el relay descarta lo que pase de 16 KB: una ráfaga enorme de cortes sale aparte (en trozos, como al entrar tarde)
      if (ops.length > OPS_MAX) { for (let j = 0; j < ops.length; j += 150) this.send({ m: { t: 'sync', ops: ops.slice(j, j + 150) } }); ops = []; }
      const hz = JSON.stringify(m.s.hz), sc = t % SC_EVERY === 0 || m.s.over || this.evAcc.some(e => e.k === 'ko' || e.k === 'end');
      this.send({ m: packState(m.s, this.evAcc, ops, this.o.now(), { hz: hz !== this.hzSent || t % HZ_EVERY === 0, sc }) });
      this.hzSent = hz, this.evAcc = [];
    }
    if (!full && !urgent.size) return;
    for (const [peer, k] of this.seatOf) {
      const p = this.peers.get(peer);
      if (!p?.on || !p.ready || !(full || urgent.has(k))) continue;
      this.send({ to: peer, m: { t: 'me', d: packMe(m.s.pl[k], t, m.ack.get(k) ?? 0) } });
    }
  }
}

// El invitado: arma la vista al llegar `start`, la alimenta con `sync`/`st`/`me` y manda sus entradas (de a 2 cuadros)
export class GuestNet {
  gv: GuestView | null = null;
  myPeer = 0;
  waiting = false;                     // se cortó la conexión: lo que llegue hasta el próximo `start` es de otra numeración y se ignora
  inBuf: unknown[] = [];
  inSeq0 = 0;
  send: (o: unknown) => void;
  onStart: (gv: GuestView) => void;
  constructor(send: (o: unknown) => void, onStart: (gv: GuestView) => void = () => {}) { this.send = send, this.onStart = onStart; }
  lost() { this.waiting = true; }
  // true si el mensaje era de la partida (start, seat, sync, st, me)
  message(m: Record<string, unknown>, now: number): boolean {
    if (m.t === 'start') {
      this.waiting = false;
      const seats = m.seats as (Seat & { peer: number })[];
      const me = seats.findIndex(s => s.peer === this.myPeer);
      const gv = new GuestView(m.map as string, m.seed as number, seats, m.rules as Rules, m.c as Cfg, me);
      this.gv = gv, this.inBuf = [], this.inSeq0 = gv.seq + 1;
      this.onStart(gv);
      return true;
    }
    const gv = this.gv;
    if (m.t !== 'seat' && m.t !== 'sync' && m.t !== 'st' && m.t !== 'me') return false;
    if (!gv || this.waiting) return true;
    if (m.t === 'seat') { const k = m.k as number; if (!gv.s.pl[k]) gv.s.pl[k] = newPlayer(k, m.seat as Seat, gv.w.c, gv.s.rules); }
    else if (m.t === 'sync') { for (const op of m.ops as number[][]) { gv.w.T.ops.push(op); applyOp(gv.w.T, op); gv.w.T.fall.length = 0; } }
    else if (m.t === 'st') gv.push(m, now);
    else gv.reconcile(m.d as Packed, now);
    return true;
  }
  // Un cuadro local: predice el propio personaje y manda la entrada. Devuelve los eventos de la predicción.
  tick(i: Input, now = performance.now()): Ev[] {
    if (this.waiting) return [];
    const evs = this.gv!.local(i, now);
    this.inBuf.push(packInput(i));
    if (this.inBuf.length >= 2) { this.send({ t: 'in', q: this.inSeq0, f: this.inBuf }); this.inSeq0 += this.inBuf.length; this.inBuf = []; }
    return evs;
  }
}
