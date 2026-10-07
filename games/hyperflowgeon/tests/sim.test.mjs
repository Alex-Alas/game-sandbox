// node --test: Node 22 importa los .ts directo (sin tipos). Correr con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { init, step } from '../src/sim/sim.ts';
import { DEFAULTS as C } from '../src/sim/params.ts';
import { PATIO } from '../src/patio.ts';

const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
// inp(t) da la entrada del cuadro t (1, 2, …); devuelve una copia del estado tras cada cuadro
function run(w, n, inp) {
  const s = init(w), out = [];
  for (let k = 0; k < n; k++) step(s, w, inp(s.t + 1), C), out.push(structuredClone(s));
  return out;
}

test('coyote: se salta hasta COYOTE cuadros en el aire después de dejar el suelo', () => {
  const w = { spawn: [-1, 0], rects: [R(-20, -1, 0, 0)] }; // borde en x = 0, vacío a la derecha
  const g = run(w, 120, () => ({ x: 1, jump: false })).findLast(s => s.p.ground).t;
  for (let n = 1; n <= C.COYOTE + 2; n++) {
    const k = g + 1 + n; // SALTO apretado viendo el cuadro n en el aire
    const s = run(w, k, t => ({ x: 1, jump: t === k })).at(-1);
    assert.equal(s.p.vy > 0, n <= C.COYOTE, `cuadro ${n} en el aire`);
  }
});

test('buffer: un SALTO hasta BUFFER cuadros antes de aterrizar salta al aterrizar', () => {
  const w = { spawn: [0, 4], rects: [R(-20, -1, 20, 0)] };
  const L = run(w, 120, () => ({ x: 0, jump: false })).find(s => s.p.ground).t;
  for (let n = 1; n <= C.BUFFER + 2; n++) {
    const k = L + 1 - n; // SALTO apretado viendo el n-ésimo cuadro antes de tocar el suelo
    const s = run(w, L + 1, t => ({ x: 0, jump: t === k })).at(-1);
    assert.equal(s.p.vy > 0, n <= C.BUFFER, `${n} cuadros antes`);
  }
});

test('salto variable: mantener llega a JUMP_H y un toque queda corto', () => {
  const w = { spawn: [0, 0], rects: [R(-20, -1, 20, 0)] };
  const top = held => Math.max(...run(w, 90, t => ({ x: 0, jump: t >= 2 && t < 2 + held })).map(s => s.p.y));
  assert.ok(Math.abs(top(60) - C.JUMP_H) < 0.01, `mantener: ${top(60)}`);
  assert.ok(top(1) < C.JUMP_H * 0.5, `toque: ${top(1)}`);
});

test('el impulso en el aire se conserva sin entrada', () => {
  const w = { spawn: [0, 10], rects: [] };
  const s = init(w);
  s.p.vx = 20;
  for (let k = 0; k < 30; k++) step(s, w, { x: 0, jump: false }, C);
  assert.equal(s.p.vx, 20);
});

test('determinismo: mismas entradas ⇒ mismo estado; serializar a mitad no cambia nada', () => {
  let seed = 1;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const inputs = Array.from({ length: 1200 }, () => ({ x: rnd() * 2 - 1, jump: rnd() < 0.3, hook: rnd() < 0.6, ax: rnd() * 2 - 1, ay: rnd() * 2 - 1 }));
  const play = (s, from, to) => { for (let k = from; k < to; k++) step(s, PATIO, inputs[k], C); return s; };
  const end = JSON.stringify(play(init(PATIO), 0, 1200));
  assert.equal(JSON.stringify(play(init(PATIO), 0, 1200)), end);
  const mid = JSON.parse(JSON.stringify(play(init(PATIO), 0, 600)));
  assert.equal(JSON.stringify(play(mid, 600, 1200)), end);
});

// Liga: sin gravedad (JUMP_H = 0) para aislarla. El héroe va a 20 m/s por el aire y engancha algo a 10 m de la mano.
const G0 = { ...C, JUMP_H: 0 };
function hooked(rects, aim, vx = 20, c = G0) {
  const w = { spawn: [0, 0], rects }, s = init(w);
  s.p.vx = vx;
  step(s, w, { x: 0, jump: false, hook: true, ax: aim[0], ay: aim[1] }, c);
  return { s, w };
}
const speed = p => Math.sqrt(p.vx * p.vx + p.vy * p.vy);

test('liga: la rapidez cambia según el ángulo (a favor acelera, en contra frena, de costado casi nada)', () => {
  const ahead = speed(hooked([R(10, -50, 12, 50)], [1, 0]).s.p);
  const behind = speed(hooked([R(-12, -50, -10, 50)], [-1, 0]).s.p);
  const side = speed(hooked([R(-50, 11.2, 50, 12)], [0, 1]).s.p); // techo a 10 m de la mano
  assert.ok(ahead > 20 && behind < 20, `a favor ${ahead}, en contra ${behind}`);
  assert.ok(Math.abs(side - 20) < (ahead - 20) / 2, `de costado ${side}`);
});

test('liga: en contra frena, te devuelve y no te acerca más rápido que HOOK_V', () => {
  const c = { ...G0, HOOK_V: 22 }; // un tope que la liga alcanza en 10 m, sea cual sea la calibración
  const { s, w } = hooked([R(-12, -50, -10, 50)], [-1, 0], 20, { ...c, HOOK_DAMP: 0 });
  let min = 0;
  for (let k = 0; k < 120 && s.p.hook; k++) step(s, w, { x: 0, jump: false, hook: true }, c), min = Math.min(min, s.p.vx);
  assert.ok(min < -c.HOOK_V + 0.01 && min >= -c.HOOK_V - 1e-9, `vuelta a ${min}`);
});

test('liga: es una fuerza central (conserva el momento angular alrededor del ancla)', () => {
  const c = { ...G0, HOOK_DAMP: 0, HOOK_V: 1000 };
  const { s, w } = hooked([R(-0.1, 11.2, 0.1, 11.4)], [0, 1], 37, c);
  const L = p => (p.x - p.hook.x) * p.vy - (p.y + 1.2 - p.hook.y) * p.vx;
  const L0 = L(s.p);
  for (let k = 0; k < 300; k++) step(s, w, { x: 0, jump: false, hook: true }, c);
  assert.ok(s.p.hook && Math.abs(L(s.p) - L0) < Math.abs(L0) * 1e-9, `L ${L0} → ${L(s.p)}`);
});

test('liga: soltar GARFIO conserva la velocidad; SALTO enganchado suelta y suma HOOK_JUMP', () => {
  const c = { ...C, FALL_G: 1 }; // misma gravedad subiendo y bajando: la resta es exacta
  const { s, w } = hooked([R(-50, 11.2, 50, 12)], [0, 1], 20, c);
  for (let k = 0; k < 10; k++) step(s, w, { x: 0, jump: false, hook: true }, c);
  const free = structuredClone(s);
  free.p.hook = null;
  const rel = structuredClone(s), jmp = structuredClone(s);
  step(free, w, { x: 0, jump: false, hook: false }, c);
  step(rel, w, { x: 0, jump: false, hook: false }, c);
  assert.equal(JSON.stringify(rel), JSON.stringify(free));
  step(jmp, w, { x: 0, jump: true, hook: true }, c);
  assert.equal(jmp.p.hook, null);
  assert.ok(Math.abs(jmp.p.vy - free.p.vy - C.HOOK_JUMP) < 1e-9, `vy ${jmp.p.vy} contra ${free.p.vy}`);
});

test('garfio: se pega a la primera superficie de la mira; sin mira, adelante y arriba', () => {
  const { s } = hooked([R(5, -50, 6, 50), R(8, -50, 9, 50)], [1, 0]);
  assert.equal(s.p.hook.x, 5);
  const w = { spawn: [0, 0], rects: [R(-50, 20, 50, 21)] }, t = init(w);
  t.p.face = -1;
  step(t, w, { x: 0, jump: false, hook: true }, { ...G0, HOOK_LEN: 40 });
  const dx = t.p.hook.x - t.p.x, dy = t.p.hook.y - (t.p.y + 1.2);
  assert.ok(dx < 0 && Math.abs(dy / -dx - C.AIM_UP) < 1e-9, `mira sola (${dx}, ${dy})`);
});

test('garfio: fallar deja HOOK_MISS cuadros sin poder disparar', () => {
  const w = { spawn: [0, 0], rects: [] }, s = init(w), shots = [];
  for (let k = 0; k < 40; k++) {
    step(s, w, { x: 0, jump: false, hook: s.t % 2 === 0 }, G0); // un toque nuevo cada dos cuadros
    if (s.p.shot && s.p.shot.t === s.t) shots.push(s.t);
  }
  assert.deepEqual(shots.slice(0, 2), [1, 1 + C.HOOK_MISS]);
});

test('la simulación no usa Math no exacto (D11)', () => {
  const dir = new URL('../src/sim/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /Math\.(a?(sin|cos|tan)h?|atan2|exp|expm1|log\w*|pow|hypot|cbrt|random)\b|[\w)\]]\s*\*\*/, f);
  }
});
