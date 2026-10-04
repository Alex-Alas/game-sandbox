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
  SKEL_CD: 2.2,            // esqueleto arquero: entre disparos
  SKEL_AIM: 0.5,           // tensa el arco (el aviso)
  SKEL_RANGE: 110,
  ARROW_SPEED: 160,
  EYELET_SPEED: 34,
  EYELET_LIFE: 7,          // los ojitos se apagan solos (y al morder)

  // Plataformas que se derrumban
  CRUMBLE_SHAKE: 0.45,
  CRUMBLE_BACK: 4,

  // Ciclos: 4 tramos + jefe. Presupuesto de complejidad por bloque intermedio:
  // B0 + Bc·ciclo + Bk·tramo (el del tramo es eso × la cantidad de bloques).
  MAX_BLOCKS: 14,
  B0: 3, Bc: 0.6, Bk: 0.35,
  NEWS_FRAC: 0.4,          // en el ciclo de presentación, ~40 % de los bloques llevan novedades
  BUNGEE_P: 0.16,
  CHASE_P: (c) => Math.min(0.5, 0.2 + 0.1 * c), // derrumbe en los ciclos «+1» (por tramo k = 1..3)
  CHASE_MAX_COST: 5,       // costo máximo de un bloque con derrumbe
  CHASE_BUDGET: 0.85,

  // Derrumbe (cámara forzada). CHASE_H: alto lógico de la pantalla compartida.
  CHASE_H: 360,
  CHASE_WARN: 3,
  CHASE_V0: 24, CHASE_VC: 4, CHASE_VB: 1.5, // px/s: base + por ciclo + por bloque
  CHASE_FAST: 1.15, CHASE_SLOWF: 0.8,        // factor en bloques baratos / caros
  CHASE_KA: 1.2,           // adelantado: px/s extra por px de exceso
  CHASE_VMAX: 150,
  CHASE_TAU: 0.6,
  CHASE_EASE: 0.85, CHASE_EASE_T: 2, // golpes seguidos: × 0,85 durante 2 s
  CHASE_EDGE: 6,           // alto de los escombros que lastiman

  // El Ojo
  OJO_SPEED: 20,
  OJO_IDLE: 1.4, OJO_WARN: 1, OJO_BEAM: 1.8, OJO_GAZE: 1.4, OJO_OPEN: 2.5,
  OJO_FAST: 0.7,           // bajo el 50 % de vida, el ciclo dura esto
  OJO_PUSH: 300, OJO_BEAM_STUN: 0.6,

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
export const SETTINGS = { control: 'tilt', music: true, sfx: true, vibration: true, voice: true, crunch: false };
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
