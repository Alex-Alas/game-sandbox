/* ELYTRA — bucle principal, estados, entrada y HUD. */
import * as THREE from 'three';
import { CFG, QUALITY, PRESETS, PRESET_ORDER } from './config.js';
import { loadAssets, CHARACTERS } from './assets.js';
import { initPhysics, stepPhysics, syncDynamic, phys, castPlayer } from './physics.js';
import { buildWorld, updateWorld, updateSunShadow, updateCulling, world, knockedCount, resetArena } from './world.js';
import { buildCharacter, poseFlight, wingTips } from './character.js';
import { spawnRagdoll, updateRagdoll, clearRagdoll, ragdoll, handleContactForces, ragdollCenter } from './ragdoll.js';
import {
  player, resetPlayer, stepFlight, updateBank, tryBoost, tryFlap, tryBarrelRoll, addCrystal, forwardVector,
} from './player.js';
import {
  cam, addTrauma, updateFlightCamera, updateRagdollCamera, startRagdollCamera, orbitInput, zoomInput, updateAttractCamera,
} from './camera.js';
import { course, checkGates, resetCourse, animateCourse, fmtTime, MEDALS, medalFor, nextMedal, pathSegments } from './course.js';
import { COURSES, COURSE_ORDER, saveCourse, urlWith } from './courses.js';
import { atmo, applyTime, TIMES, TIME_ORDER } from './atmosphere.js';
import { hasWind, windAt, gustAt } from './wind.js';
import {
  isDesplome, dsp, armAttempt, crashAttempt, resetAttempt, scoreAttempt, medalForPoints, nextMedalPoints,
  ARMED_TIMEOUT, SETTLE_TIMEOUT,
} from './desplome.js';
import { fx, initEffects, updateEffects, updateStreaks, burst, dustPuff, setParticleScale } from './effects.js';
import { initAudio, updateWind, sfx, toggleMute } from './audio.js';
import { surfaceHeight } from './terrain.js';
import { setDetailDistance } from './materials.js';
import { mouseToRadians, settleMouse, stepSens, sensLabel } from './mouse.js';
import { ghost, initGhost, ghostStart, ghostRecord, ghostFinish, ghostCancel, updateGhost, toggleGhost } from './ghost.js';
import { autopilot, steerAutopilot } from './autopilot.js';
import {
  style, WINDOW, initStyle, styleStart, styleCancel, trick, comboValue, styleUpdate, styleBreak, styleFinish,
} from './style.js';

/* ── Render ──────────────────────────────────────────────── */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.msaa, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.3, 9000);

/* Resolución adaptativa: si el frame tarda más de lo que permiten ~60 fps se baja el
   pixel ratio (hasta QUALITY.minScale) y con margen se vuelve a subir. Si una subida
   provoca una bajada enseguida, esa escala queda vetada un rato para no oscilar. */
const res = { scale: 1, avg: 16.7, timer: 0, clock: 0, hold: 0, lastUp: -99, ceil: 1, ceilUntil: 0 };

function applyResolution() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.pixelRatio) * res.scale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  setParticleScale(renderer.domElement.height);
}

function adaptResolution(frameMs) {
  if (frameMs > 100) return; // pestaña oculta, depurador, carga…
  res.clock += frameMs / 1000;
  res.timer += frameMs / 1000;
  res.avg += (frameMs - res.avg) * 0.08;
  if (res.timer < 0.6) return;
  res.timer = 0;
  let s = res.scale;
  if (res.avg > 19 && s > QUALITY.minScale) {
    if (res.clock - res.lastUp < 3) { res.ceil = s - 0.05; res.ceilUntil = res.clock + 30; }
    s = Math.max(QUALITY.minScale, s - (res.avg > 26 ? 0.15 : 0.07));
    res.hold = res.clock + 3;
  } else if (res.avg < 17.6 && s < 1 && res.clock > res.hold) {
    const cap = res.clock < res.ceilUntil ? res.ceil : 1;
    if (s + 0.05 <= cap + 1e-6) { s = Math.min(1, s + 0.05); res.lastUp = res.clock; res.hold = res.clock + 1.5; }
  }
  if (s !== res.scale) { res.scale = s; applyResolution(); }
}

function resize() {
  applyResolution();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ── Estado ──────────────────────────────────────────────── */
const state = {
  mode: 'loading',   // loading | title | fly | crash
  time: 0,
  slowmo: 0,
  crystals: 0,
  nears: 0,
  crashImpact: 0,
  shownDamage: 0,
  skin: 0,
  lastScrapeSfx: 0,
  sprintDone: false, // sprint terminado: R/T vuelven a la salida
  restartAt: 0,      // instante (state.time) del reinicio automático tras la meta de un sprint
  spawnT: 0,         // instante de la última aparición (reloj del viento fuera de carrera)
  gustOn: false,
};
let rig = null;
const keys = Object.create(null);
let pointerLocked = false;
let hadLock = false;
let debugAdvancing = false;
let mouseDown = false;

const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'), speed: $('speed'), speedbar: $('speedbar'), energybar: $('energybar'), mode: $('mode'),
  alt: $('alt'), vario: $('vario'), gload: $('gload'), racetime: $('racetime'), gatecount: $('gatecount'),
  besttime: $('besttime'), split: $('split'), zone: $('zone'), callout: $('callout'), gatemark: $('gatemark'),
  gatedist: $('gatedist'), stall: $('stall'), crystals: $('crystals'), nears: $('nears'), hint: $('hint'),
  vignette: $('vignette'), flash: $('flash'), loading: $('loading'), loadbar: $('loadbar'), loadmsg: $('loadmsg'),
  overlay: $('overlay'), skinName: $('skinName'), crashpanel: $('crashpanel'), crashtitle: $('crashtitle'),
  cDamage: $('cDamage'), cFract: $('cFract'), cBounce: $('cBounce'), cDist: $('cDist'), cImpact: $('cImpact'),
  crashcta: $('crashcta'), finishpanel: $('finishpanel'), finishtitle: $('finishtitle'), finishtime: $('finishtime'),
  finishsub: $('finishsub'), pause: $('pause'), perf: $('perf'), qualName: $('qualName'), sensName: $('sensName'),
  target: $('target'), finishmedal: $('finishmedal'), records: $('records'), courseName: $('courseName'),
  timeName: $('timeName'), cScore: $('cScore'), windrow: $('windrow'), windarrow: $('windarrow'), windval: $('windval'),
  combo: $('combo'), cnames: $('cnames'), cmult: $('cmult'), cpts: $('cpts'), cbar: $('cbar'),
  comboresult: $('comboresult'), stylescore: $('stylescore'), finishstyle: $('finishstyle'),
};

/* ── Avisos temporales ───────────────────────────────────── */
const timers = {};
function pulse(node, cls, ms, key) {
  node.classList.add(cls);
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => node.classList.remove(cls), ms);
}
function callout(text, color = 'var(--gold)', ms = 900) {
  el.callout.textContent = text;
  el.callout.style.color = color;
  pulse(el.callout, 'on', ms, 'callout');
}
function zoneBanner(text) {
  el.zone.textContent = text;
  pulse(el.zone, 'on', 2200, 'zone');
}
function flash() {
  el.flash.classList.add('on');
  setTimeout(() => el.flash.classList.remove('on'), 70);
}

/* ── Combos de estilo ────────────────────────────────────── */
const fmtPts = (v) => Math.round(v).toLocaleString('es');
const NEAR_ROLL = 12;   // m: tonel "al límite" (nearestObstacle mira hasta 14 m)

function onStyle(ev) {
  if (!ev) return;
  if (ev.type === 'bank') { sfx.comboBank(ev.mult); el.comboresult.textContent = `+${fmtPts(ev.value)} ESTILO`; }
  else { sfx.comboDrop(); el.comboresult.textContent = `COMBO PERDIDO −${fmtPts(ev.value)}`; }
  el.comboresult.className = ev.type;
  pulse(el.comboresult, 'on', 1400, 'comboresult');
}

/* ── Personaje ───────────────────────────────────────────── */
function setSkin(i) {
  state.skin = (i + CHARACTERS.length) % CHARACTERS.length;
  if (rig) scene.remove(rig.root);
  rig = buildCharacter(CHARACTERS[state.skin]);
  scene.add(rig.root);
  rig.root.visible = state.mode === 'fly' && cam.mode === 'third';
  el.skinName.textContent = 'PILOTO ' + CHARACTERS[state.skin].toUpperCase();
}

/* ── Entrada ─────────────────────────────────────────────── */
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F3') e.preventDefault();
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    stepSens(e.code === 'ArrowUp' ? 1 : -1);
    el.sensName.textContent = sensLabel();
    if (state.mode !== 'title') callout(sensLabel(), 'var(--cyan)', 700);
    return;
  }
  if (e.repeat) return;
  if (e.code === 'F3') { perf.on = !perf.on; el.perf.classList.toggle('hidden', !perf.on); return; }
  keys[e.code] = true;
  if (state.mode === 'title') {
    if (e.code === 'ArrowLeft') setSkin(state.skin - 1);
    if (e.code === 'ArrowRight') setSkin(state.skin + 1);
    return;
  }
  if (e.code === 'KeyM') callout(toggleMute() ? 'SONIDO OFF' : 'SONIDO ON', 'var(--cyan)');
  if (e.code === 'KeyG') callout(toggleGhost() ? 'FANTASMA ON' : 'FANTASMA OFF', 'var(--cyan)');
  if (e.code === 'KeyR') { if (dsp.phase === 'crashed') finishDesplome(); else if (state.sprintDone || isDesplome) restartRun(); else respawn(); }
  if (e.code === 'KeyT') restartRun();
  if (state.mode === 'fly') {
    if (e.code === 'Space' && tryFlap()) sfx.flap();
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && tryBoost()) { sfx.boost(); addTrauma(0.25); cam.fovKick = 6; }
    if ((e.code === 'KeyA' || e.code === 'KeyD') && tryBarrelRoll(e.code === 'KeyA' ? -1 : 1)) {
      sfx.roll();
      if (player.nearDist < NEAR_ROLL) trick('TONEL AL LÍMITE', 150);
    }
    if (e.code === 'KeyX') crash({ voluntary: true, pos: player.pos.clone(), vel: player.vel.clone(), normal: new THREE.Vector3(0, 1, 0), impact: 0 });
    if (e.code === 'KeyV') {
      cam.mode = cam.mode === 'third' ? 'first' : 'third';
      callout(cam.mode === 'third' ? '3ª PERSONA' : '1ª PERSONA', 'var(--cyan)');
    }
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; settleMouse(); });
window.addEventListener('focus', () => settleMouse());
document.addEventListener('visibilitychange', () => settleMouse());

document.addEventListener('mousemove', (e) => {
  if (state.mode === 'fly' && pointerLocked) {
    const d = mouseToRadians(e.movementX, e.movementY);
    if (!d) return;
    player.yaw -= d[0];
    player.pitch = THREE.MathUtils.clamp(player.pitch - d[1], -1.5, 1.5);
  } else if (state.mode === 'crash' && (pointerLocked || mouseDown)) {
    orbitInput(e.movementX, e.movementY);
  }
});
canvas.addEventListener('mousedown', () => { mouseDown = true; });
window.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('wheel', (e) => { if (state.mode === 'crash') zoomInput(e.deltaY); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) hadLock = true;
  settleMouse();
});

function lockPointer() {
  try { const r = canvas.requestPointerLock(); if (r?.catch) r.catch(() => {}); } catch { /* */ }
}

canvas.addEventListener('click', () => {
  if (state.mode === 'crash' && ragdoll.t > 0.8) {
    if (dsp.phase === 'crashed') finishDesplome(); else if (state.sprintDone || isDesplome) restartRun(); else respawn();
    return;
  }
  if (!pointerLocked && state.mode !== 'title') lockPointer();
});
$('skinPrev').addEventListener('click', (e) => { e.stopPropagation(); setSkin(state.skin - 1); });
$('skinNext').addEventListener('click', (e) => { e.stopPropagation(); setSkin(state.skin + 1); });

/* Cambiar el preset recarga la página (el MSAA solo se elige al crear el contexto). */
function cycleQuality(d) {
  const i = PRESET_ORDER.indexOf(QUALITY.id);
  const id = PRESET_ORDER[(i + d + PRESET_ORDER.length) % PRESET_ORDER.length];
  el.qualName.textContent = 'CALIDAD ' + PRESETS[id].label + ' · RECARGANDO…';
  location.replace(urlWith('q', id));
}
el.qualName.textContent = 'CALIDAD ' + QUALITY.label;
$('qualPrev').addEventListener('click', (e) => { e.stopPropagation(); cycleQuality(-1); });
$('qualNext').addEventListener('click', (e) => { e.stopPropagation(); cycleQuality(1); });

/* Cambiar de circuito también recarga: el mundo se construye para su trazado. */
function cycleCourse(d) {
  const i = COURSE_ORDER.indexOf(course.id);
  const id = COURSE_ORDER[(i + d + COURSE_ORDER.length) % COURSE_ORDER.length];
  saveCourse(id);
  el.courseName.textContent = COURSES.find((c) => c.id === id).name + ' · CARGANDO…';
  location.replace(urlWith('c', id));
}
el.courseName.textContent = course.name + ({ sprint: ' · SPRINT', loop: ' · VUELTA', desplome: ' · ARENA' }[course.kind] ?? '');
$('coursePrev').addEventListener('click', (e) => { e.stopPropagation(); cycleCourse(-1); });
$('courseNext').addEventListener('click', (e) => { e.stopPropagation(); cycleCourse(1); });

/* La hora del día cambia en vivo (solo visual: no separa récords). */
function cycleTime(d) {
  if (state.mode === 'loading') return;
  const i = TIME_ORDER.indexOf(atmo.id);
  applyTime(TIME_ORDER[(i + d + TIME_ORDER.length) % TIME_ORDER.length]);
  el.timeName.textContent = 'HORA ' + TIMES[atmo.id].label;
}
$('timePrev').addEventListener('click', (e) => { e.stopPropagation(); cycleTime(-1); });
$('timeNext').addEventListener('click', (e) => { e.stopPropagation(); cycleTime(1); });
el.sensName.textContent = sensLabel();
$('sensPrev').addEventListener('click', (e) => { e.stopPropagation(); stepSens(-1); el.sensName.textContent = sensLabel(); });
$('sensNext').addEventListener('click', (e) => { e.stopPropagation(); stepSens(1); el.sensName.textContent = sensLabel(); });
el.overlay.addEventListener('click', startGame);

function startGame() {
  if (state.mode !== 'title') return;
  initAudio();
  el.overlay.classList.add('hidden');
  el.hud.classList.remove('hidden');
  lockPointer();
  respawn(true);
}

/* ── Vuelo ───────────────────────────────────────────────── */
const FIXED = 1 / 120;
let flyAcc = 0;
const _prev = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _tipL = new THREE.Vector3();
const _tipR = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _col = new THREE.Color();

function flyUpdate(dt, rdt) {
  const input = {
    tuck: keys.KeyW || keys.ArrowUp,
    flare: keys.KeyS || keys.ArrowDown,
    bank: (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0),
  };
  if (autopilot.on) {
    autopilot.target = isDesplome && dsp.phase === 'armed' ? world.arena.center : null;
    Object.assign(input, steerAutopilot(dt));
  }
  if (hasWind) input.wind = windStep(rdt);
  flyAcc += dt;
  let steps = 0;
  while (flyAcc >= FIXED && steps++ < 16) {
    flyAcc -= FIXED;
    _prev.copy(player.pos);
    const ev = stepFlight(FIXED, input);
    const g = checkGates(_prev, player.pos, state.time);
    if (g) onGate(g);
    if (ev) {
      if (ev.type === 'crash') { crash(ev); return; }
      onFlightEvent(ev);
    }
  }
  if (steps >= 16) { flyAcc = 0; _prev.copy(player.pos); }
  // Render interpolado entre el último paso fijo y el actual (sin tirones a cualquier Hz)
  player.rpos.lerpVectors(_prev, player.pos, flyAcc / FIXED);
  updateBank(rdt, input);
  if (course.running) ghostRecord(state.time - course.t0, player);
  onStyle(styleUpdate(dt, player.nearDist < 9));

  // Cristales
  for (const c of world.crystals) {
    if (!c.userData.active) continue;
    if (c.position.distanceToSquared(player.pos) < 13 * 13) {
      c.userData.active = false;
      c.visible = false;
      c.userData.timer = 25;
      addCrystal();
      state.crystals++;
      trick('CRISTAL', 80, true);
      sfx.crystal();
      burst(c.position, 0xc86bff, 40, 30, 2.5, 0.9);
      callout('+ENERGÍA', 'var(--violet)');
      cam.fovKick = 5;
    }
  }

  // Visual del jugador
  rig.root.position.copy(player.rpos);
  rig.root.rotation.set(player.pitch, player.yaw, player.roll, 'YXZ');
  rig.root.visible = cam.mode === 'third';
  forwardVector(player.yaw, player.pitch, _fwd);
  const turn = THREE.MathUtils.clamp(player.bank, -1, 1);
  poseFlight(rig, {
    tuck: player.tuck, flare: player.flare, flap: player.flap, flapPhase: player.flapPhase,
    turn, speed: player.speed, time: state.time,
  });
  rig.root.updateMatrixWorld(true);

  // Estelas de las puntas de ala
  wingTips(rig, _tipL, _tipR);
  fx.trailL.push(_tipL);
  fx.trailR.push(_tipR);
  const trailOp = THREE.MathUtils.clamp((player.speed - 110) / 120, 0, 0.45) + THREE.MathUtils.clamp((player.g - 1.8) / 2.5, 0, 0.6) + player.boostFlash * 0.3;
  fx.trailL.update(camera.position, 0.08 + player.boostFlash * 0.12, trailOp);
  fx.trailR.update(camera.position, 0.08 + player.boostFlash * 0.12, trailOp);

  // Llama del impulso
  fx.flame.position.copy(player.rpos).addScaledVector(_fwd, -1.6);
  fx.flame.material.opacity = player.boostFlash * 0.9;
  fx.flame.scale.setScalar(2 + player.boostFlash * 7);
  if (player.boostFlash > 0.25) {
    _col.set(0xc86bff);
    for (let i = 0; i < 3; i++) {
      _tmp.copy(player.vel).multiplyScalar(0.6).addScaledVector(_fwd, -25).add(new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6));
      fx.add.emit(fx.flame.position, _tmp, _col, 1.2 + Math.random(), 0.45);
    }
  }

  // Polvo/espuma a ras de suelo
  if (player.groundDist < 11 && player.speed > 40 && Math.random() < 0.7) {
    const gy = surfaceHeight(player.pos.x, player.pos.z);
    _tmp.set(player.pos.x + (Math.random() - 0.5) * 3, gy + 0.5, player.pos.z + (Math.random() - 0.5) * 3);
    const water = gy <= CFG.WATER + 0.01;
    _col.set(water ? 0xe6f6ff : 0xa8957a);
    fx.dust.emit(_tmp, new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8),
      _col, 2 + Math.random() * 2.5, 1 + Math.random(), { grow: 5, drag: 2, grav: water ? 8 : -1, alpha: 0.6 });
  }
  // Destellos dentro de una térmica
  if (player.thermal > 0.2 && Math.random() < 0.4) {
    _col.set(0xfff3c4);
    _tmp.copy(player.pos).add(new THREE.Vector3((Math.random() - 0.5) * 14, -6, (Math.random() - 0.5) * 14));
    fx.add.emit(_tmp, new THREE.Vector3(0, 30, 0), _col, 1.2, 0.8);
  }

  updateStreaks(rdt, player.rpos, player.vel, player.speed, player.boostFlash);
  updateWind(player.speed + (hasWind ? _wind.length() * 1.5 : 0), rdt, player.scrape);
  updateFlightCamera(camera, rdt, state.time);
}

/* Viento del circuito: vector del frame (reloj de carrera, o desde la aparición antes
   de la salida), aviso de ráfaga y motas que viajan con él cerca de la cámara. */
const _wind = new THREE.Vector3();
const _mote = new THREE.Vector3();
function windStep(rdt) {
  const t = course.running ? state.time - course.t0 : state.time - state.spawnT;
  windAt(t, _wind);
  const g = gustAt(t);
  if (g > 0.6 && !state.gustOn) { state.gustOn = true; callout('¡RÁFAGA!', 'var(--cyan)', 700); addTrauma(0.1); }
  else if (g < 0.4) state.gustOn = false;
  if (Math.random() < (0.35 + g) * Math.min(1, rdt * 60)) {
    forwardVector(player.yaw, player.pitch, _fwd);
    _mote.copy(camera.position).addScaledVector(_fwd, 25 + Math.random() * 40)
      .add(_tmp.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 60));
    _col.set(0xeef6ff);
    fx.dust.emit(_mote, _tmp.copy(_wind).multiplyScalar(1.3), _col, 0.5 + Math.random() * 0.5, 1.6, { drag: 0, alpha: 0.35 + g * 0.3 });
  }
  return _wind;
}

function onFlightEvent(ev) {
  if (ev.type === 'scrape') {
    onStyle(styleBreak());
    burst(ev.pos, 0xffb05a, 6, 18, 0.9, 0.5, { base: player.vel.clone().multiplyScalar(0.4), grav: 20 });
    addTrauma(0.08 + ev.impact * 0.01);
    if (state.time - state.lastScrapeSfx > 0.2) { sfx.scrapeHit(); state.lastScrapeSfx = state.time; callout('¡ROCE!', 'var(--red)', 500); }
  } else if (ev.type === 'splash') {
    burst(ev.pos, 0xdff4ff, 30, 14, 2.5, 1.0, { dust: true, grav: 18, base: new THREE.Vector3(0, 10, 0) });
    sfx.thud(0.4);
    addTrauma(0.2);
    callout('¡REBOTE!', 'var(--cyan)');
    trick('REBOTE', 120);
  } else if (ev.type === 'near') {
    state.nears++;
    trick('RASANTE', Math.round(120 * ev.time));
    sfx.nearMiss();
    callout(`¡RASANTE! ${ev.time.toFixed(1)}s`, 'var(--cyan)');
  }
}

function onGate(g) {
  burst(g.pos, g.type === 'finish' ? 0x6bff9a : 0xffd23f, 60, 40, 3, 1.1);
  cam.fovKick = 7;
  addTrauma(0.12);
  sfx.gate(g.index % 12);
  if (g.zone) zoneBanner(g.zone);
  if (g.type === 'arena') {
    if (dsp.phase === 'idle') {
      armAttempt(state.time);
      callout('¡ESTRÉLLATE!', 'var(--red)', 1600);
      const c = world.arena.center;
      course.beam.position.set(c.x, c.y - 5, c.z);
      course.beam.material.color.set(0xff6b6b);
    }
    return;
  }
  if (g.delta != null) {
    el.split.textContent = (g.delta > 0 ? '+' : '−') + Math.abs(g.delta).toFixed(2);
    el.split.className = 'split on ' + (g.delta > 0 ? 'bad' : 'good');
    clearTimeout(timers.split);
    timers.split = setTimeout(() => el.split.classList.remove('on'), 1800);
  }
  if (g.type === 'start') {
    state.sprintDone = false;
    ghostStart(course.t0);
    styleStart();
    callout('¡CRONO EN MARCHA!', 'var(--gold)', 1200);
  }
  // Enlace del combo: puerta rápida (y mejor si es por el centro)
  const spd = player.vel.length();
  if (spd > 150) {
    const center = g.off < 5;
    trick(center ? 'PUERTA VELOZ AL CENTRO' : 'PUERTA VELOZ', 100 + Math.round((spd - 150) * 2) + (center ? 100 : 0), true);
  }
  if (g.type === 'finish') {
    const savedGhost = ghostFinish(g.time, state.skin, course.id);
    const st = styleFinish(course.id);
    if (st) {
      el.finishstyle.textContent = `ESTILO ${fmtPts(st.total)} · ` + (st.record ? '¡RÉCORD DE ESTILO!' : `RÉCORD ${fmtPts(style.best ?? 0)}`);
      el.finishstyle.style.color = st.record ? 'var(--gold)' : '';
    } else el.finishstyle.textContent = '';
    sfx.finish(g.record);
    el.finishtitle.textContent = g.record ? '¡NUEVO RÉCORD!' : '¡META!';
    el.finishtime.textContent = fmtTime(g.time);
    const m = medalFor(g.time), nx = nextMedal(g.time);
    el.finishmedal.textContent = m ? (m.id === 'author' ? 'MEDALLA DE AUTOR' : 'MEDALLA DE ' + m.label) : 'SIN MEDALLA';
    el.finishmedal.style.color = m ? m.color : 'var(--dim)';
    el.finishsub.innerHTML =
      (nx ? `SIGUIENTE: ${nx.label} ${fmtTime(nx.t)} · TE FALTAN ${(g.time - nx.t).toFixed(2)} s<br>` : '') +
      `MEJOR ${fmtTime(course.best)}${savedGhost ? ' · FANTASMA GUARDADO' : ''} · LA SIGUIENTE VUELTA EMPIEZA EN LA PRIMERA PUERTA`;
    el.finishpanel.classList.remove('hidden');
    refreshRecords();
    clearTimeout(timers.finish);
    timers.finish = setTimeout(() => el.finishpanel.classList.add('hidden'), 4000);
    // Sprint: vuelta automática a la salida (R/T lo adelantan; chocar tras la meta no lo impide)
    if (course.kind === 'sprint') { state.sprintDone = true; state.restartAt = state.time + 3; }
  }
}

/* ── Choque → ragdoll ────────────────────────────────────── */
function crash(ev) {
  if (state.mode !== 'fly') return;
  state.mode = 'crash';
  onStyle(styleBreak());
  const speed = ev.vel.length();
  state.crashImpact = ev.voluntary ? 0 : ev.impact ?? speed;
  if (isDesplome) crashAttempt(state.time, ev.voluntary ? speed * 0.5 : state.crashImpact);

  // Momento angular: vuelco en la dirección del impacto + algo de caos
  const ang = new THREE.Vector3().crossVectors(ev.normal, ev.vel).multiplyScalar(0.035 + Math.random() * 0.02);
  ang.add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4));
  if (ev.voluntary) ang.multiplyScalar(0.3);

  rig.root.position.copy(ev.pos).addScaledVector(ev.normal, ev.voluntary ? 0 : 0.35);
  rig.root.updateMatrixWorld(true);
  spawnRagdoll(scene, rig, ev.vel, ang);
  rig.root.visible = false;

  // Golpear un objeto dinámico (columnas de las ruinas) lo derriba
  const body = ev.collider?.parent?.();
  if (body && body.isDynamic()) {
    body.wakeUp();
    const imp = ev.vel.clone().normalize().multiplyScalar(body.mass() * Math.min(14, speed * 0.12));
    body.applyImpulseAtPoint(imp, ev.pos, true);
    sfx.rumble();
  }

  if (!ev.voluntary) {
    const s = Math.min(1, speed / 70);
    state.slowmo = CFG.SLOWMO_TIME * (0.4 + 0.6 * s);
    addTrauma(0.5 + s * 0.5);
    flash();
    sfx.crash(0.5 + s * 0.5);
    if (ev.water) burst(ev.pos, 0xdff4ff, 80, 30, 3.5, 1.4, { dust: true, grav: 20, base: new THREE.Vector3(0, 20, 0) });
    else {
      dustPuff(ev.pos, 1, 1.5);
      burst(ev.pos, 0xffc070, 30, 30, 1.2, 0.7, { grav: 25 });
    }
  }
  el.crashtitle.textContent = ev.voluntary ? '¡LIBRE!' : ev.water ? '¡PLAF!' : ['¡ZAS!', '¡CRAC!', '¡PUM!', '¡AY!'][Math.floor(Math.random() * 4)];
  el.crashpanel.classList.remove('hidden');
  el.crashcta.classList.remove('on');
  el.hud.classList.add('dimmed');
  state.shownDamage = 0;
  fx.trailL.update(camera.position, 0, 0);
  fx.trailR.update(camera.position, 0, 0);
  fx.streaks.material.opacity = 0;
  fx.flame.material.opacity = 0;
  startRagdollCamera(camera);
}

function onImpact(part, dv, fracture, pos) {
  const s = THREE.MathUtils.clamp((dv - 2) / 16, 0, 1);
  sfx.thud(s, part === 'head' ? 'head' : part.startsWith('wing') ? 'wing' : 'body');
  if (fracture) { sfx.crack(); callout('¡CRAC!', 'var(--red)', 500); }
  if (part === 'head' && dv > 6) callout('¡CABEZAZO!', 'var(--red)', 700);
  if (s > 0.15) dustPuff(pos, 1, 0.25 + s * 0.6);
  addTrauma(s * 0.25);
}

/* Carrera desde cero: puertas, fantasma y estilo a la salida. */
function restartRun() {
  state.sprintDone = false;
  state.restartAt = 0;
  resetCourse();
  ghostCancel();
  styleCancel();
  if (isDesplome) { resetAttempt(); resetArena(); el.cScore.classList.add('hidden'); }
  respawn(true);
}

/* DESPLOME: intento nulo por tiempo, o puntuación cuando el ragdoll se detiene. */
function updateDesplome() {
  if (dsp.phase === 'armed' && state.mode === 'fly' && state.time - dsp.armT > ARMED_TIMEOUT) {
    resetAttempt();
    callout('SIN DESPLOME', 'var(--red)', 1500);
    state.sprintDone = true;
    state.restartAt = state.time + 1.5;
  }
  if (dsp.phase === 'crashed' && ragdoll.stats && (ragdoll.settled || state.time - dsp.crashT > SETTLE_TIMEOUT)) finishDesplome();
}

function finishDesplome() {
  const c = ragdollCenter(_tmp), a = world.arena.center;
  const r = scoreAttempt(ragdoll.stats, knockedCount(), Math.hypot(c.x - a.x, c.z - a.z));
  const m = medalForPoints(r.points);
  el.crashtitle.textContent = fmtPts(r.points) + ' PTS';
  el.cScore.innerHTML =
    `DIANA <b>×${r.mult}</b> · DERRIBADOS <b>${r.knocked}</b> · ` +
    (r.record ? '<b class="rec">¡NUEVO RÉCORD!</b>' : `RÉCORD <b>${fmtPts(dsp.best)}</b>`) +
    (m ? ` · <b style="color:${m.color}">${m.id === 'author' ? 'MEDALLA DE AUTOR' : 'MEDALLA DE ' + m.label}</b>` : '');
  el.cScore.classList.remove('hidden');
  sfx.finish(r.record);
  refreshRecords();
  state.sprintDone = true;
  state.restartAt = state.time + 4;
}

function respawn(fromStart = false) {
  if (state.mode === 'title' || state.mode === 'loading') {
    if (!fromStart) return;
  }
  clearRagdoll(scene);
  onStyle(styleBreak());
  const cp = (!fromStart && course.lastCheckpoint) || course.start;
  const dir = cp.dir.clone().normalize();
  const pos = cp.pos.clone().addScaledVector(dir, 14);
  pos.y = Math.max(pos.y, surfaceHeight(pos.x, pos.z) + 25);
  resetPlayer(pos, dir, cp.speed ?? 70);
  state.spawnT = state.time;
  _prev.copy(player.pos);
  if (course.running) ghostRecord(state.time - course.t0, player, true);
  state.mode = 'fly';
  state.slowmo = 0;
  flyAcc = 0;
  el.crashpanel.classList.add('hidden');
  el.hud.classList.remove('dimmed');
  rig.root.visible = cam.mode === 'third';
  rig.root.position.copy(player.pos);
  rig.root.updateMatrixWorld(true);
  wingTips(rig, _tipL, _tipR);
  fx.trailL.reset(_tipL);
  fx.trailR.reset(_tipR);
  forwardVector(player.yaw, player.pitch, _fwd);
  cam.offset.copy(_fwd).multiplyScalar(-7).add(new THREE.Vector3(0, 2, 0));
  if (!pointerLocked) lockPointer();
}

/* ── HUD ─────────────────────────────────────────────────── */
let hudTick = 0;
const _proj = new THREE.Vector3();

function updateHUD(dt) {
  hudTick += dt;
  if (state.mode === 'fly') updateGateMarker();
  if (state.mode === 'crash') updateCrashPanel(dt);
  if (hudTick < 0.05) return;
  hudTick = 0;
  if (state.mode !== 'fly' && state.mode !== 'crash') return;

  const spd = player.speed, v = player.vel.y;
  el.speed.innerHTML = `${Math.round(spd)}<span class="unit">m/s</span>`;
  el.speed.className = 'val' + (spd > 150 ? ' good' : spd < CFG.STALL_SPEED ? ' warn' : '');
  el.speedbar.style.width = Math.min(100, (spd / 260) * 100) + '%';
  el.energybar.style.width = player.energy + '%';
  el.alt.innerHTML = `${Math.round(player.pos.y)}<span class="unit">m</span>`;
  el.vario.textContent = `${v > 0.5 ? '▲' : v < -0.5 ? '▼' : '■'} ${Math.abs(v).toFixed(1)}`;
  el.vario.style.color = v > 0.5 ? '#8ef2ff' : v < -0.5 ? '#ffb36b' : '#7fa8bd';
  el.gload.textContent = `${player.g.toFixed(1)} G`;
  if (hasWind) {
    // Flecha del viento relativa al rumbo (arriba = de cola, derecha = empuja a la derecha)
    const f = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const rel = Math.atan2(_wind.x * c - _wind.z * f, -_wind.x * f - _wind.z * c);
    el.windarrow.style.transform = `rotate(${rel}rad)`;
    el.windval.textContent = `${Math.round(_wind.length())} m/s`;
    el.windval.style.color = state.gustOn ? 'var(--cyan)' : '';
  }
  el.gload.style.color = player.g > 3.5 ? '#ff6b6b' : player.g > 2.2 ? '#ffd23f' : '#cfefff';

  let mode = 'PLANEANDO', color = 'rgba(180,230,255,.6)';
  if (spd < CFG.STALL_SPEED) { mode = 'PÉRDIDA · ¡ALETEA! [ESPACIO]'; color = '#ff6b6b'; }
  else if (player.boostFlash > 0.4) { mode = '¡IMPULSO!'; color = '#c86bff'; }
  else if (player.nearDist < 9) { mode = 'RASANTE · RECARGANDO'; color = '#8ef2ff'; }
  else if (player.thermal > 0.1) { mode = 'CORRIENTE TÉRMICA'; color = '#ffe9a8'; }
  else if (player.tuck > 0.5) { mode = 'ALAS PLEGADAS · PICADO'; color = '#ffd23f'; }
  else if (player.flare > 0.5) { mode = 'FRENANDO · GIRO CERRADO'; color = '#ffb36b'; }
  else if (v > 6 && spd > 40) { mode = 'ASCENSO'; color = '#ffd23f'; }
  else if (spd > 150) mode = 'VUELO RÁPIDO';
  el.mode.textContent = mode;
  el.mode.style.color = color;
  el.stall.classList.toggle('on', state.mode === 'fly' && spd < CFG.STALL_SPEED * 0.85);

  if (isDesplome) {
    el.racetime.textContent = dsp.phase === 'armed' ? fmtTime(state.time - dsp.armT) : dsp.result ? fmtPts(dsp.result.points) : 'DESPLOME';
    el.gatecount.textContent = dsp.phase === 'idle' ? 'CRUZA LA ENTRADA' : '¡A LA DIANA!';
    el.besttime.textContent = dsp.best ? fmtPts(dsp.best) + ' PTS' : '—';
    const nx = nextMedalPoints(dsp.best);
    el.target.innerHTML = nx ? `OBJETIVO <b style="color:${nx.color}">${nx.label}</b> ${fmtPts(nx.t)} PTS` : '<b style="color:#c86bff">TODAS LAS MEDALLAS</b>';
  } else {
    const t = course.running ? state.time - course.t0 : 0;
    el.racetime.textContent = fmtTime(t);
    el.gatecount.textContent = `PUERTA ${course.next}/${course.gates.length}`;
    el.besttime.textContent = fmtTime(course.best);
    const nx = nextMedal(course.best);
    el.target.innerHTML = nx ? `OBJETIVO <b style="color:${nx.color}">${nx.label}</b> ${fmtTime(nx.t)}` : '<b style="color:#c86bff">TODAS LAS MEDALLAS</b>';
  }
  el.crystals.textContent = state.crystals;
  el.nears.textContent = state.nears;
  el.stylescore.textContent = fmtPts(style.total);
  updateComboHUD();
  el.hint.textContent = pointerLocked ? 'R REAPARECER · T REINICIAR · X SOLTARSE' : 'CLIC PARA CAPTURAR EL RATÓN';
  el.vignette.style.opacity = Math.min(0.9, Math.max(0, (spd - 90) / 160) + player.boostFlash * 0.4);
}

/* Combo en curso: trucos, multiplicador, valor y plazo restante. Una rasante en
   curso se muestra en vivo (todavía no suma: se cuenta al salir de ella). */
function updateComboHUD() {
  const live = style.active && state.mode === 'fly' && player.nearT > 0.25;
  if (!style.mult && !live) { el.combo.classList.remove('on'); return; }
  // Trucos repetidos seguidos se agrupan: "PUERTA VELOZ x3"
  const groups = [];
  for (const n of style.names) {
    if (groups.length && groups.at(-1).n === n) groups.at(-1).c++;
    else groups.push({ n, c: 1 });
  }
  const names = groups.slice(-3).map((g) => (g.c > 1 ? `${g.n} x${g.c}` : g.n));
  if (live) names.push(`RASANTE ${player.nearT.toFixed(1)}s…`);
  el.cnames.textContent = (groups.length > 3 ? '… + ' : '') + names.join(' + ');
  el.cmult.textContent = '×' + Math.max(1, style.mult);
  el.cpts.textContent = style.mult ? fmtPts(comboValue()) : '';
  el.cbar.style.width = (live ? 100 : (style.window / WINDOW) * 100) + '%';
  el.combo.classList.add('on');
}

/* Récord y escalera de medallas de la pantalla de título. */
function refreshRecords() {
  if (isDesplome) {
    el.records.innerHTML = `<div class="best">RÉCORD ${dsp.best ? fmtPts(dsp.best) + ' PTS' : '—'}</div>` +
      MEDALS.slice().reverse().map((m) => {
        const got = dsp.best != null && dsp.best >= m.t;
        return `<span class="medal${got ? ' got' : ''}" style="--mc:${m.color}">${m.label} ${fmtPts(m.t)}</span>`;
      }).join('');
    return;
  }
  const best = course.best;
  el.records.innerHTML =
    `<div class="best">MEJOR ${fmtTime(best)}${style.best ? ' · ESTILO ' + fmtPts(style.best) : ''}` +
    `${ghost.saved ? ' · FANTASMA LISTO' : ''}</div>` +
    MEDALS.slice().reverse().map((m) => {
      const got = best != null && best <= m.t;
      return `<span class="medal${got ? ' got' : ''}" style="--mc:${m.color}">${m.label} ${fmtTime(m.t)}</span>`;
    }).join('');
}

function updateGateMarker() {
  // En el DESPLOME, tras la ENTRADA el marcador apunta a la diana
  const target = isDesplome && dsp.phase !== 'idle' ? world.arena.center : course.gates[course.next].pos;
  _proj.copy(target).project(camera);
  const behind = _proj.z > 1;
  let x = _proj.x, y = _proj.y;
  if (behind) { x = -x; y = -y; }
  const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
  const W = window.innerWidth, H = window.innerHeight;
  if (onScreen) {
    el.gatemark.classList.remove('off');
    el.gatemark.style.transform = `translate(${(x * 0.5 + 0.5) * W}px, ${(-y * 0.5 + 0.5) * H}px)`;
    el.gatemark.firstElementChild.style.transform = 'rotate(45deg)';
  } else {
    const a = Math.atan2(y, x);
    const m = Math.max(Math.abs(Math.cos(a)) / 0.9, Math.abs(Math.sin(a)) / 0.84);
    const ex = Math.cos(a) / m, ey = Math.sin(a) / m;
    el.gatemark.classList.add('off');
    el.gatemark.style.transform = `translate(${(ex * 0.5 + 0.5) * W}px, ${(-ey * 0.5 + 0.5) * H}px)`;
    el.gatemark.firstElementChild.style.transform = `rotate(${-a + Math.PI / 2}rad)`;
  }
  el.gatedist.textContent = Math.round(target.distanceTo(player.pos)) + ' m';
}

function updateCrashPanel(dt) {
  const st = ragdoll.stats;
  if (!st) return;
  state.shownDamage += (st.damage - state.shownDamage) * Math.min(1, dt * 5);
  el.cDamage.textContent = Math.round(state.shownDamage).toLocaleString('es');
  el.cFract.textContent = st.fractures;
  el.cBounce.textContent = st.bounces;
  el.cDist.textContent = Math.round(st.distance) + ' m';
  el.cImpact.textContent = Math.round(state.crashImpact) + ' m/s';
  if (ragdoll.t > 0.8) el.crashcta.classList.add('on');
}

/* ── Overlay de rendimiento (F3) ─────────────────────────── */
const perf = { on: false, frames: 0, ms: 0, worst: 0, steps: 0 };

function updatePerf(frameMs, steps) {
  if (!perf.on || frameMs > 250) return; // ignora saltos (pestaña oculta, carga)
  perf.frames++;
  perf.ms += frameMs;
  perf.steps += steps;
  perf.worst = Math.max(perf.worst, frameMs);
  if (perf.ms < 500) return;
  const ms = perf.ms / perf.frames;
  const r = renderer.info.render, c = renderer.domElement;
  el.perf.textContent =
    `${Math.round(1000 / ms)} FPS · ${ms.toFixed(1)} ms (peor ${perf.worst.toFixed(0)})\n` +
    `${r.calls} draws · ${(r.triangles / 1e6).toFixed(2)} M tri\n` +
    `res ${Math.round(res.scale * 100)}% ${c.width}×${c.height} · ${QUALITY.label}${QUALITY.msaa ? ' · MSAA' : ''}\n` +
    `instancias ${world.stats.visibleInstances ?? 0} / sombra ${world.stats.shadowInstances ?? 0}\n` +
    `física ${(perf.steps / perf.frames).toFixed(1)} pasos/frame`;
  perf.frames = perf.ms = perf.worst = perf.steps = 0;
}

/* Puntos de la cámara de presentación: las puertas, o una órbita sobre la arena
   (el DESPLOME tiene una sola puerta y la curva necesita varias). */
let _attract = null;
function attractPoints() {
  if (_attract) return _attract;
  if (isDesplome) {
    const c = world.arena.center;
    _attract = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return new THREE.Vector3(c.x + Math.cos(a) * 170, c.y + 60, c.z + Math.sin(a) * 170);
    });
  } else _attract = course.gates.map((g) => g.pos);
  return _attract;
}

/* ── Bucle ───────────────────────────────────────────────── */
let last = performance.now();
let debugNoRender = false;
const _focus = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  tick(now);
}

function tick(now) {
  const frameMs = now - last;
  const rdt = Math.max(0, Math.min(0.05, frameMs / 1000));
  last = now;
  adaptResolution(frameMs);

  let scale = 1;
  if (state.slowmo > 0) {
    state.slowmo -= rdt;
    const k = Math.max(0, state.slowmo / CFG.SLOWMO_TIME);
    scale = CFG.SLOWMO_SCALE + (1 - CFG.SLOWMO_SCALE) * (1 - Math.min(1, k * 1.6));
  }
  // Pausa al liberar el ratón en pleno vuelo (solo si el bloqueo llegó a funcionar)
  const paused = state.mode === 'fly' && hadLock && !pointerLocked && !debugAdvancing;
  el.pause.classList.toggle('hidden', !paused);
  const dt = paused ? 0 : rdt * scale;
  state.time += dt;

  if (state.mode === 'fly' && !paused) flyUpdate(dt, rdt);
  if (isDesplome) updateDesplome();
  if (state.restartAt && state.time >= state.restartAt) restartRun();

  const steps = stepPhysics(dt, (events) => {
    if (ragdoll.active) handleContactForces(events, onImpact);
    else events.clear();
  });
  syncDynamic();

  if (state.mode === 'crash') {
    updateRagdoll(dt);
    updateRagdollCamera(camera, rdt, state.time);
    updateWind(0, rdt, 0);
    _focus.copy(camera.position);
  } else if (state.mode === 'title') {
    updateAttractCamera(camera, rdt, attractPoints());
    _focus.copy(camera.position);
  } else {
    _focus.copy(player.rpos);
  }
  updateGhost(state.time, camera, state.mode === 'fly' || state.mode === 'crash', course.running);

  updateEffects(dt);
  updateWorld(dt, state.time, camera);
  animateCourse(state.time);
  updateSunShadow(_focus);
  updateCulling(camera);
  updateHUD(rdt);
  if (!debugNoRender) renderer.render(scene, camera);
  updatePerf(frameMs, steps);
}

/* ── Arranque ────────────────────────────────────────────── */
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });

async function boot() {
  try {
    el.loadmsg.textContent = 'INICIANDO FÍSICA…';
    await initPhysics();
    setDetailDistance(QUALITY.detailDist);
    el.loadmsg.textContent = 'CARGANDO ASSETS…';
    await loadAssets(renderer, (f) => { el.loadbar.style.width = Math.round(f * 70) + '%'; });
    await buildWorld(scene, renderer, async (msg) => {
      el.loadmsg.textContent = msg.toUpperCase();
      el.loadbar.style.width = Math.min(98, parseFloat(el.loadbar.style.width) + 9) + '%';
      await nextFrame();
    });
    initEffects(scene, world.glowTex);
    setParticleScale(renderer.domElement.height);
    el.timeName.textContent = 'HORA ' + TIMES[atmo.id].label;
    el.windrow.classList.toggle('hidden', !hasWind);
    if (isDesplome) {
      $('titletip').innerHTML = 'Cruza la <b>ENTRADA</b> y estréllate en la arena. La <b>diana</b> multiplica ' +
        '(×3 en el centro), cada <b>caja derribada</b> suma, y también el daño, las fracturas y la velocidad del impacto.';
    }
    initGhost(scene, course.id, world.glowTex);
    initStyle(course.id);
    refreshRecords();
    setSkin(0);
    resetPlayer(course.start.pos, course.start.dir, 60);
    renderer.compile(scene, camera);
    el.loadbar.style.width = '100%';
    await nextFrame();
    el.loading.classList.add('hidden');
    el.overlay.classList.remove('hidden');
    state.mode = 'title';
    // Depuración: avanzar la simulación sin requestAnimationFrame (pestaña oculta)
    const advance = (sec, keysDown = {}, render = false) => {
      Object.assign(keys, keysDown);
      debugNoRender = !render;
      debugAdvancing = true;
      for (let t = 0; t < sec - 1e-6; t += 1 / 60) tick(last + 1000 / 60);
      debugNoRender = false;
      debugAdvancing = false;
      last = performance.now();
      for (const k in keysDown) keys[k] = false;
    };
    // Depuración: comprueba que cada tramo recto del recorrido (salida incluida) esté libre
    const probePath = (radius = 4) => {
      const out = [];
      pathSegments().forEach(([a, b], i) => {
        const d = b.clone().sub(a);
        const h = castPlayer(a, d, radius);
        if (h) {
          const at = a.clone().addScaledVector(d, h.time_of_impact);
          out.push({ seg: i ? `${i - 1}->${i % course.gates.length}` : 'salida->0', kind: h.collider.userData?.kind, t: +h.time_of_impact.toFixed(2), at: [at.x | 0, at.y | 0, at.z | 0] });
        }
      });
      return out;
    };
    const setAutopilot = (on = true, boost = true) => { autopilot.on = on; autopilot.boost = boost; };
    window.__elytra = {
      probePath, state, player, course, world, phys, ragdoll, scene, camera, renderer, advance, respawn, crash, keys, res, perf,
      QUALITY, ghost, style, autopilot: setAutopilot, applyTime, dsp, knockedCount,
    };
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    el.loadmsg.textContent = 'ERROR: ' + (err?.message || err);
    el.loadmsg.style.color = '#ff6b6b';
  }
}

boot();
