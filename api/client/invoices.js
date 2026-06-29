// GET /api/client/invoices — накладные клиента (status=final)
import { getClient } from "../lib/clientauth.js";
import { sget } from "../lib/supa.js";
import { invoiceCoverageStatus } from "../lib/debt.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = getClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id) return res.status(200).json({ invoices: [] });

  try {
    const [sales, payments, cust] = await Promise.all([
      sget(`sales?customer_id=eq.${client.customer_id}&status=eq.final&select=id,date,currency,items&order=date.desc`),
      sget(`payments?customer_id=eq.${client.customer_id}&select=amount,currency`),
      sget(`customers?id=eq.${client.customer_id}&select=opening_debt`),
    ]);
    const openDebt = cust[0]?.opening_debt;

    // Имена товаров
    const prodIds = [...new Set(sales.flatMap(s => (s.items || []).map(i => i.product_id).filter(Boolean)))];
    let prodMap = {};
    if (prodIds.length) {
      const prods = await sget(`products?id=in.(${prodIds.join(",")})&select=id,name`);
      prods.forEach(p => (prodMap[p.id] = p.name));
    }

    const invoices = sales.map(s => {
      const status = invoiceCoverageStatus(s.id, sales, payments, openDebt);
      const total = (s.items || []).reduce((acc, it) => acc + it.qty * it.unit_price, 0);
      return {
        id: s.id,
        date: s.date,
        currency: s.currency,
        total,
        status, // paid | partial | debt
        items: (s.items || []).map(it => ({
          product_name: prodMap[it.product_id] || "—",
          qty: it.qty,
          unit_price: it.unit_price,
          currency: it.currency || s.currency,
        })),
      };
    });
    return res.status(200).json({ invoices });
  } catch (e) {
    console.error("client/invoices error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
