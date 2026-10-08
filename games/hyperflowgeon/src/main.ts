import { init, step, aimDir, hookTarget, throwVel, raycast, attached, size, atkBox, DT, HW, H, HAND, ORB_R, D_HP, type Input, type State } from './sim/sim.ts';
import { RANGES, DEFAULTS, PROFILES, HOOK_KEYS, type Cfg, type HookCfg, type Profile } from './sim/params.ts';
import { PATIO, SPOTS } from './patio.ts';
import { CAM_RANGES, CAM_DEFAULTS, newCam, follow, type CamCfg } from './camera.ts';
import { buildMenu, rows, refresh, type Section } from './menu.ts';
import * as T from './touch.ts';

// HYPERFLOWGEON · F1 paso E: golpes de ATAQUE sobre lo del paso D (dummies, doble salto, modo ancla y a la par), en gris. Paso fijo de 60 Hz con render interpolado.
const cv = document.getElementById('game') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
const hud = document.getElementById('hud')!;

// Valores guardados: sim en hfg.cfg, cámara en hfg.cam, controles táctiles en hfg.ctl. Las claves del garfio
// (HOOK_KEYS) son del perfil activo: cada perfil guarda las suyas (hfg.prof2) y elegir otro las carga en cfg.
const cfg: Cfg = { ...DEFAULTS }, camCfg: CamCfg = { ...CAM_DEFAULTS };
const NAMES = Object.keys(PROFILES) as Profile[];
const profs = structuredClone(PROFILES) as Record<Profile, HookCfg>;
let active: Profile = 'liga';
const load = (key: string) => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}; } catch { return {}; } };
const store = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const restore = (vals: Record<string, number>, saved: Record<string, unknown> | undefined, keys: readonly string[]) => {
  for (const k of keys) if (typeof saved?.[k] === 'number') vals[k] = saved[k] as number;
};
restore(cfg, load('hfg.cfg'), Object.keys(RANGES));
restore(camCfg, load('hfg.cam'), Object.keys(CAM_RANGES));
{
  const sv = load('hfg.prof2'); // hfg.prof2: los perfiles cambiaron con el viaje del ancla (los de hfg.prof quedan atrás)
  if (NAMES.includes(sv.active)) active = sv.active;
  for (const n of NAMES) restore(profs[n], sv.perfiles?.[n], HOOK_KEYS);
  const c = load('hfg.ctl');
  restore(T.ctl, c, Object.keys(T.CTL_RANGES));
  if (T.SCHEMES.some(x => x.id === c.scheme)) T.opts.scheme = c.scheme;
  for (const b of ['stick', 'jump', 'hook', 'atk'] as const) {
    const v = c.pos?.[b];
    if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)) T.opts.pos[b] = [v[0], v[1]];
  }
}
Object.assign(cfg, profs[active]);
function saveAll() {
  for (const k of HOOK_KEYS) profs[active][k] = cfg[k];
  store('hfg.cfg', cfg), store('hfg.cam', camCfg), store('hfg.prof2', { active, perfiles: profs }), store('hfg.ctl', { ...T.ctl, ...T.opts });
}
// Cambiar de perfil carga sus valores y llena las cargas (también con 1/2/3 en el teclado)
function useProfile(n: Profile) {
  saveAll();
  active = n;
  Object.assign(cfg, profs[n]);
  if (s) s.p.charge = cfg.HOOK_N;
  saveAll(), refresh();
}

// Menú de AJUSTES (⚙ o Esc; pausa el juego): una pestaña por tema
const MOVE = ['RUN', 'ACC', 'DEC', 'AIR', 'JUMP_H', 'JUMP_T', 'JUMP_CUT', 'FALL_G', 'MAX_FALL', 'COYOTE', 'BUFFER', 'AIR_JUMPS', 'JUMP2_H'] as const;
const ASSIST = ['AIM_FOE', 'AIM_EDGE', 'AIM_16', 'AIM_UP'] as const;
const DUMMY = ['M_LIGHT', 'M_MID', 'M_HEAVY', 'D_FRIC', 'D_RESPAWN'] as const;
const ATTACK = ['THROW_V', 'ANCHOR_M', 'SWING_A', 'SWING_V', 'ANCHOR_G', 'IMPACT_V', 'IMPACT_DMG'] as const;
const GOLPE = ['ATK_REACH', 'ATK_L_BASE', 'ATK_H_BASE', 'ATK_CARRY', 'ATK_DMG_L', 'ATK_DMG_H', 'ATK_DIVE'] as const;
const resetKeys = (ks: readonly (keyof Cfg)[]) => { for (const k of ks) cfg[k] = DEFAULTS[k]; };
const HINTS: Record<Profile, string> = {
  corto: 'Casi una cuerda: poco estirón, columpio predecible, rígida y de recarga rápida.',
  liga: 'La calibrada: larga y blanda, con tirón alto; el ancla llega casi al instante.',
  lanzadera: 'Para salir de apuros: te tira hasta el ancla desde lejos, con una sola carga lenta; el ancla tarda en llegar (apuntá adelantado).',
};
const SECTIONS: Section[] = [
  { id: 'controles', label: 'CONTROLES', fields: [
    { title: 'Apuntar el garfio (táctil)' },
    { choice: T.SCHEMES, get: () => T.opts.scheme, set: v => { T.opts.scheme = v as T.Scheme; T.clear(true); } },
    { title: 'Asistencia de puntería', note: 'Dentro del cono: imán a enemigos (un dummy gana a todo) e imán a esquinas (ganan a las superficies). 16 direcciones: la regla de PVP (ratón, joystick y teclado apuntan igual). El ancho del cono es de cada perfil (GARFIO → Puntería).' },
    { rows: RANGES, keys: ASSIST, vals: cfg },
    { title: 'Joystick' },
    { rows: T.CTL_RANGES, keys: ['STICK_DEAD', 'STICK_FULL', 'AIM_DEAD'], vals: T.ctl },
    { title: 'Tamaño y lugar' },
    { rows: T.CTL_RANGES, keys: ['STICK_SIZE', 'BTN_SIZE'], vals: T.ctl },
    { buttons: [{ label: 'MOVER CONTROLES', onClick: () => editControls(true) }] },
  ], reset: () => { Object.assign(T.ctl, T.CTL_DEFAULTS); T.opts.scheme = 'stick'; T.opts.pos = {}; T.clear(true); resetKeys(ASSIST); } },
  { id: 'garfio', label: 'GARFIO', fields: [
    { choice: NAMES.map((n, k) => ({ id: n, label: `${k + 1} · ${n.toUpperCase()}`, hint: HINTS[n] })), get: () => active, set: v => useProfile(v as Profile) },
    { title: 'Liga' },
    { rows: RANGES, keys: ['HOOK_LEN', 'HOOK_TRAVEL', 'HOOK_K', 'HOOK_REST', 'HOOK_V', 'HOOK_DAMP', 'HOOK_JUMP'], vals: cfg },
    { title: 'Puntería' },
    { rows: RANGES, keys: ['HOOK_CONE', 'HOOK_MISS'], vals: cfg },
    { title: 'Salto con la liga', note: 'Coyote: cuadros después de soltar la liga de una superficie en que SALTO todavía suma el impulso de la liga (más fácil en el celular).' },
    { rows: RANGES, keys: ['HOOK_COYOTE'], vals: cfg },
    { title: 'Cargas' },
    { rows: RANGES, keys: ['HOOK_N', 'HOOK_CD', 'HOOK_GROUND', 'HOOK_REFUND', 'ORB_T'], vals: cfg },
  ], reset: () => { profs[active] = { ...PROFILES[active] }; Object.assign(cfg, profs[active]); cfg.ORB_T = DEFAULTS.ORB_T; cfg.HOOK_COYOTE = DEFAULTS.HOOK_COYOTE; } },
  { id: 'movimiento', label: 'MOVIMIENTO', fields: [
    { title: 'Carrera' },
    { rows: RANGES, keys: MOVE.slice(0, 4), vals: cfg },
    { title: 'Salto' },
    { rows: RANGES, keys: MOVE.slice(4, 9), vals: cfg },
    { title: 'Doble salto', note: 'En el aire (pasado el coyote), SALTO sube esta altura sin tocar la velocidad horizontal ni quitar subida si ya subías más rápido. Vuelven al tocar suelo (o pararte en un dummy). Enganchado a un dummy, SALTO salta sin soltar la liga.' },
    { rows: RANGES, keys: MOVE.slice(11), vals: cfg },
    { title: 'Tolerancias', note: 'Coyote: cuadros en el aire en que todavía se salta. Buffer: cuadros antes de aterrizar en que un SALTO cuenta (si no quedan saltos en el aire).' },
    { rows: RANGES, keys: MOVE.slice(9, 11), vals: cfg },
  ], reset: () => resetKeys(MOVE) },
  { id: 'ataque', label: 'ATAQUE', fields: [
    { title: 'Golpe de ATAQUE', note: 'ATAQUE sin liga en un dummy es un golpe: ligero hacia donde mirás; ↑ + ATAQUE = pesado arriba; ↓ en el aire + ATAQUE = picada con pesado abajo. Empuja al dummy con el empuje base más tu rapidez a favor del golpe (sin frenarte), lo congela un momento y lo deja LANZADO. Con la liga enganchada a un dummy, ATAQUE es el modo ancla.' },
    { rows: RANGES, keys: GOLPE.slice(0, 4), vals: cfg },
    { rows: RANGES, keys: GOLPE.slice(4), vals: cfg },
    { title: 'Lanzar', note: 'Soltar ATAQUE con la liga en un dummy lo lanza hacia la mira: a esta rapidez (los pesados, más lento) más la que ya llevaba a favor de la mira. Un toque es lanzarlo; la flecha naranja dice hacia dónde y a cuánto.' },
    { rows: RANGES, keys: ATTACK.slice(0, 1), vals: cfg },
    { title: 'Modo ancla (ATAQUE mantenido)', note: 'Con la liga en un dummy, mantener ATAQUE te vuelve el ancla: pesás esto para la liga (el liviano viene sin frenarte) y la mira empuja al dummy, que gira a tu alrededor como un péndulo; lo que golpea, golpea como LANZADO. Más rápido que el tope (respecto de vos), la mira solo lo gira. ATAQUE sostiene la liga aunque sueltes GARFIO (deslizar de GARFIO a ATAQUE se la pasa); apretar GARFIO otra vez la suelta sin lanzar.' },
    { rows: RANGES, keys: ATTACK.slice(1, 5), vals: cfg },
    { title: 'A la par', note: 'Mientras mantenés ATAQUE, con o sin liga, los dummies pasan a la par: no chocan con vos (entre ellos sí).' },
    { title: 'Golpes', note: 'Lo LANZADO se lastima al chocar según cuánto cambia su velocidad por encima del umbral; el golpeado así también queda LANZADO.' },
    { rows: RANGES, keys: ATTACK.slice(5), vals: cfg },
  ], reset: () => resetKeys([...GOLPE, ...ATTACK]) },
  { id: 'patio', label: 'PATIO', fields: [
    { title: 'Ir a', note: 'Reinicia todo (también los dummies) en ese lugar. R reinicia en el último elegido.' },
    { buttons: SPOTS.map(([label, x]) => ({ label, onClick: () => { reset(x); menu.close(); } })) },
    { title: 'Probar', note: 'LÁNZAME UNO (o L): un liviano sale LANZADO hacia vos desde 14 m. Para dejarlo pasar a la par (ATAQUE mantenido), engancharlo y devolverlo.' },
    { buttons: [{ label: 'LÁNZAME UNO', onClick: () => { menu.close(); pitch(); } }] },
    { title: 'Dummies: peso', note: 'Masa × la del héroe. La liga tira de las dos puntas repartida por masa: el liviano viene, el pesado te lleva.' },
    { rows: RANGES, keys: DUMMY.slice(0, 3), vals: cfg },
    { title: 'Dummies' },
    { rows: RANGES, keys: DUMMY.slice(3), vals: cfg },
  ], reset: () => resetKeys(DUMMY) },
  { id: 'camara', label: 'CÁMARA', fields: [
    { rows: CAM_RANGES, keys: Object.keys(CAM_RANGES), vals: camCfg },
  ], reset: () => Object.assign(camCfg, CAM_DEFAULTS) },
];
{ // toda clave tuneable tiene que estar en alguna pestaña
  const listed = new Set(SECTIONS.flatMap(sc => sc.fields.flatMap(f => 'keys' in f ? f.keys : [])));
  for (const k of [...Object.keys(RANGES), ...Object.keys(CAM_RANGES), ...Object.keys(T.CTL_RANGES)]) if (!listed.has(k)) console.warn(`ajuste sin pestaña: ${k}`);
}
const gear = document.getElementById('gear')!;
const menu = buildMenu(document.getElementById('menu')!, SECTIONS, {
  changed: saveAll,
  copy: () => JSON.stringify({ ...cfg, ...camCfg, ...T.ctl, ...T.opts, perfil: active, perfiles: profs }),
  onOpen: () => { gear.hidden = true; T.clear(); down.clear(); mouseHook = mouseAtk = false, mouseBtns = 0; },
  onClose: () => { gear.hidden = false; },
});
gear.onclick = () => menu.open();

// MOVER CONTROLES: el juego sigue en pausa; arriba, los tamaños y LISTO (vuelve al menú)
const editbar = document.getElementById('editbar')!;
rows(editbar.querySelector('.sizes')!, T.CTL_RANGES, ['STICK_SIZE', 'BTN_SIZE'], T.ctl, saveAll);
(editbar.querySelector('.def') as HTMLButtonElement).onclick = () => {
  T.opts.pos = {}, T.ctl.STICK_SIZE = T.CTL_DEFAULTS.STICK_SIZE, T.ctl.BTN_SIZE = T.CTL_DEFAULTS.BTN_SIZE;
  saveAll(), refresh();
};
(editbar.querySelector('.done') as HTMLButtonElement).onclick = () => editControls(false);
function editControls(on: boolean) {
  if (on) menu.close();
  T.setEditing(on);
  editbar.hidden = !on, hud.hidden = on, gear.hidden = on;
  if (!on) menu.open('controles');
}
const paused = () => menu.isOpen() || T.isEditing();
T.bind(cv, saveAll);

// Teclado: ←/→ A/D corren, las flechas y WASD también apuntan, espacio salta, K o Shift = GARFIO (mantener), J = ATAQUE,
// L = lanzame uno.
// Un botón apretado y soltado entre dos cuadros también cuenta (tapped). Esc abre y cierra AJUSTES.
const down = new Set<string>();
const JUMP = ['Space'], HOOK = ['KeyK', 'ShiftLeft', 'ShiftRight'], ATK = ['KeyJ'];
const DIRS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
let tapped = false, hookTapped = false, atkTapped = false;
addEventListener('keydown', e => {
  if (e.code === 'Escape') { if (T.isEditing()) editControls(false); else menu.toggle(); return; }
  if (paused() || e.target instanceof HTMLInputElement) return;
  if (JUMP.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  down.add(e.code);
  if (JUMP.includes(e.code)) tapped = true;
  if (HOOK.includes(e.code)) hookTapped = true;
  if (ATK.includes(e.code)) atkTapped = true;
  if (DIRS.includes(e.code)) mouseAim = false;
  if (e.code === 'KeyR') reset(spot);
  if (e.code === 'KeyL') pitch();
  const n = NAMES[+e.key - 1];
  if (n && e.code.startsWith('Digit')) useProfile(n);
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('blur', () => { down.clear(); mouseHook = mouseAtk = false, mouseBtns = 0; });
const has = (...codes: string[]) => codes.some(c => down.has(c));

// Ratón: si se mueve, apunta desde la mano hacia el cursor; clic izquierdo = GARFIO y derecho = ATAQUE (provisorio: el
// spec deja el izquierdo para ATAQUE y el derecho para HERRAMIENTA). Los botones salen de e.buttons: con uno apretado,
// el segundo no da pointerdown sino pointermove. Se aprietan sobre el lienzo; fuera de él (menú) solo se sueltan.
let mouse = { x: 0, y: 0 }, mouseAim = false, mouseHook = false, mouseAtk = false, mouseBtns = 0;
function mouseButtons(e: PointerEvent, canvas: boolean) {
  if (e.pointerType !== 'mouse') return;
  const b = canvas && !T.isEditing() ? e.buttons : e.buttons & mouseBtns, rise = b & ~mouseBtns;
  if (rise & 1) hookTapped = true;
  if (rise & 2) atkTapped = true;
  mouseHook = !!(b & 1), mouseAtk = !!(b & 2), mouseBtns = b;
}
addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY }, mouseAim = true;
  mouseButtons(e, e.target === cv);
});
addEventListener('pointerup', e => mouseButtons(e, e.target === cv));
cv.addEventListener('pointerdown', e => mouseButtons(e, true));
cv.addEventListener('contextmenu', e => e.preventDefault());

// De un punto de la pantalla al vector desde la mano (ratón y esquema TOCAR)
const cam = newCam();
const worldAim = (x: number, y: number): [number, number] =>
  [cam.cx + (x - innerWidth / 2) / cam.k - s.p.x, cam.cy - (y - innerHeight / 2) / cam.k - s.p.y - HAND];
// Mira: la táctil si algún dedo apunta, si no el ratón si se movió, si no las flechas
function aim(): [number, number] {
  const t = T.touchAim(worldAim);
  if (t) return t;
  if (mouseAim) return worldAim(mouse.x, mouse.y);
  return [+has('ArrowRight', 'KeyD') - +has('ArrowLeft', 'KeyA'), +has('ArrowUp', 'KeyW') - +has('ArrowDown', 'KeyS')];
}

function input(): Input {
  const t = T.touchInput(worldAim);
  const x = +has('ArrowRight', 'KeyD') - +has('ArrowLeft', 'KeyA') + t.x;
  const jump = tapped || has(...JUMP) || t.jump, hook = hookTapped || mouseHook || has(...HOOK) || t.hook;
  const atk = atkTapped || mouseAtk || has(...ATK) || t.atk;
  tapped = hookTapped = atkTapped = false;
  const [ax, ay] = t.aim ?? aim();
  return { x: Math.min(Math.max(x, -1), 1), jump, hook, atk, ax, ay };
}

let s: State, prev = { x: 0, y: 0 }, prevD: { x: number, y: number }[] = [], simMs = 0, spot = 0;
// Medición para calibrar: rastro de posiciones, último vuelo, última liga (rapidez máxima enganchado y al soltar) y
// último golpe a un dummy
const trail: { x: number, y: number, c: string }[] = [];
let air: { x: number, y: number, top: number, t: number } | null = null, lastJump = '';
let hookMax = 0, lastHook = '', lastHit = '', lastThrow = '';
// Reinicia todo con el héroe en el piso de x (AJUSTES → PATIO elige el lugar; R vuelve al último)
function reset(x = spot) {
  T.clear(true);
  s = init(PATIO, cfg);
  spot = s.p.x = x;
  prev = { x: s.p.x, y: s.p.y }, prevD = s.d.map(d => ({ x: d.x, y: d.y }));
  trail.length = 0, air = null, cam.vx = cam.vy = 0, lastHit = lastThrow = '';
}
reset();

// Para probar devolver: un liviano entero (no el enganchado) sale LANZADO hacia el héroe desde 14 m adelante y 3 m arriba
// (o desde atrás, si adelante hay pared o no se ve), en un arco que llega a donde está en 0,6 s
function pitch() {
  const p = s.p, g = 2 * cfg.JUMP_H / cfg.JUMP_T ** 2, T = 0.6;
  const k = s.d.findIndex((d, j) => PATIO.dummies![j].kind === 'liviano' && d.hp > 0 && p.hook?.e !== j);
  if (k < 0) return;
  const { hw, h } = size(PATIO, k), ty = p.y + (H - h) / 2;
  for (const side of [p.face, -p.face]) {
    const x = p.x + side * 14, y = p.y + 3, dx = p.x - x, dy = ty - y, n = Math.sqrt(dx * dx + dy * dy);
    if (PATIO.rects.some(r => x + hw > r.x0 && x - hw < r.x1 && y + h > r.y0 && y < r.y1)) continue;
    if (raycast(PATIO.rects, x, y + h / 2, dx / n, dy / n, n)[0] >= 0) continue;
    Object.assign(s.d[k], { x, y, vx: (p.x - x) / T, vy: (ty - y) / T + g * T / 2, lz: true, ground: false });
    prevD[k] = { x, y };
    return;
  }
}

const speed = () => Math.sqrt(s.p.vx * s.p.vx + s.p.vy * s.p.vy);
function tick(i: Input) {
  prev = { x: s.p.x, y: s.p.y }, prevD = s.d.map(d => ({ x: d.x, y: d.y }));
  const hooked = attached(s.p, s.t), hp = s.d.map(d => ({ hp: d.hp, v: Math.sqrt(d.vx * d.vx + d.vy * d.vy) })), t0 = performance.now();
  const held = hooked && s.p.hook!.e >= 0 && s.p.atkHeld ? s.p.hook!.e : -1; // soltar ATAQUE lo va a lanzar
  step(s, PATIO, i, cfg);
  if (held >= 0 && !s.p.hook && !i.atk && s.d[held].hp > 0)
    lastThrow = `lanzó: ${PATIO.dummies![held].kind} a ${Math.sqrt(s.d[held].vx ** 2 + s.d[held].vy ** 2).toFixed(1)} m/s`;
  s.d.forEach((d, k) => {
    if (d.hp < hp[k].hp && d.hitT === s.t) lastHit = `golpe: ${PATIO.dummies![k].kind} a ${hp[k].v.toFixed(1)} m/s · −${(hp[k].hp - d.hp).toFixed(0)} hp${d.hp <= 0 ? ' · ROTO' : ` · quedan ${d.hp.toFixed(0)}`}`;
  });
  T.afterTick(!!s.p.hook);
  simMs += (performance.now() - t0 - simMs) * 0.05;
  const p = s.p;
  const on = attached(p, s.t);
  trail.push({ x: p.x, y: p.y, c: on ? '#5ec8ff' : p.ground ? '#8a8f94' : '#ffd84a' });
  if (trail.length > 240) trail.shift();
  if (!p.ground && !air) air = { x: prev.x, y: prev.y, top: p.y, t: s.t - 1 };
  if (air) air.top = Math.max(air.top, p.y);
  if (p.ground && air) {
    lastJump = `vuelo: ${(air.top - air.y).toFixed(2)} m alto · ${Math.abs(p.x - air.x).toFixed(2)} m largo · ${s.t - air.t} cuadros`;
    air = null;
  }
  if (on && !hooked) hookMax = 0;
  if (on) hookMax = Math.max(hookMax, speed());
  if (!on && hooked) lastHook = `liga: máx ${hookMax.toFixed(1)} m/s · suelta a ${speed().toFixed(1)} m/s`;
}

// Color de la mira según lo que hará la liga con la velocidad actual: verde acelera, amarillo columpia, rojo frena
function effect(dx: number, dy: number): string {
  const v = speed();
  if (v < 2) return '#f2f2e8';
  const cos = (dx * s.p.vx + dy * s.p.vy) / v;
  return cos > 0.5 ? '#6bd66b' : cos < -0.5 ? '#ff6b5b' : '#ffe14a';
}
function draw(a: number, dt: number) {
  const dpr = devicePixelRatio || 1, W = innerWidth, Hh = innerHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) cv.width = Math.round(W * dpr), cv.height = Math.round(Hh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const p = s.p, px = prev.x + (p.x - prev.x) * a, py = prev.y + (p.y - prev.y) * a;
  follow(cam, px, py, p.vx, p.vy, dt, W, Hh, camCfg);
  const { cx, cy, k } = cam;
  const X = (x: number) => W / 2 + (x - cx) * k, Y = (y: number) => Hh / 2 - (y - cy) * k;

  ctx.fillStyle = '#1b1a1f';
  ctx.fillRect(0, 0, W, Hh);
  // Rejilla de 1 m (más marcada cada 5 m) para medir a ojo
  ctx.lineWidth = 1;
  for (let x = Math.ceil(cx - W / 2 / k); x < cx + W / 2 / k; x++) {
    ctx.strokeStyle = x % 5 === 0 ? '#3a3740' : '#25242a';
    ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), Hh); ctx.stroke();
  }
  for (let y = Math.ceil(cy - Hh / 2 / k); y < cy + Hh / 2 / k; y++) {
    ctx.strokeStyle = y % 5 === 0 ? '#3a3740' : '#25242a';
    ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke();
  }
  ctx.fillStyle = '#5b5866';
  for (const r of PATIO.rects) ctx.fillRect(X(r.x0), Y(r.y1), (r.x1 - r.x0) * k, (r.y1 - r.y0) * k);
  PATIO.orbs?.forEach(([ox, oy], j) => {
    const on = s.t >= s.orbs[j];
    ctx.strokeStyle = ctx.fillStyle = on ? '#b98cff' : '#b98cff33';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(ox), Y(oy), ORB_R * k, 0, 2 * Math.PI); on ? ctx.fill() : ctx.stroke();
  });
  for (const t of trail) {
    ctx.fillStyle = t.c;
    ctx.fillRect(X(t.x) - 1.5, Y(t.y) - 1.5, 3, 3);
  }

  // Dummies (interpolados): enganchado = borde del color de la liga, LANZADO = naranja, golpe = destello blanco; vida
  // arriba si le falta. Roto: contorno punteado donde va a reaparecer. Las etiquetas van después del héroe (encima).
  const dpos = (j: number) => {
    const d = s.d[j], q = prevD[j] ?? d;
    return { x: q.x + (d.x - q.x) * a, y: q.y + (d.y - q.y) * a };
  };
  const tags: [string, string, number, number][] = [];
  s.d.forEach((d, j) => {
    const { hw, h } = size(PATIO, j), f = PATIO.dummies![j];
    if (d.hp <= 0) {
      ctx.strokeStyle = '#f2f2e830';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(X(f.x - hw), Y(f.y + h), 2 * hw * k, h * k);
      ctx.setLineDash([]);
      return;
    }
    const q = dpos(j), x0 = X(q.x - hw), y0 = Y(q.y + h), ww = 2 * hw * k, hh = h * k;
    const flash = s.t - d.hitT < 6, hooked = p.hook?.e === j && attached(p, s.t);
    ctx.fillStyle = flash ? '#ffffff' : d.lz ? '#ff9a5b' : f.kind === 'liviano' ? '#b08d5a' : f.kind === 'mediano' ? '#8e95a3' : '#6e5a80';
    ctx.fillRect(x0, y0, ww, hh);
    if (hooked) { ctx.strokeStyle = '#5ec8ff'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, ww, hh); }
    let top = y0 - 3;
    if (d.hp < D_HP) {
      ctx.fillStyle = '#000a';
      ctx.fillRect(x0, top - 4, ww, 4);
      ctx.fillStyle = '#6bd66b';
      ctx.fillRect(x0, top - 4, ww * d.hp / D_HP, 4);
      top -= 6;
    }
    const tag = hooked && p.anchor ? 'PÉNDULO' : d.lz ? 'LANZADO' : hooked ? 'ANCLADO' : '';
    if (tag) tags.push([tag, d.lz ? '#ff9a5b' : '#5ec8ff', X(q.x), top]);
  });

  // Golpe activo: la caja donde pega (atkBox, la misma que usa la sim), con el héroe en su posición interpolada
  const gb = atkBox({ ...p, x: px, y: py }, cfg, s.t);
  if (gb) ctx.fillStyle = '#ff9a5b59', ctx.fillRect(X(gb.x0), Y(gb.y1), (gb.x1 - gb.x0) * k, (gb.y1 - gb.y0) * k);

  // Liga: tensa más gruesa; floja, tenue. La punta en viaje va de donde salió hacia el ancla (en el tiempo
  // interpolado del render); un disparo fallido viaja todo el alcance y se desvanece unos cuadros.
  const hx = X(px), hy = Y(py + HAND), on = attached(p, s.t), st = p.shot, tr = s.t - 1 + a;
  const tip = (sh: NonNullable<typeof st>) => {
    const f = Math.min(1, Math.max(0, (tr - sh.t) / Math.max(1, sh.at - sh.t)));
    return [X(sh.ox + (sh.x - sh.ox) * f), Y(sh.oy + (sh.y - sh.oy) * f)];
  };
  if (p.hook && !on && st) {
    const [tx, ty] = tip(st);
    ctx.strokeStyle = '#e8c07a99';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = '#e8c07a';
    ctx.beginPath(); ctx.arc(tx, ty, 3, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = '#e8c07a55';
    ctx.beginPath(); ctx.arc(X(st.x), Y(st.y), 6, 0, 2 * Math.PI); ctx.stroke();
  } else if (p.hook) {
    const e = p.hook.e >= 0 ? dpos(p.hook.e) : null, ax = e ? e.x + p.hook.ox : p.hook.x, ay = e ? e.y + p.hook.oy : p.hook.y;
    const d = Math.sqrt((ax - px) ** 2 + (ay - py - HAND) ** 2);
    ctx.strokeStyle = d > p.hook.rest ? '#e8c07a' : '#e8c07a77';
    ctx.lineWidth = d > p.hook.rest ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(X(ax), Y(ay)); ctx.stroke();
    ctx.fillStyle = '#e8c07a';
    ctx.beginPath(); ctx.arc(X(ax), Y(ay), 4, 0, 2 * Math.PI); ctx.fill();
    if (e && on) {
      // Lanzar (soltar ATAQUE): flecha naranja desde la mano hacia la mira, de largo = 0,1 s de vuelo, con la rapidez
      // (throwVel, lo mismo que usa la sim). Más gruesa en modo ancla.
      const [ax2, ay2] = aim(), [vx, vy] = throwVel(PATIO, s, { x: 0, jump: false, ax: ax2, ay: ay2 }, cfg);
      const v = Math.sqrt(vx * vx + vy * vy), tx = hx + vx * 0.1 * k, ty = hy - vy * 0.1 * k, ux = vx / v, uy = -vy / v, hd = 8;
      ctx.strokeStyle = ctx.fillStyle = p.anchor ? '#ff9a5b' : '#ff9a5b88';
      ctx.lineWidth = p.anchor ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx + ux * hd, ty + uy * hd);
      ctx.lineTo(tx - uy * hd * 0.6, ty + ux * hd * 0.6); ctx.lineTo(tx + uy * hd * 0.6, ty - ux * hd * 0.6); ctx.fill();
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${v.toFixed(0)} m/s`, tx + ux * 26, ty + uy * 18);
    }
  } else if (st && !st.hit && tr - st.at < 8) {
    const [tx, ty] = tip(st);
    ctx.strokeStyle = `rgba(232,192,122,${Math.min(1, 1 - (tr - st.at) / 8)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
  }
  if (!p.hook || T.dragging()) {
    // Alcance (círculo de rayas), cono de gracia y mira: dónde se pegaría la liga si se aprieta ahora (hookTarget,
    // lo mismo que usa la simulación; enganchado, solo mientras ARRASTRAR apunta la siguiente). Con la gracia o el
    // imán, la línea va a donde se pegaría y la mira original queda tenue.
    const [ax, ay] = aim(), i = { x: 0, jump: false, ax, ay }, [dx, dy] = aimDir(p, i, cfg), R = cfg.HOOK_LEN;
    const g = hookTarget(PATIO, s, i, cfg), ready = s.t + 1 >= p.hookT && p.charge >= 1;
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#f2f2e838';
    ctx.beginPath(); ctx.arc(hx, hy, R * k, 0, 2 * Math.PI); ctx.stroke();
    if (cfg.HOOK_CONE > 0) {
      const c = Math.cos(cfg.HOOK_CONE * Math.PI / 180), sn = Math.sin(cfg.HOOK_CONE * Math.PI / 180);
      ctx.beginPath();
      for (const sg of [-1, 1]) ctx.moveTo(hx, hy), ctx.lineTo(X(p.x + (dx * c - sg * dy * sn) * R), Y(p.y + HAND + (dy * c + sg * dx * sn) * R));
      ctx.stroke();
    }
    const ex = g ? X(g.x) : X(p.x + dx * R), ey = g ? Y(g.y) : Y(p.y + HAND + dy * R);
    ctx.strokeStyle = '#f2f2e840';
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    if (g) {
      const gx = g.x - p.x, gy = g.y - p.y - HAND, gn = Math.sqrt(gx * gx + gy * gy) || 1;
      ctx.strokeStyle = ctx.fillStyle = ready ? effect(gx / gn, gy / gn) : '#f2f2e855';
      ctx.lineWidth = 2;
      if (g.grace) ctx.setLineDash([4, 3]); // de gracia: anillo punteado
      ctx.beginPath(); ctx.arc(ex, ey, 8, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, 2 * Math.PI); ctx.fill();
      if (g.e >= 0) { // a un dummy: corchetes de amenaza alrededor
        const { hw, h } = size(PATIO, g.e), q = dpos(g.e), m = 4, x0 = X(q.x - hw) - m, x1 = X(q.x + hw) + m, y0 = Y(q.y + h) - m, y1 = Y(q.y) + m, c = 6;
        ctx.strokeStyle = '#ff9a5b';
        ctx.beginPath();
        for (const [x, sx] of [[x0, 1], [x1, -1]]) for (const [y, sy] of [[y0, 1], [y1, -1]])
          ctx.moveTo(x + sx * c, y), ctx.lineTo(x, y), ctx.lineTo(x, y + sy * c);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#f2f2e840';
      ctx.beginPath(); ctx.moveTo(ex - 5, ey - 5); ctx.lineTo(ex + 5, ey + 5); ctx.moveTo(ex + 5, ey - 5); ctx.lineTo(ex - 5, ey + 5); ctx.stroke();
    }
  }
  // Héroe: celeste enganchado, blanco en el suelo, amarillo en el aire; con ATAQUE mantenido (a la par), translúcido y con
  // contorno punteado. Debajo de los pies, en el aire, un triángulo por cada salto en el aire que queda.
  ctx.fillStyle = ctx.strokeStyle = on ? '#5ec8ff' : p.ground ? '#f2f2e8' : '#ffd84a';
  if (p.atkHeld) {
    ctx.globalAlpha = 0.35;
    ctx.fillRect(X(px - HW), Y(py + H), 2 * HW * k, H * k);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(X(px - HW), Y(py + H), 2 * HW * k, H * k);
    ctx.setLineDash([]);
  } else ctx.fillRect(X(px - HW), Y(py + H), 2 * HW * k, H * k);
  if (!p.ground) for (let j = 0; j < p.air; j++) {
    const cx = X(px) + (j - (p.air - 1) / 2) * 10, cy = Y(py) + 9;
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 4, cy + 3); ctx.lineTo(cx - 4, cy + 3); ctx.fill();
  }
  // Cargas sobre la cabeza: llenas, la que se recarga como arco; verdes un momento si soltar rápido devolvió una
  const n = cfg.HOOK_N, pr = Math.max(3, 0.12 * k), gap = 3 * pr, refund = s.t - p.refundT < 20;
  for (let j = 0; j < n; j++) {
    const cx = X(px) + (j - (n - 1) / 2) * gap, cy = Y(py + H) - 2.5 * pr, f = Math.min(1, Math.max(0, p.charge - j));
    ctx.strokeStyle = '#f2f2e888';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = refund ? '#6bd66b' : '#e8c07a';
    if (f >= 1) { ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 2 * Math.PI); ctx.fill(); }
    else if (f > 0) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, pr, -Math.PI / 2, -Math.PI / 2 + f * 2 * Math.PI); ctx.fill(); }
  }

  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1b1a1f';
  for (const [tag, color, x, y] of tags) ctx.strokeText(tag, x, y), ctx.fillStyle = color, ctx.fillText(tag, x, y);

  T.draw(ctx, on && !!p.hook && p.hook.e >= 0);

  const scheme = T.SCHEMES.find(o => o.id === T.opts.scheme)!.label;
  const assist = [cfg.AIM_FOE > 0.5 && 'imán enemigos', cfg.AIM_EDGE > 0.5 && 'imán esquinas', cfg.AIM_16 > 0.5 && '16 dir.'].filter(Boolean).join(' · ');
  hud.textContent = `HYPERFLOWGEON · F1 paso E · ⚙ o Esc: ajustes (PATIO: ir al corral)${T.visible() ? `
apuntar: ${scheme}${T.opts.scheme === 'drag' ? ' · arrastrar desde GARFIO y soltar · tocar GARFIO o SALTO suelta' : T.opts.scheme === 'tap' ? ' · tocar el mundo (mantener)' : ' · GARFIO (mantener) · deslizar a SALTO = soltar con impulso'}
ATAQUE: golpe (joystick ↑ = pesado arriba; ↓ en el aire = picada) · mantener = a la par (y, con la liga en un dummy, modo ancla: deslizar de GARFIO a ATAQUE) · soltar = lanzar` : ` · R reiniciar · L lanzame uno
teclado: ←/→ A/D correr · espacio saltar (y doble salto) · flechas/WASD apuntan · K o Shift garfio (mantener) · 1/2/3 perfil
J ataque: golpe (con ↑ pesado arriba; con ↓ en el aire, picada) · mantener = a la par (y, con la liga en un dummy, modo ancla: la mira lo empuja) · soltar = lanzar · K otra vez = soltar sin lanzar
ratón: moverlo apunta · clic izq. garfio · clic der. ataque`}
garfio ${active.toUpperCase()} · cargas ${p.charge.toFixed(1)}/${cfg.HOOK_N}${assist ? ` · ${assist}` : ''}
vx ${p.vx.toFixed(2).padStart(6)}   vy ${p.vy.toFixed(2).padStart(6)}   |v| ${speed().toFixed(1).padStart(5)}   ${on ? (p.anchor ? 'ancla' : p.hook!.e >= 0 ? 'liga→dummy' : 'liga ') : p.hook ? 'viaje' : p.ground ? 'suelo' : 'aire '}${p.atkHeld ? ' · a la par' : ''}   saltos aire ${p.air}/${cfg.AIR_JUMPS}   sim ${simMs.toFixed(3)} ms
${lastJump}
${lastHook}
${lastThrow}
${lastHit}`;
}

let acc = 0, last = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1); // tras una pausa larga no recupera más de 6 cuadros
  acc += dt, last = now;
  if (paused()) acc = 0; // AJUSTES o MOVER CONTROLES abiertos
  while (acc >= DT) tick(input()), acc -= DT;
  draw(acc / DT, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(t => { last = t; frame(t); });

// Depuración: __hfg.advance(n, entrada) simula n cuadros sin rAF
Object.assign(window, {
  __hfg: { state: () => s, cfg, camCfg, cam, reset, menu, advance: (n: number, i: Input = { x: 0, jump: false }) => { for (let k = 0; k < n; k++) tick(i); return s; } },
});
