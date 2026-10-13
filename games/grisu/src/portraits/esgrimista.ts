// Retrato de DON VÁLVULA (el Esgrimista), a lo EV Ganin (referencia 17): entintado pesado, gris verdoso y un solo
// color vivo (el brillo de la escuela en el monóculo). Busto de tres cuartos mirando a la izquierda, la chistera
// ladeada tapa la cara (solo se lee el mentón, el bigote y el monóculo) y el sable de pistón cruza en diagonal.
import { type V, spline, taper, brush } from './curves.ts';
import { type Part, stroke } from './ink.ts';
import { MAT, EMIT } from '../render/palette.ts';
import { card } from './card.ts';

const S = (pts: V[], sharp?: number[], per = 7) => spline(pts, true, per, pts.map((_, i) => sharp?.includes(i)));
const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0, n = 40): V[] => {
  const o: V[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; o.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
  return o;
};
// gira un punto alrededor de un pivote
const rot = (p: V, c: V, a: number): V => { const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]; };

export function drawEsgrimista(cv: HTMLCanvasElement, school = EMIT.arcanita) {
  const m = MAT, coat = m.coat, P: Part[] = [];
  const mat = (r: { base: string, S: string, D: string, R: string, H: string }, extra: Partial<Part> = {}): Omit<Part, 'pts' | 'z'> =>
    ({ fill: r.base, shade: r.S, shadeW: 2.2, deep: r.D, deepW: 4.5, rim: r.R, rimW: 0.6, hl: r.H, hlW: 0.5, line: 0.25, ...extra });

  // ---------- el sable (detrás del hombro: la hoja sube a la derecha) ----------
  const bladeA: V = [71, 92], bladeB: V = [95, -4];
  {
    const c: V[] = [bladeA, [80, 50], [88, 22], bladeB];
    const poly = taper(spline(c, false, 8), (t, side) => (side > 0 ? 1.5 : 0.9) * (1 - t * 0.55) + 0.2);
    P.push({ pts: poly, z: 0, ...mat(m.steel, { shadeW: 0.8, deep: undefined, hlW: 0.4, line: 0 }),
      deco: (cx) => stroke(cx, [[73, 86], [82, 48], [90, 18]], 0.4, 0.15, m.steel.R), glowDraw: (g) => { g.globalAlpha = 0.25; g.fillStyle = '#cfe6ee'; g.beginPath(); g.ellipse(84, 40, 1.2, 9, 0.36, 0, Math.PI * 2); g.fill(); } });
  }
  // ---------- la levita (hombros) ----------
  P.push({ pts: S([[0, 124], [2, 104], [10, 92], [26, 84], [40, 80], [50, 79], [62, 80], [76, 84], [88, 91], [97, 104], [100, 124]]), z: 1,
    ...mat(coat, { shadeW: 4, deepW: 9, hatch: 1.6, hatchL: 7, hatchC: 'rgba(27,20,32,0.8)' }),
    deco: (cx) => {
      // pliegues del paño
      stroke(cx, [[16, 96], [20, 108], [18, 122]], 0.2, 1.4, coat.S, 0.4);
      stroke(cx, [[84, 96], [80, 110], [83, 122]], 0.2, 1.6, coat.D, 0.4);
      stroke(cx, [[30, 100], [33, 112], [31, 122]], 0.2, 1.0, coat.S, 0.4);
    } });
  // charreteras de latón con flecos
  for (const [x, y, k] of [[17, 89, -0.25], [84, 91, 0.25]] as [number, number, number][]) {
    P.push({ pts: ell(x, y, 8.5, 3.6, k), z: 2, ...mat(m.brass, { shadeW: 1.4, deepW: 2.6, hlW: 0.6 }),
      after: (cx) => { for (let i = -3; i <= 3; i++) stroke(cx, [[x + i * 2.2, y + 2.5], [x + i * 2.4, y + 7]], 0.6, 0.3, i % 2 ? m.brass.S : m.brass.base, 0.2); } });
  }
  // chaleco y botones
  P.push({ pts: S([[44, 83], [56, 83], [55, 124], [45, 124]], [0, 1, 2, 3]), z: 2, ...mat({ base: '#3d354c', S: '#262531', D: '#1b1420', R: '#6f7894', H: '#4a4358' }),
    after: (cx) => { for (const y of [97, 105, 113]) { cx.fillStyle = m.brass.D; cx.beginPath(); cx.arc(50.3, y + 0.4, 1.3, 0, 7); cx.fill(); cx.fillStyle = m.brass.H; cx.beginPath(); cx.arc(50, y, 1.0, 0, 7); cx.fill(); } } });
  // solapas (punta en pico)
  P.push({ pts: S([[44, 82], [34, 90], [30, 95], [44, 116], [47, 92]], [0, 2, 3]), z: 3, ...mat({ base: '#2c3036', S: '#1e1f28', D: '#1b1420', R: '#6f8aa0', H: '#3e4a44' }) });
  P.push({ pts: S([[56, 82], [67, 90], [71, 95], [56, 116], [53, 92]], [0, 2, 3]), z: 3, ...mat({ base: '#2c3036', S: '#1e1f28', D: '#1b1420', R: '#6f8aa0', H: '#3e4a44' }) });
  // cuello alto
  P.push({ pts: S([[37, 66], [31, 80], [44, 86], [46, 72]], [1, 2]), z: 4, ...mat(coat) });
  P.push({ pts: S([[62, 67], [68, 80], [56, 86], [54, 72]], [1, 2]), z: 4, ...mat(coat) });
  // cuello (en sombra) y corbatín de pergamino
  P.push({ pts: S([[43, 64], [57, 64], [57, 80], [43, 80]], [0, 1, 2, 3]), z: 3.5, ...mat(m.shadow, { hatch: 1.2 }) });
  P.push({ pts: S([[44, 76], [50, 79], [56, 76], [58, 83], [51, 93], [43, 83]], [1, 3, 4, 5]), z: 5, ...mat(m.parch, { shadeW: 1.6 }),
    deco: (cx) => { stroke(cx, [[50, 80], [50.5, 86], [51, 92]], 0.3, 0.6, m.parch.S, 0.3); } });
  // un alfiler de latón con la gema de la escuela
  P.push({ pts: ell(50, 81.5, 1.8, 1.8), z: 6, fill: school[1], glow: school[1], line: 0.2 });

  // ---------- la cabeza: la sombra bajo el ala ----------
  const face = S([[37, 44], [40, 58], [44, 66], [50, 69], [56, 66], [61, 56], [62, 44]], [3]);
  P.push({ pts: face, z: 6, ...mat(m.shadow, { shadeW: 3, rim: '#5e5468', rimW: 0.9, hl: '#3d354c', hlW: 0.9, hatch: 1.1, hatchL: 5, hatchC: 'rgba(13,11,18,0.9)' }),
    deco: (cx) => {
      // el mentón y la nariz apenas tocados por la luz de abajo
      stroke(cx, [[45, 66.5], [50, 68.6], [55, 66]], 0.3, 0.9, '#4a4358', 0.5);
      stroke(cx, [[47.5, 52], [46.5, 58], [48, 59.5]], 0.25, 0.7, '#3d354c', 0.4);
    } });
  // bigote de manubrio
  P.push({ pts: S([[49, 61], [44, 62.5], [39, 61], [36, 58.5], [38.5, 62.8], [44, 64.6], [49, 63.5], [51, 63.5], [56, 64.6], [61.5, 62.4], [63.5, 58.5], [60.5, 61.2], [56, 62.5], [51, 61]], [3, 10]), z: 7,
    ...mat(m.coal, { shadeW: 0.6, deep: undefined, hlW: 0.35, line: 0 }) });
  // monóculo (anillo de latón, lente que brilla, cadenita)
  const mc: V = [43.5, 52];
  P.push({ pts: ell(mc[0], mc[1], 4.4, 4.7), z: 8, ...mat(m.brass, { shadeW: 0.9, deepW: 1.6, hlW: 0.5 }) });
  P.push({ pts: ell(mc[0] + 0.1, mc[1], 3.2, 3.5), z: 9, fill: school[1], line: 0.2, glow: school[1],
    after: (cx) => { cx.fillStyle = school[0]; cx.beginPath(); cx.ellipse(mc[0] - 0.9, mc[1] - 1.1, 1.3, 1.5, 0, 0, 7); cx.fill(); cx.fillStyle = '#ffffff'; cx.fillRect(mc[0] - 1.6, mc[1] - 2, 0.9, 0.9); } });
  P.push({ pts: taper(spline([[41, 56], [36, 66], [38, 76], [42, 86]], false, 8), () => 0.35), z: 8.5, fill: m.brass.base, line: 0, outline: false,
    after: (cx) => { for (let i = 0; i < 12; i++) { const t = i / 11, x = 41 - 5 * Math.sin(t * 3), y = 56 + t * 30; cx.fillStyle = i % 2 ? m.brass.H : m.brass.S; cx.fillRect(x - 0.4, y, 0.8, 1.1); } } });

  // ---------- la chistera (ladeada) ----------
  const pv: V = [50, 40], tilt = -0.11;
  const H = (pts: V[]) => pts.map((p) => rot(p, pv, tilt));
  const hatMat = mat({ base: '#3f3f45', S: '#262531', D: '#1b1420', R: '#8aa0b8', H: '#79706f' }, { hatch: 1.4, hatchL: 6 });
  // copa (se ensancha arriba), con la cinta
  P.push({ pts: S(H([[35.5, 41], [34.5, 26], [35.5, 6], [50, 3.5], [64.5, 5], [65.5, 25], [64.5, 41]]), [0, 2, 4, 6]), z: 10, ...hatMat,
    deco: (cx) => { stroke(cx, H([[60, 8], [61.5, 24], [61, 36]]), 0.4, 1.4, '#79706f', 0.3); stroke(cx, H([[38.5, 9], [37.5, 24]]), 0.3, 0.9, '#262531', 0.3); } });
  P.push({ pts: S(H([[35, 33], [65, 33], [65, 40.5], [35, 40.5]]), [0, 1, 2, 3]), z: 11, ...mat(m.leather) });
  // el ala: curvada hacia arriba en las puntas
  P.push({ pts: S(H([[22, 37], [30, 40.5], [50, 42.5], [70, 40.5], [78, 36], [76, 41], [66, 45.5], [50, 47], [34, 45.5], [24, 41.5]]), [0, 4]), z: 12, ...hatMat, hatch: 0 });
  // el manómetro en la cinta
  const gc = rot([58.5, 34], pv, tilt);
  P.push({ pts: ell(gc[0], gc[1], 5.4, 5.4), z: 13, ...mat(m.brass, { shadeW: 1.0, deepW: 2 }) });
  P.push({ pts: ell(gc[0], gc[1], 3.8, 3.8), z: 14, ...mat(m.parch, { shadeW: 0.7, deep: undefined }),
    after: (cx) => {
      cx.strokeStyle = '#1b1420'; cx.lineWidth = 0.35;
      for (let i = 0; i < 7; i++) { const a = Math.PI * (0.8 + i * 0.233); cx.beginPath(); cx.moveTo(gc[0] + Math.cos(a) * 2.7, gc[1] + Math.sin(a) * 2.7); cx.lineTo(gc[0] + Math.cos(a) * 3.4, gc[1] + Math.sin(a) * 3.4); cx.stroke(); }
      cx.strokeStyle = '#c92821'; cx.lineWidth = 0.55; cx.beginPath(); cx.moveTo(gc[0], gc[1]); cx.lineTo(gc[0] + 2.4, gc[1] - 1.6); cx.stroke();
      cx.fillStyle = '#1b1420'; cx.beginPath(); cx.arc(gc[0], gc[1], 0.6, 0, 7); cx.fill();
    } });
  // las gafas sobre la copa, con su correa
  P.push({ pts: taper(spline(H([[35, 25], [50, 23.5], [65, 25]]), false, 8), () => 1.3), z: 13, ...mat(m.leather, { deep: undefined }) });
  for (const x of [43, 54.5]) {
    const q = rot([x, 23.5], pv, tilt);
    P.push({ pts: ell(q[0], q[1], 4.6, 4.2), z: 14, ...mat(m.brass, { shadeW: 1, deepW: 1.8 }) });
    P.push({ pts: ell(q[0] + 0.2, q[1] + 0.2, 3.2, 2.9), z: 15, ...mat(m.glass, { shadeW: 1.3, deep: undefined }),
      after: (cx) => { cx.fillStyle = m.glass.H; cx.beginPath(); cx.ellipse(q[0] - 1.1, q[1] - 0.9, 0.9, 0.5, -0.6, 0, 7); cx.fill(); } });
  }

  // ---------- la mano y la empuñadura (adelante) ----------
  P.push({ pts: S([[68, 104], [73, 96], [80, 98], [82, 106], [78, 113], [70, 112]]), z: 16, ...mat(m.leather, { shadeW: 1.8 }),
    deco: (cx) => { for (const k of [0, 1, 2]) stroke(cx, [[72 + k * 2.6, 99 + k * 0.5], [71 + k * 2.6, 106 + k]], 0.3, 0.6, m.leather.D, 0.4); } });
  // el pistón sobre el lomo de la hoja
  P.push({ pts: taper(spline([[70, 94], [74.5, 78]], false, 4), () => 2.0), z: 15, ...mat(m.brass, { shadeW: 1.3, deepW: 2.4 }),
    deco: (cx) => { stroke(cx, [[70.5, 88], [72.5, 88.6]], 0.6, 0.6, m.brass.D, 0.5); stroke(cx, [[71.6, 84], [73.6, 84.6]], 0.6, 0.6, m.brass.D, 0.5); } });
  // el arco del guardamano
  P.push({ pts: taper(spline([[69, 95], [64, 102], [66, 112], [74, 115]], false, 8), brush(0.9, 1.3, 0.2)), z: 17, ...mat(m.brass, { shadeW: 0.9, deep: undefined }) });

  card(cv, P, { bg: ['#3d354c', '#1b1420'], glow: school[1], glowAt: [44, 52], gear: [78, 92], seed: 11 });
}
