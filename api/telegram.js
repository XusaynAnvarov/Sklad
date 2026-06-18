// ========================================================================
//  Vercel serverless-функция: отправка в Telegram.
//  Токен бота берётся из переменной окружения (в браузер не попадает).
//
//  Переменные окружения (Vercel → Settings → Environment Variables):
//    TELEGRAM_BOT_TOKEN   — токен бота от @BotFather
//    TELEGRAM_CHANNEL_ID  — @username или -100… id канала (по умолчанию)
// ========================================================================
import { sget } from "./lib/supa.js";
import { buildInvoicePDF } from "./lib/pdf.js";
import { getUser } from "./lib/auth.js";
import { invoiceCoverageStatus } from "./lib/debt.js";

const safeId = (v) => (/^[\w-]+$/.test(String(v || "")) ? String(v) : null);

// реальный статус накладной по оплатам клиента
async function coverageFor(sale) {
  if (!sale || !sale.customer_id) return undefined;
  const [cs, pays] = await Promise.all([
    sget(`sales?customer_id=eq.${sale.customer_id}&select=id,date,currency,items`),
    sget(`payments?customer_id=eq.${sale.customer_id}&select=amount,currency`),
  ]);
  return invoiceCoverageStatus(sale.id, cs, pays);
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
  const { action, text, photo, channel, chat_id, sale_id } = body || {};

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
      const total = (sale.items || []).reduce((t, i) => t + i.qty * i.unit_price, 0);
      const fd = new FormData();
      fd.append("chat_id", String(target));
      fd.append("caption", `🧾 Накладная — ${customer?.name || "—"} · ${new Date(sale.date).toLocaleDateString("ru-RU")}`);
      fd.append("document", new Blob([bytes], { type: "application/pdf" }), `nakladnaya-${new Date(sale.date).toISOString().slice(0, 10)}.pdf`);
      const r = await fetch(api("sendDocument"), { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.description || "sendDocument error");
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
    return res.status(400).json({ error: "Неизвестное действие" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
