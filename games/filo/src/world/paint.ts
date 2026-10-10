// Pintura procedural de escenarios en Canvas 2D: siluetas con borde áspero (ruido sobre la normal),
// textura de pincel seco recortada a la forma, luz de borde del lado del sol y degradés de bruma.
// Coordenadas de mundo con y hacia arriba (el lienzo se transforma).
import { type V, fbm, noise1, mulberry, spline, taper, pathOf, lerp, vnorm, vsub, perp, smooth, clamp } from '../draw/curves.ts';

export type RGB = [number, number, number];
export const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scl = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

export class Paint {
  cv: HTMLCanvasElement; c: CanvasRenderingContext2D;
  x0: number; y0: number; x1: number; y1: number; d: number;
  rnd: () => number;
  constructor(x0: number, y0: number, x1: number, y1: number, d: number, seed = 1) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1; this.d = d;
    this.cv = document.createElement('canvas');
    this.cv.width = Math.ceil((x1 - x0) * d);
    this.cv.height = Math.ceil((y1 - y0) * d);
    this.c = this.cv.getContext('2d', { willReadFrequently: true })!; // en CPU: pintar miles de trazos recortados es más predecible que en la GPU
    this.c.setTransform(d, 0, 0, -d, -x0 * d, y1 * d);
    this.c.lineCap = 'round';
    this.c.lineJoin = 'round';
    this.rnd = mulberry(seed);
  }
  r(a = 0, b = 1) { return a + (b - a) * this.rnd(); }
  rect(): [number, number, number, number] { return [this.x0, this.y0, this.x1, this.y1]; }

  fill(p: Path2D | V[], color: string) { this.c.fillStyle = color; this.c.fill(Array.isArray(p) ? pathOf(p) : p); }

  // Recorta a la forma y pinta adentro
  inside(p: Path2D, f: () => void) { const c = this.c; c.save(); c.clip(p); f(); c.restore(); }

  // Banda iluminada: forma menos la forma corrida en contra de la luz
  rim(p: Path2D, lx: number, ly: number, w: number, color: string) {
    const c = this.c;
    c.save(); c.clip(p);
    const q = new Path2D();
    q.rect(this.x0 - 10, this.y0 - 10, this.x1 - this.x0 + 20, this.y1 - this.y0 + 20);
    q.addPath(p, new DOMMatrix([1, 0, 0, 1, -lx * w, -ly * w]));
    c.fillStyle = color;
    c.fill(q, 'evenodd');
    c.restore();
  }

  // Pincel seco: muchos trazos cortos semitransparentes en una dirección, con variación de color
  brush(p: Path2D, box: [number, number, number, number], n: number, colors: string[], dir: number, len: [number, number], w: [number, number], alpha = 0.25, jitter = 0.4) {
    const c = this.c;
    c.save(); c.clip(p);
    for (let i = 0; i < n; i++) {
      const x = this.r(box[0], box[2]), y = this.r(box[1], box[3]);
      const a = dir + this.r(-jitter, jitter), L = this.r(len[0], len[1]);
      c.strokeStyle = colors[(this.rnd() * colors.length) | 0];
      c.globalAlpha = alpha * this.r(0.4, 1);
      c.lineWidth = this.r(w[0], w[1]);
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + this.r(-1, 1) * L * 0.1, y + Math.sin(a) * L * 0.5 + this.r(-1, 1) * L * 0.1, x + Math.cos(a) * L, y + Math.sin(a) * L);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.restore();
  }

  // Degradé vertical recortado a la forma (bruma de abajo, luz de arriba)
  vgrad(p: Path2D, yA: number, yB: number, cA: string, cB: string) {
    const c = this.c;
    const g = c.createLinearGradient(0, yA, 0, yB);
    g.addColorStop(0, cA); g.addColorStop(1, cB);
    c.save(); c.clip(p); c.fillStyle = g; c.fillRect(this.x0, this.y0, this.x1 - this.x0, this.y1 - this.y0); c.restore();
  }

  // Trazo afinado (rama, enredadera, cadena)
  stroke(pts: V[], w0: number, w1: number, color: string, per = 6) {
    const s = pts.length > 2 ? spline(pts, false, per) : pts;
    const poly = taper(s, (t) => lerp(w0, w1, t) * 0.5);
    this.c.fillStyle = color;
    this.c.fill(pathOf(poly));
    return poly;
  }

  glowDot(x: number, y: number, r: number, color: RGB, a = 1) {
    const c = this.c;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(color, a)); g.addColorStop(0.35, rgb(color, a * 0.45)); g.addColorStop(1, rgb(color, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// Polígono con borde áspero: re-muestrea cada lado y lo corre sobre la normal con ruido
export function rough(pts: V[], amp: number, freq: number, seed: number, step = 2, closed = true): V[] {
  const out: V[] = [];
  const n = pts.length, segs = closed ? n : n - 1;
  let s = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(L / step));
    const nn = vnorm(perp(vsub(b, a)));
    for (let j = 0; j < k; j++) {
      const t = j / k, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t);
      const e = fbm(s * freq, seed * 1.37, 3, seed) * amp + noise1(s * freq * 7, seed + 9) * amp * 0.25;
      out.push([x + nn[0] * e, y + nn[1] * e]);
      s += L / k;
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// Contorno de cima: una línea de horizonte ondulada de x0 a x1 (para colinas, pasto, suelo)
export function ridge(x0: number, x1: number, base: number, amp: number, freq: number, seed: number, step = 2): V[] {
  const out: V[] = [];
  for (let x = x0; x <= x1; x += step) out.push([x, base + fbm(x * freq, 0.5, 4, seed) * amp]);
  return out;
}

export { smooth, clamp, spline, taper, pathOf, lerp, vnorm, vsub, perp };
