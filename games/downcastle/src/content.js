/* Contenido de la run (puro, sin DOM): qué elementos existen, cuánto «cuestan», qué presenta
   cada ciclo y los metadatos de cada bloque. El generador (level.js) llena cada tramo con
   bloques del pool hasta su presupuesto de complejidad. */
import { BLOCKS } from './blocks.js';

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
};

/* Carácter del ASCII → elemento (null = neutro: piedra, vacío, gemas, antorchas, sala del jefe). */
export const CHAR_ELEMENT = {
  '#': null, '.': null, '*': null, G: null, T: null, D: null, X: null, O: 'ojo',
  g: 'goblin', i: 'imp', c: 'cube', f: 'fairy', '?': 'random', s: 'skeleton',
  '^': 'spikes', '-': 'wood', '=': 'crumble',
};

/* Currículo: ciclo → bioma, novedades y jefe. Los ciclos sin entrada son «+1» del último
   (sin novedades, más presupuesto y más largo) hasta que F2/F4 agreguen contenido. */
const CURR = [
  { biome: 'mazmorra', news: ['skeleton', 'crumble', 'derrumbe'], boss: 'ojo' },
];
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
function derive(id, rows) {
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
  const minCycle = Math.max(0, ...[...tags].map((t) => ELEMENTS[t].cycle));
  return { tags: [...tags], cost: Math.round(cost * 100) / 100, chase: false, minCycle, intro: null, unknown: [...unknown] };
}

export const BLOCK_META = Object.fromEntries(Object.entries(BLOCKS).map(([id, rows]) => [id, Object.assign(derive(id, rows), OVERRIDES[id])]));

/* Intermedios del pool (todo lo que no es fijo). */
export const MIDDLE = Object.keys(BLOCKS).filter((id) => !FIXED.has(id) && !BUNGEE.includes(id));
