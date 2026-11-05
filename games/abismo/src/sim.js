// ABISMO — simulación pura (sin DOM). 60 Hz en main.js y en Node (tests).
//
// Tres sistemas que se cruzan:
//  1. DASH: el peregrino tiene cargas de impulso con i-frames. Atravesar a un
//     enemigo lo MARCA (tinta bermellón): la marca sube el daño 65 % y suelta
//     almas extra. El Bruto y el Verdugo solo se abren por marca.
//  2. ARENA DEL RELOJ: los dashes perfectos y las marcas cargan arena. Gastarla
//     DILATA el tiempo: la tinta va al 32 %, vos al 88 %. Es el "ahora sí".
//  3. EL GUARDIÁN: pelea por patrones telegrafiados (rayo que cortan los pilares,
//     barrido en cono, nova de proyectiles, invocación) y queda con el núcleo
//     EXPUESTO después de cada ataque: ahí se le pega el doble.
import {
  WEAPONS, PASSIVES, FOES, RELICS, ARENA, BOSS_AT, BOSS_HP, BOSS_ARMOR, BOSS_SECS,
  MAX_LVL, MAX_WEAPONS, DASH, PILLARS, BOSS, FOE_UNLOCK,
} from './data.js';

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const len = Math.hypot;
const rnd = (s) => s.rng();
const TAU = Math.PI * 2;

export const freshProfile = () => ({ relics: [], descents: 0, corruption: 0, bestTime: 0, kills: 0, chests: 0 });

export const hpMul = (t, ngp) => 1 + t / 60 * 0.3 + (ngp || 0) * 0.35;
export const spawnEvery = (t) => Math.max(0.4, 0.8 - t / 300);
export const spawnCount = (t) => 1 + Math.min(6, Math.floor(t / 24));
export const BASE_SPEED = 300;

export function createSim({ seed = 1, profile = freshProfile(), weapons = ['pua', 'litania'] } = {}) {
  const s = {
    seed, rng: mulberry32(seed), t: 0, dead: false, won: false,
    profile: { ...profile }, relics: [...(profile.relics || [])], ngp: profile.descents || 0,
    p: { x: 0, y: 0, face: -Math.PI / 2 },
    hp: 120, maxhp: 120, speedMul: 1, dmgMul: 1, rateMul: 1, magnet: 150,
    xpMul: 1, crit: 5, armor: 0, regen: 0, bellAtStart: false, startMax: false,
    dashMax: DASH.charges, dashCharges: DASH.charges, dashRecharge: DASH.recharge,
    dashTimer: 0, dashCd: 0, dashT: 0, dashDir: -Math.PI / 2, inv: 0,
    sand: 0.3, dilate: false, dilateHeld: false,
    weapons: [], passives: {}, souls: [], foes: [], shots: [], eshots: [], fields: [], waves: [], parts: [],
    pet: null, spawnT: 0.7, boss: null, bossAt: false, arenaR: ARENA,
    pillars: PILLARS.map((q) => ({ ...q })),
    kills: 0, soulsGot: 0, level: 1, xp: 0, xpNeed: 4, combo: 0, comboT: 0, maxCombo: 0,
    score: 0, choices: null, perfects: 0, dashes: 0, marks: 0, dilateTime: 0, ev: [],
  };
  s.weapons = weapons.map((id) => ({ id, lvl: 1, cd: 0.4, spin: 0 }));
  for (const r of s.relics) {
    const re = RELICS.find((x) => x.id === r);
    if (re) re.apply(s);
  }
  if (s.bellAtStart) s.weapons.push({ id: 'campana', lvl: 1, cd: 0.3, spin: 0 });
  if (s.startMax) for (const w of s.weapons) w.lvl = MAX_LVL;
  s.hp = s.maxhp;
  s.dashCharges = s.dashMax;
  attachHelpers(s);
  for (let i = 0; i < 3; i++) spawnFoe(s);
  s.ev.push({ k: 'start' });
  return s;
}

// ── helpers que las armas usan a través del estado ─────────────────────────
function nearestFoe(s, k = 0) {
  const list = s.foes.filter((f) => !f.dead);
  if (s.boss && !s.boss.dead) list.push(s.boss);
  list.sort((a, b) => ((a.x - s.p.x) ** 2 + (a.y - s.p.y) ** 2) - ((b.x - s.p.x) ** 2 + (b.y - s.p.y) ** 2));
  return list[k] || null;
}
export function attachHelpers(s) {
  s.nearest = () => nearestFoe(s, 0);
  s.kthNearest = (k) => nearestFoe(s, k);
  s.shoot = (kind, a, speed, dmg, extra = {}) => {
    s.shots.push({
      x: s.p.x + Math.cos(a) * 20, y: s.p.y + Math.sin(a) * 20,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      dmg, kind, life: extra.life || 1.25, a, pierce: extra.pierce ?? 0, aoe: extra.aoe || 0, hit: new Set(),
    });
  };
}

// ── daño ───────────────────────────────────────────────────────────────────
export function damageFoe(s, f, dmg, opts = {}) {
  if (!f || f.dead) return 0;
  const crit = rnd(s) * 100 < s.crit;
  let d = dmg * s.dmgMul * (crit ? 2 : 1);
  let kind = crit ? 'crit' : 'hit';

  if (f === s.boss) {
    if (f.iframe > 0) return 0;
    if (f.exposed > 0) d *= 2;
    d *= BOSS_ARMOR;
  } else {
    if (f.mark > 0) {
      d *= DASH.markBonus;
      s.sand = Math.min(1, s.sand + 0.03);
    }
    if (f.kind === 'armored' && !f.mark && !opts.behind) { d *= 0.22; kind = 'clank'; }
    if (f.kind === 'shield' && f.shield > 0 && !f.mark) { d *= 0.15; kind = 'clank'; f.shieldT = 3; }
  }
  d = Math.max(1, Math.round(d));
  f.hp -= d;
  f.hitT = 0.09;
  if (f !== s.boss) {
    s.combo++; s.comboT = 2.2;
    if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  }
  s.ev.push({ k: kind, x: f.x, y: f.y, dmg: d });
  const n = crit ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const a = rnd(s) * TAU;
    s.parts.push({ x: f.x, y: f.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, life: 0.26 + rnd(s) * 0.2, kind: crit ? 'gold' : 'ink', r: 2 + rnd(s) * 3 });
  }
  if (f.hp <= 0) killFoe(s, f);
  return d;
}

function killFoe(s, f) {
  if (f.dead) return;
  f.dead = true;
  if (f === s.boss) {
    s.won = true;
    s.ev.push({ k: 'bosskill', x: f.x, y: f.y });
    return;
  }
  s.kills++;
  s.ev.push({ k: 'kill', x: f.x, y: f.y, id: f.id });
  const n = f.xp + (f.mark > 0 ? 3 : 0);
  for (let i = 0; i < n; i++) {
    const a = rnd(s) * TAU, r = rnd(s) * 14;
    s.souls.push({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, v: 1 });
  }
  if (f.kind === 'bomb') {
    s.fields.push({ x: f.x, y: f.y, r: 96, dmg: 16, t: 0.35, max: 0.35, kind: 'boom', done: false, hostile: true });
    s.ev.push({ k: 'explode', x: f.x, y: f.y });
  }
}

function hurt(s, amt, src) {
  if (s.dead || s.won || s.inv > 0) return;
  const dmg = Math.max(1, Math.round(amt - s.armor));
  s.hp -= dmg;
  s.inv = 0.55;
  s.combo = 0;
  s.ev.push({ k: 'hurt', dmg, x: src ? src.x : s.p.x, y: src ? src.y : s.p.y });
  if (s.hp <= 0) { s.hp = 0; s.dead = true; s.ev.push({ k: 'die' }); }
}

// ── pilares: bloquean movimiento y cortan el rayo del jefe ─────────────────
export function pillarBlocks(s, x1, y1, x2, y2) {
  for (const q of s.pillars) {
    const dx = x2 - x1, dy = y2 - y1;
    const L = dx * dx + dy * dy || 1;
    const u = clamp(((q.x - x1) * dx + (q.y - y1) * dy) / L, 0, 1);
    const px = x1 + dx * u, py = y1 + dy * u;
    if (len(px - q.x, py - q.y) < q.r) return true;
  }
  return false;
}
function pushOutPillars(s, o, extra = 0) {
  for (const q of s.pillars) {
    const dx = o.x - q.x, dy = o.y - q.y, d = len(dx, dy) || 1;
    if (d < q.r + extra) { o.x = q.x + (dx / d) * (q.r + extra); o.y = q.y + (dy / d) * (q.r + extra); }
  }
}

// ── enemigos ───────────────────────────────────────────────────────────────
export function spawnFoe(s, at = null) {
  const pool = FOES.filter((f) => f.id === 'sombra' || (FOE_UNLOCK[f.id] !== undefined && s.t >= FOE_UNLOCK[f.id]));
  const d = pool[Math.floor(rnd(s) * pool.length)];
  const a = rnd(s) * TAU;
  const hp = Math.round(d.hp * hpMul(s.t, s.ngp));
  // aparecen alrededor del jugador (fuera de cuadro) para que la acción nunca quede lejos
  const r = 210 + rnd(s) * 130;
  let fx = at ? at.x : s.p.x + Math.cos(a) * r;
  let fy = at ? at.y : s.p.y + Math.sin(a) * r;
  const dd = len(fx, fy);
  if (dd > s.arenaR - 30) { const k = (s.arenaR - 30) / dd; fx *= k; fy *= k; }
  s.foes.push({
    id: d.id, kind: d.kind, x: fx, y: fy,
    hp, maxhp: hp, speed: d.speed * (1 + s.t / 420), dmg: d.dmg, xp: d.xp, r: d.r,
    st: 'walk', tm: 0, hitT: 0, mark: 0, shield: d.kind === 'shield' ? 160 : 0, shieldT: 0,
    vx: 0, vy: 0, face: 0, t: 0,
  });
}

function stepFoes(s, dt) {
  const p = s.p;
  for (const f of s.foes) {
    if (f.dead) continue;
    f.t += dt;
    f.hitT = Math.max(0, f.hitT - dt);
    f.mark = Math.max(0, f.mark - dt);
    f.shieldT = Math.max(0, f.shieldT - dt);
    const dx = p.x - f.x, dy = p.y - f.y, d = len(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    f.face = Math.atan2(dy, dx);
    let vx = 0, vy = 0;

    if (f.kind === 'lunge') {
      f.tm -= dt;
      if (f.st === 'walk') {
        vx = ux * f.speed; vy = uy * f.speed;
        if (d < 280) { f.st = 'warn'; f.tm = 0.5; }
      } else if (f.st === 'warn') {
        if (f.tm <= 0) { f.st = 'lunge'; f.tm = 0.24; f.vx = ux * 760; f.vy = uy * 760; }
      } else if (f.st === 'lunge') {
        vx = f.vx; vy = f.vy;
        if (f.tm <= 0) { f.st = 'rest'; f.tm = 0.65; }
      } else if (f.st === 'rest' && f.tm <= 0) f.st = 'walk';
    } else if (f.kind === 'shoot') {
      f.tm -= dt;
      if (f.st === 'walk') {
        if (d > 300) { vx = ux * f.speed; vy = uy * f.speed; }
        else if (d < 210) { vx = -ux * f.speed; vy = -uy * f.speed; }
        if (f.tm <= 0 && d < 460) { f.st = 'aim'; f.tm = 0.55; s.ev.push({ k: 'aim', x: f.x, y: f.y, a: f.face }); }
      } else if (f.st === 'aim' && f.tm <= 0) {
        f.st = 'walk'; f.tm = 2.1;
        s.eshots.push({ x: f.x, y: f.y, vx: ux * 300, vy: uy * 300, dmg: f.dmg, life: 2.2 });
        s.ev.push({ k: 'spit', x: f.x, y: f.y });
      }
    } else {
      vx = ux * f.speed; vy = uy * f.speed;
    }

    f.x += vx * dt; f.y += vy * dt;
    pushOutPillars(s, f, f.r * 0.6);
    const dc = len(f.x, f.y);
    if (dc > s.arenaR - f.r * 0.4 && f.st !== 'lunge') { const k = (s.arenaR - f.r * 0.4) / dc; f.x *= k; f.y *= k; }
    if (d < f.r + 22) hurt(s, f.dmg, f);
  }
  s.foes = s.foes.filter((f) => !f.dead);
}

// ── jefe ───────────────────────────────────────────────────────────────────
export function estimateDps(s) {
  let dps = 0;
  for (const w of s.weapons) {
    const wb = WEAPONS.find((x) => x.id === w.id);
    if (!wb) continue;
    const d = { ...wb.base, ...(wb.lv[Math.min(w.lvl - 1, wb.lv.length - 1)] || {}) };
    dps += ((d.dmg || 0) * (d.count || 1)) / d.rate;
  }
  return dps * s.dmgMul * s.rateMul * (1 + s.crit / 100);
}

function spawnBoss(s) {
  const hp = Math.round(((BOSS_HP + estimateDps(s) * BOSS_SECS) * (1 + s.ngp * 0.35)) / BOSS_ARMOR);
  s.boss = {
    x: 0, y: -s.arenaR * 0.55, hp, maxhp: hp, r: BOSS.r,
    st: 'idle', tm: 1.4, phase: 1, iframe: 0, exposed: 0, t: 0, face: 0, rot: 0,
    warnA: 0, warnArc: 0, dead: false,
  };
  s.bossAt = true;
  s.ev.push({ k: 'boss', hp });
}

const BOSS_ROT = ['gaze', 'sweep', 'nova', 'summon'];

function stepBoss(s, dt) {
  const b = s.boss, p = s.p;
  if (!b || b.dead) return;
  b.t += dt;
  b.iframe = Math.max(0, b.iframe - dt);
  b.exposed = Math.max(0, b.exposed - dt);
  b.tm -= dt;
  const dx = p.x - b.x, dy = p.y - b.y, d = len(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  b.face = Math.atan2(dy, dx);

  if (b.phase === 3 && Math.floor(b.t / BOSS.shrink) !== Math.floor((b.t - dt) / BOSS.shrink)) {
    s.arenaR = Math.max(ARENA * 0.45, s.arenaR - 42);
    s.ev.push({ k: 'shrink', r: s.arenaR });
  }

  if (b.st === 'idle') {
    if (d > b.r * 1.55) { b.x += ux * 70 * dt; b.y += uy * 70 * dt; }
    if (b.tm <= 0) {
      b.st = BOSS_ROT[b.rot++ % BOSS_ROT.length]; // rotación fija: se ven todos los patrones
      b.tm = b.st === 'gaze' ? BOSS.gaze.warn : b.st === 'sweep' ? BOSS.sweep.warn : b.st === 'nova' ? BOSS.nova.warn : 0.5;
      if (b.st === 'sweep') { b.warnA = Math.atan2(dy, dx); b.warnArc = BOSS.sweep.arc; }
      s.ev.push({ k: 'boss_warn', atk: b.st });
    }
  } else if (b.st === 'gaze') {
    if (b.tm <= 0) {
      if (!pillarBlocks(s, b.x, b.y, p.x, p.y)) {
        const proj = (p.x - b.x) * ux + (p.y - b.y) * uy;
        const perp = Math.abs((p.x - b.x) * -uy + (p.y - b.y) * ux);
        if (proj > 0 && perp < BOSS.gaze.width) hurt(s, BOSS.gaze.dmg * dt * 4.2, b);
      }
      if (b.tm < -BOSS.gaze.hit) { b.st = 'exposed'; b.tm = BOSS.exposed; b.exposed = BOSS.exposed; s.ev.push({ k: 'boss_exposed' }); }
    }
  } else if (b.st === 'sweep') {
    if (b.tm <= 0) {
      const da = Math.atan2(p.y - b.y, p.x - b.x);
      const diff = Math.abs((((da - b.warnA + Math.PI * 3) % TAU) - Math.PI));
      if (diff < b.warnArc && d < BOSS.sweep.radius) hurt(s, BOSS.sweep.dmg, b);
      if (b.tm < -BOSS.sweep.hit) { b.st = 'exposed'; b.tm = BOSS.exposed; b.exposed = BOSS.exposed; s.ev.push({ k: 'boss_exposed' }); }
    }
  } else if (b.st === 'nova') {
    if (b.tm <= 0) {
      for (let i = 0; i < BOSS.nova.count; i++) {
        const a = (i / BOSS.nova.count) * TAU + 0.2;
        s.eshots.push({ x: b.x, y: b.y, vx: Math.cos(a) * BOSS.nova.speed, vy: Math.sin(a) * BOSS.nova.speed, dmg: BOSS.nova.dmg, life: 2.4 });
      }
      s.ev.push({ k: 'nova', x: b.x, y: b.y });
      b.st = 'exposed'; b.tm = BOSS.exposed; b.exposed = BOSS.exposed; s.ev.push({ k: 'boss_exposed' });
    }
  } else if (b.st === 'summon') {
    if (b.tm <= 0) {
      const n = 1 + b.phase;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + b.t * 0.5;
        spawnFoe(s, { x: b.x + Math.cos(a) * 96, y: b.y + Math.sin(a) * 96 });
      }
      s.ev.push({ k: 'summon' });
      b.st = 'exposed'; b.tm = BOSS.exposed * 0.8; b.exposed = BOSS.exposed * 0.8; s.ev.push({ k: 'boss_exposed' });
    }
  } else if (b.st === 'exposed' && b.tm <= 0) {
    b.st = 'idle'; b.tm = 0.9 + rnd(s) * 0.5;
  }

  if (b.phase === 1 && b.hp < b.maxhp * BOSS.phase2) { b.phase = 2; b.iframe = 1.1; b.st = 'idle'; b.tm = 0.8; s.ev.push({ k: 'bossphase', phase: 2 }); }
  if (b.phase === 2 && b.hp < b.maxhp * BOSS.phase3) { b.phase = 3; b.iframe = 1.1; b.st = 'idle'; b.tm = 0.8; s.ev.push({ k: 'bossphase', phase: 3 }); }

  if (d < b.r * 0.7) hurt(s, 8, b);
}

// ── jugador ────────────────────────────────────────────────────────────────
export function requestDash(s, dir) {
  if (s.dead || s.won || s.dashT > 0 || s.dashCd > 0 || s.dashCharges <= 0) return false;
  s.dashT = DASH.time;
  s.dashDir = dir;
  s.inv = Math.max(s.inv, DASH.iframes);
  s.dashes++;
  if (threatened(s)) { // dash perfecto: arena + dilación
    s.sand = Math.min(1, s.sand + 0.34);
    s.perfects++;
    s.dilate = true;
    s.ev.push({ k: 'perfect', x: s.p.x, y: s.p.y });
  } else {
    s.dashCharges--;
    s.dashTimer = 0;
  }
  s.ev.push({ k: 'dash', x: s.p.x, y: s.p.y, a: dir });
  return true;
}

function threatened(s) {
  const p = s.p;
  for (const f of s.foes) {
    if (f.dead) continue;
    // "a punto de pegar": casi encima, o embistiendo con el aviso ya terminado
    if (len(f.x - p.x, f.y - p.y) < f.r + 30) return true;
    if (f.kind === 'lunge' && (f.st === 'warn' || f.st === 'lunge') && len(f.x - p.x, f.y - p.y) < 210) return true;
  }
  for (const e of s.eshots) if (len(e.x - p.x, e.y - p.y) < 58) return true;
  const b = s.boss;
  if (b && !b.dead && (b.st === 'gaze' || b.st === 'sweep' || b.st === 'nova') && b.tm < 0.2) return true;
  return false;
}

function stepPlayer(s, input, dt) {
  const p = s.p;
  const ix = input.x || 0, iy = input.y || 0;
  const mag = len(ix, iy);
  if (mag > 0.15) p.face = Math.atan2(iy, ix);

  if (s.dashT > 0) {
    s.dashT -= dt;
    p.x += Math.cos(s.dashDir) * DASH.speed * dt;
    p.y += Math.sin(s.dashDir) * DASH.speed * dt;
    for (const f of s.foes) {
      if (f.dead || f.mark > 0) continue;
      if (len(f.x - p.x, f.y - p.y) < f.r + 34) {
        f.mark = DASH.markTime; s.marks++;
        s.sand = Math.min(1, s.sand + 0.06);
        s.ev.push({ k: 'mark', x: f.x, y: f.y });
      }
    }
    if (s.boss && !s.boss.dead && len(s.boss.x - p.x, s.boss.y - p.y) < s.boss.r + 24) {
      s.boss.exposed = Math.max(s.boss.exposed, 0.4);
    }
    s.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.26, kind: 'gold', r: 6 });
    if (s.dashT <= 0) s.dashCd = 0.12;
  } else {
    if (s.dashCd > 0) s.dashCd -= dt;
    if (mag > 0.15) {
      const sp = BASE_SPEED * s.speedMul;
      p.x += (ix / mag) * sp * Math.min(1, mag) * dt;
      p.y += (iy / mag) * sp * Math.min(1, mag) * dt;
    }
  }

  s.dashTimer += dt;
  if (s.dashCharges < s.dashMax && s.dashTimer > s.dashRecharge) {
    s.dashTimer = 0;
    s.dashCharges++;
    s.ev.push({ k: 'charge' });
  }

  pushOutPillars(s, p, 16);
  const dc = len(p.x, p.y);
  if (dc > s.arenaR - 18) { const k = (s.arenaR - 18) / dc; p.x *= k; p.y *= k; }

  if (s.regen > 0) s.hp = Math.min(s.maxhp, s.hp + s.regen * dt);
  s.inv = Math.max(0, s.inv - dt);
  s.comboT -= dt;
  if (s.comboT <= 0 && s.combo > 0) s.combo = 0;
}

// ── step principal ─────────────────────────────────────────────────────────
export function step(s, input = {}, dt = 1 / 60) {
  if (s.dead || s.won) return s;

  // ARENA DEL RELOJ: gastar arena dilata todo lo que no sea el peregrino
  s.dilateHeld = !!input.slow;
  const wantSlow = s.dilateHeld && s.sand > 0.02;
  if (wantSlow !== s.dilate) s.ev.push({ k: wantSlow ? 'dilate_on' : 'dilate_off' });
  s.dilate = wantSlow;
  if (s.dilate) {
    s.sand = Math.max(0, s.sand - dt * 0.34);
    s.dilateTime += dt;
    if (s.sand <= 0) { s.dilate = false; s.ev.push({ k: 'dilate_off' }); }
  } else {
    s.sand = Math.min(1, s.sand + dt * 0.01);
  }
  const wdt = dt * (s.dilate ? 0.32 : 1);
  const pdt = dt * (s.dilate ? 0.88 : 1);

  s.t += dt;
  stepPlayer(s, input, pdt);

  s.spawnT -= wdt;
  if (s.spawnT <= 0) {
    if (!(s.boss && !s.boss.dead)) {
      s.spawnT = spawnEvery(s.t) * (0.8 + rnd(s) * 0.4);
      const n = spawnCount(s.t);
      for (let i = 0; i < n; i++) spawnFoe(s);
    } else s.spawnT = 1;
  }
  if (!s.bossAt && s.t >= BOSS_AT) spawnBoss(s);

  stepFoes(s, wdt);
  stepBoss(s, wdt);

  // armas
  for (const w of s.weapons) {
    const wb = WEAPONS.find((x) => x.id === w.id);
    if (!wb) continue;
    const d = { ...wb.base, ...(wb.lv[Math.min(w.lvl - 1, wb.lv.length - 1)] || {}) };
    const rate = d.rate / s.rateMul;
    w.cd -= wdt;
    w.spin = (w.spin || 0) + wdt * 6;
    if (w.cd > 0) continue;
    if (wb.aura) {
      w.cd = rate;
      const R = d.radius;
      for (const f of s.foes) {
        const dd = len(f.x - s.p.x, f.y - s.p.y);
        if (dd < R + f.r && dd > R - 34) damageFoe(s, f, d.dmg);
      }
      if (s.boss && !s.boss.dead && len(s.boss.x - s.p.x, s.boss.y - s.p.y) < R + s.boss.r) damageFoe(s, s.boss, d.dmg * 0.6);
      s.waves.push({ x: s.p.x, y: s.p.y, r: R - 18, max: R + 14, dmg: 0, life: 0.22, maxLife: 0.22, chain: true });
    } else {
      wb.fire(s, d);
      w.cd = rate;
    }
  }

  // mascota
  if (s.pet && s.pet.life > 0) {
    s.pet.life -= wdt; s.pet.t -= wdt;
    const t = s.nearest();
    if (t) {
      const k = 10 * wdt;
      s.pet.x += (t.x - s.pet.x) * k; s.pet.y += (t.y - s.pet.y) * k;
      if (s.pet.t <= 0 && len(t.x - s.pet.x, t.y - s.pet.y) < t.r + 26) {
        s.pet.t = 0.32;
        for (let i = 0; i < (s.pet.bites || 1); i++) damageFoe(s, t, s.pet.dmg);
      }
    }
  }

  // disparos del jugador
  for (const sh of s.shots) {
    sh.life -= wdt;
    sh.x += sh.vx * wdt; sh.y += sh.vy * wdt;
    if (sh.life <= 0) continue;
    for (const f of s.foes) {
      if (f.dead || sh.hit.has(f)) continue;
      if (len(f.x - sh.x, f.y - sh.y) < f.r + 8) {
        sh.hit.add(f);
        damageFoe(s, f, sh.dmg);
        if (sh.aoe) for (const g of s.foes) if (!g.dead && g !== f && len(g.x - f.x, g.y - f.y) < sh.aoe) damageFoe(s, g, sh.dmg * 0.6);
        if (sh.pierce-- <= 0) { sh.life = 0; break; }
      }
    }
    if (sh.life > 0 && s.boss && !s.boss.dead && !sh.hit.has(s.boss) && len(s.boss.x - sh.x, s.boss.y - sh.y) < s.boss.r) {
      sh.hit.add(s.boss); damageFoe(s, s.boss, sh.dmg); sh.life = 0;
    }
  }
  s.shots = s.shots.filter((sh) => sh.life > 0);

  // disparos enemigos
  for (const e of s.eshots) {
    e.life -= wdt;
    e.x += e.vx * wdt; e.y += e.vy * wdt;
    if (len(e.x - s.p.x, e.y - s.p.y) < 20) { e.life = 0; hurt(s, e.dmg, e); }
  }
  s.eshots = s.eshots.filter((e) => e.life > 0);

  // sellos y explosiones
  for (const f of s.fields) {
    f.t -= wdt;
    if (!f.done && f.t <= 0) {
      f.done = true;
      if (f.hostile) {
        if (len(f.x - s.p.x, f.y - s.p.y) < f.r) hurt(s, f.dmg, f);
      } else {
        for (const g of s.foes) if (!g.dead && len(g.x - f.x, g.y - f.y) < f.r + g.r) damageFoe(s, g, f.dmg);
        if (s.boss && !s.boss.dead && len(s.boss.x - f.x, s.boss.y - f.y) < f.r + s.boss.r) damageFoe(s, s.boss, f.dmg * 0.8);
      }
      s.ev.push({ k: f.hostile ? 'explode' : 'field', x: f.x, y: f.y, r: f.r, kind: f.kind });
    }
  }
  s.fields = s.fields.filter((f) => f.t > -0.25);

  // ondas
  for (const w of s.waves) {
    w.life -= wdt;
    w.r += (w.max - w.r) * 6 * wdt;
    if (w.dmg > 0) {
      w.hitSet = w.hitSet || new Set();
      for (const f of s.foes) {
        if (f.dead || w.hitSet.has(f)) continue;
        if (Math.abs(len(f.x - w.x, f.y - w.y) - w.r) < f.r + 18) { w.hitSet.add(f); damageFoe(s, f, w.dmg); }
      }
    }
  }
  s.waves = s.waves.filter((w) => w.life > 0);

  // almas
  for (const so of s.souls) {
    const dx = s.p.x - so.x, dy = s.p.y - so.y, d = len(dx, dy) || 1;
    if (d < s.magnet) { so.vx += (dx / d) * 1400 * wdt; so.vy += (dy / d) * 1400 * wdt; }
    so.x += so.vx * wdt; so.y += so.vy * wdt;
    if (d < 34) { so.v = 0; s.soulsGot++; addXp(s, 1); s.ev.push({ k: 'soul' }); }
  }
  s.souls = s.souls.filter((so) => so.v > 0);

  for (const pt of s.parts) { pt.life -= wdt; pt.x += pt.vx * wdt; pt.y += pt.vy * wdt; }
  s.parts = s.parts.filter((pt) => pt.life > 0);

  s.score = Math.floor(s.t) * 12 + s.kills * 30 + s.soulsGot * 2 + s.perfects * 40;
  return s;
}

function addXp(s, n) {
  s.xp += Math.round(n * s.xpMul);
  while (s.xp >= s.xpNeed) {
    s.xp -= s.xpNeed;
    s.level++;
    s.xpNeed = Math.round(4 + s.level * 2.4);
    s.ev.push({ k: 'level', level: s.level });
    s.choices = offerUpgrades(s);
  }
}

export function offerUpgrades(s) {
  const pool = [];
  for (const w of WEAPONS) {
    const own = s.weapons.find((x) => x.id === w.id);
    if (!own && s.weapons.length < MAX_WEAPONS) pool.push({ type: 'weapon', id: w.id, name: w.name, icon: w.icon, color: w.color, desc: w.desc, isNew: true });
    else if (own && own.lvl < MAX_LVL) pool.push({ type: 'weapon', id: w.id, name: w.name, icon: w.icon, color: w.color, desc: `nivel ${own.lvl + 1}`, lvl: own.lvl + 1 });
  }
  for (const p of PASSIVES) {
    const n = s.passives[p.id] || 0;
    if (n < p.stack) pool.push({ type: 'passive', id: p.id, name: p.name, icon: p.icon, color: p.color, desc: p.desc });
  }
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr.slice(0, 3);
}

export function applyUpgrade(s, choice) {
  if (!choice) return;
  if (choice.type === 'weapon') {
    const own = s.weapons.find((x) => x.id === choice.id);
    if (own) own.lvl = Math.min(MAX_LVL, own.lvl + 1);
    else s.weapons.push({ id: choice.id, lvl: 1, cd: 0.3, spin: 0 });
  } else if (choice.type === 'passive') {
    const p = PASSIVES.find((x) => x.id === choice.id);
    s.passives[choice.id] = (s.passives[choice.id] || 0) + 1;
    p.apply(s);
    s.dashCharges = Math.min(s.dashMax, s.dashCharges + (choice.id === 'dash' ? 1 : 0));
  }
  s.choices = null;
}
