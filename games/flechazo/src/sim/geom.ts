// Geometría de las flechas (pura, sin Three.js: devuelve arreglos que el dibujo pasa a un BufferGeometry).
// Una flecha es una pared baja de perfil redondeado que corre por una polilínea en planta (x, z), con curvas de radio RC,
// la cola redonda y una punta triangular. Para animarla se recorta la «vía» (su camino + la recta de la punta, alargada)
// entre dos distancias: así avanza como una víbora.
import { WALL_H, HW, HEAD_F, HEAD_B, HEAD_W, RC } from './const.ts';

export type V2 = [number, number];
export type MeshData = { pos: Float32Array, nrm: Float32Array, col: Float32Array, idx: Uint32Array };

const len = (a: V2, b: V2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export function plen(P: V2[]) { let s = 0; for (let k = 1; k < P.length; k++) s += len(P[k - 1], P[k]); return s; }

// Punto y tangente a la distancia s de la polilínea (fuera del rango, se prolonga derecho)
export function pointAt(P: V2[], s: number): { p: V2, t: V2 } {
  let acc = 0;
  for (let k = 1; k < P.length; k++) {
    const l = len(P[k - 1], P[k]);
    if (l < 1e-9) continue;
    const t: V2 = [(P[k][0] - P[k - 1][0]) / l, (P[k][1] - P[k - 1][1]) / l];
    if (s <= acc + l || k === P.length - 1) {
      const u = s - acc;
      return { p: [P[k - 1][0] + t[0] * u, P[k - 1][1] + t[1] * u], t };
    }
    acc += l;
  }
  return { p: P[0], t: [1, 0] };
}

// El tramo de la polilínea entre las distancias s0 y s1
export function clip(P: V2[], s0: number, s1: number): V2[] {
  const out: V2[] = [];
  let acc = 0;
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], l = len(a, b);
    if (l < 1e-9) continue;
    const lo = Math.max(s0, acc), hi = Math.min(s1, acc + l);
    if (hi >= lo) {
      const at = (s: number): V2 => [a[0] + (b[0] - a[0]) * (s - acc) / l, a[1] + (b[1] - a[1]) * (s - acc) / l];
      if (!out.length) out.push(at(lo));
      const p = at(hi), q = out[out.length - 1];
      if (len(p, q) > 1e-6) out.push(p);
    }
    acc += l;
  }
  return out;
}

// Muestras con tangente: las esquinas en ángulo recto se vuelven arcos de radio ≤ rc
export function rounded(P: V2[], rc = RC, seg = 6): { p: V2[], t: V2[] } {
  const p: V2[] = [], t: V2[] = [];
  const n = P.length;
  if (n < 2) return { p, t };
  const dir = (k: number): V2 => { const l = len(P[k], P[k + 1]) || 1; return [(P[k + 1][0] - P[k][0]) / l, (P[k + 1][1] - P[k][1]) / l]; };
  p.push(P[0]), t.push(dir(0));
  for (let k = 1; k < n - 1; k++) {
    const a = dir(k - 1), b = dir(k);
    const cross = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(cross) < 1e-6) { p.push(P[k]), t.push(a); continue; }
    const r = Math.min(rc, len(P[k - 1], P[k]) * 0.5, len(P[k], P[k + 1]) * 0.5);
    const c: V2 = [P[k][0] - a[0] * r + b[0] * r, P[k][1] - a[1] * r + b[1] * r];
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI / 2, co = Math.cos(th), si = Math.sin(th);
      p.push([c[0] - b[0] * r * co + a[0] * r * si, c[1] - b[1] * r * co + a[1] * r * si]);
      t.push([a[0] * co + b[0] * si, a[1] * co + b[1] * si]);
    }
  }
  p.push(P[n - 1]), t.push(dir(n - 2));
  return { p, t };
}

// Perfil de la pared (u = al costado, v = arriba) con sus normales: costados rectos y lomo redondeado
const RT = 0.17, ARC = 4;
type Prof = { u: number, v: number, nu: number, nv: number }[];
const PROFILE: Prof = (() => {
  const o: Prof = [{ u: HW, v: 0, nu: 1, nv: 0 }];
  for (let j = 0; j <= ARC; j++) { const f = (j / ARC) * Math.PI / 2; o.push({ u: HW - RT + RT * Math.cos(f), v: WALL_H - RT + RT * Math.sin(f), nu: Math.cos(f), nv: Math.sin(f) }); }
  for (let j = 0; j <= ARC; j++) { const f = Math.PI / 2 + (j / ARC) * Math.PI / 2; o.push({ u: -HW + RT + RT * Math.cos(f), v: WALL_H - RT + RT * Math.sin(f), nu: Math.cos(f), nv: Math.sin(f) }); }
  o.push({ u: -HW, v: 0, nu: -1, nv: 0 });
  return o;
})();
const HALF = PROFILE.slice(0, ARC + 2).concat([{ u: 0, v: WALL_H, nu: 0, nv: 1 }]); // del costado derecho al centro del lomo

export function arrowMesh(P: V2[], rgb: [number, number, number], head = true): MeshData {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    pos.push(x, y, z), nrm.push(nx, ny, nz);
    // más claro arriba y un poco más oscuro al pie (da volumen sin texturas)
    const sh = 0.74 + 0.26 * Math.min(1, y / WALL_H), wh = ny > 0.7 ? 0.3 * ny : 0;
    col.push(rgb[0] * sh * (1 - wh) + wh, rgb[1] * sh * (1 - wh) + wh, rgb[2] * sh * (1 - wh) + wh);
    return pos.length / 3 - 1;
  };
  // triángulo orientado hacia afuera (según las normales de sus vértices)
  const tri = (a: number, b: number, c: number) => {
    const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2];
    const ux = pos[3 * b] - ax, uy = pos[3 * b + 1] - ay, uz = pos[3 * b + 2] - az, vx = pos[3 * c] - ax, vy = pos[3 * c + 1] - ay, vz = pos[3 * c + 2] - az;
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = nrm[3 * a] + nrm[3 * b] + nrm[3 * c], ny = nrm[3 * a + 1] + nrm[3 * b + 1] + nrm[3 * c + 1], nz = nrm[3 * a + 2] + nrm[3 * b + 2] + nrm[3 * c + 2];
    if (fx * nx + fy * ny + fz * nz < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  const quad = (a: number, b: number, c: number, d: number) => { tri(a, b, c), tri(a, c, d); };

  // con punta, el cuerpo termina en la base del triángulo (si no, su lomo asoma por la tapa inclinada)
  const total = plen(P), body = head && total > HEAD_B ? clip(P, 0, total - HEAD_B + 0.04) : P;
  const { p, t } = rounded(body.length >= 2 ? body : P);
  if (p.length < 2) return pack(pos, nrm, col, idx);
  const NP = PROFILE.length;
  // cuerpo
  let prev = -1;
  for (let i = 0; i < p.length; i++) {
    const rx = -t[i][1], rz = t[i][0], base = pos.length / 3; // derecha = tangente × arriba
    for (const q of PROFILE) vert(p[i][0] + rx * q.u, q.v, p[i][1] + rz * q.u, rx * q.nu, q.nv, rz * q.nu);
    if (prev >= 0) for (let j = 0; j + 1 < NP; j++) quad(prev + j, base + j, base + j + 1, prev + j + 1);
    prev = base;
  }
  // cola redonda: medio perfil girado 180° alrededor del último punto
  {
    const o = p[0], tx = t[0][0], tz = t[0][1], rx = -tz, rz = tx, K = 8, NH = HALF.length;
    let pr = -1;
    for (let k = 0; k <= K; k++) {
      const th = (k / K) * Math.PI, lx = rx * Math.cos(th) - tx * Math.sin(th), lz = rz * Math.cos(th) - tz * Math.sin(th), base = pos.length / 3;
      for (const q of HALF) vert(o[0] + lx * q.u, q.v, o[1] + lz * q.u, lx * q.nu, q.nv, lz * q.nu);
      if (pr >= 0) for (let j = 0; j + 1 < NH; j++) quad(pr + j, base + j, base + j + 1, pr + j + 1);
      pr = base;
    }
  }
  if (head && P.length >= 2) {
    // punta: prisma triangular con la tapa inclinada hacia adelante (se lee como flecha desde cualquier lado)
    const end = pointAt(P, total), h = end.p, tx = end.t[0], tz = end.t[1], rx = -tz, rz = tx;
    const HB = WALL_H + 0.08, HT = WALL_H * 0.6;
    const tip: V2 = [h[0] + tx * HEAD_F, h[1] + tz * HEAD_F];
    const bl: V2 = [h[0] - tx * HEAD_B + rx * HEAD_W, h[1] - tz * HEAD_B + rz * HEAD_W];
    const br: V2 = [h[0] - tx * HEAD_B - rx * HEAD_W, h[1] - tz * HEAD_B - rz * HEAD_W];
    // tapa: normal de la pendiente (sube hacia atrás)
    const slope = (HB - HT) / (HEAD_F + HEAD_B), nl = Math.hypot(slope, 1), nx = (tx * slope) / nl, ny = 1 / nl, nz = (tz * slope) / nl;
    tri(vert(tip[0], HT, tip[1], nx, ny, nz), vert(bl[0], HB, bl[1], nx, ny, nz), vert(br[0], HB, br[1], nx, ny, nz));
    const cxm = (tip[0] + bl[0] + br[0]) / 3, czm = (tip[1] + bl[1] + br[1]) / 3;
    for (const [a, b, ha, hb] of [[tip, bl, HT, HB], [bl, br, HB, HB], [br, tip, HB, HT]] as [V2, V2, number, number][]) {
      let sx = b[1] - a[1], sz = -(b[0] - a[0]);
      const l = Math.hypot(sx, sz) || 1; sx /= l, sz /= l;
      if (sx * ((a[0] + b[0]) / 2 - cxm) + sz * ((a[1] + b[1]) / 2 - czm) < 0) sx = -sx, sz = -sz;
      quad(vert(a[0], 0, a[1], sx, 0, sz), vert(b[0], 0, b[1], sx, 0, sz), vert(b[0], hb, b[1], sx, 0, sz), vert(a[0], ha, a[1], sx, 0, sz));
    }
  }
  return pack(pos, nrm, col, idx);
}

const pack = (pos: number[], nrm: number[], col: number[], idx: number[]): MeshData =>
  ({ pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), idx: new Uint32Array(idx) });
