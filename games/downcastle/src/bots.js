/* IA simple para probar sin más teléfonos: sigue un campo de distancias hacia el FIN,
   salta cuando el camino sube, atraviesa la madera con la picada, dispara a lo malvado que
   tiene debajo y saca del cubo a sus vecinos. La usa el anfitrión para los bots y cualquier
   teléfono para su piloto automático (__downcastle.auto). Lee objetos planos:
   { lv, players: [{ x, y, grounded, ammo, ko, trapped, idx }], creatures: [{ kind, x, y, alive }] } */
import { CFG } from './config.js';
import { STONE, WOOD, SPIKE, tileAt } from './level.js';

const T = CFG.TILE;

export function flowField(lv) {
  const { w, h } = lv;
  const dist = new Float32Array(w * h).fill(Infinity);
  const pass = (x, y) => { const t = tileAt(lv, x, y); return t !== STONE && t !== SPIKE; };
  const danger = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(lv, x + dx, y + dy) === SPIKE) return 8;
    return 0;
  };
  const q = [];
  for (let x = 1; x < w - 1; x++) if (pass(x, h - 2)) { dist[(h - 2) * w + x] = 0; q.push((h - 2) * w + x); }
  // Relajación tipo SPFA desde la meta: cuesta caer poco, moverse 1 y subir (saltar) 4
  while (q.length) {
    const b = q.shift(), bx = b % w, by = (b / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const ax = bx + dx, ay = by + dy; // a se mueve hacia b
      if (ax < 0 || ax >= w || ay < 0 || ay >= h || !pass(ax, ay)) continue;
      let cost = dy === -1 ? 0.6 : dy === 1 ? 4 : 1; // a está arriba de b: cae
      if (tileAt(lv, bx, by) === WOOD) cost += 1.5;
      cost += danger(bx, by);
      const nd = dist[b] + cost;
      if (nd < dist[ay * w + ax]) { dist[ay * w + ax] = nd; q.push(ay * w + ax); }
    }
  }
  return dist;
}

export function newBotMemory(i = 0) {
  return { tapCd: 0, tugCd: 0, best: Infinity, stuckT: 0, wobble: i * 1.7 };
}

export function botThink(view, me, mem, dt) {
  const out = { tilt: 0, hold: false, events: [] };
  mem.tapCd -= dt;
  if (me.ko || me.trapped) return out;
  const { lv, field } = view;
  const w = lv.w;
  // Saca del cubo a un vecino
  const nbs = [view.players[me.idx - 1], view.players[me.idx + 1]].filter(Boolean);
  if (nbs.some((n) => n.trapped && !n.ko) && mem.tapCd <= 0) { out.events.push('up'); mem.tapCd = 0.5; return out; }

  const cx = Math.floor(me.x / T), cy = Math.floor(me.y / T);
  const here = field[cy * w + cx];
  if (cy >= lv.h - 2 && me.grounded) return out; // llegó al FIN
  let best = here, bx = cx, by = cy;
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1]]) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= lv.h) continue;
    const d = field[ny * w + nx];
    if (d < best - 0.01) { best = d; bx = nx; by = ny; }
  }
  const tx = bx * T + T / 2;
  out.tilt = Math.max(-1, Math.min(1, (tx - me.x) / 8));
  if (bx === cx && by > cy) out.tilt = Math.max(-1, Math.min(1, (cx * T + T / 2 - me.x) / 4));

  // ¿Se trabó? Saltar o bajar de la madera
  if (here < mem.best - 0.5) { mem.best = here; mem.stuckT = 0; } else mem.stuckT += dt;
  const onWood = tileAt(lv, cx, Math.floor((me.y + CFG.PH / 2 + 1) / T)) === WOOD;
  if (me.grounded && mem.tapCd <= 0) {
    if (by < cy || (mem.stuckT > 1.2 && !onWood)) { out.events.push('tap'); mem.tapCd = 0.4; }
    else if (onWood && (by > cy || mem.stuckT > 0.8)) { out.events.push('down'); mem.tapCd = 0.4; }
  }
  if (mem.stuckT > 1.2 && !me.grounded) out.tilt = Math.sin(view.t * 2 + mem.wobble);
  // Trabado por un vecino fuera de combate: tirón para arrastrarlo
  if (mem.stuckT > 0.8 && nbs.some((n) => n.ko) && mem.tugCd <= 0) { out.events.push('up'); mem.tugCd = 1.2; }
  mem.tugCd -= dt;
  if (mem.stuckT > 3) { mem.stuckT = 0; mem.best = Infinity; }

  // Dispara a lo malvado que tiene debajo
  if (!me.grounded && me.ammo > 0 && mem.tapCd <= 0) {
    for (const c of view.creatures) {
      if (!c || !c.alive || (c.kind !== 'goblin' && c.kind !== 'imp')) continue;
      const dx = c.x - me.x, dy = c.y - me.y;
      if (Math.abs(dx) < 10 && dy > 0 && dy < 70) { out.events.push('tap'); mem.tapCd = 0.15; break; }
    }
  }
  return out;
}
