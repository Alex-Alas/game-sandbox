// Los monos, dibujados en código: cabeza grande, máscara, y lo que distingue a cada papel (los tres monos sabios al revés):
// el CIEGO con venda, el SORDO con orejeras, el MUDO con cinta en la boca. Los gestos van con las manos (dedos, flechas,
// pulgar) o con la cabeza (sí, no). Sin estado: todo sale de los parámetros.
import type { Role, Gesture } from './sim/const.ts';

export type MonkeyOpts = {
  role: Role, mouth: number, ges: Gesture | null, gt: number, t: number, hitT: number,
  mood?: 'normal' | 'boom' | 'win', name?: string,
};
const FUR = '#8a5a34', FACE = '#f1c9a0', INK = '#22160d';
export const SHIRT: Record<Role, string> = { ciego: '#3f7be0', sordo: '#e0503f', mudo: '#3fae6a' };

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function ink(g: CanvasRenderingContext2D, w: number) { g.strokeStyle = INK; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }

// Mano de frente: palma y `n` dedos levantados (0 = puño). rot gira toda la mano; thumb: pulgar arriba (1) o abajo (−1).
function hand(g: CanvasRenderingContext2D, x: number, y: number, s: number, n: number, rot = 0, thumb = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const w = s * 0.13;
  const finger = (fx: number, len: number, a: number) => {
    g.save(); g.translate(fx, -s * 0.12); g.rotate(a);
    g.beginPath(); g.roundRect(-w / 2, -len, w, len + w, w / 2);
    g.fillStyle = FACE; g.fill(); ink(g, s * 0.035); g.restore();
  };
  if (thumb) {
    g.scale(1, thumb);
    finger(0, s * 0.32, 0);
  } else if (n > 0) {
    const order = [2, 1, 3, 0, 4].slice(0, Math.min(n, 4)).sort();
    for (const k of order) finger(-s * 0.2 + k * s * 0.135, s * (k === 2 ? 0.38 : k === 0 || k === 4 ? 0.28 : 0.34), (k - 2) * 0.07);
    if (n >= 5) finger(-s * 0.3, s * 0.22, -0.9);
  }
  g.beginPath(); g.roundRect(-s * 0.26, -s * 0.16, s * 0.52, s * 0.4, s * 0.12);
  g.fillStyle = FACE; g.fill(); ink(g, s * 0.04);
  if (!n && !thumb) { g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(-s * 0.13 + k * s * 0.13, -s * 0.16); g.lineTo(-s * 0.13 + k * s * 0.13, -s * 0.02); } ink(g, s * 0.03); }
  g.restore();
}
function pointing(g: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number) {
  hand(g, x, y, s, 1, dir * Math.PI / 2);
}
function bigArrow(g: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, col = '#ffd23f') {
  g.save(); g.translate(x, y); g.rotate(dir * Math.PI / 2);
  g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.75, -s * 0.15); g.lineTo(s * 0.28, -s * 0.15); g.lineTo(s * 0.28, s * 0.7);
  g.lineTo(-s * 0.28, s * 0.7); g.lineTo(-s * 0.28, -s * 0.15); g.lineTo(-s * 0.75, -s * 0.15); g.closePath();
  g.fillStyle = col; g.fill(); ink(g, s * 0.1); g.restore();
}
function bubble(g: CanvasRenderingContext2D, x: number, y: number, s: number, text: string) {
  circle(g, x, y, s); g.fillStyle = '#fff'; g.fill(); ink(g, s * 0.12);
  g.font = `900 ${s * 1.3}px system-ui, sans-serif`; g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x, y + s * 0.08);
}

// Dibuja un mono con el centro de la cabeza en (x, y) y radio de cabeza s.
export function drawMonkey(g: CanvasRenderingContext2D, x: number, y: number, s: number, o: MonkeyOpts) {
  const ges = o.ges, gt = o.gt, mood = o.mood ?? 'normal';
  let hx = 0, hy = 0, tilt = 0;
  if (ges === 'si') hy = Math.sin(gt * 13) * s * 0.13 * Math.max(0, 1 - gt / 1.6);
  if (ges === 'no') hx = Math.sin(gt * 15) * s * 0.16 * Math.max(0, 1 - gt / 1.6), tilt = hx / s * 0.6;
  if (o.hitT < 0.7) tilt += Math.sin(o.hitT * 30) * 0.25 * (1 - o.hitT / 0.7);
  const breathe = Math.sin(o.t * 2.2) * s * 0.02;
  g.save(); g.translate(x, y);
  // cuerpo
  g.beginPath(); g.moveTo(-s * 1.15, s * 2.4); g.quadraticCurveTo(-s * 1.2, s * 0.85, 0, s * 0.8 + breathe); g.quadraticCurveTo(s * 1.2, s * 0.85, s * 1.15, s * 2.4); g.closePath();
  g.fillStyle = mood === 'boom' ? '#3a3a3a' : SHIRT[o.role]; g.fill(); ink(g, s * 0.07);
  g.beginPath(); g.moveTo(-s * 0.35, s * 0.85); g.lineTo(0, s * 1.25); g.lineTo(s * 0.35, s * 0.85); ink(g, s * 0.05);

  // cabeza
  g.save(); g.translate(hx, hy + breathe); g.rotate(tilt);
  for (const sx of [-1, 1]) {
    circle(g, sx * s * 0.98, -s * 0.02, s * 0.36); g.fillStyle = FUR; g.fill(); ink(g, s * 0.06);
    circle(g, sx * s * 0.98, -s * 0.02, s * 0.2); g.fillStyle = '#e8a98b'; g.fill();
  }
  circle(g, 0, 0, s); g.fillStyle = FUR; g.fill(); ink(g, s * 0.07);
  g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(-s * 0.15 + k * s * 0.15, -s * 0.95); g.quadraticCurveTo(-s * 0.1 + k * s * 0.17, -s * 1.3, s * 0.05 + k * s * 0.08, -s * 1.15); } ink(g, s * 0.06);
  // máscara
  g.beginPath();
  g.arc(-s * 0.3, -s * 0.12, s * 0.4, Math.PI * 0.75, Math.PI * 1.95);
  g.arc(s * 0.3, -s * 0.12, s * 0.4, Math.PI * 1.05, Math.PI * 0.25);
  g.ellipse(0, s * 0.32, s * 0.66, s * 0.5, 0, 0, Math.PI);
  g.closePath(); g.fillStyle = mood === 'boom' ? '#6b5a4c' : FACE; g.fill(); ink(g, s * 0.05);
  // ojos
  if (o.role !== 'ciego') {
    for (const sx of [-1, 1]) {
      if (mood === 'boom') { g.beginPath(); g.moveTo(sx * s * 0.28 - s * 0.08, -s * 0.2); g.lineTo(sx * s * 0.28 + s * 0.08, -s * 0.04); g.moveTo(sx * s * 0.28 + s * 0.08, -s * 0.2); g.lineTo(sx * s * 0.28 - s * 0.08, -s * 0.04); ink(g, s * 0.06); continue; }
      if (mood === 'win') { g.beginPath(); g.arc(sx * s * 0.28, -s * 0.08, s * 0.1, Math.PI * 1.1, Math.PI * 1.9); ink(g, s * 0.06); continue; }
      circle(g, sx * s * 0.28, -s * 0.12, s * 0.1); g.fillStyle = INK; g.fill();
      circle(g, sx * s * 0.28 + s * 0.035, -s * 0.16, s * 0.035); g.fillStyle = '#fff'; g.fill();
    }
  }
  // nariz
  for (const sx of [-1, 1]) { circle(g, sx * s * 0.08, s * 0.17, s * 0.035); g.fillStyle = INK; g.fill(); }
  // boca (abre con la voz)
  const open = Math.max(0, Math.min(1, o.mouth));
  if (mood === 'win') { g.beginPath(); g.arc(0, s * 0.36, s * 0.22, 0.1, Math.PI - 0.1); g.closePath(); g.fillStyle = '#7a1f1f'; g.fill(); ink(g, s * 0.05); }
  else if (open > 0.05) { g.beginPath(); g.ellipse(0, s * 0.45, s * 0.16, s * 0.04 + open * s * 0.13, 0, 0, Math.PI * 2); g.fillStyle = '#7a1f1f'; g.fill(); ink(g, s * 0.045); }
  else { g.beginPath(); g.moveTo(-s * 0.16, s * 0.42); g.quadraticCurveTo(0, s * 0.5, s * 0.16, s * 0.42); ink(g, s * 0.05); }
  // papel
  if (o.role === 'ciego') {
    g.beginPath(); g.roundRect(-s * 1.02, -s * 0.34, s * 2.04, s * 0.34, s * 0.08);
    g.fillStyle = '#26262e'; g.fill(); ink(g, s * 0.05);
    g.beginPath(); g.moveTo(s * 0.95, -s * 0.2); g.quadraticCurveTo(s * 1.35, -s * 0.05, s * 1.25, s * 0.35); g.moveTo(s * 0.95, -s * 0.2); g.quadraticCurveTo(s * 1.45, -s * 0.35, s * 1.5, -s * 0.05);
    g.strokeStyle = '#26262e'; g.lineWidth = s * 0.1; g.stroke();
  } else if (o.role === 'sordo') {
    g.beginPath(); g.arc(0, -s * 0.05, s * 1.08, Math.PI * 1.05, Math.PI * 1.95);
    g.strokeStyle = INK; g.lineWidth = s * 0.2; g.stroke(); g.strokeStyle = '#d23a2c'; g.lineWidth = s * 0.12; g.stroke();
    for (const sx of [-1, 1]) {
      g.beginPath(); g.ellipse(sx * s * 1.02, -s * 0.02, s * 0.3, s * 0.42, 0, 0, Math.PI * 2);
      g.fillStyle = '#e8463a'; g.fill(); ink(g, s * 0.06);
      g.beginPath(); g.ellipse(sx * s * 1.06, -s * 0.06, s * 0.12, s * 0.2, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
    }
  } else {
    const wob = open > 0.05 ? Math.sin(o.t * 40) * s * 0.03 : 0;
    for (const a of [-0.35, 0.35]) {
      g.save(); g.translate(0, s * 0.44 + wob); g.rotate(a);
      g.beginPath(); g.roundRect(-s * 0.38, -s * 0.08, s * 0.76, s * 0.16, s * 0.04);
      g.fillStyle = '#e9dfc4'; g.fill(); ink(g, s * 0.035); g.restore();
    }
  }
  if (mood === 'boom') {
    g.beginPath(); for (let k = 0; k < 14; k++) { const a = Math.PI * (1.05 + k / 14 * 0.9); g.lineTo(Math.cos(a) * s * (1.15 + (k % 2) * 0.35), -s * 0.2 + Math.sin(a) * s * (1.15 + (k % 2) * 0.35)); }
    g.fillStyle = '#1b1b1b'; g.fill();
    for (let k = 0; k < 3; k++) { const ph = (o.t * 0.6 + k / 3) % 1; circle(g, (k - 1) * s * 0.4, -s * 1.5 - ph * s * 1.2, s * (0.15 + ph * 0.25)); g.fillStyle = `rgba(90,90,90,${0.6 * (1 - ph)})`; g.fill(); }
  }
  g.restore();

  // manos y gestos
  const hs = s * 1.05, bodyY = s * 1.5;
  const fade = Math.min(1, gt * 8);
  if (mood === 'win') {
    for (const sx of [-1, 1]) hand(g, sx * s * 1.25, -s * 0.6 + Math.sin(o.t * 10 + sx) * s * 0.1, hs, 5, sx * 0.3);
  } else if (ges && ges !== 'si' && ges !== 'no') {
    g.globalAlpha = fade;
    const num = ges.startsWith('n') && ges.length <= 3 ? +ges.slice(1) : -1;
    if (num >= 0) {
      const nh = hs * 1.3;
      if (num <= 5) hand(g, s * 0.8, bodyY - s * 0.45, nh, num);
      else { hand(g, -s * 0.8, bodyY - s * 0.45, nh, 5); hand(g, s * 0.8, bodyY - s * 0.45, nh, num - 5); }
    } else if (ges === 'arriba' || ges === 'derecha' || ges === 'abajo' || ges === 'izquierda') {
      const dir = ['arriba', 'derecha', 'abajo', 'izquierda'].indexOf(ges);
      const ax = [0, 1, 0, -1][dir], ay = [-1, 0, 1, 0][dir];
      pointing(g, ax * s * 1.05, bodyY - s * 0.5 + ay * s * 0.4, hs, dir);
      bigArrow(g, ax * s * 1.9, bodyY - s * 0.5 + ay * s * 1.3 + (dir === 0 ? -s * 0.5 : 0), s * 0.55, dir);
    } else if (ges === 'medio') {
      hand(g, 0, bodyY - s * 0.45, hs, 5, Math.PI / 2);
      g.beginPath(); g.moveTo(-s * 1.4, bodyY - s * 0.45); g.lineTo(s * 1.4, bodyY - s * 0.45); g.strokeStyle = '#ffd23f'; g.lineWidth = s * 0.12; g.stroke();
    } else if (ges === 'bien' || ges === 'mal') hand(g, s * 0.7, bodyY - s * 0.45, hs, 0, 0, ges === 'bien' ? 1 : -1);
    else if (ges === 'espera') hand(g, s * 0.6, bodyY - s * 0.55, hs * 1.15, 5);
    else if (ges === 'duda') { for (const sx of [-1, 1]) hand(g, sx * s * 1.2, bodyY - s * 0.5, hs, 5, sx * 0.9); bubble(g, s * 1.1, -s * 1.3, s * 0.38, '?'); }
    else if (ges === 'ojo') { hand(g, s * 0.62, -s * 0.05, hs * 0.8, 1, -0.5); bubble(g, s * 1.15, -s * 1.3, s * 0.38, '!'); }
    else if (ges === 'repite') {
      hand(g, s * 0.75, bodyY - s * 0.5, hs, 1);
      g.beginPath(); g.arc(s * 0.75, bodyY - s * 1.05, s * 0.32, gt * 8, gt * 8 + Math.PI * 1.5); g.strokeStyle = '#ffd23f'; g.lineWidth = s * 0.1; g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (o.hitT < 0.9) {
    const k = o.hitT / 0.9;
    g.save(); g.globalAlpha = 1 - k; g.translate(s * 0.6, -s * 1.1 - k * s * 0.6); g.rotate(-0.2);
    g.beginPath(); for (let j = 0; j < 16; j++) { const a = j / 16 * Math.PI * 2, r = s * (j % 2 ? 0.28 : 0.55); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fillStyle = '#ffd23f'; g.fill(); ink(g, s * 0.05);
    g.font = `900 ${s * 0.32}px system-ui, sans-serif`; g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¡PLAF!', 0, 0);
    g.restore();
  }
  g.restore();
}

// Banana (para los bananazos que vuelan y los íconos)
export function drawBanana(g: CanvasRenderingContext2D, x: number, y: number, s: number, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.moveTo(-s, -s * 0.2); g.quadraticCurveTo(0, s * 0.9, s, -s * 0.2); g.quadraticCurveTo(0, s * 0.35, -s, -s * 0.2);
  g.fillStyle = '#ffd23f'; g.fill(); ink(g, s * 0.12);
  g.beginPath(); g.moveTo(s * 0.95, -s * 0.2); g.lineTo(s * 1.15, -s * 0.45); ink(g, s * 0.16);
  g.restore();
}
