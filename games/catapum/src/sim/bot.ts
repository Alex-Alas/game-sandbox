// Bots: producen la misma entrada que un jugador (Input) mirando el estado. Los corre el anfitrión.
// Prioridades: si está aturdido, influencia hacia el centro y tech; si está fuera del escenario, volver (doble salto,
// dash, liga al borde más cercano, supersalto o teletransporte); si no, elegir un rival (o una caja cerca), ubicarse a
// la distancia de sus cartas, lanzar con puntería balística, pegar con el cuerpo de cerca, esquivar lo que viene y
// usar la ulti cuando conviene. La dificultad cambia la reacción, el error de puntería y cuánto se anima.
import { CARD, projOf, type Card } from './cards.ts';
import { charOf } from './chars.ts';
import { groundBelow, sweepX, raycast } from './terrain.ts';
import { HZ, NEVER, GO, HW, H, HAND_Y, G_PROJ, AIM_R, NO_INPUT, enemies, height, type State, type World, type Pl, type Input } from './state.ts';
import { attached, movePlayer } from './move.ts';

export const DIFFS = [
  { name: 'FÁCIL', react: 20, err: 0.3, cast: 2.6, recover: 0.55, dodge: 0.15, tech: 0, hookAtk: 0 },
  { name: 'NORMAL', react: 11, err: 0.14, cast: 1.5, recover: 0.85, dodge: 0.4, tech: 0.3, hookAtk: 0.3 },
  { name: 'DIFÍCIL', react: 6, err: 0.06, cast: 0.9, recover: 1, dodge: 0.7, tech: 0.7, hookAtk: 0.6 },
  { name: 'CAÓTICO', react: 3, err: 0.03, cast: 0.45, recover: 1, dodge: 0.9, tech: 0.95, hookAtk: 0.9 },
];

export type BotMem = {
  target: number, think: number, castT: number, jumpHold: number, hookHold: number, dir: number,
  aimX: number, aimY: number, err: number, seed: number, surf: [number, number][], surfT: number, lastJumpT: number,
  stunSeen: number, techPlan: boolean,
  script: { dir: number, f: number, dbl: number } | null, // salto planeado (probado con la física real)
};
export const newMem = (id: number): BotMem => ({ target: -1, think: 0, castT: 0, jumpHold: 0, hookHold: 0, dir: 1, aimX: 0, aimY: 0,
  err: 0, seed: id * 7919 + 1, surf: [], surfT: -1e9, lastJumpT: -1e9, stunSeen: 0, techPlan: false, script: null });

// Azar propio del bot (no toca el del estado: los bots no cambian la partida más que por sus entradas)
const r01 = (m: BotMem) => { m.seed = (m.seed * 1103515245 + 12345) & 0x7fffffff; return m.seed / 0x7fffffff; };
const mid = (p: Pl) => p.y + height(p) / 2;

// Superficies donde pararse (muestreadas cada 2 m), se recalculan cada medio segundo
function surfaces(s: State, w: World, m: BotMem) {
  if (s.t - m.surfT < 30) return m.surf;
  m.surfT = s.t, m.surf = [];
  for (let x = 1; x < w.m.w; x += 2) {
    let y = w.m.h;
    while (y > w.m.water) {
      const g = groundBelow(w.T, x, y, y - w.m.water);
      if (g === null) break;
      m.surf.push([x, g]);
      y = g - 1.2; // también las de abajo (bajo una plataforma)
      while (y > w.m.water && groundBelow(w.T, x, y, 0.3) !== null) y -= 0.25;
    }
  }
  return m.surf;
}
const groundUnder = (s: State, w: World, x: number, y: number) => groundBelow(w.T, x, y + 0.1, y - w.m.water + 0.1) !== null;

// Puntería con arco: velocidad de lanzamiento para pegar en (dx, dy) con rapidez v y gravedad g (tiro bajo), o null
function ballistic(dx: number, dy: number, v: number, g: number): [number, number] | null {
  if (g < 1e-3) { const n = Math.sqrt(dx * dx + dy * dy) || 1; return [dx / n, dy / n]; }
  const v2 = v * v, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0) return null;
  const a = Math.atan2(v2 - Math.sqrt(disc), g * Math.abs(dx));
  return [Math.sign(dx || 1) * Math.cos(a), Math.sin(a)];
}

export function botInput(s: State, w: World, p: Pl, m: BotMem): Input {
  const i: Input = { ...NO_INPUT };
  if (!p.alive || s.t < GO * HZ) return i;
  const D = DIFFS[Math.max(0, Math.min(3, p.bot - 1))], t = s.t, c = w.c, ch = charOf(p.ch);
  const foes = s.pl.filter(q => q.alive && enemies(s, p, q));
  // Objetivo: el rival más cercano, con preferencia por el más dañado (se repiensa cada react cuadros)
  if (t >= m.think) {
    m.think = t + D.react + Math.floor(r01(m) * D.react);
    let best = Infinity;
    m.target = -1;
    for (const q of foes) {
      const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) * 1.5 - q.dmg * 0.03 + (q.u ? 20 : 0) + (t < q.invT ? 8 : 0);
      if (d < best) best = d, m.target = q.id;
    }
    m.err = (r01(m) - 0.5) * 2 * D.err;
  }
  const tg = m.target >= 0 ? s.pl[m.target] : null;

  // Ulti en curso: cada una se maneja distinto
  if (p.u) return ultiInput(s, w, p, m, tg, i);

  // Aturdido: influencia hacia el centro del mapa y tech (decidido una vez por golpe) justo antes de pegar
  if (t < p.stunT) {
    if (m.stunSeen !== p.stunT) m.stunSeen = p.stunT, m.techPlan = r01(m) < D.tech;
    i.x = Math.sign(w.m.w / 2 - p.x), i.y = 0.5;
    const fast = p.vx * p.vx + p.vy * p.vy > c.BOUNCE_V * c.BOUNCE_V;
    const soon = groundBelow(w.T, p.x, p.y, Math.max(0.6, -p.vy * 0.08)) !== null || Math.abs(sweepX(w.T, p.x, p.y, HW, H, p.vx * 0.08)) < Math.abs(p.vx * 0.08) - 0.01;
    if (m.techPlan && fast && soon && t - p.techT0 > 40) i.jump = true, m.techPlan = false;
    return i;
  }
  const goalX0 = tg ? tg.x : w.m.w / 2;
  if (m.script) { // siguiendo un salto planeado
    const sc = m.script, f = sc.f++;
    if (f > 4 && p.ground || f > 110) m.script = null;
    else return { ...scriptInput(sc.dir, f, sc.dbl), cast: -1 };
  }

  // Fuera del escenario (sin suelo abajo): elegir dónde aterrizar y volver
  const safe = groundUnder(s, w, p.x, p.y);
  if (!safe || p.y < w.m.water + 1.5) return recover(s, w, p, m, D, i, goalX0);
  m.hookHold = 0;

  // Esquivar un proyectil que viene
  for (const q of s.pr) {
    if (q.st || q.o === p.id || (s.pl[q.o] && !enemies(s, p, s.pl[q.o]))) continue;
    const dx = p.x - q.x, dy = mid(p) - q.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 4.5 && (q.vx * dx + q.vy * dy) > 0.5 * d * Math.sqrt(q.vx * q.vx + q.vy * q.vy) && r01(m) < D.dodge * 0.25) {
      if (p.ground) i.jump = true, m.jumpHold = 10; else if (p.dashN >= 1) i.dash = true, i.x = Math.sign(dx || 1), i.y = 0.6;
      break;
    }
  }

  // Peligros: saltar el tren que viene y salirse de las marcas de las rocas
  const tr = w.m.hz.train, hz = s.hz;
  if (tr && p.y >= tr.y - 0.2 && p.y < tr.y + 2.8) {
    const front = hz.trainRun ? hz.trainX : hz.trainDir > 0 ? -4 : w.m.w + 4;
    const coming = (hz.trainRun || t >= hz.trainNext - tr.warn * HZ) && (p.x - front) * hz.trainDir > -1;
    const eta = Math.abs(p.x - front) / tr.v;
    if (coming && eta < 0.45 + D.react / 60) { i.jump = !p.held || p.vy > 0, i.x = 0; if (!p.ground && p.vy < 2 && p.air >= 1 && !p.held) i.jump = true; return i; }
  }
  for (const b of s.beams) if ((b.k === 'roca' || b.k === 'meteo' || b.k === 'vaca') && t < b.t0 + 30 && Math.abs(b.x - p.x) < 3.5 && r01(m) < D.dodge + 0.2) {
    i.x = p.x > b.x ? 1 : -1;
    return i;
  }

  // Ulti: según la que tenga
  if (p.ulti >= 100 && tg && wantsUlti(s, w, p, tg)) { i.ulti = true; aimAt(p, tg, i); return i; }

  // Caja con carta cerca: ir a buscarla
  let goal = tg ? tg.x : w.m.w / 2;
  const crate = s.props.find(o => o.k === 'caja' && Math.abs(o.x - p.x) < 10 && o.y < p.y + 6 && groundUnder(s, w, o.x, o.y + 0.5));
  if (crate && (!p.bonus || crate.card === '+ulti')) goal = crate.x;

  // Cartas: elegir una que sirva ahora
  if (t >= m.castT && t >= p.castT) {
    const slot = chooseCard(s, w, p, tg, m, D, i);
    if (slot >= 0) { i.cast = slot; m.castT = t + Math.round(D.cast * HZ * (0.6 + r01(m) * 0.8)); return i; }
  }

  // Distancia buena: cerca si su mano es de cuerpo; si no, de media distancia
  if (tg && goal === tg.x) {
    const melee = p.hand.some(id => CARD[id].type === 'CUERPO') || p.mana < 2;
    const want = melee ? 1.5 : 7 + (p.id % 3);
    const dx = tg.x - p.x;
    goal = Math.abs(dx) > want ? tg.x - Math.sign(dx) * want : p.x - Math.sign(dx) * (want - Math.abs(dx)) * 0.5;
    if (Math.abs(dx) < 2.2 && Math.abs(tg.y - p.y) < 1.2 && p.dashN >= 1 && t >= p.dashCdT && r01(m) < 0.15 + D.dodge * 0.1) { // dash contra él
      i.dash = true, i.x = Math.sign(dx), i.y = tg.y > p.y + 0.5 ? 1 : 0;
      return i;
    }
    if (tg.y < p.y - 1 && Math.abs(dx) < 1 && !p.ground && p.dashN >= 1) { i.dash = true, i.y = -1; return i; } // picada encima
  }
  // Liga contra un rival: si estoy cerca de un borde y él está hacia adentro, engancharlo y LANZARLO (DASH)
  if (tg && attached(p, t) && p.hook!.e === tg.id) { i.hook = true, i.dash = true; return i; }
  if (tg && r01(m) < D.hookAtk * 0.05 && p.charge >= 1) {
    const out = Math.sign(p.x - w.m.w / 2), edge = !groundUnder(s, w, p.x + out * 2.5, p.y + 0.5);
    if (edge && Math.sign(tg.x - p.x) === -out && Math.abs(tg.x - p.x) < c.HOOK_LEN * ch.hookLen * 0.85) { i.hook = true; aimAt(p, tg, i); return i; }
  }

  // Caminar hacia la meta sin caerse del borde; saltar huecos si del otro lado hay dónde caer
  const dir = Math.abs(goal - p.x) > 0.6 ? Math.sign(goal - p.x) : 0;
  i.x = dir;
  if (dir && p.ground) {
    const floor = groundBelow(w.T, p.x + dir * 1.4, p.y + 0.5, 3.5);
    const wall = Math.abs(sweepX(w.T, p.x, p.y + c.STEP + 0.05, HW, H - c.STEP - 0.1, dir * 0.6)) < 0.5;
    if (floor === null) {
      // ¿Hay un salto que llegue al otro lado? (se prueba con la física: simple o con el doble en distintos cuadros)
      if (t - m.lastJumpT > 20) {
        m.lastJumpT = t;
        for (const dbl of [-1, 14, 22, 30]) {
          if (dbl >= 0 && p.air < 1) continue;
          const land = trial(s, w, p, dir, dbl);
          if (land && Math.abs(land[0] - p.x) > 2.5) { m.script = { dir, f: 0, dbl }; return { ...scriptInput(dir, 0, dbl), cast: -1 }; }
        }
      }
      i.x = 0;
    } else if (wall) i.jump = true, m.jumpHold = 20;
  }
  const gy = tg && goal === tg.x ? tg.y : p.y;
  if (gy > p.y + 2.5 && Math.abs(goal - p.x) < 8 && p.ground && t - m.lastJumpT > 30) i.jump = true, m.jumpHold = 20, m.lastJumpT = t;
  if (!p.ground && p.vy < 0 && gy > p.y + 1 && p.air >= 1 && !p.held) i.jump = true, m.jumpHold = 12;
  if (m.jumpHold > 0) i.jump = true, m.jumpHold--;
  return i;
}

// Prueba un salto con la física real (movePlayer sobre una copia, sin liga): correr hacia dir, SALTO sostenido y,
// si dbl ≥ 0, el doble salto en ese cuadro del vuelo. Devuelve dónde aterriza o null si cae al agua o tarda mucho.
function trial(s: State, w: World, p: Pl, dir: number, dbl: number): [number, number] | null {
  const q: Pl = structuredClone(p), fake: State = { ...s, ev: [], pl: s.pl.map(o => o.id === p.id ? q : o) };
  q.hook = null;
  for (let f = 0; f < 110; f++) {
    fake.t = s.t + 1 + f;
    movePlayer(fake, w, q, scriptInput(dir, f, dbl));
    if (f > 2 && q.ground) return q.y > w.m.water + 1 && groundUnder(s, w, q.x, q.y) ? [q.x, q.y] : null;
    if (q.y < w.m.water + 0.5) return null;
  }
  return null;
}
const scriptInput = (dir: number, f: number, dbl: number): Input =>
  ({ ...NO_INPUT, x: dir, jump: f < 16 || (dbl >= 0 && f >= dbl && f < dbl + 14) });

function aimAt(p: Pl, q: Pl, i: Input) {
  const dx = q.x - p.x, dy = mid(q) - (p.y + HAND_Y), n = Math.sqrt(dx * dx + dy * dy) || 1;
  i.ax = dx / n, i.ay = dy / n;
}

// Volver al escenario (o cruzar un hueco): elegir la superficie donde caer según la inercia, la altura y hacia
// dónde está el objetivo; después doble salto, liga (sostenida hasta pasar por encima del borde), dash o cartas.
function recover(s: State, w: World, p: Pl, m: BotMem, D: typeof DIFFS[number], i: Input, goalX: number): Input {
  const t = s.t, c = w.c, ch = charOf(p.ch);
  let best: [number, number] | null = null, bd = Infinity;
  const px = p.x + p.vx * 0.5;
  for (const sf of surfaces(s, w, m)) {
    const d = Math.abs(sf[0] - px) + Math.max(0, sf[1] - p.y) * 1.3 + Math.abs(sf[0] - goalX) * 0.3;
    if (d < bd) bd = d, best = sf;
  }
  if (!best) return i;
  const dx = best[0] - p.x, dy = best[1] - p.y, sk = r01(m) < D.recover || p.y < w.m.water + 4;
  i.x = Math.abs(dx) > 0.4 ? Math.sign(dx) : 0;
  if (p.hook) { // enganchado: mantener hasta quedar por encima del borde, después soltar saltando
    i.hook = true, m.hookHold++;
    if ((p.y > best[1] + 0.3 && p.vy > -2) || m.hookHold > 80 || (attached(p, t) && p.hook.e >= 0)) i.jump = !p.held, i.hook = false, m.hookHold = 0;
    return i;
  }
  if (m.jumpHold > 0) { i.jump = true; m.jumpHold--; }
  if (!sk) return i;
  const reach = p.air * c.JUMP2_H + 0.6;
  if (p.vy < 1.5 && p.air >= 1 && dy > -1.5 && dy < reach + 1 && !p.held) { i.jump = true; m.jumpHold = 14; return i; }
  const L = c.HOOK_LEN * ch.hookLen;
  if (p.charge >= 1 && t >= p.hookT && dx * dx + dy * dy < L * L * 0.9 && (p.vy < 0 || dy > reach)) {
    const ax = dx, ay = dy + 0.5, n = Math.sqrt(ax * ax + ay * ay) || 1;
    i.hook = true, i.ax = ax / n, i.ay = ay / n, m.hookHold = 0;
    return i;
  }
  if (p.dashN >= 1 && t >= p.dashCdT && p.vy < 0 && p.air < 1) { i.dash = true, i.y = dy > -1 ? 1 : 0, i.x = Math.sign(dx); return i; }
  // Cartas de movimiento
  for (let k = 0; k < 5; k++) {
    const id = k === 4 ? p.bonus : p.hand[k];
    if (!id || (k < 4 && p.mana < CARD[id].cost && !s.rules.infinite) || t < p.castT) continue;
    if (id === 'supersalto' || (id === 'cohetito' && dy > 0)) {
      const n = Math.sqrt(dx * dx + (dy + 4) * (dy + 4)) || 1;
      i.cast = k, i.ax = id === 'cohetito' ? -dx / n * 0.3 : dx / n, i.ay = id === 'cohetito' ? -1 : (dy + 4) / n;
      return i;
    }
    if (id === 'tele') {
      const sol = ballistic(dx, dy + 0.5, projOf('tele')!.v, G_PROJ);
      if (sol) { i.cast = k, i.ax = sol[0], i.ay = sol[1]; return i; }
    }
  }
  return i;
}

function wantsUlti(s: State, w: World, p: Pl, q: Pl) {
  const u = charOf(p.ch).ulti, dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
  switch (u) {
    case 'meteoro': return true;
    case 'lazo': return d < 12;
    case 'cohete': return d < 14;
    case 'abduccion': return d < 10;
    case 'expreso': return Math.abs(dy) < 1.8 && Math.sign(dx) === p.face && Math.abs(dx) < 26;
    case 'sombra': return d < 9;
  }
  return false;
}

function ultiInput(s: State, w: World, p: Pl, m: BotMem, q: Pl | null, i: Input): Input {
  const u = p.u!, f = s.t - u.ft;
  switch (u.k) {
    case 'meteoro': if (u.f === 1 && q) { i.x = Math.abs(q.x - u.x) > 0.8 ? Math.sign(q.x - u.x) : 0; if (!i.x && f > 10) i.ulti = true; } break;
    case 'cohete': if (q) aimAt(p, q, i); if (f > 90) i.ulti = true; break;
    case 'sombra': if (q) aimAt(p, q, i); i.ulti = f > 8 && !p.ultiHeld; break;
    case 'abduccion': {
      if (!u.ids.length && q) { i.x = Math.sign(q.x - p.x); i.y = q.y + 4 > p.y ? 1 : -0.6; }
      else { // llevarlos hacia el borde más cercano y soltar sobre el agua
        const out = p.x < w.m.w / 2 ? -1 : 1;
        i.x = out, i.y = p.y < w.m.water + 6 ? 1 : 0;
        if (!groundUnder(s, w, p.x, p.y) && Math.abs(p.x - w.m.w / 2) > w.m.w / 2 - 2) i.ulti = !p.ultiHeld;
      }
      break;
    }
    case 'expreso': if (u.n === 0 && q && Math.sign(q.x - p.x) !== u.dx && Math.abs(q.x - p.x) > 3) i.jump = true; break;
  }
  return i;
}

// Elegir carta y apuntar. Devuelve la ranura (0–4) o −1.
function chooseCard(s: State, w: World, p: Pl, q: Pl | null, m: BotMem, D: typeof DIFFS[number], i: Input): number {
  const slots: number[] = [0, 1, 2, 3, 4].filter(k => {
    const id = k === 4 ? p.bonus : p.hand[k];
    return !!id && (k === 4 || s.rules.infinite || p.mana >= CARD[id].cost);
  });
  // ordenar: primero la de la caja, después las caras (si alcanzan)
  slots.sort((a, b) => (b === 4 ? 99 : CARD[p.hand[b]].cost) - (a === 4 ? 99 : CARD[p.hand[a]].cost));
  for (const k of slots) {
    const card = CARD[k === 4 ? p.bonus : p.hand[k]];
    if (useCard(s, w, p, q, m, card, i)) return k;
  }
  return -1;
}

function useCard(s: State, w: World, p: Pl, q: Pl | null, m: BotMem, card: Card, i: Input): boolean {
  const hx = p.x, hy = p.y + HAND_Y;
  const near = s.pl.filter(o => o.alive && enemies(s, p, o) && Math.abs(o.x - p.x) < 4 && Math.abs(o.y - p.y) < 3).length;
  switch (card.id) {
    case 'fruta': return p.dmg > 55;
    case 'plomo': return p.dmg > 70 && !!q && Math.abs(q.x - p.x) < 8;
    case 'escudo': return s.pr.some(o => !o.st && o.o !== p.id && Math.abs(o.x - p.x) < 5 && Math.abs(o.y - p.y) < 4) || (p.dmg > 90 && near > 0);
    case 'autodestruccion': return near >= 2 || (near >= 1 && p.dmg < 40 && !!q && q.dmg > 90);
    case 'supersalto': case 'tele': return false; // para volver al escenario
  }
  if (!q) return false;
  const dx = q.x + q.vx * 0.25 - hx, dy = mid(q) + q.vy * 0.1 - hy, d = Math.sqrt(dx * dx + dy * dy);
  const los = raycast(w.T, hx, hy, dx / (d || 1), dy / (d || 1), d).d < 0;
  const rot = (x: number, y: number): [number, number] => { const a = m.err, ca = Math.cos(a), sa = Math.sin(a); return [x * ca - y * sa, x * sa + y * ca]; };
  switch (card.id) {
    case 'bate': if (d < 2.2) { [i.ax, i.ay] = rot(dx / d, dy / d + 0.3); return true; } return false;
    case 'katana': if (d < 6.5 && los) { [i.ax, i.ay] = rot(dx / d, dy / d); return true; } return false;
    case 'trompeta': if (d < 6 && los) { [i.ax, i.ay] = [dx / d, dy / d]; return true; } return false;
    case 'iman': case 'laser': case 'megalaser': case 'shuriken': case 'triple': case 'fueguito': case 'boomerang': case 'swap': {
      if (!los || d > (card.id === 'fueguito' ? 16 : 22) || (d < 2.5 && card.id !== 'swap')) return false;
      if (card.id === 'swap' && !(groundUnder(s, w, p.x, p.y) && !groundUnder(s, w, q.x, q.y))) return false;
      if (card.id === 'iman' && Math.abs(dx) < 4) return false;
      [i.ax, i.ay] = rot(dx / d, dy / d + 0.04 * d);
      return true;
    }
    case 'cohetito': if (!los || d < 3 || d > 20) return false; [i.ax, i.ay] = rot(dx / d, dy / d); return true;
    case 'caparazon': if (Math.abs(dy) > 1.5 || !p.ground || Math.abs(dx) > 14) return false; i.ax = Math.sign(dx), i.ay = 0; return true;
    case 'vaca': case 'meteorito': if (Math.abs(dx) > AIM_R) return false; i.ax = dx / AIM_R + m.err, i.ay = 0; return true;
    case 'mina': case 'banana': case 'pegamento': case 'tnt': case 'gas':
      if (d > 9 || d < 2) return false; // dejarla en su camino
      i.ax = Math.sign(dx) * 0.35, i.ay = 0.25;
      return true;
  }
  // Con arco: la potencia que dé un tiro bajo, mirando algunas
  const pd = card.proj;
  if (!pd || d < 3 || d > 30) return false;
  const g = G_PROJ * pd.g;
  for (const pw of [0.55, 0.75, 1, 0.4]) {
    const v = pd.v * (0.3 + 0.7 * pw), sol = ballistic(dx, dy, v, g);
    if (!sol) continue;
    const [ax, ay] = rot(sol[0], sol[1]);
    i.ax = ax * pw, i.ay = ay * pw;
    return true;
  }
  return false;
}

export { NEVER };
