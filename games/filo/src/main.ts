// FILO · kit de assets 2D: escaparate de personajes, animaciones, efectos y escenario.
import { runLab } from './lab.ts';
import { Renderer } from './gl/renderer.ts';
import { buildScene } from './world/scene.ts';
import { Actor } from './actor.ts';
import { hero } from './chars/hero.ts';

const q = new URLSearchParams(location.search);

function boot() {
  const cv = document.getElementById('game') as HTMLCanvasElement;
  const R = new Renderer(cv);
  R.resize();
  const scene = buildScene(1);
  R.env.light = [scene.lantern[0], scene.lantern[1], 70, 0.55];
  const H = new Actor(hero, q.get('clip') ?? 'idle');
  H.x = +(q.get('hx') ?? -20);
  const app = { R, scene, hero: H, t: 0, paused: false, slow: 1 };

  const update = (dt: number) => {
    app.t += dt;
    R.time = app.t;
    H.update(dt * app.slow);
  };
  const render = () => {
    R.resize();
    H.scale = R.pxPerUnit() * 1.0;
    H.draw();
    R.frame(scene.layers, (r) => { r.drawActor(H); });
  };
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!app.paused) update(dt);
    render();
    requestAnimationFrame(loop);
  };
  if (!q.has('shot')) requestAnimationFrame(loop);
  (window as any).__filo = {
    app,
    pause(on = true) { app.paused = on; },
    step(sec: number) { const n = Math.round(sec * 120); for (let i = 0; i < n; i++) update(1 / 120); const t = performance.now(); render(); R.gl.finish(); if (q.has('prof')) console.log('frame ' + (performance.now() - t).toFixed(0) + 'ms'); },
    ready: true,
  };
}

if (q.has('lab')) runLab();
else { const t = performance.now(); boot(); if (q.has('prof')) { console.log('boot ' + (performance.now() - t).toFixed(0) + 'ms'); (window as any).__filo.step(0.1); (window as any).__filo.step(0.1); } }
