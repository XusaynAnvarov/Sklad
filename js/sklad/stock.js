// ========================================================================
//  Запись движения склада из мини-приложения.
//  Те же кирпичи, что в складе на сайте (js/inventory.js), поэтому FIFO
//  и себестоимость считаются одинаково — база одна, расхождений нет.
//  Пишем ПАКЕТОМ (upsertMany): на телефоне поштучная запись 20 позиций
//  занимала бы минуту.
// ========================================================================
import { consumeFIFO, returnToStock, ensureBatches, sumQty, costAfter, currentCost } from "../inventory.js?v=20260822b";

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

// Пакетная запись; если база не знает колонку batches — повторяем без неё.
// ВАЖНО: если не сработал ни один способ — бросаем ошибку. Раньше она
// проглатывалась, и приложение бодро писало «Принято», хотя на складе
// ничего не менялось.
async function writeStock(db, rows) {
  if (!rows.length) return;
  const noBatches = () => rows.map(({ batches, ...rest }) => rest);
  let last;
  try { await db.products.upsertMany(rows); return; } catch (e) { last = e; }
  try { await db.products.upsertMany(noBatches()); return; } catch (e) { last = e; }
  for (const r of rows) {
    try { await db.products.upsert(r); }
    catch { await db.products.upsert((({ batches, ...x }) => x)(r)); }
  }
}

// Перечитать товары и сверить остаток с ожидаемым. Запись могла не дойти
// (нет сети, отказ базы) — молчать об этом нельзя, иначе склад разъедется.
async function verifyStock(db, expected) {
  const ids = Object.keys(expected);
  if (!ids.length) return [];
  let rows = [];
  try { rows = await db.products.getMany(ids); }
  catch {
    for (const id of ids) { try { const p = await db.products.get(id); if (p) rows.push(p); } catch { } }
  }
  const now = Object.fromEntries((rows || []).map(p => [p.id, Number(p.stock_qty) || 0]));
  return ids.filter(id => now[id] === undefined || Math.abs(now[id] - expected[id]) > 0.001);
}

// Списать позиции со склада и вернуть строки для записи.
// items: [{ product_id, qty }]
// Возвращает и строки склада, и СПИСАННУЮ СЕБЕСТОИМОСТЬ по каждой позиции.
// Себестоимость надо записать в саму накладную: склад живёт дальше, цены
// меняются, и если её не запомнить, прибыль по старой накладной будет
// пересчитываться по сегодняшней цене — то есть врать. На сайте она
// записывается (js/pages/sales.js), в телефоне терялась.
export function applySale(fresh, items) {
  // Один товар может попасть в накладную двумя строками — отсканировали
  // дважды. Тогда списывать надо ПОДРЯД: вторая строка берёт то, что
  // осталось после первой. Раньше каждая строка списывала от исходного
  // остатка и в склад уходила только последняя — товар терялся, а
  // себестоимость считалась по уже проданным партиям.
  const left = {};                       // товар → партии по ходу списания
  const cogs = {};
  for (const it of items) {
    const p = fresh[it.product_id];
    if (!p) continue;
    const r = consumeFIFO(left[p.id] || ensureBatches(p), Number(it.qty) || 0);
    left[p.id] = r.batches;
    const prev = cogs[p.id] || { cogs_yuan: 0, cogs_usd: 0 };
    cogs[p.id] = { cogs_yuan: prev.cogs_yuan + r.cogY, cogs_usd: prev.cogs_usd + r.cogU };
  }
  const rows = Object.keys(left).map(id => {
    const batches = left[id];
    const cc = costAfter(batches, fresh[id]);
    return { id, stock_qty: sumQty(batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches };
  });
  return { rows, cogs };
}

// Провести продажу: прочитать свежее → списать → записать пакетом.
export async function sellItems(db, items) {
  const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  if (!ids.length) return { written: 0 };
  const fresh = await readFresh(db, ids);
  const missing = ids.filter(id => !fresh[id]);
  if (missing.length) throw new Error("Товар не найден на складе (" + missing.length + " поз.)");
  const { rows, cogs } = applySale(fresh, items);
  await writeStock(db, rows);
  // сверяем: остаток должен стать ровно тем, что мы посчитали
  const expected = Object.fromEntries(rows.map(r => [r.id, r.stock_qty]));
  const bad = await verifyStock(db, expected);
  if (bad.length) throw new Error("Остаток не записался (" + bad.length + " поз.) — проверьте связь и повторите");
  return { written: rows.length, cogs };
}

// Поставить точный остаток «как на полке». Разница вниз списывается по FIFO,
// разница вверх зачисляется по НЫНЕШНЕЙ складской цене — так решил владелец:
// ничего вводить не нужно и прибыль не искажается. Выводит и из минуса.
export async function setStock(db, productId, want) {
  const target = Number(want);
  if (!isFinite(target)) throw new Error("Остаток должен быть числом");
  const fresh = await readFresh(db, [productId]);
  const p = fresh[productId];
  if (!p) throw new Error("Товар не найден");

  const batches = ensureBatches(p);
  const now = sumQty(batches);
  const diff = target - now;
  if (Math.abs(diff) < 0.0001) return { changed: 0, stock: now };

  let next;
  if (diff < 0) {
    next = consumeFIFO(batches, -diff).batches;
  } else {
    // цена той партии, что продаётся сейчас; если склад пуст — сохранённая
    const own = currentCost(batches);
    const cy = own.cost_yuan || Number(p.cost_yuan) || 0;
    const cu = own.cost_usd || Number(p.cost_usd) || 0;
    // Долговые партии (минус) закрываем: остаток вписан «как на полке»,
    // значит долга по товару больше нет. Иначе минус остался бы висеть внутри
    // и всплыл бы при следующем списании по FIFO.
    const positive = batches.filter(b => (Number(b.qty) || 0) > 0);
    const have = sumQty(positive);
    next = target > have ? returnToStock(positive, target - have, cy, cu) : positive;
  }
  const cc = costAfter(next, p);
  await writeStock(db, [{
    id: p.id, stock_qty: sumQty(next),
    cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches: next,
  }]);
  const bad = await verifyStock(db, { [p.id]: sumQty(next) });
  if (bad.length) throw new Error("Остаток не записался — проверьте связь и повторите");
  return { changed: diff, stock: sumQty(next) };
}

// Принять товар из магазина: зачисляем СРАЗУ и по НАШЕЙ складской цене.
// Цена магазина нас не касается — иначе себестоимость и прибыль поехали бы.
export async function receiveFromShop(db, items) {
  const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  if (!ids.length) return { written: 0 };
  const fresh = await readFresh(db, ids);
  const missing = ids.filter(id => !fresh[id]);
  if (missing.length) throw new Error("Товар не найден на складе (" + missing.length + " поз.)");

  const rows = [];
  for (const it of items) {
    const p = fresh[it.product_id];
    const qty = Number(it.qty) || 0;
    if (!p || qty <= 0) continue;
    const batches = ensureBatches(p);
    const own = currentCost(batches);
    const cy = own.cost_yuan || Number(p.cost_yuan) || 0;
    const cu = own.cost_usd || Number(p.cost_usd) || 0;
    const next = returnToStock(batches, qty, cy, cu);
    const cc = costAfter(next, p);
    rows.push({ id: p.id, stock_qty: sumQty(next), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches: next });
  }
  await writeStock(db, rows);
  // сверяем: остаток должен вырасти ровно на принятое
  const expected = Object.fromEntries(rows.map(r => [r.id, r.stock_qty]));
  const bad = await verifyStock(db, expected);
  if (bad.length) throw new Error("Остаток не записался (" + bad.length + " поз.) — проверьте связь и повторите");
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
