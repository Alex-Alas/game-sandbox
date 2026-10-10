// Menús (DOM, en #modal): pausa, MEJORAS (la tienda del nivel), MASCOTAS (con los cofres sin abrir y los ESTILOS de cada
// una), NIVELES (tres dificultades e ISLAS), AJUSTES y los carteles de nivel resuelto y sin vidas. Cada página se arma de
// cero con el estado del momento.
import { ICON } from './hud.ts';
import { DIFFS, DIFF_NAME, levelOf, type Diff } from './sim/levels.ts';
import { UPGRADES, UP_MAX, PETS, UNLOCK, FREE_AT, upCost, unlocked, freeTravel, lookOf, type Save, type UpKind, type PetId } from './sim/meta.ts';
import { STYLES, TIERS, styleKey, type Look, type Slot } from './sim/styles.ts';

export type Page = 'pause' | 'shop' | 'pets' | 'styles' | 'levels' | 'settings' | 'win' | 'lose';
export type WinInfo = { coins: number, perfect: boolean, time: number, errors: number, tutorial: boolean, unlockedNow: Diff | null, chest: boolean };
export type MenuCtx = {
  save: Save, d: Diff, n: number, inLevel: boolean, win: WinInfo | null, touch: boolean,
  resume(): void, restart(): void, next(): void, play(d: Diff): void,
  buyUp(k: UpKind): boolean, buyPet(id: PetId): boolean, equip(id: PetId | null): void,
  settings(): void, thumbs(): Partial<Record<PetId, string>>, sfx(k: 'ui' | 'buy' | 'no'): void,
  thumb(pet: PetId, look: Look, size: number): string, wear(pet: PetId, style: string | null, slot: Slot): void,
  openChest(back: Page): void, lostChest: boolean,
};

const el = () => document.getElementById('modal')!;
let back: Page | null = null, cur: Page | null = null, stylePet: PetId = 'gomita';
export const current = () => cur;
export function hide() { el().hidden = true; el().innerHTML = ''; cur = null; }

const coinTag = (n: number) => `<span class="price">${ICON.coin}${n}</span>`;
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const UP_ICON: Record<UpKind, [string, string]> = { vel: [ICON.speed, '#ff8a1f'], salto: [ICON.jump, '#16c47f'], vis: [ICON.eye, '#4a78ff'] };

export function show(p: Page, c: MenuCtx, from: Page | null = null) {
  cur = p, back = from;
  const m = el();
  m.hidden = false;
  const backBtn = from ? `<button class="x" data-a="back" aria-label="volver">${ICON.back}</button>` : '';
  const S = c.save;
  let h = '';
  if (p === 'pause') {
    h = `<div class="card"><h2>PAUSA</h2><p class="sub">${DIFF_NAME[c.d]} · nivel ${c.n}</p>
      <div class="col">
        <button class="btn" data-a="resume">${ICON.play}SEGUIR</button>
        <div class="row"><button class="btn ghost grow" data-a="shop">${ICON.speed}MEJORAS</button><button class="btn ghost grow" data-a="pets">${ICON.paw}MASCOTAS</button></div>
        <div class="row"><button class="btn ghost grow" data-a="levels">${ICON.grid}NIVELES</button><button class="btn ghost grow" data-a="settings">${ICON.gear}AJUSTES</button></div>
        <button class="btn ghost" data-a="restart">${ICON.redo}REINICIAR NIVEL</button>
      </div><div class="keys">${c.touch
        ? '<b>Pulgar izquierdo</b><span>caminar</span><b>Pulgar derecho</b><span>mirar</span><b>SALTAR · LIBERAR</b><span>los botones</span><b>Minimapa</b><span>tocalo para ver todo</span>'
        : '<b>W A S D</b><span>caminar</span><b>Ratón</b><span>mirar</span><b>Espacio</b><span>saltar</span><b>Clic o E</b><span>liberar la flecha apuntada</span><b>M · T · H</b><span>mapa · mejoras · pista</span>'}</div></div>`;
  } else if (p === 'shop') {
    h = `<div class="card">${backBtn}<h2>MEJORAS</h2><div class="coins-big">${ICON.coin}${S.coins}</div>
      <p class="note">Son para siempre y cada una deja el juego un poco más fácil.</p><div class="ups" style="margin-top:12px">` +
      (Object.keys(UPGRADES) as UpKind[]).map(k => {
        const u = UPGRADES[k], lv = S.up[k], cost = upCost(S, k), [ico, col] = UP_ICON[k];
        return `<div class="up"><div class="ico" style="background:${col}">${ico}</div><div><b>${u.name}</b><p>${lv < UP_MAX ? `Siguiente: ${u.what[lv + 1]}` : u.what[lv]}</p>
          <div class="pips">${Array.from({ length: UP_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          ${cost === null ? '<span class="chip">AL MÁXIMO</span>' : `<button class="btn sm" data-up="${k}" ${S.coins < cost ? 'disabled' : ''}>${coinTag(cost)}</button>`}</div>`;
      }).join('') + `</div><p class="note fly ${freeTravel(S) ? 'on' : ''}">${freeTravel(S) ? '<b>Viajás libre:</b> podés saltar de una isla a otra sin portales.'
        : `Con <b>Salto ${FREE_AT.salto}</b> (doble salto y planeo) y <b>Velocidad ${FREE_AT.vel}</b> vas a poder saltar de una isla a otra sin portales.`}</p>
      ${c.inLevel && !from ? `<div class="col"><button class="btn" data-a="resume">${ICON.play}SEGUIR</button></div>` : ''}</div>`;
  } else if (p === 'pets') {
    const th = c.thumbs(), have = (id: PetId) => S.styles.filter(k => k.startsWith(id + ':')).length;
    const chests = S.chests > 0 ? `<div class="chests"><button class="btn" data-a="chest">${ICON.chest}ABRIR COFRE${S.chests > 1 ? ` (${S.chests})` : ''}</button></div>`
      : `<p class="note">${S.pets.length ? 'Los <b>cofres</b> salen de los eventos de los niveles (una flecha dorada, una chispita para atrapar, un sendero de anillos): pasá el nivel y abrilo para ganar estilos.' : 'Con una mascota, en los niveles aparecen eventos que dan <b>cofres de estilos</b>.'}</p>`;
    h = `<div class="card wide">${backBtn}<h2>MASCOTAS</h2><div class="coins-big">${ICON.coin}${S.coins}</div>
      <p class="note">Te acompañan por el tablero, festejan cada flecha que sale y se dejan acariciar. Elegí una.</p>${chests}<div class="pets" style="margin-top:12px">` +
      PETS.map(pt => {
        const own = S.pets.includes(pt.id), on = S.pet === pt.id;
        const img = th[pt.id] ? `<img src="${th[pt.id]}" alt="">` : '<div class="ph"></div>';
        const btn = on ? `<button class="btn sm ghost" data-unpet="1">GUARDAR</button>` : own ? `<button class="btn sm" data-pet="${pt.id}">LLEVAR</button>`
          : `<button class="btn sm" data-buy="${pt.id}" ${S.coins < pt.cost ? 'disabled' : ''}>${coinTag(pt.cost)}</button>`;
        const sty = own ? `<button class="btn sm ghost sty-b" data-styles="${pt.id}">ESTILOS ${have(pt.id)}/${STYLES.length}</button>` : '';
        return `<div class="pet ${on ? 'on' : ''} ${own ? '' : 'locked'}">${img}<b>${pt.name}</b><p>${pt.desc}</p>${btn}${sty}</div>`;
      }).join('') + `</div>${c.inLevel && !from ? `<div class="col"><button class="btn" data-a="resume">${ICON.play}SEGUIR</button></div>` : ''}</div>`;
  } else if (p === 'styles') {
    const id = stylePet, pt = PETS.find(q => q.id === id)!, look = lookOf(S, id), n = S.styles.filter(k => k.startsWith(id + ':')).length;
    const grid = (slot: Slot) => `<div class="sgrid">` +
      `<button class="sty none ${look[slot] === null ? 'on' : ''}" style="--r:#dedbf3" data-wear="" data-slot="${slot}"><div class="q">—</div><b>${slot === 'skin' ? 'Original' : 'Nada'}</b></button>` +
      STYLES.filter(st => st.slot === slot).map(st => {
        const own = S.styles.includes(styleKey(id, st.id)), r = TIERS[st.tier].hex;
        if (!own) return `<div class="sty locked" style="--r:${r}" title="${TIERS[st.tier].name}"><div class="q">?</div><b>${TIERS[st.tier].name}</b></div>`;
        const img = c.thumb(id, slot === 'skin' ? { skin: st.id, acc: null } : { skin: null, acc: st.id }, 96);
        return `<button class="sty ${look[slot] === st.id ? 'on' : ''}" style="--r:${r}" data-wear="${st.id}" data-slot="${slot}"><img src="${img}" alt=""><b>${st.name}</b></button>`;
      }).join('') + `</div>`;
    h = `<div class="card wide">${backBtn}<h2>ESTILOS · ${pt.name.toUpperCase()}</h2>
      <div class="look"><img src="${c.thumb(id, look, 200)}" alt=""><div><b>${n} de ${STYLES.length} estilos</b><p>Cada cofre trae una piel o un accesorio para una de tus mascotas. Tocá uno para ponérselo.</p>
      ${S.chests > 0 ? `<div class="chests" style="justify-content:flex-start"><button class="btn sm" data-a="chest">${ICON.chest}ABRIR COFRE${S.chests > 1 ? ` (${S.chests})` : ''}</button></div>` : ''}</div></div>
      <h3>PIELES</h3>${grid('skin')}<h3>ACCESORIOS</h3>${grid('acc')}</div>`;
  } else if (p === 'levels') {
    const blurb: Record<Diff, string> = { facil: 'Tableros chicos y algún anillo', dificil: 'Anillos, escaleras, islas y huecos', extremo: 'Anillos dobles, gemelas del mismo color y pocos colores',
      islas: 'Modo: mapas partidos en islas con portales. Las flechas cruzan el vacío' };
    h = `<div class="card wide">${backBtn}<h2>NIVELES</h2><p class="note">Cada dificultad y el modo ISLAS tienen su propia escalera de niveles.</p><div class="diffs" style="margin-top:14px">` +
      DIFFS.map(d => {
        const ok = unlocked(S, d), sp = levelOf(d, S.prog[d]);
        const need = d === 'extremo' ? `Pasá ${UNLOCK} de DIFÍCIL` : `Pasá ${UNLOCK} de FÁCIL`;
        return `<button class="diff ${d}" data-play="${d}" ${ok ? '' : 'disabled'}><b>${DIFF_NAME[d]}</b><span>${blurb[d]}</span>
          <span class="lv">${ok ? `NIVEL ${S.prog[d]} · ${sp.w}×${sp.h}` : `${ICON.lock} ${need}`}</span></button>`;
      }).join('') + `</div></div>`;
  } else if (p === 'settings') {
    const st = S.set, tog = (k: string, on: boolean) => `<button class="tog ${on ? 'on' : ''}" data-tog="${k}" aria-pressed="${on}"></button>`;
    h = `<div class="card">${backBtn}<h2>AJUSTES</h2><div class="set" style="margin-top:18px">
      <span>Sensibilidad</span><input type="range" min="0.2" max="3" step="0.05" value="${st.sens}" data-range="sens">
      <span>Campo de visión</span><input type="range" min="55" max="90" step="1" value="${st.fov}" data-range="fov">
      <span>Invertir mirada vertical</span>${tog('invert', st.invert)}
      <span>Sonidos</span>${tog('sound', st.sound)}
      <span>Música</span>${tog('music', st.music)}
      <span>Gráficos altos (sombras)</span>${tog('quality', st.quality === 'alta')}
    </div><p class="note">Los gráficos se aplican al recargar.</p></div>`;
  } else if (p === 'win') {
    const w = c.win!;
    h = `<div class="card"><h2>${w.tutorial ? '¡TUTORIAL SUPERADO!' : '¡RESUELTO!'}</h2><p class="sub">${DIFF_NAME[c.d]} · nivel ${c.n}</p>
      <div class="stats"><div class="stat"><b>${fmtT(w.time)}</b><span>tiempo</span></div><div class="stat"><b>${w.errors}</b><span>vidas perdidas</span></div>
      <div class="stat"><b style="color:#b06d00">+${w.coins}</b><span>monedas${w.perfect ? ' (×1,5)' : ''}</span></div></div>
      ${w.perfect ? '<p class="note"><b>¡Sin perder una sola vida!</b></p>' : ''}
      ${w.tutorial ? '<p class="note">Con las monedas comprás <b>mejoras</b> (salto, velocidad, visibilidad) y adoptás <b>mascotas</b>.</p>' : ''}
      ${w.unlockedNow ? `<p class="note">Se abrió <b>${DIFF_NAME[w.unlockedNow]}</b>.</p>` : ''}
      ${w.chest ? `<p class="note"><b>¡Ganaste un cofre de estilos!</b></p>` : ''}
      <div class="col">${S.chests > 0 ? `<button class="btn" data-a="chest">${ICON.chest}ABRIR COFRE${S.chests > 1 ? ` (${S.chests})` : ''}</button>` : ''}
        <button class="btn ${S.chests > 0 ? 'ghost' : ''}" data-a="next">${ICON.play}SIGUIENTE NIVEL</button>
        <div class="row"><button class="btn ghost grow" data-a="shop">${ICON.speed}MEJORAS</button><button class="btn ghost grow" data-a="pets">${ICON.paw}MASCOTAS</button></div>
        <button class="btn ghost" data-a="levels">${ICON.grid}NIVELES</button></div></div>`;
  } else if (p === 'lose') {
    h = `<div class="card"><h2>SIN VIDAS</h2><p class="sub">Te quedaste sin vidas. El tablero vuelve a empezar igual que antes.</p>
      ${c.lostChest ? '<p class="note"><b>El cofre del evento se perdió:</b> solo se lo lleva quien pasa el nivel.</p>' : ''}
      <p class="note">Antes de liberar, seguí la recta de la punta hasta el borde: si cruza otra flecha, todavía no.</p>
      <div class="col"><button class="btn" data-a="restart">${ICON.redo}REINTENTAR</button>
        <div class="row"><button class="btn ghost grow" data-a="shop">${ICON.speed}MEJORAS</button><button class="btn ghost grow" data-a="levels">${ICON.grid}NIVELES</button></div></div></div>`;
  }
  m.innerHTML = h;
  m.scrollTop = 0;
  const again = () => show(p, c, from);
  m.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    const a = t.dataset.a;
    if (a === 'back' && back) { c.sfx('ui'); show(back, c); return; }
    if (a === 'resume') { c.sfx('ui'); c.resume(); return; }
    if (a === 'restart') { c.sfx('ui'); c.restart(); return; }
    if (a === 'next') { c.sfx('ui'); c.next(); return; }
    if (a === 'shop' || a === 'pets' || a === 'levels' || a === 'settings') { c.sfx('ui'); show(a, c, p); return; }
    if (a === 'chest') { c.sfx('ui'); c.openChest(p); return; }
    if (t.dataset.styles) { c.sfx('ui'); stylePet = t.dataset.styles as PetId; show('styles', c, p); return; }
    if (t.dataset.wear !== undefined) { c.sfx('ui'); c.wear(stylePet, t.dataset.wear || null, t.dataset.slot as Slot); again(); return; }
    if (t.dataset.up) { c.sfx(c.buyUp(t.dataset.up as UpKind) ? 'buy' : 'no'); again(); return; }
    if (t.dataset.buy) { c.sfx(c.buyPet(t.dataset.buy as PetId) ? 'buy' : 'no'); again(); return; }
    if (t.dataset.pet) { c.sfx('ui'); c.equip(t.dataset.pet as PetId); again(); return; }
    if (t.dataset.unpet) { c.sfx('ui'); c.equip(null); again(); return; }
    if (t.dataset.play) { c.sfx('ui'); c.play(t.dataset.play as Diff); return; }
    if (t.dataset.tog) {
      const k = t.dataset.tog, st = c.save.set;
      if (k === 'invert') st.invert = !st.invert;
      if (k === 'sound') st.sound = !st.sound;
      if (k === 'music') st.music = !st.music;
      if (k === 'quality') st.quality = st.quality === 'alta' ? 'baja' : 'alta';
      c.settings(); c.sfx('ui'); again();
    }
  };
  m.oninput = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.range === 'sens') c.save.set.sens = +t.value;
    if (t.dataset.range === 'fov') c.save.set.fov = +t.value;
    c.settings();
  };
}

// Esc / atrás del navegador dentro de un menú: vuelve a la página anterior o sigue jugando
export function escape(c: MenuCtx) {
  if (!cur) return false;
  if (back) { show(back, c, null); return true; }
  if (cur === 'pause' || cur === 'shop' || cur === 'pets') { c.resume(); return true; }
  return false;
}
