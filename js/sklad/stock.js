// ========================================================================
//  Запись движения склада из мини-приложения.
//  Те же кирпичи, что в складе на сайте (js/inventory.js), поэтому FIFO
//  и себестоимость считаются одинаково — база одна, расхождений нет.
//  Пишем ПАКЕТОМ (upsertMany): на телефоне поштучная запись 20 позиций
//  занимала бы минуту.
// ========================================================================
import { consumeFIFO, returnToStock, ensureBatches, sumQty, costAfter } from "../inventory.js?v=20260819c";

// Свежие карточки товаров одним запросом (иначе спишем по устаревшему остатку)
async function readFresh(db, ids) {
  const out = {};
  try {
    const rows = await db.products.getMany(ids);
    (rows || []).forEach(p => { out[p.id] = p; });
  } catch {
    for (const id of ids) { try { const p = await db.products.get(id); if (p) out[id] = p; } catch { } }
  }
  return out;
}

// Пакетная запись; если база не знает колонку batches — повторяем без неё
async function writeStock(db, rows) {
  if (!rows.length) return;
  const noBatches = () => rows.map(({ batches, ...rest }) => rest);
  try { await db.products.upsertMany(rows); return; } catch { }
  try { await db.products.upsertMany(noBatches()); return; } catch { }
  for (const r of rows) {
    try { await db.products.upsert(r); } catch { await db.products.upsert((({ batches, ...x }) => x)(r)); }
  }
}

// Списать позиции со склада и вернуть строки для записи.
// items: [{ product_id, qty }]
export function applySale(fresh, items) {
  const rows = [];
  for (const it of items) {
    const p = fresh[it.product_id];
    if (!p) continue;
    const r = consumeFIFO(ensureBatches(p), Number(it.qty) || 0);
    const cc = costAfter(r.batches, p);
    rows.push({
      id: p.id, stock_qty: sumQty(r.batches),
      cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches: r.batches,
    });
  }
  return rows;
}

// Провести продажу: прочитать свежее → списать → записать пакетом.
export async function sellItems(db, items) {
  const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  if (!ids.length) return { written: 0 };
  const fresh = await readFresh(db, ids);
  const missing = ids.filter(id => !fresh[id]);
  if (missing.length) throw new Error("Товар не найден на складе (" + missing.length + " поз.)");
  const rows = applySale(fresh, items);
  await writeStock(db, rows);
  return { written: rows.length };
}

// Вернуть товары на склад (отмена продажи)
export async function returnItems(db, items) {
  const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  if (!ids.length) return;
  const fresh = await readFresh(db, ids);
  const rows = [];
  for (const it of items) {
    const p = fresh[it.product_id]; if (!p) continue;
    const batches = returnToStock(ensureBatches(p), Number(it.qty) || 0, p.cost_yuan, p.cost_usd);
    const cc = costAfter(batches, p);
    rows.push({ id: p.id, stock_qty: sumQty(batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches });
  }
  await writeStock(db, rows);
}
