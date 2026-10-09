// La bomba en Canvas 2D, en «unidades de bomba» (cada módulo mide MW × MH). Dos miradas:
//  - 'color' (el SORDO): colores, luces, pantallas y símbolos; el braille es una placa lisa.
//  - 'tacto' (el CIEGO): oscuridad y solo los relieves (contornos de lo que se puede tocar), el braille bajo la mano y el calor
//    de lo que quema cuando la mano anda por ese módulo; nada de colores ni pantallas.
// Con apagón (`glow`), el SORDO ve solo lo que brilla: luces y pantallas.
// Además: qué acción dispara un clic (hit) y qué parte está bajo la mano (touch: para los sonidos que solo oye el CIEGO).
import type { Bomb } from './sim/bomb.ts';
import { calcResult, OPS, SIMON_N, DIR_N, DIAL_N, ALARM_T, isChaos, type Mod, type MAct, type Act } from './sim/mods.ts';
import { BRAILLE, NOTES } from './sim/const.ts';

export type Look = 'color' | 'tacto';
export const MW = 100, MH = 80;
export const HEX = ['#e53935', '#1e66f5', '#2fb344', '#f7c600', '#f4f4f4', '#26262b'];
export const HEX_DIM = ['#5a1716', '#0d2a63', '#134a1d', '#5e4b00', '#5d5d5d', '#111'];
const INK = '#1a1410', METAL2 = '#8d939c', FEEL = 'rgba(176,198,240,0.85)', FEEL2 = 'rgba(176,198,240,0.35)';

type DC = { g: CanvasRenderingContext2D, look: Look, glow: boolean, hx: number, hy: number, t: number, mi: number };
const tacto = (d: DC) => d.look === 'tacto';
const near = (d: DC, x: number, y: number, w: number, h: number, m = 2) => d.hx >= x - m && d.hx <= x + w + m && d.hy >= y - m && d.hy <= y + h + m;
const handIn = (d: DC) => d.hx >= 0 && d.hx <= MW && d.hy >= 0 && d.hy <= MH;

export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function feel(d: DC, w = 1.2, a = 1) {
  d.g.strokeStyle = a >= 1 ? FEEL : FEEL2;
  d.g.lineWidth = w;
}
function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }

// ---- Piezas comunes ----------------------------------------------------------------------------------------------
function plate(d: DC) {
  const g = d.g;
  if (d.glow) return;
  if (tacto(d)) { rr(g, 1.5, 1.5, MW - 3, MH - 3, 6); g.fillStyle = '#0d1018'; g.fill(); feel(d, 1.4, 0); g.stroke(); return; }
  rr(g, 1.5, 1.5, MW - 3, MH - 3, 6);
  const gr = g.createLinearGradient(0, 0, 0, MH);
  gr.addColorStop(0, '#c3c8cf'), gr.addColorStop(1, METAL2);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
  g.fillStyle = '#6d727a';
  for (const [x, y] of [[5, 5], [MW - 5, 5], [5, MH - 5], [MW - 5, MH - 5]]) { circle(g, x, y, 1.3); g.fill(); }
}
function label(d: DC, s: string, x = 6, y = MH - 4.5) {
  if (d.glow || tacto(d)) return;
  const g = d.g;
  g.font = '800 4.2px system-ui, sans-serif'; g.fillStyle = 'rgba(40,40,48,0.55)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(s, x, y);
}
// Luz: el SORDO ve el color (y en el apagón, solo eso); el CIEGO siente el bulbo, no el color.
function led(d: DC, x: number, y: number, r: number, col: number | null) {
  const g = d.g;
  if (tacto(d)) { if (!d.glow) { circle(g, x, y, r); feel(d, 1, 0); g.stroke(); } return; }
  if (!d.glow) { circle(g, x, y, r + 1.2); g.fillStyle = '#3a3d44'; g.fill(); }
  circle(g, x, y, r);
  if (col == null) { g.fillStyle = '#4b4f57'; g.fill(); return; }
  const c = col === -1 ? '#3dff6e' : HEX[col];
  g.save(); g.shadowColor = c; g.shadowBlur = r * 2.4; g.fillStyle = c; g.fill(); g.restore();
  circle(g, x - r * 0.3, y - r * 0.35, r * 0.35); g.fillStyle = 'rgba(255,255,255,0.65)'; g.fill();
}
function lcd(d: DC, x: number, y: number, w: number, h: number, text: string, color = '#7dff9a', size = h * 0.72) {
  const g = d.g;
  if (tacto(d)) { if (!d.glow) { rr(g, x, y, w, h, 1.5); feel(d, 0.8, 0); g.stroke(); } return; }
  rr(g, x, y, w, h, 1.5); g.fillStyle = '#0e1a12'; g.fill();
  if (!d.glow) { g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); }
  g.save(); g.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 3;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + w / 2, y + h / 2 + 0.4); g.restore();
}
function button(d: DC, x: number, y: number, w: number, h: number, col: number, r = 2.5, text = '') {
  const g = d.g;
  if (d.glow) return;
  if (tacto(d)) { rr(g, x, y, w, h, r); feel(d, 1.1); g.stroke(); return; }
  rr(g, x, y + 1, w, h, r); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
  rr(g, x, y, w, h, r);
  g.fillStyle = col >= 0 ? HEX[col] : '#e9e6dc'; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  rr(g, x + 1.2, y + 1, w - 2.4, Math.min(3, h / 3), r / 2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
  if (text) {
    g.font = `900 ${Math.min(h * 0.62, 7)}px system-ui, sans-serif`; g.fillStyle = col === 5 || col === 1 ? '#fff' : INK;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + w / 2, y + h / 2 + 0.3);
  }
}
function roundBtn(d: DC, x: number, y: number, r: number, col: number) {
  const g = d.g;
  if (d.glow) return;
  if (tacto(d)) { circle(g, x, y, r); feel(d, 1.2); g.stroke(); return; }
  circle(g, x, y + 1, r); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
  circle(g, x, y, r);
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#fff'), gr.addColorStop(0.25, col >= 0 ? HEX[col] : '#ddd'), gr.addColorStop(1, col >= 0 ? HEX_DIM[col] : '#777');
  g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
}
// Placa braille: lisa para el que mira; con relieve (los puntos) para la mano que la toca.
function braille(d: DC, x: number, y: number, w: number, h: number, n: number) {
  const g = d.g;
  if (d.glow) return;
  if (!tacto(d)) {
    rr(g, x, y, w, h, 2); g.fillStyle = '#d7d2c4'; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 3; k++) { rr(g, x + 2, y + 2 + k * (h - 4) / 3, w - 4, (h - 4) / 3 - 1, 1); g.fill(); }
    return;
  }
  rr(g, x, y, w, h, 2); feel(d, 1); g.stroke();
  if (!near(d, x, y, w, h, 4)) return;
  const s = Math.min(w / 3.2, h / 4.4), cx = x + w / 2 - s / 2, cy = y + h / 2 - s;
  g.save(); g.shadowColor = '#bcd4ff'; g.shadowBlur = 4;
  for (let dot = 1; dot <= 6; dot++) {
    const on = BRAILLE[n].includes(dot), px = cx + (dot > 3 ? s : 0), py = cy + ((dot - 1) % 3) * s;
    circle(g, px, py, on ? s * 0.32 : s * 0.12);
    g.fillStyle = on ? '#eef4ff' : 'rgba(176,198,240,0.25)'; g.fill();
  }
  g.restore();
}
// Lo que quema: vapor para el que mira, calor para la mano que anda por el módulo.
function heat(d: DC, x: number, y: number, r: number) {
  const g = d.g;
  if (d.glow) return;
  if (tacto(d)) {
    if (!handIn(d)) return;
    const near2 = Math.hypot(d.hx - x, d.hy - y) < r * 2.2 ? 1 : 0.55;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.9);
    gr.addColorStop(0, `rgba(255,120,40,${0.85 * near2})`), gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr; circle(g, x, y, r * 1.9); g.fill();
    return;
  }
  for (let k = 0; k < 3; k++) {
    const ph = (d.t * 0.8 + k / 3) % 1, yy = y - r - ph * 12, xx = x + Math.sin((ph + k) * 6) * 2.5;
    circle(g, xx, yy, 2 + ph * 3); g.fillStyle = `rgba(255,255,255,${0.55 * (1 - ph)})`; g.fill();
  }
}
function arrowPath(g: CanvasRenderingContext2D, x: number, y: number, dir: number, s: number) {
  g.save(); g.translate(x, y); g.rotate(dir * Math.PI / 2);
  g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.8, s * 0.2); g.lineTo(s * 0.3, s * 0.2); g.lineTo(s * 0.3, s * 0.8);
  g.lineTo(-s * 0.3, s * 0.8); g.lineTo(-s * 0.3, s * 0.2); g.lineTo(-s * 0.8, s * 0.2); g.closePath(); g.restore();
}
function arrowBtn(d: DC, x: number, y: number, w: number, dir: number) {
  const g = d.g;
  if (d.glow) return;
  button(d, x, y, w, w, -1, 2);
  arrowPath(g, x + w / 2, y + w / 2, dir, w * 0.32);
  if (tacto(d)) { feel(d, 1); g.stroke(); } else { g.fillStyle = INK; g.fill(); }
}
function stages(d: DC, n: number, done: number, x = 7, y = 7) {
  for (let k = 0; k < n; k++) led(d, x + k * 6, y, 2, k < done ? -1 : null);
}
export function symbol(g: CanvasRenderingContext2D, id: number, x: number, y: number, r: number, col = INK) {
  const shape = id >> 1, hollow = id & 1;
  g.beginPath();
  if (shape === 0) for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr2 = k % 2 ? r * 0.45 : r; g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  else if (shape === 1) { g.arc(x, y, r, Math.PI * 0.3, Math.PI * 1.7); g.arc(x + r * 0.55, y, r * 0.8, Math.PI * 1.55, Math.PI * 0.45, true); }
  else if (shape === 2) { g.moveTo(x, y - r); g.lineTo(x + r * 0.95, y + r * 0.75); g.lineTo(x - r * 0.95, y + r * 0.75); }
  else if (shape === 3) g.arc(x, y, r * 0.85, 0, Math.PI * 2);
  else if (shape === 4) { const a = r * 0.32; g.moveTo(x - a, y - r); g.lineTo(x + a, y - r); g.lineTo(x + a, y - a); g.lineTo(x + r, y - a); g.lineTo(x + r, y + a); g.lineTo(x + a, y + a); g.lineTo(x + a, y + r); g.lineTo(x - a, y + r); g.lineTo(x - a, y + a); g.lineTo(x - r, y + a); g.lineTo(x - r, y - a); g.lineTo(x - a, y - a); }
  else { g.moveTo(x, y - r); g.lineTo(x + r * 0.75, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.75, y); }
  g.closePath();
  if (hollow) { g.strokeStyle = col; g.lineWidth = r * 0.22; g.stroke(); } else { g.fillStyle = col; g.fill(); }
}

// ---- Geometría de cada módulo (la comparten el dibujo y los clics) ------------------------------------------------
const wireX = (n: number, i: number) => 22 + i * (58 / (n - 1));
const CALC_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 0, -2]; // -1 borrar, -2 OK
const calcKey = (k: number) => ({ x: 8 + (k % 3) * 15, y: 24 + Math.floor(k / 3) * 13, w: 13, h: 11 });
const calcBtn = (k: number) => ({ x: 60 + (k % 2) * 18, y: 40 + Math.floor(k / 2) * 19, w: 14, h: 15 });
const DPAD = (cx: number, cy: number, s: number) => [[cx - s / 2, cy - s * 1.6], [cx + s * 0.6, cy - s / 2], [cx - s / 2, cy + s * 0.6], [cx - s * 1.6, cy - s / 2]];
const SLIDE_X = [22, 44, 66], NOTCH_Y = [56, 36, 16];
const bellXY = (k: number) => [28 + (k % 3) * 22, 16 + Math.floor(k / 3) * 22];
const keyX = (k: number) => 8 + k * 12;
const dialXY = (k: number, r = 18) => [34 + Math.cos(-Math.PI / 2 + k * Math.PI / 3) * r, 40 + Math.sin(-Math.PI / 2 + k * Math.PI / 3) * r];
const SIMON = [[50, 21], [72, 43], [50, 65], [28, 43]];
const sockXY = (k: number) => [22 + k * 28, 30];
const morseKey = (k: number) => ({ x: 8 + (k % 5) * 17, y: 46 + Math.floor(k / 5) * 12, w: 15, h: 10 });
const mazeXY = (x: number, y: number) => [14 + x * 10.5, 16 + y * 10.5];
const SW_X = [12, 31, 50, 69];
const ALARM_XY = (k: number) => [26 + (k % 3) * 24, 40 + Math.floor(k / 3) * 22];
const inR = (x: number, y: number, r: { x: number, y: number, w: number, h: number }, m = 0) => x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;
const inBox = (x: number, y: number, bx: number, by: number, w: number, h: number, m = 0) => x >= bx - m && x <= bx + w + m && y >= by - m && y <= by + h + m;

// ---- Dibujo por módulo -------------------------------------------------------------------------------------------
function numTab(d: DC) {
  const g = d.g;
  rr(g, MW / 2 - 6, -3, 12, 7, 2); g.fillStyle = '#f7c600'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
  g.font = '900 5.5px system-ui, sans-serif'; g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(d.mi + 1), MW / 2, 0.6);
}
function drawMod(m: Mod, d: DC) {
  const g = d.g;
  plate(d);
  if (!tacto(d) && !d.glow) numTab(d);
  switch (m.k) {
    case 'cables': {
      led(d, 10, 10, 4, m.led);
      const n = m.wires.length;
      if (!d.glow) for (let i = 0; i < n; i++) {
        const x = wireX(n, i);
        for (const yy of [14, 70]) { rr(g, x - 3, yy - 2.5, 6, 5, 1); if (tacto(d)) { feel(d, 0.8, 0); g.stroke(); } else { g.fillStyle = '#5f646c'; g.fill(); } }
        const seg = (y0: number, y1: number) => { g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + (i % 2 ? 7 : -7), y0 + (y1 - y0) * 0.35, x - (i % 2 ? 7 : -7), y0 + (y1 - y0) * 0.65, x, y1); };
        const paint = () => {
          if (tacto(d)) { feel(d, 2.2); g.stroke(); return; }
          g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 4.6; g.stroke();
          g.strokeStyle = HEX[m.wires[i]]; g.lineWidth = 3; g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.8; g.stroke();
        };
        if (m.cut[i]) { seg(16, 38); paint(); seg(48, 68); paint(); } else { seg(16, 68); paint(); }
      }
      label(d, 'CABLES');
      break;
    }
    case 'calc': {
      const res = calcResult(m);
      lcd(d, 8, 6, 84, 13, m.stage ? `${m.a}${OPS[m.op]}${m.b}=${res}` : `${m.a}${OPS[m.op]}${m.b}=${m.typed}${Math.floor(d.t * 2) % 2 ? '_' : ' '}`, m.stage ? '#7dff9a' : '#ffd36b', 8.2);
      CALC_KEYS.forEach((v, k) => {
        const r = calcKey(k);
        button(d, r.x, r.y, r.w, r.h, -1, 2, d.look === 'color' ? v === -1 ? 'C' : v === -2 ? 'OK' : String(v) : '');
        if (tacto(d) && v >= 0) braille(d, r.x + 3.5, r.y + 1.2, 6, 8.6, v);
        else if (tacto(d) && !d.glow) { g.beginPath(); if (v === -1) { g.moveTo(r.x + 4, r.y + 3); g.lineTo(r.x + 9, r.y + 8); g.moveTo(r.x + 9, r.y + 3); g.lineTo(r.x + 4, r.y + 8); } else { g.moveTo(r.x + 3, r.y + 5.5); g.lineTo(r.x + 10, r.y + 5.5); } feel(d, 1.2); g.stroke(); }
      });
      led(d, 77, 31, 4.5, m.stage ? m.led : null);
      for (let k = 0; k < 4; k++) { const r = calcBtn(k); button(d, r.x, r.y, r.w, r.h, -1, 3, d.look === 'color' ? String(k + 1) : ''); }
      label(d, 'CALCULADORA');
      break;
    }
    case 'dir': {
      stages(d, DIR_N, m.stage);
      led(d, 86, 12, 5, m.led[Math.min(m.stage, DIR_N - 1)]);
      braille(d, 8, 22, 20, 30, m.n[Math.min(m.stage, DIR_N - 1)]);
      DPAD(60, 44, 13).forEach(([x, y], k) => arrowBtn(d, x, y, 13, k));
      label(d, 'FLECHAS');
      break;
    }
    case 'slide': {
      SLIDE_X.forEach((x, i) => {
        if (!d.glow) {
          rr(g, x - 2, 12, 4, 48, 2);
          if (tacto(d)) { feel(d, 1); g.stroke(); } else { g.fillStyle = '#2b2e34'; g.fill(); }
          for (const ny of NOTCH_Y) { g.beginPath(); g.moveTo(x - 7, ny); g.lineTo(x - 4, ny); g.moveTo(x + 4, ny); g.lineTo(x + 7, ny); if (tacto(d)) feel(d, 1); else { g.strokeStyle = INK; g.lineWidth = 1; } g.stroke(); }
          const ky = NOTCH_Y[m.pos[i]];
          rr(g, x - 7, ky - 4, 14, 8, 2);
          if (tacto(d)) { feel(d, 1.6); g.stroke(); } else { g.fillStyle = HEX[m.col[i]]; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke(); }
        }
      });
      button(d, 80, 60, 15, 12, -1, 2.5, 'OK');
      label(d, 'CORREDERAS');
      break;
    }
    case 'bells': {
      for (let k = 0; k < 9; k++) {
        const [x, y] = bellXY(k);
        roundBtn(d, x, y, 8, m.col[k]);
        if (tacto(d)) braille(d, x - 3, y - 4.5, 6, 9, m.num[k]);
      }
      label(d, 'TIMBRES');
      break;
    }
    case 'piano': {
      braille(d, 8, 6, 16, 22, m.oct);
      led(d, 86, 14, 5, m.led);
      stages(d, 4, m.prog, 34, 10);
      if (!d.glow) {
        for (let k = 0; k < 7; k++) {
          rr(g, keyX(k), 34, 12, 42, 1.5);
          if (tacto(d)) { feel(d, 1.1); g.stroke(); continue; }
          g.fillStyle = '#fbfaf5'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
          g.font = '800 4px system-ui, sans-serif'; g.fillStyle = '#6b6b6b'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
          g.fillText(NOTES[k], keyX(k) + 6, 73);
        }
        for (const k of [0, 1, 3, 4, 5]) {
          rr(g, keyX(k) + 8.5, 34, 7, 24, 1);
          if (tacto(d)) { feel(d, 0.9, 0); g.stroke(); } else { g.fillStyle = '#222'; g.fill(); }
        }
      }
      label(d, 'PIANO', 60, 9);
      break;
    }
    case 'dial': {
      stages(d, DIAL_N, m.stage);
      if (!d.glow) {
        circle(g, 34, 40, 25);
        if (tacto(d)) { feel(d, 1.2); g.stroke(); }
        else { g.fillStyle = '#e8e2d0'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke(); m.sym.forEach((s, k) => { const [x, y] = dialXY(k); symbol(g, s, x, y, 4.2); }); }
        const [px, py] = dialXY(m.ptr, 12);
        g.beginPath(); g.moveTo(34, 40); g.lineTo(px, py);
        if (tacto(d)) feel(d, 2.4); else { g.strokeStyle = '#c62828'; g.lineWidth = 2.4; }
        g.lineCap = 'round'; g.stroke();
        circle(g, 34, 40, 5.5);
        if (tacto(d)) { feel(d, 1.2); g.stroke(); } else { g.fillStyle = '#3a3d44'; g.fill(); }
      }
      for (const [x, dir] of [[4, -1], [50, 1]] as const) {
        button(d, x, 67, 14, 10, -1, 2);
        if (!d.glow) { g.beginPath(); g.arc(x + 7, 72, 2.8, dir < 0 ? 0.2 : Math.PI * 0.8, dir < 0 ? Math.PI * 1.6 : Math.PI * 2.2, dir < 0); if (tacto(d)) feel(d, 1); else { g.strokeStyle = INK; g.lineWidth = 1; } g.stroke(); }
      }
      for (let k = 0; k < 4; k++) button(d, 70, 7 + k * 17, 24, 13, m.col[k], 3);
      label(d, 'RULETA', 70, MH - 3);
      break;
    }
    case 'simon': {
      stages(d, SIMON_N, m.stage);
      SIMON.forEach(([x, y], k) => {
        roundBtn(d, x, y, 10, m.col[k]);
        if (k === m.hot[Math.min(m.stage, SIMON_N - 1)]) heat(d, x, y, 10);
      });
      label(d, 'MONO DICE');
      break;
    }
    case 'morse': {
      if (!tacto(d)) {
        lcd(d, 8, 4, 46, 12, '');
        m.order.forEach((c, k) => { circle(g, 19 + k * 12, 10, 3.2); g.fillStyle = HEX[c]; g.save(); g.shadowColor = HEX[c]; g.shadowBlur = 3; g.fill(); g.restore(); });
        lcd(d, 60, 4, 32, 12, m.typed.padEnd(3, '_'), '#ffd36b', 8);
      } else lcd(d, 8, 4, 84, 12, '');
      m.ring.forEach((c, k) => {
        const [x, y] = sockXY(k);
        if (d.glow && !tacto(d)) return;
        circle(g, x, y, 10);
        if (tacto(d)) { if (!d.glow) { feel(d, 1); g.stroke(); circle(g, x, y, 5); feel(d, 1.5); g.stroke(); } return; }
        g.fillStyle = HEX[c]; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
        circle(g, x, y, 6); g.fillStyle = '#1b1d22'; g.fill();
        g.fillStyle = '#5a5e66'; for (const dx of [-2, 2]) { rr(g, x + dx - 0.7, y - 2.5, 1.4, 5, 0.5); g.fill(); }
      });
      for (let k = 0; k < 10; k++) {
        const r = morseKey(k), v = (k + 1) % 10;
        button(d, r.x, r.y, r.w, r.h, -1, 2, d.look === 'color' ? String(v) : '');
        if (tacto(d)) braille(d, r.x + 4.5, r.y + 0.8, 6, 8.4, v);
      }
      button(d, 8, 70, 30, 8, -1, 2, d.look === 'color' ? 'BORRAR' : '');
      button(d, 62, 70, 30, 8, -1, 2, d.look === 'color' ? 'OK' : '');
      if (tacto(d) && !d.glow) { g.beginPath(); g.moveTo(18, 72); g.lineTo(28, 76); g.moveTo(28, 72); g.lineTo(18, 76); g.moveTo(70, 74); g.lineTo(84, 74); feel(d, 1); g.stroke(); }
      break;
    }
    case 'maze': {
      if (!tacto(d)) {
        lcd(d, 8, 10, 54, 54, '');
        if (!d.glow) {
          g.font = '800 4px system-ui, sans-serif'; g.fillStyle = '#333'; g.textAlign = 'center'; g.textBaseline = 'middle';
          for (let k = 0; k < 5; k++) { const [x, y] = mazeXY(k, k); g.fillText(String(k + 1), x, 6.5); g.fillText('ABCDE'[k], 4.2, y); }
        }
        for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const [px, py] = mazeXY(x, y); circle(g, px, py, 1); g.fillStyle = 'rgba(125,255,154,0.45)'; g.fill(); }
        const [gx, gy] = mazeXY(m.gx, m.gy), [px, py] = mazeXY(m.x, m.y);
        g.save(); g.shadowBlur = 4;
        circle(g, gx, gy, 3.6); g.shadowColor = g.strokeStyle = '#3dff6e'; g.lineWidth = 1.4; g.stroke();
        circle(g, px, py, 3); g.shadowColor = g.fillStyle = '#ff4040'; g.fill();
        g.restore();
      } else lcd(d, 8, 10, 54, 54, '');
      braille(d, 68, 8, 22, 26, m.n);
      DPAD(79, 58, 10).forEach(([x, y], k) => arrowBtn(d, x, y, 10, k));
      label(d, 'LABERINTO', 64, MH - 3);
      break;
    }
    case 'switch': {
      SW_X.forEach((x, i) => {
        led(d, x + 6, 10, 3.6, m.led[i]);
        if (!d.glow) {
          rr(g, x, 20, 12, 32, 2);
          if (tacto(d)) { feel(d, 1); g.stroke(); } else { g.fillStyle = '#3a3d44'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); }
          const up = m.up[i], ly = up ? 24 : 40;
          rr(g, x + 3, ly, 6, 8, 1.5);
          if (tacto(d)) { feel(d, 1.6); g.stroke(); } else { g.fillStyle = '#d9d9d9'; g.fill(); g.strokeStyle = INK; g.stroke(); }
        }
        braille(d, x + 1, 56, 10, 16, m.num[i]);
      });
      button(d, 86, 22, 10, 34, -1, 2.5, d.look === 'color' ? 'OK' : '');
      label(d, 'PALANCAS', 6, MH - 2.5);
      break;
    }
    case 'press': {
      if (!d.glow) {
        g.beginPath(); g.arc(32, 50, 24, Math.PI, Math.PI * 2); g.closePath();
        if (tacto(d)) { feel(d, 1, 0); g.stroke(); }
        else {
          g.fillStyle = '#efe9d6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
          const zones: [number, number, string][] = [[0, 0.6, '#2fb344'], [0.6, 0.82, '#f7c600'], [0.82, 1, '#e53935']];
          for (const [a, b, c] of zones) { g.beginPath(); g.arc(32, 50, 20, Math.PI * (1 + a), Math.PI * (1 + b)); g.strokeStyle = c; g.lineWidth = 4; g.stroke(); }
        }
      }
      if (!tacto(d)) {
        const a = Math.PI * (1 + Math.min(1, m.p)), shake = m.p > 0.82 ? Math.sin(d.t * 60) * 0.03 : 0;
        g.beginPath(); g.moveTo(32, 50); g.lineTo(32 + Math.cos(a + shake) * 19, 50 + Math.sin(a + shake) * 19);
        g.strokeStyle = d.glow ? '#ff8a80' : '#c62828'; g.lineWidth = 1.8; g.lineCap = 'round'; g.stroke();
        if (d.glow) { g.save(); g.shadowColor = '#ff8a80'; g.shadowBlur = 4; g.stroke(); g.restore(); }
      }
      roundBtn(d, 76, 46, 14, 0);
      label(d, 'PRESIÓN', 18, 64);
      break;
    }
    case 'alarm': {
      const on = m.on;
      if (!tacto(d)) {
        circle(g, 50, 13, 7);
        if (on) { g.save(); g.fillStyle = Math.floor(d.t * 6) % 2 ? '#ff2a2a' : '#8a0000'; g.shadowColor = '#ff2a2a'; g.shadowBlur = on ? 14 : 0; g.fill(); g.restore(); }
        else if (!d.glow) { g.fillStyle = '#5a1716'; g.fill(); }
        if (!d.glow) { g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); }
        lcd(d, 70, 6, 24, 12, on ? String(Math.ceil(m.left)).padStart(2, '0') : '--', '#ff6b6b', 8);
      } else if (!d.glow) { circle(g, 50, 13, 7); feel(d, 1, 0); g.stroke(); }
      for (let k = 0; k < 6; k++) {
        const [x, y] = ALARM_XY(k);
        roundBtn(d, x, y, 9, -1);
        if (m.hot[k]) heat(d, x, y, 9);
      }
      label(d, `ALARMA · ${ALARM_T} s`);
      break;
    }
  }
  if (m.done && !isChaos(m.k)) lid(d);
}
// Módulo desactivado: se cierra una tapa (se ve y se toca) con su luz verde
function lid(d: DC) {
  const g = d.g;
  if (!d.glow) {
    rr(g, 6, 6, MW - 12, MH - 12, 5);
    if (tacto(d)) {
      g.fillStyle = '#0d1018'; g.fill(); feel(d, 1.4); g.stroke();
      g.save(); g.clip(); g.beginPath();
      for (let k = -MH; k < MW; k += 7) { g.moveTo(k, MH); g.lineTo(k + MH, 0); }
      feel(d, 0.6, 0); g.stroke(); g.restore();
    } else {
      const gr = g.createLinearGradient(0, 6, 0, MH - 6);
      gr.addColorStop(0, '#9aa1aa'), gr.addColorStop(1, '#6d737c');
      g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
      g.font = '900 9px system-ui, sans-serif'; g.fillStyle = 'rgba(30,30,36,0.55)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('DESACTIVADO', MW / 2, MH / 2 + 6);
    }
  }
  if (!tacto(d)) led(d, MW / 2, MH / 2 - 10, 6, -1);
}

// ---- Clic: qué hace (solo lo que dispara el CIEGO) ---------------------------------------------------------------
export function hitMod(m: Mod, x: number, y: number): MAct | null {
  if (m.done) return null;
  switch (m.k) {
    case 'cables': {
      if (y < 12 || y > 72) return null;
      const n = m.wires.length;
      let best = -1, bd = 1e9;
      for (let i = 0; i < n; i++) { const dx = Math.abs(x - wireX(n, i)); if (dx < bd) bd = dx, best = i; }
      return bd < 6 && !m.cut[best] ? { a: 'cut', v: best } : null;
    }
    case 'calc': {
      for (let k = 0; k < 12; k++) if (inR(x, y, calcKey(k))) { const v = CALC_KEYS[k]; return v === -1 ? { a: 'clr' } : v === -2 ? { a: 'ok' } : { a: 'key', v }; }
      for (let k = 0; k < 4; k++) if (inR(x, y, calcBtn(k))) return { a: 'btn', v: k };
      return null;
    }
    case 'dir': return dpadHit(x, y, 60, 44, 13);
    case 'maze': return dpadHit(x, y, 79, 58, 10);
    case 'slide': {
      if (inBox(x, y, 80, 60, 15, 12)) return { a: 'ok' };
      for (let i = 0; i < 3; i++) if (Math.abs(x - SLIDE_X[i]) < 8 && y > 8 && y < 64) {
        let p = 0; for (let k = 1; k < 3; k++) if (Math.abs(y - NOTCH_Y[k]) < Math.abs(y - NOTCH_Y[p])) p = k;
        return { a: 'set', v: i * 3 + p };
      }
      return null;
    }
    case 'bells': for (let k = 0; k < 9; k++) { const [bx, by] = bellXY(k); if (Math.hypot(x - bx, y - by) < 9.5) return { a: 'press', v: k }; } return null;
    case 'piano': return y > 33 && x >= keyX(0) && x < keyX(7) ? { a: 'key', v: Math.floor((x - keyX(0)) / 12) } : null;
    case 'dial': {
      if (inBox(x, y, 4, 67, 14, 10, 1)) return { a: 'turn', v: -1 };
      if (inBox(x, y, 50, 67, 14, 10, 1)) return { a: 'turn', v: 1 };
      for (let k = 0; k < 4; k++) if (inBox(x, y, 70, 7 + k * 17, 24, 13, 1)) return { a: 'btn', v: k };
      return null;
    }
    case 'simon': for (let k = 0; k < 4; k++) if (Math.hypot(x - SIMON[k][0], y - SIMON[k][1]) < 11) return { a: 'btn', v: k }; return null;
    case 'morse': {
      for (let k = 0; k < 10; k++) if (inR(x, y, morseKey(k))) return { a: 'key', v: (k + 1) % 10 };
      if (inBox(x, y, 8, 70, 30, 8)) return { a: 'clr' };
      if (inBox(x, y, 62, 70, 30, 8)) return { a: 'ok' };
      return null;
    }
    case 'switch': {
      if (inBox(x, y, 86, 22, 10, 34, 1)) return { a: 'ok' };
      for (let i = 0; i < 4; i++) if (inBox(x, y, SW_X[i], 20, 12, 32, 1)) return { a: 'flip', v: i };
      return null;
    }
    case 'press': return Math.hypot(x - 76, y - 46) < 15 ? { a: 'pump' } : null;
    case 'alarm': for (let k = 0; k < 6; k++) { const [bx, by] = ALARM_XY(k); if (Math.hypot(x - bx, y - by) < 10) return { a: 'btn', v: k }; } return null;
  }
}
function dpadHit(x: number, y: number, cx: number, cy: number, s: number): MAct | null {
  const p = DPAD(cx, cy, s);
  for (let k = 0; k < 4; k++) if (inBox(x, y, p[k][0], p[k][1], s, s, 1)) return { a: 'dir', v: k };
  return null;
}
// Lo que está bajo la mano (para los sonidos que se descubren tocando)
export function touchMod(m: Mod, x: number, y: number): string | null {
  if (m.done) return null;
  if (m.k === 'bells') { for (let k = 0; k < 9; k++) { const [bx, by] = bellXY(k); if (Math.hypot(x - bx, y - by) < 9.5) return `bell${k}`; } }
  if (m.k === 'morse') { for (let k = 0; k < 3; k++) { const [sx, sy] = sockXY(k); if (Math.hypot(x - sx, y - sy) < 11) return `sock${k}`; } }
  if (m.k === 'dial' && Math.hypot(x - 34, y - 40) < 26) return 'dial';
  return null;
}

// Dónde queda la parte que toca una acción (coordenadas del módulo): el piloto automático lleva la mano ahí
export function actXY(m: Mod, a: MAct): [number, number] {
  const v = a.v ?? 0, mid = (r: { x: number, y: number, w: number, h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
  const dp = (cx: number, cy: number, s: number): [number, number] => { const p = DPAD(cx, cy, s)[v]; return [p[0] + s / 2, p[1] + s / 2]; };
  switch (m.k) {
    case 'cables': return [wireX(m.wires.length, v), 42];
    case 'calc': return a.a === 'btn' ? mid(calcBtn(v)) : mid(calcKey(CALC_KEYS.indexOf(a.a === 'clr' ? -1 : a.a === 'ok' ? -2 : v)));
    case 'dir': return dp(60, 44, 13);
    case 'maze': return dp(79, 58, 10);
    case 'slide': return a.a === 'ok' ? [87, 66] : [SLIDE_X[(v / 3) | 0], NOTCH_Y[v % 3]];
    case 'bells': return bellXY(v) as [number, number];
    case 'piano': return [keyX(v) + 6, 64];
    case 'dial': return a.a === 'turn' ? [v < 0 ? 11 : 57, 72] : [82, 13 + v * 17];
    case 'simon': return SIMON[v] as [number, number];
    case 'morse': return a.a === 'key' ? mid(morseKey((v + 9) % 10)) : a.a === 'clr' ? [23, 74] : [77, 74];
    case 'switch': return a.a === 'ok' ? [91, 39] : [SW_X[v] + 6, 36];
    case 'press': return [76, 46];
    case 'alarm': return ALARM_XY(v) as [number, number];
  }
}

// ---- La bomba entera ---------------------------------------------------------------------------------------------
export const PAD = 8, GAP = 6, STRIP = 22;
export type Layout = { w: number, h: number, cols: number, cells: { x: number, y: number }[], key?: string };
export const MIN_W = 190; // con un solo módulo la tira del reloj igual tiene que entrar
export function layout(n: number, cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3): Layout {
  cols = Math.max(1, Math.min(n, cols));
  const rows = Math.ceil(n / cols);
  const inner = cols * MW + (cols - 1) * GAP, w = Math.max(MIN_W, inner + PAD * 2), x0 = (w - inner) / 2;
  const cells = Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (MW + GAP), y: PAD + STRIP + 4 + Math.floor(i / cols) * (MH + GAP) }));
  return { w, h: STRIP + 4 + rows * MH + (rows - 1) * GAP + PAD * 2, cols, cells };
}
// La grilla que deja los módulos más grandes en un área de aw × ah: con el teléfono parado, 1 o 2 columnas. Cada uno usa la
// suya (la mano viaja en coordenadas del módulo, no de la bomba).
export function fitLayout(n: number, aw: number, ah: number): Layout {
  let best = layout(n), bs = Math.min(aw / best.w, ah / best.h);
  for (let c = 1; c <= Math.min(3, n); c++) {
    const L = layout(n, c), s = Math.min(aw / L.w, ah / L.h);
    if (s > bs * 1.05) best = L, bs = s;
  }
  return best;
}
export const cellAt = (L: Layout, x: number, y: number) => L.cells.findIndex(c => x >= c.x && x <= c.x + MW && y >= c.y && y <= c.y + MH);
export function hitBomb(b: Bomb, L: Layout, x: number, y: number): Act | null {
  const i = cellAt(L, x, y);
  if (i < 0) return null;
  const h = hitMod(b.mods[i], x - L.cells[i].x, y - L.cells[i].y);
  return h ? { m: i, ...h } : null;
}
export function touchBomb(b: Bomb, L: Layout, x: number, y: number): [number, string] | null {
  const i = cellAt(L, x, y);
  if (i < 0) return null;
  const t = touchMod(b.mods[i], x - L.cells[i].x, y - L.cells[i].y);
  return t ? [i, t] : null;
}
export const fmtTime = (s: number) => { const k = Math.max(0, Math.ceil(s)); return `${Math.floor(k / 60)}:${String(k % 60).padStart(2, '0')}`; };

export type BombOpts = { look: Look, glow?: boolean, hand?: { x: number, y: number } | null, t: number, timeShown: number };
// Dibuja la bomba en unidades de bomba (el que llama fija la transformación)
export function drawBomb(g: CanvasRenderingContext2D, b: Bomb, L: Layout, o: BombOpts) {
  const look = o.look, glow = !!o.glow, t = o.t;
  if (!glow) {
    rr(g, 0, 0, L.w, L.h, 10);
    if (look === 'tacto') { g.fillStyle = '#080a10'; g.fill(); g.strokeStyle = FEEL2; g.lineWidth = 2; g.stroke(); }
    else {
      const gr = g.createLinearGradient(0, 0, 0, L.h);
      gr.addColorStop(0, '#556338'), gr.addColorStop(1, '#3a4526');
      g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
      // franjas de peligro en la tira de arriba
      g.save(); rr(g, PAD, PAD, L.w - PAD * 2, STRIP, 4); g.clip();
      g.fillStyle = '#f7c600'; g.fillRect(PAD, PAD, L.w, STRIP);
      g.fillStyle = INK;
      for (let x = -STRIP; x < L.w; x += 12) { g.beginPath(); g.moveTo(x, PAD + STRIP); g.lineTo(x + 6, PAD + STRIP); g.lineTo(x + 6 + STRIP, PAD); g.lineTo(x + STRIP, PAD); g.fill(); }
      g.restore();
    }
  }
  // reloj y errores (solo los ve el que mira; el CIEGO toca vidrio liso)
  const cx = L.w / 2;
  if (look === 'color') {
    rr(g, cx - 30, PAD + 2, 44, STRIP - 4, 3); g.fillStyle = '#1a0b0b'; g.fill();
    if (!glow) { g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke(); }
    const low = o.timeShown < 30, blink = low && Math.floor(t * 4) % 2 === 0;
    g.save(); g.font = '700 15px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = blink ? '#ffb3b3' : '#ff3b3b'; g.shadowColor = '#ff3b3b'; g.shadowBlur = 6;
    g.fillText(fmtTime(o.timeShown), cx - 8, PAD + STRIP / 2 + 0.5); g.restore();
    const miss = b.spec.miss;
    rr(g, cx + 18, PAD + 2, 8 + Math.max(1, miss) * 9, STRIP - 4, 3); g.fillStyle = '#1a0b0b'; g.fill();
    for (let k = 0; k < miss; k++) {
      const x = cx + 26 + k * 9, y = PAD + STRIP / 2, on = k < b.strikes;
      g.save(); g.strokeStyle = on ? '#ff3b3b' : '#3a1b1b'; g.lineWidth = 2.2; g.lineCap = 'round';
      if (on) { g.shadowColor = '#ff3b3b'; g.shadowBlur = 5; }
      g.beginPath(); g.moveTo(x - 3, y - 3); g.lineTo(x + 3, y + 3); g.moveTo(x + 3, y - 3); g.lineTo(x - 3, y + 3); g.stroke(); g.restore();
    }
    if (!glow && L.w >= 300) {
      rr(g, PAD + 4, PAD + 4, 66, STRIP - 8, 3); g.fillStyle = '#f7c600'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      g.font = '900 7.5px system-ui, sans-serif'; g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BANANAZO 3000', PAD + 37, PAD + STRIP / 2 + 0.3);
    }
  } else if (!glow) { rr(g, cx - 30, PAD + 2, 60, STRIP - 4, 3); g.strokeStyle = FEEL2; g.lineWidth = 1; g.stroke(); }
  b.mods.forEach((m, i) => {
    const c = L.cells[i];
    g.save(); g.translate(c.x, c.y);
    const h = o.hand;
    drawMod(m, { g, look, glow, t, mi: i, hx: h ? h.x - c.x : NaN, hy: h ? h.y - c.y : NaN });
    g.restore();
  });
}
