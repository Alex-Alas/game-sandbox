/* Visor de bloques (?ver=bloques): todos los BLOCKS dibujados con el render real, con sus
   etiquetas, costo, aptitud para el derrumbe y el resultado de los asserts. Vite recarga al
   editar blocks.js, así que se diseña ASCII sin jugar. Clic en un bloque: se juega solo
   (INICIO + ese bloque + FIN) con un bot. */
import { CFG } from './config.js';
import { BLOCKS, BLOCK_ERRORS, buildLevel } from './level.js';
import { BLOCK_META, FIXED } from './content.js';
import { paintLevel } from './render.js';
import { CODE, creatureFrames } from './sprites.js';

const T = CFG.TILE;

function blockCanvas(id) {
  const lv = buildLevel({ seed: 1, n: 2, chunks: [id] }, false);
  lv.finY = id === 'fin' ? lv.finY : -999; // la puerta solo en el FIN
  const c = paintLevel(lv);
  const g = c.getContext('2d');
  const draw = (im, x, y) => g.drawImage(im, Math.round(x - im.width / 2), Math.round(y - im.height / 2));
  lv.tiles.forEach((t, i) => { if (t === 4) g.drawImage(CODE.crumble, (i % lv.w) * T, ((i / lv.w) | 0) * T); });
  g.fillStyle = '#ff3b5c';
  for (const i of lv.gate) g.fillRect((i % lv.w) * T, ((i / lv.w) | 0) * T + 7, T, 2);
  g.fillStyle = '#7fb6ff';
  for (const i of lv.exit) g.fillRect((i % lv.w) * T, ((i / lv.w) | 0) * T + 7, T, 2);
  for (const tc of lv.torches) draw(CODE.torch[0], tc.x, tc.y);
  for (const gm of lv.gems) if (!gm.boss) draw(gm.big ? CODE.bigGem[0] : CODE.gem[0], gm.x, gm.y);
  for (const cr of lv.creatures) {
    if (cr.dormant) continue;
    if (cr.kind === 'cube') draw(CODE.cube[0], cr.x, cr.y);
    else if (cr.kind === 'fairy') draw(CODE.fairy[0], cr.x, cr.y);
    else draw(creatureFrames(cr.kind).idle[0], cr.x, cr.y - 2);
  }
  if (lv.bossAt) draw(CODE.ojoBall, lv.bossAt.x, lv.bossAt.y);
  return c;
}

export function showBlockViewer() {
  const root = document.createElement('div');
  root.className = 'screen';
  root.style.cssText = 'position:fixed;inset:0;overflow:auto;touch-action:pan-y;display:block;padding:12px;background:#0b0709;text-align:left;z-index:50';
  const head = document.createElement('div');
  head.style.cssText = 'margin-bottom:10px;font-size:13px';
  head.innerHTML = `<b>Bloques</b> (${Object.keys(BLOCKS).length}) · clic para jugar uno solo con un bot · `
    + (BLOCK_ERRORS.length ? `<span style="color:#ff5a7a">${BLOCK_ERRORS.length} asserts fallan</span>` : '<span style="color:#9ff2c0">asserts en orden</span>');
  root.appendChild(head);
  if (BLOCK_ERRORS.length) {
    const ul = document.createElement('ul');
    ul.style.cssText = 'color:#ff5a7a;font-size:12px;margin:0 0 10px 18px';
    for (const e of BLOCK_ERRORS) { const li = document.createElement('li'); li.textContent = e; ul.appendChild(li); }
    root.appendChild(ul);
  }
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px';
  for (const id of Object.keys(BLOCKS)) {
    const m = BLOCK_META[id];
    const card = document.createElement('div');
    card.style.cssText = 'width:200px;cursor:pointer;font-size:11px;line-height:1.4;color:#b49c80';
    const cv = blockCanvas(id);
    cv.style.cssText = 'width:192px;height:192px;image-rendering:pixelated;border:2px solid ' + (m.chase ? '#ffd23f' : '#3a2a20');
    card.appendChild(cv);
    const info = document.createElement('div');
    const bad = BLOCK_ERRORS.some((e) => e.startsWith(`bloque ${id}:`));
    info.innerHTML = `<b style="color:${bad ? '#ff5a7a' : '#f4e6cf'}">${id}</b> · costo ${m.cost}${m.chase ? ' · <span style="color:#ffd23f">derrumbe</span>' : ''}`
      + `<br>${m.tags.join(', ') || '—'}${m.minCycle ? ` · ciclo ≥ ${m.minCycle}` : ''}${m.intro ? ` · presenta ${m.intro}` : ''}${FIXED.has(id) ? ' · fijo' : ''}`;
    card.appendChild(info);
    if (!FIXED.has(id) || id.startsWith('antesala')) card.onclick = () => { location.href = `${location.pathname}?solo=1&bots=1&bloque=${id}`; };
    grid.appendChild(card);
  }
  root.appendChild(grid);
  document.body.appendChild(root);
}
