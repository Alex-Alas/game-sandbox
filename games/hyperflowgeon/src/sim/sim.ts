import { DEFAULTS, type Cfg } from './params.ts';

// Simulación pura a 60 Hz: datos planos (ida y vuelta por JSON), sin DOM y sin Math no exacto (ver tests).
// Metros y segundos, y hacia arriba. p.x es el centro del héroe; p.y, los pies.
export const HZ = 60, DT = 1 / HZ;
export const HW = 0.35, H = 1.8, HAND = 1.2; // media anchura y alto del héroe; altura de la mano, de donde sale la liga
const EPS = 1e-6; // tocarse no es solaparse
const NEVER = -1e9;
// Golpes de ATAQUE (paso E), frame data en cuadros desde la pulsación (f = 0): pega si start ≤ f < end; el golpe dura
// total (SALTO lo cancela solo en la recuperación, f ≥ end). UP: umbral de la mira unitaria para ↑ y ↓.
export const ATK = { L: { start: 5, end: 9, total: 12, stop: 3 }, H: { start: 13, end: 18, total: 24, stop: 6 }, UP: 0.8 };

export type Rect = { x0: number, y0: number, x1: number, y1: number };
// Dummies por peso: media anchura, alto y la clave de su masa en Cfg (× la del héroe, que pesa 1)
export const KINDS = {
  liviano: { hw: 0.4, h: 0.9, m: 'M_LIGHT' },
  mediano: { hw: 0.35, h: 1.8, m: 'M_MID' },
  pesado: { hw: 0.8, h: 2.6, m: 'M_HEAVY' },
} as const satisfies Record<string, { hw: number, h: number, m: keyof Cfg }>;
export type Kind = keyof typeof KINDS;
// orbs: chispas que devuelven una carga del garfio al tocarlas y reaparecen a los ORB_T s; dummies: dónde aparecen (pies)
export type World = { rects: Rect[], spawn: [number, number], orbs?: [number, number][], dummies?: { x: number, y: number, kind: Kind }[] };
export const ORB_R = 0.4, D_HP = 100;
// x en [-1, 1]; GARFIO mantenido = enganchado; ATAQUE (mantenido: a la par y, con la liga a un dummy, modo ancla);
// (ax, ay) = mira (sin largo: adelante y arriba)
export type Input = { x: number, jump: boolean, hook?: boolean, atk?: boolean, ax?: number, ay?: number };
// ancla, cuadro en que llega (antes viaja: no tira) y largo en reposo de la liga (se fija al llegar); e = el dummy
// enganchado (−1: una superficie) y (ox, oy) dónde, desde sus pies: x, y lo siguen
export type Hook = { x: number, y: number, at: number, rest: number, e: number, ox: number, oy: number };
// último disparo (para dibujarlo): de dónde salió (la mano), adónde va y en qué cuadro llega
export type Shot = { x: number, y: number, ox: number, oy: number, t: number, at: number, hit: boolean };
export type Player = {
  x: number, y: number, vx: number, vy: number,
  ground: boolean,
  face: number,    // ±1: hacia dónde mira (la mira sin dirección va adelante)
  groundT: number, // último cuadro que terminó en el suelo
  pressT: number,  // cuadro del último SALTO apretado y sin usar
  held: boolean,   // SALTO apretado en el cuadro anterior
  rise: boolean,   // subiendo por un salto propio (soltar SALTO lo corta)
  air: number,     // saltos en el aire que quedan (doble salto; vuelven al tocar suelo)
  hook: Hook | null,
  hookHeld: boolean, // GARFIO apretado en el cuadro anterior
  atkHeld: boolean,  // ATAQUE apretado en el cuadro anterior (mantenido: los dummies pasan a la par)
  anchor: boolean,   // modo ancla: ATAQUE mantenido con la liga enganchada a un dummy
  hookT: number,     // primer cuadro en que se puede volver a disparar (tras fallar)
  shot: Shot | null,
  charge: number,  // cargas del garfio (con fracción: la parte que se va recargando)
  refundT: number, // último cuadro en que soltar rápido devolvió una carga
  relT: number,    // último cuadro en que soltó la liga de una superficie (coyote del SALTO con liga)
  atkK: number,     // golpe en curso: 0 ninguno, 1 ligero, 2 pesado ↑, 3 pesado ↓
  atkT0: number,    // cuadro de la pulsación del golpe
  atkHit: number[], // dummies ya golpeados en este golpe
};
// Un dummy: caja sin control con masa y vida. LANZADO (lz): daña y se daña al chocar; hp ≤ 0: roto hasta el cuadro back;
// par: está pasando a la par del héroe (no chocan hasta que se separen); stopT: congelado por hitstop hasta ese cuadro
export type Dummy = { x: number, y: number, vx: number, vy: number, hp: number, ground: boolean, lz: boolean, hitT: number, back: number,
  par: boolean, stopT: number };
export type State = { t: number, p: Player, orbs: number[], d: Dummy[] }; // orbs: cuadro en que cada chispa vuelve a estar

const fresh = (f: { x: number, y: number }): Dummy =>
  ({ x: f.x, y: f.y, vx: 0, vy: 0, hp: D_HP, ground: false, lz: false, hitT: NEVER, back: 0, par: false, stopT: NEVER });
export function init(w: World, c: Cfg = DEFAULTS): State {
  const [x, y] = w.spawn;
  return { t: 0, orbs: (w.orbs ?? []).map(() => 0), d: (w.dummies ?? []).map(fresh), p: { x, y, vx: 0, vy: 0, ground: false, face: 1,
    groundT: NEVER, pressT: NEVER, held: false, rise: false, air: c.AIR_JUMPS, hook: null, hookHeld: false, atkHeld: false,
    anchor: false, hookT: NEVER, shot: null, charge: c.HOOK_N, refundT: NEVER, relT: NEVER, atkK: 0, atkT0: NEVER, atkHit: [] } };
}

export const size = (w: World, k: number) => KINDS[w.dummies![k].kind];
export const mass = (w: World, k: number, c: Cfg) => c[size(w, k).m];
// Las cajas de los dummies enteros (k = su índice): la liga y la mira las tratan como superficies que se mueven
export function foes(w: World, s: State): { r: Rect, k: number }[] {
  return s.d.flatMap((d, k) => {
    if (d.hp <= 0) return [];
    const { hw, h } = size(w, k);
    return [{ r: { x0: d.x - hw, y0: d.y, x1: d.x + hw, y1: d.y + h }, k }];
  });
}

// ¿La liga ya llegó al ancla y tira?
export const attached = (p: Player, t: number) => !!p.hook && t >= p.hook.at;
// Cuadros que tarda la punta en recorrer d m: HOOK_TRAVEL s a todo el alcance, a velocidad constante
const travel = (d: number, c: Cfg) => Math.ceil(c.HOOK_TRAVEL * HZ * d / c.HOOK_LEN - 1e-9);

const approach = (v: number, to: number, d: number) => v < to ? Math.min(v + d, to) : Math.max(v - d, to);

export function step(s: State, w: World, i: Input, c: Cfg): void {
  const p = s.p, t = ++s.t, g = 2 * c.JUMP_H / (c.JUMP_T * c.JUMP_T); // gravedad tal que JUMP_H se alcanza en JUMP_T
  const e0 = (p.vx * p.vx + p.vy * p.vy) / 2 + g * p.y, on0 = attached(p, t); // energía al empezar el cuadro (ver la honda)
  const atkPress = !!i.atk && !p.atkHeld; // antes de que el garfio cambie atkHeld
  if (i.x > 0) p.face = 1;
  else if (i.x < 0) p.face = -1;
  if (i.jump && !p.held) p.pressT = t;
  p.held = i.jump;

  // Garfio. SALTO enganchado a una superficie suelta y suma HOOK_JUMP hacia arriba (y sigue siendo un SALTO: en el suelo
  // salta); enganchado a un dummy es solo un salto (o el doble salto) y no suelta: no corta lo que se hace con él.
  // Soltar GARFIO suelta conservando la velocidad. Soltar a HOOK_REFUND m/s o más (sin contar el HOOK_JUMP) devuelve
  // la carga, pero solo si el ancla ya quedó atrás de tu movimiento (columpio que la pasó: te alejás de ella); soltando
  // mientras te acercás no vuelve. Así encadenar columpios bien casi no gasta.
  // Apretarlo con una carga dispara a hookTarget: si pega, la liga gasta la carga y la punta viaja hasta el ancla
  // (travel: más lejos, más tarda); al llegar queda enganchada con un largo en reposo de HOOK_REST × la distancia de
  // ese momento. Mientras viaja no tira, SALTO es solo un salto y soltar GARFIO la cancela y devuelve la carga. Si no
  // pega, la punta viaja todo el alcance y después quedan HOOK_MISS cuadros sin poder disparar (fallar no gasta).
  const release = () => {
    const ex = p.hook!.x - p.x, ey = p.hook!.y - (p.y + HAND); // ancla atrás: la distancia crece (r·v < 0)
    if (c.HOOK_REFUND > 0 && p.vx * p.vx + p.vy * p.vy >= c.HOOK_REFUND * c.HOOK_REFUND && ex * p.vx + ey * p.vy < 0)
      p.charge = Math.min(c.HOOK_N, p.charge + 1), p.refundT = t;
    if (p.hook!.e < 0) p.relT = t;
    p.hook = null;
  };
  // ATAQUE con la liga enganchada a un dummy. Mantenerlo es el modo ancla: el héroe es el ancla (pesa ANCHOR_M para la
  // liga), la mira empuja al dummy y ATAQUE sostiene la liga aunque se suelte GARFIO (deslizar de GARFIO a ATAQUE se la
  // pasa). Soltarlo lo lanza (LANZADO) hacia la mira con throwVel: un toque es lanzarlo. En modo ancla, apretar GARFIO
  // otra vez suelta la liga sin lanzar (el dummy sigue con su velocidad) y no dispara otra en ese cuadro.
  const toDummy = () => attached(p, t) && p.hook!.e >= 0;
  let dropped = false;
  if (toDummy() && p.atkHeld && !i.atk) {
    const d = s.d[p.hook!.e], [vx, vy] = throwVel(w, s, i, c);
    d.vx = vx, d.vy = vy, d.lz = true;
    release();
  } else if (toDummy() && p.anchor && i.atk && i.hook && !p.hookHeld) release(), dropped = true;
  p.atkHeld = !!i.atk;
  // Coyote de la liga: soltarla de una superficie deja HOOK_COYOTE cuadros en que un SALTO todavía cuenta como el de la
  // liga (suelta HOOK_JUMP): en el celular soltar y saltar no caen en el mismo cuadro.
  const coyote = !p.hook && t - p.relT <= c.HOOK_COYOTE;
  const hookJump = p.pressT === t && (coyote || (attached(p, t) && p.hook!.e < 0));
  if (hookJump) { if (p.hook) release(); p.vy += c.HOOK_JUMP, p.relT = NEVER; }
  if (p.hook && !i.hook && !(toDummy() && i.atk)) {
    if (attached(p, t)) release();
    else p.hook = null, p.charge = Math.min(c.HOOK_N, p.charge + 1), p.shot!.at = t;
  }
  if (i.hook && !p.hookHeld && !p.hook && !dropped && t >= p.hookT && p.charge >= 1) {
    const g = hookTarget(w, s, i, c), ox = p.x, oy = p.y + HAND;
    if (g) {
      const at = t + travel(g.d, c), e = g.e >= 0 ? s.d[g.e] : null;
      p.shot = { x: g.x, y: g.y, ox, oy, t, at, hit: true }, p.charge -= 1;
      p.hook = { x: g.x, y: g.y, at, rest: 0, e: g.e, ox: e ? g.x - e.x : 0, oy: e ? g.y - e.y : 0 };
    } else {
      const [dx, dy] = aimDir(p, i, c), at = t + travel(c.HOOK_LEN, c);
      p.shot = { x: ox + dx * c.HOOK_LEN, y: oy + dy * c.HOOK_LEN, ox, oy, t, at, hit: false };
      p.hookT = at + c.HOOK_MISS;
    }
  }
  p.hookHeld = !!i.hook;
  const on = attached(p, t);
  p.anchor = on && p.hook!.e >= 0 && !!i.atk;

  // Golpes de ATAQUE (sin liga en un dummy; con ella, ATAQUE es el modo ancla). Pega una vez a cada dummy que entre en
  // su caja (atkBox) durante f ∈ [start, end): empuja con ATK_*_BASE más tu rapidez a favor del golpe (sin frenarte),
  // lo congela hitstop cuadros y lo deja LANZADO. Ligero hacia donde mirás; ↑ = pesado que lanza hacia arriba; ↓ en
  // el aire = picada (te baja a ATK_DIVE m/s) y pesado abajo. SALTO cancela solo en la recuperación (f ≥ end).
  const onDummy = attached(p, t) && p.hook!.e >= 0;
  const fd = p.atkK === 1 ? ATK.L : ATK.H;
  if (p.atkK && t - p.atkT0 >= fd.total) p.atkK = 0;
  if (p.atkK && p.pressT === t && t - p.atkT0 >= fd.end) p.atkK = 0;
  if (atkPress && !p.atkK && !onDummy) {
    const ax = i.ax ?? 0, ay = i.ay ?? 0, n = Math.sqrt(ax * ax + ay * ay), uy = n > 1e-9 ? ay / n : 0; // la mira sin normalizar
    p.atkK = uy >= ATK.UP ? 2 : (uy <= -ATK.UP && !p.ground) ? 3 : 1;
    if (p.atkK === 3) p.vy = Math.min(p.vy, -c.ATK_DIVE);
    p.atkT0 = t, p.atkHit = [];
  }
  const box = p.atkK ? atkBox(p, c, t) : null;
  if (box) s.d.forEach((d, k) => {
    if (d.hp <= 0 || p.atkHit.includes(k)) return;
    const { hw, h } = size(w, k);
    if (!(box.x1 > d.x - hw && box.x0 < d.x + hw && box.y1 > d.y && box.y0 < d.y + h)) return;
    const lig = p.atkK === 1, dx = lig ? p.face : 0, dy = p.atkK === 2 ? 1 : p.atkK === 3 ? -1 : 0;
    const J = (lig ? c.ATK_L_BASE : c.ATK_H_BASE) + c.ATK_CARRY * Math.max(0, p.vx * dx + p.vy * dy); // tu rapidez a favor
    const m = Math.min(1, 1 / mass(w, k, c)); // como throwVel: el pesado se mueve menos
    d.vx += dx * J * m, d.vy += dy * J * m;
    d.hp -= lig ? c.ATK_DMG_L : c.ATK_DMG_H, d.hitT = t, d.lz = true;
    d.stopT = t + (lig ? ATK.L.stop : ATK.H.stop);
    p.atkHit.push(k);
  });

  // Cargas: se recargan solas, una cada HOOK_CD s (HOOK_GROUND veces más rápido en el suelo); las chispas devuelven una.
  p.charge = Math.min(c.HOOK_N, p.charge + DT / c.HOOK_CD * (p.ground ? c.HOOK_GROUND : 1));
  (w.orbs ?? []).forEach(([ox, oy], k) => {
    if (t < s.orbs[k] || p.charge >= c.HOOK_N) return; // con todas las cargas la chispa queda para después
    if (Math.abs(ox - p.x) <= HW + ORB_R && oy >= p.y - ORB_R && oy <= p.y + H + ORB_R)
      p.charge = Math.min(c.HOOK_N, p.charge + 1), s.orbs[k] = t + c.ORB_T * HZ;
  });

  // Horizontal: en el suelo acelera hacia RUN·x y frena con DEC (sin entrada, girando o pasado de RUN).
  // En el aire solo actúa la entrada y nunca le quita velocidad a favor: el impulso se conserva.
  // Enganchado manda la liga: el suelo no frena.
  const to = c.RUN * i.x;
  const speeding = to * p.vx >= 0 && Math.abs(to) > Math.abs(p.vx);
  if (p.ground && !on) p.vx = approach(p.vx, to, (speeding ? c.ACC : c.DEC) * DT);
  else if (speeding || to * p.vx < 0) p.vx = approach(p.vx, to, c.AIR * DT);

  // Liga: solo tira (nunca empuja) hacia el ancla, HOOK_K × lo estirado menos HOOK_DAMP × la velocidad radial, y
  // nunca te acerca más rápido que HOOK_V: la herramienta sola no regala velocidad (pasar de ahí sale del columpio).
  // Es una fuerza central, así que la rapidez cambia según el ángulo (a favor acelera, en contra frena y te
  // devuelve, de costado solo te curva: columpio) y se conserva el momento angular alrededor del ancla.
  // Enganchada a un dummy, la misma fuerza tira de las dos puntas repartida por masa (el héroe pesa 1, o ANCHOR_M en
  // modo ancla; una superficie, infinito): el liviano viene, el pesado te lleva, y lo relativo es igual que contra una
  // pared. Se conserva el momento.
  if (p.hook && on) {
    const e = p.hook.e >= 0 ? s.d[p.hook.e] : null, ie = e ? 1 / mass(w, p.hook.e, c) : 0, ih = p.anchor ? 1 / c.ANCHOR_M : 1;
    const ex = p.hook.x - p.x, ey = p.hook.y - (p.y + HAND), d = Math.sqrt(ex * ex + ey * ey);
    if (t === p.hook.at) p.hook.rest = d * c.HOOK_REST;
    if (d > p.hook.rest) {
      const nx = ex / d, ny = ey / d, vr = (p.vx - (e?.vx ?? 0)) * nx + (p.vy - (e?.vy ?? 0)) * ny;
      const a = Math.max(0, Math.min(c.HOOK_K * (d - p.hook.rest) - c.HOOK_DAMP * vr, (c.HOOK_V - vr) / DT)) * DT;
      p.vx += nx * a * ih / (ih + ie), p.vy += ny * a * ih / (ih + ie);
      if (e) e.vx -= nx * a * ie / (ih + ie), e.vy -= ny * a * ie / (ih + ie);
    }
    // Modo ancla: la mira empuja al dummy con SWING_A (junto con la gravedad y la liga, un péndulo que va hacia donde
    // apuntás) y lo que golpea, golpea como LANZADO. Ya más rápido que SWING_V respecto del héroe, la mira solo lo
    // dobla y no le suma rapidez: girarlo más rápido sale de tu impulso, no de la herramienta.
    if (e && p.anchor) {
      const [ax, ay] = aimDir(p, i, c), rx = e.vx - p.vx, ry = e.vy - p.vy, v2 = rx * rx + ry * ry;
      let qx = rx + ax * c.SWING_A * DT, qy = ry + ay * c.SWING_A * DT;
      const q2 = qx * qx + qy * qy;
      if (q2 > v2 && v2 >= c.SWING_V * c.SWING_V) { const k = Math.sqrt(v2 / q2); qx *= k, qy *= k; } // solo gira
      e.vx = p.vx + qx, e.vy = p.vy + qy, e.lz = true;
    }
  }

  // Salto: un SALTO apretado hasta BUFFER cuadros antes, con suelo hasta COYOTE cuadros atrás.
  // groundT = t − 1 es estar en el suelo, así que el aire empieza en t − groundT = 2.
  // Si no, en el aire y en el cuadro en que se aprieta, el doble salto (AIR_JUMPS por vuelo, vuelven al tocar suelo):
  // sube JUMP2_H sin tocar vx y sin quitar subida a favor. SALTO enganchado a una superficie ya fue el impulso de la liga.
  if (t - p.pressT <= c.BUFFER && t - p.groundT <= c.COYOTE + 1) {
    p.vy = 2 * c.JUMP_H / c.JUMP_T;
    p.rise = true;
    p.pressT = p.groundT = NEVER;
  } else if (p.pressT === t && !hookJump && p.air >= 1) {
    const v = Math.sqrt(2 * g * c.JUMP2_H);
    if (p.vy < v) p.vy = v, p.rise = true;
    p.air -= 1, p.pressT = NEVER;
  }
  if (!i.jump && p.rise && p.vy > 0) p.vy *= c.JUMP_CUT, p.rise = false; // soltar subiendo = salto corto

  // Gravedad g; más fuerte al caer. Paso trapezoidal: la parábola es exacta.
  // Enganchado, una sola gravedad y sin tope de caída: con la de caída más fuerte cada columpio ganaría altura gratis.
  const vy0 = p.vy;
  // Como ancla en el aire (ATAQUE mantenido con la liga en un dummy) la gravedad baja a ANCHOR_G: flotás mientras lo girás.
  p.vy -= g * (p.vy < 0 && !on ? c.FALL_G : p.anchor && !p.ground ? c.ANCHOR_G : 1) * DT;
  if (p.vy < -c.MAX_FALL && !on) p.vy = -c.MAX_FALL;
  if (p.vy <= 0) p.rise = false;

  // Mover por ejes con barrido: no atraviesa nada, por rápido que vaya
  const wx = p.vx * DT, dx = sweepX(w, p, HW, H, wx);
  p.x += dx;
  if (dx !== wx) p.vx = 0;
  const wy = (vy0 + p.vy) * 0.5 * DT, dy = sweepY(w, p, HW, H, wy);
  p.y += dy;
  p.ground = wy < 0 && dy !== wy;
  if (dy !== wy) p.vy = 0, p.rise = false;
  // Honda: enganchado a un ancla por debajo de la mano, la liga no sube la rapidez por encima de RUN. Lo que la liga
  // sumó en este cuadro (energía total, cinética más de altura, contra la de al empezar; la caída la conserva) se
  // descuenta de la rapidez, sin bajar de RUN. Las anclas por encima de la mano no entran en este tope.
  if (on0 && p.hook && p.hook.y < p.y + HAND) {
    const v2 = p.vx * p.vx + p.vy * p.vy, W = v2 / 2 + g * p.y - e0;
    if (v2 > c.RUN * c.RUN && W > 0) {
      const keep = Math.max(c.RUN * c.RUN, v2 - 2 * W), k = Math.sqrt(keep / v2);
      p.vx *= k, p.vy *= k;
    }
  }

  // Dummies: una sola gravedad (la del héroe enganchado), roce en el suelo y el mismo barrido. Un golpe lastima si
  // involucra a un LANZADO: a cada dummy, IMPACT_DMG por m/s de su cambio de velocidad por encima de IMPACT_V (contra
  // una pared, todo lo que pierde), y el que lo recibe queda LANZADO. Así el liviano sufre más contra el pesado.
  const hit = (d: Dummy, dv: number) => {
    if (dv > c.IMPACT_V) d.hp -= (dv - c.IMPACT_V) * c.IMPACT_DMG, d.hitT = t, d.lz = true;
  };
  s.d.forEach((d, k) => {
    const { hw, h } = size(w, k);
    if (d.hp <= 0) { if (d.back > 0 && t >= d.back) Object.assign(d, fresh(w.dummies![k])); return; } // back = 0: recién roto
    if (t < d.stopT) return; // hitstop: quieto (sigue en los choques de abajo)
    if (d.ground) d.vx = approach(d.vx, 0, c.D_FRIC * DT);
    const vy0 = d.vy;
    d.vy -= g * DT;
    const wx = d.vx * DT, mx = sweepX(w, d, hw, h, wx);
    d.x += mx;
    if (mx !== wx) { if (d.lz) hit(d, Math.abs(d.vx)); d.vx = 0; }
    const wy = (vy0 + d.vy) * 0.5 * DT, my = sweepY(w, d, hw, h, wy);
    d.y += my;
    d.ground = wy < 0 && my !== wy;
    if (my !== wy) { if (d.lz) hit(d, Math.abs(d.vy)); d.vy = 0; }
  });

  // Choques entre cajas (ver collide): el héroe con cada dummy y los dummies entre sí. Pararse arriba de uno es suelo.
  // Con ATAQUE mantenido los dummies pasan a la par del héroe (no chocan con él): para pasar rápido sobre uno y
  // engancharlo, o dejar pasar uno lanzado y devolverlo; entre ellos siguen chocando. El que quedó encimado sigue a la
  // par hasta separarse: soltar ATAQUE (lanzar) con el péndulo encima no lo frena contra vos.
  const live = s.d.flatMap((d, k) => d.hp > 0 ? [k] : []);
  for (const k of live) {
    const d = s.d[k], { hw, h } = size(w, k);
    if (i.atk || d.par) { d.par = overlap(p, HW, H, d, hw, h); continue; }
    const r = collide(w, p, HW, H, 1, d, hw, h, 1 / mass(w, k, c));
    if (!r) continue;
    if (r.vert && r.n < 0) p.ground = true, p.rise = false;
    if (d.lz) hit(d, r.db);
  }
  for (const a of live) for (const b of live) {
    if (b <= a) continue;
    const A = s.d[a], B = s.d[b], sa = size(w, a), sb = size(w, b), lz = A.lz || B.lz;
    const r = collide(w, A, sa.hw, sa.h, 1 / mass(w, a, c), B, sb.hw, sb.h, 1 / mass(w, b, c));
    if (!r) continue;
    if (r.vert) (r.n < 0 ? A : B).ground = true;
    if (lz) hit(A, r.da), hit(B, r.db);
  }
  if (p.ground) p.groundT = t, p.air = c.AIR_JUMPS;

  // Fin de LANZADO: en el suelo y más lento de lo que lastima. Roto (o caído del mundo): vuelve a los D_RESPAWN s.
  // Si el roto era el enganchado, la liga se suelta (y si todavía viajaba, devuelve la carga).
  for (const d of s.d) {
    if (d.hp > 0 && d.y < -30) d.hp = 0;
    if (d.hp <= 0) { if (d.back <= t) d.back = t + Math.round(c.D_RESPAWN * HZ); continue; }
    if (d.lz && d.ground && d.vx * d.vx + d.vy * d.vy < c.IMPACT_V * c.IMPACT_V) d.lz = false;
  }
  const hk = p.hook;
  if (hk && hk.e >= 0) {
    const d = s.d[hk.e];
    if (d.hp <= 0) {
      if (!attached(p, t)) p.charge = Math.min(c.HOOK_N, p.charge + 1);
      p.hook = null;
    } else {
      hk.x = d.x + hk.ox, hk.y = d.y + hk.oy;
      if (!attached(p, t) && p.shot) p.shot.x = hk.x, p.shot.y = hk.y; // la punta en viaje lo persigue
    }
  }
}

// Caja del golpe activo en el cuadro t, o null: donde pega (la sim) y lo que se dibuja (main.ts), la misma geometría.
// p.x centro, p.y pies; ligero adelante del cuerpo, pesado ↑ adelante y sobre la cabeza (lanzador: levanta también al
// que tenés al lado) y pesado ↓ bajo los pies.
export function atkBox(p: Player, c: Cfg, t: number): Rect | null {
  const f = t - p.atkT0, fd = p.atkK === 1 ? ATK.L : ATK.H;
  if (!p.atkK || f < fd.start || f >= fd.end) return null;
  const r = c.ATK_REACH, fwd = p.face > 0;
  if (p.atkK === 1) return { x0: fwd ? p.x + HW : p.x - HW - r, y0: p.y + 0.5, x1: fwd ? p.x + HW + r : p.x - HW, y1: p.y + H - 0.2 };
  if (p.atkK === 2) return { x0: fwd ? p.x - HW - 0.3 : p.x - HW - r, y0: p.y + 0.5, x1: fwd ? p.x + HW + r : p.x + HW + 0.3, y1: p.y + H + r + 0.5 };
  return { x0: p.x - HW - 0.3, y0: p.y - r - 0.5, x1: p.x + HW + 0.3, y1: p.y };
}

// Velocidad con que ATAQUE lanza al dummy enganchado: hacia la mira, a THROW_V (más lento si pesa más que el héroe: el
// impulso no pasa del de lanzarse a sí mismo) más la rapidez que ya llevaba a favor de la mira. Soltar cuando el péndulo
// (o tu impulso, que lo arrastra) va hacia allá lo lanza más fuerte; en contra, sale solo a THROW_V.
export function throwVel(w: World, s: State, i: Input, c: Cfg): [number, number] {
  const k = s.p.hook!.e, d = s.d[k], [ax, ay] = aimDir(s.p, i, c);
  const v = c.THROW_V * Math.min(1, 1 / mass(w, k, c)) + Math.max(0, d.vx * ax + d.vy * ay);
  return [ax * v, ay * v];
}

// Choque entre dos cajas que se solapan (pies en y, media anchura hw, alto h, inversa de la masa i): por el eje de menor
// penetración, inelástico (sin rebote) y repartido por masa. Lo que no puede moverse hacia ese lado (contra el piso o
// una pared) cuenta como masa infinita: así uno se para sobre un dummy y lo trabado no se hunde. Separa las cajas con
// barrido (nunca dentro de un rect). Devuelve el eje, el sentido de A hacia B y cuánto cambió la velocidad de cada uno.
type Body = { x: number, y: number, vx: number, vy: number };
const overlap = (a: Pos, ahw: number, ah: number, b: Pos, bhw: number, bh: number) =>
  Math.min(a.x + ahw, b.x + bhw) - Math.max(a.x - ahw, b.x - bhw) > EPS && Math.min(a.y + ah, b.y + bh) - Math.max(a.y, b.y) > EPS;
function collide(w: World, a: Body, ahw: number, ah: number, ia: number, b: Body, bhw: number, bh: number, ib: number) {
  const ox = Math.min(a.x + ahw, b.x + bhw) - Math.max(a.x - ahw, b.x - bhw);
  const oy = Math.min(a.y + ah, b.y + bh) - Math.max(a.y, b.y);
  if (ox <= EPS || oy <= EPS) return null;
  const vert = oy < ox, pen = vert ? oy : ox;
  const n = (vert ? b.y + bh / 2 - a.y - ah / 2 : b.x - a.x) >= 0 ? 1 : -1;
  const sw = (o: Body, hw: number, h: number, d: number) => vert ? sweepY(w, o, hw, h, d) : sweepX(w, o, hw, h, d);
  const move = (o: Body, hw: number, h: number, d: number) => {
    const m = sw(o, hw, h, d);
    if (vert) o.y += m; else o.x += m;
    return Math.abs(m);
  };
  if (Math.abs(sw(a, ahw, ah, -n * 1e-3)) < 1e-4) ia = 0;
  if (Math.abs(sw(b, bhw, bh, n * 1e-3)) < 1e-4) ib = 0;
  if (ia + ib === 0) return null; // apretados entre dos paredes: quedan así
  const vn = vert ? b.vy - a.vy : b.vx - a.vx, j = vn * n < 0 ? -vn * n / (ia + ib) : 0, da = ia * j, db = ib * j;
  if (vert) a.vy -= n * da, b.vy += n * db;
  else a.vx -= n * da, b.vx += n * db;
  const ma = move(a, ahw, ah, -n * pen * ia / (ia + ib)), mb = move(b, bhw, bh, n * (pen - ma));
  if (pen - ma - mb > EPS) move(a, ahw, ah, -n * (pen - ma - mb));
  return { vert, n, da, db };
}

// Las 16 direcciones de PVP (spec §1.8), en tabla: cada 22,5° desde la derecha, en sentido antihorario
const C1 = 0.9238795325112867, S1 = 0.3826834323650898, R2 = 0.7071067811865476;
export const DIRS16 = [0, 1, 2, 3].flatMap(q => [[1, 0], [C1, S1], [R2, R2], [S1, C1]].map(([x, y]) =>
  q === 0 ? [x, y] : q === 1 ? [-y, x] : q === 2 ? [-x, -y] : [y, -x]));

// Mira unitaria: la de la entrada o, sin largo, adelante (face) y arriba con pendiente AIM_UP. Con AIM_16 se reduce a
// la más cercana de las 16 direcciones: ratón, joystick y teclado apuntan igual.
export function aimDir(p: Player, i: Input, c: Cfg): [number, number] {
  let x = i.ax ?? 0, y = i.ay ?? 0;
  if (x * x + y * y < 1e-12) x = p.face, y = c.AIM_UP;
  const n = Math.sqrt(x * x + y * y);
  if (c.AIM_16 > 0.5) {
    let best = DIRS16[0], dot = -2;
    for (const d of DIRS16) if (d[0] * x + d[1] * y > dot) dot = d[0] * x + d[1] * y, best = d;
    return [best[0], best[1]];
  }
  return [x / n, y / n];
}

// cos de un ángulo en grados (serie de Taylor: la sim no usa trigonometría). Error < 1e-6 hasta 90°.
export function cosDeg(deg: number): number {
  const x = Math.min(Math.abs(deg), 90) * Math.PI / 180, x2 = x * x;
  return 1 - x2 / 2 * (1 - x2 / 12 * (1 - x2 / 30 * (1 - x2 / 56 * (1 - x2 / 90))));
}

// Dónde se pegaría la liga desde la mano: el rayo de la mira o, si no pega, el punto de superficie visible a menos de
// HOOK_LEN más cercano en ángulo a la mira, dentro del cono de gracia (HOOK_CONE grados a cada lado). Ese punto es
// siempre una esquina de un rect o donde un borde corta el círculo del alcance: a lo largo de un segmento o de un
// arco el ángulo es monótono, y si la mira lo cruzara ya habría pegado el rayo. Lo tapado lo cubre la esquina que tapa.
// Los dummies son superficies más (e = cuál) y tapan lo de atrás. Prioridad del auto-aim (amenaza > esquina >
// superficie): con AIM_FOE, si el rayo no pega a un dummy, gana el dummy visible cuyo centro quede más cerca en ángulo
// dentro del cono; con AIM_EDGE (imán) una esquina visible dentro del cono gana aunque el rayo pegue: los bordes de
// vigas y salientes atraen la liga.
export type Target = { x: number, y: number, d: number, grace: boolean, e: number };
export function hookTarget(w: World, s: State, i: Input, c: Cfg): Target | null {
  const p = s.p, [dx, dy] = aimDir(p, i, c), ox = p.x, oy = p.y + HAND, L = c.HOOK_LEN;
  const fs = foes(w, s), rs = [...w.rects, ...fs.map(f => f.r)], foe = (j: number) => j < w.rects.length ? -1 : fs[j - w.rects.length].k;
  const magnet = c.AIM_EDGE > 0.5 && c.HOOK_CONE > 0;
  let best: Target | null = null, bestCos = cosDeg(c.HOOK_CONE);
  const [d, j] = raycast(rs, ox, oy, dx, dy, L);
  if (d >= 0 && foe(j) >= 0) return { x: ox + dx * d, y: oy + dy * d, d, grace: false, e: foe(j) };
  if (c.AIM_FOE > 0.5 && c.HOOK_CONE > 0) for (const f of fs) {
    const vx = (f.r.x0 + f.r.x1) / 2 - ox, vy = (f.r.y0 + f.r.y1) / 2 - oy, n = Math.sqrt(vx * vx + vy * vy);
    if (n < 1e-6 || (vx * dx + vy * dy) / n <= bestCos) continue;
    const [h, k] = raycast(rs, ox, oy, vx / n, vy / n, L);
    if (h >= 0 && foe(k) === f.k) best = { x: ox + vx / n * h, y: oy + vy / n * h, d: h, grace: true, e: f.k }, bestCos = (vx * dx + vy * dy) / n;
  }
  if (best) return best;
  const consider = (r: Rect, qx: number, qy: number) => {
    const vx = qx - ox, vy = qy - oy, n = Math.sqrt(vx * vx + vy * vy);
    if (n < 1e-6 || n > L + 1e-6) return;
    const cs = (vx * dx + vy * dy) / n;
    if (cs <= bestCos) return;
    // Apuntar un pelo hacia adentro del rect, así el rayo no roza la esquina; tiene que pegar ahí mismo (no tapado)
    const mx = (r.x0 + r.x1) / 2 - qx, my = (r.y0 + r.y1) / 2 - qy, mn = Math.sqrt(mx * mx + my * my) || 1;
    const ux = vx + mx / mn * 1e-4, uy = vy + my / mn * 1e-4, un = Math.sqrt(ux * ux + uy * uy);
    const [h, k] = raycast(rs, ox, oy, ux / un, uy / un, L + 1e-3);
    if (h < 0 || h < n - 1e-3) return;
    best = { x: ox + ux / un * h, y: oy + uy / un * h, d: h, grace: true, e: foe(k) }, bestCos = cs;
  };
  if (magnet) for (const r of rs) for (const qx of [r.x0, r.x1]) for (const qy of [r.y0, r.y1]) consider(r, qx, qy);
  if (best) return best;
  if (d >= 0) return { x: ox + dx * d, y: oy + dy * d, d, grace: false, e: -1 };
  if (c.HOOK_CONE <= 0) return null;
  for (const r of rs) {
    if (!magnet) for (const qx of [r.x0, r.x1]) for (const qy of [r.y0, r.y1]) consider(r, qx, qy);
    for (const y of [r.y0, r.y1]) {
      const e = L * L - (y - oy) * (y - oy);
      if (e >= 0) for (const x of [ox - Math.sqrt(e), ox + Math.sqrt(e)]) if (x > r.x0 && x < r.x1) consider(r, x, y);
    }
    for (const x of [r.x0, r.x1]) {
      const e = L * L - (x - ox) * (x - ox);
      if (e >= 0) for (const y of [oy - Math.sqrt(e), oy + Math.sqrt(e)]) if (y > r.y0 && y < r.y1) consider(r, x, y);
    }
  }
  return best;
}

// Distancia por el rayo unitario (dx, dy) desde (ox, oy) hasta el primer rect de rs antes de max y cuál es (su índice),
// o [−1, −1] (método de las franjas)
export function raycast(rs: Rect[], ox: number, oy: number, dx: number, dy: number, max: number): [number, number] {
  let best = max, hit = -1;
  for (const [k, r] of rs.entries()) {
    let t0 = 0, t1 = best;
    if (dx === 0) { if (ox <= r.x0 || ox >= r.x1) continue; }
    else { const a = (r.x0 - ox) / dx, b = (r.x1 - ox) / dx; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (dy === 0) { if (oy <= r.y0 || oy >= r.y1) continue; }
    else { const a = (r.y0 - oy) / dy, b = (r.y1 - oy) / dy; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (t0 > 0 && t0 <= t1) best = t0, hit = k;
  }
  return hit >= 0 ? [best, hit] : [-1, -1];
}

// Hasta dónde llega una caja (centro x, pies y, media anchura hw, alto h) moviéndose d por un eje sin entrar en ningún rect
type Pos = { x: number, y: number };
function sweepX(w: World, p: Pos, hw: number, h: number, d: number): number {
  for (const r of w.rects) {
    if (p.y + h <= r.y0 + EPS || p.y >= r.y1 - EPS) continue; // no comparten altura
    if (d > 0 && p.x + hw <= r.x0 + EPS) d = Math.min(d, r.x0 - (p.x + hw));
    if (d < 0 && p.x - hw >= r.x1 - EPS) d = Math.max(d, r.x1 - (p.x - hw));
  }
  return d;
}

function sweepY(w: World, p: Pos, hw: number, h: number, d: number): number {
  for (const r of w.rects) {
    if (p.x + hw <= r.x0 + EPS || p.x - hw >= r.x1 - EPS) continue; // no comparten anchura
    if (d > 0 && p.y + h <= r.y0 + EPS) d = Math.min(d, r.y0 - (p.y + h));
    if (d < 0 && p.y >= r.y1 - EPS) d = Math.max(d, r.y1 - p.y);
  }
  return d;
}
