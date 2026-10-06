// LUCERO — dibujo en Canvas 2D. Todo procedural: cielo nocturno, tablero, gemas (sprites cacheados
// por tamaño), especiales animados, capas (niebla, escarcha, rocas) y efectos.
// El render no conoce las reglas: sigue al motor por los eventos de cada fase (`apply`) y por el
// tablero (`reconcile`): cada pieza visual se identifica por el id de la pieza y se anima hacia su
// celda (caída con gravedad, intercambios con easing). `busy()` dice si hay que esperar para avanzar.
import { GEMS, S, ANIM, T, isComet } from './const.js';

const TAU = Math.PI * 2;
const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));
const easeOut = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const lerp = (a, b, k) => a + (b - a) * k;

// ── formas de las gemas (radio r, centradas en 0,0) ──
function circleX(r1, cx, cy, r2) { // intersecciones del círculo (0,0,r1) con (cx,cy,r2)
  const d = Math.hypot(cx, cy), a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = cx / d, uy = cy / d;
  return [[a * ux - h * uy, a * uy + h * ux], [a * ux + h * uy, a * uy - h * ux]];
}
export function shapePath(shape, r) {
  const p = new Path2D();
  if (shape === 'heart') {
    p.moveTo(0, 0.86 * r);
    p.bezierCurveTo(-0.95 * r, 0.22 * r, -0.98 * r, -0.5 * r, -0.5 * r, -0.74 * r);
    p.bezierCurveTo(-0.22 * r, -0.88 * r, -0.02 * r, -0.7 * r, 0, -0.46 * r);
    p.bezierCurveTo(0.02 * r, -0.7 * r, 0.22 * r, -0.88 * r, 0.5 * r, -0.74 * r);
    p.bezierCurveTo(0.98 * r, -0.5 * r, 0.95 * r, 0.22 * r, 0, 0.86 * r);
  } else if (shape === 'sun') {
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * TAU, rr = r * (0.76 + 0.1 * Math.cos(a * 8));
      if (k) p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else p.moveTo(rr, 0);
    }
  } else if (shape === 'star') {
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = r * (k % 2 ? 0.46 : 0.96);
      if (k) p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + 0.06 * r); else p.moveTo(Math.cos(a) * rr, Math.sin(a) * rr + 0.06 * r);
    }
  } else if (shape === 'hex') {
    for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; const x = Math.cos(a) * 0.86 * r, y = Math.sin(a) * 0.86 * r; if (k) p.lineTo(x, y); else p.moveTo(x, y); }
  } else if (shape === 'diamond') {
    p.moveTo(-0.48 * r, -0.72 * r); p.lineTo(0.48 * r, -0.72 * r); p.lineTo(0.9 * r, -0.2 * r);
    p.lineTo(0, 0.88 * r); p.lineTo(-0.9 * r, -0.2 * r);
  } else if (shape === 'moon') {
    const R = 0.88 * r, cx = 0.38 * r, cy = -0.24 * r, r2 = 0.66 * r;
    const [a, b] = circleX(R, cx, cy, r2);
    // arco grande por fuera del círculo interior y arco interior de vuelta
    const pa = Math.atan2(a[1], a[0]), pb = Math.atan2(b[1], b[0]);
    p.arc(0, 0, R, pb, pa, true);
    p.arc(cx, cy, r2, Math.atan2(a[1] - cy, a[0] - cx), Math.atan2(b[1] - cy, b[0] - cx), false);
  }
  p.closePath();
  return p;
}

// Gema en el contexto (centrada en 0,0, radio r): sombra, cuerpo con degradé, facetas y brillo
function paintGem(g, gem, r, glow = 0) {
  const path = shapePath(gem.shape, r);
  g.save();
  g.translate(0, r * 0.07); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill(path); g.translate(0, -r * 0.07);
  if (glow) { g.shadowColor = gem.c; g.shadowBlur = r * glow; }
  const gr = g.createRadialGradient(-0.32 * r, -0.42 * r, 0.04 * r, 0, 0, 1.05 * r);
  gr.addColorStop(0, gem.hi); gr.addColorStop(0.42, gem.c); gr.addColorStop(1, gem.lo);
  g.fillStyle = gr; g.fill(path);
  g.shadowBlur = 0;
  g.save(); g.clip(path);
  // facetas suaves según la forma
  g.globalAlpha = 0.22; g.fillStyle = '#fff';
  if (gem.shape === 'hex') { g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(Math.cos(a) * 0.46 * r, Math.sin(a) * 0.46 * r - 0.04 * r); } g.fill(); }
  else if (gem.shape === 'diamond') { g.beginPath(); g.moveTo(-0.48 * r, -0.72 * r); g.lineTo(0.48 * r, -0.72 * r); g.lineTo(0.25 * r, -0.2 * r); g.lineTo(-0.25 * r, -0.2 * r); g.fill(); g.globalAlpha = 0.12; g.beginPath(); g.moveTo(-0.25 * r, -0.2 * r); g.lineTo(0, 0.88 * r); g.lineTo(-0.9 * r, -0.2 * r); g.fill(); }
  else if (gem.shape === 'sun') { g.beginPath(); g.arc(-0.04 * r, -0.04 * r, 0.46 * r, 0, TAU); g.fill(); }
  else if (gem.shape === 'star') { g.globalAlpha = 0.18; g.beginPath(); g.moveTo(0, -0.9 * r); g.lineTo(0.12 * r, 0.05 * r); g.lineTo(-0.12 * r, 0.05 * r); g.fill(); }
  // brillo
  g.globalAlpha = 1;
  const hl = g.createRadialGradient(-0.3 * r, -0.48 * r, 0, -0.3 * r, -0.48 * r, 0.55 * r);
  hl.addColorStop(0, 'rgba(255,255,255,.85)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl; g.beginPath(); g.ellipse(-0.3 * r, -0.48 * r, 0.5 * r, 0.3 * r, -0.5, 0, TAU); g.fill();
  g.restore();
  g.lineWidth = Math.max(1, 0.07 * r); g.lineJoin = 'round'; g.strokeStyle = gem.lo; g.globalAlpha = 0.9; g.stroke(path);
  g.globalAlpha = 1; g.fillStyle = '#fff';
  g.beginPath(); g.arc(-0.36 * r, -0.4 * r, 0.07 * r, 0, TAU); g.fill();
  g.restore();
}

// Luciérnaga (r = radio de la celda útil); t para el aleteo
function paintFly(g, gem, r, t) {
  const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 22));
  g.save();
  const halo = g.createRadialGradient(0, 0.3 * r, 0, 0, 0.3 * r, r * 1.1);
  halo.addColorStop(0, 'rgba(255,250,190,.55)'); halo.addColorStop(1, 'rgba(255,250,190,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(0, 0.3 * r, r * 1.1, 0, TAU); g.fill();
  g.fillStyle = 'rgba(230,245,255,.75)'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 0.04 * r;
  for (const sx of [-1, 1]) {
    g.save(); g.translate(sx * 0.18 * r, -0.2 * r); g.scale(sx * flap, 1); g.rotate(-0.5);
    g.beginPath(); g.ellipse(0.42 * r, 0, 0.46 * r, 0.24 * r, 0, 0, TAU); g.fill(); g.stroke(); g.restore();
  }
  const bd = g.createLinearGradient(0, -0.6 * r, 0, 0.3 * r);
  bd.addColorStop(0, gem.hi); bd.addColorStop(1, gem.lo);
  g.fillStyle = bd; g.beginPath(); g.ellipse(0, -0.12 * r, 0.24 * r, 0.42 * r, 0, 0, TAU); g.fill();
  const tail = g.createRadialGradient(0, 0.42 * r, 0, 0, 0.42 * r, 0.36 * r);
  tail.addColorStop(0, '#fffde0'); tail.addColorStop(0.5, '#fff27a'); tail.addColorStop(1, 'rgba(255,230,80,0)');
  g.fillStyle = tail; g.beginPath(); g.arc(0, 0.42 * r, 0.36 * r, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(-0.09 * r, -0.36 * r, 0.06 * r, 0, TAU); g.arc(0.09 * r, -0.36 * r, 0.06 * r, 0, TAU); g.fill();
  g.strokeStyle = gem.lo; g.lineWidth = 0.035 * r;
  g.beginPath(); g.moveTo(-0.08 * r, -0.52 * r); g.quadraticCurveTo(-0.2 * r, -0.8 * r, -0.3 * r, -0.78 * r); g.moveTo(0.08 * r, -0.52 * r); g.quadraticCurveTo(0.2 * r, -0.8 * r, 0.3 * r, -0.78 * r); g.stroke();
  g.restore();
}

// Lucero: orbe blanco con anillo arcoíris que gira
function paintStar(g, r, t) {
  g.save();
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
  halo.addColorStop(0, 'rgba(255,255,255,.7)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(0, 0, r * 1.15, 0, TAU); g.fill();
  g.lineWidth = 0.16 * r;
  for (let k = 0; k < 12; k++) {
    g.strokeStyle = `hsl(${k * 30 + t * 200},100%,62%)`;
    g.beginPath(); g.arc(0, 0, 0.7 * r, (k / 12) * TAU + t * 2, ((k + 1) / 12) * TAU + t * 2 + 0.02); g.stroke();
  }
  const core = g.createRadialGradient(-0.15 * r, -0.2 * r, 0, 0, 0, 0.62 * r);
  core.addColorStop(0, '#fff'); core.addColorStop(0.6, '#fff8dc'); core.addColorStop(1, '#ffd98a');
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, 0.6 * r, 0, TAU); g.fill();
  g.rotate(t * 1.5);
  g.fillStyle = '#fff';
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -0.95 * r); g.lineTo(0.09 * r, -0.1 * r); g.lineTo(-0.09 * r, -0.1 * r); g.fill(); }
  g.restore();
}

// Estrella fugaz (pieza que hay que bajar)
function paintDrop(g, r, t) {
  g.save();
  g.translate(0, Math.sin(t * 3) * 0.05 * r);
  const tl = g.createLinearGradient(0, -1.0 * r, 0, 0);
  tl.addColorStop(0, 'rgba(255,240,200,0)'); tl.addColorStop(1, 'rgba(255,240,200,.85)');
  g.fillStyle = tl;
  g.beginPath(); g.moveTo(-0.3 * r, -0.05 * r); g.lineTo(-0.1 * r, -1.0 * r); g.lineTo(0.1 * r, -1.0 * r); g.lineTo(0.3 * r, -0.05 * r); g.fill();
  const halo = g.createRadialGradient(0, 0.1 * r, 0, 0, 0.1 * r, r);
  halo.addColorStop(0, 'rgba(255,236,150,.7)'); halo.addColorStop(1, 'rgba(255,236,150,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(0, 0.1 * r, r, 0, TAU); g.fill();
  const p = shapePath('star', 0.62 * r);
  g.translate(0, 0.12 * r);
  const gr = g.createRadialGradient(-0.1 * r, -0.15 * r, 0, 0, 0, 0.7 * r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#fff1a8'); gr.addColorStop(1, '#ffb52e');
  g.fillStyle = gr; g.fill(p);
  g.strokeStyle = '#fff'; g.lineWidth = 0.05 * r; g.lineJoin = 'round'; g.stroke(p);
  g.fillStyle = '#5a3a00';
  g.beginPath(); g.arc(-0.12 * r, 0.02 * r, 0.05 * r, 0, TAU); g.arc(0.12 * r, 0.02 * r, 0.05 * r, 0, TAU); g.fill();
  g.restore();
}

// Una pieza cualquiera (para el tablero y para íconos de la interfaz). sprite() cachea gemas lisas.
export function paintPiece(g, c, s, r, t = 0, sprite = null) {
  if (s === S.FLY) return paintFly(g, GEMS[c] || GEMS[0], r, t);
  if (s === S.STAR) return paintStar(g, r, t);
  if (s === S.DROP) return paintDrop(g, r, t);
  if (c < 0) return;
  const gem = GEMS[c];
  if (s === S.NOVA) {
    g.save(); g.rotate(t * 0.8);
    const pul = 1 + 0.06 * Math.sin(t * 6);
    g.fillStyle = gem.c; g.globalAlpha = 0.55; g.shadowColor = gem.c; g.shadowBlur = r * 0.6;
    g.beginPath();
    for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8, rr = r * pul * (k % 2 ? 0.74 : 1.02); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.globalAlpha = 0.9; g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 0.05 * r; g.stroke();
    g.restore();
    paintGem(g, gem, r * 0.8);
    return;
  }
  if (sprite) sprite(g, c, r); else paintGem(g, gem, r);
  if (isComet(s)) {
    const path = shapePath(gem.shape, r);
    g.save(); g.clip(path);
    if (s === S.V) g.rotate(Math.PI / 2);
    const sh = ((t * 2.2) % 1) * 2.4 - 1.2;
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (const y of [-0.42, 0, 0.42]) g.fillRect(-r, (y - 0.08) * r, 2 * r, 0.16 * r);
    const gl = g.createLinearGradient((sh - 0.3) * r, 0, (sh + 0.3) * r, 0);
    gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(255,255,255,.7)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
    g.save(); if (s === S.V) g.rotate(Math.PI / 2);
    g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = r * 0.4;
    const o = 1.02 + 0.06 * Math.sin(t * 8);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * (o + 0.2) * r, 0); g.lineTo(sx * o * r, -0.16 * r); g.lineTo(sx * o * r, 0.16 * r); g.fill(); }
    g.restore();
  }
}

// Capas
function paintRock(g, r, layers, seed) {
  g.save();
  const cols = [null, ['#b9b3c9', '#7d7690', '#4f4962'], ['#8f87a6', '#5e5677', '#37304c'], ['#6f6390', '#463c66', '#231c3a']][layers];
  const p = new Path2D();
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * TAU, rr = r * (0.84 + 0.1 * Math.sin(seed * 3.1 + k * 2.3));
    if (k) p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else p.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  p.closePath();
  g.translate(0, r * 0.06); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill(p); g.translate(0, -r * 0.06);
  const gr = g.createRadialGradient(-0.3 * r, -0.35 * r, 0.05 * r, 0, 0, r);
  gr.addColorStop(0, cols[0]); gr.addColorStop(0.55, cols[1]); gr.addColorStop(1, cols[2]);
  g.fillStyle = gr; g.fill(p);
  g.save(); g.clip(p);
  g.fillStyle = 'rgba(0,0,0,.22)';
  for (const [x, y, rr] of [[0.3, 0.25, 0.2], [-0.35, 0.3, 0.13], [0.05, -0.35, 0.15], [-0.25, -0.05, 0.09]]) { g.beginPath(); g.arc(x * r, y * r, rr * r, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.18)';
  for (const [x, y, rr] of [[0.27, 0.21, 0.2], [-0.37, 0.27, 0.13], [0.03, -0.38, 0.15]]) { g.beginPath(); g.arc(x * r, y * r, rr * r, Math.PI, TAU); g.fill(); }
  if (layers >= 3) { g.strokeStyle = 'rgba(140,220,255,.7)'; g.lineWidth = 0.06 * r; g.beginPath(); g.moveTo(-0.6 * r, -0.2 * r); g.lineTo(-0.1 * r, 0.05 * r); g.lineTo(0.2 * r, -0.1 * r); g.lineTo(0.6 * r, 0.3 * r); g.stroke(); }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 0.05 * r; g.stroke(p);
  if (layers >= 2) {
    g.fillStyle = '#fff'; g.font = `900 ${0.42 * r}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = 0.8; g.fillText(String(layers), 0.5 * r, 0.52 * r);
  }
  g.restore();
}
function paintFrost(g, r, layers) {
  g.save();
  const s = r * 0.92;
  const gr = g.createLinearGradient(-s, -s, s, s);
  gr.addColorStop(0, layers > 1 ? 'rgba(220,245,255,.78)' : 'rgba(210,240,255,.55)');
  gr.addColorStop(1, layers > 1 ? 'rgba(120,190,255,.7)' : 'rgba(130,200,255,.4)');
  g.fillStyle = gr; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.06 * r;
  g.beginPath(); g.roundRect(-s, -s, 2 * s, 2 * s, 0.28 * r); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.05 * r;
  g.beginPath(); g.moveTo(-0.6 * r, -0.2 * r); g.lineTo(-0.2 * r, -0.6 * r); g.moveTo(-0.55 * r, 0.1 * r); g.lineTo(0.1 * r, -0.55 * r); g.stroke();
  if (layers > 1) {
    g.translate(0.5 * r, 0.5 * r); g.strokeStyle = '#fff'; g.lineWidth = 0.05 * r;
    for (let k = 0; k < 3; k++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-0.22 * r, 0); g.lineTo(0.22 * r, 0); g.stroke(); }
  }
  g.restore();
}
// Niebla: la casilla se tiñe de rosa (violeta si es doble) con nubecitas que asoman en los bordes
function cloud(g, x, y, s) {
  g.beginPath();
  g.arc(x - 0.5 * s, y + 0.1 * s, 0.42 * s, 0, TAU); g.arc(x, y - 0.18 * s, 0.55 * s, 0, TAU); g.arc(x + 0.52 * s, y + 0.08 * s, 0.44 * s, 0, TAU);
  g.rect(x - 0.5 * s, y + 0.05 * s, s, 0.47 * s);
  g.fill();
}
function paintFog(g, r, layers, seed, t) {
  g.save();
  const two = layers > 1, s = r * 0.94;
  const gr = g.createLinearGradient(0, -s, 0, s);
  gr.addColorStop(0, two ? 'rgba(196,110,255,.62)' : 'rgba(255,150,220,.42)');
  gr.addColorStop(1, two ? 'rgba(130,70,230,.62)' : 'rgba(230,110,200,.42)');
  g.fillStyle = gr; g.beginPath(); g.roundRect(-s, -s, 2 * s, 2 * s, r * 0.3); g.fill();
  g.strokeStyle = two ? 'rgba(235,200,255,.7)' : 'rgba(255,215,240,.6)'; g.lineWidth = Math.max(1, r * 0.05); g.stroke();
  g.beginPath(); g.roundRect(-s, -s, 2 * s, 2 * s, r * 0.3); g.clip();
  const dx = Math.sin(t * 0.7 + seed) * r * 0.06;
  g.fillStyle = two ? 'rgba(240,215,255,.55)' : 'rgba(255,228,245,.5)';
  cloud(g, -0.55 * r + dx, 0.72 * r, r * 0.55);
  cloud(g, 0.6 * r - dx, 0.8 * r, r * 0.48);
  cloud(g, 0.62 * r + dx, -0.78 * r, r * 0.36);
  g.restore();
}
// Ícono de meta en un <canvas> chico de la interfaz
export function paintIcon(cv, goal, t = 0) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), sz = cv.clientWidth || 34;
  cv.width = cv.height = Math.round(sz * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, sz / 2 * dpr, sz / 2 * dpr);
  const r = sz * 0.42;
  if (goal.t === 'color') paintGem(g, GEMS[goal.c], r);
  else if (goal.t === 'rock') paintRock(g, r, 1, 3);
  else if (goal.t === 'frost') { paintGem(g, GEMS[4], r * 0.8); paintFrost(g, r, 1); }
  else if (goal.t === 'fog') { paintFog(g, r, 1, 1, 0); g.fillStyle = '#fff0fa'; g.shadowColor = '#ff8fd8'; g.shadowBlur = r * 0.4; cloud(g, 0, 0.05 * r, r * 0.62); }
  else if (goal.t === 'drop') paintDrop(g, r, 0);
  else if (goal.s !== undefined) paintPiece(g, goal.c ?? 4, goal.s, r, t);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, now = 0;
  let B = null, L = { ox: 0, oy: 0, cs: 40 }, slot = null;
  const vis = new Map();         // id → pieza visual
  const sched = [];              // { at, fn }
  let lay = null;                // espejo de las capas (cambian al tiempo de su evento)
  const parts = [], beams = [], novas = [], rays = [], flies = [], texts = [], flyers = [], flashes = [];
  let tiles = null, clip = null, bg = null, shake = 0;
  const sky = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3, ph: Math.random() * TAU, sp: 0.6 + Math.random() * 2 }));
  let shoot = null, shootT = 3;
  const sprites = new Map();
  let spriteCs = 0;
  let onGoal = null, goalPos = null;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    bg = null;
    if (B && slot) layout(slot);
  }

  // Fondo: degradé nocturno + nebulosas (se dibuja una vez por tamaño)
  function buildBg() {
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.scale(dpr, dpr);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#080a24'); gr.addColorStop(0.5, '#1a1148'); gr.addColorStop(1, '#2c1656');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const [x, y, rr, c] of [[0.15, 0.25, 0.5, 'rgba(255,90,200,.10)'], [0.85, 0.6, 0.55, 'rgba(90,160,255,.10)'], [0.5, 0.95, 0.6, 'rgba(255,170,90,.08)'], [0.7, 0.1, 0.35, 'rgba(160,110,255,.12)']]) {
      const n = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, rr * Math.max(W, H));
      n.addColorStop(0, c); n.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = n; g.fillRect(0, 0, W, H);
    }
  }

  // Tablero: posición y tamaño según el hueco (#board-slot) que deja la interfaz
  function layout(r) {
    slot = r;
    if (!B) return;
    const cs = Math.floor(Math.min(r.w / B.W, r.h / B.H, 78));
    L = { cs, ox: Math.round(r.x + (r.w - cs * B.W) / 2), oy: Math.round(r.y + (r.h - cs * B.H) / 2) };
    buildTiles();
    if (cs !== spriteCs) { sprites.clear(); spriteCs = cs; }
  }
  function buildTiles() {
    const { cs } = L, w = B.W * cs, h = B.H * cs, pad = 14;
    tiles = document.createElement('canvas');
    tiles.width = Math.round((w + pad * 2) * dpr); tiles.height = Math.round((h + pad * 2) * dpr);
    const g = tiles.getContext('2d');
    g.scale(dpr, dpr); g.translate(pad, pad);
    clip = new Path2D();
    const cell = new Path2D();
    for (let i = 0; i < B.n; i++) {
      if (!B.mask[i]) continue;
      const x = (i % B.W) * cs, y = ((i / B.W) | 0) * cs;
      cell.roundRect(x - 0.5, y - 0.5, cs + 1, cs + 1, cs * 0.16);
      clip.rect(x, y, cs, cs);
    }
    g.save(); g.shadowColor = 'rgba(150,120,255,.55)'; g.shadowBlur = 18; g.fillStyle = 'rgba(14,12,44,.92)'; g.fill(cell); g.restore();
    g.strokeStyle = 'rgba(200,180,255,.35)'; g.lineWidth = 2; g.stroke(cell);
    g.fillStyle = 'rgba(14,12,44,.92)'; g.fill(cell);
    for (let i = 0; i < B.n; i++) {
      if (!B.mask[i]) continue;
      const x = (i % B.W) * cs, y = ((i / B.W) | 0) * cs;
      g.fillStyle = ((i % B.W) + ((i / B.W) | 0)) % 2 ? 'rgba(120,110,220,.16)' : 'rgba(150,140,255,.08)';
      g.beginPath(); g.roundRect(x + 1.5, y + 1.5, cs - 3, cs - 3, cs * 0.14); g.fill();
    }
    tiles.pad = pad;
  }

  const cx = (x) => L.ox + (x + 0.5) * L.cs, cy = (y) => L.oy + (y + 0.5) * L.cs;
  const cellXY = (i) => [i % B.W, (i / B.W) | 0];
  const center = (i) => { const [x, y] = cellXY(i); return [cx(x), cy(y)]; };

  // Gema lisa cacheada al tamaño actual
  function sprite(g, c, r) {
    let sp = sprites.get(c);
    if (!sp) {
      const size = Math.ceil(L.cs * dpr);
      sp = document.createElement('canvas'); sp.width = sp.height = size;
      const sg = sp.getContext('2d');
      sg.translate(size / 2, size / 2); sg.scale(dpr, dpr);
      paintGem(sg, GEMS[c], L.cs * 0.42);
      sprites.set(c, sp);
    }
    const k = r / (L.cs * 0.42);
    g.drawImage(sp, (-L.cs / 2) * k, (-L.cs / 2) * k, L.cs * k, L.cs * k);
  }

  // ── tablero nuevo ──
  function setBoard(b, r) {
    B = b; vis.clear(); sched.length = 0;
    for (const a of [parts, beams, novas, rays, flies, texts, flyers, flashes]) a.length = 0;
    lay = { fog: b.fog.slice(), frost: b.frost.slice(), rock: b.rock.slice() };
    layout(r);
    // entrada: las gemas caen desde arriba escalonadas por columna
    for (let i = 0; i < b.n; i++) {
      const q = b.p[i]; if (!q) continue;
      const [x, y] = cellXY(i);
      vis.set(q.id, mkVis(q, x, y - b.H - 1 - x * 0.35, x, y));
    }
  }
  function mkVis(q, x, y, tx, ty) {
    return { id: q.id, c: q.c, s: q.s, x, y, tx, ty, mode: y !== ty || x !== tx ? 'fall' : 'idle', vy: 0, x0: x, y0: y, sc: 1, born: -1, sq: 0, die: null, wob: 0 };
  }
  const at = (dt, fn) => sched.push({ at: now + dt, fn });

  // Hace coincidir lo visual con el tablero (por si algún evento no llegó a mover una pieza)
  function reconcile() {
    const live = new Set();
    for (let i = 0; i < B.n; i++) {
      const q = B.p[i]; if (!q) continue;
      live.add(q.id);
      const [x, y] = cellXY(i);
      let v = vis.get(q.id);
      if (!v) { v = mkVis(q, x, y - 1, x, y); vis.set(q.id, v); }
      v.c = q.c;
      if (v.tx !== x || v.ty !== y) {
        v.tx = x; v.ty = y; v.x0 = v.x; v.y0 = v.y;
        if (v.mode !== 'ease') { v.mode = y > v.y + 0.01 ? 'fall' : 'ease'; v.vy = 0; v.et = now; v.dur = 0.22; }
      }
    }
    for (const v of vis.values()) if (!live.has(v.id) && !v.die) v.die = { at: now, burst: false };
  }

  // ── eventos de una fase ──
  function apply(ev) {
    if (!ev) return;
    const t0Pops = [];
    let phasePts = 0;
    for (const e of ev) {
      if (e.k === 'swap') {
        // la pieza de a va a b y viceversa; si la jugada las consumió (combo), se apagan al llegar
        for (const [id, to] of [[e.ia, e.b], [e.ib, e.a]]) {
          const v = vis.get(id); if (!v) continue;
          const [x, y] = cellXY(to);
          v.x0 = v.x; v.y0 = v.y; v.tx = x; v.ty = y; v.mode = 'ease'; v.et = now; v.dur = ANIM.swap;
          if (B.p[to]?.id !== id) v.die = { at: now + ANIM.swap, burst: false };
        }
      } else if (e.k === 'pop') {
        const v = vis.get(e.id);
        phasePts += e.pts || 0;
        if (e.t === 0 && e.to < 0) t0Pops.push(e.i);
        if (!v) continue;
        if (v.die && v.die.at <= now + 0.001) continue;
        if (e.to >= 0 && e.to !== e.i) {
          // se junta con las demás en la celda del especial
          v.die = { at: now + e.t + 0.12, burst: false };
          at(e.t, () => { const [x, y] = cellXY(e.to); v.x0 = v.x; v.y0 = v.y; v.tx = x; v.ty = y; v.mode = 'ease'; v.et = now; v.dur = 0.12; });
        } else v.die = { at: now + e.t, burst: true, c: e.c, s: e.s };
      } else if (e.k === 'make') {
        const [x, y] = cellXY(e.i);
        const v = mkVis({ id: e.id, c: e.c, s: e.s }, x, y, x, y);
        v.born = now + e.t; v.hide = true;
        vis.set(e.id, v);
        at(e.t, () => { v.hide = false; burst(...center(e.i), 18, e.s === S.STAR ? '#fff' : GEMS[e.c].c, 1.2, 0.6); ring(...center(e.i), e.s === S.STAR ? '#fff' : GEMS[e.c].hi, 0.9); if (e.pts) text(`+${e.pts}`, ...center(e.i), '#fff', 0.8); });
        onSpecial?.(e);
      } else if (e.k === 'morph') {
        const v = vis.get(e.id);
        at(e.t, () => { if (v) { v.s = e.s; if (e.c !== undefined) v.c = e.c; v.born = now; } ring(...center(e.i), '#fff', 0.7); });
      } else if (e.k === 'fog' || e.k === 'frost' || e.k === 'rock') {
        at(e.t, () => {
          lay[e.k][e.i] = e.left;
          const [px, py] = center(e.i);
          if (e.k === 'fog') burst(px, py, 10, '#ffb3ea', 0.9, 0.7, 'puff');
          else if (e.k === 'frost') burst(px, py, 14, '#d8f3ff', 1.4, 0.6, 'shard');
          else burst(px, py, 14, '#a59cbd', 1.3, 0.7, 'shard');
          onLayer?.(e);
        });
      } else if (e.k === 'goal') {
        at(e.t + 0.05, () => { const [px, py] = center(e.i); flyer(px, py, e.g, e.c); });
      } else if (e.k === 'beam') {
        at(e.t, () => { beams.push({ i: e.i, dir: e.dir, c: e.c, t: now, w: e.w || 1 }); shake = Math.max(shake, 5); onFx?.('beam', e); });
      } else if (e.k === 'nova') {
        at(e.t, () => { novas.push({ i: e.i, r: e.r, c: e.c, t: now }); shake = Math.max(shake, e.r > 3 ? 16 : 9); onFx?.('nova', e); });
      } else if (e.k === 'rays') {
        at(e.t, () => { rays.push({ i: e.i, cells: e.cells, c: e.c, t: now }); onFx?.('rays', e); });
      } else if (e.k === 'fly') {
        at(e.t, () => { flies.push({ from: e.i, to: e.to, c: e.c, t: now, dur: e.ta - e.t, carry: e.carry }); onFx?.('fly', e); });
      } else if (e.k === 'flap') {
        at(e.t, () => burst(...center(e.i), 12, '#fff6a8', 1, 0.5));
      } else if (e.k === 'combo') {
        at(e.t, () => { ring(...center(e.i), '#fff', 1.6); flashes.push({ t: now, a: 0.25 }); onFx?.('combo', e); });
      } else if (e.k === 'supernova') {
        at(e.t, () => { flashes.push({ t: now, a: 0.9 }); novas.push({ i: e.i, r: 9, c: -1, t: now }); shake = 24; onFx?.('supernova', e); });
      } else if (e.k === 'fall') {
        for (const m of e.moves) {
          const v = vis.get(m.id); if (!v) continue;
          const [x, y] = cellXY(m.to);
          v.x0 = v.x; v.y0 = v.y; v.tx = x; v.ty = y; v.mode = 'fall'; v.vy = v.vy > 0 ? v.vy : 1.5;
        }
        for (const s of e.spawns) {
          const [x, y] = cellXY(s.to);
          const v = mkVis({ id: s.id, c: s.c, s: s.s }, x, s.y0, x, y);
          v.vy = 1.5; v.x0 = x; v.y0 = s.y0;
          vis.set(s.id, v);
        }
      } else if (e.k === 'dropout') {
        const v = vis.get(e.id);
        if (v) { v.die = { at: now + 0.35, burst: false }; v.mode = 'ease'; v.x0 = v.x; v.y0 = v.y; v.ty = v.y + 1.2; v.tx = v.x; v.et = now; v.dur = 0.35; v.fade = true; }
        at(0.2, () => { const [px, py] = center(e.i); burst(px, py + L.cs * 0.6, 26, '#fff1a8', 1.6, 0.8, 'star'); onFx?.('dropout', e); });
      } else if (e.k === 'shuffle') {
        for (let i = 0; i < B.n; i++) {
          const q = B.p[i]; if (!q) continue;
          const v = vis.get(q.id); if (!v) continue;
          const [x, y] = cellXY(i);
          if (v.tx === x && v.ty === y) continue;
          v.x0 = v.x; v.y0 = v.y; v.tx = x; v.ty = y; v.mode = 'ease'; v.et = now; v.dur = 0.55; v.swirl = true;
        }
        text(e.forced ? 'REMOLINO' : 'SIN JUGADAS: MEZCLANDO', L.ox + (B.W * L.cs) / 2, L.oy + (B.H * L.cs) / 2, '#b8f0ff', 1.1, true);
      }
    }
    if (t0Pops.length && phasePts) {
      let sx = 0, sy = 0;
      for (const i of t0Pops) { const [px, py] = center(i); sx += px; sy += py; }
      text(`+${phasePts}`, sx / t0Pops.length, sy / t0Pops.length, '#fff', 0.7);
    }
    reconcile();
  }
  let onSpecial = null, onLayer = null, onFx = null;

  // ── efectos ──
  function burst(x, y, n, color, sp = 1, life = 0.6, kind = 'dot') {
    if (parts.length > 700) return;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, v = L.cs * (1.5 + Math.random() * 4) * sp;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - L.cs * (kind === 'puff' ? 0.5 : 1.2), life: life * (0.5 + Math.random() * 0.7), max: life, color, kind, sz: L.cs * (kind === 'puff' ? 0.16 : kind === 'shard' ? 0.1 : 0.06) * (0.6 + Math.random() * 0.8), rot: Math.random() * TAU });
    }
  }
  const ringsArr = [];
  function ring(x, y, color, size = 1) { ringsArr.push({ x, y, color, size, t: now }); }
  function text(str, x, y, color, size = 1, big = false) { texts.push({ str, x, y, color, size, big, t: now }); }
  function praise(str, color = '#ffe27a', size = 1.4) {
    if (!B) return;
    for (let k = texts.length - 1; k >= 0; k--) if (texts[k].praise) texts.splice(k, 1);
    texts.push({ str, x: L.ox + (B.W * L.cs) / 2, y: L.oy + (B.H * L.cs) * 0.42, color, size, big: true, praise: true, t: now });
  }
  function flyer(x, y, g, c) {
    const tgt = goalPos?.(g);
    if (!tgt) { onGoal?.(g); return; }
    flyers.push({ x0: x, y0: y, x1: tgt.x, y1: tgt.y, g, c, t: now, dur: 0.5 + Math.random() * 0.25, kind: B.goals[g].t });
  }
  // Destello que viaja de un punto de la pantalla a una celda (la lluvia final)
  function streak(x0, y0, i, color, dur = 0.35) { const [x1, y1] = center(i); flyers.push({ x0, y0, x1, y1, t: now, dur, kind: 'streak', c: color }); }

  function badSwap(a, b) {
    const qa = B.p[a], qb = B.p[b];
    for (const [q, from, to] of [[qa, a, b], [qb, b, a]]) {
      if (!q) continue;
      const v = vis.get(q.id); if (!v) continue;
      const [x, y] = cellXY(from), [tx, ty] = cellXY(to);
      v.x0 = x; v.y0 = y; v.tx = lerp(x, tx, 0.42); v.ty = lerp(y, ty, 0.42); v.mode = 'ease'; v.et = now; v.dur = ANIM.bad / 2; v.back = [x, y];
    }
  }

  // ── actualización ──
  function update(dt) {
    now += dt;
    for (let k = sched.length - 1; k >= 0; k--) if (sched[k].at <= now) { const s = sched.splice(k, 1)[0]; s.fn(); }
    for (const v of vis.values()) {
      if (v.mode === 'fall') {
        v.vy = Math.min(ANIM.vmax, v.vy + ANIM.gravity * dt);
        v.y += v.vy * dt;
        const span = v.ty - v.y0;
        v.x = span > 0.001 ? lerp(v.x0, v.tx, Math.min(1, (v.y - v.y0) / span)) : v.tx;
        if (v.y >= v.ty) { v.y = v.ty; v.x = v.tx; v.mode = 'idle'; v.sq = 1; v.vy = 0; landed++; }
      } else if (v.mode === 'ease') {
        const k = Math.min(1, (now - v.et) / v.dur), e = ease(k);
        v.x = lerp(v.x0, v.tx, e); v.y = lerp(v.y0, v.ty, e);
        if (k >= 1) {
          v.x = v.tx; v.y = v.ty; v.swirl = false;
          if (v.back) { v.x0 = v.x; v.y0 = v.y; [v.tx, v.ty] = v.back; v.back = null; v.et = now; v.dur = ANIM.bad / 2; }
          else v.mode = 'idle';
        }
      }
      if (v.sq > 0) v.sq = Math.max(0, v.sq - dt * 5);
      if (v.die && now >= v.die.at) {
        vis.delete(v.id);
        if (v.die.burst) {
          const px = cx(v.x), py = cy(v.y);
          const col = v.s === S.STAR || v.c < 0 ? '#fff' : GEMS[v.c].c;
          burst(px, py, 8, col, 1, 0.55);
          burst(px, py, 3, '#fff', 0.7, 0.4, 'star');
          ring(px, py, v.c >= 0 ? GEMS[v.c].hi : '#fff', 0.55);
        }
      }
    }
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k];
      p.life -= dt; if (p.life <= 0) { parts.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += L.cs * (p.kind === 'puff' ? 1 : 9) * dt; p.vx *= Math.pow(0.08, dt); p.rot += dt * 6;
    }
    shake *= Math.pow(0.001, dt); if (shake < 0.3) shake = 0;
    if (!shoot && (shootT -= dt) < 0) { shoot = { x: Math.random() * W * 0.8 + W * 0.1, y: Math.random() * H * 0.3, t: 0 }; shootT = 5 + Math.random() * 8; }
    if (shoot && (shoot.t += dt) > 0.9) shoot = null;
  }
  let landed = 0;
  const takeLanded = () => { const n = landed; landed = 0; return n; };

  function busy() {
    if (sched.length) return true;
    for (const v of vis.values()) if (v.mode !== 'idle' || v.die) return true;
    return false;
  }

  // ── dibujo ──
  function draw(o) {
    if (!bg) buildBg();
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = o.time;
    for (const s of sky) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      g.globalAlpha = a; g.fillStyle = '#fff';
      g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    if (shoot) {
      const k = shoot.t / 0.9, x = shoot.x + k * 260, y = shoot.y + k * 120;
      const gr = g.createLinearGradient(x - 120, y - 55, x, y);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(255,255,255,${0.8 * (1 - k)})`);
      g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 120, y - 55); g.lineTo(x, y); g.stroke();
    }
    if (!B || !o.board) { drawFlyers(g); return; }
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    g.save(); g.translate(sx, sy);
    g.drawImage(tiles, L.ox - tiles.pad, L.oy - tiles.pad, tiles.width / dpr, tiles.height / dpr);
    const { cs } = L, r = cs * 0.42;
    // salidas de las estrellas fugaces
    if (B.goals.some((q) => q.t === 'drop')) {
      for (let x = 0; x < B.W; x++) {
        const e = B.exit[x]; if (e < 0) continue;
        const [px, py] = center(e), bob = Math.sin(t * 4 + x) * 2;
        g.fillStyle = 'rgba(255,230,140,.85)';
        g.beginPath(); g.moveTo(px - cs * 0.16, py + cs * 0.52 + bob); g.lineTo(px + cs * 0.16, py + cs * 0.52 + bob); g.lineTo(px, py + cs * 0.68 + bob); g.fill();
      }
    }
    for (let i = 0; i < B.n; i++) {
      if (!B.mask[i] || !lay.fog[i]) continue;
      const [px, py] = center(i);
      g.save(); g.translate(px, py); paintFog(g, cs * 0.5, lay.fog[i], i, t); g.restore();
    }
    // selección y pista (debajo de las gemas)
    if (o.sel >= 0 && B.mask[o.sel]) {
      const [px, py] = center(o.sel);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.5;
      g.beginPath(); g.roundRect(px - cs / 2 + 2, py - cs / 2 + 2, cs - 4, cs - 4, cs * 0.18); g.fill(); g.stroke();
    }
    const hint = o.hint ? new Map() : null;
    if (o.hint) {
      const { a, b } = o.hint, pulse = 0.5 + 0.5 * Math.sin(t * 7);
      for (const i of b >= 0 ? [a, b] : [a]) {
        const [px, py] = center(i);
        const gr = g.createRadialGradient(px, py, 0, px, py, cs * 0.7);
        gr.addColorStop(0, `rgba(255,250,200,${0.25 + 0.3 * pulse})`); gr.addColorStop(1, 'rgba(255,250,200,0)');
        g.fillStyle = gr; g.fillRect(px - cs, py - cs, cs * 2, cs * 2);
      }
      if (b >= 0) {
        const [ax, ay] = cellXY(a), [bx, by] = cellXY(b), w = Math.sin(t * 7) * 0.08;
        if (B.p[a]) hint.set(B.p[a].id, [(bx - ax) * w, (by - ay) * w]);
        if (B.p[b]) hint.set(B.p[b].id, [(ax - bx) * w, (ay - by) * w]);
      } else if (B.p[a]) hint.set(B.p[a].id, [0, 0, 1 + 0.08 * Math.sin(t * 9)]);
    }
    // gemas (recortadas al tablero: las que entran desde arriba aparecen al cruzar el borde)
    g.save(); g.translate(L.ox, L.oy); g.clip(clip); g.translate(-L.ox, -L.oy);
    for (const v of vis.values()) {
      if (v.hide) continue;
      let px = cx(v.x), py = cy(v.y), sc = v.sc;
      const hv = hint?.get(v.id);
      if (hv) { px += hv[0] * cs; py += hv[1] * cs; if (hv[2]) sc *= hv[2]; }
      if (v.born >= 0) { const k = (now - v.born) / 0.25; if (k < 1) sc *= 0.3 + 0.7 * easeOut(k) + Math.sin(k * Math.PI) * 0.25; }
      if (v.swirl) { const k = (now - v.et) / v.dur; px += Math.sin(k * Math.PI) * cs * 0.4 * Math.cos(v.id); py += Math.sin(k * Math.PI) * cs * 0.4 * Math.sin(v.id); }
      const sel = o.sel >= 0 && B.p[o.sel]?.id === v.id;
      if (sel) sc *= 1.08 + 0.04 * Math.sin(t * 8);
      let sy2 = 1, sx2 = 1;
      if (v.sq > 0) { const k = Math.sin(v.sq * Math.PI); sy2 = 1 - 0.14 * k; sx2 = 1 + 0.1 * k; }
      g.save(); g.translate(px, py + (1 - sy2) * r * 0.9);
      g.scale(sc * sx2, sc * sy2);
      if (v.fade) g.globalAlpha = Math.max(0, 1 - (now - v.et) / v.dur);
      if (v.die && !v.die.burst && v.die.at - now < 0.12) { const k = Math.max(0, (v.die.at - now) / 0.12); g.scale(k, k); }
      if (v.die && v.die.burst && v.die.at - now < 0.08) { const k = 1 + (0.08 - (v.die.at - now)) * 3; g.scale(k, k); }
      paintPiece(g, v.c, v.s, r, t + v.id * 0.37, sprite);
      g.restore();
    }
    g.restore();
    // escarcha y rocas encima
    for (let i = 0; i < B.n; i++) {
      if (!B.mask[i]) continue;
      if (lay.frost[i]) { const [px, py] = center(i); g.save(); g.translate(px, py); paintFrost(g, cs * 0.5, lay.frost[i]); g.restore(); }
      if (lay.rock[i]) { const [px, py] = center(i); g.save(); g.translate(px, py); paintRock(g, cs * 0.48, lay.rock[i], i); g.restore(); }
    }
    drawFx(g, t);
    g.restore();
    drawFlyers(g);
    for (let k = flashes.length - 1; k >= 0; k--) {
      const f = flashes[k], a = f.a * (1 - (now - f.t) / 0.5);
      if (a <= 0) { flashes.splice(k, 1); continue; }
      g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(0, 0, W, H);
    }
  }

  function drawFx(g, t) {
    const { cs } = L;
    // rayos de cometa
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = beams.length - 1; k >= 0; k--) {
      const b = beams[k], tau = now - b.t, reach = tau / T.beam, fade = Math.max(0, 1 - Math.max(0, tau - 0.25) / 0.3);
      if (fade <= 0) { beams.splice(k, 1); continue; }
      const [px, py] = center(b.i), col = b.c >= 0 ? GEMS[b.c].c : '#ffe08a';
      const ext = (b.dir === 'h' ? B.W : B.H) + 1;
      const d = Math.min(ext, reach) * cs;
      for (const [w, c, a] of [[0.7 * b.w, col, 0.45], [0.32 * b.w, '#fff', 0.9]]) {
        g.globalAlpha = a * fade; g.strokeStyle = c; g.lineWidth = cs * w; g.lineCap = 'round';
        g.beginPath();
        if (b.dir === 'h') { g.moveTo(Math.max(L.ox, px - d), py); g.lineTo(Math.min(L.ox + B.W * cs, px + d), py); }
        else { g.moveTo(px, Math.max(L.oy, py - d)); g.lineTo(px, Math.min(L.oy + B.H * cs, py + d)); }
        g.stroke();
      }
      if (reach < ext) {
        g.globalAlpha = fade; g.fillStyle = '#fff';
        for (const s of [-1, 1]) {
          const hx = b.dir === 'h' ? px + s * d : px, hy = b.dir === 'h' ? py : py + s * d;
          const gr = g.createRadialGradient(hx, hy, 0, hx, hy, cs * 0.6);
          gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(hx, hy, cs * 0.6, 0, TAU); g.fill();
        }
      }
    }
    // novas
    for (let k = novas.length - 1; k >= 0; k--) {
      const n = novas[k], tau = now - n.t, kk = tau / 0.45;
      if (kk >= 1) { novas.splice(k, 1); continue; }
      const [px, py] = center(n.i), col = n.c >= 0 ? GEMS[n.c].c : '#fff', R = (n.r + 0.6) * cs * easeOut(kk);
      g.globalAlpha = 1 - kk;
      const gr = g.createRadialGradient(px, py, 0, px, py, R);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.6, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, R, 0, TAU); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = cs * 0.12 * (1 - kk); g.beginPath(); g.arc(px, py, R, 0, TAU); g.stroke();
    }
    // rayos del lucero
    for (let k = rays.length - 1; k >= 0; k--) {
      const r = rays[k], tau = now - r.t, end = 0.12 + r.cells.length * T.ray + 0.3;
      if (tau > end) { rays.splice(k, 1); continue; }
      const [px, py] = center(r.i);
      const gr = g.createRadialGradient(px, py, 0, px, py, cs * 1.2);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = Math.min(1, (end - tau) * 3); g.fillStyle = gr; g.beginPath(); g.arc(px, py, cs * 1.2, 0, TAU); g.fill();
      r.cells.forEach((j, n) => {
        const tj = 0.12 + n * T.ray, d = tau - tj + 0.08;
        if (d < 0 || d > 0.3) return;
        const [qx, qy] = center(j);
        g.globalAlpha = 1 - d / 0.3;
        g.strokeStyle = r.c >= 0 ? GEMS[r.c].hi : '#fff'; g.lineWidth = cs * 0.08;
        g.beginPath(); g.moveTo(px, py);
        for (let s = 1; s < 6; s++) { const f = s / 6; g.lineTo(lerp(px, qx, f) + (Math.random() - 0.5) * cs * 0.4, lerp(py, qy, f) + (Math.random() - 0.5) * cs * 0.4); }
        g.lineTo(qx, qy); g.stroke();
      });
    }
    g.restore();
    // luciérnagas en vuelo
    for (let k = flies.length - 1; k >= 0; k--) {
      const f = flies[k], kk = (now - f.t) / f.dur;
      if (kk >= 1) { flies.splice(k, 1); const [qx, qy] = center(f.to); burst(qx, qy, 14, '#fff6a8', 1.2, 0.5, 'star'); continue; }
      const [ax, ay] = center(f.from), [bx, by] = center(f.to);
      const mx = (ax + bx) / 2 + (by - ay) * 0.3, my = Math.min(ay, by) - cs * 2;
      const e = ease(kk), x = (1 - e) * (1 - e) * ax + 2 * (1 - e) * e * mx + e * e * bx, y = (1 - e) * (1 - e) * ay + 2 * (1 - e) * e * my + e * e * by;
      if (Math.random() < 0.6) parts.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, color: '#fff6a8', kind: 'star', sz: cs * 0.07, rot: 0 });
      g.save(); g.translate(x, y); g.rotate((bx - ax) * 0.002 * Math.sin(kk * 9));
      paintPiece(g, f.c >= 0 ? f.c : 2, S.FLY, cs * 0.36, now);
      if (f.carry) { g.translate(0, cs * 0.35); g.scale(0.5, 0.5); paintPiece(g, f.c >= 0 ? f.c : 2, f.carry, cs * 0.42, now); }
      g.restore();
    }
    // anillos
    for (let k = ringsArr.length - 1; k >= 0; k--) {
      const r = ringsArr[k], kk = (now - r.t) / 0.35;
      if (kk >= 1) { ringsArr.splice(k, 1); continue; }
      g.globalAlpha = 1 - kk; g.strokeStyle = r.color; g.lineWidth = cs * 0.08 * (1 - kk);
      g.beginPath(); g.arc(r.x, r.y, cs * (0.3 + 0.6 * easeOut(kk)) * r.size, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
    // partículas
    for (const p of parts) {
      const a = Math.min(1, p.life / p.max * 1.6);
      g.globalAlpha = a; g.fillStyle = p.color;
      if (p.kind === 'star') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.sz * 1.6, -p.sz * 0.3, p.sz * 3.2, p.sz * 0.6); g.fillRect(-p.sz * 0.3, -p.sz * 1.6, p.sz * 0.6, p.sz * 3.2); g.restore(); }
      else if (p.kind === 'shard') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.sz, -p.sz * 0.6, p.sz * 2, p.sz * 1.2); g.restore(); }
      else { g.beginPath(); g.arc(p.x, p.y, p.sz * (p.kind === 'puff' ? 1 + (1 - p.life / p.max) : 1), 0, TAU); g.fill(); }
    }
    g.globalAlpha = 1;
    // textos
    for (let k = texts.length - 1; k >= 0; k--) {
      const x = texts[k], life = x.big ? 1.3 : 0.8, kk = (now - x.t) / life;
      if (kk >= 1) { texts.splice(k, 1); continue; }
      const pop = x.big ? (kk < 0.15 ? easeOut(kk / 0.15) * 1.15 : 1.15 - Math.min(0.15, (kk - 0.15) * 0.6)) : 1;
      let fs = (x.big ? cs * 0.9 : cs * 0.42) * x.size * pop;
      g.globalAlpha = kk > 0.7 ? (1 - kk) / 0.3 : 1;
      g.font = `900 ${fs}px system-ui, -apple-system, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      // los textos grandes no pasan del ancho del tablero
      const maxW = B.W * cs * 0.94, tw = g.measureText(x.str).width;
      if (x.big && tw > maxW) { fs *= maxW / tw; g.font = `900 ${fs}px system-ui, -apple-system, sans-serif`; }
      const y = x.y - kk * cs * (x.big ? 0.4 : 0.9);
      g.lineWidth = fs * 0.16; g.strokeStyle = 'rgba(40,10,70,.85)'; g.lineJoin = 'round'; g.strokeText(x.str, x.x, y);
      if (x.praise) {
        const gr = g.createLinearGradient(0, y - fs / 2, 0, y + fs / 2);
        gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.5, x.color); gr.addColorStop(1, '#ff8a3d');
        g.fillStyle = gr;
      } else g.fillStyle = x.color;
      g.fillText(x.str, x.x, y);
    }
    g.globalAlpha = 1;
  }

  function drawFlyers(g) {
    for (let k = flyers.length - 1; k >= 0; k--) {
      const f = flyers[k], kk = (now - f.t) / f.dur;
      if (kk >= 1) {
        flyers.splice(k, 1);
        if (f.kind === 'streak') { f.done?.(); continue; }
        onGoal?.(f.g);
        continue;
      }
      const e = ease(kk), mx = (f.x0 + f.x1) / 2 + (f.x0 < f.x1 ? -1 : 1) * 60, my = Math.min(f.y0, f.y1) - 40;
      const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * mx + e * e * f.x1, y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * my + e * e * f.y1;
      g.save(); g.translate(x, y);
      if (f.kind === 'streak') {
        g.fillStyle = f.c || '#fff'; g.shadowColor = f.c || '#fff'; g.shadowBlur = 14;
        g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
        g.restore(); continue;
      }
      const s = (L.cs || 40) * 0.3 * (1 - 0.35 * kk);
      if (f.kind === 'color') paintGem(g, GEMS[f.c], s);
      else if (f.kind === 'rock') paintRock(g, s, 1, 2);
      else if (f.kind === 'frost') paintFrost(g, s, 1);
      else if (f.kind === 'fog') { g.fillStyle = '#ffe3f6'; g.shadowColor = '#ff8fd8'; g.shadowBlur = 10; cloud(g, 0, 0, s * 1.1); }
      else if (f.kind === 'drop') paintDrop(g, s, 0);
      g.restore();
    }
  }

  function cellAt(px, py) {
    if (!B) return -1;
    const x = Math.floor((px - L.ox) / L.cs), y = Math.floor((py - L.oy) / L.cs);
    if (x < 0 || y < 0 || x >= B.W || y >= B.H) return -1;
    const i = y * B.W + x;
    return B.mask[i] ? i : -1;
  }

  return {
    resize, layout, setBoard, apply, reconcile, update, draw, busy, badSwap, cellAt, center, praise, text, burst, ring, streak, takeLanded,
    get L() { return L; }, get now() { return now; },
    set onGoal(f) { onGoal = f; }, set goalPos(f) { goalPos = f; }, set onSpecial(f) { onSpecial = f; }, set onLayer(f) { onLayer = f; }, set onFx(f) { onFx = f; },
    flash(a = 0.4) { flashes.push({ t: now, a }); }, shake(v) { shake = Math.max(shake, v); },
    clear() { B = null; vis.clear(); sched.length = 0; for (const a of [parts, beams, novas, rays, flies, texts, flyers, flashes]) a.length = 0; },
  };
}
