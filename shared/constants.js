/** 馬上槍試合 — 共有定数 */
(function (global) {
  const JOUST_CONSTANTS = {
    COUNTDOWN_MS: 3000,
    CHARGE_MS: 6500,
    RESULT_MS: 4000,
    CURSOR_PERIOD_MS: 900,
    PERFECT_RADIUS: 0.08,
    GOOD_RADIUS: 0.16,
    GRAZE_RADIUS: 0.28,
  };

  if (typeof module !== 'undefined') module.exports = JOUST_CONSTANTS;
  else global.JOUST_CONSTANTS = JOUST_CONSTANTS;
}(typeof globalThis !== 'undefined' ? globalThis : this));
