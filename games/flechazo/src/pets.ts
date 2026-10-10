// Mascotas: criaturas hechas con primitivas de Three.js (sin modelos), mirando hacia +z, con su animación (`anim`: caminar,
// festejar, asustarse y la reacción única a una caricia en la cabeza, `love`). Llevan los estilos de los cofres: una piel
// (color, estampado o material) sobre sus materiales principales (`skin`) y un accesorio en la cabeza o en la cara (`hat`,
// `face`). Las miniaturas de la tienda y de la ruleta se sacan con un renderer aparte. Lo que hacen en el nivel (seguirte,
// las caricias, agarrarlas, lanzarlas y el pleito) está en petctl.ts.
import * as THREE from 'three';
import type { PetId } from './sim/meta.ts';
import { NO_LOOK, type Look } from './sim/styles.ts';

export type Mood = 'idle' | 'happy' | 'sad' | 'love';
export type AnimS = { move: number, mood: Mood, moodT: number };
type Anchor = { at: THREE.Object3D, p: [number, number, number], s: number };
export type FxKind = 'fire' | 'bubbles' | 'sparkle' | 'jelly' | 'steam' | 'notes';
export type Built = {
  g: THREE.Group, fly: number, anim: (t: number, s: AnimS) => void,
  eyes: THREE.Object3D[],                       // los ojos (se entrecierran con las caricias y llevan cejas de enojo)
  skin: [THREE.MeshStandardMaterial, number][], // materiales de la piel (y cuánto más claros: las partes de otro tono)
  hat: Anchor, face: Anchor,                    // dónde va un sombrero y dónde unos lentes
  fx?: (t: number) => { kind: FxKind, at: [number, number, number] } | null, // partículas de la caricia (en coordenadas de g)
};
export const LOVE_T = 2.5; // lo que dura la reacción a una caricia

export const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
export const WHITE = mat('#ffffff', { roughness: 0.3 }), INK = mat('#1d1b3a', { roughness: 0.25 }), BLUSH = mat('#ff8fb8', { roughness: 0.6 });
export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent?.add(o);
  return o;
}
export const ball = (r: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, sx = 1, sy = 1, sz = 1) => {
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
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const bump = (k: number, a: number, b: number) => { const u = clamp01((k - a) / (b - a)); return Math.sin(u * Math.PI); }; // 0 → 1 → 0 entre a y b
// ojos felices (^^): achatados
const squint = (eyes: THREE.Object3D[], on: number) => eyes.forEach(e => e.scale.y = 1 - 0.78 * on);

// salto con aplaste para las que rebotan; festejo = giro con salto; tristeza = temblor
function common(body: THREE.Object3D, t: number, s: AnimS, hop: number, base = 0) {
  const ph = Math.abs(Math.sin(t * 9));
  body.position.y = base + ph * hop * s.move;
  body.position.x = 0, body.position.z = 0;
  body.rotation.set(0, 0, 0);
  if (s.mood === 'happy') { const k = Math.min(1, s.moodT * 1.6); body.position.y += Math.sin(k * Math.PI) * 0.35; body.rotation.y = k * Math.PI * 2; }
  if (s.mood === 'sad') { body.rotation.z = Math.sin(t * 40) * 0.08 * Math.max(0, 1 - s.moodT); body.position.y -= 0.03; }
}
const love = (s: AnimS) => s.mood === 'love' ? s.moodT : -1;

export const BUILD: Record<PetId, () => Built> = {
  // Gomita: gelatina que, acariciada, tiembla entera, se pone rosada y suelta burbujitas
  gomita() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const jelly = mat('#45e3b0', { roughness: 0.15, transparent: true, opacity: 0.86 }), core = mat('#2bbf8e', { roughness: 0.3 });
    ball(0.3, jelly, 0, 0.26, 0, b, 1, 0.82, 1);
    ball(0.15, core, 0, 0.2, -0.02, b, 1, 0.8, 1);
    const eyes = [eye(0.055, 0.1, 0.32, 0.22, b), eye(0.055, -0.1, 0.32, 0.22, b)];
    cheeks(0.17, 0.25, 0.22, 0.045, b);
    ball(0.05, WHITE, -0.12, 0.44, 0.1, b);
    let base: [THREE.Color, number] | null = null; // el brillo de su piel (se toma después de vestirla)
    return { g, fly: 0, eyes, skin: [[jelly, 0], [core, -0.25]], hat: { at: b, p: [0, 0.49, 0], s: 1.25 }, face: { at: b, p: [0, 0.33, 0.27], s: 1.15 },
      anim(t, s) {
        common(b, t, s, 0.22);
        let sq = s.move ? Math.sin(t * 18) * 0.12 : Math.sin(t * 3) * 0.05;
        const k = love(s), [c0, i0] = base ??= [jelly.emissive.clone(), jelly.emissiveIntensity];
        jelly.emissive.copy(c0), jelly.emissiveIntensity = i0;
        if (k >= 0) {
          sq = Math.sin(k * 17) * 0.3 * Math.exp(-k * 1.3);
          const w = bump(k, 0, LOVE_T);
          jelly.emissive.lerpColors(c0, BLUSH.color, w), jelly.emissiveIntensity = i0 + (0.55 - i0 * 0.5) * w; // se pone rosada
          b.position.y += bump(k, 1.5, 2.1) * 0.35;
        }
        squint(eyes, k >= 0 ? bump(k, 0.1, 2.2) : 0);
        b.scale.set(1 + sq, 1 - sq, 1 + sq);
      },
      fx: (k) => k > 0.2 && k < 1.8 && Math.random() < 0.18 ? { kind: 'jelly', at: [0, 0.45, 0] } : null };
  },
  // Michi: cierra los ojos, ronronea, frota la cabeza contra la mano, amasa y para la cola
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
    const eyes = [eye(0.037, 0.068, 0.03, 0.135, head), eye(0.037, -0.068, 0.03, 0.135, head)];
    cheeks(0.11, -0.03, 0.12, 0.03, head);
    const legs = [[0.1, 0.13], [-0.1, 0.13], [0.1, -0.15], [-0.1, -0.15]].map(([x, z]) => cyl(0.04, 0.16, fur, x, 0.08, z, b));
    const tail = new THREE.Group(); tail.position.set(0, 0.28, -0.26); b.add(tail);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.12, -0.08), new THREE.Vector3(0, 0.26, -0.06), new THREE.Vector3(0.05, 0.33, 0.02)]);
    mesh(new THREE.TubeGeometry(curve, 16, 0.035, 8), fur, 0, 0, 0, tail);
    return { g, fly: 0, eyes, skin: [[fur, 0]], hat: { at: head, p: [0, 0.155, -0.01], s: 1 }, face: { at: head, p: [0, 0.035, 0.165], s: 0.85 },
      anim(t, s) {
        common(b, t, s, 0.05);
        legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 13 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 * s.move; });
        tail.rotation.z = Math.sin(t * 3) * 0.45, tail.rotation.x = s.mood === 'sad' ? 0.9 : 0;
        head.rotation.set(0, 0, Math.sin(t * 1.3) * 0.12 * (1 - s.move));
        const k = love(s);
        squint(eyes, k >= 0 ? bump(k, 0, LOVE_T + 0.2) : 0);
        if (k >= 0) {
          const w = bump(k, 0, LOVE_T);
          head.rotation.z = Math.sin(k * 5) * 0.32 * w;  // se frota contra la mano
          head.rotation.x = -0.28 * w;                    // estira la cabeza hacia arriba
          b.position.y -= 0.03 * w;
          tail.rotation.x = -0.35 * w, tail.rotation.z = Math.sin(k * 11) * 0.25;
          legs[0].rotation.x = Math.max(0, Math.sin(k * 9)) * 0.6 * w, legs[1].rotation.x = Math.max(0, -Math.sin(k * 9)) * 0.6 * w; // amasa
        }
      } };
  },
  // Pío: se esponja, aletea como loco, da tres saltitos piando y un giro
  pio() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const yel = mat('#ffd23f'), org = mat('#ff8a1f');
    ball(0.21, yel, 0, 0, 0, b);
    for (const a of [-0.4, 0, 0.4]) { const c = cone(0.025, 0.09, yel, a * 0.08, 0.22, 0, b); c.rotation.z = -a; }
    const beak = cone(0.045, 0.1, org, 0, -0.01, 0.22, b); beak.rotation.x = Math.PI / 2;
    const eyes = [eye(0.036, 0.075, 0.06, 0.17, b), eye(0.036, -0.075, 0.06, 0.17, b)];
    cheeks(0.13, -0.01, 0.15, 0.03, b);
    const wings = [1, -1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.19, 0.0, -0.01); b.add(w); ball(0.1, yel, sx * 0.04, 0, 0, w, 0.35, 0.9, 1.1); return w; });
    for (const sx of [1, -1]) { const f = cone(0.03, 0.06, org, sx * 0.07, -0.22, 0.03, b); f.rotation.x = Math.PI; }
    return { g, fly: 0.95, eyes, skin: [[yel, 0]], hat: { at: b, p: [0, 0.205, 0], s: 1.1 }, face: { at: b, p: [0, 0.065, 0.2], s: 0.95 },
      anim(t, s) {
        common(b, t, s, 0);
        b.position.y += Math.sin(t * 4) * 0.06;
        const k = love(s);
        let f = Math.sin(t * (s.move ? 30 : 9)) * (s.move ? 0.9 : 0.35);
        b.scale.setScalar(1);
        if (k >= 0) {
          f = Math.sin(k * 48) * 1.1;
          b.scale.setScalar(1 + 0.22 * bump(k, 0, LOVE_T));
          if (k < 1.6) b.position.y += Math.abs(Math.sin(k * Math.PI * 1.9)) * 0.2;
          else b.rotation.y = clamp01((k - 1.6) / 0.6) * Math.PI * 2;
        }
        squint(eyes, k >= 0 ? bump(k, 0, LOVE_T) : 0);
        wings[0].rotation.z = -f - 0.2, wings[1].rotation.z = f + 0.2;
      },
      fx: (k) => k > 0.1 && k < 1.6 && Math.random() < 0.12 ? { kind: 'sparkle', at: [0, 0.1, 0] } : null };
  },
  // Croac: infla el buche dos veces, saca la lengua y pega un salto mortal hacia atrás
  croac() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const grn = mat('#58cf5a'), light = mat('#cdf59f');
    ball(0.27, grn, 0, 0.17, 0, b, 1, 0.62, 0.95);
    const belly = ball(0.2, light, 0, 0.13, 0.07, b, 1, 0.55, 0.9);
    const eyes: THREE.Object3D[] = [];
    for (const sx of [1, -1]) { ball(0.085, grn, sx * 0.12, 0.3, 0.1, b); eyes.push(eye(0.062, sx * 0.12, 0.33, 0.14, b)); }
    const mouth = mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20, Math.PI), INK, 0, 0.215, 0.215, b);
    mouth.rotation.z = Math.PI;
    const tongue = ball(0.035, mat('#ff6f9a'), 0, 0.2, 0.22, b, 1, 0.5, 1);
    tongue.visible = false;
    cheeks(0.17, 0.2, 0.17, 0.035, b);
    for (const sx of [1, -1]) { ball(0.1, grn, sx * 0.22, 0.07, -0.1, b, 0.6, 0.5, 1.2); ball(0.05, grn, sx * 0.13, 0.04, 0.17, b, 1, 0.6, 1.2); }
    return { g, fly: 0, eyes, skin: [[grn, 0], [light, 0.45]], hat: { at: b, p: [0, 0.39, 0.08], s: 1.2 }, face: { at: b, p: [0, 0.34, 0.2], s: 1.25 },
      anim(t, s) {
        common(b, t, s, 0);
        const ph = (t * 1.8) % 1;
        b.position.y += s.move ? Math.sin(Math.min(1, ph / 0.6) * Math.PI) * 0.4 : 0;
        let puff = 1 + Math.max(0, Math.sin(t * 2.5)) * 0.08 * (1 - s.move);
        const k = love(s);
        tongue.visible = false;
        if (k >= 0) {
          if (k < 1.2) puff = 1 + Math.max(0, Math.sin(k * 5.3)) * 0.5;     // buche
          if (k > 0.5 && k < 0.95) { tongue.visible = true; tongue.position.z = 0.22 + bump(k, 0.5, 0.95) * 0.16; tongue.scale.z = 1 + bump(k, 0.5, 0.95) * 2.5; }
          const j = clamp01((k - 1.3) / 0.8);                                // salto mortal
          b.position.y += Math.sin(j * Math.PI) * 0.65;
          b.rotation.x = -j * Math.PI * 2;
        }
        squint(eyes, k >= 0 ? bump(k, 0, 1.3) : 0);
        belly.scale.set(puff, 0.55 * puff, 0.9 * (k >= 0 && k < 1.2 ? puff : 1));
      } };
  },
  // Bu: se tapa los ojos de vergüenza, se pone colorado y después da una vuelta feliz flotando
  bu() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const ghost = mat('#f7f5ff', { roughness: 0.35, transparent: true, opacity: 0.92, emissive: new THREE.Color('#d8d0ff'), emissiveIntensity: 0.35 });
    ghost.side = THREE.DoubleSide;
    const pts = [[0.24, -0.02], [0.25, 0.12], [0.24, 0.26], [0.21, 0.38], [0.15, 0.47], [0.07, 0.52], [0.0, 0.535]].map(([x, y]) => new THREE.Vector2(x, y));
    mesh(new THREE.LatheGeometry(pts, 28), ghost, 0, -0.25, 0, b);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ball(0.07, ghost, Math.cos(a) * 0.2, -0.27, Math.sin(a) * 0.2, b); }
    const eyes = [1, -1].map(sx => ball(0.035, INK, sx * 0.08, 0.06, 0.215, b, 0.8, 1.3, 0.5));
    ball(0.03, INK, 0, -0.04, 0.235, b, 1, 1.2, 0.5);
    const blush = mat('#ff7fb0', { roughness: 0.6, transparent: true, opacity: 0.9 });
    const cheek = [1, -1].map(sx => ball(0.03, blush, sx * 0.14, 0, 0.2, b, 1, 0.6, 0.4));
    const arms = [1, -1].map(sx => ball(0.06, ghost, sx * 0.25, -0.05, 0.03, b));
    let base: [THREE.Color, number] | null = null;
    return { g, fly: 1.05, eyes, skin: [[ghost, 0]], hat: { at: b, p: [0, 0.285, 0], s: 1.2 }, face: { at: b, p: [0, 0.07, 0.24], s: 1 },
      anim(t, s) {
        common(b, t, s, 0);
        b.position.y += Math.sin(t * 2.2) * 0.08;
        b.rotation.x = s.move * 0.25;
        let ax = 0.25, ay = -0.05 + Math.sin(t * 3) * 0.04, az = 0.03;
        const k = love(s);
        if (s.mood === 'sad') b.scale.setScalar(0.9 + Math.sin(t * 50) * 0.03); else b.scale.setScalar(1);
        const shy = k >= 0 ? bump(k, 0, 1.4) : 0;
        if (k >= 0) {
          ax = 0.25 - 0.17 * shy, ay = -0.05 + 0.12 * shy, az = 0.03 + 0.18 * shy;             // se tapa los ojos
          const sp = clamp01((k - 1.2) / 1.1);
          b.rotation.y = sp * Math.PI * 2, b.position.y += Math.sin(sp * Math.PI) * 0.18;
          if (sp > 0) ay = -0.05 + Math.sin(sp * Math.PI) * 0.2;                                // y saluda
        }
        arms[0].position.set(ax, ay, az), arms[1].position.set(-ax, ay + (k >= 0 ? 0 : Math.sin(t * 3 + 1) * 0.04 - Math.sin(t * 3) * 0.04), az);
        cheek.forEach(c => c.scale.set(1 + 1.4 * shy, 0.6 + 0.6 * shy, 0.4));
        const [c0, i0] = base ??= [ghost.emissive.clone(), ghost.emissiveIntensity], w = k >= 0 ? bump(k, 0, LOVE_T) : 0;
        ghost.emissive.lerpColors(c0, BLUSH.color, 0.7 * w), ghost.emissiveIntensity = i0 + 0.4 * w; // colorado
        eyes.forEach(e => e.scale.y = 1.3 * (1 - 0.75 * (k >= 0 ? bump(k, 1.2, LOVE_T) : 0)));
      } };
  },
  // Ajolote: abanica las branquias encendidas, baila meneándose y suelta burbujas
  ajolote() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const pink = mat('#ffb0cf'), gill = mat('#ff5fa2'), tailM = mat('#ffc6dc');
    ball(0.16, pink, 0, 0.15, -0.04, b, 1, 0.8, 2);
    const head = new THREE.Group(); head.position.set(0, 0.22, 0.27); b.add(head);
    ball(0.19, pink, 0, 0, 0, head, 1.1, 0.78, 0.9);
    const gills: THREE.Object3D[] = [];
    for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {
      const q = new THREE.Group(); q.position.set(sx * 0.17, 0.02 + k * 0.05 - 0.04, -0.04); q.rotation.z = -sx * (0.9 - k * 0.45); head.add(q);
      cyl(0.016, 0.15, gill, 0, 0.075, 0, q); ball(0.03, gill, 0, 0.15, 0, q);
      gills.push(q);
    }
    const eyes = [eye(0.034, 0.1, 0.04, 0.13, head), eye(0.034, -0.1, 0.04, 0.13, head)];
    const sm = mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 16, Math.PI), INK, 0, -0.04, 0.16, head); sm.rotation.z = Math.PI;
    cheeks(0.14, -0.02, 0.12, 0.028, head);
    const tail = ball(0.1, tailM, 0, 0.17, -0.42, b, 0.25, 0.9, 2.1);
    for (const [x, z] of [[0.13, 0.12], [-0.13, 0.12], [0.12, -0.18], [-0.12, -0.18]]) ball(0.045, pink, x, 0.05, z, b, 1, 0.8, 1.2);
    return { g, fly: 0, eyes, skin: [[pink, 0], [tailM, 0.3]], hat: { at: head, p: [0, 0.145, -0.02], s: 1.05 }, face: { at: head, p: [0, 0.045, 0.165], s: 1.05 },
      anim(t, s) {
        common(b, t, s, 0.03);
        b.rotation.y += Math.sin(t * 10) * 0.15 * s.move;
        tail.rotation.y = Math.sin(t * 6) * 0.5;
        const k = love(s), w = k >= 0 ? bump(k, 0, LOVE_T) : 0;
        gills.forEach((q, i) => { q.rotation.x = k >= 0 ? Math.sin(k * 26 + i) * 0.55 : Math.sin(t * 4 + i) * 0.25; q.scale.setScalar(1 + 0.35 * w); });
        gill.emissive.set('#ff3d8f'); gill.emissiveIntensity = 0.9 * w;
        if (k >= 0) { b.rotation.z = Math.sin(k * 8) * 0.28 * w; tail.rotation.y = Math.sin(k * 16) * 0.8; b.position.y += Math.abs(Math.sin(k * 8)) * 0.06; }
        sm.scale.set(1 + 0.5 * w, 1 + 0.5 * w, 1);
        squint(eyes, w);
      },
      fx: (k) => k > 0.2 && k < 2 && Math.random() < 0.2 ? { kind: 'bubbles', at: [0, 0.3, 0.4] } : null };
  },
  // Zumbi: la danza de las abejas (un ocho meneándose) con el zumbido a mil
  zumbi() {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const geo = new THREE.SphereGeometry(0.19, 28, 20), col: number[] = [], P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) { const z = P.getZ(i), c = z < 0.06 && Math.sin(z * 34) > 0.3 ? 0.16 : 1; col.push(c, c, c); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const fuzz = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffd23f', roughness: 0.5 }); // las rayas negras quedan con cualquier piel
    mesh(geo, fuzz, 0, 0, 0, b).scale.set(0.95, 0.9, 1.2);
    const eyes = [eye(0.05, 0.075, 0.05, 0.18, b), eye(0.05, -0.075, 0.05, 0.18, b)];
    cheeks(0.13, -0.02, 0.17, 0.03, b);
    const st = cone(0.035, 0.09, INK, 0, -0.01, -0.26, b); st.rotation.x = -Math.PI / 2;
    for (const sx of [1, -1]) { const a = cyl(0.008, 0.14, INK, sx * 0.05, 0.22, 0.12, b); a.rotation.z = -sx * 0.4; ball(0.022, INK, sx * 0.08, 0.29, 0.12, b); }
    const wm = new THREE.MeshStandardMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.6, roughness: 0.1, side: THREE.DoubleSide });
    const wings = [1, -1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.05, 0.17, -0.02); b.add(w); const m = mesh(new THREE.CircleGeometry(0.13, 18), wm, sx * 0.12, 0.02, 0, w); m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.6, 1); return w; });
    return { g, fly: 1.3, eyes, skin: [[fuzz, 0]], hat: { at: b, p: [0, 0.165, -0.02], s: 1.1 }, face: { at: b, p: [0, 0.055, 0.215], s: 1.15 },
      anim(t, s) {
        common(b, t, s, 0);
        b.position.y += Math.sin(t * 3) * 0.07;
        b.position.x = Math.sin(t * 1.7) * 0.12;
        const k = love(s);
        let f = Math.sin(t * 55) * 0.6;
        if (k >= 0) {
          const w = bump(k, 0, LOVE_T), a = k * 4.4;
          b.position.x = Math.sin(a) * 0.38 * w, b.position.z = Math.sin(a * 2) * 0.16 * w; // un ocho
          b.rotation.z = Math.sin(k * 34) * 0.32 * w;                                         // meneo
          b.rotation.y = Math.cos(a) * 0.5 * w;
          f = Math.sin(k * 90) * 0.8;
        }
        squint(eyes, k >= 0 ? bump(k, 0, LOVE_T) : 0);
        wings[0].rotation.z = -f, wings[1].rotation.z = f;
      },
      fx: (k) => k > 0.3 && k < 2.2 && Math.random() < 0.1 ? { kind: 'sparkle', at: [0, 0, 0] } : null };
  },
  // Robi: los ojos se le vuelven corazones, la antena titila en arcoíris, gira la cabeza y canta bip-bup
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
    const heartM = new THREE.MeshStandardMaterial({ color: '#ff7fb8', emissive: new THREE.Color('#ff3d8f'), emissiveIntensity: 1.6 });
    const hg = new THREE.ShapeGeometry(heartShape(0.032));
    const hearts = [1, -1].map(sx => { const m = mesh(hg, heartM, sx * 0.055, 0.0, 0.124, head); m.visible = false; return m; });
    cyl(0.012, 0.13, metal, 0, 0.17, 0, head);
    const bulbM = new THREE.MeshStandardMaterial({ color: '#ff5f7a', emissive: new THREE.Color('#ff3355'), emissiveIntensity: 0.6 });
    ball(0.04, bulbM, 0, 0.25, 0, head);
    const wheels = [1, -1].map(sx => { const w = cyl(0.075, 0.05, INK, sx * 0.13, 0.075, 0, b); w.rotation.z = Math.PI / 2; return w; });
    const armsR = [1, -1].map(sx => { const a = cyl(0.025, 0.16, metal, sx * 0.19, 0.24, 0.02, b); a.rotation.z = sx * 0.3; return a; });
    return { g, fly: 0, eyes, skin: [[metal, 0], [light, 0.45]], hat: { at: head, p: [0, 0.105, 0], s: 1.1 }, face: { at: head, p: [0, 0.015, 0.14], s: 0.95 },
      anim(t, s) {
        common(b, t, s, 0.02);
        head.rotation.set(0, 0, Math.sin(t * 1.6) * 0.1);
        wheels.forEach(w => { w.rotation.x += s.move * 0.4; });
        bulbM.emissiveIntensity = s.mood === 'happy' ? 3 : 0.4 + (Math.sin(t * 4) > 0.6 ? 1 : 0);
        bulbM.emissive.set('#ff3355');
        glow.emissive.set(s.mood === 'sad' ? '#ff3355' : '#38e6ff');
        const blink = (t % 3.2) < 0.12 ? 0.15 : 1;
        eyes.forEach(e => e.scale.set(1, blink, 1));
        const k = love(s), on = k >= 0 && k < LOVE_T - 0.15;
        eyes.forEach(e => e.visible = !on), hearts.forEach(h => { h.visible = on; h.scale.setScalar(1 + Math.sin(k * 14) * 0.15); });
        armsR.forEach((a, i) => a.rotation.z = (i ? -1 : 1) * (0.3 + (k >= 0 ? bump(k, 0.2, 2) * 1.2 : 0)));
        if (k >= 0) {
          head.rotation.y = clamp01((k - 0.5) / 0.7) * Math.PI * 2;                           // la cabeza da una vuelta
          bulbM.emissive.setHSL((k * 1.8) % 1, 1, 0.55); bulbM.emissiveIntensity = 3;      // antena arcoíris
          b.position.y += Math.abs(Math.sin(k * 9)) * 0.05 * bump(k, 0, LOVE_T);
        }
      } };
  },
  // Dragui: abre las alas, ruge bajito echando una bocanada de chispas y da una vuelta en el aire
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
    const eyes = [eye(0.035, 0.07, 0.04, 0.12, head), eye(0.035, -0.07, 0.04, 0.12, head)];
    cheeks(0.11, -0.03, 0.1, 0.028, head);
    const ws = new THREE.Shape();
    ws.moveTo(0, 0); ws.quadraticCurveTo(0.12, 0.2, 0.3, 0.16); ws.lineTo(0.24, 0.08); ws.lineTo(0.28, 0.0); ws.lineTo(0.2, -0.02); ws.lineTo(0.2, -0.08); ws.quadraticCurveTo(0.1, -0.03, 0, 0);
    const wm = mat('#c7b0ff', { side: THREE.DoubleSide });
    const wings = [1, -1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.12, 0.1, -0.05); b.add(w); const m = mesh(new THREE.ShapeGeometry(ws), wm, 0, 0, 0, w); m.scale.x = sx; return w; });
    const tail = cone(0.07, 0.3, vio, 0, -0.04, -0.36, b); tail.rotation.x = -Math.PI / 2 - 0.3;
    for (let k = 0; k < 3; k++) cone(0.025, 0.06, horn, 0, 0.19 - k * 0.03, -0.05 - k * 0.1, b);
    return { g, fly: 1.2, eyes, skin: [[vio, 0], [wm, 0.35]], hat: { at: head, p: [0, 0.14, -0.03], s: 0.95 }, face: { at: head, p: [0, 0.045, 0.15], s: 0.85 },
      anim(t, s) {
        common(b, t, s, 0);
        b.position.y += Math.sin(t * 2.6) * 0.07;
        head.rotation.set(0, 0, 0);
        let f = Math.sin(t * (s.move ? 14 : 6)) * 0.7, open = 0;
        const k = love(s);
        if (k >= 0) {
          open = bump(k, 0, LOVE_T);
          f = Math.sin(k * 16) * 0.5;
          head.rotation.x = -0.45 * bump(k, 0.5, 1.4);                         // ruge mirando arriba
          const l = clamp01((k - 1.45) / 0.8);                                  // vuelta en el aire
          b.rotation.x = -l * Math.PI * 2, b.position.y += Math.sin(l * Math.PI) * 0.3;
        }
        wings[0].rotation.y = -f * 0.6 - open * 0.7, wings[0].rotation.z = f * 0.4 + open * 0.3;
        wings[1].rotation.y = f * 0.6 + open * 0.7, wings[1].rotation.z = -f * 0.4 - open * 0.3;
        tail.rotation.y = Math.sin(t * 3) * 0.3;
        squint(eyes, k >= 0 ? bump(k, 0.4, LOVE_T) : 0);
      },
      fx: (k) => k > 0.75 && k < 1.25 ? { kind: 'fire', at: [0, 0.2, 0.42] } : null };
  },
};

export function heartShape(r: number) {
  const s = new THREE.Shape();
  s.moveTo(0, -r);
  s.bezierCurveTo(-r * 0.2, -r * 0.6, -r * 1.2, -r * 0.3, -r * 1.1, r * 0.35);
  s.bezierCurveTo(-r, r * 0.95, -r * 0.15, r * 1.05, 0, r * 0.45);
  s.bezierCurveTo(r * 0.15, r * 1.05, r, r * 0.95, r * 1.1, r * 0.35);
  s.bezierCurveTo(r * 1.2, -r * 0.3, r * 0.2, -r * 0.6, 0, -r);
  return s;
}

// ---- Estilos ---------------------------------------------------------------------------------------------------------
// Texturas de los estampados (una por estilo, en un lienzo; las animadas se corren con `offset`)
const texCache = new Map<string, THREE.CanvasTexture>();
function tex(id: string): THREE.CanvasTexture {
  let t = texCache.get(id);
  if (t) return t;
  const cv = document.createElement('canvas'), N = 128;
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const heart = (x: number, y: number, r: number) => { g.beginPath(); g.moveTo(x, y + r); g.bezierCurveTo(x - r * 1.3, y, x - r, y - r, x, y - r * 0.35); g.bezierCurveTo(x + r, y - r, x + r * 1.3, y, x, y + r); g.fill(); };
  const star = (x: number, y: number, r: number) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, q = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.fill(); };
  if (id === 'rayas') { g.fillStyle = '#fff4fa'; g.fillRect(0, 0, N, N); g.fillStyle = '#ff6fae'; for (let k = -N; k < N * 2; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 16, 0); g.lineTo(k + 16 - N, N); g.lineTo(k - N, N); g.fill(); } }
  else if (id === 'lunares') { g.fillStyle = '#ff4f64'; g.fillRect(0, 0, N, N); g.fillStyle = '#fff'; for (const [x, y] of [[16, 16], [80, 16], [48, 56], [112, 56], [16, 96], [80, 96]]) { g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill(); } }
  else if (id === 'cuadros') { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#ffffff' : '#4f8cff'; g.fillRect(x * 32, y * 32, 32, 32); } }
  else if (id === 'corazones') { g.fillStyle = '#ffc2df'; g.fillRect(0, 0, N, N); g.fillStyle = '#ff3d8f'; for (const [x, y] of [[32, 30], [96, 30], [64, 92], [0, 92], [128, 92]]) heart(x, y, 15); }
  else if (id === 'estrellas') { g.fillStyle = '#1f2763'; g.fillRect(0, 0, N, N); g.fillStyle = '#ffe27a'; for (const [x, y, r] of [[20, 24, 9], [84, 18, 6], [56, 70, 11], [110, 84, 7], [18, 104, 6], [92, 118, 5], [40, 40, 3], [120, 40, 3]]) star(x, y, r); }
  else if (id === 'galaxia') {
    const gr = g.createLinearGradient(0, 0, N, N); gr.addColorStop(0, '#2a0b6b'); gr.addColorStop(0.5, '#6a2bd6'); gr.addColorStop(1, '#0d1d6b');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    for (const [x, y, r, c] of [[40, 50, 40, 'rgba(255,95,207,.35)'], [96, 90, 46, 'rgba(56,230,255,.3)']] as [number, number, number, string][]) { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(0, 0, N, N); }
    g.fillStyle = '#fff'; let sd = 3; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 40; k++) { g.globalAlpha = 0.4 + rnd() * 0.6; g.beginPath(); g.arc(rnd() * N, rnd() * N, 0.6 + rnd() * 1.8, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  } else if (id === 'arcoiris') { for (let x = 0; x < N; x++) { g.fillStyle = `hsl(${(x / N) * 360}, 95%, 64%)`; g.fillRect(x, 0, 1, N); } }
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(id === 'arcoiris' || id === 'galaxia' ? 1 : 3, id === 'arcoiris' || id === 'galaxia' ? 1 : 2);
  texCache.set(id, t);
  return t;
}
const SOLID: Record<string, string> = { menta: '#6fe3c1', cielo: '#7cc4ff', lavanda: '#bda4ff', durazno: '#ffb38a', carbon: '#474a6a', nieve: '#f3f5ff' };
// Pinta un material de la piel (light: cuánto más claro, para las partes de otro tono; negativo, más oscuro)
function paint(m: THREE.MeshStandardMaterial, id: string, light: number) {
  const tone = (hex: string) => { const c = new THREE.Color(hex); return light > 0 ? c.lerp(new THREE.Color('#ffffff'), light) : c.multiplyScalar(1 + light); };
  m.map = null, m.emissiveMap = null, m.metalness = 0;
  if (SOLID[id]) { m.color.copy(tone(SOLID[id])); m.emissive.set(0); m.emissiveIntensity = 0; }
  else if (id === 'oro') { m.color.copy(tone('#ffc93c')); m.metalness = 0.6; m.roughness = 0.24; m.emissive.set('#8a5600'); m.emissiveIntensity = 0.45; }
  else if (id === 'neon') { m.color.copy(tone('#38ffe0')); m.emissive.set('#19e6c8'); m.emissiveIntensity = 0.85; m.roughness = 0.3; }
  else if (id === 'cristal') { m.color.copy(tone('#bff3ff')); m.transparent = true; m.opacity = 0.55; m.roughness = 0.05; m.emissive.set('#5fd8ff'); m.emissiveIntensity = 0.3; }
  else {
    m.map = tex(id); m.color.set(light > 0 ? tone('#ffffff') : '#ffffff');
    if (id === 'galaxia' || id === 'arcoiris') { m.emissiveMap = m.map; m.emissive.set('#ffffff'); m.emissiveIntensity = id === 'galaxia' ? 0.55 : 0.35; }
    else { m.emissive.set(0); m.emissiveIntensity = 0; }
  }
  m.needsUpdate = true;
}

// Accesorios (medidos para una cabeza de ~0,17 m; el anclaje los escala)
function accessory(id: string): { o: THREE.Object3D, face: boolean, spin?: (t: number) => void } {
  const o = new THREE.Group();
  const gold = mat('#ffcb3d', { metalness: 0.55, roughness: 0.25, emissive: new THREE.Color('#7a4d00'), emissiveIntensity: 0.5 });
  if (id === 'mono') {
    const pink = mat('#ff4f9a', { roughness: 0.4 });
    for (const sx of [1, -1]) { const l = cone(0.05, 0.1, pink, sx * 0.055, 0, 0, o); l.rotation.z = sx * Math.PI / 2; l.scale.set(1, 1, 0.55); }
    ball(0.028, mat('#ff86bd'), 0, 0, 0.005, o);
    o.position.x = 0.07, o.rotation.z = -0.4;
    return { o, face: false };
  }
  if (id === 'flor') {
    const pet = mat('#ff8fc8', { roughness: 0.45 }), mid = mat('#ffd23f');
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ball(0.045, pet, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0, o, 1, 1, 0.45); }
    ball(0.034, mid, 0, 0, 0.014, o);
    o.position.set(-0.1, -0.02, 0.07), o.rotation.set(-0.5, -0.5, 0);
    return { o, face: false };
  }
  if (id === 'gorrito') {
    const cg = new THREE.ConeGeometry(0.065, 0.17, 18), col: number[] = [], P = cg.attributes.position;
    for (let i = 0; i < P.count; i++) { const c = new THREE.Color(Math.floor((P.getY(i) + 0.085) / 0.034) % 2 ? '#7b5cff' : '#ffd23f'); col.push(c.r, c.g, c.b); }
    cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 0, 0.085, 0, o);
    ball(0.026, mat('#ff4fb8'), 0, 0.175, 0, o);
    o.rotation.z = 0.25;
    return { o, face: false };
  }
  if (id === 'galera') {
    const blk = mat('#24234a', { roughness: 0.4 });
    cyl(0.065, 0.12, blk, 0, 0.07, 0, o); cyl(0.11, 0.012, blk, 0, 0.012, 0, o);
    cyl(0.067, 0.028, mat('#ff4d6d'), 0, 0.028, 0, o);
    o.rotation.z = -0.12;
    return { o, face: false };
  }
  if (id === 'auris') {
    const band = mat('#ffffff', { roughness: 0.35 }), cup = mat('#ff5f7a', { roughness: 0.35 });
    mesh(new THREE.TorusGeometry(0.13, 0.014, 8, 24, Math.PI), band, 0, -0.05, 0, o);
    for (const sx of [1, -1]) { const c = cyl(0.048, 0.045, cup, sx * 0.13, -0.06, 0, o); c.rotation.z = Math.PI / 2; }
    return { o, face: false };
  }
  if (id === 'corona') {
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.055, 18, 1, true), gold);
    (cr.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    cr.position.y = 0.03; o.add(cr);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; cone(0.02, 0.05, gold, Math.sin(a) * 0.072, 0.08, Math.cos(a) * 0.072, o); ball(0.012, gold, Math.sin(a) * 0.072, 0.108, Math.cos(a) * 0.072, o); }
    ball(0.016, mat('#ff3d6a', { emissive: new THREE.Color('#ff3d6a'), emissiveIntensity: 0.5 }), 0, 0.03, 0.08, o);
    for (const sx of [1, -1]) ball(0.012, mat('#38e6ff', { emissive: new THREE.Color('#38e6ff'), emissiveIntensity: 0.5 }), sx * 0.055, 0.03, 0.058, o);
    return { o, face: false };
  }
  if (id === 'aureola') {
    const glow = mat('#fff1a8', { emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 1.2, roughness: 0.3 });
    const halo = mesh(new THREE.TorusGeometry(0.085, 0.014, 10, 32), glow, 0, 0.1, 0, o);
    halo.rotation.x = Math.PI / 2;
    return { o, face: false, spin: (t) => { halo.position.y = 0.1 + Math.sin(t * 2.4) * 0.015; halo.rotation.z = t * 0.8; } };
  }
  // lentes de sol
  const lens = mat('#1d1b3a', { roughness: 0.1, metalness: 0.3 }), frame = mat('#ff4fb8', { roughness: 0.4 });
  for (const sx of [1, -1]) {
    const l = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 20), lens, sx * 0.055, 0, 0, o); l.rotation.x = Math.PI / 2; l.scale.set(1.15, 1, 0.85);
    const f = mesh(new THREE.TorusGeometry(0.047, 0.008, 6, 20), frame, sx * 0.055, 0, 0.004, o); f.scale.set(1.15, 0.85, 1);
  }
  mesh(new THREE.BoxGeometry(0.03, 0.01, 0.01), frame, 0, 0.012, 0.004, o);
  return { o, face: true };
}

// Viste a una mascota recién armada con su piel y su accesorio; devuelve lo que se anima cada cuadro (o nada)
export function dress(b: Built, look: Look): ((t: number) => void) | null {
  if (look.skin) for (const [m, l] of b.skin) paint(m, look.skin, l);
  let spin: ((t: number) => void) | null = null;
  if (look.acc) {
    const a = accessory(look.acc), an = a.face ? b.face : b.hat;
    const holder = new THREE.Group();
    holder.position.set(...an.p);
    holder.scale.setScalar(an.s);
    holder.add(a.o);
    an.at.add(holder);
    a.o.traverse(q => { (q as THREE.Mesh).castShadow = true; });
    spin = a.spin ?? null;
  }
  if (look.skin === 'galaxia' || look.skin === 'arcoiris') {
    const t0 = tex(look.skin), s0 = spin;
    spin = (t) => { t0.offset.x = (t * (look.skin === 'arcoiris' ? 0.25 : 0.03)) % 1; s0?.(t); };
  }
  return spin;
}

// ---- La mano y los corazones de las caricias ---------------------------------------------------------------------------
// La mano del jugador (de dibujito: color piel y dedos gorditos que apuntan hacia la nuca de la mascota)
export function glove(): THREE.Group {
  const h = new THREE.Group(), w = mat('#ffd2bb', { roughness: 0.6 });
  ball(0.075, w, 0, 0, 0, h, 1.1, 0.5, 1.15);
  for (let k = 0; k < 4; k++) { const f = mesh(new THREE.CapsuleGeometry(0.02, 0.06, 4, 8), w, -0.05 + k * 0.033, -0.018, -0.105 + Math.abs(k - 1.5) * 0.012, h); f.rotation.x = Math.PI / 2 - 0.45; }
  const th = mesh(new THREE.CapsuleGeometry(0.022, 0.045, 4, 8), w, 0.08, -0.012, -0.02, h); th.rotation.set(Math.PI / 2, 0, 0.9);
  return h;
}
let heartTex: THREE.CanvasTexture | null = null;
export function heartSprite(): THREE.Sprite {
  if (!heartTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    g.translate(32, 34); g.scale(26, -26);
    g.fillStyle = '#ff4f9a';
    const s = heartShape(1).getPoints(24);
    g.beginPath(); s.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(-0.45, 0.45, 0.18, 0, Math.PI * 2); g.fill();
    heartTex = new THREE.CanvasTexture(cv);
    heartTex.colorSpace = THREE.SRGBColorSpace;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
  sp.scale.setScalar(0.2);
  return sp;
}

// ---- Miniaturas (un renderer chico y aparte, que queda vivo: la ruleta de los cofres saca muchas) ---------------------
let tr: { r: THREE.WebGLRenderer, sc: THREE.Scene, cam: THREE.PerspectiveCamera } | null = null;
const thumbCache = new Map<string, string>();
export function petThumb(id: PetId, look: Look = NO_LOOK, size = 200): string {
  const key = `${id}|${look.skin ?? ''}|${look.acc ?? ''}|${size}`;
  const hit = thumbCache.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    if (!tr) {
      const cv = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.NeutralToneMapping;
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      sc.add(new THREE.HemisphereLight('#ffffff', '#ffd9ef', 1.6));
      const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(1.5, 3, 2.5); sc.add(sun);
      tr = { r, sc, cam };
    }
    tr.r.setSize(size, size, false);
    const b = BUILD[id]();
    const spin = dress(b, look);
    b.anim(0.3, { move: 0, mood: 'idle', moodT: 9 });
    spin?.(0.3);
    b.g.position.y = -(b.fly ? 0 : 0.28) - (look.acc && look.acc !== 'lentes' ? 0.04 : 0);
    b.g.rotation.y = -0.45;
    tr.sc.add(b.g);
    tr.cam.position.set(0, 0.25, look.acc && look.acc !== 'lentes' ? 1.8 : 1.65); tr.cam.lookAt(0, 0, 0);
    tr.r.render(tr.sc, tr.cam);
    url = tr.r.domElement.toDataURL('image/png');
    tr.sc.remove(b.g);
    const shared = new Set<THREE.Material>([WHITE, INK, BLUSH]);
    b.g.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mt = m.material as THREE.Material | undefined; if (mt && !shared.has(mt)) mt.dispose(); });
  } catch { /* sin WebGL de sobra: la tienda muestra un círculo */ }
  thumbCache.set(key, url);
  if (thumbCache.size > 240) thumbCache.delete(thumbCache.keys().next().value!); // las más viejas se vuelven a sacar si hacen falta
  return url;
}
export function petThumbs(ids: PetId[], looks: Partial<Record<PetId, Look>> = {}): Partial<Record<PetId, string>> {
  const out: Partial<Record<PetId, string>> = {};
  for (const id of ids) out[id] = petThumb(id, looks[id] ?? NO_LOOK);
  return out;
}
