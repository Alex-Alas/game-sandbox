// El escenario vivo: actores, efectos por evento, rastros del arma, hitstop, sacudón de cámara,
// partículas ambientales y un director que encadena acciones para la demo.
import { Actor } from './actor.ts';
import { FX, K, type Trail } from './fx.ts';
import type { Renderer } from './gl/renderer.ts';
import { type Pose, type Ev, lerpPose, num } from './rig.ts';
import type { V } from './draw/curves.ts';

export interface Fighter {
  a: Actor<any>;
  name: string;
  trail: { core: [number, number, number], edge: [number, number, number], w: number, life: number };
  lastF: number; lastClip: string; lastPose: Pose | null;
  hp: number; hitBy: Set<string>;
  r: number; // radio del cuerpo (para golpes)
  move?: { x: number, speed: number, clip: string } | null;
  armor?: string[];   // clips en los que no se interrumpe al recibir un golpe
  dead?: boolean;
}

export class Stage {
  fx: FX;
  fighters: Fighter[] = [];
  hitstop = 0;
  shake = 0; shakeT = 0;
  slow = 1;
  time = 0;
  R: Renderer;
  ambient = true;
  lantern: V = [178, 46];
  onSfx?: (k: string, o?: Record<string, unknown>) => void;
  waves: { x: number; y: number; vx: number; t: number; life: number; dir: number; owner: Fighter }[] = [];
  charging: Fighter | null = null;
  camTarget: V = [0, 92];

  constructor(R: Renderer) {
    this.R = R;
    this.fx = new FX(R);
  }

  add(a: Actor<any>, name: string, trail: Fighter['trail'], r = 12): Fighter {
    const f: Fighter = { a, name, trail, lastF: -1, lastClip: '', lastPose: null, hp: 10, hitBy: new Set(), r };
    a.onEvent = (e) => this.event(f, e);
    a.bake = false;
    a.clipY = this.R.env.ground - 0.5;
    this.fighters.push(f);
    return f;
  }

  sfx(k: string, o?: Record<string, unknown>) { this.onSfx?.(k, o); }

  update(dt: number) {
    this.time += dt;
    // el sacudón corre aunque el mundo esté congelado
    if (this.shake > 0) {
      this.shakeT += dt;
      this.shake = Math.max(0, this.shake - dt * this.shake * 7 - dt * 2);
      const s = this.shake;
      this.R.cam.shakeX = (Math.sin(this.shakeT * 83) + Math.sin(this.shakeT * 51) * 0.6) * s;
      this.R.cam.shakeY = (Math.cos(this.shakeT * 71) + Math.sin(this.shakeT * 39) * 0.5) * s;
    } else { this.R.cam.shakeX = this.R.cam.shakeY = 0; }
    this.R.post.flash = Math.max(0, this.R.post.flash - dt * 6);
    for (const f of this.fighters) f.a.flash = Math.max(0, f.a.flash - dt * 9);
    this.R.post.invert = Math.max(0, this.R.post.invert - dt * 20);
    this.R.post.ca = Math.max(0.0018, this.R.post.ca - dt * 0.05);
    this.R.post.waves = this.R.post.waves.filter((w) => (w.r += dt * 260, w.k -= dt * 0.06, w.k > 0));
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    const wdt = dt * this.slow;
    for (const f of this.fighters) {
      if (f.move) {
        const m = f.move, a = f.a, dir = Math.sign(m.x - a.x);
        if (a.clip.id !== m.clip) a.play(m.clip);
        if (dir) a.setFacing(dir);
        a.x += dir * m.speed * wdt;
        if ((m.x - a.x) * dir <= 0) { a.x = m.x; a.play('idle'); f.move = null; }
      }
      f.a.update(wdt);
      this.trails(f);
    }
    this.fx.update(wdt);
    this.updateWaves(wdt);
    if (this.charging) this.chargeFx(this.charging, wdt);
    for (const d of this.dying) {
      d.t += wdt / 2.4;
      const a = d.f.a;
      a.dissolve = Math.min(1, d.t);
      // brasas que se desprenden de la línea que se deshace (de la cabeza a los pies)
      const yy = a.rootY() + a.height + 4 - (a.height + 8) * a.dissolve;
      for (let i = 0; i < 4; i++) this.fx.add({ k: K.EMBER, x: a.rootX() + this.fx.rnd(-38, 38), y: yy + this.fx.rnd(-6, 6), vx: this.fx.rnd(-16, 16), vy: this.fx.rnd(14, 50), size: this.fx.rnd(1.1, 2.6), life: this.fx.rnd(0.6, 1.6), drag: 0.6, grav: -16, r: 2.6, g: 1.0, b: 0.3 });
      if (Math.random() < wdt * 6) this.fx.add({ k: K.ASH, x: a.rootX() + this.fx.rnd(-30, 30), y: yy, vx: this.fx.rnd(-10, 10), vy: this.fx.rnd(10, 30), size: this.fx.rnd(1.5, 3), life: 2, r: 0.2, g: 0.2, b: 0.24, vr: 3 });
      if (d.t >= 1) { a.hidden = true; d.f.dead = true; }
    }
    this.dying = this.dying.filter((d) => d.t < 1);
    for (const c of this.cracksList) c.t += wdt / 2.2;
    this.cracksList = this.cracksList.filter((c) => c.t < 1);
    if (this.ambient) this.ambientFx(wdt);
  }

  // Rastro del arma: en cada dibujo nuevo con smear, una cinta que recorre el barrido entre el dibujo
  // anterior y este (la pose se interpola, así el rastro es un arco y no una recta).
  trails(f: Fighter) {
    const a = f.a, fr = a.frame, cid = a.clip.id;
    if (fr === f.lastF && cid === f.lastClip) return;
    const cur = a.pose;
    const prev = f.lastClip === cid && f.lastPose ? f.lastPose : null;
    f.lastF = fr; f.lastClip = cid; f.lastPose = cur;
    if (!prev || !a.def.weapon) return;
    const sm = num(cur, 'sm');
    if (Math.abs(sm) < 0.05) return;
    const pts: Trail['pts'] = [];
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const p = lerpPose(prev, cur, i / N);
      const w = a.def.weapon(p);
      if (!w) return;
      // de la punta hacia adentro: la cinta ocupa el tramo exterior de la hoja
      pts.push({ a: a.toWorld(w.a[0], w.a[1], p), b: a.toWorld(w.b[0], w.b[1], p) });
    }
    this.fx.trails.push({ pts, t: 0, life: f.trail.life, core: f.trail.core, edge: f.trail.edge, w: f.trail.w, ink: true });
    // chispitas que se desprenden del filo
    const tip = pts[N].b, mid = pts[N >> 1].b;
    const ang = Math.atan2(tip[1] - mid[1], tip[0] - mid[0]);
    this.fx.sparks(tip[0], tip[1], 4, ang, 0.6, 140, [f.trail.edge[0] * 1.2, f.trail.edge[1] * 1.5, f.trail.edge[2]]);
  }

  // ---------- eventos de animación → efectos ----------
  event(f: Fighter, e: Ev) {
    const a = f.a, fx = this.fx;
    const foot = (k: string): V => { const p = a.pose; const v = p[k] as V; return a.toWorld(v[0], v[1]); };
    switch (e.k) {
      case 'step': {
        const [x, y] = foot(e.foot as string);
        fx.dust(x, Math.max(y, 0), 2, -a.facing * 0.4, 0.55);
        this.sfx('step');
        break;
      }
      case 'swing': this.sfx('swing'); break;
      case 'land': {
        const p = (e.power as number) ?? 1;
        fx.dust(a.rootX() - 8, 0, 4, -0.8, 0.8 * p); fx.dust(a.rootX() + 8, 0, 4, 0.8, 0.8 * p);
        fx.ring(a.rootX(), 1, 5, 60 * p, [0.4, 0.48, 0.5], 0.28, 3);
        this.kick(1.2 * p);
        this.sfx('land');
        break;
      }
      case 'jumpdust': fx.dust(a.rootX(), 0, 5, 0, 0.7); this.sfx('jump'); break;
      case 'impact': {
        const [x] = a.toWorld(20, 0);
        this.groundImpact(x, 1);
        break;
      }
      case 'dash': {
        const [x, y] = a.toWorld(0, -24);
        fx.speedLines(x, y, a.facing, 10, 34);
        fx.dust(a.rootX() - a.facing * 10, 0, 4, -a.facing, 0.7);
        this.ghosts(f, 4);
        this.sfx('dash');
        break;
      }
      case 'skid': fx.dust(a.rootX(), 0, 6, a.facing * 0.6, 0.8); this.sfx('skid'); break;
      case 'charge': this.charging = f; this.sfx('charge'); break;
      case 'wave': {
        this.charging = null;
        const [x, y] = a.toWorld(30, -28);
        this.waves.push({ x, y, vx: a.facing * 330, t: 0, life: 0.9, dir: a.facing, owner: f });
        fx.burst(x, y, 30, [1.0, 0.5, 0.2], 7);
        this.kick(2.5);
        this.R.post.ca = 0.012;
        this.sfx('wave');
        break;
      }
      case 'hurt': a.flash = 1; this.sfx('hurt'); break;
      case 'hit': this.tryHit(f, e); break;
      case 'stomp': {
        const [x] = foot(e.foot as string);
        fx.dust(x, 0, 3, 0, 0.9, [0.26, 0.3, 0.34]);
        this.kick(0.8);
        this.sfx('stomp');
        break;
      }
      case 'growl': this.sfx('growl'); fx.embers(a.rootX(), 60, 6, 20, 30); break;
      case 'slam': {
        const [x] = a.toWorld((e.dist as number) ?? 70, 0);
        this.groundImpact(x, 1.6);
        this.cracks(x);
        break;
      }
      case 'scrape': {
        // el hacha raspa el piso: chispas y escombros en abanico a lo largo del barrido
        for (let i = 0; i < 6; i++) {
          setTimeoutWorld(this, i * 0.02, () => {
            const [x] = a.toWorld(20 + i * 12, 0);
            fx.sparks(x, 1, 6, Math.PI / 2 - a.facing * 0.6, 0.5, 260);
            fx.shards(x, 0, 2, [0.18, 0.22, 0.26], 0.7);
          });
        }
        fx.dust(a.rootX() + a.facing * 60, 0, 6, a.facing, 1);
        this.kick(2.2);
        this.sfx('scrape');
        break;
      }
      case 'roar': {
        const [x, y] = a.toWorld(30, -90);
        for (let i = 0; i < 3; i++) setTimeoutWorld(this, i * 0.18, () => {
          fx.ring(x, y, 10, 260, [1.0, 0.45, 0.2], 0.5);
          this.R.post.waves.push({ x, y, r: 2, k: 0.016 });
        });
        fx.embers(x, y, 30, 30, 70);
        this.kick(6);
        this.R.post.ca = 0.02;
        this.sfx('roar');
        break;
      }
      case 'kneel': fx.dust(a.rootX(), 0, 8, 0, 1.2); this.kick(3); this.sfx('stomp'); break;
      case 'die': a.height = 84; this.dying.push({ f, t: 0 }); this.sfx('die'); break;
    }
    if (e.k !== 'hit' && e.k !== 'swing' && e.k !== 'step') this.onExtra?.(f, e);
  }
  onExtra?: (f: Fighter, e: Ev) => void;

  kick(k: number) { this.shake = Math.max(this.shake, k); }

  groundImpact(x: number, power: number) {
    const fx = this.fx;
    fx.dust(x - 10, 0, 6, -1, 1.1 * power); fx.dust(x + 10, 0, 6, 1, 1.1 * power);
    fx.shards(x, 0, Math.round(10 * power), [0.18, 0.22, 0.26], power);
    fx.sparks(x, 2, 12, Math.PI / 2, 1.2, 220 * power);
    fx.ring(x, 1, 8, 110 * power, [0.9, 0.55, 0.35], 0.32, 3.2);
    fx.burst(x, 6, 22 * power, [1.0, 0.45, 0.2], 11);
    this.R.post.waves.push({ x, y: 4, r: 4, k: 0.018 * power });
    this.kick(5 * power);
    this.hitstop = Math.max(this.hitstop, 0.06 * power);
    this.R.post.ca = 0.014;
    this.sfx('impact', { power });
  }

  // estelas: copias del sprite que se quedan atrás (sin redibujar: se guardan los lienzos)
  ghostList: { cv: HTMLCanvasElement; rect: [number, number, number, number]; t: number; life: number; tint: [number, number, number] }[] = [];
  ghosts(f: Fighter, n: number) {
    for (let i = 0; i < n; i++) {
      setTimeoutWorld(this, i * 0.035, () => {
        const a = f.a;
        const cv = document.createElement('canvas');
        cv.width = a.cv.width; cv.height = a.cv.height;
        cv.getContext('2d')!.drawImage(a.cv, 0, 0);
        this.ghostList.push({ cv, rect: a.rect(), t: 0, life: 0.28, tint: [1.0, 0.35, 0.3] });
      });
    }
  }
  timers: { t: number; f: () => void }[] = [];

  updateWaves(dt: number) {
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.f();
    for (const g of this.ghostList) g.t += dt / g.life;
    this.ghostList = this.ghostList.filter((g) => g.t < 1);
    for (const w of this.waves) {
      w.t += dt / w.life;
      w.x += w.vx * dt;
      if (Math.random() < 0.8) this.fx.sparks(w.x - w.dir * 10, w.y + this.fx.rnd(-16, 16), 1, Math.PI + (w.dir > 0 ? 0 : Math.PI), 0.3, 80);
      if (Math.random() < 0.5) this.fx.embers(w.x - w.dir * 14, w.y, 1, 14, 20);
      // golpe de la onda
      for (const g of this.fighters) {
        if (g === w.owner || w.owner.hitBy.has('wave' + g.name)) continue;
        if (Math.abs(g.a.rootX() - w.x) < g.r + 14 && Math.abs(w.y - (g.a.rootY() + 30)) < 50) {
          w.owner.hitBy.add('wave' + g.name);
          this.landHit(w.owner, g, w.x, w.y, 2, 120 * w.dir, 0, true);
        }
      }
    }
    this.waves = this.waves.filter((w) => w.t < 1);
  }

  chargeFx(f: Fighter, dt: number) {
    const a = f.a;
    if (a.clip.id !== 'charge' || num(a.pose, 'gl') >= 0.999 && a.frame > 12) { this.charging = null; return; }
    const w = a.def.weapon?.(a.pose);
    if (!w) return;
    const [tx, ty] = a.toWorld((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2);
    // brasas que convergen al filo
    if (Math.random() < dt * 40) {
      const ang = Math.random() * Math.PI * 2, R = this.fx.rnd(26, 46);
      const x = tx + Math.cos(ang) * R, y = ty + Math.sin(ang) * R;
      this.fx.add({ k: K.EMBER, x, y, vx: (tx - x) * 3.2, vy: (ty - y) * 3.2, size: this.fx.rnd(1.2, 2.4), life: 0.32, r: 3.2, g: 1.4, b: 0.4 });
    }
    if (Math.random() < dt * 6) this.fx.ring(tx, ty, 34, -80, [1.6, 0.7, 0.25], 0.35);
  }

  // ---------- golpes ----------
  tryHit(f: Fighter, e: Ev) {
    const reach = (e.reach as number) ?? 40;
    for (const g of this.fighters) {
      if (g === f || g.dead || g.a.hidden) continue;
      if (num(g.a.pose, 'yw') > 8 && !e.up) continue;   // en el aire esquiva los barridos
      const dx = (g.a.rootX() - f.a.rootX()) * f.a.facing;
      if (dx > -10 && dx < reach + g.r + 12) {
        const [hx, hy] = f.a.toWorld(Math.min(dx, reach) - g.r * 0.5, -30);
        this.landHit(f, g, hx, hy, (e.dmg as number) ?? 1, ((e.kb as number) ?? 50) * f.a.facing, (e.up as number) ?? 0, false);
      }
    }
  }
  onHit?: (from: Fighter, to: Fighter, dmg: number) => void;
  dying: { f: Fighter; t: number }[] = [];
  cracksList: { x: number; t: number }[] = [];
  cracks(x: number) { this.cracksList.push({ x, t: 0 }); }
  // solo lo visual del golpe (también lo usa la galería de efectos)
  spark(x: number, y: number, big: boolean, up = 0, dir = 1) {
    const fx = this.fx;
    fx.burst(x, y, big ? 26 : 18, [1.0, 0.42, 0.18], big ? 11 : 8);
    fx.sparks(x, y, big ? 16 : 10, Math.atan2(up * 0.01, dir), 0.9, big ? 300 : 220, [2.2, 1.4, 0.7]);
    fx.star(x, y, big ? 14 : 9, [1.8, 1.6, 1.4], 0.18);
    fx.ring(x, y, 6, big ? 220 : 160, [1.2, 0.7, 0.35], 0.25);
    fx.embers(x, y, big ? 10 : 5, 8, 40);
    this.hitstop = Math.max(this.hitstop, big ? 0.11 : 0.075);
    this.kick(big ? 4 : 2.4);
    this.R.post.ca = big ? 0.016 : 0.009;
    if (big) this.R.post.invert = 1;
    this.sfx('hit', { big, x });
  }
  landHit(from: Fighter, to: Fighter, x: number, y: number, dmg: number, kb: number, up: number, ranged: boolean) {
    const fx = this.fx;
    const big = dmg >= 2;
    void fx;
    this.spark(x, y, big, up, Math.sign(kb));
    to.a.flash = 1;
    to.hp -= dmg;
    if (!to.armor?.includes(to.a.clip.id)) to.a.play(to.hp <= 0 && to.a.def.clips.death ? 'death' : 'hurt', true);
    else if (to.hp <= 0 && to.a.def.clips.death) to.a.play('death', true);
    if (!ranged) this.R.post.waves.push({ x, y, r: 2, k: big ? 0.012 : 0.006 });
    this.onHit?.(from, to, dmg);
  }

  // ---------- ambiente ----------
  ambientFx(dt: number) {
    const fx = this.fx, cx = this.R.cam.x, H = this.R.cam.H;
    // ceniza a varias profundidades (parallax real)
    if (Math.random() < dt * 9) {
      const z = fx.rnd(-260, 120), sc = 1 + Math.max(0, z) / 200;
      fx.add({ k: K.ASH, x: cx + fx.rnd(-1, 1) * H * 1.2, y: this.R.cam.y + H * 0.75, z, vx: fx.rnd(-6, 2), vy: -fx.rnd(8, 16), size: fx.rnd(0.8, 1.5) * sc, vr: fx.rnd(-2, 2), rot: fx.rnd(0, 6),
        life: fx.rnd(7, 11), r: 0.45, g: 0.5, b: 0.52, a: z > 60 ? 0.5 : 0.8, drag: 0.1 });
    }
    // brasas del farol
    if (Math.random() < dt * 3) fx.embers(this.lantern[0], this.lantern[1] - 4, 1, 3, 18);
    // luciérnagas cerca de las flores
    if (Math.random() < dt * 1.6) {
      const z = fx.rnd(-140, -20);
      fx.add({ k: K.FIREFLY, x: cx + fx.rnd(-1, 1) * H * 0.9, y: fx.rnd(4, 60), z, vx: fx.rnd(-8, 8), vy: fx.rnd(-4, 6), size: fx.rnd(1.6, 2.6), life: fx.rnd(3, 6), r: 0.6, g: 2.4, b: 2.0, drag: 0.2 });
    }
  }

  // ---------- dibujo ----------
  draw(r: Renderer, drawActors?: (r: Renderer) => void) {
    const gl = r.gl;
    // estelas detrás de los personajes
    for (const g of this.ghostList) {
      const k = 1 - g.t;
      ghostDraw(r, g.cv, g.rect, k * 0.5, g.tint);
    }
    for (const c of this.cracksList) crackDraw(r, c.x, c.t);
    // sombras de contacto: se achican y aclaran cuando el personaje está en el aire
    for (const f of this.fighters) {
      const a = f.a;
      if (a.hidden || a.dissolve > 0.6) continue;
      const lift = Math.max(0, num(a.pose, 'yw'));
      const k = Math.max(0, 1 - lift / 60) * (1 - a.dissolve);
      shadowDraw(r, a.rootX() + a.facing * (f.r > 20 ? -4 : 0), f.r * 1.5 * (0.7 + 0.3 * k), 0.55 * k);
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (drawActors) drawActors(r);
    else for (const f of this.fighters) r.drawActor(f.a);
    this.fx.draw(r);
    for (const w of this.waves) waveDraw(r, w);
  }
}

function setTimeoutWorld(s: Stage, t: number, f: () => void) { s.timers.push({ t, f }); }

// estela: un sprite viejo teñido y transparente
const ghostTex = new WeakMap<HTMLCanvasElement, { c: WebGLTexture, g: WebGLTexture }>();
import { newTex, upload, Prog } from './gl/gl.ts';
import { QUAD_VS, HEAD, NOISE } from './gl/shaders.ts';
function ghostDraw(r: Renderer, cv: HTMLCanvasElement, rect: [number, number, number, number], a: number, tint: [number, number, number]) {
  const gl = r.gl;
  let t = ghostTex.get(cv);
  if (!t) { t = { c: newTex(gl), g: newTex(gl) }; upload(gl, t.c, cv); ghostTex.set(cv, t); }
  gl.bindVertexArray(r.quadVAO());
  gl.blendFunc(gl.ONE, gl.ONE);
  const P = r.P.sprite.use();
  P.m4('uVP', r.VP).f('uRect', ...rect).f('uZ', -0.1).f('uTime', r.time).f('uGlowK', 0).f('uFlash', 0).f('uSeed', 1).f('uDissolve', 0)
    .f('uTint', tint[0], tint[1], tint[2], 0.85).f('uFog', 0, 0, 0, 0).f('uLight', 0, 0, 1, 0).f('uLightCol', 0, 0, 0).f('uGround', -1e5, -1e5).f('uAlpha', a)
    .tex('uTex', 0, t.c).tex('uGlow', 1, t.g).i('uNoise', 7);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

// onda del tajo cargado: medialuna que vuela y se deshace
const WAVE_FS = HEAD + NOISE + `
in vec2 vUV;
uniform float uLife, uDir;
out vec4 o;
void main(){
  vec2 q = vUV * 2.0 - 1.0;
  q.x *= uDir;
  // medialuna: disco menos disco corrido
  float d1 = length(q * vec2(1.6, 1.0)) - 0.95;
  float d2 = length((q - vec2(-0.42, 0.0)) * vec2(1.6, 1.0)) - 0.95;
  float d = max(d1, -d2);
  if (d > 0.0) discard;
  float n = texture(uNoise, vUV * vec2(0.6, 1.2) + vec2(-uLife * 0.8 * uDir, 0.0)).g;
  float er = uLife * 1.1 - (q.x + 1.0) * 0.25;
  if (n < er) discard;
  float x = smoothstep(-0.25, 0.0, d);          // cerca del borde
  vec3 c = mix(vec3(3.2, 1.0, 0.35), vec3(5.0, 4.4, 3.6), smoothstep(0.0, 0.7, q.x + 0.3));
  float ink = smoothstep(-0.05, -0.015, d);
  c = mix(c, vec3(0.04, 0.02, 0.06), ink);
  o = vec4(c * (1.0 - uLife * 0.3), ink * 0.8);
}`;
let waveProg: Prog | null = null;
function waveDraw(r: Renderer, w: { x: number; y: number; t: number; dir: number }) {
  const gl = r.gl;
  if (!waveProg) waveProg = new Prog(gl, QUAD_VS, WAVE_FS, 'wave');
  gl.bindVertexArray(r.quadVAO());
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const s = 34 + w.t * 10;
  waveProg.use().m4('uVP', r.VP).f('uRect', w.x - s * 0.7, w.y - s, w.x + s * 0.7, w.y + s).f('uZ', 0.5).f('uLife', w.t).f('uDir', w.dir).i('uNoise', 7);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Director: una lista de pasos que se repite (la demo del escaparate)
export type Step = { clip?: string; run?: number; face?: number; wait?: number; then?: () => void };
export class Director {
  steps: Step[]; i = 0; t = 0; f: Fighter; speed = 92;
  constructor(f: Fighter, steps: Step[]) { this.f = f; this.steps = steps; }
  update(dt: number) {
    const a = this.f.a, st = this.steps[this.i];
    if (!st) return;
    this.t += dt;
    let done = false;
    if (st.face !== undefined) { a.setFacing(st.face); done = true; }
    else if (st.run !== undefined) {
      a.play('run');
      const dir = Math.sign(st.run - a.x);
      a.setFacing(dir || a.facing);
      a.x += dir * this.speed * dt;
      if ((st.run - a.x) * dir <= 0) { a.x = st.run; a.play('idle'); done = true; }
    } else if (st.clip) {
      if (this.t === dt) a.play(st.clip, true);
      if (a.clip.id === 'idle' || (a.clip.id !== st.clip && this.t > 0.05)) done = true;
    } else if (st.wait !== undefined) { if (this.t >= st.wait) done = true; }
    if (done) { st.then?.(); this.i = (this.i + 1) % this.steps.length; this.t = 0; }
  }
}

// grietas de brasa en el suelo tras el hachazo
const CRACK_FS = HEAD + NOISE + `
in vec2 vUV;
uniform float uLife, uSeed;
out vec4 o;
void main(){
  vec2 q = vUV * 2.0 - 1.0;
  float a = atan(q.y * 3.0, q.x), r = length(q * vec2(1.0, 3.0));
  float branches = abs(fract(a / 6.2831853 * 7.0 + texture(uNoise, vec2(r * 0.3, uSeed)).g * 0.6) - 0.5);
  float w = 0.035 * (1.0 - r) + 0.004;
  float k = smoothstep(w, w * 0.3, branches * r) * smoothstep(1.0, 0.2, r) * step(0.0, q.y + 0.25);
  float grow = smoothstep(0.0, 0.12, uLife);
  k *= step(r, grow * 1.1);
  vec3 c = mix(vec3(4.0, 1.4, 0.4), vec3(1.2, 0.2, 0.05), smoothstep(0.2, 1.0, uLife));
  float fade = 1.0 - smoothstep(0.5, 1.0, uLife);
  o = vec4(c * k * fade, k * fade * 0.6);
}`;
let crackProg: Prog | null = null;
function crackDraw(r: Renderer, x: number, t: number) {
  const gl = r.gl;
  if (!crackProg) crackProg = new Prog(gl, QUAD_VS, CRACK_FS, 'crack');
  gl.bindVertexArray(r.quadVAO());
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  crackProg.use().m4('uVP', r.VP).f('uRect', x - 70, -14, x + 70, 6).f('uZ', 0.2).f('uLife', t).f('uSeed', (x * 0.013) % 1).i('uNoise', 7);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

const SHADOW_FS = HEAD + `
in vec2 vUV;
uniform float uA;
out vec4 o;
void main(){
  vec2 q = vUV * 2.0 - 1.0;
  float d = length(q);
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * uA;
  o = vec4(0.0, 0.0, 0.0, a);
}`;
let shadowProg: Prog | null = null;
function shadowDraw(r: Renderer, x: number, w: number, a: number) {
  if (a <= 0.01) return;
  const gl = r.gl;
  if (!shadowProg) shadowProg = new Prog(gl, QUAD_VS, SHADOW_FS, 'shadow');
  gl.bindVertexArray(r.quadVAO());
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  shadowProg.use().m4('uVP', r.VP).f('uRect', x - w, -2.2, x + w, 2.6).f('uZ', -0.2).f('uA', a);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
