/**
 * Joust 決定論シミュレーション — 移動・タイミング・命中判定
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./constants'));
  } else {
    root.JoustSim = factory(root.JOUST_CONSTANTS);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const CHARGE_MS = C.CHARGE_MS;
  const AIMS = ['HIGH', 'MID', 'LOW'];

  function easeCharge(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }

  function getChargeProgress(nowMs, matchStartTime) {
    return Math.max(0, Math.min(1, (nowMs - matchStartTime) / CHARGE_MS));
  }

  function getTimingCursor(nowMs, matchStartTime) {
    const elapsed = nowMs - matchStartTime;
    const wave = Math.sin((elapsed / C.CURSOR_PERIOD_MS) * Math.PI * 2);
    return 0.5 + 0.42 * wave;
  }

  function getPlayerPos(progress) {
    const t = easeCharge(progress);
    return { x: 0.28, y: 0.88 - t * 0.42, scale: 0.85 + t * 0.35 };
  }

  function getEnemyPos(progress) {
    const t = easeCharge(progress);
    return { x: 0.72, y: 0.12 + t * 0.42, scale: 0.55 + t * 0.35 };
  }

  function seeded(seed) {
    const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function hashSeed(roomCode, roundNumber, salt) {
    let h = 0;
    const s = `${roomCode}-${roundNumber}-${salt}`;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
    return Math.abs(h);
  }

  function evaluateTiming(lanceTiming) {
    if (lanceTiming == null || typeof lanceTiming !== 'number') return 'MISS';
    const pos = Math.max(0, Math.min(1, lanceTiming));
    const dist = Math.abs(pos - 0.5);
    if (dist <= C.TIMING_PERFECT) return 'PERFECT';
    if (dist <= C.TIMING_GOOD) return 'GOOD';
    if (dist <= C.TIMING_GRAZE) return pos < 0.5 ? 'EARLY' : 'LATE';
    return 'MISS';
  }

  function resolveAttack(attacker, defender, seed) {
    const aim = AIMS.includes(attacker.selectedAimHeight) ? attacker.selectedAimHeight : 'MID';
    const defAim = AIMS.includes(defender.selectedAimHeight) ? defender.selectedAimHeight : 'MID';
    const timing = evaluateTiming(attacker.lanceTiming);

    const out = {
      timingResult: timing,
      selectedAimHeight: aim,
      lanceTiming: attacker.lanceTiming,
      hitZone: null,
      points: 0,
      lanceBreak: false,
      knockdown: false,
      foul: false,
      disqualified: false,
    };

    if (timing === 'MISS') return out;

    if (aim === 'LOW') {
      if (timing === 'PERFECT' || (timing === 'GOOD' && seeded(seed) > 0.35)) {
        out.foul = true;
        out.hitZone = 'horse';
        out.points = C.POINTS_FOUL;
        if (seeded(seed + 7) > 0.65) out.disqualified = true;
        return out;
      }
      if (timing === 'GOOD') {
        out.hitZone = 'torso';
        out.points = C.POINTS_TORSO;
      }
      return out;
    }

    const q = timing === 'PERFECT' ? 1 : timing === 'GOOD' ? 0.72 : 0.38;

    if (aim === 'HIGH') {
      if (q >= 0.7 && (defAim !== 'HIGH' || timing === 'PERFECT')) {
        out.hitZone = 'helmet';
        out.points = timing === 'PERFECT' ? C.POINTS_HELMET : C.POINTS_SHIELD;
        if (timing === 'PERFECT' && seeded(seed + 1) < C.KNOCKDOWN_CHANCE) out.knockdown = true;
      } else if (q >= 0.35) {
        out.hitZone = 'shield';
        out.points = 1;
      }
    } else if (aim === 'MID') {
      if (q >= 0.7) {
        out.hitZone = defAim === 'HIGH' ? 'torso' : 'shield';
        out.points = out.hitZone === 'shield' ? C.POINTS_SHIELD : C.POINTS_TORSO;
      } else if (q >= 0.35) {
        out.hitZone = 'torso';
        out.points = C.POINTS_TORSO;
      }
    }

    if (out.points > 0 && timing === 'PERFECT' && seeded(seed + 3) < C.LANCE_BREAK_CHANCE) {
      out.lanceBreak = true;
      out.points += C.POINTS_LANCE_BREAK;
    }

    return out;
  }

  function resolvePass(host, guest, roundNumber, roomCode) {
    const seedH = hashSeed(roomCode, roundNumber, 'host');
    const seedG = hashSeed(roomCode, roundNumber, 'guest');
    const hostHit = resolveAttack(host, guest, seedH);
    const guestHit = resolveAttack(guest, host, seedG);

    let knockdown = null;
    if (hostHit.knockdown) knockdown = 'guest';
    if (guestHit.knockdown) knockdown = 'host';

    let foul = null;
    if (hostHit.disqualified) foul = 'host';
    if (guestHit.disqualified) foul = 'guest';

    return {
      roundNumber,
      timingResult: {
        host: { tier: hostHit.timingResult, lanceTiming: host.lanceTiming },
        guest: { tier: guestHit.timingResult, lanceTiming: guest.lanceTiming },
      },
      hitResult: {
        host: hostHit,
        guest: guestHit,
      },
      knockdown,
      foul,
    };
  }

  function resolveMatchWinner(hostScore, guestScore, knockdown, foul) {
    if (foul === 'host') return { winner: 'guest', reason: 'foul' };
    if (foul === 'guest') return { winner: 'host', reason: 'foul' };
    if (knockdown === 'guest') return { winner: 'host', reason: 'knockdown' };
    if (knockdown === 'host') return { winner: 'guest', reason: 'knockdown' };
    if (hostScore > guestScore) return { winner: 'host', reason: 'points' };
    if (guestScore > hostScore) return { winner: 'guest', reason: 'points' };
    return { winner: null, reason: 'draw' };
  }

  return {
    CHARGE_MS,
    AIMS,
    easeCharge,
    getChargeProgress,
    getTimingCursor,
    getPlayerPos,
    getEnemyPos,
    evaluateTiming,
    resolvePass,
    resolveMatchWinner,
    seeded,
  };
}));
