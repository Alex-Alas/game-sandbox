// Pruebas de FLECHAZO (node --test, `npm test`): el rompecabezas (recta de la punta, bloqueos, solución), el tutorial, que
// todo nivel generado sea válido, tenga solución y sea determinista, las trampas del generador (anillos que encierran,
// gemelas, islas con portales y huecos), que la dificultad suba, la física del jugador contra las flechas y el vacío, la
// geometría (normales hacia afuera) y el progreso guardado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rayOf, occupancy, blockerOf, freeArrows, solveOrder, layers, validate, dirOf, isleOf } from '../src/sim/puzzle.ts';
import { generate, maskOf, layoutOf, crossBlocked, gapsOf, GAP } from '../src/sim/gen.ts';
import { TUTORIAL, TUT, levelOf, specOf, reward, islePlan, DIFFS } from '../src/sim/levels.ts';
import { groundOf, isleAt, islePath, roundCorner, safeAt, PAD_R } from '../src/sim/ground.ts';
import { newBody, stepBody, arrowBoxes, boxDist, onLand } from '../src/sim/body.ts';
import { arrowMesh, clip, plen, pointAt, rounded } from '../src/sim/geom.ts';
import { fresh, parse, buyUp, buyPet, unlocked, phys, upCost, UP_MAX, openChest, wear, lookOf } from '../src/sim/meta.ts';
import { STYLES, rollPrize, decoy, styleKey, DUP_COINS } from '../src/sim/styles.ts';
import { rng, next } from '../src/sim/rng.ts';
import { newRes, adaptRes } from '../src/sim/res.ts';
import { navOf, findPath } from '../src/sim/nav.ts';
import { C, MARGIN, WALL_H, R } from '../src/sim/const.ts';

const J = (o) => JSON.stringify(o);
const geoOf = (b) => ({ ox: -(b.w - 1) / 2 * C, oz: -(b.h - 1) / 2 * C });
const limOf = (b) => { const { ox, oz } = geoOf(b), m = (MARGIN + 0.5) * C; return { x0: ox - m, z0: oz - m, x1: ox + (b.w - 1) * C + m, z1: oz + (b.h - 1) * C + m }; };
const allBoxes = (b, gone = []) => b.arrows.filter(a => !gone[a.id]).flatMap(a => arrowBoxes(b, a.id, geoOf(b).ox, geoOf(b).oz));

test('tutorial: válido, sin huecos, con solución y con los bloqueos que explica', () => {
  const b = TUTORIAL;
  assert.deepEqual(validate(b), []);
  assert.deepEqual(gapsOf(b), [], 'sin huecos');
  assert.ok(solveOrder(b));
  const occ = occupancy(b), blk = (id) => blockerOf(b, b.arrows[id], occ);
  assert.equal(blk(TUT.A), null, 'A está libre');
  assert.equal(blk(TUT.C), null, 'C está libre');
  assert.equal(blk(TUT.B)?.id, TUT.C, 'C traba a B');
  assert.equal(blk(TUT.G)?.id, TUT.A, 'A traba a G');
  assert.equal(blk(TUT.D)?.id, TUT.G, 'G traba a D');
  const gone = []; gone[TUT.C] = true;
  assert.ok(freeArrows(b, gone).includes(TUT.B), 'sin C, B sale');
  assert.equal(dirOf(b, b.arrows[TUT.A]), 2);
  assert.equal(layers(b), 4);
});

test('la recta de la punta llega al borde y no incluye la punta', () => {
  const b = { w: 5, h: 4, mask: null, arrows: [{ id: 0, c: 0, cells: [6, 7] }] }; // (1,1)→(2,1), hacia el este
  assert.deepEqual(rayOf(b, b.arrows[0]), [8, 9]);
});

test('cada nivel generado es válido, no tiene huecos, tiene solución y es determinista', () => {
  for (const d of DIFFS) for (let n = 1; n <= 14; n++) {
    const b = levelOf(d, n);
    assert.deepEqual(validate(b), [], `${d} ${n}`);
    assert.deepEqual(gapsOf(b), [], `${d} ${n}: celdas sin flecha`);
    assert.ok(solveOrder(b), `${d} ${n}: sin solución`);
    if (n > 1 || d !== 'facil') assert.equal(J(generate(specOf(d, n), 1234)), J(generate(specOf(d, n), 1234)), `${d} ${n}: no determinista`);
    if (b.mask) for (const a of b.arrows) for (const i of a.cells) assert.equal(b.mask[i], 1, `${d} ${n}: flecha fuera de la figura`);
  }
});

test('las dificultades crecen en tamaño, cantidad y profundidad', () => {
  const avg = (d, f) => { let s = 0; for (let n = 2; n <= 9; n++) s += f(levelOf(d, n)); return s / 8; };
  const arrows = (b) => b.arrows.length, cells = (b) => b.w * b.h;
  assert.ok(avg('facil', cells) < avg('dificil', cells) && avg('dificil', cells) < avg('extremo', cells));
  assert.ok(avg('facil', arrows) < avg('dificil', arrows) && avg('dificil', arrows) < avg('extremo', arrows));
  assert.ok(avg('facil', layers) < avg('extremo', layers), `profundidad ${avg('facil', layers)} vs ${avg('extremo', layers)}`);
  assert.ok(avg('extremo', layers) >= 5);
  const area = (b) => b.mask ? b.mask.reduce((s, v) => s + v, 0) : cells(b);
  for (const d of DIFFS) assert.ok(avg(d, (b) => b.arrows.reduce((s, a) => s + a.cells.length, 0) / area(b)) > 0.65, `${d}: muy vacío`);
});

test('EXTREMO es más profundo y deja menos flechas libres al empezar que FÁCIL', () => {
  const avg = (d, f) => { let s = 0; for (let n = 2; n <= 13; n++) s += f(levelOf(d, n)); return s / 12; };
  const free = (b) => freeArrows(b).length / b.arrows.length;
  assert.ok(avg('extremo', layers) >= 8, `capas ${avg('extremo', layers)}`);
  assert.ok(avg('extremo', free) < 0.4, `libres ${avg('extremo', free)}`);
  assert.ok(avg('facil', free) > avg('extremo', free));
});

test('las trampas aparecen: anillos desde FÁCIL 3, islas y huecos en las tres, gemelas del mismo color en EXTREMO', () => {
  const lv = (d) => Array.from({ length: 13 }, (_, k) => levelOf(d, k + 2));
  assert.ok(levelOf('facil', 3).rings?.length, 'FÁCIL 3 tiene un anillo');
  assert.ok(!levelOf('facil', 2).rings, 'FÁCIL 2 no');
  for (const d of ['facil', 'dificil', 'extremo']) {
    assert.ok(lv(d).some(b => b.isles?.length > 1), `${d}: islas`);
    assert.ok(lv(d).some(b => b.holes?.length), `${d}: hueco`);
  }
  assert.ok(lv('dificil').some(b => b.isles?.length === 4), 'DIFÍCIL: cuatro islas');
  assert.ok(lv('extremo').filter(b => b.rings?.length >= 2).length >= 8, 'EXTREMO: varios anillos');
  const ex = lv('extremo');
  assert.ok(ex.some(b => b.twins?.length), 'EXTREMO: gemelas');
  for (const b of ex) for (const [a, t] of b.twins ?? []) assert.equal(b.arrows[a].c, b.arrows[t].c, 'gemelas del mismo color');
  for (const b of ex.slice(10)) assert.ok(new Set(b.arrows.map(a => a.c)).size <= 4, 'EXTREMO alto: 4 colores');
});

test('un anillo encierra: lo de adentro no sale mientras esté el anillo, aunque no haya nada más', () => {
  let rings = 0, inner = 0;
  for (const [d, n] of [['facil', 3], ['facil', 5], ['dificil', 3], ['dificil', 7], ['extremo', 5], ['extremo', 9]]) {
    const b = levelOf(d, n);
    for (const id of b.rings ?? []) {
      const R = b.arrows[id], xs = R.cells.map(i => i % b.w), ys = R.cells.map(i => (i / b.w) | 0);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      assert.ok(R.cells.length >= 2 * (x1 - x0 + y1 - y0), 'el anillo da toda la vuelta');
      rings++;
      for (const a of b.arrows) {
        if (a.id === id || !a.cells.every(i => i % b.w > x0 && i % b.w < x1 && ((i / b.w) | 0) > y0 && ((i / b.w) | 0) < y1)) continue;
        const gone = b.arrows.map(o => o.id !== id && o.id !== a.id);
        assert.ok(!freeArrows(b, gone).includes(a.id), `${d} ${n}: la ${a.id} sale del anillo ${id}`);
        inner++;
      }
    }
  }
  assert.ok(rings >= 6 && inner >= 6, `${rings} anillos, ${inner} adentro`);
});

test('una gemela es el mismo camino corrido una celda', () => {
  let n = 0;
  for (let k = 2; k <= 13; k++) for (const [a, t] of levelOf('extremo', k).twins ?? []) {
    const b = levelOf('extremo', k), A = b.arrows[a].cells, T = b.arrows[t].cells, w = b.w;
    const fit = (B) => { const dx = B[0] % w - A[0] % w, dy = ((B[0] / w) | 0) - ((A[0] / w) | 0); return Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && B.every((i, j) => i % w - A[j] % w === dx && ((i / w) | 0) - ((A[j] / w) | 0) === dy); };
    assert.ok(fit(T) || fit(T.slice().reverse()), `extremo ${k}: ${t} no calca a ${a}`);
    n++;
  }
  assert.ok(n >= 5, `${n} gemelas`);
});

test('islas: portales enlazados en el borde de su isla y se llega a todas por portales', () => {
  for (const isl of ['two', 'four', 'hole']) for (const [w, h] of [[16, 9], [9, 16], [20, 20]]) {
    const L = layoutOf(isl, w, h);
    const b = { w, h, arrows: [], mask: L.mask, isles: L.isles, holes: L.holes, pads: L.pads };
    assert.deepEqual(validate(b), [], `${isl} ${w}×${h}`);
    assert.equal(L.pads.length, isl === 'two' ? 2 : isl === 'four' ? 8 : 0);
    const { ox, oz } = geoOf(b), g = groundOf(b, ox, oz);
    assert.equal(g.floors.length, L.isles.length);
    assert.ok(g.open, 'hay vacío adentro del mapa');
    for (const p of g.pads) {
      assert.equal(isleAt(g, p.x, p.z), p.isle, 'el portal está en el piso de su isla');
      assert.ok(onLand(g, p.x, p.z) && safeAt(g, p.x, p.z, 1.6), 'el portal está lejos del vacío');
      assert.ok(!g.voids.some(k => boxDist(p.x, p.z, k) < PAD_R), 'el portal no toca el vacío');
    }
    for (let i = 0; i < L.isles.length; i++) for (let j = 0; j < L.isles.length; j++) assert.ok(islePath(g, i, j), 'se llega por portales');
  }
  assert.deepEqual(islePath(groundOf({ w: 20, h: 20, arrows: [], mask: null, ...(({ isles, holes, pads }) => ({ isles, holes, pads }))(layoutOf('four', 20, 20)) }, 0, 0), 0, 3).length, 2);
});

// Dos islas de 5 × 5: correr hacia la otra desde 7 m antes del borde, saltar a `jx` del borde, doble salto a los `dj` s (y
// un tercero 0,45 s después) y SALTO mantenido (planeo). Devuelve si llegó a la isla 2.
function leap(ph, jx, dj) {
  const L = layoutOf('two', 16, 5), b = { w: 16, h: 5, arrows: [], mask: L.mask, isles: L.isles, holes: L.holes, pads: L.pads };
  const g = groundOf(b, 0, 0), f = g.floors[0], bd = newBody(f.x1 - 7, (f.z0 + f.z1) / 2);
  let t = 0, t0 = -1, n = 0;
  for (let k = 0; k < 120 * 8; k++) {
    let hit = false;
    if (t0 < 0 && bd.x >= f.x1 - jx) hit = true, t0 = t;
    else if (t0 >= 0 && n < 2 && t - t0 >= dj + n * 0.45) hit = true, n++;
    stepBody(bd, { mx: 1, mz: 0, jump: true, jumpHit: hit }, [], g.lim, ph, DT, g);
    t += DT;
    if (bd.y < -6) return false;
    if (bd.ground && isleAt(g, bd.x, bd.z) === 1) return true;
  }
  return false;
}
const physOf = (vel, salto) => { const s = fresh(); s.up.vel = vel, s.up.salto = salto; return phys(s); };

test('el vacío entre islas: sin planeo y velocidad 3 siempre se cae; con eso, se cruza', () => {
  assert.ok(GAP * C - 1.5 * C > 10, 'las islas están a más de 10 m');
  for (let vel = 0; vel <= 5; vel++) for (let salto = 0; salto <= 5; salto++) {
    const ph = physOf(vel, salto), free = salto >= 4 && vel >= 3;
    assert.equal(ph.free, free);
    let any = false;
    for (let jx = -0.5; jx <= 1.5; jx += 0.5) for (let dj = 0.1; dj <= 0.9; dj += 0.2) any ||= leap(ph, jx, dj);
    assert.equal(any, free, `velocidad ${vel}, salto ${salto}: ${any ? 'cruzó' : 'no cruzó'}`);
  }
  // con el equipo justo alcanza cualquier momento del doble salto
  for (let dj = 0.1; dj <= 1.1; dj += 0.1) assert.ok(leap(physOf(3, 4), 0.5, dj), `doble salto a los ${dj} s`);
});

test('se cae del borde de una isla, el canto frena al que quedó abajo y del hueco no se sale', () => {
  const L = layoutOf('two', 16, 5), b = { w: 16, h: 5, arrows: [], mask: L.mask, isles: L.isles, holes: L.holes, pads: L.pads };
  const g = groundOf(b, 0, 0), f = g.floors[0], z = (f.z0 + f.z1) / 2;
  const walk = newBody(f.x1 - 2, z);
  for (let k = 0; k < 240; k++) stepBody(walk, { mx: 1, mz: 0, jump: false, jumpHit: false }, [], g.lim, PH, DT, g);
  assert.ok(walk.y < -1 && walk.void, `cae: y = ${walk.y}`);
  // abajo del piso, volver caminando hacia la isla choca con su canto
  const low = newBody(f.x1 + 1, z); low.y = -1.5, low.ground = false, low.vy = 0;
  for (let k = 0; k < 30; k++) stepBody(low, { mx: -1, mz: 0, jump: false, jumpHit: false }, [], g.lim, PH, DT, g);
  assert.ok(low.x >= f.x1 + R - 1e-6, `atravesó el canto: x = ${low.x}`);
  // un poco más abajo que el piso, se trepa (como al borde de una flecha)
  const near = newBody(f.x1 + 0.6, z); near.y = -0.2, near.ground = false, near.vy = 3;
  for (let k = 0; k < 60; k++) stepBody(near, { mx: -1, mz: 0, jump: false, jumpHit: false }, [], g.lim, { ...PH, free: true }, DT, g);
  assert.ok(near.ground && near.y === 0, 'se trepó');
  // hueco: se cae y no sale por el costado
  const H = layoutOf('hole', 11, 11), hb = { w: 11, h: 11, arrows: [], mask: H.mask, isles: H.isles, holes: H.holes, pads: H.pads };
  const hg = groundOf(hb, 0, 0), h = hg.holes[0], hole = newBody((h.x0 + h.x1) / 2, h.z0 - 1.5);
  for (let k = 0; k < 240; k++) stepBody(hole, { mx: 0, mz: 1, jump: false, jumpHit: false }, [], hg.lim, PH, DT, hg);
  assert.ok(hole.y < -1, 'cayó en el hueco');
  assert.ok(hole.x - R >= h.x0 - 1e-6 && hole.x + R <= h.x1 + 1e-6 && hole.z - R >= h.z0 - 1e-6 && hole.z + R <= h.z1 + 1e-6, 'sigue adentro del hueco');
  // sin islas ni hueco el piso está en todas partes y el borde de afuera es una pared
  const solo = newBody(0, 0);
  for (let k = 0; k < 600; k++) stepBody(solo, { mx: 1, mz: 0, jump: false, jumpHit: false }, [], LIM, PH, DT);
  assert.equal(solo.y, 0);
});

// ---- Modo ISLAS -----------------------------------------------------------------------------------------------------
test('ISLAS: una flecha libre en su isla no sale si la tapa una de otra isla que cruza', () => {
  // dos islas de 3 × 3 con 6 columnas de vacío: A en la isla 1 mira al este; B, en la isla 2, está en su camino
  const L = layoutOf('two', 12, 3), at = (x, y) => y * 12 + x;
  const b = { w: 12, h: 3, mask: L.mask, isles: L.isles, holes: L.holes, pads: L.pads, arrows: [
    { id: 0, c: 0, cells: [at(0, 0), at(1, 0), at(2, 0)] },   // A → este, nada de su isla adelante
    { id: 1, c: 1, cells: [at(10, 2), at(10, 1), at(10, 0)] }, // B ↑ en la isla 2, en la fila de A
  ] };
  assert.deepEqual(validate(b), []);
  assert.equal(isleOf(b, at(0, 0)), 0), assert.equal(isleOf(b, at(10, 0)), 1), assert.equal(isleOf(b, at(5, 0)), -1);
  const hit = blockerOf(b, b.arrows[0], occupancy(b));
  assert.equal(hit?.id, 1, 'B traba a A desde la otra isla');
  assert.equal(hit?.k, 7, 'A cruza el vacío (6) y una celda de la isla 2 antes del choque');
  assert.ok(!freeArrows(b).includes(0));
  assert.ok(freeArrows(b, [false, true]).includes(0), 'sin B, A sale');
  assert.equal(crossBlocked(b), 1);
});

test('ISLAS: islas iguales, pisos simétricos y un portal en el medio de cada lado que mira a una vecina', () => {
  for (let n = 1; n <= 16; n++) {
    const b = levelOf('islas', n), [c, r, s] = islePlan(n), { ox, oz } = geoOf(b), g = groundOf(b, ox, oz);
    assert.equal(b.isles.length, c * r, `nivel ${n}`);
    for (const [x0, y0, x1, y1] of b.isles) assert.ok(x1 - x0 + 1 === s && y1 - y0 + 1 === s, `nivel ${n}: isla de ${s}`);
    const W = g.floors[0].x1 - g.floors[0].x0, H = g.floors[0].z1 - g.floors[0].z0;
    b.isles.forEach(([x0, y0, x1, y1], i) => {
      const f = g.floors[i];
      assert.ok(Math.abs(f.x1 - f.x0 - W) < 1e-9 && Math.abs(f.z1 - f.z0 - H) < 1e-9, 'pisos iguales');
      const mx = (ox + x0 * C - f.x0) - (f.x1 - (ox + x1 * C)), mz = (oz + y0 * C - f.z0) - (f.z1 - (oz + y1 * C));
      assert.ok(Math.abs(mx) < 1e-9 && Math.abs(mz) < 1e-9, 'el mismo margen de los dos lados');
    });
    assert.equal(b.pads.length, 2 * ((c - 1) * r + (r - 1) * c), 'un par de portales por vecinas');
    for (const p of b.pads) {
      const [x0, y0, x1, y1] = b.isles[p.isle], x = p.cell % b.w, y = Math.floor(p.cell / b.w);
      assert.ok((x === x0 || x === x1) && y === y0 + (s >> 1) || (y === y0 || y === y1) && x === x0 + (s >> 1), `nivel ${n}: portal fuera del medio`);
    }
    for (let i = 0; i < c * r; i++) assert.ok(islePath(g, 0, i), 'se llega a todas las islas');
  }
  const g9 = levelOf('islas', 12);
  assert.equal(islePath(groundOf(g9, geoOf(g9).ox, geoOf(g9).oz), 0, 8).length, 4, '3 × 3: de una esquina a la otra, 4 portales');
});

test('ISLAS: hay flechas que parecen libres en su isla y chocan en otra, y muchas dependen de otra isla', () => {
  let blocked = 0, cross = 0, dep = 0;
  for (let n = 1; n <= 14; n++) {
    const b = levelOf('islas', n), occ = occupancy(b), x = crossBlocked(b);
    assert.ok(x >= 2, `nivel ${n}: ${x} trabadas por otra isla`);
    cross += x, blocked += b.arrows.filter(a => blockerOf(b, a, occ)).length;
    // sin huecos, la mayoría choca primero en su isla; igual, para salir tienen que vaciar un camino en otra
    dep += b.arrows.filter(a => rayOf(b, a).some(i => occ[i] >= 0 && isleOf(b, i) !== isleOf(b, a.cells[0]))).length;
  }
  assert.ok(cross / blocked > 0.25, `${cross} de ${blocked} chocan primero en otra isla`);
  assert.ok(dep / blocked > 0.45, `${dep} de ${blocked} dependen de otra isla`);
});

test('las esquinas del piso son redondas y la isla de cada flecha es la de su punta', () => {
  const b = levelOf('dificil', 10), { ox, oz } = geoOf(b), g = groundOf(b, ox, oz);
  assert.equal(b.isles.length, 4);
  const f = g.floors[0], [x, z] = roundCorner(g, f.x0 + R, f.z0 + R, R);
  assert.ok(x > f.x0 + R + 0.1 && z > f.z0 + R + 0.1, 'la esquina empuja hacia adentro');
  for (const a of b.arrows) for (const i of a.cells) assert.equal(isleOf(b, i), isleOf(b, a.cells[0]), 'una flecha no cruza islas');
});

test('las figuras dejan celdas adentro y afuera', () => {
  for (const s of ['diamond', 'circle', 'cross', 'heart', 'star']) {
    const m = maskOf(s, 13, 13), n = m.reduce((a, v) => a + v, 0);
    assert.ok(n > 40 && n < 160, `${s}: ${n}`);
  }
});

test('premios: sin errores paga más; las dificultades altas pagan más', () => {
  assert.ok(reward('facil', 5, 0) > reward('facil', 5, 1));
  assert.ok(reward('extremo', 5, 1) > reward('dificil', 5, 1) && reward('dificil', 5, 1) > reward('facil', 5, 1));
});

// ---- Física del jugador -------------------------------------------------------------------------------------------
const WALL = { x0: 2, x1: 2.5, z0: -5, z1: 5, top: WALL_H, id: 7 };
const LIM = { x0: -20, z0: -20, x1: 20, z1: 20 };
const PH = { speed: 5, jumpH: 1.3, air: 0, glide: false };
const DT = 1 / 120;
function run(b, secs, move, boxes = [WALL], ph = PH) { for (let k = 0; k < secs / DT; k++) stepBody(b, typeof move === 'function' ? move(k) : move, boxes, LIM, ph, DT); }

test('el jugador no atraviesa una flecha caminando', () => {
  const b = newBody(0, 0);
  run(b, 3, { mx: 1, mz: 0, jump: false, jumpHit: false });
  assert.ok(Math.abs(b.x + R - WALL.x0) < 1e-3, `x = ${b.x}`);
  assert.equal(b.y, 0);
});

test('con el salto base se sube a una flecha y del otro lado se baja', () => {
  const b = newBody(0, 0);
  let on = false;
  run(b, 2.5, (k) => { if (b.on === 7) on = true; return { mx: 1, mz: 0, jump: false, jumpHit: k === 30 }; });
  assert.ok(on, 'se paró arriba');
  assert.ok(b.x > WALL.x1 + R, `pasó: x = ${b.x}`);
  assert.equal(b.y, 0);
});

test('con un salto bajo no pasa', () => {
  const b = newBody(0, 0);
  run(b, 2, (k) => ({ mx: 1, mz: 0, jump: false, jumpHit: k === 30 }), [WALL], { ...PH, jumpH: 0.5 });
  assert.ok(b.x < WALL.x0, `x = ${b.x}`);
});

test('el doble salto llega más alto y el planeo cae despacio', () => {
  const peak = (ph, second) => {
    const b = newBody(0, 0); let m = 0;
    for (let k = 0; k < 200; k++) { stepBody(b, { mx: 0, mz: 0, jump: true, jumpHit: k === 1 || (second && k === 40) }, [], LIM, ph, DT); m = Math.max(m, b.y); }
    return m;
  };
  const one = peak({ ...PH, air: 1 }, false), two = peak({ ...PH, air: 1 }, true);
  assert.ok(Math.abs(one - 1.3) < 0.08, `salto ${one}`);
  assert.ok(two > one + 0.5, `doble ${two}`);
  const fall = (glide) => { const b = newBody(0, 0); b.y = 10, b.ground = false; let t = 0; while (b.y > 0 && t < 20) { stepBody(b, { mx: 0, mz: 0, jump: true, jumpHit: false }, [], LIM, { ...PH, glide }, DT); t += DT; } return t; };
  assert.ok(fall(true) > fall(false) * 3);
});

test('no sale del borde del piso', () => {
  const b = newBody(0, 0);
  run(b, 8, { mx: 0, mz: -1, jump: false, jumpHit: false }, []);
  assert.ok(Math.abs(b.z - (LIM.z0 + R)) < 1e-6);
});

test('cajas de una flecha: cubren su camino y la punta', () => {
  const b = TUTORIAL, { ox, oz } = geoOf(b), boxes = arrowBoxes(b, TUT.B, ox, oz);
  assert.equal(boxes.length, b.arrows[TUT.B].cells.length);
  for (const i of b.arrows[TUT.B].cells) assert.ok(boxes.some(k => boxDist(ox + (i % 7) * C, oz + Math.floor(i / 7) * C, k) === 0));
});

// ---- Geometría ----------------------------------------------------------------------------------------------------
test('recortes de la vía: largo justo y punto a la distancia pedida', () => {
  const P = [[0, 0], [4, 0], [4, 6], [10, 6]];
  assert.equal(plen(P), 16);
  const c = clip(P, 2, 9);
  assert.ok(Math.abs(plen(c) - 7) < 1e-9);
  assert.deepEqual(c[0], [2, 0]);
  assert.deepEqual(pointAt(P, 7).p, [4, 3]);
  const r = rounded(P);
  assert.equal(r.p.length, r.t.length);
  assert.ok(plen(r.p) < 16 && plen(r.p) > 15);
});

test('las normales de la flecha apuntan hacia afuera y los triángulos las siguen', () => {
  const P = [[0, 0], [4.8, 0], [4.8, 4.8], [0, 4.8]];
  const m = arrowMesh(P, [1, 0.5, 0.2]);
  assert.ok(m.idx.length > 0 && m.idx.length % 3 === 0);
  let bad = 0;
  for (let k = 0; k < m.idx.length; k += 3) {
    const [a, b, c] = [m.idx[k], m.idx[k + 1], m.idx[k + 2]].map(i => [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(...f);
    if (area < 1e-9) continue;
    const i0 = m.idx[k], n = [m.nrm[3 * i0], m.nrm[3 * i0 + 1], m.nrm[3 * i0 + 2]];
    if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] < -1e-9) bad++;
  }
  assert.equal(bad, 0);
  for (let i = 0; i < m.col.length; i++) assert.ok(m.col[i] >= 0 && m.col[i] <= 1);
});

// ---- Navegación ---------------------------------------------------------------------------------------------------
test('en el tutorial se llega caminando al lado de cada flecha', () => {
  const b = TUTORIAL, boxes = allBoxes(b), lim = limOf(b), nav = navOf(lim, boxes), { oz } = geoOf(b);
  const spawn = [0, oz + (b.h - 1) * C + C * 1.1];
  for (const a of b.arrows) {
    const mine = arrowBoxes(b, a.id, geoOf(b).ox, oz);
    const p = findPath(nav, boxes, spawn, (x, z) => mine.some(k => boxDist(x, z, k) < 1.5));
    assert.ok(p, `no se llega a la flecha ${a.id}`);
  }
});

// ---- Progreso -----------------------------------------------------------------------------------------------------
test('progreso: lo guardado roto vuelve a empezar; comprar cuesta y sube', () => {
  assert.deepEqual(parse('no es json'), fresh());
  assert.deepEqual(parse(null), fresh());
  const s = fresh();
  assert.equal(buyUp(s, 'vel'), false);
  s.coins = 1000;
  const c = upCost(s, 'vel');
  assert.equal(buyUp(s, 'vel'), true);
  assert.equal(s.coins, 1000 - c);
  assert.equal(s.up.vel, 1);
  for (let k = 0; k < 10; k++) buyUp(s, 'vel');
  assert.equal(s.up.vel, UP_MAX);
  assert.equal(upCost(s, 'vel'), null);
  assert.ok(phys(s).speed > phys(fresh()).speed);
  s.coins = 60;
  assert.equal(buyPet(s, 'gomita'), true);
  assert.equal(s.pet, 'gomita');
  assert.equal(buyPet(s, 'gomita'), false);
  const back = parse(JSON.stringify(s));
  assert.deepEqual(back, s);
  assert.equal(parse(JSON.stringify({ ...fresh(), tips: 5, stats: { won: 1, arrows: 2, errors: 3, tp: 4 } })).tips, 5);
  assert.equal(parse(JSON.stringify({ ...fresh(), stats: { won: 1 } })).stats.tp, 0);
  assert.equal(unlocked(fresh(), 'dificil'), false);
  assert.equal(unlocked(fresh(), 'islas'), false);
  const u = fresh(); u.prog.facil = 4;
  assert.equal(unlocked(u, 'islas'), true, 'ISLAS se abre con FÁCIL, como DIFÍCIL');
  const t = fresh(); t.prog.facil = 4;
  assert.equal(unlocked(t, 'dificil'), true);
});

// ---- Cofres y estilos ---------------------------------------------------------------------------------------------
test('cofres: el premio es un estilo nuevo de una mascota adoptada; sin nada por ganar, monedas', () => {
  const s = fresh(), r = rng(7), rnd = () => next(r);
  s.coins = 1000; buyPet(s, 'michi'); buyPet(s, 'pio');
  assert.equal(openChest(s, rnd), null, 'sin cofres no se abre nada');
  s.chests = STYLES.length * 2 + 3;
  const tiers = [0, 0, 0, 0];
  for (let k = 0; k < STYLES.length * 2; k++) {
    const p = openChest(s, rnd);
    assert.ok(p && 'style' in p, `cofre ${k}: estilo`);
    assert.ok(['michi', 'pio'].includes(p.pet), 'solo para las adoptadas');
    tiers[p.tier]++;
  }
  assert.equal(new Set(s.styles).size, STYLES.length * 2, 'nunca repite');
  assert.deepEqual(tiers, [0, 1, 2, 3].map(t => 2 * STYLES.filter(x => x.tier === t).length), 'al final, todos');
  const c0 = s.coins, p = openChest(s, rnd);
  assert.ok(p && 'coins' in p && s.coins === c0 + DUP_COINS, 'con todo ganado, monedas');
  assert.equal(s.chests, 2);
  assert.equal(s.stats.chests, STYLES.length * 2 + 1);
  // las comunes salen más que las legendarias también en un solo sorteo
  const n = [0, 0, 0, 0];
  for (let k = 0; k < 4000; k++) n[rollPrize(['michi'], [], rnd).tier]++;
  assert.ok(n[0] > n[1] && n[1] > n[2] && n[2] > n[3] && n[3] > 50, `${n}`);
  for (let k = 0; k < 50; k++) { const d = decoy(['pio'], rnd); assert.equal(d.pet, 'pio'); assert.ok(STYLES.some(t => t.id === d.style && t.tier === d.tier)); }
});

test('estilos: solo se pone lo ganado y en su lugar; lo guardado se valida al leerlo', () => {
  const s = fresh();
  s.coins = 100; buyPet(s, 'gomita');
  assert.equal(wear(s, 'gomita', 'oro', 'skin'), false, 'no ganado');
  s.styles.push(styleKey('gomita', 'oro'), styleKey('gomita', 'corona'));
  assert.equal(wear(s, 'gomita', 'corona', 'skin'), false, 'la corona no es una piel');
  assert.equal(wear(s, 'gomita', 'oro', 'skin'), true);
  assert.equal(wear(s, 'gomita', 'corona', 'acc'), true);
  assert.deepEqual(lookOf(s, 'gomita'), { skin: 'oro', acc: 'corona' });
  assert.equal(wear(s, 'gomita', null, 'acc'), true);
  assert.deepEqual(lookOf(s, 'gomita'), { skin: 'oro', acc: null });
  s.chests = 2;
  assert.deepEqual(parse(JSON.stringify(s)), s, 'ida y vuelta');
  const bad = parse(JSON.stringify({ ...s, styles: [...s.styles, 'michi:oro', 'gomita:nada', 4], look: { gomita: { skin: 'galaxia', acc: 'corona' }, michi: { skin: 'oro' } }, chests: -3 }));
  assert.deepEqual(bad.styles, ['gomita:oro', 'gomita:corona'], 'sin estilos de mascotas que no se tienen ni inventados');
  assert.deepEqual(bad.look, { gomita: { skin: null, acc: 'corona' } }, 'solo lo ganado');
  assert.equal(bad.chests, 0);
});

// ---- Resolución adaptativa ----------------------------------------------------------------------------------------
test('resolución adaptativa: baja si la GPU no da abasto, no baja por un tope de 30 fps y vuelve a subir', () => {
  // la GPU tarda en proporción a los píxeles (escala²): a escala 1, 30 ms por cuadro
  const gpu = newRes();
  for (let k = 0; k < 60 * 30; k++) adaptRes(gpu, Math.max(16.7, 30 * gpu.scale * gpu.scale), 0.6);
  assert.ok(gpu.scale < 0.9 && gpu.scale >= 0.6, `bajó: ${gpu.scale}`);
  assert.ok(30 * gpu.scale * gpu.scale < 24, 'y anda cerca de los 45 fps o más');
  // el teléfono en ahorro de batería: 33 ms por cuadro hagas lo que hagas
  const cap = newRes();
  let min = 1;
  for (let k = 0; k < 30 * 60; k++) { adaptRes(cap, 33.3, 0.6); min = Math.min(min, cap.scale); }
  assert.ok(cap.scale === 1, `vuelve a la escala completa: ${cap.scale}`);
  assert.ok(min >= 0.85, `y casi no la toca: ${min}`);
  // si después anda rápido, sube hasta 1
  for (let k = 0; k < 60 * 20; k++) adaptRes(gpu, 12, 0.6);
  assert.equal(gpu.scale, 1);
  // pestaña oculta (cuadros larguísimos): no cuenta
  const hid = newRes(); adaptRes(hid, 5000, 0.6); assert.equal(hid.clock, 0);
  // un teléfono muy lento (120 ms por cuadro, que no mejora) también prueba bajar
  const slow = newRes(); let low = 1;
  for (let k = 0; k < 100; k++) { adaptRes(slow, 120 * Math.max(0.5, slow.scale * slow.scale), 0.6); low = Math.min(low, slow.scale); }
  assert.ok(low < 1, 'probó bajar');
});
