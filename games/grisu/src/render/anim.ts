// Animación por poses (GDD §13.3, skill animación): el cuerpo se muestrea EN DOS (12 cuadros por segundo), con poses
// clave sostenidas, curvas de espaciado y un cuadro de smear que llega de golpe. Lo que cuelga (faldones, cadena) es
// física secundaria a 120 Hz, muestreada al cuadro del cuerpo (así todo el dibujo cambia junto, como un sprite).
//
// Una pose da rotaciones (radianes, X Y Z) por articulación, sumadas a la de reposo, más `pos` (corrimiento de la
// raíz, metros) y `scl` (aplaste y estiramiento de la raíz). Una clave solo dice lo que cambia: lo demás se hereda de
// la anterior. Eventos (`ev`) salen una vez por vuelta, en el cuadro en que se pasa su tiempo.
import * as THREE from 'three';

export type Pose = Record<string, number[]>;
export type Ease = 'lin' | 'in' | 'out' | 'io' | 'hold' | 'snap' | 'back';
export type Key = { t: number, p: Pose, e?: Ease };
export type ClipEv = { t: number, k: string, [x: string]: unknown };
export type Smear = { t0: number, t1: number, kind: 'arc' | 'thrust' | 'heavy', from: number, to: number, r: number, w: number, at?: number[] };
export type Clip = { len: number, loop?: boolean, fps?: number, keys: Key[], ev?: ClipEv[], smear?: Smear[], vel?: number[], next?: string, plant?: boolean };

const EASE: Record<Ease, (u: number) => number> = {
  lin: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  io: (u) => u * u * (3 - 2 * u),
  hold: () => 0,
  snap: (u) => 1 - Math.pow(1 - u, 4),
  back: (u) => { const s = 1.6; return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2); },
};

// completa cada clave con lo heredado (y la primera, con la pose base)
function resolve(c: Clip, base: Pose): Pose[] {
  const out: Pose[] = [];
  let cur: Pose = { ...base };
  for (const k of c.keys) { cur = { ...cur, ...k.p }; out.push(cur); }
  return out;
}

export function lerpPose(a: Pose, b: Pose, u: number): Pose {
  const o: Pose = {};
  for (const j in a) {
    const x = a[j], y = b[j] ?? x;
    o[j] = x.map((v, i) => v + ((y[i] ?? v) - v) * u);
  }
  for (const j in b) if (!(j in o)) o[j] = b[j].slice();
  return o;
}

export class Rig {
  root = new THREE.Group();      // lo que se ubica en el mundo
  body = new THREE.Group();      // lo que se aplasta y se corre con `pos`/`scl`
  joints: Record<string, THREE.Object3D> = {};
  rest: Record<string, THREE.Euler> = {};
  pose: Pose = {};               // la última pose aplicada (canales propios del modelo: `anc`, `spin`…)
  constructor() { this.root.add(this.body); }
  joint(name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.joints[name] = g;
    this.rest[name] = g.rotation.clone();
    return g;
  }
  apply(p: Pose) {
    this.pose = p;
    for (const j in this.joints) {
      const r = this.rest[j], v = p[j], o = this.joints[j];
      o.rotation.set(r.x + (v?.[0] ?? 0), r.y + (v?.[1] ?? 0), r.z + (v?.[2] ?? 0));
    }
    const pos = p.pos ?? [0, 0, 0], scl = p.scl ?? [1, 1, 1];
    this.body.position.set(pos[0], pos[1], pos[2] ?? 0);
    this.body.scale.set(scl[0], scl[1], scl[2] ?? scl[0]);
  }
}

// Algo que cuelga: dos ángulos (x: hacia atrás/adelante, z: de costado) con resorte hacia el reposo, empujados por la
// aceleración del punto del que cuelga (en el marco de su padre: si el cuerpo acelera hacia adelante, cuelga atrás)
export class Dangle {
  ax = 0; az = 0; vx = 0; vz = 0;
  p0 = new THREE.Vector3(); p1 = new THREE.Vector3(); init = false;
  j: THREE.Object3D; k: number; damp: number; gain: number; lim: number; restX: number;
  constructor(j: THREE.Object3D, k = 90, damp = 9, gain = 0.02, lim = 1.2, restX = 0) {
    this.j = j; this.k = k; this.damp = damp; this.gain = gain; this.lim = lim; this.restX = restX;
  }
  step(dt: number, extra: THREE.Vector3) {
    const p = new THREE.Vector3();
    this.j.getWorldPosition(p);
    p.add(extra);
    if (!this.init) { this.p0.copy(p); this.p1.copy(p); this.init = true; }
    const a = p.clone().addScaledVector(this.p0, -2).add(this.p1).divideScalar(dt * dt);
    this.p1.copy(this.p0); this.p0.copy(p);
    if (a.length() > 400) a.setLength(400);   // un salto de lugar no es una aceleración
    // al marco del padre
    const q = new THREE.Quaternion();
    this.j.parent!.getWorldQuaternion(q);
    a.applyQuaternion(q.invert());
    // cuelga contra la aceleración: hacia +z (adelante) acelera → la punta va hacia −z (rotación +x levanta hacia atrás)
    const tx = this.restX + THREE.MathUtils.clamp(a.z * this.gain + Math.max(0, a.y) * this.gain * 0.3, -this.lim, this.lim);
    const tz = THREE.MathUtils.clamp(-a.x * this.gain, -this.lim, this.lim);
    this.vx += ((tx - this.ax) * this.k - this.vx * this.damp) * dt;
    this.vz += ((tz - this.az) * this.k - this.vz * this.damp) * dt;
    this.ax += this.vx * dt; this.az += this.vz * dt;
  }
  sample() { this.j.rotation.x += this.ax; this.j.rotation.z += this.az; }
}

export type ModelDef = {
  rig: Rig;
  base: Pose;
  clips: Record<string, Clip>;
  dangles: Dangle[];
  height: number;          // alto de referencia (metros)
  feet?: string[]; footY?: number;   // articulaciones de los pies y cuánto baja la suela desde ellas (para apoyar)
  glow: { setSchool?: (c: string) => void };
  step?: (dt: number, a: Actor) => void;   // física propia (la cadena del ancla)
  frame?: (a: Actor) => void;               // después de aplicar cada cuadro
};

export class Actor {
  def: ModelDef;
  clip!: Clip; id = '';
  t = 0; speed = 1; playing = true; twos = true;
  yaw = Math.PI / 3;      // de frente a +x con 30° hacia la cámara (vista 3/4)
  drawnFrame = -1;
  onEv?: (e: ClipEv, a: Actor) => void;
  onEnd?: (id: string, a: Actor) => void;
  vel = new THREE.Vector3();          // velocidad «de mentira» (corre en el lugar): mueve la física secundaria
  private poses = new Map<string, Pose[]>();
  private acc = 0;
  hold = -1;     // cuadro forzado (cuadro a cuadro)
  loopAll = false;   // el escaparate repite también los clips que no son bucles (con una pausa)
  rest = 0;

  constructor(def: ModelDef, clip = 'idle') { this.def = def; this.play(clip); }
  get root() { return this.def.rig.root; }
  play(id: string, restart = true) {
    if (this.id === id && !restart) return;
    const c = this.def.clips[id];
    if (!c) return;
    this.id = id; this.clip = c;
    if (restart) { this.t = 0; this.drawnFrame = -1; }
    if (!this.poses.has(id)) this.poses.set(id, resolve(c, this.def.base));
  }
  get fps() { return this.clip.fps ?? 12; }
  get frames() { return Math.max(1, Math.round(this.clip.len * this.fps)); }
  frameAt(t = this.t) { return Math.min(this.frames - 1, Math.floor(t * this.fps + 1e-6)); }

  poseAt(t: number): Pose {
    const c = this.clip, P = this.poses.get(this.id)!;
    const k = c.keys;
    if (t <= k[0].t) return P[0];
    for (let i = 0; i < k.length - 1; i++) {
      if (t < k[i + 1].t) {
        const u = (t - k[i].t) / (k[i + 1].t - k[i].t);
        return lerpPose(P[i], P[i + 1], EASE[k[i + 1].e ?? 'io'](u));
      }
    }
    // la vuelta: de la última a la primera
    if (c.loop && k[k.length - 1].t < c.len) {
      const u = (t - k[k.length - 1].t) / (c.len - k[k.length - 1].t);
      return lerpPose(P[P.length - 1], P[0], EASE[k[0].e ?? 'io'](u));
    }
    return P[P.length - 1];
  }

  update(dt: number) {
    const prev = this.t;
    if (this.rest > 0) { this.rest -= dt * this.speed; if (this.rest <= 0) { this.t = 0; this.drawnFrame = -1; } return this.physics(dt); }
    if (this.playing) this.t += dt * this.speed;
    const c = this.clip;
    if (this.t >= c.len) {
      if (c.loop) { this.fire(prev, c.len); this.t %= c.len; this.fire(-1, this.t); }
      else if (this.loopAll) {
        this.fire(prev, c.len);
        this.t = c.len - 1e-4; this.rest = 0.45;
      } else {
        this.fire(prev, c.len);
        const id = this.id;
        if (c.next) this.play(c.next); else this.t = c.len - 1e-4;
        this.onEnd?.(id, this);
        return this.physics(dt);
      }
    } else this.fire(prev, this.t);
    this.physics(dt);
  }
  private fire(a: number, b: number) {
    for (const e of this.clip.ev ?? []) if (e.t > a && e.t <= b) this.onEv?.(e, this);
  }
  private physics(dt: number) {
    this.acc += dt;
    const h = 1 / 120;
    let n = 0;
    while (this.acc >= h && n < 12) {
      this.acc -= h; n++;
      this.extra.addScaledVector(this.vel, h);
      for (const d of this.def.dangles) d.step(h, this.extra);
      this.def.step?.(h, this);
    }
    if (n >= 12) this.acc = 0;
  }
  private extra = new THREE.Vector3();

  // aplica el cuadro actual al modelo (en dos: solo cambia 12 veces por segundo)
  apply(force = false) {
    const f = this.hold >= 0 ? this.hold : (this.twos ? this.frameAt() : -2);
    if (!force && f === this.drawnFrame && f !== -2) return false;
    this.drawnFrame = f;
    const t = f === -2 ? this.t : f / this.fps;
    this.def.rig.apply(this.poseAt(t));
    for (const d of this.def.dangles) d.sample();
    this.def.rig.root.rotation.y = this.yaw;
    if (this.clip.plant !== false && this.def.feet) this.plant();
    this.def.frame?.(this);
    return true;
  }
  // apoya el pie más bajo en el suelo (la raíz está en y = 0): así el paso sube y baja solo
  private plant() {
    const R = this.def.rig, v = new THREE.Vector3();
    R.root.updateMatrixWorld(true);
    let lo = Infinity;
    for (const f of this.def.feet!) { R.joints[f].getWorldPosition(v); lo = Math.min(lo, v.y - this.def.footY!); }
    R.body.position.y -= lo - R.root.position.y;
  }
  // el smear activo en el cuadro actual (o null)
  smear(): Smear | null {
    const t = (this.hold >= 0 ? this.hold : this.frameAt()) / this.fps;
    for (const s of this.clip.smear ?? []) if (t >= s.t0 - 1e-4 && t < s.t1 - 1e-4) return s;
    return null;
  }
}
