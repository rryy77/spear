/**
 * 決定論シミュレーション — Node / ブラウザ共通
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const C = require('./constants');
    const E = require('./equipment');
    module.exports = factory(C, E);
  } else {
    root.JoustSim = factory(root.JOUST_CONSTANTS, root.JoustEquipment);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C, E) {
  const CHARGE_MS = C.CHARGE_MS;

  function easeCharge(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }

  function getChargeProgress(nowMs, matchStartTime) {
    return Math.max(0, Math.min(1, (nowMs - matchStartTime) / CHARGE_MS));
  }

  function getHorseScreenX(isHost, progress) {
    const t = easeCharge(progress);
    if (isHost) return 0.12 + (0.44 - 0.12) * t;
    return 0.88 - (0.88 - 0.56) * t;
  }

  function heightToZone(h) {
    if (h < 0.34) return 'head';
    if (h < 0.67) return 'torso';
    return 'legs';
  }

  function timingTier(timing) {
    if (timing >= C.TIMING_PERFECT) return 'perfect';
    if (timing >= C.TIMING_GOOD) return 'good';
    if (timing >= 0.5) return 'fair';
    return 'poor';
  }

  function baseDamage(tier) {
    if (tier === 'perfect') return 100;
    if (tier === 'good') return 50;
    if (tier === 'fair') return 33;
    return 0;
  }

  function heightMatch(attackerH, defenderH) {
    return 1 - Math.min(1, Math.abs(attackerH - defenderH) / 0.35);
  }

  function getEquipItem(category, id) {
    return E.getEquipItem(category, id);
  }

  function resolveOneHit(attacker, defender) {
    const lance = getEquipItem('lances', attacker.equipment?.lance);
    const armor = getEquipItem('armors', defender.equipment?.armor);
    const shield = getEquipItem('shields', defender.equipment?.shield);
    const tier = timingTier(attacker.lanceActionTiming ?? 0);
    let damage = baseDamage(tier);
    if (damage === 0) {
      return { damage: 0, zone: heightToZone(attacker.lanceHeight), tier };
    }
    const align = heightMatch(attacker.lanceHeight, defender.lanceHeight);
    damage = Math.round(damage * align * lance.damage);
    const block = (2 - shield.block) * armor.reduction;
    damage = Math.round(damage * block);
    damage = Math.max(0, Math.min(100, damage));
    return { damage, zone: heightToZone(attacker.lanceHeight), tier, align };
  }

  function resolveImpact(host, guest) {
    return {
      hostHit: resolveOneHit(
        { lanceHeight: host.lanceHeight, lanceActionTiming: host.lanceActionTiming, equipment: host.equipment },
        { lanceHeight: guest.lanceHeight, equipment: guest.equipment }
      ),
      guestHit: resolveOneHit(
        { lanceHeight: guest.lanceHeight, lanceActionTiming: guest.lanceActionTiming, equipment: guest.equipment },
        { lanceHeight: host.lanceHeight, equipment: host.equipment }
      ),
    };
  }

  function calcRewards(winner, round) {
    const base = 50 + round * 20;
    return winner ? { gold: base, fame: base + 10 } : { gold: 15, fame: 5 };
  }

  return {
    CHARGE_MS,
    easeCharge,
    getChargeProgress,
    getHorseScreenX,
    resolveImpact,
    calcRewards,
    heightToZone,
  };
}));
