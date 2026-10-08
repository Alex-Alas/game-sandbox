// Pruebas de la red de CATAPUM (node --test, `npm test`): los codecs, el protocolo del anfitrión/invitado sin DOM y, con el
// laboratorio de red (tools/netlab.mjs: relay real en memoria, latencia y jitter simulados, reloj simulado), lo que importa de
// verdad: terreno idéntico, predicción propia con error acotado (80 ms ± 30), entrada tardía, reconexión y ancho de banda.
// Los parámetros de cada corrida están fijos (semillas incluidas): si cambia la sim, los umbrales dejan margen de sobra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLab } from '../tools/netlab.mjs';
import { Match, QMAX, STARVE_NEUTRAL } from '../src/game.ts';
import { HostNet, GuestNet, GuestView, packState, applyState, packMe, unpackMe, packInput, helloMsg, PROTO, TAB } from '../src/net.ts';
import { bgTicker } from '../src/bgtick.ts';
import { botInput, newMem } from '../src/sim/bot.ts';
import { newState, step, NO_INPUT, NEVER, HZ, GO } from '../src/sim/sim.ts';
import { DEFAULTS, RULES } from '../src/sim/params.ts';
import { CHARS } from '../src/sim/chars.ts';

const J = o => JSON.parse(JSON.stringify(o));
const I = (o = {}) => ({ ...NO_INPUT, ...o });
const botSeats = n => Array.from({ length: n }, (_, k) => ({ name: 'B' + k, ch: CHARS[k % CHARS.length].id, team: k % 2, bot: 2 }));
// Una partida de bots avanzada hasta que pasen cosas (golpes, liga, ulti…)
function played(n, frames, map = 'islas') {
  const { s, w } = newState(map, 7717, botSeats(n), { ...RULES, time: 0 }, { ...DEFAULTS });
  const mem = s.pl.map(p => newMem(p.id));
  for (let k = 0; k < frames; k++) step(s, w, s.pl.map(p => botInput(s, w, p, mem[p.id])));
  return { s, w };
}

test('st: cada jugador viaja en pocos bytes y sin lo privado (mano, maná, ulti)', () => {
  const { s } = played(4, 60 * 20);
  const m = J(packState(s, [], [], 0));
  for (const d of m.p) assert.ok(JSON.stringify(d).length < 110, `jugador ${d[0]}: ${JSON.stringify(d)}`);
  assert.ok(!JSON.stringify(m.p).includes('"'), 'los jugadores de st no llevan textos (cartas): eso es del `me` de cada uno');
  // un estado sin cambios en los peligros ni puntajes los omite
  const lite = J(packState(s, [], [], 0, { hz: false, sc: false }));
  assert.equal(lite.hz, undefined), assert.equal(lite.sc, undefined);
  assert.ok(JSON.stringify(lite).length < JSON.stringify(m).length - 100);
});

test('st: el estado va y vuelve (posición, banderas, tiempos que faltan, liga, ulti y puntajes)', () => {
  const { s } = played(4, 60 * 25);
  s.pl[1].hook = { x: 20, y: 10, at: s.t + 3, rest: 0, e: -1, ek: 0, ox: 0, oy: 0, ci: 5, cj: 6 };
  s.pl[1].stunT = s.t + 12, s.pl[1].invT = s.t + 40, s.pl[2].shieldT = s.t + 30, s.pl[2].spawnT = s.t + 100, s.pl[3].alive = false;
  s.pl[0].u = { k: 'meteoro', t0: s.t - 20, f: 1, ft: s.t - 5, x: 12.5, y: 30, dx: 0, dy: -1, n: 2, ids: [1] };
  s.pl[0].score = 3, s.pl[0].kos = 2, s.pl[0].dealt = 123.4;
  const { s: g } = newState('islas', 7717, botSeats(4), { ...RULES, time: 0 }, { ...DEFAULTS });
  applyState(g, J(packState(s, [], [], 0)));
  assert.equal(g.t, s.t);
  for (const p of s.pl) {
    const q = g.pl[p.id];
    assert.ok(Math.abs(p.x - q.x) < 0.006 && Math.abs(p.y - q.y) < 0.006 && Math.abs(p.vx - q.vx) < 0.06, `posición de ${p.id}`);
    assert.equal(q.alive, p.alive), assert.equal(q.ground, p.ground), assert.equal(q.face, p.face), assert.equal(q.tumble, p.tumble);
    assert.equal(Math.round(q.dmg), Math.round(p.dmg));
    for (const k of ['invT', 'stunT', 'shieldT', 'fragT', 'leadT', 'glueT', 'cloudT', 'spawnT']) // lo que se mira es «todavía falta»
      assert.equal(s.t < q[k], s.t < p[k], `${k} de ${p.id}`), p[k] > s.t && assert.equal(q[k], p[k]);
    assert.deepEqual(q.hook && [q.hook.x, q.hook.y, q.hook.at, q.hook.e], p.hook && [p.hook.x, p.hook.y, p.hook.at, p.hook.e]);
    assert.equal(!!q.u, !!p.u);
  }
  assert.deepEqual(g.pl[0].u, s.pl[0].u);
  assert.deepEqual([g.pl[0].score, g.pl[0].kos, Math.round(g.pl[0].dealt)], [3, 2, 123]);
});

test('me: tu personaje viaja completo para predecir y en menos de 300 bytes', () => {
  const { s } = played(4, 60 * 25);
  const p = s.pl[1];
  p.hook = { x: 20.123, y: 10.456, at: s.t - 2, rest: 4.321, e: -1, ek: 0, ox: 0, oy: 0, ci: 5, cj: 6 };
  p.stunT = s.t + 9, p.dashT = s.t - 3, p.pressT = s.t - 1, p.groundT = s.t, p.techT = NEVER, p.bonus = 'bomba';
  const d = J(packMe(p, s.t, 1234));
  assert.ok(JSON.stringify(d).length < 300, `${JSON.stringify(d).length} bytes`);
  assert.equal(d[0], s.t), assert.equal(d[1], 1234);
  const q = unpackMe(s.pl[1], d);
  for (const k of ['x', 'y', 'vx', 'vy', 'ddx', 'ddy', 'charge']) assert.ok(Math.abs(q[k] - p[k]) < 0.0006, k);
  for (const k of ['alive', 'ground', 'crouch', 'slide', 'pound', 'tumble', 'held', 'rise', 'dashHeld', 'hookHeld']) assert.equal(q[k], p[k], k);
  for (const k of ['groundT', 'pressT', 'wallT', 'lockT', 'dashT', 'dashCdT', 'hookT', 'stunT', 'stopT', 'techT', 'techT0', 'glueT', 'leadT', 'cloudT'])
    assert.ok(q[k] === p[k] || (p[k] === NEVER || p[k] < s.t - 64) && q[k] === NEVER, `${k}: ${p[k]} ≠ ${q[k]}`);
  assert.deepEqual(q.hand, p.hand), assert.equal(q.bonus, 'bomba'), assert.equal(q.queue[0], p.queue[0]);
  assert.deepEqual(q.hook, p.hook), assert.equal(q.face, p.face), assert.equal(q.air, p.air), assert.equal(q.dashN, p.dashN);
  assert.equal(!!q.u, !!p.u);
});

test('protocolo: el anfitrión rechaza otra versión, otro juego y otra tabla de cartas', () => {
  const sent = [];
  const hn = new HostNet(o => sent.push(o), { diff: () => 2, lobby: () => {}, now: () => 0 });
  const hello = o => hn.message({ t: 'from', id: 2, m: { ...helloMsg('Ana', 'bombin', undefined), ...o } });
  hello({ v: PROTO - 1 });
  assert.deepEqual(sent.splice(0), [{ to: 2, m: { t: 'nope', why: 'proto' } }, { t: 'drop', id: 2 }]);
  hello({ tab: TAB + 1 });
  assert.equal(sent.splice(0)[0].m.why, 'proto');
  hello({ g: 'downcastle' });
  assert.equal(sent.splice(0)[0].m.why, 'game');
  hello({});
  assert.equal(sent.length, 0), assert.equal(hn.peers.get(2).name, 'Ana');
});

test('cola de entradas: una por cuadro, repite si falta y suelta todo si falta mucho; juntar no pierde cartas', () => {
  const seats = [{ name: 'H', ch: 'bombin', team: 0, bot: 0 }, { name: 'G', ch: 'lia', team: 1, bot: 0, peer: 5 }];
  const m = new Match('islas', 3, seats, { ...RULES, time: 0 }, { ...DEFAULTS }, 0);
  const run = () => m.tick(I());
  m.push(1, 10, [I({ x: 1 }), I({ x: 1, jump: true })]);
  run(), assert.equal(m.ack.get(1), 10);
  run(), assert.equal(m.ack.get(1), 11);
  run(), assert.equal(m.starved.get(1), 1), assert.equal(m.ack.get(1), 11); // se atrasó: repite sin confirmar nada nuevo
  assert.equal(m.last.get(1).x, 1);
  for (let k = 0; k < STARVE_NEUTRAL + 2; k++) run();
  assert.equal(m.last.has(1), false, 'sin entradas hace rato: el personaje suelta todo');
  m.forget(1);
  m.push(1, 1, Array.from({ length: QMAX + 5 }, (_, k) => I({ x: 1, cast: k === 1 ? 2 : -1, ax: 0.5, jump: k === 2 })));
  assert.equal(m.queue.get(1).length, QMAX);
  const q = m.queue.get(1);
  assert.equal(q[0].cast, 2), assert.equal(q[0].ax, 0.5), assert.equal(q[0].jump, true); // la carta y el salto de las juntadas siguen ahí
  assert.equal(m.merged.get(1), 5);
});

test('entrar o volver: el terreno anunciado va en `sync` y el que falta en el próximo `st` (sin repetir)', () => {
  const sent = [];
  const hn = new HostNet(o => sent.push(o), { diff: () => 2, lobby: () => {}, now: () => 0 });
  const seats = [{ name: 'H', ch: 'bombin', team: 0, bot: 0 }, { name: 'G', ch: 'lia', team: 1, bot: 0, peer: 2 }];
  const m = new Match('islas', 3, seats, { ...RULES, time: 0 }, { ...DEFAULTS }, 0);
  hn.begin(m);
  for (let k = 0; k < 40; k++) m.w.T.ops.push([0, 20 + k, 14, 1]);
  while (m.s.t < 6) hn.afterTick(m.tick(I()));
  const announced = hn.opsSent;
  assert.ok(announced > 0 && announced <= 40);
  for (let k = 0; k < 10; k++) m.w.T.ops.push([0, 60 + k, 14, 1]); // cortes nuevos que todavía no salieron en un `st`
  sent.length = 0;
  hn.message({ t: 'from', id: 2, m: helloMsg('G', 'lia', undefined) });
  const sync = sent.filter(o => o.m?.t === 'sync').flatMap(o => o.m.ops);
  assert.equal(sync.length, announced);
  assert.equal(sent.filter(o => o.m?.t === 'start').length, 1);
  const lastOps = hn.match.w.T.ops.length - announced;
  while (m.s.t % 3 !== 0) hn.afterTick(m.tick(I()));
  hn.afterTick(m.tick(I()));
  while (m.s.t % 3 !== 0) hn.afterTick(m.tick(I()));
  assert.equal(sent.find(o => o.m?.t === 'st').m.ops.length, lastOps);
});

test('una ráfaga enorme de cortes de terreno sale en trozos (el relay descarta mensajes de más de 16 KB)', () => {
  const sent = [];
  const hn = new HostNet(o => sent.push(o), { diff: () => 2, lobby: () => {}, now: () => 0 });
  const m = new Match('islas', 3, [{ name: 'H', ch: 'bombin', team: 0, bot: 0 }, { name: 'G', ch: 'lia', team: 1, bot: 0, peer: 2 }], { ...RULES, time: 0 }, { ...DEFAULTS }, 0);
  hn.begin(m);
  while (m.s.t % 3 !== 2) hn.afterTick(m.tick(I()));
  for (let k = 0; k < 900; k++) m.w.T.ops.push([0, 10 + k * 0.03, 14.5, 1.2]);
  sent.length = 0;
  hn.afterTick(m.tick(I()));
  assert.ok(sent.length >= 7 && sent.every(o => JSON.stringify(o).length < 16 * 1024));
  const ops = sent.filter(o => o.m?.t === 'sync').flatMap(o => o.m.ops);
  assert.equal(ops.length, 900);
  assert.equal(sent.find(o => o.m?.t === 'st').m.ops, undefined);
});

test('volver: la cola de entradas vieja se descarta y no recibe `me` hasta tener la partida', () => {
  const sent = [];
  const hn = new HostNet(o => sent.push(o), { diff: () => 2, lobby: () => {}, now: () => 0 });
  const seats = [{ name: 'H', ch: 'bombin', team: 0, bot: 0 }, { name: 'G', ch: 'lia', team: 1, bot: 0, peer: 2 }];
  const m = new Match('islas', 3, seats, { ...RULES, time: 0 }, { ...DEFAULTS }, 0);
  hn.message({ t: 'from', id: 2, m: helloMsg('G', 'lia', undefined) });
  hn.begin(m);
  for (let k = 0; k < 6; k++) hn.afterTick(m.tick(I()));
  assert.ok(sent.some(o => o.to === 2 && o.m.t === 'me'));
  m.push(1, 500, [I({ x: 1 }), I({ x: 1 })]); // lo que quedó en la cola con la numeración de antes del corte
  hn.message({ t: 'peer', id: 2, on: false });
  assert.equal(m.s.pl[1].bot, 2, 'mientras no está lo juega un bot');
  hn.message({ t: 'peer', id: 2, on: true, re: true });
  sent.length = 0;
  for (let k = 0; k < 6; k++) hn.afterTick(m.tick(I()));
  assert.ok(!sent.some(o => o.to === 2), 'sin su hello no recibe `me` (iría con otra numeración)');
  assert.ok(sent.some(o => o.m?.t === 'st'), 'el estado de todos sigue saliendo');
  hn.message({ t: 'from', id: 2, m: helloMsg('G', 'lia', undefined) });
  assert.equal(m.queue.get(1), undefined), assert.equal(m.ack.has(1), false);
  assert.equal(sent.filter(o => o.m?.t === 'start').length, 1);
  hn.message({ t: 'from', id: 2, m: { t: 'in', q: 1, f: [packInput(I()), packInput(I())] } });
  assert.equal(m.s.pl[1].bot, 0, 'al llegar sus entradas deja de jugar el bot');
  hn.afterTick(m.tick(I())), hn.afterTick(m.tick(I())), hn.afterTick(m.tick(I()));
  assert.ok(sent.some(o => o.to === 2 && o.m.t === 'me' && o.m.d[1] >= 1), 'ahora sí, con la numeración nueva');
});

test('invitado: sin conexión ignora lo que llega hasta el próximo start (otra numeración) y no predice', () => {
  const seats = [{ name: 'H', ch: 'bombin', team: 0, bot: 0 }, { name: 'G', ch: 'lia', team: 1, bot: 0, peer: 9 }];
  const m = new Match('islas', 3, seats, { ...RULES, time: 0 }, { ...DEFAULTS }, 0);
  const sent = [];
  const gn = new GuestNet(o => sent.push(o));
  gn.myPeer = 9;
  const hn = new HostNet(() => {}, { diff: () => 2, lobby: () => {}, now: () => 0 });
  hn.begin(m);
  gn.message({ t: 'start', map: 'islas', seed: 3, rules: m.s.rules, c: m.w.c, seats: seats.map(s => ({ ...s, peer: s.peer ?? -1 })) }, 0);
  assert.ok(gn.gv instanceof GuestView), assert.equal(gn.gv.me, 1);
  const me = () => ({ t: 'me', d: J(packMe(m.s.pl[1], m.s.t, 7)) });
  for (let k = 0; k < 20; k++) m.tick(I());
  gn.lost();
  gn.message(me(), 0);
  assert.equal(gn.gv.pred, null, 'lo que llega con la conexión caída se ignora');
  assert.deepEqual(gn.tick(I()), []), assert.equal(sent.length, 0);
  assert.equal(gn.gv.hist.length, 0);
});

test('cuenta regresiva: el personaje propio no se mueve en la predicción mientras la sim lo deja quieto', () => {
  const r = runLab({ seg: 6, guests: 1, bots: 0, hostidle: true, wander: true, warm: 0, lat: 80, jit: 30 });
  const g = r.guests[0];
  assert.ok(g.all.n > 50);
  assert.ok(g.all.max < 0.5, `corrección máxima ${g.all.max} m`); // con la cuenta regresiva predicha daba metros
});

test('laboratorio: 3 jugadores + bot a 80 ± 30 ms: terreno idéntico en todos, cola de entradas chica y sin juntar', () => {
  const r = runLab({ seg: 30, guests: 2, bots: 1, lat: 80, jit: 30, netseed: 1 });
  for (const g of r.guests) {
    assert.ok(g.terrainOps && g.terrainGrid, `${g.name}: el terreno difiere del anfitrión`);
    assert.ok(g.players && g.starts === 1);
    assert.ok(g.calm.avg < 0.05 && g.calm.p95 < 0.2, `corrección tranquila: ${JSON.stringify(g.calm)}`);
    assert.ok(g.stalls < g.frames * 0.01, `estancadas ${g.stalls}/${g.frames}`);
  }
  assert.ok(r.host.queue.max <= 6 && r.host.queue.avg < 3, JSON.stringify(r.host.queue));
  assert.equal(r.host.queue.merged, 0);
});

test('laboratorio: la predicción del movimiento a 80 ± 30 ms se corrige en milímetros (sin cartas ni golpes)', () => {
  const r = runLab({ seg: 40, guests: 2, bots: 0, hostidle: true, wander: true, lat: 80, jit: 30, warm: 0 });
  for (const g of r.guests) {
    assert.ok(g.all.n > 200, `muestras ${g.all.n}`);
    assert.ok(g.all.avg < 0.01 && g.all.p99 < 0.1 && g.all.max < 0.5, `${g.name}: ${JSON.stringify(g.all)}`);
    assert.equal(g.jumps, 0);
    assert.ok(g.unacked > 8 && g.unacked < 18, `entradas sin confirmar ${g.unacked}`); // ~ el ping en cuadros más la cola
  }
});

test('laboratorio: entra alguien a mitad de partida (terreno y jugadores iguales, sin saltos al entrar)', () => {
  const r = runLab({ seg: 30, guests: 1, bots: 0, hostidle: true, wander: true, late: 12, warm: 0 });
  const [a, late] = r.guests;
  assert.equal(r.sizes.players, 3); // anfitrión + 1 + el que entró
  for (const g of [a, late]) assert.ok(g.terrainOps && g.terrainGrid && g.players, `${g.name} terreno/jugadores`);
  assert.equal(late.starts, 1), assert.equal(late.seat, 2);
  assert.ok(late.afterJoin && late.afterJoin.n > 20 && late.afterJoin.max < 0.5, JSON.stringify(late.afterJoin));
});

test('laboratorio: reconexión con el mismo pid vuelve al mismo lugar y con la partida entera', () => {
  const r = runLab({ seg: 30, guests: 2, bots: 0, hostidle: true, wander: true, reconnect: '0:12:2', warm: 0 });
  const [a, b] = r.guests;
  assert.equal(a.starts, 2), assert.equal(b.starts, 1);
  assert.equal(a.seat, 1);
  for (const g of [a, b]) assert.ok(g.terrainOps && g.terrainGrid && g.players, `${g.name} terreno/jugadores`);
  assert.ok(a.afterJoin && a.afterJoin.max < 3, JSON.stringify(a.afterJoin)); // lo manejó un bot unos segundos: se acomoda
  assert.ok(b.all.max < 0.5, 'el otro invitado no se entera');
});

test('laboratorio: ancho de banda con 4 y con 8 jugadores bajo el tope', () => {
  const four = runLab({ seg: 30, guests: 2, bots: 1, lat: 80, jit: 30 });
  assert.equal(four.sizes.players, 4);
  assert.ok(four.host.up.st.perSec < 10000, `st ${four.host.up.st.perSec} B/s (antes ~23500)`);
  assert.ok(four.host.up.me.perSec / 2 < 4500, `me por invitado ${four.host.up.me.perSec / 2} B/s (antes ~21000)`);
  for (const g of four.guests) assert.ok(g.downBps < 14000 && g.upBps < 2500, `${g.name}: baja ${g.downBps} sube ${g.upBps}`);
  const eight = runLab({ seg: 20, guests: 7, bots: 0, lat: 80, jit: 30 });
  assert.equal(eight.sizes.players, 8);
  assert.ok(eight.host.up.st.perSec < 18000 && eight.host.upBps < 50000, `anfitrión sube ${eight.host.upBps} B/s`);
  for (const g of eight.guests) assert.ok(g.downBps < 22000, `${g.name} baja ${g.downBps} B/s`);
  assert.ok(eight.host.maxMsgBytes < 3000, `mensaje máximo ${eight.host.maxMsgBytes} B (el relay descarta lo que pase de 16 KB)`);
});

test('laboratorio: con jitter fuerte el retraso de dibujo sube y casi no hay cuadros estancados', () => {
  const r = runLab({ seg: 30, guests: 1, bots: 0, hostidle: true, wander: true, lat: 150, jit: 60, warm: 0 });
  const g = r.guests[0];
  assert.ok(g.delay > 120 && g.delay <= 260, `retraso ${g.delay} ms`);
  assert.ok(g.stalls < g.frames * 0.02, `estancadas ${g.stalls}/${g.frames}`);
  assert.ok(g.all.max < 1.5 && g.all.avg < 0.1, JSON.stringify(g.all)); // con 60 ms de jitter la cola junta alguna entrada: un cuadro de diferencia
});

test('pestaña oculta: el reloj de respaldo late aunque no haya Worker (en Node cae a setInterval)', async () => {
  let n = 0;
  const bg = bgTicker(() => n++, 5);
  assert.equal(bg.running(), false);
  bg.start(), bg.start();
  assert.ok(bg.running());
  await new Promise(r => setTimeout(r, 60));
  bg.stop();
  assert.equal(bg.running(), false);
  assert.ok(n >= 3, `${n} tics`);
  const after = n;
  await new Promise(r => setTimeout(r, 30));
  assert.equal(n, after, 'detenido no late');
  void HZ, void GO;
});
