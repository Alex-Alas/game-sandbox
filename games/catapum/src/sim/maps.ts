// Mapas: islas flotando sobre el agua (o la lava), hechas de tierra con un núcleo de piedra que no se rompe (así el
// mapa nunca desaparece del todo). Se construyen por semilla (relieve de la superficie) y son deterministas.
// Fuera del ring: el líquido de abajo, los costados (BLAST_X más allá del borde) y arriba (BLAST_TOP sobre el techo),
// más los peligros de cada mapa (viento, rocas del volcán, el tren).
import { newTerr, set, cell, CELL, AIR, DIRT, ROCK, WOOD, type Terr } from './terrain.ts';
import { rnd, type Rng } from './rng.ts';

export const BLAST_X = 12, BLAST_TOP = 12;

export type Pad = { x: number, y: number, w: number, v: number }; // trampolín: [x ± w/2] sobre y, lanza a v m/s
export type Hazards = {
  wind?: { every: number, warn: number, dur: number, a: number },     // ráfagas que alternan de lado (m/s²)
  rocks?: { every: number, warn: number, n: number },                 // rocas del volcán que caen del cielo
  train?: { y: number, every: number, warn: number, v: number, len: number }, // el tren cruza sobre el puente
  cannon?: { every: number, warn: number, v: number, n: number, y0: number, y1: number }, // n cañonazos horizontales por tanda (línea roja `warn` s antes), de un costado o del otro, a alturas entre y0 e y1
  crystals?: { every: number, warn: number, n: number, at: [number, number][] },          // racimos del techo (x, y): n tiemblan `warn` s y sueltan una esquirla que cae
};
export type MapDef = {
  id: string, name: string, desc: string, theme: string,
  w: number, h: number, water: number, lava: boolean,
  spawns: [number, number][], pads: Pad[], hz: Hazards,
  masts?: [number, number, number][], // solo dibujo: mástiles [x, y de abajo, y de arriba]
  build: (T: Terr, r: Rng) => void,
};

const fill = (T: Terr, x0: number, y0: number, x1: number, y1: number, m: number, f: (x: number, y: number) => boolean) => {
  for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    if (f((i + 0.5) * CELL, (j + 0.5) * CELL)) set(T, i, j, m);
};
const rect = (T: Terr, x0: number, y0: number, x1: number, y1: number, m: number) => fill(T, x0, y0, x1 - 1e-6, y1 - 1e-6, m, () => true);
const ellipse = (T: Terr, cx: number, cy: number, rx: number, ry: number, m: number, inside = false) =>
  fill(T, cx - rx, cy - ry, cx + rx, cy + ry, m, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && (!inside || cell(T, Math.floor(x / CELL), Math.floor(y / CELL)) !== AIR));

// Relieve suave por semilla: suma de ondas con fase al azar (solo al construir el mapa)
function bumps(r: Rng, amp: number) {
  const ph = [rnd(r), rnd(r), rnd(r)].map(v => v * 6.283);
  return (x: number) => amp * (0.5 * Math.sin(x * 0.45 + ph[0]) + 0.3 * Math.sin(x * 1.1 + ph[1]) + 0.2 * Math.sin(x * 2.3 + ph[2]));
}
// Isla flotante: arriba casi plana (con relieve) y redondeada en los bordes; abajo un cono redondo. Núcleo de piedra.
function island(T: Terr, r: Rng, cx: number, top: number, w: number, depth: number, core = 0.32) {
  const b = bumps(r, 0.35), hw = w / 2;
  fill(T, cx - hw, top - depth - 1, cx + hw, top + 1, DIRT, (x, y) => {
    const u = (x - cx) / hw;
    if (u * u >= 1) return false;
    const t = top + b(x) - 1.4 * u ** 8, bot = top - depth * Math.pow(1 - u * u, 0.7) - 0.4;
    return y <= t && y >= bot;
  });
  if (core > 0) ellipse(T, cx, top - depth * 0.62, hw * core * 1.1, depth * core * 0.75, ROCK, true);
}
// Plataforma flotante delgada con base de piedra (una fila)
function ledge(T: Terr, cx: number, y: number, w: number, th = 1, m = DIRT) {
  rect(T, cx - w / 2, y - th, cx + w / 2, y, m);
  rect(T, cx - w / 2 + 0.75, y - th, cx + w / 2 - 0.75, y - th + CELL, ROCK);
}

// Puente colgante: de (x0, y0) a (x1, y1) (y = superficie) con una panza de `sag` m en el medio: tablones de madera
// (se rompen con explosiones) sobre una viga de piedra de una celda (no se rompe: el puente nunca se corta del todo y
// quien cae de un tablón roto se agarra de la viga). `hole` = tablones que faltan entre esas x.
function bridge(T: Terr, x0: number, y0: number, x1: number, y1: number, sag: number, hole: [number, number] = [0, 0], th = 0.75) {
  for (let i = Math.floor(x0 / CELL); i < Math.floor(x1 / CELL); i++) {
    const x = (i + 0.5) * CELL;
    if (x >= hole[0] && x < hole[1]) continue;
    const u = (x - x0) / (x1 - x0), top = y0 + (y1 - y0) * u - sag * 4 * u * (1 - u);
    const jt = Math.round(top / CELL);
    for (let j = jt - Math.round(th / CELL); j < jt; j++) set(T, i, j, j === jt - Math.round(th / CELL) ? ROCK : WOOD);
  }
}
// Cueva: masas de piedra [x, y, rx, ry] colgando arriba, estalactitas [x, largo] debajo y los racimos de cristal
// (las puntas) de donde caen las esquirlas
const CAVE_MASSES: [number, number, number, number][] = [[14, 42, 10, 4.5], [42, 42.5, 12, 5], [70, 42, 10, 4.5]];
const caveBottom = (x: number) => {
  for (const [cx, cy, rx, ry] of CAVE_MASSES) if (Math.abs(x - cx) < rx) return cy - ry * Math.sqrt(1 - ((x - cx) / rx) ** 2);
  return 48;
};
const CAVE_CONES: [number, number][] = [[8, 3.5], [14, 6], [20, 3.5], [35, 4], [42, 7], [49, 4], [64, 3.5], [70, 6], [76, 3.5]];
const CAVE_TIPS: [number, number][] = CAVE_CONES.map(([x, L]) => [x, Math.round((caveBottom(x) - L - 0.1) * 100) / 100]);

export const MAPS: MapDef[] = [
  {
    id: 'islas', name: 'ISLAS BUM', theme: 'isla', desc: 'Tres islas y dos plataformas sobre el mar. El clásico.',
    w: 80, h: 46, water: 3, lava: false, pads: [], hz: {},
    spawns: [[40, 16], [14, 13], [66, 13], [25, 22], [55, 22], [33, 16], [47, 16], [40, 28]],
    build(T, r) {
      island(T, r, 40, 14, 27, 7.5);
      island(T, r, 14, 11.5, 16, 5);
      island(T, r, 66, 11.5, 16, 5);
      ledge(T, 25, 21, 7);
      ledge(T, 55, 21, 7);
      ledge(T, 40, 27, 6);
    },
  },
  {
    id: 'torres', name: 'TORRES DEL VIENTO', theme: 'torres', desc: 'Cinco torres con túnel unidas por puentes de madera, con balcones y azoteas para subir de pared en pared. El viento cambia de lado: agarrate o enganchate.',
    w: 80, h: 50, water: 3, lava: false, pads: [], hz: { wind: { every: 15, warn: 2, dur: 5, a: 11 } },
    spawns: [[15, 26.85], [65, 26.85], [27.5, 28.35], [52.5, 28.35], [40, 29.85], [33.75, 20.6], [46.25, 20.6], [8, 15.2]],
    build(T, r) {
      // Cinco torres de 5 m (piedra, con un túnel de 2,8 m a la altura de la calle y una azotea de tierra siete metros
      // más arriba) y puentes de madera entre ellas: la calle atraviesa las torres. A 4,5 m sobre la calle, balcones
      // que casi se tocan (se sube con un salto por el hueco o de pared en pared) y, arriba del todo, un mirador.
      const xs = [15, 27.5, 40, 52.5, 65], ys = [19, 20.5, 22, 20.5, 19];
      xs.forEach((x, k) => {
        rect(T, x - 2.5, 0, x + 2.5, ys[k] + 7, ROCK);
        rect(T, x - 2.5, ys[k] + 7, x + 2.5, ys[k] + 7.75, DIRT);
        rect(T, x - 2.5, ys[k], x + 2.5, ys[k] + 2.8, AIR);
      });
      for (let k = 0; k < 4; k++) {
        const a = xs[k] + 2.5, b = xs[k + 1] - 2.5;
        bridge(T, a, ys[k], b, ys[k + 1], 1);
        rect(T, a, ys[k] + 4, a + 3, ys[k] + 4.5, WOOD);
        rect(T, b - 3, ys[k + 1] + 4, b, ys[k + 1] + 4.5, WOOD);
      }
      ledge(T, 40, 32.6, 5, 0.5, WOOD);
      // faldas de los extremos: rampas a 45° de tierra sobre piedra (se suben caminando)
      for (const sg of [-1, 1]) {
        const f = xs[sg < 0 ? 0 : 4] + sg * 2.5, top = ys[0], run = 12;
        fill(T, Math.min(f, f + sg * run), 0, Math.max(f, f + sg * run), top, DIRT, (x, y) => y <= top - Math.abs(x - f));
        fill(T, Math.min(f, f + sg * run), 0, Math.max(f, f + sg * run), top, ROCK, (x, y) => y <= top - Math.abs(x - f) - 1);
      }
      void r;
    },
  },
  {
    id: 'volcan', name: 'VOLCÁN', theme: 'volcan', desc: 'Una montaña sobre la lava. Cada tanto llueven rocas encendidas (mirá las marcas).',
    w: 80, h: 48, water: 3, lava: true, pads: [], hz: { rocks: { every: 9, warn: 1.6, n: 3 } },
    spawns: [[40, 21], [26, 16.9], [54, 16.9], [8, 14], [72, 14], [33, 20.4], [47, 20.4], [40, 30]],
    build(T, r) {
      const b = bumps(r, 0.4);
      fill(T, 16, 0, 64, 24, DIRT, (x, y) => {
        const u = Math.abs(x - 40) / 24, top = 21 - 14 * u * u + b(x) * (1 - u);
        return y <= top && y >= 4.5 - 3 * (1 - u);
      });
      ellipse(T, 40, 22.5, 5, 3.2, AIR); // el cráter
      fill(T, 30, 4, 50, 13, ROCK, (x, y) => ((x - 40) / 9) ** 2 + ((y - 9) / 4) ** 2 <= 1);
      island(T, r, 8, 12.5, 11, 4);
      island(T, r, 72, 12.5, 11, 4);
      ledge(T, 40, 29, 6);
    },
  },
  {
    id: 'expreso', name: 'EXPRESO', theme: 'expreso', desc: 'Un puente largo con vías. El tren pasa cada tanto y no frena por nadie.',
    w: 84, h: 46, water: 3, lava: false, pads: [], hz: { train: { y: 10, every: 19, warn: 2.6, v: 38, len: 13 } },
    spawns: [[20, 19], [64, 19], [42, 26], [10, 11], [74, 11], [32, 11], [52, 11], [42, 34]],
    build(T, r) {
      rect(T, 2, 9.25, 82, 10, WOOD);
      for (const x of [12, 28, 42, 56, 72]) rect(T, x - 0.75, 0, x + 0.75, 9.25, ROCK);
      island(T, r, 20, 18, 13, 4.5);
      island(T, r, 64, 18, 13, 4.5);
      island(T, r, 42, 25, 11, 3.5);
      ledge(T, 42, 33, 5);
    },
  },
  {
    id: 'nubes', name: 'NUBES', theme: 'nubes', desc: 'Nubes chicas muy arriba del mar y hongos que te lanzan. Para los que no paran de moverse.',
    w: 84, h: 50, water: 3, lava: false, hz: {},
    pads: [{ x: 13, y: 12.75, w: 2, v: 26 }, { x: 71, y: 12.75, w: 2, v: 26 }, { x: 42, y: 11.5, w: 2.2, v: 30 }],
    spawns: [[42, 13], [13, 14], [71, 14], [28, 19], [56, 19], [20, 27], [64, 27], [42, 32]],
    build(T, r) {
      for (const [x, y, rx, ry] of [[13, 11, 7, 1.8], [28, 17, 6, 1.5], [42, 9.5, 9, 2.2], [56, 17, 6, 1.5], [71, 11, 7, 1.8],
        [20, 25, 4.5, 1.2], [64, 25, 4.5, 1.2], [42, 30, 5.5, 1.3], [42, 21, 3, 0.9]]) {
        ellipse(T, x, y, rx, ry, DIRT);
        ellipse(T, x - rx * 0.4, y + ry * 0.4, rx * 0.45, ry * 0.8, DIRT);
        ellipse(T, x + rx * 0.35, y + ry * 0.35, rx * 0.4, ry * 0.75, DIRT);
        rect(T, x - rx * 0.3, y - ry * 0.55, x + rx * 0.3, y - ry * 0.55 + 0.5, ROCK);
      }
      void r;
    },
  },
  {
    id: 'barco', name: 'BARCO PIRATA', theme: 'barco', desc: 'Un galeón con castillo de popa, proa y vergas para saltar. Desde los costados te cañonean: mirá la línea roja y agachate (o saltá).',
    w: 84, h: 48, water: 3, lava: false, pads: [], hz: { cannon: { every: 8, warn: 2, v: 32, n: 2, y0: 9, y1: 31 } },
    masts: [[42, 15, 35], [58, 15, 27]],
    spawns: [[42, 15.1], [20, 19.6], [67, 18.1], [23, 19.6], [38.5, 19.6], [55.5, 20.1], [48, 15.1], [34, 15.1]],
    build(T) {
      const D = 15; // cubierta principal
      // casco de madera (de 13 a 71 m), con la quilla de piedra: es lo que no se rompe
      fill(T, 13, 5, 71, D, WOOD, (x, y) => { const u = Math.abs(x - 42) / 29; return y < D && y >= D - 9 * Math.pow(1 - Math.pow(u, 2.6), 0.6); });
      ellipse(T, 42, 7.4, 18, 1.1, ROCK, true);
      // castillo de popa (a la izquierda) con rampa a la cubierta y el espejo de popa (una pared para saltar)
      rect(T, 13.5, D, 27, 19.5, WOOD);
      fill(T, 27, D, 33, 19.5, WOOD, (x, y) => y < D + 4.5 * (33 - x) / 6);
      rect(T, 13.5, 19.5, 14.5, 22.5, WOOD);
      // proa: castillo bajo con rampa
      rect(T, 63, D, 71, 18, WOOD);
      fill(T, 56, D, 63, 18, WOOD, (x, y) => y < D + 3 * (x - 56) / 7);
      // arrecifes de arena a los dos lados (el barco encalló en una cala): rampas a 45° para volver a subir, y madera
      // y piedra llenan el casco de la popa y de la proa (si no, queda un hueco donde se traba la gente)
      for (const [f, top, sg] of [[13.5, 19.5, -1], [71, 18, 1]]) {
        fill(T, Math.min(f, f + sg * 12), 0, Math.max(f, f + sg * 12), top, DIRT, (x, y) => y <= top - Math.abs(x - f));
        fill(T, Math.min(f, f + sg * 12), 0, Math.max(f, f + sg * 12), top, ROCK, (x, y) => y <= top - Math.abs(x - f) - 1);
        rect(T, Math.min(f, f - sg * 12.5), 0, Math.max(f, f - sg * 12.5), D - 0.01, WOOD);
        rect(T, Math.min(f, f - sg * 11.5), 0, Math.max(f, f - sg * 11.5), 9, ROCK);
      }
      // vergas (donde cuelgan las velas): escalera en zigzag alrededor del palo mayor, y el trinquete
      ledge(T, 38.5, 19.5, 5, 0.5, WOOD);
      ledge(T, 45.5, 24, 5, 0.5, WOOD);
      ledge(T, 38.5, 28.5, 5, 0.5, WOOD);
      ledge(T, 45.5, 33, 5, 0.5, WOOD);
      ledge(T, 55.5, 20, 6, 0.5, WOOD);
      ledge(T, 61, 24.5, 4, 0.5, WOOD);
    },
  },
  {
    id: 'cueva', name: 'CUEVA DE CRISTAL', theme: 'cueva', desc: 'Una caverna con islas de roca, una pirámide de cristal en el medio y estalactitas colgando. Los racimos de cristal del techo tiemblan y sueltan esquirlas.',
    w: 84, h: 48, water: 3, lava: false, pads: [],
    hz: { crystals: { every: 6, warn: 1.5, n: 2, at: CAVE_TIPS } },
    spawns: [[42, 20.3], [13, 18.7], [71, 18.7], [27, 22.6], [57, 22.6], [33, 14.4], [51, 14.4], [36, 16.2]],
    build(T, r) {
      // masas de piedra colgando del techo, con estalactitas (de piedra: no se rompen)
      for (const [cx, cy, rx, ry] of CAVE_MASSES) ellipse(T, cx, cy, rx, ry, ROCK);
      for (const [cx, L] of CAVE_CONES) {
        const b0 = caveBottom(cx);
        fill(T, cx - 1.6, b0 - L, cx + 1.6, b0 + 0.5, ROCK, (x, y) => y >= b0 - L + Math.abs(x - cx) * L / 1.6);
      }
      island(T, r, 42, 13.5, 32, 8);
      island(T, r, 13, 18, 14, 5);
      island(T, r, 71, 18, 14, 5);
      ledge(T, 27, 22.5, 7);
      ledge(T, 57, 22.5, 7);
      // pirámide de cristal en el medio: tres pisos de piedra de 2,2 m
      rect(T, 38, 12, 46, 15.7, ROCK);
      rect(T, 40, 15.7, 44, 17.9, ROCK);
      rect(T, 41.2, 17.9, 42.8, 20.1, ROCK);
    },
  },
];

export const mapById = (id: string) => MAPS.find(m => m.id === id) ?? MAPS[0];

// Terreno del mapa para una semilla (la misma en el anfitrión y en los invitados)
export function buildMap(m: MapDef, seed: number): Terr {
  const T = newTerr(Math.round(m.w / CELL), Math.round(m.h / CELL));
  m.build(T, { rng: seed ^ 0x5bd1e995 });
  return T;
}
