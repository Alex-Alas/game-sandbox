// Lo que dibuja cada uno en el lienzo, según su papel:
//  - SORDO: la combi por dentro, la bomba a color, el CIEGO enfrente (con su mano sobre la bomba), el MUDO en el asiento de
//    atrás (sus gestos) y la radio. En el apagón, solo lo que brilla.
//  - CIEGO: oscuridad y la bomba al tacto; lo que oye, subtitulado.
//  - MUDO: el asiento de atrás y el SORDO de frente (sus gestos y su boca); el manual va en el DOM.
// En la portada, la sala y la sesión informativa: los tres monos detrás de una bomba.
import { app } from './app.ts';
import { drawBomb, layout, MW, MH, rr, type Layout } from './draw.ts';
import { drawMonkey, drawBanana } from './monkey.ts';
import { GESTURE_NAME, ROLE_NAME, sees, type Role } from './sim/const.ts';
import { newBomb, type Bomb, type Env } from './sim/bomb.ts';

const R = (a: number, b: number) => a + Math.random() * (b - a);
type Rect = { x: number, y: number, w: number, h: number };

// ---- Fondo: el lugar por dentro, con la ventana y el paisaje que pasa ------------------------------------------
function backdrop(g: CanvasRenderingContext2D, W: number, H: number, env: Env, t: number, winH: number, lit = 1) {
  const wall = env === 'avion' ? ['#d9dde4', '#aeb5c0'] : env === 'tren' ? ['#7a4a2a', '#4f2f1b'] : ['#c9a06a', '#8a6a44'];
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, wall[0]), gr.addColorStop(1, wall[1]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // ventanas
  const wins: Rect[] = [];
  if (env === 'avion') { const n = Math.max(2, Math.round(W / 220)), ww = Math.min(winH * 0.76, W / n * 0.7); for (let k = 0; k < n; k++) wins.push({ x: (k + 0.5) * W / n - ww / 2, y: winH * 0.12, w: ww, h: winH * 0.8 }); }
  else { const n = Math.max(2, Math.round(W / 420)); for (let k = 0; k < n; k++) wins.push({ x: k * W / n + 14, y: winH * 0.1, w: W / n - 28, h: winH * 0.78 }); }
  for (const w of wins) {
    g.save(); rr(g, w.x, w.y, w.w, w.h, env === 'avion' ? w.w * 0.45 : 14); g.clip();
    const sky = g.createLinearGradient(0, w.y, 0, w.y + w.h);
    if (env === 'avion') sky.addColorStop(0, '#3f8be0'), sky.addColorStop(1, '#bfe3ff');
    else sky.addColorStop(0, '#6fc3ff'), sky.addColorStop(1, '#d8f1ff');
    g.fillStyle = sky; g.fillRect(w.x, w.y, w.w, w.h);
    const speed = env === 'avion' ? 60 : env === 'tren' ? 260 : 160;
    if (env === 'avion') {
      for (let k = 0; k < 6; k++) { const x = ((k * 173 - t * speed) % (W + 300) + W + 300) % (W + 300) - 150, y = w.y + w.h * (0.3 + (k % 3) * 0.2); cloud(g, x, y, 24 + (k % 3) * 10); }
    } else {
      const hy = w.y + w.h * 0.62;
      g.fillStyle = env === 'tren' ? '#7cb342' : '#8bc34a';
      g.beginPath(); g.moveTo(w.x, w.y + w.h);
      for (let x = w.x; x <= w.x + w.w + 10; x += 10) g.lineTo(x, hy - 12 * Math.sin((x + t * speed * 0.3) / 90) - 6);
      g.lineTo(w.x + w.w, w.y + w.h); g.fill();
      for (let k = 0; k < 8; k++) { // postes y árboles que pasan rápido
        const x = ((k * 211 - t * speed) % (W + 200) + W + 200) % (W + 200) - 100;
        if (k % 2) { g.fillStyle = '#5d4037'; g.fillRect(x, hy - 30, 4, 60); }
        else { g.fillStyle = '#2e7d32'; g.beginPath(); g.arc(x, hy - 18, 16, 0, Math.PI * 2); g.fill(); g.fillStyle = '#5d4037'; g.fillRect(x - 2, hy - 6, 4, 20); }
      }
    }
    g.restore();
    rr(g, w.x, w.y, w.w, w.h, env === 'avion' ? w.w * 0.45 : 14); g.strokeStyle = '#2b2118'; g.lineWidth = 5; g.stroke();
  }
  // piso
  g.fillStyle = env === 'avion' ? '#3d4f7a' : env === 'tren' ? '#3b2a20' : '#4a4a52';
  g.fillRect(0, H * 0.72, W, H * 0.28);
  if (lit < 1) { g.fillStyle = `rgba(0,0,8,${1 - lit})`; g.fillRect(0, 0, W, H); }
}
function cloud(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [dx, dy, k] of [[0, 0, 1], [r * 0.9, 4, 0.8], [-r * 0.9, 5, 0.75], [r * 0.3, -r * 0.5, 0.8]]) { g.beginPath(); g.arc(x + dx, y + dy, r * k, 0, Math.PI * 2); g.fill(); }
}

// ---- Bomba: dónde va en pantalla (con zoom a un módulo) ----------------------------------------------------------
function fitBomb(L: Layout, area: Rect): { s: number, ox: number, oy: number } {
  const base = Math.min(area.w / L.w, area.h / L.h);
  let s = base, cx = L.w / 2, cy = L.h / 2;
  if (app.zoom >= 0 && app.zoom < L.cells.length) {
    const c = L.cells[app.zoom], zs = Math.min(area.w / (MW + 16), area.h / (MH + 16));
    const k = app.zoomK;
    s = base + (zs - base) * k; cx = L.w / 2 + (c.x + MW / 2 - L.w / 2) * k; cy = L.h / 2 + (c.y + MH / 2 - L.h / 2) * k;
  }
  // si sobra alto (pantalla vertical), la bomba sube en vez de quedar flotando en el medio
  const spare = area.h - L.h * base, up = app.zoom < 0 && spare > 40 ? (spare - 40) / 2 : 0;
  return { s, ox: area.x + area.w / 2 - cx * s, oy: area.y + area.h / 2 - cy * s - up };
}
const toScreen = (x: number, y: number) => [app.bt.ox + x * app.bt.s, app.bt.oy + y * app.bt.s];
export const toBomb = (sx: number, sy: number) => ({ x: (sx - app.bt.ox) / app.bt.s, y: (sy - app.bt.oy) / app.bt.s });

function monkeyAt(g: CanvasRenderingContext2D, r: Role, x: number, y: number, s: number, mood: 'normal' | 'boom' | 'win' = 'normal') {
  const ge = app.ges[r], gt = ge ? app.now - ge.t : 99, hit = [...app.hits].reverse().find(h => h.to === r);
  const talk = app.talk[r] ? 0.35 + 0.35 * Math.abs(Math.sin(app.now * 14 + r.length)) : 0;
  drawMonkey(g, x, y, s, { role: r, mouth: talk, ges: ge && gt < 2.6 ? ge.g : null, gt, t: app.now + r.length, hitT: hit ? app.now - hit.t : 99, mood });
  app.avatars.push({ r, x, y, rad: s * 1.6 });
  if (ge && gt < 2.6 && mood === 'normal') {
    const txt = GESTURE_NAME[ge.g], fs = Math.max(14, s * 0.42);
    g.font = `900 ${fs}px system-ui, sans-serif`;
    const w = g.measureText(txt).width + fs;
    g.globalAlpha = Math.min(1, (2.6 - gt) * 3);
    rr(g, x - w / 2, y + s * 2.45, w, fs * 1.4, fs * 0.5); g.fillStyle = '#fff6c9'; g.fill(); g.strokeStyle = '#22160d'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#22160d'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y + s * 2.45 + fs * 0.72);
    g.globalAlpha = 1;
  }
}
function nameTag(g: CanvasRenderingContext2D, r: Role, x: number, y: number, s: number) {
  const fs = Math.max(11, s * 0.28);
  g.font = `800 ${fs}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  const t = ROLE_NAME[r], w = g.measureText(t).width + fs;
  rr(g, x - w / 2, y - fs * 0.7, w, fs * 1.4, fs * 0.6); g.fill();
  g.fillStyle = '#fff'; g.fillText(t, x, y);
}
function speech(g: CanvasRenderingContext2D, x: number, y: number, text: string, maxW: number, alpha: number, left = false) {
  const fs = 15;
  g.font = `700 ${fs}px system-ui, sans-serif`;
  const words = text.split(' '), lines: string[] = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  const w = Math.min(maxW, Math.max(...lines.map(l => g.measureText(l).width))) + 20, h = lines.length * fs * 1.25 + 14;
  const bx = left ? x : x - w / 2;
  g.globalAlpha = alpha;
  rr(g, bx, y - h, w, h, 10); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#22160d'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#22160d'; g.textAlign = 'left'; g.textBaseline = 'top';
  lines.forEach((l, k) => g.fillText(l, bx + 10, y - h + 7 + k * fs * 1.25));
  g.globalAlpha = 1;
}

// ---- Vistas ------------------------------------------------------------------------------------------------------
function viewSordo(g: CanvasRenderingContext2D, W: number, H: number, b: Bomb) {
  const dark = b.hz.dark > 0;
  backdrop(g, W, H, b.spec.env, app.now, H * 0.3);
  const s = Math.max(22, Math.min(W * 0.055, H * 0.075));
  // el CIEGO enfrente, detrás de la bomba
  monkeyAt(g, 'ciego', W / 2, H * 0.16, s);
  // el MUDO en el asiento de atrás
  const pw = Math.min(W * 0.26, 270, H * 0.42), ph = pw * 0.92;
  g.save(); rr(g, 12, 12, pw, ph, 16); g.fillStyle = '#5b3a8a'; g.fill(); g.clip();
  g.fillStyle = '#7a52b0'; g.fillRect(12, 12 + ph * 0.55, pw, ph); // respaldo
  monkeyAt(g, 'mudo', 12 + pw / 2, 12 + ph * 0.34, pw * 0.15);
  g.restore();
  rr(g, 12, 12, pw, ph, 16); g.strokeStyle = '#22160d'; g.lineWidth = 4; g.stroke();
  nameTag(g, 'mudo', 12 + pw / 2, 12 + ph - 14, pw * 0.15);
  nameTag(g, 'ciego', W / 2 + s * 2.2, H * 0.16 - s * 0.9, s);
  // la radio
  app.radioBox = null;
  if (b.spec.hz.includes('radio')) {
    const rw = Math.min(W * 0.17, 180), rh = rw * 0.6, rx = W - rw - 62, ry = 14, on = b.hz.radio;
    const jig = on ? Math.sin(app.now * 40) * 1.5 : 0;
    rr(g, rx + jig, ry, rw, rh, 10); g.fillStyle = '#3b2b22'; g.fill(); g.strokeStyle = '#120c08'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#20160f'; for (let k = 0; k < 5; k++) g.fillRect(rx + 12 + jig, ry + 14 + k * rh * 0.13, rw * 0.45, rh * 0.06);
    g.beginPath(); g.arc(rx + rw * 0.75 + jig, ry + rh * 0.45, rh * 0.22, 0, Math.PI * 2); g.fillStyle = '#d9c6a0'; g.fill(); g.stroke();
    g.save(); g.beginPath(); g.arc(rx + rw * 0.75 + jig, ry + rh * 0.82, 5, 0, Math.PI * 2); g.fillStyle = on ? '#3dff6e' : '#204020'; if (on) { g.shadowColor = '#3dff6e'; g.shadowBlur = 10; } g.fill(); g.restore();
    if (on) {
      g.font = '900 22px system-ui, sans-serif'; g.fillStyle = '#ffd23f'; g.textAlign = 'center';
      for (let k = 0; k < 3; k++) { const ph2 = (app.now * 0.9 + k / 3) % 1; g.globalAlpha = 1 - ph2; g.fillText(k % 2 ? '♪' : '♫', rx + rw * (0.25 + k * 0.25), ry + rh + 8 + ph2 * 30); }
      g.globalAlpha = 1;
      g.font = '900 13px system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText('TOCÁ PARA APAGAR', rx + rw / 2, ry + rh + 50);
    }
    app.radioBox = { x: rx, y: ry, w: rw, h: rh };
  }
  // la bomba
  const L = app.L!;
  const rm = W >= 640 && !app.hudless ? 150 : 0; // la columna del panel (cerrado) a la derecha
  app.bt = fitBomb(L, { x: W * 0.02, y: H * 0.29, w: W * 0.96 - rm, h: H * 0.71 - (rm || app.hudless ? 10 : 110) });
  g.save(); g.translate(app.bt.ox, app.bt.oy); g.scale(app.bt.s, app.bt.s);
  drawBomb(g, b, L, { look: 'color', t: app.now, timeShown: app.timeShown });
  g.restore();
  if (dark) {
    g.fillStyle = 'rgba(0,0,10,0.975)'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(app.bt.ox, app.bt.oy); g.scale(app.bt.s, app.bt.s);
    drawBomb(g, b, L, { look: 'color', glow: true, t: app.now, timeShown: app.timeShown });
    g.restore();
    g.font = '900 16px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.6)'; g.textAlign = 'center'; g.fillText('SE FUE LA LUZ', W / 2, H * 0.27);
  }
  // la mano del CIEGO sobre la bomba
  if (app.hand) {
    const [hx, hy] = toScreen(app.hand.x, app.hand.y), hs = Math.max(10, app.bt.s * 5);
    if (!dark) handIcon(g, hx, hy, hs, '#8a5a34');
  }
  ripples(g);
}
function handIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string | null, stroke = '#22160d') {
  g.save(); g.translate(x, y); g.rotate(-0.25);
  g.beginPath();
  g.roundRect(-s * 0.5, -s * 0.1, s, s * 0.95, s * 0.3);
  for (let k = 0; k < 4; k++) g.roundRect(-s * 0.5 + k * s * 0.26, -s * 0.75 + Math.abs(k - 1.5) * s * 0.12, s * 0.22, s * 0.8, s * 0.11);
  g.roundRect(s * 0.38, s * 0.05, s * 0.55, s * 0.24, s * 0.12);
  if (fill) { g.globalAlpha = 0.85; g.fillStyle = fill; g.fill(); g.globalAlpha = 1; }
  g.strokeStyle = stroke; g.lineWidth = Math.max(1.5, s * 0.08); g.stroke();
  g.restore();
}
function ripples(g: CanvasRenderingContext2D) {
  app.ripples = app.ripples.filter(r => app.now - r.t < 0.5);
  for (const r of app.ripples) {
    const [x, y] = toScreen(r.x, r.y), k = (app.now - r.t) / 0.5;
    g.beginPath(); g.arc(x, y, 6 + k * 26, 0, Math.PI * 2);
    g.strokeStyle = r.bad ? `rgba(255,60,60,${1 - k})` : `rgba(255,255,255,${1 - k})`; g.lineWidth = 3; g.stroke();
  }
}

function viewCiego(g: CanvasRenderingContext2D, W: number, H: number, b: Bomb, pointer: { x: number, y: number } | null) {
  const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  gr.addColorStop(0, '#0b0e17'), gr.addColorStop(1, '#020205');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const L = app.L!;
  const rm = W >= 640 && !app.hudless ? 150 : 0;
  app.bt = fitBomb(L, { x: W * 0.02, y: H * 0.07, w: W * 0.96 - rm, h: H * 0.93 - (rm || app.hudless ? 10 : 110) });
  g.save(); g.translate(app.bt.ox, app.bt.oy); g.scale(app.bt.s, app.bt.s);
  drawBomb(g, b, L, { look: 'tacto', t: app.now, timeShown: app.timeShown, hand: app.hand });
  g.restore();
  if (pointer) handIcon(g, pointer.x, pointer.y, Math.max(14, app.bt.s * 5), null, 'rgba(200,215,255,0.9)');
  captions(g, W, H, ['sordo']);
}
function captions(g: CanvasRenderingContext2D, W: number, H: number, from: Role[]) {
  const list = app.caps.filter(c => from.includes(c.r) && app.now - c.t < 7).slice(-3);
  g.font = '700 17px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  list.forEach((c, k) => {
    const y = H - 30 - (list.length - 1 - k) * 28, txt = `${ROLE_NAME[c.r]}: ${c.s}`, w = Math.min(W - 20, g.measureText(txt).width + 24);
    g.globalAlpha = Math.min(1, (7 - (app.now - c.t)) * 2);
    rr(g, W / 2 - w / 2, y - 13, w, 26, 8); g.fillStyle = 'rgba(0,0,0,0.75)'; g.fill();
    g.fillStyle = '#fff'; g.fillText(txt, W / 2, y, W - 40);
  });
  g.globalAlpha = 1;
}

function viewMudo(g: CanvasRenderingContext2D, W: number, H: number, b: Bomb, wide: boolean) {
  backdrop(g, W, H, b.spec.env, app.now, H * 0.28, b.hz.dark > 0 ? 0.08 : 1);
  if (wide) {
    const pw = W * 0.34, s = Math.min(pw * 0.2, H * 0.12);
    monkeyAt(g, 'sordo', pw / 2, H * 0.4, s);
    nameTag(g, 'sordo', pw / 2, H * 0.4 - s * 1.75, s);
    const say = [...app.caps].reverse().find(c => c.r === 'sordo' && app.now - c.t < 7);
    if (say) speech(g, pw / 2, H * 0.4 - s * 2.1, say.s, pw - 30, Math.min(1, (7 - (app.now - say.t)) * 2));
    const back = [...app.caps].reverse().find(c => c.r === 'ciego' && app.now - c.t < 7);
    if (back) speech(g, 14, Math.max(130, H * 0.4 - s * 2.6 - 70), `CIEGO (atrás tuyo): ${back.s}`, pw - 30, Math.min(1, (7 - (app.now - back.t)) * 2), true);
  } else {
    const s = Math.min(W * 0.09, H * 0.06);
    monkeyAt(g, 'sordo', W * 0.2, s * 1.4, s);
    const say = [...app.caps].reverse().filter(c => app.now - c.t < 7).slice(0, 1)[0];
    if (say) speech(g, W * 0.38, s * 2.6, `${ROLE_NAME[say.r]}: ${say.s}`, W * 0.58, 1, true);
  }
  if (b.hz.dark > 0) { g.fillStyle = 'rgba(0,0,10,0.75)'; g.fillRect(0, 0, W, H); }
}

// Portada, sala y sesión informativa: los tres monos sabios detrás de una bomba
let demo: { b: Bomb, L: Layout } | null = null;
function attract(g: CanvasRenderingContext2D, W: number, H: number, mood: 'normal' | 'boom' | 'win') {
  const b = app.bomb ?? (demo ??= (() => { const d = newBomb({ mods: ['cables', 'dial', 'simon'], time: 300, miss: 2, hz: [], env: 'combi', chaos: 1 }, 7); return { b: d, L: layout(3) }; })()).b;
  const L = app.bomb ? app.L! : demo!.L;
  backdrop(g, W, H, b.spec.env, app.now, H * 0.32);
  const s = Math.max(24, Math.min(W * 0.06, H * 0.085));
  const cy = H * 0.52, gap = Math.min(W * 0.27, s * 5.2);
  // gestos sueltos para que se vean vivos
  if (mood === 'normal' && app.phase !== 'end') {
    const roles: Role[] = ['mudo', 'sordo', 'ciego'];
    const k = Math.floor(app.now / 2.2), r = roles[k % 3], pool = ['si', 'no', 'n3', 'arriba', 'ojo', 'bien', 'duda', 'n7'] as const;
    if (!app.ges[r] || app.now - app.ges[r]!.t > 2.2) if (Math.floor(app.now * 10) % 22 === 0) app.ges[r] = { g: pool[(k * 5) % pool.length], t: app.now };
  }
  (['mudo', 'sordo', 'ciego'] as Role[]).forEach((r, k) => monkeyAt(g, r, W / 2 + (k - 1) * gap, cy - s * 1.2, s, mood));
  const area = { x: W * 0.2, y: cy + s * 0.9, w: W * 0.6, h: H - cy - s * 0.9 - 8 };
  const sc = Math.min(area.w / L.w, area.h / L.h);
  g.save(); g.translate(W / 2 - L.w * sc / 2, area.y); g.scale(sc, sc);
  drawBomb(g, b, L, { look: 'color', t: app.now, timeShown: b.time });
  g.restore();
}

export function render(g: CanvasRenderingContext2D, W: number, H: number, pointer: { x: number, y: number } | null) {
  app.avatars = [];
  g.save();
  if (app.shake > 0) g.translate(R(-1, 1) * app.shake * 14, R(-1, 1) * app.shake * 14);
  const b = app.bomb;
  if ((app.phase === 'play' || (app.phase === 'end' && app.overT < 1.4)) && b && app.L) {
    if (app.view === 'sordo') viewSordo(g, W, H, b);
    else if (app.view === 'ciego') viewCiego(g, W, H, b, pointer);
    else viewMudo(g, W, H, b, W > H * 1.1);
    flights(g, W, H);
  } else attract(g, W, H, app.phase === 'end' && app.result ? (app.result.win ? 'win' : 'boom') : 'normal');
  g.restore();
  if (app.flash > 0) { g.fillStyle = app.flashCol; g.globalAlpha = Math.min(1, app.flash); g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}

// Bananazos en el aire (solo los que se ven desde este papel)
function flights(g: CanvasRenderingContext2D, W: number, H: number) {
  app.hits = app.hits.filter(h => app.now - h.t < 1.5);
  for (const h of app.hits) {
    const k = (app.now - h.t) / 0.45;
    if (k > 1) continue;
    const me = app.view, to = app.avatars.find(a => a.r === h.to), from = app.avatars.find(a => a.r === h.from);
    if (!to && h.to !== me) continue;
    if (!sees(me, h.to) && h.to !== me) continue;
    const tx = to ? to.x : W / 2, ty = to ? to.y : H / 2;
    const fx = from ? from.x : h.from === me ? W / 2 : (h.from.length % 2 ? -40 : W + 40), fy = from ? from.y : h.from === me ? H + 40 : H * 0.3;
    const x = fx + (tx - fx) * k, y = fy + (ty - fy) * k - Math.sin(k * Math.PI) * 80;
    drawBanana(g, x, y, 22, k * 14);
  }
}
