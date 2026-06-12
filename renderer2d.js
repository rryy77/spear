/**
 * Joust Royale — 2.5D 横画面レンダラー（Canvas）
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
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a2744');
    g.addColorStop(0.5, '#3d2f4a');
    g.addColorStop(1, '#5c4033');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawArena() {
    const groundY = h * 0.72;
    ctx.fillStyle = '#3d2817';
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = '#4a3520';
    for (let i = 0; i < 12; i++) {
      const x = (i / 12) * w;
      ctx.fillRect(x, groundY, w / 24, 4);
    }
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, groundY - h * 0.35);
    ctx.lineTo(w * 0.5, groundY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,180,140,0.15)';
    ctx.fillRect(w * 0.48, groundY - h * 0.35, w * 0.04, h * 0.35);
  }

  function drawKnight(xNorm, lanceH, facing, color, label) {
    const groundY = h * 0.72;
    const x = xNorm * w;
    const scale = h * 0.0012;
    const horseW = 80 * scale;
    const horseH = 45 * scale;

    ctx.save();
    ctx.translate(x, groundY - horseH * 0.3);
    if (facing < 0) ctx.scale(-1, 1);

    ctx.fillStyle = '#2a1810';
    ctx.fillRect(-horseW * 0.5, -horseH * 0.2, horseW, horseH * 0.5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -horseH * 0.5, horseW * 0.35, horseH * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    const lanceAngle = -0.4 + lanceH * 0.8;
    const lanceLen = horseW * 1.4;
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.moveTo(horseW * 0.2, -horseH * 0.7);
    ctx.lineTo(
      horseW * 0.2 + Math.cos(lanceAngle) * lanceLen,
      -horseH * 0.7 + Math.sin(lanceAngle) * lanceLen
    );
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -horseH * 1.1);
    ctx.restore();
  }

  function drawCountdown(num) {
    if (!num) return;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${h * 0.25}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), w / 2, h / 2);
  }

  function drawImpactFlash(intensity) {
    if (!intensity) return;
    ctx.fillStyle = `rgba(255,200,100,${intensity * 0.6})`;
    ctx.fillRect(0, 0, w, h);
  }

  function render(state) {
    if (w < 1 || h < 1) return;
    drawSky();
    drawArena();

    const hostX = state.hostX ?? 0.12;
    const guestX = state.guestX ?? 0.88;
    drawKnight(hostX, state.hostLanceH ?? 0.5, 1, '#4a6fa5', state.hostName || 'A');
    drawKnight(guestX, state.guestLanceH ?? 0.5, -1, '#a54a4a', state.guestName || 'B');

    drawCountdown(state.countdownNum);
    drawImpactFlash(state.impactFlash);
  }

  resize();
  return { resize, render };
}

if (typeof window !== 'undefined') window.createRenderer2D = createRenderer2D;
