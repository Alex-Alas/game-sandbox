// Retratos ilustrados (Canvas 2D en alta resolución con el entintador de la skill) e íconos de 24 × 24.
import { ICON_DEFS, iconPixels } from './icons.ts';
import { drawEsgrimista } from './esgrimista.ts';
import { drawEstibador } from './estibador.ts';

export const PORTRAITS = [
  { id: 'esgrimista', name: 'DON VÁLVULA', sub: 'El Esgrimista · sable de pistón · dash-corte y parry' },
  { id: 'estibador', name: 'ANCLA', sub: 'El Estibador · martillo-ancla · pogo y garfio' },
];
export const ICONS = Object.entries(ICON_DEFS).map(([id, d]) => ({ id, name: d.name }));

export function drawPortrait(cv: HTMLCanvasElement, id: string) {
  if (id === 'esgrimista') drawEsgrimista(cv); else drawEstibador(cv);
}
export function drawIcon(cv: HTMLCanvasElement, id: string) {
  const px = iconPixels(id), c = cv.getContext('2d')!;
  c.clearRect(0, 0, 24, 24);
  for (let i = 0; i < px.length; i++) if (px[i]) { c.fillStyle = px[i]; c.fillRect(i % 24, Math.floor(i / 24), 1, 1); }
}
