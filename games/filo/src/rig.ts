// Poses, clips y física secundaria (pura).
// Una pose se escribe como la dibujaría un animador: dónde van la cadera, las manos y los pies
// (IK), cuánto se inclina el torso, hacia dónde apunta el arma. Un clip son poses clave con su
// curva de espaciado; se muestrea en cuadros enteros a su propio fps (animación «en dos»), así se
// lee como cuadro a cuadro y no como interpolación de Flash.
import { type V, lerp, smooth, clamp } from './draw/curves.ts';

export type Pose = Record<string, number | V>;
export type Ease = 'l' | 'i' | 'o' | 'io' | 'h' | 'back' | 'snap' | ((t: number) => number);
export interface Key { f: number; p: Pose; e?: Ease }
export interface Ev { f: number; k: string; [x: string]: unknown }
export interface Clip {
  id: string; label: string; fps: number; loop: boolean; frames: number;
  keys: Key[]; ev?: Ev[];
  next?: string;          // al terminar (si no es loop)
  full?: Pose[];          // poses clave resueltas (cache)
}

const EASE: Record<string, (t: number) => number> = {
  l: (t) => t,
  i: (t) => t * t * t,
  o: (t) => 1 - Math.pow(1 - t, 3),
  io: (t) => smooth(smooth(t)),
  h: () => 0,                                 // mantiene la pose anterior hasta la clave
  back: (t) => { const s = 1.7; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
  snap: (t) => 1 - Math.pow(1 - t, 6),        // llega casi de golpe (cuadros de impacto)
};
const easeFn = (e: Ease | undefined) => typeof e === 'function' ? e : EASE[e ?? 'io'];

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o: Pose = {};
  for (const k in a) {
    const x = a[k], y = b[k] ?? x;
    if (Array.isArray(x)) { const yy = y as V; o[k] = [lerp(x[0], yy[0], t), lerp(x[1], yy[1], t)]; }
    else o[k] = lerp(x as number, y as number, t);
  }
  for (const k in b) if (!(k in o)) o[k] = b[k];
  return o;
}

// Las claves solo dicen lo que cambia: se acumulan sobre la anterior (y la primera sobre `base`)
export function resolve(clip: Clip, base: Pose): Pose[] {
  if (clip.full) return clip.full;
  const out: Pose[] = [];
  let cur = base;
  for (const k of clip.keys) { cur = { ...cur, ...k.p }; out.push(cur); }
  clip.full = out;
  return out;
}

// Pose en el cuadro `f` (puede ser fraccionario para la física, que sí va suave)
export function sample(clip: Clip, base: Pose, f: number): Pose {
  const full = resolve(clip, base), K = clip.keys;
  if (clip.loop) f = ((f % clip.frames) + clip.frames) % clip.frames;
  else f = clamp(f, 0, clip.frames - 1);
  if (f <= K[0].f) return full[0];
  for (let i = 1; i < K.length; i++) {
    if (f <= K[i].f) {
      const t = (f - K[i - 1].f) / (K[i].f - K[i - 1].f || 1);
      return lerpPose(full[i - 1], full[i], easeFn(K[i].e)(t));
    }
  }
  // en loop, del último al primero
  if (clip.loop) {
    const last = K[K.length - 1], span = clip.frames - last.f;
    const t = span > 0 ? (f - last.f) / span : 0;
    return lerpPose(full[K.length - 1], full[0], easeFn(K[0].e)(t));
  }
  return full[K.length - 1];
}

export const num = (p: Pose, k: string, d = 0) => (p[k] as number | undefined) ?? d;
export const vec = (p: Pose, k: string, d: V = [0, 0]) => (p[k] as V | undefined) ?? d;

// ---------- física secundaria (en el marco local del personaje: x hacia donde mira, y abajo) ----------

// Cadena de partículas (cinta, coleta): Verlet con gravedad, arrastre del aire, rigidez de flexión
export class Chain {
  p: V[]; q: V[];
  n: number; seg: number; grav: number; drag: number; bend: number; wind: V;
  constructor(n: number, seg: number, at: V, dir: V, grav = 220, drag = 2.2, bend = 0.12, wind: V = [0, 0]) {
    this.n = n; this.seg = seg; this.grav = grav; this.drag = drag; this.bend = bend; this.wind = wind;
    this.p = []; this.q = [];
    for (let i = 0; i < n; i++) { const v: V = [at[0] + dir[0] * seg * i, at[1] + dir[1] * seg * i]; this.p.push(v); this.q.push([v[0], v[1]]); }
  }
  // `shift` = cuánto se movió el marco (las partículas se quedan en el mundo); `fv` = velocidad del marco
  step(anchor: V, rest: V, dt: number, shift: V, fv: V, t: number) {
    const { p, q } = this;
    for (let i = 0; i < this.n; i++) { p[i][0] -= shift[0]; p[i][1] -= shift[1]; q[i][0] -= shift[0]; q[i][1] -= shift[1]; }
    for (let i = 1; i < this.n; i++) {
      const vx = p[i][0] - q[i][0], vy = p[i][1] - q[i][1];
      q[i][0] = p[i][0]; q[i][1] = p[i][1];
      // aire: frena la velocidad relativa al mundo (la del marco cuenta)
      const flut = Math.sin(t * 9 + i * 0.9) * (8 + 0.5 * Math.hypot(fv[0], fv[1])) * (i / this.n);
      const ax = -this.drag * (vx / dt + fv[0]) + this.wind[0] + flut * rest[1];
      const ay = this.grav - this.drag * (vy / dt + fv[1]) + this.wind[1] - flut * rest[0];
      p[i][0] += vx * 0.965 + ax * dt * dt;
      p[i][1] += vy * 0.965 + ay * dt * dt;
    }
    p[0][0] = anchor[0]; p[0][1] = anchor[1];
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = p[i - 1], b = p[i];
        let dx = b[0] - a[0], dy = b[1] - a[1];
        const d = Math.hypot(dx, dy) || 1e-4, k = (d - this.seg) / d;
        if (i === 1) { b[0] -= dx * k; b[1] -= dy * k; }
        else { a[0] += dx * k * 0.5; a[1] += dy * k * 0.5; b[0] -= dx * k * 0.5; b[1] -= dy * k * 0.5; }
        // flexión: cerca del ancla sigue la dirección de reposo; más allá, la del tramo anterior
        let tx: number, ty: number;
        if (i === 1) { tx = rest[0]; ty = rest[1]; }
        else { const pa = p[i - 2]; tx = a[0] - pa[0]; ty = a[1] - pa[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; }
        const kb = i === 1 ? 0.22 : this.bend;
        b[0] += (a[0] + tx * this.seg - b[0]) * kb;
        b[1] += (a[1] + ty * this.seg - b[1]) * kb;
        dx = b[0] - a[0]; dy = b[1] - a[1];
      }
      p[0][0] = anchor[0]; p[0][1] = anchor[1];
    }
  }
  mirror() { for (const v of this.p) v[0] = -v[0]; for (const v of this.q) v[0] = -v[0]; }
}

// Puntos con resorte hacia una forma de reposo (ruedo de la capa): se atrasan con el movimiento
export class Springs {
  p: V[]; v: V[];
  k: number; damp: number; drag: number; grav: number; maxD: number;
  constructor(rest: V[], k = 260, damp = 9, drag = 3.2, grav = 60, maxD = 14) {
    this.k = k; this.damp = damp; this.drag = drag; this.grav = grav; this.maxD = maxD;
    this.p = rest.map((r) => [r[0], r[1]]);
    this.v = rest.map(() => [0, 0]);
  }
  step(rest: V[], dt: number, shift: V, fv: V, t: number) {
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i], v = this.v[i], r = rest[i];
      p[0] -= shift[0]; p[1] -= shift[1];
      const flut = Math.sin(t * 11 + i * 1.7) * (5 + 0.25 * Math.hypot(fv[0], fv[1]));
      const ax = (r[0] - p[0]) * this.k - v[0] * this.damp - this.drag * (v[0] + fv[0]) + flut * 0.4;
      const ay = (r[1] - p[1]) * this.k - v[1] * this.damp - this.drag * (v[1] + fv[1]) + this.grav + flut;
      v[0] += ax * dt; v[1] += ay * dt;
      p[0] += v[0] * dt; p[1] += v[1] * dt;
      // que no se vaya lejos de su lugar (la tela tiene largo)
      const dx = p[0] - r[0], dy = p[1] - r[1], d = Math.hypot(dx, dy);
      if (d > this.maxD) { p[0] = r[0] + dx / d * this.maxD; p[1] = r[1] + dy / d * this.maxD; }
    }
  }
  mirror() { for (const v of this.p) v[0] = -v[0]; for (const v of this.v) v[0] = -v[0]; }
  reset(rest: V[]) { this.p = rest.map((r) => [r[0], r[1]]); this.v = rest.map(() => [0, 0]); }
}
