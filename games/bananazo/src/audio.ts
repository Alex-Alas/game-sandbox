// Sonido procedural con Web Audio (sin archivos), filtrado por papel:
//  - el SORDO no oye nada (ni la bomba, ni la radio, ni las voces);
//  - el CIEGO oye todo, también los sonidos chiquitos que se descubren tocando (timbre, morse, zumbido de la ruleta);
//  - el MUDO oye lo fuerte (tic tac, errores, piano, presión, alarma, radio, el motor) pero no lo chiquito.
// En la sala (fuera de la bomba) todos oyen todo.
import type { Role } from './sim/const.ts';
import type { Env } from './sim/bomb.ts';

type Who = 'c' | 'cm';
let ac: AudioContext | null = null, master: GainNode | null = null, sfx: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
let listener: Role | 'todos' = 'todos';
const VOL = 0.8;
const loops: Record<string, { stop(): void, set?(v: number): void } | null> = {};

export function unlock() {
  if (ac) { if (ac.state === 'suspended') void ac.resume(); return; }
  try { ac = new AudioContext(); } catch { return; }
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12, comp.ratio.value = 4;
  master = ac.createGain(); sfx = ac.createGain();
  sfx.connect(comp); comp.connect(master); master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  apply();
}
export const ctx = () => ac;
// Quién escucha: cambia en vivo (la práctica pasa de un papel a otro)
export function setListener(r: Role | 'todos') { listener = r; apply(); }
function apply() { if (master && ac) master.gain.setTargetAtTime(listener === 'sordo' ? 0 : VOL, ac.currentTime, 0.05); }
const can = (w: Who) => !!ac && !!sfx && listener !== 'sordo' && (w === 'cm' || listener === 'ciego' || listener === 'todos');

function tone(type: OscillatorType, f0: number, f1: number, dur: number, v: number, delay = 0, out: AudioNode | null = sfx) {
  if (!ac || !out) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, f0: number, f1: number, v: number, type: BiquadFilterType = 'lowpass', delay = 0, q = 0.8) {
  if (!ac || !noiseBuf || !sfx) return;
  const t = ac.currentTime + delay, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(sfx); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

// ---- Sonidos sueltos ---------------------------------------------------------------------------------------------
const NOTE_HZ = [261.6, 293.7, 329.6, 349.2, 392, 440, 493.9];
export const S = {
  click() { if (can('c')) { tone('square', 1800, 900, 0.03, 0.08); noise(0.03, 3000, 1500, 0.08, 'bandpass'); } },
  key(v: number) { if (can('c')) { tone('sine', 900 + (v < 0 ? 0 : v * 40), 880, 0.06, 0.12); noise(0.02, 4000, 2000, 0.06, 'highpass'); } },
  cut() { if (can('c')) { noise(0.09, 6000, 2500, 0.35, 'highpass'); tone('triangle', 2400, 1200, 0.05, 0.1); } },
  flip() { if (can('c')) { noise(0.03, 2500, 900, 0.3, 'bandpass', 0, 4); tone('square', 300, 200, 0.04, 0.12); } },
  slide() { if (can('c')) noise(0.16, 900, 2400, 0.2, 'bandpass', 0, 3); },
  turn() { if (can('c')) for (let k = 0; k < 3; k++) noise(0.02, 3500, 2500, 0.18, 'bandpass', k * 0.035, 5); },
  wall() { if (can('c')) { tone('sawtooth', 120, 70, 0.18, 0.25); noise(0.1, 600, 200, 0.2); } },
  pump() { if (can('cm')) noise(0.25, 1800, 400, 0.3, 'bandpass', 0, 1.5); },
  stage() { if (can('c')) { tone('sine', 880, 880, 0.08, 0.15); tone('sine', 1320, 1320, 0.12, 0.12, 0.07); } },
  ok() { if (can('cm')) [523, 659, 784, 1047].forEach((f, k) => tone('triangle', f, f, 0.35, 0.18, k * 0.07)); },
  strike() { if (can('cm')) { tone('square', 220, 110, 0.45, 0.32); tone('sawtooth', 233, 116, 0.45, 0.18); noise(0.2, 1200, 200, 0.2); } },
  tick(fast: boolean) { if (can('cm')) { noise(0.025, 3200, 2200, fast ? 0.32 : 0.22, 'bandpass', 0, 6); tone('sine', fast ? 1900 : 1500, 1400, 0.03, 0.05); } },
  note(k: number, oct: number) {
    if (!can('cm')) return;
    const f = NOTE_HZ[k] * [0.5, 1, 2][oct - 1];
    tone('triangle', f, f, 0.9, 0.22); tone('sine', f * 2, f * 2, 0.5, 0.07); tone('sine', f * 3, f * 3, 0.25, 0.03);
  },
  bell() { if (can('c')) for (let k = 0; k < 8; k++) { tone('square', 2200, 2150, 0.045, 0.06, k * 0.06); tone('sine', 1650, 1600, 0.05, 0.1, k * 0.06 + 0.03); } },
  buzz() { if (can('c')) { tone('sawtooth', 96, 92, 0.45, 0.14); tone('square', 48, 47, 0.45, 0.06); } },
  vent() { if (can('cm')) { noise(1.2, 4000, 300, 0.5, 'highpass'); tone('sawtooth', 300, 60, 0.6, 0.15); } },
  bump() { if (can('cm')) { tone('sine', 90, 40, 0.35, 0.6); noise(0.25, 500, 80, 0.45); noise(0.12, 3000, 1000, 0.12, 'bandpass', 0.05); } },
  dark() { if (can('cm')) { tone('sawtooth', 220, 40, 0.8, 0.2); noise(0.3, 2000, 200, 0.15); } },
  light() { if (can('cm')) { tone('square', 60, 120, 0.3, 0.1); noise(0.08, 5000, 3000, 0.08, 'highpass'); } },
  slap() { if (can('cm')) { noise(0.12, 5000, 900, 0.6, 'bandpass', 0, 1.2); tone('sine', 320, 120, 0.22, 0.25); tone('triangle', 500, 900, 0.18, 0.1, 0.05); } },
  boom() {
    if (!can('cm')) return;
    noise(2.2, 1800, 40, 1); noise(0.6, 6000, 400, 0.5, 'highpass'); tone('sine', 70, 28, 1.6, 0.9);
  },
  win() { if (can('cm')) [392, 523, 659, 784, 659, 784, 1047].forEach((f, k) => tone('square', f, f, 0.16, 0.09, k * 0.11)); },
  join() { if (can('cm')) { tone('sine', 660, 990, 0.12, 0.12); } },
};

// Morse: '.' corto, '-' largo (solo el CIEGO, pegado al enchufe)
export function morse(code: string) {
  if (!can('c') || !ac) return 0;
  let t = 0;
  for (const c of code) { const d = c === '.' ? 0.12 : 0.36; tone('sine', 680, 680, d, 0.22, t); t += d + 0.14; }
  return t;
}

// ---- Sonidos que duran -------------------------------------------------------------------------------------------
function loopNoise(f: number, q: number, type: BiquadFilterType) {
  if (!ac || !noiseBuf || !sfx) return null;
  const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf; src.loop = true; flt.type = type; flt.frequency.value = f; flt.Q.value = q; g.gain.value = 0;
  src.connect(flt).connect(g).connect(sfx); src.start();
  return { src, flt, g };
}
// Siseo de la presión: más fuerte y agudo cuanto más cerca del límite
export function hiss(p: number | null) {
  if (!ac) return;
  if (p == null || !can('cm')) { loops.hiss?.stop(); loops.hiss = null; return; }
  if (!loops.hiss) {
    const n = loopNoise(1200, 1.2, 'bandpass');
    if (!n) return;
    loops.hiss = { stop: () => { n.g.gain.setTargetAtTime(0, ac!.currentTime, 0.05); n.src.stop(ac!.currentTime + 0.3); }, set: (v) => {
      n.g.gain.setTargetAtTime(0.02 + v * v * 0.35, ac!.currentTime, 0.1);
      n.flt.frequency.setTargetAtTime(600 + v * 3600, ac!.currentTime, 0.1);
    } };
  }
  loops.hiss.set!(p);
}
// Sirena de la alarma
export function siren(on: boolean) {
  if (!ac || !sfx) return;
  if (!on || !can('cm')) { loops.siren?.stop(); loops.siren = null; return; }
  if (loops.siren) return;
  const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
  o.type = 'sawtooth'; o.frequency.value = 760; lfo.frequency.value = 1.6; lg.gain.value = 260; g.gain.value = 0.07;
  lfo.connect(lg).connect(o.frequency); o.connect(g).connect(sfx); o.start(); lfo.start();
  loops.siren = { stop: () => { g.gain.setTargetAtTime(0, ac!.currentTime, 0.05); o.stop(ac!.currentTime + 0.3); lfo.stop(ac!.currentTime + 0.3); } };
}
// Motor del lugar (combi: ronroneo; avioneta: zumbido; tren: traqueteo)
export function ambient(env: Env | null) {
  if (!ac || !sfx) return;
  loops.amb?.stop(); loops.amb = null;
  if (!env || !can('cm')) return;
  const n = loopNoise(env === 'avion' ? 260 : 140, env === 'avion' ? 2 : 0.7, 'lowpass');
  if (!n) return;
  n.g.gain.value = env === 'avion' ? 0.12 : 0.16;
  let timer = 0;
  if (env === 'tren') {
    const beat = () => { noise(0.08, 400, 120, 0.18); noise(0.08, 400, 120, 0.14, 'lowpass', 0.18); timer = setTimeout(beat, 900) as unknown as number; };
    beat();
  } else {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = env === 'avion' ? 110 : 52; g.gain.value = 0.025;
    o.connect(g).connect(sfx); o.start();
    const old = n.src.stop.bind(n.src);
    n.src.stop = (w?: number) => { o.stop(w); old(w); };
  }
  loops.amb = { stop: () => { clearTimeout(timer); n.g.gain.setTargetAtTime(0, ac!.currentTime, 0.1); n.src.stop(ac!.currentTime + 0.4); } };
}
// La radio de la combi: una cumbia procedural a todo volumen (tapa voces y sonidos chicos)
export function radio(on: boolean) {
  if (!ac || !sfx) return;
  if (!on || !can('cm')) { loops.radio?.stop(); loops.radio = null; return; }
  if (loops.radio) return;
  const bus = ac.createGain(), band = ac.createBiquadFilter();
  bus.gain.value = 0.55; band.type = 'bandpass'; band.frequency.value = 1100; band.Q.value = 0.6;
  bus.connect(band).connect(sfx);
  const bass = [55, 55, 82.4, 73.4, 61.7, 61.7, 82.4, 73.4], lead = [659, 784, 880, 784, 659, 587, 523, 587, 659, 0, 659, 784, 880, 988, 880, 784];
  let k = 0, alive = true;
  const beat = 0.16;
  const stepFn = () => {
    if (!alive || !ac) return;
    const at = 0.02;
    if (k % 2 === 0) tone('triangle', bass[(k / 2) % 8 | 0], bass[(k / 2) % 8 | 0], beat * 1.8, 0.5, at, bus);
    if (k % 4 === 2) noise(0.05, 7000, 4000, 0.3, 'highpass', at);
    if (k % 2 === 1) noise(0.04, 3000, 1500, 0.25, 'bandpass', at, 3);
    const f = lead[k % 16]; if (f) tone('square', f, f, beat * 0.9, 0.12, at, bus);
    k++;
    setTimeout(stepFn, beat * 1000);
  };
  stepFn();
  loops.radio = { stop: () => { alive = false; bus.gain.setTargetAtTime(0, ac!.currentTime, 0.05); } };
}
export function stopAll() { for (const k of Object.keys(loops)) { loops[k]?.stop(); loops[k] = null; } }

// Voz sintética: lo que el SORDO escribe le llega al CIEGO hablado (no lo puede leer)
let voice: SpeechSynthesisVoice | null = null, primed = false;
// iOS solo habla si la primera frase sale de un toque: una vacía al primer toque destraba las de después
export function primeSpeech() {
  if (primed || typeof speechSynthesis === 'undefined') return;
  primed = true;
  try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; speechSynthesis.speak(u); } catch { /* */ }
}
export function say(text: string) {
  const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  if (!ss || listener === 'sordo') return;
  if (!voice) voice = ss.getVoices().find(v => v.lang.startsWith('es')) ?? null;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? 'es-ES'; if (voice) u.voice = voice;
  u.rate = 1.05;
  ss.speak(u);
}
