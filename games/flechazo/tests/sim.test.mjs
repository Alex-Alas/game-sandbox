// Pruebas de FLECHAZO (node --test, `npm test`): el rompecabezas (recta de la punta, bloqueos, solución), el tutorial, que
// todo nivel generado sea válido, tenga solución y sea determinista, la física del jugador contra las flechas, la geometría
// (normales hacia afuera) y el progreso guardado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rayOf, occupancy, blockerOf, freeArrows, solveOrder, layers, validate, dirOf } from '../src/sim/puzzle.ts';
import { generate, maskOf } from '../src/sim/gen.ts';
import { TUTORIAL, TUT, levelOf, specOf, reward, DIFFS } from '../src/sim/levels.ts';
import { newBody, stepBody, arrowBoxes, boxDist } from '../src/sim/body.ts';
import { arrowMesh, clip, plen, pointAt, rounded } from '../src/sim/geom.ts';
import { fresh, parse, buyUp, buyPet, unlocked, phys, upCost, UP_MAX } from '../src/sim/meta.ts';
import { navOf, findPath } from '../src/sim/nav.ts';
import { C, MARGIN, WALL_H, R } from '../src/sim/const.ts';

const J = (o) => JSON.stringify(o);
const geoOf = (b) => ({ ox: -(b.w - 1) / 2 * C, oz: -(b.h - 1) / 2 * C });
const limOf = (b) => { const { ox, oz } = geoOf(b), m = (MARGIN + 0.5) * C; return { x0: ox - m, z0: oz - m, x1: ox + (b.w - 1) * C + m, z1: oz + (b.h - 1) * C + m }; };
const allBoxes = (b, gone = []) => b.arrows.filter(a => !gone[a.id]).flatMap(a => arrowBoxes(b, a.id, geoOf(b).ox, geoOf(b).oz));

test('tutorial: válido, con solución y con los bloqueos que explica', () => {
  const b = TUTORIAL;
  assert.deepEqual(validate(b), []);
  assert.ok(solveOrder(b));
  const occ = occupancy(b), blk = (id) => blockerOf(b, b.arrows[id], occ);
  assert.equal(blk(TUT.A), null, 'A está libre');
  assert.equal(blk(TUT.C), null, 'C está libre');
  assert.equal(blk(TUT.B)?.id, TUT.C, 'C traba a B');
  assert.equal(blk(TUT.B)?.k, 1);
  assert.equal(blk(TUT.D)?.id, TUT.E, 'E traba a D');
  assert.equal(blk(TUT.G)?.id, TUT.A, 'A traba a G');
  const gone = []; gone[TUT.C] = true;
  assert.ok(freeArrows(b, gone).includes(TUT.B), 'sin C, B sale');
  assert.equal(dirOf(b, b.arrows[TUT.A]), 2);
});

test('la recta de la punta llega al borde y no incluye la punta', () => {
  const b = { w: 5, h: 4, mask: null, arrows: [{ id: 0, c: 0, cells: [6, 7] }] }; // (1,1)→(2,1), hacia el este
  assert.deepEqual(rayOf(b, b.arrows[0]), [8, 9]);
});

test('cada nivel generado es válido, tiene solución y es determinista', () => {
  for (const d of DIFFS) for (let n = 1; n <= 14; n++) {
    const b = levelOf(d, n);
    assert.deepEqual(validate(b), [], `${d} ${n}`);
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
  for (const d of DIFFS) assert.ok(avg(d, (b) => b.arrows.reduce((s, a) => s + a.cells.length, 0) / cells(b)) > 0.55, `${d}: muy vacío`);
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
  assert.equal(unlocked(fresh(), 'dificil'), false);
  const t = fresh(); t.prog.facil = 4;
  assert.equal(unlocked(t, 'dificil'), true);
});
