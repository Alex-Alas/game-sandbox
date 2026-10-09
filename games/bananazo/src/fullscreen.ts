// Pantalla completa: botón fijo arriba a la derecha (en los menús y en la bomba). En el teléfono además se pide sola al crear
// una sala, unirse o practicar (necesita el gesto de ese toque). Sin API (iPhone) el botón explica cómo agregar la página a
// la pantalla de inicio: desde ahí abre sin barras (manifest + apple-mobile-web-app-capable).
type FsDoc = Document & { webkitFullscreenElement?: Element, webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const doc = document as FsDoc, root = document.documentElement as FsEl;

export const fsSupported = () => !!(root.requestFullscreen || root.webkitRequestFullscreen);
export const isFs = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
export const touchDevice = () => matchMedia('(pointer: coarse)').matches;
const standalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function enterFs() {
  if (isFs() || !fsSupported()) return;
  try {
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    else await root.webkitRequestFullscreen!();
  } catch { /* el navegador lo negó (sin gesto, iframe…) */ }
}
async function exitFs() {
  try { if (doc.exitFullscreen) await doc.exitFullscreen(); else await doc.webkitExitFullscreen?.(); } catch { /* */ }
}
// Al entrar a jugar desde el teléfono (con el gesto del toque que lo pidió)
export function autoFs() { if (touchDevice() && !standalone()) void enterFs(); }

const corners = (d: string) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON_ENTER = corners('<path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/>');
const ICON_EXIT = corners('<path d="M8 3v5H3M17 8h-5V3M12 17v-5h5M3 12h5v5"/>');

export function initFullscreen(btn: HTMLButtonElement, toast: (m: string) => void) {
  const sync = () => {
    btn.innerHTML = isFs() ? ICON_EXIT : ICON_ENTER;
    btn.title = btn.ariaLabel = isFs() ? 'salir de pantalla completa' : 'pantalla completa';
    btn.hidden = standalone() && !isFs(); // abierta desde la pantalla de inicio ya no tiene barras
  };
  btn.onclick = () => {
    if (!fsSupported()) { toast('Este navegador no deja. En iPhone: Compartir → «Agregar a inicio» y abrilo desde ahí: se juega sin barras.'); return; }
    void (isFs() ? exitFs() : enterFs());
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}
