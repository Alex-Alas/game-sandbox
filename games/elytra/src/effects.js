/* Efectos visuales: partículas (polvo, chispas, impulso, cristales), estelas en
   las puntas de las alas y líneas de velocidad. */
import * as THREE from 'three';

/* ── Sistema de partículas en pool ─────────────────────────── */
class Particles {
  constructor(scene, tex, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { tex: { value: tex }, scale: { value: 400 } },
      vertexShader: /* glsl */`
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vA; varying vec3 vC;
        uniform float scale;
        void main(){
          vA = alpha; vC = color;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = min(90.0, size * scale / max(0.5, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tex; varying float vA; varying vec3 vC;
        void main(){
          vec4 t = texture2D(tex, gl_PointCoord);
          if (vA * t.a < 0.01) discard;
          gl_FragColor = vec4(vC * t.rgb, t.a * vA);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(p, v, color, size, life, { grow = 0, drag = 0.5, grav = 0, alpha = 1 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.alpha[i] = alpha;
    this.a0[i] = alpha;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5);
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = g.size.needsUpdate = g.alpha.needsUpdate = g.color.needsUpdate = true;
  }
}

/* ── Estela tipo cinta orientada a cámara ──────────────────── */
class Ribbon {
  constructor(scene, color, n = 28) {
    this.n = n;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
    this.count = 0;
    this.pos = new Float32Array(n * 2 * 3);
    this.a = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vA; void main(){ gl_FragColor = vec4(color, vA * opacity); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  reset(p) { for (const v of this.pts) v.copy(p); this.count = 0; }
  push(p) {
    const last = this.pts.pop();
    last.copy(p);
    this.pts.unshift(last);
    this.count = Math.min(this.n, this.count + 1);
  }
  update(camPos, width, opacity) {
    this.mesh.material.uniforms.opacity.value = opacity;
    if (opacity <= 0.001) return;
    const side = new THREE.Vector3(), dir = new THREE.Vector3(), toCam = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      const q = this.pts[Math.min(this.n - 1, i + 1)];
      dir.subVectors(p, q);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      toCam.subVectors(camPos, p);
      side.crossVectors(dir, toCam).normalize();
      const t = i / (this.n - 1);
      const w = width * (1 - t);
      this.pos[i * 6] = p.x + side.x * w; this.pos[i * 6 + 1] = p.y + side.y * w; this.pos[i * 6 + 2] = p.z + side.z * w;
      this.pos[i * 6 + 3] = p.x - side.x * w; this.pos[i * 6 + 4] = p.y - side.y * w; this.pos[i * 6 + 5] = p.z - side.z * w;
      const dc = toCam.length();
      const near = Math.min(1, Math.max(0, (dc - 5) / 12));
      const al = i < this.count ? (1 - t) * (1 - t) * near : 0;
      this.a[i * 2] = al; this.a[i * 2 + 1] = al;
    }
    const g = this.mesh.geometry.attributes;
    g.position.needsUpdate = g.alpha.needsUpdate = true;
  }
}

/* ── API ───────────────────────────────────────────────────── */
export const fx = {
  add: null, dust: null, trailL: null, trailR: null, streaks: null, flame: null,
};

const STREAKS = 360, BOX = 80;
const sOff = new Float32Array(STREAKS * 3);
const sArr = new Float32Array(STREAKS * 6);

export function initEffects(scene, glowTex) {
  fx.add = new Particles(scene, glowTex, 2500, true);
  fx.dust = new Particles(scene, glowTex, 1500, false);
  fx.trailL = new Ribbon(scene, 0x9fefff);
  fx.trailR = new Ribbon(scene, 0x9fefff);

  for (let i = 0; i < STREAKS * 3; i++) sOff[i] = (Math.random() * 2 - 1) * BOX;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(sArr, 3));
  fx.streaks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color: 0xe6f6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  fx.streaks.frustumCulled = false;
  scene.add(fx.streaks);

  fx.flame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xb98bff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(fx.flame);
}

export function updateStreaks(dt, pos, vel, speed, boost) {
  const vx = vel.x * dt, vy = vel.y * dt, vz = vel.z * dt;
  const inv = speed > 0.01 ? 1 / speed : 0;
  const dx = vel.x * inv, dy = vel.y * inv, dz = vel.z * inv;
  const len = Math.min(16, Math.max(0.5, speed * 0.06 + boost * 8));
  const B2 = BOX * 2;
  for (let i = 0; i < STREAKS; i++) {
    const i3 = i * 3;
    let ox = sOff[i3] - vx, oy = sOff[i3 + 1] - vy, oz = sOff[i3 + 2] - vz;
    if (ox > BOX) ox -= B2; else if (ox < -BOX) ox += B2;
    if (oy > BOX) oy -= B2; else if (oy < -BOX) oy += B2;
    if (oz > BOX) oz -= B2; else if (oz < -BOX) oz += B2;
    sOff[i3] = ox; sOff[i3 + 1] = oy; sOff[i3 + 2] = oz;
    const wx = pos.x + ox, wy = pos.y + oy, wz = pos.z + oz;
    const i6 = i * 6;
    sArr[i6] = wx; sArr[i6 + 1] = wy; sArr[i6 + 2] = wz;
    sArr[i6 + 3] = wx - dx * len; sArr[i6 + 4] = wy - dy * len; sArr[i6 + 5] = wz - dz * len;
  }
  fx.streaks.geometry.attributes.position.needsUpdate = true;
  fx.streaks.material.opacity = Math.min(0.6, Math.max(0, (speed - 45) / 220) * 0.8 + boost * 0.35);
}

const _v = new THREE.Vector3();
const _c = new THREE.Color();

export function burst(pos, color, n, speed, size, life, opts = {}) {
  _c.set(color);
  for (let i = 0; i < n; i++) {
    _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      .multiplyScalar(speed * (0.3 + Math.random() * 0.7));
    if (opts.base) _v.add(opts.base);
    (opts.dust ? fx.dust : fx.add).emit(pos, _v, _c, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), opts);
  }
}

export function dustPuff(pos, normalUp = 1, strength = 1) {
  _c.setRGB(0.62, 0.55, 0.45);
  const n = Math.round(6 + strength * 14);
  for (let i = 0; i < n; i++) {
    _v.set((Math.random() - 0.5) * 2, Math.random() * normalUp, (Math.random() - 0.5) * 2)
      .multiplyScalar((4 + Math.random() * 10) * strength);
    fx.dust.emit(pos, _v, _c, 2 + Math.random() * 3 * strength, 0.9 + Math.random() * 1.2,
      { grow: 4 * strength, drag: 2.2, grav: -1.5, alpha: 0.75 });
  }
}

/* Tamaño de los puntos en píxeles del framebuffer: se ajusta a la resolución real
   (que cambia con la escala adaptativa) para que las partículas no crezcan ni encojan. */
export function setParticleScale(bufferHeight) {
  const v = bufferHeight * 0.55;
  if (fx.add) fx.add.points.material.uniforms.scale.value = v;
  if (fx.dust) fx.dust.points.material.uniforms.scale.value = v;
}

export function updateEffects(dt) {
  fx.add.update(dt);
  fx.dust.update(dt);
}
