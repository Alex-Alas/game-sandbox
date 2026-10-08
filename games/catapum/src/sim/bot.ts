// Bots: producen la misma entrada que un jugador (Input) mirando el estado. Los corre el anfitrión.
//
// Idea central: los bots no adivinan el movimiento, lo PRUEBAN. Un «plan» es un guion corto de entradas (correr, saltar,
// doble salto, dash, liga, cartas de movimiento) que se simula con la física real (movePlayer sobre una copia del
// jugador, con el viento y los peligros que vienen) antes de usarlo. Con eso hacen todo con la misma lógica:
//   · volver al escenario (doble salto → dash → liga → cartas, de la herramienta más barata a la más cara),
//   · esquivar el tren, las rocas, los proyectiles y las ultis,
//   · cruzar huecos y llegar a otras islas (saltos, dash, liga, pared) para pelear o buscar una caja.
// Encima va el combate (cartas elegidas por valor y apuntadas con la balística real, golpes de cuerpo, liga + DASH para
// lanzar rivales hacia afuera, ultis con sentido) y la dificultad (DIFFS) que cambia reacción, puntería, qué
// herramientas conocen y qué tan agresivos son. Todo lo numérico sale de w.c, CARD/projOf y charOf: si se recalibran el
// movimiento o las cartas, los bots lo siguen solos.
import { CARD, projOf, type Card } from './cards.ts';
import { charOf } from './chars.ts';
import { CELL, groundBelow, solidAt, sweepX, raycast, boxFree } from './terrain.ts';
import { HZ, DT, NEVER, GO, HW, H, HAND_Y, G_PROJ, AIM_R, NO_INPUT, enemies, height, gravity, inUlti, type State, type World, type Pl, type Input } from './state.ts';
import { attached, movePlayer, hookTarget } from './move.ts';
import { kbMul } from './combat.ts';
import { BLAST_X, BLAST_TOP } from './maps.ts';

// ---- Dificultad ---------------------------------------------------------------------------------------------------
// react: cuadros entre decisiones; err: error de puntería (rad); cast: segundos entre cartas; recover: qué tan bien
// vuelve; dodge/tech/hookAtk: probabilidades; aggr: ganas de acercarse y pegar (0–1); tools: 0 solo caminar y saltar,
// 1 + doble salto y dash, 2 + liga y pared, 3 + trucos (wavedash, super…) y combos; plan: cuántos guiones prueba por
// tanda; lead: cuánto adelanta a un blanco que se mueve (0–1); edge: probabilidad de mirar el borde antes de caminar;
// ult: criterio con la ulti (0 la tira apenas puede, 1 elige el momento); mana: maná que deja de reserva.
export const DIFFS = [
  { name: 'FÁCIL', react: 22, err: 0.3, cast: 3.2, recover: 0.5, dodge: 0.12, tech: 0, hookAtk: 0, aggr: 0.35, tools: 0, plan: 6, lead: 0.1, edge: 0.7, ult: 0, mana: 3 },
  { name: 'NORMAL', react: 11, err: 0.14, cast: 1.5, recover: 0.85, dodge: 0.45, tech: 0.3, hookAtk: 0.3, aggr: 0.6, tools: 1, plan: 14, lead: 0.5, edge: 0.95, ult: 0.5, mana: 1.5 },
  { name: 'DIFÍCIL', react: 6, err: 0.06, cast: 0.9, recover: 1, dodge: 0.8, tech: 0.7, hookAtk: 0.6, aggr: 0.8, tools: 2, plan: 30, lead: 0.85, edge: 1, ult: 0.85, mana: 0.5 },
  { name: 'CAÓTICO', react: 3, err: 0.03, cast: 0.45, recover: 1, dodge: 0.95, tech: 0.95, hookAtk: 0.9, aggr: 1, tools: 3, plan: 60, lead: 1, edge: 1, ult: 1, mana: 0 },
];
type Diff = typeof DIFFS[number];

// ---- Guiones --------------------------------------------------------------------------------------------------------
// Evento de un guion: f = cuadro (desde el inicio del guion). Los de nivel (mv, jd/ju, hd/hu) quedan puestos; el resto
// ocurre en su cuadro. a, b, c, d dependen del tipo (ver scInput).
type Ev = { f: number, k: 'mv' | 'jd' | 'ju' | 'dash' | 'hd' | 'hu' | 'hs' | 'cast', a: number, b: number, c: number, d: number };
export type Sc = { name: string, ev: Ev[], len: number, gy: number, tier: number };
const E = (f: number, k: Ev['k'], a = 0, b = 0, c = 0, d = 0): Ev => ({ f, k, a, b, c, d });

export type BotMem = {
  seed: number, target: number, think: number, err: number, castT: number, mode: string,
  sc: Sc | null, scT: number, scChk: number, hrel: number, hStart: number, planT: number, safeT: number, hzT: number, hz: Hz[], hzClear: number,
  stunSeen: number, techPlan: boolean, techF: number,
  surfT: number, dir: number, dirT: number, careful: boolean, hookHold: number, jumpHold: number,
  dodged: number[], lastCast: string, ultiPlan: number, ultiT: number, airD: number, fallEp: number, fallOk: boolean, engage: boolean, px: number, py: number, pT: number,
};
export const newMem = (id: number): BotMem => ({
  seed: id * 7919 + 1, target: -1, think: 0, err: 0, castT: 0, mode: '',
  sc: null, scT: 0, scChk: 0, hrel: -1, hStart: -1, planT: 0, safeT: 0, hzT: -99, hz: [], hzClear: 0,
  stunSeen: 0, techPlan: false, techF: -1,
  surfT: -1e9, dir: 1, dirT: 0, careful: true, hookHold: 0, jumpHold: 0,
  dodged: [], lastCast: '', ultiPlan: 0, ultiT: 0, airD: 0, fallEp: -1, fallOk: true, engage: true, px: 0, py: 0, pT: 0,
});

// Azar propio del bot (no toca el del estado: los bots no cambian la partida más que por sus entradas)
const r01 = (m: BotMem) => { m.seed = (m.seed * 1103515245 + 12345) & 0x7fffffff; return m.seed / 0x7fffffff; };
const mid = (p: Pl) => p.y + height(p) / 2;
const sgn = (v: number) => v > 0 ? 1 : v < 0 ? -1 : 0;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;

// ---- Mapa: superficies donde pararse ---------------------------------------------------------------------------------
// Puntos donde se puede estar parado (cada 1 m, por columna, de arriba hacia abajo), recalculados cuando el terreno
// cambió (cada 20 cuadros como mucho) y compartidos por todos los bots de la partida.
type Spots = { n: number, ops: number, t: number, x: number[], y: number[] };
const SPOTS = new WeakMap<object, Spots>();
function spotsOf(s: State, w: World): Spots {
  let sp = SPOTS.get(w.T);
  if (sp && (sp.ops === w.T.ops.length || s.t - sp.t < 20) && s.t >= sp.t) return sp;
  sp = { n: 0, ops: w.T.ops.length, t: s.t, x: [], y: [] };
  const T = w.T, m = w.m;
  for (let x = 0.5; x < m.w; x += 1) {
    let y = m.h;
    while (y > m.water + 0.3) {
      const g = groundBelow(T, x, y, y - m.water);
      if (g === null) break;
      if (boxFree(T, x, g + 0.02, HW, H)) sp.x.push(x), sp.y.push(g);
      y = g - 0.3;
      while (y > m.water && solidAt(T, x, y)) y -= CELL;
    }
  }
  sp.n = sp.x.length;
  SPOTS.set(w.T, sp);
  return sp;
}
// ¿Hay suelo debajo de (x, y) antes del agua?
const groundUnder = (w: World, x: number, y: number) => groundBelow(w.T, x, y + 0.1, y - w.m.water + 0.1) !== null;
// ¿El terreno de adelante se sostiene? (suelo a menos de depth m)
const floorAt = (w: World, x: number, y: number, depth = 3.6) => groundBelow(w.T, x, y + 0.6, depth + 0.6);

// ---- Peligros que vienen ----------------------------------------------------------------------------------------------
// Cajas en el tiempo: cuadro t0..t1 (absolutos) en que algo lastima dentro de [x0, x1] × [y0, y1]; vx mueve la caja
// (m/s) desde el cuadro tr (el tren). Se arman a partir de s.hz / w.m.hz, los proyectiles, los rayos y las ultis.
type Hz = { t0: number, t1: number, x0: number, y0: number, x1: number, y1: number, vx: number, tr: number };
const hz = (t0: number, t1: number, x0: number, y0: number, x1: number, y1: number, vx = 0, tr = 0): Hz => ({ t0, t1, x0, y0, x1, y1, vx, tr });

// Dónde y cuándo pega un proyectil (simulado con el terreno): la caja de su explosión, o null si no amenaza.
function projThreat(s: State, w: World, q: { c: string, x: number, y: number, vx: number, vy: number, fuse: number, st: number, t0: number, arm: number }, out: Hz[]) {
  const d = projOf(q.c);
  if (!d) return;
  const T = w.T, g = G_PROJ * d.g;
  if (q.st === 1) { // pegado al terreno: la mina y la banana esperan a alguien
    if (q.c === 'mina') out.push(hz(s.t, s.t + 600, q.x - 2.4, q.y - 2.4, q.x + 2.4, q.y + 2.4));
    else if (q.c === 'banana') out.push(hz(s.t, s.t + 600, q.x - 0.9, q.y - 0.9, q.x + 0.9, q.y + 1.2));
    return;
  }
  if (q.st === 2) return;
  let x = q.x, y = q.y, vx = q.vx, vy = q.vy;
  const r = d.r, b = d.boom, R = (b ? b.r : 0) + 0.45;
  const maxF = d.fuse && q.fuse > s.t ? Math.min(150, q.fuse - s.t) : d.life ? Math.min(100, Math.round(d.life * HZ) - (s.t - q.t0)) : 80;
  for (let f = 1; f <= maxF; f++) {
    vy -= g * DT;
    if (d.accel) { const v = Math.sqrt(vx * vx + vy * vy), nv = Math.min(d.vmax ?? 40, v + d.accel * DT); if (v > 1e-6) vx *= nv / v, vy *= nv / v; }
    const nx = x + vx * DT, ny = y + vy * DT;
    if (d.pierce) { out.push(hz(s.t + f - 1, s.t + f + 1, nx - r - 0.5, ny - r - 0.5, nx + r + 0.5, ny + r + 0.5)); }
    const hit = solidAt(T, nx + Math.sign(vx) * r, y) || solidAt(T, x, ny + Math.sign(vy) * r);
    if (hit) {
      if (d.bounce && !d.contact) { // rebota: solo aproxima (refleja con el coeficiente)
        if (solidAt(T, nx + Math.sign(vx) * r, y)) vx = -vx * d.bounce; else vy = -vy * d.bounce, vx *= 0.85;
        continue;
      }
      if (d.contact && b) out.push(hz(s.t + f - 1, s.t + f + 2, x - R, y - R, x + R, y + R));
      if (d.sticky && !b) return;
      return;
    }
    x = nx, y = ny;
    if (y < w.m.water) return;
  }
  if (b && (d.fuse || d.life) && !d.pierce) out.push(hz(s.t + maxF - 1, s.t + maxF + 2, x - R, y - R, x + R, y + R));
}

// Todo lo que viene (cuadros absolutos), para esquivar y para descartar guiones que chocan con eso. Se cachea 3 cuadros.
function hazards(s: State, w: World, p: Pl, m: BotMem): Hz[] {
  if (s.t - m.hzT < 3 && s.t >= m.hzT) return m.hz;
  m.hzT = s.t;
  const out: Hz[] = [], t = s.t, mp = w.m, h = s.hz;
  // El tren (EXPRESO): una caja que se mueve, desde que silba
  const tr = mp.hz.train;
  if (tr) {
    const d = h.trainDir, len = tr.len;
    const box = (front: number, tRef: number, t0: number, t1: number) => {
      const x0 = Math.min(front, front - d * len), x1 = Math.max(front, front - d * len);
      out.push(hz(t0, t1, x0, tr.y + 0.75 - H, x1, tr.y + 2.8, d * tr.v, tRef));
    };
    if (h.trainRun) box(h.trainX, t, t, t + Math.ceil((mp.w + len + 8) / tr.v * HZ));
    else if (h.trainNext - t < 20 * HZ) box(d > 0 ? -4 : mp.w + 4, h.trainNext, h.trainNext, h.trainNext + Math.ceil((mp.w + len + 8) / tr.v * HZ));
  }
  // Rocas y meteoritos que van a caer (marcas): se miden en el piso que pegan
  for (const b of s.beams) {
    if (b.k === 'roca' || b.k === 'meteo') {
      const sub = b.k === 'roca' ? 'roca' : 'meteoro';
      const R = (sub === 'roca' ? 2.4 : 3.6) + 0.5;
      const top = mp.h + 4, rc = raycast(w.T, b.x, top, 0, -1, top);
      const yi = rc.d >= 0 ? top - rc.d : mp.water, v0 = sub === 'roca' ? 22 : 26, g = G_PROJ * (sub === 'roca' ? 1 : 1.4);
      // y(t) = top − v0 t − g t²/2 = yi → t
      const tt = (-v0 + Math.sqrt(v0 * v0 + 2 * g * (top - yi))) / g, tf = b.t0 + Math.round(tt * HZ);
      out.push(hz(tf - 1, tf + 2, b.x - R, yi - R, b.x + R, yi + R));
    } else if (b.k === 'mega') {
      if (b.o === p.id) continue;
      const ex = b.x + b.dx * b.len, ey = b.y + b.dy * b.len, n = 16;
      for (let k = 0; k <= n; k++) { const x = b.x + (ex - b.x) * k / n, y = b.y + (ey - b.y) * k / n; out.push(hz(b.t0, b.t1, x - 1.7, y - 1.7, x + 1.7, y + 1.7)); }
    } else if (b.k === 'vaca') {
      if (b.o === p.id) continue;
      out.push(hz(b.t0, b.t1 + 6, b.x - 2.1, mp.water, b.x + 2.1, b.y));
    }
  }
  for (const q of s.pr) {
    if (q.dead || q.o === p.id) continue;
    const ow = q.o >= 0 ? s.pl[q.o] : null;
    if (ow && !enemies(s, p, ow)) continue;
    projThreat(s, w, q, out);
  }
  // Ultis de otros: el tren del EXPRESO y el meteoro que va a caer
  for (const q of s.pl) {
    if (!q.alive || !q.u || q.id === p.id || !enemies(s, p, q)) continue;
    if (q.u.k === 'expreso') {
      const d = q.u.dx >= 0 ? 1 : -1, L = 12, x0 = Math.min(q.u.x, q.u.x - d * L), x1 = Math.max(q.u.x, q.u.x - d * L);
      out.push(hz(t, t + 220, x0, q.u.y - H, x1, q.u.y + 2.6, d * 30, t));
    } else if (q.u.k === 'meteoro' && q.u.f >= 1) {
      out.push(hz(t, t + 140, q.u.x - 5.6, mp.water, q.u.x + 5.6, mp.h));
    }
  }
  m.hz = out;
  return out;
}
// ¿Pega algo a la caja (x, y, alto h) en el cuadro T?
function hzHit(list: Hz[], T: number, x: number, y: number, h: number): boolean {
  for (let k = 0; k < list.length; k++) {
    const z = list[k];
    if (T < z.t0 || T > z.t1) continue;
    const dx = z.vx ? z.vx * (T - z.tr) * DT : 0;
    if (x + HW > z.x0 + dx && x - HW < z.x1 + dx && y + h > z.y0 && y < z.y1) return true;
  }
  return false;
}

// ---- Simulación de guiones ----------------------------------------------------------------------------------------------
// Estado falso para movePlayer: un solo jugador (la copia) y nada más.
const FK = { t: 0, pl: [] as Pl[], props: [] as unknown[], ev: [] as unknown[], rules: null as unknown, hz: null as unknown } as unknown as State;
const IN: Input = { ...NO_INPUT };
// Resultado de la última prueba (se reutiliza para no ensuciar la memoria)
export const TR = { end: 0, f: 0, x: 0, y: 0, vx: 0, vy: 0, minY: 0, hurt: false };
// Cómo terminó: 0 sin aterrizar (se acabó el tiempo), 1 aterrizó, 2 al agua, 3 fuera del ring, 4 lo pega un peligro, 5 sigue parado y a salvo
const T_FLY = 0, T_LAND = 1, T_WATER = 2, T_OUT = 3, T_HURT = 4, T_STAY = 5;

function clonePl(p: Pl): Pl {
  const q = { ...p } as Pl;
  if (p.hook) q.hook = { ...p.hook };
  return q;
}

// Entrada de un guion en el cuadro f (q = el jugador, para la liga que se suelta al pasar el borde)
const ST = { hrel: -1, hStart: -1 };
function scInput(sc: Sc, f: number, q: Pl, i: Input) {
  i.x = 0, i.y = 0, i.jump = false, i.dash = false, i.hook = false, i.ulti = false, i.cast = -1, i.ax = 0, i.ay = 0;
  let hookOn = false, ax = 0, ay = 0, smart = false, sc4 = 0, sd = 0;
  for (const e of sc.ev) {
    if (e.f > f) break;
    switch (e.k) {
      case 'mv': i.x = e.a, i.y = e.b; break;
      case 'jd': i.jump = true; break;
      case 'ju': i.jump = false; break;
      case 'hd': hookOn = true, ax = e.a, ay = e.b, smart = false; break;
      case 'hu': hookOn = false; break;
      case 'hs': hookOn = true, ax = e.a, ay = e.b, smart = true, sc4 = e.c, sd = e.d; ST.hStart = e.f; break;
      case 'dash': if (e.f === f) i.dash = true, i.x = e.a, i.y = e.b; break;
      case 'cast': if (e.f === f) i.cast = e.a, i.ax = e.b, i.ay = e.c; break;
    }
  }
  if (smart) { // liga que se suelta sola al pasar por encima de la meta (o tras sc4 cuadros): después salta (bit 0) y/o hace el doble salto (bit 1)
    if (ST.hrel < 0 && f > ST.hStart + 4 && ((q.y > sc.gy + 0.25 && q.vy > -2) || f - ST.hStart > sc4)) ST.hrel = f;
    if (ST.hrel >= 0) {
      hookOn = false;
      if ((sd & 1) && f >= ST.hrel && f < ST.hrel + 2) i.jump = true;
      if ((sd & 2) && f >= ST.hrel + 8 && f < ST.hrel + 22) i.jump = true;
    }
  }
  if (hookOn) i.hook = true, i.ax = ax, i.ay = ay;
  // la entrada propia se mantiene mientras el guion sigue corriendo; las manos libres no estorban
}

// Viento actual y futuro (aceleración por cuadro hacia +x), para la simulación
function windAt(s: State, w: World, T: number): number {
  const wi = w.m.hz.wind, h = s.hz;
  if (!wi) return 0;
  if (h.windDir && T < h.windEnd) return h.windDir * wi.a * DT;
  if (h.windWarn && T >= h.windNext && T < h.windNext + Math.round(wi.dur * HZ)) return h.windWarn * wi.a * DT;
  return 0;
}

// Prueba un guion con la física real. f0 = cuadro del guion en que arranca esta copia (para validar lo que queda de un
// plan en curso). Termina al aterrizar, al caer, si lo pega un peligro o a los maxF cuadros. stay: si el guion no
// despega, termina «a salvo» cuando pasa el último peligro (hzEnd).
function trial(s: State, w: World, p: Pl, sc: Sc, f0: number, maxF: number, list: Hz[], hzEnd = 0, hrel = -1, hStart = -1): number {
  const q = clonePl(p), c = w.c, wm = w.m, lava = wm.lava;
  FK.t = s.t, FK.pl = [q], FK.rules = s.rules, FK.props = [], FK.hz = s.hz;
  ST.hrel = hrel, ST.hStart = hStart;
  const wi = wm.hz.wind ? 1 : 0;
  let left = p.ground ? 0 : 1, minY = q.y, res = T_FLY, f = f0;
  const total = f0 + maxF;
  for (; f < total; f++) {
    const T = s.t + 1 + (f - f0);
    FK.t = T;
    if (wi) { const a = windAt(s, w, T); if (a && !inUlti(q) && T >= q.cloudT) q.vx += q.ground ? a * 0.3 : a; }
    scInput(sc, f, q, IN);
    if (IN.cast >= 0) emulateCast(s, w, q, IN);
    FK.ev.length = 0;
    movePlayer(FK, w, q, IN);
    if (q.y < minY) minY = q.y;
    if (q.y < wm.water - (lava ? 0 : 0.5)) { res = T_WATER; break; }
    if (q.x < -BLAST_X || q.x > wm.w + BLAST_X || q.y > wm.h + BLAST_TOP) { res = T_OUT; break; }
    if (list.length && hzHit(list, T, q.x, q.y, height(q))) { res = T_HURT; break; }
    if (!q.ground) left = 1;
    else if (left && !q.hook && f > f0 + 1) { res = T_LAND; break; }
    if (q.ground && !left && hzEnd && T > hzEnd) { res = T_STAY; break; }
  }
  TR.end = res, TR.f = f - f0, TR.x = q.x, TR.y = q.y, TR.vx = q.vx, TR.vy = q.vy, TR.minY = minY;
  return res;
}
// Efecto de las cartas de movimiento dentro de la simulación (las del juego viven en combat.ts)
function emulateCast(s: State, w: World, q: Pl, i: Input) {
  const slot = i.cast, id = slot === 4 ? q.bonus : q.hand[slot];
  const ch = charOf(q.ch);
  i.cast = -1;
  if (id === 'supersalto') {
    const n = Math.sqrt(i.ax * i.ax + i.ay * i.ay) || 1, ax = i.ax / n, ay = i.ay / n;
    q.vx = ax * 20 + q.vx * 0.2, q.vy = ay * 20 + (ay > -0.3 ? 3 : 0);
    q.air = ch.airJumps, q.dashN = ch.dashN, q.ground = false, q.slide = false, q.pound = false, q.dashT = NEVER;
  }
}

// ---- Utilidades de movimiento -------------------------------------------------------------------------------------------
const scOf = (name: string, tier: number, gy: number, ev: Ev[], len: number): Sc => ({ name, ev, len, gy, tier });
// Saltar en el cuadro f (apretado 14 cuadros: el doble salto no se corta al soltar)
const jumpAt = (f: number, hold = 14): Ev[] => [E(f, 'jd'), E(f + hold, 'ju')];

// El mejor lugar para caer: cerca (según la inercia), no muy arriba y hacia donde está lo que le interesa
function bestSpots(s: State, w: World, p: Pl, goalX: number, n: number): [number, number][] {
  const sp = spotsOf(s, w), px = p.x + p.vx * 0.5, out: [number, number, number][] = [];
  for (let k = 0; k < sp.n; k++) {
    const sx = sp.x[k], sy = sp.y[k];
    const d = Math.abs(sx - px) + Math.max(0, sy - p.y) * 1.3 + Math.abs(sx - goalX) * 0.15 + (sy < w.m.water + 1.5 ? 50 : 0);
    out.push([sx, sy, d]);
  }
  out.sort((a, b) => a[2] - b[2]);
  const res: [number, number][] = [];
  for (const o of out) {
    if (res.some(r => Math.abs(r[0] - o[0]) < 5 && Math.abs(r[1] - o[1]) < 2)) continue;
    res.push([o[0], o[1]]);
    if (res.length >= n) break;
  }
  return res;
}


// ---- Mapa de plataformas ------------------------------------------------------------------------------------------------
// Las superficies agrupadas en plataformas (tramos seguidos de suelo) y quién llega a quién (con qué herramienta):
// un grafo grueso para saber hacia qué plataforma ir cuando el rival está en otra. Las pruebas con la física real
// deciden después si el salto sale; esto solo marca el camino. Se recalcula cuando el terreno cambia.
type Seg = { x: number[], y: number[], x0: number, x1: number };
type Nav = { n: number, ops: number, t: number, segs: Seg[], adj: [number, number][][] };
const NAV = new WeakMap<object, Nav>();
function navOf(s: State, w: World): Nav {
  let nv = NAV.get(w.T);
  if (nv && (nv.ops === w.T.ops.length || s.t - nv.t < 30) && s.t >= nv.t) return nv;
  const sp = spotsOf(s, w), segs: Seg[] = [], used = new Uint8Array(sp.n);
  // cada punto se une a vecinos a 1 m con diferencia de altura chica
  const order = Array.from({ length: sp.n }, (_, k) => k).sort((a, b) => sp.x[a] - sp.x[b]);
  for (const k of order) {
    if (used[k]) continue;
    const seg: Seg = { x: [sp.x[k]], y: [sp.y[k]], x0: sp.x[k], x1: sp.x[k] };
    used[k] = 1;
    for (let grow = true; grow;) {
      grow = false;
      for (const j of order) {
        if (used[j]) continue;
        const lx = seg.x[seg.x.length - 1], ly = seg.y[seg.y.length - 1];
        if (Math.abs(sp.x[j] - lx - 1) < 0.01 && Math.abs(sp.y[j] - ly) <= 0.65) { seg.x.push(sp.x[j]), seg.y.push(sp.y[j]), used[j] = 1, grow = true; break; }
      }
    }
    seg.x1 = seg.x[seg.x.length - 1];
    if (seg.x.length >= 2) segs.push(seg);
  }
  const n = segs.length, adj: [number, number][][] = Array.from({ length: n }, () => []);
  nv = { n, ops: w.T.ops.length, t: s.t, segs, adj };
  // capacidades de un cuerpo promedio, de lo que dice w.c
  const c = w.c, up1 = c.JUMP_H + c.JUMP2_H * 0.9, L = c.HOOK_LEN * 0.92;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    if (a === b) continue;
    const A = segs[a], B = segs[b];
    // el par de puntos más cercanos en x (y entre esos el más cercano en y)
    let best = 1e9, ia = 0, ib = 0;
    for (let i = 0; i < A.x.length; i++) for (let j = 0; j < B.x.length; j++) {
      const d = Math.abs(A.x[i] - B.x[j]) * 2 + Math.abs(A.y[i] - B.y[j]);
      if (d < best) best = d, ia = i, ib = j;
    }
    const gx = Math.abs(A.x[ia] - B.x[ib]), dy = B.y[ib] - A.y[ia], up = Math.max(0, dy), down = Math.max(0, -dy);
    if (gx > 14 || up > 12.5) continue;
    // sin pared de por medio (a la altura del pecho)
    const x0 = A.x[ia], y0 = A.y[ia] + 1.4, x1 = B.x[ib], y1 = B.y[ib] + 1.4, dd = dist(x0, y0, x1, y1);
    if (dd > 0.5 && raycast(w.T, x0, y0, (x1 - x0) / dd, (y1 - y0) / dd, dd - 0.3).d >= 0) continue;
    let tier = -1;
    if (up <= up1 && gx <= (up > 0 ? 6.5 - up * 0.6 : 7.5 + Math.min(5, down * 0.5))) tier = 0;
    else if (up <= up1 + 1.2 && gx <= (up > 0 ? 10 - up * 0.5 : 11 + Math.min(5, down * 0.5))) tier = 1;
    else if (dd <= L + 2 || (up <= 12 && dist(x0, A.y[ia] + 0.7, x1, B.y[ib] + 0.7) <= L * 1.15)) tier = 2;
    if (tier >= 0) adj[a].push([b, tier]);
  }
  NAV.set(w.T, nv);
  return nv;
}
// Plataforma donde está (o debajo de) un punto: −1 si no hay ninguna cerca
function segOf(nv: Nav, x: number, y: number): number {
  let best = -1, bs = 1e9;
  for (let k = 0; k < nv.n; k++) {
    const g = nv.segs[k];
    if (x < g.x0 - 0.8 || x > g.x1 + 0.8) continue;
    let yy = g.y[0], bd = 1e9;
    for (let i = 0; i < g.x.length; i++) { const d = Math.abs(g.x[i] - x); if (d < bd) bd = d, yy = g.y[i]; }
    const sc = yy <= y + 1.1 ? y - yy : 40 + (yy - y);
    if (sc < bs) bs = sc, best = k;
  }
  return bs < 60 ? best : -1;
}
// Camino de plataformas de a a b con las herramientas permitidas (maxTier); null si no hay
function navPath(nv: Nav, a: number, b: number, maxTier: number): number[] | null {
  if (a < 0 || b < 0) return null;
  if (a === b) return [a];
  const dist2 = new Array<number>(nv.n).fill(1e9), prev = new Array<number>(nv.n).fill(-1), done = new Array<boolean>(nv.n).fill(false);
  dist2[a] = 0;
  for (;;) {
    let u = -1;
    for (let k = 0; k < nv.n; k++) if (!done[k] && dist2[k] < 1e9 && (u < 0 || dist2[k] < dist2[u])) u = k;
    if (u < 0 || u === b) break;
    done[u] = true;
    for (const [v, tier] of nv.adj[u]) {
      if (tier > maxTier) continue;
      const nd = dist2[u] + 1 + tier * 0.7;
      if (nd < dist2[v]) dist2[v] = nd, prev[v] = u;
    }
  }
  if (dist2[b] >= 1e9) return null;
  const path = [b];
  while (path[0] !== a) path.unshift(prev[path[0]]);
  return path;
}
// Un lugar de la plataforma k para saltar hacia ella desde x (adentro del borde)
function segPoint(nv: Nav, k: number, x: number): [number, number] {
  const g = nv.segs[k];
  const lo = g.x.length > 4 ? 1.5 : 0.5, xx = clamp(x, g.x0 + lo, g.x1 - lo);
  let yy = g.y[0], bd = 1e9;
  for (let i = 0; i < g.x.length; i++) { const d = Math.abs(g.x[i] - xx); if (d < bd) bd = d, yy = g.y[i]; }
  return [xx, yy];
}

// ---- Planes: generar, probar, ejecutar ------------------------------------------------------------------------------
const mk = (name: string, tier: number, gy: number, ev: Ev[], len = 110): Sc => (ev.sort((a, b) => a.f - b.f), scOf(name, tier, gy, ev, len));
const slotOf = (s: State, p: Pl, id: string): number => {
  for (let k = 0; k < 4; k++) if (p.hand[k] === id && (s.rules.infinite || p.mana >= CARD[id].cost)) return k;
  return p.bonus === id ? 4 : -1;
};
const canHook = (s: State, p: Pl) => p.charge >= 1 && s.t >= p.hookT && !p.u;

// Guiones para volver al aire libre (en el aire): de la herramienta más barata a la más cara
function genAir(s: State, w: World, p: Pl, tier: number, sp: [number, number], out: Sc[]) {
  const dx = sp[0] - p.x, d = Math.abs(dx) > 0.4 ? sgn(dx) : 0, mv = E(0, 'mv', d, 0), gy = sp[1], c = w.c;
  switch (tier) {
    case 0: out.push(mk('camina', 0, gy, [mv])); break;
    case 1: { // doble salto (uno o dos) y salto de pared
      for (const f of [0, 3, 6, 10, 15, 21, 28, 36, 46]) out.push(mk('doble', 1, gy, [mv, ...jumpAt(f)]));
      if (p.air >= 2) for (const f1 of [0, 6, 12]) for (const g of [16, 24, 34]) out.push(mk('doble2', 1, gy, [mv, ...jumpAt(f1, 10), ...jumpAt(f1 + g)]));
      const near = p.wall !== 0 || s.t - p.wallT <= c.WALL_COYOTE, side = p.wall || p.wallSide;
      if (near && side) for (const f0 of [0, 4]) out.push(mk('pared', 1, gy, [E(0, 'mv', side, 0), ...jumpAt(f0, 12), ...jumpAt(f0 + 16, 12), ...jumpAt(f0 + 32, 12), ...jumpAt(f0 + 48, 12)]));
      break;
    }
    case 2: { // dash (con salto antes o después)
      if (p.dashN < 1 || s.t < p.dashCdT) break;
      const fx = d || p.face, dirs: [number, number][] = [[fx, 0], [fx, 1], [0, 1], [fx, -1], [-fx, 1]];
      for (const [ax, ay] of dirs) for (const f of [0, 4, 9, 15, 24]) for (const jf of [-1, 0, 6, 14])
        out.push(mk('dash', 2, gy, [mv, E(f, 'dash', ax, ay), ...(jf >= 0 && p.air >= 1 ? jumpAt(jf) : [])]));
      break;
    }
    case 3: { // liga a una pared o a un borde, soltando con salto (y doble) cuando pasa por encima
      if (!canHook(s, p)) break;
      const ch = charOf(p.ch), L = c.HOOK_LEN * ch.hookLen, g = gravity(c), t0 = p.hookHeld ? 1 : 0;
      for (const f of [t0, t0 + 5, t0 + 11]) {
        const q = { ...p, x: p.x + p.vx * f * DT, y: p.y + p.vy * f * DT - 0.5 * g * (f * DT) ** 2 } as Pl;
        const aims: [number, number][] = [];
        for (let a = 0; a < 16; a++) {
          const an = a * Math.PI / 8, ax = Math.cos(an), ay = Math.sin(an);
          IN.x = 0, IN.y = 0, IN.ax = ax, IN.ay = ay;
          const tg = hookTarget(FK_for(s, q), w, q, IN);
          if (tg && !tg.grace && tg.e < 0 && tg.d <= L) aims.push([ax, ay]);
        }
        const n = Math.sqrt(dx * dx + (sp[1] - p.y) * (sp[1] - p.y)) || 1;
        if (n < L) aims.push([dx / n, (sp[1] - p.y + 0.8) / n]);
        for (const [ax, ay] of aims) for (const sd of [1, 3, 0]) out.push(mk('liga', 3, gy, [mv, ...(t0 ? [E(0, 'hu')] : []), E(f, 'hs', ax, ay, 55, sd)]));
      }
      break;
    }
    case 4: { // cartas de movimiento
      const k = slotOf(s, p, 'supersalto');
      if (k >= 0 && s.t >= p.castT) for (const f of [0, 4, 10]) for (const up of [1.5, 3.5, 6]) {
        const vx = sp[0] - p.x, vy = sp[1] - p.y + up, n = Math.sqrt(vx * vx + vy * vy) || 1;
        out.push(mk('supersalto', 4, gy, [mv, E(f, 'cast', k, vx / n, vy / n)]));
      }
      break;
    }
  }
}
function FK_for(s: State, q: Pl): State { FK.t = s.t, FK.pl = [q], FK.rules = s.rules, FK.props = [], FK.hz = s.hz; return FK; }

// Busca el primer guion que aterriza a salvo. maxTier limita las herramientas; budget, la cantidad de pruebas.
function searchAir(s: State, w: World, p: Pl, m: BotMem, D: Diff, list: Hz[], goalX: number): Sc | null {
  const spots = bestSpots(s, w, p, goalX, 3);
  const maxTier = D.tools >= 2 ? 4 : D.tools === 1 ? 2 : 1;
  let budget = D.plan * 5, best: Sc | null = null, bs = -1e9;
  const cands: Sc[] = [];
  for (let tier = 0; tier <= maxTier; tier++) {
    for (const sp of spots) {
      cands.length = 0;
      genAir(s, w, p, tier, sp, cands);
      for (const sc of cands) {
        if (budget-- <= 0) return best;
        const r = trial(s, w, p, sc, 0, 110, list);
        if (r === T_LAND) return sc;
        const sv = TR.f + (r === T_FLY ? 100 : 0) + TR.minY * 0.5;
        if (sv > bs) bs = sv, best = sc;
      }
    }
  }
  return best;
}

// Guiones para esquivar en el suelo: correr, saltar, doble salto, dash
function genDodge(s: State, w: World, p: Pl, D: Diff, out: Sc[]) {
  const gy = p.y;
  for (const d of [1, -1]) {
    out.push(mk('corre', 0, gy, [E(0, 'mv', d, 0)], 80));
    out.push(mk('salta', 0, gy, [E(0, 'mv', d, 0), ...jumpAt(0, 16)], 90));
  }
  out.push(mk('salta', 0, gy, [E(0, 'mv', 0, 0), ...jumpAt(0, 16)], 90));
  if (D.tools >= 1 && p.air >= 1) {
    for (const d of [0, 1, -1]) for (const f of [8, 12, 16, 22]) out.push(mk('doble', 1, gy, [E(0, 'mv', d, 0), ...jumpAt(0, 16), ...jumpAt(f + 10)], 100));
  }
  if (D.tools >= 1 && p.dashN >= 1 && s.t >= p.dashCdT) for (const d of [1, -1]) for (const f of [0, 6, 12]) out.push(mk('dash', 2, gy, [E(0, 'mv', d, 0), E(f, 'dash', d, 0)], 80));
  if (D.tools >= 3 && p.dashN >= 1 && s.t >= p.dashCdT) for (const d of [1, -1]) out.push(mk('dash+salto', 2, gy, [E(0, 'mv', d, 0), E(0, 'dash', d, 1), ...jumpAt(4)], 90));
}
function searchDodge(s: State, w: World, p: Pl, m: BotMem, D: Diff, list: Hz[], hzEnd: number): Sc | null {
  const cands: Sc[] = [];
  genDodge(s, w, p, D, cands);
  let budget = D.plan * 3, best: Sc | null = null, bs = -1e9;
  for (const sc of cands) {
    if (budget-- <= 0) break;
    const r = trial(s, w, p, sc, 0, 100, list, hzEnd);
    if (r === T_LAND || r === T_STAY) return sc;
    const sv = TR.f + (r === T_FLY ? 100 : 0);
    if (sv > bs && r !== T_WATER && r !== T_OUT) bs = sv, best = sc;
  }
  return best && bs > 30 ? best : null;
}

// Ejecuta el plan en curso. Devuelve null si no hay (o terminó o dejó de servir).
function runPlan(s: State, w: World, p: Pl, m: BotMem, list: Hz[], i: Input): Input | null {
  const sc = m.sc;
  if (!sc) return null;
  const f = s.t - m.scT;
  if (f >= sc.len || s.t < p.stunT || p.u || (f > 4 && p.ground && sc.name !== 'corre' && sc.name !== 'camina' && !p.hook) || (sc.tier < 0)) { m.sc = null; return null; }
  if (s.t - m.scChk >= 5) { // ¿sigue sirviendo lo que queda del guion?
    m.scChk = s.t;
    const r = trial(s, w, p, sc, f, Math.min(110, sc.len - f), list, 0, m.hrel, m.hStart);
    if (r !== T_LAND && r !== T_STAY && r !== T_FLY || (r === T_FLY && TR.y < w.m.water + 1)) { m.sc = null; return null; }
  }
  ST.hrel = m.hrel, ST.hStart = m.hStart;
  scInput(sc, f, p, i);
  m.hrel = ST.hrel, m.hStart = ST.hStart;
  return i;
}
const setPlan = (m: BotMem, s: State, sc: Sc) => { m.sc = sc, m.scT = s.t, m.scChk = s.t, m.hrel = -1, m.hStart = -1; };

// ---- Caminar sin caerse -------------------------------------------------------------------------------------------------
// 0 libre, 1 borde adelante (frena), 2 pared que no pasa con un escalón
function walk(w: World, p: Pl, m: BotMem, gx: number, i: Input, tol = 0.5): number {
  const c = w.c, dx = gx - p.x;
  if (Math.abs(dx) < tol) { i.x = 0; return 0; }
  const dir = sgn(dx);
  i.x = dir;
  if (!p.ground) return 0;
  const moving = p.vx * dir > 0, brake = moving ? p.vx * p.vx / (2 * c.DEC) : 0;
  if (m.careful) {
    const fl = floorAt(w, p.x + dir * (1.15 + brake), p.y);
    if (fl === null || fl < w.m.water + 2.5) { i.x = moving && p.vx * dir > 4 ? -dir : 0; return 1; }
  }
  if (Math.abs(sweepX(w.T, p.x, p.y + c.STEP + 0.05, HW, H - c.STEP - 0.1, dir * (0.5 + brake * 0.5))) < 0.4 + brake * 0.5 - 0.02) return 2;
  return 0;
}
// Distancia hasta el borde (o la pared) caminando hacia dir, hasta max m. −1 si no hay.
function edgeAhead(w: World, p: Pl, dir: number, max: number): number {
  for (let d = 0.5; d <= max; d += 0.5) {
    const fl = floorAt(w, p.x + dir * d, p.y);
    if (fl === null) return d;
  }
  return -1;
}

// ---- Cruzar a otra isla o subir -------------------------------------------------------------------------------------------
// h = qué tan lejos queda de la meta (la altura pesa más)
const hOf = (x: number, y: number, gx: number, gy: number) => Math.abs(x - gx) + 1.25 * Math.abs(y - gy);

function genTransit(s: State, w: World, p: Pl, D: Diff, tier: number, gx: number, gy: number, out: Sc[]) {
  const dir = Math.abs(gx - p.x) > 0.5 ? sgn(gx - p.x) : p.face, c = w.c, mv = E(0, 'mv', dir, 0);
  switch (tier) {
    case 0: { // correr y saltar (con o sin doble salto) o dejarse caer; también hacia el otro lado (rodear, bajar)
      out.push(mk('camina', 0, gy, [mv], 80));
      for (const r of [0, 4, 8, 12, 17, 23, 30, 38]) {
        out.push(mk('salta', 0, gy, [mv, ...jumpAt(r, 16)], 90));
        if (D.tools >= 1 && p.air >= 1) for (const g of [10, 15, 21, 28]) out.push(mk('doble', 0, gy, [mv, ...jumpAt(r, 14), ...jumpAt(r + g)], 110));
      }
      const mb = E(0, 'mv', -dir, 0);
      out.push(mk('camina-', 0, gy, [mb], 80));
      for (const r of [0, 6, 14, 24]) out.push(mk('salta-', 0, gy, [mb, ...jumpAt(r, 16)], 90));
      break;
    }
    case 1: { // + dash en el vuelo
      if (p.dashN < 1 || s.t < p.dashCdT) break;
      for (const r of [0, 6, 12, 20, 30]) for (const g of [3, 8, 14, 22]) for (const ay of [0, 1]) {
        out.push(mk('salta+dash', 1, gy, [mv, ...jumpAt(r, 16), E(r + g, 'dash', dir, ay)], 110));
        if (p.air >= 1) out.push(mk('doble+dash', 1, gy, [mv, ...jumpAt(r, 14), ...jumpAt(r + g + 8), E(r + g, 'dash', dir, ay)], 110));
      }
      break;
    }
    case 2: { // liga a un borde o una pared de la isla de destino, soltando con salto y doble salto
      if (!canHook(s, p)) break;
      const ch = charOf(p.ch), L = c.HOOK_LEN * ch.hookLen;
      for (const r of [0, 8, 16, 26]) for (const j of [0, 1]) {
        // la liga se dispara en el aire (después de saltar) o desde el suelo
        const f = r + (j ? 6 : 0);
        const q = { ...p } as Pl;
        for (let a = 0; a < 16; a++) {
          const an = a * Math.PI / 8, ax = Math.cos(an), ay = Math.sin(an);
          if (ax * dir < -0.2) continue; // solo hacia adelante o arriba
          IN.x = 0, IN.y = 0, IN.ax = ax, IN.ay = ay;
          q.x = p.x + dir * Math.min(r, 20) * 0.12, q.y = p.y + (j ? 1.5 : 0);
          const tg = hookTarget(FK_for(s, q), w, q, IN);
          if (!tg || tg.grace || tg.e >= 0 || tg.d > L) continue;
          for (const sd of [1, 3]) out.push(mk('liga', 2, gy, [mv, ...(j ? jumpAt(r, 12) : []), E(f, 'hs', ax, ay, 55, sd)], 120));
        }
      }
      break;
    }
    case 3: { // trucos: dash al suelo (wavedash) + salto largo
      if (p.dashN < 1 || s.t < p.dashCdT || !p.ground) break;
      for (const g of [3, 5, 8]) for (const dbl of [-1, 12, 18]) out.push(mk('hyper', 3, gy, [mv, E(0, 'dash', dir, -1), ...jumpAt(g, 14), ...(dbl >= 0 && p.air >= 1 ? jumpAt(g + dbl) : [])], 110));
      break;
    }
  }
}

// Mejor guion para acercarse a (gx, gy): el primero (de lo barato a lo caro) que aterriza a salvo y mejora h
function searchTransit(s: State, w: World, p: Pl, m: BotMem, D: Diff, list: Hz[], gx: number, gy: number, need: number): Sc | null {
  const h0 = hOf(p.x, p.y, gx, gy), maxTier = D.tools >= 3 ? 3 : D.tools >= 2 ? 2 : D.tools >= 1 ? 1 : 0;
  const cands: Sc[] = [];
  let budget = D.plan * 4;
  for (let tier = 0; tier <= maxTier; tier++) {
    cands.length = 0;
    genTransit(s, w, p, D, tier, gx, gy, cands);
    let best: Sc | null = null, bh = h0 - need;
    for (const sc of cands) {
      if (budget-- <= 0) break;
      const r = trial(s, w, p, sc, 0, sc.len, list);
      if (r !== T_LAND || !groundUnder(w, TR.x, TR.y)) continue;
      const fl = floorAt(w, TR.x, TR.y, 0.6), edgeOk = floorAt(w, TR.x - 0.5, TR.y, 0.6) !== null && floorAt(w, TR.x + 0.5, TR.y, 0.6) !== null;
      void fl;
      const h = hOf(TR.x, TR.y, gx, gy) + (edgeOk ? 0 : 1.5) + (list.length ? 0 : 0);
      if (h < bh) bh = h, best = sc;
    }
    if (best) return best;
    if (budget <= 0) break;
  }
  return null;
}

// ¿Se puede caminar hasta gx? 0 sí, 1 hay un hueco (a `at` m), 2 una pared alta
function pathTo(w: World, x0: number, y0: number, gx: number): { st: number, at: number } {
  const dir = sgn(gx - x0), T = w.T, n = Math.abs(gx - x0);
  let y = y0;
  for (let d = 0.5; d <= n + 0.01; d += 0.5) {
    const x = x0 + dir * d, g = groundBelow(T, x, y + 2.55, 4.2);
    if (g === null || g < w.m.water + 1) return { st: 1, at: d };
    if (g - y > 2.45 || (g > y + 0.3 && !boxFree(T, x, g + 0.02, HW, H))) return { st: 2, at: d };
    y = g;
  }
  return { st: 0, at: n };
}

const aimAt = (p: Pl, q: Pl, i: Input) => {
  const dx = q.x - p.x, dy = mid(q) - (p.y + HAND_Y), n = Math.sqrt(dx * dx + dy * dy) || 1;
  i.ax = dx / n, i.ay = dy / n;
};

// ---- Aturdido: influencia (DI) y tech ----------------------------------------------------------------------------------
// El empuje ya lo recibió; lo que se puede hacer es desviarlo un poco con el joystick y apretar SALTO justo antes de
// pegar contra algo (tech). Los cuadros que faltan para el golpe salen de simular el vuelo con la física real.
function stunInput(s: State, w: World, p: Pl, m: BotMem, D: Diff, goalX: number, i: Input): Input {
  const t = s.t, c = w.c;
  m.sc = null;
  if (m.stunSeen !== p.stunT) m.stunSeen = p.stunT, m.techPlan = r01(m) < D.tech, m.techF = -1;
  const sp = bestSpots(s, w, p, goalX, 1)[0];
  i.x = sp ? sgn(sp[0] - p.x) : sgn(w.m.w / 2 - p.x);
  i.y = 0.5;
  if (m.techPlan && t - p.techT0 > 40 && p.vx * p.vx + p.vy * p.vy > c.BOUNCE_V * c.BOUNCE_V) {
    const q = clonePl(p);
    FK_for(s, q);
    for (let f = 0; f < c.TECH + 4; f++) {
      FK.t = s.t + 1 + f, FK.ev.length = 0;
      movePlayer(FK, w, q, NO_INPUT);
      if ((FK.ev as { k: string }[]).some(e => e.k === 'bounce')) { if (f <= c.TECH - 2 && f >= 1) i.jump = true, m.techPlan = false; break; }
    }
  }
  return i;
}

// ---- Ulti en curso ----------------------------------------------------------------------------------------------------
// Dónde caería una tajada de SOMBRA en la dirección (dx, dy): igual que ultiStep (hasta 9 m, libre y sobre el agua)
function slashEnd(w: World, p: Pl, dx: number, dy: number): [number, number] {
  let d = 9;
  for (; d > 0; d -= CELL) if (boxFree(w.T, p.x + dx * d, p.y + dy * d, HW, H) && p.y + dy * d > w.m.water + 0.6) break;
  return [p.x + dx * d, p.y + dy * d];
}
function ultiInput(s: State, w: World, p: Pl, m: BotMem, D: Diff, q: Pl | null, i: Input): Input {
  const u = p.u!, f = s.t - u.ft, mp = w.m;
  const foes: Pl[] = [];
  for (const o of s.pl) if (o.alive && enemies(s, p, o) && !o.u) foes.push(o);
  const aimTo = (x: number, y: number) => { const dx = x - p.x, dy = y - mid(p), n = Math.sqrt(dx * dx + dy * dy) || 1; i.ax = dx / n, i.ay = dy / n; };
  const spot = (gx: number) => bestSpots(s, w, p, gx, 1)[0] ?? [mp.w / 2, mp.water + 5];
  switch (u.k) {
    case 'meteoro': {
      if (u.f !== 1) break;
      // el rival parado en suelo firme con más daño (adonde va a estar cuando caiga)
      let best = -1e9, tx = u.x;
      for (const o of foes) {
        const [px] = predictAt(w, o, 0.8, D.lead), sx = clamp(px, 1, mp.w - 1);
        const ok = groundUnder(w, sx, mp.h);
        const sc = o.dmg + (o.ground ? 25 : 0) - Math.abs(sx - u.x) * 0.5 + (ok ? 40 : 0);
        if (sc > best) best = sc, tx = ok ? sx : spot(sx)[0];
      }
      i.x = Math.abs(tx - u.x) > 0.7 ? sgn(tx - u.x) : 0;
      if (Math.abs(tx - u.x) < 1 && f > 10) i.ulti = true;
      break;
    }
    case 'cohete': {
      // primero a los rivales; con un golpe dado (o con el tiempo) vuelve a un lugar firme y explota ahí arriba
      const hit = u.ids.length > 0 || f > 75;
      if (!hit && q) {
        const T = dist(p.x, p.y, q.x, q.y) / 27, [px, py] = predictAt(w, q, T, D.lead);
        aimTo(px, py + 0.5);
      } else {
        const sp = spot(p.x);
        aimTo(sp[0], sp[1] + 1.5);
        if (dist(p.x, p.y, sp[0], sp[1]) < 6 && f > 20) i.ulti = true;
      }
      if (f > 120) i.ulti = true;
      break;
    }
    case 'sombra': {
      if (u.n >= 3 || f < 7) break;
      // la tajada (hasta 9 m) que más rivales cruza y deja en un lugar firme; la última siempre a salvo
      const last = u.n >= 2;
      let best = -1e9, bx = 0, by = 0;
      for (let a = 0; a < 16; a++) {
        const an = a * Math.PI / 8, dx = Math.cos(an), dy = Math.sin(an), [x1, y1] = slashEnd(w, p, dx, dy);
        let sc = 0;
        const x0 = p.x, y0 = mid(p), ex = x1 - x0, ey = y1 + 0.55 - y0, L2 = ex * ex + ey * ey || 1;
        for (const o of foes) {
          const k = clamp(((o.x - x0) * ex + (mid(o) - y0) * ey) / L2, 0, 1), cx = o.x - x0 - ex * k, cy = mid(o) - y0 - ey * k;
          if (cx * cx + cy * cy < 1.0) sc += 14 + koProb(s, w, o, 13, 15, 11, dx, dy + 0.5) * 12;
        }
        const g = groundUnder(w, x1, y1) && y1 > mp.water + 2, sp = spot(x1), ds = dist(x1, y1, sp[0], sp[1]);
        sc += g ? 6 : -ds * (last ? 6 : 1.5);
        if (x1 < -3 || x1 > mp.w + 3 || y1 > mp.h + 1) sc -= 60;
        if (last && !g) sc -= 30;
        if (D.ult < 0.4) sc += (r01(m) - 0.5) * 30;
        if (sc > best) best = sc, bx = dx, by = dy;
      }
      i.ax = bx, i.ay = by, i.ulti = !p.ultiHeld;
      break;
    }
    case 'abduccion': {
      if (!u.ids.length) { // buscarlo: por encima de él, a unos 4 m
        const tg = q ?? foes[0];
        if (tg) {
          const [px, py] = predictAt(w, tg, 0.4, D.lead);
          i.x = Math.abs(px - p.x) > 0.5 ? sgn(px - p.x) : 0;
          i.y = clamp((py + 4 - p.y) / 2, -1, 1);
        }
      } else { // llevarlos al vacío del lado de afuera más cercano y soltarlos ahí, yendo rápido
        const out = p.x < mp.w / 2 ? -1 : 1, outside = Math.abs(p.x - mp.w / 2) > mp.w / 2 - 0.5 || !groundUnder(w, p.x, p.y) && edgeDistFrom(w, p.x, p.y, out) > 2.5;
        i.x = out;
        // altura: por encima del relieve de más adelante, sin salirse del techo
        let top = mp.water;
        for (let d = 0; d < 8; d++) { const g = groundBelow(w.T, p.x + out * d, mp.h, mp.h - mp.water); if (g !== null) top = Math.max(top, g); }
        i.y = clamp((top + 4.5 - p.y) / 2, -1, 1);
        if (outside && Math.abs(p.vx) > 9 && f > 32) i.ulti = true;
      }
      break;
    }
    case 'expreso': {
      if (u.n !== 0) break;
      const dir = u.dx >= 0 ? 1 : -1;
      let ahead = false;
      for (const o of foes) if ((o.x - p.x) * dir > 1 && Math.abs(o.y - u.y) < 3.5 && !u.ids.includes(o.id)) ahead = true;
      if (!ahead && f > 20) i.jump = true;
      break;
    }
  }
  return i;
}
// Distancia (m) hacia dir desde (x, y) hasta el último suelo en esa dirección: cuánto se alejó del borde de la isla
function edgeDistFrom(w: World, x: number, y: number, dir: number): number {
  for (let d = 0; d < 30; d += 1) if (groundUnder(w, x - dir * d, y)) return d;
  return 30;
}

// ---- Seguridad: caídas y peligros ---------------------------------------------------------------------------------------
// Devuelve una entrada si hay que actuar ya (plan nuevo o esquive), o null (y m.airD dice hacia dónde ir en el aire).
function safety(s: State, w: World, p: Pl, m: BotMem, D: Diff, list: Hz[], goalX: number, i: Input): Input | null {
  const t = s.t;
  if (p.ground) { m.fallEp = -1; m.airD = 0; }
  if (!p.ground && !(p.hook && attached(p, t))) {
    if (m.fallEp < 0) m.fallEp = t, m.fallOk = r01(m) < D.recover;
    if (t >= m.safeT) {
      m.safeT = t + 4;
      const sp = bestSpots(s, w, p, goalX, 1)[0];
      if (sp) {
        const d = Math.abs(sp[0] - p.x) > 0.4 ? sgn(sp[0] - p.x) : 0;
        m.airD = d;
        const r = trial(s, w, p, mk('camina', 0, sp[1], [E(0, 'mv', d, 0)]), 0, 110, list);
        if (r !== T_LAND && (m.fallOk || p.y < w.m.water + 3)) {
          const sc = searchAir(s, w, p, m, D, list, goalX);
          if (sc) { setPlan(m, s, sc); m.mode = 'recupera:' + sc.name; return runPlan(s, w, p, m, list, i); }
        }
      }
    }
    return null;
  }
  if (list.length && p.ground && t >= m.safeT) {
    // ¿el peligro pega si me quedo? (se mira un segundo y medio adelante)
    let hzEnd = 0;
    for (const z of list) if (z.t0 < t + 90) hzEnd = Math.max(hzEnd, z.t1);
    const stay = mk('quieto', 0, p.y, [E(0, 'mv', 0, 0)], 100);
    const r = trial(s, w, p, stay, 0, 100, list, Math.min(hzEnd, t + 100));
    if (r === T_HURT && TR.f <= 24 + D.react * 1.4) {
      const key = Math.floor(t / 30);
      if (!m.dodged.includes(key) && m.dodged.length < 50) m.dodged.push(key);
      m.safeT = t + 2;
      if (r01(m) < D.dodge + 0.1) {
        const sc = searchDodge(s, w, p, m, D, list, Math.min(hzEnd, t + 100));
        if (sc) { setPlan(m, s, sc); m.mode = 'esquiva:' + sc.name; return runPlan(s, w, p, m, list, i); }
      }
    } else m.safeT = t + 3;
  }
  return null;
}

// ---- Objetivo ---------------------------------------------------------------------------------------------------------------
function pickTarget(s: State, w: World, p: Pl, m: BotMem, D: Diff): Pl | null {
  let best = Infinity, tg: Pl | null = null;
  for (const q of s.pl) {
    if (!q.alive || !enemies(s, p, q)) continue;
    const reach = pathTo(w, p.x, p.y, q.x).st === 0 ? 0 : 22;
    const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) * 1.5 - q.dmg * 0.03 + (q.u ? 20 : 0) + (s.t < q.invT ? 8 : 0) + reach;
    if (d < best) best = d, tg = q;
  }
  m.target = tg ? tg.id : -1;
  m.err = (r01(m) - 0.5) * 2 * D.err;
  return tg;
}

// ---- Entrada principal ----------------------------------------------------------------------------------------------------------
export function botInput(s: State, w: World, p: Pl, m: BotMem): Input {
  const i: Input = { ...NO_INPUT };
  if (!p.alive || s.t < GO * HZ) { m.sc = null; return i; }
  const D = DIFFS[Math.max(0, Math.min(3, p.bot - 1))], t = s.t;
  m.mode = '';
  let tg = m.target >= 0 && s.pl[m.target]?.alive && t < m.think ? s.pl[m.target] : null;
  if (!tg && t >= m.think) { m.think = t + D.react + Math.floor(r01(m) * D.react); tg = pickTarget(s, w, p, m, D); }
  else if (!tg) tg = m.target >= 0 && s.pl[m.target]?.alive ? s.pl[m.target] : null;
  if (p.u) { m.sc = null; m.mode = 'ulti:' + p.u.k; return ultiInput(s, w, p, m, D, tg, i); }
  const goalX = tg ? tg.x : w.m.w / 2;
  if (t < p.stunT) { m.mode = 'aturdido'; return stunInput(s, w, p, m, D, goalX, i); }
  const list = hazards(s, w, p, m);
  if (m.sc) {
    const r = runPlan(s, w, p, m, list, i);
    if (r) { m.mode = 'plan:' + m.sc!.name; if (m.sc.tier >= 0 && m.sc.name.startsWith('cruza')) combat(s, w, p, m, D, tg, r, true); return r; }
  }
  const sf = safety(s, w, p, m, D, list, goalX, i);
  if (sf) return sf;
  const r = normal(s, w, p, m, D, tg, list, i);
  combat(s, w, p, m, D, tg, r, false);
  return r;
}

// Distancia a la que le gusta pelear según su mano
function wantRange(s: State, p: Pl, D: Diff, tg: Pl): number {
  let melee = false;
  for (let k = 0; k < 5; k++) {
    const id = k === 4 ? p.bonus : p.hand[k];
    if ((id === 'bate' || id === 'katana' || id === 'trompeta' || id === 'autodestruccion') && (k === 4 || s.rules.infinite || p.mana >= CARD[id].cost)) melee = true;
  }
  let want = melee && tg.dmg >= 35 ? 2.2 : p.mana < 1.5 && D.aggr > 0.5 ? 1.8 : 7 + (p.id % 3);
  want += (1 - D.aggr) * 5 + (p.dmg > 110 ? 3 : 0);
  return want;
}

function normal(s: State, w: World, p: Pl, m: BotMem, D: Diff, tg: Pl | null, list: Hz[], i: Input): Input {
  const t = s.t;
  if (!p.ground) { m.mode = 'aire'; i.x = m.airD; return i; }
  if (t >= m.dirT) { m.dirT = t + 40 + Math.floor(r01(m) * 60); m.careful = r01(m) < D.edge; m.engage = r01(m) < D.aggr + 0.15; }
  if (Math.abs(p.x - m.px) > 1.2 || Math.abs(p.y - m.py) > 1.2) m.px = p.x, m.py = p.y, m.pT = t;
  const stuck = t - m.pT > 110;
  m.mode = 'camina';
  // Caja con carta cerca: ir a buscarla
  for (const o of s.props) {
    if (o.k !== 'caja' || o.dead || Math.abs(o.x - p.x) > 12 || o.y > p.y + 5 || (p.bonus && o.card !== '+ulti')) continue;
    if (!groundUnder(w, o.x, o.y + 0.5) || (D.tools < 1 && r01(m) < 0.5)) continue;
    const pc = pathTo(w, p.x, p.y, o.x);
    if (pc.st === 0) { m.mode = 'caja'; walk(w, p, m, o.x, i, 0.3); return i; }
  }
  if (!tg) { walk(w, p, m, w.m.w / 2, i, 2); return i; }
  const dx = tg.x - p.x, pt = pathTo(w, p.x, p.y, tg.x);
  if (pt.st === 0) {
    const want = wantRange(s, p, D, tg);
    let gx = Math.abs(dx) > want ? tg.x - sgn(dx) * want : p.x - sgn(dx) * (want - Math.abs(dx)) * 0.5;
    const pg = pathTo(w, p.x, p.y, gx);
    if (pg.st !== 0) gx = p.x + sgn(gx - p.x) * Math.max(0, pg.at - 1.5);
    const st = walk(w, p, m, gx, i);
    if (st === 2 && t >= m.planT) { // un escalón alto: saltarlo (o el doble salto)
      m.planT = t + 8;
      const sc = searchTransit(s, w, p, m, D, list, gx, tg.y, 0.5) ?? mk('salta', 0, p.y, [E(0, 'mv', sgn(dx), 0), ...jumpAt(0, 16)], 60);
      setPlan(m, s, sc); m.mode = 'salta'; return runPlan(s, w, p, m, list, i) ?? i;
    }
    return i;
  }
  // En otra plataforma (o más arriba): elegir hacia cuál ir y cruzar, si tiene ganas; si no, tirar desde el borde
  const nv = navOf(s, w), sP = segOf(nv, p.x, p.y), sT = segOf(nv, tg.x, tg.y), maxTier = D.tools >= 2 ? 2 : D.tools;
  let wx = tg.x, wy = tg.y, reach = true;
  if (sP >= 0 && sT >= 0 && sP !== sT) {
    const path = navPath(nv, sP, sT, maxTier);
    if (path && path.length >= 2) [wx, wy] = segPoint(nv, path[1], p.x);
    else reach = false;
  } else if (sP >= 0 && sT < 0) reach = false;
  if (!reach) { // no hay camino: tirar desde el punto de mi plataforma más cerca de él
    m.mode = 'zona';
    if (sP >= 0) { const [zx] = segPoint(nv, sP, tg.x); walk(w, p, m, zx, i, 0.6); }
    return i;
  }
  if (!m.engage && !stuck) {
    m.mode = 'zona';
    if (sP >= 0) { const [zx] = segPoint(nv, sP, tg.x); walk(w, p, m, zx, i, 0.6); }
    return i;
  }
  const pw = pathTo(w, p.x, p.y, wx);
  m.mode = pw.st === 1 ? 'hueco' : pw.st === 2 ? 'pared' : 'va';
  if (pw.st === 0 && Math.abs(wx - p.x) > 1.2 && Math.abs(wy - p.y) < 1.5) { walk(w, p, m, wx, i, 0.6); return i; }
  const stopAt = pw.st === 0 ? Math.abs(wx - p.x) : Math.max(0, pw.at - 1.4);
  walk(w, p, m, p.x + sgn(wx - p.x) * stopAt, i, 0.3);
  if ((pw.at < 8 || pw.st === 0) && t >= m.planT) {
    m.planT = t + 6;
    const sc = searchTransit(s, w, p, m, D, list, wx, wy, stuck ? 0.5 : 2.5);
    if (sc) { setPlan(m, s, sc); m.mode = 'cruza:' + sc.name; return runPlan(s, w, p, m, list, i) ?? i; }
    if (stuck && t - m.pT > 220) { m.engage = true; m.pT = t; m.think = 0; }
  }
  return i;
}

// ======================================================================================================================
// COMBATE
// ======================================================================================================================

// Dónde va a estar un rival dentro de T segundos (lead: cuánto confía en su velocidad)
function predictAt(w: World, q: Pl, T: number, lead: number): [number, number] {
  const g = gravity(w.c);
  let x = q.x, y = q.y;
  if (q.ground) x += q.vx * T * 0.55 * lead;
  else {
    const k = s_stunned(q) ? Math.exp(-w.c.KB_DRAG * T * 0.5) : 1;
    x += q.vx * T * lead * k;
    y += (q.vy * T - 0.5 * g * (q.vy > 0 ? 1 : 1.4) * T * T) * lead;
    const gb = groundBelow(w.T, x, Math.max(y, q.y) + 0.3, Math.max(y, q.y) + 0.3 - w.m.water);
    if (gb !== null && y < gb && q.y >= gb - 0.5) y = gb; // aterriza
  }
  return [x, y];
}
const s_stunned = (q: Pl) => q.stunT > q.techT0 && q.stunT > 0 && q.stunT !== NEVER;
// ¿Qué tan impredecible es? (para saber cuánto confiar en la predicción)
const mobility = (q: Pl) => q.ground ? (Math.abs(q.vx) > 3 ? 0.9 : 0.35) : 1;

type ShotRes = { kind: number, x: number, y: number, f: number, md: number };
const SH: ShotRes = { kind: 0, x: 0, y: 0, f: 0, md: 99 };
const S_TERR = 0, S_FUSE = 1, S_LIFE = 2, S_HIT = 3, S_LOST = 4;
// Simula un proyectil de la carta (pd) y deja en SH cómo termina; md = la menor distancia al blanco predicho en el camino
function simShot(s: State, w: World, x: number, y: number, vx: number, vy: number, pd: NonNullable<ReturnType<typeof projOf>>, q: Pl, lead: number, maxF = 200) {
  const g = G_PROJ * pd.g, T = w.T, r = pd.r;
  const fuse = pd.fuse ? Math.round(pd.fuse * HZ) : 0, life = pd.life ? Math.round(pd.life * HZ) : 0;
  let md = 99, bounces = 0;
  const end = (kind: number, f: number) => { SH.kind = kind, SH.x = x, SH.y = y, SH.f = f, SH.md = md; };
  for (let f = 1; f <= maxF; f++) {
    vy -= g * DT;
    if (pd.accel) { const v = Math.sqrt(vx * vx + vy * vy), nv = Math.min(pd.vmax ?? 40, v + pd.accel * DT); if (v > 1e-6) vx *= nv / v, vy *= nv / v; }
    const nx = x + vx * DT, ny = y + vy * DT;
    const hx = solidAt(T, nx + sgn(vx) * r, y), hy = solidAt(T, x, ny + sgn(vy) * r);
    if (hx || hy) {
      if (pd.bounce) {
        if (hx) vx = -vx * pd.bounce; else vy = -vy * pd.bounce, vx *= 0.85;
        if (++bounces > 6) return end(S_LIFE, f);
        if (fuse && f >= fuse) return end(S_FUSE, f);
        continue;
      }
      return end(S_TERR, f);
    }
    x = nx, y = ny;
    if (y < w.m.water - 0.2 || x < -20 || x > w.m.w + 20) return end(S_LOST, f);
    const [tx, ty] = predictAt(w, q, f * DT, lead), d = dist(x, y, tx, ty + height(q) / 2);
    if (d < md) md = d;
    if (d < r + 0.62 && !pd.bounce) return end(S_HIT, f);
    if (fuse && f >= fuse) return end(S_FUSE, f);
    if (life && f >= life) return end(S_LIFE, f);
  }
  end(S_LIFE, maxF);
}

// Tiro con arco o recto: deja en SOL la mira con mejor probabilidad de pegarle a q. false si no hay solución.
const SOL = { ax: 0, ay: 0, p: 0, ix: 0, iy: 0 };
function aimProj(s: State, w: World, p: Pl, m: BotMem, D: Diff, q: Pl, card: Card): boolean {
  const pd = card.proj;
  if (!pd) return false;
  const arc = card.aim === 'arc', boom = pd.boom, R = boom ? boom.r : pd.r + 0.4;
  let bestP = -1;
  const pws = arc ? [1, 0.8, 0.62, 0.48] : [1], high = arc ? [false, true] : [false];
  for (const hi of high) for (const pw of pws) {
    const speed = pd.v * (arc ? 0.3 + 0.7 * pw : 1), gp = G_PROJ * pd.g;
    // tres pasadas para el tiempo de vuelo
    let T = dist(p.x, p.y, q.x, q.y) / speed, ux = 1, uy = 0, ok = false;
    for (let it = 0; it < 3; it++) {
      const [tx, ty] = predictAt(w, q, T, D.lead);
      const hxo = p.x + sgn(tx - p.x) * 0.45, hyo = p.y + HAND_Y + 0.15;
      const dx = tx - hxo - 0.25 * p.vx * T, dy = ty + height(q) / 2 - hyo - 0.15 * p.vy * T;
      if (gp < 1e-3) { const n = Math.sqrt(dx * dx + dy * dy) || 1; ux = dx / n, uy = dy / n; ok = true; T = n / speed; continue; }
      const v2 = speed * speed, disc = v2 * v2 - gp * (gp * dx * dx + 2 * dy * v2);
      if (disc < 0) { ok = false; break; }
      const sq = Math.sqrt(disc), ad = Math.abs(dx) < 0.05 ? 0.05 : Math.abs(dx);
      const a = Math.atan2(v2 + (hi ? sq : -sq), gp * ad);
      ux = sgn(dx || 1) * Math.cos(a), uy = Math.sin(a), ok = true;
      T = ad / Math.max(1e-3, speed * Math.cos(a));
      if (T > 3.5) { ok = false; break; }
    }
    if (!ok) continue;
    // error de puntería
    const ca = Math.cos(m.err), sa = Math.sin(m.err), rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
    const hx = p.x + rx * 0.45, hy = p.y + HAND_Y + ry * 0.3;
    simShot(s, w, hx, hy, rx * speed + p.vx * 0.25, ry * speed + p.vy * 0.15, pd, q, D.lead);
    const sig = 0.3 + 0.55 * (SH.f * DT) * mobility(q) * (1.3 - 0.4 * D.lead);
    let pr = 0;
    if (SH.kind === S_HIT) pr = Math.exp(-0.5 * (SH.md / (sig + 0.25)) ** 2) * 0.95;
    else if (pd.pierce) pr = SH.md < pd.r + 0.62 ? 0.8 : Math.exp(-0.5 * ((SH.md - pd.r) / (sig + 0.25)) ** 2) * 0.8;
    else if (SH.kind !== S_LOST) {
      const [tx, ty] = predictAt(w, q, SH.f * DT, D.lead), e = dist(SH.x, SH.y, tx, ty + height(q) / 2);
      pr = e <= R * 0.55 ? 1 : e >= R + 0.7 ? 0 : (R + 0.7 - e) / (R * 0.45 + 0.7);
      pr *= Math.exp(-0.5 * (sig / (R + 0.6)) ** 2 * 0.8);
      if (pd.bounce) pr *= pd.bounce > 0.6 ? 0.55 : 0.85;
    }
    // el que explota contra el terreno cerca mío me lastima de rebote
    if (boom && SH.kind !== S_LOST && dist(SH.x, SH.y, p.x, p.y + 0.5) < boom.r + 0.6) pr *= 0.2;
    if (pr > bestP) bestP = pr, SOL.ax = rx * (arc ? pw : 1), SOL.ay = ry * (arc ? pw : 1), SOL.p = pr, SOL.ix = SH.x, SOL.iy = SH.y;
  }
  return bestP > 0;
}

// Distancia caminando hasta el borde de donde está q, hacia dir (tope 24 m). 0 si ya está en el aire sin suelo.
function edgeDist(w: World, q: Pl, dir: number): number {
  if (!groundUnder(w, q.x, q.y)) return 0;
  for (let d = 0.75; d <= 24; d += 0.75) if (floorAt(w, q.x + dir * d, q.y, 6) === null) return d;
  return 24;
}
// Probabilidad de que un golpe de esa fuerza lo saque del ring
function koProb(s: State, w: World, q: Pl, kb: number, kg: number, dmg: number, dx: number, dy: number): number {
  const v = (kb + kg * (q.dmg + dmg) / 100) * kbMul(s, w, q), n = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / n, uy = dy / n;
  const far = 0.0158 * v * v, e = Math.abs(ux) > 0.2 ? edgeDist(w, q, sgn(ux)) : 99, off = !groundUnder(w, q.x, q.y);
  let pr = (far * Math.abs(ux) - e) / 9 + (off ? 0.35 : 0);
  if (uy < -0.5 && off) pr += 0.3; // hacia abajo y sin suelo
  return clamp(pr, 0, 1);
}

// Segundos hasta que le llega un proyectil enemigo que viene hacia mí (99 si ninguno)
function incoming(s: State, p: Pl): number {
  let best = 99;
  for (const q of s.pr) {
    if (q.o === p.id || q.st) continue;
    const ow = s.pl[q.o];
    if (ow && !enemies(s, p, ow)) continue;
    const dx = p.x - q.x, dy = mid(p) - q.y, d = Math.sqrt(dx * dx + dy * dy), sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy);
    if (d < 7 && sp > 1 && (q.vx * dx + q.vy * dy) > 0.5 * d * sp && d / sp < best) best = d / sp;
  }
  return best;
}
const cellRock = (w: World, x: number, y: number) => w.T.g[Math.floor(y / CELL) * w.T.cols + Math.floor(x / CELL)] === 2;

// Valor de lanzar una carta ahora (en «puntos de daño»), con la mira en i.ax/i.ay. 0 = no sirve ahora.
function cardValue(s: State, w: World, p: Pl, m: BotMem, D: Diff, q: Pl | null, card: Card, near: number, inc: number, i: Input): number {
  const id = card.id, hx = p.x, hy = p.y + HAND_Y;
  const set = (ax: number, ay: number) => { i.ax = ax, i.ay = ay; };
  // Cartas que no necesitan blanco
  switch (id) {
    case 'fruta': return p.dmg > 45 ? Math.min(35, p.dmg) * 0.45 + (s.t < p.fragT ? 6 : 0) : 0;
    case 'plomo': return p.dmg > 60 && q && dist(p.x, p.y, q.x, q.y) < 9 && s.t >= p.leadT ? 5 + (p.dmg - 60) * 0.12 : 0;
    case 'escudo': return s.t >= p.shieldT && inc < 0.4 ? 16 : 0;
    case 'autodestruccion': {
      let v = 0;
      for (const o of s.pl) if (o.alive && enemies(s, p, o) && Math.abs(o.x - p.x) < 4 && Math.abs(mid(o) - mid(p)) < 3.5) v += 22 + koProb(s, w, o, 14, 18, 24, o.x - p.x, mid(o) - mid(p) + 0.35) * 14;
      if (v > 0 && (p.dmg > 110 || !groundUnder(w, p.x, p.y))) v *= 0.4; // me lastimo a mí
      return v > 20 ? v : 0;
    }
    case 'supersalto': case 'tele': return 0;
  }
  if (!q) return 0;
  const dx = q.x - hx, dy = mid(q) - hy, d = Math.sqrt(dx * dx + dy * dy) || 1;
  const rot = (x: number, y: number): [number, number] => { const ca = Math.cos(m.err), sa = Math.sin(m.err); return [x * ca - y * sa, x * sa + y * ca]; };
  const offs = !groundUnder(w, q.x, q.y);
  const dmgKo = (dmg: number, kb: number, kg: number, pr: number, ddx: number, ddy: number) => pr * (dmg + 16 * koProb(s, w, q, kb, kg, dmg, ddx, ddy) * (offs ? 1.3 : 1));
  const los = raycast(w.T, hx, hy, dx / d, dy / d, d).d < 0;
  switch (id) {
    case 'bate': {
      if (d > 2.4) return 0;
      const [ax, ay] = rot(dx / d, dy / d + 0.2); set(ax, ay);
      return dmgKo(12, 14, 16, 0.85, dx, dy + 0.4) + (inc < 0.35 ? 6 : 0);
    }
    case 'katana': {
      if (d > 6.2 || !los) return 0;
      const [ax, ay] = rot(dx / d, dy / d); set(ax, ay);
      // el corte me lleva 7 m: no tirarme al agua
      const ex = p.x + ax * 7, ey = p.y + ay * 7;
      if (!groundUnder(w, ex, Math.max(ey, w.m.water + 2)) && !groundUnder(w, p.x, p.y)) return 0;
      return dmgKo(13, 11, 15, 0.8, dx, dy + 0.5);
    }
    case 'trompeta': {
      if (d > 6.8 || !los) return 0;
      set(dx / d, dy / d);
      return 0.9 * (3 + 16 * koProb(s, w, q, 18 * (1 - d / 12), 6, 3, dx, dy + 0.2) * (offs ? 1.2 : 1)) + (d < 3.5 ? 3 : 0);
    }
    case 'laser': {
      if (d > 26) return 0;
      // atraviesa tierra, no piedra
      for (let u = 0.5; u < d; u += 0.4) if (cellRock(w, hx + dx / d * u, hy + dy / d * u)) return 0;
      const [tx, ty] = predictAt(w, q, 0.05, D.lead), ex = tx - hx, ey = ty + height(q) / 2 - hy, en = Math.sqrt(ex * ex + ey * ey) || 1;
      const [ax, ay] = rot(ex / en, ey / en); set(ax, ay);
      const miss = Math.abs(m.err) * en;
      return dmgKo(9, 8, 11, clamp(1 - miss / 0.9, 0.05, 0.95), ex, ey + 0.3);
    }
    case 'megalaser': {
      if (d > 30 || d < 4 || p.mana < 8) return 0;
      const still = (q.ground && Math.abs(q.vx) < 3) || s.t < q.stunT;
      if (!still && D.ult < 0.8) return 0;
      const [ax, ay] = rot(dx / d, dy / d); set(ax, ay);
      return (still ? 0.8 : 0.35) * (28 + 8 * koProb(s, w, q, 7, 7, 14, dx, dy)) - 6;
    }
    case 'vaca': case 'meteorito': {
      // al piso donde va a estar (hay retardo): sirve con rivales parados o aturdidos
      const T = id === 'vaca' ? 1.0 : 1.4, [tx] = predictAt(w, q, T, D.lead * 0.5);
      const still = (q.ground && Math.abs(q.vx) < 4) || s.t < q.stunT || (!q.ground && Math.abs(q.vx) < 3);
      const px = tx - p.x;
      if (Math.abs(px) / 22 > 1) return 0;
      set(px / 22 + m.err * 0.5, 0);
      const pr = (still ? 0.6 : 0.25) * (id === 'vaca' ? 1 : 0.9);
      return id === 'vaca' ? pr * (14 + (offs || edgeDist(w, q, -1) < 4 || edgeDist(w, q, 1) < 4 ? 8 : 0)) : pr * (22 + 14 * koProb(s, w, q, 13, 17, 22, 0, 1)) - 4;
    }
    case 'iman': {
      if (!los || d < 4.5 || d > 17 || p.hook) return 0;
      const mel = p.hand.some(h => h === 'bate' || h === 'katana' || h === 'trompeta' || h === 'autodestruccion');
      if (!mel || offs) return 0;
      const [ax, ay] = rot(dx / d, dy / d); set(ax, ay);
      return 7;
    }
    case 'swap': {
      // si estoy en el aire sobre el vacío y él está parado, me salva; si no, no
      if (groundUnder(w, p.x, p.y) || !groundUnder(w, q.x, q.y) || d > 18 || !los || p.y > w.m.water + 12) return 0;
      const [ax, ay] = rot(dx / d, dy / d); set(ax, ay);
      return 12;
    }
    case 'caparazon': {
      if (!p.ground || !q.ground || Math.abs(dy) > 1.2 || d < 3 || d > 15 || pathTo(w, p.x, p.y, q.x).st !== 0) return 0;
      set(sgn(dx), 0);
      return 0.55 * (8 + 12 * koProb(s, w, q, 11, 13, 8, dx, 0.3));
    }
    case 'mina': case 'banana': case 'pegamento': {
      // trampa en el camino: al suelo, entre los dos
      if (d < 3 || d > 12 || !q.ground || !p.ground || pathTo(w, p.x, p.y, q.x).st !== 0) return 0;
      const tx = p.x + dx * (id === 'pegamento' ? 0.7 : 0.55);
      const gb = groundBelow(w.T, tx, p.y + 2, 4);
      if (gb === null) return 0;
      // un tiro a 45° con la fuerza justa para llegar
      const pdd = card.proj!, sx = Math.abs(tx - hx), g2 = G_PROJ * pdd.g;
      const need = Math.sqrt(sx * g2) / pdd.v, pw = clamp((need - 0.3) / 0.7, 0.2, 1);
      if (need > 1.02) return 0;
      set(sgn(dx) * 0.707 * pw, 0.707 * pw);
      return (id === 'mina' ? 7 : id === 'banana' ? 5 : 4) * (Math.abs(q.vx) > 2 || D.aggr > 0.7 ? 1 : 0.6);
    }
    case 'tnt': case 'gas': {
      if (d < 3.5 || d > 9.5 || (id === 'gas' && d > 8)) return 0;
      const pw = clamp((d / 12 - 0.1) / 0.7 + 0.3, 0.3, 1);
      set(sgn(dx) * 0.8 * pw, 0.6 * pw);
      return (id === 'tnt' ? 8 : 6) * (D.aggr > 0.7 ? 1 : 0.7);
    }
  }
  // Proyectiles con arco o en línea
  if (!card.proj || d < 2.2 || d > 36) return 0;
  if (id === 'cohetito' && d < 3.2) return 0;
  if (!aimProj(s, w, p, m, D, q, card)) return 0;
  const pr = SOL.p;
  if (pr < 0.08) return 0;
  set(SOL.ax, SOL.ay);
  const pd = card.proj, b = pd.boom;
  let dmg = 0, kb = 8, kg = 10;
  if (b) dmg = b.dmg, kb = b.kb, kg = b.kg;
  else if (pd.pierce) dmg = pd.pierce.dmg, kb = pd.pierce.kb, kg = pd.pierce.kg;
  const hdx = Math.abs(q.x - SOL.ix) > 0.3 ? q.x - SOL.ix : dx;
  let v = dmgKo(dmg, kb, kg, pr, hdx, q.y - SOL.iy + 0.3);
  if (id === 'triple') v = dmgKo(dmg * 1.6, kb, kg, Math.min(1, pr * 1.8), dx, dy + 0.3);
  if (id === 'racimo' || id === 'palomitas') v *= 1.5;
  if (id === 'melocoton') v = pr * 7;
  if (id === 'shuriken') v *= 1.2;
  if (id === 'cohetito' || id === 'caballo') v *= 0.9;
  return v;
}

// Elegir carta. Devuelve la ranura y deja la mira en i.ax/i.ay. −1 si ninguna sirve.
function chooseCard(s: State, w: World, p: Pl, m: BotMem, D: Diff, q: Pl | null, i: Input): number {
  let near = 0;
  for (const o of s.pl) if (o.alive && enemies(s, p, o) && Math.abs(o.x - p.x) < 4 && Math.abs(o.y - p.y) < 3) near++;
  const inc = incoming(s, p);
  let bestK = -1, bestV = 0, bax = 0, bay = 0;
  for (let k = 4; k >= 0; k--) {
    const id = k === 4 ? p.bonus : p.hand[k];
    if (!id) continue;
    const card = CARD[id];
    if (k < 4 && !s.rules.infinite && p.mana < card.cost) continue;
    let v = cardValue(s, w, p, m, D, q, card, near, inc, i);
    if (v <= 0) continue;
    const over = Math.max(0, p.mana - (8 - D.mana * 0.5)) * 1.8;
    v += (k === 4 ? 4 : 0) + over - (k === 4 ? 0 : Math.max(0, card.cost - 1) * 1.1 - (p.mana - card.cost < D.mana ? 3 : 0));
    if (v > bestV) bestV = v, bestK = k, bax = i.ax, bay = i.ay;
  }
  const thr = 2.5 + (D.aggr < 0.5 ? 2 : 0);
  if (bestK >= 0 && bestV >= thr) { i.ax = bax, i.ay = bay; return bestK; }
  i.ax = 0, i.ay = 0;
  return -1;
}

// ---- Ulti: cuándo ---------------------------------------------------------------------------------------------------------------
function wantsUlti(s: State, w: World, p: Pl, m: BotMem, D: Diff, tg: Pl | null): boolean {
  if (p.ulti < 100 || p.u || !tg || s.t < p.stunT || s.t < p.stopT) return false;
  const u = charOf(p.ch).ulti, dx = tg.x - p.x, dy = tg.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
  if (m.ultiT === 0) m.ultiT = s.t; // desde cuándo está lista
  const waited = (s.t - m.ultiT) / HZ;
  const foes: Pl[] = [];
  for (const q of s.pl) if (q.alive && enemies(s, p, q) && !q.u) foes.push(q);
  if (!foes.length) return false;
  if (D.ult < 0.4) return d < 18 && (u === 'meteoro' || (d < 12 && u !== 'expreso') || (u === 'expreso' && Math.abs(dy) < 2 && sgn(dx) === p.face));
  const stuck = waited > 7 / Math.max(0.5, D.ult); // si espera demasiado, la tira igual
  switch (u) {
    case 'meteoro': {
      const q = foes.find(o => groundUnder(w, o.x, o.y) && (o.dmg >= 55 || stuck)) ?? null;
      return !!q && groundUnder(w, p.x, p.y);
    }
    case 'lazo': {
      let n = 0, dm = 0;
      for (const o of foes) if (dist(o.x, o.y, p.x, p.y) < 14) n++, dm += o.dmg;
      if (!n) return false;
      const out = p.x < w.m.w / 2 ? -1 : 1, e = edgeDist(w, p, out); // los revolea hacia el lado de afuera donde estoy
      return e < 9 || dm / n >= 95 || stuck || p.dmg > 100;
    }
    case 'cohete': {
      if (d > 15 || d < 3) return false;
      return tg.dmg >= 40 || p.dmg > 90 || stuck || foes.length >= 2;
    }
    case 'abduccion': {
      if (d > 13 || tg.y > p.y + 6) return false;
      return tg.dmg >= 40 || stuck || foes.length >= 2;
    }
    case 'expreso': {
      for (const o of foes) if (Math.abs(o.y - p.y) < 2.2 && sgn(o.x - p.x) === p.face && Math.abs(o.x - p.x) < 30 && Math.abs(o.x - p.x) > 3) return o.dmg >= 30 || stuck;
      return false;
    }
    case 'sombra': return d < 11 && (tg.dmg >= 50 || stuck || p.dmg > 100);
  }
  return false;
}

// ---- Acciones de combate encima del movimiento ----------------------------------------------------------------------------------
function combat(s: State, w: World, p: Pl, m: BotMem, D: Diff, tg: Pl | null, i: Input, planned: boolean): void {
  const t = s.t, c = w.c, ch = charOf(p.ch);
  if (p.ulti < 100) m.ultiT = 0;
  if (!tg || p.u || i.cast >= 0 || p.atk) return;
  // Ulti
  if (!planned && wantsUlti(s, w, p, m, D, tg)) {
    i.ulti = true;
    aimAt(p, tg, i);
    m.ultiT = 0;
    return;
  }
  const dx = tg.x - p.x, dy = mid(tg) - mid(p), d = Math.sqrt(dx * dx + dy * dy);
  // Liga a un rival + DASH: lo lanzo hacia donde estoy yo (conviene estar del lado del borde)
  if (D.tools >= 2 && !planned) {
    const hk = p.hook;
    if (hk && hk.ek === 0 && hk.e >= 0) {
      const foe = s.pl[hk.e];
      i.hook = true; aimAt(p, foe, i);
      if (attached(p, t) && foe.alive) {
        const vx = p.x - foe.x, vy = p.y + 0.6 - (foe.y + 0.5), n = Math.sqrt(vx * vx + vy * vy) || 1;
        const kp = koProb(s, w, foe, c.YANK_V, 5, 5, vx / n, vy / n + 0.35);
        if ((kp > 0.3 || t - hk.at > 40) && p.dashN >= 1 && t >= p.dashCdT) i.dash = true, i.x = sgn(vx), i.y = 0;
      }
      return;
    }
    if (!hk && canHook(s, p) && !p.hookHeld && d < c.HOOK_LEN * ch.hookLen * 0.9 && r01(m) < D.hookAtk * 0.08 && t >= p.stopT) {
      const sideE = edgeDist(w, tg, -1) < edgeDist(w, tg, 1) ? -1 : 1, eD = edgeDist(w, tg, sideE);
      const vx = p.x - tg.x, vy = p.y + 0.6 - (tg.y + 0.5), n = Math.sqrt(vx * vx + vy * vy) || 1;
      if (sgn(vx) === sideE && eD < 14 && d > 2.5 && koProb(s, w, tg, c.YANK_V, 5, 5, vx / n, vy / n + 0.35) > 0.25 && raycast(w.T, p.x, p.y + HAND_Y, dx / d, dy / d, d).d < 0 && p.dashN >= 1) {
        i.hook = true; aimAt(p, tg, i);
        return;
      }
    }
  }
  // Golpes de cuerpo
  if (D.tools >= 1 && p.dashN >= 1 && t >= p.dashCdT && !p.hook && t >= p.stopT) {
    const dir = sgn(dx);
    // picada encima de un rival parado
    if (D.tools >= 2 && !p.ground && Math.abs(dx) < 1.1 && p.y - tg.y > 1.5 && p.vy < 4 && tg.ground && groundUnder(w, tg.x, tg.y) && r01(m) < 0.5 + D.aggr * 0.4) {
      i.dash = true, i.x = 0, i.y = -1; return;
    }
    // dash contra él (si más adelante hay suelo)
    if (Math.abs(dx) < 3.6 && Math.abs(dy) < 2 && t >= tg.invT && (p.ground ? floorAt(w, p.x + dir * (Math.abs(dx) + 1.5), p.y) !== null : groundUnder(w, p.x + dir * (Math.abs(dx) + 1.5), p.y)) && r01(m) < 0.07 + D.aggr * 0.12) {
      i.dash = true, i.x = dir || p.face, i.y = Math.abs(dy) > 1 ? sgn(dy) : 0;
      return;
    }
  }
  // Cartas
  if (t >= m.castT && t >= p.castT && t >= p.stopT) {
    const k = chooseCard(s, w, p, m, D, tg, i);
    if (k >= 0) {
      i.cast = k;
      m.castT = t + Math.round(D.cast * HZ * (0.6 + r01(m) * 0.8) * (p.mana > 8 ? 0.5 : 1));
      m.lastCast = k === 4 ? p.bonus : p.hand[k];
    }
  }
}

// Solo para depurar desde Node (tools y pruebas)
export const _dbg = { searchTransit, genTransit, trial, TR, hazards, pathTo, hOf, floorAt, groundUnder, mk, E, searchAir, bestSpots, walk, DIFFS, spotsOf, edgeDist };
