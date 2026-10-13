// La simulación de GRISÚ (GDD §15.2): step(s, world, inputs[]) a 60 Hz, con un Input por jugador. Pura: Node la corre
// sin compilar y el estado va y viene por JSON. Movimiento base (§5):
//  - PASILLO: se corre solo hacia la derecha (RUN, aceleración ACC); en el aire no se pierde la carrera;
//  - SALA: caminata asistida (WALK_AUTO): en el suelo va hacia el enemigo más cercano (o el último golpeado) y se
//    frena a su alcance; con la casilla apagada, quieto hasta un gesto;
//  - POZO: se cae solo (caída máxima MAX_FALL_POZO).
//  - Salto de altura exacta (paso trapezoidal; sin salto variable), doble salto, coyote y buffer; gravedad × FALL_G al
//    caer. Caer a un foso del PASILLO cuesta PIT_DMG y vuelve al último suelo firme.
// Orden de un cuadro: cada jugador (acciones, movimiento, golpes) → dummies → proyectiles → choques de cuerpo → zonas.
import { DEFAULTS, type Cfg } from './params.ts';
import { HZ, DT, NEVER, HW, H, A, ev, gravity, approach, zoneOf, sizeOf,
  type State, type World, type Pl, type Input, type Cls } from './state.ts';
import { sweepX, sweepY, firm } from './collide.ts';
import { alive, breakable } from './combat.ts';
import { startDash, dashSpeed, dashHits, startGuard, endGuard, startDive, diveContact, slam, startHammer, lungeOn, LUNGE_F,
  hammerHits, attached, fireHook, releaseHook, hookForce } from './mech.ts';
import { freshDummy, stepFoes, stepBullets, stepBodies } from './foes.ts';
import { FLOOR, PIT_Y } from './patio.ts';

export const BUF = 6;   // cuadros que se recuerda un deslizar o un mantener apretado durante un hitstop o un aturdido
export const REACH = { esgrimista: 1.5, estibador: 1.9 };   // la caminata asistida se frena a esta distancia del borde

export function newPlayer(id: number, cls: Cls, x: number, y: number, c: Cfg): Pl {
  return { id, cls, dirT: NEVER, dax: 0, day: 0, holdT: NEVER, x, y, vx: 0, vy: 0, ground: false, face: 1, groundT: NEVER, pressT: NEVER,
    air: c.AIR_JUMPS, rise: false, jumpHeld: false, dirHeld: false, holdHeld: false, hp: c.HP, invT: NEVER, stopT: NEVER, stunT: NEVER,
    hurtT: NEVER, combo: 0, comboT: NEVER, comboMax: 0, act: A.NONE, actT: NEVER, ax: 1, ay: 0, hits: [],
    charge: cls === 'esgrimista' ? c.DASH_N : c.HOOK_N, lagT: NEVER, parried: false, hook: null, hookT: NEVER, shot: null,
    safeX: x, safeY: y, zone: 0, foe: -1, dmgDealt: 0, kills: 0, fondo: 0 };
}
export function init(w: World, cls: Cls = 'esgrimista', zone = 0, seed = 1): State {
  const z = w.zones[zone], c = w.c ?? DEFAULTS;
  const p = newPlayer(0, cls, z.spawn[0], z.spawn[1], c);
  p.zone = zone;
  return { t: 0, seed, pl: [p], d: w.dummies.map(freshDummy), b: [], ev: [] };
}
// Lleva al jugador a una zona (y la deja como estaba: dummies enteros, sin proyectiles)
export function warp(s: State, w: World, p: Pl, zone: number) {
  const z = w.zones[zone];
  Object.assign(p, newPlayer(p.id, p.cls, z.spawn[0], z.spawn[1], w.c), { zone, comboMax: p.comboMax, dmgDealt: p.dmgDealt, kills: p.kills });
  s.d = w.dummies.map(freshDummy);
  s.b = [];
}

export function step(s: State, w: World, inputs: Input[]) {
  s.t++;
  s.ev = [];
  s.pl.forEach((p, k) => stepPlayer(s, w, p, inputs[k] ?? inputs[0]));
  stepFoes(s, w);
  stepBullets(s, w);
  const before = s.pl.map(p => p.ground);
  stepBodies(s, w);
  s.pl.forEach((p, k) => {
    if (p.ground) { p.groundT = s.t; p.air = w.c.AIR_JUMPS; p.rise = false; if (!before[k] && p.vy > 0) p.vy = 0; }
    zones(s, w, p);
  });
}

// El objetivo de la caminata asistida: el último enemigo golpeado (si sigue entero y en la sala) o el más cercano
function walkTarget(s: State, w: World, p: Pl): number {
  const zp = zoneOf(w, p.x, p.y);
  const ok = (k: number) => k >= 0 && alive(s, k) && breakable(w, k) && zoneOf(w, s.d[k].x, s.d[k].y) === zp && Math.abs(s.d[k].y - p.y) < 3;
  if (ok(p.foe) && s.t - p.comboT < 4 * HZ) return p.foe;
  let best = -1, bd = Infinity;
  for (let k = 0; k < s.d.length; k++) {
    if (!ok(k)) continue;
    const q = Math.abs(s.d[k].x - p.x) + Math.abs(s.d[k].y - p.y) * 2;
    if (q < bd) bd = q, best = k;
  }
  return best;
}

function stepPlayer(s: State, w: World, p: Pl, i: Input) {
  const c = w.c, t = s.t, g = gravity(c), est = p.cls === 'estibador';
  const jumpPress = i.jump && !p.jumpHeld, dirPress = i.dir && !p.dirHeld, holdPress = i.hold && !p.holdHeld;
  p.jumpHeld = i.jump, p.dirHeld = i.dir, p.holdHeld = i.hold;
  if (jumpPress) p.pressT = t;
  if (dirPress) p.dirT = t, p.dax = i.ax, p.day = i.ay;
  if (holdPress) p.holdT = t;
  if (t < p.stopT) return;                       // hitstop: congelado (los gestos quedan anotados)
  p.zone = Math.max(0, zoneOf(w, p.x, p.y));
  const kind = w.zones[p.zone].id;
  const stunned = t < p.stunT;
  const free = !stunned && p.act !== A.LAND;
  const dirQ = t - p.dirT <= BUF, holdQ = t - p.holdT <= BUF && i.hold;

  // ---- fin de lo que está haciendo
  if (p.act === A.DASH && t - p.actT >= c.DASH_F) {
    p.vx *= c.DASH_KEEP, p.vy *= c.DASH_KEEP, p.act = A.NONE;
    ev(s, 'dashEnd', {});
  }
  if (p.act === A.HAMMER && t - p.actT >= c.HAMMER_F) p.act = A.NONE;
  if (p.act === A.LAND && t - p.actT >= c.LAND_LAG) p.act = A.NONE;
  if (p.act === A.GUARD && (!i.hold || stunned)) endGuard(s, w, p);

  // ---- acciones de la clase
  let jumpUsed = false;
  if (free && !est) {
    // DASH-CORTE (cancela la guardia y la recuperación de lo demás)
    if (dirQ && p.charge >= 1 && p.act !== A.DASH) startDash(s, w, p);
    // GUARDIA: al apretar (no se rearma sola al terminar un dash)
    else if (holdQ && p.act === A.NONE && t >= p.lagT) {
      startGuard(s, p);
      if (Math.abs(i.tx - p.x) > 0.3) p.face = i.tx > p.x ? 1 : -1;
    }
  }
  if (est) {
    // la liga se suelta al soltar el dedo; un toque enganchado suelta con impulso hacia arriba
    if (p.hook && !i.hold) releaseHook(s, w, p);
    if (p.hook && jumpPress && attached(p, t)) {
      releaseHook(s, w, p);
      p.vy = Math.max(p.vy, 0) + c.HOOK_JUMP, p.pressT = NEVER, jumpUsed = true;
      ev(s, 'jump', { j: 3, x: p.x, y: p.y });
    }
    if (free) {
      if (holdQ && !p.hook && t >= p.hookT && p.charge >= 1) fireHook(s, w, p, i.tx, i.ty);
      if (dirQ && p.act !== A.HAMMER && p.act !== A.DIVE) {
        if (!p.ground && p.day < -0.7 * Math.sqrt(p.dax * p.dax + p.day * p.day)) startDive(s, w, p);
        else startHammer(s, w, p);
      }
    }
  }

  // ---- horizontal: carrera automática, caminata asistida o quieto
  const on = attached(p, t);
  const busy = p.act === A.DASH || (p.act === A.HAMMER && lungeOn(w, t - p.actT));
  if (!busy && !on) {
    let to = 0, run = false;
    if (kind === 'pasillo') { to = c.RUN, run = true; }
    else if (kind === 'sala' && c.WALK_AUTO > 0.5) {
      const k = walkTarget(s, w, p);
      if (k >= 0) {
        const d = s.d[k], z = sizeOf(w, k), gap = Math.abs(d.x - p.x) - z.hw - HW, sx = d.x >= p.x ? 1 : -1;
        if (p.act === A.NONE) p.face = sx;
        if (gap > REACH[p.cls]) to = c.WALK * sx;
      }
    }
    if (p.act === A.GUARD || p.act === A.LAND || (p.act === A.HAMMER) || stunned) to = 0;
    if (p.ground) {
      const speeding = to * p.vx >= 0 && Math.abs(to) > Math.abs(p.vx);
      p.vx = approach(p.vx, to, (speeding ? c.ACC : c.DEC) * DT);
      if (run && !stunned) p.face = 1;
    } else if (run && p.vx < to && p.act !== A.GUARD) p.vx = approach(p.vx, to, c.ACC * 0.5 * DT);
  }

  // ---- velocidad de las acciones
  if (p.act === A.DASH) { const v = dashSpeed(w); p.vx = p.ax * v, p.vy = p.ay * v; }
  if (p.act === A.HAMMER) {
    const f = t - p.actT;
    if (lungeOn(w, f)) { const v = c.HAMMER_LUNGE / (LUNGE_F / HZ); p.vx = p.ax * v, p.vy = p.ay * v; }
    else if (f === c.HAMMER_ON - 3 + LUNGE_F) p.vx *= 0.35, p.vy *= 0.35;
  }
  if (p.hook) hookForce(s, w, p);

  // ---- salto: buffer + coyote; en el aire, el doble salto. Sin salto variable (un toque no se mantiene).
  const canJump = !stunned && p.act !== A.DASH && p.act !== A.LAND && !jumpUsed && !on;
  if (canJump && t - p.pressT <= c.BUFFER && t - p.groundT <= c.COYOTE + 1) {
    p.vy = 2 * c.JUMP_H / c.JUMP_T, p.rise = true, p.pressT = p.groundT = NEVER, p.ground = false;
    if (p.act === A.GUARD) endGuard(s, w, p);
    if (p.act === A.HAMMER && t - p.actT >= c.HAMMER_OFF) p.act = A.NONE;
    ev(s, 'jump', { j: 1, x: p.x, y: p.y });
  } else if (canJump && p.pressT === t && p.air >= 1 && t - p.groundT > c.COYOTE + 1) {
    const v = Math.sqrt(2 * g * c.JUMP2_H);
    if (p.vy < v) p.vy = v;
    p.rise = true, p.air -= 1, p.pressT = NEVER;
    if (p.act === A.DIVE) p.act = A.NONE;
    ev(s, 'jump', { j: 2, x: p.x, y: p.y });
  }

  // ---- gravedad (paso trapezoidal: la parábola es exacta). Sin gravedad en el dash y en el lanzamiento del martillo.
  const vy0 = p.vy;
  if (!busy) {
    const fall = p.vy < 0 && !on ? c.FALL_G : 1;
    const wind = p.act === A.HAMMER && !p.ground ? 0.5 : 1;   // en el aire, cargar el martillo flota un poco
    p.vy -= g * fall * wind * DT;
    const maxf = kind === 'pozo' ? c.MAX_FALL_POZO : c.MAX_FALL;
    if (p.vy < -maxf && !on && p.act !== A.DIVE) p.vy = -maxf;
  }
  if (p.vy <= 0) p.rise = false;

  // ---- mover por ejes con barrido
  const x0 = p.x, y0 = p.y, wasGround = p.ground;
  const wx = p.vx * DT, dx = sweepX(w, p.x, p.y, HW, H, wx);
  p.x += dx;
  if (dx !== wx) p.vx = 0;
  const wy = (busy ? p.vy : (vy0 + p.vy) * 0.5) * DT, dy = sweepY(w, p.x, p.y, HW, H, wy);
  p.y += dy;
  p.ground = wy < 0 && dy !== wy;
  if (dy !== wy) p.vy = 0, p.rise = false;
  if (p.ground && !wasGround && vy0 < -6) ev(s, 'land', { v: -vy0, x: p.x, y: p.y });

  // ---- golpes después de mover
  if (p.act === A.DASH) dashHits(s, w, p, x0, y0);
  if (p.act === A.DIVE) { if (!diveContact(s, w, p) && p.ground) slam(s, w, p); }
  if (p.act === A.HAMMER) hammerHits(s, w, p);

  // ---- cargas, combo y suelo seguro
  if (!est) { if (p.ground && p.act !== A.DASH) p.charge = Math.min(c.DASH_N, p.charge + DT / c.DASH_CD); }
  else p.charge = Math.min(c.HOOK_N, p.charge + DT / c.HOOK_CD * (p.ground ? c.HOOK_GROUND : 1));
  if (p.combo && t - p.comboT > c.COMBO_T * HZ) p.combo = 0;
  if (p.ground && p.act !== A.DASH && firm(w, p.x, p.y, HW)) p.safeX = p.x, p.safeY = p.y;
}

// Fosos, el fondo del POZO y la vuelta del PASILLO; la integridad en cero se rellena (en el patio no se muere)
function zones(s: State, w: World, p: Pl) {
  const c = w.c, z = w.zones[p.zone];
  if (z.id === 'pasillo' && p.y < PIT_Y) {
    p.hp -= c.PIT_DMG, p.combo = 0;
    p.x = p.safeX, p.y = p.safeY, p.vx = p.vy = 0, p.hook = null, p.act = A.NONE;
    p.invT = s.t + HZ, p.stunT = s.t + 12;
    ev(s, 'pit', { dmg: c.PIT_DMG, x: p.x, y: p.y });
  }
  if (z.id === 'pasillo' && p.x > 204) { warp(s, w, p, p.zone); ev(s, 'vuelta', {}); }
  // al fondo del POZO: a los 1,5 s, otra vez arriba
  if (z.id === 'pozo' && p.ground && p.y <= FLOOR + 0.01) {
    if (++p.fondo === 1) ev(s, 'fondo', {});
    if (p.fondo > 90) { warp(s, w, p, p.zone); ev(s, 'vuelta', {}); }
  } else p.fondo = 0;
  if (p.hp <= 0) { p.hp = c.HP; ev(s, 'ko', {}); }
}
