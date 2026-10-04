/* Sprites: atlas 0x72 (héroes, goblin, diablillo, corazones) con su tile_list.txt,
   tileset del castillo de RottingPixels en cuadros de 16×16, y lo que se dibuja en código
   (cubo, hada, pinchos, gemas, antorcha). Los contornos por color se generan al cargar
   y se guardan en caché. */
import { ASSET_BASE, PLAYER_COLORS, ALIGN, HEROES } from './config.js';

const frames = new Map(); // nombre → { x, y, w, h }
let atlas = null, castle = null;

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('no cargó ' + src));
    im.src = src;
  });
}

export async function loadSprites() {
  const [a, c, list] = await Promise.all([
    loadImg(ASSET_BASE + 'sprites/dungeon-tileset-ii.png'),
    loadImg(ASSET_BASE + 'tiles/castle-tileset.png'),
    fetch(ASSET_BASE + 'sprites/tile_list.txt').then((r) => r.text()),
  ]);
  atlas = a; castle = c;
  for (const line of list.split('\n')) {
    const [name, x, y, w, h] = line.trim().split(/\s+/);
    if (name && h) frames.set(name, { x: +x, y: +y, w: +w, h: +h });
  }
  buildCodeSprites();
  // Contornos de los héroes en los 4 colores (se usan en la sala y en el pozo)
  for (const hero of HEROES) for (const sx of ['m', 'f']) for (const col of PLAYER_COLORS) heroFrames(hero.id + '_' + sx, col.hex);
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/* Recorta un cuadro del atlas y le agrega un contorno de 1 px del color dado. */
const outlineCache = new Map();
export function outlined(name, color) {
  const key = name + '|' + color;
  let c = outlineCache.get(key);
  if (c) return c;
  const f = frames.get(name);
  if (!f) throw new Error('falta el cuadro ' + name);
  c = outlineCanvas(atlas, f.x, f.y, f.w, f.h, color);
  outlineCache.set(key, c);
  return c;
}

export function outlineCanvas(src, sx, sy, w, h, color) {
  const [c, g] = canvas(w + 2, h + 2);
  g.drawImage(src, sx, sy, w, h, 1, 1, w, h);
  if (!color) return c;
  const img = g.getImageData(0, 0, w + 2, h + 2);
  const d = img.data, W = w + 2, H = h + 2;
  const [r, gg, b] = hexRgb(color);
  const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[(y * W + x) * 4 + 3]);
  const mark = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (a(x, y) > 40) continue;
    if (a(x - 1, y) > 40 || a(x + 1, y) > 40 || a(x, y - 1) > 40 || a(x, y + 1) > 40) mark.push((y * W + x) * 4);
  }
  for (const i of mark) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c;
}

export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* Cuadros de un héroe ('knight_m', …) con contorno del color del jugador. */
const heroCache = new Map();
export function heroFrames(hero, color) {
  const key = hero + '|' + color;
  let h = heroCache.get(key);
  if (h) return h;
  h = {
    idle: [0, 1, 2, 3].map((i) => outlined(`${hero}_idle_anim_f${i}`, color)),
    run: [0, 1, 2, 3].map((i) => outlined(`${hero}_run_anim_f${i}`, color)),
    hit: outlined(`${hero}_hit_anim_f0`, color),
  };
  heroCache.set(key, h);
  return h;
}

const ATLAS_NAME = { goblin: 'goblin', imp: 'imp', skeleton: 'skelet' };
export function creatureFrames(kind) {
  const name = ATLAS_NAME[kind] || 'imp';
  return {
    idle: [0, 1, 2, 3].map((i) => outlined(`${name}_idle_anim_f${i}`, ALIGN.evil)),
    run: [0, 1, 2, 3].map((i) => outlined(`${name}_run_anim_f${i}`, ALIGN.evil)),
  };
}

export const heart = (kind) => frames.get('ui_heart_' + kind) && outlined('ui_heart_' + kind, null);

/* Cuadros del castillo (columna, fila en la grilla de 16×16). Ver castle-referencia.png. */
export const CASTLE = {
  stone: [[3, 0], [4, 0], [5, 0], [3, 1], [4, 1], [5, 1]],
  stoneBottom: [[3, 2], [4, 2], [5, 2]],   // con sombra abajo: la piedra que da al vacío
  brick: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  brickBottom: [[0, 2], [1, 2], [2, 2]],
  bg: [[1, 3], [2, 3], [3, 3], [4, 3]],   // ladrillo oscuro del fondo
  bgShadow: [[0, 3], [5, 3]],
  woodL: [5, 7], woodM: [6, 7], woodR: [7, 7],
  banner: [6, 0],                          // 1×3
  crate: [1, 7], barrel: [2, 7], vase: [4, 7], chest: [6.5, 3],
  braceL: [6, 8], braceR: [7, 8],
};
export function drawCastle(g, [cx, cy], x, y, w = 16, h = 16) {
  g.drawImage(castle, cx * 16, cy * 16, w, h, x, y, w, h);
}
export function drawCastleRaw(g, sx, sy, w, h, x, y) {
  g.drawImage(castle, sx, sy, w, h, x, y, w, h);
}
export const DOOR = [30, 150, 26, 26]; // puerta de madera con arco

/* ── Sprites dibujados en código ── */
export const CODE = {};

function px(g, color, pts) {
  g.fillStyle = color;
  for (const [x, y, w = 1, h = 1] of pts) g.fillRect(x, y, w, h);
}

function buildCodeSprites() {
  // Gema chica (7×7) en 4 cuadros de brillo
  CODE.gem = [0, 1, 2, 3].map((f) => {
    const [c, g] = canvas(9, 9);
    px(g, '#0d1b3a', [[3, 0, 3, 1], [1, 1, 7, 1], [0, 2, 9, 3], [1, 5, 7, 1], [2, 6, 5, 1], [3, 7, 3, 1], [4, 8, 1, 1]]);
    px(g, '#2f6bff', [[3, 1, 3, 1], [1, 2, 7, 3], [2, 5, 5, 1], [3, 6, 3, 1], [4, 7, 1, 1]]);
    px(g, '#7fb6ff', [[2, 2, 2, 1], [1, 3, 2, 1], [5, 2, 2, 1]]);
    if (f === 0) px(g, '#ffffff', [[2, 2], [3, 1]]);
    if (f === 2) px(g, '#ffffff', [[6, 3]]);
    return c;
  });
  // Gema grande (15×13)
  CODE.bigGem = [0, 1, 2, 3].map((f) => {
    const [c, g] = canvas(17, 15);
    px(g, '#0d1b3a', [[4, 0, 9, 1], [2, 1, 13, 1], [0, 2, 17, 4], [1, 6, 15, 1], [2, 7, 13, 1], [4, 8, 9, 2], [6, 10, 5, 2], [7, 12, 3, 1], [8, 13, 1, 1]]);
    px(g, '#2f6bff', [[4, 1, 9, 1], [2, 2, 13, 4], [2, 6, 13, 1], [4, 7, 9, 2], [6, 9, 5, 2], [7, 11, 3, 1], [8, 12, 1, 1]]);
    px(g, '#5a94ff', [[2, 2, 13, 1], [6, 6, 5, 3]]);
    px(g, '#a9d0ff', [[4, 2, 3, 1], [3, 3, 2, 1], [9, 2, 2, 1], [12, 3, 2, 1]]);
    px(g, '#1d46c8', [[11, 6, 4, 1], [10, 7, 3, 2], [9, 9, 2, 2]]);
    if (f === 0) px(g, '#ffffff', [[5, 2], [4, 3], [3, 4]]);
    if (f === 2) px(g, '#ffffff', [[12, 3], [13, 4]]);
    return c;
  });
  // Pinchos: arriba y abajo
  const spike = (up) => {
    const [c, g] = canvas(16, 16);
    for (let i = 0; i < 4; i++) {
      const x = i * 4;
      for (let r = 0; r < 9; r++) {
        const half = Math.floor(r / 3);
        const y = up ? 6 + r : 9 - r;
        g.fillStyle = r === 8 ? '#3a3a46' : '#b9bcc9';
        g.fillRect(x + 2 - half - (r > 5 ? 0 : 0), y, Math.max(1, half * 2 + (r % 3 === 2 ? 1 : 0)), 1);
        g.fillStyle = '#e8eaf2';
        if (r < 4) g.fillRect(x + 1 + (half ? 0 : 1), y, 1, 1);
      }
    }
    g.fillStyle = '#3a3a46';
    g.fillRect(0, up ? 14 : 0, 16, 2);
    g.fillStyle = '#6a6a78';
    g.fillRect(0, up ? 14 : 1, 16, 1);
    return c;
  };
  CODE.spikeUp = spike(true);
  CODE.spikeDown = spike(false);
  // Antorcha: soporte + llama en 3 cuadros
  CODE.torch = [0, 1, 2].map((f) => {
    const [c, g] = canvas(8, 14);
    px(g, '#3b2414', [[3, 8, 2, 6]]);
    px(g, '#7a4a28', [[2, 8, 4, 1], [3, 9, 1, 4]]);
    const fl = [[[3, 3, 2, 5], [2, 5, 4, 3], [3, 1, 1, 2]], [[3, 2, 2, 6], [2, 4, 4, 4], [4, 0, 1, 2]], [[2, 3, 3, 5], [3, 5, 3, 3], [3, 1, 1, 2]]][f];
    px(g, '#ff7a1a', fl);
    px(g, '#ffd23f', [[3, 5, 2, 3]]);
    px(g, '#fff5c0', [[3, 6, 1, 1]]);
    return c;
  });
  // Cubo gelatinoso (16×16) con contorno violeta punteado
  CODE.cube = [0, 1].map((f) => {
    const [c, g] = canvas(18, 18);
    g.fillStyle = 'rgba(120,230,160,0.45)';
    g.fillRect(2, 2 + f, 14, 14 - f);
    g.fillStyle = 'rgba(200,255,220,0.55)';
    g.fillRect(3, 3 + f, 5, 2);
    g.fillRect(3, 5 + f, 2, 3);
    g.fillStyle = 'rgba(40,120,80,0.6)';
    g.fillRect(10, 10, 2, 2); g.fillRect(6, 11, 1, 1); // cosas flotando adentro
    g.fillStyle = ALIGN.neutral;
    for (let i = 0; i < 18; i += 2) {
      g.fillRect(i, f ? 1 : 0, 1, 1); g.fillRect(i + 1, 17, 1, 1);
      g.fillRect(0, i + 1, 1, 1); g.fillRect(17, i, 1, 1);
    }
    return c;
  });
  // Plataforma que se derrumba (16×6): losa de piedra agrietada
  CODE.crumble = (() => {
    const [c, g] = canvas(16, 6);
    px(g, '#2a1d17', [[0, 0, 16, 6]]);
    px(g, '#8a7766', [[1, 0, 14, 4]]);
    px(g, '#b3a08a', [[1, 0, 14, 1]]);
    px(g, '#5a4a3e', [[1, 4, 14, 1], [5, 1, 1, 2], [6, 3, 1, 1], [11, 0, 1, 2], [10, 2, 1, 2], [2, 2, 2, 1]]);
    return c;
  })();
  // Ojito de El Ojo (9×9) con alitas, 2 cuadros
  CODE.eyelet = [0, 1].map((f) => {
    const [c, g] = canvas(11, 9);
    px(g, '#5a1020', f ? [[0, 1, 2, 2], [9, 1, 2, 2]] : [[0, 4, 2, 2], [9, 4, 2, 2]]);
    px(g, '#3a0a14', [[3, 1, 5, 1], [2, 2, 7, 5], [3, 7, 5, 1]]);
    px(g, '#f2e2d0', [[3, 2, 5, 1], [3, 3, 5, 3], [4, 6, 3, 1]]);
    px(g, '#c0203a', [[4, 3, 3, 3]]);
    px(g, '#14060a', [[5, 4, 1, 1]]);
    return c;
  });
  // El Ojo (32×32): globo con venas; el iris y el párpado se dibujan encima en render.js
  CODE.ojoBall = (() => {
    const [c, g] = canvas(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy);
      if (d > 15.5) continue;
      g.fillStyle = d > 14.3 ? '#3a0a14' : (dx + dy < -8 && d < 12) ? '#fff6ea' : d > 11 ? '#c9b4a2' : '#ead8c6';
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#b8293f';
    for (const [x0, y0, dx, dy, n] of [[3, 12, 1, 0.3, 7], [28, 10, -1, 0.4, 6], [6, 25, 1, -0.5, 6], [26, 25, -1, -0.6, 6]]) {
      for (let i = 0; i < n; i++) g.fillRect(Math.round(x0 + dx * i), Math.round(y0 + dy * i + Math.sin(i) * 0.8), 1, 1);
    }
    return c;
  })();
  // Hada (9×9) turquesa con alas; cuadros: calma ×2, enojada ×2
  CODE.fairy = [0, 1, 2, 3].map((f) => {
    const [c, g] = canvas(11, 11);
    const angry = f >= 2, up = f % 2 === 0;
    px(g, 'rgba(200,255,250,0.75)', up ? [[0, 1, 3, 3], [8, 1, 3, 3]] : [[0, 4, 3, 3], [8, 4, 3, 3]]);
    px(g, ALIGN.good, [[4, 2, 3, 3], [3, 5, 5, 3], [4, 8, 3, 1]]);
    px(g, '#e9fffb', [[4, 3, 1, 1], [6, 3, 1, 1]]);
    if (angry) px(g, '#ff2a3a', [[4, 3, 1, 1], [6, 3, 1, 1], [3, 1, 2, 1], [6, 1, 2, 1]]);
    px(g, '#ffffff', [[5, 0]]);
    return c;
  });
}
