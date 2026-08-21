// ========================================================================
//  ОПРИХОДОВАНИЕ — товар с поступления попадает на склад.
//  Один расчёт для склада на сайте и для склада в телефоне.
//
//  Главное правило: себестоимость НЕ перескакивает на цену нового прихода.
//  Пока на полке лежит старая партия, продаётся именно она — значит и цена
//  показывается её. Новая цена вступит в силу сама, когда FIFO доест
//  старую партию. Иначе прибыль по старому товару считалась бы по новой
//  цене и врала.
// ========================================================================
import { ensureBatches, sumQty, costAfter, currentCost } from "./inventory.js?v=20260821a";
import { convert } from "./fx.js?v=20260821a";
import { isShop } from "./purchase.js?v=20260821a";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Что записать по каждому товару поступления. Ничего не пишет — только считает,
// поэтому проверяется тестом без базы.
export function arrivalRows(purchase, products) {
  const shop = isShop(purchase);
  const when = purchase.date || new Date().toISOString();
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const rows = [];

  for (const it of (purchase.items || [])) {
    const p = pmap[it.product_id];
    if (!p) continue;
    const cur = it.currency || purchase.currency;
    const batches = ensureBatches(p);
    const own = currentCost(batches);
    // Из магазина берём НАШУ складскую цену: сколько отдали в магазине —
    // наше дело, но если записать ту цену, себестоимость и прибыль поедут.
    const cy = shop ? own.cost_yuan : r2(convert(it.unit_cost, cur, "yuan"));
    const cu = shop ? own.cost_usd : r2(convert(it.unit_cost, cur, "usd"));
    // новая партия встаёт В КОНЕЦ: старые продаются первыми
    const next = [...batches, { qty: Number(it.qty) || 0, cost_yuan: cy, cost_usd: cu, date: when }];
    const cc = costAfter(next, { cost_yuan: cy, cost_usd: cu });

    const row = { id: p.id, stock_qty: sumQty(next), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches: next };
    // last_arrival_at поднимает товар в начало каталога и метит новинкой.
    // Приход из магазина — пополнение, а не новинка: давно продающийся товар
    // не должен всплывать наверх после каждой добавки.
    if (!shop) row.last_arrival_at = new Date().toISOString();
    rows.push(row);
    // держим объект товара в списке в согласии с тем, что записали
    p.batches = next; p.cost_yuan = cc.cost_yuan; p.cost_usd = cc.cost_usd; p.stock_qty = row.stock_qty;
  }
  return rows;
}

export async function applyArrival(db, purchase, products) {
  const rows = arrivalRows(purchase, products);
  for (const row of rows) {
    // колонки batches может не быть в старой базе — тогда пишем без неё
    try { await db.products.upsert(row); }
    catch { const { batches, ...noBatches } = row; await db.products.upsert(noBatches); }
  }
  return rows.length;
}
