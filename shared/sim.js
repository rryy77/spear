/**
 * 決定論シミュレーション — タイミングバー・騎士移動
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./constants'));
  } else {
    root.JoustSim = factory(root.JOUST_CONSTANTS);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  const CHARGE_MS = C.CHARGE_MS;

  function easeCharge(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }

  function getChargeProgress(nowMs, matchStartTime) {
    return Math.max(0, Math.min(1, (nowMs - matchStartTime) / CHARGE_MS));
  }

  /** タイミングバー上のカーソル位置 0〜1（両クライアント同一） */
  function getTimingCursor(nowMs, matchStartTime) {
    const elapsed = nowMs - matchStartTime;
    const wave = Math.sin((elapsed / C.CURSOR_PERIOD_MS) * Math.PI * 2);
    return 0.5 + 0.42 * wave;
  }

  /** 縦画面2.5D: プレイヤー左レーン（下→中央奥） */
  function getPlayerPos(progress) {
    const t = easeCharge(progress);
    return { x: 0.28, y: 0.88 - t * 0.42, scale: 0.85 + t * 0.35 };
  }

  /** 敵右レーン（上→中央手前） */
  function getEnemyPos(progress) {
    const t = easeCharge(progress);
    return { x: 0.72, y: 0.12 + t * 0.42, scale: 0.55 + t * 0.35 };
  }

  function evaluateTap(tapTiming) {
    if (tapTiming == null || typeof tapTiming !== 'number') {
      return { tier: 'MISS', score: 0 };
    }
    const pos = Math.max(0, Math.min(1, tapTiming));
    const dist = Math.abs(pos - 0.5);
    if (dist <= C.PERFECT_RADIUS) return { tier: 'PERFECT', score: 4 };
    if (dist <= C.GOOD_RADIUS) return { tier: 'GOOD', score: 3 };
    if (dist <= C.GRAZE_RADIUS) {
      return { tier: pos < 0.5 ? 'EARLY' : 'LATE', score: 1 };
    }
    return { tier: 'MISS', score: 0 };
  }

  function resolveBattle(host, guest) {
    const hostResult = evaluateTap(host.tapTiming);
    const guestResult = evaluateTap(guest.tapTiming);
    let winner = null;
    if (hostResult.score > guestResult.score) winner = 'host';
    else if (guestResult.score > hostResult.score) winner = 'guest';

    return {
      timingResult: {
        host: { tier: hostResult.tier, tapTiming: host.tapTiming },
        guest: { tier: guestResult.tier, tapTiming: guest.tapTiming },
      },
      battleResult: { winner, hostScore: hostResult.score, guestScore: guestResult.score },
    };
  }

  return {
    CHARGE_MS,
    easeCharge,
    getChargeProgress,
    getTimingCursor,
    getPlayerPos,
    getEnemyPos,
    evaluateTap,
    resolveBattle,
  };
}));
