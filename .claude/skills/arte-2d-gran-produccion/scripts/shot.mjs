// Captura una página con Chromium headless (Playwright) para revisar arte.
//   node shot.mjs <ruta-o-url> <salida.png> [ancho alto] [expresión-de-espera]
// Variables de entorno:
//   BASE   origen si se pasa una ruta (por defecto http://localhost:5173)
//   DPR    escala del dispositivo (por defecto 1)
//   TOUCH  =1 emula un teléfono táctil (hasTouch + isMobile)
//   EVAL   código que se evalúa en la página antes de capturar (p. ej. "__app.step(2.3)")
//   FULL   =1 captura la página entera
// Muestra los mensajes de consola y errores de la página (sirven para depurar shaders).
const candidates = ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright/index.mjs'];
let pw = null;
for (const m of candidates) { try { pw = await import(m); break; } catch { /* siguiente */ } }
if (!pw) { console.error('No encuentro Playwright. Instálalo con: npm i -D playwright  (y npx playwright install chromium)'); process.exit(1); }
const { chromium } = pw.default ?? pw;

const [, , target, out, w = '1280', h = '720', wait = ''] = process.argv;
if (!target || !out) { console.error('uso: node shot.mjs <ruta-o-url> <salida.png> [ancho alto] [espera]'); process.exit(1); }
const url = /^https?:/.test(target) ? target : (process.env.BASE ?? 'http://localhost:5173') + target;
const touch = process.env.TOUCH === '1';

const browser = await chromium.launch({
  args: [
    // sin esto, screenshot/toDataURL se cuelgan con miles de trazos recortados en Canvas 2D
    '--disable-accelerated-2d-canvas',
    // WebGL2 por software (no hay GPU en los contenedores)
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  ],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR ?? 1), hasTouch: touch, isMobile: touch });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto(url, { waitUntil: 'load' });
if (wait) { try { await page.waitForFunction(wait, null, { timeout: 90000 }); } catch { logs.push('ESPERA AGOTADA: ' + wait); } }
else await page.waitForTimeout(1500);
if (process.env.EVAL) { const t0 = Date.now(); await page.evaluate(process.env.EVAL); logs.push('eval ms ' + (Date.now() - t0)); }
await page.screenshot({ path: out, fullPage: process.env.FULL === '1', timeout: 120000 });
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
