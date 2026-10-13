// Los dummies del patio y sus proyectiles (plan, paso 1.3): los de peso (liviano, mediano, pesado) solo reciben; el
// ATACANTE telegrafía en blanco (se devuelve: parry) o en rojo (no se devuelve: esquivar) y la TORRETA dispara
// proyectiles que se devuelven con el parry o se desvían con el dash; la VÁLVULA se poguea y se engancha.
// Los tiempos del atacante siguen los clips del Topo-barrena (render/models/topo.ts): el destello a 0,25 s, el golpe
// blanco activo entre 0,8 y 0,97 s, la embestida roja entre 0,83 y 1,2 s.
import { HZ, DT, HW, H, A, KINDS, ev, sizeOf, massOf, gravity, approach, zoneOf, type State, type World, type Dummy, type Pl, type Spawn } from './state.ts';
import { sweepX, sweepY, collide, overlap } from './collide.ts';
import { hurtHero, guardResult, guardPass, parried, hitFoe, alive, breakable, invulnerable } from './combat.ts';
import { rnd } from './rng.ts';

export const ATK_W = { on: 48, off: 58, len: 108, reach: 2.6 };   // cuadros desde el inicio del ataque
export const ATK_R = { on: 50, off: 72, len: 120, reach: 3.4 };
export const TUR = { fire: 26 };                                   // la torreta destella y dispara a los 26 cuadros
export const BULLET_R = 0.25;

export function freshDummy(f: Spawn): Dummy {
  const z = KINDS[f.kind];
  return { x: f.x, y: f.y, vx: 0, vy: 0, hp: z.hp || 1, ground: false, lz: false, hitT: -1e9, back: 0, stopT: -1e9, stunT: -1e9,
    face: f.face ?? -1, atk: 0, atkT: -1e9, atkHit: false, next: 60 + Math.round(f.x * 7) % 90, par: false };
}

// El héroe más cercano en la misma zona (o null)
function target(s: State, w: World, d: Dummy): Pl | null {
  const zd = zoneOf(w, d.x, d.y);
  let best: Pl | null = null, bd = Infinity;
  for (const p of s.pl) {
    if (zoneOf(w, p.x, p.y) !== zd) continue;
    const q = Math.abs(p.x - d.x) + Math.abs(p.y - d.y);
    if (q < bd) bd = q, best = p;
  }
  return best;
}

// La caja del golpe del atacante en el cuadro f de su ataque (o null)
export function atkBox(w: World, d: Dummy, k: number, f: number) {
  const z = sizeOf(w, k), A2 = d.atk === 2 ? ATK_R : ATK_W;
  if (!d.atk || f < A2.on || f >= A2.off) return null;
  const x0 = d.x + d.face * z.hw, x1 = d.x + d.face * (z.hw + A2.reach);
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: d.y, y1: d.y + 1.3 };
}

export function stepFoes(s: State, w: World) {
  const c = w.c, t = s.t, g = gravity(c);
  const hit = (d: Dummy, dv: number) => { if (dv > c.IMPACT_V && d.hp > 0) d.hp -= (dv - c.IMPACT_V) * c.IMPACT_DMG, d.hitT = t, d.lz = true; };
  for (let k = 0; k < s.d.length; k++) {
    const d = s.d[k], sp = w.dummies[k], z = KINDS[sp.kind];
    if (d.hp <= 0) {
      if (d.back === 0) d.back = t + Math.round(c.D_RESPAWN * HZ);
      else if (t >= d.back) { Object.assign(d, freshDummy(sp)); ev(s, 'respawn', { e: k }); }
      continue;
    }
    if (t < d.stopT) continue;
    const stun = t < d.stunT;
    // ATACANTE
    if (sp.kind === 'atacante') {
      const p = target(s, w, d);
      if (d.atk) {
        const f = t - d.atkT, A2 = d.atk === 2 ? ATK_R : ATK_W;
        if (stun || f >= A2.len) d.atk = 0, d.next = t + Math.round(c.ATK_EVERY * HZ);
        const box = atkBox(w, d, k, f);
        if (box && !d.atkHit) for (const q of s.pl) {
          if (!(q.x + HW > box.x0 && q.x - HW < box.x1 && q.y + H > box.y0 && q.y < box.y1)) continue;
          d.atkHit = true;
          const red = d.atk === 2, r = guardResult(w, s, q, d.x, red), dmg = red ? c.ATK_DMG_R : c.ATK_DMG;
          if (r === 'none') { d.atkHit = false; continue; }
          if (r === 'perfect') {
            d.stunT = t + Math.round(c.PARRY_STUN * HZ), d.atk = 0, d.stopT = t + c.PARRY_STOP, d.next = d.stunT + 30;
            d.vx = d.face * -4;
            parried(s, w, q, (q.x + d.x) / 2, q.y + 1.1, k, false);
          } else if (r === 'good' || r === 'guard') {
            const dm = dmg * guardPass(w, r);
            q.hp -= dm, q.vx = d.face * 4, q.stopT = t + c.HITSTOP_L, d.stopT = t + c.HITSTOP_L;
            ev(s, 'block', { x: (q.x + d.x) / 2, y: q.y + 1.1, good: r === 'good', dmg: Math.round(dm) });
          } else hurtHero(s, w, q, dmg, d.face, red ? 'barrena' : 'acometida');
        }
      } else if (p && !stun && t >= d.next && Math.abs(p.x - d.x) < c.ATK_RANGE && Math.abs(p.y - d.y) < 2.2 && d.ground) {
        d.face = p.x >= d.x ? 1 : -1;
        d.atk = rnd(s) < c.ATK_RED ? 2 : 1, d.atkT = t, d.atkHit = false;
        ev(s, 'tele', { e: k, red: d.atk === 2 });
      } else if (p && !stun && !d.atk) d.face = p.x >= d.x ? 1 : -1;
    }
    // TORRETA
    if (sp.kind === 'torreta') {
      const p = target(s, w, d);
      if (d.atk && t - d.atkT === TUR.fire) {
        d.atk = 0;
        if (p) {
          const ox = d.x + d.face * 0.6, oy = d.y + 0.7, vx = p.x - ox, vy = p.y + 1.0 - oy, n = Math.sqrt(vx * vx + vy * vy) || 1;
          s.b.push({ x: ox, y: oy, vx: vx / n * c.TUR_V, vy: vy / n * c.TUR_V, own: 0, dmg: c.TUR_DMG, t, dead: false });
          ev(s, 'shoot', { e: k, x: ox, y: oy });
        }
      } else if (!d.atk && p && !stun && t >= d.next && Math.abs(p.x - d.x) + Math.abs(p.y - d.y) < c.TUR_RANGE) {
        d.face = p.x >= d.x ? 1 : -1;
        d.atk = 1, d.atkT = t, d.next = t + Math.round(c.TUR_EVERY * HZ);
        ev(s, 'tele', { e: k, red: false });
      }
    }
    if (z.fixed) continue;
    // física: una gravedad, roce en el suelo, barrido; LANZADO se lastima al chocar
    if (d.ground) d.vx = approach(d.vx, 0, c.D_FRIC * DT);
    const vy0 = d.vy;
    d.vy -= g * DT;
    if (d.vy < -c.MAX_FALL) d.vy = -c.MAX_FALL;
    const wx = d.vx * DT, mx = sweepX(w, d.x, d.y, z.hw, z.h, wx);
    d.x += mx;
    if (mx !== wx) { if (d.lz) hit(d, Math.abs(d.vx)); d.vx = 0; }
    const wy = (vy0 + d.vy) * 0.5 * DT, my = sweepY(w, d.x, d.y, z.hw, z.h, wy);
    d.y += my;
    d.ground = wy < 0 && my !== wy;
    if (my !== wy) { if (d.lz) hit(d, Math.abs(d.vy)); d.vy = 0; }
    if (d.y < 0) d.hp = 0;
    if (d.lz && d.ground && d.vx * d.vx + d.vy * d.vy < c.IMPACT_V * c.IMPACT_V) d.lz = false;
    if (d.hp <= 0) ev(s, 'kill', { e: k, x: d.x, y: d.y + z.h / 2, src: 'choque' });
  }
}

// Proyectiles: los de la torreta lastiman al héroe (la guardia los devuelve o los para; el dash los desvía); los
// devueltos lastiman a los dummies
export function stepBullets(s: State, w: World) {
  const c = w.c, t = s.t;
  for (const b of s.b) {
    if (b.dead) continue;
    b.x += b.vx * DT, b.y += b.vy * DT;
    if (t - b.t > 4 * HZ || w.g[Math.floor(b.y / 0.5) * w.cols + Math.floor(b.x / 0.5)]) { b.dead = true; ev(s, 'bhit', { x: b.x, y: b.y }); continue; }
    if (b.own === 0) {
      for (const p of s.pl) {
        // el dash del Esgrimista los desvía (Katana Zero)
        if (p.act === A.DASH) {
          const cx = p.x, cy = p.y + H / 2;
          if ((b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy) <= (w.c.DASH_R + BULLET_R + 0.3) ** 2) { reflect(s, w, b, p, 1.2, 1); ev(s, 'deflect', { x: b.x, y: b.y }); break; }
        }
        if (!(b.x + BULLET_R > p.x - HW && b.x - BULLET_R < p.x + HW && b.y + BULLET_R > p.y && b.y - BULLET_R < p.y + H)) continue;
        const r = guardResult(w, s, p, b.x - b.vx, false);
        if (r === 'none') continue;
        if (r === 'perfect') { reflect(s, w, b, p, c.REFLECT_V, c.REFLECT_DMG); parried(s, w, p, b.x, b.y, -1, true); }
        else if (r === 'good' || r === 'guard') { const dm = b.dmg * guardPass(w, r); p.hp -= dm; b.dead = true; ev(s, 'block', { x: b.x, y: b.y, good: r === 'good', dmg: Math.round(dm) }); }
        else { hurtHero(s, w, p, b.dmg, Math.sign(b.vx) || 1, 'bala'); b.dead = true; }
        break;
      }
    } else {
      for (let k = 0; k < s.d.length; k++) {
        const d = s.d[k], z = sizeOf(w, k);
        if (!alive(s, k) || !breakable(w, k)) continue;
        if (!(b.x + BULLET_R > d.x - z.hw && b.x - BULLET_R < d.x + z.hw && b.y + BULLET_R > d.y && b.y - BULLET_R < d.y + z.h)) continue;
        const n = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
        hitFoe(s, w, s.pl[b.own - 1] ?? s.pl[0], k, b.dmg, b.vx / n * 8, b.vy / n * 8 + 2, c.HITSTOP_H, 'devuelto');
        b.dead = true;
        break;
      }
    }
  }
  s.b = s.b.filter(b => !b.dead);
}
// Devuelve un proyectil por donde vino (hacia quien lo tiró), más rápido y más dañino
function reflect(s: State, w: World, b: { x: number, y: number, vx: number, vy: number, own: number, dmg: number, t: number }, p: Pl, kv: number, kd: number) {
  b.vx = -b.vx * kv, b.vy = -b.vy * kv, b.own = p.id + 1, b.dmg *= kd, b.t = s.t;
  void w;
}

// Choques de cuerpo: el héroe con los dummies (el dash atraviesa a los que no son pesados; el atacante lastima al
// tocarlo) y los dummies entre sí (LANZADO lastima a los dos)
export function stepBodies(s: State, w: World) {
  const c = w.c, t = s.t;
  const hit = (d: Dummy, dv: number) => { if (dv > c.IMPACT_V && d.hp > 0) d.hp -= (dv - c.IMPACT_V) * c.IMPACT_DMG, d.hitT = t, d.lz = true; };
  const live = s.d.flatMap((d, k) => d.hp > 0 ? [k] : []);
  for (const p of s.pl) for (const k of live) {
    const d = s.d[k], sp = w.dummies[k], z = KINDS[sp.kind];
    const dashing = p.act === A.DASH && sp.kind !== 'pesado' && !z.fixed;
    if (dashing || d.par) { d.par = overlap(p, HW, H, d, z.hw, z.h); continue; }
    if (sp.kind === 'atacante' && t >= d.stunT && overlap(p, HW, H, d, z.hw, z.h) && !invulnerable(w, s, p))
      hurtHero(s, w, p, c.CONTACT_DMG, p.x >= d.x ? 1 : -1, 'contacto');
    const r = collide(w, p, HW, H, 1, d, z.hw, z.h, z.fixed ? 0 : 1 / massOf(w, k));
    if (!r) continue;
    if (r.vert && r.n < 0) p.ground = true;
    if (d.lz) hit(d, r.db);
  }
  for (const a of live) for (const b of live) {
    if (b <= a) continue;
    const A2 = s.d[a], B = s.d[b], sa = sizeOf(w, a), sb = sizeOf(w, b);
    if (sa.fixed && sb.fixed) continue;
    const lz = A2.lz || B.lz;
    const r = collide(w, A2, sa.hw, sa.h, sa.fixed ? 0 : 1 / massOf(w, a), B, sb.hw, sb.h, sb.fixed ? 0 : 1 / massOf(w, b));
    if (!r) continue;
    if (r.vert) (r.n < 0 ? A2 : B).ground = true;
    if (lz) { hit(A2, r.da); hit(B, r.db); }
  }
}
