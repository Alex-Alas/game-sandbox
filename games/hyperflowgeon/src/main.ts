import { init, step, aimDir, raycast, DT, HW, H, HAND, type Input, type State } from './sim/sim.ts';
import { RANGES, DEFAULTS, type Cfg } from './sim/params.ts';
import { PATIO } from './patio.ts';

// HYPERFLOWGEON · F1 paso B: la liga (garfio elástico) en gris. Paso fijo de 60 Hz con render interpolado.
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

// Teclado: ←/→ A/D corren, las flechas y WASD también apuntan, espacio salta, K o Shift = GARFIO (mantener).
// Un botón apretado y soltado entre dos cuadros también cuenta (tapped).
const down = new Set<string>();
const JUMP = ['Space'], HOOK = ['KeyK', 'ShiftLeft', 'ShiftRight'];
const DIRS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
let tapped = false, hookTapped = false;
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (JUMP.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  down.add(e.code);
  if (JUMP.includes(e.code)) tapped = true;
  if (HOOK.includes(e.code)) hookTapped = true;
  if (DIRS.includes(e.code)) mouseAim = false;
  if (e.code === 'KeyR') reset();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('blur', () => { down.clear(); mouseHook = false; });
const has = (...codes: string[]) => codes.some(c => down.has(c));

// Ratón: si se mueve, apunta desde la mano hacia el cursor; clic izquierdo = GARFIO (provisorio: el spec lo deja para ATAQUE)
let mouse = { x: 0, y: 0 }, mouseAim = false, mouseHook = false;
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY }, mouseAim = true; });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) mouseHook = false; });

// Táctil (provisorio hasta el paso C). Joystick FIJO abajo a la izquierda: donde se toca es la dirección, sin arrastrar
// (vale cualquier toque en la mitad izquierda, medido desde el centro fijo); mueve y apunta. A la derecha, SALTO y
// GARFIO: cada dedo es del botón más cercano, así que deslizar de GARFIO a SALTO suelta con impulso en un solo gesto.
const STICK_R = 60, BTN_R = 44; // px
type Touch = { x: number, y: number, kind: 'stick' | 'jump' | 'hook' };
const touches = new Map<number, Touch>();
let touchUI = matchMedia('(pointer: coarse)').matches;
const layout = () => ({
  stick: [STICK_R + 40, innerHeight - STICK_R - 40],
  jump: [innerWidth - BTN_R - 36, innerHeight - BTN_R - 36],
  hook: [innerWidth - 3 * BTN_R - 56, innerHeight - BTN_R - 76],
});
const btnAt = (x: number, y: number): 'jump' | 'hook' => {
  const { jump: j, hook: h } = layout();
  return (x - j[0]) ** 2 + (y - j[1]) ** 2 <= (x - h[0]) ** 2 + (y - h[1]) ** 2 ? 'jump' : 'hook';
};
const press = (kind: Touch['kind']) => { if (kind === 'jump') tapped = true; else if (kind === 'hook') hookTapped = true; };
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') { if (e.button === 0) mouseHook = hookTapped = true; return; }
  touchUI = true;
  const t: Touch = { x: e.clientX, y: e.clientY, kind: e.clientX < innerWidth / 2 ? 'stick' : btnAt(e.clientX, e.clientY) };
  touches.set(e.pointerId, t);
  press(t.kind);
});
cv.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId);
  if (!t) return;
  t.x = e.clientX, t.y = e.clientY;
  if (t.kind !== 'stick' && btnAt(t.x, t.y) !== t.kind) t.kind = btnAt(t.x, t.y), press(t.kind);
});
for (const ev of ['pointerup', 'pointercancel'] as const) cv.addEventListener(ev, e => touches.delete(e.pointerId));
// Del centro fijo al dedo, en unidades de STICK_R y con largo hasta 1; y hacia arriba
function stickVec(t: Touch): [number, number] {
  const [cx, cy] = layout().stick;
  let x = (t.x - cx) / STICK_R, y = (cy - t.y) / STICK_R;
  const n = Math.sqrt(x * x + y * y);
  if (n > 1) x /= n, y /= n;
  return [x, y];
}

// Mira: el joystick si está tocado (en su zona muerta, la mira sola), si no el ratón si se movió, si no las flechas
let cam = { px: 0, py: 0, k: 1 };
function aim(): [number, number] {
  for (const t of touches.values()) if (t.kind === 'stick') {
    const [x, y] = stickVec(t);
    return x * x + y * y > 0.09 ? [x, y] : [0, 0];
  }
  if (mouseAim) return [cam.px + (mouse.x - innerWidth / 2) / cam.k - s.p.x, cam.py + VIEW_OFF - (mouse.y - innerHeight / 2) / cam.k - s.p.y - HAND];
  return [+has('ArrowRight', 'KeyD') - +has('ArrowLeft', 'KeyA'), +has('ArrowUp', 'KeyW') - +has('ArrowDown', 'KeyS')];
}

function input(): Input {
  let x = +has('ArrowRight', 'KeyD') - +has('ArrowLeft', 'KeyA'), jump = tapped || has(...JUMP), hook = hookTapped || mouseHook || has(...HOOK);
  for (const t of touches.values()) {
    if (t.kind === 'jump') jump = true;
    else if (t.kind === 'hook') hook = true;
    else { const sx = stickVec(t)[0], a = Math.abs(sx); if (a > 0.25) x += Math.sign(sx) * Math.min(1, (a - 0.25) / 0.35); } // a fondo desde 0,6
  }
  tapped = hookTapped = false;
  const [ax, ay] = aim();
  return { x: Math.min(Math.max(x, -1), 1), jump, hook, ax, ay };
}

let s: State, prev = { x: 0, y: 0 }, simMs = 0;
// Medición para calibrar: rastro de posiciones, último vuelo y última liga (rapidez máxima enganchado y al soltar)
const trail: { x: number, y: number, c: string }[] = [];
let air: { x: number, y: number, top: number, t: number } | null = null, lastJump = '';
let hookMax = 0, lastHook = '';
function reset() { s = init(PATIO); prev = { x: s.p.x, y: s.p.y }; trail.length = 0; air = null; }
reset();

const speed = () => Math.sqrt(s.p.vx * s.p.vx + s.p.vy * s.p.vy);
function tick(i: Input) {
  prev = { x: s.p.x, y: s.p.y };
  const hooked = !!s.p.hook, t0 = performance.now();
  step(s, PATIO, i, cfg);
  simMs += (performance.now() - t0 - simMs) * 0.05;
  const p = s.p;
  trail.push({ x: p.x, y: p.y, c: p.hook ? '#5ec8ff' : p.ground ? '#8a8f94' : '#ffd84a' });
  if (trail.length > 240) trail.shift();
  if (!p.ground && !air) air = { x: prev.x, y: prev.y, top: p.y, t: s.t - 1 };
  if (air) air.top = Math.max(air.top, p.y);
  if (p.ground && air) {
    lastJump = `vuelo: ${(air.top - air.y).toFixed(2)} m alto · ${Math.abs(p.x - air.x).toFixed(2)} m largo · ${s.t - air.t} cuadros`;
    air = null;
  }
  if (p.hook && !hooked) hookMax = 0;
  if (p.hook) hookMax = Math.max(hookMax, speed());
  if (!p.hook && hooked) lastHook = `liga: máx ${hookMax.toFixed(1)} m/s · suelta a ${speed().toFixed(1)} m/s`;
}

// Metros visibles como mínimo (en vertical u horizontal, lo que entre); el héroe va VIEW_OFF m por debajo del centro
const VIEW_H = 18, VIEW_W = 30, VIEW_OFF = 3;
// Color de la mira según lo que hará la liga con la velocidad actual: verde acelera, amarillo columpia, rojo frena
function effect(dx: number, dy: number): string {
  const v = speed();
  if (v < 2) return '#f2f2e8';
  const cos = (dx * s.p.vx + dy * s.p.vy) / v;
  return cos > 0.5 ? '#6bd66b' : cos < -0.5 ? '#ff6b5b' : '#ffe14a';
}
function draw(a: number) {
  const dpr = devicePixelRatio || 1, W = innerWidth, Hh = innerHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) cv.width = Math.round(W * dpr), cv.height = Math.round(Hh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min(Hh / VIEW_H, W / VIEW_W), p = s.p;
  const px = prev.x + (p.x - prev.x) * a, py = prev.y + (p.y - prev.y) * a;
  cam = { px, py, k };
  const X = (x: number) => W / 2 + (x - px) * k, Y = (y: number) => Hh / 2 - (y - py - VIEW_OFF) * k;

  ctx.fillStyle = '#1b1a1f';
  ctx.fillRect(0, 0, W, Hh);
  // Rejilla de 1 m (más marcada cada 5 m) para medir a ojo
  ctx.lineWidth = 1;
  for (let x = Math.ceil(px - W / 2 / k); x < px + W / 2 / k; x++) {
    ctx.strokeStyle = x % 5 === 0 ? '#3a3740' : '#25242a';
    ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), Hh); ctx.stroke();
  }
  for (let y = Math.ceil(py + VIEW_OFF - Hh / 2 / k); y < py + VIEW_OFF + Hh / 2 / k; y++) {
    ctx.strokeStyle = y % 5 === 0 ? '#3a3740' : '#25242a';
    ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke();
  }
  ctx.fillStyle = '#5b5866';
  for (const r of PATIO.rects) ctx.fillRect(X(r.x0), Y(r.y1), (r.x1 - r.x0) * k, (r.y1 - r.y0) * k);
  for (const t of trail) {
    ctx.fillStyle = t.c;
    ctx.fillRect(X(t.x) - 1.5, Y(t.y) - 1.5, 3, 3);
  }

  // Liga: tensa más gruesa; floja, tenue. Un disparo fallido se ve unos cuadros.
  const hx = X(px), hy = Y(py + HAND);
  if (p.hook) {
    const d = Math.sqrt((p.hook.x - px) ** 2 + (p.hook.y - py - HAND) ** 2);
    ctx.strokeStyle = d > p.hook.rest ? '#e8c07a' : '#e8c07a77';
    ctx.lineWidth = d > p.hook.rest ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(X(p.hook.x), Y(p.hook.y)); ctx.stroke();
    ctx.fillStyle = '#e8c07a';
    ctx.beginPath(); ctx.arc(X(p.hook.x), Y(p.hook.y), 4, 0, 2 * Math.PI); ctx.fill();
  } else {
    if (p.shot && !p.shot.hit && s.t - p.shot.t < 8) {
      ctx.strokeStyle = `rgba(232,192,122,${1 - (s.t - p.shot.t) / 8})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(X(p.shot.x), Y(p.shot.y)); ctx.stroke();
    }
    // Mira: dónde se pegaría la liga si se aprieta ahora (el mismo rayo que usa la simulación)
    const [ax, ay] = aim(), [dx, dy] = aimDir(p, { x: 0, jump: false, ax, ay }, cfg);
    const d = raycast(PATIO, p.x, p.y + HAND, dx, dy, cfg.HOOK_LEN), ready = s.t + 1 >= p.hookT;
    const r = d < 0 ? cfg.HOOK_LEN : d, ex = X(p.x + dx * r), ey = Y(p.y + HAND + dy * r);
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = '#f2f2e840';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    if (d >= 0) {
      ctx.strokeStyle = ctx.fillStyle = ready ? effect(dx, dy) : '#f2f2e855';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, 8, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, 2 * Math.PI); ctx.fill();
    } else {
      ctx.strokeStyle = '#f2f2e840';
      ctx.beginPath(); ctx.moveTo(ex - 5, ey - 5); ctx.lineTo(ex + 5, ey + 5); ctx.moveTo(ex + 5, ey - 5); ctx.lineTo(ex - 5, ey + 5); ctx.stroke();
    }
  }
  ctx.fillStyle = p.hook ? '#5ec8ff' : p.ground ? '#f2f2e8' : '#ffd84a';
  ctx.fillRect(X(px - HW), Y(py + H), 2 * HW * k, H * k);

  // Controles táctiles: joystick fijo con su perilla, SALTO y GARFIO (más claros mientras se tocan)
  if (touchUI) {
    const L = layout(), on = new Set([...touches.values()].map(t => t.kind));
    ctx.lineWidth = 2;
    ctx.strokeStyle = ctx.fillStyle = '#f2f2e855';
    ctx.beginPath(); ctx.arc(L.stick[0], L.stick[1], STICK_R, 0, 2 * Math.PI); ctx.stroke();
    const st = [...touches.values()].find(t => t.kind === 'stick'), [sx, sy] = st ? stickVec(st) : [0, 0];
    ctx.fillStyle = st ? '#f2f2e899' : '#f2f2e844';
    ctx.beginPath(); ctx.arc(L.stick[0] + sx * STICK_R, L.stick[1] - sy * STICK_R, 22, 0, 2 * Math.PI); ctx.fill();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [kind, label] of [['jump', 'SALTO'], ['hook', 'GARFIO']] as const) {
      const [bx, by] = L[kind];
      ctx.fillStyle = on.has(kind) ? '#f2f2e855' : '#f2f2e818';
      ctx.beginPath(); ctx.arc(bx, by, BTN_R, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = '#f2f2e866';
      ctx.stroke();
      ctx.fillStyle = '#f2f2e8cc';
      ctx.fillText(label, bx, by);
    }
  }

  hud.textContent = `HYPERFLOWGEON · F1 paso B${touchUI ? `
joystick fijo: mueve y apunta · GARFIO (mantener) · deslizar a SALTO = soltar con impulso` : ` · R reiniciar
teclado: ←/→ A/D correr · espacio saltar · flechas/WASD apuntan · K o Shift garfio (mantener)
ratón: moverlo apunta · clic garfio`}
vx ${p.vx.toFixed(2).padStart(6)}   vy ${p.vy.toFixed(2).padStart(6)}   |v| ${speed().toFixed(1).padStart(5)}   ${p.hook ? 'liga ' : p.ground ? 'suelo' : 'aire '}   sim ${simMs.toFixed(3)} ms
${lastJump}
${lastHook}`;
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
