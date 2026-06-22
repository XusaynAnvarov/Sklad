// GET /api/client/me — профиль клиента + долг по валютам
import { getClient } from "../lib/clientauth.js";
import { sget } from "../lib/supa.js";

function debtAndTurnover(sales, payments, customer) {
  const debt = { som: 0, usd: 0, yuan: 0 };
  const turn = { som: 0, usd: 0, yuan: 0 };
  (sales || []).forEach(s =>
    (s.items || []).forEach(it => {
      const c = it.currency || s.currency;
      if (turn[c] === undefined) return;
      turn[c] += it.qty * it.unit_price;
      debt[c] += it.qty * it.unit_price;
    })
  );
  const od = (customer && customer.opening_debt) || {};
  ["som", "usd", "yuan"].forEach(c => (debt[c] += Number(od[c]) || 0));
  (payments || []).forEach(p => { if (debt[p.currency] !== undefined) debt[p.currency] -= Number(p.amount) || 0; });
  const advance = { som: 0, usd: 0, yuan: 0 };
  ["som", "usd", "yuan"].forEach(c => { if (debt[c] < 0) { advance[c] = -debt[c]; debt[c] = 0; } });
  return { debt, turn, advance };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = getClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });

  try {
    if (!client.customer_id) {
      return res.status(200).json({ customer: null, debt: { som: 0, usd: 0, yuan: 0 }, turn: { som: 0, usd: 0, yuan: 0 }, advance: { som: 0, usd: 0, yuan: 0 } });
    }
    const [customers, sales, payments] = await Promise.all([
      sget(`customers?id=eq.${client.customer_id}&select=id,name,contact,opening_debt`),
      sget(`sales?customer_id=eq.${client.customer_id}&select=id,date,currency,items,status,source`),
      sget(`payments?customer_id=eq.${client.customer_id}&select=amount,currency`),
    ]);
    const customer = customers[0] || null;
    const { debt, turn, advance } = debtAndTurnover(sales, payments, customer);
    return res.status(200).json({ customer, debt, turn, advance });
  } catch (e) {
    console.error("client/me error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
