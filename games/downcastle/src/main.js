/* DOWNCASTLE: flujo de la app (título → sala → tramo → premios → … → fin de la run), bucle,
   anfitrión (simula a 60 Hz y manda el estado a 20 Hz) e invitados (mandan entradas a 30 Hz
   y dibujan a los demás interpolados). window.__downcastle para depurar. */
import { CFG, saveSettings, params, load, store, PLAYER_COLORS, HEROES } from './config.js';
import { loadSprites } from './sprites.js';
import { genTramo, genExterior, buildLevel, mulberry32 } from './level.js';
import { createSim, step, encodeState, newStats, PF, applyDyn, BOSS_STATES, windAt } from './sim.js';
import { botFields, botView, botThink, newBotMemory } from './bots.js';
import { initInput, readTilt, takeEvents, input, calibrate, requestTiltPermission, needsTiltPermission } from './input.js';
import { createRenderer } from './render.js';
import { connectRoom, createSnapBuffer, randomCode, ERRORS } from './net.js';
import { computeAwards, sumStats, saveTel, rateTel } from './awards.js';
import { unlockAudio, music, musicFilter, sfx, vibrate, applySettings, windAmbience } from './audio.js';
import { createVoice } from './voice.js';
import { showBlockViewer } from './viewer.js';
import { $, showScreen, overlay, renderLobby, renderAwards, renderRunEnd, bindSettings, toast, colorHex } from './ui.js';

const STEP = 1 / CFG.SIM_HZ;
const BOT_NAMES = ['Grog', 'Mirla', 'Tuck', 'Brina'];
const HERO_IDS = HEROES.flatMap((h) => [h.id + '_m', h.id + '_f']);
const lerp = (a, b, f) => a + (b - a) * f;
const nowS = () => performance.now() / 1000;

const profile = Object.assign({ name: '', color: 'amarillo', hero: 'knight_m' }, load('downcastle.profile', {}));
const saveProfile = () => store('downcastle.profile', profile);

const app = {
  screen: 'loading',
  role: null,            // 'host' | 'guest'
  online: false,
  solo: false,
  conn: null, code: null, myId: 1,
  lobby: [],             // anfitrión: la verdad; invitado: copia
  phase: 'lobby',        // 'lobby' | 'play' | 'awards' | 'runend'
  ready: false,
  run: null, sim: null, lv: null, fields: null, roster: [], tramo: null, runInfo: { c: 0, k: 0, gems: 0 },
  botMem: new Map(), guestIn: new Map(), lastSeq: new Map(), netFx: [],
  acc: 0, stateT: 0, inT: 0, seq: 0, endT: null, paused: false,
  auto: false, autoMem: newBotMemory(9),
  snaps: createSnapBuffer(), hurtAt: new Map(), lastHp: new Map(), skip: { shot: 0, jump: 0, tug: 0 },
  lastRes: null, lastRunEnd: null, telAt: null, seedBase: null, view: null, demo: null, wasKo: false,
};
let R = null;
const voice = createVoice(voiceSignal);

/* ───────────────────────── Utilidades de sala ───────────────────────── */
const clean = (s) => String(s || '').replace(/[<>]/g, '').trim().slice(0, 12);
const validHero = (h) => (HERO_IDS.includes(h) ? h : 'knight_m');
const entry = (id) => app.lobby.find((e) => e.id === id);
const simPlayer = (id) => app.sim?.players.find((p) => p.id === id);
function freeColor(except) {
  const used = new Set(app.lobby.filter((e) => e.id !== except).map((e) => e.color));
  return (PLAYER_COLORS.find((c) => !used.has(c.id)) || PLAYER_COLORS[3]).id;
}
const colorFree = (c, id) => PLAYER_COLORS.some((x) => x.id === c) && !app.lobby.some((e) => e.id !== id && e.color === c);

function pidFor(code) {
  const k = 'downcastle.pid.' + code;
  let pid = null;
  try { pid = sessionStorage.getItem(k); } catch { /* */ }
  if (!pid) {
    pid = Math.random().toString(36).slice(2, 12);
    try { sessionStorage.setItem(k, pid); } catch { /* */ }
  }
  return pid;
}
function extraParams() {
  const ws = params.get('ws');
  return ws ? `&ws=${encodeURIComponent(ws)}` : '';
}
const roomLink = (code) => `${location.origin}${location.pathname}?sala=${code}${extraParams()}`;
function setUrl(code) {
  const q = code ? `?sala=${code}${extraParams()}` : (params.get('ws') ? `?ws=${encodeURIComponent(params.get('ws'))}` : '');
  history.replaceState(null, '', location.pathname + q);
}

/* ───────────────────────── Pantallas ───────────────────────── */
function setScreen(name) {
  app.screen = name;
  showScreen(name);
  const inPit = name === 'play';
  music(inPit ? 'pit' : 'tavern');
  musicFilter(inPit);
}

function leaveNet() {
  if (app.conn) app.conn.close();
  app.conn = null;
  app.online = false;
  voice.reset();
  voice.setMic(false);
  micUI();
}

/* ───────────────────────── Chat de voz ───────────────────────── */
const rtcOK = typeof RTCPeerConnection !== 'undefined';
function voiceSignal(to, d) {
  if (app.role === 'host') sendTo(to, { t: 'rtc', from: app.myId, d });
  else app.conn?.send({ t: 'rtc', to, d });
}
function voiceSync() {
  const ids = app.online && rtcOK ? app.lobby.filter((e) => !e.bot && e.on !== false && e.id !== app.myId).map((e) => e.id) : [];
  voice.sync(ids);
  micUI();
}
/* Fuera del pozo, todos en seco. En el pozo, los vivos suenan con eco de cueva para todos
   (afuera de la torre, en seco: aire libre); los caídos (o los que miran) solo se oyen entre
   caídos, en seco. Devuelve [lo que oigo, me oye]. */
const ALL = [() => 'dry', () => true];
function voiceModes(view) {
  if (app.screen !== 'play' || !view?.players?.length) return ALL;
  const dead = (id) => { const p = view.players.find((q) => q.id === id); return !p || p.ko; };
  const meDead = dead(app.myId);
  return [
    (id) => (!dead(id) ? (view.lv?.wrap ? 'dry' : 'cave') : meDead ? 'dry' : 'off'),
    (id) => !meDead || dead(id),
  ];
}
function micUI() {
  const show = app.online && rtcOK;
  for (const id of ['btn-mic', 'micbtn']) {
    $(id).classList.toggle('hidden', !show);
    $(id).classList.toggle('on', voice.micOn);
  }
  $('voice-tip').classList.toggle('hidden', !show);
  $('btn-mic').textContent = voice.micOn ? '🎤 Micrófono encendido' : '🎤 Micrófono apagado';
}
async function toggleMic() {
  unlockAudio();
  if (!voice.micOn && !navigator.mediaDevices?.getUserMedia) { toast('El micrófono necesita https', 2600); return; }
  const wanted = !voice.micOn;
  const on = await voice.setMic(wanted);
  if (wanted && !on) toast('Sin permiso de micrófono', 2600);
  micUI();
}

function toTitle(msg = '') {
  leaveNet();
  Object.assign(app, { role: null, sim: null, run: null, lobby: [], phase: 'lobby', ready: false, solo: false, paused: false, auto: false });
  overlay('pause', false);
  setUrl(null);
  setScreen('title');
  $('title-msg').textContent = msg;
}

function selfEntry() {
  let e = entry(app.myId);
  if (!e) { e = { id: app.myId, host: true, on: true }; app.lobby.unshift(e); }
  Object.assign(e, { name: clean(profile.name) || 'Aventurero', color: profile.color, hero: validHero(profile.hero), ready: app.ready });
  return e;
}

function toLobby(msg = '') {
  app.lobbyMsg = msg;
  setScreen('lobby');
  renderLobbyUI();
}

function canStart() {
  if (app.solo) return true;
  const members = app.lobby.filter((e) => e.on !== false);
  return members.length >= 2 && members.length <= 4 && members.every((e) => e.bot || e.ready);
}

function renderLobbyUI() {
  if (app.screen !== 'lobby') return;
  micUI();
  const me = entry(app.myId);
  let msg = app.lobbyMsg || '';
  if (app.role === 'guest' && app.phase !== 'lobby' && me?.pending) msg = 'Partida en curso: entrás en el próximo tramo.';
  else if (app.role === 'host' && !app.solo && !msg) msg = app.lobby.length < 2 ? 'Compartí el código: hacen falta 2 a 4 jugadores.' : (canStart() ? '' : 'Esperando que todos estén listos…');
  renderLobby({
    code: app.code, link: roomLink(app.code), online: app.online, solo: app.solo,
    players: app.lobby, myId: app.myId, isHost: app.role === 'host', canStart: canStart(),
    phase: app.phase, ready: app.ready, profile, msg,
  }, {
    color: (c) => { profile.color = c; saveProfile(); profileChanged(); },
    hero: (h) => { profile.hero = h; saveProfile(); profileChanged(); },
  });
}

function profileChanged() {
  if (app.role === 'host') { selfEntry(); publishLobby(); }
  else if (app.role === 'guest') {
    app.conn?.send({ t: 'prof', name: clean(profile.name), color: profile.color, hero: profile.hero });
    const me = entry(app.myId);
    if (me) Object.assign(me, { name: clean(profile.name), hero: profile.hero, color: colorFree(profile.color, app.myId) ? profile.color : me.color });
    renderLobbyUI();
  }
}

/* ───────────────────────── Anfitrión ───────────────────────── */
function hostSetup(online) {
  leaveNet();
  Object.assign(app, { role: 'host', online, solo: false, lobby: [], phase: 'lobby', run: null, sim: null, ready: false, myId: 1 });
}

function createRoom(tries = 0) {
  hostSetup(true);
  const code = randomCode();
  app.code = code;
  $('title-msg').textContent = 'Creando sala…';
  app.conn = connectRoom({
    code, create: true, pid: pidFor(code),
    on: {
      welcome(m) {
        app.myId = m.id;
        voice.setId(m.id);
        app.lobby = [];
        selfEntry();
        setUrl(code);
        toLobby();
      },
      message: hostMessage,
      status(st, why) {
        if (st !== 'closed') return;
        if (why === 'exists' && tries < 5) { createRoom(tries + 1); return; }
        hostLost(why);
      },
    },
  });
}

function hostLost(why) {
  if (app.phase === 'lobby' || !app.run) { toTitle(ERRORS[why] || ERRORS.net); return; }
  // En plena run: se sigue sin red; los invitados quedan como peso muerto
  app.online = false;
  voiceSync();
  for (const e of app.lobby) if (!e.bot && e.id !== app.myId) e.on = false;
  for (const p of app.sim?.players || []) if (!p.bot && p.id !== app.myId) p.conn = false;
  toast('Se perdió la conexión: seguís sin red', 3000);
}

function startSolo(nBots = 2) {
  hostSetup(false);
  app.solo = true;
  app.ready = true;
  app.code = null;
  selfEntry();
  setBots(nBots);
  startRun();
}

function setBots(n) {
  app.lobby = app.lobby.filter((e) => !e.bot);
  n = Math.max(0, Math.min(n, 4 - app.lobby.length));
  for (let i = 0; i < n; i++) {
    app.lobby.push({
      id: -(i + 1), bot: true, on: true, ready: true, name: BOT_NAMES[i],
      color: freeColor(-(i + 1)), hero: HERO_IDS[(i * 3 + 2) % HERO_IDS.length],
      pending: app.phase !== 'lobby',
    });
  }
}

function publishLobby() {
  if (app.role !== 'host') return;
  if (app.online) {
    const players = app.lobby.map(({ id, name, color, hero, ready, host, on, bot, pending }) => ({ id, name, color, hero, ready, host, on, bot, pending }));
    app.conn.send({ m: { t: 'lobby', phase: app.phase, players } });
  }
  voiceSync();
  renderLobbyUI();
}

const sendTo = (id, m) => app.online && app.conn.send({ to: id, m });
const startMsg = () => ({ t: 'start', tramo: app.tramo, roster: app.roster, runGems: app.run.gems });

/* Secuencia de cada ciclo: T1, T2, mini-exterior, T3, T4, jefe y la bajada por afuera de la
   torre. run.s es la posición en la secuencia; los tramos normales conservan su k (0..3, 4 = jefe). */
const CYCLE_SEQ = [{ k: 0 }, { k: 1 }, { ext: 'mini' }, { k: 2 }, { k: 3 }, { k: 4 }, { ext: 'bajada' }];
const seqOf = (k) => CYCLE_SEQ.findIndex((e) => e.k === k);

/* Etiqueta del tramo: «CICLO 1 · TRAMO 3», «CICLO 1 · JEFE: EL OJO», «CICLO 1 · AFUERA»… */
const BOSS_NAMES = { ojo: 'EL OJO' };
function tramoLabel(tr) {
  if (!tr) return '';
  if (tr.kind === 'exterior') return `CICLO ${tr.c + 1} · ` + (tr.sub === 'mini' ? 'AFUERA' : 'BAJADA POR LA TORRE');
  return `CICLO ${tr.c + 1} · ` + (tr.kind === 'boss' ? `JEFE: ${BOSS_NAMES[tr.boss] || 'JEFE'}` : `TRAMO ${tr.k + 1}`);
}

/* Punto de arranque desde la URL (?ciclo, ?tramo, ?jefe, ?ext, ?mods, ?seed, ?bloque) o goto(). */
function urlStart() {
  const num = (k) => (params.has(k) ? Math.max(0, Math.floor(+params.get(k)) || 0) : null);
  const o = { c: num('ciclo') ?? 0, s: seqOf(Math.min(3, num('tramo') ?? 0)), force: null };
  const mods = params.get('mods'), boss = params.get('jefe') === '1', only = params.get('bloque'), ext = params.get('ext');
  if (mods != null || boss || only) o.force = { mods: mods != null ? mods.split(',').filter(Boolean) : undefined, boss, only: only || undefined };
  if (boss) o.s = seqOf(4);
  if (ext === 'mini' || ext === 'bajada') { o.s = CYCLE_SEQ.findIndex((e) => e.ext === ext); o.force = null; }
  return o;
}
if (params.has('seed')) app.seedBase = (+params.get('seed')) >>> 0;

function hostMessage(m) {
  if (m.t === 'peer') {
    if (m.on) return; // espera su hello
    const e = entry(m.id);
    if (!e) return;
    if (app.phase === 'lobby') {
      app.lobby = app.lobby.filter((x) => x !== e);
      app.conn.send({ t: 'drop', id: m.id });
    } else {
      e.on = false;
      const p = simPlayer(m.id);
      if (p) p.conn = false; // queda como peso muerto hasta que vuelva
      toast(`${e.name} se desconectó`);
    }
    publishLobby();
    return;
  }
  if (m.t !== 'from') return;
  const id = m.id, g = m.m || {};
  let e = entry(id);
  switch (g.t) {
    case 'hello': {
      if (!e) {
        if (app.lobby.length >= 4) { app.conn.send({ t: 'drop', id }); return; }
        e = { id, ready: false, on: true, pending: app.phase !== 'lobby' };
        app.lobby.push(e);
      }
      e.on = true;
      e.name = clean(g.name) || 'Aventurero';
      e.hero = validHero(g.hero);
      e.color = colorFree(g.color, id) ? g.color : (colorFree(e.color, id) ? e.color : freeColor(id));
      e.ready = !!g.ready;
      publishLobby();
      // Entra (o vuelve) a mitad de un tramo: recibe el tramo para jugar o mirar
      if (app.phase === 'play') {
        const p = simPlayer(id);
        if (p) { p.conn = true; toast(`${e.name} volvió`); }
        sendTo(id, startMsg());
      } else if (app.phase === 'awards' && app.lastRes) sendTo(id, app.lastRes);
      else if (app.phase === 'runend' && app.lastRunEnd) sendTo(id, app.lastRunEnd);
      break;
    }
    case 'prof':
      if (!e) return;
      e.name = clean(g.name) || e.name;
      if (app.phase === 'lobby' || e.pending) {
        e.hero = validHero(g.hero);
        if (colorFree(g.color, id)) e.color = g.color;
      }
      publishLobby();
      break;
    case 'ready':
      if (e) { e.ready = !!g.v; publishLobby(); }
      break;
    case 'rtc': // señalización de voz: para mí o para reenviar a otro invitado
      if (!e) return;
      if (g.to === app.myId) voice.onSignal(id, g.d);
      else if (entry(g.to) && !entry(g.to).bot) sendTo(g.to, { t: 'rtc', from: id, d: g.d });
      break;
    case 'in':
      app.guestIn.set(id, { x: Math.max(-1, Math.min(1, +g.x || 0)), h: !!g.h });
      break;
    case 'ev': {
      const last = app.lastSeq.get(id) || 0;
      if (!(g.s > last)) break; // repetido
      app.lastSeq.set(id, g.s);
      const p = simPlayer(id);
      if (p && (g.e === 'tap' || g.e === 'up' || g.e === 'down')) p.events.push(g.e);
      break;
    }
    default: break;
  }
}

function startRun(at = urlStart()) {
  app.run = {
    c: at.c, s: at.s, force: at.force, seed: app.seedBase ?? (Math.random() * 2 ** 31) >>> 0,
    gems: 0, cleared: 0, t: 0, stats: {}, hp: {}, order: null, names: {}, over: false, maxC: at.c,
  };
  startTramo();
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function startTramo() {
  const run = app.run;
  const ids = app.lobby.map((e) => e.id);
  const rnd = mulberry32(run.seed + (run.c * 7 + run.s) * 7919);
  // El orden se sortea en cada tramo; los que se unieron entre tramos entran al final
  const prev = shuffle((run.order || ids).filter((id) => ids.includes(id)), rnd);
  const fresh = ids.filter((id) => !prev.includes(id));
  run.order = [...prev, ...fresh];
  for (const e of app.lobby) e.pending = false;
  app.roster = run.order.map((id) => {
    const e = entry(id);
    return { id, name: e.name, color: colorHex(e.color), hero: e.hero, bot: !!e.bot, hp: run.hp[id], conn: e.on !== false };
  });
  const st = CYCLE_SEQ[run.s];
  app.tramo = st.ext ? genExterior(run.seed, run.c, st.ext, run.s)
    : { ...genTramo(run.seed, run.c, st.k, run.force || {}), s: run.s }; // los forzados (URL, goto) solo valen para este tramo
  run.force = null;
  app.lv = buildLevel(app.tramo);
  app.fields = botFields(app.lv);
  app.sim = createSim(app.lv, app.roster);
  app.botMem = new Map(app.roster.map((r, i) => [r.id, newBotMemory(i)]));
  app.guestIn.clear();
  app.netFx = [];
  app.endT = null;
  app.phase = 'play';
  app.runInfo = { c: run.c, s: run.s, gems: run.gems };
  if (app.online) { app.conn.send({ m: startMsg() }); publishLobby(); }
  enterPlay();
}

function enterPlay() {
  takeEvents();
  app.acc = 0; app.stateT = 0; app.inT = 0;
  app.skip = { shot: 0, jump: 0, tug: 0 };
  app.wasKo = false;
  R.setLevel(app.lv);
  overlay('pause', false);
  setScreen('play');
  $('tramolabel').textContent = tramoLabel(app.tramo);
  if (app.tramo.c === 0 && app.tramo.k === 0) {
    $('hint').classList.remove('hidden');
    setTimeout(() => $('hint').classList.add('hidden'), 7000);
  }
}

function applyBot(p, view, mem) {
  const o = botThink(view, view.players[p.idx], mem, STEP);
  p.input.tilt = o.tilt;
  p.input.hold = o.hold;
  p.events.push(...o.events);
}

function feedInputs(sim) {
  let bv = null;
  const view = () => (bv ||= botView(sim, app.fields));
  for (const p of sim.players) {
    if (p.id === app.myId) {
      const evs = takeEvents();
      if (app.auto) applyBot(p, view(), app.autoMem);
      else { p.input.tilt = readTilt(); p.input.hold = input.hold; }
      p.events.push(...evs);
    } else if (p.bot) applyBot(p, view(), app.botMem.get(p.id));
    else {
      const gi = app.guestIn.get(p.id);
      if (gi) { p.input.tilt = gi.x; p.input.hold = gi.h; }
    }
  }
}

function hostStep() {
  const sim = app.sim;
  feedInputs(sim);
  step(sim, STEP);
  if (sim.fx.length) {
    const view = simView(1);
    for (const ev of sim.fx) { playFx(ev, view); if (app.online) app.netFx.push(ev); }
    sim.fx.length = 0;
  }
  if (sim.status !== 'play') {
    if (app.endT == null) app.endT = sim.t;
    else if (sim.t - app.endT > 1.2 && app.screen === 'play') hostEndTramo();
  }
}

function hostFrame(dt) {
  if (app.paused) return;
  app.acc += dt;
  let n = 0;
  while (app.acc >= STEP && n < 8 && app.screen === 'play') { hostStep(); app.acc -= STEP; n++; }
  if (n === 8) app.acc = 0;
  if (!app.online || app.screen !== 'play') return;
  app.stateT += dt;
  if (app.stateT < 1 / CFG.STATE_HZ) return;
  app.stateT %= 1 / CFG.STATE_HZ;
  const st = encodeState(app.sim);
  st.fx = app.netFx.splice(0).slice(-80);
  st.ack = Object.fromEntries(app.lastSeq);
  app.conn.send({ m: st });
}

function hostEndTramo() {
  const sim = app.sim, run = app.run, won = sim.status === 'won';
  run.gems += sim.gems;
  run.t += sim.t;
  if (won) run.cleared++;
  const players = sim.players.map((p) => ({ id: p.id, name: p.name, color: entry(p.id)?.color || 'blanco', stats: p.stats }));
  for (const p of players) {
    sumStats(run.stats[p.id] ||= newStats(), p.stats);
    run.names[p.id] = { name: p.name, color: p.color };
  }
  for (const p of sim.players) run.hp[p.id] = p.ko ? 0 : p.hp;
  const tr = app.tramo;
  const res = {
    t: 'res', result: won ? 'won' : 'wiped', c: tr.c, k: tr.k, s: tr.s, kind: tr.kind, sub: tr.sub || null, rings: tr.kind === 'exterior' ? tr.chunks : undefined,
    boss: tr.boss || null, mods: tr.mods, gems: sim.gems, runGems: run.gems,
    dur: Math.round(sim.t * 10) / 10, awards: computeAwards(players), players: players.length,
    stats: Object.fromEntries(players.map((p) => [p.id, roundStats(p.stats)])),
  };
  if (won) { // tras la bajada, el ciclo siguiente
    run.s++;
    if (run.s >= CYCLE_SEQ.length) { run.c++; run.s = 0; run.maxC = Math.max(run.maxC, run.c); }
  }
  run.over = !won;
  app.phase = 'awards';
  app.lastRes = res;
  if (app.online) { app.conn.send({ m: res }); publishLobby(); }
  showAwards(res);
}
const roundStats = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v * 10) / 10]));

function hostNext() {
  if (app.role !== 'host' || !app.run) return;
  if (app.run.over) hostRunEnd();
  else startTramo();
}

function hostRunEnd() {
  const run = app.run;
  const totals = Object.entries(run.stats).map(([id, stats]) => ({ id: +id, name: run.names[id].name, color: run.names[id].color, stats }));
  const msg = { t: 'runend', gems: run.gems, tramos: run.cleared, ciclo: run.maxC + 1, dur: Math.round(run.t), awards: computeAwards(totals) };
  app.phase = 'runend';
  app.lastRunEnd = msg;
  if (app.online) { app.conn.send({ m: msg }); publishLobby(); }
  showRunEnd(msg);
}

function hostToLobby() {
  app.phase = 'lobby';
  app.run = null;
  app.sim = null;
  app.ready = app.solo;
  for (const e of app.lobby) e.ready = !!e.bot || (app.solo && e.id === app.myId);
  for (const e of app.lobby) if (e.on === false && !e.bot && app.online) app.conn.send({ t: 'drop', id: e.id }); // libera su lugar
  app.lobby = app.lobby.filter((e) => e.on !== false || e.bot);
  if (app.online) app.conn.send({ m: { t: 'tolobby' } });
  publishLobby();
  toLobby();
}

/* ───────────────────────── Invitado ───────────────────────── */
function joinRoom(code) {
  code = code.toUpperCase();
  leaveNet();
  Object.assign(app, { role: 'guest', online: true, solo: false, code, phase: 'lobby', lobby: [], ready: false, sim: null, lv: null });
  $('title-msg').textContent = 'Entrando a la sala…';
  app.conn = connectRoom({
    code, create: false, pid: pidFor(code),
    on: {
      welcome(m, first) {
        app.myId = m.id;
        voice.setId(m.id);
        app.conn.send({ t: 'hello', name: clean(profile.name), color: profile.color, hero: profile.hero, ready: app.ready });
        if (first) { setUrl(code); toLobby(); } else toast('Reconectado');
      },
      message: guestMessage,
      status(st, why) {
        if (st === 'reconnecting') toast('Reconectando…', 3000);
        else if (st === 'closed') toTitle(ERRORS[why] || ERRORS.net);
      },
    },
  });
}

function guestMessage(m) {
  switch (m.t) {
    case 'lobby': {
      app.lobby = m.players || [];
      app.phase = m.phase;
      const me = entry(app.myId);
      if (me && me.color !== profile.color) { profile.color = me.color; saveProfile(); }
      if (app.screen === 'lobby') renderLobbyUI();
      else if (m.phase === 'lobby' && app.screen !== 'title') toLobby();
      voiceSync();
      break;
    }
    case 'rtc': voice.onSignal(m.from, m.d); break;
    case 'start': guestStart(m); break;
    case 'st':
      if (!app.lv || app.screen !== 'play') break;
      app.snaps.push(m, nowS());
      applyDyn(app.lv, m.dy); // plataformas, entrada y piso del jefe
      if (m.fx) guestFx(m.fx);
      break;
    case 'res': app.lastRes = m; showAwards(m); break;
    case 'runend': showRunEnd(m); break;
    case 'tolobby': app.ready = false; app.phase = 'lobby'; toLobby(); break;
    default: break;
  }
}

function guestStart(m) {
  app.tramo = m.tramo;
  app.lv = buildLevel(m.tramo);
  app.fields = botFields(app.lv);
  app.roster = m.roster;
  app.runInfo = { c: m.tramo.c, s: m.tramo.s, gems: m.runGems };
  app.snaps.clear();
  app.hurtAt.clear(); app.lastHp.clear();
  app.phase = 'play';
  enterPlay();
  if (!m.roster.some((r) => r.id === app.myId)) toast('Mirando: entrás en el próximo tramo', 3000);
}

function guestFrame(dt, view) {
  const me = view.players.find((p) => p.id === app.myId);
  const evs = takeEvents();
  if (!me) return; // mirando: entra en el próximo tramo
  let tilt = readTilt(), hold = input.hold;
  if (app.auto) {
    const o = botThink({ ...view, ...app.fields }, me, app.autoMem, dt);
    tilt = o.tilt; hold = o.hold; evs.push(...o.events);
  }
  for (const e of evs) { app.conn.send({ t: 'ev', s: ++app.seq, e }); localFeedback(e, me, view); }
  app.inT += dt;
  if (app.inT >= 1 / CFG.INPUT_HZ) {
    app.inT %= 1 / CFG.INPUT_HZ;
    app.conn.send({ t: 'in', x: Math.round(tilt * 100) / 100, h: hold ? 1 : 0 });
  }
}

/* Destello, sonido y vibración propios al instante, sin esperar al anfitrión. */
function localFeedback(e, me, view) {
  if (me.ko || me.trapped || me.stun) return;
  if (e === 'tap') {
    if (me.grounded) { sfx('jump'); app.skip.jump++; }
    else if (me.ammo > 0) {
      sfx('shot'); vibrate(12); app.skip.shot++;
      R.fx({ k: 'shot', id: me.id, x: me.x, y: me.y + CFG.PH / 2 + 2, vx: me.vx * 0.15, vy: CFG.SHOT_SPEED + Math.max(0, me.vy) }, view);
    } else sfx('empty');
  } else if (e === 'up') { sfx('tug'); vibrate(20); app.skip.tug++; }
}

function guestFx(list) {
  const view = app.view || { players: [] };
  for (const ev of list) {
    if (ev.id === app.myId && app.skip[ev.k] > 0) { app.skip[ev.k]--; continue; }
    playFx(ev, view);
  }
}

/* ───────────────────────── Vistas ───────────────────────── */
function simView(alpha) {
  const sim = app.sim;
  return {
    lv: app.lv, t: sim.t, meId: app.myId, gemsTaken: sim.gemsTaken, gems: sim.gems,
    players: sim.players.map((p) => ({
      id: p.id, idx: p.idx, name: p.name, color: p.color, hero: p.hero,
      x: lerp(p.px, p.x, alpha), y: lerp(p.py, p.y, alpha), vx: p.vx, vy: p.vy, hp: p.hp, ammo: p.ammo,
      grounded: p.grounded, anchored: p.anchored, ko: p.ko, trapped: p.trapped >= 0, inv: p.invT > 0,
      stun: p.stunT > 0, off: !p.conn, left: p.facing < 0, hurtAgo: sim.t - p.hurtT,
    })),
    creatures: sim.creatures.map((c) => ({
      kind: c.kind, alive: c.alive, x: lerp(c.px, c.x, alpha), y: lerp(c.py, c.y, alpha),
      dir: c.dir, angry: c.angryT > 0, flash: c.flashT > 0, aim: c.aimT > 0, sleep: c.mode === 'sleep' && c.kind === 'bat',
    })),
    arrows: sim.arrows,
    ...(sim.cam ? { chase: true, camY: lerp(sim.cam.py, sim.cam.y, alpha), chaseWarn: sim.cam.warn > 0 } : {}),
    ...bossView(sim.boss, alpha),
  };
}
function bossView(B, alpha) {
  if (!B) return {};
  return {
    bossDead: B.dead,
    boss: { x: lerp(B.px, B.x, alpha), y: lerp(B.py, B.y, alpha), hp: B.hp, max: B.max, state: B.state, dead: B.dead,
      gateClosed: B.gateClosed, beams: B.beams.map((b) => b.y), stun: B.stunT > 0 },
  };
}

function guestView(now) {
  const smp = app.snaps.sample(now, CFG.INTERP_DELAY);
  if (!smp) return null;
  const [a, b, f] = smp;
  const L = app.snaps.latest();
  const players = [];
  app.roster.forEach((r, i) => {
    const pa = a.p[i], pb = b.p[i];
    if (!pb) return;
    let x, y, s;
    if (r.id === app.myId) { // el propio, extrapolado desde el último estado
      s = L.p[i];
      const age = Math.min(Math.max(0, now - L.recv), CFG.EXTRAP_MAX);
      x = s[0] + s[2] * age; y = s[1] + s[3] * age;
    } else { s = pb; x = lerp(pa ? pa[0] : pb[0], pb[0], f); y = lerp(pa ? pa[1] : pb[1], pb[1], f); }
    const fl = s[6], hp = s[4];
    const last = app.lastHp.get(r.id);
    if (last != null && hp < last) app.hurtAt.set(r.id, now);
    app.lastHp.set(r.id, hp);
    players.push({
      id: r.id, idx: i, name: r.name, color: r.color, hero: r.hero, x, y, vx: s[2], vy: s[3], hp, ammo: s[5],
      grounded: !!(fl & PF.grounded), anchored: !!(fl & PF.anchored), ko: !!(fl & PF.ko), trapped: !!(fl & PF.trapped), diving: !!(fl & PF.diving),
      inv: !!(fl & PF.inv), stun: !!(fl & PF.stun), off: !!(fl & PF.off), left: !!(fl & PF.left),
      hurtAgo: now - (app.hurtAt.get(r.id) ?? -99),
    });
  });
  const C = app.lv.w * CFG.TILE;
  const creatures = app.lv.creatures.map((c0, i) => {
    let ca = a.c[i];
    const cb = b.c[i];
    if (!cb) return { kind: c0.kind, alive: false };
    if (ca && app.lv.wrap && Math.abs(cb[0] - ca[0]) > C / 2) ca = null; // el anfitrión la llevó a otra vuelta
    return {
      kind: c0.kind, alive: true, x: ca ? lerp(ca[0], cb[0], f) : cb[0], y: ca ? lerp(ca[1], cb[1], f) : cb[1],
      dir: cb[2] & 1 ? -1 : 1, angry: !!(cb[2] & 2), flash: !!(cb[2] & 4), aim: !!(cb[2] & 8), sleep: !!(cb[2] & 16),
    };
  });
  const gemsTaken = new Uint8Array(app.lv.gems.length);
  for (const i of L.gm || []) gemsTaken[i] = 1;
  const focus = players.find((p) => !p.ko) || players[0];
  const v = { lv: app.lv, t: lerp(a.T, b.T, f), meId: app.myId, gemsTaken, gems: L.g, players, creatures, focus };
  // Derrumbe: la cámara compartida, interpolada como el resto
  if (b.cy != null) Object.assign(v, { chase: true, camY: a.cy != null ? lerp(a.cy, b.cy, f) : b.cy, chaseWarn: !!b.cw });
  // Flechas: extrapoladas desde el último estado
  const age = Math.min(0.3, Math.max(0, now - L.recv));
  v.arrows = (L.ar || []).map(([x, y, vx, vy]) => ({ x: x + vx * age, y: y + vy * age, vx, vy }));
  if (b.b) {
    const [bx, by, hp, max, st] = b.b, ab = a.b || b.b;
    const state = BOSS_STATES[st] || 'idle';
    v.bossDead = state === 'dead';
    v.boss = { x: lerp(ab[0], bx, f), y: lerp(ab[1], by, f), hp, max, state, dead: state === 'dead', gateClosed: state !== 'wait', beams: b.bm || [], stun: false };
  }
  return v;
}

function demoView(dt) {
  if (!app.demo) app.demo = { lv: buildLevel(genTramo(424242, 0, 3, { mods: [] })), camY: 0, t: 0 };
  const d = app.demo;
  d.t += dt;
  d.camY = (d.t * 12) % Math.max(1, d.lv.pxH - R.H);
  return {
    lv: d.lv, t: d.t, meId: null, players: [], gemsTaken: new Uint8Array(d.lv.gems.length), camY: d.camY,
    creatures: d.lv.creatures.map((c, i) => ({ kind: c.kind, alive: true, x: c.x + Math.sin(d.t + i) * 4, y: c.y, dir: Math.sin(d.t * 0.5 + i) > 0 ? 1 : -1 })),
  };
}

/* ───────────────────────── Efectos ───────────────────────── */
const FX_SOUND = {
  shot: 'shot', empty: 'empty', jump: 'jump', hit: 'hit', ko: 'ko', tug: 'tug', trap: 'trap', free: 'free',
  stomp: 'stomp', land: 'land', bounce: 'bounce', kill: 'kill', chit: 'chit', plop: 'plop', heal: 'heal',
  angry: 'angry', ff: 'ff', anchor: 'anchor', fairypush: 'ff', won: 'won', wiped: 'wiped',
  aim: 'aim', arrow: 'arrow', arrowbreak: 'arrowbreak', shake: 'shake', crumble: 'crumble', reform: 'reform',
  batwake: 'batwake', gargwarn: 'gargwarn', blow: 'blow',
  chasewarn: 'rumble', chasego: 'rumble', gate: 'gate', beamwarn: 'beamwarn', beam: 'beam', zap: 'zap',
  gaze: 'gaze', eyeopen: 'eyeopen', bosshit: 'bosshit', clank: 'clank', bossdie: 'bossdie',
};
const FX_VIBRATE = { hit: 90, ko: 250, trap: 60, land: 30, ff: 40, fairypush: 40, stomp: 20, bounce: 25, zap: 60, bosshit: 40 };

function playFx(ev, view) {
  R.fx(ev, view);
  const mine = ev.id != null && ev.id === app.myId;
  if (ev.k === 'gem') sfx(ev.big ? 'biggem' : 'gem');
  else if (FX_SOUND[ev.k]) sfx(FX_SOUND[ev.k]);
  if (mine && FX_VIBRATE[ev.k]) vibrate(FX_VIBRATE[ev.k]);
  if (mine && ev.k === 'shot') vibrate(10);
  if (mine && ev.k === 'ko') toast('Fuera de combate', 2200);
  if (ev.k === 'won') toast(app.tramo?.kind === 'boss' ? '¡El Ojo vencido! Ahora, por afuera' : app.tramo?.kind === 'exterior' ? '¡Adentro!' : '¡Tramo superado!', 1400);
  if (ev.k === 'chasewarn') toast('¡DERRUMBE! La cámara se suelta de ti', CFG.CHASE_WARN * 1000);
  if (ev.k === 'gate') toast('¡EL OJO!', 1600);
  if (ev.k === 'bossdie') toast('¡El Ojo vencido!', 2000);
  if (ev.k === 'wiped') toast('Cayeron todos…', 1400);
}

/* ───────────────────────── Premios y fin de run ───────────────────────── */
function showAwards(res) {
  app.phase = 'awards';
  setScreen('awards');
  app.telAt = saveTel({
    tramo: res.c * 7 + (res.s ?? 0), c: res.c, k: res.k, s: res.s, kind: res.kind, sub: res.sub, rings: res.rings, mods: res.mods, dur: res.dur, gems: res.gems,
    counters: res.stats, result: res.result, players: res.players, role: app.role, rating: null,
  });
  renderAwards(res, { isHost: app.role === 'host' }, { rate: (r) => rateTel(app.telAt, r) });
}

function showRunEnd(msg) {
  app.phase = 'runend';
  app.lastRunEnd = msg;
  setScreen('runend');
  renderRunEnd(msg, { isHost: app.role === 'host' });
}

/* ───────────────────────── Bucle ───────────────────────── */
let lastT = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;
  frame(dt, t / 1000);
}

function frame(dt, now) {
  let view = null;
  if (app.role === 'host' && app.sim && app.phase !== 'lobby') {
    if (app.screen === 'play') hostFrame(dt);
    view = simView(Math.min(1, app.acc / STEP));
  } else if (app.role === 'guest' && app.lv && app.phase !== 'lobby' && app.screen !== 'lobby') {
    view = guestView(now);
    if (view && app.screen === 'play') guestFrame(dt, view);
  }
  if (!view) { takeEvents(); view = demoView(dt); }
  app.view = view;
  if (app.online) voice.setModes(...voiceModes(view));
  if (R.lv !== view.lv) R.setLevel(view.lv);
  R.draw(view, dt);
  windAmbience(app.screen === 'play' && !!view.lv?.wrap);
  if (app.screen === 'play') {
    $('gemcount').textContent = app.runInfo.gems + (view.gems || 0);
    if (view.lv.wrap) { // aviso y ráfaga del viento a la altura propia
      const me = view.players.find((p) => p.id === app.myId) || view.focus;
      const w = me ? windAt(view.lv, view.t, me.y) : { v: 0, warn: 0 };
      const ws = w.v ? 'gust' : w.warn ? 'warn' : '';
      if (ws !== app.windState) { if (ws) sfx(ws === 'gust' ? 'gust' : 'windwarn'); app.windState = ws; }
    }
    const me = view.players.find((p) => p.id === app.myId);
    const ko = !!me?.ko;
    if (ko !== app.wasKo) { app.wasKo = ko; musicFilter(!ko); }
  }
}

/* ───────────────────────── Botones ───────────────────────── */
function bindUI() {
  const gesture = () => {
    unlockAudio();
    voice.refresh(); // reanuda audio remoto bloqueado por autoplay y arma el eco
    if (needsTiltPermission() && input.gamma == null) requestTiltPermission();
  };
  addEventListener('pointerup', gesture, { passive: true });
  addEventListener('keydown', () => unlockAudio());

  $('btn-create').onclick = () => createRoom();
  $('btn-join').onclick = () => {
    const c = $('join-code').value.trim().toUpperCase();
    if (c.length !== 4) { $('title-msg').textContent = 'El código tiene 4 letras.'; return; }
    joinRoom(c);
  };
  $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
  $('btn-solo').onclick = () => startSolo(2);
  const canFull = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
  if (standalone) $('btn-full').classList.add('hidden');
  $('btn-full').onclick = async () => {
    if (!canFull) { $('ios-tip').classList.remove('hidden'); return; }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('portrait');
    } catch { /* algunos navegadores no dejan trabar la orientación */ }
  };
  $('btn-settings').onclick = () => overlay('settings', true);
  $('btn-pause-settings').onclick = () => overlay('settings', true);
  $('btn-settings-close').onclick = () => { overlay('settings', false); saveSettings(); applySettings(); voice.refresh(); };
  $('btn-calibrate').onclick = async () => {
    await requestTiltPermission();
    toast(calibrate() ? 'Inclinación calibrada' : 'Sin sensor de inclinación');
  };
  bindSettings(() => { saveSettings(); applySettings(); voice.refresh(); });
  $('btn-mic').onclick = toggleMic;
  $('micbtn').onclick = toggleMic;

  // Sala
  $('me-name').addEventListener('input', (e) => { profile.name = clean(e.target.value); saveProfile(); profileChanged(); });
  $('btn-share').onclick = async () => {
    const url = roomLink(app.code);
    try {
      if (navigator.share) await navigator.share({ title: 'DOWNCASTLE', text: `¡Bajá conmigo al castillo! Sala ${app.code}`, url });
      else { await navigator.clipboard.writeText(url); toast('Link copiado'); app.lobbyMsg = 'Link copiado.'; renderLobbyUI(); }
    } catch { /* cancelado */ }
  };
  $('btn-ready').onclick = async () => {
    unlockAudio();
    if (!app.ready) { // «sostené el teléfono como vas a jugar»
      const ok = await requestTiltPermission();
      if (!calibrate()) input.gamma0 = null; // se calibra con la primera lectura
      if (!ok) toast('Sin permiso de inclinación: usá Arrastrar en Ajustes', 2600);
    }
    app.ready = !app.ready;
    if (app.role === 'host') { selfEntry(); publishLobby(); }
    else { app.conn?.send({ t: 'ready', v: app.ready }); const me = entry(app.myId); if (me) me.ready = app.ready; renderLobbyUI(); }
  };
  $('btn-start').onclick = () => { if (app.role === 'host' && canStart()) startRun(); };
  $('btn-leave').onclick = () => toTitle();

  // Premios
  $('btn-next').onclick = () => hostNext();
  $('btn-endrun').onclick = () => hostRunEnd();
  $('btn-tolobby').onclick = () => hostToLobby();

  // Pausa (la partida sigue para los demás; sin otros humanos, se congela)
  $('pausebtn').onclick = () => {
    overlay('pause', true);
    const humans = app.lobby.filter((e) => !e.bot && e.id !== app.myId && e.on !== false);
    app.paused = app.role === 'host' && !humans.length;
    $('pause-tip').textContent = app.paused ? 'Partida en pausa.' : 'La partida sigue para los demás.';
  };
  $('btn-resume').onclick = () => { overlay('pause', false); app.paused = false; };
  $('btn-quit').onclick = () => toTitle();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.screen === 'play' && app.role === 'host' && !app.lobby.some((e) => !e.bot && e.id !== app.myId && e.on !== false)) {
      overlay('pause', true);
      app.paused = true;
      $('pause-tip').textContent = 'Partida en pausa.';
    }
  });
}

/* ───────────────────────── Depuración ───────────────────────── */
window.__downcastle = {
  /** Bots (jugadores locales con IA) en el anfitrión; entran al final de la cadena. */
  bots(n) {
    if (app.role !== 'host') return 'solo el anfitrión tiene bots';
    setBots(n);
    publishLobby();
    return app.lobby.length;
  },
  /** Corre n cuadros completos (red, vista, dibujo) sin rAF: sirve con la pestaña oculta. */
  tick(n = 1, dt = 1 / 60) {
    for (let i = 0; i < n; i++) frame(dt, performance.now() / 1000 + i * dt);
    return this.state();
  },
  /** Simula `seg` segundos sin rAF (anfitrión). */
  advance(seg) {
    if (app.role !== 'host' || !app.sim) return null;
    const n = Math.round(seg * CFG.SIM_HZ);
    for (let i = 0; i < n && app.screen === 'play'; i++) hostStep();
    return this.state();
  },
  state() {
    const v = app.view;
    return {
      screen: app.screen, role: app.role, online: app.online, code: app.code, myId: app.myId, phase: app.phase,
      ready: app.ready, lobby: app.lobby.map((e) => ({ id: e.id, name: e.name, ready: e.ready, on: e.on, bot: !!e.bot, pending: !!e.pending })),
      tramo: app.tramo && { seed: app.tramo.seed, c: app.tramo.c, k: app.tramo.k, s: app.tramo.s, kind: app.tramo.kind, sub: app.tramo.sub, mods: app.tramo.mods, chunks: app.tramo.chunks },
      cam: app.sim?.cam ? Math.round(app.sim.cam.y) : (v?.camY != null ? Math.round(v.camY) : null),
      boss: v?.boss ? { hp: v.boss.hp, state: v.boss.state, gate: v.boss.gateClosed } : null,
      status: app.sim?.status, t: app.sim?.t, gems: (app.run?.gems ?? app.runInfo.gems) + (v?.gems || 0),
      players: (v?.players || []).map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, ko: p.ko, off: p.off })),
      res: app.lastRes && { result: app.lastRes.result, awards: app.lastRes.awards.map((a) => a.name) },
    };
  },
  seed(s) { app.seedBase = s >>> 0; if (app.run) app.run.seed = app.seedBase; return app.seedBase; },
  /** Piloto automático para el jugador local (sirve también en los invitados). */
  auto(on = true) { app.auto = !!on; return app.auto; },
  /** Arranca la run sin esperar a que estén listos (anfitrión). */
  start() { if (app.role === 'host') startRun(); return this.state(); },
  /** Salta al tramo k del ciclo c (k = 4 o { boss: true }: el jefe; { ext: 'mini' | 'bajada' }: el
      exterior), con { mods } forzados. Anfitrión. */
  goto(c = 0, k = 0, o = {}) {
    if (app.role !== 'host') return 'solo el anfitrión';
    const s = o.ext ? CYCLE_SEQ.findIndex((e) => e.ext === o.ext) : seqOf(o.boss ? 4 : Math.min(4, k));
    const at = { c, s, force: o.ext ? null : { mods: o.mods, boss: !!o.boss, only: o.only } };
    if (!app.run) startRun(at);
    else { Object.assign(app.run, { c: at.c, s: at.s, force: at.force, over: false }); startTramo(); }
    return this.state();
  },
  next() { hostNext(); return this.state(); },
  toLobby() { if (app.role === 'host') hostToLobby(); },
  get app() { return app; },
  voice: () => voice.debug(),
  voiceStats: () => voice.stats(),
  get sim() { return app.sim; },
};

/* ───────────────────────── Arranque ───────────────────────── */
async function boot() {
  R = createRenderer($('game'));
  initInput(document.body, { playerScreenX: () => { const me = app.view?.players.find((p) => p.id === app.myId); return me ? R.screenX(me.x) : null; } });
  bindUI();
  try { await loadSprites(); } catch (e) { $('loading').textContent = 'No se pudieron cargar los sprites'; throw e; }
  $('loading').classList.add('hidden');
  requestAnimationFrame(loop);
  const sala = (params.get('sala') || '').toUpperCase();
  if (params.get('ver') === 'bloques') { showBlockViewer(); return; }
  if (params.get('solo') === '1') startSolo(params.has('bots') ? +params.get('bots') : 2);
  else if (sala) joinRoom(sala);
  else toTitle();
}
boot();
