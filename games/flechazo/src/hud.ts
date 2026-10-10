// HUD en el DOM: nivel, vidas, flechas que quedan, reloj, monedas, la mira y el cartel de LIBERAR, los avisos y el cartel
// de los pasos (tutorial y consejos). Solo toca el DOM cuando algo cambia.
const $ = (id: string) => document.getElementById(id)!;
export const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>',
  coin: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffd36a" stroke="#e39b00"/><path d="M12 7.5v9M9.5 9.5h4a1.6 1.6 0 0 1 0 3.2h-3a1.6 1.6 0 0 0 0 3.2h4" stroke="#b06d00" stroke-width="1.8"/></svg>',
  arrow: '<svg class="i" viewBox="0 0 24 24"><path d="M4 18v-6a3 3 0 0 1 3-3h11M14 5l4 4-4 4"/></svg>',
  bulb: '<svg class="i" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  speed: '<svg class="i" viewBox="0 0 24 24"><path d="M13 3 5 14h6l-1 7 8-11h-6z"/></svg>',
  jump: '<svg class="i" viewBox="0 0 24 24"><path d="M12 20V8M6 13l6-6 6 6M5 4h14"/></svg>',
  eye: '<svg class="i" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  paw: '<svg class="i" viewBox="0 0 24 24"><circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 12c-3 0-5.5 3-5.5 5.2 0 1.6 1.3 2.3 2.7 2.3 1.2 0 1.8-.7 2.8-.7s1.6.7 2.8.7c1.4 0 2.7-.7 2.7-2.3C17.5 15 15 12 12 12z"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>',
  redo: '<svg class="i" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  grid: '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
  gear: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg class="i" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  lock: '<svg class="i" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  map: '<svg class="i" viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/></svg>',
};

const last: Record<string, string | number> = {};
const set = (id: string, v: string | number, html: () => string) => { if (last[id] === v) return; last[id] = v; $(id).innerHTML = html(); };

export function level(text: string) { set('lvl', text, () => text); }
export function hearts(n: number) {
  const prev = last.hearts as number | undefined;
  set('hearts', n, () => [0, 1, 2].map(i => ICON.heart.replace('<svg', `<svg class="${i < n ? 'on' : 'off'}"`)).join(''));
  if (prev !== undefined && n < prev) { const e = $('hearts'); e.classList.remove('hurt'); void e.offsetWidth; e.classList.add('hurt'); }
}
export function left(n: number, total: number) { set('left', `${n}/${total}`, () => `${ICON.arrow}${n}`); }
export function time(s: number) { const t = Math.floor(s), v = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; set('time', v, () => v); }
export function coins(n: number) {
  const prev = last.coins as number | undefined;
  set('coins', n, () => `${ICON.coin}${n}`);
  if (prev !== undefined && n !== prev) { const e = $('coins'); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
}
export function hint(cost: number, show: boolean) {
  $('b-hint').hidden = !show;
  set('b-hint', cost, () => `${ICON.bulb}PISTA <span class="price">${ICON.coin}${cost}</span>`);
}

export function prompt(hex: string | null) {
  const p = $('prompt'), c = $('cross'), a = $('t-act');
  p.classList.toggle('on', !!hex), c.classList.toggle('on', !!hex), a.classList.toggle('on', !!hex);
  if (hex) for (const e of [p, c, a]) e.style.setProperty('--tc', hex);
}

export function toast(msg: string, kind: '' | 'good' | 'bad' | 'gold' = '', ms = 2200) {
  const box = $('toasts'), el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = msg;
  box.append(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

let coachKey = '';
export function coach(v: { tag: string, text: string, tip: string } | null) {
  const el = $('coach'), key = v ? v.tag + v.text + v.tip : '';
  if (key === coachKey) return;
  const first = !coachKey;
  coachKey = key;
  if (!v) { el.hidden = true; return; }
  const fill = () => {
    el.querySelector('.tag')!.textContent = v.tag;
    el.querySelector('.txt')!.textContent = v.text;
    el.querySelector('.tip')!.innerHTML = v.tip;
    el.classList.remove('swap');
  };
  el.hidden = false;
  if (first) { fill(); return; }
  el.classList.add('swap');
  setTimeout(fill, 220);
}

let flashT = 0;
export function flash() {
  const f = $('flash');
  f.classList.add('on');
  clearTimeout(flashT);
  flashT = window.setTimeout(() => f.classList.remove('on'), 60);
}

// Al pasar por un portal: un destello del color del portal desde los bordes
let warpT = 0;
export function warp(css: string) {
  const f = $('warp');
  f.style.setProperty('--wc', css);
  f.classList.add('on');
  clearTimeout(warpT);
  warpT = window.setTimeout(() => f.classList.remove('on'), 90);
}
