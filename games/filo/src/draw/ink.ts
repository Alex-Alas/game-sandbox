// El entintador: dibuja un personaje como lo haría un ilustrador, no como figuras apiladas.
//  1. Contorno global: todas las piezas se trazan gruesas en tinta ANTES de rellenar → una sola
//     silueta continua (la unión), más gruesa del lado de la sombra.
//  2. Cada pieza, en orden: relleno, sombra propia (la pieza menos una copia corrida hacia la luz:
//     la medialuna sigue la forma), oclusión, luz de borde fría del lado oscuro y filo de luz del
//     lado iluminado, detalles pintados y una línea interior fina (solo se ve donde tapa a otra).
//  3. Lo que brilla (ojos, brasas, filo) se pinta además en el lienzo de brillo → bloom HDR.
import { type V, pathOf, taper, spline, brush, hash } from './curves.ts';

export interface Part {
  pts: V[];             // polígono denso (unidades del sprite)
  z: number;
  fill: string;
  shade?: string; shadeW?: number;   // sombra propia
  deep?: string; deepW?: number;     // oclusión (más adentro)
  rim?: string; rimW?: number;       // luz rebotada/de contraluz en el borde oscuro
  hl?: string; hlW?: number;         // filo de luz del lado iluminado
  line?: number;        // línea interior (0 = sin)
  hatch?: number;       // rayado de tinta en la sombra (separación en unidades; 0 = sin)
  hatchL?: number;      // largo del rayado (por defecto ~ el ancho de la sombra)
  hatchC?: string;
  outline?: boolean;    // entra en el contorno global (por defecto sí)
  olw?: number;         // grosor propio del contorno (por defecto el global)
  deco?: (c: CanvasRenderingContext2D) => void;   // detalles recortados a la pieza
  after?: (c: CanvasRenderingContext2D) => void;  // detalles encima, sin recorte
  glow?: string;        // pinta la pieza en el lienzo de brillo
  glowDraw?: (g: CanvasRenderingContext2D) => void;
  alpha?: number;
}

export interface InkStyle {
  ink: string;
  seed?: number;
  ol: number;          // medio grosor del contorno exterior
  olShadow: number;    // cuánto más gruesa del lado de la sombra
  light: V;            // dirección HACIA la luz principal (y hacia abajo), unitaria
  flat?: boolean;      // modo «vector crudo»: sin sombras ni contorno (para la comparación)
  rimC?: string;       // color de la luz de contraluz en el borde de la silueta
  rimW?: number;
}

const BIG = 1e5;
function shiftedMinus(c: CanvasRenderingContext2D, p: Path2D, dx: number, dy: number, color: string) {
  // rellena (pieza ∩ ¬ pieza corrida) con el recorte ya puesto
  const q = new Path2D();
  q.rect(-BIG, -BIG, 2 * BIG, 2 * BIG);
  q.addPath(p, new DOMMatrix([1, 0, 0, 1, dx, dy]));
  c.fillStyle = color;
  c.fill(q, 'evenodd');
}

export function paint(c: CanvasRenderingContext2D, parts: Part[], st: InkStyle, g?: CanvasRenderingContext2D | null) {
  const list = parts.slice().sort((a, b) => a.z - b.z);
  const paths = list.map((p) => pathOf(p.pts));
  const [lx, ly] = st.light;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (!st.flat) {
    // 1. contorno global (la sombra lo engorda corriéndolo hacia el lado oscuro)
    c.fillStyle = c.strokeStyle = st.ink;
    for (let pass = 0; pass < 2; pass++) {
      c.save();
      if (pass === 1) c.translate(-lx * st.olShadow, -ly * st.olShadow);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.outline === false) continue;
        c.globalAlpha = p.alpha ?? 1;
        c.lineWidth = 2 * (p.olw ?? st.ol);
        c.stroke(paths[i]);
        c.fill(paths[i]);
      }
      c.restore();
    }
    c.globalAlpha = 1;
  }
  // 2. piezas
  for (let i = 0; i < list.length; i++) {
    const p = list[i], path = paths[i];
    c.globalAlpha = p.alpha ?? 1;
    c.fillStyle = p.fill;
    c.fill(path);
    if (!st.flat) {
      c.save();
      c.clip(path);
      if (p.shade) shiftedMinus(c, path, lx * (p.shadeW ?? 3), ly * (p.shadeW ?? 3), p.shade);
      if (p.deep) shiftedMinus(c, path, lx * (p.deepW ?? 6), ly * (p.deepW ?? 6), p.deep);
      if (p.hatch) hatch(c, p, st, i);
      if (p.deco) p.deco(c);
      if (p.rim && !st.rimC) shiftedMinus(c, path, lx * (p.rimW ?? 0.8), ly * (p.rimW ?? 0.8), p.rim);
      if (p.hl) shiftedMinus(c, path, -lx * (p.hlW ?? 0.8), -ly * (p.hlW ?? 0.8), p.hl);
      c.restore();
      if (p.line) {
        c.strokeStyle = st.ink;
        c.lineWidth = p.line;
        c.stroke(path);
      }
    }
    if (p.after) { c.save(); p.after(c); c.restore(); }
    if (g && (p.glow || p.glowDraw)) {
      g.globalAlpha = p.alpha ?? 1;
      if (p.glow) { g.fillStyle = p.glow; g.fill(path); }
      if (p.glowDraw) { g.save(); p.glowDraw(g); g.restore(); }
    } else if (g) {
      // lo que no brilla tapa el brillo de lo que quedó detrás
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = p.alpha ?? 1;
      g.fill(path);
      g.restore();
    }
  }
  c.globalAlpha = 1;
  if (g) g.globalAlpha = 1;
  // 3. luz de contraluz: solo en el borde exterior de la silueta, del lado oscuro (aclara sin matar el color)
  if (!st.flat && st.rimC) {
    const sc = scratch(c.canvas.width, c.canvas.height);
    const x = sc.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, sc.width, sc.height);
    x.setTransform(c.getTransform());
    // máscara opaca: con un color translúcido, destination-out solo borra en parte y queda un velo
    x.fillStyle = '#fff';
    // unión pintando pieza por pieza (un solo Path2D con sentidos de giro mezclados deja huecos)
    for (let i = 0; i < list.length; i++) if (list[i].outline !== false) x.fill(paths[i]);
    x.globalCompositeOperation = 'destination-out';
    x.translate(lx * (st.rimW ?? 1), ly * (st.rimW ?? 1));
    for (let i = 0; i < list.length; i++) if (list[i].outline !== false) x.fill(paths[i]);
    // y recién ahí el color (con su alfa parejo en todo el borde)
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = st.rimC;
    x.fillRect(0, 0, sc.width, sc.height);
    x.globalCompositeOperation = 'source-over';
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'screen';
    c.drawImage(sc, 0, 0);
    c.restore();
  }
}

let scr: HTMLCanvasElement | null = null;
function scratch(w: number, h: number) {
  if (!scr) scr = document.createElement('canvas');
  if (scr.width < w || scr.height < h) { scr.width = Math.max(w, scr.width); scr.height = Math.max(h, scr.height); }
  return scr;
}

// Trazo de pincel (relleno) a lo largo de una curva: para pliegues, marcas y líneas interiores
export function stroke(c: CanvasRenderingContext2D, pts: V[], w0: number, w1: number, color: string, peak = 0.25, per = 5) {
  if (pts.length < 2) return;
  const s = pts.length > 2 ? spline(pts, false, per) : pts;
  const f = brush(w0, w1, peak);
  const poly = taper(s, (t) => f(t) * 0.5);
  c.fillStyle = color;
  c.fill(pathOf(poly));
}

// Rayado a la Hades: trazos que nacen en el borde oscuro y se afinan hacia la luz
function hatch(c: CanvasRenderingContext2D, p: Part, st: InkStyle, salt: number) {
  const [lx, ly] = st.light;
  const ang = 0.35, ca = Math.cos(ang), sa = Math.sin(ang);
  const dx = lx * ca - ly * sa, dy = lx * sa + ly * ca;       // hacia la luz, algo girado
  const nx = -dy, ny = dx;
  const pts = p.pts;
  let mn = Infinity, mx = -Infinity, cx = 0, cy = 0;
  for (const q of pts) { const d = q[0] * nx + q[1] * ny; if (d < mn) mn = d; if (d > mx) mx = d; cx += q[0]; cy += q[1]; }
  cx /= pts.length; cy /= pts.length;
  const sp = p.hatch!, len = p.hatchL ?? (p.shadeW ?? 3) * 1.3;
  c.fillStyle = p.hatchC ?? st.ink;
  const seed = (st as InkStyle & { seed?: number }).seed ?? 0;
  for (let k = Math.ceil(mn / sp) * sp, i = 0; k <= mx; k += sp, i++) {
    const r = hash(i, salt, seed);
    // la recta: punto base sobre la normal + dirección (dx, dy)
    const bx = cx + nx * (k - (cx * nx + cy * ny)), by = cy + ny * (k - (cx * nx + cy * ny));
    // primera intersección con el contorno viniendo desde el lado oscuro
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      const a = pts[j], b = pts[(j + 1) % pts.length];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - bx) * ey - (a[1] - by) * ex) / den;
      const u = ((a[0] - bx) * dy - (a[1] - by) * dx) / den;
      if (u >= 0 && u <= 1 && t < best) best = t;
    }
    if (!isFinite(best)) continue;
    const L = len * (0.55 + 0.6 * r), w = 0.55 + 0.35 * hash(i, salt + 3, seed);
    const sx = bx + dx * (best - 0.4), sy = by + dy * (best - 0.4);
    const ex = sx + dx * L, ey = sy + dy * L;
    // trazo afinado (triángulo alargado con base redondeada)
    c.beginPath();
    c.moveTo(sx + nx * w, sy + ny * w);
    c.quadraticCurveTo(sx + dx * L * 0.5 + nx * w * 0.6, sy + dy * L * 0.5 + ny * w * 0.6, ex, ey);
    c.quadraticCurveTo(sx + dx * L * 0.5 - nx * w * 0.6, sy + dy * L * 0.5 - ny * w * 0.6, sx - nx * w, sy - ny * w);
    c.closePath();
    c.fill();
  }
}
