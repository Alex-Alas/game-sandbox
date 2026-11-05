// ABISMO — render ocultista de alto contraste: tinta casi negra sobre pergamino,
// oro para el peregrino y bermellón para todo lo que te va a doler.
// Capas: catedral de fondo (parallax), piso grabado, pilares, telegrafías,
// entidades, efectos y el velo de la DILACIÓN. Todo por código, sin assets.
import { ARENA, PILLARS } from './data.js';

const INK = '#07040a';
const BONE = '#f4e8cf';
const GOLD = '#ffc94a';
const BLOOD = '#ff3b54';
const OCCULT = '#a06bff';
const TIME = '#8fd8ff';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let backdrop = null, vignette = null, paper = null, floorCache = null, glowSprite = null, lampSprite = null;
  const trail = []; // estela del peregrino (posiciones en pantalla)

  function resize() {
    DPR = Math.min(1.5, window.devicePixelRatio || 1);
    W = canvas.clientWidth || innerWidth;
    H = canvas.clientHeight || innerHeight;
    floorCache = null;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    backdrop = null; vignette = null; paper = null;
  }
  addEventListener('resize', resize); resize();

  function makePaper() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#33201a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = 0.05 + Math.random() * 0.07;
      g.fillStyle = Math.random() < 0.5 ? '#241310' : '#4d2f20';
      g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 22, 2 + Math.random() * 16, Math.random() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    return ctx.createPattern(c, 'repeat');
  }

  // catedral de fondo: arcos, cadenas y velas (se cachea por tamaño)
  function makeBackdrop() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#140a1c');
    sky.addColorStop(0.55, '#0d0710');
    sky.addColorStop(1, '#07040a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    // arcos góticos gigantes
    const arch = (x, w, h, col) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x, H - h * 0.55);
      g.quadraticCurveTo(x + w / 2, H - h, x + w, H - h * 0.55);
      g.lineTo(x + w, H);
      g.closePath(); g.fill();
    };
    for (let i = 0; i < 7; i++) arch(-90 + i * (W / 5), W / 5 + 20, H * (0.5 + (i % 3) * 0.12), 'rgba(26,14,30,.85)');
    for (let i = 0; i < 5; i++) arch(-60 + i * (W / 3.2), W / 3.2 + 30, H * (0.34 + (i % 2) * 0.1), 'rgba(12,6,16,.9)');

    // cadenas colgando
    g.strokeStyle = 'rgba(120,96,70,.35)';
    for (let i = 0; i < 9; i++) {
      const x = (i * 137.5) % W, len = H * (0.15 + ((i * 7) % 5) * 0.05);
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + Math.sin(i) * 8, len); g.stroke();
      for (let k = 0; k < 5; k++) {
        g.beginPath(); g.ellipse(x + Math.sin(i) * 8 + Math.sin(k * 1.2) * 2, len * (k / 5), 3, 5, 0, 0, 7); g.stroke();
      }
    }

    // velas y su halo
    for (let i = 0; i < 14; i++) {
      const x = (i * 211 + 40) % W, y = H * (0.45 + ((i * 13) % 10) * 0.045);
      const gl = g.createRadialGradient(x, y, 1, x, y, 26);
      gl.addColorStop(0, 'rgba(255,190,90,.5)');
      gl.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(x, y, 26, 0, 7); g.fill();
      g.fillStyle = '#ffdc9a'; g.fillRect(x - 1, y - 4, 2, 4);
    }
    return c;
  }

  function makeVignette() {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(W / 2)); c.height = Math.max(2, Math.round(H / 2));
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.7, 'rgba(5,2,8,.45)');
    gr.addColorStop(1, 'rgba(5,2,8,.9)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ── figuras ──────────────────────────────────────────────────────────────
  function inkBlob(x, y, r, { bob = 0, face = 0, hp = 1, kind = 'walk', mark = 0, flash = 0, shield = 0 } = {}) {
    const breathe = 1 + Math.sin(bob * 1.6) * 0.03;
    ctx.save();
    ctx.translate(x, y + Math.sin(bob) * r * 0.04);

    // sombra
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.92, r * 1.02, r * 0.3, 0, 0, 7); ctx.fill();

    // charcos que chorrean (abajo, en espacio de pantalla)
    ctx.fillStyle = INK;
    for (let i = -1; i <= 1; i++) {
      const bx = i * r * 0.42;
      const h = r * (0.5 + (i + 2) * 0.16);
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.16, r * 0.3);
      ctx.quadraticCurveTo(bx - r * 0.1, r * 0.3 + h, bx, r * 0.3 + h);
      ctx.quadraticCurveTo(bx + r * 0.1, r * 0.3 + h, bx + r * 0.16, r * 0.3);
      ctx.closePath(); ctx.fill();
    }

    // cuerpo: gota de tinta suave (curvas por puntos medios)
    ctx.save();
    ctx.rotate(face);
    ctx.scale(breathe, breathe);
    const N = 16, pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const wob = 1 + 0.13 * Math.sin(i * 1.7 + bob * 1.1) + 0.08 * Math.sin(i * 3.3 - bob * 0.8) + 0.05 * Math.sin(i * 5.9 + bob * 1.7);
      // pico de capucha arriba (los enemigos se inclinan hacia el jugador)
      const hood = a > Math.PI * 1.2 && a < Math.PI * 1.8 ? 1.16 : 1;
      pts.push([Math.cos(a) * r * wob, Math.sin(a) * r * wob * 1.08 * hood]);
    }
    ctx.beginPath();
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let m0 = mid(pts[N - 1], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < N; i++) {
      const p = pts[i], q = pts[(i + 1) % N], m = mid(p, q);
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    if (flash > 0) { ctx.fillStyle = `rgba(255,246,224,${Math.min(0.55, flash * 5)})`; ctx.fill(); }
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.strokeStyle = mark > 0 ? BLOOD : 'rgba(244,232,207,.34)';
    ctx.stroke();

    // ojos: dos brasas
    const eye = kind === 'shield' ? OCCULT : BLOOD;
    ctx.fillStyle = eye;
    ctx.shadowColor = eye; ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.ellipse(r * 0.2, -r * 0.14, r * 0.1, r * 0.14, -0.25, 0, 7);
    ctx.ellipse(r * 0.5, -r * 0.14, r * 0.1, r * 0.14, 0.25, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (kind === 'armored') {
      ctx.strokeStyle = 'rgba(244,232,207,.55)'; ctx.lineWidth = Math.max(1.2, r * 0.07);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.68, -0.8, 0.8); ctx.stroke();
    }
    if (kind === 'shield' && shield > 0) {
      ctx.strokeStyle = 'rgba(160,107,255,.55)'; ctx.lineWidth = Math.max(1.4, r * 0.08);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.16, -1.1, 1.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 1.16, Math.PI - 1.1, Math.PI + 1.1); ctx.stroke();
    }
    if (kind === 'bomb') {
      ctx.fillStyle = `rgba(255,59,84,${0.3 + 0.3 * Math.sin(bob * 6)})`;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, 7); ctx.fill();
    }
    ctx.restore();

    if (mark > 0) { // sigilo girando (espacio de pantalla)
      const a0 = performance.now() / 420;
      ctx.strokeStyle = BLOOD; ctx.lineWidth = Math.max(1.2, r * 0.07);
      for (let i = 0; i < 3; i++) {
        const a = a0 + (i / 3) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.3, a, a + 0.45); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function pilgrim(x, y, r, skin, { alpha = 1, face = -Math.PI / 2, dash = 0 } = {}) {
    const t = performance.now() / 320;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (dash > 0) ctx.scale(1 + dash * 0.25, 1 - dash * 0.12);
    // resplandor
    const gl = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.8);
    gl.addColorStop(0, `${skin}3a`); gl.addColorStop(1, `${skin}00`);
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.8, 0, 7); ctx.fill();
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.9, r * 0.3, 0, 0, 7); ctx.fill();
    // manto
    ctx.fillStyle = '#140c04';
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(1.4, r * 0.13);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.02);
    ctx.quadraticCurveTo(r * 1.02, -r * 0.5, r * 0.8, r * 0.98);
    ctx.quadraticCurveTo(0, r * 1.22, -r * 0.8, r * 0.98);
    ctx.quadraticCurveTo(-r * 1.02, -r * 0.5, 0, -r * 1.02);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // capucha
    ctx.fillStyle = '#221505';
    ctx.beginPath(); ctx.arc(0, -r * 0.38, r * 0.5, 0, 7); ctx.fill(); ctx.stroke();
    // ojos + brasa
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(-r * 0.19, -r * 0.4, r * 0.11, 0, 7); ctx.arc(r * 0.19, -r * 0.4, r * 0.11, 0, 7); ctx.fill();
    ctx.shadowColor = skin; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(0, r * 0.28, r * 0.17 + Math.sin(t * 2) * r * 0.02, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    // halo
    ctx.strokeStyle = skin; ctx.globalAlpha = alpha * 0.85; ctx.lineWidth = Math.max(1.4, r * 0.1);
    ctx.beginPath(); ctx.arc(0, -r * 1.18, r * 0.4, 0, 7); ctx.stroke();
    ctx.restore();
  }

  // columna de catedral: base en sombra, fuste con bandas y capitel dorado
  function pillar(q, sx, sy, zoom) {
    const r = q.r * zoom;
    ctx.save();
    // sombra proyectada hacia afuera del centro
    const ang = Math.atan2(sy - H / 2, sx - W / 2);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath();
    ctx.ellipse(sx + Math.cos(ang) * r * 0.9, sy + Math.sin(ang) * r * 0.9, r * 1.5, r * 1.05, ang, 0, 7);
    ctx.fill();
    // base
    ctx.fillStyle = '#120a12';
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.5, r * 1.15, r * 0.6, 0, 0, 7); ctx.fill();
    // fuste (cilindro)
    const g = ctx.createLinearGradient(sx - r, sy, sx + r, sy);
    g.addColorStop(0, '#0a060c');
    g.addColorStop(0.42, '#221628');
    g.addColorStop(0.62, '#170f1c');
    g.addColorStop(1, '#08040a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.82, 0, 0, 7); ctx.fill();
    // bandas
    ctx.strokeStyle = 'rgba(255,201,74,.28)'; ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.78, r * 0.64, 0, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.22, r * 0.86, r * 0.7, 0, 0, 7); ctx.stroke();
    // capitel: borde hueso
    ctx.strokeStyle = 'rgba(244,232,207,.6)'; ctx.lineWidth = Math.max(1.4, r * 0.08);
    ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.82, 0, 0, 7); ctx.stroke();
    // vela encima
    ctx.fillStyle = 'rgba(255,214,140,.9)';
    ctx.beginPath(); ctx.arc(sx, sy - r * 0.16, Math.max(1.5, r * 0.1), 0, 7); ctx.fill();
    const gl = ctx.createRadialGradient(sx, sy - r * 0.16, 1, sx, sy - r * 0.16, r * 1.6);
    gl.addColorStop(0, 'rgba(255,196,110,.28)'); gl.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(sx, sy - r * 0.16, r * 1.6, 0, 7); ctx.fill();
    ctx.restore();
  }

  // el piso (papel, manchas, props, sello) se dibuja una vez por tamaño:
  // redibujarlo cada cuadro cuesta carísimo en un teléfono sin GPU
  function makeFloor(zoom, arenaR) {
    const R = arenaR * zoom;
    const size = Math.max(8, Math.ceil(R * 2 * DPR));
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.scale(size / (R * 2), size / (R * 2));
    const cx = R, cy = R;
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    g.fillStyle = '#2a1a14'; g.fillRect(0, 0, R * 2, R * 2);
    const pat = g.createPattern(paperTileCanvas(), 'repeat');
    g.fillStyle = pat; g.fillRect(0, 0, R * 2, R * 2);
    const floor = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    floor.addColorStop(0, 'rgba(255,201,74,.18)');
    floor.addColorStop(0.45, 'rgba(20,10,18,.35)');
    floor.addColorStop(1, 'rgba(4,2,8,.9)');
    g.fillStyle = floor; g.fillRect(0, 0, R * 2, R * 2);

    for (let i = 0; i < 22; i++) {
      const a = i * 2.399963;
      const rr = R * Math.sqrt((i + 0.5) / 22) * 0.9;
      const bx = cx + Math.cos(a) * rr, by = cy + Math.sin(a) * rr;
      const s0 = 10 + ((i * 29) % 26);
      g.globalAlpha = 0.22;
      g.fillStyle = i % 4 ? '#0c0610' : '#3a1a24';
      g.beginPath(); g.ellipse(bx, by, s0, s0 * 0.62, a, 0, 7); g.fill();
      g.globalAlpha = 1;
    }
    // props: velas, huesos y escombros
    for (let i = 0; i < 16; i++) {
      const a = i * 1.71 + 0.4;
      const rr = R * (0.18 + ((i * 13) % 70) / 100);
      const bx = cx + Math.cos(a) * rr, by = cy + Math.sin(a) * rr;
      if (i % 3 === 0) {
        g.fillStyle = 'rgba(255,236,200,.8)'; g.fillRect(bx - 1.5, by - 8, 3, 8);
        const gl = g.createRadialGradient(bx, by - 9, 1, bx, by - 9, 22);
        gl.addColorStop(0, 'rgba(255,190,90,.4)'); gl.addColorStop(1, 'rgba(255,150,60,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(bx, by - 9, 22, 0, 7); g.fill();
      } else if (i % 3 === 1) {
        g.strokeStyle = 'rgba(224,208,178,.45)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(bx - 9, by + 2); g.lineTo(bx + 9, by - 3); g.stroke();
        g.beginPath(); g.moveTo(bx - 5, by - 5); g.lineTo(bx + 3, by + 5); g.stroke();
      } else {
        g.fillStyle = 'rgba(10,5,10,.5)';
        g.beginPath(); g.ellipse(bx, by, 7, 4, i, 0, 7); g.fill();
      }
    }
    // anillos grabados
    g.strokeStyle = 'rgba(255,201,74,.08)'; g.lineWidth = 2;
    for (let i = 1; i <= 4; i++) { g.beginPath(); g.arc(cx, cy, R * (i / 5), 0, 7); g.stroke(); }
    // sello
    const seal = R * 0.55;
    g.strokeStyle = 'rgba(255,201,74,.32)'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, seal, 0, 7); g.stroke();
    g.setLineDash([7, 9]);
    g.beginPath(); g.arc(cx, cy, seal * 0.8, 0, 7); g.stroke();
    g.setLineDash([]);
    g.lineWidth = 2.4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * seal * 0.8, cy + Math.sin(a) * seal * 0.8);
      g.lineTo(cx + Math.cos(a) * seal, cy + Math.sin(a) * seal);
      g.stroke();
    }
    g.lineWidth = 2.4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const gx = cx + Math.cos(a) * seal * 0.42, gy = cy + Math.sin(a) * seal * 0.42;
      const u = 13;
      g.beginPath();
      if (i % 3 === 0) { g.moveTo(gx, gy - u); g.lineTo(gx, gy + u); g.moveTo(gx, gy - u * 0.4); g.lineTo(gx + u * 0.7, gy - u); }
      else if (i % 3 === 1) { g.moveTo(gx - u * 0.6, gy - u); g.lineTo(gx + u * 0.6, gy - u); g.lineTo(gx, gy + u); g.closePath(); }
      else { g.moveTo(gx - u * 0.6, gy + u); g.lineTo(gx, gy - u); g.lineTo(gx + u * 0.6, gy + u); g.moveTo(gx - u * 0.6, gy - u); g.lineTo(gx + u * 0.6, gy - u); }
      g.stroke();
    }
    g.restore();
    return c;
  }

  let paperTileC = null;
  function paperTileCanvas() {
    if (paperTileC) return paperTileC;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#33201a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = 0.05 + Math.random() * 0.07;
      g.fillStyle = Math.random() < 0.5 ? '#241310' : '#4d2f20';
      g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 22, 2 + Math.random() * 16, Math.random() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    paperTileC = c;
    return c;
  }

  const clamp = (v, a, b) => (a > b ? (a + b) / 2 : v < a ? a : v > b ? b : v);

  function draw(s, fx = {}) {
    if (!paper) paper = makePaper();
    if (!backdrop) backdrop = makeBackdrop();
    if (!vignette) vignette = makeVignette();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const zoom = Math.min(W, H) / 520;
    const halfW = W / (2 * zoom), halfH = H / (2 * zoom);
    const shx = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const shy = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const camX = clamp(s.p.x, -s.arenaR + halfW, s.arenaR - halfW);
    const camY = clamp(s.p.y, -s.arenaR + halfH, s.arenaR - halfH);
    const sx = (x) => W / 2 + (x - camX) * zoom + shx;
    const sy = (y) => H / 2 + (y - camY) * zoom + shy;

    // fondo con parallax (solo si el círculo no tapa la pantalla)
    const rimX = s.arenaR * zoom * 2 > W + 4, rimY = s.arenaR * zoom * 2 > H + 4;
    if (!(rimX && rimY)) ctx.drawImage(backdrop, -camX * 0.06, -camY * 0.06, W, H);
    else { ctx.fillStyle = '#07040a'; ctx.fillRect(0, 0, W, H); }
    if (s.dilate) { ctx.fillStyle = 'rgba(20,10,40,.35)'; ctx.fillRect(0, 0, W, H); }

    const ox = sx(0), oy = sy(0);

    // piso cacheado (papel, manchas, props, sello)
    if (!floorCache) floorCache = makeFloor(zoom, s.arenaR);
    const FR = s.arenaR * zoom;
    ctx.drawImage(floorCache, ox - FR, oy - FR, FR * 2, FR * 2);

    // halo del Abismo sobre el borde
    ctx.strokeStyle = 'rgba(150,30,60,.28)'; ctx.lineWidth = Math.max(6, 16 * zoom);
    ctx.beginPath(); ctx.arc(ox, oy, s.arenaR * zoom * 1.01, 0, 7); ctx.stroke();
    // borde del Abismo
    ctx.strokeStyle = '#05030a'; ctx.lineWidth = Math.max(6, 14 * zoom);
    ctx.beginPath(); ctx.arc(ox, oy, s.arenaR * zoom, 0, 7); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1.4, 2.5 * zoom); ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.arc(ox, oy, (s.arenaR - 4) * zoom, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;

    // luz cálida alrededor del peregrino: el piso se lee alrededor suyo
    if (!lampSprite) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,214,150,.30)');
      gr.addColorStop(0.45, 'rgba(255,180,100,.13)');
      gr.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      lampSprite = c;
    }
    ctx.globalCompositeOperation = 'lighter';
    const LR = 300 * zoom;
    ctx.drawImage(lampSprite, sx(s.p.x) - LR, sy(s.p.y) - LR, LR * 2, LR * 2);
    ctx.globalCompositeOperation = 'source-over';

    // sellos en el piso (runas) y explosiones
    for (const f of s.fields) {
      const x = sx(f.x), y = sy(f.y), R = f.r * zoom;
      if (f.kind === 'boom') {
        const k = 1 - Math.max(0, f.t) / f.max;
        ctx.fillStyle = `rgba(255,59,84,${0.16 + k * 0.3})`;
        ctx.beginPath(); ctx.arc(x, y, R * (0.4 + k * 0.6), 0, 7); ctx.fill();
      } else {
        const k = 1 - Math.max(0, f.t) / f.max;
        ctx.strokeStyle = OCCULT; ctx.globalAlpha = 0.4 + k * 0.6;
        ctx.lineWidth = Math.max(1.5, 3 * zoom);
        ctx.beginPath(); ctx.arc(x, y, R * (1 - k * 0.15), 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, R * 0.55, 0, 7); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ondas (campana / cadena)
    for (const w of s.waves) {
      const a = Math.max(0, w.life / (w.maxLife || 0.6));
      ctx.strokeStyle = w.chain ? `rgba(232,192,122,${a * 0.7})` : `rgba(143,216,255,${a})`;
      ctx.lineWidth = Math.max(2, (w.chain ? 5 : 4) * zoom);
      ctx.beginPath(); ctx.arc(sx(w.x), sy(w.y), w.r * zoom, 0, 7); ctx.stroke();
    }

    // telegrafías de enemigos
    for (const f of s.foes) {
      if (f.dead) continue;
      const x = sx(f.x), y = sy(f.y), R = f.r * zoom;
      if (f.kind === 'lunge' && f.st === 'warn') {
        const a = Math.atan2(s.p.y - f.y, s.p.x - f.x);
        ctx.strokeStyle = 'rgba(255,59,84,.8)'; ctx.lineWidth = Math.max(2, 3 * zoom);
        ctx.setLineDash([8 * zoom, 6 * zoom]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 260 * zoom, y + Math.sin(a) * 260 * zoom); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (f.st === 'aim') {
        const a = f.face;
        ctx.strokeStyle = 'rgba(255,59,84,.6)'; ctx.lineWidth = Math.max(1.5, 2 * zoom);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 460 * zoom, y + Math.sin(a) * 460 * zoom); ctx.stroke();
      }
      if (f.kind === 'shield' && f.shield > 0) {
        ctx.strokeStyle = 'rgba(160,107,255,.5)'; ctx.lineWidth = Math.max(1.4, 2 * zoom);
        ctx.beginPath(); ctx.arc(x, y, R * 1.4, 0, 7); ctx.stroke();
      }
    }

    // jefe: cuerpo + patrones
    if (s.boss && !s.boss.dead) {
      const b = s.boss, x = sx(b.x), y = sy(b.y), R = b.r * zoom;
      // telegrafía
      if (b.st === 'gaze') {
        const a = Math.atan2(s.p.y - b.y, s.p.x - b.x);
        const active = b.tm <= 0;
        const blocked = false;
        const wid = (active ? 62 : 42) * zoom;
        const ex = x + Math.cos(a) * 1600 * zoom, ey = y + Math.sin(a) * 1600 * zoom;
        ctx.strokeStyle = active ? 'rgba(255,59,84,.22)' : 'rgba(255,59,84,.12)';
        ctx.lineWidth = wid * 1.9;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = active ? 'rgba(255,120,140,.9)' : 'rgba(255,59,84,.55)';
        ctx.lineWidth = wid;
        if (!active) ctx.setLineDash([14 * zoom, 12 * zoom]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = active ? 'rgba(255,240,240,.95)' : 'rgba(255,180,190,.5)';
        ctx.lineWidth = Math.max(2, wid * 0.22);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (b.st === 'sweep') {
        const active = b.tm <= 0;
        ctx.fillStyle = active ? 'rgba(255,59,84,.35)' : 'rgba(255,59,84,.16)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, 220 * zoom, b.warnA - b.warnArc, b.warnA + b.warnArc);
        ctx.closePath(); ctx.fill();
      }
      if (b.st === 'nova' && b.tm > 0) {
        const k = 1 - b.tm / 0.9;
        ctx.strokeStyle = `rgba(255,59,84,${0.25 + k * 0.5})`;
        ctx.lineWidth = Math.max(2, 4 * zoom);
        ctx.beginPath(); ctx.arc(x, y, (40 + k * 90) * zoom, 0, 7); ctx.stroke();
      }
      // sombra en el piso
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.9, R * 1.05, R * 0.36, 0, 0, 7); ctx.fill();
      // aura
      const pulse = 0.5 + 0.5 * Math.sin(b.t * 3);
      ctx.strokeStyle = b.exposed > 0 ? `rgba(255,201,74,${0.5 + pulse * 0.5})` : `rgba(160,107,255,${0.3 + pulse * 0.3})`;
      ctx.lineWidth = Math.max(2, (b.exposed > 0 ? 6 : 3) * zoom);
      ctx.beginPath(); ctx.arc(x, y, R * (1.25 + pulse * 0.06), 0, 7); ctx.stroke();
      // cuerpo: ojo gigante de tinta
      // pestañas de tinta
      ctx.strokeStyle = 'rgba(7,4,10,.9)'; ctx.lineWidth = Math.max(2, 5 * zoom);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + b.t * 0.2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * R * 0.95, y + Math.sin(a) * R * 0.82);
        ctx.lineTo(x + Math.cos(a) * R * 1.35, y + Math.sin(a) * R * 1.2);
        ctx.stroke();
      }
      ctx.fillStyle = INK;
      ctx.strokeStyle = b.exposed > 0 ? GOLD : 'rgba(244,232,207,.55)';
      ctx.lineWidth = Math.max(1.6, 2.6 * zoom);
      ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.86, b.t * 0.2, 0, 7); ctx.fill(); ctx.stroke();
      const iris = b.exposed > 0 ? GOLD : BLOOD;
      ctx.fillStyle = iris; ctx.shadowColor = iris; ctx.shadowBlur = 26;
      ctx.beginPath(); ctx.arc(x, y, R * 0.42, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#12060c';
      ctx.beginPath(); ctx.arc(x, y, R * 0.17, 0, 7); ctx.fill();
      // párpado
      ctx.strokeStyle = BONE; ctx.lineWidth = Math.max(1.5, 3 * zoom);
      ctx.beginPath(); ctx.ellipse(x, y, R * 1.02, R * 0.9, b.t * 0.2, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }

    // pilares (tapan el rayo: se dibujan después del jefe)
    for (const q of s.pillars) pillar(q, sx(q.x), sy(q.y), zoom);

    // almas
    if (!glowSprite) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,235,170,1)'); gr.addColorStop(0.35, 'rgba(255,201,74,.55)'); gr.addColorStop(1, 'rgba(255,201,74,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      glowSprite = c;
    }
    for (const so of s.souls) {
      const x = sx(so.x), y = sy(so.y);
      const rr = Math.max(9, 22 * zoom) * (1 + Math.sin(performance.now() / 150 + so.x) * 0.08);
      ctx.drawImage(glowSprite, x - rr, y - rr, rr * 2, rr * 2);
    }

    // enemigos
    for (const f of s.foes) {
      if (f.dead) continue;
      inkBlob(sx(f.x), sy(f.y), f.r * zoom * 1.35, {
        bob: f.t * 5, face: f.face, hp: f.hp / f.maxhp, kind: f.kind,
        mark: f.mark, flash: f.hitT, shield: f.shield,
      });
      if (f.maxhp >= 150) {
        const w = 40 * zoom, y0 = sy(f.y) - f.r * zoom * 2.05, hh = Math.max(2.5, 3 * zoom);
        ctx.fillStyle = 'rgba(7,4,10,.85)'; ctx.fillRect(sx(f.x) - w / 2 - 1, y0 - 1, w + 2, hh + 2);
        ctx.fillStyle = BLOOD; ctx.fillRect(sx(f.x) - w / 2, y0, w * Math.max(0, f.hp / f.maxhp), hh);
      }
    }

    // disparos
    for (const sh of s.shots) {
      const x = sx(sh.x), y = sy(sh.y);
      const col = sh.kind === 'pua' ? GOLD : sh.kind === 'brasa' ? '#ff7a3d' : BONE;
      const rr = Math.max(2, 5 * zoom);
      const tail = sh.kind === 'pua' ? 26 : 12;
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.4, 3 * zoom); ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sh.vx * 0.02 * zoom * tail / 12, y - sh.vy * 0.02 * zoom * tail / 12); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
    }
    for (const e of s.eshots) {
      const x = sx(e.x), y = sy(e.y), rr = Math.max(2.4, 6 * zoom);
      ctx.fillStyle = BLOOD; ctx.shadowColor = BLOOD; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // mascota
    if (s.pet && s.pet.life > 0) {
      inkBlob(sx(s.pet.x), sy(s.pet.y), 14 * zoom, { bob: performance.now() / 120, face: 0, kind: 'pet' });
      ctx.strokeStyle = '#7dff9b'; ctx.lineWidth = Math.max(1.5, 2 * zoom);
      ctx.beginPath(); ctx.arc(sx(s.pet.x), sy(s.pet.y), 22 * zoom, 0, 7); ctx.stroke();
    }

    // peregrino + estela
    const px = sx(s.p.x), py = sy(s.p.y);
    trail.push({ x: px, y: py, t: performance.now() });
    while (trail.length > 14) trail.shift();
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i], a = (i / trail.length) * 0.32;
      ctx.fillStyle = `rgba(255,201,74,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 12 * zoom * (i / trail.length), 0, 7); ctx.fill();
    }
    // imán
    ctx.strokeStyle = 'rgba(255,201,74,.10)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.arc(px, py, s.magnet * zoom, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    pilgrim(px, py, 26 * zoom, fx.skin || GOLD, { alpha: s.inv > 0 ? 0.72 : 1, dash: s.dashT > 0 ? 1 : 0 });

    // cargas de dash alrededor del peregrino
    for (let i = 0; i < s.dashMax; i++) {
      const a = -Math.PI / 2 + (i - (s.dashMax - 1) / 2) * 0.55;
      const d = 46 * zoom;
      const on = i < s.dashCharges;
      ctx.fillStyle = on ? GOLD : 'rgba(244,232,207,.22)';
      ctx.beginPath();
      const cx2 = px + Math.cos(a) * d, cy2 = py + Math.sin(a) * d - 12 * zoom;
      ctx.moveTo(cx2, cy2 - 4.5 * zoom); ctx.lineTo(cx2 + 4 * zoom, cy2); ctx.lineTo(cx2, cy2 + 4.5 * zoom); ctx.lineTo(cx2 - 4 * zoom, cy2);
      ctx.closePath(); ctx.fill();
    }

    // partículas
    for (const pt of s.parts) {
      const a = Math.max(0, pt.life * 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.kind === 'gold' ? GOLD : INK;
      const r = Math.max(1.6, (pt.r || 3) * zoom);
      ctx.beginPath(); ctx.arc(sx(pt.x), sy(pt.y), r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // velo de dilación: tinte violáceo + líneas radiales
    if (s.dilate) {
      ctx.fillStyle = 'rgba(70,40,140,.16)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(143,216,255,.10)'; ctx.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + performance.now() / 3000;
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(a) * Math.min(W, H) * 0.34, H / 2 + Math.sin(a) * Math.min(W, H) * 0.34);
        ctx.lineTo(W / 2 + Math.cos(a) * Math.max(W, H) * 0.8, H / 2 + Math.sin(a) * Math.max(W, H) * 0.8);
        ctx.stroke();
      }
    }

    // flashes
    if (fx.flash) { ctx.fillStyle = `rgba(255,244,214,${Math.min(0.55, fx.flash * 0.5)})`; ctx.fillRect(0, 0, W, H); }
    if (fx.hurt > 0.02) {
      const hv = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.62);
      hv.addColorStop(0, 'rgba(255,59,84,0)');
      hv.addColorStop(1, `rgba(255,59,84,${Math.min(0.55, fx.hurt * 0.5)})`);
      ctx.fillStyle = hv; ctx.fillRect(0, 0, W, H);
    }
    if (fx.perfect) {
      ctx.strokeStyle = `rgba(143,216,255,${fx.perfect})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(px, py, (1 - fx.perfect) * 220 + 40, 0, 7); ctx.stroke();
    }

    ctx.drawImage(vignette, 0, 0, W, H);
  }
  return { draw, resize };
}
