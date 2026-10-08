// CATAPUM: brawler de cartas explosivas en tiempo real (inspirado en Boom Slingers, sin turnos). Flujo: menús →
// partida (solo contra bots, o online como anfitrión o invitado) → resultados. Paso fijo de 60 Hz con dibujo
// interpolado; en el menú corre de fondo una partida de bots.
import { HZ, DT, NO_INPUT, newPlayer, type Input, type State, type World, type Ev, type Pl } from './sim/sim.ts';
import { CHARS, charOf } from './sim/chars.ts';
import { MAPS } from './sim/maps.ts';
import { RULES, type Rules, type Cfg } from './sim/params.ts';
import { hookTarget } from './sim/move.ts';
import { Match, type Seat } from './game.ts';
import { drawWorld, setWorld, matColor, type View, type IP } from './render.ts';
import { newCam, frame } from './camera.ts';
import { FX, fromEvents as fxEvents, stepFx, debris, clearFx } from './fx.ts';
import * as A from './audio.ts';
import { drawHud, handRects } from './hud.ts';
import { bindDesktop, readDesktop, DESK, clearDesktop, lastDevice, setDevice } from './input.ts';
import * as T from './touch.ts';
import { trajectory, autoAim } from './aim.ts';
import { S, save, deckOf, cfgOf } from './settings.ts';
import * as UI from './ui.ts';
import { connect, HostNet, GuestNet, GuestView, helloMsg, randomCode, validCode, ERRORS, GAME, PROTO, type Conn } from './net.ts';
import { bgTicker } from './bgtick.ts';
import { renderSVG } from 'uqr';
import { mousePos } from './input.ts';
import { toWorld } from './render.ts';
import { AIM_R, HAND_Y } from './sim/state.ts';

const cv = document.getElementById('game') as HTMLCanvasElement;
const ctx = cv.getContext('2d', { alpha: false })!;
const pauseBtn = document.getElementById('pausebtn')!;
const rotateHint = document.getElementById('rotate')!;

type Mode = 'menu' | 'solo' | 'host' | 'guest';
const app = {
  mode: 'menu' as Mode, match: null as Match | null, guest: null as GuestView | null, paused: false, overT: 0, shownResults: false,
  demo: null as Match | null, acc: 0, last: performance.now(), cam: newCam(), W: 0, H: 0, dpr: 1, view: null as View | null,
  ticks: 0,
};

// ---- Lienzo -----------------------------------------------------------------------------------------------------
function resize() {
  app.dpr = Math.min(devicePixelRatio || 1, S.quality >= 1 ? 2 : 1.25);
  app.W = innerWidth, app.H = innerHeight;
  cv.width = Math.round(app.W * app.dpr), cv.height = Math.round(app.H * app.dpr);
}
addEventListener('resize', resize);
resize();
bindDesktop(cv);
T.bindTouch(cv, () => { setDevice('touch'); A.unlock(); });
cv.addEventListener('pointerdown', () => A.unlock());
addEventListener('keydown', () => A.unlock(), { once: true });

// ---- Partidas ---------------------------------------------------------------------------------------------------
const rulesFromSettings = (): Rules => ({ ...RULES, time: S.match.time, teams: S.match.teams, friendly: S.match.friendly, crates: S.match.crates, infinite: S.match.infinite, startDmg: S.match.startDmg });
const pickMap = () => S.match.map === 'azar' || !MAPS.some(m => m.id === S.match.map) ? MAPS[Math.floor(Math.random() * MAPS.length)].id : S.match.map;
const botNames = ['Pum', 'Chispa', 'Tronco', 'Mecha', 'Petardo', 'Ñoqui', 'Bólido', 'Turrón', 'Garra', 'Tuerca'];
// Bots con personajes que no estén en uso. rnd: el azar (en la sala, uno fijo por sala para que no cambien en cada vista)
function botSeats(n: number, start: number, used: string[], rnd: (k: number) => number = () => Math.random()): Seat[] {
  const out: Seat[] = [];
  for (let k = 0; k < n; k++) {
    const free = CHARS.filter(c => !used.includes(c.id)), ch = (free.length ? free : CHARS)[Math.floor(rnd(start + k) * (free.length || CHARS.length))];
    used.push(ch.id);
    out.push({ name: botNames[(start + k) % botNames.length], ch: ch.id, team: (start + k) % 2, bot: S.match.diff });
  }
  return out;
}

function begin(m: Match, mode: Mode) {
  app.match = m, app.mode = mode, app.paused = false, app.overT = 0, app.shownResults = false, app.acc = 0;
  app.cam = newCam();
  clearFx(), clearDesktop(), T.clearTouch(true);
  setWorld(m.w, ppc());
  UI.hideUI();
  pauseBtn.hidden = false;
  FX.quality = S.quality, FX.shakeOn = S.shake ? 1 : 0;
  A.unlock(), A.volumes();
}
const ppc = () => S.quality >= 1 ? (app.W > 1100 ? 12 : 9) : 6;

function startSolo() {
  const me: Seat = { name: S.name, ch: S.ch, deck: deckOf(S.ch), team: 0, bot: 0 };
  const seats = [me, ...botSeats(S.match.bots, 0, [S.ch])];
  begin(new Match(pickMap(), (Math.random() * 1e9) >>> 0, seats, rulesFromSettings(), cfgOf(), 0), 'solo');
}

function startDemo() {
  const seats = botSeats(4, Math.floor(Math.random() * 10), []).map(s => ({ ...s, bot: 3 }));
  app.demo = new Match(MAPS[Math.floor(Math.random() * MAPS.length)].id, (Math.random() * 1e9) >>> 0, seats, { ...RULES, time: 0 }, cfgOf(), -1);
  app.cam = newCam();
  setWorld(app.demo.w, 6);
}

function toMenu() {
  net.close();
  app.match = null, app.guest = null, app.mode = 'menu', app.paused = false;
  pauseBtn.hidden = true;
  clearFx();
  startDemo();
  UI.showTitle();
}

// ---- Online -------------------------------------------------------------------------------------------------------
const net = {
  conn: null as Conn | null, code: '', host: false, status: '', lobby: null as null | { seats: (Seat & { host?: boolean, off?: boolean })[], max: number },
  qr: '', info: '',
  hn: new HostNet(o => net.conn?.send(o), { diff: () => S.match.diff, lobby: () => hostBroadcastLobby(), now: () => Math.round(performance.now()) }),
  gn: new GuestNet(o => net.conn?.send(o), gv => {
    app.guest = gv, app.match = null;
    begin({ s: gv.s, w: gv.w } as unknown as Match, 'guest');
    app.match = null;
  }),
  close() {
    this.conn?.close();
    this.conn = null, this.hn.reset(), this.lobby = null, this.host = false, this.code = '';
  },
};
const pidFor = (code: string) => {
  const k = 'catapum.pid.' + code;
  let v = '';
  try { v = sessionStorage.getItem(k) ?? ''; if (!v) v = Math.random().toString(36).slice(2), sessionStorage.setItem(k, v); } catch { v = Math.random().toString(36).slice(2); }
  return v;
};
const ROOM_MAX = 8; // cupo que pide el anfitrión al crear (el servidor lo recorta si es más viejo: ver `max` del welcome)
const roomLink = (code: string) => `${location.origin}${location.pathname}?sala=${code}`;

function lobbySeats(): (Seat & { host?: boolean, off?: boolean })[] {
  const seats: (Seat & { host?: boolean, off?: boolean, peer?: number })[] = [{ name: S.name, ch: S.ch, deck: deckOf(S.ch), team: 0, bot: 0, host: true }];
  for (const p of net.hn.peers.values()) seats.push({ name: p.name, ch: p.ch, deck: p.deck, team: seats.length % 2, bot: 0, peer: p.id, off: !p.on });
  const humans = seats.length, bots = Math.max(0, Math.min(S.match.bots, 8 - humans));
  const salt = [...net.code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  seats.push(...botSeats(bots, humans, seats.map(s => s.ch), k => ((Math.sin(salt + k * 12.9898) * 43758.5453) % 1 + 1) % 1).map((s, k) => ({ ...s, team: (humans + k) % 2 })));
  return seats;
}
function hostBroadcastLobby() {
  if (!net.host || !net.conn) return;
  const seats = lobbySeats();
  net.lobby = { seats, max: net.conn.max };
  const mp = MAPS.find(m => m.id === S.match.map), tm = S.match.time;
  const info = `${mp ? mp.name : 'MAPA AL AZAR'} · ${tm ? `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}` : 'sin límite'} · ${S.match.teams ? 'EQUIPOS' : 'TODOS CONTRA TODOS'}${S.match.infinite ? ' · maná infinito' : ''}`;
  net.info = info;
  net.conn.send({ m: { t: 'lobby', g: GAME, v: PROTO, seats: seats.map(s => ({ name: s.name, ch: s.ch, team: s.team, bot: s.bot, host: !!s.host, off: !!s.off, peer: s.peer ?? -1 })), max: net.conn.max, teams: S.match.teams, info } });
  if (UI.current === 'lobby') UI.showLobby();
}

function createRoom() {
  net.close();
  const code = randomCode();
  net.code = code, net.host = true, net.status = 'conectando…';
  net.qr = renderSVG(roomLink(code), { border: 1 });
  net.conn = connect(code, true, pidFor(code), ROOM_MAX, {
    welcome: () => { net.status = 'sala abierta'; hostBroadcastLobby(); UI.showLobby(); },
    status: (st, why) => {
      if (st === 'closed') { const msg = ERRORS[why ?? 'net'] ?? 'Se cortó la conexión.'; net.close(); if (app.mode === 'host') toMenu(); UI.showOnline(msg); }
    },
    message: m => net.hn.message(m),
  });
  UI.showLobby();
}

function startOnline() {
  if (!net.host || !net.conn) return;
  const m = new Match(pickMap(), (Math.random() * 1e9) >>> 0, lobbySeats(), rulesFromSettings(), cfgOf(), 0);
  net.hn.begin(m);
  begin(m, 'host');
}
function joinRoom(code: string) {
  if (!validCode(code)) { UI.showOnline('Código inválido (4 letras).'); return; }
  net.close();
  net.code = code, net.host = false, net.status = 'conectando…';
  net.qr = renderSVG(roomLink(code), { border: 1 });
  net.conn = connect(code, false, pidFor(code), ROOM_MAX, {
    welcome: w => { net.gn.myPeer = w.id; net.status = 'conectado'; net.conn!.send(helloMsg(S.name, S.ch, deckOf(S.ch))); },
    status: (st, why) => {
      if (st === 'reconnecting') net.status = 'reconectando…', net.gn.lost();
      if (st === 'closed') { const msg = ERRORS[why ?? 'net'] ?? 'Se cortó la conexión.'; net.close(); app.match = null, app.guest = null; if (app.mode === 'guest') { app.mode = 'menu'; pauseBtn.hidden = true; startDemo(); } UI.showOnline(msg); }
      if (UI.current === 'lobby') UI.showLobby();
    },
    message: m => guestMessage(m),
  });
  UI.toast('Conectando a ' + code + '…');
}
function guestMessage(m: Record<string, unknown>) {
  if (m.t === 'nope') { const why = String(m.why); net.close(); UI.showOnline(ERRORS[why] ?? why); return; }
  if (m.t === 'lobby') {
    if (m.g !== GAME) { net.close(); UI.showOnline(ERRORS.game); return; }
    net.lobby = { seats: (m.seats as (Seat & { host?: boolean, off?: boolean, peer: number })[]), max: m.max as number };
    S.match.teams = !!m.teams, net.info = String(m.info ?? '');
    if (app.mode !== 'guest' && (UI.current !== 'chars' && UI.current !== 'settings')) UI.showLobby();
    return;
  }
  net.gn.message(m, performance.now());
}

function leaveRoom() { net.close(); app.mode = 'menu'; UI.showOnline(); }
function pickChanged() {
  if (!net.conn) return;
  if (net.host) hostBroadcastLobby();
  else net.conn.send({ t: 'pick', name: S.name, ch: S.ch, deck: deckOf(S.ch) });
}

// ---- Entrada local -------------------------------------------------------------------------------------------------
function me(): Pl | null {
  const s = curState();
  const k = myIndex();
  return s && k >= 0 ? s.pl[k] ?? null : null;
}
const myIndex = () => app.mode === 'guest' ? app.guest?.me ?? -1 : app.match?.me ?? -1;
function curState(): State | null { return app.mode === 'guest' ? app.guest?.view() ?? null : app.match?.s ?? app.demo?.s ?? null; }
function curWorld(): World | null { return app.mode === 'guest' ? app.guest?.w ?? null : app.match?.w ?? app.demo?.w ?? null; }

function localInput(): Input {
  const p = me(), s = curState(), w = curWorld();
  if (!p || !s || !w || app.paused || !UI_free()) return { ...NO_INPUT };
  const d = readDesktop(app.view, p);
  const t = T.readTouch(slot => { const id = slot === 4 ? p.bonus : p.hand[slot]; return id ? autoAim(s, w, p, id) : null; });
  if (t.touched || lastDevice() === 'touch') {
    const i: Input = { ...t };
    if (d.cast >= 0 && t.cast < 0) i.cast = d.cast, i.ax = d.ax, i.ay = d.ay;
    i.jump ||= d.jump, i.dash ||= d.dash, i.ulti ||= d.ulti;
    if (!t.touched) i.x = d.x || i.x, i.y = d.y || i.y;
    return i;
  }
  return d;
}
const UI_free = () => (UI.current === '' || UI.current === 'pause') && !T.isEditing();

// ---- Bucle --------------------------------------------------------------------------------------------------------
function tick() {
  const i = localInput();
  if (app.mode === 'guest') {
    const gv = app.guest!, evs = net.gn.tick(i);
    fxEvents(evs, gv.view(), gv.me, gv.w.m.water), A.fromEvents(evs, gv.view(), gv.me);
    return;
  }
  const m = app.match ?? app.demo;
  if (!m) return;
  const evs = m.tick(i);
  if (app.mode === 'host') net.hn.afterTick(evs);
  if (document.hidden) return; // oculto no se dibuja ni suena: los efectos se acumularían sin que nadie los consuma
  if (app.match) { fxEvents(evs, m.s, m.me, m.w.m.water), A.fromEvents(evs, m.s, m.me); }
  else fxEvents(evs.filter(e => e.k !== 'ko' && e.k !== 'go' && e.k !== 'sudden' && e.k !== 'whistle' && e.k !== 'wind' && e.k !== 'ulti'), m.s, -1, m.w.m.water);
  if (app.match) T.afterTick(!!me()?.hook);
}

const OWN_PRED = new Set(['jump', 'dash', 'slide', 'pound', 'land', 'hook', 'trick']);
// Avanza la simulación hasta `now` a pasos fijos. Lo llama el bucle de dibujo y, con el anfitrión de una sala en una pestaña
// oculta (sin requestAnimationFrame), el reloj del Worker. Devuelve los segundos que pasaron.
function pump(now: number): number {
  const dt = Math.min(0.1, (now - app.last) / 1000);
  app.last = now;
  const running = app.mode !== 'menu' && !(app.mode === 'solo' && app.paused);
  if (app.mode === 'menu' || running) {
    const scale = app.mode === 'solo' && FX.slow > 0 ? 0.35 : 1;
    app.acc += dt * scale;
    let n = 0;
    while (app.acc >= DT && n < 8) { app.acc -= DT, n++; tick(); }
    if (n >= 8) app.acc = 0;
  }
  return dt;
}
// Pestaña oculta: el anfitrión sigue simulando (sin dibujar ni sonar) con el reloj del Worker; los demás modos se quedan quietos
const bg = bgTicker(() => { if (!document.hidden || app.mode !== 'host') bg.stop(); else pump(performance.now()); });
function loop(now: number) {
  requestAnimationFrame(loop);
  if (DESK.pauseReq) { DESK.pauseReq = false; togglePause(); }
  const dt = pump(now);
  // invitado: avanzar la vista hacia el tiempo del anfitrión
  if (app.mode === 'guest' && app.guest) {
    const gv = app.guest, evs = gv.advance(now).filter(e => !(e.p === gv.me && OWN_PRED.has(e.k)));
    fxEvents(evs, gv.s, gv.me, gv.w.m.water), A.fromEvents(evs, gv.s, gv.me);
    gv.decay(dt);
  }
  stepFx(dt);
  const s = curState(), w = curWorld();
  if (s && w && w.T.fall.length) { debris(w.T.fall, matColor); w.T.fall.length = 0; }
  draw(dt);
  // fin de la partida
  if (s && s.over && app.mode !== 'menu') {
    app.overT += dt;
    if (app.overT > 2 && !app.shownResults) {
      app.shownResults = true, pauseBtn.hidden = true;
      UI.showResults(s, myIndex(), app.mode !== 'guest', app.mode !== 'solo');
    }
  }
  if (app.mode !== 'menu' && s && !s.over) A.music(S.music > 0, s.sudden);
  rotateHint.hidden = !(app.mode !== 'menu' && T.visible() && app.H > app.W && UI.current === '');
}

function ipFor(): IP {
  if (app.mode === 'guest' && app.guest) return app.guest.ip();
  const m = app.match ?? app.demo;
  return m ? m.ip(app.acc / DT) : (_k, x, y) => [x, y];
}

function draw(dt: number) {
  const s = curState(), w = curWorld();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!s || !w) { ctx.fillStyle = '#1a1033'; ctx.fillRect(0, 0, cv.width, cv.height); return; }
  const ip = ipFor(), meK = myIndex();
  const v = frame(app.cam, s, w, app.mode === 'menu' ? -1 : meK, app.W, app.H, dt, S.cam, ip);
  v.dpr = app.dpr;
  const sh = FX.shake * FX.shake * 9;
  v.ox += (Math.random() - 0.5) * sh, v.oy += (Math.random() - 0.5) * sh;
  app.view = v;
  // puntería propia: trayectoria de la carta que se apunta y mira de la liga
  const p = meK >= 0 ? s.pl[meK] : null;
  let aim: ReturnType<typeof trajectory> = null, hookAim = null;
  if (p && p.alive && app.mode !== 'menu') {
    const ta = T.touchAiming();
    if (ta) { const id = ta.slot === 4 ? p.bonus : p.hand[ta.slot]; if (id) aim = trajectory(s, w, p, id, ta.ax, ta.ay); }
    else if (DESK.aimSlot >= 0) {
      const id = DESK.aimSlot === 4 ? p.bonus : p.hand[DESK.aimSlot], d = readAimOnly(p);
      if (id) aim = trajectory(s, w, p, id, d[0], d[1]);
    }
    if (!aim && !p.hook && lastDevice() !== 'touch') {
      const d = readAimOnly(p), g = hookTarget(s, w, p, { ...NO_INPUT, ax: d[0], ay: d[1] });
      if (g) hookAim = { x: g.x, y: g.y, grace: g.grace, ok: p.charge >= 1 };
    }
  }
  drawWorld(ctx, v, s, w, ip, { me: app.mode === 'menu' ? -1 : meK, aim, hookAim }, dt);
  if (app.mode !== 'menu') {
    drawHud(ctx, v, s, w, ip, { me: meK, touch: T.visible(), aimSlot: T.draggingSlot() >= 0 ? T.draggingSlot() : DESK.aimSlot, selected: DESK.selected,
      table: DESK.showTable, online: app.mode === 'host' ? `SALA ${net.code} · anfitrión` : app.mode === 'guest' ? `SALA ${net.code} · ${net.status}${app.guest?.rtt ? ` · ${Math.round(app.guest.rtt)} ms` : ''}` : '', ping: 0 });
    ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    if (p && UI_free()) T.drawTouch(ctx, p.ulti, !!p.hook, p.charge, p.dashN >= 1);
  }
  if (T.isEditing()) { ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0); T.drawTouch(ctx, 60, false, 2, true); drawHandPreview(); }
}
// En MOVER CONTROLES se ven también los lugares de las cartas
function drawHandPreview() {
  for (const r of handRects(true)) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash([4, 4]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]); }
}
// Mira del ratón o del stick derecho, sin consumir eventos (para dibujar la trayectoria y la mira de la liga)
function readAimOnly(p: Pl): [number, number] {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  if (lastDevice() === 'pad') for (const g of pads) if (g?.connected) { const rx = g.axes[2] ?? 0, ry = -(g.axes[3] ?? 0); return Math.hypot(rx, ry) > 0.25 ? [rx, ry] : [0, 0]; }
  const mp = mousePos();
  if (!mp || !app.view) return [0, 0];
  const [wx, wy] = toWorld(app.view, mp[0], mp[1]);
  let ax = (wx - p.x) / AIM_R, ay = (wy - (p.y + HAND_Y)) / AIM_R;
  const n = Math.hypot(ax, ay);
  if (n > 1) ax /= n, ay /= n;
  return [ax, ay];
}

function togglePause() {
  if (app.mode === 'menu' || T.isEditing()) return;
  if (UI.current === 'results') return;
  if (UI.current === 'pause' || UI.current === 'settings' || UI.current === 'howto') { resume(); return; }
  app.paused = true;
  clearDesktop(), T.clearTouch();
  UI.showPause(app.mode !== 'solo');
}
function resume() {
  app.paused = false, app.last = performance.now();
  UI.hideUI();
  pauseBtn.hidden = false;
  FX.quality = S.quality, FX.shakeOn = S.shake ? 1 : 0;
  A.volumes();
}
pauseBtn.onclick = () => togglePause();
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.mode === 'solo' && !app.paused && UI.current === '') togglePause();
  if (document.hidden && (app.mode === 'host' || app.mode === 'guest')) clearDesktop(), T.clearTouch(); // sin keyup, el personaje seguiría corriendo
  if (document.hidden && app.mode === 'host') bg.start(); else bg.stop();
  app.last = performance.now();
});

// MOVER CONTROLES: se ve el juego (pausado si es solo) con los controles punteados; arriba los tamaños y LISTO
const editbar = document.getElementById('editbar')!;
function editControls() {
  UI.hideUI();
  T.setEditing(true);
  const sl = (k: 'stick' | 'btn' | 'card', l: string) => `<label class="slider"><span>${l}</span><input type="range" data-ts="${k}" min="60" max="160" step="5" value="${S.touch[k]}"><output>${S.touch[k]}</output></label>`;
  editbar.innerHTML = `<div class="row"><b class="grow">Arrastrá el joystick y los botones</b><button class="btn sm ghost" data-e="def">POR DEFECTO</button><button class="btn sm" data-e="ok">LISTO</button></div>
    ${sl('stick', 'joystick %')}${sl('btn', 'botones %')}${sl('card', 'cartas %')}`;
  editbar.hidden = false;
  for (const el of editbar.querySelectorAll<HTMLInputElement>('[data-ts]')) el.oninput = () => { S.touch[el.dataset.ts as 'stick'] = +el.value; (el.nextElementSibling as HTMLOutputElement).textContent = el.value; save(); };
  (editbar.querySelector('[data-e=def]') as HTMLButtonElement).onclick = () => { S.touch.pos = {}, S.touch.stick = S.touch.btn = S.touch.card = 100; save(); editControls(); };
  (editbar.querySelector('[data-e=ok]') as HTMLButtonElement).onclick = () => { T.setEditing(false); editbar.hidden = true; save(); UI.showSettings(UI.settingsBack, 'controles'); };
}

function quit() {
  if (app.mode === 'host' || app.mode === 'guest') { if (!confirm('¿Salir de la sala?')) return; }
  toMenu();
}
function rematch() {
  if (app.mode === 'solo' || (app.mode === 'menu' && !net.conn)) startSolo();
  else if (app.mode === 'host') startOnline();
}

UI.initUI({
  startSolo, createRoom, joinRoom, leaveRoom, startOnline, lobbyChanged: hostBroadcastLobby, pickChanged,
  resume, quit, rematch, editControls,
  online: () => net.conn || net.code ? { host: net.host, code: net.code, seats: (net.host ? lobbySeats() : net.lobby?.seats ?? []).map(s => ({
    name: s.name, ch: s.ch, team: s.team ?? 0, bot: s.bot ?? 0, host: !!(s as { host?: boolean }).host, off: !!(s as { off?: boolean }).off,
    me: net.host ? !!(s as { host?: boolean }).host : (s as { peer?: number }).peer === net.gn.myPeer })), max: net.conn?.max ?? 4, asked: ROOM_MAX, status: net.status, link: roomLink(net.code), qr: net.qr, info: net.info } : null,
});

// Arranque: demo de fondo y título (o directo a una sala con ?sala=CODE)
startDemo();
const q = new URLSearchParams(location.search);
if (q.get('sala')) { UI.showOnline(); joinRoom(q.get('sala')!.toUpperCase()); }
else if (q.get('solo')) { if (q.get('mapa')) S.match.map = q.get('mapa')!; if (q.get('bots')) S.match.bots = +q.get('bots')!; startSolo(); }
else UI.showTitle();
requestAnimationFrame(loop);

// Depuración
(window as unknown as Record<string, unknown>).__catapum = {
  app, net, S, save,
  state: () => curState(),
  world: () => curWorld(),
  me: () => me(),
  solo: (o: { map?: string, bots?: number, time?: number, ch?: string, diff?: number } = {}) => {
    if (o.map) S.match.map = o.map;
    if (o.bots !== undefined) S.match.bots = o.bots;
    if (o.time !== undefined) S.match.time = o.time;
    if (o.ch) S.ch = o.ch;
    if (o.diff) S.match.diff = o.diff;
    startSolo();
  },
  // avanza n cuadros sin rAF con una entrada fija (o la función i(t))
  advance: (n: number, inp?: Partial<Input> | ((k: number) => Partial<Input>)) => {
    const m = app.match;
    if (!m) return null;
    for (let k = 0; k < n; k++) {
      const i = { ...NO_INPUT, ...(typeof inp === 'function' ? inp(k) : inp ?? {}) };
      const evs = m.tick(i);
      fxEvents(evs, m.s, m.me, m.w.m.water);
    }
    return m.s;
  },
  give: (id: string) => { const p = me(); if (p) p.bonus = id; },
  ulti: () => { const p = me(); if (p) p.ulti = 100; },
  menu: toMenu,
};
void save; void HZ;
