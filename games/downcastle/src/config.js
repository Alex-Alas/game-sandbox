/* Ajustes globales de DOWNCASTLE. Todo lo "tuneable" vive aquí.
   Unidades: píxeles del arte (un tile = 16 px) y segundos. y crece hacia abajo. */
export const CFG = {
  // Pozo
  TILE: 16,
  COLS: 12,                // ancho del pozo en tiles (paredes en 0 y 11)
  BLOCK: 12,               // bloques de 12×12
  VIEW_W: 192,             // ancho del canvas de baja resolución
  MIN_VIEW_H: 360,         // alto mínimo visible (en PC limita el escalado)

  // Tiempos
  SIM_HZ: 60,
  STATE_HZ: 20,            // anfitrión → invitados
  INPUT_HZ: 30,            // invitado → anfitrión
  INTERP_DELAY: 0.1,       // los demás se dibujan 100 ms en el pasado
  EXTRAP_MAX: 0.15,        // tope de extrapolación del propio personaje

  // Jugador
  PW: 10, PH: 14,          // caja de colisión
  GRAVITY: 900,
  MAX_FALL: 300,
  MOVE_SPEED: 95,
  ACCEL_GROUND: 900,
  ACCEL_AIR: 650,
  FRICTION: 700,           // frenado en el suelo sin inclinar (la cuerda lo vence si tira fuerte)
  JUMP_V: 285,
  COYOTE: 0.08,
  HEARTS: 3,
  INVULN: 1.5,
  STUN: 0.6,
  KO_SWING: 180,           // fuerza lateral del peso muerto al inclinar

  // Botas-cañón
  AMMO: 6,
  SHOT_SPEED: 420,
  SHOT_RANGE: 150,
  SHOT_KICK: 70,           // cada disparo deja la caída en este ascenso leve
  BURST_EVERY: 0.11,       // ráfaga al mantener en el aire

  // Picada y pisotón
  DIVE_V: 430,
  DIVE_MAX: 480,
  STOMP_V: 250,
  DIVE_STOMP_V: 330,

  // Cuerda (spec §4)
  ROPE_LEN: 48,            // largo en reposo de cada eslabón
  ROPE_MAX: 2,             // elástica hasta 2× el largo; desde ahí, rígida
  ROPE_K: 110,             // rigidez del elástico (aceleración por px de estiramiento)
  ROPE_DAMP: 1.5,          // amortiguación baja: el bungee devuelve casi toda la energía
  ROPE_SEGS: 10,           // segmentos por eslabón (estirados miden < 1 tile: no atraviesan pisos)
  ROPE_GRAV: 500,
  TUG_V: 260,              // impulso del tirón
  TUG_CD: 0.8,

  // Criaturas
  GOBLIN_SPEED: 30,
  IMP_SPEED: 40,
  IMP_SIGHT: 110,
  CUBE_SPEED: 18,
  TRAP_TIME: 3,
  FAIRY_ANGRY: 5,
  FAIRY_SPEED: 70,

  // Entrada
  HOLD_MS: 180,
  TAP_PX: 12,
  SWIPE_PX: 30,
  SWIPE_MS: 350,
  TILT_MAX_DEG: 22,
  TILT_DEAD_DEG: 2,
  DRAG_PX: 60,             // modo arrastre: px de desplazamiento = inclinación completa
};

// Colores de los jugadores (distintos de los alineamientos)
export const PLAYER_COLORS = [
  { id: 'amarillo', hex: '#ffd23f' },
  { id: 'lima', hex: '#a6f23a' },
  { id: 'rosa', hex: '#ff6fc8' },
  { id: 'blanco', hex: '#f4f4f4' },
];

// Señales de alineamiento
export const ALIGN = {
  evil: '#ff2a3a',
  neutral: '#b46cff',
  good: '#3ef0d8',
};

export const HEROES = [
  { id: 'knight', name: 'Caballero' },
  { id: 'wizzard', name: 'Mago' },
  { id: 'elf', name: 'Elfo' },
  { id: 'dwarf', name: 'Enano' },
  { id: 'lizard', name: 'Lagarto' },
];

// En Node (pruebas de la simulación) no hay import.meta.env ni location
const ENV = import.meta.env || { BASE_URL: '/', DEV: false };
export const ASSET_BASE = ENV.BASE_URL + 'downcastle/';

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

/* Servidor de salas. En desarrollo, el plugin de Vite atiende /downcastle-ws en el mismo
   servidor. En producción hay que poner aquí la URL del Worker tras `npx wrangler deploy`
   (o pasarla con ?ws=wss://…). */
const WS_PROD = 'wss://downcastle.libre-flow.workers.dev/ws';
function wsUrl() {
  const fromUrl = params.get('ws');
  if (fromUrl) return fromUrl;
  if (ENV.DEV) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}${ENV.BASE_URL}downcastle-ws`;
  }
  return WS_PROD;
}
CFG.WS_URL = wsUrl();

/* Ajustes del jugador (pantalla de Ajustes), guardados en localStorage. */
const SKEY = 'downcastle.settings';
export const SETTINGS = { control: 'tilt', music: true, sfx: true, vibration: true, voice: true, micComp: false };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem(SKEY)) || {}); } catch { /* sin storage */ }
export function saveSettings() {
  try { localStorage.setItem(SKEY, JSON.stringify(SETTINGS)); } catch { /* sin storage */ }
}

export function load(key, def) {
  try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch { return def; }
}
export function store(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin storage */ }
}

export { params };
