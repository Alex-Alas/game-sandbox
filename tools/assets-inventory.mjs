#!/usr/bin/env node
// Inventario de packs 3D: recorre <raíz>/<pack>/… y mide cada .gltf/.glb
// (triángulos, vértices, huesos, clips, materiales, texturas) sin dependencias.
// Los demás formatos (FBX, OBJ, BLEND…) solo se cuentan: glTF es el formato de trabajo.
//
//   node tools/assets-inventory.mjs assets            # tabla Markdown por pack a stdout
//   node tools/assets-inventory.mjs assets --json     # detalle por archivo
//   node tools/assets-inventory.mjs assets --pack "KayKit Prototype Bits"   # un pack, archivo por archivo
//
// Si un pack trae el mismo modelo en varias carpetas glTF (p. ej. KayKit «gltf» y «fbx(unity)»),
// se mide solo la primera aparición de cada nombre de archivo.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename, dirname, relative } from 'node:path';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--')) ?? 'assets';
const asJson = args.includes('--json');
const onlyPack = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : null;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push({ path: p, size: st.size });
  }
  return out;
}

// Dimensiones de PNG/JPEG/WebP leyendo solo la cabecera
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (fmt === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
    if (fmt === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  }
  return null;
}

function readGltf(file) {
  const raw = readFileSync(file);
  let json, bin = null;
  if (raw.readUInt32LE(0) === 0x46546c67) { // 'glTF'
    let off = 12;
    while (off < raw.length) {
      const len = raw.readUInt32LE(off), type = raw.readUInt32LE(off + 4);
      const chunk = raw.subarray(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
      else if (type === 0x004e4942) bin = chunk;
      off += 8 + len;
    }
  } else json = JSON.parse(raw.toString('utf8'));

  const acc = json.accessors ?? [];
  const meshes = json.meshes ?? [];
  const nodes = json.nodes ?? [];
  // Triángulos por instancia de nodo (una malla usada dos veces cuenta dos)
  const meshTris = meshes.map((m) => m.primitives.reduce((s, p) => {
    const mode = p.mode ?? 4;
    const n = p.indices != null ? acc[p.indices].count : acc[p.attributes.POSITION].count;
    return s + (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
  }, 0));
  const meshVerts = meshes.map((m) => m.primitives.reduce((s, p) => s + acc[p.attributes.POSITION].count, 0));
  let tris = 0, verts = 0, drawCalls = 0;
  const seen = new Set();
  const visit = (i) => {
    const n = nodes[i];
    if (n.mesh != null) { tris += meshTris[n.mesh]; verts += meshVerts[n.mesh]; drawCalls += meshes[n.mesh].primitives.length; seen.add(n.mesh); }
    for (const c of n.children ?? []) visit(c);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  if (scene) for (const r of scene.nodes ?? []) visit(r);
  meshes.forEach((m, i) => { if (!seen.has(i)) { tris += meshTris[i]; verts += meshVerts[i]; drawCalls += m.primitives.length; } });

  const bones = Math.max(0, ...(json.skins ?? []).map((s) => s.joints.length));
  const clips = (json.animations ?? []).map((a) => {
    let dur = 0;
    for (const s of a.samplers) dur = Math.max(dur, acc[s.input].max?.[0] ?? 0);
    return { name: a.name ?? '(sin nombre)', dur: +dur.toFixed(3) };
  });
  const images = (json.images ?? []).map((img) => {
    let buf = null;
    if (img.uri && !img.uri.startsWith('data:')) {
      const p = join(dirname(file), decodeURIComponent(img.uri));
      if (existsSync(p)) buf = readFileSync(p);
    } else if (img.uri?.startsWith('data:')) buf = Buffer.from(img.uri.split(',')[1], 'base64');
    else if (img.bufferView != null && bin) {
      const bv = json.bufferViews[img.bufferView];
      buf = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    }
    const dim = buf && imageSize(buf);
    return { name: img.uri ? basename(decodeURIComponent(img.uri)) : img.name ?? '(incrustada)', dim };
  });
  const mats = (json.materials ?? []).map((m) => ({
    name: m.name,
    metal: m.pbrMetallicRoughness?.metallicFactor ?? 1,
    tex: m.pbrMetallicRoughness?.baseColorTexture != null,
  }));
  return { tris: Math.round(tris), verts, drawCalls, bones, clips, images, mats, nodes: nodes.length };
}

const packs = readdirSync(root).filter((d) => !d.startsWith('.') && statSync(join(root, d)).isDirectory());
const report = [];
for (const pack of packs) {
  if (onlyPack && pack !== onlyPack) continue;
  const files = walk(join(root, pack));
  const ext = {};
  let bytes = 0;
  for (const f of files) { const e = extname(f.path).slice(1).toLowerCase() || '(sin ext)'; ext[e] = (ext[e] ?? 0) + 1; bytes += f.size; }
  const models = [];
  const names = new Set();
  for (const f of files) {
    const e = extname(f.path).toLowerCase();
    if (e !== '.gltf' && e !== '.glb') continue;
    const key = basename(f.path, e).toLowerCase();
    if (names.has(key)) continue;
    names.add(key);
    try { models.push({ file: relative(join(root, pack), f.path), ...readGltf(f.path) }); }
    catch (err) { models.push({ file: relative(join(root, pack), f.path), error: String(err.message ?? err) }); }
  }
  const licence = files.filter((f) => /licen|readme|credit|terms/i.test(basename(f.path))).map((f) => relative(join(root, pack), f.path));
  report.push({ pack, bytes, ext, licence, models });
}

if (asJson) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }

const fmtMB = (b) => (b / 1048576).toFixed(1) + ' MB';
const stats = (xs) => {
  if (!xs.length) return '—';
  const s = [...xs].sort((a, b) => a - b);
  return `${s[0]} / ${s[Math.floor(s.length / 2)]} / ${s[s.length - 1]}`;
};
for (const r of report) {
  const ok = r.models.filter((m) => !m.error);
  const clips = ok.flatMap((m) => m.clips.map((c) => c.name));
  const texDims = [...new Set(ok.flatMap((m) => m.images.map((i) => (i.dim ? i.dim.join('×') : '?'))))];
  const metal = ok.some((m) => m.mats.some((x) => x.metal > 0.5));
  console.log(`### ${r.pack}\n`);
  console.log(`- Tamaño en disco: ${fmtMB(r.bytes)}; archivos por extensión: ${Object.entries(r.ext).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e} ${n}`).join(', ')}`);
  console.log(`- Licencia/créditos: ${r.licence.join(', ') || '**no se encontró archivo de licencia**'}`);
  console.log(`- Modelos glTF únicos: ${ok.length}${r.models.length > ok.length ? ` (${r.models.length - ok.length} con error)` : ''}`);
  console.log(`- Triángulos mín / mediana / máx: ${stats(ok.map((m) => m.tris))}; draw calls mín / mediana / máx: ${stats(ok.map((m) => m.drawCalls))}`);
  console.log(`- Con esqueleto: ${ok.filter((m) => m.bones).length} (huesos: ${stats(ok.filter((m) => m.bones).map((m) => m.bones))}); clips de animación: ${clips.length}${clips.length ? ` (únicos ${new Set(clips).size})` : ''}`);
  console.log(`- Texturas: ${texDims.join(', ') || 'ninguna (color por material)'}${metal ? '; **hay materiales con metalness > 0.5** (revisar al importar)' : ''}`);
  if (onlyPack) {
    console.log('\n| Archivo | Tris | Verts | DC | Huesos | Clips |\n|---|---:|---:|---:|---:|---|');
    for (const m of r.models) console.log(m.error ? `| ${m.file} | error: ${m.error} |||||` : `| ${m.file} | ${m.tris} | ${m.verts} | ${m.drawCalls} | ${m.bones || ''} | ${m.clips.map((c) => `${c.name} (${c.dur}s)`).join(', ')} |`);
  }
  console.log('');
}
