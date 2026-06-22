// GET /api/client/verify-status?token=TOKEN — проверить статус Telegram-верификации
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const token = String(req.query?.token || "").trim();
  if (!token) return res.status(400).json({ error: "Token required" });

  try {
    const rows = await sget(`site_verifications?token=eq.${encodeURIComponent(token)}&select=verified,expires_at,chat_id`);
    const v = rows[0];
    if (!v) return res.status(404).json({ error: "Токен не найден" });
    if (new Date(v.expires_at) < new Date()) return res.status(410).json({ error: "Токен истёк" });
    return res.status(200).json({ verified: v.verified === true, chat_id: v.chat_id || null });
  } catch (e) {
    console.error("verify-status error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
