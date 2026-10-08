// Una partida que corre la simulación (solo, o el anfitrión online): arma las entradas de cada jugador (el local,
// los bots y las que llegan por red) y guarda las posiciones del paso anterior para dibujar interpolado.
import { newState, step, NO_INPUT, type Input, type Entry, type State, type World, type Ev } from './sim/sim.ts';
import { botInput, newMem, type BotMem } from './sim/bot.ts';
import type { Rules, Cfg } from './sim/params.ts';

export type Seat = Entry & { peer?: number }; // peer: id de red del invitado que lo maneja (sin peer ni bot: el local)

export class Match {
  s: State; w: World; me: number; seed: number; seats: Seat[];
  mems: BotMem[];
  prev = new Map<string, [number, number]>();
  queue = new Map<number, Input[]>();   // entradas de red por jugador
  last = new Map<number, Input>();
  ack = new Map<number, number>();      // última secuencia aplicada de cada invitado
  seq = new Map<number, number>();      // secuencia de la primera entrada en la cola
  constructor(map: string, seed: number, seats: Seat[], rules: Rules, c: Cfg, me: number) {
    const { s, w } = newState(map, seed, seats, rules, c);
    this.s = s, this.w = w, this.me = me, this.seed = seed, this.seats = seats;
    this.mems = s.pl.map(p => newMem(p.id));
  }
  // Entradas de un invitado (en orden, con la secuencia de la primera)
  push(pid: number, seq0: number, ins: Input[]) {
    const q = this.queue.get(pid) ?? [];
    if (!q.length) this.seq.set(pid, seq0);
    q.push(...ins);
    // si se atrasa mucho, se juntan las de más (sin perder cartas ni apretones)
    while (q.length > 8) {
      const a = q.shift()!, b = q[0];
      if (a.cast >= 0 && b.cast < 0) b.cast = a.cast, b.ax = a.ax, b.ay = a.ay;
      b.jump ||= a.jump, b.dash ||= a.dash, b.hook ||= a.hook, b.ulti ||= a.ulti;
      this.seq.set(pid, (this.seq.get(pid) ?? 0) + 1);
    }
    this.queue.set(pid, q);
  }
  tick(local: Input): Ev[] {
    const s = this.s;
    for (const p of s.pl) this.prev.set('p' + p.id, [p.x, p.y]);
    for (const q of s.pr) this.prev.set('q' + q.id, [q.x, q.y]);
    for (const o of s.props) this.prev.set('o' + o.id, [o.x, o.y]);
    const ins: Input[] = s.pl.map(p => {
      if (p.id === this.me) return local;
      if (p.bot) return botInput(s, this.w, p, this.mems[p.id]);
      const q = this.queue.get(p.id);
      if (q?.length) {
        const i = q.shift()!, sq = this.seq.get(p.id) ?? 0;
        this.ack.set(p.id, sq), this.seq.set(p.id, sq + 1);
        this.last.set(p.id, i);
        return i;
      }
      const l = this.last.get(p.id);
      return l ? { ...l, cast: -1 } : NO_INPUT;
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
