// ABISMO — main.js: flujo (título → Descenso → muerte/victoria → elección de
// reliquia → próximo Descenso), bucle, entrada (joystick flotante) y HUD.
// window.__abismo para depurar y para la grabación de la portada.
import { createSim, step, applyUpgrade, mulberry32 } from './sim.js';
import { RELICS, REQ_NAME, BOSS_AT, ARENA } from './data.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import * as M from './meta.js';

const $ = (id) => document.getElementById(id);
const R = createRenderer($('game'));
const A = createAudio();
const save = M.load();
for (const k of ['music', 'sfx', 'shake', 'vibrate']) if (save.settings[k] !== undefined) A.opt[k] = save.settings[k];
M.dailyMissions(save);

let state = 'title'; // title | play | choices | relic | over | win
let sim = null, paused = false;
let acc = 0, last = performance.now(), clock = 0;
const fx = { shake: 0, flash: 0, hurt: 0, skin: (M.SKINS.find((k) => k.id === save.skin) || M.SKINS[0]).color };
const show = (id) => { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id); };
const buzz = (ms) => { if (save.settings.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* */ } };

function startDescent() {
  sim = createSim({ seed: (Date.now() % 2147483647) | 0, profile: { relics: save.relics, descents: save.descents, corruption: save.corruption } });
  state = 'play'; paused = false;
  $('hud').classList.remove('hidden');
  $('bossbar').classList.add('hidden');
  $('choices').classList.add('hidden');
  $('btn-pause').classList.remove('hidden');
  updateHud();
  show(null);
  $('btn-resume') && ($('btn-resume').textContent = 'DESCENDER');
}

function endDescent(won) {
  if (!sim) return;
  state = won ? 'win' : 'over';
  const before = M.endDescent(save, { dead: !won, won, time: sim.t, score: sim.score, kills: sim.kills, souls: sim.soulsGot });
  // elección de reliquia (1 de 3, determinista por la semilla + descents)
  const rng = mulberry32((sim.seed ^ (before.descents + 1) * 2654435761) >>> 0);
  const picks = M.relicChoices(save, rng);
  $('relic-list').innerHTML = picks.map((r, i) => `
    <button class="relic" data-i="${i}" style="--c:${r.color}">
      <span class="ri">${r.icon}</span><b>${r.name}</b><small>${r.desc}</small>
      <i>${r.req ? REQ_NAME[r.req] : 'Desde el inicio'}</i>
    </button>`).join('');
    document.querySelectorAll('#relic-list .relic').forEach((b) => b.addEventListener('click', () => {
      const r = picks[+b.dataset.i];
      if (!save.relics.includes(r.id)) save.relics.push(r.id);
      M.persist(save);
      if (won) A.win(); else A.die();
      show('title'); refreshTitle();
    }));
  // texto del fin
  $('over-title').textContent = won ? 'EL GUARDIÁN CAYÓ' : 'LA TINTA TE CUBRIÓ';
  $('over-sub').textContent = won
    ? `Descenso ${before.descents + 1} completado. El Abismo se abre de nuevo, más oscuro (NG+${before.descents + 1}).`
    : `Sobreviviste ${Math.floor(sim.t)} s · ${sim.kills} enemigos · ${sim.soulsGot} almas.`;
  $('over-stats').innerHTML = `
    <div><b>${Math.floor(sim.t)} s</b><small>tiempo</small></div>
    <div><b>${sim.kills}</b><small>abatidos</small></div>
    <div><b>${sim.soulsGot}</b><small>almas</small></div>
    <div><b>${save.descents}</b><small>Descensos</small></div>`;
  $('best').textContent = `Mejor: ${save.bestTime} s · ${save.bestScore} pts · Corrupción ${save.corruption}`;
  $('btn-pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  show('relic');
}

function refreshTitle() {
  $('t-best').textContent = save.bestTime ? `Mejor Descenso: ${save.bestTime} s` : 'Sin registrar';
  $('t-desc').textContent = `Descensos: ${save.descents} · Corrupción: ${save.corruption} · Reliquias: ${save.relics.length}`;
  $('t-relics').textContent = save.relics.length
    ? save.relics.map((id) => (RELICS.find((r) => r.id === id) || {}).name || id).join(' · ')
    : 'Sin reliquias todavía. Morí y elegí.';
  $('t-missions').innerHTML = save.missions.map((m) => `<li class="${m.done ? 'done' : ''}">${m.done ? '✓' : ''} ${m.text}</li>`).join('');
  $('t-coins').textContent = save.coins;
  $('btn-chest').style.display = save.descents > 0 ? '' : 'none';
  $('chest-n').textContent = save.chests > save.chestsOpened ? `COFRE ×${save.chests - save.chestsOpened}` : 'COFRE';
  $('best').textContent = `Mejor: ${save.bestTime} s · ${save.bestScore} pts · Corrupción ${save.corruption}`;
}

// ── entrada: joystick flotante (una mano, cualquier lado de la pantalla) ──
const keys = { x: 0, y: 0 };
const touch = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
const joyEl = $('joy');
addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.x = -1;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.x = 1;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.y = -1;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.y = 1;
  if (e.code === 'KeyF') toggleFS();
  if (e.code === 'Escape' && state === 'play') togglePause();
  if (state === 'title' && (e.code === 'Space' || e.code === 'Enter')) startDescent();
  if (state === 'play' && sim && sim.choices && e.code.startsWith('Digit')) {
    const i = +e.code.slice(5) - 1;
    if (sim.choices[i]) { applyUpgrade(sim, sim.choices[i]); A.pick(); state = 'play'; updateChoices(); }
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.x = 0;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.x = 0;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.y = 0;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.y = 0;
});
addEventListener('pointerdown', (e) => {
  A.init();
  if (state !== 'play' || e.target.closest('button, .screen, #hud, #choices')) return;
  touch.active = true; touch.id = e.pointerId;
  touch.ox = e.clientX; touch.oy = e.clientY; touch.x = 0; touch.y = 0;
  joyEl.classList.remove('hidden');
  joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px';
});
addEventListener('pointermove', (e) => {
  if (!touch.active || e.pointerId !== touch.id) return;
  const dx = e.clientX - touch.ox, dy = e.clientY - touch.oy;
  const d = Math.hypot(dx, dy) || 1, max = 48;
  const cl = Math.min(d, max);
  touch.x = dx / d * (cl / max); touch.y = dy / d * (cl / max);
  $('joyKnob').style.transform = `translate(${dx / d * cl}px, ${dy / d * cl}px)`;
});
addEventListener('pointerup', (e) => { if (e.pointerId === touch.id) { touch.active = false; touch.x = touch.y = 0; joyEl.classList.add('hidden'); }});
addEventListener('pointercancel', () => { touch.active = false; touch.x = touch.y = 0; joyEl.classList.add('hidden'); });
let botInput = null; // lo usa la grabación de la portada (__abismo.input)
function inputVec() {
  if (botInput) return botInput;
  if (touch.active) return { x: touch.x, y: touch.y };
  return { x: keys.x, y: keys.y };
}

function handleEvents() {
  for (const ev of sim.ev) {
    if (ev.k === 'hurt') { fx.hurt = 1; fx.shake = Math.max(fx.shake, 6); A.hurt(); buzz(40); }
    if (ev.k === 'kill') { A.hit(); }
    if (ev.k === 'crit') { A.crit(); fx.flash = Math.max(fx.flash, 0.5); }
    if (ev.k === 'level') { A.level(); fx.flash = 0.8; }
    if (ev.k === 'boss') { A.boss(); fx.shake = 14; buzz(120); }
    if (ev.k === 'bosskill') { A.win(); }
    if (ev.k === 'die') { A.die(); buzz(200); }
  }
  sim.ev.length = 0;
}

function updateChoices() {
  const c = sim && sim.choices;
  if (!c) { $('choices').classList.add('hidden'); return; }
  state = 'choices';
  $('choices').classList.remove('hidden');
  $('ch-list').innerHTML = c.map((ch, i) => `
    <button class="choice" data-i="${i}" style="--c:${ch.color}">
      <span class="ci">${ch.icon}</span><b>${ch.name}</b><small>${ch.desc}</small>
      <i>${ch.new ? 'NUEVA' : ''}${ch.type === 'passive' ? 'PASIVA' : 'ARMA'} · ${i + 1}</i>
    </button>`).join('');
  document.querySelectorAll('#ch-list .choice').forEach((b) => b.addEventListener('click', () => {
    applyUpgrade(sim, sim.choices[+b.dataset.i]);
    A.pick(); state = 'play'; updateChoices();
  }));
}

function updateHud() {
  if (!sim) return;
  $('h-hp').style.width = `${Math.max(0, (sim.hp / sim.maxhp) * 100)}%`;
  $('h-hpn').textContent = `${Math.ceil(sim.hp)}/${sim.maxhp}`;
  $('h-lvl').textContent = `NIV ${sim.level}`;
  $('h-xp').style.width = `${Math.min(100, (sim.xp / sim.xpNeed) * 100)}%`;
  $('h-kills').textContent = sim.kills;
  $('h-time').textContent = `${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')}`;
  $('h-cor').textContent = save.corruption;
  if (sim.bossAt && sim.boss && !sim.boss.dead) {
    $('bossbar').classList.remove('hidden');
    $('boss-hp').style.width = `${Math.max(0, (sim.boss.hp / sim.boss.maxhp) * 100)}%`;
    $('boss-sub').textContent = sim.boss.phase === 1 ? 'GUARDIÁN DEL UMBRAL' : 'EL GUARDIÁN SE ENLOQUECE';
  } else $('bossbar').classList.add('hidden');
  $('ring-hint').textContent = sim.bossAt ? 'Jefe: sin pausa, el aire quema' : `Guardián en ${Math.max(0, Math.ceil(BOSS_AT - sim.t))} s`;
}

// ── pantalla completa / pausa / menú ──
function toggleFS() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch { /* iPhone: sin API */ }
}
function togglePause() {
  if (state !== 'play') return;
  paused = !paused;
  $('pause').classList.toggle('hidden', !paused);
}
$('btn-fs').addEventListener('click', toggleFS);
$('btn-start').addEventListener('click', () => { A.init(); startDescent(); });
$('btn-pause').addEventListener('click', togglePause);
$('btn-resume').addEventListener('click', () => { $('pause').classList.add('hidden'); paused = false; });
$('btn-restart').addEventListener('click', () => { $('pause').classList.add('hidden'); paused = false; startDescent(); });
$('btn-quit').addEventListener('click', () => { $('pause').classList.add('hidden'); state = 'title'; paused = false; $('hud').classList.add('hidden'); $('btn-pause').classList.add('hidden'); show('title'); refreshTitle(); });
$('btn-chest').addEventListener('click', () => {
  if (save.chests <= save.chestsOpened) { alert('Todavía no tenés cofres nuevos. Completá un Descenso.'); return; }
  save.chestsOpened++;
  const bonus = 80 + Math.floor(Math.random() * 120);
  save.coins += bonus; save.fitcoins += bonus;
  M.persist(save); A.level();
  alert(`Cofre del Descenso: +${bonus} monedas`);
  refreshTitle();
});
$('btn-skins').addEventListener('click', () => { show('skins'); renderSkins(); });
function renderSkins() {
  $('sk-list').innerHTML = M.SKINS.map((k) => {
    const owned = save.owned.includes(k.id);
    const afford = save.coins >= k.cost;
    const locked = k.cond && !k.cond(save);
    return `<button class="skin ${save.skin === k.id ? 'on' : ''}" data-id="${k.id}" style="--c:${k.color}" ${!owned && (!afford || locked) ? 'disabled' : ''}>
      <span class="si"></span><b>${k.name}</b><small>${locked ? k.req : owned ? k.desc : `${k.cost} monedas`}</small>
    </button>`;
  }).join('');
  document.querySelectorAll('#sk-list .skin').forEach((b) => b.addEventListener('click', () => {
    const k = M.SKINS.find((x) => x.id === b.dataset.id);
    if (!save.owned.includes(k.id)) { save.coins -= k.cost; save.owned.push(k.id); }
    save.skin = k.id; M.persist(save);
    fx.skin = k.color; renderSkins();
  }));
  $('sk-back').onclick = () => { show('title'); refreshTitle(); };
}
$('btn-settings').addEventListener('click', () => {
  show('settings');
  const s = save.settings;
  $('set-music').checked = s.music; $('set-sfx').checked = s.sfx;
  $('set-shake').checked = s.shake; $('set-vib').checked = s.vibrate;
  $('set-fs').checked = s.fsAuto;
});
$('set-music').addEventListener('change', (e) => { save.settings.music = e.target.checked; A.setMusic(e.target.checked); M.persist(save); });
$('set-sfx').addEventListener('change', (e) => { save.settings.sfx = e.target.checked; A.setSfx(e.target.checked); M.persist(save); });
$('set-shake').addEventListener('change', (e) => { save.settings.shake = e.target.checked; M.persist(save); });
$('set-vib').addEventListener('change', (e) => { save.settings.vibrate = e.target.checked; M.persist(save); });
$('set-fs').addEventListener('change', (e) => { save.settings.fsAuto = e.target.checked; M.persist(save); });
$('set-back').addEventListener('click', () => { show('title'); refreshTitle(); });

// ── bucle ──
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play' && sim && !paused) {
    acc += dt;
    while (acc >= 1 / 60) {
      step(sim, inputVec(), 1 / 60);
      handleEvents();
      if (sim.choices) { updateChoices(); break; }
      if (sim.dead || sim.won) break;
      acc -= 1 / 60;
    }
    if (sim.dead || sim.won) endDescent(sim.won);
    updateHud();
  }
  // fx decae siempre
  fx.shake *= 0.88; fx.flash *= 0.9; fx.hurt *= 0.9;
  R.draw(sim || { p: { x: 0, y: 0 }, souls: [], foes: [], shots: [], waves: [], hits: [], parts: [], runes: [], weapons: [], minion: null, boss: null, magnet: 130, inv: 0 }, fx);
  requestAnimationFrame(frame);
}

// title background: simulación "atracción" (la arena respirando sola)
function attract() {
  const s = createSim({ seed: 42, profile: { relics: [], descents: save.descents, corruption: save.corruption } });
  s.t = 12; // horda visible de fondo
  for (let i = 0; i < 10; i++) step(s, { x: Math.sin(i), y: Math.cos(i) }, 1 / 60);
  return s;
}
sim = attract();
refreshTitle();
show('title');

// depuración / grabación de la portada
window.__abismo = {
  start: () => startDescent(),
  advance: (secs, bot = true) => {
    if (state === 'title') startDescent();
    if (state !== 'play') return;
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      let inp = { x: 0, y: 0 };
      if (bot) {
        // huye del peligro cercano y va a juntar almas cuando no hay nada encima
        let bd = 1e18, bf = null;
        for (const f of sim.foes) { const d = (f.x - sim.p.x) ** 2 + (f.y - sim.p.y) ** 2; if (d < bd) { bd = d; bf = f; } }
        let tx = null, ty = null;
        if (sim.boss && !sim.boss.dead) { tx = sim.boss.x; ty = sim.boss.y; }
        else if (sim.souls.length) {
          let sd = 1e18;
          for (const so of sim.souls) { const d = (so.x - sim.p.x) ** 2 + (so.y - sim.p.y) ** 2; if (d < sd) { sd = d; tx = so.x; ty = so.y; } }
        }
        const danger = bf && Math.sqrt(bd) < 260;
        if (danger) { inp.x = sim.p.x - bf.x; inp.y = sim.p.y - bf.y; }
        else if (tx !== null) { inp.x = tx - sim.p.x; inp.y = ty - sim.p.y; }
        const m = Math.hypot(inp.x, inp.y) || 1;
        if (m > 8) inp = { x: inp.x / m, y: inp.y / m }; else inp = { x: 0, y: 0 };
      }
      step(sim, inp, 1 / 60);
      if (sim.choices) applyUpgrade(sim, sim.choices[0]);
      if (sim.dead || sim.won) { endDescent(sim.won); break; }
    }
    handleEvents();
  },
  state: () => state,
  sim: () => sim,
  input: (v) => { botInput = v; },
  save,
  showcase() {
    startDescent();
    this.advance(14);
    // deja la horda adentro, dorado a la vista
    updateHud();
  },
};
requestAnimationFrame(frame);
