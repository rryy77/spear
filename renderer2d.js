/**
 * 縦画面2.5D Joust レンダラー — 馬・騎士・槍・盾・兜・ティルト
 */
function createRenderer2D(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;

  function resize() {
    const rect = canvas.parentElement?.getBoundingClientRect();
    const cw = rect?.width || canvas.clientWidth || window.innerWidth;
    const ch = rect?.height || canvas.clientHeight || window.innerHeight;
    if (cw < 1 || ch < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    w = cw;
    h = ch;
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.42);
    g.addColorStop(0, '#4a7ab8');
    g.addColorStop(0.55, '#9cb8d8');
    g.addColorStop(1, '#c8b888');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h * 0.42);
  }

  function drawBackground() {
    const gy = h * 0.38;
    ctx.fillStyle = '#5a7a42';
    ctx.fillRect(0, gy - h * 0.04, w, h * 0.05);

    ctx.fillStyle = '#6a5a48';
    ctx.fillRect(0, gy - h * 0.14, w, h * 0.11);
    for (let i = 0; i < 10; i++) {
      const x = (i / 9) * w;
      const th = h * (0.05 + (i % 3) * 0.012);
      ctx.fillStyle = '#8a7a68';
      ctx.fillRect(x - w * 0.035, gy - h * 0.14 - th, w * 0.07, th);
      ctx.fillStyle = '#5a4a38';
      ctx.fillRect(x - w * 0.03, gy - h * 0.14 - th - 3, w * 0.06, 4);
    }

    for (let i = 0; i < 16; i++) {
      const fx = (i / 15) * w;
      ctx.fillStyle = i % 2 ? '#a33' : '#c44';
      ctx.beginPath();
      ctx.moveTo(fx, gy - h * 0.13);
      ctx.lineTo(fx + 5, gy - h * 0.17);
      ctx.lineTo(fx + 10, gy - h * 0.13);
      ctx.fill();
    }
  }

  function drawArena() {
    const top = h * 0.4;
    const bot = h;
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#c9a86c');
    g.addColorStop(0.5, '#9a7848');
    g.addColorStop(1, '#6b5030');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, top);
    ctx.lineTo(w * 0.94, top);
    ctx.lineTo(w * 0.86, bot);
    ctx.lineTo(w * 0.14, bot);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(60,40,15,0.2)';
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const y = top + (bot - top) * t;
      ctx.beginPath();
      ctx.moveTo(w * (0.06 + t * 0.08), y);
      ctx.lineTo(w * (0.94 - t * 0.08), y);
      ctx.stroke();
    }

    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.28, top);
    ctx.lineTo(w * 0.22, bot);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.72, top);
    ctx.lineTo(w * 0.78, bot);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawTilt() {
    const cx = w * 0.5;
    const top = h * 0.36;
    const bot = h * 0.78;
    const tw = w * 0.065;

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(cx - tw * 0.7, bot - 5, tw * 1.4, 8);

    const g = ctx.createLinearGradient(cx - tw, 0, cx + tw, 0);
    g.addColorStop(0, '#4a2a10');
    g.addColorStop(0.45, '#9a6830');
    g.addColorStop(1, '#3d2010');
    ctx.fillStyle = g;
    ctx.fillRect(cx - tw / 2, top, tw, bot - top);

    ctx.strokeStyle = '#2a1508';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 14; i++) {
      const y = top + ((bot - top) / 14) * i;
      ctx.beginPath();
      ctx.moveTo(cx - tw / 2 - 4, y);
      ctx.lineTo(cx + tw / 2 + 4, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#3d2010';
    ctx.fillRect(cx - tw / 2 - 8, top - 8, tw + 16, 10);
    ctx.fillRect(cx - tw / 2 - 8, bot - 10, tw + 16, 10);

    ctx.fillStyle = 'rgba(255,220,150,0.15)';
    ctx.font = `bold ${h * 0.018}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('TILT', cx, top + (bot - top) * 0.5);
  }

  function drawKnight(x, y, scale, facingDown, isPlayer, opts) {
    const sc = h * 0.001 * scale;
    const horseW = 95 * sc;
    const horseH = 52 * sc;
    const kb = (opts?.knockback || 0) * h * 0.06;
    const unhorsed = opts?.unhorsed || false;

    ctx.save();
    ctx.translate(x * w, y * h + kb);
    if (!facingDown) ctx.scale(1, -1);

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, horseH * 0.15, horseW * 0.55, horseH * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!unhorsed) {
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(-horseW * 0.42, 0, horseW * 0.84, horseH * 0.32);
      ctx.fillStyle = '#5c3d28';
      ctx.beginPath();
      ctx.ellipse(-horseW * 0.35, horseH * 0.1, horseW * 0.12, horseH * 0.1, 0, 0, Math.PI * 2);
      ctx.ellipse(horseW * 0.35, horseH * 0.1, horseW * 0.12, horseH * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const bodyColor = isPlayer ? '#2a4468' : '#682a2a';
    const aim = opts?.aim || 'MID';
    const lean = aim === 'HIGH' ? -0.08 : aim === 'LOW' ? 0.1 : 0;

    ctx.save();
    ctx.rotate(lean);

    if (!unhorsed) {
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.ellipse(0, -horseH * 0.38, horseW * 0.28, horseH * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#8a9098';
    ctx.beginPath();
    ctx.arc(horseW * 0.02, -horseH * (unhorsed ? 0.2 : 0.78), horseH * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#606878';
    ctx.fillRect(horseW * 0.02 - horseH * 0.08, -horseH * (unhorsed ? 0.35 : 0.95), horseH * 0.16, horseH * 0.2);

    ctx.fillStyle = '#a0a8b0';
    ctx.beginPath();
    ctx.moveTo(horseW * 0.02, -horseH * (unhorsed ? 0.45 : 1.05));
    ctx.lineTo(horseW * 0.02 + horseH * 0.2, -horseH * (unhorsed ? 0.55 : 1.15));
    ctx.lineTo(horseW * 0.02 + horseH * 0.05, -horseH * (unhorsed ? 0.35 : 0.95));
    ctx.fill();

    ctx.fillStyle = '#708090';
    ctx.beginPath();
    ctx.ellipse(-horseW * 0.15, -horseH * 0.55, horseW * 0.14, horseH * 0.22, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2 * sc;
    ctx.stroke();

    const lanceOut = opts?.lanceOut;
    const lanceBroken = opts?.lanceBroken;
    const lanceAngle = aim === 'HIGH' ? -0.55 : aim === 'LOW' ? 0.2 : -0.25;
    const lanceLen = horseW * (lanceOut ? 1.55 : 0.9);
    const lx = horseW * 0.12;
    const ly = -horseH * 0.62;
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 5 * sc;
    ctx.lineCap = 'round';
    if (lanceBroken) {
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + Math.cos(lanceAngle) * lanceLen * 0.5, ly + Math.sin(lanceAngle) * lanceLen * 0.5);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = lanceAngle + (i - 1.5) * 0.4;
        ctx.beginPath();
        ctx.moveTo(lx + Math.cos(lanceAngle) * lanceLen * 0.5, ly + Math.sin(lanceAngle) * lanceLen * 0.5);
        ctx.lineTo(lx + Math.cos(lanceAngle) * lanceLen * 0.5 + Math.cos(a) * 12 * sc, ly + Math.sin(lanceAngle) * lanceLen * 0.5 + Math.sin(a) * 12 * sc);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + Math.cos(lanceAngle) * lanceLen, ly + Math.sin(lanceAngle) * lanceLen);
      ctx.stroke();
      ctx.fillStyle = '#bbb';
      const tipX = lx + Math.cos(lanceAngle) * lanceLen;
      const tipY = ly + Math.sin(lanceAngle) * lanceLen;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + 7 * sc, tipY - 4 * sc);
      ctx.lineTo(tipX + 7 * sc, tipY + 4 * sc);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  function drawImpact(intensity, color) {
    if (!intensity) return;
    const cx = w * 0.5;
    const cy = h * 0.56;
    const r = w * 0.22 * intensity;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color || `rgba(255,220,80,${intensity})`);
    g.addColorStop(1, 'rgba(255,180,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawCheer(a) {
    if (!a) return;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.75})`;
    ctx.font = `bold ${h * 0.028}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('観客の歓声！', w / 2, h * 0.32);
  }

  function render(state) {
    if (w < 1 || h < 1) return;
    const shake = (state.shake || 0) * (Math.random() - 0.5) * 14;
    ctx.save();
    ctx.translate(shake, shake * 0.6);

    drawSky();
    drawBackground();
    drawArena();
    drawTilt();

    const pp = state.playerPos || { x: 0.28, y: 0.88, scale: 0.85 };
    const ep = state.enemyPos || { x: 0.72, y: 0.12, scale: 0.55 };

    drawKnight(pp.x, pp.y, pp.scale, true, true, {
      aim: state.playerAim,
      lanceOut: state.playerLanceOut,
      lanceBroken: state.playerLanceBroken,
      knockback: state.playerKnock,
      unhorsed: state.playerUnhorsed,
    });
    drawKnight(ep.x, ep.y, ep.scale, false, false, {
      aim: state.enemyAim,
      lanceOut: state.enemyLanceOut,
      lanceBroken: state.enemyLanceBroken,
      knockback: state.enemyKnock,
      unhorsed: state.enemyUnhorsed,
    });

    drawImpact(state.impactFlash, state.impactColor);
    drawCheer(state.crowdCheer);
    ctx.restore();
  }

  resize();
  return { resize, render };
}

if (typeof window !== 'undefined') window.createRenderer2D = createRenderer2D;
