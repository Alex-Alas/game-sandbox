# DOWNCASTLE — plan de implementación del prototipo

Especificación: [`specs/2026-10-03-downcastle-design.md`](../specs/2026-10-03-downcastle-design.md).
Assets y música ya están en `public/downcastle/` (créditos en `games/downcastle/CREDITS.md`).
Dependencias ya agregadas: `uqr` (QR de la sala) y `ws` (dev, relay local en el plugin de Vite).

## Pasos

1. **Esqueleto.** `games/downcastle/index.html` (canvas, overlays DOM, metas de pantalla completa,
   `manifest.webmanifest` con `display: fullscreen`, `orientation: portrait`, `start_url` relativo).
   Registrar en `vite.config.js` (`rollupOptions.input`) y en el hub `index.html`.
   `src/config.js` con `CFG` y `ASSET_BASE = import.meta.env.BASE_URL + 'downcastle/'`.
2. **Sprites.** `src/sprites.js`: cargar el atlas 0x72 y parsear `tile_list.txt` (nombre x y w h);
   tileset del castillo en cuadros de 16×16 (8×16). Contornos por color generados al cargar.
   Mapear tiles del castillo (piedra, madera, fondo de ladrillo, antorcha/estandarte) mirando
   `castle-referencia.png`.
3. **Pozo.** `src/level.js`: bloques ASCII 12×12 (INICIO, intermedios, BUNGEE, FIN), leyenda de la
   spec §6, asserts, `genTramo(seed, n)` con mulberry32; consulta de tiles con ancho envolvente.
4. **Simulación pura** (`src/sim.js`, sin DOM): jugadores AABB con controlador (inclinación,
   salto, botas-cañón, picada, ancla), cuerda Verlet/XPBD elástica (§4), criaturas (§5), gemas,
   daño, fuera de combate, fin de tramo, eventos y contadores de telemetría. Paso fijo 60 Hz.
   Ganchos de modificadores (`mods`) vacíos.
5. **Entrada.** `src/input.js`: DeviceOrientation con calibración y permiso de iOS, gestos
   (toque/mantener/deslizar), modo arrastre, teclado y ratón para depurar.
6. **Render.** `src/render.js`: canvas de 192 px de ancho escalado entero `pixelated`, tiles
   pre-dibujados por bloque, sprites, cuerda, capa de oscuridad con luces, puntitos de vida y
   balas, flechas a compañeros, `project(x, y)`.
7. **Red.** `games/downcastle/server/room.js` (lógica pura de sala: códigos, anfitrión, máx. 4,
   reenvío invitado→anfitrión y anfitrión→todos, cierre si se va el anfitrión, vacía 2 min),
   `server/src/index.js` (Durable Object) + `wrangler.jsonc`; plugin de Vite en
   `vite.config.js` que atiende `/downcastle-ws` con `ws`. Cliente `src/net.js`: entradas a 30 Hz,
   estado a 20 Hz, interpolación 100 ms, extrapolación del propio personaje.
8. **Pantallas.** Título, sala (código, QR con `uqr`, compartir, nombre/color/héroe, Listo),
   tramo, premios + nota 1–5, fin de run (§8). Ajustes en localStorage (`downcastle.*`).
9. **Premios y telemetría** (`src/awards.js`): tabla con mínimos (§9), hasta 3 por tramo,
   `downcastle.tel`.
10. **Audio** (`src/audio.js`): música por `<audio>` + pasabajos, efectos procedurales, vibración.
11. **Depuración y verificación.** `window.__downcastle` (`bots`, `advance`, `state`, `seed`),
    `?solo=1`. Playwright con 2–4 páginas táctiles 390×844 (crear/unirse, tramo con bots,
    premios, reconexión, salida del anfitrión). `npm run build`.
12. **Docs.** Sección DOWNCASTLE en `CLAUDE.md` y `README.md`. El Worker se despliega solo
    cuando lo pida el usuario (`npx wrangler deploy`).

## Notas del entorno

- Playwright: el Chromium headless de `~/.cache/ms-playwright` necesitaba librerías del sistema
  (`libnspr4 libnss3 libatk1.0-0 libxdamage1 libatspi2.0-0`); su instalación con apt se cortó,
  conviene verificar con `ldd` antes de probar.
