// ========================================================================
//  Приём заказа из Telegram Mini App (каталог-корзина).
//  Публичный эндпоинт, но подлинность гарантируется подписью initData
//  (HMAC-SHA256 ключом из CLIENT_BOT_TOKEN). Создаёт «заказ» в sales
//  (status='order'), пишет клиенту подтверждение и уведомляет владельца.
//  ENV: CLIENT_BOT_TOKEN, TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, SUPABASE_*
// ========================================================================
import crypto from "crypto";
import { sget, supsert } from "./lib/supa.js";

const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const ADMIN_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.ADMIN_CHAT_ID;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OK_MSG = {
  ru: "✅ Заказ принят! Он передан администратору и проверяется. Когда накладная будет готова — мы вас уведомим.",
  uz: "✅ Buyurtma qabul qilindi! U administratorga yuborildi va tekshirilmoqda. Nakladnoy tayyor bo‘lganda — xabar beramiz.",
  en: "✅ Order received! It has been sent to the administrator and is being reviewed. We will notify you when the invoice is ready.",
};

// Проверка подписи Telegram WebApp initData → возвращает user или null
function verifyInitData(initData, token) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (calc !== hash) return null;
  // свежесть (не старше 1 суток)
  const authDate = Number(params.get("auth_date") || 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;
  try { const u = params.get("user"); return u ? JSON.parse(u) : null; } catch { return null; }
}

async function tgSend(token, chatId, text) {
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: String(chatId), text }),
    });
  } catch {}
}

async function clientLang(chatId, customer) {
  if (customer?.tg_lang) return customer.tg_lang;
  try { const s = await sget(`bot_sessions?chat_id=eq.${encodeURIComponent(chatId)}&select=lang`); if (s[0]?.lang) return s[0].lang; } catch {}
  return "ru";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { initData, items } = body || {};

  const user = verifyInitData(initData, CLIENT_TOKEN);
  if (!user || !user.id) return res.status(401).json({ error: "Не удалось подтвердить Telegram" });

  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Пустой заказ" });
  // валидируем и нормализуем позиции
  const want = new Map();
  for (const it of items) {
    const id = String(it.id || "");
    const qty = Math.max(1, Math.min(100000, Math.floor(Number(it.qty) || 0)));
    if (UUID.test(id) && qty > 0) want.set(id, qty);
  }
  if (!want.size) return res.status(400).json({ error: "Нет валидных товаров" });

  try {
    // подтверждаем, что товары существуют И в наличии (нет в наличии — заказать нельзя)
    const ids = [...want.keys()];
    const prods = await sget(`products?id=in.(${ids.join(",")})&select=id,stock_qty,status_override`);
    const inStock = (p) => p.status_override === "in_stock" || (p.status_override !== "on_order" && Number(p.stock_qty) > 0);
    const valid = new Set(prods.filter(inStock).map(p => String(p.id)));
    const saleItems = [...want.entries()]
      .filter(([id]) => valid.has(id))
      .map(([id, qty]) => ({ product_id: id, qty, unit_price: 0, currency: "som", paid: false }));
    if (!saleItems.length) return res.status(400).json({ error: "Выбранных товаров нет в наличии" });

    const customer = (await sget(`customers?tg_chat_id=eq.${encodeURIComponent(user.id)}&select=id,name,tg_lang`))[0] || null;
    const tgName = [user.first_name, user.last_name].filter(Boolean).join(" ") || (user.username ? "@" + user.username : "Гость");

    // АНТИДУБЛЬ: если такой же заказ (тот же чат/клиент, те же позиции) создан за последние 2 минуты — не дублируем
    const sig = JSON.stringify(saleItems.map(i => [String(i.product_id), Number(i.qty) || 0]).sort());
    try {
      const since = new Date(Date.now() - 120000).toISOString();
      const recent = await sget(`sales?status=eq.order&date=gte.${encodeURIComponent(since)}&select=items,customer_id,order_from`);
      const dup = (recent || []).some(r => {
        const sameChat = customer?.id ? (r.customer_id === customer.id) : (String(r.order_from?.chat_id || "") === String(user.id));
        if (!sameChat) return false;
        return JSON.stringify((r.items || []).map(i => [String(i.product_id), Number(i.qty) || 0]).sort()) === sig;
      });
      if (dup) {
        const lang0 = await clientLang(user.id, customer);
        await tgSend(CLIENT_TOKEN, user.id, OK_MSG[lang0] || OK_MSG.ru); // клиенту подтвердим (заказ уже принят), но дубль не создаём
        return res.status(200).json({ ok: true, duplicate: true });
      }
    } catch {}

    await supsert("sales", {
      customer_id: customer?.id || null,
      status: "order", source: "bot",
      date: new Date().toISOString(), currency: "som",
      items: saleItems,
      order_from: customer ? null : { chat_id: String(user.id), name: tgName, username: user.username || null },
    });

    // подтверждение клиенту (на его языке) + уведомление владельцу
    const lang = await clientLang(user.id, customer);
    await tgSend(CLIENT_TOKEN, user.id, OK_MSG[lang] || OK_MSG.ru);
    await tgSend(ADMIN_TOKEN, ADMIN_CHAT, `🛒 Новый заказ из бота\nОт: ${customer?.name || tgName}${customer ? "" : " (не привязан)"}\nПозиций: ${saleItems.length}`);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
