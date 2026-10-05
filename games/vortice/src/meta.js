// VÓRTICE — progreso persistente (localStorage `vortice.save`): chispas, nivel, misiones,
// cofres, racha diaria, skins y récords. Puro salvo `load`/`persist`.
import { stageAt } from './const.js';

const KEY = 'vortice.save';
export const CHEST_EVERY = 75;   // s de juego acumulados por cofre
export const CHEST_MAX = 3;
export const REVIVE_BASE = 40;   // ✦; se duplica en cada revivida de la misma partida

export const SKINS = [
  { id: 'clasico', name: 'Clásico', color: '#ffffff', trail: 0, cost: 0 },
  { id: 'cian', name: 'Neón', color: '#47f3ff', trail: 1, cost: 150 },
  { id: 'magenta', name: 'Magenta', color: '#ff3df2', trail: 1, cost: 350 },
  { id: 'oro', name: 'Oro', color: '#ffd23f', trail: 2, cost: 800 },
  { id: 'cometa', name: 'Cometa', color: '#9fd8ff', trail: 3, cost: 1600 },
  { id: 'arcoiris', name: 'Arcoíris', color: 'rainbow', trail: 3, cost: 3500 },
  { id: 'corona', name: 'Corona', color: '#c08bff', trail: 2, req: 'Llegá a HEXÁGONO', cond: (s) => maxStage(s) >= 5 },
  { id: 'llama', name: 'Llama', color: '#ff7a2f', trail: 3, req: 'Racha de 3 días', cond: (s) => s.streak.max >= 3 },
  { id: 'plasma', name: 'Plasma', color: '#7dff6a', trail: 2, req: 'Nivel 10', cond: (s) => s.level >= 10 },
  { id: 'fiebre', name: 'Fiebre', color: '#ff2f5b', trail: 3, req: 'FIEBRE 10 veces', cond: (s) => s.stats.fevers >= 10 },
  { id: 'glitch', name: 'Glitch', color: 'glitch', trail: 3, req: 'Solo en cofres', chest: true },
  { id: 'vacio', name: 'Vacío', color: '#111', trail: 3, req: 'Solo en cofres', chest: true },
];

const maxStage = (s) => Math.max(...Object.values(s.best).map((b) => stageAt(b.time)));

// Misiones: `run` mide la partida; `total` acumula en stats (progreso = total − base)
const MT = [
  { id: 'surv', text: (n) => `Sobreviví ${n} s en una partida`, run: (r) => r.time, vals: [12, 18, 25, 32, 40, 50, 60, 75, 90, 120] },
  { id: 'roces', text: (n) => `Hacé ${n} roces en una partida`, run: (r) => r.roces, vals: [4, 8, 12, 18, 25, 35, 50] },
  { id: 'casis', text: (n) => `Hacé ${n} ¡CASI! en una partida`, run: (r) => r.casis, vals: [1, 2, 4, 6, 9, 12] },
  { id: 'escapes', text: (n) => `Escapá al límite con el SALTO ${n} ${n > 1 ? 'veces' : 'vez'} en una partida`, run: (r) => r.escapes, vals: [1, 2, 3, 5, 7, 10] },
  { id: 'pelos', text: (n) => `Hacé ${n} ¡POR UN PELO! en total`, total: 'pelos', vals: [1, 3, 6, 10, 18] },
  { id: 'shards', text: (n) => `Juntá ${n} fragmentos en una partida`, run: (r) => r.shards, vals: [1, 3, 5, 7, 10, 14] },
  { id: 'shardsT', text: (n) => `Juntá ${n} fragmentos en total`, total: 'shards', vals: [8, 20, 40, 80, 150] },
  { id: 'score', text: (n) => `Hacé ${n} puntos en una partida`, run: (r) => r.score, vals: [250, 500, 900, 1600, 3000, 6000, 12000] },
  { id: 'combo', text: (n) => `Llegá a combo ${n}`, run: (r) => r.maxCombo, vals: [4, 6, 9, 12, 16, 22, 30] },
  { id: 'fever', text: (n) => `Encendé la FIEBRE ${n} ${n > 1 ? 'veces' : 'vez'}`, total: 'fevers', vals: [1, 2, 4, 7, 10] },
  { id: 'runs', text: (n) => `Jugá ${n} partidas`, total: 'runs', vals: [3, 5, 8, 12, 20] },
  { id: 'timeT', text: (n) => `Sobreviví ${n} s en total`, total: 'time', vals: [60, 120, 240, 480, 900] },
  { id: 'hiper', text: (n) => `Sobreviví ${n} s en HIPER`, run: (r) => (r.mode === 'hiper' ? r.time : 0), vals: [8, 15, 25, 40, 60], needs: (s) => s.unlocked.hiper },
];

export const xpNeed = (lvl) => 120 + 70 * (lvl - 1);
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dailySeed = () => { let h = 2166136261; for (const c of 'vortice' + today()) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

function fresh() {
  return {
    v: 1, chispas: 0, xp: 0, level: 1, skin: 'clasico', owned: ['clasico'],
    best: { normal: { time: 0, score: 0 }, hiper: { time: 0, score: 0 }, diario: { time: 0, score: 0 } },
    daily: { date: '', best: 0, time: 0 }, streak: { last: '', n: 0, max: 0 }, freeRevive: '',
    unlocked: { hiper: false }, chest: { t: 0, ready: 0 }, missions: [], done: 0,
    stats: { runs: 0, time: 0, shards: 0, roces: 0, fevers: 0, casis: 0, chests: 0, escapes: 0, pelos: 0 },
    settings: { music: true, sfx: true, voice: true, voiceName: '', shake: true, fsAuto: false, control: 'clasico', hand: 'der', jumpSize: 100, barSize: 100 }, tips: {},
  };
}

export function load() {
  let s = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.v === 1) s = { ...s, ...raw, stats: { ...s.stats, ...raw.stats }, best: { ...s.best, ...raw.best }, settings: { ...s.settings, ...raw.settings }, tips: { ...raw.tips } };
  } catch { /* sin almacenamiento */ }
  while (s.missions.length < 3) s.missions.push(newMission(s));
  return s;
}
export function persist(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* lleno o bloqueado */ } }

export function newMission(s, avoid = s.missions.map((m) => m.tid)) {
  const pool = MT.filter((t) => !avoid.includes(t.id) && (!t.needs || t.needs(s)));
  const t = pool[Math.floor(Math.random() * pool.length)];
  const tier = Math.max(0, Math.min(t.vals.length - 1, Math.floor((s.level - 1) / 2) + Math.floor(Math.random() * 3) - 1));
  const n = t.vals[tier];
  return { tid: t.id, n, tier, base: t.total ? s.stats[t.total] : 0, reward: 30 + tier * 30 + Math.floor(Math.random() * 4) * 5, xp: 40 + tier * 25, done: false, fresh: true };
}

export const missionText = (m) => MT.find((t) => t.id === m.tid).text(m.n);

// Progreso actual de una misión con la partida en curso (r puede ser null)
export function missionProg(s, m, r) {
  const t = MT.find((x) => x.id === m.tid);
  if (m.done) return m.n;
  if (t.total) return s.stats[t.total] - m.base + (r ? r[t.total] || 0 : 0);
  return r ? t.run(r) : 0;
}

// Se llama durante la partida: devuelve las misiones recién cumplidas y paga al instante
export function checkMissions(s, r) {
  const out = [];
  for (const m of s.missions) {
    if (!m.done && missionProg(s, m, r) >= m.n) {
      m.done = true; s.done++; s.chispas += m.reward; out.push(m);
      out.push(...addXp(s, m.xp).map((l) => ({ levelUp: l })));
    }
  }
  if (out.length) persist(s);
  return out;
}

// Suma XP; devuelve los niveles alcanzados (cada uno paga chispas)
export function addXp(s, xp) {
  const ups = [];
  s.xp += xp;
  while (s.xp >= xpNeed(s.level)) { s.xp -= xpNeed(s.level); s.level++; s.chispas += 40 + 15 * s.level; ups.push(s.level); }
  return ups;
}

// Racha diaria: la primera partida del día paga 25 ✦ × días (tope 7)
export function dailyLogin(s) {
  const d = today();
  if (s.streak.last === d) return 0;
  const y = new Date(); y.setDate(y.getDate() - 1);
  s.streak.n = s.streak.last === today(y) ? s.streak.n + 1 : 1;
  s.streak.last = d; s.streak.max = Math.max(s.streak.max, s.streak.n);
  const bonus = 25 * Math.min(7, s.streak.n);
  s.chispas += bonus; persist(s);
  return bonus;
}

export const hasFreeRevive = (s) => s.freeRevive !== today();
export function useRevive(s, nth) {
  if (nth === 0 && hasFreeRevive(s)) { s.freeRevive = today(); persist(s); return true; }
  const cost = REVIVE_BASE << nth;
  if (s.chispas < cost) return false;
  s.chispas -= cost; persist(s); return true;
}
export const reviveCost = (s, nth) => (nth === 0 && hasFreeRevive(s) ? 0 : REVIVE_BASE << nth);

// Fin de partida: récords, chispas, XP, cofres. r = { mode, time, score, roces, casis, shards, maxCombo, fevers, escapes, pelos }
export function finishRun(s, r, coinMul = 1) {
  const res = { coins: Math.floor((r.score / 12) * coinMul), xp: Math.floor(r.time * 2 + r.score / 60), levels: [], record: false, prevBest: { ...s.best[r.mode] }, unlocks: [] };
  const b = s.best[r.mode];
  if (r.score > b.score) { b.score = Math.floor(r.score); res.record = true; }
  if (r.time > b.time) b.time = r.time;
  if (r.mode === 'diario') {
    const d = today();
    if (s.daily.date !== d) s.daily = { date: d, best: 0, time: 0 };
    s.daily.best = Math.max(s.daily.best, Math.floor(r.score)); s.daily.time = Math.max(s.daily.time, r.time);
  }
  s.chispas += res.coins;
  const st = s.stats;
  st.runs++; st.time += r.time; st.shards += r.shards; st.roces += r.roces; st.fevers += r.fevers; st.casis += r.casis;
  st.escapes += r.escapes || 0; st.pelos += r.pelos || 0;
  res.levels = addXp(s, res.xp);
  s.chest.t += r.time;
  while (s.chest.t >= CHEST_EVERY && s.chest.ready < CHEST_MAX) { s.chest.t -= CHEST_EVERY; s.chest.ready++; }
  if (s.chest.ready >= CHEST_MAX) s.chest.t = Math.min(s.chest.t, CHEST_EVERY - 0.01);
  if (!s.unlocked.hiper && (s.best.normal.time >= 30 || s.level >= 6)) { s.unlocked.hiper = true; res.unlocks.push('MODO HIPER'); }
  for (const k of SKINS) if (k.cond && !s.owned.includes(k.id) && k.cond(s)) { s.owned.push(k.id); res.unlocks.push(`Skin ${k.name}`); }
  // las misiones cumplidas se reemplazan
  s.missions = s.missions.map((m) => ({ ...m, fresh: false }));
  s.missions.forEach((m, i) => { if (m.done) s.missions[i] = newMission(s); });
  persist(s);
  return res;
}

// Cofre: premio al azar (refuerzo de razón variable)
export const TIERS = ['COMÚN', 'RARO', 'ÉPICO', 'LEGENDARIO', 'JACKPOT'];
const rnd = (a, n) => a + Math.floor(Math.random() * n);
const coinsOf = { 'COMÚN': () => rnd(60, 90), 'RARO': () => rnd(200, 200), 'ÉPICO': () => rnd(500, 400), 'JACKPOT': () => 3000 };
const chestSkins = SKINS.filter((k) => k.chest);

export function openChest(s) {
  if (!s.chest.ready) return null;
  s.chest.ready--; s.stats.chests++;
  const x = Math.random();
  let prize;
  const rare = chestSkins.filter((k) => !s.owned.includes(k.id));
  if (x < 0.01) prize = { coins: coinsOf.JACKPOT(), tier: 'JACKPOT' };
  else if (x < 0.05 && rare.length) { const k = rare[Math.floor(Math.random() * rare.length)]; s.owned.push(k.id); prize = { skin: k, tier: 'LEGENDARIO' }; }
  else if (x < 0.15) prize = { coins: coinsOf['ÉPICO'](), tier: 'ÉPICO' };
  else if (x < 0.4) prize = { coins: coinsOf.RARO(), tier: 'RARO' };
  else prize = { coins: coinsOf['COMÚN'](), tier: 'COMÚN' };
  if (prize.coins) s.chispas += prize.coins;
  persist(s);
  return prize;
}

// Relleno de la tira del cofre (solo se ve, no se paga): un poco más generoso que el sorteo real
export function chestDecoy(tier) {
  if (!tier) { const x = Math.random(); tier = x < 0.02 ? 'JACKPOT' : x < 0.08 ? 'LEGENDARIO' : x < 0.22 ? 'ÉPICO' : x < 0.5 ? 'RARO' : 'COMÚN'; }
  if (tier === 'LEGENDARIO') return { skin: chestSkins[Math.floor(Math.random() * chestSkins.length)], tier };
  return { coins: coinsOf[tier](), tier };
}

export function buySkin(s, id) {
  const k = SKINS.find((x) => x.id === id);
  if (!k || s.owned.includes(id) || !k.cost || s.chispas < k.cost) return false;
  s.chispas -= k.cost; s.owned.push(id); s.skin = id; persist(s);
  return true;
}
