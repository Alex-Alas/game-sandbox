// VÓRTICE — audio procedural con Web Audio (sin archivos): música por pasos que suma capas
// con la intensidad, efectos y voz (speechSynthesis) para anunciar etapas.
// `pulse()` da el golpe del bombo (1 → 0) para que la imagen lata a tiempo.
// La voz del sistema no pasa por Web Audio: lo épico sale de acompañarla. `say(texto, nivel)`
// dispara al empezar a hablar (`onstart`) un golpe de cine con reverb (1: impacto; 2: + metales;
// 3: + coro y público), baja la música mientras habla y repite la última palabra como eco
// de estadio. `onVoice(nivel)` avisa ese instante para sacudir la imagen. Sin voz (apagada o
// sin motor) el golpe suena igual. La voz se elige sola (local antes que en línea) o a mano
// (`opt.voiceName`); si una falla o no arranca, se descarta y se usa la siguiente (`voiceInfo()`).

const PROG = [[45, 0], [41, 1], [48, 1], [43, 1]]; // La m, Fa, Do, Sol: [raíz MIDI, 1 = mayor]
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createAudio() {
  let ctx = null, master, music, sfx, lp, noiseBuf, epic, drive;
  const st = { bpm: 128, step: 0, next: 0, on: false, intensity: 0, kicks: [], timer: 0, fever: false, bar: 0 };
  const opt = { music: true, sfx: true, voice: true, voiceName: '' };

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
    // bus del locutor: seco + sala grande (respuesta al impulso de ruido que decae), ambos por sfx
    epic = ctx.createGain(); epic.gain.value = 0.9; epic.connect(sfx);
    const verb = ctx.createConvolver(), wet = ctx.createGain();
    const len = Math.floor(ctx.sampleRate * 2.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; wet.gain.value = 0.55;
    epic.connect(verb).connect(wet).connect(sfx);
    // saturación: el golpe grave gana armónicos que sí salen por el parlante de un teléfono
    drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 511.5 - 1) * 6);
    drive.curve = curve; drive.oversample = '2x';
    const dg = ctx.createGain(); dg.gain.value = 0.32; drive.connect(dg).connect(epic);
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

  // ── locutor ──
  function stinger(lvl) {
    if (!ctx) return; const t = now();
    // impacto: bombo sub que cae, golpe de ruido grave y un chasquido agudo
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(lvl >= 2 ? 95 : 120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    env(g, t, 0.003, 0.95, 0.8 + lvl * 0.35); o.connect(g).connect(epic); o.start(t); o.stop(t + 2);
    // el mismo golpe, una octava y media arriba y saturado: el «cuerpo» que se oye en el teléfono
    const b = ctx.createOscillator(), bg0 = ctx.createGain();
    b.type = 'triangle'; b.frequency.setValueAtTime(lvl >= 2 ? 240 : 300, t); b.frequency.exponentialRampToValueAtTime(70, t + 0.5);
    env(bg0, t, 0.002, 0.9, 0.45 + lvl * 0.15); b.connect(bg0).connect(drive); b.start(t); b.stop(t + 1.2);
    noise(t, 0.45, 0.55, 'lowpass', 500, epic);
    noise(t, 0.3, 0.4, 'bandpass', 1400, drive, 0.8);
    noise(t, 0.18, 0.22, 'highpass', 3500, epic);
    // platillo: brillo largo que se queda en la reverb
    noise(t, 0.6 + lvl * 0.35, 0.16 + lvl * 0.05, 'highpass', 6500, epic);
    if (lvl >= 2) {
      // metales: quinta abierta en sierras desafinadas con un filtro que abre y cierra
      const f = ctx.createBiquadFilter(), bg = ctx.createGain();
      f.type = 'lowpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.08); f.frequency.exponentialRampToValueAtTime(700, t + 1.4);
      env(bg, t, 0.02, 0.16, 1.6); f.connect(bg).connect(epic);
      for (const m of [45, 52, 57, 64, 69]) for (const d of [-9, 9]) {
        const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = hz(m); b.detune.value = d;
        b.connect(f); b.start(t); b.stop(t + 1.8);
      }
    }
    if (lvl >= 3) {
      // coro «aah»: voces con vibrato por dos formantes, y el público que se levanta
      const fa = ctx.createBiquadFilter(), fb = ctx.createBiquadFilter(), cg = ctx.createGain();
      fa.type = fb.type = 'bandpass'; fa.frequency.value = 750; fb.frequency.value = 1150; fa.Q.value = fb.Q.value = 6;
      cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.5, t + 0.35); cg.gain.setTargetAtTime(0.0001, t + 1.2, 0.5);
      fa.connect(cg); fb.connect(cg); cg.connect(epic);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.value = 9; lfo.connect(lg);
      for (const m of [57, 60, 64, 69, 72]) for (const d of [-12, 0, 12]) {
        const v = ctx.createOscillator(); v.type = 'sawtooth'; v.frequency.value = hz(m); v.detune.value = d; lg.connect(v.detune);
        v.connect(fa); v.connect(fb); v.start(t); v.stop(t + 3.5);
      }
      lfo.start(t); lfo.stop(t + 3.5);
      const crowd = ctx.createBufferSource(), cf = ctx.createBiquadFilter(), cw = ctx.createGain();
      crowd.buffer = noiseBuf; crowd.loop = true; cf.type = 'bandpass'; cf.frequency.value = 1100; cf.Q.value = 0.6;
      cw.gain.setValueAtTime(0.0001, t); cw.gain.exponentialRampToValueAtTime(0.35, t + 0.5); cw.gain.setTargetAtTime(0.0001, t + 1.1, 0.6);
      crowd.connect(cf).connect(cw).connect(epic); crowd.start(t); crowd.stop(t + 4);
    }
  }
  // la música se corre mientras habla el locutor
  function duck(on) {
    if (!ctx) return;
    ramp(music.gain, opt.music ? (on ? 0.2 : 0.55) : 0, on ? 0.03 : 0.4);
  }
  // ── voz ──
  const synth = window.speechSynthesis || null;
  let voices = [], duckT = 0, hitT = 0, sayT = 0, dogT = 0;
  const bad = new Set(); // voces que fallaron o no arrancaron en esta sesión
  const vinfo = { name: '', ok: 0, err: '' };
  const MALE = /pablo|jorge|diego|enrique|juan|carlos|alvaro|álvaro|raul|raúl|hombre|\bmale\b/i;
  function pickVoice() {
    if (!synth) return;
    const es = synth.getVoices().filter((v) => /^es([-_]|$)/i.test(v.lang));
    // las locales primero (las en línea fallan sin red o se cortan); entre ellas, las graves de
    // hombre suenan más a tráiler, después la de España
    const score = (v) => (v.localService ? 4 : 0) + (MALE.test(v.name) && !/female|mujer/i.test(v.name) ? 2 : 0) + (/^es[-_]ES/i.test(v.lang) ? 1 : 0);
    voices = es.sort((a, b) => score(b) - score(a));
  }
  if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }
  // la elegida a mano si existe y no falló; si no, la mejor que no haya fallado; null = la del sistema
  function voiceFor() {
    const ok = voices.filter((v) => !bad.has(v.voiceURI));
    return ok.find((v) => v.name === opt.voiceName) || ok[0] || null;
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

  function now() { return ctx ? ctx.currentTime : 0; }
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
    // SALTO: barrido de ruido y tono hacia arriba; con la muerte encima, más grave y tenso
    salto(danger) {
      if (!ctx) return; const t = now();
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.14);
      env(g, t, 0.004, 0.45, 0.16); src.connect(f).connect(g).connect(sfx);
      src.start(t, Math.random() * 0.5); src.stop(t + 0.25);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(danger ? 140 : 260, t); o.frequency.exponentialRampToValueAtTime(danger ? 700 : 1300, t + 0.12);
      env(og, t, 0.004, 0.22, 0.14); o.connect(og).connect(sfx); o.start(t); o.stop(t + 0.2);
    },
    // ¡ESCAPE! / ¡POR UN PELO!: acorde que sube con el combo, con brillo en el pelo
    escape(pelo, combo = 0) {
      if (!ctx) return; const t = now();
      const base = 67 + PENTA[combo % PENTA.length];
      [0, 7, 12].concat(pelo ? [19, 24] : []).forEach((n, i) => osc(pelo ? 'sawtooth' : 'square', hz(base + n), t + i * 0.035, 0.22, pelo ? 0.09 : 0.08, sfx));
      if (pelo) { noise(t, 0.35, 0.3, 'highpass', 6000, sfx); osc('sine', hz(base + 36), t + 0.15, 0.5, 0.12, sfx); }
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
      } else if (kind === 'ready') {
        osc('sine', 1760, t, 0.05, 0.05, sfx); osc('sine', 2637, t + 0.04, 0.06, 0.04, sfx);
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
      } else if (kind === 'tick') {
        // carta que pasa por el marcador del cofre
        osc('square', 2400 + Math.random() * 300, t, 0.012, 0.05, sfx, 0.001);
        noise(t, 0.02, 0.12, 'bandpass', 3200, sfx, 4);
      } else if (kind === 'unlock') {
        noise(t, 0.06, 0.4, 'bandpass', 1200, sfx, 2); noise(t + 0.09, 0.08, 0.35, 'bandpass', 800, sfx, 2);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t + 0.1); o.frequency.exponentialRampToValueAtTime(900, t + 0.5);
        env(g, t + 0.1, 0.05, 0.08, 0.4); o.connect(g).connect(sfx); o.start(t + 0.1); o.stop(t + 0.7);
      } else if (kind === 'revive') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.4);
        env(g, t, 0.02, 0.3, 0.45); o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.5);
      }
    },
    // Tensión mientras gira el cofre: un zumbido que sube de tono durante `dur` s; devuelve el corte
    spin(dur) {
      if (!ctx) return () => {};
      const t = now(), o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(220, t + dur);
      f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(1800, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.9);
      o.connect(f).connect(g).connect(sfx); o.start(t); o.stop(t + dur + 0.1);
      return () => { try { g.gain.cancelScheduledValues(now()); g.gain.setTargetAtTime(0.0001, now(), 0.03); o.stop(now() + 0.2); } catch { /* ya paró */ } };
    },
    stinger,
    onVoice: null,
    // nivel 1: anuncio; 2: momento grande (eco); 3: épico (más grave y lento, doble eco)
    say(text, lvl = 1) {
      clearTimeout(hitT); clearTimeout(duckT); clearTimeout(sayT); clearTimeout(dogT);
      let hit = false;
      const go = () => { if (hit) return; hit = true; clearTimeout(hitT); stinger(lvl); duck(true); api.onVoice?.(lvl); };
      const end = () => { clearTimeout(duckT); duck(false); };
      if (!opt.voice || !synth) { go(); duckT = setTimeout(end, 500 + lvl * 300); return; }
      try {
        // cancelar y hablar en el mismo instante pierde la frase en Chrome (Android sobre todo):
        // solo se cancela si hay algo sonando, y se habla un momento después
        const busy = synth.speaking || synth.pending;
        if (busy) synth.cancel();
        const v = voiceFor();
        const mk = (txt, vol, k) => {
          const u = new SpeechSynthesisUtterance(txt);
          if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-ES';
          u.rate = (lvl >= 3 ? 0.88 : lvl >= 2 ? 0.95 : 1.02) * (k ? 1.15 : 1);
          u.pitch = (lvl >= 3 ? 0.45 : 0.55) - k * 0.05; u.volume = vol;
          return u;
        };
        const u = mk(text, 1, 0);
        let started = false;
        const fail = (why) => {
          if (started) return;
          clearTimeout(dogT); vinfo.err = why;
          if (v) bad.add(v.voiceURI); // la próxima frase prueba con otra voz (o la del sistema)
          try { synth.cancel(); } catch { /* */ }
          end();
        };
        const ok = () => { if (started) return; started = true; clearTimeout(dogT); vinfo.name = v ? v.name : '(del sistema)'; vinfo.ok++; vinfo.err = ''; go(); };
        u.addEventListener('start', ok); u.addEventListener('end', ok); // hay motores que no avisan el inicio
        u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') fail(e.error || 'error'); };
        hitT = setTimeout(go, 400); // por si el motor no avisa onstart (o no habla): el golpe va igual
        const run = () => {
          synth.resume?.(); // Chrome a veces deja la cola en pausa (pestaña en segundo plano)
          synth.speak(u);
          let tail = u;
          // eco de estadio: la última palabra, más baja y rápida
          const word = text.replace(/[¡!¿?.]/g, '').trim().split(/\s+/).pop();
          for (let k = 1; k < lvl && word; k++) { tail = mk(word.toLowerCase(), k === 1 ? 0.4 : 0.15, k); synth.speak(tail); }
          tail.onend = end; if (tail !== u) tail.onerror = end;
          // si en 3 s no empezó (ni terminó) de hablar, la cola quedó trabada o la voz no anda
          dogT = setTimeout(() => fail('no arrancó'), 3000);
        };
        if (busy) sayT = setTimeout(run, 70); else run();
        duckT = setTimeout(end, 2600 + lvl * 900);
      } catch (e) { vinfo.err = String(e && e.message || e); go(); }
    },
    // para Ajustes y depurar: voces en español, cuál se usa y el último error
    voices: () => voices.map((v) => ({ name: v.name, lang: v.lang, local: v.localService, bad: bad.has(v.voiceURI) })),
    voiceInfo: () => ({ ...vinfo, supported: !!synth, using: voiceFor()?.name || null, speaking: !!synth?.speaking }),
    onVoices: (fn) => synth?.addEventListener?.('voiceschanged', fn),
    // al elegir una voz a mano se le da otra oportunidad aunque haya fallado
    pickVoice(name) { opt.voiceName = name; for (const v of voices) if (v.name === name) bad.delete(v.voiceURI); },
  };
  return api;
}
