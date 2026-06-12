/**
 * 決定論シミュレーション — 槍の高さのみで判定
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

  /** 自分=左へ突進、相手=右から突進 */
  function getMyScreenX(progress) {
    const t = easeCharge(progress);
    return 0.12 + (0.44 - 0.12) * t;
  }

  function getOppScreenX(progress) {
    const t = easeCharge(progress);
    return 0.88 - (0.88 - 0.56) * t;
  }

  function getLanceTier(height) {
    const h = Math.max(0, Math.min(1, height));
    if (h >= C.PERFECT_MIN && h <= C.PERFECT_MAX) return 'PERFECT';
    if (h >= C.GOOD_MIN && h <= C.GOOD_MAX) return 'GOOD';
    return 'MISS';
  }

  function tierScore(tier) {
    if (tier === 'PERFECT') return 3;
    if (tier === 'GOOD') return 2;
    return 0;
  }

  function resolveBout(host, guest) {
    const hostTier = getLanceTier(host.lanceHeight);
    const guestTier = getLanceTier(guest.lanceHeight);
    const hostScore = tierScore(hostTier);
    const guestScore = tierScore(guestTier);

    let winner = null;
    if (hostScore > guestScore) winner = 'host';
    else if (guestScore > hostScore) winner = 'guest';

    return {
      hostTier,
      guestTier,
      hostLanceHeight: host.lanceHeight,
      guestLanceHeight: guest.lanceHeight,
      winner,
      hostUnhorsed: guestTier === 'PERFECT',
      guestUnhorsed: hostTier === 'PERFECT',
    };
  }

  return {
    CHARGE_MS,
    easeCharge,
    getChargeProgress,
    getMyScreenX,
    getOppScreenX,
    getLanceTier,
    resolveBout,
  };
}));
