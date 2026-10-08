// Efectos visuales (solo dibujo): partículas, textos que saltan, sacudones y destellos. Se alimentan de los eventos
// de la simulación (fromEvents) y del terreno que se cae (los pedazos sueltos).
import { CELL } from './sim/terrain.ts';
import { CARD } from './sim/cards.ts';
import type { Ev, State } from './sim/state.ts';
import { charOf, PCOLORS } from './sim/chars.ts';

export type Part = { x: number, y: number, vx: number, vy: number, life: number, max: number, r: number, c: string, k: number, g: number, rot: number };
export type Pop = { x: number, y: number, txt: string, c: string, life: number, max: number, size: number, vy: number };
export type Ray = { x0: number, y0: number, x1: number, y1: number, r: number, c: string, life: number, max: number };
export const FX = {
  parts: [] as Part[], pops: [] as Pop[], rays: [] as Ray[], shake: 0, flash: 0, flashC: '#fff', slow: 0,
  feed: [] as { txt: string, c: string, t: number }[], banner: null as null | { txt: string, sub: string, t: number, c: string },
  quality: 1, shakeOn: 1,
};
export const P_KIND = { puff: 0, spark: 1, chunk: 2, drop: 3, smoke: 4, fire: 5, star: 6, ring: 7 };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
export function part(x: number, y: number, vx: number, vy: number, life: number, r: number, c: string, k = 0, g = 0) {
  if (FX.parts.length > 900 * FX.quality) return;
  FX.parts.push({ x, y, vx, vy, life, max: life, r, c, k, g, rot: rand(0, 6.28) });
}
export function pop(x: number, y: number, txt: string, c = '#fff', size = 1, life = 0.9) {
  FX.pops.push({ x, y, txt, c, life, max: life, size, vy: 2.2 });
}
export function shake(a: number) { FX.shake = Math.min(1.4, Math.max(FX.shake, a * FX.shakeOn)); }

export function burst(x: number, y: number, r: number, kind: string) {
  const n = Math.round((10 + r * 10) * FX.quality);
  const fire = kind === 'fuego' || kind === 'meteoro' || kind === 'grande' || kind === 'granbum';
  part(x, y, 0, 0, 0.35, r * 1.15, '#fff6c8', P_KIND.ring);
  for (let k = 0; k < n; k++) {
    const a = rand(0, 6.28), v = rand(2, 9) * (0.6 + r * 0.3);
    part(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.3, 0.7), rand(0.15, 0.35) * (0.7 + r * 0.25), fire || k % 2 ? '#ffb43a' : '#ffe27a', P_KIND.fire);
  }
  for (let k = 0; k < n * 0.7; k++) {
    const a = rand(0, 6.28), v = rand(0.5, 3) * (0.5 + r * 0.25);
    part(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, Math.cos(a) * v, Math.sin(a) * v + 1, rand(0.7, 1.4), rand(0.3, 0.6) * (0.6 + r * 0.2), kind === 'nube' || kind === 'melocoton' ? '#a35bd6' : '#8a8a8a', P_KIND.smoke, -1.5);
  }
  shake(Math.min(1, r * 0.22));
}

// Pedazos de terreno que se caen (celdas [i, j, material] de terrain.applyOp)
export function debris(cells: number[], color: (m: number) => string) {
  const step = Math.max(3, Math.round(3 / FX.quality));
  for (let k = 0; k < cells.length; k += step) {
    const x = (cells[k] + 0.5) * CELL, y = (cells[k + 1] + 0.5) * CELL;
    part(x, y, rand(-1, 1), rand(0, 2), rand(1.2, 2), CELL * 0.7, color(cells[k + 2]), P_KIND.chunk, -20);
  }
}

// Lo que cada evento muestra (el audio va aparte, en audio.ts)
export function fromEvents(evs: Ev[], s: State, me: number, water: number) {
  for (const e of evs) {
    const p = typeof e.p === 'number' ? s.pl[e.p] : undefined;
    switch (e.k) {
      case 'boom': burst(e.x as number, e.y as number, e.r as number, String(e.kind ?? '')); if ((e.r as number) > 3) FX.flash = 0.25, FX.flashC = '#fff3c0'; break;
      case 'hit': {
        const v = e.v as number, d = e.d as number;
        if (d > 0) pop(e.x as number, (e.y as number) + 0.6, `${Math.round(d)}%`, v > 25 ? '#ff5a3c' : v > 15 ? '#ffb43a' : '#fff', 0.8 + Math.min(1, v / 30) * 0.6);
        for (let k = 0; k < 6; k++) part(e.x as number, e.y as number, rand(-6, 6), rand(-6, 6), 0.25, 0.18, '#fff', P_KIND.star);
        if (v > 18) shake(Math.min(1, v / 40)), FX.slow = Math.max(FX.slow, v > 30 ? 0.12 : 0);
        break;
      }
      case 'ko': {
        const how = e.how as string, x = e.x as number, y = e.y as number, by = e.by as number;
        const c = how === 'lava' ? '#ff7a1a' : how === 'agua' ? '#7fd3ff' : '#ffe27a';
        for (let k = 0; k < 40 * FX.quality; k++) {
          const a = how === 'agua' || how === 'lava' ? rand(1.2, 1.95) : rand(0, 6.28), v = rand(6, 18);
          part(x, how === 'agua' || how === 'lava' ? water : y, Math.cos(a) * v, Math.sin(a) * v, rand(0.6, 1.2), rand(0.15, 0.35), c, how === 'agua' ? P_KIND.drop : P_KIND.spark, how === 'agua' ? 30 : 0);
        }
        shake(0.9), FX.flash = 0.35, FX.flashC = c;
        const name = p ? p.name : '?', who = by >= 0 ? s.pl[by]?.name : '';
        const label = how === 'agua' ? '¡AL AGUA!' : how === 'lava' ? '¡A LA LAVA!' : how === 'arriba' ? '¡A LA LUNA!' : '¡FUERA!';
        pop(x, how === 'agua' || how === 'lava' ? water + 2 : y, label, '#fff', 1.6, 1.4);
        FX.feed.unshift({ txt: by >= 0 ? `${who} ➜ ${name} · ${label}` : `${name} se cayó solo · −1`, c: PCOLORS[(by >= 0 ? s.pl[by]?.color : p?.color) ?? 0], t: 4 });
        if (FX.feed.length > 5) FX.feed.length = 5;
        if (by === me && me >= 0) FX.banner = { txt: '+1', sub: `${label} ${name}`, t: 1.2, c: '#ffd23f' };
        break;
      }
      case 'trick': if (p) pop(p.x, p.y + 1.9, `${e.n}!`, '#8ef2ff', 0.7, 0.8); break;
      case 'jump': if (p) for (let k = 0; k < 5; k++) part(p.x + rand(-0.3, 0.3), p.y, rand(-2, 2), rand(0, 1), 0.4, 0.18, e.j === 1 ? '#ffffff' : '#d8c8a8', P_KIND.puff); break;
      case 'dash': if (p) for (let k = 0; k < 8; k++) part(p.x, p.y + 0.5, -(e.dx as number) * rand(2, 6), -(e.dy as number) * rand(2, 6), 0.35, 0.25, PCOLORS[p.color], P_KIND.puff); break;
      case 'land': if (p) for (let k = 0; k < 8; k++) part(p.x + rand(-0.4, 0.4), p.y, rand(-4, 4), rand(0.5, 2), 0.4, 0.2, '#d8c8a8', P_KIND.puff); break;
      case 'splash': for (let k = 0; k < 10; k++) part(e.x as number, water, rand(-3, 3), rand(3, 8), 0.7, 0.14, '#9fe0ff', P_KIND.drop, 30); break;
      case 'ray': FX.rays.push({ x0: e.x0 as number, y0: e.y0 as number, x1: e.x1 as number, y1: e.y1 as number, r: (e.r as number) || 0.2,
        c: rayColor(String(e.kind)), life: e.kind === 'mega' ? 0.12 : 0.25, max: 0.25 }); break;
      case 'slash': FX.rays.push({ x0: e.x0 as number, y0: e.y0 as number, x1: e.x1 as number, y1: e.y1 as number, r: 0.25, c: '#e8dcff', life: 0.3, max: 0.3 }); shake(0.3); break;
      case 'tele': for (const [x, y] of [[e.x0, e.y0], [e.x1, e.y1]] as [number, number][]) for (let k = 0; k < 12; k++) part(x, y + 0.5, rand(-3, 3), rand(-3, 3), 0.5, 0.2, '#6ff', P_KIND.spark); break;
      case 'swap': FX.rays.push({ x0: e.x0 as number, y0: (e.y0 as number) + 0.5, x1: e.x1 as number, y1: (e.y1 as number) + 0.5, r: 0.1, c: '#ff6ad5', life: 0.4, max: 0.4 }); break;
      case 'block': if (p) pop(p.x, p.y + 1.6, '¡BLOQUEO!', '#9fe0ff', 0.7); break;
      case 'heal': if (p) { pop(p.x, p.y + 1.6, '−35%', '#6f6', 0.9); for (let k = 0; k < 10; k++) part(p.x + rand(-0.5, 0.5), p.y + rand(0, 1), 0, 2, 0.8, 0.15, '#7f7', P_KIND.spark); } break;
      case 'pick': if (p) {
        const c = e.c as string;
        pop(p.x, p.y + 1.7, c === '+ulti' ? '+50 ULTI' : c === '+mana' ? '¡MANÁ LLENO!' : CARD[c]?.name ?? c, '#ffd23f', 0.8, 1.2);
        for (let k = 0; k < 14; k++) part(p.x, p.y + 0.6, rand(-4, 4), rand(1, 6), 0.6, 0.15, '#ffd23f', P_KIND.star);
      } break;
      case 'spawn': if (p) for (let k = 0; k < 14; k++) part(p.x + rand(-0.8, 0.8), p.y - 0.1, rand(-1, 1), rand(-0.5, 0.5), 0.8, 0.4, '#ffffff', P_KIND.puff); break;
      case 'deflect': for (let k = 0; k < 8; k++) part(e.x as number, e.y as number, rand(-6, 6), rand(-6, 6), 0.3, 0.12, '#fff', P_KIND.star); pop(e.x as number, e.y as number, '¡TOMÁ!', '#fff', 0.7); break;
      case 'ulti': if (p) {
        const ch = charOf(p.ch);
        FX.banner = { txt: ch.ultiName, sub: p.name, t: 1.3, c: ch.color };
        shake(0.5);
      } break;
      case 'bounce': if (p) for (let k = 0; k < 6; k++) part(p.x, p.y, rand(-3, 3), rand(0, 3), 0.4, 0.2, '#ccc', P_KIND.puff); break;
      case 'go': FX.banner = { txt: '¡CATAPUM!', sub: '', t: 1.1, c: '#ffd23f' }; shake(0.6); break;
      case 'sudden': FX.banner = { txt: '¡MUERTE SÚBITA!', sub: 'todos al 300 %', t: 2, c: '#ff5a3c' }; break;
      case 'wind': FX.banner = { txt: e.d as number > 0 ? 'VIENTO ➜' : '⬅ VIENTO', sub: '', t: 1.2, c: '#cfe6ff' }; break;
      case 'whistle': FX.banner = { txt: '¡TREN!', sub: e.d as number > 0 ? 'viene por la izquierda' : 'viene por la derecha', t: 1.6, c: '#ff5a3c' }; break;
      case 'rumble': shake(0.35); break;
      case 'pad': if (p) for (let k = 0; k < 8; k++) part(e.x as number, e.y as number, rand(-3, 3), rand(1, 4), 0.4, 0.2, '#ff8ad8', P_KIND.spark); break;
      case 'fizzle': if (p) pop(p.x, p.y + 1.7, 'nadie cerca', '#ccc', 0.7); break;
      case 'cone': {
        const x = e.x as number, y = e.y as number, dx = e.dx as number, dy = e.dy as number;
        for (let k = 0; k < 24; k++) { const a = rand(-0.5, 0.5), v = rand(10, 22), ca = Math.cos(a), sa = Math.sin(a); part(x, y, (dx * ca - dy * sa) * v, (dx * sa + dy * ca) * v, 0.35, 0.25, '#ffe9a0', P_KIND.ring); }
        shake(0.4); break;
      }
      case 'swing': for (let k = 0; k < 10; k++) part(e.x as number, e.y as number, (e.dx as number) * rand(4, 10) + rand(-2, 2), (e.dy as number) * rand(4, 10) + rand(-2, 2), 0.25, 0.15, '#fff', P_KIND.star); break;
      case 'slip': if (p) pop(p.x, p.y + 1.6, '¡RESBALÓN!', '#ffe14a', 0.8); break;
      case 'crate': break;
    }
  }
}
const rayColor = (k: string) => k === 'iman' ? '#ff4d6d' : k === 'vaca' ? '#9dff8a' : k === 'mega' ? '#7ff8ff' : '#ff6af0';

export function stepFx(dt: number) {
  for (const p of FX.parts) {
    p.life -= dt;
    p.vy -= p.g * dt;
    if (p.k === P_KIND.smoke || p.k === P_KIND.puff) p.vx *= 1 - 2 * dt, p.vy *= 1 - 2 * dt;
    p.x += p.vx * dt, p.y += p.vy * dt, p.rot += dt * 6;
  }
  FX.parts = FX.parts.filter(p => p.life > 0);
  for (const p of FX.pops) p.life -= dt, p.y += p.vy * dt, p.vy *= 1 - 2.5 * dt;
  FX.pops = FX.pops.filter(p => p.life > 0);
  for (const r of FX.rays) r.life -= dt;
  FX.rays = FX.rays.filter(r => r.life > 0);
  for (const f of FX.feed) f.t -= dt;
  FX.feed = FX.feed.filter(f => f.t > 0);
  if (FX.banner && (FX.banner.t -= dt) <= 0) FX.banner = null;
  FX.shake = Math.max(0, FX.shake - dt * 2.2);
  FX.flash = Math.max(0, FX.flash - dt * 2);
  FX.slow = Math.max(0, FX.slow - dt);
}

export function clearFx() {
  FX.parts = [], FX.pops = [], FX.rays = [], FX.feed = [], FX.banner = null, FX.shake = 0, FX.flash = 0, FX.slow = 0;
}
