// node --test: los mapas (spawns, piedra, determinismo, alcanzabilidad con la física real) y sus peligros (cañonazos
// de BARCO PIRATA, cristales de CUEVA DE CRISTAL, viento de TORRES DEL VIENTO).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, step, NO_INPUT, HZ, GO, HW, H, NEVER } from '../src/sim/sim.ts';
import { MAPS, buildMap, mapById } from '../src/sim/maps.ts';
import { boxFree, groundBelow, solidAt, ROCK, WOOD, CELL, cell } from '../src/sim/terrain.ts';
import { movePlayer } from '../src/sim/move.ts';
import { botInput, newMem } from '../src/sim/bot.ts';
import { CHARS } from '../src/sim/chars.ts';
import { RULES } from '../src/sim/params.ts';

const NEW = ['torres', 'barco', 'cueva'];
const ids = MAPS.map(m => m.id);

test('mapas: están los nuevos y cada uno tiene tamaño de cámara, 8 spawns, descripción y tema', () => {
  for (const id of NEW) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  for (const m of MAPS) {
    assert.ok(m.w >= 78 && m.w <= 90 && m.h >= 44 && m.h <= 52, `${m.id}: ${m.w}x${m.h}`);
    assert.equal(m.spawns.length, 8, m.id);
    assert.ok(m.desc.length > 20 && m.name === m.name.toUpperCase(), m.id);
  }
});

test('mapas: cada spawn está libre y con suelo debajo (para que caiga parado)', () => {
  for (const m of MAPS) for (const seed of [1, 99, 123456]) {
    const T = buildMap(m, seed);
    for (const [x, y] of m.spawns) {
      assert.ok(x > 0 && x < m.w && y > m.water, `${m.id} (${x},${y}) fuera del mapa`);
      assert.ok(boxFree(T, x, y, HW, H), `${m.id} seed ${seed}: (${x},${y}) metido en el terreno`);
      const g = groundBelow(T, x, y + 0.05, 4);
      assert.ok(g !== null && y - g < 4, `${m.id} seed ${seed}: (${x},${y}) sin suelo debajo`);
    }
  }
});

test('mapas: la misma semilla da el mismo mapa (y los terrenos nuevos cambian con la semilla solo en el relieve)', () => {
  for (const m of MAPS) {
    const a = buildMap(m, 4242), b = buildMap(m, 4242);
    assert.deepEqual(a.g, b.g, m.id);
  }
  // el relieve de las islas depende de la semilla: con otra semilla el mapa no es idéntico (si usa relieve)
  for (const id of ['islas', 'cueva']) {
    const m = mapById(id);
    assert.notDeepEqual(buildMap(m, 1).g, buildMap(m, 2).g, id);
  }
});

test('mapas: todo pedazo de terreno tiene piedra (núcleo que no se rompe) y hay bastante', () => {
  for (const m of MAPS) {
    const T = buildMap(m, 7), seen = new Uint8Array(T.g.length);
    let rock = 0;
    for (let k = 0; k < T.g.length; k++) {
      if (T.g[k] === ROCK) rock++;
      if (!T.g[k] || seen[k]) continue;
      const st = [k];
      seen[k] = 1;
      let has = false, n = 0;
      while (st.length) {
        const q = st.pop();
        n++;
        if (T.g[q] === ROCK) has = true;
        const qi = q % T.cols, qj = (q - qi) / T.cols;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = qi + di, nj = qj + dj;
          if (ni < 0 || nj < 0 || ni >= T.cols || nj >= T.rows) continue;
          const nk = nj * T.cols + ni;
          if (T.g[nk] && !seen[nk]) seen[nk] = 1, st.push(nk);
        }
      }
      assert.ok(has, `${m.id}: un pedazo de ${n} celdas sin piedra cerca de la celda ${k % T.cols},${Math.floor(k / T.cols)}`);
    }
    assert.ok(rock >= 300, `${m.id}: ${rock} celdas de piedra`);
  }
});

// ---- Alcanzabilidad con la física real -----------------------------------------------------------------------------
// Desde cada spawn se prueban muchas entradas con movePlayer (caminar, saltar con distinta altura, doble salto en
// distintos cuadros, dash, pulsos de salto para saltar de pared) y se anotan los lugares donde termina parado. Cada tramo
// de 3 m de cada superficie (de abajo del techo para arriba) tiene que tener un lugar alcanzado.
function reach(mapId, seed = 1) {
  const { s, w } = newState(mapId, seed, [{ name: 'A', ch: 'bombin' }]);
  const m = w.m, T = w.T;
  s.t = GO * HZ + 100;
  const base = s.pl[0];
  Object.assign(base, { alive: true, ground: true, cloudT: NEVER, invT: NEVER, groundT: s.t });
  const standable = (x, y) => boxFree(T, x, y, HW, H) && !boxFree(T, x, y - 0.06, HW, H);
  const spots = [];
  for (let x = 0.5; x < m.w; x += 0.5) for (let j = Math.floor((m.h - 1) / CELL); j * CELL > m.water; j--) if (standable(x, j * CELL)) spots.push([x, j * CELL]);
  // tramos: puntos contiguos (a 0,5 m, con escalón de hasta 0,5 m)
  const idx = new Map(spots.map(([x, y]) => [x + ':' + y, [x, y]]));
  const used = new Set(), runs = [];
  for (const [x, y] of spots) {
    if (used.has(x + ':' + y)) continue;
    const run = [[x, y]];
    used.add(x + ':' + y);
    for (let cx = x, cy = y; ;) {
      const nx = cx + 0.5, next = spots.find(([sx, sy]) => sx === nx && Math.abs(sy - cy) <= 0.5 && !used.has(sx + ':' + sy));
      if (!next) break;
      used.add(nx + ':' + next[1]), run.push(next), cx = nx, cy = next[1];
    }
    runs.push(run);
  }
  void idx;
  const key = (x, y) => Math.round(x) + ':' + Math.round(y * 2);
  const seen = new Map(), queue = [];
  const add = (x, y) => { const k = key(x, y); if (!seen.has(k)) seen.set(k, [x, y]), queue.push([x, y]); };
  const stand = (x, y) => {
    const q = structuredClone(base);
    Object.assign(q, { x, y, vx: 0, vy: 0, ground: true, groundT: s.t, air: 1, dashN: 1, dashCdT: NEVER, dashT: NEVER, pressT: NEVER, held: false, dashHeld: false, hook: null });
    return q;
  };
  for (const sp of m.spawns) { // cada spawn cae hasta el suelo
    const q = stand(sp[0], sp[1]), f = { ...s, ev: [], pl: [q] };
    q.ground = false;
    for (let k = 0; k < 120 && !q.ground; k++) f.t = s.t + 1 + k, movePlayer(f, w, q, NO_INPUT);
    if (q.ground) add(q.x, q.y);
  }
  const scripts = [];
  for (const dir of [-1, 1]) {
    scripts.push({ dir, len: 90 });
    for (const d0 of [0, 12]) for (const dj of [-1, 10, 20]) for (const dash of [-1, 16]) for (const dy of dash >= 0 ? [0, 1] : [0])
      scripts.push({ dir, d0, jh: 16, dj, dash, dy, len: 130 });
    for (const per of [12, 18, 26]) scripts.push({ dir, pulse: per, len: 150 });
  }
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const sc of scripts) {
      const q = stand(x, y), f = { ...s, ev: [], pl: [q] };
      let lastX = x, left = false;
      for (let k = 0; k < sc.len; k++) {
        f.t = s.t + 1 + k;
        const inp = sc.pulse
          ? { ...NO_INPUT, x: sc.dir, jump: k % sc.pulse < 5 }
          : { ...NO_INPUT, x: k >= (sc.d0 ?? 0) ? sc.dir : 0, jump: k < (sc.jh ?? 0) || (sc.dj >= 0 && k >= sc.dj && k < sc.dj + 14),
            dash: sc.dash >= 0 && k >= sc.dash && k < sc.dash + 2, y: sc.dash >= 0 && k >= sc.dash && k < sc.dash + 4 ? sc.dy : 0 };
        movePlayer(f, w, q, inp);
        if (q.y < m.water + 0.3 || q.x < -2 || q.x > m.w + 2) break;
        if (!q.ground) left = true;
        if (q.ground && (left || Math.abs(q.x - lastX) >= 0.5)) add(q.x, q.y), lastX = q.x, left = false;
      }
    }
  }
  const nodes = [...seen.values()], missing = [];
  for (const run of runs) for (let i = 0; i + 4 <= run.length; i += 6) {
    const part = run.slice(i, i + 6);
    if (!part.some(([x, y]) => nodes.some(([nx, ny]) => Math.abs(nx - x) <= 0.6 && Math.abs(ny - y) <= 0.3))) missing.push(`x ${part[0][0]}–${part[part.length - 1][0]} y ${part[0][1]}`);
  }
  return { nodes: nodes.length, missing, top: m.h - 8 };
}

for (const id of NEW) test(`mapas: ${id}: todas las superficies se alcanzan desde los spawns con salto, doble salto, dash y pared`, () => {
  const r = reach(id, 1);
  // lo que está más arriba del techo (las cúpulas de piedra de la cueva) no hace falta
  const miss = r.missing.filter(t => +t.split(' y ')[1] < r.top);
  assert.deepEqual(miss, [], `${id}: ${r.nodes} lugares alcanzados`);
});

test('torres: la calle es de punta a punta caminable (sin saltar) por los túneles y puentes', () => {
  const { s, w } = newState('torres', 1, [{ name: 'A', ch: 'bombin' }]);
  s.t = GO * HZ + 10;
  const p = s.pl[0], f = { ...s, ev: [], pl: [p] };
  // empieza en la rampa de la izquierda y camina a la derecha
  Object.assign(p, { alive: true, x: 8, y: 15.2, ground: true, groundT: s.t, cloudT: NEVER, invT: NEVER });
  let yAt = -1;
  for (let k = 0; k < 600 && yAt < 0; k++) { f.t = s.t + 1 + k; movePlayer(f, w, p, { ...NO_INPUT, x: 1 }); if (p.x > 70) yAt = p.y; if (p.y < w.m.water) break; }
  assert.ok(yAt > 15, `al llegar a x = 70 estaba a y = ${yAt.toFixed(1)} (tiene que seguir en la calle)`);
});

test('torres: aunque estallen los tablones, queda la viga de piedra del puente', () => {
  const m = mapById('torres'), T = buildMap(m, 1);
  // sobre cada puente (a media luz entre torres) hay una celda de piedra y arriba de ella, madera
  for (const x of [21, 33.75, 46.25, 59]) {
    let rock = 0, wood = 0;
    for (let j = 0; j < T.rows; j++) { const c = cell(T, Math.floor(x / CELL), j); if (c === ROCK && j * CELL > 12 && j * CELL < 24) rock++; if (c === WOOD) wood++; }
    assert.ok(rock >= 1 && wood >= 2, `x = ${x}: roca ${rock} madera ${wood}`);
  }
});

// ---- Peligros ------------------------------------------------------------------------------------------------------
function game(mapId, seed, bots = 4, seg = 60) {
  const entries = Array.from({ length: bots }, (_, k) => ({ name: 'B' + k, ch: CHARS[(k + seed) % CHARS.length].id, bot: 3 }));
  const { s, w } = newState(mapId, seed, entries, { ...RULES, time: seg, crates: 8 });
  const mem = s.pl.map(p => newMem(p.id));
  return { s, w, tick: () => step(s, w, s.pl.map(p => botInput(s, w, p, mem[p.id]))) };
}

test('peligros: una partida corta de bots en cada mapa nuevo termina sin errores, con KOs y sin balas colgadas', () => {
  for (const id of NEW) {
    const g = game(id, 5, 4, 45);
    let kos = 0, shots = 0, warns = 0;
    while (!g.s.over && g.s.t < 150 * HZ) {
      g.tick();
      for (const e of g.s.ev) { if (e.k === 'ko') kos++; if (e.k === 'shot') shots++; if (e.k === 'cannon' || e.k === 'crystal') warns++; }
      assert.ok(g.s.hz.bolts.length < 12, `${id}: ${g.s.hz.bolts.length} balas en el aire`);
    }
    assert.ok(g.s.over, id + ' terminó');
    assert.ok(kos >= 1, `${id}: ${kos} KOs`); // el balance se mide con simrun; acá basta con que haya pelea
    if (id === 'barco') assert.ok(shots >= 3 && warns >= 3, `cañonazos: ${shots} disparos, ${warns} avisos`);
    if (id === 'cueva') assert.ok(warns >= 3, `cristales: ${warns} avisos`);
  }
});

test('peligros: el estado de los peligros va y viene por JSON y es determinista', () => {
  for (const id of ['barco', 'cueva', 'torres']) {
    const a = game(id, 3), b = game(id, 3);
    for (let k = 0; k < 25 * HZ; k++) a.tick(), b.tick();
    assert.equal(JSON.stringify(a.s), JSON.stringify(b.s), id);
    assert.deepEqual(JSON.parse(JSON.stringify(a.s.hz)), a.s.hz);
    assert.deepEqual(a.w.T.ops, b.w.T.ops);
  }
});

// Un mundo chico para probar una bala: la tanda de cañonazos pone una línea (aviso) y después la bala viaja por ella
test('cañón: avisa con una línea, dispara una bala recta que explota contra un jugador y lo lastima', () => {
  const { s, w } = newState('barco', 2, [{ name: 'A', ch: 'bombin' }, { name: 'B', ch: 'bombin' }]);
  s.t = GO * HZ;
  const cn = w.m.hz.cannon;
  // un jugador parado en el aire alto del mapa, a la derecha, lejos del casco
  const p = s.pl[0], q = s.pl[1];
  Object.assign(p, { alive: true, x: 60, y: 40, ground: false, cloudT: NEVER, invT: NEVER });
  Object.assign(q, { alive: true, x: 20, y: 44, ground: false, cloudT: NEVER, invT: NEVER });
  s.hz.cannonNext = s.t + 1;
  s.hz.lanes.push({ y: 40.55, d: -1, t: s.t + 30 }); // una línea justo a la altura del pecho de p, sale por la derecha
  let aviso = false;
  const dmg0 = p.dmg;
  for (let k = 0; k < 6 * HZ && s.hz.bolts.length + s.hz.lanes.length > 0 || k < 5; k++) {
    // sin gravedad: se lo deja flotando para aislar el cañón
    p.vy = 0, p.y = 40, q.vy = 0, q.y = 44;
    step(s, w, []);
    if (s.hz.lanes.length && k < 25) aviso = true;
  }
  assert.ok(aviso, 'hubo línea de aviso antes del disparo');
  assert.ok(p.dmg > dmg0 + 5, `la bala lastimó: ${p.dmg - dmg0} %`);
  assert.ok(cn.v > 20);
  assert.equal(q.dmg, 0, 'el que estaba fuera de la línea no se enteró');
});

test('cañón: el dash (invulnerable) atraviesa la bala, y la bala explota contra el terreno y lo rompe', () => {
  const { s, w } = newState('barco', 2, [{ name: 'A', ch: 'bombin' }]);
  s.t = GO * HZ;
  const p = s.pl[0];
  Object.assign(p, { alive: true, x: 60, y: 40, ground: false, cloudT: NEVER, invT: s.t + 300 });
  s.hz.bolts.push({ k: 'bala', x: 80, y: 40.5, vx: -32, vy: 0 });
  for (let k = 0; k < 4 * HZ; k++) { p.vy = 0, p.y = 40; p.invT = s.t + 300; step(s, w, []); }
  assert.equal(p.dmg, 0, 'invulnerable: no lo toca');
  assert.equal(s.hz.bolts.length, 0, 'la bala salió del mapa');
  // contra el casco: la bala corta la madera
  const T = w.T, opsAntes = T.ops.length;
  s.hz.bolts.push({ k: 'bala', x: 80, y: 12.5, vx: -32, vy: 0 });
  assert.ok(solidAt(T, 26, 12.5));
  for (let k = 0; k < 90 && s.hz.bolts.length; k++) step(s, w, []);
  assert.equal(s.hz.bolts.length, 0);
  assert.ok(T.ops.length > opsAntes, 'cortó el terreno');
});

test('cristales: el racimo avisa, tiembla y suelta una esquirla que cae, explota y no atraviesa el piso', () => {
  const { s, w } = newState('cueva', 3, [{ name: 'A', ch: 'bombin' }]);
  s.t = GO * HZ;
  const cr = w.m.hz.crystals, p = s.pl[0];
  Object.assign(p, { alive: false, spawnT: s.t + 99999 }); // sin nadie
  const [x, y] = cr.at[3];
  s.hz.dropNext = s.t + 1;
  let avisos = 0, booms = 0, bolt = null;
  for (let k = 0; k < 6 * HZ; k++) {
    step(s, w, []);
    for (const e of s.ev) { if (e.k === 'crystal') avisos++; if (e.k === 'boom' && e.kind === 'cristal') booms++; }
    if (s.hz.bolts.length) bolt = s.hz.bolts[0];
  }
  assert.ok(avisos >= 1 && booms >= 1, `avisos ${avisos}, explosiones ${booms}`);
  assert.ok(bolt && bolt.vy < 0, 'cae');
  assert.ok(s.hz.drops.every(d => cr.at.some(a => a[0] === d.x && a[1] === d.y)));
  void x; void y;
  // y una esquirla puesta a mano sobre la isla del medio explota apenas toca el suelo
  s.hz.bolts.length = 0;
  s.hz.bolts.push({ k: 'cristal', x: 33, y: 30, vx: 0, vy: 0 });
  let top = 30;
  for (let k = 0; k < 120 && s.hz.bolts.length; k++) { step(s, w, []); if (s.hz.bolts[0]) top = Math.min(top, s.hz.bolts[0].y); }
  assert.equal(s.hz.bolts.length, 0);
  assert.ok(top > 13, `la esquirla explotó contra la isla (y ≥ ${top.toFixed(1)})`);
});

test('viento: las ráfagas de TORRES avisan y empujan, y al terminar vuelve la calma', () => {
  const g = game('torres', 6, 2, 60);
  let avisos = 0, empuje = false;
  for (let k = 0; k < 40 * HZ; k++) {
    g.tick();
    for (const e of g.s.ev) if (e.k === 'wind') avisos++;
    if (g.s.hz.windDir) empuje = true;
  }
  assert.ok(avisos >= 2 && empuje, `${avisos} avisos`);
});
