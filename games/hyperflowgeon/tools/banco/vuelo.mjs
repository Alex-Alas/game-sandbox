// Prototipo del planeo de Cuauhtli (laboratorio, 2026-10-07; no es código del juego). Modelo de trayectoria: rapidez v y dirección unitaria u. La gravedad tangencial cambia v
// (dv = −g·uy·dt: E = v²/2 + g·y se conserva salvo el arrastre), el arrastre CD·v² la come, el cabeceo gira u con un
// tope de aceleración lateral (más rápido = curvas más abiertas). Debajo de V_STALL: pérdida (la nariz cae, sin control).
// Solo + − × ÷ √ (giro por vector perpendicular y renormalizar). `node vuelo.mjs` corre los experimentos de abajo.
import { DEFAULTS as C } from '../../src/sim/params.ts';
const DT = 1 / 60, g = 2 * C.JUMP_H / C.JUMP_T ** 2;
// Arrastre parásito CD0·v² + inducido CDI/v²: el mínimo cae en V_BEST (= RUN, ~22 m/s) con relación de planeo GR_MAX.
const V_BEST = 22, GR_MAX = 4.5, DMIN = 2 * C.JUMP_H / C.JUMP_T ** 2 / GR_MAX, CD0 = DMIN / (2 * V_BEST ** 2), CDI = CD0 * V_BEST ** 4;
export const GL = { CD0, CDI, V_STALL: 9, A_TURN: 60, W_MAX: 3, IMP: 12, IMP_N: 3, G: 1, VMAX: 50, VMAX_FOLD: 55 };
export function glideStep(b, pitch, P = GL) { // b = { x, y, ux, uy, v }; pitch ∈ [−1, 1] (+ = nariz arriba)
  const gg = g * P.G;
  let w;
  if (b.v < P.V_STALL && !b.fold) { // pérdida: la nariz baja sola hacia −y
    w = (b.ux >= 0 ? -1 : 1) * 4; // gira hacia abajo
  } else w = pitch * Math.min(P.W_MAX, P.A_TURN / b.v) * (b.ux >= 0 ? 1 : -1) * (b.fold ? 0.5 : 1);
  // girar u un ángulo w·dt: u + w·dt·perp(u), renormalizado (perp = (−uy, ux) es antihorario)
  let nx = b.ux - w * DT * b.uy, ny = b.uy + w * DT * b.ux, n = Math.sqrt(nx * nx + ny * ny);
  b.ux = nx / n, b.uy = ny / n;
  // Alas plegadas (picada): sin sustentación ni arrastre inducido y un tercio del parásito; gira la mitad
  const fold = !!b.fold;
  b.v += (-gg * b.uy - (fold ? P.CD0 / 3 : P.CD0) * b.v * b.v - (fold ? 0 : P.CDI / (b.v * b.v))) * DT;
  if (b.v > (fold ? P.VMAX_FOLD : P.VMAX)) b.v = fold ? P.VMAX_FOLD : P.VMAX;
  if (b.v < 3) b.v = 3;
  b.x += b.ux * b.v * DT, b.y += b.uy * b.v * DT;
}
const E = b => b.v * b.v / 2 + g * b.y;
const B = (x, y, vx, vy) => { const v = Math.hypot(vx, vy); return { x, y, ux: vx / v, uy: vy / v, v }; };

if (import.meta.url === `file://${process.argv[1]}`) {
  // a) Planeo recto desde la torre de 16 m saliendo a RUN: ¿hasta dónde llega? (cabeceo para la mejor distancia)
  let best = null;
  for (let pitch = -0.3; pitch <= 0.31; pitch += 0.02) {
    const b = B(0, 16, C.RUN, 0);
    let k = 0;
    // mantiene cabeceo hasta que la trayectoria apunta a la mejor relación de planeo, luego la sostiene
    while (b.y > 0 && k++ < 3000) glideStep(b, b.uy > -0.2 + pitch ? -0.3 : 0.3);
    if (!best || b.x > best.x) best = { x: b.x, pitch, t: k * DT };
  }
  console.log(`a) planeo desde 16 m a RUN: ${best.x.toFixed(1)} m en ${best.t.toFixed(1)} s (ángulo de trayectoria ~${(-0.2 + best.pitch).toFixed(2)} uy)`);
  // b) Sin cabeceo, nivelado a RUN: cuánto tarda en perder la sustentación
  { const b = B(0, 50, C.RUN, 0); let k = 0; while (b.v >= GL.V_STALL && k++ < 2000) glideStep(b, 0); console.log(`b) nivelado a 20 m/s: entra en pérdida a los ${(k * DT).toFixed(2)} s, cayó ${(50 - b.y).toFixed(1)} m`); }
  // c) Picada desde 16 o 30 m lo más abajo posible sin tocar el piso y tirón: cuánto recupera (picada con alas plegadas)
  for (const H of [16, 30]) {
    let res = null;
    for (let pullAt = 0.25; pullAt < H && !res; pullAt += 0.25) {
      const b = B(0, H, C.RUN, 0); let ph = 0, top = -1, vmax = 0, k = 0, minY = H, up = false;
      while (k++ < 4000) {
        if (ph === 0 && b.y < pullAt) ph = 1;
        b.fold = ph === 0;
        glideStep(b, ph === 0 ? (b.uy < -0.97 ? 0 : -1) : (b.uy > 0.97 ? 0 : 1));
        vmax = Math.max(vmax, b.v); minY = Math.min(minY, b.y);
        if (b.y < 0) { top = -1; break; }
        if (ph === 1) { if (b.uy > 0) up = true; top = Math.max(top, b.y); if (up && b.uy < 0 && b.y < top - 0.05) break; }
      }
      if (top > 0 && minY >= 0.3) res = { top, vmax };
    }
    console.log(`c) picada desde ${H} m: v máx ${res.vmax.toFixed(1)} m/s, recupera ${res.top.toFixed(1)} m (${(100 * res.top / H).toFixed(0)} %)`);
  }
  // d) ¿Vuelo perpetuo? Ondas (fugoide) sin impulsos: cuánta energía se pierde por ciclo
  {
    const b = B(0, 30, 30, 0); const e0 = E(b); let k = 0, cycles = 0, lastUy = 0;
    while (k++ < 60 * 20 && b.y > 0) { glideStep(b, b.uy < -0.5 ? 1 : b.uy > 0.3 ? -1 : 0); }
    console.log(`d) 20 s haciendo olas desde 30 m a 30 m/s: ${(b.y > 0 ? 'sigue en el aire' : 'tocó el suelo a los ' + (k * DT).toFixed(1) + ' s')}, E ${e0.toFixed(0)} → ${E(b).toFixed(0)}`);
  }
  // (El aleteo de energía fija con tope de crucero vive en prototipos.mjs: el de +12 m/s lineales se descartó.)
}
