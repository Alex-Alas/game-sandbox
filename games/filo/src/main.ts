// FILO · kit de assets 2D: escaparate de personajes, animaciones, efectos, escenario e interfaz.
import { runLab } from './lab.ts';
import { App, type Mode } from './app.ts';
import { UI } from './ui/ui.ts';
import { Sfx } from './audio.ts';

const q = new URLSearchParams(location.search);

function boot() {
  const app = new App(document.getElementById('game') as HTMLCanvasElement, document.getElementById('over') as HTMLCanvasElement);
  const ui = new UI(app);
  const sfx = new Sfx();
  try { ui.sound = localStorage.getItem('filo.sound') !== '0'; } catch { /* */ }
  sfx.on = ui.sound;
  app.onSfx = (k, o) => sfx.play(k, o);
  ui.onSound = (on) => { sfx.unlock(); sfx.setOn(on); try { localStorage.setItem('filo.sound', on ? '1' : '0'); } catch { /* */ } };
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  let mode = (q.get('modo') as Mode) || null;
  if (!mode) { try { mode = localStorage.getItem('filo.mode') as Mode; } catch { /* */ } }
  ui.go(mode && ['scene', 'anim', 'fx', 'world', 'ui'].includes(mode) ? mode : 'scene');
  document.getElementById('loading')!.classList.add('off');

  // resolución adaptativa: si el cuadro tarda, baja la escala interna (y la sube si sobra)
  const R = app.R;
  const coarse = matchMedia('(pointer: coarse)').matches;
  R.dprCap = coarse ? 2 : 2;
  R.scale = coarse ? 0.7 : 1;
  let avg = 16, cool = 0;
  const adapt = (ms: number) => {
    avg += (ms - avg) * 0.05;
    cool -= ms;
    if (cool > 0) return;
    if (avg > 24 && R.scale > 0.45) { R.scale = Math.max(0.45, R.scale - 0.08); cool = 1500; }
    else if (avg < 14 && R.scale < (coarse ? 0.85 : 1)) { R.scale = Math.min(coarse ? 0.85 : 1, R.scale + 0.05); cool = 2500; }
  };

  let last = performance.now();
  const loop = (now: number) => {
    const ms = now - last;
    const dt = Math.min(0.05, ms / 1000);
    last = now;
    app.update(dt);
    app.render();
    ui.frame();
    if (!document.hidden) adapt(ms);
    requestAnimationFrame(loop);
  };
  if (!q.has('shot')) requestAnimationFrame(loop);
  (window as any).__filo = {
    app, ui,
    step(sec: number) { const n = Math.round(sec * 120); for (let i = 0; i < n; i++) app.update(1 / 120); app.render(); ui.frame(); },
    tick(sec: number) { const n = Math.round(sec * 120); for (let i = 0; i < n; i++) app.update(1 / 120); },
    render() { app.render(); ui.frame(); },
    go(m: Mode) { ui.go(m); },
    ready: true,
  };
}

if (q.has('lab')) runLab();
else boot();
