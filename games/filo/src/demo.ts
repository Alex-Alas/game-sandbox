// La pelea de la portada del kit: una línea de tiempo que se repite. La Errante entra, el Verdugo ruge,
// combo, amague hacia atrás contra el hachazo, onda cargada, salto sobre el barrido y media luna final.
import type { Stage, Fighter } from './stage.ts';

type Cue = [number, () => void];

export class Duel {
  t = 0; i = 0;
  cues: Cue[];
  end: number;
  S: Stage; H: Fighter; B: Fighter;
  constructor(S: Stage, H: Fighter, B: Fighter) {
    this.S = S; this.H = H; this.B = B;
    const h = H.a, b = B.a;
    const run = (f: Fighter, x: number | (() => number), speed = 104) => () => { f.move = { x: typeof x === 'number' ? x : x(), speed, clip: f === H ? 'run' : 'walk' }; };
    const gap = (d: number) => () => B.a.x - d;   // a esa distancia del Verdugo
    const play = (f: Fighter, c: string) => () => { if (f.dead || f.hp <= 0) return; f.move = null; f.a.play(c, true); };
    const face = (f: Fighter, d: number) => () => f.a.setFacing(d);
    this.cues = [
      [0.0, () => this.reset()],
      [0.7, play(B, 'roar')],
      [1.0, run(H, gap(82))],
      [2.95, play(H, 'slash1')],
      [3.62, play(H, 'slash2')],
      [4.45, play(B, 'slam')],
      [4.62, face(H, -1)],
      [4.64, play(H, 'dash')],
      [5.32, face(H, 1)],
      [5.5, play(H, 'charge')],
      [7.02, run(H, gap(96), 150)],
      [7.3, play(B, 'sweep')],
      [7.52, play(H, 'jump')],
      [8.45, play(H, 'slash3')],
      [10.3, play(H, 'idle')],
      [12.6, () => { this.S.R.post.flash = 0.0; }],
    ];
    this.end = 13.2;
    void h; void b;
  }
  reset() {
    const { H, B } = this;
    H.a.x = -150; H.a.y = 0; H.a.setFacing(1); H.a.play('idle', true); H.hp = 10; H.move = null; H.dead = false;
    B.a.x = 100; B.a.y = 0; B.a.setFacing(-1); B.a.play('idle', true); B.hp = 6; B.move = null; B.dead = false;
    B.a.hidden = false; B.a.dissolve = 0; B.a.height = 130;
    H.hitBy.clear(); B.hitBy.clear();
  }
  update(dt: number) {
    this.t += dt;
    while (this.i < this.cues.length && this.cues[this.i][0] <= this.t) { this.cues[this.i][1](); this.i++; }
    // al reaparecer, el Verdugo se arma desde las brasas
    const B = this.B.a;
    if (this.t < 0.9 && !this.B.dead) { B.dissolve = Math.max(0, 1 - this.t / 0.9); B.disUp = true; }
    else if (B.disUp) { B.dissolve = 0; B.disUp = false; }
    if (this.t >= this.end) { this.t = 0; this.i = 0; }
  }
}
