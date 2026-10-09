// Campaña de 30 bombas en tres lugares (la combi, la avioneta, el tren): un módulo nuevo por vez, después mezclas, y los
// peligros de cada lugar. SIN CALIBRAR: los tiempos salen de suponer ~70 s por módulo para un equipo que ya se entiende.
// INFINITO: bombas cada vez más grandes con todo lo aprendido. PERSONALIZADO: lo arma el anfitrión.
import { hash, rng, shuffle } from './rng.ts';
import { isChaos, modTier, KINDS, type Kind } from './mods.ts';
import { MAX_MODS, type Spec, type Env, type Hazard } from './bomb.ts';

type L = [env: Env, mods: Kind[], time: number, miss: number, hz?: Hazard[], chaos?: number];
const C: L[] = [
  ['combi', ['cables'], 240, 2],
  ['combi', ['cables', 'dir'], 300, 2],
  ['combi', ['dir', 'calc'], 300, 2],
  ['combi', ['cables', 'calc', 'dir'], 330, 2, ['bache']],
  ['combi', ['slide', 'cables'], 300, 2, ['bache']],
  ['combi', ['slide', 'dir', 'calc'], 330, 2, ['bache']],
  ['combi', ['bells', 'cables', 'slide'], 360, 2, ['bache']],
  ['combi', ['bells', 'calc', 'dir'], 330, 2, ['bache', 'radio']],
  ['combi', ['piano', 'slide', 'cables'], 330, 2, ['bache', 'radio']],
  ['combi', ['piano', 'bells', 'calc', 'dir'], 390, 2, ['bache', 'radio']],
  ['avion', ['dial', 'cables'], 270, 2],
  ['avion', ['dial', 'piano', 'slide'], 330, 2, ['apagon']],
  ['avion', ['switch', 'calc', 'dir'], 300, 2, ['apagon']],
  ['avion', ['switch', 'dial', 'bells'], 330, 2, ['apagon']],
  ['avion', ['press', 'cables', 'slide'], 270, 2, ['apagon']],
  ['avion', ['simon', 'dir', 'calc'], 330, 2, ['apagon']],
  ['avion', ['simon', 'switch', 'piano', 'press'], 390, 2, ['apagon', 'bache']],
  ['avion', ['morse', 'cables', 'slide'], 330, 2, ['apagon']],
  ['avion', ['morse', 'dial', 'bells', 'press'], 390, 2, ['apagon', 'bache']],
  ['avion', ['simon', 'morse', 'switch', 'piano', 'calc'], 450, 2, ['apagon', 'bache']],
  ['tren', ['maze', 'cables'], 270, 2],
  ['tren', ['maze', 'piano', 'dial'], 330, 2, ['radio']],
  ['tren', ['alarm', 'switch', 'slide', 'calc'], 360, 2, ['radio']],
  ['tren', ['maze', 'simon', 'bells', 'alarm'], 390, 2, ['radio', 'apagon']],
  ['tren', ['morse', 'maze', 'dir', 'press'], 390, 2, ['radio', 'apagon']],
  ['tren', ['simon', 'dial', 'switch', 'cables', 'press', 'alarm'], 450, 2, ['bache', 'apagon']],
  ['tren', ['maze', 'morse', 'piano', 'bells', 'slide'], 450, 1, ['radio', 'apagon']],
  ['tren', ['simon', 'maze', 'switch', 'dial', 'press', 'alarm'], 480, 1, ['bache', 'radio'], 1.2],
  ['tren', ['morse', 'simon', 'maze', 'bells', 'piano', 'press'], 510, 1, ['bache', 'radio', 'apagon'], 1.2],
  ['tren', ['simon', 'morse', 'maze', 'switch', 'alarm', 'press'], 480, 1, ['bache', 'radio', 'apagon'], 1.3],
];
export const CAMPAIGN: Spec[] = C.map(([env, mods, time, miss, hz = [], chaos = 1]) => ({ env, mods, time, miss, hz, chaos }));
export const LEVEL_NAMES = [
  'Primer día', 'Para un lado', 'Sacá la cuenta', 'Calle de tierra', 'Sube y baja', 'Ruta vieja', 'Riiing', 'Cumbia a todo volumen',
  'Do re mi', 'Fin del recorrido', 'Despegue', 'Se fue la luz', 'Arriba, abajo', 'Turbulencia', 'Bajo presión', 'El mono dice',
  'Cabina', 'Punto y raya', 'Tormenta', 'Aterrizaje forzoso', 'Andén 1', 'Vagón comedor', 'Paso a nivel', 'Túnel', 'Señales',
  'Descarrilados', 'Expreso nocturno', 'Sin frenos', 'Última estación', 'El gran bananazo',
];

// Módulos que ya aparecieron hasta el nivel n (0..29) incluido: los que tiene el manual a esa altura.
export function known(n: number): Kind[] {
  const s = new Set<Kind>();
  for (let k = 0; k <= Math.min(n, CAMPAIGN.length - 1); k++) for (const m of CAMPAIGN[k].mods) s.add(m);
  return KINDS.filter(k => s.has(k));
}
// Los que se estrenan en el nivel n (la sesión informativa los explica)
export const news = (n: number): Kind[] => { const before = n > 0 ? known(n - 1) : []; return [...new Set(CAMPAIGN[n].mods)].filter(k => !before.includes(k)); };

// INFINITO: la bomba w (0, 1, 2…) suma módulos y peligros; los de caos llegan desde la cuarta.
export function endless(w: number, seed: number): Spec {
  const r = rng(hash(seed, w, 0x696e66));
  const n = Math.min(MAX_MODS, 2 + Math.floor(w / 2)), tier = Math.min(3, 1 + Math.floor(w / 2));
  const pool = KINDS.filter(k => !isChaos(k) && modTier(k) <= tier);
  const mods = shuffle(r, pool).slice(0, Math.max(1, n - (w >= 3 ? 1 : 0)));
  if (w >= 3) mods.push(w % 2 ? 'press' : 'alarm');
  const hz: Hazard[] = (['bache', 'radio', 'apagon'] as Hazard[]).filter((_, k) => w >= 2 + k * 2);
  const env: Env = w < 3 ? 'combi' : w < 6 ? 'avion' : 'tren';
  return { env, mods, time: Math.round(mods.length * Math.max(55, 85 - w * 3)), miss: w < 5 ? 2 : 1, hz, chaos: 1 + Math.min(0.6, w * 0.05) };
}

// PERSONALIZADO: lo que se elige en la sala, saneado (siempre con al menos un módulo que se pueda desactivar).
export type Custom = { mods: Kind[], n: number, time: number, miss: number, hz: Hazard[], env: Env };
export const CUSTOM_DEFAULT: Custom = { mods: ['cables', 'dir', 'calc', 'slide'], n: 3, time: 300, miss: 2, hz: [], env: 'combi' };
export function custom(c: Custom, seed: number): Spec {
  const r = rng(hash(seed, 0x637573));
  const pool = c.mods.filter(k => KINDS.includes(k));
  const normal = pool.filter(k => !isChaos(k)), chaos = pool.filter(k => isChaos(k));
  const n = Math.max(1, Math.min(MAX_MODS, Math.round(c.n) || 3));
  const nc = Math.min(chaos.length, Math.max(0, n - 1)), sh = shuffle(r, normal.length ? normal : ['cables'] as Kind[]);
  const mods = [...Array.from({ length: n - nc }, (_, j) => sh[j % sh.length]), ...shuffle(r, chaos).slice(0, nc)];
  return { env: c.env, mods, time: Math.max(30, Math.min(1800, Math.round(c.time) || 300)), miss: Math.max(0, Math.min(5, Math.round(c.miss))), hz: c.hz.slice(), chaos: 1 };
}
