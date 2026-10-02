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

  // Viento del circuito: fracción del viento que arrastra al piloto (deriva)
  WIND_DRIFT: 1,

  // Render: ver QUALITY más abajo (pixel ratio, sombras, distancias de dibujo)
};

export const HALF = CFG.WORLD_SIZE / 2;

/* Presets de calidad. Se elige con ?q=low|med|high o desde la pantalla de título
   (se recuerda en localStorage). La resolución se adapta sola entre minScale y 1
   para sostener ~60 fps; el MSAA solo cambia al recargar. */
export const PRESETS = {
  low:  { id: 'low',  label: 'BAJA',  pixelRatio: 1,    minScale: 0.5,  msaa: false, shadowSize: 1024, vegDist: 900,  propDist: 1600, detailDist: 220 },
  med:  { id: 'med',  label: 'MEDIA', pixelRatio: 1.25, minScale: 0.6,  msaa: false, shadowSize: 2048, vegDist: 1300, propDist: 2400, detailDist: 380 },
  high: { id: 'high', label: 'ALTA',  pixelRatio: 1.5,  minScale: 0.75, msaa: true,  shadowSize: 2048, vegDist: 2200, propDist: 3600, detailDist: 600 },
};
export const PRESET_ORDER = ['low', 'med', 'high'];
const QKEY = 'elytra.quality';

function pickQuality() {
  const fromUrl = new URLSearchParams(location.search).get('q');
  if (PRESETS[fromUrl]) { saveQuality(fromUrl); return PRESETS[fromUrl]; }
  try { const v = localStorage.getItem(QKEY); if (PRESETS[v]) return PRESETS[v]; } catch { /* sin storage */ }
  return PRESETS.med;
}
export function saveQuality(id) {
  try { localStorage.setItem(QKEY, id); } catch { /* sin storage */ }
}
export const QUALITY = pickQuality();
export const ASSET_BASE = '/elytra/';
