import { init, step, aimDir, hookTarget, attached, DT, HW, H, HAND, ORB_R, type Input, type State } from './sim/sim.ts';
import { RANGES, DEFAULTS, PROFILES, HOOK_KEYS, type Cfg, type HookCfg, type Profile } from './sim/params.ts';
import { PATIO } from './patio.ts';
import { CAM_RANGES, CAM_DEFAULTS, newCam, follow, type CamCfg } from './camera.ts';
import { buildMenu, rows, refresh, type Section } from './menu.ts';
import * as T from './touch.ts';

// HYPERFLOWGEON · F1 paso C: auto-aim y táctil, en gris. Paso fijo de 60 Hz con render interpolado.
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
  for (const b of ['stick', 'jump', 'hook'] as const) {
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
const MOVE = ['RUN', 'ACC', 'DEC', 'AIR', 'JUMP_H', 'JUMP_T', 'JUMP_CUT', 'FALL_G', 'MAX_FALL', 'COYOTE', 'BUFFER'] as const;
const ASSIST = ['AIM_EDGE', 'AIM_16', 'AIM_UP'] as const;
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
    { title: 'Asistencia de puntería', note: 'Imán: dentro del cono, las esquinas ganan a las superficies. 16 direcciones: la regla de PVP (ratón, joystick y teclado apuntan igual). El ancho del cono es de cada perfil (GARFIO → Puntería).' },
    { rows: RANGES, keys: ASSIST, vals: cfg },
    { title: 'Joystick' },
    { rows: T.CTL_RANGES, keys: ['STICK_DEAD', 'STICK_FULL', 'AIM_DEAD'], vals: T.ctl },
    { title: 'Tamaño y lugar' },
    { rows: T.CTL_RANGES, keys: ['STICK_SIZE', 'BTN_SIZE'], vals: T.ctl },
    { button: 'MOVER CONTROLES', onClick: () => editControls(true) },
  ], reset: () => { Object.assign(T.ctl, T.CTL_DEFAULTS); T.opts.scheme = 'stick'; T.opts.pos = {}; T.clear(true); resetKeys(ASSIST); } },
  { id: 'garfio', label: 'GARFIO', fields: [
    { choice: NAMES.map((n, k) => ({ id: n, label: `${k + 1} · ${n.toUpperCase()}`, hint: HINTS[n] })), get: () => active, set: v => useProfile(v as Profile) },
    { title: 'Liga' },
    { rows: RANGES, keys: ['HOOK_LEN', 'HOOK_TRAVEL', 'HOOK_K', 'HOOK_REST', 'HOOK_V', 'HOOK_DAMP', 'HOOK_JUMP'], vals: cfg },
    { title: 'Puntería' },
    { rows: RANGES, keys: ['HOOK_CONE', 'HOOK_MISS'], vals: cfg },
    { title: 'Cargas' },
    { rows: RANGES, keys: ['HOOK_N', 'HOOK_CD', 'HOOK_GROUND', 'HOOK_REFUND', 'ORB_T'], vals: cfg },
  ], reset: () => { profs[active] = { ...PROFILES[active] }; Object.assign(cfg, profs[active]); cfg.ORB_T = DEFAULTS.ORB_T; } },
  { id: 'movimiento', label: 'MOVIMIENTO', fields: [
    { title: 'Carrera' },
    { rows: RANGES, keys: MOVE.slice(0, 4), vals: cfg },
    { title: 'Salto' },
    { rows: RANGES, keys: MOVE.slice(4, 9), vals: cfg },
    { title: 'Tolerancias', note: 'Coyote: cuadros en el aire en que todavía se salta. Buffer: cuadros antes de aterrizar en que un SALTO cuenta.' },
    { rows: RANGES, keys: MOVE.slice(9), vals: cfg },
  ], reset: () => resetKeys(MOVE) },
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
  onOpen: () => { gear.hidden = true; T.clear(); down.clear(); mouseHook = false; },
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

// Teclado: ←/→ A/D corren, las flechas y WASD también apuntan, espacio salta, K o Shift = GARFIO (mantener).
// Un botón apretado y soltado entre dos cuadros también cuenta (tapped). Esc abre y cierra AJUSTES.
const down = new Set<string>();
const JUMP = ['Space'], HOOK = ['KeyK', 'ShiftLeft', 'ShiftRight'];
const DIRS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
let tapped = false, hookTapped = false;
addEventListener('keydown', e => {
  if (e.code === 'Escape') { if (T.isEditing()) editControls(false); else menu.toggle(); return; }
  if (paused() || e.target instanceof HTMLInputElement) return;
  if (JUMP.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  down.add(e.code);
  if (JUMP.includes(e.code)) tapped = true;
  if (HOOK.includes(e.code)) hookTapped = true;
  if (DIRS.includes(e.code)) mouseAim = false;
  if (e.code === 'KeyR') reset();
  const n = NAMES[+e.key - 1];
  if (n && e.code.startsWith('Digit')) useProfile(n);
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('blur', () => { down.clear(); mouseHook = false; });
const has = (...codes: string[]) => codes.some(c => down.has(c));

// Ratón: si se mueve, apunta desde la mano hacia el cursor; clic izquierdo = GARFIO (provisorio: el spec lo deja para ATAQUE)
let mouse = { x: 0, y: 0 }, mouseAim = false, mouseHook = false;
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY }, mouseAim = true; });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) mouseHook = false; });
cv.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0 && !T.isEditing()) mouseHook = hookTapped = true; });

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
  tapped = hookTapped = false;
  const [ax, ay] = t.aim ?? aim();
  return { x: Math.min(Math.max(x, -1), 1), jump, hook, ax, ay };
}

let s: State, prev = { x: 0, y: 0 }, simMs = 0;
// Medición para calibrar: rastro de posiciones, último vuelo y última liga (rapidez máxima enganchado y al soltar)
const trail: { x: number, y: number, c: string }[] = [];
let air: { x: number, y: number, top: number, t: number } | null = null, lastJump = '';
let hookMax = 0, lastHook = '';
function reset() { T.clear(true); s = init(PATIO, cfg); prev = { x: s.p.x, y: s.p.y }; trail.length = 0; air = null; cam.vx = cam.vy = 0; }
reset();

const speed = () => Math.sqrt(s.p.vx * s.p.vx + s.p.vy * s.p.vy);
function tick(i: Input) {
  prev = { x: s.p.x, y: s.p.y };
  const hooked = attached(s.p, s.t), t0 = performance.now();
  step(s, PATIO, i, cfg);
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
    const d = Math.sqrt((p.hook.x - px) ** 2 + (p.hook.y - py - HAND) ** 2);
    ctx.strokeStyle = d > p.hook.rest ? '#e8c07a' : '#e8c07a77';
    ctx.lineWidth = d > p.hook.rest ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(X(p.hook.x), Y(p.hook.y)); ctx.stroke();
    ctx.fillStyle = '#e8c07a';
    ctx.beginPath(); ctx.arc(X(p.hook.x), Y(p.hook.y), 4, 0, 2 * Math.PI); ctx.fill();
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
    const g = hookTarget(PATIO, p, i, cfg), ready = s.t + 1 >= p.hookT && p.charge >= 1;
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
    } else {
      ctx.strokeStyle = '#f2f2e840';
      ctx.beginPath(); ctx.moveTo(ex - 5, ey - 5); ctx.lineTo(ex + 5, ey + 5); ctx.moveTo(ex + 5, ey - 5); ctx.lineTo(ex - 5, ey + 5); ctx.stroke();
    }
  }
  ctx.fillStyle = on ? '#5ec8ff' : p.ground ? '#f2f2e8' : '#ffd84a';
  ctx.fillRect(X(px - HW), Y(py + H), 2 * HW * k, H * k);
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

  T.draw(ctx);

  const scheme = T.SCHEMES.find(o => o.id === T.opts.scheme)!.label, assist = [cfg.AIM_EDGE > 0.5 && 'imán', cfg.AIM_16 > 0.5 && '16 dir.'].filter(Boolean).join(' · ');
  hud.textContent = `HYPERFLOWGEON · F1 paso C · ⚙ o Esc: ajustes${T.visible() ? `
apuntar: ${scheme}${T.opts.scheme === 'drag' ? ' · arrastrar desde GARFIO y soltar · tocar GARFIO o SALTO suelta' : T.opts.scheme === 'tap' ? ' · tocar el mundo (mantener)' : ' · GARFIO (mantener) · deslizar a SALTO = soltar con impulso'}` : ` · R reiniciar
teclado: ←/→ A/D correr · espacio saltar · flechas/WASD apuntan · K o Shift garfio (mantener) · 1/2/3 perfil
ratón: moverlo apunta · clic garfio`}
garfio ${active.toUpperCase()} · cargas ${p.charge.toFixed(1)}/${cfg.HOOK_N}${assist ? ` · ${assist}` : ''}
vx ${p.vx.toFixed(2).padStart(6)}   vy ${p.vy.toFixed(2).padStart(6)}   |v| ${speed().toFixed(1).padStart(5)}   ${on ? 'liga ' : p.hook ? 'viaje' : p.ground ? 'suelo' : 'aire '}   sim ${simMs.toFixed(3)} ms
${lastJump}
${lastHook}`;
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
  __hfg: { state: () => s, cfg, camCfg, cam, reset, advance: (n: number, i: Input = { x: 0, jump: false }) => { for (let k = 0; k < n; k++) tick(i); return s; } },
});
