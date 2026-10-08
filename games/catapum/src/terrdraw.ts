// Dibujo del terreno en un lienzo aparte (PPC px por celda), redibujando solo los rectángulos que cambiaron.
// Tres pasadas por región: contorno (celdas un poco más grandes en color oscuro), relleno con variación por celda y
// esquinas a 45° (las celdas vacías con dos vecinos sólidos en ángulo se rellenan en diagonal, y las sólidas con dos
// lados al aire pierden la esquina), y el pasto arriba de la tierra expuesta.
import { CELL, AIR, DIRT, ROCK, WOOD, type Terr } from './sim/terrain.ts';
import type { Theme } from './themes.ts';

export type TerrCanvas = { cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D, ppc: number, T: Terr, th: Theme, fall: number[] };

export function newTerrCanvas(T: Terr, th: Theme, ppc: number): TerrCanvas {
  const cv = document.createElement('canvas');
  cv.width = T.cols * ppc, cv.height = T.rows * ppc;
  const tc: TerrCanvas = { cv, ctx: cv.getContext('2d')!, ppc, T, th, fall: [] };
  T.dirty = [[0, 0, T.cols - 1, T.rows - 1]];
  flush(tc);
  return tc;
}

const hash = (i: number, j: number) => ((i * 73856093) ^ (j * 19349663)) >>> 0;

// Redibuja lo marcado como sucio (y lo consume)
export function flush(tc: TerrCanvas) {
  const T = tc.T;
  if (!T.dirty.length) return;
  // juntar rectángulos que se tocan para no redibujar de más
  const rs = T.dirty.splice(0);
  for (const r of rs) region(tc, r[0], r[1], r[2], r[3]);
}

function region(tc: TerrCanvas, i0: number, j0: number, i1: number, j1: number) {
  const { ctx, ppc, T, th } = tc, R = T.rows;
  i0 = Math.max(0, i0 - 1), j0 = Math.max(0, j0 - 1), i1 = Math.min(T.cols - 1, i1 + 1), j1 = Math.min(R - 1, j1 + 1);
  const g = (i: number, j: number) => i < 0 || j < 0 || i >= T.cols || j >= R ? AIR : T.g[j * T.cols + i];
  const X = (i: number) => i * ppc, Y = (j: number) => (R - 1 - j) * ppc; // fila j → y del lienzo (arriba de la celda)
  ctx.save();
  ctx.beginPath();
  ctx.rect(X(i0), Y(j1), (i1 - i0 + 1) * ppc, (j1 - j0 + 1) * ppc);
  ctx.clip();
  ctx.clearRect(X(i0), Y(j1), (i1 - i0 + 1) * ppc, (j1 - j0 + 1) * ppc);
  const a0 = Math.max(0, i0 - 2), a1 = Math.min(T.cols - 1, i1 + 2), b0 = Math.max(0, j0 - 2), b1 = Math.min(R - 1, j1 + 2);
  const o = Math.max(1, ppc * 0.3);
  // Forma de una celda con sus esquinas recortadas o rellenas a 45°: lista de polígonos
  const fill = (p: Path2D) => ctx.fill(p);
  const shape = (i: number, j: number, grow: number) => {
    const x = X(i), y = Y(j), m = g(i, j);
    if (m !== AIR) {
      const up = g(i, j + 1) === AIR, dn = g(i, j - 1) === AIR, lf = g(i - 1, j) === AIR, rt = g(i + 1, j) === AIR;
      const p = new Path2D(), e = grow;
      // esquinas: (x0,y0) arriba-izq, (x1,y0) arriba-der, (x1,y1) abajo-der, (x0,y1) abajo-izq
      const x0 = x - e, y0 = y - e, x1 = x + ppc + e, y1 = y + ppc + e;
      const cut = m !== WOOD;
      const ul = cut && up && lf, ur = cut && up && rt, dr = cut && dn && rt, dl = cut && dn && lf;
      if (!(ul || ur || dr || dl)) { ctx.fillRect(x0, y0, x1 - x0, y1 - y0); return; }
      p.moveTo(ul ? x0 + ppc / 2 : x0, y0);
      p.lineTo(ur ? x1 - ppc / 2 : x1, y0);
      if (ur) p.lineTo(x1, y0 + ppc / 2);
      p.lineTo(x1, dr ? y1 - ppc / 2 : y1);
      if (dr) p.lineTo(x1 - ppc / 2, y1);
      p.lineTo(dl ? x0 + ppc / 2 : x0, y1);
      if (dl) p.lineTo(x0, y1 - ppc / 2);
      p.lineTo(x0, ul ? y0 + ppc / 2 : y0);
      p.closePath();
      fill(p);
    } else { // celda vacía en un rincón: triángulo hacia los dos vecinos sólidos
      const up = g(i, j + 1), dn = g(i, j - 1), lf = g(i - 1, j), rt = g(i + 1, j);
      const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        const p = new Path2D();
        p.moveTo(ax, ay), p.lineTo(bx, by), p.lineTo(cx, cy), p.closePath();
        fill(p);
      };
      const ok = (v: number) => v !== AIR && v !== WOOD;
      const x1 = x + ppc, y1 = y + ppc;
      if (ok(dn) && ok(lf) && up === AIR && rt === AIR) tri(x - grow, y - grow * 0.4, x - grow, y1 + grow, x1 + grow * 0.4, y1 + grow);
      if (ok(dn) && ok(rt) && up === AIR && lf === AIR) tri(x1 + grow, y - grow * 0.4, x1 + grow, y1 + grow, x - grow * 0.4, y1 + grow);
      if (ok(up) && ok(lf) && dn === AIR && rt === AIR) tri(x - grow, y1 + grow * 0.4, x - grow, y - grow, x1 + grow * 0.4, y - grow);
      if (ok(up) && ok(rt) && dn === AIR && lf === AIR) tri(x1 + grow, y1 + grow * 0.4, x1 + grow, y - grow, x - grow * 0.4, y - grow);
    }
  };
  // 1) contorno
  ctx.fillStyle = th.line;
  for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
    const m = g(i, j);
    const edge = m !== AIR ? (g(i + 1, j) === AIR || g(i - 1, j) === AIR || g(i, j + 1) === AIR || g(i, j - 1) === AIR) : true;
    if (edge) shape(i, j, o);
  }
  // 2) relleno
  for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
    const m = g(i, j), h = hash(i, j);
    let col: string;
    if (m === AIR) {
      const nb = [g(i, j - 1), g(i - 1, j), g(i + 1, j), g(i, j + 1)].find(v => v !== AIR && v !== WOOD);
      if (!nb) continue;
      col = pal(th, nb, h);
    } else col = pal(th, m, h);
    ctx.fillStyle = col;
    shape(i, j, 0);
  }
  // 3) detalles: pasto sobre la tierra al aire, vetas en la madera, grietas en la piedra
  for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
    const m = g(i, j), h = hash(i, j), x = X(i), y = Y(j);
    if (m === DIRT && g(i, j + 1) === AIR) {
      ctx.fillStyle = th.top;
      const lf = g(i - 1, j) === AIR && g(i - 1, j + 1) === AIR, rt = g(i + 1, j) === AIR;
      ctx.fillRect(x + (lf ? ppc * 0.45 : 0), y, ppc - (lf ? ppc * 0.45 : 0) - (rt ? ppc * 0.45 : 0), ppc * 0.55);
      if (h % 5 === 0) { ctx.fillRect(x + ppc * 0.3, y - ppc * 0.35, ppc * 0.18, ppc * 0.4); }
    } else if (m === WOOD) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      if ((i + j) % 4 === 0) ctx.fillRect(x, y, Math.max(1, ppc * 0.12), ppc);
      if (j % 3 === 0) ctx.fillRect(x, y + ppc - 1, ppc, 1);
    } else if (m === ROCK && h % 11 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + ppc * 0.2, y + ppc * 0.4, ppc * 0.6, Math.max(1, ppc * 0.12));
    } else if (m === DIRT && h % 23 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath(); ctx.arc(x + ppc / 2, y + ppc / 2, ppc * 0.25, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

function pal(th: Theme, m: number, h: number) {
  const a = m === ROCK ? th.rock : m === WOOD ? th.wood : th.dirt;
  return a[h % a.length];
}

// Coordenadas: el lienzo del terreno cubre [0, cols·CELL] × [0, rows·CELL] en metros
export const terrWorldW = (T: Terr) => T.cols * CELL;
export const terrWorldH = (T: Terr) => T.rows * CELL;
export { DIRT };
