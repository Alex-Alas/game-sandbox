import type { Row } from './menu.ts';

// Controles táctiles (solo entrada y dibujo: la sim recibe lo mismo que del teclado). Joystick FIJO abajo a la
// izquierda: donde se toca es la dirección, sin arrastrar (pedido del usuario), medida desde su centro; mueve y apunta.
// A la derecha, SALTO y GARFIO. Tres esquemas para apuntar el garfio (Ajustes → CONTROLES):
// - JOYSTICK: la mira sigue al joystick; GARFIO mantenido = enganchado; deslizar de GARFIO a SALTO suelta con impulso.
// - ARRASTRAR (como Brawl Stars): arrastrar desde GARFIO apunta y soltar dispara (un toque sin arrastrar: hacia el
//   joystick). La liga queda enganchada sola hasta SALTO o hasta tocar GARFIO otra vez, que suelta y, si se arrastra,
//   apunta la siguiente: soltar y volver a lanzar es un solo gesto. Volver al centro del botón antes de soltar cancela.
// - TOCAR: tocar el mundo apunta ahí y engancha mientras se mantiene (como el ratón); el joystick queda en su círculo.
// Tamaños en % y lugares arrastrables (MOVER CONTROLES; el joystick en la mitad izquierda, los botones en la derecha),
// guardados por main.ts en hfg.ctl. Los lugares son desde la esquina de abajo de su lado: sobreviven a girar la pantalla.
export const CTL_RANGES = {
  STICK_DEAD: [0.25, 0, 0.6, 0.01, 'zona muerta al correr'],
  STICK_FULL: [0.6, 0.2, 1, 0.01, 'a fondo desde'],
  AIM_DEAD: [0.3, 0, 0.8, 0.01, 'zona muerta de la mira'],
  STICK_SIZE: [100, 60, 160, 5, 'joystick %'], // al 60 % los botones miden 14 mm: nunca menos de 12
  BTN_SIZE: [100, 60, 160, 5, 'botones %'],
} satisfies Record<string, Row>;
export type CtlCfg = { [K in keyof typeof CTL_RANGES]: number };
export const CTL_DEFAULTS = Object.fromEntries(Object.entries(CTL_RANGES).map(([k, v]) => [k, v[0]])) as CtlCfg;

export const SCHEMES = [
  { id: 'stick', label: 'JOYSTICK', hint: 'La mira sigue al joystick (sin dirección: adelante y arriba). GARFIO mantenido = enganchado; deslizar de GARFIO a SALTO suelta con impulso.' },
  { id: 'drag', label: 'ARRASTRAR', hint: 'Arrastrá desde GARFIO para apuntar y soltá para lanzar (un toque: hacia el joystick). Queda enganchada hasta SALTO o hasta tocar GARFIO otra vez, que suelta y apunta la siguiente. Volver al centro cancela.' },
  { id: 'tap', label: 'TOCAR', hint: 'Tocá el mundo: la liga va ahí y queda enganchada mientras mantengas el dedo. El joystick responde solo dentro de su círculo.' },
] as const;
export type Scheme = typeof SCHEMES[number]['id'];
type Btn = 'stick' | 'jump' | 'hook';
export type Opts = { scheme: Scheme, pos: Partial<Record<Btn, [number, number]>> };

export const ctl: CtlCfg = { ...CTL_DEFAULTS };
export const opts: Opts = { scheme: 'stick', pos: {} };

const STICK_R = 60, BTN_R = 44; // px al 100 %
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const d2 = (x: number, y: number, c: { x: number, y: number }) => (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);

export function layout() {
  const W = innerWidth, Hh = innerHeight, rs = STICK_R * ctl.STICK_SIZE / 100, rb = BTN_R * ctl.BTN_SIZE / 100;
  const def: Record<Btn, [number, number]> = { stick: [rs + 40, rs + 40], jump: [rb + 36, rb + 36], hook: [3 * rb + 56, rb + 76] };
  const at = (b: Btn, r: number) => {
    const [dx, dy] = opts.pos[b] ?? def[b], left = b === 'stick';
    return { x: clamp(left ? dx : W - dx, left ? r : W / 2 + r, left ? W / 2 - r : W - r), y: clamp(Hh - dy, r, Hh - r), r };
  };
  return { stick: at('stick', rs), jump: at('jump', rb), hook: at('hook', rb) };
}

// Toques: de qué son y, para ARRASTRAR, si salieron de la zona muerta del botón (out), si volvieron (back = cancelar)
// y si al apretar soltaron una liga enganchada (release)
type Kind = Btn | 'world';
type T = { x: number, y: number, kind: Kind, out: boolean, back: boolean, release: boolean };
const touches = new Map<number, T>();
let shown = matchMedia('(pointer: coarse)').matches, jumpTap = false, hookTap = false;
// ARRASTRAR: latch = GARFIO sostenido sin dedo; pending = un disparo al soltar, que sale cuando la sim vio GARFIO
// suelto al menos un cuadro (si no, no sería un apretón nuevo); fireAim = hacia dónde (null: el joystick o la mira sola)
let latch = false, pending = false, lastOut = false, fireAim: [number, number] | null = null;
let editing = false, grab: { id: number, b: Btn, ox: number, oy: number } | null = null;

export const visible = () => shown || editing;
export const isEditing = () => editing;
export const dragging = () => opts.scheme === 'drag' && [...touches.values()].some(t => t.kind === 'hook' && t.out && !t.back);
export function clear(all = false) {
  touches.clear(), grab = null, jumpTap = hookTap = pending = false;
  if (all) latch = false;
}
export function setEditing(on: boolean) { clear(); editing = on; }
// Tras cada paso: si la liga ya no está (falló, la soltó SALTO o se canceló), el GARFIO sostenido se suelta
export function afterTick(hooked: boolean) { if (latch && !hooked) latch = false; }

const dragDead = () => 0.45 * layout().hook.r;
function kindAt(x: number, y: number): Kind {
  const L = layout(), near: Btn = d2(x, y, L.jump) <= d2(x, y, L.hook) ? 'jump' : 'hook';
  if (opts.scheme !== 'tap') return x < innerWidth / 2 ? 'stick' : near;
  if (d2(x, y, L.stick) <= (2 * L.stick.r) ** 2) return 'stick';
  return d2(x, y, L[near]) <= (1.4 * L[near].r) ** 2 ? near : 'world';
}

export function bind(cv: HTMLCanvasElement, changed: () => void) {
  cv.addEventListener('pointerdown', e => {
    if (editing) return editDown(e, cv);
    if (e.pointerType === 'mouse') return;
    shown = true;
    const t: T = { x: e.clientX, y: e.clientY, kind: kindAt(e.clientX, e.clientY), out: false, back: false, release: false };
    touches.set(e.pointerId, t);
    if (t.kind === 'jump') jumpTap = true;
    else if (t.kind === 'world') hookTap = true;
    else if (t.kind === 'hook') {
      if (opts.scheme !== 'drag') hookTap = true;
      else if (latch) latch = false, t.release = true;
    }
  });
  cv.addEventListener('pointermove', e => {
    if (editing) return editMove(e, changed);
    const t = touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX, t.y = e.clientY;
    if (t.kind === 'hook' && opts.scheme === 'drag') {
      const L = layout().hook, out = d2(t.x, t.y, L) > dragDead() ** 2;
      if (out) t.out = true, t.back = false;
      else if (t.out) t.back = true;
    } else if (t.kind === 'jump' || t.kind === 'hook') {
      const L = layout(), k: Btn = d2(t.x, t.y, L.jump) <= d2(t.x, t.y, L.hook) ? 'jump' : 'hook';
      if (k !== t.kind) { t.kind = k; if (k === 'jump') jumpTap = true; else hookTap = true; }
    }
  });
  cv.addEventListener('pointerup', e => {
    if (editing) { grab = null; return; }
    const t = touches.get(e.pointerId);
    touches.delete(e.pointerId);
    if (t?.kind !== 'hook' || opts.scheme !== 'drag' || (t.out && t.back) || (t.release && !t.out)) return;
    pending = true, fireAim = t.out ? dragVec(t) : null;
  });
  cv.addEventListener('pointercancel', e => { touches.delete(e.pointerId); grab = null; });
}

const dragVec = (t: T): [number, number] => { const h = layout().hook; return [t.x - h.x, h.y - t.y]; };
// Del centro del joystick al dedo, en unidades de su radio y con largo hasta 1; y hacia arriba
function stickVec(t: T): [number, number] {
  const L = layout().stick;
  let x = (t.x - L.x) / L.r, y = (L.y - t.y) / L.r;
  const n = Math.sqrt(x * x + y * y);
  if (n > 1) x /= n, y /= n;
  return [x, y];
}

// Mira táctil, sin efectos (la usa también el dibujo): arrastre de GARFIO, punto tocado, joystick (en su zona muerta,
// la mira sola) o null si ningún dedo apunta. world(x, y) pasa de pantalla a vector desde la mano.
export function touchAim(world: (x: number, y: number) => [number, number]): [number, number] | null {
  const ts = [...touches.values()];
  const drag = ts.find(t => t.kind === 'hook' && opts.scheme === 'drag' && t.out && !t.back);
  if (drag) return dragVec(drag);
  const w = ts.find(t => t.kind === 'world');
  if (w) return world(w.x, w.y);
  const st = ts.find(t => t.kind === 'stick');
  if (!st) return null;
  const [x, y] = stickVec(st);
  return x * x + y * y > ctl.AIM_DEAD * ctl.AIM_DEAD ? [x, y] : [0, 0];
}

// Entrada táctil de un cuadro (consume los toques sueltos y el disparo pendiente de ARRASTRAR)
export function touchInput(world: (x: number, y: number) => [number, number]) {
  let x = 0, jump = jumpTap, hook = hookTap;
  for (const t of touches.values()) {
    if (t.kind === 'jump') jump = true;
    else if (t.kind === 'world' || (t.kind === 'hook' && opts.scheme !== 'drag')) hook = true;
    else if (t.kind === 'stick') { // correr: nada en la zona muerta, a fondo desde STICK_FULL
      const sx = stickVec(t)[0], a = Math.abs(sx), dz = ctl.STICK_DEAD;
      if (a > dz) x += Math.sign(sx) * Math.min(1, (a - dz) / Math.max(0.01, ctl.STICK_FULL - dz));
    }
  }
  jumpTap = hookTap = false;
  let aim = touchAim(world);
  if (opts.scheme === 'drag') {
    hook = latch;
    if (pending) {
      if (lastOut) hook = false;
      else hook = latch = true, pending = false, aim = fireAim ?? aim;
    }
    lastOut = hook;
  }
  return { x, jump, hook, aim };
}

// MOVER CONTROLES: arrastrar el joystick o un botón lo cambia de lugar (ratón también)
function editDown(e: PointerEvent, cv: HTMLCanvasElement) {
  const L = layout();
  let best: Btn | null = null, bd = Infinity;
  for (const b of ['stick', 'jump', 'hook'] as const) {
    const d = d2(e.clientX, e.clientY, L[b]);
    if (d <= (1.3 * L[b].r) ** 2 && d < bd) best = b, bd = d;
  }
  if (!best) return;
  grab = { id: e.pointerId, b: best, ox: L[best].x - e.clientX, oy: L[best].y - e.clientY };
  cv.setPointerCapture(e.pointerId);
}
function editMove(e: PointerEvent, changed: () => void) {
  if (!grab || grab.id !== e.pointerId) return;
  const r = layout()[grab.b].r, left = grab.b === 'stick', W = innerWidth, Hh = innerHeight;
  const x = clamp(e.clientX + grab.ox, left ? r : W / 2 + r, left ? W / 2 - r : W - r), y = clamp(e.clientY + grab.oy, r, Hh - r);
  opts.pos[grab.b] = [Math.round(left ? x : W - x), Math.round(Hh - y)];
  changed();
}

export function draw(ctx: CanvasRenderingContext2D) {
  if (!visible()) return;
  const L = layout(), ts = [...touches.values()], on = new Set(ts.map(t => t.kind));
  const circle = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); };
  ctx.lineWidth = 2;
  if (opts.scheme === 'tap' && !editing) { // el joystick solo responde en este círculo
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = '#f2f2e830';
    circle(L.stick.x, L.stick.y, 2 * L.stick.r); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#f2f2e855';
  circle(L.stick.x, L.stick.y, L.stick.r); ctx.stroke();
  const st = ts.find(t => t.kind === 'stick'), [sx, sy] = st ? stickVec(st) : [0, 0];
  ctx.fillStyle = st ? '#f2f2e899' : '#f2f2e844';
  circle(L.stick.x + sx * L.stick.r, L.stick.y - sy * L.stick.r, 0.37 * L.stick.r); ctx.fill();
  ctx.font = `bold ${Math.round(11 * ctl.BTN_SIZE / 100)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [kind, label] of [['jump', 'SALTO'], ['hook', 'GARFIO']] as const) {
    const b = L[kind], held = on.has(kind) || (kind === 'hook' && latch);
    ctx.fillStyle = held ? '#f2f2e855' : '#f2f2e818';
    circle(b.x, b.y, b.r); ctx.fill();
    ctx.strokeStyle = kind === 'hook' && latch ? '#5ec8ff' : '#f2f2e866'; // enganchada sola (ARRASTRAR): color de la liga
    ctx.stroke();
    ctx.fillStyle = '#f2f2e8cc';
    ctx.fillText(label, b.x, b.y);
  }
  // ARRASTRAR: anillo alrededor de GARFIO, línea y perilla hasta el dedo; roja si volvió al centro (cancela)
  const drag = ts.find(t => t.kind === 'hook' && opts.scheme === 'drag' && t.out);
  if (drag) {
    const h = L.hook, R = 2.2 * h.r, [vx, vy] = dragVec(drag), n = Math.sqrt(vx * vx + vy * vy) || 1, k = Math.min(n, R) / n;
    ctx.strokeStyle = ctx.fillStyle = drag.back ? '#ff6b5b99' : '#e8c07a99';
    ctx.setLineDash([4, 4]);
    circle(h.x, h.y, R); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + vx * k, h.y - vy * k); ctx.stroke();
    circle(h.x + vx * k, h.y - vy * k, 0.35 * h.r); ctx.fill();
    if (drag.back) ctx.fillText('CANCELAR', h.x, h.y - h.r - 12);
  }
  // TOCAR: dónde está el dedo
  for (const t of ts) if (t.kind === 'world') {
    ctx.strokeStyle = '#e8c07a99';
    circle(t.x, t.y, 18); ctx.stroke();
  }
  if (editing) { // contorno punteado de lo que se puede arrastrar
    ctx.setLineDash([6, 5]);
    for (const b of ['stick', 'jump', 'hook'] as const) {
      ctx.strokeStyle = grab?.b === b ? '#e8c07a' : '#e8c07a88';
      circle(L[b].x, L[b].y, L[b].r + 6); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}
