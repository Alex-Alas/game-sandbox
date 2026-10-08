// Valores tuneables de la simulación: [valor, mín, máx, paso, etiqueta]. Metros, segundos y cuadros de 60 Hz.
// Sin calibrar con el usuario (2026-10-08): son el punto de partida. El menú AJUSTES → AVANZADO se genera de acá
// y en una partida online manda la tabla del anfitrión (viaja en el mensaje start).
// Aprendido en HYPERFLOWGEON: la entrada en el aire nunca le quita velocidad a favor (el impulso se conserva),
// coyote y buffer por cuadros, salto con corte al soltar, y la liga como una sola fuerza central que solo tira.
// Diferencia buscada: acá todo es más rápido y corto (un brawler), y el dash, la barrida y la picada pegan.
export const RANGES = {
  // Carrera y salto
  RUN: [10, 3, 20, 0.1, 'carrera m/s'],
  ACC: [80, 10, 300, 1, 'acelerar m/s²'],
  DEC: [70, 10, 300, 1, 'frenar/girar m/s²'],
  AIR: [42, 0, 200, 1, 'control en el aire m/s²'],
  JUMP_H: [2.7, 0.5, 6, 0.05, 'altura del salto m'],
  JUMP_T: [0.30, 0.15, 0.8, 0.01, 'subida s'],
  JUMP_CUT: [0.45, 0, 1, 0.01, 'corte al soltar ×'],
  FALL_G: [1.55, 1, 4, 0.05, 'gravedad al caer ×'],
  MAX_FALL: [22, 5, 60, 0.5, 'caída máx. m/s'],
  FAST_FALL: [30, 5, 60, 0.5, 'caída rápida (↓) m/s'],
  COYOTE: [6, 0, 15, 1, 'coyote cuadros'],
  BUFFER: [7, 0, 15, 1, 'buffer cuadros'],
  AIR_JUMPS: [1, 0, 3, 1, 'saltos en el aire'],
  JUMP2_H: [2.2, 0.5, 6, 0.05, 'altura del doble salto m'],
  STEP: [0.5, 0, 1, 0.25, 'escalón que se sube solo m'],
  // Pared
  WALL_SLIDE: [4.5, 0, 20, 0.5, 'deslizar por la pared m/s'],
  WJ_VX: [9, 0, 25, 0.5, 'salto de pared: empuje m/s'],
  WJ_H: [2.3, 0.5, 6, 0.05, 'salto de pared: altura m'],
  WJ_LOCK: [7, 0, 20, 1, 'salto de pared: sin volver cuadros'],
  WALL_COYOTE: [6, 0, 15, 1, 'coyote de la pared cuadros'],
  // Dash
  DASH_V: [22, 5, 50, 0.5, 'dash m/s'],
  DASH_F: [8, 2, 30, 1, 'dash cuadros'],
  DASH_END: [10, 0, 30, 0.5, 'dash: queda a m/s'],
  DASH_CD: [0.45, 0, 3, 0.05, 'dash: recarga s'],
  DASH_IF: [6, 0, 20, 1, 'dash: invulnerable cuadros'],
  SUPER_VX: [16, 5, 40, 0.5, 'dash + salto (super) m/s'],
  HYPER_VX: [23, 5, 40, 0.5, 'dash ↘ + salto (hyper) m/s'],
  HYPER_JUMP: [0.65, 0.1, 1, 0.05, 'hyper: altura ×'],
  // Barrida y picada
  SLIDE_MIN: [4, 0, 15, 0.5, 'barrida desde m/s'],
  SLIDE_BOOST: [3.5, 0, 15, 0.5, 'barrida: impulso m/s'],
  SLIDE_MAX: [14, 5, 40, 0.5, 'barrida: tope del impulso m/s'],
  SLIDE_FRIC: [14, 0, 60, 0.5, 'barrida: roce m/s²'],
  POUND_V: [30, 10, 60, 0.5, 'picada m/s'],
  POUND_BOUNCE: [1.6, 0.5, 4, 0.05, 'rebote de la picada × salto'],
  // Liga
  HOOK_LEN: [9, 3, 30, 0.5, 'alcance m'],
  HOOK_TRAVEL: [0.08, 0, 0.5, 0.01, 'viaje del ancla s'],
  HOOK_K: [32, 1, 150, 0.5, 'rigidez 1/s²'],
  HOOK_REST: [0.25, 0, 1, 0.01, 'reposo × distancia'],
  HOOK_V: [26, 5, 80, 0.5, 'tirón máx. m/s'],
  HOOK_DAMP: [2, 0, 20, 0.1, 'amortiguación 1/s'],
  HOOK_JUMP: [9, 0, 30, 0.5, 'SALTO enganchado: impulso m/s'],
  HOOK_N: [2, 1, 6, 1, 'cargas'],
  HOOK_CD: [1.8, 0.2, 10, 0.1, 'recarga s/carga'],
  HOOK_CONE: [14, 0, 45, 1, 'cono de gracia °'],
  HOOK_MISS: [10, 0, 60, 1, 'pausa si falla cuadros'],
  YANK_V: [21, 0, 50, 0.5, 'DASH enganchado a un rival: lanzar m/s'],
  // Golpes y empuje (el % sube el empuje; la fragilidad lo multiplica)
  KB: [1, 0.2, 3, 0.05, 'empuje ×'],
  KB_DRAG: [0.9, 0, 5, 0.05, 'freno del lanzado 1/s'],
  STUN_K: [1.4, 0, 3, 0.05, 'aturdido cuadros por m/s'],
  DI: [15, 0, 45, 1, 'influencia del joystick °'],
  TECH: [8, 0, 20, 1, 'tech: ventana cuadros'],
  BOUNCE_V: [13, 0, 60, 0.5, 'rebota contra el suelo desde m/s'],
  BOUNCE_E: [0.55, 0, 1, 0.05, 'rebote ×'],
  SELF_KB: [0.85, 0, 2, 0.05, 'tu explosión te empuja ×'],
  FRAG_K: [1.5, 1, 3, 0.05, 'FRÁGIL: empuje ×'],
  LEAD_K: [0.5, 0.05, 1, 0.05, 'PIES DE PLOMO: empuje ×'],
  DASH_HIT: [4, 0, 40, 0.5, 'dash contra un rival: empuje m/s'],
  SLIDE_HIT: [8, 0, 40, 0.5, 'barrida contra un rival: empuje m/s'],
  POUND_HIT: [11, 0, 40, 0.5, 'picada: onda m/s'],
  // Maná y cartas
  MANA_START: [4, 0, 10, 0.5, 'maná al empezar'],
  MANA_MAX: [10, 3, 20, 1, 'maná máx.'],
  MANA_REGEN: [0.75, 0.1, 5, 0.05, 'maná por s'],
  CAST_CD: [14, 0, 60, 1, 'entre cartas cuadros'],
  // Ulti
  ULTI_DEALT: [0.5, 0, 5, 0.05, 'ulti por % hecho'],
  ULTI_TAKEN: [0.25, 0, 5, 0.05, 'ulti por % recibido'],
  ULTI_KO: [15, 0, 100, 1, 'ulti por KO'],
  ULTI_TRICK: [1, 0, 20, 0.5, 'ulti por truco'],
  ULTI_PASSIVE: [0.3, 0, 5, 0.05, 'ulti por s'],
  // Partida
  RESPAWN: [2, 0.5, 6, 0.1, 'reaparece s'],
  SPAWN_INV: [2, 0, 6, 0.1, 'invulnerable al reaparecer s'],
  KO_CREDIT: [8, 1, 30, 0.5, 'el KO es de quien te tocó hace s'],
} satisfies Record<string, [number, number, number, number, string]>;

export type Cfg = { [K in keyof typeof RANGES]: number };
export const DEFAULTS = Object.fromEntries(Object.entries(RANGES).map(([k, v]) => [k, v[0]])) as Cfg;

// Reglas de la partida (las elige el anfitrión en el menú; no son tuneables finos)
export type Rules = {
  time: number,        // s de partida (0 = sin límite)
  teams: boolean,      // equipos: rojo contra azul
  friendly: boolean,   // fuego amigo en equipos
  crates: number,      // cajas: s entre cajas (0 = ninguna)
  infinite: boolean,   // maná infinito (entrenamiento)
  startDmg: number,    // % con que se empieza y se reaparece
}
export const RULES: Rules = { time: 180, teams: false, friendly: false, crates: 11, infinite: false, startDmg: 0 };
