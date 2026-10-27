/* CHIBOLAZO: música procedural por pasos (Web Audio, sin archivos).
   set(nombre) elige la canción del contexto (menu, shop, play, boss, over); level(0..1) suma capas y tempo en la partida.
   Las notas se agendan con 120 ms de anticipación en el reloj de audio, así un cuadro lento no la hace tropezar. */
const SONGS = {
  // prog: un acorde por compás, en semitonos desde root (MIDI)
  menu: { bpm: 84, root: 57, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -3, 0, 5], [-5, -1, 2, 7]] },
  shop: { bpm: 94, root: 60, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]] },
  play: { bpm: 108, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },
  boss: { bpm: 132, root: 57, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-5, -1, 2]] },
  over: { bpm: 66, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -1, 2]] },
};
const LEAD = [0, 3, 6, 8, 11, 14]; // pasos del compás en que toca la melodía

let AC = null, out = null, noiseBuf = null, name = '', song = null, lvl = 0, next = 0, step = 0;

export function init(ac, dest) {
  AC = ac;
  out = AC.createGain(); out.gain.value = 0.8; out.connect(dest);
  const len = AC.sampleRate; noiseBuf = AC.createBuffer(1, len, len);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  setInterval(pump, 40);
}
export function set(n) {
  if (n === name) return;
  name = n; song = SONGS[n] || null; step = 0;
  if (AC) next = AC.currentTime + 0.05;
}
export const level = (x) => { lvl = Math.max(0, Math.min(1, x)); };
export const volume = (v) => out && out.gain.setTargetAtTime(v, AC.currentTime, 0.05);

function pump() {
  if (!AC || !song || AC.state !== 'running') return;
  if (next < AC.currentTime - 0.2) next = AC.currentTime + 0.02; // volvió de segundo plano: sin ráfaga de notas atrasadas
  while (next < AC.currentTime + 0.12) {
    play(step, next);
    next += 15 / (song.bpm + (name === 'play' ? 22 * lvl : 0)); // una semicorchea
    step++;
  }
}

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
function voice(f, t, d, type, vol, { to = f, lp = 0, att = 0.005 } = {}) {
  const o = AC.createOscillator(), v = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to !== f) o.frequency.exponentialRampToValueAtTime(to, t + d);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + att); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  let n = o.connect(v);
  if (lp) { const f2 = AC.createBiquadFilter(); f2.frequency.value = lp; n = n.connect(f2); }
  n.connect(out); o.start(t); o.stop(t + d + 0.05);
}
function hiss(t, d, vol, hp, bp = false) {
  const s = AC.createBufferSource(), v = AC.createGain(), f = AC.createBiquadFilter();
  s.buffer = noiseBuf; f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = hp;
  v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f).connect(v).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02);
}
const kick = (t, v = 0.22) => voice(150, t, 0.2, 'sine', v, { to: 42 });
const snare = (t, v = 0.07) => { hiss(t, 0.14, v, 1500); voice(210, t, 0.08, 'triangle', v * 0.6, { to: 120 }); };
const hat = (t, v = 0.025, d = 0.035) => hiss(t, d, v, 7500);
const pad = (ch, R, t, d, v = 0.018) => { for (const s of ch) voice(hz(R + s), t, d, 'triangle', v, { att: 0.25, lp: 1400 }); };

function play(st, t) {
  const s = st % 16, bar = Math.floor(st / 16), ch = song.prog[bar % song.prog.length], R = song.root, beat = 15 / song.bpm * 16;
  if (name === 'menu') { // ambiente: colchón y arpegio lento, sin batería
    if (s === 0) pad(ch, R, t, beat * 1.1, 0.016);
    if (s % 4 === 0) voice(hz(R + 12 + ch[(s / 4 + bar) % ch.length]), t, 0.5, 'triangle', 0.03, { lp: 2400 });
    if (s === 0 || s === 10) voice(hz(R - 24 + ch[0]), t, 0.6, 'sine', 0.06);
    if (s === 14 && bar % 2) voice(hz(R + 24 + ch[2]), t, 0.3, 'sine', 0.015);
  } else if (name === 'shop') { // tienda: bossa tranquila, piano eléctrico y bajo saltarín
    if ([0, 6, 8, 14].includes(s)) voice(hz(R - 24 + (s === 6 || s === 14 ? 7 : 0) + ch[0]), t, 0.25, 'triangle', 0.07, { lp: 900 });
    if (s === 2 || s === 9 || s === 12) for (const n of ch) voice(hz(R + n), t, 0.35, 'sine', 0.018);
    if ([3, 6, 10, 13].includes(s)) hiss(t, 0.03, 0.03, 2400, true);
    if (s % 4 === 2) hat(t, 0.012);
  } else if (name === 'over') {
    if (s === 0) pad(ch, R - 12, t, beat * 1.2, 0.02);
    if (s === 0 && bar % 2 === 0) voice(hz(R - 24 + ch[0]), t, 1.5, 'sine', 0.06);
  } else { // partida: capas según la intensidad (el jefe arranca más arriba)
    const L = name === 'boss' ? 2 + Math.round(lvl * 2) : Math.min(4, Math.floor(lvl * 5));
    if (s === 0) pad(ch, R, t, beat, L >= 3 ? 0.01 : 0.016);
    const bass = R - 24 + ch[0];
    if (L === 0 ? s % 8 === 0 : s % 2 === 0) voice(hz(bass + (L >= 2 && s % 4 === 2 ? 12 : 0)), t, 0.16, name === 'boss' ? 'sawtooth' : 'square', 0.04, { lp: 500 + 250 * L });
    if (L >= 1 && (s % 8 === 0 || (L >= 3 && s % 4 === 0))) kick(t);
    if (L >= 2 && (s === 4 || s === 12)) snare(t);
    if (L >= 2 && (L >= 4 ? true : s % 2 === 0)) hat(t, s % 4 === 2 ? 0.03 : 0.015);
    if (L >= 3 && s % 2 === 0) voice(hz(R + 12 + ch[(s / 2) % ch.length] + (s >= 8 ? 12 : 0)), t, 0.12, 'square', 0.014, { lp: 2600 });
    if (L >= 4 && LEAD.includes(s)) voice(hz(R + 12 + ch[(LEAD.indexOf(s) + bar) % ch.length] + 12), t, 0.18, 'sawtooth', 0.016, { lp: 3000 });
    if (name === 'boss' && s >= 14) voice(hz(R - 12 + ch[0]), t, 0.1, 'triangle', 0.07, { to: hz(R - 24) });
  }
}
