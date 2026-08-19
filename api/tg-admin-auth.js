// ========================================================================
//  POST /api/tg-admin-auth — вход в мини-приложение склада из Telegram.
//  Body: { initData } — подписанные Telegram данные о том, кто открыл.
//  Пускаем ТОЛЬКО владельца: user.id должен совпасть с ADMIN_CHAT_ID.
//  Любой другой Telegram-аккаунт получает 403 — приложение откроется,
//  но данных склада не увидит. Запрет на сервере, а не спрятанная ссылка.
//  ENV: CLIENT_BOT_TOKEN, ADMIN_CHAT_ID, SITE_JWT_SECRET
// ========================================================================
import { verifyInitData, signAdminJWT } from "./lib/tg.js";

const BOT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const ADMIN_CHAT = process.env.ADMIN_CHAT_ID;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const initData = (body && body.initData) || "";
  if (!initData) return res.status(400).json({ error: "Откройте склад через кнопку в боте" });

  if (!BOT_TOKEN || !ADMIN_CHAT) {
    console.error("tg-admin-auth: не заданы CLIENT_BOT_TOKEN или ADMIN_CHAT_ID");
    return res.status(500).json({ error: "Сервер не настроен" });
  }

  const user = verifyInitData(initData, BOT_TOKEN);
  if (!user) return res.status(403).json({ error: "Подпись Telegram не подошла" });
  if (String(user.id) !== String(ADMIN_CHAT)) {
    return res.status(403).json({ error: "Склад доступен только владельцу" });
  }

  const secret = process.env.SITE_JWT_SECRET || "dev-secret-change-in-production";
  return res.status(200).json({ token: signAdminJWT(secret), name: user.first_name || "" });
}
