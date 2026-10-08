// Controles táctiles (la sim recibe lo mismo que del teclado). Pensado acostado, con dos pulgares:
// - Joystick FIJO abajo a la izquierda (tocar un punto da la dirección al instante, sin arrastrar: HYPERFLOWGEON).
//   Mueve; ↓ corriendo = barrida; la dirección también guía el dash y, en el esquema JOYSTICK, la liga.
// - A la derecha: SALTO (grande), DASH, GARFIO y ULTI (con su carga). Deslizar de un botón a otro aprieta el nuevo
//   (de GARFIO a SALTO = soltar la liga con impulso).
// - Abajo al centro, la mano: arrastrar desde una carta apunta (la dirección del arrastre, y el largo es la fuerza;
//   se dibuja la trayectoria) y soltar la lanza; volver a la carta cancela. Un toque la lanza con auto-apuntado.
// - Esquema ARRASTRAR para la liga (como Brawl Stars): arrastrar desde GARFIO apunta y soltar dispara; queda
//   enganchada sola hasta tocar GARFIO otra vez o SALTO.
import { NO_INPUT, type Input } from './sim/state.ts';
import { S } from './settings.ts';
import { handRects } from './hud.ts';

type Btn = 'jump' | 'dash' | 'hook' | 'ulti';
const RIGHT: Btn[] = ['jump', 'dash', 'hook', 'ulti'];
type Kind = Btn | 'stick' | 'card' | 'none';
type T = { x: number, y: number, x0: number, y0: number, kind: Kind, slot: number, out: boolean, back: boolean, release: boolean };
const touches = new Map<number, T>();
let shown = matchMedia('(pointer: coarse)').matches;
let tapJump = false, tapDash = false, tapHook = false, tapUlti = false;
const casts: { slot: number, ax: number, ay: number, auto: boolean }[] = [];
let latch = false, pending = false, lastOut = false, fireAim: [number, number] | null = null;

export const visible = () => shown;
export const setShown = (v: boolean) => { shown = v; };
export const STICK_R = 60, BTN_R = 42;
const d2 = (x: number, y: number, c: { x: number, y: number }) => (x - c.x) ** 2 + (y - c.y) ** 2;

// Lugares: por defecto, o los de MOVER CONTROLES (S.touch.pos: distancia a la esquina de abajo de su lado, así
// sobreviven a girar la pantalla). Zurdo: todo espejado.
type Spot = { x: number, y: number, r: number };
export function layout(): Record<'stick' | Btn, Spot> {
  const W = innerWidth, H = innerHeight, rs = STICK_R * S.touch.stick / 100, rb = BTN_R * S.touch.btn / 100;
  const L = S.touch.left;
  const pad = Math.max(14, Math.min(40, W * 0.03));
  const def: Record<'stick' | Btn, [number, number, number]> = { // [desde el borde de su lado, desde abajo, radio]
    stick: [rs + pad + 6, rs + pad, rs], jump: [rb * 1.15 + pad, rb * 1.15 + pad, rb * 1.15], dash: [rb * 3.5 + pad, rb * 0.95 + pad, rb * 0.9],
    hook: [rb * 1.1 + pad, rb * 3.55 + pad, rb * 0.9], ulti: [rb * 3.3 + pad, rb * 3.2 + pad, rb * 0.85],
  };
  const out = {} as Record<'stick' | Btn, Spot>;
  for (const k of ['stick', ...RIGHT] as const) {
    const [d0, b0, r] = def[k], [dx, dy] = S.touch.pos[k] ?? [d0, b0];
    const leftSide = (k === 'stick') !== L, x = leftSide ? dx : W - dx;
    out[k] = { x: Math.max(r, Math.min(W - r, x)), y: Math.max(r, Math.min(H - r, H - dy)), r };
  }
  return out;
}

// MOVER CONTROLES: arrastrar el joystick o un botón lo cambia de lugar
let editing = false, grab: { id: number, k: 'stick' | Btn, ox: number, oy: number } | null = null;
export const isEditing = () => editing;
export function setEditing(on: boolean) { editing = on, grab = null; clearTouch(); if (on) shown = true; }
function editDown(e: PointerEvent) {
  const L = layout();
  let best: 'stick' | Btn | null = null, bd = Infinity;
  for (const k of ['stick', ...RIGHT] as const) { const d = d2(e.clientX, e.clientY, L[k]); if (d < (1.4 * L[k].r) ** 2 && d < bd) best = k, bd = d; }
  if (best) grab = { id: e.pointerId, k: best, ox: L[best].x - e.clientX, oy: L[best].y - e.clientY };
}
function editMove(e: PointerEvent) {
  if (!grab || grab.id !== e.pointerId) return;
  const W = innerWidth, H = innerHeight, x = e.clientX + grab.ox, y = e.clientY + grab.oy;
  const leftSide = (grab.k === 'stick') !== S.touch.left;
  S.touch.pos[grab.k] = [Math.round(leftSide ? x : W - x), Math.round(H - y)];
}
function nearestBtn(x: number, y: number): Btn {
  const L = layout();
  return RIGHT.reduce((a, b) => d2(x, y, L[b]) < d2(x, y, L[a]) ? b : a);
}
function cardAt(x: number, y: number): number {
  const rs = handRects(true);
  for (let k = 0; k < rs.length; k++) { const r = rs[k]; if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 6 && y <= r.y + r.h + 4) return k; }
  return -1;
}
function kindAt(x: number, y: number): { kind: Kind, slot: number } {
  const c = cardAt(x, y);
  if (c >= 0) return { kind: 'card', slot: c };
  const L = layout(), left = S.touch.left ? x > innerWidth / 2 : x < innerWidth / 2;
  if (left) return { kind: 'stick', slot: -1 };
  const b = nearestBtn(x, y);
  return d2(x, y, L[b]) <= (1.7 * L[b].r) ** 2 ? { kind: b, slot: -1 } : { kind: 'none', slot: -1 };
}

let changed: () => void = () => {};
export function bindTouch(cv: HTMLCanvasElement, onAny: () => void) {
  changed = onAny;
  cv.addEventListener('pointerdown', e => {
    if (editing) { editDown(e); return; }
    if (e.pointerType === 'mouse') return;
    shown = true, changed();
    const { kind, slot } = kindAt(e.clientX, e.clientY);
    const t: T = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, kind, slot, out: false, back: false, release: false };
    touches.set(e.pointerId, t);
    if (kind === 'jump') tapJump = true;
    else if (kind === 'dash') tapDash = true;
    else if (kind === 'ulti') tapUlti = true;
    else if (kind === 'hook') {
      if (S.touch.scheme !== 'drag') tapHook = true;
      else if (latch) latch = false, t.release = true;
    }
    if (kind === 'card') {
      const r = handRects(true)[slot];
      t.x0 = r.x + r.w / 2, t.y0 = r.y + r.h / 2;
    }
    if (S.vibrate && kind !== 'stick' && kind !== 'none') navigator.vibrate?.(8);
  });
  cv.addEventListener('pointermove', e => {
    if (editing) { editMove(e); return; }
    const t = touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX, t.y = e.clientY;
    if (t.kind === 'card' || (t.kind === 'hook' && S.touch.scheme === 'drag')) {
      const dead = t.kind === 'card' ? 26 : layout().hook.r * 0.45, out = (t.x - t.x0) ** 2 + (t.y - t.y0) ** 2 > dead * dead;
      if (out) t.out = true, t.back = false;
      else if (t.out) t.back = true;
    } else if (RIGHT.includes(t.kind as Btn)) {
      const k = nearestBtn(t.x, t.y), L = layout();
      if (k !== t.kind && d2(t.x, t.y, L[k]) < (1.2 * L[k].r) ** 2) {
        t.kind = k;
        if (k === 'jump') tapJump = true; else if (k === 'dash') tapDash = true; else if (k === 'ulti') tapUlti = true; else if (S.touch.scheme !== 'drag') tapHook = true;
      }
    }
  });
  const up = (e: PointerEvent) => {
    if (editing) { grab = null; changed(); return; }
    const t = touches.get(e.pointerId);
    touches.delete(e.pointerId);
    if (!t) return;
    if (t.kind === 'card') {
      if (t.out && t.back) return; // volvió a la carta: cancela
      const [ax, ay] = t.out ? dragAim(t) : [0, 0];
      casts.push({ slot: t.slot, ax, ay, auto: !t.out && S.touch.auto });
    }
    if (t.kind === 'hook' && S.touch.scheme === 'drag' && !(t.out && t.back) && !(t.release && !t.out)) pending = true, fireAim = t.out ? dragAim(t) : null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => touches.delete(e.pointerId));
}
const DRAG_R = () => 120 * S.touch.card / 100;
function dragAim(t: T): [number, number] {
  let ax = (t.x - t.x0) / DRAG_R(), ay = (t.y0 - t.y) / DRAG_R();
  const n = Math.sqrt(ax * ax + ay * ay);
  if (n > 1) ax /= n, ay /= n;
  return [ax, ay];
}
function stickVec(t: T): [number, number] {
  const L = layout().stick;
  let x = (t.x - L.x) / L.r, y = (L.y - t.y) / L.r;
  const n = Math.sqrt(x * x + y * y);
  if (n > 1) x /= n, y /= n;
  return [x, y];
}
// Carta que se está apuntando y su mira (para dibujar la trayectoria), o null
export function touchAiming(): { slot: number, ax: number, ay: number } | null {
  for (const t of touches.values()) if (t.kind === 'card' && t.out && !t.back) { const [ax, ay] = dragAim(t); return { slot: t.slot, ax, ay }; }
  return null;
}
export const touchHookDrag = () => { for (const t of touches.values()) if (t.kind === 'hook' && S.touch.scheme === 'drag' && t.out && !t.back) return dragAim(t); return null; };
export function clearTouch(all = false) { touches.clear(); tapJump = tapDash = tapHook = tapUlti = pending = false; casts.length = 0; if (all) latch = false; }
export function afterTick(hooked: boolean) { if (latch && !hooked) latch = false; }

// Entrada táctil de un cuadro. autoAim(slot) resuelve el auto-apuntado de un toque.
export function readTouch(autoAim: (slot: number) => [number, number] | null): Input & { touched: boolean } {
  const i = { ...NO_INPUT, touched: touches.size > 0 || casts.length > 0 };
  let jump = tapJump, dash = tapDash, hook = tapHook, ulti = tapUlti;
  let sx = 0, sy = 0;
  for (const t of touches.values()) {
    if (t.kind === 'jump') jump = true;
    else if (t.kind === 'dash') dash = true;
    else if (t.kind === 'ulti') ulti = true;
    else if (t.kind === 'hook' && S.touch.scheme !== 'drag') hook = true;
    else if (t.kind === 'stick') [sx, sy] = stickVec(t);
  }
  tapJump = tapDash = tapHook = tapUlti = false;
  const dz = S.touch.dead, a = Math.abs(sx);
  i.x = a > dz ? Math.sign(sx) * Math.min(1, (a - dz) / Math.max(0.05, 0.65 - dz)) : 0;
  i.y = Math.abs(sy) > 0.4 ? sy : 0;
  i.jump = jump, i.dash = dash, i.ulti = ulti, i.hook = hook;
  if (S.touch.scheme !== 'drag') { i.ax = sx * 0.5, i.ay = sy * 0.5; } // la liga (y nada más) sigue al joystick
  else {
    const hd = touchHookDrag();
    if (hd) i.ax = hd[0], i.ay = hd[1];
    i.hook = latch;
    if (pending) {
      if (lastOut) i.hook = false;
      else { i.hook = latch = true, pending = false; if (fireAim) i.ax = fireAim[0], i.ay = fireAim[1]; }
    }
    lastOut = i.hook;
  }
  const c = casts.shift();
  if (c) {
    i.cast = c.slot;
    const aa = c.auto ? autoAim(c.slot) : null;
    if (aa) i.ax = aa[0], i.ay = aa[1];
    else if (!c.auto) i.ax = c.ax, i.ay = c.ay;
    else i.ax = i.ay = 0;
  }
  return i;
}

// Dibujo del joystick y los botones (la mano la dibuja hud.ts)
export function drawTouch(ctx: CanvasRenderingContext2D, ulti: number, hooked: boolean, charge: number, dashOk: boolean) {
  if (!shown) return;
  const L = layout(), ts = [...touches.values()], on = new Set(ts.map(t => t.kind));
  const circle = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  circle(L.stick.x, L.stick.y, L.stick.r); ctx.fill(); ctx.stroke();
  const st = ts.find(t => t.kind === 'stick'), [sx, sy] = st ? stickVec(st) : [0, 0];
  ctx.fillStyle = st ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)';
  circle(L.stick.x + sx * L.stick.r, L.stick.y - sy * L.stick.r, 0.4 * L.stick.r); ctx.fill();
  ctx.textAlign = 'center', ctx.textBaseline = 'middle';
  const lab: Record<Btn, string> = { jump: 'SALTO', dash: 'DASH', hook: 'GARFIO', ulti: 'ULTI' };
  for (const k of RIGHT) {
    const b = L[k], held = on.has(k) || (k === 'hook' && latch);
    ctx.fillStyle = held ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.28)';
    circle(b.x, b.y, b.r); ctx.fill();
    ctx.strokeStyle = k === 'hook' && hooked ? '#8ef2ff' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2; ctx.stroke();
    if (k === 'ulti') { // carga de la ulti alrededor
      ctx.strokeStyle = ulti >= 100 ? '#ffd23f' : 'rgba(255,210,63,0.7)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ulti / 100); ctx.stroke();
      if (ulti >= 100) { ctx.fillStyle = `rgba(255,210,63,${0.25 + 0.2 * Math.sin(performance.now() / 120)})`; circle(b.x, b.y, b.r); ctx.fill(); }
    }
    if (k === 'hook') for (let n = 0; n < Math.floor(charge + 1e-6); n++) { ctx.fillStyle = '#8ef2ff'; circle(b.x - 8 + n * 8, b.y + b.r * 0.55, 3); ctx.fill(); }
    if (k === 'dash' && !dashOk) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; circle(b.x, b.y, b.r); ctx.fill(); }
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(b.r * 0.36)}px system-ui, sans-serif`;
    ctx.fillText(lab[k], b.x, b.y);
  }
  if (editing) { // contorno punteado de lo que se puede arrastrar
    ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    for (const k of ['stick', ...RIGHT] as const) { ctx.strokeStyle = grab?.k === k ? '#ffd23f' : 'rgba(255,210,63,0.6)'; circle(L[k].x, L[k].y, L[k].r + 6); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // arrastre de GARFIO (esquema ARRASTRAR)
  const hd = ts.find(t => t.kind === 'hook' && S.touch.scheme === 'drag' && t.out);
  if (hd) {
    ctx.strokeStyle = hd.back ? '#ff6b5b' : '#8ef2ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hd.x0, hd.y0); ctx.lineTo(hd.x, hd.y); ctx.stroke();
    if (hd.back) ctx.fillText('CANCELAR', hd.x0, hd.y0 - L.hook.r - 12);
  }
  // arrastre de una carta: línea desde la carta al dedo
  const cd = ts.find(t => t.kind === 'card' && t.out);
  if (cd) {
    ctx.strokeStyle = cd.back ? '#ff6b5b' : '#ffd23f'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(cd.x0, cd.y0); ctx.lineTo(cd.x, cd.y); ctx.stroke(); ctx.setLineDash([]);
    if (cd.back) { ctx.fillStyle = '#ff6b5b'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillText('CANCELAR', cd.x0, cd.y0 - 50); }
  }
}
export const draggingSlot = () => { for (const t of touches.values()) if (t.kind === 'card') return t.slot; return -1; };
