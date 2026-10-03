/* Audio: un loop de música por contexto (<audio> → pasabajos de Web Audio → salida) y
   efectos procedurales sin archivos. El pasabajos se cierra en menús y al quedar fuera de
   combate. Vibración en Android. Todo arranca con el primer toque (política de autoplay). */
import { ASSET_BASE, SETTINGS } from './config.js';

const TRACKS = {
  tavern: ASSET_BASE + 'music/tankards_at_the_hearth.mp3',
  pit: ASSET_BASE + 'music/trouble_at_the_iron_gate.mp3',
};

let ac = null, master = null, sfxGain = null, musicGain = null, lowpass = null;
let el = null, current = null, wantTrack = null, filterOpen = false;
const noiseBuf = { b: null };

export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); syncMusic(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.connect(ac.destination);
  sfxGain = ac.createGain();
  sfxGain.gain.value = 0.55;
  sfxGain.connect(master);
  lowpass = ac.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 900;
  lowpass.Q.value = 0.7;
  musicGain = ac.createGain();
  musicGain.gain.value = 0.5;
  lowpass.connect(musicGain);
  musicGain.connect(master);
  el = new Audio();
  el.loop = true;
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  ac.createMediaElementSource(el).connect(lowpass);
  const len = ac.sampleRate * 0.5;
  noiseBuf.b = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  applySettings();
  syncMusic();
}

export function applySettings() {
  if (!ac) return;
  sfxGain.gain.value = SETTINGS.sfx ? 0.55 : 0;
  musicGain.gain.value = SETTINGS.music ? 0.5 : 0;
  syncMusic();
}

/* 'tavern' (título, sala, premios) o 'pit' (el pozo). */
export function music(track) {
  wantTrack = track;
  syncMusic();
}
function syncMusic() {
  if (!el) return;
  if (!SETTINGS.music || !wantTrack) { el.pause(); return; }
  if (current !== wantTrack) {
    current = wantTrack;
    el.src = TRACKS[wantTrack];
    el.currentTime = 0;
  }
  if (el.paused) el.play().catch(() => { /* espera otro gesto */ });
}

/* Pasabajos: abierto en el pozo, cerrado en menús y fuera de combate. */
export function musicFilter(open) {
  if (!ac || open === filterOpen) return;
  filterOpen = open;
  const f = lowpass.frequency, now = ac.currentTime;
  f.cancelScheduledValues(now);
  f.setValueAtTime(f.value, now);
  f.exponentialRampToValueAtTime(open ? 18000 : 700, now + 0.6);
}

export function vibrate(ms) {
  if (!SETTINGS.vibration || !navigator.vibrate || navigator.userActivation?.hasBeenActive === false) return;
  try { navigator.vibrate(ms); } catch { /* */ }
}

/* ── Efectos procedurales ── */
function tone(type, f0, f1, dur, vol, delay = 0) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, q = 1, delay = 0, type = 'bandpass') {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf.b;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxGain);
  s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
}

let lastSfx = {};
export function sfx(name) {
  if (!ac || !SETTINGS.sfx) return;
  const now = ac.currentTime;
  if (lastSfx[name] && now - lastSfx[name] < 0.03) return; // sin amontonar el mismo
  lastSfx[name] = now;
  switch (name) {
    case 'shot': noise(0.07, 0.5, 2400, 0.8); tone('square', 520, 140, 0.08, 0.12); break;
    case 'empty': tone('square', 180, 160, 0.05, 0.08); break;
    case 'jump': tone('square', 260, 520, 0.09, 0.07); break;
    case 'hit': tone('sawtooth', 220, 60, 0.25, 0.25); noise(0.15, 0.35, 400, 0.6); break;
    case 'ko': tone('triangle', 440, 70, 0.7, 0.25); break;
    case 'tug': noise(0.18, 0.3, 900, 0.5, 0, 'lowpass'); tone('sine', 180, 520, 0.16, 0.12); break;
    case 'gem': tone('sine', 1320, 1320, 0.06, 0.12); tone('sine', 1980, 1980, 0.09, 0.1, 0.05); break;
    case 'biggem': [0, 0.06, 0.12, 0.18].forEach((d, i) => tone('triangle', 660 * (1 + i * 0.26), 660 * (1 + i * 0.26), 0.12, 0.13, d)); break;
    case 'trap': tone('sine', 140, 90, 0.4, 0.25); tone('sine', 210, 130, 0.35, 0.12, 0.08); break;
    case 'free': tone('sine', 120, 420, 0.18, 0.2); break;
    case 'stomp': tone('square', 160, 50, 0.12, 0.25); noise(0.08, 0.3, 300, 0.7); break;
    case 'land': noise(0.2, 0.45, 180, 0.6); tone('sine', 90, 40, 0.2, 0.3); break;
    case 'bounce': tone('sine', 200, 620, 0.22, 0.18); break;
    case 'kill': noise(0.12, 0.3, 1200, 1); tone('square', 400, 900, 0.1, 0.08, 0.04); break;
    case 'chit': tone('square', 700, 500, 0.04, 0.08); break;
    case 'plop': tone('sine', 300, 120, 0.12, 0.15); break;
    case 'heal': [0, 0.08, 0.16].forEach((d, i) => tone('sine', 880 + i * 220, 880 + i * 220, 0.14, 0.1, d)); break;
    case 'angry': tone('sawtooth', 900, 1300, 0.15, 0.08); tone('sawtooth', 950, 1400, 0.15, 0.08, 0.12); break;
    case 'ff': tone('square', 600, 300, 0.1, 0.12); break;
    case 'anchor': noise(0.06, 0.25, 3000, 2); tone('triangle', 1200, 900, 0.05, 0.06); break;
    case 'click': tone('square', 900, 900, 0.03, 0.06); break;
    case 'won': [0, 0.12, 0.24, 0.42].forEach((d, i) => tone('triangle', [523, 659, 784, 1047][i], [523, 659, 784, 1047][i], 0.22, 0.14, d)); break;
    case 'wiped': [0, 0.2, 0.4].forEach((d, i) => tone('triangle', [392, 330, 262][i], [392, 330, 262][i], 0.3, 0.15, d)); break;
    default: break;
  }
}
