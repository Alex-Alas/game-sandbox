/* Materiales con muestreo triplanar en espacio mundo (texturas PBR de ambientCG).
   Evitan costuras/estiramientos en geometría procedural y en modelos escalados. */
import * as THREE from 'three';

/* Muestreo triplanar barato: derivadas calculadas una vez (textureGrad, válido dentro
   de ramas), se saltan los planos con peso casi nulo y la octava fina se desvanece
   con la distancia (lejos se sustituye por el color medio de la textura). */
const TRI_GLSL = /* glsl */`
varying vec3 vTriPos;
varying vec3 vTriN;
vec3 triDx, triDy;
vec3 sampleXZ(sampler2D t, float s) { return textureGrad(t, vTriPos.xz * s, triDx.xz * s, triDy.xz * s).rgb; }
vec3 sampleZY(sampler2D t, float s) { return textureGrad(t, vTriPos.zy * s, triDx.zy * s, triDy.zy * s).rgb; }
vec3 sampleXY(sampler2D t, float s) { return textureGrad(t, vTriPos.xy * s, triDx.xy * s, triDy.xy * s).rgb; }
vec3 triWeights(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  w *= step(vec3(0.03), w);
  return w / (w.x + w.y + w.z);
}
vec3 triSample(sampler2D t, float s, vec3 w) {
  vec3 c = vec3(0.0);
  if (w.x > 0.0) c += sampleZY(t, s) * w.x;
  if (w.y > 0.0) c += sampleXZ(t, s) * w.y;
  if (w.z > 0.0) c += sampleXY(t, s) * w.z;
  return c;
}
`;

const TRI_VERT = /* glsl */`
{
  vec4 triW = vec4(transformed, 1.0);
  vec3 triN = objectNormal;
  #ifdef USE_INSTANCING
    triW = instanceMatrix * triW;
    triN = mat3(instanceMatrix) * triN;
  #endif
  triW = modelMatrix * triW;
  vTriPos = triW.xyz;
  vTriN = normalize(mat3(modelMatrix) * triN);
}
`;

function injectVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + TRI_VERT);
}

/* Color medio (lineal) de una textura sRGB: sustituye a la octava fina a distancia. */
const avgCache = new WeakMap();
export function averageColor(tex) {
  if (avgCache.has(tex)) return avgCache.get(tex);
  const S = 32;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(tex.image, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const out = new THREE.Vector3();
  for (let i = 0; i < d.length; i += 4) out.x += lin(d[i]), out.y += lin(d[i + 1]), out.z += lin(d[i + 2]);
  out.divideScalar(d.length / 4);
  avgCache.set(tex, out);
  return out;
}

/* Distancia (m) a la que se apaga el detalle fino; la fija el preset de calidad. */
let detailDist = 380;
export function setDetailDistance(d) { detailDist = d; }

/* Roca/piedra genérica para obstáculos. */
export function makeTriplanarMaterial({ map, scale = 0.04, tint = 0xffffff, roughness = 0.92, vertexColors = false }) {
  const mat = new THREE.MeshStandardMaterial({ color: tint, roughness, metalness: 0, vertexColors });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tTri = { value: map };
    shader.uniforms.uTriScale = { value: scale };
    shader.uniforms.uTriAvg = { value: averageColor(map) };
    shader.uniforms.uDetail = { value: detailDist };
    injectVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tTri;\nuniform float uTriScale;\nuniform vec3 uTriAvg;\nuniform float uDetail;\n' + TRI_GLSL)
      .replace('#include <map_fragment>', /* glsl */`
        {
          triDx = dFdx(vTriPos); triDy = dFdy(vTriPos);
          vec3 tw = triWeights(normalize(vTriN));
          float near = 1.0 - smoothstep(uDetail * 0.6, uDetail, distance(cameraPosition, vTriPos));
          vec3 c2 = triSample(tTri, uTriScale * 0.21, tw);
          vec3 c1 = uTriAvg;
          if (near > 0.0) c1 = mix(uTriAvg, triSample(tTri, uTriScale, tw), near);
          diffuseColor.rgb *= mix(c1, c1 * c2 * 2.2, 0.4) * 2.1;
        }`);
  };
  mat.customProgramCacheKey = () => 'tri2-' + scale;
  return mat;
}

/* Terreno: pasto en llano, roca en pendiente, nieve en altura, arena en la orilla.
   Cada capa solo se muestrea donde pesa algo. */
export function makeTerrainMaterial({ grass, rock, snow }) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: grass };
    shader.uniforms.tRock = { value: rock };
    shader.uniforms.tSnow = { value: snow };
    shader.uniforms.uGrassAvg = { value: averageColor(grass) };
    shader.uniforms.uRockAvg = { value: averageColor(rock) };
    shader.uniforms.uDetail = { value: detailDist };
    injectVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass;\nuniform sampler2D tRock;\nuniform sampler2D tSnow;\nuniform vec3 uGrassAvg;\nuniform vec3 uRockAvg;\nuniform float uDetail;\n' + TRI_GLSL)
      .replace('#include <map_fragment>', /* glsl */`
        {
          triDx = dFdx(vTriPos); triDy = dFdy(vTriPos);
          vec3 n = normalize(vTriN);
          float slope = 1.0 - n.y;
          float h = vTriPos.y;
          float near = 1.0 - smoothstep(uDetail * 0.6, uDetail, distance(cameraPosition, vTriPos));
          float macro = sampleXZ(tRock, 0.0013).r;

          float rockW = smoothstep(0.26, 0.42, slope + (macro - 0.5) * 0.18);
          float snowW = smoothstep(330.0, 420.0, h + (macro - 0.5) * 140.0) * (1.0 - smoothstep(0.5, 0.75, slope));
          float sandW = 1.0 - smoothstep(1.5, 6.0, h + (macro - 0.5) * 5.0);

          vec3 col = vec3(0.0);
          if (rockW < 1.0) {
            vec3 grassFar = sampleXZ(tGrass, 0.0065);
            vec3 g = uGrassAvg;
            if (near > 0.0) g = mix(uGrassAvg, sampleXZ(tGrass, 0.05), near);
            vec3 grassC = g * mix(vec3(0.9), grassFar * 1.7, 0.45);
            grassC *= mix(vec3(1.0, 0.92, 0.7), vec3(0.78, 0.9, 0.72), macro);
            if (sandW > 0.0) {
              float sn = near > 0.0 ? mix(uRockAvg.r, sampleXZ(tRock, 0.09).r, near) : uRockAvg.r;
              vec3 sand = vec3(0.58, 0.5, 0.36) * (0.55 + 0.9 * sn);
              grassC = mix(grassC, sand, sandW);
            }
            col = grassC;
          }
          if (rockW > 0.0) {
            vec3 tw = triWeights(n);
            vec3 r1 = uRockAvg;
            if (near > 0.0) r1 = mix(uRockAvg, triSample(tRock, 0.028, tw), near);
            vec3 rockC = mix(r1, r1 * triSample(tRock, 0.0061, tw) * 2.0, 0.45) * vec3(1.75, 1.6, 1.45);
            col = mix(col, rockC, rockW);
          }
          if (snowW > 0.0) col = mix(col, sampleXZ(tSnow, 0.04), snowW);
          col *= mix(0.5, 1.0, smoothstep(-28.0, 0.0, h));
          diffuseColor.rgb *= col;
        }`);
  };
  mat.customProgramCacheKey = () => 'terrain2';
  return mat;
}

/* Mapa de normales de agua procedural y tileable (suma de senos periódicos). */
export function makeWaterNormalTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const waves = [];
  for (let k = 0; k < 14; k++) {
    waves.push({
      kx: Math.round((Math.random() - 0.5) * 16),
      ky: Math.round((Math.random() - 0.5) * 16),
      a: 0.6 / (1 + k * 0.35),
      p: Math.random() * Math.PI * 2,
    });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const ph = ((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.p;
        const c = Math.cos(ph) * w.a;
        dx += c * w.kx * 0.08;
        dy += c * w.ky * 0.08;
      }
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/* Textura radial suave para halos/partículas. */
export function makeGlowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
