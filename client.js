// 馬上槍試合（Joust）— 3突進・狙い・タイミング

const PHASE = {
  LOBBY: 'lobby', WAITING: 'waiting', COUNTDOWN: 'countdown',
  CHARGE: 'charge', PASS_RESULT: 'pass_result', MATCH_RESULT: 'match_result', FINISHED: 'finished',
};

const Sim = JoustSim;
const ROUNDS = JOUST_CONSTANTS.ROUNDS;

const canvas = document.getElementById('game-canvas');
let renderer = null;
let rafId = null;

const app = {
  ws: null, role: null, roomCode: null,
  playerName: '', opponentName: '',
  phase: PHASE.LOBBY,
  myReady: false, oppReady: false,
  roundNumber: 1,
  scores: { host: 0, guest: 0 },
  myAim: 'MID',
  oppAim: 'MID',
  matchStartTime: 0,
  tapped: false,
  countdownEndsAt: 0,
  rematchSent: false,
  fx: defaultFx(),
};

function defaultFx() {
  return {
    shake: 0, impactFlash: 0, impactColor: null, crowdCheer: 0, slowMo: 1,
    playerLanceOut: false, enemyLanceOut: false,
    playerLanceBroken: false, enemyLanceBroken: false,
    playerKnock: 0, enemyKnock: 0,
    playerUnhorsed: false, enemyUnhorsed: false,
  };
}

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
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}

async function connect() {
  const url = await getWsUrl();
  if (!url) { setStatus('WebSocket未設定'); setTimeout(connect, 5000); return; }
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
      app.role = msg.role; app.roomCode = msg.code;
      showLobbyWaiting(msg.code); break;
    case 'room_joined':
      app.role = msg.role; app.roomCode = msg.code; break;
    case 'player_joined':
      app.opponentName = msg.guestName; break;
    case 'phase_waiting': onPhaseWaiting(msg); break;
    case 'ready_update': onReadyUpdate(msg); break;
    case 'round_countdown': onRoundCountdown(msg); break;
    case 'round_start': onRoundStart(msg); break;
    case 'aim_update':
      if (msg.role !== app.role) app.oppAim = msg.selectedAimHeight;
      break;
    case 'timing_result': onTimingResult(msg); break;
    case 'hit_result': onHitResult(msg); break;
    case 'match_result': onMatchResult(msg); break;
    case 'phase_finished': app.phase = PHASE.FINISHED; break;
    case 'rematch_state': onRematchState(msg); break;
    case 'player_left': showError(msg.message); resetToLobby(); break;
    case 'error': showError(msg.message); break;
  }
}

// ── UI ────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  if (name === 'game') {
    requestAnimationFrame(() => { renderer?.resize(); requestAnimationFrame(() => renderer?.resize()); });
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
  wait.className = 'hint'; wait.id = 'waiting-code';
  wait.textContent = `コード: ${code}`;
  document.querySelector('.lobby-card').appendChild(wait);
}

function hideOverlays() {
  ['ready-bar', 'battle-ui', 'countdown-overlay', 'verdict-display', 'result-overlay', 'round-banner', 'score-hud']
    .forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('btn-ready')?.classList.remove('ready-on');
  document.getElementById('btn-lance')?.classList.remove('pressed');
  document.getElementById('btn-lance').disabled = false;
}

function resetToLobby() {
  stopGameLoop();
  app.phase = PHASE.LOBBY;
  app.role = null; app.roomCode = null; app.rematchSent = false;
  app.fx = defaultFx();
  document.getElementById('lobby-menu')?.classList.remove('hidden');
  document.getElementById('lobby-join')?.classList.add('hidden');
  document.getElementById('waiting-code')?.remove();
  hideOverlays();
  showScreen('lobby');
}

function myScore() {
  return app.role === 'host' ? app.scores.host : app.scores.guest;
}

function oppScore() {
  return app.role === 'host' ? app.scores.guest : app.scores.host;
}

function updateScoreHud() {
  document.getElementById('score-you').textContent = String(myScore());
  document.getElementById('score-opp').textContent = String(oppScore());
  document.getElementById('round-badge').textContent = `ROUND ${app.roundNumber} / ${ROUNDS}`;
  document.querySelectorAll('.pass-dots .dot').forEach((d, i) => {
    d.classList.toggle('done', i < app.roundNumber - 1);
    d.classList.toggle('current', i === app.roundNumber - 1);
  });
}

function setAim(aim) {
  app.myAim = aim;
  document.querySelectorAll('.aim-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.aim === aim);
  });
  if (app.phase === PHASE.COUNTDOWN || app.phase === PHASE.CHARGE) {
    send('set_aim', { selectedAimHeight: aim });
  }
}

const ZONE_LABELS = {
  helmet: '兜命中', shield: '盾命中', torso: '胴命中', horse: '馬命中',
};

// ── Match flow ────────────────────────────────────────
function enterGameScreen() {
  showScreen('game');
  if (!renderer) renderer = createRenderer2D(canvas);
  renderer.resize();
  startGameLoop();
}

function onPhaseWaiting(msg) {
  app.phase = PHASE.WAITING;
  app.roundNumber = 1;
  app.scores = msg.score || { host: 0, guest: 0 };
  app.myReady = false; app.oppReady = false;
  app.myAim = 'MID'; app.oppAim = 'MID';
  app.fx = defaultFx();
  parsePlayers(msg);
  hideOverlays();
  document.getElementById('ready-bar').classList.remove('hidden');
  updateReadyUI();
  enterGameScreen();
}

function parsePlayers(msg) {
  if (msg.host) {
    if (app.role === 'host') { app.playerName = msg.host.name; app.myReady = msg.host.ready; }
    else { app.opponentName = msg.host.name; app.oppReady = msg.host.ready; }
  }
  if (msg.guest) {
    if (app.role === 'guest') { app.playerName = msg.guest.name; app.myReady = msg.guest.ready; }
    else { app.opponentName = msg.guest.name; app.oppReady = msg.guest.ready; }
  }
}

function onReadyUpdate(msg) {
  parsePlayers(msg);
  if (msg.score) app.scores = msg.score;
  updateReadyUI();
}

function updateReadyUI() {
  const btn = document.getElementById('btn-ready');
  btn.textContent = app.myReady ? 'READY ✓' : 'READY';
  btn.classList.toggle('ready-on', app.myReady);
  document.getElementById('opp-ready-hint').textContent =
    app.oppReady ? 'まもなく試合開始…' : '相手の READY を待っています…';
}

function onRoundCountdown(msg) {
  app.phase = PHASE.COUNTDOWN;
  app.roundNumber = msg.roundNumber;
  app.scores = msg.score || app.scores;
  app.countdownEndsAt = msg.endsAt;
  hideOverlays();
  document.getElementById('score-hud').classList.remove('hidden');
  document.getElementById('round-banner').classList.remove('hidden');
  document.getElementById('round-banner').textContent = `ROUND ${app.roundNumber}`;
  document.getElementById('countdown-overlay').classList.remove('hidden');
  document.getElementById('battle-ui').classList.remove('hidden');
  setAim('MID');
  updateScoreHud();
}

function onRoundStart(msg) {
  app.phase = PHASE.CHARGE;
  app.roundNumber = msg.roundNumber;
  app.matchStartTime = msg.matchStartTime;
  app.scores = msg.score || app.scores;
  app.tapped = false;
  app.fx = defaultFx();
  document.getElementById('countdown-overlay').classList.add('hidden');
  document.getElementById('round-banner').classList.add('hidden');
  updateScoreHud();
}

function onTimingResult(msg) {
  const tr = msg.timingResult;
  const my = app.role === 'host' ? tr.host : tr.guest;
  showVerdict(my.tier, null, null);
}

function onHitResult(msg) {
  app.phase = PHASE.PASS_RESULT;
  app.scores = msg.score || app.scores;
  updateScoreHud();

  const hr = msg.hitResult;
  const my = app.role === 'host' ? hr.host : hr.guest;
  const opp = app.role === 'host' ? hr.guest : hr.host;

  playHitEffects(my, opp, msg.knockdown);

  const zoneLabel = my.foul ? 'FOUL!' : (ZONE_LABELS[my.hitZone] || '');
  const pts = my.points > 0 ? `+${my.points}点` : (my.points < 0 ? `${my.points}点` : '');
  showVerdict(my.timingResult, zoneLabel, pts);

  if (msg.knockdown) {
    setTimeout(() => showBigVerdict('KNOCKDOWN!'), 600);
  }
  if (my.foul) {
    setTimeout(() => showBigVerdict(my.disqualified ? '失格!' : 'FOUL!'), 800);
  }
}

function onMatchResult(msg) {
  app.phase = PHASE.MATCH_RESULT;
  const mr = msg.matchResult;
  app.scores = mr.score || app.scores;
  document.getElementById('battle-ui').classList.add('hidden');

  const won = mr.winner === app.role;
  const draw = !mr.winner;
  const reasons = { knockdown: '落馬', foul: '反則', points: '得点', draw: '引き分け' };

  setTimeout(() => {
    let title = draw ? '引き分け' : (won ? '勝利！' : '敗北…');
    if (mr.reason === 'knockdown' && won) title = '落馬 — 勝利！';
    if (mr.reason === 'foul' && !won) title = '反則 — 敗北';
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-detail').textContent = reasons[mr.reason] || '';
    document.getElementById('result-score').textContent =
      `YOU ${myScore()} — FOE ${oppScore()}`;
    document.getElementById('result-overlay').classList.remove('hidden');
    document.getElementById('btn-rematch').disabled = false;
    app.rematchSent = false;
  }, 1500);
}

function onRematchState(msg) {
  const mine = app.role === 'host' ? msg.hostRematch : msg.guestRematch;
  const opp = app.role === 'host' ? msg.guestRematch : msg.hostRematch;
  const el = document.getElementById('rematch-status');
  el.classList.remove('hidden');
  el.textContent = (mine && opp) ? '再戦開始…' : (mine ? '相手を待っています…' : '');
}

function playHitEffects(my, opp, knockdown) {
  app.fx.playerLanceOut = true;
  app.fx.enemyLanceOut = true;

  if (my.foul) {
    showBigVerdict('FOUL!');
    return;
  }

  if (my.timingResult === 'PERFECT' && my.points > 0) {
    app.fx.shake = 1;
    app.fx.slowMo = 0.35;
    app.fx.impactFlash = 1;
    app.fx.impactColor = 'rgba(255,230,60,0.95)';
    app.fx.crowdCheer = 1;
    if (my.lanceBreak) app.fx.playerLanceBroken = true;
    if (my.knockdown || (knockdown && knockdown !== app.role)) {
      app.fx.enemyKnock = 1;
      app.fx.enemyUnhorsed = true;
    } else {
      app.fx.enemyKnock = 0.7;
    }
    setTimeout(() => { app.fx.slowMo = 1; }, 900);
  } else if (my.timingResult === 'GOOD' && my.points > 0) {
    app.fx.impactFlash = 0.5;
    app.fx.impactColor = 'rgba(255,180,80,0.65)';
    app.fx.shake = 0.3;
    app.fx.enemyKnock = 0.35;
    if (my.lanceBreak) app.fx.playerLanceBroken = true;
  } else if (my.points > 0) {
    app.fx.impactFlash = 0.2;
    app.fx.impactColor = 'rgba(200,200,200,0.35)';
  }

  if (knockdown === app.role) {
    app.fx.playerUnhorsed = true;
    app.fx.playerKnock = 1;
  }
}

function showVerdict(tier, zone, pts) {
  const el = document.getElementById('verdict-display');
  const labels = {
    PERFECT: 'PERFECT!', GOOD: 'HIT!', EARLY: 'EARLY…', LATE: 'LATE…', MISS: 'MISS',
  };
  document.getElementById('verdict-text').textContent = labels[tier] || tier;
  document.getElementById('verdict-text').className = `tier-${tier}`;
  document.getElementById('hit-zone-text').textContent = zone || '';
  document.getElementById('points-text').textContent = pts || '';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2200);
}

function showBigVerdict(text) {
  const el = document.getElementById('verdict-display');
  document.getElementById('verdict-text').textContent = text;
  document.getElementById('verdict-text').className = 'tier-big';
  document.getElementById('hit-zone-text').textContent = '';
  document.getElementById('points-text').textContent = '';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}

// ── Game loop ─────────────────────────────────────────
function startGameLoop() {
  if (rafId) return;
  let last = performance.now();
  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    updateFrame(now - last);
    last = now;
    drawFrame(now);
  };
  rafId = requestAnimationFrame(tick);
}

function stopGameLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function updateFrame(dt) {
  if (app.phase === PHASE.COUNTDOWN) {
    const left = Math.max(0, app.countdownEndsAt - Date.now());
    const num = Math.ceil(left / 1000);
    const el = document.getElementById('countdown-num');
    el.textContent = num > 0 ? String(num) : 'GO!';
    el.classList.toggle('go', num <= 0);
  }

  if (app.phase === PHASE.CHARGE && app.matchStartTime) {
    const cursor = Sim.getTimingCursor(Date.now(), app.matchStartTime);
    const cur = document.getElementById('timing-cursor');
    if (cur) cur.style.left = `${cursor * 100}%`;
  }

  if (app.fx.shake > 0) app.fx.shake *= 0.9;
  if (app.fx.impactFlash > 0) app.fx.impactFlash *= 0.88;
  if (app.fx.crowdCheer > 0) app.fx.crowdCheer *= 0.96;
}

function drawFrame(now) {
  if (!renderer) return;
  let progress = 0;
  if (app.matchStartTime && (app.phase === PHASE.CHARGE || app.phase === PHASE.PASS_RESULT)) {
    progress = Sim.getChargeProgress(now, app.matchStartTime);
  }

  renderer.render({
    playerPos: Sim.getPlayerPos(Math.min(progress, 1)),
    enemyPos: Sim.getEnemyPos(Math.min(progress, 1)),
    playerAim: app.myAim,
    enemyAim: app.oppAim,
    shake: app.fx.shake,
    impactFlash: app.fx.impactFlash,
    impactColor: app.fx.impactColor,
    crowdCheer: app.fx.crowdCheer,
    playerLanceOut: app.fx.playerLanceOut || progress > 0.7,
    enemyLanceOut: app.fx.enemyLanceOut || progress > 0.7,
    playerLanceBroken: app.fx.playerLanceBroken,
    enemyLanceBroken: app.fx.enemyLanceBroken,
    playerKnock: app.fx.playerKnock,
    enemyKnock: app.fx.enemyKnock,
    playerUnhorsed: app.fx.playerUnhorsed,
    enemyUnhorsed: app.fx.enemyUnhorsed,
  });
}

function onLanceTap() {
  if (app.phase !== PHASE.CHARGE || app.tapped || !app.matchStartTime) return;
  app.tapped = true;
  const lanceTiming = Sim.getTimingCursor(Date.now(), app.matchStartTime);
  send('set_lance_timing', { lanceTiming });
  document.getElementById('btn-lance').disabled = true;
  document.getElementById('btn-lance').classList.add('pressed');
  app.fx.playerLanceOut = true;
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

document.querySelectorAll('.aim-btn').forEach((btn) => {
  btn.addEventListener('click', () => setAim(btn.dataset.aim));
});

document.getElementById('btn-lance').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  onLanceTap();
});

document.getElementById('btn-leave').addEventListener('click', () => {
  send('leave_room'); resetToLobby();
});

document.getElementById('btn-rematch').addEventListener('click', () => {
  if (app.rematchSent) return;
  app.rematchSent = true;
  document.getElementById('btn-rematch').disabled = true;
  document.getElementById('result-overlay').classList.add('hidden');
  send('rematch_request', { accept: true });
  onRematchState({ hostRematch: app.role === 'host', guestRematch: app.role === 'guest' });
});

document.getElementById('btn-back-lobby').addEventListener('click', () => {
  send('leave_room'); resetToLobby();
});

window.addEventListener('resize', () => renderer?.resize());
connect();
