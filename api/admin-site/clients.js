// GET /api/admin-site/clients — список клиентов с долгом (только для сайт-админа)
import { getSiteAdmin } from "../lib/siteadmin.js";
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  try {
    const accounts = await sget("site_accounts?select=id,phone,customer_id,tg_verified,created_at,last_login&order=created_at.desc");
    const custIds = [...new Set(accounts.map(a => a.customer_id).filter(Boolean))];

    let custMap = {};
    let debtMap = {};
    let orderCountMap = {};

    if (custIds.length) {
      const [custs, allSales, allPayments] = await Promise.all([
        sget(`customers?id=in.(${custIds.join(",")})&select=id,name,contact`),
        sget(`sales?customer_id=in.(${custIds.join(",")})&status=in.(order,pending_confirm,confirmed,final)&select=id,customer_id,status,source,date,created_at`),
        sget(`payments?customer_id=in.(${custIds.join(",")})&select=customer_id,amount,currency`),
      ]);
      custs.forEach(c => (custMap[c.id] = { name: c.name, contact: c.contact }));

      // считаем долг: финальные продажи - оплаты
      const finalSalesWithItems = await sget(
        `sales?customer_id=in.(${custIds.join(",")})&status=eq.final&select=customer_id,items,currency`
      );

      custIds.forEach(cid => {
        const sales = finalSalesWithItems.filter(s => s.customer_id === cid);
        const payments = allPayments.filter(p => p.customer_id === cid);
        const debt = { som: 0, usd: 0, yuan: 0 };
        sales.forEach(s => {
          (s.items || []).forEach(it => {
            const cur = it.currency || s.currency || "som";
            if (debt[cur] !== undefined) debt[cur] += (it.qty || 0) * (it.unit_price || 0);
          });
        });
        payments.forEach(p => {
          const cur = p.currency || "som";
          if (debt[cur] !== undefined) debt[cur] -= Number(p.amount) || 0;
        });
        debtMap[cid] = debt;
        orderCountMap[cid] = allSales.filter(s => s.customer_id === cid).length;
      });
    }

    const clients = accounts.map(a => ({
      id: a.id,
      phone: a.phone,
      customer_id: a.customer_id,
      name: a.customer_id ? (custMap[a.customer_id]?.name || a.phone) : a.phone,
      tg_verified: a.tg_verified,
      created_at: a.created_at,
      last_login: a.last_login,
      debt: a.customer_id ? (debtMap[a.customer_id] || { som: 0, usd: 0, yuan: 0 }) : null,
      orders_count: a.customer_id ? (orderCountMap[a.customer_id] || 0) : 0,
    }));

    return res.status(200).json({ clients });
  } catch (e) {
    console.error("admin-site/clients error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
