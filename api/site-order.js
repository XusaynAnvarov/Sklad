// POST /api/site-order — заказ с сайта (source:"site")
// JWT клиента обязателен; unit_price:0 (владелец выставит цены в складе)
import { getValidClient } from "./lib/clientauth.js";
import { sget } from "./lib/supa.js";

async function notifyAdmin(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {}
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const items = body?.items; // [{ product_id, qty }]
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Корзина пуста" });

  try {
    // проверяем наличие товаров
    const prodIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
    const prods = await sget(`products?id=in.(${prodIds.join(",")})&select=id,name,stock_qty`);
    const prodMap = Object.fromEntries(prods.map(p => [p.id, p]));

    // клиент может заказать любое количество (даже больше остатка); владелец увидит остаток при выставлении цен
    for (const it of items) {
      const p = prodMap[it.product_id];
      if (!p) return res.status(400).json({ error: `Товар не найден: ${it.product_id}` });
      if ((Number(p.stock_qty) || 0) <= 0) return res.status(400).json({ error: `Товар «${p.name}» отсутствует на складе` });
    }

    if (!client.customer_id) return res.status(400).json({ error: "Клиент не привязан к складу" });

    const saleItems = items.map(it => ({
      product_id: it.product_id,
      qty: Number(it.qty) || 1,
      unit_price: 0,
    }));

    const SUPA = process.env.SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_KEY;
    const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=representation" };
    const r = await fetch(SUPA + "/rest/v1/sales", {
      method: "POST", headers: H,
      body: JSON.stringify({
        customer_id: client.customer_id,
        date: new Date().toISOString(),
        currency: "som",
        status: "order",
        source: "site",
        items: saleItems,
        order_from: { phone: client.phone, account_id: client.sub },
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error("site-order supabase error", err);
      return res.status(500).json({ error: "Не удалось создать заказ" });
    }
    const created = await r.json();
    const sale = Array.isArray(created) ? created[0] : created;

    // уведомление владельцу
    const adminChatId = process.env.ADMIN_CHAT_ID;
    if (adminChatId) {
      const lines = saleItems.map(it => {
        const p = prodMap[it.product_id];
        return `• ${p?.name || it.product_id} × ${it.qty}`;
      });
      const msg = `Новый заказ с сайта\n\nКлиент: ${client.phone}\n\n${lines.join("\n")}`;
      try { await notifyAdmin(msg); } catch {}
    }

    return res.status(200).json({ id: sale?.id || null, status: "order" });
  } catch (e) {
    console.error("site-order error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
