// Sonido procedural mínimo del escaparate (GDD §14): metal y vapor, sin archivos. Se habilita con el primer gesto.
// Cada sonido es una receta corta (ruido filtrado + osciladores con envolvente) que pasa por una reverb de caverna
// hecha por convolución (ruido que decae).
export class Sfx {
  ctx: AudioContext | null = null;
  out!: GainNode; wet!: ConvolverNode;
  on = true;
  private noiseBuf!: AudioBuffer;

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.out = c.createGain(); this.out.gain.value = this.on ? 0.55 : 0;
    this.out.connect(c.destination);
    this.wet = c.createConvolver();
    const len = c.sampleRate * 1.6, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.wet.buffer = ir;
    const wg = c.createGain(); wg.gain.value = 0.28;
    this.wet.connect(wg); wg.connect(this.out);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  setOn(v: boolean) { this.on = v; if (this.out) this.out.gain.value = v ? 0.55 : 0; }

  private dest(g: GainNode) { g.connect(this.out); g.connect(this.wet); }
  private env(t: number, a: number, d: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }
  private noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, a = 0.004) {
    const c = this.ctx!, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.env(t, a, dur, peak);
    s.connect(f); f.connect(g); this.dest(g);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, a = 0.003) {
    const c = this.ctx!, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.env(t, a, dur, peak);
    o.connect(g); this.dest(g);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(k: string, o: Record<string, unknown> = {}) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + 0.005;
    switch (k) {
      case 'whoosh': this.noise(t, o.heavy ? 0.32 : 0.18, 'bandpass', o.heavy ? 500 : 1400, o.heavy ? 160 : 4200, 1.2, 0.35, 0.03); break;
      case 'hit':
        this.noise(t, 0.08, 'highpass', 2000, 1500, 0.7, 0.6);
        for (const f of [1180, 1730, 2650]) this.tone(t, 'triangle', f, f * 0.98, 0.32, 0.12);
        this.tone(t, 'sine', 160, 60, 0.12, 0.5); break;
      case 'heavy':
        this.tone(t, 'sine', 120, 38, 0.35, 0.9); this.noise(t, 0.3, 'lowpass', 900, 120, 0.8, 0.7);
        for (const f of [420, 610]) this.tone(t, 'square', f, f * 0.9, 0.18, 0.05); break;
      case 'parry':
        for (const [f, d] of [[1568, 1.1], [2349, 0.9], [3520, 0.6], [4699, 0.4]]) this.tone(t, 'sine', f, f, d, 0.18);
        this.noise(t, 0.05, 'highpass', 6000, 6000, 0.7, 0.5); break;
      case 'glint': this.tone(t, 'sine', 2600, 3400, 0.18, 0.18); this.tone(t + 0.06, 'sine', 3900, 4200, 0.14, 0.1); break;
      case 'danger': this.tone(t, 'sawtooth', 70, 55, 0.5, 0.18, 0.05); this.tone(t, 'sawtooth', 73, 57, 0.5, 0.12, 0.05); break;
      case 'hurt': this.tone(t, 'square', 260, 120, 0.15, 0.15); this.noise(t, 0.1, 'bandpass', 900, 500, 2, 0.4); break;
      case 'jump': this.noise(t, 0.08, 'lowpass', 900, 300, 0.7, 0.25); break;
      case 'land': this.tone(t, 'sine', 110, 50, 0.14, 0.45); this.noise(t, 0.12, 'lowpass', 700, 200, 0.7, 0.35); break;
      case 'clank': for (let i = 0; i < 4; i++) { const f = 1800 + Math.random() * 1400; this.tone(t + i * 0.035, 'triangle', f, f, 0.08, 0.08); } break;
      case 'boom':
        this.tone(t, 'sine', 90, 28, 0.9, 0.9); this.noise(t, 0.9, 'lowpass', 2400, 90, 0.6, 0.9, 0.006);
        this.noise(t, 0.25, 'highpass', 3000, 1500, 0.6, 0.25); break;
      case 'hiss': this.noise(t, 0.6, 'highpass', 4500, 6000, 0.5, 0.12, 0.08); break;
      case 'steam': this.noise(t, 0.5, 'bandpass', 3500, 2500, 0.8, 0.08, 0.05); break;
      case 'pogo': this.tone(t, 'sine', 520, 260, 0.12, 0.4); this.tone(t, 'triangle', 1040, 780, 0.08, 0.12); this.noise(t, 0.05, 'bandpass', 1800, 1200, 2, 0.25); break;
      case 'chain': for (let i = 0; i < 6; i++) { const f = 2200 + Math.random() * 1600; this.tone(t + i * 0.018, 'triangle', f, f * 0.9, 0.05, 0.05); } this.noise(t, 0.12, 'highpass', 3000, 5000, 0.7, 0.08); break;
      case 'latch': this.tone(t, 'square', 180, 90, 0.08, 0.12); this.noise(t, 0.05, 'bandpass', 2400, 1600, 3, 0.3); break;
      case 'block': this.tone(t, 'triangle', 880, 860, 0.18, 0.12); this.noise(t, 0.06, 'highpass', 2500, 2000, 0.7, 0.35); this.tone(t, 'sine', 140, 70, 0.1, 0.35); break;
      case 'shoot': this.noise(t, 0.12, 'bandpass', 900, 400, 1.5, 0.3); this.tone(t, 'square', 330, 160, 0.1, 0.06); break;
      case 'pit': this.tone(t, 'sawtooth', 300, 60, 0.5, 0.1); break;
      case 'combo': this.tone(t, 'sine', 660 * (1 + Math.min(1, (o.n as number ?? 0) / 30)), 990, 0.06, 0.06); break;
      case 'dissolve': this.noise(t, 1.0, 'bandpass', 600, 3000, 3, 0.25, 0.1); this.tone(t, 'sawtooth', 220, 55, 1.0, 0.06, 0.1); break;
    }
  }
}
