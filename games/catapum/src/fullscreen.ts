// Pantalla completa: botón fijo siempre visible (en los menús arriba a la derecha; en partida al lado de la pausa),
// la tecla F11 del navegador sigue andando igual. En el teléfono, al entrar se intenta trabar la pantalla acostada.
// Sin API (iPhone) el botón sugiere «Agregar a inicio» (ahí la página abre sin barras).
import { S } from './settings.ts';

type FsDoc = Document & { webkitFullscreenElement?: Element, webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const doc = document as FsDoc, root = document.documentElement as FsEl;

export const fsSupported = () => !!(root.requestFullscreen || root.webkitRequestFullscreen);
export const isFs = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

export async function enterFs() {
  if (isFs() || !fsSupported()) return;
  try {
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
    else await root.webkitRequestFullscreen!();
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (matchMedia('(pointer: coarse)').matches) await o.lock?.('landscape').catch(() => {});
  } catch { /* el navegador lo negó (sin gesto del usuario, iframe…) */ }
}
export async function exitFs() {
  try { if (doc.exitFullscreen) await doc.exitFullscreen(); else await doc.webkitExitFullscreen?.(); } catch { /* */ }
}
export const toggleFs = () => isFs() ? exitFs() : enterFs();

// Al empezar una partida, si está el ajuste (necesita el gesto del clic que la empezó)
export function autoFs() { if (S.fsAuto) void enterFs(); }

// Íconos del botón (cuatro esquinas hacia afuera / hacia adentro)
const corners = (d: string) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON_ENTER = corners('<path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/>');
const ICON_EXIT = corners('<path d="M8 3v5H3M17 8h-5V3M12 17v-5h5M3 12h5v5"/>');

export function initFullscreen(btn: HTMLButtonElement, toast: (m: string) => void) {
  const sync = () => { btn.innerHTML = isFs() ? ICON_EXIT : ICON_ENTER; btn.title = isFs() ? 'salir de pantalla completa' : 'pantalla completa'; };
  btn.onclick = () => {
    if (!fsSupported()) { toast('Este navegador no deja: agregá la página a la pantalla de inicio (Compartir → Agregar a inicio) para jugar sin barras.'); return; }
    void toggleFs();
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}
// En partida el botón va al lado de la pausa; en los menús, arriba a la derecha
export const fsInGame = (on: boolean) => document.body.classList.toggle('ingame', on);
