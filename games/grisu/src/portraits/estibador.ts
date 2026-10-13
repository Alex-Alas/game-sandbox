// Retrato de ANCLA (el Estibador): la escafandra de latón llena el cuadro; la ventanilla redonda es lo único que
// brilla (el color de la escuela), con su reja. Los hombros de grúa no entran, el ancla al hombro asoma arriba a la
// izquierda y la cadena le cruza el pecho. Latón redondo y remachado contra el hierro plano del ancla.
import { type V, spline, taper, brush } from './curves.ts';
import { type Part, stroke } from './ink.ts';
import { MAT, EMIT } from '../render/palette.ts';
import { card } from './card.ts';

const S = (pts: V[], sharp?: number[], per = 7) => spline(pts, true, per, pts.map((_, i) => sharp?.includes(i)));
const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0, n = 44): V[] => {
  const o: V[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; o.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
  return o;
};

export function drawEstibador(cv: HTMLCanvasElement, school = EMIT.arcanita) {
  const m = MAT, P: Part[] = [];
  const mat = (r: { base: string, S: string, D: string, R: string, H: string }, extra: Partial<Part> = {}): Omit<Part, 'pts' | 'z'> =>
    ({ fill: r.base, shade: r.S, shadeW: 2.6, deep: r.D, deepW: 5.5, rim: r.R, rimW: 0.6, hl: r.H, hlW: 0.6, line: 0.25, ...extra });
  const bolt = (cx: CanvasRenderingContext2D, x: number, y: number, r = 1.1) => {
    cx.fillStyle = '#1b1420'; cx.beginPath(); cx.arc(x + 0.25, y + 0.3, r + 0.35, 0, 7); cx.fill();
    cx.fillStyle = m.iron.base; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
    cx.fillStyle = m.iron.H; cx.beginPath(); cx.arc(x - r * 0.35, y - r * 0.35, r * 0.4, 0, 7); cx.fill();
  };

  // ---------- el ancla al hombro (detrás) ----------
  const a0: V = [4, 120], a1: V = [27, 12];
  P.push({ pts: taper(spline([a0, a1], false, 4), () => 2.3), z: 0, ...mat(m.iron, { shadeW: 1.6, deepW: 3 }) });
  // cepo
  P.push({ pts: S([[13, 70], [27, 74], [26.4, 77], [12.4, 73]], [0, 1, 2, 3]), z: 0.5, ...mat(m.iron, { shadeW: 1, deep: undefined }) });
  // la cruz: los brazos curvos y las uñas
  {
    const arc: V[] = [];
    for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.98 + i * 0.087); arc.push([27 + Math.cos(a) * 17, 18 + Math.sin(a) * 15]); }
    void arc;
    const arms = spline([[8, 30], [12, 22], [20, 15], [28, 13], [36, 15], [43, 21], [46, 28]], false, 6);
    P.push({ pts: taper(arms, brush(2.4, 2.4, 0.15)), z: 0.3, ...mat(m.iron, { shadeW: 1.4, deepW: 2.8, hatch: 1.4 }) });
    P.push({ pts: S([[3, 25], [10, 31.5], [9, 23]], [0, 1, 2]), z: 0.4, ...mat(m.iron, { shadeW: 1.2, deep: undefined }) });
    P.push({ pts: S([[51, 24], [44, 30.5], [46, 22]], [0, 1, 2]), z: 0.4, ...mat(m.iron, { shadeW: 1.2, deep: undefined }) });
    // la cabeza de martillo de latón en la cruz
    P.push({ pts: S([[21, 4], [33, 3], [34.5, 15], [22.5, 16]], [0, 1, 2, 3]), z: 0.6, ...mat(m.brass, { shadeW: 2, deepW: 3.6 }),
      after: (cx) => { bolt(cx, 24.5, 6.5, 0.8); bolt(cx, 31, 6, 0.8); bolt(cx, 25, 13, 0.8); bolt(cx, 31.6, 12.6, 0.8); } });
  }

  // ---------- los hombros (lona) y el brazo-grúa ----------
  P.push({ pts: S([[-2, 124], [0, 98], [8, 86], [22, 79], [50, 76], [78, 79], [92, 86], [101, 98], [102, 124]]), z: 1,
    ...mat(m.canvas, { shadeW: 4.5, deepW: 10, hatch: 1.7, hatchL: 8, hatchC: 'rgba(27,20,32,0.75)' }),
    deco: (cx) => { stroke(cx, [[30, 98], [34, 110], [31, 124]], 0.2, 1.5, m.canvas.S, 0.4); stroke(cx, [[72, 96], [69, 110], [72, 124]], 0.2, 1.6, m.canvas.D, 0.4); } });
  // el hombro de la grúa (izquierda del cuadro): eje de latón con pistones
  P.push({ pts: ell(12, 90, 12, 11), z: 2, ...mat(m.brass, { shadeW: 2.4, deepW: 4.2 }),
    after: (cx) => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; bolt(cx, 12 + Math.cos(a) * 8.6, 90 + Math.sin(a) * 7.8, 0.8); } } });
  P.push({ pts: ell(12, 90, 4.4, 4.2), z: 3, ...mat(m.iron, { shadeW: 1, deep: undefined }) });
  for (const [x0, x1] of [[4, 2], [18, 20]]) P.push({ pts: taper(spline([[x0, 98], [x1, 124]], false, 3), () => 1.3), z: 2.5, ...mat(m.steel, { shadeW: 0.8, deep: undefined }) });
  // la hombrera derecha (lona más oscura)
  P.push({ pts: ell(88, 90, 11, 8, 0.25), z: 2, ...mat({ base: '#584a44', S: '#3a3036', D: '#262531', R: '#7f8ea6', H: '#7a6a52' }) });

  // ---------- el corselete de latón con pernos ----------
  P.push({ pts: S([[20, 84], [26, 74], [50, 70], [74, 74], [80, 84], [74, 92], [50, 95], [26, 92]]), z: 4, ...mat(m.brass, { shadeW: 3, deepW: 6, hatch: 1.5, hatchL: 5 }),
    after: (cx) => { for (let i = 0; i < 11; i++) { const a = Math.PI * (0.06 + i * 0.088); bolt(cx, 50 + Math.cos(a) * 26, 82 + Math.sin(a) * 9.6, 1.05); } } });
  // la cadena que cruza el pecho
  P.push({ pts: [[0, 0]], z: 4.5, fill: 'transparent', outline: false,
    after: (cx) => {
      const c = spline([[14, 99], [32, 108], [52, 110], [72, 104], [92, 95]], false, 10);
      for (let i = 0; i < c.length - 1; i += 2) {
        const [x, y] = c[i], [x2, y2] = c[i + 1], an = Math.atan2(y2 - y, x2 - x);
        cx.save(); cx.translate(x, y); cx.rotate(an);
        cx.lineWidth = 0.75; cx.strokeStyle = '#1b1420';
        if (i % 4 === 0) { cx.beginPath(); cx.ellipse(0, 0, 2.6, 1.6, 0, 0, 7); cx.fillStyle = m.brass.base; cx.fill(); cx.stroke(); cx.beginPath(); cx.ellipse(0, 0, 1.5, 0.6, 0, 0, 7); cx.fillStyle = '#1b1420'; cx.fill(); cx.fillStyle = m.brass.H; cx.fillRect(-1.6, -1.4, 1.4, 0.5); }
        else { cx.fillStyle = m.brass.S; cx.fillRect(-2.2, -0.6, 4.4, 1.2); cx.strokeRect(-2.2, -0.6, 4.4, 1.2); }
        cx.restore();
      }
    } });

  // ---------- la escafandra ----------
  const hc: V = [50, 47];
  P.push({ pts: ell(hc[0], hc[1], 27, 28), z: 5, ...mat(m.brass, { shadeW: 4.2, deepW: 9, hatch: 1.6, hatchL: 7, rimW: 0.8, hlW: 0.9 }),
    deco: (cx) => {
      // costura vertical y anillo de soldadura
      stroke(cx, [[50, 20], [52, 34]], 0.3, 0.8, m.brass.S, 0.4);
      // brillo nítido (el latón chispea)
      cx.fillStyle = m.brass.H; cx.beginPath(); cx.ellipse(36, 30, 4.6, 2.2, -0.7, 0, 7); cx.fill();
      cx.fillStyle = '#ffffff'; cx.beginPath(); cx.ellipse(35, 29, 1.5, 0.7, -0.7, 0, 7); cx.fill();
    } });
  // válvula de arriba
  P.push({ pts: S([[46, 16], [54, 16], [55, 22], [45, 22]], [0, 1, 2, 3]), z: 4.8, ...mat(m.brass, { shadeW: 1.2, deep: undefined }) });
  P.push({ pts: ell(50, 13.5, 4.6, 1.8), z: 4.9, ...mat(m.iron, { shadeW: 0.8, deep: undefined }) });
  // ventanilla de costado
  P.push({ pts: ell(74, 44, 4.8, 7.5, 0.1), z: 6, ...mat(m.copper, { shadeW: 1.4, deepW: 2.6 }) });
  P.push({ pts: ell(74.3, 44, 3, 5.4, 0.1), z: 7, ...mat(m.glass, { shadeW: 1.2, deep: undefined }),
    after: (cx) => { cx.fillStyle = m.glass.H; cx.beginPath(); cx.ellipse(73.2, 41.5, 0.8, 1.6, 0.1, 0, 7); cx.fill(); } });
  // la ventanilla de frente: aro de cobre con pernos, vidrio que brilla y reja
  const pc: V = [45, 52];
  P.push({ pts: ell(pc[0], pc[1], 15, 15.5), z: 8, ...mat(m.copper, { shadeW: 2.2, deepW: 4.4, hlW: 0.8 }),
    after: (cx) => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.39; bolt(cx, pc[0] + Math.cos(a) * 13.2, pc[1] + Math.sin(a) * 13.6, 1.0); } } });
  P.push({ pts: ell(pc[0], pc[1], 10.6, 11), z: 9, fill: school[1], line: 0.3, glow: school[1],
    after: (cx) => {
      // el resplandor de adentro: núcleo claro arriba a la izquierda, borde oscuro abajo
      cx.save(); cx.beginPath(); cx.ellipse(pc[0], pc[1], 10.6, 11, 0, 0, 7); cx.clip();
      cx.fillStyle = school[2]; cx.beginPath(); cx.ellipse(pc[0] + 3.5, pc[1] + 4, 10, 10, 0, 0, 7); cx.globalAlpha = 0.55; cx.fill(); cx.globalAlpha = 1;
      cx.fillStyle = school[0]; cx.beginPath(); cx.ellipse(pc[0] - 2.5, pc[1] - 3, 5, 5.4, 0, 0, 7); cx.fill();
      cx.restore();
      // reja
      cx.fillStyle = '#1b1420';
      cx.fillRect(pc[0] - 1.4, pc[1] - 11, 2.8, 22); cx.fillRect(pc[0] - 10.6, pc[1] - 1.4, 21.2, 2.8);
      cx.fillStyle = m.iron.base;
      cx.fillRect(pc[0] - 0.8, pc[1] - 11, 1.6, 22); cx.fillRect(pc[0] - 10.6, pc[1] - 0.8, 21.2, 1.6);
      cx.fillStyle = m.iron.H; cx.fillRect(pc[0] - 0.8, pc[1] - 11, 0.5, 22);
      bolt(cx, pc[0], pc[1], 1.6);
      cx.fillStyle = '#ffffff'; cx.globalAlpha = 0.8; cx.beginPath(); cx.ellipse(pc[0] - 6, pc[1] - 6.5, 1.6, 0.8, -0.7, 0, 7); cx.fill(); cx.globalAlpha = 1;
    } });

  card(cv, P, { bg: ['#4a3a34', '#1b1420'], glow: school[1], glowAt: [45, 52], gear: [82, 30], seed: 23 });
}
