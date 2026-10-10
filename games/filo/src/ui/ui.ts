// Interfaz del escaparate (DOM): pestañas, paneles de cada modo, rótulos, etiquetas de capas,
// pantalla completa y sonido. La escena vive en el lienzo de atrás; esto solo la maneja.
import type { App, Mode } from '../app.ts';
import { MOVE_NAMES, FX_LIST } from '../app.ts';
import { hero } from '../chars/hero.ts';
import { brute } from '../chars/brute.ts';
import { drawLogo } from './logo.ts';
import { UIKit } from './uikit.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = (d: string, fill = false) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  fsIn: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  fsOut: svg('<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>'),
  snd: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>', true),
  pause: svg('<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>', true),
  prev: svg('<path d="M6 5v14M18 6l-9 6 9 6z"/>'),
  next: svg('<path d="M18 5v14M6 6l9 6-9 6z"/>'),
  slow: svg('<circle cx="12" cy="13" r="7"/><path d="M12 13V9M10 3h4"/>'),
  redo: svg('<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/>'),
  dl: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
};

type Fs = Document & { webkitFullscreenElement?: Element, webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export class UI {
  app: App;
  panel: HTMLElement | null = null;
  capTimer = 0;
  tags = new Map<string, HTMLElement>();
  toastTimer = 0;
  onSound?: (on: boolean) => void;
  sound = true;
  syncSnd = () => {};
  constructor(app: App) {
    this.app = app;
    drawLogo($('logo') as HTMLCanvasElement, 1);
    // pestañas
    const tabs = $('tabs');
    const list: [Mode, string][] = [['scene', 'Escena'], ['anim', 'Animaciones'], ['fx', 'Efectos'], ['world', 'Escenario'], ['ui', 'Interfaz']];
    for (const [m, label] of list) {
      const b = document.createElement('button');
      b.textContent = label; b.setAttribute('role', 'tab'); b.dataset.m = m;
      b.onclick = () => this.go(m);
      tabs.appendChild(b);
    }
    // cabecera
    const fs = $('btn-fs') as HTMLButtonElement;
    const doc = document as Fs, root = document.documentElement as FsEl;
    const isFs = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
    const syncFs = () => { fs.innerHTML = isFs() ? I.fsOut : I.fsIn; fs.title = isFs() ? 'salir de pantalla completa' : 'pantalla completa'; };
    fs.onclick = async () => {
      if (!(root.requestFullscreen || root.webkitRequestFullscreen)) { this.toast('Este navegador no deja: con «Compartir → Agregar a inicio» la página abre sin barras.'); return; }
      try {
        if (isFs()) { if (doc.exitFullscreen) await doc.exitFullscreen(); else await doc.webkitExitFullscreen?.(); }
        else {
          if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' }); else await root.webkitRequestFullscreen!();
          const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
          if (matchMedia('(pointer: coarse)').matches) await o.lock?.('landscape').catch(() => {});
        }
      } catch { /* sin gesto o en un iframe */ }
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    syncFs();
    const snd = $('btn-snd') as HTMLButtonElement;
    const syncSnd = () => { snd.innerHTML = this.sound ? I.snd : I.mute; snd.setAttribute('aria-pressed', String(this.sound)); };
    snd.onclick = () => { this.sound = !this.sound; syncSnd(); this.onSound?.(this.sound); };
    this.syncSnd = syncSnd;
    queueMicrotask(syncSnd);
    app.onCaption = (t, s) => this.caption(t, s);
    this.input();
    window.addEventListener('resize', () => this.layout());
  }

  go(m: Mode) {
    const app = this.app;
    for (const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.m === m));
    if (m === 'ui' && !app.ui) app.ui = new UIKit($('uikit'));
    $('uikit').hidden = m !== 'ui';
    app.setMode(m);
    $('caption').classList.add('off');
    this.buildPanel(m);
    this.clearTags();
    this.layout();
    try { localStorage.setItem('filo.mode', m); } catch { /* */ }
  }

  layout() {
    const p = this.panel, app = this.app;
    app.panelInset = { right: 0, bottom: 0 };
    document.body.classList.toggle('sheet', false);
    if (!p || p.hidden) return;
    const r = p.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    if (r.width < W * 0.7) app.panelInset.right = (W - r.left) / W;
    else { app.panelInset.bottom = (H - r.top) / H; document.body.classList.toggle('sheet', true); }
  }

  caption(title: string, sub: string) {
    const c = $('caption');
    c.innerHTML = `<small>${sub}</small>${title}`;
    c.classList.remove('off');
    clearTimeout(this.capTimer);
    this.capTimer = window.setTimeout(() => c.classList.add('off'), 1500);
  }

  toast(msg: string) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('off');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.add('off'), 3800);
  }

  // ---------- paneles ----------
  private el(html: string) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; }
  private tog(label: string, sub: string, on: boolean, f: (v: boolean) => void) {
    const t = this.el(`<div class="tog" role="switch" aria-checked="${on}" tabindex="0"><div>${label}${sub ? `<small>${sub}</small>` : ''}</div><div class="sw"></div></div>`);
    const set = (v: boolean) => { t.setAttribute('aria-checked', String(v)); f(v); };
    t.onclick = () => set(t.getAttribute('aria-checked') !== 'true');
    t.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); t.click(); } };
    return t;
  }
  private chips(items: [string, string][], sel: string, f: (k: string) => void) {
    const box = this.el('<div class="chips"></div>');
    for (const [k, label] of items) {
      const c = this.el(`<button class="chip" aria-pressed="${k === sel}">${label}</button>`);
      c.onclick = () => { for (const x of box.children) x.setAttribute('aria-pressed', 'false'); c.setAttribute('aria-pressed', 'true'); f(k); };
      box.appendChild(c);
    }
    return box;
  }

  buildPanel(m: Mode) {
    const host = $('panels');
    host.innerHTML = '';
    this.panel = null;
    const app = this.app;
    const p = this.el('<div class="panel side"></div>');
    const add = (x: HTMLElement | string) => { p.appendChild(typeof x === 'string' ? this.el(x) : x); };
    if (m === 'scene') {
      add('<h2>La pelea</h2>');
      add('<p class="lead">Todo el kit en una escena: La Errante contra El Verdugo de Ceniza. Animación cuadro a cuadro con temblor de línea, rastros del filo, impactos con pausa de golpe, luz volumétrica y un escenario por capas con parallax real.</p>');
      const row = this.el('<div class="row"></div>');
      const pause = this.el(`<button class="btn">${I.pause}<span>Pausa</span></button>`);
      pause.onclick = () => { app.paused = !app.paused; pause.innerHTML = app.paused ? `${I.play}<span>Seguir</span>` : `${I.pause}<span>Pausa</span>`; };
      const slow = this.el(`<button class="btn">${I.slow}<span>Cámara lenta</span></button>`);
      slow.onclick = () => { app.slow = app.slow < 1 ? 1 : 0.25; slow.classList.toggle('prim', app.slow < 1); };
      const redo = this.el(`<button class="btn">${I.redo}<span>Desde el principio</span></button>`);
      redo.onclick = () => { app.duel.t = 0; app.duel.i = 0; };
      row.append(pause, slow, redo);
      add(row);
      add('<h3>Técnicas</h3>');
      add(`<p class="lead" style="margin:0">${Object.values(MOVE_NAMES).join(' · ')}</p>`);
      this.atmos(p);
    } else if (m === 'anim') {
      add('<h2>Animaciones</h2>');
      add('<p class="lead">Cada clip se escribe pose a pose y se muestrea en cuadros enteros (animación «en dos»). Cada dibujo tiene su propio temblor de línea; la tela y la cinta son física.</p>');
      add(this.chips([['hero', 'La Errante'], ['brute', 'El Verdugo']], app.anim.who, (k) => { app.selectAnim(k as 'hero' | 'brute', app.anim.clip); this.buildPanel('anim'); this.layout(); }));
      add('<h3>Clip</h3>');
      const def = app.anim.who === 'hero' ? hero : brute;
      add(this.chips(def.order.map((k) => [k, def.clips[k].label] as [string, string]), app.anim.clip, (k) => { app.selectAnim(app.anim.who, k); }));
      add('<h3>Reproducción</h3>');
      const row = this.el('<div class="row"></div>');
      const prev = this.el(`<button class="btn" title="cuadro anterior">${I.prev}</button>`);
      const play = this.el(`<button class="btn prim" title="reproducir/pausa">${app.anim.playing ? I.pause : I.play}</button>`);
      const next = this.el(`<button class="btn" title="cuadro siguiente">${I.next}</button>`);
      const syncPlay = () => { play.innerHTML = app.anim.playing ? I.pause : I.play; };
      prev.onclick = () => { app.stepFrame(-1); syncPlay(); };
      next.onclick = () => { app.stepFrame(1); syncPlay(); };
      play.onclick = () => { app.anim.playing = !app.anim.playing; app.applyAnimFlags(); syncPlay(); };
      const seg = this.el('<div class="seg"></div>');
      for (const [v, l] of [[0.25, '¼×'], [0.5, '½×'], [1, '1×']] as [number, string][]) {
        const b = this.el(`<button aria-pressed="${app.anim.speed === v}">${l}</button>`);
        b.onclick = () => { app.anim.speed = v; app.applyAnimFlags(); for (const x of seg.children) x.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', 'true'); };
        seg.appendChild(b);
      }
      row.append(prev, play, next, seg);
      add(row);
      const meta = this.el('<div class="meta" id="anim-meta" style="margin-top:8px"></div>');
      add(meta);
      add('<h3>Ver</h3>');
      add(this.tog('Papel cebolla', 'cuadro anterior en azul, siguiente en rojo', app.anim.onion, (v) => { app.anim.onion = v; }));
      add(this.tog('Esqueleto', 'el rig de IK debajo del dibujo', app.anim.rig, (v) => { app.anim.rig = v; }));
      add(this.tog('Vector crudo vs final', 'arrastrar la línea para comparar', app.anim.raw, (v) => { app.anim.raw = v; }));
      add(this.tog('Temblor de línea', 'cada dibujo con sus «errores»', app.anim.boil, (v) => { app.anim.boil = v; app.applyAnimFlags(); }));
      add(this.tog('Suave (60 fps)', 'interpolado en vez de cuadro a cuadro', app.anim.smooth, (v) => { app.anim.smooth = v; app.applyAnimFlags(); }));
      add(this.tog('Smear en el sprite', 'la medialuna dibujada en el cuadro', app.anim.bake, (v) => { app.anim.bake = v; app.applyAnimFlags(); }));
      add('<h3>Exportar</h3>');
      const dl = this.el(`<button class="btn">${I.dl}<span>Hoja de sprites (PNG)</span></button>`);
      dl.onclick = () => {
        const cv = app.spriteSheet();
        cv.toBlob((b) => {
          if (!b) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = `filo-${app.anim.who === 'hero' ? 'errante' : 'verdugo'}-${app.anim.clip}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        });
      };
      add(dl);
    } else if (m === 'fx') {
      add('<h2>Efectos</h2>');
      add('<p class="lead">Un toque en la escena lanza el efecto elegido ahí. Todo es shader y partículas: cintas que erosionan con ruido, polvo con sombra de caricatura y borde de tinta, ondas que deforman la imagen.</p>');
      add(this.chips(FX_LIST, app.fxSel, (k) => { app.fxSel = k; app.fxIdle = 0; app.spawnFx(k, 40, 40); }));
      this.atmos(p);
    } else if (m === 'world') {
      add('<h2>Escenario</h2>');
      add('<p class="lead">«Cementerio de filos», pintado por código pincelada a pincelada en capas a distinta profundidad. Arrastrar para recorrerlo; la vista despiezada muestra las capas en 3D.</p>');
      add(this.tog('Vista despiezada (3D)', 'las capas separadas en profundidad', app.world.explode, (v) => { app.world.explode = v; }));
      add('<h3>Capas</h3>');
      for (const l of app.scene.layers) {
        if (l.id.endsWith('Glow') && false) continue;
        add(this.tog(l.label, '', !l.hidden, (v) => { l.hidden = !v; }));
      }
      this.atmos(p);
    } else if (m === 'ui') {
      add('<h2>Interfaz</h2>');
      add('<p class="lead">Dibujada con el mismo pincel que los personajes: máscaras de vida, frasco de alma, barra del jefe con daño que se demora, diálogo y objetos. Está viva: sigue a la pelea.</p>');
      const kit = $('uikit');
      for (const [cls, label] of [['hud', 'Vida y alma'], ['boss', 'Barra del jefe'], ['dlg', 'Diálogo'], ['slots', 'Objetos'], ['menu', 'Menú']] as [string, string][]) {
        add(this.tog(label, '', true, (v) => { const e = kit.querySelector('.' + cls) as HTMLElement; if (e) e.hidden = !v; }));
      }
    }
    host.appendChild(p);
    this.panel = p;
  }

  private atmos(p: HTMLElement) {
    const app = this.app, R = app.R;
    p.appendChild(this.el('<h3>Atmósfera</h3>'));
    p.appendChild(this.tog('Rayos de luz', 'luz volumétrica y haces', R.rayK > 0, (v) => { R.rayK = v ? 0.8 : 0; }));
    p.appendChild(this.tog('Partículas', 'ceniza, brasas, luciérnagas', app.ambient, (v) => { app.ambient = v; }));
    const post = { ...R.post };
    p.appendChild(this.tog('Posproceso', 'bloom, gradación, papel, grano', R.post.bloom > 0, (v) => {
      R.post.bloom = v ? post.bloom : 0; R.post.grain = v ? post.grain : 0; R.post.paper = v ? post.paper : 0; R.post.vig = v ? post.vig : 0;
      R.post.lift = v ? post.lift : [0, 0, 0]; R.post.gain = v ? post.gain : [1, 1, 1];
    }));
  }

  // ---------- cada cuadro ----------
  frame() {
    const app = this.app;
    if (app.mode === 'anim') {
      const a = app.actor(), m = document.getElementById('anim-meta');
      if (m) m.textContent = `cuadro ${a.frame + 1} / ${a.clip.frames} · ${a.clip.fps} fps · ${(a.clip.frames / a.clip.fps).toFixed(2).replace('.', ',')} s`;
    }
    if (app.mode === 'world' && app.R.cam.explode > 0.4) this.placeTags();
    else if (this.tags.size) this.clearTags();
  }
  private placeTags() {
    const app = this.app, R = app.R, host = $('tags');
    const seen = new Set<string>();
    for (const l of app.scene.layers) {
      if (l.hidden || l.add || l.kind) continue;
      const { z, r } = R.layerGeom(l);
      const [sx, sy, w] = R.toScreen((r[0] + r[2]) / 2, r[3] * 0.4 + r[1] * 0.6, z);
      if (w <= 0) continue;
      let t = this.tags.get(l.id);
      if (!t) { t = document.createElement('div'); t.className = 'tag'; t.textContent = l.label; host.appendChild(t); this.tags.set(l.id, t); }
      t.style.left = sx + 'px'; t.style.top = sy + 'px';
      t.style.opacity = String(Math.min(1, (R.cam.explode - 0.4) * 3));
      seen.add(l.id);
    }
    for (const [k, t] of this.tags) if (!seen.has(k)) { t.remove(); this.tags.delete(k); }
  }
  private clearTags() { for (const t of this.tags.values()) t.remove(); this.tags.clear(); }

  // ---------- toques sobre la escena ----------
  private input() {
    const cv = $('game') as HTMLCanvasElement;
    const app = this.app;
    let down: { x: number, y: number, t: number, split: boolean } | null = null;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const split = app.mode === 'anim' && app.anim.raw && Math.abs(e.clientX - cv.clientWidth * app.anim.split) < 30;
      down = { x: e.clientX, y: e.clientY, t: performance.now(), split };
      if (app.mode === 'world') { app.world.drag = true; app.world.lastX = e.clientX; app.world.vx = 0; }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (down.split) { app.anim.split = Math.max(0.05, Math.min(0.95, e.clientX / cv.clientWidth)); return; }
      if (app.mode === 'world' && app.world.drag) {
        const dx = e.clientX - app.world.lastX;
        app.world.lastX = e.clientX;
        const units = dx / cv.clientWidth * app.R.cam.H * cv.clientWidth / cv.clientHeight;
        app.world.panX -= units;
        app.world.vx = -units / 0.016;
      }
    });
    const up = (e: PointerEvent) => {
      if (!down) return;
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 400;
      if (app.mode === 'world') app.world.drag = false;
      if (tap && app.mode === 'fx') {
        const [x, y] = app.R.toWorld(e.clientX, e.clientY);
        app.fxIdle = 0;
        app.spawnFx(app.fxSel, x, y);
      }
      if (tap && app.mode === 'anim' && app.anim.raw && !down.split) app.anim.split = Math.max(0.05, Math.min(0.95, e.clientX / cv.clientWidth));
      down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    // teclado
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (app.mode === 'anim') {
        if (e.key === 'ArrowLeft') { app.stepFrame(-1); this.buildPanel('anim'); }
        if (e.key === 'ArrowRight') { app.stepFrame(1); this.buildPanel('anim'); }
        if (e.key === ' ') { e.preventDefault(); app.anim.playing = !app.anim.playing; app.applyAnimFlags(); this.buildPanel('anim'); }
      }
      if (e.key === 'f' || e.key === 'F') ($('btn-fs') as HTMLButtonElement).click();
    });
  }
}
