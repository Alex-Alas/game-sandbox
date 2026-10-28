/* Pantalla completa: botón en los menús y junto a la pausa; en el teléfono se pide sola al tocar JUGAR (necesita el gesto).
   Sin API (iPhone) el botón explica cómo agregar la página a la pantalla de inicio. */
const root = document.documentElement;
const supported = () => !!(root.requestFullscreen || root.webkitRequestFullscreen);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const standalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;

export async function enterFs() {
  if (isFs() || !supported()) return;
  try { if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' }); else await root.webkitRequestFullscreen(); } catch { /* el navegador lo negó */ }
}
export const autoFs = () => { if (matchMedia('(pointer: coarse)').matches && !standalone()) enterFs(); };

const svg = (d) => `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ENTER = svg('<path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/>'), EXIT = svg('<path d="M8 3v5H3M17 8h-5V3M12 17v-5h5M3 12h5v5"/>');

export function initFullscreen(btn) {
  const sync = () => {
    btn.innerHTML = isFs() ? EXIT : ENTER;
    btn.title = btn.ariaLabel = isFs() ? 'Salir de pantalla completa' : 'Pantalla completa';
    btn.hidden = standalone() && !isFs(); // abierta desde la pantalla de inicio ya no tiene barras
  };
  btn.onclick = () => {
    if (!supported()) { alert('Este navegador no deja. En iPhone: Compartir → «Agregar a inicio» y abrilo desde ahí: se juega sin barras.'); return; }
    if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else enterFs();
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}
