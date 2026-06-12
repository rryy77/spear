const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const AIM_DURATION_MS = 8000;
const CHARGE_DURATION_MS = 2500;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

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
    ready: false,
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

function roomSnapshot(room) {
  const players = {};
  if (room.host) {
    players.host = {
      name: room.host.name,
      armor: room.host.armor,
      connected: room.host.ws.readyState === room.host.ws.OPEN,
    };
  }
  if (room.guest) {
    players.guest = {
      name: room.guest.name,
      armor: room.guest.armor,
      connected: room.guest.ws.readyState === room.guest.ws.OPEN,
    };
  }
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    aimEndsAt: room.aimEndsAt,
    players,
    isHost: undefined,
  };
}

function heightToZone(h) {
  if (h < 0.34) return 'head';
  if (h < 0.67) return 'torso';
  return 'legs';
}

function calcHitQuality(attackerX, defenderX) {
  const gap = Math.abs(attackerX - defenderX);
  if (gap < 0.09) return 100;
  if (gap < 0.2) return 50;
  if (gap < 0.32) return 33;
  return 0;
}

function resolveAttack(attacker, defender) {
  const damage = calcHitQuality(attacker.x, defender.x);
  const zone = heightToZone(attacker.height);
  if (damage > 0) {
    defender.armor[zone] = Math.max(0, defender.armor[zone] - damage);
  }
  return { damage, zone, armor: { ...defender.armor } };
}

function isDefeated(player) {
  return player.armor.head <= 0 && player.armor.torso <= 0 && player.armor.legs <= 0;
}

function startAimPhase(room) {
  room.phase = 'aim';
  room.aimEndsAt = Date.now() + AIM_DURATION_MS;
  room.host.x = 0.5;
  room.host.height = 0.5;
  room.guest.x = 0.5;
  room.guest.height = 0.5;

  broadcastRoom(room, 'round_start', {
    round: room.round,
    aimDuration: AIM_DURATION_MS,
    armor: {
      host: room.host.armor,
      guest: room.guest.armor,
    },
  });

  if (room.aimTimer) clearTimeout(room.aimTimer);
  room.aimTimer = setTimeout(() => resolveRound(room), AIM_DURATION_MS);
}

function resolveRound(room) {
  if (!room.host || !room.guest) return;
  room.phase = 'charge';

  const hostHitsGuest = resolveAttack(room.host, room.guest);
  const guestHitsHost = resolveAttack(room.guest, room.host);

  broadcastRoom(room, 'charge_start', { duration: CHARGE_DURATION_MS });

  setTimeout(() => {
    room.phase = 'result';

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
    if (room.resultTimer) clearTimeout(room.resultTimer);
    room.resultTimer = setTimeout(() => startAimPhase(room), 3500);
  }, CHARGE_DURATION_MS);
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

  if (room.aimTimer) clearTimeout(room.aimTimer);
  if (room.resultTimer) clearTimeout(room.resultTimer);

  broadcastRoom(room, 'player_left', {
    message: wasHost ? 'ホストが退出しました' : '対戦相手が退出しました',
  });

  if (!room.host && !room.guest) {
    rooms.delete(room.code);
  }
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
          host: createPlayer(ws, msg.name || 'ホスト'),
          guest: null,
          phase: 'lobby',
          round: 1,
          aimEndsAt: null,
          aimTimer: null,
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
        room.guest = createPlayer(ws, msg.name || 'ゲスト');
        role = 'guest';
        roomCode = code;
        send(ws, 'room_joined', { code, role: 'guest' });
        send(ws, 'lobby_update', {
          ...roomSnapshot(room),
          role: 'guest',
          canStart: false,
        });
        send(room.host.ws, 'player_joined', {
          guestName: room.guest.name,
        });
        send(room.host.ws, 'lobby_update', {
          ...roomSnapshot(room),
          role: 'host',
          canStart: true,
        });
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
        broadcastRoom(room, 'game_start', {
          hostName: room.host.name,
          guestName: room.guest.name,
        });
        startAimPhase(room);
        break;
      }

      case 'update_aim': {
        const room = rooms.get(roomCode);
        if (!room || room.phase !== 'aim') return;
        const player = role === 'host' ? room.host : room.guest;
        if (!player) return;
        player.x = clamp(msg.x ?? player.x, 0.1, 0.9);
        player.height = clamp(msg.height ?? player.height, 0.05, 0.95);
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
