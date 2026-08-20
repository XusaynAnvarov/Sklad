// ========================================================================
//  ОФОРМЛЕНИЕ НАКЛАДНОЙ — одно место для всех экранов телефона.
//
//  Продажа за прилавком и принятый заказ из бота приводят к одному и тому
//  же: товар списывается со склада, появляется накладная. Раньше это было
//  написано только в экране продажи, и любой новый экран норовил написать
//  свою версию — а расходятся такие копии молча и дорого.
//
//  Что обязательно попадает в накладную:
//    • цена в юанях — по ней сходятся цены между валютами;
//    • СЕБЕСТОИМОСТЬ списанных партий — иначе прибыль по этой накладной
//      потом пересчитается по сегодняшней цене склада и соврёт.
// ========================================================================
import { convert } from "../fx.js?v=20260820h";
import { sellItems } from "./stock.js?v=20260820h";

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Разложить себестоимость товара по строкам накладной.
// Один товар может стоять двумя строками — делим по количеству.
export function splitCogs(items, cogs) {
  const total = {};
  items.forEach(i => { total[i.product_id] = (total[i.product_id] || 0) + (Number(i.qty) || 0); });
  return items.map(i => {
    const c = (cogs || {})[i.product_id];
    const all = total[i.product_id] || 0;
    if (!c || !all) return { cogs_yuan: null, cogs_usd: null };
    const share = (Number(i.qty) || 0) / all;
    return { cogs_yuan: round(c.cogs_yuan * share), cogs_usd: round(c.cogs_usd * share) };
  });
}

// Строки накладной из набранного списка.
export function buildItems(items, cogs, paid) {
  const parts = splitCogs(items, cogs);
  return items.map((i, k) => ({
    product_id: i.product_id,
    qty: i.qty,
    unit_price: i.unit_price,
    currency: i.currency,
    price_yuan_norm: round(convert(i.unit_price, i.currency, "yuan")),
    cogs_yuan: parts[k].cogs_yuan,
    cogs_usd: parts[k].cogs_usd,
    // «со склада списано». По этой отметке «Проверка склада» ищет накладные,
    // по которым товар не сняли. Телефон её не ставил — и каждая продажа с
    // телефона показывалась там как непроведённая. Нажать «провести» значило
    // списать тот же товар второй раз.
    applied: true,
    paid: !!paid,
  }));
}

// Суммы по валютам — для оплаты наличными и для подписи «Итого».
export function totalsByCur(items) {
  const by = {};
  (items || []).forEach(i => {
    const c = i.currency || "som";
    by[c] = (by[c] || 0) + (Number(i.qty) || 0) * (Number(i.unit_price) || 0);
  });
  return by;
}

// Оформить накладную: списать со склада и записать.
// quick — продажа за прилавком: оплачена на месте, клиента нет.
export async function issueInvoice(db, {
  id, quick, customerId, currency, items, signName, source, date, orderFrom,
} = {}) {
  if (!items || !items.length) throw new Error("Список пуст");
  if (!quick && !customerId) throw new Error("Не выбран клиент");

  const sold = await sellItems(db, items.map(i => ({ product_id: i.product_id, qty: i.qty })));
  const when = date || new Date().toISOString();
  const sale = {
    id: id || uid("s"),
    customer_id: quick ? null : customerId,
    currency: currency || "som",
    date: when,
    status: "final",
    source: source || (quick ? "quick" : "mini"),
    // имя-подпись: клиента в базе не заводим, долг никому не пишем
    order_from: orderFrom || (quick && signName ? { name: signName } : null),
    items: buildItems(items, sold.cogs, quick),
  };
  await db.sales.upsert(sale);

  // Продажа за прилавком оплачена на месте — записываем оплату, иначе
  // деньги не попадут в кассу и в отчёт «Откуда пришли деньги».
  // Разные валюты в одной накладной — разные записи.
  if (quick) {
    for (const [cur, amount] of Object.entries(totalsByCur(items))) {
      if (!(amount > 0.001)) continue;
      const pay = {
        id: uid("y"),
        customer_id: null, amount, currency: cur, date: when,
        note: "Продажа за наличные" + (signName ? " · " + signName : ""),
      };
      // колонки method может не быть в старой базе — тогда пишем без неё
      try { await db.payments.upsert({ ...pay, method: "cash" }); }
      catch { await db.payments.upsert(pay); }
    }
  }
  return sale;
}
