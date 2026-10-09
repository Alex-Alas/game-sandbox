// HUD en pantalla: tiempo y puntos arriba, la mano y el maná abajo al centro, % sobre cada personaje, avisos,
// flechas a los que quedaron fuera de cuadro, el registro de KOs y la tabla (TAB).
import { CARD } from './sim/cards.ts';
import { charOf, PCOLORS, TEAMS } from './sim/chars.ts';
import { GO, HZ, H, type State, type World, type Pl } from './sim/state.ts';
import { standings, timeLeft } from './sim/sim.ts';
import { toScreen, type View, type IP } from './render.ts';
import { FX } from './fx.ts';
import { drawCard } from './art.ts';
import { drawHead } from './toon.ts';
import { S } from './settings.ts';

const font = (px: number, w = 'bold') => `${w} ${Math.round(px)}px system-ui, "Segoe UI", sans-serif`;
const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

// Rectángulos de la mano (4 cartas + la de la caja), abajo al centro
export function handRects(touch: boolean) {
  const W = innerWidth, H0 = innerHeight, sc = (touch ? S.touch.card : 100) / 100;
  const cw = Math.round((touch ? 52 : 58) * sc), ch = Math.round(cw * 1.32), gap = Math.round(6 * sc);
  const total = 5 * cw + 4 * gap + 10;
  let x = W / 2 - total / 2, y = H0 - ch - (touch ? 10 : 14);
  if (touch && H0 > W) y = H0 - ch - 2 * 60 * S.touch.stick / 100 - 40; // en vertical, arriba de los controles
  return Array.from({ length: 5 }, (_, k) => ({ x: x + k * (cw + gap) + (k === 4 ? 10 : 0), y, w: cw, h: ch }));
}

export type HudOpts = { me: number, touch: boolean, aimSlot: number, selected: number, table: boolean, online: string, ping: number };

export function drawHud(ctx: CanvasRenderingContext2D, v: View, s: State, w: World, ip: IP, o: HudOpts) {
  const W = v.W, Hh = v.H, me = o.me >= 0 ? s.pl[o.me] : null;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.textAlign = 'center', ctx.textBaseline = 'middle';
  // nombres y % sobre los personajes
  for (const p of s.pl) {
    if (!p.alive || (p.u?.k === 'meteoro' && p.u.f === 1)) continue;
    const [x, y] = ip('p' + p.id, p.x, p.y), [sx, sy] = toScreen(v, x, y + H + 0.6);
    const col = s.rules.teams ? TEAMS[p.team].color : PCOLORS[p.color];
    if (S.nums) {
      const d = Math.round(p.dmg), c = d > 150 ? '#ff4a3a' : d > 90 ? '#ffb43a' : d > 40 ? '#ffe9a0' : '#ffffff';
      ctx.font = font(13 + Math.min(6, d / 40));
      ctx.lineWidth = 3, ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(`${d}%`, sx, sy);
      ctx.fillStyle = c; ctx.fillText(`${d}%`, sx, sy);
    }
    ctx.font = font(10);
    ctx.fillStyle = col;
    ctx.fillText(p.id === o.me ? '▼ VOS' : p.name.slice(0, 10), sx, sy - 14);
  }
  // textos que saltan (en el mundo)
  for (const p of FX.pops) {
    const [sx, sy] = toScreen(v, p.x, p.y), a = Math.min(1, p.life / p.max * 2), sc = 1 + (1 - p.life / p.max) * 0.15;
    ctx.globalAlpha = a;
    ctx.font = font(15 * p.size * sc);
    ctx.lineWidth = 4, ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(p.txt, sx, sy);
    ctx.fillStyle = p.c; ctx.fillText(p.txt, sx, sy);
  }
  ctx.globalAlpha = 1;
  // flechas a los que están fuera de cuadro
  for (const p of s.pl) {
    if (!p.alive) continue;
    const [x, y] = ip('p' + p.id, p.x, p.y), [sx, sy] = toScreen(v, x, y + 0.6);
    if (sx > 0 && sx < W && sy > 0 && sy < Hh) continue;
    const cx = Math.max(22, Math.min(W - 22, sx)), cy = Math.max(60, Math.min(Hh - 22, sy)), a = Math.atan2(sy - cy, sx - cx);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.fillStyle = PCOLORS[p.color]; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = font(10); ctx.fillText(`${Math.round(p.dmg)}%`, cx - Math.cos(a) * 16, cy - Math.sin(a) * 16);
  }
  // arriba: tiempo y puntos
  const tl = timeLeft(s);
  ctx.font = font(22);
  const ts = s.sudden ? '¡MUERTE SÚBITA!' : tl === null ? '∞' : `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, W / 2 - 62, 6, 124, 30, 15); ctx.fill();
  ctx.fillStyle = s.sudden || (tl !== null && tl < 10 && Math.floor(tl * 2) % 2 === 0) ? '#ff5a3c' : '#fff';
  ctx.fillText(ts, W / 2, 22);
  if (s.rules.teams) {
    const st = standings(s);
    ctx.font = font(18);
    ctx.fillStyle = TEAMS[0].color; ctx.fillText(`${st.teams[0]}`, W / 2 - 86, 22);
    ctx.fillStyle = TEAMS[1].color; ctx.fillText(`${st.teams[1]}`, W / 2 + 86, 22);
  }
  // fichas de los jugadores (las de la izquierda y la derecha del reloj)
  const n = s.pl.length, chipW = Math.min(118, (W - 150) / Math.max(1, Math.ceil(n / 2)) - 6);
  s.pl.forEach((p, k) => {
    const side = k % 2, idx = Math.floor(k / 2);
    const x = side === 0 ? W / 2 - 72 - (idx + 1) * (chipW + 6) : W / 2 + 72 + idx * (chipW + 6), y = 6;
    if (x < 0 || x + chipW > W) return;
    ctx.fillStyle = p.id === o.me ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)';
    rr(ctx, x, y, chipW, 30, 8); ctx.fill();
    ctx.fillStyle = s.rules.teams ? TEAMS[p.team].color : PCOLORS[p.color];
    ctx.fillRect(x, y + 4, 4, 22);
    ctx.save(); rr(ctx, x, y, chipW, 30, 8); ctx.clip(); // cabecita del personaje
    ctx.translate(x + 16, y + 16); ctx.scale(24, -24);
    drawHead(ctx, p.ch, { t: performance.now() / 1000, seed: p.id * 1.91, vx: 0, vy: 0, ground: true, crouch: false, stun: s.t < p.stunT, dmg: p.dmg, dash: false });
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = font(10);
    ctx.fillText(p.name.slice(0, chipW > 100 ? 10 : 6), x + 27, y + 10);
    ctx.font = font(12); ctx.fillStyle = p.alive ? '#ffe9a0' : '#888';
    ctx.fillText(p.alive ? `${Math.round(p.dmg)}%` : `${Math.max(0, Math.ceil((p.spawnT - s.t) / HZ))}s`, x + 27, y + 22);
    ctx.textAlign = 'right'; ctx.font = font(15); ctx.fillStyle = '#ffd23f';
    ctx.fillText(String(p.score), x + chipW - 6, y + 16);
    ctx.textAlign = 'center';
  });
  // registro de KOs
  ctx.textAlign = 'right'; ctx.font = font(11);
  FX.feed.forEach((f, k) => {
    ctx.globalAlpha = Math.min(1, f.t);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; const tw = ctx.measureText(f.txt).width; rr(ctx, W - tw - 18, 44 + k * 20, tw + 12, 18, 6); ctx.fill();
    ctx.fillStyle = f.c; ctx.fillText(f.txt, W - 12, 53 + k * 20);
  });
  ctx.globalAlpha = 1; ctx.textAlign = 'center';
  // cuenta regresiva y carteles
  if (s.t < GO * HZ) {
    const c = Math.ceil((GO * HZ - s.t) / HZ);
    ctx.font = font(Math.min(W, Hh) * 0.25); ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeText(String(c), W / 2, Hh * 0.42); ctx.fillStyle = '#fff'; ctx.fillText(String(c), W / 2, Hh * 0.42);
  }
  if (FX.banner) {
    const b = FX.banner, sc = 1 + Math.max(0, b.t - 0.9) * 1.5;
    ctx.font = font(Math.min(W * 0.11, 64) * sc); ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(b.txt, W / 2, Hh * 0.3); ctx.fillStyle = b.c; ctx.fillText(b.txt, W / 2, Hh * 0.3);
    if (b.sub) { ctx.font = font(16); ctx.lineWidth = 4; ctx.strokeText(b.sub, W / 2, Hh * 0.3 + 40); ctx.fillStyle = '#fff'; ctx.fillText(b.sub, W / 2, Hh * 0.3 + 40); }
  }
  // lo propio: mano, maná, ulti y reaparición
  if (me) ownHud(ctx, s, w, me, o);
  if (o.online) { ctx.textAlign = 'left'; ctx.font = font(10, 'normal'); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(o.online, 8, Hh - 8); ctx.textAlign = 'center'; }
  if (o.table) table(ctx, s, W, Hh);
}

function ownHud(ctx: CanvasRenderingContext2D, s: State, w: World, p: Pl, o: HudOpts) {
  const rs = handRects(o.touch), first = rs[0], last = rs[4];
  const inf = s.rules.infinite;
  for (let k = 0; k < 5; k++) {
    const id = k === 4 ? p.bonus : p.hand[k], r = rs[k];
    if (!id) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
      rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = font(9); ctx.fillText('CAJA', r.x + r.w / 2, r.y + r.h / 2);
      continue;
    }
    drawCard(ctx, id, r.x, r.y, r.w, r.h, { mana: inf ? 99 : p.mana, free: k === 4, sel: !o.touch && o.selected === k, aim: o.aimSlot === k, key: o.touch ? '' : String(k + 1) });
  }
  // siguiente carta
  const nx = p.queue[0];
  if (nx && innerWidth > 520) {
    ctx.globalAlpha = 0.6;
    drawCard(ctx, nx, first.x - first.w * 0.62 - 8, first.y + first.h * 0.35, first.w * 0.62, first.h * 0.62, {});
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = font(9); ctx.fillText('SIGUE', first.x - first.w * 0.31 - 8, first.y + first.h * 0.28);
  }
  // maná: barra sobre la mano con 10 segmentos
  const mx = first.x, mw = last.x + last.w - first.x, my = first.y - 14;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, mx, my, mw, 10, 5); ctx.fill();
  const mm = w.c.MANA_MAX, f = inf ? 1 : p.mana / mm;
  ctx.fillStyle = '#4f8bff'; rr(ctx, mx, my, Math.max(0, mw * f), 10, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  for (let k = 1; k < mm; k++) { ctx.beginPath(); ctx.moveTo(mx + mw * k / mm, my); ctx.lineTo(mx + mw * k / mm, my + 10); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.font = font(10); ctx.fillText(inf ? '∞' : String(Math.floor(p.mana)), mx - 10, my + 5);
  // ulti (en táctil está en su botón)
  if (!o.touch) {
    const ux = last.x + last.w + 16, uy = first.y + 4, uw = 56, uh = first.h - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, ux, uy, uw, uh, 8); ctx.fill();
    ctx.fillStyle = p.ulti >= 100 ? `hsl(${(performance.now() / 4) % 360},90%,60%)` : '#ffd23f';
    rr(ctx, ux, uy + uh * (1 - p.ulti / 100), uw, uh * p.ulti / 100, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(11); ctx.fillText('ULTI', ux + uw / 2, uy + uh / 2 - 7);
    ctx.font = font(9); ctx.fillText(p.ulti >= 100 ? '¡Q!' : `${Math.floor(p.ulti)}%`, ux + uw / 2, uy + uh / 2 + 8);
  }
  if (!p.alive) {
    ctx.font = font(20); ctx.fillStyle = '#fff'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    const txt = `Volvés en ${Math.max(0, Math.ceil((p.spawnT - s.t) / HZ))}…`;
    ctx.strokeText(txt, innerWidth / 2, innerHeight * 0.55); ctx.fillText(txt, innerWidth / 2, innerHeight * 0.55);
  }
}

// Tabla de posiciones (TAB, o al terminar)
export function table(ctx: CanvasRenderingContext2D, s: State, W: number, Hh: number) {
  const st = standings(s), rows = st.order, h = 24 * rows.length + 40, w = Math.min(460, W - 20), x = W / 2 - w / 2, y = Hh / 2 - h / 2;
  ctx.fillStyle = 'rgba(10,8,20,0.85)'; rr(ctx, x, y, w, h, 12); ctx.fill();
  ctx.font = font(12); ctx.fillStyle = '#9a93b8'; ctx.textAlign = 'left';
  const cols = [x + 14, x + w * 0.5, x + w * 0.64, x + w * 0.78, x + w * 0.9];
  ['JUGADOR', 'PTS', 'KO', 'CAÍDAS', '%HECHO'].forEach((c, k) => ctx.fillText(c, cols[k], y + 20));
  rows.forEach((p, k) => {
    const yy = y + 44 + k * 24;
    ctx.fillStyle = s.rules.teams ? TEAMS[p.team].color : PCOLORS[p.color];
    ctx.fillText(`${k + 1}. ${p.name} (${charOf(p.ch).name})`, cols[0], yy);
    ctx.fillStyle = '#fff';
    [p.score, p.kos, p.falls, Math.round(p.dealt)].forEach((v, j) => ctx.fillText(String(v), cols[j + 1], yy));
  });
  ctx.textAlign = 'center';
}
