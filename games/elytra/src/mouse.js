import { CFG } from './config.js';

/* Entrada de ratón: sensibilidad ajustable y filtro de saltos.
   Con el puntero capturado, Chromium en Windows a veces entrega un `movementX/Y`
   enorme y espurio (al capturar, al volver el foco o tras un tirón de frames);
   aplicado tal cual, la cámara pega un salto de decenas de grados. Ningún
   movimiento real llega a SPIKE_PX en un solo evento, así que se descarta. */
const SPIKE_PX = 350;       // delta (px) por encima del cual el evento se considera espurio
const SETTLE_MS = 120;      // tras capturar el puntero / recuperar foco se ignora la entrada

export const SENS_STEPS = [0.3, 0.45, 0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const SKEY = 'elytra.sens';

function loadSens() {
  try {
    const v = parseFloat(localStorage.getItem(SKEY));
    if (SENS_STEPS.includes(v)) return v;
  } catch { /* sin storage */ }
  return 1;
}

let sens = loadSens();
let settleUntil = 0;
export let droppedSpikes = 0;

export const getSens = () => sens;
export const sensLabel = () => 'SENSIBILIDAD ' + sens.toFixed(2).replace(/0$/, '') + '×';

/** Sube/baja un escalón (d = ±1) y lo guarda. Devuelve el nuevo multiplicador. */
export function stepSens(d) {
  const i = SENS_STEPS.indexOf(sens);
  sens = SENS_STEPS[Math.min(SENS_STEPS.length - 1, Math.max(0, i + d))];
  try { localStorage.setItem(SKEY, String(sens)); } catch { /* sin storage */ }
  return sens;
}

/** Ignora la entrada un instante (captura del puntero, foco recuperado). */
export function settleMouse(now = performance.now()) { settleUntil = now + SETTLE_MS; }

/** Convierte un movimiento crudo en radianes de giro, o null si debe descartarse. */
export function mouseToRadians(dx, dy, now = performance.now()) {
  if (now < settleUntil) return null;
  if (Math.abs(dx) > SPIKE_PX || Math.abs(dy) > SPIKE_PX) { droppedSpikes++; return null; }
  const k = CFG.MOUSE_SENS * sens;
  return [dx * k, dy * k];
}

/** Arrastre táctil (px) → radianes de giro. Comparte el escalón de sensibilidad del ratón. */
export function touchToRadians(dx, dy) {
  const k = CFG.TOUCH_SENS * sens;
  return [dx * k, dy * k];
}
