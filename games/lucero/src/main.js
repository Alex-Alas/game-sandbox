// LUCERO — flujo del juego: mapa de niveles → ventana del nivel (metas, potenciadores, racha) →
// partida (entrada, resolución por fases, lluvia final) → victoria/derrota → mapa con recompensas.
// Alrededor: vidas, cielo de constelaciones, calendario diario, misiones, cofres y tienda.
// `window.__lucero` para depurar (ver al final).
import { createBoard, step, trySwap, tapSpecial, canSwap, movable, useHammer, useRow, useShuffle, placeSpecial, setSpecial, bonusConvert, fireAll, goalsDone, listMoves } from './board.js';
import { bestMove } from './bot.js';
import { makeLevel, teachSeed, tierOf, TIERS, GEN_V } from './levels.js';
import { CAL, CAL_V } from './cal.js';
import { createRenderer, paintIcon } from './render.js';
import { createAudio } from './audio.js';
import * as M from './meta.js';
import { constellation } from './sky.js';
import { S, ANIM, isPower, hash } from './const.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const R = createRenderer(canvas);
const A = createAudio();
const save = M.load();
for (const k of ['music', 'sfx', 'voice']) A.opt[k] = save.settings[k];

const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('es');
const hhmm = (ms) => { const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60; return h ? `${h} h ${m} min` : `${m} min`; };
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor(s / 60) % 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const buzz = (p) => { if (save.settings.vib && navigator.vibrate) try { navigator.vibrate(p); } catch { /* */ } };
const ic = (id, cls = '') => `<svg class="ic ${cls}"><use href="#i-${id}"/></svg>`;
const PRE_ICON = { comet: { s: S.H, c: 4 }, nova: { s: S.NOVA, c: 0 }, star: { s: S.STAR, c: -1 } };
const SP_ICON = { [S.H]: PRE_ICON.comet, [S.NOVA]: PRE_ICON.nova, [S.STAR]: PRE_ICON.star };
const bIcon = (id) => (M.booster(id).pre ? `<canvas data-pc="${id}"></canvas>` : `<svg><use href="#i-${id}"/></svg>`);
const REGIONS = ['Valle de las Luciérnagas', 'Mar de Nubes', 'Bosque Lunar', 'Cumbres de Cristal', 'Desierto de Ámbar', 'Jardín de Auroras', 'Abismo Estelar', 'Corona del Cielo'];
const regionName = (r) => REGIONS[r % REGIONS.length] + (r >= REGIONS.length ? ` ${'I'.repeat(1 + Math.floor(r / REGIONS.length))}` : '');
const INTRO_TXT = {
  fog: ['NIEBLA', 'Hacé combinaciones encima para disiparla. ¡Las explosiones también sirven!'],
  rock: ['ROCA LUNAR', 'Combiná justo al lado o alcanzala con un especial. Algunas tienen varias capas.'],
  frost: ['ESCARCHA', 'La gema congelada no se mueve: incluila en una combinación para derretirla.'],
  drop: ['ESTRELLA FUGAZ', 'Hacé lugar debajo para que caiga: sale por las flechas de abajo de todo.'],
};
const TEACH_TXT = {
  match: 'Deslizá una gema hacia un costado para alinear <b>3 iguales</b>',
  [S.H]: 'Alineá <b>4</b> para crear una <b>COMETA</b>: barre toda su línea',
  [S.FLY]: 'Juntá <b>4 en cuadrado</b> para crear una <b>LUCIÉRNAGA</b>: vuela adonde más falta hace',
  [S.NOVA]: 'Hacé una <b>L</b> o una <b>T</b> para crear una <b>NOVA</b>: explota todo alrededor',
  combo: '¡Intercambiá dos <b>especiales</b> entre sí para combinar sus poderes!',
  [S.STAR]: 'Alineá <b>5</b> para crear un <b>LUCERO</b>: intercambialo con una gema y borra todas las de su color',
};
const SPECIAL_TIP = {
  [S.H]: '¡COMETA! Movela o <b>tocala</b> para barrer su línea',
  [S.NOVA]: '¡NOVA! Movela o <b>tocala</b>: explota todo alrededor',
  [S.FLY]: '¡LUCIÉRNAGA! Al usarla vuela sola hacia lo que más falta',
  [S.STAR]: '¡LUCERO! <b>Intercambialo</b> con una gema: borra todas las de ese color',
};
const PRAISE = [[11, '¡Celestial!'], [8, '¡Estelar!'], [6, '¡Divino!'], [5, '¡Brillante!'], [4, '¡Genial!'], [3, '¡Bien!']];
const COMBO_NAME = { cross: '¡CRUZ!', big: '¡TORMENTA!', nova2: '¡MEGANOVA!', fly3: '¡ENJAMBRE!', flyCarry: '¡ENVÍO ESPECIAL!', starSpecial: '¡LLUVIA DE LUZ!', starStar: '¡SUPERNOVA!' };

let scr = 'map';      // map | play | sky
let ph = 'none';      // en partida: intro | idle | resolve | bonus | bfire | end
let B = null, cur = null, clock = 0, last = performance.now(), speed = 1, autoplay = false;

// ── calibración de niveles (tabla precalculada, caché local o un worker) ──
const calMem = new Map(), calWait = new Map();
let worker = null;
function calFor(n) {
  if (CAL_V === GEN_V && CAL[n - 1]) return Promise.resolve(CAL[n - 1]);
  if (calMem.has(n)) return Promise.resolve(calMem.get(n));
  const key = `lucero.cal.${GEN_V}.${n}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c) { calMem.set(n, c); return Promise.resolve(c); } } catch { /* */ }
  if (calWait.has(n)) return calWait.get(n).p;
  let res;
  const p = new Promise((r) => { res = r; });
  calWait.set(n, { p, res });
  if (!worker) {
    worker = new Worker(new URL('./calworker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { n: k, cal } = e.data;
      calMem.set(k, cal);
      try { localStorage.setItem(`lucero.cal.${GEN_V}.${k}`, JSON.stringify(cal)); } catch { /* */ }
      calWait.get(k)?.res(cal); calWait.delete(k);
    };
  }
  worker.postMessage(n);
  return p;
}
const levelOf = async (n) => makeLevel(n, await calFor(n));

// ── pantallas y modales ──
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  document.body.classList.toggle('playing', id === 'play');
}
const modalQ = [];
let modalOn = false, modalClose = null;
const modalOpen = () => modalOn;
function modal(html, mount, onClose) {
  const m = $('modal'), box = $('mbox');
  box.innerHTML = html;
  m.classList.remove('hidden'); modalOn = true; modalClose = onClose || null;
  box.scrollTop = 0;
  box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
  paintCanvases(box);
  box.querySelector('[data-x]')?.addEventListener('click', () => { A.fx('click'); closeModal(); });
  mount?.(box);
}
function closeModal() {
  if (!modalOn) return;
  $('modal').classList.add('hidden'); modalOn = false;
  const f = modalClose; modalClose = null;
  f?.();
  if (!modalOn && modalQ.length) modalQ.shift()();
}
const queueModal = (fn) => { if (modalOn) modalQ.push(fn); else fn(); };
const X = '<button class="x" data-x aria-label="Cerrar"><svg><use href="#i-close"/></svg></button>';
function paintCanvases(root) {
  for (const cv of root.querySelectorAll('canvas[data-pc]')) paintIcon(cv, PRE_ICON[cv.dataset.pc]);
  for (const cv of root.querySelectorAll('canvas[data-goal]')) paintIcon(cv, JSON.parse(cv.dataset.goal));
}
function toast(html, cls = '') {
  const d = document.createElement('div');
  d.className = `toast ${cls}`; d.innerHTML = html;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 3100);
}
const goalHtml = (g, n) => `<div class="goal"><canvas data-goal='${JSON.stringify({ t: g.t, c: g.c })}'></canvas><b><span>${fmt(n)}</span></b></div>`;

// ── mapa ──
const NODE_DY = 104, REGION_EVERY = 20, REGION_GAP = 90, PAD_B = 300, PAD_T = 150;
const nodeX = (n) => 50 + 27 * Math.sin(n * 0.85) * (n % 2 ? 1 : 0.92);
let mapH = 0, mapLast = 0;
const nodeY = (n) => mapH - (PAD_B + (n - 1) * NODE_DY + Math.floor((n - 1) / REGION_EVERY) * REGION_GAP);
const AVATAR = '<svg class="avatar" id="m-avatar" viewBox="0 0 64 64"><defs><radialGradient id="ga" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fffbe0"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9d2e"/></radialGradient></defs><path d="M32 4l8.2 17.2 18.8 2.1-14 12.8 3.9 18.6L32 45.2 15.1 54.7 19 36.1 5 23.3l18.8-2.1z" fill="url(#ga)" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><circle cx="26" cy="31" r="3.2" fill="#3a1d5c"/><circle cx="38" cy="31" r="3.2" fill="#3a1d5c"/><circle cx="27" cy="30" r="1.1" fill="#fff"/><circle cx="39" cy="30" r="1.1" fill="#fff"/><path d="M27.5 37.5q4.5 4 9 0" stroke="#3a1d5c" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="21" cy="36" r="2.6" fill="#ff8fb0" opacity=".75"/><circle cx="43" cy="36" r="2.6" fill="#ff8fb0" opacity=".75"/></svg>';

function buildMap() {
  const top = Math.max(save.level + 18, 30);
  mapLast = top;
  const regions = Math.floor((top - 1) / REGION_EVERY);
  mapH = PAD_B + (top - 1) * NODE_DY + regions * REGION_GAP + PAD_T;
  const path = $('m-path');
  path.style.height = `${mapH}px`;
  // camino: curva suave por los nodos; hecho en dorado, por hacer punteado
  const pts = [];
  for (let n = 1; n <= top; n++) pts.push([nodeX(n), nodeY(n)]);
  const curve = (a) => {
    let d = `M${a[0][0]},${a[0][1]}`;
    for (let k = 1; k < a.length; k++) {
      const p0 = a[Math.max(0, k - 2)], p1 = a[k - 1], p2 = a[k], p3 = a[Math.min(a.length - 1, k + 1)];
      d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
    }
    return d;
  };
  const done = pts.slice(0, Math.max(1, save.level)), todo = pts.slice(Math.max(0, save.level - 1));
  let html = `<svg class="trail" viewBox="0 0 100 ${mapH}" preserveAspectRatio="none">
    <path d="${curve(todo)}" fill="none" stroke="rgba(190,170,255,.35)" stroke-width="7" stroke-dasharray="2 12" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    ${done.length > 1 ? `<path d="${curve(done)}" fill="none" stroke="rgba(255,210,63,.35)" stroke-width="16" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="${curve(done)}" fill="none" stroke="#ffe27a" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : ''}
  </svg>`;
  for (let r = 0; r <= regions; r++) {
    const n0 = r * REGION_EVERY + 1;
    html += `<div class="region" style="top:${nodeY(n0) + 70}px">REGIÓN ${r + 1}<b>${regionName(r)}</b></div>`;
  }
  for (let n = 1; n <= top; n++) {
    const tier = TIERS[tierOfN(n)], st = save.stars[n] || 0;
    const cls = n < save.level ? 'done' : n === save.level ? 'cur' : 'locked';
    const tcls = tierOfN(n) === 1 ? 'hard' : tierOfN(n) === 2 ? 'super' : '';
    const stars = n < save.level ? `<span class="st">${[1, 2, 3].map((k) => ic('star', k <= st ? '' : 'off')).join('')}</span>` : '';
    const tag = tier.name && n >= save.level ? `<span class="tag">${tier.name}</span>` : '';
    html += `<button class="node ${cls} ${tcls}" data-n="${n}" style="left:${nodeX(n)}%;top:${nodeY(n)}px">${n}${stars}${tag}</button>`;
    if (n % 10 === 0) {
      const side = nodeX(n) > 50 ? -1 : 1;
      html += `<div class="mapgift ${save.level > n ? 'got' : save.level > n - 10 ? 'next' : ''}" style="left:calc(${nodeX(n)}% + ${side * 62}px);top:${nodeY(n)}px">${ic('chest')}</div>`;
    }
    const b = M.BOOSTERS.find((x) => x.unlock === n);
    if (b) {
      const side = nodeX(n) > 50 ? -1 : 1;
      html += `<div class="mapunlock ${save.level >= n ? '' : 'locked'}" title="${b.name}" style="left:calc(${nodeX(n)}% + ${side * 60}px);top:${nodeY(n) - 26}px">${bIcon(b.id)}</div>`;
    }
  }
  html += AVATAR;
  path.innerHTML = html;
  paintCanvases(path);
  placeAvatar(save.level);
}
const tierOfN = (n) => (tierOf(n) === 3 ? 0 : tierOf(n));
function placeAvatar(n, instant = true) {
  const a = $('m-avatar'); if (!a) return;
  if (instant) a.style.transition = 'none';
  a.style.left = `${nodeX(n)}%`; a.style.top = `${nodeY(n)}px`;
  if (instant) { void a.offsetWidth; a.style.transition = ''; }
}
function scrollMapTo(n, smooth = false) {
  const sc = $('m-scroll');
  sc.scrollTo({ top: nodeY(n) - sc.clientHeight * 0.58, behavior: smooth ? 'smooth' : 'instant' });
}
$('m-path').addEventListener('click', (e) => {
  const b = e.target.closest('.node'); if (!b) return;
  A.init();
  const n = +b.dataset.n;
  if (n > save.level) { A.fx('bad'); toast(`${ic('lock')} Primero superá el nivel <b>${save.level}</b>`); return; }
  A.fx('click'); openLevel(n);
});

function refreshTop() {
  const now = Date.now(), inf = M.infinite(save, now), lv = M.lives(save, now);
  $('m-lives-n').textContent = inf ? '∞' : lv;
  $('m-lives-t').textContent = inf ? mmss(save.infUntil - now) : lv >= M.LIVES_MAX ? 'LLENAS' : mmss(M.nextLifeIn(save, now));
  $('m-lives').classList.toggle('inf', inf);
  setNum($('m-coins-n'), save.coins);
  setNum($('m-stars-n'), M.starsAvail(save));
}
function setNum(el, v) {
  const t = fmt(v);
  if (el.textContent === t) return;
  el.textContent = t;
  const p = el.closest('.pill'); if (p) { p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
}
function refreshMap() {
  refreshTop();
  $('b-daily').classList.toggle('on', M.dailyReady(save));
  $('b-quests').classList.toggle('hidden', save.level < M.FEATURES.quests);
  $('b-quests').classList.toggle('on', M.questsClaimable(save));
  $('b-sky').classList.toggle('hidden', save.level < M.FEATURES.sky);
  $('b-sky').classList.toggle('on', M.skyAffordable(save));
  $('m-stars').classList.toggle('hidden', save.level < M.FEATURES.sky);
  const nc = save.chests.length;
  $('b-chests').classList.toggle('on', nc > 0);
  $('b-chests').querySelector('.dot').textContent = nc > 1 ? nc : '';
  const sc = $('m-starchest');
  sc.querySelector('i').style.width = `${(save.chestStars / M.STAR_CHEST) * 100}%`;
  sc.querySelector('span').textContent = `${save.chestStars} / ${M.STAR_CHEST} ★ → cofre`;
  $('b-play-t').textContent = `NIVEL ${save.level}`;
}

function toMap(o = {}) {
  scr = 'map'; ph = 'none'; B = null; cur = null; R.clear();
  show('map'); A.mode('map');
  buildMap(); refreshMap();
  if (o.advanced) {
    placeAvatar(o.advanced - 1);
    scrollMapTo(o.advanced - 1);
    setTimeout(() => { placeAvatar(o.advanced, false); scrollMapTo(o.advanced, true); A.fx('unlock'); }, 450);
  } else scrollMapTo(save.level);
  for (const b of o.unlocks || []) queueModal(() => unlockModal(b));
  for (let k = 0; k < (o.chests || 0); k++) queueModal(() => chestModal());
  if (o.advanced && save.level >= M.FEATURES.sky && !save.seen.skyTip && M.skyAffordable(save)) {
    queueModal(() => { save.seen.skyTip = true; M.persist(save); skyTipModal(); });
  }
  if (o.advanced) queueModal(() => setTimeout(() => { if (scr === 'map' && !modalOn) openLevel(save.level); }, 700));
}

// ── ventana del nivel ──
let pre = new Set();
async function openLevel(n) {
  pre = new Set();
  modal(`${X}<h2>NIVEL ${n}</h2><div class="loading">Preparando el cielo…</div>`);
  const def = await levelOf(n);
  if (!modalOn || !$('mbox').querySelector('.loading')) return; // se cerró mientras tanto
  const tier = TIERS[def.tier];
  const best = save.stars[n] || 0;
  const goals = def.goals.map((g) => goalHtml(g, g.n)).join('');
  const intro = def.intro ? `<div class="intro"><canvas data-goal='${JSON.stringify({ t: def.intro })}'></canvas><div><b>NUEVO · ${INTRO_TXT[def.intro][0]}</b><span>${INTRO_TXT[def.intro][1]}</span></div></div>` : '';
  const pres = M.BOOSTERS.filter((b) => b.pre);
  const anyPre = pres.some((b) => save.level >= b.unlock);
  const preHtml = anyPre ? `<p>Potenciadores para empezar</p><div class="pres">${pres.map((b) => {
    const locked = save.level < b.unlock, k = save.boosters[b.id];
    return `<button class="pre ${locked ? 'locked' : ''}" data-pre="${b.id}" data-lv="NV ${b.unlock}" title="${b.name}: ${b.desc}">${locked ? ic('lock') : bIcon(b.id)}${locked ? '' : `<span class="n ${k ? '' : 'buy'}">${k || '+'}</span>`}</button>`;
  }).join('')}</div>` : '';
  const gifts = M.streakGifts(save);
  const streak = save.level >= M.FEATURES.streak ? `<div class="streakbox">${ic('fire')}<div><b>RACHA DE VICTORIAS ×${save.streak}</b><span>${save.streak ? 'Empezás con estos especiales gratis. ¡Si perdés, se apaga!' : 'Ganá seguido y empezá con especiales gratis'}</span></div>
    <div class="gifts">${M.STREAK_GIFTS.map((s, k) => `<canvas class="${k < gifts.length ? '' : 'off'}" data-goal='${JSON.stringify(SP_ICON[s])}'></canvas>`).join('')}</div></div>` : '';
  const livesTxt = M.infinite(save) ? `${ic('heart')} vidas infinitas` : `${ic('heart')} ${M.lives(save)} / ${M.LIVES_MAX}`;
  modal(`${X}<h2>NIVEL ${n}</h2>${tier.name ? `<div class="ribbon ${def.tier === 2 ? 'super' : ''}">${tier.name}</div>` : ''}
    ${best ? `<div class="row">${[1, 2, 3].map((k) => ic('star', k <= best ? '' : 'off')).join('')}</div>` : ''}
    <p>Metas</p><div class="goalsrow">${goals}</div>${intro}${preHtml}${streak}
    <button class="big green pulse" id="lv-go">¡JUGAR!</button><div class="livesline">${livesTxt}</div>`, (box) => {
    box.querySelectorAll('.st svg.off, .row svg.off').forEach((s) => { s.style.opacity = '.25'; });
    for (const b of box.querySelectorAll('[data-pre]')) {
      b.onclick = () => {
        const bo = M.booster(b.dataset.pre);
        if (save.level < bo.unlock) { toast(`${ic('lock')} Se desbloquea en el nivel <b>${bo.unlock}</b>`); return; }
        if (!save.boosters[bo.id] && !pre.has(bo.id)) {
          if (save.coins < bo.price) { toast(`Te faltan monedas: <b>${bo.name}</b> cuesta ${fmt(bo.price)}`); A.fx('bad'); return; }
          save.coins -= bo.price; save.boosters[bo.id]++; M.persist(save); A.fx('coin');
          toast(`${bo.name} comprado (−${fmt(bo.price)} ${ic('coin')})`);
          b.querySelector('.n').textContent = save.boosters[bo.id]; b.querySelector('.n').classList.remove('buy');
          refreshTop();
        }
        if (pre.has(bo.id)) pre.delete(bo.id); else pre.add(bo.id);
        b.classList.toggle('on', pre.has(bo.id)); A.fx('select');
      };
    }
    $('lv-go').onclick = () => { A.fx('click'); tryStart(def); };
  });
}

function tryStart(def) {
  if (!M.infinite(save) && M.lives(save) <= 0) { closeModal(); livesModal(); return; }
  closeModal();
  startLevel(def, [...pre]);
}

// ── partida ──
function slotRect() {
  const r = $('board-slot').getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
function startLevel(def, preSel) {
  A.init();
  if (!M.startLevel(save, def.n)) { livesModal(); return; }
  for (const id of preSel) { if (save.boosters[id] > 0) save.boosters[id]--; }
  M.persist(save);
  let seed = (Math.random() * 2 ** 31) | 0, teach = null;
  if (def.teach && !save.seen[`t${def.n}`]) {
    const t = def.teach === 'combo' ? { seed, move: null } : teachSeed(def);
    if (t) { seed = t.seed; teach = { kind: def.teach, move: t.move }; }
  }
  B = createBoard(def, seed);
  cur = {
    n: def.n, def, plus: 0, shown: def.goals.map((g) => g.n), score: 0, sel: -1, hint: null, idle: 0, booster: null, fast: false,
    intro: [...M.streakGifts(save), ...preSel.map((id) => M.booster(id).pre)], introT: 0, teach, bt: 0, rounds: 0, chainSaid: 0, tipT: 0,
  };
  scr = 'play'; ph = 'intro';
  show('play'); A.mode('play');
  $('h-level').textContent = def.n;
  buildHud();
  R.setBoard(B, slotRect());
  updateHud(true);
  if (def.intro && !save.seen[`i${def.intro}`]) tip(`<b>${INTRO_TXT[def.intro][0]}:</b> ${INTRO_TXT[def.intro][1]}`, 6);
}

function buildHud() {
  $('h-goals').innerHTML = B.goals.map((g, k) => `<div class="goal" data-g="${k}"><canvas data-goal='${JSON.stringify({ t: g.t, c: g.c })}'></canvas><b><span>${g.n}</span></b></div>`).join('');
  paintCanvases($('h-goals'));
  const s3 = cur.def.stars[2];
  $('h-t2').style.left = `${(cur.def.stars[1] / s3) * 100}%`;
  $('h-t3').style.left = '100%';
  refreshTools();
}
function refreshTools() {
  for (const b of document.querySelectorAll('.bst')) {
    const bo = M.booster(b.dataset.b), locked = save.level < bo.unlock, k = save.boosters[bo.id];
    b.classList.toggle('locked', locked);
    b.classList.toggle('on', cur?.booster === bo.id);
    const n = b.querySelector('.n');
    n.textContent = locked ? '' : k || '+';
    n.classList.toggle('buy', !k);
    n.classList.toggle('hidden', locked);
  }
}
function updateHud(force = false) {
  if (!B) return;
  const left = Math.max(0, B.moves - B.used), el = $('h-moves');
  if (el.textContent !== String(left) || force) {
    el.textContent = left;
    const box = el.parentElement;
    box.classList.toggle('low', left <= 5 && ph !== 'bonus' && ph !== 'bfire');
    box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
  }
}
function goalArrive(g) {
  if (!cur || !B) return;
  cur.shown[g] = Math.max(0, cur.shown[g] - 1);
  const el = $('h-goals').querySelector(`[data-g="${g}"]`);
  if (!el) return;
  el.querySelector('span').textContent = cur.shown[g];
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  if (cur.shown[g] === 0 && !el.classList.contains('done')) { el.classList.add('done'); A.fx('goaldone'); buzz(20); }
  else A.fx('goal');
}
R.onGoal = goalArrive;
R.goalPos = (g) => {
  const el = $('h-goals').querySelector(`[data-g="${g}"] canvas`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
R.onFx = (k, e) => {
  if (k === 'beam') { A.fx('beam'); buzz(10); }
  else if (k === 'nova') { A.fx('boom'); buzz(25); }
  else if (k === 'rays') A.fx('rays');
  else if (k === 'fly') A.fx('fly');
  else if (k === 'combo') { A.fx('combo'); R.praise(COMBO_NAME[e.combo] || '¡COMBO!', '#9ff0ff', 1.1); }
  else if (k === 'supernova') { A.fx('supernova'); buzz([40, 30, 80]); }
  else if (k === 'dropout') A.fx('drop');
};
R.onLayer = (e) => A.fx(e.k === 'fog' ? 'fog' : e.k === 'frost' ? 'ice' : 'rock');
R.onSpecial = (e) => {
  if (scr !== 'play' || ph === 'bonus' || ph === 'bfire') return;
  const key = `s${e.s === S.V ? S.H : e.s}`;
  if (!save.seen[key]) { save.seen[key] = true; M.persist(save); if (!cur.teach || cur.teach.kind !== e.s) tip(SPECIAL_TIP[e.s === S.V ? S.H : e.s], 4.5); }
};

let tipTimer = 0;
function tip(html, sec = 0) {
  const t = $('tip');
  t.innerHTML = html; t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(tipTimer);
  if (sec) tipTimer = setTimeout(() => t.classList.add('hidden'), sec * 1000);
}
const hideTip = () => { clearTimeout(tipTimer); $('tip').classList.add('hidden'); };

// Entrada: arrastrar una gema hacia una vecina, o tocar una y después la de al lado; tocar un especial lo dispara
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  A.init();
  if (scr !== 'play' || modalOn) return;
  if (ph === 'bonus' || ph === 'bfire') { cur.fast = true; return; }
  if (ph !== 'idle') return;
  const i = R.cellAt(e.clientX, e.clientY);
  if (i < 0) { cur.sel = -1; return; }
  if (cur.booster) { useBoosterAt(i); return; }
  drag = { i, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.moved || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, thr = R.L.cs * 0.3;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < thr) return;
  drag.moved = true;
  const x = drag.i % B.W, y = (drag.i / B.W) | 0;
  let j = -1;
  if (Math.abs(dx) > Math.abs(dy)) { const nx = x + Math.sign(dx); if (nx >= 0 && nx < B.W) j = drag.i + Math.sign(dx); }
  else { const ny = y + Math.sign(dy); if (ny >= 0 && ny < B.H) j = drag.i + Math.sign(dy) * B.W; }
  if (j >= 0 && B.mask[j]) attemptSwap(drag.i, j);
});
const lift = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  if (!d.moved && ph === 'idle') tapCell(d.i);
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', () => { drag = null; });

const adjacent = (a, b) => (Math.abs(a - b) === 1 && ((a / B.W) | 0) === ((b / B.W) | 0)) || Math.abs(a - b) === B.W;
function tapCell(i) {
  if (cur.sel >= 0 && cur.sel !== i && adjacent(cur.sel, i)) { const a = cur.sel; cur.sel = -1; attemptSwap(a, i); return; }
  const q = B.p[i];
  if (q && isPower(q.s) && movable(B, i)) { cur.sel = -1; if (tapSpecial(B, i)) beginMove(); return; }
  cur.sel = cur.sel === i || !movable(B, i) ? -1 : i;
  if (cur.sel >= 0) A.fx('select');
}
function attemptSwap(a, b) {
  cur.sel = -1;
  if (!canSwap(B, a, b)) { A.fx('bad'); return; }
  if (cur.teach?.move && cur.teach.move.b >= 0) {
    const m = cur.teach.move;
    if (!((m.a === a && m.b === b) || (m.a === b && m.b === a))) { A.fx('bad'); R.badSwap(a, b); tip(TEACH_TXT[cur.teach.kind] + '<br><small>Probá con las que brillan</small>', 4); return; }
  }
  if (trySwap(B, a, b)) beginMove();
  else { R.badSwap(a, b); A.fx('bad'); buzz(12); }
}
function beginMove() {
  R.apply(B.ev);
  A.fx('swap');
  ph = 'resolve'; cur.hint = null; cur.idle = 0; cur.chainSaid = 0;
  if (cur.teach) { save.seen[`t${cur.n}`] = true; M.persist(save); cur.teach = null; hideTip(); }
  updateHud();
}

function onPhase(ev) {
  let pops = 0;
  for (const e of ev) {
    if (e.k === 'pop' && e.t === 0) pops++;
    else if (e.k === 'make') A.fx('make');
    else if (e.k === 'shuffle') A.fx('shuffle');
    else if (e.k === 'chain' && ph === 'resolve') {
      const p = PRAISE.find(([n]) => e.n >= n);
      if (p && e.n > cur.chainSaid && PRAISE.some(([n]) => n === e.n)) {
        cur.chainSaid = e.n;
        R.praise(p[1]);
        if (e.n >= 4) A.say(p[1].replace(/[¡!]/g, ''));
        buzz(15);
      }
    }
  }
  const chain = ev.find((e) => e.k === 'chain');
  if (pops && chain) A.pop(chain.n, pops);
}

// Avanza la partida (lo llama el bucle; `advance` lo usa sin rAF)
function playTick(dt) {
  if (!B) return;
  cur.score += (B.score - cur.score) * Math.min(1, dt * 7);
  if (Math.abs(B.score - cur.score) < 1) cur.score = B.score;
  const s3 = cur.def.stars[2];
  $('h-score').textContent = fmt(cur.score);
  $('h-sbar').style.width = `${Math.min(100, (cur.score / s3) * 100)}%`;
  $('h-t2').classList.toggle('on', cur.score >= cur.def.stars[1]);
  $('h-t3').classList.toggle('on', cur.score >= s3);
  if (ph === 'intro') {
    if (R.busy()) return;
    cur.introT -= dt;
    if (cur.introT > 0) return;
    if (cur.intro.length) {
      const s = cur.intro.shift();
      B.ev = [];
      const i = placeSpecial(B, s);
      if (i >= 0) {
        R.apply(B.ev); A.fx('make');
        const r = $('h-moves').getBoundingClientRect();
        R.streak(r.left + r.width / 2, r.bottom, i, '#ffe27a', 0.3);
      }
      cur.introT = 0.28;
      return;
    }
    if (cur.teach?.kind === 'combo') {
      // dos especiales juntos cerca del centro para enseñar a combinarlos
      const c = Math.floor(B.H / 2) * B.W + Math.floor(B.W / 2) - 1;
      for (const a of [c, c + B.W, c - B.W, c + 1]) {
        if (movable(B, a) && movable(B, a + 1) && B.p[a].s === S.NONE && B.p[a + 1].s === S.NONE && (a % B.W) < B.W - 1) {
          B.ev = []; setSpecial(B, a, S.H); setSpecial(B, a + 1, S.NOVA); R.apply(B.ev);
          cur.teach.move = { a, b: a + 1 }; break;
        }
      }
    }
    ph = 'idle';
    if (cur.teach) { tip(TEACH_TXT[cur.teach.kind], 7); cur.hint = cur.teach.move; }
    return;
  }
  if (ph === 'idle') {
    cur.idle += dt;
    if (autoplay && cur.idle > 0.25 && !R.busy()) {
      const m = cur.teach?.move || bestMove(B, { rng: (Math.random() * 1e9) | 0 });
      if (m) { if (m.b < 0) { if (tapSpecial(B, m.a)) beginMove(); } else attemptSwap(m.a, m.b); }
      return;
    }
    if (!cur.hint && !cur.booster && cur.idle > (cur.n <= 3 ? 3 : ANIM.hintAfter)) cur.hint = bestMove(B, { rng: 7 });
    return;
  }
  if (ph === 'resolve' || ph === 'bfire') {
    if (R.busy()) return;
    if (B.need) { const ev = step(B); if (ev) { R.apply(ev); onPhase(ev); } return; }
    afterMove();
    return;
  }
  if (ph === 'bonus') {
    cur.bt -= dt;
    if (cur.bt > 0 || R.busy()) return;
    B.ev = [];
    const i = bonusConvert(B);
    if (i >= 0) {
      R.apply(B.ev); A.fx('tick');
      const r = $('h-moves').getBoundingClientRect();
      R.streak(r.left + r.width / 2, r.top + r.height / 2, i, '#fff6a8', 0.28);
      updateHud();
      cur.bt = 0.11;
      return;
    }
    if (fireAll(B)) { ph = 'bfire'; return; }
    finishWin();
  }
}

function afterMove() {
  updateHud();
  if (ph === 'bfire') {
    if (++cur.rounds < 15 && fireAll(B)) return;
    finishWin();
    return;
  }
  if (goalsDone(B)) {
    ph = 'bonus'; cur.bt = 1.3; cur.sel = -1; cur.booster = null; refreshTools(); hideTip();
    R.praise('¡NIVEL SUPERADO!', '#a8ffcf', 1.05);
    A.say('¡Nivel superado!'); A.fx('goaldone'); buzz([30, 40, 60]);
    if (B.moves > B.used) setTimeout(() => { if (ph === 'bonus') R.praise('¡LLUVIA DE ESTRELLAS!', '#ffe27a', 0.9); }, 900);
    return;
  }
  if (B.used >= B.moves) { ph = 'end'; hideTip(); setTimeout(outOfMoves, 500); return; }
  ph = 'idle'; cur.idle = 0;
}

// ── fin de nivel ──
function finishWin() {
  ph = 'end';
  const def = cur.def, n = def.n;
  save.seen[`t${n}`] = true;
  if (def.intro) save.seen[`i${def.intro}`] = true;
  M.runStats(save, B.stats);
  const res = M.winLevel(save, def, B.score);
  A.fx('win'); buzz([30, 50, 30, 50, 90]);
  const sc = `${fmt(B.score)}`;
  const chestPct = (save.chestStars / M.STAR_CHEST) * 100;
  const gifts = M.streakGifts(save);
  modal(`<div class="rays"></div><h2 class="gold">¡NIVEL ${n} SUPERADO!</h2>
    <div class="bigstars">${[1, 2, 3].map(() => ic('star')).join('')}</div>
    <div class="scoreline"><small>PUNTOS</small>${sc}</div>${res.record && res.prev ? '<div class="badge">★ NUEVO RÉCORD ★</div>' : ''}
    <div class="rewards"><div class="rw">${ic('coin')}+<span id="w-coins">0</span></div>${res.newStars ? `<div class="rw" style="animation-delay:.2s">${ic('star')}+${res.newStars}</div>` : ''}</div>
    ${save.level >= M.FEATURES.streak ? `<div class="streakbox">${ic('fire')}<div><b>RACHA ×${save.streak}</b><span>${gifts.length >= 3 ? '¡Al máximo! Empezás con 3 especiales' : 'El próximo nivel empezás con más especiales'}</span></div><div class="gifts">${M.STREAK_GIFTS.map((s, k) => `<canvas class="${k < gifts.length ? '' : 'off'}" data-goal='${JSON.stringify(SP_ICON[s])}'></canvas>`).join('')}</div></div>` : ''}
    <div class="chestprog">${ic('chest')}<div class="bar"><i style="width:${res.chests.includes('star') ? 100 : Math.max(0, chestPct - (res.newStars / M.STAR_CHEST) * 100)}%"></i><span>${res.chests.includes('star') ? '¡COFRE DE ESTRELLAS!' : `${save.chestStars} / ${M.STAR_CHEST} ★`}</span></div></div>
    ${res.unlocks.map((b) => `<div class="intro">${bIcon(b.id)}<div><b>¡NUEVO POTENCIADOR!</b><span>${b.name}: ${b.desc}. Tenés 3 gratis.</span></div></div>`).join('')}
    <button class="big gold" id="w-go">CONTINUAR</button>`, (box) => {
    const st = box.querySelectorAll('.bigstars svg');
    for (let k = 0; k < res.stars; k++) setTimeout(() => { st[k].classList.add('on'); A.fx(`star${k + 1}`); buzz(20); }, 500 + k * 420);
    setTimeout(() => { const i = box.querySelector('.chestprog i'); if (i && !res.chests.includes('star')) i.style.width = `${chestPct}%`; }, 900);
    countUp($('w-coins'), res.coins, 0.9);
    $('w-go').onclick = () => { A.fx('click'); closeModal(); };
  }, () => toMap({ advanced: res.first ? n + 1 : 0, unlocks: [], chests: res.chests.length }));
}

function outOfMoves() {
  if (!B || ph !== 'end') return;
  const cost = M.plusCost(cur.plus);
  const left = B.goals.map((g, k) => [g, k]).filter(([g]) => g.got < g.n);
  const can = save.coins >= cost;
  A.fx('warn');
  const need = left.reduce((a, [g]) => a + (g.n - g.got) / g.n, 0) / B.goals.length;
  modal(`<h2>¡Sin movimientos!</h2><p>${need <= 0.2 ? '¡Estuviste cerca! Te falta muy poco:' : 'Todavía te falta:'}</p>
    <div class="goalsrow">${left.map(([g]) => goalHtml(g, g.n - g.got)).join('')}</div>
    <button class="big green pulse" id="o-plus" ${can ? '' : 'disabled'}>+${M.PLUS_MOVES} MOVIMIENTOS<small>${ic('coin')} ${fmt(cost)}${can ? '' : ' · te faltan monedas'}</small></button>
    ${save.streak && save.level >= M.FEATURES.streak ? `<div class="streakbox">${ic('fire')}<div><b>¡Tu racha ×${save.streak} se apaga!</b><span>Si te rendís perdés los especiales gratis</span></div></div>` : ''}
    <button class="btn2" id="o-quit">Rendirse</button>`, () => {
    $('o-plus').onclick = () => {
      if (save.coins < cost) return;
      save.coins -= cost; M.persist(save);
      B.moves += M.PLUS_MOVES; cur.plus++;
      A.fx('coin'); closeModal();
      ph = 'idle'; cur.idle = 0; updateHud(true);
      R.praise(`+${M.PLUS_MOVES}`, '#a8ffcf', 1.2);
    };
    $('o-quit').onclick = () => { A.fx('click'); closeModal(); failLevel(); };
  });
}

function failLevel() {
  ph = 'end';
  M.runStats(save, B.stats);
  const lost = M.loseLevel(save);
  A.fx('lose'); A.mode('map');
  const n = cur.n;
  const inf = M.infinite(save), lv = M.lives(save);
  modal(`<h2>Nivel ${n} fallido</h2><div class="bigstars" style="height:70px">${ic('heart')}</div>
    <p>${inf ? 'Tenés vidas infinitas: ¡dale de nuevo!' : `Perdiste una vida. Te quedan <b>${lv}</b>.`}</p>
    ${lost && save.level >= M.FEATURES.streak ? `<p>Se apagó tu racha de <b>${lost}</b> victorias.</p>` : ''}
    <div class="col"><button class="big green" id="f-retry">REINTENTAR</button><button class="btn2" id="f-map">Volver al mapa</button></div>`, (box) => {
    box.querySelector('.bigstars svg').style.cssText = 'width:70px;height:70px;opacity:1;filter:grayscale(.7);transform:none';
    $('f-retry').onclick = () => { A.fx('click'); closeModal(); toMap(); setTimeout(() => openLevel(n), 50); };
    $('f-map').onclick = () => { A.fx('click'); closeModal(); toMap(); };
  });
}

function pauseModal() {
  if (scr !== 'play' || ph === 'end') return;
  modal(`${X}<h2>Pausa</h2>${settingsHtml()}<div class="col"><button class="big green" id="p-go">CONTINUAR</button><button class="btn2" id="p-quit">Salir del nivel</button></div>`, (box) => {
    bindSettings(box);
    $('p-go').onclick = () => { A.fx('click'); closeModal(); };
    $('p-quit').onclick = () => {
      $('p-quit').textContent = M.infinite(save) ? '¿Seguro? Tocá otra vez' : '¿Seguro? Perdés una vida · tocá otra vez';
      $('p-quit').onclick = () => { closeModal(); M.runStats(save, B.stats); M.loseLevel(save); A.fx('lose'); toMap(); };
    };
  });
}
$('b-pause').onclick = () => { A.init(); A.fx('click'); pauseModal(); };

// Potenciadores dentro del nivel
for (const b of document.querySelectorAll('.bst')) {
  b.onclick = () => {
    A.init();
    if (scr !== 'play' || ph !== 'idle') return;
    const bo = M.booster(b.dataset.b);
    if (save.level < bo.unlock) { toast(`${ic('lock')} ${bo.name}: se desbloquea en el nivel <b>${bo.unlock}</b>`); return; }
    if (!save.boosters[bo.id]) { buyModal(bo); return; }
    A.fx('click');
    if (bo.id === 'shuffle') {
      if (useShuffle(B)) { save.boosters.shuffle--; M.persist(save); R.apply(B.ev); A.fx('shuffle'); ph = 'resolve'; cur.hint = null; refreshTools(); }
      return;
    }
    cur.booster = cur.booster === bo.id ? null : bo.id;
    cur.sel = -1; cur.hint = null;
    if (cur.booster) tip(bo.id === 'hammer' ? 'Tocá la casilla que querés <b>romper</b>' : 'Tocá una casilla: la <b>ESTELA</b> barre toda su fila'); else hideTip();
    refreshTools();
  };
}
function useBoosterAt(i) {
  const id = cur.booster;
  const ok = id === 'hammer' ? useHammer(B, i) : useRow(B, i);
  if (!ok) { A.fx('bad'); return; }
  save.boosters[id]--; M.persist(save);
  cur.booster = null; hideTip(); refreshTools();
  R.apply(B.ev); A.fx(id === 'hammer' ? 'rock' : 'beam'); R.shake(8);
  ph = 'resolve'; cur.hint = null;
}
function buyModal(bo) {
  const can = save.coins >= bo.price;
  modal(`${X}<h2>${bo.name}</h2><div class="pres"><div class="pre on">${bIcon(bo.id)}</div></div><p>${bo.desc}</p>
    <button class="big green" id="by-go" ${can ? '' : 'disabled'}>COMPRAR 1<small>${ic('coin')} ${fmt(bo.price)} · tenés ${fmt(save.coins)}</small></button>`, () => {
    $('by-go').onclick = () => {
      if (save.coins < bo.price) return;
      save.coins -= bo.price; save.boosters[bo.id]++; M.persist(save); A.fx('coin');
      closeModal(); refreshTools();
    };
  });
}

function countUp(el, n, dur) {
  if (!el) return;
  const t0 = performance.now();
  let lastV = -1;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1000 / dur), v = Math.round(n * (1 - Math.pow(1 - k, 3)));
    if (v !== lastV) { el.textContent = fmt(v); if (v % 2 === 0) A.fx('coin'); lastV = v; }
    if (k < 1) requestAnimationFrame(tick);
  };
  tick();
}

// ── vidas, tienda, potenciadores nuevos ──
function livesModal() {
  const inf = M.infinite(save), lv = M.lives(save), can = save.coins >= 150;
  modal(`${X}<h2>Vidas</h2><div class="bigstars" style="height:80px">${ic('heart')}</div>
    <div class="scoreline">${inf ? '∞' : `${lv} / ${M.LIVES_MAX}`}<small id="lv-t">${inf ? `infinitas por ${mmss(save.infUntil - Date.now())}` : lv >= M.LIVES_MAX ? 'ESTÁN LLENAS' : `próxima en ${mmss(M.nextLifeIn(save))}`}</small></div>
    <p>Una vida nueva cada ${M.LIFE_MS / 60000} minutos. Se gasta al empezar y vuelve si ganás.</p>
    ${!inf && lv < M.LIVES_MAX ? `<button class="big green" id="lv-buy" ${can ? '' : 'disabled'}>LLENAR VIDAS<small>${ic('coin')} 150</small></button>` : ''}`, (box) => {
    box.querySelector('.bigstars svg').style.cssText = 'width:80px;height:80px;opacity:1;filter:none;transform:none';
    const b = $('lv-buy');
    if (b) b.onclick = () => { if (M.buy(save, 'refill')) { A.fx('unlock'); closeModal(); refreshMap(); toast(`${ic('heart')} ¡Vidas llenas!`); } };
  });
}
function shopModal() {
  const items = M.SHOP.map((it) => {
    const locked = it.booster && save.level < it.booster.unlock, can = save.coins >= it.price && !locked;
    const icon = it.booster ? bIcon(it.id) : it.id === 'refill' ? ic('heart') : `<span style="font-size:30px;line-height:38px">∞</span>`;
    return `<button class="item ${can ? '' : 'no'} ${locked ? 'locked' : ''}" data-buy="${it.id}">${icon}${it.name}<small>${locked ? `nivel ${it.booster.unlock}` : it.desc}</small><span class="price">${ic('coin')}${fmt(it.price)}</span></button>`;
  }).join('');
  modal(`${X}<h2>Tienda</h2><div class="pill coins" style="margin:-4px 0 2px">${ic('coin')}<b id="sh-c">${fmt(save.coins)}</b></div><div class="shop">${items}</div>
    <p>Conseguí monedas ganando niveles, con las misiones, el regalo diario y los cofres.</p>`, (box) => {
    for (const b of box.querySelectorAll('[data-buy]')) {
      b.onclick = () => {
        if (M.buy(save, b.dataset.buy)) { A.fx('coin'); toast(`¡Comprado! ${M.SHOP.find((x) => x.id === b.dataset.buy).name}`); shopModal(); refreshMap(); if (scr === 'play') refreshTools(); }
        else A.fx('bad');
      };
    }
  });
}
function unlockModal(b) {
  A.fx('unlock');
  modal(`<div class="rays"></div><h2 class="gold">¡NUEVO POTENCIADOR!</h2><div class="pres"><div class="pre on" style="width:96px;height:96px">${bIcon(b.id)}</div></div>
    <h2>${b.name}</h2><p>${b.desc}. ${b.ingame ? 'Usalo durante la partida desde la barra de abajo.' : 'Elegilo antes de empezar un nivel.'}</p><p><b>¡Tenés 3 gratis!</b></p>
    <button class="big gold" data-x>¡GENIAL!</button>`, (box) => { box.querySelector('.pre canvas, .pre svg').style.cssText = 'width:64px;height:64px'; });
}
function skyTipModal() {
  modal(`${X}<h2 class="gold">¡El cielo te espera!</h2><svg viewBox="0 0 24 24" style="width:80px;height:80px"><use href="#i-sky"/></svg>
    <p>Con las <b>estrellas</b> que ganás en los niveles encendés constelaciones. Cada una completa da un <b>cofre celeste</b>.</p>
    <button class="big gold" id="st-go">IR AL CIELO</button>`, () => { $('st-go').onclick = () => { closeModal(); openSky(); }; });
}

// ── cofres ──
function chestModal(want = null) {
  if (!save.chests.length) return;
  const kind = want && save.chests.includes(want) ? want : save.chests[0];
  modal(`<h2 class="gold">${M.chestName(kind)}</h2><svg class="chestbig shake" viewBox="0 0 24 24"><use href="#i-chest"/></svg><p>Tocá el cofre para abrirlo</p>`, (box) => {
    const c = box.querySelector('.chestbig');
    const open = () => {
      c.onclick = null; box.onclick = null;
      const res = M.openChest(save, kind);
      c.classList.remove('shake'); c.classList.add('open');
      A.fx('chest'); buzz([20, 30, 60]);
      setTimeout(() => {
        const items = res.items.map((it, k) => {
          const d = `style="animation-delay:${k * 0.15}s"`;
          if (it.coins) return `<div class="rw" ${d}>${ic('coin')}+${fmt(it.coins)}</div>`;
          if (it.booster) return `<div class="rw" ${d}>${bIcon(it.booster)}×${it.n}<small>${M.booster(it.booster).name}</small></div>`;
          return `<div class="rw" ${d}>${ic('heart')}∞<small>${it.inf} min</small></div>`;
        }).join('');
        modal(`<div class="rays"></div><h2 class="gold">${M.chestName(res.kind)}</h2><div class="rewards">${items}</div>
          <div class="col"><button class="big gold" data-x>¡GENIAL!</button>${save.chests.length ? `<button class="btn2" id="ch-more">Abrir otro (${save.chests.length})</button>` : ''}</div>`, () => {
          const m = $('ch-more'); if (m) m.onclick = () => { closeModal(); chestModal(); };
          refreshMap();
        });
      }, 450);
    };
    c.onclick = open;
    box.onclick = (e) => { if (!e.target.closest('button')) open(); };
  });
}

// ── calendario diario ──
function dailyModal() {
  const ready = M.dailyReady(save), day = M.dailyNext(save);
  const cells = M.DAILY.map((r, k) => {
    const d = k + 1, got = ready ? d < day : d <= day, today = ready && d === day;
    const icon = r.coins ? `${ic('coin')}<span>${r.coins}</span>` : r.inf ? `${ic('heart')}<span>∞ ${r.inf}m</span>` : r.booster ? `${ic('hammer')}<span>×2</span>` : `${ic('chest')}<span>GRAN COFRE</span>`;
    return `<div class="day ${got ? 'got' : ''} ${today ? 'today' : ''} ${d === 7 ? 'd7' : ''}"><small>DÍA ${d}</small>${icon}</div>`;
  }).join('');
  modal(`${X}<h2 class="gold">Regalo diario</h2><p>Entrá todos los días: el premio crece. Si faltás un día, vuelve al día 1.</p><div class="cal">${cells}</div>
    <button class="big green ${ready ? 'pulse' : ''}" id="d-go" ${ready ? '' : 'disabled'}>${ready ? 'RECLAMAR' : 'VOLVÉ MAÑANA'}</button>`, () => {
    $('d-go').onclick = () => {
      const r = M.claimDaily(save);
      if (!r) return;
      A.fx('unlock'); buzz([20, 40]);
      for (const g of r.got) {
        if (g.coins) toast(`${ic('coin')} <b>+${g.coins}</b> monedas`);
        else if (g.inf) toast(`${ic('heart')} <b>Vidas infinitas</b> por ${g.inf} min`);
        else if (g.booster) toast(`<b>${M.booster(g.booster).name} ×${g.n}</b>`);
      }
      closeModal(); refreshMap();
      if (r.got.some((g) => g.chest)) queueModal(() => chestModal());
    };
  });
}

// ── misiones ──
function questsModal() {
  M.refreshQuests(save);
  const q = save.quests;
  const next = new Date(); next.setHours(24, 0, 0, 0);
  const list = q.list.map((x, k) => {
    const done = M.questDone(x);
    return `<li class="${x.claimed ? 'claimed' : done ? 'ok' : ''}"><span>${M.questText(x)}</span><button data-q="${k}" ${done && !x.claimed ? '' : 'disabled'}>${x.claimed ? '✔' : `${ic('coin')}${x.rw}`}</button>
      <div class="bar"><i style="width:${(x.prog / x.n) * 100}%"></i></div><span class="pr">${fmt(x.prog)} / ${fmt(x.n)}</span></li>`;
  }).join('');
  modal(`${X}<h2>Misiones del día</h2><ul class="quests">${list}</ul>
    <div class="qbonus">${ic('chest')}<span>${q.bonus ? '¡Cofre del día conseguido!' : 'Completá las 3 y ganá el <b>Cofre del día</b>'}</span></div>
    <p>Nuevas misiones en <b>${hhmm(next - Date.now())}</b></p>`, (box) => {
    for (const b of box.querySelectorAll('[data-q]')) {
      b.onclick = () => {
        const r = M.claimQuest(save, +b.dataset.q);
        if (!r) return;
        A.fx('coin'); toast(`${ic('coin')} <b>+${r.coins}</b>`);
        refreshMap(); questsModal();
        if (r.bonus) { closeModal(); queueModal(() => chestModal()); }
      };
    }
  });
}

// ── cielo ──
function openSky() {
  if (save.level < M.FEATURES.sky) { toast(`${ic('lock')} El cielo se abre en el nivel <b>${M.FEATURES.sky}</b>`); return; }
  A.init(); A.fx('click');
  scr = 'sky'; show('sky'); renderSky();
}
function skySvg(c, lit, opts = {}) {
  const P = c.pts;
  let h = '';
  for (const [a, b] of c.lines) {
    const on = lit.includes(a) && lit.includes(b);
    h += `<line class="ln ${on ? '' : 'off'} ${opts.drawN?.has(`${a}-${b}`) ? 'draw' : ''}" x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}"/>`;
  }
  P.forEach(([x, y], k) => {
    const on = lit.includes(k);
    h += `<g class="sp ${on ? 'on' : 'off'} ${!on && opts.can ? 'can' : ''} ${opts.just === k ? 'lit' : ''}" data-s="${k}">${on ? `<circle class="halo" cx="${x}" cy="${y}" r="5"/>` : ''}<circle class="core" cx="${x}" cy="${y}" r="${on ? 2.4 : 2}"/><circle cx="${x}" cy="${y}" r="7" fill="transparent"/>${!on && opts.cost ? `<text x="${x}" y="${y + 6.5}">${opts.cost}★</text>` : ''}</g>`;
  });
  return h;
}
function renderSky(just = -1, drawN = null, done = null) {
  const c = done || M.skyNow(save), lit = done ? c.pts.map((_, k) => k) : save.sky.lit;
  const avail = M.starsAvail(save), can = !done && avail >= c.cost;
  $('s-avail').textContent = fmt(avail);
  $('s-name').textContent = c.name;
  $('s-story').textContent = c.story;
  $('s-svg').innerHTML = skySvg(c, lit, { can, cost: done ? 0 : c.cost, just, drawN });
  $('s-hint').innerHTML = done ? '¡Constelación completa!' : can ? `Tocá una estrella para encenderla · cada una cuesta <b>${c.cost} ★</b>` : `Necesitás <b>${c.cost} ★</b> por estrella: ganá niveles (¡las ★★★ suman más!)`;
  $('s-bar').style.width = `${(lit.length / c.pts.length) * 100}%`;
  $('s-prog').textContent = `${lit.length} / ${c.pts.length}`;
  const k = save.sky.k;
  let gal = '';
  for (let j = 0; j < k + 2; j++) {
    const g = constellation(j), mine = j < k;
    gal += `<div class="gi ${mine ? '' : 'lock'}"><svg class="skysvg" viewBox="-6 -6 112 112">${skySvg(g, mine ? g.pts.map((_, i) => i) : [], {})}</svg>${mine ? g.name : j === k ? 'En curso' : '???'}</div>`;
  }
  $('s-gal').innerHTML = gal;
}
$('s-svg').addEventListener('click', (e) => {
  const g = e.target.closest('[data-s]'); if (!g) return;
  const idx = +g.dataset.s, c = M.skyNow(save);
  if (save.sky.lit.includes(idx)) return;
  const before = save.sky.lit.slice();
  const res = M.lightStar(save, idx);
  if (!res) { A.fx('bad'); toast(`Te faltan estrellas: cada una cuesta <b>${c.cost} ★</b>`); return; }
  A.fx('light'); buzz(15);
  const lit = [...before, idx];
  const drawN = new Set(c.lines.filter(([a, b]) => (a === idx && lit.includes(b)) || (b === idx && lit.includes(a))).map(([a, b]) => `${a}-${b}`));
  renderSky(idx, drawN, res.complete);
  toast(`${ic('coin')} +${res.coins}`);
  if (res.complete) {
    setTimeout(() => {
      A.fx('unlock'); A.say(res.complete.name);
      modal(`<div class="rays"></div><h2 class="gold">¡CONSTELACIÓN COMPLETA!</h2><svg class="skysvg" viewBox="-6 -6 112 112" style="width:220px;height:220px">${skySvg(res.complete, res.complete.pts.map((_, i) => i), {})}</svg>
        <h2>${res.complete.name}</h2><p>${res.complete.story}</p><button class="big gold" id="sk-go">ABRIR COFRE CELESTE</button>`, () => {
        $('sk-go').onclick = () => { closeModal(); chestModal('sky'); };
      }, () => renderSky());
    }, 1100);
  }
});
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => { A.fx('click'); toMap(); };

// ── ajustes ──
const settingsHtml = () => `<div class="opts">${[['music', 'Música'], ['sfx', 'Efectos'], ['voice', 'Voz'], ['vib', 'Vibración']].map(([k, t]) => `<label>${t}<input type="checkbox" data-opt="${k}" ${save.settings[k] ? 'checked' : ''}></label>`).join('')}</div>`;
function bindSettings(box) {
  for (const i of box.querySelectorAll('[data-opt]')) {
    i.onchange = () => { save.settings[i.dataset.opt] = i.checked; if (i.dataset.opt in A.opt) A.setOpt(i.dataset.opt, i.checked); M.persist(save); };
  }
}
function settingsModal() {
  const s = save.stats;
  modal(`${X}<h2>Ajustes</h2>${settingsHtml()}<div class="stats" id="st-box"></div><button class="btn2" id="st-reset">Borrar progreso</button>`, (box) => {
    bindSettings(box);
    const rows = [['Niveles jugados', s.played], ['Ganados', s.wins], ['Estrellas', M.starsTotal(save)], ['Cometas', s.made[S.H]], ['Novas', s.made[S.NOVA]], ['Luciérnagas', s.made[S.FLY]], ['Luceros', s.made[S.STAR]], ['Combos', s.combos], ['Cascada máxima', s.maxChain], ['Constelaciones', save.sky.k], ['Cofres', s.chests]];
    const st = $('st-box');
    rows.forEach(([k, v], j) => {
      const b = document.createElement('b'); b.textContent = String(v);
      st.append(`${j % 2 ? ' · ' : ''}${k}: `, b);
      if (j % 2) st.append(document.createElement('br'));
    });
    $('st-reset').onclick = () => {
      $('st-reset').textContent = '¿Seguro? Tocá otra vez';
      $('st-reset').onclick = () => { try { localStorage.removeItem('lucero.save'); } catch { /* */ } location.reload(); };
    };
  });
}

$('b-play').onclick = () => { A.init(); A.fx('click'); openLevel(save.level); };
$('b-daily').onclick = () => { A.init(); A.fx('click'); dailyModal(); };
$('b-quests').onclick = () => { A.init(); A.fx('click'); questsModal(); };
$('b-chests').onclick = () => { A.init(); A.fx('click'); chestModal(); };
$('b-sky').onclick = openSky;
$('m-stars').onclick = openSky;
$('b-shop').onclick = () => { A.init(); A.fx('click'); shopModal(); };
$('m-coins').onclick = () => { A.init(); A.fx('click'); shopModal(); };
$('m-lives').onclick = () => { A.init(); A.fx('click'); livesModal(); };
$('b-settings').onclick = () => { A.init(); A.fx('click'); settingsModal(); };
$('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal') && $('mbox').querySelector('[data-x]') && ph !== 'end') closeModal(); });
addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { if (modalOn && $('mbox').querySelector('[data-x]')) closeModal(); else if (scr === 'play') pauseModal(); else if (scr === 'sky') toMap(); }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (modalOn) { const b = $('mbox').querySelector('button.big:not(:disabled)'); if (b) { e.preventDefault(); A.init(); b.click(); } }
    else if (scr === 'map') { e.preventDefault(); A.init(); openLevel(save.level); }
  }
});
addEventListener('resize', () => { R.resize(); if (scr === 'play' && B) R.layout(slotRect()); });
document.addEventListener('visibilitychange', () => { if (document.hidden && scr === 'play' && ph === 'idle' && !modalOn) pauseModal(); });

// ── bucle ──
let topT = 0;
function tick(dt) {
  const sdt = dt * speed * (cur?.fast ? 4 : 1);
  R.update(sdt);
  if (scr === 'play') playTick(sdt);
  if (R.takeLanded()) A.fx('land');
}
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t; clock += dt;
  tick(dt);
  if ((topT -= dt) <= 0 && scr === 'map') { topT = 0.5; refreshTop(); const l = $('lv-t'); if (l && modalOn) l.textContent = M.infinite(save) ? `infinitas por ${mmss(save.infUntil - Date.now())}` : M.lives(save) >= M.LIVES_MAX ? 'ESTÁN LLENAS' : `próxima en ${mmss(M.nextLifeIn(save))}`; }
  R.draw({ time: clock, board: scr === 'play', sel: cur?.sel ?? -1, hint: ph === 'idle' ? cur?.hint : null });
  requestAnimationFrame(frame);
}

R.resize();
toMap();
if (M.dailyReady(save)) queueModal(() => dailyModal());
requestAnimationFrame(frame);
// precalienta la calibración del nivel actual (si no está en la tabla)
calFor(save.level).then(() => calFor(save.level + 1));

window.__lucero = {
  save, M, R,
  state: () => ({ scr, ph, level: save.level, n: cur?.n, used: B?.used, moves: B?.moves, score: B?.score, goals: B?.goals.map((g) => `${g.t}:${g.got}/${g.n}`), busy: R.busy() }),
  board: () => B,
  // salta directo a jugar el nivel n (sin ventana)
  async play(n = save.level) { if (modalOn) closeModal(); const def = await levelOf(n); startLevel(def, []); },
  auto(on = true) { autoplay = on; },
  speed(k = 1) { speed = k; },
  // simula `seg` segundos sin rAF (con el panel oculto no corre requestAnimationFrame)
  advance(seg, dt = 1 / 60) { for (let k = 0; k < seg / dt; k++) tick(dt); },
  win() { if (B) for (const g of B.goals) g.got = g.n; },
  lose() { if (B) B.used = B.moves; },
  give(c = 1000) { save.coins += c; M.persist(save); refreshMap(); },
  moves: () => (B ? listMoves(B) : []),
  modal: () => (modalOn ? $('mbox').innerText : null),
  close: closeModal, hash,
};
