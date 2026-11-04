// ABISMO — tests de la sim pura (node --test). Reglas del Descenso, jefe y balance:
// el que no se mueve muere, el Guardián aparece a tiempo, una build completa lo mata
// en un tiempo acotado y las reliquias cambian el poder del peregrino.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step, applyUpgrade, estimateDps } from '../src/sim.js';
import { BOSS_AT, RELICS, MAX_WEAPONS, MAX_LVL } from '../src/data.js';

// Bot de prueba: huye de lo que tiene cerca, junta almas y prioriza las armas al subir.
function bot(s) {
  let rx = 0, ry = 0, threat = 0;
  for (const f of s.foes) {
    const dx = s.p.x - f.x, dy = s.p.y - f.y, d = Math.hypot(dx, dy) || 1;
    if (d < 100) { const w = (100 - d) / 100; rx += dx / d * w; ry += dy / d * w; threat = Math.max(threat, w); }
  }
  if (s.boss && !s.boss.dead) {
    const dx = s.p.x - s.boss.x, dy = s.p.y - s.boss.y, d = Math.hypot(dx, dy) || 1;
    if (d < 200) { const w = (200 - d) / 200 * 1.3; rx += dx / d * w; ry += dy / d * w; threat = Math.max(threat, w); }
  }
  if (Math.hypot(s.p.x, s.p.y) > 1000) { rx -= s.p.x / 1100; ry -= s.p.y / 1100; }
  let best = null, bd = 1e18;
  for (const so of s.souls) { const d = (so.x - s.p.x) ** 2 + (so.y - s.p.y) ** 2; if (d < bd) { bd = d; best = so; } }
  if (best) {
    const d = Math.sqrt(bd) || 1, w = threat < 0.3 ? 1 : 0.35;
    rx += ((best.x - s.p.x) / d) * w; ry += ((best.y - s.p.y) / d) * w;
  }
  const m = Math.hypot(rx, ry) || 1;
  return m > 10 ? { x: rx / m, y: ry / m } : { x: 0, y: 0 };
}

function play(s, { maxT = 420, pick = (s) => s.choices.find((c) => c.type === 'weapon') || s.choices[0] } = {}) {
  let t = 0;
  while (t < maxT && !s.dead && !s.won) {
    step(s, bot(s), 1 / 60);
    if (s.choices) applyUpgrade(s, pick(s));
    t += 1 / 60;
  }
  return t;
}

test('el que no se mueve muere y no vence', () => {
  const s = createSim({ seed: 5 });
  let t = 0;
  while (t < BOSS_AT + 60 && !s.dead) { step(s, { x: 0, y: 0 }, 1 / 60); if (s.choices) applyUpgrade(s, s.choices[0]); t += 1 / 60; }
  assert.equal(s.won, false);
  assert.ok(s.dead, 'sin moverse la horda te cubre');
});

test('el Guardián aparece a los BOSS_AT segundos', () => {
  const s = createSim({ seed: 1 });
  while (s.t < BOSS_AT + 1 && !s.dead) { step(s, { x: 0, y: 0 }, 1 / 60); if (s.choices) applyUpgrade(s, s.choices[0]); }
  assert.ok(s.bossAt, 'bossAt debe estar activo pasado BOSS_AT');
  assert.ok(s.boss && s.boss.hp > 0, 'el jefe existe y tiene vida');
});

test('una build completa mata al Guardián en menos de 120 s de pelea', () => {
  const s = createSim({ seed: 1, weapons: ['pua', 'litania', 'cadenas', 'runas'] });
  s.weapons.forEach((w) => { w.lvl = MAX_LVL; });
  s.passives = { sarten: 8, guantes: 8, corazon: 4 };
  s.dmgMul = 1 + 0.15 * 8; s.rateMul = 1 + 0.1 * 8; s.maxhp = 160; s.hp = 160;
  const dps = estimateDps(s);
  assert.ok(dps > 0);
  const t = play(s, { maxT: BOSS_AT + 130 });
  assert.ok(s.won, `debe vencer (t=${Math.round(t)}, bossHp=${s.boss?.hp})`);
  assert.ok(t - BOSS_AT < 120, 'la pelea no debe eternizarse');
});

test('el jefe se calibra con el DPS: una build débil lo enfrenta más débil', () => {
  const weak = createSim({ seed: 3 });
  const strong = createSim({ seed: 3 });
  strong.weapons.forEach((w) => { w.lvl = MAX_LVL; });
  strong.dmgMul = 2.4; strong.rateMul = 1.8;
  while (weak.t < BOSS_AT + 0.5 && !weak.dead) { step(weak, { x: 0, y: 0 }, 1 / 60); if (weak.choices) applyUpgrade(weak, weak.choices[0]); }
  while (strong.t < BOSS_AT + 0.5 && !strong.dead) { step(strong, { x: 0, y: 0 }, 1 / 60); if (strong.choices) applyUpgrade(strong, strong.choices[0]); }
  assert.ok(strong.boss.hp > weak.boss.hp, `la vida del jefe sigue al poder del jugador (${weak.boss.hp} < ${strong.boss.hp})`);
});

test('las reliquias del Descenso cambian el arranque', () => {
  const base = createSim({ seed: 1 });
  const withRelics = createSim({ seed: 1, profile: { relics: ['brillo', 'sangre', 'diente', 'oro'], descents: 0, corruption: 0 } });
  assert.ok(withRelics.dmgMul > base.dmgMul, 'brillo/oro suben el daño');
  assert.ok(withRelics.maxhp > base.maxhp, 'sangre sube la vida');
  assert.ok(withRelics.crit > base.crit, 'diente sube el crítico');
});

test('las reliquias con requisito no se aplican si no están en el perfil', () => {
  const s = createSim({ seed: 1, profile: { relics: [], descents: 0, corruption: 0 } });
  assert.equal(s.bellAtStart, false);
  assert.equal(s.startMax, false);
  const ngp = createSim({ seed: 1, profile: { relics: ['campana', 'ultimo'], descents: 2, corruption: 0 } });
  assert.equal(ngp.bellAtStart, true, 'la Campana del Despertar suma un arma');
  assert.ok(ngp.weapons.length >= 3);
  assert.ok(ngp.weapons.every((w) => w.lvl === MAX_LVL), 'La Última Página entra con todo al máximo');
});

test('las mejoras de nivel respetan los topes', () => {
  const s = createSim({ seed: 1 });
  for (let i = 0; i < 60 && !s.dead; i++) { step(s, { x: 0, y: 0 }, 1 / 60); if (s.choices) applyUpgrade(s, s.choices[0]); }
  assert.ok(s.weapons.length <= MAX_WEAPONS, `máximo ${MAX_WEAPONS} armas`);
  assert.ok(s.weapons.every((w) => w.lvl >= 1 && w.lvl <= MAX_LVL), 'niveles de arma dentro del rango');
});

test('cada reliquia declarada se puede aplicar sin romper el estado', () => {
  for (const r of RELICS) {
    const s = createSim({ seed: 2, profile: { relics: [r.id], descents: 3, corruption: 0 } });
    assert.ok(Number.isFinite(s.hp) && s.hp > 0, `${r.id}: hp válido`);
    assert.ok(Number.isFinite(s.dmgMul) && s.dmgMul > 0, `${r.id}: dmg válido`);
    for (let i = 0; i < 120; i++) step(s, { x: 0, y: 0 }, 1 / 60);
    assert.ok(Number.isFinite(s.hp), `${r.id}: el estado sigue siendo numérico`);
  }
});

test('la sim es determinista con la misma semilla', () => {
  const a = createSim({ seed: 42 }), b = createSim({ seed: 42 });
  for (let i = 0; i < 900; i++) {
    step(a, { x: 0, y: 0 }, 1 / 60); if (a.choices) applyUpgrade(a, a.choices[0]);
    step(b, { x: 0, y: 0 }, 1 / 60); if (b.choices) applyUpgrade(b, b.choices[0]);
  }
  assert.equal(a.kills, b.kills);
  assert.equal(a.level, b.level);
  assert.equal(a.boss?.hp, b.boss?.hp);
});

test('el estado se puede serializar (los helpers van aparte)', () => {
  const s = createSim({ seed: 1 });
  for (let i = 0; i < 300; i++) step(s, { x: 0, y: 0 }, 1 / 60);
  const { kthNearest, spawnShot, ...rest } = s;
  const round = JSON.parse(JSON.stringify({ ...rest, rng: undefined }));
  assert.ok(round.weapons.length >= 2);
  assert.ok(Array.isArray(round.foes));
});
