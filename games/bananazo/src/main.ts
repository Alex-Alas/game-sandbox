// BANANAZO: desactivar bombas de a tres (clon de BOMBANANA!). Uno no ve (CIEGO, el único que toca la bomba), uno no oye
// (SORDO, el único que la ve) y uno no habla (MUDO, el único con el manual). Flujo: portada → sala (papeles y bomba) → sesión
// informativa → bomba → resultado → …  El anfitrión corre la bomba (sim/bomb.ts) y reparte el estado; todo lo que hace cada
// uno (acciones, mano, gestos, bananazos, chat, si está hablando) pasa por él, y cada cliente filtra lo que le toca según su
// papel (sim/const.ts: hears/sees). La práctica es un anfitrión sin red en el que se cambia de papel.
import { app, roleOfId, type Sel, type Seat, type Result, type Hand } from './app.ts';
import { newBomb, step, allowed, nextAct, speedOf, ENV_NAME, HAZARD_NAME, HAZARDS, type Bomb, type Spec, type Hazard, type Env } from './sim/bomb.ts';
import { CAMPAIGN, LEVEL_NAMES, endless, custom, CUSTOM_DEFAULT, known, news, type Custom } from './sim/levels.ts';
import { KINDS, isKind, modName, isChaos, type Act, type Ev } from './sim/mods.ts';
import { tables } from './sim/tables.ts';
import { ROLES, ROLE_NAME, GESTURES, GESTURE_NAME, BRAILLE, hears, isGesture, type Role, type Gesture } from './sim/const.ts';
import { hitBomb, hitMod, touchMod, cellAt, actXY } from './draw.ts';
import { render, toBomb } from './view.ts';
import { mountManual, HOW } from './manual.ts';
import * as A from './audio.ts';
import { createVoice, voiceSupported } from './voice.ts';
import { connect, randomCode, validCode, pidFor, ERRORS, GAME, PROTO, SEATS, type Msg } from './net.ts';
import { bgTicker } from './bgtick.ts';
import { initFullscreen, autoFs } from './fullscreen.ts';
import { renderSVG } from 'uqr';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const cv = $<HTMLCanvasElement>('game'), g = cv.getContext('2d')!;
const HZ = 30, DT = 1 / HZ;
const params = new URLSearchParams(location.search);

// ---- Guardado ----------------------------------------------------------------------------------------------------
type Save = { name: string, prog: number, stars: number[], inf: number, custom: Custom };
const SAVE: Save = (() => {
  const d: Save = { name: '', prog: 0, stars: [], inf: 0, custom: { ...CUSTOM_DEFAULT, mods: CUSTOM_DEFAULT.mods.slice(), hz: [] } };
  try {
    const r = JSON.parse(localStorage.getItem('bananazo.save') ?? 'null');
    if (r && typeof r === 'object') {
      if (typeof r.name === 'string') d.name = r.name.slice(0, 14);
      if (Number.isInteger(r.prog)) d.prog = Math.max(0, Math.min(CAMPAIGN.length - 1, r.prog));
      if (Array.isArray(r.stars)) d.stars = r.stars.map((x: unknown) => Number(x) || 0).slice(0, CAMPAIGN.length);
      if (Number.isInteger(r.inf)) d.inf = r.inf;
      if (r.custom && Array.isArray(r.custom.mods)) d.custom = { ...d.custom, ...r.custom, mods: r.custom.mods.filter(isKind), hz: (r.custom.hz ?? []).filter((h: Hazard) => HAZARDS.includes(h)) };
    }
  } catch { /* sin almacenamiento */ }
  if (!d.name) d.name = 'Mono' + Math.floor(Math.random() * 90 + 10);
  return d;
})();
const save = () => { try { localStorage.setItem('bananazo.save', JSON.stringify(SAVE)); } catch { /* */ } };
if (params.get('todo') === '1') SAVE.prog = CAMPAIGN.length - 1; // para probar: todos los niveles abiertos

// ---- Pantallas ---------------------------------------------------------------------------------------------------
const SCREENS = ['s-title', 's-lobby', 's-brief', 's-end', 's-help', 's-manual'];
function screen(id: string | null) { for (const s of SCREENS) $(s).hidden = s !== id; $('hud').hidden = id !== null; }
function toast(msg: string, bad = false, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg;
  $('toasts').append(el);
  setTimeout(() => el.remove(), ms);
}
function syncScreen() {
  document.body.classList.toggle('blind', app.phase === 'play' && app.view === 'ciego');
  if (helpOpen || manualOpen) return;
  if (app.phase === 'title') screen('s-title');
  else if (app.phase === 'lobby') { screen('s-lobby'); renderLobby(); }
  else if (app.phase === 'brief') { screen('s-brief'); renderBrief(); }
  else if (app.phase === 'end' && app.overT >= 1.4) { screen('s-end'); renderResult(); }
  else { screen(null); setupHud(); }
}
let helpOpen = false, manualOpen = false;

// ---- Red: anfitrión e invitados ----------------------------------------------------------------------------------
const voice = createVoice((to, d) => toHost({ t: 'rtc', to, d }), on => toHost({ t: 'talk', on }));
const isHostish = () => app.host || app.practice;
function broadcast(m: Msg) { if (app.online && app.host) app.conn?.send({ m }); }
function sendTo(id: number, m: Msg) { if (app.online && app.host) app.conn?.send({ to: id, m }); }
// Todo lo que hace este cliente pasa por acá: el anfitrión se lo atiende a sí mismo con el mismo código que a los demás
function toHost(m: Msg) {
  if (isHostish()) fromPeer(app.myId, m);
  else if (app.online) app.conn?.send(m);
}

function mySeat(): Seat | undefined { return app.seats.find(s => s.id === app.myId); }
function lobbyMsg(): Msg { return { t: 'lobby', seats: app.seats, sel: app.sel, prog: app.prog }; }
function pushLobby() { broadcast(lobbyMsg()); if (app.phase === 'lobby') renderLobby(); voiceSync(); }

// El anfitrión recibe (de sí mismo o de un invitado)
const lastHit = new Map<number, number>();
function fromPeer(id: number, m: Msg) {
  const seat = app.seats.find(s => s.id === id), role = app.practice ? app.view : seat?.role ?? null;
  switch (m.t) {
    case 'hello': {
      if (m.g !== GAME) { app.conn?.send({ to: id, m: { t: 'bye', why: 'game' } }); app.conn?.send({ t: 'drop', id }); return; }
      if (m.v !== PROTO) { app.conn?.send({ to: id, m: { t: 'bye', why: 'proto' } }); app.conn?.send({ t: 'drop', id }); return; }
      const name = String(m.name ?? '').slice(0, 14) || 'Mono';
      if (!seat && app.seats.length >= SEATS) { app.conn?.send({ to: id, m: { t: 'bye', why: 'full' } }); app.conn?.send({ t: 'drop', id }); return; }
      if (seat) { seat.name = name, seat.on = true; } else app.seats.push({ id, name, role: null, on: true });
      if (id !== app.myId) addLog(`${name} entró.`);
      pushLobby();
      if (id !== app.myId && app.phase !== 'lobby' && app.phase !== 'title') catchUp(id);
      return;
    }
    case 'name': if (seat) { seat.name = String(m.name ?? '').slice(0, 14) || seat.name; pushLobby(); } return;
    case 'leave': if (seat && id !== app.myId) { dropSeat(id); addLog(`${seat.name} salió.`); } return;
    case 'role': {
      if (!seat || app.phase !== 'lobby') return;
      const r = m.r as Role | null;
      if (r === null || r === seat.role) seat.role = null;
      else if (ROLES.includes(r) && !app.seats.some(s => s.role === r && s.id !== id && s.on)) {
        for (const s of app.seats) if (s.role === r) s.role = null; // el que se fue deja su lugar
        seat.role = r;
      }
      pushLobby();
      return;
    }
    case 'act': {
      const a = m.a as Act;
      if (app.phase !== 'play' || app.cd > 0 || !app.bomb || !a || typeof a !== 'object' || !Number.isInteger(a.m) || typeof a.a !== 'string') return;
      if (!app.practice && (!role || !allowed(role, a))) return;
      queue.push({ m: a.m, a: a.a, v: Number.isFinite(a.v) ? a.v : undefined });
      return;
    }
    case 'hand': {
      if (role !== 'ciego' && !app.practice) return;
      const mi = m.m as number, x = +(m.x as number), y = +(m.y as number);
      app.hand = Number.isInteger(mi) && mi >= 0 && mi < (app.bomb?.mods.length ?? 0) && Number.isFinite(x) && Number.isFinite(y) ? { m: mi, x, y } : null;
      liveDirty = true;
      return;
    }
    case 'ges': if (role && isGesture(m.g)) socAll({ t: 'soc', k: 'ges', r: role, g: m.g }); return;
    case 'hit': {
      const to = m.to as Role;
      if (!role || !ROLES.includes(to) || to === role) return;
      if (app.now - (lastHit.get(id) ?? -9) < 0.5) return;
      lastHit.set(id, app.now);
      socAll({ t: 'soc', k: 'hit', from: role, to });
      return;
    }
    case 'chat': {
      const s = String(m.s ?? '').trim().slice(0, 140);
      if (!s || !seat) return;
      if (app.phase === 'play' && role === 'mudo' && !app.practice) return; // el mudo no habla, tampoco por escrito
      socAll({ t: 'soc', k: 'chat', id, name: seat.name, r: role, s });
      return;
    }
    case 'talk': if (role) { app.talk[role] = !!m.on; liveDirty = true; } return;
    case 'rtc': {
      const to = m.to as number;
      if (to === app.myId) voice.onSignal(id, m.d as never);
      else sendTo(to, { t: 'rtc', from: id, d: m.d });
      return;
    }
  }
}
function socAll(m: Msg) { broadcast(m); onSoc(m); }
// Libera el lugar (la sala es de 3: si no, el que se fue lo tiene reservado para siempre)
function dropSeat(id: number) {
  app.seats = app.seats.filter(s => s.id !== id);
  app.conn?.send({ t: 'drop', id });
  pushLobby();
}
const dropTimers = new Map<number, number>();
// Alguien entró con la partida empezada: le manda todo lo que hace falta
function catchUp(id: number) {
  sendTo(id, briefMsg());
  if (app.phase === 'play' || app.phase === 'end') { sendTo(id, { t: 'phase', ph: 'play', cd: Math.max(0, app.cd) }); sendTo(id, { t: 'st', b: app.bomb, ev: [] }); }
  if (app.phase === 'end' && app.result) sendTo(id, { t: 'phase', ph: 'end', res: app.result });
}

// Invitado: lo que llega del anfitrión
function fromHost(m: Msg) {
  switch (m.t) {
    case 'bye': leave(ERRORS[m.why as string] ?? 'Te sacaron de la sala.'); return;
    case 'lobby': {
      app.seats = m.seats as Seat[]; app.sel = m.sel as Sel; app.prog = m.prog as number;
      if (app.phase === 'lobby') renderLobby();
      voiceSync();
      return;
    }
    case 'phase': onPhase(m); return;
    case 'st': {
      if (!app.bomb) return;
      app.bomb = m.b as Bomb; app.timeShown = app.bomb.time;
      onEvents((m.ev as Ev[]) ?? []);
      return;
    }
    case 'live': {
      if (app.view !== 'ciego') app.hand = (m.h as Hand | null) ?? null;
      Object.assign(app.talk, m.tk as object);
      return;
    }
    case 'soc': onSoc(m); return;
    case 'rtc': voice.onSignal(m.from as number, m.d as never); return;
  }
}
function onPhase(m: Msg) {
  if (m.ph === 'lobby') { app.phase = 'lobby'; stopGame(); syncScreen(); return; }
  if (m.ph === 'brief') {
    setupBomb(m.spec as Spec, m.seed as number);
    app.levelN = m.n as number; app.wave = m.wave as number;
    app.phase = 'brief'; app.result = null; app.overT = 0;
    stopGame();
    syncScreen();
    return;
  }
  if (m.ph === 'play') { app.phase = 'play'; app.cd = m.cd as number; startGame(); syncScreen(); return; }
  if (m.ph === 'end') { app.result = m.res as Result; app.phase = 'end'; app.overT = Math.max(app.overT, 1.4); if (!app.practice) recordResult(app.result); syncScreen(); return; }
}

// ---- Partidas (anfitrión) ----------------------------------------------------------------------------------------
let queue: Act[] = [], acc = 0, stT = 0, liveT = 0, liveDirty = false;
function setupBomb(spec: Spec, seed: number) {
  app.spec = spec; app.seed = seed;
  app.bomb = newBomb(spec, seed);
  app.L = null; // la grilla la arma la vista según la pantalla de cada uno
  app.timeShown = app.bomb.time;
  app.zoom = -1; app.zoomK = 0; app.hand = null; queue = [];
}
function specFor(sel: Sel, seed: number): Spec {
  if (sel.mode === 'camp') return CAMPAIGN[sel.n];
  if (sel.mode === 'inf') return endless(app.wave, app.runSeed);
  return custom(sel.c, seed);
}
const briefMsg = (): Msg => ({ t: 'phase', ph: 'brief', spec: app.spec, seed: app.seed, n: app.levelN, wave: app.wave });
function hostBrief() {
  const seed = (Math.random() * 2 ** 31) | 0;
  if (app.sel.mode === 'inf' && app.phase !== 'end') app.wave = 0, app.runSeed = seed;
  app.levelN = app.sel.mode === 'camp' ? app.sel.n : -1;
  const m = { ...briefMsg(), spec: specFor(app.sel, seed), seed };
  broadcast(m);
  onPhase(m);
}
function hostArm() {
  const m = { t: 'phase', ph: 'play', cd: 3 };
  broadcast(m);
  onPhase(m);
}
function hostEnd() {
  const b = app.bomb!, win = b.over === 1;
  const res: Result = { win, why: b.why, time: Math.round(b.time), strikes: b.strikes, stars: win ? Math.max(1, 3 - b.strikes) : 0,
    wave: app.wave, n: app.levelN, mode: app.sel.mode };
  const m = { t: 'phase', ph: 'end', res };
  broadcast(m);
  onPhase(m);
}
function hostToLobby() { const m = { t: 'phase', ph: 'lobby' }; broadcast(m); onPhase(m); pushLobby(); }
function hostNext(again: boolean) {
  const r = app.result;
  if (r && r.mode === 'camp' && !again && r.win && app.sel.mode === 'camp') app.sel = { mode: 'camp', n: Math.min(CAMPAIGN.length - 1, app.sel.n + 1) };
  if (r && r.mode === 'inf') { if (r.win && !again) app.wave++; else app.wave = 0, app.runSeed = (Math.random() * 2 ** 31) | 0; }
  if (app.sel.mode === 'camp') app.prog = Math.max(app.prog, app.sel.n);
  pushLobby();
  const seed = (Math.random() * 2 ** 31) | 0;
  app.levelN = app.sel.mode === 'camp' ? app.sel.n : -1;
  const m = { ...briefMsg(), spec: specFor(app.sel, seed), seed };
  broadcast(m);
  onPhase(m);
}
function hostStep(dt: number) {
  if (app.phase !== 'play' || !app.bomb) return;
  if (app.cd > 0) { app.cd -= dt; return; }
  const b = app.bomb;
  if (b.over) {
    app.overT += dt;
    if (app.overT >= 1.4 && !app.result) hostEnd();
    return;
  }
  acc += dt;
  let evs: Ev[] = [];
  while (acc >= DT) { acc -= DT; evs = evs.concat(step(b, DT, queue)); queue = []; }
  app.timeShown = b.time;
  stT += dt;
  if (evs.length || stT > 0.25) { stT = 0; broadcast({ t: 'st', b, ev: evs }); }
  if (evs.length) onEvents(evs);
  liveT += dt;
  if (liveT > 1 / 15 && (liveDirty || liveT > 1)) { liveT = 0; liveDirty = false; broadcast({ t: 'live', h: app.hand, tk: app.talk }); }
}
function recordResult(r: Result) {
  if (r.mode === 'camp' && r.win && r.n >= 0) {
    SAVE.stars[r.n] = Math.max(SAVE.stars[r.n] ?? 0, r.stars);
    SAVE.prog = Math.max(SAVE.prog, Math.min(CAMPAIGN.length - 1, r.n + 1));
    if (isHostish()) app.prog = Math.max(app.prog, SAVE.prog);
  }
  if (r.mode === 'inf') SAVE.inf = Math.max(SAVE.inf, r.wave + (r.win ? 1 : 0));
  save();
}

// ---- Partida (todos) ---------------------------------------------------------------------------------------------
function startGame() {
  const me = mySeat();
  if (!app.practice && me?.role) app.view = me.role;
  A.unlock(); A.stopAll(); A.setListener(app.view);
  A.ambient(app.bomb!.spec.env);
  app.overT = 0; app.result = null; app.caps = []; app.hits = [];
  for (const r of ROLES) app.ges[r] = null;
  lastSec = Math.ceil(app.timeShown);
}
function stopGame() { A.stopAll(); A.setListener('todos'); voice.setDuck(1); }
let lastSec = 0;
function onEvents(evs: Ev[]) {
  const b = app.bomb;
  for (const e of evs) {
    const m = e.m != null && b ? b.mods[e.m] : null;
    switch (e.e) {
      case 'snd':
        if (e.s === 'cut') A.S.cut(); else if (e.s === 'key') A.S.key(e.v ?? 0); else if (e.s === 'flip') A.S.flip(); else if (e.s === 'slide') A.S.slide();
        else if (e.s === 'turn') { A.S.turn(); if (m?.k === 'dial' && m.ptr === m.buzz[m.stage]) A.S.buzz(); }
        else if (e.s === 'pump') A.S.pump(); else if (e.s === 'wall') A.S.wall();
        else { A.S.click(); if (m?.k === 'bells' && e.v === m.ring) A.S.bell(); }
        ripple(false);
        break;
      case 'note': A.S.note(e.v ?? 0, +(e.s ?? 2)); ripple(false); break;
      case 'stage': A.S.stage(); break;
      case 'ok': A.S.ok(); if (app.view === 'sordo' && app.zoom === e.m) app.zoom = -1; break;
      case 'strike': A.S.strike(); app.shake = Math.max(app.shake, 0.5); app.flash = 0.35; app.flashCol = '#ff2a2a'; ripple(true); vibrate(120); break;
      case 'vent': A.S.vent(); break;
      case 'bump': A.S.bump(); app.shake = 1; app.bumpT = app.now; vibrate(60); break;
      case 'dark': if (e.v) A.S.dark(); else A.S.light(); break;
      case 'boom': A.S.boom(); app.flash = 1.2; app.flashCol = '#fff'; app.shake = 1.4; vibrate(400); A.stopAll(); break;
      case 'win': A.S.win(); app.flash = 0.5; app.flashCol = '#fff6c9'; A.stopAll(); break;
    }
  }
}
function ripple(bad: boolean) { if (app.hand) app.ripples.push({ ...app.hand, t: app.now, bad }); }
const vibrate = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* */ } };

// Gestos, bananazos y chat (cada uno filtra lo suyo)
function onSoc(m: Msg) {
  const me = app.view;
  if (m.k === 'ges') {
    const r = m.r as Role, gg = m.g as Gesture;
    app.ges[r] = { g: gg, t: app.now };
    return;
  }
  if (m.k === 'hit') {
    const from = m.from as Role, to = m.to as Role;
    app.hits.push({ from, to, t: app.now });
    const live = app.phase === 'play';
    if (to === me || (app.practice && live)) {
      setTimeout(() => { app.shake = Math.max(app.shake, 0.6); A.S.slap(); vibrate(90); }, 400);
      if (to === me) toast(`¡BANANAZO del ${ROLE_NAME[from]}!`);
    } else setTimeout(() => A.S.slap(), 400);
    return;
  }
  if (m.k === 'chat') {
    const r = (m.r as Role | null) ?? null, s = String(m.s);
    if (app.phase !== 'play') { addLog(`<b>${esc(String(m.name))}</b>${r ? ` (${ROLE_NAME[r]})` : ''}: ${esc(s)}`, true); return; }
    if (!r) return;
    if (app.practice || r === me || hears(me, r)) app.caps.push({ r, s, t: app.now });
    if (me === 'ciego' && r === 'sordo' && !app.practice) A.say(s);
  }
}

// ---- Voz ---------------------------------------------------------------------------------------------------------
function voiceSync() {
  if (!app.online) return;
  voice.setId(app.myId);
  voice.sync(app.seats.filter(s => s.on && s.id !== app.myId).map(s => s.id));
}
function voiceRoutes() {
  if (!app.online) return;
  const live = app.phase === 'play' && app.overT < 1.4, me = app.view;
  voice.setRoutes(id => { const r = roleOfId(id); return !live || !r || hears(me, r); }, id => { const r = roleOfId(id); return !live || !r || hears(r, me); });
  voice.setDuck(live && app.bomb?.hz.radio ? 0.22 : 1);
}
async function toggleMic() {
  A.unlock();
  if (!voiceSupported()) { toast('Este navegador no tiene micrófono (o la página no es https).', true, 3000); return; }
  const on = await voice.setMic(!voice.micOn);
  if (!on && !voice.micOn && voiceSupported()) { /* apagado a propósito o sin permiso */ }
  micButtons();
}
function micButtons() {
  for (const id of ['b-mic', 'b-mic2']) {
    const b = $(id);
    b.classList.toggle('on', voice.micOn);
    b.textContent = id === 'b-mic' ? (voice.micOn ? 'MICRÓFONO PRENDIDO' : 'MICRÓFONO APAGADO') : voice.micOn ? 'MIC ON' : 'MIC';
    b.hidden = !app.online;
  }
}

// ---- Conexión ----------------------------------------------------------------------------------------------------
function joinRoom(code: string, create: boolean) {
  A.unlock();
  app.online = true; app.host = create; app.practice = false; app.code = code;
  app.seats = []; app.phase = 'lobby'; app.prog = SAVE.prog;
  app.sel = { mode: 'camp', n: SAVE.prog };
  history.replaceState(null, '', `?sala=${code}`);
  $('log').innerHTML = '';
  addLog(create ? 'Sala creada. Pasales el código o el link a los otros dos monos.' : 'Entrando…');
  app.conn = connect(code, create, pidFor(code), {
    welcome: ({ id, host }) => {
      app.myId = id; app.host = host;
      if (host) { if (!app.seats.some(s => s.id === id)) fromPeer(id, { t: 'hello', g: GAME, v: PROTO, name: SAVE.name }); }
      else app.conn!.send({ t: 'hello', g: GAME, v: PROTO, name: SAVE.name });
      voiceSync();
      syncScreen();
    },
    message: m => {
      if (app.host) {
        if (m.t === 'from') fromPeer(m.id as number, m.m as Msg);
        else if (m.t === 'peer') {
          const s = app.seats.find(x => x.id === m.id);
          if (s) { s.on = !!m.on; addLog(`${s.name} ${m.on ? 'volvió' : 'se desconectó'}.`); pushLobby(); }
          // en la sala, al que no vuelve en 20 s se le libera el lugar (con la bomba armada se lo espera)
          clearTimeout(dropTimers.get(m.id as number));
          if (s && !m.on) dropTimers.set(s.id, setTimeout(() => { if (!s.on && app.phase === 'lobby' && app.host) dropSeat(s.id); }, 20000) as unknown as number);
        }
      } else fromHost(m);
    },
    status: (st, why) => {
      if (st === 'reconnecting') toast('Reconectando…', true);
      if (st === 'closed') leave(ERRORS[why ?? 'net'] ?? 'Se cortó la conexión.');
    },
  });
  syncScreen();
}
function leave(msg?: string) {
  if (app.online && !app.host && !msg) app.conn?.send({ t: 'leave' });
  try { sessionStorage.removeItem(`bananazo.pid.${app.code}`); } catch { /* */ }
  app.conn?.close(); app.conn = null;
  voice.setMic(false); voice.reset();
  stopGame(); bg.stop();
  Object.assign(app, { online: false, host: false, practice: false, phase: 'title', bomb: null, seats: [], result: null });
  history.replaceState(null, '', location.pathname);
  micButtons();
  syncScreen();
  if (msg) toast(msg, true, 3500);
}
function startPractice(n?: number) {
  A.unlock();
  Object.assign(app, { online: false, host: true, practice: true, myId: 0, phase: 'lobby', prog: SAVE.prog });
  app.seats = [{ id: 0, name: SAVE.name, role: null, on: true }];
  app.sel = { mode: 'camp', n: n ?? SAVE.prog };
  app.view = 'sordo';
  syncScreen();
}
// Con la pestaña oculta el anfitrión sigue corriendo la bomba (si no, se congela para todos)
const bg = bgTicker(() => { if (document.hidden && app.online && app.host) { const now = performance.now(); hostStep(Math.min(0.1, (now - bgLast) / 1000)); bgLast = now; } }, 33);
let bgLast = performance.now();
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.online && app.host) { bgLast = performance.now(); bg.start(); } else bg.stop();
});

// ---- Sala --------------------------------------------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function addLog(html: string, raw = false) {
  const log = $('log'), p = document.createElement('div');
  if (raw) p.innerHTML = html; else { p.className = 'sys'; p.textContent = html; }
  log.append(p); log.scrollTop = log.scrollHeight;
  while (log.children.length > 80) log.firstChild!.remove();
}
const ROLE_DESC: Record<Role, string> = {
  ciego: 'Toca la bomba: corta, aprieta, gira. No ve nada; siente el braille y lo que quema. Oye solo al SORDO.',
  sordo: 'Ve la bomba, el reloj y los gestos de los otros. No oye nada. Habla y lo oyen los dos.',
  mudo: 'Tiene el manual. Oye a los dos pero no puede hablar: hace gestos que solo ve el SORDO.',
};
function renderLobby() {
  const host = isHostish();
  $('lobby-title').textContent = app.practice ? 'PRÁCTICA' : 'SALA';
  $('lobby-code').textContent = app.practice ? '' : app.code;
  $('b-copy').hidden = app.practice;
  $('b-share').hidden = app.practice || !navigator.share;
  const qr = $('qr');
  qr.hidden = app.practice;
  if (!app.practice && qr.dataset.code !== app.code) {
    qr.dataset.code = app.code;
    qr.innerHTML = `${renderSVG(roomLink(), { border: 1 })}<p class="why">Para entrar desde otro teléfono: escaneá el código o abrí el link.<br>Son de a 3: uno por papel.</p>`;
  }
  $('seats').hidden = app.practice;
  $('chatpanel').hidden = app.practice;
  $('chatpanel').parentElement!.classList.toggle('one', app.practice);
  if (!app.practice) {
    $('seats').innerHTML = ROLES.map(r => {
      const s = app.seats.find(x => x.role === r), mine = s?.id === app.myId;
      return `<button class="seat ${r}${mine ? ' mine' : ''}" data-r="${r}"><h4>${ROLE_NAME[r]}</h4>
        <div class="who${s ? '' : ' free'}">${s ? esc(s.name) + (s.on ? '' : ' (desconectado)') : 'libre: tocá para elegir'}</div><p>${ROLE_DESC[r]}</p></button>`;
    }).join('');
    const free = app.seats.filter(s => !s.role && s.on).map(s => esc(s.name));
    if (free.length) $('seats').insertAdjacentHTML('beforeend', `<p class="why" style="grid-column: 1 / -1">Sin papel: ${free.join(', ')}</p>`);
  }
  for (const b of $('modetabs').querySelectorAll<HTMLButtonElement>('button')) { b.setAttribute('aria-selected', String(b.dataset.m === app.sel.mode)); b.disabled = !host; }
  $('pick-camp').hidden = app.sel.mode !== 'camp'; $('pick-inf').hidden = app.sel.mode !== 'inf'; $('pick-custom').hidden = app.sel.mode !== 'custom';
  const lv = $('levels');
  const open = app.practice ? CAMPAIGN.length - 1 : app.prog;
  lv.innerHTML = CAMPAIGN.map((s, n) => `<button class="lv env-${s.env}" data-n="${n}" aria-pressed="${app.sel.mode === 'camp' && app.sel.n === n}" ${n > open || !host ? 'disabled' : ''}>${n + 1}<small>${'★'.repeat(SAVE.stars[n] ?? 0)}</small></button>`).join('');
  $('inf-best').textContent = SAVE.inf ? `Tu récord: ${SAVE.inf} bomba${SAVE.inf > 1 ? 's' : ''}.` : '';
  if (app.sel.mode === 'custom') renderCustom(app.sel.c, host);
  const spec = app.sel.mode === 'camp' ? CAMPAIGN[app.sel.n] : app.sel.mode === 'custom' ? custom(app.sel.c, 1) : null;
  $('lvinfo').innerHTML = app.sel.mode === 'camp' ? `<b>${app.sel.n + 1}. ${LEVEL_NAMES[app.sel.n]}</b> · ${specLine(spec!)}`
    : app.sel.mode === 'inf' ? 'Empieza con 2 módulos fáciles; cada bomba suma algo.' : spec ? specLine(spec, true) : '';
  // empezar
  const b = $<HTMLButtonElement>('b-start'), why = $('start-why');
  b.hidden = !host;
  b.textContent = app.practice ? 'PRACTICAR' : 'EMPEZAR';
  let reason = '';
  if (!app.practice) {
    const on = app.seats.filter(s => s.on);
    const missing = ROLES.filter(r => !on.some(s => s.role === r));
    if (missing.length) reason = `Falta${missing.length > 1 ? 'n' : ''}: ${missing.map(r => ROLE_NAME[r]).join(', ')}.`;
  }
  b.disabled = !!reason;
  why.textContent = host ? reason : 'El anfitrión elige la bomba y empieza.';
  micButtons();
}
function specLine(s: Spec, generic = false) {
  const kinds = generic ? 'módulos al azar entre los elegidos' : [...new Set(s.mods)].map(modName).join(', ');
  return `${ENV_NAME[s.env]} · ${s.mods.length} módulo${s.mods.length > 1 ? 's' : ''} (${kinds}) · ${fmt(s.time)} · ${s.miss} error${s.miss === 1 ? '' : 'es'} permitido${s.miss === 1 ? '' : 's'}${s.hz.length ? ' · ' + s.hz.map(h => HAZARD_NAME[h]).join(', ') : ''}`;
}
const roomLink = () => `${location.origin}${location.pathname}?sala=${app.code}`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function renderCustom(c: Custom, host: boolean) {
  const chip = (on: boolean, attr: string, label: string) => `<button class="chipb" ${attr} aria-pressed="${on}" ${host ? '' : 'disabled'}>${label}</button>`;
  $('pick-custom').innerHTML = `
    <div class="opt"><span>MÓDULOS</span><div class="chips">${KINDS.map(k => chip(c.mods.includes(k), `data-k="${k}"`, modName(k) + (isChaos(k) ? ' (caos)' : ''))).join('')}</div></div>
    <div class="opt"><span>CANTIDAD</span><div class="stepper"><button class="btn sm ghost" data-st="n:-1" ${host ? '' : 'disabled'}>−</button><b>${c.n}</b><button class="btn sm ghost" data-st="n:1" ${host ? '' : 'disabled'}>+</button></div></div>
    <div class="opt"><span>TIEMPO</span><div class="stepper"><button class="btn sm ghost" data-st="time:-30" ${host ? '' : 'disabled'}>−</button><b>${fmt(c.time)}</b><button class="btn sm ghost" data-st="time:30" ${host ? '' : 'disabled'}>+</button></div></div>
    <div class="opt"><span>ERRORES</span><div class="stepper"><button class="btn sm ghost" data-st="miss:-1" ${host ? '' : 'disabled'}>−</button><b>${c.miss}</b><button class="btn sm ghost" data-st="miss:1" ${host ? '' : 'disabled'}>+</button></div></div>
    <div class="opt"><span>PELIGROS</span><div class="chips">${HAZARDS.map(h => chip(c.hz.includes(h), `data-h="${h}"`, HAZARD_NAME[h])).join('')}</div></div>
    <div class="opt"><span>LUGAR</span><div class="chips">${(Object.keys(ENV_NAME) as Env[]).map(e => chip(c.env === e, `data-e="${e}"`, ENV_NAME[e])).join('')}</div></div>`;
}
function editCustom(t: HTMLElement) {
  if (app.sel.mode !== 'custom' || !isHostish()) return;
  const c = app.sel.c;
  if (t.dataset.k && isKind(t.dataset.k)) { const k = t.dataset.k; c.mods = c.mods.includes(k) ? c.mods.filter(x => x !== k) : [...c.mods, k]; }
  else if (t.dataset.h) { const h = t.dataset.h as Hazard; c.hz = c.hz.includes(h) ? c.hz.filter(x => x !== h) : [...c.hz, h]; }
  else if (t.dataset.e) c.env = t.dataset.e as Env;
  else if (t.dataset.st) {
    const [k, d] = t.dataset.st.split(':'), lim: Record<string, [number, number]> = { n: [1, 6], time: [60, 900], miss: [0, 5] };
    const key = k as 'n' | 'time' | 'miss';
    c[key] = Math.max(lim[k][0], Math.min(lim[k][1], c[key] + +d));
  } else return;
  SAVE.custom = c; save();
  pushLobby();
}

// ---- Sesión informativa y resultado ------------------------------------------------------------------------------
const YOU: Record<Role, string> = {
  ciego: '<b>Sos el CIEGO.</b> Sos el único que toca la bomba. No ves: sentís los relieves, leés el braille pasando la mano y oís los ruiditos de la bomba. Oís solo al SORDO; al MUDO no lo oís ni lo ves.',
  sordo: '<b>Sos el SORDO.</b> Ves la bomba entera, el reloj y los gestos del CIEGO y del MUDO. No oís nada. Hablás: te oyen los dos. Sos el puente.',
  mudo: '<b>Sos el MUDO.</b> Tenés el manual. Oís a los dos, pero no podés hablar: respondé con gestos (los ve solo el SORDO). No ves la bomba.',
};
function renderBrief() {
  const s = app.spec!, host = isHostish(), me = app.practice ? null : mySeat()?.role ?? null;
  const title = app.levelN >= 0 ? `BOMBA ${app.levelN + 1} · ${LEVEL_NAMES[app.levelN].toUpperCase()}` : app.sel.mode === 'inf' ? `INFINITO · BOMBA ${app.wave + 1}` : 'BOMBA PERSONALIZADA';
  const nw = app.levelN >= 0 ? news(app.levelN) : [];
  const kinds = [...new Set(s.mods)];
  $('brief').innerHTML = `<h2>${title}</h2>
    <div class="meta"><span>${ENV_NAME[s.env]}</span><span>Tiempo <b>${fmt(s.time)}</b></span><span>Errores permitidos <b>${s.miss}</b></span>${s.hz.length ? `<span>Peligros <b>${s.hz.map(h => HAZARD_NAME[h]).join(', ')}</b></span>` : ''}</div>
    <div class="mods">${kinds.map(k => `<div class="mod"><h4>${modName(k)}${nw.includes(k) ? '<span class="new">NUEVO</span>' : ''}${isChaos(k) ? '<span class="new" style="background:#ff6250">CAOS</span>' : ''}</h4>
      <p>${HOW[k].look}</p>${ROLES.map(r => `<p class="${r === me ? 'me' : ''}"><b>${ROLE_NAME[r]}</b> ${HOW[k][r]}</p>`).join('')}</div>`).join('')}</div>
    ${s.hz.length ? `<div class="mods">${s.hz.map(h => `<div class="mod"><h4>${HAZARD_NAME[h]}</h4><p>${HAZARD_HOW[h]}</p></div>`).join('')}</div>` : ''}
    ${me ? `<div class="you">${YOU[me]}</div>` : app.practice ? '<div class="you"><b>Práctica:</b> cambiás de papel con las pestañas de arriba (o Tab). Para tocar la bomba, pasá al CIEGO; el manual lo tiene el MUDO.</div>' : ''}
    <div class="row c" style="margin-top:12px">${host ? '<button class="btn big green" id="b-arm">¡ARMAR LA BOMBA!</button><button class="btn ghost" id="b-back">A LA SALA</button>' : '<span class="why">Esperando al anfitrión…</span>'}</div>`;
  $('b-arm')?.addEventListener('click', hostArm);
  $('b-back')?.addEventListener('click', hostToLobby);
}
const HAZARD_HOW: Record<Hazard, string> = {
  bache: 'La combi agarra baches: todo salta y la mano del CIEGO pierde un instante.',
  radio: 'La radio se prende sola a todo volumen y tapa las voces. Solo el SORDO la ve: tocala para apagarla.',
  apagon: 'Se corta la luz: el SORDO ve solo lo que brilla y el MUDO lee con una linterna chiquita. Al CIEGO le da igual.',
};
function renderResult() {
  const r = app.result!, host = isHostish();
  const stars = r.win ? `<div class="stars">${[0, 1, 2].map(k => `<span class="${k < r.stars ? '' : 'off'}">★</span>`).join('')}</div>` : '';
  const why = r.win ? `Les sobraron ${fmt(r.time)} con ${r.strikes} error${r.strikes === 1 ? '' : 'es'}.` : r.why === 'tiempo' ? 'Se acabó el tiempo.' : 'Demasiados errores.';
  const inf = r.mode === 'inf' ? `<p class="why" style="text-align:center">Bombas desactivadas: <b>${r.wave + (r.win ? 1 : 0)}</b>${SAVE.inf ? ` · récord ${SAVE.inf}` : ''}</p>` : '';
  const nextLbl = r.mode === 'camp' ? (r.win && r.n < CAMPAIGN.length - 1 ? 'SIGUIENTE BOMBA' : '') : r.mode === 'inf' ? (r.win ? 'SIGUIENTE BOMBA' : '') : '';
  $('result').innerHTML = `<h2 style="color:${r.win ? '#6fe36a' : '#ff6250'}">${r.win ? '¡DESACTIVADA!' : '¡BANANAZO!'}</h2>${stars}
    <p style="text-align:center;font-weight:800">${why}</p>${inf}
    <div class="row c">${host ? `${nextLbl ? `<button class="btn big" id="b-next">${nextLbl}</button>` : ''}<button class="btn ${nextLbl ? 'ghost' : 'big'}" id="b-again">${r.mode === 'inf' && !r.win ? 'DE NUEVO DESDE LA 1' : 'OTRA VEZ'}</button><button class="btn ghost" id="b-lobby">A LA SALA</button>` : '<span class="why">Esperando al anfitrión…</span>'}</div>`;
  $('b-next')?.addEventListener('click', () => hostNext(false));
  $('b-again')?.addEventListener('click', () => hostNext(true));
  $('b-lobby')?.addEventListener('click', hostToLobby);
}

// ---- HUD de la partida -------------------------------------------------------------------------------------------
const TIPS: Record<Role, string> = { ciego: 'Tocás la bomba. No ves. Oís al SORDO.', sordo: 'Ves todo. No oís nada. Te oyen los dos.', mudo: 'Tenés el manual. No hablás. Te ve el SORDO.' };
const KEYS: Partial<Record<Gesture, string>> = { si: 'S', no: 'N', duda: 'Q', espera: 'E', repite: 'R', ojo: 'O', bien: 'B', mal: 'M', medio: 'C', arriba: '↑', derecha: '→', abajo: '↓', izquierda: '←', n10: '=' };
let hudRole: Role | null = null, hudWide = false;
function setupHud() {
  const r = app.view, wide = innerWidth > innerHeight * 1.1;
  const hud = $('hud');
  hud.className = `r-${r}${wide ? ' wide' : ''}`;
  document.body.classList.toggle('blind', r === 'ciego' && app.phase === 'play');
  $('rb-role').textContent = ROLE_NAME[r];
  $('rb-tip').textContent = TIPS[r];
  $('practice').hidden = !app.practice;
  for (const b of $('practice').querySelectorAll<HTMLButtonElement>('button[data-r]')) b.setAttribute('aria-pressed', String(b.dataset.r === r));
  $('b-auto').setAttribute('aria-pressed', String(auto));
  $('brcard').hidden = r !== 'ciego' || brClosed;
  const man = $('manual');
  if (r === 'mudo' && app.bomb) {
    if (hudRole !== r || man.dataset.seed !== String(app.seed)) {
      const kinds = app.levelN >= 0 ? known(app.levelN) : KINDS;
      mountManual(man, app.seed, kinds, false);
      man.dataset.seed = String(app.seed);
    }
    man.hidden = false;
  } else man.hidden = true;
  const say = $<HTMLInputElement>('say');
  say.disabled = r === 'mudo' && !app.practice;
  say.placeholder = r === 'mudo' ? 'Sos mudo: hablá con gestos' : r === 'sordo' ? 'Decir algo (lo oyen los dos)' : 'Decir algo (lo oye el MUDO)';
  if (hudRole !== r) $('dock').classList.toggle('closed', r !== 'mudo');
  const others = ROLES.filter(x => x !== r);
  $('hits').innerHTML = others.map((o, k) => `<button data-to="${o}">BANANAZO AL ${ROLE_NAME[o]}<kbd>${k ? 'X' : 'Z'}</kbd></button>`).join('');
  hudRole = r; hudWide = wide;
  micButtons();
}
function buildDock() {
  $('ges').innerHTML = GESTURES.map(gg => {
    const cls = gg.startsWith('n') && gg.length <= 3 ? 'num' : ['arriba', 'derecha', 'abajo', 'izquierda', 'medio'].includes(gg) ? 'dir' : '';
    const label = ({ arriba: '↑', derecha: '→', abajo: '↓', izquierda: '←' } as Record<string, string>)[gg] ?? GESTURE_NAME[gg];
    const key = KEYS[gg] ?? (cls === 'num' ? gg.slice(1) : '');
    return `<button class="${cls}" data-g="${gg}">${label}${key && cls !== 'num' ? `<kbd>${key}</kbd>` : ''}</button>`;
  }).join('');
  $('brcard').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => `<div><svg viewBox="0 0 10 14">${[1, 2, 3, 4, 5, 6].map(d => `<circle cx="${d > 3 ? 7 : 3}" cy="${3 + ((d - 1) % 3) * 4}" r="${BRAILLE[n].includes(d) ? 1.6 : 0.5}"/>`).join('')}</svg>${n}</div>`).join('') + '<span class="x" id="br-x" title="cerrar">×</span>';
}
let brClosed = false, dockAuto = false;
function sendGes(gg: Gesture) {
  if (app.phase !== 'play' && app.phase !== 'brief') return;
  toHost({ t: 'ges', g: gg });
  if (app.view !== 'ciego') toast(`Tu gesto: ${GESTURE_NAME[gg]}`, false, 900);
}
function throwBanana(to: Role) { if (app.phase === 'play' && to !== app.view) toHost({ t: 'hit', to }); }
function sayText(s: string) {
  s = s.trim();
  if (!s) return;
  toHost({ t: 'chat', s });
}

// ---- Entrada -----------------------------------------------------------------------------------------------------
let pointer: { x: number, y: number } | null = null, down: { id: number, x: number, y: number, t: number, touch: boolean } | null = null;
let handSentT = 0, handTimer = 0, feelKey = '';
// La mano del CIEGO: en qué módulo está y dónde dentro de él (afuera de los módulos no hay mano)
function setHand(sx: number, sy: number) {
  if (!app.L || !app.bomb) return;
  const p = toBomb(sx, sy), i = cellAt(app.L, p.x, p.y);
  if (i >= 0) { const c = app.L.cells[i]; app.hand = { m: i, x: Math.round((p.x - c.x) * 10) / 10, y: Math.round((p.y - c.y) * 10) / 10 }; }
  else app.hand = null;
  // al tantear con el dedo, cada parte nueva bajo la mano se siente (vibra; en iPhone no hay vibración)
  const h = app.hand, md = h && app.bomb.mods[h.m], part = md ? JSON.stringify(hitMod(md, h!.x, h!.y) ?? touchMod(md, h!.x, h!.y)) : '';
  if (part !== feelKey) { feelKey = part; if (app.touch && part && part !== 'null') vibrate(12); }
  sendHand();
}
function sendHand() {
  if (isHostish()) { liveDirty = true; return; }
  clearTimeout(handTimer);
  const wait = 66 - (performance.now() - handSentT);
  if (wait > 0) { handTimer = setTimeout(sendHand, wait) as unknown as number; return; }
  handSentT = performance.now();
  toHost(app.hand ? { t: 'hand', m: app.hand.m, x: app.hand.x, y: app.hand.y } : { t: 'hand', m: -1 });
}
cv.addEventListener('pointermove', e => {
  pointer = { x: e.clientX, y: e.clientY };
  if (app.phase === 'play' && app.view === 'ciego' && (e.pointerType === 'mouse' || down)) setHand(e.clientX, e.clientY);
});
cv.addEventListener('pointerdown', e => {
  A.unlock(); voice.refresh();
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse' };
  app.touch = down.touch;
  A.primeSpeech();
  pointer = { x: e.clientX, y: e.clientY };
  try { cv.setPointerCapture(e.pointerId); } catch { /* */ }
  if (app.phase === 'play' && app.view === 'ciego') setHand(e.clientX, e.clientY);
});
cv.addEventListener('pointerup', e => {
  if (!down || down.id !== e.pointerId) return;
  const quick = performance.now() - down.t < (down.touch ? 260 : 600), still = Math.hypot(e.clientX - down.x, e.clientY - down.y) < (down.touch ? 14 : 8);
  down = null;
  if (quick && still) tap(e.clientX, e.clientY);
});
cv.addEventListener('pointercancel', () => { down = null; });
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') pointer = null; });
function tap(x: number, y: number) {
  if (app.phase !== 'play' || app.cd > 0 || !app.bomb || !app.L) return;
  const r = app.view;
  for (const a of app.avatars) if (Math.hypot(x - a.x, y - a.y) < a.rad && a.r !== r) { throwBanana(a.r); return; }
  if (r === 'ciego') {
    const p = toBomb(x, y);
    // con el dedo los módulos de la vista general son chicos: el primer toque acerca, después se aprieta. Acercado, tocar el
    // borde de un vecino lo acerca a él (no lo aprieta sin querer)
    const c = cellAt(app.L, p.x, p.y);
    if ((app.touch && app.zoom < 0) || (app.zoom >= 0 && c !== app.zoom)) { if (c >= 0) app.zoom = c; return; }
    if (app.now - app.bumpT < 0.45) return; // el bache te sacude la mano
    const act = hitBomb(app.bomb, app.L, p.x, p.y);
    if (act) toHost({ t: 'act', a: act });
  } else if (r === 'sordo') {
    const rb = app.radioBox;
    if (rb && x >= rb.x && x <= rb.x + rb.w && y >= rb.y && y <= rb.y + rb.h) { toHost({ t: 'act', a: { m: -1, a: 'radio' } }); return; }
    const p = toBomb(x, y), c = cellAt(app.L, p.x, p.y);
    app.zoom = app.zoom >= 0 ? -1 : c;
  }
}
function toggleZoom() {
  if (!app.L) return;
  if (app.zoom >= 0) { app.zoom = -1; return; }
  const p = pointer ? toBomb(pointer.x, pointer.y) : null;
  const c = app.hand?.m ?? (p ? cellAt(app.L, p.x, p.y) : -1);
  app.zoom = c >= 0 ? c : 0;
}
// Pasar al módulo de al lado sin salir del zoom (el teléfono vive acercado)
function zoomStep(d: number) {
  const n = app.bomb?.mods.length ?? 0;
  if (!n) return;
  app.zoom = ((app.zoom < 0 ? 0 : app.zoom + d) % n + n) % n;
  app.zoomK = Math.min(app.zoomK, 0.6);
}
const GKEY: Record<string, Gesture> = { KeyS: 'si', KeyN: 'no', KeyQ: 'duda', KeyE: 'espera', KeyR: 'repite', KeyO: 'ojo', KeyB: 'bien', KeyM: 'mal', KeyC: 'medio',
  ArrowUp: 'arriba', ArrowRight: 'derecha', ArrowDown: 'abajo', ArrowLeft: 'izquierda', Equal: 'n10', NumpadAdd: 'n10' };
addEventListener('keydown', e => {
  A.unlock();
  const t = e.target as HTMLElement;
  if (t instanceof HTMLInputElement) {
    if (e.key === 'Enter' && t.id === 'say') { sayText(t.value); t.value = ''; t.blur(); e.preventDefault(); if (dockAuto) $('dock').classList.add('closed'), dockAuto = false; }
    else if (e.key === 'Enter' && t.id === 'chatin') { $('b-send').click(); e.preventDefault(); }
    else if (e.key === 'Escape') t.blur();
    return;
  }
  if (app.phase !== 'play') return;
  if (e.code === 'Tab' && app.practice) { e.preventDefault(); setView(ROLES[(ROLES.indexOf(app.view) + 1) % 3]); return; }
  if (e.code === 'Space') { e.preventDefault(); toggleZoom(); return; }
  if (e.code === 'Escape') { app.zoom = -1; return; }
  if (e.code === 'Enter') {
    const s = $<HTMLInputElement>('say'), dock = $('dock');
    if (s.disabled) return;
    if (dock.classList.contains('closed')) { dock.classList.remove('closed'); dockAuto = true; } // se abre para escribir y se cierra al mandar
    s.focus(); e.preventDefault();
    return;
  }
  const others = ROLES.filter(x => x !== app.view);
  if (e.code === 'KeyZ') { throwBanana(others[0]); return; }
  if (e.code === 'KeyX') { throwBanana(others[1]); return; }
  const dg = /^(Digit|Numpad)(\d)$/.exec(e.code);
  if (dg) { sendGes(`n${dg[2]}` as Gesture); return; }
  const gg = GKEY[e.code];
  if (gg) { e.preventDefault(); sendGes(gg); }
});
function setView(r: Role) {
  if (!app.practice) return;
  app.view = r;
  A.stopAll(); A.setListener(r);
  if (app.bomb) A.ambient(app.bomb.spec.env);
  setupHud();
}
// Linterna del MUDO en el apagón
addEventListener('pointermove', e => { const d = $('dark'); d.style.setProperty('--x', `${e.clientX}px`); d.style.setProperty('--y', `${e.clientY}px`); });

// ---- Botones -----------------------------------------------------------------------------------------------------
function bindUi() {
  const name = $<HTMLInputElement>('name');
  name.value = SAVE.name;
  name.addEventListener('change', () => { SAVE.name = name.value.trim().slice(0, 14) || SAVE.name; save(); if (app.online) toHost({ t: 'name', name: SAVE.name }); });
  const code = $<HTMLInputElement>('code');
  code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  $('b-create').onclick = () => { autoFs(); SAVE.name = name.value.trim().slice(0, 14) || SAVE.name; save(); joinRoom(randomCode(), true); };
  $('b-join').onclick = () => {
    const c = code.value.toUpperCase();
    if (!validCode(c)) { toast('El código son 4 letras.', true); return; }
    autoFs();
    SAVE.name = name.value.trim().slice(0, 14) || SAVE.name; save();
    joinRoom(c, false);
  };
  $('b-practice').onclick = () => { autoFs(); startPractice(); };
  const help = (on: boolean) => { helpOpen = on; if (on) screen('s-help'); else syncScreen(); };
  $('b-help').onclick = () => help(true); $('b-help2').onclick = () => help(true); $('b-help-close').onclick = () => help(false);
  $('b-manual').onclick = () => { manualOpen = true; screen('s-manual'); mountManual($('manual-sample'), 12345, KINDS, true); };
  $('b-manual-close').onclick = () => { manualOpen = false; syncScreen(); };
  $('b-leave').onclick = () => leave();
  $('b-quit').onclick = () => { if (app.practice) { stopGame(); app.phase = 'lobby'; syncScreen(); } else if (confirm('¿Salir de la sala?')) leave(); };
  $('b-copy').onclick = () => {
    const url = roomLink();
    navigator.clipboard?.writeText(url).then(() => toast('Link copiado.'), () => toast(url, false, 6000));
  };
  $('seats').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]'); if (b) toHost({ t: 'role', r: b.dataset.r }); });
  $('modetabs').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (!b || !isHostish()) return;
    const m = b.dataset.m;
    app.sel = m === 'inf' ? { mode: 'inf' } : m === 'custom' ? { mode: 'custom', c: SAVE.custom } : { mode: 'camp', n: Math.min(app.prog, SAVE.prog) };
    pushLobby();
  });
  $('levels').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]'); if (b && isHostish()) { app.sel = { mode: 'camp', n: +b.dataset.n! }; pushLobby(); } });
  $('pick-custom').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (b) editCustom(b); });
  $('b-start').onclick = () => { if (isHostish()) hostBrief(); };
  $('b-mic').onclick = toggleMic; $('b-mic2').onclick = toggleMic;
  $('b-send').onclick = () => { const i = $<HTMLInputElement>('chatin'); sayText(i.value); i.value = ''; };
  $('ges').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-g]'); if (b) sendGes(b.dataset.g as Gesture); });
  $('hits').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-to]'); if (b) throwBanana(b.dataset.to as Role); });
  $('b-ges').onclick = () => $('dock').classList.toggle('closed');
  $('zoom').onclick = toggleZoom;
  $('practice').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]'); if (b) setView(b.dataset.r as Role); });
  $('b-auto').onclick = () => { auto = !auto; setupHud(); };
  $('brcard').addEventListener('click', e => { if ((e.target as HTMLElement).id === 'br-x') { brClosed = true; $('brcard').hidden = true; } });
  initFullscreen($<HTMLButtonElement>('fsbtn'), m => toast(m, false, 6000));
  $('zn-prev').onclick = () => zoomStep(-1);
  $('zn-next').onclick = () => zoomStep(1);
  $('zn-all').onclick = () => { app.zoom = -1; };
  $('b-share').hidden = !navigator.share;
  $('b-share').onclick = () => { void navigator.share?.({ title: 'BANANAZO', text: `¡Vení a desactivar una bomba! Sala ${app.code}`, url: roomLink() }).catch(() => {}); };
  cv.addEventListener('contextmenu', e => e.preventDefault()); // mantener el dedo no abre el menú del navegador
}

// ---- Piloto automático (práctica, pruebas y la grabación de la portada) ------------------------------------------
let auto = params.get('auto') === '1', autoT = 0, autoNext: Act | null = null;
const GES_OF = (act: Act): Gesture | null => {
  const v = act.v ?? 0;
  if (act.a === 'dir') return (['arriba', 'derecha', 'abajo', 'izquierda'] as const)[v];
  if (act.a === 'cut' || act.a === 'btn' || act.a === 'press' || act.a === 'flip') return `n${Math.min(10, v + 1)}` as Gesture;
  if (act.a === 'key') return `n${v}` as Gesture;
  if (act.a === 'set') return (['abajo', 'medio', 'arriba'] as const)[v % 3];
  if (act.a === 'turn') return v > 0 ? 'derecha' : 'izquierda';
  if (act.a === 'ok') return 'bien';
  return 'ojo';
};
function autoStep(dt: number) {
  if (!auto || !isHostish() || app.phase !== 'play' || app.cd > 0 || !app.bomb || app.bomb.over || !app.L) return;
  if ((autoT -= dt) > 0) return;
  if (autoNext) {
    queue.push(autoNext); autoNext = null; autoT = 0.35;
    return;
  }
  const a = nextAct(app.bomb);
  if (!a) { autoT = 0.3; return; }
  if (a.m >= 0) {
    const [x, y] = actXY(app.bomb.mods[a.m], a);
    app.hand = { m: a.m, x, y }; liveDirty = true;
    const gg = GES_OF(a);
    if (gg) socAll({ t: 'soc', k: 'ges', r: 'mudo', g: gg });
  }
  autoNext = a; autoT = 0.55;
}

// ---- Bucle -------------------------------------------------------------------------------------------------------
let last = performance.now(), touchKey = '', touchNext = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  tick(dt);
  draw();
  requestAnimationFrame(frame);
}
function tick(dt: number) {
  app.now += dt;
  app.shake = Math.max(0, app.shake - dt * 2.5);
  app.flash = Math.max(0, app.flash - dt * 1.6);
  app.zoomK += ((app.zoom >= 0 ? 1 : 0) - app.zoomK) * Math.min(1, dt * 10);
  if (app.zoom < 0 && app.zoomK < 0.01) app.zoomK = 0;
  if (isHostish()) { autoStep(dt); hostStep(dt); }
  else if (app.phase === 'play') {
    if (app.cd > 0) app.cd -= dt;
    else if (app.bomb && !app.bomb.over) app.timeShown = Math.max(0, app.timeShown - dt * speedOf(app.bomb));
    if (app.bomb?.over) app.overT += dt;
  }
  if (app.phase === 'end' && app.overT < 1.4) { app.overT += dt; if (app.overT >= 1.4) syncScreen(); }
  // cuenta regresiva
  const cdEl = $('countdown');
  if (app.phase === 'play' && app.cd > 0) { cdEl.hidden = false; cdEl.innerHTML = `<div>${Math.ceil(app.cd)}<small>SOS EL ${ROLE_NAME[app.view]}</small></div>`; }
  else cdEl.hidden = true;
  const live = app.phase === 'play' && app.cd <= 0 && !!app.bomb && !app.bomb.over;
  if (live) clientSounds();
  else { A.hiss(null); A.siren(false); A.radio(false); }
  $('dark').hidden = !(live && app.view === 'mudo' && app.bomb!.hz.dark > 0);
  const zn = app.phase === 'play' && app.view !== 'mudo' && app.zoom >= 0 && !!app.bomb;
  if ($('znav').hidden === zn) $('znav').hidden = !zn;
  const zl = zn ? `${app.zoom + 1} DE ${app.bomb!.mods.length}\nVER TODO` : '';
  if (zn && $('zn-all').innerText !== zl) $('zn-all').innerText = zl;
  if (app.phase === 'play' && (hudRole !== app.view || hudWide !== innerWidth > innerHeight * 1.1)) setupHud();
  if (app.phase === 'play') {
    const dh = $('dock').offsetHeight;
    if (dh !== app.dockH) { app.dockH = dh; $('hud').style.setProperty('--dockh', `${dh}px`); }
    app.brOpen = !$('brcard').hidden;
  }
  voiceRoutes();
}
// Lo que cada uno oye por su cuenta: el tic tac, la presión, la alarma, la radio y lo que el CIEGO descubre tocando
function clientSounds() {
  const b = app.bomb!, sec = Math.ceil(app.timeShown);
  if (sec !== lastSec) { lastSec = sec; A.S.tick(app.timeShown < 30); }
  let p = -1, siren = false;
  for (const m of b.mods) { if (m.k === 'press') p = Math.max(p, m.p); if (m.k === 'alarm' && m.on) siren = true; }
  A.hiss(p >= 0 ? p : null); A.siren(siren); A.radio(b.hz.radio);
  const h = app.hand;
  if (app.view !== 'ciego' || !h || !b.mods[h.m]) { touchKey = ''; return; }
  const part = touchMod(b.mods[h.m], h.x, h.y), t = part ? [h.m, part] as const : null, key = t ? `${t[0]}:${t[1]}` : '';
  if (key !== touchKey) { touchKey = key; touchNext = app.now; }
  if (!t || app.now < touchNext) return;
  const m = b.mods[t[0]];
  if (m.k === 'bells') { if (t[1] === `bell${m.ring}`) { A.S.bell(); touchNext = app.now + 1.4; } else touchNext = Infinity; }
  else if (m.k === 'morse') { const k = +t[1].slice(4), d = A.morse(tables(b.seed).morse[m.d[k]]); touchNext = app.now + d + 1.1; }
  else if (m.k === 'dial') { if (m.ptr === m.buzz[m.stage]) { A.S.buzz(); touchNext = app.now + 0.9; } else touchNext = app.now + 0.25; }
}
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.append(safeProbe);
function resize() {
  const cs = getComputedStyle(safeProbe);
  app.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
}
function draw() {
  const dpr = cv.width / innerWidth;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  render(g, innerWidth, innerHeight, app.view === 'ciego' ? pointer : null);
}
addEventListener('resize', resize);

// ---- Arranque ----------------------------------------------------------------------------------------------------
resize();
buildDock();
bindUi();
micButtons();
{
  const sala = (params.get('sala') ?? '').toUpperCase();
  if (params.get('solo') === '1' || params.get('practica') === '1') {
    startPractice(params.has('nivel') ? Math.max(0, Math.min(CAMPAIGN.length - 1, +params.get('nivel')! - 1)) : undefined);
    if (params.has('nivel')) { SAVE.prog = Math.max(SAVE.prog, app.sel.mode === 'camp' ? app.sel.n : 0); app.prog = SAVE.prog; hostBrief(); }
  } else if (validCode(sala)) {
    $<HTMLInputElement>('code').value = sala;
    let was = false;
    try { was = !!sessionStorage.getItem(`bananazo.pid.${sala}`); } catch { /* */ }
    if (was) joinRoom(sala, false); else syncScreen(); // recargó la pestaña: vuelve a su lugar
  }
  else syncScreen();
}
requestAnimationFrame(frame);

// ---- Depuración: window.__bananazo -------------------------------------------------------------------------------
const api = {
  app, SAVE,
  practice(n = 0, view: Role = 'sordo') { startPractice(n); SAVE.prog = Math.max(SAVE.prog, n); app.prog = SAVE.prog; app.sel = { mode: 'camp', n }; hostBrief(); hostArm(); app.cd = 0; setView(view); },
  view: setView,
  auto(on = true) { auto = on; },
  advance(sec: number) { for (let k = 0; k < sec * HZ; k++) tick(DT); },
  state: () => app.bomb,
  solve: () => app.bomb ? nextAct(app.bomb) : null,
  act(a: Act) { toHost({ t: 'act', a }); },
  ges: (gg: Gesture) => sendGes(gg),
  hit: (to: Role) => throwBanana(to),
  say: (s: string) => sayText(s),
  arm: () => hostArm(),
  start: () => hostBrief(),
  voice: () => voice.debug(),
};
(window as unknown as { __bananazo: typeof api }).__bananazo = api;
