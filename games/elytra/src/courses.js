/* Catálogo de circuitos. Elegir uno recarga la página (?c=<id>): el mundo se
   construye para el circuito activo (tallado del terreno, arcos/puentes/anillo y
   obstáculos que respetan su trazado).

   Puerta: x, z (o canyon:true → z sobre el eje del cañón); altura a (sobre la
   superficie) o abs (absoluta); zone (cartel al cruzarla); feature: arch | bridge |
   ring (obstáculo que el mundo construye alrededor).
   kind: 'loop' (la vuelta siguiente empieza al cruzar otra vez la primera puerta) o
   'sprint' (punto a punto: en la meta se reinicia solo).
   start (opcional): { x, z, a | abs, speed }; apunta a la primera puerta. Sin él, la
   salida queda 380 m detrás de la primera puerta y en altura.
   weather (opcional): fog { top, falloff, strength } niebla por altura;
   clouds { x, z, r, y, thickness, count } mar de nubes que se atraviesa;
   wind { dir (°, hacia donde sopla), speed, gust } viento con ráfagas (m/s).
   medals: segundos. Regla con T = tiempo del piloto automático (con impulso):
   autor ⌊0,95T⌋ · oro ⌈1,08T⌉ · plata ⌈1,25T⌉ · bronce ⌈1,55T⌉. */

export const COURSES = [
  {
    id: 'main', name: 'GRAN VUELTA', kind: 'loop',
    medals: { author: 48, gold: 55, silver: 64, bronze: 80 },   // T ≈ 50,8 s
    gates: [
      { x: -1050, z: -1000, a: 90,  zone: 'AGUJAS' },
      { x: -820,  z: -1180, a: 70 },
      { x: -600,  z: -980,  a: 60 },
      { x: -380,  z: -1150, a: 80 },
      { x: 150,   z: -1050, a: 70,  feature: 'arch', zone: 'MESETA' },
      { x: 420,   z: -480,  a: 70,  zone: 'LADERA DEL MACIZO' },
      { x: 450,   canyon: true, a: 30, zone: 'CAÑÓN' },
      { x: 750,   canyon: true, a: 22, feature: 'bridge' },
      { x: 1050,  canyon: true, a: 32, feature: 'arch' },
      { x: 1350,  canyon: true, a: 28 },
      { x: 1250,  z: 650,  a: 90 },
      { x: 1000,  z: 900,  a: 32,  feature: 'ring', zone: 'RUINAS' },
      { x: 760,   z: 1080, a: 30 },
      { x: 560,   z: 950,  a: 40 },
      { x: 250,   z: 1050, a: 150, zone: 'ISLAS FLOTANTES' },
      { x: -50,   z: 1150, abs: 330 },
      { x: -330,  z: 980,  abs: 380 },
      { x: -560,  z: 1100, abs: 260 },
      { x: -960,  z: 820,  a: 22,  zone: 'LAGO' },
      { x: -1180, z: 1060, a: 20 },
      { x: -1250, z: 450,  a: 40,  feature: 'arch', zone: 'VALLE' },
      { x: -1150, canyon: true, a: 25, feature: 'bridge' },
      { x: -1150, z: -780, a: 70,  zone: 'META' },
    ],
  },
  {
    // Picado de entrada al cañón por el oeste y río abajo hacia el este
    id: 'canon', name: 'CAÑÓN', kind: 'sprint',
    medals: { author: 15, gold: 18, silver: 20, bronze: 25 },   // T ≈ 16,0 s
    start: { x: -1650, canyon: true, a: 160, speed: 80 },
    weather: { fog: { top: 45, falloff: 24, strength: 0.014 } },   // niebla densa en el fondo
    gates: [
      { x: -1300, canyon: true, a: 32, zone: 'CAÑÓN' },
      { x: -1040, canyon: true, a: 26, feature: 'bridge' },
      { x: -780,  canyon: true, a: 30 },
      { x: -520,  canyon: true, a: 24 },
      { x: -260,  canyon: true, a: 32, feature: 'arch' },
      { x: 0,     canyon: true, a: 26 },
      { x: 260,   canyon: true, a: 24, feature: 'bridge' },
      { x: 520,   canyon: true, a: 30 },
      { x: 780,   canyon: true, a: 32, feature: 'arch' },
      { x: 1040,  canyon: true, a: 26 },
      { x: 1300,  canyon: true, a: 30, zone: 'META' },
    ],
  },
  {
    // Eslalon vertical entre las islas flotantes, de arriba abajo
    id: 'islas', name: 'ISLAS', kind: 'sprint',
    medals: { author: 20, gold: 24, silver: 27, bronze: 34 },   // T ≈ 21,5 s
    start: { x: -650, z: 480, abs: 560, speed: 70 },
    weather: { clouds: { x: -250, z: 1000, r: 760, y: 135, thickness: 50, count: 115 } },   // mar de nubes
    gates: [
      { x: -450, z: 750,  abs: 470, zone: 'ISLAS FLOTANTES' },
      { x: -150, z: 850,  abs: 410 },
      { x: -450, z: 1000, abs: 350 },
      { x: -100, z: 1150, abs: 310 },
      { x: -400, z: 1280, abs: 260 },
      { x: -750, z: 1150, abs: 300 },
      { x: 0,    z: 1000, abs: 220 },
      { x: 250,  z: 1150, abs: 170 },
      { x: 100,  z: 850,  a: 40, zone: 'META' },
    ],
  },
  {
    // De la cumbre del macizo en espiral por sus laderas, cañón y lago
    id: 'descenso', name: 'DESCENSO', kind: 'sprint',
    medals: { author: 18, gold: 21, silver: 25, bronze: 30 },   // T ≈ 19,2 s (con viento)
    start: { x: 720, z: -800, a: 60, speed: 40 },
    weather: { wind: { dir: 135, speed: 14, gust: 16 } },   // viento cruzado fuerte hacia el SE
    gates: [
      { x: 950,  z: -1000, a: 40, zone: 'CUMBRE' },
      { x: 1150, z: -700,  a: 35 },
      { x: 1000, z: -400,  a: 30 },
      { x: 700,  z: -250,  a: 30 },
      { x: 400,  z: -100,  a: 30 },
      { x: 150,  canyon: true, a: 25, zone: 'CAÑÓN' },
      { x: -100, canyon: true, a: 25 },
      { x: -470, z: 450,  a: 35 },
      { x: -650, z: 620,  a: 25, zone: 'LAGO' },
      { x: -850, z: 820,  a: 15 },
      { x: -1000, z: 980, a: 12, zone: 'META' },
    ],
  },
  {
    // Vuelta larga: lago → islas → ruinas → cañón de este a oeste → agujas → valle
    id: 'travesia', name: 'TRAVESÍA', kind: 'loop',
    weather: { wind: { dir: 60, speed: 8, gust: 8 } },
    medals: { author: 46, gold: 54, silver: 62, bronze: 77 },   // T ≈ 49,4 s (con viento)
    gates: [
      { x: -900,  z: 700,  a: 30,  zone: 'LAGO' },
      { x: -650,  z: 950,  a: 25 },
      { x: -350,  z: 1100, abs: 300, zone: 'ISLAS FLOTANTES' },
      { x: -50,   z: 950,  abs: 360 },
      { x: 100,   z: 750,  abs: 420 },
      { x: 250,   z: 1150, abs: 260 },
      { x: 650,   z: 1050, a: 35,  zone: 'RUINAS' },
      { x: 950,   z: 900,  a: 30,  feature: 'ring' },
      { x: 1100,  z: 1060, a: 60 },
      { x: 1250,  z: 700,  a: 70 },
      { x: 1300,  canyon: true, a: 30, zone: 'CAÑÓN' },
      { x: 1000,  canyon: true, a: 26 },
      { x: 700,   canyon: true, a: 30, feature: 'arch' },
      { x: 400,   canyon: true, a: 25 },
      { x: 100,   canyon: true, a: 28, feature: 'bridge' },
      { x: -200,  canyon: true, a: 30 },
      { x: -400,  canyon: true, a: 28 },
      { x: -650,  z: -750, a: 70,  zone: 'AGUJAS' },
      { x: -950,  z: -1000, a: 60 },
      { x: -1250, z: -800, a: 60 },
      { x: -1150, canyon: true, a: 30 },
      { x: -950,  z: 0,    a: 50,  zone: 'VALLE' },
      { x: -1150, z: 250,  a: 40,  feature: 'arch' },
      { x: -1100, z: 500,  a: 30,  zone: 'META' },
    ],
  },
];

export const COURSE_ORDER = COURSES.map((c) => c.id);
const KEY = 'elytra.course';

/** Circuito activo: ?c=<id> > localStorage > GRAN VUELTA. Un id desconocido da 'main'. */
export function pickCourse() {
  const byId = (id) => COURSES.find((c) => c.id === id);
  const fromUrl = byId(new URLSearchParams(location.search).get('c'));
  if (fromUrl) { saveCourse(fromUrl.id); return fromUrl; }
  try { const c = byId(localStorage.getItem(KEY)); if (c) return c; } catch { /* sin storage */ }
  return COURSES[0];
}

export function saveCourse(id) {
  try { localStorage.setItem(KEY, id); } catch { /* sin storage */ }
}

/** URL de la página con otro parámetro (c o q), conservando el resto. */
export function urlWith(key, value) {
  const p = new URLSearchParams(location.search);
  p.set(key, value);
  return location.pathname + '?' + p;
}
