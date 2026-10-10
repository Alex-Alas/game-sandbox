// Sonido procedural (Web Audio, sin archivos): cada efecto se arma con ruido filtrado, osciladores y
// envolventes, y pasa por una reverberación de catedral generada al vuelo. De fondo, viento y brasas.
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode; wet!: GainNode; dry!: GainNode;
  on = true;
  private noiseBuf!: AudioBuffer;
  private amb: GainNode | null = null;

  // el contexto se crea con el primer gesto (los navegadores lo exigen)
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.on ? 0.8 : 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.dry = c.createGain(); this.dry.connect(this.master);
    this.wet = c.createGain(); this.wet.gain.value = 0.32;
    const rev = c.createConvolver(); rev.buffer = this.impulse(2.6, 2.2);
    this.wet.connect(rev); rev.connect(this.master);
    const n = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, n, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.ambient();
  }
  setOn(v: boolean) {
    this.on = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }
  private impulse(sec: number, decay: number) {
    const c = this.ctx!, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 400 ? i / 400 : 1);
    }
    return b;
  }
  private out(node: AudioNode, wet = 0.4) {
    const g = this.ctx!.createGain(); g.gain.value = 1 - wet * 0.5;
    node.connect(g); g.connect(this.dry);
    if (wet > 0) { const w = this.ctx!.createGain(); w.gain.value = wet; node.connect(w); w.connect(this.wet); }
  }
  private noise(t: number, dur: number, f0: number, f1: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', wet = 0.4, attack = 0.005) {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); this.out(g, wet);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  private tone(t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', wet = 0.3, attack = 0.005) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); this.out(g, wet);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(k: string, o: Record<string, unknown> = {}) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + 0.005;
    const r = () => 0.9 + Math.random() * 0.2;
    switch (k) {
      case 'swing': this.noise(t, 0.2, 900 * r(), 3800 * r(), 1.2, 0.35, 'bandpass', 0.25, 0.04); this.noise(t + 0.02, 0.12, 5000, 9000, 2, 0.08, 'highpass', 0.1, 0.02); break;
      case 'hit': {
        const big = !!o.big;
        this.noise(t, big ? 0.32 : 0.18, 2400, 300, 0.8, big ? 0.9 : 0.6, 'lowpass', 0.35, 0.002);
        this.tone(t, big ? 0.35 : 0.2, big ? 120 : 180, 45, big ? 0.9 : 0.6, 'sine', 0.2, 0.002);
        this.tone(t, 0.6, 1850 * r(), 1700, 0.08, 'triangle', 0.6, 0.002);   // timbre metálico
        this.tone(t, 0.5, 2770 * r(), 2600, 0.05, 'sine', 0.6, 0.002);
        break;
      }
      case 'impact': case 'slam': {
        const p = (o.power as number) ?? 1.4;
        this.tone(t, 1.1, 70, 28, 1.0 * Math.min(1.2, p), 'sine', 0.3, 0.004);
        this.noise(t, 0.9, 1600, 80, 0.7, 0.9, 'lowpass', 0.5, 0.003);
        this.noise(t + 0.02, 1.6, 400, 60, 0.5, 0.35, 'lowpass', 0.8, 0.05);   // retumbe
        for (let i = 0; i < 5; i++) this.noise(t + 0.1 + i * 0.07 * r(), 0.08, 3000, 1200, 2, 0.12, 'bandpass', 0.3, 0.002); // escombros
        break;
      }
      case 'roar': case 'growl': {
        const long = k === 'roar' ? 1.5 : 0.7;
        const c = this.ctx;
        const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(68, t); o1.frequency.linearRampToValueAtTime(92, t + long * 0.4); o1.frequency.linearRampToValueAtTime(55, t + long);
        const lfo = c.createOscillator(); lfo.frequency.value = 23; const lg = c.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o1.frequency);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1100, t + long * 0.35); f.frequency.linearRampToValueAtTime(300, t + long); f.Q.value = 4;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(k === 'roar' ? 0.7 : 0.35, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + long);
        o1.connect(f); f.connect(g); this.out(g, 0.6);
        o1.start(t); lfo.start(t); o1.stop(t + long + 0.1); lfo.stop(t + long + 0.1);
        this.noise(t, long, 700, 300, 1.5, k === 'roar' ? 0.4 : 0.2, 'bandpass', 0.6, 0.1);
        break;
      }
      case 'step': this.noise(t, 0.06, 1800 * r(), 600, 1.4, 0.12, 'bandpass', 0.15, 0.002); break;
      case 'stomp': this.tone(t, 0.3, 90, 40, 0.6, 'sine', 0.3, 0.003); this.noise(t, 0.2, 800, 120, 0.8, 0.35, 'lowpass', 0.3, 0.002); break;
      case 'land': this.tone(t, 0.18, 110, 50, 0.4, 'sine', 0.2, 0.003); this.noise(t, 0.16, 1200, 200, 0.8, 0.25, 'lowpass', 0.2, 0.002); break;
      case 'jump': this.noise(t, 0.16, 500, 2400, 1, 0.18, 'bandpass', 0.15, 0.02); break;
      case 'dash': this.noise(t, 0.28, 400, 5000, 0.9, 0.4, 'bandpass', 0.3, 0.01); this.tone(t, 0.3, 300, 900, 0.05, 'sine', 0.4, 0.01); break;
      case 'skid': this.noise(t, 0.35, 2600, 700, 1.2, 0.22, 'bandpass', 0.2, 0.01); break;
      case 'charge': {
        this.tone(t, 0.85, 180, 720, 0.12, 'triangle', 0.5, 0.2);
        this.tone(t, 0.85, 362, 1450, 0.05, 'sine', 0.6, 0.2);
        this.noise(t, 0.85, 1500, 6000, 3, 0.08, 'bandpass', 0.6, 0.3);
        break;
      }
      case 'wave': this.noise(t, 0.5, 600, 4000, 0.8, 0.6, 'bandpass', 0.5, 0.01); this.tone(t, 0.6, 880, 220, 0.18, 'sawtooth', 0.6, 0.005); this.tone(t, 0.4, 70, 35, 0.6, 'sine', 0.3, 0.003); break;
      case 'scrape': {
        this.noise(t, 0.55, 3400, 1800, 6, 0.4, 'bandpass', 0.4, 0.01);
        this.tone(t, 0.5, 2300, 2000, 0.06, 'square', 0.5, 0.01);
        break;
      }
      case 'hurt': this.tone(t, 0.25, 420, 160, 0.15, 'triangle', 0.3, 0.002); break;
      case 'die': {
        for (let i = 0; i < 26; i++) this.noise(t + Math.random() * 2.2, 0.05, 4000 * r(), 2000, 3, 0.05 + Math.random() * 0.06, 'bandpass', 0.4, 0.002);
        this.noise(t, 2.4, 800, 120, 0.6, 0.25, 'lowpass', 0.7, 0.4);
        this.tone(t, 2.2, 55, 30, 0.35, 'sine', 0.5, 0.3);
        break;
      }
    }
  }

  // viento y crepitar de fondo
  private ambient() {
    const c = this.ctx!;
    this.amb = c.createGain(); this.amb.gain.value = 0.12;
    this.amb.connect(this.master);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency);
    const g = c.createGain(); g.gain.value = 0.6;
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.11; const lg2 = c.createGain(); lg2.gain.value = 0.35; lfo2.connect(lg2); lg2.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(this.amb);
    s.start(); lfo.start(); lfo2.start();
    // brasas que crepitan de vez en cuando
    const tick = () => {
      if (!this.ctx) return;
      if (this.on && Math.random() < 0.6) this.noise(this.ctx.currentTime + Math.random() * 0.3, 0.03, 3500, 2000, 4, 0.02 + Math.random() * 0.03, 'bandpass', 0.5, 0.002);
      setTimeout(tick, 120 + Math.random() * 600);
    };
    tick();
  }
}
