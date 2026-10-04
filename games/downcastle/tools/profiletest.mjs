#!/usr/bin/env node
/* Pruebas de F3 en Node: perfil (migración, acumulación, antidoble conteo, desbloqueos y
   fusión de tres vías) y la sim con bots (stats.ko_<src>, stats.kill_<kind>, sim.seen).
     node games/downcastle/tools/profiletest.mjs */
import assert from 'node:assert/strict';
import { CFG } from '../src/config.js';
import { genTramo, genExterior, buildLevel } from '../src/level.js';
import { createSim, step } from '../src/sim.js';
import { botFields, botView, botThink, newBotMemory } from '../src/bots.js';
import { migrate, accumulateTramo, accumulateRun, mergeProfile, evalUnlocks, hasRope, cloudData, applyEntitlements } from '../src/profile.js';
import { ROPES, TITLES, ropeColor } from '../src/cosmetics.js';
import { BEASTS } from '../src/beasts.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✓', name); };

test('migra el perfil viejo sin perder nada', () => {
  const p = migrate({ name: 'Ana', color: 'rojo', hero: 'elf_f' });
  assert.equal(p.name, 'Ana'); assert.equal(p.hero, 'elf_f'); assert.equal(p.rope, 'soga');
  assert.deepEqual(p.stats, {}); assert.deepEqual(p.inv, []);
  assert.equal(migrate(null).v, 1);
  assert.deepEqual(migrate({ stats: { kos: 'x', hits: 3 } }).stats, { hits: 3 });
});

const res = (o = {}) => ({
  t: 'res', rid: 7, result: 'won', c: 0, k: 1, s: 1, kind: 'normal', seen: ['goblin', 'imp'],
  stats: { 1: { kos: 1, hits: 2, gems: 12, kills: 3, kill_goblin: 2, kill_imp: 1, ko_imp: 1, ko_spikes: 0, traitorTugs: 4 }, 2: { kos: 0 } },
  ...o,
});

test('acumula un tramo y no lo cuenta dos veces', () => {
  const p = migrate({});
  assert.deepEqual(accumulateTramo(p, res(), 1), []);
  assert.equal(p.stats.gems, 12); assert.equal(p.stats.tramosWon, 1);
  assert.equal(p.beasts.goblin.kills, 2); assert.equal(p.beasts.imp.killedMe, 1);
  assert.equal(p.beasts.goblin.seen, 1); assert.equal(p.stats.ko_spikes, undefined);
  assert.equal(accumulateTramo(p, res(), 1), null); // reconexión: el anfitrión reenvía el res
  assert.equal(p.stats.gems, 12);
  accumulateTramo(p, res({ s: 2 }), 1);
  assert.equal(p.stats.gems, 24); assert.equal(p.beasts.goblin.seen, 2);
});

test('el que miraba no suma estadísticas', () => {
  const p = migrate({});
  assert.deepEqual(accumulateTramo(p, res(), 9), []);
  assert.deepEqual(p.stats, {});
});

test('jefe, bajada limpia, run y desbloqueos', () => {
  const p = migrate({});
  const got = accumulateTramo(p, res({ s: 5, kind: 'boss', boss: 'ojo', seen: ['ojo'], stats: { 1: { bossFinal: 1, kos: 1 } } }), 1);
  assert.equal(p.beasts.ojo.fought, 1); assert.equal(p.beasts.ojo.beaten, 1); assert.equal(p.feats.ojo, 1);
  assert.deepEqual(got.map((g) => g.id).sort(), ['r:trenzada', 't:gracia']);
  const got2 = accumulateTramo(p, res({ s: 6, kind: 'exterior', sub: 'bajada', stats: { 1: { kos: 0 }, 2: { kos: 0 } } }), 1);
  assert.deepEqual(got2.map((g) => g.id), ['r:rayas']);
  assert.deepEqual(accumulateTramo(p, res({ c: 1, s: 0, stats: { 1: {} } }), 1).map((g) => g.id), ['r:cadena']);
  assert.equal(p.best.ciclo, 2);
  accumulateRun(p, { rid: 7, ciclo: 2, tramos: 9, gems: 300 });
  assert.equal(accumulateRun(p, { rid: 7, ciclo: 2, tramos: 9, gems: 300 }), null);
  assert.equal(p.stats.runs, 1); assert.equal(p.best.tramos, 9);
  assert.deepEqual(evalUnlocks(p), []);
  assert.ok(hasRope(p, 'cadena') && hasRope(p, 'soga') && !hasRope(p, 'dorada'));
});

test('fusión: el invitado se suma a la cuenta; con base, solo lo nuevo', () => {
  const cloud = { stats: { gems: 100, kos: 5 }, beasts: { goblin: { kills: 10 } }, best: { ciclo: 2 }, inv: [{ id: 'r:roja', origen: 'hazaña', at: 5 }], prefAt: 10, name: 'Nube' };
  const guest = { stats: { gems: 30 }, beasts: { goblin: { kills: 2 }, imp: { seen: 1 } }, best: { ciclo: 1 }, inv: [{ id: 't:tiron', origen: 'hazaña', at: 3 }], prefAt: 20, name: 'Local', lastRes: 'x' };
  const m = mergeProfile(cloud, guest, null);
  assert.equal(m.stats.gems, 130); assert.equal(m.stats.kos, 5); assert.equal(m.beasts.goblin.kills, 12);
  assert.equal(m.best.ciclo, 2); assert.equal(m.inv.length, 2); assert.equal(m.name, 'Local'); assert.equal(m.lastRes, 'x');
  // Mismo linaje: base = lo último sincronizado; otro dispositivo sumó 50 gemas en la nube
  const base = m, local = mergeProfile(m, { ...m, stats: { ...m.stats, gems: 140 } }, m);
  const cloud2 = { ...m, stats: { ...m.stats, gems: 180 } };
  const m2 = mergeProfile(cloud2, local, base);
  assert.equal(m2.stats.gems, 190); // 180 + (140 − 130)
  assert.equal(mergeProfile(m2, m2, m2).stats.gems, 190); // idempotente
  assert.equal(cloudData(m2).lastRes, undefined);
});

test('derechos de la cuenta van al inventario como compra', () => {
  const p = migrate({ inv: [{ id: 'e:aventurero', origen: 'hazaña' }] });
  applyEntitlements(p, [{ sku: 'aventurero' }, { sku: 'sin_anuncios', created_at: '2026-10-04' }]);
  assert.deepEqual(p.inv.map((i) => i.origen), ['compra', 'compra']);
});

test('catálogo: 8 títulos, 8 cuerdas, colores válidos', () => {
  assert.equal(TITLES.length, 8); assert.equal(ROPES.length, 8);
  for (const r of ROPES) for (let i = 0; i < 12; i++) assert.match(ropeColor(r.id, i, 1.3, false), /^(#|hsl)/);
});

/* Sim con bots: KO con fuente, bajas por tipo y criaturas vistas. */
const STEP = 1 / CFG.SIM_HZ;
function runBots(tramo, players = 2, limit = 150) {
  const lv = buildLevel(tramo), f = botFields(lv);
  const roster = Array.from({ length: players }, (_, i) => ({ id: i + 1, name: 'b' + i, color: '#fff', hero: 'knight_m', bot: true, rope: 'cadena' }));
  const sim = createSim(lv, roster);
  const mem = sim.players.map((p, i) => newBotMemory(i));
  while (sim.status === 'play' && sim.t < limit) {
    const view = botView(sim, f);
    for (const p of sim.players) { const o = botThink(view, view.players[p.idx], mem[p.idx], STEP); p.input.tilt = o.tilt; p.input.hold = o.hold; p.events.push(...o.events); }
    step(sim, STEP); sim.fx.length = 0;
  }
  return sim;
}

test('sim: bots registran criaturas vistas, bajas por tipo y KO con fuente', () => {
  const seen = new Set(), kills = {}, kos = {};
  let koTotal = 0, koWithSrc = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const sim = runBots(genTramo(seed * 101, seed % 3, 2 + (seed % 2), {}));
    assert.equal(sim.players[0].rope, 'cadena');
    for (const k of sim.seen) seen.add(k);
    for (const p of sim.players) {
      koTotal += p.stats.kos;
      for (const [k, v] of Object.entries(p.stats)) {
        if (k.startsWith('kill_')) kills[k] = (kills[k] || 0) + v;
        if (k.startsWith('ko_')) { kos[k] = (kos[k] || 0) + v; koWithSrc += v; }
      }
      const byKind = Object.entries(p.stats).filter(([k]) => k.startsWith('kill_')).reduce((a, [, v]) => a + v, 0);
      assert.equal(byKind, p.stats.kills);
    }
  }
  assert.equal(koWithSrc, koTotal, 'todo KO tiene fuente');
  assert.ok(seen.has('goblin') && seen.size >= 3, 'vistas: ' + [...seen]);
  console.log('   vistas:', [...seen].join(' '), '· bajas:', JSON.stringify(kills), '· KO:', JSON.stringify(kos));
});

test('sim: exterior marca murciélagos o gárgolas; el jefe marca a El Ojo', () => {
  const ext = runBots(genExterior(5, 0, 'bajada', 6), 2, 200);
  assert.ok(ext.seen.has('bat') || ext.seen.has('gargoyle'), 'exterior: ' + [...ext.seen]);
  const boss = runBots(genTramo(9, 0, 4, { boss: true }), 2, 240);
  assert.ok(boss.seen.has('ojo'), 'jefe: ' + [...boss.seen]);
});

console.log(`\n${n} pruebas OK · bestiario: ${BEASTS.length} criaturas`);
