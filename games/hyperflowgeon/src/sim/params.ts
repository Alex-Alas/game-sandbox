// Valores tuneables de la simulación: [valor, mín, máx, paso, etiqueta]. Metros, segundos y cuadros de 60 Hz.
// El panel de ajustes (main.ts) se genera de esta tabla; la sim recibe un Cfg plano.
export const RANGES = {
  RUN: [9, 2, 20, 0.1, 'carrera m/s'],
  ACC: [70, 5, 300, 1, 'acelerar m/s²'],
  DEC: [90, 5, 300, 1, 'frenar/girar m/s²'],
  AIR: [35, 0, 300, 1, 'control aire m/s²'],
  JUMP_H: [3.2, 0.5, 8, 0.05, 'altura salto m'],
  JUMP_T: [0.38, 0.15, 1, 0.01, 'subida s'],
  JUMP_CUT: [0.45, 0, 1, 0.01, 'corte al soltar ×'],
  FALL_G: [1.6, 1, 4, 0.05, 'gravedad caída ×'],
  MAX_FALL: [28, 5, 60, 0.5, 'caída máx. m/s'],
  COYOTE: [6, 0, 15, 1, 'coyote cuadros'],
  BUFFER: [7, 0, 15, 1, 'buffer cuadros'],
} satisfies Record<string, [number, number, number, number, string]>;

export type Cfg = { [K in keyof typeof RANGES]: number };

export const DEFAULTS = Object.fromEntries(Object.entries(RANGES).map(([k, v]) => [k, v[0]])) as Cfg;
