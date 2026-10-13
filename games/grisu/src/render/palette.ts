// Paleta de LAS GALERÍAS (GDD §13.2) y la LUT 3D que cuantiza cada píxel al color de paleta más cercano.
// Cada material tiene cinco tonos con giro de tono (skill, dirección de arte §4): base, S = sombra hacia violeta,
// D = oclusión, R = contraluz frío (pizarra) y H = brillo cálido del farol. Lo único saturado son los emisivos:
// la arcanita, el color de cada escuela, el rojo del peligro y el blanco de lo que se devuelve.
import * as THREE from 'three';

export type Ramp = { base: string, S: string, D: string, R: string, H: string };

export const INK = '#1b1420';

export const MAT = {
  // latón redondeado (lo de la compañía): chispea con el brillo nítido
  brass: { base: '#b88e44', S: '#906527', D: '#583e20', R: '#8d93a8', H: '#f3d27e' },
  // cobre y óxido
  copper: { base: '#ab5c44', S: '#88564a', D: '#5c3839', R: '#8a8aa6', H: '#e39566' },
  // hierro angular
  iron: { base: '#635a5b', S: '#3f3f45', D: '#262531', R: '#8aa0b8', H: '#a59a92' },
  // cuero
  leather: { base: '#5b3e2a', S: '#3d2a22', D: '#291e18', R: '#6f7894', H: '#8a5e3a' },
  // la levita: paño oscuro verdoso (el gris verdoso de EV Ganin)
  coat: { base: '#3e4a44', S: '#2c3036', D: '#1e1f28', R: '#6f8aa0', H: '#6f7458' },
  // lona del traje de buzo
  canvas: { base: '#7a6a52', S: '#584a44', D: '#3a3036', R: '#7f8ea6', H: '#a8916a' },
  // pergamino (corbatín, esferas de los relojes)
  parch: { base: '#dbbf9b', S: '#a8917f', D: '#6e5f5c', R: '#b8c4d0', H: '#f4e2c2' },
  // la sombra bajo el ala: la cara nunca se ve
  shadow: { base: '#262531', S: '#20202c', D: '#1b1420', R: '#3d354c', H: '#3d354c' },
  // piedra de la mina
  rock: { base: '#635a5b', S: '#3f3f45', D: '#262531', R: '#5a6478', H: '#8a7a6c' },
  // carbón (vetas negras y hollín)
  coal: { base: '#3f3f45', S: '#262531', D: '#1b1420', R: '#4f5a70', H: '#635a5b' },
  // madera de los apuntalamientos
  wood: { base: '#7a5236', S: '#5b3e2a', D: '#3a2622', R: '#6a6f86', H: '#b07a48' },
  // acero de las hojas
  steel: { base: '#9aa6b8', S: '#6a6f86', D: '#3f3f45', R: '#cfe6ee', H: '#f4f6f8' },
  // vidrio oscuro (gafas sobre el ala, lentes apagados)
  glass: { base: '#3d4f5a', S: '#262f3a', D: '#1b1420', R: '#8fb4c4', H: '#cfe6ee' },
} satisfies Record<string, Ramp>;
export type MatName = keyof typeof MAT;

// Emisivos: [núcleo, color, borde oscuro]
export const EMIT = {
  arcanita: ['#b8fff6', '#3bded3', '#1d8a8a'],
  piro: ['#ffd36a', '#ff9a3c', '#a8461e'],
  electro: ['#d8f6ff', '#47beec', '#1f5f9a'],
  alquimia: ['#e4ff7a', '#8fd72a', '#3f7a1c'],
  crono: ['#e6d4ff', '#9b5cff', '#4a2a8a'],
  peligro: ['#ff8a6a', '#c92821', '#6e1214'],
  farol: ['#fff0c0', '#ffb35a', '#c46a2a'],
  grisu: ['#f4f2b0', '#cfc46a', '#7a7a3a'],
  blanco: ['#ffffff', '#e8eef4', '#9aa6b8'],
} as const;
export type School = 'arcanita' | 'piro' | 'electro' | 'alquimia' | 'crono';
export const SCHOOLS: [School, string][] = [['arcanita', 'Arcanita'], ['piro', 'Piromancia'], ['electro', 'Electromancia'], ['alquimia', 'Alquimia'], ['crono', 'Cronomancia']];

// Lo que no es material ni emisivo: el fondo de la mina, la bruma y el humo
export const EXTRA = ['#3d354c', '#262531', '#20202c', '#2e2a3a', '#4a4358', '#5e5468', '#7c7080', '#9a8c92', '#d6cfbd', '#c8b4a0', '#e8d2b0'];

export function paletteColors(): string[] {
  const set = new Set<string>([INK, ...EXTRA]);
  for (const r of Object.values(MAT)) for (const c of Object.values(r)) set.add(c);
  for (const e of Object.values(EMIT)) for (const c of e) set.add(c);
  return [...set];
}

// sRGB 0–1 de un hex
export const srgb = (c: string): [number, number, number] => { const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
// THREE.Color guarda el color en lineal (gestión de color de three): así lo reciben los shaders
export const lin = (c: string) => new THREE.Color(c);

// OKLab: la distancia perceptual para elegir el color de paleta más cercano
function oklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const toLin = (u: number) => u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);

// LUT de N³ en sRGB → color de paleta (sRGB, 8 bits). El shader la muestrea con el color ya en sRGB.
export function buildLut(colors: string[], N = 32): THREE.Data3DTexture {
  const pal = colors.map((c) => { const k = srgb(c); return { rgb: k, lab: oklab(toLin(k[0]), toLin(k[1]), toLin(k[2])) }; });
  const data = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const L = oklab(toLin(r / (N - 1)), toLin(g / (N - 1)), toLin(b / (N - 1)));
    let best = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i].lab, dl = (p[0] - L[0]) * 1.2, da = p[1] - L[1], db = p[2] - L[2];
      const d = dl * dl + da * da + db * db;
      if (d < bd) { bd = d; best = i; }
    }
    const o = ((b * N + g) * N + r) * 4, c = pal[best].rgb;
    data[o] = Math.round(c[0] * 255); data[o + 1] = Math.round(c[1] * 255); data[o + 2] = Math.round(c[2] * 255); data[o + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.wrapR = t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
