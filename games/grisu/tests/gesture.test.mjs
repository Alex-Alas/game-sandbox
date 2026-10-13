// El clasificador de gestos con trazos sintéticos (umbrales del GDD §4)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gestures } from '../src/gesture.ts';
import { DEFAULTS } from '../src/sim/params.ts';

const G = () => new Gestures({ ...DEFAULTS });
const kinds = (evs) => evs.map(e => e.k);

test('toque: corto y quieto', () => {
  const g = G(), out = [];
  out.push(...g.down(1, 100, 100, 0), ...g.move(1, 104, 102, 50), ...g.tick(100), ...g.up(1, 104, 102, 120));
  assert.deepEqual(kinds(out), ['tap']);
});

test('deslizar: sale en el acto con la dirección', () => {
  const g = G(), out = [];
  out.push(...g.down(1, 100, 100, 0), ...g.move(1, 115, 100, 40), ...g.move(1, 132, 98, 80));
  assert.deepEqual(kinds(out), ['swipe']);
  assert.ok(out[0].dx > 0.99 && Math.abs(out[0].dy) < 0.1);
  out.push(...g.up(1, 140, 98, 120));
  assert.deepEqual(kinds(out), ['swipe']);
});

test('mantener: quieto pasado HOLD_MS; arrastra y suelta', () => {
  const g = G(), out = [];
  out.push(...g.down(1, 100, 100, 0), ...g.tick(DEFAULTS.HOLD_MS - 10));
  assert.deepEqual(kinds(out), []);
  out.push(...g.tick(DEFAULTS.HOLD_MS + 1), ...g.move(1, 150, 80, 400), ...g.up(1, 150, 80, 600));
  assert.deepEqual(kinds(out), ['hold', 'drag', 'release']);
  assert.equal(out[1].x, 150);
});

test('un trazo lento que no llega a deslizar es mantener; uno que se mueve un poco no es toque', () => {
  const g = G(), out = [];
  out.push(...g.down(1, 100, 100, 0), ...g.move(1, 115, 100, 100), ...g.tick(250));
  assert.deepEqual(kinds(out), []);
  out.push(...g.tick(DEFAULTS.SWIPE_MS + 1));
  assert.deepEqual(kinds(out), ['hold']);
  const h = G(), o2 = [];
  o2.push(...h.down(1, 0, 0, 0), ...h.move(1, 20, 0, 60), ...h.up(1, 20, 0, 100));
  assert.deepEqual(kinds(o2), []);
});

test('el segundo dedo se ignora', () => {
  const g = G(), out = [];
  out.push(...g.down(1, 0, 0, 0), ...g.down(2, 300, 0, 10), ...g.move(2, 400, 0, 20), ...g.up(2, 400, 0, 30), ...g.up(1, 0, 0, 90));
  assert.deepEqual(kinds(out), ['tap']);
});

test('un deslizar con los movimientos atrasados (cuadro trabado) se corrige de mantener a deslizar', () => {
  const g = G(), out = [];
  out.push(...g.down(1, 100, 100, 0), ...g.tick(DEFAULTS.HOLD_MS + 20));   // el reloj declara MANTENER
  out.push(...g.move(1, 118, 96, 60), ...g.move(1, 140, 92, 90));           // pero el dedo ya se movía
  assert.deepEqual(kinds(out), ['hold', 'drag', 'release', 'swipe']);
  assert.ok(out[3].dx > 0.9);
});
