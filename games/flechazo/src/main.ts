// FLECHAZO: el rompecabezas de flechas, en 3D y en primera persona. Estás parado sobre el tablero: las flechas son paredes
// bajas de colores; caminás (o saltás por encima) hasta la que querés liberar, la apuntás y sale hacia donde mira su punta.
// Si algo se le cruza, choca, vuelve y perdés una de las 3 vidas. Con islas, se pasa de una a otra pisando un portal o, con
// el equipo (planeo y velocidad 3), saltando; caerse al vacío también cuesta una vida y te devuelve a un lugar seguro.
// Flujo: al entrar arranca directo en el nivel que sigue (la primera vez, el tutorial) → nivel resuelto (monedas) → el
// siguiente. Física a 120 Hz con paso fijo, dibujo por rAF.
import * as THREE from 'three';
import { World, Marker, Portal, PAD_COLORS, type Quality } from './world.ts';
import { ArrowView, type ArrowEv } from './arrows.ts';
import { initInput, read, clearInput, IN } from './input.ts';
import * as H from './hud.ts';
import { drawMini, drawBig, pickArrow, type MapState, type Mark } from './minimap.ts';
import * as M from './menus.ts';
import { PetCtl, petThumbs, petThumb, type FxKind } from './pets.ts';
import { Tutorial, HEX, type TutCtx } from './tutorial.ts';
import { Pilot } from './pilot.ts';
import * as A from './audio.ts';
import { initFullscreen, autoFs } from './fullscreen.ts';
import { LevelEvent, EV_KINDS, EV_P, type EvKind, type EvWorld } from './events.ts';
import { openCase, initCase } from './chest.ts';
import { C, EYE, R, REACH, WALL_H } from './sim/const.ts';
import { levelOf, DIFF_NAME, DIFFS, reward, type Diff } from './sim/levels.ts';
import { occupancy, blockerOf, freeArrows, cx, cy, head, isleOf, type Board } from './sim/puzzle.ts';
import { groundOf, isleAt, roundCorner, safeAt, PAD_R, type Ground } from './sim/ground.ts';
import { newBody, stepBody, arrowBoxes, boxDist, onLand, type Box, type Lim, type Body } from './sim/body.ts';
import { navOf, type Nav } from './sim/nav.ts';
import { parse, phys, buyUp, buyPet, unlocked, upCost, freeTravel, lookOf, wear, type Gfx, FOG, MAP_R, TRAJ_AT, HINT_COST, UNLOCK, TIP, type Save, type PetId, type UpKind } from './sim/meta.ts';
import type { V2 } from './sim/geom.ts';

const KEY = 'flechazo.save', params = new URLSearchParams(location.search);
const save: Save = (() => { let raw: string | null = null; try { raw = localStorage.getItem(KEY); } catch { /* */ } return parse(raw); })();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* sin almacenamiento */ } };
if (params.get('todo') === '1') { save.prog.facil = Math.max(save.prog.facil, UNLOCK + 1); save.prog.dificil = Math.max(save.prog.dificil, UNLOCK + 1); save.tut = Math.max(save.tut, 1); }

const cv = document.getElementById('game') as HTMLCanvasElement;
// AUTO: MEDIA en los táctiles (los teléfonos llenan muchos píxeles con poca GPU), ALTA en la compu
const gfxOf = (g: Gfx): Quality => g !== 'auto' ? g : params.get('touch') === '1' || (matchMedia('(pointer: coarse)').matches && params.get('touch') !== '0') ? 'media' : 'alta';
const W = new World(cv, gfxOf(save.set.gfx));
const $ = (id: string) => document.getElementById(id)!;

type News = { bit: number, tag: string, text: string, tip: string, t: number };
type Level = {
  d: Diff, n: number, b: Board, ox: number, oz: number, lim: Lim, gr: Ground, isle: number[], portals: Portal[], spawn: V2, beacon: V2,
  views: ArrowView[], gone: boolean[], boxCache: Box[][], solid: boolean[], ghost: Set<number>, boxes: Box[], navBoxes: Box[], nav: Nav | null,
  lives: number, errors: number, falls: number, fallTip: number, t: number, left: number, over: '' | 'won' | 'lost', overT: number,
  dest: number, hint: number, tut: Tutorial | null, mapOpened: boolean, idle: number, shopTip: number, news: News[], warps: number,
  ev: LevelEvent | null, chest: boolean, // el evento del nivel y si ya se ganó su cofre (se lleva al pasar el nivel)
};
type Mode = 'play' | 'menu';
const app = { mode: 'play' as Mode, lockFails: 0, lockTry: false, overArrow: false, jumpPend: false, mapOpen: false, acc: 0, last: performance.now(), auto: false, shake: 0, dip: 0, bob: 0, stepD: 0, eye: EYE, hintNag: 0, noTargetNag: 0, padLock: -1,
  safe: [0, 0] as V2, isle: 0, freeze: 0, frame: 0 }; // freeze: segundos sin caminar después de caer
const FALL_Y = -9; // más abajo que esto, cayó al vacío
let L!: Level, body: Body = newBody(0, 0), yaw = 0, pitch = 0, target = -1, petAim = false, pet: PetCtl | null = null, win: M.WinInfo | null = null;
const markers: Marker[] = [];
const pilot = new Pilot();
const ray = new THREE.Raycaster();

// ---- Niveles -------------------------------------------------------------------------------------------------------
function startLevel(d: Diff, n: number) {
  if (L) for (const v of L.views) { W.scene.remove(v.mesh); v.dispose(); }
  if (L) for (const p of L.portals) { W.scene.remove(p.g); p.dispose(); }
  if (L?.ev) { W.scene.remove(L.ev.root); L.ev.dispose(); }
  if (L?.chest && L.over !== 'lost') H.toast('El cofre del evento se perdió', 'bad');
  const b = levelOf(d, n);
  const ox = -((b.w - 1) / 2) * C, oz = -((b.h - 1) / 2) * C, gr = groundOf(b, ox, oz), lim = gr.lim;
  const views = b.arrows.map(a => new ArrowView(b, ox, oz, a));
  for (const v of views) W.scene.add(v.mesh);
  W.buildBoard(b, ox, oz, gr);
  const portals = gr.pads.map((p, i) => new Portal(p.x, p.z, padHex(i), `ISLA ${gr.pads[p.to].isle + 1}`));
  for (const p of portals) W.scene.add(p.g);
  // se empieza abajo, en el margen de la isla de más abajo (la de más a la izquierda); con islas el margen es más angosto
  const home = (b.isles ?? [[0, 0, b.w - 1, b.h - 1]]).reduce((a, c) => c[3] > a[3] || (c[3] === a[3] && c[0] < a[0]) ? c : a);
  const many = gr.floors.length > 1;
  const tutorial = d === 'facil' && n === 1;
  L = {
    d, n, b, ox, oz, lim, gr, isle: b.arrows.map(a => isleOf(b, head(a))), portals,
    spawn: [ox + ((home[0] + home[2]) / 2) * C, oz + home[3] * C + C * (many ? 0.85 : 1.15)], beacon: [ox + 0.3 * C, oz + 5.3 * C],
    views, gone: b.arrows.map(() => false), boxCache: b.arrows.map(a => arrowBoxes(b, a.id, ox, oz)), solid: b.arrows.map(() => true),
    ghost: new Set(), boxes: [], navBoxes: [], nav: null, lives: 3, errors: 0, falls: 0, fallTip: 0, t: 0, left: b.arrows.length, over: '', overT: 0,
    dest: -1, hint: -1, tut: tutorial ? new Tutorial() : null, mapOpened: false, idle: 0, shopTip: !tutorial && save.tut === 1 ? 0 : -1,
    news: tutorial ? [] : newsOf(d, b), warps: 0, ev: planEvent(tutorial, b), chest: false,
  };
  H.event(null);
  app.padLock = -1, app.safe = [...L.spawn] as V2;
  rebuildBoxes();
  body = newBody(L.spawn[0], L.spawn[1]);
  yaw = tutorial ? 0.95 : 0, pitch = -0.18, target = -1, app.eye = EYE, app.shake = 0, app.overArrow = false; // en el tutorial, mirando hacia la luz
  pilot.goal = -1;
  W.fx.clear();
  W.setTrajectory(null);
  W.setFog(FOG[save.up.vis], true);
  spawnPet();
  save.diff = d;
  persist();
  H.level(`${DIFF_NAME[d]} · ${n}`);
  H.hearts(3), H.left(L.left, b.arrows.length), H.time(0), H.coins(save.coins), H.hint(HINT_COST, !tutorial);
  H.coach(null);
  const isl = b.isles && b.isles.length > 1 ? ` · ${b.isles.length} islas` : b.holes?.length ? ' · hueco al medio' : '';
  if (!tutorial) H.toast(`${DIFF_NAME[d]} · nivel ${n} · ${b.arrows.length} flechas${isl}`, '', 2600);
}
const padHex = (i: number) => PAD_COLORS[(i >> 1) % PAD_COLORS.length];

// ---- Eventos del nivel (cofres) -------------------------------------------------------------------------------------
// Uno al azar, a mitad del nivel, solo con alguna mascota adoptada (?evento=gold|catch|trail lo fuerza a los 3 s)
function planEvent(tutorial: boolean, b: Board): LevelEvent | null {
  const forced = params.get('evento') as EvKind | null;
  if (forced && EV_KINDS.includes(forced) && !tutorial) return new LevelEvent(forced, 3);
  if (tutorial || !save.pets.length || b.arrows.length < 6 || Math.random() >= EV_P) return null;
  return new LevelEvent(EV_KINDS[Math.floor(Math.random() * EV_KINDS.length)], 14 + Math.random() * 30);
}
const GOLD = new THREE.Color('#ffc21a');
const EV_TEXT: Record<EvKind, string> = { gold: 'FLECHA DORADA', catch: 'ATRAPÁ LA CHISPITA', trail: 'ANILLOS' };
function evWorld(): EvWorld {
  return { px: body.x, py: body.y, pz: body.z, yaw, groundAt,
    free: (x, z) => x > L.lim.x0 + 0.8 && x < L.lim.x1 - 0.8 && z > L.lim.z0 + 0.8 && z < L.lim.z1 - 0.8 && isleAt(L.gr, x, z) === app.isle && onLand(L.gr, x, z) && (!L.gr.open || safeAt(L.gr, x, z, 0.9)) };
}
function updateEvent(dt: number) {
  const e = L.ev;
  if (!e) return;
  // terminado (bien o mal): la chispita se va volando y los anillos se apagan; después se saca de la escena
  if (e.state === 'fail' || e.state === 'won') { if (!e.fade(dt)) { W.scene.remove(e.root); e.dispose(); L.ev = null; } return; }
  if (L.over || app.mode !== 'play') return;
  if (e.state === 'wait') {
    if (L.t < e.at) return;
    if (e.kind === 'gold') {
      // la dorada: una de tu isla, mejor de las trabadas (que haya que trabajar para sacarla)
      const cand = L.b.arrows.filter(a => !L.gone[a.id] && L.views[a.id].mode === 'rest'), free = new Set(freeArrows(L.b, L.gone));
      if (cand.length < 3) { L.ev = null; return; }
      const mine = cand.filter(a => L.isle[a.id] === app.isle), pool = mine.length ? mine : cand, stuck = pool.filter(a => !free.has(a.id)), pick = stuck.length ? stuck : pool;
      e.gold = pick[Math.floor(Math.random() * pick.length)].id;
      L.views[e.gold].setGold(true);
      if (target === e.gold) H.prompt(L.views[e.gold].hex);
    } else {
      if (!e.begin(evWorld())) { L.ev = null; return; }
      W.scene.add(e.root);
    }
    e.state = 'on';
    A.S.event();
    H.toast(e.kind === 'gold' ? '¡Una flecha se volvió <b>dorada</b>! Liberala sin que choque y ganás un cofre'
      : e.kind === 'catch' ? '¡Apareció una <b>chispita</b>! Atrapala antes de que se escape y ganás un cofre'
      : `¡Un <b>sendero de anillos</b>! Pasá por los ${e.rings.length} a tiempo y ganás un cofre`, 'gold', 3600);
    return;
  }
  if (e.state !== 'on') return;
  if (e.kind === 'gold') {
    const v = L.views[e.gold];
    if (v && Math.random() < dt * 12) {
      const c = v.a.cells[Math.floor(Math.random() * v.a.cells.length)];
      W.fx.emit(L.ox + cx(L.b, c) * C + (Math.random() - 0.5), WALL_H + 0.1, L.oz + cy(L.b, c) * C + (Math.random() - 0.5), GOLD, 1, { speed: 0.4, up: 1.2, size: 0.1, life: 0.9, grav: -0.5 });
    }
    return;
  }
  const o = e.update(dt, evWorld(), (x, y, z, c, n) => W.fx.emit(x, y, z, c, n, { speed: 1.4, up: 1, size: 0.12, life: 0.8, grav: 1 }));
  if (o?.k === 'ring') A.S.ring(o.n ?? 0);
  else if (o?.k === 'won') eventWon(o.x ?? body.x, o.y ?? 1, o.z ?? body.z);
  else if (o?.k === 'fail') eventFail();
}
function eventWon(x: number, y: number, z: number) {
  L.chest = true;
  A.S.gotChest();
  pet?.cheer();
  for (let k = 0; k < 4; k++) W.fx.emit(x, y, z, new THREE.Color(['#ffc21a', '#ff5fb4', '#8b5cff', '#ffffff'][k]), 22, { speed: 5, up: 3, size: 0.16, life: 1.2, grav: 4 });
  H.toast('¡<b>Cofre</b> conseguido! Pasá el nivel para abrirlo', 'gold', 3600);
}
function eventFail() {
  const e = L.ev!;
  e.state = 'fail';
  A.S.miss();
  H.toast(e.kind === 'gold' ? 'La flecha dorada chocó y perdió su brillo' : e.kind === 'catch' ? 'La chispita se escapó' : 'Se terminó el tiempo del sendero', 'bad', 2600);
}
function eventHud() {
  const e = L.ev;
  if (L.chest) { H.event({ text: 'COFRE · pasá el nivel', won: true }); return; }
  if (!e || e.state !== 'on') { H.event(null); return; }
  if (e.kind === 'gold') H.event({ text: EV_TEXT.gold });
  else if (e.kind === 'catch') H.event({ text: EV_TEXT.catch, time: e.left });
  else H.event({ text: `${EV_TEXT.trail} · ${e.next}/${e.rings.length}`, time: e.left });
}

// Lo nuevo del nivel, explicado una sola vez (la primera vez que aparece) en el cartel de abajo
function newsOf(d: Diff, b: Board): News[] {
  const out: News[] = [], seen = (bit: number) => (save.tips & bit) !== 0;
  if (b.pads?.length && !seen(TIP.isles)) out.push({ bit: TIP.isles, t: 0, tag: 'NUEVO · ISLAS', text: 'Pisá un portal para pasar a otra isla: su cartel dice a cuál',
    tip: `Una flecha sale solo si su camino está libre <b>en su isla y en todas las que cruza</b> hasta el borde. <b>Cuidado con el vacío:</b> si caés, perdés una vida.` });
  else if (b.holes?.length && !seen(TIP.hole)) out.push({ bit: TIP.hole, t: 0, tag: 'NUEVO · HUECO', text: 'El hueco del medio no es el borde',
    tip: 'Una flecha que apunta al hueco lo cruza volando y <b>choca con lo que haya del otro lado</b>. Y si caés en él, perdés una vida.' });
  if (b.pads?.length && freeTravel(save) && !seen(TIP.fly)) out.push({ bit: TIP.fly, t: 0, tag: 'NUEVO · VUELO LIBRE', text: 'Ya podés saltar de una isla a otra',
    tip: `Corré hacia el borde, saltá, hacé el <b>doble salto</b> y mantené ${IN.touch ? '<b>SALTAR</b>' : '<b>ESPACIO</b>'} para planear hasta la isla de enfrente.` });
  if (save.pet && !seen(TIP.pet)) out.push({ bit: TIP.pet, t: 0, tag: 'NUEVO · CARICIAS', text: 'Acariciá a tu mascota',
    tip: `Apuntale con la mira y ${IN.touch ? 'tocá <b>ACARICIAR</b>' : 'hacé <b>clic</b> (o <b>E</b>)'}: cada una reacciona a su manera.` });
  if (b.rings?.length && !seen(TIP.ring)) out.push({ bit: TIP.ring, t: 0, tag: 'NUEVO · ANILLOS', text: 'Una flecha larga encierra a otras',
    tip: 'Las de adentro de un anillo chocan contra él: <b>primero sale el anillo</b>. Seguilo hasta encontrar su punta.' });
  if (d === 'extremo' && b.twins?.length && !seen(TIP.twins)) out.push({ bit: TIP.twins, t: 0, tag: 'EXTREMO', text: 'Gemelas del mismo color',
    tip: 'Hay flechas entrelazadas del mismo color. <b>Apuntá a una y se ilumina entera</b>: así ves dónde está su punta.' });
  return out;
}

// L.boxes: las flechas en reposo (la física); L.navBoxes: además el vacío y los huecos (la navegación del piloto)
function rebuildBoxes() {
  L.boxes = [];
  L.views.forEach((v, id) => { if (L.solid[id] && v.mode === 'rest') L.boxes.push(...L.boxCache[id]); });
  L.navBoxes = [...L.gr.voids, ...L.boxes];
  L.nav = null;
}
const setSolid = (id: number, on: boolean) => { if (L.solid[id] !== on) { L.solid[id] = on; rebuildBoxes(); } };
const navNow = () => L.nav ??= navOf(L.lim, L.navBoxes);

function spawnPet() {
  if (pet) { W.scene.remove(pet.root); pet.dispose(); pet = null; }
  if (!save.pet) return;
  pet = new PetCtl(save.pet, body.x - 1, body.z - 2.5, lookOf(save, save.pet));
  pet.onFx = petFx;
  W.scene.add(pet.root);
}
// Las partículas de cada caricia: el fuego de Dragui, las burbujas del ajolote, chispas y gotitas de gelatina
const FX_COL: Record<FxKind, string[]> = { fire: ['#ffb31a', '#ff6a5a', '#ff4fb8'], bubbles: ['#bfe9ff', '#ffffff'], sparkle: ['#ffd23f', '#fff1a8'], jelly: ['#45e3b0', '#ff8fc8'] };
function petFx(k: FxKind, x: number, y: number, z: number) {
  const c = new THREE.Color(FX_COL[k][Math.floor(Math.random() * FX_COL[k].length)]);
  if (k === 'fire') W.fx.emit(x, y, z, c, 10, { speed: 2.4, up: 1.6, size: 0.13, life: 0.6, grav: -1.5, spread: 0.1 });
  else if (k === 'bubbles') W.fx.emit(x, y, z, c, 2, { speed: 0.5, up: 1.2, size: 0.1, life: 1.2, grav: -0.8, spread: 0.2 });
  else W.fx.emit(x, y, z, c, 3, { speed: 1.2, up: 1.4, size: 0.09, life: 0.8, grav: 1.5, spread: 0.25 });
}
function petIt() {
  if (!pet) return;
  pet.love();
  A.S.love(pet.id);
  save.stats.pats++;
  persist();
}

// ---- Liberar -------------------------------------------------------------------------------------------------------
function act() {
  if (app.mode !== 'play' || app.mapOpen || L.over) return;
  A.unlock();
  if (petAim) { petIt(); return; }
  if (target < 0) {
    if (performance.now() - app.noTargetNag > 2500) { app.noTargetNag = performance.now(); H.toast('Acercate a una flecha y apuntala con la mira'); }
    return;
  }
  release(target);
}

function release(id: number) {
  const v = L.views[id];
  if (!v || v.mode !== 'rest' || L.gone[id]) return;
  const hit = blockerOf(L.b, L.b.arrows[id], occupancy(L.b, L.gone));
  v.release(hit);
  setSolid(id, false);
  L.idle = 0;
  // la flecha dorada: sale libre, cofre; choca, pierde el brillo
  if (L.ev?.kind === 'gold' && L.ev.state === 'on' && L.ev.gold === id) {
    if (hit) { eventFail(); v.setGold(false); }
    else { L.ev.state = 'won'; const h = v.headAt(); eventWon(h.p[0], WALL_H + 0.5, h.p[1]); }
  }
  if (hit) { A.S.release(0); L.errors++; save.stats.errors++; return; }
  L.gone[id] = true, L.left--;
  A.S.release(L.b.arrows.length - L.left);
  pet?.cheer();
  if (L.dest === id) L.dest = -1;
  if (L.hint === id) L.hint = -1;
  save.stats.arrows++;
  H.left(L.left, L.b.arrows.length);
  if (L.left === 0) L.over = 'won', L.overT = 0;
}

function onArrow(e: ArrowEv) {
  const v = L.views[e.id];
  if (e.k === 'hit') {
    L.lives = Math.max(0, L.lives - 1);
    H.hearts(L.lives), H.flash();
    A.S.crash();
    app.shake = 0.5;
    W.fx.emit(e.at[0], WALL_H * 0.6, e.at[1], new THREE.Color('#ff3d6a'), 26, { speed: 5, up: 2.5, size: 0.14, life: 0.7 });
    W.fx.emit(e.at[0], WALL_H * 0.6, e.at[1], v.color, 14, { speed: 4, up: 2, size: 0.12, life: 0.6 });
    v.flash = 1;
    if (L.views[e.by]) L.views[e.by].flash = 1;
    pet?.sad();
    if (L.lives === 0) { L.over = 'lost', L.overT = 0; H.toast('¡Choque! Sin vidas', 'bad', 1800); }
    else H.toast(`¡Choque! ${L.lives === 1 ? 'Te queda 1 vida' : `Te quedan ${L.lives} vidas`}`, 'bad');
  } else if (e.k === 'home') {
    if (L.boxCache[e.id].some(k => overlap(k))) L.ghost.add(e.id); else setSolid(e.id, true);
    rebuildBoxes();
  } else if (e.k === 'edge') {
    const h = v.headAt();
    W.fx.emit(h.p[0], WALL_H, h.p[1], v.color, 30, { speed: 5, up: 4, size: 0.2, life: 1.1, grav: 4 });
    A.S.escape(L.b.arrows.length - L.left);
  } else if (e.k === 'gone') {
    W.scene.remove(v.mesh);
  }
}
const overlap = (k: Box) => body.x + R > k.x0 && body.x - R < k.x1 && body.z + R > k.z0 && body.z - R < k.z1 && body.y < k.top;

function useHint() {
  if (app.mode !== 'play' || L.over || L.tut) return;
  const free = freeArrows(L.b, L.gone).filter(id => L.views[id].mode === 'rest');
  if (!free.length) return;
  if (L.hint >= 0 && !L.gone[L.hint]) { H.toast('Ya tenés una pista: la flecha con la luz amarilla'); return; }
  if (save.coins < HINT_COST) { A.S.no(); H.toast(`La pista cuesta ${HINT_COST} monedas`, 'bad'); return; }
  save.coins -= HINT_COST, persist();
  H.coins(save.coins);
  const dist = (id: number) => Math.min(...L.boxCache[id].map(k => boxDist(body.x, body.z, k)));
  L.hint = free.sort((a, b) => dist(a) - dist(b))[0];
  A.S.hint();
  H.toast('La flecha con la luz amarilla está libre', 'gold');
}

// ---- Menús y pantallas ---------------------------------------------------------------------------------------------
function lock(fromClick = false) {
  if (IN.touch || app.auto) return;
  app.lockTry = fromClick;
  try { const p = cv.requestPointerLock() as unknown as Promise<void> | undefined; p?.catch?.(() => {}); } catch { /* */ }
}
function unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

const ctx = (): M.MenuCtx => ({
  save, d: L.d, n: L.n, inLevel: !L.over, win, touch: IN.touch,
  resume, restart: () => { startLevel(L.d, L.n); resume(); }, next: () => { startLevel(L.d, save.prog[L.d]); resume(); },
  play: (d) => { startLevel(d, save.prog[d]); resume(); },
  buyUp: (k: UpKind) => {
    const ok = buyUp(save, k);
    if (ok) { persist(); applyUpgrades(); H.coins(save.coins); if (L.shopTip >= 0) L.shopTip = -1, save.tut = 2, persist(), H.coach(null); }
    return ok;
  },
  buyPet: (id: PetId) => { const ok = buyPet(save, id); if (ok) { persist(); spawnPet(); H.coins(save.coins); A.S.pet(); } return ok; },
  equip: (id) => { save.pet = id; persist(); spawnPet(); if (id) A.S.pet(); },
  settings: () => { persist(); A.setVolumes(save.set.sound, save.set.music); if (gfxOf(save.set.gfx) !== W.quality) W.setQuality(gfxOf(save.set.gfx)); W.resize(save.set.fov); },
  thumbs: () => petThumbs(['gomita', 'michi', 'pio', 'croac', 'bu', 'ajolote', 'zumbi', 'robi', 'dragui'], save.look),
  sfx: (k) => A.S[k](),
  thumb: (p, look, size) => petThumb(p, look, size),
  wear: (p, style, slot) => { wear(save, p, style, slot); persist(); if (p === save.pet) spawnPet(); },
  openChest: (back) => openCase({
    save, persist,
    wear: (p, style, slot) => { wear(save, p, style, slot); save.pet = p; persist(); spawnPet(); A.S.pet(); },
    sfx: { tick: (k) => A.S.tick(k), shake: () => A.S.shake(), burst: () => A.S.burst(), reveal: (t) => A.S.reveal(t), ui: () => A.S.ui() },
    done: () => { H.coins(save.coins); M.show(back, ctx()); },
  }),
  lostChest: L.over === 'lost' && L.chest,
});
function openMenu(p: M.Page) {
  if (app.mapOpen) closeMap(false);
  app.mode = 'menu';
  clearInput(); unlockPointer();
  document.body.classList.remove('playing');
  M.show(p, ctx());
}
function resume() {
  M.hide();
  app.mode = 'play';
  document.body.classList.add('playing');
  clearInput(); lock();
}
function applyUpgrades() { W.setFog(FOG[save.up.vis]); }

const bigmap = $('bigmap'), bigCv = bigmap.querySelector('canvas')!, lockHint = $('lockhint');
let bigTr = { k: 1, x0: 0, y0: 0 };
function openMap() {
  if (app.mode !== 'play' || app.mapOpen) return;
  app.mapOpen = true, L.mapOpened = true;
  const ni = L.gr.floors.length;
  $('bm-title').textContent = ni > 1 ? `MAPA · ESTÁS EN LA ISLA ${isleAt(L.gr, body.x, body.z) + 1} DE ${ni}` : 'MAPA';
  $('bm-legend').textContent = ni > 1 ? 'Cada portal dice a qué isla lleva · tocá una flecha para marcarla como destino' : 'Tocá una flecha para marcarla como destino';
  clearInput(); unlockPointer();
  bigmap.hidden = false;
  document.body.classList.add('mapopen');
  A.S.map();
}
function closeMap(relock = true) {
  if (!app.mapOpen) return;
  app.mapOpen = false;
  bigmap.hidden = true;
  document.body.classList.remove('mapopen');
  if (relock) lock();
}
bigCv.addEventListener('pointerdown', (e) => {
  const id = pickArrow(mapState(), bigTr, e.clientX, e.clientY);
  if (id < 0) return;
  L.dest = L.dest === id ? -1 : id;
  A.S.ui();
  H.toast(L.dest >= 0 ? 'Destino marcado: seguí la luz celeste' : 'Destino borrado', L.dest >= 0 ? 'good' : '');
});
$('bm-x').onclick = () => closeMap();
$('minimap').onclick = () => openMap();
$('b-pause').onclick = () => { if (app.mode === 'play') openMenu('pause'); };
$('b-shop').onclick = () => { if (app.mode === 'play') openMenu('shop'); };
$('b-hint').onclick = () => useHint();
addEventListener('keydown', (e) => {
  if (app.mapOpen && (e.code === 'KeyM' || e.code === 'Escape')) { closeMap(); return; }
  if (app.mode === 'menu' && e.code === 'Escape') { M.escape(ctx()); return; }
  if (app.mode === 'play' && e.code === 'Escape' && !IN.locked) openMenu('pause');
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && app.mode === 'play' && !app.mapOpen && !L.over && !app.auto) openMenu('pause');
});
document.addEventListener('visibilitychange', () => { if (document.hidden && app.mode === 'play' && !L.over && !app.auto) openMenu('pause'); });

initInput(cv, {
  act, map: openMap, hint: useHint,
  shop: () => openMenu('shop'), pause: () => openMenu('pause'),
  gesture: begin, active: () => app.mode === 'play' && !app.mapOpen,
  click: () => { if (!IN.locked && lockable()) { lock(true); return true; } return false; },
});
initFullscreen($('fsbtn') as HTMLButtonElement, (m) => H.toast(m, '', 4500));
initCase();

// Sin pantalla de inicio: se entra directo al nivel. En la compu el primer clic captura el ratón (sin liberar nada) y el
// teclado anda desde el principio; el primer gesto desbloquea el audio y, en el teléfono, pide pantalla completa.
let gestured = false;
function begin() {
  if (gestured) return;
  gestured = true;
  A.unlock(); A.setVolumes(save.set.sound, save.set.music);
  autoFs();
}
// si el navegador no deja capturar el puntero con dos clics seguidos, el clic libera y la mirada va arrastrando
document.addEventListener('pointerlockerror', () => { if (app.lockTry) app.lockFails++; });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) app.lockFails = 0; });
const lockable = () => !IN.touch && !app.auto && app.lockFails < 2;
document.body.classList.add('playing');
document.querySelector('.kmap')!.textContent = IN.touch ? 'TOCALO' : 'M';
// ---- Cuadro --------------------------------------------------------------------------------------------------------
const STEP = 1 / 120;
function mapState(): MapState {
  return { b: L.b, ox: L.ox, oz: L.oz, lim: L.lim, gr: L.gr, padHex: L.gr.pads.map((_, i) => padHex(i)), views: L.views, px: body.x, pz: body.z, yaw, radius: MAP_R[save.up.vis], marks: marks().map(m => ({ x: m.x, z: m.z, hex: m.hex })), target, dest: L.dest };
}
function marks(): (Mark & { y: number })[] {
  const out: (Mark & { y: number })[] = [];
  const onArrowMark = (id: number, hex: string) => {
    if (id < 0 || L.gone[id]) return;
    const h = head(L.b.arrows[id]);
    out.push({ x: L.ox + cx(L.b, h) * C, z: L.oz + cy(L.b, h) * C, y: WALL_H, hex });
  };
  if (L.tut && !L.tut.over) for (const m of L.tut.view(tutCtx()).marks) {
    if (m.arrow !== undefined) onArrowMark(m.arrow, m.hex); else if (m.at) out.push({ x: m.at[0], z: m.at[1], y: 0, hex: m.hex });
  }
  onArrowMark(L.dest, '#22c8ff');
  onArrowMark(L.hint, HEX.go);
  if (L.ev?.state === 'on') {
    if (L.ev.kind === 'gold') onArrowMark(L.ev.gold, '#ffc21a');
    const m = L.ev.mark();
    if (m) out.push({ ...m, hex: '#ffc21a' });
  }
  return out;
}
function tutCtx(): TutCtx {
  const free = freeArrows(L.b, L.gone).filter(id => L.views[id].mode === 'rest');
  return { px: body.x, pz: body.z, beacon: L.beacon, onArrow: body.on >= 0 || app.overArrow, gone: L.gone, mapOpened: L.mapOpened, idle: L.idle, touch: IN.touch, left: L.left, free: free[0] ?? -1 };
}

// Las flechas que quedan detrás de la niebla no se ven: no se dibujan ni hacen sombra (en EXTREMO e ISLAS son muchas)
function cullArrows() {
  const cam = W.camera.position, far = W.fog.far + 2;
  for (const v of L.views) {
    if (v.mode === 'done') continue;
    const bs = v.mesh.geometry.boundingSphere;
    v.mesh.visible = !bs || Math.hypot(bs.center.x - cam.x, bs.center.z - cam.z) - bs.radius < far;
  }
}

// La flecha apuntada (−1 = ninguna). Si la mira le pega antes a la mascota, se la acaricia (petAim)
const petHit = new THREE.Vector3(), petRay = new THREE.Ray();
function pickTarget(): number {
  const eye = W.camera.position;
  ray.setFromCamera(new THREE.Vector2(0, 0), W.camera);
  ray.far = REACH;
  // solo las que están al alcance (el rayo contra todas las mallas, triángulo por triángulo, cuesta en un teléfono)
  const meshes = L.views.filter(v => v.mode === 'rest' && !L.gone[v.id] && L.boxCache[v.id].some(k => boxDist(eye.x, eye.z, k) < REACH + 0.5)).map(v => v.mesh);
  const hit = ray.intersectObjects(meshes, false)[0];
  petAim = false;
  if (pet && !app.auto) { // el piloto automático no acaricia (y la mascota no le tapa las flechas)
    const a = pet.aim();
    petRay.copy(ray.ray);
    if (petRay.intersectSphere(new THREE.Sphere(a.c, a.r), petHit) && petHit.distanceTo(eye) < Math.min(REACH + 0.6, hit?.distance ?? Infinity)) { petAim = true; return -1; }
  }
  if (hit) return hit.object.userData.id as number;
  // sin pegarle con la mira: la flecha cercana más alineada con la vista (ayuda en el teléfono)
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let best = -1, bestA = 0.62;
  for (const v of L.views) {
    if (v.mode !== 'rest' || L.gone[v.id]) continue;
    for (const k of L.boxCache[v.id]) {
      const d = boxDist(eye.x, eye.z, k);
      if (d > 1.9) continue;
      const px = Math.min(k.x1, Math.max(k.x0, eye.x)) - eye.x, pz = Math.min(k.z1, Math.max(k.z0, eye.z)) - eye.z, l = Math.hypot(px, pz);
      const a = l < 0.05 ? 0 : Math.acos(Math.max(-1, Math.min(1, (px * fx + pz * fz) / l)));
      if (a < bestA) bestA = a, best = v.id;
    }
  }
  return best;
}

const groundAt = (x: number, z: number) => { let y = 0; for (const k of L.boxes) if (k.id >= 0 && x > k.x0 - 0.05 && x < k.x1 + 0.05 && z > k.z0 - 0.05 && z < k.z1 + 0.05) y = Math.max(y, k.top); return y; };

function tick(dt: number) {
  const playing = app.mode === 'play';
  const t = performance.now() / 1000;
  const inp = read();
  let fwd = 0, side = 0, jump = false, jumpHit = false;
  if (playing && !app.mapOpen) {
    const sens = 0.0022 * save.set.sens;
    yaw -= inp.dx * sens;
    pitch -= inp.dy * sens * (save.set.invert ? -1 : 1);
    fwd = inp.fwd, side = inp.side, jump = inp.jump, jumpHit = inp.jumpHit;
    if (app.freeze > 0) { app.freeze -= dt; fwd = side = 0, jump = jumpHit = false; }
    if (app.auto && !L.over) {
      const o = pilot.step(dt, { b: L.b, views: L.views, gone: L.gone, boxes: L.navBoxes, boxCache: L.boxCache, nav: navNow, body, yaw, target, gr: L.gr, isle: L.isle, padLock: app.padLock });
      if (o) {
        const da = Math.atan2(Math.sin(o.yaw - yaw), Math.cos(o.yaw - yaw));
        yaw += Math.sign(da) * Math.min(Math.abs(da), dt * 4.5);
        pitch += (o.pitch - pitch) * Math.min(1, dt * 4);
        fwd = o.fwd, side = 0, jumpHit = o.jumpHit, jump = o.jumpHit;
        if (o.act) act();
      }
    }
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
  }
  if (playing && !L.over) L.t += dt, L.idle += dt;
  // movimiento (relativo a la mirada)
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = fwd * fx + side * rx, mz = fwd * fz + side * rz;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) mx /= ml, mz /= ml;
  const ph = phys(save), near = L.boxes.filter(k => boxDist(body.x, body.z, k) < 3);
  app.acc = Math.min(app.acc + (playing ? dt : 0), STEP * 10);
  // el toque de SALTO espera al próximo paso de física (con pantallas de más de 120 Hz hay cuadros sin pasos)
  app.jumpPend = playing && (app.jumpPend || jumpHit);
  while (app.acc >= STEP) {
    app.acc -= STEP;
    const x0 = body.x, z0 = body.z, wasGround = body.ground;
    const ev = stepBody(body, { mx, mz, jump, jumpHit: app.jumpPend }, near, L.lim, ph, STEP, L.gr.open ? L.gr : undefined);
    app.jumpPend = false;
    if (ev.jump) { if (ev.jump === 'suelo') A.S.jump(); else A.S.air(); }
    if (ev.land) { A.S.land(ev.land); app.dip = Math.min(0.16, ev.land * 0.012); }
    if (wasGround && body.ground) app.stepD += Math.hypot(body.x - x0, body.z - z0);
  }
  [body.x, body.z] = roundCorner(L.gr, body.x, body.z, R);
  warp();
  if (L.gr.open && !L.over) {
    // el último lugar firme lejos del vacío: ahí se vuelve después de caer
    if (body.ground && body.on < 0 && !body.void && safeAt(L.gr, body.x, body.z, 2.2)) app.safe = [body.x, body.z];
    if (body.y < FALL_Y) fell();
  }
  if (!body.ground && L.boxes.some(k => overlap({ ...k, top: Infinity }) && body.y >= k.top - 0.05)) app.overArrow = true;
  if (app.stepD > 1.7) { app.stepD = 0; A.S.step(body.on >= 0 ? 1 : 0); }
  // flechas que volvieron mientras el jugador estaba encima: sólidas cuando se corre
  for (const id of L.ghost) if (!L.boxCache[id].some(k => overlap(k))) { L.ghost.delete(id); setSolid(id, true); }
  const evs: ArrowEv[] = [];
  for (const v of L.views) v.update(dt, evs);
  cullArrows();
  for (const e of evs) onArrow(e);

  // cámara
  const want = body.y + EYE;
  app.eye = want > app.eye ? app.eye + (want - app.eye) * Math.min(1, dt * 14) : want;
  const sp = Math.hypot(body.vx, body.vz);
  if (body.ground && sp > 0.5) app.bob += sp * dt * 1.9;
  app.dip *= Math.exp(-dt * 9);
  app.shake *= Math.exp(-dt * 7);
  const sh = app.shake * 0.05;
  W.camera.position.set(body.x, app.eye + Math.sin(app.bob * 2) * 0.035 * Math.min(1, sp / 5) - app.dip, body.z);
  W.camera.rotation.set(pitch + (Math.random() - 0.5) * sh, yaw + (Math.random() - 0.5) * sh, 0);
  W.camera.updateMatrixWorld();

  // apuntar
  const wasPet = petAim;
  const nt = playing && !app.mapOpen && !L.over ? pickTarget() : (petAim = false, -1);
  if (petAim !== wasPet) { H.prompt(petAim ? '#ff4f9a' : target >= 0 ? L.views[target].hex : null, petAim); if (petAim) A.S.target(); }
  if (nt !== target) {
    if (target >= 0) L.views[target].lit = false;
    target = nt;
    if (target >= 0) { L.views[target].lit = true; A.S.target(); }
    if (!petAim) H.prompt(target >= 0 ? L.views[target].hex : null);
    W.setTrajectory(target >= 0 && save.up.vis >= TRAJ_AT ? L.views[target].trajectory() : null, target >= 0 ? L.views[target].hex : '#fff');
  }

  // portales: giran y sueltan chispas que suben (solo los cercanos: los lejos no se ven entre la niebla)
  const cam = W.camera.position;
  L.portals.forEach((p, i) => {
    const pd = L.gr.pads[i], d = Math.hypot(pd.x - cam.x, pd.z - cam.z);
    p.update(dt, d);
    if (d < 22 && Math.random() < dt * 9) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * PAD_R;
      W.fx.emit(L.gr.pads[i].x + Math.cos(a) * r, 0.1, L.gr.pads[i].z + Math.sin(a) * r, p.color, 1, { speed: 0.2, up: 1.4, size: 0.12, life: 1.3, grav: -0.6 });
    }
  });

  updateEvent(dt);
  if (playing) eventHud();

  // mascota, marcadores, tutorial
  pet?.update(dt, { x: body.x, y: body.y, z: body.z, yaw, speed: sp }, groundAt, landAt);
  const ms = marks();
  while (markers.length < ms.length) { const m = new Marker(); markers.push(m); W.scene.add(m.g); }
  markers.forEach((m, i) => {
    m.g.visible = i < ms.length;
    if (i < ms.length) { m.set(ms[i].x, ms[i].z, ms[i].y, ms[i].hex); m.update(dt, Math.hypot(ms[i].x - cam.x, ms[i].z - cam.z)); }
  });
  if (L.fallTip > 0 && playing) {
    // después de caer sin el equipo: por qué
    L.fallTip -= dt;
    if (L.fallTip <= 0) H.coach(null);
    else H.coach({ tag: 'PISTA', text: 'Aún no tenés suficiente velocidad y salto para viajar libremente',
      tip: 'Usá los <b>portales</b>. Con <b>Salto 4</b> (doble salto y planeo) y <b>Velocidad 3</b> vas a poder saltar de una isla a otra.' });
  } else if (L.tut) {
    const c = tutCtx();
    if (L.tut.update(c)) A.S.step2();
    H.coach(L.tut.over ? null : L.tut.view(c));
  } else if (L.news.length && playing && !L.over) {
    // lo nuevo: el de las islas se va al usar un portal; los demás, a los 14 s
    const nw = L.news[0];
    nw.t += dt;
    const done = nw.bit === TIP.isles ? L.warps > 0 && nw.t > 3 : nw.bit === TIP.pet ? ((pet?.pats ?? 0) > 0 && nw.t > 2) || nw.t > 25 : nw.t > 14;
    if (done) { save.tips |= nw.bit; persist(); L.news.shift(); H.coach(null); }
    else H.coach({ tag: nw.tag, text: nw.text, tip: nw.tip });
  } else if (L.shopTip >= 0 && playing) {
    L.shopTip += dt;
    const can = (['vel', 'salto', 'vis'] as UpKind[]).some(k => (upCost(save, k) ?? Infinity) <= save.coins);
    if (L.shopTip > 28 || !can) { L.shopTip = -1; save.tut = 2; persist(); H.coach(null); }
    else H.coach({ tag: 'CONSEJO', text: 'Tenés monedas: comprá una mejora', tip: `${IN.touch ? 'Tocá <b>MEJORAS</b>' : 'Apretá <b>T</b> o tocá <b>MEJORAS</b>'}: velocidad, salto y visibilidad hacen más fácil cada nivel. Son para siempre.` });
  }

  // fin del nivel
  if (L.over) {
    L.overT += dt;
    if (L.over === 'won' && L.overT > 0.25 && L.overT - dt <= 0.25) {
      for (let k = 0; k < 6; k++) W.fx.emit(body.x + (Math.random() - 0.5) * 6, 2 + Math.random() * 2, body.z + (Math.random() - 0.5) * 6, new THREE.Color().setHSL(Math.random(), 0.8, 0.62), 24, { speed: 6, up: 3, size: 0.18, life: 1.6, grav: 5 });
      A.S.win();
    }
    if (L.over === 'won' && L.overT > 1.8 && app.mode === 'play') finishWin();
    if (L.over === 'lost' && L.overT > 1.4 && app.mode === 'play') { A.S.lose(); openMenu('lose'); }
  }

  // HUD y mapas
  if (playing) H.time(L.t);
  const ii = isleAt(L.gr, body.x, body.z);
  if (ii >= 0) app.isle = ii;
  H.isle(app.isle + 1, L.gr.floors.length);
  lockHint.hidden = !(playing && !app.mapOpen && !IN.locked && lockable());
  const st = mapState();
  if (!IN.touch || (app.frame++ & 1) === 0) drawMini($('minimap') as HTMLCanvasElement, st, t);
  if (app.mapOpen) bigTr = drawBig(bigCv, st, t);
  W.fx.update(dt);
  W.follow(body.x, body.z, dt);
}

// Portales: pisar uno (sin estar arriba de una flecha) lleva al otro de su par, con la misma velocidad y mirada. El de
// llegada queda trabado hasta salir de él (si no, se volvería enseguida).
function warp() {
  const P = L.gr.pads;
  if (!P.length) return;
  const at = P.findIndex(p => Math.hypot(body.x - p.x, body.z - p.z) < PAD_R);
  if (at < 0) { app.padLock = -1; return; }
  if (at === app.padLock || body.y > 0.4 || L.over) return;
  const from = P[at], to = P[from.to], col = L.portals[at].color;
  W.fx.emit(body.x, 0.3, body.z, col, 16, { speed: 3, up: 2.5, size: 0.16, life: 0.7, grav: 2 });
  body.x = to.x, body.z = to.z;
  app.padLock = from.to, app.dip = 0.12, app.safe = [to.x, to.z];
  W.fx.emit(to.x, 0.3, to.z, col, 22, { speed: 4, up: 2.5, size: 0.18, life: 0.8, grav: 2 });
  pet?.place(to.x - 1, to.z - 1);
  H.warp(L.portals[at].color.getStyle());
  A.S.warp();
  L.warps++, save.stats.tp++;
  persist();
  H.toast(`Isla ${to.isle + 1}`, '', 900);
}

// Cayó al vacío: una vida menos y vuelve al último lugar seguro. Sin el equipo, el cartel explica por qué no llegó.
function fell() {
  const [x, z] = app.safe;
  body = newBody(x, z);
  app.eye = EYE, app.dip = 0.2, app.shake = 0.45, app.jumpPend = false, app.freeze = 0.6;
  pet?.place(x - 1, z - 1);
  L.lives = Math.max(0, L.lives - 1), L.falls++;
  H.hearts(L.lives), H.flash();
  A.S.fall();
  W.fx.emit(x, 0.4, z, new THREE.Color('#b9a8ff'), 30, { speed: 3, up: 3, size: 0.16, life: 0.9, grav: 3 });
  if (!freeTravel(save) && L.gr.floors.length > 1) L.fallTip = 7;
  if (L.lives === 0) { L.over = 'lost', L.overT = 0; H.toast('¡Al vacío! Sin vidas', 'bad', 1800); }
  else H.toast(`¡Al vacío! ${L.lives === 1 ? 'Te queda 1 vida' : `Te quedan ${L.lives} vidas`}`, 'bad');
}
const landAt = (x: number, z: number) => !L.gr.open || onLand(L.gr, x, z);

function finishWin() {
  const coins = reward(L.d, L.n, L.errors + L.falls);
  const before = DIFFS.filter(d => !unlocked(save, d)), chest = L.chest;
  save.coins += coins, save.stats.won++;
  if (chest) save.chests++, L.chest = false;
  if (L.n >= save.prog[L.d]) save.prog[L.d] = L.n + 1;
  if (L.tut) save.tut = Math.max(save.tut, 1);
  persist();
  win = { coins, perfect: L.errors + L.falls === 0, time: L.t, errors: L.errors + L.falls, tutorial: !!L.tut, unlockedNow: before.find(d => unlocked(save, d)) ?? null, chest };
  H.coins(save.coins);
  for (let i = 0; i < 4; i++) A.S.coin(i);
  openMenu('win');
}

// ---- Bucle ---------------------------------------------------------------------------------------------------------
function frame(now: number) {
  requestAnimationFrame(frame);
  const ms = now - app.last, dt = Math.min(0.05, Math.max(0, ms / 1000));
  app.last = now;
  if (!document.hidden) W.adapt(ms);
  tick(dt);
  W.render();
}
addEventListener('resize', () => W.resize(save.set.fov));

// arranque: directo al nivel que sigue (la primera vez, el tutorial); ?dif=…&nivel=… salta a uno
{
  const qd = params.get('dif') as Diff | null, qn = +(params.get('nivel') ?? 0);
  const d: Diff = qd && DIFFS.includes(qd) ? qd : save.tut === 0 ? 'facil' : save.diff;
  startLevel(d, qn > 0 ? qn : save.tut === 0 && !qd ? 1 : save.prog[d]);
  W.resize(save.set.fov);
  requestAnimationFrame(frame);
}

// Depuración y grabación: window.__flechazo
Object.assign(window, {
  __flechazo: {
    state: () => ({ mode: app.mode, locked: IN.locked, map: app.mapOpen, d: L.d, n: L.n, lives: L.lives, left: L.left, errors: L.errors, over: L.over, target, coins: save.coins,
      isle: isleAt(L.gr, body.x, body.z), isles: L.gr.floors.length, warps: L.warps,
      p: { x: body.x, y: body.y, z: body.z, yaw, pitch, on: body.on }, tut: L.tut?.i ?? -1, up: { ...save.up }, pet: save.pet }),
    begin, play: (d: Diff, n: number) => { startLevel(d, n); resume(); },
    petIt, petAim: () => petAim,
    event: (k: EvKind) => { if (L.ev) { W.scene.remove(L.ev.root); L.ev.dispose(); } L.ev = new LevelEvent(k, L.t); },
    ev: () => L.ev && { kind: L.ev.kind, state: L.ev.state, t: L.ev.t, gold: L.ev.gold, next: L.ev.next, rings: L.ev.rings.map(r => ({ x: r.x, y: r.y, z: r.z })), c: { x: L.ev.cx, y: L.ev.cy, z: L.ev.cz }, chest: L.chest },
    chests: (n: number) => { save.chests += n; persist(); },
    // n cuadros (lógica + dibujo, esperando a la GPU): ms por cuadro, llamadas de dibujo, triángulos y la resolución
    bench: (n = 60) => {
      const gl = W.renderer.getContext(), px = new Uint8Array(4);
      let ms = 0;
      for (let k = 0; k < n; k++) { const t0 = performance.now(); tick(1 / 60); W.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms += performance.now() - t0; }
      const i = W.renderer.info.render;
      return { ms: +(ms / n).toFixed(2), calls: i.calls, tris: i.triangles, points: i.points, pr: +W.renderer.getPixelRatio().toFixed(2) };
    },
    perf: () => ({ fps: +(1000 / W.res.avg).toFixed(1), scale: W.res.scale, pr: +W.renderer.getPixelRatio().toFixed(2), quality: W.quality, calls: W.renderer.info.render.calls, tris: W.renderer.info.render.triangles }), petAt: () => pet && { x: pet.x, y: pet.y, z: pet.z, mood: pet.mood },
    release, act, auto: (on: boolean) => { app.auto = on; if (on) unlockPointer(); },
    solve: () => { for (;;) { const f = freeArrows(L.b, L.gone).filter(id => L.views[id].mode === 'rest'); if (!f.length) break; f.forEach(release); } },
    tp: (x: number, z: number) => { body.x = x, body.z = z, body.vx = body.vz = 0; },
    look: (y: number, p: number) => { yaw = y, pitch = p; },
    give: (c: number) => { save.coins += c; persist(); H.coins(save.coins); },
    pet: (id: PetId | null) => { if (id && !save.pets.includes(id)) save.pets.push(id); save.pet = id; persist(); spawnPet(); },
    menu: (p: M.Page) => openMenu(p), map: (on: boolean) => on ? openMap() : closeMap(), resume,
    advance: (secs: number) => { for (let k = 0; k < secs * 60; k++) tick(1 / 60); W.render(); },
    board: () => L.b, free: () => freeArrows(L.b, L.gone), save, app, W, L: () => L,
  },
});
