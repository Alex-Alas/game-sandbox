/* Personaje: rig plano construido a partir de un Kenney Blocky Character
   (cada parte con su origen en la articulación) + alas tipo élitro procedurales.
   El mismo rig alimenta la pose de vuelo y el ragdoll. */
import * as THREE from 'three';
import { assets } from './assets.js';

const PART_NAMES = ['torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];
const HEIGHT = 1.8;

/* Textura de las alas: degradado + plumas + borde brillante. */
function makeWingTextures() {
  const W = 512, H = 256;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const col = mk(), emi = mk();
  const g = col.getContext('2d');
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#3b1d6e');
  grd.addColorStop(0.55, '#6b3fb8');
  grd.addColorStop(1, '#a37bf0');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // Plumas
  g.strokeStyle = 'rgba(20,6,40,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = (i / 14) * W;
    g.beginPath();
    g.moveTo(x * 0.3, H * 0.95);
    g.quadraticCurveTo(x * 0.8, H * 0.55, x + 30, H * 0.05);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * W, Math.random() * H, 30, 2);
  // Emisivo: borde de ataque y venas
  const e = emi.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);
  const eg = e.createLinearGradient(0, 0, 0, H * 0.25);
  eg.addColorStop(0, 'rgba(142,242,255,1)');
  eg.addColorStop(1, 'rgba(142,242,255,0)');
  e.fillStyle = eg;
  e.fillRect(0, 0, W, H * 0.25);
  e.strokeStyle = 'rgba(200,107,255,0.7)';
  e.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    e.beginPath();
    e.moveTo(0, H * 0.1);
    e.quadraticCurveTo(W * 0.4, H * (0.2 + i * 0.12), W, H * (0.08 + i * 0.05));
    e.stroke();
  }
  const t1 = new THREE.CanvasTexture(col); t1.colorSpace = THREE.SRGBColorSpace;
  const t2 = new THREE.CanvasTexture(emi); t2.colorSpace = THREE.SRGBColorSpace;
  return { map: t1, emissiveMap: t2 };
}

let wingTex = null;

/* Geometría del ala izquierda (se extiende hacia +X, cuerda hacia -Y = pies).
   El origen es la bisagra en la espalda. */
function makeWingGeometry(span) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.05);
  s.bezierCurveTo(span * 0.35, 0.28, span * 0.75, 0.22, span, 0.02);
  // borde de salida con plumas
  const feathers = 6;
  let px = span, py = 0.02;
  for (let i = 0; i < feathers; i++) {
    const t = (i + 1) / feathers;
    const x = span * (1 - t * 0.92);
    const y = -0.15 - Math.sin(t * Math.PI * 0.9) * span * 0.42;
    s.quadraticCurveTo((px + x) / 2 + 0.05, Math.min(py, y) - 0.12, x, y);
    px = x; py = y;
  }
  s.quadraticCurveTo(0.05, -span * 0.2, 0, -0.18);
  s.lineTo(0, 0.05);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -0.0175);
  // UV normalizadas sobre el bounding box
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  // Ligera curvatura (camber): las puntas bajan un poco
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) - (x / span) ** 2 * 0.12);
  }
  geo.computeVertexNormals();
  return geo;
}

/* Construye el rig. Devuelve { root, model, parts, rest, wings } donde:
   - root: grupo que se orienta con el jugador (yaw/pitch/roll)
   - model: rotado para volar boca abajo, cabeza hacia delante (-Z)
   - parts[name]: Mesh con origen en su articulación, posición de reposo en rest[name] */
export function buildCharacter(skin = 'a') {
  const src = assets.characters[skin].clone(true);
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src);
  const scale = HEIGHT / (box.max.y - box.min.y);
  src.scale.setScalar(scale);
  src.position.y = -box.min.y * scale;
  src.updateMatrixWorld(true);

  const parts = {};
  const rest = {};
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const torsoNode = src.getObjectByName('torso');
  // Centro del torso como origen del rig
  const torsoBox = new THREE.Box3().setFromObject(torsoNode, true);
  const tb = new THREE.Box3();
  torsoNode.geometry.computeBoundingBox();
  tb.copy(torsoNode.geometry.boundingBox).applyMatrix4(torsoNode.matrixWorld);
  const center = tb.getCenter(new THREE.Vector3());
  void torsoBox;

  const model = new THREE.Group();
  for (const name of PART_NAMES) {
    const node = src.getObjectByName(name);
    node.matrixWorld.decompose(p, q, s);
    const geo = node.geometry.clone();
    geo.scale(s.x, s.y, s.z);
    const srcMat = Array.isArray(node.material) ? node.material[0] : node.material;
    const map = srcMat.map;
    if (map) { map.magFilter = THREE.NearestFilter; map.colorSpace = THREE.SRGBColorSpace; }
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.position.copy(p).sub(center);
    mesh.quaternion.copy(q);
    model.add(mesh);
    parts[name] = mesh;
    rest[name] = { pos: mesh.position.clone(), quat: mesh.quaternion.clone() };
  }

  // Alas (bisagra en la espalda, -Z en reposo porque el personaje mira a +Z)
  wingTex ??= makeWingTextures();
  const wingMat = new THREE.MeshStandardMaterial({
    map: wingTex.map, emissiveMap: wingTex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.4,
    roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.96,
  });
  const span = 1.9;
  const wgeo = makeWingGeometry(span);
  const torso = parts.torso;
  torso.geometry.computeBoundingBox();
  const tbb = torso.geometry.boundingBox;
  const backZ = torso.position.z + tbb.min.z - 0.03;
  const shoulderY = torso.position.y + tbb.max.y - 0.12;
  for (const side of [1, -1]) {
    const name = side > 0 ? 'wing-left' : 'wing-right';
    const g = side > 0 ? wgeo : wgeo.clone().scale(-1, 1, 1);
    if (side < 0) {
      // Reorientar caras tras el espejo
      const idx = g.index;
      if (idx) for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i); idx.setX(i, idx.getX(i + 2)); idx.setX(i + 2, t); }
      g.computeVertexNormals();
    }
    const w = new THREE.Mesh(g, wingMat);
    w.name = name;
    w.castShadow = true;
    w.position.set(side * 0.1, shoulderY, backZ);
    model.add(w);
    parts[name] = w;
    rest[name] = { pos: w.position.clone(), quat: new THREE.Quaternion() };
  }

  // Volar boca abajo con la cabeza hacia -Z: Rx(-90°)·Ry(180°)
  model.rotation.set(-Math.PI / 2, Math.PI, 0, 'XYZ');
  const root = new THREE.Group();
  root.add(model);
  root.rotation.order = 'YXZ';

  return { root, model, parts, rest, wingSpan: span, skin };
}

/* ── Pose de vuelo ─────────────────────────────────────────── */
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _eu = new THREE.Euler();
const AX = new THREE.Vector3(1, 0, 0);

function setRot(rig, name, x, y, z) {
  const part = rig.parts[name];
  _eu.set(x, y, z, 'XYZ');
  part.quaternion.copy(rig.rest[name].quat).multiply(_qa.setFromEuler(_eu));
  part.position.copy(rig.rest[name].pos);
}

/* ctrl: { tuck 0..1, flare 0..1, flap 0..1 (fase), turn -1..1, speed, time, rollAnim } */
export function poseFlight(rig, c) {
  const t = c.time;
  const flut = Math.sin(t * 13) * 0.04 * Math.min(1, c.speed / 80);
  // Cabeza levantada mirando hacia delante
  setRot(rig, 'head', -1.05 + c.flare * 0.25, c.turn * 0.35, 0);
  // Brazos: pegados atrás al plegar, abiertos al frenar
  const armOpen = 0.18 + c.flare * 1.1 - c.tuck * 0.16 + Math.sin(c.flapPhase) * 0.5 * c.flap;
  setRot(rig, 'arm-left', 0.15 + c.flare * 0.4, 0, armOpen + c.turn * 0.2 + flut);
  setRot(rig, 'arm-right', 0.15 + c.flare * 0.4, 0, -armOpen + c.turn * 0.2 - flut);
  // Piernas: aleteo suave, abiertas al frenar
  const legOpen = 0.06 + c.flare * 0.3 - c.tuck * 0.05;
  setRot(rig, 'leg-left', -0.12 + Math.sin(t * 7) * 0.05 + c.flare * 0.5, 0, legOpen);
  setRot(rig, 'leg-right', -0.12 - Math.sin(t * 7) * 0.05 + c.flare * 0.5, 0, -legOpen);

  // Alas: barrido (Z) entre plegada (hacia los pies) y extendida; diedro (Y) y aleteo
  const spread = THREE.MathUtils.clamp(1 - c.tuck * 0.85 + c.flare * 0.15, 0, 1.15);
  const sweep = THREE.MathUtils.lerp(-1.25, 0.05, spread);
  const flapA = Math.sin(c.flapPhase) * 0.9 * c.flap;
  const dihedral = 0.1 + c.flare * 0.35 - c.tuck * 0.05;
  const L = rig.parts['wing-left'], R = rig.parts['wing-right'];
  L.position.copy(rig.rest['wing-left'].pos);
  R.position.copy(rig.rest['wing-right'].pos);
  // left: +X; positive Y-rotation sube la punta hacia la espalda (-Z)
  _eu.set(c.flare * 0.5, dihedral + flapA - c.turn * 0.25 + flut * 2, sweep, 'XYZ');
  L.quaternion.setFromEuler(_eu);
  _eu.set(c.flare * 0.5, -(dihedral + flapA + c.turn * 0.25 + flut * 2), -sweep, 'XYZ');
  R.quaternion.setFromEuler(_eu);
  void _qb; void AX;
}

/* Puntas de ala en espacio mundo (para estelas). */
const _tip = new THREE.Vector3();
export function wingTips(rig, outL, outR) {
  _tip.set(rig.wingSpan, 0.0, 0);
  outL.copy(_tip).applyMatrix4(rig.parts['wing-left'].matrixWorld);
  _tip.set(-rig.wingSpan, 0.0, 0);
  outR.copy(_tip).applyMatrix4(rig.parts['wing-right'].matrixWorld);
}

/* Pares de articulaciones: [padre, hijo]. El pivote es el origen del hijo. */
export const JOINTS = [
  ['torso', 'head'],
  ['torso', 'arm-left'],
  ['torso', 'arm-right'],
  ['torso', 'leg-left'],
  ['torso', 'leg-right'],
  ['torso', 'wing-left'],
  ['torso', 'wing-right'],
];
