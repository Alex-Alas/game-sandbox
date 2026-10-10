// El logo: «FILO» escrito con pinceladas y cortado en diagonal por un tajo (la mitad de arriba se
// corre sobre el corte, como si la hoja acabara de pasar).
import { type V, spline, taper, brush, pathOf, mulberry, lerp } from '../draw/curves.ts';

function strokeTo(c: CanvasRenderingContext2D, pts: V[], w0: number, w1: number, peak = 0.12) {
  const s = spline(pts, false, 10);
  const f = brush(w0, w1, peak);
  c.fill(pathOf(taper(s, (t) => f(t) * 0.5)));
}

export function drawLogo(cv: HTMLCanvasElement, scale = 1) {
  const W = 300, H = 92;
  cv.width = W * scale * 2; cv.height = H * scale * 2;
  const c = cv.getContext('2d')!;
  c.setTransform(scale * 2, 0, 0, scale * 2, 0, 0);
  const rnd = mulberry(7);
  const j = (v: number) => v + (rnd() - 0.5) * 1.2;
  // letras en un lienzo aparte (para cortarlas)
  const L = document.createElement('canvas');
  L.width = cv.width; L.height = cv.height;
  const l = L.getContext('2d')!;
  l.setTransform(scale * 2, 0, 0, scale * 2, 0, 0);
  const letters = (ctx: CanvasRenderingContext2D, dx: number, dy: number) => {
    ctx.save(); ctx.translate(dx, dy);
    // F
    strokeTo(ctx, [[j(24), 16], [j(22), 46], [j(23), 79]], 11, 5);
    strokeTo(ctx, [[18, j(17)], [42, j(14)], [70, j(11)]], 10, 2.5, 0.05);
    strokeTo(ctx, [[22, j(46)], [40, j(44)], [58, j(42)]], 8, 2, 0.05);
    // I
    strokeTo(ctx, [[j(92), 12], [j(90), 46], [j(91), 80]], 11, 4.5);
    // L
    strokeTo(ctx, [[j(122), 13], [j(120), 46], [j(121), 76]], 11, 7);
    strokeTo(ctx, [[118, j(77)], [140, j(77)], [168, j(73)]], 9.5, 2.5, 0.05);
    // O: un trazo que da la vuelta y deja una entrada abierta arriba a la derecha
    const o: V[] = [];
    for (let k = 0; k <= 14; k++) { const a = -0.9 - k / 14 * Math.PI * 1.88; o.push([212 + Math.cos(a) * 27, 46 + Math.sin(a) * 34]); }
    strokeTo(ctx, o, 4, 11, 0.6);
    ctx.restore();
  };
  // sombra de tinta
  l.fillStyle = 'rgba(0,0,0,0.85)';
  letters(l, 2.5, 3.5);
  l.fillStyle = '#efe7d8';
  letters(l, 0, 0);
  // grano de papel dentro de las letras
  l.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 900; i++) {
    l.fillStyle = rnd() < 0.5 ? 'rgba(160,140,120,0.18)' : 'rgba(255,255,255,0.12)';
    l.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 0.6);
  }
  // borde de carmesí en la base de cada letra (como tinta corrida)
  const g = l.createLinearGradient(0, 50, 0, 92);
  g.addColorStop(0, 'rgba(194,42,58,0)'); g.addColorStop(1, 'rgba(194,42,58,0.55)');
  l.fillStyle = g; l.fillRect(0, 0, W, H);
  l.globalCompositeOperation = 'source-over';
  // el tajo: y = a + b·x
  const cut = (x: number) => lerp(70, 26, x / W);
  const half = (top: boolean, dx: number, dy: number) => {
    c.save();
    c.beginPath();
    if (top) { c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, cut(W)); c.lineTo(0, cut(0)); }
    else { c.moveTo(0, cut(0)); c.lineTo(W, cut(W)); c.lineTo(W, H); c.lineTo(0, H); }
    c.closePath(); c.clip();
    c.setTransform(1, 0, 0, 1, dx * scale * 2, dy * scale * 2);
    c.drawImage(L, 0, 0);
    c.restore();
  };
  half(false, 0, 0);
  half(true, 3.5, -2.2);
  // línea del corte: brillo carmesí con alma blanca, que se afina en las puntas
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const [w, col] of [[5, 'rgba(194,42,58,0.35)'], [2.4, 'rgba(255,120,110,0.8)'], [0.9, 'rgba(255,245,235,1)']] as [number, string][]) {
    c.fillStyle = col;
    const s: V[] = []; for (let k = 0; k <= 20; k++) { const x = 4 + k / 20 * (W - 8); s.push([x, cut(x) + 0.5]); }
    c.fill(pathOf(taper(s, (t) => w * Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.5 + 0.05)));
  }
  c.restore();
}
