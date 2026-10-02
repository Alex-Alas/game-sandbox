/* Combos de estilo: cada truco suma puntos y renueva un plazo para encadenar el
   siguiente; al agotarse, el combo se cobra (puntos × multiplicador). Las acrobacias
   (rasante, tonel al límite, rebote) suben el multiplicador; los enlaces (puertas,
   cristales) solo suman y mantienen vivo el combo, así que volar bien no basta para
   multiplicar. Rozar, chocar o reaparecer lo pierde. Solo puntúa con el crono en
   marcha; el récord se guarda por circuito. Lógica pura: el HUD vive en main.js. */

export const WINDOW = 3;     // s para encadenar el siguiente truco
const MAX_MULT = 10;
const bestKey = (id) => 'elytra.style.' + id;

export const style = {
  active: false,   // vuelta en curso
  pts: 0,          // puntos del combo en curso (sin multiplicar)
  mult: 0,         // nº de trucos encadenados (0 = sin combo)
  window: 0,       // s que quedan para el siguiente truco
  names: [],       // trucos del combo, en orden
  total: 0,        // cobrado en esta vuelta
  best: null,      // récord de estilo del circuito
};

const fresh = () => { style.pts = style.mult = style.window = 0; style.names = []; };

export function initStyle(courseId) {
  try { const v = parseInt(localStorage.getItem(bestKey(courseId)), 10); style.best = v > 0 ? v : null; } catch { /* */ }
}

/** La vuelta arranca (primera puerta). */
export function styleStart() {
  fresh();
  style.total = 0;
  style.active = true;
}

/** Vuelta abandonada (reiniciar carrera). */
export function styleCancel() {
  fresh();
  style.total = 0;
  style.active = false;
}

/** Suma un truco al combo. link: enlace (no sube el multiplicador; abre el combo a ×1).
    Devuelve true si cuenta (hay vuelta en curso). */
export function trick(name, pts, link = false) {
  if (!style.active || pts <= 0) return false;
  style.pts += pts;
  style.mult = Math.min(MAX_MULT, link ? Math.max(1, style.mult) : style.mult + 1);
  style.window = WINDOW;
  style.names.push(name);
  return true;
}

export const comboValue = () => style.pts * style.mult;

function bank() {
  const ev = { type: 'bank', value: comboValue(), mult: style.mult };
  style.total += ev.value;
  fresh();
  return ev;
}

/** Por paso de simulación. hold: el plazo no corre (rasante en curso). Devuelve el
    cobro del combo cuando se agota el plazo, o null. */
export function styleUpdate(dt, hold) {
  if (!style.mult || hold) return null;
  style.window -= dt;
  return style.window <= 0 ? bank() : null;
}

/** Roce, choque o reaparición: el combo sin cobrar se pierde. */
export function styleBreak() {
  if (!style.mult) return null;
  const ev = { type: 'drop', value: comboValue(), mult: style.mult };
  fresh();
  return ev;
}

/** Meta: cobra lo pendiente, cierra la vuelta y guarda el récord. */
export function styleFinish(courseId) {
  if (!style.active) return null;
  if (style.mult) bank();
  style.active = false;
  const record = style.total > 0 && (style.best == null || style.total > style.best);
  if (record) {
    style.best = style.total;
    try { localStorage.setItem(bestKey(courseId), String(style.total)); } catch { /* */ }
  }
  return { total: style.total, record };
}
