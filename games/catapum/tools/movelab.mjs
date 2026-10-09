// Laboratorio de movimiento de CATAPUM: mide con `movePlayer` real (mundos de prueba, sin partida) lo que el
// movimiento deja hacer, para calibrar `RANGES` (params.ts) con números y no a ojo. Uso:
//   node games/catapum/tools/movelab.mjs [--solo salto,dist,pared,picada,liga,recup] [--ch bombin,lia] [--rapido]
//        [--acantilado] [--set CLAVE=valor,CLAVE=valor] [--json] [--resumen]
// --set pisa valores de RANGES solo para esta corrida (probar una idea sin tocar params.ts). --rapido achica la
// búsqueda de la envolvente de recuperación. --resumen imprime solo los CRITERIOS de calibración (para iterar).
// Las secciones:
//   salto   carrera (aceleración, frenado, giro), altura, subida y vuelo; salto corto; todos los saltos de cada personaje
//   dist    alcance horizontal de cada truco desde correr a tope (de la primera tecla del truco hasta aterrizar)
//   pared   deslizar, escalera de saltos de pared entre dos paredes separadas N m, una pared sola
//   picada  rapidez, tiempo y rebote
//   liga    alcance, tirón, y cuánto se gana al soltar con SALTO
//   recup   envolvente de recuperación por personaje: ¿vuelve al escenario desde x m afuera e y m abajo?
// Todo es determinista (sin azar). Los guiones de entrada buscan el mejor momento de cada acción (barrido de cuadros):
// miden lo que se PUEDE hacer con buena técnica, no lo que hace una persona promedio. Las funciones se exportan
// para que `tests/move.test.mjs` pruebe los mismos números que se calibran acá.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { movePlayer } from '../src/sim/move.ts';
import { newTerr, set, CELL, DIRT, ROCK } from '../src/sim/terrain.ts';
import { newPlayer, NO_INPUT, HZ, DT, HW, HAND_Y, NEVER, gravity } from '../src/sim/state.ts';
import { RANGES, RULES, DEFAULTS } from '../src/sim/params.ts';
import { CHARS, charOf } from '../src/sim/chars.ts';
export { charOf };

// Los valores con que se mide (los de params.ts; --set los pisa). Las funciones leen siempre este objeto.
export const cfg = { ...DEFAULTS };
const CH_IDS = CHARS.map(c => c.id);

// ---------------------------------------------------------------------------------------------------------------
// Mundos y actores
// ---------------------------------------------------------------------------------------------------------------
export const FLOOR = 1; // y de la superficie del piso
export function floorTerr(width = 240, height = 120, build) {
  const T = newTerr(width / CELL, height / CELL);
  for (let i = 0; i < T.cols; i++) for (let j = 0; j < 4; j++) set(T, i, j, j === 0 ? ROCK : DIRT);
  if (build) build(T);
  return T;
}
export const box = (T, x0, y0, x1, y1, m = DIRT) => {
  for (let j = Math.floor(y0 / CELL); j < Math.ceil(y1 / CELL); j++) for (let i = Math.floor(x0 / CELL); i < Math.ceil(x1 / CELL); i++) set(T, i, j, m);
};
export function actor(chId, T, x, y, ground = false) {
  const p = newPlayer(0, { name: 'LAB', ch: chId }, cfg, RULES);
  Object.assign(p, { alive: true, x, y, ground, cloudT: NEVER, groundT: ground ? 1000 : NEVER });
  const s = { t: 1000, ev: [], pl: [p], props: [], rules: { ...RULES } };
  return { s, w: { m: null, T, c: cfg }, p, tricks: [], jumps: [] };
}
const IN = { ...NO_INPUT };
// Un cuadro: la entrada es parcial (el resto, sin tocar) y se repone la carga de la liga como hace step()
export function tick(e, o = {}) {
  Object.assign(IN, NO_INPUT, o);
  e.s.t++, e.s.ev = [];
  movePlayer(e.s, e.w, e.p, IN);
  for (const v of e.s.ev) { if (v.k === 'trick') e.tricks.push(v.n); else if (v.k === 'jump') e.jumps.push(v.j); }
  const ch = charOf(e.p.ch);
  e.p.charge = Math.min(ch.hookN, e.p.charge + DT / (cfg.HOOK_CD * ch.hookCd) * (e.p.ground ? 2 : 1));
}
// Corre hasta tener la velocidad de carrera (parado en el piso)
export function runUp(chId, T, x = 20, frames = 90) {
  const e = actor(chId, T, x, FLOOR, true);
  for (let k = 0; k < frames; k++) tick(e, { x: 1 });
  return e;
}
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const argmax = (xs, f) => { let b = null, bv = -Infinity; for (const x of xs) { const v = f(x); if (v > bv) bv = v, b = x; } return [b, bv]; };
const range = (a, b, st = 1) => { const o = []; for (let v = a; v <= b + 1e-9; v += st) o.push(v); return o; };

// ---------------------------------------------------------------------------------------------------------------
// SALTO y CARRERA
// ---------------------------------------------------------------------------------------------------------------
export function jumpLab(chId) {
  const T = floorTerr();
  const out = {};
  { // SALTO mantenido
    const e = actor(chId, T, 50, FLOOR, true);
    let top = 0, rise = -1, f = 0;
    for (; f < 400; f++) {
      tick(e, { jump: true });
      top = Math.max(top, e.p.y - FLOOR);
      if (rise < 0 && e.p.vy <= 0) rise = f + 1;
      if (f > 1 && e.p.ground) break;
    }
    out.h = r2(top), out.subida = r2(rise / HZ), out.vuelo = r2((f + 1) / HZ);
  }
  { // salto corto: apretar un solo cuadro
    const e = actor(chId, T, 50, FLOOR, true);
    let top = 0;
    for (let f = 0; f < 120; f++) { tick(e, { jump: f === 0 }); top = Math.max(top, e.p.y - FLOOR); if (f > 1 && e.p.ground) break; }
    out.corto = r2(top);
  }
  { // todos los saltos del personaje, cada uno al llegar al punto más alto del anterior (soltando un cuadro entre uno y otro)
    const e = actor(chId, T, 50, FLOOR, true), n = charOf(chId).airJumps;
    let top = 0, used = 0, tf = 0;
    for (let f = 0; f < 600; f++) {
      let jump = true;
      if (e.p.vy <= 0 && !e.p.ground && used < n) { if (e.p.held) jump = false; else used++; }
      tick(e, { jump });
      top = Math.max(top, e.p.y - FLOOR);
      if (f > 2 && e.p.ground) { tf = (f + 1) / HZ; break; }
    }
    out.todos = r2(top), out.saltosAire = n, out.vueloTodos = r2(tf);
  }
  return out;
}

// Carrera: aceleración, frenado y giro (con el personaje)
export function runLab(chId) {
  const T = floorTerr(), o = {};
  const e = actor(chId, T, 20, FLOOR, true), vmax = cfg.RUN * charOf(chId).run;
  let k = 0, x0 = e.p.x;
  while (e.p.vx < vmax * 0.9 && k < 300) tick(e, { x: 1 }), k++;
  o.t90 = r2(k / HZ), o.d90 = r1(e.p.x - x0), o.vmax = r1(vmax);
  { // frenar soltando el joystick, desde la carrera a tope
    const e1 = runUp(chId, T), x1 = e1.p.x; let f = 0;
    while (Math.abs(e1.p.vx) > 0.05 && f++ < 300) tick(e1, {});
    o.frenoDist = r2(e1.p.x - x1), o.frenoT = r2(f / HZ);
  }
  { // girar: a tope hacia un lado y pedir el otro; cuánto hasta volver a la mitad de la carrera hacia el otro lado
    const e2 = runUp(chId, T), x1 = e2.p.x; let f = 0;
    while (e2.p.vx > -vmax * 0.5 && f++ < 300) tick(e2, { x: -1 });
    o.giroT = r2(f / HZ), o.giroDist = r2(e2.p.x - x1);
  }
  return o;
}

// ---------------------------------------------------------------------------------------------------------------
// DISTANCIAS: alcance de cada truco, corriendo a tope, desde la primera tecla del truco hasta aterrizar
// ---------------------------------------------------------------------------------------------------------------
// Corre el guion hasta aterrizar después de un salto (evento 'jump'); devuelve alcance, vuelo y altura máxima.
export function flight(chId, script, T = floorTerr()) {
  const e = runUp(chId, T), x0 = e.p.x, v0 = e.p.vx;
  let top = 0, jumped = false, vmax = 0, jk = -1;
  for (let k = 0; k < 500; k++) {
    tick(e, script(k, e));
    top = Math.max(top, e.p.y - FLOOR);
    if (e.jumps.length && !jumped) jk = k;
    if (jumped && k === jk + 3) vmax = Math.abs(e.p.vx); // rapidez horizontal 3 cuadros después de despegar
    if (e.jumps.length) jumped = true;
    if (jumped && e.p.ground && k > 2) return { d: e.p.x - x0, t: (k + 1) / HZ, h: top, v0, vmax, tricks: e.tricks.slice(), jumps: e.jumps.slice() };
  }
  return { d: NaN, t: NaN, h: top, v0, vmax, tricks: e.tricks, jumps: e.jumps };
}
export const S = {
  correr: () => () => ({ x: 1, jump: true }),
  // doble salto: soltar un cuadro antes de f2 y volver a apretar
  doble: f2 => k => ({ x: 1, jump: k !== f2 - 1 }),
  // dash en el aire en el cuadro fd (después de saltar)
  dashAire: fd => k => ({ x: 1, jump: true, dash: k === fd }),
  dobleDash: (f2, fd) => k => ({ x: 1, jump: k !== f2 - 1, dash: k === fd }),
  // SUPER: dash en el suelo y SALTO al cuadro siguiente
  superJ: () => k => ({ x: 1, dash: k === 0, jump: k >= 1 }),
  // HYPER: dash ↘ en el suelo (wavedash) y SALTO al cuadro siguiente, soltando ↓ después
  hyper: () => k => ({ x: 1, y: k <= 1 ? -1 : 0, dash: k === 0, jump: k >= 1 }),
  // salto largo de barrida: ↓ corriendo (barrida) y SALTO al cuadro siguiente
  largo: () => k => ({ x: 1, y: k <= 1 ? -1 : 0, jump: k >= 1 }),
};
export function distLab(chId) {
  const o = {};
  const F = (name, script) => { const r = flight(chId, script); o[name] = { d: r2(r.d), t: r2(r.t), h: r2(r.h), vx: r1(r.vmax), tricks: r.tricks.join('+') }; return r; };
  F('correr', S.correr());
  { const [f2] = argmax(range(2, 60), f => flight(chId, S.doble(f)).d), r = flight(chId, S.doble(f2)); o.doble = { d: r2(r.d), t: r2(r.t), h: r2(r.h), f2, tricks: r.tricks.join('+') }; }
  { const [fd] = argmax(range(1, 40), f => flight(chId, S.dashAire(f)).d), r = flight(chId, S.dashAire(fd)); o.dashAire = { d: r2(r.d), t: r2(r.t), h: r2(r.h), fd, tricks: r.tricks.join('+') }; }
  { // doble + dash: barrido de las dos
    let best = null, bd = -1;
    for (const f2 of range(2, 50, 2)) for (const fd of range(1, 40, 2)) { const r = flight(chId, S.dobleDash(f2, fd)); if (r.d > bd) bd = r.d, best = { f2, fd, r }; }
    o.dobleDash = { d: r2(best.r.d), t: r2(best.r.t), h: r2(best.r.h), f2: best.f2, fd: best.fd, tricks: best.r.tricks.join('+') };
  }
  F('largo', S.largo());
  F('super', S.superJ());
  F('hyper', S.hyper());
  return o;
}

// Wavedash y barrida
export function slideLab(chId) {
  const T = floorTerr(), o = {};
  { // wavedash en el suelo corriendo
    const e = runUp(chId, T);
    tick(e, { x: 1, y: -1, dash: true });
    o.wavedash = r1(e.p.vx);
    const x0 = e.p.x;
    let k = 0;
    while (e.p.slide && k++ < 400) tick(e, { x: 1, y: -1 });
    o.wavedashDist = r1(e.p.x - x0), o.wavedashT = r2(k / HZ);
  }
  { // wavedash desde quieto
    const e = actor(chId, T, 20, FLOOR, true);
    tick(e, { x: 1, y: -1, dash: true });
    o.wavedashQuieto = r1(e.p.vx);
  }
  { // wavedash aéreo: dash ↘ desde poco más de un metro de altura, que toca el suelo antes de que se acabe el dash
    const e = actor(chId, T, 20, FLOOR + 1.2, false);
    tick(e, { x: 1, y: -1, dash: true });
    let k = 0;
    while (!e.p.ground && k++ < 100) tick(e, { x: 1, y: -1 });
    o.wavedashAire = r1(e.p.vx), o.wavedashAireTrucos = e.tricks.join('+');
  }
  { // barrida corriendo: ↓ a tope
    const e = runUp(chId, T), v0 = e.p.vx, x0 = e.p.x;
    tick(e, { x: 1, y: -1 });
    o.barridaV = r1(e.p.vx);
    let k = 1;
    while (e.p.slide && k++ < 400) tick(e, { x: 1, y: -1 });
    o.barridaDist = r1(e.p.x - x0), o.barridaT = r2(k / HZ), o.v0 = r1(v0);
  }
  { // una barrida que se frena con ↓ apretado no tiene que quedar como `slide` (golpearía a quien lo toque)
    const e = runUp(chId, T);
    for (let k = 0; k < 600; k++) tick(e, { y: -1 });
    o.agachadoSlide = e.p.slide;
  }
  return o;
}

// ---------------------------------------------------------------------------------------------------------------
// PARED
// ---------------------------------------------------------------------------------------------------------------
// Dos paredes de 2 m separadas por gap m, altísimas. Guion: contra una pared se aprieta SALTO (soltando un cuadro entre
// apretones, hasta que salga el salto de pared); después se sostiene SALTO hold cuadros (para no cortar el salto).
// Siempre ⟶ hacia la otra pared. Mide la velocidad de ascenso en régimen (entre 1 s y 5 s) y si sigue vivo.
export function wallClimb(chId, gap, hold) {
  const T = floorTerr(80, 140, T => { box(T, 20, 0, 22, 130, DIRT); box(T, 22 + gap, 0, 24 + gap, 130, DIRT); });
  const e = actor(chId, T, 22 + HW + 0.01, 30, false);
  e.p.air = 0, e.p.dashN = 0;
  let left = 0, jumps = 0, side = 1, y1 = 30, ok = true;
  for (let k = 0; k < 300; k++) {
    const touching = e.p.wall !== 0;
    if (touching) side = -e.p.wall;
    let jump = false;
    if (left > 0) jump = true, left--;
    else if (touching && !e.p.held) jump = true; // apretón nuevo
    const before = e.jumps.length;
    tick(e, { x: side, jump });
    if (e.jumps.length > before) jumps++, left = hold;
    if (k === 59) y1 = e.p.y;
    if (e.p.y < 10 || (k > 20 && e.p.vy < -18)) { ok = false; break; } // se cayó
  }
  return { jumps, rate: ok ? (e.p.y - y1) / 4 : -1, vivo: ok };
}
export function wallLab(chId) {
  const o = { escalera: [] };
  { // deslizar: pegado a una pared, empujando hacia ella
    const T = floorTerr(80, 140, T => box(T, 20, 0, 22, 130, DIRT));
    const e = actor(chId, T, 22 + HW + 0.01, 60, false);
    e.p.air = 0;
    for (let k = 0; k < 90; k++) tick(e, { x: -1 });
    o.desliza = r1(-e.p.vy);
    // sin empujar hacia la pared no frena
    const e2 = actor(chId, T, 22 + HW + 0.01, 60, false);
    for (let k = 0; k < 90; k++) tick(e2, { x: 0 });
    o.cayendoLibre = r1(-e2.p.vy);
  }
  for (const gap of [1.5, 2, 3, 4, 5, 6, 8]) {
    const [hold] = argmax(range(0, 16), h => { const w = wallClimb(chId, gap, h); return w.vivo ? w.rate : -1; });
    const w = wallClimb(chId, gap, hold);
    o.escalera.push({ gap, hold, jumps: w.jumps, rate: r1(w.rate), vivo: w.vivo });
  }
  { // pared sola: ¿se puede trepar saltando siempre de la misma pared? (alejarse `back` cuadros y volver)
    const T = floorTerr(80, 140, T => box(T, 20, 0, 22, 130, DIRT));
    let best = 0, bh = 0, bb = 0;
    for (const hold of range(0, 16)) for (const back of range(0, 30, 2)) {
      const e = actor(chId, T, 22 + HW + 0.01, 30, false);
      e.p.air = 0, e.p.dashN = 0;
      let left = 0, off = 999, top = 30;
      for (let k = 0; k < 240; k++) {
        const touching = e.p.wall !== 0;
        let jump = false;
        const x = off < back ? 1 : -1; // después del salto, ⟶ se aleja; vuelve a la pared después de back cuadros
        if (left > 0) jump = true, left--;
        else if (touching && !e.p.held) jump = true;
        off++;
        const before = e.jumps.length;
        tick(e, { x, jump });
        if (e.jumps.length > before) left = hold, off = 0;
        top = Math.max(top, e.p.y);
        if (e.p.y < 10) break;
      }
      if (top - 30 > best) best = top - 30, bh = hold, bb = back;
    }
    o.sola = r2(best), o.solaHold = bh, o.solaBack = bb;
  }
  return o;
}

// ---------------------------------------------------------------------------------------------------------------
// PICADA
// ---------------------------------------------------------------------------------------------------------------
export function poundLab(chId) {
  const T = floorTerr(), o = {};
  const run = hold => {
    const e = actor(chId, T, 50, 30, false);
    tick(e, { y: -1, dash: true });
    let k = 1, vmax = 0, top = 0;
    while (e.p.pound && k < 200) { vmax = Math.max(vmax, -e.p.vy); tick(e, { y: -1, jump: hold }); k++; }
    for (let f = 0; f < 120; f++) { tick(e, { jump: hold }); top = Math.max(top, e.p.y - FLOOR); if (f > 3 && e.p.ground) break; }
    return { v: vmax, t: k / HZ, top };
  };
  const a = run(true), b = run(false);
  o.v = r1(a.v), o.caida = r2(a.t), o.rebote = r2(a.top), o.sinRebote = r2(b.top);
  return o;
}

// ---------------------------------------------------------------------------------------------------------------
// LIGA
// ---------------------------------------------------------------------------------------------------------------
// Techo (una losa) a distancia d del punto de la mano, por un rayo a 45° hacia arriba-adelante.
function hookWorld(d) {
  const x0 = 30, hy = FLOOR + HAND_Y, yb = hy + d / Math.SQRT2;
  return { T: floorTerr(240, 120, T => box(T, x0, yb, 200, yb + 6, DIRT)), x0, yb, hy };
}
// Rastreo de una liga: se mantiene `rel` cuadros y se suelta (con SALTO o sin él); rapidez al soltar y altura que alcanza
function hookTrace(chId, d, rel, withJump) {
  const { T, x0 } = hookWorld(d);
  const e = actor(chId, T, x0, FLOOR, true);
  const A = 1 / Math.SQRT2;
  let vmax = 0, top = FLOOR, vRel = 0, att = false, relDone = false, yr = 0;
  for (let k = 0; k < 240; k++) {
    const holding = k < rel;
    tick(e, { hook: holding, ax: A, ay: A, jump: withJump && k === rel });
    if (e.p.hook) att = true;
    if (holding) vmax = Math.max(vmax, Math.hypot(e.p.vx, e.p.vy));
    if (!holding && !relDone) relDone = true, vRel = Math.hypot(e.p.vx, e.p.vy), yr = e.p.y;
    top = Math.max(top, e.p.y);
    if (k > rel + 3 && e.p.ground) break;
  }
  return { att, vmax, vRel, top, apexGain: top - yr };
}
export function hookLab(chId) {
  const ch = charOf(chId), L = cfg.HOOK_LEN * ch.hookLen, o = { alcance: r1(L), tiro: [] };
  { // alcance efectivo contra un techo con el rayo a 45° (el cono de gracia lo estira: gira hacia la losa)
    let last = 0;
    for (let d = 2; d <= L + 6; d += 0.25) {
      const { T, x0 } = hookWorld(d), e = actor(chId, T, x0, FLOOR, true);
      tick(e, { hook: true, ax: 0.7071, ay: 0.7071 });
      if (e.p.shot && e.p.shot.hit) last = d;
    }
    o.alcanceReal = r2(last);
  }
  { // contra una pared lisa y recta (sin cono): el alcance nominal
    let last = 0;
    for (let d = 2; d <= L + 6; d += 0.25) {
      const T = floorTerr(240, 120, T => box(T, 30 + d + 0.5, 0, 33 + d, 100, DIRT)), e = actor(chId, T, 30, 50, false);
      tick(e, { hook: true, ax: 1, ay: 0 });
      if (e.p.shot && e.p.shot.hit && e.p.shot.x > 30 + d) last = d;
    }
    o.alcanceRecto = r2(last);
  }
  for (const d of [4, 6, 8, L * 0.9]) {
    if (d > L) continue;
    const base = hookTrace(chId, d, 200, false); // mantiene hasta chocar con la losa: tirón máximo
    let best = null;
    for (let rel = 3; rel <= 60; rel++) {
      const a = hookTrace(chId, d, rel, true), b = hookTrace(chId, d, rel, false);
      if (!a.att) continue;
      if (!best || a.top > best.top) best = { rel, top: a.top, ganaSalto: a.apexGain - b.apexGain, vRel: a.vRel, topSin: b.top, vmax: a.vmax };
    }
    o.tiro.push({ d: r1(d), vmax: r1(base.vmax), mejorSoltar: best ? best.rel : null, topConSalto: best ? r1(best.top - FLOOR) : null,
      topSinSalto: best ? r1(best.topSin - FLOOR) : null, ganaSalto: best ? r2(best.ganaSalto) : null, vRel: best ? r1(best.vRel) : null });
  }
  return o;
}

// ---------------------------------------------------------------------------------------------------------------
// RECUPERACIÓN: envolvente por personaje
// ---------------------------------------------------------------------------------------------------------------
// Escenario: una tabla de 1 m de grosor y 60 m de largo cuyo borde izquierdo está en x = STAGE_X (arriba en y = TOP);
// el personaje arranca QUIETO en el aire a xo m afuera (a la izquierda del borde) e yo m más abajo que la tabla, con
// todo cargado. Gana si aterriza sobre la tabla; pierde si cae más de DEPTH m por debajo de ella (el agua, como en
// las islas: ~11 m) o se le acaba el tiempo. Sin acantilado abajo (el caso más duro: nada de paredes); con
// --acantilado el borde es un bloque macizo de 20 m (se puede deslizar y saltar de la pared).
// Búsqueda: guiones por reglas con parámetros. Siempre se empuja hacia el escenario. Los saltos en el aire se aprietan
// cuando vy baja de vj; el dash se hace en el cuadro td (o apenas se pueda, recarga incluida) hacia →, ↗ o ↑; la liga
// sale en el cuadro th hacia el borde (con un desvío off°), se sostiene hasta llegar al ancla (o rel cuadros) y se
// suelta con SALTO, y puede repetirse (shots). Se prueba una grilla de guiones y gana el primero que vuelve. Los
// conjuntos de herramientas: 'salto' (solo saltos), 'dash' (saltos + dash), 'ligaSalto' (saltos + liga, sin dash),
// 'liga' (todo).
const TOP = 40, DEPTH = 11, STAGE_X = 90, TMAX = 170; // la tabla va de STAGE_X a STAGE_X + 60
export function stageTerr(cliff) {
  return floorTerr(200, 100, T => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < T.cols; i++) set(T, i, j, 0); // sin piso: es el vacío
    box(T, STAGE_X, TOP - 1, STAGE_X + 60, TOP, DIRT);
    if (cliff) box(T, STAGE_X, TOP - 20, STAGE_X + 8, TOP, DIRT);
  });
}
const DASH_DIRS = [[1, 0], [1, 1], [0, 1]]; // →, ↗, ↑
const attachedNow = (p, t) => !!p.hook && t >= p.hook.at;
export function tryRecover(chId, T, xo, yo, plan, trace) {
  const e = actor(chId, T, STAGE_X - xo, TOP - yo, false), p = e.p;
  let shots = 0, dashes = 0, att = -1, lastShot = -99;
  for (let k = 0; k < TMAX; k++) {
    const inp = { x: 1 };
    if (p.hook) {
      inp.hook = true;
      if (attachedNow(p, e.s.t) && att < 0) att = k;
      const hx = p.hook.x - p.x, hy = p.hook.y - (p.y + HAND_Y);
      if (att >= 0 && (plan.hook.rel === 0 ? Math.hypot(hx, hy) < 1.8 || k - att > 45 : k - att >= plan.hook.rel)) inp.hook = false, inp.jump = true;
    } else {
      att = -1;
      // nueva liga hacia el borde
      if (plan.hook && shots < plan.hook.shots && k >= plan.hook.th + 9 * shots && p.charge >= 1 && k >= lastShot + 10 && p.y < TOP) {
        const a = Math.atan2(TOP - 0.5 - (p.y + HAND_Y), STAGE_X - p.x) + plan.hook.off * Math.PI / 180;
        inp.hook = true, inp.ax = Math.cos(a), inp.ay = Math.sin(a), shots++, lastShot = k;
      } else {
        // saltos en el aire (soltar el cuadro anterior para que cuente como apretón nuevo)
        if (plan.jump && p.air >= 1 && p.vy < plan.vj && !p.held) inp.jump = true;
        else if (p.held && p.rise) inp.jump = true;
        // dash
        const d = plan.dash && plan.dash[dashes];
        if (d && k >= d.t && p.dashN >= 1 && e.s.t >= p.dashCdT) inp.dash = true, inp.x = d.d[0], inp.y = d.d[1], dashes++;
      }
    }
    tick(e, inp);
    if (trace) trace.push([k, r2(p.x - STAGE_X), r2(p.y - TOP), r1(p.vx), r1(p.vy), p.hook ? 'H' : '', inp.dash ? 'D' : '', inp.jump ? 'J' : '']);
    if (p.ground && Math.abs(p.y - TOP) < 0.02 && p.x > STAGE_X - HW) return true;
    if (p.y < TOP - DEPTH) return false;
  }
  return false;
}
export function* plansFor(setName, ch, fast) {
  const vjS = fast ? [3, -4] : [3, 0, -4, -9], tdS = fast ? [0, 8, 18] : [0, 4, 8, 12, 18, 26];
  const thS = fast ? [0, 8, 16] : [0, 4, 8, 12, 17, 24], offS = fast ? [0, 15] : [-8, 0, 10, 22], relS = fast ? [0] : [0, 8];
  const withDash = setName === 'dash' || setName === 'liga';
  const base = [];
  for (const vj of vjS) {
    base.push({ jump: true, vj, dash: null });
    if (!withDash) continue;
    for (const td of tdS) for (const dd of DASH_DIRS) {
      base.push({ jump: true, vj, dash: [{ t: td, d: dd }] });
      if (ch.dashN > 1) for (const d2 of DASH_DIRS) base.push({ jump: true, vj, dash: [{ t: td, d: dd }, { t: td + 27, d: d2 }] });
    }
  }
  if (setName === 'salto' || setName === 'dash') { yield* base; return; }
  for (const th of thS) for (const off of offS) for (const rel of relS) for (const shots of ch.hookN > 2 ? [1, 2, 3] : [1, 2]) for (const b of base)
    yield { ...b, hook: { th, off, rel, shots } };
}
// Guion al azar (semilla fija por celda y herramientas, así la medición es reproducible): saltos cuando vy baja de vj,
// hasta dos dashes en cualquier momento (también después de soltar la liga) y hasta 3 tiros de liga.
function randomPlan(rnd, setName, ch) {
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = a => a[Math.floor(rnd() * a.length)];
  const p = { jump: true, vj: pick([6, 3, 0, -3, -6, -9, -12]), dash: null };
  if (setName === 'dash' || setName === 'liga') {
    const d = [];
    for (let i = ri(0, ch.dashN > 1 ? 2 : 1); i > 0; i--) d.push({ t: ri(0, 50), d: pick([[1, 0], [1, 1], [0, 1], [1, -1], [1, 0.5]]) });
    p.dash = d.sort((a, b) => a.t - b.t);
  }
  if (setName === 'ligaSalto' || setName === 'liga') p.hook = { th: ri(0, 60), off: ri(-25, 30), rel: pick([0, 0, 5, 10, 20]), shots: ri(1, ch.hookN > 2 ? 3 : 2) };
  return p;
}
// ¿Hay algún guion que vuelva? Primero la grilla de guiones (barata), después `budget` guiones al azar.
export function canRecover(chId, T, xo, yo, setName, fast = false) {
  const ch = charOf(chId);
  for (const pl of plansFor(setName, ch, fast)) if (tryRecover(chId, T, xo, yo, pl)) return true;
  let seed = (xo * 7919 + yo * 104729 + setName.length * 31 + chId.length * 17) >>> 0 || 1;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = fast ? 300 : 3000; i > 0; i--) if (tryRecover(chId, T, xo, yo, randomPlan(rnd, setName, ch))) return true;
  return false;
}
export const REC_XS = range(1, 18, 1), REC_YS = range(0, 9, 1);
export function recoverLab(chId, { fast = false, cliff = false } = {}) {
  const T = stageTerr(cliff), xs = REC_XS, ys = REC_YS;
  const res = { xs, ys, grid: {} };
  for (const setName of ['salto', 'dash', 'ligaSalto', 'liga']) {
    const g = ys.map(() => xs.map(() => false));
    // monotonía: si (x, y) falla, (x+2, y) y (x, y+1) se dan por fallidos (acelera la búsqueda)
    for (let a = 0; a < ys.length; a++) for (let b = 0; b < xs.length; b++) {
      if ((a > 0 && !g[a - 1][b]) || (b > 0 && !g[a][b - 1])) continue;
      // lo que ya vuelve con menos herramientas vuelve con más: se hereda
      const inh = setName === 'dash' ? res.grid.salto[a][b] : setName === 'ligaSalto' ? res.grid.salto[a][b]
        : setName === 'liga' ? res.grid.dash[a][b] || res.grid.ligaSalto[a][b] : false;
      g[a][b] = inh || canRecover(chId, T, xs[b], ys[a], setName, fast);
    }
    res.grid[setName] = g;
  }
  // frontera: x máxima a cada profundidad (por herramienta) y área (celdas que vuelven)
  res.xmax = {}, res.area = {};
  for (const s of Object.keys(res.grid)) {
    const g = res.grid[s];
    res.xmax[s] = ys.map((_, a) => { let m = -1; xs.forEach((x, b) => { if (g[a][b]) m = x; }); return m; });
    res.area[s] = g.flat().filter(Boolean).length;
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------------------
// CRITERIOS de calibración (los del encargo): se evalúan sobre lo medido y se imprimen con ✓/✗
// ---------------------------------------------------------------------------------------------------------------
// Zona objetivo de recuperación: de 8 a 12 m afuera y de 4 a 6 m abajo.
export function criteria(R) {
  const out = [], add = (id, ok, txt) => out.push({ id, ok: !!ok, txt });
  const ids = Object.keys(R.dist ?? R.salto ?? R.recup ?? {});
  if (R.dist) {
    for (const c of ids) {
      const d = R.dist[c];
      add('a. orden ' + c, d.hyper.d > d.super.d && d.super.d > d.largo.d && d.largo.d > d.correr.d && !d.largo.tricks.includes('HYPER'),
        `HYPER ${d.hyper.d} > SUPER ${d.super.d} > largo ${d.largo.d} > correr ${d.correr.d} (largo sin HYPER: ${!d.largo.tricks.includes('HYPER')})`);
    }
  }
  if (R.salto) {
    const b = R.salto.bombin ?? R.salto[ids[0]];
    // más floaty a pedido del usuario (2026-10-09): subida más lenta, pero bajar desde la cima no puede ser eterno
    add('c. subida ~0,35 s', b.subida >= 0.32 && b.subida <= 0.4, `subida ${b.subida} s`);
    add('c. bajar no es eterno', b.vuelo - b.subida <= 0.36, `de la cima al suelo ${r2(b.vuelo - b.subida)} s`);
    add('c. carrera rápida', b.vmax >= 9.5 && b.t90 <= 0.2, `${b.vmax} m/s, 90 % en ${b.t90} s`);
    add('c. giro firme', b.giroT <= 0.25, `media vuelta en ${b.giroT} s, frena en ${b.frenoDist} m`);
  }
  if (R.recup) {
    const z = (r, set) => { // celdas de la zona objetivo que vuelven con ese conjunto
      let n = 0, tot = 0;
      r.ys.forEach((y, a) => r.xs.forEach((x, b) => { if (x >= 8 && x <= 12 && y >= 4 && y <= 6) tot++, n += r.grid[set][a][b] ? 1 : 0; }));
      return [n, tot];
    };
    const B = R.recup.bombin;
    if (B) {
      const [nj] = z(B, 'salto'), [nd] = z(B, 'dash'), [nl, tot] = z(B, 'liga');
      add('b. zona 8–12 × 4–6: no alcanza con saltos ni con dash', nj === 0 && nd <= tot / 3, `saltos ${nj}/${tot}, +dash ${nd}/${tot}, +liga ${nl}/${tot}`);
      add('b. zona 8–12 × 4–6: la liga rescata la mayoría', nl >= tot * 0.5 && nl - nd > nd, `+liga ${nl}/${tot} (dash ${nd})`);
      add('b. la liga rescata más que el dash', B.area.liga - B.area.dash > B.area.dash - B.area.salto, `área +dash ${B.area.dash - B.area.salto}, +liga ${B.area.liga - B.area.dash} (saltos ${B.area.salto})`);
    }
    const A = R.recup;
    if (A.kunai && B) add('d. KUNAI: sus saltos solos llegan más lejos', A.kunai.area.salto >= B.area.salto + 8, `saltos solos: KUNAI ${A.kunai.area.salto} vs BOMBÍN ${B.area.salto} celdas`);
    if (A.turbo && B) add('d. TURBO: con dash llega más lejos', A.turbo.area.dash >= B.area.dash * 1.25, `+dash: TURBO ${A.turbo.area.dash} vs BOMBÍN ${B.area.dash}`);
    if (A.muu && B) add('d. MUU: la que menos se recupera', A.muu.area.liga <= B.area.liga && Object.keys(A).every(c => A[c].area.liga >= A.muu.area.liga), `+liga: MUU ${A.muu.area.liga}, BOMBÍN ${B.area.liga}`);
    if (A.lia && B) add('d. LÍA: la mejor liga', Object.keys(A).every(c => A[c].area.liga - A[c].area.dash <= A.lia.area.liga - A.lia.area.dash), `área que suma la liga: LÍA ${A.lia.area.liga - A.lia.area.dash}, BOMBÍN ${B.area.liga - B.area.dash}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------------------------------------------
export function measure({ solo = [], chars = CH_IDS, fast = false, cliff = false } = {}) {
  const want = k => !solo.length || solo.includes(k);
  const R = { cfg: Object.fromEntries(Object.keys(RANGES).map(k => [k, cfg[k]])), g: r2(gravity(cfg)) };
  if (want('salto')) R.salto = Object.fromEntries(chars.map(c => [c, { ...jumpLab(c), ...runLab(c) }]));
  if (want('dist')) R.dist = Object.fromEntries(chars.map(c => [c, { ...distLab(c), ...slideLab(c) }]));
  if (want('pared')) R.pared = Object.fromEntries(chars.map(c => [c, wallLab(c)]));
  if (want('picada')) R.picada = Object.fromEntries(chars.map(c => [c, poundLab(c)]));
  if (want('liga')) R.liga = Object.fromEntries(chars.map(c => [c, hookLab(c)]));
  if (want('recup')) R.recup = Object.fromEntries(chars.map(c => [c, recoverLab(c, { fast, cliff })]));
  R.criterios = criteria(R);
  return R;
}

function print(R, chars, cliff) {
  const pad = (v, n = 8) => String(v).padStart(n);
  const head = t => console.log('\n== ' + t + ' ==');
  const cols = title => {
    console.log(title.padEnd(28) + chars.map(c => c.toUpperCase().padStart(9)).join(''));
    return (label, f) => console.log(label.padEnd(28) + chars.map(c => pad(f(c), 9)).join(''));
  };
  console.log(`gravedad del salto ${R.g} m/s²  (JUMP_H ${cfg.JUMP_H} m, JUMP_T ${cfg.JUMP_T} s, caída ×${cfg.FALL_G})`);
  if (R.salto) {
    head('CARRERA Y SALTO');
    const row = cols('');
    row('carrera a tope m/s', c => R.salto[c].vmax);
    row('90 % de la carrera s', c => R.salto[c].t90);
    row('  distancia hasta ahí m', c => R.salto[c].d90);
    row('frenar soltando: m', c => R.salto[c].frenoDist);
    row('girar (a ½ carrera) s', c => R.salto[c].giroT);
    row('altura del salto m', c => R.salto[c].h);
    row('subida s', c => R.salto[c].subida);
    row('vuelo s', c => R.salto[c].vuelo);
    row('salto corto m', c => R.salto[c].corto);
    row('todos los saltos m', c => R.salto[c].todos);
    row('  vuelo con todos s', c => R.salto[c].vueloTodos);
  }
  if (R.dist) {
    head('ALCANCE DE LOS TRUCOS (m, desde correr a tope; de la 1ª tecla al aterrizaje)');
    const row = cols('');
    for (const [k, n] of [['correr', 'salto corriendo'], ['doble', '+ doble salto'], ['dashAire', '+ dash en el aire'], ['dobleDash', '+ doble + dash'],
      ['largo', 'salto largo (barrida)'], ['super', 'SUPER (dash+salto)'], ['hyper', 'HYPER (wavedash+salto)']]) row(n, c => R.dist[c][k].d);
    row('  altura SUPER m', c => R.dist[c].super.h);
    row('  altura HYPER m', c => R.dist[c].hyper.h);
    row('  altura largo m', c => R.dist[c].largo.h);
    row('  velocidad SUPER m/s', c => R.dist[c].super.vx);
    row('  velocidad HYPER m/s', c => R.dist[c].hyper.vx);
    row('  velocidad largo m/s', c => R.dist[c].largo.vx);
    row('wavedash en suelo m/s', c => R.dist[c].wavedash);
    row('wavedash desde quieto', c => R.dist[c].wavedashQuieto);
    row('wavedash aéreo m/s', c => R.dist[c].wavedashAire);
    row('  barrida tras él m', c => R.dist[c].wavedashDist);
    row('  y dura s', c => R.dist[c].wavedashT);
    row('barrida: arranca m/s', c => R.dist[c].barridaV);
    row('barrida: distancia m', c => R.dist[c].barridaDist);
    row('barrida: duración s', c => R.dist[c].barridaT);
    row('quieto agachado = barrida', c => R.dist[c].agachadoSlide ? 'SÍ (bug)' : 'no');
    for (const c of chars) { const d = R.dist[c]; console.log(`  ${c}: trucos correr[${d.correr.tricks}] largo[${d.largo.tricks}] super[${d.super.tricks}] hyper[${d.hyper.tricks}]`); }
  }
  if (R.pared) {
    head('PARED');
    const row = cols('');
    row('deslizar m/s', c => R.pared[c].desliza);
    row('sin empujar: cae m/s', c => R.pared[c].cayendoLibre);
    for (let k = 0; k < R.pared[chars[0]].escalera.length; k++) {
      const g = R.pared[chars[0]].escalera[k].gap;
      row(`escalera ${g} m: sube m/s`, c => { const z = R.pared[c].escalera[k]; return z.vivo ? `${z.rate}/${z.jumps}` : '—'; });
    }
    row('pared sola: sube m', c => R.pared[c].sola);
    console.log('(escalera: m/s de ascenso entre 1 s y 5 s / saltos de pared; — = no se sostiene entre las dos paredes)');
  }
  if (R.picada) {
    head('PICADA');
    const row = cols('');
    row('velocidad m/s', c => R.picada[c].v);
    row('caída desde 29 m s', c => R.picada[c].caida);
    row('rebote (SALTO) m', c => R.picada[c].rebote);
    row('sin SALTO m', c => R.picada[c].sinRebote);
  }
  if (R.liga) {
    head('LIGA (anclada en un techo a 45° de la mano; soltar con SALTO)');
    const row = cols('');
    row('alcance m', c => R.liga[c].alcance);
    row('alcance recto medido m', c => R.liga[c].alcanceRecto);
    row('techo a 45° (con cono) m', c => R.liga[c].alcanceReal);
    for (let k = 0; k < R.liga[chars[0]].tiro.length; k++) {
      const t = c => R.liga[c].tiro[k];
      if (!t(chars[0])) continue;
      row(`ancla a ${t(chars[0]).d} m: tirón m/s`, c => t(c)?.vmax ?? '');
      row('  soltar con SALTO: sube m', c => t(c)?.topConSalto ?? '');
      row('  soltar sin SALTO: sube m', c => t(c)?.topSinSalto ?? '');
      row('  gana por el SALTO m', c => t(c)?.ganaSalto ?? '');
    }
  }
  if (R.recup) {
    head('ENVOLVENTE DE RECUPERACIÓN (arranca quieto a x m afuera del borde e y m abajo)');
    console.log(`  letras = herramienta mínima: j saltos · d + dash · l + liga (sin dash) · L liga y dash juntos · · no vuelve  ${cliff ? '(con acantilado)' : '(tabla sin paredes)'}`);
    for (const c of chars) {
      const r = R.recup[c];
      console.log(`\n${c.toUpperCase()}  x→ ${r.xs.map(x => String(x).padStart(2)).join(' ')}`);
      r.ys.forEach((y, a) => {
        const line = r.xs.map((x, b) => {
          const g = r.grid;
          return g.salto[a][b] ? 'j' : g.dash[a][b] ? 'd' : g.ligaSalto[a][b] ? 'l' : g.liga[a][b] ? 'L' : '·';
        });
        console.log(`  y ${String(y).padStart(2)} ↓    ${line.map(v => ' ' + v).join(' ')}`);
      });
      const fx = s => r.xmax[s].map(v => v < 0 ? '-' : v).join(',');
      console.log(`  x máx. por profundidad 0..${r.ys.at(-1)}: saltos ${fx('salto')} | +dash ${fx('dash')} | +liga ${fx('ligaSalto')} | todo ${fx('liga')}`);
      console.log(`  celdas que vuelven: saltos ${r.area.salto} · +dash ${r.area.dash} · saltos+liga ${r.area.ligaSalto} · todo ${r.area.liga} (de ${r.xs.length * r.ys.length})`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const flag = k => argv.includes('--' + k);
  const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  for (const kv of (arg('set', '') || '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (!(k in RANGES)) throw new Error('clave desconocida: ' + k);
    cfg[k] = +v;
  }
  const solo = (arg('solo', '') || '').split(',').filter(Boolean);
  const chars = (arg('ch', '') || '').split(',').filter(Boolean);
  const R = measure({ solo, chars: chars.length ? chars : CH_IDS, fast: flag('rapido'), cliff: flag('acantilado') });
  if (flag('json')) console.log(JSON.stringify(R, null, 1));
  else {
    if (!flag('resumen')) print(R, chars.length ? chars : CH_IDS, flag('acantilado'));
    if (R.criterios.length) {
      console.log('\n== CRITERIOS ==');
      for (const c of R.criterios) console.log(`${c.ok ? '✓' : '✗'} ${c.id}: ${c.txt}`);
    }
  }
}
