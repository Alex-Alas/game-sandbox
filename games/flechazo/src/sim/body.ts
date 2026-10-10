// Cuerpo del jugador (puro): una caja de 2R × 2R en planta sobre los pies, que camina por el piso y por encima de las
// flechas. Las flechas son cajas (una por tramo y una por la punta); chocan de costado y de arriba se puede pisar. En el
// aire, un borde que queda a menos de MANTLE por encima de los pies te sube (se llega arriba con el salto base).
// Con `land` (mapas con islas o con un hueco al medio) el piso no está en todas partes: fuera de las islas (o dentro de un
// hueco) no hay piso y se cae; el canto de cada isla frena de costado al que quedó más abajo que el piso. Sin el equipo
// para viajar libre (`free`: planeo y velocidad 3), el vacío tira para abajo: más gravedad, sin planeo ni saltos en el aire.
import { C, HW, WALL_H, HEAD_F, HEAD_B, HEAD_W, R } from './const.ts';
import { cx, cy, dirOf, DX, DY, type Board } from './puzzle.ts';

export type Box = { x0: number, z0: number, x1: number, z1: number, top: number, id: number };
export type Lim = { x0: number, z0: number, x1: number, z1: number };
export type Land = { floors: (Lim & { r: number })[], holes: Lim[] }; // pisos (con el radio de sus esquinas) y huecos
export type Body = {
  x: number, y: number, z: number, vx: number, vy: number, vz: number,
  ground: boolean, on: number, // on: flecha sobre la que está parado (−1 = piso)
  air: number, coyote: number, buf: number, gliding: boolean,
  void: boolean,               // sobre el vacío (sin piso abajo)
};
export type Move = { mx: number, mz: number, jump: boolean, jumpHit: boolean }; // mx/mz: dirección deseada en el mundo (largo ≤ 1)
export type Phys = { speed: number, jumpH: number, air: number, glide: boolean, free?: boolean }; // free: cruza el vacío
export type BodyEv = { jump?: 'suelo' | 'aire', land?: number }; // land: rapidez de caída al aterrizar

export const G = 26, STEP = 0.12, MANTLE = 0.32, COYOTE = 0.1, BUFFER = 0.13, GLIDE_V = 1.7, ACC_G = 14, ACC_A = 5;
export const VOID_G = 2.6; // gravedad sobre el vacío sin el equipo

// ¿Hay piso bajo la caja del jugador en (x, z)? (esquinas redondas; adentro de un hueco, no)
export function onLand(l: Land, x: number, z: number): boolean {
  if (l.holes.some(h => x - R >= h.x0 && x + R <= h.x1 && z - R >= h.z0 && z + R <= h.z1)) return false;
  return l.floors.some(f => {
    const hw = (f.x1 - f.x0) / 2, hh = (f.z1 - f.z0) / 2;
    const qx = Math.max(Math.abs(x - (f.x0 + hw)) - (hw - f.r), 0), qz = Math.max(Math.abs(z - (f.z0 + hh)) - (hh - f.r), 0);
    return Math.hypot(qx, qz) - f.r < R;
  });
}

export const newBody = (x: number, z: number): Body =>
  ({ x, y: 0, z, vx: 0, vy: 0, vz: 0, ground: true, on: -1, air: 0, coyote: 0, buf: 0, gliding: false, void: false });

// Cajas de una flecha en reposo (en el mundo: la celda (x, y) está en (ox + x·C, oz + y·C))
export function arrowBoxes(b: Board, id: number, ox: number, oz: number): Box[] {
  const a = b.arrows[id], out: Box[] = [];
  const X = (i: number) => ox + cx(b, i) * C, Z = (i: number) => oz + cy(b, i) * C;
  for (let k = 0; k + 1 < a.cells.length; k++) {
    const p = a.cells[k], q = a.cells[k + 1];
    out.push({ x0: Math.min(X(p), X(q)) - HW, x1: Math.max(X(p), X(q)) + HW, z0: Math.min(Z(p), Z(q)) - HW, z1: Math.max(Z(p), Z(q)) + HW, top: WALL_H, id });
  }
  const h = a.cells[a.cells.length - 1], d = dirOf(b, a), hx = X(h), hz = Z(h), w = HEAD_W * 0.8;
  const fx = hx + DX[d] * HEAD_F, fz = hz + DY[d] * HEAD_F, bx = hx - DX[d] * HEAD_B, bz = hz - DY[d] * HEAD_B;
  out.push(DX[d] ? { x0: Math.min(fx, bx), x1: Math.max(fx, bx), z0: hz - w, z1: hz + w, top: WALL_H + 0.04, id }
    : { x0: hx - w, x1: hx + w, z0: Math.min(fz, bz), z1: Math.max(fz, bz), top: WALL_H + 0.04, id });
  return out;
}

const over = (b: Body, k: Box) => b.x + R > k.x0 && b.x - R < k.x1 && b.z + R > k.z0 && b.z - R < k.z1;

// Distancia en planta de un punto a una caja (0 adentro)
export const boxDist = (x: number, z: number, k: Box) => Math.hypot(Math.max(k.x0 - x, 0, x - k.x1), Math.max(k.z0 - z, 0, z - k.z1));

export function stepBody(b: Body, m: Move, boxes: Box[], lim: Lim, ph: Phys, dt: number, land?: Land): BodyEv {
  const ev: BodyEv = {};
  b.void = !!land && !onLand(land, b.x, b.z);
  const pull = b.void && !ph.free; // el vacío tira: ni planeo ni saltos en el aire
  // salto: con buffer (apretado un poco antes de tocar el suelo) y coyote (un poco después de dejarlo)
  b.buf = m.jumpHit ? BUFFER : Math.max(0, b.buf - dt);
  b.coyote = b.ground ? COYOTE : Math.max(0, b.coyote - dt);
  if (b.ground) b.air = ph.air;
  if (b.buf > 0 && b.coyote > 0) {
    b.vy = Math.sqrt(2 * G * ph.jumpH), b.ground = false, b.coyote = 0, b.buf = 0, ev.jump = 'suelo';
  } else if (m.jumpHit && !b.ground && b.air > 0 && !pull) {
    b.vy = Math.sqrt(2 * G * ph.jumpH * 0.8), b.air--, b.buf = 0, ev.jump = 'aire';
  }
  const k = 1 - Math.exp(-(b.ground ? ACC_G : ACC_A) * dt);
  b.vx += (m.mx * ph.speed - b.vx) * k;
  b.vz += (m.mz * ph.speed - b.vz) * k;
  b.vy -= G * (pull ? VOID_G : 1) * dt;
  b.gliding = ph.glide && !pull && m.jump && !b.ground && b.vy < -GLIDE_V;
  if (b.gliding) b.vy = -GLIDE_V;

  // más abajo que el piso, el canto de las islas es una pared (la de una isla que ya está encima, no: está en su hueco)
  const reach = b.ground ? STEP : MANTLE, E = 1e-6;
  const solid = land && b.y + reach < 0 ? [...boxes, ...land.floors.map(f => ({ ...f, top: 0, id: -3 })).filter(f => !over(b, f))] : boxes;

  // si quedó metido en una caja (una flecha que volvió), se lo empuja afuera por el lado más corto
  for (const q of solid) {
    if (!over(b, q) || q.top <= b.y + STEP) continue;
    const pen = [b.x + R - q.x0, q.x1 - (b.x - R), b.z + R - q.z0, q.z1 - (b.z - R)], i = pen.indexOf(Math.min(...pen));
    if (i === 0) b.x -= pen[0]; else if (i === 1) b.x += pen[1]; else if (i === 2) b.z -= pen[2]; else b.z += pen[3];
  }

  // de costado, eje por eje: cada caja que no se puede pisar frena el avance justo en su borde
  let dx = b.vx * dt;
  for (const q of solid) {
    if (q.top <= b.y + reach || !(b.z + R > q.z0 && b.z - R < q.z1)) continue;
    if (dx > 0 && b.x + R <= q.x0 + E && b.x + R + dx > q.x0) dx = q.x0 - R - b.x - E, b.vx = 0;
    else if (dx < 0 && b.x - R >= q.x1 - E && b.x - R + dx < q.x1) dx = q.x1 + R - b.x + E, b.vx = 0;
  }
  b.x = Math.min(lim.x1 - R, Math.max(lim.x0 + R, b.x + dx));
  let dz = b.vz * dt;
  for (const q of solid) {
    if (q.top <= b.y + reach || !(b.x + R > q.x0 && b.x - R < q.x1)) continue;
    if (dz > 0 && b.z + R <= q.z0 + E && b.z + R + dz > q.z0) dz = q.z0 - R - b.z - E, b.vz = 0;
    else if (dz < 0 && b.z - R >= q.z1 - E && b.z - R + dz < q.z1) dz = q.z1 + R - b.z + E, b.vz = 0;
  }
  b.z = Math.min(lim.z1 - R, Math.max(lim.z0 + R, b.z + dz));
  // adentro de un hueco y más abajo que el piso, no se sale por el costado
  if (land && b.y + reach < 0) for (const h of land.holes) {
    if (b.x - R < h.x0 - 0.5 || b.x + R > h.x1 + 0.5 || b.z - R < h.z0 - 0.5 || b.z + R > h.z1 + 0.5) continue;
    b.x = Math.min(h.x1 - R, Math.max(h.x0 + R, b.x)), b.z = Math.min(h.z1 - R, Math.max(h.z0 + R, b.z));
  }

  // de arriba: el apoyo más alto que se alcanza (el piso, si lo hay, o una flecha)
  let sup = land && !onLand(land, b.x, b.z) ? -Infinity : 0, on = -1;
  for (const q of boxes) if (over(b, q) && q.top <= b.y + reach && q.top > sup) sup = q.top, on = q.id;
  const ny = b.y + b.vy * dt;
  if (ny <= sup) {
    if (!b.ground && b.vy < -2) ev.land = -b.vy;
    b.y = sup, b.vy = 0, b.ground = true, b.on = on, b.gliding = false;
  } else {
    b.y = ny, b.ground = false, b.on = -1;
  }
  return ev;
}
