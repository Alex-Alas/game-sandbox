// Piloto automático (para la grabación de la portada y para probar niveles enteros): elige la flecha libre más cercana
// (primero las de su isla), camina hasta ella por la grilla de navegación (si no hay camino, va derecho y salta lo que se
// le cruce), la mira y la libera. Si la flecha está en otra isla, va al portal que lleva hacia ella. Maneja la mirada como
// una persona: gira hacia donde camina y camina hacia donde mira.
import { freeArrows, type Board } from './sim/puzzle.ts';
import { boxDist, type Box, type Body } from './sim/body.ts';
import { findPath, type Nav } from './sim/nav.ts';
import { isleAt, islePath, type Ground, type PadW } from './sim/ground.ts';
import type { V2 } from './sim/geom.ts';
import type { ArrowView } from './arrows.ts';

export type PilotIn = { b: Board, views: ArrowView[], gone: boolean[], boxes: Box[], boxCache: Box[][], nav: () => Nav, body: Body, yaw: number, target: number, gr: Ground, isle: number[], padLock: number };
export type PilotOut = { yaw: number, pitch: number, fwd: number, jumpHit: boolean, act: boolean };

const near = (bs: Box[], x: number, z: number) => {
  let d = Infinity, px = x, pz = z;
  for (const k of bs) {
    const dd = boxDist(x, z, k);
    if (dd < d) d = dd, px = Math.min(k.x1, Math.max(k.x0, x)), pz = Math.min(k.z1, Math.max(k.z0, z));
  }
  return { d, p: [px, pz] as V2 };
};
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Pilot {
  goal = -1; path: V2[] = []; t = 0; mark: V2 = [0, 0]; markT = 0; actT = 0; boxesRef: Box[] | null = null; isle = -1; pad: PadW | null = null;

  step(dt: number, s: PilotIn): PilotOut | null {
    this.t += dt, this.actT -= dt;
    const bd = s.body, here: V2 = [bd.x, bd.z], me = isleAt(s.gr, bd.x, bd.z);
    const valid = (id: number) => id >= 0 && !s.gone[id] && s.views[id].mode === 'rest';
    if (!valid(this.goal) || this.boxesRef !== s.boxes || this.isle !== me) {
      if (!valid(this.goal)) {
        const free = freeArrows(s.b, s.gone).filter(id => s.views[id].mode === 'rest');
        if (!free.length) return null;
        const cost = (id: number) => near(s.boxCache[id], bd.x, bd.z).d + (s.isle[id] === me ? 0 : 1000);
        free.sort((a, b) => cost(a) - cost(b));
        this.goal = free[0];
      }
      const mine = s.boxCache[this.goal], hop = islePath(s.gr, me, s.isle[this.goal]);
      this.pad = hop?.length ? s.gr.pads.find(p => p.isle === me && s.gr.pads[p.to].isle === hop[0]) ?? null : null;
      if (this.pad) {
        const pd = this.pad;
        this.path = [...(findPath(s.nav(), s.boxes, here, (x, z) => Math.hypot(x - pd.x, z - pd.z) < 1.3) ?? []), [pd.x, pd.z]];
      } else this.path = findPath(s.nav(), s.boxes, here, (x, z) => mine.some(k => boxDist(x, z, k) < 1.25)) ?? [];
      this.boxesRef = s.boxes, this.isle = me;
    }
    const n = near(s.boxCache[this.goal], bd.x, bd.z);
    const out: PilotOut = { yaw: s.yaw, pitch: -0.12, fwd: 0, jumpHit: false, act: false };
    if (n.d < 1.45 && !this.pad) {
      out.yaw = yawTo(n.p[0] - bd.x, n.p[1] - bd.z);
      out.pitch = -0.36;
      if (s.target === this.goal && this.actT <= 0 && Math.abs(wrap(out.yaw - s.yaw)) < 0.3) out.act = true, this.actT = 0.6;
      return out;
    }
    while (this.path.length > (this.pad ? 1 : 0) && Math.hypot(this.path[0][0] - bd.x, this.path[0][1] - bd.z) < 0.45) this.path.shift();
    let wp = this.path[0] ?? n.p;
    if (this.pad && s.padLock === s.gr.pads.indexOf(this.pad)) { // parado en el portal de llegada: primero se baja (hacia adentro de la isla)
      const o = s.gr.pads[this.pad.to], dx = this.pad.x - o.x, dz = this.pad.z - o.z, l = Math.hypot(dx, dz) || 1;
      wp = [this.pad.x + (dx / l) * 1.8, this.pad.z + (dz / l) * 1.8];
    }
    out.yaw = yawTo(wp[0] - bd.x, wp[1] - bd.z);
    out.fwd = Math.max(0, Math.cos(wrap(out.yaw - s.yaw)));
    // trabado (sin camino, contra una flecha): salta
    if ((this.markT += dt) > 0.45) {
      if (Math.hypot(bd.x - this.mark[0], bd.z - this.mark[1]) < 0.25 && out.fwd > 0.5) out.jumpHit = true;
      this.mark = here, this.markT = 0;
    }
    return out;
  }
}
