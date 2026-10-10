// Mascotas: criaturas hechas con primitivas de Three.js (sin modelos), mirando hacia +z. Caminan delante tuyo, un poco al
// costado, para que se vean en primera persona (las que vuelan, a la altura de la vista), se suben a las flechas, festejan
// cuando una sale y se asustan con los choques. Las miniaturas de la tienda se sacan con un renderer aparte.
import * as THREE from 'three';
import type { PetId } from './sim/meta.ts';

type Mood = 'idle' | 'happy' | 'sad';
type AnimS = { move: number, mood: Mood, moodT: number };
type Built = { g: THREE.Group, fly: number, anim: (t: number, s: AnimS) => void };

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
const WHITE = mat('#ffffff', { roughness: 0.3 }), INK = mat('#1d1b3a', { roughness: 0.25 }), BLUSH = mat('#ff8fb8', { roughness: 0.6 });
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent?.add(o);
  return o;
}
const ball = (r: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, sx = 1, sy = 1, sz = 1) => {
  const o = mesh(new THREE.SphereGeometry(r, 20, 14), m, x, y, z, parent);
  o.scale.set(sx, sy, sz);
  return o;
};
function eye(r: number, x: number, y: number, z: number, parent: THREE.Object3D) {
  const w = ball(r, WHITE, x, y, z, parent);
  ball(r * 0.62, INK, 0, 0, r * 0.5, w);
  ball(r * 0.2, WHITE, r * 0.22, r * 0.28, r * 0.98, w);
  return w;
}
const cheeks = (x: number, y: number, z: number, r: number, parent: THREE.Object3D) => { ball(r, BLUSH, x, y, z, parent, 1, 0.6, 0.4); ball(r, BLUSH, -x, y, z, parent, 1, 0.6, 0.4); };
const cone = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => mesh(new THREE.ConeGeometry(r, h, 14), m, x, y, z, parent);
const cyl = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => mesh(new THREE.CylinderGeometry(r, r, h, 12), m, x, y, z, parent);

// salto con aplaste para las que rebotan; festejo = giro con salto; tristeza = temblor
function common(body: THREE.Object3D, t: number, s: AnimS, hop: number, base = 0) {
  const ph = Math.abs(Math.sin(t * 9));
  body.position.y = base + ph * hop * s.move;
  body.rotation.y = 0, body.rotation.z = 0;
  if (s.mood === 'happy') { const k = Math.min(1, s.moodT * 1.6); body.position.y += Math.sin(k * Math.PI) * 0.35; body.rotation.y = k * Math.PI * 2; }
  if (s.mood === 'sad') { body.rotation.z = Math.sin(t * 40) * 0.08 * Math.max(0, 1 - s.moodT); body.position.y -= 0.03; }
}

const BUILD: Record<PetId, () => Built> = {
  gomita() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const jelly = mat('#45e3b0', { roughness: 0.15, transparent: true, opacity: 0.86 });
    ball(0.3, jelly, 0, 0.26, 0, b, 1, 0.82, 1);
    ball(0.15, mat('#2bbf8e', { roughness: 0.3 }), 0, 0.2, -0.02, b, 1, 0.8, 1);
    eye(0.055, 0.1, 0.32, 0.22, b); eye(0.055, -0.1, 0.32, 0.22, b);
    cheeks(0.17, 0.25, 0.22, 0.045, b);
    ball(0.05, WHITE, -0.12, 0.44, 0.1, b);
    return { g, fly: 0, anim(t, s) {
      common(b, t, s, 0.22);
      const sq = s.move ? Math.sin(t * 18) * 0.12 : Math.sin(t * 3) * 0.05;
      b.scale.set(1 + sq, 1 - sq, 1 + sq);
    } };
  },
  michi() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const fur = mat('#ff9a3c'), cream = mat('#fff1e0'), pink = mat('#ff9fb8');
    ball(0.2, fur, 0, 0.24, -0.02, b, 1, 0.9, 1.4);
    ball(0.15, cream, 0, 0.2, 0.04, b, 1, 0.8, 1.3);
    const head = new THREE.Group(); head.position.set(0, 0.44, 0.22); b.add(head);
    ball(0.17, fur, 0, 0, 0, head);
    for (const sx of [1, -1]) {
      const e = cone(0.065, 0.13, fur, sx * 0.095, 0.15, -0.01, head); e.rotation.z = -sx * 0.35;
      const i = cone(0.035, 0.08, pink, sx * 0.093, 0.14, 0.015, head); i.rotation.z = -sx * 0.35;
    }
    ball(0.08, cream, 0, -0.045, 0.13, head, 1.1, 0.7, 0.7);
    ball(0.022, pink, 0, -0.015, 0.175, head);
    eye(0.037, 0.068, 0.03, 0.135, head); eye(0.037, -0.068, 0.03, 0.135, head);
    cheeks(0.11, -0.03, 0.12, 0.03, head);
    const legs = [[0.1, 0.13], [-0.1, 0.13], [0.1, -0.15], [-0.1, -0.15]].map(([x, z]) => { const l = cyl(0.04, 0.16, fur, x, 0.08, z, b); return l; });
    const tail = new THREE.Group(); tail.position.set(0, 0.28, -0.26); b.add(tail);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.12, -0.08), new THREE.Vector3(0, 0.26, -0.06), new THREE.Vector3(0.05, 0.33, 0.02)]);
    mesh(new THREE.TubeGeometry(curve, 16, 0.035, 8), fur, 0, 0, 0, tail);
    return { g, fly: 0, anim(t, s) {
      common(b, t, s, 0.05);
      legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 13 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 * s.move; });
      tail.rotation.z = Math.sin(t * 3) * 0.45, tail.rotation.x = s.mood === 'sad' ? 0.9 : 0;
      head.rotation.z = Math.sin(t * 1.3) * 0.12 * (1 - s.move);
    } };
  },
  pio() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const yel = mat('#ffd23f'), org = mat('#ff8a1f');
    ball(0.21, yel, 0, 0, 0, b);
    for (const a of [-0.4, 0, 0.4]) { const c = cone(0.025, 0.09, yel, a * 0.08, 0.22, 0, b); c.rotation.z = -a; }
    const beak = cone(0.045, 0.1, org, 0, -0.01, 0.22, b); beak.rotation.x = Math.PI / 2;
    eye(0.036, 0.075, 0.06, 0.17, b); eye(0.036, -0.075, 0.06, 0.17, b);
    cheeks(0.13, -0.01, 0.15, 0.03, b);
    const wings = [1, -1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.19, 0.0, -0.01); b.add(w); ball(0.1, yel, sx * 0.04, 0, 0, w, 0.35, 0.9, 1.1); return w; });
    for (const sx of [1, -1]) { const f = cone(0.03, 0.06, org, sx * 0.07, -0.22, 0.03, b); f.rotation.x = Math.PI; }
    return { g, fly: 0.95, anim(t, s) {
      common(b, t, s, 0);
      b.position.y += Math.sin(t * 4) * 0.06;
      const f = Math.sin(t * (s.move ? 30 : 9)) * (s.move ? 0.9 : 0.35);
      wings[0].rotation.z = -f - 0.2, wings[1].rotation.z = f + 0.2;
    } };
  },
  croac() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const grn = mat('#58cf5a'), light = mat('#cdf59f');
    ball(0.27, grn, 0, 0.17, 0, b, 1, 0.62, 0.95);
    ball(0.2, light, 0, 0.13, 0.07, b, 1, 0.55, 0.9);
    for (const sx of [1, -1]) { ball(0.085, grn, sx * 0.12, 0.3, 0.1, b); eye(0.062, sx * 0.12, 0.33, 0.14, b); }
    const mouth = mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20, Math.PI), INK, 0, 0.215, 0.215, b);
    mouth.rotation.z = Math.PI;
    cheeks(0.17, 0.2, 0.17, 0.035, b);
    for (const sx of [1, -1]) { ball(0.1, grn, sx * 0.22, 0.07, -0.1, b, 0.6, 0.5, 1.2); ball(0.05, grn, sx * 0.13, 0.04, 0.17, b, 1, 0.6, 1.2); }
    return { g, fly: 0, anim(t, s) {
      common(b, t, s, 0);
      const ph = (t * 1.8) % 1;
      b.position.y += s.move ? Math.sin(Math.min(1, ph / 0.6) * Math.PI) * 0.4 : 0;
      const puff = 1 + Math.max(0, Math.sin(t * 2.5)) * 0.08 * (1 - s.move);
      b.children[1].scale.set(puff, 0.55 * puff, 0.9);
    } };
  },
  bu() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const ghost = mat('#f7f5ff', { roughness: 0.35, transparent: true, opacity: 0.92, emissive: new THREE.Color('#d8d0ff'), emissiveIntensity: 0.35 });
    const pts = [[0.24, -0.02], [0.25, 0.12], [0.24, 0.26], [0.21, 0.38], [0.15, 0.47], [0.07, 0.52], [0.0, 0.535]].map(([x, y]) => new THREE.Vector2(x, y));
    const lg = new THREE.LatheGeometry(pts, 28);
    const body = mesh(lg, ghost, 0, -0.25, 0, b);
    (body.material as THREE.Material).side = THREE.DoubleSide;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ball(0.07, ghost, Math.cos(a) * 0.2, -0.27, Math.sin(a) * 0.2, b); }
    for (const sx of [1, -1]) ball(0.035, INK, sx * 0.08, 0.06, 0.215, b, 0.8, 1.3, 0.5);
    ball(0.03, INK, 0, -0.04, 0.235, b, 1, 1.2, 0.5);
    cheeks(0.14, -0.0, 0.2, 0.03, b);
    const arms = [1, -1].map(sx => ball(0.06, ghost, sx * 0.25, -0.05, 0.03, b));
    return { g, fly: 1.05, anim(t, s) {
      common(b, t, s, 0);
      b.position.y += Math.sin(t * 2.2) * 0.08;
      b.rotation.x = s.move * 0.25;
      arms[0].position.y = -0.05 + Math.sin(t * 3) * 0.04, arms[1].position.y = -0.05 + Math.sin(t * 3 + 1) * 0.04;
      if (s.mood === 'sad') b.scale.setScalar(0.9 + Math.sin(t * 50) * 0.03); else b.scale.setScalar(1);
    } };
  },
  ajolote() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const pink = mat('#ffb0cf'), gill = mat('#ff5fa2');
    ball(0.16, pink, 0, 0.15, -0.04, b, 1, 0.8, 2);
    const head = new THREE.Group(); head.position.set(0, 0.22, 0.27); b.add(head);
    ball(0.19, pink, 0, 0, 0, head, 1.1, 0.78, 0.9);
    const gills: THREE.Object3D[] = [];
    for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {
      const q = new THREE.Group(); q.position.set(sx * 0.17, 0.02 + k * 0.05 - 0.04, -0.04); q.rotation.z = -sx * (0.9 - k * 0.45); head.add(q);
      cyl(0.016, 0.15, gill, 0, 0.075, 0, q); ball(0.03, gill, 0, 0.15, 0, q);
      gills.push(q);
    }
    eye(0.034, 0.1, 0.04, 0.13, head); eye(0.034, -0.1, 0.04, 0.13, head);
    const sm = mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 16, Math.PI), INK, 0, -0.04, 0.16, head); sm.rotation.z = Math.PI;
    cheeks(0.14, -0.02, 0.12, 0.028, head);
    const tail = ball(0.1, mat('#ffc6dc'), 0, 0.17, -0.42, b, 0.25, 0.9, 2.1);
    for (const [x, z] of [[0.13, 0.12], [-0.13, 0.12], [0.12, -0.18], [-0.12, -0.18]]) ball(0.045, pink, x, 0.05, z, b, 1, 0.8, 1.2);
    return { g, fly: 0, anim(t, s) {
      common(b, t, s, 0.03);
      b.rotation.y += Math.sin(t * 10) * 0.15 * s.move;
      tail.rotation.y = Math.sin(t * 6) * 0.5;
      gills.forEach((q, i) => { q.rotation.x = Math.sin(t * 4 + i) * 0.25; });
    } };
  },
  zumbi() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const geo = new THREE.SphereGeometry(0.19, 28, 20), col: number[] = [], P = geo.attributes.position;
    const Y = new THREE.Color('#ffd23f'), K = new THREE.Color('#2a2440');
    for (let i = 0; i < P.count; i++) { const z = P.getZ(i), c = z < 0.06 && Math.sin(z * 34) > 0.3 ? K : Y; col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const body = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 0, 0, 0, b);
    body.scale.set(0.95, 0.9, 1.2);
    eye(0.05, 0.075, 0.05, 0.18, b); eye(0.05, -0.075, 0.05, 0.18, b);
    cheeks(0.13, -0.02, 0.17, 0.03, b);
    const st = cone(0.035, 0.09, INK, 0, -0.01, -0.26, b); st.rotation.x = -Math.PI / 2;
    for (const sx of [1, -1]) { const a = cyl(0.008, 0.14, INK, sx * 0.05, 0.22, 0.12, b); a.rotation.z = -sx * 0.4; ball(0.022, INK, sx * 0.08, 0.29, 0.12, b); }
    const wm = new THREE.MeshStandardMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.6, roughness: 0.1, side: THREE.DoubleSide });
    const wings = [1, -1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.05, 0.17, -0.02); b.add(w); const m = mesh(new THREE.CircleGeometry(0.13, 18), wm, sx * 0.12, 0.02, 0, w); m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.6, 1); return w; });
    return { g, fly: 1.3, anim(t, s) {
      common(b, t, s, 0);
      b.position.y += Math.sin(t * 3) * 0.07;
      b.position.x = Math.sin(t * 1.7) * 0.12;
      const f = Math.sin(t * 55) * 0.6;
      wings[0].rotation.z = -f, wings[1].rotation.z = f;
    } };
  },
  robi() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const metal = mat('#a9bce2', { roughness: 0.32, metalness: 0.25 }), light = mat('#d6e2fa', { roughness: 0.3, metalness: 0.2 });
    mesh(new THREE.BoxGeometry(0.3, 0.24, 0.24), metal, 0, 0.24, 0, b);
    const head = new THREE.Group(); head.position.set(0, 0.47, 0); b.add(head);
    mesh(new THREE.BoxGeometry(0.3, 0.21, 0.22), light, 0, 0, 0, head);
    mesh(new THREE.BoxGeometry(0.23, 0.13, 0.02), mat('#1d2244', { roughness: 0.2 }), 0, 0, 0.11, head);
    const glow = new THREE.MeshStandardMaterial({ color: '#7ff3ff', emissive: new THREE.Color('#38e6ff'), emissiveIntensity: 1.4 });
    const eyes = [1, -1].map(sx => mesh(new THREE.CapsuleGeometry(0.022, 0.035, 4, 8), glow, sx * 0.055, 0.01, 0.125, head));
    cyl(0.012, 0.13, metal, 0, 0.17, 0, head);
    const bulbM = new THREE.MeshStandardMaterial({ color: '#ff5f7a', emissive: new THREE.Color('#ff3355'), emissiveIntensity: 0.6 });
    ball(0.04, bulbM, 0, 0.25, 0, head);
    const wheels = [1, -1].map(sx => { const w = cyl(0.075, 0.05, INK, sx * 0.13, 0.075, 0, b); w.rotation.z = Math.PI / 2; return w; });
    for (const sx of [1, -1]) { const a = cyl(0.025, 0.16, metal, sx * 0.19, 0.24, 0.02, b); a.rotation.z = sx * 0.3; }
    return { g, fly: 0, anim(t, s) {
      common(b, t, s, 0.02);
      head.rotation.z = Math.sin(t * 1.6) * 0.1;
      wheels.forEach(w => { w.rotation.x += s.move * 0.4; });
      bulbM.emissiveIntensity = s.mood === 'happy' ? 3 : 0.4 + (Math.sin(t * 4) > 0.6 ? 1 : 0);
      glow.emissive.set(s.mood === 'sad' ? '#ff3355' : '#38e6ff');
      const blink = (t % 3.2) < 0.12 ? 0.15 : 1;
      eyes.forEach(e => e.scale.set(1, blink, 1));
    } };
  },
  dragui() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const vio = mat('#9b6bff'), belly = mat('#ddd0ff'), horn = mat('#ffe7a8');
    ball(0.2, vio, 0, 0, -0.03, b, 1, 1, 1.3);
    ball(0.15, belly, 0, -0.04, 0.05, b, 1, 1, 1.1);
    const head = new THREE.Group(); head.position.set(0, 0.17, 0.2); b.add(head);
    ball(0.15, vio, 0, 0, 0, head);
    ball(0.09, vio, 0, -0.04, 0.12, head, 1, 0.8, 1);
    for (const sx of [1, -1]) { const h = cone(0.03, 0.12, horn, sx * 0.07, 0.15, -0.03, head); h.rotation.x = -0.5; h.rotation.z = -sx * 0.2; }
    eye(0.035, 0.07, 0.04, 0.12, head); eye(0.035, -0.07, 0.04, 0.12, head);
    cheeks(0.11, -0.03, 0.1, 0.028, head);
    const ws = new THREE.Shape();
    ws.moveTo(0, 0); ws.quadraticCurveTo(0.12, 0.2, 0.3, 0.16); ws.lineTo(0.24, 0.08); ws.lineTo(0.28, 0.0); ws.lineTo(0.2, -0.02); ws.lineTo(0.2, -0.08); ws.quadraticCurveTo(0.1, -0.03, 0, 0);
    const wm = mat('#c7b0ff', { side: THREE.DoubleSide });
    const wings = [1, -1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.12, 0.1, -0.05); b.add(w); const m = mesh(new THREE.ShapeGeometry(ws), wm, 0, 0, 0, w); m.scale.x = sx; m.rotation.y = 0; return w; });
    const tail = cone(0.07, 0.3, vio, 0, -0.04, -0.36, b); tail.rotation.x = -Math.PI / 2 - 0.3;
    for (let k = 0; k < 3; k++) cone(0.025, 0.06, horn, 0, 0.19 - k * 0.03, -0.05 - k * 0.1, b);
    return { g, fly: 1.2, anim(t, s) {
      common(b, t, s, 0);
      b.position.y += Math.sin(t * 2.6) * 0.07;
      const f = Math.sin(t * (s.move ? 14 : 6)) * 0.7;
      wings[0].rotation.y = -f * 0.6, wings[0].rotation.z = f * 0.4; wings[1].rotation.y = f * 0.6, wings[1].rotation.z = -f * 0.4;
      tail.rotation.y = Math.sin(t * 3) * 0.3;
    } };
  },
};

export class PetCtl {
  readonly id: PetId; readonly root: THREE.Group; private b: Built;
  x: number; y = 0; z: number; vx = 0; vz = 0; face = 0; t = 0; mood: Mood = 'idle'; moodT = 0; move = 0;
  constructor(id: PetId, x: number, z: number) {
    this.id = id, this.b = BUILD[id]();
    this.root = new THREE.Group();
    this.root.add(this.b.g);
    this.x = x, this.z = z;
  }
  cheer() { this.mood = 'happy', this.moodT = 0; }
  sad() { this.mood = 'sad', this.moodT = 0; }
  place(x: number, z: number) { this.x = x, this.z = z, this.vx = this.vz = 0; }

  update(dt: number, p: { x: number, y: number, z: number, yaw: number, speed: number }, groundAt: (x: number, z: number) => number) {
    this.t += dt, this.moodT += dt;
    if (this.mood !== 'idle' && this.moodT > 1.1) this.mood = 'idle';
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const fly = this.b.fly > 0;
    const ahead = fly ? 2.1 : 2.6, side = fly ? 0.85 : -0.95;
    const tx = p.x + fx * ahead + rx * side, tz = p.z + fz * ahead + rz * side;
    let dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 16) { this.place(tx, tz); dx = dz = 0; }
    const want = d < 0.35 ? 0 : Math.min(Math.max(6, p.speed * 1.5), d * 3);
    const k = 1 - Math.exp(-8 * dt);
    this.vx += ((d > 1e-3 ? dx / d : 0) * want - this.vx) * k;
    this.vz += ((d > 1e-3 ? dz / d : 0) * want - this.vz) * k;
    this.x += this.vx * dt, this.z += this.vz * dt;
    const sp = Math.hypot(this.vx, this.vz);
    this.move += ((sp > 0.4 ? 1 : 0) - this.move) * Math.min(1, dt * 8);
    // mira hacia donde va; quieta, al jugador
    const look = sp > 0.4 ? Math.atan2(this.vx, this.vz) : Math.atan2(p.x - this.x, p.z - this.z);
    let da = look - this.face;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.face += da * Math.min(1, dt * 7);
    const gy = fly ? p.y + this.b.fly : groundAt(this.x, this.z);
    this.y += (gy - this.y) * Math.min(1, dt * (fly ? 4 : 14));
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.face;
    this.b.anim(this.t, { move: this.move, mood: this.mood, moodT: this.moodT });
  }
  dispose() { this.root.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); }
}

// Miniaturas para la tienda (un renderer chico y aparte, una sola vez)
let thumbs: Partial<Record<PetId, string>> | null = null;
export function petThumbs(ids: PetId[]): Partial<Record<PetId, string>> {
  if (thumbs) return thumbs;
  thumbs = {};
  try {
    const cv = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(200, 200, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    sc.add(new THREE.HemisphereLight('#ffffff', '#ffd9ef', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(1.5, 3, 2.5); sc.add(sun);
    for (const id of ids) {
      const b = BUILD[id]();
      b.anim(0.3, { move: 0, mood: 'idle', moodT: 9 });
      b.g.position.y = -(b.fly ? 0 : 0.28);
      b.g.rotation.y = -0.45;
      sc.add(b.g);
      cam.position.set(0, 0.25, 1.65); cam.lookAt(0, 0, 0);
      r.render(sc, cam);
      thumbs[id] = cv.toDataURL('image/png');
      sc.remove(b.g);
    }
    r.dispose();
    r.forceContextLoss();
  } catch { /* sin WebGL de sobra: la tienda muestra un círculo */ }
  return thumbs;
}
