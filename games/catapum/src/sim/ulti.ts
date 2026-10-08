// Ultis: un movimiento especial definitivo por personaje. Se cargan con daño hecho y recibido, trucos de movimiento
// y KOs; con la barra llena, ULTI. Mientras dura, el personaje no recibe golpes (salvo el maquinista que se bajó del
// tren) y la ulti manda su movimiento (ultiStep devuelve true).
import { CELL, carve, boxFree, sweepX, sweepY } from './terrain.ts';
import { charOf } from './chars.ts';
import { boom, hurt } from './combat.ts';
import { hookAim } from './move.ts';
import { HZ, DT, NEVER, HW, H, approach, gravity, ev, enemies, type State, type World, type Pl, type Input } from './state.ts';

const norm = (x: number, y: number): [number, number] => { const n = Math.sqrt(x * x + y * y); return n > 1e-9 ? [x / n, y / n] : [1, 0]; };
const mid = (p: Pl) => p.y + 0.55;
// Dirección pedida: la mira, si no el joystick, si no adelante
function want(p: Pl, i: Input): [number, number] | null {
  if (i.ax * i.ax + i.ay * i.ay > 0.02) return norm(i.ax, i.ay);
  if (i.x * i.x + i.y * i.y > 0.1) return norm(i.x, i.y);
  return null;
}

export const ULTI_T = { meteoro: 27 + 75, lazo: 32, cohete: 132, abduccion: 270, expreso: 400, sombra: 150 } as Record<string, number>;

export function startUlti(s: State, w: World, p: Pl, i: Input) {
  if (p.ulti < 100 || p.u || !p.alive || s.t < p.stunT || s.t < p.stopT) return;
  const k = charOf(p.ch).ulti, t = s.t;
  const [dx, dy] = want(p, i) ?? [p.face, 0];
  p.u = { k, t0: t, f: 0, ft: t, x: p.x, y: p.y, dx, dy, n: 0, ids: [] };
  if (k === 'lazo') {
    p.u.ids = s.pl.filter(q => q.alive && enemies(s, p, q) && !q.u && (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 15 * 15).map(q => q.id);
    if (!p.u.ids.length) { p.u = null; ev(s, 'fizzle', { p: p.id }); return; } // nadie cerca: no se gasta
  }
  if (k === 'expreso') p.u.dx = p.face, p.u.x = p.x + p.face, p.u.y = p.y;
  if (k === 'meteoro') { // apunta solo al rival más cercano (después se corre con el joystick)
    let best = Infinity;
    for (const q of s.pl) if (q.alive && enemies(s, p, q) && Math.abs(q.x - p.x) < best) best = Math.abs(q.x - p.x), p.u.x = q.x;
  }
  p.ulti = 0, p.hook = null, p.slide = false, p.pound = false, p.dashT = NEVER, p.atk = null, p.cloudT = NEVER;
  ev(s, 'ulti', { p: p.id, u: k });
}

export function ultiStep(s: State, w: World, p: Pl, i: Input, press: boolean): boolean {
  const u = p.u;
  if (!u) return false;
  const t = s.t, f = t - u.ft, T = w.T, m = w.m;
  const end = () => { p.u = null, p.invT = Math.max(p.invT, t + 20), p.stunT = NEVER, p.air = charOf(p.ch).airJumps, p.dashN = charOf(p.ch).dashN; };
  switch (u.k) {
    case 'meteoro': {
      if (u.f === 0) { // sube
        p.vx = 0, p.vy = 40, p.y += p.vy * DT;
        if (f >= 27) u.f = 1, u.ft = t, p.y = m.h + 6;
      } else if (u.f === 1) { // elegir dónde caer (joystick; cualquier botón suelta)
        p.vx = p.vy = 0, p.y = m.h + 6;
        u.x = Math.max(1, Math.min(m.w - 1, u.x + i.x * 26 * DT));
        if (f >= 75 || (press && f > 8)) u.f = 2, u.ft = t, p.x = u.x, p.vy = -48;
      } else { // cae
        p.vx = 0, p.vy = -48;
        const d = sweepY(T, p.x, p.y, HW, H, p.vy * DT);
        p.y += d;
        if (d !== p.vy * DT || p.y < m.water + 1.5) {
          boom(s, w, p.x, p.y + 0.3, { r: 5, dmg: 24, kb: 15, kg: 18, carve: 4.5 }, p.id, 'meteoro');
          end(), p.vy = 16, p.ground = false;
        }
      }
      return true;
    }
    case 'lazo': {
      p.vx *= 0.85, p.vy *= 0.85;
      for (const id of u.ids) {
        const q = s.pl[id];
        if (!q.alive) continue;
        const [dx, dy] = norm(p.x - q.x, mid(p) - mid(q)), d = Math.sqrt((p.x - q.x) ** 2 + (mid(p) - mid(q)) ** 2);
        const v = Math.min(30, d * 7);
        q.vx = dx * v, q.vy = dy * v, q.stunT = t + 3, q.lastBy = p.id, q.lastT = t, q.hook = null;
        q.x += sweepX(T, q.x, q.y, HW, H, q.vx * DT), q.y += sweepY(T, q.x, q.y, HW, H, q.vy * DT);
      }
      if (f >= 30) {
        for (const id of u.ids) {
          const q = s.pl[id];
          if (q.alive) hurt(s, w, q, { dmg: 10, kb: 22, kg: 12, dx: q.x < m.w / 2 ? -1 : 1, dy: 0.65, by: p.id });
        }
        ev(s, 'boom', { x: p.x, y: mid(p), r: 3, kind: 'lazo' });
        end();
      }
      return true;
    }
    case 'cohete': {
      const wd = want(p, i);
      if (wd) { // gira hacia lo pedido, como mucho 5 rad/s
        const cr = u.dx * wd[1] - u.dy * wd[0], dot = u.dx * wd[0] + u.dy * wd[1], a = Math.max(-5 * DT, Math.min(5 * DT, Math.atan2(cr, dot)));
        const ca = Math.cos(a), sa = Math.sin(a);
        [u.dx, u.dy] = [u.dx * ca - u.dy * sa, u.dx * sa + u.dy * ca];
      }
      if (p.y < m.water + 1.5) u.dy = Math.abs(u.dy);
      if (p.y > m.h + 6) u.dy = -Math.abs(u.dy);
      if (p.x < -5) u.dx = Math.abs(u.dx);
      if (p.x > m.w + 5) u.dx = -Math.abs(u.dx);
      p.vx = u.dx * 27, p.vy = u.dy * 27, p.x += p.vx * DT, p.y += p.vy * DT, p.face = u.dx >= 0 ? 1 : -1;
      if (f % 2 === 0) carve(T, [0, p.x, mid(p), 1.15]);
      for (const q of s.pl) if (q.alive && enemies(s, p, q) && !u.ids.includes(q.id) && Math.abs(q.x - p.x) < 1.4 && Math.abs(mid(q) - mid(p)) < 1.5) {
        u.ids.push(q.id);
        hurt(s, w, q, { dmg: 12, kb: 16, kg: 14, dx: u.dx, dy: u.dy + 0.4, by: p.id });
      }
      if (f >= 132 || (press && f > 20)) {
        boom(s, w, p.x, mid(p), { r: 3, dmg: 12, kb: 12, kg: 14, carve: 2.5 }, p.id, 'grande');
        carve(T, [0, p.x, mid(p), 1.3]);
        p.vx = u.dx * 10, p.vy = u.dy * 10 + 4;
        end();
      }
      return true;
    }
    case 'abduccion': {
      p.vx = approach(p.vx, i.x * 13, 60 * DT), p.vy = approach(p.vy, i.y * 13, 60 * DT);
      const dx = sweepX(T, p.x, p.y, HW, H, p.vx * DT);
      p.x += dx;
      if (dx !== p.vx * DT) p.vx = 0;
      const dy = sweepY(T, p.x, p.y, HW, H, p.vy * DT);
      p.y += dy;
      if (dy !== p.vy * DT) p.vy = 0;
      p.x = Math.max(-8, Math.min(m.w + 8, p.x)), p.y = Math.max(m.water + 2, Math.min(m.h + 7, p.y));
      if (p.vx) p.face = p.vx > 0 ? 1 : -1;
      for (const q of s.pl) { // el rayo tractor: un cono hacia abajo
        if (!q.alive || !enemies(s, p, q) || q.u || u.ids.includes(q.id)) continue;
        const below = p.y - q.y;
        if (below > 0 && below < 7.5 && Math.abs(q.x - p.x) < 1.2 + below * 0.3) u.ids.push(q.id), ev(s, 'grab', { p: q.id });
      }
      for (const id of u.ids) {
        const q = s.pl[id];
        if (!q.alive) continue;
        const tx = p.x, ty = p.y - 2.3;
        q.vx = p.vx + (tx - q.x) * 8, q.vy = p.vy + (ty - q.y) * 8;
        q.x += sweepX(T, q.x, q.y, HW, H, q.vx * DT), q.y += sweepY(T, q.x, q.y, HW, H, q.vy * DT);
        q.stunT = t + 3, q.lastBy = p.id, q.lastT = t, q.hook = null, q.ground = false;
      }
      if (f >= 270 || (press && f > 30)) {
        for (const id of u.ids) {
          const q = s.pl[id];
          if (q.alive) hurt(s, w, q, { dmg: 8, kb: 8 + Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.9, kg: 10, dx: p.vx * 0.1, dy: -0.6 + p.vy * 0.05, by: p.id });
        }
        end(), p.vy = 6;
      }
      return true;
    }
    case 'expreso': {
      // u.x = el frente del tren, u.y = su piso, u.dx = el sentido; u.n = 1 si el maquinista ya se bajó
      const L = 12, v = 30, dir = u.dx >= 0 ? 1 : -1;
      u.x += dir * v * DT;
      carve(T, [1, u.x, u.y + 1.3, u.x - dir * 1.2, u.y + 1.3, 1.45]);
      for (const q of s.pl) {
        if (!q.alive || q.id === p.id || !enemies(s, p, q) || u.ids.includes(q.id)) continue;
        const x0 = Math.min(u.x, u.x - dir * L), x1 = Math.max(u.x, u.x - dir * L);
        if (q.x + HW > x0 && q.x - HW < x1 && q.y < u.y + 2.6 && q.y + H > u.y) {
          u.ids.push(q.id);
          hurt(s, w, q, { dmg: 18, kb: 20, kg: 16, dx: dir, dy: 0.45, by: p.id });
        }
      }
      const gone = dir > 0 ? u.x - L > m.w + 14 : u.x + L < -14;
      if (u.n === 0) { // arriba del tren, al frente
        p.x = u.x - dir * 0.9, p.y = u.y + 2.6, p.vx = dir * v, p.vy = 0, p.face = dir;
        const edge = dir > 0 ? p.x > m.w - 3 : p.x < 3;
        if (press || (i.jump && f > 10) || edge) {
          u.n = 1, p.vy = edge ? 17 : 2 * w.c.JUMP_H / w.c.JUMP_T, p.vx = edge ? -dir * 4 : dir * 12;
          p.invT = t + 20, p.ground = false, p.held = true, p.pressT = NEVER;
          ev(s, 'jump', { p: p.id, j: 0 });
        }
        if (gone) p.u = null;
        return true;
      }
      if (gone || f >= 400) p.u = null;
      return false; // se bajó: se mueve normal mientras el tren sigue
    }
    case 'sombra': {
      const slash = () => {
        const [dx, dy] = want(p, i) ?? hookAim(p, i);
        let d = 9;
        for (; d > 0; d -= CELL) if (boxFree(T, p.x + dx * d, p.y + dy * d, HW, H) && p.y + dy * d > m.water + 0.6) break;
        const x0 = p.x, y0 = mid(p), x1 = p.x + dx * d, y1 = p.y + dy * d + 0.55;
        for (const q of s.pl) {
          if (!q.alive || !enemies(s, p, q)) continue;
          const vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1;
          const k = Math.max(0, Math.min(1, ((q.x - x0) * vx + (mid(q) - y0) * vy) / L2));
          const ex = q.x - x0 - vx * k, ey = mid(q) - y0 - vy * k;
          if (ex * ex + ey * ey < 1.1 * 1.1) hurt(s, w, q, { dmg: 11, kb: 13, kg: 15, dx, dy: dy + 0.5, by: p.id, stop: 6 });
        }
        ev(s, 'slash', { p: p.id, x0, y0, x1, y1 });
        p.x = x1, p.y = y1 - 0.55, p.vx = dx * 6, p.vy = Math.max(dy * 6, 2), p.face = dx >= 0 ? 1 : -1;
        u.n++, u.ft = t;
      };
      if (u.n === 0 || (press && f > 6) || f >= 40) slash();
      else {
        p.vy -= gravity(w.c) * 0.2 * DT;
        p.x += sweepX(T, p.x, p.y, HW, H, p.vx * DT);
        const dy = sweepY(T, p.x, p.y, HW, H, p.vy * DT);
        p.y += dy;
        if (dy !== p.vy * DT) p.vy = 0;
      }
      if (u.n >= 3 && t - u.ft >= 12) end();
      return true;
    }
  }
  p.u = null;
  return false;
}

export { HZ };
