// LUCERO — el cielo: constelaciones que se encienden gastando las estrellas ganadas en los niveles.
// Coordenadas en 0–100. Las primeras salen a mano; después se generan solas (sin fin).
import { hash, rnd, rndInt } from './const.js';

const HAND = [
  { name: 'La Cometa', story: 'La primera luz que cruzó el cielo dormido.', cost: 1,
    pts: [[74, 22], [60, 36], [46, 49], [56, 57], [28, 63], [42, 76]], lines: [[0, 1], [1, 2], [2, 4], [1, 3], [3, 5]] },
  { name: 'El Zorro', story: 'Dicen que roba estrellas y las esconde en su cola.', cost: 1,
    pts: [[24, 18], [36, 42], [64, 42], [76, 18], [72, 58], [50, 82], [28, 58]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [6, 4]] },
  { name: 'El Faro', story: 'Guía a los barcos de nubes de vuelta a casa.', cost: 2,
    pts: [[40, 86], [60, 86], [55, 40], [45, 40], [50, 26], [22, 16], [78, 16]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [2, 4], [4, 5], [4, 6]] },
  { name: 'La Ballena', story: 'Nada entre galaxias cantando canciones de marea.', cost: 2,
    pts: [[10, 56], [26, 44], [48, 40], [68, 46], [80, 58], [64, 68], [40, 70], [20, 66], [90, 40], [94, 62]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [4, 8], [4, 9]] },
  { name: 'La Corona', story: 'La usó la reina de la noche una sola vez.', cost: 2,
    pts: [[20, 74], [80, 74], [14, 34], [32, 54], [50, 22], [68, 54], [86, 34]], lines: [[0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1]] },
  { name: 'El Barco', story: 'Zarpa cada luna nueva hacia el fin del mapa.', cost: 3,
    pts: [[12, 64], [88, 64], [72, 80], [28, 80], [50, 64], [50, 16], [80, 54], [24, 56]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 4], [5, 7], [7, 4]] },
  { name: 'La Mariposa', story: 'Cada aleteo enciende una estrella fugaz.', cost: 3,
    pts: [[50, 30], [50, 72], [18, 14], [12, 46], [44, 50], [82, 14], [88, 46], [56, 50], [24, 82], [76, 82]], lines: [[0, 1], [0, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [4, 8], [8, 1], [7, 9], [9, 1]] },
  { name: 'El Búho', story: 'No duerme nunca: alguien tiene que mirar el cielo.', cost: 3,
    pts: [[30, 18], [70, 18], [36, 36], [64, 36], [50, 48], [26, 62], [74, 62], [50, 88], [38, 74], [62, 74]], lines: [[0, 2], [1, 3], [2, 4], [3, 4], [2, 5], [3, 6], [5, 8], [6, 9], [8, 7], [9, 7]] },
  { name: 'El Dragón', story: 'Duerme enroscado alrededor de la estrella polar.', cost: 4,
    pts: [[8, 72], [20, 58], [34, 64], [46, 50], [58, 56], [70, 42], [84, 34], [92, 20], [80, 18], [86, 46]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 6], [6, 9]] },
  { name: 'El Árbol', story: 'Sus frutos son los luceros que encendiste.', cost: 4,
    pts: [[50, 90], [50, 62], [50, 40], [30, 46], [70, 46], [18, 30], [38, 22], [62, 22], [82, 30], [50, 12]], lines: [[0, 1], [1, 2], [2, 9], [1, 3], [1, 4], [3, 5], [3, 6], [4, 7], [4, 8], [2, 6], [2, 7]] },
];

const A = ['La Nebulosa', 'El Río', 'La Llave', 'El Puente', 'La Lira', 'El Jardín', 'La Torre', 'El Reloj', 'La Flecha', 'El Nido', 'La Fuente', 'El Velero'];
const B = ['Dormida', 'de Plata', 'Lejana', 'del Alba', 'Escondida', 'de Cristal', 'Errante', 'del Norte', 'Perdida', 'de Ámbar'];

// Constelación k (0…∞)
export function constellation(k) {
  if (k < HAND.length) return { k, ...HAND[k] };
  const o = { rng: hash(`sky:${k}`) };
  const n = 7 + rndInt(o, 4), pts = [];
  while (pts.length < n) {
    const p = [12 + rnd(o) * 76, 12 + rnd(o) * 76];
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 16)) pts.push(p.map(Math.round));
  }
  // árbol de expansión mínima: líneas cortas, sin cruces raros
  const lines = [], inT = [0];
  while (inT.length < n) {
    let best = null;
    for (const a of inT) for (let b = 0; b < n; b++) {
      if (inT.includes(b)) continue;
      const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
      if (!best || d < best[2]) best = [a, b, d];
    }
    lines.push([best[0], best[1]]); inT.push(best[1]);
  }
  const name = `${A[k % A.length]} ${B[Math.floor(k / A.length + k) % B.length]}`;
  return { k, name, story: 'Una figura que nadie había visto todavía.', cost: 5, pts, lines };
}
export const skyTotal = (c) => c.pts.length * c.cost;
