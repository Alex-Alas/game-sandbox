// ABISMO — audio procedural (Web Audio, sin archivos): drone, campana,
// golpes de tinta, stinger al morir, música por pasos.
export function createAudio() {
  let ctx = null, master = null, musicG = null, sfxG = null;
  const opt = { music: true, sfx: true };
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
    musicG = ctx.createGain(); musicG.gain.value = 0.4; musicG.connect(master);
    sfxG = ctx.createGain(); sfxG.gain.value = 0.9; sfxG.connect(master);
    // reverb de cueva (convolución con ruido)
    const len = ctx.sampleRate * 1.8;
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let i = 0; i < 2; i++) { const d = imp.getChannelData(i); for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2.4); }
    const rev = ctx.createConvolver(); rev.buffer = imp; rev.connect(sfxG);
    revG = ctx.createGain(); revG.gain.value = 0.5; revG.connect(rev);
    startMusic();
  }
  let revG = null, step = 0, musicT = null, nextT = 0;
  function env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0, t);
    node.gain.linearRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f0, f1, t, dur, vol, dest = sfxG) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.004, vol, dur); o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, freq = 800, q = 1, dest = revG) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, 0.002, vol, dur);
    src.connect(f); f.connect(g); g.connect(dest || sfxG);
    src.start(t);
  }
  // secuencia: bajo + campana pentatónica, suma capas con la tensión
  const SCALE = [110, 130.8, 164.8, 196, 261.6, 329.6];
  function startMusic() {
    if (!ctx || musicT) return;
    nextT = ctx.currentTime + 0.1;
    musicT = setInterval(() => {
      if (!ctx || !opt.music) return;
      while (nextT < ctx.currentTime + 0.25) {
        const tension = Math.min(1, (step % 64) / 64);
        // bajo cada 2 pasos
        if (step % 2 === 0) osc('sine', 55, 50, nextT, 0.5, 0.5, musicG);
        // campana pentatónica aleatoria (más densidad con la tensión)
        if (Math.random() < 0.3 + tension * 0.4) {
          const f = SCALE[Math.floor(Math.random() * SCALE.length)];
          osc('sine', f, f * 0.99, nextT, 1.2, 0.18, musicG);
          osc('sine', f * 2.76, f * 2.7, nextT, 0.4, 0.06, musicG);
        }
        step++;
        nextT += 0.28; // ~107 BPM en corcheas
      }
    }, 100);
  }
  const api = {
    opt,
    init,
    setMusic(on) { opt.music = on; if (musicG) musicG.gain.value = on ? 0.4 : 0; },
    setSfx(on) { opt.sfx = on; if (sfxG) sfxG.gain.value = on ? 0.9 : 0; },
    hit() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; noise(t, 0.08, 0.22, 500 + Math.random() * 300, 0.8); osc('sine', 90, 60, t, 0.07, 0.18); },
    crit() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('square', 900, 300, t, 0.12, 0.12); osc('sine', 1800, 900, t, 0.08, 0.08); },
    soul() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sine', 880 + Math.random() * 440, 1320, t, 0.14, 0.09); },
    level() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => osc('sine', f, f, t + i * 0.07, 0.5, 0.12)); },
    hurt() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; noise(t, 0.2, 0.3, 200, 0.6); osc('sawtooth', 120, 40, t, 0.25, 0.2); },
    die() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sawtooth', 220, 30, t, 1.2, 0.3); noise(t, 0.8, 0.25, 300, 0.5); if (revG) { const g = ctx.createGain(); env(g, t, 0.01, 0.5, 1.4); g.connect(revG); } [110, 165, 220].forEach((f) => osc('sine', f, f * 0.9, t, 1.4, 0.2)); },
    boss() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sine', 55, 48, t, 1.6, 0.4); noise(t, 0.5, 0.2, 120, 1); [110, 130.8, 164.8].forEach((f, i) => osc('sawtooth', f, f * 0.94, t + i * 0.15, 1.2, 0.1)); },
    win() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; [392, 523, 659, 784, 1046, 1318].forEach((f, i) => osc('sine', f, f, t + i * 0.09, 0.7, 0.14)); },
    pick() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sine', 659, 988, t, 0.2, 0.12); },
    bell() { if (!ctx || !opt.sfx) return; const t = ctx.currentTime; osc('sine', 392, 390, t, 1.4, 0.2); osc('sine', 1080, 1070, t, 0.8, 0.07); },
  };
  return api;
}
