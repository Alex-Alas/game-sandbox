// HUD en el DOM: nivel, vidas, flechas que quedan, reloj, monedas, la mira y su cartel (LIBERAR, las caricias, LANZAR con la
// carga), el marcador del pleito, los avisos y el cartel de los pasos (tutorial y consejos). Solo toca el DOM cuando algo
// cambia.
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
  chest: '<svg class="i chest" viewBox="0 0 24 24"><path d="M3 10a6 6 0 0 1 6-5h6a6 6 0 0 1 6 5z" fill="#9b6bff" stroke="#5b3bc4" stroke-width="1.4"/><rect x="3" y="10" width="18" height="10" rx="2" fill="#7b5cff" stroke="#4b2fa8" stroke-width="1.4"/><path d="M3 13h18" stroke="#ffcf3a" stroke-width="2"/><rect x="10" y="11" width="4" height="5" rx="1" fill="#ffcf3a" stroke="#b07a00" stroke-width="1"/></svg>',
  star: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor"/></svg>',
  brush: '<svg class="i" viewBox="0 0 24 24"><path d="M14 4l6 6-8 8H6v-6zM4 20h4"/></svg>',
  anger: '<svg viewBox="0 0 24 24"><path d="M4 9.5C7.5 9.5 9.5 7.5 9.5 4M14.5 4c0 3.5 2 5.5 5.5 5.5M20 14.5c-3.5 0-5.5 2-5.5 5.5M9.5 20c0-3.5-2-5.5-5.5-5.5"/></svg>',
  hand: '<svg class="i" viewBox="0 0 24 24"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7-2.6 0-4.3-1.3-5.7-3.6L3.6 14.6a1.5 1.5 0 0 1 2.4-1.7L8 15"/></svg>',
};

const last: Record<string, string | number> = {};
const set = (id: string, v: string | number, html: () => string) => { if (last[id] === v) return; last[id] = v; $(id).innerHTML = html(); };

export function level(text: string) { set('lvl', text, () => text); }
export function hearts(n: number) {
  const prev = last.hearts as number | undefined;
  set('hearts', n, () => [0, 1, 2].map(i => ICON.heart.replace('<svg', `<svg class="${i < n ? 'on' : 'off'}"`)).join(''));
  if (prev !== undefined && n < prev) { const e = $('hearts'); e.classList.remove('hurt'); void e.offsetWidth; e.classList.add('hurt'); }
}
// En qué isla estás (oculto si el mapa es de una sola)
export function isle(n: number, total: number) {
  set('isle', `${n}/${total}`, () => { $('isle').hidden = total < 2; return `${ICON.map}ISLA ${n}<small>/${total}</small>`; });
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

// El cartel de la mira: LIBERAR (con el color de la flecha apuntada), la caricia que toca según dónde le apuntes a la
// mascota (y que mantener la agarra), LANZAR con ella en brazos, y en el pleito ATAJAR, CALMAR o ¡ENOJADA!
export type Prompt = { hex: string, kind: 'arrow' | 'pet' | 'held' | 'fight' | 'mad', label: string, short?: string, key?: string, sub?: string } | null;
let promptKey = '';
export function prompt(v: Prompt) {
  const key = v ? `${v.hex}|${v.kind}|${v.label}|${v.sub}|${v.key}` : '';
  if (key === promptKey) return;
  promptKey = key;
  const p = $('prompt'), c = $('cross'), a = $('t-act'), sub = $('psub');
  for (const e of [p, c, a]) {
    e.classList.toggle('on', !!v);
    for (const k of ['petting', 'held', 'fight', 'mad']) e.classList.toggle(k, !!v && (k === 'petting' ? v.kind === 'pet' : v.kind === k));
  }
  const label = v?.label ?? 'LIBERAR', short = v?.short ?? label;
  if (p.querySelector('.pl')!.textContent !== label) p.querySelector('.pl')!.textContent = label;
  p.querySelector('.k')!.textContent = v?.key ?? 'clic · E';
  const sp = a.querySelector('span')!;
  if (sp.textContent !== short) sp.textContent = short;
  sub.textContent = v?.sub ?? '';
  sub.classList.toggle('on', !!v?.sub);
  if (v) for (const e of [p, c, a]) e.style.setProperty('--tc', v.hex);
}
// El anillo de la mira mientras se carga el lanzamiento (0 a 1; null lo saca)
let chargeV = -1;
export function charge(p: number | null) {
  const v = p === null ? -1 : Math.round(p * 40) / 40;
  if (v === chargeV) return;
  chargeV = v;
  const el = $('charge');
  el.classList.toggle('on', v >= 0);
  el.classList.toggle('full', v >= 1);
  if (v >= 0) (el.querySelector('circle') as SVGCircleElement).style.strokeDashoffset = `${(1 - v) * 100}`;
}
// El pleito: con quién, cuánto enojo le queda (caricias para calmarla) y cuántos golpes más aguantás
export function brawl(v: { name: string, anger: number, maxAnger: number, hp: number, maxHp: number } | null) {
  const el = $('brawl'), key = v ? `${v.name}|${v.anger}|${v.hp}` : '';
  if (last.brawl === key) return;
  const prev = last.brawl as string | undefined;
  last.brawl = key;
  document.body.classList.toggle('brawling', !!v);
  el.hidden = !v;
  if (!v) return;
  const pips = (n: number, max: number, cls: string, icon: string) => Array.from({ length: max }, (_, i) => `<i class="${cls} ${i < n ? 'on' : 'off'}">${icon}</i>`).join('');
  el.innerHTML = `<b>PLEITO</b><span class="who">con ${v.name}</span><span class="grp"><small>ENOJO</small>${pips(v.anger, v.maxAnger, 'ang', ICON.anger)}</span><span class="grp"><small>AGUANTE</small>${pips(v.hp, v.maxHp, 'hp', ICON.heart)}</span>`;
  if (prev && prev !== key) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
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

// El evento del nivel: qué hay que hacer (y cuánto tiempo queda) o el cofre ya ganado
export function event(v: { text: string, time?: number, won?: boolean } | null) {
  const el = $('event');
  const sec = v?.time === undefined ? -1 : Math.ceil(v.time), t = sec < 0 ? '' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const key = v ? `${v.text}|${t}|${v.won}` : '';
  if (last.event === key) return;
  last.event = key;
  el.hidden = !v;
  if (!v) return;
  el.classList.toggle('won', !!v.won);
  el.classList.toggle('warn', v.time !== undefined && v.time < 6);
  el.innerHTML = `${v.won ? ICON.chest : ICON.star}${v.text}${t ? ` <span class="tm">${t}</span>` : ''}`;
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
