/* CHIBOLAZO: la simulación, sin DOM. step(G, dt, [izq, der]) a 60 Hz con subpasos.
   Lo que tiene que verse u oírse sale como evento en G.ev ({ k, ... }); main.js lo vacía. */
import { W, H, TOP, LINE, BR, PR, SOCKETS, ELS, REACT, ENEMIES, BOSSES, UNLOCK, THREATS, EVENTS, CHASSIS, PARTS, MODS, MACHINES, LAST_WAVE } from './data.js';

const GRAV = 760, VMAX = 1400, SUB = 8;
export const FL_L = 70, FL_R = 7, REST = 0.52, UP = -0.42;
// s = 1: la aleta izquierda apunta a la derecha
export const FLIPPERS = [{ px: 100, py: 610, s: 1 }, { px: 260, py: 610, s: -1 }];
// Contorno de la mesa: embudo izquierdo, costado, techo del chasis, costado, embudo derecho
export const outline = (ch) => [[94, 603], [8, 510], ...ch.top, [352, 510], [266, 603]];
const wallsOf = (ch) => outline(ch).slice(1).map((q, i, a) => [...(i ? a[i - 1] : [94, 603]), ...q]);
// Altura del techo en x (el techo de todo chasis va de izquierda a derecha)
export function topAt(ch, x) {
  const t = ch.top;
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y0 + (y1 - y0) * ((x - x0) / (x1 - x0)); }
  return t[t.length - 1][1];
}
export const SAVE_Y = 652;
export const inflation = (G) => 1 + 0.15 * (G.wave - 1); // los precios suben con cada oleada

const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const flipTip = (F, a) => [F.px + F.s * FL_L * Math.cos(a), F.py + FL_L * Math.sin(a)];
const later = (G, d, f) => G.q.push({ t: G.t + d, f });
const ballEls = (b) => ELS.filter((e) => b.el[e] > 0);

function closest(ax, ay, bx, by, x, y) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return [ax + dx * t, ay + dy * t, t];
}

/* Choque de la bola contra el punto q engordado en rad; sv = velocidad de la superficie.
   Devuelve la normal o null. */
function bounce(b, qx, qy, rad, e, svx = 0, svy = 0) {
  let nx = b.x - qx, ny = b.y - qy;
  const d = Math.hypot(nx, ny), min = rad + BR;
  if (d >= min || d === 0) return null;
  nx /= d; ny /= d;
  b.x = qx + nx * min; b.y = qy + ny * min;
  const vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  return [nx, ny];
}
function kick(b, n, K) {
  const vn = b.vx * n[0] + b.vy * n[1];
  if (vn < K) { b.vx += (K - vn) * n[0]; b.vy += (K - vn) * n[1]; }
}

export function newRun(id, chId) {
  const m = MACHINES.find((x) => x.id === id) || MACHINES[0], ch = CHASSIS.find((x) => x.id === chId) || CHASSIS[0];
  const G = {
    m, ch, walls: wallsOf(ch), next: null, cur: {}, nibble: 0, wave: 0, hearts: m.hearts, maxHearts: m.hearts, coins: 4, t: 0,
    balls: [], enemies: [], shots: [], q: [], ev: [],
    parts: SOCKETS.map(() => null), mods: {}, fl: FLIPPERS.map(() => ({ a: REST, w: 0, up: false })),
    phase: 'play', spawn: [], spawnT: 0, combo: 0, saves: 0, offers: [], rerolls: 0, placing: null, nid: 0, lastEls: [],
  };
  (m.start || []).forEach((p, i) => { G.parts[[6, 1][i]] = newPart(p, [6, 1][i]); });
  nextWave(G);
  return G;
}

const newPart = (id, i, lvl = 1) => ({ id, lvl, x: SOCKETS[i][0], y: SOCKETS[i][1], cd: 0, cd2: 0, off: 0, flash: 0 });

export function nextWave(G) {
  G.wave++; G.phase = 'play'; G.combo = 0; G.shots = []; G.balls = []; G.q = [];
  G.cur = G.next || {}; G.next = null;
  const n = G.wave, pool = Object.keys(UNLOCK).filter((k) => UNLOCK[k] <= n), { threat, event } = G.cur;
  const count = Math.min(40, 4 + n * 2) * (event === 'estampida' ? 2 : 1);
  G.spawn = Array.from({ length: count }, () => (threat && Math.random() < 0.4 ? threat : pick(pool)));
  if (event === 'oro') for (let i = 0; i < 6; i++) G.spawn.splice(Math.floor(Math.random() * G.spawn.length), 0, 'cofre');
  if (n % 5 === 0) G.spawn.splice(Math.floor(G.spawn.length / 3), 0, BOSSES[(n / 5 - 1) % BOSSES.length]);
  G.spawnT = 1.2;
  G.saves = G.m.id === 'multi' ? 0 : G.mods.salva || 0;
  for (let i = 0; i < (G.m.id === 'multi' ? 3 : 1); i++) serve(G, 0.6 + i * 0.4);
  G.ev.push({ k: 'wave', n, boss: n % 5 === 0, threat, event });
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Lo que trae la oleada siguiente: la tienda lo muestra para que se pueda preparar el contra
function planNext(G) {
  const n = G.wave + 1, ts = Object.keys(THREATS).filter((k) => THREATS[k].w <= n);
  G.next = { threat: ts.length ? pick(ts) : null, event: n >= 3 && n % 5 && Math.random() < 0.5 ? pick(Object.keys(EVENTS)) : null };
}

function serve(G, wait) {
  const x = rnd(130, 230);
  const b = { id: G.nid++, x, y: topAt(G.ch, x) + 26, vx: rnd(-80, 80), vy: 0, el: { fuego: 0, hielo: 0, rayo: 0 }, ghost: false, life: 0, wait, crit: 0, flipCd: 0 };
  if (G.m.id === 'horno') b.el.fuego = Infinity;
  G.balls.push(b);
  return b;
}

function spawnEnemy(G, t, x, y) {
  const d = ENEMIES[t];
  const ev = G.cur.event, mul = (d.boss ? 1 : 1 + 0.18 * (G.wave - 1)) * (G.m.id === 'horno' ? 1.25 : 1) * (ev === 'estampida' && !d.boss ? 0.5 : 1);
  const hp = Math.max(1, Math.ceil(d.hp * mul));
  const e = { id: G.nid++, t, x, y, hp, max: hp, r: d.r, armor: (d.armor || 0) + (ev === 'hierro' && !d.boss && !d.harmless ? 2 : 0), st: { fuego: 0, hielo: 0, rayo: 0 }, burn: 0, cont: 1, cd: 0, flash: 0, act: d.every || 0, ph: rnd(0, 6), pull: 0, px: 0, py: 0, dead: false, hitT: 0, hold: null, holdT: 0, gulpCd: 0 };
  if ((G.m.id === 'caos' || ev === 'tormenta') && !d.boss && !d.harmless) e.st[ELS[Math.floor(Math.random() * 3)]] = 8;
  G.enemies.push(e);
  return e;
}

export function step(G, dt, keys) {
  if (G.phase !== 'play') return;
  G.t += dt;
  const h = dt / SUB;
  for (let s = 0; s < SUB; s++) {
    G.fl.forEach((f, i) => {
      if (keys[i] && !f.up) G.ev.push({ k: 'flip', i });
      f.up = !!keys[i];
      const sp = (f.up ? 24 : 14) * h, da = Math.max(-sp, Math.min(sp, (f.up ? UP : REST) - f.a));
      f.a += da; f.w = da / h;
    });
    for (const b of G.balls) moveBall(G, b, h);
  }

  // Bolas: elementos que se apagan, fantasmas que se van, bolas que se caen
  for (const b of G.balls) {
    b.flipCd -= dt;
    for (const el of ELS) if (b.el[el] > 0 && b.el[el] !== Infinity) b.el[el] = Math.max(0, b.el[el] - dt);
    if (b.ghost && (b.life -= dt) <= 0) { b.gone = true; G.ev.push({ k: 'poof', x: b.x, y: b.y }); }
    if (b.y > H + 20) b.gone = true;
  }
  const lost = G.balls.some((b) => b.gone && !b.ghost);
  G.balls = G.balls.filter((b) => !b.gone);
  if (lost && !G.balls.some((b) => !b.ghost)) {
    G.hearts--; G.combo = 0;
    G.ev.push({ k: 'drain' });
    if (G.hearts > 0) serve(G, 1);
  }

  for (const p of G.parts) if (p) { p.cd -= dt; p.cd2 -= dt; p.off -= dt; p.flash -= dt; }

  // Aparecen los enemigos de la oleada
  if (G.spawn.length && (G.spawnT -= dt) <= 0) {
    const t = G.spawn.shift(), boss = ENEMIES[t].boss, x = boss ? W / 2 : rnd(34, W - 34);
    if (t === 'zombito') for (const dx of [-30, -10, 10, 30]) { const zx = Math.max(30, Math.min(W - 30, x + dx)); spawnEnemy(G, t, zx, topAt(G.ch, zx) + 20); }
    else spawnEnemy(G, t, x, topAt(G.ch, x) + (boss ? 30 : 20));
    if (boss) G.ev.push({ k: 'boss', t });
    G.spawnT = Math.max(0.45, 1.7 - G.wave * 0.07);
  }

  for (const e of G.enemies) if (!e.dead) updateEnemy(G, e, dt);

  for (const s of G.shots) {
    s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
    for (const e of G.enemies) {
      if (e.dead || Math.hypot(e.x - s.x, e.y - s.y) > e.r + 4) continue;
      for (const el of s.els) applyEl(G, e, el);
      hurt(G, e, s.dmg, s.kind);
      s.life = 0;
      break;
    }
  }
  G.shots = G.shots.filter((s) => s.life > 0 && s.y > TOP && s.y < H && s.x > 0 && s.x < W);

  // Efectos con retraso (cadenas de rayos, explosiones en cascada)
  if (G.q.length) {
    const due = G.q.filter((x) => x.t <= G.t);
    G.q = G.q.filter((x) => x.t > G.t);
    for (const x of due) x.f();
  }
  G.enemies = G.enemies.filter((e) => !e.dead);

  if (G.hearts <= 0) { G.phase = 'over'; G.ev.push({ k: 'over' }); return; }
  if (!G.spawn.length && !G.enemies.length) endWave(G);
}

function moveBall(G, b, h) {
  if (b.wait > 0) { b.wait -= h; return; }
  if (b.in != null) return; // tragada: la lleva la babosa
  b.vy += GRAV * h; b.x += b.vx * h; b.y += b.vy * h;
  for (const w of G.walls) { const q = closest(w[0], w[1], w[2], w[3], b.x, b.y); bounce(b, q[0], q[1], 0, 0.45); }

  G.fl.forEach((f, i) => {
    const F = FLIPPERS[i], [tx, ty] = flipTip(F, f.a);
    const [qx, qy, t] = closest(F.px, F.py, tx, ty, b.x, b.y);
    const wv = F.s * f.w; // velocidad angular en pantalla
    const n = bounce(b, qx, qy, FL_R, 0.25, -wv * (qy - F.py), wv * (qx - F.px));
    if (n && f.w < -4 && b.flipCd <= 0) aletazo(G, b, t);
  });

  if (b.y > SAVE_Y && b.vy > 0 && G.saves > 0 && !b.ghost && b.x > 140 && b.x < 220) {
    G.saves--; b.vy = -950; b.vx *= 0.3;
    G.ev.push({ k: 'save', x: b.x, y: SAVE_Y });
  }

  for (const p of G.parts) {
    if (!p) continue;
    const n = bounce(b, p.x, p.y, PR, 0.5);
    if (n) hitPart(G, b, p, n);
  }

  for (const e of G.enemies) {
    if (e.dead || b.in != null || Math.hypot(e.x - b.x, e.y - b.y) >= e.r + BR) continue;
    const d = ENEMIES[e.t];
    if (d.spectral && !solid(G, e) && !ballEls(b).length) continue; // la bola sola lo atraviesa
    if (d.guard && b.y > e.y + 3) { // el escudo frena lo que viene de abajo, pero no los elementos
      const n = bounce(b, e.x, e.y, e.r + 3, 0.9); if (n) kick(b, n, 300);
      if (e.cd <= 0) { e.cd = 0.15; for (const el of ballEls(b)) applyEl(G, e, el); G.ev.push({ k: 'guard', x: e.x, y: e.y + e.r }); }
      continue;
    }
    if (!G.mods.pua) { const n = bounce(b, e.x, e.y, e.r, 0.85); if (n) kick(b, n, 260); }
    if (e.cd <= 0) ballHit(G, b, e);
  }

  const sp = Math.hypot(b.vx, b.vy);
  if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
}

function aletazo(G, b, t) {
  b.flipCd = 0.15; G.combo = 0;
  if (G.mods.impulso) { const k = 1 + 0.2 * G.mods.impulso; b.vx *= k; b.vy *= k; }
  if (G.m.id === 'tormenta') { b.el.rayo = Math.max(b.el.rayo, 3); G.ev.push({ k: 'charge', el: 'rayo', x: b.x, y: b.y }); }
  if (G.mods.punta && t > 0.72) { b.crit = 1; G.ev.push({ k: 'crit', x: b.x, y: b.y }); }
}

const solid = (G, e) => (G.t + e.ph) % 3.5 < 1; // el espectro es sólido 1 s de cada 3,5

function hitPart(G, b, p, n) {
  if (p.cd > 0) return;
  p.cd = 0.12; p.flash = 0.25;
  const d = PARTS[p.id], L = p.lvl;
  kick(b, n, p.id === 'hongo' ? 540 + 80 * L : 380);
  G.ev.push({ k: 'bump', x: p.x, y: p.y, col: d.col, id: p.id, off: p.off > 0 });
  if (p.off > 0) return; // saboteada
  if (p.id === 'hongo') G.combo += L;
  else if (d.el) {
    b.el[d.el] = Math.max(b.el[d.el], G.mods.eterna ? Infinity : 3 + 3 * L);
    G.ev.push({ k: 'charge', el: d.el, x: b.x, y: b.y });
    if (L > 1) { // ★: rocía el elemento alrededor
      G.ev.push({ k: 'spray', x: p.x, y: p.y, r: 40 + 30 * L, el: d.el });
      for (const e of G.enemies) if (!e.dead && dist(e, p) < 40 + 30 * L) applyEl(G, e, d.el, false);
    }
  }
  else if (p.id === 'canon') fireAt(G, p.x, p.y - PR, [3, 5, 8][L - 1], ballEls(b), 3);
  else if (p.id === 'gemela' && p.cd2 <= 0) {
    p.cd2 = 6 - L;
    for (let i = 0; i < L; i++) G.balls.push({ ...b, id: G.nid++, el: { ...b.el }, vx: -b.vx + (i - (L - 1) / 2) * 140, vy: b.vy, ghost: true, life: 8, trail: null, x: p.x + n[0] * (PR + BR + 1) * -1 });
    G.ev.push({ k: 'twin', x: p.x, y: p.y });
  } else if (p.id === 'iman') {
    const r = 110 + 40 * L;
    for (const e of G.enemies) if (!e.dead && !ENEMIES[e.t].boss && dist(e, p) < r) { e.pull = 0.7; e.px = p.x; e.py = p.y; if (L > 1) later(G, 0.5, () => hurt(G, e, L - 1, 'boom')); }
    G.ev.push({ k: 'magnet', x: p.x, y: p.y, r });
  } else if (p.id === 'alcancia') gain(G, [1, 2, 4][L - 1], p.x, p.y);
}

function ballDmg(G, b) {
  let d = (G.m.id === 'taller' ? 1 : 2) + (G.mods.plomo || 0);
  if (G.mods.resorte && Math.hypot(b.vx, b.vy) > 650) d *= 2;
  if (b.crit) { d *= 3; b.crit = 0; }
  return d;
}

function ballHit(G, b, e) {
  e.cd = 0.1;
  const d = ENEMIES[e.t], sp = Math.hypot(b.vx, b.vy);
  G.combo++;
  G.lastEls = ballEls(b);
  G.ev.push({ k: 'hit', x: (e.x + b.x) / 2, y: (e.y + b.y) / 2, sp, crit: b.crit });
  for (const el of G.lastEls) applyEl(G, e, el);
  if (d.aura) { b.el[d.aura] = Math.max(b.el[d.aura], 4); G.ev.push({ k: 'charge', el: d.aura, x: b.x, y: b.y }); }
  hurt(G, e, ballDmg(G, b), 'bola');
  if (!d.boss) e.y = Math.max(topAt(G.ch, e.x) + 14, e.y - (6 + sp * 0.012) * (1 + 0.3 * (G.mods.plomo || 0)));
  if (d.swallow && !e.dead && e.hold == null && e.gulpCd <= 0) { // se la traga
    e.hold = b.id; e.holdT = 1.6; e.gulpCd = 4; b.in = e.id;
    G.ev.push({ k: 'gulp', x: e.x, y: e.y });
  }
}

function hurt(G, e, dmg, src) {
  if (e.dead) return;
  e.src = src;
  if (e.armor > 0 && src === 'bola') { e.armor--; G.ev.push({ k: 'armor', x: e.x, y: e.y }); return; } // la armadura solo frena a la bola
  e.hp -= dmg; e.flash = 0.1; e.hitT = G.t;
  G.ev.push({ k: 'dmg', x: e.x, y: e.y - e.r, n: dmg, src });
  if (e.hp <= 0) kill(G, e);
}

function kill(G, e) {
  e.dead = true;
  const d = ENEMIES[e.t];
  gain(G, Math.round(d.coin * (1 + G.combo * 0.1)), e.x, e.y);
  G.ev.push({ k: 'kill', x: e.x, y: e.y, t: e.t, boss: d.boss, src: e.src });
  const held = e.hold != null && G.balls.find((b) => b.id === e.hold);
  if (held) { held.in = null; held.x = e.x; held.y = e.y; held.vx = rnd(-150, 150); held.vy = -950; G.ev.push({ k: 'burp', x: e.x, y: e.y }); } // ¡escupida para arriba!
  if (e.st.fuego > 0) later(G, 0.1, () => boom(G, e.x, e.y, 44, 1, 'fuego', '#ff7a1a'));
  if (e.st.hielo > 0) shards(G, e.x, e.y, 4, ['hielo'], 1);
  if (d.split) for (const dx of [-12, 12]) spawnEnemy(G, d.split, e.x + dx, e.y - 4).st = { ...e.st };
  if (G.mods.metralla) shards(G, e.x, e.y, 2 * G.mods.metralla, G.lastEls, 1);
}

function gain(G, n, x, y) {
  n *= (G.m.id === 'cristal' ? 3 : 1) * (G.cur.event === 'luna' ? 2 : 1);
  if (n <= 0) return;
  G.coins += n;
  G.ev.push({ k: 'coin', x, y, n });
}

function applyEl(G, e, el, chain = true) {
  if (e.dead) return;
  if (ENEMIES[e.t].immune === el) { G.ev.push({ k: 'immune', x: e.x, y: e.y }); return; }
  const other = ELS.find((o) => o !== el && e.st[o] > 0);
  if (other) return react(G, e, el, other);
  e.st[el] = Math.max(e.st[el], 4);
  if (el === 'rayo' && chain) {
    const near = G.enemies.filter((o) => o !== e && !o.dead && dist(o, e) < 110).sort((a, b) => dist(a, e) - dist(b, e)).slice(0, 2);
    for (const o of near) later(G, 0.07, () => {
      if (o.dead) return;
      G.ev.push({ k: 'bolt', x1: e.x, y1: e.y, x2: o.x, y2: o.y });
      hurt(G, o, 1, 'rayo');
      applyEl(G, o, 'rayo', false);
    });
  }
}

function react(G, e, a, b) {
  const key = ELS.filter((x) => x === a || x === b).join('+'), R = REACT[key];
  for (const x of ELS) e.st[x] = 0;
  G.ev.push({ k: 'react', x: e.x, y: e.y, name: R.name, col: R.col });
  if (key === 'fuego+hielo') boom(G, e.x, e.y, 72, 3, null, R.col, 50);
  else if (key === 'fuego+rayo') boom(G, e.x, e.y, 60, 2, 'fuego', R.col);
  else { hurt(G, e, 4 * (2 + (G.mods.plomo || 0)), 'quiebre'); shards(G, e.x, e.y, 5, ['hielo'], 1); }
}

function boom(G, x, y, r, dmg, el, col, push = 0) {
  G.ev.push({ k: 'boom', x, y, r, col });
  for (const o of G.enemies) {
    if (o.dead || Math.hypot(o.x - x, o.y - y) > r + o.r) continue;
    if (push && !ENEMIES[o.t].boss) o.y = Math.max(topAt(G.ch, o.x) + 14, o.y - push);
    hurt(G, o, dmg, 'boom');
    if (el) later(G, rnd(0.06, 0.16), () => applyEl(G, o, el));
  }
}

function shards(G, x, y, n, els, dmg) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(0, 0.6);
    G.shots.push({ x, y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, life: 0.45, els, dmg, kind: 'esquirla' });
  }
}

function fireAt(G, x, y, n, els, dmg) {
  const tg = G.enemies.filter((e) => !e.dead).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  for (let i = 0; i < n; i++) {
    const e = tg[i % Math.max(1, tg.length)], a = e ? Math.atan2(e.y - y, e.x - x) : -Math.PI / 2 + (i - 1) * 0.3;
    G.shots.push({ x, y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 1.2, els, dmg, kind: 'bala' });
  }
  G.ev.push({ k: 'shoot', x, y, n });
}

function updateEnemy(G, e, dt) {
  const d = ENEMIES[e.t];
  e.cd -= dt; e.flash -= dt; e.gulpCd -= dt;
  if (e.pull > 0) {
    e.pull -= dt;
    const dx = e.px - e.x, dy = e.py - e.y, L = Math.hypot(dx, dy);
    if (L > 22) { e.x += (dx / L) * 180 * dt; e.y += (dy / L) * 180 * dt; }
  } else {
    e.y += d.v * (e.st.hielo > 0 ? 0.35 : 1) * (G.cur.event === 'luna' ? 1.35 : 1) * dt;
    if (d.zig) e.x += Math.sin(G.t * 3 + e.ph) * 45 * dt;
  }
  e.x = Math.max(14 + e.r, Math.min(W - 14 - e.r, e.x));

  if (e.st.fuego > 0 && (e.burn -= dt) <= 0) { e.burn = 0.5; hurt(G, e, 1, 'fuego'); }
  for (const el of ELS) if (e.st[el] > 0) e.st[el] -= dt;
  if (e.dead) return;

  e.heal = d.regen && G.t - e.hitT > 1.2 && e.hp < e.max && !(e.st.fuego > 0 || e.st.hielo > 0);
  if (e.heal) e.hp = Math.min(e.max, e.hp + d.regen * dt);
  if (e.hold != null) { // la bola en la panza: la lleva, la quema con sus elementos y al final la escupe hacia abajo
    const b = G.balls.find((x) => x.id === e.hold);
    if (!b) e.hold = null;
    else {
      b.x = e.x; b.y = e.y;
      const was = e.holdT;
      e.holdT -= dt;
      if (Math.floor(was / 0.4) !== Math.floor(e.holdT / 0.4)) for (const el of ballEls(b)) { applyEl(G, e, el, false); hurt(G, e, 1, el); }
      if (e.holdT <= 0 && !e.dead) {
        e.hold = null; b.in = null; b.y = e.y + e.r + BR + 2; b.vx = rnd(-140, 140); b.vy = 420;
        G.ev.push({ k: 'spit', x: e.x, y: e.y });
      }
      if (e.dead) return;
    }
  }

  if (G.mods.contagio && (e.cont -= dt) <= 0) {
    e.cont = 1;
    const el = ELS.find((x) => e.st[x] > 0);
    const o = el && G.enemies.filter((o) => o !== e && !o.dead && dist(o, e) < 85 && !ELS.some((x) => o.st[x] > 0)).sort((a, b) => dist(a, e) - dist(b, e))[0];
    if (o) { G.ev.push({ k: 'spread', x1: e.x, y1: e.y, x2: o.x, y2: o.y, el }); applyEl(G, o, el, false); }
  }

  if (d.every && (e.act -= dt) <= 0) { e.act = d.every; act(G, e, d.act); }
  if (d.sabotage) for (const p of G.parts) if (p && Math.hypot(p.x - e.x, p.y - e.y) < e.r + PR + 8) p.off = 0.4;

  if (e.y > LINE) {
    if (e.hold != null) { const b = G.balls.find((x) => x.id === e.hold); if (b) { b.in = null; b.vy = 300; } }
    if (d.harmless) { e.dead = true; G.ev.push({ k: 'escape', x: e.x, y: LINE }); return; }
    if (d.nibble && ++G.nibble < 3) { e.dead = true; G.ev.push({ k: 'nibble', x: e.x, y: LINE, n: G.nibble }); return; }
    if (d.nibble) G.nibble = 0;
    G.hearts -= d.boss ? 3 : 1;
    G.ev.push({ k: 'breach', x: e.x, y: LINE, boss: d.boss });
    if (d.boss) e.y = topAt(G.ch, e.x) + 40; else e.dead = true;
  }
}

function act(G, e, a) {
  G.ev.push({ k: a, x: e.x, y: e.y });
  if (a === 'shield') { for (const o of G.enemies) if (!o.dead && o !== e && !ENEMIES[o.t].boss && dist(o, e) < 95) o.armor = Math.min(3, o.armor + 1); }
  else if (a === 'raise') spawnEnemy(G, 'esqueleto', e.x + rnd(-24, 24), e.y + 8);
  else if (a === 'imps') for (const dx of [-30, 30]) spawnEnemy(G, 'diablillo', e.x + dx, e.y);
  else if (a === 'stomp') for (const b of G.balls) { b.vx += rnd(-260, 260); b.vy -= 260; }
}

function endWave(G) {
  const interest = Math.min(5, Math.floor(G.coins / 5)), bonus = 3 + interest;
  G.coins += bonus;
  G.phase = G.wave === LAST_WAVE ? 'win' : 'shop';
  G.rerolls = 0;
  planNext(G);
  roll(G);
  G.ev.push({ k: 'clear', bonus, interest });
}

/* Tienda */
export function roll(G) {
  const m = G.m.id;
  // Inflación por oleada; las mejoras, además, cuestan más por cada nivel que ya tenés
  const k = inflation(G), price = (base, owned = 0) => Math.round(base * k * (1 + 0.5 * owned));
  const pool = [...Object.keys(PARTS).map((id) => ({ type: 'part', id, price: price(PARTS[id].price) })), ...Object.keys(MODS).map((id) => ({ type: 'mod', id, price: price(MODS[id].price, G.mods[id]) }))]
    .filter((o) => !(m === 'horno' && o.id === 'nevera') && !(m === 'multi' && o.id === 'salva') && !(m === 'taller' && o.type === 'mod')
      && !(o.type === 'mod' && MODS[o.id].max && (G.mods[o.id] || 0) >= MODS[o.id].max));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  G.offers = pool.slice(0, 3);
}
export const rerollCost = (G) => 2 + Math.floor(G.wave / 3) + G.rerolls;
export function reroll(G) {
  const c = rerollCost(G);
  if (G.coins < c) return false;
  G.coins -= c; G.rerolls++; roll(G);
  return true;
}
// Mejoras: se pagan al comprar. Piezas: al instalarlas (place).
export function buy(G, i) {
  const o = G.offers[i];
  if (!o || o.sold || G.coins < o.price) return false;
  if (o.type === 'part') { G.placing = o; return 'place'; }
  G.coins -= o.price; o.sold = true;
  G.mods[o.id] = (G.mods[o.id] || 0) + 1;
  return true;
}
export function place(G, si) {
  const o = G.placing;
  if (!o || G.coins < o.price) return false;
  G.coins -= o.price; o.sold = true;
  const was = G.parts[si];
  G.parts[si] = newPart(o.id, si);
  G.placing = null;
  fuse(G, si, was && was.id === o.id && was.lvl === 1 ? 1 : 0);
  return true;
}

/* Fusión: 3 piezas iguales del mismo nivel se vuelven una del nivel siguiente en el enchufe recién usado
   y liberan los otros dos. extra = copias que ya había en ese enchufe (instalar encima de una igual no la pierde). */
export const sameCount = (G, id, lvl) => G.parts.filter((p) => p && p.id === id && p.lvl === lvl).length;
function fuse(G, si, extra) {
  const p = G.parts[si];
  if (p.lvl >= 3) return;
  const others = G.parts.map((q, i) => (q && i !== si && q.id === p.id && q.lvl === p.lvl ? i : -1)).filter((i) => i >= 0);
  if (others.length + 1 + extra < 3) return;
  for (const i of others.slice(0, 2 - extra)) { G.ev.push({ k: 'absorb', x1: G.parts[i].x, y1: G.parts[i].y, x2: p.x, y2: p.y, col: PARTS[p.id].col }); G.parts[i] = null; }
  G.parts[si] = newPart(p.id, si, p.lvl + 1);
  G.ev.push({ k: 'fuse', x: p.x, y: p.y, id: p.id, lvl: p.lvl + 1 });
  fuse(G, si, 0);
}

export const repairCost = (G) => 4 + G.wave;
export function repair(G) {
  if (G.coins < repairCost(G) || G.hearts >= G.maxHearts) return false;
  G.coins -= repairCost(G); G.hearts++;
  return true;
}
