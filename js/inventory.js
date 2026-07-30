// ========================================================================
//  FIFO-партии склада. Партия: { qty, cost_yuan, cost_usd, date }.
//  Старые партии (раньше по дате/порядку) списываются первыми.
// ========================================================================
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function sumQty(batches) {
  return (batches || []).reduce((t, b) => t + (Number(b.qty) || 0), 0);
}
// текущая (старейшая непустая) себестоимость
export function currentCost(batches) {
  const b = (batches || []).find(x => (Number(x.qty) || 0) > 0) || (batches || [])[0];
  return b ? { cost_yuan: Number(b.cost_yuan) || 0, cost_usd: Number(b.cost_usd) || 0 } : { cost_yuan: 0, cost_usd: 0 };
}
// себестоимость для сохранения: из партий, а если склад пуст — СОХРАНЯЕМ прежнюю цену (не обнуляем)
export function costAfter(batches, prev) {
  if ((batches || []).some(b => (Number(b.qty) || 0) > 0)) return currentCost(batches);
  return { cost_yuan: Number(prev && prev.cost_yuan) || 0, cost_usd: Number(prev && prev.cost_usd) || 0 };
}
// гарантируем наличие стартовой партии (ленивая миграция из stock_qty+cost).
// ВАЖНО: отрицательный остаток («минус» — продали больше, чем было) тоже переносим
// в партию, иначе он молча превращался в 0: минус исчезал сам собой, а при удалении
// накладной на склад возвращался товар, которого нет.
export function ensureBatches(p) {
  if (Array.isArray(p.batches) && p.batches.length) return p.batches.map(b => ({ ...b }));
  const q = Number(p.stock_qty) || 0;
  if (q === 0) return [];
  const base = { qty: q, cost_yuan: Number(p.cost_yuan) || 0, cost_usd: Number(p.cost_usd) || 0, date: p.created_at || new Date().toISOString() };
  return q > 0 ? [base] : [{ ...base, shortage: true }];
}
// списать qty по FIFO → вернуть новые партии и себестоимость списания.
// Если товара не хватает — уходим В МИНУС: остаётся «долговая» партия с отрицательным qty,
// поэтому остаток показывает, сколько товара мы должны (например −84). Приход её погашает.
export function consumeFIFO(batches, qty) {
  const list = (batches || []).map(b => ({ ...b }));
  let need = Number(qty) || 0, cogY = 0, cogU = 0;
  for (const b of list) {
    if (need <= 0) break;
    const have = Number(b.qty) || 0;
    if (have <= 0) continue;                 // пустые и «долговые» партии пропускаем
    const take = Math.min(need, have);
    b.qty = have - take; need -= take;
    cogY += take * (Number(b.cost_yuan) || 0); cogU += take * (Number(b.cost_usd) || 0);
  }
  const kept = list.filter(b => Math.abs(Number(b.qty) || 0) > 0.0001);
  if (need > 0) { // не хватило — считаем по последней известной цене и уходим в минус
    const ref = [...list].reverse().find(b => (Number(b.cost_yuan) || 0) > 0 || (Number(b.cost_usd) || 0) > 0) || list[list.length - 1];
    const cy = ref ? Number(ref.cost_yuan) || 0 : 0, cu = ref ? Number(ref.cost_usd) || 0 : 0;
    cogY += need * cy; cogU += need * cu;
    const debt = kept.find(b => (Number(b.qty) || 0) < 0);
    if (debt) debt.qty = (Number(debt.qty) || 0) - need;   // уже были должны — увеличиваем долг
    else kept.push({ qty: -need, cost_yuan: cy, cost_usd: cu, date: new Date().toISOString(), shortage: true });
  }
  return { batches: kept, cogY: r2(cogY), cogU: r2(cogU) };
}
// вернуть товар на склад (в НАЧАЛО — сохраняя FIFO-порядок), для отмены/удаления
export function returnToStock(batches, qty, cost_yuan, cost_usd, date) {
  const list = (batches || []).map(b => ({ ...b }));
  if ((Number(qty) || 0) > 0) list.unshift({ qty: Number(qty) || 0, cost_yuan: Number(cost_yuan) || 0, cost_usd: Number(cost_usd) || 0, date: date || new Date().toISOString() });
  return list;
}
