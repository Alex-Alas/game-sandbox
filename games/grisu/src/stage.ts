// Pegamento entre actores y efectos: los eventos de los clips (golpe, polvo, parry…) se vuelven efectos, y el smear
// del cuadro actual se dibuja mientras ese cuadro esté en pantalla (también cuadro a cuadro).
import * as THREE from 'three';
import type { Actor, ClipEv } from './render/anim.ts';
import { Fx, C, schoolRgb, type Rgb } from './render/fx.ts';
import type { EMIT } from './render/palette.ts';
type Glow = keyof typeof EMIT;
import { setUniform } from './render/toon.ts';

export type Who = { a: Actor, school: Glow, heavy?: boolean, flash: number, hitstop: number, tele: number, aura: boolean };

export class Stage {
  fx = new Fx();
  who: Who[] = [];
  shake = 0; shakeT = 0;
  onSfx?: (k: string, o?: Record<string, unknown>) => void;
  freeze = 0;            // hitstop global (en el escaparate: un solo personaje, se congela todo)
  screenFlash = 0;

  add(a: Actor, school: Glow = 'arcanita', heavy = false) {
    const w: Who = { a, school, heavy, flash: 0, hitstop: 0, tele: 0, aura: false };
    this.who.push(w);
    a.onEv = (e) => this.ev(w, e);
    return w;
  }
  facing(a: Actor) { return Math.sin(a.yaw) >= 0 ? 1 : -1; }
  // un punto [adelante, arriba] del actor en el mundo (sigue a la raíz, no al cuerpo)
  at(a: Actor, p?: unknown): THREE.Vector3 {
    const q = (p as number[] | undefined) ?? [0, 1];
    const f = this.facing(a), b = a.def.rig.body.position;
    return new THREE.Vector3(a.root.position.x + f * (q[0] + b.z), a.root.position.y + q[1], a.root.position.z + 0.4);
  }
  ev(w: Who, e: ClipEv) {
    const a = w.a, f = this.facing(a), fx = this.fx, sc = schoolRgb(w.school);
    const p = this.at(a, e.at);
    const foot = this.at(a, [0, 0.05]);
    switch (e.k) {
      case 'whoosh': this.onSfx?.('whoosh', { heavy: w.heavy }); break;
      case 'hit':
        fx.flash(p.x, p.y, 0.45, 0.07); fx.ring(p.x, p.y, 1.1, 0.22, C.white);
        fx.sparks(p.x, p.y, 14, f > 0 ? 0 : Math.PI, 1.8, 11, C.white, sc[1]);
        this.kick(0.12, 3); this.freeze = Math.max(this.freeze, 0.07);
        this.onSfx?.('hit'); break;
      case 'heavy':
        fx.flash(p.x, p.y, 0.7, 0.09); fx.wave(p.x, p.y - 0.3, 2.6, 0.4, C.dust); fx.ring(p.x, p.y, 1.6, 0.3, C.white);
        fx.dust(p.x, this.fx.ground + 0.05, 10, 0, 4, 1.4); fx.chips(p.x, p.y, 10, C.brass, C.brassD, 7);
        fx.sparks(p.x, p.y, 10, Math.PI / 2, 2.6, 9, C.white, sc[1]);
        this.kick(0.22, 6); this.freeze = Math.max(this.freeze, 0.11);
        this.onSfx?.('heavy'); break;
      case 'parry':
        fx.flash(p.x, p.y, 0.55, 0.09); fx.star(p.x, p.y, 1.1, 0.3); fx.ring(p.x, p.y, 1.4, 0.3, C.white);
        fx.sparks(p.x, p.y, 18, f > 0 ? 0 : Math.PI, 2.4, 12, C.white, sc[0]);
        this.screenFlash = 0.35; this.freeze = Math.max(this.freeze, 0.1); this.kick(0.1, 2);
        this.onSfx?.('parry'); break;
      case 'hurt':
        w.flash = 1; fx.sparks(p.x, p.y, 10, f > 0 ? Math.PI : 0, 1.6, 8, C.redC, C.red); this.kick(0.15, 3);
        this.onSfx?.('hurt'); break;
      case 'dust': fx.dust(foot.x - f * 0.3, foot.y, 6, -f, 3); break;
      case 'jump': fx.dust(foot.x, foot.y, 5, 0, 2.2, 0.8); this.onSfx?.('jump'); break;
      case 'land': fx.dust(foot.x, foot.y, 8, 0, 3.2, 1); this.onSfx?.('land'); break;
      case 'step': fx.dust(foot.x - f * 0.2, foot.y, 2, -f, 1.5, 0.6); break;
      case 'glint': fx.star(p.x, p.y, 0.7, 0.35, C.white, 0.8); this.onSfx?.('glint'); break;
      case 'aura': w.aura = !!e.on; setUniform(a.root, 'uAuraK', w.aura ? 1 : 0); if (w.aura) this.onSfx?.('danger'); break;
      case 'tele': w.tele = (e.d as number) ?? 0.5; fx.star(p.x, p.y, 0.9, 0.45, C.white, 0.8); fx.ring(p.x, p.y, 0.8, 0.3, C.white); this.onSfx?.('glint'); break;
      case 'clank': fx.sparks(p.x, p.y, 10, f > 0 ? Math.PI : 0, 2, 8, C.white, C.brassH); fx.dust(p.x, p.y - 0.2, 4, 0, 2); this.kick(0.08, 2); this.onSfx?.('clank'); break;
      case 'steam': fx.steam(p.x, p.y, 6, -f * 2, 3); break;
    }
  }
  kick(t: number, px: number) { this.shakeT = Math.max(this.shakeT, t); this.shake = Math.max(this.shake, px); }

  update(dt: number) {
    if (this.freeze > 0) { this.freeze -= dt; dt *= 0.0; }
    for (const w of this.who) {
      if (!w.a.root.visible) continue;
      w.a.update(dt);
      if (w.flash > 0) { w.flash = Math.max(0, w.flash - dt * 6); }
      if (w.tele > 0) w.tele = Math.max(0, w.tele - dt);
      // destello blanco de la telegrafía: titila a 10 Hz (en cuadros enteros, como un sprite)
      const tele = w.tele > 0 && Math.floor(w.tele * 10) % 2 === 0;
      setUniform(w.a.root, 'uFlash', w.flash > 0.5 ? 1 : tele ? 0.75 : 0);
      if (w.aura && Math.random() < dt * 30) {
        const r = w.a.root.position, h = w.a.def.height;
        this.fx.embers(r.x + (Math.random() - 0.5) * 1.4, r.y + Math.random() * h, 1, C.red, C.redC, 2.5, 0.5, 0.2);
      }
    }
    this.fx.update(dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shake = 0;
    this.screenFlash = Math.max(0, this.screenFlash - dt * 3);
  }
  // sacudón en píxeles enteros
  shakeOffset(): [number, number] {
    if (this.shake <= 0) return [0, 0];
    const s = Math.round(this.shake * Math.min(1, this.shakeT * 8));
    return [Math.round((Math.random() * 2 - 1) * s), Math.round((Math.random() * 2 - 1) * s)];
  }
  // los smears del cuadro actual de cada actor
  liveSmears() {
    this.fx.smears = [];
    for (const w of this.who) {
      const a = w.a, s = a.smear();
      if (!s) continue;
      const f = this.facing(a), sc = schoolRgb(w.school);
      const c = this.at(a, s.at ?? [0, 1]);
      const ang = (d: number) => { const r = d * Math.PI / 180; return f > 0 ? r : Math.PI - r; };
      const cols: [Rgb, Rgb, Rgb] = [C.white, sc[1], sc[2]];
      if (s.kind === 'thrust') {
        // estocada / embestida: líneas de velocidad sólidas detrás del cuerpo
        const L = 1.4 + s.w * 2;
        for (const [dy, k] of [[0, 1], [0.32, 0.7], [-0.3, 0.8], [0.6, 0.45], [-0.55, 0.5]]) {
          const y = c.y + dy * (s.w + 0.4), x1 = c.x - f * Math.abs(dy) * 0.4;
          this.fx.streak(x1 - f * L * k, y, x1, y, c.z + 0.2, 0.09 + s.w * 0.12 * k, cols, 0.0001);
        }
      } else this.fx.smear(c.x, c.y, c.z + 0.2, s.r, ang(s.from), ang(s.to), s.w, cols, 0.0001);
    }
  }
}
