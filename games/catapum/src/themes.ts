// Colores de cada tema de mapa (solo dibujo)
export type Theme = {
  sky: [string, string], sea: string, seaTop: string, far: string, near: string,
  dirt: string[], top: string, rock: string[], wood: string[], line: string, sun: string, cloud: string,
  cave?: boolean, // sin sol ni nubes (el fondo es una caverna)
};
export const THEMES: Record<string, Theme> = {
  isla: { sky: ['#4fb9ff', '#c9f1ff'], sea: '#1673c4', seaTop: '#5fc3ff', far: '#9ad7f0', near: '#7cc4a0',
    dirt: ['#9a6334', '#8f5a2e', '#a56b39', '#86542b'], top: '#5ccf48', rock: ['#7d8794', '#727c89', '#87919e'], wood: ['#b07a42', '#a06c37'],
    line: '#3a2414', sun: '#fff3a8', cloud: '#ffffff' },
  torres: { sky: ['#7ab4ff', '#eaf2ff'], sea: '#245f9e', seaTop: '#62a6e8', far: '#b8c9e8', near: '#94b0d8',
    dirt: ['#9b7653', '#8e6b4a', '#a7805c'], top: '#7dc96a', rock: ['#7b8494', '#6e7787', '#858fa0'], wood: ['#a8743f'],
    line: '#2e2a33', sun: '#ffffff', cloud: '#ffffff' },
  volcan: { sky: ['#2b1420', '#c2482f'], sea: '#ff5a10', seaTop: '#ffc046', far: '#5a2a2a', near: '#3d2224',
    dirt: ['#4d3b38', '#45342f', '#56433e'], top: '#8a5e4c', rock: ['#3a3333', '#332d2d', '#423a3a'], wood: ['#6b4a2e'],
    line: '#140a0a', sun: '#ffb070', cloud: '#7a5a5a' },
  expreso: { sky: ['#ff8a5c', '#ffe0a0'], sea: '#2a6ea8', seaTop: '#7fc0e8', far: '#d08a7a', near: '#a27a6a',
    dirt: ['#8b6a3b', '#7f6036', '#977443'], top: '#7cbf4f', rock: ['#8a8a8a', '#7d7d7d', '#969696'], wood: ['#9c6b35', '#8a5d2c', '#a87640'],
    line: '#2b1d10', sun: '#fff0b0', cloud: '#ffd6c0' },
  nubes: { sky: ['#8ccfff', '#fff3e0'], sea: '#3e8fd6', seaTop: '#8fd0ff', far: '#cfe6ff', near: '#b5d8ff',
    dirt: ['#f6f8ff', '#eef2fd', '#fbfcff'], top: '#ffffff', rock: ['#8c97b8', '#7f8aab'], wood: ['#c8a070'],
    line: '#7d8fbf', sun: '#fffbe0', cloud: '#ffffff' },
  barco: { sky: ['#ff9a6b', '#ffe9b8'], sea: '#1d6fa5', seaTop: '#5cb8d8', far: '#e6a07c', near: '#c98a73',
    dirt: ['#d9b676', '#cdab68', '#e3c286'], top: '#e9d08f', rock: ['#4b3626', '#42301f', '#563f2d'], wood: ['#a9743c', '#9a6732', '#b88049', '#8e5f2e'],
    line: '#2b1a0e', sun: '#fff1b0', cloud: '#fff4e6' },
  cueva: { sky: ['#1a1233', '#3c2a63'], sea: '#1b7f93', seaTop: '#58e0d0', far: '#2b2150', near: '#3a2d6b',
    dirt: ['#6d5f93', '#625586', '#78699f'], top: '#7ce8c8', rock: ['#3b3556', '#342f4e', '#443d63'], wood: ['#8a6a4a'],
    line: '#0e0a1d', sun: '#b79cff', cloud: '#5a4a8f', cave: true },
};
export const themeOf = (k: string) => THEMES[k] ?? THEMES.isla;
