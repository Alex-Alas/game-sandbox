// TOPO-BARRENA: autómata de latón de la compañía con un taladro en el hocico (GDD §10.1). Cuerpo a cuerpo.
// Silueta: un barril bajo y largo con la barrena en punta adelante y la chimenea atrás (se lee como «una bala con
// patas»). Latón remachado en anillos, garras de pala de hierro con caras planas y dos ojos rojos (el peligro).
// Ataques: ACOMETIDA (destello blanco antes: se devuelve con parry) y BARRENA (aura roja: hay que esquivarla).
import * as THREE from 'three';
import { Rig, type ModelDef, type Clip, type Pose } from '../anim.ts';
import { toon, glowMat } from '../toon.ts';
import { EMIT } from '../palette.ts';
import { mesh, sphere, cyl, box, torus, lathe, extrude, solid, flat, rivetsArc } from './kit.ts';

export function topo(): ModelDef {
  const m = {
    brass: toon('brass', { metal: 1, rough: 0.3 }), copper: toon('copper', { metal: 0.8 }), iron: toon('iron', { metal: 0.8, rough: 0.4 }),
    steel: toon('steel', { metal: 1.1, rough: 0.15 }), dark: toon('coal'),
  };
  const eye = glowMat(EMIT.peligro[1], 1, 2.0);
  const R = new Rig();
  const torso = R.joint('torso', R.body, 0, 0.62, 0);
  // el barril (torno a lo largo de z)
  const barrel = lathe([[0.0, -0.72], [0.28, -0.64], [0.42, -0.35], [0.44, 0.0], [0.42, 0.28], [0.36, 0.46], [0.0, 0.5]], 16);
  mesh(barrel, m.brass, torso, 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 0.92);
  for (const z of [-0.42, 0.0, 0.32]) {
    mesh(torus(0.43, 0.022, 4, 18), m.copper, torso, 0, 0, z, 0, 0, 0, 1, 0.93, 1);
    rivetsArc(torso, m.iron, 10, 0.445, 0, Math.PI * 2 * 9 / 10, 0.018, 0, z + 0.03, 'xy');
  }
  // chimenea y caldera chica
  mesh(cyl(0.07, 0.09, 0.42, 10), m.copper, torso, 0, 0.45, -0.38, -0.25, 0, 0);
  mesh(torus(0.085, 0.02, 4, 10), m.brass, torso, 0, 0.66, -0.44, Math.PI / 2 - 0.25, 0, 0);
  mesh(cyl(0.16, 0.16, 0.22, 12), m.iron, torso, 0, 0.36, 0.05, 0, 0, Math.PI / 2);
  // cola de escape
  mesh(cyl(0.05, 0.08, 0.4, 8), m.iron, torso, 0, -0.05, -0.85, Math.PI / 2 + 0.4, 0, 0);
  // cabeza con la barrena
  const head = R.joint('head', torso, 0, 0.02, 0.48);
  mesh(lathe([[0.32, 0], [0.34, 0.08], [0.26, 0.2], [0.2, 0.24]], 14), m.iron, head, 0, 0, 0, Math.PI / 2, 0, 0);
  rivetsArc(head, m.brass, 8, 0.33, 0, Math.PI * 2 * 7 / 8, 0.02, 0, 0.06, 'xy');
  for (const s of [1, -1]) {
    mesh(cyl(0.07, 0.07, 0.06, 10), m.dark, head, s * 0.2, 0.17, 0.1, Math.PI / 2 - 0.3, 0, 0);
    mesh(sphere(0.05, 8, 6), eye, head, s * 0.2, 0.18, 0.13);
  }
  const drill = R.joint('drill', head, 0, 0, 0.22);
  // barrena: cono con estrías en espiral (se tuercen los vértices según el largo)
  const dg = new THREE.ConeGeometry(0.2, 0.75, 6, 8);
  dg.rotateX(Math.PI / 2); dg.translate(0, 0, 0.375);
  const dp = dg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i), a = z * 7.5, c = Math.cos(a), s = Math.sin(a);
    dp.setXY(i, x * c - y * s, x * s + y * c);
  }
  mesh(flat(dg), m.steel, drill, 0, 0, 0);
  mesh(cyl(0.21, 0.23, 0.08, 12), m.brass, drill, 0, 0, 0.02, Math.PI / 2, 0, 0);
  // patas: garras de pala adelante, patitas atrás
  for (const s of [1, -1]) {
    const n = s > 0 ? 'L' : 'R';
    const claw = R.joint('claw' + n, torso, s * 0.36, -0.12, 0.28);
    mesh(cyl(0.07, 0.06, 0.28, 8), m.brass, claw, 0, -0.12, 0);
    const paw = R.joint('paw' + n, claw, 0, -0.28, 0);
    mesh(flat(extrude([[-0.13, 0], [0.13, 0], [0.16, -0.12], [0.08, -0.22], [0.0, -0.18], [-0.08, -0.22], [-0.16, -0.12]], 0.06)), m.iron, paw, 0, 0, 0.06, -0.5, 0, 0);
    const back = R.joint('back' + n, torso, s * 0.3, -0.2, -0.38);
    mesh(cyl(0.07, 0.06, 0.24, 8), m.brass, back, 0, -0.1, 0);
    mesh(flat(box(0.16, 0.08, 0.22)), m.iron, back, 0, -0.26, 0.04);
  }
  solid(R.root);

  const base: Pose = { torso: [0, 0, 0], head: [0, 0, 0], drill: [0, 0, 0], clawL: [0, 0, 0], clawR: [0, 0, 0], pawL: [0, 0, 0], pawR: [0, 0, 0], backL: [0, 0, 0], backR: [0, 0, 0], pos: [0, 0, 0], scl: [1, 1, 1], spin: [1] };
  const clips: Record<string, Clip> = {
    idle: { len: 1.6, loop: true, keys: [
      { t: 0, p: {} },
      { t: 0.4, p: { head: [-0.12, 0.1, 0], torso: [-0.03, 0, 0], pos: [0, 0.03, 0] } },
      { t: 0.8, p: { head: [0.05, -0.1, 0], clawL: [-0.25, 0, 0], pawL: [0.4, 0, 0], torso: [0.02, 0, 0], pos: [0, -0.01, 0] } },
      { t: 1.2, p: { head: [-0.05, 0, 0], clawL: [0, 0, 0], pawL: [0, 0, 0], clawR: [-0.25, 0, 0], pawR: [0.4, 0, 0] } },
    ] },
    // ACOMETIDA (blanco: se devuelve): se encabrita 0,5 s, destella, y embiste con la barrena
    atkW: { len: 1.8, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 3 / 12, e: 'out', p: { torso: [-0.55, 0, 0], head: [-0.3, 0, 0], clawL: [-1.2, 0, 0.2], clawR: [-1.2, 0, -0.2], pawL: [0.9, 0, 0], pawR: [0.9, 0, 0], backL: [0.4, 0, 0], backR: [0.4, 0, 0], pos: [0, 0.18, -0.35], spin: [0.2] } },
      { t: 9 / 12, e: 'hold', p: { torso: [-0.62, 0, 0], pos: [0, 0.22, -0.4] } },
      { t: 10 / 12, e: 'snap', p: { torso: [0.25, 0, 0], head: [0.2, 0, 0], clawL: [0.9, 0, 0.1], clawR: [0.9, 0, -0.1], pawL: [-0.3, 0, 0], pawR: [-0.3, 0, 0], backL: [-0.8, 0, 0], backR: [-0.8, 0, 0], pos: [0, -0.08, 1.0], scl: [0.9, 0.9, 1.25], spin: [6] } },
      { t: 11 / 12, e: 'snap', p: { torso: [0.15, 0, 0], pos: [0, -0.05, 1.35], scl: [1.05, 0.95, 1.05] } },
      { t: 15 / 12, e: 'hold', p: {} },
      { t: 21 / 12, e: 'io', p: { ...pick(base) } },
    ], smear: [{ t0: 10 / 12, t1: 11 / 12, kind: 'thrust', from: 175, to: 185, r: 0.4, w: 0.3, at: [1.9, 0.62] }],
    ev: [{ t: 3 / 12, k: 'tele', d: 0.5, at: [0.9, 1.35] }, { t: 10 / 12, k: 'whoosh' }, { t: 11 / 12, k: 'hit', at: [2.4, 0.62] }] },
    // BARRENA (rojo: no se devuelve): aura, la barrena aúlla y carga
    atkR: { len: 2.0, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 2 / 12, e: 'out', p: { torso: [0.25, 0, 0], head: [0.15, 0, 0], clawL: [0.5, 0, 0.3], clawR: [0.5, 0, -0.3], backL: [-0.4, 0, 0], backR: [-0.4, 0, 0], pos: [0, -0.12, -0.25], scl: [1.06, 0.92, 1.06], spin: [8] } },
      { t: 9 / 12, e: 'hold', p: { pos: [0, -0.14, -0.3], scl: [1.08, 0.9, 1.08] } },
      { t: 10 / 12, e: 'snap', p: { torso: [0.12, 0, 0], clawL: [-0.8, 0, 0.1], clawR: [0.8, 0, -0.1], backL: [0.6, 0, 0], backR: [-0.6, 0, 0], pos: [0, -0.04, 1.2], scl: [0.92, 0.95, 1.2], spin: [10] } },
      { t: 12 / 12, e: 'lin', p: { clawL: [0.8, 0, 0.1], clawR: [-0.8, 0, -0.1], backL: [-0.6, 0, 0], backR: [0.6, 0, 0], pos: [0, -0.04, 2.4] } },
      { t: 14 / 12, e: 'lin', p: { clawL: [-0.8, 0, 0.1], clawR: [0.8, 0, -0.1], pos: [0, -0.04, 3.0], scl: [1, 1, 1] } },
      { t: 17 / 12, e: 'out', p: { ...pick(base), torso: [-0.2, 0, 0], pos: [0, 0.05, 3.1], spin: [2] } },
      { t: 24 / 12, e: 'io', p: { ...pick(base) } },
    ], smear: [{ t0: 10 / 12, t1: 14 / 12, kind: 'thrust', from: 180, to: 180, r: 0.5, w: 0.5, at: [0.2, 0.62] }],
    ev: [{ t: 0.01, k: 'aura', on: 1 }, { t: 10 / 12, k: 'whoosh', heavy: true }, { t: 12 / 12, k: 'hit', at: [3.4, 0.62] }, { t: 17 / 12, k: 'aura', on: 0 }] },
    hit: { len: 0.9, next: 'idle', keys: [
      { t: 0, p: {} },
      { t: 1 / 12, e: 'snap', p: { torso: [-0.35, 0, 0.15], head: [-0.4, 0.2, 0], clawL: [-0.6, 0, 0.5], clawR: [-0.5, 0, -0.5], pos: [0, 0.12, -0.35], scl: [0.94, 1.06, 0.94] } },
      { t: 4 / 12, e: 'hold', p: {} },
      { t: 7 / 12, e: 'out', p: { torso: [0.15, 0, 0], head: [0.1, 0, 0], clawL: [0, 0, 0], clawR: [0, 0, 0], pos: [0, -0.06, -0.45], scl: [1.06, 0.94, 1.06] } },
      { t: 10 / 12, e: 'io', p: { ...pick(base) } },
    ], ev: [{ t: 0.5 / 12, k: 'hurt', at: [0.6, 0.8] }] },
  };
  return {
    rig: R, base, clips, dangles: [], height: 1.2,
    glow: {},
    frame(a) {
      // la barrena gira a saltos (un cuarto de vuelta de la estría por cuadro, más rápido si `spin` sube)
      const sp = R.pose.spin?.[0] ?? 1;
      R.joints.drill.rotation.z = (a.frameAt() * sp * 0.9) % (Math.PI * 2);
    },
  };
}
function pick(p: Pose): Pose { const o: Pose = {}; for (const k in p) o[k] = p[k].slice(); return o; }
