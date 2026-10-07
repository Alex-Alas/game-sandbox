// node --test: Node 22 importa los .ts directo (sin tipos). Correr con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { init, step, hookTarget, aimDir, cosDeg, DT } from '../src/sim/sim.ts';
import { DEFAULTS as C, RANGES, PROFILES, HOOK_KEYS } from '../src/sim/params.ts';
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
  const inputs = Array.from({ length: 1200 }, () => ({ x: rnd() * 2 - 1, jump: rnd() < 0.3, hook: rnd() < 0.6, atk: rnd() < 0.2, ax: rnd() * 2 - 1, ay: rnd() * 2 - 1 }));
  const play = (s, from, to) => { for (let k = from; k < to; k++) step(s, PATIO, inputs[k], C); return s; };
  const end = JSON.stringify(play(init(PATIO), 0, 1200));
  assert.equal(JSON.stringify(play(init(PATIO), 0, 1200)), end);
  const mid = JSON.parse(JSON.stringify(play(init(PATIO), 0, 600)));
  assert.equal(JSON.stringify(play(mid, 600, 1200)), end);
});

// Liga: sin gravedad (JUMP_H = 0) ni viaje del ancla para aislarla. El héroe va a 20 m/s por el aire y engancha algo
// a 10 m de la mano.
const G0 = { ...C, JUMP_H: 0, HOOK_TRAVEL: 0 };
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

test('cargas: enganchar gasta una, fallar no; sin cargas no dispara; se recargan una cada HOOK_CD s', () => {
  const w = { spawn: [0, 50], rects: [R(-50, 60, 50, 61)] }, s = init(w), c = { ...G0, HOOK_REFUND: 0 };
  const tap = hook => step(s, w, { x: 0, jump: false, hook, ax: 0, ay: 1 }, c);
  for (let k = 0; k < C.HOOK_N; k++) tap(true), tap(false); // engancha y suelta
  assert.ok(s.p.charge < 1, `quedan ${s.p.charge}`);
  tap(true);
  assert.equal(s.p.hook, null);
  const t0 = s.t; // con 3·(1/60)/HOOK_CD ya recargado, falta lo justo para la primera carga entera
  while (s.p.charge < 1) tap(false);
  assert.ok(Math.abs((s.t - t0) * DT + 2 * C.HOOK_N * DT - C.HOOK_CD) < 2 * DT, `recargó en ${(s.t - t0) * DT} s`);
  const miss = init({ spawn: [0, 0], rects: [] });
  step(miss, { spawn: [0, 0], rects: [] }, { x: 0, jump: false, hook: true, ax: 0, ay: 1 }, c);
  assert.equal(miss.p.charge, C.HOOK_N);
});

test('cargas: soltar a HOOK_REFUND m/s o más devuelve la carga', () => {
  for (const [vx, back] of [[C.HOOK_REFUND + 1, true], [C.HOOK_REFUND - 5, false]]) {
    const { s, w } = hooked([R(-50, 11.2, 50, 12)], [0, 1], vx);
    step(s, w, { x: 0, jump: false, hook: false }, G0);
    assert.equal(s.p.charge > C.HOOK_N - 1 + 0.5, back, `a ${vx} m/s quedan ${s.p.charge}`);
  }
});

test('chispas: devuelven una carga y reaparecen a los ORB_T s', () => {
  const w = { spawn: [0, 50], rects: [R(-50, 60, 50, 61)], orbs: [[0, 51]] }, s = init(w), c = { ...G0, HOOK_REFUND: 0, HOOK_CD: 1000 };
  step(s, w, { x: 0, jump: false, hook: true, ax: 0, ay: 1 }, c);
  const after = s.p.charge;
  assert.ok(after > C.HOOK_N - 0.5 && s.orbs[0] === 1 + C.ORB_T * 60, `carga ${after}, chispa ${s.orbs[0]}`);
});

test('cono de gracia: si el rayo no pega, la esquina visible más cercana a la mira dentro del cono', () => {
  const p = init({ spawn: [0, -1.2], rects: [] }); // la mano en (0, 0)
  const aim = (deg, cone, rects) => hookTarget({ spawn: [0, 0], rects }, p, { x: 0, jump: false, ax: 1, ay: Math.tan(deg * Math.PI / 180) }, { ...C, HOOK_CONE: cone });
  const beam = [R(5, -10, 6, 0.5)]; // su esquina de arriba está a ~5,7° de la horizontal
  assert.equal(aim(0, 12, beam).grace, false);
  const g = aim(10, 12, beam);
  assert.ok(g.grace && Math.abs(g.x - 5) < 1e-3 && Math.abs(g.y - 0.5) < 1e-3, JSON.stringify(g));
  assert.equal(aim(20, 12, beam), null); // fuera del cono
  // tapada: una viga más cerca tapa la esquina de la lejana; gana la esquina de la que tapa
  const g2 = aim(10, 12, [R(8, -10, 9, 0.6), R(4, -10, 4.5, 0.3)]);
  assert.ok(Math.abs(g2.x - 4) < 1e-3 && Math.abs(g2.y - 0.3) < 1e-3, JSON.stringify(g2));
  // un piso largo que sale del alcance: el punto donde su borde corta el círculo
  const g3 = aim(0, 12, [R(-50, -10, 50, -1)]);
  assert.ok(Math.abs(g3.d - C.HOOK_LEN) < 1e-3 && Math.abs(g3.y + 1) < 1e-3, JSON.stringify(g3));
  for (const d of [0, 10, 30, 60, 90]) assert.ok(Math.abs(cosDeg(d) - Math.cos(d * Math.PI / 180)) < 1e-6);
});

test('imán a esquinas: dentro del cono, una esquina visible gana a la superficie que pega el rayo', () => {
  const p = init({ spawn: [0, -1.2], rects: [] }); // la mano en (0, 0)
  const w = { spawn: [0, 0], rects: [R(8, -10, 9, 10), R(4, 0.8, 6, 1.2)] }; // pared a 8 m y una viga apenas arriba
  const at = (deg, c) => hookTarget(w, p, { x: 0, jump: false, ax: 1, ay: Math.tan(deg * Math.PI / 180) }, { ...C, HOOK_CONE: 12, ...c });
  const ray = at(0, {}), mag = at(0, { AIM_EDGE: 1 });
  assert.ok(!ray.grace && Math.abs(ray.x - 8) < 1e-9 && Math.abs(ray.y) < 1e-9, JSON.stringify(ray));
  assert.ok(mag.grace && Math.abs(mag.x - 6) < 1e-3 && Math.abs(mag.y - 0.8) < 1e-3, JSON.stringify(mag)); // la de 7,6°
  const low = at(-30, { AIM_EDGE: 1 }); // sin esquinas en el cono: el rayo de siempre
  assert.ok(!low.grace && Math.abs(low.x - 8) < 1e-9, JSON.stringify(low));
  assert.equal(at(0, { AIM_EDGE: 1, HOOK_CONE: 0 }).grace, false); // sin cono no hay imán
});

test('16 direcciones (PVP): toda mira se reduce a la más cercana; ratón y joystick coinciden', () => {
  const p = init({ spawn: [0, 0], rects: [] }).p, c16 = { ...C, AIM_16: 1 };
  const dir = (ax, ay, c = c16) => aimDir(p, { x: 0, jump: false, ax, ay }, c);
  // el ratón lejos (~20°) y el joystick a medias (~22°): la misma dirección de 22,5°
  assert.deepEqual(dir(30, 11), dir(0.62, 0.25));
  assert.notDeepEqual(dir(30, 11, C), dir(0.62, 0.25, C));
  const [x, y] = dir(30, 11);
  assert.ok(Math.abs(x - Math.cos(Math.PI / 8)) < 1e-12 && Math.abs(y - Math.sin(Math.PI / 8)) < 1e-12);
  for (let k = 0; k < 97; k++) {
    const a = k * Math.PI / 48 + 0.003, [qx, qy] = dir(3 * Math.cos(a), 3 * Math.sin(a));
    assert.ok(Math.abs(Math.sin(8 * Math.atan2(qy, qx))) < 1e-9 && Math.abs(qx * qx + qy * qy - 1) < 1e-12, `${a}`);
    assert.ok(qx * Math.cos(a) + qy * Math.sin(a) >= Math.cos(Math.PI / 16) - 1e-12, `${a}`); // la más cercana
  }
  assert.deepEqual(dir(0, 0), dir(1, 1)); // sin mira, adelante y arriba (AIM_UP = 1): también la de 45°
});

test('viaje del ancla: tarda HOOK_TRAVEL × distancia / alcance y mientras viaja no tira', () => {
  const c = { ...G0, HOOK_TRAVEL: 0.3, HOOK_LEN: 20 }; // 10 m = 0,15 s = 9 cuadros
  const { s, w } = hooked([R(10, -50, 12, 50)], [1, 0], 0, c);
  assert.equal(s.p.hook.at, 1 + 9);
  for (let k = 0; k < 8; k++) step(s, w, { x: 0, jump: false, hook: true }, c);
  assert.equal(s.p.vx, 0, 'no tiró en el viaje');
  step(s, w, { x: 0, jump: false, hook: true }, c);
  assert.ok(s.p.vx > 0 && Math.abs(s.p.hook.rest - (s.p.hook.x - s.p.x) * c.HOOK_REST) < 0.5, JSON.stringify(s.p.hook));
});

test('viaje del ancla: soltar antes de llegar cancela y devuelve la carga; SALTO no la suelta', () => {
  const c = { ...G0, HOOK_TRAVEL: 0.3, HOOK_LEN: 20, HOOK_REFUND: 0, HOOK_CD: 1000 };
  const { s, w } = hooked([R(10, -50, 12, 50)], [1, 0], 0, c);
  step(s, w, { x: 0, jump: true, hook: true }, c);
  assert.ok(s.p.hook, 'SALTO en el viaje no suelta');
  step(s, w, { x: 0, jump: false, hook: false }, c);
  assert.equal(s.p.hook, null);
  assert.ok(s.p.charge > C.HOOK_N - 0.01, `cargas ${s.p.charge}`);
});

test('viaje del ancla: un disparo fallido viaja todo el alcance y después HOOK_MISS cuadros', () => {
  const w = { spawn: [0, 0], rects: [] }, s = init(w), c = { ...G0, HOOK_TRAVEL: 0.3 };
  step(s, w, { x: 0, jump: false, hook: true }, c);
  assert.equal(s.p.hookT, 1 + 18 + C.HOOK_MISS);
});

// Dummies (paso D). Sin gravedad, sin roce y sin viaje del ancla para aislar la liga y los choques. La mano del héroe
// queda en (0, 1,2) y un dummy a 10 m; la liga le pega en la cara a la altura de la mano.
const Z = { ...C, JUMP_H: 0, HOOK_TRAVEL: 0, D_FRIC: 0 };
const dum = (kind, x = 10, y = 0.75, rects = []) => ({ spawn: [0, 0], rects, dummies: [{ x, y, kind }] });
function grab(kind, c = Z, n = 0) {
  const w = dum(kind), s = init(w, c);
  for (let k = 0; k <= n; k++) step(s, w, { x: 0, jump: false, hook: true, ax: 1, ay: 0 }, c);
  return { s, w };
}

test('dummies: la liga tira de las dos puntas repartida por masa (el liviano viene, el pesado te lleva)', () => {
  for (const kind of ['liviano', 'mediano', 'pesado']) {
    const { s } = grab(kind, Z, 10), m = Z[{ liviano: 'M_LIGHT', mediano: 'M_MID', pesado: 'M_HEAVY' }[kind]], d = s.d[0];
    assert.equal(s.p.hook.e, 0);
    assert.ok(Math.abs(s.p.vx + m * d.vx) < 1e-9, `${kind}: momento ${s.p.vx + m * d.vx}`);
    assert.ok(Math.abs((d.x - 10) / s.p.x + 1 / m) < 1e-9, `${kind}: el dummy se movió ${d.x - 10}, el héroe ${s.p.x}`);
  }
});

test('dummies: lo relativo es igual que contra una pared (la liga se siente igual)', () => {
  const w = { spawn: [0, 0], rects: [R(9.6, -50, 10.4, 50)] }, wall = init(w, Z);
  const runs = [['liviano', 0.4], ['pesado', 0.8]].map(([kind, hw]) => { const w = dum(kind, 9.6 + hw); return { w, s: init(w, Z) }; });
  for (let k = 0; k < 15; k++) {
    const i = { x: 0, jump: false, hook: true, ax: 1, ay: 0 };
    step(wall, w, i, Z);
    for (const r of runs) {
      step(r.s, r.w, i, Z);
      const a = wall.p.hook.x - wall.p.x, b = r.s.p.hook.x - r.s.p.x;
      assert.ok(Math.abs(a - b) < 1e-9, `cuadro ${k}: ${a} contra ${b}`);
    }
  }
});

test('dummies: el liviano llega y se frena contra el héroe (choque sin rebote, sin atravesarse)', () => {
  const { s } = grab('liviano', Z, 120), d = s.d[0];
  assert.ok(Math.abs(s.p.vx) < 1e-9 && Math.abs(d.vx) < 1e-9, `quedan a ${s.p.vx} y ${d.vx}`);
  const gap = d.x - 0.4 - (s.p.x + 0.35);
  assert.ok(gap > -1e-6 && gap < 0.05, `separación ${gap}`);
});

test('dummies: uno se para encima de un dummy (lo trabado contra el piso no se hunde) y salta desde ahí', () => {
  for (const [kind, h] of [['pesado', 2.6], ['liviano', 0.9]]) {
    const w = { spawn: [0, 5], rects: [R(-20, -1, 20, 0)], dummies: [{ x: 0, y: 0, kind }] }, s = init(w);
    for (let k = 0; k < 90; k++) step(s, w, { x: 0, jump: false }, C);
    assert.ok(Math.abs(s.p.y - h) < 1e-6 && s.p.ground && s.p.vy === 0, `${kind}: y ${s.p.y}, suelo ${s.p.ground}`);
    assert.ok(s.d[0].x === 0 && s.d[0].y === 0, `${kind}: el dummy se movió`);
    step(s, w, { x: 0, jump: true }, C);
    assert.ok(s.p.vy > 0, `${kind}: no saltó`);
  }
});

test('dummies: correr contra un liviano lo empuja sin atravesarlo', () => {
  const w = { spawn: [0, 0], rects: [R(-20, -1, 40, 0)], dummies: [{ x: 3, y: 0, kind: 'liviano' }] }, s = init(w);
  for (let k = 0; k < 60; k++) step(s, w, { x: 1, jump: false }, C);
  const d = s.d[0];
  assert.ok(d.x > 4 && d.x - 0.4 >= s.p.x + 0.35 - 1e-6, `dummy en ${d.x}, héroe en ${s.p.x}`);
});

test('lanzar: ATAQUE enganchado suelta la liga y lanza al dummy por la mira (los pesados, más lento)', () => {
  for (const [kind, m] of [['liviano', Z.M_LIGHT], ['pesado', Z.M_HEAVY]]) {
    const { s, w } = grab(kind, Z, 3);
    step(s, w, { x: 0, jump: false, hook: true, atk: true, ax: 0, ay: 1 }, Z);
    const d = s.d[0];
    assert.equal(s.p.hook, null);
    assert.ok(d.lz && d.vx === 0 && Math.abs(d.vy - Z.THROW_V * Math.min(1, 1 / m)) < 1e-9, `${kind}: ${JSON.stringify(d)}`);
  }
  const { s, w } = grab('liviano', Z, 3); // sin liga no lanza nada
  step(s, w, { x: 0, jump: false, hook: false }, Z);
  step(s, w, { x: 0, jump: false, hook: false, atk: true, ax: 0, ay: 1 }, Z);
  assert.equal(s.d[0].lz, false);
});

test('golpes: lo LANZADO se lastima al chocar según cuánto pierde por encima de IMPACT_V', () => {
  const hp = (v, lz) => {
    const w = dum('liviano', 0, 0, [R(2, -50, 3, 50)]), s = init(w, Z);
    w.spawn = [-20, 0];
    Object.assign(s.p, { x: -20 }), Object.assign(s.d[0], { vx: v, lz });
    for (let k = 0; k < 30; k++) step(s, w, { x: 0, jump: false }, Z);
    return s.d[0].hp;
  };
  assert.equal(hp(20, true), 100 - (20 - Z.IMPACT_V) * Z.IMPACT_DMG);
  assert.equal(hp(20, false), 100);
  assert.equal(hp(Z.IMPACT_V - 1, true), 100);
});

test('golpes: un LANZADO contra otro dummy: choque sin rebote, se conserva el momento y sufre más el liviano', () => {
  const w = { spawn: [-20, 0], rects: [], dummies: [{ x: 0, y: 0, kind: 'liviano' }, { x: 5, y: 0, kind: 'pesado' }] }, s = init(w, Z);
  Object.assign(s.d[0], { vx: 30, lz: true });
  for (let k = 0; k < 30; k++) step(s, w, { x: 0, jump: false }, Z);
  const [a, b] = s.d, dv = 30 - a.vx;
  assert.ok(Math.abs(Z.M_LIGHT * a.vx + Z.M_HEAVY * b.vx - Z.M_LIGHT * 30) < 1e-9 && Math.abs(a.vx - b.vx) < 1e-9, `${a.vx} y ${b.vx}`);
  assert.ok(Math.abs(a.hp - (100 - (dv - Z.IMPACT_V) * Z.IMPACT_DMG)) < 1e-9 && b.hp === 100, `hp ${a.hp} y ${b.hp}`);
});

test('mira: imán a enemigos (un dummy en el cono gana a la pared que pega el rayo) y el dummy tapa lo de atrás', () => {
  const w = dum('liviano', 5, 0.3, [R(8, -10, 9, 10)]), s = init({ ...w, spawn: [0, -1.2] }); // la mano en (0, 0)
  const at = (ax, ay, c = {}) => hookTarget(w, s, { x: 0, jump: false, ax, ay }, { ...C, HOOK_CONE: 12, ...c });
  const foe = at(1, 0), off = at(1, 0, { AIM_FOE: 0 }), ray = at(5, 0.75);
  assert.ok(foe.e === 0 && foe.grace && Math.abs(foe.x - 4.6) < 1e-9, JSON.stringify(foe)); // centro a ~8,5°: el rayo pasa por debajo
  assert.ok(off.e === -1 && Math.abs(off.x - 8) < 1e-9, JSON.stringify(off));
  assert.ok(ray.e === 0 && !ray.grace, JSON.stringify(ray));
});

test('dummies: roto suelta la liga, desaparece y vuelve entero a los D_RESPAWN s', () => {
  const { s, w } = grab('liviano', Z, 2);
  s.d[0].hp = 0;
  step(s, w, { x: 0, jump: false, hook: true }, Z);
  assert.equal(s.p.hook, null);
  assert.equal(hookTarget(w, s, { x: 0, jump: false, ax: 1, ay: 0 }, Z), null);
  const t0 = s.t;
  while (s.d[0].hp <= 0) step(s, w, { x: 0, jump: false }, Z);
  assert.equal(s.t - t0, Z.D_RESPAWN * 60);
  assert.deepEqual([s.d[0].x, s.d[0].hp, s.d[0].lz], [10, 100, false]);
});

test('determinismo en el corral: con dummies, choques y lanzamientos, mismo estado y serializable', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const w = { ...PATIO, spawn: [206, 0] };
  const inputs = Array.from({ length: 1500 }, () => ({ x: rnd() * 2 - 1, jump: rnd() < 0.2, hook: rnd() < 0.7, atk: rnd() < 0.1, ax: rnd() * 2 - 1, ay: rnd() * 2 - 1 }));
  const play = (s, from, to) => { for (let k = from; k < to; k++) step(s, w, inputs[k], C); return s; };
  const end = play(init(w), 0, 1500), json = JSON.stringify(end);
  assert.equal(JSON.stringify(play(init(w), 0, 1500)), json);
  assert.equal(JSON.stringify(play(JSON.parse(JSON.stringify(play(init(w), 0, 700))), 700, 1500)), json);
  assert.ok([end.p, ...end.d].every(b => Number.isFinite(b.x) && Number.isFinite(b.y)));
});

test('perfiles del garfio: todas las claves y dentro de los rangos del panel', () => {
  for (const [name, prof] of Object.entries(PROFILES)) for (const k of HOOK_KEYS) {
    const [, min, max] = RANGES[k];
    assert.ok(prof[k] >= min && prof[k] <= max, `${name}.${k} = ${prof[k]}`);
  }
});

test('la simulación no usa Math no exacto (D11)', () => {
  const dir = new URL('../src/sim/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /Math\.(a?(sin|cos|tan)h?|atan2|exp|expm1|log\w*|pow|hypot|cbrt|random)\b|[\w)\]]\s*\*\*/, f);
  }
});
