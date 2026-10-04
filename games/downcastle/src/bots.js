/* IA simple para probar sin más teléfonos: sigue un campo de distancias hacia el FIN,
   salta cuando el camino sube, atraviesa la madera con la picada, dispara a lo malvado (y a
   las flechas) que tiene debajo y saca del cubo a sus vecinos. Con El Ojo, sube a la percha,
   salta los rayos y hace la picada cuando el ojo se abre debajo. La usa el anfitrión para los
   bots, cualquier teléfono para su piloto automático (__downcastle.auto) y tools/simrun.mjs.
   Lee objetos planos (ver botView). */
import { CFG } from './config.js';
import { STONE, SPIKE, baseTileAt, isWoodLike } from './level.js';

const T = CFG.TILE;

/* Campo de distancias hacia las celdas meta (por defecto, la fila de arriba del piso del FIN).
   Usa los tiles base: la salida de la sala del jefe cuenta como abierta. */
export function flowField(lv, goals = null) {
  const { w, h } = lv;
  const dist = new Float32Array(w * h).fill(Infinity);
  const tile = (x, y) => baseTileAt(lv, x, y);
  const pass = (x, y) => { const t = tile(x, y); return t !== STONE && t !== SPIKE; };
  const danger = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tile(x + dx, y + dy) === SPIKE) return 8;
    return 0;
  };
  const q = [];
  if (goals) for (const g of goals) { dist[g] = 0; q.push(g); }
  else for (let x = lv.wrap ? 0 : 1; x < (lv.wrap ? w : w - 1); x++) if (pass(x, h - 2)) { dist[(h - 2) * w + x] = 0; q.push((h - 2) * w + x); }
  // Relajación tipo SPFA desde la meta: cuesta caer poco, moverse 1 y subir (saltar) 4
  while (q.length) {
    const b = q.shift(), bx = b % w, by = (b / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const ax = lv.wrap ? (bx + dx + w) % w : bx + dx, ay = by + dy; // a se mueve hacia b
      if (ax < 0 || ax >= w || ay < 0 || ay >= h || !pass(ax, ay)) continue;
      let cost = dy === -1 ? 0.6 : dy === 1 ? 4 : 1; // a está arriba de b: cae
      if (isWoodLike(tile(bx, by))) cost += 1.5;
      cost += danger(bx, by);
      const nd = dist[b] + cost;
      if (nd < dist[ay * w + ax]) { dist[ay * w + ax] = nd; q.push(ay * w + ax); }
    }
  }
  return dist;
}

/* Percha de la sala del jefe: la fila con más madera entre la entrada y el ojo. */
export function perchOf(lv) {
  if (!lv.bossAt) return null;
  const by = Math.floor(lv.bossAt.y / T);
  let best = -1, row = -1;
  for (let y = lv.gateRow + 1; y < by; y++) {
    let n = 0;
    for (let x = 1; x < lv.w - 1; x++) if (isWoodLike(baseTileAt(lv, x, y))) n++;
    if (n > best) { best = n; row = y; }
  }
  const cells = [];
  for (let x = 1; x < lv.w - 1; x++) if (isWoodLike(baseTileAt(lv, x, row))) cells.push((row - 1) * lv.w + x);
  return { row, cells, top: (lv.gateRow + 1) * T, x0: (cells[0] % lv.w) * T + T / 2, x1: (cells[cells.length - 1] % lv.w) * T + T / 2 };
}

/* Campos de un nivel: { field, perch, perchField }. */
export function botFields(lv) {
  const perch = perchOf(lv);
  return { field: flowField(lv), perch, perchField: perch ? flowField(lv, perch.cells) : null };
}

/* Vista plana para botThink desde la simulación del anfitrión. */
export function botView(sim, f) {
  const B = sim.boss;
  return {
    lv: sim.lv, t: sim.t, ...f,
    players: sim.players.map((p) => ({ x: p.x, y: p.y, vy: p.vy, grounded: p.grounded, diving: p.diving, ammo: p.ammo, ko: p.ko, trapped: p.trapped >= 0, idx: p.idx, onWood: p.onWood })),
    creatures: sim.creatures, arrows: sim.arrows,
    boss: B && { x: B.x, y: B.y, state: B.state, dead: B.dead, gateClosed: B.gateClosed, beams: B.beams.map((b) => b.y) },
  };
}

/* pace: 'humano' hace pausas al azar en el suelo (para calibrar el derrumbe con un ritmo
   parecido al de una persona; los bots normales bajan unas 5 veces más rápido). */
export function newBotMemory(i = 0, pace = '') {
  return { tapCd: 0, tugCd: 0, best: Infinity, stuckT: 0, wobble: i * 1.7, mode: '', pace, pauseT: 0, rs: 0x9e3779b1 * (i + 1) >>> 0 };
}
function memRand(mem) { // xorshift por bot: reproducible
  let x = mem.rs || 1;
  x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  mem.rs = x;
  return x / 4294967296;
}

const EVIL = new Set(['goblin', 'imp', 'skeleton', 'eyelet', 'bat']);

export function botThink(view, me, mem, dt) {
  const out = { tilt: 0, hold: false, events: [] };
  mem.tapCd -= dt;
  mem.tugCd -= dt;
  if (me.ko || me.trapped) return out;
  mem.pauseT -= dt;
  if (mem.pauseT > 0) return out; // arranque demorado (simrun) o pausa del ritmo humano
  if (mem.pace === 'humano') {
    // Al aterrizar mira un rato (si no hay nada malvado cerca) y camina más despacio
    const landed = me.grounded && !mem.wasGrounded;
    mem.wasGrounded = me.grounded;
    if (mem.pauseT > 0) return out;
    if (landed && memRand(mem) < 0.7 && !view.creatures.some((c) => c && c.alive && EVIL.has(c.kind) && Math.hypot(c.x - me.x, c.y - me.y) < 56)) {
      mem.pauseT = 0.8 + memRand(mem) * 1.7;
      return out;
    }
  }
  const { lv } = view;
  const w = lv.w;
  // Saca del cubo a un vecino
  const nbs = [view.players[me.idx - 1], view.players[me.idx + 1]].filter(Boolean);
  if (nbs.some((n) => n.trapped && !n.ko) && mem.tapCd <= 0) { out.events.push('up'); mem.tapCd = 0.5; return out; }

  const B = view.boss;
  // En la sala del jefe (aunque la entrada siga abierta): a la percha
  const fight = B && !B.dead && view.perchField && (B.gateClosed || me.y > view.perch.top);
  const field = fight ? view.perchField : view.field;
  const mode = fight ? 'boss' : 'run';
  if (mode !== mem.mode) { mem.mode = mode; mem.best = Infinity; mem.stuckT = 0; }

  // En la torre la x no se envuelve: el campo se indexa con la columna envuelta
  const wx = (x) => (lv.wrap ? ((x % w) + w) % w : x);
  const cx = Math.floor(me.x / T), cy = Math.floor(me.y / T);
  const here = field[cy * w + wx(cx)];
  // Cayendo en picada hacia la percha: un disparo corta la picada (si no, la atraviesa)
  if (fight && me.diving && cy < view.perch.row && me.ammo > 0 && mem.tapCd <= 0) { out.events.push('tap'); mem.tapCd = 0.2; }
  const onWood = me.onWood || isWoodLike(baseTileAt(lv, wx(cx), Math.floor((me.y + CFG.PH / 2 + 1) / T)));

  if (fight && here === 0) {
    // En la percha: seguir al ojo, picada cuando se abre justo debajo
    const P = view.perch;
    const gx = Math.max(P.x0, Math.min(P.x1, B.x));
    out.tilt = Math.max(-1, Math.min(1, (gx - me.x) / 6));
    if (B.state === 'open' && me.grounded && Math.abs(B.x - me.x) < 10 && mem.tapCd <= 0) { out.events.push('down'); mem.tapCd = 0.5; }
    mem.stuckT = 0;
  } else {
    if (!fight && cy >= lv.h - 2 && me.grounded) return out; // llegó al FIN
    let best = here, bx = cx, by = cy;
    for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if ((!lv.wrap && (nx < 0 || nx >= w)) || ny < 0 || ny >= lv.h) continue;
      const d = field[ny * w + wx(nx)];
      if (d < best - 0.01) { best = d; bx = nx; by = ny; }
    }
    const tx = bx * T + T / 2;
    out.tilt = Math.max(-1, Math.min(1, (tx - me.x) / 8));
    if (bx === cx && by > cy) out.tilt = Math.max(-1, Math.min(1, (cx * T + T / 2 - me.x) / 4));

    // ¿Se trabó? Saltar o bajar de la madera
    if (here < mem.best - 0.5) { mem.best = here; mem.stuckT = 0; } else mem.stuckT += dt;
    if (me.grounded && mem.tapCd <= 0) {
      if (by < cy || (mem.stuckT > 1.2 && !onWood)) { out.events.push('tap'); mem.tapCd = 0.4; }
      else if (onWood && (by > cy || mem.stuckT > 0.8)) { out.events.push('down'); mem.tapCd = 0.4; }
    }
    if (mem.stuckT > 1.2 && !me.grounded) out.tilt = Math.sin(view.t * 2 + mem.wobble);
    // Trabado por un vecino fuera de combate: tirón para arrastrarlo
    if (mem.stuckT > 0.8 && nbs.some((n) => n.ko) && mem.tugCd <= 0) { out.events.push('up'); mem.tugCd = 1.2; }
    if (mem.stuckT > 3) { mem.stuckT = 0; mem.best = Infinity; }
  }

  // Rayo de El Ojo: saltarlo cuando está por pasar por la propia fila
  if (fight && me.grounded && B.state === 'beam') {
    for (const by of B.beams) if (Math.abs(by - me.y) < 34 && mem.tapCd <= 0) { out.events.push('tap'); mem.tapCd = 0.5; break; }
  }

  // Dispara a lo malvado (o a una flecha) que tiene debajo
  if (!me.grounded && me.ammo > 0 && mem.tapCd <= 0) {
    let fire = false;
    for (const c of view.creatures) {
      if (!c || !c.alive || !EVIL.has(c.kind)) continue;
      const dx = c.x - me.x, dy = c.y - me.y;
      if (Math.abs(dx) < 10 && dy > 0 && dy < 70) { fire = true; break; }
    }
    for (const a of view.arrows || []) {
      if (Math.abs(a.x - me.x) < 10 && a.y > me.y && a.y - me.y < 60) { fire = true; break; }
    }
    if (fire) { out.events.push('tap'); mem.tapCd = 0.15; }
  }
  if (mem.pace === 'humano') out.tilt *= 0.6;
  return out;
}
