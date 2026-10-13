// Materiales toon: la rampa de cinco tonos de cada material (palette.ts) elegida por bandas, no por degradé.
//  - luz principal (el farol, cálida, de arriba y adelante) en media-Lambert: base → S → D;
//  - faroles locales (hasta 6, los más cercanos a la cámara): suben la banda y, muy cerca, dan el brillo cálido H;
//  - en el metal, una banda de brillo nítida (el latón tiene que «chispear»);
//  - contraluz frío R en banda dura, solo en el borde y del lado de atrás;
//  - profundidad: lo que está detrás del plano de juego se funde con la bruma por escalones tramados (Bayer 4×4)
//    y lo que está delante se apaga hacia la tinta;
//  - emisivos en HDR (el alfa marca cuánto brilla: lo usa el bloom escalonado de pixel.ts);
//  - destello de golpe, aura roja de peligro y disolución con borde de brasa.
// Todas las instancias comparten los uniformes de `LIGHT` (los mismos objetos {value}).
import * as THREE from 'three';
import { MAT, EMIT, lin, type MatName, type Ramp } from './palette.ts';

const NPL = 6;
export const LIGHT = {
  uKeyDir: { value: new THREE.Vector3(-0.45, 0.75, 0.5).normalize() },
  uKeyK: { value: 0.6 },
  uAmb: { value: 0.0 },
  uRimDir: { value: new THREE.Vector3(0.7, 0.35, -0.6).normalize() },
  uPL: { value: Array.from({ length: NPL }, () => new THREE.Vector4(0, -999, 0, 1)) },   // posición y radio
  uPLk: { value: new Array(NPL).fill(0) as number[] },                                   // intensidad
  uFog: { value: lin('#3d354c') },
  uFogZ: { value: new THREE.Vector2(4, 60) },      // de dónde a dónde (metros detrás del plano) entra la bruma
  uFogMax: { value: 0.85 },
  uNear: { value: lin('#1b1420') },
  uNearZ: { value: new THREE.Vector2(2.5, 7) },    // delante del plano: se apaga hacia la tinta
  uTime: { value: 0 },
  uCel: { value: 1 },
  uWarm: { value: lin('#ffb35a') },                              // 0 = sombreado continuo (comparación «3D crudo»)
};

const VERT = /* glsl */`
out vec3 vW; out vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
uniform vec3 uBase, uS, uD, uR, uH;
uniform float uMetal, uRough, uBias;
uniform vec3 uEmit; uniform float uEmitK;
uniform float uFlash; uniform vec3 uFlashC;
uniform float uDis; uniform vec3 uDisC;
uniform vec3 uAura; uniform float uAuraK;
uniform vec3 uKeyDir; uniform float uKeyK, uAmb; uniform vec3 uRimDir;
uniform vec4 uPL[${NPL}]; uniform float uPLk[${NPL}];
uniform vec3 uFog; uniform vec2 uFogZ; uniform float uFogMax;
uniform vec3 uNear; uniform vec2 uNearZ;
uniform float uTime, uCel; uniform vec3 uWarm;
in vec3 vW; in vec3 vN;

float bayer(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  float glow = 0.0;
  bool edge = false;
  if (uDis > 0.0) {
    float n = vnoise(vW * 7.0) * 0.65 + vnoise(vW * 19.0) * 0.35;
    float th = uDis * 1.15 - 0.05 + (vW.y - 1.0) * 0.0;
    if (n < th) discard;
    edge = n < th + 0.07;
  }
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vW);
  float key = dot(N, uKeyDir) * 0.5 + 0.5;
  float lit = key * uKeyK + uAmb + uBias;
  float pl = 0.0;
  for (int i = 0; i < ${NPL}; i++) {
    vec3 d = uPL[i].xyz - vW;
    float a = clamp(1.0 - length(d) / uPL[i].w, 0.0, 1.0);
    pl += a * (max(dot(N, normalize(d)), 0.0) * 0.75 + 0.25) * uPLk[i];
  }
  lit += pl * 0.55;
  // dentro del charco de luz de un farol: dos escalones, con el borde tramado
  float pool = step(0.3, pl + (bayer(gl_FragCoord.xy) - 0.5) * 0.1) * 0.5 + step(0.6, pl + (bayer(gl_FragCoord.xy) - 0.5) * 0.1) * 0.5;
  vec3 c;
  if (uCel > 0.5) {
    c = lit > 0.6 ? uBase : (lit > 0.34 ? uS : uD);
    vec3 Hh = normalize(uKeyDir + V);
    float sp = pow(max(dot(N, Hh), 0.0), 18.0 + 40.0 * (1.0 - uRough));
    if (lit > 0.6 && ((uMetal > 0.0 && sp * uMetal > 0.42) || pl > 1.05)) c = uH;
    float fr = 1.0 - max(dot(N, V), 0.0);
    if (fr > 0.68 && dot(N, uRimDir) > 0.4 && dot(N, uKeyDir) < 0.2) c = uR;
    // el charco del farol tiñe cálido (en un escalón, sin degradé)
    c = mix(c, c * uWarm * 1.7, pool * 0.45);
  } else {
    c = mix(uD, uS, smoothstep(0.1, 0.45, lit));
    c = mix(c, uBase, smoothstep(0.45, 0.75, lit));
    vec3 Hh = normalize(uKeyDir + V);
    c = mix(c, uH, clamp(pow(max(dot(N, Hh), 0.0), 30.0) * uMetal + max(pl - 0.8, 0.0), 0.0, 1.0));
  }
  float dz = -vW.z;
  float br = bayer(gl_FragCoord.xy);
  if (dz > uFogZ.x) {
    float f = clamp((dz - uFogZ.x) / (uFogZ.y - uFogZ.x), 0.0, 1.0) * uFogMax;
    f = uCel > 0.5 ? floor(f * 5.0 + br) / 5.0 : f;
    c = mix(c, uFog, f);
  }
  if (-dz > uNearZ.x) {
    float f = clamp((-dz - uNearZ.x) / (uNearZ.y - uNearZ.x), 0.0, 1.0) * 0.8;
    f = uCel > 0.5 ? floor(f * 4.0 + br) / 4.0 : f;
    c = mix(c, uNear, f);
  }
  if (uEmitK > 0.0) { c = uEmit; glow = uEmitK; }
  if (uAuraK > 0.0) {
    float fr = 1.0 - max(dot(N, V), 0.0);
    if (fr > 0.5) { c = uAura; glow = uAuraK; }
    else c = mix(c, c * vec3(1.25, 0.55, 0.55), 0.6 * uAuraK);
  }
  if (uFlash > 0.0) { c = mix(c, uFlashC, uFlash); glow = max(glow, uFlash * 0.7); }
  if (edge) { c = uDisC; glow = 1.0; }
  gl_FragColor = vec4(c, glow);
}`;

export type ToonOpts = { metal?: number, rough?: number, bias?: number, emit?: string, emitK?: number, side?: THREE.Side, flat?: boolean };
export type Toon = THREE.ShaderMaterial & { isToon: true };

export function toon(ramp: MatName | Ramp, o: ToonOpts = {}): Toon {
  const r = typeof ramp === 'string' ? MAT[ramp] : ramp;
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: o.side ?? THREE.FrontSide,
    uniforms: {
      ...LIGHT,
      uBase: { value: lin(r.base) }, uS: { value: lin(r.S) }, uD: { value: lin(r.D) }, uR: { value: lin(r.R) }, uH: { value: lin(r.H) },
      uMetal: { value: o.metal ?? 0 }, uRough: { value: o.rough ?? 0.5 }, uBias: { value: o.bias ?? 0 },
      uEmit: { value: lin(o.emit ?? '#000000').multiplyScalar(1.6) }, uEmitK: { value: o.emitK ?? (o.emit ? 1 : 0) },
      uFlash: { value: 0 }, uFlashC: { value: lin('#ffffff').multiplyScalar(1.4) },
      uDis: { value: 0 }, uDisC: { value: lin(EMIT.peligro[1]).multiplyScalar(2.2) },
      uAura: { value: lin(EMIT.peligro[1]).multiplyScalar(1.15) }, uAuraK: { value: 0 },
    },
  }) as Toon;
  m.isToon = true;
  return m;
}

// un emisivo puro (monóculo, ventanilla, ojos, llama del farol): k = cuánto brilla
export function glowMat(color: string, k = 1, mult = 1.6): Toon {
  const m = toon('shadow', { emit: color, emitK: k });
  m.uniforms.uEmit.value = lin(color).multiplyScalar(mult);
  return m;
}
export function setEmit(m: Toon, color: string, mult = 1.6) { m.uniforms.uEmit.value.copy(lin(color)).multiplyScalar(mult); }

// recorre los materiales toon de un objeto (para destellos, aura y disolución de un modelo entero)
export function eachToon(o: THREE.Object3D, f: (m: Toon) => void) {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as Toon | Toon[] | undefined;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) if (x.isToon) f(x);
  });
}
export function setUniform(o: THREE.Object3D, name: string, v: number) {
  eachToon(o, (m) => { if (m.uniforms[name] && !(name === 'uEmitK' && m.uniforms.uEmitK.value === 0)) m.uniforms[name].value = v; });
}
