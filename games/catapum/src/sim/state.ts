// Estado de una partida: datos planos (ida y vuelta por JSON) salvo el terreno, que vive en el mundo (World) y se
// sincroniza por cortes (terrain.ts). Metros y segundos, y hacia arriba; p.x es el centro y p.y los pies.
import { DEFAULTS, RULES, type Cfg, type Rules } from './params.ts';
import { buildMap, mapById, type MapDef } from './maps.ts';
import { charOf } from './chars.ts';
import { HAND } from './cards.ts';
import type { Terr } from './terrain.ts';

export const HZ = 60, DT = 1 / HZ, NEVER = -1e9;
export const GO = 3; // s de cuenta regresiva antes de empezar (3, 2, 1, ¡CATAPUM!)
export const AIM_R = 16; // m: una mira de largo 1 (fuerza máxima) apunta a esta distancia
export const HW = 0.4, H = 1.1, HC = 0.62, HAND_Y = 0.7; // media anchura, alto (de pie / agachado), altura de la mano
export const G_PROJ = 22; // gravedad de los proyectiles m/s² (más baja que la del salto: arcos largos)

// x, y: joystick (y hacia arriba); ax, ay: mira (largo 0–1 = fuerza de las cartas con arco); cast: carta que se
// suelta en este cuadro (0–3 la mano, 4 la de la caja, −1 ninguna). Botones mantenidos: el apretón lo ve la sim.
export type Input = { x: number, y: number, jump: boolean, dash: boolean, hook: boolean, ulti: boolean, cast: number, ax: number, ay: number };
export const NO_INPUT: Input = { x: 0, y: 0, jump: false, dash: false, hook: false, ulti: false, cast: -1, ax: 0, ay: 0 };

// La liga: ancla, cuadro en que llega, largo en reposo; e = −1 terreno o el id del enganchado (ek 0 jugador, 1 objeto);
// (ox, oy) desde sus pies; (ci, cj) la celda del ancla en el terreno (si se rompe, se suelta)
export type Hook = { x: number, y: number, at: number, rest: number, e: number, ek: number, ox: number, oy: number, ci: number, cj: number };
export type Shot = { x: number, y: number, ox: number, oy: number, t: number, at: number, hit: boolean };
// Ulti en curso: k = cuál, t0 = cuadro de inicio, f = fase, y lo que use cada una
export type Ult = { k: string, t0: number, f: number, ft: number, x: number, y: number, dx: number, dy: number, n: number, ids: number[] };

export type Pl = {
  id: number, name: string, ch: string, team: number, bot: number, deck: string[], color: number,
  x: number, y: number, vx: number, vy: number, face: number,
  ground: boolean, crouch: boolean, groundT: number, pressT: number, held: boolean, rise: boolean, air: number,
  wall: number, wallT: number, wallSide: number, lockT: number,
  dashT: number, ddx: number, ddy: number, dashN: number, dashCdT: number, dashHeld: boolean, hits: number[],
  slide: boolean, pound: boolean, poundLand: number,
  hook: Hook | null, hookHeld: boolean, hookT: number, charge: number, shot: Shot | null,
  dmg: number, stunT: number, stopT: number, tumble: boolean, techT: number, techT0: number, invT: number,
  shieldT: number, fragT: number, leadT: number, glueT: number, cloudT: number,
  mana: number, hand: string[], queue: string[], bonus: string, castT: number, castK: string, castAt: number,
  atk: { k: string, t0: number, dx: number, dy: number, hit: number[] } | null, // bate, katana, autodestrucción
  ulti: number, ultiHeld: boolean, u: Ult | null,
  lastBy: number, lastT: number, inX: number, inY: number,
  alive: boolean, spawnT: number,
  score: number, kos: number, falls: number, dealt: number, tricks: number,
};
// Proyectil: c = carta o subproyectil; o = dueño; st: 0 suelto, 1 pegado al terreno, 2 pegado a un jugador (sp)
export type Proj = {
  id: number, c: string, o: number, x: number, y: number, vx: number, vy: number, t0: number, fuse: number,
  b: number, st: number, sp: number, sx: number, sy: number, hit: number[], arm: number, dead: boolean,
};
// Objeto con física simple (sin rotar): TNT, lata de gas y la caja de carta (con paracaídas)
export type Prop = { id: number, k: string, x: number, y: number, vx: number, vy: number, hp: number, o: number, card: string, chute: boolean, ground: boolean, t0: number, dead: boolean };
// Zonas: nube del melocotón, fuego de la lata, pegamento, banana
export type Zone = { id: number, k: string, x: number, y: number, r: number, t0: number, until: number, o: number };
// Cosas con tiempo: megaláser, ovni de la vaca, aviso del meteorito y del volcán
export type Beam = { id: number, k: string, o: number, x: number, y: number, dx: number, dy: number, t0: number, t1: number, len: number };
export type Ev = { k: string, t: number, [key: string]: number | string | boolean | number[] };

export type HzState = { windDir: number, windNext: number, windWarn: number, windEnd: number, rockNext: number,
  trainNext: number, trainDir: number, trainX: number, trainRun: boolean, trainHit: number[] };

export type State = {
  t: number, rng: number, seed: number, map: string, rules: Rules,
  pl: Pl[], pr: Proj[], props: Prop[], zones: Zone[], beams: Beam[], nid: number,
  ev: Ev[], hz: HzState, crateNext: number,
  over: boolean, sudden: boolean, suddenT: number, endT: number,
};

// El mundo: el mapa, su terreno (mutable) y los valores tuneables
export type World = { m: MapDef, T: Terr, c: Cfg };

export type Entry = { name: string, ch: string, deck?: string[], team?: number, bot?: number };

export function newPlayer(id: number, e: Entry, c: Cfg, rules: Rules): Pl {
  const ch = charOf(e.ch), deck = e.deck && e.deck.length === 8 ? e.deck.slice() : ch.deck.slice();
  return {
    id, name: e.name, ch: ch.id, team: e.team ?? id % 2, bot: e.bot ?? 0, deck, color: id % 8,
    x: 0, y: 0, vx: 0, vy: 0, face: 1,
    ground: false, crouch: false, groundT: NEVER, pressT: NEVER, held: false, rise: false, air: ch.airJumps,
    wall: 0, wallT: NEVER, wallSide: 0, lockT: NEVER,
    dashT: NEVER, ddx: 0, ddy: 0, dashN: ch.dashN, dashCdT: NEVER, dashHeld: false, hits: [],
    slide: false, pound: false, poundLand: NEVER,
    hook: null, hookHeld: false, hookT: NEVER, charge: ch.hookN, shot: null,
    dmg: rules.startDmg, stunT: NEVER, stopT: NEVER, tumble: false, techT: NEVER, techT0: NEVER, invT: NEVER,
    shieldT: NEVER, fragT: NEVER, leadT: NEVER, glueT: NEVER, cloudT: NEVER,
    mana: c.MANA_START, hand: deck.slice(0, HAND), queue: deck.slice(HAND), bonus: '', castT: NEVER, castK: '', castAt: NEVER,
    atk: null, ulti: 0, ultiHeld: false, u: null,
    lastBy: -1, lastT: NEVER, inX: 0, inY: 0,
    alive: false, spawnT: 0,
    score: 0, kos: 0, falls: 0, dealt: 0, tricks: 0,
  };
}

export function newState(mapId: string, seed: number, entries: Entry[], rules: Rules = RULES, c: Cfg = DEFAULTS): { s: State, w: World } {
  const m = mapById(mapId), T = buildMap(m, seed);
  const s: State = {
    t: 0, rng: seed >>> 0 || 1, seed, map: m.id, rules: { ...rules },
    pl: entries.map((e, k) => newPlayer(k, e, c, rules)), pr: [], props: [], zones: [], beams: [], nid: 1,
    ev: [], crateNext: Math.round((GO + 6) * HZ),
    hz: { windDir: 0, windNext: m.hz.wind ? Math.round(m.hz.wind.every * HZ) : 0, windWarn: 0, windEnd: 0, rockNext: m.hz.rocks ? Math.round(m.hz.rocks.every * HZ) : 0,
      trainNext: m.hz.train ? Math.round(m.hz.train.every * HZ) : 0, trainDir: 1, trainX: 0, trainRun: false, trainHit: [] },
    over: false, sudden: false, suddenT: 0, endT: 0,
  };
  return { s, w: { m, T, c: { ...c } } };
}

export const ev = (s: State, k: string, o: Record<string, number | string | boolean | number[]> = {}) => { s.ev.push({ k, t: s.t, ...o }); };
// Un truco de movimiento (wavedash, hyper, rebote de picada, tech…) carga la ulti y se anuncia
export function trick(s: State, c: Cfg, p: Pl, name: string) {
  p.tricks++, p.ulti = Math.min(100, p.ulti + c.ULTI_TRICK);
  ev(s, 'trick', { p: p.id, n: name });
}
export const PROP_M = 0.6, PROP_HW = 0.4, PROP_H = 0.8; // masa y caja de los objetos
export const dropHook = (p: Pl) => { p.hook = null; };
// En ulti (intocable y sin cartas); el maquinista que se bajó del tren ya no
export const inUlti = (p: Pl) => !!p.u && !(p.u.k === 'expreso' && p.u.n === 1);
export const pById = (s: State, id: number) => s.pl[id];
export const enemies = (s: State, a: Pl, b: Pl) => a.id !== b.id && (!s.rules.teams || a.team !== b.team);
export const approach = (v: number, to: number, d: number) => v < to ? Math.min(v + d, to) : Math.max(v - d, to);
export const gravity = (c: Cfg) => 2 * c.JUMP_H / (c.JUMP_T * c.JUMP_T);
export const height = (p: Pl) => p.crouch ? HC : H;
