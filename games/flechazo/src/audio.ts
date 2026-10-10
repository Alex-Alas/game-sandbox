// Sonido procedural con Web Audio (sin archivos): pasos, saltos, el «fiuuu» de una flecha que sale (cada una una nota más
// arriba en la escala), el golpe seco de un choque, el «fiuuup» de un portal, monedas, compras, la fanfarria de victoria y
// una música tranquila de pads y arpegio pentatónico que se puede apagar.
let ac: AudioContext | null = null, master: GainNode | null = null, sfx: GainNode | null = null, mus: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
let sfxOn = true, musOn = true;

export function unlock() {
  if (ac) { if (ac.state === 'suspended') void ac.resume(); return; }
  try { ac = new AudioContext(); } catch { return; }
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14, comp.ratio.value = 3.5;
  master = ac.createGain(); sfx = ac.createGain(); mus = ac.createGain();
  master.gain.value = 0.8;
  sfx.connect(comp); mus.connect(comp); comp.connect(master); master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  setVolumes(sfxOn, musOn);
  music();
}
export function setVolumes(s: boolean, m: boolean) {
  sfxOn = s, musOn = m;
  if (!ac || !sfx || !mus) return;
  sfx.gain.setTargetAtTime(s ? 1 : 0, ac.currentTime, 0.05);
  mus.gain.setTargetAtTime(m ? 0.22 : 0, ac.currentTime, 0.3);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, v: number, delay = 0, out: AudioNode | null = sfx, attack = 0.006) {
  if (!ac || !out) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, f0: number, f1: number, v: number, type: BiquadFilterType = 'lowpass', delay = 0, q = 0.8, attack = 0.004) {
  if (!ac || !noiseBuf || !sfx) return;
  const t = ac.currentTime + delay, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfx); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

// un tono con vibrato (rate Hz, depth en Hz)
function wob(type: OscillatorType, f0: number, f1: number, dur: number, v: number, delay: number, rate: number, depth: number) {
  if (!ac || !sfx) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
  o.type = type, l.frequency.value = rate, lg.gain.value = depth;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  l.connect(lg).connect(o.frequency); o.connect(g).connect(sfx);
  o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
}

const PENTA = [0, 2, 4, 7, 9];
const note = (k: number, base = 523.25) => base * 2 ** ((PENTA[((k % 5) + 5) % 5] + 12 * Math.floor(k / 5)) / 12);

export const S = {
  step(v: number) { noise(0.05, 900 + v * 120, 300, 0.05 + Math.random() * 0.02, 'lowpass'); },
  jump() { tone('sine', 300, 560, 0.14, 0.12); noise(0.08, 1200, 3000, 0.05, 'bandpass', 0, 2); },
  air() { tone('triangle', 500, 900, 0.16, 0.12); tone('sine', 750, 1350, 0.16, 0.06, 0.02); },
  land(v: number) { const k = Math.min(1, v / 12); noise(0.1, 500, 120, 0.12 + 0.18 * k); tone('sine', 120, 60, 0.12, 0.12 * k); },
  target() { tone('sine', 1400, 1500, 0.04, 0.04); },
  release(n: number) {
    noise(0.55, 400, 4200, 0.2, 'bandpass', 0, 1.5, 0.05);
    tone('triangle', note(n) * 0.5, note(n), 0.3, 0.12, 0, sfx, 0.02);
  },
  escape(n: number) { tone('sine', note(n + 2), note(n + 2), 0.5, 0.14); tone('sine', note(n + 4), note(n + 4), 0.45, 0.08, 0.07); },
  crash() {
    noise(0.22, 1600, 200, 0.4); tone('square', 180, 70, 0.25, 0.14);
    tone('sawtooth', 220, 210, 0.16, 0.07, 0.12); tone('sawtooth', 165, 160, 0.3, 0.07, 0.3);
  },
  heartLost() { tone('sine', 660, 330, 0.35, 0.12); },
  win() { [0, 2, 4, 5, 7, 9].forEach((k, i) => tone('triangle', note(k), note(k), 0.35, 0.13, i * 0.09)); tone('sine', note(10), note(10), 0.9, 0.12, 0.6); },
  lose() { [4, 2, 0, -2].forEach((k, i) => tone('triangle', note(k), note(k) * 0.98, 0.4, 0.12, i * 0.16)); },
  coin(i = 0) { tone('square', 1320, 1320, 0.06, 0.05, i * 0.05); tone('square', 1760, 1760, 0.12, 0.05, i * 0.05 + 0.05); },
  buy() { tone('triangle', 660, 660, 0.08, 0.1); tone('triangle', 990, 990, 0.18, 0.1, 0.08); noise(0.2, 3000, 8000, 0.05, 'highpass', 0.05); },
  no() { tone('square', 200, 160, 0.14, 0.07); },
  ui() { tone('sine', 900, 1100, 0.05, 0.06); },
  map() { noise(0.18, 2000, 600, 0.08, 'bandpass', 0, 1.2); },
  step2() { tone('sine', note(7), note(7), 0.18, 0.08); tone('sine', note(9), note(9), 0.22, 0.08, 0.08); },
  pet() { tone('sine', 1200, 1700, 0.08, 0.06); tone('sine', 1500, 2100, 0.08, 0.05, 0.09); },
  hint() { [0, 4, 7].forEach((k, i) => tone('sine', note(k + 5), note(k + 5), 0.25, 0.08, i * 0.06)); },
  fall() { noise(0.7, 2400, 160, 0.16, 'bandpass', 0, 1.2, 0.02); tone('sine', 700, 90, 0.7, 0.12); tone('triangle', 330, 50, 0.6, 0.08, 0.15); },
  // Cofre: temblor que crece, estallido, el tic de cada carta (más grave al frenar) y la fanfarria según la rareza
  shake() { for (let i = 0; i < 9; i++) noise(0.07, 300 + i * 90, 120, 0.05 + i * 0.012, 'lowpass', i * 0.115, 1.5); tone('sine', 110, 220, 1.1, 0.06, 0, sfx, 0.6); },
  burst() { noise(0.6, 600, 9000, 0.22, 'highpass', 0, 0.8, 0.01); tone('triangle', 330, 1320, 0.35, 0.12); [0, 4, 7].forEach((k, i) => tone('sine', note(k + 5), note(k + 5), 0.3, 0.06, 0.05 + i * 0.04)); },
  tick(k: number) { tone('square', 1900 - k * 900, 1700 - k * 900, 0.025, 0.04 + k * 0.03); },
  reveal(t: number) {
    const seq = [[0, 4, 7], [0, 4, 7, 9], [0, 4, 7, 9, 12, 14], [0, 2, 4, 7, 9, 12, 14, 16]][t];
    seq.forEach((k, i) => { tone('triangle', note(k + 5), note(k + 5), 0.32, 0.12, i * 0.075); tone('sine', note(k + 10), note(k + 10), 0.3, 0.05, i * 0.075 + 0.02); });
    if (t >= 2) noise(1.2, 4000, 9000, 0.08, 'highpass', 0.2, 1, 0.3);
    if (t >= 3) { tone('sine', note(17), note(17), 1.4, 0.12, seq.length * 0.075); wob('triangle', note(12), note(12), 1.2, 0.07, seq.length * 0.075, 6, 8); }
  },
  // Eventos: aparece algo, juntaste una parte, lo lograste (cofre) o se escapó
  event() { [0, 4, 7, 12].forEach((k, i) => tone('sine', note(k + 7), note(k + 7), 0.22, 0.09, i * 0.06)); noise(0.4, 3000, 8000, 0.05, 'highpass', 0, 1, 0.1); },
  ring(n: number) { tone('triangle', note(n + 5), note(n + 5), 0.25, 0.12); tone('sine', note(n + 9), note(n + 9), 0.3, 0.06, 0.04); },
  gotChest() { [0, 4, 7, 9, 12, 16].forEach((k, i) => tone('triangle', note(k + 5), note(k + 5), 0.3, 0.12, i * 0.07)); noise(0.8, 3000, 9000, 0.08, 'highpass', 0.1, 1, 0.2); },
  miss() { [7, 4, 0].forEach((k, i) => tone('triangle', note(k + 2), note(k + 2) * 0.97, 0.25, 0.09, i * 0.12)); },
  // Caricias: un brillito de corazón y la voz de cada mascota
  love(id: string) {
    tone('sine', note(9), note(9), 0.18, 0.05); tone('sine', note(12), note(12), 0.25, 0.04, 0.07);
    const r = Math.random;
    if (id === 'gomita') { wob('sine', 200, 520, 0.4, 0.13, 0.05, 14, 40); wob('sine', 300, 800, 0.35, 0.09, 0.5, 18, 50); }
    else if (id === 'michi') {
      for (let i = 0; i < 44; i++) noise(0.035, 260, 140, 0.07 + 0.03 * Math.sin(i / 3), 'lowpass', 0.05 + i * 0.042, 0.7);
      wob('triangle', 520, 820, 0.16, 0.07, 1.9, 9, 30); wob('triangle', 820, 600, 0.22, 0.06, 2.06, 9, 30);
    } else if (id === 'pio') { for (let i = 0; i < 6; i++) { tone('sine', 2500, 3600, 0.06, 0.06, i * 0.13 + 0.05); tone('sine', 3600, 2800, 0.05, 0.05, i * 0.13 + 0.11); } }
    else if (id === 'croac') { for (const d of [0.05, 0.42]) { wob('square', 170, 130, 0.13, 0.05, d, 32, 25); wob('square', 210, 150, 0.14, 0.05, d + 0.17, 32, 25); } tone('sine', 260, 900, 0.25, 0.08, 1.35); }
    else if (id === 'bu') { wob('sine', 560, 380, 0.8, 0.09, 0.05, 5.5, 18); wob('sine', 420, 720, 0.6, 0.08, 1.2, 7, 22); }
    else if (id === 'ajolote') { for (let i = 0; i < 9; i++) tone('sine', 280 + r() * 400, 900 + r() * 700, 0.07, 0.06, 0.08 + i * 0.16 + r() * 0.06); }
    else if (id === 'zumbi') { wob('sawtooth', 210, 300, 1.9, 0.035, 0.05, 26, 18); wob('sawtooth', 420, 520, 1.6, 0.015, 0.3, 30, 25); }
    else if (id === 'robi') { [0, 4, 7, 12, 9, 14].forEach((k, i) => tone('square', note(k + 3), note(k + 3), 0.09, 0.045, 0.06 + i * 0.12)); }
    else if (id === 'dragui') {
      noise(0.5, 900, 250, 0.1, 'lowpass', 0.75, 1.2); wob('sawtooth', 190, 120, 0.45, 0.05, 0.75, 12, 15);
      [0, 4, 7, 11].forEach((k, i) => tone('sine', note(k + 8), note(k + 8), 0.2, 0.04, 1.3 + i * 0.07));
    }
  },
  warp() { tone('sine', 220, 1320, 0.32, 0.11); tone('triangle', 330, 1980, 0.28, 0.06, 0.04); noise(0.4, 300, 5000, 0.1, 'bandpass', 0, 2.5, 0.03); },
};

// Música: cuatro acordes de pad y un arpegio suave, programados con anticipación
function music() {
  if (!ac || !mus) return;
  const bpm = 84, beat = 60 / bpm, chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // I vi IV V en do
  let bar = 0, next = ac.currentTime + 0.2;
  const hz = (st: number) => 261.63 * 2 ** (st / 12);
  const pad = (f: number, t: number, dur: number) => {
    const o = ac!.createOscillator(), o2 = ac!.createOscillator(), g = ac!.createGain(), lp = ac!.createBiquadFilter();
    o.type = 'triangle', o2.type = 'sine', o.frequency.value = f, o2.frequency.value = f * 1.003;
    lp.type = 'lowpass', lp.frequency.value = 1200;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(mus!); o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  };
  const pluck = (f: number, t: number) => {
    const o = ac!.createOscillator(), g = ac!.createGain();
    o.type = 'sine', o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(mus!); o.start(t); o.stop(t + 0.7);
  };
  const tick = () => {
    if (!ac) return;
    while (next < ac.currentTime + 1.2) {
      const ch = chords[bar % 4];
      for (const st of ch) pad(hz(st - 12), next, beat * 4.2);
      const pat = [0, 1, 2, 1, 2, 0, 2, 1];
      for (let i = 0; i < 8; i++) if ((bar * 8 + i) % 3 !== 2) pluck(hz(ch[pat[i]] + 12 + (i > 5 ? 12 : 0)), next + i * beat / 2);
      next += beat * 4, bar++;
    }
  };
  tick();
  setInterval(tick, 400);
}
