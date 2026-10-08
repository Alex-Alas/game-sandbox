// Laboratorio de red de CATAPUM, en Node y con reloj simulado (no espera en tiempo real): un anfitrión (`Match` +
// `HostNet`) y 1–7 invitados (`GuestNet`/`GuestView`) conectados por el relay real de salas (`createRooms`, de
// DOWNCASTLE) con sockets falsos. Cada enlace tiene latencia y jitter, y conserva el orden como un WebSocket (un
// mensaje demorado demora a los que le siguen). Los invitados juegan con `botInput` mirando lo que ven.
//   node games/catapum/tools/netlab.mjs [--lat 80 --jit 30 --guests 3 --bots 1 --seg 60 --map islas --seed 7717
//        --spike 0 --spikems 300 --late 20 --reconnect 0:30:4 --hostgap 10:2 --hostidle --wander --gdrift 0 --warm 5 --diff 2
//        --netseed 1 --json]
//   lat = latencia de ida entre invitado y anfitrión en ms (el ping es el doble); jit = ± ms uniforme;
//   spike = probabilidad por mensaje de una demora extra (spikems) que, por el orden, atrasa también a los siguientes;
//   late = segundos en que entra un invitado más a mitad de partida; reconnect = «invitado:segundos[:corte]» (se corta y vuelve);
//   hostgap = «segundos:duración»: el anfitrión deja de simular (pestaña congelada) y retoma al ritmo normal;
//   hostidle = el anfitrión no hace nada; wander = los invitados solo corren, saltan, hacen dash y se enganchan al azar (sin cartas);
//   gdrift = ppm de diferencia entre el reloj de los invitados y el del anfitrión; warm = segundos que no se miden al empezar.
// Mide: corrección de la predicción propia (cuánto se movió el personaje del invitado al llegar cada `me`), separada en «tranquilo»
// y «con efecto» (te pasó un golpe, una carta, un KO… en los 30 cuadros anteriores: lo que la predicción no puede saber), bytes por
// segundo y por mensaje (`st`, `me`, `in`), cola de entradas del anfitrión, terreno idéntico y el estado tras entrar o reconectar.
// `runLab(opciones)` devuelve todo como objeto (lo usa tests/net.test.mjs); `onErr({ g, d, k, fx, gv, t })` espía cada corrección.
import { createRooms } from '../../downcastle/server/room.js';
import { Match } from '../src/game.ts';
import { HostNet, GuestNet, helloMsg, unpackMe } from '../src/net.ts';
import { botInput, newMem } from '../src/sim/bot.ts';
import { NO_INPUT, HZ } from '../src/sim/sim.ts';
import { DEFAULTS } from '../src/sim/params.ts';
import { CHARS } from '../src/sim/chars.ts';

const MS = 1000 / HZ;
const RULES = { time: 0, teams: false, friendly: false, crates: 11, infinite: false, startDmg: 0 };
const mulberry = a => () => { a |= 0, a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const stat = a => ({ n: a.length, avg: +avg(a).toFixed(4), p50: +pct(a, 0.5).toFixed(4), p95: +pct(a, 0.95).toFixed(3), p99: +pct(a, 0.99).toFixed(3), max: +Math.max(0, ...a).toFixed(3),
  over01: a.filter(d => d > 0.1).length, over1: a.filter(d => d > 1).length, snaps: a.filter(d => d >= 3).length });
const RESYNC = new Set(['hit', 'ko', 'spawn', 'cast', 'tele', 'swap', 'pad', 'ulti', 'fizzle', 'slip', 'pick', 'heal']);

// Cola de eventos por tiempo (montículo binario; empate por orden de inserción)
class Heap {
  a = []; n = 0;
  push(t, f) { const e = { t, n: this.n++, f }, a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = i - 1 >> 1; if (this.less(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  less(x, y) { return x.t < y.t || x.t === y.t && x.n < y.n; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < a.length && this.less(a[l], a[m])) m = l; if (r < a.length && this.less(a[r], a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
  get next() { return this.a[0]?.t ?? Infinity; }
}

export function runLab(o = {}) {
  const O = { map: 'islas', seed: 7717, guests: 2, bots: 1, seg: 60, lat: 80, jit: 30, hostLat: 0, spike: 0, spikems: 300, netseed: 1, time: 0,
    late: -1, reconnect: null, hostgap: null, hostidle: false, wander: false, gdrift: 0, warm: 5, diff: 2, onErr: null, ...o };
  const rng = mulberry(O.netseed), heap = new Heap();
  let now = 0;
  const at = (t, f) => heap.push(t, f);
  const after = (dt, f) => at(now + dt, f);
  // Enlace en un sentido: latencia + jitter, nunca adelanta a un mensaje anterior (orden de WebSocket)
  const link = (lat, jit) => {
    let last = 0;
    return () => { let d = lat + (rng() * 2 - 1) * jit; if (O.spike && rng() < O.spike) d += O.spikems; d = Math.max(0, d); last = Math.max(last, now + d); return last; };
  };

  const rooms = createRooms();
  const CODE = 'ABCD';
  const bytes = s => Buffer.byteLength(s);

  // ---- Anfitrión ---------------------------------------------------------------------------------------------------
  const H = { up: link(O.hostLat, 0), down: link(O.hostLat, 0), handle: null, mctr: {}, maxMsg: 0, stop: false, evlog: [] };
  const hostSend = obj => {
    const raw = JSON.stringify(obj), t = obj.m?.t ?? obj.t, n = bytes(raw), mine = obj.to !== undefined;
    H.maxMsg = Math.max(H.maxMsg, n);
    const c = H.mctr[t] ??= { n: 0, bytes: 0, max: 0 };
    c.n++, c.bytes += n, c.max = Math.max(c.max, n);
    void mine;
    at(H.up(), () => H.handle.message(raw));
  };
  const hn = new HostNet(hostSend, { diff: () => O.diff, lobby: () => {}, now: () => Math.round(now) });
  const hostSock = { send: s => { const m = JSON.parse(s); at(H.down(), () => { if (m.t === 'peer' || m.t === 'from') hn.message(m); }); }, close() {} };
  H.handle = rooms.connect(hostSock, { code: CODE, create: true, pid: 'host', max: 8 });

  // ---- Invitados ----------------------------------------------------------------------------------------------------
  const G = [];
  const stats = () => ({ errCalm: [], errFx: [], errAll: [], jumps: 0, nopred: 0, rx: {}, tx: {}, stalls: 0, frames: 0, errAfterJoin: [], starts: 0, unacked: [], delay: [], rtt: [] });
  let T0 = 0, END = 0;
  function addGuest(k, name) {
    const g = { k, name, pid: 'g' + k, ch: CHARS[(k + 1) % CHARS.length].id, up: link(O.lat, O.jit), down: link(O.lat, O.jit), epoch: 0, handle: null,
      off: rng() * 100000, mem: null, st: stats(), connected: false, ticking: false, markT: -1 };
    g.gn = new GuestNet(obj => {
      if (!g.connected) return; // sin conexión el cliente real descarta lo que manda
      const raw = JSON.stringify(obj), e = g.epoch, n = bytes(raw);
      const r = g.st.tx[obj.t] ??= [0, 0];
      r[0]++, r[1] += n;
      at(g.up(), () => { if (g.epoch === e) g.handle?.message(raw); });
    }, gv => {
      g.st.starts++;
      const orig = gv.reconcile.bind(gv);
      gv.reconcile = (d, t) => {
        const base = gv.s.pl[gv.me], k = d[0];
        const before = base && gv.pred && gv.pred.alive && !gv.pred.u ? [gv.pred.x + gv.smooth[0], gv.pred.y + gv.smooth[1]] : null;
        const f = base ? unpackMe(base, d) : null;
        orig(d, t);
        const p = gv.pred;
        const measured = now - T0 > O.warm * 1000 && now <= END;
        if (!before || !p || !p.alive || p.u) { if (measured) g.st.nopred++; return; }
        const dd = Math.hypot(p.x - before[0], p.y - before[1]);
        // ¿algo que la predicción no puede saber le pasó en los últimos 30 cuadros (o está aturdido / enganchado a otro)?
        const fx = f.stunT > k - 20 || (f.hook && f.hook.e >= 0) || H.evlog.some(e => e.t > k - 30 && e.t <= k && RESYNC.has(e.k) && (e.p === gv.me || e.a === gv.me || e.b === gv.me || e.by === gv.me));
        if (measured) {
          g.st.errAll.push(dd), (fx ? g.st.errFx : g.st.errCalm).push(dd);
          if (dd >= 3) g.st.jumps++;
          g.st.unacked.push(gv.hist.length), g.st.delay.push(gv.delay), g.st.rtt.push(gv.rtt);
          if (O.onErr) O.onErr({ g, d: dd, k, fx, gv, t: (now - T0) / 1000 });
        }
        if (g.markT >= 0 && now - g.markT < 3000) g.st.errAfterJoin.push(dd);
      };
    });
    G.push(g);
    return g;
  }
  function connectGuest(g) {
    g.epoch++;
    const e = g.epoch;
    g.connected = true;
    const sock = {
      send: s => {
        const n = bytes(s);
        let m; try { m = JSON.parse(s); } catch { return; }
        const t = m.t ?? 'x', r = g.st.rx[t] ??= [0, 0];
        if (now >= T0 && now <= END) r[0]++, r[1] += n;
        at(g.down(), () => {
          if (g.epoch !== e) return;
          if (m.t === 'welcome') { g.gn.myPeer = m.id; g.gn.send(helloMsg(g.name, g.ch, undefined)); return; }
          g.gn.message(m, now + g.off);
        });
      },
      close() {},
    };
    g.handle = rooms.connect(sock, { code: CODE, create: false, pid: g.pid });
  }
  function disconnectGuest(g) { g.connected = false; g.gn.lost(); g.epoch++; g.handle?.close(); g.handle = null; }

  // ---- Arranque: los invitados se conectan, el anfitrión empieza ---------------------------------------------------------
  const nStart = Math.min(O.guests, 7);
  for (let k = 0; k < nStart; k++) connectGuest(addGuest(k, 'Inv' + k));
  while (heap.size && heap.next < 4000) { const e = heap.pop(); now = e.t; e.f(); }
  now = Math.max(now, 4000);
  const seats = [{ name: 'Host', ch: 'bombin', deck: undefined, team: 0, bot: 0 }];
  for (const p of hn.peers.values()) seats.push({ name: p.name, ch: p.ch, deck: p.deck, team: seats.length % 2, bot: 0, peer: p.id });
  const humans = seats.length;
  for (let k = 0; humans + k < Math.min(8, humans + O.bots); k++) seats.push({ name: 'Bot' + k, ch: CHARS[(humans + k + 2) % CHARS.length].id, team: (humans + k) % 2, bot: O.diff });
  const match = new Match(O.map, O.seed, seats, { ...RULES, time: O.time }, { ...DEFAULTS }, 0);
  const hostMem = newMem(0);
  T0 = now, END = T0 + O.seg * 1000;
  hn.begin(match);

  // ---- Reloj de la partida ------------------------------------------------------------------------------------------
  const sample = { qlen: [], qmax: 0, ticks: 0, starved: 0, merged: 0 };
  const gap = O.hostgap ? String(O.hostgap).split(':').map(Number) : null;
  const hostTick = () => {
    if (H.stop) return;
    if (gap && now >= T0 + gap[0] * 1000 && now < T0 + (gap[0] + gap[1]) * 1000) return after(MS, hostTick); // pestaña congelada
    const s = match.s;
    const evs = match.tick(O.hostidle ? NO_INPUT : botInput(s, match.w, { ...s.pl[0], bot: O.diff }, hostMem));
    for (const e of evs) { H.evlog.push(e); if (H.evlog.length > 1500) H.evlog.shift(); }
    hn.afterTick(evs);
    sample.ticks++;
    if (now - T0 > O.warm * 1000 && now <= END) for (const [, kk] of hn.seatOf) { const n = match.queue.get(kk)?.length ?? 0; sample.qlen.push(n); sample.qmax = Math.max(sample.qmax, n); }
    after(MS, hostTick);
  };
  at(now + 1, hostTick);
  at(END, () => { for (const m of match.starved.values()) sample.starved += m; for (const m of match.merged.values()) sample.merged += m; });

  // Entrada sin cartas ni rivales: corre, salta, hace dash y engancha al azar (para medir solo la predicción del movimiento)
  const wander = (g, f) => {
    const w = g.wd ??= { x: 1, y: 0, until: 0, jump: 0, dash: 0, hook: 0, ax: 0, ay: 0 };
    if (f >= w.until) { w.until = f + 20 + Math.floor(rng() * 50); w.x = rng() < 0.15 ? 0 : rng() < 0.5 ? -1 : 1; w.y = rng() < 0.12 ? -1 : 0; w.ax = rng() * 2 - 1; w.ay = rng(); w.hook = rng() < 0.25 ? 20 + Math.floor(rng() * 30) : 0; }
    if (rng() < 0.03) w.jump = 3 + Math.floor(rng() * 14);
    if (rng() < 0.012) w.dash = 2;
    const i = { x: w.x, y: w.y, jump: w.jump > 0, dash: w.dash > 0, hook: w.hook > 0, ulti: false, cast: -1, ax: w.ax, ay: w.ay };
    w.jump--, w.dash--, w.hook--;
    return i;
  };

  // Un invitado: cada cuadro predice y manda la entrada; después avanza la vista (como `loop` de main.ts)
  const guestFrame = g => {
    if (!g.ticking) return;
    const gv = g.gn.gv;
    if (gv) {
      let i = NO_INPUT;
      const v = gv.view(), me = v.pl[gv.me];
      if (me) i = O.wander ? wander(g, gv.s.t) : botInput(v, gv.w, { ...me, bot: O.diff }, g.mem ??= newMem(gv.me + 100));
      g.gn.tick(i, now + g.off);
      gv.advance(now + g.off);
      gv.decay(1 / HZ);
      if (now <= END) {
        g.st.frames++;
        // «estancada»: el tiempo de dibujo ya pasó al último estado recibido (los demás se congelan)
        if (gv.snaps.length && gv.offset !== null && now + g.off - gv.offset - gv.delay > gv.snaps[gv.snaps.length - 1].T + 1) g.st.stalls++;
      }
    }
    after(MS * (1 + O.gdrift / 1e6), () => guestFrame(g));
  };
  const startGuest = g => { g.ticking = true; after(rng() * MS, () => guestFrame(g)); };
  G.forEach(startGuest);

  // Entrada tardía y reconexión
  let late = null;
  if (O.late >= 0) at(T0 + O.late * 1000, () => { late = addGuest(G.length, 'Tarde'); connectGuest(late); startGuest(late); late.markT = now + 200; });
  const recon = [];
  if (O.reconnect) for (const r of String(O.reconnect).split(',')) {
    const [gi, sec, down = 3] = r.split(':').map(Number);
    recon.push({ gi, sec, down });
    at(T0 + sec * 1000, () => { const g = G[gi]; if (!g) return; disconnectGuest(g); after(down * 1000, () => { connectGuest(g); g.markT = now + 200; }); });
  }

  // ---- Correr -------------------------------------------------------------------------------------------------------
  const run = until => { while (heap.size && heap.next <= until) { const e = heap.pop(); now = e.t; e.f(); } now = Math.max(now, until); };
  run(END);
  // Vaciar: el anfitrión se detiene en un múltiplo de 3 cuadros y todo lo que viaja llega
  H.stop = true;
  while (match.s.t % 3 !== 0) { const evs = match.tick(NO_INPUT); hn.afterTick(evs); }
  G.forEach(g => { g.ticking = false; });
  run(now + 3000);

  // ---- Informe ------------------------------------------------------------------------------------------------------
  const dur = (END - T0) / 1000;
  const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const hostOps = JSON.stringify(match.w.T.ops);
  const guests = G.map(g => {
    const gv = g.gn.gv, T = gv?.w.T;
    const gdur = g === late ? (END - (T0 + O.late * 1000)) / 1000 : dur;
    const rx = Object.fromEntries(Object.entries(g.st.rx).map(([t, [n, b]]) => [t, { msgs: n, bytes: b, perSec: Math.round(b / gdur), bytesPerMsg: Math.round(b / n) }]));
    const tx = Object.fromEntries(Object.entries(g.st.tx).map(([t, [n, b]]) => [t, { msgs: n, bytes: b, perSec: Math.round(b / gdur), bytesPerMsg: Math.round(b / n) }]));
    const ee = g.st.errAfterJoin;
    return {
      name: g.name, seat: gv?.me, starts: g.st.starts,
      terrainOps: T ? JSON.stringify(T.ops) === hostOps : false, terrainGrid: T ? same(T.g, match.w.T.g) : false, nOps: T?.ops.length,
      players: gv ? gv.s.pl.length === match.s.pl.length : false,
      all: stat(g.st.errAll), calm: stat(g.st.errCalm), fx: stat(g.st.errFx), jumps: g.st.jumps, nopred: g.st.nopred,
      afterJoin: ee.length ? { n: ee.length, avg: +avg(ee).toFixed(3), max: +Math.max(...ee).toFixed(3) } : null,
      unacked: +avg(g.st.unacked).toFixed(1), delay: +avg(g.st.delay).toFixed(0), rtt: +avg(g.st.rtt).toFixed(0), stalls: g.st.stalls, frames: g.st.frames, rx, tx,
      downBps: Math.round(Object.values(g.st.rx).reduce((a, [, b]) => a + b, 0) / gdur),
      upBps: Math.round(Object.values(g.st.tx).reduce((a, [, b]) => a + b, 0) / gdur),
    };
  });
  const up = Object.fromEntries(Object.entries(H.mctr).map(([t, c]) => [t, { msgs: c.n, bytes: c.bytes, perSec: Math.round(c.bytes / dur), max: c.max }]));
  const host = { ticks: sample.ticks, up, upBps: Object.values(up).reduce((a, c) => a + c.perSec, 0),
    queue: { avg: +avg(sample.qlen).toFixed(2), p95: pct(sample.qlen, 0.95), max: sample.qmax, starved: sample.starved, merged: sample.merged }, maxMsgBytes: H.maxMsg };
  return { opts: O, dur, hostTime: match.s.t / HZ, host, guests, recon, sizes: { players: match.s.pl.length, ops: match.w.T.ops.length }, match, G };
}

// ---- CLI ---------------------------------------------------------------------------------------------------------------
function print(r) {
  const O = r.opts;
  console.log(`netlab ${O.map} seed ${O.seed} · ${r.sizes.players} jugadores (${O.guests} invitados, ${O.bots} bots) · lat ${O.lat}±${O.jit} ms · ${r.dur}s · ${r.sizes.ops} cortes`);
  const h = r.host;
  console.log(`anfitrión sube ${h.upBps} B/s: ${Object.entries(h.up).map(([t, c]) => `${t} ${c.perSec} B/s (${c.msgs} msg, máx ${c.max} B)`).join(' · ')}`);
  console.log(`cola de entradas: media ${h.queue.avg} · p95 ${h.queue.p95} · máx ${h.queue.max} · vacía ${h.queue.starved} cuadros · juntadas ${h.queue.merged}`);
  for (const g of r.guests) {
    const rx = Object.entries(g.rx).map(([t, c]) => `${t} ${c.perSec} B/s (${c.bytesPerMsg} B/msg)`).join(' · ');
    const tx = Object.entries(g.tx).map(([t, c]) => `${t} ${c.perSec} B/s`).join(' · ');
    console.log(`${g.name} (lugar ${g.seat}, ${g.starts} start)  baja ${g.downBps} B/s [${rx}] · sube ${g.upBps} B/s [${tx}]`);
    const sc = c => `n ${c.n} · media ${c.avg} · p95 ${c.p95} · p99 ${c.p99} · máx ${c.max} · >0,1 m ${c.over01} · >1 m ${c.over1} · ≥3 m ${c.snaps}`;
    console.log(`   corrección tranquila: ${sc(g.calm)}`);
    console.log(`   corrección con efecto: ${sc(g.fx)}`);
    console.log(`   sin predicción ${g.nopred} · saltos(≥3 m) ${g.jumps} · sin confirmar ${g.unacked} entradas · ping medido ${g.rtt} ms (real ${2 * O.lat}) · retraso de dibujo ${g.delay} ms · estancadas ${g.stalls}/${g.frames}`);
    if (g.afterJoin) console.log(`   tras entrar/reconectar (3 s): n ${g.afterJoin.n} · media ${g.afterJoin.avg} m · máx ${g.afterJoin.max}`);
    console.log(`   terreno: cortes ${g.terrainOps ? 'iguales' : 'DISTINTOS'} (${g.nOps}) · grilla ${g.terrainGrid ? 'igual' : 'DISTINTA'} · jugadores ${g.players ? 'ok' : 'FALTAN'}`);
  }
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const num = (k, d) => +arg(k, d);
  const r = runLab({ map: arg('map', 'islas'), seed: num('seed', 7717), guests: num('guests', 2), bots: num('bots', 1), seg: num('seg', 60), lat: num('lat', 80), jit: num('jit', 30),
    spike: num('spike', 0), spikems: num('spikems', 300), netseed: num('netseed', 1), time: num('time', 0), late: num('late', -1), reconnect: arg('reconnect', null), hostLat: num('hostlat', 0),
    hostgap: arg('hostgap', null), hostidle: process.argv.includes('--hostidle'), wander: process.argv.includes('--wander'), gdrift: num('gdrift', 0), warm: num('warm', 5), diff: num('diff', 2) });
  if (process.argv.includes('--json')) { const { match, G, ...rest } = r; void match, void G; console.log(JSON.stringify(rest, null, 1)); } else print(r);
}
