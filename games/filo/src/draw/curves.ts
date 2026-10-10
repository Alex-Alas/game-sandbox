// Geometría de dibujo (pura): curvas suaves, trazos que se afinan y miembros de una sola pieza.
// Todo se arma con puntos densos ya muestreados: así el contorno es continuo y el temblor
// («boil») se aplica sobre los puntos de control antes de suavizar.
export type V = [number, number];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number) => x < a ? a : x > b ? b : x;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const vlerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const vadd = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
export const vsub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
export const vscale = (a: V, s: number): V => [a[0] * s, a[1] * s];
export const vlen = (a: V) => Math.hypot(a[0], a[1]);
export const vnorm = (a: V): V => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
export const vrot = (a: V, ang: number): V => { const c = Math.cos(ang), s = Math.sin(ang); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; };
export const perp = (a: V): V => [-a[1], a[0]];

// Azar con semilla y hash (para el temblor de línea: cada dibujo tiene sus propios «errores»)
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Ruido de valor 1D suave (para ondear cintas, vibrar bordes)
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
}
export function noise2(x: number, y: number, seed = 0): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}
export function fbm(x: number, y: number, oct = 4, seed = 0): number {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * noise2(x * f, y * f, seed + o * 17); f *= 2.03; a *= 0.5; }
  return s;
}

// Catmull-Rom centrípeta muestreada: pasa por los puntos sin bucles ni sobrepasos raros.
// `sharp[i]` hace esquina en ese punto (puntas de capa, mentón, punta del pie).
export function spline(pts: V[], closed: boolean, per = 6, sharp?: (boolean | undefined)[]): V[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const out: V[] = [];
  const get = (i: number): V => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    let p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    if (!closed && i === 0) p0 = vsub(vscale(p1, 2), p2);
    if (!closed && i === segs - 1) p3 = vsub(vscale(p2, 2), p1);
    if (sharp?.[i % n]) p0 = vsub(vscale(p1, 2), p2);      // esquina: sin tangente heredada
    if (sharp?.[(i + 1) % n]) p3 = vsub(vscale(p2, 2), p1);
    const d01 = Math.pow(vlen(vsub(p1, p0)), 0.5) || 1e-4;
    const d12 = Math.pow(vlen(vsub(p2, p1)), 0.5) || 1e-4;
    const d23 = Math.pow(vlen(vsub(p3, p2)), 0.5) || 1e-4;
    // tangentes de Catmull-Rom no uniforme
    const m1: V = [
      (p1[0] - p0[0]) / d01 - (p2[0] - p0[0]) / (d01 + d12) + (p2[0] - p1[0]) / d12,
      (p1[1] - p0[1]) / d01 - (p2[1] - p0[1]) / (d01 + d12) + (p2[1] - p1[1]) / d12,
    ];
    const m2: V = [
      (p2[0] - p1[0]) / d12 - (p3[0] - p1[0]) / (d12 + d23) + (p3[0] - p2[0]) / d23,
      (p2[1] - p1[1]) / d12 - (p3[1] - p1[1]) / (d12 + d23) + (p3[1] - p2[1]) / d23,
    ];
    const t1: V = vscale(m1, d12), t2: V = vscale(m2, d12);
    const steps = Math.max(1, per);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2_ = t * t, t3 = t2_ * t;
      const h00 = 2 * t3 - 3 * t2_ + 1, h10 = t3 - 2 * t2_ + t, h01 = -2 * t3 + 3 * t2_, h11 = t3 - t2_;
      out.push([
        h00 * p1[0] + h10 * t1[0] + h01 * p2[0] + h11 * t2[0],
        h00 * p1[1] + h10 * t1[1] + h01 * p2[1] + h11 * t2[1],
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// Largo acumulado de una polilínea
export function arcLengths(p: V[]): number[] {
  const L = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return L;
}
export function normals(p: V[]): V[] {
  const n = p.length, out: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    out.push(vnorm(perp(vsub(b, a))));
  }
  return out;
}

// Trazo que se afina: polígono cerrado alrededor de la polilínea `p` con ancho `w(t, lado)`.
// lado = +1 a la izquierda de la marcha, −1 a la derecha (perfiles distintos = forma orgánica).
export function taper(p: V[], w: (t: number, side: number) => number): V[] {
  const L = arcLengths(p), tot = L[L.length - 1] || 1, N = normals(p);
  const left: V[] = [], right: V[] = [];
  for (let i = 0; i < p.length; i++) {
    const t = L[i] / tot;
    const wl = w(t, 1), wr = w(t, -1);
    left.push([p[i][0] + N[i][0] * wl, p[i][1] + N[i][1] * wl]);
    right.push([p[i][0] - N[i][0] * wr, p[i][1] - N[i][1] * wr]);
  }
  return left.concat(right.reverse());
}

// Perfiles de ancho típicos para trazos de pincel
export const brush = (w0: number, w1: number, peak = 0.3) => (t: number) => {
  // engorda rápido al empezar y se afina al final
  const a = t < peak ? smooth(t / peak) : 1;
  return Math.max(0, lerp(w0, w1, t) * a);
};

// Temblor de línea: cada punto de control se corre un poco según el dibujo (seed) y su índice
export function boil(pts: V[], amp: number, seed: number, id = 0): V[] {
  if (amp <= 0) return pts;
  return pts.map((q, i) => [
    q[0] + (hash(seed, i, id * 7 + 1) - 0.5) * 2 * amp,
    q[1] + (hash(seed, i, id * 7 + 2) - 0.5) * 2 * amp,
  ]);
}

export function pathOf(pts: V[], closed = true, into?: Path2D): Path2D {
  const p = into ?? new Path2D();
  if (!pts.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
}

// IK de dos huesos: devuelve la articulación del medio. `bend` = +1/−1 elige hacia qué lado dobla.
// Si el objetivo queda lejos, estira hasta `stretch` (miembros elásticos en los cuadros rápidos).
export function ik2(a: V, target: V, l1: number, l2: number, bend: number, stretch = 1): { mid: V, end: V } {
  const d = vsub(target, a);
  let dist = vlen(d);
  const maxL = (l1 + l2) * stretch;
  let s = 1;
  if (dist > l1 + l2) { s = Math.min(dist, maxL) / (l1 + l2); }
  const L1 = l1 * s, L2 = l2 * s;
  dist = clamp(dist, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const dir = vnorm(d);
  const cosA = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const ang = Math.acos(clamp(cosA, -1, 1)) * bend;
  const m = vadd(a, vscale(vrot(dir, ang), L1));
  const end = vadd(a, vscale(dir, dist));
  return { mid: m, end };
}

// Contorno de un miembro de una sola pieza que pasa por las articulaciones `j` con anchos a cada lado.
// `wl`/`wr`: anchos por articulación (izquierda/derecha de la marcha); entre medio interpola suave.
export function limb(j: V[], wl: number[], wr: number[], per = 7, bulge?: (t: number, side: number) => number): V[] {
  const c = spline(j, false, per);
  const segs = j.length - 1;
  return taper(c, (t, side) => {
    const x = t * segs, i = Math.min(segs - 1, Math.floor(x)), f = smooth(x - i);
    const arr = side > 0 ? wl : wr;
    return lerp(arr[i], arr[i + 1], f) + (bulge ? bulge(t, side) : 0);
  });
}

// Medialuna / arco relleno (para smears dibujados en el sprite)
export function crescent(c: V, r: number, a0: number, a1: number, th: (t: number) => number, n = 28): V[] {
  const outer: V[] = [], inner: V[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = lerp(a0, a1, t), w = th(t);
    outer.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    inner.push([c[0] + Math.cos(a) * (r - w), c[1] + Math.sin(a) * (r - w)]);
  }
  return outer.concat(inner.reverse());
}

export function bounds(pts: V[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return [x0, y0, x1, y1];
}
