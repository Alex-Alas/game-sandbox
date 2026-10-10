import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { downcastleRelay } from './games/downcastle/server/vite-plugin.js';

// Multi-página: cada juego vive en games/<nombre>/index.html
// BASE_PATH lo fija el workflow de GitHub Pages (/game-sandbox/); en local queda '/'
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  server: { port: +process.env.PORT || 5173, open: false }, // PORT: otra sesión de vista previa
  plugins: [downcastleRelay()], // salas de DOWNCASTLE en /downcastle-ws (dev y preview)
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000, // rapier3d-compat incrusta su WASM (~4 MB)
    rollupOptions: {
      input: {
        hub: resolve(import.meta.dirname, 'index.html'),
        elytra: resolve(import.meta.dirname, 'games/elytra/index.html'),
        downcastle: resolve(import.meta.dirname, 'games/downcastle/index.html'),
        vortice: resolve(import.meta.dirname, 'games/vortice/index.html'),
        lucero: resolve(import.meta.dirname, 'games/lucero/index.html'),
        hyperflowgeon: resolve(import.meta.dirname, 'games/hyperflowgeon/index.html'),
        catapum: resolve(import.meta.dirname, 'games/catapum/index.html'),
        bananazo: resolve(import.meta.dirname, 'games/bananazo/index.html'),
        flechazo: resolve(import.meta.dirname, 'games/flechazo/index.html'),
      },
    },
  },
});
