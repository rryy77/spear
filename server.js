const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const JOUST_CONSTANTS = require('./shared/constants');
const { resolvePass, resolveMatchWinner } = require('./shared/sim');

const PORT = process.env.PORT || 3000;
const {
  ROUNDS, COUNTDOWN_MS, CHARGE_MS, PASS_RESULT_MS, MATCH_RESULT_MS,
} = JOUST_CONSTANTS;

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
    selectedAimHeight: 'MID',
    lanceTiming: null,
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
  for (const key of ['countdownTimer', 'chargeTimer', 'passTimer', 'matchTimer']) {
    if (room[key]) clearTimeout(room[key]);
    room[key] = null;
  }
}

function scoreSnapshot(room) {
  return { host: room.hostScore, guest: room.guestScore };
}

function waitingSnapshot(room) {
  return {
    host: room.host ? { name: room.host.name, ready: room.host.ready } : null,
    guest: room.guest ? { name: room.guest.name, ready: room.guest.ready } : null,
    score: scoreSnapshot(room),
  };
}

function resetPlayersPass(room) {
  for (const p of [room.host, room.guest].filter(Boolean)) {
    p.selectedAimHeight = 'MID';
    p.lanceTiming = null;
  }
}

function enterWaitingPhase(room) {
  room.phase = 'waiting';
  room.roundNumber = 0;
  room.hostScore = 0;
  room.guestScore = 0;
  room.matchStartTime = null;
  room.knockdown = null;
  room.foul = null;
  for (const p of [room.host, room.guest].filter(Boolean)) {
    p.ready = false;
    p.rematchRequest = false;
    p.selectedAimHeight = 'MID';
    p.lanceTiming = null;
  }
  broadcastRoom(room, 'phase_waiting', waitingSnapshot(room));
}

function bothReady(room) {
  return room.host?.ready && room.guest?.ready;
}

function startMatch(room) {
  room.roundNumber = 1;
  room.hostScore = 0;
  room.guestScore = 0;
  room.knockdown = null;
  room.foul = null;
  resetPlayersPass(room);
  startRoundCountdown(room);
}

function startRoundCountdown(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'countdown';
  resetPlayersPass(room);
  const endsAt = Date.now() + COUNTDOWN_MS;
  broadcastRoom(room, 'round_countdown', {
    roundNumber: room.roundNumber,
    endsAt,
    duration: COUNTDOWN_MS,
    score: scoreSnapshot(room),
  });
  room.countdownTimer = setTimeout(() => beginCharge(room), COUNTDOWN_MS);
}

function beginCharge(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'charge';
  room.matchStartTime = Date.now();
  room.host.lanceTiming = null;
  room.guest.lanceTiming = null;

  broadcastRoom(room, 'round_start', {
    roundNumber: room.roundNumber,
    matchStartTime: room.matchStartTime,
    chargeDuration: CHARGE_MS,
    score: scoreSnapshot(room),
  });

  room.chargeTimer = setTimeout(() => resolvePassPhase(room), CHARGE_MS);
}

function resolvePassPhase(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'pass_result';

  const pass = resolvePass(room.host, room.guest, room.roundNumber, room.code);
  room.hostScore += pass.hitResult.host.points;
  room.guestScore += pass.hitResult.guest.points;
  if (pass.knockdown) room.knockdown = pass.knockdown;
  if (pass.foul) room.foul = pass.foul;

  const score = scoreSnapshot(room);

  broadcastRoom(room, 'timing_result', {
    roundNumber: room.roundNumber,
    timingResult: pass.timingResult,
  });

  broadcastRoom(room, 'hit_result', {
    roundNumber: room.roundNumber,
    hitResult: pass.hitResult,
    knockdown: pass.knockdown,
    foul: pass.foul,
    score,
  });

  const matchOver = pass.knockdown || pass.foul
    || room.roundNumber >= ROUNDS;

  if (matchOver) {
    finishMatch(room, pass);
    return;
  }

  room.passTimer = setTimeout(() => {
    room.roundNumber += 1;
    startRoundCountdown(room);
  }, PASS_RESULT_MS);
}

function finishMatch(room, lastPass) {
  room.phase = 'match_result';
  const { winner, reason } = resolveMatchWinner(
    room.hostScore,
    room.guestScore,
    room.knockdown,
    room.foul
  );

  broadcastRoom(room, 'match_result', {
    matchResult: {
      winner,
      reason,
      score: scoreSnapshot(room),
      knockdown: room.knockdown,
      foul: room.foul,
      rounds: ROUNDS,
    },
    hitResult: lastPass?.hitResult,
    timingResult: lastPass?.timingResult,
    roundNumber: room.roundNumber,
  });

  room.matchTimer = setTimeout(() => {
    room.phase = 'finished';
    broadcastRoom(room, 'phase_finished', waitingSnapshot(room));
  }, MATCH_RESULT_MS);
}

function startRematch(room) {
  for (const p of [room.host, room.guest].filter(Boolean)) {
    p.rematchRequest = false;
  }
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
          roundNumber: 0,
          hostScore: 0,
          guestScore: 0,
          matchStartTime: null,
          knockdown: null,
          foul: null,
          countdownTimer: null,
          chargeTimer: null,
          passTimer: null,
          matchTimer: null,
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
        broadcastRoom(room, 'ready_update', { role, ready: player.ready, ...waitingSnapshot(room) });
        if (bothReady(room)) startMatch(room);
        break;
      }

      case 'set_aim': {
        const room = rooms.get(roomCode);
        if (!room || (room.phase !== 'countdown' && room.phase !== 'charge')) return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        const aim = msg.selectedAimHeight;
        if (!['HIGH', 'MID', 'LOW'].includes(aim)) return;
        player.selectedAimHeight = aim;
        broadcastRoom(room, 'aim_update', { role, selectedAimHeight: aim }, player.ws);
        break;
      }

      case 'set_lance_timing': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'charge') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player || player.lanceTiming != null) return;
        if (typeof msg.lanceTiming === 'number') {
          player.lanceTiming = clamp(msg.lanceTiming, 0, 1);
        } else if (typeof msg.tapTiming === 'number') {
          player.lanceTiming = clamp(msg.tapTiming, 0, 1);
        }
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
