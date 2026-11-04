// ABISMO · datos: armas, pasivas, reliquias, enemigos, oleadas, NG+.
// Occultist pulp: el peregrino es dorado; todo lo demás es tinta negra.

export const ARENA = 1100; // radio del círculo del Abismo (unidades de mundo)
export const BOSS_AT = 180; // segundos hasta que aparece el Guardián
export const BOSS_SECS = 11; // el Guardián se calibra con el DPS del jugador (~25 s reales)
// BOSS_HP/BOSS_ARMOR quedan como respaldo si no hay armas (no debería pasar)
export const BOSS_HP = 4000;
export const BOSS_ARMOR = 1;
export const MAX_LVL = 5;
export const MAX_WEAPONS = 4;

export const WEAPONS = [
  { id: 'pua', name: 'PÚA DEL HEREJE', icon: '☩', color: '#ffd23f',
    desc: 'lanza púas a los enemigos cercanos',
    fire: (s, d, rng) => { // dispara a los n enemigos más cercanos
      for (let i = 0; i < d.count; i++) {
        const t = s.kthNearest(i); if (!t) break;
        const a = Math.atan2(t.y - s.p.y, t.x - s.p.x);
        s.spawnShot('pua', s.p.x, s.p.y, a, 520, d.dmg, d.rate);
      }
    },
    base: { rate: 0.7, dmg: 18, count: 1 },
    lv: [ { rate: 0.6, dmg: 26, count: 2 }, { rate: 0.5, dmg: 34, count: 2 },
          { rate: 0.45, dmg: 46, count: 3 }, { rate: 0.35, dmg: 62, count: 4 } ],
  },
  { id: 'litania', name: 'LITANIA DE FUEGO', icon: '✡️', color: '#ff7a3d',
    desc: 'anillos de fuego que salen del círculo',
    fire: (s, d, rng) => {
      for (let i = 0; i < d.count; i++) {
        const a = rng() * Math.PI * 2;
        s.spawnShot('fuego', s.p.x, s.p.y, a, 300, d.dmg, d.rate, { aoe: 70 });
      }
    },
    base: { rate: 1.1, dmg: 18, count: 4 },
    lv: [ { rate: 0.95, dmg: 26, count: 5 }, { rate: 0.85, dmg: 34, count: 6 },
          { rate: 0.7, dmg: 44, count: 8 }, { rate: 0.55, dmg: 58, count: 10 } ],
  },
  { id: 'cadenas', name: 'CADENAS DEL ABISMO', icon: '⛓', color: '#e8c07a',
    desc: 'latigazos que atraviesan la horda',
    fire: (s, d, rng) => {
      for (let i = 0; i < d.count; i++) {
        const a = rng() * Math.PI * 2;
        s.spawnShot('cadena', s.p.x, s.p.y, a, 640, d.dmg, d.rate, { pierce: 3 });
      }
    },
    base: { rate: 0.85, dmg: 26, count: 2 },
    lv: [ { rate: 0.72, dmg: 34, count: 3 }, { rate: 0.6, dmg: 44, count: 3 },
          { rate: 0.52, dmg: 56, count: 4 }, { rate: 0.42, dmg: 74, count: 5 } ],
  },
  { id: 'runas', name: 'LECTURA DE RUNAS', icon: 'ᚱ', color: '#c08bff',
    desc: 'runas que estallan sobre los enemigos',
    fire: (s, d, rng) => {
      for (let i = 0; i < d.count; i++) {
        const t = s.kthNearest(i); if (!t) break;
        s.hits.push({ x: t.x, y: t.y, r: d.aoe || 90, dmg: d.dmg, foe: t, life: 0.25, kind: 'runa' });
      }
    },
    base: { rate: 1.1, dmg: 26, count: 3, aoe: 90 },
    lv: [ { rate: 0.95, dmg: 36, count: 4, aoe: 105 }, { rate: 0.8, dmg: 46, count: 4, aoe: 120 },
          { rate: 0.68, dmg: 60, count: 5, aoe: 135 }, { rate: 0.55, dmg: 78, count: 6, aoe: 155 } ],
  },
  { id: 'campana', name: 'CAMPANA ESPECTRAL', icon: '♱', color: '#9fd8ff',
    desc: 'onda sónica que empuja a todos',
    fire: (s, d, rng) => { s.waves.push({ x: s.p.x, y: s.p.y, r: 30, max: d.ring || 260, dmg: d.dmg, life: 0.5, kind: 'campana' }); },
    base: { rate: 1.6, dmg: 26, ring: 240 },
    lv: [ { rate: 1.35, dmg: 38, ring: 280 }, { rate: 1.15, dmg: 50, ring: 320 },
          { rate: 0.95, dmg: 66, ring: 370 }, { rate: 0.75, dmg: 88, ring: 430 } ],
  },
  { id: 'leviatan', name: 'LEVIATÁN EN MINIATURA', icon: '☿', color: '#7dff6a',
    desc: 'un diablillo que muerde a los cercanos',
    fire: (s, d, rng) => {
      if (!s.minion || s.minion.life <= 0) { s.minion = { x: s.p.x, y: s.p.y, life: 2.2, t: 0, dmg: d.dmg, count: d.count }; }
    },
    base: { rate: 0.8, dmg: 26, count: 1 },
    lv: [ { rate: 0.7, dmg: 36, count: 2 }, { rate: 0.6, dmg: 48, count: 2 },
          { rate: 0.52, dmg: 62, count: 3 }, { rate: 0.42, dmg: 82, count: 4 } ],
  },
];

// Turretas de fuego del círculo (fijas, no están en WEAPONS)
export const PASSIVES = [
  { id: 'sarten', name: 'SARTÉN DE BRASA', icon: '☀', color: '#ffd23f', desc: '+15 % daño de todas las armas',
    apply: (s) => { s.dmgMul += 0.15; }, stack: 8 },
  { id: 'botas', name: 'BOTAS DE PLOMO', icon: '◐', color: '#e8c07a', desc: '+8 % velocidad y +10 % rayo',
    apply: (s) => { s.speedMul += 0.08; }, stack: 8 },
  { id: 'imanes', name: 'IMÁN DE ALMAS', icon: '⊚', color: '#9fd8ff', desc: '+25 % radio de almas',
    apply: (s) => { s.magnet *= 1.25; }, stack: 6 },
  { id: 'corazon', name: 'CORAZÓN QUE NO LATE', icon: '♡', color: '#ff5fa2', desc: '+20 HP máximo',
    apply: (s) => { s.maxhp *= 1.2; s.hp *= 1.2; }, stack: 8 },
  { id: 'guantes', name: 'GUANTES DEL RELOJERO', icon: '◎', color: '#c08bff', desc: '+10 % velocidad de disparo',
    apply: (s) => { s.rateMul += 0.10; }, stack: 8 },
  { id: 'crit', name: 'OJO DEL VIGILANTE', icon: '◉', color: '#ff2f5b', desc: '+6 % probabilidad de crítico',
    apply: (s) => { s.crit += 6; }, stack: 8 },
  { id: 'armadura', name: 'ARMADURA DE CARTÓN', icon: '⛨', color: '#b98a47', desc: '−2 daño recibido',
    apply: (s) => { s.armor += 2; }, stack: 6 },
  { id: 'regena', name: 'FUEGO LENTO', icon: '♨', color: '#ff7a3d', desc: '+0,4 HP/s',
    apply: (s) => { s.regen += 0.4; }, stack: 6 },
];

// Armas que se desbloquean subiendo (las primeras 2 van desde el inicio)
export const WEAPON_POOL = WEAPONS.map(w => w.id);

// Enemigos: tinta negra, dorado solo para el que brilla (el que da almas)
export const FOES = [
  { id: 'sombra', name: 'Sombra', hp: 22, speed: 70, dmg: 8, xp: 1, r: 13, kind: 'walk' },
  { id: 'rapaz', name: 'Rapaz', hp: 12, speed: 120, dmg: 6, xp: 1, r: 11, kind: 'walk' },
  { id: 'bruto', name: 'Bruto de Tinta', hp: 90, speed: 48, dmg: 16, xp: 3, r: 20, kind: 'walk' },
  { id: 'cuspidista', name: 'Cuspidista', hp: 18, speed: 80, dmg: 10, xp: 2, r: 12, kind: 'shoot' },
  { id: 'muro', name: 'Muro Andante', hp: 260, speed: 34, dmg: 20, xp: 6, r: 27, kind: 'walk' },
  { id: 'espiritu', name: 'Espíritu', hp: 40, speed: 95, dmg: 12, xp: 3, r: 14, kind: 'dash' },
];

const W = (id) => WEAPONS.find((w) => w.id === id);

// Runas de ubicación del jefe (zonas que queman si te quedás)
export const runesCycle = (t) => { // posición de las 3 runas según el tiempo
  const a = t * 0.4;
  return [0, 2.094, 4.188].map((o) => ({ x: Math.cos(a + o) * 320, y: Math.sin(a + o) * 320 }));
};

// ── Reliquias permanentes (el roguelite exterior) ──────────────────────────
// Se elige 1 al morir (o al vencer). Cada Descenso nuevo las empila.
export const RELICS = [
  { id: 'brillo', name: 'BRILLO EN EL PECHO', icon: '✦', color: '#ffd23f', desc: '+10 % daño siempre',
    apply: (s) => { s.dmgMul *= 1.10; }, req: null },
  { id: 'paso', name: 'PASO DE PLOMO', icon: '◐', color: '#e8c07a', desc: '+5 % velocidad siempre',
    apply: (s) => { s.speedMul *= 1.05; }, req: null },
  { id: 'sangre', name: 'SANGRE DE SEGUNDA MANO', icon: '♥', color: '#ff5fa2', desc: '+25 HP máximo siempre',
    apply: (s) => { s.maxhp += 25; s.hp += 25; }, req: null },
  { id: 'cocina', name: 'COCINA DE FUEGO', icon: '♨', color: '#ff7a3d', desc: '+0,2 HP/s siempre',
    apply: (s) => { s.regen += 0.2; }, req: null },
  { id: 'tinta', name: 'TINTA PRESTADA', icon: '☾', color: '#c08bff', desc: '+5 % velocidad de disparo',
    apply: (s) => { s.rateMul *= 1.05; }, req: null },
  { id: 'diente', name: 'DIENTE A FILADO', icon: '⚔', color: '#ff2f5b', desc: '+4 % crítico siempre',
    apply: (s) => { s.crit += 4; }, req: null },
  { id: 'cadena', name: 'CADENA DE CINTA', icon: '⛹', color: '#9fd8ff', desc: '+12 % radio de almas',
    apply: (s) => { s.magnet *= 1.12; }, req: null },
  { id: 'pluma', name: 'PLUMA DEL ESCRIBANO', icon: '✒', color: '#f3ecff', desc: '+3 % XP siempre',
    apply: (s) => { s.xpMul *= 1.03; }, req: null },
  // ── NG+ (desbloqueadas tras vencer al Guardián una vez) ──
  { id: 'campana', name: 'CAMPANA DEL DESPERTAR', icon: '♱', color: '#ffd23f', desc: 'al aparecer, una Campana espectral gratis',
    apply: (s) => { s.bellAtStart = true; }, req: 'ngp1' },
  { id: 'oro', name: 'ORO DE ABAJO', icon: '✧', color: '#ff9d2e', desc: '+10 % almas y +10 % daño',
    apply: (s) => { s.xpMul *= 1.10; s.dmgMul *= 1.10; }, req: 'ngp1' },
  { id: 'muro', name: 'MURO DE CARNE', icon: '⛨', color: '#b98a47', desc: '−3 daño recibido siempre',
    apply: (s) => { s.armor += 3; }, req: 'ngp1' },
  { id: 'sol', name: 'SOL DE MEDIANOCHE', icon: '☀', color: '#ff7a3d', desc: '+8 % daño y +8 % velocidad',
    apply: (s) => { s.dmgMul *= 1.08; s.speedMul *= 1.08; }, req: 'ngp1' },
  // ── NG++ (dos Descensos completados) ──
  { id: 'ojo', name: 'OJO DEL FOLLETÍN', icon: '◉', color: '#ff2f5b', desc: '+10 % crítico y +10 % daño',
    apply: (s) => { s.crit += 10; s.dmgMul *= 1.10; }, req: 'ngp2' },
  { id: 'rey', name: 'REINA DE LOS RATONES', icon: '♛', color: '#c08bff', desc: 'venís con toda la manada de arriba: +20 % speed, +20 HP',
    apply: (s) => { s.speedMul *= 1.2; s.maxhp += 20; s.hp += 20; }, req: 'ngp2' },
  { id: 'ultimo', name: 'LA ÚLTIMA PÁGINA', icon: '☽', color: '#9fd8ff', desc: 'sobreviví al Guardián: entrás con el arma al máximo de nivel',
    apply: (s) => { s.startMax = true; }, req: 'ngp2' },
];

export const REQ_NAME = { ngp1: 'NG+ (vencer 1 vez)', ngp2: 'NG++ (vencer 2 veces)' };
export const reqLabel = (r) => (r.req ? REQ_NAME[r.req] : 'Desde el inicio');

export const TIER_NAME = { ngp1: 'NG+', ngp2: 'NG++', none: '' };
