// Puntería del lado del cliente: la trayectoria que se dibuja mientras apuntás una carta (con la misma física de los
// proyectiles) y el auto-apuntado de un toque (al rival más cercano, con tiro balístico).
import { CARD, projOf } from './sim/cards.ts';
import { castAim } from './sim/combat.ts';
import { solidAt, raycast } from './sim/terrain.ts';
import { HAND_Y, G_PROJ, AIM_R, NO_INPUT, enemies, height, type State, type World, type Pl } from './sim/state.ts';

export const TYPE_COLOR: Record<string, string> = { EXPLOSIVO: '#ff9a3c', RAYO: '#4fe3ff', MOVIMIENTO: '#6fe36a', TRAMPA: '#ff5a5a', APOYO: '#ff8ad8', CUERPO: '#b38bff' };

export type AimDraw = { pts: [number, number][], place?: [number, number], color: string };
export function trajectory(s: State, w: World, p: Pl, id: string, ax: number, ay: number): AimDraw | null {
  const card = CARD[id];
  if (!card || !p.alive) return null;
  const [dx, dy, pw] = castAim(p, { ...NO_INPUT, ax, ay }, card);
  const color = TYPE_COLOR[card.type];
  const hx = p.x + dx * 0.45, hy = p.y + HAND_Y + dy * 0.3;
  if (card.aim === 'self') return { pts: [], color };
  if (card.aim === 'place') {
    const tx = p.x + dx * pw * AIM_R;
    let y = w.m.h;
    while (y > w.m.water && !solidAt(w.T, tx, y)) y -= 0.25;
    return { pts: [], place: [tx, y + 0.3], color };
  }
  const pd = card.proj;
  if (!pd || id === 'caparazon') { // rayos y golpes: una recta
    const L = id === 'bate' ? 2.2 : id === 'katana' ? 7 : id === 'trompeta' ? 7.5 : id === 'iman' ? 18 : 26;
    const r = raycast(w.T, hx, hy, dx, dy, L), d = r.d >= 0 && (id === 'iman' || id === 'katana') ? r.d : L;
    const pts: [number, number][] = [];
    for (let k = 0; k <= d; k += 0.5) pts.push([hx + dx * k, hy + dy * k]);
    return { pts, color };
  }
  const speed = pd.v * (card.aim === 'arc' ? 0.3 + 0.7 * pw : 1);
  let x = hx, y = hy, vx = dx * speed + p.vx * 0.25, vy = dy * speed + p.vy * 0.15;
  const pts: [number, number][] = [];
  const dt = 1 / 30;
  for (let k = 0; k < 75; k++) {
    if (pd.accel) { const v = Math.sqrt(vx * vx + vy * vy), nv = Math.min(pd.vmax ?? 40, v + pd.accel * dt); vx *= nv / v, vy *= nv / v; }
    vy -= G_PROJ * pd.g * dt;
    x += vx * dt, y += vy * dt;
    pts.push([x, y]);
    if (solidAt(w.T, x, y) || y < w.m.water) break;
  }
  return { pts, color };
}

// Tiro balístico bajo para pegar en (dx, dy) con rapidez v y gravedad g (o null si no llega)
export function ballistic(dx: number, dy: number, v: number, g: number): [number, number] | null {
  if (g < 1e-3) { const n = Math.sqrt(dx * dx + dy * dy) || 1; return [dx / n, dy / n]; }
  const v2 = v * v, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0) return null;
  const a = Math.atan2(v2 - Math.sqrt(disc), g * Math.abs(dx));
  return [Math.sign(dx || 1) * Math.cos(a), Math.sin(a)];
}

// Auto-apuntado (toque sin arrastrar): al rival más cercano (preferentemente hacia donde mirás). Devuelve la mira
// (con largo = fuerza) o null (la carta sale hacia adelante).
export function autoAim(s: State, w: World, p: Pl, id: string): [number, number] | null {
  const card = CARD[id];
  if (!card || card.aim === 'self') return null;
  let best: Pl | null = null, bd = Infinity;
  for (const q of s.pl) {
    if (!q.alive || !enemies(s, p, q)) continue;
    const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + (Math.sign(q.x - p.x) === p.face ? 0 : 4);
    if (d < bd) bd = d, best = q;
  }
  if (!best || bd > 34) return null;
  const hx = p.x, hy = p.y + HAND_Y, dx = best.x + best.vx * 0.2 - hx, dy = best.y + height(best) / 2 - hy, n = Math.sqrt(dx * dx + dy * dy) || 1;
  if (card.aim === 'place') return Math.abs(dx) <= AIM_R ? [dx / AIM_R, 0.001] : [Math.sign(dx), 0.001];
  const pd = projOf(id);
  if (card.aim === 'line' || !pd) return [dx / n, dy / n + (pd ? pd.g * 0.012 * n : 0)];
  for (const pw of [0.6, 0.8, 1, 0.45, 0.3]) {
    const sol = ballistic(dx, dy, pd.v * (0.3 + 0.7 * pw), G_PROJ * pd.g);
    if (sol) return [sol[0] * pw, sol[1] * pw];
  }
  return [Math.sign(dx) * 0.7, 0.7];
}
