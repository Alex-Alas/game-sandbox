// VÓRTICE — flujo (título → partida → muerte → revivir/resultados → reintentar), bucle,
// entrada, efectos de pantalla y progreso. `window.__vortice` para depurar.
import { createSim, step, botDir, revive, sideOf, requestFlip } from './sim.js';
import { DT, STAGES, P, PSIZE, ESCAPE_T, PELO_T, stageAt } from './const.js';
import { createBar, barReset, barTrack, barDir, barFlip, barLayout, inBarZone, barU } from './bar.js';
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
// el golpe del locutor también se ve: sacudón y zoom justo cuando empieza a hablar
A.onVoice = (lvl) => {
  if (state !== 'play' || lvl < 2) return;
  fx.shake = Math.max(fx.shake, 6 + lvl * 4); fx.zoom = Math.max(fx.zoom, 1.03 + lvl * 0.03); fx.flash = Math.max(fx.flash, 0.1 * lvl);
};
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
// Teclado: ←/→ o A/D giran; espacio, ↑/↓ o W/S saltan; F pantalla completa. Ratón: clic
// izquierdo/derecho gira (sin importar dónde), rueda o clic medio saltan. Táctil, control
// CLÁSICO: mitad izquierda/derecha gira; BARRA (bar.js): arrastrar en la barra de abajo
// marca a qué lado ir. En los dos, deslizar en vertical salta.
const keys = { l: false, r: false }, mouse = { l: false, r: false };
// pointerId → { kind: 'half' | 'bar' | 'swipe', side, u, x, y, t }. `side` 0 = ya no gira
const touches = new Map();
const bar = createBar();
const barOn = () => save.settings.control === 'barra';
let barL = barLayout(innerWidth, innerHeight, save.settings.hand);
function inputDir() {
  let l = keys.l || mouse.l, r = keys.r || mouse.r, b = null;
  for (const p of touches.values()) {
    if (!p.side) continue;
    if (p.kind === 'bar') b = p;
    else if (p.side < 0) l = true; else if (p.side > 0) r = true;
  }
  if (!l && !r && b) return barDir(bar, b.u, sim.pv.w);
  return (r ? 1 : 0) - (l ? 1 : 0);
}
const flip = () => { if (state === 'play') requestFlip(sim); };
const KL = ['ArrowLeft', 'KeyA'], KR = ['ArrowRight', 'KeyD'], KF = ['Space', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'];
addEventListener('keydown', (e) => {
  if (KL.includes(e.code)) keys.l = true;
  if (KR.includes(e.code)) keys.r = true;
  if (e.repeat) return;
  if (e.code === 'KeyF') return toggleFS();
  if (caseOpen()) {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); caseClose(); }
    return;
  }
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
    const p = { kind: 'half', side: halfOf(e.clientX), u: 0, x: e.clientX, y: e.clientY, t: performance.now() };
    if (barOn() && inBarZone(barL, e.clientX, e.clientY)) { p.kind = 'bar'; p.side = 1; p.u = barU(barL, e.clientX); }
    else if (e.pointerType === 'mouse') return mouseButtons(e);
    else if (barOn()) { p.kind = 'swipe'; p.side = 0; } // fuera de la barra solo se salta
    touches.set(e.pointerId, p);
    return;
  }
  if (!onCanvas(e) || caseOpen()) return;
  if (state === 'over' && stateT > 0.45) { retry(); if (e.pointerType === 'mouse') swallowMouse = true; }
  else if (state === 'revive') finish();
});
const lift = (e) => {
  if (touches.delete(e.pointerId) && e.pointerType === 'mouse') return; // arrastre de barra con ratón
  if (e.pointerType === 'mouse') mouseButtons(e);
};
addEventListener('pointerup', lift);
addEventListener('pointercancel', lift);
addEventListener('pointermove', (e) => {
  const p = touches.get(e.pointerId);
  if (!p) return e.pointerType === 'mouse' ? mouseButtons(e) : undefined;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if ((p.side || p.kind === 'swipe') && Math.abs(dy) >= 34 && Math.abs(dy) > Math.abs(dx) * 1.3 && performance.now() - p.t < 320) {
    p.side = 0; p.kind = 'swipe'; p.t = -1e9; flip(); // deslizar = SALTO; ese dedo deja de girar hasta soltarlo
  } else if (p.kind === 'bar') p.u = barU(barL, e.clientX);
  else if (p.side) p.side = halfOf(e.clientX);
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
addEventListener('resize', () => { R.resize(); barL = barLayout(innerWidth, innerHeight, save.settings.hand); });

// ── pantalla completa (botón ⛶ en los menús, F, o al jugar si está en Ajustes) ──
const fsEl = document.documentElement;
const fsReq = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
const fsExit = document.exitFullscreen || document.webkitExitFullscreen;
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
function toggleFS(want = !fsOn()) {
  if (want === fsOn()) return;
  if (!want) { try { fsExit.call(document)?.catch?.(() => {}); } catch { /* */ } return; }
  if (!fsReq) {
    if (!standalone) toast('En iPhone: <b>Compartir → Agregar a inicio</b> para jugar en pantalla completa');
    return;
  }
  try { fsReq.call(fsEl, { navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* */ }
}
function fsRefresh() {
  document.body.classList.toggle('fs', fsOn());
  $('btn-fs').classList.toggle('hidden', !!standalone && !fsReq);
  $('btn-fs-set').textContent = fsOn() ? 'SALIR DE PANTALLA COMPLETA' : 'PANTALLA COMPLETA';
}
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, fsRefresh);
$('btn-fs').onclick = () => { A.init(); A.fx('click'); toggleFS(); };
$('btn-fs-set').onclick = () => { A.fx('click'); toggleFS(); };

// ── partida ──
function startRun(m) {
  A.init();
  if (m === 'hiper' && !save.unlocked.hiper) { toast('🔒 HIPER: llegá a 30 s en NORMAL o a nivel 6'); A.fx('lost'); return; }
  if (save.settings.fsAuto) toggleFS(true);
  hot = state === 'over' && clock < hotUntil ? Math.min(HOT_MAX, hot + 1) : 0;
  if (hot) toast(`🔥 EN LLAMAS ×${hotMul().toFixed(1).replace('.', ',')} ✦`, 'hot');
  mode = m;
  sim = createSim({ seed: m === 'diario' ? M.dailySeed() : (Math.random() * 2 ** 31) | 0, mode: m });
  state = 'play'; stateT = 0; acc = 0; R.clear();
  revivesUsed = 0; recordBeaten = false; wasFever = false; missionT = 0;
  bestAtStart = { ...save.best[m] };
  barReset(bar, sim.a); bar.anim = null; touches.clear(); stageLeft = 99;
  show(null); document.body.classList.add('playing');
  document.body.classList.toggle('barra', barOn());
  A.mode('play'); A.stage(0); A.say(m === 'hiper' ? 'Hiper' : 'Comienza');
  fx.flash = 0.35; fx.zoom = 1.25;
  if (!save.tips.salto) {
    save.tips.salto = true; M.persist(save);
    toast(matchMedia('(pointer: coarse)').matches ? '💫 NUEVO: <b>deslizá ↕</b> para SALTAR al lado opuesto' : '💫 NUEVO: <b>espacio</b> o <b>rueda</b> para SALTAR al lado opuesto', 'lv');
  } else if (barOn() && !save.tips.barra) {
    save.tips.barra = true; M.persist(save);
    toast('🎚 BARRA: <b>tocá una sección</b> para ir a ese lado · el centro es donde estás · <b>deslizá ↕</b> para SALTAR y recentrar', 'lv');
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
      A.stageUp(); A.stage(e.stage); A.say(st.name.toLowerCase(), e.stage >= 5 ? 3 : 2);
      R.pop(st.name, '#ffffff', 2.2);
      fx.flash = 0.6; fx.zoom = 1.18; fx.shake = 10; buzz(40);
    } else if (e.type === 'fever') {
      A.fx('fever'); A.fever(true); A.say('¡Fiebre!', 2);
      R.pop('¡FIEBRE! ×2', '#ff2f5b', 2);
      fx.flash = 0.4; fx.zoom = 1.12; buzz([20, 40, 20]);
    } else if (e.type === 'salto') {
      R.salto(e.from, e.to, col);
      // la barra se recentra: los dedos que la usaban tienen que volver a tocar
      barFlip(bar, e.from, e.to);
      for (const p of touches.values()) if (p.kind === 'bar') p.side = 0;
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
      if (pelo) { fx.slow = 0.3; fx.slowT = 0.3; A.say('¡Por un pelo!', 2); buzz([15, 30, 40]); } else buzz(15);
    } else if (e.type === 'listo') {
      A.fx('ready');
    } else if (e.type === 'combo-lost') {
      A.fx('lost'); R.pop(`combo ${e.combo} perdido`, 'rgba(255,255,255,.6)', 0.3);
    } else if (e.type === 'dead') die();
  }
  if (wasFever && !sim.fever) A.fever(false);
  wasFever = sim.fever;
  if (!recordBeaten && bestAtStart.score > 0 && sim.score > bestAtStart.score) {
    recordBeaten = true; A.fx('record'); A.say('¡Nuevo récord!', 3);
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
  barReset(bar, sim.a); touches.clear();
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
  if (res.unlocks.length) A.say('Desbloqueado', 2);
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
  show('title'); refreshTitle(); refreshHint(); A.mode('title');
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

// Cofre al estilo caja de CS:GO: una tira de premios pasa bajo el marcador, frena y cae en el
// premio (que ya se pagó en M.openChest). Tocar o espacio salta al final.
const CARD_W = 104, CARDS = 52, WIN_AT = 44, SPIN_T = 5.6;
const LVL = { 'COMÚN': 0, 'RARO': 1, 'ÉPICO': 2, 'LEGENDARIO': 3, 'JACKPOT': 3 };
const prizeLabel = (p) => (p.skin ? p.skin.name : `✦ ${fmtN(p.coins)}`);
function cardHtml(p, win) {
  const k = p.skin, c = k && (k.color === 'glitch' ? '#e8fffe' : k.color);
  const ic = k ? `<div class="sw ${k.color === 'glitch' ? 'glitch' : ''}" style="--c:${c}"></div>` : '<div class="ic">✦</div>';
  return `<div class="card r-${p.tier}${win ? ' win' : ''}">${ic}<b>${k ? k.name : fmtN(p.coins)}</b><small>${p.tier}</small></div>`;
}
let caseRun = null; // { t0, x0, x1, idx, stop, done, prize }
function openChest() {
  if (caseRun && !caseRun.done) return;
  const prize = M.openChest(save);
  if (!prize) return;
  A.init();
  const modal = $('chestmodal'), box = $('cm-box'), strip = $('cm-strip'), reel = strip.parentElement;
  const items = Array.from({ length: CARDS }, () => M.chestDecoy());
  items[WIN_AT] = prize;
  // a veces el de al lado es de lo mejor: el «casi» también se ve
  if (LVL[prize.tier] < 2 && Math.random() < 0.4) items[WIN_AT + (Math.random() < 0.5 ? -1 : 1)] = M.chestDecoy(Math.random() < 0.3 ? 'JACKPOT' : 'LEGENDARIO');
  strip.innerHTML = items.map((p, i) => cardHtml(p, i === WIN_AT)).join('');
  modal.classList.remove('hidden');
  box.className = 'box case'; reel.classList.remove('done');
  $('cm-roll').textContent = ''; $('cm-tier').textContent = '';
  // el marcador cae en cualquier punto de la carta ganadora (sin tocar los bordes)
  const mid = reel.clientWidth / 2, off = (Math.random() - 0.5) * (CARD_W - 8) * 0.86;
  const x0 = mid - CARD_W * (2 + Math.random()), x1 = mid - (WIN_AT * CARD_W + 48 + off);
  strip.style.transform = `translateX(${x0}px)`;
  A.fx('unlock');
  caseRun = { t0: performance.now() + 250, x0, x1, mid, idx: -1, done: false, prize, stop: A.spin(SPIN_T + 0.25) };
  requestAnimationFrame(caseFrame);
}
function caseFrame() {
  const c = caseRun; if (!c || c.done) return;
  const k = Math.max(0, Math.min(1, (performance.now() - c.t0) / 1000 / SPIN_T));
  const x = c.x0 + (c.x1 - c.x0) * (1 - Math.pow(1 - k, 4));
  $('cm-strip').style.transform = `translateX(${x}px)`;
  const idx = Math.floor((c.mid - x + 4) / CARD_W); // +4: el hueco entre cartas
  if (idx !== c.idx) {
    c.idx = idx;
    if (k > 0) { A.fx('tick'); const m = document.querySelector('#chestmodal .marker'); m.classList.remove('tk'); void m.offsetWidth; m.classList.add('tk'); }
  }
  if (k >= 1) caseReveal(); else requestAnimationFrame(caseFrame);
}
function caseSkip() {
  const c = caseRun; if (!c || c.done) return;
  c.t0 = performance.now() - SPIN_T * 1000; caseFrame();
}
function caseReveal() {
  const c = caseRun; c.done = true; c.stop();
  const p = c.prize, lvl = LVL[p.tier];
  $('cm-strip').style.transform = `translateX(${c.x1}px)`;
  $('cm-strip').parentElement.classList.add('done');
  $('cm-box').className = `box case won r-${p.tier}`;
  $('cm-roll').textContent = prizeLabel(p);
  $('cm-tier').textContent = p.tier;
  $('cm-again').classList.toggle('hidden', !save.chest.ready);
  $('cm-again').textContent = `ABRIR OTRO${save.chest.ready > 1 ? ` (${save.chest.ready})` : ''}`;
  const f = document.createElement('div'); f.className = `flashw r-${p.tier}`;
  document.body.appendChild(f); setTimeout(() => f.remove(), 700);
  A.fx('chest');
  if (lvl) { A.fx('record'); A.say(p.tier.toLowerCase(), lvl); } else A.stinger(1);
  buzz(lvl >= 3 ? [30, 40, 30, 40, 80] : lvl ? [20, 30, 40] : 25);
  refreshCoins();
}
const caseOpen = () => !$('chestmodal').classList.contains('hidden');
function caseClose() {
  if (caseRun && !caseRun.done) return caseSkip();
  $('chestmodal').classList.add('hidden'); A.fx('click'); renderChest(); if (state === 'title') refreshTitle();
}
$('chestmodal').addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) caseSkip(); });
$('cm-ok').onclick = caseClose;
$('cm-again').onclick = () => { A.fx('click'); openChest(); };
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
  renderSegs(); fsRefresh();
  renderStats();
};
// Opciones de varias: botones con data-v dentro de un .seg[data-set]
function renderSegs() {
  for (const g of document.querySelectorAll('[data-set]')) {
    for (const b of g.querySelectorAll('[data-v]')) b.classList.toggle('on', save.settings[g.dataset.set] === b.dataset.v);
  }
  $('o-hand').classList.toggle('hidden', !barOn());
}
for (const g of document.querySelectorAll('[data-set]')) {
  g.onclick = (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    save.settings[g.dataset.set] = b.dataset.v; M.persist(save); A.fx('click');
    barL = barLayout(innerWidth, innerHeight, save.settings.hand);
    renderSegs(); refreshHint();
  };
}
function refreshHint() {
  $('hint-touch').innerHTML = barOn()
    ? 'en el teléfono: <b>arrastrá en la barra</b> de abajo (cada sección es un lado) · <b>deslizá ↕</b> para SALTAR'
    : 'en el teléfono: tocá a la izquierda o a la derecha · <b>deslizá ↕</b> para SALTAR';
}
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
let stageLeft = 99;
const barTarget = () => { for (const p of touches.values()) if (p.kind === 'bar' && p.side) return p.u; return null; };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt; stateT += dt;
  if (fx.slowT > 0) fx.slowT -= dt; else fx.slow = 1;

  if (state === 'play' || state === 'title') {
    acc += dt * fx.slow;
    while (acc >= DT) {
      acc -= DT;
      step(sim, state === 'title' ? botDir(sim, true) : inputDir());
      handleEvents();
      barTrack(bar, sim.a);
      if (state !== 'play' && state !== 'title') break;
    }
    if (state === 'title' && sim.dead) sim = attract();
    if (state === 'play') {
      // cuenta regresiva a la próxima etapa: 3, 2, 1
      const nxt = STAGES[sim.stage + 1], left = nxt ? Math.ceil(nxt.t - sim.t) : 99;
      if (left < stageLeft && left <= 3 && left >= 1) A.fx('tick');
      stageLeft = left;
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
    bar: barOn() && (state === 'play' || state === 'dying') ? { L: barL, b: bar, target: barTarget() } : null,
  });
  requestAnimationFrame(frame);
}

// primera visita del día: premio por racha apenas se abre
const bonus = M.dailyLogin(save);
toTitle(); fsRefresh();
if (bonus) setTimeout(() => toast(`🔥 Racha de ${save.streak.n} ${save.streak.n === 1 ? 'día' : 'días'} · <b>+${bonus} ✦</b>`), 400);
requestAnimationFrame(frame);

window.__vortice = {
  sim: () => sim, save, state: () => state, start: startRun, A,
  // simula `seg` segundos sin rAF (con el piloto automático si bot)
  advance(seg, bot = true) {
    for (let i = 0; i < seg / DT && state === 'play'; i++) { step(sim, bot ? botDir(sim, true) : inputDir()); handleEvents(); barTrack(bar, sim.a); }
  },
  bar: () => ({ ...bar, L: barL, target: barTarget() }),
  fs: toggleFS,
  side: () => sideOf(sim.a),
  flip,
  input: () => ({ dir: inputDir(), keys: { ...keys }, mouse: { ...mouse }, touches: [...touches.values()] }),
};
