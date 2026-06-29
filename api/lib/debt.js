// ========================================================================
//  Реальный статус накладной по оплатам (как бейдж на сайте).
//  Оплаты гасят «в долг» накладные старые-первыми, по каждой валюте.
//  → 'paid' | 'partial' | 'debt'
// ========================================================================
export function invoiceCoverageStatus(saleId, custSales, payments, openingDebt) {
  const pool = { som: 0, usd: 0, yuan: 0 };
  (payments || []).forEach(p => { if (pool[p.currency] !== undefined) pool[p.currency] += Number(p.amount) || 0; });
  // старый долг (до системы) — самая старая задолженность, гасится оплатами ПЕРВЫМ
  const od = openingDebt || {};
  ["som", "usd", "yuan"].forEach(c => { pool[c] -= Math.max(0, Number(od[c]) || 0); if (pool[c] < 0) pool[c] = 0; });
  const asc = [...(custSales || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const s of asc) {
    // оплаты гасят накладные по очереди (старые первыми); флаг «оплачено» не учитываем — статус по оплатам
    const need = { som: 0, usd: 0, yuan: 0 };
    (s.items || []).forEach(it => { const c = it.currency || s.currency; if (need[c] !== undefined) need[c] += it.qty * it.unit_price; });
    let anyNeed = false, allMet = true, tookAny = false;
    ["som", "usd", "yuan"].forEach(c => {
      if (need[c] <= 0.0001) return; anyNeed = true;
      const take = Math.min(pool[c], need[c]); pool[c] -= take;
      if (take > 0.0001) tookAny = true;
      if (take < need[c] - 0.01) allMet = false;
    });
    const st = !anyNeed ? "paid" : allMet ? "paid" : tookAny ? "partial" : "debt";
    if (String(s.id) === String(saleId)) return st;
  }
  return "debt";
}
