// ========================================================================
//  Реальный статус накладной по оплатам (как бейдж на сайте).
//  Оплаты гасят «в долг» накладные старые-первыми, по каждой валюте.
//  → 'paid' | 'partial' | 'debt'
// ========================================================================
// Сводка долга для PDF накладной: сумма этой накладной, долг ДО неё и общий долг.
// Возвращает по валютам (знак: + долг клиента, − аванс/переплата клиенту).
//   { invoiceTotal, balanceBefore, balanceAfter }
export function invoiceDebtSummary(saleId, custSales, payments, openingDebt) {
  const CURS = ["som", "usd", "yuan"];
  const balanceAfter = { som: 0, usd: 0, yuan: 0 };
  // считаем только оформленные накладные (final) — как в акте сверки
  (custSales || []).forEach(s => {
    if (s.status && s.status !== "final") return;
    (s.items || []).forEach(it => {
      const c = it.currency || s.currency;
      if (balanceAfter[c] === undefined) return;
      balanceAfter[c] += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    });
  });
  const od = openingDebt || {};
  CURS.forEach(c => (balanceAfter[c] += Number(od[c]) || 0));
  (payments || []).forEach(p => { if (balanceAfter[p.currency] !== undefined) balanceAfter[p.currency] -= Number(p.amount) || 0; });

  const invoiceTotal = { som: 0, usd: 0, yuan: 0 };
  const sale = (custSales || []).find(s => String(s.id) === String(saleId));
  (sale?.items || []).forEach(it => {
    const c = it.currency || sale.currency;
    if (invoiceTotal[c] === undefined) return;
    invoiceTotal[c] += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
  });

  const balanceBefore = { som: 0, usd: 0, yuan: 0 };
  CURS.forEach(c => (balanceBefore[c] = balanceAfter[c] - invoiceTotal[c]));

  // последняя оплата клиента (сумма + валюта + дата) — для строки в PDF
  let lastPay = null;
  (payments || []).forEach(p => {
    if (!p.date) return;
    if (!lastPay || new Date(p.date) > new Date(lastPay.date)) lastPay = { amount: Number(p.amount) || 0, currency: p.currency, date: p.date };
  });

  return { invoiceTotal, balanceBefore, balanceAfter, lastPay };
}

// Разложить оплаты по накладным (та же логика, что и в статусе: старые гасятся первыми,
// перед ними — «старый долг» opening_debt).
// Возвращает Map: saleId → { totals, covereds, remainings } — КАЖДОЕ по валютам {som,usd,yuan}.
// Раньше суммы разных валют складывались в одно число: долг в долларах попадал
// в сумовую строку и превращался в бессмыслицу. Теперь каждая валюта отдельно.
// Скалярные total/covered/remaining оставлены для совместимости — это сумма
// в валюте накладной (s.currency), без смешивания.
export function allocatePayments(custSales, payments, openingDebt) {
  const CURS = ["som", "usd", "yuan"];
  const pool = { som: 0, usd: 0, yuan: 0 };
  (payments || []).forEach(p => { if (pool[p.currency] !== undefined) pool[p.currency] += Number(p.amount) || 0; });
  const od = openingDebt || {};
  CURS.forEach(c => { pool[c] -= Math.max(0, Number(od[c]) || 0); if (pool[c] < 0) pool[c] = 0; });

  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const out = new Map();
  const asc = [...(custSales || [])].filter(s => !s.status || s.status === "final")
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const s of asc) {
    const totals = { som: 0, usd: 0, yuan: 0 };
    (s.items || []).forEach(it => {
      const c = it.currency || s.currency;
      if (totals[c] !== undefined) totals[c] += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    });
    const covereds = { som: 0, usd: 0, yuan: 0 }, remainings = { som: 0, usd: 0, yuan: 0 };
    CURS.forEach(c => {
      if (totals[c] <= 0.0001) return;
      const take = Math.min(pool[c], totals[c]);
      pool[c] -= take;
      covereds[c] = r2(take);
      remainings[c] = r2(Math.max(0, totals[c] - take));
      totals[c] = r2(totals[c]);
    });
    const main = s.currency || "som";
    out.set(String(s.id), {
      totals, covereds, remainings,
      total: totals[main] || 0, covered: covereds[main] || 0, remaining: remainings[main] || 0,
    });
  }
  return out;
}

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
