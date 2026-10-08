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
};
export type MapDef = {
  id: string, name: string, desc: string, theme: string,
  w: number, h: number, water: number, lava: boolean,
  spawns: [number, number][], pads: Pad[], hz: Hazards,
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
    id: 'torres', name: 'TORRES DEL VIENTO', theme: 'torres', desc: 'Pilares de piedra para saltar de pared y engancharse. El viento cambia de lado.',
    w: 80, h: 50, water: 3, lava: false, pads: [], hz: { wind: { every: 15, warn: 2, dur: 5, a: 11 } },
    spawns: [[14.5, 24], [65.5, 24], [30.5, 30], [49.5, 30], [40, 11], [40, 20], [22, 17], [58, 17]],
    build(T, r) {
      for (const [x, top] of [[14.5, 22], [30.5, 28], [49.5, 28], [65.5, 22]]) {
        rect(T, x - 1.25, 0, x + 1.25, top, ROCK);
        rect(T, x - 3.5, top, x + 3.5, top + 1.25, DIRT);
      }
      rect(T, 12.5, 14, 16.5, 15, DIRT); rect(T, 63.5, 14, 67.5, 15, DIRT); // repisas a media altura
      rect(T, 28, 19, 33, 20, DIRT); rect(T, 47, 19, 52, 20, DIRT);
      island(T, r, 40, 9.5, 14, 4);
      ledge(T, 22, 16, 4.5); ledge(T, 58, 16, 4.5);
      ledge(T, 40, 19, 5); ledge(T, 40, 33, 5);
    },
  },
  {
    id: 'volcan', name: 'VOLCÁN', theme: 'volcan', desc: 'Una montaña sobre la lava. Cada tanto llueven rocas encendidas (mirá las marcas).',
    w: 80, h: 48, water: 3, lava: true, pads: [], hz: { rocks: { every: 9, warn: 1.6, n: 3 } },
    spawns: [[40, 21], [26, 16], [54, 16], [8, 14], [72, 14], [33, 19], [47, 19], [40, 30]],
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
];

export const mapById = (id: string) => MAPS.find(m => m.id === id) ?? MAPS[0];

// Terreno del mapa para una semilla (la misma en el anfitrión y en los invitados)
export function buildMap(m: MapDef, seed: number): Terr {
  const T = newTerr(Math.round(m.w / CELL), Math.round(m.h / CELL));
  m.build(T, { rng: seed ^ 0x5bd1e995 });
  return T;
}
