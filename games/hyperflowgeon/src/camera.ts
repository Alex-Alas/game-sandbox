// Cámara 2D (solo vista: no toca la simulación). Mismo formato que RANGES: [valor, mín, máx, paso, etiqueta];
// las filas [v, 0, 1, 1] son casillas. El panel de ajustes las muestra en su sección CÁMARA.
export const CAM_RANGES = {
  CAM_VIEW: [18, 8, 40, 0.5, 'vista m (alto)'],
  CAM_DYN: [1, 0, 1, 1, 'cámara dinámica'],
  CAM_ZOOM: [0.5, 0, 2, 0.05, 'alejar a 30 m/s ×'],
  CAM_LEAD: [0.35, 0, 1.5, 0.05, 'adelanto s'],
  CAM_LEAD_MAX: [0.6, 0, 1, 0.05, 'adelanto máx. × media vista'],
  CAM_SMOOTH: [0.35, 0.02, 2, 0.01, 'suavizado s'],
} satisfies Record<string, [number, number, number, number, string]>;

export type CamCfg = { [K in keyof typeof CAM_RANGES]: number };
export const CAM_DEFAULTS = Object.fromEntries(Object.entries(CAM_RANGES).map(([k, v]) => [k, v[0]])) as CamCfg;

// La vista muestra al menos CAM_VIEW m de alto o 5/3 de eso de ancho (lo que entre); el héroe va un sexto de la
// vista por debajo del centro. Dinámica: con la velocidad suavizada (constante CAM_SMOOTH) se aleja (+CAM_ZOOM de
// vista a 30 m/s, lineal, tope a 60 m/s) y se adelanta CAM_LEAD s de recorrido, sin pasar CAM_LEAD_MAX de media vista.
export type Cam = { vx: number, vy: number, cx: number, cy: number, k: number };
export const newCam = (): Cam => ({ vx: 0, vy: 0, cx: 0, cy: 0, k: 1 });

export function follow(cam: Cam, x: number, y: number, vx: number, vy: number, dt: number, W: number, H: number, c: CamCfg) {
  const dyn = c.CAM_DYN > 0.5, f = 1 - Math.exp(-dt / c.CAM_SMOOTH);
  cam.vx += ((dyn ? vx : 0) - cam.vx) * f;
  cam.vy += ((dyn ? vy : 0) - cam.vy) * f;
  const v = Math.sqrt(cam.vx * cam.vx + cam.vy * cam.vy);
  const view = c.CAM_VIEW * (1 + c.CAM_ZOOM * Math.min(v, 60) / 30);
  cam.k = Math.min(H / view, W / (view * 5 / 3));
  const hw = W / 2 / cam.k, hh = H / 2 / cam.k, m = c.CAM_LEAD_MAX;
  const clamp = (d: number, lim: number) => Math.max(-lim, Math.min(lim, d));
  cam.cx = x + clamp(cam.vx * c.CAM_LEAD, m * hw);
  cam.cy = y + view / 6 + clamp(cam.vy * c.CAM_LEAD, m * hh);
}
