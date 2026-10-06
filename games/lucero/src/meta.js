// LUCERO — progreso persistente (localStorage `lucero.save`): niveles y estrellas, monedas, vidas que
// se recargan con el tiempo, potenciadores que se desbloquean de a uno, racha de victorias, calendario
// diario, misiones del día, cofres y el cielo de constelaciones. Puro salvo `load`/`persist`.
import { S, GEMS } from './const.js';
import { constellation } from './sky.js';

const KEY = 'lucero.save';
export const LIVES_MAX = 5;
export const LIFE_MS = 10 * 60e3;      // una vida cada 10 min
export const STAR_CHEST = 15;          // estrellas nuevas por cofre de estrellas
export const PLUS_MOVES = 5;
export const plusCost = (k) => 100 * (k + 1); // k = compras de +5 en este intento
export const WIN_COINS = [20, 40, 70, 15];     // por dificultad (TIERS), primera vez
export const FEATURES = { sky: 3, quests: 5, streak: 8 }; // nivel desde el que se ven

export const BOOSTERS = [
  { id: 'hammer', name: 'Martillo', desc: 'Rompe una casilla', unlock: 6, price: 190, ingame: true },
  { id: 'comet', name: 'Cometa', desc: 'Empezás con una cometa', unlock: 7, price: 160, pre: S.H },
  { id: 'row', name: 'Estela', desc: 'Barre una fila entera', unlock: 9, price: 220, ingame: true },
  { id: 'nova', name: 'Nova', desc: 'Empezás con una nova', unlock: 11, price: 200, pre: S.NOVA },
  { id: 'shuffle', name: 'Remolino', desc: 'Mezcla las gemas', unlock: 13, price: 150, ingame: true },
  { id: 'star', name: 'Lucero', desc: 'Empezás con un lucero', unlock: 15, price: 320, pre: S.STAR },
];
export const booster = (id) => BOOSTERS.find((b) => b.id === id);
// Racha de victorias: cada nivel ganado seguido suma un especial gratis al empezar (hasta 3)
export const STREAK_GIFTS = [S.H, S.NOVA, S.STAR];

const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return today(d); };
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function fresh() {
  return {
    v: 1, level: 1, stars: {}, best: {}, coins: 200, lives: LIVES_MAX, lifeT: Date.now(), infUntil: 0,
    boosters: Object.fromEntries(BOOSTERS.map((b) => [b.id, 0])), gifted: [],
    streak: 0, spent: 0, chestStars: 0, chests: [],
    daily: { last: '', day: 0 }, quests: { date: '', list: [], bonus: false },
    sky: { k: 0, lit: [] },
    seen: {}, stats: { played: 0, wins: 0, losses: 0, made: [0, 0, 0, 0, 0, 0], combos: 0, gems: 0, maxChain: 0, chests: 0, lit: 0, quests: 0 },
    settings: { music: true, sfx: true, voice: true, vib: true },
  };
}

export function load() {
  let s = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.v === 1) {
      const f = fresh();
      s = { ...f, ...raw, stats: { ...f.stats, ...raw.stats }, settings: { ...f.settings, ...raw.settings }, boosters: { ...f.boosters, ...raw.boosters }, seen: { ...raw.seen } };
    }
  } catch { /* sin almacenamiento */ }
  refreshQuests(s);
  return s;
}
export function persist(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* lleno o bloqueado */ } }

// ── vidas ──
export const infinite = (s, now = Date.now()) => s.infUntil > now;
export function lives(s, now = Date.now()) {
  if (s.lives >= LIVES_MAX) { s.lifeT = now; return s.lives; }
  const k = Math.floor((now - s.lifeT) / LIFE_MS);
  if (k > 0) {
    s.lives = Math.min(LIVES_MAX, s.lives + k); s.lifeT += k * LIFE_MS;
    if (s.lives >= LIVES_MAX) s.lifeT = now;
    persist(s);
  }
  return s.lives;
}
export const nextLifeIn = (s, now = Date.now()) => (lives(s, now) >= LIVES_MAX ? 0 : Math.max(0, LIFE_MS - (now - s.lifeT)));
// La vida se gasta al empezar y se devuelve al ganar (recargar a mitad de nivel no la salva)
export function spendLife(s) {
  if (infinite(s)) return true;
  if (lives(s) <= 0) return false;
  if (s.lives === LIVES_MAX) s.lifeT = Date.now();
  s.lives--; persist(s);
  return true;
}
function refundLife(s) { if (!infinite(s) && s.lives < LIVES_MAX) s.lives++; }
export function refill(s, cost) {
  if (s.coins < cost) return false;
  s.coins -= cost; s.lives = LIVES_MAX; s.lifeT = Date.now(); persist(s);
  return true;
}
export function addInfinite(s, min) { s.infUntil = Math.max(Date.now(), s.infUntil) + min * 60e3; s.lives = LIVES_MAX; }

// ── estrellas ──
export const starsTotal = (s) => Object.values(s.stars).reduce((a, b) => a + b, 0);
export const starsAvail = (s) => starsTotal(s) - s.spent;
export const starsFor = (def, score) => (score >= def.stars[2] ? 3 : score >= def.stars[1] ? 2 : 1);

// ── fin de nivel ──
export function startLevel(s, n) {
  if (!spendLife(s)) return false;
  s.stats.played++; persist(s);
  return true;
}

// Suma lo que dejó la partida (gane o pierda) a estadísticas y misiones
export function runStats(s, st) {
  const S0 = s.stats;
  st.made.forEach((v, k) => { S0.made[k] += v; });
  S0.combos += st.combos; S0.gems += st.gemsTotal; S0.maxChain = Math.max(S0.maxChain, st.maxChain);
  quest(s, 'play', 1);
  quest(s, 'comet', st.made[S.H]); quest(s, 'nova', st.made[S.NOVA]); quest(s, 'fly', st.made[S.FLY]); quest(s, 'star', st.made[S.STAR]);
  quest(s, 'combo', st.combos); quest(s, 'rock', st.rock); quest(s, 'fog', st.fog); quest(s, 'frost', st.frost); quest(s, 'drop', st.drops);
  quest(s, 'booster', st.boosters);
  st.gems.forEach((v, c) => quest(s, 'gemC', v, c));
}

export function winLevel(s, def, score) {
  const n = def.n, got = starsFor(def, score), prev = s.stars[n] || 0;
  const first = n >= s.level;
  const res = { stars: got, prev, newStars: Math.max(0, got - prev), first, coins: first ? WIN_COINS[def.tier] : 5, record: score > (s.best[n] || 0), unlocks: [], chests: [] };
  s.stars[n] = Math.max(prev, got); s.best[n] = Math.max(s.best[n] || 0, Math.floor(score));
  s.coins += res.coins;
  s.chestStars += res.newStars;
  while (s.chestStars >= STAR_CHEST) { s.chestStars -= STAR_CHEST; s.chests.push('star'); res.chests.push('star'); }
  if (first) {
    s.level = n + 1;
    if (n % 10 === 0) { s.chests.push('level'); res.chests.push('level'); }
    for (const b of BOOSTERS) {
      if (s.level >= b.unlock && !s.gifted.includes(b.id)) { s.gifted.push(b.id); s.boosters[b.id] += 3; res.unlocks.push(b); }
    }
  }
  s.streak++; s.stats.wins++;
  refundLife(s);
  quest(s, 'win', 1);
  if (got === 3) quest(s, 'stars3', 1);
  persist(s);
  return res;
}
export function loseLevel(s) {
  const lost = s.streak;
  s.streak = 0; s.stats.losses++; persist(s);
  return lost;
}
export const streakGifts = (s) => (s.level >= FEATURES.streak ? STREAK_GIFTS.slice(0, Math.min(3, s.streak)) : []);

// ── tienda ──
export const SHOP = [
  { id: 'refill', name: 'Vidas llenas', desc: `${LIVES_MAX} vidas ya`, price: 150 },
  { id: 'inf30', name: 'Vidas infinitas', desc: '30 minutos', price: 280 },
  ...BOOSTERS.map((b) => ({ id: b.id, name: `${b.name} ×3`, desc: b.desc, price: Math.round((b.price * 3 * 0.8) / 10) * 10, booster: b })),
];
export function buy(s, id) {
  const it = SHOP.find((x) => x.id === id);
  if (!it || s.coins < it.price) return false;
  if (it.booster && s.level < it.booster.unlock) return false;
  s.coins -= it.price;
  if (id === 'refill') { s.lives = LIVES_MAX; s.lifeT = Date.now(); }
  else if (id === 'inf30') addInfinite(s, 30);
  else s.boosters[id] += 3;
  persist(s);
  return true;
}

// ── calendario diario (7 días; saltear uno vuelve al día 1) ──
export const DAILY = [{ coins: 50 }, { coins: 80 }, { inf: 15 }, { coins: 120 }, { booster: 1 }, { coins: 160 }, { chest: 'big' }];
export const dailyReady = (s) => s.daily.last !== today();
export const dailyNext = (s) => (s.daily.last === today() ? s.daily.day : s.daily.last === yesterday() ? (s.daily.day % 7) + 1 : 1);
export function claimDaily(s) {
  if (!dailyReady(s)) return null;
  const day = dailyNext(s), r = DAILY[day - 1], got = [];
  s.daily = { last: today(), day };
  if (r.coins) { s.coins += r.coins; got.push({ coins: r.coins }); }
  if (r.inf) { addInfinite(s, r.inf); got.push({ inf: r.inf }); }
  if (r.booster) { const b = pickBooster(s); if (b) { s.boosters[b.id] += 2; got.push({ booster: b.id, n: 2 }); } else { s.coins += 100; got.push({ coins: 100 }); } }
  if (r.chest) { s.chests.push(r.chest); got.push({ chest: r.chest }); }
  persist(s);
  return { day, got };
}

// ── cofres ──
const unlockedBoosters = (s) => BOOSTERS.filter((b) => s.level >= b.unlock);
function pickBooster(s) { const u = unlockedBoosters(s); return u.length ? u[Math.floor(Math.random() * u.length)] : null; }
const CHEST = {
  star: { name: 'Cofre de estrellas', coins: [40, 90], boosters: 1, inf: [0.15, 15] },
  quests: { name: 'Cofre del día', coins: [60, 120], boosters: 1, inf: [0.2, 15] },
  level: { name: 'Cofre del camino', coins: [120, 220], boosters: 2, inf: [0.35, 30] },
  sky: { name: 'Cofre celeste', coins: [150, 300], boosters: 3, inf: [1, 30] },
  big: { name: 'Gran cofre', coins: [200, 260], boosters: 2, inf: [1, 60] },
};
export const chestName = (k) => CHEST[k].name;
export function openChest(s, want = null) {
  const at = want ? s.chests.indexOf(want) : 0;
  const kind = s.chests.splice(at < 0 ? 0 : at, 1)[0];
  if (!kind) return null;
  const C = CHEST[kind], items = [];
  const coins = rint(C.coins[0], C.coins[1]);
  s.coins += coins; items.push({ coins });
  for (let k = 0; k < C.boosters; k++) {
    const b = pickBooster(s);
    if (!b) { const c = rint(30, 60); s.coins += c; items[0].coins += c; continue; }
    const have = items.find((x) => x.booster === b.id);
    if (have) have.n++; else items.push({ booster: b.id, n: 1 });
    s.boosters[b.id]++;
  }
  if (Math.random() < C.inf[0]) { addInfinite(s, C.inf[1]); items.push({ inf: C.inf[1] }); }
  s.stats.chests++;
  persist(s);
  return { kind, items };
}

// ── misiones del día ──
const QT = [
  { id: 'win', text: (n) => `Ganá ${n} niveles`, vals: [2, 3, 4, 5], rw: 60 },
  { id: 'play', text: (n) => `Jugá ${n} niveles`, vals: [3, 5, 7], rw: 40 },
  { id: 'stars3', text: (n) => `Conseguí ★★★ en ${n} ${n > 1 ? 'niveles' : 'nivel'}`, vals: [1, 2, 3], rw: 80 },
  { id: 'comet', text: (n) => `Creá ${n} cometas`, vals: [4, 8, 12, 16], rw: 50 },
  { id: 'nova', text: (n) => `Creá ${n} novas`, vals: [2, 4, 6], rw: 60 },
  { id: 'fly', text: (n) => `Creá ${n} luciérnagas`, vals: [3, 6, 10], rw: 50 },
  { id: 'star', text: (n) => `Creá ${n} ${n > 1 ? 'luceros' : 'lucero'}`, vals: [1, 2, 3], rw: 80 },
  { id: 'combo', text: (n) => `Combiná dos especiales ${n} ${n > 1 ? 'veces' : 'vez'}`, vals: [1, 2, 4], rw: 70 },
  { id: 'gemC', text: (n, c) => `Juntá ${n} ${GEMS[c].plural}`, vals: [40, 70, 100, 140], rw: 50, color: true },
  { id: 'fog', text: (n) => `Disipá ${n} nieblas`, vals: [20, 40, 70], rw: 50, needs: (s) => s.level > 4 },
  { id: 'rock', text: (n) => `Rompé ${n} capas de roca`, vals: [10, 20, 35], rw: 55, needs: (s) => s.level > 7 },
  { id: 'frost', text: (n) => `Derretí ${n} escarchas`, vals: [8, 15, 25], rw: 55, needs: (s) => s.level > 13 },
  { id: 'drop', text: (n) => `Bajá ${n} estrellas fugaces`, vals: [2, 4, 6], rw: 60, needs: (s) => s.level > 18 },
  { id: 'light', text: (n) => `Encendé ${n} ${n > 1 ? 'estrellas' : 'estrella'} del cielo`, vals: [1, 2, 3], rw: 50 },
  { id: 'booster', text: (n) => `Usá ${n} ${n > 1 ? 'potenciadores' : 'potenciador'}`, vals: [1, 2, 3], rw: 50, needs: (s) => s.level > 7 },
];
function newQuest(s, avoid) {
  const pool = QT.filter((t) => !avoid.includes(t.id) && (!t.needs || t.needs(s)));
  const t = pool[Math.floor(Math.random() * pool.length)];
  const tier = Math.max(0, Math.min(t.vals.length - 1, Math.floor(s.level / 15) + Math.floor(Math.random() * 2)));
  return { tid: t.id, n: t.vals[tier], c: t.color ? Math.floor(Math.random() * 5) : -1, prog: 0, rw: t.rw + tier * 20, claimed: false };
}
export function refreshQuests(s) {
  if (s.quests.date === today()) return false;
  const list = [];
  while (list.length < 3) list.push(newQuest(s, list.map((q) => q.tid)));
  s.quests = { date: today(), list, bonus: false };
  persist(s);
  return true;
}
export const questText = (q) => QT.find((t) => t.id === q.tid).text(q.n, q.c);
export const questDone = (q) => q.prog >= q.n;
export function quest(s, id, amt, c = -1) {
  if (!amt || s.level < FEATURES.quests) return;
  for (const q of s.quests.list) if (q.tid === id && (q.c < 0 || q.c === c) && !questDone(q)) q.prog = Math.min(q.n, q.prog + amt);
}
export function claimQuest(s, k) {
  const q = s.quests.list[k];
  if (!q || q.claimed || !questDone(q)) return null;
  q.claimed = true; s.coins += q.rw; s.stats.quests++;
  let bonus = false;
  if (!s.quests.bonus && s.quests.list.every((x) => x.claimed)) { s.quests.bonus = true; s.chests.push('quests'); bonus = true; }
  persist(s);
  return { coins: q.rw, bonus };
}
export const questsClaimable = (s) => s.level >= FEATURES.quests && s.quests.list.some((q) => questDone(q) && !q.claimed);

// ── cielo ──
export const skyNow = (s) => constellation(s.sky.k);
export function lightStar(s, idx) {
  const c = skyNow(s);
  if (s.sky.lit.includes(idx) || idx < 0 || idx >= c.pts.length || starsAvail(s) < c.cost) return null;
  s.spent += c.cost; s.sky.lit.push(idx); s.coins += 10; s.stats.lit++;
  quest(s, 'light', 1);
  const res = { coins: 10, complete: null };
  if (s.sky.lit.length === c.pts.length) {
    res.complete = c; s.sky = { k: s.sky.k + 1, lit: [] };
    s.chests.push('sky');
  }
  persist(s);
  return res;
}
// ¿Alcanza para encender alguna? (para el globito del botón)
export const skyAffordable = (s) => s.level >= FEATURES.sky && starsAvail(s) >= skyNow(s).cost;
