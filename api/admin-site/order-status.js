// POST /api/admin-site/order-status — владелец подтверждает/отклоняет заказ с сайта.
// Body: { sale_id, status }  status ∈ confirmed | order | final  (только getSiteAdmin)
import { getSiteAdmin } from "../lib/siteadmin.js";
import { sget, spatch } from "../lib/supa.js";

const ALLOWED = ["order", "pending_confirm", "confirmed", "final"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const sale_id = body?.sale_id;
  const status = body?.status;
  if (!sale_id || !ALLOWED.includes(status)) return res.status(400).json({ error: "Неверные данные" });

  try {
    const rows = await sget(`sales?id=eq.${encodeURIComponent(sale_id)}&select=id`);
    if (!rows[0]) return res.status(404).json({ error: "Заказ не найден" });
    await spatch(`sales?id=eq.${encodeURIComponent(sale_id)}`, { status });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("order-status error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
