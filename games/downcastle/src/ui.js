/* Pantallas en DOM sobre el canvas: título, sala, premios, fin de run, ajustes y pausa.
   Solo arma y muestra; las decisiones viven en main.js. */
import { renderSVG } from 'uqr';
import { PLAYER_COLORS, HEROES, SETTINGS } from './config.js';
import { heroFrames } from './sprites.js';

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
  $('aw-title').textContent = r.result === 'won' ? `Tramo ${r.n + 1} superado` : 'Cayeron todos';
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
  stats($('re-stats'), [['gemas', r.gems, 'g'], ['tramos', r.tramos], ['tiempo', fmtTime(r.dur)]]);
  awardList($('re-list'), r.awards, 'Sin trofeos en esta run');
  $('btn-tolobby').classList.toggle('hidden', !s.isHost);
  $('re-wait').classList.toggle('hidden', s.isHost);
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
  for (const k of ['music', 'sfx', 'vibration']) seg('opt-' + k, k, (v) => v === '1', (v) => (v ? '1' : '0'));
}
