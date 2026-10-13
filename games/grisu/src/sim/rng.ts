// Azar con semilla en el estado (mulberry32): misma semilla y mismas entradas, mismo estado
import type { State } from './state.ts';

export function rnd(s: State): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
