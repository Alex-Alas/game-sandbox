// ABISMO · datos: armas, pasivas, reliquias, enemigos, jefe, arena y NG+.
// Identidad: tinta casi negra sobre pergamino dorado, acento bermellón y oro.

export const ARENA = 640; // radio del Abismo (mundo); la cámara sigue al peregrino
export const BOSS_AT = 120; // segundos hasta el Guardián (run de 2 minutos, densa)
export const BOSS_SECS = 16; // la vida del jefe se calibra con el DPS: ~20 s de pelea real
export const BOSS_HP = 5200;
export const BOSS_ARMOR = 1;
export const MAX_LVL = 5;
export const MAX_WEAPONS = 4;

// Dash: el verbo que hace que esto sea un juego y no un protector de pantalla.
export const DASH = {
  speed: 1150, time: 0.155, charges: 2, recharge: 1.05, iframes: 0.22,
  markTime: 4.5, markBonus: 1.65, perfectWindow: 0.18, slowmo: 0.42, slowScale: 0.34,
};

export const WEAPONS = [
  { id: 'pua', name: 'PÚA DEL HEREJE', icon: '✜', color: '#ffc94a',
    desc: 'lanza púas que atraviesan la tinta',
    fire: (s, d) => {
      const target = s.nearest();
      const a = target ? Math.atan2(target.y - s.p.y, target.x - s.p.x) : -Math.PI / 2;
      for (let i = 0; i < d.count; i++) {
        const spread = (i - (d.count - 1) / 2) * 0.12;
        s.shoot('pua', a + spread, 760, d.dmg, { pierce: 2 });
      }
    },
    base: { rate: 0.55, dmg: 24, count: 1 },
    lv: [ { rate: 0.48, dmg: 32, count: 1 }, { rate: 0.42, dmg: 40, count: 2 },
          { rate: 0.36, dmg: 52, count: 2 }, { rate: 0.3, dmg: 68, count: 3 } ],
  },
  { id: 'litania', name: 'LITANIA DE FUEGO', icon: '✦', color: '#ff7a3d',
    desc: 'abanico de brasas que prende la horda',
    fire: (s, d) => {
      const target = s.nearest();
      const a = target ? Math.atan2(target.y - s.p.y, target.x - s.p.x) : -Math.PI / 2;
      for (let i = 0; i < d.count; i++) {
        const spread = (i - (d.count - 1) / 2) * (0.5 / Math.max(2, d.count));
        s.shoot('brasa', a + spread, 420, d.dmg, { aoe: 60, life: 1.1 });
      }
    },
    base: { rate: 1.0, dmg: 16, count: 3 },
    lv: [ { rate: 0.9, dmg: 22, count: 4 }, { rate: 0.8, dmg: 28, count: 5 },
          { rate: 0.68, dmg: 36, count: 6 }, { rate: 0.55, dmg: 46, count: 8 } ],
  },
  { id: 'cadenas', name: 'CADENAS DEL ABISMO', icon: '∞', color: '#e8c07a',
    desc: 'una cadena gira a tu alrededor y corta todo', aura: true,
    base: { rate: 0.34, dmg: 20, radius: 104 },
    lv: [ { rate: 0.3, dmg: 26, radius: 118 }, { rate: 0.26, dmg: 34, radius: 132 },
          { rate: 0.22, dmg: 44, radius: 148 }, { rate: 0.18, dmg: 58, radius: 168 } ],
  },
  { id: 'runas', name: 'LECTURA DE RUNAS', icon: '§', color: '#a06bff',
    desc: 'sellos que estallan bajo los enemigos',
    fire: (s, d) => {
      for (let i = 0; i < d.count; i++) {
        const t = s.kthNearest(i);
        if (!t) break;
        s.fields.push({ x: t.x, y: t.y, r: d.aoe, dmg: d.dmg, t: 0.55, max: 0.55, kind: 'runa', done: false });
      }
    },
    base: { rate: 1.25, dmg: 30, count: 2, aoe: 86 },
    lv: [ { rate: 1.1, dmg: 40, count: 2, aoe: 100 }, { rate: 0.95, dmg: 52, count: 3, aoe: 112 },
          { rate: 0.8, dmg: 66, count: 3, aoe: 126 }, { rate: 0.66, dmg: 84, count: 4, aoe: 144 } ],
  },
  { id: 'campana', name: 'CAMPANA ESPECTRAL', icon: '†', color: '#8fd8ff',
    desc: 'onda que empuja y aturde',
    fire: (s, d) => { s.waves.push({ x: s.p.x, y: s.p.y, r: 34, max: d.ring, dmg: d.dmg, life: 0.62, maxLife: 0.62 }); },
    base: { rate: 1.7, dmg: 26, ring: 300 },
    lv: [ { rate: 1.5, dmg: 34, ring: 340 }, { rate: 1.3, dmg: 44, ring: 380 },
          { rate: 1.1, dmg: 56, ring: 420 }, { rate: 0.9, dmg: 72, ring: 470 } ],
  },
  { id: 'leviatan', name: 'LEVIATÁN EN MINIATURA', icon: '◆', color: '#7dff9b',
    desc: 'un sabueso de tinta caza por vos',
    fire: (s, d) => {
      if (!s.pet || s.pet.life <= 0) s.pet = { x: s.p.x, y: s.p.y, life: 2.4, t: 0, dmg: d.dmg, bites: d.count };
    },
    base: { rate: 0.9, dmg: 34, count: 1 },
    lv: [ { rate: 0.8, dmg: 46, count: 2 }, { rate: 0.7, dmg: 60, count: 2 },
          { rate: 0.6, dmg: 78, count: 3 }, { rate: 0.48, dmg: 100, count: 4 } ],
  },
];

export const PASSIVES = [
  { id: 'sarten', name: 'SARTÉN DE BRASA', icon: '★', color: '#ffc94a', desc: '+18 % daño', apply: (s) => { s.dmgMul += 0.18; }, stack: 8 },
  { id: 'botas', name: 'BOTAS DE PLOMO', icon: '◐', color: '#e8c07a', desc: '+7 % velocidad', apply: (s) => { s.speedMul += 0.07; }, stack: 8 },
  { id: 'imanes', name: 'IMÁN DE ALMAS', icon: '⊚', color: '#8fd8ff', desc: '+30 % radio de almas', apply: (s) => { s.magnet *= 1.3; }, stack: 6 },
  { id: 'corazon', name: 'CORAZÓN QUE NO LATE', icon: '♥', color: '#ff4d5e', desc: '+22 HP máximo', apply: (s) => { s.maxhp += 22; s.hp += 22; }, stack: 8 },
  { id: 'guantes', name: 'GUANTES DEL RELOJERO', icon: '◎', color: '#a06bff', desc: '+12 % cadencia', apply: (s) => { s.rateMul += 0.12; }, stack: 8 },
  { id: 'crit', name: 'OJO DEL VIGILANTE', icon: '◉', color: '#ff4d5e', desc: '+7 % crítico', apply: (s) => { s.crit += 7; }, stack: 8 },
  { id: 'armadura', name: 'ARMADURA DE CARTÓN', icon: '▣', color: '#c98a4a', desc: '−2 daño recibido', apply: (s) => { s.armor += 2; }, stack: 6 },
  { id: 'regena', name: 'FUEGO LENTO', icon: '✚', color: '#ff7a3d', desc: '+0.5 HP/s', apply: (s) => { s.regen += 0.5; }, stack: 6 },
  { id: 'dash', name: 'PASO DEL UMBRAL', icon: '»', color: '#ffc94a', desc: '+1 carga de dash y recarga más rápida', apply: (s) => { s.dashMax += 1; s.dashRecharge *= 0.82; }, stack: 3 },
];

// Enemigos: cada uno pide una respuesta distinta.
export const FOES = [
  { id: 'sombra', name: 'Sombra', hp: 34, speed: 96, dmg: 9, xp: 1, r: 22, kind: 'walk' },
  { id: 'rapaz', name: 'Rapaz', hp: 22, speed: 168, dmg: 11, xp: 1, r: 18, kind: 'lunge' },
  { id: 'cuspidista', name: 'Cuspidista', hp: 40, speed: 88, dmg: 12, xp: 2, r: 20, kind: 'shoot' },
  { id: 'espiral', name: 'Espiral', hp: 30, speed: 138, dmg: 9, xp: 2, r: 20, kind: 'bomb' },
  { id: 'bruto', name: 'Bruto de Tinta', hp: 190, speed: 76, dmg: 20, xp: 4, r: 36, kind: 'armored' },
  { id: 'verdugo', name: 'Verdugo', hp: 240, speed: 84, dmg: 22, xp: 6, r: 40, kind: 'shield' },
];

export const FOE_UNLOCK = { rapaz: 12, cuspidista: 34, espiral: 62, bruto: 78, verdugo: 112 };

// Arena: pilares que cortan el rayo del Guardián y sirven de cobertura.
export const PILLARS = [
  { x: 0, y: -300, r: 54 }, { x: 300, y: 60, r: 50 },
  { x: -290, y: 120, r: 52 }, { x: 40, y: 320, r: 48 },
];

export const BOSS = {
  r: 78,
  phase2: 0.66,
  phase3: 0.33,
  exposed: 1.9, // ventana de núcleo expuesto (doble daño)
  gaze: { warn: 0.95, hit: 1.15, width: 62, dmg: 26 },
  sweep: { warn: 0.75, hit: 0.4, dmg: 22, radius: 220, arc: 1.5 },
  nova: { warn: 0.9, count: 14, speed: 250, dmg: 14 },
  shrink: 6, // s entre cierres del círculo en fase 3
};

// Reliquias permanentes (el roguelite exterior).
export const RELICS = [
  { id: 'brillo', name: 'BRILLO EN EL PECHO', icon: '✦', color: '#ffc94a', desc: '+12 % daño siempre', apply: (s) => { s.dmgMul += 0.12; }, req: null },
  { id: 'paso', name: 'PASO DE PLOMO', icon: '◐', color: '#e8c07a', desc: '+6 % velocidad siempre', apply: (s) => { s.speedMul += 0.06; }, req: null },
  { id: 'sangre', name: 'SANGRE DE SEGUNDA MANO', icon: '♥', color: '#ff4d5e', desc: '+30 HP máximo', apply: (s) => { s.maxhp += 30; s.hp += 30; }, req: null },
  { id: 'cocina', name: 'COCINA DE FUEGO', icon: '✚', color: '#ff7a3d', desc: '+0.3 HP/s', apply: (s) => { s.regen += 0.3; }, req: null },
  { id: 'tinta', name: 'TINTA PRESTADA', icon: '◕', color: '#a06bff', desc: '+8 % cadencia', apply: (s) => { s.rateMul += 0.08; }, req: null },
  { id: 'diente', name: 'DIENTE AFILADO', icon: '✜', color: '#ff4d5e', desc: '+5 % crítico', apply: (s) => { s.crit += 5; }, req: null },
  { id: 'cadena', name: 'CADENA DE CINTA', icon: '∞', color: '#8fd8ff', desc: '+15 % radio de almas', apply: (s) => { s.magnet *= 1.15; }, req: null },
  { id: 'umbral', name: 'PASO DEL UMBRAL', icon: '»', color: '#ffc94a', desc: '+1 carga de dash', apply: (s) => { s.dashMax += 1; }, req: null },
  { id: 'pluma', name: 'PLUMA DEL ESCRIBANO', icon: '✎', color: '#f3e7cf', desc: '+5 % XP', apply: (s) => { s.xpMul += 0.05; }, req: null },
  // NG+
  { id: 'campana', name: 'CAMPANA DEL DESPERTAR', icon: '†', color: '#ffc94a', desc: 'entrás con la Campana espectral', apply: (s) => { s.bellAtStart = true; }, req: 'ngp1' },
  { id: 'oro', name: 'ORO DE ABAJO', icon: '✧', color: '#ff9d2e', desc: '+12 % almas y +10 % daño', apply: (s) => { s.xpMul += 0.12; s.dmgMul += 0.10; }, req: 'ngp1' },
  { id: 'muro', name: 'MURO DE CARNE', icon: '▣', color: '#c98a4a', desc: '−3 daño recibido', apply: (s) => { s.armor += 3; }, req: 'ngp1' },
  { id: 'sol', name: 'SOL DE MEDIANOCHE', icon: '★', color: '#ff7a3d', desc: '+8 % daño y velocidad', apply: (s) => { s.dmgMul += 0.08; s.speedMul += 0.08; }, req: 'ngp1' },
  // NG++
  { id: 'ojo', name: 'OJO DEL FOLLETÍN', icon: '◉', color: '#ff4d5e', desc: '+12 % crítico y +10 % daño', apply: (s) => { s.crit += 12; s.dmgMul += 0.10; }, req: 'ngp2' },
  { id: 'rey', name: 'REINA DE LOS RATONES', icon: '♕', color: '#a06bff', desc: '+20 % velocidad y +20 HP', apply: (s) => { s.speedMul += 0.2; s.maxhp += 20; s.hp += 20; }, req: 'ngp2' },
  { id: 'ultimo', name: 'LA ÚLTIMA PÁGINA', icon: '◕', color: '#8fd8ff', desc: 'el arma inicial entra al máximo', apply: (s) => { s.startMax = true; }, req: 'ngp2' },
];

export const REQ_NAME = { ngp1: 'NG+ (vencer 1 vez)', ngp2: 'NG++ (vencer 2 veces)' };

// Las reliquias que se ofrecen nunca repiten las que ya tenés: siempre mejoran.
export const relicPoolFor = (owned) => RELICS.filter((r) => !owned.includes(r.id));
