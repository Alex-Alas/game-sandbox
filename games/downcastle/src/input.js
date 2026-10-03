/* Entrada: inclinación (DeviceOrientation, relativa a la calibración), gestos táctiles
   (toque, mantener, deslizar arriba/abajo), modo arrastre y teclado/ratón para depurar en PC.
   Solo traduce: produce input.tilt, input.hold y una cola de eventos 'tap' | 'up' | 'down'. */
import { CFG, SETTINGS, load, store } from './config.js';

const CAL_KEY = 'downcastle.cal';

export const input = {
  hold: false,
  events: [],
  gamma: null,                  // última lectura del sensor (grados)
  gamma0: load(CAL_KEY, null),  // inclinación neutra calibrada
  dragTilt: 0,
  mouseActive: false,
  mouseX: 0,
  keys: { l: false, r: false },
};

const pointers = new Map(); // id → gesto
let steerId = null;          // en modo arrastre, el primer dedo dirige
let getPlayerScreenX = () => null;

function push(e) {
  input.events.push(e);
}

function startGesture(id, x, y, t) {
  const g = { x0: x, y0: y, x, y, t0: t, moved: 0, holding: false, consumed: false, timer: 0 };
  g.timer = setTimeout(() => {
    if (!g.consumed && g.moved < CFG.TAP_PX) { g.holding = true; refreshHold(); }
  }, CFG.HOLD_MS);
  pointers.set(id, g);
  if (steerId == null) steerId = id;
  return g;
}

function moveGesture(id, x, y, t) {
  const g = pointers.get(id);
  if (!g) return;
  g.x = x; g.y = y;
  g.moved = Math.max(g.moved, Math.hypot(x - g.x0, y - g.y0));
  const dx = x - g.x0, dy = y - g.y0;
  if (!g.consumed && !g.holding && Math.abs(dy) > CFG.SWIPE_PX && Math.abs(dy) > 1.5 * Math.abs(dx) && t - g.t0 < CFG.SWIPE_MS) {
    g.consumed = true;
    push(dy < 0 ? 'up' : 'down');
  }
  if (id === steerId) input.dragTilt = Math.max(-1, Math.min(1, dx / CFG.DRAG_PX));
}

function endGesture(id, t) {
  const g = pointers.get(id);
  if (!g) return;
  clearTimeout(g.timer);
  pointers.delete(id);
  if (!g.consumed && !g.holding && g.moved < CFG.TAP_PX && t - g.t0 < CFG.HOLD_MS + 40) push('tap');
  if (id === steerId) { steerId = null; input.dragTilt = 0; }
  refreshHold();
}

function refreshHold() {
  input.hold = [...pointers.values()].some((g) => g.holding);
}

export function initInput(el, opts = {}) {
  if (opts.playerScreenX) getPlayerScreenX = opts.playerScreenX;
  const ui = (e) => e.target instanceof Element && e.target.closest('button, input, .screen');
  el.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || ui(e)) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* */ }
    startGesture(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { input.mouseActive = true; input.mouseX = e.clientX; }
    moveGesture(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  });
  el.addEventListener('pointerup', (e) => endGesture(e.pointerId, e.timeStamp));
  el.addEventListener('pointercancel', (e) => endGesture(e.pointerId, e.timeStamp));
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') { input.keys.l = true; input.mouseActive = false; }
    else if (k === 'ArrowRight' || k === 'KeyD') { input.keys.r = true; input.mouseActive = false; }
    else if (e.repeat) return;
    else if (k === 'Space' || k === 'KeyJ' || k === 'KeyZ') { e.preventDefault(); startGesture('key', 0, 0, e.timeStamp); }
    else if (k === 'ArrowUp' || k === 'KeyW') push('up');
    else if (k === 'ArrowDown' || k === 'KeyS') push('down');
  });
  addEventListener('keyup', (e) => {
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') input.keys.l = false;
    else if (k === 'ArrowRight' || k === 'KeyD') input.keys.r = false;
    else if (k === 'Space' || k === 'KeyJ' || k === 'KeyZ') endGesture('key', e.timeStamp);
  });
  addEventListener('blur', () => {
    input.keys.l = input.keys.r = false;
    for (const id of [...pointers.keys()]) endGesture(id, 1e12);
  });

  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    input.gamma = e.gamma;
    if (input.gamma0 == null) input.gamma0 = e.gamma; // sin calibrar: la primera lectura es la neutra
  });
}

/* Inclinación −1..1 que se manda a la simulación. */
export function readTilt() {
  const k = input.keys;
  if (k.l || k.r) return (k.r ? 1 : 0) - (k.l ? 1 : 0);
  if (input.mouseActive) {
    const px = getPlayerScreenX();
    if (px != null) return Math.max(-1, Math.min(1, (input.mouseX - px) / 40));
  }
  if (SETTINGS.control === 'drag') return input.dragTilt;
  if (input.gamma == null) return input.dragTilt; // sin sensor: el arrastre sirve igual
  const g = input.gamma - (input.gamma0 ?? 0);
  const a = Math.abs(g) - CFG.TILT_DEAD_DEG;
  if (a <= 0) return 0;
  return Math.sign(g) * Math.min(1, a / (CFG.TILT_MAX_DEG - CFG.TILT_DEAD_DEG));
}

export function takeEvents() {
  const ev = input.events;
  input.events = [];
  return ev;
}

/* «Sostené el teléfono como vas a jugar»: guarda la inclinación actual como neutra. */
export function calibrate() {
  if (input.gamma == null) return false;
  input.gamma0 = input.gamma;
  store(CAL_KEY, input.gamma0);
  return true;
}

/* iPhone: el permiso del sensor se pide dentro del mismo toque. */
export async function requestTiltPermission() {
  const DOE = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
  if (!DOE || typeof DOE.requestPermission !== 'function') return true;
  try { return (await DOE.requestPermission()) === 'granted'; } catch { return false; }
}
export const needsTiltPermission = () =>
  typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
