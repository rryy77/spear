const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const JOUST_CONSTANTS = require('./shared/constants');
const { DEFAULT_EQUIPMENT } = require('./shared/equipment');
const { resolveImpact, calcRewards } = require('./shared/sim');

const PORT = process.env.PORT || 3000;
const { COUNTDOWN_MS, CHARGE_MS, RESULT_MS } = JOUST_CONSTANTS;

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

function createPlayer(ws, name) {
  return {
    ws,
    name,
    ready: false,
    rematchRequest: false,
    equipment: { ...DEFAULT_EQUIPMENT },
    lanceHeight: 0.5,
    lanceActionTiming: null,
    score: 0,
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

function equipmentSnapshot(room) {
  return {
    host: room.host ? { name: room.host.name, equipment: room.host.equipment, ready: room.host.ready } : null,
    guest: room.guest ? { name: room.guest.name, equipment: room.guest.equipment, ready: room.guest.ready } : null,
    scores: { host: room.host?.score ?? 0, guest: room.guest?.score ?? 0 },
    round: room.round,
  };
}

function enterEquipmentPhase(room) {
  room.phase = 'equipment';
  room.host.ready = false;
  room.host.rematchRequest = false;
  room.host.lanceHeight = 0.5;
  room.host.lanceActionTiming = null;
  if (room.guest) {
    room.guest.ready = false;
    room.guest.rematchRequest = false;
    room.guest.lanceHeight = 0.5;
    room.guest.lanceActionTiming = null;
  }
  broadcastRoom(room, 'phase_equipment', equipmentSnapshot(room));
}

function bothReady(room) {
  return room.host?.ready && room.guest?.ready;
}

function startMatchCountdown(room) {
  if (!bothReady(room)) return;
  room.phase = 'countdown';
  const endsAt = Date.now() + COUNTDOWN_MS;
  room.countdownEndsAt = endsAt;
  broadcastRoom(room, 'match_countdown', { endsAt, duration: COUNTDOWN_MS });

  room.countdownTimer = setTimeout(() => beginMatch(room), COUNTDOWN_MS);
}

function beginMatch(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'charge';
  room.matchStartTime = Date.now();
  room.host.lanceHeight = 0.5;
  room.guest.lanceHeight = 0.5;
  room.host.lanceActionTiming = null;
  room.guest.lanceActionTiming = null;

  broadcastRoom(room, 'match_start', {
    matchStartTime: room.matchStartTime,
    chargeDuration: CHARGE_MS,
    round: room.round,
    equipment: {
      host: room.host.equipment,
      guest: room.guest.equipment,
    },
  });

  room.chargeTimer = setTimeout(() => resolveMatch(room), CHARGE_MS);
}

function resolveMatch(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'result';

  const impactResult = resolveImpact(room.host, room.guest);
  let roundWinner = null;
  const hostDmg = impactResult.hostHit.damage;
  const guestDmg = impactResult.guestHit.damage;
  if (hostDmg > guestDmg) {
    roundWinner = 'host';
    room.host.score += 1;
  } else if (guestDmg > hostDmg) {
    roundWinner = 'guest';
    room.guest.score += 1;
  }

  const gameOver = room.host.score >= JOUST_CONSTANTS.ROUNDS_TO_WIN
    || room.guest.score >= JOUST_CONSTANTS.ROUNDS_TO_WIN
    || room.round >= 5;
  let matchWinner = null;
  if (room.host.score >= JOUST_CONSTANTS.ROUNDS_TO_WIN) matchWinner = 'host';
  else if (room.guest.score >= JOUST_CONSTANTS.ROUNDS_TO_WIN) matchWinner = 'guest';

  const rewards = {
    host: calcRewards(matchWinner === 'host', room.round),
    guest: calcRewards(matchWinner === 'guest', room.round),
  };

  broadcastRoom(room, 'impact_result', {
    impactResult,
    roundWinner,
    scores: { host: room.host.score, guest: room.guest.score },
    round: room.round,
  });

  broadcastRoom(room, 'match_result', {
    roundWinner,
    matchWinner,
    gameOver,
    scores: { host: room.host.score, guest: room.guest.score },
    rewards,
    impactResult,
    round: room.round,
  });

  if (gameOver) {
    room.phase = 'finished';
    return;
  }

  room.round += 1;
  room.host.rematchRequest = false;
  room.guest.rematchRequest = false;
  room.resultTimer = setTimeout(() => enterEquipmentPhase(room), RESULT_MS);
}

function startRematch(room) {
  room.host.score = 0;
  room.guest.score = 0;
  room.round = 1;
  enterEquipmentPhase(room);
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
        const room = {
          code,
          host: createPlayer(ws, msg.name || '騎士A'),
          guest: null,
          phase: 'lobby',
          round: 1,
          matchStartTime: null,
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
        send(room.host.ws, 'player_joined', { guestName: room.guest.name });
        enterEquipmentPhase(room);
        break;
      }

      case 'set_equipment': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'equipment') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        const eq = msg.selectedEquipment || msg.equipment || {};
        if (eq.horse) player.equipment.horse = eq.horse;
        if (eq.lance) player.equipment.lance = eq.lance;
        if (eq.armor) player.equipment.armor = eq.armor;
        if (eq.shield) player.equipment.shield = eq.shield;
        player.ready = false;
        broadcastRoom(room, 'equipment_update', {
          role,
          selectedEquipment: player.equipment,
          ready: false,
          ...equipmentSnapshot(room),
        });
        break;
      }

      case 'set_ready': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'equipment') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        player.ready = Boolean(msg.ready);
        broadcastRoom(room, 'equipment_update', {
          role,
          selectedEquipment: player.equipment,
          ready: player.ready,
          ...equipmentSnapshot(room),
        });
        if (bothReady(room)) startMatchCountdown(room);
        break;
      }

      case 'update_lance': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'charge') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        if (typeof msg.lanceHeight === 'number') {
          player.lanceHeight = clamp(msg.lanceHeight, 0, 1);
          broadcastRoom(room, 'lance_update', {
            role,
            lanceHeight: player.lanceHeight,
          }, player.ws);
        }
        break;
      }

      case 'set_lance_timing': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'charge') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player || player.lanceActionTiming != null) return;
        if (typeof msg.lanceActionTiming === 'number') {
          player.lanceActionTiming = clamp(msg.lanceActionTiming, 0, 1);
        } else if (room.matchStartTime) {
          player.lanceActionTiming = clamp(
            (Date.now() - room.matchStartTime) / CHARGE_MS,
            0,
            1
          );
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
  console.log(`Joust Royale server running at http://localhost:${PORT}`);
});
