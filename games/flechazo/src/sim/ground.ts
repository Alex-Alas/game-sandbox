// El piso en el mundo (puro). Sin islas, un rectángulo con MARGIN celdas de piso alrededor del rompecabezas. Con islas, un
// piso por isla, todos iguales y con el mismo margen (ISLE_M) de los cuatro lados, así el mapa y el mundo son simétricos;
// además los huecos del medio y los portales. Para la colisión y la navegación, el vacío entre islas y los huecos son cajas infranqueables (`top` infinito):
// no se cae ni se salta por encima; a otra isla se pasa pisando un portal.
import { C, MARGIN } from './const.ts';
import { cx, cy, type Board } from './puzzle.ts';
import type { Box, Lim } from './body.ts';

export const ISLE_M = 0.75; // celdas de piso alrededor de cada isla, más allá de la media celda (con GAP = 3 quedan 1,5 de vacío)
export const HOLE_IN = 0.1; // cuánto entra el piso en las celdas de un hueco
export const PAD_R = 0.8;   // radio del portal (m)
export const VOID = -2;     // id de las cajas del vacío
export type Floor = Lim & { r: number }; // r: radio de las esquinas
export type PadW = { x: number, z: number, to: number, isle: number };
export type Ground = { lim: Lim, floors: Floor[], holes: Lim[], voids: Box[], pads: PadW[] };

export function groundOf(b: Board, ox: number, oz: number): Ground {
  const isles = b.isles ?? [[0, 0, b.w - 1, b.h - 1]], many = isles.length > 1, m = (many ? ISLE_M : MARGIN) + 0.5, r = C * (many ? 0.6 : 0.75);
  const floors: Floor[] = isles.map(([x0, y0, x1, y1]) => ({ x0: ox + (x0 - m) * C, z0: oz + (y0 - m) * C, x1: ox + (x1 + m) * C, z1: oz + (y1 + m) * C, r }));
  const lim = { x0: Math.min(...floors.map(f => f.x0)), z0: Math.min(...floors.map(f => f.z0)), x1: Math.max(...floors.map(f => f.x1)), z1: Math.max(...floors.map(f => f.z1)) };
  const holes = (b.holes ?? []).map(([x0, y0, x1, y1]) => ({
    x0: ox + (x0 - 0.5 + HOLE_IN) * C, z0: oz + (y0 - 0.5 + HOLE_IN) * C, x1: ox + (x1 + 0.5 - HOLE_IN) * C, z1: oz + (y1 + 0.5 - HOLE_IN) * C,
  }));
  // el vacío entre islas: las franjas sin piso (las islas forman una grilla alineada), de lado a lado del tablero
  const gaps = (iv: [number, number][]) => {
    iv.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    let end = iv[0][1];
    for (const [a, e] of iv) { if (a > end + 1e-6) out.push([end, a]); end = Math.max(end, e); }
    return out;
  };
  const voids: Box[] = [
    ...gaps(floors.map(f => [f.x0, f.x1])).map(([a, e]) => ({ x0: a, x1: e, z0: lim.z0, z1: lim.z1, top: Infinity, id: VOID })),
    ...gaps(floors.map(f => [f.z0, f.z1])).map(([a, e]) => ({ x0: lim.x0, x1: lim.x1, z0: a, z1: e, top: Infinity, id: VOID })),
    ...holes.map(h => ({ ...h, top: Infinity, id: VOID })),
  ];
  const pads = (b.pads ?? []).map(p => ({ x: ox + cx(b, p.cell) * C, z: oz + cy(b, p.cell) * C, to: p.to, isle: p.isle }));
  return { lim, floors, holes, voids, pads };
}

// Isla del piso en (x, z) (−1 = afuera)
export const isleAt = (g: Ground, x: number, z: number) => g.floors.findIndex(f => x >= f.x0 - 0.05 && x <= f.x1 + 0.05 && z >= f.z0 - 0.05 && z <= f.z1 + 0.05);

// Las esquinas del piso son redondas: un cuerpo de media anchura R que se pasa del arco vuelve a él
export function roundCorner(g: Ground, x: number, z: number, R: number): [number, number] {
  const f = g.floors[isleAt(g, x, z)];
  if (!f) return [x, z];
  const r = f.r - R;
  const cxp = x < f.x0 + f.r ? f.x0 + f.r : x > f.x1 - f.r ? f.x1 - f.r : NaN;
  const czp = z < f.z0 + f.r ? f.z0 + f.r : z > f.z1 - f.r ? f.z1 - f.r : NaN;
  if (isNaN(cxp) || isNaN(czp)) return [x, z];
  const dx = x - cxp, dz = z - czp, d = Math.hypot(dx, dz);
  return d > r ? [cxp + (dx / d) * r, czp + (dz / d) * r] : [x, z];
}

// Islas por las que hay que pasar para ir de una a otra (portales: la lista de islas, sin la de partida)
export function islePath(g: Ground, from: number, to: number): number[] | null {
  if (from === to) return [];
  const prev = new Map<number, number>([[from, from]]), q = [from];
  for (let h = 0; h < q.length; h++) {
    const a = q[h];
    for (const p of g.pads) {
      if (p.isle !== a) continue;
      const b = g.pads[p.to].isle;
      if (prev.has(b)) continue;
      prev.set(b, a), q.push(b);
      if (b === to) {
        const out = [b];
        for (let k = a; k !== from; k = prev.get(k)!) out.unshift(k);
        return out;
      }
    }
  }
  return null;
}
