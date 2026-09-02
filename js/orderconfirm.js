// ========================================================================
//  ЗАКАЗ — КЛИЕНТУ НА ПОДТВЕРЖДЕНИЕ ЦЕНЫ.
//
//  Владелец проставил цены и спрашивает клиента: берёшь по такой? Клиент
//  отвечает кнопкой — в чате бота или в приложении заказа.
//
//  Склад тут НЕ трогаем: товар списывается только при «Оформить». Пока
//  клиент думает, остаток должен оставаться на месте.
//
//  Один расчёт на оба места: со склада на сайте и со склада в телефоне.
//  Раньше эта кнопка была только на сайте — с телефона заказ было
//  некуда отправить, и приходилось идти к компьютеру.
// ========================================================================
import { requestOrderConfirm, sendInvoicePDFToClient, notifyClient } from "./telegram.js?v=20260902a";

// Куда слать. У клиента может быть несколько привязанных Telegram-аккаунтов
// (несколько номеров на фирму) — годится любой. Гостевой заказ несёт свой
// аккаунт прямо в себе.
export function чатКлиента(customer, sale) {
  if (customer) {
    if (customer.tg_chat_id) return String(customer.tg_chat_id);
    const ещё = Array.isArray(customer.tg_chat_ids) ? customer.tg_chat_ids.filter(Boolean) : [];
    if (ещё.length) return String(ещё[0]);
  }
  const гость = sale && sale.order_from && sale.order_from.chat_id;
  return гость ? String(гость) : null;
}

// Позиции для базы. Выбрасываем ТОЛЬКО служебные поля интерфейса
// (manual — «цену вписали руками», hint — подсказка на экране): всё
// остальное сохраняем как есть, чтобы не потерять полей, которые ставит
// склад — например price_yuan_norm для отчёта о прибыли.
const чистые = (items) => (items || []).map(({ manual, hint, ...поле }) => ({
  ...поле,
  qty: Number(поле.qty) || 0,
  unit_price: Number(поле.unit_price) || 0,
  currency: поле.currency || "som",
  paid: поле.paid === true,
}));

// Сохранить цены и отправить клиенту вопрос.
// Возвращает { отправлено }: false значит, что цены сохранены, но у клиента
// нет привязанного Telegram — вопрос придётся задать голосом.
export async function наПодтверждение(db, { sale, customer, customerId, currency, items, date }) {
  const позиции = чистые(items);
  if (!позиции.length) throw new Error("В заказе нет позиций");
  if (позиции.some(it => !(it.qty > 0))) throw new Error("У некоторых позиций нет количества");
  if (позиции.some(it => !(it.unit_price > 0))) throw new Error("Не у всех позиций проставлена цена");

  await db.sales.upsert({
    id: sale.id,
    customer_id: customerId || sale.customer_id || null,
    date: date || sale.date,
    currency: currency || sale.currency || "som",
    status: "pending_confirm",
    items: позиции,
  });

  const чат = чатКлиента(customer, sale);
  if (!чат) return { отправлено: false };
  await requestOrderConfirm(sale.id, чат);
  return { отправлено: true };
}

// Отправить готовую накладную клиенту в его бот — PDF плюс короткое
// сообщение. Тот же поиск аккаунта, что и у вопроса о цене: раньше
// накладная искала только основной номер, и клиенту, привязанному вторым,
// не уходила вовсе — «У клиента нет Telegram».
export async function отправитьНакладную(saleId, customer, sale, caption) {
  const чат = чатКлиента(customer, sale);
  if (!чат) return { отправлено: false };
  await notifyClient(чат, "✅ Ваша накладная готова! Отправляем…");
  await sendInvoicePDFToClient(saleId, чат, caption || "🧾 Ваша накладная");
  return { отправлено: true };
}
