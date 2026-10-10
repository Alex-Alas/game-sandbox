// Pruebas de las mascotas (node --test): la física de pelota con los tres cuerpos (rebote, rodadura, aplaste, que no
// atraviese flechas, que se caiga al vacío y que el bordecito la frene), lanzar y la mira que predice, y el pleito
// (embestidas que pegan o se esquivan, caricias y atajadas que la calman, perder, cansarse y no pisar el vacío).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEEL, FEELS, newBall, stepBall, carry, throwVel, predict, landSolids, boxSolid, playerSolid, floorAt, sdRect, contact, VOID_Y, THROW_MAX } from '../src/sim/petphys.ts';
import { BR, newBrawl, stepBrawl, calm, parry, isOver } from '../src/sim/brawl.ts';
import { fresh, parse, feelOf } from '../src/sim/meta.ts';

const DT = 1 / 120;
const LAND = { floors: [{ x0: -10, z0: -10, x1: 10, z1: 10, r: 1.8 }], holes: [] };
const run = (b, f, solids, secs, each) => { const out = []; for (let k = 0; k < secs / DT; k++) { const e = stepBall(b, f, solids, DT); out.push(e); each?.(b, e); if (e.void) break; } return out; };

test('distancias en planta: rectángulo con esquinas redondas', () => {
  assert.ok(Math.abs(sdRect(0, 0, -1, -1, 1, 1)) - 1 < 1e-9);
  assert.ok(Math.abs(sdRect(2, 0, -1, -1, 1, 1) - 1) < 1e-9);
  // en la esquina redonda, el punto de la esquina cuadrada queda afuera
  assert.ok(sdRect(0.95, 0.95, -1, -1, 1, 1, 0.5) > 0);
  assert.ok(sdRect(0.95, 0.95, -1, -1, 1, 1, 0) < 0);
});

test('soltada sobre el piso queda apoyada (centro a su radio) con los tres cuerpos', () => {
  for (const k of FEELS) {
    const b = newBall(0, 2, 0, 0.3), S = landSolids(LAND);
    run(b, FEEL[k], S, 5);
    assert.ok(Math.abs(b.y - 0.3) < 0.02, `${k}: y = ${b.y}`);
    assert.ok(b.still > 0.3, `${k} quieta`);
  }
});

test('la saltarina rebota más alto que la sólida y la blanda casi nada', () => {
  const bounce = (k) => {
    const b = newBall(0, 3, 0, 0.3), S = landSolids(LAND);
    let touched = false, top = 0;
    run(b, FEEL[k], S, 1.5, (q, e) => { if (e.hit > 2) touched = true; if (touched) top = Math.max(top, q.y); });
    return top - 0.3;
  };
  const s = bounce('solido'), bl = bounce('blando'), sa = bounce('saltarin');
  assert.ok(sa > 1.6, `saltarín ${sa}`);
  assert.ok(sa > s * 3 && s > bl, `${sa} > ${s} > ${bl}`);
  assert.ok(bl < 0.1, `blando ${bl}`);
});

test('la blanda se aplasta mucho más que la sólida con el mismo golpe', () => {
  const peak = (k) => { const b = newBall(0, 3, 0, 0.3); let m = 0; run(b, FEEL[k], landSolids(LAND), 1, (q) => { m = Math.max(m, q.s); }); return m; };
  const bl = peak('blando'), sa = peak('saltarin'), so = peak('solido');
  assert.ok(bl > 0.35 && bl > sa && sa > so, `${bl} > ${sa} > ${so}`);
  assert.ok(so < 0.12);
});

test('rueda sin deslizar: la velocidad angular acompaña a la de avance y termina frenando', () => {
  for (const k of FEELS) {
    const b = newBall(0, 0.3, 0, 0.3), S = landSolids(LAND);
    b.vx = 3;
    run(b, FEEL[k], S, 0.4);
    // rodar en +x: w = (0, 0, −v/r)
    if (Math.abs(b.vx) > 0.2) assert.ok(Math.abs(b.wz + b.vx / b.r) < 0.6 * Math.abs(b.vx / b.r), `${k}: w ${b.wz} v ${b.vx}`);
    run(b, FEEL[k], S, 6);
    assert.ok(Math.hypot(b.vx, b.vz) < 0.05, `${k} frena`);
    assert.ok(b.x > 0.2 && b.x < 9, `${k} avanzó ${b.x}`);
  }
});

test('no atraviesa una flecha ni a toda velocidad: rebota', () => {
  const wall = boxSolid({ x0: 2, z0: -3, x1: 2.52, z1: 3, top: 1, id: 7 });
  for (const k of FEELS) {
    const b = newBall(0, 0.5, 0, 0.22), S = [...landSolids(LAND), wall];
    b.vx = 30, b.vy = 0;
    let hitArrow = false;
    run(b, FEEL[k], S, 0.5, (q, e) => { if (e.id === 7) hitArrow = true; assert.ok(q.x < 2 - 0.2 || q.y > 1, `${k} atravesó: x ${q.x}`); });
    assert.ok(hitArrow, `${k} pegó en la flecha`);
  }
});

test('de arriba se apoya sobre una flecha', () => {
  const S = [...landSolids(LAND), boxSolid({ x0: -1, z0: -0.26, x1: 1, z1: 0.26, top: 1, id: 3 })];
  const b = newBall(0, 3, 0, 0.2);
  run(b, FEEL.solido, S, 3);
  assert.ok(Math.abs(b.y - 1.2) < 0.03, `y ${b.y}`);
});

test('tirada por el borde o a un hueco cae al vacío; el bordecito frena a la que rueda despacio', () => {
  const S = landSolids(LAND);
  const b = newBall(8, 1, 0, 0.3); b.vx = 8, b.vy = 4;
  assert.ok(run(b, FEEL.solido, S, 4).some(e => e.void), 'por el borde');
  assert.ok(b.y < VOID_Y);
  const H = landSolids({ floors: LAND.floors, holes: [{ x0: -2, z0: -2, x1: 2, z1: 2 }] });
  assert.ok(!floorAt(H, 0, 0) && floorAt(H, 5, 0));
  const h = newBall(-3, 1, 0, 0.25); h.vx = 3, h.vy = 3;
  assert.ok(run(h, FEEL.blando, H, 4).some(e => e.void), 'al hueco');
  // rodando despacio hacia el borde, el bordecito la para
  const r = newBall(8, 0.3, 0, 0.3); r.vx = 2.5;
  run(r, FEEL.solido, S, 4);
  assert.ok(r.y > 0 && r.x < 10.2, `quedó arriba: x ${r.x} y ${r.y}`);
});

test('el piso tiene canto: la que cae por el costado no se sube de golpe arriba', () => {
  const S = landSolids(LAND);
  const b = newBall(10.5, -1, 0, 0.3); b.vx = -6;
  run(b, FEEL.saltarin, S, 0.3);
  assert.ok(b.y < 0 && b.x > 10, `rebotó contra el canto: x ${b.x} y ${b.y}`);
});

test('el jugador la empuja', () => {
  const S = landSolids(LAND);
  const b = newBall(0.45, 0.3, 0, 0.3);
  run(b, FEEL.solido, [...S, playerSolid(0, 0, 0, 0.3, [3, 0, 0])], 0.1);
  assert.ok(b.vx > 1 || b.x > 0.62, `empujada: v ${b.vx} x ${b.x}`);
  const c = contact(0.4, 0.3, 0, 0.3, playerSolid(0, 0, 0, 0.3, [0, 0, 0]));
  assert.ok(c && c[0] > 0.99 && c[3] > 0.19);
});

test('en la mano cuelga y la sigue; lanzar suma la carga y la mira predice dónde toca', () => {
  for (const k of FEELS) {
    const b = newBall(0, 1, 0, 0.25);
    for (let i = 0; i < 240; i++) carry(b, FEEL[k], [1, 1.2, -1], [0, 0, 0], DT);
    assert.ok(Math.hypot(b.x - 1, b.y - 1.2, b.z + 1) < 0.02, `${k} llegó a la mano`);
    const v0 = throwVel(b, [0, 0, -1], 0), v1 = throwVel(b, [0, 0, -1], 1);
    assert.ok(Math.hypot(...v1) > Math.hypot(...v0) * 3 && Math.hypot(...v1) <= THROW_MAX + 0.5);
    assert.ok(v1[1] > 0, 'sale un poco hacia arriba');
    b.vx = v1[0], b.vy = v1[1], b.vz = v1[2];
    const S = landSolids(LAND), p = predict(b, FEEL[k], S, DT);
    assert.equal(p.end, 'touch');
    let first = null;
    run(b, FEEL[k], S, 3, (q, e) => { if (!first && (e.hit !== undefined || e.ground)) first = [q.x, q.y, q.z]; });
    assert.ok(Math.hypot(first[0] - p.at[0], first[1] - p.at[1], first[2] - p.at[2]) < 1e-6, `${k}: la predicción coincide`);
  }
  // hacia el borde con fuerza, predice el vacío
  const b = newBall(7, 1.2, 0, 0.25);
  [b.vx, b.vy, b.vz] = throwVel(b, [1, 0, 0], 1);
  assert.equal(predict(b, FEEL.solido, landSolids(LAND), DT).end, 'void');
});

test('sacudirla en la mano da mucha más aceleración que mecerla', () => {
  const acc = (amp, hz) => { const b = newBall(0, 1, 0, 0.25); let m = 0; for (let i = 0; i < 240; i++) { const t = i * DT, x = Math.sin(t * hz * Math.PI * 2) * amp, v = Math.cos(t * hz * Math.PI * 2) * amp * hz * Math.PI * 2; m = Math.max(m, carry(b, FEEL.blando, [x, 1, 0], [v, 0, 0], DT)); } return m; };
  assert.ok(acc(0.4, 5) > 4 * acc(0.2, 0.7));
});

// ---- El pleito ---------------------------------------------------------------------------------------------------------
const env = (o = {}) => ({ px: 0, py: 0, pz: 0, pvx: 0, pvz: 0, ground: () => 0, land: () => true, ...o });
const brawlRun = (b, e, secs, each) => { const evs = []; for (let k = 0; k < secs / DT && !isOver(b); k++) { const o = stepBrawl(b, DT, typeof e === 'function' ? e(k * DT) : e); evs.push(...o); each?.(o); } return evs; };

test('pleito: quieto, la embestida te pega y te empuja hacia donde iba', () => {
  for (const fly of [false, true]) {
    const b = newBrawl(0, 0.25, 6, fly, 0.25), E = env();
    const evs = brawlRun(b, E, 6, (o) => { if (o.some(v => v.k === 'hit')) b.phase = 'won'; });
    const w = evs.findIndex(v => v.k === 'windup'), h = evs.find(v => v.k === 'hit');
    assert.ok(w >= 0 && h, `${fly ? 'vuela' : 'camina'}: avisa y pega`);
    assert.ok(h.dz < -0.9, 'empuja en la dirección de la embestida');
  }
});

test('pleito: corriéndose de costado al ver el aviso, la esquiva y queda mareada', () => {
  for (const fly of [false, true]) {
    const b = newBrawl(0, 0.25, 6, fly, 0.25);
    let px = 0, vx = 0;
    const evs = brawlRun(b, () => env({ px, pvx: vx }), 5, (o) => {
      if (o.some(v => v.k === 'windup')) vx = 4.6;
      px += vx * DT;
      if (o.some(v => v.k === 'miss')) vx = 0;
    });
    assert.ok(!evs.some(v => v.k === 'hit'), `${fly ? 'vuela' : 'camina'}: no pega`);
    assert.ok(evs.some(v => v.k === 'miss'));
  }
});

test('pleito: a las que caminan se las salta', () => {
  const b = newBrawl(0, 0.25, 6, false, 0.25);
  let py = 0, vy = 0;
  const evs = brawlRun(b, () => env({ py }), 5, (o) => {
    if (b.phase === 'lunge' && Math.hypot(b.x, b.z) < 2.2 && py === 0) vy = Math.sqrt(2 * 26 * 1.3);
    vy -= 26 * DT, py = Math.max(0, py + vy * DT);
    if (o.some(v => v.k === 'miss')) b.phase = 'won';
  });
  assert.ok(!evs.some(v => v.k === 'hit') && evs.some(v => v.k === 'miss'));
});

test('pleito: mareada, cada caricia la calma; con la última hacen las paces. Sin marear, gruñe', () => {
  const b = newBrawl(0, 0.25, 6, false, 0.25);
  assert.deepEqual(calm(b).map(v => v.k), ['growl']);
  for (let k = 0; k < BR.ANGER; k++) { b.phase = 'daze'; calm(b); }
  assert.equal(b.phase, 'won');
  assert.equal(b.anger, 0);
});

test('pleito: atajarla cuando llega cuenta como una caricia', () => {
  const b = newBrawl(0, 0.25, 6, false, 0.25), E = env();
  let got = [];
  brawlRun(b, E, 6, () => { if (b.phase === 'lunge' && Math.hypot(b.x, b.z) < 2 && !got.length) got = parry(b, E); if (got.length) b.phase = 'won'; });
  assert.deepEqual(got.map(v => v.k), ['parry']);
  assert.equal(b.anger, BR.ANGER - 1);
  assert.deepEqual(parry(newBrawl(0, 0.25, 6, false, 0.25), E), [], 'fuera de una embestida, no');
});

test('pleito: con HITS golpes gana ella; si se alarga, se cansa', () => {
  const b = newBrawl(0, 0.25, 6, false, 0.25);
  const evs = brawlRun(b, env(), 60);
  assert.equal(evs.filter(v => v.k === 'hit').length, BR.HITS);
  assert.equal(b.phase, 'lost');
  // esquivando siempre (lejos), al rato se cansa
  const c = newBrawl(0, 0.25, 6, false, 0.25);
  let px = 0, pz = 0, side = 1;
  brawlRun(c, () => env({ px, pz }), BR.MAX_T + 10, (o) => { const l = o.find(v => v.k === 'lunge'); if (l) side = -side, px -= l.dz * 3 * side, pz += l.dx * 3 * side; });
  assert.equal(c.phase, 'tired');
});

test('pleito: las que caminan nunca pisan el vacío (frenan en el borde o saltan hasta vos)', () => {
  // dos islas: |x| < 5 con z en (−5, 5) y en (8, 18)
  const land = (x, z) => Math.abs(x) < 5 && ((z > -5 && z < 5) || (z > 8 && z < 18));
  // en el borde: te embiste y frena antes del vacío
  const b = newBrawl(0, 0.25, 0, false, 0.25);
  brawlRun(b, env({ px: 4.6, pz: 4.6, land }), 12, () => assert.ok(land(b.x, b.z), `afuera: ${b.x}, ${b.z}`));
  // del otro lado del vacío no llega caminando: aparece de un salto cerca tuyo
  const c = newBrawl(0, 0.25, -2, false, 0.25);
  let blink = false;
  brawlRun(c, env({ px: 0, pz: 12, land }), 8, (o) => {
    if (o.some(v => v.k === 'blink')) blink = true, c.phase = 'won';
    assert.ok(land(c.x, c.z), `afuera: ${c.x}, ${c.z}`);
  });
  assert.ok(blink && c.z > 8, `saltó a tu isla: ${c.z}`);
});

test('el cuerpo de cada mascota se guarda, se valida y tiene uno por defecto', () => {
  const s = fresh();
  assert.equal(feelOf(s, 'gomita'), 'blando');
  assert.equal(feelOf(s, 'robi'), 'solido');
  const t = parse(JSON.stringify({ ...s, pets: ['gomita', 'pio'], feel: { gomita: 'saltarin', pio: 'raro', michi: 'solido' } }));
  assert.equal(feelOf(t, 'gomita'), 'saltarin');
  assert.equal(t.feel.pio, undefined, 'lo inventado se descarta');
  assert.equal(t.feel.michi, undefined, 'solo de las adoptadas');
});
