// Pruebas de la sim de BANANAZO (node --test, `npm test`): cada módulo se desactiva con su solución y sin errores, las
// acciones equivocadas cuestan un error, el reloj y los errores hacen explotar, los de caos castigan si nadie los atiende,
// las tablas del manual son coherentes y las 30 bombas de la campaña se desactivan con el piloto automático a tiempo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBomb, step, nextAct, allowed, speedOf } from '../src/sim/bomb.ts';
import { KINDS, isChaos, solveMod, calcResult, wireAnswer, mazePath } from '../src/sim/mods.ts';
import { tables, open, MAZE_N } from '../src/sim/tables.ts';
import { CAMPAIGN, LEVEL_NAMES, endless, custom, CUSTOM_DEFAULT, known, news } from '../src/sim/levels.ts';
import { hears, sees, ROLES } from '../src/sim/const.ts';

const DT = 1 / 30;
const spec = (mods, o = {}) => ({ mods, time: 600, miss: 2, hz: [], env: 'combi', chaos: 1, ...o });
const J = (o) => JSON.parse(JSON.stringify(o));
// Juega con el piloto automático: una acción cada `gap` s (como un equipo que se coordina rapidísimo)
function autoplay(b, gap = 0.5, maxT = 5000) {
  const evs = [];
  let wait = 0;
  for (let t = 0; t < maxT && !b.over; t += DT) {
    const acts = [];
    if ((wait -= DT) <= 0) { const a = nextAct(b); if (a) acts.push(a); wait = gap; }
    evs.push(...step(b, DT, acts));
  }
  return evs;
}

test('cada módulo normal se desactiva con su solución, sin errores, en 300 semillas', () => {
  for (const k of KINDS.filter(k => !isChaos(k))) {
    for (let seed = 1; seed <= 300; seed++) {
      const b = newBomb(spec([k]), seed * 7919);
      const tb = tables(b.seed);
      const acts = solveMod(b.mods[0], tb).map(a => ({ m: 0, ...a }));
      assert.ok(acts.length > 0, `${k} semilla ${seed}: sin solución`);
      const evs = step(b, DT, acts);
      assert.equal(b.strikes, 0, `${k} semilla ${seed}: ${JSON.stringify(evs.filter(e => e.e === 'strike'))}`);
      assert.equal(b.over, 1, `${k} semilla ${seed}: no se desactivó`);
      assert.ok(evs.some(e => e.e === 'ok' && e.m === 0));
    }
  }
});

test('un error por acción equivocada (y el módulo sigue vivo)', () => {
  const b = newBomb(spec(['cables', 'calc', 'dir']), 42);
  const tb = tables(b.seed);
  const wrong = b.mods[0].wires.findIndex((_, i) => i !== wireAnswer(b.mods[0], tb));
  step(b, DT, [{ m: 0, a: 'cut', v: wrong }]);
  assert.equal(b.strikes, 1);
  assert.equal(b.mods[0].done, false);
  // la cuenta mal: error y se borra lo tecleado
  const bad = String(calcResult(b.mods[1]) + 1);
  step(b, DT, [...[...bad].map(d => ({ m: 1, a: 'key', v: +d })), { m: 1, a: 'ok' }]);
  assert.equal(b.strikes, 2);
  assert.equal(b.mods[1].typed, '');
  assert.ok(speedOf(b) > 1, 'cada error acelera el reloj');
  // con miss = 2, el tercero explota
  const d = b.mods[2], v = (tb.dir[d.n[0] - 1][d.led[0]] + 1) % 4;
  const evs = step(b, DT, [{ m: 2, a: 'dir', v }]);
  assert.equal(b.over, -1);
  assert.equal(b.why, 'errores');
  assert.ok(evs.some(e => e.e === 'boom'));
  // explotada, ya no hace nada
  assert.deepEqual(step(b, DT, [{ m: 0, a: 'cut', v: 0 }]), []);
});

test('el reloj explota a tiempo y acelera con los errores', () => {
  const b = newBomb(spec(['cables'], { time: 10, miss: 3 }), 5);
  for (let k = 0; k < 9 / DT; k++) step(b, DT);
  assert.equal(b.over, 0);
  for (let k = 0; k < 2 / DT; k++) step(b, DT);
  assert.equal(b.over, -1);
  assert.equal(b.why, 'tiempo');
  const c = newBomb(spec(['cables'], { time: 10, miss: 3 }), 5);
  step(c, DT, [{ m: 0, a: 'cut', v: (wireAnswer(c.mods[0], tables(5)) + 1) % c.mods[0].wires.length }]);
  for (let k = 0; k < 9 / DT; k++) step(c, DT);
  assert.equal(c.over, -1, 'con un error, 10 s duran menos de 9');
});

test('la bomba es determinista y va y vuelve por JSON', () => {
  const a = newBomb(CAMPAIGN[25], 1234), b = newBomb(CAMPAIGN[25], 1234);
  assert.deepEqual(a, b);
  assert.deepEqual(J(a), a);
  autoplay(a, 0.4, 60);
  const c = J(a);
  for (let k = 0; k < 300; k++) {
    const act = k % 7 === 0 ? nextAct(a) : null;
    const ea = step(a, DT, act ? [act] : []), ec = step(c, DT, act ? [act] : []);
    assert.deepEqual(ec, ea);
  }
  assert.deepEqual(c, a);
});

test('PRESIÓN: si nadie bombea, error; bombeando, nunca', () => {
  const b = newBomb(spec(['cables', 'press']), 9);
  let strikes = 0;
  for (let t = 0; t < 120; t += DT) strikes += step(b, DT).filter(e => e.e === 'strike').length;
  assert.ok(strikes >= 2, `strikes ${strikes}`);
  const c = newBomb(spec(['cables', 'press'], { time: 900 }), 9);
  for (let t = 0, w = 0; t < 300; t += DT) {
    const acts = (w -= DT) <= 0 && c.mods[1].p > 0.5 ? (w = 0.3, [{ m: 1, a: 'pump' }]) : [];
    step(c, DT, acts);
  }
  assert.equal(c.strikes, 0);
});

test('ALARMA: suena, si no se apagan los que queman es error; apagándolos, nunca', () => {
  const b = newBomb(spec(['cables', 'alarm'], { miss: 5 }), 3);
  const evs = [];
  for (let t = 0; t < 100; t += DT) evs.push(...step(b, DT));
  assert.ok(evs.some(e => e.e === 'alarm' && e.v === 1));
  assert.ok(b.strikes >= 1);
  const c = newBomb(spec(['cables', 'alarm'], { time: 900 }), 3);
  let rang = 0;
  for (let t = 0; t < 400; t += DT) {
    const s = solveMod(c.mods[1], tables(3));
    rang += step(c, DT, s.length ? [{ m: 1, ...s[0] }] : []).filter(e => e.e === 'alarm' && e.v === 1).length;
  }
  assert.ok(rang >= 3);
  assert.equal(c.strikes, 0);
});

test('peligros: baches, radio (la apaga el SORDO) y apagones', () => {
  const b = newBomb(spec(['cables'], { hz: ['bache', 'radio', 'apagon'], time: 900 }), 77);
  const evs = [];
  for (let t = 0; t < 200; t += DT) evs.push(...step(b, DT, b.hz.radio && t % 20 > 15 ? [{ m: -1, a: 'radio' }] : []));
  for (const e of ['bump', 'dark']) assert.ok(evs.some(x => x.e === e), e);
  assert.ok(evs.some(x => x.e === 'radio' && x.v === 1) && evs.some(x => x.e === 'radio' && x.v === 0));
  assert.ok(allowed('sordo', { m: -1, a: 'radio' }) && !allowed('ciego', { m: -1, a: 'radio' }));
  assert.ok(allowed('ciego', { m: 0, a: 'cut' }) && !allowed('sordo', { m: 0, a: 'cut' }) && !allowed('mudo', { m: 0, a: 'cut' }));
});

test('las tablas del manual: laberintos conexos, morse distinto, ruleta pareja', () => {
  for (let seed = 1; seed < 200; seed++) {
    const tb = tables(seed * 31);
    for (const mz of tb.maze) {
      for (let i = 0; i < MAZE_N * MAZE_N; i++) {
        const p = mazePath(mz, 0, 0, i % MAZE_N, (i / MAZE_N) | 0);
        let x = 0, y = 0;
        for (const d of p) { assert.ok(open(mz, x, y, d)); x += [0, 1, 0, -1][d]; y += [-1, 0, 1, 0][d]; }
        assert.deepEqual([x, y], [i % MAZE_N, (i / MAZE_N) | 0]);
      }
    }
    assert.equal(new Set(tb.morse).size, 10);
    for (let c = 0; c < 4; c++) assert.equal(tb.dial.filter(x => x === c).length, 3);
    for (const row of tb.calc) assert.notEqual(row[0], row[1]);
  }
  assert.strictEqual(tables(5), tables(5), 'memo');
});

test('la campaña: 30 niveles con nombre, un módulo nuevo por vez y todos se desactivan con el piloto automático', () => {
  assert.equal(CAMPAIGN.length, 30);
  assert.equal(LEVEL_NAMES.length, 30);
  assert.deepEqual(known(29).sort(), KINDS.slice().sort(), 'para el final aparecieron todos');
  for (let n = 0; n < 30; n++) {
    assert.ok(news(n).length <= 1, `nivel ${n + 1}: ${news(n)}`);
    for (const seed of [1, 2, 3]) {
      const b = newBomb(CAMPAIGN[n], seed * 1000 + n);
      autoplay(b, 0.5);
      assert.equal(b.over, 1, `nivel ${n + 1} semilla ${seed}: ${b.why}, ${b.strikes} errores`);
      assert.ok(b.time > CAMPAIGN[n].time * 0.3, `nivel ${n + 1}: le sobra poco tiempo al piloto automático (${b.time.toFixed(0)} s)`);
    }
  }
});

test('INFINITO y PERSONALIZADO arman bombas válidas', () => {
  for (let w = 0; w < 20; w++) {
    const s = endless(w, 99);
    assert.ok(s.mods.length >= 1 && s.mods.length <= 6);
    assert.ok(s.mods.some(k => !isChaos(k)));
    const b = newBomb(s, w);
    autoplay(b, 0.5);
    assert.equal(b.over, 1, `infinito ${w}`);
  }
  assert.ok(endless(9, 1).mods.length > endless(0, 1).mods.length);
  const c = custom({ ...CUSTOM_DEFAULT, mods: ['press', 'alarm'], n: 4 }, 5);
  assert.ok(c.mods.some(k => !isChaos(k)), 'solo caos no vale: agrega uno normal');
  const d = custom({ ...CUSTOM_DEFAULT, n: 99, time: -4, miss: 50 }, 5);
  assert.ok(d.mods.length === 6 && d.time >= 30 && d.miss <= 5);
});

test('quién oye y quién ve a quién', () => {
  const H = ROLES.map(l => ROLES.map(s => hears(l, s) ? 1 : 0));
  // filas = el que escucha (ciego, sordo, mudo); columnas = el que habla
  assert.deepEqual(H, [[0, 1, 0], [0, 0, 0], [1, 1, 0]]);
  const V = ROLES.map(v => ROLES.map(a => sees(v, a) ? 1 : 0));
  assert.deepEqual(V, [[0, 0, 0], [1, 0, 1], [0, 1, 0]]);
});
