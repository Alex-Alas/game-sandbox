// Tests de la simulación de GRISÚ (node --test, sin compilar): determinismo, JSON, alturas de salto exactas, coyote y
// buffer en los cuadros justos, el dash-corte, la guardia y el parry, el pogo y la liga.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/sim/params.ts';
import { HZ, CELL, ROCK, NOINPUT, A } from '../src/sim/state.ts';
import { buildPatio } from '../src/sim/patio.ts';
import { init, step, newPlayer } from '../src/sim/sim.ts';
import { freshDummy, ATK_W } from '../src/sim/foes.ts';
import { dashSpeed, magnet } from '../src/sim/mech.ts';

const I = (o = {}) => ({ ...NOINPUT, ...o });
// Un mundo chico: piso en y = 10 y una zona del tipo pedido; dummies opcionales
function flat(kind = 'pozo', dummies = [], c = DEFAULTS, extra = () => {}) {
  const cols = 200, rows = 80, g = new Uint8Array(cols * rows);
  const rect = (x0, y0, x1, y1) => { for (let j = Math.round(y0 / CELL); j < Math.round(y1 / CELL); j++) for (let i = Math.round(x0 / CELL); i < Math.round(x1 / CELL); i++) g[j * cols + i] = ROCK; };
  rect(0, 6, 100, 10);
  extra(rect);
  return { cols, rows, g, zones: [{ id: kind, x0: 0, y0: 6, x1: 100, y1: 40, spawn: [20, 10] }], dummies, c };
}
const run = (s, w, n, inp = I()) => { for (let k = 0; k < n; k++) step(s, w, [typeof inp === 'function' ? inp(k) : inp]); };

test('misma semilla y entradas: mismo estado; ida y vuelta por JSON', () => {
  const w = buildPatio();
  const play = (s) => run(s, w, 900, (k) => I({ jump: k % 50 < 2, dir: k % 37 < 2, ax: k % 74 < 37 ? 1 : 0.3, ay: k % 3 - 1, hold: k % 120 > 100, tx: 30, ty: 18 }));
  for (const cls of ['esgrimista', 'estibador']) for (const z of [0, 1, 2]) {
    const a = init(w, cls, z, 7), b = init(w, cls, z, 7);
    play(a); play(b);
    assert.deepEqual(a, b);
    const c = JSON.parse(JSON.stringify(a));
    run(a, w, 120); run(c, w, 120);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(c)));
  }
});

test('el salto llega a JUMP_H en JUMP_T y el doble salto suma JUMP2_H', () => {
  const w = flat();
  const s = init(w); run(s, w, 30);
  const p = s.pl[0];
  assert.equal(p.ground, true);
  let top = 0, tTop = 0;
  run(s, w, 1, I({ jump: true }));
  for (let k = 1; k < 60; k++) { run(s, w, 1); if (p.y - 10 > top) top = p.y - 10, tTop = k; }
  assert.ok(top <= DEFAULTS.JUMP_H + 1e-9 && top > DEFAULTS.JUMP_H - 1e-3, `altura ${top}`);
  assert.ok(Math.abs(tTop / HZ + 1 / HZ - DEFAULTS.JUMP_T) <= 1 / HZ + 1e-9, `subida ${tTop}`);
  // doble salto en la cima
  const s2 = init(w); run(s2, w, 30);
  const q = s2.pl[0];
  run(s2, w, 1, I({ jump: true }));
  run(s2, w, Math.round(DEFAULTS.JUMP_T * HZ) - 1);
  const y0 = q.y;
  run(s2, w, 1, I({ jump: true }));
  let top2 = 0;
  for (let k = 0; k < 60; k++) { run(s2, w, 1); top2 = Math.max(top2, q.y - y0); }
  assert.ok(Math.abs(top2 - DEFAULTS.JUMP2_H) < 0.02, `doble ${top2}`);
});

test('coyote: se salta COYOTE cuadros después de dejar el suelo, no uno más', () => {
  const c = { ...DEFAULTS, RUN: 6 };
  for (const [late, ok] of [[DEFAULTS.COYOTE, true], [DEFAULTS.COYOTE + 1, false]]) {
    const w = { ...flat('pasillo', [], c), zones: [{ id: 'pasillo', x0: 0, y0: 6, x1: 100, y1: 40, spawn: [20, 10] }] };
    // un borde en x = 30: el piso sigue solo hasta ahí
    for (let j = 0; j < w.rows; j++) for (let i = Math.round(30 / CELL); i < w.cols; i++) w.g[j * w.cols + i] = 0;
    const s = init(w); const p = s.pl[0];
    let left = -1;
    for (let k = 0; k < 300 && left < 0; k++) { run(s, w, 1); if (!p.ground && p.x > 29) left = s.t; }
    run(s, w, late - 1);
    p.air = 0;   // sin doble salto: solo cuenta el coyote
    const vy = p.vy;
    run(s, w, 1, I({ jump: true }));
    assert.equal(p.vy > 0, ok, `cuadro ${late}: vy ${vy} → ${p.vy}`);
  }
});

test('buffer: un toque BUFFER cuadros antes de aterrizar salta al tocar el suelo', () => {
  const w = flat();
  for (const [early, ok] of [[DEFAULTS.BUFFER, true], [DEFAULTS.BUFFER + 2, false]]) {
    const s = init(w); const p = s.pl[0];
    p.y = 14; p.ground = false; p.air = 0;
    // simular hasta saber en qué cuadro aterriza
    const probe = JSON.parse(JSON.stringify(s));
    let land = 0;
    for (let k = 1; k < 200; k++) { run(probe, w, 1); if (probe.pl[0].ground) { land = k; break; } }
    run(s, w, land - early);
    run(s, w, 1, I({ jump: true }));
    run(s, w, early + 1);
    assert.equal(p.vy > 0 || p.y > 10.01, ok, `${early} cuadros antes`);
  }
});

test('el dash recorre DASH_D en DASH_F cuadros y es invulnerable al empezar', () => {
  const w = flat();
  const s = init(w); run(s, w, 30);
  const p = s.pl[0], x0 = p.x;
  run(s, w, 1, I({ dir: true, ax: 1, ay: 0 }));
  assert.equal(p.act, A.DASH);
  run(s, w, DEFAULTS.DASH_F - 1);
  assert.ok(Math.abs(p.x - x0 - DEFAULTS.DASH_D) < 1e-6, `recorrió ${p.x - x0}`);
  run(s, w, 1);
  assert.equal(p.act, A.NONE);
  assert.ok(Math.abs(p.vx - dashSpeed(w) * DEFAULTS.DASH_KEEP) < 1e-6);
  assert.ok(p.charge < DEFAULTS.DASH_N);
});

test('el dash corta a lo que barre y matar devuelve la carga; el imán apunta al enemigo', () => {
  const w = flat('pozo', [{ x: 24, y: 10, kind: 'liviano' }]);
  const s = init(w); run(s, w, 30);
  const p = s.pl[0];
  s.d[0].hp = 5;
  run(s, w, 1, I({ dir: true, ax: 1, ay: 0 }));
  run(s, w, DEFAULTS.DASH_F);
  assert.ok(s.d[0].hp <= 0, 'lo rompió');
  assert.ok(p.charge > DEFAULTS.DASH_N - 1 - 1e-9, 'devolvió la carga');
  // imán: 12° de desvío (dentro de ±MAG_DEG) apunta al dummy; 40°, no
  const s2 = init(w); run(s2, w, 30);
  const q = s2.pl[0], a = 12 * Math.PI / 180, b = 40 * Math.PI / 180;
  const [mx, my] = magnet(s2, w, q, Math.cos(a), Math.sin(a));
  assert.ok(my < 0 && mx > 0.99, `apunta al dummy: ${mx}, ${my}`);
  const [nx, ny] = magnet(s2, w, q, Math.cos(b), Math.sin(b));
  assert.ok(Math.abs(nx - Math.cos(b)) < 1e-9 && Math.abs(ny - Math.sin(b)) < 1e-9);
});

test('parry: perfecto en los primeros PARRY_PERFECT cuadros de la guardia, bueno después y guardia al final', () => {
  const results = {};
  for (const lead of [1, DEFAULTS.PARRY_PERFECT - 1, DEFAULTS.PARRY_PERFECT, DEFAULTS.PARRY_PERFECT + DEFAULTS.PARRY_GOOD - 1, DEFAULTS.PARRY_PERFECT + DEFAULTS.PARRY_GOOD + 3]) {
    const c = { ...DEFAULTS, ATK_RED: 0, ATK_EVERY: 99, WALK_AUTO: 0 };
    const w = flat('sala', [{ x: 22, y: 10, kind: 'atacante', face: -1 }], c);
    const s = init(w); const p = s.pl[0];
    s.d[0].next = 1e9;
    run(s, w, 30);
    // el ataque empieza ahora: pega en el cuadro ATK_W.on (si el héroe está a su alcance)
    const d = s.d[0];
    d.atk = 1, d.atkT = s.t + 1, d.atkHit = false, d.face = -1;
    const hitAt = d.atkT + ATK_W.on;
    run(s, w, hitAt - lead - s.t - 1);
    const hp0 = p.hp;
    run(s, w, lead + 2, I({ hold: true, tx: 25, ty: 11 }));
    results[lead] = { stun: s.t < d.stunT, dmg: hp0 - p.hp, parried: p.parried };
  }
  const P = DEFAULTS.PARRY_PERFECT, G = DEFAULTS.PARRY_GOOD;
  assert.ok(results[1].stun && results[1].dmg === 0, JSON.stringify(results));
  assert.ok(results[P - 1].stun && results[P - 1].dmg === 0);
  assert.ok(!results[P].stun && Math.abs(results[P].dmg - DEFAULTS.ATK_DMG * (1 - DEFAULTS.GOOD_BLOCK)) < 1e-6);
  assert.ok(!results[P + G - 1].stun && results[P + G - 1].dmg > 0);
  assert.ok(Math.abs(results[P + G + 3].dmg - DEFAULTS.ATK_DMG * (1 - DEFAULTS.GUARD_BLOCK)) < 1e-6);
});

test('el pogo rebota POGO_H sobre una válvula y recupera el salto en el aire', () => {
  const w = flat('pozo', [{ x: 20, y: 14, kind: 'valvula' }]);
  const s = init(w); s.pl[0] = newPlayer(0, 'estibador', 20, 20, DEFAULTS);
  const p = s.pl[0];
  p.air = 0;
  run(s, w, 10);
  run(s, w, 1, I({ dir: true, ax: 0, ay: -1 }));
  assert.equal(p.act, A.DIVE);
  let bounced = -1;
  for (let k = 0; k < 60; k++) { run(s, w, 1); if (s.ev.some(e => e.k === 'pogo')) { bounced = p.y; break; } }
  assert.ok(bounced > 0, 'rebotó');
  assert.equal(p.air, DEFAULTS.AIR_JUMPS);
  let top = bounced;
  for (let k = 0; k < 80; k++) { run(s, w, 1); top = Math.max(top, p.y); }
  assert.ok(Math.abs(top - bounced - DEFAULTS.POGO_H) < 0.25, `rebote ${top - bounced}`);
});

test('la liga tira hacia el ancla con tope HOOK_V y se suelta al soltar', () => {
  const w = flat('pozo', [], DEFAULTS, (rect) => rect(26, 16, 30, 17));
  const s = init(w); s.pl[0] = newPlayer(0, 'estibador', 20, 10, DEFAULTS);
  const p = s.pl[0];
  run(s, w, 5);
  run(s, w, 1, I({ hold: true, tx: 27, ty: 16 }));
  assert.ok(p.hook, 'disparó');
  let vmax = 0;
  for (let k = 0; k < 40; k++) {
    run(s, w, 1, I({ hold: true, tx: 27, ty: 16 }));
    if (!p.hook) break;
    const ex = p.hook.x - p.x, ey = p.hook.y - p.y - 1.1, d = Math.hypot(ex, ey);
    vmax = Math.max(vmax, (p.vx * ex + p.vy * ey) / d);   // rapidez radial hacia el ancla
  }
  assert.ok(p.x > 22 && p.y > 11, `lo acercó: ${p.x}, ${p.y}`);
  assert.ok(vmax < DEFAULTS.HOOK_V + 1, `tope ${vmax}`);
  run(s, w, 1);
  assert.equal(p.hook, null);
});

test('la liga a un liviano lo trae (se reparte por masa)', () => {
  const w = flat('pozo', [{ x: 27, y: 10, kind: 'liviano' }]);
  const s = init(w); s.pl[0] = newPlayer(0, 'estibador', 20, 10, DEFAULTS);
  const p = s.pl[0];
  run(s, w, 10);
  const x0 = p.x;
  for (let k = 0; k < 30; k++) run(s, w, 1, I({ hold: true, tx: 27, ty: 10.5 }));
  assert.ok(s.d[0].x < 25, `vino: ${s.d[0].x}`);
  assert.ok(Math.abs(p.x - x0) < 1.5, 'el Estibador casi no se mueve');
});

test('caer a un foso del PASILLO cuesta PIT_DMG y vuelve al suelo firme', () => {
  const w = buildPatio();
  const s = init(w, 'esgrimista', 0); const p = s.pl[0];
  let pit = false;
  for (let k = 0; k < 400 && !pit; k++) { run(s, w, 1); pit = s.ev.some(e => e.k === 'pit'); }
  assert.ok(pit);
  assert.equal(p.hp, DEFAULTS.HP - DEFAULTS.PIT_DMG);
  assert.ok(p.y >= 10 - 1e-6 && p.x < 24);
});
