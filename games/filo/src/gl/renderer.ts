// Escena en WebGL2: cielo, capas pintadas a distintas profundidades (parallax real con cámara en
// perspectiva), personajes, efectos y posproceso HDR (bloom, ondas, aberración, gradación, papel).
import { type GL, Prog, Target, newTex, upload, perspective, lookAt, mul, project, noiseTex } from './gl.ts';
import * as S from './shaders.ts';
import type { Actor } from '../actor.ts';

export interface Layer {
  id: string; label: string;
  canvas: HTMLCanvasElement;
  tex?: WebGLTexture; dirty?: boolean;
  p: number;                               // parallax (1 = el plano de juego; < 1 atrás; > 1 adelante)
  rect: [number, number, number, number];  // como se ve desde la cámara de referencia
  fog?: number; tint?: [number, number, number]; sway?: number; blur?: number; mist?: number; alpha?: number;
  light?: number;                          // cuánto lo tiñe la luz local
  zb?: number;                             // corrimiento de orden (mismo p)
  add?: boolean;                           // aditiva (brillos: ventanas, velas)
  kind?: 'shaft' | 'fog';                  // capas que son solo shader (rayos, niebla)
  k?: number; slant?: number; seed?: number; speed?: number; col?: [number, number, number];
  hidden?: boolean;
}

export interface Cam { x: number; y: number; H: number; explode: number; shakeX: number; shakeY: number; roll: number }
export interface Post {
  bloom: number; thresh: number; exposure: number; ca: number; flash: number; invert: number;
  vig: number; grain: number; paper: number; sat: number;
  lift: [number, number, number]; gamma: [number, number, number]; gain: [number, number, number];
  waves: { x: number, y: number, r: number, k: number }[];  // en el mundo; r en unidades
}
export interface SkyCfg { top: number[]; mid: number[]; hor: number[]; sun: [number, number, number]; sunCol: number[] }
export interface Env {
  fog: number[]; mist: number[]; mistY: number;
  light: [number, number, number, number]; lightCol: number[];
  ground: number;
}

export const REF = { x: 0, y: 92, H: 300 };
const FOV = 28 * Math.PI / 180;
export const dist = (H: number) => H / 2 / Math.tan(FOV / 2);

interface SpriteTex { c: WebGLTexture; g: WebGLTexture; v: number }

export class Renderer {
  gl: GL; canvas: HTMLCanvasElement;
  float: boolean;
  scene: Target; bloom: Target[] = [];
  quad: WebGLVertexArrayObject;
  P: Record<string, Prog> = {};
  cam: Cam = { x: 0, y: 92, H: 300, explode: 0, shakeX: 0, shakeY: 0, roll: 0 };
  post: Post = {
    bloom: 0.8, thresh: 1.0, exposure: 1.0, ca: 0.002, flash: 0, invert: 0, vig: 0.55, grain: 0.035, paper: 0.09, sat: 1.04,
    lift: [0.02, 0.035, 0.05], gamma: [1.0, 1.0, 1.02], gain: [1.04, 1.0, 0.95], waves: [],
  };
  sky: SkyCfg = { top: [0.012, 0.02, 0.035], mid: [0.05, 0.09, 0.12], hor: [0.2, 0.3, 0.31], sun: [0.74, 0.88, 0.035], sunCol: [1.0, 0.86, 0.66] };
  env: Env = { fog: [0.13, 0.2, 0.22], mist: [0.2, 0.29, 0.3], mistY: -20, light: [0, 0, 60, 0], lightCol: [1.0, 0.55, 0.22], ground: 0 };
  VP = new Float32Array(16);
  time = 0;
  scale = 1;            // resolución interna (1 = nativa × dpr)
  dprCap = 2;
  W = 1; H = 1;
  private sprites = new WeakMap<Actor<any>, SpriteTex>();
  stats = { draws: 0 };
  noise: WebGLTexture;
  occ!: Target; rays!: Target;
  rayK = 0.8; rayCol: [number, number, number] = [1.0, 0.86, 0.62];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 no disponible');
    this.gl = gl;
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.quad = gl.createVertexArray()!;
    gl.bindVertexArray(this.quad);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const p = (n: string, vs: string, fs: string) => { this.P[n] = new Prog(gl, vs, fs, n); };
    p('sky', S.FULL_VS, S.SKY_FS);
    p('layer', S.QUAD_VS, S.LAYER_FS);
    p('sprite', S.QUAD_VS, S.SPRITE_FS);
    p('bright', S.FULL_VS, S.BRIGHT_FS);
    p('down', S.FULL_VS, S.DOWN_FS);
    p('up', S.FULL_VS, S.UP_FS);
    p('comp', S.FULL_VS, S.COMPOSITE_FS);
    p('sunmask', S.FULL_VS, S.SUNMASK_FS);
    p('shaft', S.QUAD_VS, S.SHAFT_FS);
    p('fogband', S.QUAD_VS, S.FOGBAND_FS);
    p('occ', S.QUAD_VS, S.OCC_FS);
    p('rays', S.FULL_VS, S.RAYS_FS);
    this.occ = new Target(gl, 2, 2, false);
    this.rays = new Target(gl, 2, 2, false);
    this.noise = noiseTex(gl);
    this.scene = new Target(gl, 2, 2, this.float);
    for (let i = 0; i < 6; i++) this.bloom.push(new Target(gl, 2, 2, this.float));
  }

  resize() {
    const dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr * this.scale));
    const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr * this.scale));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.W = w; this.H = h;
    this.scene.resize(w, h);
    let bw = w / 2, bh = h / 2;
    for (const t of this.bloom) { t.resize(bw, bh); bw /= 2; bh /= 2; }
    this.occ.resize(w / 4, h / 4);
    this.rays.resize(w / 4, h / 4);
  }

  // píxeles de pantalla por unidad de mundo en el plano de juego
  pxPerUnit() { return this.H / this.cam.H; }

  // Cámara: mira el plano de juego; en la vista despiezada orbita y se aleja
  updateCamera() {
    const c = this.cam, asp = this.W / this.H;
    const D = dist(c.H);
    const e = c.explode;
    const yaw = -e * 0.62, pitch = e * 0.12;
    const cx = c.x + c.shakeX, cy = c.y + c.shakeY;
    // el centro de la órbita está un poco atrás del plano de juego
    const pivotZ = -e * D * 0.9;
    const R = D * (1 + e * 1.4) - pivotZ;
    const eye = [cx + Math.sin(yaw) * Math.cos(pitch) * R, cy + Math.sin(pitch) * R, pivotZ + Math.cos(yaw) * Math.cos(pitch) * R];
    const up = [Math.sin(c.roll), Math.cos(c.roll), 0];
    const V = lookAt(eye, [cx, cy, pivotZ], up);
    const Pm = perspective(FOV, asp, 5, 40000);
    this.VP = mul(Pm, V);
  }

  // de mundo a píxeles CSS (para etiquetas y toques)
  toScreen(x: number, y: number, z = 0): [number, number, number] {
    const [nx, ny, w] = project(this.VP, x, y, z);
    return [(nx * 0.5 + 0.5) * this.canvas.clientWidth, (1 - (ny * 0.5 + 0.5)) * this.canvas.clientHeight, w];
  }
  // de píxeles CSS al plano de juego (z = 0), válido sin despiece
  toWorld(px: number, py: number): [number, number] {
    const c = this.cam, h = c.H, w = h * this.W / this.H;
    return [c.x + (px / this.canvas.clientWidth - 0.5) * w, c.y - (py / this.canvas.clientHeight - 0.5) * h];
  }

  layerGeom(L: Layer) {
    const Dref = dist(REF.H);
    const z = -Dref * (1 / L.p - 1);
    const s = 1 / L.p;
    const [x0, y0, x1, y1] = L.rect;
    return { z, r: [REF.x + (x0 - REF.x) * s, REF.y + (y0 - REF.y) * s, REF.x + (x1 - REF.x) * s, REF.y + (y1 - REF.y) * s] };
  }

  private bindQuad() { this.gl.bindVertexArray(this.quad); }
  quadVAO() { return this.quad; }
  drawQuad() { this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4); this.stats.draws++; }

  drawLayer(L: Layer) {
    const gl = this.gl;
    if (L.kind) {
      const { z, r } = this.layerGeom(L);
      const c = L.col ?? [1, 1, 1];
      if (L.kind === 'shaft') {
        gl.blendFunc(gl.ONE, gl.ONE);
        this.P.shaft.use().m4('uVP', this.VP).f('uRect', r[0], r[1], r[2], r[3]).f('uZ', z).f('uTime', this.time)
          .f('uSlant', L.slant ?? 0.4).f('uK', (L.k ?? 0.3) * this.rayK).f('uSeed', L.seed ?? 0).f('uCol', c[0], c[1], c[2]).i('uNoise', 7);
      } else {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this.P.fogband.use().m4('uVP', this.VP).f('uRect', r[0], r[1], r[2], r[3]).f('uZ', z).f('uTime', this.time)
          .f('uK', L.k ?? 0.5).f('uSeed', L.seed ?? 0).f('uSpeed', L.speed ?? 0.01).f('uCol', c[0], c[1], c[2]).i('uNoise', 7);
      }
      this.drawQuad();
      return;
    }
    if (!L.tex) { L.tex = newTex(gl, 1, 1, { mips: true }); L.dirty = true; }
    if (L.dirty) { upload(gl, L.tex, L.canvas, true); L.dirty = false; }
    const { z, r } = this.layerGeom(L);
    const e = this.env, P = this.P.layer.use();
    if (L.add) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const fogK = L.fog ?? 0;
    const tint = L.tint ?? [1, 1, 1];
    P.m4('uVP', this.VP).f('uRect', r[0], r[1], r[2], r[3]).f('uZ', z)
      .f('uTime', this.time).f('uFog', e.fog[0], e.fog[1], e.fog[2], fogK)
      .f('uMist', e.mist[0], e.mist[1], e.mist[2], L.mist ?? 0).f('uMistY', e.mistY)
      .f('uTint', tint[0], tint[1], tint[2]).f('uSway', L.sway ?? 0).f('uBlur', L.blur ?? 0)
      .f('uLight', e.light[0], e.light[1], e.light[2], e.light[3] * (L.light ?? 0)).f('uLightCol', e.lightCol[0], e.lightCol[1], e.lightCol[2])
      .f('uAlpha', L.alpha ?? 1)
      .tex('uTex', 0, L.tex).i('uNoise', 7);
    this.drawQuad();
  }

  // mitad de pantalla (en px del lienzo): para comparar «vector crudo» y «final»
  scissorX: [number, number] | null = null;
  drawActor(a: Actor<any>, fog = 0) {
    const gl = this.gl;
    if (a.hidden) return;
    if (this.scissorX) { gl.enable(gl.SCISSOR_TEST); gl.scissor(this.scissorX[0], 0, this.scissorX[1] - this.scissorX[0], this.H); }
    let st = this.sprites.get(a);
    if (!st) { st = { c: newTex(gl), g: newTex(gl), v: -1 }; this.sprites.set(a, st); }
    if (st.v !== a.version) { upload(gl, st.c, a.cv); upload(gl, st.g, a.g); st.v = a.version; }
    const r = a.rect(), e = this.env;
    const P = this.P.sprite.use();
    P.m4('uVP', this.VP).f('uRect', r[0], r[1], r[2], r[3]).f('uZ', 0)
      .f('uTime', this.time).f('uGlowK', 2.2 + a.glow * 3).f('uFlash', a.flash).f('uSeed', a.seed % 97).f('uDissolve', a.dissolve)
      .f('uDisY', a.disUp ? a.rootY() - 4 + (a.height + 8) * (1 - a.dissolve) : a.rootY() + a.height + 4 - (a.height + 8) * a.dissolve, 1)
      .f('uTint', a.tint[0], a.tint[1], a.tint[2], a.tint[3]).f('uFog', e.fog[0], e.fog[1], e.fog[2], fog)
      .f('uLight', e.light[0], e.light[1], e.light[2], e.light[3]).f('uLightCol', e.lightCol[0], e.lightCol[1], e.lightCol[2])
      .f('uGround', e.ground, a.clipY).f('uAlpha', a.alpha)
      .tex('uTex', 0, st.c).tex('uGlow', 1, st.g).i('uNoise', 7);
    this.drawQuad();
    if (this.scissorX) gl.disable(gl.SCISSOR_TEST);
  }

  // Dibuja el cuadro completo. `play` dibuja lo del plano de juego (personajes y efectos).
  frame(layers: Layer[], play: (r: Renderer) => void, front?: (r: Renderer) => void) {
    const gl = this.gl;
    this.stats.draws = 0;
    this.updateCamera();
    this.scene.bind();
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.bindQuad();
    // cielo
    gl.disable(gl.BLEND);
    const sk = this.sky, P = this.P.sky.use();
    const pan = [(this.cam.x - REF.x) / 4000, (this.cam.y - REF.y) / 6000];
    P.f('uRes', this.W, this.H).f('uTime', this.time).f('uTop', ...sk.top).f('uMid', ...sk.mid).f('uHor', ...sk.hor)
      .f('uSun', sk.sun[0] - pan[0] * 3, sk.sun[1] - pan[1] * 3, sk.sun[2]).f('uSunCol', ...sk.sunCol).f('uPan', pan[0], pan[1]).i('uNoise', 7);
    this.drawQuad();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const vis = layers.filter((l) => !l.hidden);
    const back = vis.filter((l) => l.p <= 1).sort((a, b) => a.p - b.p || (a.zb ?? 0) - (b.zb ?? 0));
    const fore = vis.filter((l) => l.p > 1).sort((a, b) => a.p - b.p || (a.zb ?? 0) - (b.zb ?? 0));
    for (const L of back) this.drawLayer(L);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    play(this);
    this.godrays(back);
    this.scene.bind();
    this.bindQuad();
    this.bindQuad();
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const L of fore) this.drawLayer(L);
    if (front) front(this);
    this.bindQuad();
    this.postprocess();
  }

  sunUV(): [number, number] {
    const pan = [(this.cam.x - REF.x) / 4000, (this.cam.y - REF.y) / 6000];
    return [this.sky.sun[0] - pan[0] * 3, this.sky.sun[1] - pan[1] * 3];
  }

  // Rayos: el astro en una máscara chica, tapado por las siluetas de las capas de fondo, y un
  // desenfoque radial hacia el astro: la luz se cuela por los arcos y entre las ramas.
  godrays(back: Layer[]) {
    const gl = this.gl;
    if (this.rayK <= 0) return;
    const [sx, sy] = this.sunUV();
    gl.disable(gl.BLEND);
    this.full(this.P.sunmask, this.occ).f('uRes', this.W, this.H).f('uSun', sx, sy, this.sky.sun[2]);
    this.drawQuad();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const P = this.P.occ.use();
    for (const L of back) {
      if (L.add || L.kind || !L.tex || L.p > 0.95) continue;
      const { z, r } = this.layerGeom(L);
      P.m4('uVP', this.VP).f('uRect', r[0], r[1], r[2], r[3]).f('uZ', z).f('uK', 1 - (L.fog ?? 0) * 0.6).tex('uTex', 0, L.tex);
      this.drawQuad();
    }
    gl.disable(gl.BLEND);
    this.full(this.P.rays, this.rays).tex('uTex', 0, this.occ.tex).f('uSun', sx, sy).f('uDecay', 0.975).f('uDensity', 0.85).f('uSeed', this.time % 7);
    this.drawQuad();
    gl.enable(gl.BLEND);
  }

  private full(P: Prog, target: Target | null) {
    const gl = this.gl;
    if (target) target.bind(); else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H); }
    P.use();
    return P;
  }

  postprocess() {
    const gl = this.gl, po = this.post;
    gl.disable(gl.BLEND);
    // bloom: brillo → pirámide hacia abajo → hacia arriba sumando
    const B = this.bloom;
    this.full(this.P.bright, B[0]).tex('uTex', 0, this.scene.tex).f('uTexel', 1 / this.scene.w, 1 / this.scene.h).f('uThresh', this.float ? po.thresh : po.thresh * 0.75);
    this.drawQuad();
    for (let i = 1; i < B.length; i++) {
      this.full(this.P.down, B[i]).tex('uTex', 0, B[i - 1].tex).f('uTexel', 1 / B[i - 1].w, 1 / B[i - 1].h);
      this.drawQuad();
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = B.length - 1; i > 0; i--) {
      this.full(this.P.up, B[i - 1]).tex('uTex', 0, B[i].tex).f('uTexel', 1 / B[i].w, 1 / B[i].h).f('uK', 1);
      this.drawQuad();
    }
    gl.disable(gl.BLEND);
    // composición final
    const P = this.full(this.P.comp, null);
    const waves = new Float32Array(16);
    po.waves.slice(0, 4).forEach((w, i) => {
      const [sx, sy] = this.toScreen(w.x, w.y);
      waves.set([sx / this.canvas.clientWidth, 1 - sy / this.canvas.clientHeight, w.r / this.cam.H, w.k], i * 4);
    });
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    P.i('uNoise', 7).tex('uScene', 0, this.scene.tex).tex('uBloom', 1, B[0].tex).tex('uRays', 2, this.rays.tex)
      .f('uRayCol', this.rayCol[0], this.rayCol[1], this.rayCol[2], this.rayK)
      .f('uRes', this.W, this.H).f('uTime', this.time).f('uBloomK', po.bloom).f('uExposure', po.exposure)
      .f('uCA', po.ca).f('uFlash', po.flash).f('uInvert', po.invert).f('uVig', po.vig).f('uGrain', po.grain)
      .f('uPaper', po.paper).f('uSat', po.sat).f('uLift', ...po.lift).f('uGamma', ...po.gamma).f('uGain', ...po.gain);
    gl.uniform4fv(P.u('uWaves'), waves);
    this.drawQuad();
  }
}
