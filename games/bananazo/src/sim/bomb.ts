// La bomba: módulos + reloj + errores + peligros del lugar. Pura y en datos planos (viaja entera en JSON); la corre solo el
// anfitrión. step(b, dt, acts) aplica las acciones, corre lo que se mueve solo y devuelve los eventos (sonidos, errores,
// módulos listos, peligros) que el cliente de cada uno muestra o hace sonar según su papel.
import { rng, hash, range, type Rng } from './rng.ts';
import { tables } from './tables.ts';
import { genMod, actMod, tickMod, solveMod, isChaos, type Mod, type Kind, type Ev, type Act } from './mods.ts';
import type { Role } from './const.ts';

export type Hazard = 'bache' | 'radio' | 'apagon';
export const HAZARDS: readonly Hazard[] = ['bache', 'radio', 'apagon'];
export const HAZARD_NAME: Record<Hazard, string> = { bache: 'BACHES', radio: 'RADIO', apagon: 'APAGONES' };
export type Env = 'combi' | 'avion' | 'tren';
export const ENV_NAME: Record<Env, string> = { combi: 'LA COMBI', avion: 'LA AVIONETA', tren: 'EL TREN' };

// time: segundos; miss: errores permitidos (uno más y explota); chaos: ritmo de los módulos de caos (1 = normal)
export type Spec = { mods: Kind[], time: number, miss: number, hz: Hazard[], env: Env, chaos: number };
export type HzState = { bump: number, radio: boolean, radioT: number, dark: number, darkT: number };
export type Bomb = {
  seed: number, spec: Spec, mods: Mod[], time: number, t: number, strikes: number,
  over: 0 | 1 | -1, why: '' | 'tiempo' | 'errores', hz: HzState, rs: number,
};

export const MAX_MODS = 6;
export const speedOf = (b: Bomb) => 1 + 0.2 * b.strikes; // cada error acelera el reloj

export function newBomb(spec: Spec, seed: number): Bomb {
  const r = rng(hash(seed, 0x68617a));
  return {
    seed, spec: { ...spec, mods: spec.mods.slice(0, MAX_MODS), hz: spec.hz.slice() },
    mods: spec.mods.slice(0, MAX_MODS).map((k, i) => genMod(k, rng(hash(seed, i + 1, k.length)))),
    time: spec.time, t: 0, strikes: 0, over: 0, why: '',
    hz: { bump: range(r, 10, 20), radio: false, radioT: range(r, 18, 30), dark: 0, darkT: range(r, 25, 40) },
    rs: r.s,
  };
}

// Quién puede qué: la bomba la toca solo el CIEGO; la radio la apaga el SORDO (es el único que la ve prendida).
export const allowed = (role: Role, a: Act) => a.m === -1 ? a.a === 'radio' && role === 'sordo' : role === 'ciego';

export function step(b: Bomb, dt: number, acts: readonly Act[] = []): Ev[] {
  const out: Ev[] = [];
  if (b.over) return out;
  const r: Rng = { s: b.rs }, tb = tables(b.seed);
  const strike = (m: number) => {
    b.strikes++;
    out.push({ e: 'strike', m });
    if (b.strikes > b.spec.miss && !b.over) { b.over = -1, b.why = 'errores'; out.push({ e: 'boom', s: 'errores' }); }
  };
  const ctx = (m: number) => ({
    tb, r, chaos: b.spec.chaos,
    strike: () => strike(m),
    ok: () => { b.mods[m].done = true; out.push({ e: 'ok', m }); },
    ev: (e: Ev) => out.push({ ...e, m }),
  });
  for (const a of acts) {
    if (b.over) break;
    if (a.m === -1) {
      if (a.a === 'radio' && b.hz.radio) { b.hz.radio = false, b.hz.radioT = range(r, 30, 55); out.push({ e: 'radio', v: 0 }); }
      continue;
    }
    const m = b.mods[a.m];
    if (!m || m.done) continue;
    actMod(m, a.a, Number.isFinite(a.v) ? a.v! : -1, ctx(a.m));
  }
  if (!b.over && b.mods.some(m => !isChaos(m.k)) && b.mods.every(m => m.done || isChaos(m.k))) {
    b.over = 1;
    out.push({ e: 'win' });
  }
  if (!b.over) {
    b.mods.forEach((m, i) => { if (!m.done && !b.over) tickMod(m, dt, ctx(i)); });
    const hz = b.hz, on = (h: Hazard) => b.spec.hz.includes(h);
    if (on('bache') && (hz.bump -= dt) <= 0) { hz.bump = range(r, 12, 26); out.push({ e: 'bump', v: Math.floor(range(r, 0, 1000)) }); }
    if (on('radio') && !hz.radio && (hz.radioT -= dt) <= 0) { hz.radio = true; out.push({ e: 'radio', v: 1 }); }
    if (on('apagon')) {
      if (hz.dark > 0) { if ((hz.dark -= dt) <= 0) { hz.dark = 0, hz.darkT = range(r, 35, 60); out.push({ e: 'dark', v: 0 }); } }
      else if ((hz.darkT -= dt) <= 0) { hz.dark = range(r, 8, 12); out.push({ e: 'dark', v: 1 }); }
    }
    b.t += dt;
    if ((b.time -= dt * speedOf(b)) <= 0) { b.time = 0, b.over = -1, b.why = 'tiempo'; out.push({ e: 'boom', s: 'tiempo' }); }
  }
  b.rs = r.s;
  return out;
}

// La próxima acción correcta (piloto automático de la práctica y pruebas): primero el caos que apura, después el primer
// módulo sin terminar.
export function nextAct(b: Bomb): Act | null {
  const tb = tables(b.seed);
  for (const urgent of [true, false]) {
    for (let m = 0; m < b.mods.length; m++) {
      const md = b.mods[m];
      if (md.done || isChaos(md.k) !== urgent) continue;
      const s = solveMod(md, tb);
      if (s.length) return { m, ...s[0] };
    }
  }
  if (b.hz.radio) return { m: -1, a: 'radio' };
  return null;
}
