// Estilos de las mascotas (puro): pieles (colores lisos, estampados y materiales) y accesorios, cada uno con su rareza.
// Salen de los cofres que se ganan con los eventos del nivel; cada estilo es para una mascota (el «Oro» de Michi y el de
// Gomita son dos premios distintos) y solo para las que ya se adoptaron. Cada mascota lleva una piel y un accesorio a la
// vez. El dibujo de cada estilo vive en pets.ts; acá están los nombres, las rarezas y el sorteo.
import type { PetId } from './meta.ts';

export type Tier = 0 | 1 | 2 | 3;
export const TIERS: { name: string, hex: string }[] = [
  { name: 'COMÚN', hex: '#9fb0cf' }, { name: 'RARO', hex: '#4b69ff' }, { name: 'ÉPICO', hex: '#b13cff' }, { name: 'LEGENDARIO', hex: '#ffb020' },
];
export const TIER_W = [0.52, 0.29, 0.15, 0.04]; // probabilidad de cada rareza en un cofre
export type Slot = 'skin' | 'acc';
export type Style = { id: string, name: string, slot: Slot, tier: Tier, hex: string };
export const STYLES: Style[] = [
  // comunes: colores lisos
  { id: 'menta', name: 'Menta', slot: 'skin', tier: 0, hex: '#6fe3c1' },
  { id: 'cielo', name: 'Cielo', slot: 'skin', tier: 0, hex: '#7cc4ff' },
  { id: 'lavanda', name: 'Lavanda', slot: 'skin', tier: 0, hex: '#bda4ff' },
  { id: 'durazno', name: 'Durazno', slot: 'skin', tier: 0, hex: '#ffb38a' },
  { id: 'carbon', name: 'Carbón', slot: 'skin', tier: 0, hex: '#474a6a' },
  { id: 'nieve', name: 'Nieve', slot: 'skin', tier: 0, hex: '#f3f5ff' },
  // raros: estampados y accesorios chicos
  { id: 'rayas', name: 'Rayas', slot: 'skin', tier: 1, hex: '#ff7eb6' },
  { id: 'lunares', name: 'Lunares', slot: 'skin', tier: 1, hex: '#ff5a6e' },
  { id: 'cuadros', name: 'Cuadros', slot: 'skin', tier: 1, hex: '#4f8cff' },
  { id: 'corazones', name: 'Corazones', slot: 'skin', tier: 1, hex: '#ff8fc8' },
  { id: 'mono', name: 'Moño', slot: 'acc', tier: 1, hex: '#ff4f9a' },
  { id: 'flor', name: 'Flor', slot: 'acc', tier: 1, hex: '#ffd23f' },
  { id: 'gorrito', name: 'Gorrito de fiesta', slot: 'acc', tier: 1, hex: '#7b5cff' },
  // épicos
  { id: 'estrellas', name: 'Noche estrellada', slot: 'skin', tier: 2, hex: '#27306b' },
  { id: 'neon', name: 'Neón', slot: 'skin', tier: 2, hex: '#38ffe0' },
  { id: 'galera', name: 'Galera', slot: 'acc', tier: 2, hex: '#24234a' },
  { id: 'lentes', name: 'Lentes de sol', slot: 'acc', tier: 2, hex: '#1d1b3a' },
  { id: 'auris', name: 'Auriculares', slot: 'acc', tier: 2, hex: '#ff5f7a' },
  // legendarios
  { id: 'oro', name: 'Oro', slot: 'skin', tier: 3, hex: '#ffc93c' },
  { id: 'galaxia', name: 'Galaxia', slot: 'skin', tier: 3, hex: '#5b2bd6' },
  { id: 'arcoiris', name: 'Arcoíris', slot: 'skin', tier: 3, hex: '#ff5fcf' },
  { id: 'cristal', name: 'Cristal', slot: 'skin', tier: 3, hex: '#a9ecff' },
  { id: 'corona', name: 'Corona', slot: 'acc', tier: 3, hex: '#ffcf3a' },
  { id: 'aureola', name: 'Aureola', slot: 'acc', tier: 3, hex: '#fff1a8' },
];
export const styleOf = (id: string | null | undefined) => STYLES.find(s => s.id === id) ?? null;
export type Look = { skin: string | null, acc: string | null };
export const NO_LOOK: Look = { skin: null, acc: null };
export const styleKey = (pet: PetId, style: string) => `${pet}:${style}`;

export type Prize = { pet: PetId, style: string, tier: Tier } | { coins: number, tier: Tier };
export const DUP_COINS = 120; // si ya no queda ningún estilo por ganar

// Sorteo: primero la rareza (entre las que todavía tienen algo para ganar) y después una mascota y un estilo de esa rareza
// que no se tengan
export function rollPrize(pets: PetId[], owned: string[], rnd: () => number): Prize {
  const have = new Set(owned);
  const open = (t: number) => pets.flatMap(p => STYLES.filter(s => s.tier === t && !have.has(styleKey(p, s.id))).map(s => ({ pet: p, style: s.id })));
  const tiers = [0, 1, 2, 3].filter(t => open(t).length);
  if (!tiers.length) return { coins: DUP_COINS, tier: 0 };
  let x = rnd() * tiers.reduce((a, t) => a + TIER_W[t], 0), tier = tiers[tiers.length - 1];
  for (const t of tiers) { if ((x -= TIER_W[t]) < 0) { tier = t; break; } }
  const opts = open(tier), pick = opts[Math.floor(rnd() * opts.length)];
  return { ...pick, tier: tier as Tier };
}

// Lo que pasa por la ruleta antes del premio (solo dibujo): estilos al azar con las probabilidades de siempre
export function decoy(pets: PetId[], rnd: () => number, tier?: Tier): { pet: PetId, style: string, tier: Tier } {
  let t = tier;
  if (t === undefined) { let x = rnd(); t = 3; for (let k = 0; k < 4; k++) if ((x -= TIER_W[k]) < 0) { t = k as Tier; break; } }
  const opts = STYLES.filter(s => s.tier === t), s = opts[Math.floor(rnd() * opts.length)];
  return { pet: pets[Math.floor(rnd() * pets.length)], style: s.id, tier: t };
}
