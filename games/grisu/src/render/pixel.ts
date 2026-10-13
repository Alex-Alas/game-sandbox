// El pipeline de 3D pixelado (GDD §13.3). Por cuadro:
//  1. la escena con los materiales toon → `rtC` a la resolución interna (+1 px de margen por lado), HDR; el alfa es
//     cuánto brilla cada píxel;
//  2. la misma escena con un material de normales y profundidad → `rtN` (solo lo que tiene contorno: capa 1);
//  3. brillo: lo emisivo (y los efectos que brillan) se desenfoca a esa misma resolución y se suma en 2–3 escalones
//     tramados: un halo de píxeles, no un desenfoque suave;
//  4. composición en baja: contorno exterior de 1 px (la tinta, mezclada con el tono oscuro del propio material:
//     el *selout*), bordes convexos interiores aclarados y pliegues oscurecidos (la técnica de t3ssel8r), la capa de
//     efectos en píxel (fx.ts), el brillo, el destello de pantalla y la cuantización por la LUT de paleta;
//  5. ampliación a factor entero con vecino más cercano y el corrimiento subpíxel de la cámara anclada (camera.ts);
//     lo que sobra va en bordes.
// En modo «crudo vs pixelado» la misma escena se dibuja además a resolución completa y una línea divide la pantalla.
import * as THREE from 'three';
import { buildLut, paletteColors, INK, lin } from './palette.ts';
import { LIGHT } from './toon.ts';

const FS_VERT = /* glsl */`out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ND_VERT = /* glsl */`
out vec3 vN; out float vZ;
void main() {
  vec4 v = modelViewMatrix * vec4(position, 1.0);
  vZ = -v.z;
  vN = normalize(transpose(inverse(mat3(modelViewMatrix))) * normal);
  gl_Position = projectionMatrix * v;
}`;
const ND_FRAG = /* glsl */`
in vec3 vN; in float vZ;
void main() { vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n, vZ); }`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D uTex; uniform vec2 uDir; uniform float uExtract;
in vec2 vUv;
vec3 src(vec2 uv) {
  vec4 c = texture(uTex, uv);
  return uExtract > 0.5 ? c.rgb * c.a : c.rgb;
}
void main() {
  vec3 s = src(vUv) * 0.2270;
  s += (src(vUv + uDir * 1.0) + src(vUv - uDir * 1.0)) * 0.1945;
  s += (src(vUv + uDir * 2.0) + src(vUv - uDir * 2.0)) * 0.1216;
  s += (src(vUv + uDir * 3.0) + src(vUv - uDir * 3.0)) * 0.0540;
  s += (src(vUv + uDir * 4.0) + src(vUv - uDir * 4.0)) * 0.0162;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMP_FRAG = /* glsl */`
uniform sampler2D uC, uN, uB, uFx;
uniform highp sampler3D uLut;
uniform vec2 uTexel;
uniform vec3 uInk, uRimC; uniform vec2 uRimDir;
uniform float uOutline, uEdges, uBloom, uUseLut, uFlash;
uniform vec3 uFlashC;
in vec2 vUv;
float bayer(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
vec3 toSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vec4 C = texture(uC, vUv);
  vec4 N = texture(uN, vUv);
  vec3 c = C.rgb;
  float d = N.a;
  if (d > 0.0 && C.a < 0.5) {
    // contorno exterior: este píxel está delante de un vecino que está bastante más lejos (o es fondo)
    float thr = 0.06 * d + 0.12;
    float out_ = 0.0, crease = 0.0, convex = 0.0, rim = 0.0;
    vec2 offs[4] = vec2[4](vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1));
    for (int i = 0; i < 4; i++) {
      vec4 M = texture(uN, vUv + offs[i] * uTexel);
      float md = M.a > 0.0 ? M.a : 1e4;
      if (md - d > thr) { out_ = 1.0; if (dot(offs[i], uRimDir) > 0.5 && md - d > 2.0) rim = 1.0; }
      else if (abs(md - d) < thr) {
        // bordes interiores (t3ssel8r): la normal cambia; convexo si se abre hacia el vecino
        // (de un convexo, el vecino gira alejándose: N − M apunta contra él; se marca solo el píxel más cercano)
        vec3 dn = N.rgb - M.rgb;
        float e = dot(dn.xy, offs[i]);
        if (length(dn) > 0.85) {
          if (e < -0.2 && md >= d) convex = 1.0;
          else if (e > 0.2 && md >= d) crease = 1.0;
        }
      }
    }
    if (rim > 0.0 && uOutline > 0.5) {
      // contraluz frío: del lado de atrás, el borde de la silueta se aclara en vez de entintarse
      c = mix(c, uRimC, 0.7);
    } else if (out_ > 0.0 && uOutline > 0.5) {
      // selout: tinta teñida del tono oscuro del material
      c = mix(uInk, c * vec3(0.42, 0.36, 0.48), 0.35);
    } else if (uEdges > 0.5) {
      if (convex > 0.0) c = c * 1.22 + vec3(0.006, 0.005, 0.006);
      else if (crease > 0.0) c *= 0.62;
    }
  }
  // capa de efectos en píxel: a=0 vacío, a≈0,8 sólido, a=1 sólido que brilla
  vec4 F = texture(uFx, vUv);
  float fxGlow = 0.0;
  if (F.a > 0.05) { c = toLin(F.rgb) * (F.a > 0.9 ? 1.5 : 1.0); fxGlow = F.a > 0.9 ? 1.0 : 0.0; }
  // brillo escalonado
  if (uBloom > 0.0) {
    vec3 b = texture(uB, vUv).rgb * uBloom;
    float l = max(b.r, max(b.g, b.b));
    if (l > 0.001) {
      float st = floor(l * 3.2 + bayer(gl_FragCoord.xy) * 0.9) / 3.2;
      c += (b / l) * min(st, 1.2) * 0.75;
    }
  }
  if (uFlash > 0.0) c = mix(c, uFlashC, uFlash);
  vec3 s = toSrgb(c);
  if (uUseLut > 0.5) s = texture(uLut, s).rgb;
  gl_FragColor = vec4(s, 1.0);
}`;

const UP_FRAG = /* glsl */`
uniform sampler2D uLow, uFull;
uniform vec2 uLowSize, uScreen, uOrigin, uFrac;
uniform float uK, uSplit, uHasFull;
uniform vec3 uBorder;
in vec2 vUv;
vec3 toSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 p = gl_FragCoord.xy;
  if (uHasFull > 0.5 && p.x < uSplit) { gl_FragColor = vec4(toSrgb(texture(uFull, p / uScreen).rgb), 1.0); return; }
  vec2 q = (p - uOrigin) / uK;                // píxel interno (sin margen)
  if (q.x < 0.0 || q.y < 0.0 || q.x > uLowSize.x - 2.0 || q.y > uLowSize.y - 2.0) { gl_FragColor = vec4(uBorder, 1.0); return; }
  vec2 t = floor(q + 1.0 + uFrac) + 0.5;      // +1: el margen; uFrac: corrimiento subpíxel de la cámara
  gl_FragColor = vec4(texture(uLow, t / uLowSize).rgb, 1.0);
}`;

function fsMat(frag: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}
function rt(w: number, h: number, type: THREE.TextureDataType, depth: boolean) {
  const t = new THREE.WebGLRenderTarget(w, h, { type, depthBuffer: depth, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  t.texture.colorSpace = THREE.NoColorSpace;
  return t;
}

export const HEIGHTS = [340, 360, 400, 420];

export class Pixel {
  gl: THREE.WebGLRenderer;
  H = 360;          // alto interno elegido
  W = 640;          // ancho interno (sale de la pantalla)
  k = 2;            // factor de ampliación
  sw = 1; sh = 1;   // pantalla en píxeles físicos
  frac = new THREE.Vector2();   // corrimiento subpíxel (en píxeles internos)
  rtC!: THREE.WebGLRenderTarget; rtN!: THREE.WebGLRenderTarget; rtB1!: THREE.WebGLRenderTarget; rtB2!: THREE.WebGLRenderTarget;
  rtLow!: THREE.WebGLRenderTarget; rtFull: THREE.WebGLRenderTarget | null = null;
  fxTex!: THREE.DataTexture; fxData!: Uint8Array;
  quad: THREE.Mesh; qScene = new THREE.Scene(); qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  ndMat: THREE.ShaderMaterial; blur: THREE.ShaderMaterial; comp: THREE.ShaderMaterial; up: THREE.ShaderMaterial;
  opt = { outline: true, edges: true, bloom: 1, lut: true, split: -1 as number };  // split: x en px CSS de la línea (−1 = sin)
  dpr = 1;
  flash = 0;
  onFx?: (data: Uint8Array, w: number, h: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.setPixelRatio(1);
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.autoClear = false;
    this.ndMat = new THREE.ShaderMaterial({ vertexShader: ND_VERT, fragmentShader: ND_FRAG, side: THREE.DoubleSide });
    this.blur = fsMat(BLUR_FRAG, { uTex: { value: null }, uDir: { value: new THREE.Vector2() }, uExtract: { value: 0 } });
    this.comp = fsMat(COMP_FRAG, {
      uC: { value: null }, uN: { value: null }, uB: { value: null }, uFx: { value: null }, uLut: { value: buildLut(paletteColors()) },
      uTexel: { value: new THREE.Vector2() }, uInk: { value: lin(INK) }, uRimC: { value: lin('#8aa0b8') }, uRimDir: { value: new THREE.Vector2(1, 0) }, uOutline: { value: 1 }, uEdges: { value: 1 }, uBloom: { value: 1 },
      uUseLut: { value: 1 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 1, 1) },
    });
    this.up = fsMat(UP_FRAG, {
      uLow: { value: null }, uFull: { value: null }, uLowSize: { value: new THREE.Vector2() }, uScreen: { value: new THREE.Vector2() },
      uOrigin: { value: new THREE.Vector2() }, uFrac: { value: new THREE.Vector2() }, uK: { value: 1 }, uSplit: { value: -1 }, uHasFull: { value: 0 },
      uBorder: { value: new THREE.Color(0x0d0b12) },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.comp);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
    this.resize(1, 1, 1);
  }

  // pantalla en px CSS y la escala del dispositivo; recalcula la resolución interna
  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const sw = Math.max(1, Math.round(cssW * dpr)), sh = Math.max(1, Math.round(cssH * dpr));
    const k = Math.max(1, Math.floor(sh / this.H));
    const W = Math.ceil(sw / k);
    const changed = sw !== this.sw || sh !== this.sh || k !== this.k || W !== this.W || !this.rtC;
    this.sw = sw; this.sh = sh;
    this.gl.setSize(sw, sh, false);
    if (!changed) return;
    this.k = k; this.W = W;
    const w = W + 2, h = this.H + 2;
    for (const r of [this.rtC, this.rtN, this.rtB1, this.rtB2, this.rtLow]) r?.dispose();
    this.rtC = rt(w, h, THREE.HalfFloatType, true);
    this.rtN = rt(w, h, THREE.HalfFloatType, true);
    this.rtB1 = rt(w, h, THREE.HalfFloatType, false);
    this.rtB2 = rt(w, h, THREE.HalfFloatType, false);
    this.rtLow = rt(w, h, THREE.UnsignedByteType, false);
    this.fxData = new Uint8Array(w * h * 4);
    this.fxTex?.dispose();
    this.fxTex = new THREE.DataTexture(this.fxData, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.fxTex.minFilter = this.fxTex.magFilter = THREE.NearestFilter;
    this.fxTex.colorSpace = THREE.NoColorSpace;
    this.fxTex.needsUpdate = true;
  }
  setHeight(H: number) { this.H = H; this.rtC?.dispose(); (this as any).rtC = null; this.resize(this.sw / this.dpr, this.sh / this.dpr, this.dpr); }

  // tamaño del lienzo de render (con margen)
  get rw() { return this.W + 2; }
  get rh() { return this.H + 2; }

  private pass(m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = m;
    this.gl.setRenderTarget(target);
    this.gl.render(this.qScene, this.qCam);
  }

  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera, bg: THREE.Color) {
    const { gl } = this;
    cam.aspect = this.rw / this.rh;
    cam.updateProjectionMatrix();
    // 1. color
    gl.setRenderTarget(this.rtC);
    gl.setClearColor(bg, 0);
    gl.clear(true, true, true);
    cam.layers.set(0);
    LIGHT.uCel.value = 1;
    gl.render(scene, cam);
    // 2. normales y profundidad (solo capa 1: lo que lleva contorno)
    gl.setRenderTarget(this.rtN);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
    cam.layers.set(1);
    scene.overrideMaterial = this.ndMat;
    gl.render(scene, cam);
    scene.overrideMaterial = null;
    cam.layers.set(0);
    // 3. brillo
    const tx = new THREE.Vector2(1 / this.rw, 1 / this.rh);
    if (this.opt.bloom > 0) {
      const b = this.blur.uniforms;
      b.uTex.value = this.rtC.texture; b.uDir.value.set(tx.x, 0); b.uExtract.value = 1; this.pass(this.blur, this.rtB1);
      b.uTex.value = this.rtB1.texture; b.uDir.value.set(0, tx.y); b.uExtract.value = 0; this.pass(this.blur, this.rtB2);
    }
    // 4. composición en baja
    this.onFx?.(this.fxData, this.rw, this.rh);
    this.fxTex.needsUpdate = true;
    const u = this.comp.uniforms;
    u.uC.value = this.rtC.texture; u.uN.value = this.rtN.texture; u.uB.value = this.rtB2.texture; u.uFx.value = this.fxTex;
    u.uTexel.value.copy(tx);
    u.uOutline.value = this.opt.outline ? 1 : 0; u.uEdges.value = this.opt.edges ? 1 : 0;
    u.uBloom.value = this.opt.bloom; u.uUseLut.value = this.opt.lut ? 1 : 0; u.uFlash.value = this.flash;
    this.pass(this.comp, this.rtLow);
    // (opcional) la escena a resolución completa para la comparación
    const split = this.opt.split >= 0;
    if (split) {
      if (!this.rtFull || this.rtFull.width !== this.sw || this.rtFull.height !== this.sh) {
        this.rtFull?.dispose();
        this.rtFull = new THREE.WebGLRenderTarget(this.sw, this.sh, { type: THREE.HalfFloatType, samples: 4 });
      }
      cam.aspect = this.sw / this.sh; cam.updateProjectionMatrix();
      gl.setRenderTarget(this.rtFull);
      gl.setClearColor(bg, 1);
      gl.clear(true, true, true);
      LIGHT.uCel.value = 0;
      gl.render(scene, cam);
      LIGHT.uCel.value = 1;
      cam.aspect = this.rw / this.rh; cam.updateProjectionMatrix();
    }
    // 5. ampliación
    const v = this.up.uniforms, k = this.k;
    const ox = Math.floor((this.sw - this.W * k) / 2), oy = Math.floor((this.sh - this.H * k) / 2);
    v.uLow.value = this.rtLow.texture; v.uLowSize.value.set(this.rw, this.rh); v.uScreen.value.set(this.sw, this.sh);
    v.uOrigin.value.set(ox, oy); v.uFrac.value.copy(this.frac); v.uK.value = k;
    v.uFull.value = this.rtFull?.texture ?? null; v.uHasFull.value = split ? 1 : 0; v.uSplit.value = this.opt.split * this.dpr;
    gl.setRenderTarget(null);
    gl.setViewport(0, 0, this.sw, this.sh);
    this.pass(this.up, null);
  }

  // la cámara usa el mismo aspecto que el lienzo interno: para proyectar efectos al píxel
  project(cam: THREE.PerspectiveCamera, p: THREE.Vector3, out = new THREE.Vector3()) {
    out.copy(p).project(cam);
    out.x = (out.x * 0.5 + 0.5) * this.rw;
    out.y = (out.y * 0.5 + 0.5) * this.rh;   // y hacia arriba, fila 0 abajo (como la textura)
    return out;
  }
  // un punto de la pantalla (px CSS) → píxel interno (con margen; y hacia arriba)
  screenToLow(x: number, y: number) {
    const k = this.k, ox = Math.floor((this.sw - this.W * k) / 2), oy = Math.floor((this.sh - this.H * k) / 2);
    const px = x * this.dpr, py = this.sh - y * this.dpr;
    return [(px - ox) / k + 1 + this.frac.x, (py - oy) / k + 1 + this.frac.y];
  }
}
