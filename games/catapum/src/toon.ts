// Personajes cabezones (chibi) dibujados en código. Coordenadas del personaje: metros, y hacia arriba, pies en (0, 0)
// y mirando hacia +x (render.ts espeja con scale(face, 1) y aplica el estirón y los giros). Sin estado: todo sale de
// la pose (tiempo, velocidad, suelo…), así el mismo dibujo sirve en la partida, en los menús y en las fichas del HUD.
// Proporciones: la cabeza (radio HEAD_R) es la mitad del alto y lleva la identidad de cada uno (mecha, coleta, casco,
// cuernos, gorra, capucha), que tiene que leerse a 25 px de alto.

export type Pose = {
  t: number,               // s (animación)
  seed: number,            // desfasa el parpadeo y el balanceo entre jugadores
  vx: number, vy: number,  // m/s; vx en el sentido en que mira (+ = hacia adelante)
  ground: boolean, crouch: boolean,
  stun: boolean,           // aturdido: ojos en cruz
  dmg: number,             // % (con mucho, preocupado y transpirando)
  dash: boolean,           // dash, barrida o picada: cara de esfuerzo
  happy?: boolean,         // retratos: sonrisa grande
};
export const HEAD_R = 0.4, HEAD_Y = 0.8;
export const INK = '#1a1222';
const TAU = Math.PI * 2;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); }
function ink(ctx: CanvasRenderingContext2D, fill: string, lw = 0.05) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
// Línea gruesa con borde de tinta (brazos, piernas, bufanda)
function limb(ctx: CanvasRenderingContext2D, pts: [number, number][], w: number, col: string) {
  ctx.lineCap = 'round', ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = INK; ctx.lineWidth = w + 0.09; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  ctx.lineCap = 'butt', ctx.lineJoin = 'miter';
}
// Esfera con sombra abajo atrás y brillo arriba adelante (la luz viene de arriba y de frente)
function sphere(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, base: string, shade: string, hi = 'rgba(255,255,255,0.45)') {
  ell(ctx, x, y, r, r);
  ctx.fillStyle = shade; ctx.fill();
  ctx.save(); ctx.clip();
  ell(ctx, x + r * 0.08, y + r * 0.12, r * 0.96, r * 0.94); ctx.fillStyle = base; ctx.fill();
  ell(ctx, x + r * 0.28, y + r * 0.5, r * 0.3, r * 0.18, -0.5); ctx.fillStyle = hi; ctx.fill();
  ctx.restore();
  ell(ctx, x, y, r, r); ctx.lineWidth = 0.055; ctx.strokeStyle = INK; ctx.stroke();
}

// ---- Cara ------------------------------------------------------------------------------------------------------
type FaceOpt = { x: number, y: number, sep?: number, size?: number, sharp?: boolean, lashes?: boolean, mouth?: [number, number] | null, blush?: boolean };
function face(ctx: CanvasRenderingContext2D, P: Pose, o: FaceOpt) {
  const sep = o.sep ?? 0.17, sz = o.size ?? 1, t = P.t + P.seed * 1.37;
  const blink = !P.stun && (t % 3.3) < 0.11;
  const lx = clamp(P.vx / 14, -1, 1) * 0.025, ly = clamp(P.vy / 14, -1, 1) * 0.025;
  const fierce = P.dash && !P.stun, worried = P.dmg > 110 && !P.stun && !fierce;
  const eyes: [number, number, number][] = [[o.x - sep / 2, o.y, 0.86], [o.x + sep / 2, o.y, 1]]; // el de atrás, un poco más chico
  ctx.lineCap = 'round';
  for (const [ex, ey, k] of eyes) {
    const rx = 0.075 * sz * k, ry = (o.sharp ? 0.07 : 0.1) * sz * k;
    if (P.stun) {
      ctx.strokeStyle = INK; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.moveTo(ex - rx, ey - rx); ctx.lineTo(ex + rx, ey + rx); ctx.moveTo(ex - rx, ey + rx); ctx.lineTo(ex + rx, ey - rx); ctx.stroke();
    } else if (blink || P.happy) { // ojos cerrados (o felices: arquitos)
      ctx.strokeStyle = INK; ctx.lineWidth = 0.04;
      ctx.beginPath();
      if (P.happy) ctx.arc(ex, ey - ry * 0.3, rx, 0.15 * Math.PI, 0.85 * Math.PI);
      else { ctx.moveTo(ex - rx, ey); ctx.quadraticCurveTo(ex, ey - ry * 0.5, ex + rx, ey); }
      ctx.stroke();
    } else {
      ell(ctx, ex, ey, rx, ry); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 0.035; ctx.strokeStyle = INK; ctx.stroke();
      const pr = Math.min(rx, ry) * 0.68;
      ell(ctx, ex + rx * 0.22 + lx, ey - ry * 0.05 + ly, pr, pr * (o.sharp ? 0.9 : 1.12)); ctx.fillStyle = INK; ctx.fill();
      ell(ctx, ex + rx * 0.4 + lx, ey + ry * 0.3 + ly, pr * 0.36, pr * 0.36); ctx.fillStyle = '#fff'; ctx.fill();
      if (o.lashes) { ctx.strokeStyle = INK; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(ex + rx * 0.7, ey + ry * 0.7); ctx.lineTo(ex + rx * 1.25, ey + ry * 1.05); ctx.stroke(); }
    }
    // cejas: de esfuerzo (hacia el centro) o preocupadas (hacia afuera); las filosas siempre un poco
    if (fierce || worried || o.sharp) {
      const d = fierce || (o.sharp && !worried) ? 1 : -1, inner = ex > o.x ? -1 : 1, by = ey + ry + 0.05;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(ex - rx * inner * 1.1, by + 0.025 * d); ctx.lineTo(ex + rx * inner * 1.1, by - 0.03 * d); ctx.stroke();
    }
  }
  if (o.blush !== false) {
    ctx.fillStyle = 'rgba(255,90,120,0.35)';
    ell(ctx, o.x - sep / 2 - 0.05, o.y - 0.12, 0.06, 0.035); ctx.fill();
    ell(ctx, o.x + sep / 2 + 0.06, o.y - 0.12, 0.06, 0.035); ctx.fill();
  }
  if (o.mouth) {
    const [mx, my] = o.mouth;
    ctx.strokeStyle = INK; ctx.lineWidth = 0.035;
    if (P.stun || worried) { ell(ctx, mx, my - 0.01, 0.035, P.stun ? 0.05 : 0.03); ctx.fillStyle = '#5a1020'; ctx.fill(); ctx.stroke(); }
    else if (fierce || P.happy || (!P.ground && P.vy > 4)) { // boca abierta
      ctx.beginPath(); ctx.moveTo(mx - 0.06, my + 0.015); ctx.quadraticCurveTo(mx, my - 0.1, mx + 0.06, my + 0.015); ctx.closePath();
      ctx.fillStyle = '#5a1020'; ctx.fill(); ctx.stroke();
      ell(ctx, mx, my - 0.045, 0.025, 0.012); ctx.fillStyle = '#ff7a8a'; ctx.fill();
    } else { ctx.beginPath(); ctx.arc(mx, my + 0.04, 0.05, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke(); }
  }
  if (worried) { // gota de sudor
    const k = (P.t * 1.6 + P.seed) % 1;
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.beginPath(); ctx.moveTo(-0.3, 0.3 - k * 0.12); ctx.quadraticCurveTo(-0.36, 0.2 - k * 0.12, -0.3, 0.17 - k * 0.12); ctx.quadraticCurveTo(-0.24, 0.2 - k * 0.12, -0.3, 0.3 - k * 0.12);
    ink(ctx, '#9fe0ff', 0.025); ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'butt';
}

// ---- Cabezas (origen = centro de la cabeza) ---------------------------------------------------------------------
// back: lo que va detrás de la cabeza (coleta, bufanda, cintas); head: la cabeza y la cara
type Toon = {
  body: string, bodyD: string, hand: string, shoe: string, leg: string,
  back?: (ctx: CanvasRenderingContext2D, P: Pose) => void,
  head: (ctx: CanvasRenderingContext2D, P: Pose) => void,
  chest?: (ctx: CanvasRenderingContext2D, P: Pose) => void, // detalle del torso (cinturón, campana, pañuelo)
};

// Viento sobre lo que cuelga: hacia atrás con la carrera y hacia arriba al caer
const drift = (P: Pose): [number, number] => [-0.6 - clamp(P.vx, -12, 20) * 0.045, -0.5 - clamp(P.vy, -20, 20) * 0.03];
// Cinta que flamea: de (x, y) hacia el viento, con onda
function ribbon(ctx: CanvasRenderingContext2D, P: Pose, x: number, y: number, len: number, w: number, col: string, ph = 0) {
  const [dx, dy] = drift(P), n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n, pts: [number, number][] = [];
  for (let k = 0; k <= 4; k++) {
    const s = k / 4 * len, wv = Math.sin(P.t * 11 + k * 1.3 + ph + P.seed) * 0.05 * k / 4;
    pts.push([x + ux * s - uy * wv, y + uy * s + ux * wv]);
  }
  limb(ctx, pts, w, col);
}

const TOONS: Record<string, Toon> = {
  // BOMBÍN: la cabeza es una bomba naranja con tapa de metal y mecha encendida
  bombin: {
    body: '#9c3a12', bodyD: '#6e2509', hand: '#ffffff', shoe: '#3a2a1a', leg: '#5a2410',
    head(ctx, P) {
      ctx.save(); ctx.rotate(0.35); // tapa y mecha, inclinadas hacia atrás
      ctx.beginPath(); ctx.roundRect(-0.12, 0.3, 0.24, 0.17, 0.03); ink(ctx, '#7a7f8c');
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-0.07, 0.33, 0.04, 0.12);
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
      const sw = Math.sin(P.t * 5 + P.seed) * 0.03;
      ctx.beginPath(); ctx.moveTo(0, 0.47); ctx.quadraticCurveTo(0.1, 0.6, -0.05 + sw, 0.7); ctx.stroke(); ctx.lineCap = 'butt';
      const fl = Math.floor(P.t * 18 + P.seed) % 2, r = 0.07 + fl * 0.025;
      star(ctx, -0.05 + sw, 0.72, r, r * 0.45, 6, fl ? '#ffe14a' : '#ff9a3c');
      ell(ctx, -0.05 + sw, 0.72, 0.03, 0.03); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
      sphere(ctx, 0, 0, HEAD_R, '#ff7a3d', '#d0531c', 'rgba(255,230,200,0.6)');
      face(ctx, P, { x: 0.15, y: -0.01, mouth: [0.19, -0.19] });
    },
    chest(ctx) { ctx.fillStyle = INK; ctx.fillRect(-0.21, 0.24, 0.42, 0.06); ctx.fillStyle = '#ffd23f'; ctx.fillRect(0.05, 0.235, 0.08, 0.07); },
  },
  // LÍA: coleta turquesa que se sacude, antiparras en el pelo
  lia: {
    body: '#2fb5ae', bodyD: '#137a74', hand: '#ffd9b8', shoe: '#3a2f4f', leg: '#3a2f4f',
    back(ctx, P) {
      const [dx, dy] = drift(P), sw = Math.sin(P.t * 7 + P.seed) * 0.12, a = Math.atan2(dy - 0.3, dx) + sw;
      const ax = -0.3, ay = 0.24, L = 0.52, tx = ax + Math.cos(a) * L, ty = ay + Math.sin(a) * L;
      const nx = -Math.sin(a), ny = Math.cos(a), mx = (ax + tx) / 2, my = (ay + ty) / 2;
      ctx.beginPath(); ctx.moveTo(ax + nx * 0.08, ay + ny * 0.08);
      ctx.quadraticCurveTo(mx + nx * 0.2, my + ny * 0.2, tx, ty);
      ctx.quadraticCurveTo(mx - nx * 0.12, my - ny * 0.12, ax - nx * 0.08, ay - ny * 0.08);
      ctx.closePath(); ink(ctx, '#3fd0c9');
      ctx.strokeStyle = '#137a74'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx + nx * 0.05, my + ny * 0.05, tx, ty); ctx.stroke();
      ell(ctx, ax, ay, 0.065, 0.065); ink(ctx, '#ff5ab0', 0.035);
    },
    head(ctx, P) {
      sphere(ctx, 0, 0, HEAD_R, '#ffd9b8', '#f0b28e');
      face(ctx, P, { x: 0.16, y: -0.05, lashes: true, mouth: [0.2, -0.22] });
      // pelo: casquete con flequillo en punta
      ctx.beginPath();
      ctx.arc(0, 0, HEAD_R + 0.025, 0.3, Math.PI + 0.75, false);
      ctx.quadraticCurveTo(-0.2, 0.0, -0.02, 0.17);
      ctx.lineTo(0.06, 0.07); ctx.lineTo(0.13, 0.17); ctx.lineTo(0.22, 0.06); ctx.lineTo(0.28, 0.16); ctx.lineTo(0.37, 0.1);
      ctx.closePath(); ink(ctx, '#3fd0c9');
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, 0.05, 0.33, 0.13, 0.04, -0.15); ctx.fill();
      // antiparras sobre el pelo
      limb(ctx, [[-0.36, 0.2], [0.3, 0.3]], 0.05, '#3a2f4f');
      ell(ctx, 0.22, 0.31, 0.085, 0.07, -0.2); ink(ctx, '#ffb43a', 0.04);
      ell(ctx, 0.2, 0.33, 0.03, 0.02, -0.2); ctx.fillStyle = '#fff6d8'; ctx.fill();
    },
    chest(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(0.04, 0.48); ctx.lineTo(0.04, 0.16); ctx.stroke(); ell(ctx, 0.04, 0.4, 0.025, 0.025); ctx.fillStyle = '#cfd8dc'; ctx.fill(); },
  },
  // TURBO: casco de carreras con visera, rayo al costado y bufanda larga
  turbo: {
    body: '#ffd23f', bodyD: '#c99a00', hand: '#2b2b33', shoe: '#e84a5f', leg: '#2b2b33',
    back(ctx, P) { ribbon(ctx, P, -0.12, -0.34, 0.35 + Math.min(0.45, Math.abs(P.vx) * 0.03 + (P.ground ? 0 : 0.15)), 0.1, '#e84a5f'); },
    head(ctx, P) {
      sphere(ctx, 0, 0, HEAD_R, '#ffd23f', '#d9a400', 'rgba(255,255,230,0.75)');
      ctx.save(); ell(ctx, 0, 0, HEAD_R - 0.02, HEAD_R - 0.02); ctx.clip();
      ctx.beginPath(); ctx.moveTo(-0.3, 0.2); ctx.lineTo(-0.12, 0.2); ctx.lineTo(-0.2, 0.06); ctx.lineTo(-0.04, 0.06); ctx.lineTo(-0.3, -0.2); ctx.lineTo(-0.2, -0.02); ctx.lineTo(-0.34, -0.02); ctx.closePath();
      ink(ctx, '#e84a5f', 0.03);
      ctx.beginPath(); ctx.roundRect(-0.02, -0.17, 0.5, 0.32, 0.13); ctx.fillStyle = '#1f2d5a'; ctx.fill(); ctx.lineWidth = 0.045; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = 'rgba(120,220,255,0.35)'; ctx.beginPath(); ctx.roundRect(0.02, 0.02, 0.4, 0.1, 0.05); ctx.fill();
      ctx.restore();
      face(ctx, P, { x: 0.18, y: -0.02, size: 0.9, blush: false });
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(0.3, 0.1); ctx.lineTo(0.36, 0.04); ctx.stroke();
    },
    chest(ctx) { ctx.fillStyle = INK; ctx.fillRect(-0.03, 0.14, 0.07, 0.36); },
  },
  // MUU: vaca con manchas, cuernitos, hocico rosado y campana
  muu: {
    body: '#f7f4ec', bodyD: '#cfc7b8', hand: '#4a3b30', shoe: '#4a3b30', leg: '#f7f4ec',
    back(ctx, P) {
      const fl = Math.sin(P.t * 4 + P.seed) * 0.08;
      for (const [x, y, r] of [[-0.38, 0.12, 0.5 + fl], [0.36, 0.2, -0.3 - fl]] as [number, number, number][]) {
        ell(ctx, x, y, 0.17, 0.085, r); ink(ctx, '#f7f4ec');
        ell(ctx, x + Math.sign(x) * 0.02, y, 0.1, 0.04, r); ctx.fillStyle = '#ffb3c6'; ctx.fill();
      }
      for (const [x, d] of [[-0.14, -1], [0.16, 1]]) { // cuernitos
        ctx.beginPath(); ctx.moveTo(x - 0.06, 0.3); ctx.quadraticCurveTo(x + d * 0.02, 0.46, x + d * 0.08, 0.52); ctx.quadraticCurveTo(x + d * 0.06, 0.4, x + 0.06, 0.3);
        ctx.closePath(); ink(ctx, '#f1e2b8', 0.04);
      }
    },
    head(ctx, P) {
      sphere(ctx, 0, 0, HEAD_R, '#f7f4ec', '#d6cfc0');
      ctx.save(); ell(ctx, 0, 0, HEAD_R - 0.025, HEAD_R - 0.025); ctx.clip(); ctx.fillStyle = '#2b2b2b';
      ell(ctx, -0.24, 0.18, 0.17, 0.13, 0.5); ctx.fill(); ell(ctx, 0.06, 0.34, 0.1, 0.07, -0.3); ctx.fill(); ell(ctx, -0.28, -0.22, 0.09, 0.07); ctx.fill();
      ctx.restore();
      face(ctx, P, { x: 0.13, y: 0.08, size: 0.9, sep: 0.16, mouth: null, blush: false });
      ell(ctx, 0.19, -0.18, 0.22, 0.15, 0.1); ink(ctx, '#ffb3c6');
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ell(ctx, 0.2, -0.1, 0.1, 0.035, 0.1); ctx.fill();
      ctx.fillStyle = '#8a3a52'; ell(ctx, 0.12, -0.19, 0.03, 0.04); ctx.fill(); ell(ctx, 0.27, -0.18, 0.03, 0.04); ctx.fill();
      if (P.stun || P.dash) { ell(ctx, 0.2, -0.28, 0.04, 0.03); ctx.fillStyle = '#5a1020'; ctx.fill(); }
    },
    chest(ctx) {
      ctx.fillStyle = '#2b2b2b'; ell(ctx, -0.1, 0.28, 0.08, 0.06); ctx.fill();
      ctx.strokeStyle = '#c43a3a'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(-0.18, 0.47); ctx.quadraticCurveTo(0, 0.42, 0.2, 0.47); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.04, 0.44); ctx.lineTo(0.13, 0.44); ctx.lineTo(0.15, 0.32); ctx.lineTo(0.02, 0.32); ctx.closePath(); ink(ctx, '#ffd23f', 0.035);
    },
  },
  // CHUCHU: maquinista con gorra a rayas, bigotazo y pañuelo
  chuchu: {
    body: '#3d6ec9', bodyD: '#264a8e', hand: '#ffd2ad', shoe: '#2b2b33', leg: '#264a8e',
    back(ctx) { ell(ctx, -0.33, 0.06, 0.1, 0.12, 0.3); ink(ctx, '#5a3a22'); },
    head(ctx, P) {
      sphere(ctx, 0, 0, HEAD_R, '#ffd2ad', '#eeae84');
      face(ctx, P, { x: 0.13, y: -0.02, mouth: P.stun || P.dash ? [0.22, -0.27] : null });
      ell(ctx, 0.34, -0.08, 0.06, 0.055); ink(ctx, '#f29a7a', 0.035); // nariz
      ctx.beginPath(); // bigote
      ctx.moveTo(0.33, -0.13); ctx.quadraticCurveTo(0.24, -0.22, 0.08, -0.17); ctx.quadraticCurveTo(0.2, -0.13, 0.33, -0.13);
      ctx.quadraticCurveTo(0.42, -0.22, 0.48, -0.14); ctx.quadraticCurveTo(0.42, -0.1, 0.33, -0.13); ink(ctx, '#5a3a22', 0.035);
      ctx.fillStyle = 'rgba(40,30,40,0.25)'; ell(ctx, -0.14, -0.16, 0.06, 0.04); ctx.fill(); // hollín
      // gorra a rayas con visera
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0.02, HEAD_R + 0.035, 0.2, Math.PI - 0.12, false); ctx.quadraticCurveTo(0, 0.24, HEAD_R * 0.98, 0.1); ctx.closePath();
      ctx.fillStyle = '#e84a5f'; ctx.fill(); ctx.clip();
      ctx.fillStyle = '#fff'; for (let x = -0.33; x < 0.4; x += 0.15) ctx.fillRect(x, 0, 0.055, 0.5);
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0.02, HEAD_R + 0.035, 0.2, Math.PI - 0.12, false); ctx.quadraticCurveTo(0, 0.24, HEAD_R * 0.98, 0.1); ctx.closePath();
      ctx.lineWidth = 0.05; ctx.strokeStyle = INK; ctx.stroke();
      ell(ctx, 0.36, 0.13, 0.19, 0.05, -0.12); ink(ctx, '#a32a3c', 0.045);
      ell(ctx, -0.02, 0.44, 0.04, 0.03); ink(ctx, '#a32a3c', 0.03);
    },
    chest(ctx) {
      ctx.fillStyle = '#e84a5f';
      ctx.beginPath(); ctx.moveTo(-0.17, 0.5); ctx.lineTo(0.2, 0.5); ctx.lineTo(0.06, 0.32); ctx.closePath(); ink(ctx, '#e84a5f', 0.035);
      ctx.fillStyle = '#ffd23f'; ell(ctx, -0.12, 0.3, 0.025, 0.025); ctx.fill(); ell(ctx, 0.14, 0.3, 0.025, 0.025); ctx.fill();
    },
  },
  // KUNAI: ninja con capucha, ranura para los ojos y cintas que flamean
  kunai: {
    body: '#5b3cc4', bodyD: '#3e2394', hand: '#2a1760', shoe: '#2a1760', leg: '#2a1760',
    back(ctx, P) { ribbon(ctx, P, -0.34, 0.16, 0.42, 0.06, '#2a1760', 0); ribbon(ctx, P, -0.34, 0.12, 0.32, 0.05, '#2a1760', 2); },
    head(ctx, P) {
      sphere(ctx, 0, 0, HEAD_R, '#8f6bff', '#6744d8', 'rgba(230,220,255,0.5)');
      ctx.save(); ell(ctx, 0, 0, HEAD_R - 0.02, HEAD_R - 0.02); ctx.clip();
      ctx.beginPath(); ctx.roundRect(-0.04, -0.12, 0.5, 0.21, 0.1); ink(ctx, '#ffd9b8', 0.04);
      ctx.restore();
      face(ctx, P, { x: 0.17, y: -0.02, sharp: true, blush: false });
      limb(ctx, [[-0.39, 0.15], [0, 0.18], [0.39, 0.15]], 0.07, '#2a1760');
      ctx.beginPath(); ctx.roundRect(0.18, 0.12, 0.15, 0.1, 0.02); ink(ctx, '#cfd8dc', 0.03);
      ctx.strokeStyle = '#7a8a94'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(0.22, 0.17); ctx.lineTo(0.29, 0.17); ctx.stroke();
      ctx.strokeStyle = 'rgba(30,10,70,0.5)'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(0.06, -0.24); ctx.quadraticCurveTo(0.2, -0.2, 0.34, -0.26); ctx.stroke();
    },
    chest(ctx) { ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.moveTo(-0.22, 0.32); ctx.lineTo(0.22, 0.24); ctx.lineTo(0.22, 0.3); ctx.lineTo(-0.22, 0.38); ctx.closePath(); ink(ctx, '#ff5a5a', 0.03); },
  },
};
const toonOf = (id: string) => TOONS[id] ?? TOONS.bombin;

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number, col: string, rot = 0) {
  ctx.beginPath();
  for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, r = k % 2 ? r2 : r1; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ink(ctx, col, 0.035);
}

// Solo la cabeza (y lo que lleva detrás), con el origen en su centro: fichas del HUD, el ovni de MUU
export function drawHead(ctx: CanvasRenderingContext2D, id: string, P: Pose) {
  const T = toonOf(id);
  T.back?.(ctx, P);
  T.head(ctx, P);
}

// El personaje entero
export function drawToon(ctx: CanvasRenderingContext2D, id: string, P: Pose) {
  const T = toonOf(id), t = P.t + P.seed * 0.7;
  const moving = P.ground && Math.abs(P.vx) > 0.6, ph = t * (9 + Math.min(14, Math.abs(P.vx)) * 0.9);
  const bob = P.ground ? (moving ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(t * 3) * 0.012) : 0;
  const cr = P.crouch;
  // pies y manos según la pose
  let fF: [number, number], fB: [number, number], hF: [number, number], hB: [number, number];
  if (cr) fF = [0.16, 0.05], fB = [-0.14, 0.05], hF = [0.3, 0.12], hB = [-0.28, 0.14];
  else if (moving) {
    const s = Math.sin(ph), c = Math.cos(ph);
    fF = [0.06 + s * 0.14, 0.05 + Math.max(0, c) * 0.08], fB = [-0.06 - s * 0.14, 0.05 + Math.max(0, -c) * 0.08];
    hF = [0.14 - s * 0.12, 0.3 + Math.max(0, -s) * 0.04], hB = [-0.14 + s * 0.12, 0.3 + Math.max(0, s) * 0.04];
  } else if (!P.ground) {
    const up = P.vy > 2;
    fF = up ? [0.14, 0.16] : [0.15, 0.02], fB = up ? [-0.1, 0.08] : [-0.1, 0.06];
    hF = up ? [0.44, 0.62] : [0.42, 0.4], hB = up ? [-0.42, 0.64] : [-0.4, 0.44];
  } else fF = [0.12, 0.05], fB = [-0.11, 0.05], hF = [0.24, 0.26 + bob], hB = [-0.22, 0.27 + bob];
  if (P.dash && !cr) hF = [0.36, 0.36], hB = [-0.3, 0.42];
  if (P.stun) hF = [0.44, 0.56 + Math.sin(P.t * 20) * 0.06], hB = [-0.43, 0.56 - Math.sin(P.t * 20) * 0.06];
  const hy = cr ? 0.42 : HEAD_Y + bob, tilt = cr ? 0 : -clamp(P.vx / 12, -1, 1) * (P.ground ? 0.12 : 0.06);
  const hip = cr ? 0.12 : 0.2 + bob;

  // brazo y pierna de atrás
  limb(ctx, [[-0.07, hip], fB], 0.1, T.leg); ell(ctx, fB[0] + 0.03, fB[1], 0.1, 0.06); ink(ctx, T.shoe, 0.04);
  limb(ctx, [[-0.12, cr ? 0.24 : 0.42 + bob], hB], 0.08, T.body); ell(ctx, hB[0], hB[1], 0.07, 0.07); ink(ctx, T.hand, 0.04);
  // torso
  if (!cr) {
    ctx.beginPath(); ctx.roundRect(-0.21, 0.13 + bob, 0.42, 0.38, 0.15);
    ctx.fillStyle = T.bodyD; ctx.fill();
    ctx.save(); ctx.clip(); ctx.beginPath(); ctx.roundRect(-0.19, 0.18 + bob, 0.42, 0.38, 0.15); ctx.fillStyle = T.body; ctx.fill();
    ctx.translate(0, bob); T.chest?.(ctx, P); ctx.restore();
    ctx.beginPath(); ctx.roundRect(-0.21, 0.13 + bob, 0.42, 0.38, 0.15); ctx.lineWidth = 0.05; ctx.strokeStyle = INK; ctx.stroke();
  }
  // pierna de adelante
  limb(ctx, [[0.07, hip], fF], 0.1, T.leg); ell(ctx, fF[0] + 0.03, fF[1], 0.1, 0.06); ink(ctx, T.shoe, 0.04);
  // cabeza
  ctx.save(); ctx.translate(0, hy); ctx.rotate(tilt);
  if (cr) ctx.scale(1.04, 0.94);
  T.back?.(ctx, P);
  T.head(ctx, P);
  ctx.restore();
  // brazo de adelante (encima de la cabeza si la levanta)
  limb(ctx, [[0.12, cr ? 0.24 : 0.42 + bob], hF], 0.08, T.body); ell(ctx, hF[0], hF[1], 0.075, 0.075); ink(ctx, T.hand, 0.04);
}
