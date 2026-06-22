// GET /api/admin-site/orders?customer_id=... — все заказы с сайта (только для сайт-админа)
import { getSiteAdmin } from "../lib/siteadmin.js";
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  try {
    const cid = req.query?.customer_id;
    let query = `sales?source=eq.site&select=id,customer_id,status,date,created_at,items,currency&order=created_at.desc&limit=200`;
    if (cid) query = `sales?source=eq.site&customer_id=eq.${cid}&select=id,customer_id,status,date,created_at,items,currency&order=created_at.desc`;

    const sales = await sget(query);

    // тянем имена клиентов
    const custIds = [...new Set(sales.map(s => s.customer_id).filter(Boolean))];
    let custMap = {};
    if (custIds.length) {
      const custs = await sget(`customers?id=in.(${custIds.join(",")})&select=id,name,contact`);
      custs.forEach(c => (custMap[c.id] = c.name || c.contact || c.id));
    }

    const orders = sales.map(s => ({
      id: s.id,
      customer_id: s.customer_id,
      customer_name: custMap[s.customer_id] || "—",
      status: s.status,
      date: s.date || s.created_at,
      items: s.items || [],
      items_count: (s.items || []).reduce((n, it) => n + (it.qty || 0), 0),
    }));

    return res.status(200).json({ orders });
  } catch (e) {
    console.error("admin-site/orders error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
