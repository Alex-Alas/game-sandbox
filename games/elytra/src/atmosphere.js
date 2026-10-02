/* Atmósfera: hora del día (presets aplicados en vivo: cielo, sol/luna, luz
   ambiente, niebla, exposición, entorno IBL, nubes, agua, estrellas) y niebla por
   altura horneada en los shaders según el circuito. La hora es solo visual: no
   separa récords. */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/* sun / skySun: [elevación°, acimut°]. skySun (si existe) es el sol que ve el
   shader del cielo; sun es la luz direccional (la luna, de noche). */
export const TIMES = {
  morning: {
    label: 'MAÑANA', sun: [14, 75], sunColor: 0xffd7a6, sunI: 2.2,
    hemiSky: 0xd6e4f5, hemiGround: 0x56523c, hemiI: 0.62,
    turbidity: 4, rayleigh: 2.2, mie: 0.005, mieG: 0.86,
    fog: 0xd3d9e2, fogDensity: 0.00042, exposure: 0.66, envI: 0.5,
    cloud: 0xffe6d2, cloudOp: 1, water: 0x2a6a80,
  },
  noon: {
    label: 'MEDIODÍA', sun: [34, 145], sunColor: 0xfff1d6, sunI: 2.7,
    hemiSky: 0xcfe6ff, hemiGround: 0x4f5a3a, hemiI: 0.7,
    turbidity: 5.5, rayleigh: 1.5, mie: 0.004, mieG: 0.82,
    fog: 0xb9d3e6, fogDensity: 0.00034, exposure: 0.62, envI: 0.55,
    cloud: 0xffffff, cloudOp: 1, water: 0x1d5d78,
  },
  dusk: {
    label: 'ATARDECER', sun: [5, 250], sunColor: 0xff9658, sunI: 2.0,
    hemiSky: 0xe0a07e, hemiGround: 0x3d3128, hemiI: 0.5,
    turbidity: 8, rayleigh: 3, mie: 0.008, mieG: 0.9,
    fog: 0xcf9474, fogDensity: 0.0004, exposure: 0.72, envI: 0.45,
    cloud: 0xffb184, cloudOp: 1, water: 0x34486a,
  },
  night: {
    label: 'NOCHE', sun: [38, 205], skySun: [-7, 250], sunColor: 0xa8c0ff, sunI: 1.0,
    hemiSky: 0x3a5290, hemiGround: 0x161c26, hemiI: 0.62,
    turbidity: 2, rayleigh: 1, mie: 0.003, mieG: 0.8,
    fog: 0x111d36, fogDensity: 0.00038, exposure: 1.0, envI: 0.3,
    cloud: 0x55658a, cloudOp: 0.6, water: 0x0b1c2e, stars: true,
  },
};
export const TIME_ORDER = ['morning', 'noon', 'dusk', 'night'];
const KEY = 'elytra.time';

export const atmo = { id: 'noon', refs: null };
let pmrem = null, envScene = null, envSky = null, envTex = null;
let stars = null, moon = null;

export function pickTime() {
  try { const v = localStorage.getItem(KEY); if (TIMES[v]) return v; } catch { /* sin storage */ }
  return 'noon';
}

const dirFrom = ([elev, az], out) => out.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));

function buildStars() {
  const n = 1800, R = 3800;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    do v.set(Math.random() * 2 - 1, Math.random() * 1.1 - 0.1, Math.random() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
    v.normalize().multiplyScalar(R);
    pos.set([v.x, v.y, v.z], i * 3);
    const b = 0.35 + Math.random() ** 3 * 0.65;
    col.set([b * 0.9, b * 0.95, b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    size: 1.8, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}

/** refs: { scene, renderer, sky, hemi, sun, sunDir, water, clouds, glowTex }. */
export function initAtmosphere(refs) {
  atmo.refs = refs;
  pmrem = new THREE.PMREMGenerator(refs.renderer);
  envScene = new THREE.Scene();
  envSky = new Sky();
  envSky.scale.setScalar(1000);
  envScene.add(envSky);
  stars = buildStars();
  moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: refs.glowTex, color: 0xe4ecff, transparent: true, depthWrite: false, fog: false,
  }));
  moon.scale.setScalar(320);
  refs.scene.add(stars, moon);
  applyTime(pickTime(), false);
}

/** Aplica una hora en vivo (uniforms, luces, niebla y entorno IBL regenerado). */
export function applyTime(id, save = true) {
  const P = TIMES[id] ?? TIMES.noon;
  atmo.id = TIMES[id] ? id : 'noon';
  if (save) { try { localStorage.setItem(KEY, atmo.id); } catch { /* */ } }
  const R = atmo.refs;
  const u = R.sky.material.uniforms;
  u.turbidity.value = P.turbidity;
  u.rayleigh.value = P.rayleigh;
  u.mieCoefficient.value = P.mie;
  u.mieDirectionalG.value = P.mieG;
  dirFrom(P.skySun ?? P.sun, u.sunPosition.value);
  dirFrom(P.sun, R.sunDir);
  R.sun.color.set(P.sunColor);
  R.sun.intensity = P.sunI;
  R.hemi.color.set(P.hemiSky);
  R.hemi.groundColor.set(P.hemiGround);
  R.hemi.intensity = P.hemiI;
  R.scene.fog.color.set(P.fog);
  R.scene.fog.density = P.fogDensity;
  R.renderer.toneMappingExposure = P.exposure;
  R.scene.environmentIntensity = P.envI;
  R.water.material.color.set(P.water);
  for (const s of R.clouds.children) {
    s.material.color.set(P.cloud);
    s.material.opacity = s.userData.op * P.cloudOp;
  }
  if (R.cloudSea) R.cloudSea.material.color.set(P.cloud).multiplyScalar(P.stars ? 0.55 : 1);
  stars.visible = moon.visible = !!P.stars;

  // Entorno IBL desde el mismo cielo
  for (const k of Object.keys(u)) {
    const v = u[k].value;
    if (v?.copy) envSky.material.uniforms[k].value.copy(v); else envSky.material.uniforms[k].value = v;
  }
  const prev = envTex;
  envTex = pmrem.fromScene(envScene, 0.02).texture;
  R.scene.environment = envTex;
  prev?.dispose();
  return P;
}

/** Por frame: estrellas y luna siguen a la cámara. */
export function updateAtmosphere(camera) {
  if (!stars?.visible) return;
  stars.position.copy(camera.position);
  moon.position.copy(camera.position).addScaledVector(atmo.refs.sunDir, 3500);
}

/* ── Niebla por altura ───────────────────────────────────────
   Se suma a la FogExp2 de la escena una capa cuya densidad es `strength` por debajo
   de `top` y decae con escala `falloff` por encima. La integral a lo largo del rayo
   cámara→punto se aproxima analíticamente (las alturas bajo `top` cuentan como
   `top`). La altura mundial se reconstruye en el vertex desde mvPosition (sirve para
   mallas, sprites y puntos). Los parámetros se hornean en los chunks: el circuito no
   cambia sin recargar. Llamar antes de compilar cualquier material. */
export function installHeightFog(cfg) {
  if (!cfg) return;
  const f = (x) => Number(x).toFixed(6);
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorld;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n' +
    '\tvFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );\n#endif';
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogWorld;');
  C.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	{
		const float HF_TOP = ${f(cfg.top)};
		const float HF_H = ${f(cfg.falloff)};
		const float HF_D = ${f(cfg.strength)};
		float yc = max( cameraPosition.y, HF_TOP ) - HF_TOP;
		float yp = max( vFogWorld.y, HF_TOP ) - HF_TOP;
		float dy = yp - yc;
		float avg = abs( dy ) > 0.01 ? HF_H * ( exp( - yc / HF_H ) - exp( - yp / HF_H ) ) / dy : exp( - yc / HF_H );
		float hf = 1.0 - exp( - HF_D * vFogDepth * avg );
		fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - hf );
	}
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}
