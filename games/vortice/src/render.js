// VÓRTICE — dibujo en Canvas 2D. Todo el mundo vive en un hexágono: un radio r «de esquina»
// se dibuja con hexR (distancia real según el ángulo), así muro, jugador y colisión coinciden.
import { SIDES, SEG, TAU, P, PSIZE, CENTER, STAGES, COMBO_T, FLIP_T, FLIP_CD, stageAt } from './const.js';
import { multOf } from './sim.js';
import { BAR_HALF, MORPH, MORPH_T } from './bar.js';

const COS30 = Math.cos(SEG / 2);
const hexR = (a, r) => {
  const l = ((a % SEG) + SEG) % SEG;
  return (r * COS30) / Math.cos(l - SEG / 2);
};
const pt = (a, r) => { const d = hexR(a, r); return [Math.cos(a) * d, Math.sin(a) * d]; };
const ease = (k) => k * k * (3 - 2 * k);
const fmtS = (t) => t.toFixed(1).replace('.', ',');
// Avance continuo por etapas (índice + fracción); la última se llena en 60 s
function stageProg(t) {
  const i = stageAt(t), a = STAGES[i], b = STAGES[i + 1];
  return i + Math.min(1, (t - a.t) / (b ? b.t - a.t : 60));
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const parts = [], pops = [], trail = [];
  const zips = [], ghosts = [], waves = []; // SALTO: estelas por el centro, imágenes residuales, ondas
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
  // SALTO: imagen residual donde estaba y estela recta hasta el lado opuesto
  function salto(from, to, color) {
    ghosts.push({ a: from, life: 0.35, color });
    zips.push({ from, to, life: 0.3 + FLIP_T, color });
    burst(from, P + PSIZE / 2, 10, color, 200, 0.35, 3);
    trail.length = 0;
  }
  // Onda hexagonal al aterrizar (tier 1–2 = escape: más ondas y más grandes)
  function wave(a, color, tier = 0) {
    for (let i = 0; i <= tier; i++) waves.push({ t: -i * 0.07, life: 0.45 + tier * 0.15, color, w: 3 + tier * 2 });
    burst(a, P + PSIZE / 2, 8 + tier * 6, color, 240, 0.4, 3);
  }
  function pop(text, color, big = 1) {
    const lane = pops.filter((q) => q.t < 0.5).length % 4;
    pops.push({ text, color, t: 0, big, dx: (Math.random() - 0.5) * 30, dy: lane * 26 });
  }

  // Avance del vuelo del SALTO (0 → 1), suavizado
  const flyK = (s) => { const k = Math.min(1, 1 - s.flipT / FLIP_T); return k * k * (3 - 2 * k); };
  // Contorno del triángulo del jugador en el ángulo a, escalado desde su centro
  function triPath(a, sc = 1) {
    const [cx, cy] = pt(a, P + PSIZE / 2);
    const q = [pt(a, P + PSIZE + 2), pt(a - 0.13, P - 1), pt(a + 0.13, P - 1)].map(([x, y]) => [cx + (x - cx) * sc, cy + (y - cy) * sc]);
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath();
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
    // núcleo del SALTO: se llena mientras recarga y late cuando está listo
    const col = skinColor(v.skin, t);
    {
      const ready = s.flipCd <= 0, k = ready ? 1 : 1 - s.flipCd / FLIP_CD;
      const ir = cr * 0.62 * (ready ? 1 + Math.sin(t * 8) * 0.06 + pulse * 0.1 : k);
      ctx.globalAlpha = ready ? 0.85 : 0.35;
      ctx.fillStyle = ready ? col : `hsl(${h},70%,60%)`;
      ctx.beginPath();
      for (let k2 = 0; k2 <= SIDES; k2++) { const [x, y] = pt(k2 * SEG, ir); k2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // estelas del SALTO (recta por el centro) e imágenes residuales
    for (let i = zips.length - 1; i >= 0; i--) {
      const z = zips[i]; z.life -= v.dt;
      if (z.life <= 0) { zips.splice(i, 1); continue; }
      const [x0, y0] = pt(z.from, P + PSIZE / 2), [x1, y1] = pt(z.to, P + PSIZE / 2);
      // mientras vuela, la estela llega solo hasta el jugador
      const k = s.flipT > 0 && i === zips.length - 1 ? flyK(s) : 1;
      const ex = x0 + (x1 - x0) * k, ey = y0 + (y1 - y0) * k;
      const a = Math.min(1, z.life / 0.3);
      const g = ctx.createLinearGradient(x0, y0, ex, ey);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, z.color);
      ctx.lineCap = 'round';
      ctx.globalAlpha = a; ctx.strokeStyle = g; ctx.lineWidth = 3 + 9 * a;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i]; g.life -= v.dt;
      if (g.life <= 0) { ghosts.splice(i, 1); continue; }
      const k = 1 - g.life / 0.35;
      ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = g.color; ctx.lineWidth = 2;
      triPath(g.a, 1 + k * 1.6); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // estela + jugador
    if (s.flipT > 0) trail.length = 0;
    else if (!s.dead || v.slow) {
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
    if (!s.dead && s.flipT > 0) {
      // en vuelo: el triángulo cruza por el centro, estirado en la dirección del salto
      const k = flyK(s);
      const [x0, y0] = pt(s.flipFrom, P + PSIZE / 2), [x1, y1] = pt(s.a, P + PSIZE / 2);
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, ang = Math.atan2(y1 - y0, x1 - x0);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-22, -6); ctx.lineTo(-22, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (!s.dead && !(s.inv > 0 && Math.floor(t * 20) % 2)) {
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
    // ondas de aterrizaje: hexágonos que se abren desde la órbita
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; w.t += v.dt;
      if (w.t >= w.life) { waves.splice(i, 1); continue; }
      if (w.t < 0) continue;
      const k = w.t / w.life, r = P + PSIZE / 2 + (1 - Math.pow(1 - k, 2)) * 260;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = w.color; ctx.lineWidth = w.w * (1 - k * 0.6);
      ctx.beginPath();
      for (let k2 = 0; k2 <= SIDES; k2++) { const [x, y] = pt(k2 * SEG, r); k2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
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
    if (v.jump) jumpBtn(v, h, col);
    if (v.bar) drawBar(v, h, col);
  }

  // Botón SALTO (táctil), en pantalla: hexágono que se llena con la recarga como el núcleo
  function jumpBtn(v, h, col) {
    const J = v.jump, s = v.sim, ready = s.flipCd <= 0, k = ready ? 1 : 1 - s.flipCd / FLIP_CD;
    const hex = (r) => {
      ctx.beginPath();
      for (let i = 0; i <= SIDES; i++) { const a = i * SEG + SEG / 2; i ? ctx.lineTo(J.x + Math.cos(a) * r, J.y + Math.sin(a) * r) : ctx.moveTo(J.x + Math.cos(a) * r, J.y + Math.sin(a) * r); }
    };
    ctx.save();
    hex(J.r); ctx.fillStyle = 'rgba(5,7,13,.6)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ready ? col : 'rgba(255,255,255,.35)'; ctx.stroke();
    hex(J.r * 0.82 * (ready ? 1 + Math.sin(v.time * 8) * 0.04 + v.pulse * 0.06 : k));
    ctx.globalAlpha = ready ? 0.9 : 0.35; ctx.fillStyle = ready ? col : `hsl(${h},70%,60%)`; ctx.fill();
    if (J.t > 0) { ctx.globalAlpha = J.t; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; hex(J.r * (1.15 + (1 - J.t) * 0.35)); ctx.stroke(); }
    ctx.globalAlpha = ready ? 1 : 0.6;
    ctx.fillStyle = ready ? '#061018' : '#fff';
    ctx.font = `900 ${Math.round(J.r * 0.36)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SALTO', J.x, J.y + 1);
    ctx.restore();
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
      ctx.fillText('FIEBRE ×2', W / 2, v.bar ? v.bar.L.y - 130 - big * 0.8 : v.jump ? v.jump.y - v.jump.r - big * 1.1 : H - big * 1.4);
    }
    progress(v, big, pad);
    ctx.textBaseline = 'alphabetic';
  }

  // Progreso de etapas: un tramo por etapa (los pasados llenos con su color, el actual
  // llenándose), marca del récord y cuánto falta para la próxima. Los últimos 3 s laten.
  function progress(v, big, pad) {
    const s = v.sim, n = STAGES.length, gap = 3;
    const y = Math.round(big * 2.38), hh = 6, x0 = pad, tw = W - pad * 2;
    const sw = (tw - gap * (n - 1)) / n;
    const xAt = (f) => x0 + Math.floor(f) * (sw + gap) + (f % 1) * sw;
    const f = stageProg(s.t), cur = s.stage, nxt = STAGES[cur + 1];
    const left = nxt ? nxt.t - s.t : 0, hot = nxt && left < 3;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (sw + gap), hue = STAGES[i].hue;
      ctx.fillStyle = i === n - 1 ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.14)';
      ctx.fillRect(x, y, sw, hh);
      if (i < cur) { ctx.fillStyle = `hsl(${hue},90%,62%)`; ctx.fillRect(x, y, sw, hh); }
      else if (i === cur) {
        const k = f - cur;
        ctx.fillStyle = `hsl(${hue},100%,${hot ? 70 + 20 * Math.abs(Math.sin(v.time * 14)) : 66}%)`;
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = hot ? 14 : 8;
        ctx.fillRect(x, y - (hot ? 1 : 0), sw * k, hh + (hot ? 2 : 0));
        ctx.shadowBlur = 0;
      }
    }
    // récord de este modo: rayita dorada sobre la pista
    if (v.best > 0) {
      const bx = xAt(Math.min(n - 0.001, stageProg(v.best)));
      ctx.fillStyle = s.t > v.best ? 'rgba(255,210,63,.45)' : '#ffd23f';
      ctx.fillRect(bx - 1, y - 4, 2, hh + 8);
    }
    // texto bajo el tramo actual (sin salirse de la pantalla)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const fs = Math.round(big * (hot ? 0.42 : 0.3));
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const txt = nxt ? `${nxt.name} en ${fmtS(left)} s` : '∞ sin final';
    const tw2 = ctx.measureText(txt).width / 2;
    const cx = Math.max(x0 + tw2, Math.min(x0 + tw - tw2, x0 + cur * (sw + gap) + sw / 2));
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(txt, cx, y + hh + 5);
    ctx.fillStyle = hot ? '#fff' : `hsl(${nxt ? nxt.hue : STAGES[cur].hue},100%,78%)`;
    ctx.fillText(txt, cx, y + hh + 5);
  }

  // ── control de BARRA: una banda de secciones (una por lado) que se corre en las puntas;
  // al SALTAR se cierra en hexágono ──
  function drawBar(v, h, col) {
    const { L, b, target } = v.bar, s = v.sim;
    const tilt = 0.86 + Math.sin(s.t * 0.7) * 0.06;
    let k = 0, ref = b.ref, pos = b.pos, view = b.view, cross = -1;
    const an = b.anim;
    if (an) {
      an.t += v.dt;
      if (an.t >= MORPH_T) b.anim = null;
      else if (an.t < MORPH.in) { k = ease(an.t / MORPH.in); ref = an.fromRef; pos = an.fromPos; view = an.fromView; }
      else if (an.t < MORPH.in + MORPH.cross) { k = 1; cross = (an.t - MORPH.in) / MORPH.cross; }
      else k = ease(1 - (an.t - MORPH.in - MORPH.cross) / MORPH.out);
    }
    // el hexágono copia la orientación del de la arena (giro e inclinación)
    const R = L.R, hx = L.cx, hy = L.by;
    const hexAt = (a) => { const d = hexR(a, R), g = a + s.rot; return [hx + Math.cos(g) * d, hy + Math.sin(g) * d * tilt]; };
    // u: posición en la banda (lados desde el centro de `ref`); en la barra se ve corrida en `view`
    const at = (u) => {
      const [qx, qy] = hexAt((ref + 0.5 + u) * SEG), bx = L.cx + (u - view) * L.sw;
      return [bx + (qx - bx) * k, L.y + (qy - L.y) * k];
    };
    // peligro por lado: qué tan pronto pega el muro más cercano
    const danger = new Array(SIDES).fill(0);
    for (const w of s.walls) {
      if (w.r + w.th <= P) continue;
      const tti = Math.max(0, (w.r - P - PSIZE) / s.pv.v);
      danger[w.side] = Math.max(danger[w.side], 1 - tti / 0.45);
    }
    const lw = L.h + (7 - L.h) * k;
    const lo = view - BAR_HALF, hi = view + BAR_HALF;
    // la banda se desvanece en las puntas (sigue más allá); cerrada en hexágono, entera
    const fade = (u) => Math.min(1, Math.min(u - lo, hi - u) / 0.55) * (1 - k) + k;
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const N = 8;
    for (let j = Math.floor(lo + 0.5); j <= Math.ceil(hi - 0.5); j++) {
      const side = (((ref + j) % SIDES) + SIDES) % SIDES;
      const u0 = Math.max(lo, j - 0.5) + 0.04, u1 = Math.min(hi, j + 0.5) - 0.04;
      if (u1 <= u0) continue;
      ctx.lineWidth = lw;
      // entera si no toca el desvanecido de las puntas; si no, en trozos con su opacidad
      const n = fade(u0) >= 1 && fade(u1) >= 1 ? 1 : N;
      for (let q = 0; q < n; q++) {
        const a = u0 + (u1 - u0) * q / n, c = u0 + (u1 - u0) * (q + 1) / n, al = n > 1 ? fade((a + c) / 2) : 1;
        ctx.beginPath();
        for (let z = 0; z <= 4; z++) { const [x, y] = at(a + (c - a) * z / 4); z ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.globalAlpha = al * 0.92; ctx.strokeStyle = `hsl(${h},55%,${side & 1 ? 36 : 18}%)`; ctx.stroke();
        if (danger[side] > 0) { ctx.globalAlpha = al * danger[side] * 0.55; ctx.strokeStyle = `hsl(${h},95%,65%)`; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      if (j === 0 && k < 1) { // la sección `ref` = el lado de partida
        ctx.globalAlpha = (1 - k) * fade((u0 + u1) / 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.55)';
        const [x0, y0] = at(u0), [x1] = at(u1);
        ctx.strokeRect(x0, y0 - lw / 2 - 3, x1 - x0, lw + 6); ctx.globalAlpha = 1;
      }
    }
    // puntas: chevrones hacia afuera (la banda sigue); se encienden y corren al desplazarse
    if (k < 1) {
      const ch = lw * 0.45 + 4;
      for (const e of [-1, 1]) {
        const on = Math.max(0, b.scroll * e), x = L.cx + e * (BAR_HALF * L.sw + 10);
        ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.45)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'miter';
        for (let i = 0; i < 2; i++) {
          const ph = on ? ((v.time * 3) % 1) * 6 : 0, cx = x + e * (i * 7 + ph);
          ctx.globalAlpha = (1 - k) * (on ? 0.4 + 0.6 * on : 0.6) * (i ? 0.55 : 1);
          ctx.beginPath(); ctx.moveTo(cx - e * ch * 0.45, L.y - ch / 2); ctx.lineTo(cx, L.y); ctx.lineTo(cx - e * ch * 0.45, L.y + ch / 2); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    // objetivo del dedo
    if (target != null && k < 0.5) {
      const [x, y] = at(target);
      ctx.globalAlpha = 1 - k * 2; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - lw / 2 - 2); ctx.lineTo(x, y + lw / 2 + 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y + lw / 2 + 9, 4, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // jugador: triángulo apuntando hacia afuera (arriba en la barra)
    const tri = (x, y, nx, ny, sz) => {
      ctx.beginPath(); ctx.moveTo(x + nx * sz, y + ny * sz);
      ctx.lineTo(x - ny * sz * 0.7, y + nx * sz * 0.7); ctx.lineTo(x + ny * sz * 0.7, y - nx * sz * 0.7); ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
    if (cross >= 0) {
      // cruce por el centro del hexágono, como en la arena
      const [x0, y0] = hexAt(an.fromA), [x1, y1] = hexAt(an.toA), e = ease(cross);
      const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e, d = Math.hypot(x1 - x0, y1 - y0) || 1;
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
      tri(x, y, (x1 - x0) / d, (y1 - y0) / d, 9);
    } else {
      const [x, y] = at(pos), a = (ref + 0.5 + pos) * SEG + s.rot;
      let nx = Math.cos(a) * k, ny = Math.sin(a) * tilt * k - (1 - k);
      const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
      tri(x + nx * (lw / 2 + 5), y + ny * (lw / 2 + 5), nx, ny, 9);
    }
    ctx.restore();
  }

  resize();
  return { draw, resize, burst, pop, salto, wave, clear: () => { parts.length = 0; pops.length = 0; trail.length = 0; zips.length = 0; ghosts.length = 0; waves.length = 0; }, get size() { return [W, H]; } };
}
