// ========================================================================
//  ИСТОРИЯ ИЗМЕНЕНИЙ ОСТАТКОВ — для «Проверки склада».
//
//  GET /api/admin/stock-log?дней=30            — за последние N дней
//  GET /api/admin/stock-log?с=2026-09-01&по=2026-09-27  — за свой период
//  GET /api/admin/stock-log?товар=<id>         — по одному товару
//
//  Отдаёт { ведётся, записей, изменения: [...], товары: {...} }.
//  «ведётся: false» — значит db/stock-log-migration.sql ещё не выполнен,
//  и история начнётся только после него: старых изменений взять неоткуда.
// ========================================================================
import { getUser } from "../lib/auth.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const заголовки = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };
const дата = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : "");

export default async function handler(req, res) {
  const user = await getUser(req, { allowGuest: true });
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const q = req.query || {};
  const дней = Math.min(3650, Math.max(0, Number(q["дней"]) || 0));
  const с = дата(q["с"]), по = дата(q["по"]);
  const товар = /^[\w-]{1,64}$/.test(String(q["товар"] || "")) ? String(q["товар"]) : "";
  const сколько = Math.min(2000, Math.max(1, Number(q["сколько"]) || 500));

  const условия = ["select=*", "order=created_at.desc", `limit=${сколько}`];
  if (дней) условия.push(`created_at=gte.${new Date(Date.now() - дней * 864e5).toISOString()}`);
  if (с) условия.push(`created_at=gte.${с}T00:00:00Z`);
  if (по) условия.push(`created_at=lte.${по}T23:59:59Z`);
  if (товар) условия.push(`product_id=eq.${encodeURIComponent(товар)}`);

  try {
    const r = await fetch(`${SB_URL}/rest/v1/stock_log?${условия.join("&")}`, { headers: заголовки });
    const текст = await r.text();
    if (!r.ok) {
      // таблицы ещё нет — это не ошибка, просто история не ведётся
      if (/stock_log/.test(текст) && /(does not exist|schema cache|PGRST205)/.test(текст)) {
        return res.json({ ведётся: false, записей: 0, изменения: [], подсказка: "Выполните db/stock-log-migration.sql в Supabase — с этого момента история будет записываться." });
      }
      return res.status(500).json({ error: текст.slice(0, 300) });
    }
    const изменения = JSON.parse(текст);
    return res.json({ ведётся: true, записей: изменения.length, изменения });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
