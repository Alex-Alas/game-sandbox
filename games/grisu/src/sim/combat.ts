// Combate (GDD §8): daño con el multiplicador del combo, hitstop por entidad (el golpeado se congela; apto para co-op),
// LANZADO (lo empujado fuerte daña a lo que choca), golpes al héroe con su invulnerabilidad, y la guardia del
// Esgrimista contra un ataque: parry perfecto en los primeros PARRY_PERFECT cuadros, bueno en los PARRY_GOOD
// siguientes y, después, la guardia que bloquea de frente. Lo rojo no se devuelve ni se bloquea.
import { HZ, A, KINDS, ev, massOf, sizeOf, type State, type World, type Pl, type Dummy } from './state.ts';

export const alive = (s: State, k: number) => s.d[k].hp > 0;
export const breakable = (w: World, k: number) => KINDS[w.dummies[k].kind].hp > 0;
export const stunned = (s: State, d: Dummy) => s.t < d.stunT;

// Multiplicador de daño por combo (× (1 + COMBO_DMG por golpe), con tope)
export const comboMul = (w: World, p: Pl) => Math.min(w.c.COMBO_MAX, 1 + w.c.COMBO_DMG * p.combo);

// Un golpe del héroe p al dummy k: daño (con combo y aturdido), empuje (kx, ky) en m/s dividido por la masa (nunca más
// que el empuje), LANZADO y hitstop del golpeado. Devuelve true si lo rompió.
export function hitFoe(s: State, w: World, p: Pl, k: number, dmg: number, kx: number, ky: number, stop: number, src: string): boolean {
  const c = w.c, d = s.d[k], t = s.t, z = sizeOf(w, k);
  if (!breakable(w, k) || d.hp <= 0) return false;
  const mul = comboMul(w, p) * (t < d.stunT ? c.STUN_MUL : 1);
  const dm = dmg * mul;
  d.hp -= dm;
  const im = Math.min(1, 1 / massOf(w, k));
  if (!z.fixed) d.vx += kx * im, d.vy += ky * im, d.lz = (kx * kx + ky * ky) * im * im > c.IMPACT_V * c.IMPACT_V * 0.25 || d.lz, d.ground = d.ground && ky <= 0;
  d.hitT = t, d.stopT = t + stop;
  p.combo++, p.comboT = t, p.comboMax = Math.max(p.comboMax, p.combo), p.foe = k, p.dmgDealt += dm;
  const kill = d.hp <= 0;
  ev(s, 'hit', { e: k, dmg: Math.round(dm), x: d.x, y: d.y + z.h / 2, src, heavy: stop >= c.HITSTOP_H, crit: t < d.stunT, kill });
  if (kill) { p.kills++; d.atk = 0; ev(s, 'kill', { e: k, x: d.x, y: d.y + z.h / 2, src }); }
  return kill;
}

// El héroe recibe daño (salvo invulnerable): pierde el combo, queda invulnerable HURT_INV y aturdido HURT_STUN, y lo
// empuja hacia kx. Suelta la liga y corta lo que estaba haciendo.
export function hurtHero(s: State, w: World, p: Pl, dmg: number, kx: number, src: string): boolean {
  const c = w.c, t = s.t;
  if (t < p.invT || dmg <= 0) return false;
  p.hp -= dmg;
  p.combo = 0;
  p.invT = t + Math.round(c.HURT_INV * HZ), p.stunT = t + Math.round(c.HURT_STUN * HZ), p.hurtT = t;
  p.vx = kx * 7, p.vy = Math.max(p.vy, 5), p.ground = false;
  p.act = A.NONE, p.hook = null;
  p.stopT = t + c.HITSTOP_L;
  ev(s, 'hurt', { dmg: Math.round(dmg), x: p.x, y: p.y + 0.9, src });
  return true;
}

// ¿Está invulnerable? (dash en sus primeros cuadros, rebote del pogo, recién golpeado)
export function invulnerable(w: World, s: State, p: Pl) {
  if (s.t < p.invT) return true;
  return p.act === A.DASH && s.t - p.actT < w.c.DASH_INV;
}

// Un ataque que llega al héroe desde x (red = no se devuelve). Resuelve la guardia: 'perfect' | 'good' | 'guard' | 'hit'
// | 'none' (no llegó: invulnerable). El llamador aplica lo que corresponde (aturdir al atacante, devolver un proyectil).
export function guardResult(w: World, s: State, p: Pl, fromX: number, red: boolean): 'perfect' | 'good' | 'guard' | 'hit' | 'none' {
  if (invulnerable(w, s, p)) return 'none';
  if (red || p.act !== A.GUARD) return 'hit';
  const front = (fromX - p.x) * p.face >= -0.2;
  if (!front) return 'hit';
  const f = s.t - p.actT, c = w.c;
  if (f < c.PARRY_PERFECT) return 'perfect';
  if (f < c.PARRY_PERFECT + c.PARRY_GOOD) return 'good';
  return 'guard';
}

// Lo que cuesta cada resultado de la guardia (fracción del daño que pasa)
export function guardPass(w: World, r: string) { return r === 'good' ? 1 - w.c.GOOD_BLOCK : r === 'guard' ? 1 - w.c.GUARD_BLOCK : 1; }

// Parry perfecto: hitstop a los dos, devuelve una carga, cámara lenta (visual) y la guardia queda «buena»
export function parried(s: State, w: World, p: Pl, x: number, y: number, e: number, proj: boolean) {
  const c = w.c, t = s.t;
  p.parried = true;
  p.charge = Math.min(c.DASH_N, p.charge + 1);
  p.stopT = t + c.PARRY_STOP;
  p.combo++, p.comboT = t, p.comboMax = Math.max(p.comboMax, p.combo);
  ev(s, 'parry', { x, y, e, proj });
}

