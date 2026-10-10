// Un personaje en escena: reproduce clips (cuadros enteros a su fps), corre su física secundaria a
// 120 Hz y redibuja su sprite solo cuando cambia el dibujo. Lo que brilla va a un segundo lienzo.
import type { CharDef } from './chars/types.ts';
import { type Clip, type Pose, type Ev, sample, num } from './rig.ts';
import { paint } from './draw/ink.ts';
import type { V } from './draw/curves.ts';

export type DrawMode = 'twos' | 'smooth';
const PH_DT = 1 / 120;

export class Actor<Ph = unknown> {
  x = 0; y = 0; facing = 1;
  clip!: Clip; t = 0; speed = 1; playing = true;
  ph: Ph;
  cv: HTMLCanvasElement; g: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D; gctx: CanvasRenderingContext2D;
  scale = 4;
  drawn = -1;          // índice del último dibujo (para no redibujar)
  seed = 1;            // cambia con cada dibujo → temblor de línea
  boil = 0.32;
  mode: DrawMode = 'twos';
  flat = false;        // «vector crudo» (sin entintado ni sombras)
  bake = true;         // smear dibujado en el sprite (hojas de sprites); en escena lo hace el rastro WebGL
  glow = 0; flash = 0; tint: [number, number, number, number] = [0, 0, 0, 0];
  alpha = 1;
  clipY = -1e9;        // lo que queda por debajo no se dibuja (el filo clavado en el suelo)
  dissolve = 0;        // 0..1 se deshace en brasas (shader): un frente que baja de la cabeza a los pies
  disUp = false;       // al revés: se arma desde los pies
  height = 120;        // alto del cuerpo (para el frente de la disolución)
  hidden = false;
  light: V = [0.6, -0.8];
  onEvent?: (e: Ev, a: Actor<Ph>) => void;
  onPlay?: (id: string, a: Actor<Ph>) => void;
  queue: string[] = [];
  loopAll = false;     // visor: los clips que no son loop vuelven a empezar en el mismo lugar
  anchor = 0;
  private acc = 0;
  private lastRoot: V = [0, 0];
  private lastF = -1;
  pose!: Pose;     // pose dibujada
  version = 0;     // sube con cada redibujo (para subir la textura)
  phT = 0;

  def: CharDef<Ph>;
  constructor(def: CharDef<Ph>, clip = 'idle') {
    this.def = def;
    this.cv = document.createElement('canvas');
    this.g = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently: true })!;
    this.gctx = this.g.getContext('2d', { willReadFrequently: true })!;
    this.clip = def.clips[clip];
    this.pose = sample(this.clip, def.base, 0);
    this.ph = def.phys(this.pose);
  }

  get fc() { return this.t * this.clip.fps; }
  get frame() { return Math.floor(this.fc + 1e-6); }
  rootX() { return this.x + this.facing * num(this.pose, 'x'); }
  rootY() { return this.y + num(this.pose, 'yw'); }

  play(id: string, restart = false) {
    const c = this.def.clips[id];
    if (!c) return;
    if (c === this.clip && !restart) return;
    this.commitRoot();
    this.clip = c; this.t = 0; this.lastF = -1; this.queue = [];
    this.onPlay?.(id, this);
  }
  // encadenar (combo): el siguiente empieza al terminar el actual
  then(...ids: string[]) { this.queue.push(...ids); }

  setFacing(f: number) {
    if (f === this.facing) return;
    this.facing = f;
    this.def.mirror(this.ph);
    this.drawn = -1;
  }

  private commitRoot() {
    // el desplazamiento del clip (pose.x) pasa a la posición del actor
    if (!this.clip) return;
    const end = this.pose;
    this.x += this.facing * num(end, 'x');
    this.y += num(end, 'yw');
    this.pose = { ...end, x: 0, yw: 0 };
  }

  // Avanza el tiempo. `dt` en segundos (ya escalado por la cámara lenta del mundo).
  update(dt: number) {
    if (this.playing) this.t += dt * this.speed;
    const c = this.clip;
    const dur = c.frames / c.fps;
    if (!c.loop && this.t >= dur && this.loopAll) {
      this.t -= dur; this.lastF = -1; this.x = this.anchor;
    } else if (!c.loop && this.t >= dur) {
      const next = this.queue.shift() ?? c.next ?? 'idle';
      this.fireEvents(c.frames);
      this.commitRoot();
      this.clip = this.def.clips[next] ?? this.def.clips.idle;
      this.t = Math.max(0, this.t - dur);
      this.lastF = -1;
    }
    this.fireEvents(this.frame);
    // física: pose continua (fraccionaria) a 120 Hz
    this.acc += dt;
    let n = 0;
    while (this.acc >= PH_DT && n < 12) {
      this.acc -= PH_DT; n++;
      this.phT += PH_DT;
      const fc = Math.min(this.fc, c.loop ? Infinity : c.frames - 1);
      const p = sample(c, this.def.base, fc);
      const rx = this.x + this.facing * num(p, 'x'), ry = this.y + num(p, 'yw');
      // movimiento del marco en coordenadas locales (x hacia donde mira, y hacia abajo)
      const sx = (rx - this.lastRoot[0]) * this.facing, sy = -(ry - this.lastRoot[1]);
      this.lastRoot = [rx, ry];
      const big = Math.abs(sx) > 40 || Math.abs(sy) > 40; // teletransporte: no arrastrar la tela
      const shift: V = big ? [0, 0] : [sx, sy];
      const fv: V = big ? [0, 0] : [sx / PH_DT, sy / PH_DT];
      this.def.step(this.ph, p, PH_DT, shift, fv, this.phT);
    }
    if (this.acc > PH_DT * 4) this.acc = 0;
    const f = this.mode === 'smooth' ? this.fc : this.frame;
    this.pose = sample(c, this.def.base, Math.min(f, c.loop ? f : c.frames - 1));
  }

  private fireEvents(f: number) {
    if (f === this.lastF) return;
    const ev = this.clip.ev;
    if (ev && this.onEvent) {
      for (const e of ev) if (e.f > this.lastF && e.f <= f) this.onEvent(e, this);
    }
    this.lastF = f;
  }

  // Pose continua en un cuadro fraccionario (para los rastros del arma)
  poseAt(f: number): Pose { return sample(this.clip, this.def.base, f); }
  // de local (x hacia donde mira, y abajo) al mundo (y arriba)
  toWorld(lx: number, ly: number, p: Pose = this.pose): [number, number] {
    const rot = num(p, 'rot'), hip = p.hip as [number, number], py = num(p, 'y');
    let x = lx, y = ly;
    if (rot) {
      const hx = hip[0], hy = hip[1] + py, c = Math.cos(rot), s = Math.sin(rot);
      const dx = x - hx, dy = y - hy;
      x = hx + dx * c - dy * s; y = hy + dx * s + dy * c;
    }
    const sq = num(p, 'sq', 1);
    x /= Math.sqrt(sq); y = py + (y - py) * sq;
    return [this.x + this.facing * (num(p, 'x') + x), this.y + num(p, 'yw') - y];
  }

  // ¿Hace falta redibujar? (cambió el dibujo o se pide a la fuerza)
  needsDraw() {
    const key = this.mode === 'smooth' ? Math.round(this.t * 1000) : this.frame + this.clipHash();
    return key !== this.drawn;
  }
  private clipHash() { return this.clip.id.length * 1000 + this.clip.id.charCodeAt(0) * 100000; }

  // Dibuja el sprite a `scale` px por unidad. El lienzo se ajusta a lo que ocupa el dibujo en este cuadro
  // (no a la caja fija del personaje): en el teléfono es la diferencia entre subir 16 MB o 2 MB por dibujo.
  fixedBox = false;            // hojas de sprites: caja fija, así todos los cuadros quedan registrados igual
  bx0 = 0; by0 = 0; ds = 1;    // origen (unidades, espacio ya espejado) y escala del último dibujo
  draw(force = false) {
    if (!force && !this.needsDraw()) return false;
    this.drawn = this.mode === 'smooth' ? Math.round(this.t * 1000) : this.frame + this.clipHash();
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    const d = this.def;
    const p = this.pose;
    const sq = num(p, 'sq', 1), py = num(p, 'y');
    const rot = num(p, 'rot'), hip = p.hip as [number, number], fx = this.facing;
    const parts = d.parts(this.bake ? p : { ...p, sm: 0 }, this.ph, { seed: this.seed, boil: this.flat ? 0 : this.boil, t: this.phT, glow: Math.max(this.glow, num(p, 'gl')), flash: this.flash });
    // transformación local (estirar/aplastar y giro), sin escala ni espejo
    const L = new DOMMatrix().translate(0, py).scale(1 / Math.sqrt(sq), sq).translate(0, -py)
      .translate(hip[0], hip[1] + py).rotate(rot * 180 / Math.PI).translate(-hip[0], -hip[1] - py);
    let x0: number, y0: number, x1: number, y1: number;
    if (this.fixedBox) {
      [x0, y0, x1, y1] = d.box;
    } else {
      x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
      const a = L.a, b = L.b, c = L.c, dd = L.d, e = L.e, f = L.f;
      for (const part of parts) for (const q of part.pts) {
        const X = (a * q[0] + c * q[1] + e) * fx, Y = b * q[0] + dd * q[1] + f;
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      const m = 2 + d.ink.ol * 2 + d.ink.olShadow;
      x0 -= m; y0 -= m; x1 += m; y1 += m;
      if (!isFinite(x0)) { x0 = -1; y0 = -1; x1 = 1; y1 = 1; }
    }
    const s = Math.min(this.scale, 2048 / (x1 - x0), 2048 / (y1 - y0));
    const W = Math.ceil((x1 - x0) * s), H = Math.ceil((y1 - y0) * s);
    // se reserva de a 64 px para no realocar en cada cuadro
    const need = (cur: number, v: number) => v > cur || v < cur * 0.55;
    if (need(this.cv.width, W) || need(this.cv.height, H)) {
      const w2 = Math.ceil(W / 64) * 64, h2 = Math.ceil(H / 64) * 64;
      this.cv.width = this.g.width = w2; this.cv.height = this.g.height = h2;
    }
    this.bx0 = x0; this.by0 = y0; this.ds = s;
    const c = this.ctx, g = this.gctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.g.width, this.g.height);
    const M = new DOMMatrix().translate(-x0 * s, -y0 * s).scale(s * fx, s).multiply(L);
    c.setTransform(M); g.setTransform(M);
    paint(c, parts, { ...d.ink, light: [this.light[0] * fx, this.light[1]], flat: this.flat, seed: this.flat ? 0 : this.seed }, g);
    this.version++;
    return true;
  }

  // Rectángulo del sprite en el mundo (y hacia arriba)
  rect(): [number, number, number, number] {
    const rx = this.rootX(), ry = this.rootY(), s = this.ds;
    const x0 = this.bx0, y0 = this.by0, x1 = x0 + this.cv.width / s, y1 = y0 + this.cv.height / s;
    return [rx + x0, ry - y1, rx + x1, ry - y0];
  }
}
