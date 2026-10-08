// Teclado, ratón y mando (Gamepad API) → Input de la sim. Las cartas se apuntan manteniendo su tecla (o el clic
// derecho / X del mando para la elegida) y salen al soltar: mientras se mantiene, se dibuja la trayectoria.
//   A/D o ←/→ correr · W/S o ↑/↓ dirección (dash, barrida, picada) · ESPACIO salto · SHIFT dash · clic izq. o K
//   garfio · 1–4 cartas, 5 la de la caja (o clic der. la elegida; rueda cambia) · Q ulti · ESC pausa · TAB tabla
// Mando: stick izq. mover, stick der. apuntar, A salto, B dash, LT garfio, X/RT carta elegida, LB/RB cambiar, Y ulti.
import { AIM_R, HAND_Y, NO_INPUT, type Input, type Pl } from './sim/state.ts';
import { toWorld, type View } from './render.ts';
import { S } from './settings.ts';

const keys = new Set<string>(), hit = new Set<string>(); // hit: apretadas desde la última lectura (un toque corto no se pierde)
let mouseX = -1, mouseY = -1, mouseIn = false, lmb = false, rmb = false, lmbHit = false;
let device: 'kb' | 'pad' | 'touch' = 'kb';
const casts: number[] = []; // ranuras soltadas desde la última lectura
let ulti = false, padPrev: boolean[] = [];
export const DESK = { aimSlot: -1, selected: 0, showTable: false, pauseReq: false, onKey: null as null | ((code: string) => boolean) };
export const lastDevice = () => device;
export const setDevice = (d: typeof device) => { device = d; };

const slotOf = (code: string) => ['c1', 'c2', 'c3', 'c4', 'c5'].findIndex(a => S.keys[a]?.includes(code));
const isAct = (a: string, code: string) => !!S.keys[a]?.includes(code);
export function bindDesktop(cv: HTMLCanvasElement) {
  addEventListener('keydown', e => {
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
    if (DESK.onKey && DESK.onKey(e.code)) { e.preventDefault(); return; }
    device = 'kb';
    if (isAct('table', e.code)) DESK.showTable = true, e.preventDefault();
    if (isAct('pause', e.code)) { DESK.pauseReq = true; return; }
    if (e.repeat) return;
    keys.add(e.code), hit.add(e.code);
    const k = slotOf(e.code);
    if (k >= 0) DESK.aimSlot = k;
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
  });
  addEventListener('keyup', e => {
    keys.delete(e.code);
    if (isAct('table', e.code)) DESK.showTable = false;
    const k = slotOf(e.code);
    if (k >= 0 && DESK.aimSlot === k) casts.push(k), DESK.aimSlot = -1;
  });
  addEventListener('blur', () => { keys.clear(); hit.clear(); lmb = rmb = false; DESK.aimSlot = -1; });
  cv.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; mouseX = e.clientX, mouseY = e.clientY, mouseIn = true, device = 'kb'; syncButtons(e.buttons); });
  cv.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; mouseX = e.clientX, mouseY = e.clientY, mouseIn = true, device = 'kb'; syncButtons(e.buttons); });
  cv.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') return; syncButtons(e.buttons); });
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouseIn = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { DESK.selected = (DESK.selected + (e.deltaY > 0 ? 1 : 4)) % 5; e.preventDefault(); }, { passive: false });
}
// Los botones salen de e.buttons (con uno apretado, el segundo llega como pointermove: lo aprendido en HYPERFLOWGEON)
function syncButtons(b0: number) {
  const b = S.mouseSwap ? ((b0 & 1) << 1) | ((b0 & 2) >> 1) | (b0 & ~3) : b0; // con el cambio: izq. = carta, der. = garfio
  lmb = (b & 1) !== 0;
  if (lmb) lmbHit = true;
  const r = (b & 2) !== 0;
  if (r && !rmb) DESK.aimSlot = DESK.selected;
  if (!r && rmb && DESK.aimSlot === DESK.selected) casts.push(DESK.selected), DESK.aimSlot = -1;
  rmb = r;
}
export function cancelAim() { DESK.aimSlot = -1; }
export function clearDesktop() { keys.clear(); hit.clear(); casts.length = 0; lmb = rmb = false; DESK.aimSlot = -1; ulti = false; }

const down = (...acts: string[]) => acts.some(a => (S.keys[a] ?? []).some(k => keys.has(k) || hit.has(k)));

// Mira desde la mano del jugador hacia el ratón (largo 1 = AIM_R metros)
function mouseAim(v: View, p: Pl): [number, number] {
  if (!mouseIn || mouseX < 0) return [0, 0];
  const [wx, wy] = toWorld(v, mouseX, mouseY);
  let ax = (wx - p.x) / AIM_R, ay = (wy - (p.y + HAND_Y)) / AIM_R;
  const n = Math.sqrt(ax * ax + ay * ay);
  if (n > 1) ax /= n, ay /= n;
  if (n < 0.02) ax = p.face * 0.02;
  return [ax, ay];
}
export const mousePos = () => mouseIn ? [mouseX, mouseY] as const : null;

export function readDesktop(v: View | null, p: Pl | null): Input {
  const i: Input = { ...NO_INPUT };
  i.x = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  i.y = (down('up') ? 1 : 0) - (down('down') ? 1 : 0);
  i.jump = down('jump') || (S.wJump && down('up'));
  i.dash = down('dash');
  i.hook = lmb || lmbHit || down('hook');
  lmbHit = false;
  i.ulti = down('ulti');
  if (v && p) [i.ax, i.ay] = mouseAim(v, p);
  // Mando
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of pads) {
    if (!g || !g.connected) continue;
    const b = (k: number) => !!g.buttons[k]?.pressed || (g.buttons[k]?.value ?? 0) > 0.5;
    const dz = (v: number) => Math.abs(v) < 0.2 ? 0 : v;
    const lx = dz(g.axes[0] ?? 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), ly = -dz(g.axes[1] ?? 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
    const rx = dz(g.axes[2] ?? 0), ry = -dz(g.axes[3] ?? 0);
    const any = g.buttons.some(x => x.pressed) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0;
    if (any) device = 'pad';
    if (device !== 'pad') break;
    i.x = Math.max(-1, Math.min(1, lx)), i.y = Math.max(-1, Math.min(1, ly));
    i.jump = b(0), i.dash = b(1), i.hook = b(6), i.ulti = b(3);
    const n = Math.sqrt(rx * rx + ry * ry);
    i.ax = n > 0.25 ? rx : 0, i.ay = n > 0.25 ? ry : 0;
    const now = g.buttons.map((_, k) => b(k));
    if (now[4] && !padPrev[4]) DESK.selected = (DESK.selected + 4) % 5;
    if (now[5] && !padPrev[5]) DESK.selected = (DESK.selected + 1) % 5;
    const cast = now[2] || now[7], was = padPrev[2] || padPrev[7];
    if (cast && !was) DESK.aimSlot = DESK.selected;
    if (!cast && was && DESK.aimSlot >= 0) casts.push(DESK.aimSlot), DESK.aimSlot = -1;
    if (now[9] && !padPrev[9]) DESK.pauseReq = true;
    padPrev = now;
    break;
  }
  if (casts.length) i.cast = casts.shift()!;
  hit.clear();
  void ulti;
  return i;
}
