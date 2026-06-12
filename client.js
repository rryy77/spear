// 馬上槍試合 — 縦画面タイミングゲーム

const PHASE = {
  LOBBY: 'lobby',
  WAITING: 'waiting',
  COUNTDOWN: 'countdown',
  CHARGE: 'charge',
  RESULT: 'result',
  FINISHED: 'finished',
};

const Sim = JoustSim;
const C = JOUST_CONSTANTS;

const canvas = document.getElementById('game-canvas');
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
  tapped: false,
  countdownEndsAt: 0,
  rematchSent: false,
  fx: {
    shake: 0,
    impactFlash: 0,
    impactColor: null,
    lanceBreak: false,
    crowdCheer: 0,
    slowMo: 1,
    playerLanceOut: false,
    enemyLanceOut: false,
    playerKnock: 0,
    enemyKnock: 0,
    tier: null,
  },
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
    case 'timing_result':
      onTimingResult(msg);
      break;
    case 'battle_result':
      onBattleResult(msg);
      break;
    case 'phase_finished':
      app.phase = PHASE.FINISHED;
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
  wait.textContent = `コード: ${code}`;
  document.querySelector('.lobby-card').appendChild(wait);
}

function resetToLobby() {
  stopGameLoop();
  app.phase = PHASE.LOBBY;
  app.role = null;
  app.roomCode = null;
  app.rematchSent = false;
  resetFx();
  document.getElementById('lobby-menu')?.classList.remove('hidden');
  document.getElementById('lobby-join')?.classList.add('hidden');
  document.getElementById('waiting-code')?.remove();
  hideOverlays();
  showScreen('lobby');
}

function hideOverlays() {
  document.getElementById('ready-bar').classList.add('hidden');
  document.getElementById('timing-ui').classList.add('hidden');
  document.getElementById('countdown-overlay').classList.add('hidden');
  document.getElementById('verdict-display').classList.add('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('btn-ready').classList.remove('ready-on');
  document.getElementById('btn-ready').textContent = 'READY';
  document.getElementById('btn-lance').disabled = false;
}

function resetFx() {
  app.fx = {
    shake: 0, impactFlash: 0, impactColor: null, lanceBreak: false,
    crowdCheer: 0, slowMo: 1, playerLanceOut: false, enemyLanceOut: false,
    playerKnock: 0, enemyKnock: 0, tier: null,
  };
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
  app.tapped = false;
  resetFx();
  parsePlayers(msg);
  hideOverlays();
  document.getElementById('ready-bar').classList.remove('hidden');
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('btn-lance').classList.remove('pressed');
  updateReadyUI();
  enterGameScreen();
}

function parsePlayers(msg) {
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
}

function onReadyUpdate(msg) {
  parsePlayers(msg);
  updateReadyUI();
}

function updateReadyUI() {
  const btn = document.getElementById('btn-ready');
  btn.textContent = app.myReady ? 'READY ✓' : 'READY';
  btn.classList.toggle('ready-on', app.myReady);
  document.getElementById('opp-ready-hint').textContent =
    app.oppReady ? 'まもなく開始…' : '相手の READY を待っています…';
}

function onMatchCountdown(msg) {
  app.phase = PHASE.COUNTDOWN;
  app.countdownEndsAt = msg.endsAt;
  document.getElementById('ready-bar').classList.add('hidden');
  document.getElementById('countdown-overlay').classList.remove('hidden');
  document.getElementById('countdown-num').classList.remove('go');
}

function onMatchStart(msg) {
  app.phase = PHASE.CHARGE;
  app.matchStartTime = msg.matchStartTime;
  app.tapped = false;
  resetFx();
  document.getElementById('countdown-overlay').classList.add('hidden');
  document.getElementById('timing-ui').classList.remove('hidden');
  document.getElementById('btn-lance').disabled = false;
}

function onTimingResult(msg) {
  const tr = msg.timingResult;
  const my = app.role === 'host' ? tr.host : tr.guest;
  const opp = app.role === 'host' ? tr.guest : tr.host;
  app.fx.tier = my.tier;
  playTierEffects(my.tier, opp.tier);
  showVerdict(my.tier);
}

function onBattleResult(msg) {
  app.phase = PHASE.RESULT;
  const tr = msg.timingResult;
  const my = app.role === 'host' ? tr.host : tr.guest;
  const opp = app.role === 'host' ? tr.guest : tr.host;
  const won = msg.battleResult.winner === app.role;
  const draw = !msg.battleResult.winner;

  document.getElementById('timing-ui').classList.add('hidden');

  setTimeout(() => {
    document.getElementById('result-title').textContent =
      draw ? '引き分け' : (won ? '勝利！' : '敗北…');
    document.getElementById('result-detail').textContent =
      `あなた: ${my.tier} ／ 相手: ${opp.tier}`;
    document.getElementById('result-overlay').classList.remove('hidden');
    document.getElementById('btn-rematch').disabled = false;
    app.rematchSent = false;
    document.getElementById('rematch-status').classList.add('hidden');
  }, 1200);
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

function playTierEffects(myTier, oppTier) {
  app.fx.playerLanceOut = true;
  app.fx.enemyLanceOut = true;

  if (myTier === 'PERFECT') {
    app.fx.shake = 1;
    app.fx.slowMo = 0.35;
    app.fx.impactFlash = 1;
    app.fx.impactColor = 'rgba(255,230,80,0.95)';
    app.fx.lanceBreak = true;
    app.fx.crowdCheer = 1;
    app.fx.enemyKnock = 1;
    setTimeout(() => { app.fx.slowMo = 1; }, 800);
  } else if (myTier === 'GOOD') {
    app.fx.impactFlash = 0.55;
    app.fx.impactColor = 'rgba(255,180,80,0.7)';
    app.fx.shake = 0.35;
    app.fx.enemyKnock = 0.4;
  } else if (myTier === 'EARLY' || myTier === 'LATE') {
    app.fx.impactFlash = 0.2;
    app.fx.impactColor = 'rgba(200,200,200,0.4)';
  } else {
    app.fx.playerLanceOut = false;
    app.fx.enemyLanceOut = false;
  }

  if (oppTier === 'PERFECT' && myTier !== 'PERFECT') {
    app.fx.playerKnock = 0.8;
  }
}

function showVerdict(tier) {
  const el = document.getElementById('verdict-display');
  const text = document.getElementById('verdict-text');
  const labels = {
    PERFECT: 'PERFECT!',
    GOOD: 'HIT!',
    EARLY: 'EARLY…',
    LATE: 'LATE…',
    MISS: 'MISS',
  };
  text.textContent = labels[tier] || tier;
  text.className = `tier-${tier}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}

// ── Game loop ─────────────────────────────────────────
let lastFrame = 0;

function startGameLoop() {
  if (rafId) return;
  lastFrame = performance.now();
  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    updateFrame(dt);
    drawFrame(now);
  };
  rafId = requestAnimationFrame(tick);
}

function stopGameLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function updateFrame(dt) {
  const scale = app.fx.slowMo;
  const scaledDt = dt * scale;

  if (app.phase === PHASE.COUNTDOWN) {
    const left = Math.max(0, app.countdownEndsAt - Date.now());
    const num = Math.ceil(left / 1000);
    const el = document.getElementById('countdown-num');
    el.textContent = num > 0 ? String(num) : 'GO!';
    if (num <= 0) el.classList.add('go');
  }

  if (app.phase === PHASE.CHARGE && app.matchStartTime) {
    const now = Date.now();
    const cursor = Sim.getTimingCursor(now, app.matchStartTime);
    const cursorEl = document.getElementById('timing-cursor');
    if (cursorEl) cursorEl.style.left = `${cursor * 100}%`;
  }

  if (app.fx.shake > 0) app.fx.shake *= 0.92;
  if (app.fx.impactFlash > 0) app.fx.impactFlash *= 0.9;
  if (app.fx.crowdCheer > 0) app.fx.crowdCheer *= 0.97;
  if (app.fx.enemyKnock > 0 && app.fx.tier) app.fx.enemyKnock *= 0.95;
  if (app.fx.playerKnock > 0) app.fx.playerKnock *= 0.95;
}

function drawFrame(now) {
  if (!renderer) return;

  let progress = 0;
  if (app.matchStartTime && (app.phase === PHASE.CHARGE || app.phase === PHASE.RESULT)) {
    progress = Sim.getChargeProgress(now, app.matchStartTime);
  }

  const playerPos = Sim.getPlayerPos(Math.min(progress, 1));
  const enemyPos = Sim.getEnemyPos(Math.min(progress, 1));

  renderer.render({
    playerPos,
    enemyPos,
    shake: app.fx.shake,
    impactFlash: app.fx.impactFlash,
    impactColor: app.fx.impactColor,
    lanceBreak: app.fx.lanceBreak,
    crowdCheer: app.fx.crowdCheer,
    playerLanceOut: app.fx.playerLanceOut || progress > 0.75,
    enemyLanceOut: app.fx.enemyLanceOut || progress > 0.75,
    playerKnock: app.fx.playerKnock,
    enemyKnock: app.fx.enemyKnock,
  });
}

// ── LANCE! tap ────────────────────────────────────────
function onLanceTap() {
  if (app.phase !== PHASE.CHARGE || app.tapped || !app.matchStartTime) return;
  app.tapped = true;
  const tapTiming = Sim.getTimingCursor(Date.now(), app.matchStartTime);
  send('set_tap', { tapTiming });
  document.getElementById('btn-lance').disabled = true;
  document.getElementById('btn-lance').classList.add('pressed');

  const preview = Sim.evaluateTap(tapTiming);
  if (preview.tier === 'PERFECT' || preview.tier === 'GOOD') {
    app.fx.playerLanceOut = true;
  }
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
  if (app.phase !== PHASE.WAITING) return;
  app.myReady = !app.myReady;
  updateReadyUI();
  send('set_ready', { ready: app.myReady });
});

document.getElementById('btn-lance').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  onLanceTap();
});

document.getElementById('btn-leave').addEventListener('click', () => {
  send('leave_room');
  resetToLobby();
});

document.getElementById('btn-rematch').addEventListener('click', () => {
  if (app.rematchSent) return;
  app.rematchSent = true;
  document.getElementById('btn-rematch').disabled = true;
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('btn-lance').classList.remove('pressed');
  send('rematch_request', { accept: true });
  onRematchState({
    hostRematch: app.role === 'host',
    guestRematch: app.role === 'guest',
  });
});

document.getElementById('btn-back-lobby').addEventListener('click', () => {
  send('leave_room');
  resetToLobby();
});

window.addEventListener('resize', () => renderer?.resize());

connect();
