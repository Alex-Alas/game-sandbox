// Tutorial guiado del primer nivel (FÁCIL 1, el tablero a mano de levels.ts). No frena el juego: un cartel muestra el paso
// que sigue y el mundo y el minimapa marcan dónde ir. Cada paso se cumple con lo que hace el jugador (si lo hace antes de
// tiempo, el paso se saltea solo).
import { TUT } from './sim/levels.ts';
import type { V2 } from './sim/geom.ts';

// onArrow: parado arriba de una flecha o pasándole por encima en un salto
export type TutCtx = { px: number, pz: number, beacon: V2, onArrow: boolean, gone: boolean[], mapOpened: boolean, idle: number, touch: boolean, left: number, free: number };
export type TutMark = { arrow?: number, at?: V2, hex: string };
type Step = { text: (c: TutCtx) => string, tip: (c: TutCtx) => string, marks: (c: TutCtx) => TutMark[], done: (c: TutCtx) => boolean };

export const HEX = { go: '#ffc21a', free: '#16c47f', stuck: '#ff4d6d' };
const STEPS: Step[] = [
  {
    text: () => 'Caminá hasta la luz amarilla',
    tip: (c) => c.touch ? 'Arrastrá el pulgar <b>izquierdo</b> para caminar y el <b>derecho</b> para mirar.' : '<b>W A S D</b> (o las flechas) para caminar y el <b>ratón</b> para mirar.',
    marks: (c) => [{ at: c.beacon, hex: HEX.go }],
    done: (c) => Math.hypot(c.px - c.beacon[0], c.pz - c.beacon[1]) < 1.9,
  },
  {
    text: () => 'Liberá la flecha marcada',
    tip: (c) => `Apuntala con la mira y ${c.touch ? 'tocá <b>LIBERAR</b>' : 'hacé <b>clic</b> (o <b>E</b>)'}. Sale hacia donde mira su punta.`,
    marks: () => [{ arrow: TUT.A, hex: HEX.go }],
    done: (c) => c.gone[TUT.A],
  },
  {
    text: () => 'La roja está trabada: su punta choca con la verde. Liberá primero la verde.',
    tip: () => 'Si liberás una flecha trabada, choca, vuelve y <b>perdés una vida</b>. Tenés 3.',
    marks: (c) => [{ arrow: TUT.C, hex: HEX.free }, ...(c.gone[TUT.B] ? [] : [{ arrow: TUT.B, hex: HEX.stuck }])],
    done: (c) => c.gone[TUT.C],
  },
  {
    text: () => '¡Camino libre! Ahora sí, liberá la roja.',
    tip: () => 'Una flecha sale solo si la recta de su punta está vacía hasta el borde.',
    marks: () => [{ arrow: TUT.B, hex: HEX.free }],
    done: (c) => c.gone[TUT.B],
  },
  {
    text: () => 'Abrí el mapa para ver el rompecabezas entero',
    tip: (c) => `${c.touch ? 'Tocá el <b>minimapa</b>' : 'Apretá <b>M</b> o hacé clic en el minimapa'}. Ahí podés tocar una flecha para marcarla como destino.`,
    marks: () => [],
    done: (c) => c.mapOpened,
  },
  {
    text: () => 'Saltá por encima de una flecha',
    tip: (c) => `${c.touch ? '<b>SALTAR</b>' : '<b>ESPACIO</b>'}: así las cruzás en vez de rodearlas. Si caés arriba, podés caminar por encima y ver más lejos.`,
    marks: () => [],
    done: (c) => c.onArrow,
  },
  {
    text: (c) => c.left === 1 ? 'Liberá la última' : `Liberá las ${c.left} que quedan`,
    tip: (c) => c.idle > 18 ? 'Pista: la amarilla está libre.' : 'Mirá antes hacia dónde apunta cada una: alguna todavía está trabada.',
    marks: (c) => c.idle > 18 && c.free >= 0 ? [{ arrow: c.free, hex: HEX.go }] : [],
    done: (c) => c.left === 0,
  },
];

export class Tutorial {
  i = 0;
  get total() { return STEPS.length; }
  // Avanza los pasos cumplidos; devuelve si cambió
  update(c: TutCtx): boolean {
    const i0 = this.i;
    while (this.i < STEPS.length && (STEPS[this.i].done(c) || (c.left === 0 && this.i < STEPS.length))) this.i++;
    return this.i !== i0;
  }
  get over() { return this.i >= STEPS.length; }
  view(c: TutCtx) {
    const s = STEPS[Math.min(this.i, STEPS.length - 1)];
    return { tag: `TUTORIAL · ${Math.min(this.i + 1, STEPS.length)}/${STEPS.length}`, text: s.text(c), tip: s.tip(c), marks: this.over ? [] : s.marks(c) };
  }
}
