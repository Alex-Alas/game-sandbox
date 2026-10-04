/* Render: canvas de 192 px de ancho escalado a un factor entero (image-rendering: pixelated).
   Los tiles de cada tramo se pre-dibujan una vez; cada cuadro se dibujan sprites, cuerda,
   capa de oscuridad con círculos de luz, puntitos de vida y balas, y flechas a los compañeros.
   Todo lo que va en coordenadas del mundo pasa por project(x, y) (identidad en el interior;
   la torre exterior del futuro dará la vuelta en x). Dibuja una "vista" (ver main.js). */
import { CFG, ALIGN } from './config.js';
import { STONE, WOOD, SPIKE, CRUMBLE, EMPTY, baseTileAt, tileAt, mulberry32 } from './level.js';
import { canvas, heroFrames, creatureFrames, CODE, CASTLE, drawCastle, drawCastleRaw, DOOR } from './sprites.js';
import { makeLink, stepLink } from './rope.js';
import { ropePath, BOSS_W } from './sim.js';

const T = CFG.TILE, W = CFG.VIEW_W, HH = CFG.PH / 2;

/* Del mundo a la pantalla. En el interior es la identidad; el exterior (torre cilíndrica a
   la que se da vuelta) enrollará la x acá. Los tiles del interior van pre-dibujados. */
export const project = (x, y) => [x, y];

/* Fuente de 3×5 para números flotantes */
const GLYPH = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010',
  '8': '111101111101111', '9': '111101111001111', '+': '000010111010000', '!': '010010010000010',
  '-': '000000111000000', 'x': '000101010101000',
};
function pixText(g, str, x, y, color) {
  g.fillStyle = color;
  let cx = Math.round(x - (str.length * 4 - 1) / 2);
  for (const ch of str) {
    const gl = GLYPH[ch];
    if (gl) for (let i = 0; i < 15; i++) if (gl[i] === '1') g.fillRect(cx + (i % 3), Math.round(y) + ((i / 3) | 0), 1, 1);
    cx += 4;
  }
}

/* Tiles del tramo pre-dibujados en un canvas del alto del nivel (también lo usa el visor de
   bloques). Los tiles dinámicos (CRUMBLE, entrada y piso del jefe) se dibujan aparte. */
export function paintLevel(lv) {
  const [c, g] = canvas(W, lv.pxH);
  const rnd = mulberry32(lv.decoSeed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const solid = (x, y) => { const t = baseTileAt(lv, x, y); return t === STONE || t === SPIKE; };
  g.fillStyle = '#1a1210';
  g.fillRect(0, 0, W, lv.pxH);
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) {
    if (baseTileAt(lv, x, y) !== STONE) drawCastle(g, rnd() < 0.85 ? pick(CASTLE.bg) : pick(CASTLE.bgShadow), x * T, y * T);
  }
  // Estandartes contra el fondo, donde haya 3 celdas libres en vertical
  for (let y = 1; y < lv.h - 3; y++) for (let x = 1; x < lv.w - 1; x++) {
    if (rnd() > 0.018) continue;
    if ([0, 1, 2].some((k) => baseTileAt(lv, x, y + k) !== 0)) continue;
    drawCastle(g, CASTLE.banner, x * T, y * T, 16, 48);
  }
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) {
    const t = baseTileAt(lv, x, y), px = x * T, py = y * T;
    if (t === STONE) {
      const wall = x === 0 || x === lv.w - 1;
      const open = !solid(x, y + 1) && y < lv.h - 1;
      drawCastle(g, pick(wall ? (open ? CASTLE.brickBottom : CASTLE.brick) : (open ? CASTLE.stoneBottom : CASTLE.stone)), px, py);
    } else if (t === WOOD) {
      const l = baseTileAt(lv, x - 1, y) === WOOD, r = baseTileAt(lv, x + 1, y) === WOOD;
      drawCastle(g, !l ? CASTLE.woodL : !r ? CASTLE.woodR : CASTLE.woodM, px, py);
    } else if (t === SPIKE) {
      const down = solid(x, y - 1) && !solid(x, y + 1) && baseTileAt(lv, x, y - 1) !== SPIKE;
      g.drawImage(down ? CODE.spikeDown : CODE.spikeUp, px, py);
    }
  }
  // Puerta de salida en el FIN
  const [sx, sy, sw, sh] = DOOR;
  drawCastleRaw(g, sx, sy, sw, sh, Math.round(W / 2 - sw / 2), lv.finY - sh);
  return c;
}

export function createRenderer(cv) {
  const ctx = cv.getContext('2d');
  let H = 400, scale = 2;
  const [dark, dg] = canvas(W, H);
  const [light] = (() => { // círculo de luz pre-dibujado
    const [c, g] = canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return [c];
  })();
  const [warm] = (() => {
    const [c, g] = canvas(64, 64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,150,60,0.30)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return [c];
  })();

  const R = {
    cam: 0, shakeT: 0, lv: null, levelCv: null, ropes: [], ropeKey: '',
    parts: [], pops: [], bullets: [], hpSeen: new Map(), hpShowT: new Map(),
    get H() { return H; }, get scale() { return scale; },
  };

  R.resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const devW = innerWidth * dpr, devH = innerHeight * dpr;
    scale = Math.max(1, Math.min(Math.floor(devW / W), Math.floor(devH / CFG.MIN_VIEW_H)));
    H = Math.floor(devH / scale);
    cv.width = W; cv.height = H;
    cv.style.width = (W * scale) / dpr + 'px';
    cv.style.height = (H * scale) / dpr + 'px';
    dark.width = W; dark.height = H;
    ctx.imageSmoothingEnabled = false;
  };

  /* Pre-dibuja los tiles del tramo (fondo de ladrillo, piedra, madera, pinchos, puerta). */
  R.setLevel = (lv) => {
    R.lv = lv;
    R.ropes = []; R.ropeKey = '';
    R.parts = []; R.pops = []; R.bullets = [];
    R.levelCv = paintLevel(lv);
    // Tiles que cambian (plataformas que se derrumban, entrada y piso de la sala del jefe): cada cuadro
    R.dynTiles = [];
    for (let i = 0; i < lv.tiles.length; i++) if (lv.tiles[i] === CRUMBLE) R.dynTiles.push(i);
    R.dynTiles.push(...lv.gate, ...lv.exit);
    R.cam = 0;
  };

  R.shake = (t = 0.25) => { R.shakeT = Math.max(R.shakeT, t); };

  function burst(x, y, n, color, sp = 60, life = 0.4, grav = 200) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.4 + Math.random() * 0.6);
      R.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - sp * 0.3, t: life * (0.6 + Math.random() * 0.4), color, grav });
    }
  }
  function pop(x, y, text, color) { R.pops.push({ x, y, text, color, t: 0.9 }); }
  function killBullet(x, y) {
    let best = -1, bd = 24;
    R.bullets.forEach((b, i) => { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) R.bullets.splice(best, 1);
  }
  R.burst = burst;

  /* Efectos visuales de un evento de la simulación. */
  R.fx = (ev, view) => {
    const pl = ev.id != null ? view.players.find((p) => p.id === ev.id) : null;
    const me = ev.id === view.meId;
    switch (ev.k) {
      case 'shot':
        R.bullets.push({ x: ev.x, y: ev.y, vx: ev.vx, vy: ev.vy, d: 0 });
        burst(ev.x, ev.y, 3, '#fff3b0', 40, 0.15, 0);
        R.parts.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, t: 0.06, color: 'flash', grav: 0 });
        break;
      case 'spark': killBullet(ev.x, ev.y); burst(ev.x, ev.y, 4, '#ffd27a', 50, 0.25); break;
      case 'chit': killBullet(ev.x, ev.y); burst(ev.x, ev.y, 4, '#ffffff', 50, 0.2); break;
      case 'plop': killBullet(ev.x, ev.y); burst(ev.x, ev.y, 5, '#9ff2c0', 40, 0.4); break;
      case 'kill':
        killBullet(ev.x, ev.y);
        burst(ev.x, ev.y, 12, ALIGN.evil, 80, 0.5);
        burst(ev.x, ev.y, 5, '#7fb6ff', 60, 0.6);
        if (ev.v) pop(ev.x, ev.y - 8, '+' + ev.v, '#7fb6ff');
        break;
      case 'gem':
        burst(ev.x, ev.y, ev.big ? 14 : 5, '#a9d0ff', ev.big ? 90 : 50, 0.5, 60);
        if (ev.big) { pop(ev.x, ev.y - 10, '+' + ev.v, '#a9d0ff'); R.shake(0.15); }
        break;
      case 'hit':
        if (pl) burst(pl.x, pl.y, 10, '#ff4040', 70, 0.4);
        if (me) R.shake(0.3);
        break;
      case 'ko': if (pl) { burst(pl.x, pl.y, 14, '#8a8a8a', 50, 0.8, 30); pop(pl.x, pl.y - 18, 'x', '#bbbbbb'); } break;
      case 'ff':
        killBullet(pl ? pl.x : 0, pl ? pl.y : 0);
        if (pl) { burst(pl.x, pl.y - 6, 6, '#ffe14a', 40, 0.5, 0); pop(pl.x, pl.y - 20, '!', '#ffe14a'); }
        break;
      case 'tug': {
        if (!pl) break;
        for (const nb of view.players) if (Math.abs(nb.idx - pl.idx) === 1) burst(nb.x, nb.y, 5, '#f4e1b8', 50, 0.3, 0);
        break;
      }
      case 'trap': if (pl) burst(pl.x, pl.y, 8, '#9ff2c0', 30, 0.6, -40); break;
      case 'free': if (pl) burst(pl.x, pl.y, 12, '#9ff2c0', 80, 0.5); break;
      case 'stomp': burst(ev.x, ev.y, 8, '#d8c8a8', 60, 0.3); R.shake(ev.strong ? 0.25 : 0.1); break;
      case 'land': burst(ev.x, ev.y, 10, '#c9b38a', 70, 0.35, 120); if (me) R.shake(0.2); break;
      case 'heal': burst(ev.x, ev.y, 14, ALIGN.good, 60, 0.7, -20); if (pl) pop(pl.x, pl.y - 20, '+', '#ff6b8a'); break;
      case 'angry': killBullet(ev.x, ev.y); burst(ev.x, ev.y, 8, '#ff2a3a', 50, 0.4, 0); pop(ev.x, ev.y - 10, '!', '#ff2a3a'); break;
      case 'fairypush': if (pl) burst(pl.x, pl.y, 8, ALIGN.good, 50, 0.4, 0); break;
      case 'bounce': if (pl) burst(pl.x, pl.y + 6, 6, '#f4e1b8', 50, 0.3, 0); break;
      case 'jump': if (pl) burst(pl.x, pl.y + HH, 3, '#a89070', 30, 0.25, 50); break;
      case 'anchor': if (pl) burst(pl.x, pl.y, 4, '#c0c0c8', 30, 0.2, 0); break;
      case 'arrow': burst(ev.x, ev.y - 6, 3, '#e8dcc0', 30, 0.2, 0); break;
      case 'arrowbreak': killBullet(ev.x, ev.y); burst(ev.x, ev.y, 5, '#d8cbb0', 40, 0.3); break;
      case 'shake': burst(ev.x, ev.y, 4, '#8a7766', 20, 0.4, 150); break;
      case 'crumble': burst(ev.x, ev.y, 7, '#8a7766', 40, 0.6, 300); break;
      case 'reform': burst(ev.x, ev.y, 3, '#b3a08a', 15, 0.3, 0); break;
      case 'chasewarn': R.shake(CFG.CHASE_WARN); break;
      case 'chasego': R.shake(0.5); break;
      case 'gate': burst(ev.x, ev.y, 18, '#9a8a7a', 60, 0.6, 200); R.shake(0.5); break;
      case 'beam': R.shake(0.3); break;
      case 'zap': if (pl) { burst(pl.x, pl.y, 8, '#ff5a7a', 60, 0.4, 0); pop(pl.x, pl.y - 20, '!', '#ff5a7a'); } if (me) R.shake(0.25); break;
      case 'gaze': burst(ev.x, ev.y, 10, '#7a1020', 40, 0.5, 0); break;
      case 'bosshit': burst(ev.x, ev.y, 16, '#ffffff', 90, 0.5); burst(ev.x, ev.y, 10, '#c0203a', 70, 0.6); pop(ev.x, ev.y - 14, '-1', '#ff5a7a'); R.shake(0.35); break;
      case 'clank': killBullet(ev.x, ev.y); burst(ev.x, ev.y, 4, '#ffe14a', 50, 0.2); break;
      case 'bossdie':
        burst(ev.x, ev.y, 40, '#c0203a', 120, 0.9); burst(ev.x, ev.y, 30, '#ead8c6', 100, 0.8); burst(ev.x, ev.y, 24, '#a9d0ff', 80, 1, 120);
        R.shake(1.2);
        break;
      default: break;
    }
  };

  /* Ancla y flechas en pixel art */
  function anchorGlyph(x, y) {
    ctx.fillStyle = '#d8d8e0';
    ctx.fillRect(x, y, 1, 4); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x - 2, y + 3, 1, 1); ctx.fillRect(x + 2, y + 3, 1, 1);
    ctx.fillRect(x - 1, y + 4, 3, 1);
  }
  function heartGlyph(x, y, full) {
    ctx.fillStyle = full ? '#ff3b5c' : '#4a2a33';
    ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x, y + 1, 3, 1); ctx.fillRect(x + 1, y + 2, 1, 1);
  }
  function lifeDots(p, x, y, withAmmo) {
    const hx = x - 6;
    for (let i = 0; i < CFG.HEARTS; i++) heartGlyph(hx + i * 4, y, i < p.hp);
    if (!withAmmo) return;
    const ax = x - (CFG.AMMO * 2 - 1) / 2;
    for (let i = 0; i < CFG.AMMO; i++) {
      ctx.fillStyle = i < p.ammo ? '#ffe14a' : '#3a3420';
      ctx.fillRect(Math.round(ax + i * 2), y + 4, 1, 2);
    }
  }
  function chevron(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1);
    ctx.fillRect(x, y + 2, 1, 1);
  }
  function line(x0, y0, x1, y1, color) {
    [x0, y0] = project(x0, y0);
    [x1, y1] = project(x1, y1);
    ctx.fillStyle = color;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /* view: { lv, t, players, creatures, gemsTaken, meId, ropes? } */
  R.draw = (view, dt) => {
    const lv = view.lv;
    if (!lv || !R.levelCv) return;
    dt = Math.min(dt, 1 / 20);
    const me = view.players.find((p) => p.id === view.meId);
    const focus = me || view.focus || view.players[0];
    if (view.chase) { // derrumbe: la cámara es compartida y su borde de arriba son los escombros
      R.cam = view.camY;
      if (view.chaseWarn) R.shakeT = Math.max(R.shakeT, 0.1);
    } else {
      const target = focus ? focus.y - H * 0.38 : (view.camY ?? 0);
      const maxCam = Math.max(0, lv.pxH - H);
      const tgt = Math.max(0, Math.min(maxCam, target));
      R.cam += (tgt - R.cam) * Math.min(1, dt * 7);
      if (Math.abs(tgt - R.cam) > H) R.cam = tgt;
    }
    R.shakeT = Math.max(0, R.shakeT - dt);
    const shk = R.shakeT > 0 ? Math.round((Math.random() - 0.5) * 4 * Math.min(1, R.shakeT * 6)) : 0;
    const cam = Math.round(R.cam) + shk;
    const vis = (y, m = 32) => y > cam - m && y < cam + H + m;
    const t = view.t;

    ctx.setTransform(1, 0, 0, 1, 0, -cam);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(R.levelCv, 0, cam, W, H, 0, cam, W, H);
    for (const i of R.dynTiles) {
      const x = i % lv.w, y = (i / lv.w) | 0;
      if (!vis(y * T + 8)) continue;
      const tt = tileAt(lv, x, y);
      if (tt === CRUMBLE) ctx.drawImage(CODE.crumble, x * T + (lv.shaking.has(i) ? Math.round(Math.random() * 2 - 1) : 0), y * T);
      else if (tt === STONE) drawCastle(ctx, CASTLE.stone[(x * 7 + y) % CASTLE.stone.length], x * T, y * T);
    }

    // Antorchas (con un brillo cálido)
    for (const tc of lv.torches) {
      if (!vis(tc.y)) continue;
      const f = Math.floor(t * 9 + tc.x) % 3;
      const [x, y] = project(tc.x, tc.y);
      ctx.drawImage(CODE.torch[f], x - 4, y - 7);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const tc of lv.torches) if (vis(tc.y, 40)) { const [x, y] = project(tc.x, tc.y); ctx.drawImage(warm, x - 32, y - 34); }
    ctx.globalCompositeOperation = 'source-over';

    // Gemas
    lv.gems.forEach((gm, i) => {
      if (view.gemsTaken[i] || !vis(gm.y) || (gm.boss && !view.bossDead)) return;
      const f = Math.floor(t * 5 + i * 1.3) % 4;
      const bob = Math.round(Math.sin(t * 3 + i) * (gm.big ? 1.5 : 1));
      const im = gm.big ? CODE.bigGem[f] : CODE.gem[f];
      const [x, y] = project(gm.x, gm.y);
      ctx.drawImage(im, Math.round(x - im.width / 2), Math.round(y - im.height / 2) + bob);
    });

    // Criaturas
    view.creatures.forEach((c, i) => {
      if (!c || !c.alive || !vis(c.y)) return;
      const [cx, cy] = project(c.x, c.y);
      const x = Math.round(cx), y = Math.round(cy);
      if (c.flash && Math.floor(t * 30) % 2) return;
      if (c.kind === 'goblin' || c.kind === 'imp') {
        const fr = creatureFrames(c.kind);
        const im = fr.run[Math.floor(t * 8 + i) % 4];
        drawFlip(im, x, c.kind === 'goblin' ? y + 6 - im.height + 1 : y - 9, c.dir < 0);
      } else if (c.kind === 'skeleton') {
        const im = creatureFrames('skeleton').idle[Math.floor(t * 5 + i) % 4];
        drawFlip(im, x, y + 7 - im.height + 1, c.dir < 0);
        if (c.aim) { // tensa el arco: el aviso
          ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ffffff' : '#ff4040';
          ctx.fillRect(x + (c.dir < 0 ? -6 : 5), y - 5, 2, 3);
        }
      } else if (c.kind === 'eyelet') {
        ctx.drawImage(CODE.eyelet[Math.floor(t * 12 + i) % 2], x - 5, y - 4);
      } else if (c.kind === 'cube') {
        ctx.drawImage(CODE.cube[Math.floor(t * 3 + i) % 2], x - 9, y - 9);
      } else {
        const im = CODE.fairy[(c.angry ? 2 : 0) + (Math.floor(t * 10) % 2)];
        ctx.drawImage(im, x - 5, y - 5);
        ctx.fillStyle = c.angry ? '#ff8a8a' : ALIGN.good;
        for (let k = 0; k < 3; k++) {
          const a = t * 3 + k * 2.1 + i;
          if ((Math.floor(t * 8) + k) % 3) ctx.fillRect(Math.round(x + Math.cos(a) * 8), Math.round(y + Math.sin(a * 1.3) * 7), 1, 1);
        }
      }
    });

    // Flechas
    for (const a of view.arrows || []) {
      const d = Math.hypot(a.vx, a.vy) || 1;
      line(a.x - (a.vx / d) * 6, a.y - (a.vy / d) * 6, a.x, a.y, '#d8cbb0');
      ctx.fillStyle = '#ff5050';
      ctx.fillRect(Math.round(a.x), Math.round(a.y), 1, 1);
    }

    // El Ojo
    const B = view.boss;
    if (B && !B.dead) drawBoss(B, view, t);

    // Cuerda (partículas de dibujo que siguen el camino de la física)
    const P = view.players;
    const key = P.map((p) => p.id).join(',');
    if (key !== R.ropeKey) {
      R.ropeKey = key;
      R.ropes = P.slice(1).map((b, i) => makeLink(P[i].x, P[i].y, b.x, b.y));
    }
    R.ropes.forEach((L, i) => {
      const a = P[i], b = P[i + 1];
      const guide = ropePath(lv, a.x, a.y, b.x, b.y);
      stepLink(L, lv, a.x, a.y, b.x, b.y, dt, guide.pts);
      const taut = guide.len > CFG.ROPE_LEN * 1.5;
      const col = taut ? '#e8925a' : '#b88b56';
      let px = a.x, py = a.y;
      for (const q of L.pts) { line(px, py, q.x, q.y, col); px = q.x; py = q.y; }
      line(px, py, b.x, b.y, col);
    });

    // Jugadores
    for (const p of P) {
      if (!vis(p.y)) continue;
      const fr = heroFrames(p.hero, p.color);
      const [px, py] = project(p.x, p.y);
      const x = Math.round(px), feet = Math.round(py + HH);
      if (p.inv && !p.ko && Math.floor(t * 16) % 2) continue; // parpadeo de invulnerable
      ctx.globalAlpha = p.off ? 0.45 : 1;
      if (p.ko) { // tirado de costado
        ctx.save();
        ctx.translate(x, feet - 5);
        ctx.rotate(p.left ? -Math.PI / 2 : Math.PI / 2);
        ctx.drawImage(fr.hit, -9, -22);
        ctx.restore();
      } else {
        let im;
        if (p.stun || (p.hurtAgo != null && p.hurtAgo < 0.3)) im = fr.hit;
        else if (p.grounded && Math.abs(p.vx) > 12) im = fr.run[Math.floor(t * 10) % 4];
        else if (!p.grounded) im = fr.run[1];
        else im = fr.idle[Math.floor(t * 5 + p.idx) % 4];
        drawFlip(im, x, feet - im.height + 1, p.left);
        if (p.trapped) { ctx.globalAlpha = 0.5; ctx.drawImage(CODE.cube[0], x - 9, Math.round(py) - 9); }
      }
      ctx.globalAlpha = 1;
    }

    // Balas (de dibujo)
    for (const b of R.bullets) {
      const s = dt / 3;
      for (let k = 0; k < 3; k++) {
        b.x += b.vx * s; b.y += b.vy * s; b.d += Math.hypot(b.vx, b.vy) * s;
        const tt = tileAt(lv, Math.floor(b.x / T), Math.floor(b.y / T));
        if (tt === STONE || tt === SPIKE || b.d > CFG.SHOT_RANGE) { b.dead = true; break; }
      }
      const [bx, by] = project(b.x, b.y);
      ctx.fillStyle = '#fff6c8';
      ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 2, 2, 4);
    }
    R.bullets = R.bullets.filter((b) => !b.dead);

    // Partículas
    for (const q of R.parts) {
      q.t -= dt;
      q.vy += q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      const [qx, qy] = project(q.x, q.y);
      if (q.color === 'flash') { ctx.fillStyle = '#fff8d0'; ctx.fillRect(Math.round(qx) - 3, Math.round(qy) - 1, 7, 3); continue; }
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(qx), Math.round(qy), 1, 1);
    }
    R.parts = R.parts.filter((q) => q.t > 0);

    // Oscuridad con círculos de luz
    dg.globalCompositeOperation = 'source-over';
    dg.fillStyle = 'rgba(6,3,10,0.76)';
    dg.fillRect(0, 0, W, H);
    dg.globalCompositeOperation = 'destination-out';
    const lightAt = (wx, wy, r) => {
      const [x, y] = project(wx, wy);
      if (y + r > cam && y - r < cam + H) dg.drawImage(light, x - r, y - cam - r, r * 2, r * 2);
    };
    for (const tc of lv.torches) lightAt(tc.x, tc.y, 80 + Math.sin(t * 7 + tc.x) * 3 + Math.sin(t * 13) * 2);
    for (const p of P) lightAt(p.x, p.y - 4, p.ko ? 32 : 60);
    for (const b of R.bullets) lightAt(b.x, b.y, 14);
    lv.gems.forEach((gm, i) => { if (!view.gemsTaken[i]) lightAt(gm.x, gm.y, gm.big ? 32 : 12); });
    for (const c of view.creatures) if (c && c.alive && c.kind === 'fairy') lightAt(c.x, c.y, 20);
    lightAt(W / 2, lv.finY - 14, 44); // la puerta de salida
    for (const a of view.arrows || []) lightAt(a.x, a.y, 10);
    for (const c of view.creatures) if (c && c.alive && c.kind === 'skeleton' && c.aim) lightAt(c.x, c.y, 18);
    if (B && !B.dead) {
      lightAt(B.x, B.y, B.state === 'open' ? 64 : 48);
      if (B.state === 'beam') for (const by of B.beams) for (let x = 24; x < W; x += 36) lightAt(x, by, 30);
    }
    for (const q of R.parts) if (q.color === 'flash') lightAt(q.x, q.y, 30);
    ctx.drawImage(dark, 0, cam);

    // Escombros del derrumbe en el borde de arriba
    if (view.chase) drawDebris(cam, t);
    // Rayo de El Ojo (encima de la oscuridad: se ve venir)
    if (B && !B.dead) drawBeams(B, t);

    // Encima de la oscuridad: ojos malvados, chevrones, vida propia, números, flechas
    for (const c of view.creatures) {
      if (!c || !c.alive || !vis(c.y) || (c.kind !== 'goblin' && c.kind !== 'imp')) continue;
      if (Math.floor(t * 2 + c.x) % 7 === 0) continue; // parpadeo
      ctx.fillStyle = '#ff3030';
      const [cx, cy] = project(c.x, c.y);
      const ex = Math.round(cx) + (c.dir < 0 ? -1 : 0), ey = Math.round(cy) + (c.kind === 'goblin' ? -1 : -2);
      ctx.fillRect(ex - 2, ey, 1, 1); ctx.fillRect(ex + 2, ey, 1, 1);
    }
    for (const p of P) {
      if (!vis(p.y)) continue;
      const [px, py] = project(p.x, p.y);
      const x = Math.round(px), top = Math.round(py - HH) - 18;
      if (!p.ko) chevron(x, top, p.color);
      if (p.anchored) anchorGlyph(x + (p.left ? -8 : 8), Math.round(py) - 2);
      // Vida: la propia siempre; la ajena, un rato cuando cambia
      const seen = R.hpSeen.get(p.id);
      if (seen !== p.hp) { R.hpSeen.set(p.id, p.hp); if (seen != null) R.hpShowT.set(p.id, 1.6); }
      const showT = (R.hpShowT.get(p.id) || 0) - dt;
      R.hpShowT.set(p.id, showT);
      if (p.id === view.meId && !p.ko) lifeDots(p, x, top - 9, true);
      else if (showT > 0) lifeDots(p, x, top - 5, false);
    }
    for (const q of R.pops) {
      q.t -= dt; q.y -= 14 * dt;
      const [qx, qy] = project(q.x, q.y);
      if (Math.floor(q.t * 20) % 2 || q.t > 0.3) pixText(ctx, q.text, qx, qy, q.color);
    }
    R.pops = R.pops.filter((q) => q.t > 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (B && !B.dead && B.gateClosed) { // vida de El Ojo
      const bw = 60, bx = Math.round(W / 2 - bw / 2);
      ctx.fillStyle = '#14060a'; ctx.fillRect(bx - 1, 3, bw + 2, 5);
      ctx.fillStyle = '#4a1020'; ctx.fillRect(bx, 4, bw, 3);
      ctx.fillStyle = '#ff3b5c'; ctx.fillRect(bx, 4, Math.round((bw * B.hp) / B.max), 3);
      for (let k = 1; k < B.max; k++) { ctx.fillStyle = '#14060a'; ctx.fillRect(bx + Math.round((bw * k) / B.max), 4, 1, 3); }
    }
    for (const p of P) { // flechas a los compañeros fuera de pantalla
      if (p.id === view.meId) continue;
      const [px, py] = project(p.x, p.y);
      const above = py < cam + 4, below = py > cam + H - 4;
      if (!above && !below) continue;
      const x = Math.max(4, Math.min(W - 5, Math.round(px)));
      ctx.fillStyle = p.color;
      for (let k = 0; k < 3; k++) {
        const y = above ? 2 + k : H - 3 - k;
        ctx.fillRect(x - k, y, k * 2 + 1, 1);
      }
    }
  };

  /* El Ojo: tallos, globo, iris que mira al jugador más cercano y párpado según el estado. */
  function drawBoss(B, view, t) {
    const x = Math.round(B.x), y = Math.round(B.y);
    for (let k = 0; k < 4; k++) { // tallos
      const ax = x - 12 + k * 8, sway = Math.sin(t * 3 + k * 1.7) * 3;
      line(ax, y + 10, ax + sway, y + 22, '#5a1020');
      line(ax + sway, y + 22, ax + sway * 1.6, y + 28, '#3a0a14');
    }
    ctx.drawImage(CODE.ojoBall, x - 16, y - 16);
    let tx = 0, ty = 1, bd = Infinity;
    for (const p of view.players) { const d = Math.hypot(p.x - B.x, p.y - B.y); if (!p.ko && d < bd) { bd = d; tx = p.x - B.x; ty = p.y - B.y; } }
    const tl = Math.hypot(tx, ty) || 1, ox = Math.round((tx / tl) * 5), oy = Math.round((ty / tl) * 5);
    const open = B.state === 'open', r = open ? 7 : 5;
    const irisCol = open ? (Math.floor(t * 8) % 2 ? '#ff3b5c' : '#ff7a8a') : '#c0203a';
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.hypot(i, j);
      if (d > r + 0.3) continue;
      ctx.fillStyle = d < 2.2 ? '#14060a' : d > r - 1 ? '#7a1020' : irisCol;
      ctx.fillRect(x + ox + i, y + oy + j, 1, 1);
    }
    const lid = B.state === 'gaze' || B.state === 'wait' ? 1 : B.state === 'warn' || B.state === 'beam' ? 0.45 : 0;
    if (lid > 0) { // párpado: baja desde arriba
      const h = Math.round(30 * lid);
      for (let j = 0; j < h; j++) {
        const yy = j - 15, half = Math.floor(Math.sqrt(Math.max(0, 15 * 15 - yy * yy)));
        ctx.fillStyle = j === h - 1 ? '#2a0810' : '#8a3040';
        ctx.fillRect(x - half, y - 15 + j, half * 2, 1);
      }
    }
    if (B.stun) { ctx.fillStyle = '#ffe14a'; ctx.fillRect(x - 14, y + 12, 1, 1); ctx.fillRect(x + 13, y + 12, 1, 1); }
  }
  function drawBeams(B, t) {
    for (const by of B.beams) {
      const y = Math.round(by);
      if (B.state === 'warn') {
        if (Math.floor(t * 12) % 2) { ctx.fillStyle = '#ff3b5c'; ctx.fillRect(T, y, W - 2 * T, 1); }
      } else if (B.state === 'beam') {
        ctx.fillStyle = 'rgba(255,60,90,0.55)'; ctx.fillRect(T, y - 16, W - 2 * T, 32);
        ctx.fillStyle = 'rgba(255,140,160,0.85)'; ctx.fillRect(T, y - 8, W - 2 * T, 16);
        ctx.fillStyle = '#fff4f6'; ctx.fillRect(T, y - 2 + (Math.floor(t * 30) % 2), W - 2 * T, 4);
      }
    }
  }
  /* Escombros que caen en el borde de arriba de la cámara del derrumbe. */
  function drawDebris(cam, t) {
    const top = Math.round(cam), h = CFG.CHASE_EDGE + 4;
    for (let x = 0; x < W; x += 2) {
      const n = Math.sin(x * 12.9898 + Math.floor(t * 6) * 0.7) * 43758.5453;
      const r = n - Math.floor(n);
      const hh = Math.round(h * (0.5 + r * 0.6));
      ctx.fillStyle = '#2a1d17'; ctx.fillRect(x, top, 2, hh);
      ctx.fillStyle = r > 0.6 ? '#8a7766' : '#5a4a3e'; ctx.fillRect(x, top + hh - 2, 2, 2);
    }
    if (Math.random() < 0.5) burst(Math.random() * W, top + h, 1, '#8a7766', 20, 0.6, 300);
  }

  function drawFlip(im, x, y, flip) {
    if (!flip) { ctx.drawImage(im, Math.round(x - im.width / 2), Math.round(y)); return; }
    ctx.save();
    ctx.translate(Math.round(x), 0);
    ctx.scale(-1, 1);
    ctx.drawImage(im, Math.round(-im.width / 2), Math.round(y));
    ctx.restore();
  }

  /* Posición en pantalla (px CSS) de una x del mundo: el ratón dirige hacia ahí. */
  R.screenX = (x) => {
    const rect = cv.getBoundingClientRect();
    return rect.left + (x / W) * rect.width;
  };

  R.resize();
  addEventListener('resize', R.resize);
  return R;
}
