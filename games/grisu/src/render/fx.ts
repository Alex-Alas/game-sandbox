// Efectos en píxel (GDD §13.3): se rasterizan a mano sobre un búfer del tamaño del lienzo interno (pixel.ts lo
// sube como textura y lo compone antes del brillo y la paleta). Nada de transparencias: lo que se desvanece se
// desvanece por tramado (Bayer 4×4), como en el pixel art. Alfa del búfer: 0 vacío, 204 sólido, 255 sólido que brilla.
//  - smears: medialunas sólidas de 2–3 colores (núcleo blanco, el color de la escuela, borde de tinta) que llegan de
//    golpe en un solo cuadro;
//  - chispas (rayitas en la dirección de la velocidad), brasas y destellos de 1–3 px;
//  - polvo de caricatura: bolas con contorno de tinta que se funden en una nube;
//  - anillos y ondas de choque de 1 px; estallidos de grisú de 3–4 colores con borde mordido;
//  - estelas de las mecánicas en el color de su escuela.
// Todo vive en el plano del mundo (metros) y se proyecta con la cámara anclada: los efectos caen en la misma grilla
// de píxeles que el resto.
import * as THREE from 'three';
import { EMIT, INK, srgb } from './palette.ts';

export type Rgb = [number, number, number];
const toRgb = (c: string): Rgb => { const s = srgb(c); return [Math.round(s[0] * 255), Math.round(s[1] * 255), Math.round(s[2] * 255)]; };
export const C = {
  ink: toRgb(INK), white: toRgb('#ffffff'), dust: toRgb('#9a8c92'), dustS: toRgb('#5e5468'), smoke: toRgb('#4a4358'), smokeL: toRgb('#7c7080'),
  steam: toRgb('#d6cfbd'), steamS: toRgb('#9a8c92'),
  red: toRgb(EMIT.peligro[1]), redC: toRgb(EMIT.peligro[0]), redD: toRgb(EMIT.peligro[2]),
  fire: toRgb(EMIT.piro[1]), fireC: toRgb(EMIT.piro[0]), fireD: toRgb(EMIT.piro[2]),
  gas: toRgb(EMIT.grisu[1]), gasC: toRgb(EMIT.grisu[0]),
  brass: toRgb('#b88e44'), brassH: toRgb('#f3d27e'), brassD: toRgb('#583e20'),
};
export const schoolRgb = (k: keyof typeof EMIT): [Rgb, Rgb, Rgb] => [toRgb(EMIT[k][0]), toRgb(EMIT[k][1]), toRgb(EMIT[k][2])];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (BAYER[(x & 3) + (y & 3) * 4] + 0.5) / 16;

// un búfer de píxeles con y hacia arriba (fila 0 abajo, como la textura)
export class Raster {
  d: Uint8Array = new Uint8Array(4); w = 1; h = 1;
  set(d: Uint8Array, w: number, h: number) { this.d = d; this.w = w; this.h = h; d.fill(0); }
  px(x: number, y: number, c: Rgb, glow = false, a = 1) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (a < 1 && bay(x, y) >= a) return;
    const o = (y * this.w + x) * 4;
    this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = glow ? 255 : 204;
  }
  disc(cx: number, cy: number, r: number, c: Rgb, glow = false, a = 1, bite = 0, seed = 0) {
    const R = Math.ceil(r + 1);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      let rr = r;
      if (bite > 0) { const ang = Math.atan2(y, x); rr = r * (1 - bite * (0.5 + 0.5 * Math.sin(ang * 5 + seed) * Math.sin(ang * 3 - seed * 1.7))); }
      if (x * x + y * y <= rr * rr + 0.3) this.px(Math.round(cx) + x, Math.round(cy) + y, c, glow, a);
    }
  }
  ring(cx: number, cy: number, r: number, c: Rgb, glow = false, a = 1, t = 1) {
    const R = Math.ceil(r + t + 1);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y);
      if (d <= r + t * 0.5 && d > r - t * 0.5) this.px(Math.round(cx) + x, Math.round(cy) + y, c, glow, a);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Rgb, glow = false, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, n = 0;
    for (;;) {
      this.px(x0, y0, c, glow, a);
      if ((x0 === x1 && y0 === y1) || n++ > 400) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  // polígono por barrido (par-impar), en píxeles
  poly(pts: number[][], c: Rgb, glow = false, a = 1) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(this.h - 1, Math.ceil(y1));
    const xs: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a0 = pts[i], b0 = pts[j];
        if ((a0[1] > yc) !== (b0[1] > yc)) xs.push(a0[0] + ((yc - a0[1]) / (b0[1] - a0[1])) * (b0[0] - a0[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.px(x, y, c, glow, a);
    }
  }
}

type Part = {
  k: 'spark' | 'ember' | 'dust' | 'smoke' | 'steam' | 'chip' | 'glint' | 'bubble';
  x: number; y: number; z: number; vx: number; vy: number; t: number; life: number; r: number; g: number; drag: number;
  c: Rgb; c2?: Rgb; glow: boolean;
};
type Burst = { k: 'ring' | 'flash' | 'boom' | 'star' | 'wave'; x: number; y: number; z: number; t: number; life: number; r: number; c: Rgb; c2: Rgb; c3: Rgb; seed: number };
type Smear = { pts: number[][]; inner: number[][]; t: number; life: number; c: [Rgb, Rgb, Rgb] };
type Trail = { pts: { x: number; y: number; z: number; t: number }[]; c: [Rgb, Rgb, Rgb]; life: number; w: number };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const V = new THREE.Vector3(), W = new THREE.Vector3();

export class Fx {
  R = new Raster();
  parts: Part[] = [];
  bursts: Burst[] = [];
  smears: Smear[] = [];
  trails: Trail[] = [];
  scale = 1;           // multiplicador de la cantidad de partículas (calidad)
  ground = 0;          // y del suelo (las partículas rebotan / se apoyan)

  update(dt: number) {
    for (const p of this.parts) {
      p.t += dt;
      p.vy -= p.g * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < this.ground && (p.k === 'spark' || p.k === 'chip' || p.k === 'ember')) { p.y = this.ground; p.vy = -p.vy * 0.35; p.vx *= 0.6; }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const b of this.bursts) b.t += dt;
    this.bursts = this.bursts.filter((b) => b.t < b.life);
    for (const s of this.smears) s.t += dt;
    this.smears = this.smears.filter((s) => s.t < s.life);
    for (const tr of this.trails) for (const q of tr.pts) q.t += dt;
    for (const tr of this.trails) tr.pts = tr.pts.filter((q) => q.t < tr.life);
    this.trails = this.trails.filter((tr) => tr.pts.length > 0);
  }

  // ------- emisores (coordenadas del mundo, metros) -------
  sparks(x: number, y: number, n: number, dir = 0, spread = Math.PI, speed = 9, c: Rgb = C.white, c2: Rgb = C.brassH, z = 0.3) {
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) {
      const a = dir + rnd(-spread, spread) * 0.5, v = speed * rnd(0.4, 1.2);
      this.parts.push({ k: 'spark', x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.15, 0.4), r: 1, g: 18, drag: 3, c, c2, glow: true });
    }
  }
  embers(x: number, y: number, n: number, c: Rgb = C.fire, c2: Rgb = C.fireC, up = 2, z = 0.3, spread = 0.6) {
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) this.parts.push({ k: 'ember', x: x + rnd(-spread, spread), y: y + rnd(-spread, spread), z, vx: rnd(-1, 1), vy: rnd(0.5, 1) * up, t: 0, life: rnd(0.5, 1.2), r: 1, g: -1.5, drag: 1.5, c, c2, glow: true });
  }
  dust(x: number, y: number, n: number, dir = 0, speed = 2.5, big = 1, z = 0.4) {
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) {
      const s = i / Math.max(1, n - 1) - 0.5;
      this.parts.push({ k: 'dust', x: x + s * 0.4, y: y + rnd(0, 0.15), z, vx: (dir === 0 ? Math.sign(s || 1) : dir) * speed * rnd(0.5, 1.1), vy: rnd(0.3, 1.4), t: 0, life: rnd(0.35, 0.6), r: rnd(0.12, 0.22) * big, g: 0, drag: 6, c: C.dust, c2: C.dustS, glow: false });
    }
  }
  smoke(x: number, y: number, n: number, z = 0.2, c: Rgb = C.smoke, c2: Rgb = C.smokeL, big = 1) {
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) this.parts.push({ k: 'smoke', x: x + rnd(-0.4, 0.4), y: y + rnd(-0.3, 0.3), z, vx: rnd(-1, 1), vy: rnd(0.8, 2), t: 0, life: rnd(0.6, 1.1), r: rnd(0.25, 0.45) * big, g: -0.5, drag: 2, c, c2, glow: false });
  }
  steam(x: number, y: number, n: number, vx = 0, vy = 5, z = 0) {
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) this.parts.push({ k: 'steam', x: x + rnd(-0.1, 0.1), y, z, vx: vx + rnd(-0.6, 0.6), vy: vy * rnd(0.7, 1.1), t: 0, life: rnd(0.7, 1.2), r: rnd(0.1, 0.18), g: -0.6, drag: 1.6, c: C.steam, c2: C.steamS, glow: false });
  }
  chips(x: number, y: number, n: number, c: Rgb = C.brass, c2: Rgb = C.brassD, speed = 6, z = 0.3) {
    n = Math.round(n * this.scale);
    for (let i = 0; i < n; i++) { const a = rnd(0.2, Math.PI - 0.2); this.parts.push({ k: 'chip', x, y, z, vx: Math.cos(a) * speed * rnd(0.3, 1), vy: Math.sin(a) * speed * rnd(0.5, 1.2), t: 0, life: rnd(0.6, 1.1), r: 1, g: 22, drag: 0.6, c, c2, glow: false }); }
  }
  bubbles(x: number, y: number, n: number, z = 0) {
    for (let i = 0; i < n; i++) this.parts.push({ k: 'bubble', x: x + rnd(-0.5, 0.5), y: y + rnd(-0.3, 0.3), z, vx: rnd(-0.2, 0.2), vy: rnd(0.4, 0.9), t: 0, life: rnd(0.8, 1.5), r: 1, g: 0, drag: 0.5, c: C.gasC, c2: C.gas, glow: true });
  }
  ring(x: number, y: number, r: number, life = 0.25, c: Rgb = C.white, z = 0.3) { this.bursts.push({ k: 'ring', x, y, z, t: 0, life, r, c, c2: c, c3: c, seed: 0 }); }
  wave(x: number, y: number, r: number, life = 0.35, c: Rgb = C.dust, z = 0.3) { this.bursts.push({ k: 'wave', x, y, z, t: 0, life, r, c, c2: c, c3: c, seed: 0 }); }
  flash(x: number, y: number, r: number, life = 0.08, c: Rgb = C.white, z = 0.3) { this.bursts.push({ k: 'flash', x, y, z, t: 0, life, r, c, c2: c, c3: c, seed: 0 }); }
  star(x: number, y: number, r: number, life = 0.35, c: Rgb = C.white, z = 0.5) { this.bursts.push({ k: 'star', x, y, z, t: 0, life, r, c, c2: c, c3: c, seed: 0 }); }
  boom(x: number, y: number, r: number, life = 0.55, z = 0.2, cols: [Rgb, Rgb, Rgb] = [C.fireC, C.fire, C.fireD]) {
    this.bursts.push({ k: 'boom', x, y, z, t: 0, life, r, c: cols[0], c2: cols[1], c3: cols[2], seed: Math.random() * 10 });
  }
  // medialuna del arma: centro (metros), radio, ángulos (rad, en el plano xy), grosor máximo
  smear(cx: number, cy: number, cz: number, r: number, a0: number, a1: number, w: number, c: [Rgb, Rgb, Rgb], life = 1 / 12 + 0.01) {
    const N = 18, pts: number[][] = [], inner: number[][] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = a0 + (a1 - a0) * u;
      const th = w * Math.sin(Math.PI * Math.pow(u, 0.7)) ;  // grueso hacia el final del barrido
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz]);
      inner.push([cx + Math.cos(a) * (r - th), cy + Math.sin(a) * (r - th), cz]);
    }
    this.smears.push({ pts, inner, t: 0, life, c });
  }
  // línea de velocidad sólida: fina en la cola (x0) y gruesa en la cabeza (x1)
  streak(x0: number, y0: number, x1: number, y1: number, z: number, w: number, c: [Rgb, Rgb, Rgb], life = 1 / 12 + 0.01) {
    const N = 8, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const pts: number[][] = [], inner: number[][] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, th = w * 0.5 * Math.pow(u, 0.6) * (i === N ? 0.6 : 1);
      pts.push([x0 + dx * u + nx * th, y0 + dy * u + ny * th, z]);
      inner.push([x0 + dx * u - nx * th, y0 + dy * u - ny * th, z]);
    }
    this.smears.push({ pts, inner, t: 0, life, c });
  }
  trail(tr: Trail) { this.trails.push(tr); return tr; }

  // ------- dibujo -------
  draw(d: Uint8Array, w: number, h: number, project: (x: number, y: number, z: number) => THREE.Vector3, ppm: number) {
    const R = this.R;
    R.set(d, w, h);
    const P = (x: number, y: number, z: number) => { const v = project(x, y, z); return [v.x, v.y]; };
    // estelas: en tres pasadas (tinta, color, núcleo) así un tramo no tapa el color del anterior
    for (let pass = 0; pass < 3; pass++) for (const tr of this.trails) {
      const n = tr.pts.length;
      for (let i = 1; i < n; i++) {
        const a = tr.pts[i - 1], b = tr.pts[i];
        const u = 1 - b.t / tr.life;
        const pa = P(a.x, a.y, a.z), pb = P(b.x, b.y, b.z);
        const th = Math.max(0.6, tr.w * ppm * Math.sqrt(u));
        const steps = Math.max(1, Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1])));
        for (let st = 0; st <= steps; st++) {
          const x = pa[0] + (pb[0] - pa[0]) * (st / steps), y = pa[1] + (pb[1] - pa[1]) * (st / steps);
          if (pass === 0) R.disc(x, y, th + 1, C.ink, false, u * 2.2);
          else if (pass === 1) R.disc(x, y, th, tr.c[1], true, u * 2.4);
          else if (th > 1.2) R.disc(x, y, th * 0.4, tr.c[0], true, u * 2.6);
        }
      }
    }
    // partículas
    for (const p of this.parts) {
      const u = p.t / p.life, [x, y] = P(p.x, p.y, p.z);
      switch (p.k) {
        case 'spark': {
          const [x2, y2] = P(p.x - p.vx * 0.025, p.y - p.vy * 0.025, p.z);
          R.line(x, y, x2, y2, u < 0.5 ? p.c : p.c2!, true);
          break;
        }
        case 'ember': R.px(x, y, u < 0.6 ? p.c2! : p.c, true, 1.4 - u); break;
        case 'glint': R.px(x, y, p.c, true); break;
        case 'chip': R.px(x, y, p.c, false); R.px(x + 1, y, p.c2!, false); break;
        case 'bubble': R.ring(x, y, 1.2, p.c, true, 1.3 - u); break;
        case 'steam': {
          // vapor: bocanadas claras con borde gris (sin tinta), que se abren y se traman al irse
          const r = p.r * ppm * (0.7 + u * 1.6);
          R.disc(x, y, r + 1, p.c2!, false, 1.1 - u);
          R.disc(x - r * 0.2, y + r * 0.25, r * 0.8, p.c, false, 1.1 - u * 1.2);
          break;
        }
        case 'dust': case 'smoke': {
          const r = p.r * ppm * (0.6 + u * 0.9);
          R.disc(x, y, r + 1, C.ink, false, 1.25 - u);
          R.disc(x, y, r, p.c2!, false, 1.25 - u);
          R.disc(x - r * 0.25, y + r * 0.3, r * 0.65, p.c, false, 1.25 - u);
          break;
        }
      }
    }
    // estallidos
    for (const b of this.bursts) {
      const u = b.t / b.life, [x, y] = P(b.x, b.y, b.z), r = b.r * ppm;
      if (b.k === 'ring') R.ring(x, y, r * (0.3 + 0.9 * Math.sqrt(u)), b.c, true, 1.3 - u, 1 + (1 - u) * 1.5);
      else if (b.k === 'wave') { R.ring(x, y, r * (0.25 + 0.9 * Math.sqrt(u)), b.c, false, 1.2 - u, 2); }
      else if (b.k === 'flash') { R.disc(x, y, r * (1 - u * 0.4), b.c, true); }
      else if (b.k === 'star') {
        const L = r * (1 - u) * 1.2 + 1;
        R.line(x - L, y, x + L, y, b.c, true); R.line(x, y - L, x, y + L, b.c, true);
        const l2 = L * 0.45; R.line(x - l2, y - l2, x + l2, y + l2, b.c, true, 0.7); R.line(x - l2, y + l2, x + l2, y - l2, b.c, true, 0.7);
        R.disc(x, y, Math.max(1, L * 0.2), b.c, true);
      } else if (b.k === 'boom') {
        // racimo de bocanadas mordidas (tinta, oscuro, color, núcleo) que nacen escalonadas; al final se vuelven humo
        if (u < 0.1) { R.disc(x, y, r * 0.6, C.white, true, 1, 0.3, b.seed); continue; }
        for (let i = 0; i < 6; i++) {
          const a = b.seed * 3 + i * 2.4, d = i === 0 ? 0 : r * (0.35 + 0.25 * ((i * 7 + Math.floor(b.seed)) % 3) / 2);
          const ui = Math.max(0, (u - i * 0.03) / (1 - i * 0.03));
          const g = Math.min(1, ui * 3.5), rr = r * (i === 0 ? 0.62 : 0.42) * (0.4 + 0.6 * g);
          const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8 + ui * r * 0.5;
          const fade = ui < 0.45 ? 1.3 : 1.3 - (ui - 0.45) * 2.4;
          if (ui > 0.5) { R.disc(px, py, rr + 1, C.ink, false, fade, 0.3, b.seed + i); R.disc(px, py, rr, ui > 0.7 ? C.smoke : b.c3, ui <= 0.7, fade, 0.3, b.seed + i); continue; }
          R.disc(px, py, rr + 1.5, C.ink, false, fade, 0.28, b.seed + i);
          R.disc(px, py, rr, b.c3, true, fade, 0.28, b.seed + i);
          R.disc(px - rr * 0.1, py + rr * 0.12, rr * 0.72, b.c2, true, fade, 0.3, b.seed + i + 1);
          if (ui < 0.35) R.disc(px - rr * 0.15, py + rr * 0.2, rr * 0.38, b.c, true, 1, 0.35, b.seed + i + 2);
        }
      }
    }
    // smears: borde de tinta, color, núcleo blanco
    for (const s of this.smears) {
      const outer = s.pts.map((p) => P(p[0], p[1], p[2])), inner = s.inner.map((p) => P(p[0], p[1], p[2]));
      const poly = [...outer, ...inner.slice().reverse()];
      // contorno: el polígono corrido un píxel en cada dirección
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) R.poly(poly.map((p) => [p[0] + ox, p[1] + oy]), C.ink, false);
      R.poly(poly, s.c[1], true);
      // núcleo: la mitad exterior del arco
      const mid = outer.map((p, i) => { const q = inner[i]; return [p[0] * 0.62 + q[0] * 0.38, p[1] * 0.62 + q[1] * 0.38]; });
      R.poly([...outer.slice(3), ...mid.slice(3).reverse()], s.c[0], true);
    }
    void V; void W;
  }
}
