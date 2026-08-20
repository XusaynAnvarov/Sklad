// ========================================================================
//  ДОЛГ КЛИЕНТА — один расчёт на склад в браузере и на склад в телефоне.
//
//  Раньше он был написан дважды и разошёлся: на сайте в долг входил
//  «старый долг» (то, что клиент был должен до системы), а в телефоне нет.
//  Один и тот же клиент показывал разные цифры, и понять, какая верная,
//  было нельзя. Теперь считает одно место.
//
//  Правило: долг = все накладные + старый долг − оплаты, РАЗДЕЛЬНО по
//  валютам. Складывать валюты нельзя — курс меняется, и долг в долларах
//  растворился бы в сумовой сумме.
//
//  Флаг «оплачено» на накладной в расчёт не берём: единственный источник
//  истины — записи об оплатах. Иначе накладную можно пометить оплаченной,
//  не приняв денег, и долг исчезнет.
// ========================================================================

export const CURS = ["som", "usd", "yuan"];
export const zero = () => ({ som: 0, usd: 0, yuan: 0 });

// Порог «ноль»: в сумах копейки не считаем, в валюте — считаем.
const EPS = { som: 0.5, usd: 0.009, yuan: 0.009 };
export const hasDebt = (d) => CURS.some(c => (d && d[c] || 0) > EPS[c]);
export const isEmpty = (d) => !CURS.some(c => Math.abs(d && d[c] || 0) > EPS[c]);

// Заказ ещё не накладная. Пока он не подтверждён и товар не выдан, склад по
// нему не списан — значит и денег клиент за него не должен. Сайт считал
// такие заказы долгом, телефон не считал; сходились они только у клиентов
// без заказов. Считаем по факту выдачи — это те же статусы, по которым
// списывается склад (js/pages/sales.js).
const NOT_ISSUED = ["order", "pending_confirm", "confirmed", "draft"];
export const isIssued = (sale) => !NOT_ISSUED.includes(String((sale && sale.status) || ""));
export const issuedOnly = (sales) => (sales || []).filter(isIssued);

// Старый долг — то, что клиент был должен ещё до системы.
export function openingDebt(customer) {
  const o = (customer && customer.opening_debt) || {};
  return { som: Number(o.som) || 0, usd: Number(o.usd) || 0, yuan: Number(o.yuan) || 0 };
}

// Сумма накладных по валютам. Валюта берётся у позиции, а если её нет —
// у накладной: в одной накладной позиции могут быть в разных валютах.
export function turnoverByCur(sales) {
  const d = zero();
  issuedOnly(sales).forEach(s => (s.items || []).forEach(it => {
    const c = it.currency || s.currency;
    if (d[c] === undefined) return;
    d[c] += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
  }));
  return d;
}

export function paidByCur(payments) {
  const d = zero();
  (payments || []).forEach(p => { if (d[p.currency] !== undefined) d[p.currency] += Number(p.amount) || 0; });
  return d;
}

// Долг по валютам. Может уйти в минус — это аванс, мы должны клиенту.
export function debtByCur(custSales, custPays, customer) {
  const d = turnoverByCur(custSales);
  const od = openingDebt(customer);
  const pd = paidByCur(custPays);
  CURS.forEach(c => { d[c] += od[c] - pd[c]; });
  return d;
}

// Только долг, без аванса — для списков, где минус запутал бы.
export const onlyPositive = (o) => ({
  som: Math.max(0, (o && o.som) || 0),
  usd: Math.max(0, (o && o.usd) || 0),
  yuan: Math.max(0, (o && o.yuan) || 0),
});

// Аванс: сколько мы должны клиенту (переплата).
export const advance = (o) => ({
  som: Math.max(0, -((o && o.som) || 0)),
  usd: Math.max(0, -((o && o.usd) || 0)),
  yuan: Math.max(0, -((o && o.yuan) || 0)),
});

// Состояние каждой накладной по оплатам: оплаты гасят накладные
// старые-первыми, по валютам. Старый долг гасится раньше всех накладных —
// он самый давний. { id накладной: "paid" | "partial" | "debt" }
export function coverageMap(custSales, custPays, openDebt) {
  const pool = paidByCur(custPays);
  const od = openDebt || {};
  CURS.forEach(c => {
    pool[c] -= Math.max(0, Number(od[c]) || 0);
    if (pool[c] < 0) pool[c] = 0;
  });

  const asc = issuedOnly(custSales).sort((a, b) => new Date(a.date) - new Date(b.date));
  const map = {};
  for (const s of asc) {
    const need = turnoverByCur([s]);
    let anyNeed = false, allMet = true, tookAny = false;
    CURS.forEach(c => {
      if (need[c] <= 0.0001) return;
      anyNeed = true;
      const take = Math.min(pool[c], need[c]);
      pool[c] -= take;
      if (take > 0.0001) tookAny = true;
      if (take < need[c] - 0.01) allMet = false;
    });
    map[s.id] = !anyNeed ? "paid" : allMet ? "paid" : tookAny ? "partial" : "debt";
  }
  return map;
}
