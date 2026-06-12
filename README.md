# ROCK YOU! — 馬上槍試合（オンライン対戦）

映画『ROCK YOU!』をモチーフにした、14世紀ヨーロッパの馬上槍試合マルチプレイゲームです。

## マルチプレイの流れ

1. **ルーム作成** — どちらか一方が「ルームを作成」を押す
2. **ルーム参加** — 表示されたルームコードを、もう一方が「ルームに参加」から入力
3. **ゲームスタート** — ルーム作成者だけが「ゲームスタート」ボタンを押せる

## 遊び方

- **◀ ▶** — 左右移動（被弾時のダメージ軽減に有効）
- **▲ ▼** — 槍の高さ調整（頭・胴体・足を狙う）
- 位置合わせのカウントダウン後、自動で突撃・判定

### 鎧とダメージ

各プレイヤーは **頭・胴体・足** にそれぞれ耐久100を持ちます。

| 命中精度 | ダメージ |
|---------|---------|
| 防具に直撃 | 100 |
| かすり | 50 |
| ほぼ外れ | 33 |
| 外れ | 0 |

左右の位置合わせで相手の槍をかわすと、受けるダメージが軽減されます。

### 画面

- **FPS視点** — 自分の手と槍が見える一人称視点
- **血の演出** — 被弾すると画面端からじわじわ血が広がる

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
