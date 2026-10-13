// El marco común de los retratos: fondo de pizarra con viñeta, un engranaje lejano, el halo del brillo (bloom) y el
// borde de tinta con esquinas de latón. Unidades del dibujo: 100 de ancho × 122 de alto (se escala al lienzo).
import { paint, type Part, type InkStyle } from './ink.ts';
import type { V } from './curves.ts';

export const UW = 100, UH = 122;
export const LIGHT: V = [-0.55, -0.83];   // hacia la luz (arriba a la izquierda), en coordenadas del lienzo

export function card(cv: HTMLCanvasElement, parts: Part[], o: { bg: [string, string], glow: string, glowAt: V, gear?: V, seed: number, after?: (c: CanvasRenderingContext2D, s: number) => void }) {
  const W = cv.width, H = cv.height, s = W / UW;
  const c = cv.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  // fondo
  const g = c.createRadialGradient(W * 0.45, H * 0.35, 10, W * 0.5, H * 0.5, H * 0.75);
  g.addColorStop(0, o.bg[0]); g.addColorStop(1, o.bg[1]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // engranaje lejano (silueta apenas más clara)
  if (o.gear) {
    c.save(); c.translate(o.gear[0] * s, o.gear[1] * s);
    c.fillStyle = 'rgba(94, 84, 104, 0.35)';
    c.beginPath();
    const R = 46 * s, n = 14;
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? R : R * 1.12; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(0, 0, R * 0.55, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // halo del brillo detrás de la figura
  const hg = c.createRadialGradient(o.glowAt[0] * s, o.glowAt[1] * s, 0, o.glowAt[0] * s, o.glowAt[1] * s, 42 * s);
  hg.addColorStop(0, o.glow + '55'); hg.addColorStop(1, o.glow + '00');
  c.fillStyle = hg; c.fillRect(0, 0, W, H);
  // la figura
  const glowCv = document.createElement('canvas'); glowCv.width = W; glowCv.height = H;
  const gc = glowCv.getContext('2d')!;
  c.setTransform(s, 0, 0, s, 0, 0); gc.setTransform(s, 0, 0, s, 0, 0);
  const st: InkStyle = { ink: '#1b1420', seed: o.seed, ol: 0.55, olShadow: 0.5, light: LIGHT, rimC: '#7f9ab8', rimW: 0.9 };
  paint(c, parts, st, gc);
  o.after?.(c, s);
  // bloom: el lienzo de brillo desenfocado y sumado
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.filter = `blur(${Math.round(9 * s / 9)}px)`;
  c.globalAlpha = 0.9; c.drawImage(glowCv, 0, 0);
  c.filter = `blur(${Math.round(28 * s / 9)}px)`;
  c.globalAlpha = 0.7; c.drawImage(glowCv, 0, 0);
  c.restore();
  // viñeta y grano de papel
  const v = c.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.5, H * 0.75);
  v.addColorStop(0, 'rgba(13,11,18,0)'); v.addColorStop(1, 'rgba(13,11,18,0.75)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  const img = c.getImageData(0, 0, W, H), d = img.data;
  let r = o.seed * 9301 + 49297;
  for (let i = 0; i < d.length; i += 4) { r = (r * 9301 + 49297) % 233280; const n = (r / 233280 - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
  // borde de tinta con esquinas de latón
  c.strokeStyle = '#1b1420'; c.lineWidth = 3 * s; c.strokeRect(1.5 * s, 1.5 * s, W - 3 * s, H - 3 * s);
  c.strokeStyle = '#583e20'; c.lineWidth = 0.6 * s; c.strokeRect(3.2 * s, 3.2 * s, W - 6.4 * s, H - 6.4 * s);
  c.fillStyle = '#b88e44';
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
    c.fillRect(-4 * s, -4 * s, 8 * s, 8 * s);
    c.fillStyle = '#583e20'; c.fillRect(-1.5 * s, -1.5 * s, 3 * s, 3 * s); c.fillStyle = '#b88e44';
    c.restore();
  }
}
