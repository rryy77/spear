// ROCK YOU! — オンラインマルチプレイ 馬上槍試合

const PHASE = {
  LOBBY: 'lobby', INTRO: 'intro', AIM: 'aim',
  COUNTDOWN: 'countdown', CHARGE: 'charge', RESULT: 'result', FINISHED: 'finished',
};

const AIM_SENS_X = 0.010;
const AIM_SENS_Y = 0.009;
const AIM_SMOOTH = 0.12;
const AIM_SEND_INTERVAL = 80;
const AIM_DURATION = 8000;

const canvas = document.getElementById('game-canvas');
const bloodOverlay = document.getElementById('blood-overlay');
const phaseBanner = document.getElementById('phase-banner');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNum = document.getElementById('countdown-num');
const aimBarWrap = document.getElementById('aim-bar-wrap');
const aimBar = document.getElementById('aim-bar');

let fps = null;

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
  chargeT: 0,
  chargeStart: 0,
  chargeDuration: 3000,
  phaseEndsAt: 0,
  lastAimSend: 0,
  shake: 0,
  stabT: 0,
  dodgeT: 0,
};

const joystick = {
  active: false, id: null,
  targetNx: 0, targetNy: 0,
  smoothNx: 0, smoothNy: 0,
};
let tickInterval = null;

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
      document.getElementById('btn-start').classList.remove('hidden');
      break;
    case 'lobby_update':
      if (msg.canStart) {
        document.getElementById('btn-start').classList.remove('hidden');
        document.getElementById('waiting-message').textContent = '準備完了 — スタートを押してください';
      }
      break;
    case 'game_start':
      app.opponentName = app.role === 'host' ? msg.guestName : msg.hostName;
      document.getElementById('opp-name').textContent = app.opponentName;
      document.getElementById('hud-role').textContent = app.role === 'host' ? '騎士A' : '騎士B';
      showScreen('game');
      initRenderer();
      break;
    case 'game_intro':
      onGameIntro(msg);
      break;
    case 'round_start':
      onRoundStart(msg);
      break;
    case 'countdown_start':
      onCountdownStart(msg);
      break;
    case 'charge_start':
      onChargeStart(msg);
      break;
    case 'round_result':
      onRoundResult(msg);
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

// ── Lobby ───────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  if (name === 'game') {
    requestAnimationFrame(() => {
      fps?.resize();
      requestAnimationFrame(() => fps?.resize());
    });
  }
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
    ? '騎士Bの参加を待っています…'
    : '騎士Aのスタートを待っています…';
  document.getElementById('btn-start').classList.toggle('hidden', !isHost);
}

function resetToLobby() {
  app.role = null;
  app.roomCode = null;
  app.phase = PHASE.LOBBY;
  stopTick();
  document.getElementById('lobby-menu').classList.remove('hidden');
  document.getElementById('lobby-join').classList.add('hidden');
  document.getElementById('lobby-waiting').classList.add('hidden');
  document.getElementById('btn-start').classList.add('hidden');
  showScreen('lobby');
}

function getPlayerName() {
  return document.getElementById('player-name').value.trim() || '無名の騎士';
}

document.getElementById('btn-create').addEventListener('click', () => send('create_room', { name: getPlayerName() }));
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
  if (!code) { showError('ルームコードを入力'); return; }
  send('join_room', { code, name: getPlayerName() });
});
document.getElementById('btn-start').addEventListener('click', () => send('start_game'));
document.getElementById('btn-leave').addEventListener('click', () => { send('leave_room'); resetToLobby(); });
document.getElementById('btn-back-lobby').addEventListener('click', () => { send('leave_room'); resetToLobby(); });

// ── Game phases ─────────────────────────────────────────
function initRenderer() {
  if (fps) return;
  fps = new FPSRenderer(canvas, app.role);
  fps.resize();
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => fps?.resize()).observe(canvas);
  }
  checkOrientation();
  try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* noop */ }
}

function checkOrientation() {
  const hint = document.getElementById('rotate-hint');
  const isPortrait = window.innerHeight > window.innerWidth;
  hint?.classList.toggle('hidden', !isPortrait);
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);

function showBanner(text, ms = 0) {
  phaseBanner.textContent = text;
  phaseBanner.classList.remove('hidden');
  if (ms > 0) setTimeout(() => phaseBanner.classList.add('hidden'), ms);
}

function onGameIntro(msg) {
  app.round = msg.round;
  app.phase = PHASE.INTRO;
  app.phaseEndsAt = msg.endsAt;
  showBanner(`⚔ 第${msg.round}試合 — ${msg.message}`, 0);
  document.getElementById('hud-objective').textContent = '中央の壁を挟んで配置 — 3秒後に突撃';
  document.getElementById('hud-round').textContent = `ROUND ${msg.round}`;
  aimBarWrap.classList.add('hidden');
  countdownOverlay.classList.add('hidden');
  startTick();
}

function onRoundStart(msg) {
  app.round = msg.round;
  app.phase = PHASE.AIM;
  app.x = 0.5;
  app.height = 0.5;
  app.chargeT = 0;
  app.phaseEndsAt = msg.aimEndsAt;

  const myKey = app.role;
  app.armor = { ...msg.armor[myKey] };
  const oppKey = app.role === 'host' ? 'guest' : 'host';
  app.oppArmor = { ...msg.armor[oppKey] };
  updateArmorUI();

  phaseBanner.classList.add('hidden');
  showBanner('構え — 槍の高さと左右を調整', 0);
  document.getElementById('hud-objective').textContent = '構え — 8秒後に3秒カウント→突撃';
  aimBarWrap.classList.remove('hidden');
  countdownOverlay.classList.add('hidden');
  document.getElementById('result-toast').classList.add('hidden');
  fadeBlood();
  startTick();
}

function onCountdownStart(msg) {
  app.phase = PHASE.COUNTDOWN;
  app.phaseEndsAt = msg.endsAt;
  aimBarWrap.classList.add('hidden');
  phaseBanner.classList.add('hidden');
  countdownOverlay.classList.remove('hidden');
  document.getElementById('hud-objective').textContent = '一斉突撃まで…';
  startTick();
}

function onChargeStart(msg) {
  app.phase = PHASE.CHARGE;
  app.chargeStart = performance.now();
  app.chargeDuration = msg.duration;
  app.phaseEndsAt = msg.endsAt;
  countdownOverlay.classList.add('hidden');
  countdownNum.textContent = '突撃!';
  showBanner('突撃!', 1200);
  document.getElementById('hud-objective').textContent = '突撃中！';
  startTick();
}

const ZONE_LABELS = { head: '頭', torso: '胴体', legs: '足' };

function onRoundResult(msg) {
  app.phase = PHASE.RESULT;
  app.chargeT = 1;
  const myAttack = app.role === 'host' ? msg.hostAttack : msg.guestAttack;
  const theirAttack = app.role === 'host' ? msg.guestAttack : msg.hostAttack;

  app.armor = { ...msg.armor[app.role] };
  app.oppArmor = { ...msg.armor[app.role === 'host' ? 'guest' : 'host'] };
  updateArmorUI();

  const toast = document.getElementById('result-toast');
  let html = '';
  if (myAttack.damage > 0) {
    html += `HIT <span class="hit">${ZONE_LABELS[myAttack.zone]}</span> <span class="dmg">${myAttack.damage}</span><br>`;
  } else html += 'MISS<br>';
  if (theirAttack.damage > 0) {
    html += `被弾 <span class="hit">${ZONE_LABELS[theirAttack.zone]}</span> <span class="dmg">${theirAttack.damage}</span>`;
    showBlood(theirAttack.damage);
    app.shake = theirAttack.damage * 0.2;
  } else html += 'DODGE';
  toast.innerHTML = html;
  toast.classList.remove('hidden');
  document.getElementById('hud-objective').textContent = '結果';

  if (msg.gameOver) setTimeout(() => showGameOver(msg), 3500);
  else startTick();
}

function showGameOver(msg) {
  app.phase = PHASE.FINISHED;
  const won = msg.winner === app.role;
  const draw = msg.winner === 'draw';
  document.getElementById('result-title').textContent = draw ? '引き分け' : won ? 'VICTORY' : 'DEFEAT';
  document.getElementById('result-message').textContent = draw
    ? '両騎士とも鎧が砕け散った…'
    : won ? '見事な馬上槍試合の勝利！' : '鎧が全て砕かれました…';
  showScreen('result');
}

function updateArmorUI() {
  for (const [part, label] of [['head', 'H'], ['torso', 'B'], ['legs', 'L']]) {
    document.getElementById(`armor-${part}`).style.width = `${app.armor[part]}%`;
    document.getElementById(`val-${part}`).textContent = app.armor[part];
  }
  document.getElementById('opp-armor').textContent =
    `H${app.oppArmor.head} B${app.oppArmor.torso} L${app.oppArmor.legs}`;
}

// ── Timers / HUD tick ───────────────────────────────────
function startTick() {
  stopTick();
  tickInterval = setInterval(tickHUD, 100);
  tickHUD();
}

function stopTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = null;
}

function tickHUD() {
  const left = Math.max(0, app.phaseEndsAt - Date.now());

  if (app.phase === PHASE.AIM) {
    const total = AIM_DURATION;
    const pct = Math.min(100, ((total - left) / total) * 100);
    aimBar.style.width = `${pct}%`;
    const sec = Math.ceil(left / 1000);
    showBanner(`構え — あと ${sec} 秒で一斉突撃`, 0);
  }

  if (app.phase === PHASE.COUNTDOWN) {
    const sec = Math.ceil(left / 1000);
    countdownNum.textContent = sec > 0 ? sec : '突撃!';
    if (sec <= 0) countdownNum.classList.add('go');
    else countdownNum.classList.remove('go');
  }

  if (app.phase === PHASE.CHARGE) {
    app.chargeT = Math.min(1, 1 - left / app.chargeDuration);
  }
}

// ── Blood ───────────────────────────────────────────────
function showBlood(damage) {
  const intensity = damage / 100;
  bloodOverlay.classList.remove('fade', 'creep');
  bloodOverlay.style.opacity = '0';
  const spread = 45 - intensity * 18;
  bloodOverlay.style.background = [
    `radial-gradient(ellipse 120% 80% at 0% 0%, rgba(150,12,12,${0.6 + intensity * 0.3}) 0%, transparent ${spread}%)`,
    `radial-gradient(ellipse 120% 80% at 100% 0%, rgba(150,12,12,${0.6 + intensity * 0.3}) 0%, transparent ${spread}%)`,
    `radial-gradient(ellipse 120% 80% at 0% 100%, rgba(130,10,10,${0.55 + intensity * 0.35}) 0%, transparent ${spread}%)`,
    `radial-gradient(ellipse 120% 80% at 100% 100%, rgba(130,10,10,${0.55 + intensity * 0.35}) 0%, transparent ${spread}%)`,
  ].join(',');
  void bloodOverlay.offsetWidth;
  bloodOverlay.classList.add('creep');
  bloodOverlay.style.opacity = String(0.3 + intensity * 0.5);
}

function fadeBlood() {
  bloodOverlay.classList.remove('creep');
  bloodOverlay.style.opacity = '0';
  bloodOverlay.classList.add('fade');
  setTimeout(() => { bloodOverlay.classList.remove('fade'); bloodOverlay.style.opacity = '0'; }, 4000);
}

// ── 左スティック（槍の焦点・8方向・滑らか）────────────────
const joyBase = document.getElementById('joystick-base');
const joyKnob = document.getElementById('joystick-knob');
const JOY_RADIUS = 42;

function joyPos(clientX, clientY) {
  const rect = joyBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > JOY_RADIUS) {
    dx = (dx / dist) * JOY_RADIUS;
    dy = (dy / dist) * JOY_RADIUS;
  }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joystick.targetNx = dx / JOY_RADIUS;
  joystick.targetNy = -dy / JOY_RADIUS;
}

function joyReset() {
  joystick.active = false;
  joystick.id = null;
  joystick.targetNx = 0;
  joystick.targetNy = 0;
  joyKnob.style.transform = 'translate(0, 0)';
}

joyBase.addEventListener('touchstart', (e) => {
  e.preventDefault();
  joystick.active = true;
  joystick.id = e.changedTouches[0].identifier;
  joyPos(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
}, { passive: false });

joyBase.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joystick.id) joyPos(t.clientX, t.clientY);
  }
}, { passive: false });

joyBase.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joystick.id) joyReset();
  }
});

joyBase.addEventListener('mousedown', (e) => {
  joystick.active = true;
  joyPos(e.clientX, e.clientY);
  const onMove = (ev) => joyPos(ev.clientX, ev.clientY);
  const onUp = () => { joyReset(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

// ── アクションボタン ────────────────────────────────────
const stabBtn = document.getElementById('btn-stab');
const dodgeBtn = document.getElementById('btn-dodge');

function doStab() {
  if (app.phase !== PHASE.AIM && app.phase !== PHASE.CHARGE) return;
  app.stabT = 0.35;
  send('stab');
}

function doDodge() {
  if (app.phase !== PHASE.AIM && app.phase !== PHASE.CHARGE) return;
  app.dodgeT = 0.5;
  send('dodge');
}

function bindActionBtn(btn, action) {
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); btn.classList.add('pressed'); action(); }, { passive: false });
  btn.addEventListener('touchend', () => btn.classList.remove('pressed'));
  btn.addEventListener('mousedown', () => { btn.classList.add('pressed'); action(); });
  btn.addEventListener('mouseup', () => btn.classList.remove('pressed'));
}

bindActionBtn(stabBtn, doStab);
bindActionBtn(dodgeBtn, doDodge);

function applyInput() {
  const canControl = app.phase === PHASE.AIM || app.phase === PHASE.CHARGE;
  if (!canControl) {
    joystick.smoothNx *= 0.9;
    joystick.smoothNy *= 0.9;
    return;
  }

  joystick.smoothNx += (joystick.targetNx - joystick.smoothNx) * AIM_SMOOTH;
  joystick.smoothNy += (joystick.targetNy - joystick.smoothNy) * AIM_SMOOTH;

  const dead = 0.08;
  if (Math.abs(joystick.smoothNx) > dead || Math.abs(joystick.smoothNy) > dead) {
    app.x = Math.max(0.1, Math.min(0.9, app.x + joystick.smoothNx * AIM_SENS_X));
    app.height = Math.max(0.05, Math.min(0.95, app.height + joystick.smoothNy * AIM_SENS_Y));
  }

  const now = performance.now();
  if (now - app.lastAimSend > AIM_SEND_INTERVAL) {
    app.lastAimSend = now;
    send('update_aim', { x: app.x, height: app.height });
  }
}

// ── Render loop ─────────────────────────────────────────
function loop() {
  applyInput();

  if (fps && app.phase !== PHASE.LOBBY && app.phase !== PHASE.FINISHED) {
    if (app.phase === PHASE.CHARGE && app.phaseEndsAt) {
      const left = Math.max(0, app.phaseEndsAt - Date.now());
      app.chargeT = Math.min(1, 1 - left / app.chargeDuration);
    }
    fps.setState({
      phase: app.phase,
      x: app.x,
      height: app.height,
      chargeT: app.chargeT,
      shake: app.shake,
      stabT: app.stabT,
      dodgeT: app.dodgeT,
      playerSide: app.role,
    });
    if (app.stabT > 0) app.stabT -= 0.016;
    if (app.dodgeT > 0) app.dodgeT -= 0.016;
    fps.updateDust();
    fps.render();
  }

  requestAnimationFrame(loop);
}

connect();
requestAnimationFrame(loop);
