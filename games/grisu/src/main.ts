// GRISÚ · escaparate de assets (F0.5): el pipeline de 3D pixelado con los personajes, enemigos, el escenario de
// LAS GALERÍAS, los efectos, los retratos y los íconos. `?modo=personajes|enemigos|escenario|efectos|retratos`,
// `?shot=1` no arranca el bucle (capturas deterministas con __grisu.step), `?lab=1&ch=…&c=…` hoja de contactos.
import * as THREE from 'three';
import { App, type Mode, MODES } from './app.ts';
import { UI } from './ui.ts';
import { Sfx } from './audio.ts';
import { HEIGHTS } from './render/pixel.ts';
import { drawLogo } from './portraits/logo.ts';

const q = new URLSearchParams(location.search);
const app = new App(document.getElementById('game') as HTMLCanvasElement);
try { const h = +(localStorage.getItem('grisu.h') ?? ''); if (HEIGHTS.includes(h)) app.P.setHeight(h); } catch { /* */ }
if (q.has('alto') && HEIGHTS.includes(+q.get('alto')!)) app.P.setHeight(+q.get('alto')!);
const ui = new UI(app);
drawLogo(document.getElementById('logo') as HTMLCanvasElement);
const sfx = new Sfx();
app.onSfx = (k, o) => sfx.play(k, o);
ui.onSound = (on) => { sfx.unlock(); sfx.setOn(on); };
addEventListener('pointerdown', () => sfx.unlock());
addEventListener('keydown', () => sfx.unlock());

let mode = q.get('modo') as Mode | null;
if (!mode) { try { mode = localStorage.getItem('grisu.mode') as Mode; } catch { /* */ } }
for (const k of ['ch', 'c', 'v', 'fx']) void k;
if (q.has('ch')) { const ch = q.get('ch')!; if (ch === 'topo' || ch === 'capataz') { app.sel.enemy = ch; mode = 'enemigos'; } else { app.sel.hero = ch; mode = mode === 'enemigos' ? 'personajes' : mode ?? 'personajes'; } }
if (q.has('c')) app.sel.clip = q.get('c')!;
if (q.has('v')) app.sel.view = q.get('v')!;
if (q.has('fx')) app.fxSel = q.get('fx')!;
ui.go(mode && MODES.some(([m]) => m === mode) ? mode : 'personajes');

const resize = () => app.P.resize(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 3));
resize();
let last = performance.now(), fpsAvg = 60;
function loop(now: number) {
  const ms = now - last; last = now;
  fpsAvg += (1000 / Math.max(1, ms) - fpsAvg) * 0.05;
  resize();
  app.update(Math.min(0.05, ms / 1000));
  app.render();
  ui.frame();
  requestAnimationFrame(loop);
}
if (!q.has('shot')) requestAnimationFrame(loop);

// hoja de contactos de un clip: cada cuadro en fila (sirve para revisar poses)
function sheet(clip?: string, cols = 8) {
  const a = app.current(), cv = app.P.gl.domElement;
  if (clip) { app.sel.clip = clip; app.playSel(); }
  const n = a.frames, cw = cv.width, ch = cv.height, w = Math.floor(cw / Math.min(cols, n));
  const y0 = Math.floor(ch * 0.1), hh = Math.floor(ch * 0.82);
  const out = document.createElement('canvas');
  out.width = w * Math.min(n, cols); out.height = hh * Math.ceil(n / cols);
  const o = out.getContext('2d')!;
  for (let f = 0; f < n; f++) {
    a.hold = f; a.t = f / a.fps; a.apply(true);
    const bx = a.def.rig.body.getWorldPosition(new THREE.Vector3()).x;
    const save = app.frameCamera.bind(app);
    app.frameCamera = () => { save(); app.rig.target.x = bx; };
    app.render();
    app.frameCamera = save;
    o.drawImage(cv, (cw - w) / 2, y0, w, hh, (f % cols) * w, Math.floor(f / cols) * hh, w, hh);
    o.fillStyle = '#f3d27e'; o.font = 'bold 16px monospace'; o.fillText(String(f + 1), (f % cols) * w + 8, Math.floor(f / cols) * hh + 22);
  }
  a.hold = -1;
  out.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:auto;z-index:20;background:#000;image-rendering:pixelated';
  document.body.append(out);
  return n;
}

(window as any).__grisu = {
  app, ui, sfx, sheet,
  step(sec: number) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) app.update(1 / 60); resize(); app.render(); ui.frame(); },
  render() { resize(); app.render(); },
  fps: () => Math.round(fpsAvg),
  ready: true,
};
if (q.has('shot')) { resize(); app.update(0); app.render(); }
