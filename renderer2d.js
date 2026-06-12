/**
 * 縦画面2.5D 馬上槍試合レンダラー
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
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    g.addColorStop(0, '#5a8ec4');
    g.addColorStop(0.6, '#a8c8e8');
    g.addColorStop(1, '#d4c4a0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h * 0.45);
  }

  function drawCastleAndCrowd() {
    const baseY = h * 0.38;
    ctx.fillStyle = '#6b5a4a';
    ctx.fillRect(0, baseY - h * 0.12, w, h * 0.14);

    for (let i = 0; i < 9; i++) {
      const tx = (i / 8) * w;
      const th = h * (0.06 + (i % 3) * 0.015);
      ctx.fillStyle = '#8a7a68';
      ctx.fillRect(tx - w * 0.04, baseY - h * 0.12 - th, w * 0.08, th);
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(tx - w * 0.035, baseY - h * 0.12 - th - 4, w * 0.07, 5);
    }

    ctx.fillStyle = '#4a6741';
    ctx.fillRect(0, h * 0.36, w, h * 0.06);

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 14; col++) {
        const cx = (col / 13) * w;
        const cy = h * (0.34 + row * 0.018);
        ctx.fillStyle = row === 1 ? '#c44' : '#a33';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 6, cy - 14);
        ctx.lineTo(cx + 12, cy);
        ctx.fill();
      }
    }
  }

  function drawArenaFloor() {
    const top = h * 0.42;
    const bottom = h;

    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#c4a574');
    g.addColorStop(0.4, '#a08050');
    g.addColorStop(1, '#7a5c38');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.05, top);
    ctx.lineTo(w * 0.95, top);
    ctx.lineTo(w * 0.88, bottom);
    ctx.lineTo(w * 0.12, bottom);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(80,50,20,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const y = top + (bottom - top) * t;
      const lx = w * (0.05 + t * 0.07);
      const rx = w * (0.95 - t * 0.07);
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(rx, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(w * 0.28, top);
    ctx.lineTo(w * 0.22, bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.72, top);
    ctx.lineTo(w * 0.78, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawWoodenFence() {
    const cx = w * 0.5;
    const top = h * 0.38;
    const bottom = h * 0.78;
    const fw = w * 0.06;

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(cx - fw * 0.6, bottom - 4, fw * 1.2, 8);

    const g = ctx.createLinearGradient(cx - fw, 0, cx + fw, 0);
    g.addColorStop(0, '#5a3818');
    g.addColorStop(0.5, '#8b5a2b');
    g.addColorStop(1, '#4a2a10');
    ctx.fillStyle = g;
    ctx.fillRect(cx - fw / 2, top, fw, bottom - top);

    ctx.strokeStyle = '#3d2510';
    ctx.lineWidth = 2;
    const planks = 12;
    for (let i = 0; i <= planks; i++) {
      const y = top + ((bottom - top) / planks) * i;
      ctx.beginPath();
      ctx.moveTo(cx - fw / 2 - 3, y);
      ctx.lineTo(cx + fw / 2 + 3, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#4a2a10';
    ctx.fillRect(cx - fw / 2 - 5, top - 6, fw + 10, 8);
    ctx.fillRect(cx - fw / 2 - 5, bottom - 8, fw + 10, 8);
  }

  function drawKnight(x, y, scale, facingDown, isPlayer, lanceOut, knockback) {
    const sc = h * 0.001 * scale;
    const horseW = 70 * sc;
    const horseH = 40 * sc;
    const kb = knockback || 0;

    ctx.save();
    ctx.translate(x * w, y * h + kb * h * 0.08);
    if (!facingDown) ctx.scale(1, -1);

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, horseH * 0.2, horseW * 0.5, horseH * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3d2817';
    ctx.fillRect(-horseW * 0.4, -horseH * 0.1, horseW * 0.8, horseH * 0.35);

    ctx.fillStyle = isPlayer ? '#2a4a6e' : '#6e2a2a';
    ctx.beginPath();
    ctx.ellipse(0, -horseH * 0.35, horseW * 0.3, horseH * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#b0b0b0';
    ctx.beginPath();
    ctx.arc(horseW * 0.05, -horseH * 0.7, horseH * 0.2, 0, Math.PI * 2);
    ctx.fill();

    const lanceLen = horseW * (lanceOut ? 1.6 : 1.0);
    const lanceAngle = facingDown ? -0.15 : 0.15;
    const lx = horseW * 0.1;
    const ly = -horseH * 0.6;
    ctx.strokeStyle = '#a08020';
    ctx.lineWidth = 4 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(lanceAngle) * lanceLen, ly + Math.sin(lanceAngle) * lanceLen);
    ctx.stroke();

    if (lanceOut) {
      ctx.fillStyle = '#ccc';
      ctx.beginPath();
      const tipX = lx + Math.cos(lanceAngle) * lanceLen;
      const tipY = ly + Math.sin(lanceAngle) * lanceLen;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + 6 * sc, tipY - 3 * sc);
      ctx.lineTo(tipX + 6 * sc, tipY + 3 * sc);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawImpactEffect(intensity, color) {
    if (!intensity) return;
    const cx = w * 0.5;
    const cy = h * 0.58;
    const r = w * 0.2 * intensity;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color || `rgba(255,220,80,${intensity * 0.9})`);
    g.addColorStop(1, 'rgba(255,200,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawLanceBreak() {
    const cx = w * 0.5;
    const cy = h * 0.55;
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * 30, cy + Math.sin(ang) * 20);
      ctx.stroke();
    }
  }

  function drawCrowdCheer(alpha) {
    if (!alpha) return;
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;
    ctx.font = `bold ${h * 0.04}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('歓声！！', w / 2, h * 0.33);
  }

  function render(state) {
    if (w < 1 || h < 1) return;
    const shakeX = (state.shake || 0) * (Math.random() - 0.5) * 12;
    const shakeY = (state.shake || 0) * (Math.random() - 0.5) * 8;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawSky();
    drawCastleAndCrowd();
    drawArenaFloor();
    drawWoodenFence();

    const pp = state.playerPos || { x: 0.28, y: 0.88, scale: 0.85 };
    const ep = state.enemyPos || { x: 0.72, y: 0.12, scale: 0.55 };

    drawKnight(pp.x, pp.y, pp.scale, true, true, state.playerLanceOut, state.playerKnock);
    drawKnight(ep.x, ep.y, ep.scale, false, false, state.enemyLanceOut, state.enemyKnock);

    drawImpactEffect(state.impactFlash, state.impactColor);
    if (state.lanceBreak) drawLanceBreak();
    drawCrowdCheer(state.crowdCheer);

    ctx.restore();
  }

  resize();
  return { resize, render };
}

if (typeof window !== 'undefined') window.createRenderer2D = createRenderer2D;
