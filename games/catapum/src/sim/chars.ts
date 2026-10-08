// Personajes: cada uno con su ulti (un movimiento especial definitivo) y pequeñas diferencias de cuerpo.
// mass: cuánto cuesta empujarlo (el empuje se divide por la masa) y cuánto pesa en la liga.
export type Char = {
  id: string, name: string, color: string, dark: string,
  mass: number, run: number, airJumps: number, dashN: number, hookN: number, hookCd: number, hookLen: number,
  ulti: string, ultiName: string, ultiDesc: string, desc: string, deck: string[],
};

export const CHARS: Char[] = [
  { id: 'bombin', name: 'BOMBÍN', color: '#ff7a3d', dark: '#9c3a12', mass: 1, run: 1, airJumps: 1, dashN: 1, hookN: 2, hookCd: 1, hookLen: 1,
    ulti: 'meteoro', ultiName: 'METEORO', ultiDesc: 'Salís disparado al cielo, elegís dónde caer y te estrellás como un meteorito: cráter enorme.',
    desc: 'Una bomba con patas. Equilibrado: bueno para aprender.',
    deck: ['bomba', 'fueguito', 'cohetito', 'supersalto', 'mina', 'bola', 'granbum', 'fruta'] },
  { id: 'lia', name: 'LÍA', color: '#3fd0c9', dark: '#137a74', mass: 0.9, run: 1, airJumps: 1, dashN: 1, hookN: 3, hookCd: 0.6, hookLen: 1.25,
    ulti: 'lazo', ultiName: 'LAZO', ultiDesc: 'Engancha a todos los rivales cercanos, los junta hacia vos y los revolea para afuera.',
    desc: 'La de la liga: tres cargas, recarga rápida y más alcance.',
    deck: ['iman', 'swap', 'boomerang', 'shuriken', 'pegajosa', 'tele', 'laser', 'escudo'] },
  { id: 'turbo', name: 'TURBO', color: '#ffd23f', dark: '#9c7a00', mass: 1, run: 1.1, airJumps: 1, dashN: 2, hookN: 2, hookCd: 1, hookLen: 1,
    ulti: 'cohete', ultiName: 'COHETE', ultiDesc: 'Volás como un cohete que se maneja con la mira, rompiendo el terreno y arrollando a todos.',
    desc: 'Rápido y con dos dashes. Vive en el aire.',
    deck: ['cohetito', 'supersalto', 'katana', 'triple', 'caballo', 'autodestruccion', 'laser', 'fruta'] },
  { id: 'muu', name: 'MUU', color: '#f4f1ea', dark: '#6b5b4b', mass: 1.35, run: 0.9, airJumps: 1, dashN: 1, hookN: 2, hookCd: 1, hookLen: 1,
    ulti: 'abduccion', ultiName: 'ABDUCCIÓN', ultiDesc: 'Te volvés un ovni: volás libre y el rayo tractor levanta rivales. Soltalos sobre el agua.',
    desc: 'Una vaca pesada: cuesta moverla y pega fuerte.',
    deck: ['vaca', 'trompeta', 'caparazon', 'tnt', 'gas', 'plomo', 'bomba', 'meteorito'] },
  { id: 'chuchu', name: 'CHUCHU', color: '#e84a5f', dark: '#7d1626', mass: 1.15, run: 0.95, airJumps: 1, dashN: 1, hookN: 2, hookCd: 1, hookLen: 1,
    ulti: 'expreso', ultiName: 'EXPRESO', ultiDesc: 'Llamás a un tren que cruza el mapa a tu altura con vos al frente: abre un túnel y arrasa.',
    desc: 'Maquinista explosivo: trampas, racimos y cajas.',
    deck: ['tnt', 'racimo', 'palomitas', 'granbum', 'gas', 'bate', 'pegamento', 'bomba'] },
  { id: 'kunai', name: 'KUNAI', color: '#8f6bff', dark: '#3e2394', mass: 0.8, run: 1.08, airJumps: 2, dashN: 1, hookN: 2, hookCd: 1, hookLen: 1,
    ulti: 'sombra', ultiName: 'SOMBRA', ultiDesc: 'Tres teletransportes con corte hacia la mira: atravesás el terreno y a quien se cruce.',
    desc: 'Liviana y con triple salto: vuela lejos si le pegan.',
    deck: ['shuriken', 'katana', 'banana', 'melocoton', 'tele', 'boomerang', 'fueguito', 'swap'] },
];
export const CHAR: Record<string, Char> = Object.fromEntries(CHARS.map(c => [c.id, c]));
export const charOf = (id: string) => CHAR[id] ?? CHARS[0];

// Colores de los jugadores (anillo y nombre) y de los equipos
export const PCOLORS = ['#ff5a5a', '#4aa3ff', '#5ad16a', '#ffc93c', '#c36bff', '#ff8ad8', '#3fe0d0', '#f0f0f0'];
export const TEAMS = [{ name: 'ROJO', color: '#ff5a5a' }, { name: 'AZUL', color: '#4aa3ff' }];
