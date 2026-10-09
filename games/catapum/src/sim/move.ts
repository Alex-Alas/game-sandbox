// Movimiento de un jugador en un cuadro: lo que hace con el joystick, SALTO, DASH y GARFIO, contra el terreno.
// Puro: lo usan el anfitrión (step) y el invitado para predecir su propio personaje (net.ts).
// - Carrera con momentum: en el aire la entrada nunca le quita velocidad a favor (HYPERFLOWGEON).
// - Salto con coyote, buffer y corte al soltar; doble salto; pared: deslizar y salto de pared (sin volver a la
//   pared por WJ_LOCK cuadros).
// - DASH en 8 direcciones (invulnerable al empezar). Dash + SALTO en el suelo = SUPER; dash ↙/↘ que toca el suelo =
//   WAVEDASH (barrida rápida); SALTO en una barrida rápida = HYPER (salto largo y bajo). Dash ↓ en el aire = PICADA.
// - ↓ corriendo = BARRIDA (conserva el impulso); ↓ en el aire = caída rápida.
// - GARFIO: la liga de HYPERFLOWGEON (una fuerza central que solo tira, con tope de rapidez). Se pega al terreno, a
//   rivales y a objetos (la fuerza se reparte por masa). SALTO enganchado al terreno suelta con impulso; DASH
//   enganchado a un rival o un objeto lo LANZA hacia vos y más allá.
import { CELL, AIR, cell, sweepX, sweepY, boxFree, raycast } from './terrain.ts';
import { charOf } from './chars.ts';
import { HZ, DT, NEVER, HW, H, HC, HAND_Y, PROP_M, PROP_HW, PROP_H, approach, gravity, ev, trick, height,
  type State, type World, type Pl, type Input, type Hook, type Prop } from './state.ts';
import { hurt } from './combat.ts';

const SLIDE_END = 1.5; // m/s: por debajo de esto la barrida se acabó
const CRAWL = 0.4;     // × la carrera: gatear bajo un techo bajo
const FALL_MASS = 0.6; // cuánto pesa la masa al caer: la gravedad de caída × (1 + (masa − 1) × esto): MUU cae más rápido, KUNAI flota
const dashing = (p: Pl, c: { DASH_F: number }, t: number) => t - p.dashT < c.DASH_F;
export const attached = (p: Pl, t: number) => !!p.hook && t >= p.hook.at;

// Fin del dash (se acabó o lo cortó el doble salto): queda a DASH_END en su dirección. Si ya iba más rápido que un dash
// (impulso de antes), se queda como está.
function dashEnd(p: Pl, c: { DASH_V: number, DASH_END: number }) {
  const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (sp > c.DASH_END && sp <= c.DASH_V + 0.1) {
    const k = c.DASH_END / sp;
    p.vx *= k, p.vy *= p.ddy > 0 ? k * 0.75 : k;
  }
}

function entOf(s: State, h: Hook): Pl | Prop | undefined {
  if (h.ek === 0) { const q = s.pl[h.e]; return q && q.alive ? q : undefined; }
  return s.props.find(o => o.id === h.e && !o.dead);
}

// Mira de la liga: la mira si hay; si no, el joystick; si no, adelante y arriba (45°)
export function hookAim(p: Pl, i: Input): [number, number] {
  let x = i.ax, y = i.ay;
  if (x * x + y * y < 0.02) x = i.x, y = i.y;
  if (x * x + y * y < 0.08) x = p.face, y = 1;
  const n = Math.sqrt(x * x + y * y);
  return [x / n, y / n];
}

// Rayo contra una caja (método de las franjas): distancia o −1
function rayBox(ox: number, oy: number, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number, max: number) {
  let t0 = 0, t1 = max;
  if (Math.abs(dx) < 1e-9) { if (ox <= x0 || ox >= x1) return -1; } else {
    const a = (x0 - ox) / dx, b = (x1 - ox) / dx;
    t0 = Math.max(t0, Math.min(a, b)), t1 = Math.min(t1, Math.max(a, b));
  }
  if (Math.abs(dy) < 1e-9) { if (oy <= y0 || oy >= y1) return -1; } else {
    const a = (y0 - oy) / dy, b = (y1 - oy) / dy;
    t0 = Math.max(t0, Math.min(a, b)), t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? t0 : -1;
}

// Dónde se pega la liga (lo usan la sim y la mira del dibujo). Prioridad: un rival u objeto que el rayo toque antes
// que el terreno > un rival visible dentro del cono de gracia (imán) > el terreno del rayo > el terreno más cercano en
// ángulo dentro del cono.
export type Target = { x: number, y: number, d: number, e: number, ek: number, ci: number, cj: number, grace: boolean };
export function hookTarget(s: State, w: World, p: Pl, i: Input): Target | null {
  const c = w.c, ch = charOf(p.ch), L = c.HOOK_LEN * ch.hookLen, ox = p.x, oy = p.y + HAND_Y;
  const [dx, dy] = hookAim(p, i);
  const ray = (rx: number, ry: number): Target | null => {
    const r = raycast(w.T, ox, oy, rx, ry, L);
    let best: Target | null = r.d >= 0 ? { x: ox + rx * r.d, y: oy + ry * r.d, d: r.d, e: -1, ek: 0,
      ci: Math.floor((ox + rx * (r.d + 0.02)) / CELL), cj: Math.floor((oy + ry * (r.d + 0.02)) / CELL), grace: false } : null;
    const lim = best ? best.d : L;
    for (const q of s.pl) {
      if (q === p || !q.alive) continue;
      const d = rayBox(ox, oy, rx, ry, q.x - HW, q.y, q.x + HW, q.y + height(q), lim);
      if (d >= 0 && (!best || d < best.d)) best = { x: ox + rx * d, y: oy + ry * d, d, e: q.id, ek: 0, ci: 0, cj: 0, grace: false };
    }
    for (const o of s.props) {
      if (o.dead) continue;
      const d = rayBox(ox, oy, rx, ry, o.x - PROP_HW, o.y, o.x + PROP_HW, o.y + PROP_H, best ? best.d : lim);
      if (d >= 0 && (!best || d < best.d)) best = { x: ox + rx * d, y: oy + ry * d, d, e: o.id, ek: 1, ci: 0, cj: 0, grace: false };
    }
    return best;
  };
  const direct = ray(dx, dy);
  if (direct && direct.e >= 0) return direct;
  const cone = Math.cos(c.HOOK_CONE * Math.PI / 180);
  let foe: Target | null = null, bestCos = cone;
  for (const q of s.pl) {
    if (q === p || !q.alive || (s.rules.teams && q.team === p.team)) continue;
    const vx = q.x - ox, vy = q.y + height(q) / 2 - oy, n = Math.sqrt(vx * vx + vy * vy);
    if (n < 0.3 || n > L) continue;
    const cs = (vx * dx + vy * dy) / n;
    if (cs <= bestCos) continue;
    const r = ray(vx / n, vy / n);
    if (r && r.ek === 0 && r.e === q.id) foe = { ...r, grace: true }, bestCos = cs;
  }
  if (foe) return foe;
  if (direct) return direct;
  for (let k = 3; k <= c.HOOK_CONE; k += 3) for (const sg of [1, -1]) {
    const a = sg * k * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const r = ray(dx * ca - dy * sa, dx * sa + dy * ca);
    if (r) return { ...r, grace: true };
  }
  return null;
}

function fire(s: State, w: World, p: Pl, i: Input) {
  const c = w.c, t = s.t, ch = charOf(p.ch), L = c.HOOK_LEN * ch.hookLen, ox = p.x, oy = p.y + HAND_Y;
  const travel = (d: number) => Math.ceil(c.HOOK_TRAVEL * HZ * d / L - 1e-9);
  const g = hookTarget(s, w, p, i);
  if (g) {
    const at = t + travel(g.d), e = g.e >= 0 ? (g.ek === 0 ? s.pl[g.e] : s.props.find(o => o.id === g.e)) : null;
    p.charge -= 1;
    p.shot = { x: g.x, y: g.y, ox, oy, t, at, hit: true };
    p.hook = { x: g.x, y: g.y, at, rest: 0, e: g.e, ek: g.ek, ox: e ? g.x - e.x : 0, oy: e ? g.y - e.y : 0, ci: g.ci, cj: g.cj };
  } else {
    const [dx, dy] = hookAim(p, i), at = t + travel(L);
    p.shot = { x: ox + dx * L, y: oy + dy * L, ox, oy, t, at, hit: false };
    p.hookT = at + c.HOOK_MISS;
  }
  ev(s, 'hook', { p: p.id, hit: !!g });
}

// DASH enganchado a un rival o a un objeto: lo lanza hacia vos (y más allá) y suelta la liga
function yank(s: State, w: World, p: Pl) {
  const c = w.c, h = p.hook!, e = entOf(s, h);
  p.hook = null;
  if (!e) return;
  const ex = e.x, ey = e.y + 0.5, vx = p.x - ex, vy = p.y + 0.6 - ey, n = Math.sqrt(vx * vx + vy * vy) || 1;
  const dx = vx / n, dy = vy / n + 0.35;
  if (h.ek === 0) hurt(s, w, e as Pl, { dmg: 5, kb: c.YANK_V, kg: 5, dx, dy, by: p.id });
  else {
    const o = e as Prop;
    o.vx = dx * c.YANK_V * 1.3, o.vy = dy * c.YANK_V * 1.3, o.o = p.id, o.ground = false;
  }
  p.dashCdT = s.t + Math.round(c.DASH_CD * HZ);
  trick(s, c, p, 'LANZADO');
}

export function movePlayer(s: State, w: World, p: Pl, i: Input) {
  const c = w.c, T = w.T, t = s.t, ch = charOf(p.ch), g = gravity(c);
  p.inX = i.x, p.inY = i.y;
  const jumpPress = i.jump && !p.held;
  if (jumpPress) { // tech: SALTO justo antes de pegar; apretar de nuevo antes de 40 cuadros lo anula (no vale machacar)
    p.pressT = t;
    if (t < p.stunT) p.techT = t - p.techT0 < 40 ? NEVER : t, p.techT0 = t;
  }
  p.held = i.jump;
  const dashPress = i.dash && !p.dashHeld;
  p.dashHeld = i.dash;
  if (t < p.stopT) { p.hookHeld = i.hook; return; } // hitstop: congelado (los botones igual se registran)
  const stunned = t < p.stunT;
  if (!stunned) p.tumble = false;

  // Nube de reaparición: quieto hasta que te muevas (o se acabe)
  if (t < p.cloudT) {
    if (jumpPress || dashPress || i.y < -0.5 || Math.abs(i.x) > 0.3 || i.hook || i.cast >= 0) p.cloudT = NEVER;
    else { p.vx = p.vy = 0, p.ground = true, p.groundT = t, p.air = ch.airJumps, p.dashN = ch.dashN, p.hookHeld = i.hook; return; }
  }
  if (!stunned && !p.atk) { if (i.x > 0.25) p.face = 1; else if (i.x < -0.25) p.face = -1; }

  // Liga: validar el ancla (terreno roto o enganchado que ya no está = se suelta)
  if (p.hook) {
    const h = p.hook;
    if (h.e < 0) { if (cell(T, h.ci, h.cj) === AIR) p.hook = null; }
    else { const e = entOf(s, h); if (!e) p.hook = null; else h.x = e.x + h.ox, h.y = e.y + h.oy; }
  }
  let dashUsed = false;
  if (stunned) p.hook = null;
  else {
    if (p.pressT === t && attached(p, t) && p.hook!.e < 0) { // SALTO enganchado al terreno: suelta con impulso
      const ground = t - p.groundT <= c.COYOTE + 1; // en el suelo solo suelta: el salto de siempre (es más fuerte que el impulso)
      p.hook = null;
      if (!ground) {
        p.vy += c.HOOK_JUMP, p.pressT = NEVER, p.rise = false;
        ev(s, 'jump', { p: p.id, j: 3 });
      }
    }
    if (dashPress && attached(p, t) && p.hook!.e >= 0) yank(s, w, p), dashUsed = true;
    if (p.hook && !i.hook) {
      if (!attached(p, t)) p.charge = Math.min(ch.hookN, p.charge + 1); // todavía viajaba: se cancela y devuelve
      p.hook = null;
    }
    if (i.hook && !p.hookHeld && !p.hook && t >= p.hookT && p.charge >= 1) fire(s, w, p, i);
  }
  p.hookHeld = i.hook;
  const on = attached(p, t);

  // DASH (o PICADA si es ↓ en el aire). En el suelo, ↙/↘ es un WAVEDASH directo.
  if (dashPress && !dashUsed && !stunned && p.dashN >= 1 && t >= p.dashCdT) {
    let dx = Math.abs(i.x) > 0.35 ? Math.sign(i.x) : 0, dy = Math.abs(i.y) > 0.35 ? Math.sign(i.y) : 0;
    if (!dx && !dy) dx = p.face;
    if (dy < 0 && !dx) {
      if (!p.ground) {
        p.pound = true, p.vx = 0, p.vy = -c.POUND_V, p.dashT = NEVER, p.slide = false, p.hits = [];
        p.dashN -= 1, p.dashCdT = t + Math.round(c.DASH_CD * HZ);
        ev(s, 'pound', { p: p.id });
      }
    } else {
      const n = Math.sqrt(dx * dx + dy * dy);
      dx /= n, dy /= n;
      p.dashN -= 1, p.dashCdT = t + Math.round(c.DASH_CD * HZ), p.invT = Math.max(p.invT, t + c.DASH_IF), p.hits = [];
      p.pound = false;
      if (p.ground && dy < 0) { // wavedash
        p.slide = true, p.crouch = true, p.vy = 0, p.dashT = NEVER;
        p.vx = Math.sign(dx) * Math.max(Math.abs(p.vx) * (p.vx * dx > 0 ? 1 : 0), c.DASH_V * 0.85);
        trick(s, c, p, 'WAVEDASH');
      } else {
        p.dashT = t, p.ddx = dx, p.ddy = dy, p.slide = false;
        p.vx = dx * Math.max(c.DASH_V, p.vx * dx > 0 ? Math.abs(p.vx) : 0);
        p.vy = dy * Math.max(c.DASH_V, p.vy * dy > 0 ? Math.abs(p.vy) : 0);
      }
      ev(s, 'dash', { p: p.id, dx, dy });
    }
  }
  const dsh = dashing(p, c, t);
  if (p.dashT !== NEVER && t - p.dashT === c.DASH_F) dashEnd(p, c);

  // Barrida y agachado
  const canStand = () => boxFree(T, p.x, p.y, HW, H);
  const down = i.y < -0.5 && !stunned;
  if (p.slide && (!p.ground || Math.abs(p.vx) < SLIDE_END)) p.slide = false; // frenada (aunque siga apretando ↓): agachado no pega
  if (p.ground && down && !dsh && !p.pound) {
    if (!p.slide && Math.abs(p.vx) >= c.SLIDE_MIN) {
      const a = Math.abs(p.vx);
      // la barrida que arranca corriendo sale a SLIDE_MAX como mucho (más rápido solo el wavedash): si no, aterrizar de un
      // HYPER y volver a barrer lo encadenaba para siempre
      p.slide = true, p.hits = [], p.vx = Math.sign(p.vx) * Math.min(a + c.SLIDE_BOOST, c.SLIDE_MAX);
      ev(s, 'slide', { p: p.id });
    }
    p.crouch = true;
  } else {
    if (p.slide && !down) p.slide = false;
    if (!p.slide && p.crouch && canStand()) p.crouch = false;
  }

  // Horizontal
  const glue = t < p.glueT, lead = t < p.leadT, runV = c.RUN * ch.run * (glue ? 0.35 : 1) * (lead ? 0.8 : 1);
  const to = runV * i.x, speeding = to * p.vx >= 0 && Math.abs(to) > Math.abs(p.vx);
  if (dsh || p.pound) { /* el dash y la picada mandan */ }
  else if (stunned) { if (speeding || to * p.vx < 0) p.vx = approach(p.vx, to, c.AIR * 0.12 * DT); }
  else if (p.ground && !on && p.slide) p.vx = approach(p.vx, 0, c.SLIDE_FRIC * DT);
  else if (p.ground && !on && p.crouch) p.vx = approach(p.vx, canStand() ? 0 : to * CRAWL, c.DEC * DT); // bajo un techo bajo se gatea (si no, quedaba encerrado)
  else if (p.ground && !on) p.vx = approach(p.vx, to, (speeding ? c.ACC : c.DEC) * DT);
  else if (!(t < p.lockT && to * p.wallSide > 0) && (speeding || to * p.vx < 0)) p.vx = approach(p.vx, to, c.AIR * DT);

  // Saltos: SUPER (dash + SALTO en el suelo), del suelo (con la barrida: salto largo o HYPER), de pared, doble
  const jumpV = 2 * c.JUMP_H / c.JUMP_T * (glue ? 0.6 : 1);
  if (!stunned && !p.pound) {
    const grounded = t - p.groundT <= c.COYOTE + 1;
    if (p.pressT === t && dsh && grounded && Math.abs(p.ddx) > 0.1 && p.ddy <= 0.1) {
      // el SUPER sale a SUPER_VX (no con toda la rapidez del dash); más rápido que eso solo si ya venías con impulso
      const a = Math.abs(p.vx);
      p.vx = Math.sign(p.ddx) * (a > c.DASH_V + 0.1 ? a : c.SUPER_VX), p.vy = Math.max(p.vy, jumpV);
      p.dashT = NEVER, p.rise = true, p.pressT = p.groundT = NEVER;
      trick(s, c, p, 'SUPER'), ev(s, 'jump', { p: p.id, j: 0 });
    } else if (t - p.pressT <= c.BUFFER && grounded && !on && !dsh) {
      const a = Math.abs(p.vx);
      if (p.slide && a > c.SLIDE_MAX + 0.5) { // HYPER: solo con más rapidez de la que da una barrida común (la del wavedash)
        p.vx = Math.sign(p.vx) * Math.max(a, c.HYPER_VX), p.vy = Math.max(p.vy, jumpV * Math.sqrt(c.HYPER_JUMP));
        trick(s, c, p, 'HYPER');
      } else {
        p.vy = Math.max(p.vy, jumpV);
        if (p.slide && a > c.RUN * 1.15) trick(s, c, p, 'SALTO LARGO');
      }
      p.rise = true, p.pressT = p.groundT = NEVER, p.slide = false;
      if (canStand()) p.crouch = false;
      ev(s, 'jump', { p: p.id, j: 0 });
    } else if (t - p.pressT <= c.BUFFER && !p.ground && !dsh && (p.wall !== 0 || t - p.wallT <= c.WALL_COYOTE)) {
      const side = p.wall || p.wallSide;
      p.vx = -side * Math.max(c.WJ_VX, Math.abs(p.vx) * 0.5), p.vy = Math.max(p.vy, Math.sqrt(2 * g * c.WJ_H));
      p.lockT = t + c.WJ_LOCK, p.rise = true, p.pressT = NEVER, p.wallT = NEVER, p.face = -side;
      ev(s, 'jump', { p: p.id, j: 2 });
    } else if (p.pressT === t && !p.ground && p.air >= 1) {
      const v = Math.sqrt(2 * g * c.JUMP2_H);
      if (dsh) dashEnd(p, c); // el salto corta el dash: sin esto el dash + doble salto conservaba los 22 m/s hasta aterrizar
      if (p.vy < v) p.vy = v;
      p.air -= 1, p.pressT = NEVER, p.rise = true, p.dashT = NEVER;
      ev(s, 'jump', { p: p.id, j: 1 });
    }
  }
  if (!i.jump && p.rise && p.vy > 0) p.vy *= c.JUMP_CUT, p.rise = false;

  // Vertical: gravedad (más fuerte al caer, salvo enganchado o lanzado); ↓ en el aire = caída rápida
  const vy0 = p.vy;
  if (dashing(p, c, t)) { /* sin gravedad */ }
  else if (p.pound) p.vy = -c.POUND_V;
  else {
    let gm = p.vy < 0 && !on && !stunned ? c.FALL_G * (1 + (ch.mass - 1) * FALL_MASS) : 1, maxFall = c.MAX_FALL;
    if (!stunned && !p.ground && i.y < -0.6 && p.vy < 3 && !on) maxFall = c.FAST_FALL, gm *= 1.25;
    p.vy -= g * gm * DT;
    if (!on && !stunned && p.vy < -maxFall) p.vy = -maxFall;
    if (stunned && p.vy < -c.MAX_FALL * 1.6) p.vy = -c.MAX_FALL * 1.6;
    if (!stunned && !p.ground && p.wall !== 0 && i.x * p.wall > 0.3 && p.vy < -c.WALL_SLIDE) p.vy = -c.WALL_SLIDE;
  }
  if (p.vy <= 0) p.rise = false;
  if (stunned) { // el lanzado se frena de a poco (la caída no)
    const k = 1 - c.KB_DRAG * DT;
    p.vx *= k;
    if (p.vy > 0) p.vy *= k;
  }

  // Liga: solo tira, HOOK_K × lo estirado − HOOK_DAMP × la velocidad radial, sin acercar más rápido que HOOK_V.
  // Enganchada a un rival o un objeto, la misma fuerza tira de las dos puntas repartida por masa.
  if (p.hook && on) {
    const h = p.hook, e = h.e >= 0 ? entOf(s, h) : undefined;
    const ih = 1 / ch.mass, ie = !e ? 0 : h.ek === 0 ? 1 / charOf((e as Pl).ch).mass : 1 / PROP_M;
    const ex = h.x - p.x, ey = h.y - (p.y + HAND_Y), d = Math.sqrt(ex * ex + ey * ey);
    if (h.rest === 0) h.rest = d * c.HOOK_REST; // el cuadro en que engancha (si cayó en un hitstop, el primero después)
    if (d > h.rest && d > 1e-6) {
      const nx = ex / d, ny = ey / d, vr = (p.vx - (e?.vx ?? 0)) * nx + (p.vy - (e?.vy ?? 0)) * ny;
      const a = Math.max(0, Math.min(c.HOOK_K * (d - h.rest) - c.HOOK_DAMP * vr, (c.HOOK_V - vr) / DT)) * DT;
      p.vx += nx * a * ih / (ih + ie), p.vy += ny * a * ih / (ih + ie);
      if (e) {
        e.vx -= nx * a * ie / (ih + ie), e.vy -= ny * a * ie / (ih + ie);
        if (h.ek === 0) (e as Pl).lastBy = p.id, (e as Pl).lastT = t;
        else (e as Prop).ground = false;
      }
    }
  }

  integrate(s, w, p, i, vy0, stunned);
}

// Mover con barrido por ejes (no atraviesa nada), subir escalones chicos solo, corrección de esquinas al saltar,
// rebotes del lanzado (con tech: SALTO justo antes de pegar te frena y te devuelve el control) y la pared.
function integrate(s: State, w: World, p: Pl, i: Input, vy0: number, stunned: boolean) {
  const c = w.c, T = w.T, t = s.t, ch = charOf(p.ch), h = p.crouch ? HC : H;
  const wasGround = p.ground, dsh = dashing(p, c, t);
  const tech = stunned && t - p.techT <= c.TECH;
  const wx = p.vx * DT;
  let dx = sweepX(T, p.x, p.y, HW, h, wx);
  if (dx !== wx && c.STEP > 0 && (wasGround || dsh || p.vy <= 0)) {
    for (let up = CELL; up <= c.STEP + 1e-6; up += CELL) {
      if (!wasGround && !dsh && up > CELL) break; // en el aire, solo un escalón de una celda
      if (sweepY(T, p.x, p.y, HW, h, up) < up - 1e-9) break;
      const d2 = sweepX(T, p.x, p.y + up, HW, h, wx);
      if (Math.abs(d2) > Math.abs(dx) + 1e-4) { p.y += up, dx = d2; break; }
    }
  }
  p.x += dx;
  if (dx !== wx) {
    if (stunned && Math.abs(p.vx) > c.BOUNCE_V) {
      if (tech) p.stunT = t, p.techT = NEVER, p.vx = 0, trick(s, c, p, 'TECH');
      else p.vx = -p.vx * c.BOUNCE_E, ev(s, 'bounce', { p: p.id });
    } else p.vx = 0;
  }
  const wy = (vy0 + p.vy) * 0.5 * DT;
  let dy = sweepY(T, p.x, p.y, HW, h, wy);
  if (wy > 0 && dy < wy - 1e-9 && !stunned) { // corrección de esquina: si el techo es solo un borde, se esquiva
    for (const k of [1, -1, 2, -2]) {
      const nx = p.x + k * CELL * 0.5;
      if (boxFree(T, nx, p.y, HW, h) && sweepY(T, nx, p.y, HW, h, wy) === wy) { p.x = nx, dy = wy; break; }
    }
  }
  p.y += dy;
  const landed = wy < 0 && dy !== wy;
  if (dy !== wy) {
    if (landed) {
      if (p.pound) {
        p.pound = false, p.poundLand = t;
        if (t - p.pressT <= c.BUFFER + 2 || p.held) {
          p.vy = Math.sqrt(2 * gravity(c) * c.JUMP_H * c.POUND_BOUNCE), p.rise = true, p.pressT = NEVER;
          trick(s, c, p, 'REBOTE');
        } else p.vy = 0;
      } else if (stunned && -p.vy > c.BOUNCE_V && !tech) p.vy = -p.vy * c.BOUNCE_E, ev(s, 'bounce', { p: p.id });
      else {
        if (tech && -p.vy > c.BOUNCE_V) p.stunT = t, p.techT = NEVER, trick(s, c, p, 'TECH');
        if (dsh && p.ddy < -0.1 && Math.abs(p.ddx) > 0.1) { // dash diagonal que toca el suelo: wavedash
          p.slide = true, p.crouch = true, p.dashT = NEVER;
          p.vx = Math.sign(p.ddx) * Math.max(Math.abs(p.vx), c.DASH_V * 0.85);
          trick(s, c, p, 'WAVEDASH');
        }
        if (-p.vy > 12) ev(s, 'land', { p: p.id, v: Math.round(-p.vy) });
        p.vy = 0;
      }
    } else p.vy = stunned ? -p.vy * 0.4 : 0;
    p.rise = false;
  }
  p.ground = landed && p.vy <= 0;
  // Bajar escalones caminando: si estaba en el suelo y quedó en el aire sin saltar, se pega al suelo cercano
  if (wasGround && !p.ground && p.vy <= 0 && !dsh && !stunned && !p.pound && c.STEP > 0) {
    const d = sweepY(T, p.x, p.y, HW, h, -c.STEP - 1e-3);
    if (d > -c.STEP - 1e-3) p.y += d, p.ground = true, p.vy = 0;
  }
  if (p.ground) {
    p.groundT = t, p.air = ch.airJumps;
    if (!dashing(p, c, t)) p.dashN = ch.dashN;
  }
  // Pared: tocando de costado (la parte media del cuerpo) en el aire
  p.wall = 0;
  if (!p.ground) {
    const y0 = p.y + h * 0.25, hh = h * 0.5;
    if (sweepX(T, p.x, y0, HW, hh, -0.06) > -0.06 + 1e-9) p.wall = -1;
    else if (sweepX(T, p.x, y0, HW, hh, 0.06) < 0.06 - 1e-9) p.wall = 1;
    if (p.wall) p.wallT = t, p.wallSide = p.wall;
  }
}
