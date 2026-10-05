// VÓRTICE — patrones de muros (solo datos y azar, sin geometría).
// Un patrón es una lista de anillos { open: [lados libres], dur? }: `dur` (s) alarga el
// anillo en un túnel; si falta, el anillo es fino. sim.js los coloca en radio con la
// separación mínima para que sean siempre pasables (ver `layout` en sim.js).
import { SIDES } from './const.js';

const mod = (n) => ((n % SIDES) + SIDES) % SIDES;
const range = (a, b, rng) => a + Math.floor(rng() * (b - a + 1));

// Cada patrón: desde qué segundo (de dificultad) aparece y con qué peso
const LIB = {
  c: { from: 0, w: 4, make: (rng) => {
    const n = range(1, 3, rng); let g = range(0, 5, rng); const out = [];
    for (let i = 0; i < n; i++) { out.push({ open: [g] }); g = mod(g + range(1, 5, rng)); }
    return out;
  } },
  alt: { from: 0, w: 3, make: (rng) => {
    const n = range(3, 5, rng); let p = range(0, 1, rng); const out = [];
    for (let i = 0; i < n; i++, p ^= 1) out.push({ open: [p, p + 2, p + 4] });
    return out;
  } },
  tres: { from: 4, w: 2, make: (rng) => {
    const n = range(2, 4, rng); let h = 0; const out = [];
    for (let i = 0; i < n; i++, h ^= 1) out.push({ open: h ? [0, 1, 2] : [3, 4, 5] });
    return out;
  } },
  azar: { from: 0, w: 2, make: (rng) => {
    const n = range(1, 3, rng); const out = [];
    for (let i = 0; i < n; i++) {
      const open = [0, 1, 2, 3, 4, 5].filter(() => rng() < 0.4);
      if (!open.length) open.push(range(0, 5, rng));
      if (open.length === SIDES) open.pop();
      out.push({ open });
    }
    return out;
  } },
  espiral: { from: 10, w: 3, make: (rng) => {
    const n = range(6, 10, rng); const out = [];
    for (let i = 0; i < n; i++) out.push({ open: [i, i + 1] });
    return out;
  } },
  zigzag: { from: 12, w: 2, make: (rng) => {
    const n = range(4, 7, rng); const out = [];
    for (let i = 0; i < n; i++) out.push({ open: [i & 1] });
    return out;
  } },
  doble: { from: 20, w: 2, make: (rng) => {
    const n = range(4, 8, rng); const out = [];
    for (let i = 0; i < n; i++) out.push({ open: [i, i + 3] });
    return out;
  } },
  tunel: { from: 22, w: 2, make: (rng) => {
    const g = range(0, 5, rng);
    return [{ open: [g], dur: 0.45 + rng() * 0.4 }, { open: [mod(g + range(2, 4, rng))] }];
  } },
  remolino: { from: 35, w: 2, make: (rng) => {
    const n = range(8, 14, rng); const out = [];
    for (let i = 0; i < n; i++) out.push({ open: [i] });
    return out;
  } },
  tenaza: { from: 50, w: 1.5, make: (rng) => {
    const g = range(0, 5, rng);
    return [{ open: [g], dur: 0.3 }, { open: [mod(g + 3)] }, { open: [g], dur: 0.3 }];
  } },
};

// Patrón al azar según la dificultad; rotado y a veces espejado
export function nextPattern(rng, d) {
  const pool = Object.entries(LIB).filter(([, p]) => d >= p.from);
  let tot = 0; for (const [, p] of pool) tot += p.w;
  let x = rng() * tot, pick = pool[0];
  for (const e of pool) { x -= e[1].w; if (x <= 0) { pick = e; break; } }
  const rings = pick[1].make(rng);
  const rot = range(0, 5, rng), mir = rng() < 0.5 ? -1 : 1;
  for (const r of rings) r.open = [...new Set(r.open.map((s) => mod(mir * s + rot)))];
  return { name: pick[0], rings };
}
