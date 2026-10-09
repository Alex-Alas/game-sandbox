// Una partida que corre la simulación (solo, o el anfitrión online): arma las entradas de cada jugador (el local,
// los bots y las que llegan por red) y guarda las posiciones del paso anterior para dibujar interpolado.
import { newState, step, NO_INPUT, type Input, type Entry, type State, type World, type Ev } from './sim/sim.ts';
import { botInput, newMem, type BotMem } from './sim/bot.ts';
import type { Rules, Cfg } from './sim/params.ts';

export type Seat = Entry & { peer?: number }; // peer: id de red del invitado que lo maneja (sin peer ni bot: el local)

// Cola de entradas de cada invitado (colchón contra el jitter). Llegan de a 2 cada ~33 ms y se consume una por cuadro.
//  - Si se vacía (la red se atrasó), ese cuadro repite la última entrada sin cartas; pasados STARVE_NEUTRAL cuadros
//    seguidos sin nada (pestaña oculta, corte) el personaje suelta todo en vez de seguir corriendo hacia el vacío.
//  - Cada ráfaga después de una demora deja la cola un cuadro más larga, y sola nunca se vaciaría (llegan y se gastan a la
//    misma tasa): si en una ventana de DRAIN_WIN cuadros nunca bajó de DRAIN_KEEP, se junta un par de entradas.
//  - Con más de QMAX se juntan las más viejas. Juntar no pierde cartas ni apretones (queda el OR de los botones).
export const QMAX = 8, STARVE_NEUTRAL = 20, DRAIN_WIN = 90, DRAIN_KEEP = 2;

export class Match {
  s: State; w: World; me: number; seed: number; seats: Seat[];
  mems: BotMem[];
  prev = new Map<string, [number, number]>();
  queue = new Map<number, Input[]>();   // entradas de red por jugador
  last = new Map<number, Input>();
  ack = new Map<number, number>();      // última secuencia aplicada de cada invitado
  seq = new Map<number, number>();      // secuencia de la primera entrada en la cola
  starve = new Map<number, number>();   // cuadros seguidos sin entrada nueva
  winMin = new Map<number, number>();   // largo mínimo de la cola (tras gastar) en la ventana actual
  winAt = new Map<number, number>();    // cuadros que lleva la ventana
  starved = new Map<number, number>();  // totales (para el laboratorio de red): cuadros con la cola vacía,
  merged = new Map<number, number>();   // entradas juntadas por exceso (QMAX) y por la ventana
  constructor(map: string, seed: number, seats: Seat[], rules: Rules, c: Cfg, me: number) {
    const { s, w } = newState(map, seed, seats, rules, c);
    this.s = s, this.w = w, this.me = me, this.seed = seed, this.seats = seats;
    this.mems = s.pl.map(p => newMem(p.id));
  }
  // Junta la entrada más vieja de la cola con la que sigue (sin perder cartas ni apretones)
  private squash(pid: number, q: Input[], why: Map<number, number>) {
    const a = q.shift()!, b = q[0];
    if (a.cast >= 0 && b.cast < 0) b.cast = a.cast, b.ax = a.ax, b.ay = a.ay;
    b.jump ||= a.jump, b.dash ||= a.dash, b.hook ||= a.hook, b.ulti ||= a.ulti;
    this.seq.set(pid, (this.seq.get(pid) ?? 0) + 1);
    why.set(pid, (why.get(pid) ?? 0) + 1);
  }
  // Empezar de cero con un invitado que (re)conecta: su cliente numera las entradas desde 1 otra vez
  forget(pid: number) {
    for (const m of [this.queue, this.last, this.ack, this.seq, this.starve, this.winMin, this.winAt] as Map<number, unknown>[]) m.delete(pid);
  }
  // Entradas de un invitado (en orden, con la secuencia de la primera)
  push(pid: number, seq0: number, ins: Input[]) {
    const q = this.queue.get(pid) ?? [];
    if (!q.length) this.seq.set(pid, seq0);
    q.push(...ins);
    while (q.length > QMAX) this.squash(pid, q, this.merged);
    this.queue.set(pid, q);
  }
  // La entrada de este cuadro para un invitado
  private fromQueue(pid: number): Input {
    const q = this.queue.get(pid);
    if (q?.length) {
      const i = q.shift()!, sq = this.seq.get(pid) ?? 0;
      this.ack.set(pid, sq), this.seq.set(pid, sq + 1);
      this.last.set(pid, i);
      this.starve.set(pid, 0);
      // ventana de vaciado: el mínimo que dejó la cola en DRAIN_WIN cuadros
      const w = (this.winAt.get(pid) ?? 0) + 1, mn = Math.min(this.winMin.get(pid) ?? 99, q.length);
      if (w >= DRAIN_WIN) {
        if (mn >= DRAIN_KEEP && q.length >= 2) this.squash(pid, q, this.merged);
        this.winAt.set(pid, 0), this.winMin.set(pid, 99);
      } else this.winAt.set(pid, w), this.winMin.set(pid, mn);
      return i;
    }
    this.starved.set(pid, (this.starved.get(pid) ?? 0) + 1);
    this.winMin.set(pid, 0);
    const n = (this.starve.get(pid) ?? 0) + 1;
    this.starve.set(pid, n);
    const l = this.last.get(pid);
    if (n > STARVE_NEUTRAL) { this.last.delete(pid); return NO_INPUT; }
    return l ? { ...l, cast: -1 } : NO_INPUT;
  }
  tick(local: Input): Ev[] {
    const s = this.s;
    for (const p of s.pl) this.prev.set('p' + p.id, [p.x, p.y]);
    for (const q of s.pr) this.prev.set('q' + q.id, [q.x, q.y]);
    for (const o of s.props) this.prev.set('o' + o.id, [o.x, o.y]);
    const ins: Input[] = s.pl.map(p => {
      if (p.id === this.me) return local;
      if (p.bot) return botInput(s, this.w, p, this.mems[p.id]);
      return this.fromQueue(p.id);
    });
    step(s, this.w, ins);
    return s.ev;
  }
  // Posición interpolada (alpha entre el paso anterior y el actual)
  ip(alpha: number) {
    return (key: string, x: number, y: number): [number, number] => {
      const p = this.prev.get(key);
      if (!p || (p[0] - x) ** 2 + (p[1] - y) ** 2 > 16) return [x, y]; // teletransportes: sin estirar
      return [p[0] + (x - p[0]) * alpha, p[1] + (y - p[1]) * alpha];
    };
  }
}
