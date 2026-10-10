// Resolución adaptativa (pura; la usa world.ts, como en ELYTRA): con cuadros de más de ~45 fps baja la escala de la
// resolución y con margen la vuelve a subir; si una subida provoca una bajada enseguida, esa escala queda vetada un rato.
// Si bajar no mejoró nada, el límite no es la GPU (p. ej. los 30 fps del ahorro de batería del teléfono): vuelve a la
// escala anterior y espera 20 s antes de volver a probar.
export type Res = { scale: number, avg: number, timer: number, clock: number, hold: number, lastUp: number, ceil: number, ceilUntil: number, before: number };
export const newRes = (): Res => ({ scale: 1, avg: 16.7, timer: 0, clock: 0, hold: 0, lastUp: -99, ceil: 1, ceilUntil: 0, before: 0 });
export const SLOW = 22, FAST = 17.6; // ms por cuadro: bajar por encima, subir por debajo

// Un cuadro de `frameMs`; devuelve true si cambió la escala
export function adaptRes(r: Res, frameMs: number, minScale: number): boolean {
  if (!(frameMs > 0) || frameMs > 250) return false; // el primer cuadro (puede venir negativo), pestaña oculta, carga de un nivel…
  r.clock += frameMs / 1000, r.timer += frameMs / 1000;
  r.avg += (Math.min(frameMs, 60) - r.avg) * 0.08; // un tirón suelto no pesa de más (y un teléfono a 8 fps igual baja)
  if (r.timer < 0.7) return false;
  r.timer = 0;
  let s = r.scale;
  if (r.before && r.clock > r.hold - 1.8) {
    if (r.avg > r.before * 0.94) { s = Math.min(1, s + (r.before > 30 ? 0.15 : 0.07)); r.hold = r.clock + 20; } // no sirvió
    r.before = 0;
  } else if (r.avg > SLOW && s > minScale + 1e-6 && r.clock > r.hold) {
    if (r.clock - r.lastUp < 3) { r.ceil = s - 0.05; r.ceilUntil = r.clock + 30; }
    r.before = r.avg;
    s = Math.max(minScale, s - (r.avg > 30 ? 0.15 : 0.07));
    r.hold = r.clock + 2.5;
  } else if (r.avg < FAST && s < 1 && r.clock > r.hold) {
    const cap = r.clock < r.ceilUntil ? r.ceil : 1;
    if (s < cap - 1e-6) { s = Math.min(cap, s + 0.05); r.lastUp = r.clock; r.hold = r.clock + 1.5; }
  }
  if (s === r.scale) return false;
  r.scale = s;
  return true;
}
