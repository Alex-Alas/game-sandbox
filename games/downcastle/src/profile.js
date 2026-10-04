/* Perfil del jugador (puro: se prueba en Node). Misma forma en localStorage y en la nube
   (Supabase: profiles.data). El progreso es experiencia, nunca mejoras: contadores
   acumulados, mejores marcas, bestiario, hazañas e inventario de cosméticos.

   { v, name, color, hero, title, rope, prefAt,          ← elecciones (gana la más reciente)
     stats: { <contadores de sim.js>, tramosWon, runs },  ← sumas
     best: { ciclo, tramos, gems },                       ← máximos
     beasts: { <kind>: { seen, kills, killedMe, fought, beaten } },
     feats: { ojo, bajadaLimpia },
     inv: [{ id: 't:<título>' | 'r:<cuerda>' | 'e:<sku>', origen: 'hazaña' | 'compra', at }],
     updatedAt,
     acct, lastRes, lastRun }                             ← solo locales (cuenta enlazada y antidoble conteo) */
import { load, store } from './config.js';
import { TITLES, ROPES } from './cosmetics.js';

export const PKEY = 'downcastle.profile';
export const BKEY = 'downcastle.profile.base'; // copia de lo último sincronizado (base de la fusión)
const LOCAL_ONLY = ['acct', 'lastRes', 'lastRun'];
const now = () => Date.now();

export function newProfile() {
  return {
    v: 1, name: '', color: 'amarillo', hero: 'knight_m', title: '', rope: 'soga', prefAt: 0,
    stats: {}, best: { ciclo: 0, tramos: 0, gems: 0 }, beasts: {}, feats: {}, inv: [], updatedAt: 0,
    acct: null, lastRes: '', lastRun: '',
  };
}

const nums = (o) => {
  const out = {};
  if (o && typeof o === 'object') for (const k in o) if (Number.isFinite(o[k])) out[k] = o[k];
  return out;
};

/* Cualquier cosa (perfil viejo { name, color, hero }, JSON de la nube, null) → perfil válido. */
export function migrate(raw) {
  const p = newProfile();
  if (!raw || typeof raw !== 'object') return p;
  for (const k of ['name', 'color', 'hero', 'title', 'rope', 'acct', 'lastRes', 'lastRun']) if (typeof raw[k] === 'string') p[k] = raw[k];
  for (const k of ['prefAt', 'updatedAt']) if (Number.isFinite(raw[k])) p[k] = raw[k];
  p.stats = nums(raw.stats);
  p.feats = nums(raw.feats);
  p.best = { ...p.best, ...nums(raw.best) };
  if (raw.beasts && typeof raw.beasts === 'object') for (const k in raw.beasts) p.beasts[k] = nums(raw.beasts[k]);
  if (Array.isArray(raw.inv)) {
    p.inv = raw.inv.filter((i) => i && typeof i.id === 'string')
      .map(({ id, origen, at }) => ({ id, origen: origen === 'compra' ? 'compra' : 'hazaña', at: +at || 0 }));
  }
  return p;
}

export const loadProfile = () => migrate(load(PKEY, null));
export const storeProfile = (p) => store(PKEY, p);

const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
const beast = (p, kind) => (p.beasts[kind] ||= {});

/* Suma un tramo terminado (mensaje 'res' del anfitrión) al perfil de myId. Devuelve los
   cosméticos recién ganados, o null si ese tramo ya se había contado (reconexión). */
export function accumulateTramo(p, res, myId) {
  const key = `${res.rid}:${res.c}:${res.s}`;
  if (res.rid != null && p.lastRes === key) return null;
  p.lastRes = key;
  const mine = res.stats?.[myId];
  if (!mine) return []; // miraba: no estaba en el tramo
  const won = res.result === 'won';
  for (const [k, v] of Object.entries(mine)) {
    if (!v) continue;
    if (k.startsWith('kill_')) add(beast(p, k.slice(5)), 'kills', v);
    else if (k.startsWith('ko_') && k !== 'ko_') add(beast(p, k.slice(3)), 'killedMe', v);
    else add(p.stats, k, v);
  }
  for (const kind of res.seen || []) add(beast(p, kind), 'seen', 1);
  if (won) add(p.stats, 'tramosWon', 1);
  if (res.kind === 'boss') {
    const B = beast(p, res.boss || 'ojo');
    add(B, 'fought', 1);
    if (won) { add(B, 'beaten', 1); add(p.feats, res.boss || 'ojo', 1); }
  }
  if (won && res.kind === 'exterior' && res.sub === 'bajada' && Object.values(res.stats || {}).every((s) => !s.kos)) add(p.feats, 'bajadaLimpia', 1);
  p.best.ciclo = Math.max(p.best.ciclo || 0, (res.c || 0) + 1);
  p.updatedAt = now();
  return evalUnlocks(p);
}

/* Suma una run terminada (mensaje 'runend'). */
export function accumulateRun(p, msg) {
  const key = `run:${msg.rid}`;
  if (msg.rid != null && p.lastRun === key) return null;
  p.lastRun = key;
  add(p.stats, 'runs', 1);
  p.best.ciclo = Math.max(p.best.ciclo || 0, msg.ciclo || 0);
  p.best.tramos = Math.max(p.best.tramos || 0, msg.tramos || 0);
  p.best.gems = Math.max(p.best.gems || 0, msg.gems || 0);
  p.updatedAt = now();
  return evalUnlocks(p);
}

export const owns = (p, id) => p.inv.some((i) => i.id === id);

/* Agrega al inventario lo que ya se ganó. Devuelve los nuevos [{ id, kind, name }]. */
export function evalUnlocks(p) {
  const out = [];
  const give = (id, kind, name) => { p.inv.push({ id, origen: 'hazaña', at: now() }); out.push({ id, kind, name }); };
  for (const t of TITLES) if (!owns(p, 't:' + t.id) && t.cond(p)) give('t:' + t.id, 'título', t.name);
  for (const r of ROPES) if (!r.free && !owns(p, 'r:' + r.id) && r.cond(p)) give('r:' + r.id, 'cuerda', r.name);
  return out;
}

export const hasTitle = (p, id) => !id || owns(p, 't:' + id);
export const hasRope = (p, id) => ROPES.find((r) => r.id === id)?.free || owns(p, 'r:' + id);

/* Derechos de la cuenta (tabla entitlements) → inventario con origen 'compra'. */
export function applyEntitlements(p, ents) {
  for (const e of ents || []) {
    const id = 'e:' + e.sku, cur = p.inv.find((i) => i.id === id);
    if (cur) cur.origen = 'compra';
    else p.inv.push({ id, origen: 'compra', at: Date.parse(e.created_at) || now() });
  }
}

/* Fusión de tres vías para los contadores: nube + lo que el local sumó desde la base.
   base = lo último sincronizado con esta cuenta, o null si el local era de invitado (entonces
   todo lo local se suma a la cuenta). Máximos para las marcas, unión para el inventario y
   las elecciones más recientes. Conserva los campos solo locales del local. */
export function mergeProfile(remote, local, base) {
  const R = migrate(remote), L = migrate(local), B = base ? migrate(base) : newProfile();
  const out = migrate(L);
  const merge3 = (r = {}, l = {}, b = {}) => {
    const o = {};
    for (const k of new Set([...Object.keys(r), ...Object.keys(l)])) {
      const v = (r[k] || 0) + Math.max(0, (l[k] || 0) - (b[k] || 0));
      if (v) o[k] = Math.round(v * 10) / 10;
    }
    return o;
  };
  out.stats = merge3(R.stats, L.stats, B.stats);
  out.feats = merge3(R.feats, L.feats, B.feats);
  out.beasts = {};
  for (const k of new Set([...Object.keys(R.beasts), ...Object.keys(L.beasts)])) out.beasts[k] = merge3(R.beasts[k], L.beasts[k], B.beasts[k]);
  for (const k of new Set([...Object.keys(R.best), ...Object.keys(L.best)])) out.best[k] = Math.max(R.best[k] || 0, L.best[k] || 0);
  const inv = new Map();
  for (const i of [...R.inv, ...L.inv]) {
    const cur = inv.get(i.id);
    if (!cur) inv.set(i.id, { ...i });
    else { cur.at = Math.min(cur.at || i.at, i.at || cur.at); if (i.origen === 'compra') cur.origen = 'compra'; }
  }
  out.inv = [...inv.values()];
  if (R.prefAt > L.prefAt) for (const k of ['name', 'color', 'hero', 'title', 'rope', 'prefAt']) out[k] = R[k];
  out.updatedAt = Math.max(R.updatedAt, L.updatedAt);
  return out;
}

/* Lo que se sube a la nube (sin los campos solo locales). */
export function cloudData(p) {
  const o = { ...p };
  for (const k of LOCAL_ONLY) delete o[k];
  return o;
}
