// Azar con semilla (mulberry32) guardado en el estado: la partida se repite igual con la misma semilla y entradas.
export type Rng = { rng: number };
export function rnd(s: Rng): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rndInt = (s: Rng, n: number) => Math.floor(rnd(s) * n);
export const rndRange = (s: Rng, a: number, b: number) => a + (b - a) * rnd(s);
export function pick<T>(s: Rng, xs: readonly T[]): T { return xs[rndInt(s, xs.length)]; }
