// Papeles, quién oye y quién ve a quién, y los datos que comparten la bomba, el manual y el dibujo.

// Los tres monos sabios al revés: el CIEGO toca la bomba, el SORDO la ve y el MUDO tiene el manual.
export type Role = 'ciego' | 'sordo' | 'mudo';
export const ROLES: readonly Role[] = ['ciego', 'sordo', 'mudo'];
export const ROLE_NAME: Record<Role, string> = { ciego: 'CIEGO', sordo: 'SORDO', mudo: 'MUDO' };

// Con la bomba armada (en la sala todos se oyen y se ven):
//  - el SORDO no oye a nadie; el CIEGO solo al SORDO; el MUDO a los dos (y a él no lo oye nadie).
//  - el SORDO ve los gestos del CIEGO y del MUDO; el MUDO, los del SORDO; el CIEGO no ve nada.
export const hears = (listener: Role, speaker: Role) =>
  listener !== speaker && speaker !== 'mudo' && (listener === 'mudo' || (listener === 'ciego' && speaker === 'sordo'));
export const sees = (viewer: Role, actor: Role) =>
  viewer !== actor && (viewer === 'sordo' || (viewer === 'mudo' && actor === 'sordo'));

// Colores: los cuatro primeros son los de las luces y los botones; cables y correderas usan los seis.
export const COLORS = ['rojo', 'azul', 'verde', 'amarillo', 'blanco', 'negro'] as const;
export const LIGHTS = 4;
export const NOTES = ['DO', 'RE', 'MI', 'FA', 'SOL', 'LA', 'SI'] as const;
// Los símbolos de la ruleta son 12 ids: forma (estrella, luna, triángulo, círculo, cruz, rombo) · 2 + hueco (draw.ts → symbol).
// Direcciones: 0 ↑, 1 →, 2 ↓, 3 ←
export const DXY: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Braille: los dígitos son las letras a–j (puntos 1 2 3 de arriba abajo a la izquierda, 4 5 6 a la derecha)
export const BRAILLE: Record<number, readonly number[]> = {
  1: [1], 2: [1, 2], 3: [1, 4], 4: [1, 4, 5], 5: [1, 5], 6: [1, 2, 4], 7: [1, 2, 4, 5], 8: [1, 2, 5], 9: [2, 4], 0: [2, 4, 5],
};

// Gestos (el mismo juego para los tres; el que más los usa es el MUDO)
export const GESTURES = [
  'si', 'no', 'duda', 'espera', 'repite', 'ojo', 'bien', 'mal',
  'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10',
  'arriba', 'derecha', 'abajo', 'izquierda', 'medio',
] as const;
export type Gesture = typeof GESTURES[number];
export const GESTURE_NAME: Record<Gesture, string> = {
  si: 'SÍ', no: 'NO', duda: '¿QUÉ?', espera: 'ESPERÁ', repite: 'OTRA VEZ', ojo: '¡OJO!', bien: '¡BIEN!', mal: 'MAL',
  n0: '0', n1: '1', n2: '2', n3: '3', n4: '4', n5: '5', n6: '6', n7: '7', n8: '8', n9: '9', n10: '10',
  arriba: 'ARRIBA', derecha: 'DERECHA', abajo: 'ABAJO', izquierda: 'IZQUIERDA', medio: 'AL MEDIO',
};
export const isGesture = (g: unknown): g is Gesture => typeof g === 'string' && (GESTURES as readonly string[]).includes(g);
