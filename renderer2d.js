/**
 * 馬上槍試合 — 2D横画面レンダラー
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
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    g.addColorStop(0, '#6b8cae');
    g.addColorStop(1, '#c4a574');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h * 0.65);
  }

  function drawColosseum() {
    const groundY = h * 0.68;
    const cx = w * 0.5;

    ctx.fillStyle = '#8b7355';
    ctx.beginPath();
    ctx.ellipse(cx, groundY + h * 0.08, w * 0.55, h * 0.12, 0, Math.PI, 0);
    ctx.fill();

    ctx.strokeStyle = '#6b5344';
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const angle = Math.PI + (i / 13) * Math.PI;
      const x1 = cx + Math.cos(angle) * w * 0.48;
      const y1 = groundY + Math.sin(angle) * h * 0.1;
      const x2 = cx + Math.cos(angle) * w * 0.42;
      const y2 = groundY - h * 0.02;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.fillStyle = '#c9a86c';
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      const x = w * 0.08 + t * w * 0.84;
      ctx.fillRect(x, groundY - h * 0.22, 6, h * 0.22);
    }

    ctx.fillStyle = '#5c4033';
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = '#4a3520';
    for (let i = 0; i < 16; i++) {
      ctx.fillRect((i / 16) * w, groundY, w / 32, 3);
    }
  }

  function drawWoodenFence() {
    const groundY = h * 0.68;
    const fenceW = w * 0.035;
    const fenceH = h * 0.32;
    const x = w * 0.5 - fenceW / 2;

    ctx.fillStyle = '#6b4423';
    ctx.fillRect(x, groundY - fenceH, fenceW, fenceH);

    ctx.strokeStyle = '#4a2f15';
    ctx.lineWidth = 2;
    const planks = 8;
    for (let i = 0; i <= planks; i++) {
      const y = groundY - fenceH + (i / planks) * fenceH;
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + fenceW + 4, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#5a3818';
    ctx.fillRect(x - 6, groundY - fenceH - 8, fenceW + 12, 10);
    ctx.fillRect(x - 6, groundY - 10, fenceW + 12, 10);
  }

  function drawKnight(xNorm, lanceH, facingRight, isMe) {
    const groundY = h * 0.68;
    const x = xNorm * w;
    const sc = h * 0.0011;
    const horseW = 90 * sc;
    const horseH = 50 * sc;

    ctx.save();
    ctx.translate(x, groundY - horseH * 0.25);
    if (!facingRight) ctx.scale(-1, 1);

    ctx.fillStyle = '#3d2817';
    ctx.fillRect(-horseW * 0.45, 0, horseW * 0.9, horseH * 0.35);

    ctx.fillStyle = isMe ? '#2d4a6e' : '#6e2d2d';
    ctx.beginPath();
    ctx.ellipse(0, -horseH * 0.35, horseW * 0.32, horseH * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(horseW * 0.05, -horseH * 0.75, horseH * 0.22, 0, Math.PI * 2);
    ctx.fill();

    const lanceAngle = -0.35 + lanceH * 0.75;
    const lanceLen = horseW * 1.5;
    const lx = horseW * 0.15;
    const ly = -horseH * 0.65;
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 5 * sc;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(lanceAngle) * lanceLen, ly + Math.sin(lanceAngle) * lanceLen);
    ctx.stroke();

    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.moveTo(lx + Math.cos(lanceAngle) * lanceLen, ly + Math.sin(lanceAngle) * lanceLen);
    ctx.lineTo(lx + Math.cos(lanceAngle) * lanceLen + 8 * sc, ly + Math.sin(lanceAngle) * lanceLen - 4 * sc);
    ctx.lineTo(lx + Math.cos(lanceAngle) * lanceLen + 8 * sc, ly + Math.sin(lanceAngle) * lanceLen + 4 * sc);
    ctx.fill();

    ctx.restore();
  }

  function drawImpactFlash(intensity) {
    if (!intensity) return;
    ctx.fillStyle = `rgba(255,220,120,${intensity * 0.55})`;
    ctx.fillRect(0, 0, w, h);
  }

  function render(state) {
    if (w < 1 || h < 1) return;
    drawSky();
    drawColosseum();
    drawWoodenFence();

    drawKnight(state.myX ?? 0.12, state.myLanceH ?? 0.5, true, true);
    drawKnight(state.oppX ?? 0.88, state.oppLanceH ?? 0.5, false, false);

    drawImpactFlash(state.impactFlash);
  }

  resize();
  return { resize, render };
}

if (typeof window !== 'undefined') window.createRenderer2D = createRenderer2D;
