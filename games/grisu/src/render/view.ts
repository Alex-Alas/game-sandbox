// La vista del juego (F1): traduce el estado de la sim a actores, efectos en píxel, sonido y cámara.
//  - héroes: los modelos del escaparate con sus clips de juego (models/*: g_*), elegidos por lo que hace la sim;
//    el contenedor se inclina hacia el dash, hacia la liga en el columpio y a medias hacia el martillazo;
//  - dummies: sacos de lona (liviano, mediano), un bloque de hierro (pesado), el Topo-barrena (atacante: sus clips de
//    ataque están sincronizados con la sim, foes.ts), una torreta y una válvula, todo por código;
//  - efectos: la receta de golpe (destello, aro, chispas, sacudón en píxeles enteros) desde los eventos de la sim;
//    la cadena de la liga, la mira del ancla, los proyectiles y las barras de vida van en el búfer de píxeles;
//  - cámara (GDD §3): PASILLO 13 m con el héroe en el tercio izquierdo; POZO 17 m con el héroe en el tercio de arriba;
//    SALA encuadra la arena entera. Se suaviza y se ancla a la grilla de píxeles (camera.ts).
import * as THREE from 'three';
import { Pixel } from './pixel.ts';
import { CamRig } from './camera.ts';
import { Actor } from './anim.ts';
import { esgrimista } from './models/esgrimista.ts';
import { estibador } from './models/estibador.ts';
import { topo } from './models/topo.ts';
import { toon, glowMat, setUniform, setEmit, type Toon } from './toon.ts';
import { EMIT } from './palette.ts';
import { mesh, sphere, cyl, box, torus, lathe, solid, flat } from './models/kit.ts';
import { buildPatioMesh, type PatioMesh } from './patio.ts';
import { Stage, type Who } from '../stage.ts';
import { C, schoolRgb, type Rgb } from './fx.ts';
import { HZ, HW, H, HAND, A, KINDS, type State, type World, type Pl, type Ev } from '../sim/state.ts';
import { attached, hookTarget, hammerBox } from '../sim/mech.ts';
import { BULLET_R } from '../sim/foes.ts';

type FoeView = { kind: string, holder: THREE.Group, body: THREE.Object3D, actor?: Actor, who?: Who, flash: number, hpShow: number, spin: number, hp0: number, broke: number };
const SKIP = new Set(['hit', 'heavy', 'parry', 'hurt']);
const YAW = Math.PI / 3;

export class GameView {
  P: Pixel; rig = new CamRig(); scene = new THREE.Scene(); S = new Stage();
  patio: PatioMesh;
  heroes: Record<string, { a: Actor, holder: THREE.Group, who: Who }> = {};
  foes: FoeView[] = [];
  bullets: THREE.Mesh[] = [];
  bg = new THREE.Color('#1f1c29');
  cam = { x: 0, y: 0, view: 13, zone: -1 };
  prev: { pl: { x: number, y: number }[], d: { x: number, y: number }[] } = { pl: [], d: [] };
  t = 0;
  lock = { id: '', until: 0 };   // clip de una sola vez que manda hasta `until` (s del reloj de la vista)
  tilt = 0;
  onSfx?: (k: string, o?: Record<string, unknown>) => void;
  aim: { x: number, y: number, grace: boolean, ok: boolean } | null = null;
  held: { x: number, y: number } | null = null;
  showBoxes = false;
  zoom = 1;          // depuración: acerca la cámara (capturas)
  // lo que el juego entendió de los gestos (px CSS y edad en s): para aprender y calibrar en el teléfono
  gest: { tap?: [number, number, number], swipe?: [number, number, number, number, number], hold?: [number, number] } = {};

  constructor(canvas: HTMLCanvasElement, w: World) {
    this.P = new Pixel(canvas);
    this.patio = buildPatioMesh(w);
    this.scene.add(this.patio.root);
    for (const [id, make] of [['esgrimista', esgrimista], ['estibador', estibador]] as const) {
      const a = new Actor(make(), 'idle');
      const holder = new THREE.Group();
      holder.add(a.root);
      this.scene.add(holder);
      const who = this.S.add(a, 'arcanita', id === 'estibador');
      who.skip = SKIP;
      this.heroes[id] = { a, holder, who };
    }
    w.dummies.forEach((sp) => this.foes.push(this.makeFoe(sp.kind)));
    const bm = glowMat(EMIT.blanco[1], 1, 2);
    for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(BULLET_R, 1), bm.clone()); b.visible = false; b.layers.enable(0); b.layers.enable(1); this.scene.add(b); this.bullets.push(b); }
    this.S.onSfx = (k, o) => this.onSfx?.(k, o);
    this.P.onFx = (d, wd, ht) => {
      this.S.liveSmears();
      const v = new THREE.Vector3();
      const proj = (x: number, y: number, z: number) => this.P.project(this.rig.cam, v.set(x, y, z), v);
      this.S.fx.draw(d, wd, ht, proj, this.P.H / this.rig.view);
      this.overlay(proj);
    };
  }

  // ---------- dummies por código
  private makeFoe(kind: string): FoeView {
    const holder = new THREE.Group();
    const body = new THREE.Group();
    holder.add(body);
    this.scene.add(holder);
    const z = KINDS[kind as keyof typeof KINDS];
    let actor: Actor | undefined, who: Who | undefined;
    if (kind === 'atacante') {
      actor = new Actor(topo(), 'idle');
      actor.yaw = -YAW;
      body.add(actor.root);
      who = this.S.add(actor, 'blanco', false);
      who.skip = SKIP;
    } else if (kind === 'liviano' || kind === 'mediano') {
      const canvas = toon('canvas'), brass = toon('brass', { metal: 1, rough: 0.3 }), rope = toon('leather');
      const h = z.h, r = z.hw * 0.95;
      mesh(lathe([[0.0, 0], [r * 0.8, 0.02], [r, h * 0.18], [r * 1.02, h * 0.6], [r * 0.85, h * 0.88], [r * 0.4, h * 0.98], [0, h]], 12), canvas, body, 0, 0, 0);
      for (const y of [0.3, 0.7]) mesh(torus(r * 1.0, 0.035, 4, 14), brass, body, 0, h * y, 0, Math.PI / 2, 0, 0);
      mesh(cyl(0.05, 0.05, 0.3, 6), rope, body, 0, h + 0.1, 0);                         // la cuerda de colgar
      mesh(torus(0.07, 0.02, 4, 8), brass, body, 0, h + 0.27, 0);
      // la diana pintada (para que se vea de qué lado mira)
      mesh(cyl(r * 0.45, r * 0.45, 0.02, 12), toon({ base: '#a8461e', S: '#6e1214', D: '#3a1418', R: '#c08070', H: '#e07050' }), body, 0, h * 0.5, r * 0.98, Math.PI / 2, 0, 0);
    } else if (kind === 'pesado') {
      const iron = toon('iron', { metal: 0.8, rough: 0.4 }), brass = toon('brass', { metal: 1, rough: 0.3 });
      mesh(flat(box(z.hw * 2, z.h * 0.85, 1.1)), iron, body, 0, z.h * 0.425, 0);
      mesh(flat(box(z.hw * 2.1, 0.3, 1.2)), brass, body, 0, z.h * 0.85 + 0.12, 0);
      mesh(flat(box(z.hw * 1.2, 0.35, 0.9)), iron, body, 0, z.h * 0.85 + 0.42, 0);
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) mesh(sphere(0.06, 5, 4), brass, body, sx * (z.hw - 0.15), 0.3 + i * 0.5, 0.56);
      mesh(cyl(0.2, 0.2, 0.08, 12), glowMat(EMIT.peligro[1], 0.4, 1.2), body, 0, z.h * 0.6, 0.57, Math.PI / 2, 0, 0);
    } else if (kind === 'torreta') {
      const iron = toon('iron', { metal: 0.8, rough: 0.4 }), brass = toon('brass', { metal: 1, rough: 0.3 });
      mesh(flat(cyl(0.5, 0.55, 0.35, 8)), iron, body, 0, 0.17, 0);
      mesh(sphere(0.38, 12, 8), brass, body, 0, 0.55, 0, 0, 0, 0, 1, 0.85, 1);
      const barrel = new THREE.Group(); barrel.position.set(0, 0.65, 0); barrel.name = 'barrel'; body.add(barrel);
      mesh(cyl(0.1, 0.12, 0.7, 8), iron, barrel, 0.35, 0, 0, 0, 0, Math.PI / 2);
      mesh(torus(0.12, 0.03, 4, 10), brass, barrel, 0.7, 0, 0, 0, Math.PI / 2, 0);
      mesh(sphere(0.09, 8, 6), glowMat(EMIT.peligro[1], 1, 1.8), body, 0, 0.62, 0.33);
    } else if (kind === 'valvula') {
      const iron = toon('iron', { metal: 0.8, rough: 0.4 }), brass = toon('brass', { metal: 1, rough: 0.3 }), copper = toon('copper', { metal: 0.8, rough: 0.35 });
      mesh(cyl(0.16, 0.16, 1.6, 10), copper, body, 0, 0.25, -0.9, Math.PI / 2, 0, 0);       // el caño que sale de la pared
      mesh(cyl(0.22, 0.22, 0.12, 10), brass, body, 0, 0.25, -0.1, Math.PI / 2, 0, 0);
      const wheel = new THREE.Group(); wheel.position.set(0, 0.25, 0.1); wheel.name = 'wheel'; body.add(wheel);
      mesh(torus(0.4, 0.06, 5, 14), iron, wheel, 0, 0, 0);
      for (let i = 0; i < 3; i++) mesh(box(0.8, 0.06, 0.06), iron, wheel, 0, 0, 0, 0, 0, i * Math.PI / 3);
      mesh(sphere(0.09, 8, 6), brass, wheel, 0, 0, 0.04);
    }
    solid(holder);
    return { kind, holder, body, actor, who, flash: 0, hpShow: 0, spin: 0, hp0: z.hp, broke: -1 };
  }

  setSchool(name: keyof typeof EMIT) {
    for (const h of Object.values(this.heroes)) { h.a.def.glow.setSchool?.(EMIT[name][1]); h.who.school = name; }
  }

  // Guarda las posiciones antes de un paso (para interpolar el dibujo entre dos cuadros de la sim)
  snapshot(s: State) {
    this.prev.pl = s.pl.map((p) => ({ x: p.x, y: p.y }));
    this.prev.d = s.d.map((d) => ({ x: d.x, y: d.y }));
  }

  // ---------- eventos de la sim → efectos y sonido
  events(s: State, w: World, evs: Ev[]) {
    const fx = this.S.fx, p = s.pl[0], h = this.heroes[p.cls], sc = schoolRgb(h.who.school);
    const vt = this.t;
    const one = (id: string, len: number) => { h.a.play(id); this.lock = { id, until: vt + len }; };
    for (const e of evs) {
      const x = e.x as number, y = e.y as number;
      switch (e.k) {
        case 'jump':
          fx.dust(x, y + 0.05, e.j === 1 ? 5 : 3, 0, 2.2, e.j === 1 ? 0.8 : 0.6);
          if (e.j === 2) fx.ring(x, y + 0.2, 0.6, 0.2, sc[1]);
          this.onSfx?.('jump'); h.a.play('g_rise'); this.lock.until = 0; break;
        case 'land': fx.dust(x, y + 0.05, Math.min(12, 4 + (e.v as number) * 0.4), 0, 3, 1); this.onSfx?.('land'); if (p.act === A.NONE) one('g_land', 4 / 12); break;
        case 'dash': {
          const dx = e.dx as number, dy = e.dy as number, L = w.c.DASH_D;
          one('g_dash', 6 / 12);
          // el smear del corte: una línea de velocidad sólida a lo largo del dash, y otra fina
          fx.streak(x - dx * 0.4, y - dy * 0.4, x + dx * L, y + dy * L, 0.5, 0.55, [C.white, sc[1], sc[2]], 0.09);
          fx.streak(x - dx * 0.2 - dy * 0.35, y - dy * 0.2 + dx * 0.35, x + dx * L * 0.8 - dy * 0.35, y + dy * L * 0.8 + dx * 0.35, 0.5, 0.2, [C.white, sc[1], sc[2]], 0.07);
          fx.dust(x, p.y + 0.05, p.ground ? 6 : 0, -Math.sign(dx) || -1, 3);
          this.onSfx?.('whoosh'); break;
        }
        case 'hit': {
          const heavy = !!e.heavy, crit = !!e.crit;
          fx.flash(x, y, heavy ? 0.7 : 0.45, heavy ? 0.09 : 0.07);
          fx.ring(x, y, heavy ? 1.5 : 1.1, heavy ? 0.3 : 0.22, crit ? schoolRgb('farol')[1] : C.white);
          fx.sparks(x, y, heavy ? 16 : 12, Math.atan2(p.ay, p.ax), 2.2, heavy ? 12 : 10, C.white, sc[1]);
          if (heavy) { fx.wave(x, y - 0.3, 2.2, 0.35); fx.chips(x, y, 8, C.brass, C.brassD, 7); }
          this.S.kick(heavy ? 0.2 : 0.12, heavy ? 5 : 3);
          const f = this.foes[e.e as number];
          if (f) { f.flash = 1; f.hpShow = 3; if (f.actor && !e.kill) { f.actor.play('hit'); } }
          this.onSfx?.(heavy ? 'heavy' : 'hit');
          if (p.combo > 1 && p.combo % 5 === 0) this.onSfx?.('combo', { n: p.combo });
          break;
        }
        case 'kill': { const f = this.foes[e.e as number]; if (f) f.broke = vt; fx.boom(x, y, 0.9, 0.5, 0.4, [C.white, C.brassH, C.brass]); fx.chips(x, y, 14, C.brass, C.brassD, 8); fx.smoke(x, y, 4); this.S.kick(0.18, 4); this.onSfx?.('boom'); break; }
        case 'respawn': { const f = this.foes[e.e as number]; if (f) { f.broke = -1; f.flash = 1; } break; }
        case 'parry':
          fx.flash(x, y, 0.6, 0.1); fx.star(x, y, 1.2, 0.35); fx.ring(x, y, 1.6, 0.32, C.white);
          fx.sparks(x, y, 20, p.face > 0 ? 0 : Math.PI, 2.4, 12, C.white, sc[0]);
          this.S.screenFlash = 0.35; this.S.kick(0.12, 2);
          one('g_parry', 6 / 12);
          this.onSfx?.('parry'); break;
        case 'block': fx.sparks(x, y, 10, p.face > 0 ? 0 : Math.PI, 1.6, 8, C.white, C.brassH); fx.ring(x, y, 0.7, 0.18, C.white); this.S.kick(0.08, 2); this.onSfx?.('block'); break;
        case 'guard': { const hx = p.x + p.face * 0.5; fx.star(hx, p.y + 1.3, 0.55, 0.12, C.white, 0.8); if (h.a.id !== 'g_guard' && h.a.id !== 'g_guardhold') h.a.play('g_guard'); this.lock.until = 0; this.onSfx?.('glint'); break; }
        case 'hurt': fx.sparks(x, y, 12, 0, 6.3, 8, C.redC, C.red); fx.flash(x, y, 0.5, 0.07, C.red); this.S.kick(0.18, 4); h.who.flash = 1; one('g_hit', 8 / 12); this.onSfx?.('hurt'); break;
        case 'deflect': fx.sparks(x, y, 12, 0, 6.3, 10, C.white, sc[1]); fx.star(x, y, 0.7, 0.2); this.onSfx?.('clank'); break;
        case 'clank': fx.sparks(x, y, 10, p.face > 0 ? Math.PI : 0, 2, 8, C.white, C.brassH); this.S.kick(0.08, 2); this.onSfx?.('clank'); break;
        case 'dive': one('g_dive', 99); fx.streak(x, y + 2.4, x, y + 0.6, 0.5, 0.35, [C.white, sc[1], sc[2]], 0.08); this.onSfx?.('whoosh', { heavy: true }); break;
        case 'pogo': {
          fx.flash(x, y, 0.5, 0.07); fx.ring(x, y, 1.0, 0.2, sc[1]); fx.sparks(x, y, 10, -Math.PI / 2, 2.6, 8, C.white, sc[1]); fx.dust(x, y, 4, 0, 2.5);
          this.S.kick(0.1, 3); h.a.play('g_rise'); this.lock.until = 0;
          const f = this.foes[e.e as number]; if (f) { f.flash = 1; f.spin += 1; }
          this.onSfx?.('pogo'); break;
        }
        case 'slam': fx.wave(x, y + 0.2, w.c.WAVE_R + 0.6, 0.4); fx.dust(x, y + 0.05, 12, 0, 4.5, 1.3); fx.chips(x, y + 0.1, 8, C.dust, C.dustS, 6); this.S.kick(0.22, 5); one('g_slam', 8 / 12); this.onSfx?.('heavy'); break;
        case 'hammer': one('g_hammer', 6 / 12); this.onSfx?.('whoosh', { heavy: true }); break;
        case 'hook': this.onSfx?.('chain'); break;
        case 'hookOn': fx.sparks(x, y, 8, 0, 6.3, 6, C.white, C.brassH); fx.dust(x, y, 3, 0, 1.5, 0.6); this.onSfx?.('latch'); break;
        case 'tele': {
          const f = this.foes[e.e as number];
          if (f?.actor) f.actor.play(e.red ? 'atkR' : 'atkW');
          else if (f) { f.flash = 0.75; const d = s.d[e.e as number]; fx.star(d.x + d.face * 0.6, d.y + 0.7, 0.8, 0.4, C.white, 0.8); this.onSfx?.('glint'); }
          break;
        }
        case 'shoot': fx.flash(x, y, 0.35, 0.06, C.brassH); fx.smoke(x, y, 2, 0.3); this.onSfx?.('shoot'); break;
        case 'bhit': fx.sparks(x, y, 6, 0, 6.3, 5, C.white, C.brassH); break;
        case 'pit': this.onSfx?.('pit'); break;
      }
    }
  }

  // ---------- estado → escena
  sync(s: State, w: World, alpha: number, dt: number) {
    this.t += dt;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const p = s.pl[0];
    for (const [id, h] of Object.entries(this.heroes)) {
      const on = id === p.cls;
      h.a.root.visible = on;
      if (!on) continue;
      const px = lerp(this.prev.pl[0]?.x ?? p.x, p.x), py = lerp(this.prev.pl[0]?.y ?? p.y, p.y);
      h.holder.position.set(px, py + 0.85, 0);
      h.a.root.position.set(0, -0.85, 0);
      h.a.yaw = p.face > 0 ? YAW : -YAW;
      h.who.frozen = s.t < p.stopT;
      this.pickClip(s, w, p, h.a);
      // inclinación del contenedor
      let tilt = 0;
      if (p.act === A.DASH) tilt = Math.atan2(p.ay, Math.abs(p.ax)) * (p.face > 0 ? 1 : -1) * 0.9;
      else if (p.act === A.HAMMER) tilt = Math.atan2(p.ay, Math.abs(p.ax) + 0.4) * (p.face > 0 ? 1 : -1) * 0.5;
      else if (p.hook && attached(p, s.t)) { const ex = p.hook.x - p.x, ey = p.hook.y - p.y - HAND; tilt = -Math.atan2(ex, Math.max(0.3, ey)) * 0.85; }
      this.tilt += (tilt - this.tilt) * Math.min(1, dt * 30);
      h.holder.rotation.z = Math.round(this.tilt / 0.13) * 0.13;   // a saltos, como un sprite
      // titila mientras es invulnerable tras un golpe
      const blink = s.t < p.invT && s.t - p.hurtT < 60 && Math.floor(s.t / 4) % 2 === 0;
      h.a.root.visible = !blink;
      // el ancla lanzada: la del modelo se va al punto enganchado (o a la punta que viaja) y su cadena se esconde
      const parts = h.a.def.parts;
      if (parts) {
        const out = !!p.shot && (p.hook || s.t < p.shot.at + 8);
        parts.chain.visible = !out;
        if (out) this.placeAnchor(s, p, parts.anc, h.a);
        else parts.anc.matrixAutoUpdate = true;
      }
    }
    // dummies
    s.d.forEach((d, k) => {
      const f = this.foes[k], sp = w.dummies[k];
      const dead = d.hp <= 0;
      f.holder.visible = !dead || this.t - f.broke < 0.05;
      const fx = lerp(this.prev.d[k]?.x ?? d.x, d.x), fy = lerp(this.prev.d[k]?.y ?? d.y, d.y);
      f.holder.position.set(fx, fy, sp.kind === 'valvula' || sp.kind === 'torreta' ? 0 : 0);
      if (f.actor) {
        f.actor.yaw = d.face > 0 ? YAW : -YAW;
        if (f.who) f.who.frozen = s.t < d.stopT || s.t < d.stunT;
        if (s.t < d.stunT && Math.random() < dt * 6) this.S.fx.star(d.x + (Math.random() - 0.5) * 0.8, d.y + 1.4 + Math.random() * 0.3, 0.3, 0.3, schoolRgb('farol')[1], 0.6);
        if (!d.atk && (f.actor.id === 'atkW' || f.actor.id === 'atkR') && s.t >= d.stunT && d.hp > 0 && f.actor.t > 0.6) f.actor.play('idle');
      } else {
        // los sacos se mecen y giran cuando vuelan; la válvula gira al poguearla; la torreta apunta al héroe
        if (sp.kind === 'liviano' || sp.kind === 'mediano' || sp.kind === 'pesado') {
          const tgt = d.ground ? 0 : THREE.MathUtils.clamp(-d.vx * 0.04, -0.6, 0.6);
          f.body.rotation.z += (tgt - f.body.rotation.z) * Math.min(1, dt * 10);
          f.body.rotation.y = d.face > 0 ? 0.5 : -0.5;
        } else if (sp.kind === 'valvula') {
          const wh = f.body.getObjectByName('wheel')!;
          f.spin *= Math.exp(-dt * 2);
          wh.rotation.z += f.spin * dt * 12;
        } else if (sp.kind === 'torreta') {
          const b = f.body.getObjectByName('barrel')!;
          const ax = p.x - d.x, ay = p.y + 1 - (d.y + 0.65);
          b.rotation.z = Math.round(Math.atan2(ay, ax) / 0.2) * 0.2;
        }
        f.flash = Math.max(0, f.flash - dt * 6);
        const tele = d.atk && s.t - d.atkT < 26 && Math.floor((s.t - d.atkT) / 4) % 2 === 0;
        setUniform(f.holder, 'uFlash', f.flash > 0.5 ? 1 : tele ? 0.75 : 0);
      }
      if (f.who) { if (f.flash > 0) { f.who.flash = f.flash; f.flash = 0; } }
      f.hpShow = Math.max(0, f.hpShow - dt);
    });
    // proyectiles
    this.bullets.forEach((m, i) => {
      const b = s.b[i];
      m.visible = !!b;
      if (!b) return;
      m.position.set(b.x, b.y, 0.2);
      setEmit(m.material as Toon, b.own ? EMIT.arcanita[1] : EMIT.blanco[1], 2.2);
    });
    // la mira del ancla (mientras se mantiene y no hay liga) y el punto mantenido
    this.aim = null;
    if (p.cls === 'estibador' && this.held && !p.hook) {
      const g = hookTarget(s, w, p, this.held.x, this.held.y);
      this.aim = g ? { x: g.x, y: g.y, grace: g.grace, ok: p.charge >= 1 && s.t >= p.hookT } : null;
    }
    this.S.update(dt);
    for (const h of Object.values(this.heroes)) if (h.a.root.visible || h.a.def.parts) h.a.apply();
    for (const f of this.foes) if (f.actor && f.holder.visible) f.actor.apply();
    this.camera(s, w, dt);
  }

  // Elige el clip del héroe según lo que hace la sim (los de una sola vez mandan hasta terminar)
  private pickClip(s: State, w: World, p: Pl, a: Actor) {
    const want = (id: string, speed = 1) => { if (a.id !== id) a.play(id); a.speed = speed; };
    if (this.t < this.lock.until && a.id === this.lock.id) {
      // la picada sigue mientras dure; el dash corta a la caída cuando termina en el aire
      if (this.lock.id === 'g_dive' && p.act !== A.DIVE) this.lock.until = 0; else return;
    }
    if (p.act === A.GUARD) { if (a.id !== 'g_guard' && a.id !== 'g_guardhold' && a.id !== 'g_parry') a.play('g_guard'); a.speed = 1; return; }
    if (p.act === A.DIVE) return want('g_dive');
    if (p.hook && attached(p, s.t)) return want('g_swing');
    if (p.ground) {
      const v = Math.abs(p.vx);
      if (v > 0.6) return want('run', Math.max(0.5, Math.min(1.5, v / (p.cls === 'estibador' ? 7 : 8))));
      if (a.id === 'g_land' || a.id === 'g_slam' || a.id === 'g_hit') return;   // terminan solos en idle
      return want('idle');
    }
    return want(p.vy > 1 ? 'g_rise' : 'g_fall');
  }

  // El ancla del Estibador en el punto enganchado (o en la punta que viaja), mirando a lo largo de la cadena
  private placeAnchor(s: State, p: Pl, anc: THREE.Object3D, a: Actor) {
    const sh = p.shot!;
    const u = sh.at > sh.t ? Math.min(1, (s.t - sh.t) / (sh.at - sh.t)) : 1;
    let tx = sh.ox + (sh.x - sh.ox) * u, ty = sh.oy + (sh.y - sh.oy) * u;
    if (p.hook && attached(p, s.t)) tx = p.hook.x, ty = p.hook.y;
    else if (!p.hook && s.t >= sh.at) { const k = Math.max(0, 1 - (s.t - sh.at) / 8); tx = p.x + (tx - p.x) * k; ty = p.y + HAND + (ty - p.y - HAND) * k; }
    a.root.updateMatrixWorld(true);
    const hand = new THREE.Vector3(p.x + p.face * 0.3, p.y + HAND, 0.3);
    const dir = new THREE.Vector3(tx - hand.x, ty - hand.y, 0);
    if (dir.lengthSq() < 1e-4) dir.set(p.face, 0, 0);
    dir.normalize();
    // la cabeza de martillo (z local 0,88) queda en el ancla: el origen del ancla va 0,88 m antes
    const pos = new THREE.Vector3(tx, ty, 0.3).addScaledVector(dir, -0.88);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const M = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
    const inv = new THREE.Matrix4().copy(anc.parent!.matrixWorld).invert();
    M.premultiply(inv);
    anc.matrixAutoUpdate = false;
    anc.matrix.copy(M);
    anc.matrixWorldNeedsUpdate = true;
  }

  // ---------- cámara por tipo de piso
  private camera(s: State, w: World, dt: number) {
    const p = s.pl[0], z = w.zones[p.zone], aspect = this.P.W / this.P.H;
    let view = 13, tx = p.x, ty = p.y + 2;
    if (z.id === 'pasillo') {
      view = 13;
      tx = p.x + view * aspect * (0.5 - 1 / 3);
      ty = Math.max(z.y0 + view * 0.42, p.y + 2.2);
    } else if (z.id === 'pozo') {
      view = 17;
      tx = (z.x0 + z.x1) / 2;
      ty = p.y - view * (2 / 3 - 0.5) + 1;
      ty = Math.max(z.y0 + view * 0.5 - 1.5, ty);
    } else {
      const W = z.x1 - z.x0 + 2, Hh = z.y1 - z.y0 + 2;
      view = Math.max(Hh, W / aspect);
      tx = (z.x0 + z.x1) / 2; ty = (z.y0 + z.y1) / 2;
    }
    if (this.zoom !== 1) { view /= this.zoom; tx = p.x; ty = p.y + 1.2; }
    if (this.cam.zone !== p.zone) { this.cam.x = tx; this.cam.y = ty; this.cam.view = view; this.cam.zone = p.zone; }
    const k = 1 - Math.exp(-dt * 8), ky = 1 - Math.exp(-dt * (z.id === 'pozo' ? 10 : 5));
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * ky;
    this.cam.view += (view - this.cam.view) * k;
    this.rig.view = this.cam.view;
    this.rig.target.set(this.cam.x, this.cam.y, 0);
  }

  render() {
    const [sx, sy] = this.S.shakeOffset();
    this.rig.update(this.P.H, this.P.rh, this.P.frac);
    if (sx || sy) {
      const ps = this.rig.view / this.P.H;
      this.rig.cam.position.x += sx * ps; this.rig.cam.position.y += sy * ps;
      this.rig.cam.updateMatrixWorld();
    }
    this.patio.update(this.t, this.rig.target.x, this.rig.target.y);
    this.P.flash = this.S.screenFlash > 0.22 ? 0.22 : 0;
    this.P.render(this.scene, this.rig.cam, this.bg);
  }

  // pantalla (px CSS) → plano de juego (z = 0)
  toWorld(cx: number, cy: number): [number, number] {
    const cam = this.rig.cam, [lx, ly] = this.P.screenToLow(cx, cy);
    const ndc = new THREE.Vector3((lx / this.P.rw) * 2 - 1, (ly / this.P.rh) * 2 - 1, 0.5);
    ndc.unproject(cam);
    const dir = ndc.sub(cam.position).normalize();
    const t = -cam.position.z / dir.z;
    return [cam.position.x + dir.x * t, cam.position.y + dir.y * t];
  }

  // ---------- lo que se dibuja en el búfer de píxeles: la cadena, la mira, barras de vida y cajas de depuración
  state: State | null = null; world: World | null = null;
  private overlay(proj: (x: number, y: number, z: number) => THREE.Vector3) {
    const s = this.state, w = this.world;
    if (!s || !w) return;
    const R = this.S.fx.R, p = s.pl[0];
    const P = (x: number, y: number, z = 0.3) => { const v = proj(x, y, z); return [v.x, v.y]; };
    const brass = C.brass, ink = C.ink;
    // la cadena de la liga: eslabones de latón alternados con tinta, de la mano al ancla (o a la punta que viaja)
    if (p.shot && (p.hook || s.t < p.shot.at + 8)) {
      const sh = p.shot;
      const u = sh.at > sh.t ? Math.min(1, (s.t - sh.t) / (sh.at - sh.t)) : 1;
      let tx = sh.ox + (sh.x - sh.ox) * u, ty = sh.oy + (sh.y - sh.oy) * u;
      if (p.hook && attached(p, s.t)) tx = p.hook.x, ty = p.hook.y;
      else if (!p.hook && s.t >= sh.at) { const k = Math.max(0, 1 - (s.t - sh.at) / 8); tx = p.x + (tx - p.x) * k; ty = p.y + HAND + (ty - p.y - HAND) * k; }
      const [ax, ay] = P(p.x + p.face * 0.3, p.y + HAND), [bx, by] = P(tx, ty);
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
        R.px(x, y + 1, ink); R.px(x, y - 1, ink);
        R.px(x, y, (i >> 1) % 2 ? brass : C.brassH);
      }
    }
    // proyectiles: aro blanco = se devuelve (parry o dash); arcanita = ya devuelto
    for (const b of s.b) {
      const [x, y] = P(b.x, b.y, 0.2), col: Rgb = b.own ? schoolRgb('arcanita')[1] : C.white;
      R.ring(x, y, 5, ink, false, 1, 2);
      R.ring(x, y, 5, col, true, Math.floor(s.t / 3) % 2 ? 1 : 0.6, 1);
      const [tx2, ty2] = P(b.x - b.vx * 0.05, b.y - b.vy * 0.05, 0.2);
      R.line(x, y, tx2, ty2, col, true, 0.7);
    }
    // la mira del ancla: aro en el punto donde se pegaría (punteado si es de gracia; rojo apagado sin carga)
    if (this.aim) {
      const [x, y] = P(this.aim.x, this.aim.y);
      const col: Rgb = this.aim.ok ? schoolRgb(this.heroes[p.cls].who.school)[1] : C.dustS;
      R.ring(x, y, 4, ink, false, 1, 3);
      R.ring(x, y, 4, col, true, this.aim.grace ? 0.5 : 1, 1);
      R.px(x, y, col, true);
    }
    // los gestos: un aro donde se tocó, una flecha hacia donde se deslizó, una cruz en el punto mantenido
    const G = this.gest, L = (x: number, y: number) => this.P.screenToLow(x, y);
    const parch: Rgb = [219, 191, 155];
    if (G.tap && G.tap[2] < 0.3) { const [x, y] = L(G.tap[0], G.tap[1]); R.ring(x, y, 3 + G.tap[2] * 20, parch, false, 1 - G.tap[2] * 3, 1); }
    if (G.swipe && G.swipe[4] < 0.35) {
      const [x, y] = L(G.swipe[0], G.swipe[1]), dx = G.swipe[2], dy = -G.swipe[3], a = 1 - G.swipe[4] * 2.6, len = 26;
      const x2 = x + dx * len, y2 = y + dy * len;
      R.line(x, y, x2, y2, parch, false, a);
      R.line(x2, y2, x2 - dx * 6 - dy * 4, y2 - dy * 6 + dx * 4, parch, false, a);
      R.line(x2, y2, x2 - dx * 6 + dy * 4, y2 - dy * 6 - dx * 4, parch, false, a);
    }
    if (G.hold) { const [x, y] = L(G.hold[0], G.hold[1]); R.line(x - 4, y, x + 4, y, parch, false, 0.8); R.line(x, y - 4, x, y + 4, parch, false, 0.8); }
    // barras de vida de los dummies golpeados
    s.d.forEach((d, k) => {
      const f = this.foes[k], z = KINDS[w.dummies[k].kind];
      if (d.hp <= 0 || !z.hp || f.hpShow <= 0) return;
      const [x, y] = P(d.x, d.y + z.h + 0.45);
      const W = 18, u = Math.max(0, d.hp / z.hp);
      for (let i = -1; i <= W; i++) for (let j = -1; j <= 2; j++) R.px(x - W / 2 + i, y + j, ink);
      for (let i = 0; i < Math.round(W * u); i++) for (let j = 0; j < 2; j++) R.px(x - W / 2 + i, y + j, s.t < d.stunT ? schoolRgb('farol')[1] : C.redC, true);
    });
    // cajas (depuración): héroe, dummies, golpes
    if (this.showBoxes) {
      const rect = (x0: number, y0: number, x1: number, y1: number, c: Rgb) => {
        const [a0, b0] = P(x0, y0, 0), [a1, b1] = P(x1, y1, 0);
        R.line(a0, b0, a1, b0, c, true); R.line(a1, b0, a1, b1, c, true); R.line(a1, b1, a0, b1, c, true); R.line(a0, b1, a0, b0, c, true);
      };
      rect(p.x - HW, p.y, p.x + HW, p.y + H, s.t < p.invT || (p.act === A.DASH && s.t - p.actT < w.c.DASH_INV) ? C.white : C.gasC);
      s.d.forEach((d, k) => { const z = KINDS[w.dummies[k].kind]; if (d.hp > 0) rect(d.x - z.hw, d.y, d.x + z.hw, d.y + z.h, C.redC); });
      if (p.act === A.HAMMER && s.t - p.actT >= w.c.HAMMER_ON && s.t - p.actT < w.c.HAMMER_OFF) { const hb = hammerBox(w, p); const [x, y] = P(hb.x, hb.y, 0); R.ring(x, y, hb.r * this.P.H / this.rig.view, C.white, true); }
    }
    void HZ;
  }
}
