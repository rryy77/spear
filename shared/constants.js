/** 馬上槍試合 — 共有定数 */
(function (global) {
  const JOUST_CONSTANTS = {
    COUNTDOWN_MS: 3000,
    CHARGE_MS: 5000,
    RESULT_MS: 3500,
    PERFECT_MIN: 0.42,
    PERFECT_MAX: 0.58,
    GOOD_MIN: 0.28,
    GOOD_MAX: 0.72,
  };

  if (typeof module !== 'undefined') module.exports = JOUST_CONSTANTS;
  else global.JOUST_CONSTANTS = JOUST_CONSTANTS;
}(typeof globalThis !== 'undefined' ? globalThis : this));
