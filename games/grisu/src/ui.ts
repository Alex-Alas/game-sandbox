// La interfaz del escaparate (DOM): pestañas, el panel de cada modo, el alto interno, sonido, pantalla completa,
// la línea del comparador «3D crudo vs pixelado» y la galería de retratos e íconos.
import * as THREE from 'three';
import { App, MODES, CLIPS, VIEWS, FX_LIST, type Mode } from './app.ts';
import { MODELS } from './render/models/index.ts';
import { HEIGHTS } from './render/pixel.ts';
import { SCHOOLS, EMIT } from './render/palette.ts';
import { LAYERS, type Layer } from './render/galerias.ts';
import { PORTRAITS, ICONS, drawPortrait, drawIcon } from './portraits/index.ts';

const $ = (id: string) => document.getElementById(id)!;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class UI {
  app: App;
  panel = $('panel'); caption = $('caption');
  onSound?: (on: boolean) => void;
  sound = true;
  private meta: HTMLElement | null = null;
  private galleryBuilt = false;

  constructor(app: App) {
    this.app = app;
    const tabs = $('tabs');
    for (const [m, label] of MODES) {
      const b = el('button', '', label);
      b.setAttribute('role', 'tab');
      b.dataset.m = m;
      b.onclick = () => this.go(m);
      tabs.append(b);
    }
    const hs = $('heights');
    for (const h of HEIGHTS) {
      const b = el('button', '', String(h));
      b.onclick = () => { app.P.setHeight(h); try { localStorage.setItem('grisu.h', String(h)); } catch { /* */ } this.syncHeights(); };
      hs.append(b);
    }
    this.syncHeights();
    $('snd').onclick = () => { this.sound = !this.sound; $('snd').setAttribute('aria-pressed', String(this.sound)); this.onSound?.(this.sound); };
    $('fs').onclick = () => this.fullscreen();
    $('toggle').onclick = () => this.panel.classList.toggle('closed');
    // en el teléfono parado el panel empieza cerrado (tapa media pantalla)
    if (innerHeight > innerWidth && innerWidth < 760) this.panel.classList.add('closed');
    // comparador: la línea se arrastra
    const sp = $('split');
    let drag = false;
    sp.addEventListener('pointerdown', (e) => { drag = true; sp.setPointerCapture(e.pointerId); });
    sp.addEventListener('pointermove', (e) => { if (drag) { app.splitX = e.clientX; sp.style.left = e.clientX + 'px'; } });
    sp.addEventListener('pointerup', () => { drag = false; });
    app.onClip = () => this.syncMeta();
    // el lienzo: EFECTOS lanza el efecto; ESCENARIO se arrastra
    const cv = app.P.gl.domElement;
    cv.addEventListener('pointerdown', (e) => {
      if (app.mode === 'efectos') {
        const [px, py] = app.P.screenToLow(e.clientX, e.clientY);
        const w = this.unproject(px, py);
        app.fireFx(app.fxSel, w[0], w[1]);
      } else if (app.mode === 'escenario' && !app.pilot.on) { app.pilot.drag = true; app.pilot.lastX = e.clientX; cv.setPointerCapture(e.pointerId); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!app.pilot.drag) return;
      const mpp = app.rig.view / (app.P.H * app.P.k / devicePixelRatio);
      app.pilot.pan = Math.max(app.W.x0 + 10, Math.min(app.W.x1 - 10, app.pilot.pan - (e.clientX - app.pilot.lastX) * mpp));
      app.pilot.lastX = e.clientX;
    });
    cv.addEventListener('pointerup', () => { app.pilot.drag = false; });
    addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === '.') app.stepFrame(1), this.build();
      else if (e.key === 'ArrowLeft' || e.key === ',') app.stepFrame(-1), this.build();
      else if (e.key === ' ') { app.sel.playing = !app.sel.playing; app.current().playing = app.sel.playing; this.build(); e.preventDefault(); }
    });
  }

  // píxel interno (con margen, y hacia arriba) → punto del plano de juego (metros)
  unproject(px: number, py: number): [number, number] {
    const P = this.app.P, cam = this.app.rig.cam;
    const nx = (px / P.rw) * 2 - 1, ny = (py / P.rh) * 2 - 1;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
    const t = -cam.position.z / v.z;
    return [cam.position.x + v.x * t, cam.position.y + v.y * t];
  }

  syncHeights() {
    for (const b of $('heights').querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.textContent! === this.app.P.H));
  }

  go(m: Mode) {
    this.app.setMode(m);
    try { localStorage.setItem('grisu.mode', m); } catch { /* */ }
    for (const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.m === m));
    $('gallery').hidden = m !== 'retratos';
    if (m === 'retratos') this.gallery();
    this.build();
  }

  private chip(label: string, on: boolean, f: () => void, style = '') {
    const b = el('button', 'chip', label);
    b.setAttribute('aria-pressed', String(on));
    if (style) b.style.cssText = style;
    b.onclick = () => { f(); this.build(); };
    return b;
  }
  private tog(label: string, sub: string, on: boolean, f: (v: boolean) => void) {
    const d = el('div', 'tog', `<div>${label}${sub ? `<small>${sub}</small>` : ''}</div><div class="box"></div>`);
    d.setAttribute('aria-checked', String(on));
    d.onclick = () => { f(!on); this.build(); };
    return d;
  }
  private h3(t: string) { return el('h3', '', t); }

  build() {
    const a = this.app, p = this.panel, s = a.sel;
    p.innerHTML = '';
    $('split').hidden = !(s.split && (a.mode === 'personajes' || a.mode === 'enemigos' || a.mode === 'escenario'));
    if (!$('split').hidden) { if (!a.splitX) a.splitX = innerWidth * 0.5; $('split').style.left = a.splitX + 'px'; }
    p.hidden = a.mode === 'retratos';
    this.meta = null;
    if (a.mode === 'personajes' || a.mode === 'enemigos') {
      const ids = a.mode === 'personajes' ? ['esgrimista', 'estibador'] : ['topo', 'capataz'];
      const cur = a.currentId();
      p.append(el('h2', '', MODELS[cur].name), el('p', 'lead', MODELS[cur].sub));
      const who = el('div', 'chips');
      for (const id of ids) who.append(this.chip(MODELS[id].name.replace(/^(EL|LA) /, ''), id === cur, () => { if (a.mode === 'personajes') s.hero = id; else s.enemy = id; a.setMode(a.mode); }));
      p.append(who, this.h3('Clips'));
      const cl = el('div', 'chips');
      for (const [c, label] of CLIPS[cur]) cl.append(this.chip(label, c === s.clip, () => { s.clip = c; a.playSel(); }));
      p.append(cl, this.h3('Reproducción'));
      const pb = el('div', 'row');
      const bt = (t: string, f: () => void) => { const b = el('button', 'btn', t); b.onclick = () => { f(); this.build(); }; return b; };
      pb.append(bt('◀', () => a.stepFrame(-1)), bt(s.playing ? '❚❚' : '▶', () => { s.playing = !s.playing; a.current().playing = s.playing; }), bt('▶', () => a.stepFrame(1)));
      this.meta = el('span', 'meta'); pb.append(this.meta);
      p.append(pb);
      const sp = el('div', 'chips'); sp.style.marginTop = '6px';
      for (const v of [1, 0.5, 0.25]) sp.append(this.chip(v === 1 ? '1×' : v === 0.5 ? '½×' : '¼×', s.speed === v, () => { s.speed = v; a.current().speed = v; }));
      sp.append(this.chip(s.twos ? 'En dos (12 fps)' : 'Continuo', true, () => { s.twos = !s.twos; a.current().twos = s.twos; }));
      p.append(sp, this.h3('Orientación'));
      const or = el('div', 'row');
      or.append(bt('⟲', () => { s.yaw = (s.yaw + 7) % 8; a.current().yaw = a.yawOf(s.yaw); a.current().drawnFrame = -1; }), el('span', 'meta', s.yaw === 1 ? '3/4 de juego' : `${s.yaw * 45}° · ${['perfil', '3/4 juego', 'frente', '3/4', 'perfil', 'espalda 3/4', 'espalda', 'espalda 3/4'][s.yaw]}`),
        bt('⟳', () => { s.yaw = (s.yaw + 1) % 8; a.current().yaw = a.yawOf(s.yaw); a.current().drawnFrame = -1; }));
      p.append(or, this.h3('Vista'));
      const vw = el('div', 'chips');
      for (const [k, label] of VIEWS) vw.append(this.chip(label, s.view === k, () => { s.view = k; }));
      p.append(vw);
      if (a.mode === 'personajes') this.schools(p);
      this.render3d(p);
    } else if (a.mode === 'escenario') {
      p.append(el('h2', '', 'Las Galerías'), el('p', 'lead', 'Un tramo de PASILLO del estrato 1. El Esgrimista lo recorre corriendo y salta los fosos; sin piloto, arrastra para recorrerlo.'));
      p.append(this.tog('Piloto', 'corre solo · sin él, arrastras', a.pilot.on, (v) => { a.pilot.on = v; if (!v) a.pilot.pan = a.rig.target.x; else a.actors.esgrimista.play('run'); }));
      p.append(this.h3('Capas'));
      for (const [k, label] of LAYERS) p.append(this.tog(label, LAYER_SUB[k], a.layers[k], (v) => { a.layers[k] = v; }));
      p.append(this.tog('Vapor', 'chorros de los caños', a.steam, (v) => { a.steam = v; }));
      p.append(this.tog('Burbujas de grisú', 'las bolsas de la pared', a.gasOn, (v) => { a.gasOn = v; }));
      this.render3d(p);
    } else if (a.mode === 'efectos') {
      p.append(el('h2', '', 'Efectos'), el('p', 'lead', 'Toca la escena para lanzar el efecto elegido. Todo es píxel: chispas, polvo con contorno, anillos, bolas de fuego tramadas.'));
      const ch = el('div', 'chips');
      for (const [k, label] of FX_LIST) ch.append(this.chip(label, a.fxSel === k, () => { a.fxSel = k; a.fxIdle = 99; }));
      p.append(ch);
      this.schools(p);
    }
    this.syncMeta();
  }
  private schools(p: HTMLElement) {
    const a = this.app;
    p.append(this.h3('Brillo de escuela'));
    const sc = el('div', 'chips');
    for (const [k, label] of SCHOOLS) {
      const b = this.chip('', a.sel.school === k, () => { a.sel.school = k; a.applySchool(); }, `background:${EMIT[k][1]};`);
      b.classList.add('sw'); b.title = label;
      sc.append(b);
    }
    p.append(sc);
    const name = SCHOOLS.find(([k]) => k === a.sel.school)![1];
    p.append(el('div', 'meta', name));
  }
  private render3d(p: HTMLElement) {
    const a = this.app, o = a.P.opt;
    p.append(this.h3('Pipeline'));
    p.append(this.tog('3D crudo vs pixelado', 'arrastra la línea', a.sel.split, (v) => { a.sel.split = v; }));
    p.append(this.tog('Contorno de 1 px', 'tinta con selout y contraluz', o.outline, (v) => { o.outline = v; }));
    p.append(this.tog('Bordes interiores', 'convexos claros, pliegues oscuros', o.edges, (v) => { o.edges = v; }));
    p.append(this.tog('Brillo escalonado', 'halo de píxeles', o.bloom > 0, (v) => { o.bloom = v ? 1 : 0; }));
    p.append(this.tog('Paleta de Galerías', 'LUT: cada píxel al color más cercano', o.lut, (v) => { o.lut = v; }));
  }
  syncMeta() {
    const a = this.app;
    if (this.meta) {
      const c = a.current();
      this.meta.textContent = ` cuadro ${c.frameAt() + 1}/${c.frames}`;
    }
    const m = a.mode;
    if (m === 'personajes' || m === 'enemigos') {
      const c = a.current(), name = CLIPS[a.currentId()].find(([k]) => k === c.id)?.[1] ?? c.id;
      const px = Math.round(c.def.height * a.P.H / a.rig.view);
      this.caption.innerHTML = `<b>${name}</b>${MODELS[a.currentId()].name} · ${px} px de alto · interno ${a.P.W}×${a.P.H} ×${a.P.k}`;
    } else if (m === 'escenario') this.caption.innerHTML = `<b>Las Galerías · PASILLO</b>interno ${a.P.W}×${a.P.H} ×${a.P.k}`;
    else if (m === 'efectos') this.caption.innerHTML = `<b>${FX_LIST.find(([k]) => k === a.fxSel)![1]}</b>toca la escena`;
    else this.caption.innerHTML = '';
  }
  private fr = 0;
  frame() {
    if ((this.fr++ & 7) === 0) this.syncMeta();
    // el panel de la derecha tapa parte de la escena: la cámara lo compensa (en pantallas anchas)
    const r = this.panel.getBoundingClientRect();
    const open = !this.panel.hidden && !this.panel.classList.contains('closed') && r.width > 0;
    this.app.panelPx = open && r.left > innerWidth * 0.5 ? innerWidth - r.left : 0;
    this.app.panelBottom = open && r.width > innerWidth * 0.6 && r.top > innerHeight * 0.35 ? innerHeight - r.top : 0;
  }

  gallery() {
    if (this.galleryBuilt) return;
    this.galleryBuilt = true;
    const w = $('gallery').querySelector('.wrap')!;
    for (const pr of PORTRAITS) {
      const c = el('div', 'card px');
      const cv = el('canvas');
      cv.width = 900; cv.height = 1100;
      c.append(cv, el('div', 'nm', pr.name), el('div', 'ds', pr.sub));
      w.append(c);
      requestAnimationFrame(() => drawPortrait(cv, pr.id));
    }
    const ic = el('div', 'px'); ic.id = 'icons';
    ic.append(el('h3', '', 'Íconos 24 × 24 · gadgets, objetos y pergaminos'));
    const g = el('div', 'grid');
    for (const it of ICONS) {
      const d = el('div', 'ic');
      const cv = el('canvas'); cv.width = 24; cv.height = 24;
      drawIcon(cv, it.id);
      d.append(cv, document.createTextNode(it.name));
      g.append(d);
    }
    ic.append(g);
    w.append(ic);
  }

  fullscreen() {
    const d = document as any, e = document.documentElement as any;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d); return; }
    const req = e.requestFullscreen ?? e.webkitRequestFullscreen;
    if (!req) { alert('En este navegador: Compartir → «Agregar a inicio» abre GRISÚ sin barras.'); return; }
    Promise.resolve(req.call(e)).then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => { /* */ });
  }
}

const LAYER_SUB: Record<Layer, string> = {
  fore: 'z +4…+8: postes y rocas oscuras', play: 'z = 0: piso, rieles, andamio', near: 'z −3…−15: pared, caños, faroles', far: 'z −40…−150: la caverna', beams: 'conos tramados en escalones',
};
