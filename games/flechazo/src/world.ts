// La escena: un tablero blanco con puntos que flota en un cielo pastel (como estar adentro de la pantalla del juego de
// flechas), niebla que marca hasta dónde se ve, sol con sombras que sigue al jugador, nubes y flechas gigantes lejanas,
// partículas, los marcadores (columnas de luz que se ven a través de la niebla) y los portales entre islas.
// Calidad (`PRESET`): ALTA (bordes suavizados, sombras 2048, hasta 2× de resolución), MEDIA (lo de los teléfonos: sin
// suavizado, sombras 1024, hasta 1,5×, nubes más simples, menos partículas) y BAJA (sin sombras, 1×). Encima, resolución
// adaptativa (`adapt`): si los cuadros tardan, baja la resolución hasta `minScale` y con margen la vuelve a subir. Lo que
// llena la pantalla de transparencias pegado a la cámara se apaga: las columnas de luz de portales y marcadores cuando
// estás adentro y las partículas que pasan rozando el ojo (en un teléfono eso es lo que más cuesta: cada píxel se pinta
// varias veces).
import * as THREE from 'three';
import { C, MARGIN } from './sim/const.ts';
import { arrowMesh, type V2 } from './sim/geom.ts';
import type { Board } from './sim/puzzle.ts';
import type { Lim } from './sim/body.ts';
import { PAD_R, type Ground } from './sim/ground.ts';
import { newRes, adaptRes } from './sim/res.ts';

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
      uniforms: { scale: { value: 600 }, maxSize: { value: 80 } },
      // pegadas a la cámara se desvanecen (si no, un punto de cerca llena la pantalla) y hay un tamaño máximo; las muertas, tamaño 0
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale; uniform float maxSize;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vA = alpha * smoothstep(0.45, 1.5, d);
          gl_PointSize = vA > 0.004 ? min(maxSize, size * scale / max(0.1, d)) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main() { if (vA < 0.004) discard; vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.25, r) * vA; gl_FragColor = vec4(vC + (1.0 - r * 2.0) * 0.25, a); }`,
    });
    this.pts = new THREE.Points(g, m);
    this.pts.frustumCulled = false;
    this.pts.visible = false;
  }
  alive = 0; mul = 1; // mul: cuántas partículas (según la calidad)
  emit(x: number, y: number, z: number, color: THREE.Color, n: number, o: { speed?: number, up?: number, size?: number, life?: number, grav?: number, spread?: number } = {}) {
    if (n > 1) n = Math.max(1, Math.round(n * this.mul));
    else if (this.mul < 1 && Math.random() > this.mul) return;
    this.pts.visible = true, this.alive = Math.max(this.alive, 1);
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
    if (!this.alive) return;
    let alive = 0;
    for (let i = 0; i < NP; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      alive++;
      this.life[i] -= dt;
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      for (let a = 0; a < 3; a++) { this.vel[i * 3 + a] *= 1 - 1.2 * dt; this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; }
      if (this.pos[i * 3 + 1] < 0.03) this.pos[i * 3 + 1] = 0.03, this.vel[i * 3 + 1] *= -0.4;
      this.alpha[i] = Math.min(1, f * 2.2);
      this.size[i] = this.s0[i] * (0.5 + f * 0.5);
    }
    this.alive = alive;
    this.pts.visible = alive > 0;
    const g = this.pts.geometry;
    for (const k of ['position', 'color', 'size', 'alpha']) (g.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.alive = 0; this.pts.visible = false; }
}

// ---- Marcador: anillo en el piso, columna de luz y un chevrón que baja y sube ------------------------------------------
// Brillo de una columna de luz según la distancia (en planta) de la cámara a su eje: adentro no se dibuja (sería una
// transparencia que cubre toda la pantalla)
const beamFade = (d: number, r: number) => { const u = Math.min(1, Math.max(0, (d - r - 0.25) / 2.2)); return u * u * (3 - 2 * u); };

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
  update(dt: number, camDist = 99) {
    this.t += dt;
    const y = (this.chev.userData.y as number) ?? 1;
    const fade = beamFade(camDist, 0.42);
    this.beam.visible = fade > 0.02;
    this.chev.position.y = y + 1.4 + Math.sin(this.t * 3) * 0.25;
    this.chev.rotation.y += dt * 1.5;
    const s = 1 + Math.sin(this.t * 4) * 0.08;
    this.ring.scale.set(s, s, s);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(this.t * 4) * 0.2;
    ((this.beam.material as THREE.ShaderMaterial).uniforms.k.value as number) = (0.42 + Math.sin(this.t * 2.5) * 0.1) * fade;
  }
}

// ---- Portal: un remolino en el piso, un aro, una columna de luz corta y un cartel con la isla a la que lleva (sin niebla:
// se encuentran y se leen de lejos) ------------------------------------------------------------------------------------
export const PAD_COLORS = ['#19c9e6', '#ff5fcf', '#ffb31a', '#3ddc7a'];
function sign(text: string, hex: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 320, cv.height = 112;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(255, 255, 255, .95)'; g.beginPath(); g.roundRect(6, 6, 308, 100, 50); g.fill();
  g.lineWidth = 8; g.strokeStyle = hex; g.stroke();
  g.fillStyle = hex; g.beginPath(); g.arc(58, 56, 36, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(40, 56); g.lineTo(76, 56); g.moveTo(61, 40); g.lineTo(77, 56); g.lineTo(61, 72); g.stroke();
  g.fillStyle = '#24234a'; g.font = '900 50px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif'; g.textBaseline = 'middle';
  g.fillText(text, 110, 60, 196);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true }));
  sp.scale.set(2.6, 0.91, 1);
  return sp;
}
export class Portal {
  g = new THREE.Group(); color: THREE.Color; t = Math.random() * 6; swirl: THREE.ShaderMaterial; ring: THREE.Mesh; beam: THREE.Mesh; sign: THREE.Sprite | null = null;
  constructor(x: number, z: number, hex: string, label = '') {
    this.color = new THREE.Color(hex);
    this.swirl = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { color: { value: this.color }, t: { value: 0 } },
      vertexShader: 'varying vec2 vU; void main() { vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 color; uniform float t; varying vec2 vU;
        void main() { float r = length(vU), a = atan(vU.y, vU.x);
          float sw = 0.5 + 0.5 * sin(a * 3.0 - r * 10.0 + t * 5.0);
          vec3 c = mix(color * 0.45, mix(color, vec3(1.0), 0.55), sw * (0.3 + 0.7 * r));
          gl_FragColor = vec4(c, smoothstep(1.0, 0.9, r) * (0.6 + 0.35 * sw)); }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(PAD_R, 48), this.swirl);
    disc.rotation.x = -Math.PI / 2, disc.position.y = 0.03;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(PAD_R, PAD_R + 0.16, 48), new THREE.MeshBasicMaterial({ color: this.color, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2, this.ring.position.y = 0.04;
    const bg = new THREE.CylinderGeometry(PAD_R * 0.8, PAD_R, 4, 24, 1, true);
    bg.translate(0, 2, 0);
    const a = new Float32Array(bg.attributes.position.count);
    for (let i = 0; i < a.length; i++) a[i] = 1 - bg.attributes.position.getY(i) / 4;
    bg.setAttribute('fade', new THREE.BufferAttribute(a, 1));
    this.beam = new THREE.Mesh(bg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { color: { value: this.color }, k: { value: 0.5 } },
      vertexShader: 'attribute float fade; varying float vF; void main() { vF = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float k; varying float vF; void main() { gl_FragColor = vec4(color, vF * vF * k); }',
    }));
    this.g.add(disc, this.ring, this.beam);
    if (label) this.g.add(this.sign = sign(label, hex));
    this.g.position.set(x, 0, z);
  }
  update(dt: number, camDist = 99) {
    this.t += dt;
    this.swirl.uniforms.t.value = this.t;
    const s = 1 + Math.sin(this.t * 3) * 0.05;
    this.ring.scale.set(s, s, 1);
    const fade = beamFade(camDist, PAD_R);
    this.beam.visible = fade > 0.02;
    ((this.beam.material as THREE.ShaderMaterial).uniforms.k.value as number) = (0.55 + Math.sin(this.t * 2.2) * 0.12) * fade;
    this.sign?.position.set(0, 3.1 + Math.sin(this.t * 2) * 0.08, 0);
  }
  dispose() {
    this.g.traverse(o => { const m = o as THREE.Mesh, mt = m.material as THREE.SpriteMaterial | undefined; m.geometry?.dispose(); mt?.map?.dispose(); mt?.dispose(); });
  }
}

export type Quality = 'alta' | 'media' | 'baja';
export const PRESET: Record<Quality, { aa: boolean, shadow: number, area: number, pr: number, cloud: number, fx: number, minScale: number }> = {
  alta: { aa: true, shadow: 2048, area: 24, pr: 2, cloud: 2, fx: 1, minScale: 0.7 },
  media: { aa: false, shadow: 1024, area: 18, pr: 1.5, cloud: 1, fx: 0.7, minScale: 0.6 },
  baja: { aa: false, shadow: 0, area: 18, pr: 1, cloud: 1, fx: 0.5, minScale: 0.6 },
};
export class World {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; fx = new Particles(); board = new THREE.Group(); deco = new THREE.Group();
  fog: THREE.Fog; fogFar = 20; fogT = 20; quality: Quality; fov = 70;
  traj: THREE.InstancedMesh; trajN = 0; cloudMesh: THREE.InstancedMesh | null = null;
  // resolución adaptativa: escala sobre el máximo de la calidad, promedio de los cuadros y el control para no oscilar
  res = newRes();

  constructor(cv: HTMLCanvasElement, q: Quality) {
    this.quality = q;
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: PRESET[q].aa, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.fog = new THREE.Fog(FOG_COLOR, 6, 20);
    this.scene.fog = this.fog;
    this.scene.background = FOG_COLOR;
    this.hemi = new THREE.HemisphereLight('#efeaff', '#ffe6f4', 1.25);
    this.sun = new THREE.DirectionalLight('#fff4e6', 2.1);
    this.sun.shadow.camera.near = 1, this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0006, this.sun.shadow.normalBias = 0.03, this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.board, this.deco, this.fx.pts);
    this.scene.add(this.sky());
    this.clouds();
    const tg = new THREE.CircleGeometry(0.13, 12);
    tg.rotateX(-Math.PI / 2);
    this.traj = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }), 80);
    this.traj.count = 0, this.traj.frustumCulled = false;
    this.scene.add(this.traj);
    this.setQuality(q);
  }

  // Cambia la calidad en vivo (el suavizado de bordes solo se fija al crear el contexto: ese, al recargar)
  setQuality(q: Quality) {
    const P = PRESET[q], had = this.renderer.shadowMap.enabled;
    this.quality = q;
    this.renderer.shadowMap.enabled = P.shadow > 0;
    this.sun.castShadow = P.shadow > 0;
    if (P.shadow && this.sun.shadow.mapSize.x !== P.shadow) { this.sun.shadow.mapSize.set(P.shadow, P.shadow); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -P.area, sc.right = sc.top = P.area;
    sc.updateProjectionMatrix();
    if (had !== P.shadow > 0) this.scene.traverse(o => { const m = (o as THREE.Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true; });
    this.fx.mul = P.fx;
    if (this.cloudMesh) { const g = this.cloudMesh.geometry; this.cloudMesh.geometry = new THREE.IcosahedronGeometry(1, P.cloud); g.dispose(); }
    this.res.scale = 1;
    this.resize(this.fov);
  }

  // fov: ángulo vertical; con la pantalla parada se abre lo necesario para ver al menos 60° de costado a costado
  resize(fov = this.fov) {
    this.fov = fov;
    const w = innerWidth, h = innerHeight, a = w / h;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, PRESET[this.quality].pr) * this.res.scale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = a;
    const need = (2 * Math.atan(Math.tan(Math.PI / 6) / a) * 180) / Math.PI;
    this.camera.fov = Math.min(100, Math.max(fov, need));
    this.camera.updateProjectionMatrix();
    const u = (this.fx.pts.material as THREE.ShaderMaterial).uniforms, hp = h * this.renderer.getPixelRatio();
    u.scale.value = hp * 0.6, u.maxSize.value = Math.max(24, hp * 0.07);
  }

  // Resolución adaptativa (sim/res.ts): con cuadros lentos baja el pixel ratio y con margen lo vuelve a subir
  adapt(frameMs: number) { if (adaptRes(this.res, frameMs, PRESET[this.quality].minScale)) this.resize(this.fov); }

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
    const im = this.cloudMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2),
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

  // El tablero: una losa redondeada por isla con el piso dibujado (puntos donde hay celdas), un borde bajo y los huecos del
  // medio de verdad (se ve el cielo por ellos)
  buildBoard(b: Board, ox: number, oz: number, gr: Ground) {
    for (const o of [...this.board.children]) {
      this.board.remove(o);
      o.traverse(q => { const m = q as THREE.Mesh, mt = m.material as THREE.MeshStandardMaterial | undefined; m.geometry?.dispose(); mt?.map?.dispose(); mt?.dispose?.(); });
    }
    const { lim } = gr, W = lim.x1 - lim.x0, H = lim.z1 - lim.z0;
    const ppm = Math.min(28, 2048 / Math.max(W, H)), cw = Math.round(W * ppm), ch = Math.round(H * ppm);
    const cv = document.createElement('canvas');
    cv.width = cw, cv.height = ch;
    const g = cv.getContext('2d')!;
    const px = (x: number) => (x - lim.x0) * ppm, pz = (z: number) => (z - lim.z0) * ppm;
    const rr = (f: Lim, r: number, d = 0) => { g.beginPath(); g.roundRect(px(f.x0) + d, pz(f.z0) + d, (f.x1 - f.x0) * ppm - 2 * d, (f.z1 - f.z0) * ppm - 2 * d, Math.max(0, r * ppm - d)); };
    g.fillStyle = '#fcfbff';
    for (const f of gr.floors) { rr(f, f.r); g.fill(); }
    // la zona de juego, un poco más lila; con figura o islas, solo sus celdas
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
    for (const f of gr.floors) { rr(f, f.r, 0.18 * ppm); g.stroke(); }
    for (const h of gr.holes) { rr(h, 0.3, -0.18 * ppm); g.stroke(); }
    g.globalCompositeOperation = 'destination-out';
    for (const h of gr.holes) { rr(h, 0.3); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, alphaTest: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((lim.x0 + lim.x1) / 2, 0, (lim.z0 + lim.z1) / 2);
    floor.receiveShadow = true;
    this.board.add(floor);
    // losas (el canto que se ve desde el borde) y bordes bajos, alrededor de cada isla y de cada hueco
    const shape = (x0: number, z0: number, x1: number, z1: number, r: number) => {
      const s = new THREE.Shape();
      s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r); s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
      s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
      return s;
    };
    const grow = (f: Lim, d: number, r: number) => shape(f.x0 - d, f.z0 - d, f.x1 + d, f.z1 + d, Math.max(0.01, r + d));
    const slabM = new THREE.MeshStandardMaterial({ color: '#d8d0ff', roughness: 0.7 }), rimM = new THREE.MeshStandardMaterial({ color: '#b9c7ff', roughness: 0.5 });
    const rim = (s: THREE.Shape) => {
      const rg = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 10 });
      rg.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(rg, rimM);
      m.castShadow = m.receiveShadow = true;
      this.board.add(m);
    };
    for (const f of gr.floors) {
      const top = grow(f, 0, f.r), inside = gr.holes.filter(h => h.x0 >= f.x0 && h.x1 <= f.x1 && h.z0 >= f.z0 && h.z1 <= f.z1);
      // la losa tiene los huecos un poco más anchos (el bisel sobresale 0,3 de la tapa)
      for (const h of inside) top.holes.push(grow(h, 0.3, 0.3));
      const slabG = new THREE.ExtrudeGeometry(top, { depth: 1.6, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 3, curveSegments: 10 });
      slabG.rotateX(Math.PI / 2);
      const slab = new THREE.Mesh(slabG, slabM);
      slab.position.y = -0.33;
      this.board.add(slab);
      const out = grow(f, 0.05, f.r);
      out.holes.push(grow(f, -0.22, f.r));
      rim(out);
      for (const h of inside) { const o = grow(h, 0.22, 0.3); o.holes.push(grow(h, -0.05, 0.3)); rim(o); }
    }
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
