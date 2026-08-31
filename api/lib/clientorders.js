// ========================================================================
//  КЛИЕНТ И ЕГО ЗАКАЗЫ — общие правила для мини-приложения заказа.
//
//  У одного клиента может быть несколько Telegram-аккаунтов (несколько
//  номеров на фирму): основной лежит в customers.tg_chat_id, остальные —
//  в customers.tg_chat_ids. Право на заказ есть у любого из них, иначе
//  сотрудник, оформивший заказ со второго телефона, не сможет его открыть.
//
//  Те же правила уже действуют в боте (api/bot.js) — держим их здесь,
//  чтобы приложение и бот не разошлись в том, чей это заказ.
// ========================================================================
import { sget, okId } from "./supa.js";

const eid = (v) => encodeURIComponent(String(v || ""));

// Заказ ещё не оценён — только такой клиент может править сам.
export const ЖДЁТ_ЦЕНЫ = "order";
// Владелец проставил цены и ждёт ответа клиента.
export const ЖДЁТ_ОТВЕТА = "pending_confirm";
// Клиент передумал. Строку не удаляем — история нужна, — но в долг она
// не попадает: "canceled" перечислен в NOT_ISSUED (js/debt.js).
export const ОТМЕНЁН = "canceled";

// Карточка клиента по Telegram-аккаунту: сперва основной номер, потом
// дополнительные.
export async function найтиКлиента(chatId) {
  const id = String(chatId || "");
  if (!id) return null;
  try {
    const byMain = (await sget(`customers?tg_chat_id=eq.${eid(id)}&select=*`))[0];
    if (byMain) return byMain;
  } catch {}
  try {
    const byArr = (await sget(`customers?tg_chat_ids=cs.${eid(JSON.stringify([id]))}&select=*`))[0];
    if (byArr) return byArr;
  } catch {}
  return null;
}

// Этот ли Telegram-аккаунт оформил заказ.
// customer — уже найденная карточка (не ходим в базу второй раз).
export function владелецЗаказа(sale, chatId, customer) {
  if (!sale) return false;
  const id = String(chatId || "");
  if (!id) return false;
  // гостевой заказ: аккаунт записан прямо в заказе
  if (String(sale.order_from?.chat_id || "") === id) return true;
  // заказ привязан к клиенту — годится любой его аккаунт
  if (!sale.customer_id || !customer || String(customer.id) !== String(sale.customer_id)) return false;
  const ids = Array.isArray(customer.tg_chat_ids) ? customer.tg_chat_ids.map(String) : [];
  return String(customer.tg_chat_id || "") === id || ids.includes(id);
}

// Язык, который клиент выбрал в боте. Приложение открывается сразу на нём —
// заново выбирать язык в каждом окне неудобно.
export async function языкКлиента(chatId, customer) {
  if (customer?.tg_lang) return customer.tg_lang;
  try {
    const s = await sget(`bot_sessions?chat_id=eq.${eid(chatId)}&select=lang`);
    if (s[0]?.lang) return s[0].lang;
  } catch {}
  return "ru";
}

// Заказы этого Telegram-аккаунта: и привязанные к клиенту, и гостевые.
// limit держим небольшим — в приложении смотрят последние, а не архив.
export async function заказыКлиента(chatId, customer, limit = 40) {
  const id = String(chatId || "");
  const поля = "id,date,currency,status,source,items,order_from";
  const собрано = new Map();

  if (customer?.id && okId(customer.id)) {
    try {
      const свои = await sget(`sales?customer_id=eq.${eid(customer.id)}&select=${поля}&order=date.desc&limit=${limit}`);
      (свои || []).forEach(s => собрано.set(String(s.id), s));
    } catch {}
  }
  // Гостевые заказы: клиент мог заказать до того, как его привязали к складу.
  // PostgREST умеет искать по вложенному полю jsonb — так не тащим весь список.
  try {
    const гостевые = await sget(`sales?order_from->>chat_id=eq.${eid(id)}&select=${поля}&order=date.desc&limit=${limit}`);
    (гостевые || []).forEach(s => собрано.set(String(s.id), s));
  } catch {}

  return [...собрано.values()]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, limit);
}
