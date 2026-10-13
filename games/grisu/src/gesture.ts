// Clasificador puro de trazos de puntero (GDD §4): un dedo → TOQUE, DESLIZAR o MANTENER. Sin temporizadores: quien lo
// usa llama tick(t) cada cuadro (así se prueba con trazos sintéticos). Solo cuenta el primer dedo; los demás se ignoran
// (quedan libres para una herramienta de clase futura).
//  - TOQUE: se suelta antes de TAP_MS sin moverse TAP_PX → 'tap' (al soltar)
//  - DESLIZAR: llega a SWIPE_PX antes de SWIPE_MS → 'swipe' (en el acto, con la dirección del trazo)
//  - MANTENER: a HOLD_MS sin haberse movido TAP_PX, o un trazo lento que no llegó a deslizar → 'hold' y, mientras
//    sigue, 'drag' con el punto; al soltar, 'release'
export type GCfg = { TAP_MS: number, TAP_PX: number, SWIPE_PX: number, SWIPE_MS: number, HOLD_MS: number };
export type GEv =
  | { k: 'tap', x: number, y: number }
  | { k: 'swipe', dx: number, dy: number, x: number, y: number }
  | { k: 'hold', x: number, y: number }
  | { k: 'drag', x: number, y: number }
  | { k: 'release', x: number, y: number };

type Trace = { id: number, x0: number, y0: number, x: number, y: number, t0: number, moved: number, state: 'open' | 'hold' | 'done' };

export class Gestures {
  cfg: GCfg;
  cur: Trace | null = null;
  constructor(cfg: GCfg) { this.cfg = cfg; }
  get holding() { return this.cur?.state === 'hold'; }

  down(id: number, x: number, y: number, t: number): GEv[] {
    if (this.cur) return [];
    this.cur = { id, x0: x, y0: y, x, y, t0: t, moved: 0, state: 'open' };
    return [];
  }
  move(id: number, x: number, y: number, t: number): GEv[] {
    const g = this.cur;
    if (!g || g.id !== id) return [];
    g.x = x, g.y = y;
    const dx = x - g.x0, dy = y - g.y0, d = Math.sqrt(dx * dx + dy * dy);
    g.moved = Math.max(g.moved, d);
    // un deslizar cuyos movimientos llegaron tarde (un cuadro trabado): el reloj ya lo había declarado MANTENER, pero
    // según la hora de los eventos el dedo ya se movía. Se corrige: suelta el mantener y desliza.
    if (g.state === 'hold' && t - g.t0 < this.cfg.HOLD_MS + 60 && d >= this.cfg.SWIPE_PX) {
      g.state = 'done';
      return [{ k: 'release', x, y }, { k: 'swipe', dx: dx / d, dy: dy / d, x: g.x0, y: g.y0 }];
    }
    if (g.state === 'hold') return [{ k: 'drag', x, y }];
    if (g.state === 'open' && d >= this.cfg.SWIPE_PX && t - g.t0 < this.cfg.SWIPE_MS) {
      g.state = 'done';
      return [{ k: 'swipe', dx: dx / d, dy: dy / d, x: g.x0, y: g.y0 }];
    }
    return this.tick(t);
  }
  up(id: number, x: number, y: number, t: number): GEv[] {
    const g = this.cur;
    if (!g || g.id !== id) return [];
    this.cur = null;
    if (g.state === 'hold') return [{ k: 'release', x, y }];
    if (g.state === 'open' && g.moved < this.cfg.TAP_PX && t - g.t0 < this.cfg.TAP_MS + 40) return [{ k: 'tap', x: g.x0, y: g.y0 }];
    return [];
  }
  cancel(): GEv[] {
    const g = this.cur;
    this.cur = null;
    return g?.state === 'hold' ? [{ k: 'release', x: g.x, y: g.y }] : [];
  }
  // El paso del tiempo: un dedo quieto se vuelve MANTENER a HOLD_MS; uno que se movió poco pero no deslizó, al pasar
  // SWIPE_MS (un arrastre lento también es mantener)
  tick(t: number): GEv[] {
    const g = this.cur;
    if (!g || g.state !== 'open') return [];
    const el = t - g.t0;
    if ((el >= this.cfg.HOLD_MS && g.moved < this.cfg.TAP_PX) || el >= this.cfg.SWIPE_MS) {
      g.state = 'hold';
      return [{ k: 'hold', x: g.x, y: g.y }];
    }
    return [];
  }
}
