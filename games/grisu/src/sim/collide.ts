// Colisión contra la grilla (el barrido por ejes de CATAPUM, sin la parte destructible) y entre cajas (el choque
// inelástico repartido por masa de HYPERFLOWGEON). Exacto: recorre las columnas o filas que cruza, así no se atraviesa
// nada por rápido que se vaya (el dash va a ~37 m/s).
import { CELL, AIR, type World } from './state.ts';

const EPS = 1e-6;   // tocarse no es solaparse
export const cell = (w: World, i: number, j: number) => i < 0 || i >= w.cols ? 1 : j < 0 || j >= w.rows ? AIR : w.g[j * w.cols + i];
export const solidAt = (w: World, x: number, y: number) => cell(w, Math.floor(x / CELL), Math.floor(y / CELL)) !== AIR;
function colSolid(w: World, i: number, j0: number, j1: number) {
  if (i < 0 || i >= w.cols) return true;
  for (let j = Math.max(0, j0); j <= Math.min(w.rows - 1, j1); j++) if (w.g[j * w.cols + i]) return true;
  return false;
}
function rowSolid(w: World, j: number, i0: number, i1: number) {
  if (j < 0 || j >= w.rows) return false;
  for (let i = Math.max(0, i0); i <= Math.min(w.cols - 1, i1); i++) if (w.g[j * w.cols + i]) return true;
  return false;
}
// Hasta dónde llega una caja (centro x, pies y, media anchura hw, alto h) moviéndose d por un eje sin entrar en nada
export function sweepX(w: World, x: number, y: number, hw: number, h: number, d: number): number {
  if (d === 0) return 0;
  const j0 = Math.floor((y + EPS) / CELL), j1 = Math.floor((y + h - EPS) / CELL);
  if (d > 0) {
    const e = x + hw, last = Math.floor((e + d) / CELL);
    for (let i = Math.floor((e + EPS) / CELL); i <= last; i++) if (colSolid(w, i, j0, j1)) return Math.max(0, Math.min(d, i * CELL - e));
  } else {
    const e = x - hw, last = Math.floor((e + d) / CELL);
    for (let i = Math.ceil((e - EPS) / CELL) - 1; i >= last; i--) if (colSolid(w, i, j0, j1)) return Math.min(0, Math.max(d, (i + 1) * CELL - e));
  }
  return d;
}
export function sweepY(w: World, x: number, y: number, hw: number, h: number, d: number): number {
  if (d === 0) return 0;
  const i0 = Math.floor((x - hw + EPS) / CELL), i1 = Math.floor((x + hw - EPS) / CELL);
  if (d > 0) {
    const e = y + h, last = Math.floor((e + d) / CELL);
    for (let j = Math.floor((e + EPS) / CELL); j <= last; j++) if (rowSolid(w, j, i0, i1)) return Math.max(0, Math.min(d, j * CELL - e));
  } else {
    const e = y, last = Math.floor((e + d) / CELL);
    for (let j = Math.ceil((e - EPS) / CELL) - 1; j >= last; j--) if (rowSolid(w, j, i0, i1)) return Math.min(0, Math.max(d, (j + 1) * CELL - e));
  }
  return d;
}
export function boxFree(w: World, x: number, y: number, hw: number, h: number): boolean {
  const i0 = Math.floor((x - hw + EPS) / CELL), i1 = Math.floor((x + hw - EPS) / CELL);
  const j0 = Math.floor((y + EPS) / CELL), j1 = Math.floor((y + h - EPS) / CELL);
  for (let i = i0; i <= i1; i++) if (colSolid(w, i, j0, j1)) return false;
  return true;
}
// ¿Hay suelo firme bajo toda la caja? (para el último lugar seguro tras caer a un foso)
export function firm(w: World, x: number, y: number, hw: number) {
  const j = Math.floor((y - EPS) / CELL);
  for (let i = Math.floor((x - hw - 0.6) / CELL); i <= Math.floor((x + hw + 0.6) / CELL); i++) if (cell(w, i, j) === AIR) return false;
  return true;
}
// Rayo unitario (dx, dy): distancia a la primera celda sólida antes de max, o −1 (DDA por la grilla)
export function raycast(w: World, ox: number, oy: number, dx: number, dy: number, max: number): number {
  let i = Math.floor(ox / CELL), j = Math.floor(oy / CELL);
  if (cell(w, i, j)) return 0;
  const si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? CELL / Math.abs(dx) : Infinity, tdy = dy !== 0 ? CELL / Math.abs(dy) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? (i + 1) * CELL - ox : ox - i * CELL) / Math.abs(dx)) : Infinity;
  let ty = dy !== 0 ? ((dy > 0 ? (j + 1) * CELL - oy : oy - j * CELL) / Math.abs(dy)) : Infinity;
  for (let n = 0; n < 4000; n++) {
    let t: number;
    if (tx < ty) { t = tx; i += si; tx += tdx; } else { t = ty; j += sj; ty += tdy; }
    if (t > max) break;
    if (cell(w, i, j)) return t;
  }
  return -1;
}
// Rayo contra una caja (método de las franjas): distancia o −1
export function rayBox(ox: number, oy: number, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number, max: number) {
  let t0 = 0, t1 = max;
  if (Math.abs(dx) < 1e-9) { if (ox <= x0 || ox >= x1) return -1; } else {
    const a = (x0 - ox) / dx, b = (x1 - ox) / dx;
    t0 = Math.max(t0, Math.min(a, b)), t1 = Math.min(t1, Math.max(a, b));
  }
  if (Math.abs(dy) < 1e-9) { if (oy <= y0 || oy >= y1) return -1; } else {
    const a = (y0 - oy) / dy, b = (y1 - oy) / dy;
    t0 = Math.max(t0, Math.min(a, b)), t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? t0 : -1;
}
// Distancia² de un punto a un segmento
export function segD2(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const vx = x1 - x0, vy = y1 - y0, L = vx * vx + vy * vy;
  let u = L > 0 ? ((px - x0) * vx + (py - y0) * vy) / L : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - x0 - vx * u, ey = py - y0 - vy * u;
  return ex * ex + ey * ey;
}
// ¿Un círculo (cx, cy, r) toca una caja?
export function circleBox(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number) {
  const qx = cx < x0 ? x0 : cx > x1 ? x1 : cx, qy = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  return (cx - qx) * (cx - qx) + (cy - qy) * (cy - qy) <= r * r;
}
// ¿Una cápsula (segmento con radio) toca una caja? Se prueba con los puntos de la caja más cercanos al segmento
export function capsuleBox(x0: number, y0: number, x1: number, y1: number, r: number, bx0: number, by0: number, bx1: number, by1: number) {
  if (circleBox(x0, y0, r, bx0, by0, bx1, by1) || circleBox(x1, y1, r, bx0, by0, bx1, by1)) return true;
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  for (const [px, py] of [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1], [cx, cy]]) if (segD2(px, py, x0, y0, x1, y1) <= r * r) return true;
  // el segmento cruza la caja
  const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy);
  return L > 0 && rayBox(x0, y0, dx / L, dy / L, bx0, by0, bx1, by1, L) >= 0;
}

export type Body = { x: number, y: number, vx: number, vy: number };
export const overlap = (a: Body, ahw: number, ah: number, b: Body, bhw: number, bh: number) =>
  Math.min(a.x + ahw, b.x + bhw) - Math.max(a.x - ahw, b.x - bhw) > EPS && Math.min(a.y + ah, b.y + bh) - Math.max(a.y, b.y) > EPS;
// Choque entre dos cajas que se solapan (inversa de la masa i; 0 = fija): por el eje de menor penetración, inelástico
// y repartido por masa. Lo que no puede moverse hacia ese lado (piso, pared) pesa infinito: así uno se para sobre un
// dummy. Separa con barrido. Devuelve el eje, el sentido de A hacia B y cuánto cambió la velocidad de cada uno.
export function collide(w: World, a: Body, ahw: number, ah: number, ia: number, b: Body, bhw: number, bh: number, ib: number) {
  const ox = Math.min(a.x + ahw, b.x + bhw) - Math.max(a.x - ahw, b.x - bhw);
  const oy = Math.min(a.y + ah, b.y + bh) - Math.max(a.y, b.y);
  if (ox <= EPS || oy <= EPS) return null;
  const vert = oy < ox, pen = vert ? oy : ox;
  const n = (vert ? b.y + bh / 2 - a.y - ah / 2 : b.x - a.x) >= 0 ? 1 : -1;
  const sw = (o: Body, hw: number, h: number, d: number) => vert ? sweepY(w, o.x, o.y, hw, h, d) : sweepX(w, o.x, o.y, hw, h, d);
  const move = (o: Body, hw: number, h: number, d: number) => {
    const m = sw(o, hw, h, d);
    if (vert) o.y += m; else o.x += m;
    return Math.abs(m);
  };
  if (ia > 0 && Math.abs(sw(a, ahw, ah, -n * 1e-3)) < 1e-4) ia = 0;
  if (ib > 0 && Math.abs(sw(b, bhw, bh, n * 1e-3)) < 1e-4) ib = 0;
  if (ia + ib === 0) return null;
  const vn = vert ? b.vy - a.vy : b.vx - a.vx, j = vn * n < 0 ? -vn * n / (ia + ib) : 0, da = ia * j, db = ib * j;
  if (vert) a.vy -= n * da, b.vy += n * db;
  else a.vx -= n * da, b.vx += n * db;
  const ma = move(a, ahw, ah, -n * pen * ia / (ia + ib)), mb = move(b, bhw, bh, n * (pen - ma));
  if (pen - ma - mb > EPS && ia > 0) move(a, ahw, ah, -n * (pen - ma - mb));
  return { vert, n, da, db };
}
