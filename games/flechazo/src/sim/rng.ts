// Azar con semilla (mulberry32). El estado es un número suelto.
export type Rng = { s: number };

export const rng = (seed: number): Rng => ({ s: seed >>> 0 });
export function next(r: Rng) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = Math.imul(r.s ^ (r.s >>> 15), 1 | r.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const int = (r: Rng, n: number) => Math.floor(next(r) * n);
export const range = (r: Rng, a: number, b: number) => a + next(r) * (b - a);
export const pick = <T>(r: Rng, a: readonly T[]): T => a[int(r, a.length)];
export function shuffle<T>(r: Rng, a: readonly T[]): T[] {
  const o = a.slice();
  for (let k = o.length - 1; k > 0; k--) { const j = int(r, k + 1); [o[k], o[j]] = [o[j], o[k]]; }
  return o;
}
// Semilla derivada (una por módulo, una para el manual…): misma entrada, mismo número.
export function hash(...n: number[]) {
  let h = 0x811c9dc5;
  for (const v of n) { h = Math.imul(h ^ (v >>> 0), 0x01000193); h ^= h >>> 13; }
  return h >>> 0;
}
