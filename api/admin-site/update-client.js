// POST /api/admin-site/update-client — изменить ярлык (tg_nick) и/или имя клиента
// Body: { account_id, tg_nick?, name? }  (ярлык виден только владельцу)
import { getSiteAdmin } from "../lib/siteadmin.js";
import { sget, spatch } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { account_id, tg_nick, name } = body || {};
  if (!account_id) return res.status(400).json({ error: "account_id required" });

  try {
    const accs = await sget(`site_accounts?id=eq.${encodeURIComponent(account_id)}&select=id,customer_id`);
    const acc = accs[0];
    if (!acc) return res.status(404).json({ error: "Клиент не найден" });

    if (tg_nick !== undefined) {
      try { await spatch(`site_accounts?id=eq.${encodeURIComponent(account_id)}`, { tg_nick: tg_nick || null }); }
      catch (e) { return res.status(500).json({ error: "Колонка tg_nick не создана — запустите db/site-extend.sql" }); }
    }
    if (name !== undefined && acc.customer_id) {
      await spatch(`customers?id=eq.${acc.customer_id}`, { name: String(name).trim() || null });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("update-client error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
