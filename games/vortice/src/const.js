// VÓRTICE — constantes compartidas. Radios en unidades de mundo «de esquina»: el
// hexágono de radio r tiene sus vértices a distancia r del centro (ver render.js → hexR).
export const SIDES = 6;
export const TAU = Math.PI * 2;
export const SEG = TAU / SIDES;
export const P = 84;        // órbita del jugador
export const PSIZE = 10;    // alto del triángulo (punta a P + PSIZE)
export const CENTER = 60;   // hexágono central
export const SPAWN = 1050;  // los patrones nacen más allá de este radio
export const THIN = 30;     // grosor de un anillo fino
export const DT = 1 / 120;  // paso fijo
export const ROCE_ANG = 0.12; // rad: a cuánto del borde del muro cuenta como roce
export const COMBO_T = 3;   // s sin roce ni fragmento y el combo se pierde

export const STAGES = [
  { t: 0, name: 'PUNTO', hue: 190 },
  { t: 10, name: 'LÍNEA', hue: 140 },
  { t: 20, name: 'TRIÁNGULO', hue: 50 },
  { t: 30, name: 'CUADRADO', hue: 15 },
  { t: 45, name: 'PENTÁGONO', hue: 320 },
  { t: 60, name: 'HEXÁGONO', hue: 270 },
  { t: 90, name: 'VÓRTICE', hue: 0 },
  { t: 120, name: 'SINGULARIDAD', hue: 200 },
  { t: 180, name: 'INFINITO', hue: 0 },
];

export const MODES = {
  normal: { name: 'NORMAL', off: 0, scoreMul: 1 },
  hiper: { name: 'HIPER', off: 45, scoreMul: 1.6 },
  diario: { name: 'DIARIO', off: 8, scoreMul: 1.2 },
};

export function stageAt(t) {
  let i = 0;
  while (i + 1 < STAGES.length && t >= STAGES[i + 1].t) i++;
  return i;
}
