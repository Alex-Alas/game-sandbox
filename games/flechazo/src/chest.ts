// Apertura de cofres, como las cajas de MEGABONK (y antes las de Counter-Strike): el cofre tiembla cada vez más, revienta
// en luz y una tira de estilos pasa a toda velocidad bajo el marcador, frena de a poco (con un tic por carta) y cae en el
// premio, que ya se sorteó y se pagó (meta.ts → openChest). Al caer: destello del color de la rareza, rayos, papelitos y
// una fanfarria que crece con la rareza. A veces la carta de al lado es legendaria (el «casi» también entusiasma). Tocar
// (o espacio) salta al final. Sin mascotas no hay cofres: los estilos son para las que ya se adoptaron.
import { petThumb } from './pets.ts';
import { openChest, type Save, type PetId } from './sim/meta.ts';
import { TIERS, styleOf, decoy, type Prize, type Slot, type Tier } from './sim/styles.ts';
import { PETS } from './sim/meta.ts';
import { ICON } from './hud.ts';

export type CaseCtx = {
  save: Save, persist(): void, wear(pet: PetId, style: string, slot: Slot): void,
  sfx: { tick(k: number): void, shake(): void, burst(): void, reveal(t: Tier): void, ui(): void }, done(): void,
};

const CARD = 118, GAPX = 8, CARDS = 38, WIN_AT = 31, SPIN_T = 5.4, SHAKE_T = 1.1;
const $ = (id: string) => document.getElementById(id)!;
const petName = (id: PetId) => PETS.find(p => p.id === id)?.name ?? id;
type Item = { pet: PetId, style: string, tier: Tier } | { coins: number, tier: Tier };
const label = (it: Item) => 'coins' in it ? `${it.coins} monedas` : styleOf(it.style)!.name;

let run: { t0: number, x0: number, x1: number, idx: number, phase: 'shake' | 'spin' | 'done', prize: Prize, ctx: CaseCtx, raf: number, ready: boolean } | null = null;

function cardHtml(it: Item, i: number) {
  const tier = TIERS[it.tier];
  const img = 'coins' in it ? `<div class="cimg coin">${ICON.coin}</div>` : `<img class="cimg" data-i="${i}" alt="">`;
  return `<div class="ccard${i === WIN_AT ? ' win' : ''}" style="--r:${tier.hex}">${img}<b>${label(it)}</b><small>${'coins' in it ? '' : petName(it.pet)}</small></div>`;
}

export function caseOpen() { return run !== null; }

// Abre el próximo cofre guardado (si hay)
export function openCase(ctx: CaseCtx) {
  if (run && run.phase !== 'done') return;
  const prize = openChest(ctx.save, Math.random);
  if (!prize) return;
  ctx.persist();
  const pets = ctx.save.pets.length ? ctx.save.pets : (['gomita'] as PetId[]);
  // una docena de estilos que se repiten por la tira (cada uno es una miniatura que hay que sacar)
  const pool = Array.from({ length: 12 }, () => decoy(pets, Math.random));
  const items: Item[] = Array.from({ length: CARDS }, () => pool[Math.floor(Math.random() * pool.length)]);
  items[WIN_AT] = prize;
  // el «casi»: a veces la de al lado es de lo mejor
  if (prize.tier < 2 && Math.random() < 0.45) items[WIN_AT + (Math.random() < 0.5 ? -1 : 1)] = decoy(pets, Math.random, 3);
  const el = $('case');
  el.hidden = false;
  el.className = 'shake';
  el.style.setProperty('--r', TIERS[prize.tier].hex);
  $('case-strip').innerHTML = items.map(cardHtml).join('');
  $('case-prize').innerHTML = '';
  $('case-left').textContent = '';
  // las miniaturas se sacan de a poco mientras el cofre tiembla (con WebGL por software tardan)
  const imgs = [...el.querySelectorAll<HTMLImageElement>('img.cimg')];
  let k = 0;
  const fill = () => {
    const t = performance.now();
    while (k < imgs.length && performance.now() - t < 12) {
      const it = items[+imgs[k].dataset.i!];
      if (!('coins' in it)) imgs[k].src = petThumb(it.pet, styleOf(it.style)!.slot === 'skin' ? { skin: it.style, acc: null } : { skin: null, acc: it.style }, 112);
      k++;
    }
    if (run) run.ready = k >= imgs.length;
    if (k < imgs.length) requestAnimationFrame(fill);
  };
  run = { t0: performance.now(), x0: 0, x1: 0, idx: -1, phase: 'shake', prize, ctx, raf: 0, ready: false };
  requestAnimationFrame(fill);
  ctx.sfx.shake();
  run.raf = requestAnimationFrame(frame);
}

function startSpin() {
  $('case').className = 'spin'; // antes de medir: temblando, la tira está oculta
  const r = run!, reel = $('case-reel'), mid = reel.clientWidth / 2, step = CARD + GAPX;
  const off = (Math.random() - 0.5) * (CARD - 14) * 0.85; // el marcador cae en cualquier punto de la carta (sin tocar los bordes)
  r.x0 = mid - step * (2 + Math.random());
  r.x1 = mid - (WIN_AT * step + CARD / 2 + off);
  r.phase = 'spin', r.t0 = performance.now();
  $('case-strip').style.transform = `translateX(${r.x0}px)`;
  r.ctx.sfx.burst();
}

function frame() {
  const r = run;
  if (!r || r.phase === 'done') return;
  const t = (performance.now() - r.t0) / 1000;
  if (r.phase === 'shake') {
    if (t >= SHAKE_T && r.ready) startSpin();
  } else {
    const k = Math.min(1, t / SPIN_T), x = r.x0 + (r.x1 - r.x0) * (1 - Math.pow(1 - k, 4));
    $('case-strip').style.transform = `translateX(${x}px)`;
    const idx = Math.floor(($('case-reel').clientWidth / 2 - x) / (CARD + GAPX));
    if (idx !== r.idx) {
      r.idx = idx;
      r.ctx.sfx.tick(k);
      const m = $('case-marker'); m.classList.remove('tk'); void m.offsetWidth; m.classList.add('tk');
    }
    if (k >= 1) { reveal(); return; }
  }
  r.raf = requestAnimationFrame(frame);
}

function skip() {
  const r = run;
  if (!r || r.phase === 'done') return;
  if (r.phase === 'shake') { if (r.ready) startSpin(); else return; }
  r.t0 = performance.now() - SPIN_T * 1000;
}

function reveal() {
  const r = run!, p = r.prize, tier = TIERS[p.tier], s = r.ctx.save;
  r.phase = 'done';
  cancelAnimationFrame(r.raf);
  $('case-strip').style.transform = `translateX(${r.x1}px)`;
  const el = $('case');
  el.className = `won t${p.tier}`;
  const isStyle = !('coins' in p), st = isStyle ? styleOf(p.style)! : null;
  const img = isStyle ? petThumb(p.pet, st!.slot === 'skin' ? { skin: p.style, acc: null } : { skin: null, acc: p.style }, 220) : '';
  $('case-prize').innerHTML = isStyle
    ? `<img src="${img}" alt=""><div><span class="ptier">${tier.name}</span><b>${st!.name}</b><small>${st!.slot === 'skin' ? 'Piel' : 'Accesorio'} para ${petName(p.pet)}</small><em>¡NUEVO!</em></div>`
    : `<div class="cimg coin">${ICON.coin}</div><div><span class="ptier">${tier.name}</span><b>+${p.coins} monedas</b><small>Ya tenés todos los estilos de tus mascotas</small></div>`;
  $('case-wear').hidden = !isStyle;
  $('case-again').hidden = s.chests <= 0;
  $('case-again').innerHTML = `${ICON.chest}ABRIR OTRO${s.chests > 1 ? ` (${s.chests})` : ''}`;
  confetti(tier.hex, 20 + p.tier * 22);
  r.ctx.sfx.reveal(p.tier);
  try { navigator.vibrate?.(p.tier >= 3 ? [30, 40, 30, 40, 90] : p.tier ? [20, 30, 40] : 25); } catch { /* */ }
}

function confetti(hex: string, n: number) {
  const box = $('case-fx');
  const cols = [hex, '#ffffff', '#ffd23f', '#ff5fb4', '#4f8cff'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 260;
    c.style.setProperty('--x', `${Math.cos(a) * d}px`), c.style.setProperty('--y', `${Math.sin(a) * d * 0.7 - 80}px`);
    c.style.setProperty('--rot', `${(Math.random() - 0.5) * 900}deg`);
    c.style.background = cols[i % cols.length];
    c.style.animationDelay = `${Math.random() * 0.12}s`;
    box.append(c);
    setTimeout(() => c.remove(), 1600);
  }
}

function close() {
  const r = run;
  if (!r) return;
  if (r.phase !== 'done') { skip(); return; }
  $('case').hidden = true;
  run = null;
  r.ctx.sfx.ui();
  r.ctx.done();
}

export function initCase() {
  const el = $('case');
  el.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('button')) skip(); });
  $('case-ok').onclick = () => close();
  $('case-wear').onclick = () => {
    const r = run;
    if (!r || !('style' in r.prize)) return;
    r.ctx.wear(r.prize.pet, r.prize.style, styleOf(r.prize.style)!.slot);
    close();
  };
  $('case-again').onclick = () => { const r = run; if (!r) return; r.ctx.sfx.ui(); run = null; openCase(r.ctx); };
  addEventListener('keydown', (e) => {
    if (!run) return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); if (run.phase !== 'done') skip(); else close(); }
    if (e.code === 'Escape') { e.stopPropagation(); close(); }
  }, true);
}
