// VÓRTICE — audio procedural con Web Audio (sin archivos): música por pasos que suma capas
// con la intensidad, efectos y voz (speechSynthesis) para anunciar etapas.
// `pulse()` da el golpe del bombo (1 → 0) para que la imagen lata a tiempo.

const PROG = [[45, 0], [41, 1], [48, 1], [43, 1]]; // La m, Fa, Do, Sol: [raíz MIDI, 1 = mayor]
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createAudio() {
  let ctx = null, master, music, sfx, lp, noiseBuf;
  const st = { bpm: 128, step: 0, next: 0, on: false, intensity: 0, kicks: [], timer: 0, fever: false, bar: 0 };
  const opt = { music: true, sfx: true, voice: true };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.8;
    master.connect(comp).connect(ctx.destination);
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7;
    music = ctx.createGain(); music.gain.value = opt.music ? 0.55 : 0;
    music.connect(lp).connect(master);
    sfx = ctx.createGain(); sfx.gain.value = opt.sfx ? 0.7 : 0; sfx.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    st.timer = setInterval(schedule, 25);
  }

  // ── instrumentos ──
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function osc(type, f, t, dur, peak, out, a = 0.005) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    env(g, t, a, peak, dur); o.connect(g).connect(out);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  function noise(t, dur, peak, type, freq, out, q = 1) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.002, peak, dur); s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.002, 1, 0.28); o.connect(g).connect(music); o.start(t); o.stop(t + 0.35);
    st.kicks.push(t); if (st.kicks.length > 8) st.kicks.shift();
  }

  function playStep(t, i) {
    const I = st.intensity, sp = 60 / st.bpm / 4;
    if (i === 0) st.bar++;
    const [root, maj] = PROG[(st.bar >> 1) % 4];
    const chord = maj ? [0, 4, 7, 12] : [0, 3, 7, 12];
    if (i % 4 === 0) kick(t);
    if (I >= 1 && (i === 4 || i === 12)) noise(t, 0.16, 0.45, 'bandpass', 1800, music, 0.8);
    if (i % 4 === 2) noise(t, 0.05, 0.25, 'highpass', 7000, music);
    else if (I >= 2 && i % 2 === 1) noise(t, 0.03, 0.12, 'highpass', 9000, music);
    // bajo en corcheas, saltando de octava
    if (i % 2 === 0) {
      const o = osc('sawtooth', hz(root - 12 + (i % 4 === 2 ? 12 : 0)), t, sp * 1.6, 0.32, music);
      o.detune.value = -6;
    }
    // arpegio
    if (I >= 1) osc('square', hz(root + 12 + chord[i % 4] + (I >= 3 && i >= 8 ? 12 : 0)), t, sp * 0.8, 0.07, music);
    if (st.fever) osc('triangle', hz(root + 36 + chord[(i * 3) % 4]), t, sp * 0.7, 0.07, music);
    // melodía: un motivo por compás que sale de la escala pentatónica
    if (I >= 3 && (i % 3 === 0)) {
      const n = PENTA[(st.bar * 5 + i * 3 + (i >> 2)) % PENTA.length];
      osc('sawtooth', hz(57 + 12 + n), t, sp * 1.3, 0.05, music, 0.01);
    }
  }

  function schedule() {
    if (!ctx || !st.on) return;
    const ahead = ctx.currentTime + 0.12;
    if (st.next < ctx.currentTime - 0.2) st.next = ctx.currentTime + 0.05;
    while (st.next < ahead) {
      playStep(st.next, st.step);
      st.step = (st.step + 1) % 16;
      st.next += 60 / st.bpm / 4;
    }
  }

  const now = () => (ctx ? ctx.currentTime : 0);
  const ramp = (p, v, tau = 0.15) => { if (ctx) { p.cancelScheduledValues(now()); p.setTargetAtTime(v, now(), tau); } };

  const api = {
    init,
    get ready() { return !!ctx; },
    opt,
    setOpt(k, v) {
      opt[k] = v;
      if (!ctx) return;
      if (k === 'music') ramp(music.gain, v ? 0.55 : 0, 0.05);
      if (k === 'sfx') ramp(sfx.gain, v ? 0.7 : 0, 0.05);
    },
    // modo de la música: 'title' (apagada y tranquila), 'play', 'dead'
    mode(m, intensity = 0) {
      if (!ctx) return;
      if (m === 'title') { st.on = true; st.intensity = 0; st.fever = false; st.bpm = 118; ramp(lp.frequency, 700, 0.3); }
      if (m === 'play') { st.on = true; st.intensity = intensity; st.bpm = 132; st.fever = false; ramp(lp.frequency, 3200, 0.05); st.step = 0; st.next = now() + 0.03; }
      if (m === 'dead') { ramp(lp.frequency, 260, 0.08); }
    },
    stage(i) {
      st.intensity = Math.min(3, Math.floor(i * 0.75)) + (i >= 1 ? 1 : 0);
      st.bpm = Math.min(158, 132 + i * 4);
      if (ctx) ramp(lp.frequency, Math.min(9000, 3200 + i * 900), 0.4);
    },
    fever(on) {
      st.fever = on;
      if (ctx) ramp(lp.frequency, on ? 12000 : 3200 + st.intensity * 900, 0.2);
    },
    pulse() {
      if (!ctx) return 0;
      const t = now(); let last = -9;
      for (const k of st.kicks) if (k <= t) last = k;
      return Math.exp(-(t - last) * 9);
    },

    // ── efectos ──
    roce(combo, casi) {
      if (!ctx) return; const t = now();
      const f = 520 * Math.pow(2, Math.min(combo, 36) / 12);
      osc('square', f, t, 0.07, 0.12, sfx);
      if (casi) { osc('sine', f * 2, t + 0.04, 0.15, 0.2, sfx); noise(t, 0.12, 0.2, 'highpass', 5000, sfx); }
    },
    shard(combo) {
      if (!ctx) return; const t = now();
      const base = 72 + PENTA[combo % PENTA.length];
      osc('sine', hz(base), t, 0.25, 0.25, sfx); osc('sine', hz(base + 7), t + 0.06, 0.3, 0.2, sfx);
      osc('triangle', hz(base + 12), t + 0.12, 0.4, 0.12, sfx);
    },
    stageUp() {
      if (!ctx) return; const t = now();
      noise(t, 0.6, 0.3, 'bandpass', 900, sfx, 0.5);
      [0, 4, 7, 12].forEach((n, i) => osc('sawtooth', hz(69 + n), t + i * 0.05, 0.4, 0.08, sfx));
    },
    fx(kind) {
      if (!ctx) return; const t = now();
      if (kind === 'dead') {
        noise(t, 0.5, 0.8, 'lowpass', 2000, sfx);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
        env(g, t, 0.005, 0.4, 0.6); o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.7);
      } else if (kind === 'fever') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
        env(g, t, 0.05, 0.18, 0.5); o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.6);
        noise(t, 0.6, 0.25, 'highpass', 3000, sfx);
      } else if (kind === 'lost') {
        osc('square', 330, t, 0.08, 0.1, sfx); osc('square', 220, t + 0.08, 0.15, 0.1, sfx);
      } else if (kind === 'click') {
        osc('square', 880, t, 0.03, 0.08, sfx);
      } else if (kind === 'coin') {
        osc('square', 1320 + Math.random() * 200, t, 0.05, 0.06, sfx);
      } else if (kind === 'mission') {
        [76, 81, 88].forEach((m, i) => osc('square', hz(m), t + i * 0.07, 0.18, 0.1, sfx));
      } else if (kind === 'record') {
        [72, 76, 79, 84, 79, 84].forEach((m, i) => osc('square', hz(m), t + i * 0.09, 0.2, 0.1, sfx));
      } else if (kind === 'level') {
        [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => osc('triangle', hz(m), t + i * 0.06, 0.3, 0.15, sfx));
      } else if (kind === 'shake') {
        noise(t, 0.08, 0.3, 'bandpass', 400 + Math.random() * 300, sfx, 3);
      } else if (kind === 'chest') {
        noise(t, 0.4, 0.4, 'highpass', 4000, sfx);
        [72, 79, 84, 88, 91, 96].forEach((m, i) => osc('sine', hz(m), t + i * 0.05, 0.5, 0.15, sfx));
      } else if (kind === 'revive') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.4);
        env(g, t, 0.02, 0.3, 0.45); o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.5);
      }
    },
    say(text) {
      if (!opt.voice || !window.speechSynthesis) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'es-ES'; u.rate = 1.05; u.pitch = 0.6; u.volume = 0.9;
        speechSynthesis.speak(u);
      } catch { /* sin voz */ }
    },
  };
  return api;
}
