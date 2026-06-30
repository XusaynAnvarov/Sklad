// ========================================================================
//  Vercel serverless-функция: отправка в Telegram.
//  Токен бота берётся из переменной окружения (в браузер не попадает).
//
//  Переменные окружения (Vercel → Settings → Environment Variables):
//    TELEGRAM_BOT_TOKEN   — токен бота от @BotFather
//    TELEGRAM_CHANNEL_ID  — @username или -100… id канала (по умолчанию)
// ========================================================================
import { sget, supsert } from "./lib/supa.js";
import { buildInvoicePDF, buildReconciliationPDF } from "./lib/pdf.js";
import { getUser } from "./lib/auth.js";
import { invoiceCoverageStatus } from "./lib/debt.js";

const safeId = (v) => (/^[\w-]+$/.test(String(v || "")) ? String(v) : null);

// реальный статус накладной по оплатам клиента
async function coverageFor(sale) {
  if (!sale || !sale.customer_id) return undefined;
  const [cs, pays, cust] = await Promise.all([
    sget(`sales?customer_id=eq.${sale.customer_id}&select=id,date,currency,items`),
    sget(`payments?customer_id=eq.${sale.customer_id}&select=amount,currency`),
    sget(`customers?id=eq.${sale.customer_id}&select=opening_debt`),
  ]);
  return invoiceCoverageStatus(sale.id, cs, pays, cust[0]?.opening_debt);
}

export default async function handler(req, res) {
  // CORS (на случай разных доменов)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });

  // Только авторизованный админ (Supabase Auth JWT) может слать в Telegram.
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизовано" });

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN не задан на сервере" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { action, text, photo, channel, chat_id, chat_ids, sale_id, customer_id } = body || {};

  // собрать данные акта сверки по клиенту (только оформленные накладные + оплаты)
  async function buildActFor(custId) {
    const customer = (await sget(`customers?id=eq.${encodeURIComponent(custId)}&select=*`))[0];
    if (!customer) return null;
    const [sales, payments] = await Promise.all([
      sget(`sales?customer_id=eq.${custId}&status=eq.final&select=id,date,currency,items&order=date.asc`),
      sget(`payments?customer_id=eq.${custId}&select=amount,currency,date&order=date.asc`),
    ]);
    const bytes = await buildReconciliationPDF({ customer, sales, payments });
    return { customer, sales, bytes };
  }

  const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN; // отправка КЛИЕНТУ идёт через клиентского бота
  const api = (method) => `https://api.telegram.org/bot${TOKEN}/${method}`;
  const capi = (method) => `https://api.telegram.org/bot${CLIENT_TOKEN}/${method}`;
  async function tg(method, payload) {
    const r = await fetch(api(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.description || "Telegram API error");
    return j;
  }

  try {
    // Накладная в канал в виде PDF-файла
    if (action === "invoice_pdf") {
      const target = channel || process.env.TELEGRAM_CHANNEL_ID;
      if (!target) return res.status(400).json({ error: "Не указан канал" });
      if (!sale_id) return res.status(400).json({ error: "Не указан sale_id" });
      const sid = safeId(sale_id);
      if (!sid) return res.status(400).json({ error: "Неверный sale_id" });
      const sale = (await sget(`sales?id=eq.${encodeURIComponent(sid)}&select=*`))[0];
      if (!sale) return res.status(404).json({ error: "Накладная не найдена" });
      const customer = sale.customer_id ? (await sget(`customers?id=eq.${sale.customer_id}&select=*`))[0] : { name: "—" };
      const products = await sget("products?select=id,name");
      const bytes = await buildInvoicePDF({ sale, customer, products, status: await coverageFor(sale) });
      const cap = `🧾 Накладная — ${customer?.name || "—"} · ${new Date(sale.date).toLocaleDateString("ru-RU")}`;
      const fname = `nakladnaya-${new Date(sale.date).toISOString().slice(0, 10)}.pdf`;
      const makeFd = () => { const fd = new FormData(); fd.append("chat_id", String(target)); fd.append("caption", cap); fd.append("document", new Blob([bytes], { type: "application/pdf" }), fname); return fd; };
      // пробуем бота-владельца, затем клиентского бота — какой добавлен админом канала, тот и отправит
      let r = await fetch(api("sendDocument"), { method: "POST", body: makeFd() });
      let j = await r.json();
      if (!j.ok && CLIENT_TOKEN) { r = await fetch(capi("sendDocument"), { method: "POST", body: makeFd() }); j = await r.json(); }
      if (!j.ok) {
        const hint = /not found|chat not found/i.test(j.description || "")
          ? " — проверьте: для приватного канала укажите id вида -100…, добавьте бота администратором канала."
          : "";
        throw new Error((j.description || "sendDocument error") + hint);
      }
      return res.status(200).json({ ok: true });
    }
    // Акт сверки в КАНАЛ (admin-бот)
    if (action === "act_pdf") {
      const target = channel || process.env.TELEGRAM_CHANNEL_ID;
      if (!target) return res.status(400).json({ error: "Не указан канал" });
      if (!customer_id) return res.status(400).json({ error: "Не указан клиент" });
      const act = await buildActFor(customer_id);
      if (!act) return res.status(404).json({ error: "Клиент не найден" });
      const fd = new FormData();
      fd.append("chat_id", String(target));
      fd.append("caption", `📋 Акт сверки — ${act.customer?.name || "—"}`);
      fd.append("document", new Blob([act.bytes], { type: "application/pdf" }), `akt-sverki.pdf`);
      const r = await fetch(api("sendDocument"), { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.description || "sendDocument error");
      return res.status(200).json({ ok: true });
    }
    // Акт сверки КЛИЕНТУ (клиент-бот) + кнопки накладных (нажал → PDF этой накладной)
    if (action === "client_act_pdf") {
      if (!CLIENT_TOKEN) return res.status(500).json({ error: "CLIENT_BOT_TOKEN не задан" });
      if (!customer_id) return res.status(400).json({ error: "Не указан клиент" });
      const cust = (await sget(`customers?id=eq.${encodeURIComponent(customer_id)}&select=id,name,tg_chat_id`))[0];
      if (!cust) return res.status(404).json({ error: "Клиент не найден" });
      // получатель: выбранный chat_id (по номеру телефона) ИЛИ основной tg_chat_id
      const target = chat_id || cust.tg_chat_id;
      if (!target) return res.status(400).json({ error: "У клиента нет привязанного Telegram" });
      const act = await buildActFor(customer_id);
      if (!act) return res.status(404).json({ error: "Клиент не найден" });
      // 1) сам акт-PDF
      const fd = new FormData();
      fd.append("chat_id", String(target));
      fd.append("caption", "📋 Ваш акт сверки взаиморасчётов");
      fd.append("document", new Blob([act.bytes], { type: "application/pdf" }), `akt-sverki.pdf`);
      const r = await fetch(capi("sendDocument"), { method: "POST", body: fd });
      const j = await r.json(); if (!j.ok) throw new Error(j.description || "sendDocument error");
      // 2) кнопки накладных — нажатие обрабатывает хендлер inv: в боте → PDF накладной
      const sign = { yuan: "¥", usd: "$", som: "сум" };
      const rows = (act.sales || []).slice(-20).reverse().map(s => {
        const byCur = {}; (s.items || []).forEach(it => { const c = it.currency || s.currency; byCur[c] = (byCur[c] || 0) + (it.qty || 0) * (it.unit_price || 0); });
        const tot = Object.entries(byCur).map(([c, v]) => `${Math.round(v).toLocaleString("ru-RU")} ${sign[c] || c}`).join(" + ") || "—";
        return [{ text: `🧾 ${new Date(s.date).toLocaleDateString("ru-RU")} · ${tot}`, callback_data: "inv:" + s.id }];
      });
      if (rows.length) {
        await fetch(capi("sendMessage"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: target, text: "Нажмите на накладную, чтобы получить её PDF:", reply_markup: { inline_keyboard: rows } }),
        });
      }
      return res.status(200).json({ ok: true });
    }
    if (action === "invoice") {
      const target = channel || process.env.TELEGRAM_CHANNEL_ID;
      if (!target) return res.status(400).json({ error: "Не указан канал (channel / TELEGRAM_CHANNEL_ID)" });
      if (photo) await tg("sendPhoto", { chat_id: target, photo, caption: text, parse_mode: "Markdown" });
      else await tg("sendMessage", { chat_id: target, text, parse_mode: "Markdown" });
      return res.status(200).json({ ok: true });
    }
    if (action === "message") {
      if (!chat_id) return res.status(400).json({ error: "Не указан chat_id" });
      await tg("sendMessage", { chat_id, text, disable_web_page_preview: false });
      return res.status(200).json({ ok: true });
    }
    // выход клиента из бота при удалении из склада: уведомить и сбросить его сессию
    if (action === "client_logout") {
      const ids = Array.isArray(chat_ids) ? chat_ids.filter(Boolean) : [];
      const capiUrl = (m) => `https://api.telegram.org/bot${CLIENT_TOKEN}/${m}`;
      for (const id of ids) {
        if (CLIENT_TOKEN) { try { await fetch(capiUrl("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: id, text: "Ваш аккаунт был удалён, доступ к боту закрыт. Если это ошибка — свяжитесь с нами.", reply_markup: { remove_keyboard: true } }) }); } catch {} }
        try { await supsert("bot_sessions", { chat_id: String(id), state: {}, updated_at: new Date().toISOString() }); } catch {}
      }
      return res.status(200).json({ ok: true });
    }
    if (action === "admin_message") {
      const target = process.env.ADMIN_CHAT_ID;
      if (!target) return res.status(500).json({ error: "ADMIN_CHAT_ID не задан" });
      await tg("sendMessage", { chat_id: target, text });
      return res.status(200).json({ ok: true });
    }
    // --- отправка КЛИЕНТУ через клиентского бота (CLIENT_BOT_TOKEN) ---
    if (action === "client_message") {
      if (!CLIENT_TOKEN) return res.status(500).json({ error: "CLIENT_BOT_TOKEN не задан" });
      if (!chat_id) return res.status(400).json({ error: "Не указан chat_id" });
      const r = await fetch(capi("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id, text }) });
      const j = await r.json(); if (!j.ok) throw new Error(j.description || "sendMessage error");
      return res.status(200).json({ ok: true });
    }
    if (action === "client_invoice_pdf") {
      if (!CLIENT_TOKEN) return res.status(500).json({ error: "CLIENT_BOT_TOKEN не задан" });
      if (!chat_id) return res.status(400).json({ error: "Не указан chat_id клиента" });
      const sid = safeId(sale_id);
      if (!sid) return res.status(400).json({ error: "Неверный sale_id" });
      const sale = (await sget(`sales?id=eq.${encodeURIComponent(sid)}&select=*`))[0];
      if (!sale) return res.status(404).json({ error: "Накладная не найдена" });
      const customer = sale.customer_id ? (await sget(`customers?id=eq.${sale.customer_id}&select=*`))[0] : { name: "—" };
      const products = await sget("products?select=id,name");
      const bytes = await buildInvoicePDF({ sale, customer, products, status: await coverageFor(sale) });
      const fd = new FormData();
      fd.append("chat_id", String(chat_id));
      fd.append("caption", text || `🧾 Ваша накладная · ${new Date(sale.date).toLocaleDateString("ru-RU")}`);
      fd.append("document", new Blob([bytes], { type: "application/pdf" }), `nakladnaya-${new Date(sale.date).toISOString().slice(0, 10)}.pdf`);
      const r = await fetch(capi("sendDocument"), { method: "POST", body: fd });
      const j = await r.json(); if (!j.ok) throw new Error(j.description || "sendDocument error");
      return res.status(200).json({ ok: true });
    }
    // --- запрос подтверждения заказа клиентом (список с ценами + кнопки) ---
    if (action === "client_confirm_request") {
      if (!CLIENT_TOKEN) return res.status(500).json({ error: "CLIENT_BOT_TOKEN не задан" });
      if (!chat_id) return res.status(400).json({ error: "Не указан chat_id клиента" });
      const sid = safeId(sale_id);
      if (!sid) return res.status(400).json({ error: "Неверный sale_id" });
      const sale = (await sget(`sales?id=eq.${encodeURIComponent(sid)}&select=*`))[0];
      if (!sale) return res.status(404).json({ error: "Заказ не найден" });
      const products = await sget("products?select=id,name");
      const pmap = Object.fromEntries(products.map(p => [p.id, p.name]));
      const sign = { yuan: "¥", usd: "$", som: "сум" };
      const items = sale.items || [];
      const lines = items.map((it, i) => {
        const c = it.currency || sale.currency, s = sign[c] || c;
        return `${i + 1}. ${pmap[it.product_id] || "?"} — ${it.qty} × ${it.unit_price} ${s} = ${it.qty * it.unit_price} ${s}`;
      });
      const byCur = {};
      items.forEach(it => { const c = it.currency || sale.currency; byCur[c] = (byCur[c] || 0) + it.qty * it.unit_price; });
      const totals = Object.entries(byCur).map(([c, v]) => `${v} ${sign[c] || c}`).join(" + ") || "—";
      const txt = `🧾 Ваш заказ готов к подтверждению:\n\n${lines.join("\n")}\n\n💰 Итого: ${totals}\n\nПодтвердите заказ:`;
      const r = await fetch(capi("sendMessage"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text: txt, reply_markup: { inline_keyboard: [[
          { text: "✅ Подтвердить", callback_data: "ocf:" + sid },
          { text: "❌ Отказаться", callback_data: "ocd:" + sid },
        ]] } }),
      });
      const j = await r.json(); if (!j.ok) throw new Error(j.description || "sendMessage error");
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Неизвестное действие" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
