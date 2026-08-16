// GET /api/client/orders — заказы клиента (статус order/pending_confirm/confirmed/final)
import { getClient } from "../lib/clientauth.js";
import { sget, okId } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = getClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id) return res.status(200).json({ orders: [] });
  if (!okId(client.customer_id)) return res.status(400).json({ error: "Неверный клиент" });

  try {
    const sales = await sget(
      `sales?customer_id=eq.${encodeURIComponent(client.customer_id)}&select=id,date,currency,status,source,items,order_from&order=date.desc`
    );
    // Загружаем имена товаров для отображения
    const prodIds = [...new Set(sales.flatMap(s => (s.items || []).map(i => i.product_id).filter(Boolean)))].filter(okId);
    let prodMap = {};
    if (prodIds.length) {
      const prods = await sget(`products?id=in.(${encodeURIComponent(prodIds.join(","))})&select=id,name`);
      prods.forEach(p => (prodMap[p.id] = p.name));
    }
    const orders = sales.map(s => ({
      id: s.id,
      date: s.date,
      currency: s.currency,
      status: s.status,
      source: s.source || "manual",
      // Цена отдаётся только по заказам самого клиента: запрос отфильтрован
      // по customer_id из подписанного токена. В каталог цена не попадает никогда.
      // Пока владелец не проставил цену, unit_price = 0 — кабинет показывает
      // «цена уточняется» и не выводит итог по заказу.
      items: (s.items || []).map(it => ({
        product_id: it.product_id,
        product_name: prodMap[it.product_id] || "—",
        qty: it.qty,
        unit_price: it.unit_price,
        currency: it.currency || s.currency,
      })),
      total: (s.items || []).reduce((acc, it) => acc + it.qty * it.unit_price, 0),
    }));
    return res.status(200).json({ orders });
  } catch (e) {
    console.error("client/orders error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
