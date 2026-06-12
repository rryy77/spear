// 馬上槍試合 — オンライン1vs1

const PHASE = {
  LOBBY: 'lobby',
  WAITING: 'waiting',
  COUNTDOWN: 'countdown',
  CHARGE: 'charge',
  RESULT: 'result',
  FINISHED: 'finished',
};

const Sim = JoustSim;
const LANCE_SEND_INTERVAL = 100;

const canvas = document.getElementById('game-canvas');
const gameScreen = document.getElementById('screen-game');
let renderer = null;
let rafId = null;

const app = {
  ws: null,
  role: null,
  roomCode: null,
  playerName: '',
  opponentName: '',
  phase: PHASE.LOBBY,
  myReady: false,
  oppReady: false,
  matchStartTime: 0,
  lanceHeight: 0.5,
  oppLanceHeight: 0.5,
  countdownEndsAt: 0,
  lastLanceSend: 0,
  impactFlash: 0,
  rematchSent: false,
  drag: { active: false, id: null, lastY: 0 },
};

// ── WebSocket ───────────────────────────────────────────
async function getWsUrl() {
  if (window.__WS_URL__) return String(window.__WS_URL__).replace(/\/$/, '');
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.wsUrl) return data.wsUrl.replace(/\/$/, '');
    }
  } catch { /* local */ }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

async function connect() {
  const url = await getWsUrl();
  if (!url) {
    setStatus('WebSocket未設定');
    setTimeout(connect, 5000);
    return;
  }
  app.ws = new WebSocket(url);
  app.ws.onopen = () => setStatus('接続済み');
  app.ws.onclose = () => { setStatus('再接続中…'); setTimeout(connect, 2000); };
  app.ws.onerror = () => setStatus('接続エラー');
  app.ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
}

function send(type, payload = {}) {
  if (app.ws?.readyState === WebSocket.OPEN) {
    app.ws.send(JSON.stringify({ type, ...payload }));
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'connected': setStatus('接続済み'); break;
    case 'room_created':
      app.role = msg.role;
      app.roomCode = msg.code;
      showLobbyWaiting(msg.code);
      break;
    case 'room_joined':
      app.role = msg.role;
      app.roomCode = msg.code;
      break;
    case 'player_joined':
      app.opponentName = msg.guestName;
      break;
    case 'phase_waiting':
      onPhaseWaiting(msg);
      break;
    case 'ready_update':
      onReadyUpdate(msg);
      break;
    case 'match_countdown':
      onMatchCountdown(msg);
      break;
    case 'match_start':
      onMatchStart(msg);
      break;
    case 'lance_update':
      if (msg.role !== app.role) app.oppLanceHeight = msg.lanceHeight;
      break;
    case 'impact_result':
      onImpactResult(msg);
      break;
    case 'match_result':
      onMatchResult(msg);
      break;
    case 'phase_finished':
      onPhaseFinished();
      break;
    case 'rematch_state':
      onRematchState(msg);
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

// ── Screens ───────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  if (name === 'game') {
    requestAnimationFrame(() => {
      renderer?.resize();
      requestAnimationFrame(() => renderer?.resize());
    });
  }
}

function setStatus(t) {
  const el = document.getElementById('connection-status');
  if (el) el.textContent = t;
}

function showError(msg) {
  const el = document.getElementById('lobby-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function showLobbyWaiting(code) {
  document.getElementById('lobby-menu').classList.add('hidden');
  document.getElementById('lobby-join').classList.add('hidden');
  const wait = document.createElement('p');
  wait.className = 'hint';
  wait.id = 'waiting-code';
  wait.textContent = `コード: ${code} — 相手を待っています…`;
  document.querySelector('.lobby-card').appendChild(wait);
}

function resetToLobby() {
  stopGameLoop();
  app.phase = PHASE.LOBBY;
  app.role = null;
  app.roomCode = null;
  app.rematchSent = false;
  document.getElementById('lobby-menu')?.classList.remove('hidden');
  document.getElementById('lobby-join')?.classList.add('hidden');
  document.getElementById('waiting-code')?.remove();
  hideAllOverlays();
  showScreen('lobby');
}

function hideAllOverlays() {
  document.getElementById('ready-bar').classList.add('hidden');
  document.getElementById('lance-gauge').classList.add('hidden');
  document.getElementById('drag-hint').classList.add('hidden');
  document.getElementById('countdown-overlay').classList.add('hidden');
  document.getElementById('verdict-display').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('btn-ready').classList.remove('ready-on');
  document.getElementById('btn-ready').textContent = 'READY';
}

// ── Match flow ────────────────────────────────────────
function enterGameScreen() {
  showScreen('game');
  if (!renderer) renderer = createRenderer2D(canvas);
  renderer.resize();
  startGameLoop();
}

function onPhaseWaiting(msg) {
  app.phase = PHASE.WAITING;
  app.myReady = false;
  app.oppReady = false;
  app.lanceHeight = 0.5;
  if (msg.host) {
    if (app.role === 'host') {
      app.playerName = msg.host.name;
      app.myReady = msg.host.ready;
    } else {
      app.opponentName = msg.host.name;
      app.oppReady = msg.host.ready;
    }
  }
  if (msg.guest) {
    if (app.role === 'guest') {
      app.playerName = msg.guest.name;
      app.myReady = msg.guest.ready;
    } else {
      app.opponentName = msg.guest.name;
      app.oppReady = msg.guest.ready;
    }
  }
  hideAllOverlays();
  document.getElementById('ready-bar').classList.remove('hidden');
  updateReadyUI();
  enterGameScreen();
}

function onReadyUpdate(msg) {
  if (msg.host) {
    if (app.role === 'host') app.myReady = msg.host.ready;
    else app.oppReady = msg.host.ready;
  }
  if (msg.guest) {
    if (app.role === 'guest') app.myReady = msg.guest.ready;
    else app.oppReady = msg.guest.ready;
  }
  updateReadyUI();
}

function updateReadyUI() {
  const btn = document.getElementById('btn-ready');
  btn.textContent = app.myReady ? 'READY ✓' : 'READY';
  btn.classList.toggle('ready-on', app.myReady);
  document.getElementById('opp-ready-hint').textContent =
    app.oppReady ? '相手 READY — まもなく開始' : '相手の READY を待っています…';
}

function onMatchCountdown(msg) {
  app.phase = PHASE.COUNTDOWN;
  app.countdownEndsAt = msg.endsAt;
  document.getElementById('ready-bar').classList.add('hidden');
  document.getElementById('countdown-overlay').classList.remove('hidden');
}

function onMatchStart(msg) {
  app.phase = PHASE.CHARGE;
  app.matchStartTime = msg.matchStartTime;
  app.lanceHeight = 0.5;
  app.oppLanceHeight = 0.5;
  document.getElementById('countdown-overlay').classList.add('hidden');
  document.getElementById('lance-gauge').classList.remove('hidden');
  document.getElementById('drag-hint').classList.remove('hidden');
  updateGauge();
}

function onImpactResult(msg) {
  app.impactFlash = 1;
  const ir = msg.impactResult;
  const myTier = app.role === 'host' ? ir.hostTier : ir.guestTier;
  const oppTier = app.role === 'host' ? ir.guestTier : ir.hostTier;
  showVerdict(myTier, oppTier);
}

function onMatchResult(msg) {
  app.phase = PHASE.RESULT;
  const ir = msg.impactResult;
  const won = msg.winner === app.role;
  const draw = !msg.winner;
  const myTier = app.role === 'host' ? ir.hostTier : ir.guestTier;
  const oppTier = app.role === 'host' ? ir.guestTier : ir.hostTier;

  document.getElementById('drag-hint').classList.add('hidden');
  document.getElementById('lance-gauge').classList.add('hidden');

  setTimeout(() => {
    document.getElementById('result-title').textContent =
      draw ? '引き分け' : (won ? '勝利！' : '敗北…');
    document.getElementById('result-detail').textContent =
      `あなた: ${myTier} ／ 相手: ${oppTier}`;
    document.getElementById('result-overlay').classList.remove('hidden');
    document.getElementById('btn-rematch').disabled = false;
    app.rematchSent = false;
    document.getElementById('rematch-status').classList.add('hidden');
  }, 800);
}

function onPhaseFinished() {
  app.phase = PHASE.FINISHED;
}

function onRematchState(msg) {
  const mine = app.role === 'host' ? msg.hostRematch : msg.guestRematch;
  const opp = app.role === 'host' ? msg.guestRematch : msg.hostRematch;
  const el = document.getElementById('rematch-status');
  el.classList.remove('hidden');
  if (mine && opp) el.textContent = '再戦開始…';
  else if (mine) el.textContent = '相手を待っています…';
  else el.textContent = '';
}

function showVerdict(myTier, oppTier) {
  const el = document.getElementById('verdict-display');
  const text = document.getElementById('verdict-text');
  text.textContent = myTier;
  text.className = `tier-${myTier}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}

// ── Game loop ─────────────────────────────────────────
function startGameLoop() {
  if (rafId) return;
  const tick = () => {
    rafId = requestAnimationFrame(tick);
    updateFrame();
    drawFrame();
  };
  rafId = requestAnimationFrame(tick);
}

function stopGameLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function updateFrame() {
  if (app.phase === PHASE.COUNTDOWN) {
    const left = Math.max(0, app.countdownEndsAt - Date.now());
    const num = Math.ceil(left / 1000);
    document.getElementById('countdown-num').textContent = num > 0 ? String(num) : 'GO!';
    if (num <= 0) {
      document.getElementById('countdown-num').classList.add('go');
    }
  }

  if (app.phase === PHASE.CHARGE) {
    const now = Date.now();
    if (now - app.lastLanceSend >= LANCE_SEND_INTERVAL) {
      app.lastLanceSend = now;
      send('update_lance', { lanceHeight: app.lanceHeight });
    }
    updateGauge();
  }

  if (app.impactFlash > 0) app.impactFlash *= 0.85;
}

function drawFrame() {
  if (!renderer) return;
  let myX = 0.12;
  let oppX = 0.88;

  if ((app.phase === PHASE.CHARGE || app.phase === PHASE.RESULT) && app.matchStartTime) {
    const progress = Sim.getChargeProgress(Date.now(), app.matchStartTime);
    myX = Sim.getMyScreenX(Math.min(progress, 1));
    oppX = Sim.getOppScreenX(Math.min(progress, 1));
  }

  renderer.render({
    myX,
    oppX,
    myLanceH: app.lanceHeight,
    oppLanceH: app.oppLanceHeight,
    impactFlash: app.impactFlash,
  });
}

function updateGauge() {
  const marker = document.getElementById('gauge-marker');
  marker.style.top = `${(1 - app.lanceHeight) * 100}%`;
}

// ── Drag control (full screen) ────────────────────────
function setupDrag() {
  const sens = 0.004;

  gameScreen.addEventListener('pointerdown', (e) => {
    if (app.phase !== PHASE.CHARGE) return;
    if (e.target.closest('button')) return;
    app.drag.active = true;
    app.drag.id = e.pointerId;
    app.drag.lastY = e.clientY;
    gameScreen.setPointerCapture(e.pointerId);
  });

  gameScreen.addEventListener('pointermove', (e) => {
    if (!app.drag.active || e.pointerId !== app.drag.id) return;
    const dy = e.clientY - app.drag.lastY;
    app.drag.lastY = e.clientY;
    app.lanceHeight = clamp(app.lanceHeight - dy * sens, 0.05, 0.95);
  });

  function endDrag(e) {
    if (e.pointerId !== app.drag.id) return;
    app.drag.active = false;
  }
  gameScreen.addEventListener('pointerup', endDrag);
  gameScreen.addEventListener('pointercancel', endDrag);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ── Init ──────────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', () => {
  app.playerName = document.getElementById('player-name').value.trim() || '騎士A';
  send('create_room', { name: app.playerName });
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
  if (!code) return showError('ルームコードを入力');
  app.playerName = document.getElementById('player-name').value.trim() || '騎士B';
  send('join_room', { code, name: app.playerName });
});

document.getElementById('btn-ready').addEventListener('click', () => {
  if (app.phase !== PHASE.WAITING && app.phase !== PHASE.FINISHED) return;
  app.myReady = !app.myReady;
  updateReadyUI();
  send('set_ready', { ready: app.myReady });
});

document.getElementById('btn-rematch').addEventListener('click', () => {
  if (app.rematchSent) return;
  app.rematchSent = true;
  document.getElementById('btn-rematch').disabled = true;
  document.getElementById('result-overlay').classList.add('hidden');
  send('rematch_request', { accept: true });
  onRematchState({
    hostRematch: app.role === 'host',
    guestRematch: app.role === 'guest',
  });
});

document.getElementById('btn-leave').addEventListener('click', () => {
  send('leave_room');
  resetToLobby();
});

document.getElementById('btn-back-lobby').addEventListener('click', () => {
  send('leave_room');
  resetToLobby();
});

function checkOrientation() {
  const hint = document.getElementById('rotate-hint');
  hint.classList.toggle('hidden', window.innerWidth > window.innerHeight);
}

window.addEventListener('resize', () => {
  checkOrientation();
  renderer?.resize();
});
window.addEventListener('orientationchange', checkOrientation);

setupDrag();
checkOrientation();
connect();
