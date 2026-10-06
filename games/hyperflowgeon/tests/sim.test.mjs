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
  const inputs = Array.from({ length: 1200 }, () => ({ x: rnd() * 2 - 1, jump: rnd() < 0.3 }));
  const play = (s, from, to) => { for (let k = from; k < to; k++) step(s, PATIO, inputs[k], C); return s; };
  const end = JSON.stringify(play(init(PATIO), 0, 1200));
  assert.equal(JSON.stringify(play(init(PATIO), 0, 1200)), end);
  const mid = JSON.parse(JSON.stringify(play(init(PATIO), 0, 600)));
  assert.equal(JSON.stringify(play(mid, 600, 1200)), end);
});

test('la simulación no usa Math no exacto (D11)', () => {
  const dir = new URL('../src/sim/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /Math\.(a?(sin|cos|tan)h?|atan2|exp|expm1|log\w*|pow|hypot|cbrt|random)\b|[\w)\]]\s*\*\*/, f);
  }
});
