// GET /api/admin-site/clients — список клиентов сайта с долгом, ником, происхождением
import { getSiteAdmin } from "../lib/siteadmin.js";
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  try {
    // новые колонки (origin/tg_username/tg_nick) — с фолбэком, если их ещё нет
    let accounts;
    try {
      accounts = await sget("site_accounts?select=id,phone,customer_id,tg_verified,created_at,last_login,origin,tg_username,tg_nick&order=created_at.desc");
    } catch {
      accounts = await sget("site_accounts?select=id,phone,customer_id,tg_verified,created_at,last_login&order=created_at.desc");
    }
    const custIds = [...new Set(accounts.map(a => a.customer_id).filter(Boolean))];

    let custMap = {}, debtMap = {}, orderCountMap = {}, lastPayMap = {}, firstSaleMap = {};

    if (custIds.length) {
      const [custs, allSales, allPayments, finalSalesWithItems] = await Promise.all([
        sget(`customers?id=in.(${custIds.join(",")})&select=id,name,contact,opening_debt,created_at`),
        sget(`sales?customer_id=in.(${custIds.join(",")})&status=in.(order,pending_confirm,confirmed,final)&select=id,customer_id,status,date,created_at`),
        sget(`payments?customer_id=in.(${custIds.join(",")})&select=customer_id,amount,currency,date`),
        sget(`sales?customer_id=in.(${custIds.join(",")})&status=eq.final&select=customer_id,items,currency`),
      ]);
      custs.forEach(c => (custMap[c.id] = { name: c.name, contact: c.contact, opening_debt: c.opening_debt, created_at: c.created_at }));

      custIds.forEach(cid => {
        // долг: финальные продажи + старый долг − оплаты
        const debt = { som: 0, usd: 0, yuan: 0 };
        finalSalesWithItems.filter(s => s.customer_id === cid).forEach(s => {
          (s.items || []).forEach(it => {
            const cur = it.currency || s.currency || "som";
            if (debt[cur] !== undefined) debt[cur] += (it.qty || 0) * (it.unit_price || 0);
          });
        });
        const od = custMap[cid]?.opening_debt || {};
        ["som", "usd", "yuan"].forEach(k => debt[k] += Number(od[k]) || 0);
        const pays = allPayments.filter(p => p.customer_id === cid);
        pays.forEach(p => { const cur = p.currency || "som"; if (debt[cur] !== undefined) debt[cur] -= Number(p.amount) || 0; });
        debtMap[cid] = debt;
        orderCountMap[cid] = allSales.filter(s => s.customer_id === cid).length;

        // последняя оплата
        const lp = pays.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        lastPayMap[cid] = lp ? { amount: Number(lp.amount) || 0, currency: lp.currency || "som", date: lp.date } : null;

        // самая ранняя продажа (для определения происхождения у старых аккаунтов)
        const sales = allSales.filter(s => s.customer_id === cid);
        firstSaleMap[cid] = sales.length ? sales.map(s => new Date(s.date || s.created_at)).sort((a, b) => a - b)[0] : null;
      });
    }

    const clients = accounts.map(a => {
      let origin = a.origin || null;
      if (!origin && a.customer_id) {
        const cust = custMap[a.customer_id] || {};
        const od = cust.opening_debt || {};
        const hadOpening = ["som", "usd", "yuan"].some(k => (Number(od[k]) || 0) > 0);
        const firstSale = firstSaleMap[a.customer_id];
        const acct = a.created_at ? new Date(a.created_at).getTime() : null;
        // клиент склада, если: был старый долг, ИЛИ карточка клиента создана до регистрации на сайте,
        // ИЛИ есть продажа раньше регистрации (всё с запасом в 1 час)
        const margin = 3600 * 1000;
        const custBefore = cust.created_at && acct && new Date(cust.created_at).getTime() < acct - margin;
        const saleBefore = firstSale && acct && new Date(firstSale).getTime() < acct - margin;
        origin = (hadOpening || custBefore || saleBefore) ? "warehouse" : "site";
      }
      origin = origin || "site";
      return {
        id: a.id,
        phone: a.phone,
        customer_id: a.customer_id,
        name: a.customer_id ? (custMap[a.customer_id]?.name || a.phone) : a.phone,
        tg_verified: a.tg_verified,
        tg_username: a.tg_username || null,
        tg_nick: a.tg_nick || null,
        origin,
        created_at: a.created_at,
        last_login: a.last_login,
        debt: a.customer_id ? (debtMap[a.customer_id] || { som: 0, usd: 0, yuan: 0 }) : null,
        last_payment: a.customer_id ? (lastPayMap[a.customer_id] || null) : null,
        orders_count: a.customer_id ? (orderCountMap[a.customer_id] || 0) : 0,
      };
    });

    return res.status(200).json({ clients });
  } catch (e) {
    console.error("admin-site/clients error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
