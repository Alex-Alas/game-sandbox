// La mascota en el nivel. Te sigue (delante y al costado, para que se vea en primera persona; las que vuelan, a la altura
// de la vista), se deja acariciar de cuatro maneras según dónde le apuntes (la cabeza: su reacción única; el mentón: una
// rascadita; la panza: se tira panza arriba; un costado: cosquillas), se deja agarrar (mantener apretado) y, en brazos,
// mecer (se pone contenta) o sacudir (se marea). Lanzada (mantener para cargar y soltar) vuela con la física de
// sim/petphys.ts según su CUERPO: rebota, rueda, se aplasta y se levanta (mareada si el golpe fue fuerte). Si cae al vacío,
// vuelve de un salto enojada y se arma un pleito (sim/brawl.ts): te embiste, la esquivás y, mareada, la calmás con
// caricias; ganado, salta a tus brazos; perdido, queda ofendida un rato (no se deja tocar). Todo lo que pasa sale por
// `onEv` (sonidos, partículas, carteles y el empujón al jugador los pone main.ts).
// Nodos: holder (centro en el mundo) → sq1·sq2·sq3 (aplaste a lo largo de un eje del mundo) → orient (hacia dónde mira o
// cómo quedó girada) → pose (las posturas de las caricias y del pleito) → body (los pies o el centro del modelo).
import * as THREE from 'three';
import type { PetId } from './sim/meta.ts';
import { NO_LOOK, type Look } from './sim/styles.ts';
import { BUILD, dress, glove, heartSprite, mat, LOVE_T, type Built, type Mood, type FxKind } from './pets.ts';
import { FEEL, newBall, stepBall, carry, throwVel, relax, kick, CHARGE_T, type Ball, type Feel, type FeelP, type Solid, type V3 } from './sim/petphys.ts';
import { BR, newBrawl, stepBrawl, calm, parry, isOver, type Brawl, type BrawlEv } from './sim/brawl.ts';

export type Caress = 'cabeza' | 'menton' | 'panza' | 'cosquillas';
export const CARESS: Caress[] = ['cabeza', 'menton', 'panza', 'cosquillas'];
export const CARESS_NAME: Record<Caress, string> = { cabeza: 'LA CABEZA', menton: 'EL MENTÓN', panza: 'LA PANZA', cosquillas: 'COSQUILLAS' };
export const GRAB_T = 0.3;     // mantener apretado sobre la mascota: agarrarla
const STEP = 1 / 120, COMBO_T = 20, CARE_HAND = 1.9, RISE_T = 1.05, GONE_T = 0.9, HUG_T = 2.4;
// Cuánto se la sacude: la aceleración de un resorte de referencia que cuelga de la mano (igual para cualquier cuerpo, y
// suave: no le afecta a qué ritmo lleguen los movimientos del ratón). Más que SHAKE_A seguido, sacudirla; entre ROCK_A, mecerla
const SHAKE_A = 70, ROCK_A = [7, 45], REF = FEEL.saltarin;
const PANZA = [-1.2, 0.45];           // tirada de espaldas: hacia atrás y un poco de costado (así se le ve la cara)
// radio de cada una (su pelota al agarrarla, lanzarla y apuntarle)
const RADIUS: Record<PetId, number> = { gomita: 0.3, michi: 0.27, pio: 0.22, croac: 0.26, bu: 0.27, ajolote: 0.26, zumbi: 0.21, robi: 0.28, dragui: 0.25 };

export type PetMode = 'follow' | 'held' | 'thrown' | 'gone' | 'rise' | 'fight' | 'hug';
export type PetEv = {
  k: 'grab' | 'throw' | 'drop' | 'bounce' | 'land' | 'dizzy' | 'rock' | 'falling' | 'void' | 'back' | 'combo' | 'refuse' | BrawlEv['k'],
  v?: number, dx?: number, dz?: number, x?: number, y?: number, z?: number,
};
// Lo que necesita del jugador (eye: la cámara; fwd y right: hacia dónde mira)
export type PlayerView = { x: number, y: number, z: number, vx: number, vy: number, vz: number, yaw: number, speed: number, eye: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3 };
export type PetEnv = { groundAt: (x: number, z: number) => number, landAt: (x: number, z: number) => boolean, solids: () => Solid[] };

const Y = new THREE.Vector3(0, 1, 0), RED = new THREE.Color('#ff2a3d');
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const yawQ = (a: number, q = new THREE.Quaternion()) => q.setFromAxisAngle(Y, a);
// sube en `a` s, se mantiene y baja en `b` s antes de `T`
const env = (k: number, T: number, a = 0.25, b = 0.35) => clamp01(Math.min(k / a, (T - k) / b));
const ease = (u: number) => u * u * (3 - 2 * u);

// El 💢 del enojo y una estrellita del mareo (en lienzos, como los corazones)
let veinTex: THREE.CanvasTexture | null = null, starTex: THREE.CanvasTexture | null = null;
function canvasTex(draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function veinSprite() {
  veinTex ??= canvasTex(g => {
    g.translate(32, 32); g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      g.save(); g.rotate(k * Math.PI / 2 + Math.PI / 4);
      for (const [w, c] of [[11, '#ffffff'], [6, '#ff2a3d']] as [number, string][]) { g.lineWidth = w; g.strokeStyle = c; g.beginPath(); g.arc(17, 17, 12, Math.PI * 1.05, Math.PI * 1.45); g.stroke(); }
      g.restore();
    }
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: veinTex, transparent: true, depthWrite: false }));
  s.scale.setScalar(0.17);
  return s;
}
function starSprite() {
  starTex ??= canvasTex(g => {
    g.translate(32, 32); g.fillStyle = '#ffd23f'; g.strokeStyle = '#fff6c8'; g.lineWidth = 4; g.lineJoin = 'round';
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 11 : 26; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.stroke(); g.fill();
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false }));
  s.scale.setScalar(0.1);
  return s;
}
// La franja roja que avisa por dónde va a embestir (chevrones que avanzan)
let stripeTex: THREE.CanvasTexture | null = null;
function stripeMesh() {
  if (!stripeTex) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const g = cv.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,42,61,0)'); gr.addColorStop(0.2, 'rgba(255,42,61,.75)'); gr.addColorStop(0.8, 'rgba(255,42,61,.75)'); gr.addColorStop(1, 'rgba(255,42,61,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(14, 44); g.lineTo(32, 84); g.lineTo(50, 44); g.stroke();
    stripeTex = new THREE.CanvasTexture(cv); stripeTex.wrapT = THREE.RepeatWrapping; stripeTex.colorSpace = THREE.SRGBColorSpace;
  }
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -0.5); // del origen hacia −z
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: stripeTex.clone(), transparent: true, depthWrite: false, fog: false }));
  (m.material.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  m.renderOrder = 2;
  m.visible = false;
  return m;
}

export class PetCtl {
  readonly id: PetId; readonly root = new THREE.Group(); readonly r: number; readonly fly: boolean;
  private b: Built; private spin: ((t: number) => void) | null;
  private holder = new THREE.Group(); private sq1 = new THREE.Group(); private sq2 = new THREE.Group(); private sq3 = new THREE.Group();
  private orient = new THREE.Group(); private pose = new THREE.Group(); private body = new THREE.Group();
  private hand = glove(); private hands = [glove(), glove()];
  private pivotY: number; private top = new THREE.Vector3(); private chin = new THREE.Vector3();
  private belly = { lift: 0, top: 0 }; // panza arriba: cuánto subirla para que no se hunda en el piso y dónde queda la panza
  private brows: THREE.Object3D[] = []; private vein = veinSprite(); private stars = [starSprite(), starSprite(), starSprite()]; private stripe = stripeMesh();
  private base: [THREE.MeshStandardMaterial, THREE.Color, number][];
  private hearts: { s: THREE.Sprite, t: number, vx: number, vz: number }[] = []; private heartT = 0;
  private fp: FeelP; feel: Feel;
  x: number; y: number; z: number; vx = 0; vz = 0; face = 0; t = 0; mood: Mood = 'idle'; moodT = 0; move = 0; pats = 0; throws = 0;
  care: { k: Caress, side: number, t: number } | null = null;
  mode: PetMode = 'follow'; modeT = 0; ball: Ball; private acc = 0;
  charge = -1;                    // segundos cargando el lanzamiento (−1: no)
  dizzy = 0; sulk = 0;            // mareada / ofendida (segundos que faltan)
  private shake = 0; private rock = 0; private rockCd = 0; private angryW = 0; private bounceCd = 0; private fellOver = false;
  private ref: Ball;
  brawl: Brawl | null = null;
  private lastLand: [number, number] = [0, 0]; private rise = { x0: 0, z0: 0, y0: 0, x1: 0, z1: 0, y1: 0 };
  private rec: { q0: THREE.Quaternion, t: number } | null = null; private q = new THREE.Quaternion();
  private combo = new Map<Caress, number>();
  onEv: ((e: PetEv) => void) | null = null;
  onFx: ((kind: FxKind, x: number, y: number, z: number) => void) | null = null;

  constructor(id: PetId, x: number, z: number, look: Look = NO_LOOK, feel: Feel = 'solido') {
    this.id = id, this.b = BUILD[id](), this.r = RADIUS[id], this.fly = this.b.fly > 0;
    this.feel = feel, this.fp = FEEL[feel];
    this.spin = dress(this.b, look);
    this.pivotY = this.fly ? 0 : this.r;
    // medidas en reposo: la cabeza (para la mano), el mentón y el punto más bajo
    this.b.anim(0, { move: 0, mood: 'idle', moodT: 9 });
    this.b.g.updateMatrixWorld(true);
    this.b.hat.at.localToWorld(this.top.set(...this.b.hat.p)).y -= this.pivotY;
    this.b.face.at.localToWorld(this.chin.set(...this.b.face.p)).y -= this.pivotY + 0.07 * this.b.face.s;
    this.root.add(this.holder);
    this.holder.add(this.sq1); this.sq1.add(this.sq2); this.sq2.add(this.sq3); this.sq3.add(this.orient);
    this.orient.add(this.pose, this.hand, ...this.hands); this.pose.add(this.body); this.body.add(this.b.g);
    this.body.position.y = -this.pivotY;
    // panza arriba: se mide cómo queda tirada de espaldas
    this.pose.rotation.set(PANZA[0], 0, PANZA[1]);
    this.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(this.body);
    this.belly.lift = this.fly ? 0 : Math.max(0, -this.pivotY - bb.min.y);
    this.belly.top = this.belly.lift + this.r * 0.8; // (lo más alto serían las patas)
    this.pose.rotation.set(0, 0, 0);
    this.hand.visible = false;
    this.hands.forEach((h, i) => { h.visible = false; if (i) h.scale.x = -1; });
    // cejas de enojo sobre cada ojo
    const ink = mat('#1d1b3a', { roughness: 0.3 });
    for (const e of this.b.eyes) {
      const m = e as THREE.Mesh, er = (m.geometry?.boundingSphere ?? (m.geometry?.computeBoundingSphere(), m.geometry?.boundingSphere))?.radius ?? 0.04;
      const r = er * Math.max(e.scale.x, e.scale.y), br = new THREE.Group(), c = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.3, r * 1.5, 4, 8), ink);
      c.rotation.z = Math.PI / 2; br.add(c);
      br.position.set(e.position.x + Math.sign(e.position.x) * r * 0.1, e.position.y + r * 1.35, e.position.z + r * 0.35);
      br.rotation.z = Math.sign(e.position.x) * 0.5;
      br.visible = false;
      e.parent!.add(br);
      this.brows.push(br);
    }
    this.vein.visible = false;
    this.vein.position.set(this.b.hat.p[0] + 0.13 * this.b.hat.s, this.b.hat.p[1] + 0.02, this.b.hat.p[2]);
    this.b.hat.at.add(this.vein);
    for (const s of this.stars) { s.visible = false; this.orient.add(s); }
    this.root.add(this.stripe);
    this.base = this.b.skin.map(([m]) => [m, m.emissive.clone(), m.emissiveIntensity]);
    this.x = x, this.z = z, this.y = this.fly ? 1 : this.r;
    this.ball = newBall(x, this.y, z, this.r);
    this.ref = newBall(x, this.y, z, this.r);
  }

  setFeel(f: Feel) { this.feel = f, this.fp = FEEL[f]; }
  get fighting() { return this.mode === 'fight' || this.mode === 'rise' || this.mode === 'gone'; }
  get brawling() { return this.mode === 'fight' || this.mode === 'rise'; } // ya volvió (para el cartel del pleito)
  get held() { return this.mode === 'held'; }
  get busy() { return this.mode !== 'follow'; }
  get power() { return this.charge < 0 ? 0 : Math.min(1, this.charge / CHARGE_T); }
  private emit(e: PetEv) { this.onEv?.(e); }

  // Para apuntarle (solo siguiéndote o en el pleito): el centro de su cuerpo y un radio generoso
  aim(): { c: THREE.Vector3, r: number } | null {
    if (this.mode !== 'follow' && this.mode !== 'fight') return null;
    return { c: new THREE.Vector3(this.x, this.y + (this.fly ? 0 : 0.04), this.z), r: Math.max(0.4, this.r + 0.16) };
  }
  // Qué caricia es según dónde le apunta la mira en la pantalla (lo que más se acerca el rayo a su centro, en el alto y el
  // ancho de la vista): arriba la cabeza, abajo la panza, a los costados cosquillas y al medio el mentón
  zone(ray: THREE.Ray, up: THREE.Vector3, right: THREE.Vector3): { k: Caress, side: number } {
    const a = this.aim() ?? { c: new THREE.Vector3(this.x, this.y, this.z), r: 0.4 };
    const q = ray.closestPointToPoint(a.c, new THREE.Vector3()).sub(a.c), u = q.dot(up) / a.r, v = q.dot(right) / a.r;
    if (Math.abs(v) > 0.45 && Math.abs(v) > Math.abs(u)) return { k: 'cosquillas', side: Math.sign(v) };
    if (u > 0.3) return { k: 'cabeza', side: 0 };
    if (u < -0.3) return { k: 'panza', side: 0 };
    return { k: 'menton', side: 0 };
  }

  cheer() { if (!this.care && this.mode === 'follow' && this.sulk <= 0) this.mood = 'happy', this.moodT = 0; }
  sad() { if (this.mode === 'follow') this.mood = 'sad', this.moodT = 0; }
  get loving() { return !!this.care; }

  // Una caricia (si ya estaba con la misma, no vuelve a empezar la animación: suma corazones)
  caress(k: Caress, side = 0): boolean {
    if (this.mode !== 'follow' || this.sulk > 0) { this.refuse(); return false; }
    if (!this.care || this.care.k !== k || this.care.t > 0.5) this.care = { k, side: side || 1, t: 0 };
    this.mood = 'idle', this.dizzy = 0;
    this.pats++;
    for (let i = 0; i < 3; i++) this.addHeart();
    kick(this.ball, this.fp, k === 'cosquillas' ? 2.5 : 1.6);
    this.combo.set(k, this.t);
    if (CARESS.every(c => (this.combo.get(c) ?? -Infinity) > this.t - COMBO_T)) {
      this.combo.clear();
      for (let i = 0; i < 10; i++) this.addHeart();
      this.emit({ k: 'combo', x: this.x, y: this.y, z: this.z });
    }
    return true;
  }
  private refuse() { this.mood = 'sad', this.moodT = 0; this.emit({ k: 'refuse' }); }

  // Agarrarla (siguiéndote, sin estar ofendida)
  grab(): boolean {
    if (this.mode !== 'follow' || this.sulk > 0) { this.refuse(); return false; }
    this.mode = 'held', this.modeT = 0, this.care = null, this.rec = null, this.charge = -1, this.shake = this.rock = 0;
    const b = this.ball;
    b.x = this.x, b.y = this.y, b.z = this.z, b.vx = this.vx, b.vy = 0, b.vz = this.vz, b.wx = b.wy = b.wz = 0;
    Object.assign(this.ref, { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: 0, vz: b.vz });
    b.q = yawQ(this.face).toArray() as Ball['q'];
    this.mood = 'happy', this.moodT = 0;
    kick(b, this.fp, 2);
    this.emit({ k: 'grab' });
    return true;
  }
  startCharge() { if (this.mode === 'held' && this.charge < 0) this.charge = 0; }
  // Soltar el botón cargado: la lanza hacia `look` (con fuerza según la carga), girando hacia adelante
  throwIt(look: V3) {
    if (this.mode !== 'held') return;
    const pw = this.power, b = this.ball, [vx, vy, vz] = throwVel(b, look, pw), sp = Math.hypot(vx - b.vx, vy - b.vy, vz - b.vz);
    b.vx = vx, b.vy = vy, b.vz = vz;
    const h = Math.hypot(look[0], look[2]) || 1, w = sp / b.r * 0.25 * (this.feel === 'saltarin' ? 1.4 : 1);
    b.wx = look[2] / h * w, b.wy = (Math.random() - 0.5) * 2, b.wz = -look[0] / h * w; // eje = arriba × dirección: vuelta hacia adelante
    this.charge = -1;
    this.loose();
    this.throws++;
    this.emit({ k: 'throw', v: pw });
  }
  // Dejarla (Q): un empujoncito hacia adelante
  drop(look: V3) {
    if (this.mode !== 'held' && this.mode !== 'hug') return;
    const b = this.ball;
    b.vx += look[0] * 1.2, b.vz += look[2] * 1.2, b.vy += 0.8;
    this.charge = -1;
    this.loose();
    this.emit({ k: 'drop' });
  }
  private loose() { this.mode = 'thrown', this.modeT = 0, this.acc = 0, this.ball.hit = 0, this.ball.air = 0, this.ball.still = 0, this.fellOver = false, this.mood = 'idle'; }

  // En el pleito, apretar apuntándole: la ataja si está embistiendo cerca; si está mareada, la calma; si no, gruñe
  fightAct(p: PlayerView): void {
    if (this.mode !== 'fight' || !this.brawl) return;
    const e = this.brawlEnv(p, null);
    let evs = parry(this.brawl, e);
    if (!evs.length) evs = calm(this.brawl);
    for (const v of evs) this.onBrawl(v, p);
  }
  // Para el cartel: qué hace apretar ahora en el pleito
  fightHint(p: { x: number, z: number }): 'atajar' | 'calmar' | 'enojada' {
    const br = this.brawl;
    if (!br) return 'enojada';
    if (br.phase === 'daze') return 'calmar';
    if (br.phase === 'lunge' && Math.hypot(br.x - p.x, br.z - p.z) < BR.PARRY_D) return 'atajar';
    return 'enojada';
  }

  place(x: number, z: number) {
    if (this.mode === 'held' || this.mode === 'hug' || this.mode === 'gone' || this.mode === 'rise') return; // la llevás, o ya viene
    if (this.mode === 'fight' && this.brawl) { this.brawl.x = x, this.brawl.z = z; this.x = x, this.z = z; return; }
    if (this.mode !== 'follow') this.mode = 'follow', this.modeT = 0, this.rec = null, this.holder.visible = true;
    this.x = x, this.z = z, this.vx = this.vz = 0;
  }

  private addHeart(n = 1) {
    for (let k = 0; k < n; k++) {
      const s = heartSprite(), p = this.orient.localToWorld(this.top.clone());
      s.position.set(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.3);
      this.root.add(s);
      this.hearts.push({ s, t: 0, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3 });
    }
  }

  private brawlEnv(p: PlayerView, e: PetEnv | null) {
    return { px: p.x, py: p.y, pz: p.z, pvx: p.vx, pvz: p.vz, ground: e?.groundAt ?? (() => 0), land: e?.landAt ?? (() => true) };
  }
  private onBrawl(v: BrawlEv, p: PlayerView) {
    const br = this.brawl!;
    if (v.k === 'calm' || v.k === 'parry') { this.addHeart(4); kick(this.ball, this.fp, 3); }
    if (v.k === 'miss') kick(this.ball, this.fp, 6);
    this.emit({ ...v, x: br.x, y: br.y, z: br.z });
    if (v.k === 'won') {
      // hacen las paces: salta a tus brazos
      this.mode = 'hug', this.modeT = 0, this.brawl = null, this.sulk = 0, this.dizzy = 0;
      for (const b of [this.ball, this.ref]) b.x = this.x, b.y = this.y, b.z = this.z, b.vx = b.vy = b.vz = 0;
      this.care = { k: 'cabeza', side: 1, t: 0 };
      this.addHeart(10);
      void p;
    } else if (v.k === 'lost' || v.k === 'tired') {
      this.mode = 'follow', this.modeT = 0, this.brawl = null, this.sulk = v.k === 'lost' ? 18 : 8;
      this.mood = v.k === 'lost' ? 'happy' : 'sad', this.moodT = 0; // ganó: festeja; cansada: resopla
    }
  }

  update(dt: number, p: PlayerView, e: PetEnv) {
    this.t += dt, this.moodT += dt, this.modeT += dt;
    if (this.care && (this.care.t += dt) > LOVE_T) this.care = null;
    if (this.mood !== 'idle' && this.moodT > 1.1) this.mood = 'idle';
    this.dizzy = Math.max(0, this.dizzy - dt), this.sulk = Math.max(0, this.sulk - dt), this.rockCd -= dt, this.bounceCd -= dt;
    if (this.charge >= 0) this.charge += dt;
    if (this.mode === 'follow') this.follow(dt, p, e);
    else if (this.mode === 'held' || this.mode === 'hug') this.hold(dt, p);
    else if (this.mode === 'thrown') this.flight(dt, p, e);
    else if (this.mode === 'gone') { if (this.modeT > GONE_T) this.startRise(p, e); }
    else if (this.mode === 'rise') this.rising(p, e);
    else if (this.mode === 'fight') this.fight(dt, p, e);
    this.render(dt, p, e);
  }

  // ---- Siguiéndote (landAt: si hay piso; las que caminan no se meten en el vacío: esperan en el borde) ------------------
  private follow(dt: number, p: PlayerView, e: PetEnv) {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const fly = this.fly, loving = !!this.care, sulk = this.sulk > 0;
    const ahead = sulk ? 4.2 : fly ? 2.1 : 2.6, side = sulk ? 1.6 : fly ? 0.85 : -0.95;
    let tx = p.x + fx * ahead + rx * side, tz = p.z + fz * ahead + rz * side;
    // con el jugador quieto, se queda donde está mientras siga a la vista y cerca (así se le puede apuntar)
    const ox = this.x - p.x, oz = this.z - p.z, od = Math.hypot(ox, oz), inView = od > 0.5 && (ox * fx + oz * fz) / od > 0.6;
    const stay = loving || this.dizzy > 0 || !!this.rec || (p.speed < 0.5 && inView && od < 4.5);
    if ((!fly && !e.landAt(tx, tz)) || stay) tx = this.x, tz = this.z;
    let dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 16) { this.place(tx, tz); dx = dz = 0; }
    if (!fly && Math.hypot(p.x - this.x, p.z - this.z) > 16 && e.landAt(p.x, p.z) && p.y >= -0.1) { this.place(p.x + fx * 1.6, p.z + fz * 1.6); dx = dz = 0; }
    const want = d < 0.35 ? 0 : Math.min(Math.max(6, p.speed * 1.5), d * 3);
    const k = 1 - Math.exp(-8 * dt);
    this.vx += ((d > 1e-3 ? dx / d : 0) * want - this.vx) * k;
    this.vz += ((d > 1e-3 ? dz / d : 0) * want - this.vz) * k;
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (fly || e.landAt(nx, nz)) this.x = nx, this.z = nz; else this.vx = this.vz = 0;
    // nunca pegada a la cámara (al girar quedaría tapando la vista)
    const px = this.x - p.x, pz = this.z - p.z, pd = Math.hypot(px, pz), MIN = fly ? 1.2 : 1.5;
    if (pd < MIN) { const q = pd > 1e-3 ? MIN / pd : 0; this.x = p.x + (pd > 1e-3 ? px * q : fx * MIN), this.z = p.z + (pd > 1e-3 ? pz * q : fz * MIN); }
    const sp = Math.hypot(this.vx, this.vz);
    this.move += ((sp > 0.4 && !loving ? 1 : 0) - this.move) * Math.min(1, dt * 8);
    // mira hacia donde va; quieta (o acariciada), al jugador; ofendida, para el otro lado (y de vez en cuando te espía)
    const toP = Math.atan2(p.x - this.x, p.z - this.z), peek = sulk && Math.sin(this.t * 0.9) > 0.85;
    const look = sp > 0.4 && !loving ? Math.atan2(this.vx, this.vz) : sulk && !peek ? toP + Math.PI : toP;
    let da = look - this.face;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.face += da * Math.min(1, dt * (loving ? 12 : 7));
    const gy = fly ? p.y + this.b.fly : e.groundAt(this.x, this.z) + this.pivotY;
    this.y += (gy - this.y) * Math.min(1, dt * (fly ? 4 : 14));
    const b = this.ball;
    b.x = this.x, b.y = this.y, b.z = this.z;
    relax(b, this.fp, dt);
    if (this.rec && (this.rec.t += dt) > 0.45) this.rec = null;
  }

  // ---- En brazos: cuelga delante de la cámara; cargando, se va para atrás --------------------------------------------
  private hold(dt: number, p: PlayerView) {
    // abajo a la derecha (así no tapa la mira); al cargar, se va un poco para atrás y para el costado
    const pw = this.power, hug = this.mode === 'hug', down = hug ? 0.3 : 0.44 + 0.06 * pw, side = hug ? 0 : 0.3 + 0.1 * pw;
    const ahead = hug ? 0.85 : 1.15 - 0.15 * pw, tr = pw >= 1 ? Math.sin(this.t * 50) * 0.01 : 0;
    const tx = p.eye.x + p.fwd.x * ahead + p.right.x * side + tr, ty = p.eye.y + p.fwd.y * ahead - down, tz = p.eye.z + p.fwd.z * ahead + p.right.z * side;
    const b = this.ball, r = this.ref, t: V3 = [tx, ty, tz], tv: V3 = [p.vx, p.vy, p.vz];
    // un portal (o volver de una caída) te mueve de golpe: va con vos
    if (Math.hypot(tx - b.x, ty - b.y, tz - b.z) > 3) for (const q of [b, r]) q.x = tx, q.y = ty, q.z = tz, q.vx = p.vx, q.vy = p.vy, q.vz = p.vz;
    let amax = 0;
    for (this.acc += dt; this.acc >= STEP; this.acc -= STEP) { carry(b, this.fp, t, tv, STEP); amax = Math.max(amax, carry(r, REF, t, tv, STEP)); }
    this.x = b.x, this.y = b.y, this.z = b.z;
    // sacudirla la marea; mecerla le gusta
    this.shake = amax > SHAKE_A ? this.shake + dt : Math.max(0, this.shake - dt * 0.5);
    if (this.shake > 0.7 && this.dizzy <= 0) { this.dizzy = 2.2, this.shake = 0; this.emit({ k: 'dizzy' }); }
    this.rock = amax > ROCK_A[0] && amax < ROCK_A[1] && this.dizzy <= 0 ? this.rock + dt : Math.max(0, this.rock - dt * 0.3);
    if (this.rock > 1.1 && this.rockCd <= 0) { this.rock = 0, this.rockCd = 1.6; this.addHeart(2); this.mood = 'happy', this.moodT = 0.3; this.emit({ k: 'rock' }); }
    // mira a la cámara, inclinada hacia donde la arrastran
    const face = Math.atan2(p.eye.x - b.x, p.eye.z - b.z), lx = (tx - b.x) * 2.5, lz = (tz - b.z) * 2.5;
    const up = new THREE.Vector3(Math.max(-0.6, Math.min(0.6, lx)), 1, Math.max(-0.6, Math.min(0.6, lz))).normalize();
    const want = new THREE.Quaternion().setFromUnitVectors(Y, up).multiply(yawQ(face));
    this.q.fromArray(b.q).slerp(want, Math.min(1, dt * 12)).toArray(b.q);
    this.face = face;
    if (hug && this.modeT > HUG_T) { this.drop([p.fwd.x, p.fwd.y, p.fwd.z]); }
  }

  // ---- Lanzada: la física hasta que se queda quieta (o se cae al vacío) ----------------------------------------------
  private flight(dt: number, p: PlayerView, e: PetEnv) {
    const b = this.ball, S = e.solids();
    for (this.acc += dt; this.acc >= STEP; this.acc -= STEP) {
      const ev = stepBall(b, this.fp, S, STEP);
      if (ev.ground && ev.id === -1) this.lastLand = [b.x, b.z];
      if (ev.hit !== undefined && ev.hit > 2.2 && this.bounceCd <= 0) { this.bounceCd = 0.07; this.emit({ k: 'bounce', v: ev.hit, x: b.x, y: b.y, z: b.z }); }
      if (!this.fellOver && b.y < -0.8) { this.fellOver = true; this.emit({ k: 'falling' }); }
      if (ev.void) { this.mode = 'gone', this.modeT = 0, this.holder.visible = false; this.emit({ k: 'void', x: b.x, y: b.y, z: b.z }); return; }
    }
    this.x = b.x, this.y = b.y, this.z = b.z;
    const sp = Math.hypot(b.vx, b.vz);
    this.move += ((b.air > 0.1 || sp > 0.5 ? 1 : 0) - this.move) * Math.min(1, dt * 8); // patalea en el aire
    if (b.still > 0.3 || this.modeT > 8) {
      // se levanta: de como quedó a parada mirando hacia donde iba
      this.q.fromArray(b.q);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
      this.face = Math.hypot(f.x, f.z) > 0.2 ? Math.atan2(f.x, f.z) : Math.atan2(p.x - b.x, p.z - b.z);
      this.rec = { q0: this.q.clone(), t: 0 };
      this.mode = 'follow', this.modeT = 0, this.vx = this.vz = 0;
      const hard = b.hit > 11 && this.feel !== 'blando';
      if (hard) { this.dizzy = 1.8; this.emit({ k: 'dizzy' }); } else { this.mood = 'happy', this.moodT = 0; this.emit({ k: 'land' }); }
    }
  }

  // ---- Del vacío vuelve de un salto, enojada, por el borde más cercano hacia vos ------------------------------------
  private startRise(p: PlayerView, e: PetEnv) {
    const b = this.ball;
    let x = b.x, z = b.z;
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    let found = false;
    for (let s = 0; s < 60 && !found; s += 0.2) if (e.landAt(x + ux * s, z + uz * s)) { x += ux * s, z += uz * s, found = true; }
    if (!found) x = p.x - ux * 4, z = p.z - uz * 4;
    let lx = x + ux * 1.4, lz = z + uz * 1.4;
    if (!e.landAt(lx, lz)) lx = x, lz = z;
    const y1 = this.fly ? p.y + this.b.fly : e.groundAt(lx, lz) + this.pivotY;
    this.rise = { x0: x - ux * 0.7, z0: z - uz * 0.7, y0: -3.5, x1: lx, z1: lz, y1 };
    this.mode = 'rise', this.modeT = 0, this.holder.visible = true, this.care = null, this.rec = null;
    this.face = Math.atan2(ux, uz);
    this.emit({ k: 'back', x: lx, y: y1, z: lz });
  }
  private rising(p: PlayerView, e: PetEnv) {
    const r = this.rise, u = clamp01(this.modeT / RISE_T);
    this.x = r.x0 + (r.x1 - r.x0) * u, this.z = r.z0 + (r.z1 - r.z0) * u;
    this.y = r.y0 + (r.y1 - r.y0) * u + Math.sin(u * Math.PI) * 2.4;
    this.move = 1;
    if (u >= 1) {
      this.brawl = newBrawl(this.x, this.y, this.z, this.fly, this.r);
      this.mode = 'fight', this.modeT = 0;
      kick(this.ball, this.fp, 6);
      void p, void e;
    }
  }

  // ---- El pleito ---------------------------------------------------------------------------------------------------
  private fight(dt: number, p: PlayerView, e: PetEnv) {
    const br = this.brawl!, E = this.brawlEnv(p, e);
    for (this.acc += dt; this.acc >= STEP && this.brawl; this.acc -= STEP) for (const v of stepBrawl(br, STEP, E)) this.onBrawl(v, p);
    this.x = br.x, this.y = br.y, this.z = br.z;
    if (!this.brawl) return;
    const toP = Math.atan2(p.x - br.x, p.z - br.z), ph = br.phase;
    const look = ph === 'lunge' || ph === 'recoil' ? Math.atan2(br.dx, br.dz) : ph === 'daze' ? this.face : toP;
    let da = look - this.face;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.face += da * Math.min(1, dt * (ph === 'windup' ? 14 : 8));
    this.move += ((ph === 'chase' || ph === 'lunge' ? 1 : 0) - this.move) * Math.min(1, dt * 10);
    const b = this.ball;
    b.x = br.x, b.y = br.y, b.z = br.z;
    relax(b, this.fp, dt);
  }

  // ---- Dibujo ----------------------------------------------------------------------------------------------------------
  private render(dt: number, p: PlayerView, e: PetEnv) {
    this.holder.visible = this.mode !== 'gone';
    for (const [m, c, i] of this.base) m.emissive.copy(c), m.emissiveIntensity = i;
    const care = this.care, k = care?.t ?? 0, head = care?.k === 'cabeza';
    const flying = this.mode === 'thrown' && this.ball.air > 0.1;
    this.b.anim(this.t, { move: this.move, mood: head ? 'love' : this.mood, moodT: head ? k : this.moodT });
    this.spin?.(this.t);
    const w = care && !head ? env(k, LOVE_T) : 0, br = this.brawl, ph = br?.phase;
    const daze = this.dizzy > 0 || ph === 'daze';
    // entrecierra los ojos con las caricias, los tiene a media asta mareada y bien abiertos volando
    if (w || daze || flying) for (const ey of this.b.eyes) ey.scale.y *= daze ? 0.35 + 0.25 * Math.abs(Math.sin(this.t * 7)) : flying ? 1.3 : 1 - 0.78 * w;
    // enojo: cejas, 💢, rojo y vapor
    const angry = (this.mode === 'fight' && ph !== 'daze') || this.mode === 'rise' || this.sulk > 0 ? 1 : 0;
    this.angryW += (angry - this.angryW) * Math.min(1, dt * 6);
    const aw = this.angryW;
    for (const bw of this.brows) bw.visible = aw > 0.3;
    this.vein.visible = aw > 0.3;
    if (this.vein.visible) this.vein.scale.setScalar(0.17 * (0.9 + 0.2 * Math.abs(Math.sin(this.t * (this.sulk > 0 ? 3 : 8)))) * Math.min(1, aw * 1.5));
    if (aw > 0.05) for (const [m] of this.base) { m.emissive.lerp(RED, 0.6 * aw); m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.55 * aw); }
    if (aw > 0.5 && this.sulk <= 0 && Math.random() < dt * 7) { const h = this.orient.localToWorld(this.top.clone()); this.onFx?.('steam', h.x, h.y, h.z); }
    // estrellitas del mareo
    this.stars.forEach((s, i) => {
      s.visible = daze;
      if (daze) { const a = this.t * 4 + (i / 3) * Math.PI * 2; s.position.set(this.top.x + Math.cos(a) * 0.18, this.top.y + 0.08 + Math.sin(a * 2) * 0.02, this.top.z + Math.sin(a) * 0.18); }
    });
    this.posture(dt, w, daze);
    // aplaste a lo largo de su eje (en el mundo)
    const bl = this.ball, a = 1 - bl.s, side = 1 / Math.sqrt(Math.max(0.25, a));
    this.sq1.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...bl.ax));
    this.sq2.scale.set(side, a, side);
    this.sq3.quaternion.copy(this.sq1.quaternion).invert();
    // orientación
    if (this.mode === 'thrown' || this.mode === 'held' || this.mode === 'hug') this.orient.quaternion.fromArray(bl.q);
    else if (this.rec) this.orient.quaternion.copy(this.rec.q0).slerp(yawQ(this.face, this.q), ease(clamp01(this.rec.t / 0.45)));
    else yawQ(this.face, this.orient.quaternion);
    this.holder.position.set(this.x, this.y, this.z);
    this.hands.forEach((h, i) => {
      h.visible = this.mode === 'held' || this.mode === 'hug';
      const sx = i ? -1 : 1;
      h.position.set(sx * (this.r + 0.01), -this.r * 0.35, 0.08);
      h.rotation.set(0.5, 0, -sx * Math.PI * 0.38); // por debajo de los costados, los dedos hacia adelante
      h.scale.set(1.5 * sx, 1.5, 1.5);
    });
    this.handFor(dt, care);
    this.telegraph(e);
    // corazones
    for (const q of this.hearts) {
      q.t += dt;
      q.s.position.x += q.vx * dt, q.s.position.z += q.vz * dt, q.s.position.y += (0.75 - q.t * 0.25) * dt;
      q.s.scale.setScalar(0.2 * Math.min(1, q.t * 6) * (1 + Math.sin(q.t * 9) * 0.06));
      (q.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - Math.max(0, q.t - 0.8) / 0.6);
    }
    this.hearts = this.hearts.filter(q => { if (q.t < 1.4) return true; this.root.remove(q.s); q.s.material.dispose(); return false; });
    void p;
  }

  // Las posturas: las de las caricias (salvo la cabeza, que es la reacción de cada una), mareada, el regreso y el pleito
  private posture(dt: number, w: number, daze: boolean) {
    const P = this.pose, c = this.care, k = c?.t ?? 0, ph = this.brawl?.phase, bt = this.brawl?.t ?? 0;
    P.position.set(0, 0, 0), P.rotation.set(0, 0, 0), P.scale.set(1, 1, 1);
    if (c?.k === 'menton') {
      P.rotation.x = -0.32 * w, P.rotation.z = Math.sin(k * 2.4) * 0.12 * w;   // estira el cuello y se hamaca
    } else if (c?.k === 'panza') {
      const u = ease(env(k, LOVE_T, 0.35, 0.4));
      P.rotation.x = PANZA[0] * u, P.rotation.z = PANZA[1] * u + Math.sin(k * 13) * 0.14 * u; // panza arriba, pataleando
      P.position.y = this.belly.lift * u;
    } else if (c?.k === 'cosquillas') {
      P.rotation.z = -c.side * 0.3 * w + Math.sin(k * 28) * 0.14 * w;          // se retuerce de risa, lejos de la mano
      P.position.x = -c.side * 0.05 * w, P.position.y = Math.abs(Math.sin(k * 11)) * 0.07 * w;
      if (Math.sin(k * 8) > 0.97) kick(this.ball, this.fp, 0.6);
    }
    if (daze) {
      const lie = ph === 'daze' ? ease(clamp01(bt / 0.3)) : 0;
      P.rotation.z += Math.PI / 2 * 0.85 * lie + Math.sin(this.t * 5) * 0.22;   // tirada de costado, dando vueltas
      P.rotation.x += Math.cos(this.t * 5) * 0.22;
    }
    if (this.mode === 'rise') P.rotation.x = -clamp01(this.modeT / RISE_T) * Math.PI * 2;
    if (this.rec) P.position.y += Math.sin(clamp01(this.rec.t / 0.45) * Math.PI) * 0.12;
    if (this.mode === 'held' && this.charge >= 0) P.rotation.z += Math.sin(this.t * 22) * 0.06 * this.power; // patalea esperando
    if (ph === 'enter' || ph === 'chase') { P.position.y += Math.abs(Math.sin(this.t * 13)) * 0.05; P.rotation.z += Math.sin(this.t * 26) * 0.05; }
    else if (ph === 'windup') {
      const u = clamp01(bt / BR.WIND);
      P.scale.set(1 + 0.14 * u, 1 - 0.24 * u, 1 + 0.14 * u);                   // se agacha y tiembla
      P.rotation.x = -0.28 * u, P.position.x = Math.sin(this.t * 70) * 0.025 * u;
    } else if (ph === 'lunge') { P.rotation.x = 0.55; P.scale.set(0.85, 0.85, 1.3); }
    else if (ph === 'recoil') P.rotation.x = -0.5 * (1 - clamp01(bt / BR.RECOIL));
    void dt;
  }

  // La mano de las caricias: palmaditas en la cabeza, rascadita bajo el mentón, círculos en la panza y cosquillas al costado
  private handFor(dt: number, c: PetCtl['care']) {
    const h = this.hand, m = c?.t ?? 9;
    h.visible = !!c && m < CARE_HAND && this.mode === 'follow';
    if (!h.visible || !c) return;
    h.scale.setScalar(Math.max(0.01, Math.min(1, m / 0.15, (CARE_HAND - m) / 0.2) * (c.k === 'cabeza' ? 1.7 : 1.35)));
    const T = this.top, Cn = this.chin;
    if (c.k === 'cabeza') {
      h.position.set(T.x, T.y + 0.08 + Math.abs(Math.cos(m * 9)) * 0.03, T.z - 0.1 + Math.sin(m * 9) * 0.07);
      h.rotation.set(0.15 + Math.sin(m * 9) * 0.15, 0, 0);
    } else if (c.k === 'menton') {
      // la palma para arriba bajo el mentón, los dedos rascando
      h.position.set(Cn.x, Cn.y - 0.06 + Math.sin(m * 16) * 0.008, Cn.z + 0.05 + Math.sin(m * 16) * 0.012);
      h.rotation.set(0.45 + Math.sin(m * 16) * 0.3, 0, Math.PI);
    } else if (c.k === 'panza') {
      // círculos sobre la panza
      const u = ease(env(m, LOVE_T, 0.35, 0.4));
      h.position.set(Math.cos(m * 7) * 0.06, this.belly.top * u + 0.05 + (1 - u) * (this.top.y + 0.12), 0.05 + Math.sin(m * 7) * 0.05);
      h.rotation.set(0.2, 0, 0);
    } else {
      const s = c.side;
      h.position.set(s * (this.r + 0.05) + Math.sin(m * 30) * 0.015, 0.02 + Math.sin(m * 25) * 0.015, 0.06);
      h.rotation.set(Math.sin(m * 30) * 0.35, s * Math.PI / 2, 0);
    }
    if ((this.heartT -= dt) <= 0 && m < 1.5) { this.heartT = c.k === 'menton' ? 0.32 : 0.22; this.addHeart(); }
    const f = c.k === 'cabeza' ? this.b.fx?.(m) : m > 0.2 && m < 1.8 && Math.random() < 0.14 ? { kind: (c.k === 'menton' ? 'notes' : c.k === 'panza' ? 'sparkle' : 'jelly') as FxKind, at: [0, 0, 0] as [number, number, number] } : null;
    if (f && this.onFx) { const wp = c.k === 'cabeza' ? this.b.g.localToWorld(new THREE.Vector3(...f.at)) : this.orient.localToWorld(h.position.clone()); this.onFx(f.kind, wp.x, wp.y, wp.z); }
  }

  // La franja que avisa la embestida
  private telegraph(e: PetEnv) {
    const br = this.brawl, s = this.stripe;
    s.visible = !!br && (br.phase === 'windup' || (br.phase === 'lunge' && br.run < br.len));
    if (!s.visible || !br) return;
    const h = Math.hypot(br.dx, br.dz) || 1, dx = br.dx / h, dz = br.dz / h, len = br.phase === 'windup' ? br.len * (br.fly ? Math.hypot(br.dx, br.dz) : 1) : br.len - br.run;
    s.position.set(br.x, e.groundAt(br.x, br.z) + 0.05, br.z);
    s.rotation.y = Math.atan2(-dx, -dz);
    s.scale.set(0.95, 1, Math.max(0.1, len));
    const u = br.phase === 'windup' ? clamp01(br.t / BR.WIND) : 1;
    const mt = s.material as THREE.MeshBasicMaterial;
    mt.opacity = (0.35 + 0.6 * u) * (0.8 + 0.2 * Math.sin(this.t * 30));
    mt.map!.repeat.set(1, Math.max(1, len / 0.9));
    mt.map!.offset.y = -this.t * 2.5;
  }

  dispose() {
    this.root.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); });
    for (const q of this.hearts) q.s.material.dispose();
    (this.stripe.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.stripe.material as THREE.Material).dispose();
  }
}
