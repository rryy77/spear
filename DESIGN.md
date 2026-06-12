# Joust Royale — オンライン対戦設計

## ゲームフロー

```
[LOBBY] create_room / join_room（既存マッチング）
    ↓ 2人揃う
[EQUIPMENT] 装備選択 + READY
    ↓ 両者 READY
[COUNTDOWN] 3, 2, 1（サーバーが endsAt を配信）
    ↓
[CHARGE] matchStartTime 配信 → クライアント決定論シミュレーション
    ↓ CHARGE_MS 経過
[RESULT] impactResult → スコア・報酬表示
    ↓ gameOver または RESULT_MS 後
[EQUIPMENT] 次ラウンド / [FINISHED] 再戦
```

## 同期ポリシー（毎フレーム座標は送らない）

| フィールド | 方向 | タイミング |
|-----------|------|-----------|
| `ready` | C↔S | 装備画面でトグル |
| `selectedEquipment` | C→S→全員 | 装備変更時 |
| `matchStartTime` | S→全員 | カウントダウン終了時 |
| `lanceHeight` | C→S→相手 | 120ms 間隔（変化時のみでも可） |
| `lanceActionTiming` | C→S | 「突く」1回のみ |
| `impactResult` | S→全員 | 突撃終了時（権威） |
| `rematchRequest` | C↔S | 試合終了後 |

馬の位置は `getChargeProgress(now, matchStartTime)` と `getHorseScreenX(isHost, progress)` で両クライアントが同一計算。

## WebSocket イベント

### Client → Server

- `create_room`, `join_room`, `leave_room` — 既存
- `set_equipment` `{ selectedEquipment: { horse, lance, armor, shield } }`
- `set_ready` `{ ready: boolean }`
- `update_lance` `{ lanceHeight: 0..1 }`
- `set_lance_timing` `{ lanceActionTiming: 0..1 }`
- `rematch_request` `{ accept: boolean }`

### Server → Client

- `room_created`, `room_joined`, `player_joined` — 既存
- `phase_equipment` — 装備画面へ遷移
- `equipment_update` — 相手の装備/READY 変更
- `match_countdown` `{ endsAt, duration }`
- `match_start` `{ matchStartTime, chargeDuration, round, equipment }`
- `lance_update` `{ role, lanceHeight }`
- `impact_result` `{ impactResult, roundWinner, scores }`
- `match_result` `{ matchWinner, gameOver, rewards, scores, impactResult }`
- `rematch_state` `{ hostRematch, guestRematch }`

## 共有モジュール

- `shared/constants.js` — 時間定数
- `shared/equipment.js` — 装備カタログ
- `shared/sim.js` — 決定論シミュレーション・命中計算（サーバー/クライアント同一）

## クライアント状態機械

`PHASE`: `lobby` → `equipment` → `countdown` → `charge` → `result` → `finished`

ローカルのみ: ジョイスティック補間、描画、カウントダウン表示用の `countdownEndsAt`。
