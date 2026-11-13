// ========================================================================
//  ЛИЧНЫЙ КАБИНЕТ КЛИЕНТА.  node _tools/tests/t-cabinet.mjs
//
//  Главное, что видит клиент: покупал ли он товар, по какой цене и когда.
//  Проверяем, что «последняя цена» берётся только из выданной накладной
//  этого клиента, не из заказа без цены, не из отменённого и не из
//  возврата; что валюты не смешиваются и долг считается как в складе.
// ========================================================================
const корень = new URL("../../", import.meta.url);
const { собратьКабинет, номер } = await import(new URL("api/lib/cabinetdata.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

const товары = [
  { id: "p1", name: "Шпулька BC-DB1-NBL", sku: "BC-DB1-NBL", unit: "пачка", photo: "https://x/1.jpg" },
  { id: "p2", name: "Игла DBx1 №14", sku: "DBX1-14", unit: "упаковка", photo: null },
  { id: "p3", name: "Лапка T35", sku: "T35", unit: "шт", photo: null },
];
const s = (id, date, items, extra = {}) => ({ id, date, status: "final", currency: "som", items, ...extra });
const продажи = [
  s("aaaa000001", "2026-09-01T10:00:00Z", [{ product_id: "p1", qty: 8, unit_price: 23500 }, { product_id: "p2", qty: 20, unit_price: 41000 }]),
  s("aaaa000002", "2026-10-12T10:00:00Z", [{ product_id: "p1", qty: 10, unit_price: 25000 }, { product_id: "p3", qty: 5, unit_price: 9.5, currency: "usd" }]),
  // возврат после последней покупки — ценой стать не должен
  s("aaaa000003", "2026-10-20T10:00:00Z", [{ product_id: "p1", qty: -2, unit_price: 25000 }], { source: "refund" }),
  // заказ ещё без цены и отменённый — не покупки
  s("aaaa000004", "2026-11-01T10:00:00Z", [{ product_id: "p1", qty: 50, unit_price: 0 }], { status: "order" }),
  s("aaaa000005", "2026-11-02T10:00:00Z", [{ product_id: "p2", qty: 5, unit_price: 99000 }], { status: "canceled" }),
  s("aaaa000006", "2026-11-03T10:00:00Z", [{ product_id: "p2", qty: 5, unit_price: 50000 }], { status: "pending_confirm" }),
];
const оплаты = [
  { id: 1, amount: 1000000, currency: "som", date: "2026-09-05" },
  { id: 2, amount: 10, currency: "usd", date: "2026-10-15" },
];
const этапы = new Map([["aaaa000002", { stage: "shipped", placed_at: "2026-10-12", packed_at: "2026-10-12", shipped_at: "2026-10-13" }]]);

const к = собратьКабинет({ customer: { name: "Азиз", contact: "+998", opening_debt: { som: 200000 } }, sales: продажи, payments: оплаты, products: товары, этапы });

const p1 = к.purchases.p1;
ok("последняя цена шпульки — 25 000 из накладной 12.10", p1 && p1.last.unit_price === 25000 && p1.last.qty === 10);
ok("последняя покупка не возврат и не заказ без цены", p1.last.no === номер("aaaa000002"));
ok("единица — у товара (пачка)", p1.unit === "пачка");
ok("покупок шпульки 2, возвращено 2 пачки", p1.count === 2 && p1.returned === 2);
ok("возврат виден в истории шпульки", p1.lines.some(l => l.refund && l.qty === -2));
ok("история новыми сверху", p1.lines[0].date >= p1.lines[p1.lines.length - 1].date);
ok("иглу брали только раз, цена 41 000 (отменённый и неподтверждённый не в счёт)", к.purchases.p2.count === 1 && к.purchases.p2.last.unit_price === 41000);
ok("валюта лапки сохранена — доллары", к.purchases.p3.last.currency === "usd" && к.purchases.p3.last.unit_price === 9.5);

// оборот: 8*23500 + 20*41000 + 10*25000 − 2*25000 = 188000+820000+250000−50000 = 1 208 000 сум; $47.5
ok("оборот в сумах учитывает возврат", к.summary.turn.som === 1208000);
ok("оборот в долларах отдельно", к.summary.turn.usd === 47.5);
// долг: 1 208 000 + 200 000 (старый) − 1 000 000 = 408 000 сум; $37.5
ok("долг в сумах = накладные + старый долг − оплаты", к.summary.debt.som === 408000);
ok("долг в долларах отдельно", к.summary.debt.usd === 37.5);
ok("накладных-продаж 2, возвратов 1", к.summary.invoices === 2 && к.summary.refunds === 1);
ok("в списке накладных нет заказов и отменённых", к.invoices.every(i => !["aaaa000004", "aaaa000005", "aaaa000006"].includes(i.id)));
ok("открытые и отменённые заказы — отдельно", к.orders.length === 3);
ok("у заказа без цены итог не показывается", к.orders.find(o => o.id === "aaaa000004").totals === null);
ok("отменённый заказ помечен", к.orders.find(o => o.id === "aaaa000005").status === "canceled");
ok("у накладной есть фото товара", к.invoices.find(i => i.id === "aaaa000001").items[0].photo === "https://x/1.jpg");
ok("отправленная накладная — завершена", к.summary.completed >= 1);
ok("в ответе нет закупочных полей", !JSON.stringify(к).match(/cost_|cogs|price_yuan|batches/));
ok("накладная 12.10 оплачена частично или в долг", ["partial", "debt"].includes(к.invoices.find(i => i.id === "aaaa000002").pay));
ok("ожидающий подтверждения заказ попадает в уведомления", к.notices.some(n => n.kind === "confirm"));

const пусто = собратьКабинет({ customer: { name: "Новый" }, sales: [], payments: [], products: [] });
ok("у нового клиента нет долга и покупок", !пусто.summary.debt.som && !Object.keys(пусто.purchases).length);

const переплата = собратьКабинет({ customer: {}, sales: [s("b1", "2026-01-01", [{ product_id: "p1", qty: 1, unit_price: 100 }])], payments: [{ amount: 150, currency: "som" }], products: товары });
ok("переплата — аванс, а не отрицательный долг", переплата.summary.debt.som === 0 && переплата.summary.advance.som === 50);

console.log(плохо ? `\n${плохо} проверок не прошло` : "\nВсе проверки прошли");
process.exit(плохо ? 1 : 0);
