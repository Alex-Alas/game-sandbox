// EL ESTIBADOR («Ancla»): el péndulo. Martillo-ancla; pogo y garfio.
// Brief: enorme, una «T» pesada: la masa en los hombros. La identidad arriba: escafandra de latón de buzo con la
// ventanilla redonda (lo único que brilla, en el color de la escuela) y los pernos del cuello; el brazo derecho es
// una grúa (latón y pistones de hierro, pinza de tres dedos) que carga el ancla al hombro, con la cadena colgando.
// Traje de lona, cinturón de cuero y botas de buzo con puntera de latón. Formas: esferas y tornos remachados (latón)
// contra el ancla y la pinza de hierro con caras planas. Referencia: la escafandra del set de íconos (8).
// Mira hacia +z; el brazo-grúa (−x) queda del lado de la cámara cuando corre a la derecha.
import * as THREE from 'three';
import { Rig, Dangle, type ModelDef, type Clip, type Pose } from '../anim.ts';
import { toon, glowMat, setEmit, type Toon } from '../toon.ts';
import { EMIT } from '../palette.ts';
import { mesh, sphere, cyl, box, torus, lathe, limb, extrude, solid, flat, rivetsArc, tube } from './kit.ts';
import { Chain } from './chain.ts';

export function estibador(): ModelDef {
  const m = {
    canvas: toon('canvas'), canvasD: toon({ base: '#584a44', S: '#3a3036', D: '#262531', R: '#7f8ea6', H: '#7a6a52' }),
    brass: toon('brass', { metal: 1, rough: 0.3 }), copper: toon('copper', { metal: 0.8, rough: 0.35 }),
    iron: toon('iron', { metal: 0.7, rough: 0.5 }), leather: toon('leather'), glass: toon('glass', { metal: 1 }),
    face: toon('shadow'),
  };
  const glow = glowMat(EMIT.arcanita[1], 1, 1.9);
  const R = new Rig();
  const J = R.joints;

  const hips = R.joint('hips', R.body, 0, 0.84, 0);
  mesh(sphere(0.25, 12, 8), m.canvas, hips, 0, 0, 0, 0, 0, 0, 1, 0.75, 0.85);
  mesh(cyl(0.27, 0.27, 0.1, 14), m.leather, hips, 0, 0.1, 0, 0, 0, 0, 1, 1, 0.9);           // cinturón
  mesh(box(0.1, 0.09, 0.04), m.brass, hips, 0, 0.1, 0.245);                                   // hebilla
  mesh(torus(0.05, 0.014, 4, 10), m.iron, hips, 0.2, 0.06, 0.16, 0, 0.6, 0);                // el gancho de la cadena
  for (const s of [1, -1]) {
    const n = s > 0 ? 'L' : 'R';
    const leg = R.joint('leg' + n, hips, s * 0.14, -0.05, 0);
    limb(leg, m.canvas, 0.38, 0.13, 0.11);
    const knee = R.joint('knee' + n, leg, 0, -0.38, 0);
    mesh(sphere(0.105, 8, 6), m.canvasD, knee, 0, 0, 0.02);
    limb(knee, m.canvas, 0.3, 0.11, 0.1);
    mesh(cyl(0.12, 0.13, 0.16, 10), m.leather, knee, 0, -0.26, 0);                          // caña de la bota
    const foot = R.joint('foot' + n, knee, 0, -0.33, 0);
    mesh(flat(box(0.2, 0.13, 0.32)), m.leather, foot, 0, -0.06, 0.05);
    mesh(sphere(0.11, 8, 6, ), m.brass, foot, 0, -0.06, 0.18, 0, 0, 0, 1, 0.75, 0.8);         // puntera de latón
    mesh(flat(box(0.22, 0.04, 0.34)), m.iron, foot, 0, -0.12, 0.05);                          // suela de plomo
  }
  const spine = R.joint('spine', hips, 0, 0.1, 0);
  mesh(lathe([[0.24, 0], [0.3, 0.12], [0.36, 0.34], [0.35, 0.5], [0.26, 0.6], [0.16, 0.64]], 14), m.canvas, spine, 0, 0, 0, 0, 0, 0, 1, 1, 0.85);
  // peto de latón remachado
  mesh(lathe([[0.0, 0], [0.2, 0.02], [0.22, 0.05], [0.0, 0.06]], 12), m.brass, spine, 0, 0.36, 0.27, Math.PI / 2 - 0.2, 0, 0, 1, 1, 1);
  rivetsArc(spine, m.iron, 9, 0.19, 0, Math.PI * 2 * 8 / 9, 0.016, 0.36, 0.3, 'xy');
  // tanques de aire en la espalda
  for (const s of [1, -1]) {
    mesh(cyl(0.11, 0.11, 0.5, 10), m.copper, spine, s * 0.13, 0.36, -0.3);
    mesh(sphere(0.11, 8, 6), m.copper, spine, s * 0.13, 0.61, -0.3, 0, 0, 0, 1, 0.6, 1);
    mesh(torus(0.11, 0.015, 4, 10), m.brass, spine, s * 0.13, 0.25, -0.3, Math.PI / 2, 0, 0);
  }
  // collar (corselete) con pernos
  const neck = R.joint('neck', spine, 0, 0.6, 0);
  mesh(cyl(0.3, 0.34, 0.08, 16), m.brass, neck, 0, 0, 0);
  rivetsArc(neck, m.iron, 12, 0.31, 0, Math.PI * 2 * 11 / 12, 0.02, 0.04, 0);
  // escafandra
  const head = R.joint('head', neck, 0, 0.22, 0);
  mesh(sphere(0.25, 16, 12), m.brass, head, 0, 0.02, 0);
  mesh(cyl(0.05, 0.06, 0.08, 8), m.brass, head, 0, 0.27, 0);                                // válvula de arriba
  mesh(torus(0.04, 0.012, 4, 8), m.iron, head, 0, 0.32, 0, Math.PI / 2, 0, 0);
  const port = new THREE.Group(); port.position.set(0, 0.02, 0.22); head.add(port);
  mesh(cyl(0.135, 0.15, 0.06, 16), m.copper, port, 0, 0, 0.01, Math.PI / 2, 0, 0);
  mesh(cyl(0.11, 0.11, 0.07, 16), glow, port, 0, 0, 0.012, Math.PI / 2, 0, 0);
  mesh(box(0.012, 0.22, 0.02), m.iron, port, 0, 0, 0.05);                                      // reja
  mesh(box(0.22, 0.012, 0.02), m.iron, port, 0, 0, 0.05);
  rivetsArc(port, m.iron, 8, 0.145, 0, Math.PI * 2 * 7 / 8, 0.014, 0, 0.04, 'xy');
  for (const s of [1, -1]) {
    mesh(cyl(0.07, 0.075, 0.05, 10), m.copper, head, s * 0.22, 0.04, 0.05, 0, 0, Math.PI / 2);
    mesh(cyl(0.05, 0.05, 0.055, 10), m.glass, head, s * 0.22, 0.04, 0.05, 0, 0, Math.PI / 2);
  }
  // hombreras
  for (const s of [1, -1]) mesh(sphere(0.17, 10, 8), s > 0 ? m.canvasD : m.brass, spine, s * 0.34, 0.54, 0, 0, 0, s * 0.4, 1, 0.75, 1);

  // brazo izquierdo (de carne): lona y guante
  const armL = R.joint('armL', spine, 0.38, 0.52, 0);
  limb(armL, m.canvas, 0.34, 0.1, 0.09);
  const elL = R.joint('elbowL', armL, 0, -0.34, 0);
  limb(elL, m.canvas, 0.3, 0.09, 0.085);
  mesh(cyl(0.1, 0.11, 0.1, 8), m.leather, elL, 0, -0.26, 0);
  const handL = R.joint('handL', elL, 0, -0.32, 0);
  mesh(sphere(0.085, 8, 6), m.leather, handL, 0, -0.03, 0.01, 0, 0, 0, 1, 1.1, 1);
  // brazo derecho: la grúa
  const armR = R.joint('armR', spine, -0.4, 0.52, 0);
  mesh(cyl(0.13, 0.13, 0.16, 12), m.brass, armR, 0, 0, 0, 0, 0, Math.PI / 2);                 // el eje del hombro
  rivetsArc(armR, m.iron, 6, 0.13, 0, Math.PI * 2 * 5 / 6, 0.016, 0, -0.085, 'xy');
  mesh(flat(box(0.13, 0.36, 0.13)), m.iron, armR, 0, -0.2, 0);
  for (const s of [1, -1]) mesh(cyl(0.025, 0.025, 0.3, 6), m.brass, armR, s * 0.085, -0.2, 0.05);    // pistones
  const elR = R.joint('elbowR', armR, 0, -0.38, 0);
  mesh(sphere(0.09, 8, 6), m.brass, elR, 0, 0, 0);
  mesh(flat(cyl(0.085, 0.11, 0.3, 6)), m.iron, elR, 0, -0.17, 0);
  mesh(cyl(0.12, 0.12, 0.06, 10), m.brass, elR, 0, -0.3, 0);
  const handR = R.joint('handR', elR, 0, -0.34, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.9;
    const f = new THREE.Group(); f.rotation.set(0, a, 0); handR.add(f);
    mesh(flat(extrude([[-0.025, 0.04], [0.025, 0.04], [0.035, -0.06], [0.005, -0.12], [-0.02, -0.06]], 0.035)), m.iron, f, 0, 0, 0.06);
  }
  // el martillo-ancla: la caña sale de la pinza hacia +z
  const anchor = new THREE.Group(); handR.add(anchor);
  const anc = new THREE.Group(); anchor.add(anc);
  mesh(cyl(0.045, 0.05, 1.05, 8), m.iron, anc, 0, 0, 0.35, Math.PI / 2, 0, 0);
  mesh(torus(0.085, 0.022, 5, 10), m.iron, anc, 0, 0, -0.24, 0, Math.PI / 2, 0);               // argolla
  mesh(flat(box(0.34, 0.05, 0.05)), m.iron, anc, 0, 0, -0.08);                                  // cepo
  const crown = new THREE.Group(); crown.position.set(0, 0, 0.88); anc.add(crown);
  mesh(flat(box(0.2, 0.2, 0.22)), m.brass, crown, 0, 0, 0.04);                                 // cabeza de martillo
  mesh(flat(box(0.23, 0.23, 0.05)), m.iron, crown, 0, 0, 0.165);                                // la cara que pega
  mesh(flat(box(0.23, 0.23, 0.04)), m.iron, crown, 0, 0, -0.08);
  // los brazos: un arco en el plano y–z (perpendicular al cepo) que nace en la corona y se curva hacia la argolla,
  // con una uña en cada punta (antes era un toroide girado que se leía como un garabato)
  const AR = 0.34, AA = 72 * Math.PI / 180, arm: number[][] = [];
  for (let i = 0; i <= 12; i++) { const a = -AA + (2 * AA * i) / 12; arm.push([0, AR * Math.sin(a), -AR + AR * Math.cos(a) - 0.06]); }
  mesh(tube(arm, 0.036, 24, 6), m.iron, crown);
  for (const sy of [1, -1]) {
    const tipY = sy * AR * Math.sin(AA), tipZ = -AR + AR * Math.cos(AA) - 0.06;
    const f = mesh(flat(extrude([[0, -0.02], [0.17, 0.03], [0.15, 0.12], [0.02, 0.07]], 0.03)), m.iron, crown, 0, tipY, tipZ, 0, Math.PI / 2, 0);
    f.scale.set(1, sy, 1);
  }
  solid(R.root);

  // la cadena: de la argolla al gancho del cinturón (o a la pinza, al lanzar)
  const chainG = new THREE.Group(); R.root.add(chainG);
  const chain = new Chain(chainG, m.brass, 13, 1.25, 0.034);
  solid(chainG);
  const ring = new THREE.Object3D(); ring.position.set(0, 0, -0.24); anc.add(ring);
  const hook = new THREE.Object3D(); hook.position.set(0.2, 0.06, 0.16); hips.add(hook);

  const base: Pose = {
    hips: [0, 0, 0], spine: [0.1, 0.12, 0], neck: [0, 0, 0], head: [-0.1, -0.1, 0],
    armR: [-2.5, 0, -0.35], elbowR: [-1.0, 0, 0], handR: [1.25, 0, 0],
    armL: [-0.1, 0, 0.35], elbowL: [-0.5, 0, 0], handL: [0, 0, 0],
    legR: [-0.25, 0, -0.1], kneeR: [0.3, 0, 0], footR: [0, 0, 0],
    legL: [0.25, 0, 0.1], kneeL: [0.3, 0, 0], footL: [-0.2, 0, 0],
    pos: [0, 0, 0], scl: [1, 1, 1], anc: [0],
  };
  const clips: Record<string, Clip> = {
    idle: { len: 2, loop: true, keys: [
      { t: 0, p: {} },
      { t: 1, p: { spine: [0.16, 0.12, 0], head: [-0.04, -0.1, 0], armL: [-0.05, 0, 0.42], scl: [1.02, 0.98, 1.02] } },
    ], ev: [{ t: 1.0, k: 'steam', at: [-0.45, 1.75] }] },
    run: { len: 8 / 12, loop: true, vel: [0, 0, 7], keys: [
      { t: 0, p: { spine: [0.35, 0.1, 0], head: [-0.25, 0, 0], armL: [-0.7, 0, 0.35], elbowL: [-1.1, 0, 0], legR: [-0.8, 0, 0], kneeR: [0.2, 0, 0], legL: [0.5, 0, 0], kneeL: [0.8, 0, 0], footL: [0.3, 0, 0] } },
      { t: 1 / 12, p: { legR: [-0.45, 0, 0], kneeR: [0.5, 0, 0], legL: [0.2, 0, 0], kneeL: [1.3, 0, 0], scl: [1.05, 0.95, 1.05] } },
      { t: 2 / 12, p: { legR: [0, 0, 0], kneeR: [0.3, 0, 0], legL: [-0.5, 0, 0], kneeL: [1.5, 0, 0], armL: [-0.2, 0, 0.35], scl: [1, 1, 1] } },
      { t: 3 / 12, p: { legR: [0.4, 0, 0], kneeR: [0.5, 0, 0], legL: [-0.85, 0, 0], kneeL: [0.8, 0, 0], armL: [0.3, 0, 0.35] } },
      { t: 4 / 12, p: { legR: [0.5, 0, 0], kneeR: [0.8, 0, 0], footR: [0.3, 0, 0], legL: [-0.8, 0, 0], kneeL: [0.2, 0, 0], footL: [0, 0, 0], armL: [0.5, 0, 0.35], elbowL: [-0.8, 0, 0] } },
      { t: 5 / 12, p: { legR: [0.2, 0, 0], kneeR: [1.3, 0, 0], legL: [-0.45, 0, 0], kneeL: [0.5, 0, 0], scl: [1.05, 0.95, 1.05] } },
      { t: 6 / 12, p: { legR: [-0.5, 0, 0], kneeR: [1.5, 0, 0], legL: [0, 0, 0], kneeL: [0.3, 0, 0], armL: [0.1, 0, 0.35], scl: [1, 1, 1] } },
      { t: 7 / 12, p: { legR: [-0.85, 0, 0], kneeR: [0.8, 0, 0], legL: [0.4, 0, 0], kneeL: [0.5, 0, 0], armL: [-0.4, 0, 0.35] } },
    ], ev: [{ t: 0, k: 'step' }, { t: 4 / 12, k: 'step' }] },
    jump: { len: 1.4, next: 'idle', plant: false, keys: [
      { t: 0, p: {} },
      { t: 3 / 12, e: 'out', p: { spine: [0.4, 0.12, 0], legR: [-0.9, 0, 0], kneeR: [1.4, 0, 0], legL: [-0.4, 0, 0], kneeL: [1.4, 0, 0], footL: [-0.4, 0, 0], armL: [0.5, 0, 0.6], pos: [0, -0.28, 0], scl: [1.14, 0.84, 1.14] } },
      { t: 4 / 12, e: 'snap', p: { spine: [-0.05, 0.1, 0], legR: [0.1, 0, 0], kneeR: [0.1, 0, 0], legL: [0.25, 0, 0], kneeL: [0.25, 0, 0], footL: [0.4, 0, 0], footR: [0.4, 0, 0], armL: [-2.2, 0, 0.5], pos: [0, 0.9, 0], scl: [0.9, 1.14, 0.9] } },
      { t: 7 / 12, e: 'out', p: { spine: [0.2, 0.1, 0], legR: [-1.2, 0, 0], kneeR: [1.8, 0, 0], legL: [-0.8, 0, 0], kneeL: [1.9, 0, 0], armL: [-0.8, 0, 0.9], pos: [0, 1.7, 0], scl: [1, 1, 1] } },
      { t: 10 / 12, e: 'io', p: { legR: [-0.4, 0, 0], kneeR: [0.4, 0, 0], legL: [0, 0, 0], kneeL: [0.5, 0, 0], armL: [-1.4, 0, 1.0], pos: [0, 1.0, 0] } },
      { t: 12 / 12, e: 'in', p: { legR: [-0.2, 0, 0], kneeR: [0.2, 0, 0], legL: [0.1, 0, 0], kneeL: [0.3, 0, 0], pos: [0, 0.03, 0], scl: [0.94, 1.08, 0.94] } },
      { t: 13 / 12, e: 'snap', p: { spine: [0.5, 0.12, 0], legR: [-0.9, 0, 0], kneeR: [1.5, 0, 0], legL: [-0.2, 0, 0], kneeL: [1.6, 0, 0], footL: [-0.3, 0, 0], armL: [0.3, 0, 1.1], pos: [0, -0.32, 0], scl: [1.2, 0.8, 1.2] } },
      { t: 16 / 12, e: 'io', p: { ...pick(base) } },
    ], ev: [{ t: 3.5 / 12, k: 'jump' }, { t: 13 / 12, k: 'land' }] },
    // MARTILLAZO: carga lenta (4), smear pesado (1), contacto sostenido con la onda (4), recobro (5)
    hammer: { len: 1.5, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 2 / 12, e: 'out', p: { spine: [0.35, 0.2, 0], armR: [-2.2, 0, -0.3], elbowR: [-1.4, 0, 0], handR: [1.6, 0, 0], legR: [-0.5, 0, 0], kneeR: [0.9, 0, 0], legL: [0.3, 0, 0], kneeL: [0.9, 0, 0], scl: [1.08, 0.9, 1.08] } },
      { t: 4 / 12, e: 'out', p: { spine: [-0.6, 0.55, 0], head: [-0.1, -0.35, 0], armR: [-3.1, 0, -0.2], elbowR: [-0.4, 0, 0], handR: [2.0, 0, 0], armL: [-2.7, 0, 0.1], elbowL: [-0.5, 0, 0],
        legR: [-0.55, 0, 0], kneeR: [0.4, 0, 0], legL: [0.5, 0, 0], kneeL: [0.3, 0, 0], pos: [0, 0.05, -0.3], scl: [0.92, 1.1, 0.92] } },
      { t: 5 / 12, e: 'snap', p: { spine: [0.55, -0.1, 0], head: [-0.4, 0.1, 0], armR: [-1.6, 0, -0.1], elbowR: [-0.1, 0, 0], handR: [0.2, 0, 0], armL: [-1.4, 0, 0.0], elbowL: [-0.2, 0, 0],
        legR: [-0.8, 0, 0], kneeR: [0.7, 0, 0], legL: [0.5, 0, 0], kneeL: [0.3, 0, 0], pos: [0, -0.1, 0.5], scl: [0.92, 0.95, 1.2] } },
      { t: 6 / 12, e: 'snap', p: { spine: [0.75, -0.15, 0], head: [-0.6, 0.15, 0], armR: [-0.95, 0, -0.1], elbowR: [-0.05, 0, 0], handR: [0.7, 0, 0], armL: [-0.75, 0, 0.0], elbowL: [-0.2, 0, 0],
        legR: [-1.0, 0, 0], kneeR: [1.1, 0, 0], legL: [0.55, 0, 0], kneeL: [0.6, 0, 0], pos: [0, -0.35, 0.75], scl: [1.12, 0.88, 1.12] } },
      { t: 10 / 12, e: 'hold', p: {} },
      { t: 13 / 12, e: 'io', p: { spine: [0.4, 0.1, 0], armR: [-1.8, 0, -0.3], elbowR: [-0.8, 0, 0], handR: [0.6, 0, 0], pos: [0, -0.1, 0.5], scl: [1, 1, 1] } },
      { t: 18 / 12, e: 'io', p: { ...pick(base) } },
    ], smear: [{ t0: 5 / 12, t1: 6 / 12, kind: 'heavy', from: 115, to: -60, r: 1.55, w: 0.75, at: [0.55, 1.05] }],
    ev: [{ t: 5 / 12, k: 'whoosh' }, { t: 6 / 12, k: 'heavy', at: [1.9, 0.25] }] },
    // ANCLA (sostenida): echa el ancla al punto, la sostiene tensa y la recoge
    anchor: { len: 2.2, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 3 / 12, e: 'out', p: { spine: [-0.15, 0.6, 0], armR: [-2.0, 0, -0.9], elbowR: [-1.4, 0, 0], handR: [1.2, 0, 0], armL: [-0.9, 0, 0.5], elbowL: [-1.0, 0, 0], legR: [-0.4, 0, 0], kneeR: [0.4, 0, 0], legL: [0.4, 0, 0], kneeL: [0.5, 0, 0], pos: [0, 0, -0.1] } },
      { t: 4 / 12, e: 'snap', p: { spine: [0.35, -0.3, 0], armR: [-1.75, 0, -0.1], elbowR: [-0.05, 0, 0], handR: [1.45, 0, 0], armL: [0.6, 0, 0.6], elbowL: [-0.4, 0, 0], legR: [-0.7, 0, 0], kneeR: [0.5, 0, 0], legL: [0.6, 0, 0], kneeL: [0.4, 0, 0], pos: [0, 0, 0.3], anc: [2.0] } },
      { t: 6 / 12, e: 'out', p: { anc: [4.2] } },
      { t: 7 / 12, e: 'snap', p: { spine: [0.0, 0.2, 0], armR: [-1.5, 0, -0.2], elbowR: [-0.5, 0, 0], handR: [2.05, 0, 0], armL: [-0.9, 0, 0.3], elbowL: [-1.2, 0, 0], legR: [-0.55, 0, 0], kneeR: [0.6, 0, 0], legL: [0.55, 0, 0], kneeL: [0.6, 0, 0], pos: [0, 0, -0.1], anc: [4.0] } },
      { t: 16 / 12, e: 'hold', p: {} },
      { t: 18 / 12, e: 'in', p: { spine: [-0.25, 0.4, 0], armR: [-1.0, 0, -0.5], elbowR: [-1.6, 0, 0], handR: [2.6, 0, 0], pos: [0, 0, -0.3], anc: [1.0] } },
      { t: 19 / 12, e: 'snap', p: { anc: [0] } },
      { t: 26 / 12, e: 'io', p: { ...pick(base) } },
    ], ev: [{ t: 4 / 12, k: 'whoosh', heavy: true }, { t: 6 / 12, k: 'clank', at: [5.0, 1.2] }] },
    hit: { len: 1.0, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 1 / 12, e: 'snap', p: { spine: [-0.3, 0.3, 0.1], head: [-0.4, 0.2, 0.15], armL: [-0.3, 0, 1.0], legL: [0.4, 0, 0], kneeL: [0.5, 0, 0], pos: [0, 0, -0.25], scl: [0.95, 1.04, 0.95] } },
      { t: 4 / 12, e: 'hold', p: {} },
      { t: 7 / 12, e: 'out', p: { spine: [0.35, 0.2, 0], head: [-0.1, -0.1, 0], armL: [0.2, 0, 0.5], legR: [-0.5, 0, 0], kneeR: [0.9, 0, 0], legL: [0.3, 0, 0], kneeL: [1.0, 0, 0], pos: [0, 0, -0.35], scl: [1.06, 0.94, 1.06] } },
      { t: 11 / 12, e: 'io', p: { ...pick(base) } },
    ], ev: [{ t: 0.5 / 12, k: 'hurt', at: [0.1, 1.4] }] },
  };

  Object.assign(clips, gameClips(base));
  const V = new THREE.Vector3();
  return {
    rig: R, base, clips, dangles: [] as Dangle[], height: 2.15, feet: ['footL', 'footR'], footY: 0.14,
    parts: { anc, chain: chainG },
    glow: { setSchool: (c: string) => setEmit(glow as Toon, c, 1.9) },
    step(dt) {
      ring.getWorldPosition(chain.a);
      const out = (R.pose.anc?.[0] ?? 0) > 0.3;
      if (out) handR.getWorldPosition(chain.b); else hook.getWorldPosition(chain.b);
      chain.len = out ? 0.5 : 1.25;
      chain.step(dt);
    },
    frame() {
      anc.position.z = R.pose.anc?.[0] ?? 0;
      // lanzada, el ancla mira de frente (sale derecha por la caña) y su cadena se tensa
      chain.sample();
      void V;
    },
  };
}

// Clips del juego (F1): sin desplazamiento de la raíz (lo pone la sim). PICADA: la grúa abajo y el ancla bajo los pies
// (la cabeza de martillo es lo que pega: el pogo); COLUMPIO: colgado de la cadena (game inclina el cuerpo hacia la liga).
function gameClips(base: Pose): Record<string, Clip> {
  const B = pick(base);
  const RISE: Pose = { spine: [-0.05, 0.1, 0], legR: [0.1, 0, 0], kneeR: [0.1, 0, 0], legL: [0.25, 0, 0], kneeL: [0.25, 0, 0], footL: [0.4, 0, 0], footR: [0.4, 0, 0], armL: [-2.2, 0, 0.5] };
  const APEX: Pose = { spine: [0.2, 0.1, 0], legR: [-1.2, 0, 0], kneeR: [1.8, 0, 0], legL: [-0.8, 0, 0], kneeL: [1.9, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0], armL: [-0.8, 0, 0.9] };
  const FALL: Pose = { spine: [0.15, 0.1, 0], legR: [-0.4, 0, 0], kneeR: [0.4, 0, 0], legL: [0, 0, 0], kneeL: [0.5, 0, 0], armL: [-1.4, 0, 1.0] };
  const CROUCH: Pose = { spine: [0.5, 0.12, 0], legR: [-0.9, 0, 0], kneeR: [1.5, 0, 0], legL: [-0.2, 0, 0], kneeL: [1.6, 0, 0], footL: [-0.3, 0, 0], armL: [0.3, 0, 1.1], pos: [0, -0.3, 0] };
  const DIVE: Pose = { spine: [0.15, 0.1, 0], head: [-0.25, -0.1, 0], armR: [-0.3, 0, -0.2], elbowR: [-0.2, 0, 0], handR: [2.07, 0, 0], armL: [-1.7, 0, 0.9], elbowL: [-0.4, 0, 0],
    legR: [-1.0, 0, 0], kneeR: [1.7, 0, 0], legL: [-0.7, 0, 0], kneeL: [1.8, 0, 0], footR: [0.3, 0, 0], footL: [0.3, 0, 0] };
  const RAISE: Pose = { spine: [-0.6, 0.55, 0], head: [-0.1, -0.35, 0], armR: [-3.1, 0, -0.2], elbowR: [-0.4, 0, 0], handR: [2.0, 0, 0], armL: [-2.7, 0, 0.1], elbowL: [-0.5, 0, 0],
    legR: [-0.55, 0, 0], kneeR: [0.4, 0, 0], legL: [0.5, 0, 0], kneeL: [0.3, 0, 0], scl: [0.92, 1.1, 0.92] };
  const SMASH: Pose = { spine: [0.75, -0.15, 0], head: [-0.6, 0.15, 0], armR: [-0.95, 0, -0.1], elbowR: [-0.05, 0, 0], handR: [0.7, 0, 0], armL: [-0.75, 0, 0.0], elbowL: [-0.2, 0, 0],
    legR: [-1.0, 0, 0], kneeR: [1.1, 0, 0], legL: [0.55, 0, 0], kneeL: [0.6, 0, 0], pos: [0, -0.25, 0], scl: [1.12, 0.88, 1.12] };
  const HANG: Pose = { spine: [-0.1, 0.0, 0], head: [-0.3, 0, 0], armR: [-3.0, 0, -0.15], elbowR: [-0.15, 0, 0], handR: [1.25, 0, 0], armL: [-0.6, 0, 0.5], elbowL: [-0.8, 0, 0],
    legR: [-0.35, 0, 0], kneeR: [0.6, 0, 0], legL: [0.2, 0, 0], kneeL: [0.35, 0, 0], footR: [0.4, 0, 0], footL: [0.4, 0, 0] };
  return {
    g_rise: { len: 3 / 12, plant: false, keys: [{ t: 0, p: { ...RISE, scl: [0.88, 1.15, 0.88] } }, { t: 2 / 12, e: 'out', p: { ...RISE, scl: [1, 1, 1] } }] },
    g_fall: { len: 4 / 12, plant: false, keys: [{ t: 0, p: { ...APEX, scl: [1, 1, 1] } }, { t: 3 / 12, e: 'io', p: FALL }] },
    g_land: { len: 4 / 12, next: 'idle', keys: [{ t: 0, p: { ...CROUCH, scl: [1.2, 0.8, 1.2] } }, { t: 3 / 12, e: 'io', p: { ...B } }] },
    g_slam: { len: 8 / 12, next: 'idle', keys: [{ t: 0, p: { ...CROUCH, ...DIVE, legR: [-0.9, 0, 0], kneeR: [1.5, 0, 0], legL: [-0.2, 0, 0], kneeL: [1.6, 0, 0], pos: [0, -0.35, 0], scl: [1.25, 0.78, 1.25] } },
      { t: 3 / 12, e: 'hold', p: {} }, { t: 8 / 12, e: 'io', p: { ...B } }] },
    g_dive: { len: 2 / 12, plant: false, keys: [{ t: 0, p: { ...DIVE, scl: [0.9, 1.15, 0.9] } }, { t: 1 / 12, e: 'snap', p: { ...DIVE, scl: [1, 1, 1] } }] },
    g_hammer: { len: 6 / 12, plant: false, keys: [
      { t: 0, p: {} },
      { t: 1 / 12, e: 'out', p: RAISE },
      { t: 2 / 12, e: 'snap', p: SMASH },
      { t: 3 / 12, e: 'hold', p: {} },
      { t: 6 / 12, e: 'io', p: { ...B, spine: [0.3, 0.12, 0] } },
    ] },
    g_swing: { len: 1.4, loop: true, plant: false, keys: [{ t: 0, p: HANG }, { t: 0.7, p: { legR: [-0.15, 0, 0], kneeR: [0.4, 0, 0], legL: [0.0, 0, 0], kneeL: [0.5, 0, 0] } }] },
    g_hit: { len: 8 / 12, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 1 / 12, e: 'snap', p: { spine: [-0.3, 0.3, 0.1], head: [-0.4, 0.2, 0.15], armL: [-0.3, 0, 1.0], legL: [0.4, 0, 0], kneeL: [0.5, 0, 0], pos: [0, 0, 0], scl: [0.95, 1.04, 0.95] } },
      { t: 3 / 12, e: 'hold', p: {} },
      { t: 8 / 12, e: 'io', p: { ...B } },
    ] },
  };
}

function pick(p: Pose): Pose { const o: Pose = {}; for (const k in p) o[k] = p[k].slice(); return o; }
