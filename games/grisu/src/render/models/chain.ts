// Cadena: Verlet a 120 Hz entre dos puntos sujetos (la argolla del ancla y la mano o el cinturón), dibujada como
// eslabones de latón alternados. Las posiciones viven en el mundo y los eslabones, en el grupo que se pasa (se
// convierten a su espacio al muestrear, en el cuadro del cuerpo: la cadena cambia junto con el dibujo).
import * as THREE from 'three';
import type { Toon } from '../toon.ts';
import { mesh, torus } from './kit.ts';

export class Chain {
  p: THREE.Vector3[] = []; q: THREE.Vector3[] = [];
  links: THREE.Mesh[] = [];
  a = new THREE.Vector3(); b = new THREE.Vector3();   // extremos (mundo)
  len: number; init = false;
  group: THREE.Object3D;
  constructor(group: THREE.Object3D, m: Toon, n: number, len: number, linkR = 0.035) {
    this.group = group; this.len = len;
    const g = torus(linkR, linkR * 0.32, 4, 8);
    for (let i = 0; i < n; i++) { this.p.push(new THREE.Vector3()); this.q.push(new THREE.Vector3()); }
    for (let i = 0; i < n - 1; i++) this.links.push(mesh(g, m, group, 0, 0, 0, 0, 0, 0, 1, 1.6, 1));
  }
  step(dt: number, g = 18) {
    const n = this.p.length;
    if (!this.init) { for (let i = 0; i < n; i++) { this.p[i].lerpVectors(this.a, this.b, i / (n - 1)); this.q[i].copy(this.p[i]); } this.init = true; }
    const L = Math.max(this.len, this.a.distanceTo(this.b) * 1.01) / (n - 1);
    for (let i = 1; i < n - 1; i++) {
      const p = this.p[i], q = this.q[i];
      const vx = (p.x - q.x) * 0.985, vy = (p.y - q.y) * 0.985, vz = (p.z - q.z) * 0.985;
      q.copy(p);
      p.x += vx; p.y += vy - g * dt * dt; p.z += vz;
    }
    this.p[0].copy(this.a); this.p[n - 1].copy(this.b);
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n - 1; i++) {
        const a = this.p[i], b = this.p[i + 1];
        const d = b.clone().sub(a), l = d.length() || 1e-6, k = (l - L) / l;
        const wa = i === 0 ? 0 : 0.5, wb = i + 1 === n - 1 ? 0 : 0.5;
        const s = wa + wb || 1;
        a.addScaledVector(d, (k * wa) / s); b.addScaledVector(d, (-k * wb) / s);
      }
    }
    // si un salto de lugar la estiró de golpe, se rearma
    if (this.p[1].distanceTo(this.a) > L * 4) this.init = false;
  }
  sample() {
    const v = new THREE.Vector3(), w = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      v.copy(this.p[i]).applyMatrix4(inv); w.copy(this.p[i + 1]).applyMatrix4(inv);
      l.position.copy(v).add(w).multiplyScalar(0.5);
      const d = w.clone().sub(v).normalize();
      l.quaternion.setFromUnitVectors(up, d);
      l.rotateY(i % 2 ? Math.PI / 2 : 0);
    }
  }
}
