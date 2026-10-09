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

export function initFullscreen(btn: HTMLButtonElement, toast: (m: string) => void) {
  const sync = () => { btn.textContent = isFs() ? '🗗' : '⛶'; btn.title = isFs() ? 'salir de pantalla completa' : 'pantalla completa'; };
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
