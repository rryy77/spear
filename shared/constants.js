/** Joust Royale — 共有定数（サーバー・クライアント同一） */
(function (global) {
  const JOUST_CONSTANTS = {
    COUNTDOWN_MS: 3000,
    CHARGE_MS: 4000,
    RESULT_MS: 5000,
    ROUNDS_TO_WIN: 3,
    LANCE_HEIGHT_MIN: 0,
    LANCE_HEIGHT_MAX: 1,
    TIMING_PERFECT: 0.88,
    TIMING_GOOD: 0.72,
  };

  if (typeof module !== 'undefined') module.exports = JOUST_CONSTANTS;
  else global.JOUST_CONSTANTS = JOUST_CONSTANTS;
}(typeof globalThis !== 'undefined' ? globalThis : this));
