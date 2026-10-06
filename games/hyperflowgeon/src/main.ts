import { init, step, DT, HW, H, type Input, type State } from './sim/sim.ts';
import { RANGES, DEFAULTS, type Cfg } from './sim/params.ts';
import { PATIO } from './patio.ts';

// HYPERFLOWGEON · F1 paso A: correr y saltar en gris. Paso fijo de 60 Hz con render interpolado.
const cv = document.getElementById('game') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
const hud = document.getElementById('hud')!;

// Ajustes: deslizadores nativos generados desde RANGES y guardados en localStorage
const cfg: Cfg = { ...DEFAULTS };
const keys = Object.keys(RANGES) as (keyof Cfg)[];
try {
  const saved = JSON.parse(localStorage.getItem('hfg.cfg') ?? '{}');
  for (const k of keys) if (typeof saved[k] === 'number') cfg[k] = saved[k];
} catch { /* sin almacenamiento: valores por defecto */ }
const save = () => { try { localStorage.setItem('hfg.cfg', JSON.stringify(cfg)); } catch { /* idem */ } };
const shows = keys.map(k => {
  const [, min, max, stp, label] = RANGES[k];
  const row = document.createElement('label');
  row.innerHTML = `<span title="${k}">${label}</span><input type="range" min="${min}" max="${max}" step="${stp}"><output></output>`;
  const inp = row.querySelector('input')!, out = row.querySelector('output')!;
  inp.oninput = () => { cfg[k] = +inp.value; out.textContent = inp.value; save(); };
  document.getElementById('rows')!.append(row);
  return () => { inp.value = String(cfg[k]); out.textContent = String(cfg[k]); };
});
shows.forEach(f => f());
document.getElementById('copy')!.onclick = () => navigator.clipboard?.writeText(JSON.stringify(cfg));
document.getElementById('reset')!.onclick = () => { Object.assign(cfg, DEFAULTS); save(); shows.forEach(f => f()); };
document.getElementById('tune')!.addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur()); // el teclado vuelve al juego

// Teclado. Un SALTO apretado y soltado entre dos cuadros también cuenta (tapped).
const down = new Set<string>();
const JUMP = ['Space', 'ArrowUp', 'KeyW'];
let tapped = false;
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (JUMP.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  down.add(e.code);
  if (JUMP.includes(e.code)) tapped = true;
  if (e.code === 'KeyR') reset();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('blur', () => down.clear());
const has = (...codes: string[]) => codes.some(c => down.has(c));

// Táctil (provisorio hasta el paso C): mitad izquierda = joystick flotante horizontal, mitad derecha = SALTO.
// El origen del joystick sigue al dedo si se pasa de STICK_R: volver hacia el otro lado es inmediato.
const STICK_R = 48; // px de recorrido hasta x = ±1
const touches = new Map<number, { x0: number, y0: number, x: number, stick: boolean }>();
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const stick = e.clientX < innerWidth / 2;
  touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, stick });
  if (!stick) tapped = true;
});
cv.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId);
  if (!t) return;
  t.x = e.clientX;
  t.x0 = Math.min(Math.max(t.x0, t.x - STICK_R), t.x + STICK_R);
});
for (const ev of ['pointerup', 'pointercancel'] as const) cv.addEventListener(ev, e => touches.delete(e.pointerId));
const stickX = (t: { x0: number, x: number }) => (t.x - t.x0) / STICK_R;

function input(): Input {
  let x = +has('ArrowRight', 'KeyD') - +has('ArrowLeft', 'KeyA'), jump = tapped || has(...JUMP);
  for (const t of touches.values()) if (!t.stick) jump = true; else if (Math.abs(stickX(t)) > 0.2) x += stickX(t);
  tapped = false;
  return { x: Math.min(Math.max(x, -1), 1), jump };
}

let s: State, prev = { x: 0, y: 0 }, simMs = 0;
// Medición para calibrar: rastro de posiciones y alto, largo y cuadros del último vuelo
const trail: { x: number, y: number, g: boolean }[] = [];
let air: { x: number, y: number, top: number, t: number } | null = null, lastJump = '';
function reset() { s = init(PATIO); prev = { x: s.p.x, y: s.p.y }; trail.length = 0; air = null; }
reset();

function tick(i: Input) {
  prev = { x: s.p.x, y: s.p.y };
  const t0 = performance.now();
  step(s, PATIO, i, cfg);
  simMs += (performance.now() - t0 - simMs) * 0.05;
  const p = s.p;
  trail.push({ x: p.x, y: p.y, g: p.ground });
  if (trail.length > 180) trail.shift();
  if (!p.ground && !air) air = { x: prev.x, y: prev.y, top: p.y, t: s.t - 1 };
  if (air) air.top = Math.max(air.top, p.y);
  if (p.ground && air) {
    lastJump = `vuelo: ${(air.top - air.y).toFixed(2)} m alto · ${Math.abs(p.x - air.x).toFixed(2)} m largo · ${s.t - air.t} cuadros`;
    air = null;
  }
}

const VIEW_H = 14, VIEW_W = 24; // metros visibles como mínimo (en vertical u horizontal, lo que entre)
function draw(a: number) {
  const dpr = devicePixelRatio || 1, W = innerWidth, Hh = innerHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) cv.width = Math.round(W * dpr), cv.height = Math.round(Hh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min(Hh / VIEW_H, W / VIEW_W), p = s.p;
  const px = prev.x + (p.x - prev.x) * a, py = prev.y + (p.y - prev.y) * a;
  const X = (x: number) => W / 2 + (x - px) * k, Y = (y: number) => Hh / 2 - (y - py - 2) * k;

  ctx.fillStyle = '#1b1a1f';
  ctx.fillRect(0, 0, W, Hh);
  // Rejilla de 1 m (más marcada cada 5 m) para medir a ojo
  ctx.lineWidth = 1;
  for (let x = Math.ceil(px - W / 2 / k); x < px + W / 2 / k; x++) {
    ctx.strokeStyle = x % 5 === 0 ? '#3a3740' : '#25242a';
    ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), Hh); ctx.stroke();
  }
  for (let y = Math.ceil(py + 2 - Hh / 2 / k); y < py + 2 + Hh / 2 / k; y++) {
    ctx.strokeStyle = y % 5 === 0 ? '#3a3740' : '#25242a';
    ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke();
  }
  ctx.fillStyle = '#5b5866';
  for (const r of PATIO.rects) ctx.fillRect(X(r.x0), Y(r.y1), (r.x1 - r.x0) * k, (r.y1 - r.y0) * k);
  for (const t of trail) {
    ctx.fillStyle = t.g ? '#8a8f94' : '#ffd84a';
    ctx.fillRect(X(t.x) - 1.5, Y(t.y) - 1.5, 3, 3);
  }
  ctx.fillStyle = p.ground ? '#f2f2e8' : '#ffd84a';
  ctx.fillRect(X(px - HW), Y(py + H), 2 * HW * k, H * k);
  // Dedos: anillo donde apoyó y, en el joystick, la perilla
  ctx.strokeStyle = ctx.fillStyle = '#f2f2e866';
  ctx.lineWidth = 2;
  for (const t of touches.values()) {
    ctx.beginPath(); ctx.arc(t.x0, t.y0, STICK_R, 0, 2 * Math.PI); ctx.stroke();
    if (t.stick) { ctx.beginPath(); ctx.arc(t.x, t.y0, 16, 0, 2 * Math.PI); ctx.fill(); }
  }

  hud.textContent = `HYPERFLOWGEON · F1 paso A · R reiniciar
teclado: ←/→ A/D correr · espacio ↑ W saltar
táctil: izquierda mueve · derecha salta
vx ${p.vx.toFixed(2).padStart(6)}   vy ${p.vy.toFixed(2).padStart(6)}   ${p.ground ? 'suelo' : 'aire '}   sim ${simMs.toFixed(3)} ms
${lastJump}`;
}

let acc = 0, last = 0;
function frame(now: number) {
  acc = Math.min(acc + (now - last) / 1000, 0.1); // tras una pausa larga no recupera más de 6 cuadros
  last = now;
  while (acc >= DT) tick(input()), acc -= DT;
  draw(acc / DT);
  requestAnimationFrame(frame);
}
requestAnimationFrame(t => { last = t; frame(t); });

// Depuración: __hfg.advance(n, entrada) simula n cuadros sin rAF
Object.assign(window, {
  __hfg: { state: () => s, cfg, reset, advance: (n: number, i: Input = { x: 0, jump: false }) => { for (let k = 0; k < n; k++) tick(i); return s; } },
});
