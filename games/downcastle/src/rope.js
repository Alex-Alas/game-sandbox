/* Dibujo de un eslabón de cuerda: cadena de partículas Verlet que se apoya en la piedra.
   Las puntas quedan clavadas a los jugadores y cada segmento solo se resiste a estirarse
   (se afloja, nunca empuja), así el estiramiento se reparte parejo. La física de la cuerda
   (sim.js) usa la recta entre los jugadores; esto es solo para verla. */
import { CFG } from './config.js';
import { solidAt } from './level.js';

const T = CFG.TILE;

export function makeLink(ax, ay, bx, by) {
  const n = CFG.ROPE_SEGS;
  const pts = [];
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * (i / n), y = ay + (by - ay) * (i / n);
    pts.push({ x, y, px: x, py: y, lx: x, ly: y });
  }
  return { pts, len: Math.hypot(bx - ax, by - ay) };
}

function collide(lv, p) {
  const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
  if (solidAt(lv, tx, ty)) {
    // Volver por la cara por la que entró (según la última posición libre)
    const x0 = tx * T, y0 = ty * T;
    const faces = [
      [p.lx < x0, p.x - x0, x0 - 0.01, p.y, tx - 1, ty],
      [p.lx > x0 + T, x0 + T - p.x, x0 + T + 0.01, p.y, tx + 1, ty],
      [p.ly < y0, p.y - y0, p.x, y0 - 0.01, tx, ty - 1],
      [p.ly > y0 + T, y0 + T - p.y, p.x, y0 + T + 0.01, tx, ty + 1],
    ];
    let best = null;
    for (const pass of [true, false]) {
      for (const f of faces) {
        if ((pass && !f[0]) || solidAt(lv, f[4], f[5])) continue;
        if (!best || f[1] < best[1]) best = f;
      }
      if (best) break;
    }
    if (!best) { p.x = p.lx; p.y = p.ly; return; }
    p.x = best[2]; p.y = best[3];
    p.px = p.x - (p.x - p.px) * 0.3; p.py = p.y - (p.y - p.py) * 0.3;
  }
  p.lx = p.x; p.ly = p.y;
}

export function stepLink(link, lv, ax, ay, bx, by, dt, guide = [ax, ay, bx, by]) {
  const pts = link.pts, n = pts.length + 1;
  const s = CFG.ROPE_LEN / n;
  const g = CFG.ROPE_GRAV * dt * dt;
  for (const p of pts) {
    const vx = (p.x - p.px) * 0.96, vy = (p.y - p.py) * 0.96;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy + g;
  }
  for (let it = 0; it < 8; it++) {
    const fwd = it % 2 === 0; // alternar el sentido reparte parejo
    for (let k = 0; k < n; k++) {
      const i = fwd ? k : n - 1 - k;
      const aPin = i === 0, bPin = i === n - 1;
      const x0 = aPin ? ax : pts[i - 1].x, y0 = aPin ? ay : pts[i - 1].y;
      const x1 = bPin ? bx : pts[i].x, y1 = bPin ? by : pts[i].y;
      const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
      if (d <= s || d < 1e-6) continue;
      const c = (d - s) / d;
      if (aPin) { pts[i].x -= dx * c; pts[i].y -= dy * c; }
      else if (bPin) { pts[i - 1].x += dx * c; pts[i - 1].y += dy * c; }
      else {
        pts[i - 1].x += dx * c * 0.5; pts[i - 1].y += dy * c * 0.5;
        pts[i].x -= dx * c * 0.5; pts[i].y -= dy * c * 0.5;
      }
    }
    for (const p of pts) collide(lv, p);
  }
  // Si quedó enganchada del otro lado de un piso (mucho más larga que el camino de la
  // física, `guide`: puntos [x0, y0, x1, y1, …]), se suelta hacia ese camino
  const gLen = polyLen(guide);
  link.len = pathLen(link, ax, ay, bx, by);
  if (link.len > gLen * 1.3 + 12) {
    pts.forEach((p, k) => {
      const [gx, gy] = alongPoly(guide, gLen * ((k + 1) / n));
      p.x += (gx - p.x) * 0.35; p.y += (gy - p.y) * 0.35;
      p.lx = p.px = p.x; p.ly = p.py = p.y;
    });
  }
}

function polyLen(g) {
  let len = 0;
  for (let k = 2; k < g.length; k += 2) len += Math.hypot(g[k] - g[k - 2], g[k + 1] - g[k - 1]);
  return len;
}
function alongPoly(g, d) {
  for (let k = 2; k < g.length; k += 2) {
    const seg = Math.hypot(g[k] - g[k - 2], g[k + 1] - g[k - 1]);
    if (d <= seg || k === g.length - 2) {
      const f = seg > 0 ? Math.min(1, d / seg) : 0;
      return [g[k - 2] + (g[k] - g[k - 2]) * f, g[k - 1] + (g[k + 1] - g[k - 1]) * f];
    }
    d -= seg;
  }
  return [g[0], g[1]];
}

function pathLen(link, ax, ay, bx, by) {
  const pts = link.pts;
  let len = Math.hypot(pts[0].x - ax, pts[0].y - ay);
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len + Math.hypot(bx - pts[pts.length - 1].x, by - pts[pts.length - 1].y);
}
