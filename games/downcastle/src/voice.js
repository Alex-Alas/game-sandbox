/* Chat de voz: WebRTC en malla entre los humanos de la sala (≤ 4 → ≤ 6 conexiones), con la
   señalización por el mismo relay de la sala (los invitados solo hablan con el anfitrión, que
   reenvía: ver 'rtc' en main.js). En cada par ofrece el de id menor; el mayor le pide oferta
   con 'hi' (al entrar o recargar). Cada oferta lleva una sesión `n` al azar: respuestas y
   candidatos de otra sesión se ignoran.

   Ruteo por compañero (`setModes`): 'dry' (sala, premios, o ambos muertos), 'cave' (ambos
   vivos: seco + eco de cueva) u 'off'. El seco sale por un <audio> (Chrome solo decodifica
   el audio remoto si un elemento lo reproduce, y así el cancelador de eco lo ve); el eco va
   por Web Audio a un bus compartido (reverb por convolución + eco con realimentación).
   Con 'off' tampoco se le manda el micrófono (replaceTrack(null)): no hay renegociación.

   Micrófono: getUserMedia → [compresor + ganancia de compensación si SETTINGS.micComp] →
   MediaStreamDestination; esa pista única es la que se envía a todos. */
import { SETTINGS } from './config.js';
import { audioCtx } from './audio.js';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
const sid = () => Math.random().toString(36).slice(2, 10);

export const voiceSupported = () => typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function createVoice(signal) {
  const V = {
    myId: null,
    peers: new Map(), // id → { id, pc, n, sender, el, src, send, mode, pend, timer }
    mic: null,        // { stream, src, comp, makeup, gain, dest, track }
    micOn: false,
    bus: null,
  };

  /* ── Bus de cueva (compartido) ── */
  function caveBus(ac) {
    if (V.bus) return V.bus;
    const input = ac.createGain();
    const tone = ac.createBiquadFilter(); // las paredes de piedra se comen los agudos
    tone.type = 'lowpass'; tone.frequency.value = 2600;
    const conv = ac.createConvolver();
    conv.buffer = caveImpulse(ac, 2.6);
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.32;
    const fb = ac.createGain(); fb.gain.value = 0.38;
    const fbLp = ac.createBiquadFilter(); fbLp.type = 'lowpass'; fbLp.frequency.value = 1400;
    const out = ac.createGain(); out.gain.value = 0.85;
    input.connect(tone);
    tone.connect(conv); conv.connect(out);
    tone.connect(delay); delay.connect(fbLp); fbLp.connect(fb); fb.connect(delay); fbLp.connect(out);
    out.connect(ac.destination);
    return (V.bus = { input, out });
  }

  /* ── Micrófono ── */
  async function micStart() {
    const ac = audioCtx();
    if (!ac || !voiceSupported()) return false;
    if (!V.mic) {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch { return false; }
      const src = ac.createMediaStreamSource(stream);
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -36; comp.knee.value = 6; comp.ratio.value = 12;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      const makeup = ac.createGain(); makeup.gain.value = 2.6;
      const gain = ac.createGain();
      const dest = ac.createMediaStreamDestination();
      comp.connect(makeup); makeup.connect(gain); gain.connect(dest);
      V.mic = { stream, src, comp, makeup, gain, dest, track: dest.stream.getAudioTracks()[0], compOn: null };
    }
    applyComp();
    V.micOn = true;
    for (const p of V.peers.values()) applyTrack(p);
    return true;
  }
  function micStop() {
    V.micOn = false;
    for (const p of V.peers.values()) applyTrack(p);
    if (V.mic) { // suelta el micrófono (se apaga el indicador del sistema)
      V.mic.stream.getTracks().forEach((t) => t.stop());
      try { V.mic.src.disconnect(); } catch { /* */ }
      V.mic = null;
    }
  }
  function applyComp() {
    const m = V.mic;
    if (!m || m.compOn === !!SETTINGS.micComp) return;
    m.compOn = !!SETTINGS.micComp;
    try { m.src.disconnect(); } catch { /* */ }
    m.src.connect(m.compOn ? m.comp : m.gain);
  }

  /* ── Conexiones ── */
  const want = (p) => !!(V.micOn && V.mic && p.mode !== 'off');
  function applyTrack(p) {
    if (!p.sender) return;
    const t = want(p) ? V.mic.track : null;
    if (p.sender.track !== t) p.sender.replaceTrack(t).catch(() => { /* conexión cerrada */ });
  }

  function peer(id) {
    let p = V.peers.get(id);
    if (!p) { p = { id, pc: null, n: null, sender: null, el: null, src: null, send: null, mode: 'dry', pend: [], timer: 0 }; V.peers.set(id, p); }
    return p;
  }

  function closePc(p) {
    clearTimeout(p.timer);
    if (p.pc) { p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null; p.pc.close(); }
    if (p.el) { p.el.srcObject = null; p.el.remove(); }
    try { p.src?.disconnect(); } catch { /* */ }
    Object.assign(p, { pc: null, sender: null, el: null, src: null, send: null, stream: null, pend: [] });
  }

  function newPc(p, n) {
    closePc(p);
    p.n = n;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    p.pc = pc;
    pc.onicecandidate = (e) => { if (e.candidate) signal(p.id, { k: 'ice', n, c: e.candidate.toJSON() }); };
    pc.ontrack = (e) => attach(p, new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (p.pc !== pc) return;
      if (pc.connectionState === 'failed') retry(p);
      else if (pc.connectionState === 'disconnected') { clearTimeout(p.timer); p.timer = setTimeout(() => p.pc === pc && pc.connectionState !== 'connected' && retry(p), 5000); }
    };
    return pc;
  }
  function retry(p) {
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (!V.peers.has(p.id)) return;
      if (V.myId < p.id) offer(p); else signal(p.id, { k: 'hi' });
    }, 1500 + Math.random() * 1000);
  }

  function attach(p, stream) {
    const el = p.el || document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.srcObject = stream;
    if (!p.el) { el.style.display = 'none'; document.body.appendChild(el); p.el = el; }
    el.play().catch(() => { /* espera un gesto: refresh() */ });
    try { p.src?.disconnect(); } catch { /* */ }
    p.src = p.send = null;
    p.stream = stream;
    route(p, true);
  }
  /* El eco necesita el AudioContext, que nace con el primer gesto: se arma cuando lo hay. */
  function ensureWet(p) {
    const ac = audioCtx();
    if (p.src || !p.stream || !ac) return !!p.src;
    p.src = ac.createMediaStreamSource(p.stream);
    p.send = ac.createGain();
    p.send.gain.value = 0;
    p.src.connect(p.send);
    p.send.connect(caveBus(ac).input);
    return true;
  }

  async function offer(p) {
    const pc = newPc(p, sid());
    p.sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    applyTrack(p);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (p.pc === pc) signal(p.id, { k: 'offer', n: p.n, sdp: pc.localDescription.sdp });
    } catch { retry(p); }
  }

  async function flush(p, pc) {
    for (const c of p.pend.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  }

  async function onSignal(from, d) {
    if (!d || typeof d !== 'object' || from === V.myId || V.myId == null) return;
    const p = peer(from);
    try {
      if (d.k === 'hi') { if (V.myId < from) offer(p); return; }
      if (d.k === 'offer') {
        const pc = newPc(p, d.n);
        await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
        const tr = pc.getTransceivers()[0];
        if (!tr) return;
        tr.direction = 'sendrecv';
        p.sender = tr.sender;
        applyTrack(p);
        await pc.setLocalDescription(await pc.createAnswer());
        await flush(p, pc);
        if (p.pc === pc) signal(from, { k: 'answer', n: d.n, sdp: pc.localDescription.sdp });
        return;
      }
      if (d.n !== p.n || !p.pc) return; // de otra sesión
      const pc = p.pc;
      if (d.k === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
        await flush(p, pc);
      } else if (d.k === 'ice' && d.c) {
        if (pc.remoteDescription) await pc.addIceCandidate(d.c).catch(() => {});
        else p.pend.push(d.c);
      }
    } catch { retry(p); }
  }

  /* ── Ruteo ── */
  function route(p, force = false) {
    const ac = audioCtx();
    const listen = SETTINGS.voice !== false;
    if (p.el) {
      p.el.muted = !listen || p.mode === 'off';
      try { p.el.volume = p.mode === 'cave' ? 0.75 : 1; } catch { /* iOS: volumen fijo */ }
      if (p.el.paused && !p.el.muted) p.el.play().catch(() => {});
    }
    if (ensureWet(p)) {
      const g = listen && p.mode === 'cave' ? 1 : 0;
      if (force) p.send.gain.value = g;
      else p.send.gain.setTargetAtTime(g, ac.currentTime, 0.08);
    }
    applyTrack(p);
  }

  return {
    get micOn() { return V.micOn; },
    get peers() { return V.peers; },
    setId(id) { V.myId = id; },
    /** Ids de los compañeros humanos conectados (sin el propio). */
    sync(ids) {
      const set = new Set(ids);
      for (const [id, p] of V.peers) if (!set.has(id)) { closePc(p); V.peers.delete(id); }
      if (V.myId == null) return;
      for (const id of set) {
        if (V.peers.has(id)) continue;
        const p = peer(id);
        if (V.myId < id) offer(p); else signal(id, { k: 'hi' });
      }
    },
    onSignal,
    /** modeOf(id) → 'dry' | 'cave' | 'off'; barato si nada cambió. */
    setModes(modeOf) {
      for (const p of V.peers.values()) {
        const m = modeOf(p.id);
        if (m !== p.mode) { p.mode = m; route(p); }
      }
    },
    async setMic(on) { if (on) return micStart(); micStop(); return false; },
    /** Tras cambiar Ajustes (escuchar / comprimir) o con un gesto (autoplay). */
    refresh() { applyComp(); for (const p of V.peers.values()) route(p); },
    reset() { for (const p of V.peers.values()) closePc(p); V.peers.clear(); V.myId = null; },
    /** Para depurar: energía de audio recibida y bytes enviados por compañero. */
    async stats() {
      const out = {};
      for (const p of V.peers.values()) {
        if (!p.pc) continue;
        const r = { energy: 0, sent: 0 };
        (await p.pc.getStats()).forEach((x) => {
          if (x.type === 'inbound-rtp' && x.kind === 'audio') r.energy = +(x.totalAudioEnergy || 0).toFixed(3);
          if (x.type === 'outbound-rtp' && x.kind === 'audio') r.sent = x.bytesSent;
        });
        out[p.id] = r;
      }
      return out;
    },
    /** Para depurar: estado de cada conexión. */
    debug() {
      return [...V.peers.values()].map((p) => ({
        id: p.id, mode: p.mode, state: p.pc?.connectionState || 'none', sending: !!p.sender?.track,
        receiving: !!p.el?.srcObject, cave: p.send?.gain.value ?? null,
      }));
    },
  };
}

/* Respuesta al impulso de una caverna: primeras reflexiones dispersas + cola de ruido que
   decae y se oscurece. Estéreo levemente decorrelado. */
function caveImpulse(ac, secs) {
  const sr = ac.sampleRate, len = Math.floor(sr * secs);
  const buf = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const k = 0.18 + 0.75 * Math.min(1, t / secs); // se oscurece con el tiempo
      lp += ((Math.random() * 2 - 1) - lp) * (1 - k);
      d[i] = lp * Math.pow(1 - t / secs, 3) * 0.6;
    }
    for (let r = 0; r < 7; r++) { // reflexiones tempranas
      const at = Math.floor(sr * (0.02 + Math.random() * 0.12));
      d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - r * 0.05);
    }
  }
  return buf;
}
