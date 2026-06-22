// GET /api/admin/site-clients — список клиентов сайта (только для админа)
import { getUser } from "../lib/auth.js";
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  try {
    const accounts = await sget("site_accounts?select=id,phone,customer_id,tg_verified,created_at,last_login&order=created_at.desc");
    // тянем имена клиентов
    const custIds = [...new Set(accounts.map(a => a.customer_id).filter(Boolean))];
    let custMap = {};
    if (custIds.length) {
      const custs = await sget(`customers?id=in.(${custIds.join(",")})&select=id,name`);
      custs.forEach(c => (custMap[c.id] = c.name));
    }
    // тянем заблокированные телефоны
    const blocked = await sget("blocked_phones?select=phone,reason,blocked_at");
    const blockedSet = new Set(blocked.map(b => b.phone));

    const clients = accounts.map(a => ({
      id: a.id,
      phone: a.phone,
      customer_id: a.customer_id,
      customer_name: a.customer_id ? (custMap[a.customer_id] || a.phone) : a.phone,
      tg_verified: a.tg_verified,
      created_at: a.created_at,
      last_login: a.last_login,
      blocked: blockedSet.has(a.phone),
    }));

    return res.status(200).json({ clients, blocked: blocked });
  } catch (e) {
    console.error("admin/site-clients error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
