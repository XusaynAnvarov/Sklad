// ========================================================================
//  ПОСЛЕДНИЕ ЦЕНЫ — по чём товар уходил раньше.
//
//  Два вопроса, на которые отвечает этот файл:
//    • по чём ЭТОТ клиент брал этот товар в прошлый раз — он привык к своей
//      цене, и назвать другую значит поспорить на пустом месте;
//    • по чём товар уходил кому угодно — для продажи за прилавком, когда
//      клиента нет.
//
//  Считаем из уже загруженного списка продаж, одним проходом. Раньше цена
//  бралась запросом на каждый товар: отсканировал десять наклеек — десять
//  раз выкачал всю историю продаж.
// ========================================================================
import { issuedOnly } from "./debt.js?v=20260821e";

const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

// Продажи от свежих к старым, только выданные: заказ, по которому товар ещё
// не отдан, ценой не считается — она может ещё измениться.
export function freshFirst(sales) {
  return issuedOnly(sales).slice().sort(byDateDesc);
}

// товар → { price, currency, date } по первой найденной цене
function collect(sales, keep) {
  const map = new Map();
  for (const s of sales) {
    if (!keep(s)) continue;
    for (const it of (s.items || [])) {
      const id = it && it.product_id;
      if (!id || map.has(id)) continue;
      const price = Number(it.unit_price);
      if (!isFinite(price) || price <= 0) continue;      // нулевую цену не помним
      map.set(id, { price, currency: it.currency || s.currency || "som", date: s.date });
    }
  }
  return map;
}

// Последняя цена каждого товара — кому угодно.
export function lastAnyMap(sortedSales) {
  return collect(sortedSales, () => true);
}

// Последняя цена каждого товара — конкретному клиенту.
export function lastForCustomerMap(sortedSales, customerId) {
  if (!customerId) return new Map();
  return collect(sortedSales, s => s.customer_id === customerId);
}

// Что подставить в цену позиции.
// own = true — это цена самого клиента; false — общая, «не его».
export function suggestPrice(productId, { ownMap, anyMap } = {}) {
  const own = ownMap && ownMap.get(productId);
  if (own) return { ...own, own: true };
  const any = anyMap && anyMap.get(productId);
  if (any) return { ...any, own: false };
  return null;
}

// «Его цена от 5 августа» / «общая цена от 5 августа»
export function priceNote(hint) {
  if (!hint) return "";
  const d = new Date(hint.date);
  const when = isFinite(d) ? d.toLocaleDateString("ru-RU") : "";
  const кто = hint.own ? "его цена" : "общая цена";
  return when ? `${кто} от ${when}` : кто;
}

// Переставить цены уже набранных позиций.
// За прилавком сначала сканируют товар, а имя клиента называют потом —
// значит цены надо переставить задним числом, иначе в накладную уйдут
// чужие. Цену, набранную руками, не трогаем никогда: это чаще всего
// договорённая скидка, и молча её стереть — хуже, чем не подставить.
// Возвращает, сколько позиций реально изменилось.
export function repriceItems(items, hintOf) {
  let changed = 0;
  for (const it of (items || [])) {
    if (it.manual) continue;
    const hint = hintOf(it.product_id);
    if (!hint) continue;
    it.hint = hint;
    if (it.unit_price === hint.price && it.currency === hint.currency) continue;
    it.unit_price = hint.price;
    it.currency = hint.currency;
    changed++;
  }
  return changed;
}
