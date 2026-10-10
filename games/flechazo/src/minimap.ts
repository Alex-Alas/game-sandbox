// Minimapa (redondo, centrado en el jugador y girado hacia donde mira; su radio crece con la visibilidad) y mapa grande
// (todo el rompecabezas con el norte arriba; tocar una flecha la marca como destino). Los dos dibujan las flechas como en
// los juegos de flechas en 2D, también las que se están moviendo.
import { C } from './sim/const.ts';
import type { Board } from './sim/puzzle.ts';
import type { Lim } from './sim/body.ts';
import type { V2 } from './sim/geom.ts';
import type { ArrowView } from './arrows.ts';

export type Mark = { x: number, z: number, hex: string };
export type MapState = {
  b: Board, ox: number, oz: number, lim: Lim, views: ArrowView[],
  px: number, pz: number, yaw: number, radius: number,
  marks: Mark[], target: number, dest: number,
};

// px: unidades del mundo por píxel de pantalla; hi: grosor relativo
function drawArrows(g: CanvasRenderingContext2D, st: MapState, px: number, hi: number) {
  g.lineCap = 'round', g.lineJoin = 'round';
  for (const v of st.views) {
    if (v.mode === 'done' || (v.mode === 'fly' && v.mat.opacity < 0.3)) continue;
    const P = v.poly();
    if (P.length < 2) continue;
    const special = v.id === st.target || v.id === st.dest;
    if (special) {
      g.strokeStyle = v.id === st.dest ? '#22c8ff' : '#ffffff';
      g.lineWidth = 0.62 * hi + 5 * px;
      path(g, P); g.stroke();
    }
    g.strokeStyle = v.flash > 0.05 ? '#ff2f5b' : v.hex;
    g.lineWidth = Math.max(2.2 * px, 0.62 * hi);
    path(g, P); g.stroke();
    // punta
    const h = P[P.length - 1], a = P[P.length - 2], l = Math.hypot(h[0] - a[0], h[1] - a[1]) || 1, tx = (h[0] - a[0]) / l, tz = (h[1] - a[1]) / l;
    const s = 0.75 * hi;
    g.fillStyle = g.strokeStyle;
    g.beginPath();
    g.moveTo(h[0] + tx * s * 1.1, h[1] + tz * s * 1.1);
    g.lineTo(h[0] - tx * s * 0.6 - tz * s, h[1] - tz * s * 0.6 + tx * s);
    g.lineTo(h[0] - tx * s * 0.6 + tz * s, h[1] - tz * s * 0.6 - tx * s);
    g.closePath(); g.fill();
  }
}
const path = (g: CanvasRenderingContext2D, P: V2[]) => { g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); };

function floor(g: CanvasRenderingContext2D, st: MapState, dots: boolean) {
  const { lim, b, ox, oz } = st;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(lim.x0, lim.z0, lim.x1 - lim.x0, lim.z1 - lim.z0, C * 0.75); g.fill();
  g.fillStyle = '#f1eeff';
  if (b.mask) { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.mask[y * b.w + x]) g.fillRect(ox + (x - 0.5) * C - 0.02, oz + (y - 0.5) * C - 0.02, C + 0.04, C + 0.04); }
  else { g.beginPath(); g.roundRect(ox - C / 2, oz - C / 2, b.w * C, b.h * C, C * 0.3); g.fill(); }
  if (dots) {
    g.fillStyle = '#cfcbe6';
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (b.mask && !b.mask[y * b.w + x]) continue;
      g.beginPath(); g.arc(ox + x * C, oz + y * C, 0.16, 0, Math.PI * 2); g.fill();
    }
  }
}

function player(g: CanvasRenderingContext2D, s: number, cone: boolean) {
  if (cone) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, s * 6);
    gr.addColorStop(0, 'rgba(108,92,255,.32)'), gr.addColorStop(1, 'rgba(108,92,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s * 6, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.closePath(); g.fill();
  }
  g.fillStyle = '#24234a'; g.strokeStyle = '#fff'; g.lineWidth = s * 0.28;
  g.beginPath(); g.moveTo(0, -s * 1.1); g.lineTo(s * 0.8, s * 0.8); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.8, s * 0.8); g.closePath();
  g.stroke(); g.fill();
}

export function drawMini(cv: HTMLCanvasElement, st: MapState, t: number) {
  const dpr = Math.min(2, devicePixelRatio || 1), S = cv.clientWidth;
  if (cv.width !== Math.round(S * dpr)) cv.width = cv.height = Math.round(S * dpr);
  const g = cv.getContext('2d')!, R = S / 2, k = R / st.radius;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#dcd5ff'; g.fillRect(0, 0, S, S);
  g.translate(R, R); g.rotate(st.yaw); g.scale(k, k); g.translate(-st.px, -st.pz);
  floor(g, st, st.radius < 18);
  drawArrows(g, st, 1 / k, 1);
  // marcas (las de afuera del radio, como flechita en el borde)
  for (const m of st.marks) {
    const dx = m.x - st.px, dz = m.z - st.pz, d = Math.hypot(dx, dz);
    if (d < st.radius * 0.88) {
      const r = 0.9 + Math.sin(t * 5) * 0.25;
      g.strokeStyle = m.hex; g.lineWidth = 0.45;
      g.beginPath(); g.arc(m.x, m.z, r * 1.6, 0, Math.PI * 2); g.stroke();
    }
  }
  g.restore();
  g.save();
  g.translate(R, R);
  for (const m of st.marks) {
    const dx = m.x - st.px, dz = m.z - st.pz, d = Math.hypot(dx, dz);
    if (d < st.radius * 0.88) continue;
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw), x = dx * c - dz * s, y = dx * s + dz * c, l = Math.hypot(x, y);
    const ex = (x / l) * (R - 9), ey = (y / l) * (R - 9), a = Math.atan2(y, x);
    g.save(); g.translate(ex, ey); g.rotate(a);
    g.fillStyle = m.hex; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, 6); g.lineTo(-5, -6); g.closePath(); g.stroke(); g.fill();
    g.restore();
  }
  player(g, 7, true);
  g.restore();
}

// Mapa grande: devuelve la transformación (para tocar flechas)
export function drawBig(cv: HTMLCanvasElement, st: MapState, t: number): { k: number, x0: number, y0: number } {
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) cv.width = Math.round(W * dpr), cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const { lim } = st, padT = 70, padB = 70, padX = 20;
  const k = Math.min((W - padX * 2) / (lim.x1 - lim.x0), (H - padT - padB) / (lim.z1 - lim.z0));
  const x0 = W / 2 - ((lim.x0 + lim.x1) / 2) * k, y0 = padT + (H - padT - padB) / 2 - ((lim.z0 + lim.z1) / 2) * k;
  g.save();
  g.translate(x0, y0); g.scale(k, k);
  g.shadowColor = 'rgba(60,40,140,.35)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
  floor(g, st, false);
  g.shadowColor = 'transparent';
  floor(g, st, true);
  drawArrows(g, st, 1 / k, 1.1);
  for (const m of st.marks) {
    const r = 1.1 + Math.sin(t * 5) * 0.3;
    g.strokeStyle = m.hex; g.lineWidth = 0.35;
    g.beginPath(); g.arc(m.x, m.z, r * 1.5, 0, Math.PI * 2); g.stroke();
  }
  g.translate(st.px, st.pz); g.rotate(-st.yaw);
  g.scale(1 / k, 1 / k);
  player(g, Math.max(9, k * 0.7), true);
  g.restore();
  return { k, x0, y0 };
}

// La flecha bajo un punto del mapa grande (a menos de ~1 m de su dibujo), o −1
export function pickArrow(st: MapState, tr: { k: number, x0: number, y0: number }, sx: number, sy: number): number {
  const x = (sx - tr.x0) / tr.k, z = (sy - tr.y0) / tr.k;
  let best = -1, bd = Math.max(1.1, 14 / tr.k);
  for (const v of st.views) {
    if (v.mode !== 'rest') continue;
    const P = v.poly();
    for (let i = 1; i < P.length; i++) {
      const d = segDist(x, z, P[i - 1], P[i]);
      if (d < bd) bd = d, best = v.id;
    }
  }
  return best;
}
function segDist(x: number, z: number, a: V2, b: V2) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1;
  const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
  return Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u);
}
