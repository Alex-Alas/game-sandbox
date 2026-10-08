// node --test: Node 22 importa los .ts directo (sin tipos). Correr con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, step, standings, NO_INPUT, HZ, GO, HW, H, NEVER } from '../src/sim/sim.ts';
import { newTerr, set, carve, sweepX, sweepY, raycast, CELL, DIRT, ROCK, LOOSE, cell } from '../src/sim/terrain.ts';
import { movePlayer } from '../src/sim/move.ts';
import { hurt, boom, cast } from '../src/sim/combat.ts';
import { botInput, newMem } from '../src/sim/bot.ts';
import { DEFAULTS as C } from '../src/sim/params.ts';
import { MAPS } from '../src/sim/maps.ts';
import { CARDS, CARD } from '../src/sim/cards.ts';
import { CHARS } from '../src/sim/chars.ts';
import { packState, applyState, packInput, unpackInput, packFull, unpackFull } from '../src/net.ts';

const I = (o = {}) => ({ ...NO_INPUT, ...o });
// Un mundo de prueba: piso de tierra en y ∈ [0, 1) a lo ancho (y una pared opcional)
function flat(extra = () => {}) {
  const { s, w } = newState('islas', 1, [{ name: 'A', ch: 'bombin' }, { name: 'B', ch: 'bombin' }]);
  const T = newTerr(160, 80);
  for (let i = 0; i < 160; i++) for (let j = 0; j < 4; j++) set(T, i, j, j === 0 ? ROCK : DIRT);
  extra(T);
  w.T = T;
  w.m = { ...w.m, w: 40, h: 20, water: -5, pads: [], hz: {}, spawns: [[10, 1], [30, 1]] };
  s.t = GO * HZ;
  for (const [k, p] of s.pl.entries()) Object.assign(p, { alive: true, x: k ? 30 : 10, y: 1, ground: true, cloudT: NEVER, invT: NEVER, groundT: s.t });
  return { s, w };
}
const run = (s, w, n, inp = () => I()) => { for (let k = 0; k < n; k++) { s.t++; s.ev = []; movePlayer(s, w, s.pl[0], inp(k)); } };

test('terreno: el barrido no atraviesa una pared de una celda ni a 300 m/s', () => {
  const T = newTerr(100, 40);
  for (let j = 0; j < 40; j++) set(T, 50, j, DIRT);
  const x = 5, d = sweepX(T, x, 1, HW, H, 300 / 60 * 10);
  assert.ok(x + d + HW <= 50 * CELL + 1e-9, `quedó en ${x + d}`);
  assert.equal(sweepY(T, 20, 5, HW, H, -100), -100); // sin piso: cae libre
});

test('terreno: los cortes no rompen la piedra y los pedazos sueltos se caen', () => {
  const T = newTerr(60, 60);
  for (let i = 10; i < 50; i++) for (let j = 10; j < 14; j++) set(T, i, j, j === 10 ? ROCK : DIRT);
  for (let i = 20; i < 24; i++) for (let j = 30; j < 33; j++) set(T, i, j, DIRT); // un pedazo chico flotando
  carve(T, [0, 7.5, 3, 1]);
  assert.equal(cell(T, 30, 10), ROCK, 'la piedra sigue');
  assert.equal(cell(T, 30, 12), 0, 'la tierra se rompió');
  // cortar al lado del pedazo chico: se cae entero (no tiene piedra y es chico)
  const fell = carve(T, [0, 21 * CELL, 33.5 * CELL, 0.3]);
  assert.ok(fell.length > 0 && fell.length / 3 <= LOOSE);
  for (let i = 20; i < 24; i++) for (let j = 30; j < 33; j++) assert.equal(cell(T, i, j), 0);
  assert.equal(T.ops.length, 2);
  const r = raycast(T, 5, 8, 0, -1, 10);
  assert.ok(Math.abs(r.d - 4.5) < 1e-9 && r.ny === 1, JSON.stringify(r));
});

test('salto: llega a JUMP_H y el doble salto suma; vuelven al tocar el suelo', () => {
  const { s, w } = flat();
  const p = s.pl[0];
  let top = 0;
  run(s, w, 60, k => I({ jump: k < 40 }));
  run(s, w, 1);
  // altura máxima del primer salto
  const { s: s2, w: w2 } = flat();
  for (let k = 0; k < 40; k++) { s2.t++; movePlayer(s2, w2, s2.pl[0], I({ jump: true })); top = Math.max(top, s2.pl[0].y - 1); }
  assert.ok(Math.abs(top - C.JUMP_H) < 0.15, `altura ${top}`);
  run(s, w, 120);
  assert.ok(p.ground && p.air === 1);
});

test('coyote: se salta unos cuadros después de dejar el borde', () => {
  const { s, w } = flat(T => { for (let i = 60; i < 160; i++) for (let j = 0; j < 4; j++) set(T, i, j, 0); });
  const p = s.pl[0];
  p.air = 0;
  const air0 = () => { const c = { ...C, AIR_JUMPS: 0 }; w.c = c; };
  air0();
  let k = 0;
  while (p.ground && k++ < 200) { s.t++; movePlayer(s, w, p, I({ x: 1 })); }
  s.t++; movePlayer(s, w, p, I({ x: 1 })); // un cuadro en el aire
  s.t++; movePlayer(s, w, p, I({ x: 1, jump: true }));
  assert.ok(p.vy > 5, 'saltó con coyote');
});

test('pared: deslizarse frena la caída y el salto de pared empuja para afuera', () => {
  const { s, w } = flat(T => { for (let j = 0; j < 60; j++) for (let i = 80; i < 84; i++) set(T, i, j, DIRT); });
  const p = s.pl[0];
  Object.assign(p, { x: 20 - HW - 0.01, y: 6, ground: false, air: 0, vy: 0 });
  run(s, w, 40, () => I({ x: 1 }));
  assert.equal(p.wall, 1);
  assert.ok(p.vy >= -C.WALL_SLIDE - 1e-6, `cae a ${p.vy}`);
  run(s, w, 1, () => I({ x: 1, jump: true }));
  assert.ok(p.vx < -C.WJ_VX + 0.5 && p.vy > 0, `vx ${p.vx} vy ${p.vy}`);
});

test('dash: recorre ~DASH_V × DASH_F; dash + SALTO en el suelo es SUPER', () => {
  const { s, w } = flat();
  const p = s.pl[0], x0 = p.x;
  run(s, w, 1, () => I({ dash: true, x: 1 }));
  run(s, w, C.DASH_F - 1);
  assert.ok(Math.abs(p.x - x0 - C.DASH_V * C.DASH_F / 60) < 0.6, `recorrió ${p.x - x0}`);
  const { s: s2, w: w2 } = flat();
  const q = s2.pl[0];
  run(s2, w2, 1, () => I({ dash: true, x: 1 }));
  run(s2, w2, 3, k => I({ x: 1, jump: k === 2 }));
  assert.ok(q.vx >= C.SUPER_VX - 1e-6 && q.vy > 0, `vx ${q.vx}`);
  assert.ok(s2.ev.some(e => e.k === 'trick' && e.n === 'SUPER') || q.tricks > 0);
});

test('wavedash: dash ↘ en el suelo sale barriendo rápido; SALTO ahí es HYPER', () => {
  const { s, w } = flat();
  const p = s.pl[0];
  run(s, w, 1, () => I({ dash: true, x: 1, y: -1 }));
  assert.ok(p.slide && p.vx > C.DASH_V * 0.8);
  run(s, w, 2, k => I({ y: -1, x: 1, jump: k === 1 }));
  assert.ok(p.vx >= C.HYPER_VX - 1e-6 && p.vy > 0, `vx ${p.vx}`);
});

test('picada: dash ↓ en el aire cae a POUND_V y rebota si se mantiene SALTO', () => {
  const { s, w } = flat();
  const p = s.pl[0];
  Object.assign(p, { y: 8, ground: false });
  run(s, w, 1, () => I({ dash: true, y: -1 }));
  assert.ok(p.pound && p.vy === -C.POUND_V, JSON.stringify({ pound: p.pound, vy: p.vy, y: p.y, g: p.ground }));
  let up = 0;
  run(s, w, 40, () => { up = Math.max(up, p.vy); return I({ jump: true }); });
  assert.ok(p.poundLand > 0 && up > 2 * C.JUMP_H / C.JUMP_T, `rebote a ${up}`);
});

test('empuje: crece con el %, FRÁGIL lo multiplica y PIES DE PLOMO lo achica; tu explosión no te daña', () => {
  const v = (pre) => {
    const { s, w } = flat();
    const p = s.pl[1];
    pre(p, s);
    hurt(s, w, p, { dmg: 10, kb: 8, kg: 12, dx: 1, dy: 0, by: 0 });
    return Math.hypot(p.vx, p.vy);
  };
  const v0 = v(() => {}), v100 = v(p => p.dmg = 100), vf = v((p, s) => p.fragT = s.t + 100), vl = v((p, s) => p.leadT = s.t + 100);
  assert.ok(v100 > v0 * 1.8, `${v0} → ${v100}`);
  assert.ok(Math.abs(vf / v0 - C.FRAG_K) < 1e-6 && Math.abs(vl / v0 - C.LEAD_K) < 1e-6);
  const { s, w } = flat();
  const me = s.pl[0];
  boom(s, w, me.x, me.y - 0.2, { r: 2, dmg: 20, kb: 10, kg: 10, carve: 0 }, me.id);
  assert.equal(me.dmg, 0);
  assert.ok(me.vy > 5, 'rocket jump');
});

test('puntos: el KO es de quien tocó último; caerse solo es −1', () => {
  const { s, w } = newState('islas', 3, [{ name: 'A', ch: 'bombin' }, { name: 'B', ch: 'lia' }]);
  for (let k = 0; k < GO * HZ + 2; k++) step(s, w, []);
  const [a, b] = s.pl;
  b.invT = NEVER;
  hurt(s, w, b, { dmg: 5, kb: 1, kg: 0, dx: 0, dy: 1, by: a.id });
  b.y = -10;
  step(s, w, []);
  assert.equal(a.score, 1);
  assert.equal(b.alive, false);
  a.y = -10;
  step(s, w, []);
  assert.equal(a.score, 0);
  assert.equal(standings(s).order[0].id, 0);
});

test('cartas: cuesta maná, la usada vuelve al final del mazo y entra la siguiente', () => {
  const { s, w } = newState('islas', 4, [{ name: 'A', ch: 'bombin' }, { name: 'B', ch: 'lia' }]);
  for (let k = 0; k < GO * HZ + 2; k++) step(s, w, []);
  const p = s.pl[0], first = p.hand[0], next = p.queue[0], m0 = p.mana;
  cast(s, w, p, 0, I({ ax: 1, ay: 0.5 }));
  assert.equal(p.hand[0], next);
  assert.equal(p.queue.at(-1), first);
  assert.equal(p.mana, m0 - CARD[first].cost);
  assert.ok(s.pr.length > 0 || s.props.length > 0 || s.beams.length > 0);
});

test('cada carta se puede lanzar sin romper nada', () => {
  for (const c of CARDS) {
    const { s, w } = newState('islas', 5, [{ name: 'A', ch: 'bombin' }, { name: 'B', ch: 'lia' }]);
    for (let k = 0; k < GO * HZ + 2; k++) step(s, w, []);
    const p = s.pl[0];
    p.bonus = c.id;
    step(s, w, [I({ cast: 4, ax: 0.7, ay: 0.4 })]);
    for (let k = 0; k < 240; k++) step(s, w, []);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(s.pl[1].x), c.id);
  }
});

test('ultis: cada personaje la puede usar y termina', () => {
  for (const ch of CHARS) {
    const { s, w } = newState('islas', 6, [{ name: 'A', ch: ch.id }, { name: 'B', ch: 'muu' }, { name: 'C', ch: 'kunai' }]);
    for (let k = 0; k < GO * HZ + 2; k++) step(s, w, []);
    const p = s.pl[0];
    s.pl[1].x = p.x + 3, s.pl[1].y = p.y, s.pl[2].x = p.x - 4, s.pl[2].y = p.y;
    p.ulti = 100;
    step(s, w, [I({ ulti: true, ax: 1, ay: 0 })]);
    assert.ok(p.u, ch.id + ' arrancó');
    let k = 0;
    while ((p.u || !p.alive) && k++ < 700) step(s, w, [I({ ulti: k % 30 === 0, ax: 1, ay: 0 })]);
    assert.equal(p.u, null, ch.id + ' terminó');
  }
});

test('determinismo: misma semilla y mismas entradas dan el mismo estado; el estado va y vuelve por JSON', () => {
  const play = () => {
    const { s, w } = newState('volcan', 77, CHARS.slice(0, 4).map((c, k) => ({ name: 'B' + k, ch: c.id, bot: 3 })));
    const mem = s.pl.map(p => newMem(p.id));
    for (let k = 0; k < 1500; k++) step(s, w, s.pl.map(p => botInput(s, w, p, mem[p.id])));
    return { s, w };
  };
  const a = play(), b = play();
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
  assert.deepEqual(a.w.T.ops, b.w.T.ops);
  assert.deepEqual(JSON.parse(JSON.stringify(a.s)), a.s);
});

test('bots: una partida corta en cada mapa termina sin errores y con KOs', () => {
  let kos = 0;
  for (const m of MAPS) {
    const { s, w } = newState(m.id, 9, CHARS.slice(0, 4).map((c, k) => ({ name: 'B' + k, ch: c.id, bot: 3 })), { time: 40, teams: false, friendly: false, crates: 8, infinite: false, startDmg: 0 });
    const mem = s.pl.map(p => newMem(p.id));
    while (!s.over && s.t < 200 * HZ) { step(s, w, s.pl.map(p => botInput(s, w, p, mem[p.id]))); kos += s.ev.filter(e => e.k === 'ko').length; }
    assert.ok(s.over, m.id + ' terminó');
  }
  assert.ok(kos >= 5, `KOs: ${kos}`);
});

test('red: el estado compacto y las entradas van y vuelven', () => {
  const { s, w } = newState('islas', 8, [{ name: 'A', ch: 'bombin' }, { name: 'B', ch: 'lia' }, { name: 'C', ch: 'turbo', bot: 2 }]);
  const mem = s.pl.map(p => newMem(p.id));
  for (let k = 0; k < 600; k++) step(s, w, s.pl.map(p => botInput(s, w, p, { ...mem[p.id] })));
  const msg = JSON.parse(JSON.stringify(packState(s, [], [])));
  const { s: g } = newState('islas', 8, [{ name: 'A', ch: 'bombin' }, { name: 'B', ch: 'lia' }, { name: 'C', ch: 'turbo', bot: 2 }]);
  applyState(g, msg);
  for (const p of s.pl) {
    const q = g.pl[p.id];
    assert.ok(Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01 && p.alive === q.alive && Math.round(p.dmg) === Math.round(q.dmg));
    assert.deepEqual(q.hand, p.hand);
  }
  const i = { x: 0.5, y: -1, jump: true, dash: false, hook: true, ulti: false, cast: 2, ax: 0.33, ay: -0.5 };
  assert.deepEqual(unpackInput(JSON.parse(JSON.stringify(packInput(i)))), i);
  assert.equal(unpackInput(['x', 1]), null);
  const full = unpackFull(JSON.parse(JSON.stringify(packFull(s.pl[0]))));
  assert.equal(full.pressT === NEVER || full.pressT > 0, true);
});

test('desatascar: un personaje metido en la tierra sale al lugar libre más cercano', () => {
  const { s, w } = newState('islas', 2, [{ name: 'A', ch: 'bombin' }, { name: 'B', ch: 'lia' }]);
  for (let k = 0; k < GO * HZ + 2; k++) step(s, w, []);
  const p = s.pl[0];
  p.x = 40, p.y = 12, p.cloudT = NEVER; // adentro de la isla del centro
  step(s, w, []);
  const T = w.T, free = (() => { for (let i = Math.floor((p.x - HW) / CELL + 1e-6); i <= Math.floor((p.x + HW) / CELL - 1e-6); i++) for (let j = Math.floor(p.y / CELL + 1e-6); j <= Math.floor((p.y + H) / CELL - 1e-6); j++) if (cell(T, i, j)) return false; return true; })();
  assert.ok(free, `quedó en ${p.x}, ${p.y}`);
});
