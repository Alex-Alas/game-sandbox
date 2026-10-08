// Ajustes guardados en localStorage (catapum.settings). Todo es opcional al leer: lo que falte toma el valor por
// defecto, así un ajuste nuevo no rompe lo guardado.
import { DEFAULTS, RANGES, type Cfg } from './sim/params.ts';
import { CHARS } from './sim/chars.ts';
import { validDeck } from './sim/cards.ts';

export type Settings = {
  name: string, ch: string, decks: Record<string, string[]>,
  sfx: number, music: number, shake: boolean, quality: number, nums: boolean, vibrate: boolean,
  wJump: boolean, cam: 'todos' | 'yo', mouseSwap: boolean, keys: Record<string, string[]>,
  touch: { scheme: 'stick' | 'drag', stick: number, btn: number, card: number, dead: number, auto: boolean, left: boolean, pos: Record<string, [number, number]> },
  match: { map: string, bots: number, diff: number, time: number, teams: boolean, crates: number, infinite: boolean, startDmg: number, friendly: boolean },
  adv: Partial<Cfg>,
};
const DEF: Settings = {
  name: '', ch: 'bombin', decks: {},
  sfx: 0.8, music: 0.5, shake: true, quality: 1, nums: true, vibrate: true,
  wJump: false, cam: 'todos', mouseSwap: false, keys: {},
  touch: { scheme: 'stick', stick: 100, btn: 100, card: 100, dead: 0.25, auto: true, left: false, pos: {} },
  match: { map: 'islas', bots: 3, diff: 2, time: 180, teams: false, crates: 11, infinite: false, startDmg: 0, friendly: false },
  adv: {},
};
const KEY = 'catapum.settings';
// Teclas por acción (códigos de KeyboardEvent.code); se pueden cambiar en AJUSTES → CONTROLES
export const KEYS: Record<string, string[]> = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  jump: ['Space'], dash: ['ShiftLeft', 'ShiftRight'], hook: ['KeyK', 'KeyF'], ulti: ['KeyQ'],
  c1: ['Digit1'], c2: ['Digit2'], c3: ['Digit3'], c4: ['Digit4'], c5: ['Digit5', 'KeyE'], table: ['Tab'], pause: ['Escape', 'KeyP'],
};
export const KEY_LABEL: Record<string, string> = { left: 'izquierda', right: 'derecha', up: 'arriba (dirección)', down: 'abajo (barrida, picada)', jump: 'salto',
  dash: 'dash', hook: 'garfio', ulti: 'ulti', c1: 'carta 1', c2: 'carta 2', c3: 'carta 3', c4: 'carta 4', c5: 'carta de la caja', table: 'tabla', pause: 'pausa' };
const KN: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'ESPACIO', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT DER.',
  ControlLeft: 'CTRL', ControlRight: 'CTRL DER.', AltLeft: 'ALT', Escape: 'ESC', Enter: 'ENTER', Tab: 'TAB', Backspace: '⌫' };
export const keyName = (c: string) => KN[c] ?? c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'NUM ').toUpperCase();

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
  s.keys = { ...KEYS };
  if (r?.keys && typeof r.keys === 'object') for (const [k, v] of Object.entries(r.keys)) if (k in KEYS && Array.isArray(v) && v.every(x => typeof x === 'string')) s.keys[k] = v.slice(0, 3);
  s.touch.pos = {};
  const tp = (r?.touch as { pos?: unknown } | undefined)?.pos;
  if (tp && typeof tp === 'object') for (const [k, v] of Object.entries(tp)) if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)) s.touch.pos[k] = [v[0], v[1]];
  if (!s.name) s.name = 'Jugador' + Math.floor(Math.random() * 90 + 10);
  return s;
})();

export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* sin almacenamiento */ } }
export const deckOf = (ch: string) => S.decks[ch] ?? CHARS.find(c => c.id === ch)!.deck;
export const cfgOf = (): Cfg => ({ ...DEFAULTS, ...S.adv });
export const resetAll = () => { try { localStorage.removeItem(KEY); } catch { /* */ } location.reload(); };
export { DEF as SETTINGS_DEFAULTS };
