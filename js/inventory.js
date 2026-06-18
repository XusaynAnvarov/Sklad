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
// гарантируем наличие стартовой партии (ленивая миграция из stock_qty+cost)
export function ensureBatches(p) {
  if (Array.isArray(p.batches) && p.batches.length) return p.batches.map(b => ({ ...b }));
  const q = Number(p.stock_qty) || 0;
  return q > 0 ? [{ qty: q, cost_yuan: Number(p.cost_yuan) || 0, cost_usd: Number(p.cost_usd) || 0, date: p.created_at || new Date().toISOString() }] : [];
}
// списать qty по FIFO → вернуть новые партии и себестоимость списания
export function consumeFIFO(batches, qty) {
  const list = (batches || []).map(b => ({ ...b }));
  let need = Number(qty) || 0, cogY = 0, cogU = 0;
  for (const b of list) {
    if (need <= 0) break;
    const take = Math.min(need, Number(b.qty) || 0);
    b.qty = (Number(b.qty) || 0) - take; need -= take;
    cogY += take * (Number(b.cost_yuan) || 0); cogU += take * (Number(b.cost_usd) || 0);
  }
  if (need > 0) { // не хватило — добиваем по последней цене
    const last = list[list.length - 1];
    cogY += need * (last ? Number(last.cost_yuan) || 0 : 0);
    cogU += need * (last ? Number(last.cost_usd) || 0 : 0);
  }
  return { batches: list.filter(b => (Number(b.qty) || 0) > 0.0001), cogY: r2(cogY), cogU: r2(cogU) };
}
// вернуть товар на склад (в НАЧАЛО — сохраняя FIFO-порядок), для отмены/удаления
export function returnToStock(batches, qty, cost_yuan, cost_usd, date) {
  const list = (batches || []).map(b => ({ ...b }));
  if ((Number(qty) || 0) > 0) list.unshift({ qty: Number(qty) || 0, cost_yuan: Number(cost_yuan) || 0, cost_usd: Number(cost_usd) || 0, date: date || new Date().toISOString() });
  return list;
}
