// Navegación por el piso (para el piloto automático y las pruebas): una grilla de puntos cada C/2; un punto es libre si la
// caja del jugador cabe ahí sin tocar ninguna flecha. El camino se busca a lo ancho y después se tensa (se saltea todo
// punto intermedio que se pueda ver en línea recta).
import { C, R } from './const.ts';
import type { Box, Lim } from './body.ts';
import type { V2 } from './geom.ts';

export type Nav = { x0: number, z0: number, nx: number, nz: number, step: number, free: Uint8Array };

const PAD = 0.06;
export const pointFree = (boxes: Box[], x: number, z: number) =>
  !boxes.some(k => x + R + PAD > k.x0 && x - R - PAD < k.x1 && z + R + PAD > k.z0 && z - R - PAD < k.z1);
export function segFree(boxes: Box[], a: V2, b: V2) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2));
  for (let k = 0; k <= n; k++) if (!pointFree(boxes, a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return false;
  return true;
}

export function navOf(lim: Lim, boxes: Box[], step = C / 2): Nav {
  const x0 = lim.x0 + R + PAD, z0 = lim.z0 + R + PAD;
  const nx = Math.floor((lim.x1 - R - PAD - x0) / step) + 1, nz = Math.floor((lim.z1 - R - PAD - z0) / step) + 1;
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = pointFree(boxes, x0 + i * step, z0 + j * step) ? 1 : 0;
  return { x0, z0, nx, nz, step, free };
}

export function findPath(nav: Nav, boxes: Box[], from: V2, goal: (x: number, z: number) => boolean): V2[] | null {
  const { nx, nz, step, free } = nav, P = (n: number): V2 => [nav.x0 + (n % nx) * step, nav.z0 + ((n / nx) | 0) * step];
  // arranca del punto libre más cercano que se ve desde donde está
  let start = -1, best = Infinity;
  for (let n = 0; n < nx * nz; n++) {
    if (!free[n]) continue;
    const p = P(n), d = Math.hypot(p[0] - from[0], p[1] - from[1]);
    if (d < best && d < step * 2.5 && segFree(boxes, from, p)) best = d, start = n;
  }
  if (start < 0) return null;
  const prev = new Int32Array(nx * nz).fill(-1), q = [start];
  prev[start] = start;
  let end = -1;
  for (let h = 0; h < q.length && end < 0; h++) {
    const n = q[h], i = n % nx, j = (n / nx) | 0;
    if (goal(...P(n))) { end = n; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di, b = j + dj, m = b * nx + a;
      if (a < 0 || b < 0 || a >= nx || b >= nz || !free[m] || prev[m] >= 0) continue;
      if (di && dj && (!free[j * nx + a] || !free[b * nx + i])) continue; // sin cortar esquinas
      if (!segFree(boxes, P(n), P(m))) continue;
      prev[m] = n, q.push(m);
    }
  }
  if (end < 0) return null;
  const raw: V2[] = [];
  for (let n = end; ; n = prev[n]) { raw.push(P(n)); if (n === start) break; }
  raw.reverse();
  // tensado
  const out: V2[] = [];
  let cur = from;
  for (let k = 0; k < raw.length;) {
    let far = k;
    for (let m = raw.length - 1; m > k; m--) if (segFree(boxes, cur, raw[m])) { far = m; break; }
    out.push(raw[far]), cur = raw[far], k = far + 1;
  }
  return out;
}
