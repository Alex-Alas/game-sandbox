// Entrada de GRISÚ (GDD §4): todo llega a la sim como la misma Input.
//  - táctil: gestos puros (gesture.ts) en cualquier lugar del lienzo: TOQUE = salto, DESLIZAR = la acción direccional,
//    MANTENER = la sostenida hacia el punto bajo el dedo (se puede arrastrar);
//  - ratón: clic izquierdo = direccional hacia el cursor; derecho mantenido = sostenida hacia el cursor;
//  - teclado: espacio = salto; WASD/flechas = dirección; J = direccional; K = sostenida (Esc lo maneja game.ts);
//  - mando: A = salto, X = direccional, gatillo derecho = sostenida, palanca = dirección.
// Los aprietes (salto, direccional) quedan anotados hasta que la sim los lee una vez: un toque nunca se pierde entre
// dos cuadros. Las posiciones de pantalla se pasan al mundo al leer (la cámara se mueve).
import { Gestures, type GCfg, type GEv } from './gesture.ts';
import type { Input } from './sim/state.ts';

export type ToWorld = (cx: number, cy: number) => [number, number];
export type Hero = { x: number, y: number, face: number };

// La hora del evento si está en la misma base que performance.now() (lo normal); si no, la de ahora
const ts = (e: Event) => Math.abs(performance.now() - e.timeStamp) < 1000 ? e.timeStamp : performance.now();

export class Controls {
  G: Gestures;
  private jumpQ = false;
  private dirQ: { ax: number, ay: number, sx?: number, sy?: number } | null = null;
  private touchHold: { x: number, y: number } | null = null;
  private mouseHold: { x: number, y: number } | null = null;
  mouse: { x: number, y: number } | null = null;
  keys = new Set<string>();
  usedTouch = false;
  lastTap: { x: number, y: number, t: number } | null = null;     // para dibujar el gesto
  lastSwipe: { x: number, y: number, dx: number, dy: number, t: number } | null = null;
  enabled = true;
  private padPrev = { a: false, x: false };

  constructor(el: HTMLElement, cfg: GCfg) {
    this.G = new Gestures(cfg);
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        this.mouse = { x: e.clientX, y: e.clientY };
        if (e.button === 0) this.dirQ = { ax: 0, ay: 0, sx: e.clientX, sy: e.clientY };
        if (e.button === 2) this.mouseHold = { x: e.clientX, y: e.clientY };
        return;
      }
      e.preventDefault();
      this.usedTouch = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
      this.handle(this.G.down(e.pointerId, e.clientX, e.clientY, ts(e)));
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse = { x: e.clientX, y: e.clientY };
        if (this.mouseHold) this.mouseHold = { x: e.clientX, y: e.clientY };
        if (!(e.buttons & 2)) this.mouseHold = null;
        return;
      }
      this.handle(this.G.move(e.pointerId, e.clientX, e.clientY, ts(e)));
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { if (e.button === 2) this.mouseHold = null; return; }
      this.handle(this.G.up(e.pointerId, e.clientX, e.clientY, ts(e)));
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => { if (e.pointerType !== 'mouse') this.handle(this.G.cancel()); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (!this.enabled || (e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === ' ' || k.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === ' ') this.jumpQ = true;
      if (k === 'j') { const [x, y] = this.keyDir(); this.dirQ = { ax: x, ay: y }; }
    });
    addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys.delete(k); });
    addEventListener('blur', () => { this.keys.clear(); this.mouseHold = null; this.handle(this.G.cancel()); });
  }
  private handle(evs: GEv[]) {
    const now = performance.now();
    for (const e of evs) {
      if (e.k === 'tap') { this.jumpQ = true; this.lastTap = { x: e.x, y: e.y, t: now }; }
      else if (e.k === 'swipe') { this.dirQ = { ax: e.dx, ay: -e.dy }; this.lastSwipe = { x: e.x, y: e.y, dx: e.dx, dy: e.dy, t: now }; }
      else if (e.k === 'hold' || e.k === 'drag') this.touchHold = { x: e.x, y: e.y };
      else if (e.k === 'release') this.touchHold = null;
    }
  }
  // dirección del teclado (WASD/flechas) o de la palanca del mando
  keyDir(): [number, number] {
    const K = this.keys;
    let x = (K.has('d') || K.has('ArrowRight') ? 1 : 0) - (K.has('a') || K.has('ArrowLeft') ? 1 : 0);
    let y = (K.has('w') || K.has('ArrowUp') ? 1 : 0) - (K.has('s') || K.has('ArrowDown') ? 1 : 0);
    const pad = this.pad();
    if (pad && Math.hypot(pad.lx, pad.ly) > 0.35) x = pad.lx, y = -pad.ly;
    return [x, y];
  }
  private pad() {
    const gp = navigator.getGamepads?.()?.find((g) => g && g.connected);
    if (!gp) return null;
    return { lx: gp.axes[0] ?? 0, ly: gp.axes[1] ?? 0, a: !!gp.buttons[0]?.pressed, x: !!gp.buttons[2]?.pressed, rt: (gp.buttons[7]?.value ?? 0) > 0.4 };
  }
  get holding() { return !!this.touchHold || !!this.mouseHold || this.keys.has('k'); }
  holdPoint() { return this.touchHold ?? this.mouseHold; }

  // Lee la entrada de este cuadro (consume los aprietes anotados)
  read(now: number, hero: Hero, toWorld: ToWorld): Input {
    const inp: Input = { jump: false, dir: false, hold: false, ax: 0, ay: 0, tx: 0, ty: 0 };
    this.handle(this.G.tick(now));
    const pad = this.pad();
    if (pad) {
      if (pad.a && !this.padPrev.a) this.jumpQ = true;
      if (pad.x && !this.padPrev.x) { const [x, y] = this.keyDir(); this.dirQ = { ax: x, ay: y }; }
      this.padPrev = { a: pad.a, x: pad.x };
    }
    if (this.jumpQ) inp.jump = true, this.jumpQ = false;
    if (this.dirQ) {
      let { ax, ay } = this.dirQ;
      if (this.dirQ.sx !== undefined) {   // clic: hacia el cursor desde el centro del héroe
        const [wx, wy] = toWorld(this.dirQ.sx, this.dirQ.sy!);
        ax = wx - hero.x, ay = wy - (hero.y + 0.8);
      }
      inp.dir = true, inp.ax = ax, inp.ay = ay;
      this.dirQ = null;
    }
    const hp = this.holdPoint();
    if (hp) {
      const [wx, wy] = toWorld(hp.x, hp.y);
      inp.hold = true, inp.tx = wx, inp.ty = wy;
    } else if (this.keys.has('k') || pad?.rt) {
      let [x, y] = this.keyDir();
      if (!x && !y) x = hero.face, y = 1;
      const n = Math.hypot(x, y);
      inp.hold = true, inp.tx = hero.x + x / n * 6, inp.ty = hero.y + 1.1 + y / n * 6;
    }
    return inp;
  }
}
