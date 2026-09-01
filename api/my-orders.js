// ========================================================================
//  МОИ ЗАКАЗЫ — всё, что клиент делает со своими заказами из мини-приложения.
//
//  Публичный адрес, но подлинность гарантирует подпись Telegram (initData,
//  HMAC ключом CLIENT_BOT_TOKEN) — как и в приёме заказа (api/order.js).
//  Один POST на четыре действия: заводить четыре маршрута незачем, а забыть
//  прописать хоть один в server.js — уже проверенный способ получить 404.
//
//  Что можно и когда:
//    list    — свои заказы, всегда
//    edit    — количество / убрать товар, пока цену не проставили
//    cancel  — отменить заказ целиком, пока цену не проставили
//    confirm — согласиться с ценой или отказаться, когда цена выставлена
//
//  Цены отдаются ТОЛЬКО по заказам самого клиента: выборка ограничена его
//  Telegram-аккаунтом. В каталог цена не попадает никогда.
//
//  ENV: CLIENT_BOT_TOKEN, TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, SUPABASE_*
// ========================================================================
import { sget, spatch, okId } from "./lib/supa.js";
import { verifyInitData } from "./lib/tg.js";
import {
  найтиКлиента, владелецЗаказа, языкКлиента, заказыКлиента,
  ЖДЁТ_ЦЕНЫ, ЖДЁТ_ОТВЕТА, ОТМЕНЁН,
} from "./lib/clientorders.js";

const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const ADMIN_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.ADMIN_CHAT_ID;
const ПОТОЛОК = 100000;

async function уведомить(text) {
  if (!ADMIN_TOKEN || !ADMIN_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${ADMIN_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: String(ADMIN_CHAT), text }),
    });
  } catch {}
}

// Названия и фото по списку товаров — одним запросом.
async function карточкиТоваров(ids) {
  const чистые = [...new Set(ids.map(String))].filter(okId);
  if (!чистые.length) return {};
  try {
    const prods = await sget(`products?id=in.(${чистые.join(",")})&select=id,name,photo_url,photos`);
    return Object.fromEntries((prods || []).map(p => [String(p.id), {
      name: p.name || "—",
      photo: (Array.isArray(p.photos) && p.photos[0]) || p.photo_url || "",
    }]));
  } catch { return {}; }
}

// Заказ для показа в приложении: позиции с названием, фото и ценой,
// итог отдельно по каждой валюте (у позиций она может отличаться).
function видЗаказа(s, карточки) {
  const items = (s.items || []).map(it => {
    const к = карточки[String(it.product_id)] || {};
    return {
      product_id: it.product_id,
      name: к.name || "—",
      photo: к.photo || "",
      qty: Number(it.qty) || 0,
      unit_price: Number(it.unit_price) || 0,
      currency: it.currency || s.currency || "som",
    };
  });
  const итоги = {};
  let оценён = items.length > 0;
  for (const it of items) {
    if (!(it.unit_price > 0)) { оценён = false; continue; }
    итоги[it.currency] = (итоги[it.currency] || 0) + it.qty * it.unit_price;
  }
  return {
    id: s.id, date: s.date, status: s.status, source: s.source || "bot",
    currency: s.currency || "som", items, totals: итоги, priced: оценён,
  };
}

// Заказ клиента по номеру, с проверкой прав. Возвращает строку или null.
async function взятьСвойЗаказ(order_id, chatId, customer) {
  if (!okId(order_id)) return null;
  let sale = null;
  try { sale = (await sget(`sales?id=eq.${encodeURIComponent(order_id)}&select=*`))[0] || null; } catch {}
  if (!sale) return null;
  return владелецЗаказа(sale, chatId, customer) ? sale : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { initData, action } = body || {};

  const user = verifyInitData(initData, CLIENT_TOKEN);
  if (!user || !user.id) return res.status(401).json({ error: "Не удалось подтвердить Telegram" });

  const chatId = String(user.id);
  const customer = await найтиКлиента(chatId);

  try {
    // ---------- список заказов ----------
    if (!action || action === "list") {
      const sales = await заказыКлиента(chatId, customer);
      const карточки = await карточкиТоваров(sales.flatMap(s => (s.items || []).map(i => i.product_id)));
      return res.status(200).json({
        ok: true,
        lang: await языкКлиента(chatId, customer),
        customer: customer ? { name: customer.name || "" } : null,
        orders: sales.map(s => видЗаказа(s, карточки)),
      });
    }

    // ---------- правка позиции ----------
    if (action === "edit") {
      const sale = await взятьСвойЗаказ(body.order_id, chatId, customer);
      if (!sale) return res.status(404).json({ error: "Заказ не найден" });
      // Менять количество и убирать товар можно и после того, как цены
      // выставлены: цена за штуку уже согласована, меняется только итог,
      // и клиент подтверждает заказ сразу — без второго круга к владельцу.
      // Подтверждённый и оформленный заказ уже собирают — его не трогаем.
      if (sale.status !== ЖДЁТ_ЦЕНЫ && sale.status !== ЖДЁТ_ОТВЕТА) {
        return res.status(409).json({ error: "Заказ уже собирают — менять его нельзя. Напишите нам." });
      }
      const pid = String(body.product_id || "");
      const qty = Math.max(0, Math.min(ПОТОЛОК, Math.floor(Number(body.qty) || 0)));
      const было = sale.items || [];
      if (!было.some(i => String(i.product_id) === pid)) {
        return res.status(400).json({ error: "Такого товара в заказе нет" });
      }
      const стало = qty > 0
        ? было.map(i => (String(i.product_id) === pid ? { ...i, qty } : i))
        : было.filter(i => String(i.product_id) !== pid);
      if (!стало.length) {
        return res.status(400).json({ error: "В заказе должен остаться хотя бы один товар. Чтобы убрать всё — отмените заказ." });
      }
      await spatch(`sales?id=eq.${encodeURIComponent(sale.id)}`, { items: стало });

      const карточки = await карточкиТоваров([pid]);
      const имя = карточки[pid]?.name || pid;
      // Отдельно отмечаем правку ПОСЛЕ выставленных цен: там меняется итог
      // по уже согласованной цене, и владельцу стоит на это взглянуть.
      const когда = sale.status === ЖДЁТ_ОТВЕТА ? " (уже с ценами)" : "";
      await уведомить(`✏️ Клиент поправил заказ${когда}\nКлиент: ${customer?.name || user.first_name || chatId}\n`
        + (qty > 0 ? `• ${имя} → ${qty}` : `• ${имя} — убрал из заказа`));
      return res.status(200).json({ ok: true });
    }

    // ---------- отмена заказа ----------
    if (action === "cancel") {
      const sale = await взятьСвойЗаказ(body.order_id, chatId, customer);
      if (!sale) return res.status(404).json({ error: "Заказ не найден" });
      if (sale.status !== ЖДЁТ_ЦЕНЫ) {
        return res.status(409).json({ error: "Заказ уже в работе — отменить его можно только через нас." });
      }
      await spatch(`sales?id=eq.${encodeURIComponent(sale.id)}`, { status: ОТМЕНЁН });
      await уведомить(`🚫 Клиент отменил заказ\nКлиент: ${customer?.name || user.first_name || chatId}\nПозиций было: ${(sale.items || []).length}`);
      return res.status(200).json({ ok: true });
    }

    // ---------- ответ на выставленную цену ----------
    if (action === "confirm") {
      const sale = await взятьСвойЗаказ(body.order_id, chatId, customer);
      if (!sale) return res.status(404).json({ error: "Заказ не найден" });
      if (sale.status !== ЖДЁТ_ОТВЕТА) {
        return res.status(409).json({ error: "По этому заказу цена ещё не выставлена" });
      }
      const согласен = body.agree === true;
      // Отказ возвращает заказ в работу к владельцу — ровно так же, как
      // кнопка «отказаться» в чате бота (api/bot.js).
      await spatch(`sales?id=eq.${encodeURIComponent(sale.id)}`, { status: согласен ? "confirmed" : ЖДЁТ_ЦЕНЫ });
      const кто = [user.first_name, user.last_name].filter(Boolean).join(" ") || chatId;
      await уведомить(согласен
        ? `✅ Заказ ПОДТВЕРЖДЁН (в приложении)\nКлиент: ${customer?.name || кто}\nПодтвердил: ${кто}\nПозиций: ${(sale.items || []).length}`
        : `❌ Заказ ОТКЛОНЁН клиентом (в приложении)\nКлиент: ${customer?.name || кто}\nОтклонил: ${кто}\nПозиций: ${(sale.items || []).length}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Неизвестное действие" });
  } catch (e) {
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
