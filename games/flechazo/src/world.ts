// La escena: un tablero blanco con puntos que flota en un cielo pastel (como estar adentro de la pantalla del juego de
// flechas), niebla que marca hasta dónde se ve, sol con sombras que sigue al jugador, nubes y flechas gigantes lejanas,
// partículas y los marcadores (columnas de luz que se ven a través de la niebla).
import * as THREE from 'three';
import { C, MARGIN } from './sim/const.ts';
import { arrowMesh, type V2 } from './sim/geom.ts';
import type { Board } from './sim/puzzle.ts';
import type { Lim } from './sim/body.ts';

export const FOG_COLOR = new THREE.Color('#f2dcf6');
const SKY_TOP = new THREE.Color('#6f9dff'), SKY_MID = new THREE.Color('#bba9ff');

export function toGeometry(m: { pos: Float32Array, nrm: Float32Array, col: Float32Array, idx: Uint32Array }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ---- Partículas (un solo Points; posiciones y colores en la CPU) ------------------------------------------------------
const NP = 900;
class Particles {
  pts: THREE.Points; pos = new Float32Array(NP * 3); col = new Float32Array(NP * 3); size = new Float32Array(NP); alpha = new Float32Array(NP);
  vel = new Float32Array(NP * 3); life = new Float32Array(NP); max = new Float32Array(NP); s0 = new Float32Array(NP); grav = new Float32Array(NP);
  next = 0;
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.25, r) * vA; gl_FragColor = vec4(vC + (1.0 - r * 2.0) * 0.25, a); }`,
    });
    this.pts = new THREE.Points(g, m);
    this.pts.frustumCulled = false;
  }
  emit(x: number, y: number, z: number, color: THREE.Color, n: number, o: { speed?: number, up?: number, size?: number, life?: number, grav?: number, spread?: number } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.next = (this.next + 1) % NP, sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8), a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      const s = o.spread ?? 0;
      this.pos.set([x + (Math.random() - 0.5) * s, y + (Math.random() - 0.5) * s * 0.5, z + (Math.random() - 0.5) * s], i * 3);
      this.vel.set([Math.cos(a) * Math.cos(e) * sp, Math.abs(Math.sin(e)) * sp + (o.up ?? 2), Math.sin(a) * Math.cos(e) * sp], i * 3);
      const l = Math.random() * 0.15 + 0.85;
      this.col.set([Math.min(1, color.r * l + 0.08), Math.min(1, color.g * l + 0.08), Math.min(1, color.b * l + 0.08)], i * 3);
      this.max[i] = this.life[i] = (o.life ?? 0.9) * (0.6 + Math.random() * 0.6);
      this.s0[i] = (o.size ?? 0.16) * (0.6 + Math.random() * 0.8);
      this.grav[i] = o.grav ?? 9;
    }
  }
  update(dt: number) {
    for (let i = 0; i < NP; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      for (let a = 0; a < 3; a++) { this.vel[i * 3 + a] *= 1 - 1.2 * dt; this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; }
      if (this.pos[i * 3 + 1] < 0.03) this.pos[i * 3 + 1] = 0.03, this.vel[i * 3 + 1] *= -0.4;
      this.alpha[i] = Math.min(1, f * 2.2);
      this.size[i] = this.s0[i] * (0.5 + f * 0.5);
    }
    const g = this.pts.geometry;
    for (const k of ['position', 'color', 'size', 'alpha']) (g.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

// ---- Marcador: anillo en el piso, columna de luz y un chevrón que baja y sube ------------------------------------------
export class Marker {
  g = new THREE.Group(); ring: THREE.Mesh; beam: THREE.Mesh; chev: THREE.Mesh; color = new THREE.Color(); t = Math.random() * 6;
  constructor() {
    const mat = () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), mat());
    this.ring.rotation.x = -Math.PI / 2, this.ring.position.y = 0.04;
    const bg = new THREE.CylinderGeometry(0.42, 0.42, 26, 20, 1, true);
    bg.translate(0, 13, 0);
    const a = new Float32Array(bg.attributes.position.count);
    for (let i = 0; i < a.length; i++) a[i] = 1 - bg.attributes.position.getY(i) / 26;
    bg.setAttribute('fade', new THREE.BufferAttribute(a, 1));
    this.beam = new THREE.Mesh(bg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { color: { value: this.color }, k: { value: 0.5 } },
      vertexShader: 'attribute float fade; varying float vF; void main() { vF = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float k; varying float vF; void main() { gl_FragColor = vec4(color, vF * vF * k); }',
    }));
    const cg = new THREE.ConeGeometry(0.42, 0.6, 4);
    cg.rotateX(Math.PI);
    this.chev = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ fog: false }));
    this.g.add(this.ring, this.beam, this.chev);
  }
  set(x: number, z: number, y: number, hex: string) {
    this.g.position.set(x, 0, z);
    this.chev.userData.y = y;
    this.color.set(hex);
    (this.ring.material as THREE.MeshBasicMaterial).color.copy(this.color);
    (this.chev.material as THREE.MeshBasicMaterial).color.copy(this.color);
  }
  update(dt: number) {
    this.t += dt;
    const y = (this.chev.userData.y as number) ?? 1;
    this.chev.position.y = y + 1.4 + Math.sin(this.t * 3) * 0.25;
    this.chev.rotation.y += dt * 1.5;
    const s = 1 + Math.sin(this.t * 4) * 0.08;
    this.ring.scale.set(s, s, s);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(this.t * 4) * 0.2;
    ((this.beam.material as THREE.ShaderMaterial).uniforms.k.value as number) = 0.42 + Math.sin(this.t * 2.5) * 0.1;
  }
}

export type Quality = 'alta' | 'baja';
export class World {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; fx = new Particles(); board = new THREE.Group(); deco = new THREE.Group();
  fog: THREE.Fog; fogFar = 20; fogT = 20; quality: Quality;
  traj: THREE.InstancedMesh; trajN = 0;

  constructor(cv: HTMLCanvasElement, q: Quality) {
    this.quality = q;
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: q === 'alta', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = q === 'alta';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.fog = new THREE.Fog(FOG_COLOR, 6, 20);
    this.scene.fog = this.fog;
    this.scene.background = FOG_COLOR;
    this.hemi = new THREE.HemisphereLight('#efeaff', '#ffe6f4', 1.25);
    this.sun = new THREE.DirectionalLight('#fff4e6', 2.1);
    this.sun.castShadow = q === 'alta';
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -24, sc.right = sc.top = 24, sc.near = 1, sc.far = 90;
    this.sun.shadow.bias = -0.0006, this.sun.shadow.normalBias = 0.03, this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.board, this.deco, this.fx.pts);
    this.scene.add(this.sky());
    this.clouds();
    const tg = new THREE.CircleGeometry(0.13, 12);
    tg.rotateX(-Math.PI / 2);
    this.traj = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }), 80);
    this.traj.count = 0, this.traj.frustumCulled = false;
    this.scene.add(this.traj);
    this.resize();
  }

  // fov: ángulo vertical; con la pantalla parada se abre lo necesario para ver al menos 60° de costado a costado
  resize(fov = 70) {
    const w = innerWidth, h = innerHeight, a = w / h;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality === 'alta' ? 2 : 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = a;
    const need = (2 * Math.atan(Math.tan(Math.PI / 6) / a) * 180) / Math.PI;
    this.camera.fov = Math.min(100, Math.max(fov, need));
    this.camera.updateProjectionMatrix();
    (this.fx.pts.material as THREE.ShaderMaterial).uniforms.scale.value = h * this.renderer.getPixelRatio() * 0.6;
  }

  private sky() {
    const g = new THREE.SphereGeometry(600, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: SKY_TOP }, mid: { value: SKY_MID }, hor: { value: FOG_COLOR } },
      vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP;
        void main() { float y = vP.y; vec3 c = y > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.25, 0.9, y)), smoothstep(0.0, 0.35, y)) : mix(hor, vec3(0.96, 0.9, 1.0), smoothstep(0.0, -0.5, y));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const s = new THREE.Mesh(g, m);
    s.renderOrder = -10, s.frustumCulled = false;
    this.skyMesh = s;
    return s;
  }
  skyMesh: THREE.Mesh | null = null;

  // Nubes de algodón alrededor y debajo del tablero, y flechas gigantes que dan vueltas a lo lejos (sin niebla)
  private clouds() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const puffs: THREE.Matrix4[] = [];
    for (let c = 0; c < 26; c++) {
      const a = rnd() * Math.PI * 2, r = 120 + rnd() * 160, y = -50 + rnd() * 70, s = 7 + rnd() * 12;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      for (let p = 0; p < 7; p++) {
        const m = new THREE.Matrix4(), k = s * (0.5 + rnd() * 0.6);
        m.compose(new THREE.Vector3(cx + (rnd() - 0.5) * s * 2.6, y + (rnd() - 0.3) * s * 0.5, cz + (rnd() - 0.5) * s * 1.4),
          new THREE.Quaternion(), new THREE.Vector3(k, k * 0.72, k));
        puffs.push(m);
      }
    }
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3),
      new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#e9e0ff', emissiveIntensity: 0.55, fog: false }), puffs.length);
    puffs.forEach((m, i) => im.setMatrixAt(i, m));
    this.deco.add(im);
    const cols = ['#9f8bff', '#ff9ad5', '#8fc3ff', '#ffc98f', '#a5f0d0'];
    for (let k = 0; k < 6; k++) {
      const P: V2[] = [[0, 0], [16, 0], [16, 12], [32, 12]].map(([x, z]) => [x - 16, z - 6] as V2);
      const c = new THREE.Color(cols[k % cols.length]);
      const g = toGeometry(arrowMesh(P, [c.r, c.g, c.b]));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
      const holder = new THREE.Group();
      m.position.set(200 + k * 30, 40 + rnd() * 80, 0);
      m.scale.setScalar(4.5 + rnd() * 2.5);
      m.rotation.set(rnd() * 0.6, rnd() * 6, rnd() * 0.4);
      holder.rotation.y = (k / 6) * Math.PI * 2;
      holder.userData.spin = (rnd() < 0.5 ? -1 : 1) * (0.008 + rnd() * 0.01);
      holder.add(m);
      this.deco.add(holder);
    }
  }

  // El tablero: losa redondeada con el piso dibujado (puntos donde hay celdas) y un borde bajo
  buildBoard(b: Board, ox: number, oz: number, lim: Lim) {
    for (const o of [...this.board.children]) {
      this.board.remove(o);
      o.traverse(q => { const m = q as THREE.Mesh, mt = m.material as THREE.MeshStandardMaterial | undefined; m.geometry?.dispose(); mt?.map?.dispose(); mt?.dispose?.(); });
    }
    const W = lim.x1 - lim.x0, H = lim.z1 - lim.z0, rr = C * 0.75;
    const ppm = Math.min(28, 2048 / Math.max(W, H)), cw = Math.round(W * ppm), ch = Math.round(H * ppm);
    const cv = document.createElement('canvas');
    cv.width = cw, cv.height = ch;
    const g = cv.getContext('2d')!;
    const px = (x: number) => (x - lim.x0) * ppm, pz = (z: number) => (z - lim.z0) * ppm;
    g.fillStyle = '#fcfbff';
    g.beginPath(); g.roundRect(0, 0, cw, ch, rr * ppm); g.fill();
    // la zona de juego, un poco más lila; con figura, solo sus celdas
    g.fillStyle = '#f3f0ff';
    if (b.mask) {
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.mask[y * b.w + x]) g.fillRect(px(ox + (x - 0.5) * C) - 0.5, pz(oz + (y - 0.5) * C) - 0.5, C * ppm + 1, C * ppm + 1);
    } else {
      g.beginPath(); g.roundRect(px(ox - C / 2), pz(oz - C / 2), b.w * C * ppm, b.h * C * ppm, C * 0.3 * ppm); g.fill();
    }
    g.fillStyle = '#c9c6e2';
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (b.mask && !b.mask[y * b.w + x]) continue;
      g.beginPath(); g.arc(px(ox + x * C), pz(oz + y * C), Math.max(1.6, 0.075 * ppm), 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#c6d2fb'; g.lineWidth = 0.32 * ppm;
    g.beginPath(); g.roundRect(0.18 * ppm, 0.18 * ppm, cw - 0.36 * ppm, ch - 0.36 * ppm, rr * ppm - 0.18 * ppm); g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, alphaTest: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((lim.x0 + lim.x1) / 2, 0, (lim.z0 + lim.z1) / 2);
    floor.receiveShadow = true;
    // losa (el canto que se ve desde el borde) y el borde bajo
    const shape = (x0: number, z0: number, x1: number, z1: number, r: number) => {
      const s = new THREE.Shape();
      s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
      s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
      return s;
    };
    const slabG = new THREE.ExtrudeGeometry(shape(lim.x0, lim.z0, lim.x1, lim.z1, rr), { depth: 1.6, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 3, curveSegments: 10 });
    slabG.rotateX(Math.PI / 2);
    const slab = new THREE.Mesh(slabG, new THREE.MeshStandardMaterial({ color: '#d8d0ff', roughness: 0.7 }));
    slab.position.y = -0.33; // el bisel sobresale 0,3 de la tapa
    const rim = shape(lim.x0 - 0.05, lim.z0 - 0.05, lim.x1 + 0.05, lim.z1 + 0.05, rr);
    rim.holes.push(shape(lim.x0 + 0.22, lim.z0 + 0.22, lim.x1 - 0.22, lim.z1 - 0.22, rr - 0.25));
    const rimG = new THREE.ExtrudeGeometry(rim, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 10 });
    rimG.rotateX(-Math.PI / 2);
    const rimM = new THREE.Mesh(rimG, new THREE.MeshStandardMaterial({ color: '#b9c7ff', roughness: 0.5 }));
    rimM.castShadow = rimM.receiveShadow = true;
    this.board.add(floor, slab, rimM);
    void MARGIN;
  }

  setFog(far: number, instant = false) { this.fogT = far; if (instant) this.fogFar = far; }

  // Puntitos sobre el piso por donde iría la punta de la flecha apuntada (mejora de visibilidad)
  setTrajectory(pts: V2[] | null, hex = '#ffffff') {
    const n = pts ? Math.min(pts.length, this.traj.instanceMatrix.count) : 0;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m.makeTranslation(pts![i][0], 0.03, pts![i][1]); this.traj.setMatrixAt(i, m); }
    this.traj.count = n;
    this.traj.instanceMatrix.needsUpdate = true;
    (this.traj.material as THREE.MeshBasicMaterial).color.set(hex);
  }

  follow(x: number, z: number, dt: number) {
    this.sun.position.set(x + 14, 30, z + 9);
    this.sun.target.position.set(x, 0, z);
    this.fogFar += (this.fogT - this.fogFar) * Math.min(1, dt * 2);
    this.fog.far = this.fogFar;
    this.fog.near = this.fogFar * 0.32;
    if (this.skyMesh) this.skyMesh.position.copy(this.camera.position);
    for (const h of this.deco.children) if (h.userData.spin) h.rotation.y += h.userData.spin * dt;
    this.deco.position.set(x * 0.6, 0, z * 0.6);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
