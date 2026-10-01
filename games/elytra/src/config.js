/* Ajustes globales de ELYTRA. Todo lo "tuneable" vive aquí. */
export const CFG = {
  // Mundo
  WORLD_SIZE: 4000,        // lado del mapa (m)
  GRID: 384,               // subdivisiones del heightfield
  WATER: 0,

  // Vuelo
  GRAVITY: 26,
  DRAG: 0.00040,           // arrastre cuadrático base
  TURN_RATE: 2.5,          // rad/s de redirección de la velocidad hacia el morro
  MIN_AIRSPEED: 26,        // por debajo, se pierde autoridad
  STALL_SPEED: 16,
  TUCK_DRAG: 0.40,         // W
  FLARE_DRAG: 2.6,         // S
  FLARE_TURN: 1.45,        // S gira más cerrado
  TURN_BLEED: 0.055,       // energía que se pierde al girar fuerte
  MOUSE_SENS: 0.0022,

  // Habilidades
  BOOST_COST: 34,
  BOOST_REGEN: 22,
  BOOST_IMPULSE: 70,
  FLAP_COST: 12,
  FLAP_IMPULSE: 15,
  FLAP_COOLDOWN: 0.32,
  ROLL_COST: 10,
  ROLL_IMPULSE: 30,
  ROLL_TIME: 0.42,
  CRYSTAL_ENERGY: 45,
  CRYSTAL_IMPULSE: 40,

  // Colisión del jugador
  PLAYER_RADIUS: 0.8,
  CRASH_SPEED: 20,          // velocidad normal al impacto que provoca ragdoll
  SCRAPE_LOSS: 0.18,        // pérdida de velocidad al rozar

  // Ragdoll
  RAGDOLL_GRAVITY: 24,
  RAGDOLL_DENSITY: 420,
  SLOWMO_SCALE: 0.22,
  SLOWMO_TIME: 0.55,        // segundos reales

  // Corriente ascendente
  THERMAL_LIFT: 48,

  // Render
  MAX_PIXEL_RATIO: 1.5,
  SHADOW_SIZE: 2048,
};

export const HALF = CFG.WORLD_SIZE / 2;
export const ASSET_BASE = '/elytra/';
