// Efectos del kit en WebGL: rastros del arma (cintas que siguen al filo), partículas instanciadas
// (brasas, chispas, polvo con sombra de caricatura, escombros, ceniza, luciérnagas, destellos,
// anillos, líneas de velocidad) y estallidos de golpe. Todo HDR: el bloom hace el resto.
import { type GL, Prog } from './gl/gl.ts';
import { HEAD, NOISE, QUAD_VS } from './gl/shaders.ts';
import type { Renderer } from './gl/renderer.ts';

export const K = { EMBER: 0, SPARK: 1, DUST: 2, SHARD: 3, ASH: 4, FIREFLY: 5, STAR: 6, RING: 7, LINE: 8, DROP: 9 } as const;

export interface Particle {
  k: number; x: number; y: number; z: number; vx: number; vy: number;
  size: number; grow: number; rot: number; vr: number; asp: number;
  r: number; g: number; b: number; a: number;
  life: number; t: number; drag: number; grav: number; seed: number;
  add: boolean;
}

export interface Trail {
  pts: { a: [number, number], b: [number, number] }[];
  t: number; life: number;
  core: [number, number, number]; edge: [number, number, number];
  w: number; // 0..1 cuánto de la hoja ocupa la cinta (desde la punta)
  ink: boolean;
}

export interface Burst { x: number; y: number; t: number; life: number; size: number; rot: number; col: [number, number, number]; n: number; seed: number }

const PART_VS = HEAD + `
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 iA;   // x, y, z, size
layout(location = 2) in vec4 iB;   // rot, asp, kind, life
layout(location = 3) in vec4 iC;   // color
layout(location = 4) in float iS;  // semilla
uniform mat4 uVP;
out vec2 vQ;
out vec4 vC;
flat out float vK;
out float vL;
out float vS;
void main(){
  vec2 q = aPos * 2.0 - 1.0;
  vQ = q;
  float c = cos(iB.x), s = sin(iB.x);
  vec2 p = vec2(q.x * iB.y, q.y) * iA.w;
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vC = iC; vK = iB.z; vL = iB.w; vS = iS;
  gl_Position = uVP * vec4(iA.xy + p, iA.z, 1.0);
}`;

const PART_FS = HEAD + NOISE + `
in vec2 vQ;
in vec4 vC;
flat in float vK;
in float vL;
in float vS;
uniform float uTime;
out vec4 o;
float star(vec2 q, float n, float sharp){ float a = atan(q.y, q.x); float r = length(q); float k = pow(abs(cos(a * n * 0.5)), sharp); return r - (0.25 + 0.75 * k); }
void main(){
  vec2 q = vQ;
  float r = length(q);
  int k = int(vK + 0.5);
  vec3 col = vC.rgb; float a = 0.0;
  if (k == 0 || k == 5) {            // brasa / luciérnaga: núcleo + halo
    float fl = 0.75 + 0.25 * sin(uTime * (k == 5 ? 3.0 : 14.0) + vS * 40.0);
    a = (exp(-r * r * 9.0) * 1.2 + exp(-r * 3.5) * 0.35) * fl;
    col *= 1.0 + exp(-r * r * 30.0) * 2.0;
  } else if (k == 1) {               // chispa alargada: punta blanca
    float d = abs(q.y) + max(0.0, abs(q.x) - 0.6) * 1.5;
    a = smoothstep(0.55, 0.0, d);
    col = mix(col, vec3(4.0, 3.6, 3.0), smoothstep(0.35, 0.0, d) * smoothstep(-1.0, 0.6, q.x));
  } else if (k == 2) {               // polvo: bocanada con sombra de caricatura y borde de tinta, se erosiona
    float n = texture(uNoise, q * 0.25 + vS).g;
    float shape = r - 0.62 - (n - 0.5) * 0.55;
    float er = vL * 0.75;
    float hole = texture(uNoise, q * 0.35 + vS * 3.0).a - er * 1.1;
    if (shape > 0.04 || hole < 0.0) discard;
    float lit = smoothstep(0.0, 0.25, dot(normalize(q + 1e-4), vec2(0.5, 0.6)) * (1.0 - r) + 0.12);
    col = mix(col * 0.62, col * 1.12, lit);
    col = mix(col, vec3(0.05, 0.05, 0.08), smoothstep(-0.07, 0.0, shape));
    a = 1.0;
  } else if (k == 3) {               // escombro: polígono anguloso con tinta
    float ang = atan(q.y, q.x) + vS * 6.0;
    float rr = 0.62 + 0.25 * cos(ang * 3.0 + vS * 9.0) + 0.12 * cos(ang * 5.0);
    float d = r - rr;
    if (d > 0.0) discard;
    float lit = step(0.0, dot(q, vec2(0.6, 0.8)));
    col = mix(col * 0.7, col * 1.25, lit);
    col = mix(col, vec3(0.03, 0.03, 0.05), smoothstep(-0.16, -0.06, d));
    a = 1.0;
  } else if (k == 4) {               // ceniza: escama que aletea
    float d = abs(q.y * (1.6 + sin(uTime * 4.0 + vS * 30.0))) + abs(q.x) * 0.6;
    a = smoothstep(0.7, 0.4, d);
  } else if (k == 6) {               // destello de cuatro puntas
    float d = star(q * 1.0, 4.0, 22.0);
    a = smoothstep(0.08, -0.05, d) + exp(-r * r * 6.0) * 0.5;
    col *= 1.0 + smoothstep(0.2, 0.0, r) * 2.0;
  } else if (k == 7) {               // anillo
    float w = 0.12 * (1.0 - vL) + 0.02;
    a = smoothstep(w, 0.0, abs(r - 0.85)) ;
  } else if (k == 8) {               // línea de velocidad
    float d = abs(q.y) * 4.0 + max(0.0, abs(q.x) - 0.2);
    a = smoothstep(1.0, 0.0, d) * smoothstep(1.0, 0.3, abs(q.x));
  } else if (k == 9) {               // gota
    float d = length(vec2(q.x * 0.8, q.y + max(0.0, q.y) * 0.0));
    a = smoothstep(0.7, 0.5, d);
  }
  a *= vC.a;
  if (a < 0.003) discard;
  o = vec4(col * a, k == 2 || k == 3 ? a : 0.0);
}`;

// Cinta del rastro: u = tiempo (0 viejo → 1 nuevo), v = de la empuñadura (0) a la punta (1)
const TRAIL_VS = HEAD + `
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
uniform mat4 uVP;
out vec2 vUV;
void main(){ vUV = aUV; gl_Position = uVP * vec4(aPos, 0.5, 1.0); }`;

const TRAIL_FS = HEAD + NOISE + `
in vec2 vUV;
uniform float uLife, uW, uSeed, uInk;
uniform vec3 uCore, uEdge;
out vec4 o;
void main(){
  float u = vUV.x, v = vUV.y;
  // grosor de la medialuna: crece hacia lo nuevo, afinado en la cola
  float th = uW * pow(u, 0.7) * (1.0 - smoothstep(0.92, 1.0, u) * 0.3);
  float edge = 1.0 - th;
  if (v < edge) discard;
  float x = (v - edge) / max(th, 1e-3);      // 0 borde interno → 1 filo
  // erosión: se come desde la cola y desde adentro
  float n = texture(uNoise, vec2(u * 2.2, v * 0.8) + uSeed).g;
  float er = uLife * 1.35 - u * 0.55 + (1.0 - x) * 0.25;
  if (n < er) discard;
  float rim = smoothstep(er + 0.08, er, n);
  vec3 c = mix(uEdge, uCore, smoothstep(0.35, 0.9, x));
  c += uEdge * rim * 2.0;
  // borde de tinta en el filo exterior (aspecto dibujado)
  float inkline = smoothstep(0.93, 0.985, x) * uInk;
  c = mix(c, vec3(0.04, 0.02, 0.06), inkline);
  float a = (1.0 - inkline * 0.0) * (1.0 - uLife * 0.35);
  o = vec4(c * a, inkline * a * 0.85);
}`;

// Estallido de golpe: estrella irregular de puntas, blanca con borde de color y tinta
const BURST_FS = HEAD + NOISE + `
in vec2 vUV;
uniform float uLife, uN, uSeed;
uniform vec3 uCol;
out vec4 o;
void main(){
  vec2 q = vUV * 2.0 - 1.0;
  float r = length(q), a = atan(q.y, q.x);
  float spikes = 0.0;
  float n = uN;
  float k = abs(fract(a / 6.2831853 * n + uSeed) - 0.5) * 2.0;           // 0 en la punta, 1 entre puntas
  float len = 0.55 + 0.45 * texture(uNoise, vec2(floor(a / 6.2831853 * n + uSeed) * 0.13, uSeed)).b;
  float grow = 1.0 - pow(1.0 - min(1.0, uLife * 4.0), 3.0);
  float R = mix(0.18, len, pow(1.0 - k, 2.4)) * mix(0.5, 1.0, grow);
  float hole = uLife * 0.9 * R;                                         // se vacía desde el centro
  float d = r - R;
  if (d > 0.0 || r < hole) discard;
  vec3 c = mix(uCol * 1.6, vec3(1.7, 1.6, 1.45), smoothstep(-0.05, -0.25, d) * (1.0 - uLife));
  float ink = smoothstep(-0.045, -0.015, d);
  c = mix(c, vec3(0.04, 0.02, 0.06), ink * 0.9);
  o = vec4(c, ink * 0.9);
}`;

export class FX {
  gl: GL;
  parts: Particle[] = [];
  trails: Trail[] = [];
  bursts: Burst[] = [];
  private pp: Prog; private tp: Prog; private bp: Prog;
  private vao: WebGLVertexArrayObject; private ibuf: WebGLBuffer; private data = new Float32Array(0);
  private tvao: WebGLVertexArrayObject; private tbuf: WebGLBuffer;
  max = 2400;
  constructor(r: Renderer) {
    const gl = r.gl;
    this.gl = gl;
    this.pp = new Prog(gl, PART_VS, PART_FS, 'part');
    this.tp = new Prog(gl, TRAIL_VS, TRAIL_FS, 'trail');
    this.bp = new Prog(gl, QUAD_VS, BURST_FS, 'burst');
    // instancias
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const q = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, q);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.max * 13 * 4, gl.DYNAMIC_DRAW);
    const st = 13 * 4;
    const attr = (loc: number, n: number, off: number) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, st, off * 4); gl.vertexAttribDivisor(loc, 1); };
    attr(1, 4, 0); attr(2, 4, 4); attr(3, 4, 8); attr(4, 1, 12);
    gl.bindVertexArray(null);
    // cintas
    this.tvao = gl.createVertexArray()!;
    gl.bindVertexArray(this.tvao);
    this.tbuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tbuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4096 * 4 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }

  add(p: Partial<Particle> & { k: number, x: number, y: number }): Particle {
    const q: Particle = { z: 0, vx: 0, vy: 0, size: 3, grow: 0, rot: 0, vr: 0, asp: 1, r: 1, g: 1, b: 1, a: 1, life: 1, t: 0, drag: 0, grav: 0, seed: Math.random(), add: true, ...p };
    if (this.parts.length < this.max) this.parts.push(q);
    return q;
  }

  update(dt: number) {
    for (const p of this.parts) {
      p.t += dt / p.life;
      p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt);
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      // el suelo: las chispas mueren, los escombros rebotan y se asientan
      if (p.y < 0 && p.grav > 0 && p.z === 0) {
        if (p.k === K.SHARD) { p.y = 0; p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.55; p.vr *= 0.5; if (p.vy < 8) { p.vy = 0; p.grav = 0; p.vx *= 0.5; } }
        else if (p.k === K.SPARK) { if (p.vy < -60 && Math.random() < 0.5) { p.y = 0; p.vy *= -0.35; p.vx *= 0.7; } else p.t = 1; }
      }
      if (p.k === K.SPARK || p.k === K.LINE) p.rot = Math.atan2(p.vy, p.vx) || p.rot;
    }
    this.parts = this.parts.filter((p) => p.t < 1);
    for (const t of this.trails) t.t += dt / t.life;
    this.trails = this.trails.filter((t) => t.t < 1);
    for (const b of this.bursts) b.t += dt / b.life;
    this.bursts = this.bursts.filter((b) => b.t < 1);
  }

  // Dibuja en el plano de juego. `front`: lo que va delante de los personajes.
  draw(r: Renderer) {
    const gl = this.gl;
    // cintas
    if (this.trails.length) {
      const P = this.tp.use();
      P.m4('uVP', r.VP).i('uNoise', 7);
      gl.bindVertexArray(this.tvao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tbuf);
      for (const t of this.trails) {
        const n = t.pts.length;
        if (n < 2) continue;
        const v = new Float32Array(n * 2 * 4);
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), { a, b } = t.pts[i];
          v.set([a[0], a[1], u, 0, b[0], b[1], u, 1], i * 8);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
        // borde de tinta con mezcla normal, núcleo aditivo
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        P.f('uLife', t.t).f('uW', t.w).f('uSeed', (t.pts.length * 0.137) % 1).f('uInk', t.ink ? 1 : 0)
          .f('uCore', ...t.core).f('uEdge', ...t.edge);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, n * 2);
      }
    }
    // estallidos
    if (this.bursts.length) {
      gl.bindVertexArray(r.quadVAO());
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const P = this.bp.use();
      P.m4('uVP', r.VP).i('uNoise', 7);
      for (const b of this.bursts) {
        P.f('uRect', b.x - b.size, b.y - b.size, b.x + b.size, b.y + b.size).f('uZ', 0.6).f('uLife', b.t).f('uN', b.n).f('uSeed', b.seed).f('uCol', ...b.col);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    // partículas
    const n = this.parts.length;
    if (n) {
      if (this.data.length < n * 13) this.data = new Float32Array(this.max * 13);
      const d = this.data;
      let i = 0;
      // primero las opacas (polvo, escombros), después las aditivas
      const ord = this.parts.slice().sort((a, b) => (a.add ? 1 : 0) - (b.add ? 1 : 0));
      let nOpaque = 0;
      for (const p of ord) {
        const fade = p.k === K.DUST ? 1 : p.k === K.RING ? 1 - p.t : Math.min(1, (1 - p.t) * 3) * Math.min(1, p.t * 12 + 0.2);
        d.set([p.x, p.y, p.z, p.size, p.rot, p.asp, p.k, p.t, p.r, p.g, p.b, p.a * fade, p.seed], i * 13);
        if (!p.add) nOpaque++;
        i++;
      }
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 13);
      const P = this.pp.use();
      P.m4('uVP', r.VP).f('uTime', r.time).i('uNoise', 7);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (nOpaque) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nOpaque);
      if (n - nOpaque) {
        gl.blendFunc(gl.ONE, gl.ONE);
        // las aditivas empiezan después de las opacas en el búfer
        for (let loc = 1; loc <= 4; loc++) {
          const sizes = [0, 4, 4, 4, 1], offs = [0, 0, 4, 8, 12];
          gl.vertexAttribPointer(loc, sizes[loc], gl.FLOAT, false, 52, (offs[loc] + nOpaque * 13) * 4);
        }
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n - nOpaque);
        for (let loc = 1; loc <= 4; loc++) {
          const sizes = [0, 4, 4, 4, 1], offs = [0, 0, 4, 8, 12];
          gl.vertexAttribPointer(loc, sizes[loc], gl.FLOAT, false, 52, offs[loc] * 4);
        }
      }
    }
    gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  // ---------- recetas ----------
  rnd(a = 0, b = 1) { return a + (b - a) * Math.random(); }

  dust(x: number, y: number, n = 6, dir = 0, power = 1, col: [number, number, number] = [0.32, 0.38, 0.42]) {
    for (let i = 0; i < n; i++) {
      const s = this.rnd(-1, 1);
      this.add({ k: K.DUST, x: x + s * 4 * power, y: y + this.rnd(0, 3), vx: (s * 22 + dir * 40) * power, vy: this.rnd(6, 24) * power, size: this.rnd(3, 6) * power, grow: 8 * power,
        drag: 4, grav: -6, life: this.rnd(0.35, 0.6), r: col[0], g: col[1], b: col[2], add: false, rot: this.rnd(0, 6) });
    }
  }
  sparks(x: number, y: number, n: number, ang: number, spread: number, speed: number, col: [number, number, number] = [3.2, 1.4, 0.4]) {
    for (let i = 0; i < n; i++) {
      const a = ang + this.rnd(-spread, spread), v = speed * this.rnd(0.4, 1.2);
      this.add({ k: K.SPARK, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: this.rnd(1.6, 3.2), asp: this.rnd(3, 6), drag: 3, grav: 160, life: this.rnd(0.18, 0.45), r: col[0], g: col[1], b: col[2] });
    }
  }
  embers(x: number, y: number, n: number, spread = 10, up = 30) {
    for (let i = 0; i < n; i++) {
      this.add({ k: K.EMBER, x: x + this.rnd(-spread, spread), y: y + this.rnd(-spread, spread) * 0.5, vx: this.rnd(-12, 12), vy: this.rnd(up * 0.4, up), size: this.rnd(1.2, 2.6), drag: 0.8, grav: -10,
        life: this.rnd(0.6, 1.4), r: 3.0, g: 1.3, b: 0.35 });
    }
  }
  shards(x: number, y: number, n: number, col: [number, number, number] = [0.2, 0.24, 0.28], power = 1) {
    for (let i = 0; i < n; i++) {
      const a = this.rnd(0.3, Math.PI - 0.3), v = this.rnd(40, 120) * power;
      this.add({ k: K.SHARD, x: x + this.rnd(-6, 6), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: this.rnd(1.6, 3.6) * power, grav: 260, drag: 0.5, vr: this.rnd(-12, 12), life: this.rnd(0.6, 1.0), r: col[0], g: col[1], b: col[2], add: false });
    }
  }
  ring(x: number, y: number, size: number, grow: number, col: [number, number, number], life = 0.35, asp = 1) {
    this.add({ k: K.RING, x, y, size, grow, life, r: col[0], g: col[1], b: col[2], asp });
  }
  star(x: number, y: number, size: number, col: [number, number, number] = [3, 2.6, 2], life = 0.3) {
    this.add({ k: K.STAR, x, y, size, grow: -size / life * 0.6, life, r: col[0], g: col[1], b: col[2], rot: this.rnd(0, 1) });
  }
  speedLines(x: number, y: number, dir: number, n = 6, len = 30, col: [number, number, number] = [1.6, 1.6, 1.8]) {
    for (let i = 0; i < n; i++) {
      this.add({ k: K.LINE, x: x + this.rnd(-10, 10), y: y + this.rnd(-26, 6), vx: -dir * this.rnd(60, 140), vy: 0, size: this.rnd(len * 0.4, len), asp: 1, drag: 2, life: this.rnd(0.15, 0.3), r: col[0], g: col[1], b: col[2] });
    }
  }
  burst(x: number, y: number, size: number, col: [number, number, number] = [1, 0.45, 0.2], n = 9) {
    this.bursts.push({ x, y, t: 0, life: 0.2, size, rot: 0, col, n, seed: Math.random() });
  }
}
