// EL VERDUGO DE CENIZA: un bruto jorobado de piel de ceniza con grietas de brasa, casco de cráneo
// con cuernos y un hacha-cuchilla enorme. Mismo entintador que la heroína (contorno único, sombras
// por máscara, rayado), con otra paleta y otra masa: hombros que tapan la cabeza, piernas cortas.
import { type V, vadd, vsub, vscale, vrot, vnorm, perp, lerp, spline, taper, limb, boil, ik2, crescent, clamp } from '../draw/curves.ts';
import { type Part, stroke } from '../draw/ink.ts';
import { type Pose, type Clip, num, vec, Springs, Chain } from '../rig.ts';
import type { CharDef, DrawOpts } from './types.ts';
import { BRUTE_CLIPS } from './brute-clips.ts';

const THIGH = 21, SHIN = 21, TORSO = 44, UPPER = 27, FORE = 27, HAFT = 74;

export const BC = {
  ink: '#120c18',
  skin: '#252536', skinS: '#15141f', skinD: '#0c0b12', skinR: '#7fc4c6', skinH: '#46405c',
  ember: '#ff8a3d', emberHot: '#ffd59a',
  bone: '#d9cfbe', boneS: '#958aa0', boneD: '#5f566c', boneR: '#9fd4e0',
  horn: '#2d2733', hornS: '#17131d', hornH: '#6b6170',
  cloth: '#4b2730', clothS: '#2b141c', clothR: '#c25d5d',
  wood: '#3d2c24', woodS: '#221813',
  iron: '#5f6674', ironS: '#343a47', ironD: '#1e222b', ironR: '#b8f0ff', rust: '#8a4a2a',
  chain: '#2a2a33',
};

export const BRUTE_BASE: Pose = {
  x: 0, y: 0, yw: 0, sq: 1, rot: 0, gl: 0,
  hip: [-4, -38], lean: 0.5, head: -0.3, jaw: 0,
  hf: [30, -40], hb: [-14, -44], ef: 1, eb: 1,
  ff: [14, 0], fb: [-16, 0], tf: 0, tb: 0,
  bl: 1.5, sm: 0, smR: 0, eye: 1, cl: 0, br: 0, // br = respiración (abre el pecho)
};

export interface BrutePhys { cloth: Springs; chainF: Chain; chainB: Chain }

function frames(P: Pose) {
  const y0 = num(P, 'y');
  const lean = num(P, 'lean');
  const hp = vec(P, 'hip');
  const hip: V = [hp[0], hp[1] + y0];
  const u = vrot([0, -1], lean), r = vrot([1, 0], lean);
  const T = (a: number, b: number): V => [hip[0] + r[0] * a + u[0] * b, hip[1] + r[1] * a + u[1] * b];
  const neck = T(10, TORSO);
  const ha = lean + num(P, 'head');
  const hu = vrot([0, -1], ha), hr = vrot([1, 0], ha);
  const hc: V = [neck[0] + hr[0] * 9 + hu[0] * 5, neck[1] + hr[1] * 9 + hu[1] * 5];
  const H = (a: number, b: number): V => [hc[0] + hr[0] * a - hu[0] * b, hc[1] + hr[1] * a - hu[1] * b];
  return { y0, hip, u, r, T, neck, hc, H, hr, hu };
}

const clothRest = (P: Pose): V[] => {
  const { T } = frames(P);
  const fl = num(P, 'cl');
  return [T(10 - fl * 4, -18 + fl * 6), T(4 - fl * 6, -22 + fl * 7), T(-4 - fl * 8, -20 + fl * 8), T(-10 - fl * 10, -16 + fl * 8)];
};

function geom(P: Pose) {
  const F = frames(P);
  const { T, y0 } = F;
  const shF = T(12, TORSO - 4), shB = T(-4, TORSO - 2);
  const hand = (k: string): V => { const h = vec(P, k); return [h[0], h[1] + y0]; };
  const armF = ik2(shF, hand('hf'), UPPER, FORE, num(P, 'ef', 1) >= 0 ? 1 : -1, 1.1);
  const armB = ik2(shB, hand('hb'), UPPER, FORE, num(P, 'eb', 1) >= 0 ? 1 : -1, 1.1);
  const foot = (k: string): V => { const h = vec(P, k); return [h[0], h[1] + y0 - 5]; };
  const hipF = T(6, 2), hipB = T(-8, 4);
  const legF = ik2(hipF, foot('ff'), THIGH, SHIN, -1, 1.05);
  const legB = ik2(hipB, foot('fb'), THIGH, SHIN, -1, 1.05);
  const bl = num(P, 'bl');
  const bd: V = [Math.cos(bl), Math.sin(bl)];
  const fd = vnorm(vsub(armF.end, armF.mid));
  const fist = vadd(armF.end, vscale(fd, 3));
  // el hacha se toma cerca de la punta del mango: la cabeza queda a HAFT − 14 de la mano
  const haftA = vadd(fist, vscale(bd, -14)), haftB = vadd(fist, vscale(bd, HAFT - 14));
  return { ...F, shF, shB, armF, armB, hipF, hipB, legF, legB, bd, fist, haftA, haftB };
}

export const brute: CharDef<BrutePhys> = {
  id: 'verdugo', name: 'El Verdugo de Ceniza', desc: 'Bruto pesado: hachazo que parte el suelo, barrido, rugido. Grietas de brasa que laten.',
  box: [-170, -250, 170, 60],
  base: BRUTE_BASE,
  clips: BRUTE_CLIPS as Record<string, Clip>,
  order: Object.keys(BRUTE_CLIPS),
  ink: { ink: BC.ink, ol: 1.35, olShadow: 1.0, rimC: 'rgba(100,190,196,0.8)', rimW: 1.3 },
  phys(P) {
    const g = geom(P);
    return {
      cloth: new Springs(clothRest(P), 140, 7, 2.2, 30, 16),
      chainF: new Chain(5, 4, g.armF.end, [0, 1], 400, 1.5, 0.02),
      chainB: new Chain(4, 4, g.armB.end, [0, 1], 400, 1.5, 0.02),
    };
  },
  step(ph, P, dt, shift, fv, t) {
    ph.cloth.step(clothRest(P), dt, shift, fv, t);
    const g = geom(P);
    ph.chainF.step(vadd(g.armF.end, vscale(vnorm(vsub(g.armF.mid, g.armF.end)), 3)), [0, 1], dt, shift, fv, t);
    ph.chainB.step(vadd(g.armB.end, vscale(vnorm(vsub(g.armB.mid, g.armB.end)), 3)), [0, 1], dt, shift, fv, t + 1);
  },
  mirror(ph) { ph.cloth.mirror(); ph.chainF.mirror(); ph.chainB.mirror(); },
  weapon(P) {
    const g = geom(P);
    // el rastro barre la hoja del hacha (de la base al filo exterior)
    const head = vadd(g.fist, vscale(g.bd, HAFT - 22));
    const edge = vadd(head, vscale(perp(g.bd), -26));
    return { a: vadd(head, vscale(perp(g.bd), -6)), b: edge };
  },
  parts(P, ph, o) { return bruteParts(P, ph, o); },
  bones(P) {
    const g = geom(P);
    return [[g.hip, g.T(0, TORSO * 0.5), g.neck, g.hc], [g.shF, g.armF.mid, g.armF.end], [g.shB, g.armB.mid, g.armB.end], [g.hipF, g.legF.mid, g.legF.end], [g.hipB, g.legB.mid, g.legB.end], [g.haftA, g.haftB]];
  },
};

function bruteParts(P: Pose, ph: BrutePhys, o: DrawOpts): Part[] {
  const G = geom(P);
  const { T, H } = G;
  let id = 0;
  const B = (pts: V[]) => boil(pts, o.boil * 1.3, o.seed, ++id);
  const parts: Part[] = [];
  const pulse = 0.65 + 0.35 * Math.sin(o.t * 3.1) + num(P, 'gl') * 0.6;
  const skin = { shade: BC.skinS, shadeW: 6, deep: BC.skinD, deepW: 13, rim: BC.skinR, rimW: 1.3, hl: BC.skinH, hlW: 1.0, hatch: 2.2, hatchL: 7, hatchC: 'rgba(14,10,22,0.7)' };
  const br = num(P, 'br');
  const crack = (cx: CanvasRenderingContext2D, pts: V[], w: number) => {
    stroke(cx, pts, w * 3.2, 0.4, 'rgba(255,110,40,0.22)', 0.3);
    stroke(cx, pts, w * 1.9, 0.2, 'rgba(255,120,40,0.45)', 0.3);
    stroke(cx, pts, w, 0.1, BC.ember, 0.3);
    stroke(cx, pts, w * 0.4, 0.05, BC.emberHot, 0.3);
  };
  const crackGlow = (g: CanvasRenderingContext2D, pts: V[], w: number) => {
    g.globalAlpha = clamp(pulse, 0, 1);
    stroke(g, pts, w * 2.4, 0.3, BC.ember, 0.3);
  };

  // ---------- cadenas de las muñecas (atrás) ----------
  const chainPart = (c: Chain, z: number) => {
    const s = spline(c.p.map((v) => [v[0], v[1]] as V), false, 3);
    parts.push({ pts: taper(s, () => 1.1), z, fill: BC.chain, line: 0.5, outline: true, olw: 0.8,
      deco: (cx) => { for (let i = 1; i < s.length; i += 3) { cx.fillStyle = '#4d4d5a'; cx.beginPath(); cx.arc(s[i][0], s[i][1], 0.9, 0, 6.3); cx.fill(); } } });
  };
  chainPart(ph.chainB, 0);

  // ---------- brazo de atrás ----------
  armPart(parts, B, G.shB, G.armB.mid, G.armB.end, 1, false, skin, o, crack, crackGlow);

  // ---------- pierna de atrás ----------
  legPart(parts, B, G.hipB, G.legB.mid, G.legB.end, num(P, 'tb'), 2, true, skin);

  // ---------- torso: joroba, pecho y panza en una sola silueta ----------
  {
    const pts = B([T(14, -3), T(22 + br, 10), T(19 + br, 22), T(24 + br * 1.5, 32), T(17, 43), T(6, 52 + br), T(-10, 52 + br * 0.6), T(-21, 40), T(-18, 20), T(-16, 4), T(-8, -5)]);
    const poly = spline(pts, true, 7);
    parts.push({ pts: poly, z: 3, fill: BC.skin, ...skin, line: 1,
      deco: (cx) => {
        // músculos y costillas: trazos de pincel
        stroke(cx, [T(18, 30), T(12, 27), T(6, 30)], 1.6, 0.2, BC.skinS, 0.3);
        stroke(cx, [T(18, 21), T(10, 17)], 1.2, 0.2, BC.skinS, 0.3);
        stroke(cx, [T(16, 13), T(9, 9)], 1.0, 0.2, BC.skinS, 0.3);
        stroke(cx, [T(-6, 48), T(-14, 40), T(-16, 30)], 1.4, 0.2, BC.skinD, 0.3);
        // grietas de brasa
        crack(cx, [T(10, 40), T(13, 33), T(9, 26), T(12, 19), T(8, 12), T(10, 6)], 2.2);
        crack(cx, [T(-4, 48), T(-9, 41), T(-6, 33), T(-11, 26)], 1.8);
        crack(cx, [T(13, 33), T(19, 31), T(21, 27)], 1.2);
        crack(cx, [T(9, 26), T(3, 23), T(0, 17)], 1.1);
        crack(cx, [T(-12, 36), T(-17, 30)], 1.0);
      },
      glowDraw: (g) => {
        crackGlow(g, [T(10, 40), T(13, 33), T(9, 26), T(12, 19), T(8, 12), T(10, 6)], 2.2);
        crackGlow(g, [T(-4, 48), T(-9, 41), T(-6, 33), T(-11, 26)], 1.8);
        crackGlow(g, [T(13, 33), T(19, 31), T(21, 27)], 1.2);
        crackGlow(g, [T(9, 26), T(3, 23), T(0, 17)], 1.1);
      } });
    // cinturón con hebilla de hueso
    const belt = B([T(-17, 6), T(15, 2), T(15, -4), T(-17, 0)]);
    parts.push({ pts: spline(belt, true, 3), z: 3.2, fill: BC.wood, shade: BC.woodS, shadeW: 2, line: 0.7 });
    const bk = T(10, -1);
    parts.push({ pts: spline([vadd(bk, [-3, -3]), vadd(bk, [3, -3]), vadd(bk, [3.5, 3]), vadd(bk, [-3, 3])], true, 3), z: 3.3, fill: BC.bone, shade: BC.boneS, shadeW: 1.2, line: 0.6 });
  }

  // ---------- taparrabos (física) ----------
  {
    const c = ph.cloth.p;
    const pts = B([T(14, -2), c[0], c[1], vlerp2(c[1], c[2], 0.5, [0, 3]), c[2], c[3], T(-12, -1)]);
    parts.push({ pts: spline(pts, true, 5, [false, false, true, false, true, false, false]), z: 3.5, fill: BC.cloth, shade: BC.clothS, shadeW: 3, rim: BC.clothR, rimW: 0.9, line: 0.8,
      deco: (cx) => { stroke(cx, [T(4, -3), c[1]], 0.8, 0.3, BC.clothS, 0.2); stroke(cx, [T(-4, -3), c[2]], 0.7, 0.3, BC.clothS, 0.2); } });
  }

  // ---------- pierna de adelante ----------
  legPart(parts, B, G.hipF, G.legF.mid, G.legF.end, num(P, 'tf'), 4, false, skin);

  // ---------- cabeza: casco de cráneo con cuernos ----------
  {
    const jaw = num(P, 'jaw');
    // cuernos (detrás del casco)
    for (const side of [-1, 1]) {
      const base = H(-3 + side * 1.5, -6), dir = side > 0 ? 1 : 0.82;
      const pts: V[] = [base, H(-10 * dir, -10), H(-13 * dir, -19), H(-6 * dir, -27), H(4 * dir, -30)];
      const s = spline(pts, false, 6);
      const poly = taper(s, (t) => lerp(3.8, 0.2, Math.pow(t, 0.8)));
      parts.push({ pts: poly, z: side > 0 ? 9.15 : 5.1, fill: side > 0 ? BC.horn : '#221d28', shade: BC.hornS, shadeW: 1.6, hl: BC.hornH, hlW: 0.7, line: 0.6,
        deco: (cx) => { for (let i = 2; i < s.length - 4; i += 3) { const n = vnorm(perp(vsub(s[i + 1], s[i]))); stroke(cx, [vadd(s[i], vscale(n, -3)), vadd(s[i], vscale(n, 3))], 0.5, 0.5, BC.hornS, 0.1); } } });
    }
    const helm = B([H(-11, -7), H(-4, -13), H(7, -12), H(13, -6), H(14, 1), H(11, 6), H(2, 7), H(-7, 5), H(-12, 0)]);
    parts.push({ pts: spline(helm, true, 6), z: 9.2, fill: BC.bone, shade: BC.boneS, shadeW: 3, deep: BC.boneD, deepW: 7, rim: BC.boneR, rimW: 0.8, hl: '#fff6e6', hlW: 0.8, hatch: 1.4, hatchC: 'rgba(40,20,50,0.55)', line: 0.8,
      deco: (cx) => {
        // cuencas y grietas del cráneo
        cx.fillStyle = BC.ink;
        for (const [a, b, s] of [[6.5, -1.5, 1], [0.5, -1.2, 0.8]] as [number, number, number][]) {
          const e = H(a, b);
          cx.beginPath(); cx.ellipse(e[0], e[1], 2.4 * s, 2.0 * s, 0, 0, Math.PI * 2); cx.fill();
        }
        stroke(cx, [H(2, -10), H(3, -7), H(1.5, -5)], 0.7, 0.1, BC.boneD, 0.2);
        stroke(cx, [H(9, 3), H(5, 3.6), H(1, 3.2)], 0.6, 0.6, BC.boneD, 0.1);
      },
      after: (cx) => {
        const k = clamp(num(P, 'eye', 1), 0, 1);
        for (const [a, b, s] of [[6.5, -1.5, 1], [0.5, -1.2, 0.75]] as [number, number, number][]) {
          const e = H(a + 0.3, b + 0.2);
          cx.fillStyle = BC.ember;
          cx.beginPath(); cx.ellipse(e[0], e[1], 1.1 * s, 0.9 * s * k + 0.2, 0, 0, Math.PI * 2); cx.fill();
        }
      },
      glowDraw: (g) => {
        g.fillStyle = BC.ember;
        for (const [a, b, s] of [[6.5, -1.5, 1], [0.5, -1.2, 0.75]] as [number, number, number][]) {
          const e = H(a + 0.3, b + 0.2);
          g.beginPath(); g.ellipse(e[0], e[1], 1.8 * s, 1.5 * s, 0, 0, Math.PI * 2); g.fill();
        }
      } });
    // mandíbula (se abre al rugir)
    const jw = B([H(-4, 4), H(10, 4.6 + jaw * 2), H(9.5, 8 + jaw * 6), H(2, 9 + jaw * 5), H(-5, 7)]);
    parts.push({ pts: spline(jw, true, 4), z: 9.18, fill: BC.bone, shade: BC.boneS, shadeW: 2, line: 0.7,
      deco: (cx) => { for (let i = 0; i < 4; i++) { const a = H(1 + i * 2.2, 4.8 + jaw * 1.2), b = H(1.6 + i * 2.2, 6.6 + jaw * 1.4); stroke(cx, [a, b], 1.2, 0.3, '#fff3df', 0.2, 1); } } });
  }

  // ---------- hacha (detrás o delante del brazo) ----------
  axeParts(parts, B, P, G, o);

  // ---------- brazo de adelante, puño, cadena ----------
  armPart(parts, B, G.shF, G.armF.mid, G.armF.end, 8, true, skin, o, crack, crackGlow);
  chainPart(ph.chainF, 9.4);
  {
    // hombrera: caparazón de hueso con púas, tapa la unión del hombro
    const { r, u } = G;
    const S = (a: number, b: number): V => vadd(G.shF, vadd(vscale(r, a), vscale(u, b)));
    const sh = B([S(-12, -2), S(-11, 7), S(-4, 13), S(6, 13), S(13, 7), S(14, -1), S(9, -6), S(-2, -7)]);
    parts.push({ pts: spline(sh, true, 6), z: 8.6, fill: BC.iron, shade: BC.ironS, shadeW: 3.2, deep: BC.ironD, deepW: 7, hl: '#dff2ff', hlW: 0.9, hatch: 1.6, hatchC: 'rgba(10,12,20,0.6)', line: 0.9,
      deco: (cx) => {
        stroke(cx, [S(-10, 1), S(0, 4), S(12, 1)], 1.6, 1.6, BC.ironD, 0.1);
        stroke(cx, [S(-10, 2.4), S(0, 5.4), S(12, 2.4)], 0.5, 0.5, '#9aa6b6', 0.1);
        cx.fillStyle = '#c9d4e0';
        for (const [a, b] of [[-7, 0.5], [0, 2.5], [8, 0.5]] as [number, number][]) { const q = S(a, b - 1.4); cx.beginPath(); cx.arc(q[0], q[1], 0.9, 0, 6.3); cx.fill(); }
        stroke(cx, [S(-4, 8), S(4, 10)], 2.2, 0.3, 'rgba(140,72,40,0.5)', 0.3);
      } });
    for (const [a, b, l, ang] of [[-6, 12, 9, -0.5], [2, 13, 11, -0.15], [9, 11, 8, 0.25]] as [number, number, number, number][]) {
      const base = S(a, b), dir = vnorm(vrot(u, ang)), n = perp(dir);
      const sp = [vadd(base, vscale(n, -2.2)), vadd(base, vscale(dir, l)), vadd(base, vscale(n, 2.2))];
      parts.push({ pts: sp, z: 8.55, fill: BC.horn, shade: BC.hornS, shadeW: 1, line: 0.5 });
    }
  }
  {
    const fd = vnorm(vsub(G.armF.end, G.armF.mid)), fn = perp(fd), c = G.fist;
    const f = B([vadd(c, vadd(vscale(fd, -3), vscale(fn, -4.5))), vadd(c, vadd(vscale(fd, 4), vscale(fn, -4))), vadd(c, vadd(vscale(fd, 5), vscale(fn, 3))), vadd(c, vadd(vscale(fd, -1), vscale(fn, 5))), vadd(c, vadd(vscale(fd, -4.5), vscale(fn, 1)))]);
    parts.push({ pts: spline(f, true, 5), z: 9.6, fill: BC.skin, shade: BC.skinS, shadeW: 2.6, rim: BC.skinR, rimW: 0.8, line: 0.8,
      deco: (cx) => { for (let i = 0; i < 3; i++) stroke(cx, [vadd(c, vadd(vscale(fd, 3.2), vscale(fn, -2 + i * 2.2))), vadd(c, vadd(vscale(fd, 1), vscale(fn, -2.2 + i * 2.2)))], 0.6, 0.2, BC.skinD, 0.2); } });
  }
  return parts;
}

function vlerp2(a: V, b: V, t: number, off: V): V { return [a[0] + (b[0] - a[0]) * t + off[0], a[1] + (b[1] - a[1]) * t + off[1]]; }

type Skin = Partial<Part>;
function legPart(parts: Part[], B: (p: V[]) => V[], hip: V, knee: V, ankle: V, toeA: number, z: number, back: boolean, skin: Skin) {
  const j = B([hip, knee, ankle]);
  const poly = limb(j, [8, 6.2, 4.2], [8.5, 5.6, 4.6], 7, (t, side) => side > 0 ? 2.4 * Math.exp(-Math.pow((t - 0.62) / 0.14, 2)) : 1.8 * Math.exp(-Math.pow((t - 0.2) / 0.14, 2)));
  parts.push({ pts: poly, z, fill: back ? '#1a1926' : BC.skin, ...skin, shadeW: 3.4, deepW: 7, line: 0.9 });
  // pie: vendas y garras
  const a = ankle, R = (x: number, y: number): V => vadd(a, vrot([x, y], toeA));
  const ft = B([R(-5, -4), R(-6, 3), R(-4, 5.2), R(9, 5.2), R(13, 3.6), R(12, 1), R(6, -1), R(4, -5)]);
  parts.push({ pts: spline(ft, true, 4), z: z + 0.1, fill: back ? '#13121b' : BC.skinS, shade: BC.skinD, shadeW: 2, rim: BC.skinR, rimW: 0.7, line: 0.8,
    deco: (cx) => {
      for (let i = 0; i < 3; i++) stroke(cx, [R(-5, -2.5 + i * 2.4), R(4, -3.8 + i * 2.4)], 1.1, 1.1, back ? '#6d6458' : '#8c8170', 0.1);
    },
    after: (cx) => {
      // garras
      cx.fillStyle = BC.ink;
      for (let i = 0; i < 2; i++) { const b = R(11 + i * -3.5, 4.8), t = R(14.5 + i * -3.5, 5.6); cx.beginPath(); cx.moveTo(b[0] - 1, b[1] - 1.2); cx.lineTo(t[0], t[1]); cx.lineTo(b[0] + 1, b[1] + 0.4); cx.fill(); }
    } });
}

function armPart(parts: Part[], B: (p: V[]) => V[], sh: V, el: V, wr: V, z: number, front: boolean, skin: Skin, o: DrawOpts,
  crack: (cx: CanvasRenderingContext2D, pts: V[], w: number) => void, crackGlow: (g: CanvasRenderingContext2D, pts: V[], w: number) => void) {
  const j = B([sh, el, wr]);
  const poly = limb(j, [9, 7, 5.2], [8.5, 7.6, 5.6], 7, (t, side) => side > 0 ? 2.6 * Math.exp(-Math.pow((t - 0.2) / 0.15, 2)) : 2.2 * Math.exp(-Math.pow((t - 0.68) / 0.12, 2)));
  const d1 = vnorm(vsub(el, sh)), d2 = vnorm(vsub(wr, el));
  const along = (a: V, d: V, k: number, off: number): V => vadd(a, vadd(vscale(d, k), vscale(perp(d), off)));
  const c1: V[] = [along(sh, d1, 6, 1), along(sh, d1, 12, -1.5), along(sh, d1, 17, 1)];
  const c2: V[] = [along(el, d2, 4, -1), along(el, d2, 10, 1.5), along(el, d2, 16, -0.5)];
  parts.push({ pts: poly, z, fill: front ? BC.skin : '#1a1926', ...skin, line: 0.9,
    deco: (cx) => {
      // brazal de cuero en el antebrazo
      const b0 = along(el, d2, 13, 0), n = perp(d2);
      for (let i = 0; i < 3; i++) stroke(cx, [vadd(vadd(b0, vscale(d2, i * 3)), vscale(n, -8)), vadd(vadd(b0, vscale(d2, i * 3 + 1.5)), vscale(n, 8))], 2, 2, front ? BC.wood : BC.woodS, 0.05);
      if (front) { crack(cx, c1, 1.2); crack(cx, c2, 1.0); }
    },
    glowDraw: front ? (g) => { crackGlow(g, c1, 1.2); crackGlow(g, c2, 1.0); } : undefined });
  if (!front) {
    const d = d2, n = perp(d), c = vadd(wr, vscale(d, 3));
    const f = B([vadd(c, vscale(n, -4.5)), vadd(c, vscale(d, 5)), vadd(c, vscale(n, 4.5)), vadd(c, vscale(d, -4))]);
    parts.push({ pts: spline(f, true, 4), z: z + 0.1, fill: '#1a1926', shade: BC.skinD, shadeW: 2, line: 0.8 });
  }
  void o;
}

function axeParts(parts: Part[], B: (p: V[]) => V[], P: Pose, G: ReturnType<typeof geom>, o: DrawOpts) {
  const bd = G.bd, bn = perp(bd), f = G.fist;
  const z = num(P, 'bz', 1) >= 0 ? 9 : 2.5;
  const at = (t: number, off: number): V => vadd(f, vadd(vscale(bd, t), vscale(bn, off)));
  const sm = num(P, 'sm');
  if (Math.abs(sm) > 0.05) {
    const a1 = Math.atan2(bd[1], bd[0]), a0 = a1 - sm;
    const r1 = HAFT - 6, r0 = 20;
    const pts = crescent(f, r1, a0, a1, (t) => (r1 - r0) * Math.pow(t, 1.3), 30);
    parts.push({ pts, z: z - 0.3, fill: '#e9f2f6', olw: 1.1, line: 0, glow: 'rgba(160,220,255,0.35)',
      deco: (cx) => {
        const inner = crescent(f, r1 - 6, a0 + sm * 0.3, a1, (t) => (r1 - r0 - 14) * Math.pow(t, 2), 24);
        cx.fillStyle = 'rgba(110,170,200,0.55)';
        cx.fill(pathOfPts(inner));
      } });
  }
  // mango
  const haft = taper([at(-16, 0), at(HAFT - 10, 0)], (t) => lerp(2.2, 2.6, t));
  parts.push({ pts: B(haft), z: z - 0.1, fill: BC.wood, shade: BC.woodS, shadeW: 1.6, line: 0.6,
    deco: (cx) => { for (let i = 0; i < 6; i++) { const t = -12 + i * 4; stroke(cx, [at(t, -2.6), at(t + 1.6, 2.6)], 0.9, 0.9, BC.cloth, 0.1, 1); } } });
  // cabeza: una cuchilla enorme con medialuna en el filo y un pico atrás
  const h0 = HAFT - 30, h1 = HAFT - 6;
  const blade = B([at(h0, -2), at(h0 - 5, -11), at(h0 - 9, -22), at(h0 + 2, -26), at((h0 + h1) / 2 + 2, -27.5), at(h1 + 2, -23), at(h1 + 3, -12), at(h1, -2), at(h1 - 2, 3), at(h1 + 3, 8), at(h1 - 5, 7), at(h0 + 6, 3)]);
  const bp = spline(blade, true, 5, blade.map((_, i) => i === 2 || i === 6 || i === 9));
  parts.push({ pts: bp, z, fill: BC.iron, shade: BC.ironS, shadeW: 3.2, deep: BC.ironD, deepW: 8, rim: BC.ironR, rimW: 0.7, hl: '#e6f4ff', hlW: 0.9, hatch: 1.8, hatchC: 'rgba(16,18,28,0.6)', line: 0.8,
    deco: (cx) => {
      // óxido y mellas
      stroke(cx, [at(h0 + 2, -16), at(h0 + 9, -21), at(h0 + 14, -19)], 2.2, 0.4, 'rgba(140,72,40,0.6)', 0.4);
      stroke(cx, [at(h1 - 5, -8), at(h1 - 2, -14)], 1.4, 0.3, 'rgba(140,72,40,0.5)', 0.4);
      // filo brillante
      const e: V[] = [at(h0 - 8, -22), at(h0 + 2, -25.6), at((h0 + h1) / 2 + 2, -27), at(h1 + 2, -22.6)];
      stroke(cx, e, 0.9, 0.4, '#f2fbff', 0.3);
      // el filo arde un poco
      stroke(cx, [at(h0 - 7, -21), at(h0 + 2, -24.6), at((h0 + h1) / 2 + 2, -26), at(h1 + 1, -22)], 0.8, 0.3, BC.ember, 0.3);
    },
    glowDraw: (g) => {
      g.globalAlpha = 0.6 + 0.4 * Math.sin(o.t * 2.3) + num(P, 'gl');
      stroke(g, [at(h0 - 7, -21), at(h0 + 2, -24.6), at((h0 + h1) / 2 + 2, -26), at(h1 + 1, -22)], 1.8, 0.6, BC.ember, 0.3);
    } });
  // abrazadera de la cabeza al mango
  parts.push({ pts: spline([at(h0 + 2, -3.4), at(h1 - 2, -3.4), at(h1 - 2, 3.4), at(h0 + 2, 3.4)], true, 2), z: z + 0.1, fill: BC.ironD, shade: '#141820', shadeW: 1, line: 0.5,
    deco: (cx) => { cx.fillStyle = '#9aa6b6'; for (const t of [h0 + 6, h1 - 6]) { const q = at(t, 0); cx.beginPath(); cx.arc(q[0], q[1], 0.9, 0, 6.3); cx.fill(); } } });
}

function pathOfPts(pts: V[]) { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) p.lineTo(q[0], q[1]); p.closePath(); return p; }
