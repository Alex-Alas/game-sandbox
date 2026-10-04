/* Contenido de la run (puro, sin DOM): qué elementos existen, cuánto «cuestan», qué presenta
   cada ciclo y los metadatos de cada bloque. El generador (level.js) llena cada tramo con
   bloques del pool hasta su presupuesto de complejidad. */
import { BLOCKS } from './blocks.js';
import { RINGS } from './rings.js';

/* kind: criatura | obstaculo | mecanica | modificador | objetivo · cost: por aparición (por
   carácter en el ASCII) · cycle: ciclo en el que se presenta (0 = ya estaba o el primero). */
export const ELEMENTS = {
  goblin: { kind: 'criatura', cost: 1.5, cycle: 0 },
  imp: { kind: 'criatura', cost: 2, cycle: 0 },
  cube: { kind: 'criatura', cost: 2.5, cycle: 0 },
  fairy: { kind: 'criatura', cost: 0.5, cycle: 0 },
  random: { kind: 'criatura', cost: 2, cycle: 0 },     // «?»: criatura al azar según el nivel
  skeleton: { kind: 'criatura', cost: 2.5, cycle: 0 },
  spikes: { kind: 'obstaculo', cost: 0.25, cycle: 0 },
  wood: { kind: 'obstaculo', cost: 0, cycle: 0 },
  crumble: { kind: 'obstaculo', cost: 0.2, cycle: 0 },
  bungee: { kind: 'mecanica', cost: 3, cycle: 0 },     // por bloque (no tiene carácter)
  derrumbe: { kind: 'modificador', cost: 0, cycle: 0 },
  ojo: { kind: 'objetivo', cost: 0, cycle: 0 },        // jefe del ciclo 0
  // Exterior (F2): se presentan en la bajada del ciclo 0 (cycle 0.5: no entran al mini del ciclo 0)
  wind: { kind: 'mecanica', cost: 1.5, cycle: 0.5 },   // por anillo (no tiene carácter)
  mover: { kind: 'mecanica', cost: 0.3, cycle: 0.5 },  // por tile de plataforma
  gargoyle: { kind: 'criatura', cost: 1.5, cycle: 0.5 },
  bat: { kind: 'criatura', cost: 1.2, cycle: 0.5 },
};

/* Carácter del ASCII → elemento (null = neutro: piedra, vacío, gemas, antorchas, sala del jefe). */
export const CHAR_ELEMENT = {
  '#': null, '.': null, '*': null, G: null, T: null, D: null, X: null, O: 'ojo',
  g: 'goblin', i: 'imp', c: 'cube', f: 'fairy', '?': 'random', s: 'skeleton',
  '^': 'spikes', '-': 'wood', '=': 'crumble',
  b: 'bat', w: 'gargoyle', m: 'mover', h: null, v: null,
};

/* Currículo: ciclo → bioma, novedades y jefe. Los ciclos sin entrada son «+1» del último
   (sin novedades, más presupuesto y más largo) hasta que F2/F4 agreguen contenido. */
const CURR = [
  { biome: 'mazmorra', news: ['skeleton', 'crumble', 'derrumbe'], boss: 'ojo' },
];
/* Novedades del exterior: se presentan en la bajada del ciclo 0 (un anillo por novedad). */
export const EXT_NEWS = ['wind', 'mover', 'gargoyle', 'bat'];
export const CURRICULUM = (c) => CURR[c] || { biome: CURR[CURR.length - 1].biome, news: [], boss: 'ojo', plus: c - CURR.length + 1 };

/* Bloques especiales (no entran al pool de intermedios). */
export const FIXED = new Set(['inicio', 'fin', 'antesala', 'antesala2', 'ojo_a', 'ojo_b']);
export const BUNGEE = ['bungee', 'bungee2'];

/* Sobrescrituras a mano de los metadatos derivados. intro: bloque de presentación de ese
   elemento (va primero en el tramo k = 0 de su ciclo). */
const OVERRIDES = {
  cornisas: { chase: true }, pinchos: { chase: true }, hadas: { chase: true }, goblins: { chase: true },
  torres: { chase: true }, saltos: { chase: true },
  arquero: { chase: true, intro: 'skeleton' },
  quebradizo: { chase: true, intro: 'crumble' },
  caida_arquera: { chase: true }, foso_quebradizo: { chase: true },
};

/* Etiquetas y costo derivados del ASCII. */
function derive(id, rows, extra = []) {
  const tags = new Set(), unknown = new Set();
  let cost = 0;
  for (const r of rows) for (const ch of r) {
    if (!(ch in CHAR_ELEMENT)) { unknown.add(ch); continue; }
    const el = CHAR_ELEMENT[ch];
    if (!el) continue;
    tags.add(el);
    cost += ELEMENTS[el].cost;
  }
  if (BUNGEE.includes(id)) { tags.add('bungee'); cost += ELEMENTS.bungee.cost; }
  for (const e of extra) { tags.add(e); cost += ELEMENTS[e].cost; }
  const minCycle = Math.max(0, ...[...tags].map((t) => ELEMENTS[t].cycle));
  return { tags: [...tags], cost: Math.round(cost * 100) / 100, chase: false, minCycle, intro: null, unknown: [...unknown] };
}

export const BLOCK_META = Object.fromEntries(Object.entries(BLOCKS).map(([id, rows]) => [id, Object.assign(derive(id, rows), OVERRIDES[id])]));

/* Intermedios del pool (todo lo que no es fijo). */
export const MIDDLE = Object.keys(BLOCKS).filter((id) => !FIXED.has(id) && !BUNGEE.includes(id));

/* Anillos del exterior: mismos metadatos. wind: el anillo tiene ráfagas (marca sin carácter). */
export const RING_FIXED = new Set(['ventana', 'entrada']);
const RING_OVERRIDES = {
  r_viento: { wind: true, intro: 'wind' }, r_plataformas: { intro: 'mover' },
  r_gargola: { intro: 'gargoyle' }, r_murcielago: { intro: 'bat' },
  r_rafagas: { wind: true },
};
export const RING_META = Object.fromEntries(Object.entries(RINGS).map(([id, rows]) => {
  const o = RING_OVERRIDES[id] || {};
  return [id, Object.assign(derive(id, rows, o.wind ? ['wind'] : []), { wind: false }, o)];
}));
export const RING_MIDDLE = Object.keys(RINGS).filter((id) => !RING_FIXED.has(id));
