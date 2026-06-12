// Vercel: フロントエンド用 — WebSocket サーバー URL を環境変数から返す
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const wsUrl = (process.env.WS_URL || '').replace(/\/$/, '');
  res.status(200).json({ wsUrl });
};
