// El escaparate de GRISÚ (F0.5 del plan): cinco modos sobre el mismo mundo de LAS GALERÍAS.
//  PERSONAJES  el Esgrimista y el Estibador en la vista de juego (3/4), girables en 8 orientaciones, con sus clips
//  ENEMIGOS    el Topo-barrena y el Capataz autómata: un ataque telegrafiado en blanco y otro en rojo
//  ESCENARIO   el tramo de PASILLO con sus capas; un piloto lo recorre corriendo
//  EFECTOS     tocar lanza el efecto elegido ahí
//  RETRATOS    retratos ilustrados e íconos (DOM encima del escenario)
import * as THREE from 'three';
import { Pixel } from './render/pixel.ts';
import { CamRig } from './render/camera.ts';
import { Actor } from './render/anim.ts';
import { MODELS } from './render/models/index.ts';
import { buildGalerias, type World, type Layer } from './render/galerias.ts';
import { Stage } from './stage.ts';
import { C, schoolRgb } from './render/fx.ts';
import { EMIT, type School } from './render/palette.ts';
import { setUniform, eachToon } from './render/toon.ts';

export type Mode = 'personajes' | 'enemigos' | 'escenario' | 'efectos' | 'retratos';
export const MODES: [Mode, string][] = [['personajes', 'Personajes'], ['enemigos', 'Enemigos'], ['escenario', 'Escenario'], ['efectos', 'Efectos'], ['retratos', 'Retratos e íconos']];

export const CLIPS: Record<string, [string, string][]> = {
  esgrimista: [['idle', 'Guardia'], ['run', 'Carrera'], ['jump', 'Salto'], ['dash', 'Dash-corte'], ['guard', 'Guardia · parry'], ['hit', 'Golpe recibido']],
  estibador: [['idle', 'Guardia'], ['run', 'Carrera'], ['jump', 'Salto'], ['hammer', 'Martillazo'], ['anchor', 'Ancla'], ['hit', 'Golpe recibido']],
  topo: [['idle', 'Reposo'], ['atkW', 'Acometida (blanco: se devuelve)'], ['atkR', 'Barrena (rojo: se esquiva)'], ['hit', 'Golpe recibido']],
  capataz: [['idle', 'Reposo'], ['atkW', 'Picotazo (blanco: se devuelve)'], ['atkR', 'Embestida (rojo: se esquiva)'], ['hit', 'Golpe recibido']],
};
export const VIEWS: [string, string, number][] = [['juego', 'Juego · 13 m', 13], ['cerca', 'Cerca · 6 m', 6], ['detalle', 'Detalle · 3,5 m', 3.5]];
export const FX_LIST: [string, string][] = [['golpe', 'Golpe'], ['parry', 'Parry perfecto'], ['grisu', 'Grisú en cadena'], ['estelas', 'Estelas de escuela'], ['disolucion', 'Disolución']];

const SPOT = 8;            // dónde se paran los modelos (al lado de un farol y de la vagoneta)

export class App {
  P: Pixel; rig = new CamRig(); scene = new THREE.Scene(); W: World; S = new Stage();
  actors: Record<string, Actor> = {};
  mode: Mode = 'personajes';
  sel = { hero: 'esgrimista', enemy: 'topo', clip: 'idle', view: 'cerca', yaw: 1, school: 'arcanita' as School, playing: true, speed: 1, twos: true, split: false };
  layers: Record<Layer, boolean> = { fore: true, play: true, near: true, far: true, beams: true };
  steam = true; gasOn = true;
  pilot = { on: true, x: -20, vx: 8, jumping: false, pan: 0, drag: false, lastX: 0 };
  fxSel = 'golpe'; fxIdle = 0; fxStep = 0;
  slow = 1; slowT = 0;
  t = 0;
  bg = new THREE.Color('#2e2a3a');
  onSfx?: (k: string, o?: Record<string, unknown>) => void;
  onClip?: () => void;
  // efectos de EFECTOS
  sacs: { mesh: THREE.Object3D, x: number, y: number, t: number, alive: boolean }[] = [];
  chain: { t: number, i: number }[] = [];
  dis = { t: -1 };
  trails: { pts: number[][], t: number, school: keyof typeof EMIT, tr: ReturnType<Stage['fx']['trail']> | null }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.P = new Pixel(canvas);
    this.W = buildGalerias();
    this.scene.add(this.W.root);
    for (const id of Object.keys(MODELS)) {
      const a = new Actor(MODELS[id].make(), 'idle');
      this.actors[id] = a;
      this.scene.add(a.root);
      const w = this.S.add(a, id === 'topo' || id === 'capataz' ? 'blanco' : 'arcanita', id === 'estibador' || id === 'capataz');
      void w;
      a.onEnd = (cid, act) => { if (this.mode === 'escenario' && act === this.actors.esgrimista && cid === 'jump') act.play('run'); };
    }
    this.S.onSfx = (k, o) => this.onSfx?.(k, o);
    this.S.fx.ground = 0;
    this.P.onFx = (d, w, h) => {
      this.S.liveSmears();
      const v = new THREE.Vector3();
      this.S.fx.draw(d, w, h, (x, y, z) => this.P.project(this.rig.cam, v.set(x, y, z), v), this.P.H / this.rig.view);
    };
    // sacos de grisú del modo EFECTOS
    for (let i = 0; i < 4; i++) {
      const g = this.W.gas[0].mesh.clone();
      g.scale.setScalar(0.55);
      const x = SPOT - 1 + i * 1.7, y = 0.35;
      g.position.set(x, y, 0.3);
      g.visible = false;
      this.scene.add(g);
      this.sacs.push({ mesh: g, x, y, t: 0, alive: true });
    }
    this.setMode('personajes');
  }

  get hero() { return this.actors[this.sel.hero]; }
  get enemy() { return this.actors[this.sel.enemy]; }
  current(): Actor { return this.mode === 'enemigos' ? this.enemy : this.hero; }
  currentId() { return this.mode === 'enemigos' ? this.sel.enemy : this.sel.hero; }

  setMode(m: Mode) {
    this.mode = m;
    for (const a of Object.values(this.actors)) { a.root.visible = false; a.loopAll = false; a.rest = 0; a.playing = true; a.speed = 1; a.hold = -1; a.twos = true; setUniform(a.root, 'uAuraK', 0); setUniform(a.root, 'uDis', 0); }
    for (const s of this.sacs) s.mesh.visible = false;
    this.S.fx.parts = []; this.S.fx.bursts = []; this.S.fx.trails = [];
    for (const w of this.S.who) w.aura = false;
    this.slow = 1;
    if (m === 'personajes' || m === 'enemigos') {
      const a = this.current();
      a.root.visible = true;
      a.root.position.set(SPOT, 0, 0);
      this.sel.clip = CLIPS[this.currentId()].some(([c]) => c === this.sel.clip) ? this.sel.clip : 'idle';
      this.playSel();
    } else if (m === 'escenario') {
      const h = this.actors.esgrimista;
      h.root.visible = true;
      h.yaw = Math.PI / 3;
      this.pilot.x = -20; this.pilot.jumping = false;
      h.root.position.set(this.pilot.x, 0, 0);
      h.play('run');
      this.applySchool();
    } else if (m === 'efectos') {
      const h = this.actors.esgrimista, e = this.actors.capataz;
      h.root.visible = true; e.root.visible = true;
      h.root.position.set(SPOT - 3, 0, 0); h.yaw = Math.PI / 3; h.play('idle');
      e.root.position.set(SPOT + 3.2, 0, 0); e.yaw = -Math.PI / 3; e.play('idle');
      for (const s of this.sacs) { s.alive = true; s.mesh.visible = false; }
      this.fxIdle = 0;
      this.applySchool();
    } else if (m === 'retratos') {
      this.pilot.x = 150;
    }
  }
  playSel() {
    const a = this.current();
    a.yaw = this.yawOf(this.sel.yaw);
    a.play(this.sel.clip);
    // en el escaparate todo vuelve a empezar en bucle
    a.loopAll = true; a.rest = 0;
    a.playing = this.sel.playing; a.speed = this.sel.speed; a.twos = this.sel.twos; a.hold = -1;
    setUniform(a.root, 'uAuraK', 0);
    for (const w of this.S.who) if (w.a === a) w.aura = false;
    this.applySchool();
    this.onClip?.();
  }
  // 8 orientaciones; la 1 es la de juego (de frente a +x con 30° hacia la cámara)
  yawOf(i: number) { return [Math.PI / 2, Math.PI / 3, 0, -Math.PI / 3, -Math.PI / 2, -2 * Math.PI / 3, Math.PI, 2 * Math.PI / 3][((i % 8) + 8) % 8]; }
  applySchool() {
    const col = EMIT[this.sel.school][1];
    for (const id of ['esgrimista', 'estibador']) {
      this.actors[id].def.glow.setSchool?.(col);
      for (const w of this.S.who) if (w.a === this.actors[id]) w.school = this.sel.school;
    }
  }
  stepFrame(d: number) {
    const a = this.current();
    this.sel.playing = false; a.playing = false;
    const n = a.frames, f = ((a.frameAt() + d) % n + n) % n;
    a.t = f / a.fps + 1e-4;
    a.drawnFrame = -1;
    this.onClip?.();
  }

  // ---------- EFECTOS ----------
  fireFx(kind: string, x: number, y: number) {
    const fx = this.S.fx, h = this.actors.esgrimista, e = this.actors.capataz, sc = schoolRgb(this.sel.school);
    this.fxIdle = 0;
    if (kind === 'golpe') {
      fx.flash(x, y, 0.5, 0.07); fx.ring(x, y, 1.2, 0.24); fx.sparks(x, y, 16, 0, 6.3, 10, C.white, sc[1]);
      fx.dust(x, Math.max(0.05, y - 0.8), 3, 0, 2, 0.8);
      this.S.kick(0.14, 3); this.S.freeze = 0.08; this.onSfx?.('hit');
      if (Math.abs(x - e.root.position.x) < 1.6 && y < 2.6) { e.play('hit'); e.def.clips.hit.next = 'idle'; this.S.who.find((w) => w.a === e)!.flash = 1; }
    } else if (kind === 'parry') {
      h.play('guard'); h.t = 10.5 / 12; h.def.clips.guard.next = undefined;
      this.slow = 0.4; this.slowT = 0.45;
    } else if (kind === 'grisu') {
      for (const s of this.sacs) { s.alive = true; s.mesh.visible = true; s.mesh.scale.setScalar(0.55); }
      let best = 0, bd = Infinity;
      this.sacs.forEach((s, i) => { const d = Math.abs(s.x - x); if (d < bd) { bd = d; best = i; } });
      this.chain = [{ t: 0.35, i: best }];
      this.onSfx?.('hiss');
    } else if (kind === 'estelas') {
      const keys: (keyof typeof EMIT)[] = ['piro', 'electro', 'alquimia', 'crono'];
      keys.forEach((k, i) => {
        const y0 = y + (i - 1.5) * 0.65, pts: number[][] = [];
        for (let j = 0; j <= 14; j++) { const u = j / 14; pts.push([x - 3.2 + u * 6.4, y0 + Math.sin(u * Math.PI * (1 + i * 0.3)) * (0.5 + i * 0.12) * (i % 2 ? 1 : -1), 0.6]); }
        this.trails.push({ pts, t: -i * 0.07, school: k, tr: null });
      });
      this.onSfx?.('whoosh');
    } else if (kind === 'disolucion') {
      this.dis.t = 0;
      this.onSfx?.('dissolve');
    }
  }
  private updateFx(dt: number) {
    const fx = this.S.fx;
    // cadena de grisú
    for (const c of this.chain) c.t -= dt;
    const due = this.chain.filter((c) => c.t <= 0);
    this.chain = this.chain.filter((c) => c.t > 0);
    for (const c of due) {
      const s = this.sacs[c.i];
      if (!s || !s.alive) continue;
      s.alive = false; s.mesh.visible = false;
      fx.boom(s.x, s.y + 0.3, 1.25, 0.75, 0.6, [schoolRgb('grisu')[0], C.fire, C.fireD]);
      fx.sparks(s.x, s.y + 0.3, 14, Math.PI / 2, 5, 11, C.fireC, C.fire);
      fx.embers(s.x, s.y + 0.6, 10); fx.smoke(s.x, s.y + 0.8, 5, 0.4, C.smoke, C.smokeL, 1.4);
      fx.ring(s.x, s.y + 0.3, 2.2, 0.3, C.fireC);
      this.S.kick(0.25, 5); this.S.freeze = 0.05; this.onSfx?.('boom');
      for (const n of [c.i - 1, c.i + 1]) if (this.sacs[n]?.alive) this.chain.push({ t: 0.2, i: n });
      if (!this.sacs.some((q) => q.alive)) setTimeout(() => { for (const q of this.sacs) { q.alive = true; q.mesh.visible = this.mode === 'efectos' && this.fxSel === 'grisu'; } }, 1800);
    }
    // estelas: la cabeza avanza por el camino y deja la cinta
    for (const tr of this.trails) {
      tr.t += dt;
      if (tr.t < 0) continue;
      const sc = schoolRgb(tr.school);
      if (!tr.tr) { const p0 = tr.pts[0]; tr.tr = fx.trail({ pts: [{ x: p0[0], y: p0[1], z: p0[2], t: 0 }], c: sc, life: 0.45, w: 0.16 }); }
      const n = Math.min(tr.pts.length, Math.floor(tr.t / 0.022));
      while (tr.tr.pts.length < n && tr.tr.pts.length < tr.pts.length) {
        const p = tr.pts[tr.tr.pts.length];
        tr.tr.pts.push({ x: p[0], y: p[1], z: p[2], t: 0 });
        if (Math.random() < 0.5) fx.embers(p[0], p[1], 1, sc[1], sc[0], 0.5, 0.6, 0.1);
      }
    }
    this.trails = this.trails.filter((tr) => tr.t < 1.2);
    // disolución del autómata (y se rearma desde los pies)
    if (this.dis.t >= 0) {
      const e = this.actors.capataz;
      this.dis.t += dt;
      const t = this.dis.t;
      const k = t < 1.2 ? t / 1.2 : t < 2.2 ? 1 : t < 3.2 ? 1 - (t - 2.2) : 0;
      setUniform(e.root, 'uDis', Math.max(0, Math.min(1, k)) * (k > 0 ? 1 : 0));
      if (t < 1.2 && Math.random() < dt * 40) {
        const p = e.root.position;
        fx.embers(p.x + (Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 2.2, 1, C.red, C.redC, 3, 0.4, 0.1);
        if (Math.random() < 0.3) fx.chips(p.x, 0.5 + Math.random() * 1.5, 1, C.brass, C.brassD, 4);
      }
      if (t > 3.3) { this.dis.t = -1; setUniform(e.root, 'uDis', 0); }
    }
    // a solas, el escaparate se muestra solo
    this.fxIdle += dt;
    if (this.fxIdle > 3.2) {
      const e = this.actors.capataz.root.position;
      const at: Record<string, [number, number]> = { golpe: [e.x - 0.3, 1.4], parry: [0, 0], grisu: [SPOT, 0.5], estelas: [SPOT, 2.4], disolucion: [0, 0] };
      const [x, y] = at[this.fxSel];
      this.fireFx(this.fxSel, x, y);
    }
    for (const s of this.sacs) s.mesh.visible = s.alive && this.fxSel === 'grisu';
  }

  // ---------- bucle ----------
  update(dt: number) {
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 1; }
    const sdt = dt * this.slow;
    this.t += dt;
    if (this.mode === 'escenario' || this.mode === 'retratos') this.updatePilot(sdt);
    this.S.update(sdt);
    if (this.mode === 'efectos') this.updateFx(sdt);
    // vapor de los caños y burbujas del grisú
    if (this.steam) for (const v of this.W.vents) {
      v.t -= sdt;
      if (v.t <= 0) { v.t = v.every; if (Math.abs(v.x - this.rig.target.x) < 30) { this.S.fx.steam(v.x, v.y, 7, 1.2, -2.5, v.z); } }
    }
    if (this.gasOn) for (const g of this.W.gas) if (Math.random() < sdt * 3 && Math.abs(g.x - this.rig.target.x) < 30) this.S.fx.bubbles(g.x, g.y + 0.4, 1, g.z);
    for (const a of Object.values(this.actors)) if (a.root.visible) a.apply();
  }
  private updatePilot(dt: number) {
    const p = this.pilot, h = this.actors.esgrimista;
    if (this.mode === 'escenario' && !p.on) return;
    p.x += p.vx * dt;
    if (p.x > this.W.x1 - 16) { p.x = this.W.x0 + 10; h.play('run'); }
    // salta antes de cada foso
    for (const [g0] of this.W.gaps) if (h.id === 'run' && p.x > g0 - 1.6 && p.x < g0 - 1.0) { h.play('jump'); h.def.clips.jump.next = 'run'; }
    h.root.position.x = p.x;
  }

  frameCamera() {
    const r = this.rig;
    if (this.mode === 'personajes' || this.mode === 'enemigos') {
      const v = VIEWS.find(([k]) => k === this.sel.view)![2];
      r.view = v;
      const ht = this.current().def.height;
      r.target.set(SPOT, v >= 12 ? v * 0.5 - 1.6 : Math.max(ht * 0.55, v * 0.42), 0);
    } else if (this.mode === 'efectos') {
      r.view = 7.5; r.target.set(SPOT, 2.3, 0);
    } else {
      r.view = 13;
      const aspect = this.P.W / this.P.H, wv = r.view * aspect;
      const hx = this.actors.esgrimista.root.position.x;
      // PASILLO: el héroe en el tercio izquierdo, la mira adelantada hacia donde corre
      const tx = this.mode === 'escenario' && !this.pilot.on ? this.pilot.pan : hx + wv * (0.5 - 1 / 3);
      if (this.mode === 'escenario' && this.pilot.on) this.pilot.pan = tx;
      r.target.set(tx, 4.6, 0);
    }
  }

  panelPx = 0;   // px CSS que tapa el panel a la derecha (la cámara se corre la mitad)
  panelBottom = 0; // px CSS que tapa el panel abajo (teléfono parado)
  render() {
    for (const [k, on] of Object.entries(this.layers)) this.W.groups[k as Layer].visible = on;
    // en las vistas de «pedestal» el primer plano no tapa al modelo
    if (this.mode !== 'escenario' && this.mode !== 'retratos') this.W.groups.fore.visible = false;
    this.frameCamera();
    if (this.panelPx > 0 && this.mode !== 'escenario') {
      const mpp = this.rig.view / (this.P.sh / this.P.dpr);   // metros por px CSS
      this.rig.target.x += this.panelPx * 0.5 * mpp;
    }
    if (this.panelBottom > 0 && this.mode !== 'escenario') {
      const mpp = this.rig.view / (this.P.sh / this.P.dpr);
      this.rig.target.y -= this.panelBottom * 0.5 * mpp;
    }
    const [sx, sy] = this.S.shakeOffset();
    this.rig.update(this.P.H, this.P.rh, this.P.frac);
    if (sx || sy) {
      const ps = this.rig.view / this.P.H;
      this.rig.cam.position.x += sx * ps; this.rig.cam.position.y += sy * ps;
      this.rig.cam.updateMatrixWorld();
    }
    this.W.update(this.t, this.rig.target.x);
    this.P.flash = this.S.screenFlash > 0.22 ? 0.22 : 0;
    this.P.opt.split = this.sel.split ? this.splitX : -1;
    this.P.render(this.scene, this.rig.cam, this.bg);
  }
  splitX = 0;

  // ¿qué toon hay? (para el destello de golpe al tocar un actor)
  touches(a: Actor) { let n = 0; eachToon(a.root, () => n++); return n; }
}
