// GET /api/admin/bot-contacts — список тех, кто делился номером с ботом
// (для ручной привязки клиента к его Telegram, если авто-match не сработал). Гард: admin-токен.
import { getUser } from "../lib/auth.js";
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  try {
    const rows = await sget("bot_sessions?phone=not.is.null&select=chat_id,phone,tg_name,tg_username,updated_at&order=updated_at.desc&limit=200");
    return res.status(200).json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    return res.status(200).json([]); // колонок ещё нет / пусто — отдаём пустой список
  }
}
