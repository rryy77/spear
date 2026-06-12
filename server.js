const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const INTRO_MS = 2000;
const AIM_DURATION_MS = 8000;
const COUNTDOWN_MS = 3000;
const CHARGE_DURATION_MS = 3000;
const RESULT_PAUSE_MS = 4500;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (req, res) => {
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const defaultUrl = host ? `${proto === 'https' ? 'wss' : 'ws'}://${host}` : '';
  const wsUrl = (process.env.WS_URL || defaultUrl).replace(/\/$/, '');
  res.json({ wsUrl });
});

const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString('hex').toUpperCase();
  } while (rooms.has(code));
  return code;
}

function defaultArmor() {
  return { head: 100, torso: 100, legs: 100 };
}

function createPlayer(ws, name) {
  return {
    ws,
    name,
    x: 0.5,
    height: 0.5,
    armor: defaultArmor(),
    stab: false,
    dodge: false,
  };
}

function send(ws, type, payload = {}) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcastRoom(room, type, payload = {}, excludeWs = null) {
  for (const player of [room.host, room.guest].filter(Boolean)) {
    if (player.ws !== excludeWs) send(player.ws, type, payload);
  }
}

function clearRoomTimers(room) {
  for (const key of ['introTimer', 'aimTimer', 'countdownTimer', 'chargeTimer', 'resultTimer']) {
    if (room[key]) clearTimeout(room[key]);
    room[key] = null;
  }
}

function heightToZone(h) {
  if (h < 0.34) return 'head';
  if (h < 0.67) return 'torso';
  return 'legs';
}

function calcHitQuality(attacker, defender) {
  let gap = Math.abs(attacker.x - defender.x);
  if (attacker.stab) gap *= 0.82;
  if (defender.dodge) gap += 0.14;
  if (gap < 0.09) return 100;
  if (gap < 0.2) return 50;
  if (gap < 0.32) return 33;
  return 0;
}

function resolveAttack(attacker, defender) {
  const damage = calcHitQuality(attacker, defender);
  const zone = heightToZone(attacker.height);
  if (damage > 0) {
    defender.armor[zone] = Math.max(0, defender.armor[zone] - damage);
  }
  return { damage, zone, armor: { ...defender.armor } };
}

function isDefeated(player) {
  return player.armor.head <= 0 && player.armor.torso <= 0 && player.armor.legs <= 0;
}

function startIntroThenRound(room) {
  room.phase = 'intro';
  const introEndsAt = Date.now() + INTRO_MS;
  broadcastRoom(room, 'game_intro', {
    round: room.round,
    endsAt: introEndsAt,
    hostName: room.host.name,
    guestName: room.guest.name,
    message: 'リストの両端から向かい合い、一斉に突撃します',
  });
  room.introTimer = setTimeout(() => startAimPhase(room), INTRO_MS);
}

function startAimPhase(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'aim';
  room.aimEndsAt = Date.now() + AIM_DURATION_MS;
  room.host.x = 0.5;
  room.host.height = 0.5;
  room.guest.x = 0.5;
  room.guest.height = 0.5;

  broadcastRoom(room, 'round_start', {
    round: room.round,
    aimEndsAt: room.aimEndsAt,
    aimDuration: AIM_DURATION_MS,
    armor: {
      host: room.host.armor,
      guest: room.guest.armor,
    },
  });

  room.aimTimer = setTimeout(() => startCountdown(room), AIM_DURATION_MS);
}

function startCountdown(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'countdown';
  room.countdownEndsAt = Date.now() + COUNTDOWN_MS;

  broadcastRoom(room, 'countdown_start', {
    endsAt: room.countdownEndsAt,
    duration: COUNTDOWN_MS,
  });

  room.countdownTimer = setTimeout(() => beginCharge(room), COUNTDOWN_MS);
}

function beginCharge(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'charge';
  room.chargeEndsAt = Date.now() + CHARGE_DURATION_MS;

  const hostHitsGuest = resolveAttack(room.host, room.guest);
  const guestHitsHost = resolveAttack(room.guest, room.host);
  room.host.stab = false;
  room.guest.stab = false;
  room.host.dodge = false;
  room.guest.dodge = false;
  room.pendingResult = { hostHitsGuest, guestHitsHost };

  broadcastRoom(room, 'charge_start', {
    endsAt: room.chargeEndsAt,
    duration: CHARGE_DURATION_MS,
  });

  room.chargeTimer = setTimeout(() => finishRound(room), CHARGE_DURATION_MS);
}

function finishRound(room) {
  if (!room.pendingResult) return;
  room.phase = 'result';
  const { hostHitsGuest, guestHitsHost } = room.pendingResult;
  room.pendingResult = null;

  const hostDefeated = isDefeated(room.host);
  const guestDefeated = isDefeated(room.guest);
  const gameOver = hostDefeated || guestDefeated;
  let winner = null;
  if (hostDefeated && !guestDefeated) winner = 'guest';
  else if (guestDefeated && !hostDefeated) winner = 'host';
  else if (hostDefeated && guestDefeated) winner = 'draw';

  broadcastRoom(room, 'round_result', {
    round: room.round,
    hostAttack: {
      damage: hostHitsGuest.damage,
      zone: hostHitsGuest.zone,
      targetArmor: hostHitsGuest.armor,
    },
    guestAttack: {
      damage: guestHitsHost.damage,
      zone: guestHitsHost.zone,
      targetArmor: guestHitsHost.armor,
    },
    armor: {
      host: room.host.armor,
      guest: room.guest.armor,
    },
    gameOver,
    winner,
  });

  if (gameOver) {
    room.phase = 'finished';
    return;
  }

  room.round += 1;
  room.resultTimer = setTimeout(() => startAimPhase(room), RESULT_PAUSE_MS);
}

function findRoomByWs(ws) {
  for (const room of rooms.values()) {
    if (room.host?.ws === ws || room.guest?.ws === ws) return room;
  }
  return null;
}

function removePlayer(ws) {
  const room = findRoomByWs(ws);
  if (!room) return;

  const wasHost = room.host?.ws === ws;
  const wasGuest = room.guest?.ws === ws;
  if (wasHost) room.host = null;
  if (wasGuest) room.guest = null;

  clearRoomTimers(room);
  broadcastRoom(room, 'player_left', {
    message: wasHost ? 'ホストが退出しました' : '対戦相手が退出しました',
  });

  if (!room.host && !room.guest) rooms.delete(room.code);
}

wss.on('connection', (ws) => {
  let role = null;
  let roomCode = null;

  send(ws, 'connected', { message: 'サーバーに接続しました' });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        const code = generateRoomCode();
        const room = {
          code,
          host: createPlayer(ws, msg.name || '騎士A'),
          guest: null,
          phase: 'lobby',
          round: 1,
          introTimer: null,
          aimTimer: null,
          countdownTimer: null,
          chargeTimer: null,
          resultTimer: null,
        };
        rooms.set(code, room);
        role = 'host';
        roomCode = code;
        send(ws, 'room_created', { code, role: 'host' });
        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          send(ws, 'error', { message: 'ルームが見つかりません' });
          return;
        }
        if (room.guest) {
          send(ws, 'error', { message: 'ルームは満員です' });
          return;
        }
        room.guest = createPlayer(ws, msg.name || '騎士B');
        role = 'guest';
        roomCode = code;
        send(ws, 'room_joined', { code, role: 'guest' });
        send(ws, 'lobby_update', { role: 'guest', canStart: false });
        send(room.host.ws, 'player_joined', { guestName: room.guest.name });
        send(room.host.ws, 'lobby_update', { role: 'host', canStart: true });
        break;
      }

      case 'start_game': {
        const room = rooms.get(roomCode);
        if (!room || role !== 'host') return;
        if (!room.guest) {
          send(ws, 'error', { message: '対戦相手がまだ参加していません' });
          return;
        }
        room.phase = 'playing';
        room.round = 1;
        clearRoomTimers(room);
        broadcastRoom(room, 'game_start', {
          hostName: room.host.name,
          guestName: room.guest.name,
        });
        startIntroThenRound(room);
        break;
      }

      case 'update_aim': {
        const room = rooms.get(roomCode);
        if (!room || (room.phase !== 'aim' && room.phase !== 'charge')) return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        player.x = clamp(msg.x ?? player.x, 0.1, 0.9);
        player.height = clamp(msg.height ?? player.height, 0.05, 0.95);
        break;
      }

      case 'stab': {
        const room = rooms.get(roomCode);
        if (!room || (room.phase !== 'aim' && room.phase !== 'charge')) return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        player.stab = true;
        setTimeout(() => { player.stab = false; }, 400);
        break;
      }

      case 'dodge': {
        const room = rooms.get(roomCode);
        if (!room || (room.phase !== 'aim' && room.phase !== 'charge')) return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        player.dodge = true;
        setTimeout(() => { player.dodge = false; }, 600);
        break;
      }

      case 'leave_room': {
        removePlayer(ws);
        role = null;
        roomCode = null;
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => removePlayer(ws));
});

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

server.listen(PORT, () => {
  console.log(`ROCK YOU! server running at http://localhost:${PORT}`);
});
