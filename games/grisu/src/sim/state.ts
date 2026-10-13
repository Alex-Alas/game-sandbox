// Estado y mundo de la simulación de GRISÚ (GDD §15.2): datos planos que van y vuelven por JSON, a 60 Hz.
// Metros y segundos, y hacia arriba: p.x es el centro de la caja y p.y, los pies. El mundo es una grilla de celdas de
// CELL m (estática en F1) más las zonas del patio y dónde aparecen los dummies; la configuración viaja en w.c.
import { DEFAULTS, type Cfg } from './params.ts';

export const HZ = 60, DT = 1 / HZ;
export const NEVER = -1e9;
export const HW = 0.4, H = 1.6, HAND = 1.1;   // media anchura y alto del héroe (§5); la mano, de donde sale la liga
export const CELL = 0.5;
export const AIR = 0, ROCK = 1, METAL = 2;

export type ZoneKind = 'pasillo' | 'pozo' | 'sala';
export type Zone = { id: ZoneKind, x0: number, y0: number, x1: number, y1: number, spawn: [number, number] };
// Dummies del patio por tipo: media anchura, alto, la clave de su masa, vida y si se mueve (los fijos pesan infinito)
export const KINDS = {
  liviano: { hw: 0.4, h: 0.9, m: 'M_LIGHT', hp: 30, fixed: false },
  mediano: { hw: 0.4, h: 1.6, m: 'M_MID', hp: 60, fixed: false },
  pesado: { hw: 0.8, h: 2.4, m: 'M_HEAVY', hp: 150, fixed: false },
  atacante: { hw: 0.5, h: 1.1, m: 'M_MID', hp: 60, fixed: false },   // telegrafía en blanco (se devuelve) o en rojo
  torreta: { hw: 0.5, h: 1.0, m: 'M_HEAVY', hp: 80, fixed: true },   // dispara proyectiles que se devuelven
  valvula: { hw: 0.45, h: 0.5, m: 'M_HEAVY', hp: 0, fixed: true },   // pogueable y enganchable; no se rompe
} as const satisfies Record<string, { hw: number, h: number, m: keyof Cfg, hp: number, fixed: boolean }>;
export type Kind = keyof typeof KINDS;
export type Spawn = { x: number, y: number, kind: Kind, face?: number };
export type World = { cols: number, rows: number, g: Uint8Array, zones: Zone[], dummies: Spawn[], c: Cfg };

// Entrada de un jugador (GDD §4): el gesto es solo entrada. jump y dir valen en el cuadro en que se aprietan (la sim
// detecta el flanco); hold es un nivel. (ax, ay) = dirección del deslizar; (tx, ty) = el punto mantenido (mundo).
export type Input = { jump: boolean, dir: boolean, hold: boolean, ax: number, ay: number, tx: number, ty: number };
export const NOINPUT: Input = { jump: false, dir: false, hold: false, ax: 0, ay: 0, tx: 0, ty: 0 };

export type Cls = 'esgrimista' | 'estibador';
// La liga: ancla, cuadro en que llega (antes viaja: no tira), largo en reposo (se fija al llegar), e = el dummy
// enganchado (−1: terreno) y (ox, oy) dónde, desde sus pies
export type Hook = { x: number, y: number, at: number, rest: number, e: number, ox: number, oy: number };
export type Shot = { x: number, y: number, ox: number, oy: number, t: number, at: number, hit: boolean };
// act: lo que está haciendo (0 nada, 1 dash, 2 guardia, 3 picada, 4 martillazo, 5 aterrizaje pesado)
export const A = { NONE: 0, DASH: 1, GUARD: 2, DIVE: 3, HAMMER: 4, LAND: 5 } as const;
export type Pl = {
  id: number, cls: Cls,
  dirT: number, dax: number, day: number, holdT: number,   // último deslizar (con su dirección) y último mantener
  x: number, y: number, vx: number, vy: number,
  ground: boolean, face: number, groundT: number, pressT: number, air: number, rise: boolean,
  jumpHeld: boolean, dirHeld: boolean, holdHeld: boolean,
  hp: number, invT: number, stopT: number, stunT: number, hurtT: number,
  combo: number, comboT: number, comboMax: number,
  act: number, actT: number, ax: number, ay: number, hits: number[],
  charge: number,          // cargas de la clase (dash o liga), con fracción
  lagT: number,            // primer cuadro en que se puede volver a poner la guardia
  parried: boolean,        // esta guardia ya devolvió algo
  hook: Hook | null, hookT: number, shot: Shot | null,
  safeX: number, safeY: number, zone: number, foe: number,
  dmgDealt: number, kills: number,
  fondo: number,           // cuadros parado en el fondo del POZO
};
// Un dummy: caja con masa y vida. lz = LANZADO (daña y se daña al chocar); hp ≤ 0: roto hasta el cuadro back;
// atk: ataque en curso (0 nada, 1 blanco, 2 rojo) desde atkT; next: cuadro del próximo ataque o disparo
export type Dummy = {
  x: number, y: number, vx: number, vy: number, hp: number, ground: boolean, lz: boolean, hitT: number, back: number,
  stopT: number, stunT: number, face: number, atk: number, atkT: number, atkHit: boolean, next: number, par: boolean,
};
export type Bullet = { x: number, y: number, vx: number, vy: number, own: number, dmg: number, t: number, dead: boolean };
export type Ev = { k: string, [x: string]: number | string | boolean };
export type State = { t: number, seed: number, pl: Pl[], d: Dummy[], b: Bullet[], ev: Ev[] };

export const cfgOf = (w: World): Cfg => w.c ?? DEFAULTS;
export const gravity = (c: Cfg) => 2 * c.JUMP_H / (c.JUMP_T * c.JUMP_T);   // tal que JUMP_H se alcanza en JUMP_T
export const sizeOf = (w: World, k: number) => KINDS[w.dummies[k].kind];
export const massOf = (w: World, k: number) => { const z = sizeOf(w, k); return z.fixed ? Infinity : cfgOf(w)[z.m]; };
export const approach = (v: number, to: number, d: number) => v < to ? Math.min(v + d, to) : Math.max(v - d, to);
export const ev = (s: State, k: string, o: Record<string, number | string | boolean> = {}) => { s.ev.push({ k, ...o }); };
export const zoneOf = (w: World, x: number, y: number) => {
  for (let i = 0; i < w.zones.length; i++) { const z = w.zones[i]; if (x >= z.x0 && x <= z.x1 && y >= z.y0 - 8 && y <= z.y1) return i; }
  return -1;
};
