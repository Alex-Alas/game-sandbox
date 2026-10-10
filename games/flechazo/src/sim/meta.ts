// Progreso guardado (puro: el navegador lo lee y lo escribe en localStorage `flechazo.save`): monedas, mejoras, mascotas,
// el nivel que sigue en cada dificultad y los ajustes. Las mejoras son permanentes y se compran desde dentro del nivel
// (la tienda MEJORAS); cada escalón cuesta más y deja el juego un poco más fácil. Las mascotas se adoptan con monedas y
// son compañía (una a la vez).
import { DIFFS, type Diff } from './levels.ts';

export type UpKind = 'vel' | 'salto' | 'vis';
export const UP_MAX = 5;
export const UPGRADES: Record<UpKind, { name: string, cost: number[], what: string[] }> = {
  vel: { name: 'Velocidad', cost: [25, 60, 120, 220, 380],
    what: ['Caminás a paso normal', 'Un poco más rápido', 'Trote', 'Corrés', 'Corrés rápido', 'A toda velocidad'] },
  salto: { name: 'Salto', cost: [30, 70, 140, 250, 420],
    what: ['Saltás lo justo para subirte a una flecha', 'Saltás más alto', 'Doble salto', 'Doble salto más alto',
      'Planeás manteniendo SALTO', 'Triple salto y planeo'] },
  vis: { name: 'Visibilidad', cost: [25, 60, 120, 220, 380],
    what: ['Niebla cerca', 'La niebla se aleja', 'Ves más lejos y más minimapa', 'Más todavía',
      'Ves la trayectoria de la flecha que apuntás', 'Ves casi todo el tablero'] },
};
export const SPEED = [4.6, 5.3, 6.0, 6.8, 7.6, 8.6];
export const JUMP = [ // alto del salto (m), saltos extra en el aire, planeo
  { h: 1.3, air: 0, glide: false }, { h: 1.7, air: 0, glide: false }, { h: 1.7, air: 1, glide: false },
  { h: 2.1, air: 1, glide: false }, { h: 2.1, air: 1, glide: true }, { h: 2.3, air: 2, glide: true },
];
export const FOG = [17, 23, 30, 39, 50, 72];  // m hasta donde se ve
export const MAP_R = [10, 12, 15, 19, 24, 32]; // m de radio del minimapa
export const TRAJ_AT = 4;                    // desde este nivel de visibilidad se ve la trayectoria
export const HINT_COST = 15;
export const TIP = { isles: 1, hole: 2, ring: 4, twins: 8 }; // lo nuevo que ya se explicó (bits de `tips`)

export type PetId = 'gomita' | 'michi' | 'pio' | 'croac' | 'bu' | 'ajolote' | 'zumbi' | 'robi' | 'dragui';
export const PETS: { id: PetId, name: string, cost: number, desc: string }[] = [
  { id: 'gomita', name: 'Gomita', cost: 50, desc: 'Una gelatina de menta que rebota detrás tuyo.' },
  { id: 'michi', name: 'Michi', cost: 90, desc: 'Un gato naranja con mucha curiosidad.' },
  { id: 'pio', name: 'Pío', cost: 140, desc: 'Un pollito que revolotea a tu lado.' },
  { id: 'croac', name: 'Croac', cost: 200, desc: 'Una rana que salta por encima de las flechas.' },
  { id: 'bu', name: 'Bu', cost: 280, desc: 'Un fantasmita que flota y se asusta de los choques.' },
  { id: 'ajolote', name: 'Ajolote', cost: 380, desc: 'Rosado, sonriente y con branquias de pluma.' },
  { id: 'zumbi', name: 'Zumbi', cost: 500, desc: 'Una abeja que zumba alrededor tuyo.' },
  { id: 'robi', name: 'Robi', cost: 650, desc: 'Un robotito con antena que se prende cuando liberás.' },
  { id: 'dragui', name: 'Dragui', cost: 850, desc: 'Un dragoncito violeta. El más caro, el más orgulloso.' },
];

export type Settings = { sens: number, invert: boolean, sound: boolean, music: boolean, quality: 'alta' | 'baja', fov: number };
export type Save = {
  v: 1, coins: number, up: Record<UpKind, number>, pets: PetId[], pet: PetId | null,
  prog: Record<Diff, number>, // próximo nivel de cada dificultad
  diff: Diff,                 // la última que se jugó
  tut: number,                // 0 = falta el tutorial, 1 = hecho, 2 = ya se explicó la tienda
  tips: number,               // bits de TIP: islas, hueco, anillos y gemelas ya explicados
  stats: { won: number, arrows: number, errors: number, tp: number },
  set: Settings,
};

export const fresh = (): Save => ({
  v: 1, coins: 0, up: { vel: 0, salto: 0, vis: 0 }, pets: [], pet: null,
  prog: { facil: 1, dificil: 1, extremo: 1, islas: 1 }, diff: 'facil', tut: 0, tips: 0,
  stats: { won: 0, arrows: 0, errors: 0, tp: 0 },
  set: { sens: 1, invert: false, sound: true, music: true, quality: 'alta', fov: 70 },
});

// Lee lo guardado completando lo que falte (versiones viejas o datos rotos)
export function parse(raw: string | null): Save {
  const s = fresh();
  if (!raw) return s;
  try {
    const o = JSON.parse(raw);
    if (!o || o.v !== 1) return s;
    const num = (v: unknown, d: number, lo = 0, hi = Infinity) => typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
    s.coins = Math.floor(num(o.coins, 0));
    for (const k of Object.keys(s.up) as UpKind[]) s.up[k] = Math.floor(num(o.up?.[k], 0, 0, UP_MAX));
    s.pets = Array.isArray(o.pets) ? o.pets.filter((p: unknown) => PETS.some(q => q.id === p)) : [];
    s.pet = s.pets.includes(o.pet) ? o.pet : null;
    for (const d of DIFFS) s.prog[d] = Math.floor(num(o.prog?.[d], 1, 1));
    s.diff = DIFFS.includes(o.diff) ? o.diff : 'facil';
    s.tut = Math.floor(num(o.tut, 0, 0, 2));
    s.tips = Math.floor(num(o.tips, 0, 0, 255));
    s.stats = { won: num(o.stats?.won, 0), arrows: num(o.stats?.arrows, 0), errors: num(o.stats?.errors, 0), tp: num(o.stats?.tp, 0) };
    s.set = { sens: num(o.set?.sens, 1, 0.2, 3), invert: !!o.set?.invert, sound: o.set?.sound !== false, music: o.set?.music !== false,
      quality: o.set?.quality === 'baja' ? 'baja' : 'alta', fov: num(o.set?.fov, 70, 55, 90) };
  } catch { /* datos rotos: se empieza de cero */ }
  return s;
}

export const upCost = (s: Save, k: UpKind) => s.up[k] >= UP_MAX ? null : UPGRADES[k].cost[s.up[k]];
export function buyUp(s: Save, k: UpKind): boolean {
  const c = upCost(s, k);
  if (c === null || s.coins < c) return false;
  s.coins -= c, s.up[k]++;
  return true;
}
export function buyPet(s: Save, id: PetId): boolean {
  const p = PETS.find(q => q.id === id);
  if (!p || s.pets.includes(id) || s.coins < p.cost) return false;
  s.coins -= p.cost, s.pets.push(id), s.pet = id;
  return true;
}
// DIFÍCIL e ISLAS se abren con 3 niveles de FÁCIL y EXTREMO con 3 de DIFÍCIL
export const UNLOCK = 3;
export function unlocked(s: Save, d: Diff): boolean {
  if (d === 'facil') return true;
  if (d === 'dificil' || d === 'islas') return s.prog.facil > UNLOCK;
  return s.prog.dificil > UNLOCK;
}
export function phys(s: Save) {
  const j = JUMP[s.up.salto];
  return { speed: SPEED[s.up.vel], jumpH: j.h, air: j.air, glide: j.glide };
}
