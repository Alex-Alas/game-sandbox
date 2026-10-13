// Íconos de 24 × 24 por código (GDD §13.3, el set de íconos de la referencia 8): cada ícono es una pila de formas
// con un material (la rampa de cinco tonos de palette.ts). El sombreado es automático y en píxel, con la luz
// arriba a la izquierda: el píxel cuyo vecino hacia la luz queda afuera de su forma toma el brillo H; el que tiene
// afuera al vecino del lado opuesto, la sombra S (y a dos píxeles, la oclusión D); al final, el contorno de 1 px en
// tinta (con *selout*: del lado de la luz, el tono oscuro del material en vez de la tinta).
import { MAT, EMIT, INK, type Ramp } from '../render/palette.ts';

type Shape =
  | { k: 'circ', x: number, y: number, r: number }
  | { k: 'ell', x: number, y: number, rx: number, ry: number }
  | { k: 'rect', x: number, y: number, w: number, h: number }
  | { k: 'poly', p: number[][] }
  | { k: 'line', x0: number, y0: number, x1: number, y1: number, w: number }
  | { k: 'ring', x: number, y: number, r: number, t: number };
type Layer = { s: Shape[], m: Ramp, glow?: boolean, cut?: Shape[], flatShade?: boolean };

const glowRamp = (k: keyof typeof EMIT): Ramp => ({ base: EMIT[k][1], S: EMIT[k][2], D: EMIT[k][2], R: EMIT[k][0], H: EMIT[k][0] });

function inside(s: Shape, x: number, y: number): boolean {
  const px = x + 0.5, py = y + 0.5;
  switch (s.k) {
    case 'circ': return (px - s.x) ** 2 + (py - s.y) ** 2 <= s.r * s.r;
    case 'ell': return ((px - s.x) / s.rx) ** 2 + ((py - s.y) / s.ry) ** 2 <= 1;
    case 'rect': return px >= s.x && px < s.x + s.w && py >= s.y && py < s.y + s.h;
    case 'ring': { const d = Math.hypot(px - s.x, py - s.y); return d <= s.r && d >= s.r - s.t; }
    case 'line': {
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / l2));
      return Math.hypot(px - (s.x0 + dx * t), py - (s.y0 + dy * t)) <= s.w / 2;
    }
    case 'poly': {
      let c = false;
      for (let i = 0, j = s.p.length - 1; i < s.p.length; j = i++) {
        const a = s.p[i], b = s.p[j];
        if ((a[1] > py) !== (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
      }
      return c;
    }
  }
}

export function renderIcon(layers: Layer[], N = 24): string[] {
  const out: string[] = new Array(N * N).fill('');
  const dark: string[] = new Array(N * N).fill(INK);
  for (const L of layers) {
    const m = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && L.s.some((s) => inside(s, x, y)) && !(L.cut ?? []).some((s) => inside(s, x, y));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!m(x, y)) continue;
      let c = L.m.base;
      if (!L.flatShade) {
        if (!m(x + 1, y + 1) && !m(x + 1, y)) c = L.m.D;
        else if (!m(x + 1, y + 1) || !m(x + 2, y + 2)) c = L.m.S;
        if (!m(x - 1, y - 1) && (!m(x - 1, y) || !m(x, y - 1))) c = L.m.H;
      }
      out[y * N + x] = c;
      dark[y * N + x] = L.glow ? INK : L.m.D;
    }
  }
  // contorno: tinta, con selout del lado de la luz
  const res = out.slice();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (out[y * N + x]) continue;
    const at = (dx: number, dy: number) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < N && Y < N ? Y * N + X : -1; };
    const nb = [at(1, 0), at(0, 1), at(-1, 0), at(0, -1)].map((i) => (i >= 0 && out[i] ? i : -1));
    if (!nb.some((i) => i >= 0)) continue;
    // selout: si la forma queda abajo/derecha (este píxel mira a la luz), el contorno toma su tono oscuro
    const lit = (nb[0] >= 0 || nb[1] >= 0) && nb[2] < 0 && nb[3] < 0;
    res[y * N + x] = lit ? dark[nb[0] >= 0 ? nb[0] : nb[1]] : INK;
  }
  return res;
}

const M = MAT;
const C = (x: number, y: number, r: number): Shape => ({ k: 'circ', x, y, r });
const E = (x: number, y: number, rx: number, ry: number): Shape => ({ k: 'ell', x, y, rx, ry });
const Rr = (x: number, y: number, w: number, h: number): Shape => ({ k: 'rect', x, y, w, h });
const P = (...p: number[][]): Shape => ({ k: 'poly', p });
const Ln = (x0: number, y0: number, x1: number, y1: number, w: number): Shape => ({ k: 'line', x0, y0, x1, y1, w });
const Rg = (x: number, y: number, r: number, t: number): Shape => ({ k: 'ring', x, y, r, t });
const red: Ramp = { base: EMIT.peligro[1], S: EMIT.peligro[2], D: EMIT.peligro[2], R: EMIT.peligro[0], H: EMIT.peligro[0] };
const gear = (cx: number, cy: number, r: number, n: number): Shape[] => {
  const s: Shape[] = [C(cx, cy, r)];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; s.push(Ln(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, cx + Math.cos(a) * (r + 1.6), cy + Math.sin(a) * (r + 1.6), 2.6)); }
  return s;
};
const scroll = (k: keyof typeof EMIT, glyph: Shape[]): Layer[] => [
  { s: [Rr(5, 5, 14, 15)], m: M.parch },
  { s: [E(5.5, 5.5, 2.5, 2.5), E(5.5, 19.5, 2.5, 2.5), Rr(3, 5, 5, 15)], m: M.leather },
  { s: [E(18.5, 5.5, 2.5, 2.5), E(18.5, 19.5, 2.5, 2.5), Rr(16, 5, 5, 15)], m: M.leather },
  { s: glyph, m: glowRamp(k), flatShade: true },
  { s: [C(15.5, 19, 3.2)], m: glowRamp(k) },
];

export const ICON_DEFS: Record<string, { name: string, layers: Layer[] }> = {
  mina: { name: 'Mina de grisú', layers: [
    { s: [E(12, 16, 8, 4.5)], m: M.iron },
    { s: [E(12, 13.5, 6, 3.5)], m: M.brass },
    { s: [Rr(11, 7, 2, 6)], m: M.copper },
    { s: [C(12, 6.5, 2)], m: glowRamp('grisu') },
    { s: [C(6.5, 16, 1), C(17.5, 16, 1), C(12, 18.5, 1)], m: red, flatShade: true },
  ] },
  dron: { name: 'Dron-colibrí', layers: [
    { s: [E(6, 8, 5, 2), E(18, 8, 5, 2)], m: M.glass },
    { s: [E(12, 13, 5, 4)], m: M.brass },
    { s: [P([16, 12], [22, 14], [16, 15])], m: M.iron },
    { s: [Ln(8, 15, 4, 20, 2), Ln(16, 16, 15, 21, 1.5)], m: M.copper },
    { s: [C(13.5, 12, 1.4)], m: glowRamp('arcanita') },
  ] },
  caldera: { name: 'Caldera de bolsillo', layers: [
    { s: [Rr(6, 8, 12, 12), E(12, 8, 6, 2.5)], m: M.copper },
    { s: [Rr(6, 12, 12, 2), Rr(6, 17, 12, 2)], m: M.brass },
    { s: [Rr(10, 3, 4, 4)], m: M.brass },
    { s: [Ln(16, 6, 20, 3, 2)], m: M.iron },
    { s: [C(12, 15.5, 2)], m: glowRamp('piro') },
  ] },
  botas: { name: 'Botas de muelle', layers: [
    { s: [P([6, 3], [13, 3], [13, 14], [19, 15], [19, 18], [6, 18])], m: M.leather },
    { s: [Rr(6, 7, 7, 2)], m: M.brass },
    { s: [Ln(7, 19.5, 18, 19.5, 1.2), Ln(8, 21.5, 17, 21.5, 1.2)], m: M.steel, flatShade: true },
    { s: [Rr(5, 22, 15, 2)], m: M.iron },
  ] },
  gancho: { name: 'Gancho de recambio', layers: [
    { s: [Rg(13, 15, 6, 2.6)], cut: [Rr(13, 9, 8, 6)], m: M.iron },
    { s: [P([18, 13], [22, 11], [20, 16])], m: M.steel },
    { s: [Rr(11.5, 3, 3, 7)], m: M.brass },
    { s: [Rg(13, 3.5, 2.5, 1.2)], m: M.iron },
  ] },
  brujula: { name: 'Brújula de vetas', layers: [
    { s: [C(12, 13, 8)], m: M.brass },
    { s: [C(12, 13, 6)], m: M.parch },
    { s: [P([12, 7], [13.5, 13], [10.5, 13])], m: glowRamp('arcanita'), flatShade: true },
    { s: [P([12, 19], [13.5, 13], [10.5, 13])], m: M.iron, flatShade: true },
    { s: [Rr(10.5, 3, 3, 3)], m: M.brass },
  ] },
  tornillo: { name: 'Tornillo', layers: [
    { s: [E(12, 14, 6, 6)], m: M.brass },
    { s: [Rr(9, 6, 6, 3)], m: M.iron },
    { s: [Ln(8, 19, 6, 22, 1.6), Ln(16, 19, 18, 22, 1.6)], m: M.iron },
    { s: [C(10, 13, 1.4), C(14, 13, 1.4)], m: glowRamp('arcanita'), flatShade: true },
  ] },
  monoculo: { name: 'Monóculo del augur', layers: [
    { s: [Rg(11, 11, 7, 2)], m: M.brass },
    { s: [C(11, 11, 5)], m: glowRamp('arcanita') },
    { s: [Ln(16, 16, 21, 22, 1.2)], m: M.brass, flatShade: true },
    { s: [Rr(8, 8, 2, 2)], m: { base: '#ffffff', S: '#ffffff', D: '#ffffff', R: '#ffffff', H: '#ffffff' }, flatShade: true },
  ] },
  guante: { name: 'Guante de la avaricia', layers: [
    { s: [P([6, 21], [6, 10], [8, 5], [10, 10], [11, 4], [13, 10], [14, 4], [16, 10], [17, 6], [19, 11], [18, 21])], m: M.leather },
    { s: [Rr(5, 18, 14, 4)], m: M.brass },
    { s: [C(12, 14, 2.4)], m: glowRamp('piro') },
  ] },
  corazon: { name: 'Corazón de engranaje', layers: [
    { s: gear(12, 13, 6.5, 8), m: M.brass },
    { s: [P([12, 19], [7, 13], [8, 9], [12, 11], [16, 9], [17, 13])], m: red },
    { s: [C(12, 13, 1.5)], m: M.iron },
  ] },
  reloj: { name: 'Reloj parado', layers: [
    { s: [C(12, 13, 8)], m: M.brass },
    { s: [C(12, 13, 6)], m: M.parch },
    { s: [Ln(12, 13, 12, 8, 1.4), Ln(12, 13, 15, 15, 1.4)], m: { base: INK, S: INK, D: INK, R: INK, H: INK }, flatShade: true },
    { s: [Rr(10.5, 2, 3, 3)], m: M.brass },
    { s: [Ln(5, 6, 19, 20, 1)], m: glowRamp('crono'), flatShade: true },
  ] },
  vela: { name: 'Vela de cera negra', layers: [
    { s: [Rr(9, 9, 6, 12)], m: M.coal },
    { s: [E(12, 21, 7, 2)], m: M.brass },
    { s: [P([12, 2], [14.5, 7], [12, 9], [9.5, 7])], m: glowRamp('crono') },
    { s: [Rr(11, 12, 2, 4)], m: M.shadow, flatShade: true },
  ] },
  pluma: { name: 'Pluma mecánica', layers: [
    { s: [P([18, 3], [21, 6], [9, 18], [6, 15])], m: M.parch },
    { s: [Ln(6, 18, 3, 21, 1.6)], m: M.brass },
    { s: [C(14, 10, 2)], m: M.brass },
    { s: [Ln(17, 5, 9, 13, 0.9)], m: M.iron, flatShade: true },
  ] },
  laton: { name: 'Latón', layers: [
    { s: [E(12, 13, 8, 8)], m: M.brass },
    { s: gear(12, 13, 4, 6), m: M.brass },
    { s: [C(12, 13, 1.6)], m: M.iron },
  ] },
  arcanita: { name: 'Arcanita', layers: [
    { s: [P([12, 2], [17, 9], [15, 21], [9, 21], [7, 9])], m: { base: '#3bded3', S: '#1d8a8a', D: '#1d4a5a', R: '#b8fff6', H: '#b8fff6' } },
    { s: [P([12, 2], [12, 21], [9, 21], [7, 9])], m: { base: '#b8fff6', S: '#3bded3', D: '#1d8a8a', R: '#b8fff6', H: '#ffffff' }, flatShade: true },
    { s: [P([5, 14], [8, 17], [7, 21], [3, 21])], m: { base: '#3bded3', S: '#1d8a8a', D: '#1d4a5a', R: '#b8fff6', H: '#b8fff6' } },
  ] },
  piro: { name: 'Pergamino de Piromancia', layers: scroll('piro', [P([12, 7], [14.5, 12], [12.5, 16], [9.5, 13])]) },
  electro: { name: 'Pergamino de Electromancia', layers: scroll('electro', [P([13, 6], [9, 12], [12, 12], [10, 17], [15, 10], [12, 10])]) },
  alquimia: { name: 'Pergamino de Alquimia', layers: scroll('alquimia', [C(12, 13.5, 2.6), Rr(11, 7, 2, 4)]) },
  crono: { name: 'Pergamino de Cronomancia', layers: scroll('crono', [P([9, 7], [15, 7], [12, 11.5]), P([9, 16], [15, 16], [12, 11.5])]) },
};

const cache = new Map<string, string[]>();
export function iconPixels(id: string) {
  if (!cache.has(id)) cache.set(id, renderIcon(ICON_DEFS[id].layers));
  return cache.get(id)!;
}
