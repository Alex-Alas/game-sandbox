// Valores tuneables de la simulación: [valor, mín, máx, paso, etiqueta]. Metros, segundos y cuadros de 60 Hz.
// Los valores son los calibrados jugando el paso A (2026-10-06: carrera larga y giros lentos a propósito)
// y el paso B (2026-10-07: la liga larga y blanda, con tirón alto).
// El panel de ajustes (main.ts) se genera de esta tabla; la sim recibe un Cfg plano.
export const RANGES = {
  RUN: [20, 2, 30, 0.1, 'carrera m/s'],
  ACC: [22, 5, 300, 1, 'acelerar m/s²'],
  DEC: [61, 5, 300, 1, 'frenar/girar m/s²'],
  AIR: [20, 0, 300, 1, 'control aire m/s²'],
  JUMP_H: [3.8, 0.5, 8, 0.05, 'altura salto m'],
  JUMP_T: [0.38, 0.15, 1, 0.01, 'subida s'],
  JUMP_CUT: [0.45, 0, 1, 0.01, 'corte al soltar ×'],
  FALL_G: [1.6, 1, 4, 0.05, 'gravedad caída ×'],
  MAX_FALL: [28, 5, 60, 0.5, 'caída máx. m/s'],
  COYOTE: [6, 0, 15, 1, 'coyote cuadros'],
  BUFFER: [7, 0, 15, 1, 'buffer cuadros'],
  HOOK_LEN: [12, 3, 40, 0.5, 'alcance garfio m'],
  HOOK_K: [30, 1, 150, 0.5, 'rigidez liga 1/s²'],
  HOOK_REST: [0.2, 0, 1, 0.01, 'reposo × distancia'],
  HOOK_V: [60, 5, 100, 0.5, 'tirón máx. m/s'],
  HOOK_DAMP: [1.6, 0, 20, 0.1, 'amortiguación 1/s'],
  HOOK_JUMP: [10, 0, 30, 0.5, 'impulso al soltar m/s'],
  HOOK_MISS: [12, 0, 60, 1, 'pausa si falla cuadros'],
  HOOK_CONE: [12, 0, 45, 1, 'cono de gracia °'],
  HOOK_N: [3, 1, 8, 1, 'cargas'],
  HOOK_CD: [2.5, 0.2, 15, 0.1, 'recarga s/carga'],
  HOOK_GROUND: [2, 1, 5, 0.1, 'recarga en suelo ×'],
  HOOK_REFUND: [32, 0, 100, 1, 'devuelve si suelta ≥ m/s'],
  AIM_UP: [1, 0, 4, 0.05, 'mira sola: alto/avance'],
  ORB_T: [3, 0.5, 20, 0.5, 'chispa reaparece s'],
} satisfies Record<string, [number, number, number, number, string]>;

export type Cfg = { [K in keyof typeof RANGES]: number };

export const DEFAULTS = Object.fromEntries(Object.entries(RANGES).map(([k, v]) => [k, v[0]])) as Cfg;

// Perfiles del garfio: cada uno pisa estas claves (el resto de Cfg es común). LIGA son los valores de RANGES;
// CORTO es casi una cuerda (poco estirón: columpio predecible) de poco alcance y recarga rápida; LANZADERA te
// tira hasta el ancla desde lejos con mucho impulso, para salir de apuros, con una sola carga lenta.
export const HOOK_KEYS = ['HOOK_LEN', 'HOOK_K', 'HOOK_REST', 'HOOK_V', 'HOOK_DAMP', 'HOOK_JUMP', 'HOOK_MISS', 'HOOK_CONE',
  'HOOK_N', 'HOOK_CD', 'HOOK_GROUND', 'HOOK_REFUND'] as const satisfies readonly (keyof Cfg)[];
export type HookCfg = Pick<Cfg, typeof HOOK_KEYS[number]>;
const pick = (c: Cfg) => Object.fromEntries(HOOK_KEYS.map(k => [k, c[k]])) as HookCfg;
export const PROFILES = {
  corto: { HOOK_LEN: 7, HOOK_K: 120, HOOK_REST: 0.8, HOOK_V: 25, HOOK_DAMP: 4, HOOK_JUMP: 8, HOOK_MISS: 6, HOOK_CONE: 8,
    HOOK_N: 5, HOOK_CD: 1, HOOK_GROUND: 2, HOOK_REFUND: 28 },
  liga: pick(DEFAULTS),
  lanzadera: { HOOK_LEN: 20, HOOK_K: 60, HOOK_REST: 0, HOOK_V: 80, HOOK_DAMP: 1, HOOK_JUMP: 18, HOOK_MISS: 20, HOOK_CONE: 18,
    HOOK_N: 1, HOOK_CD: 8, HOOK_GROUND: 1, HOOK_REFUND: 0 },
} satisfies Record<string, HookCfg>;
export type Profile = keyof typeof PROFILES;
