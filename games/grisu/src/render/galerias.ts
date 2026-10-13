// Un tramo de PASILLO de LAS GALERÍAS (estrato 1), por capas de profundidad (GDD §3):
//  - primer plano (z +4…+8): postes, cadenas y rocas oscuras de formas gruesas (se apagan hacia la tinta);
//  - plano de juego (z = 0): el piso de roca con rieles y durmientes, fosos, el andamio de la ruta alta, la vagoneta;
//  - fondo cercano (z −3…−15): la pared con los apuntalamientos, los caños de cobre, las bocas de otras galerías,
//    un engranaje y una caldera; la bolsa de grisú y las vetas de arcanita;
//  - fondo lejano (z −40…−150): la caverna con andamios lejanos, faroles chiquitos y bruma.
// Haces del farol: conos aditivos tramados (en escalones). Lo estático se funde en una malla por material.
// Por ahora todo es por código: los packs CC0 (KayKit, Quaternius) se evalúan en F4; con la luz toon y la paleta del
// estrato la mezcla no se va a notar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, glowMat, type Toon, LIGHT } from './toon.ts';
import { EMIT, lin } from './palette.ts';
import { flat } from './models/kit.ts';

export type Layer = 'fore' | 'play' | 'near' | 'far' | 'beams';
export const LAYERS: [Layer, string][] = [['fore', 'Primer plano'], ['play', 'Plano de juego'], ['near', 'Fondo cercano'], ['far', 'Fondo lejano'], ['beams', 'Haces del farol']];

// generador con semilla (el tramo es siempre igual)
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// acumula geometrías ya ubicadas por material y capa, y las funde al final
class Bucket {
  m = new Map<string, { mat: THREE.Material, geos: THREE.BufferGeometry[], outline: boolean, layer: Layer }>();
  add(layer: Layer, key: string, mat: THREE.Material, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, outline = true) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.updateMatrix();
    let gg = g.index ? g.toNonIndexed() : g.clone();
    gg.applyMatrix4(o.matrix);
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal') gg.deleteAttribute(k);
    if (!gg.attributes.normal) gg.computeVertexNormals();
    if (layer === 'far') outline = false;   // lo lejano: siluetas sin contorno ni bordes
    const id = layer + ':' + key + (outline ? '' : ':no');
    if (!this.m.has(id)) this.m.set(id, { mat, geos: [], outline, layer });
    this.m.get(id)!.geos.push(gg);
    void gg;
  }
  build(groups: Record<Layer, THREE.Group>) {
    for (const v of this.m.values()) {
      const g = mergeGeometries(v.geos, false);
      const mesh = new THREE.Mesh(g, v.mat);
      mesh.layers.enable(0);
      if (v.outline) mesh.layers.enable(1);
      mesh.frustumCulled = true;
      groups[v.layer].add(mesh);
    }
  }
}

// borde mordido: un contorno 2D (x, y) de un rectángulo con el lado `side` irregular
function jagged(x0: number, x1: number, y0: number, y1: number, side: 'top' | 'bottom', amp: number, step: number, r: () => number) {
  const pts: number[][] = [];
  if (side === 'bottom') {
    pts.push([x0, y1], [x1, y1]);
    for (let x = x1; x >= x0; x -= step) pts.push([x, y0 + (r() - 0.5) * 2 * amp]);
    pts.push([x0, y0]);
  } else {
    pts.push([x0, y0], [x1, y0]);
    for (let x = x1; x >= x0; x -= step) pts.push([x, y1 + (r() - 0.5) * 2 * amp]);
  }
  return pts;
}
function ext(pts: number[][], depth: number) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 2 });
  return g;
}
// roca: icosaedro deformado con caras planas
function rock(r: () => number, s = 1, detail = 0) {
  const g = new THREE.IcosahedronGeometry(s, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const k = 0.75 + r() * 0.45; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); }
  return flat(g);
}

export type Gap = [number, number];
export type World = {
  groups: Record<Layer, THREE.Group>;
  root: THREE.Group;
  lights: { p: THREE.Vector3, r: number, k: number, ph: number }[];
  vents: { x: number, y: number, z: number, t: number, every: number }[];
  gas: { x: number, y: number, z: number, mesh: THREE.Object3D, alive: boolean }[];
  gaps: Gap[];
  x0: number; x1: number;
  floorAt: (x: number) => number | null;
  beams: THREE.ShaderMaterial[];
  flames: Toon[];
  update: (t: number, camX: number) => void;
};

const BEAM_VERT = /* glsl */`out vec3 vL; out vec3 vW; void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uC; uniform float uK, uLen, uTime;
in vec3 vL; in vec3 vW;
float bayer(vec2 p) { ivec2 q = ivec2(mod(p, 4.0)); int i = q.x + q.y * 4; int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(m[i]) + 0.5) / 16.0; }
void main() {
  float u = clamp(-vL.y / uLen, 0.0, 1.0);               // 0 en el farol, 1 al final
  float a = (1.0 - u) * (1.0 - u) * uK * (0.92 + 0.08 * sin(uTime * 7.0 + vW.x));
  // dos escalones tramados (nada de degradé)
  float b = bayer(gl_FragCoord.xy);
  float lv = a > 0.6 ? 1.0 : (a > 0.3 ? 0.6 : (a > 0.1 ? 0.3 : 0.0));
  // los escalones bajos se traman (la mitad o un cuarto de los píxeles)
  if (lv <= 0.0 || (lv < 0.5 && b > 0.25) || (lv < 0.9 && b > 0.5)) discard;
  gl_FragColor = vec4(uC * 0.16, 0.0);
}`;
function beamMat(color: string, k = 1, len = 6) {
  return new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, side: THREE.FrontSide,
    // suma el color y deja el alfa (la máscara de brillo) como estaba
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    uniforms: { uC: { value: lin(color) }, uK: { value: k }, uLen: { value: len }, uTime: LIGHT.uTime },
  });
}

export function buildGalerias(): World {
  const r = rng(7);
  const B = new Bucket();
  const groups = { fore: new THREE.Group(), play: new THREE.Group(), near: new THREE.Group(), far: new THREE.Group(), beams: new THREE.Group() } as Record<Layer, THREE.Group>;
  const root = new THREE.Group();
  for (const g of Object.values(groups)) root.add(g);
  const M = {
    rock: toon('rock'), rockD: toon({ base: '#3f3f45', S: '#2e2a3a', D: '#20202c', R: '#4f5a70', H: '#635a5b' }),
    coal: toon('coal'), wood: toon('wood'), woodD: toon({ base: '#5b3e2a', S: '#3a2622', D: '#291e18', R: '#5a6478', H: '#7a5236' }),
    iron: toon('iron', { metal: 0.8, rough: 0.4 }), brass: toon('brass', { metal: 1, rough: 0.3 }), copper: toon('copper', { metal: 0.8, rough: 0.35 }),
    wall: toon({ base: '#5e5468', S: '#4a4358', D: '#3d354c', R: '#7c7080', H: '#7c7080' }),
    far: toon({ base: '#4a4358', S: '#3d354c', D: '#2e2a3a', R: '#5e5468', H: '#5e5468' }),
  };
  const X0 = -40, X1 = 240;
  const gaps: Gap[] = [[58, 63.5], [128, 134]];
  const floorAt = (x: number) => (gaps.some(([a, b]) => x > a && x < b) ? null : 0);

  // ---------- plano de juego: el piso (segmentos entre fosos) ----------
  const segs: number[][] = [];
  let a = X0;
  for (const [g0, g1] of gaps) { segs.push([a, g0]); a = g1; }
  segs.push([a, X1]);
  for (const [s0, s1] of segs) {
    B.add('play', 'rock', M.rock, flat(ext(jagged(s0, s1, -7, 0, 'bottom', 0.8, 1.6, r), 6.2)), 0, 0, -3.8);
    // orilla mordida de los fosos
    for (const x of [s0, s1]) if (x > X0 && x < X1) for (let i = 0; i < 4; i++) B.add('play', 'rock', M.rock, rock(r, 0.5 + r() * 0.3), x + (x === s0 ? 0.3 : -0.3), -0.6 - i * 1.1, 1.6 - r() * 4);
    // rieles y durmientes
    for (let x = s0 + 0.3; x < s1 - 0.3; x += 0.7) B.add('play', 'wood', M.woodD, new THREE.BoxGeometry(0.22, 0.08, 1.5), x, 0.04, -1.2);
    for (const z of [-1.75, -0.65]) B.add('play', 'iron', M.iron, new THREE.BoxGeometry(s1 - s0 - 0.4, 0.09, 0.08), (s0 + s1) / 2, 0.12, z);
    // piedritas sueltas en el borde de adelante
    for (let x = s0 + 1; x < s1 - 1; x += 1.4 + r() * 2) B.add('play', 'rock', M.rock, rock(r, 0.18 + r() * 0.15), x, 0.05, 1.9 + r() * 0.4);
  }
  // el fondo de los fosos (oscuro, lejos abajo)
  for (const [g0, g1] of gaps) B.add('play', 'coal', M.coal, new THREE.BoxGeometry(g1 - g0 + 2, 1, 6), (g0 + g1) / 2, -9, -0.8);

  // ---------- ruta alta: andamio de madera con vetas de arcanita ----------
  const up0 = 84, up1 = 116, upY = 4.2;
  B.add('play', 'wood', M.wood, new THREE.BoxGeometry(up1 - up0, 0.22, 2.2), (up0 + up1) / 2, upY - 0.11, -0.4);
  for (let x = up0 + 0.8; x < up1; x += 3.6) {
    for (const z of [-1.3, 0.5]) B.add('play', 'wood', M.woodD, new THREE.BoxGeometry(0.22, upY, 0.22), x, upY / 2 - 0.1, z);
    B.add('play', 'wood', M.woodD, new THREE.BoxGeometry(0.16, 0.16, 2.4), x, upY - 0.35, -0.4);
    // cruz de refuerzo
    B.add('play', 'wood', M.woodD, new THREE.BoxGeometry(0.12, 4.6, 0.12), x + 1.8, upY / 2, -1.3, 0, 0, 0.72);
  }
  for (let x = up0; x <= up1; x += 1.2) B.add('play', 'wood', M.woodD, new THREE.BoxGeometry(0.08, 0.8, 0.08), x, upY + 0.4, -1.4);
  B.add('play', 'wood', M.wood, new THREE.BoxGeometry(up1 - up0, 0.1, 0.1), (up0 + up1) / 2, upY + 0.8, -1.4);
  // escalera
  for (let i = 0; i < 9; i++) B.add('play', 'wood', M.woodD, new THREE.BoxGeometry(0.7, 0.08, 0.08), up0 - 0.6, 0.4 + i * 0.45, -1.5);
  for (const dx of [-0.95, -0.25]) B.add('play', 'wood', M.wood, new THREE.BoxGeometry(0.08, 4.4, 0.08), up0 + dx, 2.2, -1.5);

  // ---------- la vagoneta en los rieles ----------
  const cartX = 22;
  B.add('play', 'iron', M.iron, flat(ext([[-1.1, 0], [1.1, 0], [1.35, 1.0], [-1.35, 1.0]], 1.3)), cartX, 0.42, -1.85);
  B.add('play', 'brass', M.brass, new THREE.BoxGeometry(2.8, 0.1, 1.4), cartX, 1.45, -1.2);
  for (const dx of [-0.7, 0.7]) for (const z of [-1.8, -0.6]) B.add('play', 'iron', M.iron, new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), cartX + dx, 0.32, z, Math.PI / 2, 0, 0);
  for (let i = 0; i < 5; i++) B.add('play', 'coal', M.coal, rock(r, 0.32), cartX - 0.8 + i * 0.4, 1.5 + r() * 0.15, -1.2 + (r() - 0.5) * 0.6);

  // ---------- fondo cercano: pared, techo, apuntalamientos, caños ----------
  const lights: World['lights'] = [];
  const openings: Gap[] = [[30, 46], [140, 162], [196, 212]];   // donde la pared baja y se ve la caverna
  const isOpen = (x: number) => openings.some(([o0, o1]) => x > o0 && x < o1);
  // la pared: una grilla con relieve (ruido) y caras planas, así la roca agarra la luz por facetas
  for (let x = X0; x < X1; x += 8) {
    const op = isOpen(x + 4);
    const h = op ? 1.8 : 10;
    const g = new THREE.PlaneGeometry(8.4, h, 18, op ? 4 : 20);
    const pp = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) {
      const vx = pp.getX(i) + x + 4, vy = pp.getY(i) + h / 2;
      const n = Math.sin(vx * 1.7 + Math.sin(vy * 0.9) * 2) * 0.35 + Math.sin(vy * 2.3 + vx * 0.4) * 0.25 + (r() - 0.5) * 0.35;
      pp.setXYZ(i, pp.getX(i), pp.getY(i) + (Math.abs(pp.getY(i) - h / 2) < 0.01 ? (r() - 0.5) * 0.8 : 0), n);
    }
    B.add('near', 'wall', M.wall, flat(g), x + 4, h / 2, -4.3);
    // vetas negras de carbón en la pared
    if (!op) for (let i = 0; i < 2; i++) B.add('near', 'coal', M.coal, rock(r, 0.5 + r() * 0.4), x + r() * 8, 1.5 + r() * 5.5, -4.2, 0, 0, (r() - 0.5) * 0.6, 2.2, 0.35, 0.4);
  }
  // techo (con su espesor de frente) salvo en las aberturas grandes
  for (let x = X0; x < X1; x += 6) {
    const op = isOpen(x + 3);
    const y0 = op ? 11.5 : 8.6;
    B.add('near', 'rock', M.rockD, flat(ext(jagged(x - 0.3, x + 6.3, y0, y0 + 4, 'bottom', 0.5, 1.5, r).map(([px, py]) => [px, py]), 6.6)), 0, 0, -4.4);
  }
  // apuntalamientos cada 8 m: poste atrás, viga cruzada arriba, cabezal
  for (let x = X0 + 2; x < X1; x += 8) {
    if (gaps.some(([g0, g1]) => x > g0 - 0.5 && x < g1 + 0.5)) continue;
    const top = isOpen(x) ? 11.4 : 8.5;
    B.add('near', 'wood', M.wood, new THREE.BoxGeometry(0.42, top, 0.42), x, top / 2, -3.4);
    B.add('near', 'wood', M.wood, new THREE.BoxGeometry(0.5, 0.45, 5.6), x, top - 0.25, -1.0);
    B.add('near', 'wood', M.woodD, new THREE.BoxGeometry(0.62, 0.25, 0.62), x, top - 0.6, -3.4);
    B.add('near', 'iron', M.iron, new THREE.BoxGeometry(0.46, 0.1, 0.46), x, 0.7, -3.4);
    B.add('near', 'iron', M.iron, new THREE.BoxGeometry(0.46, 0.1, 0.46), x, top - 1.1, -3.4);
    // farol colgado cada 16 m
    if (((x - X0 - 2) / 8) % 2 === 0) {
      const ly = top - 2.0;
      B.add('near', 'iron', M.iron, new THREE.CylinderGeometry(0.01, 0.01, 1.4, 3), x, top - 1.2, -1.2);
      B.add('near', 'iron', M.iron, flat(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 6)), x, ly + 0.3, -1.2);
      B.add('near', 'iron', M.iron, flat(new THREE.CylinderGeometry(0.2, 0.16, 0.08, 6)), x, ly - 0.3, -1.2);
      for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + 0.4; B.add('near', 'iron', M.iron, new THREE.BoxGeometry(0.03, 0.6, 0.03), x + Math.cos(an) * 0.17, ly, -1.2 + Math.sin(an) * 0.17); }
      lights.push({ p: new THREE.Vector3(x, ly, -1.2), r: 9, k: 1.1, ph: r() * 10 });
    }
  }
  // caños de cobre a lo largo de la pared (con bridas y válvulas)
  const vents: World['vents'] = [];
  for (const [py, pz, pr] of [[6.2, -3.7, 0.2], [5.6, -3.85, 0.13]] as const) {
    for (let x = X0; x < X1; x += 12) {
      if (isOpen(x + 6) && py > 2) continue;
      B.add('near', 'copper', M.copper, new THREE.CylinderGeometry(pr, pr, 12, 10), x + 6, py, pz, 0, 0, Math.PI / 2);
      for (let k = 0; k < 4; k++) B.add('near', 'brass', M.brass, new THREE.CylinderGeometry(pr + 0.06, pr + 0.06, 0.12, 10), x + k * 3, py, pz, 0, 0, Math.PI / 2);
      if (pr > 0.15 && r() < 0.5) {
        const vx = x + 4.5;
        B.add('near', 'brass', M.brass, new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), vx, py + 0.3, pz);
        B.add('near', 'iron', M.iron, new THREE.TorusGeometry(0.16, 0.035, 4, 10), vx, py + 0.52, pz, Math.PI / 2, 0, 0);
        vents.push({ x: vx, y: py - 0.2, z: pz + 0.3, t: r() * 3, every: 2.5 + r() * 2.5 });
      }
    }
  }
  // un engranaje y una caldera en una boca de galería (fondo cercano, z −10)
  const gearAt = (gx: number, gy: number, gz: number, R0: number) => {
    B.add('near', 'brass', M.brass, new THREE.CylinderGeometry(R0, R0, 0.3, 24), gx, gy, gz, Math.PI / 2, 0, 0);
    for (let i = 0; i < 16; i++) { const an = (i / 16) * Math.PI * 2; B.add('near', 'brass', M.brass, new THREE.BoxGeometry(0.42, 0.36, 0.3), gx + Math.cos(an) * (R0 + 0.15), gy + Math.sin(an) * (R0 + 0.15), gz, 0, 0, an); }
    B.add('near', 'iron', M.iron, new THREE.CylinderGeometry(R0 * 0.3, R0 * 0.3, 0.4, 10), gx, gy, gz, Math.PI / 2, 0, 0);
    for (let i = 0; i < 5; i++) { const an = (i / 5) * Math.PI * 2; B.add('near', 'brass', M.brass, new THREE.BoxGeometry(R0 * 1.4, 0.18, 0.2), gx + Math.cos(an) * R0 * 0.5, gy + Math.sin(an) * R0 * 0.5, gz, 0, 0, an); }
  };
  for (const [o0, o1] of openings) {
    // piso del fondo de la abertura y su propio apuntalamiento
    B.add('near', 'rock', M.rockD, flat(ext(jagged(o0, o1, -6, -1.0, 'bottom', 0.5, 1.5, r), 10)), 0, 0, -16);
    for (let x = o0 + 2; x < o1; x += 6) B.add('near', 'wood', M.woodD, new THREE.BoxGeometry(0.4, 9, 0.4), x, 3.5, -13);
    gearAt(o0 + (o1 - o0) * 0.35, 2.6, -11.5, 2.2);
    B.add('near', 'copper', M.copper, new THREE.CylinderGeometry(1.4, 1.4, 4, 14), o0 + (o1 - o0) * 0.75, 1.2, -12.5);
    B.add('near', 'brass', M.brass, new THREE.SphereGeometry(1.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), o0 + (o1 - o0) * 0.75, 3.2, -12.5);
    B.add('near', 'copper', M.copper, new THREE.CylinderGeometry(0.25, 0.25, 6, 8), o0 + (o1 - o0) * 0.75 + 0.6, 6, -12.5);
  }

  // ---------- fondo lejano: la caverna ----------
  for (let x = X0 - 60; x < X1 + 80; x += 9 + r() * 8) {
    const z = -45 - r() * 90, h = 14 + r() * 26;
    // torres de andamio lejanas: siluetas
    B.add('far', 'far', M.far, new THREE.BoxGeometry(0.6, h, 0.6), x, h / 2 - 8, z);
    B.add('far', 'far', M.far, new THREE.BoxGeometry(0.6, h, 0.6), x + 3, h / 2 - 8, z);
    for (let y = -6; y < h - 8; y += 3.2) B.add('far', 'far', M.far, new THREE.BoxGeometry(3.6, 0.35, 0.5), x + 1.5, y, z);
    if (r() < 0.6) lights.push({ p: new THREE.Vector3(x + 1.5, h - 9, z + 1), r: 0, k: 0, ph: 0 });
  }
  // paredes de la caverna (rocas enormes) y estalactitas
  for (let x = X0 - 80; x < X1 + 100; x += 18) {
    B.add('far', 'far', M.far, rock(r, 14 + r() * 8, 1), x, -10 + r() * 6, -150 - r() * 30);
    B.add('far', 'far', M.far, flat(new THREE.ConeGeometry(2 + r() * 2, 10 + r() * 14, 5)), x + r() * 9, 34 - r() * 6, -60 - r() * 60, Math.PI, 0, 0);
  }

  // ---------- primer plano: postes, cadenas y rocas oscuras ----------
  for (let x = X0 + 6; x < X1; x += 13 + r() * 6) {
    B.add('fore', 'wood', M.woodD, new THREE.BoxGeometry(0.9, 16, 0.9), x, 3, 5.5 + r() * 1.5);
    if (r() < 0.6) for (let i = 0; i < 9; i++) B.add('fore', 'iron', M.iron, new THREE.TorusGeometry(0.16, 0.06, 4, 8), x + 1.2, 10 - i * 0.36, 5.4, 0, i % 2 ? Math.PI / 2 : 0, 0, 1, 1.6, 1);
  }
  for (let x = X0; x < X1; x += 3 + r() * 4) B.add('fore', 'rock', M.rockD, rock(r, 1.2 + r() * 1.4), x, -1.8 + r() * 0.8, 4.5 + r() * 2);

  B.build(groups);

  // ---------- lo que se anima: llamas, haces, bolsa de grisú, vetas ----------
  const flames: Toon[] = [];
  const beams: THREE.ShaderMaterial[] = [];
  for (const L of lights) {
    if (L.r === 0) {
      // farolito lejano: un punto que brilla
      const fm = glowMat(EMIT.farol[1], 0.8, 1.2);
      const o = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), fm);
      o.position.copy(L.p); o.layers.enable(0);
      groups.far.add(o);
      continue;
    }
    const fm = glowMat(EMIT.farol[0], 1, 1.7);
    flames.push(fm);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), fm);
    f.position.copy(L.p); f.scale.set(1, 1.5, 1); f.layers.enable(0); f.layers.enable(1);
    groups.near.add(f);
    const bm = beamMat(EMIT.farol[1], 1, 5.6);
    beams.push(bm);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 5.6, 14, 1, true), bm);
    cone.geometry.translate(0, -2.8, 0);
    cone.position.copy(L.p).add(new THREE.Vector3(0, -0.2, 0));
    cone.layers.set(0);
    groups.beams.add(cone);
  }
  // haces lejanos: columnas de luz desde grietas del techo de la caverna
  for (let i = 0; i < 7; i++) {
    const bm = beamMat('#8fb4c4', 0.85, 60);
    beams.push(bm);
    const g = new THREE.CylinderGeometry(1.2, 4.5, 60, 10, 1, true);
    g.translate(0, -30, 0);
    const c = new THREE.Mesh(g, bm);
    c.position.set(X0 + 20 + i * 42 + r() * 10, 40, -70 - r() * 50);
    c.rotation.z = 0.25;
    c.layers.set(0);
    groups.beams.add(c);
  }
  // bolsa de grisú en la pared (x 74) y otra en el andamio (x 104)
  const gas: World['gas'] = [];
  for (const [gx, gy, gz] of [[74, 1.6, -3.5], [178, 2.8, -3.5]]) {
    const gm = toon({ base: '#8a8a52', S: '#5e5e3a', D: '#3a3a2a', R: '#cfc46a', H: '#f4f2b0' });
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.55 - i * 0.06, 10, 8), gm);
      b.position.set((i - 2) * 0.42 + (r() - 0.5) * 0.2, (r() - 0.5) * 0.5, (r() - 0.5) * 0.3);
      b.layers.enable(0); b.layers.enable(1);
      g.add(b);
    }
    g.position.set(gx, gy, gz);
    groups.near.add(g);
    gas.push({ x: gx, y: gy, z: gz + 0.6, mesh: g, alive: true });
  }
  // vetas de arcanita en el techo de la ruta alta
  const crys = glowMat(EMIT.arcanita[1], 1, 1.5);
  const crysD = toon({ base: '#3bded3', S: '#1d8a8a', D: '#1d4a5a', R: '#b8fff6', H: '#b8fff6' }, { metal: 1 });
  for (let i = 0; i < 9; i++) {
    const x = up0 + 2 + i * 3.4 + r(), h = 0.5 + r() * 0.7;
    const g = new THREE.OctahedronGeometry(0.28, 0);
    const c = new THREE.Mesh(flat(g), i % 3 === 0 ? crys : crysD);
    c.position.set(x, 8.4 - h * 0.4, -2.4 + r() * 0.8);
    c.scale.set(0.8, h * 2.2, 0.8);
    c.rotation.set(Math.PI + (r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6);
    c.layers.enable(0); c.layers.enable(1);
    groups.near.add(c);
  }

  // los faroles: titilan en escalones (un sprite de llama), y prenden los 6 más cercanos a la cámara
  const update = (t: number, camX: number) => {
    LIGHT.uTime.value = t;
    const near = lights.filter((L) => L.r > 0).sort((p, q) => Math.abs(p.p.x - camX) - Math.abs(q.p.x - camX)).slice(0, 6);
    for (let i = 0; i < 6; i++) {
      const L = near[i];
      if (!L) { LIGHT.uPL.value[i].set(0, -999, 0, 1); LIGHT.uPLk.value[i] = 0; continue; }
      const fl = Math.floor((t + L.ph) * 8);
      const k = L.k * (0.88 + 0.12 * (((fl * 2654435761) >>> 0) % 7) / 6);
      LIGHT.uPL.value[i].set(L.p.x, L.p.y, L.p.z, L.r);
      LIGHT.uPLk.value[i] = k;
    }
    for (const g of gas) {
      const s = 1 + 0.06 * Math.round(Math.sin(t * 2.2 + g.x) * 2) / 2;
      g.mesh.scale.setScalar(s);
    }
  };
  void M;
  return { groups, root, lights, vents, gas, gaps, x0: X0, x1: X1, floorAt, beams, flames, update };
}
