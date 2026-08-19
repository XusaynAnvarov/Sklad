// ========================================================================
//  КЛИЕНТ TELEGRAM (вызывает serverless-функцию /api/telegram).
//  Токен бота на бэкенде (Vercel env), здесь его НЕТ.
// ========================================================================
import { authHeaders } from "./db.js?v=20260819e";

const cfg = window.APP_CONFIG || {};

// ------------------------------------------------------------------
//  Канал для накладных — ОДНО место, где он определяется.
//  Раньше со страницы «Продажи» канал не передавался вовсе, а в config.js он
//  пустой → сервер отвечал «Не указан канал», хотя в Настройках канал вписан.
//  Порядок: явно переданный → сохранённый из Настроек → значение из config.js.
//  Значение из облака кладёт в localStorage загрузчик приложения (js/app.js).
// ------------------------------------------------------------------
export function tgChannel(explicit) {
  const e = String(explicit || "").trim();
  if (e) return e;
  try { const v = (localStorage.getItem("gm_tg_channel") || "").trim(); if (v) return v; } catch { }
  return String(cfg.TELEGRAM_CHANNEL || "").trim();
}
function requireChannel(explicit) {
  const ch = tgChannel(explicit);
  if (!ch) throw new Error("Не указан канал. Откройте Настройки → Telegram и впишите @канал или id вида -100…");
  return ch;
}

async function call(payload) {
  const url = cfg.TELEGRAM_API || "/api/telegram";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    // Различаем два разных сбоя — иначе непонятно, где искать причину:
    //  • наш сервер не ответил (nginx отдал HTML-страницу 502/504) — проблема у нас;
    //  • сервер ответил JSON-ошибкой — значит до Telegram дошли, но он отказал.
    let serverError = null;
    try { const j = await r.json(); serverError = j && j.error ? String(j.error) : null; } catch { }
    if (!serverError) {
      throw new Error(r.status === 502 || r.status === 504
        ? "Сервер не ответил вовремя (" + r.status + "). Накладная сохранена — попробуйте отправить ещё раз."
        : "Ошибка сервера " + r.status);
    }
    // временный сбой на стороне Telegram — сервер уже пробовал несколько раз
    if (/bad gateway|gateway time|не ответил за|временно недоступен|не удалось связаться/i.test(serverError)) {
      throw new Error("Telegram сейчас недоступен — попробуйте отправить ещё раз через минуту");
    }
    throw new Error("Telegram: " + serverError);
  }
  return r.json();
}

// Отправка накладной в канал текстом (резерв)
export function sendInvoice(text, photoUrl) {
  return call({ action: "invoice", channel: requireChannel(), text, photo: photoUrl || null });
}

// Отправка накладной в канал в виде PDF-файла (канал можно передать явно из настроек)
export function sendInvoicePDF(saleId, channel) {
  return call({ action: "invoice_pdf", channel: requireChannel(channel), sale_id: saleId });
}

// Акт сверки клиенту в его бот (PDF + кнопки накладных)
export function sendActToClient(customerId, chatId) {
  return call({ action: "client_act_pdf", customer_id: customerId, chat_id: chatId || "" });
}
// Акт сверки в канал
export function sendActToChannel(customerId, channel) {
  return call({ action: "act_pdf", customer_id: customerId, channel: requireChannel(channel) });
}

// Отправка каталога/сообщения конкретному клиенту (chat_id)
export function sendToClient(chatId, text) {
  return call({ action: "message", chat_id: chatId, text });
}

// --- через КЛИЕНТСКОГО бота (для накладных по заказам) ---
// PDF накладной напрямую клиенту в его бот
export function sendInvoicePDFToClient(saleId, chatId, caption) {
  return call({ action: "client_invoice_pdf", sale_id: saleId, chat_id: chatId, text: caption || "" });
}
// Текстовое уведомление клиенту в его бот
export function notifyClient(chatId, text) {
  return call({ action: "client_message", chat_id: chatId, text });
}

// Выход клиента из бота (при удалении из склада): уведомить и сбросить сессию
export function logoutClientFromBot(chatIds) {
  return call({ action: "client_logout", chat_ids: chatIds });
}

// Запрос подтверждения заказа клиентом: список с ценами + кнопки ✅/❌
export function requestOrderConfirm(saleId, chatId) {
  return call({ action: "client_confirm_request", sale_id: saleId, chat_id: chatId });
}

// Уведомление владельцу (ADMIN_CHAT_ID берётся из env на сервере)
export function notifyOwner(text) {
  return call({ action: "admin_message", text });
}
