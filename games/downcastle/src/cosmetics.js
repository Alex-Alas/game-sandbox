/* Cosméticos v1 (puro, sin DOM): títulos y estilos de cuerda. Se ganan con hazañas
   acumuladas en el perfil (nunca dan ventaja). En el inventario van como 't:<id>' y 'r:<id>'.
   Los umbrales son datos: se ajustan jugando. */
import { BEASTS } from './beasts.js';

const st = (p, k) => p.stats?.[k] || 0;

/* Un título por premio social (awards.js), al acumular su contador. */
export const TITLES = [
  { id: 'ancla', name: 'El Ancla', stat: 'anchorLoadT', min: 60, desc: 'Anclate 60 s con carga' },
  { id: 'bungee', name: 'El Saltimbanqui', stat: 'bungeeGems', min: 10, desc: 'Juntá 10 gemas en pleno rebote' },
  { id: 'fuego', name: 'Gatillo Fácil', stat: 'ffHits', min: 30, desc: 'Dispará 30 veces a tus compañeros' },
  { id: 'tiron', name: 'El Traicionero', stat: 'traitorTugs', min: 10, desc: '10 tirones que terminaron en daño' },
  { id: 'salva', name: 'Salvavidas', stat: 'rescues', min: 15, desc: 'Rescatá 15 veces a alguien' },
  { id: 'hadas', name: 'Domador de Hadas', stat: 'angryFairies', min: 10, desc: 'Enojá a 10 hadas' },
  { id: 'gracia', name: 'Matajefes', stat: 'bossFinal', min: 1, desc: 'Dale el golpe final a un jefe' },
  { id: 'peso', name: 'Peso Muerto', stat: 'koT', min: 120, desc: 'Pasá 120 s fuera de combate' },
].map((t) => ({ ...t, cond: (p) => st(p, t.stat) >= t.min, progress: (p) => Math.min(1, st(p, t.stat) / t.min) }));

/* Cuerdas. pattern: cómo se pinta cada píxel (ver ropeColor). */
export const ROPES = [
  { id: 'soga', name: 'Soga', free: true, desc: 'La de siempre', pattern: 'plain', c: ['#b88b56', '#e8925a'] },
  { id: 'roja', name: 'Roja', desc: 'Superá 10 tramos', pattern: 'plain', c: ['#b8433a', '#ee6a52'],
    cond: (p) => st(p, 'tramosWon') >= 10, progress: (p) => Math.min(1, st(p, 'tramosWon') / 10) },
  { id: 'trenzada', name: 'Trenzada', desc: 'Vencé a El Ojo', pattern: 'braid', c: ['#d9b26f', '#7a5230'],
    cond: (p) => (p.feats?.ojo || 0) >= 1 },
  { id: 'cadena', name: 'Cadena', desc: 'Llegá al ciclo 2', pattern: 'chain', c: ['#a9b0b8', '#4b5058'],
    cond: (p) => (p.best?.ciclo || 0) >= 2 },
  { id: 'rayas', name: 'A rayas', desc: 'Completá una bajada sin caídos', pattern: 'stripes', c: ['#f4e6cf', '#3d7fd1'],
    cond: (p) => (p.feats?.bajadaLimpia || 0) >= 1 },
  { id: 'dorada', name: 'Dorada', desc: 'Juntá 500 gemas', pattern: 'sparkle', c: ['#e8b93c', '#fff3a8'],
    cond: (p) => st(p, 'gems') >= 500, progress: (p) => Math.min(1, st(p, 'gems') / 500) },
  { id: 'espinas', name: 'Espinas', desc: 'Caé fuera de combate 50 veces', pattern: 'thorns', c: ['#3f6b3a', '#b7e07a'],
    cond: (p) => st(p, 'kos') >= 50, progress: (p) => Math.min(1, st(p, 'kos') / 50) },
  { id: 'brillante', name: 'Brillante', desc: 'Completá el bestiario', pattern: 'rainbow', c: ['#ff6b6b', '#6bd5ff'],
    cond: (p) => BEASTS.every((b) => (p.beasts?.[b.kind]?.seen || 0) > 0),
    progress: (p) => BEASTS.filter((b) => (p.beasts?.[b.kind]?.seen || 0) > 0).length / BEASTS.length },
];

export const titleById = (id) => TITLES.find((t) => t.id === id) || null;
export const ropeById = (id) => ROPES.find((r) => r.id === id) || ROPES[0];
/* Lo que el anfitrión acepta de un perfil ajeno: solo ids conocidos (el progreso confía en el cliente). */
export const validTitle = (id) => (titleById(id) ? id : '');
export const validRope = (id) => (ROPES.some((r) => r.id === id) ? id : 'soga');

/* Color del píxel n de una cuerda (n crece desde el extremo del dueño). */
export function ropeColor(id, n, t, taut) {
  const r = ropeById(id), [a, b] = r.c;
  switch (r.pattern) {
    case 'braid': return (n >> 1) % 2 ? b : a;
    case 'chain': return n % 3 === 2 ? b : a;
    case 'stripes': return (n >> 2) % 2 ? b : a;
    case 'sparkle': return (n + Math.floor(t * 12)) % 9 === 0 ? b : a;
    case 'thorns': return n % 4 === 0 ? b : a;
    case 'rainbow': return `hsl(${(n * 9 + t * 120) % 360} 85% 65%)`;
    default: return taut ? b : a;
  }
}
