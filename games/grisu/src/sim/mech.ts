// Las mecánicas de F1 (GDD §6–§7):
//  ESGRIMISTA  deslizar = DASH-CORTE (5,5 m en 9 cuadros, invulnerable al empezar, cápsula de golpe, imán a enemigos,
//              2 cargas que se recargan en el suelo; matar devuelve una; desvía los proyectiles que toca)
//              mantener = GUARDIA (bloquea de frente; un golpe en sus primeros cuadros es parry perfecto)
//  ESTIBADOR   deslizar = MARTILLAZO en esa dirección (lento, empuja fuerte, se lanza 2 m); ↓ en el aire = PICADA-ANCLA
//              (pogo: rebota en lo que pega, recupera los saltos y una carga; contra el suelo, aterrizaje pesado con onda)
//              mantener = ANCLA: la liga de HYPERFLOWGEON al punto mantenido (una fuerza central que solo tira, con
//              tope; contra un dummy se reparte por masa). Un toque enganchado suelta con impulso hacia arriba.
import { HZ, DT, HW, H, HAND, A, ev, sizeOf, massOf, gravity, zoneOf, type State, type World, type Pl, type Hook } from './state.ts';
import { raycast, rayBox, capsuleBox, circleBox } from './collide.ts';
import { hitFoe, alive, breakable } from './combat.ts';

// Las 16 direcciones (cada 22,5° desde la derecha, antihorario)
const C1 = 0.9238795325112867, S1 = 0.3826834323650898, R2 = 0.7071067811865476;
export const DIRS16 = [0, 1, 2, 3].flatMap(q => [[1, 0], [C1, S1], [R2, R2], [S1, C1]].map(([x, y]) =>
  q === 0 ? [x, y] : q === 1 ? [-y, x] : q === 2 ? [-x, -y] : [y, -x]));
export function dir16(x: number, y: number): [number, number] {
  let best = DIRS16[0], dot = -2;
  for (const d of DIRS16) if (d[0] * x + d[1] * y > dot) dot = d[0] * x + d[1] * y, best = d;
  return [best[0], best[1]];
}
// La dirección de una acción: la del deslizar (16 sectores con DIR16) o, sin dirección, adelante
export function aimOf(w: World, p: Pl, ax: number, ay: number): [number, number] {
  const n = Math.sqrt(ax * ax + ay * ay);
  if (n < 1e-6) return [p.face, 0];
  return w.c.DIR16 > 0.5 ? dir16(ax, ay) : [ax / n, ay / n];
}
const center = (p: Pl) => p.y + H / 2;

// Imán del dash: un enemigo a menos de MAG_R m dentro de ±MAG_DEG° de la dirección; gana el más alineado
export function magnet(s: State, w: World, p: Pl, dx: number, dy: number): [number, number] {
  const c = w.c, cs = Math.cos(c.MAG_DEG * Math.PI / 180), zp = zoneOf(w, p.x, p.y);
  let best: [number, number] = [dx, dy], bc = cs;
  s.d.forEach((d, k) => {
    if (!alive(s, k) || !breakable(w, k) || zoneOf(w, d.x, d.y) !== zp) return;
    const z = sizeOf(w, k), vx = d.x - p.x, vy = d.y + z.h / 2 - center(p), n = Math.sqrt(vx * vx + vy * vy);
    if (n < 0.4 || n > c.MAG_R) return;
    const q = (vx * dx + vy * dy) / n;
    if (q > bc) bc = q, best = [vx / n, vy / n];
  });
  return best;
}

// ---------------------------------------------------------------- ESGRIMISTA
export function startDash(s: State, w: World, p: Pl) {
  let [dx, dy] = aimOf(w, p, p.dax, p.day);
  [dx, dy] = magnet(s, w, p, dx, dy);
  p.act = A.DASH, p.actT = s.t, p.ax = dx, p.ay = dy, p.hits = [];
  p.charge -= 1, p.dirT = -1e9;
  if (Math.abs(dx) > 0.2) p.face = dx > 0 ? 1 : -1;
  ev(s, 'dash', { dx, dy, x: p.x, y: center(p) });
}
export const dashSpeed = (w: World) => w.c.DASH_D / (w.c.DASH_F / HZ);
// El corte: la cápsula del centro de antes al de ahora. Atraviesa a los livianos y medianos; el pesado lo frena.
export function dashHits(s: State, w: World, p: Pl, x0: number, y0: number) {
  const c = w.c;
  for (let k = 0; k < s.d.length; k++) {
    const d = s.d[k], z = sizeOf(w, k);
    if (!alive(s, k) || !breakable(w, k) || p.hits.includes(k)) continue;
    if (!capsuleBox(x0, y0 + H / 2, p.x, center(p), c.DASH_R, d.x - z.hw, d.y, d.x + z.hw, d.y + z.h)) continue;
    p.hits.push(k);
    const kill = hitFoe(s, w, p, k, c.DASH_DMG, p.ax * c.DASH_KB, p.ay * c.DASH_KB + 2, c.HITSTOP_L, 'dash');
    if (kill) p.charge = Math.min(c.DASH_N, p.charge + 1);
    if (w.dummies[k].kind === 'pesado' && !kill) {
      p.vx = -p.ax * 4, p.vy = 3, p.act = A.NONE;   // contra el pesado se frena y rebota
      ev(s, 'clank', { x: p.x + p.face * 0.5, y: center(p) });
      return;
    }
  }
}

export function startGuard(s: State, p: Pl) {
  p.act = A.GUARD, p.actT = s.t, p.parried = false, p.holdT = -1e9;
  ev(s, 'guard', { x: p.x, y: p.y });
}
export function endGuard(s: State, w: World, p: Pl) {
  if (!p.parried) p.lagT = s.t + Math.round(w.c.PARRY_LAG * HZ);
  p.act = A.NONE;
  ev(s, 'guardEnd', { miss: !p.parried });
}

// ---------------------------------------------------------------- ESTIBADOR
export function startDive(s: State, w: World, p: Pl) {
  p.act = A.DIVE, p.actT = s.t, p.hits = [], p.dirT = -1e9;
  p.vy = -w.c.POGO_V, p.vx *= 0.5;
  ev(s, 'dive', { x: p.x, y: p.y });
}
// La caja de golpe de la picada: bajo los pies
export const diveBox = (p: Pl) => ({ x0: p.x - HW - 0.15, y0: p.y - 0.6, x1: p.x + HW + 0.15, y1: p.y + 0.35 });
// ¿Pegó en algo pogueable? Rebota: sube POGO_H, recupera los saltos en el aire y una carga, invulnerable POGO_INV
export function diveContact(s: State, w: World, p: Pl): boolean {
  const c = w.c, b = diveBox(p);
  for (let k = 0; k < s.d.length; k++) {
    const d = s.d[k], z = sizeOf(w, k);
    if (!alive(s, k) || p.hits.includes(k)) continue;
    if (!(b.x1 > d.x - z.hw && b.x0 < d.x + z.hw && b.y1 > d.y && b.y0 < d.y + z.h)) continue;
    p.hits.push(k);
    if (breakable(w, k)) hitFoe(s, w, p, k, c.POGO_DMG, 0, -8, c.HITSTOP_L, 'pogo');
    else p.combo++, p.comboT = s.t, p.comboMax = Math.max(p.comboMax, p.combo);
    bounce(s, w, p, d.x, d.y + z.h, k);
    return true;
  }
  return false;
}
function bounce(s: State, w: World, p: Pl, x: number, y: number, e: number) {
  const c = w.c;
  p.vy = Math.sqrt(2 * gravity(c) * c.POGO_H), p.air = c.AIR_JUMPS, p.act = A.NONE;
  p.charge = Math.min(c.HOOK_N, p.charge + 1);
  p.invT = Math.max(p.invT, s.t + c.POGO_INV);
  p.stopT = s.t + 2;
  ev(s, 'pogo', { x, y, e });
}
// Contra el suelo sin pegarle a nada: aterrizaje pesado con una onda chica que empuja
export function slam(s: State, w: World, p: Pl) {
  const c = w.c;
  p.act = A.LAND, p.actT = s.t;
  for (let k = 0; k < s.d.length; k++) {
    const d = s.d[k], z = sizeOf(w, k);
    if (!alive(s, k) || !breakable(w, k)) continue;
    if (!circleBox(p.x, p.y + 0.3, c.WAVE_R, d.x - z.hw, d.y, d.x + z.hw, d.y + z.h)) continue;
    const sx = d.x >= p.x ? 1 : -1;
    hitFoe(s, w, p, k, c.POGO_DMG * 0.5, sx * c.WAVE_KB, c.WAVE_KB * 0.6, c.HITSTOP_L, 'onda');
  }
  ev(s, 'slam', { x: p.x, y: p.y });
}

export function startHammer(s: State, w: World, p: Pl) {
  const [dx, dy] = aimOf(w, p, p.dax, p.day);
  p.act = A.HAMMER, p.actT = s.t, p.ax = dx, p.ay = dy, p.hits = [], p.dirT = -1e9;
  if (Math.abs(dx) > 0.2) p.face = dx > 0 ? 1 : -1;
  ev(s, 'hammer', { dx, dy });
}
// Cuadros del lanzamiento del martillazo (alrededor del primer cuadro activo)
export const LUNGE_F = 6;
export const lungeOn = (w: World, f: number) => f >= w.c.HAMMER_ON - 3 && f < w.c.HAMMER_ON - 3 + LUNGE_F;
// El golpe: un círculo a HAMMER_REACH del centro, en la dirección, mientras está activo
export function hammerBox(w: World, p: Pl) {
  return { x: p.x + p.ax * w.c.HAMMER_REACH, y: center(p) + p.ay * w.c.HAMMER_REACH, r: w.c.HAMMER_R };
}
export function hammerHits(s: State, w: World, p: Pl) {
  const c = w.c, f = s.t - p.actT;
  if (f < c.HAMMER_ON || f >= c.HAMMER_OFF) return;
  const hb = hammerBox(w, p);
  let any = false;
  for (let k = 0; k < s.d.length; k++) {
    const d = s.d[k], z = sizeOf(w, k);
    if (!alive(s, k) || p.hits.includes(k)) continue;
    if (!circleBox(hb.x, hb.y, hb.r, d.x - z.hw, d.y, d.x + z.hw, d.y + z.h)) continue;
    p.hits.push(k), any = true;
    if (breakable(w, k)) hitFoe(s, w, p, k, c.HAMMER_DMG, p.ax * c.HAMMER_KB, p.ay * c.HAMMER_KB + 3, c.HITSTOP_H, 'martillo');
    else ev(s, 'clank', { x: hb.x, y: hb.y });
    // martillazo hacia abajo en el aire sobre algo: también rebota (es un pogo)
    if (p.ay < -0.6 && !p.ground) bounce(s, w, p, d.x, d.y + z.h, k);
  }
  if (any) p.stopT = Math.max(p.stopT, s.t + c.HAMMER_STOP);
}

// ---------------------------------------------------------------- LA LIGA (de HYPERFLOWGEON)
export const attached = (p: Pl, t: number) => !!p.hook && t >= p.hook.at;
export type Target = { x: number, y: number, d: number, e: number, grace: boolean };
// Dónde se pega la liga desde la mano hacia el punto mantenido (tx, ty): el rayo (grilla y dummies, que tapan) o, si
// no pega, con HOOK_FOE un dummy visible dentro del cono de gracia (los enemigos se traen) y si no, el terreno más
// cercano en ángulo dentro del cono. Lo usan la sim y la mira del dibujo.
export function hookTarget(s: State, w: World, p: Pl, tx: number, ty: number): Target | null {
  const c = w.c, L = c.HOOK_LEN, ox = p.x, oy = p.y + HAND;
  let dx = tx - ox, dy = ty - oy;
  let n = Math.sqrt(dx * dx + dy * dy);
  if (n < 0.3) dx = p.face, dy = 1, n = Math.SQRT2;
  dx /= n, dy /= n;
  const ray = (rx: number, ry: number): Target | null => {
    const r = raycast(w, ox, oy, rx, ry, L);
    let best: Target | null = r >= 0 ? { x: ox + rx * r, y: oy + ry * r, d: r, e: -1, grace: false } : null;
    for (let k = 0; k < s.d.length; k++) {
      if (!alive(s, k)) continue;
      const d = s.d[k], z = sizeOf(w, k);
      const q = rayBox(ox, oy, rx, ry, d.x - z.hw, d.y, d.x + z.hw, d.y + z.h, best ? best.d : L);
      if (q >= 0 && (!best || q < best.d)) best = { x: ox + rx * q, y: oy + ry * q, d: q, e: k, grace: false };
    }
    return best;
  };
  const direct = ray(dx, dy);
  if (direct && direct.e >= 0) return direct;
  const cone = Math.cos(c.HOOK_CONE * Math.PI / 180);
  if (c.HOOK_FOE > 0.5) {
    let foe: Target | null = null, bc = cone;
    for (let k = 0; k < s.d.length; k++) {
      if (!alive(s, k)) continue;
      const d = s.d[k], z = sizeOf(w, k), vx = d.x - ox, vy = d.y + z.h / 2 - oy, m = Math.sqrt(vx * vx + vy * vy);
      if (m < 0.3 || m > L) continue;
      const q = (vx * dx + vy * dy) / m;
      if (q <= bc) continue;
      const r = ray(vx / m, vy / m);
      if (r && r.e === k) foe = { ...r, grace: true }, bc = q;
    }
    if (foe) return foe;
  }
  if (direct) return direct;
  for (let a = 3; a <= c.HOOK_CONE; a += 3) for (const sg of [1, -1]) {
    const r = sg * a * Math.PI / 180, ca = Math.cos(r), sa = Math.sin(r);
    const q = ray(dx * ca - dy * sa, dx * sa + dy * ca);
    if (q) return { ...q, grace: true };
  }
  return null;
}
export function fireHook(s: State, w: World, p: Pl, tx: number, ty: number) {
  const c = w.c, t = s.t, ox = p.x, oy = p.y + HAND;
  const travel = (d: number) => Math.ceil(c.HOOK_TRAVEL * HZ * d / c.HOOK_LEN - 1e-9);
  const g = hookTarget(s, w, p, tx, ty);
  p.holdT = -1e9;
  if (g) {
    const at = t + travel(g.d), e = g.e >= 0 ? s.d[g.e] : null;
    p.shot = { x: g.x, y: g.y, ox, oy, t, at, hit: true }, p.charge -= 1;
    p.hook = { x: g.x, y: g.y, at, rest: 0, e: g.e, ox: e ? g.x - e.x : 0, oy: e ? g.y - e.y : 0 };
    if (Math.abs(g.x - p.x) > 0.3) p.face = g.x > p.x ? 1 : -1;
  } else {
    let dx = tx - ox, dy = ty - oy;
    const n = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= n, dy /= n;
    const at = t + travel(c.HOOK_LEN);
    p.shot = { x: ox + dx * c.HOOK_LEN, y: oy + dy * c.HOOK_LEN, ox, oy, t, at, hit: false };
    p.hookT = at + c.HOOK_MISS;
  }
  ev(s, 'hook', { hit: !!g, x: p.shot.x, y: p.shot.y });
}
export function releaseHook(s: State, w: World, p: Pl) {
  if (!p.hook) return;
  if (!attached(p, s.t)) p.charge = Math.min(w.c.HOOK_N, p.charge + 1);   // todavía viajaba: devuelve la carga
  p.hook = null;
  ev(s, 'hookOff', {});
}
// La fuerza de la liga: solo tira hacia el ancla, HOOK_K × lo estirado menos HOOK_DAMP × la velocidad radial, sin
// acercar más rápido que HOOK_V. Contra un dummy se reparte por masa (el Estibador pesa EST_M; lo fijo, infinito).
export function hookForce(s: State, w: World, p: Pl) {
  const c = w.c, t = s.t, h = p.hook as Hook;
  if (!attached(p, t)) return;
  const e = h.e >= 0 ? s.d[h.e] : null, ie = e ? 1 / massOf(w, h.e) : 0, ih = 1 / c.EST_M;
  const ex = h.x - p.x, ey = h.y - (p.y + HAND), d = Math.sqrt(ex * ex + ey * ey);
  if (t === h.at) { h.rest = d * c.HOOK_REST; ev(s, 'hookOn', { x: h.x, y: h.y, e: h.e }); }
  if (d <= h.rest || d < 1e-6) return;
  const nx = ex / d, ny = ey / d, vr = (p.vx - (e?.vx ?? 0)) * nx + (p.vy - (e?.vy ?? 0)) * ny;
  const a = Math.max(0, Math.min(c.HOOK_K * (d - h.rest) - c.HOOK_DAMP * vr, (c.HOOK_V - vr) / DT)) * DT;
  p.vx += nx * a * ih / (ih + ie), p.vy += ny * a * ih / (ih + ie);
  if (e && ie > 0) { e.vx -= nx * a * ie / (ih + ie), e.vy -= ny * a * ie / (ih + ie), e.ground = false; if (a * ie / (ih + ie) > 0.2) e.lz = true; }
}
