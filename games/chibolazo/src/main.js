/* CHIBOLAZO: lienzo, entrada, dibujo, efectos, sonido y menús. La simulación está en game.js. */
import { W, H, TOP, LINE, BR, PR, SOCKETS, ELS, EL_COL, REACT, ENEMIES, PARTS, MODS, MACHINES, LAST_WAVE } from './data.js';
import { newRun, step, nextWave, reroll, rerollCost, buy, place, repair, REPAIR, FLIPPERS, WALLS, flipTip, FL_R, REST, SAVE_Y } from './game.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), g = cv.getContext('2d');
const rnd = (a, b) => a + Math.random() * (b - a);
let S = 1, OX = 0, OY = 0, DPR = 1;
let G = null, paused = false, auto = false, lastPhase = '';

function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * DPR; cv.height = innerHeight * DPR;
  S = Math.min(innerWidth / W, innerHeight / H);
  OX = (innerWidth - W * S) / 2; OY = (innerHeight - H * S) / 2;
  $('pausebtn').style.top = OY + 6 * S + 'px';
}
addEventListener('resize', resize); resize();

/* Sprites: el atlas 0x72 (CC0) que ya usa DOWNCASTLE */
const SPR = import.meta.env.BASE_URL + 'downcastle/sprites/';
const frames = new Map(), atlas = new Image();
atlas.src = SPR + 'dungeon-tileset-ii.png';
fetch(SPR + 'tile_list.txt').then((r) => r.text()).then((t) => {
  for (const l of t.split('\n')) { const [n, x, y, w, h] = l.trim().split(/\s+/); if (n && h) frames.set(n, { x: +x, y: +y, w: +w, h: +h }); }
});
const tints = new Map();
function tinted(name, col, solid) { // silueta (solid) o teñido del cuadro, en caché
  const key = name + col + solid;
  let c = tints.get(key);
  if (c) return c;
  const f = frames.get(name);
  c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
  const x = c.getContext('2d');
  x.drawImage(atlas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  x.globalCompositeOperation = solid ? 'source-in' : 'source-atop';
  x.globalAlpha = solid ? 1 : 0.5; x.fillStyle = col; x.fillRect(0, 0, f.w, f.h);
  tints.set(key, c);
  return c;
}
function sprite(name, cx, bottom, sc, col, solid) {
  const f = frames.get(name);
  if (!f || !atlas.complete) return false;
  const w = f.w * sc, h = f.h * sc;
  if (col) g.drawImage(tinted(name, col, solid), cx - w / 2, bottom - h, w, h);
  else g.drawImage(atlas, f.x, f.y, f.w, f.h, cx - w / 2, bottom - h, w, h);
  return true;
}

/* Sonido: Web Audio sin archivos */
let AC = null;
function unlockAudio() { if (!AC) try { AC = new AudioContext(); } catch { AC = null; } else if (AC.state === 'suspended') AC.resume(); }
function tone(f, d = 0.06, type = 'square', vol = 0.05, f2 = f) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), v = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
  v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v).connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d = 0.2, vol = 0.12) {
  if (!AC) return;
  const t = AC.currentTime, len = Math.floor(AC.sampleRate * d), buf = AC.createBuffer(1, len, AC.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const s = AC.createBufferSource(), v = AC.createGain();
  s.buffer = buf; v.gain.value = vol; s.connect(v).connect(AC.destination); s.start(t);
}

/* Efectos */
const P = [], T = [], RINGS = [], BOLTS = [];
let shake = 0, flash = 0, flashCol = '#f00';
function burst(x, y, n, col, sp = 120, life = 0.5, size = 2.5, grav = 200) {
  for (let i = 0; i < n && P.length < 700; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(sp * 0.3, sp);
    P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(life * 0.5, life), max: life, col, size: rnd(size * 0.6, size), grav });
  }
}
function text(x, y, txt, col = '#fff', size = 12, life = 0.8, vy = -40) {
  if (T.length > 45) T.splice(T.findIndex((t) => t.size <= 12) >>> 0, 1); // en el caos se van primero los números chicos
  T.push({ x, y, txt, col, size, life, max: life, vy });
}
const ring = (x, y, r0, r1, col, life = 0.35, w = 3) => RINGS.push({ x, y, r0, r1, col, life, max: life, w });
function bolt(x1, y1, x2, y2, col = '#ffe14a') {
  const pts = [[x1, y1]], n = 6;
  for (let i = 1; i < n; i++) pts.push([x1 + (x2 - x1) * (i / n) + rnd(-7, 7), y1 + (y2 - y1) * (i / n) + rnd(-7, 7)]);
  pts.push([x2, y2]);
  BOLTS.push({ pts, col, life: 0.18, max: 0.18 });
}

function fx(e) {
  switch (e.k) {
    case 'flip': tone(140, 0.05, 'square', 0.03, 90); break;
    case 'hit': burst(e.x, e.y, 6, '#fff', 160, 0.25, 2); tone(260 + Math.min(600, e.sp * 0.4), 0.05, 'square', 0.04); shake = Math.max(shake, 1.5); break;
    case 'dmg': text(e.x + rnd(-6, 6), e.y, '' + e.n, { bola: '#fff', fuego: '#ff9a4a', rayo: '#ffe14a', quiebre: '#a8f0ff', boom: '#ffb0e0', bala: '#ddd', esquirla: '#bdf' }[e.src] || '#fff', e.src === 'quiebre' ? 18 : 11, 0.6); break;
    case 'kill': {
      const d = ENEMIES[e.t];
      burst(e.x, e.y, d.boss ? 80 : 18, d.col, d.boss ? 260 : 150, 0.7, 3.5); burst(e.x, e.y, 8, '#fff', 90, 0.3, 2);
      ring(e.x, e.y, 4, d.boss ? 90 : 26, d.col, 0.3);
      tone(520, 0.08, 'triangle', 0.05, 900); if (d.boss) { shake = 14; noise(0.6, 0.2); flash = 0.4; flashCol = '#fff'; }
      break;
    }
    case 'coin': text(e.x, e.y - 10, '+' + e.n, '#ffd84a', 12, 0.9, -55); tone(1300, 0.05, 'sine', 0.03, 1700); break;
    case 'boom': ring(e.x, e.y, 6, e.r, e.col, 0.35, 5); burst(e.x, e.y, 24, e.col, e.r * 3, 0.5, 3.5, 0); shake = Math.max(shake, 5); noise(0.25, 0.1); break;
    case 'bolt': bolt(e.x1, e.y1, e.x2, e.y2); tone(1800, 0.05, 'sawtooth', 0.02, 600); break;
    case 'spread': bolt(e.x1, e.y1, e.x2, e.y2, EL_COL[e.el]); break;
    case 'bump': ring(e.x, e.y, PR, PR + 14, e.off ? '#666' : e.col, 0.25, 3); tone(e.id === 'hongo' ? 700 : 480, 0.06, 'square', 0.04, e.id === 'hongo' ? 1000 : 520); break;
    case 'charge': ring(e.x, e.y, 18, 4, EL_COL[e.el], 0.25, 2); break;
    case 'react': text(e.x, e.y - 18, e.name, e.col, 20, 1.1, -30); ring(e.x, e.y, 10, 80, e.col, 0.45, 6); shake = Math.max(shake, 7); tone(220, 0.25, 'sawtooth', 0.06, 60); break;
    case 'immune': text(e.x, e.y - 16, 'INMUNE', '#999', 10, 0.6); break;
    case 'armor': text(e.x, e.y - 16, '¡CLANK!', '#bfc6dd', 11, 0.6); burst(e.x, e.y, 6, '#bfc6dd', 140, 0.25, 2); tone(900, 0.04, 'square', 0.04, 1200); break;
    case 'breach': flash = 0.35; flashCol = '#ff2040'; shake = e.boss ? 16 : 9; ring(e.x, LINE, 6, 60, '#ff2040', 0.4, 5); text(e.x, LINE - 14, e.boss ? '−3 ❤' : '−1 ❤', '#ff4a6a', 16, 1); tone(110, 0.3, 'sawtooth', 0.08, 50); break;
    case 'drain': flash = 0.35; flashCol = '#ff2040'; shake = 8; text(W / 2, 600, '¡SE CAYÓ! −1 ❤', '#ff4a6a', 16, 1.2); tone(300, 0.4, 'triangle', 0.08, 80); break;
    case 'save': ring(e.x, e.y, 6, 50, '#6fdcff', 0.4, 4); text(e.x, e.y - 20, '¡SALVADA!', '#6fdcff', 14); tone(900, 0.15, 'sine', 0.06, 1400); break;
    case 'stomp': shake = 12; text(e.x, e.y - 40, '¡PISOTÓN!', '#ffb070', 16); noise(0.4, 0.2); break;
    case 'shield': ring(e.x, e.y, 10, 95, '#6fa8ff', 0.5, 3); text(e.x, e.y - 22, '¡ESCUDOS!', '#9fc4ff', 11); break;
    case 'raise': burst(e.x, e.y + 10, 16, '#a07ad8', 90, 0.6, 3, -60); text(e.x, e.y - 20, '¡ARRIBA!', '#c9a8ff', 10); break;
    case 'imps': burst(e.x, e.y, 20, '#ff5a3a', 120, 0.6, 3, -80); break;
    case 'shoot': tone(200, 0.06, 'square', 0.04, 80); break;
    case 'twin': ring(e.x, e.y, PR, 40, '#b98cff', 0.4, 3); tone(600, 0.2, 'sine', 0.05, 1200); break;
    case 'magnet': ring(e.x, e.y, 150, 10, '#ff4a4a', 0.45, 3); tone(160, 0.3, 'sine', 0.06, 320); break;
    case 'poof': burst(e.x, e.y, 10, '#b98cff', 80, 0.4, 2.5); break;
    case 'crit': text(e.x, e.y - 16, '¡PUNTA!', '#ffd84a', 12, 0.6); break;
    case 'wave': text(W / 2, 330, e.boss ? '¡JEFE!' : 'OLEADA ' + e.n, e.boss ? '#ff4a6a' : '#fff', 34, 1.6, -10); tone(330, 0.15, 'square', 0.05, 660); break;
    case 'boss': text(W / 2, 380, ENEMIES[e.t].name, '#ff4a6a', 20, 2, -5); noise(0.5, 0.15); shake = 8; break;
    case 'clear': text(W / 2, 300, '¡OLEADA SUPERADA!', '#7bf0a0', 22, 1.5, -10); tone(523, 0.12, 'square', 0.05); setTimeout(() => tone(784, 0.2, 'square', 0.05), 120); break;
    case 'over': noise(0.8, 0.2); tone(200, 0.8, 'sawtooth', 0.08, 40); break;
  }
}

function updateFx(dt) {
  for (const p of P) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; }
  for (const t of T) { t.life -= dt; t.y += t.vy * dt; }
  for (const r of RINGS) r.life -= dt;
  for (const b of BOLTS) b.life -= dt;
  for (const A of [P, T, RINGS, BOLTS]) { let j = 0; for (const x of A) if (x.life > 0) A[j++] = x; A.length = j; }
  shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt);
  if (!G) return;
  // Brillitos de los estados
  for (const e of G.enemies) for (const el of ELS) if (e.st[el] > 0 && Math.random() < dt * 14)
    P.push({ x: e.x + rnd(-e.r, e.r), y: e.y + rnd(-e.r, e.r * 0.5), vx: rnd(-15, 15), vy: el === 'fuego' ? -60 : el === 'hielo' ? 10 : rnd(-60, 60), life: 0.45, max: 0.45, col: EL_COL[el], size: 2.5, grav: 0 });
  for (const b of G.balls) {
    (b.trail ||= []).unshift([b.x, b.y]); b.trail.length = Math.min(b.trail.length, 9);
    for (const el of ELS) if (b.el[el] > 0 && Math.random() < dt * 30) P.push({ x: b.x + rnd(-4, 4), y: b.y + rnd(-4, 4), vx: rnd(-20, 20), vy: el === 'fuego' ? -50 : 0, life: 0.35, max: 0.35, col: EL_COL[el], size: 3, grav: 0 });
  }
}

/* Dibujo */
const table = document.createElement('canvas');
function buildTable() {
  table.width = W * 2; table.height = H * 2;
  const c = table.getContext('2d');
  c.scale(2, 2);
  c.fillStyle = '#0d0918'; c.fillRect(0, 0, W, H);
  c.beginPath(); c.moveTo(8, TOP + 52); c.lineTo(60, TOP); c.lineTo(300, TOP); c.lineTo(352, TOP + 52); c.lineTo(352, 510); c.lineTo(266, 603); c.lineTo(266, H); c.lineTo(94, H); c.lineTo(94, 603); c.lineTo(8, 510); c.closePath();
  const gr = c.createLinearGradient(0, TOP, 0, H); gr.addColorStop(0, '#2a1d4a'); gr.addColorStop(0.6, '#1d1436'); gr.addColorStop(1, '#140d26');
  c.fillStyle = gr; c.fill();
  c.save(); c.clip();
  c.fillStyle = '#ffffff10';
  for (let y = TOP + 10; y < H; y += 18) for (let x = (y / 18) % 2 ? 14 : 23; x < W; x += 18) c.fillRect(x, y, 1.5, 1.5);
  const red = c.createLinearGradient(0, LINE, 0, LINE + 40); red.addColorStop(0, '#ff204030'); red.addColorStop(1, '#ff204000');
  c.fillStyle = red; c.fillRect(0, LINE, W, 40);
  c.restore();
  c.setLineDash([8, 6]); c.strokeStyle = '#ff2040aa'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, LINE); c.lineTo(W - 12, LINE); c.stroke(); c.setLineDash([]);
  c.lineCap = 'round';
  for (const [w, col] of [[9, '#0a0614'], [5, '#6a5aa8'], [1.5, '#b8a8f0']]) {
    c.strokeStyle = col; c.lineWidth = w;
    for (const s of WALLS) { c.beginPath(); c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); c.stroke(); }
  }
  for (const [x, y] of SOCKETS) { c.fillStyle = '#0d0918aa'; c.beginPath(); c.arc(x, y, PR + 2, 0, 7); c.fill(); c.setLineDash([3, 4]); c.strokeStyle = '#5a4a8a'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); }
}
atlas.onload = buildTable; buildTable();

function drawPart(c, id, x, y, r, dim) {
  const d = PARTS[id], k = r / 15;
  c.save(); c.translate(x, y);
  c.fillStyle = '#0a0614'; c.beginPath(); c.arc(0, 2 * k, r + 3 * k, 0, 7); c.fill();
  c.fillStyle = dim ? '#555' : d.col; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
  c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(-r * 0.3, -r * 0.35, r * 0.35, 0, 7); c.fill();
  c.strokeStyle = '#1a1028'; c.fillStyle = '#1a1028'; c.lineWidth = 2.4 * k; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  if (id === 'hongo') { c.fillStyle = '#fff'; for (const [a, b] of [[-0.35, -0.1], [0.35, -0.1], [0, 0.35]]) { c.moveTo(a * r + r * 0.17, b * r); c.arc(a * r, b * r, r * 0.17, 0, 7); } c.fill(); }
  else if (id === 'brasero') { c.moveTo(0, -r * 0.62); c.quadraticCurveTo(r * 0.6, 0, 0, r * 0.55); c.quadraticCurveTo(-r * 0.6, 0, 0, -r * 0.62); c.fill(); }
  else if (id === 'nevera') { for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; c.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); c.lineTo(-Math.cos(a) * r * 0.6, -Math.sin(a) * r * 0.6); } c.stroke(); }
  else if (id === 'bobina') { c.moveTo(r * 0.15, -r * 0.65); c.lineTo(-r * 0.3, r * 0.05); c.lineTo(r * 0.25, -r * 0.05); c.lineTo(-r * 0.15, r * 0.65); c.stroke(); }
  else if (id === 'canon') { c.fillRect(-r * 0.2, -r * 0.75, r * 0.4, r * 0.7); c.arc(0, r * 0.1, r * 0.35, 0, 7); c.fill(); }
  else if (id === 'gemela') { c.arc(-r * 0.22, 0, r * 0.3, 0, 7); c.moveTo(r * 0.52, 0); c.arc(r * 0.22, 0, r * 0.3, 0, 7); c.stroke(); }
  else if (id === 'iman') { c.arc(0, -r * 0.05, r * 0.38, 0, Math.PI); c.moveTo(-r * 0.38, -r * 0.05); c.lineTo(-r * 0.38, -r * 0.5); c.moveTo(r * 0.38, -r * 0.05); c.lineTo(r * 0.38, -r * 0.5); c.lineWidth = 3.5 * k; c.stroke(); }
  else if (id === 'alcancia') { c.arc(0, 0, r * 0.45, 0, 7); c.moveTo(-r * 0.2, 0); c.lineTo(r * 0.2, 0); c.stroke(); }
  c.restore();
}

function draw(now) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0d0918'; g.fillRect(0, 0, cv.width, cv.height);
  const sx = shake ? rnd(-shake, shake) : 0, sy = shake ? rnd(-shake, shake) : 0;
  g.setTransform(DPR * S, 0, 0, DPR * S, DPR * (OX + sx * S), DPR * (OY + sy * S));
  g.imageSmoothingEnabled = false;
  g.drawImage(table, 0, 0, W, H);
  const t = now / 1000;

  if (G) {
    // Enchufes libres resaltados mientras se instala
    if (G.placing) for (const [x, y] of SOCKETS) { g.strokeStyle = '#ffd84a'; g.lineWidth = 2.5; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8); g.beginPath(); g.arc(x, y, PR + 6, 0, 7); g.stroke(); g.globalAlpha = 1; }
    for (const p of G.parts) if (p) {
      drawPart(g, p.id, p.x, p.y + (p.flash > 0 ? 1.5 : 0), PR * (p.flash > 0 ? 1.12 : 1), p.off > 0);
      if (p.off > 0) { g.strokeStyle = '#ff4a6a'; g.lineWidth = 3; g.beginPath(); g.moveTo(p.x - 8, p.y - 8); g.lineTo(p.x + 8, p.y + 8); g.moveTo(p.x + 8, p.y - 8); g.lineTo(p.x - 8, p.y + 8); g.stroke(); }
      if (p.id === 'gemela' && p.cd2 > 0) { g.strokeStyle = '#ffffff88'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, PR + 4, -Math.PI / 2, -Math.PI / 2 + (1 - p.cd2 / 5) * Math.PI * 2); g.stroke(); }
    }

    let boss = null;
    for (const e of G.enemies) {
      const d = ENEMIES[e.t];
      if (d.boss) boss = e;
      const sc = (d.boss ? 2 : 2.4) * (d.s || 1), fr = d.spr + '_f' + (Math.floor(t * 8 + e.ph) % 4), bottom = e.y + e.r + 3;
      g.fillStyle = '#00000066'; g.beginPath(); g.ellipse(e.x, e.y + e.r, e.r * 0.9, e.r * 0.3, 0, 0, 7); g.fill();
      const st = ELS.find((x) => e.st[x] > 0);
      const ok = sprite(fr, e.x, bottom, sc, e.flash > 0 ? '#fff' : st ? EL_COL[st] : null, e.flash > 0);
      if (!ok) { g.fillStyle = d.col; g.beginPath(); g.arc(e.x, e.y, e.r, 0, 7); g.fill(); }
      if (e.armor) for (let i = 0; i < e.armor; i++) { g.fillStyle = '#9fc4ff'; g.fillRect(e.x - 9 + i * 7, e.y - e.r - 20, 5, 5); }
      if (e.hp < e.max && !d.boss) {
        g.fillStyle = '#000a'; g.fillRect(e.x - 12, e.y - e.r - 12, 24, 4);
        g.fillStyle = '#ff4a6a'; g.fillRect(e.x - 12, e.y - e.r - 12, 24 * Math.max(0, e.hp / e.max), 4);
      }
    }

    for (const s of G.shots) {
      g.fillStyle = s.els.length ? EL_COL[s.els[0]] : s.kind === 'bala' ? '#fff' : '#cde';
      g.beginPath(); g.arc(s.x, s.y, s.kind === 'bala' ? 3.5 : 2.5, 0, 7); g.fill();
    }

    for (const b of G.balls) {
      if (b.wait > 0 && Math.floor(t * 10) % 2) continue;
      const els = ELS.filter((x) => b.el[x] > 0);
      if (b.trail) for (let i = 1; i < b.trail.length; i++) {
        g.globalAlpha = (1 - i / b.trail.length) * 0.5; g.fillStyle = els.length ? EL_COL[els[i % els.length]] : '#fff';
        g.beginPath(); g.arc(b.trail[i][0], b.trail[i][1], BR * (1 - i / 12), 0, 7); g.fill();
      }
      g.globalAlpha = b.ghost ? 0.55 : 1;
      els.forEach((x, i) => { g.strokeStyle = EL_COL[x]; g.lineWidth = 2.5; g.beginPath(); g.arc(b.x, b.y, BR + 3 + i * 3 + Math.sin(t * 20 + i) * 1, 0, 7); g.stroke(); });
      const gr = g.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BR);
      gr.addColorStop(0, '#fff'); gr.addColorStop(1, b.ghost ? '#b98cff' : b.crit ? '#ffd84a' : '#8f8fae');
      g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, BR, 0, 7); g.fill();
      g.globalAlpha = 1;
    }

    if (G.saves > 0) { g.strokeStyle = '#6fdcff'; g.lineWidth = 3; g.globalAlpha = 0.6 + 0.3 * Math.sin(t * 6); g.beginPath(); g.moveTo(140, SAVE_Y + 6); g.lineTo(220, SAVE_Y + 6); g.stroke(); g.globalAlpha = 1; }
    hud(t, boss);
  }

  // Aletas
  FLIPPERS.forEach((F, i) => {
    const a = G ? G.fl[i].a : REST, [tx, ty] = flipTip(F, a);
    g.lineCap = 'round';
    for (const [w, col] of [[FL_R * 2 + 4, '#0a0614'], [FL_R * 2, G && G.fl[i].up ? '#ffe680' : '#f2c94c'], [3, '#fff6']]) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(F.px, F.py); g.lineTo(tx, ty); g.stroke();
    }
    g.fillStyle = '#5a3d10'; g.beginPath(); g.arc(F.px, F.py, 3, 0, 7); g.fill();
  });

  // Efectos
  for (const r of RINGS) { const k = 1 - r.life / r.max; g.globalAlpha = r.life / r.max; g.strokeStyle = r.col; g.lineWidth = r.w; g.beginPath(); g.arc(r.x, r.y, Math.max(0.1, r.r0 + (r.r1 - r.r0) * k), 0, 7); g.stroke(); }
  for (const b of BOLTS) {
    g.globalAlpha = b.life / b.max;
    for (const [w, col] of [[5, b.col + '66'], [2, '#fff']]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
  }
  for (const p of P) { g.globalAlpha = Math.min(1, (p.life / p.max) * 1.5); g.fillStyle = p.col; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  g.globalAlpha = 1;
  g.textAlign = 'center'; g.lineJoin = 'round';
  for (const x of T) {
    g.globalAlpha = Math.min(1, (x.life / x.max) * 2);
    g.font = `900 ${x.size}px system-ui, sans-serif`;
    g.strokeStyle = '#0a0614'; g.lineWidth = Math.max(3, x.size / 4); g.strokeText(x.txt, x.x, x.y);
    g.fillStyle = x.col; g.fillText(x.txt, x.x, x.y);
  }
  g.globalAlpha = 1;
  if (flash > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = flash * 0.6; g.fillStyle = flashCol; g.fillRect(0, 0, cv.width, cv.height); g.globalAlpha = 1; }
}

function hud(t, boss) {
  g.textAlign = 'left'; g.font = '900 13px system-ui, sans-serif';
  for (let i = 0; i < G.maxHearts; i++) if (!sprite(i < G.hearts ? 'ui_heart_full' : 'ui_heart_empty', 20 + i * 22, 32, 1.6)) { g.fillStyle = i < G.hearts ? '#ff4a6a' : '#444'; g.fillText('❤', 12 + i * 18, 28); }
  g.textAlign = 'right'; g.fillStyle = '#ffd84a'; g.font = '900 18px system-ui, sans-serif';
  g.fillText(G.coins, W - 30, 28);
  g.beginPath(); g.arc(W - 19, 22, 7, 0, 7); g.fill(); g.fillStyle = '#b8860b'; g.fillRect(W - 20.5, 18, 3, 8);
  g.textAlign = 'left'; g.fillStyle = '#bba8e0'; g.font = '800 10px system-ui, sans-serif';
  g.fillText(`OLEADA ${G.wave}${G.wave <= LAST_WAVE ? '/' + LAST_WAVE : ''} · quedan ${G.spawn.length + G.enemies.length}`, 12, 44);
  if (G.combo > 1) { g.textAlign = 'right'; g.fillStyle = '#7bf0a0'; g.font = `900 ${10 + Math.min(8, G.combo / 3)}px system-ui, sans-serif`; g.fillText('COMBO ×' + G.combo, W - 12, 44); }
  if (boss) {
    g.fillStyle = '#000a'; g.fillRect(40, TOP + 6, W - 80, 7);
    g.fillStyle = '#ff2040'; g.fillRect(40, TOP + 6, (W - 80) * Math.max(0, boss.hp / boss.max), 7);
  }
}

/* Entrada: mitad izquierda o derecha de la pantalla; teclado; varios dedos */
const touches = new Map(), kb = [false, false];
cv.addEventListener('pointerdown', (e) => {
  unlockAudio();
  e.preventDefault();
  if (G && G.placing) {
    const x = (e.clientX - OX) / S, y = (e.clientY - OY) / S;
    const i = SOCKETS.findIndex(([sx, sy]) => Math.hypot(sx - x, sy - y) < PR + 14);
    if (i >= 0 && place(G, i)) { tone(660, 0.1, 'square', 0.05, 990); burst(SOCKETS[i][0], SOCKETS[i][1], 20, PARTS[G.parts[i].id].col, 120); showShop(); }
    return;
  }
  touches.set(e.pointerId, e.clientX < innerWidth / 2 ? 0 : 1);
});
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => touches.delete(e.pointerId));
const KEYS = { ArrowLeft: 0, KeyA: 0, KeyZ: 0, ShiftLeft: 0, ArrowRight: 1, KeyD: 1, KeyM: 1, ShiftRight: 1, Slash: 1 };
addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code in KEYS) kb[KEYS[e.code]] = true;
  if (e.code === 'Space') kb[0] = kb[1] = true;
  if ((e.code === 'Escape' || e.code === 'KeyP') && G) setPause(!paused);
});
addEventListener('keyup', (e) => { if (e.code in KEYS) kb[KEYS[e.code]] = false; if (e.code === 'Space') kb[0] = kb[1] = false; });
addEventListener('blur', () => { kb[0] = kb[1] = false; touches.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.phase === 'play') setPause(true); });

// Piloto automático (para probar): un aletazo corto cuando la bola baja hacia una aleta
const autoT = [0, 0];
function autoKeys() {
  return FLIPPERS.map((F, i) => {
    if (G.t < autoT[i]) return G.t < autoT[i] - 0.25; // 0,15 s arriba y 0,25 s abajo
    const near = G.balls.some((b) => { const dx = (b.x - F.px) * F.s; return b.wait <= 0 && b.vy > -80 && dx > -6 && dx < 76 && b.y > F.py - 50 && b.y < F.py + 30; });
    if (near) autoT[i] = G.t + 0.4;
    return near;
  });
}
function keys() {
  const tk = [...touches.values()], a = auto ? autoKeys() : [false, false];
  return [0, 1].map((i) => kb[i] || tk.includes(i) || a[i]);
}

/* Bucle */
function tick(h) {
  step(G, h, keys());
  for (const e of G.ev) fx(e);
  G.ev.length = 0;
  if (G.phase !== lastPhase) onPhase();
}
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (G && G.phase === 'play' && !paused) { acc += dt; while (acc >= 1 / 60) { tick(1 / 60); acc -= 1 / 60; } }
  updateFx(dt);
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Menús */
const best = (() => { try { return JSON.parse(localStorage.getItem('chibolazo.best')) || {}; } catch { return {}; } })();
function saveBest() {
  if ((best[G.m.id] || 0) >= G.wave) return;
  best[G.m.id] = G.wave;
  try { localStorage.setItem('chibolazo.best', JSON.stringify(best)); } catch { /* sin almacenamiento */ }
}
const show = (id) => { for (const x of ['menu', 'shop', 'placebar', 'pause', 'end']) $(x).classList.toggle('hidden', x !== id); $('pausebtn').classList.toggle('hidden', id !== null); };

function showMenu() {
  G = null; paused = false; touches.clear();
  $('machines').innerHTML = MACHINES.map((m) => `<button class="mach" style="--c:${m.col}" data-m="${m.id}"><b>${m.name}</b><small>${m.desc}</small><i>${best[m.id] ? 'Récord: oleada ' + best[m.id] : 'Sin jugar'}</i></button>`).join('');
  show('menu');
}
$('machines').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) { unlockAudio(); start(b.dataset.m); } });

function start(id) {
  G = newRun(id); lastPhase = G.phase; paused = false; autoT.fill(0);
  for (const e of G.ev) fx(e);
  G.ev.length = 0;
  show(null);
}

function onPhase() {
  lastPhase = G.phase;
  touches.clear();
  const g0 = G, ph = G.phase, later = (f, ms) => setTimeout(() => G === g0 && G.phase === ph && f(), ms); // que no se cuele en otra partida
  if (ph === 'shop') later(showShop, 700);
  else if (ph === 'over' || ph === 'win') { saveBest(); later(showEnd, 900); }
}

function showShop() {
  if (!G) return;
  G.placing = null;
  show('shop');
  $('shoptitle').textContent = G.wave >= LAST_WAVE ? `OLEADA ${G.wave} ✓` : `OLEADA ${G.wave} ✓  ·  TIENDA`;
  $('shopcoins').textContent = G.coins + ' ¢';
  $('offers').innerHTML = G.offers.map((o, i) => {
    const d = o.type === 'part' ? PARTS[o.id] : MODS[o.id], col = d.col || (d.kind === 'ALETAS' ? '#f2c94c' : '#e8e2d0');
    const lvl = o.type === 'mod' && G.mods[o.id] ? ` (tienes ${G.mods[o.id]})` : '';
    return `<button class="offer${o.sold ? ' sold' : ''}" style="--c:${col}" data-o="${i}" ${G.coins < o.price ? 'disabled' : ''}>
      ${o.type === 'part' ? `<canvas width="80" height="80" data-p="${o.id}"></canvas>` : ''}
      <span class="kd">${o.type === 'part' ? 'PIEZA' : d.kind}</span><span class="nm">${d.name}</span><span class="ds">${d.desc}${lvl}</span><span class="pr">${o.price} ¢</span></button>`;
  }).join('');
  for (const c of $('offers').querySelectorAll('canvas')) drawPart(c.getContext('2d'), c.dataset.p, 40, 38, 30);
  $('repair').textContent = `Reparar +1 ❤ (${REPAIR} ¢)`;
  $('repair').disabled = G.coins < REPAIR || G.hearts >= G.maxHearts;
  $('reroll').textContent = `Otras ofertas (${rerollCost(G)} ¢)`;
  $('reroll').disabled = G.coins < rerollCost(G);
  const mods = Object.entries(G.mods).map(([k, n]) => MODS[k].name + (n > 1 ? ' ×' + n : '')).join(' · ');
  const parts = G.parts.filter(Boolean).map((p) => PARTS[p.id].name).join(' · ');
  $('build').innerHTML = `<b>${G.m.name}</b> · ❤ ${G.hearts}/${G.maxHearts}<br>Piezas: ${parts || '—'}<br>Mejoras: ${mods || '—'}`;
  $('reacts').innerHTML = Object.entries(REACT).map(([k, r]) => `<b style="color:${r.col}">${k.replace('+', ' + ')} = ${r.name}</b> ${r.desc}`).join('<br>');
}
$('offers').addEventListener('click', (e) => {
  const b = e.target.closest('[data-o]');
  if (!b || !G) return;
  const r = buy(G, +b.dataset.o);
  if (r === 'place') { show('placebar'); $('placename').textContent = PARTS[G.placing.id].name; }
  else if (r) { tone(880, 0.1, 'square', 0.05, 1320); showShop(); }
});
$('placecancel').onclick = showShop;
$('repair').onclick = () => { if (repair(G)) { tone(660, 0.15, 'sine', 0.06, 990); showShop(); } };
$('reroll').onclick = () => { if (reroll(G)) { tone(400, 0.08, 'square', 0.04, 600); showShop(); } };
$('next').onclick = () => { nextWave(G); lastPhase = G.phase; show(null); };

function showEnd() {
  if (!G) return;
  show('end');
  const win = G.phase === 'win';
  $('endtitle').textContent = win ? '¡LA MÁQUINA AGUANTÓ!' : '¡LA MÁQUINA CAYÓ!';
  $('endtitle').style.color = win ? '#7bf0a0' : '#ff4a6a';
  $('endtxt').textContent = `${G.m.name} · llegaste a la oleada ${G.wave}` + (best[G.m.id] ? ` · récord ${best[G.m.id]}` : '');
  $('cont').classList.toggle('hidden', !win);
}
$('cont').onclick = () => { G.phase = 'shop'; lastPhase = 'shop'; showShop(); };
$('again').onclick = () => start(G.m.id);
$('tomenu').onclick = showMenu;

function setPause(on) {
  if (!G || G.phase !== 'play') return;
  paused = on; touches.clear();
  show(on ? 'pause' : null);
}
$('pausebtn').onclick = () => setPause(true);
$('resume').onclick = () => setPause(false);
$('quit').onclick = showMenu;

showMenu();

// Para depurar y probar desde la consola
window.__chibolazo = {
  get G() { return G; },
  start, auto: (on = true) => (auto = on),
  advance(sec) { for (let i = 0; i < sec * 60 && G && G.phase === 'play'; i++) tick(1 / 60); },
  give(n) { G.coins += n; if (G.phase === 'shop') showShop(); },
};
