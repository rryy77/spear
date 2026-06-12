/** 馬上槍試合（Joust）— 共有定数 */
(function (global) {
  const JOUST_CONSTANTS = {
    ROUNDS: 3,
    COUNTDOWN_MS: 2500,
    CHARGE_MS: 5500,
    PASS_RESULT_MS: 3500,
    MATCH_RESULT_MS: 5000,
    CURSOR_PERIOD_MS: 850,
    TIMING_PERFECT: 0.08,
    TIMING_GOOD: 0.16,
    TIMING_GRAZE: 0.28,
    POINTS_HELMET: 3,
    POINTS_SHIELD: 2,
    POINTS_TORSO: 1,
    POINTS_LANCE_BREAK: 1,
    POINTS_FOUL: -3,
    KNOCKDOWN_CHANCE: 0.28,
    LANCE_BREAK_CHANCE: 0.32,
  };

  if (typeof module !== 'undefined') module.exports = JOUST_CONSTANTS;
  else global.JOUST_CONSTANTS = JOUST_CONSTANTS;
}(typeof globalThis !== 'undefined' ? globalThis : this));
