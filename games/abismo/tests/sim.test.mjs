// ABISMO — tests de la sim pura. Cubren las tres mecánicas nuevas:
// dash con marca, arena del reloj (dilación) y los patrones del Guardián.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step, applyUpgrade, requestDash, damageFoe, estimateDps } from '../src/sim.js';
import { BOSS_AT, RELICS, MAX_WEAPONS, MAX_LVL, DASH, BOSS } from '../src/data.js';

const foe = (over = {}) => ({
  id: 'sombra', kind: 'walk', x: 0, y: -120, hp: 999, maxhp: 999, speed: 0, dmg: 0, xp: 1, r: 22,
  st: 'walk', tm: 9, hitT: 0, mark: 0, shield: 0, shieldT: 0, vx: 0, vy: 0, face: 0, t: 0, ...over,
});

test('el que no se mueve muere', () => {
  const s = createSim({ seed: 5 });
  let t = 0;
  while (t < 120 && !s.dead) { step(s, { x: 0, y: 0 }, 1 / 60); if (s.choices) applyUpgrade(s, s.choices[0]); t += 1 / 60; }
  assert.ok(s.dead, 'la horda cubre al que se queda quieto');
  assert.equal(s.won, false);
});

test('el dash gasta una carga, da i-frames y marca a quien atraviesa', () => {
  const s = createSim({ seed: 1 });
  const target = foe({ x: 0, y: -150 });
  s.foes.push(target);
  const before = s.dashCharges;
  assert.equal(requestDash(s, -Math.PI / 2), true);
  assert.ok(s.inv > 0, 'i-frames al salir');
  for (let i = 0; i < 14; i++) step(s, { x: 0, y: -1 }, 1 / 60);
  assert.equal(s.dashCharges, before - 1, 'gasta una carga');
  assert.ok(target.mark > 0, 'la sombra quedó marcada');
  assert.equal(s.marks, 1);
});

test('la marca sube el daño y las cargas se recargan', () => {
  const a = createSim({ seed: 2 }), b = createSim({ seed: 2 });
  a.foes.push(foe({ hp: 9999, maxhp: 9999 }));
  b.foes.push(foe({ hp: 9999, maxhp: 9999 }));
  a.foes[0].mark = 3;
  const hpA = a.foes[0].hp, hpB = b.foes[0].hp;
  damageFoe(a, a.foes[0], 20);
  damageFoe(b, b.foes[0], 20);
  assert.ok(hpA - a.foes[0].hp > hpB - b.foes[0].hp, 'con marca pega más');
  const s = createSim({ seed: 3 });
  requestDash(s, 0);
  for (let i = 0; i < 14; i++) step(s, {}, 1 / 60);
  const spent = s.dashCharges;
  for (let i = 0; i < Math.ceil(DASH.recharge * 60) + 10; i++) step(s, {}, 1 / 60);
  assert.ok(s.dashCharges > spent, 'la carga vuelve sola');
});

test('el dash perfecto no gasta carga, carga arena y dilata el tiempo', () => {
  const s = createSim({ seed: 4 });
  s.foes.push(foe({ x: 0, y: -40, speed: 0 }));
  const charges = s.dashCharges, sand = s.sand;
  requestDash(s, Math.PI / 2);
  assert.equal(s.perfects, 1);
  assert.equal(s.dashCharges, charges, 'el perfecto devuelve la carga');
  assert.ok(s.sand > sand, 'carga arena');
  assert.equal(s.dilate, true, 'entra en dilación');
});

test('dilatar gasta arena y frena a la tinta, no al peregrino', () => {
  const a = createSim({ seed: 6 }), b = createSim({ seed: 6 });
  a.foes.push(foe({ x: 200, y: 0, speed: 100 }));
  b.foes.push(foe({ x: 200, y: 0, speed: 100 }));
  a.sand = 1; b.sand = 0;
  for (let i = 0; i < 30; i++) {
    step(a, { x: 0, y: 0, slow: true }, 1 / 60);
    step(b, { x: 0, y: 0, slow: false }, 1 / 60);
  }
  const movedA = 200 - a.foes[0].x, movedB = 200 - b.foes[0].x;
  assert.ok(movedA < movedB * 0.6, `en dilación la sombra avanza menos (${movedA.toFixed(1)} vs ${movedB.toFixed(1)})`);
  assert.ok(a.sand < 1, 'la arena se consume');
});

test('el Bruto amortigua de frente y se abre con la marca', () => {
  const s = createSim({ seed: 7 });
  const bruto = foe({ id: 'bruto', kind: 'armored', hp: 5000, maxhp: 5000, r: 36 });
  s.foes.push(bruto);
  const h0 = bruto.hp;
  damageFoe(s, bruto, 50);
  const plain = h0 - bruto.hp;
  bruto.mark = 5;
  const h1 = bruto.hp;
  damageFoe(s, bruto, 50);
  const marked = h1 - bruto.hp;
  assert.ok(marked > plain * 2, `la marca rompe la armadura (${marked} vs ${plain})`);
});

test('el Guardián aparece a los BOSS_AT y pelea por patrones', () => {
  const s = createSim({ seed: 8 });
  s.maxhp = 1e6; s.hp = 1e6; // el patrón del jefe se prueba con el peregrino inmortal
  while (s.t < BOSS_AT + 0.5 && !s.dead) { step(s, { x: 0, y: 0 }, 1 / 60); if (s.choices) applyUpgrade(s, s.choices[0]); }
  assert.ok(s.bossAt && s.boss && s.boss.hp > 0);
  const seen = new Set();
  for (let i = 0; i < 60 * 40 && !s.dead && !s.won; i++) {
    step(s, { x: 0, y: 0 }, 1 / 60);
    seen.add(s.boss.st);
  }
  for (const st of ['gaze', 'sweep', 'nova', 'summon', 'exposed']) assert.ok(seen.has(st), `el jefe usa ${st}`);
});

test('el núcleo expuesto recibe el doble', () => {
  const s = createSim({ seed: 9 });
  s.t = BOSS_AT;
  step(s, {}, 1 / 60);
  const b = s.boss;
  b.exposed = 0; b.iframe = 0;
  const h0 = b.hp;
  damageFoe(s, b, 100);
  const normal = h0 - b.hp;
  b.exposed = 2; b.iframe = 0;
  const h1 = b.hp;
  damageFoe(s, b, 100);
  const exposed = h1 - b.hp;
  assert.ok(exposed >= normal * 1.9, `expuesto pega el doble (${exposed} vs ${normal})`);
  assert.ok(BOSS.exposed > 0);
});

test('la vida del jefe se calibra con el DPS del build', () => {
  const weak = createSim({ seed: 10 }), strong = createSim({ seed: 10 });
  strong.weapons.forEach((w) => { w.lvl = MAX_LVL; });
  strong.dmgMul = 2.4; strong.rateMul = 1.8;
  assert.ok(estimateDps(strong) > estimateDps(weak) * 2);
  weak.t = BOSS_AT; step(weak, {}, 1 / 60);
  strong.t = BOSS_AT; step(strong, {}, 1 / 60);
  assert.ok(strong.boss.maxhp > weak.boss.maxhp, 'más DPS = jefe con más vida (pelea parecida)');
});

test('las reliquias cambian el arranque y las de NG+ respetan su requisito', () => {
  const base = createSim({ seed: 11 });
  const withRelics = createSim({ seed: 11, profile: { relics: ['brillo', 'sangre', 'diente', 'umbral'], descents: 0, corruption: 0 } });
  assert.ok(withRelics.dmgMul > base.dmgMul);
  assert.ok(withRelics.maxhp > base.maxhp);
  assert.ok(withRelics.crit > base.crit);
  assert.ok(withRelics.dashMax > base.dashMax);
  const ngp = createSim({ seed: 11, profile: { relics: ['campana', 'ultimo'], descents: 2, corruption: 0 } });
  assert.ok(ngp.weapons.length >= 3, 'la Campana suma un arma');
  assert.ok(ngp.weapons.every((w) => w.lvl === MAX_LVL), 'La Última Página entra al máximo');
});

test('cada reliquia se aplica sin romper el estado', () => {
  for (const r of RELICS) {
    const s = createSim({ seed: 12, profile: { relics: [r.id], descents: 3, corruption: 0 } });
    assert.ok(Number.isFinite(s.hp) && s.hp > 0, `${r.id}: hp`);
    for (let i = 0; i < 180; i++) step(s, {}, 1 / 60);
    assert.ok(Number.isFinite(s.hp) && Number.isFinite(s.sand), `${r.id}: sigue numérico`);
  }
});

test('las mejoras respetan los topes de armas y niveles', () => {
  const s = createSim({ seed: 13 });
  for (let i = 0; i < 90 && !s.dead; i++) { step(s, {}, 1 / 60); if (s.choices) applyUpgrade(s, s.choices[0]); }
  assert.ok(s.weapons.length <= MAX_WEAPONS);
  assert.ok(s.weapons.every((w) => w.lvl >= 1 && w.lvl <= MAX_LVL));
});

test('determinismo y serialización', () => {
  const a = createSim({ seed: 42 }), b = createSim({ seed: 42 });
  for (let i = 0; i < 900; i++) {
    step(a, { x: 0.2, y: -0.3 }, 1 / 60); if (a.choices) applyUpgrade(a, a.choices[0]);
    step(b, { x: 0.2, y: -0.3 }, 1 / 60); if (b.choices) applyUpgrade(b, b.choices[0]);
  }
  assert.equal(a.kills, b.kills);
  assert.equal(a.level, b.level);
  assert.equal(a.boss?.hp, b.boss?.hp);
  const { nearest, kthNearest, shoot, ...rest } = a;
  const round = JSON.parse(JSON.stringify({ ...rest, rng: undefined }));
  assert.ok(Array.isArray(round.foes) && round.weapons.length >= 2);
});
