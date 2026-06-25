// GET /api/admin-site/report?period=month|year|all — два отчёта по происхождению клиентов
import { getSiteAdmin } from "../lib/siteadmin.js";
import { sget } from "../lib/supa.js";

const CURS = ["som", "usd", "yuan"];

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  const period = (req.query?.period || "all").toLowerCase();
  const now = new Date();
  let start = null;
  if (period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (period === "year") start = new Date(now.getFullYear(), 0, 1);
  const inPeriod = (d) => !start || (d && new Date(d) >= start);

  try {
    // аккаунты сайта + их происхождение (с фолбэком)
    let accounts;
    try { accounts = await sget("site_accounts?select=id,customer_id,origin,created_at"); }
    catch { accounts = await sget("site_accounts?select=id,customer_id,created_at"); }

    const [customers, products, settingsRows] = await Promise.all([
      sget("customers?select=id,name,opening_debt,created_at"),
      sget("products?select=id,name"),
      sget("settings?select=*&limit=1"),
    ]);
    const cname = Object.fromEntries(customers.map(c => [c.id, c.name]));
    const oddMap = Object.fromEntries(customers.map(c => [c.id, c.opening_debt || {}]));
    const ccreated = Object.fromEntries(customers.map(c => [c.id, c.created_at || null]));
    const pname = Object.fromEntries(products.map(p => [p.id, p.name]));
    const settings = settingsRows[0] || {};
    const rate = { usd: 1, yuan: Number(settings.rate_yuan_usd) || 0.14, som: Number(settings.rate_som_usd) || 0.000079 };
    const pct = settings.profit_pct || {};
    const toUSD = (v, c) => (Number(v) || 0) * (rate[c] || 0);

    // origin по каждому customer_id (с инференсом для старых)
    const originOf = {};
    accounts.forEach(a => { if (a.customer_id) originOf[a.customer_id] = a.origin || originOf[a.customer_id] || null; });

    const groupCustIds = { site: new Set(), warehouse: new Set() };
    accounts.forEach(a => {
      if (!a.customer_id) { groupCustIds.site.add(`acc:${a.id}`); return; }
      let g = a.origin;
      if (!g) {
        const od = oddMap[a.customer_id] || {};
        const hadOpening = CURS.some(k => (Number(od[k]) || 0) > 0);
        const cc = ccreated[a.customer_id];
        const acct = a.created_at ? new Date(a.created_at).getTime() : null;
        const custBefore = cc && acct && new Date(cc).getTime() < acct - 3600 * 1000;
        g = (hadOpening || custBefore) ? "warehouse" : "site";
      }
      (groupCustIds[g] || groupCustIds.site).add(a.customer_id);
    });

    const allCustIds = [...new Set(accounts.map(a => a.customer_id).filter(Boolean))];
    let sales = [], payments = [];
    if (allCustIds.length) {
      [sales, payments] = await Promise.all([
        sget(`sales?customer_id=in.(${allCustIds.join(",")})&status=in.(order,pending_confirm,confirmed,final)&select=customer_id,date,currency,items`),
        sget(`payments?customer_id=in.(${allCustIds.join(",")})&select=customer_id,amount,currency,date`),
      ]);
    }

    function buildGroup(custSet) {
      const turnover = { som: 0, usd: 0, yuan: 0 };
      const pay = { som: 0, usd: 0, yuan: 0 };
      const prodQty = {};                  // product_id → qty
      const prodClient = {};               // product_id → { customer_id → qty }

      sales.forEach(s => {
        if (!custSet.has(s.customer_id) || !inPeriod(s.date)) return;
        (s.items || []).forEach(it => {
          const cur = it.currency || s.currency || "som";
          const sum = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
          if (turnover[cur] !== undefined) turnover[cur] += sum;
          const q = Number(it.qty) || 0;
          prodQty[it.product_id] = (prodQty[it.product_id] || 0) + q;
          (prodClient[it.product_id] = prodClient[it.product_id] || {})[s.customer_id] = (prodClient[it.product_id]?.[s.customer_id] || 0) + q;
        });
      });
      payments.forEach(p => {
        if (!custSet.has(p.customer_id) || !inPeriod(p.date)) return;
        const cur = p.currency || "som"; if (pay[cur] !== undefined) pay[cur] += Number(p.amount) || 0;
      });

      const turnover_usd = CURS.reduce((t, c) => t + toUSD(turnover[c], c), 0);
      const payments_usd = CURS.reduce((t, c) => t + toUSD(pay[c], c), 0);
      const profit_usd = CURS.reduce((t, c) => t + toUSD(turnover[c] * (Number(pct[c]) || 0) / 100, c), 0);

      const top_products = Object.entries(prodQty)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([pid, qty]) => {
          const byClient = prodClient[pid] || {};
          const top = Object.entries(byClient).sort((a, b) => b[1] - a[1])[0];
          return { product: pname[pid] || "?", qty, top_client: top ? { name: cname[top[0]] || "—", qty: top[1] } : null };
        });

      return {
        clients_count: [...custSet].filter(x => !String(x).startsWith("acc:")).length || custSet.size,
        turnover, turnover_usd: Math.round(turnover_usd),
        payments: pay, payments_usd: Math.round(payments_usd),
        profit_usd: Math.round(profit_usd),
        top_products,
      };
    }

    return res.status(200).json({
      period,
      profit_pct: pct,
      site: buildGroup(groupCustIds.site),
      warehouse: buildGroup(groupCustIds.warehouse),
    });
  } catch (e) {
    console.error("report error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
