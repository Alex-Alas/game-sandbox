// Las flechas en 3D. Cada una es una malla propia (su geometría se rehace cada cuadro solo mientras se mueve) sobre su
// «vía»: el camino de la cola a la punta y después la recta de la punta, alargada mucho más allá del borde. `s` es cuánto
// avanzó: la flecha visible es el tramo [s, s + L] de la vía. Al salir libre acelera, cruza el borde y se eleva al cielo
// desvaneciéndose; si está trabada avanza hasta tocar a la otra (`sHit`), rebota y vuelve a su lugar.
import * as THREE from 'three';
import { C, MARGIN, HEAD_F, HW } from './sim/const.ts';
import { arrowMesh, clip, plen, pointAt, type V2 } from './sim/geom.ts';
import { dirOf, rayOf, cx, cy, DX, DY, type Arrow, type Board } from './sim/puzzle.ts';
import { toGeometry } from './world.ts';

export const COLORS = ['#7b5cff', '#ff4fb8', '#ff8a1f', '#16c47f', '#4a78ff', '#e8344e', '#11b5c4', '#ffbf1a', '#a445ff', '#ff6a5a'];
const ACC = 70, VMAX = 26, BACK = 9;

export type ArrowEv = { k: 'hit', id: number, by: number, at: V2 } | { k: 'home', id: number } | { k: 'gone', id: number } | { k: 'edge', id: number };
type Mode = 'rest' | 'out' | 'fly' | 'bump' | 'wait' | 'back' | 'done';

export class ArrowView {
  readonly a: Arrow; readonly id: number; readonly mesh: THREE.Mesh; readonly mat: THREE.MeshStandardMaterial;
  readonly track: V2[]; readonly L: number; readonly hex: string; readonly color: THREE.Color; readonly sGrid: number; readonly sEdge: number;
  s = 0; v = 0; mode: Mode = 'rest'; sHit = 0; by = -1; wait = 0; flash = 0; glow = 0; lit = false; edged = false;

  constructor(b: Board, ox: number, oz: number, a: Arrow) {
    this.a = a, this.id = a.id;
    this.hex = COLORS[a.c % COLORS.length];
    this.color = new THREE.Color(this.hex);
    const P: V2[] = a.cells.map(i => [ox + cx(b, i) * C, oz + cy(b, i) * C]);
    this.L = plen(P);
    const d = dirOf(b, a), ray = rayOf(b, a).length, h = P[P.length - 1];
    this.sGrid = (ray + 0.5) * C;        // la punta sale de la zona de las celdas
    this.sEdge = this.sGrid + MARGIN * C; // y cruza el borde del piso
    const far = this.sEdge + this.L + 60;
    this.track = [...P, [h[0] + DX[d] * far, h[1] + DY[d] * far]];
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0, emissive: new THREE.Color(0) });
    this.mesh = new THREE.Mesh(this.geometry(), this.mat);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.userData.id = a.id;
  }
  private geometry() { return toGeometry(arrowMesh(this.poly(), [this.color.r, this.color.g, this.color.b])); }
  private rebuild() { const old = this.mesh.geometry; this.mesh.geometry = this.geometry(); old.dispose(); }

  poly(): V2[] { return clip(this.track, this.s, this.s + this.L); }
  headAt() { return pointAt(this.track, this.s + this.L); }
  get moving() { return this.mode !== 'rest' && this.mode !== 'done'; }

  // Libre: sale. Trabada (k = celdas libres antes del choque): avanza hasta tocar a la otra y vuelve
  release(hit: { id: number, k: number } | null) {
    this.v = 0;
    if (!hit) { this.mode = 'out'; return; }
    this.mode = 'bump', this.by = hit.id;
    this.sHit = hit.k * C + Math.max(0.25, C - HEAD_F - HW - 0.06);
  }

  update(dt: number, out: ArrowEv[]) {
    const m = this.mode;
    if (m === 'out' || m === 'fly' || m === 'bump') {
      this.v = Math.min(VMAX, this.v + ACC * dt);
      this.s += this.v * dt;
      if (m === 'bump' && this.s >= this.sHit) {
        this.s = this.sHit, this.mode = 'wait', this.wait = 0.16, this.flash = 1;
        const hp = this.headAt();
        out.push({ k: 'hit', id: this.id, by: this.by, at: [hp.p[0] + hp.t[0] * HEAD_F, hp.p[1] + hp.t[1] * HEAD_F] });
      }
      if (m !== 'bump' && this.s > this.sEdge) {
        if (!this.edged) this.edged = true, out.push({ k: 'edge', id: this.id });
        this.mode = 'fly';
        const e = this.s - this.sEdge;
        this.mesh.position.y = 0.025 * e * e;
        const fade = 1 - Math.max(0, e - this.L - 4) / 14;
        if (!this.mat.transparent) this.mat.transparent = true, this.mat.depthWrite = false, this.mat.needsUpdate = true, this.mesh.castShadow = false;
        this.mat.opacity = Math.max(0, fade);
        if (fade <= 0) { this.mode = 'done', this.mesh.visible = false; out.push({ k: 'gone', id: this.id }); }
      }
      this.rebuild();
    } else if (m === 'wait') {
      if ((this.wait -= dt) <= 0) this.mode = 'back', this.v = 0;
    } else if (m === 'back') {
      this.v = Math.min(BACK, this.v + 30 * dt);
      this.s = Math.max(0, this.s - this.v * dt * Math.min(1, 0.25 + this.s * 0.6));
      if (this.s <= 1e-3) { this.s = 0, this.mode = 'rest'; out.push({ k: 'home', id: this.id }); }
      this.rebuild();
    }
    // brillo: apuntada (pulsa) o roja tras un choque
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.glow += ((this.lit ? 1 : 0) - this.glow) * Math.min(1, dt * 14);
    const t = performance.now() / 1000;
    if (this.flash > 0) this.mat.emissive.setRGB(0.9 * this.flash, 0.05 * this.flash, 0.15 * this.flash);
    else this.mat.emissive.copy(this.color).multiplyScalar(this.glow * (0.32 + Math.sin(t * 9) * 0.1));
  }

  // Puntos cada medio metro desde la punta hasta el borde del piso (para la trayectoria)
  trajectory(): V2[] {
    const h = this.headAt(), out: V2[] = [];
    for (let d = HEAD_F + 0.4; d < this.sGrid; d += 0.55) out.push([h.p[0] + h.t[0] * d, h.p[1] + h.t[1] * d]);
    return out;
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
