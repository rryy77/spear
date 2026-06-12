const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const JOUST_CONSTANTS = require('./shared/constants');
const { resolveBout } = require('./shared/sim');

const PORT = process.env.PORT || 3000;
const { COUNTDOWN_MS, CHARGE_MS, RESULT_MS } = JOUST_CONSTANTS;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

app.get('/health', (_req, res) => res.json({ ok: true }));

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

function createPlayer(ws, name) {
  return {
    ws,
    name,
    ready: false,
    rematchRequest: false,
    lanceHeight: 0.5,
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
  for (const key of ['countdownTimer', 'chargeTimer', 'resultTimer']) {
    if (room[key]) clearTimeout(room[key]);
    room[key] = null;
  }
}

function waitingSnapshot(room) {
  return {
    host: room.host ? { name: room.host.name, ready: room.host.ready } : null,
    guest: room.guest ? { name: room.guest.name, ready: room.guest.ready } : null,
  };
}

function enterWaitingPhase(room) {
  room.phase = 'waiting';
  room.matchStartTime = null;
  if (room.host) {
    room.host.ready = false;
    room.host.rematchRequest = false;
    room.host.lanceHeight = 0.5;
  }
  if (room.guest) {
    room.guest.ready = false;
    room.guest.rematchRequest = false;
    room.guest.lanceHeight = 0.5;
  }
  broadcastRoom(room, 'phase_waiting', waitingSnapshot(room));
}

function bothReady(room) {
  return room.host?.ready && room.guest?.ready;
}

function startCountdown(room) {
  if (!bothReady(room)) return;
  room.phase = 'countdown';
  const endsAt = Date.now() + COUNTDOWN_MS;
  broadcastRoom(room, 'match_countdown', { endsAt, duration: COUNTDOWN_MS });
  room.countdownTimer = setTimeout(() => beginCharge(room), COUNTDOWN_MS);
}

function beginCharge(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'charge';
  room.matchStartTime = Date.now();
  room.host.lanceHeight = 0.5;
  room.guest.lanceHeight = 0.5;

  broadcastRoom(room, 'match_start', {
    matchStartTime: room.matchStartTime,
    chargeDuration: CHARGE_MS,
  });

  room.chargeTimer = setTimeout(() => resolveMatch(room), CHARGE_MS);
}

function resolveMatch(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'result';

  const impactResult = resolveBout(room.host, room.guest);

  broadcastRoom(room, 'impact_result', { impactResult });

  broadcastRoom(room, 'match_result', {
    winner: impactResult.winner,
    impactResult,
  });

  room.resultTimer = setTimeout(() => {
    room.phase = 'finished';
    broadcastRoom(room, 'phase_finished', waitingSnapshot(room));
  }, RESULT_MS);
}

function startRematch(room) {
  room.host.rematchRequest = false;
  room.guest.rematchRequest = false;
  enterWaitingPhase(room);
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
  if (wasHost) room.host = null;
  else if (room.guest?.ws === ws) room.guest = null;
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
        rooms.set(code, {
          code,
          host: createPlayer(ws, msg.name || '騎士A'),
          guest: null,
          phase: 'lobby',
          matchStartTime: null,
          countdownTimer: null,
          chargeTimer: null,
          resultTimer: null,
        });
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
        send(room.host.ws, 'player_joined', { guestName: room.guest.name });
        enterWaitingPhase(room);
        break;
      }

      case 'set_ready': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'waiting') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        player.ready = Boolean(msg.ready);
        player.rematchRequest = false;
        broadcastRoom(room, 'ready_update', { role, ready: player.ready, ...waitingSnapshot(room) });
        if (room.phase === 'waiting' && bothReady(room)) startCountdown(room);
        break;
      }

      case 'update_lance': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'charge') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player || typeof msg.lanceHeight !== 'number') return;
        player.lanceHeight = clamp(msg.lanceHeight, 0, 1);
        broadcastRoom(room, 'lance_update', { role, lanceHeight: player.lanceHeight }, player.ws);
        break;
      }

      case 'rematch_request': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'finished') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        player.rematchRequest = Boolean(msg.accept);
        broadcastRoom(room, 'rematch_state', {
          hostRematch: room.host.rematchRequest,
          guestRematch: room.guest.rematchRequest,
        });
        if (room.host.rematchRequest && room.guest.rematchRequest) {
          startRematch(room);
        }
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
  console.log(`Joust server running at http://localhost:${PORT}`);
});
