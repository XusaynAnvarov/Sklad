// ========================================================================
//  КЛИЕНТ TELEGRAM (вызывает serverless-функцию /api/telegram).
//  Токен бота на бэкенде (Vercel env), здесь его НЕТ.
// ========================================================================
import { authHeaders } from "./db.js";

const cfg = window.APP_CONFIG || {};

async function call(payload) {
  const url = cfg.TELEGRAM_API || "/api/telegram";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    let msg = "Telegram: ошибка " + r.status;
    try { const j = await r.json(); if (j.error) msg = "Telegram: " + j.error; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// Отправка накладной в канал текстом (резерв)
export function sendInvoice(text, photoUrl) {
  return call({ action: "invoice", channel: cfg.TELEGRAM_CHANNEL || "", text, photo: photoUrl || null });
}

// Отправка накладной в канал в виде PDF-файла (канал можно передать явно из настроек)
export function sendInvoicePDF(saleId, channel) {
  return call({ action: "invoice_pdf", channel: channel || cfg.TELEGRAM_CHANNEL || "", sale_id: saleId });
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

// Запрос подтверждения заказа клиентом: список с ценами + кнопки ✅/❌
export function requestOrderConfirm(saleId, chatId) {
  return call({ action: "client_confirm_request", sale_id: saleId, chat_id: chatId });
}

// Уведомление владельцу (ADMIN_CHAT_ID берётся из env на сервере)
export function notifyOwner(text) {
  return call({ action: "admin_message", text });
}
