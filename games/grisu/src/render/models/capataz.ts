// CAPATAZ AUTÓMATA: el que manda en la galería (GDD §10.1). Bloquea de frente con un escudo de hierro.
// Silueta: un armario con patas de pistón; la cabeza es una cúpula de latón con la visera en ranura (dos ojos rojos),
// la caldera en la panza y la chimenea atrás. Escudo de hierro angular remachado con el engranaje de la compañía y
// un pico de minero. Latón redondo (cúpula, caldera, codos) contra hierro plano (pecho, escudo, pico).
// Ataques: PICOTAZO (destello blanco antes: se devuelve) y EMBESTIDA DE ESCUDO (aura roja: se esquiva).
import * as THREE from 'three';
import { Rig, type ModelDef, type Clip, type Pose } from '../anim.ts';
import { toon, glowMat } from '../toon.ts';
import { EMIT } from '../palette.ts';
import { mesh, sphere, cyl, box, torus, lathe, limb, extrude, solid, flat, rivetsArc } from './kit.ts';

export function capataz(): ModelDef {
  const m = {
    brass: toon('brass', { metal: 1, rough: 0.3 }), copper: toon('copper', { metal: 0.8 }), iron: toon('iron', { metal: 0.8, rough: 0.45 }),
    dark: toon('coal'), wood: toon('wood'), steel: toon('steel', { metal: 1, rough: 0.2 }),
  };
  const eye = glowMat(EMIT.peligro[1], 1, 2.1);
  const fire = glowMat(EMIT.piro[2], 0.5, 1.2);
  const R = new Rig();
  const hips = R.joint('hips', R.body, 0, 1.0, 0);
  mesh(flat(box(0.5, 0.2, 0.36)), m.iron, hips, 0, 0, 0);
  for (const s of [1, -1]) {
    const n = s > 0 ? 'L' : 'R';
    const leg = R.joint('leg' + n, hips, s * 0.18, -0.08, 0);
    mesh(sphere(0.1, 8, 6), m.brass, leg, 0, 0, 0);
    limb(leg, m.iron, 0.45, 0.085, 0.07, 6);
    mesh(cyl(0.03, 0.03, 0.4, 5), m.brass, leg, 0, -0.22, 0.09);                     // pistón
    const knee = R.joint('knee' + n, leg, 0, -0.45, 0);
    mesh(sphere(0.09, 8, 6), m.brass, knee, 0, 0, 0);
    limb(knee, m.iron, 0.42, 0.075, 0.09, 6);
    const foot = R.joint('foot' + n, knee, 0, -0.44, 0);
    mesh(flat(extrude([[-0.12, 0], [0.12, 0], [0.16, -0.1], [-0.12, -0.1]], 0.28)), m.iron, foot, 0, 0, 0.06, 0, -Math.PI / 2, 0);
  }
  const spine = R.joint('spine', hips, 0, 0.1, 0);
  // pecho de hierro (un armario con chaflanes) y caldera de latón en la panza
  mesh(flat(extrude([[-0.34, 0], [0.34, 0], [0.42, 0.42], [0.36, 0.72], [-0.36, 0.72], [-0.42, 0.42]], 0.44)), m.iron, spine, 0, 0, 0);
  mesh(cyl(0.24, 0.24, 0.34, 14), m.brass, spine, 0, 0.26, 0.12, Math.PI / 2, 0, 0);
  mesh(cyl(0.16, 0.16, 0.36, 12), fire, spine, 0, 0.26, 0.13, Math.PI / 2, 0, 0);
  for (let i = -2; i <= 2; i++) mesh(box(0.02, 0.3, 0.02), m.dark, spine, i * 0.06, 0.26, 0.31);   // reja del fogón
  rivetsArc(spine, m.iron, 12, 0.245, 0, Math.PI * 2 * 11 / 12, 0.018, 0.26, 0.3, 'xy');
  for (const x of [-0.3, 0.3]) for (const y of [0.1, 0.6]) mesh(sphere(0.022, 5, 4), m.brass, spine, x, y, 0.23);
  // chimenea
  mesh(cyl(0.08, 0.1, 0.55, 10), m.copper, spine, 0.1, 0.85, -0.18);
  mesh(cyl(0.12, 0.09, 0.08, 10), m.copper, spine, 0.1, 1.13, -0.18);
  // hombros
  for (const s of [1, -1]) mesh(sphere(0.16, 10, 8), m.brass, spine, s * 0.46, 0.62, 0, 0, 0, 0, 1, 0.85, 1);
  // cabeza: cúpula con visera
  const head = R.joint('head', spine, 0, 0.74, 0.02);
  mesh(lathe([[0.2, 0], [0.22, 0.1], [0.2, 0.24], [0.12, 0.33], [0.0, 0.36]], 14), m.brass, head, 0, 0, 0);
  mesh(cyl(0.21, 0.21, 0.07, 14, true), m.dark, head, 0, 0.12, 0.0);
  mesh(flat(box(0.36, 0.06, 0.1)), m.dark, head, 0, 0.12, 0.17);
  for (const s of [1, -1]) mesh(box(0.08, 0.035, 0.03), eye, head, s * 0.08, 0.12, 0.215);
  mesh(cyl(0.02, 0.02, 0.12, 5), m.iron, head, 0.0, 0.42, 0);                       // antena-silbato
  mesh(sphere(0.035, 6, 5), m.brass, head, 0.0, 0.49, 0);
  // brazos
  for (const s of [1, -1]) {
    const n = s > 0 ? 'L' : 'R';
    const arm = R.joint('arm' + n, spine, s * 0.5, 0.6, 0);
    limb(arm, m.iron, 0.36, 0.085, 0.075, 6);
    const el = R.joint('elbow' + n, arm, 0, -0.36, 0);
    mesh(sphere(0.085, 8, 6), m.brass, el, 0, 0, 0);
    limb(el, m.iron, 0.34, 0.08, 0.09, 6);
    const hand = R.joint('hand' + n, el, 0, -0.38, 0);
    mesh(flat(box(0.13, 0.13, 0.13)), m.iron, hand, 0, -0.02, 0);
  }
  // escudo en el antebrazo izquierdo (hacia afuera y adelante)
  const shield = new THREE.Group(); shield.position.set(0.14, -0.2, 0.1); shield.rotation.set(0, 0.0, 0); R.joints.elbowL.add(shield);
  const sh = [[-0.36, -0.55], [0.36, -0.55], [0.42, 0.35], [0.0, 0.62], [-0.42, 0.35]];
  const sm = mesh(flat(extrude(sh, 0.06, 0.015)), m.iron, shield, 0, 0, 0, 0, Math.PI / 2, 0);
  void sm;
  for (const [x, y] of [[-0.3, -0.45], [0.3, -0.45], [-0.34, 0.28], [0.34, 0.28], [0, 0.5]]) mesh(sphere(0.03, 5, 4), m.brass, shield, 0.045, y, x);
  const emb = new THREE.Group(); emb.position.set(0.05, 0.02, 0); emb.rotation.set(0, Math.PI / 2, 0); shield.add(emb);
  mesh(cyl(0.16, 0.16, 0.03, 10), m.brass, emb, 0, 0, 0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; mesh(box(0.06, 0.06, 0.03), m.brass, emb, Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0, 0, 0, a); }
  mesh(cyl(0.06, 0.06, 0.04, 8), m.iron, emb, 0, 0, 0.01, Math.PI / 2, 0, 0);
  // pico en la mano derecha (el mango hacia +z)
  const pick_ = new THREE.Group(); pick_.position.set(0, -0.05, 0); R.joints.handR.add(pick_);
  mesh(cyl(0.03, 0.035, 1.05, 6), m.wood, pick_, 0, 0, 0.35, Math.PI / 2, 0, 0);
  const ph = new THREE.Group(); ph.position.set(0, 0, 0.84); pick_.add(ph);
  mesh(flat(extrude([[0, -0.05], [0.42, -0.01], [0.5, 0.06], [0.2, 0.05], [0, 0.06], [-0.2, 0.05], [-0.5, 0.06], [-0.42, -0.01]], 0.06)), m.iron, ph, 0, 0, 0, 0, Math.PI / 2, Math.PI / 2);
  mesh(torus(0.045, 0.014, 4, 8), m.brass, ph, 0, 0, 0, 0, 0, 0);
  solid(R.root);

  const base: Pose = {
    hips: [0, 0, 0], spine: [0.05, 0, 0], head: [0, 0, 0],
    armL: [-0.7, 0, 0.15], elbowL: [-0.9, 0, 0], handL: [0, 0, 0],
    armR: [-0.3, 0, -0.2], elbowR: [-0.8, 0, 0], handR: [-0.2, 0, 0],
    legL: [-0.2, 0, 0.05], kneeL: [0.3, 0, 0], footL: [-0.1, 0, 0], legR: [0.15, 0, -0.05], kneeR: [0.25, 0, 0], footR: [-0.4, 0, 0],
    pos: [0, 0, 0], scl: [1, 1, 1],
  };
  const clips: Record<string, Clip> = {
    idle: { len: 2.0, loop: true, keys: [
      { t: 0, p: {} },
      { t: 1.0, p: { spine: [0.08, 0.05, 0], head: [0.06, -0.15, 0], armR: [-0.35, 0, -0.22], scl: [1.02, 0.985, 1.02] } },
    ], ev: [{ t: 0.5, k: 'steam', at: [-0.35, 2.3] }, { t: 1.5, k: 'steam', at: [-0.35, 2.3] }] },
    // PICOTAZO (blanco): alza el pico con un destello, lo baja de arriba
    atkW: { len: 1.9, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 3 / 12, e: 'out', p: { spine: [-0.3, 0.3, 0], head: [-0.2, -0.2, 0], armR: [-3.0, 0, -0.3], elbowR: [-0.7, 0, 0], handR: [0.6, 0, 0], armL: [-0.4, 0, 0.3], legL: [-0.4, 0, 0], kneeL: [0.4, 0, 0], legR: [0.3, 0, 0], pos: [0, 0, -0.1] } },
      { t: 9 / 12, e: 'hold', p: { armR: [-3.1, 0, -0.3] } },
      { t: 10 / 12, e: 'snap', p: { spine: [0.45, -0.1, 0], head: [0.2, 0, 0], armR: [-1.7, 0, -0.15], elbowR: [-0.1, 0, 0], handR: [0.3, 0, 0], legL: [-0.65, 0, 0], kneeL: [0.6, 0, 0], legR: [0.4, 0, 0], pos: [0, -0.1, 0.35], scl: [0.94, 0.95, 1.15] } },
      { t: 11 / 12, e: 'snap', p: { spine: [0.7, -0.15, 0], armR: [-0.9, 0, -0.1], elbowR: [-0.05, 0, 0], handR: [0.55, 0, 0], legL: [-0.75, 0, 0], kneeL: [0.9, 0, 0], legR: [0.45, 0, 0], kneeR: [0.5, 0, 0], pos: [0, -0.25, 0.5], scl: [1.08, 0.92, 1.08] } },
      { t: 15 / 12, e: 'hold', p: {} },
      { t: 22 / 12, e: 'io', p: { ...pick(base) } },
    ], smear: [{ t0: 10 / 12, t1: 11 / 12, kind: 'heavy', from: 110, to: -50, r: 1.5, w: 0.6, at: [0.4, 1.7] }],
    ev: [{ t: 3 / 12, k: 'tele', d: 0.5, at: [0.2, 3.1] }, { t: 10 / 12, k: 'whoosh', heavy: true }, { t: 11 / 12, k: 'heavy', at: [1.7, 0.3] }] },
    // EMBESTIDA DE ESCUDO (rojo): se cubre, toma carrera y embiste
    atkR: { len: 2.0, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 2 / 12, e: 'out', p: { spine: [0.35, 0.4, 0], head: [0.1, -0.3, 0], armL: [-1.3, 0, 0.4], elbowL: [-1.3, 0, 0], armR: [0.4, 0, -0.3], legL: [-0.5, 0, 0], kneeL: [0.8, 0, 0], legR: [0.5, 0, 0], kneeR: [0.6, 0, 0], pos: [0, -0.15, -0.3] } },
      { t: 9 / 12, e: 'hold', p: { pos: [0, -0.17, -0.35] } },
      { t: 10 / 12, e: 'snap', p: { spine: [0.45, 0.5, 0], armL: [-1.45, 0, 0.3], elbowL: [-1.1, 0, 0], legL: [-0.9, 0, 0], kneeL: [0.4, 0, 0], legR: [0.7, 0, 0], kneeR: [0.3, 0, 0], footR: [0.4, 0, 0], pos: [0, -0.1, 1.3], scl: [0.94, 0.96, 1.15] } },
      { t: 12 / 12, e: 'lin', p: { legL: [0.5, 0, 0], kneeL: [0.6, 0, 0], legR: [-0.8, 0, 0], kneeR: [0.4, 0, 0], pos: [0, -0.1, 2.4] } },
      { t: 14 / 12, e: 'out', p: { legL: [-0.6, 0, 0], kneeL: [0.7, 0, 0], legR: [0.5, 0, 0], kneeR: [0.4, 0, 0], pos: [0, -0.15, 2.9], scl: [1.06, 0.94, 1.06] } },
      { t: 18 / 12, e: 'hold', p: {} },
      { t: 24 / 12, e: 'io', p: { ...pick(base) } },
    ], smear: [{ t0: 10 / 12, t1: 12 / 12, kind: 'thrust', from: 180, to: 180, r: 0.6, w: 0.7, at: [0.5, 1.3] }],
    ev: [{ t: 0.01, k: 'aura', on: 1 }, { t: 10 / 12, k: 'whoosh', heavy: true }, { t: 13 / 12, k: 'heavy', at: [3.4, 1.0] }, { t: 18 / 12, k: 'aura', on: 0 }] },
    hit: { len: 0.9, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 1 / 12, e: 'snap', p: { spine: [-0.3, 0.25, 0.12], head: [-0.4, 0.3, 0.2], armR: [-0.1, 0, -0.7], armL: [-0.3, 0, 0.6], legR: [0.4, 0, 0], kneeR: [0.5, 0, 0], pos: [0, 0, -0.3], scl: [0.95, 1.05, 0.95] } },
      { t: 4 / 12, e: 'hold', p: {} },
      { t: 7 / 12, e: 'out', p: { spine: [0.25, 0, 0], head: [0.1, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.7, 0, 0], legR: [0.3, 0, 0], kneeR: [0.7, 0, 0], pos: [0, 0, -0.4], scl: [1.05, 0.95, 1.05] } },
      { t: 10 / 12, e: 'io', p: { ...pick(base) } },
    ], ev: [{ t: 0.5 / 12, k: 'hurt', at: [0.2, 1.6] }] },
  };
  return { rig: R, base, clips, dangles: [], height: 2.3, feet: ['footL', 'footR'], footY: 0.1, glow: {} };
}
function pick(p: Pose): Pose { const o: Pose = {}; for (const k in p) o[k] = p[k].slice(); return o; }
