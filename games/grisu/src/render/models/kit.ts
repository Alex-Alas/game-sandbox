// Piezas para armar modelos por código (las técnicas de las mascotas de FLECHAZO: primitivas, tornos, tubos y
// extrusiones). Todo lo sólido entra en la capa 1 (la del contorno, pixel.ts). Lo de hierro va con sombreado plano
// (caras rectas), lo de latón y tela, liso: así el lenguaje de formas (latón redondo contra hierro angular) sobrevive
// al pixelado.
import * as THREE from 'three';
import type { Toon } from '../toon.ts';

export function solid<T extends THREE.Object3D>(o: T, outline = true): T {
  o.traverse((c) => { c.layers.enable(0); if (outline) c.layers.enable(1); });
  return o;
}

export function mesh(geo: THREE.BufferGeometry, m: Toon | THREE.Material, parent: THREE.Object3D | null, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.set(sx, sy, sz);
  o.layers.enable(1);
  parent?.add(o);
  return o;
}

export function flat(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}

export const sphere = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
export const cyl = (rt: number, rb: number, h: number, n = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const torus = (r: number, t: number, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export const cone = (r: number, h: number, n = 10) => new THREE.ConeGeometry(r, h, n);
// torno: perfil [radio, alto] de abajo hacia arriba
export const lathe = (pts: number[][], n = 14) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), n);
export function tube(pts: number[][], r: number, seg = 16, rs = 6) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(c, seg, r, rs, false);
}
// extrusión de un contorno 2D (x, y) con espesor en z, centrada en z
export function extrude(pts: number[][], depth: number, bevel = 0) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// tela desflecada: un panel (ancho w, largo h) que cuelga hacia −y desde su borde de arriba, con el ruedo en puntas
// y algo curvado (se dobla en z). `teeth` = cantidad de puntas.
export function frayed(w: number, h: number, depth: number, teeth = 4, curve = 0.06, seed = 1) {
  const pts: number[][] = [[-w / 2, 0], [w / 2, 0]];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  pts.push([w / 2 * 0.9, -h * 0.82]);
  for (let i = teeth; i >= 0; i--) {
    const x = -w / 2 + (w * i) / teeth;
    pts.push([x * 0.92, -h * (i % 2 === 0 ? 1 - rnd() * 0.08 : 0.8 + rnd() * 0.05)]);
  }
  pts.push([-w / 2 * 0.9, -h * 0.82]);
  const g = extrude(pts, depth);
  // curva: el centro del panel se va hacia −z (sigue la espalda)
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    p.setZ(i, p.getZ(i) - curve * (1 - x * x));
  }
  g.computeVertexNormals();
  return g;
}

// remaches: una fila de bolitas sobre un arco (centro, radio, ángulos), en el plano xy del padre
export function rivetsArc(parent: THREE.Object3D, m: Toon, n: number, r: number, a0: number, a1: number, rr: number, y = 0, z = 0, axis: 'xy' | 'xz' = 'xz') {
  const g = sphere(rr, 5, 4);
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1);
    if (axis === 'xz') mesh(g, m, parent, Math.sin(a) * r, y, Math.cos(a) * r + z);
    else mesh(g, m, parent, Math.cos(a) * r, Math.sin(a) * r + y, z);
  }
}

// un miembro: cilindro que va desde el origen del joint hacia −y, con el largo dado
export function limb(parent: THREE.Object3D, m: Toon, len: number, r0: number, r1: number, n = 8) {
  const g = cyl(r1, r0, len, n);
  g.translate(0, -len / 2, 0);
  return mesh(g, m, parent);
}

// sombra de contacto en el piso (no tiene contorno; disco oscuro achatado)
export function contactShadow(parent: THREE.Object3D, rx: number, rz: number, m: Toon) {
  const o = mesh(new THREE.CircleGeometry(1, 16), m, parent, 0, 0.012, 0, -Math.PI / 2, 0, 0, rx, rz, 1);
  o.layers.disable(1);
  return o;
}
