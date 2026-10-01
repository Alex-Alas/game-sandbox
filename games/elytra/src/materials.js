/* Materiales con muestreo triplanar en espacio mundo (texturas PBR de ambientCG).
   Evitan costuras/estiramientos en geometría procedural y en modelos escalados. */
import * as THREE from 'three';

const TRI_GLSL = /* glsl */`
varying vec3 vTriPos;
varying vec3 vTriN;
vec3 triSample(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z;
}
vec3 triWeights(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / (w.x + w.y + w.z);
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

/* Roca/piedra genérica para obstáculos. */
export function makeTriplanarMaterial({ map, scale = 0.04, tint = 0xffffff, roughness = 0.92, vertexColors = false }) {
  const mat = new THREE.MeshStandardMaterial({ color: tint, roughness, metalness: 0, vertexColors });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tTri = { value: map };
    shader.uniforms.uTriScale = { value: scale };
    injectVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tTri;\nuniform float uTriScale;\n' + TRI_GLSL)
      .replace('#include <map_fragment>', /* glsl */`
        {
          vec3 tw = triWeights(normalize(vTriN));
          vec3 c1 = triSample(tTri, vTriPos * uTriScale, tw);
          vec3 c2 = triSample(tTri, vTriPos * uTriScale * 0.21, tw);
          diffuseColor.rgb *= mix(c1, c1 * c2 * 2.2, 0.4) * 2.1;
        }`);
  };
  mat.customProgramCacheKey = () => 'tri-' + scale;
  return mat;
}

/* Terreno: pasto en llano, roca en pendiente, nieve en altura, arena en la orilla. */
export function makeTerrainMaterial({ grass, rock, snow }) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: grass };
    shader.uniforms.tRock = { value: rock };
    shader.uniforms.tSnow = { value: snow };
    injectVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass;\nuniform sampler2D tRock;\nuniform sampler2D tSnow;\n' + TRI_GLSL)
      .replace('#include <map_fragment>', /* glsl */`
        {
          vec3 n = normalize(vTriN);
          vec3 tw = triWeights(n);
          float slope = 1.0 - n.y;
          float h = vTriPos.y;
          float macro = texture2D(tRock, vTriPos.xz * 0.0013).r;

          vec3 grass = texture2D(tGrass, vTriPos.xz * 0.05).rgb;
          vec3 grassFar = texture2D(tGrass, vTriPos.xz * 0.0065).rgb;
          grass = grass * mix(vec3(0.9), grassFar * 1.7, 0.45);
          grass *= mix(vec3(1.0, 0.92, 0.7), vec3(0.78, 0.9, 0.72), macro);

          vec3 rock = triSample(tRock, vTriPos * 0.028, tw);
          rock = mix(rock, rock * triSample(tRock, vTriPos * 0.0061, tw) * 2.0, 0.45) * vec3(1.75, 1.6, 1.45);

          vec3 snow = texture2D(tSnow, vTriPos.xz * 0.04).rgb;
          vec3 sand = vec3(0.58, 0.5, 0.36) * (0.55 + 0.9 * texture2D(tRock, vTriPos.xz * 0.09).r);

          float rockW = smoothstep(0.26, 0.42, slope + (macro - 0.5) * 0.18);
          float snowW = smoothstep(330.0, 420.0, h + (macro - 0.5) * 140.0) * (1.0 - smoothstep(0.5, 0.75, slope));
          float sandW = 1.0 - smoothstep(1.5, 6.0, h + (macro - 0.5) * 5.0);

          vec3 col = mix(grass, sand, sandW);
          col = mix(col, rock, rockW);
          col = mix(col, snow, snowW);
          col *= mix(0.5, 1.0, smoothstep(-28.0, 0.0, h));
          diffuseColor.rgb *= col;
        }`);
  };
  mat.customProgramCacheKey = () => 'terrain';
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
