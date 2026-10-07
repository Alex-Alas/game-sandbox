import { DEFAULTS, type Cfg } from './params.ts';

// Simulación pura a 60 Hz: datos planos (ida y vuelta por JSON), sin DOM y sin Math no exacto (ver tests).
// Metros y segundos, y hacia arriba. p.x es el centro del héroe; p.y, los pies.
export const HZ = 60, DT = 1 / HZ;
export const HW = 0.35, H = 1.8, HAND = 1.2; // media anchura y alto del héroe; altura de la mano, de donde sale la liga
const EPS = 1e-6; // tocarse no es solaparse
const NEVER = -1e9;

export type Rect = { x0: number, y0: number, x1: number, y1: number };
// orbs: chispas que devuelven una carga del garfio al tocarlas y reaparecen a los ORB_T s
export type World = { rects: Rect[], spawn: [number, number], orbs?: [number, number][] };
export const ORB_R = 0.4;
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
  charge: number,  // cargas del garfio (con fracción: la parte que se va recargando)
  refundT: number, // último cuadro en que soltar rápido devolvió una carga
};
export type State = { t: number, p: Player, orbs: number[] }; // orbs: cuadro en que cada chispa vuelve a estar

export function init(w: World, c: Cfg = DEFAULTS): State {
  const [x, y] = w.spawn;
  return { t: 0, orbs: (w.orbs ?? []).map(() => 0), p: { x, y, vx: 0, vy: 0, ground: false, face: 1, groundT: NEVER,
    pressT: NEVER, held: false, rise: false, hook: null, hookHeld: false, hookT: NEVER, shot: null, charge: c.HOOK_N, refundT: NEVER } };
}

const approach = (v: number, to: number, d: number) => v < to ? Math.min(v + d, to) : Math.max(v - d, to);

export function step(s: State, w: World, i: Input, c: Cfg): void {
  const p = s.p, t = ++s.t;
  if (i.x > 0) p.face = 1;
  else if (i.x < 0) p.face = -1;
  if (i.jump && !p.held) p.pressT = t;
  p.held = i.jump;

  // Garfio. SALTO enganchado suelta y suma HOOK_JUMP hacia arriba (y sigue siendo un SALTO: en el suelo salta);
  // soltar GARFIO suelta conservando la velocidad. Soltar a HOOK_REFUND m/s o más (sin contar el HOOK_JUMP)
  // devuelve la carga: encadenar bien casi no gasta. Apretarlo con una carga dispara a hookTarget: si pega, la liga
  // queda enganchada con un largo en reposo de HOOK_REST × la distancia y gasta la carga; si no, HOOK_MISS cuadros
  // sin poder disparar (fallar no gasta).
  const release = () => {
    if (c.HOOK_REFUND > 0 && p.vx * p.vx + p.vy * p.vy >= c.HOOK_REFUND * c.HOOK_REFUND) p.charge = Math.min(c.HOOK_N, p.charge + 1), p.refundT = t;
    p.hook = null;
  };
  if (p.hook && p.pressT === t) release(), p.vy += c.HOOK_JUMP;
  if (p.hook && !i.hook) release();
  if (i.hook && !p.hookHeld && !p.hook && t >= p.hookT && p.charge >= 1) {
    const g = hookTarget(w, p, i, c);
    if (g) p.shot = { x: g.x, y: g.y, t, hit: true }, p.hook = { x: g.x, y: g.y, rest: g.d * c.HOOK_REST }, p.charge -= 1;
    else {
      const [dx, dy] = aimDir(p, i, c);
      p.shot = { x: p.x + dx * c.HOOK_LEN, y: p.y + HAND + dy * c.HOOK_LEN, t, hit: false };
      p.hookT = t + c.HOOK_MISS;
    }
  }
  p.hookHeld = !!i.hook;

  // Cargas: se recargan solas, una cada HOOK_CD s (HOOK_GROUND veces más rápido en el suelo); las chispas devuelven una.
  p.charge = Math.min(c.HOOK_N, p.charge + DT / c.HOOK_CD * (p.ground ? c.HOOK_GROUND : 1));
  (w.orbs ?? []).forEach(([ox, oy], k) => {
    if (t < s.orbs[k] || p.charge >= c.HOOK_N) return; // con todas las cargas la chispa queda para después
    if (Math.abs(ox - p.x) <= HW + ORB_R && oy >= p.y - ORB_R && oy <= p.y + H + ORB_R)
      p.charge = Math.min(c.HOOK_N, p.charge + 1), s.orbs[k] = t + c.ORB_T * HZ;
  });

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

// cos de un ángulo en grados (serie de Taylor: la sim no usa trigonometría). Error < 1e-6 hasta 90°.
export function cosDeg(deg: number): number {
  const x = Math.min(Math.abs(deg), 90) * Math.PI / 180, x2 = x * x;
  return 1 - x2 / 2 * (1 - x2 / 12 * (1 - x2 / 30 * (1 - x2 / 56 * (1 - x2 / 90))));
}

// Dónde se pegaría la liga desde la mano: el rayo de la mira o, si no pega, el punto de superficie visible a menos de
// HOOK_LEN más cercano en ángulo a la mira, dentro del cono de gracia (HOOK_CONE grados a cada lado). Ese punto es
// siempre una esquina de un rect o donde un borde corta el círculo del alcance: a lo largo de un segmento o de un
// arco el ángulo es monótono, y si la mira lo cruzara ya habría pegado el rayo. Lo tapado lo cubre la esquina que tapa.
export type Target = { x: number, y: number, d: number, grace: boolean };
export function hookTarget(w: World, p: Player, i: Input, c: Cfg): Target | null {
  const [dx, dy] = aimDir(p, i, c), ox = p.x, oy = p.y + HAND, L = c.HOOK_LEN;
  const d = raycast(w, ox, oy, dx, dy, L);
  if (d >= 0) return { x: ox + dx * d, y: oy + dy * d, d, grace: false };
  if (c.HOOK_CONE <= 0) return null;
  let best: Target | null = null, bestCos = cosDeg(c.HOOK_CONE);
  const consider = (r: Rect, qx: number, qy: number) => {
    const vx = qx - ox, vy = qy - oy, n = Math.sqrt(vx * vx + vy * vy);
    if (n < 1e-6 || n > L + 1e-6) return;
    const cs = (vx * dx + vy * dy) / n;
    if (cs <= bestCos) return;
    // Apuntar un pelo hacia adentro del rect, así el rayo no roza la esquina; tiene que pegar ahí mismo (no tapado)
    const mx = (r.x0 + r.x1) / 2 - qx, my = (r.y0 + r.y1) / 2 - qy, mn = Math.sqrt(mx * mx + my * my) || 1;
    const ux = vx + mx / mn * 1e-4, uy = vy + my / mn * 1e-4, un = Math.sqrt(ux * ux + uy * uy);
    const h = raycast(w, ox, oy, ux / un, uy / un, L + 1e-3);
    if (h < 0 || h < n - 1e-3) return;
    best = { x: ox + ux / un * h, y: oy + uy / un * h, d: h, grace: true }, bestCos = cs;
  };
  for (const r of w.rects) {
    for (const qx of [r.x0, r.x1]) for (const qy of [r.y0, r.y1]) consider(r, qx, qy);
    for (const y of [r.y0, r.y1]) {
      const e = L * L - (y - oy) * (y - oy);
      if (e >= 0) for (const x of [ox - Math.sqrt(e), ox + Math.sqrt(e)]) if (x > r.x0 && x < r.x1) consider(r, x, y);
    }
    for (const x of [r.x0, r.x1]) {
      const e = L * L - (x - ox) * (x - ox);
      if (e >= 0) for (const y of [oy - Math.sqrt(e), oy + Math.sqrt(e)]) if (y > r.y0 && y < r.y1) consider(r, x, y);
    }
  }
  return best;
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
