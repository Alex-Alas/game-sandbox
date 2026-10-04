/* Pantallas en DOM sobre el canvas: título, sala, premios, fin de run, ajustes y pausa.
   Solo arma y muestra; las decisiones viven en main.js. */
import { renderSVG } from 'uqr';
import { PLAYER_COLORS, HEROES, SETTINGS } from './config.js';
import { heroFrames, beastIcon } from './sprites.js';
import { TITLES, ROPES, titleById, ropeColor } from './cosmetics.js';
import { BEASTS, BOSSES } from './beasts.js';
import { hasTitle, hasRope } from './profile.js';

export const $ = (id) => document.getElementById(id);
const SCREENS = ['title', 'lobby', 'awards', 'runend'];

export function showScreen(name) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  $('hud').classList.toggle('hidden', name !== 'play');
}
export function overlay(id, on) { $(id).classList.toggle('hidden', !on); }

export const colorHex = (id) => (PLAYER_COLORS.find((c) => c.id === id) || PLAYER_COLORS[0]).hex;

function heroCanvas(hero, color) {
  const im = heroFrames(hero, color).idle[0];
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  c.getContext('2d').drawImage(im, 0, 0);
  return c;
}

let toastTimer = 0;
export function toast(text, ms = 1600) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/* ── Sala ── */
let qrFor = '';
export function renderLobby(s, cb) {
  // s: { code, link, online, players, myId, isHost, canStart, phase, ready, profile, msg }
  $('room-code').textContent = s.online ? s.code : 'SOLO';
  $('btn-share').classList.toggle('hidden', !s.online);
  $('qr').classList.toggle('hidden', !s.online);
  if (s.online && qrFor !== s.link) {
    qrFor = s.link;
    $('qr').innerHTML = renderSVG(s.link, { border: 1, blackColor: '#1a0f0a', whiteColor: '#f4e6cf' });
  }
  const list = $('lobby-players');
  list.textContent = '';
  for (const p of s.players) {
    const row = document.createElement('div');
    row.className = 'pl' + (p.on === false ? ' off' : '');
    row.appendChild(heroCanvas(p.hero, colorHex(p.color)));
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = (p.name || '…') + (p.id === s.myId ? ' (vos)' : '');
    nm.style.color = colorHex(p.color);
    const ti = titleById(p.title);
    if (ti) { const e = document.createElement('span'); e.className = 'ti'; e.textContent = ti.name; nm.appendChild(e); }
    row.appendChild(nm);
    const st = document.createElement('span');
    st.className = 'st';
    if (p.on === false) st.textContent = 'desconectado';
    else if (p.pending) st.textContent = 'entra en el próximo tramo';
    else if (p.bot) { st.textContent = 'bot'; st.classList.add('ok'); }
    else if (p.ready) { st.textContent = p.host ? 'anfitrión · listo' : 'listo'; st.classList.add('ok'); }
    else st.textContent = p.host ? 'anfitrión' : 'eligiendo…';
    row.appendChild(st);
    list.appendChild(row);
  }
  // Mis elecciones
  const name = $('me-name');
  if (document.activeElement !== name) name.value = s.profile.name;
  const taken = new Set(s.players.filter((p) => p.id !== s.myId).map((p) => p.color));
  const sw = $('me-colors');
  sw.textContent = '';
  for (const c of PLAYER_COLORS) {
    const b = document.createElement('button');
    b.style.background = c.hex;
    b.className = s.profile.color === c.id ? 'sel' : '';
    b.disabled = taken.has(c.id);
    b.setAttribute('aria-label', c.id);
    b.onclick = () => cb.color(c.id);
    sw.appendChild(b);
  }
  const hs = $('me-heroes');
  hs.textContent = '';
  for (const h of HEROES) for (const sx of ['m', 'f']) {
    const id = `${h.id}_${sx}`;
    const b = document.createElement('button');
    b.className = s.profile.hero === id ? 'sel' : '';
    b.title = `${h.name} (${sx})`;
    b.appendChild(heroCanvas(id, colorHex(s.profile.color)));
    b.onclick = () => cb.hero(id);
    hs.appendChild(b);
  }
  // Título y cuerda (solo los ganados; los demás muestran cómo se ganan)
  const sel = $('me-title');
  sel.textContent = '';
  for (const t of [{ id: '', name: 'Sin título' }, ...TITLES.filter((x) => hasTitle(s.profile, x.id))]) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.name;
    sel.appendChild(o);
  }
  sel.value = hasTitle(s.profile, s.profile.title) ? s.profile.title : '';
  sel.onchange = () => cb.title(sel.value);
  const rs = $('me-ropes');
  rs.textContent = '';
  for (const r of ROPES) {
    const b = document.createElement('button');
    const own = hasRope(s.profile, r.id);
    b.className = (s.profile.rope === r.id ? 'sel' : '') + (own ? '' : ' lock');
    b.title = own ? r.name : `${r.name}: ${r.desc}`;
    b.appendChild(ropeSwatch(r.id));
    b.appendChild(document.createTextNode(own ? r.name : '🔒'));
    b.onclick = () => (own ? cb.rope(r.id) : toast(`${r.name}: ${r.desc}`, 2200));
    rs.appendChild(b);
  }
  $('btn-ready').textContent = s.ready ? 'No estoy listo' : 'Listo';
  $('btn-ready').classList.toggle('hidden', !!s.solo);
  $('ready-tip').classList.toggle('hidden', !!s.solo || s.ready);
  $('btn-start').classList.toggle('hidden', !s.isHost);
  $('btn-start').disabled = !s.canStart;
  $('lobby-msg').textContent = s.msg || '';
}

/* ── Premios ── */
function awardList(el, awards, empty) {
  el.textContent = '';
  if (!awards.length) {
    const d = document.createElement('div');
    d.className = 'noaward';
    d.textContent = empty;
    el.appendChild(d);
    return;
  }
  for (const a of awards) {
    const d = document.createElement('div');
    d.className = 'award';
    d.innerHTML = `<span class="ic"></span><div><div class="t"></div><div class="w"></div><div class="d"></div></div>`;
    d.querySelector('.ic').textContent = a.icon;
    d.querySelector('.t').textContent = a.name;
    d.querySelector('.w').textContent = a.who;
    if (a.title) { const e = document.createElement('span'); e.className = 'ti'; e.textContent = ' · ' + a.title; d.querySelector('.w').appendChild(e); }
    d.querySelector('.w').style.color = colorHex(a.color);
    d.querySelector('.d').textContent = a.text;
    el.appendChild(d);
  }
}
function stats(el, items) {
  el.innerHTML = items.map(([k, v, cls]) => `<div class="${cls || ''}">${k} <b>${v}</b></div>`).join('');
}

export function renderAwards(r, s, cb) {
  // r: { result, awards, n, gems, runGems, dur }; s: { isHost }
  $('aw-title').textContent = r.result !== 'won' ? 'Cayeron todos'
    : r.kind === 'boss' ? '¡El Ojo vencido!' : `Ciclo ${r.c + 1} · Tramo ${r.k + 1} superado`;
  stats($('aw-stats'), [['gemas', r.gems, 'g'], ['run', r.runGems, 'g'], ['tiempo', fmtTime(r.dur)]]);
  awardList($('aw-list'), r.awards, 'Sin trofeos este tramo');
  const stars = $('aw-rate');
  stars.textContent = '';
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.textContent = i;
    b.onclick = () => { cb.rate(i); [...stars.children].forEach((x, k) => x.classList.toggle('sel', k < i)); };
    stars.appendChild(b);
  }
  $('btn-next').textContent = r.result === 'won' ? 'Siguiente tramo' : 'Ver fin de la run';
  $('btn-next').classList.toggle('hidden', !s.isHost);
  $('btn-endrun').classList.toggle('hidden', !s.isHost || r.result !== 'won');
  $('aw-wait').classList.toggle('hidden', s.isHost);
}

export function renderRunEnd(r, s) {
  stats($('re-stats'), [['gemas', r.gems, 'g'], ['ciclo', r.ciclo || 1], ['tramos', r.tramos], ['tiempo', fmtTime(r.dur)]]);
  awardList($('re-list'), r.awards, 'Sin trofeos en esta run');
  $('btn-tolobby').classList.toggle('hidden', !s.isHost);
  $('re-wait').classList.toggle('hidden', s.isHost);
}

/* Lo recién ganado (títulos y cuerdas), arriba de los premios. */
export function renderUnlocks(id, list) {
  const el = $(id);
  el.textContent = '';
  for (const u of list || []) {
    const d = document.createElement('div');
    d.textContent = u.kind === 'cuerda' ? `¡Nueva cuerda: ${u.name}!` : `¡Nuevo título: «${u.name}»!`;
    el.appendChild(d);
  }
  el.classList.toggle('hidden', !el.children.length);
}

/* Muestra de cuerda: 32×4 px (se ve a 64×8). */
function ropeSwatch(id) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 4;
  const g = c.getContext('2d');
  for (let x = 0; x < 32; x++) {
    g.fillStyle = ropeColor(id, x, 0.4, false);
    g.fillRect(x, Math.round(1.5 + Math.sin(x / 5) * 1), 1, 1);
  }
  return c;
}

/* ── Bestiario ── */
function iconCanvas(kind, seen, scale = 2) {
  const im = beastIcon(kind);
  const c = document.createElement('canvas');
  c.width = im?.width || 16; c.height = im?.height || 16;
  const g = c.getContext('2d');
  if (im) g.drawImage(im, 0, 0);
  if (!seen) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); }
  c.style.width = c.width * scale + 'px'; c.style.height = c.height * scale + 'px';
  return c;
}

export function renderBestiary(prof, pick, onPick) {
  const seen = (k) => (prof.beasts[k]?.seen || 0) > 0;
  const nSeen = BEASTS.filter((b) => seen(b.kind)).length;
  $('bst-count').textContent = `${nSeen} de ${BEASTS.length} criaturas vistas`;
  const cell = (b, box, scale) => {
    const btn = document.createElement('button');
    btn.className = b.kind === pick ? 'sel' : '';
    btn.appendChild(iconCanvas(b.kind, seen(b.kind), scale));
    btn.appendChild(document.createTextNode(seen(b.kind) ? b.name : '???'));
    btn.onclick = () => onPick(b.kind);
    box.appendChild(btn);
  };
  const grid = $('bst-grid'), bosses = $('bst-bosses');
  grid.textContent = ''; bosses.textContent = '';
  for (const b of BEASTS) cell(b, grid, 2);
  for (const b of BOSSES) cell(b, bosses, 1);
  // Ficha
  const det = $('bst-detail');
  const b = [...BEASTS, ...BOSSES].find((x) => x.kind === pick);
  const st = prof.beasts[pick] || {};
  if (!b) det.innerHTML = '<div class="lore">Tocá una criatura para ver su ficha.</div>';
  else if (!seen(pick)) det.innerHTML = '<div class="t">???</div><div class="lore">Todavía no la viste. Bajá más hondo.</div>';
  else {
    const boss = BOSSES.includes(b);
    const nums = boss
      ? [['Enfrentado', st.fought || 0], ['Vencido', st.beaten || 0], ['Te mató', st.killedMe || 0]]
      : [['Bajas', st.kills || 0], ['Te mató', `${st.killedMe || 0} ${st.killedMe === 1 ? 'vez' : 'veces'}`], ['Vista en', `${st.seen} tramos`]];
    det.innerHTML = '<div class="t"></div><div class="lore"></div><div class="nums"></div>';
    det.querySelector('.t').textContent = b.name + (boss ? ` · ${b.biome}` : '');
    det.querySelector('.lore').textContent = b.lore;
    det.querySelector('.nums').innerHTML = nums.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
  }
  // Cosméticos: lo ganado y cuánto falta
  const cz = $('bst-cosm');
  cz.textContent = '';
  const row = (name, desc, got, prog) => {
    const d = document.createElement('div');
    d.className = 'it' + (got ? ' got' : '');
    d.innerHTML = '<span></span><span class="bar"><i></i></span>';
    d.firstChild.textContent = (got ? '✓ ' : '') + name + (got ? '' : ` — ${desc}`);
    d.querySelector('i').style.width = Math.round((got ? 1 : prog || 0) * 100) + '%';
    cz.appendChild(d);
  };
  for (const t of TITLES) row(`«${t.name}»`, t.desc, hasTitle(prof, t.id), t.progress(prof));
  for (const r of ROPES) if (!r.free) row(`Cuerda ${r.name.toLowerCase()}`, r.desc, hasRope(prof, r.id), r.progress?.(prof));
}

/* ── Cuenta ── */
export function renderAccount(a) {
  // a: { user, google, msg, busy }
  $('acc-out').classList.toggle('hidden', !!a.user);
  $('acc-in').classList.toggle('hidden', !a.user);
  $('btn-acc-google').classList.toggle('hidden', !a.google);
  $('btn-acc-email').disabled = !!a.busy;
  $('btn-acc-sync').disabled = !!a.busy;
  const mail = a.user ? a.user.email || a.user.user_metadata?.email || 'tu cuenta de Google' : '';
  $('acc-who').textContent = mail;
  $('acc-when').textContent = a.syncedAt ? `Última vez: ${new Date(a.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  // También en el título, para saber con qué cuenta se está jugando sin abrir Ajustes
  $('title-acct').classList.toggle('hidden', !a.user);
  $('title-acct').textContent = a.user ? `☁ ${mail}` : '';
  $('acc-msg').textContent = a.msg || '';
}

export function fmtTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/* ── Ajustes ── */
export function bindSettings(onChange) {
  const seg = (id, key, toVal, fromVal) => {
    const el = $(id);
    const sync = () => [...el.children].forEach((b) => b.classList.toggle('sel', b.dataset.v === fromVal(SETTINGS[key])));
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      SETTINGS[key] = toVal(b.dataset.v);
      sync();
      onChange();
    };
    sync();
  };
  seg('opt-control', 'control', (v) => v, (v) => v);
  for (const k of ['music', 'sfx', 'vibration', 'voice', 'crunch']) seg('opt-' + k, k, (v) => v === '1', (v) => (v ? '1' : '0'));
}
