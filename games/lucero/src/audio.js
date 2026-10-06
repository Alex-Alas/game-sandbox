// LUCERO — audio procedural con Web Audio (sin archivos). Música suave por pasos (mapa: soñadora;
// partida: con pulso), campanitas que suben de tono con cada cascada, efectos y voz del sistema
// (speechSynthesis) para los elogios. Todo se crea en `init()` tras el primer gesto.

// Acordes Fmaj7 · Em7 · Dm7 · Cmaj7 (MIDI)
const CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createAudio() {
  let ctx = null, master, music, sfx, verb, noiseBuf, timer = 0;
  const opt = { music: true, sfx: true, voice: true };
  const st = { mode: 'off', step: 0, next: 0, bar: 0, bpm: 84 };
  let lastLand = 0, voice = null, voicesReady = false;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5;
    master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(comp).connect(ctx.destination);
    // sala: respuesta al impulso de ruido que decae
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet).connect(master);
    music = ctx.createGain(); music.gain.value = opt.music ? 0.32 : 0; music.connect(master); music.connect(verb);
    sfx = ctx.createGain(); sfx.gain.value = opt.sfx ? 0.8 : 0; sfx.connect(master); sfx.connect(verb);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    timer = setInterval(schedule, 30);
  }
  const now = () => ctx.currentTime;

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function osc(type, f, t, dur, peak, out, a = 0.004, f1 = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    env(g, t, a, peak, dur); o.connect(g).connect(out);
    o.start(t); o.stop(t + a + dur + 0.05);
  }
  function noise(t, dur, peak, type, freq, out, q = 1, f1 = 0) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.003, peak, dur); s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  // campana: fundamental + armónico inarmónico que se apaga antes
  function bell(m, t, peak = 0.2, dur = 0.9, out = sfx) {
    osc('sine', hz(m), t, dur, peak, out, 0.003);
    osc('sine', hz(m) * 2.76, t, dur * 0.35, peak * 0.35, out, 0.002);
    osc('triangle', hz(m + 12), t, dur * 0.2, peak * 0.15, out, 0.002);
  }

  // ── música ──
  function schedule() {
    if (!ctx || st.mode === 'off') return;
    const sp = 60 / st.bpm / 2; // corcheas
    if (st.next < now()) st.next = now() + 0.05;
    while (st.next < now() + 0.2) { playStep(st.next, st.step % 16); st.step++; st.next += sp; }
  }
  function playStep(t, i) {
    if (i === 0) st.bar++;
    const ch = CHORDS[st.bar % 4], sp = 60 / st.bpm / 2;
    if (i === 0) {
      // colchón: sierras desafinadas por un pasabajos
      for (const m of ch) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = (Math.random() - 0.5) * 14;
        f.type = 'lowpass'; f.frequency.value = st.mode === 'play' ? 900 : 700;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.028, t + 0.9); g.gain.linearRampToValueAtTime(0.0001, t + sp * 16 + 0.3);
        o.connect(f).connect(g).connect(music); o.start(t); o.stop(t + sp * 16 + 0.4);
      }
      osc('sine', hz(ch[0] - 12), t, sp * 7, 0.16, music, 0.02);
    }
    if (i === 8) osc('sine', hz(ch[0] - 12 + (st.bar % 2 ? 7 : 0)), t, sp * 7, 0.13, music, 0.02);
    // celesta: arpegio
    const arp = [0, 2, 1, 3, 2, 1, 3, 0];
    if (st.mode === 'map' ? i % 2 === 0 : true) {
      const n = ch[arp[(i + st.bar) % 8]] + 24;
      if (Math.random() < (st.mode === 'map' ? 0.75 : 0.6)) bell(n, t, 0.035, 0.7, music);
    }
    if (st.mode === 'play') {
      if (i % 8 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); env(g, t, 0.002, 0.3, 0.2); o.connect(g).connect(music); o.start(t); o.stop(t + 0.3); }
      if (i % 4 === 2) noise(t, 0.05, 0.05, 'highpass', 7000, music);
      if (i % 8 === 4) noise(t, 0.12, 0.06, 'bandpass', 2200, music, 0.7);
    }
  }
  function mode(m) {
    if (st.mode === m) return;
    st.mode = m; st.bpm = m === 'play' ? 96 : 76; st.step = 0;
    if (ctx) st.next = now() + 0.1;
  }

  // ── efectos ──
  function pop(chain, n) {
    if (!ctx) return; const t = now();
    const k = Math.min(PENTA.length - 2, chain - 1);
    bell(PENTA[k], t, 0.13 + Math.min(0.08, n * 0.006), 0.7);
    bell(PENTA[k + 1] - 12, t + 0.035, 0.08, 0.5);
    noise(t, 0.05, 0.12, 'bandpass', 3000 + chain * 400, sfx, 1.4);
  }
  function fx(name) {
    if (!ctx) return; const t = now();
    switch (name) {
      case 'swap': noise(t, 0.12, 0.08, 'bandpass', 800, sfx, 1.2, 2400); break;
      case 'bad': osc('triangle', 330, t, 0.1, 0.12, sfx, 0.004, 260); osc('triangle', 247, t + 0.1, 0.14, 0.12, sfx, 0.004, 200); break;
      case 'land': if (t - lastLand > 0.06) { lastLand = t; noise(t, 0.03, 0.035, 'lowpass', 900, sfx); } break;
      case 'select': bell(91, t, 0.05, 0.15); break;
      case 'make': [84, 88, 91, 96].forEach((m, k) => bell(m, t + k * 0.045, 0.09, 0.45)); break;
      case 'beam': noise(t, 0.35, 0.22, 'bandpass', 600, sfx, 0.8, 6000); osc('sawtooth', 1400, t, 0.25, 0.05, sfx, 0.003, 300); break;
      case 'boom': { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.4); env(g, t, 0.003, 0.7, 0.5); o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.7); noise(t, 0.45, 0.35, 'lowpass', 1200, sfx, 0.7, 200); break; }
      case 'rays': for (let k = 0; k < 8; k++) bell(84 + k * 2, t + k * 0.04, 0.06, 0.4); noise(t, 0.6, 0.06, 'highpass', 6000, sfx); break;
      case 'fly': osc('sine', 900, t, 0.12, 0.08, sfx, 0.01, 1800); osc('sine', 1800, t + 0.1, 0.18, 0.06, sfx, 0.01, 1200); break;
      case 'combo': [60, 64, 67, 72].forEach((m) => osc('sawtooth', hz(m), t, 0.6, 0.04, sfx, 0.01)); noise(t, 0.5, 0.2, 'bandpass', 400, sfx, 0.6, 5000); break;
      case 'supernova': fx('boom'); for (let k = 0; k < 14; k++) bell(72 + k * 2, t + 0.1 + k * 0.05, 0.07, 0.7); break;
      case 'fog': noise(t, 0.2, 0.08, 'lowpass', 1400, sfx, 0.7, 300); break;
      case 'ice': noise(t, 0.12, 0.16, 'highpass', 4500, sfx, 1); osc('square', 2600, t, 0.04, 0.03, sfx); break;
      case 'rock': osc('sine', 160, t, 0.16, 0.25, sfx, 0.003, 60); noise(t, 0.2, 0.18, 'bandpass', 900, sfx, 0.8); break;
      case 'goal': bell(96, t, 0.04, 0.2); break;
      case 'goaldone': [79, 83, 86, 91].forEach((m, k) => bell(m, t + k * 0.07, 0.11, 0.6)); break;
      case 'drop': [76, 81, 84, 88, 93].forEach((m, k) => bell(m, t + k * 0.06, 0.1, 0.6)); break;
      case 'shuffle': noise(t, 0.6, 0.12, 'bandpass', 300, sfx, 1.5, 3000); break;
      case 'win': [72, 76, 79, 84].forEach((m, k) => bell(m, t + k * 0.12, 0.16, 1.2)); [60, 64, 67, 72].forEach((m) => osc('triangle', hz(m), t + 0.5, 1.4, 0.05, sfx, 0.05)); break;
      case 'lose': [67, 64, 60, 55].forEach((m, k) => osc('triangle', hz(m), t + k * 0.18, 0.4, 0.09, sfx, 0.01)); break;
      case 'star1': bell(84, t, 0.16, 0.9); break;
      case 'star2': bell(88, t, 0.16, 0.9); break;
      case 'star3': bell(91, t, 0.18, 1.1); bell(96, t + 0.06, 0.1, 1); break;
      case 'coin': bell(98, t, 0.05, 0.12); osc('square', hz(103), t + 0.04, 0.05, 0.015, sfx); break;
      case 'chest': [72, 79, 84, 88, 91, 96].forEach((m, k) => bell(m, t + k * 0.05, 0.1, 0.8)); noise(t, 0.4, 0.1, 'highpass', 5000, sfx); break;
      case 'click': bell(88, t, 0.05, 0.08); break;
      case 'unlock': [79, 84, 88, 91, 96, 100].forEach((m, k) => bell(m, t + k * 0.06, 0.1, 0.7)); break;
      case 'light': bell(91, t, 0.14, 1.4); bell(98, t + 0.08, 0.07, 1.2); noise(t, 0.6, 0.05, 'highpass', 7000, sfx); break;
      case 'tick': bell(100, t, 0.04, 0.08); break;
      case 'warn': osc('triangle', 660, t, 0.08, 0.06, sfx); break;
    }
  }

  // ── voz ──
  function pickVoice() {
    const vs = window.speechSynthesis?.getVoices?.() || [];
    const es = vs.filter((v) => /^es/i.test(v.lang));
    voice = es.find((v) => v.localService && /ES|MX|US|AR/i.test(v.lang)) || es.find((v) => v.localService) || es[0] || null;
    voicesReady = vs.length > 0;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text) {
    if (!opt.voice || !window.speechSynthesis) return;
    if (!voicesReady) pickVoice();
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'es-ES';
      u.rate = 1.05; u.pitch = 1.25; u.volume = 0.9;
      window.speechSynthesis.cancel();
      setTimeout(() => window.speechSynthesis.speak(u), 60);
    } catch { /* sin voz */ }
  }

  function setOpt(k, v) {
    opt[k] = v;
    if (!ctx) return;
    if (k === 'music') music.gain.setTargetAtTime(v ? 0.32 : 0, now(), 0.1);
    if (k === 'sfx') sfx.gain.setTargetAtTime(v ? 0.8 : 0, now(), 0.05);
  }
  return { init, mode, pop, fx, say, setOpt, opt, stop: () => clearInterval(timer) };
}
