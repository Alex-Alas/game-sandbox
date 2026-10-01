/* Audio procedural (Web Audio): viento según velocidad, música ambiental y SFX
   (impulso, aleteo, puertas, golpes del ragdoll, crujidos, roce, cristales). */
const A = {
  ctx: null, master: null, sfx: null,
  windGain: null, windFilter: null, scrapeGain: null, scrapeFilter: null,
  noise: null, muted: false,
};

export function initAudio() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    A.ctx = ctx;
    A.master = ctx.createGain();
    A.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    A.master.connect(comp).connect(ctx.destination);
    A.sfx = ctx.createGain();
    A.sfx.gain.value = 0.9;
    A.sfx.connect(A.master);

    const len = ctx.sampleRate * 2;
    A.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Viento continuo
    const src = ctx.createBufferSource();
    src.buffer = A.noise; src.loop = true;
    A.windFilter = ctx.createBiquadFilter();
    A.windFilter.type = 'lowpass';
    A.windFilter.frequency.value = 300;
    A.windGain = ctx.createGain();
    A.windGain.gain.value = 0;
    src.connect(A.windFilter).connect(A.windGain).connect(A.master);
    src.start();

    // Roce contra superficies
    const src2 = ctx.createBufferSource();
    src2.buffer = A.noise; src2.loop = true;
    A.scrapeFilter = ctx.createBiquadFilter();
    A.scrapeFilter.type = 'bandpass';
    A.scrapeFilter.frequency.value = 900;
    A.scrapeFilter.Q.value = 0.8;
    A.scrapeGain = ctx.createGain();
    A.scrapeGain.gain.value = 0;
    src2.connect(A.scrapeFilter).connect(A.scrapeGain).connect(A.sfx);
    src2.start();

    Music.start(ctx, A.master);
  } catch { /* sin audio */ }
}

export function toggleMute() {
  if (!A.ctx) return false;
  A.muted = !A.muted;
  A.master.gain.setTargetAtTime(A.muted ? 0 : 0.9, A.ctx.currentTime, 0.05);
  return A.muted;
}

export function updateWind(speed, dt, scrape = 0) {
  if (!A.windGain) return;
  const k = Math.min(1, dt * 4);
  const target = Math.min(1, speed / 240) * 0.3;
  A.windGain.gain.value += (target - A.windGain.gain.value) * k;
  A.windFilter.frequency.value += ((160 + speed * 12) - A.windFilter.frequency.value) * k;
  A.scrapeGain.gain.value += (scrape * 0.35 - A.scrapeGain.gain.value) * Math.min(1, dt * 12);
}

function noiseHit({ freq = 800, q = 1, type = 'lowpass', gain = 0.3, dur = 0.25, when = 0 }) {
  const ctx = A.ctx;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = A.noise;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(A.sfx);
  s.start(t, Math.random() * 1.5, dur + 0.05);
  return { f, t };
}

function tone({ type = 'sine', f0 = 440, f1 = null, gain = 0.2, dur = 0.2, when = 0, attack = 0.005 }) {
  const ctx = A.ctx;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(A.sfx);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  boost() {
    if (!A.ctx) return;
    const { f, t } = noiseHit({ freq: 400, q: 2, type: 'bandpass', gain: 0.5, dur: 0.7 });
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
    tone({ type: 'sawtooth', f0: 90, f1: 260, gain: 0.08, dur: 0.5 });
  },
  flap() {
    if (!A.ctx) return;
    const { f, t } = noiseHit({ freq: 500, q: 0.7, type: 'lowpass', gain: 0.45, dur: 0.28 });
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.25);
  },
  roll() {
    if (!A.ctx) return;
    const { f, t } = noiseHit({ freq: 1200, q: 1.2, type: 'bandpass', gain: 0.35, dur: 0.45 });
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.4);
  },
  gate(pitch = 0) {
    if (!A.ctx) return;
    const base = 72 + pitch;
    [0, 4, 7, 12].forEach((s, i) => tone({ type: 'triangle', f0: 440 * 2 ** ((base + s - 69) / 12), gain: 0.12, dur: 0.35, when: i * 0.05 }));
  },
  finish(record) {
    if (!A.ctx) return;
    const seq = record ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    seq.forEach((s, i) => tone({ type: 'square', f0: 440 * 2 ** ((72 + s - 69) / 12), gain: 0.07, dur: 0.4, when: i * 0.09 }));
  },
  crystal() {
    if (!A.ctx) return;
    tone({ type: 'sine', f0: 1320, f1: 2640, gain: 0.15, dur: 0.25 });
    tone({ type: 'triangle', f0: 990, gain: 0.08, dur: 0.5, when: 0.04 });
  },
  nearMiss() {
    if (!A.ctx) return;
    const { f, t } = noiseHit({ freq: 2000, q: 3, type: 'bandpass', gain: 0.25, dur: 0.35 });
    f.frequency.setValueAtTime(3500, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.3);
  },
  crash(strength = 1) {
    if (!A.ctx) return;
    noiseHit({ freq: 180, q: 0.7, gain: 0.9 * strength, dur: 0.9 });
    noiseHit({ freq: 2500, q: 0.5, type: 'highpass', gain: 0.25 * strength, dur: 0.2 });
    tone({ type: 'sine', f0: 110, f1: 32, gain: 0.7 * strength, dur: 0.6 });
  },
  thud(strength = 0.5) {
    if (!A.ctx) return;
    const s = Math.min(1, strength);
    noiseHit({ freq: 120 + Math.random() * 120, q: 0.9, gain: 0.55 * s, dur: 0.18 + s * 0.2 });
    tone({ type: 'sine', f0: 90 + Math.random() * 40, f1: 40, gain: 0.45 * s, dur: 0.2 });
  },
  crack() {
    if (!A.ctx) return;
    noiseHit({ freq: 3000 + Math.random() * 2000, q: 4, type: 'bandpass', gain: 0.6, dur: 0.06 });
    noiseHit({ freq: 1500, q: 6, type: 'bandpass', gain: 0.35, dur: 0.05, when: 0.03 });
  },
  scrapeHit() {
    if (!A.ctx) return;
    noiseHit({ freq: 1400, q: 1.5, type: 'bandpass', gain: 0.4, dur: 0.3 });
  },
  rumble() {
    if (!A.ctx) return;
    noiseHit({ freq: 90, q: 0.5, gain: 0.8, dur: 1.6 });
  },
};

/* Música ambiental generativa (derivada del prototipo original). */
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const Music = {
  CHORDS: [
    { bass: 33, pad: [57, 60, 64, 67], arp: [69, 72, 76, 79] },
    { bass: 29, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76] },
    { bass: 36, pad: [55, 60, 64, 67], arp: [67, 72, 76, 79] },
    { bass: 31, pad: [55, 59, 62, 65], arp: [67, 71, 74, 77] },
  ],
  start(ctx, out) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(out);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.4;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.out);
    this.step = 0;
    this.stepDur = 30 / 80;
    this.next = ctx.currentTime + 0.2;
    this.out.gain.linearRampToValueAtTime(0.26, ctx.currentTime + 5);
    const loop = () => {
      while (this.next < ctx.currentTime + 0.15) {
        this.schedule(this.step, this.next);
        this.next += this.stepDur;
        this.step = (this.step + 1) % 32;
      }
      setTimeout(loop, 30);
    };
    loop();
  },
  voice(type, f, t, dur, peak, toDelay, filt) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.6, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (filt) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = filt; o.connect(f2); node = f2; }
    node.connect(g);
    g.connect(this.out);
    if (toDelay) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  },
  schedule(step, t) {
    const ci = Math.floor(step / 8) % 4, ch = this.CHORDS[ci], s = step % 8;
    if (s === 0) for (const m of ch.pad) this.voice('triangle', midi(m), t, this.stepDur * 8.4, 0.035, true, 1200);
    if (s === 0 || s === 4) this.voice('sawtooth', midi(ch.bass), t, this.stepDur * 4, 0.09, false, 380);
    this.voice('triangle', midi(ch.arp[(step * 2 + ci) % 4]), t, this.stepDur * 0.9, 0.028, true);
  },
};
