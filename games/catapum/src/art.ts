// Arte de las cartas, dibujado en código (sin emojis ni imágenes): una ilustración por carta y el marco. Las
// ilustraciones van en un cuadro de −1 a 1 con y hacia abajo y se cachean por tamaño en un lienzo aparte (el HUD dibuja
// la mano cada cuadro). El estilo es el de los personajes (toon.ts): contorno de tinta, color plano con una sombra y
// un brillo, la luz arriba a la izquierda.
import { CARD } from './sim/cards.ts';
import { drawHead } from './toon.ts';
import { TYPE_COLOR } from './aim.ts';

type C2 = CanvasRenderingContext2D;
const INK = '#1a1222', TAU = Math.PI * 2, LW = 0.075;

// ---- Ayudas de dibujo --------------------------------------------------------------------------------------------
function ell(ctx: C2, x: number, y: number, rx: number, ry: number, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); }
function ink(ctx: C2, fill: string | CanvasGradient, lw = LW) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
function line(ctx: C2, pts: [number, number][], col: string, lw: number, cap: CanvasLineCap = 'round') {
  ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.lineCap = cap, ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); ctx.lineCap = 'butt';
}
// Trazo grueso con borde de tinta
function tube(ctx: C2, pts: [number, number][], w: number, col: string, cap: CanvasLineCap = 'round') { line(ctx, pts, INK, w + LW * 2, cap); line(ctx, pts, col, w, cap); }
// Esfera: sombra abajo a la derecha, brillo arriba a la izquierda
function ball(ctx: C2, x: number, y: number, r: number, base: string, shade: string, hi = 'rgba(255,255,255,0.55)') {
  ell(ctx, x, y, r, r); ctx.fillStyle = shade; ctx.fill();
  ctx.save(); ctx.clip();
  ell(ctx, x - r * 0.1, y - r * 0.12, r * 0.95, r * 0.93); ctx.fillStyle = base; ctx.fill();
  ell(ctx, x - r * 0.38, y - r * 0.42, r * 0.3, r * 0.17, -0.7); ctx.fillStyle = hi; ctx.fill();
  ctx.restore();
  ell(ctx, x, y, r, r); ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
}
function star(ctx: C2, x: number, y: number, r1: number, r2: number, n: number, col: string, rot = -Math.PI / 2, lw = LW * 0.8) {
  ctx.beginPath();
  for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, r = k % 2 ? r2 : r1; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ink(ctx, col, lw);
}
// Destello de 4 puntas (sin contorno)
function twinkle(ctx: C2, x: number, y: number, r: number, col = '#fff') {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = col; ctx.fill();
}
// Explosión con picos
function burst(ctx: C2, x: number, y: number, r: number, n: number, cols: string[], rot = 0) {
  cols.forEach((c, k) => star(ctx, x, y, r * (1 - k * 0.28), r * (0.62 - k * 0.18), n, c, rot + k * 0.3, k ? 0 : LW));
}
// Gota de fuego (cometa): cabeza en (x, y), cola hacia (tx, ty)
function teardrop(ctx: C2, x: number, y: number, r: number, tx: number, ty: number) {
  const dx = tx - x, dy = ty - y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux, a = Math.atan2(ny, nx);
  ctx.beginPath(); ctx.moveTo(x + nx * r, y + ny * r);
  ctx.arc(x, y, r, a, a + Math.PI, false);
  ctx.quadraticCurveTo(x - nx * r * 0.5 + ux * L * 0.55, y - ny * r * 0.5 + uy * L * 0.55, tx, ty);
  ctx.quadraticCurveTo(x + nx * r * 0.5 + ux * L * 0.55, y + ny * r * 0.5 + uy * L * 0.55, x + nx * r, y + ny * r);
  ctx.closePath();
}
function comet(ctx: C2, x: number, y: number, r: number, tx: number, ty: number, cols = ['#ff3a1a', '#ffb43a', '#fff3a0']) {
  teardrop(ctx, x, y, r, tx, ty); ink(ctx, cols[0]);
  teardrop(ctx, x + (tx - x) * 0.02, y + (ty - y) * 0.02, r * 0.7, x + (tx - x) * 0.6, y + (ty - y) * 0.6); ctx.fillStyle = cols[1]; ctx.fill();
  ell(ctx, x - r * 0.08, y - r * 0.08, r * 0.42, r * 0.42); ctx.fillStyle = cols[2]; ctx.fill();
}
// Mecha encendida desde (x0, y0) hasta (x1, y1)
function fuse(ctx: C2, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 0.13; ctx.stroke(); ctx.strokeStyle = '#a0723e'; ctx.lineWidth = 0.06; ctx.stroke(); ctx.lineCap = 'butt';
  star(ctx, x1, y1, 0.2, 0.08, 7, '#ff9a3c', 0.2);
  star(ctx, x1, y1, 0.11, 0.05, 5, '#ffe14a', 0.6, 0);
}
// Bomba redonda con tapa y mecha
function bomb(ctx: C2, x: number, y: number, r: number, base: string, shade: string, fz = true) {
  if (fz) fuse(ctx, x + r * 0.45, y - r * 0.85, x + r * 0.9, y - r * 1.5, x + r * 1.15, y - r * 1.25);
  ctx.save(); ctx.translate(x + r * 0.42, y - r * 0.78); ctx.rotate(0.5);
  ctx.beginPath(); ctx.roundRect(-r * 0.26, -r * 0.2, r * 0.52, r * 0.34, r * 0.06); ink(ctx, '#8a8f9c');
  ctx.restore();
  ball(ctx, x, y, r, base, shade);
}
function speed(ctx: C2, segs: [number, number, number, number][], col = 'rgba(255,255,255,0.85)', lw = 0.07) {
  for (const [x0, y0, x1, y1] of segs) line(ctx, [[x0, y0], [x1, y1]], col, lw);
}

// ---- Ilustraciones -------------------------------------------------------------------------------------------------
const ART: Record<string, (ctx: C2) => void> = {
  fueguito(ctx) {
    speed(ctx, [[-0.85, -0.05, -0.45, -0.25], [-0.75, 0.35, -0.35, 0.15]]);
    comet(ctx, 0.25, -0.2, 0.36, -0.75, 0.65);
  },
  bomba(ctx) {
    bomb(ctx, -0.05, 0.15, 0.6, '#2e3046', '#16172a');
    for (const ex of [-0.18, 0.14]) { ell(ctx, ex, 0.02, 0.1, 0.15); ink(ctx, '#fff', 0.05); ell(ctx, ex + 0.03, 0.05, 0.05, 0.08); ctx.fillStyle = INK; ctx.fill(); ell(ctx, ex + 0.05, 0.0, 0.025, 0.025); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-0.3, 0.27); ctx.lineTo(0.28, 0.27); ctx.quadraticCurveTo(0.26, 0.6, -0.01, 0.6); ctx.quadraticCurveTo(-0.28, 0.6, -0.3, 0.27); ctx.closePath(); ink(ctx, '#7a1020', 0.06);
    ctx.fillStyle = '#fff'; ctx.fillRect(-0.24, 0.28, 0.46, 0.08);
    ell(ctx, 0, 0.5, 0.12, 0.06); ctx.fillStyle = '#ff6a7a'; ctx.fill();
  },
  caballo(ctx) {
    for (const [x, y, r] of [[-0.62, 0.78, 0.12], [-0.38, 0.86, 0.09]] as [number, number, number][]) { ell(ctx, x, y, r * 1.6, r); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill(); }
    line(ctx, [[-0.85, 0.5], [-0.72, 0.2]], 'rgba(255,255,255,0.85)', 0.07); line(ctx, [[-0.6, 0.55], [-0.5, 0.3]], 'rgba(255,255,255,0.85)', 0.07);
    fuse(ctx, -0.28, -0.58, -0.45, -0.85, -0.68, -0.78);
    ctx.beginPath(); // cabeza y cuello
    ctx.moveTo(-0.42, 0.85); ctx.bezierCurveTo(-0.52, 0.3, -0.46, -0.2, -0.22, -0.5); ctx.lineTo(-0.2, -0.86); ctx.lineTo(-0.02, -0.55);
    ctx.bezierCurveTo(0.2, -0.55, 0.45, -0.2, 0.68, 0.1); ctx.bezierCurveTo(0.8, 0.3, 0.62, 0.5, 0.42, 0.44);
    ctx.bezierCurveTo(0.25, 0.4, 0.15, 0.32, 0.06, 0.37); ctx.bezierCurveTo(-0.02, 0.5, 0.0, 0.7, 0.02, 0.85); ctx.closePath();
    ink(ctx, '#c47a3e');
    ctx.save(); ctx.clip(); ell(ctx, -0.1, 0.62, 0.4, 0.3); ctx.fillStyle = '#9c5a2b'; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(0.0, -0.55); ctx.lineTo(0.12, -0.86); ctx.lineTo(0.18, -0.48); ctx.closePath(); ink(ctx, '#c47a3e', 0.06);
    ctx.beginPath(); ctx.moveTo(-0.16, -0.62); // crin
    for (let k = 0; k <= 6; k++) { const f = k / 6, x = -0.22 - f * 0.22 - (k % 2 ? 0.16 : 0), y = -0.5 + f * 1.25; ctx.lineTo(x, y); }
    ctx.lineTo(-0.4, 0.82); ctx.bezierCurveTo(-0.5, 0.3, -0.44, -0.2, -0.16, -0.62); ctx.closePath(); ink(ctx, '#4a2614', 0.06);
    ell(ctx, 0.5, 0.25, 0.22, 0.17, 0.3); ink(ctx, '#f0c49a', 0.06);
    ell(ctx, 0.62, 0.17, 0.04, 0.06, 0.3); ctx.fillStyle = INK; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0.24, 0.37); ctx.lineTo(0.5, 0.42); ctx.lineTo(0.48, 0.47); ctx.lineTo(0.22, 0.42); ctx.closePath(); ctx.fill(); ctx.lineWidth = 0.03; ctx.stroke();
    ell(ctx, 0.12, -0.2, 0.15, 0.15); ink(ctx, '#fff', 0.06);
    ell(ctx, 0.15, -0.22, 0.05, 0.05); ctx.fillStyle = INK; ctx.fill();
    line(ctx, [[0.0, -0.42], [0.26, -0.36]], INK, 0.06);
  },
  pegajosa(ctx) {
    bomb(ctx, 0, 0.0, 0.55, '#43c46a', '#21854a');
    ctx.beginPath(); ctx.moveTo(-0.55, 0.05); // baba que chorrea
    ctx.bezierCurveTo(-0.5, 0.35, -0.35, 0.5, -0.3, 0.55); ctx.quadraticCurveTo(-0.3, 0.8, -0.22, 0.8); ctx.quadraticCurveTo(-0.14, 0.8, -0.15, 0.58);
    ctx.quadraticCurveTo(0.0, 0.62, 0.08, 0.6); ctx.quadraticCurveTo(0.08, 0.92, 0.18, 0.92); ctx.quadraticCurveTo(0.28, 0.92, 0.26, 0.55);
    ctx.bezierCurveTo(0.42, 0.45, 0.52, 0.3, 0.55, 0.05); ctx.quadraticCurveTo(0.2, 0.2, 0, 0.12); ctx.quadraticCurveTo(-0.3, 0.2, -0.55, 0.05); ctx.closePath();
    ink(ctx, '#9dff6a', 0.06);
    ell(ctx, -0.1, 0.32, 0.08, 0.04); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); ell(ctx, 0.2, 0.7, 0.03, 0.05); ctx.fill();
  },
  cohetito(ctx) {
    for (const [x, y, r] of [[-0.62, 0.62, 0.17], [-0.78, 0.4, 0.12], [-0.42, 0.8, 0.12]] as [number, number, number][]) { ell(ctx, x, y, r, r); ink(ctx, '#eef0f6', 0.05); }
    ctx.save(); ctx.rotate(-Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(-0.52, -0.08); ctx.lineTo(-0.85, 0); ctx.lineTo(-0.52, 0.08); ctx.closePath(); ink(ctx, '#ff9a3c', 0.05);
    ctx.beginPath(); ctx.moveTo(-0.5, -0.04); ctx.lineTo(-0.7, 0); ctx.lineTo(-0.5, 0.04); ctx.closePath(); ctx.fillStyle = '#ffe14a'; ctx.fill();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-0.3, s * 0.15); ctx.lineTo(-0.55, s * 0.38); ctx.lineTo(-0.52, s * 0.12); ctx.closePath(); ink(ctx, '#a32a3c', 0.06); }
    ctx.beginPath(); ctx.moveTo(-0.5, -0.2); ctx.lineTo(0.3, -0.2); ctx.quadraticCurveTo(0.75, -0.18, 0.82, 0); ctx.quadraticCurveTo(0.75, 0.18, 0.3, 0.2); ctx.lineTo(-0.5, 0.2); ctx.closePath();
    ink(ctx, '#e84a5f');
    ctx.save(); ctx.clip(); ctx.fillStyle = '#b8304a'; ctx.fillRect(-0.6, 0.08, 1.5, 0.2); ctx.fillStyle = '#fff'; ctx.fillRect(0.38, -0.3, 0.6, 0.6); ctx.restore();
    ctx.beginPath(); ctx.moveTo(0.38, -0.19); ctx.lineTo(0.38, 0.19); ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    ell(ctx, 0.1, 0, 0.1, 0.1); ink(ctx, '#7fd6ff', 0.06); ell(ctx, 0.07, -0.03, 0.035, 0.035); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  },
  bola(ctx) {
    speed(ctx, [[-0.9, -0.2, -0.55, -0.45], [-0.85, 0.15, -0.5, -0.05]]);
    comet(ctx, 0.22, -0.18, 0.52, -0.82, 0.78);
    ell(ctx, 0.08, -0.22, 0.09, 0.09); ctx.fillStyle = 'rgba(255,90,26,0.5)'; ctx.fill();
  },
  triple(ctx) {
    for (const a of [-0.55, 0, 0.55]) {
      const x = -0.72 + Math.cos(a) * 1.35, y = 0.35 + Math.sin(a) * 1.0;
      comet(ctx, x, y - 0.25, 0.2, x - Math.cos(a) * 0.65, y - 0.25 - Math.sin(a) * 0.65);
    }
    ell(ctx, -0.72, 0.1, 0.12, 0.12); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
  },
  racimo(ctx) {
    bomb(ctx, -0.08, 0.06, 0.46, '#8f6bff', '#5a3cc4');
    for (const [x, y] of [[-0.6, 0.45], [-0.25, 0.68], [0.18, 0.66], [0.52, 0.4], [-0.68, -0.05], [0.55, -0.02]] as [number, number][]) {
      ball(ctx, x, y, 0.17, '#b49cff', '#7a5ce0');
      ell(ctx, x + 0.06, y - 0.17, 0.04, 0.04); ctx.fillStyle = '#ffe14a'; ctx.fill();
    }
  },
  granbum(ctx) {
    burst(ctx, 0, 0.05, 0.98, 11, ['#ff5a1a', '#ffb43a', '#fff3a0'], 0.1);
    bomb(ctx, -0.02, 0.14, 0.56, '#3a2234', '#1c0f1a');
    for (const s of [-1, 1]) { // ojos furiosos
      const ex = 0.0 + s * 0.17;
      ctx.beginPath(); ctx.moveTo(ex - 0.12, 0.0); ctx.lineTo(ex + 0.12, 0.0); ctx.lineTo(ex + s * 0.1, 0.12); ctx.lineTo(ex - s * 0.08, 0.12); ctx.closePath(); ink(ctx, '#ffe14a', 0.05);
      line(ctx, [[ex - s * 0.16, -0.12], [ex + s * 0.1, -0.02]], INK, 0.08);
    }
    ctx.beginPath(); ctx.roundRect(-0.24, 0.28, 0.44, 0.17, 0.05); ink(ctx, '#fff', 0.05);
    for (let k = 1; k < 4; k++) line(ctx, [[-0.24 + k * 0.11, 0.28], [-0.24 + k * 0.11, 0.45]], INK, 0.03, 'butt');
  },
  palomitas(ctx) {
    for (const [x, y] of [[-0.62, -0.72], [0.66, -0.62], [0.12, -0.9]] as [number, number][]) { twinkle(ctx, x, y, 0.12, '#ffe14a'); }
    const pop = (x: number, y: number, r: number) => {
      for (const [dx, dy, k] of [[-0.6, 0.1, 0.7], [0.55, 0.15, 0.7], [0, -0.45, 0.75], [0, 0.2, 0.9]] as [number, number, number][]) { ell(ctx, x + dx * r, y + dy * r, r * k, r * k); ink(ctx, '#fff6d8', 0.05); }
      ell(ctx, x + r * 0.2, y + r * 0.25, r * 0.25, r * 0.18); ctx.fillStyle = '#ffd27a'; ctx.fill();
    };
    for (const [x, y, r] of [[-0.3, -0.38, 0.2], [0.1, -0.45, 0.22], [0.42, -0.3, 0.19], [-0.05, -0.18, 0.2], [0.68, -0.85, 0.12], [-0.75, -0.45, 0.11]] as [number, number, number][]) pop(x, y, r);
    ctx.beginPath(); ctx.moveTo(-0.55, -0.2); ctx.lineTo(0.62, -0.2); ctx.lineTo(0.42, 0.88); ctx.lineTo(-0.38, 0.88); ctx.closePath(); ink(ctx, '#fff');
    ctx.save(); ctx.clip(); ctx.fillStyle = '#e84a5f';
    for (let k = 0; k < 4; k++) { const x0 = -0.55 + k * 0.32; ctx.beginPath(); ctx.moveTo(x0, -0.2); ctx.lineTo(x0 + 0.16, -0.2); ctx.lineTo(x0 + 0.12, 0.9); ctx.lineTo(x0 + 0.02, 0.9); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-0.55, -0.2); ctx.lineTo(0.62, -0.2); ctx.lineTo(0.42, 0.88); ctx.lineTo(-0.38, 0.88); ctx.closePath(); ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-0.25, 0.18, 0.5, 0.3, 0.08); ink(ctx, '#ffd23f', 0.05);
    star(ctx, 0, 0.33, 0.11, 0.05, 5, '#e84a5f', -Math.PI / 2, 0.03);
  },
  melocoton(ctx) {
    for (const [x, ph] of [[-0.5, 0], [0.0, 1], [0.45, 2]] as [number, number][]) {
      ctx.beginPath(); ctx.moveTo(x, -0.35);
      for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(k * 1.4 + ph) * 0.07, -0.35 - k * 0.09);
      ctx.lineCap = 'round'; ctx.strokeStyle = '#9dff8a'; ctx.lineWidth = 0.07; ctx.stroke(); ctx.lineCap = 'butt';
    }
    ell(ctx, 0.0, 0.25, 0.62, 0.56); ctx.fillStyle = '#7a3a8a'; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, -0.08, 0.18, 0.58, 0.52); ctx.fillStyle = '#c56cc8'; ctx.fill();
    ctx.fillStyle = '#8a3f96'; ell(ctx, 0.25, 0.45, 0.12, 0.09); ctx.fill(); ell(ctx, -0.3, 0.5, 0.08, 0.06); ctx.fill(); ell(ctx, 0.35, 0.05, 0.06, 0.05); ctx.fill();
    ell(ctx, -0.3, 0.02, 0.15, 0.09, -0.6); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); ctx.restore();
    ell(ctx, 0.0, 0.25, 0.62, 0.56); ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.02, -0.28); ctx.quadraticCurveTo(0.14, 0.2, 0.02, 0.78); ctx.strokeStyle = 'rgba(26,18,34,0.6)'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.02, -0.3); ctx.quadraticCurveTo(0.3, -0.62, 0.55, -0.42); ctx.quadraticCurveTo(0.3, -0.25, 0.02, -0.3); ink(ctx, '#5a9a3a', 0.05);
    for (const [x, y] of [[-0.62, -0.62], [0.68, -0.1]] as [number, number][]) { // moscas
      ell(ctx, x - 0.05, y - 0.06, 0.06, 0.04, -0.5); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill(); ell(ctx, x + 0.05, y - 0.06, 0.06, 0.04, 0.5); ctx.fill();
      ell(ctx, x, y, 0.05, 0.04); ctx.fillStyle = INK; ctx.fill();
    }
  },
  shuriken(ctx) {
    speed(ctx, [[-0.95, 0.3, -0.55, 0.3], [-0.9, 0.55, -0.6, 0.55], [-0.85, 0.05, -0.62, 0.05]]);
    ctx.save(); ctx.translate(0.15, 0.05); ctx.rotate(0.3);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.lineTo(Math.cos(a) * 0.78, Math.sin(a) * 0.78); ctx.lineTo(Math.cos(a + 0.6) * 0.2, Math.sin(a + 0.6) * 0.2); ctx.lineTo(Math.cos(a + Math.PI / 4) * 0.24, Math.sin(a + Math.PI / 4) * 0.24); }
    ctx.closePath(); ink(ctx, '#cfd8e3');
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 0.76, Math.sin(a) * 0.76); ctx.lineTo(Math.cos(a + 0.6) * 0.2, Math.sin(a + 0.6) * 0.2); ctx.closePath(); ctx.fillStyle = '#8e9bb0'; ctx.fill(); }
    ell(ctx, 0, 0, 0.12, 0.12); ink(ctx, '#3a3f52', 0.06);
    ctx.restore();
    twinkle(ctx, -0.25, -0.5, 0.16);
  },
  boomerang(ctx) {
    ctx.beginPath(); ctx.arc(0.0, 0.05, 0.82, -2.6, 0.35, false);
    ctx.setLineDash([0.12, 0.1]); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.07; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0.82, 0.38); ctx.lineTo(0.62, 0.22); ctx.lineTo(0.9, 0.12); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save(); ctx.translate(-0.05, 0.12); ctx.rotate(-0.35);
    ctx.beginPath(); ctx.moveTo(-0.62, -0.42); ctx.quadraticCurveTo(-0.66, -0.56, -0.52, -0.58); ctx.quadraticCurveTo(0.0, -0.32, 0.12, 0.22);
    ctx.quadraticCurveTo(0.42, -0.1, 0.62, -0.12); ctx.quadraticCurveTo(0.74, -0.08, 0.64, 0.04); ctx.quadraticCurveTo(0.2, 0.32, 0.08, 0.52);
    ctx.quadraticCurveTo(0.0, 0.58, -0.06, 0.46); ctx.quadraticCurveTo(-0.2, -0.12, -0.62, -0.42); ctx.closePath();
    ink(ctx, '#d9944a');
    line(ctx, [[-0.48, -0.42], [-0.32, -0.32]], '#e84a5f', 0.06, 'butt'); line(ctx, [[-0.4, -0.48], [-0.24, -0.38]], '#3fd0c9', 0.06, 'butt');
    line(ctx, [[0.5, -0.05], [0.38, 0.05]], '#e84a5f', 0.06, 'butt'); line(ctx, [[0.56, 0.02], [0.44, 0.12]], '#3fd0c9', 0.06, 'butt');
    ctx.restore();
  },
  caparazon(ctx) {
    speed(ctx, [[-0.95, 0.15, -0.68, 0.15], [-0.92, 0.42, -0.7, 0.42]]);
    for (const [x, r] of [[-0.55, 0.12], [-0.75, 0.09]] as [number, number][]) { ell(ctx, x, 0.68, r * 1.4, r); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-0.62, 0.4); ctx.bezierCurveTo(-0.62, -0.45, 0.68, -0.45, 0.68, 0.4); ctx.closePath(); ink(ctx, '#3fae4a');
    ctx.save(); ctx.clip(); ctx.fillStyle = '#2b8a3a'; ctx.fillRect(-0.7, 0.18, 1.5, 0.3);
    ctx.fillStyle = '#7fe36a';
    for (const [x, y] of [[0.03, -0.08], [-0.33, 0.1], [0.39, 0.1]] as [number, number][]) {
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * 0.17, y + Math.sin(a) * 0.15); } ctx.closePath(); ink(ctx, '#7fe36a', 0.05);
    }
    ell(ctx, -0.22, -0.18, 0.18, 0.06, -0.4); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.roundRect(-0.72, 0.36, 1.5, 0.2, 0.1); ink(ctx, '#fff6d8');
    for (let k = 0; k < 5; k++) line(ctx, [[-0.5 + k * 0.28, 0.38], [-0.5 + k * 0.28, 0.54]], 'rgba(26,18,34,0.35)', 0.04, 'butt');
  },
  laser(ctx) {
    ctx.save(); ctx.translate(-0.42, 0.42); ctx.rotate(-0.55);
    line(ctx, [[0.42, 0], [1.9, 0]], 'rgba(79,227,255,0.45)', 0.36); line(ctx, [[0.42, 0], [1.9, 0]], '#4fe3ff', 0.18); line(ctx, [[0.42, 0], [1.9, 0]], '#fff', 0.07);
    ctx.beginPath(); ctx.roundRect(-0.5, -0.17, 0.82, 0.3, 0.1); ink(ctx, '#e0e6ef');
    ctx.beginPath(); ctx.roundRect(-0.38, 0.06, 0.2, 0.36, 0.06); ink(ctx, '#8f6bff');
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.roundRect(0.0 + k * 0.1, -0.22, 0.06, 0.4, 0.02); ink(ctx, '#ff5ab0', 0.04); }
    ell(ctx, 0.36, -0.02, 0.1, 0.13); ink(ctx, '#4fe3ff', 0.05);
    ctx.restore();
    twinkle(ctx, 0.55, -0.28, 0.16); twinkle(ctx, 0.25, -0.62, 0.1, '#4fe3ff');
  },
  megalaser(ctx) {
    line(ctx, [[-0.3, 0.1], [1.2, 0.1]], 'rgba(79,227,255,0.45)', 0.78); line(ctx, [[-0.3, 0.1], [1.2, 0.1]], '#4fe3ff', 0.52); line(ctx, [[-0.3, 0.1], [1.2, 0.1]], '#fff', 0.24);
    for (let k = 0; k < 12; k++) { const a = k * TAU / 12; line(ctx, [[-0.42 + Math.cos(a) * 0.5, 0.1 + Math.sin(a) * 0.5], [-0.42 + Math.cos(a) * 0.72, 0.1 + Math.sin(a) * 0.72]], '#fff', 0.06); }
    ball(ctx, -0.42, 0.1, 0.42, '#bff6ff', '#4fe3ff', 'rgba(255,255,255,0.9)');
    ell(ctx, -0.42, 0.1, 0.2, 0.2); ctx.fillStyle = '#fff'; ctx.fill();
    twinkle(ctx, 0.5, -0.5, 0.15); twinkle(ctx, 0.75, 0.62, 0.12);
  },
  vaca(ctx) {
    ctx.beginPath(); ctx.moveTo(-0.3, -0.3); ctx.lineTo(0.3, -0.3); ctx.lineTo(0.62, 0.72); ctx.lineTo(-0.62, 0.72); ctx.closePath(); ctx.fillStyle = 'rgba(157,255,138,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.85, 0.72); ctx.lineTo(0.85, 0.72); ctx.lineTo(0.85, 0.95); ctx.lineTo(-0.85, 0.95); ctx.fillStyle = '#7a5434'; ctx.fill();
    line(ctx, [[-0.85, 0.72], [-0.3, 0.72], [-0.2, 0.84], [-0.05, 0.74], [0.08, 0.88], [0.22, 0.74], [0.85, 0.72]], INK, LW);
    for (const [x, y] of [[-0.25, 0.3], [0.2, 0.5], [0.0, 0.1]] as [number, number][]) twinkle(ctx, x, y, 0.09, '#eaffe0');
    ctx.save(); ctx.translate(0, -0.44); ctx.scale(0.38, -0.38); // MUU maneja
    drawHead(ctx, 'muu', { t: 0.5, seed: 0, vx: 0, vy: 0, ground: true, crouch: false, stun: false, dmg: 0, dash: false, happy: true });
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -0.32, 0.32, 0.32, 0, Math.PI, TAU); ctx.fillStyle = 'rgba(190,240,255,0.35)'; ctx.fill(); ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    ell(ctx, 0, -0.26, 0.82, 0.2); ink(ctx, '#b4c6d9');
    ell(ctx, -0.25, -0.31, 0.38, 0.05); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    for (let k = 0; k < 5; k++) { ell(ctx, -0.56 + k * 0.28, -0.18, 0.06, 0.05); ink(ctx, k % 2 ? '#ffe14a' : '#ff5a5a', 0.035); }
  },
  iman(ctx) {
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.arc(0.0, -0.05, 0.62 + k * 0.14, -Math.PI / 2 + s * 0.18 - 0.22, -Math.PI / 2 + s * 0.18 + 0.22);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 - k * 0.25})`; ctx.lineWidth = 0.06; ctx.stroke();
    }
    ctx.save(); ctx.translate(0, 0.18); ctx.rotate(Math.PI);
    ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, Math.PI, false); ctx.lineWidth = 0.36 + LW * 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 0.36; ctx.strokeStyle = '#e83a4a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.32, 0.2, Math.PI - 0.2, false); ctx.lineWidth = 0.06; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.rect(s * 0.42 - 0.18, -0.36, 0.36, 0.36); ink(ctx, '#e0e6ef'); line(ctx, [[s * 0.42 - 0.1, -0.3], [s * 0.42 - 0.1, -0.06]], 'rgba(255,255,255,0.9)', 0.05, 'butt'); }
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.rect(s * 0.42 - 0.18, -0.02, 0.36, 0.04); ctx.fillStyle = INK; ctx.fill(); }
    ctx.restore();
  },
  meteorito(ctx) {
    comet(ctx, -0.12, 0.2, 0.5, 0.85, -0.85);
    ctx.save(); ctx.translate(-0.15, 0.22); ctx.rotate(0.3);
    ctx.beginPath(); const R = [0.44, 0.38, 0.46, 0.4, 0.45, 0.36, 0.42, 0.39];
    R.forEach((r, k) => { const a = k * TAU / R.length; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }); ctx.closePath(); ink(ctx, '#7a5a48');
    ctx.save(); ctx.clip(); ell(ctx, 0.12, 0.14, 0.4, 0.36); ctx.fillStyle = '#5a3f32'; ctx.fill(); ctx.restore();
    for (const [x, y, r] of [[-0.12, -0.1, 0.1], [0.15, 0.08, 0.07], [-0.05, 0.2, 0.05]] as [number, number, number][]) { ell(ctx, x, y, r, r); ink(ctx, '#4a3228', 0.04); }
    ctx.restore();
  },
  supersalto(ctx) {
    speed(ctx, [[-0.72, 0.1, -0.72, -0.4], [0.72, 0.15, 0.72, -0.35], [-0.55, -0.55, -0.55, -0.85], [0.55, -0.5, 0.55, -0.8]]);
    ctx.beginPath(); // resorte
    for (let k = 0; k <= 8; k++) ctx.lineTo(k % 2 ? 0.22 : -0.22, 0.2 + k * 0.08);
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 0.16; ctx.stroke(); ctx.strokeStyle = '#cfd8e3'; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-0.3, 0.84, 0.6, 0.1, 0.04); ink(ctx, '#6b7080', 0.05);
    ctx.beginPath(); // zapatilla
    ctx.moveTo(-0.5, 0.18); ctx.lineTo(0.5, 0.18); ctx.quadraticCurveTo(0.68, 0.16, 0.62, -0.02); ctx.quadraticCurveTo(0.55, -0.16, 0.2, -0.2);
    ctx.lineTo(-0.02, -0.25); ctx.lineTo(-0.15, -0.55); ctx.lineTo(-0.48, -0.5); ctx.quadraticCurveTo(-0.56, -0.2, -0.5, 0.18); ctx.closePath();
    ink(ctx, '#ff5a5a');
    ctx.beginPath(); ctx.moveTo(-0.52, 0.06); ctx.lineTo(0.62, 0.06); ctx.quadraticCurveTo(0.66, 0.14, 0.5, 0.2); ctx.lineTo(-0.5, 0.2); ctx.closePath(); ink(ctx, '#fff', 0.05);
    for (let k = 0; k < 3; k++) line(ctx, [[-0.02 + k * 0.1, -0.2 + k * 0.02], [0.08 + k * 0.1, -0.1 + k * 0.02]], '#fff', 0.05);
    ctx.beginPath(); ctx.moveTo(-0.42, -0.2); ctx.quadraticCurveTo(-0.2, -0.05, 0.1, -0.06); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 0.07; ctx.stroke();
    ell(ctx, -0.38, -0.36, 0.06, 0.1); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  },
  tele(ctx) {
    ell(ctx, 0, 0.05, 0.78, 0.78); ctx.fillStyle = 'rgba(111,255,255,0.18)'; ctx.fill();
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const f = i / 24, a = k * TAU / 3 + f * 4.2, r = 0.08 + f * 0.62; ctx.lineTo(Math.cos(a) * r, 0.05 + Math.sin(a) * r); }
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 0.17; ctx.stroke(); ctx.strokeStyle = k % 2 ? '#b49cff' : '#6ff'; ctx.lineWidth = 0.1; ctx.stroke(); ctx.lineCap = 'butt';
    }
    ell(ctx, 0, 0.05, 0.14, 0.14); ctx.fillStyle = '#fff'; ctx.fill();
    twinkle(ctx, 0.62, -0.62, 0.15); twinkle(ctx, -0.7, 0.55, 0.12, '#6ff'); twinkle(ctx, -0.6, -0.55, 0.09);
  },
  swap(ctx) {
    const arrow = (a0: number, a1: number, col: string) => {
      ctx.beginPath(); ctx.arc(0, 0.05, 0.58, a0, a1, false); ctx.lineWidth = 0.22 + LW * 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 0.22; ctx.strokeStyle = col; ctx.stroke();
      const x = Math.cos(a1) * 0.58, y = 0.05 + Math.sin(a1) * 0.58, tx = -Math.sin(a1), ty = Math.cos(a1);
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a1) * 0.24, y + Math.sin(a1) * 0.24); ctx.lineTo(x + tx * 0.3, y + ty * 0.3); ctx.lineTo(x - Math.cos(a1) * 0.24, y - Math.sin(a1) * 0.24); ctx.closePath(); ink(ctx, col);
    };
    arrow(Math.PI * 1.08, Math.PI * 1.82, '#ff6ad5');
    arrow(Math.PI * 0.08, Math.PI * 0.82, '#4fe3ff');
    ball(ctx, -0.18, 0.05, 0.16, '#ff8ae0', '#c43aa0'); ball(ctx, 0.18, 0.05, 0.16, '#8ef2ff', '#2aa8c4');
  },
  mina(ctx) {
    for (const [x, y, r] of [[-0.62, -0.35, 0.14], [0.6, -0.42, 0.12], [0.0, -0.75, 0.1]] as [number, number, number][]) star(ctx, x, y, r, r * 0.45, 4, '#ffe14a', 0, 0.035);
    ctx.beginPath(); ctx.moveTo(-0.95, 0.5); ctx.quadraticCurveTo(0, 0.38, 0.95, 0.5); ctx.lineTo(0.95, 1); ctx.lineTo(-0.95, 1); ctx.closePath(); ink(ctx, '#7a5434');
    line(ctx, [[-0.95, 0.5], [-0.7, 0.44]], '#5ad16a', 0.08); line(ctx, [[0.95, 0.5], [0.7, 0.44]], '#5ad16a', 0.08);
    ctx.beginPath(); ctx.moveTo(-0.62, 0.48); ctx.bezierCurveTo(-0.6, -0.12, 0.6, -0.12, 0.62, 0.48); ctx.closePath(); ink(ctx, '#5a6650');
    ctx.save(); ctx.clip(); ell(ctx, 0.25, 0.45, 0.6, 0.25); ctx.fillStyle = '#3e4838'; ctx.fill(); ell(ctx, -0.25, 0.1, 0.18, 0.06, -0.4); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.roundRect(-0.68, 0.38, 1.36, 0.14, 0.05); ink(ctx, '#3e4838', 0.06);
    for (const x of [-0.4, 0.4]) { ctx.beginPath(); ctx.roundRect(x - 0.05, 0.05, 0.1, 0.16, 0.03); ink(ctx, '#cfd8e3', 0.04); }
    ell(ctx, 0, 0.0, 0.13, 0.11); ink(ctx, '#ff3a3a', 0.06);
    ell(ctx, 0, 0.0, 0.26, 0.22); ctx.fillStyle = 'rgba(255,58,58,0.3)'; ctx.fill();
    ell(ctx, -0.04, -0.03, 0.04, 0.03); ctx.fillStyle = '#fff'; ctx.fill();
  },
  gas(ctx) {
    ctx.save(); ctx.rotate(-0.1);
    ctx.beginPath(); ctx.roundRect(0.18, -0.78, 0.18, 0.26, 0.04); ink(ctx, '#ffd23f', 0.06);
    ctx.beginPath(); ctx.roundRect(-0.52, -0.55, 1.0, 1.35, 0.14); ink(ctx, '#e8303a');
    ctx.save(); ctx.clip(); ctx.fillStyle = '#a81e2a'; ctx.fillRect(0.28, -0.6, 0.3, 1.5); ctx.restore();
    ctx.beginPath(); ctx.roundRect(-0.42, -0.5, 0.48, 0.18, 0.06); ink(ctx, '#a81e2a', 0.05);
    ctx.beginPath(); ctx.roundRect(-0.34, -0.46, 0.32, 0.1, 0.04); ctx.fillStyle = INK; ctx.fill();
    line(ctx, [[-0.38, -0.2], [0.3, 0.62]], 'rgba(26,18,34,0.3)', 0.07); line(ctx, [[0.3, -0.2], [-0.38, 0.62]], 'rgba(26,18,34,0.3)', 0.07);
    ctx.beginPath(); ctx.roundRect(-0.36, 0.0, 0.62, 0.42, 0.06); ink(ctx, '#ffd23f', 0.05);
    ctx.beginPath(); ctx.moveTo(-0.05, 0.36); ctx.quadraticCurveTo(-0.22, 0.28, -0.12, 0.12); ctx.quadraticCurveTo(-0.08, 0.2, -0.04, 0.2);
    ctx.quadraticCurveTo(-0.06, 0.08, 0.04, 0.04); ctx.quadraticCurveTo(0.02, 0.16, 0.1, 0.2); ctx.quadraticCurveTo(0.14, 0.32, -0.05, 0.36); ink(ctx, '#ff5a1a', 0.035);
    ell(ctx, -0.34, -0.1, 0.05, 0.2); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
    ctx.restore();
  },
  tnt(ctx) {
    fuse(ctx, 0.0, -0.5, 0.25, -0.82, 0.55, -0.72);
    for (const [x, c] of [[-0.36, '#c8302a'], [0.36, '#c8302a'], [0, '#e8403a']] as [number, string][]) {
      ctx.beginPath(); ctx.roundRect(x - 0.2, -0.5, 0.4, 1.3, 0.08); ink(ctx, c);
      ell(ctx, x, -0.48, 0.17, 0.05); ctx.fillStyle = '#f0c49a'; ctx.fill();
      ell(ctx, x - 0.08, 0.15, 0.04, 0.38); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    }
    ctx.beginPath(); ctx.roundRect(-0.62, -0.02, 1.24, 0.36, 0.05); ink(ctx, '#f4e7c8');
    ctx.font = 'bold 0.3px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#c8302a'; ctx.fillText('TNT', 0, 0.17);
  },
  pegamento(ctx) {
    ctx.beginPath(); ctx.moveTo(-0.9, 0.62); ctx.bezierCurveTo(-0.8, 0.42, -0.2, 0.4, 0.1, 0.48); ctx.bezierCurveTo(0.5, 0.42, 0.95, 0.5, 0.9, 0.7);
    ctx.bezierCurveTo(0.8, 0.9, -0.85, 0.92, -0.9, 0.62); ctx.closePath(); ink(ctx, '#ffe14a');
    for (const [x, y, r] of [[-0.45, 0.62, 0.07], [0.35, 0.66, 0.05], [0.6, 0.58, 0.04]] as [number, number, number][]) { ell(ctx, x, y, r, r); ctx.lineWidth = 0.03; ctx.strokeStyle = '#b89a00'; ctx.stroke(); }
    ctx.save(); ctx.translate(0.1, -0.15); ctx.rotate(0.55);
    ctx.beginPath(); ctx.moveTo(-0.05, 0.42); ctx.lineTo(0.05, 0.42); ctx.lineTo(0.03, 0.85); ctx.quadraticCurveTo(0.12, 1.0, 0.0, 1.02); ctx.quadraticCurveTo(-0.12, 1.0, -0.03, 0.85); ctx.closePath(); ink(ctx, '#ffe14a', 0.05);
    ctx.beginPath(); ctx.moveTo(-0.08, 0.28); ctx.lineTo(0.08, 0.28); ctx.lineTo(0.03, 0.46); ctx.lineTo(-0.03, 0.46); ctx.closePath(); ink(ctx, '#ff8a3c', 0.05);
    ctx.beginPath(); ctx.roundRect(-0.32, -0.62, 0.64, 0.92, 0.16); ink(ctx, '#f6f6fa');
    ctx.beginPath(); ctx.roundRect(-0.32, -0.22, 0.64, 0.36, 0.02); ink(ctx, '#ff8a3c', 0.05);
    star(ctx, 0, -0.04, 0.12, 0.05, 5, '#ffe14a', -Math.PI / 2, 0.03);
    ell(ctx, -0.18, -0.42, 0.05, 0.12); ctx.fillStyle = 'rgba(160,170,200,0.4)'; ctx.fill();
    ctx.restore();
  },
  banana(ctx) {
    ctx.beginPath(); ctx.moveTo(-0.6, -0.15); ctx.quadraticCurveTo(-0.1, -0.85, 0.6, -0.5); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.06; ctx.setLineDash([0.1, 0.08]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0.48, -0.66); ctx.lineTo(0.68, -0.5); ctx.lineTo(0.44, -0.4); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
    star(ctx, -0.7, -0.4, 0.13, 0.055, 5, '#ffe14a'); star(ctx, 0.7, -0.05, 0.1, 0.045, 5, '#ffe14a');
    ell(ctx, 0, 0.7, 0.85, 0.13); ctx.fillStyle = 'rgba(10,6,24,0.3)'; ctx.fill();
    // cáscara tirada: tres lonjas caídas hasta el piso y el tronquito parado
    const flap = (x1: number, y1: number, bend: number) => {
      ctx.beginPath(); ctx.moveTo(-0.13, 0.32); ctx.quadraticCurveTo(x1 * 0.5 - bend, 0.2, x1, y1);
      ctx.quadraticCurveTo(x1 * 0.55 + bend, y1 - 0.02, 0.13, 0.4); ctx.closePath(); ink(ctx, '#ffd23f');
      ctx.beginPath(); ctx.moveTo(-0.06, 0.36); ctx.quadraticCurveTo(x1 * 0.45 - bend * 0.5, 0.3, x1 * 0.85, y1 - 0.03); ctx.quadraticCurveTo(x1 * 0.5, y1 - 0.02, 0.06, 0.42); ctx.fillStyle = '#fff3c0'; ctx.fill();
      ell(ctx, x1, y1, 0.05, 0.035); ctx.fillStyle = '#7a5434'; ctx.fill();
    };
    flap(-0.78, 0.66, 0.1); flap(0.8, 0.62, -0.1);
    ctx.beginPath(); ctx.moveTo(-0.16, 0.36); ctx.bezierCurveTo(-0.2, 0.0, -0.1, -0.35, 0.02, -0.5); ctx.lineTo(0.12, -0.46);
    ctx.bezierCurveTo(0.08, -0.25, 0.14, 0.05, 0.18, 0.38); ctx.closePath(); ink(ctx, '#ffe14a');
    ctx.beginPath(); ctx.moveTo(-0.05, 0.3); ctx.bezierCurveTo(-0.08, 0.0, -0.02, -0.25, 0.04, -0.36); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-0.0, -0.6, 0.12, 0.14, 0.03); ink(ctx, '#7a5434', 0.05);
    flap(0.1, 0.78, 0.25);
  },
  fruta(ctx) {
    ctx.beginPath(); ctx.moveTo(0.02, -0.3); ctx.quadraticCurveTo(0.05, -0.5, 0.18, -0.65); ctx.lineWidth = 0.16; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 0.08; ctx.strokeStyle = '#7a5434'; ctx.stroke(); ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(0.08, -0.42); ctx.quadraticCurveTo(0.35, -0.75, 0.62, -0.55); ctx.quadraticCurveTo(0.35, -0.3, 0.08, -0.42); ink(ctx, '#5ad16a', 0.06);
    ctx.beginPath(); ctx.moveTo(0, -0.25); ctx.bezierCurveTo(-0.4, -0.5, -0.8, -0.15, -0.68, 0.25); ctx.bezierCurveTo(-0.58, 0.68, -0.25, 0.85, 0, 0.72);
    ctx.bezierCurveTo(0.25, 0.85, 0.58, 0.68, 0.68, 0.25); ctx.bezierCurveTo(0.8, -0.15, 0.4, -0.5, 0, -0.25); ctx.closePath();
    ctx.fillStyle = '#b81e2e'; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, -0.08, 0.1, 0.62, 0.6); ctx.fillStyle = '#ff3a4a'; ctx.fill();
    ell(ctx, -0.35, -0.08, 0.12, 0.2, 0.4); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); ctx.restore();
    ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(0.42, 0.28, 0.42, 0.14, 0.04); ink(ctx, '#7fff7a', 0.05);
    ctx.beginPath(); ctx.roundRect(0.56, 0.14, 0.14, 0.42, 0.04); ink(ctx, '#7fff7a', 0.05);
    ctx.fillStyle = '#7fff7a'; ctx.fillRect(0.47, 0.31, 0.32, 0.08);
    twinkle(ctx, -0.62, -0.62, 0.13);
  },
  escudo(ctx) {
    ell(ctx, 0, 0.05, 0.86, 0.86); ctx.fillStyle = 'rgba(142,242,255,0.25)'; ctx.fill(); ctx.lineWidth = 0.06; ctx.strokeStyle = '#8ef2ff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.05, 0.74, Math.PI * 1.1, Math.PI * 1.4); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.08; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(0, -0.58); ctx.quadraticCurveTo(0.3, -0.42, 0.52, -0.46); ctx.quadraticCurveTo(0.58, 0.3, 0, 0.68);
    ctx.quadraticCurveTo(-0.58, 0.3, -0.52, -0.46); ctx.quadraticCurveTo(-0.3, -0.42, 0, -0.58); ctx.closePath(); ink(ctx, '#cfd8e3');
    ctx.beginPath(); ctx.moveTo(0, -0.44); ctx.quadraticCurveTo(0.24, -0.32, 0.4, -0.35); ctx.quadraticCurveTo(0.44, 0.22, 0, 0.52);
    ctx.quadraticCurveTo(-0.44, 0.22, -0.4, -0.35); ctx.quadraticCurveTo(-0.24, -0.32, 0, -0.44); ctx.closePath(); ink(ctx, '#4f8bff', 0.05);
    ctx.save(); ctx.clip(); ctx.fillStyle = '#3a6ad6'; ctx.fillRect(0, -0.5, 0.5, 1.1); ctx.restore();
    star(ctx, 0, 0.02, 0.22, 0.1, 5, '#ffd23f');
  },
  plomo(ctx) {
    for (const [x0, y0, x1, y1] of [[-0.1, 0.72, -0.35, 0.9], [0.1, 0.72, 0.4, 0.92], [0.0, 0.74, 0.05, 0.98]] as [number, number, number, number][]) line(ctx, [[x0, y0], [x1, y1]], INK, 0.05);
    ctx.beginPath(); ctx.moveTo(-0.95, 0.7); ctx.lineTo(0.95, 0.7); ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    for (const [x, r] of [[-0.7, 0.13], [0.72, 0.12]] as [number, number][]) { ell(ctx, x, 0.6, r * 1.5, r); ctx.fillStyle = 'rgba(230,220,200,0.85)'; ctx.fill(); }
    ctx.beginPath(); // bota de hierro
    ctx.moveTo(-0.5, 0.7); ctx.lineTo(0.62, 0.7); ctx.quadraticCurveTo(0.72, 0.68, 0.66, 0.42); ctx.quadraticCurveTo(0.6, 0.22, 0.2, 0.18);
    ctx.lineTo(0.1, -0.45); ctx.lineTo(-0.48, -0.45); ctx.closePath(); ink(ctx, '#7a808e');
    ctx.save(); ctx.clip(); ctx.fillStyle = '#5a5f6a'; ctx.fillRect(-0.6, 0.48, 1.4, 0.3); ctx.fillRect(-0.12, -0.5, 0.3, 1.0); ctx.restore();
    ctx.beginPath(); ctx.roundRect(-0.56, -0.62, 0.74, 0.22, 0.05); ink(ctx, '#5a5f6a');
    for (const [x, y] of [[-0.35, -0.2], [-0.35, 0.15], [0.4, 0.42], [-0.05, 0.42]] as [number, number][]) { ell(ctx, x, y, 0.05, 0.05); ink(ctx, '#cfd8e3', 0.03); }
    ell(ctx, -0.3, -0.05, 0.05, 0.22); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    line(ctx, [[0.62, -0.75], [0.62, -0.25]], '#fff', 0.09); ctx.beginPath(); ctx.moveTo(0.48, -0.36); ctx.lineTo(0.62, -0.16); ctx.lineTo(0.76, -0.36); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
  },
  bate(ctx) {
    burst(ctx, 0.5, -0.5, 0.36, 8, ['#fff3a0', '#fff'], 0.2);
    ball(ctx, 0.62, -0.62, 0.17, '#fff', '#d8d8e0');
    ctx.beginPath(); ctx.arc(0.62, -0.62, 0.11, 2.2, 4.2); ctx.strokeStyle = '#e84a5f'; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.save(); ctx.translate(-0.1, 0.1); ctx.rotate(-Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(-0.78, -0.06); ctx.lineTo(-0.1, -0.08); ctx.quadraticCurveTo(0.3, -0.2, 0.62, -0.17); ctx.quadraticCurveTo(0.76, -0.15, 0.76, 0);
    ctx.quadraticCurveTo(0.76, 0.15, 0.62, 0.17); ctx.quadraticCurveTo(0.3, 0.2, -0.1, 0.08); ctx.lineTo(-0.78, 0.06); ctx.closePath(); ink(ctx, '#d9944a');
    ctx.save(); ctx.clip(); ctx.fillStyle = '#b06a2a'; ctx.fillRect(-0.8, 0.04, 1.6, 0.2); ctx.restore();
    ell(ctx, -0.82, 0, 0.06, 0.1); ink(ctx, '#b06a2a', 0.05);
    ctx.beginPath(); ctx.rect(-0.72, -0.07, 0.36, 0.14); ink(ctx, '#3a3f52', 0.05);
    for (let k = 1; k < 4; k++) line(ctx, [[-0.72 + k * 0.09, -0.07], [-0.68 + k * 0.09, 0.07]], 'rgba(255,255,255,0.4)', 0.03, 'butt');
    ctx.restore();
    speed(ctx, [[-0.2, -0.75, 0.1, -0.85], [-0.45, -0.5, -0.2, -0.65]]);
  },
  katana(ctx) {
    ctx.beginPath(); ctx.arc(-0.2, 0.3, 0.95, -1.45, -0.2); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.1; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.2, 0.3, 0.8, -1.3, -0.4); ctx.strokeStyle = 'rgba(232,220,255,0.6)'; ctx.lineWidth = 0.06; ctx.stroke(); ctx.lineCap = 'butt';
    ctx.save(); ctx.translate(-0.05, 0.05); ctx.rotate(-Math.PI / 4 - 0.05);
    ctx.beginPath(); ctx.moveTo(-0.25, -0.07); ctx.lineTo(0.75, -0.08); ctx.quadraticCurveTo(0.92, -0.06, 0.98, 0.05); ctx.lineTo(-0.25, 0.06); ctx.closePath(); ink(ctx, '#e8edf5');
    ctx.beginPath(); ctx.moveTo(-0.25, 0.0); ctx.lineTo(0.9, 0.0); ctx.strokeStyle = '#9aa6ba'; ctx.lineWidth = 0.03; ctx.stroke();
    ell(ctx, -0.3, 0, 0.06, 0.17); ink(ctx, '#ffd23f', 0.05);
    ctx.beginPath(); ctx.roundRect(-0.86, -0.075, 0.52, 0.15, 0.04); ink(ctx, '#3e2394', 0.05);
    for (let k = 0; k < 4; k++) { const x = -0.8 + k * 0.12; ctx.beginPath(); ctx.moveTo(x, -0.075); ctx.lineTo(x + 0.06, 0); ctx.lineTo(x, 0.075); ctx.lineTo(x + 0.06, 0.075); ctx.lineTo(x + 0.12, 0); ctx.lineTo(x + 0.06, -0.075); ctx.closePath(); ctx.fillStyle = '#8f6bff'; ctx.fill(); }
    ctx.restore();
    twinkle(ctx, 0.62, -0.68, 0.16);
  },
  trompeta(ctx) {
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0.5, 0.0, 0.32 + k * 0.18, -0.6, 0.6); ctx.strokeStyle = `rgba(255,255,255,${0.95 - k * 0.25})`; ctx.lineWidth = 0.08; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt'; }
    for (const [x, y] of [[-0.55, -0.62], [0.05, -0.75]] as [number, number][]) {
      ell(ctx, x, y + 0.2, 0.08, 0.06, -0.4); ink(ctx, '#fff', 0.03); line(ctx, [[x + 0.07, y + 0.18], [x + 0.07, y - 0.08], [x + 0.18, y - 0.02]], '#fff', 0.04);
    }
    ctx.save(); ctx.translate(-0.05, 0.12);
    ctx.beginPath(); ctx.moveTo(-0.6, -0.12); ctx.lineTo(-0.6, 0.12); ctx.moveTo(-0.62, 0); ctx.lineTo(0.2, 0); ctx.lineWidth = 0.12 + LW * 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 0.12; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.15, -0.08); ctx.quadraticCurveTo(0.45, -0.1, 0.62, -0.4); ctx.lineTo(0.62, 0.4); ctx.quadraticCurveTo(0.45, 0.1, 0.15, 0.08); ctx.closePath(); ink(ctx, '#ffd23f');
    ell(ctx, 0.62, 0, 0.09, 0.4); ink(ctx, '#e0a200');
    ctx.beginPath(); ctx.roundRect(-0.42, 0.06, 0.5, 0.18, 0.08); ctx.lineWidth = 0.06; ctx.strokeStyle = INK; ctx.stroke();
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.roundRect(-0.36 + k * 0.15, -0.3, 0.08, 0.26, 0.02); ink(ctx, '#ffe98a', 0.04); ell(ctx, -0.32 + k * 0.15, -0.32, 0.07, 0.03); ink(ctx, '#fff', 0.03); }
    ell(ctx, -0.66, 0, 0.05, 0.1); ink(ctx, '#e0a200', 0.04);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-0.55, -0.04, 0.6, 0.03);
    ctx.restore();
  },
  autodestruccion(ctx) {
    for (const [x, y, r] of [[-0.68, -0.6, 0.15], [0.7, -0.55, 0.13], [0.0, -0.85, 0.1]] as [number, number, number][]) star(ctx, x, y, r, r * 0.4, 4, '#ffe14a', 0.4, 0.035);
    ctx.beginPath(); ctx.roundRect(-0.78, 0.25, 1.56, 0.55, 0.1); ink(ctx, '#ffd23f');
    ctx.save(); ctx.clip(); ctx.fillStyle = INK;
    for (let x = -1.2; x < 1; x += 0.3) { ctx.beginPath(); ctx.moveTo(x, 0.85); ctx.lineTo(x + 0.15, 0.85); ctx.lineTo(x + 0.45, 0.2); ctx.lineTo(x + 0.3, 0.2); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.roundRect(-0.78, 0.25, 1.56, 0.55, 0.1); ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    ell(ctx, 0, 0.28, 0.6, 0.16); ink(ctx, '#5a5f6a');
    ctx.beginPath(); ctx.moveTo(-0.48, 0.26); ctx.lineTo(-0.48, 0.0); ctx.bezierCurveTo(-0.48, -0.45, 0.48, -0.45, 0.48, 0.0); ctx.lineTo(0.48, 0.26);
    ctx.bezierCurveTo(0.3, 0.38, -0.3, 0.38, -0.48, 0.26); ctx.closePath(); ink(ctx, '#e8303a');
    ctx.save(); ctx.clip(); ell(ctx, 0.25, 0.25, 0.4, 0.3); ctx.fillStyle = '#a81e2a'; ctx.fill(); ell(ctx, -0.2, -0.18, 0.18, 0.08, -0.3); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill(); ctx.restore();
  },
  '+ulti'(ctx) {
    for (let k = 0; k < 10; k++) { const a = k * TAU / 10 + 0.15; line(ctx, [[Math.cos(a) * 0.62, 0.05 + Math.sin(a) * 0.62], [Math.cos(a) * 0.86, 0.05 + Math.sin(a) * 0.86]], 'rgba(255,255,255,0.8)', 0.06); }
    star(ctx, 0, 0.08, 0.72, 0.34, 5, '#ffd23f', -Math.PI / 2, LW);
    star(ctx, 0, 0.1, 0.42, 0.2, 5, '#ffe98a', -Math.PI / 2, 0);
    ell(ctx, -0.14, -0.08, 0.06, 0.12, 0.3); ctx.fillStyle = '#fff'; ctx.fill();
    twinkle(ctx, 0.62, -0.62, 0.14);
  },
  '+mana'(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -0.82); ctx.bezierCurveTo(0.2, -0.45, 0.6, -0.05, 0.6, 0.28); ctx.bezierCurveTo(0.6, 0.62, 0.32, 0.86, 0, 0.86);
    ctx.bezierCurveTo(-0.32, 0.86, -0.6, 0.62, -0.6, 0.28); ctx.bezierCurveTo(-0.6, -0.05, -0.2, -0.45, 0, -0.82); ctx.closePath();
    ctx.fillStyle = '#2a5ad6'; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, -0.08, 0.2, 0.58, 0.68); ctx.fillStyle = '#4f8bff'; ctx.fill();
    ell(ctx, -0.25, 0.2, 0.1, 0.25, 0.3); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill(); ctx.restore();
    ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    twinkle(ctx, 0.55, -0.45, 0.14); twinkle(ctx, -0.6, -0.2, 0.1, '#bfe0ff');
  },
  dado(ctx) {
    ctx.save(); ctx.rotate(-0.25);
    ctx.beginPath(); ctx.moveTo(-0.55, -0.35); ctx.lineTo(-0.2, -0.65); ctx.lineTo(0.75, -0.65); ctx.lineTo(0.55, -0.35); ctx.closePath(); ink(ctx, '#dcd6ee');
    ctx.beginPath(); ctx.moveTo(0.55, -0.35); ctx.lineTo(0.75, -0.65); ctx.lineTo(0.75, 0.3); ctx.lineTo(0.55, 0.6); ctx.closePath(); ink(ctx, '#b8b0d6');
    ctx.beginPath(); ctx.roundRect(-0.55, -0.35, 1.1, 0.95, 0.08); ink(ctx, '#fff');
    for (const [x, y] of [[-0.3, -0.12], [0, 0.12], [0.3, 0.36]] as [number, number][]) { ell(ctx, x, y, 0.09, 0.09); ctx.fillStyle = '#e84a5f'; ctx.fill(); }
    for (const [x, y] of [[0.08, -0.5], [0.4, -0.5]] as [number, number][]) { ell(ctx, x, y, 0.07, 0.035); ctx.fillStyle = INK; ctx.fill(); }
    ell(ctx, 0.65, -0.18, 0.035, 0.07); ctx.fillStyle = INK; ctx.fill(); ell(ctx, 0.65, 0.15, 0.035, 0.07); ctx.fill();
    ctx.restore();
  },
};

// Dibuja la ilustración en (cx, cy) con medio lado r (sin caché: los menús y las pruebas)
export function drawArt(ctx: C2, id: string, cx: number, cy: number, r: number) {
  const f = ART[id];
  ctx.save(); ctx.translate(cx, cy); ctx.scale(r, r);
  if (f) f(ctx);
  else { ctx.font = 'bold 1px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('?', 0, 0.05); }
  ctx.restore();
}
export const hasArt = (id: string) => !!ART[id];

// Caché por (carta, lado en px del dispositivo): el HUD dibuja la mano en cada cuadro
const cache = new Map<string, HTMLCanvasElement>();
function artImage(id: string, px: number) {
  px = Math.max(8, Math.round(px));
  const key = id + ':' + px;
  let cv = cache.get(key);
  if (!cv) {
    if (cache.size > 300) cache.clear();
    cv = document.createElement('canvas'); cv.width = cv.height = px;
    drawArt(cv.getContext('2d')!, id, px / 2, px / 2, px / 2 * 0.92);
    cache.set(key, cv);
  }
  return cv;
}

// ---- Marco de la carta -------------------------------------------------------------------------------------------
const RAR_EDGE = [['#e4dff6', '#8e86b0'], ['#bfe2ff', '#3f7fd6'], ['#fff1a8', '#d99a00']];
// Nombres cortos para la mano (la carta mide 52–58 px de ancho)
const SHORT: Record<string, string> = {
  fueguito: 'BOLITA', pegajosa: 'PEGAJOSA', caballo: 'CABALLO', racimo: 'RACIMO', melocoton: 'MELOCOTÓN', bola: 'BOLA FUEGO',
  vaca: 'VACA OVNI', supersalto: 'SÚPERSALTO', tele: 'TELETRANS.', swap: 'CAMBIO', gas: 'LATA', tnt: 'TNT', fruta: 'FRUTA',
  plomo: 'PLOMO', autodestruccion: 'AUTODESTR.', granbum: 'GRAN BUM', megalaser: 'MEGALÁSER', meteorito: 'METEORITO', pegamento: 'PEGAMENTO',
};
const font = (px: number) => `900 ${px.toFixed(1)}px system-ui, "Segoe UI", sans-serif`;
function fitName(ctx: C2, id: string, name: string, maxW: number, size: number) {
  for (const txt of [name, SHORT[id] ?? name]) {
    for (let px = size; px >= Math.max(6, size * 0.62); px -= 0.5) { ctx.font = font(px); if (ctx.measureText(txt).width <= maxW) return txt; }
  }
  return SHORT[id] ?? name;
}
const rr = (ctx: C2, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
// Aclara u oscurece un color #rrggbb (k > 0 hacia blanco, k < 0 hacia negro)
function tint(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export type CardOpts = { mana?: number, free?: boolean, sel?: boolean, aim?: boolean, key?: string };
// La carta entera en (x, y, w, h), en píxeles de pantalla. mana: el que tenés (la ilustración se llena de abajo hacia
// arriba hasta poder pagarla); free: la de la caja; sel/aim: elegida (teclado) o apuntando (se levanta).
export function drawCard(ctx: C2, id: string, x: number, y: number, w: number, h: number, o: CardOpts = {}) {
  const card = CARD[id], col = card ? TYPE_COLOR[card.type] : '#ffd23f', rar = o.free || !card ? 2 : card.rar;
  const ok = o.free || o.mana === undefined || !card || o.mana >= card.cost;
  const dpr = ctx.getTransform().a || 1, b = Math.max(2, w * 0.055), r = w * 0.13;
  ctx.save();
  if (o.aim) ctx.translate(0, -h * 0.1);
  // sombra, brillo de elegida y canto de rareza
  ctx.fillStyle = 'rgba(10,6,24,0.45)'; rr(ctx, x + 1, y + 3, w, h, r); ctx.fill();
  if (o.sel || o.aim) { ctx.shadowColor = o.aim ? col : '#fff'; ctx.shadowBlur = 12; }
  const [e0, e1] = RAR_EDGE[rar], eg = ctx.createLinearGradient(x, y, x + w, y + h);
  eg.addColorStop(0, e0), eg.addColorStop(0.5, e1), eg.addColorStop(1, e0);
  rr(ctx, x, y, w, h, r); ctx.fillStyle = eg; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1, w * 0.025); ctx.strokeStyle = INK; ctx.stroke();
  // cuerpo
  const ix = x + b, iy = y + b, iw = w - 2 * b, ih = h - 2 * b;
  rr(ctx, ix, iy, iw, ih, r * 0.7); ctx.fillStyle = '#221a3d'; ctx.fill();
  // ventana de la ilustración, del color del tipo
  const ah = ih * 0.68, ax = ix + iw * 0.04, aw = iw * 0.92, ay = iy + iw * 0.04;
  const g = ctx.createRadialGradient(ax + aw * 0.45, ay + ah * 0.4, aw * 0.05, ax + aw / 2, ay + ah / 2, aw * 0.75);
  g.addColorStop(0, tint(col, 0.45)), g.addColorStop(0.5, tint(col, -0.12)), g.addColorStop(1, tint(col, -0.6));
  ctx.save();
  rr(ctx, ax, ay, aw, ah, r * 0.5); ctx.fillStyle = g; ctx.fill(); ctx.clip();
  if (rar === 2) { // épica: rayos de sol
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff';
    const cx = ax + aw / 2, cy = ay + ah / 2;
    for (let k = 0; k < 12; k += 2) { const a0 = k * Math.PI / 6, a1 = a0 + Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * aw, cy + Math.sin(a0) * aw); ctx.lineTo(cx + Math.cos(a1) * aw, cy + Math.sin(a1) * aw); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  const side = Math.min(aw, ah) * 0.98, img = artImage(id, side * dpr);
  ctx.globalAlpha = ok ? 1 : 0.85;
  ctx.drawImage(img, ax + aw / 2 - side / 2, ay + ah / 2 - side / 2, side, side);
  ctx.globalAlpha = 1;
  if (!ok && card && o.mana !== undefined) { // falta maná: lo que no se cargó queda en sombra, con la línea de carga
    const f = Math.max(0, Math.min(1, o.mana / card.cost)), fy = ay + ah * (1 - f);
    ctx.fillStyle = 'rgba(16,10,34,0.62)'; ctx.fillRect(ax, ay, aw, fy - ay);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(ax, fy - 1, aw, 2);
  }
  ctx.restore();
  rr(ctx, ax, ay, aw, ah, r * 0.5); ctx.lineWidth = Math.max(1, w * 0.02); ctx.strokeStyle = INK; ctx.stroke();
  // nombre
  const ny = ay + ah + (iy + ih - ay - ah) * (o.key || o.free ? 0.36 : 0.5), name = card ? card.name : id === '+ulti' ? 'ULTI' : id === '+mana' ? 'MANÁ' : id;
  const txt = fitName(ctx, id, name, iw * 0.94, Math.max(7, h * 0.115));
  ctx.textAlign = 'center', ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, h * 0.035); ctx.strokeStyle = INK; ctx.strokeText(txt, x + w / 2, ny);
  ctx.fillStyle = ok ? '#fff' : '#a9a2c6'; ctx.fillText(txt, x + w / 2, ny);
  if (o.free) { ctx.font = font(Math.max(6.5, h * 0.09)); ctx.fillStyle = '#ffd23f'; ctx.fillText('GRATIS', x + w / 2, iy + ih - h * 0.07); }
  else if (o.key) { ctx.font = font(Math.max(6.5, h * 0.09)); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(o.key, x + w / 2, iy + ih - h * 0.07); }
  // costo: gema de maná arriba a la izquierda
  if (card && !o.free) {
    const gr = h * 0.13, gx = x + gr * 1.1, gy = y + gr * 1.12;
    ctx.beginPath(); ctx.moveTo(gx, gy - gr * 1.15); ctx.quadraticCurveTo(gx + gr * 1.05, gy - gr * 0.1, gx + gr * 0.8, gy + gr * 0.5);
    ctx.quadraticCurveTo(gx, gy + gr * 1.25, gx - gr * 0.8, gy + gr * 0.5); ctx.quadraticCurveTo(gx - gr * 1.05, gy - gr * 0.1, gx, gy - gr * 1.15); ctx.closePath();
    const mg = ctx.createLinearGradient(gx, gy - gr, gx, gy + gr);
    mg.addColorStop(0, ok ? '#8fc0ff' : '#7a7a9a'), mg.addColorStop(1, ok ? '#2a5ad6' : '#40406a');
    ctx.fillStyle = mg; ctx.fill(); ctx.lineWidth = Math.max(1, w * 0.025); ctx.strokeStyle = INK; ctx.stroke();
    ctx.font = font(gr * 1.25); ctx.lineWidth = Math.max(2, gr * 0.3); ctx.strokeText(String(card.cost), gx, gy + gr * 0.12);
    ctx.fillStyle = '#fff'; ctx.fillText(String(card.cost), gx, gy + gr * 0.12);
  }
  ctx.restore();
}

// Una carta en un <canvas> de los menús (ocupa todo su ancho; el alto sale de la proporción de la carta)
export function paintCardCanvas(cv: HTMLCanvasElement, id: string) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 76, Hh = cv.clientHeight || Math.round(W * 1.32);
  cv.width = Math.round(W * dpr), cv.height = Math.round(Hh * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCard(ctx, id, 1, 1, W - 2, Hh - 5, {});
}
// Solo la ilustración en un <canvas> (el dado del mapa al azar)
export function paintArtCanvas(cv: HTMLCanvasElement, id: string) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 96, Hh = cv.clientHeight || 54;
  cv.width = Math.round(W * dpr), cv.height = Math.round(Hh * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawArt(ctx, id, W / 2, Hh / 2, Math.min(W, Hh) * 0.42);
}
