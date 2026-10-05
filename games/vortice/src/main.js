// VÓRTICE — flujo (título → partida → muerte → revivir/resultados → reintentar), bucle,
// entrada, efectos de pantalla y progreso. `window.__vortice` para depurar.
import { createSim, step, botDir, revive, sideOf, requestFlip } from './sim.js';
import { DT, STAGES, P, PSIZE, ESCAPE_T, PELO_T, stageAt } from './const.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import * as M from './meta.js';

const $ = (id) => document.getElementById(id);
const R = createRenderer($('game'));
const A = createAudio();
const save = M.load();
for (const k of ['music', 'sfx', 'voice']) A.opt[k] = save.settings[k];

let state = 'title'; // title | play | dying | revive | over
let mode = 'normal';
let sim = attract();
let acc = 0, last = performance.now(), clock = 0;
const fx = { shake: 0, flash: 0, zoom: 1, slow: 1, slowT: 0 };
let revivesUsed = 0, bestAtStart = { time: 0, score: 0 }, recordBeaten = false, wasFever = false;
let missionT = 0, stateT = 0, reviveT = 0;
// EN LLAMAS: reintentar enseguida multiplica las chispas de la próxima partida
const HOT_WINDOW = 8, HOT_MAX = 10;
let hot = 0, hotUntil = 0;
const hotMul = () => 1 + hot * 0.1;

function attract() { return createSim({ seed: (Math.random() * 2 ** 31) | 0, mode: 'normal' }); }
const skin = () => M.SKINS.find((k) => k.id === save.skin) || M.SKINS[0];
const fmtT = (t) => t.toFixed(2).replace('.', ',');
const fmtN = (n) => Math.floor(n).toLocaleString('es');
const buzz = (ms) => { if (save.settings.shake && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* */ } };
const show = (id) => { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id); };

// ── entrada ──
// Teclado: ←/→ o A/D giran; espacio, ↑/↓ o W/S saltan. Ratón: clic izquierdo/derecho gira
// (sin importar dónde), rueda o clic medio saltan. Táctil: mitad izquierda/derecha gira y
// deslizar en vertical salta.
const keys = { l: false, r: false }, mouse = { l: false, r: false };
const touches = new Map(); // pointerId → { side, x, y, t }
function inputDir() {
  let l = keys.l || mouse.l, r = keys.r || mouse.r;
  for (const p of touches.values()) { if (p.side < 0) l = true; else if (p.side > 0) r = true; }
  return (r ? 1 : 0) - (l ? 1 : 0);
}
const flip = () => { if (state === 'play') requestFlip(sim); };
const KL = ['ArrowLeft', 'KeyA'], KR = ['ArrowRight', 'KeyD'], KF = ['Space', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'];
addEventListener('keydown', (e) => {
  if (KL.includes(e.code)) keys.l = true;
  if (KR.includes(e.code)) keys.r = true;
  if (e.repeat) return;
  if (state === 'play' && KF.includes(e.code)) flip();
  else if (state === 'over' && stateT > 0.45 && (KL.includes(e.code) || KR.includes(e.code) || e.code === 'Space' || e.code === 'Enter')) retry();
  else if (state === 'revive' && (e.code === 'Space' || e.code === 'Enter')) doRevive();
  else if (state === 'revive' && (e.code === 'Escape' || KL.includes(e.code) || KR.includes(e.code))) finish();
  else if (state === 'title' && (e.code === 'Space' || e.code === 'Enter')) startRun('normal');
  else if (state === 'play' && e.code === 'Escape') { sim.dead = true; die(); }
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => {
  if (KL.includes(e.code)) keys.l = false;
  if (KR.includes(e.code)) keys.r = false;
});
addEventListener('blur', () => { keys.l = keys.r = mouse.l = mouse.r = false; mbtn = 0; touches.clear(); });
const onCanvas = (e) => !e.target.closest('button, input, label, .panel, .modal .box, a');
const halfOf = (x) => (x < innerWidth / 2 ? -1 : 1);
// Ratón: todo sale de `buttons` (con un botón ya apretado, el segundo llega como pointermove)
let mbtn = 0, swallowMouse = false; // el clic que reintenta no debe quedar girando
function mouseButtons(e) {
  const b = state === 'play' && !swallowMouse ? e.buttons : 0;
  if (b & 4 && !(mbtn & 4)) flip(); // clic medio
  mbtn = b; mouse.l = !!(b & 1); mouse.r = !!(b & 2);
  if (!e.buttons) swallowMouse = false;
}
addEventListener('pointerdown', (e) => {
  A.init();
  if (state === 'play') {
    if (e.pointerType === 'mouse') mouseButtons(e);
    else touches.set(e.pointerId, { side: halfOf(e.clientX), x: e.clientX, y: e.clientY, t: performance.now() });
    return;
  }
  if (!onCanvas(e)) return;
  if (state === 'over' && stateT > 0.45) { retry(); if (e.pointerType === 'mouse') swallowMouse = true; }
  else if (state === 'revive') finish();
});
const lift = (e) => { if (e.pointerType === 'mouse') mouseButtons(e); else touches.delete(e.pointerId); };
addEventListener('pointerup', lift);
addEventListener('pointercancel', lift);
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') return mouseButtons(e);
  const p = touches.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (p.side && Math.abs(dy) >= 34 && Math.abs(dy) > Math.abs(dx) * 1.3 && performance.now() - p.t < 320) {
    p.side = 0; flip(); // deslizar = SALTO; ese dedo deja de girar hasta soltarlo
  } else if (p.side) p.side = halfOf(e.clientX);
});
addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // sin autoscroll
let lastWheel = 0; // la inercia del trackpad manda una ráfaga: solo cuenta un gesto nuevo
addEventListener('wheel', (e) => {
  if (state !== 'play') return;
  e.preventDefault();
  const now = performance.now();
  if (now - lastWheel > 250) flip();
  lastWheel = now;
}, { passive: false });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('resize', () => R.resize());

// ── partida ──
function startRun(m) {
  A.init();
  if (m === 'hiper' && !save.unlocked.hiper) { toast('🔒 HIPER: llegá a 30 s en NORMAL o a nivel 6'); A.fx('lost'); return; }
  hot = state === 'over' && clock < hotUntil ? Math.min(HOT_MAX, hot + 1) : 0;
  if (hot) toast(`🔥 EN LLAMAS ×${hotMul().toFixed(1).replace('.', ',')} ✦`, 'hot');
  mode = m;
  sim = createSim({ seed: m === 'diario' ? M.dailySeed() : (Math.random() * 2 ** 31) | 0, mode: m });
  state = 'play'; stateT = 0; acc = 0; R.clear();
  revivesUsed = 0; recordBeaten = false; wasFever = false; missionT = 0;
  bestAtStart = { ...save.best[m] };
  show(null); document.body.classList.add('playing');
  A.mode('play'); A.stage(0); A.say(m === 'hiper' ? 'Hiper' : 'Comienza');
  fx.flash = 0.35; fx.zoom = 1.25;
  if (!save.tips.salto) {
    save.tips.salto = true; M.persist(save);
    toast(matchMedia('(pointer: coarse)').matches ? '💫 NUEVO: <b>deslizá ↕</b> para SALTAR al lado opuesto' : '💫 NUEVO: <b>espacio</b> o <b>rueda</b> para SALTAR al lado opuesto', 'lv');
  }
}
const retry = () => startRun(mode);

const runStats = () => ({
  mode, time: sim.t, score: sim.score, roces: sim.roces, casis: sim.casis, shards: sim.shardsGot,
  maxCombo: sim.maxCombo, fevers: sim.fevers, escapes: sim.escapes, pelos: sim.pelos, runs: 1,
});

function handleEvents() {
  const evs = sim.events; sim.events = [];
  const col = skin().color.startsWith('#') ? skin().color : '#fff';
  if (state === 'title') { for (const e of evs) if (e.type === 'salto') R.salto(e.from, e.to, col); return; }
  if (state !== 'play') return;
  for (const e of evs) {
    if (e.type === 'roce') {
      A.roce(e.combo, e.casi);
      R.pop(e.casi ? `¡CASI! +${fmtN(e.pts)}` : `+${fmtN(e.pts)}`, e.casi ? '#ff2f5b' : '#ffffff', e.casi ? 1.4 : 0.4);
      R.burst((e.side + 0.5) * Math.PI / 3, P + PSIZE, e.casi ? 16 : 6, e.casi ? '#ff2f5b' : col, 220, 0.4, 3);
      fx.shake = Math.max(fx.shake, e.casi ? 9 : 3);
      if (e.casi) { fx.slow = 0.3; fx.slowT = 0.14; fx.flash = Math.max(fx.flash, 0.18); fx.zoom = 1.07; buzz(18); }
    } else if (e.type === 'shard') {
      A.shard(e.combo);
      R.pop(`✦ +${fmtN(e.pts)}`, '#ffe36b', 1);
      R.burst(sim.a, P + PSIZE, 22, '#ffe36b', 300, 0.6, 4);
      fx.zoom = 1.05; buzz(10);
    } else if (e.type === 'stage') {
      const st = STAGES[e.stage];
      A.stageUp(); A.stage(e.stage); A.say(st.name.toLowerCase());
      R.pop(st.name, '#ffffff', 2.2);
      fx.flash = 0.6; fx.zoom = 1.18; fx.shake = 10; buzz(40);
    } else if (e.type === 'fever') {
      A.fx('fever'); A.fever(true); A.say('¡Fiebre!');
      R.pop('¡FIEBRE! ×2', '#ff2f5b', 2);
      fx.flash = 0.4; fx.zoom = 1.12; buzz([20, 40, 20]);
    } else if (e.type === 'salto') {
      R.salto(e.from, e.to, col);
      A.salto(e.tti < ESCAPE_T);
      fx.shake = Math.max(fx.shake, 4); fx.zoom = Math.max(fx.zoom, 1.04); buzz(8);
      // con la muerte encima, el vuelo se ve en cámara lenta
      if (e.tti < ESCAPE_T) { fx.slow = e.tti < PELO_T ? 0.2 : 0.35; fx.slowT = 0.22; }
    } else if (e.type === 'llegada') {
      R.wave(sim.a, e.tier === 2 ? '#ffe36b' : e.tier ? '#47f3ff' : col, e.tier);
      if (!e.tier) continue;
      const pelo = e.tier === 2;
      A.escape(pelo, e.combo);
      R.pop(pelo ? `¡POR UN PELO! +${fmtN(e.pts)}` : `¡ESCAPE! +${fmtN(e.pts)}`, pelo ? '#ffe36b' : '#47f3ff', pelo ? 1.6 : 0.9);
      R.burst(sim.a, P + PSIZE, pelo ? 36 : 16, pelo ? '#ffe36b' : '#47f3ff', 320, 0.7, 4);
      fx.shake = Math.max(fx.shake, pelo ? 14 : 7); fx.zoom = pelo ? 1.14 : 1.08;
      fx.flash = Math.max(fx.flash, pelo ? 0.35 : 0.15);
      if (pelo) { fx.slow = 0.3; fx.slowT = 0.3; A.say('¡Por un pelo!'); buzz([15, 30, 40]); } else buzz(15);
    } else if (e.type === 'listo') {
      A.fx('ready');
    } else if (e.type === 'combo-lost') {
      A.fx('lost'); R.pop(`combo ${e.combo} perdido`, 'rgba(255,255,255,.6)', 0.3);
    } else if (e.type === 'dead') die();
  }
  if (wasFever && !sim.fever) A.fever(false);
  wasFever = sim.fever;
  if (!recordBeaten && bestAtStart.score > 0 && sim.score > bestAtStart.score) {
    recordBeaten = true; A.fx('record'); A.say('¡Nuevo récord!');
    R.pop('★ NUEVO RÉCORD ★', '#ffd23f', 1.8);
    for (let i = 0; i < 6; i++) R.burst(Math.random() * 6.28, 120 + Math.random() * 200, 14, `hsl(${i * 60},100%,65%)`, 260, 1, 4);
  }
}

function die() {
  state = 'dying'; stateT = 0; touches.clear();
  A.fx('dead'); A.mode('dead'); buzz([60, 30, 120]);
  fx.shake = 26; fx.flash = 0.8; fx.zoom = 0.9;
  const c = skin().color.startsWith('#') ? skin().color : '#fff';
  R.burst(sim.a, P + PSIZE, 70, c, 420, 1.1, 5);
  R.burst(sim.a, P + PSIZE, 30, '#ff2f5b', 260, 0.8, 3);
}

// Tras la cámara lenta de la muerte: ofrecer revivir (si se puede) o mostrar resultados
function afterDeath() {
  const cost = M.reviveCost(save, revivesUsed);
  if (sim.t >= 6 && revivesUsed < 3 && save.chispas >= cost) {
    state = 'revive'; stateT = 0; reviveT = 3.5;
    show('over'); $('o-main').classList.add('hidden'); $('o-revive').classList.remove('hidden');
    $('o-revive-txt').innerHTML = `REVIVIR<small>${cost ? `${cost} ✦ · tenés ${fmtN(save.chispas)}` : 'GRATIS · 1 por día'}</small>`;
    A.say('¿Revivir?');
  } else finish();
}

function doRevive() {
  if (state !== 'revive') return;
  if (!M.useRevive(save, revivesUsed)) return finish();
  revivesUsed++;
  revive(sim); sim.events = [];
  state = 'play'; stateT = 0; show(null); refreshCoins();
  A.mode('play'); A.stage(sim.stage); A.fx('revive');
  fx.flash = 0.5; fx.zoom = 1.2;
}

function finish() {
  state = 'over'; stateT = 0;
  document.body.classList.remove('playing');
  const r = runStats();
  const live = M.checkMissions(save, r);
  const res = M.finishRun(save, r, hotMul());
  hotUntil = clock + HOT_WINDOW;
  announce(live);
  show('over'); $('o-revive').classList.add('hidden'); $('o-main').classList.remove('hidden');

  $('o-time').textContent = fmtT(sim.t);
  $('o-stage').textContent = STAGES[stageAt(sim.t)].name;
  const st = stageAt(sim.t), cur = STAGES[st], nxt = STAGES[st + 1];
  let html = '';
  if (nxt) {
    const k = (sim.t - cur.t) / (nxt.t - cur.t);
    html = `${k > 0.6 ? '¡Te faltaron' : 'A'} <b>${fmtT(nxt.t - sim.t)} s</b> de <b>${nxt.name}</b><div class="bar"><i style="width:${(k * 100).toFixed(1)}%"></i></div>`;
  }
  if (!res.record && res.prevBest.score > 0) {
    const miss = res.prevBest.score - sim.score;
    html += `<div style="margin-top:6px">a <b>${fmtN(miss)} pts</b> de tu récord${miss < res.prevBest.score * 0.15 ? ' — ¡casi!' : ''}</div>`;
  }
  $('o-next').innerHTML = html;
  $('o-badge').classList.toggle('hidden', !res.record);
  $('o-score').textContent = fmtN(sim.score);
  $('o-best').textContent = fmtN(save.best[mode].score);
  $('o-roces').textContent = sim.roces;
  $('o-combo').textContent = sim.maxCombo;
  if (res.record && res.prevBest.score > 0) { A.fx('record'); }

  // las chispas suben de a poco (y suenan)
  countUp($('o-coins'), res.coins, 0.8);
  $('o-level').textContent = save.level;
  $('o-xp').style.width = '0%';
  requestAnimationFrame(() => { $('o-xp').style.width = `${(save.xp / M.xpNeed(save.level)) * 100}%`; });
  for (const l of res.levels) { toast(`⬆ NIVEL ${l} · <b>+${40 + 15 * l} ✦</b>`, 'lv'); A.fx('level'); }
  $('o-unlocks').innerHTML = res.unlocks.map((u) => `<div>🔓 ${u}</div>`).join('');
  if (res.unlocks.length) A.say('Desbloqueado');
  renderMissions($('o-missions'));
  renderChest();
  refreshCoins();
}

function announce(list) {
  for (const m of list) {
    if (m.levelUp) { toast(`⬆ NIVEL ${m.levelUp} · <b>+${40 + 15 * m.levelUp} ✦</b>`, 'lv'); A.fx('level'); continue; }
    toast(`✔ ${M.missionText(m)} · <b>+${m.reward} ✦</b>`); A.fx('mission');
  }
  if (list.length) refreshCoins();
}

function countUp(el, n, dur) {
  const t0 = performance.now(); let lastV = -1;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1000 / dur);
    const v = Math.round(n * (1 - Math.pow(1 - k, 3)));
    if (v !== lastV) { el.textContent = fmtN(v); if (v % 3 === 0) A.fx('coin'); lastV = v; }
    if (k < 1) requestAnimationFrame(tick);
  };
  tick();
}

// ── UI ──
function toast(html, cls = '') {
  const d = document.createElement('div');
  d.className = `toast ${cls}`; d.innerHTML = html;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 2900);
}

function refreshCoins() {
  for (const el of [$('t-coins'), ...document.querySelectorAll('.coins-v')]) {
    if (el.textContent !== fmtN(save.chispas)) { el.textContent = fmtN(save.chispas); el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); }
  }
}

function renderMissions(ul, r = null) {
  ul.innerHTML = save.missions.map((m) => {
    const p = Math.min(m.n, M.missionProg(save, m, r));
    const pct = (p / m.n) * 100;
    return `<li class="${m.done ? 'done' : ''}"><span>${m.fresh ? '<em class="new">NUEVA</em>' : ''}${M.missionText(m)}</span><span class="rw">+${m.reward} ✦</span><div class="bar"><i style="width:${pct}%"></i></div></li>`;
  }).join('');
}

function renderChest() {
  const c = save.chest, ready = c.ready > 0;
  for (const b of [$('btn-chest'), $('o-chest')]) { b.classList.toggle('hidden', !ready); b.classList.toggle('ready', ready); }
  $('o-chest').textContent = `🎁 ABRIR COFRE${c.ready > 1 ? ` (${c.ready})` : ''}`;
  $('t-chest').textContent = `COFRE${c.ready > 1 ? ` ×${c.ready}` : ''}`;
  const bar = $('o-chestbar');
  bar.classList.toggle('hidden', ready);
  bar.querySelector('i').style.width = `${(c.t / M.CHEST_EVERY) * 100}%`;
  bar.querySelector('span').textContent = `🎁 próximo cofre: ${Math.ceil(M.CHEST_EVERY - c.t)} s de juego`;
}

function refreshTitle() {
  $('t-level').textContent = save.level;
  $('t-xp').style.width = `${(save.xp / M.xpNeed(save.level)) * 100}%`;
  $('t-streak').textContent = save.streak.n > 0 ? `🔥 ${save.streak.n} ${save.streak.n === 1 ? 'día' : 'días'}` : '';
  refreshCoins();
  const b = save.best;
  $('best-normal').textContent = b.normal.time ? `${fmtT(b.normal.time)} s · ${fmtN(b.normal.score)}` : 'empezá acá';
  $('best-hiper').textContent = save.unlocked.hiper ? (b.hiper.time ? `${fmtT(b.hiper.time)} s · ${fmtN(b.hiper.score)}` : '×1,6 puntos') : '30 s en NORMAL';
  const d = new Date(); const td = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  $('best-diario').textContent = save.daily.date === td ? `hoy ${fmtN(save.daily.best)}` : 'nuevo hoy';
  document.querySelector('.mode[data-mode="hiper"]').classList.toggle('locked', !save.unlocked.hiper);
  renderMissions($('t-missions'));
  renderChest();
}

function toTitle() {
  state = 'title'; sim = attract(); R.clear();
  document.body.classList.remove('playing');
  show('title'); refreshTitle(); A.mode('title');
}

function renderSkins() {
  const g = $('skin-grid');
  g.innerHTML = M.SKINS.map((k) => {
    const own = save.owned.includes(k.id), sel = save.skin === k.id;
    const sw = k.color === 'rainbow' ? 'rainbow' : k.color === 'glitch' ? 'glitch' : '';
    const c = sw ? '#e8fffe' : k.color;
    const foot = own ? (sel ? 'EQUIPADA' : 'usar') : k.cost ? `<span class="price">✦ ${fmtN(k.cost)}</span>` : `🔒 ${k.req}`;
    const dis = !own && (!k.cost || save.chispas < k.cost);
    return `<button class="skin ${sel ? 'sel' : ''}" data-skin="${k.id}" ${dis ? 'disabled' : ''}><div class="sw ${sw}" style="--c:${c}"></div>${k.name}<small>${foot}</small></button>`;
  }).join('');
  refreshCoins();
}
$('skin-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-skin]'); if (!b) return;
  const id = b.dataset.skin;
  if (save.owned.includes(id)) { save.skin = id; M.persist(save); A.fx('click'); }
  else if (M.buySkin(save, id)) { A.fx('chest'); toast(`¡Nueva skin: <b>${M.SKINS.find((k) => k.id === id).name}</b>!`); }
  renderSkins();
});

function openChest() {
  const prize = M.openChest(save);
  if (!prize) return;
  const modal = $('chestmodal'), roll = $('cm-roll'), tier = $('cm-tier'), ok = $('cm-ok');
  modal.classList.remove('hidden'); ok.style.visibility = 'hidden'; tier.textContent = ''; tier.className = 'tier';
  roll.classList.add('shake');
  let n = 0;
  const spin = () => {
    n++;
    roll.textContent = `✦ ${[60, 120, 250, 400, 700, 900, 3000][Math.floor(Math.random() * 7)]}`;
    A.fx('coin');
    if (n < 20) setTimeout(spin, 30 + n * n * 0.45);
    else {
      roll.classList.remove('shake');
      roll.textContent = prize.skin ? `🎨 ${prize.skin.name}` : `✦ ${fmtN(prize.coins)}`;
      tier.textContent = prize.tier; tier.classList.add(prize.tier);
      A.fx('chest'); if (prize.tier !== 'COMÚN') { A.fx('record'); A.say(prize.tier.toLowerCase()); }
      ok.style.visibility = 'visible'; refreshCoins();
    }
  };
  spin();
}
$('cm-ok').onclick = () => { $('chestmodal').classList.add('hidden'); A.fx('click'); renderChest(); if (state === 'title') refreshTitle(); };
$('btn-chest').onclick = () => { A.init(); openChest(); };
$('o-chest').onclick = () => openChest();

for (const b of document.querySelectorAll('.mode')) b.onclick = () => startRun(b.dataset.mode);
$('btn-retry').onclick = retry;
$('btn-menu').onclick = () => { A.fx('click'); toTitle(); };
$('btn-revive').onclick = (e) => { e.stopPropagation(); doRevive(); };
$('btn-skins').onclick = () => { A.init(); A.fx('click'); renderSkins(); show('skins'); };
$('btn-settings').onclick = () => {
  A.init(); A.fx('click'); show('settings');
  for (const i of document.querySelectorAll('[data-opt]')) i.checked = save.settings[i.dataset.opt];
  renderStats();
};
// Estadísticas con nodos y textContent: los valores vienen de localStorage
function renderStats() {
  const s = save.stats, box = $('stats');
  const rows = [
    [['Partidas', s.runs], ['Tiempo total', `${Math.round(s.time)} s`]],
    [['Roces', s.roces], ['¡CASI!', s.casis], ['Fragmentos', s.shards]],
    [['Escapes', s.escapes], ['¡POR UN PELO!', s.pelos]],
    [['FIEBRES', s.fevers], ['Cofres', s.chests], ['Misiones', save.done]],
  ];
  box.replaceChildren();
  rows.forEach((row, i) => {
    if (i) box.append(document.createElement('br'));
    row.forEach(([k, val], j) => {
      const b = document.createElement('b'); b.textContent = String(val);
      box.append(`${j ? ' · ' : ''}${k}: `, b);
    });
  });
}
for (const i of document.querySelectorAll('[data-opt]')) {
  i.onchange = () => { save.settings[i.dataset.opt] = i.checked; if (i.dataset.opt in A.opt) A.setOpt(i.dataset.opt, i.checked); M.persist(save); };
}
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => { A.fx('click'); toTitle(); };

// ── bucle ──
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt; stateT += dt;
  if (fx.slowT > 0) fx.slowT -= dt; else fx.slow = 1;

  if (state === 'play' || state === 'title') {
    acc += dt * fx.slow;
    while (acc >= DT) {
      acc -= DT;
      step(sim, state === 'title' ? botDir(sim, true) : inputDir());
      handleEvents();
      if (state !== 'play' && state !== 'title') break;
    }
    if (state === 'title' && sim.dead) sim = attract();
    if (state === 'play') {
      missionT -= dt;
      if (missionT <= 0) { missionT = 0.3; announce(M.checkMissions(save, runStats())); }
    }
  } else if (state === 'dying' && stateT > 0.9) afterDeath();
  if (state === 'over') {
    const left = Math.max(0, hotUntil - clock), nextMul = 1 + Math.min(HOT_MAX, hot + 1) * 0.1;
    $('o-hot').classList.toggle('cold', left <= 0);
    $('o-hot-txt').innerHTML = left > 0
      ? `🔥 Reintentá en <b>${left.toFixed(1).replace('.', ',')} s</b> → chispas <b>×${nextMul.toFixed(1).replace('.', ',')}</b>`
      : '🧊 Se apagó la racha EN LLAMAS';
    $('o-hot-bar').style.width = `${(left / HOT_WINDOW) * 100}%`;
  }
  else if (state === 'revive') {
    reviveT -= dt;
    $('o-revive-bar').style.width = `${Math.max(0, reviveT / 3.5) * 100}%`;
    if (reviveT <= 0) finish();
  }

  fx.shake *= Math.pow(0.002, dt); if (fx.shake < 0.3) fx.shake = 0;
  fx.flash = Math.max(0, fx.flash - dt * 2.5);
  fx.zoom += (1 - fx.zoom) * Math.min(1, dt * 6);

  R.draw({
    sim, skin: skin(), time: clock, dt, pulse: A.pulse(), fever: sim.fever && state === 'play',
    shake: save.settings.shake ? fx.shake : 0, flash: fx.flash, zoom: fx.zoom,
    best: state === 'play' ? bestAtStart.time : 0, bestScore: state === 'play' ? bestAtStart.score : 0,
    hudOn: state !== 'title', dim: state === 'title' ? 0.35 : state === 'over' || state === 'revive' ? 0.3 : 0,
    slow: state === 'dying',
  });
  requestAnimationFrame(frame);
}

// primera visita del día: premio por racha apenas se abre
const bonus = M.dailyLogin(save);
toTitle();
if (bonus) setTimeout(() => toast(`🔥 Racha de ${save.streak.n} ${save.streak.n === 1 ? 'día' : 'días'} · <b>+${bonus} ✦</b>`), 400);
requestAnimationFrame(frame);

window.__vortice = {
  sim: () => sim, save, state: () => state, start: startRun, A,
  // simula `seg` segundos sin rAF (con el piloto automático si bot)
  advance(seg, bot = true) {
    for (let i = 0; i < seg / DT && state === 'play'; i++) { step(sim, bot ? botDir(sim, true) : inputDir()); handleEvents(); }
  },
  side: () => sideOf(sim.a),
  flip,
  input: () => ({ dir: inputDir(), keys: { ...keys }, mouse: { ...mouse }, touches: [...touches.values()] }),
};
