// EL ESGRIMISTA («Don Válvula»): el duelista. Sable de pistón; dash-corte y guardia/parry.
// Brief: alto y flaco, una «I» con bandera. La identidad arriba: chistera alta con un manómetro en la cinta y gafas
// sobre el ala; la cara queda en la sombra del ala (nunca se ve) y solo brilla el monóculo, en el color de la escuela.
// Levita de paño gris verdoso con faldones largos desflecados que cuelgan con retraso; botas altas de cuero.
// Latón redondeado (cinta, manómetro, guardamano, pistón) contra el acero fino de la hoja. Referencia: el alquimista
// de chistera de EV Ganin (17) y las capas desflecadas de la 9.
// Mira hacia +z; su mano derecha (la del sable) queda en −x, del lado de la cámara cuando corre a la derecha.
import * as THREE from 'three';
import { Rig, Dangle, type ModelDef, type Clip, type Pose } from '../anim.ts';
import { toon, glowMat, setEmit, type Toon } from '../toon.ts';
import { EMIT } from '../palette.ts';
import { mesh, sphere, cyl, box, torus, lathe, frayed, limb, extrude, solid, flat } from './kit.ts';

const D = Math.PI / 180;

export function esgrimista(): ModelDef {
  const m = {
    coat: toon('coat'), coatS: toon('coat', { side: THREE.DoubleSide }), coatD: toon({ base: '#2c3036', S: '#1e1f28', D: '#1b1420', R: '#6f8aa0', H: '#3e4a44' }),
    hat: toon('coal', { metal: 0.6, rough: 0.2 }), face: toon('shadow'),
    brass: toon('brass', { metal: 1, rough: 0.3 }), leather: toon('leather'), boots: toon('leather', { metal: 0.4, rough: 0.4 }),
    parch: toon('parch'), steel: toon('steel', { metal: 1.2, rough: 0.1 }), glass: toon('glass', { metal: 1 }),
    pants: toon({ base: '#3d354c', S: '#262531', D: '#1b1420', R: '#6f7894', H: '#4a4358' }),
  };
  const glow = glowMat(EMIT.arcanita[1], 1, 1.9);
  const R = new Rig();
  const J = R.joints;

  // cadera y piernas
  const hips = R.joint('hips', R.body, 0, 0.95, 0);
  mesh(sphere(0.15, 12, 8), m.pants, hips, 0, -0.02, 0, 0, 0, 0, 1, 0.7, 0.8);
  for (const s of [1, -1]) {
    const n = s > 0 ? 'L' : 'R';
    const leg = R.joint('leg' + n, hips, s * 0.085, -0.04, 0);
    limb(leg, m.pants, 0.46, 0.075, 0.055);
    const knee = R.joint('knee' + n, leg, 0, -0.46, 0);
    limb(knee, m.boots, 0.42, 0.062, 0.05);
    mesh(cyl(0.072, 0.066, 0.09, 8), m.boots, knee, 0, -0.03, 0.005);            // caña de la bota
    mesh(torus(0.064, 0.012, 4, 10), m.brass, knee, 0, -0.1, 0, Math.PI / 2);      // hebilla
    const foot = R.joint('foot' + n, knee, 0, -0.42, 0);
    mesh(flat(extrude([[-0.05, 0], [0.05, 0], [0.05, -0.03], [0.04, -0.07], [-0.045, -0.07], [-0.05, -0.04]], 0.075)), m.boots, foot, 0, 0, 0.03, 0, -Math.PI / 2, 0);
    mesh(box(0.08, 0.06, 0.2), m.boots, foot, 0, -0.04, 0.05);
    mesh(box(0.084, 0.02, 0.06), m.brass, foot, 0, -0.065, 0.13);                   // puntera de latón
  }

  // la falda de la levita: un torno abierto por delante que sigue al torso y une los faldones al cuerpo (sin ella los
  // faldones colgaban como paneles sueltos detrás de las piernas)
  const skirtG = new THREE.LatheGeometry([[0.152, 0.1], [0.165, 0.0], [0.185, -0.12], [0.2, -0.21]].map(([x, y]) => new THREE.Vector2(x, y)), 14, Math.PI * 0.32, Math.PI * 1.36);
  mesh(skirtG, m.coatS, hips, 0, 0, 0, 0, 0, 0, 1, 1, 0.74);
  // faldones (cuelgan del ruedo de la falda, por detrás, con física)
  for (const s of [1, -1]) {
    const tail = R.joint('tail' + (s > 0 ? 'L' : 'R'), hips, s * 0.07, -0.19, -0.115);
    tail.rotation.set(0.04, 0, s * 0.05);
    mesh(frayed(0.21, 0.56, 0.03, 4, 0.06, s > 0 ? 3 : 7), m.coat, tail, 0, 0.02, 0);
  }
  // falda delantera abierta (cortita)
  for (const s of [1, -1]) mesh(frayed(0.13, 0.3, 0.025, 2, 0.03, s > 0 ? 11 : 13), m.coat, hips, s * 0.11, 0.08, 0.06, -0.12, s * 0.5, 0);

  // torso
  const spine = R.joint('spine', hips, 0, 0.02, 0);
  const torso = mesh(lathe([[0.135, 0], [0.15, 0.1], [0.17, 0.3], [0.18, 0.4], [0.15, 0.47], [0.07, 0.52]], 12), m.coat, spine, 0, 0, 0, 0, 0, 0, 1, 1, 0.72);
  void torso;
  // chaleco de latón (botones) y corbatín
  mesh(box(0.13, 0.3, 0.04), m.pants, spine, 0, 0.27, 0.105);
  for (let i = 0; i < 3; i++) mesh(sphere(0.014, 5, 4), m.brass, spine, 0, 0.17 + i * 0.07, 0.13);
  mesh(lathe([[0.0, 0], [0.05, 0.02], [0.03, 0.08], [0.0, 0.1]], 6), m.parch, spine, 0, 0.36, 0.105, 0.25, 0, 0, 1, 1, 0.5);
  // solapas
  for (const s of [1, -1]) mesh(extrude([[0, 0], [s * 0.07, -0.02], [s * 0.035, -0.22]], 0.02), m.coatD, spine, s * 0.035, 0.46, 0.12, -0.06, 0, 0);
  // charreteras de latón
  for (const s of [1, -1]) mesh(sphere(0.06, 8, 6), m.brass, spine, s * 0.19, 0.44, 0, 0, 0, 0, 1.2, 0.5, 1);

  // brazos
  for (const s of [1, -1]) {
    const n = s > 0 ? 'L' : 'R';
    const sh = R.joint('arm' + n, spine, s * 0.2, 0.43, 0);
    limb(sh, m.coat, 0.29, 0.06, 0.05);
    const el = R.joint('elbow' + n, sh, 0, -0.29, 0);
    limb(el, m.coat, 0.25, 0.05, 0.042);
    mesh(cyl(0.058, 0.052, 0.07, 8), m.coatD, el, 0, -0.2, 0);                     // puño de la manga
    const hand = R.joint('hand' + n, el, 0, -0.26, 0);
    mesh(sphere(0.045, 8, 6), m.leather, hand, 0, -0.03, 0.01, 0, 0, 0, 0.9, 1.1, 1);
  }

  // cabeza: la sombra bajo el ala y el monóculo
  const neck = R.joint('neck', spine, 0, 0.52, 0);
  mesh(cyl(0.05, 0.06, 0.08, 8), m.parch, neck, 0, 0.0, 0);                       // cuello alto de la camisa
  const head = R.joint('head', neck, 0, 0.1, 0);
  mesh(sphere(0.1, 12, 10), m.face, head, 0, 0, 0.005, 0, 0, 0, 0.95, 1.08, 1);
  mesh(sphere(0.06, 8, 6), m.face, head, 0, -0.07, 0.04, 0, 0, 0, 0.9, 0.7, 0.9);   // mentón
  const mono = mesh(cyl(0.034, 0.034, 0.012, 10), glow, head, -0.038, 0.012, 0.094, Math.PI / 2, 0, 0);
  mesh(torus(0.036, 0.008, 4, 12), m.brass, head, -0.038, 0.012, 0.098);
  mesh(cyl(0.003, 0.003, 0.14, 3), m.brass, head, -0.06, -0.06, 0.09, 0, 0, 0.3);   // cadenita
  void mono;
  // chistera, inclinada hacia adelante (tapa la cara)
  const hat = new THREE.Group();
  hat.position.set(0, 0.075, -0.005);
  hat.rotation.set(0.14, 0, 0.05);
  head.add(hat);
  mesh(cyl(0.175, 0.175, 0.018, 18), m.hat, hat, 0, 0, 0, 0, 0, 0, 1, 1, 0.92);
  mesh(lathe([[0.108, 0], [0.104, 0.12], [0.11, 0.26], [0.122, 0.33], [0.0, 0.33]], 16), m.hat, hat, 0, 0.005, 0);
  mesh(cyl(0.112, 0.108, 0.05, 16), m.leather, hat, 0, 0.035, 0);                  // cinta
  const gauge = new THREE.Group(); gauge.position.set(0.045, 0.06, 0.1); gauge.rotation.set(0, 0.35, 0); hat.add(gauge);
  mesh(cyl(0.042, 0.042, 0.022, 12), m.brass, gauge, 0, 0, 0, Math.PI / 2, 0, 0);
  mesh(cyl(0.032, 0.032, 0.024, 12), m.parch, gauge, 0, 0, 0.002, Math.PI / 2, 0, 0);
  mesh(box(0.004, 0.028, 0.004), m.face, gauge, 0.006, 0.006, 0.016, 0, 0, -0.7);   // aguja
  // gafas sobre el ala (subidas, contra la copa)
  for (const s of [1, -1]) {
    mesh(cyl(0.032, 0.036, 0.04, 10), m.brass, hat, s * 0.045 - 0.03, 0.135, 0.095, Math.PI / 2 - 0.25, 0, 0);
    mesh(cyl(0.026, 0.026, 0.044, 10), m.glass, hat, s * 0.045 - 0.03, 0.135, 0.097, Math.PI / 2 - 0.25, 0, 0);
  }
  mesh(torus(0.115, 0.01, 4, 18), m.leather, hat, 0, 0.13, 0, Math.PI / 2 - 0.25, 0, 0, 1, 1, 1);

  // el sable de pistón (en la mano derecha): hoja curva hacia +z, guardamano de latón y el pistón
  const saber = new THREE.Group();
  saber.position.set(0, -0.045, 0.01);
  J.handR.add(saber);
  const blade: number[][] = [];
  const L = 0.82;
  for (let i = 0; i <= 10; i++) { const u = i / 10, z = u * L, y = 0.06 * u * u; blade.push([z, y + 0.014 * (1 - u * 0.85)]); }
  for (let i = 10; i >= 0; i--) { const u = i / 10, z = u * L, y = 0.06 * u * u; blade.push([z + (i === 10 ? 0.02 : 0), y - 0.012 * (1 - u)]); }
  const bl = mesh(extrude(blade, 0.008), m.steel, saber, 0, 0, 0.09, 0, -Math.PI / 2, 0);
  bl.rotation.set(0, -Math.PI / 2, 0);
  mesh(cyl(0.016, 0.016, 0.12, 6), m.leather, saber, 0, 0, -0.02, Math.PI / 2, 0, 0); // empuñadura
  mesh(torus(0.065, 0.011, 4, 12, Math.PI), m.brass, saber, 0.0, -0.0, 0.02, 0, Math.PI / 2, 0);          // arco del guardamano
  mesh(cyl(0.024, 0.024, 0.13, 8), m.brass, saber, 0.0, 0.035, 0.13, Math.PI / 2, 0, 0);    // el pistón
  mesh(cyl(0.009, 0.009, 0.08, 5), m.steel, saber, 0.0, 0.035, 0.22, Math.PI / 2, 0, 0);    // vástago
  mesh(sphere(0.022, 6, 5), m.brass, saber, 0, 0, -0.085);                                    // pomo

  solid(R.root);

  // poses: base = la guardia de esgrima (de perfil, sable adelante y bajo)
  const base: Pose = {
    hips: [0, 0, 0], spine: [0.08, 0.25, 0], neck: [0, 0, 0], head: [-0.05, -0.2, 0],
    armR: [-0.85, 0, -0.25], elbowR: [-0.7, 0, 0], handR: [0.55, 0, 0],
    armL: [0.15, 0, 0.55], elbowL: [-1.6, 0, 0], handL: [0, 0, 0],
    legR: [-0.35, 0, -0.06], kneeR: [0.4, 0, 0], footR: [-0.05, 0, 0],
    legL: [0.2, 0, 0.08], kneeL: [0.35, 0, 0], footL: [-0.4, 0, 0],
    pos: [0, -0.05, 0], scl: [1, 1, 1],
  };
  const clips: Record<string, Clip> = {
    idle: { len: 1.5, loop: true, keys: [
      { t: 0, p: {} },
      { t: 0.75, p: { spine: [0.11, 0.25, 0], armR: [-0.8, 0, -0.25], elbowR: [-0.78, 0, 0], pos: [0, -0.07, 0], head: [-0.02, -0.2, 0] } },
    ] },
    run: { len: 8 / 12, loop: true, vel: [0, 0, 8], keys: [
      // contacto, abajo, paso, arriba (y el lado opuesto)
      { t: 0, p: { spine: [0.45, 0.1, 0], head: [-0.35, -0.05, 0], armR: [0.6, 0, -0.35], elbowR: [-0.5, 0, 0], handR: [-2.2, 0, 0], armL: [-0.7, 0, 0.3], elbowL: [-1.2, 0, 0],
        legR: [-0.9, 0, 0], kneeR: [0.25, 0, 0], footR: [0.1, 0, 0], legL: [0.55, 0, 0], kneeL: [0.9, 0, 0], footL: [0.2, 0, 0], pos: [0, -0.02, 0] } },
      { t: 1 / 12, p: { legR: [-0.55, 0, 0], kneeR: [0.6, 0, 0], legL: [0.25, 0, 0], kneeL: [1.6, 0, 0], pos: [0, -0.1, 0] } },
      { t: 2 / 12, p: { legR: [-0.05, 0, 0], kneeR: [0.4, 0, 0], legL: [-0.6, 0, 0], kneeL: [1.8, 0, 0], armR: [0.3, 0, -0.35], armL: [-0.3, 0, 0.3], pos: [0, 0.0, 0] } },
      { t: 3 / 12, p: { legR: [0.45, 0, 0], kneeR: [0.6, 0, 0], legL: [-1.0, 0, 0], kneeL: [0.9, 0, 0], armR: [0.1, 0, -0.35], armL: [0.1, 0, 0.3], pos: [0, 0.06, 0] } },
      { t: 4 / 12, p: { legR: [0.55, 0, 0], kneeR: [0.9, 0, 0], footR: [0.2, 0, 0], legL: [-0.9, 0, 0], kneeL: [0.25, 0, 0], footL: [0.1, 0, 0], armR: [0.0, 0, -0.35], armL: [0.3, 0, 0.3], pos: [0, -0.02, 0] } },
      { t: 5 / 12, p: { legR: [0.25, 0, 0], kneeR: [1.6, 0, 0], legL: [-0.55, 0, 0], kneeL: [0.6, 0, 0], pos: [0, -0.1, 0] } },
      { t: 6 / 12, p: { legR: [-0.6, 0, 0], kneeR: [1.8, 0, 0], legL: [-0.05, 0, 0], kneeL: [0.4, 0, 0], armR: [0.3, 0, -0.35], armL: [-0.3, 0, 0.3], pos: [0, 0.0, 0] } },
      { t: 7 / 12, p: { legR: [-1.0, 0, 0], kneeR: [0.9, 0, 0], legL: [0.45, 0, 0], kneeL: [0.6, 0, 0], armR: [0.5, 0, -0.35], armL: [-0.6, 0, 0.3], pos: [0, 0.06, 0] } },
    ] },
    jump: { len: 1.25, next: 'idle', plant: false, vel: [0, 0, 2], keys: [
      { t: 0, p: {} },
      { t: 2 / 12, e: 'out', p: { spine: [0.35, 0.2, 0], legR: [-0.9, 0, 0], kneeR: [1.3, 0, 0], legL: [-0.4, 0, 0], kneeL: [1.4, 0, 0], footL: [-0.2, 0, 0], armR: [0.4, 0, -0.4], armL: [0.6, 0, 0.5], pos: [0, -0.3, 0], scl: [1.12, 0.86, 1.12] } },
      { t: 3 / 12, e: 'snap', p: { spine: [-0.1, 0.1, 0], legR: [0.1, 0, 0], kneeR: [0.1, 0, 0], legL: [0.3, 0, 0], kneeL: [0.3, 0, 0], footL: [0.4, 0, 0], footR: [0.4, 0, 0], armR: [-2.4, 0, -0.3], elbowR: [-0.2, 0, 0], handR: [0.3, 0, 0], armL: [-0.4, 0, 0.8], pos: [0, 1.1, 0], scl: [0.88, 1.16, 0.88] } },
      { t: 6 / 12, e: 'out', p: { spine: [0.25, 0.1, 0], legR: [-1.3, 0, 0], kneeR: [2.0, 0, 0], legL: [-0.9, 0, 0], kneeL: [2.1, 0, 0], armR: [-1.2, 0, -0.5], elbowR: [-0.9, 0, 0], armL: [0.3, 0, 0.7], pos: [0, 2.1, 0], scl: [1, 1, 1] } },
      { t: 8 / 12, e: 'io', p: { spine: [0.1, 0.1, 0], legR: [-0.6, 0, 0], kneeR: [0.6, 0, 0], legL: [-0.2, 0, 0], kneeL: [0.8, 0, 0], footR: [0.3, 0, 0], footL: [0.3, 0, 0], armR: [-1.6, 0, -0.7], armL: [-0.6, 0, 1.0], pos: [0, 1.6, 0] } },
      { t: 10 / 12, e: 'in', p: { legR: [-0.3, 0, 0], kneeR: [0.2, 0, 0], legL: [0.1, 0, 0], kneeL: [0.3, 0, 0], pos: [0, 0.05, 0], scl: [0.94, 1.08, 0.94] } },
      { t: 11 / 12, e: 'snap', p: { spine: [0.4, 0.25, 0], legR: [-0.9, 0, 0], kneeR: [1.4, 0, 0], legL: [-0.2, 0, 0], kneeL: [1.5, 0, 0], footL: [-0.3, 0, 0], armR: [-0.4, 0, -0.6], armL: [0.2, 0, 0.9], pos: [0, -0.32, 0], scl: [1.16, 0.84, 1.16] } },
      { t: 14 / 12, e: 'io', p: { ...pick(base), pos: [0, -0.05, 0], scl: [1, 1, 1] } },
    ], ev: [{ t: 2.5 / 12, k: 'jump' }, { t: 11 / 12, k: 'land' }] },
    // DASH-CORTE: anticipación (2), smear (1), contacto sostenido (3), recobro (4)
    dash: { len: 1.0, next: 'idle', vel: [0, 0, 0], keys: [
      { t: 0, p: {} },
      { t: 2 / 12, e: 'out', p: { spine: [0.15, 0.7, 0], head: [-0.1, -0.5, 0], armR: [-0.2, 0, -1.3], elbowR: [-1.4, 0, 0], handR: [0.2, 0, 0], armL: [-0.6, 0, 0.4], elbowL: [-0.6, 0, 0],
        legR: [-0.5, 0, 0], kneeR: [1.0, 0, 0], legL: [0.4, 0, 0], kneeL: [0.8, 0, 0], pos: [0, -0.18, -0.15], scl: [1.06, 0.92, 1.06] } },
      { t: 3 / 12, e: 'snap', p: { spine: [0.5, -0.3, 0], head: [-0.45, 0.15, 0], armR: [-1.55, 0, -0.15], elbowR: [-0.05, 0, 0], handR: [0.1, 0, 0], armL: [0.9, 0, 0.5], elbowL: [-0.3, 0, 0],
        legR: [-0.95, 0, 0], kneeR: [0.35, 0, 0], legL: [0.75, 0, 0], kneeL: [0.25, 0, 0], footL: [0.5, 0, 0], pos: [0, -0.2, 0.9], scl: [0.88, 0.92, 1.35] } },
      { t: 4 / 12, e: 'snap', p: { spine: [0.42, -0.45, 0], head: [-0.4, 0.3, 0], armR: [-1.2, 0, -0.35], elbowR: [-0.1, 0, 0], handR: [0.75, 0, 0], armL: [0.8, 0, 0.6], elbowL: [-0.4, 0, 0],
        legR: [-0.85, 0, 0], kneeR: [0.75, 0, 0], legL: [0.6, 0, 0], kneeL: [0.35, 0, 0], footL: [0.45, 0, 0], pos: [0, -0.38, 1.5], scl: [1.04, 0.96, 1.04] } },
      { t: 7 / 12, e: 'hold', p: { pos: [0, -0.4, 1.5] } },
      { t: 9 / 12, e: 'io', p: { ...pick(base), spine: [0.15, 0.1, 0], pos: [0, -0.12, 1.5] } },
      { t: 12 / 12, e: 'io', p: { ...pick(base), pos: [0, -0.05, 0] } },
    ], smear: [{ t0: 3 / 12, t1: 4 / 12, kind: 'arc', from: 140, to: -40, r: 0.95, w: 0.42, at: [0.25, 1.05] }],
    ev: [{ t: 3 / 12, k: 'whoosh' }, { t: 4 / 12, k: 'hit', at: [1.4, 1.0] }, { t: 3.5 / 12, k: 'dust' }] },
    // GUARDIA / PARRY: sube la hoja de través, sostiene; a la mitad, un parry perfecto (destello blanco) y vuelve
    guard: { len: 2.0, loop: true, keys: [
      { t: 0, p: {} },
      { t: 2 / 12, e: 'snap', p: { spine: [-0.05, 0.6, 0], head: [-0.1, -0.5, 0], armR: [-1.5, 0, -0.9], elbowR: [-1.3, 0, 0], handR: [0.2, -0.3, 1.2], armL: [-0.9, 0, 0.3], elbowL: [-1.4, 0, 0], handL: [0, 0, 0.6],
        legR: [-0.5, 0, 0], kneeR: [0.9, 0, 0], legL: [0.45, 0, 0], kneeL: [0.6, 0, 0], pos: [0, -0.16, -0.05] } },
      { t: 10 / 12, e: 'hold', p: {} },
      { t: 11 / 12, e: 'snap', p: { spine: [-0.15, 0.4, 0], armR: [-1.9, 0, -0.6], elbowR: [-0.8, 0, 0], handR: [0.3, -0.2, 0.7], pos: [0, -0.1, -0.12], scl: [0.96, 1.05, 0.96] } },
      { t: 14 / 12, e: 'hold', p: {} },
      { t: 16 / 12, e: 'io', p: { spine: [-0.05, 0.6, 0], armR: [-1.5, 0, -0.9], elbowR: [-1.3, 0, 0], handR: [0.2, -0.3, 1.2], pos: [0, -0.16, -0.05], scl: [1, 1, 1] } },
      { t: 23 / 12, e: 'hold', p: {} },
    ], ev: [{ t: 11 / 12, k: 'parry', at: [0.55, 1.55] }] },
    hit: { len: 0.9, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 1 / 12, e: 'snap', p: { spine: [-0.45, 0.4, 0.15], head: [-0.5, 0.3, 0.2], armR: [-0.3, 0, -1.0], elbowR: [-0.4, 0, 0], armL: [-0.2, 0, 1.1], legR: [-0.1, 0, 0], legL: [0.5, 0, 0], kneeL: [0.6, 0, 0], pos: [0, 0.0, -0.4], scl: [0.92, 1.06, 0.92] } },
      { t: 4 / 12, e: 'hold', p: {} },
      { t: 6 / 12, e: 'out', p: { spine: [0.3, 0.3, 0], head: [-0.1, -0.1, 0], armR: [-0.6, 0, -0.4], armL: [0.1, 0, 0.6], legR: [-0.5, 0, 0], kneeR: [0.8, 0, 0], legL: [0.3, 0, 0], kneeL: [0.9, 0, 0], pos: [0, -0.22, -0.55], scl: [1.05, 0.95, 1.05] } },
      { t: 10 / 12, e: 'io', p: { ...pick(base), pos: [0, -0.05, -0.3] } },
    ], ev: [{ t: 0.5 / 12, k: 'hurt', at: [0.1, 1.2] }] },
  };

  Object.assign(clips, gameClips(base));
  const dangles = [new Dangle(J.tailL, 70, 7, 0.012, 1.1, 0.03), new Dangle(J.tailR, 64, 6.5, 0.013, 1.1, 0.03)];
  return {
    rig: R, base, clips, dangles, height: 2.0, feet: ['footL', 'footR'], footY: 0.07,
    glow: { setSchool: (c: string) => setEmit(glow as Toon, c, 1.9) },
  };
}

// Clips del juego (F1): las mismas poses del escaparate sin el desplazamiento de la raíz (en el juego lo pone la sim).
// En el aire no se apoyan los pies (plant: false); el dash se inclina hacia su dirección desde game (el contenedor).
function gameClips(base: Pose): Record<string, Clip> {
  const B = pick(base);
  const RISE: Pose = { spine: [-0.1, 0.1, 0], legR: [0.1, 0, 0], kneeR: [0.1, 0, 0], legL: [0.3, 0, 0], kneeL: [0.3, 0, 0], footL: [0.4, 0, 0], footR: [0.4, 0, 0],
    armR: [-2.4, 0, -0.3], elbowR: [-0.2, 0, 0], handR: [0.3, 0, 0], armL: [-0.4, 0, 0.8], elbowL: [-1.6, 0, 0], head: [-0.05, -0.2, 0] };
  const APEX: Pose = { spine: [0.25, 0.1, 0], legR: [-1.3, 0, 0], kneeR: [2.0, 0, 0], legL: [-0.9, 0, 0], kneeL: [2.1, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0],
    armR: [-1.2, 0, -0.5], elbowR: [-0.9, 0, 0], handR: [0.55, 0, 0], armL: [0.3, 0, 0.7] };
  const FALL: Pose = { spine: [0.1, 0.1, 0], legR: [-0.6, 0, 0], kneeR: [0.6, 0, 0], legL: [-0.2, 0, 0], kneeL: [0.8, 0, 0], footR: [0.3, 0, 0], footL: [0.3, 0, 0],
    armR: [-1.6, 0, -0.7], elbowR: [-0.7, 0, 0], armL: [-0.6, 0, 1.0] };
  const CROUCH: Pose = { spine: [0.4, 0.25, 0], legR: [-0.9, 0, 0], kneeR: [1.4, 0, 0], legL: [-0.2, 0, 0], kneeL: [1.5, 0, 0], footL: [-0.3, 0, 0],
    armR: [-0.4, 0, -0.6], armL: [0.2, 0, 0.9], pos: [0, -0.3, 0] };
  const SMEAR: Pose = { spine: [0.5, -0.3, 0], head: [-0.45, 0.15, 0], armR: [-1.55, 0, -0.15], elbowR: [-0.05, 0, 0], handR: [0.1, 0, 0], armL: [0.9, 0, 0.5], elbowL: [-0.3, 0, 0],
    legR: [-0.95, 0, 0], kneeR: [0.35, 0, 0], legL: [0.75, 0, 0], kneeL: [0.25, 0, 0], footL: [0.5, 0, 0], pos: [0, -0.1, 0] };
  const CUT: Pose = { spine: [0.42, -0.45, 0], head: [-0.4, 0.3, 0], armR: [-1.2, 0, -0.35], elbowR: [-0.1, 0, 0], handR: [0.75, 0, 0], armL: [0.8, 0, 0.6], elbowL: [-0.4, 0, 0],
    legR: [-0.85, 0, 0], kneeR: [0.75, 0, 0], legL: [0.6, 0, 0], kneeL: [0.35, 0, 0], footL: [0.45, 0, 0], pos: [0, -0.15, 0] };
  const GUARD: Pose = { spine: [-0.05, 0.6, 0], head: [-0.1, -0.5, 0], armR: [-1.5, 0, -0.9], elbowR: [-1.3, 0, 0], handR: [0.2, -0.3, 1.2], armL: [-0.9, 0, 0.3], elbowL: [-1.4, 0, 0], handL: [0, 0, 0.6],
    legR: [-0.5, 0, 0], kneeR: [0.9, 0, 0], legL: [0.45, 0, 0], kneeL: [0.6, 0, 0], pos: [0, -0.16, 0] };
  const PARRY: Pose = { spine: [-0.15, 0.4, 0], armR: [-1.9, 0, -0.6], elbowR: [-0.8, 0, 0], handR: [0.3, -0.2, 0.7], pos: [0, -0.1, 0], scl: [0.96, 1.05, 0.96] };
  return {
    g_rise: { len: 3 / 12, plant: false, keys: [{ t: 0, p: { ...RISE, scl: [0.86, 1.18, 0.86] } }, { t: 2 / 12, e: 'out', p: { ...RISE, scl: [1, 1, 1] } }] },
    g_fall: { len: 4 / 12, plant: false, keys: [{ t: 0, p: { ...APEX, scl: [1, 1, 1] } }, { t: 3 / 12, e: 'io', p: FALL }] },
    g_land: { len: 4 / 12, next: 'idle', keys: [{ t: 0, p: { ...CROUCH, scl: [1.16, 0.84, 1.16] } }, { t: 3 / 12, e: 'io', p: { ...B } }] },
    g_dash: { len: 6 / 12, plant: false, keys: [
      { t: 0, p: { ...SMEAR, scl: [0.88, 0.92, 1.35] } },
      { t: 1 / 12, e: 'snap', p: { ...CUT, scl: [1.04, 0.96, 1.04] } },
      { t: 3 / 12, e: 'hold', p: {} },
      { t: 6 / 12, e: 'io', p: { ...FALL, scl: [1, 1, 1], pos: [0, 0, 0], head: [-0.05, -0.2, 0] } },
    ] },
    g_guard: { len: 2 / 12, next: 'g_guardhold', keys: [{ t: 0, p: {} }, { t: 1 / 12, e: 'snap', p: { ...GUARD, scl: [0.96, 1.04, 0.96] } }, { t: 2 / 12, e: 'io', p: { scl: [1, 1, 1] } }] },
    g_guardhold: { len: 1.2, loop: true, keys: [{ t: 0, p: { ...GUARD, scl: [1, 1, 1] } }, { t: 0.6, p: { spine: [-0.02, 0.6, 0], pos: [0, -0.19, 0] } }] },
    g_parry: { len: 6 / 12, next: 'g_guardhold', keys: [
      { t: 0, p: { ...GUARD, scl: [1, 1, 1] } }, { t: 1 / 12, e: 'snap', p: PARRY }, { t: 3 / 12, e: 'hold', p: {} }, { t: 6 / 12, e: 'io', p: { ...GUARD, scl: [1, 1, 1] } },
    ] },
    g_hit: { len: 8 / 12, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 1 / 12, e: 'snap', p: { spine: [-0.45, 0.4, 0.15], head: [-0.5, 0.3, 0.2], armR: [-0.3, 0, -1.0], elbowR: [-0.4, 0, 0], armL: [-0.2, 0, 1.1], legR: [-0.1, 0, 0], legL: [0.5, 0, 0], kneeL: [0.6, 0, 0], pos: [0, 0, 0], scl: [0.92, 1.06, 0.92] } },
      { t: 3 / 12, e: 'hold', p: {} },
      { t: 8 / 12, e: 'io', p: { ...B } },
    ] },
  };
}

// los ángulos de la pose base (para volver a ella en una clave)
function pick(p: Pose): Pose { const o: Pose = {}; for (const k in p) o[k] = p[k].slice(); return o; }
export { D };
