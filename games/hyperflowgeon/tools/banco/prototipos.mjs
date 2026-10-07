// Banco de pruebas (laboratorio, 2026-10-07; prototipos, no código del juego): los cuatro héroes sobre la MISMA sim (step real: carrera, salto, colisión por barrido).
// La Calamidad es la sim tal cual (liga). Los otros tres son prototipos v0 montados encima: antes/después de cada step
// tocan la velocidad o la posición según su kit. Cada controlador recibe un vector de política (números en [0, 1])
// que una búsqueda al azar optimiza por recorrido: algo así como un TAS barato para comparar techos, no un bot jugable.
import { init, step, raycast, DT, HW, H } from '../../src/sim/sim.ts';
import { DEFAULTS as C } from '../../src/sim/params.ts';
import { glideStep, GL } from './vuelo.mjs';
export const g = 2 * C.JUMP_H / C.JUMP_T ** 2;
// Reglas en prueba (las cambia banco.mjs). Las de la liga son la propuesta de la decisión A: SWING_ONLY = la carga vuelve
// solo si al soltar el ancla quedó atrás; V_PULL = enganchado, la liga solo agrega energía por debajo de esa rapidez;
// BELOW = ese tope vale solo hacia anclas por debajo de la mano. M1/M2: cuadros a tope para los niveles de Calicó.
// Cuauhtli (medido con el doble salto de la segunda vuelta del paso D): CAP_LAUNCH = el aleteo saca de pérdida hasta
// V_OUT pero nunca deja más rápido que al despegar (si no, tope fijo V_CAP); OWN_H = la altura de los propios saltos no
// se vuelve rapidez en el planeo (presupuesto: rapidez al despegar + altura bajo el despegue + aleteos).
export const REGLAS = { IMP_E: 150, V_CAP: 24, IMP_CD: 0.5, M1: 36, M2: 96, SWING_ONLY: false, V_PULL: 0, BELOW: false, OWN_H: true, CAP_LAUNCH: true, V_OUT: 12, N: 2500 };
const NOGRAV = { ...C, JUMP_H: 1e-9, AIR: 0, MAX_FALL: 1e9 };
const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

// ── Recorridos: todos se pueden terminar solo corriendo y saltando (pilar: siempre hay una ruta base) ──
export const COURSES = {
  larga: { w: { spawn: [0, 0], rects: [R(-10, -2, 600, 0), R(-12, -2, -10, 30)] }, done: p => p.x >= 300, T: 20 },
  recta: { w: { spawn: [0, 0], rects: [R(-10, -2, 400, 0), R(-12, -2, -10, 30)] }, done: p => p.x >= 120, T: 15 },
  foso: { // foso de 25 m (x 20–45), 6 m de hondo con escalones para salir; vigas a 10 m cada 12 m encima
    w: { spawn: [0, 0], rects: [R(-10, -2, 20, 0), R(20, -8, 45, -6), R(45, -8, 200, 0), R(-12, -2, -10, 30),
      R(41, -6, 45, -4), R(43, -4, 45, -2), R(18, 10, 20, 10.5), R(30, 10, 32, 10.5), R(42, 10, 44, 10.5)] },
    done: p => p.x >= 70 && p.y >= -0.1, T: 15 },
  torre: { // torre de 16 m en x 40–46; escalera de plataformas a la izquierda (ruta base)
    w: { spawn: [0, 0], rects: [R(-10, -2, 200, 0), R(-12, -2, -10, 40), R(40, 0, 46, 16),
      R(26, 3.4, 31, 3.8), R(33, 6.8, 38, 7.2), R(26, 10.2, 31, 10.6), R(33, 13.6, 38, 14)] },
    done: p => p.x >= 40 && p.x <= 46 && p.y >= 15.9 && p.ground, T: 15 },
  vuelta: { // ir a tocar x = 40 (pared en 44) y volver a x = 0
    w: { spawn: [0, 0], rects: [R(-30, -2, 60, 0), R(44, 0, 46, 12), R(-32, -2, -30, 30), R(10, 9, 12, 9.5), R(30, 9, 32, 9.5)] },
    done: (p, m) => (m.touched ||= p.x >= 40) && p.x <= 0, T: 15 },
  pelea: { // foso de 40 m (x 15–55) con voladores a 3 m cada 9 m; caer = salir por los escalones del fondo
    w: { spawn: [0, 0], rects: [R(-10, -2, 15, 0), R(15, -8, 55, -6), R(55, -8, 200, 0), R(-12, -2, -10, 30), R(51, -6, 55, -4), R(53, -4, 55, -2)] },
    foes: [[20, 3], [29, 3.5], [38, 3], [47, 3.5]],
    done: p => p.x >= 70 && p.y >= -0.1, T: 15 },
  pelea2: { // foso ancho (x 15–79, 10 m de hondo): solo cruza sin caer quien encadena golpes; abajo hay que trepar
    w: { spawn: [0, 0], rects: [R(-10, -2, 15, 0), R(15, -12, 79, -10), R(79, -12, 200, 0), R(-12, -2, -10, 30),
      R(75, -10, 79, -7), R(77, -7, 79, -4), R(78, -4, 79, -2)] },
    foes: [[21, 3], [29, 4], [37, 3], [45, 4], [53, 3], [61, 4], [69, 3]],
    done: p => p.x >= 90 && p.y >= -0.1, T: 15 },
  descenso: { // acantilado de 30 m y meta a 120 m por el piso de abajo
    w: { spawn: [0, 30], rects: [R(-10, 28, 10, 30), R(-12, 28, -10, 40), R(-10, -2, 300, 0)] },
    done: p => p.x >= 120 && p.y <= 0.1, T: 15 },
};

// Mira hacia el ancla más prometedora (para La Calamidad): la esquina de rect adelante y arriba más cercana a (tx, ty)
function aimAt(p, tx, ty) { return [tx - p.x, ty - (p.y + 1.2)]; }

// ── Controladores. q = vector de política en [0, 1]. Devuelven la entrada del cuadro y pueden tocar el estado (hooks).
// La Calamidad: corre; a partir de q0 dispara a la mejor viga visible (raycast a esquinas) y suelta tras q1·60 cuadros;
// salta en q2. Es una política simple: la búsqueda elige cuándo y cuánto.
export const HEROES = {
  calamidad: {
    n: 8,
    make(q, course) {
      let held = 0, target = null, dir = 1, lastShot = -99, honda = q[6] > 0.5;
      const SWING_ONLY = REGLAS.SWING_ONLY;
      return { pre(s, w, m) {
        const p = s.p;
        if (course === 'vuelta' && m.touched) dir = -1;
        if (!p.hook && s.t - lastShot > 3 + q[4] * 30) {
          let best = null;
          for (const r of w.rects) for (const [cx, cy] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) {
            const ex = cx - p.x, ey = cy - (p.y + 1.2), d = Math.hypot(ex, ey);
            if (d > C.HOOK_LEN - 0.5 || d < 3 || ey < 1 - q[5] * 3) continue;
            const sc = ex * dir * (0.2 + q[3]) + ey;
            if (!best || sc > best.sc) best = { cx, cy, sc };
          }
          // honda: un punto del piso/superficie adelante y abajo (todo es anclable): el rayo decide dónde pega
          if (!best && honda && !p.ground && p.vy < 0) best = { cx: p.x + dir * (6 + q[7] * 5.5), cy: p.y - 1 - q[5] * 2, sc: 0, ray: true };
          target = best && (s.t > q[0] * 40) ? best : null;
        }
        const firing = !p.hook && target && p.charge >= 1;
        if (p.hook) held++; else held = 0;
        const hook = firing || (p.hook && held < 3 + q[1] * 60);
        if (firing) lastShot = s.t;
        const [ax, ay] = target ? aimAt(p, target.cx, target.cy) : [dir, 1];
        const jump = p.ground ? s.t > q[2] * 30 : held > 0 ? false : p.vy > 0;
        // Regla propuesta (SWING_ONLY): la carga vuelve solo si al soltar el ancla quedó atrás (pasaste de largo: columpio)
        const info = p.hook ? { ax: p.hook.x, ay: p.hook.y } : null;
        const VP = REGLAS.V_PULL, e0 = (p.vx * p.vx + p.vy * p.vy) / 2 + g * p.y, on0 = p.hook && s.t + 1 >= p.hook.at;
        return { inp: { x: dir, jump, hook, ax, ay }, after(s2) {
          // Regla propuesta (V_PULL): enganchado, la liga solo agrega energía mientras vas por debajo de V_PULL; la
          // gravedad del columpio queda libre (E = v²/2 + g·y se conserva enganchado salvo el trabajo de la liga)
          const q2 = s2.p, v2 = q2.vx * q2.vx + q2.vy * q2.vy;
          if (VP > 0 && on0 && q2.hook && v2 > VP * VP && (!REGLAS.BELOW || q2.hook.y < q2.y + 1.2)) {
            const e1 = v2 / 2 + g * q2.y, W = e1 - e0;
            if (W > 0) { const keep = Math.max(VP * VP, v2 - 2 * W), k = Math.sqrt(keep / v2); q2.vx *= k, q2.vy *= k; }
          }
          if (SWING_ONLY && info && !s2.p.hook && s2.p.refundT === s2.t) {
            const behind = (info.ax - s2.p.x) * s2.p.vx + (info.ay - (s2.p.y + 1.2)) * s2.p.vy < 0;
            if (!behind) s2.p.charge -= 1;
          }
        } };
      } };
    },
  },
  // Cuauhtli v0: planeo con SALTO mantenido después de la cima (cabeceo según la política), 3 impulsos de 12 m/s que
  // suman en una dirección elegida (se recargan en el suelo), corre igual que todos.
  cuauhtli: {
    n: 14,
    make(q, course) {
      let glide = null, imp = GL.IMP_N, dir = 1, y0 = 0, eb = 0, vl = 0; // despegue: altura y energía propia (sin la del salto)
      const ANG = [[1, 0], [0.92, 0.38], [0.71, 0.71], [0.38, 0.92], [0, 1], [0.71, -0.71]];
      const sched = [0, 1, 2].map(k => ({ t: 8 + Math.floor(q[4 + 2 * k] * 200), a: ANG[Math.min(5, Math.floor(q[5 + 2 * k] * 6))] }));
      const cruise = -0.05 - q[0] * 0.35, foldUntil = Math.floor(q[10] * 200), foldAt = Math.floor(q[11] * 100), pullY = q[12] * 20;
      return { onHit(s) { imp = Math.min(GL.IMP_N, imp + 1); }, pre(s, w, m) {
        const p = s.p;
        if (course === 'vuelta' && m.touched) dir = -1;
        imp = Math.min(GL.IMP_N, imp + (p.ground ? DT / REGLAS.IMP_CD : 0));
        if (p.ground) glide = null, y0 = p.y, eb = p.vx * p.vx / 2, vl = Math.abs(p.vx);
        const jumpNow = p.ground && s.t > q[3] * 30;
        for (const sc of sched) if (s.t === sc.t && !p.ground && imp >= 1) {
          const v0 = Math.hypot(p.vx, p.vy) || 1e-9, sx = dir * sc.a[0], sy = sc.a[1], cth = (p.vx * sx + p.vy * sy) / v0;
          const v1 = Math.max((1 + cth) / 2 * v0, Math.sqrt(Math.min(v0 * v0 + 2 * REGLAS.IMP_E, (REGLAS.CAP_LAUNCH ? Math.max(REGLAS.V_OUT, vl) : REGLAS.V_CAP) ** 2)));
          p.vx = sx * v1, p.vy = sy * v1, imp--, eb += Math.max(0, (v1 * v1 - v0 * v0) / 2);
          if (glide) glide = { ...glide, ux: sx, uy: sy, v: v1 };
        }
        if (!p.ground && imp >= 1 && q[13] > 0.3) for (const f of COURSES[course].foes ?? []) {
          if (m['dead' + f.join()]) continue;
          const ex = f[0] - p.x, ey = f[1] - (p.y + 0.9), d = Math.hypot(ex, ey);
          if (ex * dir > 0 && d < 10 && d > 1.6 && (s.t - (m.lastImp ?? -99)) > 10) {
            const v0 = Math.hypot(p.vx, p.vy) || 1e-9, sx = ex / d, sy = ey / d, cth = (p.vx * sx + p.vy * sy) / v0;
            const v1 = Math.max((1 + cth) / 2 * v0, Math.sqrt(Math.min(v0 * v0 + 2 * REGLAS.IMP_E, (REGLAS.CAP_LAUNCH ? Math.max(REGLAS.V_OUT, vl) : REGLAS.V_CAP) ** 2)));
            p.vx = sx * v1, p.vy = sy * v1, imp--, m.lastImp = s.t, eb += Math.max(0, (v1 * v1 - v0 * v0) / 2);
            if (glide) glide = { ...glide, ux: sx, uy: sy, v: v1 };
            break;
          }
        }
        if (!p.ground && !glide && p.vy <= 0 && q[1] > 0.2 && s.t > q[2] * 60) { const v = Math.hypot(p.vx, p.vy) || 1; glide = { ux: p.vx / v, uy: p.vy / v, v, fold: false }; }
        if (glide) {
          const b = { x: p.x, y: p.y, ...glide };
          b.fold = s.t >= foldAt && s.t < foldAt + foldUntil && p.y > pullY; // picada: alas plegadas hasta pullY
          const tgt = b.fold ? -0.7 : cruise;
          const want = dir * b.ux < 0 ? 1 : (b.uy > tgt ? -1 : 1) * (Math.abs(b.uy - tgt) < 0.05 ? 0.3 : 1);
          glideStep(b, want);
          // REGLAS.OWN_H: la altura de tus propios saltos no se vuelve rapidez (como el aterrizaje limpio de Calicó)
          if (REGLAS.OWN_H) { const vm = Math.sqrt(2 * Math.max(0, eb + g * (y0 - b.y))); if (b.v > vm) b.v = Math.max(3, vm); }
          glide = { ux: b.ux, uy: b.uy, v: b.v, fold: b.fold };
          p.vx = b.ux * b.v, p.vy = b.uy * b.v;
          return { cfg: NOGRAV, inp: { x: 0, jump: true } };
        }
        return { cfg: C, inp: { x: dir, jump: jumpNow || (!p.ground && p.vy > 0) || (p.ground && q[13] > 0.5) } };
      }, post(s) { const p = s.p; if (glide && (p.ground || (p.vx === 0 && p.vy === 0))) glide = null; else if (glide) { const v = Math.hypot(p.vx, p.vy); glide = v > 1e-6 ? { ...glide, ux: p.vx / v, uy: p.vy / v, v } : null; } } };
    },
  },
  // Freydis v0: correr derecho ≥ 0,9·RUN durante 0,6 s carga el salto explosivo (pértiga: pasa hasta ¾ de la energía
  // horizontal a vertical); PASO de 4 m en la dirección elegida con 6 cuadros de aviso, conserva la rapidez y la gira
  // a la dirección del PASO (2 cargas, una cada 3 s).
  freydis: {
    n: 6,
    make(q, course) {
      let dir = 1, run = 0, pasos = 2, pasoAt = -1, pasoDir = null, regen = 0, used = [];
      const plan = [q[2], q[3]].map((a, k) => ({ t: 10 + Math.floor(a * 300), ang: [[1, 0], [0.71, 0.71], [0, 1], [-1, 0]][Math.min(3, Math.floor(q[4 + k] * 4))] }));
      return { onHit(s) { pasos = Math.min(2, pasos + 1); s.p.vy = Math.max(s.p.vy, 10); }, pre(s, w, m) {
        const p = s.p;
        if (course === 'vuelta' && m.touched && dir === 1) { dir = -1; }
        if (p.ground && Math.abs(p.vx) >= 0.9 * C.RUN && Math.sign(p.vx) === dir) run++; else if (p.ground) run = 0;
        regen += DT; if (regen >= 3 && pasos < 2) pasos++, regen = 0;
        for (const pl of plan) if (s.t === pl.t && pasos > 0 && pasoAt < 0) pasoAt = s.t + 6, pasoDir = [pl.ang[0] * dir, pl.ang[1]], pasos--;
        if (pasos > 0 && pasoAt < 0 && !p.ground) for (const f of COURSES[course].foes ?? []) {
          if (m['dead' + f.join()]) continue;
          const ex = f[0] - p.x, ey = f[1] - (p.y + 0.9), d = Math.hypot(ex, ey);
          if (ex * dir > 0 && d < 4 + 6 * 0.1 + q[1] * 4 && d > 1.6) { pasoAt = s.t + 6, pasoDir = [ex / d, ey / d], pasos--; break; }
        }
        if (pasoAt === s.t) { // PASO: teletransporte de hasta 4 m (corta antes de una pared) y gira la velocidad
          const [dx, dy] = pasoDir;
          let d = 4;
          for (const oy of [0.1, 0.9, 1.7]) { const [h] = raycast(w.rects, p.x + dx * HW, p.y + oy, dx, dy, 4.5); if (h >= 0) d = Math.min(d, h - 0.05); }
          p.x += dx * Math.max(0, d), p.y += dy * Math.max(0, d);
          const v = Math.abs(p.vx);
          p.vx = dx * v, p.vy = dy * v, pasoAt = -1;
        }
        const jumpNow = p.ground && s.t > q[0] * 120 && (q[1] < 0.5 || run >= 36);
        if (jumpNow && run >= 6) { // salto explosivo: carga c de 0 (0,1 s) a 1 (0,6 s)
          const c = Math.min(1, (run - 6) / 30), k = 0.75 * c * c, vx = p.vx;
          return { inp: { x: dir, jump: true }, after(s2) { if (s2.p.vy > 0 && !s2.p.ground) { s2.p.vy = Math.sqrt(s2.p.vy ** 2 + k * vx * vx); s2.p.vx = vx * Math.sqrt(1 - k); } } };
        }
        return { inp: { x: dir, jump: jumpNow || (!p.ground && p.vy > 0) } };
      } };
    },
  },
  // Calicó v0 (tablón): tope de velocidad por compromiso (20 → 26 a 1 s → 32 a 2,5 s sosteniendo la dirección a tope;
  // girar o chocar lo pierde); paredes como cuarto de tubo (chocar a ≥ 15 m/s sube por la pared con 0,85 de la rapidez
  // y al bajar sale hacia el otro lado con 0,85 de lo que traía); aterrizaje limpio (SALTO en el buffer) convierte 0,3
  // de la caída en avance; bala bajo los pies una vez por salto: rebote de 16 m/s hacia arriba.
  calico: {
    n: 15,
    make(q, course) {
      let dir = 1, hold = 0, lvl = 0, wall = 0, bala = 1, landVy = 0, yLaunch = 0;
      const jumps = [q[5], q[6], q[7], q[11], q[12], q[13]].map(a => 5 + Math.floor(a * 300)), flips = q[8] > 0.5 ? [q[9], q[10], q[14]].map(a => 5 + Math.floor(a * 300)) : [];
      const tops = [C.RUN, 26, 32];
      return { onHit(s) { bala = 1; }, pre(s, w, m) {
        const p = s.p;
        if (flips.includes(s.t)) dir = -dir, lvl = 0, hold = 0;
        if (course === 'vuelta' && m.touched && dir === 1 && !wall) dir = -1, lvl = 0, hold = 0;
        if (p.ground) bala = 1;
        if (p.ground && Math.abs(p.vx) >= tops[lvl] - 0.5 && Math.sign(p.vx) === dir) hold++;
        if (lvl < 2 && hold >= (lvl === 0 ? REGLAS.M1 : REGLAS.M2)) lvl++;
        const cfg = { ...C, RUN: tops[lvl] };
        if (wall) { // en la pared: sube con gravedad normal; al bajar, cae y al tocar el suelo sale al revés
          if (p.vy <= 0 && wall === 1) wall = 2;
          return { cfg: { ...cfg, AIR: 0 }, inp: { x: 0, jump: false } };
        }
        if (!p.ground && bala && p.vy < 0 && s.t > 10 + q[3] * 200 && q[4] > 0.5) p.vy = Math.max(p.vy, 16), bala = 0;
        landVy = p.vy;
        const jumpNow = p.ground && (jumps.some(t => s.t >= t && s.t < t + 8) || (s.t > q[0] * 200 && q[1] > 0.7));
        const buf = !p.ground && p.vy < 0 && p.y < 1.5 && q[2] > 0.5; // aterrizaje limpio: SALTO justo antes de tocar
        return { cfg, inp: { x: dir, jump: jumpNow || buf || (!p.ground && p.vy > 0 && !wall) } };
      }, post(s, w, m, before) {
        const p = s.p;
        if (wall === 2 && p.ground) { p.vx = -dir * 0.85 * Math.abs(landVy); dir = -dir; wall = 0, lvl = Math.max(0, lvl - 1); hold = 0; return; }
        if (!wall && Math.abs(before.vx) >= 15 && p.vx === 0 && Math.sign(before.vx) === dir) { p.vy = 0.85 * Math.abs(before.vx); wall = 1; return; }
        if (before.ground && !p.ground) yLaunch = before.y;
        if (!before.ground && p.ground && p.vy > 0 && before.vy < -4) { // salto con buffer al aterrizar: limpio
          const dh = Math.max(0, yLaunch - p.y); // solo la altura perdida de verdad (una caída desde una cornisa)
          p.vx = Math.sign(p.vx || dir) * Math.sqrt(p.vx * p.vx + 2 * 0.6 * g * dh);
          yLaunch = p.y;
        }
        if (Math.sign(p.vx) !== dir && Math.abs(p.vx) > 1) lvl = 0, hold = 0;
      } };
    },
  },
};

// Corre una política; devuelve el tiempo hasta cumplir el recorrido (o Infinity)
export function run(hero, course, q, trace) {
  const { w, done, T } = COURSES[course], s = init(w), m = {}, ctl = HEROES[hero].make(q, course);
  // Doble salto (de todos desde la segunda vuelta del paso D): el último número de la política dice en qué cuadro del
  // vuelo se aprieta SALTO otra vez (≥ 0,9: nunca). Va encima de la entrada del héroe, igual para los cuatro.
  const dj = q[HEROES[hero].n] ?? 1, djAt = dj < 0.9 ? 4 + Math.floor(dj * 60) : -1;
  let airT = 0;
  for (let k = 0; k < T * 60; k++) {
    let inp, cfg = C, after = null, before = { ...s.p };
    if (typeof ctl === 'function') inp = ctl(s, w, m);
    else { const r = ctl.pre(s, w, m); inp = r.inp; cfg = r.cfg ?? C; after = r.after; }
    airT = s.p.ground ? 0 : airT + 1;
    if (djAt > 0 && airT === djAt - 1) inp = { ...inp, jump: false };
    if (djAt > 0 && airT === djAt) inp = { ...inp, jump: true };
    step(s, w, inp, cfg);
    if (after) after(s);
    // Golpe automático (idealizado): un enemigo vivo a ≤ 1,6 m del pecho se rompe; el héroe rebota (AÉREO: golpear te
    // mantiene en el aire, vy ≥ 8) y recibe lo de su kit (onHit)
    for (const f of COURSES[course].foes ?? []) {
      const key = f.join(); if (m['dead' + key]) continue;
      if (Math.hypot(f[0] - s.p.x, f[1] - (s.p.y + 0.9)) <= 1.6) { m['dead' + key] = 1; s.p.vy = Math.max(s.p.vy, 8); ctl.onHit?.(s); }
    }
    if (ctl.post) ctl.post(s, w, m, before);
    if (trace) trace.push([s.p.x, s.p.y]);
    if (s.p.y < -40) return Infinity;
    if (done(s.p, m)) return s.t * DT;
  }
  return Infinity;
}

// Búsqueda al azar con refinamiento local (semilla fija: determinista)
export function search(hero, course, N = REGLAS.N) {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const n = HEROES[hero].n + 1; // + el cuadro del doble salto
  let best = { t: Infinity, q: null };
  for (let k = 0; k < N; k++) {
    const q = best.q && k > N / 2 ? best.q.map(v => Math.min(1, Math.max(0, v + (rnd() - 0.5) * 0.2))) : Array.from({ length: n }, rnd);
    const t = run(hero, course, q);
    if (t < best.t) best = { t, q };
  }
  return best;
}
