import type { Cfg } from './params.ts';

// Simulación pura a 60 Hz: datos planos (ida y vuelta por JSON), sin DOM y sin Math no exacto (ver tests).
// Metros y segundos, y hacia arriba. p.x es el centro del héroe; p.y, los pies.
export const HZ = 60, DT = 1 / HZ;
export const HW = 0.35, H = 1.8, HAND = 1.2; // media anchura y alto del héroe; altura de la mano, de donde sale la liga
const EPS = 1e-6; // tocarse no es solaparse
const NEVER = -1e9;

export type Rect = { x0: number, y0: number, x1: number, y1: number };
export type World = { rects: Rect[], spawn: [number, number] };
// x en [-1, 1]; GARFIO mantenido = enganchado; (ax, ay) = mira (sin largo: adelante y arriba)
export type Input = { x: number, jump: boolean, hook?: boolean, ax?: number, ay?: number };
export type Hook = { x: number, y: number, rest: number }; // ancla y largo en reposo de la liga
export type Shot = { x: number, y: number, t: number, hit: boolean }; // último disparo (para dibujarlo)
export type Player = {
  x: number, y: number, vx: number, vy: number,
  ground: boolean,
  face: number,    // ±1: hacia dónde mira (la mira sin dirección va adelante)
  groundT: number, // último cuadro que terminó en el suelo
  pressT: number,  // cuadro del último SALTO apretado y sin usar
  held: boolean,   // SALTO apretado en el cuadro anterior
  rise: boolean,   // subiendo por un salto propio (soltar SALTO lo corta)
  hook: Hook | null,
  hookHeld: boolean, // GARFIO apretado en el cuadro anterior
  hookT: number,     // primer cuadro en que se puede volver a disparar (tras fallar)
  shot: Shot | null,
};
export type State = { t: number, p: Player };

export function init(w: World): State {
  const [x, y] = w.spawn;
  return { t: 0, p: { x, y, vx: 0, vy: 0, ground: false, face: 1, groundT: NEVER, pressT: NEVER, held: false, rise: false,
    hook: null, hookHeld: false, hookT: NEVER, shot: null } };
}

const approach = (v: number, to: number, d: number) => v < to ? Math.min(v + d, to) : Math.max(v - d, to);

export function step(s: State, w: World, i: Input, c: Cfg): void {
  const p = s.p, t = ++s.t;
  if (i.x > 0) p.face = 1;
  else if (i.x < 0) p.face = -1;
  if (i.jump && !p.held) p.pressT = t;
  p.held = i.jump;

  // Garfio. SALTO enganchado suelta y suma HOOK_JUMP hacia arriba (y sigue siendo un SALTO: en el suelo salta);
  // soltar GARFIO suelta conservando la velocidad. Apretarlo dispara un rayo por la mira: si pega a menos de
  // HOOK_LEN, la liga queda enganchada con un largo en reposo de HOOK_REST × la distancia; si no, HOOK_MISS
  // cuadros sin poder disparar.
  if (p.hook && p.pressT === t) p.hook = null, p.vy += c.HOOK_JUMP;
  if (p.hook && !i.hook) p.hook = null;
  if (i.hook && !p.hookHeld && !p.hook && t >= p.hookT) {
    const [dx, dy] = aimDir(p, i, c), ox = p.x, oy = p.y + HAND, d = raycast(w, ox, oy, dx, dy, c.HOOK_LEN);
    const r = d < 0 ? c.HOOK_LEN : d;
    p.shot = { x: ox + dx * r, y: oy + dy * r, t, hit: d >= 0 };
    if (d >= 0) p.hook = { x: p.shot.x, y: p.shot.y, rest: d * c.HOOK_REST };
    else p.hookT = t + c.HOOK_MISS;
  }
  p.hookHeld = !!i.hook;

  // Horizontal: en el suelo acelera hacia RUN·x y frena con DEC (sin entrada, girando o pasado de RUN).
  // En el aire solo actúa la entrada y nunca le quita velocidad a favor: el impulso se conserva.
  // Enganchado manda la liga: el suelo no frena.
  const to = c.RUN * i.x;
  const speeding = to * p.vx >= 0 && Math.abs(to) > Math.abs(p.vx);
  if (p.ground && !p.hook) p.vx = approach(p.vx, to, (speeding ? c.ACC : c.DEC) * DT);
  else if (speeding || to * p.vx < 0) p.vx = approach(p.vx, to, c.AIR * DT);

  // Liga: solo tira (nunca empuja) hacia el ancla, HOOK_K × lo estirado menos HOOK_DAMP × la velocidad radial, y
  // nunca te acerca más rápido que HOOK_V: la herramienta sola no regala velocidad (pasar de ahí sale del columpio).
  // Es una fuerza central, así que la rapidez cambia según el ángulo (a favor acelera, en contra frena y te
  // devuelve, de costado solo te curva: columpio) y se conserva el momento angular alrededor del ancla.
  if (p.hook) {
    const ex = p.hook.x - p.x, ey = p.hook.y - (p.y + HAND), d = Math.sqrt(ex * ex + ey * ey);
    if (d > p.hook.rest) {
      const nx = ex / d, ny = ey / d, vr = p.vx * nx + p.vy * ny;
      const a = Math.max(0, Math.min(c.HOOK_K * (d - p.hook.rest) - c.HOOK_DAMP * vr, (c.HOOK_V - vr) / DT));
      p.vx += nx * a * DT, p.vy += ny * a * DT;
    }
  }

  // Salto: un SALTO apretado hasta BUFFER cuadros antes, con suelo hasta COYOTE cuadros atrás.
  // groundT = t − 1 es estar en el suelo, así que el aire empieza en t − groundT = 2.
  if (t - p.pressT <= c.BUFFER && t - p.groundT <= c.COYOTE + 1) {
    p.vy = 2 * c.JUMP_H / c.JUMP_T;
    p.rise = true;
    p.pressT = p.groundT = NEVER;
  }
  if (!i.jump && p.rise && p.vy > 0) p.vy *= c.JUMP_CUT, p.rise = false; // soltar subiendo = salto corto

  // Gravedad tal que JUMP_H se alcanza en JUMP_T; más fuerte al caer. Paso trapezoidal: la parábola es exacta.
  // Enganchado, una sola gravedad y sin tope de caída: con la de caída más fuerte cada columpio ganaría altura gratis.
  const vy0 = p.vy;
  p.vy -= 2 * c.JUMP_H / (c.JUMP_T * c.JUMP_T) * (p.vy < 0 && !p.hook ? c.FALL_G : 1) * DT;
  if (p.vy < -c.MAX_FALL && !p.hook) p.vy = -c.MAX_FALL;
  if (p.vy <= 0) p.rise = false;

  // Mover por ejes con barrido: no atraviesa nada, por rápido que vaya
  const wx = p.vx * DT, dx = sweepX(w, p, wx);
  p.x += dx;
  if (dx !== wx) p.vx = 0;
  const wy = (vy0 + p.vy) * 0.5 * DT, dy = sweepY(w, p, wy);
  p.y += dy;
  p.ground = wy < 0 && dy !== wy;
  if (dy !== wy) p.vy = 0, p.rise = false;
  if (p.ground) p.groundT = t;
}

// Mira unitaria: la de la entrada o, sin largo, adelante (face) y arriba con pendiente AIM_UP
export function aimDir(p: Player, i: Input, c: Cfg): [number, number] {
  let x = i.ax ?? 0, y = i.ay ?? 0;
  if (x * x + y * y < 1e-12) x = p.face, y = c.AIM_UP;
  const n = Math.sqrt(x * x + y * y);
  return [x / n, y / n];
}

// Distancia por el rayo unitario (dx, dy) desde (ox, oy) hasta el primer rect antes de max, o −1 (método de las franjas)
export function raycast(w: World, ox: number, oy: number, dx: number, dy: number, max: number): number {
  let best = max, hit = false;
  for (const r of w.rects) {
    let t0 = 0, t1 = best;
    if (dx === 0) { if (ox <= r.x0 || ox >= r.x1) continue; }
    else { const a = (r.x0 - ox) / dx, b = (r.x1 - ox) / dx; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (dy === 0) { if (oy <= r.y0 || oy >= r.y1) continue; }
    else { const a = (r.y0 - oy) / dy, b = (r.y1 - oy) / dy; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (t0 > 0 && t0 <= t1) best = t0, hit = true;
  }
  return hit ? best : -1;
}

// Hasta dónde llega la caja moviéndose d por un eje sin entrar en ningún rect
function sweepX(w: World, p: Player, d: number): number {
  for (const r of w.rects) {
    if (p.y + H <= r.y0 + EPS || p.y >= r.y1 - EPS) continue; // no comparten altura
    if (d > 0 && p.x + HW <= r.x0 + EPS) d = Math.min(d, r.x0 - (p.x + HW));
    if (d < 0 && p.x - HW >= r.x1 - EPS) d = Math.max(d, r.x1 - (p.x - HW));
  }
  return d;
}

function sweepY(w: World, p: Player, d: number): number {
  for (const r of w.rects) {
    if (p.x + HW <= r.x0 + EPS || p.x - HW >= r.x1 - EPS) continue; // no comparten anchura
    if (d > 0 && p.y + H <= r.y0 + EPS) d = Math.min(d, r.y0 - (p.y + H));
    if (d < 0 && p.y >= r.y1 - EPS) d = Math.max(d, r.y1 - p.y);
  }
  return d;
}
