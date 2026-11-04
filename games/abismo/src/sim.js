// ABISMO — simulación pura (sin DOM). Corre a 60 Hz desde main.js y en Node (tests).
// Jugador en el centro de un círculo (radio ARENA). Enemigos salen de la oscuridad
// hacia el centro; si te tocan, -HP. Armas automáticas. XP = almas doradas.
// A los BOSS_AT segundos aparece el Guardián: arena cerrada, runas que queman,
// invocaciones. Al morir el Guardián → victoria del Descenso (NG+).
// Eventos { k, ... } en s.ev que main.js vacía. Usan mulberry32 de acá para
// que el azar sea determinista con la semilla.
import { WEAPONS, PASSIVES, FOES, RELICS, ARENA, BOSS_AT, BOSS_HP, BOSS_ARMOR, BOSS_SECS, MAX_LVL, MAX_WEAPONS } from './data.js';

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (s) => s.rng();

export const freshProfile = () => ({ // el Descenso: reliquias + NG+
  relics: [], descents: 0, corruption: 0, bestTime: 0, kills: 0, chests: 0,
});

// Dificultad según el tiempo y NG+ (corrupción acumulada)
export const diffAt = (t, ngp) => {
  const base = 1 + t / 60 * 0.35 + (ngp || 0) * 0.5;
  return base;
};
export const hpMul = (t, ngp) => 1 + t / 60 * 0.28 + (ngp || 0) * 0.4;
export const spawnEvery = (t) => Math.max(0.55, 1.6 - t / 60 * 0.12);
export const BASE_SPEED = 265;

export function createSim({ seed = 1, profile = freshProfile(), runes = [], weapons = ['pua', 'litania'] } = {}) {
  const s = {
    seed, rng: mulberry32(seed), t: 0, dead: false, won: false, over: false, inv: 0,
    profile: { ...profile }, relics: [...(runes.length ? runes : profile.relics)],
    ngp: profile.descents || 0,
    p: { x: 0, y: 0, vx: 0, vy: 0 },
    hp: 100, maxhp: 100, speedMul: 1, dmgMul: 1, rateMul: 1, magnet: 130,
    xpMul: 1, crit: 5, armor: 0, regen: 0, bellAtStart: false, startMax: false,
    weapons: [], passives: {}, souls: [], foes: [], shots: [], waves: [], hits: [], parts: [],
    minion: null, spawnT: 0.8, boss: null, bossAt: false, runes: [], ev: [],
    kills: 0, soulsGot: 0, level: 1, xp: 0, xpNeed: 5, combo: 0, comboT: 0,
    maxCombo: 0, score: 0, fever: 0, rerolls: 2, choices: null,
    stats: { time: 0, kills: 0 },
  };
  s.hp = s.maxhp = 100;
  s.weapons = weapons.map((id) => ({ id, lvl: 1, cd: 0.5 }));
  // reliquias del Descenso
  for (const r of s.relics) {
    const re = RELICS.find((x) => x.id === r);
    if (re) re.apply(s);
  }
  if (s.bellAtStart) { // campana gratis al aparecer
    s.weapons.push({ id: 'campana', lvl: 1, cd: 0.3 });
  }
  if (s.startMax) for (const w of s.weapons) w.lvl = MAX_LVL;
  attachHelpers(s);
  s.ev.push({ k: 'start' });
  return s;
}

// El jefe también es un blanco: las armas automáticas lo apuntan cuando es lo más cercano.
function nearest(s, skip = 0) {
  const targets = s.foes;
  s.foes.sort((a, b) => ((a.x - s.p.x) ** 2 + (a.y - s.p.y) ** 2) - ((b.x - s.p.x) ** 2 + (b.y - s.p.y) ** 2));
  const t = targets[skip] || null;
  if (skip === 0 && s.boss && !s.boss.dead) {
    const db = (s.boss.x - s.p.x) ** 2 + (s.boss.y - s.p.y) ** 2;
    const dt = t ? (t.x - s.p.x) ** 2 + (t.y - s.p.y) ** 2 : Infinity;
    if (db < dt) return s.boss;
  }
  return t;
}
// helpers que las armas usan a través del estado (evita el ciclo de imports)
export function attachHelpers(s) {
  s.kthNearest = (k) => nearest(s, k);
  s.spawnShot = (kind, x, y, a, speed, dmg, rate, extra = {}) => {
    s.shots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, life: 1.4, kind, ...extra });
  };
}

export function spawnFoe(s, atBoss = false) {
  const t = s.t;
  const pool = FOES.filter((f) =>
    (f.id === 'sombra') ||
    (f.id === 'rapaz' && t > 25) ||
    (f.id === 'cuspidista' && t > 55) ||
    (f.id === 'espiritu' && t > 90) ||
    (f.id === 'bruto' && t > 45) ||
    (f.id === 'muro' && t > 130));
  const d = pool[Math.floor(rnd(s) * pool.length)];
  // la horda entra por el borde del círculo, hacia el centro
  const a = rnd(s) * Math.PI * 2;
  const r = ARENA + 30 + rnd(s) * 60;
  const hp = Math.round(d.hp * hpMul(t, s.ngp));
  s.foes.push({
    id: d.id, name: d.name, x: Math.cos(a) * r, y: Math.sin(a) * r,
    hp, maxhp: hp, speed: d.speed * (1 + t / 300), dmg: d.dmg, xp: d.xp,
    r: d.r, kind: d.kind, t: 0, hitT: 0, shootT: 2 + rnd(s) * 2,
  });
}

// DPS teórico del build actual: el jefe se calibra con esto para que la pelea
// dure siempre parecido sin importar cuán rota salga la run.
export function estimateDps(s) {
  let dps = 0;
  for (const w of s.weapons) {
    const wb = WEAPONS.find((x) => x.id === w.id);
    if (!wb) continue;
    const d = { ...wb.base, ...(wb.lv[Math.min(w.lvl - 1, wb.lv.length - 1)] || {}) };
    dps += (d.dmg * (d.count || 1)) / d.rate;
  }
  return dps * s.dmgMul * s.rateMul * (1 + s.crit / 100);
}

function spawnBoss(s) {
  const effective = Math.round(BOSS_HP + estimateDps(s) * BOSS_SECS);
  const hp = Math.round((effective / BOSS_ARMOR) * (1 + s.ngp * 0.35));
  s.boss = { x: 0, y: -ARENA * 0.45, hp, maxhp: hp, phase: 1, t: 0, summonT: 4, dashT: 0, iframe: 0, dead: false };
  s.bossAt = true;
  s.ev.push({ k: 'boss', hp });
}

function hurt(s, amt) {
  if (s.dead || s.won || s.inv > 0) return;
  const dmg = Math.max(1, Math.round(amt - s.armor));
  s.hp -= dmg;
  s.inv = 0.45; // invulnerabilidad breve (el toque no te derrite)
  s.ev.push({ k: 'hurt', dmg });
  if (s.hp <= 0) {
    s.hp = 0; s.dead = true; s.over = true;
    s.ev.push({ k: 'die' });
  }
}

// daño a un enemigo (con crítico y combo)
export function damageFoe(s, f, dmg) {
  if (!f || f.hp <= 0) return;
  const crit = rnd(s) * 100 < s.crit;
  const d = Math.round(dmg * s.dmgMul * (crit ? 2 : 1));
  if (f === s.boss) { // el jefe amortigua el daño y no da almas ni combo
    if (f.iframe > 0) return;
    const bd = Math.round(d * BOSS_ARMOR);
    f.hp -= bd;
    if (crit) s.ev.push({ k: 'crit', x: f.x, y: f.y, dmg: bd });
    if (f.hp <= 0) { f.dead = true; s.won = true; s.over = true; s.ev.push({ k: 'bosskill', x: f.x, y: f.y }); }
    return;
  }
  f.hp -= d;
  f.hitT = 0.1;
  s.combo = Math.min(999, s.combo + 1); s.comboT = 2.5;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  if (crit) s.ev.push({ k: 'crit', x: f.x, y: f.y, dmg: d });
  else s.parts.push({ x: f.x, y: f.y, vx: (rnd(s) - 0.5) * 60, vy: (rnd(s) - 0.5) * 60, life: 0.3, kind: 'ink' });
  if (f.hp <= 0 && !f.dead) {
    f.dead = true; s.kills++; s.stats.kills++;
    s.ev.push({ k: 'kill', x: f.x, y: f.y, id: f.id, xp: f.xp });
    // almas doradas
    for (let i = 0; i < f.xp; i++) {
      s.souls.push({ x: f.x + (rnd(s) - 0.5) * 20, y: f.y + (rnd(s) - 0.5) * 20, vx: (rnd(s) - 0.5) * 40, vy: (rnd(s) - 0.5) * 40, v: 1 });
    }
  }
}

export function step(s, input = { x: 0, y: 0 }, dt = 1 / 60) {
  if (s.dead || s.won) return;
  s.t += dt; s.stats.time = s.t;
  s.inv = Math.max(0, (s.inv || 0) - dt);
  s.comboT = Math.max(0, s.comboT - dt);
  if (s.comboT <= 0) s.combo = 0;

  // ── jugador (rayo del joystick) ──
  const p = s.p;
  const ix = input.x, iy = input.y;
  const mag = Math.hypot(ix, iy);
  if (mag > 0.15) {
    const sp = BASE_SPEED * s.speedMul;
    p.x += (ix / (mag || 1)) * sp * Math.min(1, mag) * dt;
    p.y += (iy / (mag || 1)) * sp * Math.min(1, mag) * dt;
  }
  // el círculo es el mundo
  const dp = Math.hypot(p.x, p.y);
  if (dp > ARENA - 16) { p.x *= (ARENA - 16) / dp; p.y *= (ARENA - 16) / dp; }
  if (s.regen > 0) s.hp = Math.min(s.maxhp, s.hp + s.regen * dt);
  s.fever = Math.max(0, s.fever - dt);

  // ── spawns ──
  s.spawnT -= dt;
  if (s.spawnT <= 0) {
    s.spawnT = spawnEvery(s.t) * (0.8 + rnd(s) * 0.4);
    // con el Guardián en la arena la horda se frena: el jefe invoca lo suyo
    if (!(s.bossAt && s.boss && !s.boss.dead)) {
      spawnFoe(s);
      if (s.t > 100) spawnFoe(s);
    }
  }
  if (!s.bossAt && s.t >= BOSS_AT) spawnBoss(s);

  // ── jefe: runas que queman + invocaciones + dash ──
  if (s.boss && !s.boss.dead) {
    const b = s.boss; b.t += dt;
    if (b.iframe > 0) b.iframe = Math.max(0, b.iframe - dt);
    // el Guardián te persigue despacio: su cuerpo quema, no se puede quedar pegado
    const bdx = p.x - b.x, bdy = p.y - b.y, bdd = Math.hypot(bdx, bdy) || 1;
    b.x += (bdx / bdd) * 58 * dt; b.y += (bdy / bdd) * 58 * dt;
    b.summonT -= dt;
    if (b.summonT <= 0) { b.summonT = Math.max(3.6, 7 - b.phase); for (let i = 0; i < 1 + b.phase; i++) spawnFoe(s, true); s.ev.push({ k: 'summon' }); }
    b.dashT -= dt;
    if (b.dashT <= 0) {
      b.dashT = Math.max(3.4, 7 - b.phase);
      const a = Math.atan2(p.y - b.y, p.x - b.x);
      s.shots.push({ x: b.x, y: b.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, dmg: 12 * (1 + s.ngp * 0.3), life: 2.5, kind: 'dash', foe: false });
      s.ev.push({ k: 'bossdash' });
    }
    // runas giratorias (la zona quema si te quedás); más rápidas en cada fase
    s.runes = [];
    const ra = b.t * (0.4 + 0.12 * b.phase);
    for (let i = 0; i < 3; i++) {
      const ang = ra + i * 2.094;
      s.runes.push({ x: Math.cos(ang) * 300, y: Math.sin(ang) * 300, r: 55 });
      const rx = Math.cos(ang) * 300, ry = Math.sin(ang) * 300;
      if (Math.hypot(p.x - rx, p.y - ry) < 55) hurt(s, 5);
    }
    // tres fases: al cruzar 66 % y 33 % el Guardián se encierra un instante y se enfurece
    if (b.phase === 1 && b.hp < b.maxhp * 0.66) { b.phase = 2; b.iframe = 1.2; s.ev.push({ k: 'bossphase', phase: 2 }); }
    if (b.phase === 2 && b.hp < b.maxhp * 0.33) { b.phase = 3; b.iframe = 1.2; s.ev.push({ k: 'bossphase', phase: 3 }); }
  }

  // ── enemigos ──
  for (const f of s.foes) {
    if (f.dead) continue;
    f.t += dt; f.hitT = Math.max(0, f.hitT - dt);
    const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1;
    let vx = (dx / d) * f.speed, vy = (dy / d) * f.speed;
    if (f.kind === 'shoot') {
      f.shootT -= dt;
      if (f.shootT <= 0) {
        f.shootT = 3;
        s.shots.push({ x: f.x, y: f.y, vx: (dx / d) * 180, vy: (dy / d) * 180, dmg: f.dmg, life: 2, kind: 'spit', foe: true });
      }
    }
    if (f.kind === 'dash' && f.t % 3 < 0.5 && d < 400) { vx *= 2.4; vy *= 2.4; }
    f.x += vx * dt; f.y += vy * dt;
    if (d < f.r + 14) hurt(s, f.dmg);
  }
  s.foes = s.foes.filter((f) => !f.dead);

  // ── armas automáticas ──
  for (const w of s.weapons) {
    w.cd -= dt;
    if (w.cd > 0) continue;
    const wb = WEAPONS.find((x) => x.id === w.id);
    const d = { ...wb.base, ...(wb.lv[Math.min(w.lvl - 1, wb.lv.length - 1)] || {}) };
    const rate = d.rate * (1 / s.rateMul);
    wb.fire(s, { ...d, rate }, s.rng);
    w.cd = rate;
  }
  // minion (Leviatán): muerde al más cercano cada 0,4 s (también al jefe)
  if (s.minion && s.minion.life > 0) {
    s.minion.life -= dt; s.minion.t -= dt;
    let t = nearest(s);
    if (s.boss && !s.boss.dead && (!t || Math.hypot(s.boss.x - s.minion.x, s.boss.y - s.minion.y) < Math.hypot(t.x - s.minion.x, t.y - s.minion.y))) t = s.boss;
    if (t && t !== s.boss) {
      s.minion.x += (t.x - s.minion.x) * 8 * dt; s.minion.y += (t.y - s.minion.y) * 8 * dt;
      if (s.minion.t <= 0 && Math.hypot(t.x - s.minion.x, t.y - s.minion.y) < 34) {
        s.minion.t = 0.4; damageFoe(s, t, (s.minion.dmg || 14) * s.dmgMul);
      }
    } else if (s.boss) {
      s.minion.x += (s.boss.x - s.minion.x) * 8 * dt; s.minion.y += (s.boss.y - s.minion.y) * 8 * dt;
      if (s.minion.t <= 0 && Math.hypot(s.boss.x - s.minion.x, s.boss.y - s.minion.y) < 70) {
        s.minion.t = 0.4;
        s.boss.hp -= Math.round((s.minion.dmg || 14) * s.dmgMul);
        if (s.boss.hp <= 0) { s.boss.dead = true; s.won = true; s.over = true; s.ev.push({ k: 'bosskill', x: s.boss.x, y: s.boss.y }); }
      }
    }
  }

  // ── disparos ──
  for (const sh of s.shots) {
    sh.life -= dt;
    sh.x += sh.vx * dt; sh.y += sh.vy * dt;
    if (sh.foe) { // del enemigo: pega al jugador
      if (Math.hypot(sh.x - p.x, sh.y - p.y) < 16) { sh.life = 0; hurt(s, sh.dmg); }
      continue;
    }
    if (sh.kind === 'dash') { if (Math.hypot(sh.x - p.x, sh.y - p.y) < 26) { sh.life = 0; hurt(s, sh.dmg); } continue; }
    if (sh.pierce) sh.pierce--;
    for (const f of s.foes) {
      if (f.dead) continue;
      if (Math.hypot(f.x - sh.x, f.y - sh.y) < f.r + 10) {
        damageFoe(s, f, sh.dmg);
        if (sh.aoe) for (const g of s.foes) if (g !== f && Math.hypot(g.x - f.x, g.y - f.y) < sh.aoe) damageFoe(s, g, sh.dmg * 0.5);
        if (sh.pierce === undefined || sh.pierce < 0) { sh.life = 0; break; }
      }
    }
    if (sh.life > 0 && s.boss && !s.boss.dead) {
      const b = s.boss;
      if (Math.hypot(b.x - sh.x, b.y - sh.y) < 46) {
        damageFoe(s, b, sh.dmg);
        sh.life = 0;
      }
    }
  }
  s.shots = s.shots.filter((sh) => sh.life > 0);

  // ── ondas, hits y runas del jugador ──
  for (const wv of s.waves) {
    wv.r += 520 * dt; wv.life -= dt;
    for (const f of s.foes) {
      if (f.dead || f._w === wv) continue;
      if (Math.hypot(f.x - wv.x, f.y - wv.y) < wv.r + f.r && Math.hypot(f.x - wv.x, f.y - wv.y) > wv.r - 40) {
        f._w = wv; damageFoe(s, f, wv.dmg);
        const a = Math.atan2(f.y - wv.y, f.x - wv.x);
        f.x += Math.cos(a) * 30; f.y += Math.sin(a) * 30; // empuja
      }
    }
    if (s.boss && !s.boss.dead && !wv._b) {
      const b = s.boss;
      if (Math.hypot(b.x - wv.x, b.y - wv.y) < wv.r + 46 && Math.hypot(b.x - wv.x, b.y - wv.y) > wv.r - 40) {
        wv._b = true;
        b.hp -= Math.round(wv.dmg * s.dmgMul);
        if (b.hp <= 0) { b.dead = true; s.won = true; s.over = true; s.ev.push({ k: 'bosskill', x: b.x, y: b.y }); }
      }
    }
  }
  s.waves = s.waves.filter((w) => w.r <= w.max && w.life > 0);
  for (const h of s.hits) {
    h.life -= dt;
    if (!h.done) {
      for (const f of s.foes) if (!f.dead && Math.hypot(f.x - h.x, f.y - h.y) < h.r) damageFoe(s, f, h.dmg);
      if (s.boss && !s.boss.dead && Math.hypot(s.boss.x - h.x, s.boss.y - h.y) < h.r + 40) damageFoe(s, s.boss, h.dmg * 0.85);
      h.done = true;
    }
  }
  s.hits = s.hits.filter((h) => h.life > 0);

  // ── almas ──
  for (const so of s.souls) {
    const dx = p.x - so.x, dy = p.y - so.y, d = Math.hypot(dx, dy) || 1;
    if (d < s.magnet) { so.vx += (dx / d) * 900 * dt; so.vy += (dy / d) * 900 * dt; }
    so.x += so.vx * dt; so.y += so.vy * dt;
    if (Math.hypot(p.x - so.x, p.y - so.y) < 28) { so.v = 0; s.soulsGot++; addXp(s, 1); }
  }
  s.souls = s.souls.filter((so) => so.v > 0);

  // ── partículas ──
  for (const pt of s.parts) { pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; }
  s.parts = s.parts.filter((pt) => pt.life > 0);

  s.score = Math.floor(s.t) * 10 + s.kills * 25 + Math.floor(s.soulsGot * 2);
  return s;
}

function addXp(s, n) {
  s.xp += Math.round(n * s.xpMul);
  while (s.xp >= s.xpNeed) {
    s.xp -= s.xpNeed;
    s.level++;
    s.xpNeed = Math.round(4 + s.level * 2.4);
    s.ev.push({ k: 'level', level: s.level });
    // propuesta de 3 cartas (el juego pausa hasta elegir)
    s.choices = offerUpgrades(s);
  }
}

// Opciones de mejora: armas nuevas, subir arma, pasivas
export function offerUpgrades(s) {
  const pool = [];
  for (const w of WEAPONS) {
    const own = s.weapons.find((x) => x.id === w.id);
    if (!own && s.weapons.length < MAX_WEAPONS) pool.push({ type: 'weapon', id: w.id, name: w.name, icon: w.icon, color: w.color, desc: w.desc, new: true });
    else if (own && own.lvl < MAX_LVL) pool.push({ type: 'weapon', id: w.id, name: w.name + ' +' + (own.lvl + 1), icon: w.icon, color: w.color, desc: 'sube de nivel', lvl: own.lvl + 1 });
  }
  for (const p of PASSIVES) {
    const n = s.passives[p.id] || 0;
    if (n < p.stack) pool.push({ type: 'passive', id: p.id, name: p.name, icon: p.icon, color: p.color, desc: p.desc });
  }
  // baraja determinista
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr.slice(0, 3);
}

export function applyUpgrade(s, choice) {
  if (!choice) return;
  if (choice.type === 'weapon') {
    const own = s.weapons.find((x) => x.id === choice.id);
    if (own) own.lvl = Math.min(5, own.lvl + 1);
    else s.weapons.push({ id: choice.id, lvl: 1, cd: 0.3 });
  } else if (choice.type === 'passive') {
    const p = PASSIVES.find((x) => x.id === choice.id);
    s.passives[choice.id] = (s.passives[choice.id] || 0) + 1;
    p.apply(s);
  }
  s.choices = null;
}
