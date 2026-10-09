#!/usr/bin/env node
// Graba los pósters y los loops de gameplay de la portada (public/hub/<juego>.webp, .webm y .mp4).
// Cada juego corre con un reloj virtual (requestAnimationFrame y performance.now controlados
// desde acá) y Math.random con semilla: el clip sale fluido y repetible aunque el Chromium sin
// GPU renderice lento. El final del clip se funde con su principio para que el loop no salte, y
// el póster es el primer cuadro del loop (la portada pasa del póster al video sin corte).
//
//   npm run dev                                  # en otra terminal
//   node tools/hub-media.mjs                     # todos los juegos
//   node tools/hub-media.mjs vortice catapum     # algunos (og = la imagen para compartir el link)
//   PORT=5174 node tools/hub-media.mjs           # otro dev server
//   SEED=7 node tools/hub-media.mjs catapum      # probar otra semilla (otra partida)
//
// Requiere ffmpeg y Playwright (el global de /opt/node22 o uno instalado en el proyecto).

import { mkdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'hub');
const BASE = `http://localhost:${process.env.PORT || 5173}`;
const FPS = 30;
const FADE = 0.6; // s de fundido entre el final y el principio del loop

const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

// Reloj virtual: el juego solo avanza cuando la herramienta llama a __pump(ms).
const CLOCK = (seed) => {
  let now = 0, q = [], s = seed >>> 0;
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  Math.random = () => { // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__pump = (ms) => { now += ms; const l = q; q = []; for (const cb of l) cb(now); };
};
// Todo lo que no es el lienzo del juego (menús, HUD en DOM, avisos) se vuelve invisible sin
// sacarlo del flujo: LUCERO mide su tablero con el DOM.
const hideUI = (keep = []) => {
  const sel = `body > :not(#game${keep.map((k) => `, ${k}`).join('')})`;
  return `${sel}, ${sel} * { visibility: hidden !important; }`;
};

// Cada juego: tamaño de la captura, cómo se prepara y, si hace falta, qué hace antes de cada cuadro.
// `size` es la salida del video; `secs` lo que dura el loop; `dpr` y `zoom` capturan con más resolución y
// recortan el centro (acerca la cámara sin perder nitidez).
const GAMES = {
  catapum: {
    url: '/games/catapum/', view: [1280, 720], dpr: 1.5, zoom: 1.2, size: [1280, 720], secs: 6, seed: 21,
    // un duelo de bots en ISLAS BUM, dibujado como la partida de fondo del menú (sin HUD)
    async setup(page) {
      await pumpFor(page, 0.5);
      await page.evaluate(async () => {
        const { newMem } = await import('/games/catapum/src/sim/bot.ts');
        __catapum.solo({ map: 'islas', bots: 1, diff: 4 });
        const app = __catapum.app, m = app.match;
        m.s.pl[m.me].bot = 4; m.mems[m.me] = newMem(); m.me = -1;
        app.demo = m; app.match = null; app.mode = 'menu';
      });
      await pumpFor(page, 6);
    },
  },
  vortice: {
    url: '/games/vortice/', view: [1152, 720], size: [960, 600], secs: 6, seed: 3, sub: 4, crf: 31, // 120 Hz: 4 pasos por cuadro
    async setup(page) {
      await page.addStyleTag({ content: '#toasts { display: none !important; }' });
      await pumpFor(page, 1);
      await page.evaluate(async () => {
        const { botDir } = await import('/games/vortice/src/sim.js');
        window.__bot = () => botDir(__vortice.sim(), true);
        __vortice.start('normal');
        __vortice.advance(21, true); // directo a TRIÁNGULO, con más ritmo
      });
    },
    warm: 3, // que se vayan los carteles de etapa que dejó el salto
    // el piloto automático maneja con las mismas teclas que una persona
    async beforeStep(page) {
      await page.evaluate(() => {
        const d = window.__bot(), ev = (t, c) => dispatchEvent(new KeyboardEvent(t, { code: c }));
        ev(d < 0 ? 'keydown' : 'keyup', 'ArrowLeft'); ev(d > 0 ? 'keydown' : 'keyup', 'ArrowRight');
      });
    },
  },
  lucero: {
    url: '/games/lucero/', view: [1152, 720], size: [960, 600], secs: 6, seed: 5,
    async setup(page) {
      await pumpFor(page, 1);
      await page.evaluate(async () => { await __lucero.play(27); __lucero.auto(true); __lucero.speed(1.4); });
      await pumpFor(page, 3);
    },
  },
  elytra: {
    url: '/games/elytra/?q=med', view: [1152, 720], size: [768, 480], secs: 6, seed: 2, crf: 28, keep: ['#vignette'],
    async setup(page) {
      await page.waitForFunction(() => window.__elytra, null, { timeout: 120000, polling: 500 });
      await page.evaluate(() => { document.getElementById('overlay').click(); __elytra.autopilot(true, true); __elytra.advance(14); });
      await pumpFor(page, 0.1);
    },
  },
  downcastle: {
    // la bajada por fuera de la torre: sin la oscuridad del interior, se ve a los cuatro atados por la cuerda
    url: '/games/downcastle/?solo=1&bots=3&ext=bajada&seed=3', view: [384, 720], dpr: 2, size: [432, 810], secs: 6, seed: 3, crf: 29,
    async setup(page) { await pumpFor(page, 1); await page.evaluate(() => __downcastle.auto(true)); await pumpFor(page, 4); },
  },
  hyperflowgeon: {
    url: '/games/hyperflowgeon/', view: [1152, 720], size: [960, 600], secs: 4.4, seed: 1, sub: 2, // 60 Hz: 2 pasos por cuadro
    // corre, salta y se columpia de viga en viga con la liga hasta la torre (teclas como una persona)
    async setup(page) {
      await pumpFor(page, 0.5);
      await page.evaluate(() => {
        __hfg.reset(54);
        const beams = [67.5, 81.5, 95.5, 109.5, 122, 133], ev = (t, c) => dispatchEvent(new KeyboardEvent(t, { code: c }));
        ev('keydown', 'KeyD'); ev('keydown', 'ArrowUp'); // corre a la derecha y apunta a 45°
        window.__bot = () => {
          const { p, t } = __hfg.state(), next = beams.find((bx) => bx > p.x + 1.5);
          let hook = false;
          if (p.hook) hook = !(p.x > p.hook.x + 1.2 && p.vy > -1); // suelta pasada la viga, subiendo
          else if (!p.ground && next) { const dx = next - p.x, dy = 9 - p.y; hook = dx > 1.5 && dx < 10 && dy > 1; }
          ev(p.ground && t % 20 < 10 ? 'keydown' : 'keyup', 'Space'); ev(hook ? 'keydown' : 'keyup', 'KeyK');
        };
      });
    },
    async beforeStep(page) { await page.evaluate(() => window.__bot()); },
  },
};

async function pumpFor(p, secs, step = 1000 / 60) { await p.evaluate(([n, ms]) => { for (let i = 0; i < n; i++) __pump(ms); }, [Math.round(secs * 1000 / step), step]); }

async function record(name, g, browser) {
  const ctx = await browser.newContext({ viewport: { width: g.view[0], height: g.view[1] }, deviceScaleFactor: g.dpr ?? 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  [${name}] ${e.message}`));
  await page.addInitScript(CLOCK, +(process.env.SEED ?? g.seed ?? 1));
  await page.goto(BASE + g.url, { waitUntil: 'load', timeout: 120000 });
  await page.addStyleTag({ content: hideUI(g.keep) });
  await g.setup(page);

  const dir = join(tmpdir(), `hub-media-${name}`);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const frames = Math.round((g.secs + FADE) * FPS), sub = g.sub ?? 1;
  for (let k = 0; k < (g.warm ?? 0) * FPS * sub; k++) {
    if (g.beforeStep) await g.beforeStep(page);
    await page.evaluate((ms) => __pump(ms), 1000 / (FPS * sub));
  }
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < sub; k++) {
      if (g.beforeStep) await g.beforeStep(page);
      await page.evaluate((ms) => __pump(ms), 1000 / (FPS * sub));
    }
    await page.screenshot({ path: join(dir, `${String(f).padStart(4, '0')}.png`), timeout: 600000 });
    if (f % 30 === 0) process.stdout.write(`  ${name} ${f}/${frames}\r`);
  }
  await ctx.close();

  // loop: [FADE, fin] fundido al final con [0, FADE]; póster = su primer cuadro. WebM (VP9) para los navegadores
  // que lo tienen, que pesa menos y anda en los Chromium sin H.264; MP4 (H.264) para Safari viejo.
  const [w, h] = g.size, src = join(dir, '%04d.png'), out = (ext) => join(OUT, `${name}.${ext}`);
  const scale = `${g.zoom ? `crop=iw/${g.zoom}:ih/${g.zoom},` : ''}scale=${w}:${h}:flags=lanczos`;
  const loop = ['-framerate', String(FPS), '-i', src, '-framerate', String(FPS), '-i', src, '-filter_complex',
    `[0]trim=start=${FADE},setpts=PTS-STARTPTS,${scale}[a];[1]trim=end=${FADE},setpts=PTS-STARTPTS,${scale}[b];` +
    `[a][b]xfade=transition=fade:duration=${FADE}:offset=${g.secs - FADE},format=yuv420p[v]`, '-map', '[v]', '-an'];
  const crf = g.crf ?? 27;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...loop, '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', String(crf),
    '-movflags', '+faststart', out('mp4')]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...loop, '-c:v', 'libvpx-vp9', '-crf', String(crf + 14), '-b:v', '0', '-row-mt', '1',
    '-deadline', 'good', '-cpu-used', '2', out('webm')]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, `${String(Math.round(FADE * FPS)).padStart(4, '0')}.png`),
    '-vf', scale, '-c:v', 'libwebp', '-quality', '80', out('webp')]);
  rmSync(dir, { recursive: true, force: true });
  const kb = (ext) => `${Math.round(statSync(out(ext)).size / 1024)} KB ${ext}`;
  console.log(`${name}: ${kb('webm')}, ${kb('mp4')}, ${kb('webp')}`);
}

// Imagen para compartir el link (og:image, 1200×630): la marca y los seis pósters tirados en la arena, con la
// tipografía y los colores de la portada. Va después de los pósters: los usa.
async function shareImage(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const tiles = [['catapum', -5, 22, 286], ['vortice', 4, 262, 318], ['lucero', -2, 500, 290], ['elytra', 5, 738, 322], ['hyperflowgeon', -4, 960, 300]];
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:9;background:inherit;overflow:hidden';
    box.innerHTML = `<h1 style="position:absolute;left:48px;top:44px;font-size:118px">Game Sandbox</h1>
      <p style="position:absolute;left:52px;top:182px;font-size:30px;font-weight:600;color:var(--ink-2)">Juegos para el navegador. Sin instalar nada.</p>` +
      tiles.map(([g, r, x, y]) => `<img src="/hub/${g}.webp" style="position:absolute;left:${x}px;top:${y}px;width:330px;aspect-ratio:16/10;object-fit:cover;
        border:4px solid var(--ink);border-radius:20px;box-shadow:0 6px 0 var(--ink),0 22px 30px -12px rgba(105,66,18,.6);transform:rotate(${r}deg)">`).join('') +
      `<img src="/hub/downcastle.webp" style="position:absolute;left:1040px;top:40px;width:120px;aspect-ratio:9/16;object-fit:cover;
        border:4px solid var(--ink);border-radius:18px;box-shadow:0 6px 0 var(--ink),0 22px 30px -12px rgba(105,66,18,.6);transform:rotate(6deg)">`;
    document.body.append(box);
  });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(OUT, 'og.jpg'), type: 'jpeg', quality: 82 }); // liviana: WhatsApp no muestra las pesadas
  await page.close();
  console.log(`og.jpg: ${Math.round(statSync(join(OUT, 'og.jpg')).size / 1024)} KB`);
}

mkdirSync(OUT, { recursive: true });
const names = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const name of names.length ? names : [...Object.keys(GAMES), 'og']) {
  if (name === 'og') await shareImage(browser);
  else if (GAMES[name]) await record(name, GAMES[name], browser);
  else console.error(`no conozco «${name}»`);
}
await browser.close();
