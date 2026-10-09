// Estado del cliente (lo comparten main, view y ui). La verdad de la bomba la tiene el anfitrión; acá vive la copia local,
// lo social (gestos, bananazos, chat, quién habla) y lo de la vista (zoom, temblores).
import type { Bomb, Spec } from './sim/bomb.ts';
import type { Role, Gesture } from './sim/const.ts';
import type { Custom } from './sim/levels.ts';
import type { Layout } from './draw.ts';
import type { Conn } from './net.ts';

export type Phase = 'title' | 'lobby' | 'brief' | 'play' | 'end';
export type Seat = { id: number, name: string, role: Role | null, on: boolean };
export type Sel = { mode: 'camp', n: number } | { mode: 'inf' } | { mode: 'custom', c: Custom };
export type Result = { win: boolean, why: string, time: number, strikes: number, stars: number, wave: number, n: number, mode: Sel['mode'] };
export type Cap = { r: Role, s: string, t: number };
export type Hit = { from: Role, to: Role, t: number };
export type Hand = { m: number, x: number, y: number };

export const app = {
  phase: 'title' as Phase,
  online: false, host: false, practice: false,
  conn: null as Conn | null, myId: 0, code: '',
  seats: [] as Seat[],
  sel: { mode: 'camp', n: 0 } as Sel,
  prog: 0,              // nivel más alto habilitado (el del anfitrión)
  wave: 0, runSeed: 0,  // INFINITO
  spec: null as Spec | null, seed: 0, levelN: -1,
  bomb: null as Bomb | null, L: null as Layout | null, timeShown: 0,
  cd: 0,                // cuenta regresiva antes de armar (s)
  overT: 0,             // tiempo desde que explotó o se desactivó
  result: null as Result | null,
  view: 'ciego' as Role, // el papel que dibuja este cliente (en la práctica se cambia)
  hand: null as Hand | null, // la mano del CIEGO: módulo y coordenadas dentro de él (cada uno acomoda la bomba a su pantalla)
  ges: { ciego: null, sordo: null, mudo: null } as Record<Role, { g: Gesture, t: number } | null>,
  talk: { ciego: false, sordo: false, mudo: false } as Record<Role, boolean>,
  hits: [] as Hit[], caps: [] as Cap[], ripples: [] as (Hand & { t: number, bad: boolean })[],
  shake: 0, flash: 0, flashCol: '#fff', bumpT: -9,
  zoom: -1, zoomK: 0,
  bt: { s: 1, ox: 0, oy: 0 }, // transformación de la bomba en pantalla (para los clics)
  avatars: [] as { r: Role, x: number, y: number, rad: number }[], radioBox: null as null | { x: number, y: number, w: number, h: number },
  now: 0,
  hudless: false, // sin el panel de la derecha (la grabación de la portada): la bomba usa todo el ancho
  touch: false,   // el último puntero fue un dedo (en la bomba: tocar un módulo lo acerca en vez de apretar)
  safe: { l: 0, r: 0, t: 0, b: 0 }, // la muesca y las barras del teléfono (env(safe-area-inset-*))
  dockH: 0, brOpen: false, // alto del panel de abajo y si está la tarjeta braille (la vista les deja lugar)
};
export const roleOfId = (id: number): Role | null => app.seats.find(s => s.id === id)?.role ?? null;
