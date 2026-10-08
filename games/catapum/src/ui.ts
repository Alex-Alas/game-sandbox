// Menús en DOM sobre el lienzo: título, partida (contra bots), personajes y mazos, online (sala), ajustes, cómo se
// juega, pausa y resultados. Las acciones las hace main.ts (App).
import { CARDS, CARD, RARITY, DECK_SIZE, type CardType } from './sim/cards.ts';
import { CHARS, charOf, PCOLORS, TEAMS } from './sim/chars.ts';
import { MAPS, buildMap } from './sim/maps.ts';
import { RANGES, DEFAULTS, type Cfg } from './sim/params.ts';
import { DIFFS } from './sim/bot.ts';
import { standings } from './sim/sim.ts';
import type { State } from './sim/state.ts';
import { S, save, deckOf, resetAll, KEYS, KEY_LABEL, keyName } from './settings.ts';
import { DESK } from './input.ts';
import { drawPortrait, drawMapThumb } from './render.ts';
import { ICON } from './hud.ts';
import { TYPE_COLOR } from './aim.ts';
import * as A from './audio.ts';

export type LobbySeat = { name: string, ch: string, team: number, bot: number, me?: boolean, host?: boolean, off?: boolean };
export type App = {
  startSolo(): void,
  createRoom(): void, joinRoom(code: string): void, leaveRoom(): void, startOnline(): void, lobbyChanged(): void, pickChanged(): void,
  resume(): void, quit(): void, rematch(): void, editControls(): void,
  online(): null | { host: boolean, code: string, seats: LobbySeat[], max: number, status: string, link: string, qr: string, info: string },
};

const ui = document.getElementById('ui')!;
let app: App;
export let current = '';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = ui) => root.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = ui) => [...root.querySelectorAll(sel)] as T[];
function on(sel: string, ev: string, f: (e: Event, el: HTMLElement) => void) { for (const el of $$(sel)) el.addEventListener(ev, e => f(e, el)); }
function click(sel: string, f: (el: HTMLElement) => void) { on(sel, 'click', (_e, el) => { A.unlock(); A.ui('click'); f(el); }); }
export function toast(msg: string, ms = 2200) {
  const t = document.getElementById('toast')!;
  t.textContent = msg, t.hidden = false;
  clearTimeout((t as unknown as { tm: number }).tm);
  (t as unknown as { tm: number }).tm = setTimeout(() => t.hidden = true, ms) as unknown as number;
}

export function initUI(a: App) { app = a; }
export function hideUI() { ui.innerHTML = '', ui.hidden = true, current = ''; }
function screen(id: string, html: string, dim = true) {
  ui.hidden = false, current = id;
  ui.className = dim ? 'dim' : '';
  ui.innerHTML = `<section class="screen" id="s-${id}"><div class="wrap">${html}</div></section>`;
  for (const cv of $$<HTMLCanvasElement>('canvas[data-ch]')) drawPortrait(cv, cv.dataset.ch!, +(cv.dataset.c ?? 0));
}
function seg(name: string, opts: [string | number, string][], val: string | number) {
  return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${String(v) === String(val)}">${l}</button>`).join('')}</div>`;
}
function bindSeg(name: string, f: (v: string) => void) {
  click(`[data-seg="${name}"] button`, el => {
    for (const b of $$(`[data-seg="${name}"] button`)) b.setAttribute('aria-pressed', String(b === el));
    f(el.dataset.v!);
  });
}

// ---- Título -------------------------------------------------------------------------------------------------------
export function showTitle() {
  screen('title', `
    <h1 class="logo">CATAPUM</h1>
    <div class="sub">BRAWLER DE CARTAS EXPLOSIVAS · SIN TURNOS · TODO SE ROMPE</div>
    <div class="menu">
      <button class="btn big" data-a="solo">JUGAR</button>
      <button class="btn big alt" data-a="online">ONLINE</button>
      <button class="btn orange" data-a="chars">PERSONAJES Y MAZOS</button>
      <button class="btn ghost" data-a="settings">AJUSTES</button>
      <button class="btn ghost" data-a="howto">CÓMO SE JUEGA</button>
      <a class="btn ghost" href="../../" style="text-decoration:none;text-align:center;line-height:24px">← SANDBOX</a>
    </div>
    <div class="row c" style="margin-top:6px"><span class="note">Tu nombre</span><input class="name" type="text" maxlength="14" value="${esc(S.name)}"></div>`);
  click('[data-a=solo]', () => showSetup());
  click('[data-a=online]', () => showOnline());
  click('[data-a=chars]', () => showChars(showTitle));
  click('[data-a=settings]', () => showSettings(showTitle));
  click('[data-a=howto]', () => showHowto(showTitle));
  on('input.name', 'change', (_e, el) => { S.name = (el as HTMLInputElement).value.trim().slice(0, 14) || S.name; save(); });
}

// ---- Partida (solo, o lo que elige el anfitrión online) ------------------------------------------------------------
function heroHtml() {
  const ch = charOf(S.ch);
  return `<div class="panel"><div class="hero"><canvas data-ch="${ch.id}"></canvas><div>
      <div class="nm" style="color:${ch.color}">${ch.name}</div><div class="ds">${ch.desc}</div></div></div>
    <div class="ulti">ULTI · <b>${ch.ultiName}</b>: ${ch.ultiDesc}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm orange" data-a="chars">CAMBIAR PERSONAJE O MAZO</button></div>
    <div class="cards" style="margin-top:8px">${deckOf(ch.id).map(id => cardHtml(id)).join('')}</div></div>`;
}
function cardHtml(id: string, cls = '') {
  const c = CARD[id];
  return `<div class="card r${c.rar} ${cls}" data-card="${id}"><div class="cost">${c.cost}</div><div class="art" style="background:${TYPE_COLOR[c.type]}55">${ICON[id] ?? '?'}</div><div class="nm">${c.name}</div></div>`;
}
const TIMES: [number, string][] = [[60, '1:00'], [120, '2:00'], [180, '3:00'], [300, '5:00'], [0, '∞']];
const CRATES: [number, string][] = [[0, 'NO'], [18, 'POCAS'], [11, 'NORMAL'], [5, 'LLUVIA']];
function optionsHtml(online: boolean, maxBots: number) {
  const m = S.match;
  return `
    <h3>Mapa</h3>
    <div class="mapgrid">${MAPS.map(mp => `<div class="map" data-map="${mp.id}" aria-pressed="${m.map === mp.id}" title="${esc(mp.desc)}"><canvas data-thumb="${mp.id}"></canvas>${mp.name}</div>`).join('')}
      <div class="map" data-map="azar" aria-pressed="${m.map === 'azar'}"><div style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;font-size:32px">🎲</div>AL AZAR</div></div>
    <div class="note" data-mapdesc>${esc(MAPS.find(x => x.id === m.map)?.desc ?? 'Un mapa distinto cada partida.')}</div>
    <div class="opt"><span>BOTS</span><div class="stepper"><button class="btn sm ghost" data-bots="-1">−</button><b data-botn>${Math.min(m.bots, maxBots)}</b><button class="btn sm ghost" data-bots="1">+</button>
      <span class="note">${online ? 'además de los jugadores' : 'rivales'}</span></div></div>
    <div class="opt"><span>DIFICULTAD</span>${seg('diff', DIFFS.map((d, k) => [k + 1, d.name]), m.diff)}</div>
    <div class="opt"><span>TIEMPO</span>${seg('time', TIMES, m.time)}</div>
    <div class="opt"><span>MODO</span>${seg('teams', [[0, 'TODOS CONTRA TODOS'], [1, 'EQUIPOS']], m.teams ? 1 : 0)}</div>
    <div class="opt"><span>CAJAS</span>${seg('crates', CRATES, m.crates)}</div>
    <div class="opt"><span>DAÑO INICIAL</span>${seg('dmg', [[0, '0 %'], [50, '50 %'], [100, '100 %']], m.startDmg)}</div>
    <label class="chk"><input type="checkbox" data-chk="infinite" ${m.infinite ? 'checked' : ''}> Maná infinito (entrenamiento)</label>
    <label class="chk"><input type="checkbox" data-chk="friendly" ${m.friendly ? 'checked' : ''}> Fuego amigo (en equipos)</label>`;
}
function bindOptions(maxBots: number, changed: () => void) {
  for (const cv of $$<HTMLCanvasElement>('canvas[data-thumb]')) { const mp = MAPS.find(x => x.id === cv.dataset.thumb)!; drawMapThumb(cv, buildMap(mp, 1), mp.theme, mp.water); }
  click('[data-map]', el => {
    S.match.map = el.dataset.map!;
    for (const b of $$('[data-map]')) b.setAttribute('aria-pressed', String(b === el));
    $('[data-mapdesc]').textContent = MAPS.find(x => x.id === S.match.map)?.desc ?? 'Un mapa distinto cada partida.';
    save(), changed();
  });
  click('[data-bots]', el => { S.match.bots = Math.max(0, Math.min(maxBots, Math.min(S.match.bots, maxBots) + +el.dataset.bots!)); $('[data-botn]').textContent = String(S.match.bots); save(), changed(); });
  bindSeg('diff', v => { S.match.diff = +v; save(), changed(); });
  bindSeg('time', v => { S.match.time = +v; save(), changed(); });
  bindSeg('teams', v => { S.match.teams = v === '1'; save(), changed(); });
  bindSeg('crates', v => { S.match.crates = +v; save(), changed(); });
  bindSeg('dmg', v => { S.match.startDmg = +v; save(), changed(); });
  on('[data-chk]', 'change', (_e, el) => { (S.match as Record<string, unknown>)[el.dataset.chk!] = (el as HTMLInputElement).checked; save(), changed(); });
}

export function showSetup() {
  screen('setup', `
    <div class="row"><h2 class="grow">PARTIDA CONTRA BOTS</h2><button class="btn ghost sm" data-a="back">VOLVER</button></div>
    <div class="two">${heroHtml()}<div class="panel">${optionsHtml(false, 7)}</div></div>
    <div class="row c"><button class="btn big" data-a="go">¡A JUGAR!</button></div>`);
  bindOptions(7, () => {});
  click('[data-a=back]', showTitle);
  click('[data-a=chars]', () => showChars(showSetup));
  click('[data-a=go]', () => { A.ui('ok'); app.startSolo(); });
}

// ---- Personajes y mazos ----------------------------------------------------------------------------------------------
const TYPES: (CardType | 'TODAS')[] = ['TODAS', 'EXPLOSIVO', 'RAYO', 'MOVIMIENTO', 'TRAMPA', 'APOYO', 'CUERPO'];
export function showChars(back: () => void) {
  let filter: CardType | 'TODAS' = 'TODAS', slot = 0;
  const render = () => {
    const ch = charOf(S.ch), deck = deckOf(ch.id);
    screen('chars', `
      <div class="row"><h2 class="grow">PERSONAJES Y MAZOS</h2><button class="btn sm" data-a="back">LISTO</button></div>
      <div class="panel"><div class="chars">${CHARS.map(c => `<div class="char" data-ch2="${c.id}" aria-pressed="${c.id === S.ch}"><canvas data-ch="${c.id}"></canvas><span style="color:${c.color}">${c.name}</span></div>`).join('')}</div>
        <div class="ulti" style="margin-top:8px">${ch.desc} ULTI · <b>${ch.ultiName}</b>: ${ch.ultiDesc}</div></div>
      <div class="panel">
        <div class="row"><h3 class="grow">Mazo de ${ch.name} (${DECK_SIZE}) · tocá un lugar y después una carta</h3><button class="btn sm ghost" data-a="reset">MAZO ORIGINAL</button></div>
        <div class="cards" data-deck>${deck.map((id, k) => cardHtml(id, k === slot ? 'sel' : '')).join('')}</div>
        <div class="info" data-info>${infoHtml(deck[slot])}</div>
        <h3>Todas las cartas</h3>
        <div class="tabs">${TYPES.map(t => `<button data-f="${t}" aria-selected="${t === filter}">${t}</button>`).join('')}</div>
        <div class="cards" data-pool style="margin-top:6px">${CARDS.filter(c => filter === 'TODAS' || c.type === filter).map(c => cardHtml(c.id, deck.includes(c.id) ? 'in' : '')).join('')}</div>
      </div>`);
    click('[data-a=back]', () => back());
    click('[data-ch2]', el => { S.ch = el.dataset.ch2!; save(); slot = 0; render(); app.pickChanged(); });
    click('[data-a=reset]', () => { delete S.decks[S.ch]; save(); render(); app.pickChanged(); });
    click('[data-f]', el => { filter = el.dataset.f as CardType; render(); });
    click('[data-deck] .card', el => { slot = [...el.parentElement!.children].indexOf(el); render(); });
    click('[data-pool] .card', el => {
      const id = el.dataset.card!, d = deckOf(S.ch).slice(), at = d.indexOf(id);
      if (at >= 0) [d[at], d[slot]] = [d[slot], d[at]]; else d[slot] = id;
      S.decks[S.ch] = d, save();
      slot = (slot + 1) % DECK_SIZE;
      render(); app.pickChanged();
      $('[data-info]').innerHTML = infoHtml(id);
    });
  };
  render();
}
function infoHtml(id: string) {
  const c = CARD[id];
  return c ? `<b>${ICON[id]} ${c.name}</b> · ${c.cost} maná · ${c.type} · ${RARITY[c.rar]}<br>${c.desc}` : '';
}

// ---- Online -------------------------------------------------------------------------------------------------------------
export function showOnline(err = '') {
  const q = new URLSearchParams(location.search).get('sala') ?? '';
  screen('online', `
    <div class="row"><h2 class="grow">ONLINE</h2><button class="btn ghost sm" data-a="back">VOLVER</button></div>
    <div class="two">
      <div class="panel"><h3>Crear sala</h3><p class="note">Sos el anfitrión: tu equipo corre la partida. Elegís mapa, reglas y cuántos bots se suman.</p>
        <button class="btn big" data-a="create">CREAR SALA</button></div>
      <div class="panel"><h3>Unirse con código</h3>
        <div class="row"><input type="text" maxlength="4" data-code value="${esc(q.toUpperCase())}" placeholder="ABCD"><button class="btn alt" data-a="join">ENTRAR</button></div>
        ${err ? `<p class="err">${esc(err)}</p>` : ''}
        <p class="note">Jugás con el personaje y el mazo que tengas elegidos (se pueden cambiar en la sala).</p></div>
    </div>
    <div class="panel">${heroHtml()}</div>`);
  click('[data-a=back]', showTitle);
  click('[data-a=chars]', () => showChars(() => showOnline()));
  click('[data-a=create]', () => app.createRoom());
  click('[data-a=join]', () => app.joinRoom(($<HTMLInputElement>('[data-code]').value || '').toUpperCase().trim()));
  on('[data-code]', 'keydown', e => { if ((e as KeyboardEvent).key === 'Enter') app.joinRoom(($<HTMLInputElement>('[data-code]').value || '').toUpperCase().trim()); });
}

export function showLobby() {
  const o = app.online();
  if (!o) return showOnline();
  const humans = o.seats.filter(s => !s.bot).length, maxBots = Math.max(0, 8 - humans);
  screen('lobby', `
    <div class="row"><h2 class="grow">SALA</h2><span class="note">${esc(o.status)}</span><button class="btn red sm" data-a="leave">SALIR</button></div>
    <div class="two">
      <div class="panel" style="text-align:center"><div class="note">CÓDIGO</div><div class="code">${o.code}</div>
        ${o.qr ? `<div class="qr">${o.qr}</div>` : ''}
        <div class="row c"><button class="btn sm ghost" data-a="copy">COPIAR ENLACE</button></div>
        <h3>Jugadores (${humans}/${o.max})</h3>
        <div class="players">${o.seats.map((s, k) => `<div class="pl"><canvas data-ch="${s.ch}" data-c="${k}"></canvas><span style="color:${S.match.teams ? TEAMS[s.team].color : PCOLORS[k % 8]}">${esc(s.name)}</span>
          <span class="tag">${s.host ? 'ANFITRIÓN' : s.bot ? 'BOT ' + DIFFS[s.bot - 1].name : s.off ? 'DESCONECTADO' : ''}${s.me ? ' · VOS' : ''}</span></div>`).join('')}</div>
        <div class="row c" style="margin-top:8px"><button class="btn sm orange" data-a="chars">MI PERSONAJE Y MAZO</button></div>
      </div>
      <div class="panel">${o.host ? optionsHtml(true, maxBots) + `<div class="row c" style="margin-top:10px"><button class="btn big" data-a="start">¡EMPEZAR!</button></div>`
        : `<h3>Esperando al anfitrión…</h3><p class="note">Elige el mapa y las reglas. Mientras tanto podés cambiar de personaje o de mazo.</p>${o.info ? `<div class="ulti"><b>${esc(o.info)}</b></div>` : ''}`}</div>
    </div>`);
  click('[data-a=leave]', () => app.leaveRoom());
  click('[data-a=copy]', () => { navigator.clipboard?.writeText(o.link).then(() => toast('Enlace copiado'), () => toast(o.link, 5000)); });
  click('[data-a=chars]', () => showChars(showLobby));
  if (o.host) {
    bindOptions(maxBots, () => { app.lobbyChanged(); });
    click('[data-a=start]', () => app.startOnline());
  }
}

// ---- Ajustes -------------------------------------------------------------------------------------------------------------
const ADV_GROUPS: [string, (keyof Cfg)[]][] = [
  ['Carrera y salto', ['RUN', 'ACC', 'DEC', 'AIR', 'JUMP_H', 'JUMP_T', 'JUMP_CUT', 'FALL_G', 'MAX_FALL', 'FAST_FALL', 'COYOTE', 'BUFFER', 'AIR_JUMPS', 'JUMP2_H', 'STEP']],
  ['Pared', ['WALL_SLIDE', 'WJ_VX', 'WJ_H', 'WJ_LOCK', 'WALL_COYOTE']],
  ['Dash', ['DASH_V', 'DASH_F', 'DASH_END', 'DASH_CD', 'DASH_IF', 'SUPER_VX', 'HYPER_VX', 'HYPER_JUMP']],
  ['Barrida y picada', ['SLIDE_MIN', 'SLIDE_BOOST', 'SLIDE_MAX', 'SLIDE_FRIC', 'POUND_V', 'POUND_BOUNCE']],
  ['Liga', ['HOOK_LEN', 'HOOK_TRAVEL', 'HOOK_K', 'HOOK_REST', 'HOOK_V', 'HOOK_DAMP', 'HOOK_JUMP', 'HOOK_N', 'HOOK_CD', 'HOOK_CONE', 'HOOK_MISS', 'YANK_V']],
  ['Golpes y empuje', ['KB', 'KB_DRAG', 'STUN_K', 'DI', 'TECH', 'BOUNCE_V', 'BOUNCE_E', 'SELF_KB', 'FRAG_K', 'LEAD_K', 'DASH_HIT', 'SLIDE_HIT', 'POUND_HIT']],
  ['Maná, ulti y partida', ['MANA_START', 'MANA_MAX', 'MANA_REGEN', 'CAST_CD', 'ULTI_DEALT', 'ULTI_TAKEN', 'ULTI_KO', 'ULTI_TRICK', 'ULTI_PASSIVE', 'RESPAWN', 'SPAWN_INV', 'KO_CREDIT']],
];
{ // toda clave tuneable tiene que estar en algún grupo
  const listed = new Set(ADV_GROUPS.flatMap(g => g[1]));
  for (const k of Object.keys(RANGES)) if (!listed.has(k as keyof Cfg)) console.warn(`ajuste sin grupo: ${k}`);
}
let listening = '';
export let settingsBack: () => void = () => {};
export function showSettings(back: () => void, tab0 = 'juego') {
  settingsBack = back;
  let tab = tab0;
  const render = () => {
    const T = S.touch;
    const sl = (key: string, label: string, v: number, min: number, max: number, step: number) =>
      `<label class="slider"><span>${label}</span><input type="range" data-sl="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}</output></label>`;
    const tabs: Record<string, string> = {
      juego: `
        <div class="opt"><span>NOMBRE</span><input class="name" type="text" maxlength="14" value="${esc(S.name)}"></div>
        <div class="opt"><span>CÁMARA</span>${seg('cam', [['todos', 'A TODOS'], ['yo', 'A MÍ']], S.cam)}</div>
        <div class="opt"><span>CALIDAD</span>${seg('quality', [[0.5, 'BAJA'], [1, 'ALTA']], S.quality)}</div>
        <label class="chk"><input type="checkbox" data-s="shake" ${S.shake ? 'checked' : ''}> Sacudones de pantalla</label>
        <label class="chk"><input type="checkbox" data-s="nums" ${S.nums ? 'checked' : ''}> % sobre los personajes</label>
        <label class="chk"><input type="checkbox" data-s="vibrate" ${S.vibrate ? 'checked' : ''}> Vibración (teléfono)</label>
        <div class="row" style="margin-top:10px"><button class="btn sm red" data-a="wipe">BORRAR TODO LO GUARDADO</button></div>`,
      controles: `
        <h3>Táctil</h3>
        <div class="opt"><span>LIGA</span>${seg('scheme', [['stick', 'JOYSTICK'], ['drag', 'ARRASTRAR']], T.scheme)}</div>
        <p class="note">${T.scheme === 'stick' ? 'GARFIO mantenido = enganchado; la liga va hacia el joystick (sin dirección: adelante y arriba) con imán a los rivales.' : 'Arrastrá desde GARFIO para apuntar y soltá para lanzar. Queda enganchada hasta tocar GARFIO otra vez o SALTO.'}</p>
        <label class="chk"><input type="checkbox" data-t="auto" ${T.auto ? 'checked' : ''}> Tocar una carta la lanza con auto-apuntado (arrastrar apunta a mano)</label>
        <label class="chk"><input type="checkbox" data-t="left" ${T.left ? 'checked' : ''}> Zurdo (joystick a la derecha)</label>
        ${sl('stick', 'joystick %', T.stick, 60, 160, 5)}${sl('btn', 'botones %', T.btn, 60, 160, 5)}${sl('card', 'cartas %', T.card, 60, 160, 5)}${sl('dead', 'zona muerta', T.dead, 0, 0.6, 0.01)}
        <div class="row" style="margin-top:6px"><button class="btn sm alt" data-a="move">MOVER CONTROLES</button><button class="btn sm ghost" data-a="touchreset">LUGARES POR DEFECTO</button></div>
        <h3>Teclado y ratón</h3>
        <p class="note">Las cartas se apuntan manteniendo su tecla (la trayectoria sigue al ratón) y salen al soltarla. La rueda elige la carta del botón del ratón.</p>
        <div class="opt"><span>RATÓN</span>${seg('mouse', [[0, 'IZQ. GARFIO · DER. CARTA'], [1, 'IZQ. CARTA · DER. GARFIO']], S.mouseSwap ? 1 : 0)}</div>
        <label class="chk"><input type="checkbox" data-s="wJump" ${S.wJump ? 'checked' : ''}> La tecla de arriba también salta</label>
        <div class="keys">${Object.keys(KEYS).map(a => `<div class="opt"><span>${KEY_LABEL[a].toUpperCase()}</span><div class="row">${(S.keys[a] ?? []).map(k => `<kbd>${keyName(k)}</kbd>`).join(' ')}
          <button class="btn sm ghost" data-key="${a}">${listening === a ? 'APRETÁ UNA TECLA…' : 'CAMBIAR'}</button></div></div>`).join('')}</div>
        <div class="row"><button class="btn sm ghost" data-a="keyreset">TECLAS POR DEFECTO</button></div>
        <h3>Mando</h3>
        <p class="note">Stick izq. mover · stick der. apuntar · A salto · B dash · LT garfio · X o RT carta elegida (mantener y soltar) · LB/RB cambiar carta · Y ulti · START pausa</p>`,
      sonido: `${sl('sfx', 'efectos', S.sfx, 0, 1, 0.05)}${sl('music', 'música', S.music, 0, 1, 0.05)}`,
      avanzado: `<p class="note">Los valores de la física y el combate (sin calibrar: son el punto de partida). En una partida online mandan los del anfitrión.</p>
        <div class="row"><button class="btn sm ghost" data-a="advreset">RESTABLECER TODO</button><button class="btn sm ghost" data-a="advcopy">COPIAR JSON</button></div>
        ${ADV_GROUPS.map(([g, ks]) => `<h3>${g}</h3>` + ks.map(k => { const r = RANGES[k] as [number, number, number, number, string]; const v = S.adv[k] ?? DEFAULTS[k]; return `<label class="slider"><span title="${k}">${r[4]}</span><input type="range" data-adv="${k}" min="${r[1]}" max="${r[2]}" step="${r[3]}" value="${v}"><output>${v}</output></label>`; }).join('')).join('')}`,
    };
    screen('settings', `
      <div class="row"><h2 class="grow">AJUSTES</h2><button class="btn sm" data-a="back">LISTO</button></div>
      <div class="tabs">${Object.keys(tabs).map(k => `<button data-tab="${k}" aria-selected="${k === tab}">${k.toUpperCase()}</button>`).join('')}</div>
      <div class="panel">${tabs[tab]}</div>`);
    click('[data-a=back]', () => { listening = '', DESK.onKey = null; back(); });
    click('[data-tab]', el => { tab = el.dataset.tab!; listening = '', DESK.onKey = null; render(); });
    on('input.name', 'change', (_e, el) => { S.name = (el as HTMLInputElement).value.trim().slice(0, 14) || S.name; save(); });
    bindSeg('cam', v => { S.cam = v as 'todos' | 'yo'; save(); });
    bindSeg('quality', v => { S.quality = +v; save(); });
    bindSeg('scheme', v => { S.touch.scheme = v as 'stick' | 'drag'; save(); render(); });
    on('[data-s]', 'change', (_e, el) => { (S as unknown as Record<string, unknown>)[el.dataset.s!] = (el as HTMLInputElement).checked; save(); });
    on('[data-t]', 'change', (_e, el) => { (S.touch as Record<string, unknown>)[el.dataset.t!] = (el as HTMLInputElement).checked; save(); });
    on('[data-sl]', 'input', (_e, el) => {
      const k = el.dataset.sl!, v = +(el as HTMLInputElement).value;
      (el.nextElementSibling as HTMLOutputElement).textContent = String(v);
      if (k === 'sfx' || k === 'music') (S as unknown as Record<string, number>)[k] = v, A.volumes();
      else (S.touch as Record<string, unknown>)[k] = v;
      save();
    });
    on('[data-adv]', 'input', (_e, el) => {
      const k = el.dataset.adv as keyof Cfg, v = +(el as HTMLInputElement).value;
      (el.nextElementSibling as HTMLOutputElement).textContent = String(v);
      if (v === DEFAULTS[k]) delete S.adv[k]; else S.adv[k] = v;
      save();
    });
    bindSeg('mouse', v => { S.mouseSwap = v === '1'; save(); });
    click('[data-key]', el => {
      listening = el.dataset.key!;
      DESK.onKey = code => {
        if (code !== 'Escape' || listening === 'pause') S.keys[listening] = [code];
        listening = '', DESK.onKey = null;
        save(), render();
        return true;
      };
      render();
    });
    click('[data-a=keyreset]', () => { S.keys = { ...KEYS }; save(); render(); });
    click('[data-a=move]', () => app.editControls());
    click('[data-a=touchreset]', () => { S.touch.pos = {}; save(); toast('Controles en su lugar'); });
    click('[data-a=advreset]', () => { S.adv = {}; save(); render(); });
    click('[data-a=advcopy]', () => navigator.clipboard?.writeText(JSON.stringify({ ...DEFAULTS, ...S.adv }, null, 1)).then(() => toast('Copiado')));
    click('[data-a=wipe]', () => { if (confirm('¿Borrar nombre, mazos y ajustes guardados?')) resetAll(); });
  };
  render();
}

// ---- Cómo se juega -------------------------------------------------------------------------------------------------------
export function showHowto(back: () => void) {
  screen('howto', `
    <div class="row"><h2 class="grow">CÓMO SE JUEGA</h2><button class="btn sm" data-a="back">LISTO</button></div>
    <div class="panel howto">
      <h3>El objetivo</h3>
      <p>Sacá a los demás del ring: al <b>agua</b> (o la lava), por los <b>costados</b> o por <b>arriba</b>. Cada KO es <b>+1</b> para quien tocó último a la víctima; caerte solo es <b>−1</b>. Cuando se acaba el tiempo gana el que más tiene (si hay empate: <b>muerte súbita</b>, todos al 300 %).</p>
      <p>El daño no mata: sube tu <b>%</b>, y cuanto más alto, más lejos volás. <b>FRÁGIL</b> (melocotón, shuriken, banana) te hace volar todavía más; <b>PIES DE PLOMO</b> te ancla. Cuando te lanzan, el joystick hacia un costado desvía el golpe y <b>SALTO justo antes de pegar contra algo</b> es un <b>TECH</b>: te frena en seco.</p>
      <h3>Moverse (todo pega)</h3>
      <p><b>Doble salto</b> y <b>salto de pared</b> (deslizate apretando contra ella). <b>DASH</b> en 8 direcciones: invulnerable al empezar y empuja a quien tocás. <b>Dash + SALTO</b> en el suelo = <b>SUPER</b>. Dash en diagonal hacia el suelo = <b>WAVEDASH</b>, y <b>SALTO</b> en esa barrida = <b>HYPER</b> (salto largo y bajo). <b>↓ corriendo</b> = <b>barrida</b> (derriba). <b>Dash ↓ en el aire</b> = <b>PICADA</b>: pisotón con onda; mantené SALTO para <b>rebotar</b> alto.</p>
      <p><b>GARFIO</b>: la liga se pega al terreno, a los rivales y a las cajas. Mantené para columpiarte; SALTO enganchado al terreno suelta con impulso. Enganchado a un rival o una caja, <b>DASH lo lanza</b> hacia vos y más allá. Tus propias explosiones te empujan sin dañarte: <b>rocket jump</b>.</p>
      <h3>Cartas</h3>
      <p>Armá un mazo de 8; tenés 4 en la mano y la que usás se repone con la siguiente. Cuestan <b>maná</b>, que se recarga solo. Las <b>cajas</b> que caen en paracaídas dan una carta extra <b>gratis</b> (la quinta ranura), o ulti, o maná.</p>
      <h3>Ulti</h3>
      <p>Cada personaje tiene la suya. Se carga pegando, recibiendo, con trucos de movimiento y con KOs. Con la barra llena: <b>ULTI</b> (en algunas, apretala otra vez para terminarla antes).</p>
      <h3>Controles</h3>
      <p><b>Teléfono</b> (acostado): joystick a la izquierda; SALTO, DASH, GARFIO y ULTI a la derecha; arrastrá una carta para apuntar y soltala para lanzarla (un toque: auto-apuntado).</p>
      <p><b>PC</b>: <kbd>A</kbd><kbd>D</kbd> correr, <kbd>W</kbd><kbd>S</kbd> dirección, <kbd>ESPACIO</kbd> salto, <kbd>SHIFT</kbd> dash, clic izq. garfio, <kbd>1</kbd>–<kbd>5</kbd> cartas (mantener apunta con el ratón), <kbd>Q</kbd> ulti.</p>
      <p><b>Mando</b>: sticks mover y apuntar, A salto, B dash, LT garfio, RT carta, LB/RB cambiar carta, Y ulti.</p>
    </div>`);
  click('[data-a=back]', () => back());
}

// ---- Pausa y resultados -------------------------------------------------------------------------------------------------
export function showPause(online: boolean) {
  screen('pause', `
    <h2 style="text-align:center;font-size:34px">PAUSA</h2>
    ${online ? '<p class="note" style="text-align:center">La partida sigue corriendo para los demás.</p>' : ''}
    <div class="menu">
      <button class="btn big" data-a="resume">CONTINUAR</button>
      <button class="btn ghost" data-a="settings">AJUSTES</button>
      <button class="btn ghost" data-a="howto">CÓMO SE JUEGA</button>
      <button class="btn red" data-a="quit">${online ? 'SALIR DE LA SALA' : 'SALIR AL MENÚ'}</button>
    </div>`);
  click('[data-a=resume]', () => app.resume());
  click('[data-a=settings]', () => showSettings(() => showPause(online), 'controles'));
  click('[data-a=howto]', () => showHowto(() => showPause(online)));
  click('[data-a=quit]', () => app.quit());
}

export function showResults(s: State, me: number, canRematch: boolean, online: boolean) {
  const st = standings(s), order = st.order;
  const title = s.rules.teams ? (st.winner < 0 ? '¡EMPATE!' : `¡GANA EL EQUIPO ${TEAMS[st.winner].name}!`)
    : st.winner < 0 ? '¡EMPATE!' : st.winner === me ? '¡GANASTE!' : `¡GANA ${esc(s.pl[st.winner].name)}!`;
  const top = order.slice(0, 3), heights = [130, 100, 80], place = [1, 0, 2].filter(k => k < top.length);
  screen('results', `
    <h2 style="text-align:center;font-size:32px">${title}</h2>
    <div class="podium">${place.map(k => { const p = top[k]; const c = s.rules.teams ? TEAMS[p.team].color : PCOLORS[p.color]; return `<div><canvas data-ch="${p.ch}" data-c="${p.color}"></canvas><div style="color:${c}">${esc(p.name)}</div>
      <div class="step" style="height:${heights[k]}px;background:${k === 0 ? 'var(--yellow)' : k === 1 ? '#c9d2e0' : '#d08a4a'};color:#2a1300">${k + 1}</div></div>`; }).join('')}</div>
    <div class="panel"><table class="res"><tr><th>JUGADOR</th><th>PTS</th><th>KO</th><th>CAÍDAS</th><th>% HECHO</th><th>TRUCOS</th></tr>
      ${order.map((p, k) => `<tr><td style="color:${s.rules.teams ? TEAMS[p.team].color : PCOLORS[p.color]}">${k + 1}. ${esc(p.name)} · ${charOf(p.ch).name}${p.id === me ? ' (vos)' : ''}</td><td>${p.score}</td><td>${p.kos}</td><td>${p.falls}</td><td>${Math.round(p.dealt)}</td><td>${p.tricks}</td></tr>`).join('')}
    </table></div>
    <div class="row c">${canRematch ? '<button class="btn big" data-a="again">REVANCHA</button>' : online ? '<span class="note">Esperando al anfitrión…</span>' : ''}
      <button class="btn ghost" data-a="menu">${online ? 'SALIR DE LA SALA' : 'MENÚ'}</button></div>`);
  click('[data-a=again]', () => app.rematch());
  click('[data-a=menu]', () => app.quit());
}

export { RARITY };
