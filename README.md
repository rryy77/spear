# Joust Royale — オンライン1vs1 馬上槍

スマホ横画面向け 2.5D Web ゲーム。ルームコードで友達と対戦できます。

詳細設計は [DESIGN.md](./DESIGN.md) を参照。

## マルチプレイの流れ

1. **ルーム作成** — 片方がルームを作成（コード発行）
2. **ルーム参加** — もう一方がコードで参加
3. **装備選択** — 馬・槍・鎧・盾を選び **READY**
4. **カウントダウン** — 3, 2, 1 の後、同期された `matchStartTime` で突撃開始
5. **操作** — 左スティックで槍の高さ、「突く」でタイミング入力
6. **結果** — スコア・報酬表示、再戦または次ラウンド

## 同期方針

座標は毎フレーム送りません。馬の位置は `matchStartTime` から両クライアントが同じ式で再現します。  
サーバーと同期するのは `ready` / `selectedEquipment` / `matchStartTime` / `lanceHeight` / `lanceActionTiming` / `impactResult` / `rematchRequest` のみです。

## 起動方法（ローカル）

```bash
npm install
npm start
```

ブラウザで `http://localhost:3000` を開きます。

**2人で遊ぶ場合:** 別々の端末（スマホ2台など）から同じサーバーURLにアクセスしてください。同一Wi-Fi内なら `http://<PCのIP>:3000` を使えます。

## Vercel へのデプロイ（重要）

Vercel は **WebSocket の常時接続に対応していません**。  
`wss://...vercel.app` へ接続すると HTTP 200 が返り、次のエラーになります:

```
WebSocket handshake: Unexpected response code: 200
```

そのため **フロント（Vercel）とゲームサーバー（Render 等）を分けて** デプロイします。

### 手順

1. **ゲームサーバーを Render にデプロイ**
   - [Render](https://render.com) で New → Blueprint または Web Service
   - リポジトリ `spear` を接続
   - `render.yaml` が自動適用されます（または Start Command: `npm start`）
   - デプロイ後の URL を控える（例: `https://spear-api.onrender.com`）

2. **Vercel にフロントをデプロイ**
   - Application Preset: **Other**
   - Build Command: 空欄
   - Output Directory: 空欄

3. **Vercel の環境変数を設定**
   - Settings → Environment Variables
   - `WS_URL` = `wss://spear-api.onrender.com`（Render の URL。`https` を `wss` に変える）
   - 再デプロイする

4. ブラウザで `https://spear-beta.vercel.app` を開き、「接続済み」と表示されれば成功

### 構成イメージ

```
スマホ/PC  →  Vercel（HTML/CSS/JS）
                ↓ WS_URL
             Render（server.js + WebSocket）
```

## ファイル構成

| ファイル | 内容 |
|---------|------|
| `server.js` | WebSocketサーバー・ルーム管理・戦闘判定 |
| `client.js` | ロビーUI・FPS描画・入力 |
| `index.html` | 画面構成 |
| `style.css` | スタイル |
