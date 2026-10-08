// Un paso de 60 Hz de la partida entera (lo corre solo el anfitrión, o el juego solo). Orden: peligros del mapa →
// cada jugador (ulti, cartas, movimiento) → golpes de cartas → proyectiles → objetos → zonas y rayos → choques de
// cuerpo → fuera del ring → recargas → cajas → tiempo.
// Puntos: un KO vale +1 para quien te tocó por última vez (hasta KO_CREDIT s antes); caerse solo es −1. Con el tiempo
// cumplido gana el que más tiene; si hay empate, MUERTE SÚBITA: todos al 300 % hasta que alguien desempate.
import { CARDS, type Card } from './cards.ts';
import { charOf } from './chars.ts';
import { BLAST_X, BLAST_TOP } from './maps.ts';
import { boxFree, groundBelow, carve, solidAt } from './terrain.ts';
import { rnd, rndInt, rndRange, pick } from './rng.ts';
import { movePlayer } from './move.ts';
import { cast, attacks, projectiles, props, zones, contacts, hurt, boom, newProp } from './combat.ts';
import type { Boom } from './cards.ts';
import { startUlti, ultiStep } from './ulti.ts';
import { HZ, DT, NEVER, GO, HW, H, NO_INPUT, ev, enemies, inUlti, height, type State, type World, type Pl, type Input } from './state.ts';

export * from './state.ts';

export function step(s: State, w: World, inputs: (Input | undefined)[]) {
  s.t++, s.ev = [];
  const t = s.t, c = w.c;
  if (s.over) return;
  if (t === GO * HZ) ev(s, 'go');
  for (const p of s.pl) if (!p.alive && t >= p.spawnT) spawn(s, w, p);
  if (t < GO * HZ) { for (const p of s.pl) p.vx = p.vy = 0; return; }
  hazards(s, w);
  for (const p of s.pl) {
    if (!p.alive) continue;
    const i = inputs[p.id] ?? NO_INPUT;
    const press = i.ulti && !p.ultiHeld;
    p.ultiHeld = i.ulti;
    if (press && !p.u) startUlti(s, w, p, i);
    if (p.u && ultiStep(s, w, p, i, press && t > p.u.t0)) { p.held = i.jump, p.dashHeld = i.dash, p.hookHeld = i.hook; continue; }
    if (i.cast >= 0) cast(s, w, p, i.cast, i);
    if (p.atk && p.atk.k === 'katana') { attacks(s, w, p); continue; }
    unstick(s, w, p);
    movePlayer(s, w, p, i);
    attacks(s, w, p);
  }
  projectiles(s, w);
  props(s, w);
  zones(s, w);
  contacts(s, w);
  pads(s, w);
  for (const p of s.pl) if (p.alive) outOfRing(s, w, p);
  // Recargas: maná, cargas de la liga, ulti con el tiempo
  for (const p of s.pl) {
    if (!p.alive) continue;
    const ch = charOf(p.ch);
    p.mana = Math.min(c.MANA_MAX, p.mana + c.MANA_REGEN * DT);
    p.charge = Math.min(ch.hookN, p.charge + DT / (c.HOOK_CD * ch.hookCd) * (p.ground ? 2 : 1));
    if (!p.u) p.ulti = Math.min(100, p.ulti + c.ULTI_PASSIVE * DT);
  }
  crates(s, w);
  clock(s, w);
}

// Si quedó dentro del terreno (al bajarse del tren, un intercambio entre alturas distintas…): al lugar libre más
// cercano hacia arriba o a los costados; si no hay, se rompe la tierra alrededor (la piedra no: ahí sigue buscando).
function unstick(s: State, w: World, p: Pl) {
  const h = height(p);
  if (boxFree(w.T, p.x, p.y, HW, h)) return;
  for (let d = 0.25; d <= 4; d += 0.25) for (const [dx, dy] of [[0, d], [d, 0], [-d, 0], [0, -d]]) {
    if (boxFree(w.T, p.x + dx, p.y + dy, HW, h)) { p.x += dx, p.y += dy; return; }
  }
  carve(w.T, [0, p.x, p.y + h / 2, 1]);
}

// Reaparecer: en el punto del mapa más lejos de los rivales vivos, sobre una nube, invulnerable un rato
function spawn(s: State, w: World, p: Pl) {
  const c = w.c, ch = charOf(p.ch), first = s.t <= 1;
  let best = w.m.spawns[p.id % w.m.spawns.length], bd = -1;
  if (!first) for (const sp of w.m.spawns) {
    if (!boxFree(w.T, sp[0], sp[1], HW, H)) continue;
    let d = Infinity;
    for (const q of s.pl) if (q.alive && enemies(s, p, q)) d = Math.min(d, (q.x - sp[0]) ** 2 + (q.y - sp[1]) ** 2);
    d += rnd(s) * 4;
    if (d > bd) bd = d, best = sp;
  }
  Object.assign(p, {
    x: best[0], y: best[1], vx: 0, vy: 0, alive: true, ground: true, crouch: false, slide: false, pound: false,
    dmg: s.sudden ? 300 : s.rules.startDmg, stunT: NEVER, stopT: NEVER, tumble: false, hook: null, shot: null, atk: null, u: null,
    invT: s.t + Math.round(c.SPAWN_INV * HZ) + (first ? GO * HZ : 0), cloudT: s.t + Math.round(3 * HZ) + (first ? GO * HZ : 0),
    fragT: NEVER, leadT: NEVER, glueT: NEVER, shieldT: NEVER, air: ch.airJumps, dashN: ch.dashN, lastBy: -1, lastT: NEVER,
    groundT: s.t, dashT: NEVER, pressT: NEVER,
  });
  ev(s, 'spawn', { p: p.id });
}

// Fuera del ring: el líquido de abajo, los costados y arriba
function outOfRing(s: State, w: World, p: Pl) {
  const m = w.m;
  let how = '';
  if (p.y < m.water - (m.lava ? 0 : 0.5)) how = m.lava ? 'lava' : 'agua';
  else if (p.x < -BLAST_X || p.x > m.w + BLAST_X) how = 'lado';
  else if (p.y > m.h + BLAST_TOP) how = 'arriba';
  if (how) ko(s, w, p, how);
}

export function ko(s: State, w: World, p: Pl, how: string) {
  const c = w.c, t = s.t;
  const by = p.lastBy >= 0 && p.lastBy !== p.id && t - p.lastT <= c.KO_CREDIT * HZ ? s.pl[p.lastBy] : null;
  p.alive = false, p.spawnT = t + Math.round(c.RESPAWN * HZ), p.hook = null, p.u = null, p.atk = null, p.falls++;
  if (by) by.score++, by.kos++, by.ulti = Math.min(100, by.ulti + c.ULTI_KO);
  else p.score--;
  ev(s, 'ko', { p: p.id, by: by ? by.id : -1, how, x: Math.max(0, Math.min(w.m.w, p.x)), y: Math.max(w.m.water, Math.min(w.m.h, p.y)) });
  for (const q of s.pr) if (q.st === 2 && q.sp === p.id) q.st = 0;
  if (s.sudden) { const st = standings(s); if (st.unique) finish(s); }
}

// Trampolines (hongos del mapa NUBES)
function pads(s: State, w: World) {
  for (const pd of w.m.pads) for (const p of s.pl) {
    if (!p.alive || p.vy > 1 || Math.abs(p.x - pd.x) > pd.w / 2 + HW || p.y < pd.y - 0.15 || p.y > pd.y + 0.5) continue;
    p.vy = pd.v, p.ground = false, p.air = charOf(p.ch).airJumps, p.dashN = charOf(p.ch).dashN, p.pound = false, p.slide = false;
    p.y = Math.max(p.y, pd.y + 0.5);
    ev(s, 'pad', { p: p.id, x: pd.x, y: pd.y });
  }
}

// Lo que vuela y lastima (hz.bolts): la bala de cañón (recta) y la esquirla de cristal (cae con gravedad)
const BOLT: Record<string, { r: number, g: number, boom: Boom }> = {
  bala: { r: 0.5, g: 0, boom: { r: 2.4, dmg: 14, kb: 14, kg: 12, carve: 1.9 } },
  cristal: { r: 0.4, g: 26, boom: { r: 2, dmg: 10, kb: 11, kg: 11, carve: 1.4 } },
};
function bolts(s: State, w: World) {
  const hz = s.hz, m = w.m, t = s.t;
  for (const b of hz.bolts) {
    const d = BOLT[b.k];
    b.vy -= d.g * DT;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    const n = Math.max(1, Math.ceil(sp * DT / 0.2));
    let hit = false;
    for (let k = 0; k < n && !hit; k++) {
      b.x += b.vx * DT / n, b.y += b.vy * DT / n;
      if (solidAt(w.T, b.x + ux * d.r, b.y + uy * d.r)) hit = true;
      else for (const p of s.pl) {
        if (!p.alive || t < p.invT || inUlti(p)) continue;
        if (Math.abs(b.x - p.x) < HW + d.r && b.y > p.y - d.r && b.y < p.y + height(p) + d.r) { hit = true; break; }
      }
    }
    if (hit) { boom(s, w, b.x, b.y, d.boom, -1, b.k); b.k = ''; }
    else if (b.y < m.water) ev(s, 'splash', { x: b.x, y: m.water, r: d.r }), b.k = '';
    else if (b.x < -25 || b.x > m.w + 25 || b.y > m.h + 25) b.k = '';
  }
  hz.bolts = hz.bolts.filter(b => b.k);
}

// Peligros: viento que alterna de lado (con aviso), rocas del volcán (con marcas), el tren, cañonazos horizontales
// (líneas rojas y después una bala por línea) y racimos de cristales del techo que sueltan una esquirla
function hazards(s: State, w: World) {
  const t = s.t, hz = s.hz, m = w.m;
  const wi = m.hz.wind;
  if (wi) {
    if (!hz.windWarn && !hz.windDir && t >= hz.windNext - wi.warn * HZ) hz.windWarn = rnd(s) < 0.5 ? -1 : 1, ev(s, 'wind', { d: hz.windWarn });
    if (hz.windWarn && t >= hz.windNext) hz.windDir = hz.windWarn, hz.windWarn = 0, hz.windEnd = t + Math.round(wi.dur * HZ);
    if (hz.windDir && t >= hz.windEnd) hz.windDir = 0, hz.windNext = t + Math.round(wi.every * HZ);
    if (hz.windDir) {
      const a = hz.windDir * wi.a * DT;
      for (const p of s.pl) if (p.alive && !inUlti(p) && t >= p.cloudT) p.vx += p.ground ? a * 0.3 : a;
      for (const q of s.pr) if (!q.st) q.vx += a * 0.5;
      for (const o of s.props) if (!o.ground) o.vx += a * 0.5;
    }
  }
  const rk = m.hz.rocks;
  if (rk && t >= hz.rockNext) {
    hz.rockNext = t + Math.round(rk.every * HZ);
    for (let k = 0; k < rk.n; k++) s.beams.push({ id: s.nid++, k: 'roca', o: -1, x: rndRange(s, 6, m.w - 6), y: m.h + 4, dx: 0, dy: -1, t0: t + Math.round(rk.warn * HZ), t1: 0, len: 0 });
    ev(s, 'rumble');
  }
  const tr = m.hz.train;
  if (tr) {
    if (!hz.trainRun && t === hz.trainNext - Math.round(tr.warn * HZ)) ev(s, 'whistle', { d: hz.trainDir });
    if (!hz.trainRun && t >= hz.trainNext) hz.trainRun = true, hz.trainX = hz.trainDir > 0 ? -4 : m.w + 4, hz.trainHit = [];
    if (hz.trainRun) {
      hz.trainX += hz.trainDir * tr.v * DT;
      const x0 = Math.min(hz.trainX, hz.trainX - hz.trainDir * tr.len), x1 = Math.max(hz.trainX, hz.trainX - hz.trainDir * tr.len);
      for (const p of s.pl) {
        if (!p.alive || hz.trainHit.includes(p.id) || inUlti(p)) continue;
        if (p.x + HW > x0 && p.x - HW < x1 && p.y < tr.y + 2.8 && p.y + height(p) > tr.y + 0.75) {
          hz.trainHit.push(p.id);
          hurt(s, w, p, { dmg: 16, kb: 16, kg: 13, dx: hz.trainDir, dy: 0.6, by: -1 });
          p.invT = NEVER;
        }
      }
      for (const o of s.props) if (o.x > x0 && o.x < x1 && o.y < tr.y + 2.8 && o.y + 0.8 > tr.y + 0.75) o.hp = 0;
      if (hz.trainDir > 0 ? x0 > m.w + 4 : x1 < -4) hz.trainRun = false, hz.trainDir = -hz.trainDir, hz.trainNext = t + Math.round(tr.every * HZ);
    }
  }
  const cn = m.hz.cannon;
  if (cn) {
    if (t >= hz.cannonNext) { // tanda nueva: n líneas separadas entre sí por lo menos 4 m
      hz.cannonNext = t + Math.round(cn.every * HZ);
      for (let k = 0; k < cn.n; k++) {
        let y = 0;
        for (let tryN = 0; tryN < 8; tryN++) { y = rndRange(s, cn.y0, cn.y1); if (hz.lanes.every(L => Math.abs(L.y - y) >= 4)) break; }
        hz.lanes.push({ y: Math.round(y * 4) / 4, d: rnd(s) < 0.5 ? -1 : 1, t: t + Math.round(cn.warn * HZ) });
      }
      ev(s, 'cannon', { n: cn.n, y: hz.lanes[hz.lanes.length - 1].y });
    }
    for (const L of hz.lanes) if (t === L.t) {
      hz.bolts.push({ k: 'bala', x: L.d > 0 ? -1.5 : m.w + 1.5, y: L.y, vx: L.d * cn.v, vy: 0 });
      ev(s, 'shot', { kind: 'bala', x: L.d > 0 ? 0 : m.w, y: L.y, d: L.d }), ev(s, 'rumble');
    }
    hz.lanes = hz.lanes.filter(L => t < L.t);
  }
  const cr = m.hz.crystals;
  if (cr) {
    if (t >= hz.dropNext) { // algunos racimos distintos empiezan a temblar
      hz.dropNext = t + Math.round(cr.every * HZ);
      for (let k = 0; k < cr.n; k++) {
        const a = cr.at[Math.floor(rnd(s) * cr.at.length)];
        if (!hz.drops.some(d => d.x === a[0])) hz.drops.push({ x: a[0], y: a[1], t: t + Math.round(cr.warn * HZ) });
      }
      ev(s, 'crystal', { x: hz.drops[hz.drops.length - 1]?.x ?? 0 }), ev(s, 'rumble');
    }
    for (const d of hz.drops) if (t === d.t) hz.bolts.push({ k: 'cristal', x: d.x, y: d.y - 0.3, vx: 0, vy: -3 });
    hz.drops = hz.drops.filter(d => t < d.t);
  }
  bolts(s, w);
}

// Cajas con paracaídas: una carta extra (gratis, en la ranura 5), o ulti o maná
const POOL = CARDS.flatMap((cd: Card) => Array(cd.rar === 0 ? 1 : 3).fill(cd.id) as string[]);
function crates(s: State, w: World) {
  const iv = s.rules.crates;
  if (!iv || s.t < s.crateNext) return;
  s.crateNext = s.t + Math.round(iv * HZ * rndRange(s, 0.7, 1.3));
  if (s.props.filter(o => o.k === 'caja').length >= 3) return;
  let x = 0;
  for (let k = 0; k < 10; k++) { x = rndRange(s, 5, w.m.w - 5); if (groundBelow(w.T, x, w.m.h, w.m.h - w.m.water) !== null) break; }
  const r = rnd(s), card = r < 0.12 ? '+ulti' : r < 0.2 ? '+mana' : pick(s, POOL);
  newProp(s, 'caja', x, w.m.h + 1, 0, -2, -1, card);
  ev(s, 'crate', { x });
}

// Posiciones: ordenadas por puntos (después más KOs, menos caídas). unique = hay un primero solo.
export function standings(s: State) {
  if (s.rules.teams) {
    const tot = [0, 1].map(k => s.pl.filter(p => p.team === k).reduce((a, p) => a + p.score, 0));
    return { teams: tot, unique: tot[0] !== tot[1], winner: tot[0] > tot[1] ? 0 : tot[1] > tot[0] ? 1 : -1, order: [...s.pl].sort((a, b) => b.score - a.score) };
  }
  const order = [...s.pl].sort((a, b) => b.score - a.score || b.kos - a.kos || a.falls - b.falls || a.id - b.id);
  const unique = order.length < 2 || order[0].score > order[1].score;
  return { teams: [] as number[], unique, winner: unique ? order[0].id : -1, order };
}

function finish(s: State) { s.over = true; ev(s, 'end'); }

// El reloj: al llegar a 0, gana el primero; si hay empate, muerte súbita (60 s como mucho, después es empate)
function clock(s: State, w: World) {
  const tm = s.rules.time;
  if (!tm) return;
  const end = (GO + tm) * HZ;
  if (s.t === end) {
    if (standings(s).unique) return finish(s);
    s.sudden = true, s.suddenT = s.t;
    for (const p of s.pl) p.dmg = Math.max(p.dmg, 300);
    ev(s, 'sudden');
  }
  if (s.sudden && s.t >= s.suddenT + 60 * HZ) finish(s);
  void w;
}

// Segundos que quedan (o null sin límite)
export function timeLeft(s: State): number | null {
  if (!s.rules.time) return null;
  return Math.max(0, (GO + s.rules.time) * HZ - s.t) / HZ;
}

export { rndInt };
