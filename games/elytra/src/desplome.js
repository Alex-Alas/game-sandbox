/* Modo DESPLOME: vuela a la arena, cruza la ENTRADA y estréllate. Puntúan el daño,
   las fracturas, los golpes, lo derribado y la velocidad de impacto, multiplicados
   por la diana según dónde acaba el torso. Lógica pura: los ganchos, el panel y el
   HUD viven en main.js; la arena (bloques, poses) en world.js.
   Fases: idle → armed (cruzó la ENTRADA) → crashed (chocó) → scored. */
import { ACTIVE, MEDALS } from './course.js';

export const isDesplome = ACTIVE.kind === 'desplome';
export const ARMED_TIMEOUT = 20;   // s desde la ENTRADA sin estrellarse → intento nulo
export const SETTLE_TIMEOUT = 8;   // s desde el choque como máximo hasta puntuar
const KEY = 'elytra.desplome.' + ACTIVE.id;
const DAMAGE_W = 0.05;

function loadBest() {
  try { const v = parseInt(localStorage.getItem(KEY), 10); return v > 0 ? v : null; } catch { return null; }
}

export const dsp = {
  phase: 'idle',
  armT: 0,
  crashT: 0,
  impact: 0,
  result: null,
  best: loadBest(),
};

/** Multiplicador de la diana según la distancia horizontal (m) del torso al centro. */
export const dianaMult = (d) => (d < 8 ? 3 : d < 20 ? 2 : d < 35 ? 1.5 : 1);

export function armAttempt(now) {
  dsp.phase = 'armed';
  dsp.armT = now;
  dsp.result = null;
}

/** El jugador chocó: si el intento estaba armado, empieza a contar. */
export function crashAttempt(now, impact) {
  if (dsp.phase !== 'armed') return false;
  dsp.phase = 'crashed';
  dsp.crashT = now;
  dsp.impact = impact;
  return true;
}

export function resetAttempt() {
  dsp.phase = 'idle';
  dsp.result = null;
}

/** Puntuación final. stats: ragdoll.stats; knocked: derribados; dist: torso→centro (m). */
export function scoreAttempt(stats, knocked, dist) {
  const mult = dianaMult(dist);
  // El daño bruto del ragdoll es del orden de 10⁵: con peso 0,05 queda a la par del resto
  const base = stats.damage * DAMAGE_W + stats.fractures * 400 + stats.bounces * 40 + knocked * 150 + dsp.impact * 15;
  const points = Math.round(base * mult);
  const record = points > (dsp.best ?? 0);
  if (record) {
    dsp.best = points;
    try { localStorage.setItem(KEY, String(points)); } catch { /* sin storage */ }
  }
  dsp.phase = 'scored';
  dsp.result = { points, record, mult, knocked, dist, damage: stats.damage, fractures: stats.fractures, bounces: stats.bounces, impact: dsp.impact };
  return dsp.result;
}

/* Medallas por puntos (MEDALS[i].t = mínimo, de mejor a peor). */
export const medalForPoints = (p) => (p == null ? null : MEDALS.find((m) => p >= m.t) ?? null);
export function nextMedalPoints(p) {
  for (let i = MEDALS.length - 1; i >= 0; i--) if (p == null || p < MEDALS[i].t) return MEDALS[i];
  return null;
}
