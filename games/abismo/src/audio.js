// ABISMO — audio procedural (Web Audio, sin archivos): drone de catedral,
// campanas, impactos de tinta y un filtro global que se cierra cuando DILATÁS.
export function createAudio() {
  let ctx = null, master = null, musicG = null, sfxG = null, revG = null, lp = null;
  const opt = { music: true, sfx: true };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = 0.6;
    master.connect(lp); lp.connect(ctx.destination);
    musicG = ctx.createGain(); musicG.gain.value = 0.42; musicG.connect(master);
    sfxG = ctx.createGain(); sfxG.gain.value = 0.95; sfxG.connect(master);
    // reverb de catedral
    const len = ctx.sampleRate * 2.2;
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
      const d = imp.getChannelData(i);
      for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2.6);
    }
    const rev = ctx.createConvolver(); rev.buffer = imp;
    revG = ctx.createGain(); revG.gain.value = 0.55; revG.connect(rev); rev.connect(sfxG);
    startMusic();
  }

  let step = 0, musicT = null, nextT = 0;
  function env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.linearRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f0, f1, t, dur, vol, dest = sfxG) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.004, vol, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.06);
  }
  function noise(t, dur, vol, freq = 800, q = 1, dest = sfxG) {
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, 0.002, vol, dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t);
  }

  // drone + campanas en menor armónica; la densidad sube con la tensión
  const SCALE = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66];
  function startMusic() {
    if (!ctx || musicT) return;
    nextT = ctx.currentTime + 0.15;
    musicT = setInterval(() => {
      if (!ctx || !opt.music) return;
      while (nextT < ctx.currentTime + 0.3) {
        const tension = Math.min(1, (step % 96) / 96);
        if (step % 4 === 0) {
          osc('sine', 55, 54, nextT, 1.1, 0.5, musicG);
          osc('triangle', 82.4, 82, nextT, 0.9, 0.12, musicG);
        }
        if (Math.random() < 0.22 + tension * 0.35) {
          const f = SCALE[Math.floor(Math.random() * SCALE.length)];
          osc('sine', f, f * 0.995, nextT, 1.6, 0.16, musicG);
          osc('sine', f * 2.76, f * 2.72, nextT, 0.5, 0.05, musicG);
          if (revG) { const g = ctx.createGain(); env(g, nextT, 0.01, 0.05, 1.6); g.connect(revG); }
        }
        step++;
        nextT += 0.3;
      }
    }, 110);
  }

  const api = {
    opt,
    init,
    setMusic(on) { opt.music = on; if (musicG) musicG.gain.value = on ? 0.42 : 0; },
    setSfx(on) { opt.sfx = on; if (sfxG) sfxG.gain.value = on ? 0.95 : 0; },
    hit() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; noise(t, 0.06, 0.18, 900 + Math.random() * 500, 1.2); osc('sine', 120, 70, t, 0.06, 0.14); },
    clank() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('square', 260, 180, t, 0.08, 0.1); noise(t, 0.05, 0.14, 2400, 3); },
    crit() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('square', 1100, 300, t, 0.13, 0.13); osc('sine', 2200, 900, t, 0.07, 0.07); },
    mark() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sine', 660, 990, t, 0.12, 0.12); noise(t, 0.08, 0.1, 1800, 2); },
    dash() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; noise(t, 0.16, 0.16, 1600, 0.7, revG); osc('sine', 420, 120, t, 0.16, 0.1); },
    perfect() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; [880, 1320, 1760].forEach((f, i) => osc('sine', f, f, t + i * 0.05, 0.7, 0.12)); noise(t, 0.3, 0.1, 3000, 1, revG); },
    hurt() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; noise(t, 0.22, 0.3, 180, 0.6, revG); osc('sawtooth', 150, 45, t, 0.28, 0.22); },
    die() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sawtooth', 200, 28, t, 1.4, 0.28); noise(t, 0.9, 0.22, 260, 0.5, revG); [110, 164, 220].forEach((f) => osc('sine', f, f * 0.9, t, 1.6, 0.16)); },
    level() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => osc('sine', f, f, t + i * 0.06, 0.5, 0.11)); },
    boss() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sine', 48, 40, t, 2, 0.42); noise(t, 0.7, 0.2, 120, 1, revG); [110, 130.8, 155.6].forEach((f, i) => osc('sawtooth', f, f * 0.94, t + i * 0.18, 1.4, 0.09)); },
    phase() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sine', 70, 45, t, 1.2, 0.4); noise(t, 0.5, 0.18, 500, 0.8, revG); [330, 440, 554].forEach((f, i) => osc('square', f, f * 0.9, t + i * 0.07, 0.5, 0.06)); },
    win() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => osc('sine', f, f, t + i * 0.09, 0.8, 0.12)); },
    pick() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sine', 659, 988, t, 0.18, 0.11); },
    dilate(on) {
      if (!ctx) return;
      const t = ctx.currentTime;
      lp.frequency.cancelScheduledValues(t);
      lp.frequency.setTargetAtTime(on ? 780 : 18000, t, 0.12);
      if (on && opt.sfx) { osc('sine', 60, 42, t, 1.6, 0.28, musicG); noise(t, 0.5, 0.08, 400, 0.6, revG); }
    },
  };
  return api;
}
