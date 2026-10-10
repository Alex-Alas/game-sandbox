// GLSL del kit. Todo en espacio de mundo (y hacia arriba); la cámara es en perspectiva para que las
// capas pintadas tengan parallax real (cámara multiplano) y se pueda mostrar la vista «despiezada».
export const HEAD = `#version 300 es
precision highp float;
`;

// Ruido desde la textura repetible (uNoise): r fino, g grueso, b azar, a medio
export const NOISE = `
uniform sampler2D uNoise;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float nG(vec2 p){ return texture(uNoise, p).g; }   // período 1 = 4 celdas
float nR(vec2 p){ return texture(uNoise, p).r; }
float nA(vec2 p){ return texture(uNoise, p).a; }
float fbm(vec2 p){ return nG(p * 0.25) * 0.6 + nA(p * 0.25 + 0.37) * 0.4; }
`;

// Quad en el mundo: rectángulo (x0, y0, x1, y1) a profundidad z
export const QUAD_VS = HEAD + `
layout(location = 0) in vec2 aPos;
uniform mat4 uVP;
uniform vec4 uRect;
uniform float uZ;
uniform vec4 uSkew; // x: desplazamiento horizontal arriba (viento), y: fase
out vec2 vUV;
out vec3 vW;
void main(){
  vec2 p = mix(uRect.xy, uRect.zw, aPos);
  vUV = vec2(aPos.x, 1.0 - aPos.y);
  vW = vec3(p, uZ);
  gl_Position = uVP * vec4(p, uZ, 1.0);
}`;

export const FULL_VS = HEAD + `
layout(location = 0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

// Cielo: degradé con bruma, nubes lentas y un astro con halo (HDR: lo agarra el bloom)
export const SKY_FS = HEAD + NOISE + `
in vec2 vUV;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uTop, uMid, uHor;
uniform vec3 uSun; // xy en pantalla (0..1), radio
uniform vec3 uSunCol;
uniform vec2 uPan; // corrimiento de la cámara (parallax mínimo)
out vec4 o;
void main(){
  vec2 uv = vUV;
  float asp = uRes.x / uRes.y;
  float y = uv.y;
  vec3 c = mix(uHor, uMid, smoothstep(0.15, 0.55, y));
  c = mix(c, uTop, smoothstep(0.55, 1.0, y));
  vec2 q = vec2((uv.x - 0.5) * asp, uv.y) + uPan;
  // nubes en capas, muy oscuras contra el cielo
  float n = fbm(q * vec2(0.8, 2.0) + vec2(uTime * 0.004, 0.0));
  float n2 = fbm(q * vec2(1.5, 3.5) - vec2(uTime * 0.007, 0.0) + 5.0);
  float band = smoothstep(0.35, 0.8, n) * smoothstep(0.2, 0.65, y) * (1.0 - smoothstep(0.85, 1.0, y));
  c = mix(c, c * 0.72 + uMid * 0.05, band * 0.6);
  c += uSunCol * 0.05 * smoothstep(0.5, 0.9, n2) * smoothstep(0.3, 0.8, y);
  // astro
  vec2 d = vec2((uv.x - uSun.x) * asp, uv.y - uSun.y);
  float r = length(d);
  float disc = smoothstep(uSun.z * 1.08, uSun.z * 0.8, r);
  float halo = exp(-r * 5.0) * 0.32 + exp(-r * 16.0) * 0.5;
  // el astro tapado a medias por jirones de nube
  float veil = 0.45 + 0.55 * smoothstep(0.35, 0.7, fbm(q * vec2(2.0, 5.0) + vec2(uTime * 0.01, 0.0) + 9.0));
  c += uSunCol * (disc * 1.5 * veil + halo);
  o = vec4(c, 1.0);
}`;

// Capa pintada: niebla por profundidad y por altura, vaivén con el viento, luz del astro
export const LAYER_FS = HEAD + NOISE + `
in vec2 vUV;
in vec3 vW;
uniform sampler2D uTex;
uniform float uTime;
uniform vec4 uFog;        // rgb, cantidad
uniform vec4 uMist;       // rgb, cantidad de bruma baja
uniform float uMistY;     // altura de la bruma
uniform vec3 uTint;
uniform float uSway;      // vaivén (unidades de uv)
uniform float uBlur;      // desenfoque (lod de mipmap)
uniform vec4 uLight;      // xy mundo, radio, fuerza (luz cálida local)
uniform vec3 uLightCol;
uniform float uAlpha;
out vec4 o;
void main(){
  vec2 uv = vUV;
  if (uSway > 0.0) {
    float w = (1.0 - uv.y);
    uv.x += sin(uTime * 0.9 + vW.x * 0.02 + vW.y * 0.01) * uSway * w * w;
  }
  vec4 c = uBlur > 0.0 ? textureLod(uTex, uv, uBlur) : texture(uTex, uv);
  if (c.a < 0.002) discard;
  vec3 col = c.rgb / c.a * uTint;
  // luz local (farol) que tiñe lo cercano
  float dl = length(vW.xy - uLight.xy);
  col += uLightCol * uLight.w * exp(-dl / uLight.z) * c.a;
  float mist = (1.0 - smoothstep(uMistY - 50.0, uMistY + 50.0, vW.y)) * uMist.a;
  col = mix(col, uFog.rgb, uFog.a);
  if (mist > 0.0) col = mix(col, uMist.rgb, mist * (0.55 + 0.45 * fbm(vW.xy * 0.004 + vec2(uTime * 0.012, 0.0))));
  o = vec4(col * c.a, c.a) * uAlpha;
}`;

// Sprite de personaje: color + brillo (HDR), destello al recibir golpe, grano de papel y niebla
export const SPRITE_FS = HEAD + NOISE + `
in vec2 vUV;
in vec3 vW;
uniform sampler2D uTex, uGlow;
uniform float uTime, uGlowK, uFlash, uSeed, uDissolve;
uniform vec4 uTint;       // rgb, cantidad
uniform vec4 uFog;
uniform vec4 uLight;
uniform vec3 uLightCol;
uniform vec2 uGround;     // y del suelo, oscurecer los pies (oclusión)
uniform float uAlpha;
out vec4 o;
void main(){
  vec4 c = texture(uTex, vUV);
  vec4 g = texture(uGlow, vUV);
  float a = c.a;
  if (a < 0.002 && g.a < 0.002) discard;
  vec3 col = a > 0.0 ? c.rgb / a : vec3(0.0);
  // grano: fibras de papel que tiemblan con el dibujo
  float n = nR(vUV * 3.0 + uSeed * 0.137);
  col *= 0.93 + 0.14 * n;
  // oclusión cerca del suelo
  float occ = smoothstep(0.0, 22.0, vW.y - uGround.x);
  col *= mix(0.72, 1.0, occ);
  // luz local
  float dl = length(vW.xy - uLight.xy);
  col += uLightCol * uLight.w * 0.6 * exp(-dl / uLight.z);
  col = mix(col, uTint.rgb, uTint.a);
  col = mix(col, uFog.rgb, uFog.a);
  col = mix(col, vec3(1.0, 0.96, 0.9) * 2.2, uFlash);
  // disolución con borde quemado (muerte / teletransporte)
  if (uDissolve > 0.0) {
    float d = fbm(vUV * 2.0 + uSeed) - uDissolve * 1.1 + 0.05;
    if (d < 0.0) discard;
    col += vec3(3.0, 1.2, 0.4) * (1.0 - smoothstep(0.0, 0.06, d));
  }
  vec3 glow = g.a > 0.0 ? g.rgb / g.a : vec3(0.0);
  o = vec4(col * a + glow * g.a * uGlowK, max(a, g.a * 0.0)) * uAlpha;
}`;

// ---- posproceso ----
export const BRIGHT_FS = HEAD + `
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThresh;
out vec4 o;
void main(){
  vec3 c = vec3(0.0);
  c += texture(uTex, vUV + uTexel * vec2(-1, -1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2( 1, -1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(-1,  1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2( 1,  1)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(0.0, l - uThresh) / max(l, 1e-4);
  o = vec4(min(c * k, vec3(40.0)), 1.0);
}`;

export const DOWN_FS = HEAD + `
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 o;
void main(){
  vec2 t = uTexel;
  vec3 a = texture(uTex, vUV + t * vec2(-2, 2)).rgb, b = texture(uTex, vUV + t * vec2(0, 2)).rgb, c = texture(uTex, vUV + t * vec2(2, 2)).rgb;
  vec3 d = texture(uTex, vUV + t * vec2(-2, 0)).rgb, e = texture(uTex, vUV).rgb, f = texture(uTex, vUV + t * vec2(2, 0)).rgb;
  vec3 g = texture(uTex, vUV + t * vec2(-2, -2)).rgb, h = texture(uTex, vUV + t * vec2(0, -2)).rgb, i = texture(uTex, vUV + t * vec2(2, -2)).rgb;
  vec3 j = texture(uTex, vUV + t * vec2(-1, 1)).rgb, k = texture(uTex, vUV + t * vec2(1, 1)).rgb;
  vec3 l = texture(uTex, vUV + t * vec2(-1, -1)).rgb, m = texture(uTex, vUV + t * vec2(1, -1)).rgb;
  vec3 s = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  o = vec4(s, 1.0);
}`;

export const UP_FS = HEAD + `
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uK;
out vec4 o;
void main(){
  vec2 t = uTexel;
  vec3 s = texture(uTex, vUV).rgb * 4.0;
  s += (texture(uTex, vUV + t * vec2(-1, 0)).rgb + texture(uTex, vUV + t * vec2(1, 0)).rgb + texture(uTex, vUV + t * vec2(0, -1)).rgb + texture(uTex, vUV + t * vec2(0, 1)).rgb) * 2.0;
  s += texture(uTex, vUV + t * vec2(-1, -1)).rgb + texture(uTex, vUV + t * vec2(1, -1)).rgb + texture(uTex, vUV + t * vec2(-1, 1)).rgb + texture(uTex, vUV + t * vec2(1, 1)).rgb;
  o = vec4(s / 16.0 * uK, 1.0);
}`;

export const COMPOSITE_FS = HEAD + NOISE + `
in vec2 vUV;
uniform sampler2D uScene, uBloom, uRays;
uniform vec4 uRayCol;
uniform vec2 uRes;
uniform float uTime, uBloomK, uExposure, uCA, uFlash, uInvert, uVig, uGrain, uPaper, uSat;
uniform vec4 uWaves[4];   // centro uv, radio (fracción del alto), fuerza
uniform vec3 uLift, uGamma, uGain;
out vec4 o;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUV;
  float asp = uRes.x / uRes.y;
  // ondas de choque: corren la imagen en un anillo
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    if (w.w <= 0.0) continue;
    vec2 d = uv - w.xy; d.x *= asp;
    float r = length(d);
    float ring = exp(-pow((r - w.z) / 0.035, 2.0));
    uv -= normalize(d + 1e-5) * ring * w.w * vec2(1.0 / asp, 1.0);
  }
  vec2 cc = uv - 0.5;
  float ca = uCA * (0.2 + dot(cc, cc) * 2.0);
  vec3 col;
  col.r = texture(uScene, uv + cc * ca).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - cc * ca).b;
  col += texture(uBloom, uv).rgb * uBloomK;
  col += texture(uRays, uv).rgb * uRayCol.rgb * uRayCol.a;
  col *= uExposure;
  col = aces(col);
  // gradación: lift/gamma/gain por canal (sombras frías, luces cálidas)
  col = pow(max(vec3(0.0), col * uGain + uLift * (1.0 - col)), 1.0 / uGamma);
  float L = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(L), col, uSat);
  // viñeta
  vec2 v = (vUV - 0.5) * vec2(asp, 1.0);
  col *= 1.0 - uVig * smoothstep(0.35, 1.25, length(v));
  // papel y grano
  float paper = nR(gl_FragCoord.xy / 512.0) * 0.6 + nA(gl_FragCoord.xy / 1400.0) * 0.4;
  col *= 1.0 - uPaper * (paper - 0.45);
  float gr = hash12(vUV * uRes + fract(uTime * 7.31) * 517.0) - 0.5;
  col += gr * uGrain * (1.0 - L * 0.6);
  col = mix(col, vec3(1.0), uFlash);
  col = mix(col, vec3(1.0) - col.bgr * vec3(0.9, 1.0, 1.1), uInvert);
  o = vec4(col, 1.0);
}`;

// ---- rayos de luz volumétricos: máscara del astro tapada por las capas, desenfocada hacia el astro ----
export const SUNMASK_FS = HEAD + `
in vec2 vUV;
uniform vec2 uRes;
uniform vec3 uSun;
out vec4 o;
void main(){
  float asp = uRes.x / uRes.y;
  vec2 d = vec2((vUV.x - uSun.x) * asp, vUV.y - uSun.y);
  float r = length(d);
  float m = smoothstep(uSun.z * 1.2, 0.0, r) * 1.6 + exp(-r * 4.5) * 0.55 + 0.04 * smoothstep(0.2, 1.0, vUV.y);
  o = vec4(vec3(m), 1.0);
}`;

export const OCC_FS = HEAD + `
in vec2 vUV;
uniform sampler2D uTex;
uniform float uK;
out vec4 o;
void main(){
  float a = textureLod(uTex, vUV, 2.0).a * uK;
  o = vec4(0.0, 0.0, 0.0, a);
}`;

export const RAYS_FS = HEAD + `
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uSun;
uniform float uDecay, uDensity, uSeed;
out vec4 o;
const int N = 48;
void main(){
  vec2 d = (vUV - uSun) * (uDensity / float(N));
  vec2 uv = vUV;
  float illum = 1.0, acc = 0.0;
  // jitter para que no haga bandas
  uv -= d * fract(sin(dot(vUV * 431.0 + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
  for (int i = 0; i < N; i++) {
    uv -= d;
    acc += texture(uTex, uv).r * illum;
    illum *= uDecay;
  }
  o = vec4(vec3(acc / float(N)), 1.0);
}`;

// Haz de luz inclinado (aditivo) con polvo que flota a contraluz
export const SHAFT_FS = HEAD + NOISE + `
in vec2 vUV;
in vec3 vW;
uniform float uTime, uSlant, uK, uSeed;
uniform vec3 uCol;
out vec4 o;
void main(){
  float y = vUV.y;
  float u = vUV.x + y * uSlant;
  float n = texture(uNoise, vec2(u * 1.3 + uSeed, uTime * 0.006)).g;
  float n2 = texture(uNoise, vec2(u * 3.1 + uSeed * 2.0, -uTime * 0.01)).a;
  float beams = smoothstep(0.42, 0.8, n) * 0.85 + smoothstep(0.55, 0.9, n2) * 0.45;
  float fy = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.45, 1.0, y));
  float fx = smoothstep(0.0, 0.3, vUV.x) * (1.0 - smoothstep(0.7, 1.0, vUV.x));
  float k = beams * fy * fx;
  float d = texture(uNoise, vec2(u * 6.0 + uSeed, y * 3.0 - uTime * 0.012)).b;
  float mote = smoothstep(0.985, 1.0, d) * (0.5 + 0.5 * sin(uTime * 3.0 + d * 90.0));
  vec3 c = uCol * (k * uK + mote * fy * fx * uK * 6.0);
  o = vec4(c, 0.0);
}`;

// Banco de niebla que se arrastra (alfa premultiplicado)
export const FOGBAND_FS = HEAD + NOISE + `
in vec2 vUV;
in vec3 vW;
uniform float uTime, uK, uSeed, uSpeed;
uniform vec3 uCol;
out vec4 o;
void main(){
  float y = vUV.y;
  float n = fbm(vec2(vUV.x * 3.0 + uTime * uSpeed + uSeed, y * 1.2 + uSeed));
  float n2 = fbm(vec2(vUV.x * 7.0 - uTime * uSpeed * 1.7, y * 2.5 + 3.0));
  float band = smoothstep(0.0, 0.45, y) * (1.0 - smoothstep(0.55, 1.0, y));
  float edge = smoothstep(0.0, 0.15, vUV.x) * (1.0 - smoothstep(0.85, 1.0, vUV.x));
  float a = clamp(smoothstep(0.35, 0.75, n * 0.7 + n2 * 0.5) * band * edge * uK, 0.0, 1.0);
  o = vec4(uCol * a, a);
}`;
