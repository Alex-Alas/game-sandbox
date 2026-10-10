// Contrato de un personaje del kit: su dibujo (piezas a partir de una pose), sus clips y su física
import type { Part, InkStyle } from '../draw/ink.ts';
import type { Clip, Pose } from '../rig.ts';
import type { V } from '../draw/curves.ts';

export interface DrawOpts {
  seed: number;      // número de dibujo (temblor de línea)
  boil: number;      // amplitud del temblor (unidades)
  t: number;         // tiempo (s) para lo que late
  glow: number;      // 0..1 carga del arma, brasas, etc.
  flash: number;     // 0..1 golpe recibido (se pinta en el shader)
}

export interface CharDef<Ph = unknown> {
  id: string; name: string; desc: string;
  box: [number, number, number, number]; // x0, y0, x1, y1 en unidades locales (y hacia abajo, raíz en 0,0)
  base: Pose;
  clips: Record<string, Clip>;
  order: string[];                        // clips en el orden de la galería
  ink: Omit<InkStyle, 'light' | 'flat'>;
  phys(p: Pose): Ph;
  step(ph: Ph, p: Pose, dt: number, shift: V, fv: V, t: number): void;
  mirror(ph: Ph): void;
  parts(p: Pose, ph: Ph, o: DrawOpts): Part[];
  // dónde está el filo/arma (para los smears del mundo) en coordenadas locales
  weapon?(p: Pose): { a: V, b: V } | null;
}
