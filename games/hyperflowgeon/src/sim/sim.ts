import type { Cfg } from './params.ts';

// Simulación pura a 60 Hz: datos planos (ida y vuelta por JSON), sin DOM y sin Math no exacto (ver tests).
// Metros y segundos, y hacia arriba. p.x es el centro del héroe; p.y, los pies.
export const HZ = 60, DT = 1 / HZ;
export const HW = 0.35, H = 1.8; // media anchura y alto del héroe
const EPS = 1e-6; // tocarse no es solaparse
const NEVER = -1e9;

export type Rect = { x0: number, y0: number, x1: number, y1: number };
export type World = { rects: Rect[], spawn: [number, number] };
export type Input = { x: number, jump: boolean }; // x en [-1, 1]
export type Player = {
  x: number, y: number, vx: number, vy: number,
  ground: boolean,
  groundT: number, // último cuadro que terminó en el suelo
  pressT: number,  // cuadro del último SALTO apretado y sin usar
  held: boolean,   // SALTO apretado en el cuadro anterior
  rise: boolean,   // subiendo por un salto propio (soltar SALTO lo corta)
};
export type State = { t: number, p: Player };

export function init(w: World): State {
  const [x, y] = w.spawn;
  return { t: 0, p: { x, y, vx: 0, vy: 0, ground: false, groundT: NEVER, pressT: NEVER, held: false, rise: false } };
}

const approach = (v: number, to: number, d: number) => v < to ? Math.min(v + d, to) : Math.max(v - d, to);

export function step(s: State, w: World, i: Input, c: Cfg): void {
  const p = s.p, t = ++s.t;

  // Horizontal: en el suelo acelera hacia RUN·x y frena con DEC (sin entrada, girando o pasado de RUN).
  // En el aire solo actúa la entrada y nunca le quita velocidad a favor: el impulso se conserva.
  const to = c.RUN * i.x;
  const speeding = to * p.vx >= 0 && Math.abs(to) > Math.abs(p.vx);
  if (p.ground) p.vx = approach(p.vx, to, (speeding ? c.ACC : c.DEC) * DT);
  else if (speeding || to * p.vx < 0) p.vx = approach(p.vx, to, c.AIR * DT);

  // Salto: un SALTO apretado hasta BUFFER cuadros antes, con suelo hasta COYOTE cuadros atrás.
  // groundT = t − 1 es estar en el suelo, así que el aire empieza en t − groundT = 2.
  if (i.jump && !p.held) p.pressT = t;
  p.held = i.jump;
  if (t - p.pressT <= c.BUFFER && t - p.groundT <= c.COYOTE + 1) {
    p.vy = 2 * c.JUMP_H / c.JUMP_T;
    p.rise = true;
    p.pressT = p.groundT = NEVER;
  }
  if (!i.jump && p.rise && p.vy > 0) p.vy *= c.JUMP_CUT, p.rise = false; // soltar subiendo = salto corto

  // Gravedad tal que JUMP_H se alcanza en JUMP_T; más fuerte al caer. Paso trapezoidal: la parábola es exacta.
  const vy0 = p.vy;
  p.vy -= 2 * c.JUMP_H / (c.JUMP_T * c.JUMP_T) * (p.vy < 0 ? c.FALL_G : 1) * DT;
  if (p.vy < -c.MAX_FALL) p.vy = -c.MAX_FALL;
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
