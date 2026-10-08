// Ajustes guardados en localStorage (catapum.settings). Todo es opcional al leer: lo que falte toma el valor por
// defecto, así un ajuste nuevo no rompe lo guardado.
import { DEFAULTS, RANGES, type Cfg } from './sim/params.ts';
import { CHARS } from './sim/chars.ts';
import { validDeck } from './sim/cards.ts';

export type Settings = {
  name: string, ch: string, decks: Record<string, string[]>,
  sfx: number, music: number, shake: boolean, quality: number, nums: boolean, vibrate: boolean,
  wJump: boolean, cam: 'todos' | 'yo',
  touch: { scheme: 'stick' | 'drag', stick: number, btn: number, card: number, dead: number, auto: boolean, left: boolean },
  match: { map: string, bots: number, diff: number, time: number, teams: boolean, crates: number, infinite: boolean, startDmg: number, friendly: boolean },
  adv: Partial<Cfg>,
};
const DEF: Settings = {
  name: '', ch: 'bombin', decks: {},
  sfx: 0.8, music: 0.5, shake: true, quality: 1, nums: true, vibrate: true,
  wJump: false, cam: 'todos',
  touch: { scheme: 'stick', stick: 100, btn: 100, card: 100, dead: 0.25, auto: true, left: false },
  match: { map: 'islas', bots: 3, diff: 2, time: 180, teams: false, crates: 11, infinite: false, startDmg: 0, friendly: false },
  adv: {},
};
const KEY = 'catapum.settings';

function merge<T>(base: T, v: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return (typeof v === typeof base ? v : base) as T;
  const out = { ...base } as Record<string, unknown>;
  if (v && typeof v === 'object') for (const k of Object.keys(out)) if (k in (v as object)) out[k] = merge(out[k], (v as Record<string, unknown>)[k]);
  return out as T;
}

export const S: Settings = (() => {
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* sin almacenamiento */ }
  const s = merge(structuredClone(DEF), raw);
  const r = raw as Partial<Settings> | null;
  if (r?.decks && typeof r.decks === 'object') for (const [k, d] of Object.entries(r.decks)) if (validDeck(d)) s.decks[k] = d;
  if (r?.adv && typeof r.adv === 'object') for (const [k, v] of Object.entries(r.adv)) if (k in RANGES && typeof v === 'number') (s.adv as Record<string, number>)[k] = v;
  if (!CHARS.some(c => c.id === s.ch)) s.ch = 'bombin';
  if (!s.name) s.name = 'Jugador' + Math.floor(Math.random() * 90 + 10);
  return s;
})();

export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* sin almacenamiento */ } }
export const deckOf = (ch: string) => S.decks[ch] ?? CHARS.find(c => c.id === ch)!.deck;
export const cfgOf = (): Cfg => ({ ...DEFAULTS, ...S.adv });
export const resetAll = () => { try { localStorage.removeItem(KEY); } catch { /* */ } location.reload(); };
export { DEF as SETTINGS_DEFAULTS };
