// La interfaz del kit, dibujada con el mismo pincel que los personajes (Canvas 2D, nada de imágenes):
// máscaras de vida, frasco de alma con líquido que se mece, barra del jefe con daño que se demora,
// cuadro de diálogo con máquina de escribir, ranuras con íconos y botones de menú con pincelada.
import { type V, spline, taper, brush, pathOf, mulberry, lerp, clamp } from '../draw/curves.ts';

const INK = '#0b0910', BONE = '#efe7d8', BONE2 = '#b9ad9c', CRIM = '#c22a3a', CRIM2 = '#6e1530', EMBER = '#ffad5a';

function br(c: CanvasRenderingContext2D, pts: V[], w0: number, w1: number, color: string, peak = 0.2, per = 8) {
  const s = pts.length > 2 ? spline(pts, false, per) : pts;
  const f = brush(w0, w1, peak);
  c.fillStyle = color;
  c.fill(pathOf(taper(s, (t) => f(t) * 0.5)));
}
function hidpi(cv: HTMLCanvasElement, w: number, h: number) {
  const d = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const c = cv.getContext('2d')!;
  c.setTransform(d, 0, 0, d, 0, 0);
  return c;
}

// La máscara de la heroína en chico (la misma silueta del personaje)
function mask(c: CanvasRenderingContext2D, x: number, y: number, s: number, full: number, crack: number) {
  const P = (a: number, b: number): V => [x + a * s, y + b * s];
  const m: V[] = [P(-0.6, -11.2), P(6.6, -8.8), P(9.8, -2.6), P(10.2, 2.4), P(8.4, 7.2), P(5.4, 12.6), P(2.2, 10.4), P(-2.2, 8.6), P(-6.6, 3.6), P(-7.6, -5.2)];
  const path = pathOf(spline(m, true, 6, m.map((_, i) => i === 5)));
  c.save();
  c.lineJoin = 'round';
  c.strokeStyle = INK; c.lineWidth = 2.6 * s; c.stroke(path);
  if (full > 0.01) {
    c.fillStyle = BONE; c.globalAlpha = 0.25 + 0.75 * full; c.fill(path); c.globalAlpha = 1;
    c.save(); c.clip(path);
    const sh = new Path2D(); sh.rect(x - 40, y - 40, 80, 80); sh.addPath(path, new DOMMatrix([1, 0, 0, 1, 2.2 * s, -2.6 * s]));
    c.fillStyle = 'rgba(150,135,175,0.75)'; c.fill(sh, 'evenodd');
    c.restore();
    // ojos
    c.fillStyle = INK;
    c.beginPath(); c.ellipse(x + 4.8 * s, y + 0.4 * s, 1.8 * s, 3 * s, 0.18, 0, 6.3); c.fill();
    c.beginPath(); c.ellipse(x - 2.2 * s, y + 0.2 * s, 1.2 * s, 2.7 * s, 0.1, 0, 6.3); c.fill();
    c.fillStyle = CRIM;
    br(c, [P(1.8, -11.4), P(2.6, -8.4), P(3.4, -6.2)], 1.8 * s, 0.2, CRIM, 0.15);
  } else {
    c.fillStyle = 'rgba(30,26,38,0.7)'; c.fill(path);
  }
  if (crack > 0) {
    c.strokeStyle = INK; c.lineWidth = 1.2 * s;
    c.beginPath(); c.moveTo(...P(-1, -11)); c.lineTo(...P(1.5, -5)); c.lineTo(...P(-1.5, 0)); c.lineTo(...P(1.6, 6 * crack)); c.stroke();
  }
  c.restore();
}

export class UIKit {
  root: HTMLElement;
  hud: HTMLCanvasElement; boss: HTMLCanvasElement; dlg: HTMLCanvasElement;
  t = 0;
  // estado que la escena alimenta
  hp = 5; hpMax = 5; soul = 0.6;
  bossHp = 1; bossShown = 1; bossLag = 1; bossName = 'El Verdugo de Ceniza';
  text = ''; shown = 0; speaker = '';
  portrait: HTMLCanvasElement | null = null;
  lostAt: number[] = [];
  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = '';
    const mk = (cls: string) => { const d = document.createElement('div'); d.className = cls; root.appendChild(d); return d; };
    this.hud = document.createElement('canvas'); mk('hud').appendChild(this.hud);
    this.boss = document.createElement('canvas'); mk('boss').appendChild(this.boss);
    this.dlg = document.createElement('canvas'); mk('dlg').appendChild(this.dlg);
    const slots = mk('slots');
    for (const k of ['frasco', 'llave', 'brasa', 'pluma', 'moneda', 'mapa']) {
      const cv = document.createElement('canvas');
      cv.title = k;
      slots.appendChild(cv);
      drawSlot(cv, k);
    }
    const menu = mk('menu');
    for (const label of ['Continuar', 'Opciones', 'Salir']) {
      const b = document.createElement('button');
      b.className = 'kbtn';
      const cv = document.createElement('canvas');
      b.appendChild(cv);
      const sp = document.createElement('span'); sp.textContent = label; b.appendChild(sp);
      menu.appendChild(b);
      const draw = (hov: boolean) => drawButton(cv, hov, label.length);
      draw(false);
      b.onpointerenter = () => draw(true);
      b.onpointerleave = () => draw(false);
    }
  }
  say(speaker: string, text: string) { this.speaker = speaker; this.text = text; this.shown = 0; }
  update(dt: number) {
    this.t += dt;
    this.shown = Math.min(this.text.length, this.shown + dt * 38);
    // la barra blanca de daño se demora y después baja
    this.bossShown += (this.bossHp - this.bossShown) * Math.min(1, dt * 14);
    if (this.bossLag > this.bossHp) this.bossLag = Math.max(this.bossHp, this.bossLag - dt * 0.35 * (this.t % 1 > 0 ? 1 : 1));
    else this.bossLag = this.bossHp;
    this.drawHud(); this.drawBoss(); this.drawDlg();
  }

  drawHud() {
    const W = 280, H = 76;
    const c = hidpi(this.hud, W, H);
    c.clearRect(0, 0, W, H);
    // frasco de alma: círculo con líquido carmesí que se mece
    const ox = 38, oy = 38, R = 30;
    c.save();
    c.beginPath(); c.arc(ox, oy, R, 0, Math.PI * 2); c.fillStyle = 'rgba(12,10,18,0.85)'; c.fill();
    c.clip();
    const lvl = oy + R - this.soul * R * 2;
    c.beginPath();
    c.moveTo(ox - R, oy + R);
    for (let x = -R; x <= R; x += 2) c.lineTo(ox + x, lvl + Math.sin(x * 0.18 + this.t * 3) * 2.2 + Math.sin(x * 0.07 - this.t * 2) * 1.5);
    c.lineTo(ox + R, oy + R); c.closePath();
    const g = c.createLinearGradient(0, lvl, 0, oy + R);
    g.addColorStop(0, '#ff5b5b'); g.addColorStop(0.15, CRIM); g.addColorStop(1, '#3e0816');
    c.fillStyle = g; c.fill();
    // burbujas
    const r = mulberry(Math.floor(this.t * 2));
    for (let i = 0; i < 4; i++) { const bx = ox - R * 0.6 + r() * R * 1.2, by = oy + R - ((this.t * 14 + i * 13) % (R * 2 * this.soul + 1)); c.fillStyle = 'rgba(255,200,190,0.35)'; c.beginPath(); c.arc(bx, by, 1 + r(), 0, 6.3); c.fill(); }
    // reflejo
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.ellipse(ox - 10, oy - 12, 8, 14, -0.5, 0, 6.3); c.fill();
    c.restore();
    // aro de hueso con cuernos
    br(c, Array.from({ length: 13 }, (_, i) => { const a = -Math.PI * 0.5 + i / 12 * Math.PI * 2; return [ox + Math.cos(a) * (R + 2), oy + Math.sin(a) * (R + 2)] as V; }), 5, 5, INK, 0.01);
    br(c, Array.from({ length: 13 }, (_, i) => { const a = -Math.PI * 0.5 + i / 12 * Math.PI * 2; return [ox + Math.cos(a) * (R + 2), oy + Math.sin(a) * (R + 2)] as V; }), 2.4, 2.4, BONE2, 0.01);
    br(c, [[ox - 18, oy - 26], [ox - 30, oy - 40], [ox - 22, oy - 52 + 16]], 6, 0.5, INK, 0.2);
    br(c, [[ox - 18, oy - 26], [ox - 30, oy - 40], [ox - 22, oy - 52 + 16]], 3.4, 0.3, BONE, 0.2);
    // máscaras
    for (let i = 0; i < this.hpMax; i++) {
      const lost = i >= this.hp;
      const bob = lost ? 0 : Math.sin(this.t * 2 + i * 0.7) * 0.6;
      mask(c, 86 + i * 34, 36 + bob, 1.55, lost ? 0 : 1, lost ? 1 : 0);
    }
  }

  drawBoss() {
    const W = Math.min(620, window.innerWidth * 0.86), H = 58;
    const c = hidpi(this.boss, W, H);
    c.clearRect(0, 0, W, H);
    // nombre
    c.font = `600 ${W < 420 ? 15 : 18}px ${getComputedStyle(document.body).getPropertyValue('--serif') || 'Georgia, serif'}`;
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillText(this.bossName.toUpperCase().split('').join(' '), W / 2 + 1, 19);
    c.fillStyle = BONE; c.fillText(this.bossName.toUpperCase().split('').join(' '), W / 2, 18);
    const x0 = 34, x1 = W - 14, y = 36, h = 10;
    // marco de tinta (pincelada)
    br(c, [[x0 - 6, y], [W / 2, y - 1], [x1 + 8, y]], h + 8, h + 6, INK, 0.02, 4);
    // fondo
    c.fillStyle = '#1a0d14'; c.fillRect(x0, y - h / 2, x1 - x0, h);
    // daño demorado (blanco que baja) y vida (brasa)
    c.fillStyle = 'rgba(255,240,225,0.85)'; c.fillRect(x0, y - h / 2, (x1 - x0) * this.bossLag, h);
    const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, '#ff8a4a'); g.addColorStop(0.45, CRIM); g.addColorStop(1, '#4d0a18');
    c.fillStyle = g; c.fillRect(x0, y - h / 2, (x1 - x0) * this.bossShown, h);
    // grietas que laten dentro de la barra
    c.save(); c.beginPath(); c.rect(x0, y - h / 2, (x1 - x0) * this.bossShown, h); c.clip();
    const r = mulberry(3);
    c.strokeStyle = `rgba(255,190,110,${0.35 + 0.25 * Math.sin(this.t * 3)})`; c.lineWidth = 1;
    for (let i = 0; i < 18; i++) { const x = x0 + r() * (x1 - x0); c.beginPath(); c.moveTo(x, y - h / 2); c.lineTo(x + 4 - r() * 8, y); c.lineTo(x + 3 - r() * 6, y + h / 2); c.stroke(); }
    c.restore();
    // calavera con cuernos en la punta izquierda
    const sx = x0 - 10, sy = y;
    br(c, [[sx + 2, sy - 6], [sx - 8, sy - 16], [sx - 2, sy - 22]], 5, 0.4, INK, 0.2);
    br(c, [[sx + 2, sy - 6], [sx - 8, sy - 16], [sx - 2, sy - 22]], 2.8, 0.2, '#4a4252', 0.2);
    c.beginPath(); c.ellipse(sx, sy, 13, 11, 0, 0, 6.3); c.fillStyle = INK; c.fill();
    c.beginPath(); c.ellipse(sx, sy, 10.5, 8.5, 0, 0, 6.3); c.fillStyle = '#d9cfbe'; c.fill();
    c.fillStyle = INK;
    c.beginPath(); c.ellipse(sx - 3.5, sy - 1, 2.6, 2.2, 0, 0, 6.3); c.fill();
    c.beginPath(); c.ellipse(sx + 3.8, sy - 1, 2.6, 2.2, 0, 0, 6.3); c.fill();
    c.fillStyle = EMBER;
    c.beginPath(); c.arc(sx - 3.3, sy - 0.8, 0.9, 0, 6.3); c.fill();
    c.beginPath(); c.arc(sx + 4, sy - 0.8, 0.9, 0, 6.3); c.fill();
    // remates del marco
    br(c, [[x1 + 2, y - 9], [x1 + 10, y], [x1 + 2, y + 9]], 3, 0.5, BONE2, 0.3);
  }

  drawDlg() {
    const W = Math.min(560, window.innerWidth * 0.9), H = 104;
    const c = hidpi(this.dlg, W, H);
    c.clearRect(0, 0, W, H);
    if (!this.text) return;
    const a = clamp(this.shown / 4, 0, 1);
    c.globalAlpha = a;
    // caja: borde de pincel con esquinas en gancho
    c.fillStyle = 'rgba(10,9,14,0.86)';
    c.beginPath(); c.roundRect(6, 8, W - 12, H - 16, 6); c.fill();
    const edge = (pts: V[], w: number) => { br(c, pts, w + 2, w, INK, 0.05, 4); br(c, pts, w * 0.45, w * 0.3, BONE2, 0.05, 4); };
    edge([[10, 10], [W / 2, 8], [W - 10, 11]], 3.2);
    edge([[12, H - 10], [W / 2, H - 9], [W - 12, H - 11]], 3.2);
    for (const [x, d] of [[10, 1], [W - 10, -1]] as [number, number][]) {
      br(c, [[x, 18], [x - d * 4, 10], [x + d * 6, 4]], 3, 0.4, BONE2, 0.2);
      br(c, [[x, H - 18], [x - d * 4, H - 10], [x + d * 6, H - 4]], 3, 0.4, BONE2, 0.2);
    }
    // retrato
    const px = 18, py = 18, ps = 68;
    c.fillStyle = '#15121c'; c.fillRect(px, py, ps, ps);
    if (this.portrait) {
      c.save(); c.beginPath(); c.rect(px, py, ps, ps); c.clip();
      c.drawImage(this.portrait, px, py, ps, ps);
      c.restore();
    }
    c.strokeStyle = BONE2; c.lineWidth = 1.2; c.strokeRect(px + 0.5, py + 0.5, ps - 1, ps - 1);
    // texto
    const serif = getComputedStyle(document.body).getPropertyValue('--serif') || 'Georgia, serif';
    c.font = `700 11px ${'system-ui, sans-serif'}`;
    c.fillStyle = EMBER; c.textAlign = 'left';
    c.fillText(this.speaker.toUpperCase().split('').join(' '), px + ps + 14, py + 12);
    c.font = `italic 500 ${W < 420 ? 15 : 18}px ${serif}`;
    c.fillStyle = BONE;
    const words = this.text.slice(0, Math.floor(this.shown)).split(' ');
    let line = '', ly = py + 36;
    const maxW = W - (px + ps + 14) - 18;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (c.measureText(test).width > maxW) { c.fillText(line, px + ps + 14, ly); line = w; ly += 22; }
      else line = test;
    }
    c.fillText(line, px + ps + 14, ly);
    // indicador de continuar
    if (this.shown >= this.text.length && Math.sin(this.t * 6) > 0) {
      c.fillStyle = CRIM;
      c.beginPath(); c.moveTo(W - 28, H - 24); c.lineTo(W - 20, H - 24); c.lineTo(W - 24, H - 18); c.fill();
    }
    c.globalAlpha = 1;
  }
}

function drawButton(cv: HTMLCanvasElement, hov: boolean, n: number) {
  const W = 210, H = 50;
  const c = hidpi(cv, W, H);
  c.clearRect(0, 0, W, H);
  const r = mulberry(n * 7 + 1);
  // pincelada carmesí detrás del texto (más larga al pasar el puntero)
  const len = hov ? 0.94 : 0.7;
  const x0 = W * (1 - len) / 2, x1 = W - x0;
  br(c, [[x0, H / 2 + 2], [W / 2, H / 2 - 1 + r() * 2], [x1, H / 2 + 1]], hov ? 34 : 26, hov ? 22 : 10, hov ? CRIM : CRIM2, 0.15, 6);
  // cerdas del pincel
  c.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 7; i++) { const y = H / 2 - 10 + i * 3.4; c.fillRect(x0 + 10 + r() * 30, y, (x1 - x0) * (0.4 + r() * 0.5), 0.8); }
  if (hov) {
    br(c, [[x0 - 14, H / 2], [x0 - 4, H / 2]], 2, 0.3, BONE, 0.5);
    br(c, [[x1 + 14, H / 2], [x1 + 4, H / 2]], 2, 0.3, BONE, 0.5);
  }
}

// íconos de objetos: pincel y tinta, sin imágenes
function drawSlot(cv: HTMLCanvasElement, k: string) {
  const S = 58;
  const c = hidpi(cv, S, S);
  // marco de la ranura
  c.fillStyle = 'rgba(10,9,14,0.78)';
  c.beginPath(); c.moveTo(29, 2); c.lineTo(56, 29); c.lineTo(29, 56); c.lineTo(2, 29); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(239,231,216,0.35)'; c.lineWidth = 1.2; c.stroke();
  const ol = (p: Path2D, fill: string | CanvasGradient, w = 2.6) => { c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = w; c.stroke(p); c.fillStyle = fill; c.fill(p); };
  const cx = 29, cy = 30;
  if (k === 'frasco') {
    const p = pathOf(spline([[cx - 3, cy - 14], [cx + 3, cy - 14], [cx + 3, cy - 7], [cx + 10, cy + 2], [cx + 8, cy + 11], [cx, cy + 13], [cx - 8, cy + 11], [cx - 10, cy + 2], [cx - 3, cy - 7]], true, 5, [true, true, true, false, false, false, false, false, true]));
    ol(p, 'rgba(220,235,240,0.35)');
    c.save(); c.clip(p);
    const g = c.createLinearGradient(0, cy, 0, cy + 13); g.addColorStop(0, '#ff6a6a'); g.addColorStop(1, '#6e1530');
    c.fillStyle = g; c.fillRect(cx - 12, cy + 1, 24, 14);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(cx - 7, cy - 2, 2, 10);
    c.restore();
    c.fillStyle = '#7a5a3a'; c.fillRect(cx - 4, cy - 18, 8, 5); c.strokeStyle = INK; c.lineWidth = 1.6; c.strokeRect(cx - 4, cy - 18, 8, 5);
  } else if (k === 'llave') {
    br(c, [[cx - 10, cy + 12], [cx + 6, cy - 4]], 7, 6, INK, 0.05); br(c, [[cx - 10, cy + 12], [cx + 6, cy - 4]], 4, 3.4, BONE, 0.05);
    const ring = new Path2D(); ring.arc(cx + 9, cy - 8, 6.5, 0, 6.3);
    ol(ring, BONE);
    c.fillStyle = '#1a1622'; c.beginPath(); c.arc(cx + 9, cy - 8, 2.6, 0, 6.3); c.fill();
    br(c, [[cx - 8, cy + 9], [cx - 13, cy + 5]], 5.4, 5, INK, 0.05); br(c, [[cx - 8, cy + 9], [cx - 12.5, cy + 5.4]], 3, 3, BONE, 0.05);
    br(c, [[cx - 4, cy + 4], [cx - 9, cy]], 5.4, 5, INK, 0.05); br(c, [[cx - 4, cy + 4], [cx - 8.5, cy + 0.4]], 3, 3, BONE, 0.05);
  } else if (k === 'brasa') {
    const p = pathOf(spline([[cx, cy - 14], [cx + 10, cy - 2], [cx + 6, cy + 11], [cx - 6, cy + 11], [cx - 10, cy - 2]], true, 5, [true, false, false, false, false]));
    const g = c.createRadialGradient(cx, cy + 3, 1, cx, cy, 16); g.addColorStop(0, '#fff0c8'); g.addColorStop(0.35, EMBER); g.addColorStop(1, '#a8331a');
    c.shadowColor = 'rgba(255,140,60,0.9)'; c.shadowBlur = 10;
    ol(p, g);
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(120,30,10,0.8)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx - 2, cy - 6); c.lineTo(cx + 1, cy); c.lineTo(cx - 1, cy + 5); c.stroke();
  } else if (k === 'pluma') {
    const spine: V[] = [[cx - 11, cy + 13], [cx - 2, cy + 2], [cx + 10, cy - 13]];
    const s = spline(spine, false, 8);
    const vane = taper(s, (t, side) => (side > 0 ? 7 : 4) * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (t > 0.12 ? 1 : 0));
    ol(pathOf(vane), '#2b2238');
    c.save(); c.clip(pathOf(vane));
    c.strokeStyle = 'rgba(184,38,58,0.8)'; c.lineWidth = 1;
    for (let i = 2; i < s.length - 2; i += 2) { c.beginPath(); c.moveTo(s[i][0], s[i][1]); c.lineTo(s[i][0] + 8, s[i][1] + 3); c.stroke(); }
    c.restore();
    br(c, spine, 1.8, 0.6, BONE, 0.1);
  } else if (k === 'moneda') {
    const p = new Path2D(); p.ellipse(cx, cy, 13, 13, 0, 0, 6.3);
    ol(p, '#d9cfbe');
    c.strokeStyle = '#958aa0'; c.lineWidth = 1.4; c.beginPath(); c.arc(cx, cy, 9, 0, 6.3); c.stroke();
    // mini calavera grabada
    c.fillStyle = '#5f566c';
    c.beginPath(); c.ellipse(cx, cy - 1, 5, 4.4, 0, 0, 6.3); c.fill();
    c.fillStyle = '#d9cfbe';
    c.beginPath(); c.arc(cx - 2, cy - 1.5, 1.2, 0, 6.3); c.fill(); c.beginPath(); c.arc(cx + 2, cy - 1.5, 1.2, 0, 6.3); c.fill();
  } else if (k === 'mapa') {
    const p = pathOf([[cx - 13, cy - 10], [cx - 4, cy - 13], [cx + 4, cy - 10], [cx + 13, cy - 13], [cx + 13, cy + 10], [cx + 4, cy + 13], [cx - 4, cy + 10], [cx - 13, cy + 13]]);
    ol(p, '#cdbfae');
    c.strokeStyle = 'rgba(80,60,50,0.5)'; c.lineWidth = 1;
    for (const x of [cx - 4, cx + 4]) { c.beginPath(); c.moveTo(x, cy - 12); c.lineTo(x, cy + 12); c.stroke(); }
    c.strokeStyle = CRIM; c.lineWidth = 1.6; c.setLineDash([2, 2]);
    c.beginPath(); c.moveTo(cx - 9, cy + 6); c.quadraticCurveTo(cx - 2, cy - 8, cx + 7, cy - 2); c.stroke(); c.setLineDash([]);
    c.lineWidth = 2; c.beginPath(); c.moveTo(cx + 5, cy - 6); c.lineTo(cx + 9, cy + 2); c.moveTo(cx + 9, cy - 6); c.lineTo(cx + 5, cy + 2); c.stroke();
  }
  void lerp;
}
