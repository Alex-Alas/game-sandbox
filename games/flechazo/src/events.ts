// Eventos al azar dentro de un nivel: cumplirlo da un COFRE de estilos para las mascotas, que se lleva solo si se pasa el
// nivel (si se pierde o se reinicia, se pierde). Uno por nivel como mucho, y solo con una mascota adoptada (los estilos
// son para ellas):
// - FLECHA DORADA: una flecha (de las trabadas, si hay) se vuelve dorada. Liberarla sin que choque da el cofre; si choca,
//   pierde el brillo.
// - CHISPITA: una estrellita con alas aparece en tu isla y salta escapándose (también por encima de las flechas). Hay que
//   tocarla antes de que se vaya.
// - SENDERO: anillos dorados en el aire, a distintas alturas y uno detrás de otro; hay que pasar por todos a tiempo
//   (saltando, y mejor por arriba de las flechas que rodeándolas).
import * as THREE from 'three';

export type EvKind = 'gold' | 'catch' | 'trail';
export const EV_KINDS: EvKind[] = ['gold', 'catch', 'trail'];
export const EV_P = 0.55;                 // probabilidad de que un nivel tenga evento
export const CATCH_T = 30, TRAIL_N = 6;   // segundos para atrapar a la chispita; anillos del sendero
export const trailTime = (n: number) => 8 + n * 4.5;
const GOLD = new THREE.Color('#ffcf3a');

// Lo que el evento necesita del nivel (main.ts lo arma cada cuadro)
export type EvWorld = {
  px: number, py: number, pz: number, yaw: number,
  free: (x: number, z: number) => boolean,   // piso firme de la isla del jugador, lejos del vacío
  groundAt: (x: number, z: number) => number, // altura del piso o de la flecha que hay ahí
};
export type EvOut = { k: 'won' | 'fail' | 'ring', n?: number, x?: number, y?: number, z?: number };

// La chispita: una estrella gordita y brillante con alitas y ojos
function chispita(): { g: THREE.Group, wings: THREE.Object3D[], body: THREE.Mesh } {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.13 : 0.27; shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3 });
  geo.translate(0, 0, -0.06);
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: new THREE.Color('#ffb31a'), emissiveIntensity: 0.9, roughness: 0.35 }));
  body.castShadow = true;
  g.add(body);
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), ink = new THREE.MeshStandardMaterial({ color: '#1d1b3a', roughness: 0.25 });
  for (const sx of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), white); e.position.set(sx * 0.07, 0.03, 0.12); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), ink); p.position.set(sx * 0.07, 0.03, 0.155); g.add(p);
  }
  const wm = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color('#fff4c2'), emissiveIntensity: 0.6 });
  const wings = [1, -1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.12, 0.08, -0.05); const m = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), wm); m.position.x = sx * 0.11; m.scale.set(1, 0.6, 1); w.add(m); g.add(w); return w; });
  return { g, wings, body };
}

// Un anillo del sendero
function ring(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 12, 40), new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: new THREE.Color('#ffb31a'), emissiveIntensity: 0.8, roughness: 0.3, transparent: true }));
  m.castShadow = true;
  return m;
}

export class LevelEvent {
  readonly kind: EvKind; readonly root = new THREE.Group();
  state: 'wait' | 'on' | 'won' | 'fail' = 'wait'; at: number; t = 0;
  gold = -1;                                                       // FLECHA DORADA
  ch: ReturnType<typeof chispita> | null = null; cx = 0; cy = 0; cz = 0; hop = { x0: 0, z0: 0, y0: 0, x1: 0, z1: 0, y1: 0, t: 1, d: 0.45 }; flee = 0; // CHISPITA
  rings: { m: THREE.Mesh, x: number, y: number, z: number, got: boolean }[] = []; next = 0; // SENDERO
  constructor(kind: EvKind, at: number) { this.kind = kind, this.at = at; }
  get limit() { return this.kind === 'catch' ? CATCH_T : this.kind === 'trail' ? trailTime(this.rings.length || TRAIL_N) : Infinity; }
  get left() { return Math.max(0, this.limit - this.t); }

  // Arranca la chispita o el sendero alrededor del jugador (false si no hay lugar)
  begin(w: EvWorld): boolean {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    if (this.kind === 'catch') {
      for (let k = 0; k < 80; k++) {
        const a = Math.random() * Math.PI * 2, d = rnd(5, 11), x = w.px + Math.cos(a) * d, z = w.pz + Math.sin(a) * d;
        if (!w.free(x, z)) continue;
        this.ch = chispita();
        this.cx = x, this.cz = z, this.cy = w.groundAt(x, z);
        Object.assign(this.hop, { x0: x, z0: z, y0: this.cy, x1: x, z1: z, y1: this.cy, t: 1 });
        this.root.add(this.ch.g);
        return true;
      }
      return false;
    }
    if (this.kind === 'trail') {
      // empieza delante del jugador y sigue más o menos derecho, con alturas que suben y bajan
      let x = w.px, z = w.pz, dir = -w.yaw + Math.PI, y = 2;
      for (let n = 0; n < TRAIL_N; n++) {
        let ok = false;
        for (let k = 0; k < 60 && !ok; k++) {
          const a = n === 0 ? Math.atan2(-Math.cos(w.yaw), -Math.sin(w.yaw)) + rnd(-0.5, 0.5) : dir + rnd(-1.1, 1.1) * (1 + k / 30), d = n === 0 ? rnd(3, 4.5) : rnd(3.6, 5.2);
          const nx = x + Math.cos(a) * d, nz = z + Math.sin(a) * d;
          if (!w.free(nx, nz) || this.rings.some(r => Math.hypot(r.x - nx, r.z - nz) < 2.5)) continue;
          const ny = Math.min(3.4, Math.max(1.7, y + rnd(-0.8, 0.9)));
          const m = ring();
          m.position.set(nx, ny, nz);
          this.rings.push({ m, x: nx, y: ny, z: nz, got: false });
          this.root.add(m);
          dir = a, x = nx, z = nz, y = ny, ok = true;
        }
        if (!ok) break;
      }
      if (this.rings.length < 4) { for (const r of this.rings) this.root.remove(r.m); this.rings = []; return false; }
      // cada anillo mira hacia el siguiente
      this.rings.forEach((r, i) => { const o = this.rings[Math.min(i + 1, this.rings.length - 1)], p = this.rings[Math.max(0, i - 1)]; r.m.rotation.y = Math.atan2(o.x - p.x, o.z - p.z); });
      return true;
    }
    return true;
  }

  // Un paso; devuelve lo que pasó (o null)
  update(dt: number, w: EvWorld, emit: (x: number, y: number, z: number, c: THREE.Color, n: number) => void): EvOut | null {
    if (this.state !== 'on') return null;
    this.t += dt;
    const T = performance.now() / 1000;
    if (this.kind === 'catch' && this.ch) {
      const h = this.hop, c = this.ch;
      h.t += dt / h.d;
      if (h.t >= 1.25) { // aterrizó y descansó un toque: otro salto (escapándose si estás cerca)
        const dx = this.cx - w.px, dz = this.cz - w.pz, dd = Math.hypot(dx, dz), near = dd < 5.5;
        let best: [number, number] | null = null, bs = -Infinity;
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2, d = near ? 1.3 + Math.random() * 0.5 : 0.6 + Math.random() * 0.8, nx = this.cx + Math.cos(a) * d, nz = this.cz + Math.sin(a) * d;
          if (!w.free(nx, nz)) continue;
          const s = near ? Math.hypot(nx - w.px, nz - w.pz) + Math.random() * 0.6 : Math.random();
          if (s > bs) bs = s, best = [nx, nz];
        }
        // se cansa: con el tiempo salta más corto y descansa más
        const tired = Math.min(1, this.t / CATCH_T);
        Object.assign(h, { x0: this.cx, z0: this.cz, y0: this.cy, t: 0, d: 0.42 + tired * 0.18 });
        if (best) h.x1 = best[0], h.z1 = best[1], h.y1 = w.groundAt(best[0], best[1]); else h.x1 = this.cx, h.z1 = this.cz, h.y1 = this.cy;
        if (near) this.flee = 0.5;
      }
      const u = Math.min(1, h.t);
      this.cx = h.x0 + (h.x1 - h.x0) * u, this.cz = h.z0 + (h.z1 - h.z0) * u;
      this.cy = h.y0 + (h.y1 - h.y0) * u + Math.sin(u * Math.PI) * (0.6 + Math.abs(h.y1 - h.y0) * 0.5);
      c.g.position.set(this.cx, this.cy + 0.35 + Math.sin(T * 6) * 0.04, this.cz);
      c.g.rotation.y = Math.atan2(w.px - this.cx, w.pz - this.cz) + Math.sin(T * 3) * 0.3;
      c.body.rotation.z = Math.sin(T * 4) * 0.25;
      const f = Math.sin(T * 40) * 0.7;
      c.wings[0].rotation.y = f, c.wings[1].rotation.y = -f;
      if (Math.random() < dt * 14) emit(this.cx, this.cy + 0.35, this.cz, GOLD, 1);
      // ¡atrapada!
      if (Math.hypot(this.cx - w.px, this.cz - w.pz) < 0.95 && this.cy + 0.35 > w.py - 0.4 && this.cy + 0.35 < w.py + 2.1) {
        this.state = 'won';
        const o = { k: 'won' as const, x: this.cx, y: this.cy + 0.35, z: this.cz };
        this.root.remove(c.g);
        return o;
      }
      if (this.t >= CATCH_T) { this.state = 'fail'; return { k: 'fail', x: this.cx, y: this.cy, z: this.cz }; }
    }
    if (this.kind === 'trail') {
      this.rings.forEach((r, i) => {
        const on = i === this.next, mt = r.m.material as THREE.MeshStandardMaterial;
        if (r.got) { r.m.scale.multiplyScalar(1 + dt * 4); mt.opacity = Math.max(0, mt.opacity - dt * 3); r.m.visible = mt.opacity > 0.01; return; }
        mt.opacity = on ? 1 : 0.35;
        mt.emissiveIntensity = on ? 0.9 + Math.sin(T * 7) * 0.35 : 0.3;
        r.m.scale.setScalar(on ? 1 + Math.sin(T * 5) * 0.06 : 0.85);
        r.m.position.y = r.y + Math.sin(T * 2 + i) * 0.06;
      });
      const r = this.rings[this.next];
      if (r && Math.hypot(r.x - w.px, r.z - w.pz) < 1.05 && r.y > w.py + 0.15 && r.y < w.py + 2.3) {
        r.got = true, this.next++;
        emit(r.x, r.y, r.z, GOLD, 26);
        if (this.next >= this.rings.length) { this.state = 'won'; return { k: 'won', x: r.x, y: r.y, z: r.z }; }
        return { k: 'ring', n: this.next, x: r.x, y: r.y, z: r.z };
      }
      if (this.t >= this.limit) { this.state = 'fail'; return { k: 'fail' }; }
    }
    return null;
  }

  // Hacia dónde ir (para el minimapa y la columna de luz)
  mark(): { x: number, z: number, y: number } | null {
    if (this.state !== 'on') return null;
    if (this.kind === 'catch') return { x: this.cx, z: this.cz, y: this.cy + 0.6 };
    if (this.kind === 'trail') { const r = this.rings[this.next]; return r ? { x: r.x, z: r.z, y: r.y + 0.6 } : null; }
    return null;
  }
  // Al fallar: la chispita se va volando y los anillos se apagan (se lo llama cada cuadro hasta que devuelve false)
  fade(dt: number): boolean {
    let alive = false;
    if (this.ch && this.ch.g.parent) { this.ch.g.position.y += dt * 6; this.ch.g.rotation.y += dt * 10; alive = this.ch.g.position.y < 30; if (!alive) this.root.remove(this.ch.g); }
    for (const r of this.rings) { const mt = r.m.material as THREE.MeshStandardMaterial; mt.opacity = Math.max(0, mt.opacity - dt * 1.5); r.m.visible = mt.opacity > 0.01; alive ||= r.m.visible; }
    return alive;
  }
  dispose() { this.root.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); }); }
}
