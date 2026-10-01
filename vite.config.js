import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-página: cada juego vive en games/<nombre>/index.html
export default defineConfig({
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000, // rapier3d-compat incrusta su WASM (~4 MB)
    rollupOptions: {
      input: {
        hub: resolve(import.meta.dirname, 'index.html'),
        elytra: resolve(import.meta.dirname, 'games/elytra/index.html'),
      },
    },
  },
});
