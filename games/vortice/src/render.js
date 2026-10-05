// VÓRTICE — dibujo en Canvas 2D. Todo el mundo vive en un hexágono: un radio r «de esquina»
// se dibuja con hexR (distancia real según el ángulo), así muro, jugador y colisión coinciden.
import { SIDES, SEG, TAU, P, PSIZE, CENTER, STAGES, COMBO_T } from './const.js';
import { multOf } from './sim.js';

const COS30 = Math.cos(SEG / 2);
const hexR = (a, r) => {
  const l = ((a % SEG) + SEG) % SEG;
  return (r * COS30) / Math.cos(l - SEG / 2);
};
const pt = (a, r) => { const d = hexR(a, r); return [Math.cos(a) * d, Math.sin(a) * d]; };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const parts = [], pops = [], trail = [];
  let hue = STAGES[0].hue;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  function skinColor(skin, t) {
    if (skin.color === 'rainbow') return `hsl(${(t * 240) % 360},100%,65%)`;
    if (skin.color === 'glitch') return Math.random() < 0.15 ? '#ff2f5b' : '#e8fffe';
    return skin.color;
  }

  // Partículas en coordenadas de mundo (giran con el mundo)
  function burst(a, r, n, color, speed = 260, life = 0.6, size = 3) {
    const [x, y] = pt(a, r);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * TAU, sp = speed * (0.3 + Math.random());
      parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: life * (0.5 + Math.random() * 0.7), max: life, color, size: size * (0.5 + Math.random()) });
    }
  }
  function pop(text, color, big = 1) {
    const lane = pops.filter((q) => q.t < 0.5).length % 4;
    pops.push({ text, color, t: 0, big, dx: (Math.random() - 0.5) * 30, dy: lane * 26 });
  }

  function draw(v) {
    // v: { sim, skin, pulse, shake, flash, zoom, best, time, dt, fever, dim, hudOn, slow }
    const s = v.sim, t = v.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // color de la etapa, con transición suave; la fiebre lo hace girar
    const target = STAGES[s.stage].hue + Math.sin(s.t * 0.3) * 18;
    let dh = ((target - hue + 540) % 360) - 180;
    hue = (hue + dh * Math.min(1, v.dt * 2) + 360) % 360;
    const h = v.fever ? (t * 160) % 360 : hue;
    const pulse = v.pulse;

    const scale = (Math.min(W, H) / (H > W ? 430 : 560)) * v.zoom * (1 + pulse * 0.035);
    const tilt = 0.86 + Math.sin(s.t * 0.7) * 0.06;
    const sx = (Math.random() - 0.5) * v.shake, sy = (Math.random() - 0.5) * v.shake;

    // fondo: sectores alternados
    ctx.fillStyle = `hsl(${h},45%,6%)`;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(scale, scale * tilt);
    ctx.rotate(s.rot);
    const FAR = 2400;
    for (let k = 0; k < SIDES; k++) {
      ctx.fillStyle = k & 1 ? `hsl(${h},50%,${9 + pulse * 3}%)` : `hsl(${h},45%,${5 + pulse * 2}%)`;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(k * SEG) * FAR, Math.sin(k * SEG) * FAR);
      ctx.lineTo(Math.cos((k + 1) * SEG) * FAR, Math.sin((k + 1) * SEG) * FAR);
      ctx.fill();
    }

    // anillos guía: récord y próxima etapa, viniendo hacia el jugador
    const guide = (tAt, label, color) => {
      const r = P + (tAt - s.t) * s.pv.v;
      if (r < P || r > 1400) return;
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);
      ctx.beginPath();
      for (let k = 0; k <= SIDES; k++) { const [x, y] = pt(k * SEG, r); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.rotate(-s.rot); ctx.fillStyle = color; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, 0, -r * COS30 - 10); ctx.restore();
    };
    if (v.hudOn) {
      const ns = STAGES[s.stage + 1];
      if (ns) guide(ns.t, ns.name, `hsla(${h},100%,85%,.55)`);
      if (v.best > s.t + 0.2) guide(v.best, 'RÉCORD', 'rgba(255,210,63,.85)');
    }

    // muros
    const wallCol = v.fever && pulse > 0.5 ? '#fff' : `hsl(${h},95%,${62 + pulse * 12}%)`;
    ctx.fillStyle = wallCol;
    ctx.beginPath();
    for (const w of s.walls) {
      const r0 = Math.max(CENTER, w.r), r1 = Math.min(FAR, w.r + w.th);
      if (r1 <= r0) continue;
      const a0 = w.side * SEG, a1 = a0 + SEG;
      const p0 = pt(a0, r0), p1 = pt(a1, r0), p2 = pt(a1, r1), p3 = pt(a0, r1);
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath();
    }
    ctx.fill();

    // fragmentos
    for (const f of s.shards) {
      const a = (f.side + 0.5) * SEG; const [x, y] = pt(a, f.r);
      const sz = 9 + Math.sin(t * 10) * 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 4);
      ctx.fillStyle = 'rgba(255,220,90,.25)'; ctx.fillRect(-sz * 1.6, -sz * 1.6, sz * 3.2, sz * 3.2);
      ctx.fillStyle = '#ffe36b'; ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.7, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.7, 0); ctx.fill();
      ctx.restore();
    }

    // centro
    const cr = CENTER * (1 + pulse * 0.14);
    ctx.fillStyle = `hsl(${h},45%,7%)`; ctx.strokeStyle = wallCol; ctx.lineWidth = 5;
    ctx.beginPath();
    for (let k = 0; k <= SIDES; k++) { const [x, y] = pt(k * SEG, cr); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.fill(); ctx.stroke();

    // estela + jugador
    const col = skinColor(v.skin, t);
    if (!s.dead || v.slow) {
      trail.unshift(s.a);
      const len = [0, 6, 14, 28][v.skin.trail] || 0;
      if (trail.length > len) trail.length = len;
      if (len) {
        ctx.lineCap = 'round';
        for (let i = 1; i < trail.length; i++) {
          let a0 = trail[i - 1], a1 = trail[i];
          if (Math.abs(a1 - a0) > Math.PI) continue;
          const [x0, y0] = pt(a0, P + PSIZE * 0.4), [x1, y1] = pt(a1, P + PSIZE * 0.4);
          ctx.globalAlpha = (1 - i / trail.length) * 0.7;
          ctx.strokeStyle = v.skin.color === 'rainbow' ? `hsl(${(t * 240 + i * 12) % 360},100%,65%)` : col;
          ctx.lineWidth = 6 * (1 - i / trail.length) + 1;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    if (!s.dead && !(s.inv > 0 && Math.floor(t * 20) % 2)) {
      const a = s.a;
      const tip = pt(a, P + PSIZE + 2), b0 = pt(a - 0.13, P - 1), b1 = pt(a + 0.13, P - 1);
      const tri = () => { ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath(); };
      if (v.skin.color === 'glitch') {
        ctx.save(); ctx.translate(2, 0); ctx.fillStyle = '#ff2f5b'; tri(); ctx.fill(); ctx.translate(-4, 0); ctx.fillStyle = '#2ff3ff'; tri(); ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = col; tri(); ctx.fill();
      if (v.skin.color === '#111') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; tri(); ctx.stroke(); }
      if (v.skin.trail >= 3 && Math.random() < 0.5) burst(a + (Math.random() - 0.5) * 0.1, P + PSIZE * 0.3, 1, col, 40, 0.35, 2);
    }

    // partículas
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= v.dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * v.dt; p.y += p.vy * v.dt; p.vx *= 0.96; p.vy *= 0.96;
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // destello
    if (v.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, v.flash)})`; ctx.fillRect(0, 0, W, H); }
    if (v.fever) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `hsla(${(h + 180) % 360},100%,50%,${0.25 + pulse * 0.2})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (v.dim) { ctx.fillStyle = `rgba(0,0,0,${v.dim})`; ctx.fillRect(0, 0, W, H); }

    // textos flotantes, cerca del jugador en pantalla
    const pa = s.a + s.rot, pd = hexR(s.a, P + 40) * scale;
    const px = W / 2 + Math.cos(pa) * pd, py = H / 2 + Math.sin(pa) * pd * tilt;
    ctx.textAlign = 'center';
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i]; q.t += v.dt;
      if (q.t > 0.9) { pops.splice(i, 1); continue; }
      const k = Math.min(1, q.t * 8);
      ctx.globalAlpha = 1 - Math.max(0, q.t - 0.5) / 0.4;
      ctx.font = `900 ${Math.round((16 + 10 * q.big) * (0.6 + 0.4 * k))}px system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      const y = py - 20 - q.t * 50 - q.dy;
      ctx.strokeText(q.text, px + q.dx, y); ctx.fillStyle = q.color; ctx.fillText(q.text, px + q.dx, y);
    }
    ctx.globalAlpha = 1;

    if (v.hudOn) hud(v, h);
  }

  function hud(v, h) {
    const s = v.sim, m = Math.min(W, H);
    const big = Math.round(Math.max(28, m * 0.085));
    const pad = 14;
    // tiempo (arriba a la izquierda)
    const tt = s.t.toFixed(2).replace('.', ',');
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, big * 4.6, big * 1.9);
    ctx.fillStyle = '#fff'; ctx.font = `900 ${big}px system-ui, sans-serif`;
    ctx.fillText(tt, pad, pad * 0.6);
    const stg = STAGES[s.stage], nxt = STAGES[s.stage + 1];
    ctx.font = `800 ${Math.round(big * 0.36)}px system-ui, sans-serif`;
    ctx.fillStyle = `hsl(${h},100%,75%)`;
    ctx.fillText(stg.name, pad, pad * 0.6 + big * 1.02);
    if (nxt) {
      const k = (s.t - stg.t) / (nxt.t - stg.t), bw = big * 4.6 - pad * 2;
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(pad, big * 1.62, bw, 4);
      ctx.fillStyle = `hsl(${h},100%,70%)`; ctx.fillRect(pad, big * 1.62, bw * k, 4);
    }
    // récord
    if (v.bestScore > 0) {
      ctx.font = `700 ${Math.round(big * 0.3)}px system-ui, sans-serif`;
      const beat = s.score > v.bestScore;
      ctx.fillStyle = beat ? '#ffd23f' : 'rgba(255,255,255,.6)';
      ctx.fillText(beat ? '★ NUEVO RÉCORD' : `récord ${Math.floor(v.bestScore)}`, pad, big * 1.95);
    }
    // puntos y combo (arriba a la derecha)
    ctx.textAlign = 'right';
    const rx = W - pad;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(W - big * 4.2, 0, big * 4.2, big * 1.9);
    ctx.font = `900 ${Math.round(big * 0.8)}px system-ui, sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(Math.floor(s.score).toLocaleString('es'), rx, pad * 0.6);
    const mul = multOf(s);
    ctx.font = `900 ${Math.round(big * 0.5)}px system-ui, sans-serif`;
    ctx.fillStyle = s.fever ? `hsl(${(v.time * 400) % 360},100%,65%)` : mul > 1 ? '#ffd23f' : 'rgba(255,255,255,.5)';
    ctx.fillText(`×${mul.toFixed(2).replace('.', ',')}`, rx, pad * 0.6 + big * 0.85);
    if (s.combo > 0) {
      const bw = big * 4.2 - pad * 2, k = s.comboT / COMBO_T;
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(rx - bw, big * 1.62, bw, 4);
      ctx.fillStyle = s.fever ? '#ff2f5b' : '#ffd23f'; ctx.fillRect(rx - bw * k, big * 1.62, bw * k, 4);
      ctx.font = `800 ${Math.round(big * 0.3)}px system-ui, sans-serif`; ctx.fillStyle = '#fff';
      ctx.fillText(`COMBO ${s.combo}`, rx, big * 1.95);
    }
    if (s.fever) {
      ctx.textAlign = 'center';
      const z = 1 + v.pulse * 0.15;
      ctx.font = `900 ${Math.round(big * 0.7 * z)}px system-ui, sans-serif`;
      ctx.fillStyle = `hsl(${(v.time * 400) % 360},100%,65%)`;
      ctx.fillText('FIEBRE ×2', W / 2, H - big * 1.4);
    }
    ctx.textBaseline = 'alphabetic';
  }

  resize();
  return { draw, resize, burst, pop, clear: () => { parts.length = 0; pops.length = 0; trail.length = 0; }, get size() { return [W, H]; } };
}
