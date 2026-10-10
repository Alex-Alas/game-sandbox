// Medidas del mundo (metros, y hacia arriba). Las comparten la colisión, el dibujo y el mapa: una celda del rompecabezas
// es un cuadrado de C × C sobre el piso y cada flecha es una pared baja que corre por el centro de sus celdas.
export const C = 2.4;          // lado de la celda
export const WALL_H = 1.0;     // alto de las flechas (se ve por encima; se sube saltando)
export const HW = 0.26;        // media anchura del cuerpo de una flecha
export const HEAD_F = 0.78;    // la punta: hasta dónde llega por delante del centro de su celda
export const HEAD_B = 0.42;    //   y por detrás (ahí termina el cuerpo)
export const HEAD_W = 0.6;     //   media anchura de la base del triángulo
export const RC = 0.7;         // radio de las curvas
export const MARGIN = 1.6;     // celdas de piso alrededor del rompecabezas
export const EYE = 1.55;       // altura de los ojos sobre los pies
export const R = 0.3;          // media anchura del jugador (caja)
export const REACH = 3.4;      // alcance para liberar una flecha (desde los ojos)
