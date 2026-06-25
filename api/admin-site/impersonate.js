// POST /api/admin-site/impersonate — владелец входит как клиент (для теста клиентского опыта)
// Body: { account_id }  (только getSiteAdmin) → выдаёт клиентский JWT этого аккаунта (без пароля/кода).
import { getSiteAdmin } from "../lib/siteadmin.js";
import { signToken, genSessionId } from "../lib/clientauth.js";
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { account_id } = body || {};
  if (!account_id) return res.status(400).json({ error: "account_id required" });

  try {
    const accs = await sget(`site_accounts?id=eq.${encodeURIComponent(account_id)}&select=id,customer_id,phone`);
    const acc = accs[0];
    if (!acc) return res.status(404).json({ error: "Клиент не найден" });

    const token = signToken({ sub: acc.id, customer_id: acc.customer_id, phone: acc.phone, sid: genSessionId() });
    return res.status(200).json({ token, customer_id: acc.customer_id });
  } catch (e) {
    console.error("impersonate error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
