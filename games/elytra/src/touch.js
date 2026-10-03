/* Controles táctiles. Arrastrar sobre el lienzo dirige (como el ratón); los botones de
   `#touch` y `#pausemenu` (atributo data-key) emiten las mismas teclas que el teclado.
   Este módulo solo traduce gestos: la lógica de cada acción vive en main.js. */

const params = new URLSearchParams(location.search);
export const touch = {
  on: false, // la interfaz táctil está activa (pantalla táctil detectada o ?touch=1)
};

const TAP_PX = 14;   // un toque que se mueve menos que esto es un "tap"
const TAP_MS = 450;
const PINCH_K = 5;   // unidades de zoomInput por píxel de pellizco

function enable() {
  if (touch.on) return;
  touch.on = true;
  document.body.classList.add('touch');
}

/** callbacks: { press(code), release(code), look(dx,dy), pinch(delta), tap(), act(name) } */
export function initTouch(canvas, cb) {
  const coarse = matchMedia('(pointer: coarse)').matches; // puntero principal táctil; un híbrido se activa al primer toque
  if (params.get('touch') === '1' || (coarse && params.get('touch') !== '0')) enable();

  // Sin menú contextual, sin zoom por gesto, sin selección en pulsaciones largas
  document.addEventListener('contextmenu', (e) => { if (touch.on) e.preventDefault(); });
  for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, (e) => e.preventDefault());

  /* ── Arrastre sobre el lienzo ── */
  const ptrs = new Map(); // pointerId → { x, y, t0, moved }
  let pinchDist = 0;
  const pinchNow = () => {
    const [a, b] = [...ptrs.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    enable(); // un dispositivo híbrido se vuelve táctil al primer toque
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, t0: e.timeStamp, moved: 0 });
    if (ptrs.size === 2) {
      for (const p of ptrs.values()) p.moved = 1e3; // dos dedos: nunca es un tap
      pinchDist = pinchNow();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    p.moved += Math.hypot(dx, dy);
    if (ptrs.size === 2) {
      const d = pinchNow();
      cb.pinch((pinchDist - d) * PINCH_K);
      pinchDist = d;
    } else if (ptrs.size === 1) {
      cb.look(dx, dy);
    }
  });

  const end = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (e.type === 'pointerup' && p.moved < TAP_PX && e.timeStamp - p.t0 < TAP_MS) cb.tap();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  /* ── Botones ── cada uno emite la tecla al pulsar y la suelta al levantar */
  for (const btn of document.querySelectorAll('[data-key], [data-act]')) {
    const code = btn.dataset.key, act = btn.dataset.act;
    let down = false;
    const up = () => {
      if (!down) return;
      down = false;
      btn.classList.remove('on');
      if (code) cb.release(code);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (down) return;
      down = true;
      btn.classList.add('on');
      try { btn.setPointerCapture(e.pointerId); } catch { /* */ }
      if (code) cb.press(code);
      if (act) cb.act(act);
    });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('click', (e) => e.stopPropagation()); // el clic emulado no llega al overlay
  }
}
