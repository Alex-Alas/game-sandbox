// Ayudas mínimas de WebGL2: programas con caché de uniforms, texturas desde lienzos y destinos (FBO).
export type GL = WebGL2RenderingContext;

export class Prog {
  p: WebGLProgram;
  private loc = new Map<string, WebGLUniformLocation | null>();
  gl: GL;
  constructor(gl: GL, vs: string, fs: string, name = '') {
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
        throw new Error(`shader ${name}: ${log}\n${lines}`);
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
    this.p = p;
  }
  use() { this.gl.useProgram(this.p); return this; }
  u(n: string) {
    let l = this.loc.get(n);
    if (l === undefined) { l = this.gl.getUniformLocation(this.p, n); this.loc.set(n, l); }
    return l;
  }
  f(n: string, ...v: number[]) {
    const l = this.u(n); if (!l) return this;
    const g = this.gl;
    if (v.length === 1) g.uniform1f(l, v[0]); else if (v.length === 2) g.uniform2f(l, v[0], v[1]);
    else if (v.length === 3) g.uniform3f(l, v[0], v[1], v[2]); else g.uniform4f(l, v[0], v[1], v[2], v[3]);
    return this;
  }
  fv(n: string, v: Float32Array | number[]) { const l = this.u(n); if (l) this.gl.uniform4fv(l, v); return this; }
  i(n: string, v: number) { const l = this.u(n); if (l) this.gl.uniform1i(l, v); return this; }
  m4(n: string, m: Float32Array) { const l = this.u(n); if (l) this.gl.uniformMatrix4fv(l, false, m); return this; }
  tex(n: string, unit: number, t: WebGLTexture | null) {
    const g = this.gl;
    g.activeTexture(g.TEXTURE0 + unit);
    g.bindTexture(g.TEXTURE_2D, t);
    return this.i(n, unit);
  }
}

export function newTex(gl: GL, w = 1, h = 1, opts: { float?: boolean, linear?: boolean, mips?: boolean } = {}) {
  const t = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0); // la unidad 7 es del ruido: no pisarla
  gl.bindTexture(gl.TEXTURE_2D, t);
  const f = opts.linear === false ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.mips ? gl.LINEAR_MIPMAP_LINEAR : f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (opts.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return t;
}

// Sube un lienzo (alfa premultiplicado). Con mipmaps, el desenfoque de profundidad sale gratis.
export function upload(gl: GL, t: WebGLTexture, src: TexImageSource, mips = false) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (mips) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
}

export class Target {
  tex: WebGLTexture; fbo: WebGLFramebuffer; w = 0; h = 0;
  gl: GL; float: boolean;
  constructor(gl: GL, w: number, h: number, float: boolean) {
    this.gl = gl; this.float = float;
    this.tex = newTex(gl, 1, 1, { float });
    this.fbo = gl.createFramebuffer()!;
    this.resize(w, h);
  }
  resize(w: number, h: number) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w; this.h = h;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind() { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.w, this.h); }
}

// ---- matrices (columna mayor) ----
export function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
export function lookAt(e: number[], c: number[], up: number[]) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
}
export function mul(a: Float32Array, b: Float32Array) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    o[i * 4 + j] = s;
  }
  return o;
}
export function project(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [cx / cw, cy / cw, cw];
}

// Textura de ruido repetible (256²): r = fbm fino, g = fbm grueso, b = azar, a = fbm con otra semilla.
// Reemplaza al ruido calculado por píxel en los shaders (mucho más barato en el teléfono).
export function noiseTex(gl: GL) {
  const N = 256, data = new Uint8Array(N * N * 4);
  const h = (x: number, y: number, s: number) => {
    let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const vn = (x: number, y: number, P: number, s: number) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const m = (k: number) => ((k % P) + P) % P;
    const a = h(m(i), m(j), s), b = h(m(i + 1), m(j), s), c = h(m(i), m(j + 1), s), d = h(m(i + 1), m(j + 1), s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (x: number, y: number, base: number, oct: number, s: number) => {
    let t = 0, a = 0.5, P = base;
    for (let o = 0; o < oct; o++) { t += a * vn(x / N * P, y / N * P, P, s + o); P *= 2; a *= 0.5; }
    return t / (1 - Math.pow(0.5, oct));
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    data[i] = fbm(x, y, 32, 3, 1) * 255;
    data[i + 1] = fbm(x, y, 4, 4, 7) * 255;
    data[i + 2] = h(x, y, 99) * 255;
    data[i + 3] = fbm(x, y, 8, 4, 13) * 255;
  }
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}
