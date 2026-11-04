// ABISMO — meta progresión (localStorage `abismo.save`): reliquias, Descensos,
// corrupción, récords, misiones diarias, cofres, skins y ajustes.
import { RELICS, REQ_NAME } from './data.js';

const KEY = 'abismo.save';
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fresh() {
  return {
    v: 1,
    descents: 0, corruption: 0, relics: [], // relics: ids en orden de elección
    bestTime: 0, bestScore: 0, totalKills: 0, totalRuns: 0, totalSouls: 0, totalTime: 0,
    chests: 0, chestsOpened: 0,
    skin: 'peregrino', owned: ['peregrino'], coins: 0, fitcoins: 0,
    daily: { date: '', streak: 0, best: 0 }, missions: [], done: 0,
    settings: { music: true, sfx: true, shake: true, vibrate: true, fsAuto: false, hand: 'der', jsSize: 100, reduced: false },
    tips: {},
  };
}

export function load() {
  let s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      s = { ...fresh(), ...p, settings: { ...fresh().settings, ...(p.settings || {}) }, daily: { ...fresh().daily, ...(p.daily || {}) } };
    }
  } catch { /* datos rotos: empezar de cero */ }
  return s;
}
export function persist(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ } }

// Reliquias elegibles según el progreso (NG+ desbloquea el siguiente bloque)
export function relicPool(s) {
  return RELICS.filter((r) => {
    if (!r.req) return true;
    if (r.req === 'ngp1') return s.descents >= 1;
    if (r.req === 'ngp2') return s.descents >= 2;
    return true;
  });
}
export function relicChoices(s, rng = Math.random) {
  const pool = relicPool(s);
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr.slice(0, 3);
}

// Al terminar un Descenso (morir o vencer): la corrupción sube y la elección paga
export function endDescent(s, { dead, won, time, score, kills, souls }) {
  const before = { descents: s.descents, corruption: s.corruption };
  s.totalRuns++;
  s.totalTime += Math.round(time); s.totalKills += kills; s.totalSouls += souls;
  if (time > s.bestTime) s.bestTime = Math.round(time);
  if (score > s.bestScore) s.bestScore = score;
  if (won) { s.descents++; s.chests += s.descents; if (s.descents === 1) s.coins += 200; }
  else { s.corruption++; }
  // misiones del día
  for (const m of s.missions) {
    if (m.done) continue;
    if (m.check && m.check({ kills, time, souls })) { m.done = true; s.done++; s.coins += 50; }
  }
  persist(s);
  return before;
}

// Misiones diarias: 3 fijas por día (semilla del día para que sean estables)
const MISSIONS = [
  { id: 'kills30', text: 'Matá 30 enemigos en un Descenso', goal: 30, check: (r) => r.kills >= 30, base: 'kills' },
  { id: 'kills80', text: 'Matá 80 enemigos en un Descenso', goal: 80, check: (r) => r.kills >= 80, base: 'kills' },
  { id: 'time60', text: 'Sobreviví 60 s en un Descenso', goal: 60, check: (r) => r.time >= 60, base: 'time' },
  { id: 'time150', text: 'Sobreviví 150 s en un Descenso', goal: 150, check: (r) => r.time >= 150, base: 'time' },
  { id: 'boss', text: 'Vencé al Guardián', goal: 1, check: (r) => r.won, base: 'won' },
  { id: 'souls30', text: 'Juntá 30 almas en un Descenso', goal: 30, check: (r) => r.souls >= 30, base: 'souls' },
];
export function dailyMissions(s) {
  const dstr = today();
  if (!s.missions.length || s.daily.date !== dstr) {
    const seedStr = 'abismo' + dstr;
    let h = 2166136261; for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const rng = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 3266489909) >>> 0; return ((h >>> 13) >>> 0) / 4294967296; };
    const picks = [];
    const arr = [...MISSIONS];
    for (let i = 0; i < 3; i++) picks.push(arr.splice(Math.floor(rng() * arr.length), 1)[0]);
    s.missions = picks.map((p) => ({ ...p, done: false }));
    s.daily = { date: dstr, streak: 0, best: 0, claimed: false };
  }
  return s.missions;
}

export const SKINS = [
  { id: 'peregrino', name: 'Peregrino', color: '#ffd23f', desc: 'el que empezó todo', cost: 0 },
  { id: 'escribano', name: 'Escribano', color: '#f3ecff', desc: 'tinta blanca', cost: 250, req: 'Vencer 1 vez', cond: (s) => s.descents >= 1 },
  { id: 'hereje', name: 'Hereje', color: '#ff2f5b', desc: 'rojo de fogata', cost: 500, req: 'Vencer 2 veces', cond: (s) => s.descents >= 2 },
  { id: 'umbral', name: 'Umbral', color: '#9fd8ff', desc: 'celeste espectral', cost: 900, req: 'Corrupción 8', cond: (s) => s.corruption >= 8 },
  { id: 'dorado', name: 'Dorado', color: '#ff9d2e', desc: 'oro gastado', cost: 1600, req: '1000 enemigos en total', cond: (s) => s.totalKills >= 1000 },
];
