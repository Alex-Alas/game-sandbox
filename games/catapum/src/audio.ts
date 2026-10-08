// Sonido procedural con Web Audio (sin archivos): explosiones de ruido filtrado, saltos y dashes con barridos,
// golpes con más cuerpo según el empuje, chapuzones, el silbato del tren y una música de batalla por pasos.
import type { Ev, State } from './sim/state.ts';
import { S } from './settings.ts';

let ac: AudioContext | null = null, master: GainNode | null = null, sfxBus: GainNode | null = null, musBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null, comp: DynamicsCompressorNode | null = null;
let last: Record<string, number> = {};

export function unlock() {
  if (ac) { if (ac.state === 'suspended') void ac.resume(); return; }
  try { ac = new AudioContext(); } catch { return; }
  comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14, comp.ratio.value = 4;
  master = ac.createGain(); master.gain.value = 1;
  sfxBus = ac.createGain(); musBus = ac.createGain();
  sfxBus.connect(comp); musBus.connect(comp); comp.connect(master); master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  volumes();
}
export function volumes() {
  if (!sfxBus || !musBus) return;
  sfxBus.gain.value = S.sfx * 0.9;
  musBus.gain.value = S.music * 0.35;
}

// Límite por tipo de sonido: no más de uno cada `gap` s (las cadenas de explosiones no saturan)
function ok(k: string, gap: number) {
  if (!ac) return false;
  const t = ac.currentTime;
  if ((last[k] ?? -1) > t - gap) return false;
  last[k] = t;
  return true;
}
function noise(dur: number, f0: number, f1: number, vol: number, type: BiquadFilterType = 'lowpass', q = 0.8) {
  if (!ac || !noiseBuf || !sfxBus) return;
  const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf, src.loop = true;
  f.type = type, f.Q.value = q;
  f.frequency.setValueAtTime(f0, t), f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t), g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t, Math.random() * 0.5), src.stop(t + dur + 0.05);
}
function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, bus = sfxBus) {
  if (!ac || !bus) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t), o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t), g.gain.exponentialRampToValueAtTime(vol, t + 0.008), g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t), o.stop(t + dur + 0.05);
}

export function boom(r: number) {
  if (!ok('boom', 0.04)) return;
  const big = Math.min(1, r / 4);
  noise(0.35 + big * 0.6, 2200 - big * 900, 60, 0.6 + big * 0.4);
  tone('sine', 110 - big * 40, 30, 0.3 + big * 0.4, 0.6 + big * 0.3);
}
export function ui(k: 'click' | 'back' | 'ok' | 'tick' | 'go') {
  if (!ac) return;
  if (k === 'click') tone('square', 660, 880, 0.05, 0.08);
  if (k === 'back') tone('square', 520, 330, 0.07, 0.08);
  if (k === 'ok') { tone('square', 523, 523, 0.08, 0.1); tone('square', 784, 784, 0.12, 0.1, 0.08); }
  if (k === 'tick') tone('square', 880, 880, 0.06, 0.12);
  if (k === 'go') { tone('sawtooth', 220, 880, 0.3, 0.15); noise(0.4, 3000, 200, 0.4); }
}

export function fromEvents(evs: Ev[], s: State, me: number) {
  if (!ac) return;
  for (const e of evs) {
    const mine = e.p === me;
    switch (e.k) {
      case 'boom': boom(e.r as number); break;
      case 'jump': if (ok('jump' + e.p, 0.05)) tone('square', e.j === 1 ? 500 : e.j === 2 ? 420 : 300, e.j === 1 ? 900 : 700, 0.12, mine ? 0.09 : 0.04); break;
      case 'dash': if (ok('dash', 0.03)) noise(0.18, 600, 3000, mine ? 0.25 : 0.12, 'bandpass', 2); break;
      case 'slide': noise(0.25, 1200, 400, mine ? 0.15 : 0.07, 'bandpass', 1); break;
      case 'pound': tone('sawtooth', 400, 90, 0.25, mine ? 0.12 : 0.06); break;
      case 'land': if (ok('land', 0.05)) noise(0.12, 500, 100, 0.12); break;
      case 'hook': tone('triangle', e.hit ? 1200 : 700, e.hit ? 500 : 300, 0.1, mine ? 0.12 : 0.05); break;
      case 'hit': {
        if (!ok('hit', 0.03)) break;
        const v = e.v as number, k = Math.min(1, v / 30);
        noise(0.08 + k * 0.15, 3000, 300, 0.3 + k * 0.4, 'bandpass', 1.5);
        tone('square', 180 + k * 60, 60, 0.1 + k * 0.15, 0.15 + k * 0.15);
        if (v > 25) tone('sawtooth', 1200, 200, 0.4, 0.12); // ¡PAF! de los que vuelan
        break;
      }
      case 'ko': {
        const how = e.how as string;
        if (how === 'agua' || how === 'lava') { noise(0.7, 1500, 150, 0.7); tone('sine', 300, 80, 0.5, 0.3); }
        else { tone('sawtooth', 900, 1800, 0.25, 0.2); tone('sine', 1800, 2400, 0.4, 0.15, 0.1); }
        if (e.by === me && me >= 0) { tone('square', 784, 784, 0.1, 0.15, 0.15); tone('square', 1047, 1047, 0.2, 0.15, 0.25); }
        break;
      }
      case 'cast': if (ok('cast', 0.04)) tone('triangle', 500, 900, 0.07, mine ? 0.12 : 0.05); break;
      case 'trick': if (mine) tone('square', 880, 1320, 0.09, 0.08); break;
      case 'splash': if (ok('splash', 0.08)) noise(0.3, 1200, 200, 0.2); break;
      case 'pick': tone('square', 660, 660, 0.06, 0.12); tone('square', 990, 990, 0.1, 0.12, 0.06); break;
      case 'heal': tone('sine', 500, 1000, 0.3, 0.15); break;
      case 'block': case 'deflect': tone('square', 1500, 900, 0.1, 0.12); break;
      case 'ulti': tone('sawtooth', 200, 1200, 0.5, 0.18); noise(0.6, 400, 4000, 0.25, 'bandpass', 1); break;
      case 'ray': if (ok('ray', 0.06)) tone('sawtooth', e.kind === 'iman' ? 300 : 1800, e.kind === 'iman' ? 900 : 300, 0.2, 0.12); break;
      case 'tele': case 'swap': tone('sine', 400, 1600, 0.2, 0.15); break;
      case 'whistle': tone('square', 880, 860, 0.5, 0.15); tone('square', 1100, 1080, 0.5, 0.12); tone('square', 880, 860, 0.6, 0.15, 0.6); break;
      case 'wind': noise(1.2, 300, 900, 0.2, 'bandpass', 0.6); break;
      case 'rumble': noise(1, 120, 60, 0.4); break;
      case 'pad': tone('sine', 300, 900, 0.18, 0.15); break;
      case 'spawn': if (mine) tone('triangle', 400, 800, 0.15, 0.1); break;
      case 'go': ui('go'); break;
      case 'sudden': tone('sawtooth', 110, 55, 1, 0.25); break;
      case 'end': tone('square', 523, 523, 0.15, 0.15); tone('square', 659, 659, 0.15, 0.15, 0.15); tone('square', 784, 784, 0.4, 0.15, 0.3); break;
      case 'slash': tone('sawtooth', 2000, 400, 0.12, 0.12); break;
      case 'swing': tone('triangle', 300, 120, 0.12, 0.15); break;
      case 'bounce': if (ok('bounce', 0.05)) tone('sine', 220, 110, 0.1, 0.12); break;
      case 'slip': tone('sine', 900, 200, 0.3, 0.15); break;
      case 'cone': noise(0.5, 300, 1200, 0.3, 'bandpass', 3); tone('sawtooth', 233, 220, 0.5, 0.15); break;
    }
  }
}

// Música de batalla: bombo, caja y un bajo de 4 notas por compás; acelera en la muerte súbita
let musT = 0, step = 0, playing = false;
const BASS = [55, 55, 65.4, 49];
export function music(on: boolean, sudden = false) {
  if (!ac || !musBus) return;
  playing = on;
  if (!on) return;
  const now = ac.currentTime, bpm = sudden ? 168 : 132, st = 60 / bpm / 2;
  if (musT < now) musT = now + 0.05;
  while (musT < now + 0.25) {
    const k = step % 16, bar = Math.floor(step / 16) % 4, delay = musT - now;
    if (k % 4 === 0) { tone('sine', 120, 40, 0.18, 0.5, delay, musBus); }
    if (k % 8 === 4) { noiseAt(delay, 0.12, 0.25); }
    if (k % 2 === 0) tone('triangle', BASS[bar] * (k % 4 === 2 ? 2 : 1), BASS[bar] * (k % 4 === 2 ? 2 : 1), st * 0.9, 0.18, delay, musBus);
    if (k % 2 === 1) noiseAt(delay, 0.03, 0.05, 8000);
    musT += st, step++;
  }
}
function noiseAt(delay: number, dur: number, vol: number, hp = 1200) {
  if (!ac || !noiseBuf || !musBus) return;
  const t = ac.currentTime + delay, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf, f.type = 'highpass', f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t), g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(musBus);
  src.start(t, Math.random() * 0.5), src.stop(t + dur + 0.02);
}
export const isPlaying = () => playing;
