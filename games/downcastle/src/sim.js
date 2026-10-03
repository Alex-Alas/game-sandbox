/* Simulación pura de un tramo (sin DOM). La corre solo el anfitrión, a paso fijo de 60 Hz.
   Jugadores AABB con controlador (inclinación, salto, botas-cañón, picada, ancla), la
   cuerda elástica entre vecinos de la cadena, criaturas, gemas del equipo, daño, fuera de
   combate, fin del tramo, eventos (fx) y contadores para los premios.
   Posiciones en el centro de cada caja; y crece hacia abajo. */
import { CFG } from './config.js';
import { EMPTY, STONE, WOOD, SPIKE, tileAt, solidAt } from './level.js';

const T = CFG.TILE, HW = CFG.PW / 2, HH = CFG.PH / 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = (v) => Math.round(v * 10) / 10;

/* Modificadores de tramo (R4): { onTramoStart(sim), onStep(sim, dt), onEvent(sim, ev) }.
   Un tramo los pide por id en tramo.mods. El prototipo trae la tabla vacía. */
export const MODS = {};

/* Ejemplo apagado (no está en MODS): el derrumbe. Una línea de escombros baja desde el
   techo cada vez más rápido y lastima a quien alcanza. Para probarlo:
   MODS.derrumbe = EJEMPLO_DERRUMBE y agregar 'derrumbe' a tramo.mods. */
export const EJEMPLO_DERRUMBE = {
  onTramoStart(sim) { sim.collapseY = -96; },
  onStep(sim, dt) {
    sim.collapseY += (10 + sim.t * 0.5) * dt;
    for (const p of sim.players) if (p.y - HH < sim.collapseY) hurt(sim, p, p.x, p.y - 20);
  },
  onEvent(sim, ev) { if (ev.k === 'won') sim.collapseY = -Infinity; },
};

const STAT_KEYS = ['anchorLoadT', 'bungeeGems', 'ffHits', 'traitorTugs', 'rescues', 'angryFairies',
  'koT', 'hits', 'kos', 'gems', 'kills', 'shots', 'tugs', 'stomps'];
export const newStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

export const CREATURE = {
  goblin: { w: 12, h: 12, hp: 2, gems: 3, evil: true },
  imp: { w: 10, h: 10, hp: 1, gems: 2, evil: true },
  cube: { w: 16, h: 16, hp: Infinity, gems: 0, evil: false },
  fairy: { w: 9, h: 9, hp: Infinity, gems: 0, evil: false },
};

/* roster: [{ id, name, color, hero, hp?, conn?, bot? }] ya en el orden de la cadena. */
export function createSim(lv, roster) {
  const sim = {
    lv, t: 0, gems: 0, status: 'play', wonT: 0, fx: [],
    players: [], creatures: [], bullets: [], links: [], pending: [],
    gemsTaken: new Uint8Array(lv.gems.length),
    mods: (lv.tramo.mods || []).map((id) => MODS[id]).filter(Boolean),
  };
  roster.forEach((r, i) => sim.players.push(newPlayer(r, i, lv.spawns[i] || lv.spawns[0])));
  for (let i = 0; i + 1 < sim.players.length; i++) {
    const a = sim.players[i], b = sim.players[i + 1];
    const path = ropePath(lv, a.x, a.y, b.x, b.y);
    sim.links.push({ path, len: path.len, rate: 0 });
  }
  lv.creatures.forEach((c, i) => sim.creatures.push(newCreature(lv, c, i)));
  for (const m of sim.mods) m.onTramoStart?.(sim);
  return sim;
}

function newPlayer(r, idx, sp) {
  return {
    id: r.id, idx, name: r.name, color: r.color, hero: r.hero, bot: !!r.bot,
    x: sp.x, y: sp.y, px: sp.x, py: sp.y, vx: 0, vy: 0, ax: 0, ay: 0, inv: 1,
    hp: r.hp > 0 ? Math.min(r.hp, CFG.HEARTS) : (r.hp === 0 ? 1 : CFG.HEARTS), // fuera de combate vuelve con 1
    ammo: CFG.AMMO, facing: 1,
    grounded: false, groundT: 0, onWood: false, wallL: false, wallR: false,
    anchored: false, holding: false, burstT: 0, diving: false, dropT: 0,
    ko: false, conn: r.conn !== false, trapped: -1, trapT: 0, cubeCd: 0,
    invT: 0, stunT: 0, tugCd: 0, bungeeT: 0, hurtT: -9, arrived: false,
    input: { tilt: 0, hold: false }, events: [], stats: newStats(),
  };
}

function newCreature(lv, c, i) {
  const k = CREATURE[c.kind];
  const cr = {
    i, kind: c.kind, x: c.x, y: c.y, px: c.x, py: c.y, hx: c.x, hy: c.y, vx: 0, vy: 0,
    w: k.w, h: k.h, hp: k.hp, alive: true, dir: i % 2 ? 1 : -1, grounded: false, hitWall: false,
    t: i * 1.7, flashT: 0, angryT: 0, target: null, pushCd: 0, biteCd: 0, mode: 'floor', side: 0,
  };
  if (c.kind === 'cube') {
    const tx = Math.floor(c.x / T), ty = Math.floor(c.y / T);
    if (solidAt(lv, tx - 1, ty)) { cr.mode = 'wall'; cr.side = -1; }
    else if (solidAt(lv, tx + 1, ty)) { cr.mode = 'wall'; cr.side = 1; }
  }
  return cr;
}

export function emit(sim, ev) {
  sim.fx.push(ev);
  for (const m of sim.mods) m.onEvent?.(sim, ev);
}

/* ── Paso fijo ── */
export function step(sim, dt) {
  sim.t += dt;
  for (const m of sim.mods) m.onStep?.(sim, dt);
  const P = sim.players;
  for (const p of P) { p.px = p.x; p.py = p.y; controls(sim, p, dt); }
  ropeForces(sim);
  for (const p of P) integrate(p, dt);
  ropeLimit(sim, dt);
  for (const p of P) move(sim, p, dt);
  stepRopes(sim, dt);
  stepBullets(sim, dt);
  for (const c of sim.creatures) if (c.alive) { c.px = c.x; c.py = c.y; stepCreature(sim, c, dt); }
  contacts(sim);
  bookkeeping(sim, dt);
}

const canAct = (p) => !p.ko && p.conn && p.trapped < 0 && p.stunT <= 0;

function controls(sim, p, dt) {
  p.invT = Math.max(0, p.invT - dt);
  p.stunT = Math.max(0, p.stunT - dt);
  p.tugCd = Math.max(0, p.tugCd - dt);
  p.cubeCd = Math.max(0, p.cubeCd - dt);
  p.groundT -= dt; p.dropT -= dt; p.bungeeT -= dt;
  const evs = p.events;
  p.events = [];
  if (!canAct(p)) { p.holding = false; p.anchored = false; p.burstT = 0; return; }
  for (const e of evs) {
    if (e === 'tap') { if (p.grounded || p.groundT > 0) jump(sim, p); else shoot(sim, p, false); }
    else if (e === 'up') tug(sim, p);
    else if (e === 'down') dive(sim, p);
  }
  p.holding = !!p.input.hold;
  const wasAnchored = p.anchored;
  // Ancla: mantener junto a una pared (o parado en el suelo) mientras se mantiene apretado
  p.anchored = p.holding && (p.anchored || p.grounded || p.wallL || p.wallR);
  if (p.anchored && !wasAnchored) { p.diving = false; emit(sim, { k: 'anchor', id: p.id }); }
  if (p.holding && !p.anchored) { // ráfaga en el aire
    p.burstT -= dt;
    if (p.burstT <= 0) { shoot(sim, p, true); p.burstT = CFG.BURST_EVERY; }
  } else p.burstT = 0;
}

function jump(sim, p) {
  p.vy = -CFG.JUMP_V;
  p.grounded = false; p.groundT = 0;
  emit(sim, { k: 'jump', id: p.id });
}

function shoot(sim, p, burst) {
  if (p.ammo <= 0) { if (!burst) emit(sim, { k: 'empty', id: p.id }); return; }
  p.ammo--;
  p.stats.shots++;
  const b = { x: p.x, y: p.y + HH + 2, vx: p.vx * 0.15, vy: CFG.SHOT_SPEED + Math.max(0, p.vy), owner: p.id, d: 0, dead: false };
  sim.bullets.push(b);
  p.vy = Math.min(p.vy, -CFG.SHOT_KICK); // frena la caída
  p.diving = false;
  emit(sim, { k: 'shot', id: p.id, x: r1(b.x), y: r1(b.y), vx: r1(b.vx), vy: r1(b.vy) });
}

function dive(sim, p) {
  if (p.grounded) {
    if (!p.onWood) return;
    p.dropT = 0.25; p.vy = 120; p.grounded = false; // atravesar la madera hacia abajo
  } else p.vy = Math.max(p.vy, CFG.DIVE_V);
  p.diving = true;
  emit(sim, { k: 'dive', id: p.id });
}

export const neighbors = (sim, p) => [sim.players[p.idx - 1], sim.players[p.idx + 1]].filter(Boolean);

/* Tirón: impulso a los dos vecinos hacia vos. Saca del cubo; puede salvar o sabotear. */
function tug(sim, p) {
  if (p.tugCd > 0) return;
  p.tugCd = CFG.TUG_CD;
  p.stats.tugs++;
  for (const nb of neighbors(sim, p)) {
    const dx = p.x - nb.x, dy = p.y - nb.y, d = Math.hypot(dx, dy) || 1;
    const rec = { by: p, target: nb, t: sim.t, danger: false, done: false };
    if (nb.trapped >= 0) {
      release(nb);
      p.stats.rescues++;
      rec.done = true;
      emit(sim, { k: 'free', id: nb.id, by: p.id });
    } else rec.danger = !nb.ko && dangerAhead(sim, nb);
    if (!nb.anchored) {
      nb.vx += (dx / d) * CFG.TUG_V;
      nb.vy += (dy / d) * CFG.TUG_V - 60;
      nb.grounded = false; nb.diving = false;
    }
    sim.pending.push(rec);
  }
  emit(sim, { k: 'tug', id: p.id });
}

/* ¿Va derecho a un daño? Proyecta la trayectoria balística 0,6 s. */
function dangerAhead(sim, p) {
  for (let t = 0.05; t <= 0.6; t += 0.05) {
    const x = p.x + p.vx * t, y = p.y + p.vy * t + 0.5 * CFG.GRAVITY * t * t;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const tile = tileAt(sim.lv, tx, ty);
    if (tile === SPIKE || tileAt(sim.lv, tx, Math.floor((y + HH + 1) / T)) === SPIKE) return true;
    if (tile === STONE) return false;
    for (const c of sim.creatures) {
      if (c.alive && CREATURE[c.kind].evil && Math.abs(c.x - x) < 12 && Math.abs(c.y - y) < 12) return true;
    }
  }
  return false;
}

function release(p) {
  p.trapped = -1;
  p.cubeCd = 1.5;
}

/* Camino de la cuerda: la recta si no hay piedra en medio; si no, el camino más corto por
   la grilla (BFS 8-conexo sin cortar esquinas) tensado con línea de vista. Así la cuerda se
   enrosca en las esquinas (péndulos, arrastre hacia el hueco) y nunca atraviesa un piso.
   Lo usan la física y el dibujo (rope.js lo sigue cuando las partículas se enganchan). */
function los(lv, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocks(tileAt(lv, Math.floor((x0 + (x1 - x0) * t) / T), Math.floor((y0 + (y1 - y0) * t) / T)))) return false;
  }
  return true;
}
const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function ropePath(lv, ax, ay, bx, by) {
  const straight = { pts: [ax, ay, bx, by], len: Math.hypot(bx - ax, by - ay) };
  if (los(lv, ax, ay, bx, by)) return straight;
  const W = lv.w;
  const cax = Math.floor(ax / T), cay = Math.floor(ay / T), cbx = Math.floor(bx / T), cby = Math.floor(by / T);
  const y0 = Math.max(0, Math.min(cay, cby) - 4), y1 = Math.min(lv.h - 1, Math.max(cay, cby) + 4);
  const H = y1 - y0 + 1;
  const free = (x, y) => x >= 0 && x < W && y >= y0 && y <= y1 && !blocks(tileAt(lv, x, y));
  if (!free(cax, cay) || !free(cbx, cby)) return straight;
  const prev = new Int16Array(W * H).fill(-1);
  const start = (cay - y0) * W + cax, goal = (cby - y0) * W + cbx;
  prev[start] = start;
  const q = [start];
  for (let qi = 0; qi < q.length && prev[goal] < 0; qi++) {
    const c = q[qi], cx = c % W, cy = ((c / W) | 0) + y0;
    for (const [dx, dy] of NB8) {
      const nx = cx + dx, ny = cy + dy;
      if (!free(nx, ny) || (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy)))) continue;
      const k = (ny - y0) * W + nx;
      if (prev[k] >= 0) continue;
      prev[k] = c;
      q.push(k);
    }
  }
  if (prev[goal] < 0) return straight;
  const cells = [];
  for (let c = goal; ; c = prev[c]) { cells.push([(c % W) * T + T / 2, (((c / W) | 0) + y0) * T + T / 2]); if (c === start) break; }
  cells.reverse(); // de a hacia b
  // Tensar: desde cada punto, saltar a la celda más lejana que se vea
  const pts = [ax, ay];
  let cx = ax, cy = ay, i = 0;
  while (!los(lv, cx, cy, bx, by) && i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !los(lv, cx, cy, cells[j][0], cells[j][1])) j--;
    i = j;
    [cx, cy] = cells[j];
    pts.push(cx, cy);
  }
  pts.push(bx, by);
  let len = 0;
  for (let k = 2; k < pts.length; k += 2) len += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
  return { pts, len };
}

// Dirección en la que la cuerda tira de cada punta: hacia su primer punto del camino
function linkDirs(L) {
  const p = L.path.pts, n = p.length;
  return [unit(p[2] - p[0], p[3] - p[1]), unit(p[n - 4] - p[n - 2], p[n - 3] - p[n - 1])];
}
function unit(x, y) {
  const d = Math.hypot(x, y);
  return d < 1e-6 ? [0, 0] : [x / d, y / d];
}

/* Entre L y 2L la cuerda tira como un elástico (la energía vuelve: rebote bungee). */
function ropeForces(sim) {
  const P = sim.players;
  sim.links.forEach((L, i) => {
    const stretch = L.len - CFG.ROPE_LEN;
    if (stretch <= 0) return;
    const a = P[i], b = P[i + 1];
    const [da, db] = linkDirs(L);
    const rate = -(a.vx * da[0] + a.vy * da[1]) - (b.vx * db[0] + b.vy * db[1]);
    const f = Math.max(0, CFG.ROPE_K * stretch + CFG.ROPE_DAMP * rate);
    pull(sim, a, da, f);
    pull(sim, b, db, f);
  });
}
function pull(sim, p, d, f) {
  p.ax += d[0] * f; p.ay += d[1] * f;
  // Parado en el suelo, el tirón hacia abajo se vuelve arrastre hacia el borde más cercano
  // (la cuerda resbala por la esquina): así el que cuelga se lleva al que no está anclado.
  if (p.grounded && d[1] > 0.3) p.ax += edgeSide(sim.lv, p, d[0]) * d[1] * f * 0.8;
}
function edgeSide(lv, p, ux) {
  if (Math.abs(ux) > 0.15) return Math.sign(ux);
  const tx = Math.floor(p.x / T), ty = Math.floor((p.y + HH + 1) / T);
  if (!blocks(tileAt(lv, tx, ty))) return Math.sign(tx * T + T / 2 - p.x) || 1; // ya está medio en el borde
  for (let k = 1; k < CFG.COLS; k++) {
    if (!blocks(tileAt(lv, tx + k, ty)) && !blocks(tileAt(lv, tx + k, ty - 1))) return 1;
    if (!blocks(tileAt(lv, tx - k, ty)) && !blocks(tileAt(lv, tx - k, ty - 1))) return -1;
  }
  return 1;
}

function integrate(p, dt) {
  p.inv = p.anchored || p.trapped >= 0 ? 0 : 1; // anclado o atrapado: masa infinita
  const ax = p.ax, ay = p.ay;
  p.ax = p.ay = 0;
  if (!p.inv) { p.vx = p.vy = 0; return; }
  const dead = p.ko || !p.conn;
  const tilt = clamp(p.input.tilt || 0, -1, 1);
  p.vx += ax * dt;
  p.vy += (ay + CFG.GRAVITY) * dt;
  if (p.ko && !p.grounded) p.vx += tilt * CFG.KO_SWING * dt; // el peso muerto se balancea un poco
  if (!dead && p.stunT <= 0) {
    const target = Math.abs(tilt) > 0.08 ? tilt * CFG.MOVE_SPEED : 0;
    if (p.grounded) {
      const A = (target ? CFG.ACCEL_GROUND : CFG.FRICTION) * dt;
      p.vx += clamp(target - p.vx, -A, A);
    } else if (target) { // en el aire solo acelera, no frena el balanceo
      const A = CFG.ACCEL_AIR * dt;
      if (target > 0 && p.vx < target) p.vx = Math.min(target, p.vx + A);
      if (target < 0 && p.vx > target) p.vx = Math.max(target, p.vx - A);
    }
    if (tilt > 0.1) p.facing = 1; else if (tilt < -0.1) p.facing = -1;
  } else if (p.grounded) { // peso muerto: se arrastra como una bolsa
    const A = CFG.FRICTION * (p.ko ? 0.4 : 1) * dt;
    p.vx += clamp(-p.vx, -A, A);
  }
  const maxFall = p.diving ? CFG.DIVE_MAX : CFG.MAX_FALL;
  if (p.vy > maxFall) p.vy = maxFall;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 900) { p.vx *= 900 / sp; p.vy *= 900 / sp; }
}

/* Desde 2L la cuerda es rígida: se corrige la velocidad para que el camino no se alargue. */
function ropeLimit(sim, dt) {
  const P = sim.players, MAX = CFG.ROPE_LEN * CFG.ROPE_MAX;
  for (let it = 0; it < 4; it++) {
    sim.links.forEach((L, i) => {
      const a = P[i], b = P[i + 1];
      const w = a.inv + b.inv;
      if (!w) return;
      const [da, db] = linkDirs(L);
      const rate = -(a.vx * da[0] + a.vy * da[1]) - (b.vx * db[0] + b.vy * db[1]);
      const allowed = MAX + Math.max(0, L.len - MAX) * 0.8;
      const over = L.len + rate * dt - allowed;
      if (over <= 0) return;
      const k = over / dt / w;
      a.vx += da[0] * k * a.inv; a.vy += da[1] * k * a.inv;
      b.vx += db[0] * k * b.inv; b.vy += db[1] * k * b.inv;
    });
  }
}

/* ── Movimiento con colisión contra los tiles (por ejes, en subpasos de ≤ 6 px) ── */
const blocks = (t) => t === STONE || t === SPIKE;

function move(sim, p, dt) {
  if (p.trapped >= 0) {
    const c = sim.creatures[p.trapped];
    p.x = c.x; p.y = c.y; p.vx = p.vy = 0;
    return;
  }
  if (p.anchored) return;
  const lv = sim.lv;
  const dx = p.vx * dt, dy = p.vy * dt;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
  const wasDiving = p.diving;
  p.grounded = false; p.onWood = false;
  for (let s = 0; s < n; s++) {
    moveX(lv, p, dx / n);
    if (moveY(sim, p, dy / n)) break;
  }
  const top = Math.floor((p.y - HH + 0.5) / T), bot = Math.floor((p.y + HH - 0.5) / T);
  p.wallL = p.wallR = false;
  for (let ty = top; ty <= bot; ty++) {
    if (blocks(tileAt(lv, Math.floor((p.x - HW - 1) / T), ty))) p.wallL = true;
    if (blocks(tileAt(lv, Math.floor((p.x + HW + 1) / T), ty))) p.wallR = true;
  }
  if (p.grounded) {
    p.groundT = CFG.COYOTE;
    if (!p.ko) p.ammo = CFG.AMMO; // recarga al pisar suelo
    if (wasDiving) landShock(sim, p);
    p.diving = false;
  }
}

function moveX(lv, p, d) {
  if (!d) return;
  p.x += d;
  const top = Math.floor((p.y - HH + 0.01) / T), bot = Math.floor((p.y + HH - 0.01) / T);
  const tx = Math.floor((d > 0 ? p.x + HW : p.x - HW) / T);
  for (let ty = top; ty <= bot; ty++) {
    if (!blocks(tileAt(lv, tx, ty))) continue;
    p.x = d > 0 ? tx * T - HW - 0.001 : (tx + 1) * T + HW + 0.001;
    p.vx = 0;
    return;
  }
}

function moveY(sim, p, d) {
  if (!d) return false;
  const lv = sim.lv;
  const prevBottom = p.y + HH;
  p.y += d;
  const l = Math.floor((p.x - HW + 0.01) / T), r = Math.floor((p.x + HW - 0.01) / T);
  if (d > 0) {
    const ty = Math.floor((p.y + HH) / T);
    for (let tx = l; tx <= r; tx++) {
      const t = tileAt(lv, tx, ty);
      const wood = t === WOOD && !p.diving && p.dropT <= 0 && prevBottom <= ty * T + 0.01;
      if (!blocks(t) && !wood) continue;
      p.y = ty * T - HH - 0.001;
      p.vy = 0;
      p.grounded = true;
      p.onWood = t === WOOD;
      return true;
    }
  } else {
    const ty = Math.floor((p.y - HH) / T);
    for (let tx = l; tx <= r; tx++) {
      if (!blocks(tileAt(lv, tx, ty))) continue;
      p.y = (ty + 1) * T + HH + 0.001;
      // El rebote del bungee (o un tirón) lo estrella contra el techo
      if (p.vy < -340) hurt(sim, p, p.x, p.y - 12);
      p.vy = 0;
      return true;
    }
  }
  return false;
}

/* Pisotón fuerte: al terminar la picada en el suelo, sacude a las criaturas malvadas cerca. */
function landShock(sim, p) {
  emit(sim, { k: 'land', id: p.id, x: r1(p.x), y: r1(p.y + HH) });
  for (const c of sim.creatures) {
    if (c.alive && CREATURE[c.kind].evil && Math.abs(c.x - p.x) < 28 && Math.abs(c.y - p.y) < 20) damage(sim, c, 1, p);
  }
}

function stepRopes(sim, dt) {
  const P = sim.players;
  sim.links.forEach((L, i) => {
    const a = P[i], b = P[i + 1];
    const r0 = L.rate;
    L.path = ropePath(sim.lv, a.x, a.y, b.x, b.y);
    L.rate = (L.path.len - L.len) / dt;
    L.len = L.path.len;
    if (r0 > 40 && L.rate <= 0 && L.len > CFG.ROPE_LEN * 1.35) { // rebote bungee
      const low = a.y > b.y ? a : b;
      if (!low.grounded) emit(sim, { k: 'bounce', id: low.id });
    }
    if (L.len > CFG.ROPE_LEN * 1.15) {
      if (!a.grounded) a.bungeeT = 0.5;
      if (!b.grounded) b.bungeeT = 0.5;
    }
  });
}

/* ── Balas ── */
function stepBullets(sim, dt) {
  for (const b of sim.bullets) {
    for (let s = 0; s < 3 && !b.dead; s++) {
      b.x += (b.vx * dt) / 3; b.y += (b.vy * dt) / 3;
      b.d += (Math.hypot(b.vx, b.vy) * dt) / 3;
      if (blocks(tileAt(sim.lv, Math.floor(b.x / T), Math.floor(b.y / T)))) {
        b.dead = true;
        emit(sim, { k: 'spark', x: r1(b.x), y: r1(b.y) });
        break;
      }
      const owner = sim.players.find((p) => p.id === b.owner);
      for (const c of sim.creatures) {
        if (!c.alive || Math.abs(b.x - c.x) > c.w / 2 + 2 || Math.abs(b.y - c.y) > c.h / 2 + 3) continue;
        b.dead = true;
        bulletHitsCreature(sim, c, owner);
        break;
      }
      if (b.dead) break;
      for (const p of sim.players) {
        if (p.id === b.owner || p.ko || Math.abs(b.x - p.x) > HW + 1 || Math.abs(b.y - p.y) > HH + 2) continue;
        b.dead = true;
        friendlyFire(sim, p, b, owner);
        break;
      }
    }
    if (b.d > CFG.SHOT_RANGE) b.dead = true;
  }
  sim.bullets = sim.bullets.filter((b) => !b.dead);
}

function bulletHitsCreature(sim, c, owner) {
  if (CREATURE[c.kind].evil) damage(sim, c, 1, owner);
  else if (c.kind === 'cube') emit(sim, { k: 'plop', x: r1(c.x), y: r1(c.y) });
  else if (c.kind === 'fairy') {
    // Se enoja 5 s y persigue al que disparó: empuja y aturde, no daña
    if (c.angryT <= 0 && owner) owner.stats.angryFairies++;
    c.angryT = CFG.FAIRY_ANGRY;
    c.target = owner ? owner.id : null;
    emit(sim, { k: 'angry', x: r1(c.x), y: r1(c.y), id: owner?.id });
  }
}

/* Fuego amigo: empuja y aturde, no hace daño. Aturdido suelta el ancla. */
function friendlyFire(sim, p, b, owner) {
  if (owner) owner.stats.ffHits++;
  p.stunT = CFG.STUN;
  p.anchored = false;
  p.vx += Math.sign(p.x - b.x || 1) * 60 + b.vx * 0.2;
  p.vy += 160;
  p.grounded = false;
  emit(sim, { k: 'ff', id: p.id, by: owner?.id });
}

function damage(sim, c, dmg, by) {
  c.hp -= dmg;
  c.flashT = 0.12;
  if (c.hp > 0) { emit(sim, { k: 'chit', x: r1(c.x), y: r1(c.y) }); return; }
  c.alive = false;
  const v = CREATURE[c.kind].gems;
  sim.gems += v;
  if (by) { by.stats.kills++; by.stats.gems += v; }
  emit(sim, { k: 'kill', x: r1(c.x), y: r1(c.y), v, kind: c.kind, id: by?.id });
}

/* ── Criaturas ── */
function stepCreature(sim, c, dt) {
  c.t += dt;
  c.flashT = Math.max(0, c.flashT - dt);
  c.biteCd = Math.max(0, c.biteCd - dt);
  if (c.kind === 'goblin') stepGoblin(sim, c, dt);
  else if (c.kind === 'imp') stepImp(sim, c, dt);
  else if (c.kind === 'cube') stepCube(sim, c, dt);
  else stepFairy(sim, c, dt);
}

// Movimiento por ejes de una criatura; la madera es suelo para las que caminan
function moveBody(lv, c, dx, dy, walker) {
  const hw = c.w / 2, hh = c.h / 2;
  c.hitWall = false;
  if (dx) {
    c.x += dx;
    const tx = Math.floor((dx > 0 ? c.x + hw : c.x - hw) / T);
    for (let ty = Math.floor((c.y - hh + 0.01) / T); ty <= Math.floor((c.y + hh - 0.01) / T); ty++) {
      if (!blocks(tileAt(lv, tx, ty))) continue;
      c.x = dx > 0 ? tx * T - hw - 0.001 : (tx + 1) * T + hw + 0.001;
      c.hitWall = true; c.vx = 0;
      break;
    }
  }
  c.grounded = false;
  if (dy) {
    const prevBottom = c.y + hh;
    c.y += dy;
    const ty = Math.floor((dy > 0 ? c.y + hh : c.y - hh) / T);
    for (let tx = Math.floor((c.x - hw + 0.01) / T); tx <= Math.floor((c.x + hw - 0.01) / T); tx++) {
      const t = tileAt(lv, tx, ty);
      const wood = walker && dy > 0 && t === WOOD && prevBottom <= ty * T + 0.01;
      if (!blocks(t) && !wood) continue;
      if (dy > 0) { c.y = ty * T - hh - 0.001; c.grounded = true; }
      else c.y = (ty + 1) * T + hh + 0.001;
      c.vy = 0;
      break;
    }
  }
}

function stepGoblin(sim, c, dt) {
  const lv = sim.lv;
  c.vy = Math.min(c.vy + CFG.GRAVITY * dt, CFG.MAX_FALL);
  c.vx = c.dir * CFG.GOBLIN_SPEED;
  moveBody(lv, c, c.vx * dt, c.vy * dt, true);
  if (c.hitWall) c.dir *= -1;
  else if (c.grounded) {
    // se da vuelta en los bordes
    const ax = Math.floor((c.x + c.dir * (c.w / 2 + 1)) / T), fy = Math.floor((c.y + c.h / 2 + 1) / T);
    if (tileAt(lv, ax, fy) === EMPTY) c.dir *= -1;
  }
}

function nearestAlive(sim, c, range) {
  let best = null, bd = range;
  for (const p of sim.players) {
    if (p.ko || !p.conn) continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function stepImp(sim, c, dt) {
  const tgt = nearestAlive(sim, c, CFG.IMP_SIGHT);
  let gx, gy;
  if (tgt) { gx = tgt.x; gy = tgt.y; }
  else { gx = c.hx + Math.sin(c.t * 0.9) * 18; gy = c.hy + Math.sin(c.t * 1.7) * 6; }
  const dx = gx - c.x, dy = gy - c.y, d = Math.hypot(dx, dy) || 1;
  const acc = tgt ? 160 : 60;
  c.vx += (dx / d) * acc * dt; c.vy += (dy / d) * acc * dt;
  const sp = Math.hypot(c.vx, c.vy), max = tgt ? CFG.IMP_SPEED : 20;
  if (sp > max) { c.vx *= max / sp; c.vy *= max / sp; }
  if (dx) c.dir = dx > 0 ? 1 : -1;
  moveBody(sim.lv, c, c.vx * dt, c.vy * dt, false);
}

/* Cubo gelatinoso: se desliza por las paredes (o por el suelo si no tiene pared al lado). */
function stepCube(sim, c, dt) {
  const lv = sim.lv;
  if (c.mode === 'wall') {
    const ny = c.y + c.dir * CFG.CUBE_SPEED * dt;
    const edge = Math.floor((ny + c.dir * (c.h / 2 + 0.5)) / T);
    const tx = Math.floor(c.x / T);
    if (solidAt(lv, tx, edge) || !solidAt(lv, tx + c.side, edge) || Math.abs(ny - c.hy) > 40) c.dir *= -1;
    else c.y = ny;
  } else {
    c.vy = Math.min(c.vy + CFG.GRAVITY * dt, CFG.MAX_FALL);
    moveBody(lv, c, c.dir * CFG.CUBE_SPEED * dt, c.vy * dt, true);
    if (c.hitWall || Math.abs(c.x - c.hx) > 40) c.dir *= -1;
    else if (c.grounded && tileAt(lv, Math.floor((c.x + c.dir * (c.w / 2 + 1)) / T), Math.floor((c.y + c.h / 2 + 1) / T)) === EMPTY) c.dir *= -1;
  }
}

function stepFairy(sim, c, dt) {
  c.pushCd = Math.max(0, c.pushCd - dt);
  let gx, gy, sp;
  if (c.angryT > 0) {
    c.angryT -= dt;
    const tgt = sim.players.find((p) => p.id === c.target);
    if (!tgt || tgt.ko) c.angryT = 0;
    else { gx = tgt.x; gy = tgt.y; sp = CFG.FAIRY_SPEED; }
  }
  if (!(c.angryT > 0)) {
    gx = c.hx + Math.sin(c.t * 1.3) * 12; gy = c.hy + Math.sin(c.t * 2.3) * 5; sp = 30;
  }
  const dx = gx - c.x, dy = gy - c.y, d = Math.hypot(dx, dy);
  const m = Math.min(d, sp * dt);
  if (d > 0.01) { c.x += (dx / d) * m; c.y += (dy / d) * m; c.dir = dx > 0 ? 1 : -1; }
  c.x = clamp(c.x, T + 6, CFG.COLS * T - T - 6);
}

/* ── Contactos: pinchos, criaturas, gemas ── */
const overlap = (p, c, pad = 0) => Math.abs(p.x - c.x) < HW + c.w / 2 + pad && Math.abs(p.y - c.y) < HH + c.h / 2 + pad;

function contacts(sim) {
  const lv = sim.lv;
  for (const p of sim.players) {
    if (p.trapped >= 0) continue;
    if (!p.ko && p.invT <= 0) {
      const s = touchingSpike(lv, p);
      if (s) hurt(sim, p, s[0], s[1]);
    }
    for (const c of sim.creatures) {
      if (!c.alive || !overlap(p, c)) continue;
      if (CREATURE[c.kind].evil) {
        if (p.ko) continue;
        if (p.vy > 20 && p.py + HH <= c.y - c.h / 2 + 6) { // pisotón
          const strong = p.diving;
          damage(sim, c, 99, p);
          p.vy = -(strong ? CFG.DIVE_STOMP_V : CFG.STOMP_V);
          p.ammo = CFG.AMMO;
          p.diving = false;
          p.stats.stomps++;
          emit(sim, { k: 'stomp', id: p.id, x: r1(c.x), y: r1(c.y), strong });
        } else if (c.biteCd <= 0 && hurt(sim, p, c.x, c.y)) c.biteCd = 0.8; // no muerde a toda la cadena de una
      } else if (c.kind === 'cube') {
        if (!p.ko && p.invT <= 0 && p.cubeCd <= 0) {
          p.trapped = c.i; p.trapT = CFG.TRAP_TIME;
          p.anchored = false; p.diving = false; p.vx = p.vy = 0;
          emit(sim, { k: 'trap', id: p.id });
        }
      } else if (c.kind === 'fairy' && !p.ko) {
        if (c.angryT <= 0) { // al tocarla: un corazón, o munición si estás completo
          if (p.hp < CFG.HEARTS) p.hp++;
          p.ammo = CFG.AMMO;
          c.alive = false;
          emit(sim, { k: 'heal', id: p.id, x: r1(c.x), y: r1(c.y) });
        } else if (c.target === p.id && c.pushCd <= 0) {
          c.pushCd = 1;
          p.stunT = CFG.STUN; p.anchored = false;
          p.vx += (p.x >= c.x ? 1 : -1) * 200; p.vy -= 120; p.grounded = false;
          emit(sim, { k: 'fairypush', id: p.id });
        }
      }
    }
    for (let i = 0; i < lv.gems.length; i++) {
      if (sim.gemsTaken[i]) continue;
      const g = lv.gems[i];
      const r = g.big ? 7 : 4;
      if (Math.abs(g.x - p.x) > HW + r || Math.abs(g.y - p.y) > HH + r) continue;
      sim.gemsTaken[i] = 1;
      const v = g.big ? 10 : 1;
      sim.gems += v;
      p.stats.gems += v;
      if (p.bungeeT > 0) p.stats.bungeeGems += v;
      emit(sim, { k: 'gem', id: p.id, x: g.x, y: g.y, v, big: g.big });
    }
  }
}

function touchingSpike(lv, p) {
  const l = Math.floor((p.x - HW - 1) / T), r = Math.floor((p.x + HW + 1) / T);
  const t = Math.floor((p.y - HH - 1) / T), b = Math.floor((p.y + HH + 1) / T);
  for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) {
    if (tileAt(lv, tx, ty) === SPIKE) return [tx * T + T / 2, ty * T + T / 2];
  }
  return null;
}

/* −1 corazón, invulnerable 1,5 s y empujón. Con 0 corazones queda fuera de combate. */
export function hurt(sim, p, sx, sy) {
  if (p.ko || p.invT > 0) return false;
  p.hp--;
  p.invT = CFG.INVULN;
  p.hurtT = sim.t;
  p.stats.hits++;
  p.vx = (p.x >= sx ? 1 : -1) * 140;
  p.vy = sy >= p.y ? -230 : 120;
  p.diving = false; p.anchored = false; p.grounded = false;
  for (const rec of sim.pending) { // ¿lo tiraron hacia esto hace menos de 1,5 s?
    if (rec.target === p && !rec.done && sim.t - rec.t <= 1.5) { rec.by.stats.traitorTugs++; rec.done = true; }
  }
  emit(sim, { k: 'hit', id: p.id, x: r1(p.x), y: r1(p.y) });
  if (p.hp <= 0) {
    p.hp = 0; p.ko = true; p.stats.kos++;
    if (p.trapped >= 0) release(p);
    emit(sim, { k: 'ko', id: p.id });
  }
  return true;
}

function bookkeeping(sim, dt) {
  const P = sim.players;
  for (const p of P) {
    if (p.trapped >= 0) {
      p.trapT -= dt;
      if (p.trapT <= 0) { // se cumplió el tiempo: −1 corazón y lo expulsa
        release(p);
        p.invT = 0;
        hurt(sim, p, p.x, p.y + 10);
        p.vy = -220; p.vx = (p.x < (CFG.COLS * T) / 2 ? 1 : -1) * 150;
      }
    }
    if (p.ko) p.stats.koT += dt;
    if (p.anchored) {
      const loaded = [[p.idx - 1, P[p.idx - 1]], [p.idx, P[p.idx + 1]]].some(([li, nb]) =>
        nb && sim.links[li] && sim.links[li].len > CFG.ROPE_LEN + 4 && !nb.grounded);
      if (loaded) p.stats.anchorLoadT += dt;
    }
    p.arrived = !p.ko && p.grounded && p.y + HH >= sim.lv.finY - 1;
  }
  for (const rec of sim.pending) {
    if (!rec.done && sim.t - rec.t > 1.5) { if (rec.danger) rec.by.stats.rescues++; rec.done = true; }
  }
  sim.pending = sim.pending.filter((r) => !r.done || sim.t - r.t < 2);
  if (sim.status !== 'play') return;
  const alive = P.filter((p) => !p.ko && p.conn);
  if (!alive.length) {
    if (P.some((p) => p.ko)) { sim.status = 'wiped'; emit(sim, { k: 'wiped' }); }
  } else if (alive.every((p) => p.arrived)) {
    sim.wonT += dt;
    if (sim.wonT > 0.6) { sim.status = 'won'; emit(sim, { k: 'won' }); }
  } else sim.wonT = 0;
}

/* ── Estado para la red (anfitrión → invitados), con valores redondeados ── */
export const PF = { grounded: 1, anchored: 2, ko: 4, trapped: 8, inv: 16, stun: 32, diving: 64, off: 128, holding: 256, left: 512, arrived: 1024 };

export function playerFlags(p) {
  return (p.grounded ? 1 : 0) | (p.anchored ? 2 : 0) | (p.ko ? 4 : 0) | (p.trapped >= 0 ? 8 : 0) |
    (p.invT > 0 ? 16 : 0) | (p.stunT > 0 ? 32 : 0) | (p.diving ? 64 : 0) | (p.conn ? 0 : 128) |
    (p.holding ? 256 : 0) | (p.facing < 0 ? 512 : 0) | (p.arrived ? 1024 : 0);
}
export function creatureFlags(c) {
  return (c.dir < 0 ? 1 : 0) | (c.angryT > 0 ? 2 : 0) | (c.flashT > 0 ? 4 : 0);
}

export function encodeState(sim) {
  const taken = [];
  sim.gemsTaken.forEach((v, i) => { if (v) taken.push(i); });
  return {
    t: 'st', T: Math.round(sim.t * 1000) / 1000, g: sim.gems, s: sim.status,
    p: sim.players.map((p) => [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.hp, p.ammo, playerFlags(p)]),
    c: sim.creatures.map((c) => (c.alive ? [r1(c.x), r1(c.y), creatureFlags(c)] : 0)),
    gm: taken,
  };
}
