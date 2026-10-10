// El pleito (puro). La mascota que tiraste al vacío vuelve enojada y te embiste. Cada embestida se avisa (se agacha y
// tiembla mientras una franja roja en el piso marca por dónde va a pasar) y sale derecha y rápida: si te pega, te empuja;
// si la esquivás (corriéndote o, a las que caminan, saltándolas), se pasa de largo, se da contra el piso y queda mareada,
// y ahí una caricia la calma un poco. Atajarla justo cuando llega (apuntándole y apretando) también la calma. Calmada del
// todo, hacen las paces; si te pega HITS veces, gana ella (y se ofende un rato); si se alarga mucho, se cansa.
// Las que caminan no pisan el vacío (frenan en el borde); las que vuelan te embisten a la altura del pecho.
export const BR = {
  ANGER: 3, HITS: 3,      // caricias para calmarla; golpes que aguantás
  ENTER: 1.4,             // s del regreso (gruñe antes de la primera embestida)
  CHASE_V: 4.4, RUN_V: 7, // se acerca (corre si estás lejos)
  NEAR: 3.6, MIN: 1.8, FAR: 5.6, // a esa distancia se pone a embestir
  WIND: 0.85, LOCK: 0.22, LEAD: 0.15, // aviso; los últimos LOCK s ya no corrige; cuánto se adelanta a tu movimiento (s)
  LUNGE_V: 12, OVER: 2.6, // embestida: velocidad y cuánto se pasa de largo
  HIT_R: 0.42,            // + su radio: distancia del golpe
  DAZE: 2.4, RECOIL: 0.7, COOL: 0.9, CALM_COOL: 1.4,
  PARRY_D: 2.6,           // atajarla: así de cerca
  STUCK: 2.5,             // sin poder acercarse (vacío en el medio), salta hasta vos
  MAX_T: 34,
  PLAYER_H: 1.75, CHEST: 1.15,
};
export type Phase = 'enter' | 'chase' | 'windup' | 'lunge' | 'recoil' | 'daze' | 'won' | 'lost' | 'tired';
export type Brawl = {
  phase: Phase, t: number, time: number, x: number, y: number, z: number, fly: boolean, r: number,
  dx: number, dy: number, dz: number, run: number, len: number, // embestida: dirección (unitaria), recorrido y largo
  y0: number,                                                     // altura de salida (las que vuelan)
  anger: number, hits: number, cool: number, stuck: number,
};
export type BrawlEnv = {
  px: number, py: number, pz: number, pvx: number, pvz: number,
  ground: (x: number, z: number) => number, // altura del piso o de la flecha (las que caminan van por encima)
  land: (x: number, z: number) => boolean,  // hay piso (las que caminan no se meten en el vacío)
};
export type BrawlEv = { k: 'windup' | 'lunge' | 'hit' | 'miss' | 'calm' | 'parry' | 'growl' | 'won' | 'lost' | 'tired' | 'blink', dx?: number, dz?: number };
export const isOver = (b: Brawl) => b.phase === 'won' || b.phase === 'lost' || b.phase === 'tired';

// y: altura del centro (las que caminan, piso + r)
export const newBrawl = (x: number, y: number, z: number, fly: boolean, r: number): Brawl =>
  ({ phase: 'enter', t: 0, time: 0, x, y, z, fly, r, dx: 0, dy: 0, dz: 1, run: 0, len: 0, y0: y, anger: BR.ANGER, hits: 0, cool: 0, stuck: 0 });

const go = (b: Brawl, p: Phase) => { b.phase = p, b.t = 0; };
const restY = (b: Brawl, e: BrawlEnv, x: number, z: number) => b.fly ? e.py + BR.CHEST + 0.25 : e.ground(x, z) + b.r;

// ¿Le pega al jugador? (cilindro de los pies a PLAYER_H)
export function touches(b: Brawl, e: BrawlEnv): boolean {
  if (Math.hypot(b.x - e.px, b.z - e.pz) > BR.HIT_R + b.r) return false;
  return b.y + b.r > e.py && b.y - b.r < e.py + BR.PLAYER_H;
}

export function stepBrawl(b: Brawl, dt: number, e: BrawlEnv): BrawlEv[] {
  const out: BrawlEv[] = [];
  if (isOver(b)) return out;
  b.time += dt, b.t += dt, b.cool -= dt;
  const ox = e.px - b.x, oz = e.pz - b.z, d = Math.hypot(ox, oz);
  if (b.time > BR.MAX_T && (b.phase === 'chase' || b.phase === 'recoil' || b.phase === 'daze')) { go(b, 'tired'); out.push({ k: 'tired' }); return out; }
  const settle = (k: number) => { b.y += (restY(b, e, b.x, b.z) - b.y) * Math.min(1, dt * k); };
  // se mueve en planta sin meterse en el vacío (las que caminan); devuelve si pudo
  const move = (vx: number, vz: number) => {
    const nx = b.x + vx * dt, nz = b.z + vz * dt;
    if (!b.fly && !e.land(nx, nz)) return false;
    b.x = nx, b.z = nz;
    return true;
  };
  if (b.phase === 'enter') {
    settle(6);
    if (b.t >= BR.ENTER) go(b, 'chase'), b.cool = 0.3;
  } else if (b.phase === 'chase') {
    // se acerca hasta NEAR (de frente, corriéndose un poco de costado para no ser tan obvia)
    if (d > 0.01) {
      const want = d - BR.NEAR, sp = d > 8 ? BR.RUN_V : BR.CHASE_V, k = Math.max(-1, Math.min(1, want / 1.2)), sx = Math.sin(b.time * 1.3) * 0.35;
      const ok = Math.abs(want) < 0.15 || move((ox / d * k - oz / d * sx) * sp, (oz / d * k + ox / d * sx) * sp);
      b.stuck = ok ? 0 : b.stuck + dt;
    }
    settle(b.fly ? 4 : 14);
    if (b.stuck > BR.STUCK) { if (blink(b, e)) out.push({ k: 'blink' }); return out; }
    if (b.cool <= 0 && d >= BR.MIN && d <= BR.FAR) { go(b, 'windup'); out.push({ k: 'windup' }); aim(b, e); }
  } else if (b.phase === 'windup') {
    if (b.t < BR.WIND - BR.LOCK) aim(b, e);
    settle(b.fly ? 4 : 14);
    if (b.t >= BR.WIND) { go(b, 'lunge'); b.run = 0, b.y0 = b.y; out.push({ k: 'lunge', dx: b.dx, dz: b.dz }); }
  } else if (b.phase === 'lunge') {
    const h = Math.hypot(b.dx, b.dz) || 1, ok = move(b.dx * BR.LUNGE_V, b.dz * BR.LUNGE_V);
    b.run += BR.LUNGE_V * dt;
    const u = Math.min(1, b.run / b.len);
    if (b.fly) b.y = b.y0 + b.dy * b.run;
    else b.y = e.ground(b.x, b.z) + b.r + Math.sin(u * Math.PI) * 0.2; // un saltito bajo: se la puede saltar
    if (touches(b, e)) {
      b.hits++;
      out.push({ k: 'hit', dx: b.dx / h, dz: b.dz / h });
      if (b.hits >= BR.HITS) { go(b, 'lost'); out.push({ k: 'lost' }); } else go(b, 'recoil');
    } else if (!ok || b.run >= b.len) { go(b, 'daze'); out.push({ k: 'miss' }); }
  } else if (b.phase === 'recoil') {
    // rebota hacia atrás después de pegar
    const k = Math.max(0, 1 - b.t / BR.RECOIL), h = Math.hypot(b.dx, b.dz) || 1;
    move(-b.dx / h * 4 * k, -b.dz / h * 4 * k);
    settle(8);
    if (b.t >= BR.RECOIL) go(b, 'chase'), b.cool = BR.COOL;
  } else if (b.phase === 'daze') {
    if (b.fly) b.y += (e.ground(b.x, b.z) + b.r - b.y) * Math.min(1, dt * 6); // las que vuelan caen al piso, mareadas
    else settle(14);
    if (b.t >= BR.DAZE) go(b, 'chase'), b.cool = 0.5;
  }
  return out;
}

// Apunta la embestida (adelantándose un poco a tu movimiento): sale derecha hasta pasarse OVER m de largo
function aim(b: Brawl, e: BrawlEnv) {
  const tx = e.px + e.pvx * BR.LEAD, tz = e.pz + e.pvz * BR.LEAD, ty = b.fly ? e.py + BR.CHEST : b.y;
  const dx = tx - b.x, dz = tz - b.z, dy = ty - b.y, h = Math.hypot(dx, dz) || 1e-6, l = Math.hypot(dx, dy, dz) || 1e-6;
  // las que caminan: dirección en planta; las que vuelan: en 3D (dy por metro recorrido)
  if (b.fly) b.dx = dx / l, b.dz = dz / l, b.dy = dy / l; else b.dx = dx / h, b.dz = dz / h, b.dy = 0;
  b.len = (b.fly ? l : h) + BR.OVER;
}

// Sin poder llegar (hay vacío en el medio): aparece de un salto cerca tuyo
function blink(b: Brawl, e: BrawlEnv): boolean {
  b.stuck = 0;
  for (const r of [BR.NEAR, 2.4]) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + Math.atan2(b.x - e.px, b.z - e.pz), x = e.px + Math.sin(a) * r, z = e.pz + Math.cos(a) * r;
    if (b.fly || e.land(x, z)) { b.x = x, b.z = z, b.y = restY(b, e, x, z), b.cool = 0.8; return true; }
  }
  return false;
}

// Una caricia: mareada, la calma (y con la última, hacen las paces); si no, gruñe
export function calm(b: Brawl): BrawlEv[] {
  if (isOver(b)) return [];
  if (b.phase !== 'daze') return [{ k: 'growl' }];
  b.anger--;
  if (b.anger <= 0) { go(b, 'won'); return [{ k: 'calm' }, { k: 'won' }]; }
  go(b, 'chase'), b.cool = BR.CALM_COOL;
  return [{ k: 'calm' }];
}

// Atajarla en plena embestida (apretando cuando llega): cuenta como una caricia y la deja mareada a tus pies
export function parry(b: Brawl, e: BrawlEnv): BrawlEv[] {
  if (b.phase !== 'lunge' || Math.hypot(b.x - e.px, b.z - e.pz) > BR.PARRY_D) return [];
  b.anger--;
  const d = Math.hypot(b.x - e.px, b.z - e.pz) || 1;
  if (d < 1.1) { b.x = e.px + (b.x - e.px) / d * 1.1, b.z = e.pz + (b.z - e.pz) / d * 1.1; }
  if (b.anger <= 0) { go(b, 'won'); return [{ k: 'parry' }, { k: 'won' }]; }
  go(b, 'daze');
  return [{ k: 'parry' }];
}
