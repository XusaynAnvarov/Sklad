// ========================================================================
//  ЧТО СКЛАД ДОЛЖЕН ПОЛУЧИТЬ ПОСЛЕ ПРАВКИ НАКЛАДНОЙ.
//
//  Правка идёт в два шага: сперва ВЕРНУТЬ то, что накладная списала
//  раньше, потом СПИСАТЬ то, что в ней теперь. Порядок важен, и важно,
//  чтобы между шагами остаток шёл за партиями: 29 сентября 2026 этого не
//  было — возврат срезался как «лишний», и накладная списала товар
//  второй раз. У «Дазмол крышка» остаток ушёл в −20, хотя его никто не
//  трогал.
//
//  Здесь только расчёт, без записи — поэтому проверяется тестом.
// ========================================================================
import { consumeFIFO, returnToStock, ensureBatches, sumQty, costAfter } from "./inventory.js?v=20261010g";
import { списанные } from "./stockcheck.js?v=20261010g";

// товары   — карточки со склада (свежие), { id → товар }
// старая   — накладная ДО правки (или null, если накладная новая)
// позиции  — что в накладной теперь
// Возвращает { rows, cogs, ненайденные }:
//   rows  — что записать по каждому товару
//   cogs  — списанная себестоимость по каждой позиции (её пишут в накладную)
export function пересчитатьСклад({ товары, старая, позиции, дата }) {
  const карта = new Map(Object.entries(товары || {}));
  const затронуты = new Set([
    ...(((старая && старая.items) || []).map(i => i.product_id)),
    ...((позиции || []).map(i => i.product_id)),
  ].filter(Boolean));

  const рабочие = new Map();
  const взять = (id) => {
    if (рабочие.has(id)) return рабочие.get(id);
    const p = карта.get(String(id));
    if (!p) return null;
    const копия = { ...p, batches: ensureBatches(p) };
    копия.stock_qty = sumQty(копия.batches);
    рабочие.set(id, копия);
    return копия;
  };

  // 1. ВЕРНУТЬ то, что эта накладная списывала раньше
  for (const it of списанные(старая)) {
    const p = взять(it.product_id); if (!p) continue;
    const кол = Number(it.qty) || 0;
    const заШт = кол ? (Number(it.cogs_yuan) || 0) / кол : (Number(p.cost_yuan) || 0);
    const заШтД = кол ? (Number(it.cogs_usd) || 0) / кол : (Number(p.cost_usd) || 0);
    p.batches = returnToStock(p.batches, кол, заШт, заШтД, старая.date || дата);
    p.stock_qty = sumQty(p.batches);       // остаток шаг в шаг за партиями
  }

  // 2. СПИСАТЬ то, что в накладной теперь
  const cogs = {};
  for (const it of (позиции || [])) {
    const p = взять(it.product_id); if (!p) continue;
    const r = consumeFIFO(p.batches, Number(it.qty) || 0);
    p.batches = r.batches;
    p.stock_qty = sumQty(r.batches);
    const прежде = cogs[it.product_id] || { cogs_yuan: 0, cogs_usd: 0 };
    cogs[it.product_id] = { cogs_yuan: прежде.cogs_yuan + r.cogY, cogs_usd: прежде.cogs_usd + r.cogU };
    it.cogs_yuan = r.cogY; it.cogs_usd = r.cogU; it.applied = true;
  }

  const rows = [];
  const ненайденные = [];
  for (const id of затронуты) {
    const p = рабочие.get(id) || (карта.has(String(id)) ? взять(id) : null);
    if (!p) { ненайденные.push(id); continue; }
    const cc = costAfter(p.batches || [], p);
    rows.push({ id: p.id, stock_qty: sumQty(p.batches || []), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches: p.batches });
  }
  return { rows, cogs, ненайденные };
}
