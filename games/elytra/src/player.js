/* Modelo de vuelo arcade-físico: gravedad + arrastre cuadrático + redirección de la
   velocidad hacia el morro (sustentación), con plegado/frenado, aleteo, tonel
   lateral, impulso, pérdida, corrientes térmicas, efecto suelo, rebote en el agua
   y colisión por shape-cast contra el mundo Rapier (roce vs. choque). */
import * as THREE from 'three';
import { CFG, HALF } from './config.js';
import { castPlayer, nearestObstacle } from './physics.js';
import { surfaceHeight, groundHeight } from './terrain.js';
import { thermalLift } from './world.js';

export const player = {
  pos: new THREE.Vector3(),
  rpos: new THREE.Vector3(),   // posición de render: interpolada entre pasos fijos
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, roll: 0,
  bank: 0,
  energy: 100,
  tuck: 0, flare: 0,
  flap: 0, flapPhase: 0, flapCD: 0,
  rollT: 0, rollDir: 0,
  boostFlash: 0,
  g: 0,
  turnRate: 0,
  scrape: 0,
  nearDist: 99,
  nearT: 0,
  thermal: 0,
  groundDist: 999,
  speed: 0,
  prevYaw: 0,
  windRamp: 0,   // el viento entra suave tras reaparecer
};

const _fwd = new THREE.Vector3();
const _vd = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _n = new THREE.Vector3();
const _d = new THREE.Vector3();

export function forwardVector(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export function bodyAxes(outRight, outUp) {
  _e.set(player.pitch, player.yaw, player.roll, 'YXZ');
  _q.setFromEuler(_e);
  if (outRight) outRight.set(1, 0, 0).applyQuaternion(_q);
  if (outUp) outUp.set(0, 1, 0).applyQuaternion(_q);
}

export function resetPlayer(pos, dir, speed = 60) {
  player.pos.copy(pos);
  player.rpos.copy(pos);
  player.vel.copy(dir).normalize().multiplyScalar(speed);
  player.yaw = Math.atan2(-dir.x, -dir.z);
  player.pitch = Math.asin(THREE.MathUtils.clamp(dir.y / dir.length(), -1, 1)) * 0.5;
  player.roll = player.bank = 0;
  player.prevYaw = player.yaw;
  player.energy = 100;
  player.rollT = 0;
  player.flap = 0;
  player.boostFlash = 0;
  player.tuck = player.flare = 0;
  player.windRamp = 0;
  player.nearT = 0;      // sin esto, una rasante cortada por un choque "terminaba" al reaparecer
  player.nearDist = 99;
}

/* ── Habilidades ──────────────────────────────────────────── */
export function tryBoost() {
  if (player.energy < CFG.BOOST_COST) return false;
  player.energy -= CFG.BOOST_COST;
  forwardVector(player.yaw, player.pitch, _fwd);
  const spd = player.vel.length();
  if (spd > 20) _fwd.lerp(_vd.copy(player.vel).divideScalar(spd), 0.45).normalize();
  player.vel.addScaledVector(_fwd, CFG.BOOST_IMPULSE);
  player.boostFlash = 1;
  return true;
}

export function tryFlap() {
  if (player.flapCD > 0 || player.energy < CFG.FLAP_COST) return false;
  player.energy -= CFG.FLAP_COST;
  player.flapCD = CFG.FLAP_COOLDOWN;
  player.flap = 1;
  player.flapPhase = 0;
  const up = new THREE.Vector3();
  bodyAxes(null, up);
  forwardVector(player.yaw, player.pitch, _fwd);
  // Aletazo: más efectivo cuanto más lento vas (recuperación de pérdida)
  const k = 1 + Math.max(0, 1 - player.vel.length() / 60);
  player.vel.addScaledVector(up, CFG.FLAP_IMPULSE * k).addScaledVector(_fwd, 6);
  return true;
}

export function tryBarrelRoll(dir) {
  if (player.rollT > 0 || player.energy < CFG.ROLL_COST) return false;
  player.energy -= CFG.ROLL_COST;
  player.rollT = CFG.ROLL_TIME;
  player.rollDir = dir;
  const right = new THREE.Vector3();
  bodyAxes(right, null);
  right.y *= 0.3;
  player.vel.addScaledVector(right.normalize(), CFG.ROLL_IMPULSE * dir);
  return true;
}

export function addCrystal() {
  player.energy = Math.min(100, player.energy + CFG.CRYSTAL_ENERGY);
  forwardVector(player.yaw, player.pitch, _fwd);
  player.vel.addScaledVector(_fwd, CFG.CRYSTAL_IMPULSE);
  player.boostFlash = Math.max(player.boostFlash, 0.7);
}

/* ── Paso de física (dt fijo). Devuelve un evento o null. ──── */
let nearTimer = 0;

export function stepFlight(dt, input) {
  const p = player;
  forwardVector(p.yaw, p.pitch, _fwd);

  // Postura (suavizada)
  const k = Math.min(1, dt * 9);
  p.tuck += ((input.tuck ? 1 : 0) - p.tuck) * k;
  p.flare += ((input.flare ? 1 : 0) - p.flare) * k;

  // Gravedad + corriente térmica
  p.vel.y -= CFG.GRAVITY * dt;
  p.thermal = thermalLift(p.pos);
  if (p.thermal > 0) p.vel.y += CFG.THERMAL_LIFT * p.thermal * dt;
  // Viento del circuito: la masa de aire arrastra al piloto (deriva) sin importar el
  // rumbo; un empuje sobre vel se perdía porque la sustentación lo realinea al morro
  if (input.wind) p.windRamp = Math.min(1, p.windRamp + dt / 1.5);

  // Efecto suelo
  p.groundDist = p.pos.y - surfaceHeight(p.pos.x, p.pos.z);
  const ground = p.groundDist < 16 ? 1 - p.groundDist / 16 : 0;

  // Arrastre
  let spd = p.vel.length();
  const dragMul = THREE.MathUtils.lerp(1, CFG.TUCK_DRAG, p.tuck) * THREE.MathUtils.lerp(1, CFG.FLARE_DRAG, p.flare) * (1 - ground * 0.25);
  if (spd > 1e-4) p.vel.multiplyScalar(Math.max(0, 1 - CFG.DRAG * dragMul * spd * dt));

  // Sustentación: girar la velocidad hacia el morro
  spd = p.vel.length();
  p.turnRate = 0;
  if (spd > 0.8) {
    _vd.copy(p.vel).divideScalar(spd);
    const angle = Math.acos(THREE.MathUtils.clamp(_vd.dot(_fwd), -1, 1));
    if (angle > 1e-4) {
      const auth = THREE.MathUtils.clamp(spd / CFG.MIN_AIRSPEED, 0, 1);
      const authCurve = 0.14 + 0.86 * Math.pow(auth, 0.8);
      const rate = CFG.TURN_RATE * (1 + p.flare * (CFG.FLARE_TURN - 1)) * (1 - p.tuck * 0.35);
      const turn = Math.min(angle, rate * authCurve * dt);
      _ax.crossVectors(_vd, _fwd);
      if (_ax.lengthSq() > 1e-12) {
        _ax.normalize();
        _vd.applyQuaternion(_q.setFromAxisAngle(_ax, turn));
        const bleed = 1 - CFG.TURN_BLEED * turn * (1 + p.flare);
        p.vel.copy(_vd).multiplyScalar(spd * bleed);
        p.turnRate = turn / dt;
      }
    }
  }
  // Carga relativa a la gravedad del juego: planeo recto ≈ 1 G
  p.g = (p.turnRate * spd) / CFG.GRAVITY;

  // Pérdida: el morro cae solo
  if (spd < CFG.STALL_SPEED) {
    p.pitch -= (1 - spd / CFG.STALL_SPEED) * 1.4 * dt;
    p.pitch = Math.max(p.pitch, -1.45);
  }

  // Temporizadores
  p.flapCD = Math.max(0, p.flapCD - dt);
  p.flap = Math.max(0, p.flap - dt * 2.2);
  p.flapPhase += dt * 16;
  p.rollT = Math.max(0, p.rollT - dt);
  p.boostFlash = Math.max(0, p.boostFlash - dt * 2.2);
  p.energy = Math.min(100, p.energy + CFG.BOOST_REGEN * dt * (1 + ground * 0.8));
  p.scrape = Math.max(0, p.scrape - dt * 4);

  // Límites del mundo (empuje suave) y techo
  const LIM = HALF * 0.9;
  if (Math.abs(p.pos.x) > LIM) p.vel.x -= Math.sign(p.pos.x) * 60 * dt;
  if (Math.abs(p.pos.z) > LIM) p.vel.z -= Math.sign(p.pos.z) * 60 * dt;
  if (p.pos.y > 1500) p.vel.y = Math.min(p.vel.y, -5);

  // ── Colisión ──
  _d.copy(p.vel).multiplyScalar(dt);
  if (input.wind) _d.addScaledVector(input.wind, CFG.WIND_DRIFT * p.windRamp * dt);
  const hit = castPlayer(p.pos, _d, CFG.PLAYER_RADIUS);
  let ev = null;
  if (hit && hit.time_of_impact <= 1) {
    const n2 = hit.normal2;
    _n.set(-n2.x, -n2.y, -n2.z).normalize();
    const impact = -p.vel.dot(_n);
    const kind = hit.collider.userData?.kind;
    const headOn = _fwd.dot(_n) < -0.75;
    p.pos.addScaledVector(_d, Math.max(0, hit.time_of_impact - 0.02));
    if (kind === 'tree' || impact > CFG.CRASH_SPEED || (headOn && impact > 12)) {
      ev = { type: 'crash', pos: p.pos.clone(), vel: p.vel.clone(), normal: _n.clone(), collider: hit.collider, impact };
      return ev;
    }
    // Roce: deslizar sobre la superficie
    if (impact > 0) p.vel.addScaledVector(_n, impact * 1.15);
    p.vel.multiplyScalar(1 - CFG.SCRAPE_LOSS * Math.min(1, impact / 10) - 0.004);
    p.pos.addScaledVector(_n, 0.05);
    p.scrape = Math.min(1, p.scrape + 0.5 + impact * 0.05);
    ev = { type: 'scrape', pos: p.pos.clone().addScaledVector(_n, -CFG.PLAYER_RADIUS), normal: _n.clone(), impact };
  } else {
    p.pos.add(_d);
  }

  // Agua: rebote si entras rasante, choque si entras en picado
  const gh = groundHeight(p.pos.x, p.pos.z);
  if (p.pos.y < CFG.WATER + 0.6 && gh < CFG.WATER) {
    if (p.vel.y < -30) {
      return { type: 'crash', pos: p.pos.clone(), vel: p.vel.clone(), normal: new THREE.Vector3(0, 1, 0), water: true, impact: -p.vel.y };
    }
    p.pos.y = CFG.WATER + 0.6;
    p.vel.y = Math.abs(p.vel.y) * 0.45 + 2;
    p.vel.multiplyScalar(0.9);
    ev = { type: 'splash', pos: p.pos.clone() };
  }
  // Seguridad: nunca bajo el terreno
  if (p.pos.y < gh + 0.3) {
    return { type: 'crash', pos: p.pos.clone(), vel: p.vel.clone(), normal: new THREE.Vector3(0, 1, 0), impact: 99 };
  }

  // Rasante: distancia al obstáculo más cercano (muestreo cada 50 ms)
  nearTimer -= dt;
  if (nearTimer <= 0) {
    nearTimer = 0.05;
    p.nearDist = spd > 45 ? nearestObstacle(p.pos, 14) : 99;
  }
  if (p.nearDist < 9) {
    p.nearT += dt;
    p.energy = Math.min(100, p.energy + dt * 30);
  } else if (p.nearT > 0 && !ev) {
    const t = p.nearT;
    p.nearT = 0;
    if (t > 0.25) ev = { type: 'near', time: t };
  }
  return ev;
}

/* Alabeo visual: inclinación por giro + tonel. Llamar por frame. */
export function updateBank(dt, input) {
  const p = player;
  let dy = p.yaw - p.prevYaw;
  if (dy > Math.PI) dy -= Math.PI * 2;
  if (dy < -Math.PI) dy += Math.PI * 2;
  p.prevYaw = p.yaw;
  const yawRate = dy / Math.max(dt, 1e-4);
  const target = THREE.MathUtils.clamp(yawRate * 0.45 + (input.bank || 0) * 0.5, -1.2, 1.2);
  p.bank += (target - p.bank) * Math.min(1, dt * 6);
  let roll = p.bank;
  if (p.rollT > 0) {
    const t = 1 - p.rollT / CFG.ROLL_TIME;
    const e = t * t * (3 - 2 * t);
    roll -= p.rollDir * e * Math.PI * 2;
  }
  p.roll = roll;
  p.speed = p.vel.length();
}
