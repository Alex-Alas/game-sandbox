import type { World } from './sim/sim.ts';

// El Patio del Mesón en gris. A la izquierda, lo del paso A para medir el salto; a la derecha (x > 60), lo del
// paso B para la liga: vigas en fila, un foso ancho con vigas encima, una torre y un techo bajo. Metros; y = 0 es el piso.
const R = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

export const PATIO: World = {
  spawn: [0, 0],
  rects: [
    R(-60, -2, -14, 0), R(-9, -5, 115, 0), R(-14, -4, -9, -2), // piso con un foso de 5 m de ancho y 2 de hondo
    R(-62, -4, -60, 32), R(200, -5, 202, 32), R(-62, 30, 202, 32), // paredes y techo
    R(6, 0, 9, 1), R(11, 0, 14, 2), R(16, 0, 19, 3), R(21, 0, 24, 4), // escalones de 1 a 4 m
    R(27, 6, 33, 6.5),   // flotante a 6,5 m (desde el escalón de 4)
    R(38, 2.6, 44, 3),   // flotante bajo: se pasa por debajo y saltando se da con la cabeza
    R(-30, 2.2, -20, 4), // túnel de 2,2 m
    R(-40, 0, -37, 2.5), R(-45, 0, -42, 5), R(-60, 0, -47, 8), // escalera a una cornisa de 8 m para dejarse caer
    R(-13, 9, -10, 10),  // viga sobre el foso, cerca del inicio
    R(66, 9, 69, 10), R(80, 9, 83, 10), R(94, 9, 97, 10), R(108, 9, 111, 10), // vigas a 9 m cada 14 m
    R(115, -5, 140, -3), R(121, 10, 123, 11), R(132, 10, 134, 11), // foso de 25 m y 3 de hondo, con dos vigas a 10 m
    R(140, -5, 200, 0),
    R(150, 0, 156, 16),  // torre de 16 m
    R(166, 6, 196, 7),   // techo bajo a 6 m
  ],
};
