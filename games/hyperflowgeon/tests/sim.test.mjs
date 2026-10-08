// node --test: Node 22 importa los .ts directo (sin tipos). Correr con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { init, step, hookTarget, aimDir, cosDeg, throwVel, atkBox, ATK, DT } from '../src/sim/sim.ts';
import { DEFAULTS as C, RANGES, PROFILES, HOOK_KEYS } from '../src/sim/params.ts';
import { PATIO } from '../src/patio.ts';

const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
// inp(t) da la entrada del cuadro t (1, 2, …); devuelve una copia del estado tras cada cuadro
function run(w, n, inp, c = C) {
  const s = init(w, c), out = [];
  for (let k = 0; k < n; k++) step(s, w, inp(s.t + 1), c), out.push(structuredClone(s));
  return out;
}
const C0 = { ...C, AIR_JUMPS: 0 }; // sin doble salto: un SALTO en el aire queda guardado para el buffer

test('coyote: se salta hasta COYOTE cuadros en el aire después de dejar el suelo (sin gastar el doble salto)', () => {
  const w = { spawn: [-1, 0], rects: [R(-20, -1, 0, 0)] }; // borde en x = 0, vacío a la derecha
  const g = run(w, 120, () => ({ x: 1, jump: false })).findLast(s => s.p.ground).t;
  for (let n = 1; n <= C.COYOTE + 2; n++) {
    const k = g + 1 + n; // SALTO apretado viendo el cuadro n en el aire
    const s = run(w, k, t => ({ x: 1, jump: t === k }), C0).at(-1);
    assert.equal(s.p.vy > 0, n <= C.COYOTE, `cuadro ${n} en el aire`);
    const d = run(w, k, t => ({ x: 1, jump: t === k })).at(-1); // con doble salto: pasado el coyote, gasta uno
    assert.ok(d.p.vy > 0 && d.p.air === C.AIR_JUMPS - (n <= C.COYOTE ? 0 : 1), `cuadro ${n}: quedan ${d.p.air}`);
  }
});

test('buffer: un SALTO hasta BUFFER cuadros antes de aterrizar salta al aterrizar', () => {
  const w = { spawn: [0, 4], rects: [R(-20, -1, 20, 0)] };
  const L = run(w, 120, () => ({ x: 0, jump: false }), C0).find(s => s.p.ground).t;
  for (let n = 1; n <= C.BUFFER + 2; n++) {
    const k = L + 1 - n; // SALTO apretado viendo el n-ésimo cuadro antes de tocar el suelo
    const s = run(w, L + 1, t => ({ x: 0, jump: t === k }), C0).at(-1);
    assert.equal(s.p.vy > 0, n <= C.BUFFER, `${n} cuadros antes`);
  }
});

test('doble salto: en el aire sube JUMP2_H sin tocar vx; AIR_JUMPS por vuelo y vuelven al tocar suelo', () => {
  const w = { spawn: [0, 100], rects: [R(-500, -1, 500, 0)] }, c = { ...C, AIR_JUMPS: 2, FALL_G: 1 };
  const s = init(w, c), top = [];
  s.p.vx = 7;
  const at = [10, 60, 110]; // tres SALTOS en el aire (mantenidos hasta la cima): el tercero no hace nada
  for (let t = 1; t <= 1000 && !s.p.ground; t++) {
    const y0 = s.p.y;
    step(s, w, { x: 0, jump: at.some(a => t >= a && t < a + 40) }, c);
    if (at.includes(t)) top.push({ y0, max: y0 });
    if (top.length) top.at(-1).max = Math.max(top.at(-1).max, s.p.y);
  }
  assert.equal(s.p.air, c.AIR_JUMPS, 'al aterrizar vuelven');
  for (const k of [0, 1]) assert.ok(Math.abs(top[k].max - top[k].y0 - c.JUMP2_H) < 0.02, `salto ${k}: ${top[k].max - top[k].y0}`);
  assert.ok(top[2].max - top[2].y0 < 1e-9, 'el tercero no sube');
  const r = init({ spawn: [0, 10], rects: [] }, c); // no le quita subida a quien ya sube más rápido
  r.p.vy = 40, r.p.vx = 7;
  step(r, { spawn: [0, 10], rects: [] }, { x: 0, jump: true }, c);
  assert.ok(r.p.vy > 39 && r.p.vx === 7 && !r.p.rise, JSON.stringify(r.p));
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
  // Mientras el ancla queda por encima de la mano: cuando la mano pasa por encima del ancla empieza la honda (tope de
  // RUN, ver step) y ahí el momento ya no se conserva a propósito.
  let k = 0;
  for (; k < 300; k++) {
    step(s, w, { x: 0, jump: false, hook: true }, c);
    if (s.p.hook.y < s.p.y + 1.2) break;
    assert.ok(Math.abs(L(s.p) - L0) < Math.abs(L0) * 1e-9, `cuadro ${k}: L ${L0} → ${L(s.p)}`);
  }
  assert.ok(k > 10 && s.p.hook, `solo ${k} cuadros antes de la honda`);
});

test('liga: soltar GARFIO conserva la velocidad; SALTO enganchado suelta y suma HOOK_JUMP', () => {
  const c = { ...C, FALL_G: 1 }; // misma gravedad subiendo y bajando: la resta es exacta
  const { s, w } = hooked([R(-50, 11.2, 50, 12)], [0, 1], 20, c);
  for (let k = 0; k < 10; k++) step(s, w, { x: 0, jump: false, hook: true }, c);
  const free = structuredClone(s);
  free.p.hook = null, free.p.relT = free.t + 1; // soltar de una superficie marca el cuadro (coyote del SALTO)
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

test('cargas: soltar rápido con el ancla delante no devuelve la carga', () => {
  const { s, w } = hooked([R(-50, 11.2, 50, 12)], [0, 1], C.HOOK_REFUND + 1); // el tirón la sube hacia el ancla
  assert.ok(s.p.vx ** 2 + s.p.vy ** 2 >= C.HOOK_REFUND ** 2, `rapidez ${s.p.vx}, ${s.p.vy}`);
  const before = s.p.charge;
  step(s, w, { x: 0, jump: false, hook: false }, G0);
  assert.ok(s.p.charge < before + 0.5, `${before} → ${s.p.charge}`);
});

test('cargas: un columpio que pasa el ancla y suelta a HOOK_REFUND m/s o más devuelve la carga', () => {
  const { s, w } = hooked([R(-50, 11.2, 50, 12)], [0, 1], C.HOOK_REFUND + 1);
  const behind = () => (s.p.hook.x - s.p.x) * s.p.vx + (s.p.hook.y - (s.p.y + 1.2)) * s.p.vy < 0; // te alejás del ancla
  const fast = () => s.p.vx ** 2 + s.p.vy ** 2 >= C.HOOK_REFUND ** 2;
  for (let k = 0; k < 600 && !(behind() && fast()); k++) step(s, w, { x: 0, jump: false, hook: true }, G0);
  assert.ok(s.p.hook && behind() && fast(), 'el columpio no pasó el ancla');
  const before = s.p.charge;
  step(s, w, { x: 0, jump: false, hook: false }, G0);
  assert.ok(s.p.charge > before + 0.5, `${before} → ${s.p.charge}`);
});

// Honda: enganchado a un ancla por debajo de la mano, la liga no sube la rapidez por encima de RUN (ver step)
test('honda: un piso adelante y abajo no deja pasar RUN, y soltar antes de llegar no devuelve la carga', () => {
  const w = { spawn: [0, 0], rects: [R(-50, -1, 50, 0)] }, hold = { x: 0, jump: false, hook: true, ax: 1, ay: -0.2 };
  const s = init(w, C); // parado en el piso; el garfio apunta adelante y abajo, al piso a unos 6 m
  let max = 0;
  for (let k = 0; k < 120; k++) step(s, w, hold, C), max = Math.max(max, Math.sqrt(s.p.vx ** 2 + s.p.vy ** 2));
  assert.ok(s.p.hook && s.p.hook.e === -1, 'enganchado al piso');
  assert.ok(max <= C.RUN + 1e-6, `rapidez máxima ${max}`);
  const r = init(w, C); // soltar antes de llegar al ancla (todavía te acercás): no devuelve
  for (let k = 0; k < 20; k++) step(r, w, hold, C);
  assert.ok(r.p.hook && r.p.hook.x > r.p.x, 'todavía no llegó al ancla');
  const before = r.p.charge;
  step(r, w, { x: 0, jump: false, hook: false }, C);
  assert.ok(r.p.hook === null && r.p.charge < before + 0.5, `${before} → ${r.p.charge}`);
});

test('honda: el tope no toca las anclas de arriba: por encima de la mano, la liga sí sube la rapidez sobre RUN', () => {
  const w = { spawn: [0, 0], rects: [R(10, 2, 12, 50)] }, s = init(w, G0);
  s.p.vx = 25;
  let max = 0;
  for (let k = 0; k < 12; k++) step(s, w, { x: 0, jump: false, hook: true, ax: 1, ay: 0.3 }, G0), max = Math.max(max, Math.sqrt(s.p.vx ** 2 + s.p.vy ** 2));
  assert.ok(s.p.hook && s.p.hook.y > s.p.y + 1.2, 'el ancla quedó por encima de la mano');
  assert.ok(max > C.RUN + 1, `rapidez máxima ${max}`);
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

test('lanzar: un toque de ATAQUE enganchado suelta la liga y lanza al dummy por la mira (los pesados, más lento)', () => {
  for (const [kind, m] of [['liviano', Z.M_LIGHT], ['pesado', Z.M_HEAVY]]) {
    const { s, w } = grab(kind, Z, 3), i = { x: 0, jump: false, hook: true, ax: 0, ay: 1 };
    step(s, w, { ...i, atk: true }, Z);
    assert.ok(s.p.hook && s.p.anchor, `${kind}: mantener ATAQUE no lanza`);
    const vy = s.d[0].vy; // lo que ya iba hacia arriba (la mira lo empujó un cuadro) se suma
    step(s, w, i, Z);
    const d = s.d[0];
    assert.equal(s.p.hook, null);
    assert.ok(d.lz && d.vx === 0 && Math.abs(d.vy - Z.THROW_V * Math.min(1, 1 / m) - vy) < 1e-9, `${kind}: ${JSON.stringify(d)}`);
  }
  const { s, w } = grab('liviano', Z, 3); // sin liga no lanza nada
  step(s, w, { x: 0, jump: false, hook: false }, Z);
  step(s, w, { x: 0, jump: false, hook: false, atk: true, ax: 0, ay: 1 }, Z);
  assert.equal(s.d[0].lz, false);
});

test('lanzar: soltar ATAQUE suma la rapidez que el dummy ya llevaba a favor de la mira (en contra no resta)', () => {
  for (const [ax, ay, v] of [[1, 0, Z.THROW_V + 20], [-1, 0, Z.THROW_V], [0, 1, Z.THROW_V]]) {
    const { s, w } = grab('mediano', Z, 1), i = { x: 0, jump: false, hook: true, ax, ay };
    step(s, w, { ...i, atk: true }, Z);
    Object.assign(s.d[0], { vx: 20, vy: 0 }); // el péndulo va hacia la derecha a 20 m/s
    assert.deepEqual(throwVel(w, s, i, Z), [ax * v, ay * v]); // lo mismo que dibuja la flecha de lanzar
    step(s, w, i, Z);
    assert.deepEqual([s.d[0].vx, s.d[0].vy], [ax * v, ay * v], `mira (${ax}, ${ay})`);
  }
});

test('enganchado a un dummy, SALTO no suelta la liga: en el suelo salta y en el aire es el doble salto', () => {
  const c = { ...C, HOOK_TRAVEL: 0 }, i = { x: 0, jump: false, hook: true, ax: 1, ay: 0 };
  const floor = { spawn: [0, 0], rects: [R(-50, -1, 50, 0)], dummies: [{ x: 10, y: 0, kind: 'pesado' }] };
  const air = { spawn: [0, 10], rects: [], dummies: [{ x: 10, y: 9.5, kind: 'pesado' }] };
  for (const w of [floor, air]) {
    const s = init(w, c);
    step(s, w, i, c), step(s, w, i, c);
    assert.equal(s.p.hook?.e, 0);
    step(s, w, { ...i, jump: true }, c);
    assert.ok(s.p.hook && s.p.vy > 0, JSON.stringify(s.p));
    assert.equal(s.p.air, w === floor ? c.AIR_JUMPS : c.AIR_JUMPS - 1);
  }
});

test('modo ancla: con ATAQUE mantenido el héroe pesa ANCHOR_M para la liga (el liviano viene sin frenarte)', () => {
  const c = Z, { s, w } = grab('liviano', c, 0);
  const v0 = { p: s.p.vx, d: s.d[0].vx };
  for (let k = 0; k < 10; k++) step(s, w, { x: 0, jump: false, hook: true, atk: true, ax: 1, ay: 0 }, c);
  const dp = s.p.vx - v0.p, dd = s.d[0].vx - v0.d;
  assert.ok(s.p.anchor && s.d[0].lz, 'modo ancla: lo que manejás golpea como LANZADO');
  assert.ok(dd < -5 && Math.abs(c.ANCHOR_M * dp + c.M_LIGHT * dd) < 1e-9, `héroe ${dp}, dummy ${dd}`);
});

test('modo ancla: mantener la mira quieta no empuja y el momento total se conserva (sin motor)', () => {
  for (const kind of ['pesado', 'mediano', 'liviano']) {
    const w = dum(kind), s = init(w, Z), m = C[{ pesado: 'M_HEAVY', mediano: 'M_MID', liviano: 'M_LIGHT' }[kind]]; // ancla desde el primer cuadro
    for (let k = 0; k < 600; k++) step(s, w, { x: 0, jump: false, hook: true, atk: true, ax: 1, ay: 0 }, Z);
    const P = Z.ANCHOR_M * s.p.vx + m * s.d[0].vx;
    assert.ok(s.p.anchor && Math.abs(P) < 1e-6, `${kind}: momento ${P}, héroe ${s.p.vx}`);
    assert.ok(Math.abs(s.p.vx) < 40, `${kind}: héroe a ${s.p.vx} m/s`);
  }
});

test('flick: un cambio brusco de la mira da UN empujón al dummy (el pesado, menos), con reacción y pausa', () => {
  const tap = (s, w, ax, ay) => step(s, w, { x: 0, jump: false, hook: true, atk: true, ax, ay }, Z);
  for (const [kind, key] of [['liviano', 'M_LIGHT'], ['pesado', 'M_HEAVY']]) {
    const { s, w } = grab(kind, Z, 2), m = Z[key];
    for (let k = 0; k < 5; k++) tap(s, w, 1, 0); // mira quieta: sin flick
    assert.ok(s.p.flickT < -1e8, 'sin flick');
    const P0 = Z.ANCHOR_M * s.p.vx + m * s.d[0].vx, v0 = { d: s.d[0].vy, h: s.p.vy };
    tap(s, w, 0, 1); // ↑: flick
    const dv = Z.SWING_FLICK * Math.min(1, 1 / m);
    assert.ok(Math.abs(s.d[0].vy - v0.d - dv) < 1e-6 && s.p.vy < v0.h, `${kind}: dummy +${s.d[0].vy - v0.d}, esperado ${dv}`);
    assert.ok(Math.abs(Z.ANCHOR_M * s.p.vx + m * s.d[0].vx - P0) < 1e-6, 'conserva el momento horizontal');
    const t0 = s.p.flickT, vy = s.d[0].vy;
    tap(s, w, 1, 0), tap(s, w, 0, 1); // otro flick dentro de la pausa: no
    assert.equal(s.p.flickT, t0, 'pausa');
    for (let k = 0; k < Z.FLICK_CD; k++) tap(s, w, 0, 1);
    tap(s, w, 1, 0);
    assert.ok(s.p.flickT > t0, 'pasada la pausa, flick de nuevo');
  }
});

test('flick: girar la mira despacio no es un flick; sin mira o sin ancla tampoco', () => {
  const { s, w } = grab('liviano', Z, 2);
  let a = 0; // de (1, 0) a (0, 1) en 60 cuadros
  for (let k = 0; k <= 60; k++) { const f = k / 60; step(s, w, { x: 0, jump: false, hook: true, atk: true, ax: 1 - f, ay: f }, Z); }
  assert.ok(s.p.flickT < -1e8, 'giro lento');
  const g = grab('liviano', Z, 2);
  step(g.s, g.w, { x: 0, jump: false, hook: true, atk: false, ax: 0, ay: 1 }, Z);
  assert.ok(g.s.p.flickT < -1e8, 'sin ATAQUE no hay ancla ni flick');
});

test('modo ancla: ATAQUE sostiene la liga sin GARFIO; apretar GARFIO otra vez la suelta sin lanzar', () => {
  const { s, w } = grab('liviano', Z, 2), i = { x: 0, jump: false, ax: 0, ay: 1 };
  for (let k = 0; k < 6; k++) step(s, w, { ...i, hook: false, atk: true }, Z); // deslizar de GARFIO a ATAQUE: el mismo cuadro
  assert.ok(s.p.hook && s.p.anchor);
  const d0 = structuredClone(s.d[0]);
  step(s, w, { ...i, hook: true, atk: true }, Z);
  assert.ok(!s.p.hook && !s.p.anchor && s.p.shot.t < s.t, 'suelta y no dispara otra');
  assert.deepEqual([s.d[0].vx, s.d[0].vy], [d0.vx, d0.vy]);
});

test('a la par: con ATAQUE mantenido un dummy lanzado atraviesa al héroe; sin ATAQUE choca', () => {
  for (const atk of [false, true]) {
    const w = { spawn: [0, 0], rects: [], dummies: [{ x: 5, y: 0, kind: 'liviano' }] }, s = init(w, Z);
    Object.assign(s.d[0], { vx: -20, lz: true });
    for (let k = 0; k < 40; k++) step(s, w, { x: 0, jump: false, atk }, Z);
    const d = s.d[0];
    if (atk) assert.ok(d.x < -5 && d.vx === -20 && s.p.vx === 0, `atravesó: ${d.x}`);
    else assert.ok(d.x - 0.4 >= s.p.x + 0.35 - 1e-6 && s.p.vx < 0, `chocó: dummy ${d.x}, héroe ${s.p.x}`);
  }
  // soltar ATAQUE con el dummy encimado: sigue a la par hasta separarse (no se frena contra el héroe)
  const w = { spawn: [0, 0], rects: [], dummies: [{ x: 5, y: 0, kind: 'liviano' }] }, s = init(w, Z);
  Object.assign(s.d[0], { vx: -20, lz: true });
  while (s.d[0].x - 0.4 > 0.35 - 0.1) step(s, w, { x: 0, jump: false, atk: true }, Z);
  assert.ok(s.d[0].par, 'encimado');
  for (let k = 0; k < 30; k++) step(s, w, { x: 0, jump: false }, Z);
  assert.ok(s.d[0].x < -5 && s.d[0].vx === -20 && !s.d[0].par && s.p.vx === 0, JSON.stringify(s.d[0]));
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

// Golpes de ATAQUE (paso E). Con Z (sin gravedad ni roce) los dummies quedan quietos hasta que los golpean.
const K = (ax = 1, ay = 0) => ({ x: 0, jump: false, atk: true, ax, ay }); // ATAQUE apretado
const NO = { x: 0, jump: false };
// ATAQUE mantenido hasta el golpe ligero (pega en f = ATK.L.start): el dummy pasa a la par y el héroe puede correr contra él
function pegar(kind, x, y, vx = 0) {
  const w = dum(kind, x, y), s = init(w, Z);
  s.p.vx = vx;
  for (let k = 0; k < ATK.L.start + 2; k++) step(s, w, K(), Z);
  return s;
}

test('golpes: el ligero pega en f = 5 a 8 (no antes ni después), atkBox coincide y baja la vida ATK_DMG_L', () => {
  for (let f = 1; f <= 12; f++) {
    const w = dum('liviano', 50, 0), s = init(w, Z); // lejos de la caja
    step(s, w, K(), Z); // pulsación: f = 0
    while (s.t < f) step(s, w, NO, Z);
    s.d[0].x = 0.8; // entra a la caja justo en el cuadro f
    step(s, w, NO, Z);
    const on = f >= 5 && f < 9; // frame data fija (no se lee de ATK: el test la verifica)
    assert.equal(s.d[0].hp < 100, on, `f = ${f}`);
    if (on) assert.equal(s.d[0].hp, 100 - C.ATK_DMG_L);
    assert.equal(atkBox(s.p, Z, s.t) !== null, on, `caja en f = ${f}`);
  }
});

test('golpes: cada dummy se golpea una sola vez por golpe, aunque siga en la caja varios cuadros', () => {
  const w = dum('liviano', 0.8, 0), s = init(w, Z);
  step(s, w, K(), Z);
  let hits = 0, hp = s.d[0].hp;
  for (let k = 0; k < 20; k++) {
    step(s, w, NO, Z);
    if (s.d[0].hp < hp) hits++, hp = s.d[0].hp;
  }
  assert.equal(hits, 1);
  assert.equal(s.d[0].hp, 100 - C.ATK_DMG_L);
});

test('golpes: el empuje es ATK_L_BASE quieto, más tu rapidez a favor (sin frenarte), y el pesado se mueve 1/8', () => {
  const quieto = pegar('mediano', 0.8, 0), corre = pegar('mediano', 2.55, 0, 10), pesado = pegar('pesado', 1.2, 0);
  assert.equal(quieto.d[0].vx, C.ATK_L_BASE, 'quieto: el mediano pesa 1');
  assert.equal(corre.d[0].vx, C.ATK_L_BASE + C.ATK_CARRY * 10, 'corriendo a 10 m/s');
  assert.equal(corre.p.vx, 10, 'el héroe no se frena');
  assert.ok(Math.abs(pesado.d[0].vx - C.ATK_L_BASE / C.M_HEAVY) < 1e-9, `pesado ${pesado.d[0].vx}`);
  for (const s of [quieto, corre, pesado]) assert.equal(s.d[0].hp, 100 - C.ATK_DMG_L);
});

test('golpes: hitstop: el dummy queda quieto ATK.L.stop cuadros tras el golpe y después se mueve', () => {
  const w = dum('liviano', 0.8, 0), s = init(w, Z), pos = [];
  step(s, w, K(), Z);
  for (let k = 0; k < ATK.L.start + ATK.L.stop + 5; k++) step(s, w, NO, Z), pos[s.t] = s.d[0].x;
  const hit = 1 + ATK.L.start; // el golpe pega en este cuadro
  assert.equal(s.d[0].hp, 100 - C.ATK_DMG_L);
  for (let t = hit; t < hit + ATK.L.stop; t++) assert.equal(pos[t], 0.8, `cuadro ${t}`);
  assert.ok(pos[hit + ATK.L.stop] > 0.8, `después: ${pos[hit + ATK.L.stop]}`);
});

test('golpes: el pesado ↑ lanza hacia arriba al de adelante y al de arriba de la cabeza, no al de atrás', () => {
  const at = (x, y) => ({ x, y, kind: 'liviano' });
  const w = { spawn: [0, 0], rects: [], dummies: [at(0, 1.9), at(1.2, 0), at(-1.2, 0)] }, s = init(w, Z); // mira a la derecha
  step(s, w, { ...K(), ax: 0, ay: 1 }, Z); // ↑: pesado
  for (let k = 0; k < ATK.H.start + 2; k++) step(s, w, NO, Z);
  assert.equal(s.d[0].hp, 100 - C.ATK_DMG_H, 'arriba');
  assert.equal(s.d[1].hp, 100 - C.ATK_DMG_H, 'adelante');
  assert.equal(s.d[2].hp, 100, 'atrás');
  for (const d of [s.d[0], s.d[1]]) assert.ok(d.vy === C.ATK_H_BASE && d.vx === 0 && d.lz, 'sale hacia arriba, LANZADO');
});

test('golpes: ↓ en el aire es picada: te baja a ATK_DIVE m/s, y el pesado abajo suma tu caída', () => {
  const w = { spawn: [0, 3], rects: [], dummies: [{ x: 0.8, y: -1.5, kind: 'liviano' }] }, s = init(w, Z);
  step(s, w, { x: 0, jump: false, atk: true, ax: 0, ay: -1 }, Z);
  assert.ok(s.p.vy <= -C.ATK_DIVE, `picada: vy ${s.p.vy}`);
  let hitAt = -1;
  for (let k = 0; k < 20 && hitAt < 0; k++) step(s, w, NO, Z), s.d[0].hp < 100 && (hitAt = s.t);
  assert.equal(hitAt, 1 + ATK.H.start, 'pega en la startup del pesado');
  assert.equal(s.d[0].vy, -(C.ATK_H_BASE + C.ATK_CARRY * -s.p.vy), 'pesado abajo: ATK_H_BASE más tu caída');
  assert.ok(s.d[0].lz && s.d[0].hp === 100 - C.ATK_DMG_H);
});

test('golpes: con la liga enganchada a un dummy, ATAQUE no empieza un golpe (sigue el modo ancla)', () => {
  const { s, w } = grab('liviano', Z, 2);
  step(s, w, { x: 0, jump: false, hook: true, atk: true, ax: 1, ay: 0 }, Z);
  assert.ok(s.p.hook && s.p.anchor, 'modo ancla');
  assert.equal(s.p.atkK, 0, 'no hay golpe');
});

test('golpes: SALTO cancela el golpe solo en la recuperación (f ≥ end), no en la startup', () => {
  const w = { spawn: [0, 0], rects: [R(-50, -1, 50, 0)] };
  for (const [f, cancel] of [[3, false], [ATK.L.end + 1, true]]) {
    const s = init(w, C);
    step(s, w, { ...NO, atk: true, ax: 1, ay: 0 }, C); // pulsación: f = 0
    while (s.t < f) step(s, w, NO, C);
    step(s, w, { x: 0, jump: true }, C); // SALTO en el cuadro f
    assert.equal(s.p.atkK === 0, cancel, `SALTO en f = ${f}`);
  }
});

test('golpes: init deja los campos nuevos y el estado sigue yendo y viniendo por JSON', () => {
  const s = init(PATIO);
  assert.ok(s.d.length > 0);
  assert.deepEqual([s.p.atkK, s.p.atkT0, s.p.atkHit], [0, -1e9, []]);
  assert.ok(s.d.every(d => d.stopT === -1e9));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('coyote de la liga: soltarla deja HOOK_COYOTE cuadros en que SALTO todavía suma HOOK_JUMP (y no es el doble salto)', () => {
  const c = { ...C, FALL_G: 1 };
  for (const n of [1, c.HOOK_COYOTE, c.HOOK_COYOTE + 1]) {
    const { s, w } = hooked([R(-50, 11.2, 50, 12)], [0, 1], 20, c);
    for (let k = 0; k < 10; k++) step(s, w, { x: 0, jump: false, hook: true }, c);
    step(s, w, { x: 0, jump: false, hook: false }, c); // suelta
    const free = structuredClone(s), jmp = structuredClone(s);
    for (let k = 1; k < n; k++) step(free, w, NO, c), step(jmp, w, NO, c);
    step(free, w, NO, c), step(jmp, w, { x: 0, jump: true }, c); // SALTO el cuadro n después de soltar
    const gain = jmp.p.vy - free.p.vy;
    if (n <= c.HOOK_COYOTE) assert.ok(Math.abs(gain - c.HOOK_JUMP) < 1e-9 && jmp.p.air === c.AIR_JUMPS, `n=${n}: +${gain}, saltos ${jmp.p.air}`);
    else assert.ok(Math.abs(gain - c.HOOK_JUMP) > 1e-3 && jmp.p.air === c.AIR_JUMPS - 1, `n=${n}: pasado el coyote es el doble salto`);
  }
});

test('coyote de la liga: un salto con liga no se repite (relT se gasta) y soltar de un dummy no da coyote', () => {
  const { s, w } = hooked([R(-50, 11.2, 50, 12)], [0, 1], 20);
  for (let k = 0; k < 10; k++) step(s, w, { x: 0, jump: false, hook: true }, C);
  step(s, w, { x: 0, jump: true, hook: true }, C); // SALTO enganchado: suelta + HOOK_JUMP
  assert.equal(s.p.relT < -1e8, true, 'gastado');
  const g = grab('liviano', Z, 2);
  step(g.s, g.w, { x: 0, jump: false, hook: false }, Z); // soltar el dummy
  assert.ok(g.s.p.relT < -1e8, 'un dummy no da coyote');
});

test('ancla en el aire: la gravedad baja a ANCHOR_G mientras ATAQUE sostiene la liga a un dummy; en el suelo no', () => {
  const c = { ...C, HOOK_TRAVEL: 0, ANCHOR_G: 0.25 }, w = { spawn: [0, 5], rects: [], dummies: [{ x: 6, y: 5, kind: 'pesado' }] };
  const vyAfter = hold => { const s = init(w, c); for (let k = 0; k < 6; k++) step(s, w, { x: 0, jump: false, hook: hold, atk: hold, ax: 1, ay: 0 }, c); return s.p.vy; };
  const flot = vyAfter(true), caida = vyAfter(false);
  assert.ok(flot > caida * 0.5 && caida < 0, `con ancla vy ${flot}, sin ella ${caida}`);
});
