import type { World } from './sim/sim.ts';

// El Patio del Mesón en gris. A la izquierda, lo del paso A para medir el salto; a la derecha (x > 60), lo del
// paso B para la liga: vigas en fila, un foso ancho con vigas encima, una torre y un techo bajo; y chispas. Pasando la
// puerta de x = 200, el corral del paso D: dummies de los tres pesos en el piso y en un estante a 5 m (a la altura de
// la mano en lo alto del salto), y la pared del fondo para estrellarlos. Metros; y = 0 es el piso.
const R = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

// Lugares para ir directo (AJUSTES → PATIO): x en el piso
export const SPOTS = [['INICIO', 0], ['LIGA', 74], ['CORRAL', 206], ['AIRE', 340]] as const;

// El Aire: arena para relanzar con ATAQUE o anclarse a lo que vuela. Un tirador (`volley` en main.ts) lanza cada `every` s un
// proyectil (los dummies con g > 0, desde el índice `first`) por una de sus rutas; los flotadores (g = 0) cuelgan quietos
// del aire. g = gravedad de los proyectiles × la normal: baja, para que vuelen ~2 s. guns = bocas de los cañones (pies).
export const AIRE = {
  x0: 298, x1: 382, cx: 340, g: 0.3, every: 1.8, first: 5, guns: [[304.5, 1.2], [375.5, 1.2]] as const,
};

export const PATIO: World = {
  spawn: [0, 0],
  rects: [
    R(-60, -2, -14, 0), R(-9, -5, 115, 0), R(-14, -4, -9, -2), // piso con un foso de 5 m de ancho y 2 de hondo
    R(-62, -4, -60, 32), R(200, 4, 202, 32), R(262, -5, 264, 32), R(-62, 30, 264, 32), // paredes (puerta de 4 m al corral) y techo
    R(6, 0, 9, 1), R(11, 0, 14, 2), R(16, 0, 19, 3), R(21, 0, 24, 4), // escalones de 1 a 4 m
    R(27, 6, 33, 6.5),   // flotante a 6,5 m (desde el escalón de 4)
    R(38, 2.6, 44, 3),   // flotante bajo: se pasa por debajo y saltando se da con la cabeza
    R(-30, 2.2, -20, 4), // túnel de 2,2 m
    R(-40, 0, -37, 2.5), R(-45, 0, -42, 5), R(-60, 0, -47, 8), // escalera a una cornisa de 8 m para dejarse caer
    R(-13, 9, -10, 10),  // viga sobre el foso, cerca del inicio
    R(66, 9, 69, 10), R(80, 9, 83, 10), R(94, 9, 97, 10), R(108, 9, 111, 10), // vigas a 9 m cada 14 m
    R(115, -5, 140, -3), R(121, 10, 123, 11), R(132, 10, 134, 11), // foso de 25 m y 3 de hondo, con dos vigas a 10 m
    R(140, -5, 262, 0),
    R(150, 0, 156, 16),  // torre de 16 m
    R(166, 6, 196, 7),   // techo bajo a 6 m
    R(238, 4.6, 252, 5), // estante del corral
    // El Aire (x 298–382, techo a 30 m): ver AIRE
    R(296, -5, 298, 32), R(382, -5, 384, 32), R(296, -5, 384, 0), R(296, 30, 384, 32),
    R(298, 0, 303, 1.2), R(377, 0, 382, 1.2),                            // los dos cañones
    R(318, 7, 326, 7.5), R(354, 7, 362, 7.5), R(334, 14, 346, 14.5),     // vigas a 7 y 14 m para ganar altura
  ],
  // Chispas (devuelven una carga del garfio): sobre el foso del inicio, entre vigas, sobre el foso ancho y junto a la torre
  orbs: [[-11.5, 5], [87.5, 5], [127.5, 4], [146, 13]],
  // El liviano del estante, contra el borde: así se lo ve (y se lo engancha) desde abajo y a un costado
  dummies: [
    { x: 214, y: 0, kind: 'liviano' }, { x: 222, y: 0, kind: 'mediano' }, { x: 230, y: 0, kind: 'pesado' },
    { x: 238.4, y: 5, kind: 'liviano' }, { x: 245, y: 5, kind: 'mediano' },
    // El Aire. Proyectiles (5–12): el tirador los lanza en arcos; con g = 0,3 tardan ~2 s en caer. Flotadores (13–15): quietos en el aire
    ...([['liviano', 312], ['mediano', 320], ['liviano', 328], ['mediano', 352], ['liviano', 360], ['pesado', 368], ['mediano', 336], ['pesado', 344]] as const)
      .map(([kind, x]) => ({ x, y: 0, kind, g: AIRE.g })),
    { x: 322, y: 10, kind: 'liviano', g: 0 }, { x: 358, y: 17, kind: 'mediano', g: 0 }, { x: 340, y: 22, kind: 'pesado', g: 0 },
  ],
};
