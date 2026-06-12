# 馬上槍試合（Joust）設計

## 基本ルール

- 中央の **ティルト**（木製柵）を挟み、3回突進
- 合計得点が高い方が勝利
- **落馬**（兜PERFECT等）で即勝利
- **馬命中**は反則（-3点、失格の可能性）

## 得点

| 命中 | 点 |
|------|-----|
| 兜 | 3 |
| 盾 | 2 |
| 胴 | 1 |
| 槍破壊ボーナス | +1 |
| 空振り | 0 |
| 馬（反則） | -3 |

## 操作

1. **HIGH / MID / LOW** で狙い
2. タイミングバー **PERFECT** で **LANCE!**

## 同期フィールド

`ready` / `roundNumber` / `selectedAimHeight` / `lanceTiming` / `timingResult` / `hitResult` / `score` / `knockdown` / `foul` / `matchResult` / `rematchRequest`

騎士走行は `matchStartTime` から決定論再生。
