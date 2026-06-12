// ROCK YOU! — オンラインマルチプレイ 馬上槍試合

const PHASE = { LOBBY: 'lobby', AIM: 'aim', CHARGE: 'charge', RESULT: 'result', FINISHED: 'finished' };

const MOVE_SPEED = 0.022;
const HEIGHT_SPEED = 0.035;
const AIM_SEND_INTERVAL = 80;

// ── DOM ─────────────────────────────────────────────────
const screens = {
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-lobby'),
  result: document.getElementById('screen-result'),
};
screens.game = document.getElementById('screen-game');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const bloodOverlay = document.getElementById('blood-overlay');

// ── State ───────────────────────────────────────────────
const app = {
  ws: null,
  role: null,
  roomCode: null,
  opponentName: '',
  phase: PHASE.LOBBY,
  round: 1,
  x: 0.5,
  height: 0.5,
  armor: { head: 100, torso: 100, legs: 100 },
  oppArmor: { head: 100, torso: 100, legs: 100 },
  chargeProgress: 0,
  chargeStart: 0,
  chargeDuration: 2500,
  aimEndsAt: 0,
  lastAimSend: 0,
  bobPhase: 0,
  shake: 0,
  bloodLevel: 0,
};

const heldDirs = new Set();
let aimTimerInterval = null;

// ── WebSocket ───────────────────────────────────────────
async function getWsUrl() {
  if (window.__WS_URL__) {
    return String(window.__WS_URL__).replace(/\/$/, '');
  }
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.wsUrl) return data.wsUrl.replace(/\/$/, '');
    }
  } catch {
    // ローカル開発など /api/config が無い場合は同一ホストへ接続
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

async function connect() {
  const url = await getWsUrl();

  if (!url) {
    setStatus('WebSocketサーバー未設定（Vercelの WS_URL を設定してください）');
    setTimeout(connect, 5000);
    return;
  }

  app.ws = new WebSocket(url);

  app.ws.onopen = () => {
    setStatus('接続済み');
  };

  app.ws.onclose = () => {
    setStatus('切断されました。再接続中…');
    setTimeout(connect, 2000);
  };

  app.ws.onerror = () => {
    setStatus('接続エラー — ゲームサーバーに届いていません');
  };

  app.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };
}

function send(type, payload = {}) {
  if (app.ws?.readyState === WebSocket.OPEN) {
    app.ws.send(JSON.stringify({ type, ...payload }));
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'connected':
      setStatus('接続済み');
      break;

    case 'room_created':
      app.role = msg.role;
      app.roomCode = msg.code;
      showWaiting(msg.code, true);
      break;

    case 'room_joined':
      app.role = msg.role;
      app.roomCode = msg.code;
      showWaiting(msg.code, false);
      break;

    case 'player_joined':
      document.getElementById('waiting-message').textContent =
        `${msg.guestName} が参加しました！`;
      document.getElementById('btn-start').classList.remove('hidden');
      break;

    case 'lobby_update':
      if (msg.canStart) {
        document.getElementById('btn-start').classList.remove('hidden');
        document.getElementById('waiting-message').textContent = '対戦相手が参加しました！';
      }
      break;

    case 'game_start':
      app.opponentName = app.role === 'host' ? msg.guestName : msg.hostName;
      document.getElementById('opp-name').textContent = app.opponentName;
      showScreen('game');
      break;

    case 'round_start':
      startRound(msg);
      break;

    case 'charge_start':
      startCharge(msg.duration);
      break;

    case 'round_result':
      showRoundResult(msg);
      break;

    case 'player_left':
      showError(msg.message);
      resetToLobby();
      break;

    case 'error':
      showError(msg.message);
      break;
  }
}

// ── Lobby UI ────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

function showError(msg) {
  const el = document.getElementById('lobby-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function setStatus(msg) {
  document.getElementById('connection-status').textContent = msg;
}

function showWaiting(code, isHost) {
  document.getElementById('lobby-menu').classList.add('hidden');
  document.getElementById('lobby-join').classList.add('hidden');
  document.getElementById('lobby-waiting').classList.remove('hidden');
  document.getElementById('display-code').textContent = code;
  document.getElementById('waiting-message').textContent = isHost
    ? '対戦相手の参加を待っています…'
    : 'ホストの開始を待っています…';
  document.getElementById('btn-start').classList.toggle('hidden', !isHost);
}

function resetToLobby() {
  app.role = null;
  app.roomCode = null;
  app.phase = PHASE.LOBBY;
  document.getElementById('lobby-menu').classList.remove('hidden');
  document.getElementById('lobby-join').classList.add('hidden');
  document.getElementById('lobby-waiting').classList.add('hidden');
  document.getElementById('btn-start').classList.add('hidden');
  showScreen('lobby');
}

function getPlayerName() {
  return document.getElementById('player-name').value.trim() || '無名の騎士';
}

document.getElementById('btn-create').addEventListener('click', () => {
  send('create_room', { name: getPlayerName() });
});

document.getElementById('btn-join-open').addEventListener('click', () => {
  document.getElementById('lobby-menu').classList.add('hidden');
  document.getElementById('lobby-join').classList.remove('hidden');
});

document.getElementById('btn-join-back').addEventListener('click', () => {
  document.getElementById('lobby-join').classList.add('hidden');
  document.getElementById('lobby-menu').classList.remove('hidden');
});

document.getElementById('btn-join').addEventListener('click', () => {
  const code = document.getElementById('room-code-input').value.trim();
  if (!code) { showError('ルームコードを入力してください'); return; }
  send('join_room', { code, name: getPlayerName() });
});

document.getElementById('btn-start').addEventListener('click', () => {
  send('start_game');
});

document.getElementById('btn-leave').addEventListener('click', () => {
  send('leave_room');
  resetToLobby();
});

document.getElementById('btn-back-lobby').addEventListener('click', () => {
  send('leave_room');
  resetToLobby();
});

// ── Game Logic ──────────────────────────────────────────
function startRound(msg) {
  app.round = msg.round;
  app.phase = PHASE.AIM;
  app.x = 0.5;
  app.height = 0.5;
  app.chargeProgress = 0;
  app.aimEndsAt = Date.now() + msg.aimDuration;

  const myKey = app.role;
  app.armor = { ...msg.armor[myKey] };
  const oppKey = app.role === 'host' ? 'guest' : 'host';
  app.oppArmor = { ...msg.armor[oppKey] };

  updateArmorUI();
  document.getElementById('hud-round').textContent = `第 ${app.round} 試合`;
  document.getElementById('hud-phase').textContent = '位置合わせ';
  document.getElementById('result-toast').classList.add('hidden');
  fadeBlood();

  if (aimTimerInterval) clearInterval(aimTimerInterval);
  aimTimerInterval = setInterval(updateAimTimer, 200);
}

function updateAimTimer() {
  if (app.phase !== PHASE.AIM) return;
  const left = Math.max(0, Math.ceil((app.aimEndsAt - Date.now()) / 1000));
  document.getElementById('hud-timer').textContent = left;
}

function startCharge(duration) {
  app.phase = PHASE.CHARGE;
  app.chargeStart = performance.now();
  app.chargeDuration = duration;
  document.getElementById('hud-phase').textContent = '突撃！';
  if (aimTimerInterval) clearInterval(aimTimerInterval);
}

const ZONE_LABELS = { head: '頭', torso: '胴体', legs: '足' };

function showRoundResult(msg) {
  app.phase = PHASE.RESULT;
  const myAttack = app.role === 'host' ? msg.hostAttack : msg.guestAttack;
  const theirAttack = app.role === 'host' ? msg.guestAttack : msg.hostAttack;

  app.armor = { ...msg.armor[app.role] };
  app.oppArmor = { ...msg.armor[app.role === 'host' ? 'guest' : 'host'] };
  updateArmorUI();

  const toast = document.getElementById('result-toast');
  let html = '';
  if (myAttack.damage > 0) {
    html += `あなたの一撃！ <span class="hit">${ZONE_LABELS[myAttack.zone]}</span>に <span class="dmg">${myAttack.damage}</span> ダメージ<br>`;
  } else {
    html += 'あなたの一撃は外れた…<br>';
  }
  if (theirAttack.damage > 0) {
    html += `被弾！ <span class="hit">${ZONE_LABELS[theirAttack.zone]}</span>に <span class="dmg">${theirAttack.damage}</span> ダメージ`;
    showBlood(theirAttack.damage);
    app.shake = theirAttack.damage * 0.15;
  } else {
    html += '相手の一撃をかわした！';
  }
  toast.innerHTML = html;
  toast.classList.remove('hidden');

  if (msg.gameOver) {
    setTimeout(() => showGameOver(msg), 3000);
  }
}

function showGameOver(msg) {
  app.phase = PHASE.FINISHED;
  const won = msg.winner === app.role;
  const draw = msg.winner === 'draw';
  document.getElementById('result-title').textContent = draw ? '引き分け' : won ? '🏆 勝利！' : '敗北…';
  document.getElementById('result-message').textContent = draw
    ? '両騎士とも鎧が砕け散った…'
    : won ? '見事な馬上槍試合の勝利です！' : '鎧が全て砕かれました…';
  showScreen('result');
}

function updateArmorUI() {
  for (const part of ['head', 'torso', 'legs']) {
    document.getElementById(`armor-${part}`).style.width = `${app.armor[part]}%`;
    document.getElementById(`val-${part}`).textContent = app.armor[part];
    document.getElementById(`opp-${part}`).textContent =
      `${part === 'head' ? '頭' : part === 'torso' ? '胴' : '足'}${app.oppArmor[part]}`;
  }
}

// ── Blood overlay ───────────────────────────────────────
function showBlood(damage) {
  const intensity = damage / 100;
  bloodOverlay.classList.remove('fade', 'creep');
  bloodOverlay.style.opacity = '0';

  const spread = 45 - intensity * 18;
  const filters = [
    `radial-gradient(ellipse ${100 + intensity * 50}% ${75 + intensity * 35}% at 0% 0%, rgba(150,12,12,${0.75 + intensity * 0.25}) 0%, transparent ${spread}%)`,
    `radial-gradient(ellipse ${100 + intensity * 50}% ${75 + intensity * 35}% at 100% 0%, rgba(150,12,12,${0.75 + intensity * 0.25}) 0%, transparent ${spread}%)`,
    `radial-gradient(ellipse ${100 + intensity * 50}% ${75 + intensity * 35}% at 0% 100%, rgba(130,10,10,${0.7 + intensity * 0.3}) 0%, transparent ${spread}%)`,
    `radial-gradient(ellipse ${100 + intensity * 50}% ${75 + intensity * 35}% at 100% 100%, rgba(130,10,10,${0.7 + intensity * 0.3}) 0%, transparent ${spread}%)`,
    `radial-gradient(ellipse ${65 + intensity * 35}% ${45 + intensity * 25}% at 50% 50%, rgba(100,6,6,${0.15 + intensity * 0.45}) 0%, transparent 60%)`,
  ];
  bloodOverlay.style.background = filters.join(',');
  bloodOverlay.style.setProperty('--blood-peak', String(0.35 + intensity * 0.65));

  void bloodOverlay.offsetWidth;
  bloodOverlay.classList.add('creep');
  bloodOverlay.style.opacity = String(0.35 + intensity * 0.65);
}

function fadeBlood() {
  bloodOverlay.classList.remove('creep');
  bloodOverlay.classList.add('fade');
  setTimeout(() => {
    bloodOverlay.classList.remove('fade');
    bloodOverlay.style.opacity = '0';
  }, 4000);
}

// ── Input ───────────────────────────────────────────────
document.querySelectorAll('.arrow-btn').forEach(btn => {
  const dir = btn.dataset.dir;
  const press = (e) => { e.preventDefault(); heldDirs.add(dir); btn.classList.add('pressed'); };
  const release = (e) => { e.preventDefault(); heldDirs.delete(dir); btn.classList.remove('pressed'); };
  btn.addEventListener('touchstart', press, { passive: false });
  btn.addEventListener('touchend', release, { passive: false });
  btn.addEventListener('touchcancel', release, { passive: false });
  btn.addEventListener('mousedown', press);
  btn.addEventListener('mouseup', release);
  btn.addEventListener('mouseleave', release);
});

function applyInput() {
  if (app.phase !== PHASE.AIM && app.phase !== PHASE.CHARGE) return;
  const speed = app.phase === PHASE.CHARGE ? MOVE_SPEED * 0.3 : MOVE_SPEED;
  const hSpeed = app.phase === PHASE.CHARGE ? HEIGHT_SPEED * 0.3 : HEIGHT_SPEED;

  if (heldDirs.has('left'))  app.x = Math.max(0.1, app.x - speed);
  if (heldDirs.has('right')) app.x = Math.min(0.9, app.x + speed);
  if (heldDirs.has('up'))    app.height = Math.max(0.05, app.height - hSpeed);
  if (heldDirs.has('down'))  app.height = Math.min(0.95, app.height + hSpeed);

  const now = performance.now();
  if (app.phase === PHASE.AIM && now - app.lastAimSend > AIM_SEND_INTERVAL) {
    app.lastAimSend = now;
    send('update_aim', { x: app.x, height: app.height });
  }
}

// ── FPS Renderer ────────────────────────────────────────
function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function drawFPS(w, h) {
  app.bobPhase += 0.06;
  const bob = Math.sin(app.bobPhase) * 3;
  const shakeX = app.shake > 0 ? (Math.random() - 0.5) * app.shake : 0;
  const shakeY = app.shake > 0 ? (Math.random() - 0.5) * app.shake * 0.5 : 0;
  if (app.shake > 0) app.shake *= 0.9;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.45);
  sky.addColorStop(0, '#3a5070');
  sky.addColorStop(1, '#7a9ab8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.45);

  // Distant hills / crowd
  ctx.fillStyle = '#2a3820';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.38);
  for (let i = 0; i <= 10; i++) {
    ctx.lineTo((i / 10) * w, h * 0.38 - Math.sin(i * 1.2) * 12);
  }
  ctx.lineTo(w, h * 0.42);
  ctx.lineTo(0, h * 0.42);
  ctx.fill();

  // Ground perspective (lists / sand track)
  const horizon = h * 0.42;
  const trackTopW = w * 0.08;
  const trackBotW = w * 0.95;

  ctx.fillStyle = '#4a6830';
  ctx.fillRect(0, horizon, w, h - horizon);

  // Sand track trapezoid
  ctx.fillStyle = '#b89850';
  ctx.beginPath();
  ctx.moveTo(w / 2 - trackTopW / 2, horizon);
  ctx.lineTo(w / 2 + trackTopW / 2, horizon);
  ctx.lineTo(w / 2 + trackBotW / 2, h);
  ctx.lineTo(w / 2 - trackBotW / 2, h);
  ctx.closePath();
  ctx.fill();

  // Track lines
  ctx.strokeStyle = 'rgba(100,75,20,0.35)';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    const topOff = i * trackTopW * 0.35;
    const botOff = i * trackBotW * 0.35;
    ctx.beginPath();
    ctx.moveTo(w / 2 + topOff, horizon);
    ctx.lineTo(w / 2 + botOff, h);
    ctx.stroke();
  }

  // Opponent during charge
  if (app.phase === PHASE.CHARGE || app.phase === PHASE.RESULT) {
    const t = app.phase === PHASE.CHARGE
      ? Math.min(1, (performance.now() - app.chargeStart) / app.chargeDuration)
      : 1;
    app.chargeProgress = t;
    drawOpponent(w, h, horizon, t);
  }

  // Height zone guide (subtle)
  if (app.phase === PHASE.AIM) {
    drawZoneGuide(w, h);
  }

  // First-person lance + hands
  drawFirstPerson(w, h, bob);

  ctx.restore();
}

function drawOpponent(w, h, horizon, t) {
  const ease = t * t * (3 - 2 * t);
  const dist = 1 - ease;
  const oppY = horizon + (h * 0.55 - horizon) * ease;
  const oppScale = 0.15 + ease * 1.8;
  const oppX = w / 2;

  ctx.save();
  ctx.translate(oppX, oppY);
  ctx.scale(oppScale, oppScale);

  // Horse silhouette
  ctx.fillStyle = '#3a2818';
  ctx.beginPath();
  ctx.ellipse(0, 20, 35, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Knight armor
  ctx.fillStyle = '#2a4a7a';
  ctx.beginPath();
  ctx.ellipse(0, -5, 18, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  // Helmet
  ctx.fillStyle = '#5a8ac8';
  ctx.beginPath();
  ctx.arc(0, -28, 14, 0, Math.PI * 2);
  ctx.fill();

  // Opponent lance pointing at us
  ctx.strokeStyle = '#8b6914';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 80);
  ctx.stroke();

  ctx.fillStyle = '#c0c0c0';
  ctx.beginPath();
  ctx.moveTo(0, 80);
  ctx.lineTo(0, 100);
  ctx.lineTo(-4, 80);
  ctx.fill();

  // Dust at feet when close
  if (t > 0.5) {
    ctx.globalAlpha = (t - 0.5) * 0.6;
    ctx.fillStyle = '#c4a35a';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(-30 + i * 15, 38, 6 + Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawZoneGuide(w, h) {
  const zones = [
    { y: h * 0.28, label: '頭', h: 0.34 },
    { y: h * 0.42, label: '胴', h: 0.33 },
    { y: h * 0.56, label: '足', h: 0.33 },
  ];
  const active = app.height < 0.34 ? 0 : app.height < 0.67 ? 1 : 2;

  zones.forEach((z, i) => {
    ctx.strokeStyle = i === active ? 'rgba(201,162,39,0.5)' : 'rgba(201,162,39,0.12)';
    ctx.lineWidth = i === active ? 2 : 1;
    ctx.setLineDash(i === active ? [] : [6, 6]);
    ctx.strokeRect(w * 0.3, z.y, w * 0.4, h * z.h * 0.5);
    ctx.setLineDash([]);
    if (i === active) {
      ctx.fillStyle = 'rgba(201,162,39,0.7)';
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.fillText(`← ${z.label} →`, w / 2, z.y + 16);
    }
  });

  // Horizontal position indicator
  const indX = w * 0.15 + app.x * w * 0.7;
  ctx.fillStyle = 'rgba(232,90,90,0.6)';
  ctx.beginPath();
  ctx.moveTo(indX, h * 0.12);
  ctx.lineTo(indX - 8, h * 0.12 + 12);
  ctx.lineTo(indX + 8, h * 0.12 + 12);
  ctx.fill();
}

function drawFirstPerson(w, h, bob) {
  const baseY = h * 0.72 + bob;
  const lanceAngle = (app.height - 0.5) * 0.9;

  // Horse mane / neck edge (bottom corners)
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.quadraticCurveTo(w * 0.15, h * 0.85 + bob, w * 0.3, h);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w, h);
  ctx.quadraticCurveTo(w * 0.85, h * 0.85 + bob, w * 0.7, h);
  ctx.fill();

  // Left gauntlet
  ctx.save();
  ctx.translate(w * 0.28, baseY);
  drawGauntlet(-1);
  ctx.restore();

  // Right gauntlet
  ctx.save();
  ctx.translate(w * 0.72, baseY);
  drawGauntlet(1);
  ctx.restore();

  // Lance
  ctx.save();
  ctx.translate(w / 2, baseY - 20);
  ctx.rotate(lanceAngle);

  // Shaft
  const grad = ctx.createLinearGradient(0, -10, 0, 10);
  grad.addColorStop(0, '#a08030');
  grad.addColorStop(1, '#6b5018');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(0, -h * 0.55);
  ctx.stroke();

  // Metal tip
  ctx.fillStyle = '#d0d0d8';
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.55);
  ctx.lineTo(0, -h * 0.55 - 28);
  ctx.lineTo(-6, -h * 0.55);
  ctx.closePath();
  ctx.fill();

  // Pennon
  ctx.fillStyle = '#8b1a1a';
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.25);
  ctx.lineTo(0, -h * 0.25 - 30);
  ctx.lineTo(18, -h * 0.25 - 15);
  ctx.fill();

  ctx.restore();

  // Vignette
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

function drawGauntlet(side) {
  // Arm
  ctx.fillStyle = '#4a3020';
  ctx.beginPath();
  ctx.ellipse(side * 8, 20, 22, 35, side * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Steel gauntlet
  const g = ctx.createLinearGradient(-15, 0, 15, 0);
  g.addColorStop(0, '#707880');
  g.addColorStop(0.5, '#b0b8c0');
  g.addColorStop(1, '#606870');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-14, -10);
  ctx.lineTo(14, -10);
  ctx.quadraticCurveTo(20, -10, 20, -4);
  ctx.lineTo(20, 36);
  ctx.quadraticCurveTo(20, 40, 14, 40);
  ctx.lineTo(-14, 40);
  ctx.quadraticCurveTo(-20, 40, -20, 36);
  ctx.lineTo(-20, -4);
  ctx.quadraticCurveTo(-20, -10, -14, -10);
  ctx.fill();

  // Fingers gripping lance
  ctx.fillStyle = '#9098a0';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(-8 + i * 5, -18, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Game Loop ───────────────────────────────────────────
function loop() {
  applyInput();

  if (app.phase === PHASE.CHARGE) {
    const t = Math.min(1, (performance.now() - app.chargeStart) / app.chargeDuration);
    app.chargeProgress = t;
  }

  const w = canvas.width / devicePixelRatio;
  const h = canvas.height / devicePixelRatio;
  ctx.clearRect(0, 0, w, h);

  if (app.phase !== PHASE.LOBBY && app.phase !== PHASE.FINISHED) {
    drawFPS(w, h);
  }

  requestAnimationFrame(loop);
}

// ── Init ────────────────────────────────────────────────
connect();
requestAnimationFrame(loop);
