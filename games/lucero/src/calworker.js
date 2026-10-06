// LUCERO — calibra niveles fuera de la tabla precalculada sin trabar la interfaz
import { calibrate } from './levels.js';

self.onmessage = (e) => {
  const n = e.data;
  self.postMessage({ n, cal: calibrate(n, 10) });
};
