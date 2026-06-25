// GET /api/admin-site/client-detail?account_id=… — полная карточка клиента (для админа)
import { getSiteAdmin } from "../lib/siteadmin.js";
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  const accId = req.query?.account_id;
  if (!accId) return res.status(400).json({ error: "account_id required" });

  try {
    const accs = await sget(`site_accounts?id=eq.${encodeURIComponent(accId)}&select=id,phone,customer_id,tg_username,tg_nick,created_at,last_login`);
    const acc = accs[0];
    if (!acc) return res.status(404).json({ error: "Клиент не найден" });

    const cid = acc.customer_id;
    if (!cid) {
      return res.status(200).json({ account: acc, customer: null, debt: { som: 0, usd: 0, yuan: 0 }, invoices: [], payments: [], top_products: [] });
    }

    const [custs, sales, payments, products] = await Promise.all([
      sget(`customers?id=eq.${cid}&select=id,name,contact,opening_debt`),
      sget(`sales?customer_id=eq.${cid}&select=id,date,status,source,currency,items&order=date.desc`),
      sget(`payments?customer_id=eq.${cid}&select=amount,currency,date,note&order=date.desc`),
      sget("products?select=id,name"),
    ]);
    const customer = custs[0] || null;
    const pname = Object.fromEntries(products.map(p => [p.id, p.name]));

    // долг = финальные накладные + старый долг − оплаты
    const debt = { som: 0, usd: 0, yuan: 0 };
    sales.filter(s => s.status === "final").forEach(s => (s.items || []).forEach(it => {
      const cur = it.currency || s.currency || "som"; if (debt[cur] !== undefined) debt[cur] += (it.qty || 0) * (it.unit_price || 0);
    }));
    const od = customer?.opening_debt || {};
    ["som", "usd", "yuan"].forEach(k => debt[k] += Number(od[k]) || 0);
    payments.forEach(p => { const cur = p.currency || "som"; if (debt[cur] !== undefined) debt[cur] -= Number(p.amount) || 0; });

    // накладные (сводка)
    const invoices = sales.map(s => {
      const totals = {};
      (s.items || []).forEach(it => { const c = it.currency || s.currency || "som"; totals[c] = (totals[c] || 0) + (it.qty || 0) * (it.unit_price || 0); });
      return { id: s.id, date: s.date, status: s.status, source: s.source || null, items_count: (s.items || []).length, totals };
    });

    // топ заказанных товаров (по количеству)
    const agg = {};
    sales.forEach(s => (s.items || []).forEach(it => {
      const a = agg[it.product_id] = agg[it.product_id] || { product_id: it.product_id, name: pname[it.product_id] || "?", qty: 0, last_price: 0, currency: it.currency || s.currency, date: null };
      a.qty += Number(it.qty) || 0;
      if (!a.date || new Date(s.date) >= new Date(a.date)) { a.date = s.date; a.last_price = it.unit_price; a.currency = it.currency || s.currency; }
    }));
    const top_products = Object.values(agg).sort((a, b) => b.qty - a.qty).slice(0, 20);

    return res.status(200).json({ account: acc, customer, debt, invoices, payments, top_products });
  } catch (e) {
    console.error("client-detail error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
