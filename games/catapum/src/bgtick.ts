// Un reloj que no se frena con la pestaña oculta. Con la pestaña en segundo plano el navegador detiene requestAnimationFrame y
// hace pasar los temporizadores de la página a ~1 Hz (a los 5 min, a 1 por minuto); los de un Worker dedicado no se frenan en
// Chrome ni en Firefox de escritorio. El anfitrión de una sala lo usa para seguir simulando (sin dibujar) mientras está oculto, así
// la partida de los demás no se congela. Sin Worker (o si falla) cae a setInterval, que sigue sirviendo a un ritmo bajo.
// En el teléfono no alcanza: iOS suspende la página (y su WebSocket) en cuanto sale de primer plano y Android la congela al rato.
const SRC = 'let id=0;onmessage=e=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';

export type BgTicker = { start(): void, stop(): void, running(): boolean, kind(): 'worker' | 'timer' | '' };
export function bgTicker(fn: () => void, ms = 16): BgTicker {
  let w: Worker | null = null, url = '', timer = 0, kind: 'worker' | 'timer' | '' = '';
  return {
    start() {
      if (kind) return;
      try {
        url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }));
        w = new Worker(url);
        w.onmessage = fn, w.onerror = () => { w?.terminate(), w = null, kind = ''; };
        w.postMessage(ms);
        kind = 'worker';
      } catch {
        if (url) URL.revokeObjectURL(url);
        w = null, url = '';
        timer = setInterval(fn, ms) as unknown as number, kind = 'timer';
      }
    },
    stop() {
      if (w) w.terminate(), w = null;
      if (url) URL.revokeObjectURL(url), url = '';
      if (timer) clearInterval(timer), timer = 0;
      kind = '';
    },
    running: () => !!kind,
    kind: () => kind,
  };
}
