// El patio gris de F1 (plan, paso 1.2): tres zonas en una sola grilla, para calibrar las mecánicas en los tres tipos de
// piso. PASILLO de 200 m (se corre solo; fosos, ruta alta y baja, túnel, vigas para la liga), POZO de 120 m (se cae
// solo; salientes alternadas, válvulas y una torreta) y SALA de 28 × 14 m (caminata asistida; dummies de los tres
// pesos, dos atacantes y una torreta). AJUSTES → PATIO salta de una a otra.
import { DEFAULTS, type Cfg } from './params.ts';
import { CELL, ROCK, METAL, type World, type Zone, type Spawn } from './state.ts';

export const FLOOR = 10;            // alto del piso del PASILLO y de la SALA
export const PIT_Y = 3;             // por debajo de esto, en el PASILLO, caíste a un foso

export function buildPatio(c: Cfg = DEFAULTS): World {
  const cols = Math.round(310 / CELL), rows = Math.round(136 / CELL);
  const g = new Uint8Array(cols * rows);
  const rect = (x0: number, y0: number, x1: number, y1: number, v = ROCK) => {
    for (let j = Math.max(0, Math.round(y0 / CELL)); j < Math.min(rows, Math.round(y1 / CELL)); j++)
      for (let i = Math.max(0, Math.round(x0 / CELL)); i < Math.min(cols, Math.round(x1 / CELL)); i++) g[j * cols + i] = v;
  };
  const clear = (x0: number, y0: number, x1: number, y1: number) => rect(x0, y0, x1, y1, 0);
  const dummies: Spawn[] = [];
  const F = FLOOR;

  // ---------- PASILLO (x 0–210) ----------
  rect(0, 6, 210, F);                       // el piso
  rect(-2, 6, 0.5, 30);                     // pared del principio
  rect(0, 26, 210, 28);                     // techo alto
  clear(24, 0, 28, F);                      // foso 1: 4 m (salto)
  rect(34, F, 40, F + 1.5);                 // escalón
  rect(44, F + 3.5, 50, F + 4);             // ruta alta: plataformas finas
  rect(54, F + 4, 60, F + 4.5);
  rect(64, F + 3.5, 70, F + 4);
  clear(52, 0, 60, F);                      // foso 2: 8 m (doble salto, dash o la ruta alta)
  dummies.push({ x: 16, y: F, kind: 'liviano' }, { x: 67, y: F + 4, kind: 'liviano' }, { x: 74, y: F, kind: 'mediano' });
  dummies.push({ x: 84, y: F, kind: 'atacante', face: -1 });
  clear(90, 0, 98, F);                      // foso 3 con una válvula en el medio (pogo) y una viga arriba (liga)
  dummies.push({ x: 94, y: F + 2.2, kind: 'valvula' });
  rect(92, F + 9, 96, F + 9.5, METAL);
  rect(108, F, 110, F + 3);                 // pilar con la torreta
  dummies.push({ x: 109, y: F + 3, kind: 'torreta', face: -1 });
  rect(120, F + 3.2, 136, 26);              // túnel bajo (3,2 m)
  dummies.push({ x: 128, y: F, kind: 'liviano' });
  dummies.push({ x: 146, y: F, kind: 'pesado' });
  clear(156, 0, 172, F);                    // foso largo de 16 m con vigas para la liga y una saliente al medio
  for (const x of [158, 164, 170]) rect(x - 1, F + 8, x + 1, F + 8.5, METAL);
  rect(162.5, F - 0.5, 165.5, F);
  dummies.push({ x: 164, y: F + 0, kind: 'liviano' });
  rect(180, F, 186, F + 2);                 // escalera de bloques
  rect(186, F, 192, F + 4);
  rect(192, F + 4, 198, F + 4.5);
  dummies.push({ x: 189, y: F + 4, kind: 'mediano' }, { x: 196, y: F + 4.5, kind: 'valvula' });

  // ---------- POZO (x 226–248, de y 132 a 10) ----------
  const P0 = 230, P1 = 244, TOP = 130;
  rect(P0 - 4, 6, P0, TOP + 4);             // paredes
  rect(P1, 6, P1 + 4, TOP + 4);
  rect(P0, 6, P1, F);                       // el fondo
  rect(P0, TOP + 2, P1, TOP + 4);           // tapa (para que la liga tenga algo arriba)
  const ledges: [number, number, number][] = [   // y, lado (−1 izq., 1 der.), largo
    [118, -1, 4], [106, 1, 5], [96, -1, 3], [86, 1, 4], [74, -1, 5], [62, 1, 3], [50, -1, 4], [38, 1, 5], [26, -1, 3],
  ];
  for (const [y, side, L] of ledges) {
    if (side < 0) rect(P0, y - 0.5, P0 + L, y, METAL); else rect(P1 - L, y - 0.5, P1, y, METAL);
  }
  dummies.push({ x: P0 + 2, y: 118, kind: 'liviano' }, { x: P1 - 2.5, y: 106, kind: 'mediano' });
  dummies.push({ x: 238.5, y: 100, kind: 'valvula' }, { x: 235, y: 92, kind: 'valvula' }, { x: 239, y: 84, kind: 'valvula' });
  dummies.push({ x: P0 + 1.5, y: 74, kind: 'torreta', face: 1 });
  dummies.push({ x: P1 - 1.5, y: 62, kind: 'liviano' }, { x: P0 + 2, y: 50, kind: 'atacante', face: 1 });
  dummies.push({ x: 237, y: 44, kind: 'valvula' }, { x: 237, y: 32, kind: 'valvula' }, { x: P1 - 2.5, y: 38, kind: 'liviano' });
  dummies.push({ x: 237, y: F, kind: 'mediano' });

  // ---------- SALA (x 268–300, 28 × 14 m) ----------
  const S0 = 270, S1 = 298;
  rect(S0 - 4, 6, S0, F + 18);              // paredes
  rect(S1, 6, S1 + 4, F + 18);
  rect(S0, 6, S1, F);                       // piso
  rect(S0, F + 14, S1, F + 16);             // techo
  rect(S0 + 3, F + 4, S0 + 8, F + 4.5);     // plataformas
  rect(S1 - 8, F + 4, S1 - 3, F + 4.5);
  rect(S0 + 11.5, F + 7.5, S1 - 11.5, F + 8, METAL);
  dummies.push({ x: S0 + 5.5, y: F, kind: 'liviano' }, { x: S0 + 9, y: F, kind: 'mediano' }, { x: S1 - 6, y: F, kind: 'pesado' });
  dummies.push({ x: S0 + 18, y: F, kind: 'atacante', face: -1 }, { x: S1 - 5.5, y: F + 4.5, kind: 'atacante', face: -1 });
  dummies.push({ x: S0 + 14, y: F + 8, kind: 'torreta', face: -1 }, { x: S0 + 5.5, y: F + 4.5, kind: 'liviano' });

  const zones: Zone[] = [
    { id: 'pasillo', x0: 0, y0: F - 4, x1: 210, y1: 26, spawn: [4, F] },
    { id: 'pozo', x0: P0, y0: F, x1: P1, y1: TOP + 2, spawn: [237, 127] },
    { id: 'sala', x0: S0, y0: F, x1: S1, y1: F + 14, spawn: [S0 + 14, F] },
  ];
  return { cols, rows, g, zones, dummies, c };
}
