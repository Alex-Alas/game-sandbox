// Entrada. Teclado: WASD o flechas caminan, ESPACIO salta, E/F/clic liberan, M mapa, T mejoras, H pista. Ratón con el
// puntero capturado (o arrastrando, si el navegador no deja capturarlo). Táctil (body.touch): la mitad izquierda es un
// joystick que aparece donde apoyás el dedo, la derecha arrastra la mirada y los botones SALTAR y LIBERAR.
export const IN = { fwd: 0, side: 0, jump: false, jumpHit: false, act: false, dx: 0, dy: 0, touch: false, locked: false };
export type Cb = { act(): void, map(): void, shop(): void, hint(): void, pause(): void, gesture(): void, active(): boolean, click(): boolean }; // click: el clic se usó para capturar el puntero

const keys = new Set<string>();
let stick: { id: number, x0: number, y0: number, x: number, y: number } | null = null;
const looks = new Map<number, { x: number, y: number }>();
let drag: { x: number, y: number, moved: number } | null = null;
const STICK_R = 52;

export function setTouch(on: boolean) {
  if (IN.touch === on) return;
  IN.touch = on;
  document.body.classList.toggle('touch', on);
}

export function initInput(cv: HTMLCanvasElement, cb: Cb) {
  const params = new URLSearchParams(location.search);
  if (params.get('touch') === '1' || (matchMedia('(pointer: coarse)').matches && params.get('touch') !== '0')) setTouch(true);
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.closest?.('input')) return;
    cb.gesture();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!cb.active()) return;
    if (e.repeat) { keys.add(e.code); return; }
    keys.add(e.code);
    if (e.code === 'Space') IN.jumpHit = true;
    if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Enter') cb.act();
    if (e.code === 'KeyM') cb.map();
    if (e.code === 'KeyT') cb.shop();
    if (e.code === 'KeyH') cb.hint();
    if (e.code === 'KeyP') cb.pause();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => clearInput());

  // ratón
  let lockT = 0;
  document.addEventListener('pointerlockchange', () => { IN.locked = document.pointerLockElement === cv; lockT = performance.now(); });
  cv.addEventListener('mousedown', (e) => {
    if (IN.touch || !cb.active()) return;
    cb.gesture();
    if (IN.locked) { if (e.button === 0) cb.act(); return; }
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
  });
  addEventListener('mousemove', (e) => {
    if (IN.touch) return;
    if (IN.locked) {
      // al capturar el puntero algunos navegadores mandan un salto enorme: se descarta
      if (performance.now() - lockT < 80 || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      IN.dx += e.movementX, IN.dy += e.movementY;
      return;
    }
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX, drag.y = e.clientY, drag.moved += Math.abs(dx) + Math.abs(dy); IN.dx += dx, IN.dy += dy; }
  });
  addEventListener('mouseup', () => { if (drag && drag.moved < 6 && cb.active() && !cb.click()) cb.act(); drag = null; });

  // táctil sobre el lienzo
  const stickEl = document.getElementById('stick')!, knob = document.getElementById('knob')!;
  const drawStick = () => {
    stickEl.classList.toggle('on', !!stick);
    if (!stick) return;
    stickEl.style.left = `${stick.x0}px`, stickEl.style.top = `${stick.y0}px`;
    const v = stickVec();
    knob.style.transform = `translate(${v[0] * STICK_R}px, ${v[1] * STICK_R}px)`;
  };
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    setTouch(true), cb.gesture();
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch { /* */ }
    if (!stick && e.clientX < innerWidth * 0.45) { stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; drawStick(); }
    else looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  cv.addEventListener('pointermove', (e) => {
    if (stick && e.pointerId === stick.id) { stick.x = e.clientX, stick.y = e.clientY; drawStick(); return; }
    const l = looks.get(e.pointerId);
    if (l) { IN.dx += (e.clientX - l.x) * 2.4, IN.dy += (e.clientY - l.y) * 2.4; l.x = e.clientX, l.y = e.clientY; }
  });
  const up = (e: PointerEvent) => {
    if (stick && e.pointerId === stick.id) { stick = null; drawStick(); }
    looks.delete(e.pointerId);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // botones táctiles: se apretan al apoyar el dedo (sin esperar a soltarlo)
  const hold = (id: string, down: () => void, upF?: () => void) => {
    const el = document.getElementById(id)!;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); cb.gesture(); el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch { /* */ } if (cb.active()) down(); });
    const rel = () => { el.classList.remove('down'); upF?.(); };
    el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel);
  };
  hold('t-jump', () => { IN.jump = true, IN.jumpHit = true; }, () => { IN.jump = false; });
  hold('t-act', () => cb.act());
}

function stickVec(): [number, number] {
  if (!stick) return [0, 0];
  let x = (stick.x - stick.x0) / STICK_R, y = (stick.y - stick.y0) / STICK_R;
  const l = Math.hypot(x, y);
  if (l > 1) x /= l, y /= l;
  if (l < 0.12) return [0, 0];
  return [x, y];
}

// Lo que pide el jugador este cuadro (los toques y la mirada acumulada se consumen)
export function read() {
  const k = (...c: string[]) => c.some(q => keys.has(q)) ? 1 : 0;
  let fwd = k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown'), side = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
  const sv = stickVec();
  if (sv[0] || sv[1]) fwd = -sv[1], side = sv[0];
  const out = { fwd, side, jump: IN.jump || keys.has('Space'), jumpHit: IN.jumpHit, dx: IN.dx, dy: IN.dy };
  IN.jumpHit = false, IN.dx = 0, IN.dy = 0;
  return out;
}

export function clearInput() {
  keys.clear(); looks.clear(); stick = null; drag = null;
  IN.jump = false, IN.jumpHit = false, IN.dx = 0, IN.dy = 0;
  document.getElementById('stick')?.classList.remove('on');
}
