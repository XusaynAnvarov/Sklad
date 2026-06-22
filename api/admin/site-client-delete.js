// DELETE /api/admin/site-client-delete — удалить аккаунт сайта + заблокировать номер
// Body: { id } — id из site_accounts
import { getUser } from "../lib/auth.js";
import { sget, supsert } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const id = String(body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "id обязателен" });

  try {
    const accounts = await sget(`site_accounts?id=eq.${encodeURIComponent(id)}&select=id,phone`);
    const acc = accounts[0];
    if (!acc) return res.status(404).json({ error: "Аккаунт не найден" });

    // Блокируем телефон
    await supsert("blocked_phones", {
      phone: acc.phone,
      reason: "admin_delete",
      blocked_at: new Date().toISOString(),
      blocked_by: user.email || "admin",
    });

    // Удаляем аккаунт сайта
    const SUPA = process.env.SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_KEY;
    await fetch(SUPA + `/rest/v1/site_accounts?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY },
    });

    return res.status(200).json({ ok: true, blocked_phone: acc.phone });
  } catch (e) {
    console.error("admin/site-client-delete error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
