// La aplicación del escaparate: cinco modos sobre la misma escena viva.
//  ESCENA      la pelea de demostración (con rótulos de cada técnica)
//  ANIMACIONES visor de clips: cuadro a cuadro, velocidad, papel cebolla, esqueleto, vector crudo vs final
//  EFECTOS     tocar la escena dispara el efecto elegido ahí
//  ESCENARIO   arrastrar para recorrerlo; vista despiezada de las capas en 3D
//  INTERFAZ    la interfaz del kit encima de la pelea, viva (vida, alma, jefe, diálogo)
import { Renderer, type Layer } from './gl/renderer.ts';
import { buildScene, type SceneDef } from './world/scene.ts';
import { Actor } from './actor.ts';
import { hero } from './chars/hero.ts';
import { brute } from './chars/brute.ts';
import { Stage, type Fighter } from './stage.ts';
import { Duel } from './demo.ts';
import { K } from './fx.ts';
import { contactSheet } from './lab.ts';
import type { CharDef } from './chars/types.ts';
import { UIKit } from './ui/uikit.ts';
import { num } from './rig.ts';

export type Mode = 'scene' | 'anim' | 'fx' | 'world' | 'ui';

export const MOVE_NAMES: Record<string, string> = {
  slash1: 'Tajo', slash2: 'Revés ascendente', slash3: 'Media luna', thrust: 'Estocada', charge: 'Tajo cargado',
  jump: 'Salto', dash: 'Amague', roar: 'Rugido', slam: 'Hachazo', sweep: 'Barrido', death: 'Caída',
};

export const FX_LIST: [string, string][] = [
  ['slash', 'Tajo'], ['moon', 'Media luna'], ['hit', 'Chispazo'], ['impact', 'Impacto'], ['wave', 'Onda cargada'],
  ['roar', 'Rugido'], ['dust', 'Polvo'], ['embers', 'Brasas'], ['cracks', 'Grietas'], ['dissolve', 'Disolución'], ['ghosts', 'Estelas'], ['lines', 'Velocidad'],
];

interface Aux { prev: Actor<any>; next: Actor<any>; raw: Actor<any> }

export class App {
  R: Renderer; scene: SceneDef; S: Stage; duel: Duel;
  H: Actor<any>; B: Actor<any>; HF: Fighter; BF: Fighter;
  mode: Mode = 'scene';
  t = 0; paused = false; slow = 1;
  anim = { who: 'hero' as 'hero' | 'brute', clip: 'slash1', playing: true, speed: 1, onion: false, rig: false, raw: false, split: 0.5, boil: true, smooth: false, bake: false };
  fxSel = 'slash'; fxIdle = 0; fxAuto = 0;
  world = { explode: false, drag: false, lastX: 0, panX: 0, vx: 0 };
  ui: UIKit | null = null;
  over: CanvasRenderingContext2D;
  aux = new Map<Actor<any>, Aux>();
  panelInset = { right: 0, bottom: 0 };   // fracción de pantalla que tapa el panel
  onCaption?: (title: string, sub: string) => void;
  onSfx?: (k: string, o?: Record<string, unknown>) => void;
  ambient = true;

  constructor(cv: HTMLCanvasElement, over: HTMLCanvasElement) {
    const R = this.R = new Renderer(cv);
    R.resize();
    this.over = over.getContext('2d')!;
    this.scene = buildScene(matchMedia('(pointer: coarse)').matches ? 0.75 : 1);
    R.env.light = [this.scene.lantern[0], this.scene.lantern[1], 70, 0.55];
    const S = this.S = new Stage(R);
    S.lantern = this.scene.lantern;
    S.onSfx = (k, o) => this.onSfx?.(k, o);
    this.H = new Actor(hero, 'idle');
    this.B = new Actor(brute, 'idle');
    this.BF = S.add(this.B, 'verdugo', { core: [1.3, 1.45, 1.5], edge: [0.35, 0.75, 1.0], w: 0.9, life: 0.32 }, 30);
    this.HF = S.add(this.H, 'errante', { core: [1.25, 1.18, 1.12], edge: [1.1, 0.14, 0.18], w: 0.5, life: 0.26 }, 10);
    this.BF.armor = ['slam', 'sweep', 'roar', 'death'];
    this.B.height = 130; this.H.height = 72;
    this.duel = new Duel(S, this.HF, this.BF);
    this.duel.reset();
    R.cam.H = 240; R.cam.y = 78;
    for (const a of [this.H, this.B]) {
      a.onPlay = (id, act) => {
        if (this.mode === 'scene' && MOVE_NAMES[id]) this.onCaption?.(MOVE_NAMES[id], act === this.H ? 'La Errante' : 'El Verdugo');
        if (this.mode === 'ui' && this.ui) {
          if (id === 'roar' && act === this.B) { this.S.timers.push({ t: 0.55, f: () => this.portrait() }); this.ui.say('El Verdugo de Ceniza', '«Otra máscara para mi colección. Acércate, que el filo no muerde… mucho.»'); }
          if (id === 'death' && act === this.B) this.ui.say('El Verdugo de Ceniza', '«La ceniza… siempre vuelve.»');
        }
      };
    }
    S.onHit = (_f, to) => { if (to === this.HF && this.ui) this.ui.hp = Math.max(0, this.ui.hp - 1); };
  }

  def(): CharDef<any> { return this.anim.who === 'hero' ? hero : brute; }
  actor(): Actor<any> { return this.anim.who === 'hero' ? this.H : this.B; }
  fighter(): Fighter { return this.anim.who === 'hero' ? this.HF : this.BF; }

  setMode(m: Mode) {
    const prev = this.mode;
    this.mode = m;
    const { H, B, R } = this;
    R.cam.explode = R.cam.explode; // se anima en update
    this.world.explode = false;
    this.S.waves = []; this.S.charging = null;
    for (const f of this.S.fighters) { f.move = null; f.a.loopAll = false; f.a.playing = true; f.a.speed = 1; f.a.mode = 'twos'; f.a.boil = 0.32; f.a.bake = false; f.a.flat = false; }
    if (m === 'scene' || m === 'ui') {
      if (prev !== 'scene' && prev !== 'ui') { this.duel.t = 0; this.duel.i = 0; }
      H.hidden = false; B.hidden = false;
    } else if (m === 'anim') {
      this.selectAnim(this.anim.who, this.anim.clip);
    } else if (m === 'fx') {
      B.hidden = true; H.hidden = false; B.dissolve = 0;
      H.x = -120; H.setFacing(1); H.play('idle', true); this.HF.dead = false;
      this.fxIdle = 0; this.fxAuto = 0;
    } else if (m === 'world') {
      H.hidden = false; B.hidden = false; B.dissolve = 0; this.BF.dead = false; this.BF.hp = 6;
      H.x = -70; H.setFacing(1); H.play('idle', true);
      B.x = 80; B.setFacing(-1); B.play('idle', true);
      this.world.panX = R.cam.x;
    }
    if (m === 'ui') { this.ui!.hp = 5; this.ui!.text = ''; }
  }

  selectAnim(who: 'hero' | 'brute', clip: string) {
    const { H, B } = this;
    this.anim.who = who;
    const def = this.def();
    if (!def.clips[clip]) clip = def.order.find((c) => c !== 'idle') ?? 'idle';
    this.anim.clip = clip;
    const a = this.actor(), other = who === 'hero' ? B : H;
    other.hidden = true;
    a.hidden = false; a.dissolve = 0;
    this.fighter().dead = false; this.fighter().hp = 99;
    a.x = a.anchor = who === 'hero' ? -10 : 0; a.y = 0;
    a.setFacing(1);
    a.loopAll = true;
    a.play(clip, true);
    this.applyAnimFlags();
  }
  applyAnimFlags() {
    const a = this.actor(), o = this.anim;
    a.playing = o.playing; a.speed = o.speed;
    a.boil = o.boil ? 0.32 : 0;
    a.mode = o.smooth ? 'smooth' : 'twos';
    a.bake = o.bake;
    a.drawn = -999;
  }
  stepFrame(d: number) {
    const a = this.actor();
    this.anim.playing = false; a.playing = false;
    const fps = a.clip.fps, f = Math.floor(a.t * fps + 1e-6) + d;
    const n = a.clip.frames;
    const ff = ((f % n) + n) % n;
    a.t = ff / fps + 1e-4;
    if (ff === 0) a.x = a.anchor;
    a.update(0);
  }

  // ---------- efectos a pedido ----------
  spawnFx(kind: string, x: number, y: number) {
    const S = this.S, fx = S.fx;
    y = Math.max(y, 4);
    switch (kind) {
      case 'slash': case 'moon': {
        const full = kind === 'moon';
        const pts: { a: [number, number], b: [number, number] }[] = [];
        const N = full ? 40 : 18, a0 = full ? -Math.PI * 0.5 : -2.4, a1 = full ? Math.PI * 1.5 : 0.5, R1 = full ? 46 : 52, R0 = full ? 18 : 12;
        for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; pts.push({ a: [x + Math.cos(a) * R0, y - Math.sin(a) * R0], b: [x + Math.cos(a) * R1, y - Math.sin(a) * R1] }); }
        fx.trails.push({ pts, t: 0, life: 0.36, core: [1.45, 1.38, 1.3], edge: [1.25, 0.16, 0.2], w: 0.55, ink: true });
        fx.sparks(x + R1, y, 8, -0.3, 0.6, 180, [1.8, 0.6, 0.4]);
        this.onSfx?.('swing');
        break;
      }
      case 'hit': S.spark(x, y, true, 30, 1); break;
      case 'impact': S.groundImpact(x, 1.4); S.cracks(x); break;
      case 'wave': S.waves.push({ x, y: Math.max(y, 26), vx: 300, t: 0, life: 1.1, dir: 1, owner: this.BF }); fx.burst(x, Math.max(y, 26), 26, [1, 0.5, 0.2], 7); this.onSfx?.('wave'); break;
      case 'roar': {
        for (let i = 0; i < 3; i++) S.timers.push({ t: i * 0.18, f: () => { fx.ring(x, y, 10, 260, [1.0, 0.45, 0.2], 0.5); this.R.post.waves.push({ x, y, r: 2, k: 0.016 }); } });
        fx.embers(x, y, 30, 30, 70); S.kick(6); this.onSfx?.('roar');
        break;
      }
      case 'dust': fx.dust(x - 8, 0, 6, -1, 1.2); fx.dust(x + 8, 0, 6, 1, 1.2); this.onSfx?.('land'); break;
      case 'embers': fx.embers(x, y, 40, 26, 90); for (let i = 0; i < 6; i++) fx.add({ k: K.FIREFLY, x: x + fx.rnd(-30, 30), y: y + fx.rnd(-20, 30), vx: fx.rnd(-20, 20), vy: fx.rnd(-10, 20), size: fx.rnd(1.6, 2.6), life: 3, r: 0.6, g: 2.4, b: 2.0, drag: 0.3 }); break;
      case 'cracks': S.cracks(x); fx.sparks(x, 2, 10, Math.PI / 2, 1, 160); S.kick(1.5); break;
      case 'dissolve': {
        const B = this.B;
        B.hidden = false; B.x = x; B.setFacing(-1); B.play('idle', true); B.dissolve = 0; B.height = 130; this.BF.dead = false;
        S.timers.push({ t: 0.6, f: () => { S.dying.push({ f: this.BF, t: 0 }); this.onSfx?.('die'); } });
        break;
      }
      case 'ghosts': { const H = this.H; H.x = x - 80; H.setFacing(1); H.play('dash', true); break; }
      case 'lines': fx.speedLines(x, y, 1, 16, 44); fx.speedLines(x, y + 20, 1, 8, 30); this.onSfx?.('dash'); break;
    }
  }

  portrait() {
    // recorte de la cabeza del Verdugo para el diálogo (sale del rig: la cabeza es el final de la columna)
    const B = this.B;
    const c = document.createElement('canvas'); c.width = 136; c.height = 136;
    const x = c.getContext('2d')!;
    x.fillStyle = '#1a1622'; x.fillRect(0, 0, 136, 136);
    const g = x.createRadialGradient(68, 60, 4, 68, 68, 90); g.addColorStop(0, 'rgba(255,140,60,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 136, 136);
    const bones = B.def.bones?.(B.pose);
    if (bones) {
      const spine = bones[0], [lx, ly] = spine[spine.length - 1];
      const s = B.ds;
      const cx = (B.facing * lx - B.bx0) * s, cy = (ly - B.by0) * s, r = 30 * s;
      x.drawImage(B.cv, cx - r, cy - r * 1.05, r * 2, r * 2, 0, 0, 136, 136);
    }
    if (this.ui) this.ui.portrait = c;
  }

  // ---------- cuadro ----------
  update(dt: number) {
    const { R, S } = this;
    this.t += dt;
    R.time = this.t;
    S.ambient = this.ambient;
    if (this.mode === 'scene' || this.mode === 'ui') {
      if (!this.paused && S.hitstop <= 0) this.duel.update(dt * S.slow);
    }
    if (this.mode === 'fx') {
      this.fxIdle += dt;
      if (this.fxIdle > 3.2) { this.fxAuto += dt; if (this.fxAuto > 1.6) { this.fxAuto = 0; const k = FX_LIST[(Math.floor(this.t / 1.6) % FX_LIST.length)][0]; this.spawnFx(k === 'dissolve' || k === 'ghosts' ? 'slash' : k, 40, 40); } }
      if (this.H.clip.id === 'idle' && this.H.x !== -120 && !S.ghostList.length) this.H.x += (-120 - this.H.x) * Math.min(1, dt * 2);
    }
    if (!this.paused) S.update(dt * this.slow);
    if (this.ui && this.mode === 'ui') {
      this.ui.bossHp = Math.max(0, this.BF.hp / 6);
      this.ui.soul = 0.35 + 0.3 * Math.sin(this.t * 0.4) + (this.H.clip.id === 'charge' ? num(this.H.pose, 'gl') * 0.3 : 0);
      if (this.duel.t < 0.1) { this.ui.hp = 5; this.ui.bossLag = 1; }
      this.ui.update(dt);
    }
    this.camera(dt);
  }

  camera(dt: number) {
    const { R, H, B } = this;
    const c = R.cam;
    let tx = c.x, ty = c.y, tH = c.H;
    const asp = R.W / R.H;
    if (this.mode === 'scene' || this.mode === 'ui') {
      const mid = B.hidden ? H.rootX() : (H.rootX() + B.rootX()) / 2;
      tx = Math.max(-140, Math.min(140, mid * 0.85)); tH = Math.max(240, 300 / asp); ty = 78 + (tH - 240) * 0.24;
    } else if (this.mode === 'anim') {
      const a = this.actor(), big = this.anim.who === 'brute';
      tH = Math.max(big ? 300 : 150, (big ? 230 : 120) / asp);
      tx = a.anchor + (big ? -10 : 8); ty = big ? 82 : 38;
    } else if (this.mode === 'fx') {
      tH = Math.max(230, 280 / asp); tx = -10; ty = 70 + (tH - 230) * 0.3;
    } else if (this.mode === 'world') {
      tH = Math.max(300, 340 / asp); ty = 92 + (tH - 300) * 0.3;
      if (!this.world.drag) { this.world.panX += this.world.vx * dt; this.world.vx *= Math.exp(-dt * 4); }
      this.world.panX = Math.max(-360, Math.min(360, this.world.panX));
      tx = this.world.panX;
    }
    // el panel tapa parte de la pantalla: el encuadre se corre para que se vea todo
    const viewW = tH * asp;
    tx += viewW * this.panelInset.right * 0.5;
    ty -= tH * this.panelInset.bottom * 0.5;
    const k = Math.min(1, dt * (this.mode === 'world' ? 8 : 2.4));
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.H += (tH - c.H) * k;
    const ex = this.mode === 'world' && this.world.explode ? 1 : 0;
    c.explode += (ex - c.explode) * Math.min(1, dt * 2.2);
  }

  render() {
    const { R, S } = this;
    R.resize();
    const ppu = R.pxPerUnit();
    for (const f of S.fighters) { f.a.scale = ppu; if (!f.a.hidden) f.a.draw(); }
    const animMode = this.mode === 'anim';
    R.frame(this.scene.layers, (r) => {
      if (animMode) S.draw(r, () => this.drawAnimActor(r));
      else S.draw(r);
    });
    this.drawOver();
  }

  // el visor: papel cebolla (cuadro anterior en azul, siguiente en rojo) y vector crudo partido
  private auxOf(a: Actor<any>): Aux {
    let x = this.aux.get(a);
    if (!x) {
      const mk = () => { const b = new Actor(a.def, 'idle'); b.ph = a.ph; b.playing = false; return b; };
      x = { prev: mk(), next: mk(), raw: mk() };
      x.raw.flat = true;
      this.aux.set(a, x);
    }
    return x;
  }
  private syncAux(b: Actor<any>, a: Actor<any>, f: number) {
    const n = a.clip.frames;
    if (b.clip !== a.clip) { b.clip = a.clip; }
    b.facing = a.facing; b.anchor = a.anchor; b.mode = a.mode; b.bake = a.bake; b.boil = a.boil;
    const ff = a.clip.loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1, f));
    b.t = ff / a.clip.fps + 1e-4;
    b.x = a.x; // misma raíz (el avance del clip lo pone su propia pose)
    b.y = a.y; b.scale = a.scale;
    b.update(0);
    b.draw(true);
  }
  private drawAnimActor(r: Renderer) {
    const a = this.actor(), o = this.anim;
    const aux = this.auxOf(a);
    if (o.onion) {
      const f = a.frame;
      for (const [b, d, tint] of [[aux.prev, -1, [0.3, 0.55, 1.0]], [aux.next, 1, [1.0, 0.35, 0.3]]] as [Actor<any>, number, number[]][]) {
        this.syncAux(b, a, f + d);
        b.tint = [tint[0], tint[1], tint[2], 0.75]; b.alpha = 0.42;
        r.drawActor(b);
      }
    }
    if (o.raw) {
      this.syncAux(aux.raw, a, a.frame);
      aux.raw.t = a.t; aux.raw.update(0); aux.raw.draw(true);
      const sx = Math.round(r.W * o.split);
      r.scissorX = [0, sx]; r.drawActor(aux.raw);
      r.scissorX = [sx, r.W]; r.drawActor(a);
      r.scissorX = null;
    } else r.drawActor(a);
  }

  drawOver() {
    const c = this.over, cv = c.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.mode !== 'anim') return;
    const a = this.actor(), o = this.anim;
    if (o.rig && a.def.bones) {
      const bones = a.def.bones(a.pose);
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const line of bones) {
        const pts = line.map(([lx, ly]) => { const [wx, wy] = a.toWorld(lx, ly); const [sx, sy] = this.R.toScreen(wx, wy); return [sx, sy]; });
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 5;
        c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
        c.strokeStyle = '#6fe0ff'; c.lineWidth = 2;
        c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
        for (const [x, y] of pts) { c.fillStyle = '#0b0910'; c.beginPath(); c.arc(x, y, 4.5, 0, 6.3); c.fill(); c.fillStyle = '#ffad5a'; c.beginPath(); c.arc(x, y, 3, 0, 6.3); c.fill(); }
      }
    }
    if (o.raw) {
      const x = cv.clientWidth * o.split;
      c.strokeStyle = 'rgba(239,231,216,0.85)'; c.lineWidth = 1.5; c.setLineDash([6, 5]);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, cv.clientHeight); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(10,9,14,0.85)'; c.strokeStyle = 'rgba(239,231,216,0.8)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, cv.clientHeight * 0.45, 14, 0, 6.3); c.fill(); c.stroke();
      c.fillStyle = '#efe7d8'; c.font = '600 11px system-ui'; c.textAlign = 'center';
      c.fillText('⟷', x, cv.clientHeight * 0.45 + 4);
      c.font = '700 10px system-ui'; c.fillStyle = 'rgba(239,231,216,0.8)';
      c.fillText('VECTOR CRUDO', x - 70, 90); c.fillText('FINAL', x + 50, 90);
    }
  }

  // ---------- hoja de sprites del clip elegido (PNG) ----------
  spriteSheet(): HTMLCanvasElement {
    const def = this.def(), clip = this.anim.clip;
    const s = def === hero ? 3 : 2;
    const frames = contactSheet(def, clip, s, { boil: this.anim.boil ? 0.32 : 0 });
    // recorta todo al rectángulo que usan los cuadros
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of frames) {
      const d = f.getContext('2d')!.getImageData(0, 0, f.width, f.height).data;
      for (let y = 0; y < f.height; y += 2) for (let x = 0; x < f.width; x += 2) if (d[(y * f.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4); x1 += 4; y1 += 4;
    const fw = x1 - x0, fh = y1 - y0, cols = Math.min(frames.length, Math.max(1, Math.floor(4096 / fw)));
    const rows = Math.ceil(frames.length / cols);
    const out = document.createElement('canvas');
    out.width = fw * cols; out.height = fh * rows;
    const c = out.getContext('2d')!;
    frames.forEach((f, i) => c.drawImage(f, x0, y0, fw, fh, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh));
    return out;
  }

  setLayer(l: Layer, on: boolean) { l.hidden = !on; }
}
