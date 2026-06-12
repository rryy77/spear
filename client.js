// Joust Royale — オンライン1vs1

const PHASE = {
  LOBBY: 'lobby',
  EQUIPMENT: 'equipment',
  COUNTDOWN: 'countdown',
  CHARGE: 'charge',
  RESULT: 'result',
  FINISHED: 'finished',
};

const { EQUIPMENT, DEFAULT_EQUIPMENT } = JoustEquipment;
const Sim = JoustSim;

const LANCE_SEND_INTERVAL = 120;

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
  round: 1,
  scores: { host: 0, guest: 0 },
  selectedEquipment: { ...DEFAULT_EQUIPMENT },
  oppEquipment: { ...DEFAULT_EQUIPMENT },
  myReady: false,
  oppReady: false,
  matchStartTime: 0,
  chargeDuration: Sim.CHARGE_MS,
  lanceHeight: 0.5,
  oppLanceHeight: 0.5,
  lanceActionTiming: null,
  countdownEndsAt: 0,
  lastLanceSend: 0,
  impactFlash: 0,
  rematchSent: false,
};

const joystick = { active: false, id: null, smoothY: 0.5 };

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
    setStatus('WebSocketサーバー未設定');
    setTimeout(connect, 5000);
    return;
  }
  app.ws = new WebSocket(url);
  app.ws.onopen = () => setStatus('接続済み');
  app.ws.onclose = () => { setStatus('切断 — 再接続中…'); setTimeout(connect, 2000); };
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
      showWaiting(msg.code, true);
      break;
    case 'room_joined':
      app.role = msg.role;
      app.roomCode = msg.code;
      showWaiting(msg.code, false);
      break;
    case 'player_joined':
      document.getElementById('waiting-message').textContent = `${msg.guestName} が参加！`;
      break;
    case 'phase_equipment':
      onPhaseEquipment(msg);
      break;
    case 'equipment_update':
      onEquipmentUpdate(msg);
      break;
    case 'match_countdown':
      onMatchCountdown(msg);
      break;
    case 'match_start':
      onMatchStart(msg);
      break;
    case 'lance_update':
      if (msg.role !== app.role && typeof msg.lanceHeight === 'number') {
        app.oppLanceHeight = msg.lanceHeight;
      }
      break;
    case 'impact_result':
      onImpactResult(msg);
      break;
    case 'match_result':
      onMatchResult(msg);
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

// ── Lobby ─────────────────────────────────────────────
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
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function showWaiting(code, isHost) {
  document.getElementById('lobby-menu').classList.add('hidden');
  document.getElementById('lobby-join').classList.add('hidden');
  document.getElementById('lobby-waiting').classList.remove('hidden');
  document.getElementById('display-code').textContent = code;
  document.getElementById('waiting-message').textContent = isHost
    ? '対戦相手の参加を待っています…'
    : '装備選択へ移動します…';
}

function resetToLobby() {
  stopGameLoop();
  app.phase = PHASE.LOBBY;
  app.role = null;
  app.roomCode = null;
  app.rematchSent = false;
  document.getElementById('lobby-menu').classList.remove('hidden');
  document.getElementById('lobby-join').classList.add('hidden');
  document.getElementById('lobby-waiting').classList.add('hidden');
  document.getElementById('btn-ready').textContent = 'READY';
  document.getElementById('btn-ready').classList.remove('ready-on');
  showScreen('lobby');
}

// ── Equipment ─────────────────────────────────────────
function buildEquipmentUI() {
  const cats = ['horse', 'lance', 'armor', 'shield'];
  const keys = { horse: 'horses', lance: 'lances', armor: 'armors', shield: 'shields' };
  for (const cat of cats) {
    const container = document.getElementById(`opts-${cat}`);
    container.innerHTML = '';
    const items = EQUIPMENT[keys[cat]];
    for (const [id, item] of Object.entries(items)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'equip-opt';
      btn.dataset.cat = cat;
      btn.dataset.id = id;
      btn.textContent = item.name;
      if (app.selectedEquipment[cat] === id) btn.classList.add('selected');
      btn.addEventListener('click', () => selectEquipment(cat, id));
      container.appendChild(btn);
    }
  }
}

function selectEquipment(cat, id) {
  app.selectedEquipment[cat] = id;
  app.myReady = false;
  document.querySelectorAll(`.equip-opt[data-cat="${cat}"]`).forEach((b) => {
    b.classList.toggle('selected', b.dataset.id === id);
  });
  document.getElementById('btn-ready').textContent = 'READY';
  document.getElementById('btn-ready').classList.remove('ready-on');
  send('set_equipment', { selectedEquipment: app.selectedEquipment });
}

function updateEquipReadyUI() {
  const btn = document.getElementById('btn-ready');
  btn.textContent = app.myReady ? 'READY ✓' : 'READY';
  btn.classList.toggle('ready-on', app.myReady);
  const opp = document.getElementById('opp-ready-status');
  opp.textContent = app.oppReady ? '相手: READY' : '相手: 装備選択中…';
}

function onPhaseEquipment(msg) {
  app.phase = PHASE.EQUIPMENT;
  app.round = msg.round ?? 1;
  app.scores = msg.scores ?? { host: 0, guest: 0 };
  if (msg.host) {
    if (app.role === 'host') {
      app.selectedEquipment = { ...msg.host.equipment };
      app.myReady = msg.host.ready;
      app.playerName = msg.host.name;
    } else {
      app.oppEquipment = { ...msg.host.equipment };
      app.oppReady = msg.host.ready;
      app.opponentName = msg.host.name;
    }
  }
  if (msg.guest) {
    if (app.role === 'guest') {
      app.selectedEquipment = { ...msg.guest.equipment };
      app.myReady = msg.guest.ready;
      app.playerName = msg.guest.name;
    } else {
      app.oppEquipment = { ...msg.guest.equipment };
      app.oppReady = msg.guest.ready;
      app.opponentName = msg.guest.name;
    }
  }
  document.getElementById('equip-round').textContent = `ROUND ${app.round}`;
  document.getElementById('equip-scores').textContent = `${app.scores.host} — ${app.scores.guest}`;
  buildEquipmentUI();
  updateEquipReadyUI();
  showScreen('equipment');
}

function onEquipmentUpdate(msg) {
  if (msg.scores) app.scores = msg.scores;
  if (msg.round) app.round = msg.round;
  document.getElementById('equip-scores').textContent = `${app.scores.host} — ${app.scores.guest}`;
  const other = msg.role === 'host' ? 'guest' : 'host';
  if (app.role === other) {
    app.oppReady = msg.ready;
    if (msg.selectedEquipment) app.oppEquipment = { ...msg.selectedEquipment };
  } else {
    app.myReady = msg.ready;
    if (msg.selectedEquipment) app.selectedEquipment = { ...msg.selectedEquipment };
    buildEquipmentUI();
  }
  updateEquipReadyUI();
}

// ── Match flow ────────────────────────────────────────
function onMatchCountdown(msg) {
  app.phase = PHASE.COUNTDOWN;
  app.countdownEndsAt = msg.endsAt;
  document.getElementById('my-name').textContent = app.playerName || (app.role === 'host' ? '騎士A' : '騎士B');
  document.getElementById('opp-name').textContent = app.opponentName || '相手';
  document.getElementById('hud-round').textContent = `ROUND ${app.round}`;
  document.getElementById('hud-score').textContent = `${app.scores.host} — ${app.scores.guest}`;
  document.getElementById('hud-role').textContent = app.role === 'host' ? '左陣' : '右陣';
  showScreen('game');
  if (!renderer) renderer = createRenderer2D(canvas);
  renderer.resize();
  startGameLoop();
  showBanner('突撃準備 — 槍の高さを合わせろ');
}

function onMatchStart(msg) {
  app.phase = PHASE.CHARGE;
  app.matchStartTime = msg.matchStartTime;
  app.chargeDuration = msg.chargeDuration ?? Sim.CHARGE_MS;
  app.round = msg.round ?? app.round;
  app.lanceHeight = 0.5;
  app.oppLanceHeight = 0.5;
  app.lanceActionTiming = null;
  joystick.smoothY = 0.5;
  hideCountdown();
  showBanner('突撃！');
}

function onImpactResult(msg) {
  app.impactFlash = 1;
  const h = msg.impactResult?.hostHit;
  const g = msg.impactResult?.guestHit;
  const myHit = app.role === 'host' ? h : g;
  const oppHit = app.role === 'host' ? g : h;
  showToast(`命中 ${myHit?.damage ?? 0} / 被弾 ${oppHit?.damage ?? 0}`);
  if (msg.scores) app.scores = msg.scores;
}

function onMatchResult(msg) {
  app.phase = msg.gameOver ? PHASE.FINISHED : PHASE.RESULT;
  if (msg.scores) app.scores = msg.scores;
  app.rematchSent = false;

  const won = msg.matchWinner === app.role;
  const roundWon = msg.roundWinner === app.role;
  let title = roundWon ? 'ラウンド勝利！' : (msg.roundWinner ? 'ラウンド敗北' : '引き分け');
  if (msg.gameOver && msg.matchWinner) {
    title = won ? '試合勝利！' : '試合敗北…';
  } else if (msg.gameOver) {
    title = '試合終了';
  }

  document.getElementById('result-title').textContent = title;
  const h = msg.impactResult?.hostHit;
  const g = msg.impactResult?.guestHit;
  document.getElementById('result-message').textContent =
    `与ダメージ ${app.role === 'host' ? h?.damage : g?.damage} / ` +
    `被ダメージ ${app.role === 'host' ? g?.damage : h?.damage}`;

  const rewards = msg.rewards?.[app.role] ?? { gold: 0, fame: 0 };
  document.getElementById('reward-box').innerHTML =
    `<span>💰 ${rewards.gold}</span><span>⚔ ${rewards.fame} 名声</span>`;
  document.getElementById('result-scores').textContent =
    `スコア ${app.scores.host} — ${app.scores.guest}`;

  document.getElementById('rematch-status').classList.add('hidden');
  document.getElementById('btn-rematch').disabled = false;
  showScreen('result');

  if (!msg.gameOver) {
    setTimeout(() => {
      if (app.phase === PHASE.RESULT) showScreen('equipment');
    }, JOUST_CONSTANTS.RESULT_MS);
  }
}

function onRematchState(msg) {
  const mine = app.role === 'host' ? msg.hostRematch : msg.guestRematch;
  const opp = app.role === 'host' ? msg.guestRematch : msg.hostRematch;
  const el = document.getElementById('rematch-status');
  el.classList.remove('hidden');
  if (mine && opp) el.textContent = '再戦開始…';
  else if (mine) el.textContent = '相手の再戦を待っています…';
  else el.textContent = '再戦ボタンを押してください';
}

// ── Game loop (deterministic positions) ───────────────
function startGameLoop() {
  if (rafId) return;
  const tick = () => {
    rafId = requestAnimationFrame(tick);
    updateGameFrame();
    drawGameFrame();
  };
  rafId = requestAnimationFrame(tick);
}

function stopGameLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function updateGameFrame() {
  if (app.phase === PHASE.COUNTDOWN) {
    const left = Math.max(0, app.countdownEndsAt - Date.now());
    const num = Math.ceil(left / 1000);
    if (num > 0) showCountdown(num);
    else hideCountdown();
  }

  if (app.phase === PHASE.CHARGE) {
    updateJoystickLance();
    const now = Date.now();
    if (now - app.lastLanceSend >= LANCE_SEND_INTERVAL) {
      app.lastLanceSend = now;
      send('update_lance', { lanceHeight: app.lanceHeight });
    }
    updateLanceBar();
  }

  if (app.impactFlash > 0) app.impactFlash *= 0.88;
}

function drawGameFrame() {
  if (!renderer) return;
  let hostX = 0.12;
  let guestX = 0.88;
  let hostLH = 0.5;
  let guestLH = 0.5;
  let countdownNum = null;

  if (app.phase === PHASE.CHARGE && app.matchStartTime) {
    const progress = Sim.getChargeProgress(Date.now(), app.matchStartTime);
    hostX = Sim.getHorseScreenX(true, progress);
    guestX = Sim.getHorseScreenX(false, progress);
    hostLH = app.role === 'host' ? app.lanceHeight : app.oppLanceHeight;
    guestLH = app.role === 'guest' ? app.lanceHeight : app.oppLanceHeight;
  } else if (app.phase === PHASE.COUNTDOWN) {
    const left = Math.max(0, app.countdownEndsAt - Date.now());
    countdownNum = Math.ceil(left / 1000) || null;
  }

  const hostName = app.role === 'host' ? app.playerName : app.opponentName;
  const guestName = app.role === 'guest' ? app.playerName : app.opponentName;

  renderer.render({
    hostX,
    guestX,
    hostLanceH: hostLH,
    guestLanceH: guestLH,
    hostName: hostName || 'A',
    guestName: guestName || 'B',
    countdownNum,
    impactFlash: app.impactFlash,
  });
}

// ── UI helpers ────────────────────────────────────────
function showBanner(text) {
  const el = document.getElementById('phase-banner');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}

function showCountdown(n) {
  const ov = document.getElementById('countdown-overlay');
  document.getElementById('countdown-num').textContent = String(n);
  ov.classList.remove('hidden');
}

function hideCountdown() {
  document.getElementById('countdown-overlay').classList.add('hidden');
}

function showToast(text) {
  const el = document.getElementById('result-toast');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

function updateLanceBar() {
  const fill = document.getElementById('lance-height-fill');
  fill.style.height = `${(1 - app.lanceHeight) * 100}%`;
}

// ── Joystick (lance height only) ──────────────────────
function updateJoystickLance() {
  if (!joystick.active) return;
  const sens = 0.012;
  joystick.smoothY = clamp(joystick.smoothY - joystick.ny * sens, 0.05, 0.95);
  app.lanceHeight = joystick.smoothY;
}

function setupJoystick() {
  const zone = document.getElementById('joystick-zone');
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const maxR = 36;

  function moveKnob(nx, ny) {
    knob.style.transform = `translate(calc(-50% + ${nx * maxR}px), calc(-50% + ${ny * maxR}px))`;
  }

  zone.addEventListener('pointerdown', (e) => {
    if (app.phase !== PHASE.CHARGE) return;
    joystick.active = true;
    joystick.id = e.pointerId;
    zone.setPointerCapture(e.pointerId);
  });

  zone.addEventListener('pointermove', (e) => {
    if (!joystick.active || e.pointerId !== joystick.id) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let nx = (e.clientX - cx) / maxR;
    let ny = (e.clientY - cy) / maxR;
    const len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }
    joystick.nx = nx;
    joystick.ny = ny;
    moveKnob(nx, ny);
  });

  function endJoy(e) {
    if (e.pointerId !== joystick.id) return;
    joystick.active = false;
    joystick.nx = 0;
    joystick.ny = 0;
    moveKnob(0, 0);
  }
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);
}

function setupThrust() {
  document.getElementById('btn-thrust').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (app.phase !== PHASE.CHARGE || app.lanceActionTiming != null) return;
    if (!app.matchStartTime) return;
    const timing = Sim.getChargeProgress(Date.now(), app.matchStartTime);
    app.lanceActionTiming = timing;
    send('set_lance_timing', { lanceActionTiming: timing });
    showToast(`突き！ タイミング ${Math.round(timing * 100)}%`);
  });
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
  if (!code) return showError('ルームコードを入力してください');
  app.playerName = document.getElementById('player-name').value.trim() || '騎士B';
  send('join_room', { code, name: app.playerName });
});

document.getElementById('btn-leave').addEventListener('click', () => {
  send('leave_room');
  resetToLobby();
});

document.getElementById('btn-ready').addEventListener('click', () => {
  if (app.phase !== PHASE.EQUIPMENT) return;
  app.myReady = !app.myReady;
  updateEquipReadyUI();
  send('set_ready', { ready: app.myReady });
});

document.getElementById('btn-rematch').addEventListener('click', () => {
  if (app.rematchSent) return;
  app.rematchSent = true;
  document.getElementById('btn-rematch').disabled = true;
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

function checkOrientation() {
  const hint = document.getElementById('rotate-hint');
  const landscape = window.innerWidth > window.innerHeight;
  hint.classList.toggle('hidden', landscape);
}

window.addEventListener('resize', () => {
  checkOrientation();
  renderer?.resize();
});
window.addEventListener('orientationchange', checkOrientation);

setupJoystick();
setupThrust();
checkOrientation();
connect();
