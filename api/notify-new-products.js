// POST /api/notify-new-products — рассылка клиентам в Telegram о поступивших товарах.
// Body: { product_ids: [...] }  (гард: admin-токен склада через getUser)
import { getUser } from "./lib/auth.js";
import { sget } from "./lib/supa.js";

const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL || "https://generalmodern.uz";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safeId = (v) => (/^[\w-]+$/.test(String(v || "")) ? String(v) : null);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  if (!CLIENT_TOKEN) return res.status(500).json({ error: "CLIENT_BOT_TOKEN не задан на сервере" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const ids = Array.isArray(body?.product_ids) ? body.product_ids.map(safeId).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: "Не указаны товары" });

  try {
    // имена пришедших товаров
    const prods = await sget(`products?id=in.(${ids.join(",")})&select=id,name`);
    if (!prods.length) return res.status(404).json({ error: "Товары не найдены" });
    const names = prods.map(p => p.name).filter(Boolean);
    const list = names.slice(0, 20).map(n => `• ${n}`).join("\n") + (names.length > 20 ? `\n…и ещё ${names.length - 20}` : "");

    // получатели — все клиенты с привязанным Telegram
    const customers = await sget("customers?tg_chat_id=not.is.null&select=tg_chat_id");
    const chatIds = [...new Set(customers.map(c => c.tg_chat_id).filter(Boolean))];

    // клиентам — просто что пришли новые товары (без названий/поставщика/количества)
    const text = "🆕 Поступили новые товары! Загляните в каталог 👇";
    const reply_markup = { inline_keyboard: [[{ text: "🛒 Открыть каталог", web_app: { url: `${PUBLIC_URL}/catalog?order=1` } }]] };

    let sent = 0, failed = 0;
    for (let i = 0; i < chatIds.length; i++) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${CLIENT_TOKEN}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatIds[i], text, reply_markup, disable_web_page_preview: true }),
        });
        const j = await r.json();
        if (j.ok) sent++; else failed++;
      } catch { failed++; }
      if ((i + 1) % 25 === 0) await sleep(1000); // троттлинг ~25/сек
    }

    return res.status(200).json({ ok: true, sent, failed, recipients: chatIds.length });
  } catch (e) {
    console.error("notify-new-products error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
