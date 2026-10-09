// Chat de voz: WebRTC en malla entre los tres (3 conexiones), con la señalización por el relay de la sala (los invitados solo
// hablan con el anfitrión, que reenvía). Es el de DOWNCASTLE recortado: en cada par ofrece el de id menor y el mayor pide con
// 'hi'; cada oferta lleva una sesión `n` al azar.
// Ruteo por compañero (`setRoutes`): si lo oigo (`hear`) y si él me oye (`tx`). Con la bomba armada es asimétrico (ver
// `hears` en sim/const.ts): si él no me oye, ni se le manda el micrófono (replaceTrack(null), sin renegociar).
// Además mide el micrófono propio para saber cuándo hablás (la boca del mono se mueve para los que te ven, aunque no te oigan).
import { ctx as audioCtx } from './audio.ts';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
const sid = () => Math.random().toString(36).slice(2, 10);
export const voiceSupported = () => typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

type Sig = { k: string, n?: string, sdp?: string, c?: RTCIceCandidateInit };
type Peer = { id: number, pc: RTCPeerConnection | null, n: string | null, sender: RTCRtpSender | null, el: HTMLAudioElement | null, hear: boolean, tx: boolean, pend: RTCIceCandidateInit[], timer: number };
export type Voice = ReturnType<typeof createVoice>;

export function createVoice(signal: (to: number, d: Sig) => void, onTalk: (on: boolean) => void) {
  const V = {
    myId: -1, peers: new Map<number, Peer>(), stream: null as MediaStream | null, track: null as MediaStreamTrack | null, micOn: false,
    duck: 1, analyser: null as AnalyserNode | null, talk: false, loud: 0, quiet: 0, raf: 0,
  };

  const want = (p: Peer) => V.micOn && !!V.track && p.tx;
  function applyTrack(p: Peer) {
    if (!p.sender) return;
    const t = want(p) ? V.track : null;
    if (p.sender.track !== t) p.sender.replaceTrack(t).catch(() => { /* conexión cerrada */ });
  }
  function route(p: Peer) {
    if (p.el) {
      p.el.muted = !p.hear;
      try { p.el.volume = V.duck; } catch { /* iOS: volumen fijo */ }
      if (p.el.paused && !p.el.muted) p.el.play().catch(() => {});
    }
    applyTrack(p);
  }
  function peer(id: number): Peer {
    let p = V.peers.get(id);
    if (!p) { p = { id, pc: null, n: null, sender: null, el: null, hear: true, tx: true, pend: [], timer: 0 }; V.peers.set(id, p); }
    return p;
  }
  function closePc(p: Peer) {
    clearTimeout(p.timer);
    if (p.pc) { p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null; p.pc.close(); }
    if (p.el) { p.el.srcObject = null; p.el.remove(); }
    Object.assign(p, { pc: null, sender: null, el: null, pend: [] });
  }
  function newPc(p: Peer, n: string) {
    closePc(p);
    p.n = n;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    p.pc = pc;
    pc.onicecandidate = (e) => { if (e.candidate) signal(p.id, { k: 'ice', n, c: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const el = p.el || document.createElement('audio');
      el.autoplay = true; el.setAttribute('playsinline', '');
      el.srcObject = new MediaStream([e.track]);
      if (!p.el) { el.style.display = 'none'; document.body.appendChild(el); p.el = el; }
      route(p);
    };
    pc.onconnectionstatechange = () => {
      if (p.pc !== pc) return;
      if (pc.connectionState === 'failed') retry(p);
      else if (pc.connectionState === 'disconnected') { clearTimeout(p.timer); p.timer = setTimeout(() => { if (p.pc === pc && pc.connectionState !== 'connected') retry(p); }, 5000) as unknown as number; }
    };
    return pc;
  }
  function retry(p: Peer) {
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (!V.peers.has(p.id)) return;
      if (V.myId < p.id) void offer(p); else signal(p.id, { k: 'hi' });
    }, 1500 + Math.random() * 1000) as unknown as number;
  }
  async function offer(p: Peer) {
    const pc = newPc(p, sid());
    p.sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    applyTrack(p);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (p.pc === pc) signal(p.id, { k: 'offer', n: p.n!, sdp: pc.localDescription!.sdp });
    } catch { retry(p); }
  }
  async function flush(p: Peer, pc: RTCPeerConnection) { for (const c of p.pend.splice(0)) await pc.addIceCandidate(c).catch(() => {}); }
  async function onSignal(from: number, d: Sig) {
    if (!d || typeof d !== 'object' || from === V.myId || V.myId < 0) return;
    const p = peer(from);
    try {
      if (d.k === 'hi') { if (V.myId < from) void offer(p); return; }
      if (d.k === 'offer' && d.sdp && d.n) {
        const pc = newPc(p, d.n);
        await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
        const tr = pc.getTransceivers()[0];
        if (!tr) return;
        tr.direction = 'sendrecv'; p.sender = tr.sender;
        applyTrack(p);
        await pc.setLocalDescription(await pc.createAnswer());
        await flush(p, pc);
        if (p.pc === pc) signal(from, { k: 'answer', n: d.n, sdp: pc.localDescription!.sdp });
        return;
      }
      if (d.n !== p.n || !p.pc) return;
      const pc = p.pc;
      if (d.k === 'answer' && d.sdp) {
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
        await flush(p, pc);
      } else if (d.k === 'ice' && d.c) {
        if (pc.remoteDescription) await pc.addIceCandidate(d.c).catch(() => {}); else p.pend.push(d.c);
      }
    } catch { retry(p); }
  }

  // ¿Estoy hablando? RMS del micrófono con histéresis (abre a los ~60 ms de voz, cierra a los ~350 ms de silencio)
  function watchMic() {
    cancelAnimationFrame(V.raf);
    const an = V.analyser;
    if (!an) return;
    const buf = new Float32Array(an.fftSize);
    let last = performance.now();
    const loop = () => {
      const now = performance.now(), dt = now - last; last = now;
      an.getFloatTimeDomainData(buf);
      let e = 0; for (const x of buf) e += x * x;
      const rms = Math.sqrt(e / buf.length), loud = rms > 0.022;
      V.loud = loud ? V.loud + dt : 0; V.quiet = loud ? 0 : V.quiet + dt;
      const talk = V.micOn && (V.talk ? V.quiet < 350 : V.loud > 60);
      if (talk !== V.talk) { V.talk = talk; onTalk(talk); }
      V.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  return {
    get micOn() { return V.micOn; },
    get talking() { return V.talk; },
    setId(id: number) { V.myId = id; },
    sync(ids: number[]) {
      const set = new Set(ids);
      for (const [id, p] of V.peers) if (!set.has(id)) { closePc(p); V.peers.delete(id); }
      if (V.myId < 0) return;
      for (const id of set) {
        if (V.peers.has(id)) continue;
        const p = peer(id);
        if (V.myId < id) void offer(p); else signal(id, { k: 'hi' });
      }
    },
    onSignal,
    setRoutes(hearOf: (id: number) => boolean, txOf: (id: number) => boolean) {
      for (const p of V.peers.values()) {
        const h = hearOf(p.id), t = txOf(p.id);
        if (h !== p.hear || t !== p.tx) { p.hear = h; p.tx = t; route(p); }
      }
    },
    // La radio tapa las voces (0..1)
    setDuck(k: number) { if (k !== V.duck) { V.duck = k; for (const p of V.peers.values()) route(p); } },
    async setMic(on: boolean) {
      if (!on) {
        V.micOn = false;
        for (const p of V.peers.values()) applyTrack(p);
        V.stream?.getTracks().forEach(t => t.stop());
        V.stream = V.track = V.analyser = null;
        cancelAnimationFrame(V.raf);
        if (V.talk) { V.talk = false; onTalk(false); }
        return false;
      }
      if (!voiceSupported()) return false;
      try {
        V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch { return false; }
      V.track = V.stream.getAudioTracks()[0];
      const ac = audioCtx();
      if (ac) { V.analyser = ac.createAnalyser(); V.analyser.fftSize = 1024; ac.createMediaStreamSource(V.stream).connect(V.analyser); watchMic(); }
      V.micOn = true;
      for (const p of V.peers.values()) applyTrack(p);
      return true;
    },
    refresh() { for (const p of V.peers.values()) route(p); },
    reset() { for (const p of V.peers.values()) closePc(p); V.peers.clear(); V.myId = -1; },
    debug: () => [...V.peers.values()].map(p => ({ id: p.id, hear: p.hear, tx: p.tx, state: p.pc?.connectionState ?? 'none', sending: !!p.sender?.track, receiving: !!p.el?.srcObject })),
  };
}
