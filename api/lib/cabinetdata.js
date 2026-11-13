// ========================================================================
//  ЛИЧНЫЙ КАБИНЕТ КЛИЕНТА — весь расчёт в одном месте, без записи в базу.
//
//  На входе только строки самого клиента (их отбирает api/client/cabinet.js
//  по customer_id из подписанного токена), на выходе — то, что кабинет
//  показывает. Здесь нет ни себестоимости, ни закупочных цен, ни чужих
//  строк: в ответ попадают лишь поля, перечисленные ниже явно.
//
//  Правила те же, что у склада:
//    • покупка — только выданная накладная (status final или пустой);
//      заказ без цены, ожидающий подтверждения и отменённый — не покупка;
//    • возврат — накладная с минусом (source = "refund", js/refund.js);
//      она уменьшает оборот и долг, но «последней ценой» не бывает никогда;
//    • долг = накладные + старый долг − оплаты, каждая валюта отдельно,
//      оплаты гасят накладные по очереди, старые первыми (api/lib/debt.js).
//
//  Проверяется тестом _tools/tests/t-cabinet.mjs.
// ========================================================================
import { allocatePayments } from "./debt.js";

const ВАЛЮТЫ = ["som", "usd", "yuan"];
const ноль = () => ({ som: 0, usd: 0, yuan: 0 });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const порог = (c) => (c === "som" ? 0.5 : 0.005);
const естьСумма = (o) => ВАЛЮТЫ.some(c => Math.abs((o && o[c]) || 0) >= порог(c));

// Выдана ли накладная: так же считает распределение оплат (api/lib/debt.js).
export const выдана = (s) => !!s && (!s.status || s.status === "final");
export const этоВозврат = (s) => String((s && s.source) || "") === "refund";
const ОТКРЫТЫЕ = ["order", "pending_confirm", "confirmed"];

// Короткий номер накладной — тот же, что печатается в PDF и Excel.
export const номер = (id) => String(id || "").slice(-6).toUpperCase();

const время = (s) => new Date((s && (s.date || s.created_at)) || 0).getTime() || 0;

function позиция(it, s, товары) {
  const p = товары.get(String(it.product_id || "")) || null;
  const qty = Number(it.qty) || 0;
  const unit_price = Number(it.unit_price) || 0;
  const currency = it.currency || s.currency || "som";
  return {
    product_id: it.product_id || null,
    name: (p && p.name) || it.name || "Товар удалён из каталога",
    photo: (p && p.photo) || null,
    sku: (p && p.sku) || "",
    unit: (p && p.unit) || "шт",
    category: (p && p.category) || "",
    qty,
    unit_price,
    currency,
    sum: r2(qty * unit_price),
  };
}

// products: [{ id, name, photo, sku, unit, category }] — уже без закупочных полей.
export function собратьКабинет({ customer, sales, payments, products, этапы }) {
  const товары = new Map((products || []).map(p => [String(p.id), p]));
  const все = (sales || []).filter(Boolean);
  const накладныеСырые = все.filter(выдана);
  const оплаты = (payments || []).filter(Boolean);
  const стДолг = (customer && customer.opening_debt) || {};
  const разнесено = allocatePayments(накладныеСырые, оплаты, стДолг);
  const ст = этапы || new Map();

  // ---------- накладные ----------
  const invoices = накладныеСырые
    .slice()
    .sort((a, b) => время(b) - время(a))
    .map(s => {
      const р = разнесено.get(String(s.id)) || { totals: ноль(), covereds: ноль(), remainings: ноль() };
      const refund = этоВозврат(s);
      const items = (s.items || []).map(it => позиция(it, s, товары));
      const totals = ноль();
      items.forEach(i => { if (totals[i.currency] !== undefined) totals[i.currency] = r2(totals[i.currency] + i.sum); });
      let pay;
      if (refund) pay = "refund";
      else if (!естьСумма(р.remainings)) pay = "paid";
      else if (естьСумма(р.covereds)) pay = "partial";
      else pay = "debt";
      return {
        id: s.id,
        no: номер(s.id),
        date: s.date || s.created_at || null,
        refund,
        items,
        totals,
        paid: refund ? ноль() : р.covereds,
        remaining: refund ? ноль() : р.remainings,
        pay,
        fulfillment: ст.get(String(s.id)) || null,
      };
    });

  // ---------- заказы, ещё не ставшие накладной ----------
  const orders = все
    .filter(s => ОТКРЫТЫЕ.includes(s.status) || s.status === "canceled")
    .sort((a, b) => время(b) - время(a))
    .slice(0, 30)
    .map(s => {
      const items = (s.items || []).map(it => позиция(it, s, товары));
      // Итог только когда цены стоят у всех позиций — иначе клиент
      // увидел бы сумму меньше настоящей.
      const всеСЦеной = items.length > 0 && items.every(i => i.unit_price > 0);
      const totals = ноль();
      if (всеСЦеной) items.forEach(i => { if (totals[i.currency] !== undefined) totals[i.currency] = r2(totals[i.currency] + i.sum); });
      return {
        id: s.id,
        no: номер(s.id),
        date: s.date || s.created_at || null,
        status: s.status,
        source: s.source || "manual",
        items: items.map(i => (i.unit_price > 0 ? i : { ...i, unit_price: 0, sum: 0 })),
        totals: всеСЦеной ? totals : null,
      };
    });

  // ---------- история цен по товарам ----------
  // Только позиции этого клиента. Последняя цена — из последней ВЫДАННОЙ
  // покупки с положительным количеством; возвраты в истории видны, но
  // ценой не становятся. Валюту и единицу берём у самой позиции/товара.
  const история = new Map();
  накладныеСырые
    .slice()
    .sort((a, b) => время(a) - время(b))
    .forEach(s => {
      const refund = этоВозврат(s);
      (s.items || []).forEach((it, k) => {
        const id = String(it.product_id || "");
        if (!id) return;
        const qty = Number(it.qty) || 0;
        if (!qty) return;
        const unit_price = Number(it.unit_price) || 0;
        const з = история.get(id) || { product_id: id, lines: [], last: null, count: 0, qty: 0, returned: 0 };
        const строка = {
          invoice_id: s.id,
          no: номер(s.id),
          date: s.date || s.created_at || null,
          qty,
          unit_price,
          currency: it.currency || s.currency || "som",
          sum: r2(qty * unit_price),
          refund: refund || qty < 0,
          _t: время(s) * 1000 + k,
        };
        з.lines.push(строка);
        if (строка.refund) з.returned = r2(з.returned + Math.abs(qty));
        else if (unit_price > 0) {
          з.count += 1;
          з.qty = r2(з.qty + qty);
          if (!з.last || строка._t >= з.last._t) з.last = строка;
        }
        история.set(id, з);
      });
    });
  const purchases = {};
  for (const [id, з] of история) {
    if (!з.last) continue;                      // одни возвраты — не покупка
    const p = товары.get(id);
    const lines = з.lines.sort((a, b) => b._t - a._t).map(({ _t, ...l }) => l);
    const { _t, ...last } = з.last;
    purchases[id] = { product_id: id, unit: (p && p.unit) || "шт", last, count: з.count, qty: з.qty, returned: з.returned, lines };
  }

  // ---------- сводка ----------
  const turn = ноль();
  invoices.forEach(i => ВАЛЮТЫ.forEach(c => { turn[c] = r2(turn[c] + (i.totals[c] || 0)); }));
  const paid = ноль();
  оплаты.forEach(p => { if (paid[p.currency] !== undefined) paid[p.currency] = r2(paid[p.currency] + (Number(p.amount) || 0)); });
  const opening = ноль();
  ВАЛЮТЫ.forEach(c => { opening[c] = r2(Number(стДолг[c]) || 0); });
  const баланс = ноль(), debt = ноль(), advance = ноль();
  ВАЛЮТЫ.forEach(c => {
    баланс[c] = r2(turn[c] + opening[c] - paid[c]);
    if (баланс[c] > порог(c)) debt[c] = баланс[c];
    else if (баланс[c] < -порог(c)) advance[c] = -баланс[c];
  });

  const продажи = invoices.filter(i => !i.refund);
  const вРаботе = продажи.filter(i => i.fulfillment && i.fulfillment.stage !== "shipped").length
    + orders.filter(o => ОТКРЫТЫЕ.includes(o.status)).length;
  const завершено = продажи.filter(i => !i.fulfillment || i.fulfillment.stage === "shipped").length;

  const top = Object.values(purchases)
    .sort((a, b) => b.count - a.count || String(b.last.date).localeCompare(String(a.last.date)))
    .slice(0, 6)
    .map(p => p.product_id);

  return {
    customer: customer ? { name: customer.name || "", contact: customer.contact || "" } : null,
    summary: {
      turn, paid, debt, advance, opening,
      invoices: продажи.length,
      refunds: invoices.length - продажи.length,
      orders: продажи.length + orders.filter(o => o.status !== "canceled").length,
      in_work: вРаботе,
      completed: завершено,
      canceled: orders.filter(o => o.status === "canceled").length,
    },
    invoices,
    orders,
    payments: оплаты
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .map(p => ({ id: p.id, amount: Number(p.amount) || 0, currency: p.currency, date: p.date || null, note: p.note || "" })),
    purchases,
    top,
    notices: уведомления(invoices, orders),
  };
}

// События за последние 14 дней — только из настоящих отметок склада.
function уведомления(invoices, orders) {
  const от = Date.now() - 14 * 864e5;
  const out = [];
  const свежее = (d) => d && new Date(d).getTime() >= от;
  invoices.forEach(i => {
    const f = i.fulfillment;
    if (!f) return;
    if (f.stage === "shipped" && свежее(f.shipped_at)) out.push({ kind: "shipped", no: i.no, invoice_id: i.id, at: f.shipped_at, carrier: f.carrier || null });
    else if (f.stage === "packed" && свежее(f.packed_at)) out.push({ kind: "packed", no: i.no, invoice_id: i.id, at: f.packed_at });
    else if (f.stage === "placed" && свежее(f.placed_at)) out.push({ kind: "placed", no: i.no, invoice_id: i.id, at: f.placed_at });
  });
  orders.forEach(o => {
    if (o.status === "pending_confirm") out.push({ kind: "confirm", no: o.no, order_id: o.id, at: o.date });
    else if (o.status === "order" && свежее(o.date)) out.push({ kind: "order", no: o.no, order_id: o.id, at: o.date });
  });
  return out.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 8);
}
