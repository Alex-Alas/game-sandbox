/* Bestiario (puro, sin DOM): las criaturas y jefes que se registran en el perfil, con su
   nombre y una frase al estilo de un manual de monstruos. kind = el de sim.js. */
export const BEASTS = [
  { kind: 'goblin', name: 'Goblin', lore: 'Cobarde a solas, temerario en manada. Huele a sótano y a gemas ajenas.' },
  { kind: 'imp', name: 'Diablillo', lore: 'Te ve antes de que lo veas, y se lanza en cuanto te ve.' },
  { kind: 'skeleton', name: 'Esqueleto arquero', lore: 'Olvidó a quién custodiaba, pero no cómo tensar el arco.' },
  { kind: 'cube', name: 'Cubo gelatinoso', lore: 'Lento y paciente. Lo que entra en él sale más tarde, y con un corazón menos.' },
  { kind: 'fairy', name: 'Hada', lore: 'Benigna mientras se la respete. Disparale una vez y conocerás su lado vengativo.' },
  { kind: 'bat', name: 'Murciélago', lore: 'Duerme colgado sobre los incautos. Despierta de muy mal humor.' },
  { kind: 'gargoyle', name: 'Gárgola', lore: 'Piedra que respira. Sus ráfagas no buscan herir: buscan que caigas.' },
  { kind: 'eyelet', name: 'Ojillo', lore: 'Retoño de El Ojo. Muerde, parpadea y se apaga.' },
];

export const BOSSES = [
  { kind: 'ojo', name: 'El Ojo', biome: 'Mazmorra', lore: 'Señor de la Mazmorra. Todo lo ve; solo cuando abre el ojo se lo puede herir.' },
];

export const ALL_BEASTS = [...BEASTS, ...BOSSES];
export const beastName = (kind) => ALL_BEASTS.find((b) => b.kind === kind)?.name || kind;
