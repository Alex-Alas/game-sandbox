// Física de las mascotas (pura). Agarrada, lanzada o caída, una mascota es una pelota de radio r que gira (cuaternión),
// rebota y roza según su CUERPO (sólido, blando o saltarín) y se deforma con un resorte: se aplasta al pegar contra algo y
// se estira al volar. Choca con las flechas en reposo (cajas), con el piso de cada isla (esquinas redondas, huecos y el
// canto de la losa), con el bordecito que rodea la losa y con el jugador (un cilindro que la empuja). Sin piso abajo se
// cae al vacío. Agarrada, cuelga de la mano con un resorte (se balancea al girar; si se la sacude, se marea).
// Contacto: se saca la pelota del sólido por el camino más corto y se aplica un impulso normal (con rebote `e` si pega más
// rápido que REST_V) y uno de fricción de Coulomb hacia la rodadura sin deslizar (esfera maciza: I = 2/5 m r²), así gira
// y rueda sola. Arriba de eso, una resistencia a la rodadura (`rr`) la frena.
import type { Box, Lim } from './body.ts';

export type Feel = 'solido' | 'blando' | 'saltarin';
export const FEELS: Feel[] = ['solido', 'blando', 'saltarin'];
export const FEEL_NAME: Record<Feel, string> = { solido: 'SÓLIDO', blando: 'BLANDO', saltarin: 'SALTARÍN' };
// e: rebote; mu: fricción; rr: resistencia a la rodadura (1/s); k, c: resorte del aplaste (rigidez, amortiguación);
// gain: cuánto aplasta cada m/s de golpe; max: aplaste máximo; stretch: estirón por m/s en el aire; ck, cc: resorte que la
// sostiene en la mano (rígido = va pegada; blando = se bambolea)
export type FeelP = { e: number, mu: number, rr: number, k: number, c: number, gain: number, max: number, stretch: number, ck: number, cc: number };
export const FEEL: Record<Feel, FeelP> = {
  solido: { e: 0.32, mu: 0.75, rr: 2.4, k: 560, c: 36, gain: 0.02, max: 0.15, stretch: 0.004, ck: 260, cc: 30 },
  blando: { e: 0.1, mu: 0.95, rr: 4.5, k: 75, c: 3.4, gain: 0.05, max: 0.55, stretch: 0.022, ck: 75, cc: 7 },
  saltarin: { e: 0.8, mu: 0.4, rr: 0.8, k: 240, c: 9, gain: 0.05, max: 0.42, stretch: 0.016, ck: 150, cc: 12 },
};

export const PG = 18;                 // gravedad de las mascotas (m/s²)
export const REST_V = 1.0;            // más despacio que esto, no rebota
export const VOID_Y = -4.5;           // más abajo, cayó al vacío
export const SLAB_B = -2.2;           // fondo de la losa
export const RIM_TOP = 0.28;          // el bordecito de la losa: alto y banda (desde el borde del piso hacia afuera)
export const RIM_IN = -0.25, RIM_OUT = 0.08;
export const THROW_MIN = 3, THROW_MAX = 13.5, CHARGE_T = 0.9, THROW_UP = 0.3; // lanzar: m/s sin cargar y con todo, segundos de carga, ángulo extra
export const PLAYER_H = 1.75;         // alto del cilindro del jugador

export type V3 = [number, number, number];
export type Ball = {
  x: number, y: number, z: number, vx: number, vy: number, vz: number,
  wx: number, wy: number, wz: number, q: [number, number, number, number], r: number,
  s: number, sv: number, ax: V3,     // aplaste (+ aplasta, − estira), su velocidad y su eje
  air: number, still: number,        // segundos en el aire y quieta apoyada
  hit: number,                       // el golpe más fuerte desde que se soltó (m/s)
};
// Un sólido: prisma vertical de y0 a y1 cuya planta es sdf(x, z) < 0 (distancia con signo); bb para descartar rápido.
// v: si se mueve (el jugador). id: ≥ 0 flecha, −1 piso, −2 borde, −3 jugador
export type Solid = { sdf: (x: number, z: number) => number, y0: number, y1: number, bb: Lim, id: number, v?: V3 };
export type BallEv = { hit?: number, n?: V3, id?: number, ground?: boolean, void?: boolean };

export const newBall = (x: number, y: number, z: number, r: number, yaw = 0): Ball => ({
  x, y, z, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], r,
  s: 0, sv: 0, ax: [0, 1, 0], air: 0, still: 0, hit: 0,
});

// ---- Distancias con signo en planta --------------------------------------------------------------------------------------
export function sdRect(x: number, z: number, x0: number, z0: number, x1: number, z1: number, r = 0): number {
  const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  const qx = Math.abs(x - (x0 + hx)) - (hx - r), qz = Math.abs(z - (z0 + hz)) - (hz - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
const bbOf = (l: Lim, m: number): Lim => ({ x0: l.x0 - m, z0: l.z0 - m, x1: l.x1 + m, z1: l.z1 + m });

// Una flecha en reposo (sus cajas): del piso a su alto
export const boxSolid = (k: Box): Solid => ({ sdf: (x, z) => sdRect(x, z, k.x0, k.z0, k.x1, k.z1), y0: -0.4, y1: k.top, bb: k, id: k.id });
// El jugador: un cilindro de radio R desde los pies, que se mueve con su velocidad
export const playerSolid = (x: number, y: number, z: number, R: number, v: V3): Solid =>
  ({ sdf: (a, b) => Math.hypot(a - x, b - z) - R, y0: y, y1: y + PLAYER_H, bb: { x0: x - R, z0: z - R, x1: x + R, z1: z + R }, id: -3, v });

// El piso (la losa de cada isla, sin los huecos) y el bordecito que la rodea (y rodea los huecos)
export type LandLike = { floors: (Lim & { r: number })[], holes: Lim[] };
export function landSolids(l: LandLike): Solid[] {
  const floor = (x: number, z: number) => {
    let d = Infinity;
    for (const f of l.floors) d = Math.min(d, sdRect(x, z, f.x0, f.z0, f.x1, f.z1, f.r));
    for (const h of l.holes) d = Math.max(d, -sdRect(x, z, h.x0, h.z0, h.x1, h.z1));
    return d;
  };
  const mid = (RIM_IN + RIM_OUT) / 2, half = (RIM_OUT - RIM_IN) / 2;
  const rim = (x: number, z: number) => {
    let d = Infinity;
    for (const f of l.floors) d = Math.min(d, Math.abs(sdRect(x, z, f.x0, f.z0, f.x1, f.z1, f.r) - mid) - half);
    for (const h of l.holes) d = Math.min(d, Math.abs(-sdRect(x, z, h.x0, h.z0, h.x1, h.z1) - mid) - half);
    return d;
  };
  const all: Lim = { x0: Math.min(...l.floors.map(f => f.x0)), z0: Math.min(...l.floors.map(f => f.z0)), x1: Math.max(...l.floors.map(f => f.x1)), z1: Math.max(...l.floors.map(f => f.z1)) };
  return [{ sdf: floor, y0: SLAB_B, y1: 0, bb: all, id: -1 }, { sdf: rim, y0: -0.4, y1: RIM_TOP, bb: bbOf(all, RIM_OUT), id: -2 }];
}
// ¿Hay piso bajo el punto (x, z)? (el centro de la pelota)
export const floorAt = (solids: Solid[], x: number, z: number) => solids.some(s => s.id === -1 && s.sdf(x, z) < 0);

// Normal horizontal (gradiente de la distancia, por diferencias)
function grad(s: Solid, x: number, z: number): [number, number] {
  const h = 1e-3, gx = s.sdf(x + h, z) - s.sdf(x - h, z), gz = s.sdf(x, z + h) - s.sdf(x, z - h), l = Math.hypot(gx, gz);
  return l > 1e-9 ? [gx / l, gz / l] : [1, 0];
}

// Contacto de una esfera (centro p, radio r) con un sólido: normal hacia afuera y cuánto se mete (o null)
export function contact(px: number, py: number, pz: number, r: number, s: Solid): [number, number, number, number] | null {
  if (px < s.bb.x0 - r || px > s.bb.x1 + r || pz < s.bb.z0 - r || pz > s.bb.z1 + r || py > s.y1 + r || py < s.y0 - r) return null;
  const d = s.sdf(px, pz);
  if (d >= r) return null;
  const above = py - s.y1, below = s.y0 - py;
  if (d > 0) {
    const dy = above > 0 ? above : below > 0 ? -below : 0, dist = Math.hypot(d, dy);
    if (dist >= r) return null;
    if (dist < 1e-9) return [0, 1, 0, r];
    const [gx, gz] = grad(s, px, pz);
    return [gx * d / dist, dy / dist, gz * d / dist, r - dist];
  }
  if (above > 0) return above < r ? [0, 1, 0, r - above] : null;
  if (below > 0) return below < r ? [0, -1, 0, r - below] : null;
  // metida adentro: sale por el lado más corto
  const up = -above, down = -below, side = -d;
  if (up <= side && up <= down) return [0, 1, 0, up + r];
  if (down <= side) return [0, -1, 0, down + r];
  const [gx, gz] = grad(s, px, pz);
  return [gx, 0, gz, side + r];
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Un paso de la pelota suelta
export function stepBall(b: Ball, f: FeelP, solids: Solid[], dt: number): BallEv {
  const ev: BallEv = {};
  b.vy -= PG * dt;
  const drag = Math.exp(-0.06 * dt);
  b.vx *= drag, b.vy *= drag, b.vz *= drag;
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  if (sp > 40) { const k = 40 / sp; b.vx *= k, b.vy *= k, b.vz *= k; }
  b.x += b.vx * dt, b.y += b.vy * dt, b.z += b.vz * dt;
  let grounded = false;
  for (let it = 0; it < 2; it++) for (const s of solids) {
    const c = contact(b.x, b.y, b.z, b.r, s);
    if (!c) continue;
    const [nx, ny, nz, depth] = c, sv = s.v ?? [0, 0, 0];
    b.x += nx * depth, b.y += ny * depth, b.z += nz * depth;
    if (ny > 0.55) grounded = true;
    const rvx = b.vx - sv[0], rvy = b.vy - sv[1], rvz = b.vz - sv[2], vn = rvx * nx + rvy * ny + rvz * nz;
    if (vn >= 0) continue;
    const e = -vn > REST_V ? f.e : 0, jn = -(1 + e) * vn;
    b.vx += nx * jn, b.vy += ny * jn, b.vz += nz * jn;
    // fricción en el punto de contacto (rc = −r·n), hacia rodar sin deslizar, con tope de Coulomb
    const rc: V3 = [-nx * b.r, -ny * b.r, -nz * b.r], wr = cross([b.wx, b.wy, b.wz], rc);
    const cvx = b.vx - sv[0] + wr[0], cvy = b.vy - sv[1] + wr[1], cvz = b.vz - sv[2] + wr[2], cn = cvx * nx + cvy * ny + cvz * nz;
    const tx = cvx - nx * cn, ty = cvy - ny * cn, tz = cvz - nz * cn, tl = Math.hypot(tx, ty, tz);
    if (tl > 1e-6) {
      const jt = Math.min(tl * 2 / 7, f.mu * jn), ux = tx / tl, uy = ty / tl, uz = tz / tl;
      b.vx -= ux * jt, b.vy -= uy * jt, b.vz -= uz * jt;
      const dw = cross(rc, [-ux, -uy, -uz]), k = jt / (0.4 * b.r * b.r);
      b.wx += dw[0] * k, b.wy += dw[1] * k, b.wz += dw[2] * k;
    }
    // el golpe la aplasta contra lo que pegó (lo que venía estirada se olvida)
    if (-vn > 0.6) { b.s = Math.max(b.s, 0), b.sv = Math.max(b.sv, 0) + Math.min(-vn, 20) * f.gain * 9; b.ax = [nx, ny, nz]; }
    if (-vn > (ev.hit ?? 0)) { ev.hit = -vn, ev.n = [nx, ny, nz], ev.id = s.id; }
  }
  if (ev.hit) b.hit = Math.max(b.hit, ev.hit);
  // apoyada: resistencia a la rodadura
  if (grounded) {
    const k = Math.exp(-f.rr * dt);
    b.vx *= k, b.vz *= k, b.wx *= k, b.wy *= k, b.wz *= k;
    b.air = 0;
  } else b.air += dt;
  ev.ground = grounded;
  const still = grounded && Math.hypot(b.vx, b.vy, b.vz) < 0.3 && Math.hypot(b.wx, b.wy, b.wz) < 1.5;
  b.still = still ? b.still + dt : 0;
  if (still && b.still > 0.15) b.vx = b.vz = b.wx = b.wy = b.wz = 0;
  spin(b, dt);
  squash(b, f, dt);
  if (b.y < VOID_Y) ev.void = true;
  return ev;
}

// Gira el cuaternión con la velocidad angular (en el mundo)
function spin(b: Ball, dt: number) {
  const [x, y, z, w] = b.q, h = 0.5 * dt, ax = b.wx, ay = b.wy, az = b.wz;
  const q: [number, number, number, number] = [x + h * (ax * w + ay * z - az * y), y + h * (ay * w + az * x - ax * z), z + h * (az * w + ax * y - ay * x), w - h * (ax * x + ay * y + az * z)];
  const l = Math.hypot(...q);
  b.q = [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

// El aplaste: un resorte hacia `tgt`. En el aire se estira hacia donde va; en la mano, se aplasta hacia donde la aceleran
// (la inercia), así al moverla se bambolea
function squash(b: Ball, f: FeelP, dt: number, tgt?: number, dir?: V3) {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  if (tgt === undefined) {
    const fly = b.air > 0.14 && sp > 2; // recién rebotada, todavía se está aplastando
    tgt = fly ? -Math.min(f.max * 0.6, sp * f.stretch) : 0;
    if (fly) dir = [b.vx / sp, b.vy / sp, b.vz / sp];
  }
  if (dir) {
    const k = Math.min(1, dt * 10), a = b.ax, sg = a[0] * dir[0] + a[1] * dir[1] + a[2] * dir[2] < 0 ? -1 : 1; // el eje no tiene sentido: se sigue el más cercano
    const nx = a[0] + (sg * dir[0] - a[0]) * k, ny = a[1] + (sg * dir[1] - a[1]) * k, nz = a[2] + (sg * dir[2] - a[2]) * k, l = Math.hypot(nx, ny, nz);
    if (l > 1e-6) b.ax = [nx / l, ny / l, nz / l];
  }
  b.sv += (-f.k * (b.s - tgt) - f.c * b.sv) * dt;
  b.s = Math.max(-f.max, Math.min(f.max, b.s + b.sv * dt));
}

// Fuera de la física (siguiéndote) el aplaste vuelve a cero; `kick` le da un golpecito (una caricia, un salto)
export const relax = (b: Ball, f: FeelP, dt: number) => { b.air = 0; squash(b, f, dt, 0); };
export function kick(b: Ball, f: FeelP, v: number, ax: V3 = [0, 1, 0]) { b.s = Math.max(b.s, 0), b.sv = Math.max(b.sv, 0) + v * f.gain * 9, b.ax = ax; }

// Agarrada: cuelga de la mano (t: dónde, tv: con qué velocidad se mueve la mano). Devuelve la aceleración (m/s²): mucha y
// seguida es sacudirla
export function carry(b: Ball, f: FeelP, t: V3, tv: V3, dt: number): number {
  const ax = f.ck * (t[0] - b.x) + f.cc * (tv[0] - b.vx), ay = f.ck * (t[1] - b.y) + f.cc * (tv[1] - b.vy), az = f.ck * (t[2] - b.z) + f.cc * (tv[2] - b.vz);
  b.vx += ax * dt, b.vy += ay * dt, b.vz += az * dt;
  b.x += b.vx * dt, b.y += b.vy * dt, b.z += b.vz * dt;
  const k = Math.exp(-6 * dt);
  b.wx *= k, b.wy *= k, b.wz *= k;
  b.air = 0, b.still = 0, b.hit = 0;
  const a = Math.hypot(ax, ay, az);
  squash(b, f, dt, Math.min(f.max * 0.5, a * f.gain * 0.03), a > 2 ? [ax / a, ay / a, az / a] : undefined);
  spin(b, dt);
  return a;
}

// La velocidad al lanzarla: la que ya traía en la mano más la del brazo hacia donde mirás (un poco hacia arriba)
export function throwVel(b: Ball, look: V3, power: number): V3 {
  const sp = THROW_MIN + (THROW_MAX - THROW_MIN) * Math.max(0, Math.min(1, power));
  let dx = look[0], dy = look[1] + THROW_UP, dz = look[2];
  const l = Math.hypot(dx, dy, dz);
  dx /= l, dy /= l, dz /= l;
  return [b.vx + dx * sp, b.vy + dy * sp, b.vz + dz * sp];
}

// Por dónde va a ir (para la mira de lanzar): puntos cada `every` pasos hasta que toca algo, se queda o cae al vacío
export function predict(b0: Ball, f: FeelP, solids: Solid[], dt: number, maxT = 2.5, every = 4): { pts: V3[], end: 'touch' | 'void' | 'time', at: V3 } {
  const b: Ball = { ...b0, q: [...b0.q] as Ball['q'], ax: [...b0.ax] as V3 }, pts: V3[] = [[b.x, b.y, b.z]];
  for (let k = 1; k * dt <= maxT; k++) {
    const ev = stepBall(b, f, solids, dt);
    if (k % every === 0) pts.push([b.x, b.y, b.z]);
    if (ev.void) return { pts, end: 'void', at: [b.x, b.y, b.z] };
    if (ev.hit !== undefined || ev.ground) { pts.push([b.x, b.y, b.z]); return { pts, end: 'touch', at: [b.x, b.y, b.z] }; }
  }
  return { pts, end: 'time', at: [b.x, b.y, b.z] };
}
