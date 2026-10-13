// GRISÚ · F1, «el dedo»: el patio gris para calibrar el movimiento, los gestos y las mecánicas de las dos clases del
// MVP (plan, pasos 1.0–1.4). La sim corre a 60 Hz fijos (sim/sim.ts) y el dibujo interpola entre dos cuadros; el parry
// perfecto pone 0,25 s de cámara lenta al 40 % (solo el ritmo: la sim sigue siendo la misma). Todo lo tuneable vive en
// AJUSTES (⚙ o Esc), generado de RANGES y guardado en `grisu.cfg`.
// `window.__grisu`: state(), advance(n, input | (k) => input), reset(zona), cls(c), cfg, view, boxes(on).
import { DEFAULTS, RANGES, type Cfg } from './sim/params.ts';
import { buildPatio } from './sim/patio.ts';
import { init, step, warp } from './sim/sim.ts';
import { HZ, DT, NOINPUT, A, type Input, type Cls, type State } from './sim/state.ts';
import { attached } from './sim/mech.ts';
import { Controls } from './input.ts';
import { GameView } from './render/view.ts';
import { Sfx } from './audio.ts';
import { buildMenu, refresh, type Section } from './menu.ts';
import { HEIGHTS } from './render/pixel.ts';

const ZONES = ['pasillo', 'pozo', 'sala'] as const;
const ZONE_NAME = { pasillo: 'PASILLO', pozo: 'POZO', sala: 'SALA' };
const CLS_NAME = { esgrimista: 'EL ESGRIMISTA', estibador: 'EL ESTIBADOR' };
const load = <T>(k: string, def: T): T => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v) as T; } catch { return def; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const $ = (id: string) => document.getElementById(id)!;

export function startGame() {
  document.body.classList.add('game');
  document.title = 'GRISÚ · el patio (F1)';
  const q = new URLSearchParams(location.search);
  const cfg: Cfg = { ...DEFAULTS };
  const stored = load<Partial<Cfg>>('grisu.cfg', {});
  for (const k of Object.keys(DEFAULTS) as (keyof Cfg)[]) if (typeof stored[k] === 'number') cfg[k] = stored[k]!;
  const w = buildPatio(cfg);
  let cls: Cls = q.get('clase') === 'estibador' || q.get('clase') === 'esgrimista' ? q.get('clase') as Cls : load<Cls>('grisu.cls', 'esgrimista');
  let zone = Math.max(0, ZONES.indexOf((q.get('zona') ?? load('grisu.zone', 'sala')) as typeof ZONES[number]));
  let s: State = init(w, cls, zone, 1);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const view = new GameView(canvas, w);
  try { const h = +(localStorage.getItem('grisu.h') ?? ''); if (HEIGHTS.includes(h)) view.P.setHeight(h); } catch { /* */ }
  const ctl = new Controls(canvas, cfg);
  const sfx = new Sfx();
  sfx.setOn(load('grisu.sound', true));
  view.onSfx = (k, o) => sfx.play(k, o);
  addEventListener('pointerdown', () => sfx.unlock());
  addEventListener('keydown', () => sfx.unlock());

  // ---------- HUD
  const hud = $('hud');
  hud.hidden = false;
  const hpBar = $('hpbar').firstElementChild as HTMLElement, hpTxt = $('hptxt'), pips = $('pips'), combo = $('combo'), zoneEl = $('zonelbl');
  const msg = $('msg'), hint = $('hint');
  let msgT = 0;
  const say = (t: string, cls2 = '', ms = 900) => { msg.textContent = t; msg.className = cls2; msg.hidden = false; clearTimeout(msgT); msgT = setTimeout(() => msg.hidden = true, ms); };
  const hints = () => {
    const touch = ctl.usedTouch || matchMedia('(pointer: coarse)').matches;
    const H: Record<Cls, [string, string]> = {
      esgrimista: ['<b>TOCA</b> salta · <b>DESLIZA</b> dash-corte · <b>MANTÉN</b> guardia (al empezar, parry)', '<b>ESPACIO</b> salta · <b>CLIC IZQ.</b> dash-corte · <b>CLIC DER.</b> guardia · o WASD + J / K'],
      estibador: ['<b>TOCA</b> salta · <b>DESLIZA</b> martillazo (↓ en el aire: picada) · <b>MANTÉN</b> el ancla al punto', '<b>ESPACIO</b> salta · <b>CLIC IZQ.</b> martillazo (↓ en el aire: picada) · <b>CLIC DER.</b> ancla · o WASD + J / K'],
    };
    hint.innerHTML = H[s.pl[0].cls][touch ? 0 : 1];
  };
  hints();
  let hintUses = 0;
  if (matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth) setTimeout(() => say('GIRA EL TELÉFONO: se juega acostado', 'dim', 3000), 400);

  // ---------- AJUSTES
  const keys = (pre: string[]) => pre as (keyof Cfg)[];
  const resetKeys = (ks: readonly string[]) => { for (const k of ks) (cfg as Record<string, number>)[k] = DEFAULTS[k as keyof Cfg]; };
  const K = {
    gest: keys(['TAP_MS', 'TAP_PX', 'SWIPE_PX', 'SWIPE_MS', 'HOLD_MS']), assist: keys(['DIR16', 'WALK_AUTO']),
    run: keys(['RUN', 'ACC', 'DEC', 'WALK']), jump: keys(['JUMP_H', 'JUMP_T', 'FALL_G', 'JUMP2_H', 'AIR_JUMPS']), tol: keys(['COYOTE', 'BUFFER']),
    fall: keys(['MAX_FALL', 'MAX_FALL_POZO', 'PIT_DMG']),
    dash: keys(['DASH_D', 'DASH_F', 'DASH_KEEP', 'DASH_INV', 'DASH_R', 'DASH_N', 'DASH_CD', 'DASH_DMG', 'DASH_KB', 'MAG_R', 'MAG_DEG']),
    parry: keys(['PARRY_PERFECT', 'PARRY_GOOD', 'GOOD_BLOCK', 'GUARD_BLOCK', 'PARRY_STUN', 'STUN_MUL', 'PARRY_LAG', 'PARRY_STOP', 'PARRY_SLOW', 'REFLECT_V', 'REFLECT_DMG']),
    pogo: keys(['POGO_V', 'POGO_H', 'POGO_INV', 'POGO_DMG', 'WAVE_R', 'WAVE_KB', 'LAND_LAG']),
    hammer: keys(['HAMMER_F', 'HAMMER_ON', 'HAMMER_OFF', 'HAMMER_LUNGE', 'HAMMER_R', 'HAMMER_REACH', 'HAMMER_KB', 'HAMMER_DMG', 'HAMMER_STOP']),
    hook: keys(['HOOK_LEN', 'HOOK_TRAVEL', 'HOOK_K', 'HOOK_REST', 'HOOK_V', 'HOOK_DAMP', 'HOOK_JUMP', 'HOOK_CONE', 'HOOK_MISS', 'HOOK_N', 'HOOK_CD', 'HOOK_GROUND', 'HOOK_FOE', 'EST_M']),
    combat: keys(['HP', 'HURT_INV', 'HURT_STUN', 'CONTACT_DMG', 'COMBO_T', 'COMBO_DMG', 'COMBO_MAX', 'HITSTOP_L', 'HITSTOP_H']),
    dummies: keys(['M_LIGHT', 'M_MID', 'M_HEAVY', 'D_FRIC', 'D_RESPAWN', 'IMPACT_V', 'IMPACT_DMG']),
    foes: keys(['ATK_EVERY', 'ATK_RANGE', 'ATK_DMG', 'ATK_DMG_R', 'ATK_RED', 'TUR_EVERY', 'TUR_RANGE', 'TUR_V', 'TUR_DMG']),
  };
  const R = RANGES as unknown as Record<string, [number, number, number, number, string]>;
  const V = cfg as unknown as Record<string, number>;
  const row = (ks: (keyof Cfg)[]) => ({ rows: R, keys: ks as string[], vals: V });
  const SECTIONS: Section[] = [
    { id: 'patio', label: 'PATIO', fields: [
      { title: 'Clase' },
      { choice: [{ id: 'esgrimista', label: 'ESGRIMISTA', hint: 'Dash-corte (deslizar) y guardia con parry (mantener). Ágil y preciso.' }, { id: 'estibador', label: 'ESTIBADOR', hint: 'Martillazo y picada-pogo (deslizar), y el ancla: la liga al punto (mantener). Pesado y vertical.' }],
        get: () => s.pl[0].cls, set: (v) => setClass(v as Cls) },
      { title: 'Zona' },
      { choice: [{ id: 'pasillo', label: 'PASILLO', hint: '200 m: se corre solo. Fosos, ruta alta y baja, túnel y vigas para la liga.' }, { id: 'pozo', label: 'POZO', hint: '120 m de caída: salientes, válvulas para el pogo y una torreta.' }, { id: 'sala', label: 'SALA', hint: '28 × 14 m: caminata asistida, dummies de los tres pesos, dos atacantes y una torreta.' }],
        get: () => ZONES[s.pl[0].zone], set: (v) => setZone(ZONES.indexOf(v as typeof ZONES[number])) },
      { title: 'Ver', note: 'Las cajas de la sim: héroe (blanco = invulnerable), dummies y el golpe del martillazo.' },
      { buttons: [{ label: 'CAJAS', onClick: () => { view.showBoxes = !view.showBoxes; } }, { label: 'ESCAPARATE DE ASSETS', onClick: () => { location.href = '?modo=personajes'; } }] },
      { title: 'Dummies', note: 'Masa de cada peso (× la del héroe) y LANZADO: lo empujado fuerte lastima a lo que choca.' },
      row(K.dummies),
      { title: 'Atacante y torreta', note: 'El atacante telegrafía en BLANCO (se devuelve con parry) o en ROJO (no: esquivar). La torreta destella antes de disparar.' },
      row(K.foes),
    ], reset: () => resetKeys([...K.dummies, ...K.foes]) },
    { id: 'controles', label: 'GESTOS', fields: [
      { title: 'Gestos (teléfono)', note: 'TOQUE = salta. DESLIZAR = la acción direccional. MANTENER = la sostenida hacia el punto bajo el dedo (se arrastra).' },
      row(K.gest),
      { title: 'Asistencia', note: '16 direcciones: el deslizar y el ratón se reducen a 16 sectores. SALA: caminar hacia el enemigo más cercano (o el último golpeado) y frenar a su alcance; apagado, quieto hasta un gesto.' },
      row(K.assist),
    ], reset: () => resetKeys([...K.gest, ...K.assist]) },
    { id: 'mov', label: 'MOVIMIENTO', fields: [
      { title: 'Carrera y caminata' }, row(K.run),
      { title: 'Salto', note: 'Altura fija (sin salto variable). La gravedad de caída es la del salto × FALL_G.' }, row(K.jump),
      { title: 'Tolerancias' }, row(K.tol),
      { title: 'Caída' }, row(K.fall),
    ], reset: () => resetKeys([...K.run, ...K.jump, ...K.tol, ...K.fall]) },
    { id: 'esg', label: 'ESGRIMISTA', fields: [
      { title: 'Dash-corte', note: 'Recorre DASH_D en DASH_F cuadros; invulnerable hasta DASH_INV. Atraviesa a los livianos y medianos; el pesado lo frena. Matar devuelve una carga.' }, row(K.dash),
      { title: 'Guardia y parry', note: 'Un golpe en los primeros PARRY_PERFECT cuadros de la guardia es parry perfecto (aturde, devuelve proyectiles, recarga). Soltar la guardia sin haber devuelto nada deja PARRY_LAG sin poder ponerla.' }, row(K.parry),
    ], reset: () => resetKeys([...K.dash, ...K.parry]) },
    { id: 'est', label: 'ESTIBADOR', fields: [
      { title: 'Picada (pogo)', note: 'Deslizar ↓ en el aire. Pegar en algo (dummy, válvula) rebota POGO_H, recupera los saltos y una carga del ancla. Contra el suelo: aterrizaje pesado con onda.' }, row(K.pogo),
      { title: 'Martillazo' }, row(K.hammer),
      { title: 'Ancla (la liga)', note: 'Mantener dispara la liga al punto; soltar la suelta (conserva la velocidad); un toque enganchado suelta con impulso. Contra un dummy el tirón se reparte por masa.' }, row(K.hook),
    ], reset: () => resetKeys([...K.pogo, ...K.hammer, ...K.hook]) },
    { id: 'comb', label: 'COMBATE', fields: [
      { title: 'Integridad y golpes' }, row(K.combat),
    ], reset: () => resetKeys(K.combat) },
  ];
  {
    const listed = new Set(SECTIONS.flatMap(sc => sc.fields.flatMap(f => 'keys' in f ? f.keys : [])));
    for (const k of Object.keys(RANGES)) if (!listed.has(k)) console.warn(`ajuste sin pestaña: ${k}`);
  }
  let paused = false;
  const menu = buildMenu($('menu'), SECTIONS, {
    changed: () => save('grisu.cfg', cfg),
    copy: () => JSON.stringify(cfg),
    onOpen: () => { paused = true; ctl.enabled = false; },
    onClose: () => { paused = false; ctl.enabled = true; },
  });
  $('gear').onclick = () => menu.open();
  addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.toggle(); });

  function setClass(c: Cls) { cls = c; save('grisu.cls', c); s = init(w, c, s.pl[0].zone, s.seed); view.cam.zone = -1; hints(); syncBtns(); refresh(); }
  function setZone(z: number) { zone = z; save('grisu.zone', ZONES[z]); warp(s, w, s.pl[0], z); view.cam.zone = -1; syncBtns(); refresh(); }
  const clsBtn = $('clsbtn'), zoneBtn = $('zonebtn');
  clsBtn.onclick = () => setClass(s.pl[0].cls === 'esgrimista' ? 'estibador' : 'esgrimista');
  zoneBtn.onclick = () => setZone((s.pl[0].zone + 1) % 3);
  const syncBtns = () => { clsBtn.textContent = CLS_NAME[s.pl[0].cls]; zoneBtn.textContent = ZONE_NAME[ZONES[s.pl[0].zone]]; };
  syncBtns();
  const snd = $('gsnd');
  snd.setAttribute('aria-pressed', String(sfx.on));
  snd.onclick = () => { sfx.unlock(); sfx.setOn(!sfx.on); save('grisu.sound', sfx.on); snd.setAttribute('aria-pressed', String(sfx.on)); };
  $('gfs').onclick = () => {
    const d = document as any, e = document.documentElement as any;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d); return; }
    const req = e.requestFullscreen ?? e.webkitRequestFullscreen;
    if (!req) { say('Compartir → «Agregar a inicio» abre GRISÚ sin barras', '', 2500); return; }
    Promise.resolve(req.call(e)).then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => { /* */ });
  };

  // ---------- bucle
  let acc = 0, last = performance.now(), slowT = 0, fpsAvg = 60;
  const hero = () => s.pl[0];
  const readInput = (now: number): Input => ctl.read(now, hero(), (x, y) => view.toWorld(x, y));
  function simStep(inp: Input) {
    view.snapshot(s);
    step(s, w, [inp]);
    view.events(s, w, s.ev);
    for (const e of s.ev) {
      if (e.k === 'parry') { say(e.proj ? '¡DEVUELTO!' : '¡PARRY!', 'gold', 700); if (cfg.PARRY_SLOW > 0.5) slowT = 0.25; }
      else if (e.k === 'block') say(e.good ? 'BUENO' : 'GUARDIA', 'dim', 500);
      else if (e.k === 'pit') say(`FOSO  −${e.dmg}`, 'red', 900);
      else if (e.k === 'fondo') say('FONDO', '', 1200);
      else if (e.k === 'vuelta') { say('OTRA VEZ', 'dim', 900); view.cam.zone = -1; }
      else if (e.k === 'ko') say('SIN INTEGRIDAD · se rellena', 'red', 1400);
      else if ((e.k === 'dash' || e.k === 'hammer' || e.k === 'dive' || e.k === 'guard' || e.k === 'hook') && ++hintUses === 12) hint.classList.add('fade');
    }
  }
  function frame(now: number) {
    const ms = Math.max(0, Math.min(100, now - last)); last = now;   // el primer rAF puede venir antes de performance.now()
    fpsAvg += (1000 / Math.max(1, ms) - fpsAvg) * 0.05;
    view.P.resize(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 3));
    const slow = slowT > 0 ? 0.4 : 1;
    slowT = Math.max(0, slowT - ms / 1000);
    if (!paused) {
      acc += ms / 1000 * slow;
      let n = 0;
      while (acc >= DT && n < 6) { simStep(readInput(now)); acc -= DT; n++; }
      if (n >= 6) acc = 0;
    }
    draw(paused ? 0 : ms / 1000 * slow, acc / DT);
    requestAnimationFrame(frame);
  }
  function draw(dt: number, alpha: number) {
    const p = hero();
    const hp = ctl.holdPoint();
    view.held = hp ? (() => { const [x, y] = view.toWorld(hp.x, hp.y); return { x, y }; })() : null;
    const now = performance.now();
    view.gest = {
      tap: ctl.lastTap ? [ctl.lastTap.x, ctl.lastTap.y, (now - ctl.lastTap.t) / 1000] : undefined,
      swipe: ctl.lastSwipe ? [ctl.lastSwipe.x, ctl.lastSwipe.y, ctl.lastSwipe.dx, ctl.lastSwipe.dy, (now - ctl.lastSwipe.t) / 1000] : undefined,
      hold: ctl.G.holding && hp ? [hp.x, hp.y] : undefined,
    };
    view.state = s; view.world = w;
    view.sync(s, w, Math.max(0, Math.min(1, alpha)), dt);
    view.render();
    // HUD
    const u = Math.max(0, p.hp / cfg.HP);
    hpBar.style.width = `${u * 100}%`;
    hpBar.className = u < 0.3 ? 'low' : '';
    hpTxt.textContent = String(Math.ceil(p.hp));
    const N = p.cls === 'esgrimista' ? cfg.DASH_N : cfg.HOOK_N;
    let ph = '';
    for (let i = 0; i < N; i++) { const f = Math.max(0, Math.min(1, p.charge - i)); ph += `<i class="${f >= 1 ? 'full' : ''}" style="--f:${f}"></i>`; }
    pips.innerHTML = `<span>${p.cls === 'esgrimista' ? 'DASH' : 'ANCLA'}</span>${ph}`;
    if (p.combo > 1) {
      const mul = Math.min(cfg.COMBO_MAX, 1 + cfg.COMBO_DMG * p.combo);
      combo.hidden = false;
      combo.innerHTML = `<b>${p.combo}</b><small>COMBO · daño ×${mul.toFixed(2)}</small>`;
      combo.style.setProperty('--k', String(Math.min(1, (mul - 1) / (cfg.COMBO_MAX - 1 || 1))));
    } else combo.hidden = true;
    zoneEl.textContent = `${ZONE_NAME[ZONES[p.zone]]} · récord de combo ${p.comboMax}`;
    if (ZONES[p.zone] !== ZONES[zone]) { zone = p.zone; syncBtns(); }
    void attached; void A;
  }
  requestAnimationFrame(frame);

  (window as any).__grisu = {
    view, w, cfg, ctl, sfx,
    get s() { return s; },
    state: () => s,
    advance(n: number, inp: Partial<Input> | ((k: number) => Partial<Input>) = {}) {
      for (let k = 0; k < n; k++) simStep({ ...NOINPUT, ...(typeof inp === 'function' ? inp(k) : inp) });
      view.state = s; view.world = w; view.sync(s, w, 1, n / HZ); view.render();
      return s.pl[0];
    },
    reset(z: string | number = s.pl[0].zone) { setZone(typeof z === 'number' ? z : Math.max(0, ZONES.indexOf(z as typeof ZONES[number]))); return s.pl[0]; },
    cls: (c: Cls) => setClass(c),
    boxes: (on = true) => { view.showBoxes = on; },
    pause: (on = true) => { paused = on; },
    render: () => { view.state = s; view.world = w; view.sync(s, w, 1, 0); view.render(); },
    fps: () => Math.round(fpsAvg),
    menu,
    ready: true,
  };
}
