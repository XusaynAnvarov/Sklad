// ========================================================================
//  ПРОВЕРКА СКЛАДА — что могло разойтись с остатками.
//  Один расчёт для склада на сайте и для склада в телефоне.
//
//  Ничего не чинит и ничего не пишет: только находит. Правит уже экран —
//  каждый по-своему, но список проблем у обоих обязан быть один, иначе
//  «на компьютере чисто, а в телефоне десять расхождений».
// ========================================================================
import { ensureBatches, sumQty, currentCost, costOutlook } from "./inventory.js?v=20260821i";
import { isIssued } from "./debt.js?v=20260821i";

// Накладная оформлена, но товар со склада не сняли.
// Отметку applied ставит тот, кто списывал; её отсутствие значит, что
// списания не было — или что накладную записал кто-то, кто про отметку забыл.
export function isUnapplied(s) {
  if (!s || s.status !== "final") return false;
  const items = s.items || [];
  return items.length > 0 && items.some(it => it.applied !== true);
}

export function findProblems(products, sales) {
  const goods = products || [], docs = sales || [];

  // A. накладные без списания — свежие сверху
  const unapplied = docs.filter(isUnapplied).sort((a, b) => new Date(b.date) - new Date(a.date));

  // B. остаток не сходится с суммой партий (обычно после ручных правок)
  const mismatch = goods.filter(p => sumQty(ensureBatches(p)) !== (Number(p.stock_qty) || 0));

  // C. продали больше, чем было
  const negative = goods.filter(p => (Number(p.stock_qty) || 0) < 0)
    .sort((a, b) => (Number(a.stock_qty) || 0) - (Number(b.stock_qty) || 0));

  // D. себестоимость товара разошлась с ценой старейшей партии.
  // Так осталось от старого поведения: приход сразу перезаписывал цену на
  // новую, хотя старая — дешёвая — партия ещё лежала на складе.
  const costOff = goods.map(p => {
    const bs = ensureBatches(p);
    if (!bs.some(b => (Number(b.qty) || 0) > 0)) return null;       // склад пуст — цену не трогаем
    const now = currentCost(bs);
    const off = Math.abs((Number(p.cost_yuan) || 0) - now.cost_yuan) > 0.001
             || Math.abs((Number(p.cost_usd) || 0) - now.cost_usd) > 0.001;
    return off ? { p, was: { cost_yuan: Number(p.cost_yuan) || 0, cost_usd: Number(p.cost_usd) || 0 }, now, batches: bs } : null;
  }).filter(Boolean);

  // E. следующая партия дороже цены продажи: пока продаём старую — всё хорошо,
  // но как только она кончится, начнём торговать в убыток
  const nextTooPricey = goods.map(p => {
    const price = Number(p.price_yuan) || 0;
    if (price <= 0) return null;
    const o = costOutlook(ensureBatches(p));
    if (!o || !o.next || o.next.cost_yuan <= price) return null;
    return { p, o, price };
  }).filter(Boolean).sort((a, b) => (b.o.next.cost_yuan - b.price) - (a.o.next.cost_yuan - a.price));

  // F. заказы, по которым склад ещё не трогали — это норма, просто напоминание
  const pending = docs.filter(s => !isIssued(s));

  const total = unapplied.length + mismatch.length + negative.length + costOff.length + nextTooPricey.length;
  return { unapplied, mismatch, negative, costOff, nextTooPricey, pending, total, allGood: total === 0 };
}
