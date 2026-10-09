// Combate: golpes (el % sube el empuje), explosiones, proyectiles, objetos, zonas y las cartas.
// Empuje recibido = (kb + kg × % / 100) × KB × fragilidad / masa. FRÁGIL lo multiplica por FRAG_K; PIES DE PLOMO por
// LEAD_K. La velocidad del golpeado se reemplaza (como en Smash) y queda aturdido STUN_K cuadros por m/s; con el
// joystick perpendicular desvía el golpe hasta DI grados (influencia). Tu propia explosión te empuja (rocket jump)
// sin dañarte ni aturdirte.
import { CELL, ROCK, cell, carve, solidAt, raycast, boxFree, sweepX, sweepY } from './terrain.ts';
import { CARD, HIT, BODY, projOf, SUB, type Boom, type Card } from './cards.ts';
import { charOf } from './chars.ts';
import { rnd, rndRange } from './rng.ts';
import { HZ, DT, NEVER, HW, H, HAND_Y, AIM_R, G_PROJ, PROP_M, PROP_HW, PROP_H, ev, enemies, height, trick, approach, inUlti,
  type State, type World, type Pl, type Proj, type Prop, type Input } from './state.ts';

// src: de qué carta o movimiento viene el golpe (solo para medir: el laboratorio de cartas y las estadísticas)
export type Hit = { dmg: number, kb: number, kg: number, dx: number, dy: number, by: number, frag?: number, stop?: number, noStun?: boolean, src?: string };

export const STUN_MAX = 90; // cuadros: tope del aturdimiento (un golpe enorme tampoco te deja sin control más de esto)

const norm = (x: number, y: number): [number, number] => { const n = Math.sqrt(x * x + y * y); return n > 1e-9 ? [x / n, y / n] : [0, 1]; };

// Multiplicador de empuje por estados
export function kbMul(s: State, w: World, p: Pl) {
  return w.c.KB * (s.t < p.fragT ? w.c.FRAG_K : 1) * (s.t < p.leadT ? w.c.LEAD_K : 1) / charOf(p.ch).mass;
}

// Golpear a un jugador. Devuelve si pegó (invulnerable, escudo o compañero con fuego amigo apagado: no).
export function hurt(s: State, w: World, p: Pl, h: Hit): boolean {
  const c = w.c, t = s.t;
  if (!p.alive || inUlti(p)) return false; // en ulti no te tocan
  const self = h.by === p.id, by = h.by >= 0 ? s.pl[h.by] : null;
  if (!self && by && s.rules.teams && by.team === p.team && !s.rules.friendly) return false;
  if (!self && t < p.invT) return false;
  if (!self && t < p.shieldT) { ev(s, 'block', { p: p.id }); return false; }
  const dmg = self ? 0 : h.dmg;
  p.dmg = Math.min(999, p.dmg + dmg);
  let [dx, dy] = norm(h.dx, h.dy);
  let v = self ? h.kb * c.SELF_KB : (h.kb + h.kg * p.dmg / 100) * kbMul(s, w, p);
  if (self) v *= c.KB;
  // Influencia: el joystick perpendicular al golpe lo gira hasta DI grados
  if (!self && !h.noStun && c.DI > 0) {
    const perp = p.inX * -dy + p.inY * dx, a = Math.max(-1, Math.min(1, perp)) * c.DI * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    [dx, dy] = [dx * ca - dy * sa, dx * sa + dy * ca];
  }
  if (self) { p.vx += dx * v, p.vy = Math.max(p.vy, 0) * 0.3 + dy * v; }
  else if (h.noStun) p.vx += dx * v, p.vy += dy * v; // daño con el tiempo (nube, fuego): un empujoncito, sin pisar la velocidad ni el aturdimiento
  else {
    p.vx = dx * v, p.vy = dy * v;
    const stun = Math.min(STUN_MAX, Math.round(v * c.STUN_K));
    p.stunT = t + stun, p.tumble = stun > 14;
    p.stopT = t + (h.stop ?? Math.min(9, 2 + Math.round(v / 5)));
    if (stun > 10) { // un golpe fuerte corta lo que estabas haciendo (también el megaláser que cargabas o disparabas)
      p.hook = null, p.slide = false, p.pound = false, p.dashT = NEVER, p.atk = null, p.cloudT = NEVER;
      for (const b of s.beams) if (b.o === p.id && b.k === 'mega') b.t0 = b.t1 = t;
    }
  }
  if (self || !h.noStun || v > 0) p.ground = false;
  if (h.frag && !self) p.fragT = Math.max(p.fragT, t + Math.round(h.frag * HZ));
  if (!self && by) {
    p.lastBy = by.id, p.lastT = t;
    by.dealt += dmg, by.ulti = Math.min(100, by.ulti + dmg * c.ULTI_DEALT);
    p.ulti = Math.min(100, p.ulti + dmg * c.ULTI_TAKEN);
  }
  if (dmg > 0 || !self) ev(s, 'hit', { p: p.id, d: Math.round(dmg), v: Math.round(v), x: p.x, y: p.y + 0.55, by: h.by, ...(h.src ? { src: h.src } : {}) });
  return true;
}

// Distancia de un punto a la caja de un jugador
function boxDist(x: number, y: number, p: Pl) {
  const bx = Math.max(p.x - HW, Math.min(x, p.x + HW)), by = Math.max(p.y, Math.min(y, p.y + height(p)));
  return Math.sqrt((x - bx) * (x - bx) + (y - by) * (y - by));
}
const mid = (p: Pl) => p.y + height(p) / 2;

// Explosión: rompe terreno, empuja y daña a los jugadores (con caída a lo lejos), empuja objetos y proyectiles y
// detona TNT, latas y minas (en el próximo cuadro: así las cadenas se ven de a una).
export function boom(s: State, w: World, x: number, y: number, b: Boom, by: number, kind = '', src = kind) {
  if (b.carve > 0) carve(w.T, [0, x, y, b.carve]);
  ev(s, 'boom', { x, y, r: b.r, kind: kind });
  for (const p of s.pl) {
    if (!p.alive) continue;
    const d = boxDist(x, y, p);
    if (d > b.r) continue;
    const f = 1 - 0.5 * d / b.r, [dx, dy] = norm(p.x - x, mid(p) - y);
    hurt(s, w, p, { dmg: b.dmg * f, kb: b.kb * (0.6 + 0.4 * f), kg: b.kg * f, dx, dy: dy + 0.35, by, frag: b.frag, src });
  }
  for (const o of s.props) {
    if (o.dead) continue;
    const ox = o.x, oy = o.y + PROP_H / 2, d = Math.sqrt((ox - x) ** 2 + (oy - y) ** 2);
    if (d > b.r + 0.4) continue;
    const [dx, dy] = norm(ox - x, oy - y);
    o.vx += dx * b.kb * 1.2, o.vy += (dy + 0.4) * b.kb * 1.2, o.ground = false;
    if (o.k !== 'caja') o.hp -= 1, o.o = by >= 0 ? by : o.o;
  }
  for (const q of s.pr) {
    if (q.dead || q.st === 2) continue;
    const d = Math.sqrt((q.x - x) ** 2 + (q.y - y) ** 2);
    if (d > b.r || d < 0.05) continue;
    if (q.c === 'mina' && q.arm <= s.t) { if (q.fuse === NEVER || q.fuse > s.t + 1) q.fuse = s.t + 1; continue; }
    const [dx, dy] = norm(q.x - x, q.y - y);
    if (q.st === 1 && projOf(q.c)?.sticky) continue;
    q.st = 0, q.vx += dx * b.kb * 0.8, q.vy += dy * b.kb * 0.8;
  }
}

// ---- Cartas ----------------------------------------------------------------------------------------------------

// Mira de una carta: unitaria y fuerza (0–1). Sin mira: hacia el joystick o adelante (con arco: 45° arriba).
export function castAim(p: Pl, i: Input, card: Card): [number, number, number] {
  let x = i.ax, y = i.ay, pw = Math.min(1, Math.sqrt(x * x + y * y));
  if (pw < 0.12) {
    x = Math.abs(i.x) > 0.3 ? Math.sign(i.x) : p.face, y = i.y > 0.4 ? 1 : i.y < -0.4 ? -1 : card.aim === 'arc' ? 0.8 : 0;
    pw = 0.75;
  }
  const n = Math.sqrt(x * x + y * y);
  return [x / n, y / n, Math.max(0.2, pw)];
}

export function newProj(s: State, c: string, o: number, x: number, y: number, vx: number, vy: number): Proj {
  const d = projOf(c)!, q: Proj = { id: s.nid++, c, o, x, y, vx, vy, t0: s.t, fuse: d.fuse ? s.t + Math.round(d.fuse * HZ) : NEVER,
    b: 0, st: 0, sp: -1, sx: 0, sy: 0, hit: [], arm: s.t + 40, dead: false };
  s.pr.push(q);
  return q;
}
export function newProp(s: State, k: string, x: number, y: number, vx: number, vy: number, o: number, card = ''): Prop {
  const o2: Prop = { id: s.nid++, k, x, y, vx, vy, hp: 1, o, card, chute: k === 'caja', ground: false, t0: s.t, dead: false };
  s.props.push(o2);
  return o2;
}

// ¿Puede lanzar? (vivo, no aturdido, sin ulti, con maná y fuera de la pausa entre cartas)
export function canCast(s: State, w: World, p: Pl, slot: number) {
  const id = slot === 4 ? p.bonus : p.hand[slot];
  if (!id || !p.alive || s.t < p.stunT || inUlti(p) || s.t < p.castT || p.atk) return false;
  return slot === 4 || s.rules.infinite || p.mana >= CARD[id].cost;
}

export function cast(s: State, w: World, p: Pl, slot: number, i: Input) {
  if (!canCast(s, w, p, slot)) return;
  const id = slot === 4 ? p.bonus : p.hand[slot], card = CARD[id], c = w.c, t = s.t;
  if (slot === 4) p.bonus = '';
  else {
    if (!s.rules.infinite) p.mana -= card.cost;
    p.hand[slot] = p.queue.shift()!;
    p.queue.push(id);
  }
  p.castT = t + c.CAST_CD, p.castK = id, p.castAt = t, p.cloudT = NEVER;
  const [ax, ay, pw] = castAim(p, i, card);
  if (Math.abs(ax) > 0.15) p.face = Math.sign(ax);
  const hx = p.x + ax * 0.45, hy = p.y + HAND_Y + ay * 0.3;
  ev(s, 'cast', { p: p.id, c: id });
  const pd = card.proj;
  const speed = pd ? pd.v * (card.aim === 'arc' ? 0.3 + 0.7 * pw : 1) : 0;
  switch (id) {
    case 'triple':
      for (const a of [-0.2, 0, 0.2]) {
        const ca = Math.cos(a), sa = Math.sin(a);
        newProj(s, id, p.id, hx, hy, (ax * ca - ay * sa) * speed, (ax * sa + ay * ca) * speed);
      }
      return;
    case 'caparazon': newProj(s, id, p.id, hx, p.y + 0.45, (ax >= 0 ? 1 : -1) * speed, 2); return;
    case 'gas': case 'tnt': newProp(s, id, hx, p.y + 0.3, ax * 12 * (0.3 + 0.7 * pw), ay * 12 * (0.3 + 0.7 * pw) + 2, p.id); return;
    case 'laser': beamShot(s, w, p, hx, hy, ax, ay, 26, 0.4, HIT.laser); return;
    case 'megalaser': s.beams.push({ id: s.nid++, k: 'mega', o: p.id, x: hx, y: hy, dx: ax, dy: ay, t0: t + 27, t1: t + 27 + 60, len: 40 }); return;
    case 'vaca': case 'meteorito': {
      const tx = p.x + ax * pw * AIM_R, k = id === 'vaca' ? 'vaca' : 'meteo';
      s.beams.push({ id: s.nid++, k, o: p.id, x: tx, y: w.m.h + 4, dx: 0, dy: -1, t0: t + (k === 'vaca' ? 36 : 40), t1: t + (k === 'vaca' ? 36 + 24 : 40), len: 0 });
      return;
    }
    case 'iman': {
      const tgt = rayPlayer(s, w, p, hx, hy, ax, ay, 18);
      ev(s, 'ray', { p: p.id, x0: hx, y0: hy, x1: tgt ? tgt.x : hx + ax * 18, y1: tgt ? mid(tgt) : hy + ay * 18, kind: 'iman' });
      if (tgt) { const [dx, dy] = norm(p.x - tgt.x, mid(p) - mid(tgt)); hurt(s, w, tgt, { ...HIT.iman, dx, dy: dy + 0.25, by: p.id, src: 'iman' }); }
      return;
    }
    case 'supersalto':
      p.vx = ax * 20 + p.vx * 0.2, p.vy = ay * 20 + (ay > -0.3 ? 3 : 0);
      p.air = charOf(p.ch).airJumps, p.dashN = charOf(p.ch).dashN, p.ground = false, p.slide = false, p.pound = false, p.dashT = NEVER;
      trick(s, c, p, 'SUPERSALTO');
      return;
    case 'fruta': p.dmg = Math.max(0, p.dmg - HIT.frutaCura), p.fragT = NEVER; ev(s, 'heal', { p: p.id }); return;
    case 'escudo': p.shieldT = t + 3 * HZ; return;
    case 'plomo': p.leadT = t + 6 * HZ; return;
    case 'bate': case 'katana': p.atk = { k: id, t0: t, dx: ax, dy: ay, hit: [] }; if (id === 'katana') p.invT = Math.max(p.invT, t + 10); return;
    case 'autodestruccion': p.atk = { k: id, t0: t, dx: 0, dy: 1, hit: [] }; return;
    case 'trompeta': {
      ev(s, 'cone', { p: p.id, x: hx, y: hy, dx: ax, dy: ay });
      for (const q of s.pl) {
        if (!q.alive || !enemies(s, p, q)) continue;
        const vx = q.x - hx, vy = mid(q) - hy, d = Math.sqrt(vx * vx + vy * vy);
        if (d > 7.5 || d < 1e-6 || (vx * ax + vy * ay) / d < 0.5) continue;
        hurt(s, w, q, { dmg: HIT.trompeta.dmg, kb: HIT.trompeta.kb * (1 - d / 12), kg: HIT.trompeta.kg, dx: vx / d, dy: vy / d + 0.2, by: p.id, src: 'trompeta' });
      }
      for (const q of s.pr) {
        const vx = q.x - hx, vy = q.y - hy, d = Math.sqrt(vx * vx + vy * vy);
        if (d < 7.5 && d > 1e-6 && (vx * ax + vy * ay) / d > 0.5) q.st = 0, q.vx = vx / d * 25, q.vy = vy / d * 25, q.o = p.id;
      }
      for (const o of s.props) {
        const vx = o.x - hx, vy = o.y - hy, d = Math.sqrt(vx * vx + vy * vy);
        if (d < 7.5 && d > 1e-6 && (vx * ax + vy * ay) / d > 0.5) o.vx = vx / d * 20, o.vy = vy / d * 20 + 4, o.ground = false, o.o = p.id;
      }
      return;
    }
  }
  if (pd) newProj(s, id, p.id, hx, hy, ax * speed + p.vx * 0.25, ay * speed + p.vy * 0.15);
}

// Primer rival que toca un rayo (con línea de vista contra el terreno)
function rayPlayer(s: State, w: World, p: Pl, x: number, y: number, dx: number, dy: number, L: number): Pl | null {
  const r = raycast(w.T, x, y, dx, dy, L), lim = r.d >= 0 ? r.d : L;
  let best: Pl | null = null, bd = lim;
  for (const q of s.pl) {
    if (!q.alive || !enemies(s, p, q)) continue;
    const u = (q.x - x) * dx + (mid(q) - y) * dy;
    if (u < 0 || u > bd) continue;
    const ex = q.x - x - dx * u, ey = mid(q) - y - dy * u;
    if (Math.sqrt(ex * ex + ey * ey) < 0.85) best = q, bd = u;
  }
  return best;
}

// Rayo que rompe tierra (hasta la piedra) y golpea a todos los que cruza
function beamShot(s: State, w: World, p: Pl, x: number, y: number, dx: number, dy: number, L: number, r: number, h: { dmg: number, kb: number, kg: number }, once = true) {
  let len = 0;
  for (; len < L; len += CELL * 0.5) if (cell(w.T, Math.floor((x + dx * len) / CELL), Math.floor((y + dy * len) / CELL)) === ROCK) break;
  carve(w.T, [1, x, y, x + dx * len, y + dy * len, r]);
  ev(s, 'ray', { p: p.id, x0: x, y0: y, x1: x + dx * len, y1: y + dy * len, kind: once ? 'laser' : 'mega', r });
  for (const q of s.pl) {
    if (!q.alive || !enemies(s, p, q)) continue;
    const u = (q.x - x) * dx + (mid(q) - y) * dy;
    if (u < 0 || u > len) continue;
    const ex = q.x - x - dx * u, ey = mid(q) - y - dy * u;
    if (Math.sqrt(ex * ex + ey * ey) < r + 0.55) hurt(s, w, q, { ...h, dx, dy: dy + 0.3, by: p.id, stop: once ? undefined : 1, src: once ? 'laser' : 'megalaser' });
  }
  for (const o of s.props) {
    const u = (o.x - x) * dx + (o.y + 0.4 - y) * dy;
    if (u >= 0 && u <= len && Math.abs((o.x - x) * dy - (o.y + 0.4 - y) * dx) < r + 0.5 && o.k !== 'caja') o.hp -= 1;
  }
}

// Golpes cuerpo a cuerpo de las cartas (bate, katana) y la autodestrucción, cuadro a cuadro
export function attacks(s: State, w: World, p: Pl) {
  const a = p.atk, t = s.t;
  if (!a || !p.alive) return;
  const f = t - a.t0;
  if (a.k === 'bate') {
    if (f === 5) {
      const cx = p.x + a.dx * 1.1, cy = p.y + HAND_Y + a.dy * 1.1;
      ev(s, 'swing', { p: p.id, x: cx, y: cy, dx: a.dx, dy: a.dy });
      for (const q of s.pl) if (q.alive && enemies(s, p, q) && boxDist(cx, cy, q) < 1.4)
        hurt(s, w, q, { ...HIT.bate, dx: a.dx, dy: a.dy + 0.4, by: p.id, stop: 7, src: 'bate' });
      for (const q of s.pr) { // devuelve proyectiles
        if (q.dead || q.st === 2 || Math.sqrt((q.x - cx) ** 2 + (q.y - cy) ** 2) > 1.9) continue;
        const v = Math.max(18, Math.sqrt(q.vx * q.vx + q.vy * q.vy));
        q.st = 0, q.vx = a.dx * v, q.vy = a.dy * v + 3, q.o = p.id, q.hit = [];
        ev(s, 'deflect', { x: q.x, y: q.y });
      }
      for (const o of s.props) if (!o.dead && Math.sqrt((o.x - cx) ** 2 + (o.y + 0.4 - cy) ** 2) < 1.8)
        o.vx = a.dx * 24, o.vy = a.dy * 24 + 6, o.ground = false, o.o = p.id;
      p.stopT = t + 4;
    }
    if (f >= 14) p.atk = null;
  } else if (a.k === 'katana') {
    if (f < 8) {
      const v = 52, dx = sweepX(w.T, p.x, p.y, HW, height(p), a.dx * v * DT);
      p.x += dx;
      p.y += sweepY(w.T, p.x, p.y, HW, height(p), a.dy * v * DT);
      p.vx = a.dx * 8, p.vy = a.dy * 8;
      for (const q of s.pl) if (q.alive && enemies(s, p, q) && !a.hit.includes(q.id) && Math.abs(q.x - p.x) < 1.3 && Math.abs(mid(q) - mid(p)) < 1.4) {
        a.hit.push(q.id);
        hurt(s, w, q, { ...HIT.katana, dx: a.dx, dy: a.dy + 0.5, by: p.id, stop: 6, src: 'katana' });
      }
    } else p.atk = null;
  } else if (a.k === 'autodestruccion') {
    if (f === 30) {
      p.atk = null;
      boom(s, w, p.x, mid(p), HIT.autodestruccion, p.id, 'grande', 'autodestruccion');
      p.dmg = Math.min(999, p.dmg + HIT.autodestruccionSelf), p.vy = 22, p.vx *= 0.3, p.ground = false;
    }
  }
}

// ---- Proyectiles -----------------------------------------------------------------------------------------------

// A qué carta se le acredita cada subproyectil (para medir)
const SRC: Record<string, string> = { bombita: 'racimo', grano: 'palomitas', meteoro: 'meteorito' };

function explode(s: State, w: World, q: Proj) {
  q.dead = true;
  const d = projOf(q.c)!, b = d.boom;
  if (q.c === 'racimo') for (let k = 0; k < 6; k++) {
    const a = -0.6 + 1.2 * k / 5 + rndRange(s, -0.1, 0.1), v = rndRange(s, 7, 12);
    const b2 = newProj(s, 'bombita', q.o, q.x, q.y + 0.2, Math.sin(a) * v, Math.cos(a) * v);
    b2.fuse = s.t + Math.round(rndRange(s, 0.55, 1.0) * HZ);
  }
  if (q.c === 'palomitas') for (let k = 0; k < 8; k++) {
    const a = rndRange(s, -1.1, 1.1), v = rndRange(s, 6, 13);
    const g = newProj(s, 'grano', q.o, q.x, q.y + 0.2, Math.sin(a) * v, Math.cos(a) * v);
    g.fuse = s.t + Math.round(rndRange(s, 0.35, 1.5) * HZ);
  }
  if (q.c === 'melocoton') s.zones.push({ id: s.nid++, k: 'nube', x: q.x, y: q.y, r: 2.8, t0: s.t, until: s.t + Math.round(3.5 * HZ), o: q.o });
  if (b) boom(s, w, q.x, q.y, b, q.o, q.c === 'granbum' || q.c === 'meteoro' ? 'grande' : q.c, SRC[q.c] ?? q.c);
}

// Choque de un círculo (centro x, y, radio r) contra la caja de un jugador
const touches = (x: number, y: number, r: number, p: Pl) => boxDist(x, y, p) <= r;

// Rebote de una bomba contra la caja de un jugador: por el lado de menor penetración, con un saltito, y la saca de la caja
// (si no, quedaba clavada adentro del rival y explotaba en su centro, empujándolo solo hacia arriba)
function bounceOff(q: Proj, p: Pl, r: number, e: number) {
  q.hit.push(p.id), q.b++; // cuenta como rebote
  if (q.c === 'caballo') q.b = 4; // y el caballo explota al chocar con un rival
  const h = height(p), ox = (q.x - p.x) / (HW + r), oy = (q.y - (p.y + h / 2)) / (h / 2 + r);
  if (Math.abs(ox) > Math.abs(oy)) {
    const sg = Math.sign(ox || -q.vx || 1);
    q.x = p.x + sg * (HW + r + 0.02), q.vx = sg * Math.max(2, Math.abs(q.vx) * e), q.vy = Math.max(q.vy, 3);
  } else {
    const sg = Math.sign(oy || 1);
    q.y = sg > 0 ? p.y + h + r + 0.02 : p.y - r - 0.02, q.vy = sg * Math.max(2, Math.abs(q.vy) * e), q.vx *= 0.8;
  }
}

// Al tocar algo: lo que hace cada carta. Devuelve true si el proyectil terminó.
function onTouch(s: State, w: World, q: Proj, who: Pl | null, x: number, y: number): boolean {
  const owner = s.pl[q.o], d = projOf(q.c)!;
  switch (q.c) {
    case 'tele': {
      q.dead = true;
      if (!owner?.alive) return true;
      let tx = x, ty = y;
      if (who) tx = who.x - Math.sign(q.vx || 1) * 1, ty = who.y;
      for (let k = 0; k < 12; k++) { // el lugar libre más cercano hacia atrás del rayo
        if (boxFree(w.T, tx, ty, HW, H)) break;
        ty += CELL;
      }
      if (!boxFree(w.T, tx, ty, HW, H)) return true;
      ev(s, 'tele', { p: owner.id, x0: owner.x, y0: owner.y, x1: tx, y1: ty });
      owner.x = tx, owner.y = ty, owner.vx *= 0.3, owner.vy = Math.max(0, owner.vy), owner.hook = null;
      owner.invT = Math.max(owner.invT, s.t + 18);
      return true;
    }
    case 'swap': {
      q.dead = true;
      if (!owner?.alive) return true;
      if (who && s.t >= who.glueT && !inUlti(who)) {
        ev(s, 'swap', { a: owner.id, b: who.id, x0: owner.x, y0: owner.y, x1: who.x, y1: who.y });
        [owner.x, who.x] = [who.x, owner.x];
        [owner.y, who.y] = [who.y, owner.y];
        [owner.vx, who.vx] = [who.vx, owner.vx];
        [owner.vy, who.vy] = [who.vy, owner.vy];
        owner.hook = who.hook = null, who.lastBy = owner.id, who.lastT = s.t;
        trick(s, w.c, owner, 'INTERCAMBIO');
      }
      return true;
    }
    case 'pegamento':
      q.dead = true;
      if (!who) s.zones.push({ id: s.nid++, k: 'pega', x, y: y - 0.1, r: 1.6, t0: s.t, until: s.t + 8 * HZ, o: q.o });
      return true;
  }
  if (d.contact) { explode(s, w, q); return true; }
  return false;
}

export function projectiles(s: State, w: World) {
  const t = s.t, T = w.T;
  for (const q of s.pr) {
    if (q.dead) continue;
    const d = projOf(q.c)!, age = t - q.t0, owner = s.pl[q.o];
    if (d.life && age >= d.life * HZ) { if (q.c === 'mina' || !d.boom || d.pierce) q.dead = true; else explode(s, w, q); continue; }
    if (t >= q.fuse && q.fuse !== NEVER) { explode(s, w, q); continue; }
    if (q.y < w.m.water - 0.2 || q.x < -30 || q.x > w.m.w + 30 || q.y > w.m.h + 40) { // al agua o fuera del mapa
      if (q.y < w.m.water) ev(s, 'splash', { x: q.x, y: w.m.water, r: d.r });
      q.dead = true; continue;
    }
    if (q.st === 2) { // pegado a un jugador
      const p = s.pl[q.sp];
      if (!p || !p.alive) { q.st = 0; continue; }
      q.x = p.x + q.sx, q.y = p.y + q.sy;
      continue;
    }
    if (q.st === 1) { // pegado al terreno: si se rompe lo de abajo, se suelta
      if (!solidAt(T, q.x + q.sx, q.y + q.sy)) q.st = 0, q.vx = q.vy = 0;
      else {
        if (q.c === 'mina' && t >= q.arm && q.fuse === NEVER) for (const p of s.pl) if (p.alive && (!owner || enemies(s, owner, p)) && touches(q.x, q.y, 1, p)) { q.fuse = t + 6; break; }
        if (q.c === 'banana') for (const p of s.pl) if (p.alive && (!owner || enemies(s, owner, p)) && touches(q.x, q.y, 0.35, p) && p.ground) {
          q.dead = true;
          hurt(s, w, p, { ...HIT.banana, dx: Math.sign(p.vx || p.face) * 0.6, dy: 1, by: q.o, frag: 3, src: 'banana' });
          ev(s, 'slip', { p: p.id });
          break;
        }
        continue;
      }
    }
    // Movimiento: gravedad, cohete, boomerang (vuelve al dueño), caparazón (rueda)
    q.vy -= G_PROJ * d.g * DT;
    if (d.accel) {
      const v = Math.sqrt(q.vx * q.vx + q.vy * q.vy), nv = Math.min(d.vmax ?? 40, v + d.accel * DT);
      if (v > 1e-6) q.vx *= nv / v, q.vy *= nv / v;
    }
    if (q.c === 'boomerang' && age > 26 && owner?.alive) {
      const [dx, dy] = norm(owner.x - q.x, mid(owner) - q.y);
      q.vx = approach(q.vx, dx * 26, 70 * DT), q.vy = approach(q.vy, dy * 26, 70 * DT);
      if (age > 40 && Math.abs(owner.x - q.x) < 0.6 && Math.abs(mid(owner) - q.y) < 0.8) { q.dead = true; continue; }
      if (age === 27) q.hit = [];
    }
    const bouncy = !!d.bounce && !d.contact && !d.pierce && !d.sticky;
    const sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy), n = Math.max(1, Math.ceil(sp * DT / (CELL * 0.8)));
    let done = false;
    for (let k = 0; k < n && !done; k++) {
      const sx = q.vx * DT / n, sy = q.vy * DT / n;
      // Jugadores
      for (const p of s.pl) {
        const near = p.alive && touches(q.x, q.y, d.r, p);
        if (bouncy && !near) { const k = q.hit.indexOf(p.id); if (k >= 0) q.hit.splice(k, 1); } // ya se separó: puede volver a rebotar
        if (!near || (p.id === q.o && age < 18)) continue;
        if (owner && !enemies(s, owner, p) && p.id !== q.o) continue;
        if (s.t < p.shieldT && p.id !== q.o) { // el escudo devuelve
          const [nx, ny] = norm(q.x - p.x, q.y - mid(p));
          const v = Math.max(12, sp);
          q.vx = nx * v, q.vy = ny * v, q.o = p.id, q.hit = [];
          ev(s, 'deflect', { x: q.x, y: q.y });
          break;
        }
        if (d.pierce) {
          if (q.hit.includes(p.id) || p.id === q.o) continue;
          q.hit.push(p.id);
          const [dx, dy] = norm(q.vx, q.vy);
          hurt(s, w, p, { ...d.pierce, dx, dy: dy + 0.4, by: q.o, src: q.c });
          continue;
        }
        if (bouncy) { // las bombas con mecha rebotan contra los rivales (antes los atravesaban y explotaban lejos)
          if (p.id !== q.o && !q.hit.includes(p.id)) bounceOff(q, p, d.r, d.bounce!);
          continue;
        }
        if (p.id === q.o && !d.contact) continue;
        if (d.sticky && q.c !== 'mina' && q.c !== 'banana') { q.st = 2, q.sp = p.id, q.sx = q.x - p.x, q.sy = q.y - p.y; done = true; break; }
        if (onTouch(s, w, q, p, q.x, q.y)) { done = true; break; }
      }
      if (done || q.dead || q.st) break;
      // Terreno (por ejes, mirando el borde del círculo hacia donde va)
      const ghost = q.c === 'boomerang';
      const hitX = !ghost && solidAt(T, q.x + sx + Math.sign(sx) * d.r, q.y);
      if (hitX) {
        if (q.c === 'caparazon') { q.vx = -q.vx, q.b++; }
        else if (d.sticky) { q.st = 1, q.sx = Math.sign(sx) * (d.r + 0.05), q.sy = 0, q.vx = q.vy = 0; q.arm = t + 40; break; }
        else if (d.bounce) { q.vx = -q.vx * d.bounce, q.b++; if (q.c === 'caballo') q.vy += rndRange(s, 2, 9); }
        else if (d.pierce) { q.vx = q.vy = 0, q.st = 1, q.sx = Math.sign(sx) * (d.r + 0.05), q.sy = 0; break; }
        else if (onTouch(s, w, q, null, q.x + sx, q.y)) break;
        else { q.vx = 0; }
      } else q.x += sx;
      const hitY = !ghost && solidAt(T, q.x, q.y + sy + Math.sign(sy) * d.r);
      if (hitY) {
        if (q.c === 'caparazon') { q.vy = 0; q.vx = Math.sign(q.vx || 1) * 14; }
        else if (d.sticky) { q.st = 1, q.sx = 0, q.sy = Math.sign(sy) * (d.r + 0.05), q.vx = q.vy = 0; q.arm = t + 40; break; }
        else if (d.bounce) {
          q.vy = -q.vy * d.bounce, q.vx *= 0.85, q.b++;
          if (q.c === 'caballo') q.vx += rndRange(s, -6, 6), q.vy += rndRange(s, 3, 8);
          if (Math.abs(q.vy) < 1.2) q.vy = 0;
        }
        else if (d.pierce) { q.vx = q.vy = 0, q.st = 1, q.sx = 0, q.sy = Math.sign(sy) * (d.r + 0.05); break; }
        else if (onTouch(s, w, q, null, q.x, q.y + sy)) break;
        else q.vy = 0;
      } else q.y += sy;
    }
    if (q.c === 'caballo' && q.b >= 4 && !q.dead) explode(s, w, q);
    if (q.c === 'caparazon' && q.b >= 8) q.dead = true;
    if (q.c === 'bomba' || q.c === 'racimo' || q.c === 'granbum') { // en el suelo se frena
      if (Math.abs(q.vy) < 0.01 && solidAt(T, q.x, q.y - d.r - 0.05)) q.vx = approach(q.vx, 0, 12 * DT);
    }
  }
  s.pr = s.pr.filter(q => !q.dead);
}

// ---- Objetos: TNT, lata de gas, caja de carta -------------------------------------------------------------------

export function props(s: State, w: World) {
  const t = s.t, T = w.T;
  for (const o of s.props) {
    if (o.dead) continue;
    if (o.hp <= 0) {
      o.dead = true;
      if (o.k === 'tnt') boom(s, w, o.x, o.y + 0.4, HIT.tnt, o.o, 'grande', 'tnt');
      if (o.k === 'gas') {
        boom(s, w, o.x, o.y + 0.4, HIT.gas, o.o, 'fuego', 'gas');
        s.zones.push({ id: s.nid++, k: 'fuego', x: o.x, y: o.y, r: 2.2, t0: t, until: t + 120, o: o.o });
      }
      continue;
    }
    if (o.y < w.m.water - 0.5 || o.x < -30 || o.x > w.m.w + 30) {
      if (o.y < w.m.water) ev(s, 'splash', { x: o.x, y: w.m.water, r: 0.6 });
      o.dead = true; continue;
    }
    // Lanzada con fuerza contra algo: TNT y gas explotan
    const fast = o.vx * o.vx + o.vy * o.vy > 14 * 14 && o.k !== 'caja';
    if (o.chute) o.vy = Math.max(o.vy - G_PROJ * 0.15 * DT, -2.6);
    else o.vy -= G_PROJ * 1.2 * DT;
    if (o.ground) o.vx = approach(o.vx, 0, 25 * DT);
    const wx = o.vx * DT, mx = sweepX(T, o.x, o.y, PROP_HW, PROP_H, wx);
    o.x += mx;
    if (mx !== wx) { if (fast) o.hp = 0; o.vx = -o.vx * 0.2; }
    const wy = o.vy * DT, my = sweepY(T, o.x, o.y, PROP_HW, PROP_H, wy);
    o.y += my;
    o.ground = wy < 0 && my !== wy;
    if (my !== wy) { if (fast) o.hp = 0; o.vy = 0; if (o.ground) o.chute = false; }
    if (fast && o.hp > 0) for (const p of s.pl) if (p.alive && p.id !== o.o && Math.abs(p.x - o.x) < HW + PROP_HW && p.y < o.y + PROP_H && p.y + height(p) > o.y) {
      o.hp = 0;
      const [dx, dy] = norm(o.vx, o.vy);
      hurt(s, w, p, { ...HIT.objeto, dx, dy: dy + 0.3, by: o.o, src: o.k });
      break;
    }
    // Caja de carta: la toma el primero que la toque
    if (o.k === 'caja') for (const p of s.pl) if (p.alive && Math.abs(p.x - o.x) < HW + PROP_HW && p.y < o.y + PROP_H && p.y + height(p) > o.y) {
      o.dead = true;
      if (o.card === '+ulti') p.ulti = Math.min(100, p.ulti + 50);
      else if (o.card === '+mana') p.mana = w.c.MANA_MAX;
      else p.bonus = o.card;
      ev(s, 'pick', { p: p.id, c: o.card });
      break;
    }
  }
  s.props = s.props.filter(o => !o.dead);
}

// ---- Zonas y rayos con tiempo --------------------------------------------------------------------------------

export function zones(s: State, w: World) {
  const t = s.t;
  for (const z of s.zones) {
    const owner = s.pl[z.o];
    for (const p of s.pl) {
      if (!p.alive || (owner && !enemies(s, owner, p))) continue;
      const dx = p.x - z.x, dy = mid(p) - z.y, inside = dx * dx + dy * dy < (z.r + 0.4) ** 2;
      if (z.k === 'pega') { if (p.ground && Math.abs(dx) < z.r && Math.abs(p.y - z.y) < 0.6) p.glueT = t + 10; continue; }
      if (!inside) continue;
      if (z.k === 'nube') {
        if (t >= p.invT && t >= p.shieldT && !inUlti(p)) p.fragT = Math.max(p.fragT, t + 90);
        if ((t - z.t0) % 30 === 0) hurt(s, w, p, { ...HIT.nube, dx: 0, dy: 1, by: z.o, noStun: true, src: 'melocoton/nube' });
      } else if (z.k === 'fuego' && (t - z.t0) % 15 === 0) hurt(s, w, p, { ...HIT.fuego, dx: 0, dy: 1, by: z.o, noStun: true, src: 'gas/fuego' });
    }
  }
  s.zones = s.zones.filter(z => t < z.until);
  for (const b of s.beams) {
    const p = s.pl[b.o];
    if (b.k === 'mega') {
      if (t < b.t0) { if (p?.alive) b.x = p.x + b.dx * 0.45, b.y = p.y + HAND_Y + b.dy * 0.3, p.vx *= 0.8, p.vy *= 0.8; continue; }
      if (!p?.alive) { b.t1 = t; continue; }
      b.x = p.x + b.dx * 0.45, b.y = p.y + HAND_Y + b.dy * 0.3;
      p.vx -= b.dx * 10 * DT, p.vy -= b.dy * 10 * DT; // el retroceso
      if ((t - b.t0) % 6 === 0) beamShot(s, w, p, b.x, b.y, b.dx, b.dy, b.len, 1, HIT.megalaser, false);
    } else if (b.k === 'vaca' && t >= b.t0 && (t - b.t0) % 6 === 0) {
      let y = b.y;
      for (; y > 0; y -= CELL * 0.5) if (cell(w.T, Math.floor(b.x / CELL), Math.floor(y / CELL)) === ROCK) break;
      carve(w.T, [1, b.x, b.y, b.x, y, 1.2]);
      ev(s, 'ray', { p: b.o, x0: b.x, y0: b.y, x1: b.x, y1: y, kind: 'vaca', r: 1.2 });
      for (const q of s.pl) {
        if (!q.alive || (p && !enemies(s, p, q)) || Math.abs(q.x - b.x) > 1.6 || q.y > b.y || q.y + height(q) < y) continue;
        hurt(s, w, q, { ...HIT.vaca, dx: Math.sign(q.x - b.x) * 0.25, dy: -1, by: b.o, stop: 1, src: 'vaca' });
      }
    } else if (b.k === 'meteo' && t === b.t0) {
      newProj(s, 'meteoro', b.o, b.x, b.y, 0, -40);
    } else if (b.k === 'roca' && t === b.t0) {
      newProj(s, 'roca', -1, b.x, b.y, 0, -22);
    }
  }
  s.beams = s.beams.filter(b => t < Math.max(b.t0, b.t1));
}

// Choques de cuerpo: el dash y la barrida golpean al tocar a un rival (una vez por movimiento), la picada suelta una
// onda al aterrizar y, si nadie ataca, los cuerpos se separan suave.
export function contacts(s: State, w: World) {
  const c = w.c, t = s.t;
  for (const p of s.pl) {
    if (!p.alive) continue;
    if (p.poundLand === t) {
      carve(w.T, [0, p.x, p.y - 0.2, 0.7]);
      ev(s, 'boom', { x: p.x, y: p.y, r: 1.8, kind: 'onda' });
      for (const q of s.pl) if (q.alive && enemies(s, p, q) && Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 1.4)
        hurt(s, w, q, { dmg: BODY.onda.dmg, kb: c.POUND_HIT, kg: BODY.onda.kg, dx: Math.sign(q.x - p.x) * 0.5, dy: 1, by: p.id, src: 'onda' });
    }
    const dsh = t - p.dashT < c.DASH_F, att = dsh || p.slide || p.pound;
    for (const q of s.pl) {
      if (q === p || !q.alive || !enemies(s, p, q)) continue;
      if (Math.abs(q.x - p.x) >= 2 * HW || q.y >= p.y + height(p) || p.y >= q.y + height(q)) continue;
      if (att && !p.hits.includes(q.id)) {
        p.hits.push(q.id);
        if (p.pound) hurt(s, w, q, { dmg: BODY.pound.dmg, kb: c.POUND_HIT, kg: BODY.pound.kg, dx: 0, dy: -1, by: p.id, src: 'pound' }); // pisotón: hacia abajo
        else if (p.slide) hurt(s, w, q, { dmg: BODY.slide.dmg, kb: c.SLIDE_HIT, kg: BODY.slide.kg, dx: Math.sign(p.vx) * 0.5, dy: 1, by: p.id, src: 'slide' });
        else {
          const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (hurt(s, w, q, { dmg: BODY.dash.dmg, kb: c.DASH_HIT + sp * 0.2, kg: BODY.dash.kg, dx: p.ddx, dy: p.ddy + 0.45, by: p.id, src: 'dash' })) p.vx *= 0.35, p.vy *= 0.35, p.stopT = t + 3;
        }
        continue;
      }
      if (!att && t >= p.stunT && t >= q.stunT && p.ground && q.ground) { // separarse suave
        const push = Math.sign(p.x - q.x || p.id - q.id) * 1.5 * DT;
        p.x += sweepX(w.T, p.x, p.y, HW, height(p), push);
      }
    }
  }
}

export { rnd, SUB };
