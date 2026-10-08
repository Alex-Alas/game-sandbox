// Dibujo del mundo en Canvas 2D, en metros con y hacia arriba (setTransform). El HUD va aparte (hud.ts).
// Interpolación: ip(clave, x, y) da la posición entre el paso anterior y el actual (en el invitado ya viene
// interpolada desde los estados del anfitrión).
import { CELL, AIR, ROCK, WOOD, type Terr } from './sim/terrain.ts';
import { HW, H, HC, HAND_Y, PROP_HW, PROP_H, NEVER, type State, type World, type Pl, type Proj } from './sim/state.ts';
import { projOf } from './sim/cards.ts';
import { charOf, PCOLORS, TEAMS } from './sim/chars.ts';
import { themeOf, type Theme } from './themes.ts';
import { newTerrCanvas, flush, type TerrCanvas } from './terrdraw.ts';
import { FX, P_KIND } from './fx.ts';

export type View = { k: number, ox: number, oy: number, W: number, H: number, dpr: number };
export const toScreen = (v: View, x: number, y: number): [number, number] => [x * v.k + v.ox, -y * v.k + v.oy];
export const toWorld = (v: View, sx: number, sy: number): [number, number] => [(sx - v.ox) / v.k, -(sy - v.oy) / v.k];
export type IP = (key: string, x: number, y: number) => [number, number];

const R = { tc: null as TerrCanvas | null, T: null as Terr | null, theme: null as Theme | null, clouds: [] as [number, number, number][], time: 0 };

export function setWorld(w: World, ppc: number) {
  const th = themeOf(w.m.theme);
  R.theme = th, R.T = w.T;
  R.tc = newTerrCanvas(w.T, th, ppc);
  R.clouds = Array.from({ length: 9 }, (_, k) => [((k * 37) % 100) / 100 * (w.m.w + 40) - 20, w.m.h * (0.45 + ((k * 53) % 40) / 100), 2 + (k % 3)]);
}
export const theme = () => R.theme!;
export const matColor = (m: number) => { const th = R.theme!; return m === ROCK ? th.rock[0] : m === WOOD ? th.wood[0] : th.dirt[0]; };

const world = (ctx: CanvasRenderingContext2D, v: View) => ctx.setTransform(v.k * v.dpr, 0, 0, -v.k * v.dpr, v.ox * v.dpr, v.oy * v.dpr);
const screen = (ctx: CanvasRenderingContext2D, v: View) => ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); };

// ---- Fondo ------------------------------------------------------------------------------------------------------
function background(ctx: CanvasRenderingContext2D, v: View, w: World) {
  const th = R.theme!, m = w.m;
  screen(ctx, v);
  const g = ctx.createLinearGradient(0, 0, 0, v.H);
  g.addColorStop(0, th.sky[0]), g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.W, v.H);
  // sol y colinas lejanas con parallax
  const par = (f: number) => [v.ox * f, v.oy * f];
  const [sx] = par(0.15);
  ctx.fillStyle = th.sun;
  ctx.globalAlpha = 0.85;
  circle(ctx, v.W * 0.78 + sx * 0.2, v.H * 0.2, Math.min(v.W, v.H) * 0.07); ctx.fill();
  ctx.globalAlpha = 1;
  for (const [k, col, amp, base] of [[0.25, th.far, 0.12, 0.62], [0.45, th.near, 0.09, 0.72]] as [number, string, number, number][]) {
    const [hx] = par(k), wy = toScreen(v, 0, m.water)[1];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, v.H);
    for (let x = 0; x <= v.W + 20; x += 20) {
      const u = (x - hx) / 140;
      ctx.lineTo(x, Math.min(wy, v.H * base + (v.oy - v.H / 2) * k * 0.3) - (Math.sin(u) * 0.6 + Math.sin(u * 2.3 + 1) * 0.4) * v.H * amp);
    }
    ctx.lineTo(v.W, v.H);
    ctx.fill();
  }
  // nubes
  world(ctx, v);
  ctx.fillStyle = th.cloud;
  ctx.globalAlpha = m.theme === 'volcan' ? 0.35 : 0.8;
  for (const c of R.clouds) {
    const x = ((c[0] + R.time * 0.6 * (c[2] / 3)) % (m.w + 40)) - 20, y = c[1], r = c[2];
    circle(ctx, x, y, r * 0.6); ctx.fill();
    circle(ctx, x + r * 0.6, y + r * 0.15, r * 0.5); ctx.fill();
    circle(ctx, x - r * 0.6, y - r * 0.05, r * 0.45); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function water(ctx: CanvasRenderingContext2D, v: View, w: World, front: boolean) {
  const th = R.theme!, m = w.m, t = R.time, x0 = toWorld(v, 0, 0)[0] - 2, x1 = toWorld(v, v.W, 0)[0] + 2;
  world(ctx, v);
  ctx.beginPath();
  ctx.moveTo(x0, -50);
  for (let x = x0; x <= x1 + 0.5; x += 0.5) ctx.lineTo(x, m.water + (front ? -0.15 : 0.12) + Math.sin(x * 0.9 + t * (front ? 2.2 : 1.6)) * 0.12 + Math.sin(x * 0.37 - t) * 0.1);
  ctx.lineTo(x1, -50);
  ctx.closePath();
  ctx.fillStyle = front ? th.sea : th.seaTop;
  ctx.globalAlpha = front ? (m.lava ? 0.92 : 0.78) : 1;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (front) { // espuma o burbujas
    ctx.strokeStyle = m.lava ? '#ffd27a' : '#e8f8ff';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 0.5; x += 0.5) {
      const y = m.water - 0.15 + Math.sin(x * 0.9 + t * 2.2) * 0.12 + Math.sin(x * 0.37 - t) * 0.1;
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ---- Personajes -------------------------------------------------------------------------------------------------
function drawPlayer(ctx: CanvasRenderingContext2D, s: State, p: Pl, x: number, y: number, me: boolean) {
  const ch = charOf(p.ch), t = R.time, now = s.t;
  if (p.u?.k === 'meteoro' && p.u.f === 1) return;
  if (now < p.invT && Math.floor(t * 12) % 2 === 0 && !p.u) ctx.globalAlpha = 0.45;
  const h = p.crouch ? HC : H;
  const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  let sx = 1, sy = 1;
  if (!p.ground) sy = 1 + Math.max(-0.2, Math.min(0.25, p.vy * 0.012)), sx = 1 / sy;
  if (p.crouch) sx = 1.12;
  const stun = now < p.stunT;
  ctx.save();
  ctx.translate(x, y);
  if (p.tumble && stun) ctx.rotate(t * 14 * (p.vx >= 0 ? -1 : 1));
  if (p.u?.k === 'cohete') ctx.rotate(Math.atan2(p.u.dy, p.u.dx) - (p.face > 0 ? 0 : Math.PI));
  ctx.scale(p.face * sx, sy);
  // sombra de color del jugador (anillo)
  const ring = s.rules.teams ? TEAMS[p.team].color : PCOLORS[p.color];
  // pies
  const run = p.ground && Math.abs(p.vx) > 0.5 ? Math.sin(t * 22) * 0.12 : 0;
  ctx.fillStyle = ch.dark;
  for (const f of [-1, 1]) { ctx.beginPath(); ctx.ellipse(f * 0.2 + run * f, 0.07, 0.15, 0.08, 0, 0, 7); ctx.fill(); }
  // cuerpo
  const bw = 0.46, bh = h / 2;
  ctx.fillStyle = ch.color;
  ctx.strokeStyle = me ? '#ffffff' : '#1a1222';
  ctx.lineWidth = me ? 0.09 : 0.07;
  ctx.beginPath();
  ctx.ellipse(0, bh + 0.05, bw, bh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  accessory(ctx, p.ch, bw, bh, t, p);
  // ojos (miran hacia la mira o hacia donde va)
  const ex = 0.15, ey = bh + 0.18 * (h / H), lx = Math.max(-1, Math.min(1, p.vx / 12)) * p.face, ly = Math.max(-1, Math.min(1, p.vy / 12));
  if (stun) {
    ctx.strokeStyle = '#1a1222'; ctx.lineWidth = 0.05;
    for (const e of [ex - 0.1, ex + 0.12]) { ctx.beginPath(); ctx.moveTo(e - 0.06, ey - 0.06); ctx.lineTo(e + 0.06, ey + 0.06); ctx.moveTo(e - 0.06, ey + 0.06); ctx.lineTo(e + 0.06, ey - 0.06); ctx.stroke(); }
  } else {
    for (const e of [ex - 0.12, ex + 0.12]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(e, ey, 0.085, 0.11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a1222'; circle(ctx, e + 0.03 + lx * 0.025, ey + ly * 0.03, 0.045); ctx.fill();
    }
  }
  // boca
  ctx.strokeStyle = '#1a1222'; ctx.lineWidth = 0.04;
  ctx.beginPath();
  if (stun || p.dmg > 120) ctx.ellipse(0.16, ey - 0.2, 0.05, 0.06, 0, 0, 7);
  else ctx.arc(0.16, ey - 0.12, 0.08, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
  // estados
  ctx.globalAlpha = 1;
  if (now < p.shieldT) { ctx.strokeStyle = '#8ef2ff'; ctx.fillStyle = 'rgba(142,242,255,0.18)'; ctx.lineWidth = 0.08; circle(ctx, x, y + 0.6, 1.05); ctx.fill(); ctx.stroke(); }
  if (now < p.fragT) { ctx.strokeStyle = '#c36bff'; ctx.lineWidth = 0.06; ctx.setLineDash([0.15, 0.12]); circle(ctx, x, y + 0.55, 0.85); ctx.stroke(); ctx.setLineDash([]); }
  if (now < p.leadT) { ctx.fillStyle = '#5a5f6a'; ctx.fillRect(x - 0.45, y - 0.08, 0.9, 0.16); }
  if (now < p.glueT) { ctx.fillStyle = 'rgba(255,225,74,0.8)'; ctx.fillRect(x - 0.5, y - 0.05, 1, 0.12); }
  if (stun && p.tumble) for (let k = 0; k < 3; k++) { const a = t * 6 + k * 2.1; ctx.fillStyle = '#ffe14a'; circle(ctx, x + Math.cos(a) * 0.5, y + h + 0.25 + Math.sin(a) * 0.12, 0.08); ctx.fill(); }
  // anillo del jugador a los pies
  ctx.strokeStyle = ring; ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.ellipse(x, y + 0.02, 0.5, 0.12, 0, 0, Math.PI * 2); ctx.stroke();
  if (now < p.cloudT) { // nube de reaparición
    ctx.fillStyle = '#fff';
    for (const [dx, r] of [[-0.5, 0.35], [0, 0.45], [0.5, 0.35]]) { circle(ctx, x + dx, y - 0.25, r); ctx.fill(); }
  }
  void sp;
}

function accessory(ctx: CanvasRenderingContext2D, id: string, bw: number, bh: number, t: number, p: Pl) {
  const top = bh * 2 + 0.05;
  ctx.lineWidth = 0.06;
  switch (id) {
    case 'bombin':
      ctx.strokeStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(-0.05, top - 0.02); ctx.quadraticCurveTo(-0.1, top + 0.25, 0.1, top + 0.3); ctx.stroke();
      ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ffe14a' : '#ff7a1a'; circle(ctx, 0.12, top + 0.32, 0.08); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-bw, bh - 0.05, bw * 2, 0.1);
      break;
    case 'lia':
      ctx.fillStyle = '#0d5550'; ctx.beginPath(); ctx.ellipse(-0.42, top - 0.25, 0.12, 0.3, 0.6, 0, 7); ctx.fill();
      ctx.strokeStyle = '#cfd8dc'; ctx.beginPath(); ctx.arc(0.5, bh - 0.05, 0.1, -1.5, 1.5); ctx.stroke();
      break;
    case 'turbo':
      ctx.fillStyle = '#3a2f00'; ctx.fillRect(-bw, bh + 0.12, bw * 2, 0.12);
      ctx.fillStyle = '#8ef2ff'; circle(ctx, 0.04, bh + 0.18, 0.1); ctx.fill(); circle(ctx, 0.27, bh + 0.18, 0.1); ctx.fill();
      if (!p.ground) { ctx.fillStyle = Math.floor(t * 30) % 2 ? '#ff7a1a' : '#ffe14a'; ctx.beginPath(); ctx.moveTo(-0.3, 0.2); ctx.lineTo(-0.15, -0.25); ctx.lineTo(0, 0.2); ctx.fill(); }
      break;
    case 'muu':
      ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.ellipse(-0.18, bh - 0.05, 0.14, 0.18, 0.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.12, bh * 0.45, 0.1, 0.08, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8d8b0'; for (const hx of [-0.18, 0.24]) { ctx.beginPath(); ctx.moveTo(hx - 0.06, top - 0.08); ctx.lineTo(hx, top + 0.14); ctx.lineTo(hx + 0.06, top - 0.08); ctx.fill(); }
      ctx.fillStyle = '#ffb3c6'; ctx.beginPath(); ctx.ellipse(0.3, bh + 0.0, 0.14, 0.1, 0, 0, 7); ctx.fill();
      break;
    case 'chuchu':
      ctx.fillStyle = '#1d2a5a'; ctx.beginPath(); ctx.ellipse(0, top - 0.06, bw * 0.8, 0.14, 0, Math.PI, 0, true); ctx.fill();
      ctx.fillRect(0, top - 0.1, bw, 0.06);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-0.06, top - 0.04, 0.12, 0.06);
      break;
    case 'kunai':
      ctx.fillStyle = '#1a1033'; ctx.fillRect(-bw, bh + 0.08, bw * 2, 0.13);
      ctx.strokeStyle = '#1a1033'; ctx.lineWidth = 0.07;
      const wv = Math.sin(t * 10) * 0.08;
      ctx.beginPath(); ctx.moveTo(-bw, bh + 0.14); ctx.lineTo(-bw - 0.3, bh + 0.05 + wv); ctx.moveTo(-bw, bh + 0.14); ctx.lineTo(-bw - 0.25, bh + 0.25 - wv); ctx.stroke();
      break;
  }
}

// Ovni de MUU durante la abducción
function ufo(ctx: CanvasRenderingContext2D, x: number, y: number, held: boolean) {
  const t = R.time;
  ctx.fillStyle = held ? 'rgba(157,255,138,0.35)' : 'rgba(157,255,138,0.18)';
  ctx.beginPath(); ctx.moveTo(x - 0.6, y + 0.3); ctx.lineTo(x + 0.6, y + 0.3); ctx.lineTo(x + 2.5, y - 7.5); ctx.lineTo(x - 2.5, y - 7.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9fb3c8'; ctx.strokeStyle = '#1a1222'; ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.ellipse(x, y + 0.5, 1.4, 0.38, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(180,240,255,0.85)'; ctx.beginPath(); ctx.ellipse(x, y + 0.8, 0.6, 0.5, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
  for (let k = 0; k < 5; k++) { ctx.fillStyle = Math.floor(t * 8 + k) % 2 ? '#ffe14a' : '#ff5a5a'; circle(ctx, x - 1 + k * 0.5, y + 0.45, 0.08); ctx.fill(); }
  ctx.fillStyle = '#f4f1ea'; circle(ctx, x, y + 0.95, 0.28); ctx.fill(); // la vaca adentro
  ctx.fillStyle = '#1a1222'; circle(ctx, x + 0.1, y + 1, 0.05); ctx.fill();
}

function train(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, len: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.strokeStyle = '#1a1222'; ctx.lineWidth = 0.08;
  // locomotora al frente (x = 0 hacia atrás)
  ctx.fillStyle = color;
  ctx.fillRect(-4, 0.35, 4, 2.1); ctx.strokeRect(-4, 0.35, 4, 2.1);
  ctx.fillStyle = '#2b2b33'; ctx.fillRect(-1.2, 2.45, 0.6, 0.6); // chimenea
  ctx.fillStyle = '#ffe9a0'; ctx.fillRect(-0.5, 1.2, 0.4, 0.5);
  ctx.fillStyle = '#9fd7ff'; ctx.fillRect(-3.6, 1.4, 1, 0.7);
  for (let k = 1; k < Math.floor(len / 4) + 1; k++) { // vagones
    const x0 = -4 - k * 4.1;
    if (-x0 > len) break;
    ctx.fillStyle = k % 2 ? '#3d6ec9' : '#e8c07a';
    ctx.fillRect(x0, 0.35, 3.9, 1.9); ctx.strokeRect(x0, 0.35, 3.9, 1.9);
  }
  ctx.fillStyle = '#1a1222';
  for (let k = 0; k * 1.3 < len; k++) { circle(ctx, -0.8 - k * 1.3, 0.3, 0.3); ctx.fill(); }
  // morro
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(0, 0.35); ctx.lineTo(0.7, 0.35); ctx.lineTo(0, 1.1); ctx.fill();
  ctx.restore();
  for (let k = 0; k < 2; k++) { // humo
    ctx.fillStyle = 'rgba(240,240,240,0.6)';
    circle(ctx, x - dir * (1 + k * 0.8), y + 3.3 + k * 0.4, 0.35 + k * 0.15); ctx.fill();
  }
}

// ---- Proyectiles y objetos ---------------------------------------------------------------------------------------
function drawProj(ctx: CanvasRenderingContext2D, q: Proj, x: number, y: number, now: number) {
  const d = projOf(q.c), r = d?.r ?? 0.2, t = R.time, ang = Math.atan2(q.vy, q.vx);
  ctx.lineWidth = 0.05; ctx.strokeStyle = '#1a1222';
  const spin = (q.vx >= 0 ? -1 : 1) * t * 18;
  switch (q.c) {
    case 'bomba': case 'granbum': case 'racimo': case 'bombita': case 'pegajosa': {
      ctx.fillStyle = q.c === 'pegajosa' ? '#43c46a' : q.c === 'racimo' ? '#8f6bff' : '#2b2b33';
      circle(ctx, x, y, r); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle(ctx, x - r * 0.35, y + r * 0.35, r * 0.25); ctx.fill();
      const left = q.fuse !== NEVER ? (q.fuse - now) / 60 : 1;
      ctx.fillStyle = left < 0.5 && Math.floor(t * 16) % 2 ? '#ff3a3a' : '#ffe14a';
      circle(ctx, x + r * 0.5, y + r * 0.95, r * 0.28); ctx.fill();
      if (q.c === 'granbum') { ctx.fillStyle = '#fff'; circle(ctx, x - 0.1, y + 0.05, 0.08); circle(ctx, x + 0.1, y + 0.05, 0.08); ctx.fill(); }
      break;
    }
    case 'fueguito': case 'bola': case 'triple': case 'roca': case 'meteoro': {
      const big = q.c === 'meteoro' || q.c === 'roca';
      ctx.fillStyle = big ? '#5a3a2a' : '#ffb43a';
      circle(ctx, x, y, r); ctx.fill();
      ctx.fillStyle = big ? '#ff7a1a' : '#fff3a0'; circle(ctx, x, y, r * 0.55); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff7a1a';
      circle(ctx, x - q.vx * 0.03, y - q.vy * 0.03, r * 0.9); ctx.fill(); ctx.globalAlpha = 1;
      break;
    }
    case 'caballo':
      ctx.save(); ctx.translate(x, y); ctx.rotate(spin * 0.3);
      ctx.fillStyle = '#9c5a2b'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.8, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2414'; ctx.fillRect(-r * 0.2, r * 0.5, r * 0.3, r * 0.5);
      ctx.fillStyle = '#fff'; circle(ctx, r * 0.4, r * 0.2, r * 0.18); ctx.fill();
      ctx.restore(); break;
    case 'cohetito':
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = '#e84a5f'; ctx.fillRect(-0.35, -0.12, 0.6, 0.24); ctx.strokeRect(-0.35, -0.12, 0.6, 0.24);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0.25, -0.12); ctx.lineTo(0.45, 0); ctx.lineTo(0.25, 0.12); ctx.fill();
      ctx.fillStyle = Math.floor(t * 30) % 2 ? '#ffe14a' : '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-0.35, -0.1); ctx.lineTo(-0.7, 0); ctx.lineTo(-0.35, 0.1); ctx.fill();
      ctx.restore(); break;
    case 'palomitas': ctx.fillStyle = '#e84a5f'; ctx.fillRect(x - 0.25, y - 0.3, 0.5, 0.55); ctx.fillStyle = '#fff'; ctx.fillRect(x - 0.25, y - 0.3, 0.12, 0.55); ctx.fillRect(x + 0.03, y - 0.3, 0.12, 0.55); circle(ctx, x, y + 0.3, 0.22); ctx.fill(); break;
    case 'grano': ctx.fillStyle = '#fff6d8'; circle(ctx, x, y, r * 1.2); ctx.fill(); ctx.stroke(); break;
    case 'melocoton': ctx.fillStyle = '#a35bd6'; circle(ctx, x, y, r); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#4a9a4a'; ctx.beginPath(); ctx.ellipse(x + 0.1, y + r, 0.12, 0.05, 0.5, 0, 7); ctx.fill(); break;
    case 'shuriken':
      ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
      ctx.fillStyle = '#cfd8dc';
      for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.08, 0.08); ctx.lineTo(0, 0.3); ctx.lineTo(-0.08, 0.08); ctx.fill(); }
      ctx.restore(); break;
    case 'boomerang':
      ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
      ctx.strokeStyle = '#c8873a'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.arc(0, -0.15, 0.3, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.restore(); break;
    case 'caparazon':
      ctx.fillStyle = '#3fae4a'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - r, y - r * 0.2, r * 2, r * 0.25); break;
    case 'tele': case 'swap': ctx.fillStyle = q.c === 'tele' ? '#6ff' : '#ff6ad5'; circle(ctx, x, y, r * (1 + Math.sin(t * 20) * 0.2)); ctx.fill(); break;
    case 'mina': {
      ctx.fillStyle = '#3a3a44'; ctx.beginPath(); ctx.ellipse(x, y, 0.3, 0.14, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = now >= q.arm && Math.floor(t * 4) % 2 ? '#ff3a3a' : '#7a2020'; circle(ctx, x, y + 0.1, 0.07); ctx.fill(); break;
    }
    case 'pegamento': ctx.fillStyle = '#ffe14a'; circle(ctx, x, y, r); ctx.fill(); break;
    case 'banana':
      ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.arc(x, y + 0.25, 0.25, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); break;
    default: ctx.fillStyle = '#fff'; circle(ctx, x, y, r); ctx.fill();
  }
}

function drawProp(ctx: CanvasRenderingContext2D, k: string, x: number, y: number, chute: boolean) {
  ctx.strokeStyle = '#1a1222'; ctx.lineWidth = 0.06;
  if (k === 'caja') {
    if (chute) {
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath(); ctx.arc(x, y + 2.2, 1.1, 0, Math.PI); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 1.1, y + 2.2); ctx.lineTo(x - 0.35, y + 0.8); ctx.moveTo(x + 1.1, y + 2.2); ctx.lineTo(x + 0.35, y + 0.8); ctx.stroke();
    }
    ctx.fillStyle = '#c8873a'; ctx.fillRect(x - PROP_HW, y, PROP_HW * 2, PROP_H); ctx.strokeRect(x - PROP_HW, y, PROP_HW * 2, PROP_H);
    ctx.fillStyle = '#ffd23f'; ctx.save(); ctx.translate(x, y + 0.4); ctx.scale(0.02, -0.02); ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 1); ctx.restore();
  } else if (k === 'tnt') {
    ctx.fillStyle = '#d63a2a'; ctx.fillRect(x - PROP_HW, y, PROP_HW * 2, PROP_H); ctx.strokeRect(x - PROP_HW, y, PROP_HW * 2, PROP_H);
    ctx.fillStyle = '#fff'; ctx.save(); ctx.translate(x, y + 0.4); ctx.scale(0.01, -0.01); ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNT', 0, 0); ctx.restore();
  } else {
    ctx.fillStyle = '#c8302a'; ctx.beginPath(); ctx.roundRect(x - 0.32, y, 0.64, 0.78, 0.08); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 0.32, y + 0.3, 0.64, 0.14);
    ctx.fillStyle = '#555'; ctx.fillRect(x + 0.05, y + 0.78, 0.15, 0.12);
  }
}

// ---- Todo ---------------------------------------------------------------------------------------------------------
export type DrawOpts = { me: number, aim: null | { pts: [number, number][], place?: [number, number], color: string }, hookAim: null | { x: number, y: number, grace: boolean, ok: boolean } };

export function drawWorld(ctx: CanvasRenderingContext2D, v: View, s: State, w: World, ip: IP, o: DrawOpts, dt: number) {
  R.time += dt;
  const m = w.m, th = R.theme!, now = s.t;
  background(ctx, v, w);
  water(ctx, v, w, false);
  // terreno
  if (R.tc) {
    flush(R.tc);
    world(ctx, v);
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(R.tc.cv, 0, -R.T!.rows * CELL, R.T!.cols * CELL, R.T!.rows * CELL);
    ctx.restore();
  }
  world(ctx, v);
  // vías y tren del mapa
  const tr = m.hz.train;
  if (tr) {
    ctx.fillStyle = '#5a5a66';
    ctx.fillRect(-20, tr.y + 0.75, m.w + 40, 0.12);
    ctx.fillStyle = '#6b4a2e';
    for (let x = -20; x < m.w + 20; x += 1.2) ctx.fillRect(x, tr.y + 0.65, 0.5, 0.1);
    if (s.hz.trainRun) train(ctx, s.hz.trainX, tr.y + 0.75, s.hz.trainDir, tr.len, '#d63a2a');
  }
  // trampolines
  for (const pd of m.pads) {
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(pd.x - 0.15, pd.y - 0.1, 0.3, 0.4);
    ctx.fillStyle = '#ff5ab0'; ctx.beginPath(); ctx.ellipse(pd.x, pd.y + 0.35, pd.w / 2, 0.35, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff'; circle(ctx, pd.x - 0.3, pd.y + 0.5, 0.08); circle(ctx, pd.x + 0.25, pd.y + 0.55, 0.1); ctx.fill();
  }
  // zonas
  for (const z of s.zones) {
    const a = Math.min(1, (z.until - now) / 30);
    ctx.globalAlpha = a;
    if (z.k === 'nube') { ctx.fillStyle = 'rgba(163,91,214,0.35)'; for (let k = 0; k < 5; k++) { const ang = k * 1.26 + R.time; circle(ctx, z.x + Math.cos(ang) * z.r * 0.5, z.y + Math.sin(ang) * z.r * 0.4, z.r * 0.6); ctx.fill(); } }
    if (z.k === 'fuego') { for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#ff7a1a' : '#ffd23f'; const fx = z.x - z.r + k * z.r / 2.6, fh = 0.6 + Math.abs(Math.sin(R.time * 9 + k)) * 0.6; ctx.beginPath(); ctx.moveTo(fx - 0.3, z.y); ctx.lineTo(fx, z.y + fh); ctx.lineTo(fx + 0.3, z.y); ctx.fill(); } }
    if (z.k === 'pega') { ctx.fillStyle = 'rgba(255,225,74,0.85)'; ctx.beginPath(); ctx.ellipse(z.x, z.y + 0.05, z.r, 0.15, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  // avisos (rocas, meteorito, vaca) y rayos con tiempo
  for (const b of s.beams) {
    if (b.k === 'roca' || b.k === 'meteo' || (b.k === 'vaca' && now < b.t0)) {
      const left = Math.max(0, b.t0 - now) / 60, gy = groundY(b.x, m.h, m.water);
      ctx.strokeStyle = b.k === 'vaca' ? '#9dff8a' : '#ff3a3a'; ctx.lineWidth = 0.1;
      const r = b.k === 'meteo' ? 3.6 : b.k === 'vaca' ? 1.2 : 2.4;
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(R.time * 10));
      ctx.beginPath(); ctx.ellipse(b.x, gy, r * (0.5 + 0.5 * (1 - Math.min(1, left))), 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (b.k === 'vaca') ufo(ctx, b.x, b.y - 3, false);
    if (b.k === 'mega') {
      if (now < b.t0) { ctx.fillStyle = '#7ff8ff'; circle(ctx, b.x, b.y, 0.2 + (1 - (b.t0 - now) / 27) * 0.6); ctx.fill(); }
      else {
        const L = b.len;
        ctx.strokeStyle = 'rgba(127,248,255,0.5)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.dx * L, b.y + b.dy * L); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9; ctx.stroke();
      }
    }
  }
  // objetos
  for (const ob of s.props) { const [x, y] = ip('o' + ob.id, ob.x, ob.y); drawProp(ctx, ob.k, x, y, ob.chute); }
  // ligas
  for (const p of s.pl) {
    if (!p.alive) continue;
    const [x, y] = ip('p' + p.id, p.x, p.y), hx = x, hy = y + HAND_Y;
    const sh = p.shot;
    let tx = 0, ty = 0, on = false;
    if (p.hook) { tx = p.hook.x, ty = p.hook.y; if (now < p.hook.at && sh) { const f = (now - sh.t) / Math.max(1, sh.at - sh.t); tx = hx + (p.hook.x - hx) * f, ty = hy + (p.hook.y - hy) * f; } on = true; }
    else if (sh && !sh.hit && now < sh.at + 6) { const f = Math.min(1, (now - sh.t) / Math.max(1, sh.at - sh.t)); tx = sh.ox + (sh.x - sh.ox) * f, ty = sh.oy + (sh.y - sh.oy) * f; on = true; }
    if (on) {
      ctx.strokeStyle = '#1a1222'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = PCOLORS[p.color]; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.fillStyle = '#cfd8dc'; circle(ctx, tx, ty, 0.14); ctx.fill();
    }
  }
  // proyectiles
  for (const q of s.pr) { const [x, y] = ip('q' + q.id, q.x, q.y); drawProj(ctx, q, x, y, now); }
  // jugadores (el propio al final, encima)
  const order = [...s.pl].sort((a, b) => (a.id === o.me ? 1 : 0) - (b.id === o.me ? 1 : 0));
  for (const p of order) {
    if (!p.alive) continue;
    const [x, y] = ip('p' + p.id, p.x, p.y);
    const u = p.u;
    if (u?.k === 'abduccion') {
      ufo(ctx, x, y, u.ids.length > 0);
      continue;
    }
    if (u?.k === 'expreso') train(ctx, u.x, u.y, u.dx >= 0 ? 1 : -1, 12, charOf(p.ch).color);
    if (u?.k === 'lazo') for (const id of u.ids) { const q = s.pl[id]; if (!q.alive) continue; const [qx, qy] = ip('p' + q.id, q.x, q.y); ctx.strokeStyle = '#3fd0c9'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(x, y + 0.6); ctx.lineTo(qx, qy + 0.6); ctx.stroke(); }
    if (u?.k === 'meteoro' && u.f === 1) { // retícula
      const gy = groundY(u.x, m.h, m.water);
      ctx.strokeStyle = '#ff3a3a'; ctx.lineWidth = 0.12;
      circle(ctx, u.x, gy + 0.3, 2.5 + Math.sin(R.time * 10) * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(u.x - 3, gy + 0.3); ctx.lineTo(u.x + 3, gy + 0.3); ctx.moveTo(u.x, gy - 2.7); ctx.lineTo(u.x, gy + 3.3); ctx.stroke();
      continue;
    }
    if (u && (u.k === 'meteoro' || u.k === 'cohete')) { // estela de fuego
      ctx.fillStyle = 'rgba(255,122,26,0.6)';
      circle(ctx, x - p.vx * 0.03, y + 0.5 - p.vy * 0.03, 0.8); ctx.fill();
    }
    drawPlayer(ctx, s, p, x, y, p.id === o.me);
  }
  // rayos instantáneos y tajos
  for (const r of FX.rays) {
    const a = r.life / r.max;
    ctx.globalAlpha = a;
    ctx.strokeStyle = r.c; ctx.lineWidth = r.r * 2 + 0.15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.lineTo(r.x1, r.y1); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.06, r.r * 0.8); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
  // partículas
  for (const p of FX.parts) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = p.k === P_KIND.chunk ? 1 : a;
    ctx.fillStyle = p.c;
    if (p.k === P_KIND.ring) { ctx.strokeStyle = p.c; ctx.lineWidth = 0.15 * a + 0.02; circle(ctx, p.x, p.y, p.r * (1.2 - a)); ctx.stroke(); }
    else if (p.k === P_KIND.chunk) ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    else if (p.k === P_KIND.star) { ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
    else { circle(ctx, p.x, p.y, p.r * (p.k === P_KIND.smoke ? 1.6 - a * 0.6 : p.k === P_KIND.fire ? 0.5 + a * 0.5 : 1)); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  // trayectoria de la carta que se apunta y mira de la liga
  if (o.aim) {
    ctx.fillStyle = o.aim.color;
    o.aim.pts.forEach(([x, y], k) => { if (k % 2 === 0) { circle(ctx, x, y, 0.09 - k * 0.0008); ctx.fill(); } });
    if (o.aim.place) { ctx.strokeStyle = o.aim.color; ctx.lineWidth = 0.1; circle(ctx, o.aim.place[0], o.aim.place[1], 1.2); ctx.stroke(); }
  }
  if (o.hookAim) {
    ctx.strokeStyle = o.hookAim.ok ? '#8ef2ff' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.07;
    if (o.hookAim.grace) ctx.setLineDash([0.15, 0.12]);
    circle(ctx, o.hookAim.x, o.hookAim.y, 0.3); ctx.stroke();
    ctx.setLineDash([]);
  }
  water(ctx, v, w, true);
  // destello de pantalla
  screen(ctx, v);
  if (FX.flash > 0) { ctx.globalAlpha = FX.flash * 0.6; ctx.fillStyle = FX.flashC; ctx.fillRect(0, 0, v.W, v.H); ctx.globalAlpha = 1; }
  void th;
}

// Altura del suelo bajo x (para marcas y retículas)
function groundY(x: number, top: number, wat: number) {
  const T = R.T;
  if (!T) return wat;
  const i = Math.floor(x / CELL);
  for (let j = Math.floor(top / CELL); j >= 0; j--) if (i >= 0 && i < T.cols && T.g[j * T.cols + i] !== AIR) return (j + 1) * CELL;
  return wat;
}

export { HW, PROP_H, NEVER };

// Retrato de un personaje en un lienzo chico (menús)
export function drawPortrait(cv: HTMLCanvasElement, ch: string, color = 0) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 96, Hh = cv.clientHeight || 96;
  cv.width = W * dpr, cv.height = Hh * dpr;
  const ctx = cv.getContext('2d')!, k = Hh / 1.9;
  ctx.setTransform(k * dpr, 0, 0, -k * dpr, W / 2 * dpr, Hh * 0.88 * dpr);
  const p = { id: 0, ch, color, x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: true, crouch: false, dmg: 0, invT: -1e9, stunT: -1e9, shieldT: -1e9,
    fragT: -1e9, leadT: -1e9, glueT: -1e9, cloudT: -1e9, tumble: false, u: null, team: 0 } as unknown as Pl;
  drawPlayer(ctx, { t: 0, rules: { teams: false } } as unknown as State, p, 0, 0, false);
}

// Miniatura de un mapa: el terreno por celdas, el agua y el cielo del tema
export function drawMapThumb(cv: HTMLCanvasElement, T: Terr, mapTheme: string, water: number) {
  const th = themeOf(mapTheme), W = cv.width = 192, Hh = cv.height = 108, ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
  const sx = W / T.cols, sy = Hh / T.rows;
  for (let j = 0; j < T.rows; j++) for (let i = 0; i < T.cols; i++) {
    const m = T.g[j * T.cols + i];
    if (!m) continue;
    ctx.fillStyle = m === ROCK ? th.rock[0] : m === WOOD ? th.wood[0] : (T.g[(j + 1) * T.cols + i] ? th.dirt[0] : th.top);
    ctx.fillRect(i * sx, Hh - (j + 1) * sy, sx + 0.5, sy + 0.5);
  }
  ctx.fillStyle = th.sea; ctx.globalAlpha = 0.85;
  ctx.fillRect(0, Hh - water / CELL * sy, W, water / CELL * sy);
  ctx.globalAlpha = 1;
}
