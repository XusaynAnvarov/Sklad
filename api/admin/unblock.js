// DELETE /api/admin/unblock — снять блокировку телефона
// Body: { phone }
import { getUser } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const phone = String(body?.phone || "").replace(/\D/g, "").slice(-9);
  if (phone.length < 7) return res.status(400).json({ error: "phone обязателен" });

  try {
    const SUPA = process.env.SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_KEY;
    await fetch(SUPA + `/rest/v1/blocked_phones?phone=eq.${encodeURIComponent(phone)}`, {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY },
    });
    return res.status(200).json({ ok: true, unblocked: phone });
  } catch (e) {
    console.error("admin/unblock error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
