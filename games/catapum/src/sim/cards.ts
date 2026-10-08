// Las cartas (inspiradas en las de Boom Slingers, pasadas a tiempo real). Solo datos: lo que hace cada una está en
// combat.ts (lanzar) y en los proyectiles. dmg en % (sube el empuje que recibís), kb = empuje base m/s y kg = empuje
// extra por cada 100 % que ya tenga el golpeado. carve = radio que rompe del terreno (la piedra nunca se rompe).
// aim: 'arc' tira con fuerza (largo de la mira), 'line' solo dirección, 'self' sin mira, 'place' al punto apuntado.
export type Boom = { r: number, dmg: number, kb: number, kg: number, carve: number, frag?: number };
export type Proj = {
  v: number, g: number, r: number,
  bounce?: number,     // rebote contra el terreno (sin: se queda o explota)
  fuse?: number,       // s hasta explotar
  contact?: boolean,   // explota al tocar terreno o a un rival
  sticky?: boolean,    // se pega al terreno o a un rival
  pierce?: { dmg: number, kb: number, kg: number, frag?: number }, // golpea al pasar (una vez a cada uno)
  accel?: number, vmax?: number, // cohete
  life?: number,       // s hasta desaparecer
  boom?: Boom,
};
export type CardType = 'EXPLOSIVO' | 'RAYO' | 'MOVIMIENTO' | 'TRAMPA' | 'APOYO' | 'CUERPO';
export type Card = {
  id: string, name: string, cost: number, rar: 0 | 1 | 2, type: CardType, aim: 'arc' | 'line' | 'self' | 'place',
  desc: string, proj?: Proj,
};

const B = (r: number, dmg: number, kb: number, kg: number, carve: number, frag?: number): Boom => ({ r, dmg, kb, kg, carve, frag });

export const CARDS: Card[] = [
  // Explosivos
  { id: 'fueguito', name: 'BOLITA DE FUEGO', cost: 1, rar: 0, type: 'EXPLOSIVO', aim: 'line', desc: 'Rápida y casi recta. Explota al tocar algo.',
    proj: { v: 26, g: 0.25, r: 0.2, contact: true, life: 1.4, boom: B(1.3, 6, 6, 9, 0.9) } },
  { id: 'bomba', name: 'BOMBA :D', cost: 2, rar: 0, type: 'EXPLOSIVO', aim: 'arc', desc: '1, 2, ¡BUM! Rebota y explota con la mecha.',
    proj: { v: 21, g: 1, r: 0.3, bounce: 0.45, fuse: 1.6, boom: B(2.2, 11, 9, 13, 1.8) } },
  { id: 'caballo', name: 'CABALLO LOCO', cost: 2, rar: 0, type: 'EXPLOSIVO', aim: 'arc', desc: 'Rebota sin control y explota grande al cuarto rebote.',
    proj: { v: 18, g: 1, r: 0.4, bounce: 0.85, fuse: 3, boom: B(2.6, 13, 9, 13, 2.2) } },
  { id: 'pegajosa', name: 'BOMBA PEGAJOSA', cost: 2, rar: 0, type: 'EXPLOSIVO', aim: 'arc', desc: 'Se pega al terreno o a un rival. Explota en 1,8 s.',
    proj: { v: 20, g: 1, r: 0.25, sticky: true, fuse: 1.8, boom: B(2, 12, 9, 13, 1.6) } },
  { id: 'cohetito', name: 'COHETITO', cost: 2, rar: 0, type: 'EXPLOSIVO', aim: 'line', desc: 'Acelera recto y explota. Disparalo al piso para volar (te empuja, no te daña).',
    proj: { v: 12, g: 0, r: 0.25, accel: 45, vmax: 36, contact: true, life: 2, boom: B(1.9, 10, 10, 12, 1.5) } },
  { id: 'bola', name: 'BOLA DE FUEGO', cost: 3, rar: 1, type: 'EXPLOSIVO', aim: 'arc', desc: 'Grande y pesada. Explota al tocar algo.',
    proj: { v: 20, g: 0.8, r: 0.45, contact: true, life: 4, boom: B(2.8, 15, 10, 14, 2.4) } },
  { id: 'triple', name: 'TRIPLE', cost: 3, rar: 1, type: 'EXPLOSIVO', aim: 'line', desc: 'Tres disparos en abanico.',
    proj: { v: 30, g: 0.35, r: 0.15, contact: true, life: 1.5, boom: B(1.1, 6, 7, 9, 0.8) } },
  { id: 'racimo', name: 'BOMBA RACIMO', cost: 4, rar: 1, type: 'EXPLOSIVO', aim: 'arc', desc: 'Explota y suelta seis bombitas.',
    proj: { v: 19, g: 1, r: 0.35, bounce: 0.4, fuse: 1.3, boom: B(1.6, 6, 6, 8, 1.2) } },
  { id: 'granbum', name: 'GRAN BUM', cost: 4, rar: 1, type: 'EXPLOSIVO', aim: 'arc', desc: 'Lenta, pesada y enorme. Se lleva medio mapa.',
    proj: { v: 15, g: 1.1, r: 0.55, bounce: 0.25, fuse: 2, boom: B(4, 20, 12, 16, 3.5) } },
  { id: 'palomitas', name: 'PALOMITAS', cost: 3, rar: 2, type: 'EXPLOSIVO', aim: 'arc', desc: '¡Pop pop pop BUM! La bolsa revienta en granos que saltan y explotan.',
    proj: { v: 18, g: 1, r: 0.3, contact: true, life: 4, boom: B(1, 3, 4, 4, 0.6) } },
  { id: 'melocoton', name: 'MELOCOTÓN PODRIDO', cost: 2, rar: 0, type: 'EXPLOSIVO', aim: 'arc', desc: 'Nube morada: quien la respira queda FRÁGIL (lo empujan mucho más).',
    proj: { v: 20, g: 1, r: 0.3, contact: true, life: 4, boom: B(1.2, 4, 4, 4, 0.5, 2) } },
  { id: 'shuriken', name: 'SHURIKEN', cost: 1, rar: 0, type: 'EXPLOSIVO', aim: 'line', desc: 'Muy rápida, atraviesa rivales y los deja FRÁGILES un momento.',
    proj: { v: 34, g: 0.15, r: 0.15, life: 3, pierce: { dmg: 5, kb: 5, kg: 8, frag: 1.5 } } },
  { id: 'boomerang', name: 'BOOMERANG', cost: 2, rar: 0, type: 'EXPLOSIVO', aim: 'line', desc: 'Va y vuelve atravesando todo. Golpea a la ida y a la vuelta.',
    proj: { v: 26, g: 0, r: 0.3, life: 2.4, pierce: { dmg: 6, kb: 7, kg: 10 } } },
  { id: 'caparazon', name: 'CAPARAZÓN', cost: 3, rar: 0, type: 'EXPLOSIVO', aim: 'line', desc: 'Rueda por el suelo, rebota en las paredes y arrolla. No rompe nada.',
    proj: { v: 14, g: 1, r: 0.4, life: 7, pierce: { dmg: 8, kb: 11, kg: 13 } } },
  // Rayos
  { id: 'laser', name: 'LÁSER', cost: 2, rar: 0, type: 'RAYO', aim: 'line', desc: 'Rayo instantáneo que atraviesa rivales y abre un túnel fino.' },
  { id: 'megalaser', name: 'MEGALÁSER', cost: 6, rar: 2, type: 'RAYO', aim: 'line', desc: 'Carga medio segundo y suelta un rayo gordo que lo atraviesa todo.' },
  { id: 'vaca', name: 'VACA OVNI', cost: 4, rar: 1, type: 'RAYO', aim: 'place', desc: '¡MUU! Un ovni suelta un rayo hacia abajo: abre el piso y hunde a los rivales.' },
  { id: 'iman', name: 'IMÁN', cost: 3, rar: 0, type: 'RAYO', aim: 'line', desc: 'Al primer rival que toca lo tira con fuerza hacia vos (¿al agua? ¿a una pared?).' },
  { id: 'meteorito', name: 'METEORITO', cost: 5, rar: 2, type: 'RAYO', aim: 'place', desc: 'Una roca enorme cae del cielo donde apuntes.' },
  // Movimiento
  { id: 'supersalto', name: 'SUPERSALTO', cost: 1, rar: 0, type: 'MOVIMIENTO', aim: 'line', desc: 'Salís disparado hacia la mira y recuperás el doble salto y el dash.' },
  { id: 'tele', name: 'TELETRANSPORTE', cost: 3, rar: 1, type: 'MOVIMIENTO', aim: 'arc', desc: 'Tirás un orbe y aparecés donde toque.',
    proj: { v: 22, g: 1, r: 0.2, contact: true, life: 3 } },
  { id: 'swap', name: 'INTERCAMBIO', cost: 4, rar: 1, type: 'MOVIMIENTO', aim: 'line', desc: 'Si toca a un rival o a una caja, cambian de lugar.',
    proj: { v: 26, g: 0.3, r: 0.25, contact: true, life: 2 } },
  // Trampas
  { id: 'mina', name: 'MINA', cost: 1, rar: 0, type: 'TRAMPA', aim: 'arc', desc: 'Se pega al terreno y explota cuando se acerca un rival.',
    proj: { v: 14, g: 1, r: 0.25, sticky: true, life: 25, boom: B(1.8, 12, 11, 13, 1.4) } },
  { id: 'gas', name: 'LATA DE GAS', cost: 2, rar: 0, type: 'TRAMPA', aim: 'arc', desc: 'Una lata que, al recibir un golpe, explota en llamas.' },
  { id: 'tnt', name: 'CAJA TNT', cost: 2, rar: 0, type: 'TRAMPA', aim: 'arc', desc: 'Una caja que explota fuerte con cualquier golpe. Se puede enganchar y tirar.' },
  { id: 'pegamento', name: 'PEGAMENTO', cost: 2, rar: 0, type: 'TRAMPA', aim: 'arc', desc: 'Mancha pegajosa: el rival que la pisa corre y salta poco, y no lo pueden intercambiar.',
    proj: { v: 18, g: 1, r: 0.3, contact: true, life: 3 } },
  { id: 'banana', name: 'BANANA', cost: 1, rar: 0, type: 'TRAMPA', aim: 'arc', desc: 'El rival que la pisa resbala por el aire y queda FRÁGIL.',
    proj: { v: 12, g: 1, r: 0.25, sticky: true, life: 20 } },
  // Apoyo
  { id: 'fruta', name: 'FRUTA CURATIVA', cost: 2, rar: 0, type: 'APOYO', aim: 'self', desc: 'Te baja 35 % de daño y te quita lo FRÁGIL.' },
  { id: 'escudo', name: 'ESCUDO', cost: 3, rar: 1, type: 'APOYO', aim: 'self', desc: 'Burbuja de 3 s: no te golpean ni te empujan, y devuelve lo que le tiran.' },
  { id: 'plomo', name: 'PIES DE PLOMO', cost: 2, rar: 1, type: 'APOYO', aim: 'self', desc: 'Por 6 s te empujan mucho menos (pero corrés más lento).' },
  // Cuerpo a cuerpo
  { id: 'bate', name: 'BATE', cost: 2, rar: 0, type: 'CUERPO', aim: 'line', desc: 'Batazo hacia la mira: empuja muchísimo y devuelve proyectiles.' },
  { id: 'katana', name: 'KATANA', cost: 3, rar: 1, type: 'CUERPO', aim: 'line', desc: 'Corte relámpago de 7 m que golpea a todos en el camino.' },
  { id: 'trompeta', name: 'TROMPETA', cost: 4, rar: 2, type: 'CUERPO', aim: 'line', desc: '¡PRRRÚ! Un cono de sonido que empuja todo muy lejos (casi sin daño).' },
  { id: 'autodestruccion', name: 'AUTODESTRUCCIÓN', cost: 5, rar: 2, type: 'CUERPO', aim: 'self', desc: 'Explotás vos: enorme. Salís volando hacia arriba con +25 %.' },
];

export const CARD: Record<string, Card> = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const RARITY = ['COMÚN', 'RARA', 'ÉPICA'] as const;
export const DECK_SIZE = 8, HAND = 4;

// Subproyectiles (no son cartas): bombitas del racimo, granos de las palomitas, rocas del volcán y el meteorito
export const SUB: Record<string, Proj> = {
  bombita: { v: 0, g: 1, r: 0.2, bounce: 0.5, fuse: 0.8, boom: B(1.5, 7, 8, 10, 1.2) },
  grano: { v: 0, g: 1, r: 0.15, bounce: 0.6, fuse: 1, boom: B(1.3, 5, 8, 9, 1.1) },
  roca: { v: 0, g: 1, r: 0.6, contact: true, life: 6, boom: B(2.4, 12, 11, 13, 2) },
  meteoro: { v: 0, g: 1.4, r: 1, contact: true, life: 6, boom: B(3.6, 22, 13, 17, 3.2) },
};
export const projOf = (k: string): Proj | undefined => CARD[k]?.proj ?? SUB[k];

// ¿Es un mazo válido? 8 cartas distintas que existen
export const validDeck = (d: unknown): d is string[] =>
  Array.isArray(d) && d.length === DECK_SIZE && new Set(d).size === DECK_SIZE && d.every(x => typeof x === 'string' && !!CARD[x]);
