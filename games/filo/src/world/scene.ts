// «Cementerio de filos»: el escenario del kit, pintado por capas a distintas profundidades.
// Cada capa se describe como se ve desde la cámara de referencia (REF): el renderer la ubica en z
// según su parallax. El sol está arriba a la derecha, detrás: contraluz y bordes iluminados.
import { type V, fbm, noise1, vnorm, vsub, perp, lerp, spline, mulberry } from '../draw/curves.ts';
import { Paint, rough, ridge, rgb, mix, scl, type RGB } from './paint.ts';
import type { Layer } from '../gl/renderer.ts';

const SUN: [number, number] = [0.62, 0.78];
const PROF = new URLSearchParams(location.search).has('prof'); // dirección hacia la luz (y arriba)

export interface SceneDef { layers: Layer[]; lantern: V; ground: number }

export function buildScene(q = 1): SceneDef {
  const layers: Layer[] = [];
  const add = (id: string, label: string, P: Paint, p: number, o: Partial<Layer> = {}) => {
    layers.push({ id, label, canvas: P.cv, p, rect: P.rect(), ...o });
  };
  const T = <X>(n: string, f: () => X): X => { const t = performance.now(); const r = f(); if (PROF) console.log('paint ' + n + ' ' + (performance.now() - t).toFixed(0) + 'ms'); return r; };
  const far = T('far', () => paintFar(q)), trees = T('trees', () => paintTrees(q)), arches = T('arches', () => paintArches(q)), chains = T('chains', () => paintChains(q));
  const mid = T('mid', () => paintMid(q)), ground = T('ground', () => paintGround(q)), fg = T('fg', () => paintFG(q)), front = T('front', () => paintFront(q));
  add('far', 'Agujas de la catedral', far.base, 0.16, { fog: 0.42, mist: 0.3 });
  add('farGlow', 'Ventanas', far.glow, 0.16, { zb: 0.1, tint: [1.6, 1.4, 1.2], add: true, fog: 0.1 });
  add('trees', 'Bosque muerto', trees, 0.3, { fog: 0.3, mist: 0.3 });
  add('arches', 'Columnata', arches, 0.5, { fog: 0.16, mist: 0.25 });
  add('chains', 'Cadenas', chains, 0.5, { zb: 0.1, sway: 0.004, fog: 0.16 });
  const atm = (id: string, label: string, p: number, rect: [number, number, number, number], o: Partial<Layer>) => layers.push({ id, label, canvas: null as unknown as HTMLCanvasElement, p, rect, ...o });
  atm('fog1', 'Niebla lejana', 0.4, [-700, -50, 700, 60], { kind: 'fog', k: 0.5, col: [0.3, 0.42, 0.44], speed: 0.004, seed: 1, zb: 0.5 });
  atm('shaft1', 'Haces de luz', 0.55, [-120, -40, 340, 260], { kind: 'shaft', k: 0.22, slant: 0.42, seed: 3, col: [1.0, 0.86, 0.62] });
  atm('shaft2', 'Haces de luz', 0.62, [-420, -40, -80, 250], { kind: 'shaft', k: 0.14, slant: 0.42, seed: 7, col: [0.8, 0.92, 1.0] });
  atm('fog2', 'Niebla baja', 0.85, [-700, -46, 700, 34], { kind: 'fog', k: 0.4, col: [0.22, 0.31, 0.33], speed: 0.008, seed: 4 });
  add('mid', 'Filos gigantes', mid.base, 0.72, { fog: 0.06, mist: 0.2, light: 0.25 });
  add('midGlow', 'Flores de luz', mid.glow, 0.72, { zb: 0.1, tint: [2.4, 2.4, 2.4], add: true });
  add('ground', 'Suelo', ground.base, 1, { mist: 0.08, light: 1 });
  add('groundGlow', 'Velas y farol', ground.glow, 1, { zb: 0.1, tint: [2.6, 2.4, 2.2], add: true });
  add('front', 'Pasto de adelante', front, 1.02, { light: 0.6 });
  add('fg', 'Primer plano', fg, 1.45, { blur: 1.1, light: 0.2 });
  return { layers, lantern: [178, 46], ground: 0 };
}

// ------------------------------------------------------------------ agujas lejanas (p 0.16)
function paintFar(q: number) {
  const P = new Paint(-560, -90, 560, 340, 1.1 * q, 11);
  const G = new Paint(-560, -90, 560, 340, 1.1 * q, 12);
  const lit: RGB = [170, 196, 184];
  // dos planos dentro de la capa: el más lejano más claro (bruma), el otro más oscuro
  const plane = (base: RGB, shapes: V[][], detail: (path: Path2D) => void, seed: number) => {
    const all = new Path2D();
    shapes.forEach((sh, i) => all.addPath(new Path2D(pathPts(rough(sh, 1.2, 0.07, seed + i)))));
    P.fill(all, rgb(base));
    P.brush(all, P.rect(), 1400, [rgb(scl(base, 0.85)), rgb(mix(base, lit, 0.12))], Math.PI / 2, [4, 12], [0.6, 1.4], 0.35, 0.12);
    detail(all);
    P.rim(all, SUN[0], SUN[1], 1.3, rgb(lit, 0.55));
    // pie hundido en la bruma
    P.vgrad(all, -40, 60, rgb(mix(base, [84, 112, 116], 0.7)), rgb(base, 0));
    return all;
  };
  const spire = (cx: number, base: number, w: number, h: number, roof: number, broken = false): V[] => {
    const top = base + h;
    const pts: V[] = [[cx - w / 2, -90], [cx - w / 2, top - 6], [cx - w / 2 - 2.5, top - 6], [cx - w / 2 - 1.6, top + 5], [cx - w * 0.4, top]];
    if (broken) pts.push([cx - w * 0.28, top + roof * 0.38], [cx - w * 0.08, top + roof * 0.22], [cx + w * 0.06, top + roof * 0.46], [cx + w * 0.22, top + roof * 0.2]);
    else pts.push([cx - w * 0.16, top + roof * 0.5], [cx - w * 0.04, top + roof * 0.92], [cx, top + roof], [cx + w * 0.04, top + roof * 0.92], [cx + w * 0.16, top + roof * 0.5]);
    pts.push([cx + w * 0.4, top], [cx + w / 2 + 1.6, top + 5], [cx + w / 2 + 2.5, top - 6], [cx + w / 2, top - 6], [cx + w / 2, -90]);
    // ventanas encendidas (pocas)
    for (let i = 0; i < 3; i++) {
      const y = top - 12 - i * 15;
      if (y < 14 || G.rnd() < 0.55) continue;
      const wx = cx + G.r(-w * 0.18, w * 0.18);
      G.glowDot(wx, y, 4, [255, 190, 110], 0.35);
      G.c.fillStyle = 'rgba(255,214,150,0.85)';
      G.c.beginPath(); G.c.moveTo(wx - 0.7, y - 2); G.c.lineTo(wx - 0.7, y + 1.5); G.c.lineTo(wx, y + 2.6); G.c.lineTo(wx + 0.7, y + 1.5); G.c.lineTo(wx + 0.7, y - 2); G.c.fill();
    }
    return pts;
  };
  // plano lejano: la ciudad catedral
  const backShapes: V[][] = [
    spire(-150, 0, 10, 70, 40), spire(-120, 0, 14, 96, 50), spire(-60, 0, 20, 118, 70), spire(-30, 0, 12, 92, 36, true), spire(-4, 0, 14, 80, 44),
    spire(200, 0, 10, 64, 34), spire(236, 0, 14, 76, 44, true), spire(-330, 0, 10, 60, 30), spire(-300, 0, 13, 72, 40),
    // naves con arbotantes escalonados
    [[-180, -90], [-180, 30], [-168, 38], [-160, 34], [-150, 44], [-138, 40], [-130, 50], [-90, 56], [-80, 50], [24, 50], [32, 40], [44, 36], [52, 26], [64, 20], [64, -90]],
    [[170, -90], [170, 22], [186, 30], [262, 30], [270, 16], [280, 12], [280, -90]],
    [[-360, -90], [-360, 18], [-344, 26], [-286, 26], [-276, 12], [-266, -90]],
    // puente roto
    [[64, 24], [120, 32], [146, 28], [148, 24], [122, 27], [64, 16]],
  ];
  plane([46, 70, 80], backShapes, (path) => {
    P.inside(path, () => {
      // contrafuertes y hileras de ventanas oscuras
      P.c.strokeStyle = 'rgba(20,34,40,0.5)'; P.c.lineWidth = 0.8;
      for (let x = -360; x < 290; x += 9) { P.c.beginPath(); P.c.moveTo(x, -20); P.c.lineTo(x + P.r(-0.5, 0.5), 40); P.c.stroke(); }
      P.c.fillStyle = 'rgba(16,28,34,0.55)';
      for (let x = -170; x < 60; x += 10) { P.c.fillRect(x, 26, 2.2, 8); P.c.beginPath(); P.c.arc(x + 1.1, 34, 1.1, 0, Math.PI); P.c.fill(); }
    });
  }, 3);
  // rosetón
  G.glowDot(-48, 40, 10, [255, 170, 90], 0.3);
  G.c.strokeStyle = 'rgba(255,200,140,0.75)'; G.c.lineWidth = 0.7;
  G.c.beginPath(); G.c.arc(-48, 40, 4.2, 0, Math.PI * 2); G.c.stroke();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; G.c.beginPath(); G.c.moveTo(-48, 40); G.c.lineTo(-48 + Math.cos(a) * 4.2, 40 + Math.sin(a) * 4.2); G.c.stroke(); }
  // plano cercano: colinas y murallas bajas, más oscuras
  const hills = ridge(-560, 560, -14, 18, 0.007, 4, 5);
  const wallsLow: V[] = [[-560, -90], ...hills.map(([x, y]) => [x, y + (Math.abs(x + 90) < 120 ? 8 + 4 * Math.sin(x * 0.4) * (Math.sin(x * 0.11) > 0 ? 1 : 0) : 0)] as V), [560, -90]];
  plane([30, 48, 56], [wallsLow], () => {}, 9);
  return { base: P, glow: G };
}
const pathPts = (pts: V[]) => {
  let s = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) s += `L${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  return s + 'Z';
};

// ------------------------------------------------------------------ bosque muerto (p 0.3)
function paintTrees(q: number) {
  const P = new Paint(-620, -100, 620, 380, 1.3 * q, 21);
  const col: RGB = [28, 46, 56], lit: RGB = [118, 160, 158], moss: RGB = [64, 90, 86];
  const xs = [-520, -400, -300, 270, 380, 500];
  const all = new Path2D();
  const twigs: [V[], number, number][] = [];
  for (let i = 0; i < xs.length; i++) {
    const x0 = xs[i] + P.r(-14, 14), w = P.r(16, 26), lean = P.r(-40, 40);
    const pts: V[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, y = lerp(-100, 400, t);
      pts.push([x0 + lean * t * t + noise1(t * 3, i * 7) * 8, y]);
    }
    const s = spline(pts, false, 6);
    const poly = trunk(s, w, w * 0.45, 1.6);
    all.addPath(new Path2D(pathPts(poly)));
    // ramas
    const nb = 4 + (P.rnd() * 3 | 0);
    for (let b = 0; b < nb; b++) {
      const t = P.r(0.3, 0.75), idx = Math.floor(t * (s.length - 1));
      const o = s[idx], side = b % 2 ? 1 : -1;
      branch(P, twigs, o, Math.PI / 2 + side * P.r(0.6, 1.3), P.r(50, 110), w * 0.42 * (1 - t * 0.4), 3, i * 31 + b);
    }
  }
  for (const [pts, w0, w1] of twigs) all.addPath(new Path2D(pathPts(trunk(spline(pts, false, 5), w0, w1))));
  P.fill(all, rgb(col));
  P.brush(all, P.rect(), 2500, [rgb(scl(col, 0.8)), rgb(mix(col, lit, 0.25))], Math.PI / 2, [6, 18], [0.6, 1.4], 0.35, 0.15);
  P.vgrad(all, -100, 140, rgb(mix(col, [96, 124, 124], 0.55)), rgb(col, 0));
  P.rim(all, SUN[0], SUN[1], 1.4, rgb(lit, 0.8));
  // musgo colgante de las ramas
  for (const [pts] of twigs) {
    if (P.rnd() < 0.5) continue;
    const a = pts[Math.floor(pts.length * P.r(0.3, 0.9))];
    for (let k = 0; k < 3; k++) {
      const x = a[0] + P.r(-6, 6), L = P.r(14, 46);
      P.stroke([[x, a[1]], [x + P.r(-2, 2), a[1] - L * 0.5], [x + P.r(-3, 3), a[1] - L]], 1.6, 0.2, rgb(moss, 0.75), 4);
    }
  }
  return P;
}
function trunk(s: V[], w0: number, w1: number, flare = 0): V[] {
  const N: V[] = [], n = s.length;
  for (let i = 0; i < n; i++) { const a = s[Math.max(0, i - 1)], b = s[Math.min(n - 1, i + 1)]; N.push(vnorm(perp(vsub(b, a)))); }
  const L: V[] = [], R: V[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), w = lerp(w0, w1, t) * 0.5 * (1 + 0.12 * noise1(t * 9, n)) * (1 + flare * Math.pow(Math.max(0, 1 - t / 0.14), 2));
    L.push([s[i][0] + N[i][0] * w, s[i][1] + N[i][1] * w]);
    R.push([s[i][0] - N[i][0] * w, s[i][1] - N[i][1] * w]);
  }
  return L.concat(R.reverse());
}
function branch(P: Paint, out: [V[], number, number][], o: V, ang: number, len: number, w: number, depth: number, seed: number) {
  const pts: V[] = [o];
  let a = ang, p = o;
  for (let k = 1; k <= 4; k++) {
    a += noise1(k * 0.7, seed) * 0.35;
    p = [p[0] + Math.cos(a) * len / 4, p[1] + Math.sin(a) * len / 4];
    pts.push(p);
  }
  out.push([pts, w, w * 0.25]);
  if (depth > 0) {
    const nb = 2;
    for (let i = 0; i < nb; i++) {
      const at = pts[1 + (P.rnd() * 3 | 0)];
      branch(P, out, at, a + (i ? 1 : -1) * P.r(0.4, 0.8), len * P.r(0.4, 0.6), w * 0.5, depth - 1, seed * 3 + i + 1);
    }
  }
}

// ------------------------------------------------------------------ columnata gótica (p 0.5)
function paintArches(q: number) {
  const P = new Paint(-680, -110, 680, 400, 1.6 * q, 31);
  const col: RGB = [20, 31, 39], lit: RGB = [150, 190, 176], dark: RGB = [11, 18, 24];
  const pillars = [-640, -480, -320, -160, 0, 160, 320, 480, 640];
  const pw = 18, spring = 70, top = 178;
  // el muro: una sola forma cuyo borde de abajo son los arcos ojivales (enjutas)
  const wall: V[] = [];
  for (let i = 0; i < pillars.length - 1; i++) {
    const xa = pillars[i] + pw / 2, xb = pillars[i + 1] - pw / 2, s = xb - xa, r = 0.62 * s;
    const cL: V = [xa + r, spring], cR: V = [xb - r, spring];
    const h = Math.sqrt(r * r - Math.pow(s / 2 - r, 2));
    const aL = Math.atan2(h, (xa + s / 2) - cL[0]), aR = Math.atan2(h, (xa + s / 2) - cR[0]);
    wall.push([xa - pw, spring]);
    for (let k = 0; k <= 14; k++) { const a = lerp(Math.PI, aL, k / 14); wall.push([cL[0] + Math.cos(a) * r, cL[1] + Math.sin(a) * r]); }
    for (let k = 1; k <= 14; k++) { const a = lerp(aR, 0, k / 14); wall.push([cR[0] + Math.cos(a) * r, cR[1] + Math.sin(a) * r]); }
  }
  wall.push([pillars[pillars.length - 1] + pw, spring]);
  const ridgeTop = ridge(-680, 680, top, 16, 0.012, 3, 4).reverse();
  wall.push(...ridgeTop.map(([x, y]) => [x, y] as V));
  const walls = new Path2D(pathPts(rough(wall, 1.4, 0.08, 5)));
  const shape = new Path2D();
  for (const x of pillars) {
    const p: V[] = [[x - pw / 2 - 5, -110], [x - pw / 2 - 5, -60], [x - pw / 2, -54], [x - pw / 2, spring - 6], [x - pw / 2 - 6, spring], [x - pw / 2 - 6, spring + 7],
      [x + pw / 2 + 6, spring + 7], [x + pw / 2 + 6, spring], [x + pw / 2, spring - 6], [x + pw / 2, -54], [x + pw / 2 + 5, -60], [x + pw / 2 + 5, -110]];
    shape.addPath(new Path2D(pathPts(rough(p, 0.8, 0.12, x))));
  }
  const all = new Path2D();
  all.addPath(walls); all.addPath(shape);
  P.fill(all, rgb(col));
  // hiladas de piedra
  P.inside(all, () => {
    P.c.strokeStyle = rgb(dark, 0.6); P.c.lineWidth = 0.7;
    for (let y = -100; y < 420; y += 11) {
      P.c.beginPath();
      for (let x = -680; x < 680; x += 6) { const yy = y + noise1(x * 0.05, y) * 0.7; if (x === -680) P.c.moveTo(x, yy); else P.c.lineTo(x, yy); }
      P.c.stroke();
      for (let x = -680 + ((y / 11) % 2) * 12; x < 680; x += 24 + P.r(-3, 3)) { P.c.beginPath(); P.c.moveTo(x, y); P.c.lineTo(x + P.r(-1, 1), y + 11); P.c.stroke(); }
    }
  });
  P.brush(all, P.rect(), 3500, [rgb(scl(col, 0.7)), rgb(mix(col, lit, 0.14))], Math.PI / 2, [4, 12], [0.7, 1.8], 0.3, 0.2);
  // la luz cae desde arriba: el muro se aclara hacia la cima; las columnas se pierden en la bruma abajo
  P.vgrad(walls, 90, 200, rgb(col, 0), rgb(mix(col, lit, 0.2), 0.55));
  P.vgrad(shape, -110, 40, rgb(mix(col, [60, 88, 92], 0.5), 0.8), rgb(col, 0));
  // intradós de los arcos: banda oscura con dovelas
  P.rim(walls, 0, -1, 5, rgb(dark, 0.55));
  P.rim(walls, SUN[0], SUN[1], 1.7, rgb(lit, 0.5));
  P.rim(shape, SUN[0], SUN[1], 1.5, rgb(lit, 0.45));
  // ruinas: mordiscos en la cima y un tramo caído
  P.c.save();
  P.c.globalCompositeOperation = 'destination-out';
  const bite = (x: number, y: number, rx: number, ry: number, seed: number) => {
    const pts: V[] = []; for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; pts.push([x + Math.cos(a) * rx * (1 + 0.35 * noise1(k * 0.9, seed)), y + Math.sin(a) * ry * (1 + 0.35 * noise1(k * 0.9, seed + 3))]); }
    P.c.fill(new Path2D(pathPts(rough(pts, 2, 0.15, seed))));
  };
  bite(250, 200, 70, 34, 1); bite(205, 168, 20, 16, 2); bite(600, 120, 110, 120, 7); bite(500, 150, 40, 40, 8); bite(-430, 192, 40, 22, 3); bite(-560, 185, 26, 14, 4); bite(520, 196, 50, 22, 5); bite(80, 184, 16, 10, 6);
  P.c.restore();
  // escombros sueltos en el hueco caído
  for (let i = 0; i < 6; i++) {
    const x = 210 + i * 14 + P.r(-4, 4), y = 160 - i * 3 + P.r(-6, 6), r = P.r(3, 6);
    const rk: V[] = []; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + P.r(0, 0.5); rk.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8]); }
    const rp = new Path2D(pathPts(rk));
    P.fill(rp, rgb(col)); P.rim(rp, SUN[0], SUN[1], 1, rgb(lit, 0.5));
  }
  // hiedra que cae del borde superior
  const rnd = mulberry(77);
  for (let x = -660; x < 660; x += 5 + rnd() * 9) {
    if (Math.abs(x - 250) < 70) continue;
    const ytop = top + fbm(x * 0.012, 0.5, 4, 3) * 16 - 4;
    const L = 6 + Math.pow(rnd(), 2.5) * 46;
    P.stroke([[x, ytop + 2], [x + (rnd() - 0.5) * 4, ytop - L * 0.5], [x + (rnd() - 0.5) * 8, ytop - L]], 2.2, 0.3, rgb(mix([26, 50, 46], [64, 100, 84], rnd() * 0.5), 0.9), 4);
  }
  return P;
}

function paintChains(q: number) {
  const P = new Paint(-680, -110, 680, 400, 1.6 * q, 41);
  const col = 'rgb(16,24,30)', lit = 'rgba(160,200,190,0.8)';
  const hang = (x: number, y0: number, len: number) => {
    const n = Math.floor(len / 6);
    for (let i = 0; i < n; i++) {
      const y = y0 - i * 6, ang = i % 2 ? 0 : 1;
      P.c.lineWidth = 1.6; P.c.strokeStyle = col;
      P.c.beginPath();
      if (ang) P.c.ellipse(x, y, 2.4, 4, 0, 0, Math.PI * 2); else P.c.ellipse(x, y, 0.9, 4, 0, 0, Math.PI * 2);
      P.c.stroke();
      if (ang) { P.c.strokeStyle = lit; P.c.lineWidth = 0.6; P.c.beginPath(); P.c.arc(x, y, 2.4, -0.3, 1.2); P.c.stroke(); }
    }
    // gancho o farolito apagado al final
    const ye = y0 - n * 6;
    P.c.fillStyle = col;
    P.c.beginPath(); P.c.moveTo(x - 5, ye); P.c.lineTo(x + 5, ye); P.c.lineTo(x + 3, ye - 10); P.c.lineTo(x - 3, ye - 10); P.c.closePath(); P.c.fill();
  };
  hang(-400, 172, 60); hang(-240, 160, 36); hang(-80, 174, 78); hang(80, 164, 30); hang(240, 170, 56); hang(400, 168, 44);
  return P;
}

// ------------------------------------------------------------------ filos gigantes y la máscara caída (p 0.72)
function paintMid(q: number) {
  const P = new Paint(-640, -120, 640, 380, 2.0 * q, 51);
  const G = new Paint(-640, -120, 640, 380, 2.0 * q, 52);
  const stone: RGB = [30, 40, 48], lit: RGB = [190, 214, 196], moss: RGB = [46, 72, 58];
  // lomas de escombros
  const mound = [[-640, -120], ...ridge(-640, 640, -24, 26, 0.008, 9, 4), [640, -120]] as V[];
  const mp = new Path2D(pathPts(rough(mound, 1.2, 0.1, 3)));
  P.fill(mp, rgb([20, 30, 34]));
  P.brush(mp, P.rect(), 1500, [rgb([28, 42, 44]), rgb([16, 24, 28])], 0.2, [4, 12], [1, 2], 0.4, 0.4);
  P.rim(mp, SUN[0], SUN[1], 1.5, rgb(lit, 0.45));
  // espadas clavadas: hoja, guarda, empuñadura y una tela rota
  const sword = (x: number, y: number, h: number, ang: number, w: number, cloth: boolean) => {
    const d: V = [Math.sin(ang), Math.cos(ang)], n: V = [d[1], -d[0]];
    const at = (t: number, o: number): V => [x + d[0] * t + n[0] * o, y + d[1] * t + n[1] * o];
    const blade: V[] = [at(-20, -w * 0.5), at(h * 0.72, -w * 0.5), at(h * 0.74, -w * 0.62), at(h * 0.74, w * 0.62), at(h * 0.72, w * 0.5), at(-20, w * 0.5)];
    // mella en el filo
    blade.splice(2, 0, at(h * 0.4, -w * 0.5), at(h * 0.42, -w * 0.3), at(h * 0.45, -w * 0.5));
    const guard: V[] = [at(h * 0.74, -w * 2.2), at(h * 0.77, -w * 2.4), at(h * 0.8, -w * 2.0), at(h * 0.8, w * 2.0), at(h * 0.77, w * 2.4), at(h * 0.74, w * 2.2)];
    const grip: V[] = [at(h * 0.8, -w * 0.3), at(h * 0.95, -w * 0.28), at(h * 0.95, w * 0.28), at(h * 0.8, w * 0.3)];
    const pom: V[] = []; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; pom.push(at(h * 0.98 + Math.sin(a) * w * 0.5, Math.cos(a) * w * 0.5)); }
    const all = new Path2D();
    for (const s of [blade, guard, grip, pom]) all.addPath(new Path2D(pathPts(rough(s, 0.5, 0.2, x | 0))));
    P.fill(all, rgb(stone));
    P.brush(all, P.rect(), 600, [rgb(scl(stone, 0.7)), rgb(mix(stone, lit, 0.15))], Math.PI / 2 - ang, [6, 20], [0.5, 1.2], 0.35, 0.08);
    // canal de la hoja
    P.stroke([at(0, 0), at(h * 0.6, 0)], w * 0.18, w * 0.1, rgb(scl(stone, 0.6)));
    P.rim(all, SUN[0], SUN[1], 1.6, rgb(lit, 0.85));
    P.vgrad(all, y - 30, y + 40, rgb(moss, 0.8), rgb(moss, 0));
    if (cloth) {
      // estandarte desgarrado colgando de la guarda
      const g0 = at(h * 0.76, -w * 2), g1 = at(h * 0.76, w * 1.6);
      const L = h * 0.45;
      const cl: V[] = [g0, g1, [g1[0] + 6, g1[1] - L * 0.7], [g1[0] - 2, g1[1] - L * 0.55], [g1[0] - 8, g1[1] - L], [lerp(g0[0], g1[0], 0.5) - 6, g1[1] - L * 0.6], [g0[0] - 4, g0[1] - L * 0.85], [g0[0] + 2, g0[1] - L * 0.4]];
      const cp = new Path2D(pathPts(rough(spline(cl, true, 4), 1, 0.2, 9)));
      P.fill(cp, 'rgb(84,22,34)');
      P.brush(cp, P.rect(), 300, ['rgb(60,14,26)', 'rgb(110,34,44)'], -Math.PI / 2, [6, 16], [0.6, 1.4], 0.4, 0.12);
      P.rim(cp, SUN[0], SUN[1], 1.2, 'rgba(255,140,110,0.7)');
    }
  };
  sword(-300, -30, 210, -0.14, 8, true);
  sword(-410, -40, 140, 0.22, 5.5, false);
  sword(-175, -36, 100, 0.3, 4.5, false);
  sword(410, -40, 170, -0.25, 6.5, false);
  sword(520, -30, 120, 0.12, 5, true);
  // la máscara caída: hueso gigante medio enterrado, con grietas y musgo
  const mx = 236, my = -26, R = 46;
  const mask: V[] = [];
  const M: V[] = [[-0.05, 1.0], [0.62, 0.78], [0.92, 0.2], [0.95, -0.26], [0.78, -0.66], [0.45, -1.18], [0.18, -0.92], [-0.2, -0.78], [-0.62, -0.3], [-0.78, 0.4]];
  const rot = 1.05;
  for (const [a, b] of M) { const x = a * R, y = b * R; mask.push([mx + x * Math.cos(rot) - y * Math.sin(rot), my + 30 + x * Math.sin(rot) + y * Math.cos(rot)]); }
  const mpath = new Path2D(pathPts(rough(spline(mask, true, 6), 1.2, 0.06, 4)));
  P.c.save();
  P.c.beginPath(); P.c.rect(-640, my - 6, 1280, 500); P.c.clip();
  P.fill(mpath, 'rgb(112,114,116)');
  P.brush(mpath, P.rect(), 900, ['rgb(92,98,104)', 'rgb(136,136,132)', 'rgb(80,88,96)'], 0.6, [5, 14], [0.8, 2], 0.35, 0.5);
  P.c.save(); P.c.clip(mpath);
  // sombra propia (el sol está atrás: casi toda la cara en sombra)
  const sh = new Path2D(); sh.rect(-640, -200, 1280, 600); sh.addPath(mpath, new DOMMatrix([1, 0, 0, 1, SUN[0] * 18, SUN[1] * 18]));
  P.c.fillStyle = 'rgba(30,42,56,0.78)'; P.c.fill(sh, 'evenodd');
  P.c.restore();
  // ojos y grietas
  const eye = (u: number, v: number, s: number) => {
    const x = u * R, y = v * R;
    const cx = mx + x * Math.cos(rot) - y * Math.sin(rot), cy = my + 30 + x * Math.sin(rot) + y * Math.cos(rot);
    P.c.fillStyle = 'rgb(10,14,18)';
    P.c.beginPath(); P.c.ellipse(cx, cy, 6 * s, 10 * s, rot + 0.15, 0, Math.PI * 2); P.c.fill();
  };
  eye(0.45, -0.05, 1.1); eye(-0.12, -0.08, 0.85);
  P.c.strokeStyle = 'rgb(30,36,42)'; P.c.lineWidth = 1.4;
  const crack = (pts: V[]) => { P.c.beginPath(); P.c.moveTo(...pts[0]); for (const p of pts.slice(1)) P.c.lineTo(...p); P.c.stroke(); };
  crack([[mx - 6, my + 62], [mx - 2, my + 48], [mx - 8, my + 38], [mx - 1, my + 22]]);
  crack([[mx + 26, my + 42], [mx + 20, my + 34], [mx + 24, my + 26]]);
  P.rim(mpath, SUN[0], SUN[1], 1.6, 'rgba(255,236,200,0.75)');
  P.vgrad(mpath, my, my + 40, rgb(moss, 0.9), rgb(moss, 0));
  P.c.restore();
  // rocas
  for (const [x, s] of [[-80, 16], [120, 22], [160, 12], [-520, 26], [600, 18]] as [number, number][]) {
    const rk: V[] = []; for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; rk.push([x + Math.cos(a) * s * (1 + 0.25 * noise1(k, x)), -26 + Math.max(-4, Math.sin(a) * s * 0.75)]); }
    const rp = new Path2D(pathPts(rough(rk, 0.8, 0.2, x)));
    P.fill(rp, rgb([26, 36, 42]));
    P.rim(rp, SUN[0], SUN[1], 1.6, rgb(lit, 0.5));
  }
  // flores de luz (cian) entre los escombros
  const fl = mulberry(5);
  for (let i = 0; i < 26; i++) {
    const x = -620 + fl() * 1240, y = -22 + fbm(x * 0.008, 0.5, 4, 9) * 26 + fl() * 6;
    const h = 6 + fl() * 10;
    P.stroke([[x, y - 2], [x + 1, y + h * 0.5], [x + (fl() - 0.5) * 4, y + h]], 0.9, 0.3, 'rgb(30,60,58)', 3);
    G.glowDot(x, y + h, 7, [110, 255, 230], 0.55);
    G.c.fillStyle = 'rgba(200,255,245,0.95)';
    G.c.beginPath(); G.c.arc(x + (fl() - 0.5) * 2, y + h, 1.2, 0, Math.PI * 2); G.c.fill();
  }
  return { base: P, glow: G };
}

// ------------------------------------------------------------------ el suelo (p 1)
function paintGround(q: number) {
  const P = new Paint(-760, -340, 760, 120, 2.6 * q, 61);
  const G = new Paint(-760, -340, 760, 120, 2.6 * q, 62);
  const earth: RGB = [11, 14, 19], stone: RGB = [30, 37, 45], lit: RGB = [190, 214, 196], moss: RGB = [52, 86, 66];
  // cuerpo de tierra/roca
  const top = (x: number) => Math.abs(x) < 300 ? 0 : (fbm(x * 0.01, 0.2, 3, 5) + 0.1) * 10 * Math.min(1, (Math.abs(x) - 300) / 120);
  const body: V[] = [[-760, -340]];
  for (let x = -760; x <= 760; x += 4) body.push([x, top(x)]);
  body.push([760, -340]);
  const bp = new Path2D(pathPts(body));
  P.fill(bp, rgb(earth));
  P.brush(bp, P.rect(), 5000, [rgb([18, 23, 29]), rgb([7, 10, 13]), rgb([22, 28, 32])], 0.15, [4, 14], [1, 2.6], 0.4, 0.5);
  // estratos de roca en la cara del barranco
  for (let k = 0; k < 7; k++) {
    const y0 = -22 - k * 26 - P.r(0, 8);
    const st = ridge(-760, 760, y0, 6, 0.02, 30 + k, 6);
    P.stroke(st, 1.6, 1.6, rgb([26, 32, 38], 0.6), 1);
    P.stroke(st.map(([x, y]) => [x, y + 1.4] as V), 0.8, 0.8, rgb([6, 8, 11], 0.7), 1);
  }
  // raíces que cuelgan en la cara del barranco
  const rr = mulberry(9);
  for (let i = 0; i < 40; i++) {
    const x = -740 + rr() * 1480, y = -14 - rr() * 30, L = 20 + rr() * 60;
    P.stroke([[x, y], [x + (rr() - 0.5) * 16, y - L * 0.5], [x + (rr() - 0.5) * 26, y - L]], 2.4, 0.3, rgb([22, 26, 28], 0.95), 5);
  }
  // losas de piedra en el borde de arriba (irregulares)
  let x = -760;
  const slabs = new Path2D();
  while (x < 760) {
    const w = 26 + P.rnd() * 30, h = 10 + P.rnd() * 7;
    const y0 = top(x + w / 2);
    const s: V[] = [[x + 1, y0], [x + w - 1, y0 + P.r(-0.8, 0.4)], [x + w + P.r(-1, 2), y0 - h * P.r(0.6, 1)], [x + w * 0.5, y0 - h - P.r(0, 3)], [x + P.r(-1, 2), y0 - h * P.r(0.7, 1)]];
    slabs.addPath(new Path2D(pathPts(rough(s, 0.5, 0.25, x | 0))));
    x += w + P.r(0.5, 2);
  }
  P.fill(slabs, rgb(stone));
  P.brush(slabs, P.rect(), 3000, [rgb(scl(stone, 0.75)), rgb(mix(stone, lit, 0.12))], 0, [3, 9], [0.6, 1.4], 0.35, 0.3);
  P.vgrad(slabs, -18, 0, rgb(earth, 0.9), rgb(earth, 0));
  P.rim(slabs, 0.15, 1, 1.2, rgb(lit, 0.42));
  // musgo y pasto sobre el borde
  const gr = mulberry(13);
  for (let xx = -760; xx < 760; xx += 0.9 + gr() * 2.2) {
    const yb = top(xx) - 0.5, h = 2 + Math.pow(gr(), 2.2) * 9, lean = (gr() - 0.4) * 3;
    const c = mix(moss, [120, 160, 120], gr() * 0.5);
    P.stroke([[xx, yb], [xx + lean * 0.5, yb + h * 0.6], [xx + lean, yb + h]], 1.3, 0.1, rgb(c, 0.95), 3);
  }
  // musgo colgando del borde
  for (let xx = -760; xx < 760; xx += 3 + gr() * 6) {
    const L = 2 + Math.pow(gr(), 3) * 14;
    P.stroke([[xx, top(xx) - 1], [xx + (gr() - 0.5) * 2, top(xx) - 1 - L]], 2.0, 0.4, rgb(mix(moss, [30, 50, 40], 0.5), 0.9), 3);
  }
  // utilería: columna rota, lápidas, el farol
  const pillar: V[] = [[-198, -1], [-197, 30], [-195, 44], [-189, 48], [-184, 44], [-176, 52], [-170, 47], [-166, 38], [-164, 30], [-163, -1]];
  const pp = new Path2D(pathPts(rough(spline(pillar, true, 3, pillar.map((_, i) => i > 1 && i < 8)), 0.4, 0.3, 2)));
  P.fill(pp, rgb([34, 42, 50]));
  P.inside(pp, () => {
    // estrías con su luz
    for (let k = 0; k < 5; k++) {
      const x = -195 + k * 7.6;
      P.stroke([[x, 0], [x + 0.3, 50]], 2.2, 2.2, 'rgba(14,20,24,0.55)');
      P.stroke([[x + 1.6, 0], [x + 1.9, 50]], 0.9, 0.9, 'rgba(120,140,140,0.25)');
    }
  });
  P.brush(pp, P.rect(), 300, ['rgb(22,28,34)', 'rgb(56,66,72)'], Math.PI / 2, [2, 7], [0.5, 1], 0.4, 0.1);
  P.vgrad(pp, 0, 14, rgb(moss, 0.75), rgb(moss, 0));
  P.rim(pp, SUN[0], SUN[1], 1.4, rgb(lit, 0.55));
  // capitel caído al lado
  const cap: V[] = [[-160, -1], [-158, 7], [-150, 9], [-140, 8], [-136, 3], [-138, -1]];
  const cp = new Path2D(pathPts(rough(cap, 0.4, 0.3, 4)));
  P.fill(cp, rgb([30, 38, 46])); P.rim(cp, SUN[0], SUN[1], 1.1, rgb(lit, 0.5));
  P.stroke([[-157, 4.5], [-139, 4]], 0.8, 0.8, 'rgba(10,14,18,0.7)');
  for (const [gx, gh, gw, cross] of [[-252, 22, 8, 1], [-232, 15, 6, 0], [236, 18, 7, 0], [292, 26, 5, 1]] as [number, number, number, number][]) {
    const t: V[] = [];
    if (cross) {
      // cruz de piedra torcida
      t.push([gx - 1.6, -1], [gx - 1.6, gh * 0.62], [gx - gw, gh * 0.64], [gx - gw, gh * 0.78], [gx - 1.6, gh * 0.8], [gx - 1.4, gh], [gx + 1.6, gh], [gx + 1.6, gh * 0.8], [gx + gw, gh * 0.78], [gx + gw, gh * 0.64], [gx + 1.6, gh * 0.62], [gx + 1.6, -1]);
    } else {
      t.push([gx - gw, -1], [gx - gw, gh * 0.62]);
      for (let k = 0; k <= 8; k++) { const a = Math.PI - k / 8 * Math.PI; t.push([gx + Math.cos(a) * gw, gh * 0.62 + Math.sin(a) * gh * 0.38]); }
      t.push([gx + gw, -1]);
    }
    const ang = (gx % 7) * 0.02;
    const tr = t.map(([x, y]) => [gx + (x - gx) * Math.cos(ang) - y * Math.sin(ang), (x - gx) * Math.sin(ang) + y * Math.cos(ang)] as V);
    const tp = new Path2D(pathPts(rough(tr, 0.35, 0.3, gx)));
    P.fill(tp, rgb([36, 44, 52]));
    P.brush(tp, P.rect(), 160, ['rgb(24,30,36)', 'rgb(58,68,74)'], Math.PI / 2, [2, 6], [0.5, 1], 0.4, 0.2);
    P.vgrad(tp, -1, 8, rgb(moss, 0.8), rgb(moss, 0));
    P.rim(tp, SUN[0], SUN[1], 1.1, rgb(lit, 0.6));
    if (!cross) P.stroke([[gx - gw * 0.5, gh * 0.55], [gx + gw * 0.5, gh * 0.55]], 0.7, 0.7, 'rgba(10,14,18,0.8)');
  }
  // velas encendidas
  for (const [vx, vh] of [[-236, 5], [-228, 3.5], [-176, 4], [248, 4.5], [258, 3]] as [number, number][]) {
    P.c.fillStyle = 'rgb(218,206,180)'; P.c.fillRect(vx - 0.8, 0, 1.6, vh);
    G.glowDot(vx, vh + 2, 10, [255, 170, 80], 0.6);
    G.c.fillStyle = 'rgba(255,236,190,1)';
    G.c.beginPath(); G.c.ellipse(vx, vh + 1.8, 0.7, 1.6, 0, 0, Math.PI * 2); G.c.fill();
  }
  // farol: poste curvo con el farol colgando
  const lx = 178;
  P.stroke([[lx + 14, 0], [lx + 15, 30], [lx + 12, 58], [lx + 2, 66], [lx - 4, 62]], 3.2, 2, 'rgb(14,16,20)');
  P.stroke([[lx - 1, 61.5], [lx, 54]], 0.8, 0.8, 'rgb(14,16,20)');
  const lant: V[] = [[lx - 5, 53], [lx + 5, 53], [lx + 4, 40], [lx + 2, 38], [lx - 2, 38], [lx - 4, 40]];
  P.fill(lant, 'rgb(14,16,20)');
  G.glowDot(lx, 46, 40, [255, 150, 60], 0.45);
  G.glowDot(lx, 46, 12, [255, 200, 120], 0.9);
  G.c.fillStyle = 'rgba(255,230,170,1)'; G.c.fillRect(lx - 2.6, 41, 5.2, 9);
  P.c.strokeStyle = 'rgb(14,16,20)'; P.c.lineWidth = 0.8;
  for (const dx of [-2.6, 0, 2.6]) { P.c.beginPath(); P.c.moveTo(lx + dx, 41); P.c.lineTo(lx + dx, 50); P.c.stroke(); }
  return { base: P, glow: G };
}

// pasto bajo delante de los pies (p 1.02)
function paintFront(q: number) {
  const P = new Paint(-760, -60, 760, 40, 2.6 * q, 71);
  const gr = mulberry(17);
  for (let x = -760; x < 760; x += 2 + gr() * 7) {
    if (Math.abs(x) < 300 && gr() < 0.55) continue;
    const n = 2 + (gr() * 4 | 0);
    for (let k = 0; k < n; k++) {
      const h = 3 + Math.pow(gr(), 2) * 10, lean = (gr() - 0.5) * 6, xx = x + (gr() - 0.5) * 3;
      P.stroke([[xx, -3], [xx + lean * 0.4, -3 + h * 0.6], [xx + lean, -3 + h]], 1.4, 0.1, rgb(mix([20, 36, 30], [70, 110, 84], gr() * 0.6)), 3);
    }
  }
  // borde iluminado de la losa frontal
  return P;
}

// ------------------------------------------------------------------ primer plano oscuro (p 1.45)
function paintFG(q: number) {
  const P = new Paint(-420, -160, 420, 300, 1.2 * q, 81);
  const col: RGB = [5, 9, 12], lit: RGB = [90, 130, 120];
  // lomas oscuras en las esquinas de abajo
  const ml: V[] = [[-420, -160], [-420, 0], ...ridge(-420, -170, -30, 18, 0.03, 3, 3).map(([x, y]) => [x, y + Math.max(0, (-210 - x) * 0.25) - Math.max(0, (x + 215) * 0.9)] as V), [-150, -100], [-150, -160]];
  const mr: V[] = [[420, -160], [420, -10], ...ridge(190, 420, -40, 16, 0.03, 5, 3).reverse().map(([x, y]) => [x, y + Math.max(0, (x - 230) * 0.2) - Math.max(0, (225 - x) * 0.9)] as V), [170, -160]];
  const shapes = new Path2D();
  shapes.addPath(new Path2D(pathPts(rough(ml, 1.5, 0.08, 1))));
  shapes.addPath(new Path2D(pathPts(rough(mr, 1.5, 0.08, 2))));
  P.fill(shapes, rgb(col));
  const gr = mulberry(23);
  const blades = (x0: number, x1: number, yAt: (x: number) => number, hmax: number) => {
    for (let x = x0; x < x1; x += 1.5 + gr() * 3.5) {
      const h = 8 + Math.pow(gr(), 1.6) * hmax, lean = (gr() - 0.5) * 18, y = yAt(x);
      P.stroke([[x, y - 5], [x + lean * 0.3, y + h * 0.5], [x + lean, y + h]], 4.2, 0.4, rgb(col), 4);
    }
  };
  blades(-420, -200, (x) => -30 + Math.max(0, (-210 - x) * 0.25) + fbm(x * 0.03, 0.5, 4, 3) * 18, 44);
  blades(215, 420, (x) => -40 + Math.max(0, (x - 230) * 0.2) + fbm(x * 0.03, 0.5, 4, 5) * 16, 38);
  const fern = (x: number, y: number, s: number, a: number) => {
    const spine: V[] = []; for (let k = 0; k <= 8; k++) { const t = k / 8; spine.push([x + Math.cos(a) * s * t + t * t * s * 0.3 * Math.sign(Math.cos(a)), y + Math.sin(a) * s * t - t * t * s * 0.3]); }
    P.stroke(spine, 3.4, 0.8, rgb(col));
    for (let k = 1; k < 8; k++) {
      const p = spine[k], L = s * 0.32 * (1 - k / 9);
      for (const sd of [-1, 1]) P.stroke([p, [p[0] + Math.cos(a + sd * 1.1) * L * 0.6, p[1] + Math.sin(a + sd * 1.1) * L * 0.6 + L * 0.1], [p[0] + Math.cos(a + sd * 1.35) * L, p[1] + Math.sin(a + sd * 1.35) * L - L * 0.25]], 4.4, 0.4, rgb(col), 3);
    }
  };
  fern(-262, -14, 60, 0.95); fern(-230, -30, 44, 0.55); fern(262, -24, 54, 2.25); fern(236, -38, 36, 2.7);
  // ramas y hojas que cuelgan arriba en las esquinas
  const vine = (x: number, L: number, ph: number) => {
    const pts: V[] = []; for (let k = 0; k <= 7; k++) pts.push([x + Math.sin(k * 0.9 + ph) * 5, 300 - L * k / 7]);
    P.stroke(pts, 5, 1.2, rgb(col));
    for (let k = 1; k < 7; k++) {
      const p = pts[k], s = 1 - k / 9;
      // hojas: gotas anchas
      for (const sd of [1, -1]) {
        const tip: V = [p[0] + sd * 12 * s, p[1] - 10 * s];
        const leaf: V[] = [p, [p[0] + sd * 6 * s, p[1] + 2], tip, [p[0] + sd * 3 * s, p[1] - 7 * s]];
        P.fill(spline(leaf, true, 4, [true, false, true, false]), rgb(col));
      }
    }
  };
  vine(-258, 120, 0); vine(-228, 90, 1.3); vine(-196, 56, 2.1); vine(250, 130, 0.6); vine(214, 80, 2.4);
  // rama gruesa que cruza la esquina de arriba a la izquierda
  P.stroke([[-300, 226], [-250, 236], [-210, 256], [-170, 300]], 12, 5, rgb(col));
  P.stroke([[300, 210], [262, 232], [224, 270], [210, 300]], 13, 6, rgb(col));
  P.rim(shapes, SUN[0], SUN[1], 1.6, rgb(lit, 0.45));
  return P;
}

export { fbm };
