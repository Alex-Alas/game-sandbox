/* CHIBOLAZO: contenido (solo datos). Mesa lógica de W × H; y hacia abajo. */
export const W = 360, H = 700;
export const TOP = 48;        // borde de arriba de la mesa (encima va el HUD)
export const LINE = 492;      // línea de defensa: el enemigo que la cruza le pega a la máquina
export const BR = 9;          // radio de la bola
export const PR = 15;         // radio de las piezas
export const SOCKETS = [[80, 175], [180, 145], [280, 175], [130, 255], [230, 255], [72, 345], [180, 330], [288, 345]];
export const ELS = ['fuego', 'hielo', 'rayo'];
export const EL_COL = { fuego: '#ff7a1a', hielo: '#6fdcff', rayo: '#ffe14a' };

/* Reacciones: dos elementos distintos sobre el mismo enemigo. */
export const REACT = {
  'fuego+hielo': { name: '¡OLLA EXPRÉS!', col: '#e8f6ff', desc: 'revienta el vapor: explosión grande que empuja todo hacia arriba' },
  'fuego+rayo': { name: '¡CORTOCIRCUITO!', col: '#ff5fd2', desc: 'explosión que prende fuego a todos alrededor' },
  'hielo+rayo': { name: '¡CRISTALAZO!', col: '#a8f0ff', desc: 'el hielo estalla: daño ×4 y esquirlas que congelan' },
};

/* col: color de sus pedazos al morir. spr: animación del atlas 0x72 (sin _fN). r: radio de choque. v: px/s hacia abajo.
   immune: elemento que no le hace nada. aura: la bola que lo toca se carga de ese elemento.
   every/act: habilidad cada tantos segundos. */
export const ENEMIES = {
  goblin:    { name: 'Goblin', col: '#7bd66b', spr: 'goblin_run_anim', hp: 4, v: 13, r: 12, coin: 1 },
  esqueleto: { name: 'Esqueleto', col: '#e8e2d0', spr: 'skelet_run_anim', hp: 2, v: 26, r: 11, coin: 1 },
  slime:     { name: 'Slime', col: '#5fbf6a', spr: 'swampy_anim', hp: 5, v: 13, r: 12, coin: 1, split: 'slimito' },
  slimito:   { name: 'Slimito', col: '#9a7a4a', spr: 'muddy_anim', hp: 1, v: 24, r: 8, coin: 0, s: 0.7 },
  orco:      { name: 'Orco blindado', col: '#8a8fa8', spr: 'masked_orc_run_anim', hp: 6, v: 11, r: 13, coin: 2, armor: 3 },
  diablillo: { name: 'Diablillo', col: '#ff5a3a', spr: 'imp_run_anim', hp: 3, v: 20, r: 11, coin: 1, immune: 'fuego', zig: 1 },
  helado:    { name: 'Zombi helado', col: '#8fe0ff', spr: 'ice_zombie_anim', hp: 5, v: 13, r: 12, coin: 2, immune: 'hielo', aura: 'hielo' },
  chaman:    { name: 'Chamán', col: '#5fbf6a', spr: 'orc_shaman_run_anim', hp: 5, v: 10, r: 12, coin: 3, every: 4, act: 'shield' },
  nigro:     { name: 'Nigromante', col: '#a07ad8', spr: 'necromancer_anim', hp: 6, v: 9, r: 12, coin: 3, every: 5, act: 'raise' },
  chort:     { name: 'Saboteador', col: '#c86a8a', spr: 'chort_run_anim', hp: 5, v: 15, r: 12, coin: 2, sabotage: 1 },
  // Amenazas: cada una pide un contra distinto, pero siempre tiene una salida para la bola sola
  espectro:  { name: 'Espectro', col: '#b8f0ff', spr: 'wogol_run_anim', hp: 5, v: 15, r: 11, coin: 2, spectral: 1 },
  zombito:   { name: 'Zombitos', col: '#7aa070', spr: 'tiny_zombie_run_anim', hp: 1, v: 21, r: 8, coin: 0, s: 0.85, nibble: 1 },
  escudero:  { name: 'Escudero', col: '#9aa0b8', spr: 'orc_warrior_run_anim', hp: 7, v: 11, r: 13, coin: 2, guard: 1 },
  calabazo:  { name: 'Calabazo', col: '#ff9a3a', spr: 'pumpkin_dude_run_anim', hp: 10, v: 10, r: 13, coin: 3, regen: 3 },
  tragon:    { name: 'Babosa tragona', col: '#c8a0d8', spr: 'slug_anim', hp: 9, v: 9, r: 14, coin: 3, swallow: 1, s: 1.3 },
  cofre:     { name: 'Cofre', col: '#ffd84a', spr: 'chest_full_open_anim', hp: 3, v: 34, r: 11, coin: 4, harmless: 1, still: 1 },
  ogro:      { name: 'OGRO', col: '#c8a070', spr: 'ogre_run_anim', hp: 70, v: 6, r: 26, coin: 15, boss: 1, every: 6, act: 'stomp' },
  demonio:   { name: 'GRAN DEMONIO', col: '#ff4a3a', spr: 'big_demon_run_anim', hp: 140, v: 6, r: 26, coin: 25, boss: 1, immune: 'fuego', every: 5, act: 'imps' },
  zombi:     { name: 'ZOMBI REY', col: '#7aa070', spr: 'big_zombie_run_anim', hp: 220, v: 5, r: 26, coin: 40, boss: 1, aura: 'hielo', every: 5, act: 'raise' },
};
export const BOSSES = ['ogro', 'demonio', 'zombi'];
// Desde qué oleada aparece cada uno
export const UNLOCK = { goblin: 1, esqueleto: 2, slime: 3, orco: 4, diablillo: 6, helado: 6, chaman: 7, nigro: 8, chort: 8 };

/* Amenaza de la oleada: desde la oleada w puede protagonizar una (40 % de la oleada). La tienda la avisa antes. */
export const THREATS = {
  espectro: { w: 4, tip: 'La bola sola lo atraviesa. Con un elemento, balas o explosiones sí le pegás; cada tanto se vuelve sólido.' },
  zombito:  { w: 5, tip: 'Vienen de a cuatro con 1 de vida. Cada 3 que cruzan, −1 ❤. Explosiones, rayos y METRALLA.' },
  escudero: { w: 7, tip: 'Su escudo frena la bola que viene de abajo. Pegale desde arriba (HONGO) o con rayos, balas y explosiones. Los elementos pasan igual.' },
  calabazo: { w: 9, tip: 'Si no lo golpeás seguido, se cura. Ardiendo o congelado no puede.' },
  tragon:   { w: 11, tip: 'Se traga la bola y la escupe hacia abajo. Matala con la bola adentro y sale disparada para arriba. Más bolas o CAÑÓN ayudan.' },
};

/* Eventos: le cambian las reglas a una oleada. También se avisan en la tienda. */
export const EVENTS = {
  luna:      { name: 'LUNA DE SANGRE', col: '#ff4a6a', desc: 'Enemigos 35 % más rápidos. Monedas ×2.' },
  oro:       { name: 'LLUVIA DE ORO', col: '#ffd84a', desc: 'Caen cofres con monedas. Si se escapan, no pasa nada.' },
  tormenta:  { name: 'TORMENTA ELEMENTAL', col: '#ff5fd2', desc: 'Todos llegan con un elemento al azar: todo reacciona.' },
  hierro:    { name: 'EDAD DE HIERRO', col: '#bfc6dd', desc: 'Todos llegan con 2 de armadura. Lo que no es la bola la ignora.' },
  estampida: { name: 'ESTAMPIDA', col: '#7bf0a0', desc: 'El doble de enemigos, con la mitad de vida.' },
};

/* Chasis: la forma de arriba de la máquina, de la pared izquierda (x = 8) a la derecha (x = 352).
   Los costados, el embudo y los enchufes no cambian: así ninguna forma tapa una pieza. */
const arc = (n) => Array.from({ length: n + 1 }, (_, i) => { const a = Math.PI * (1 - i / n); return [180 + 172 * Math.cos(a), 170 - 122 * Math.sin(a)]; });
export const CHASSIS = [
  { id: 'chata', name: 'CHATA', desc: 'Techo plano con esquinas cortadas.', top: [[8, 100], [60, 48], [300, 48], [352, 100]] },
  { id: 'cupula', name: 'CÚPULA', desc: 'Techo redondo: la bola corre por el borde y baja del otro lado.', top: arc(14) },
  { id: 'aguja', name: 'AGUJA', desc: 'Techo en punta: manda la bola hacia los costados.', top: [[8, 150], [180, 48], [352, 150]] },
  { id: 'corona', name: 'CORONA', desc: 'Dos torres y un colmillo al medio que reparte la bola.', top: [[8, 110], [90, 48], [180, 100], [270, 48], [352, 110]] },
];

/* Piezas: se instalan en un enchufe y solo hacen algo cuando la bola las toca. */
export const PARTS = {
  // up: lo que gana al fusionarse (3 iguales del mismo nivel = una de nivel siguiente, hasta ★★)
  hongo:    { name: 'HONGO', price: 5, col: '#ff5fa2', desc: 'Rebota la bola con fuerza y suma combo.', up: 'Rebota más y suma más combo.' },
  brasero:  { name: 'BRASERO', price: 6, col: '#ff7a1a', el: 'fuego', desc: 'La bola arde 6 s: quema a quien golpea.', up: 'Dura más y prende a los enemigos cercanos.' },
  nevera:   { name: 'NEVERA', price: 6, col: '#6fdcff', el: 'hielo', desc: 'La bola se congela 6 s: frena a quien golpea.', up: 'Dura más y congela a los enemigos cercanos.' },
  bobina:   { name: 'BOBINA', price: 6, col: '#ffe14a', el: 'rayo', desc: 'La bola se electriza 6 s: el golpe salta a 2 vecinos.', up: 'Dura más y electriza a los enemigos cercanos.' },
  canon:    { name: 'CAÑÓN', price: 8, col: '#c9c9d6', desc: 'Al tocarlo dispara 3 balas con los elementos de la bola.', up: '5 balas, y 8 en ★★.' },
  gemela:   { name: 'GEMELA', price: 9, col: '#b98cff', desc: 'Al tocarlo suelta una bola fantasma por 8 s (cada 5 s).', up: 'Una fantasma más por nivel y recarga más rápido.' },
  iman:     { name: 'IMÁN', price: 7, col: '#ff4a4a', desc: 'Al tocarlo jala a los enemigos cercanos y los amontona.', up: 'Jala de más lejos y aprieta (daño).' },
  alcancia: { name: 'ALCANCÍA', price: 6, col: '#ffd27a', desc: '+1 moneda cada vez que la bola la toca.', up: '+2 monedas, y +4 en ★★.' },
};

/* Mejoras: se acumulan por nivel (max: tope). */
export const MODS = {
  plomo:    { name: 'PLOMO', price: 7, kind: 'BOLA', desc: '+1 de daño por golpe y empuja más.' },
  pua:      { name: 'PÚA', price: 9, kind: 'BOLA', max: 1, desc: 'La bola atraviesa a los enemigos en vez de rebotar.' },
  metralla: { name: 'METRALLA', price: 8, kind: 'BOLA', desc: 'Cada enemigo que muere suelta 2 esquirlas con los elementos de la bola.' },
  contagio: { name: 'CONTAGIO', price: 8, kind: 'BOLA', max: 1, desc: 'Los estados saltan solos al enemigo más cercano.' },
  eterna:   { name: 'MECHA ETERNA', price: 10, kind: 'BOLA', max: 1, desc: 'Los elementos de la bola ya no se apagan (hasta que se cae).' },
  resorte:  { name: 'RESORTE', price: 6, kind: 'BOLA', max: 1, desc: 'Bola rápida pega doble.' },
  salva:    { name: 'SALVABOLAS', price: 7, kind: 'ALETAS', desc: 'Una barrera salva la bola una vez por oleada (por nivel).' },
  impulso:  { name: 'IMPULSO', price: 6, kind: 'ALETAS', desc: 'Los aletazos lanzan la bola 20% más rápido.' },
  punta:    { name: 'TIRO DE PUNTA', price: 7, kind: 'ALETAS', max: 1, desc: 'Pegarle con la punta de la aleta: el próximo golpe hace ×3.' },
};

/* Máquinas: con qué condiciones arranca la partida (las «barajas» de Balatro). */
export const MACHINES = [
  { id: 'clasica', name: 'CLÁSICA', col: '#e8e2d0', hearts: 5, desc: 'Sin trucos. La tienda vende de todo.' },
  { id: 'horno', name: 'HORNO', col: '#ff7a1a', hearts: 5, desc: 'La bola arde siempre. No hay NEVERA. Enemigos con 25% más vida.' },
  { id: 'tormenta', name: 'TORMENTA', col: '#ffe14a', hearts: 3, start: ['bobina'], desc: 'Cada aletazo electriza la bola. Arranca con una BOBINA. 3 ❤.' },
  { id: 'multi', name: 'MULTIBOLA', col: '#b98cff', hearts: 5, desc: 'Cada oleada arranca con 3 bolas. No hay SALVABOLAS.' },
  { id: 'taller', name: 'TALLER', col: '#c9c9d6', hearts: 5, start: ['canon', 'hongo'], desc: 'Arranca con CAÑÓN y HONGO. Solo se venden piezas. La bola pega la mitad.' },
  { id: 'caos', name: 'CAOS', col: '#ff4a8a', hearts: 5, desc: 'Los enemigos nacen con un elemento al azar: todo reacciona con todo.' },
  { id: 'cristal', name: 'CRISTAL', col: '#9ff', hearts: 1, desc: '1 ❤. Monedas ×3.' },
];
export const LAST_WAVE = 15;
