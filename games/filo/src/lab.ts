// Laboratorio de arte: hoja de contactos de un clip (todos sus cuadros en fila, como una hoja de
// animación) en un lienzo 2D. Sirve para revisar poses y dibujo sin el resto de la escena.
//   ?lab=1&c=run&s=4&bg=gray
import { Actor } from './actor.ts';
import type { CharDef } from './chars/types.ts';

export function contactSheet(def: CharDef<any>, clipId: string, scale: number, opts: { cols?: number, warm?: number, flat?: boolean, boil?: number, cell?: number } = {}) {
  const a = new Actor(def, clipId);
  a.scale = scale;
  a.flat = !!opts.flat;
  a.boil = opts.boil ?? a.boil;
  const clip = def.clips[clipId];
  a.play(clipId, true);
  // los loops corren un ciclo antes para que la tela llegue a su régimen
  const warm = opts.warm ?? (clip.loop ? clip.frames / clip.fps : 0);
  const step = 1 / 120;
  for (let t = 0; t < warm; t += step) a.update(step);
  if (clip.loop) { a.t = 0; }
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < clip.frames; f++) {
    const target = f / clip.fps;
    while (a.t + 1e-9 < target) a.update(step);
    a.t = target; a.update(0);
    a.draw(true);
    const c = document.createElement('canvas');
    c.width = a.cv.width; c.height = a.cv.height;
    c.getContext('2d')!.drawImage(a.cv, 0, 0);
    frames.push(c);
  }
  return frames;
}

export function runLab() {
  const q = new URLSearchParams(location.search);
  const cv = document.getElementById('game') as HTMLCanvasElement;
  cv.style.display = 'none';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:' + (q.get('bg') === 'dark' ? '#1b2330' : '#9a9aa2');
  document.body.appendChild(host);
  void import('./chars/hero.ts').then(({ hero }) => {
    const ids = (q.get('c') ?? 'idle').split(',');
    const s = +(q.get('s') ?? 4);
    for (const id of ids) {
      const frames = contactSheet(hero, id, s, { flat: q.has('flat') });
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:flex-end;gap:0;padding:6px;border-bottom:1px solid #0003';
      const lab = document.createElement('div');
      lab.textContent = id;
      lab.style.cssText = 'font:700 12px system-ui;color:#222;width:100%';
      row.appendChild(lab);
      const crop = q.get('crop');
      frames.forEach((c, i) => {
        const w = document.createElement('div');
        w.style.cssText = 'position:relative';
        let el: HTMLCanvasElement = c;
        if (crop) {
          // recorta alrededor del cuerpo (x0,y0,x1,y1 en fracciones)
          const [a, b, cc, d] = crop.split(',').map(Number);
          const k = document.createElement('canvas');
          k.width = c.width * (cc - a); k.height = c.height * (d - b);
          k.getContext('2d')!.drawImage(c, -c.width * a, -c.height * b);
          el = k;
        }
        el.style.display = 'block';
        w.appendChild(el);
        const n = document.createElement('span');
        n.textContent = String(i);
        n.style.cssText = 'position:absolute;left:2px;bottom:2px;font:10px monospace;color:#333';
        w.appendChild(n);
        row.appendChild(w);
      });
      host.appendChild(row);
    }
    (window as any).__labReady = true;
  });
}
