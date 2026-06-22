// POST /api/admin-site/delete-client { account_id } — удалить клиента + заблокировать телефон
import { getSiteAdmin } from "../lib/siteadmin.js";
import { sget, supsert } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { account_id } = body || {};
  if (!account_id) return res.status(400).json({ error: "account_id required" });

  try {
    const rows = await sget(`site_accounts?id=eq.${encodeURIComponent(account_id)}&select=id,phone`);
    const acc = rows[0];
    if (!acc) return res.status(404).json({ error: "Аккаунт не найден" });

    await supsert("blocked_phones", {
      phone: acc.phone,
      reason: "Удалён администратором",
      blocked_at: new Date().toISOString(),
      blocked_by: "admin-site",
    });

    const SUPA = process.env.SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_KEY;
    await fetch(`${SUPA}/rest/v1/site_accounts?id=eq.${encodeURIComponent(account_id)}`, {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY },
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("admin-site/delete-client error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
