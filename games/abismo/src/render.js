// ABISMO — render ocultista: papel sepia oscuro, tinta negra gruesa, sellos de
// runas y dorado gastado. La cámara sigue al peregrino con un zoom de teléfono
// y queda encerrada en el círculo del Abismo. Todo por código, sin assets.
import { ARENA } from './data.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let paper = null; // textura de papel repetible
  const paperTile = 256;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    paper = null;
  }
  addEventListener('resize', resize); resize();

  function makePaper() {
    const c = document.createElement('canvas');
    c.width = c.height = paperTile;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2014'; g.fillRect(0, 0, paperTile, paperTile);
    for (let i = 0; i < 320; i++) {
      g.globalAlpha = 0.04 + Math.random() * 0.06;
      g.fillStyle = Math.random() < 0.5 ? '#160f08' : '#3a2a18';
      const x = Math.random() * paperTile, y = Math.random() * paperTile;
      g.beginPath(); g.ellipse(x, y, 4 + Math.random() * 26, 3 + Math.random() * 20, Math.random() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    return ctx.createPattern(c, 'repeat');
  }

  // silueta de tinta con borde irregular; dorado solo para el peregrino
  function inkFigure(x, y, r, { gold = false, bob = 0, facing = 0, skin = '#ffd23f', hp = 1, alpha = 1 } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y + Math.sin(bob) * r * 0.06);
    ctx.rotate(facing);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.82, r * 0.95, r * 0.34, 0, 0, 7); ctx.fill();
    ctx.fillStyle = gold ? '#2a1d08' : '#0b0703';
    // borde hueso: sin esto la tinta se pierde contra el papel oscuro
    ctx.strokeStyle = gold ? skin : 'rgba(214,176,120,.8)';
    ctx.lineWidth = Math.max(1.5, r * 0.09);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = r * (0.84 + 0.16 * Math.sin(i * 2.7 + bob));
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 1.06;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // ojos
    ctx.fillStyle = gold ? skin : '#e8c78a';
    ctx.beginPath(); ctx.arc(-r * 0.34, -r * 0.16, r * 0.15, 0, 7); ctx.arc(r * 0.34, -r * 0.16, r * 0.15, 0, 7); ctx.fill();
    if (gold) {
      ctx.strokeStyle = skin; ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath(); ctx.arc(0, -r * 0.42, r * 0.86, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,210,63,.45)'; ctx.lineWidth = Math.max(1, r * 0.05);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * r * 0.3, r * 0.15);
        ctx.quadraticCurveTo(i * r * 0.5, r * 0.8, i * r * 0.34, r * 1.22); ctx.stroke();
      }
    } else {
      // boca dentada
      ctx.strokeStyle = '#e8c78a'; ctx.lineWidth = Math.max(1, r * 0.055);
      ctx.beginPath(); ctx.moveTo(-r * 0.42, r * 0.22); ctx.lineTo(r * 0.42, r * 0.22); ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * r * 0.19, r * 0.22); ctx.lineTo(i * r * 0.19 + r * 0.07, r * 0.4); ctx.stroke();
      }
      if (hp < 1) { // herida: la vida baja se ve en la silueta
        ctx.globalAlpha = (1 - hp) * 0.55;
        ctx.fillStyle = '#c22a3a';
        ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.45, r * 0.35, 0, 7); ctx.fill();
        ctx.globalAlpha = alpha;
      }
    }
    ctx.restore();
  }

  // peregrino: capucha dorada, halo y manto de tinta (tiene que leerse de un vistazo)
  function drawPilgrim(x, y, r, skin, alpha) {
    const t = performance.now() / 300;
    ctx.save();
    ctx.globalAlpha = alpha;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.92, r * 0.95, r * 0.34, 0, 0, 7); ctx.fill();
    // resplandor
    const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.6);
    glow.addColorStop(0, 'rgba(255,210,63,.16)');
    glow.addColorStop(1, 'rgba(255,210,63,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill();
    // manto (tinta con borde dorado)
    ctx.fillStyle = '#1a1206';
    ctx.strokeStyle = skin;
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.05);
    ctx.quadraticCurveTo(x + r * 1.05, y - r * 0.6, x + r * 0.85, y + r * 0.95);
    ctx.quadraticCurveTo(x, y + r * 1.25, x - r * 0.85, y + r * 0.95);
    ctx.quadraticCurveTo(x - r * 1.05, y - r * 0.6, x, y - r * 1.05);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // capucha
    ctx.fillStyle = '#2a1d08';
    ctx.beginPath(); ctx.arc(x, y - r * 0.35, r * 0.52, 0, 7); ctx.fill(); ctx.stroke();
    // ojos dorados y brasa en el pecho
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.38, r * 0.12, 0, 7); ctx.arc(x + r * 0.2, y - r * 0.38, r * 0.12, 0, 7); ctx.fill();
    ctx.shadowColor = skin; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y + r * 0.3, r * 0.18 + Math.sin(t * 2) * r * 0.02, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    // halo
    ctx.strokeStyle = skin; ctx.globalAlpha = alpha * 0.9; ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.beginPath(); ctx.arc(x, y - r * 1.15, r * 0.42, 0, 7); ctx.stroke();
    ctx.restore();
  }

  const clamp = (v, a, b) => (a > b ? (a + b) / 2 : v < a ? a : v > b ? b : v);

  function draw(s, fx) {
    if (!paper) paper = makePaper();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0e0904'; ctx.fillRect(0, 0, W, H);

    // zoom de teléfono: el peregrino mide ~34 px de alto en pantalla
    const zoom = Math.min(W, H) / 620;
    const halfW = W / (2 * zoom), halfH = H / (2 * zoom);
    const shx = fx && fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const shy = fx && fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const cx = clamp(s.p.x, -ARENA + halfW, ARENA - halfW);
    const cy = clamp(s.p.y, -ARENA + halfH, ARENA - halfH);
    const sx = (x) => W / 2 + (x - cx) * zoom + shx;
    const sy = (y) => H / 2 + (y - cy) * zoom + shy;
    const ox = sx(0), oy = sy(0);

    // el círculo de tinta: papel + borde
    ctx.save();
    ctx.beginPath(); ctx.arc(ox, oy, ARENA * zoom, 0, 7); ctx.clip();
    ctx.fillStyle = '#2b2014'; ctx.fill();
    ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
    // manchones de humedad grandes
    const grd = ctx.createRadialGradient(ox, oy, ARENA * zoom * 0.1, ox, oy, ARENA * zoom);
    grd.addColorStop(0, 'rgba(232,199,122,.07)');
    grd.addColorStop(0.65, 'rgba(0,0,0,.12)');
    grd.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    // grilla tenue de folio
    ctx.strokeStyle = 'rgba(232,199,122,.06)'; ctx.lineWidth = 1;
    const step = 120 * zoom;
    if (step > 12) {
      ctx.beginPath();
      for (let x = ((ox % step) + step) % step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = ((oy % step) + step) % step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    // manchas de tinta y ruinas tenues, fijas (semilla por índice)
    for (let i = 0; i < 26; i++) {
      const a = i * 2.399963; // espiral áurea
      const rr = ARENA * Math.sqrt((i + 0.5) / 26) * 0.94;
      const bx = ox + Math.cos(a) * rr * zoom, by = oy + Math.sin(a) * rr * zoom;
      const s0 = (18 + ((i * 37) % 40)) * zoom;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = i % 3 ? '#0d0906' : '#3a2a18';
      ctx.beginPath(); ctx.ellipse(bx, by, s0, s0 * 0.55, a, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // sello central
    const seal = 300 * zoom;
    ctx.strokeStyle = 'rgba(232,199,122,.22)'; ctx.lineWidth = Math.max(1, 3 * zoom);
    ctx.beginPath(); ctx.arc(ox, oy, seal, 0, 7); ctx.stroke();
    ctx.setLineDash([6 * zoom, 8 * zoom]);
    ctx.beginPath(); ctx.arc(ox, oy, seal * 0.82, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(a) * seal * 0.82, oy + Math.sin(a) * seal * 0.82);
      ctx.lineTo(ox + Math.cos(a) * seal, oy + Math.sin(a) * seal);
      ctx.stroke();
    }
    // runas dibujadas (las fuentes no traen los glifos rúnicos en todos los teléfonos)
    ctx.strokeStyle = 'rgba(232,199,122,.3)'; ctx.lineWidth = Math.max(1, 2.4 * zoom);
    const rr = seal * 0.42;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const gx = ox + Math.cos(a) * rr, gy = oy + Math.sin(a) * rr;
      const u = Math.max(5, 13 * zoom);
      ctx.beginPath();
      if (i % 3 === 0) { ctx.moveTo(gx, gy - u); ctx.lineTo(gx, gy + u); ctx.moveTo(gx, gy - u * 0.4); ctx.lineTo(gx + u * 0.7, gy - u); }
      else if (i % 3 === 1) { ctx.moveTo(gx - u * 0.6, gy - u); ctx.lineTo(gx + u * 0.6, gy - u); ctx.lineTo(gx, gy + u); ctx.closePath(); }
      else { ctx.moveTo(gx - u * 0.6, gy + u); ctx.lineTo(gx, gy - u); ctx.lineTo(gx + u * 0.6, gy + u); ctx.moveTo(gx - u * 0.6, gy - u); ctx.lineTo(gx + u * 0.6, gy - u); }
      ctx.stroke();
    }
    ctx.restore();

    // borde del Abismo (se dibuja después del clip para que quede nítido)
    ctx.strokeStyle = '#0d0906'; ctx.lineWidth = Math.max(4, 10 * zoom);
    ctx.beginPath(); ctx.arc(ox, oy, ARENA * zoom, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,199,122,.45)'; ctx.lineWidth = Math.max(1, 2 * zoom);
    ctx.beginPath(); ctx.arc(ox, oy, ARENA * zoom - Math.max(3, 7 * zoom), 0, 7); ctx.stroke();

    // runas del jefe (queman)
    if (s.runes && s.runes.length) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 140);
      for (const r of s.runes) {
        ctx.save();
        ctx.translate(sx(r.x), sy(r.y));
        ctx.strokeStyle = `rgba(255,90,80,${0.7 * pulse})`; ctx.lineWidth = Math.max(2, 3 * zoom);
        ctx.beginPath(); ctx.arc(0, 0, r.r * zoom, 0, 7); ctx.stroke();
        ctx.setLineDash([8 * zoom, 6 * zoom]);
        ctx.strokeStyle = `rgba(255,90,80,${0.45 * pulse})`;
        ctx.rotate(performance.now() / 900);
        ctx.beginPath(); ctx.arc(0, 0, r.r * zoom * 0.7, 0, 7); ctx.stroke();
        ctx.restore();
      }
    }

    // almas
    for (const so of s.souls) {
      const x = sx(so.x), y = sy(so.y);
      const rr = Math.max(2.5, 6 * zoom);
      ctx.fillStyle = '#ffd23f';
      ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y, rr + Math.sin(performance.now() / 160 + so.x) * 1.2, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // enemigos
    for (const f of s.foes) {
      const x = sx(f.x), y = sy(f.y);
      inkFigure(x, y, f.r * zoom * 1.6, { bob: f.t * 6, facing: Math.atan2(s.p.y - f.y, s.p.x - f.x), hp: f.hp / f.maxhp });
      if (f.maxhp >= 80) {
        const w = 40 * zoom;
        ctx.fillStyle = '#0d0906'; ctx.fillRect(x - w / 2, y - f.r * zoom * 1.6 - Math.max(10, 16 * zoom), w, Math.max(3, 4 * zoom));
        ctx.fillStyle = '#ff5fa2'; ctx.fillRect(x - w / 2, y - f.r * zoom * 1.6 - Math.max(10, 16 * zoom), w * Math.max(0, f.hp / f.maxhp), Math.max(3, 4 * zoom));
      }
    }

    // disparos
    for (const sh of s.shots) {
      const x = sx(sh.x), y = sy(sh.y);
      const col = sh.foe ? '#ff5fa2' : sh.kind === 'pua' ? '#ffd23f' : sh.kind === 'fuego' ? '#ff7a3d'
        : sh.kind === 'cadena' ? '#e8c07a' : sh.kind === 'dash' ? '#fff' : '#c08bff';
      const rr = Math.max(2, (sh.kind === 'dash' ? 7 : 5) * zoom * 1.4);
      if (sh.kind === 'cadena') { // estela del latigazo
        ctx.strokeStyle = 'rgba(232,192,122,.45)'; ctx.lineWidth = Math.max(1.5, 3 * zoom);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sh.vx * 0.04 * zoom, y - sh.vy * 0.04 * zoom); ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
    }

    // ondas de la Campana
    for (const w of s.waves) {
      ctx.strokeStyle = `rgba(159,216,255,${Math.max(0, w.life * 1.6)})`;
      ctx.lineWidth = Math.max(2, 4 * zoom);
      ctx.beginPath(); ctx.arc(sx(w.x), sy(w.y), w.r * zoom, 0, 7); ctx.stroke();
    }

    // runas que estallan
    for (const h of s.hits) {
      ctx.fillStyle = `rgba(192,139,255,${h.life * 2})`;
      ctx.beginPath(); ctx.arc(sx(h.x), sy(h.y), h.r * zoom, 0, 7); ctx.fill();
    }

    // diablillo del Leviatán
    if (s.minion) inkFigure(sx(s.minion.x), sy(s.minion.y), 16 * zoom, { gold: true, bob: performance.now() / 120, alpha: 0.9 });

    // jefe
    if (s.boss && !s.boss.dead) {
      const b = s.boss, x = sx(b.x), y = sy(b.y);
      const aura = 0.5 + 0.5 * Math.sin(b.t * 3);
      ctx.strokeStyle = `rgba(255,210,63,${0.25 + aura * 0.35})`;
      ctx.lineWidth = Math.max(2, 4 * zoom);
      ctx.beginPath(); ctx.arc(x, y, (66 + aura * 6) * zoom, 0, 7); ctx.stroke();
      inkFigure(x, y, 54 * zoom, { bob: b.t * 3, facing: Math.atan2(s.p.y - b.y, s.p.x - b.x), hp: b.hp / b.maxhp });
      if (b.iframe > 0) { // fase nueva: destello
        ctx.fillStyle = `rgba(255,210,63,${b.iframe * 0.35})`;
        ctx.beginPath(); ctx.arc(x, y, 90 * zoom, 0, 7); ctx.fill();
      }
    }

    // peregrino
    const px = sx(s.p.x), py = sy(s.p.y);
    ctx.strokeStyle = 'rgba(255,210,63,.16)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(px, py, s.magnet * zoom, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    if (s.inv > 0) { // parpadeo de invulnerabilidad
      ctx.strokeStyle = `rgba(255,210,63,${0.3 + 0.4 * Math.sin(performance.now() / 40)})`;
      ctx.lineWidth = Math.max(1.5, 2.5 * zoom);
      ctx.beginPath(); ctx.arc(px, py, 34 * zoom, 0, 7); ctx.stroke();
    }
    drawPilgrim(px, py, 24 * zoom, fx?.skin || '#ffd23f', s.inv > 0 ? 0.8 : 1);

    // partículas
    for (const pt of s.parts) {
      ctx.globalAlpha = Math.max(0, pt.life * 2.4);
      ctx.fillStyle = pt.kind === 'ink' ? '#0d0906' : '#ffd23f';
      const sz = Math.max(2, 6 * zoom);
      ctx.fillRect(sx(pt.x) - sz / 2, sy(pt.y) - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    if (fx && fx.flash) { ctx.fillStyle = `rgba(255,210,63,${fx.flash * 0.3})`; ctx.fillRect(0, 0, W, H); }
    if (fx && fx.hurt) { ctx.fillStyle = `rgba(194,42,58,${fx.hurt * 0.3})`; ctx.fillRect(0, 0, W, H); }
    // viñeta
    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }
  return { draw, resize };
}
