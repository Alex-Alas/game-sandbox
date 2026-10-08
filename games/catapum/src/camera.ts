// Cámara compartida estilo Smash: encuadra a todos los vivos (y a vos, siempre) con margen, entre un zoom mínimo y
// uno máximo, y se mueve suave. Si no entran todos, prioriza al jugador local y a los más cercanos.
import type { State, World } from './sim/state.ts';
import type { View } from './render.ts';

export type Cam = { x: number, y: number, view: number, init: boolean };
export const newCam = (): Cam => ({ x: 0, y: 0, view: 20, init: false });

export function frame(cam: Cam, s: State, w: World, me: number, W: number, H: number, dt: number, mode: string, ip: (k: string, x: number, y: number) => [number, number]): View {
  const m = w.m, aspect = W / H;
  const pts: [number, number][] = [];
  const mine = me >= 0 ? s.pl[me] : null;
  for (const p of s.pl) if (p.alive) pts.push(ip('p' + p.id, p.x, p.y + 0.6));
  let minV = 19, maxV = Math.min(m.h + 6, (m.w + 12) / aspect);
  if (aspect < 1) minV = 22, maxV = Math.max(maxV, 34); // en vertical se necesita ver más alto
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const use = mode === 'yo' && mine?.alive ? [ip('p' + mine.id, mine.x, mine.y + 0.6)] : pts;
  for (const [x, y] of use) x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y);
  if (!use.length) x0 = 0, x1 = m.w, y0 = m.water, y1 = m.h * 0.7;
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let view = Math.max(minV, (y1 - y0) + 9, ((x1 - x0) + 12) / aspect);
  if (view > maxV && mine?.alive) { // no entran todos: el propio manda, con los que quepan
    const [mx, my] = ip('p' + mine.id, mine.x, mine.y + 0.6);
    view = maxV;
    const hw = view * aspect / 2 - 4, hh = view / 2 - 3;
    cx = Math.max(mx - hw, Math.min(mx + hw, cx)), cy = Math.max(my - hh, Math.min(my + hh, cy));
  }
  view = Math.min(view, Math.max(maxV, minV));
  // no mostrar mucho debajo del agua ni muy afuera del mapa
  cy = Math.max(cy, m.water - 2 + view * 0.38);
  const f = cam.init ? 1 - Math.exp(-dt * 4) : 1, fz = cam.init ? 1 - Math.exp(-dt * 2.5) : 1;
  cam.x += (cx - cam.x) * f, cam.y += (cy - cam.y) * f, cam.view += (view - cam.view) * fz, cam.init = true;
  const k = H / cam.view;
  return { k, ox: W / 2 - cam.x * k, oy: H / 2 + cam.y * k, W, H, dpr: 1 };
}
