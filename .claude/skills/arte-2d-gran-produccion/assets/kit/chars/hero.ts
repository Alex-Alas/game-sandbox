// LA ERRANTE: máscara de hueso, capucha y capa carmesí con cola de cinta, piernas finas y un filo curvo.
// Proporciones de heroína de acción estilizada (la cabeza es un tercio del alto: se lee de lejos).
import { type V, vadd, vsub, vscale, vrot, vnorm, perp, vlen, lerp, spline, taper, limb, boil, ik2, crescent, clamp, smooth } from '../draw/curves.ts';
import { type Part, stroke } from '../draw/ink.ts';
import { type Pose, type Clip, num, vec, Chain, Springs } from '../rig.ts';
import type { CharDef, DrawOpts } from './types.ts';
import { HERO_CLIPS } from './hero-clips.ts';

const THIGH = 13.2, SHIN = 14, TORSO = 15.5, UPPER = 9.4, FORE = 9, BLADE = 48;

export const HC = {
  ink: '#140c1c',
  mask: '#efe7d8', maskS: '#bdb0c6', maskD: '#8e7fa4', maskR: '#9fd4e0', maskH: '#fffbf2',
  hood: '#b8263a', hoodS: '#6d1532', hoodD: '#420b25', hoodR: '#5fb7c8', hoodH: '#ff7a5e',
  inner: '#1c0a18',
  body: '#2b2238', bodyS: '#191222', bodyR: '#5b86a8',
  boot: '#211a2c', bootS: '#120c19',
  wrap: '#cdbfae', wrapS: '#8a7d8f',
  steel: '#e6edf5', steelS: '#8f9db3', steelD: '#5d6a82', steelR: '#bdf2ff',
  ember: '#ffb054', emberHot: '#fff0c8',
  sash: '#d9a441', sashS: '#8a5a22',
};

// Pose de reposo (todas las claves existen acá; los clips solo dicen lo que cambia)
export const HERO_BASE: Pose = {
  x: 0, y: 0, sq: 1,
  hip: [-1, -25.5], lean: 0.14, head: -0.06,
  hf: [9.5, -17.5], hb: [-6, -18], ef: 1, eb: 1,
  ff: [6.5, 0], fb: [-7.5, 0], tf: 0, tb: 0,
  bl: 0.55, bz: 1, eye: 1, cl: 0, sm: 0, smR: 0,
  rb: 0, rot: 0, yw: 0, gl: 0, dk: 0, fl: 1,
};

export interface HeroPhys { tail: Chain; hem: Springs; sash: Chain }

// Marcos del cuerpo a partir de la pose
function frames(P: Pose) {
  const y0 = num(P, 'y');
  const lean = num(P, 'lean'), headA = lean + num(P, 'head');
  const hp = vec(P, 'hip');
  const hip: V = [hp[0], hp[1] + y0];
  const u = vrot([0, -1], lean), r = vrot([1, 0], lean);
  const T = (a: number, b: number): V => [hip[0] + r[0] * a + u[0] * b, hip[1] + r[1] * a + u[1] * b];
  const neck = T(0, TORSO);
  const hu = vrot([0, -1], headA), hr = vrot([1, 0], headA);
  const hc: V = [neck[0] + hu[0] * 10.5, neck[1] + hu[1] * 10.5];
  const H = (a: number, b: number): V => [hc[0] + hr[0] * a - hu[0] * b, hc[1] + hr[1] * a - hu[1] * b];
  const C = (a: number, b: number): V => [neck[0] + r[0] * a - u[0] * b, neck[1] + r[1] * a - u[1] * b];
  return { y0, lean, hip, u, r, T, neck, hc, H, C, hr, hu };
}

// Ruedo de la capa en reposo (marco del cuello: a = adelante, b = abajo), de adelante hacia atrás
function hemRest(P: Pose): V[] {
  const { C } = frames(P);
  const fl = num(P, 'cl');
  return [
    C(6.2, 16 - fl * 2),
    C(1.6 - fl * 3, 21.5 - fl * 3),
    C(-3.6 - fl * 6, 25.5 - fl * 4),
    C(-9 - fl * 8, 21.5 - fl * 6),
    C(-15 - fl * 10, 23 - fl * 8),
  ];
}
const tailAnchor = (P: Pose) => frames(P).H(-13, -4.5);
const tailRest = (P: Pose): V => vnorm(vrot([-0.75, 0.66], num(P, 'lean') * 0.5));

export const hero: CharDef<HeroPhys> = {
  id: 'errante', name: 'La Errante', desc: 'Heroína ágil de filo curvo: combos de tres golpes, torbellino, estocada y tajo cargado.',
  box: [-96, -124, 96, 44],
  base: HERO_BASE,
  clips: HERO_CLIPS as Record<string, Clip>,
  order: Object.keys(HERO_CLIPS),
  ink: { ink: HC.ink, ol: 0.85, olShadow: 0.7, rimC: 'rgba(96,186,206,0.62)', rimW: 0.62 },
  phys(P) {
    const tail = new Chain(9, 3.9, tailAnchor(P), tailRest(P), 380, 2.4, 0.04);
    const hem = new Springs(hemRest(P), 260, 9, 3.6, 46, 14);
    const { T } = frames(P);
    const sash = new Chain(5, 2.6, T(-3.6, 3), [-0.6, 0.8], 300, 3, 0.05);
    return { tail, hem, sash };
  },
  step(ph, P, dt, shift, fv, t) {
    ph.tail.step(tailAnchor(P), tailRest(P), dt, shift, fv, t);
    ph.hem.step(hemRest(P), dt, shift, fv, t);
    const { T } = frames(P);
    ph.sash.step(T(-3.6, 3), vnorm([-0.5, 1]), dt, shift, fv, t + 0.7);
  },
  mirror(ph) { ph.tail.mirror(); ph.hem.mirror(); ph.sash.mirror(); },
  weapon(P) {
    const g = geom(P);
    return { a: g.bladeA, b: g.bladeB };
  },
  parts(P, ph, o) { return heroParts(P, ph, o); },
  bones(P) {
    const g = geom(P);
    return [[g.hip, g.neck, g.hc], [g.shF, g.armF.mid, g.armF.end], [g.shB, g.armB.mid, g.armB.end], [g.hipF, g.legF.mid, g.legF.end], [g.hipB, g.legB.mid, g.legB.end], [g.bladeA, g.bladeB]];
  },
};

function geom(P: Pose) {
  const F = frames(P);
  const { T, C, y0 } = F;
  const shF = C(2.2, 2.6), shB = C(-2.6, 3.0);
  const hand = (k: string): V => { const h = vec(P, k); return [h[0], h[1] + y0]; };
  const armF = ik2(shF, hand('hf'), UPPER, FORE, num(P, 'ef', 1) >= 0 ? 1 : -1, 1.12);
  const armB = ik2(shB, hand('hb'), UPPER, FORE, num(P, 'eb', 1) >= 0 ? 1 : -1, 1.12);
  const hipF = T(1.3, 0.2), hipB = T(-1.5, 0.6);
  const foot = (k: string): V => { const h = vec(P, k); return [h[0], h[1] + y0 - 2.2]; };
  const legF = ik2(hipF, foot('ff'), THIGH, SHIN, -1, 1.1);
  const legB = ik2(hipB, foot('fb'), THIGH, SHIN, -1, 1.1);
  const bl = num(P, 'bl');
  const bd: V = [Math.cos(bl), Math.sin(bl)];
  const fd = vnorm(vsub(armF.end, armF.mid));
  const fist = vadd(armF.end, vscale(fd, 1.4));
  const bladeA = vadd(fist, vscale(bd, 2.8)), bladeB = vadd(fist, vscale(bd, 2.8 + BLADE));
  return { ...F, shF, shB, armF, armB, hipF, hipB, legF, legB, bd, fist, bladeA, bladeB };
}

function heroParts(P: Pose, ph: HeroPhys, o: DrawOpts): Part[] {
  const G = geom(P);
  const { T, H, C, hr, hu } = G;
  let id = 0;
  const B = (pts: V[]) => boil(pts, o.boil, o.seed, ++id);
  const parts: Part[] = [];
  const eye = clamp(num(P, 'eye', 1), 0.1, 1);
  const rb = num(P, 'rb'); // de espaldas (torbellino)
  const lightCloak = { shade: HC.hoodS, shadeW: 3.2, deep: HC.hoodD, deepW: 7, rim: HC.hoodR, rimW: 0.9, hl: HC.hoodH, hlW: 0.7, hatch: 1.5, hatchC: 'rgba(30,6,20,0.85)' };

  // ---------- cola de la capucha (cinta) ----------
  {
    const c = spline(B(ph.tail.p.map((v) => [v[0], v[1]] as V)), false, 5);
    const poly = taper(c, (t, side) => {
      const w = lerp(2.6, 0.2, Math.pow(t, 0.7)) * (1 + 0.15 * Math.sin(t * 12 + o.t * 6));
      return w * (side > 0 ? 1 : 0.85);
    });
    parts.push({ pts: poly, z: -2, fill: HC.hood, ...lightCloak, deepW: 4, line: 0.5,
      deco: (cx) => {
        // costura central de la cinta
        const mid = c.filter((_, i) => i > 2 && i < c.length - 4);
        if (mid.length > 2) stroke(cx, mid, 0.5, 0.1, HC.hoodD);
      } });
  }

  // ---------- forro de la capa (se ve cuando vuela) ----------
  const hem = ph.hem.p;
  const capePts = (inset: number): V[] => {
    const pts: V[] = [
      C(3.6, -0.4), C(7.2, 3.6), C(7.6 - inset, 9.8),
      hem[0], hem[1], hem[2],
      vlerp(hem[2], hem[3], 0.5, 1.6), hem[3],
      vlerp(hem[3], hem[4], 0.45, 1.2), hem[4],
      C(-11.4 + inset, 8.4), C(-7.2, 1.0), C(-2.8, -1.4),
    ];
    return pts;
  };
  {
    const pts = B(capePts(0));
    const sharp = pts.map((_, i) => i === 5 || i === 9 || i === 3);
    const lining = spline(pts.map((v, i) => i >= 3 && i <= 9 ? vadd(v, [-1.2, 1.2]) : v), true, 6, sharp);
    parts.push({ pts: lining, z: 0, fill: HC.hoodD, shade: HC.inner, shadeW: 2.5, line: 0.6 });
  }

  // ---------- brazo de atrás ----------
  armPart(parts, B, G.shB, G.armB.mid, G.armB.end, 1, false);

  // ---------- pierna de atrás ----------
  legPart(parts, B, G.hipB, G.legB.mid, G.legB.end, num(P, 'tb'), 2, true);

  // ---------- torso ----------
  {
    const pts = B([T(3.0, -1.4), T(3.4, 5.2), T(4.1, 10.2), T(2.4, 14.6), T(-2.4, 14.9), T(-4.3, 10), T(-3.5, 4.4), T(-3.8, -1.8)]);
    const poly = spline(pts, true, 6);
    parts.push({ pts: poly, z: 3, fill: HC.body, shade: HC.bodyS, shadeW: 2.6, rim: HC.bodyR, rimW: 0.7, line: 0.7,
      deco: (cx) => {
        // faja dorada y su borla
        stroke(cx, [T(-4.6, 3.6), T(0, 2.6), T(4.6, 1.8)], 2.6, 2.2, HC.sash, 0.1);
        stroke(cx, [T(-4.6, 2.4), T(0, 1.6), T(4.6, 0.9)], 0.7, 0.5, HC.sashS, 0.1);
      } });
    // cinta de la faja (física)
    const s = spline(B(ph.sash.p.map((v) => [v[0], v[1]] as V)), false, 4);
    parts.push({ pts: taper(s, (t, side) => (side > 0 ? 1 : 0.7) * lerp(1.1, 0.25, t) * (1 + 0.3 * Math.sin(t * 9))), z: 2.5, fill: HC.hood, shade: HC.hoodD, shadeW: 0.9, line: 0.45 });
  }

  // ---------- pierna de adelante ----------
  legPart(parts, B, G.hipF, G.legF.mid, G.legF.end, num(P, 'tf'), 4, false);

  // ---------- capa ----------
  {
    const pts = B(capePts(0));
    const sharp = pts.map((_, i) => i === 5 || i === 9 || i === 3);
    const poly = spline(pts, true, 6, sharp);
    parts.push({ pts: poly, z: 5, fill: HC.hood, ...lightCloak, line: 0.8,
      deco: (cx) => {
        // pliegues: caen del hombro hacia cada punta del ruedo
        const top = C(-1.5, 1.5);
        for (const [k, w] of [[1, 1.3], [2, 1.6], [3, 1.2], [4, 1.5]] as [number, number][]) {
          const h = hem[k];
          const m = vlerp(top, h, 0.55, k % 2 ? 1.5 : -1.2);
          stroke(cx, [vlerp(top, h, 0.18, 0), m, vlerp(top, h, 0.92, 0)], 0.15, w, HC.hoodS, 0.7);
        }
        // ribete del ruedo
        const band = spline([hem[0], hem[1], hem[2], hem[3], hem[4]], false, 6).map((v) => vadd(v, [0.3, -1.6]));
        stroke(cx, band, 1.1, 1.1, HC.hoodD, 0.05);
        // brillo del hombro
        stroke(cx, [C(5.6, 3.4), C(2, 1.2), C(-3.5, 1.4)], 1.4, 0.2, HC.hoodH, 0.3);
      } });
  }

  // ---------- capucha + máscara ----------
  {
    const hood = B([H(8.6, -9.6), H(1.6, -15.2), H(-7.4, -14.1), H(-12.6, -9.2), H(-14.6, -6.2), H(-13.2, 0.4), H(-10.4, 7.8), H(-4.6, 12.6), H(3.2, 11.2), H(9.4, -1.5)]);
    parts.push({ pts: spline(hood, true, 6, hood.map((_, i) => i === 4)), z: 6, fill: HC.hood, ...lightCloak, shadeW: 3.6, line: 0.8,
      deco: (cx) => { stroke(cx, [H(6, -11.6), H(0, -14.2), H(-8, -12.6), H(-11.6, -7)], 1.6, 0.2, HC.hoodH, 0.2); } });
    // hueco oscuro de la capucha alrededor de la cara
    const cav = B([H(8.9, -9.2), H(1.4, -12.6), H(-6.4, -10.8), H(-9.4, -3.4), H(-8.2, 4.4), H(-3.6, 10.6), H(3.6, 13.2), H(10.2, 4.2)]);
    parts.push({ pts: spline(cav, true, 6), z: 6.5, fill: HC.inner, outline: false });
    // máscara
    const m = B([H(-0.6, -11.2), H(6.6, -8.8), H(9.8, -2.6), H(10.2, 2.4), H(8.4, 7.2), H(5.4, 12.6), H(2.2, 10.4), H(-2.2, 8.6), H(-6.6, 3.6), H(-7.6, -5.2)]);
    const mpts = spline(m, true, 6, m.map((_, i) => i === 5));
    parts.push({ pts: mpts, z: 7, fill: HC.mask, shade: HC.maskS, shadeW: 2.1, hatch: 1.5, hatchL: 2.6, hatchC: 'rgba(70,45,100,0.5)', deep: HC.maskD, deepW: 5, rim: HC.maskR, rimW: 0.75, hl: HC.maskH, hlW: 0.9, line: 0.75,
      deco: (cx) => {
        // la marca: una franja carmesí que baja de la frente, atraviesa el ojo de adelante y se afina en la mejilla
        stroke(cx, [H(3.2, -11.6), H(3.9, -8.6), H(4.5, -5.6)], 2.3, 1.2, HC.hood, 0.1);
        stroke(cx, [H(5.4, 4.6), H(5.6, 7.2), H(5.0, 10.4)], 1.5, 0.12, HC.hood, 0.1);
        // borde de hueso gastado (una muesca chica arriba atrás)
        stroke(cx, [H(-6.8, -6.2), H(-5.4, -5.4), H(-5.8, -4.2)], 0.5, 0.2, HC.maskD, 0.2);
      },
      after: (cx) => {
        // ojos: almendras inclinadas, se entrecierran al atacar
        const eyeShape = (cxy: V, w: number, h: number, tilt: number): V[] => {
          const hh = h * eye;
          const top = -hh * 0.55, bot = h * 0.45;
          const pts: V[] = [[0, top], [w * 0.55, top * 0.4], [w * 0.5, bot * 0.6], [0, bot], [-w * 0.5, bot * 0.5], [-w * 0.45, top * 0.5]];
          return spline(pts.map((q) => vadd(cxy, rot2(q, tilt, hr, hu))), true, 5, [true, false, false, true, false, false]);
        };
        const eF = eyeShape(H(4.8, 0.4), 3.6, 6.2, 0.18), eB = eyeShape(H(-2.2, 0.2), 2.5, 5.6, 0.1);
        cx.fillStyle = HC.ink;
        cx.fill(pathOfL(eF)); cx.fill(pathOfL(eB));
        // pupila de brasa y un brillo chico
        cx.fillStyle = HC.ember;
        const pu = H(5.2, 1.4 + (1 - eye) * -1);
        cx.beginPath(); cx.ellipse(pu[0], pu[1], 0.9, 1.2 * eye + 0.2, 0, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = HC.emberHot;
        const gl = H(5.6, 0.6 - (1 - eye));
        cx.beginPath(); cx.arc(gl[0], gl[1], 0.35, 0, Math.PI * 2); cx.fill();
      },
      glowDraw: (g) => {
        const pu = H(5.2, 1.4 + (1 - eye) * -1);
        g.fillStyle = HC.ember;
        g.beginPath(); g.ellipse(pu[0], pu[1], 1.1, 1.4 * eye + 0.3, 0, 0, Math.PI * 2); g.fill();
      } });
  }

  // ---------- filo (detrás o delante) ----------
  const bz = num(P, 'bz', 1) >= 0 ? 9 : 2.8;
  bladeParts(parts, B, P, G, bz, o);

  // ---------- brazo de adelante + puño ----------
  armPart(parts, B, G.shF, G.armF.mid, G.armF.end, 8.5, true);
  {
    const fd = vnorm(vsub(G.armF.end, G.armF.mid)), fn = perp(fd);
    const c = G.fist;
    const f = B([vadd(c, vadd(vscale(fd, -1.6), vscale(fn, -1.9))), vadd(c, vadd(vscale(fd, 1.9), vscale(fn, -1.6))),
      vadd(c, vadd(vscale(fd, 2.3), vscale(fn, 1.2))), vadd(c, vadd(vscale(fd, -0.6), vscale(fn, 2.1))), vadd(c, vadd(vscale(fd, -2), vscale(fn, 0.6)))]);
    parts.push({ pts: spline(f, true, 5), z: 10, fill: HC.wrap, shade: HC.wrapS, shadeW: 1.4, line: 0.6 });
  }
  void rb;
  return parts;
}

// helpers de dibujo de piezas
function vlerp(a: V, b: V, t: number, off = 0): V {
  const p: V = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (!off) return p;
  const n = vnorm(perp(vsub(b, a)));
  return [p[0] + n[0] * off, p[1] + n[1] * off];
}
function rot2(q: V, tilt: number, hr: V, hu: V): V {
  const r = vrot(q, tilt);
  return [hr[0] * r[0] - hu[0] * r[1], hr[1] * r[0] - hu[1] * r[1]];
}
function pathOfL(pts: V[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

function legPart(parts: Part[], B: (p: V[]) => V[], hip: V, knee: V, ankle: V, toeA: number, z: number, back: boolean) {
  const j = B([hip, knee, ankle]);
  // atrás (izquierda de la marcha) va la pantorrilla; adelante, el muslo
  const poly = limb(j, [2.2, 1.25, 0.8], [2.3, 1.15, 0.85], 7, (t, side) => {
    if (side > 0) return 0.75 * Math.exp(-Math.pow((t - 0.68) / 0.1, 2));   // pantorrilla
    return 0.5 * Math.exp(-Math.pow((t - 0.2) / 0.12, 2));                  // muslo
  });
  const dk = back ? 0.82 : 1;
  parts.push({ pts: poly, z, fill: shadeHex(HC.body, dk), shade: HC.bodyS, shadeW: 1.8, rim: HC.bodyR, rimW: 0.6, line: 0.6 });
  // bota con punta (de una pieza con la pierna gracias al contorno global)
  const a = ankle, R = (x: number, y: number): V => vadd(a, vrot([x, y], toeA));
  const boot = B([R(-1.2, -3.6), R(-1.7, 0.4), R(-0.9, 2.1), R(2.6, 1.9), R(5.6, 1.7), R(7.6, 0.4), R(4.6, 0.2), R(1.5, -1.1), R(1.0, -3.8)]);
  parts.push({ pts: spline(boot, true, 5, [false, false, false, false, false, true, false, false, false]), z: z + 0.1, fill: shadeHex(HC.boot, dk), shade: HC.bootS, shadeW: 1.2, rim: HC.bodyR, rimW: 0.5, line: 0.6,
    deco: (cx) => { stroke(cx, [R(-2, -2.6), R(0, -2.9), R(1.8, -3.2)], 0.7, 0.7, HC.wrapS, 0.1); } });
}

function armPart(parts: Part[], B: (p: V[]) => V[], sh: V, el: V, wr: V, z: number, front: boolean) {
  const j = B([sh, el, wr]);
  const poly = limb(j, [1.75, 1.05, 0.85], [1.7, 1.1, 0.9], 6, (t, side) => side < 0 ? 0.35 * Math.exp(-Math.pow((t - 0.7) / 0.12, 2)) : 0);
  const dk = front ? 1 : 0.8;
  parts.push({ pts: poly, z, fill: shadeHex(HC.body, dk), shade: HC.bodyS, shadeW: 1.5, rim: HC.bodyR, rimW: 0.6, line: 0.6,
    deco: (cx) => {
      // vendas del antebrazo
      const d = vnorm(vsub(wr, el)), n = perp(d);
      for (let i = 0; i < 3; i++) {
        const c = vlerp(el, wr, 0.45 + i * 0.2);
        stroke(cx, [vadd(c, vscale(n, -2)), vadd(vadd(c, vscale(d, 1.1)), vscale(n, 2))], 0.65, 0.65, front ? HC.wrap : HC.wrapS, 0.1, 1);
      }
    } });
  if (!front) {
    // mano de atrás: un puño chico
    const d = vnorm(vsub(wr, el)), n = perp(d), c = vadd(wr, vscale(d, 1.2));
    const f = B([vadd(c, vscale(n, -1.6)), vadd(c, vscale(d, 1.8)), vadd(c, vscale(n, 1.6)), vadd(c, vscale(d, -1.5))]);
    parts.push({ pts: spline(f, true, 5), z: z + 0.1, fill: HC.wrapS, shade: HC.bodyS, shadeW: 1, line: 0.5 });
  }
}

function bladeParts(parts: Part[], B: (p: V[]) => V[], P: Pose, G: ReturnType<typeof geom>, z: number, o: DrawOpts) {
  const bd = G.bd, bn = perp(bd), f = G.fist;
  const sm = num(P, 'sm');
  // smear: la hoja barre una medialuna desde donde estaba (cuadros rápidos, como en la animación a mano)
  if (Math.abs(sm) > 0.05) {
    const a1 = Math.atan2(bd[1], bd[0]), a0 = a1 - sm;
    const r1 = 3 + BLADE, r0 = 9 + num(P, 'smR');
    const pts = crescent(f, r1, a0, a1, (t) => (r1 - r0) * Math.pow(smooth(t), 1.4), 30);
    parts.push({ pts, z: z - 0.2, fill: '#f6f2ff', outline: true, olw: 0.9, line: 0, glow: 'rgba(255,190,120,0.55)',
      deco: (cx) => {
        // núcleo carmesí hacia adentro y estrías de velocidad
        const inner = crescent(f, r1 - 4, a0 + sm * 0.25, a1, (t) => (r1 - r0 - 8) * Math.pow(t, 2), 24);
        cx.fillStyle = 'rgba(255,120,90,0.55)';
        cx.fill(pathOfL(inner));
        for (let i = 0; i < 4; i++) {
          const rr = r0 + (r1 - r0) * (0.25 + i * 0.18), aa = a0 + sm * (0.35 + i * 0.08);
          const pts2: V[] = [];
          for (let k = 0; k <= 8; k++) { const a = lerp(aa, a1 - sm * 0.05, k / 8); pts2.push([f[0] + Math.cos(a) * rr, f[1] + Math.sin(a) * rr]); }
          stroke(cx, pts2, 0.1, 0.7, 'rgba(120,70,140,0.5)', 0.8);
        }
      } });
  }
  // hoja curva: lomo y filo, punta aguda
  const pts: V[] = [], N = 14;
  const curve = (t: number) => -2.6 * Math.sin(Math.PI * t * 0.9) * t;
  const spine: V[] = [], edge: V[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = lerp(2.3, 0.9, t) * (t > 0.86 ? (1 - t) / 0.14 : 1);
    const c = vadd(f, vadd(vscale(bd, 2.8 + BLADE * t), vscale(bn, curve(t))));
    spine.push(vadd(c, vscale(bn, -w * 0.45)));
    edge.push(vadd(c, vscale(bn, w * 0.55)));
  }
  pts.push(...spine, ...edge.reverse().slice(1));
  const glow = clamp(o.glow, 0, 1);
  parts.push({ pts: B(pts), z, fill: HC.steel, shade: HC.steelS, shadeW: 0.9, rim: HC.steelR, rimW: 0.35, line: 0.5, olw: 0.95,
    deco: (cx) => {
      // vaceo (canal del lomo)
      const g: V[] = [];
      for (let i = 1; i <= 10; i++) { const t = i / 14; g.push(vadd(f, vadd(vscale(bd, 2.8 + BLADE * t), vscale(bn, curve(t) - 0.2)))); }
      stroke(cx, g, 0.6, 0.2, HC.steelD, 0.1);
      // filo de brasa
      if (glow > 0.01) {
        const e: V[] = [];
        for (let i = 0; i <= 13; i++) { const t = i / 14; e.push(vadd(f, vadd(vscale(bd, 2.8 + BLADE * t), vscale(bn, curve(t) + 0.8)))); }
        stroke(cx, e, 0.9 * glow + 0.3, 0.2, HC.ember, 0.2);
      }
    },
    glowDraw: glow > 0.01 ? (g) => {
      g.globalAlpha = glow;
      g.fillStyle = HC.ember;
      g.fill(pathOfL(pts));
    } : undefined });
  // guarda y empuñadura
  const guard = B([vadd(f, vadd(vscale(bd, 2.2), vscale(bn, -2.4))), vadd(f, vadd(vscale(bd, 3.4), vscale(bn, -2.2))),
    vadd(f, vadd(vscale(bd, 3.4), vscale(bn, 2.4))), vadd(f, vadd(vscale(bd, 2.2), vscale(bn, 2.6)))]);
  parts.push({ pts: spline(guard, true, 3), z: z + 0.1, fill: HC.sash, shade: HC.sashS, shadeW: 0.8, line: 0.5 });
  const grip = taper([vadd(f, vscale(bd, -4.6)), vadd(f, vscale(bd, 2.4))], () => 0.95);
  parts.push({ pts: grip, z: z - 0.1, fill: HC.hoodD, line: 0.4,
    deco: (cx) => { for (let i = 0; i < 3; i++) { const c = vadd(f, vscale(bd, -3.6 + i * 1.6)); stroke(cx, [vadd(c, vscale(bn, -1)), vadd(vadd(c, vscale(bd, 0.8)), vscale(bn, 1))], 0.5, 0.5, HC.hood, 0.1, 1); } } });
  const pom = vadd(f, vscale(bd, -5.2));
  parts.push({ pts: spline([vadd(pom, [-1.1, 0]), vadd(pom, [0, -1.1]), vadd(pom, [1.1, 0]), vadd(pom, [0, 1.1])], true, 4), z: z + 0.05, fill: HC.sash, shade: HC.sashS, shadeW: 0.6, line: 0.4 });
  void pts; void vlen;
}

export function shadeHex(hex: string, k: number): string {
  if (k === 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
export { smooth };
