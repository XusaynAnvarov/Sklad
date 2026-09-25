// ========================================================================
//  ПРОВЕРКА СКЛАДА — что могло разойтись с остатками.
//  Один расчёт для склада на сайте и для склада в телефоне.
//
//  Ничего не чинит и ничего не пишет: только находит. Правит уже экран —
//  каждый по-своему, но список проблем у обоих обязан быть один, иначе
//  «на компьютере чисто, а в телефоне десять расхождений».
// ========================================================================
import { ensureBatches, sumQty, currentCost, costOutlook } from "./inventory.js?v=20260925c";
import { isIssued } from "./debt.js?v=20260925c";

// Накладная оформлена, но товар со склада не сняли.
//
// Отметку applied ставит тот, кто списывал. Но отметки не было до июля 2026,
// а накладные выписывались и раньше: в базе больше тысячи позиций без неё,
// и по ним склад ТРОГАЛИ — видно по записанной себестоимости, она берётся
// из партий в момент списания.
//
// Поэтому непроведённой считаем только ту позицию, где нет НИ отметки,
// НИ себестоимости. Иначе «Проверка склада» показывала бы сотню ложных
// тревог и предлагала списать тот же товар второй раз.
const списанаПозиция = (it) => it.applied === true || it.cogs_yuan != null || it.cogs_usd != null;

export function isUnapplied(s) {
  if (!s || s.status !== "final") return false;
  const items = s.items || [];
  return items.length > 0 && items.some(it => !списанаПозиция(it));
}

// Позиции накладной, которые РЕАЛЬНО списаны со склада. Только их возвращают
// при удалении или правке.
//
// Два признака, и нужны ОБА:
//
//  • applied === true — отметка, которую ставит тот, кто списывал. Она важнее
//    статуса: статус может откатиться (клиент нажимал старую кнопку
//    подтверждения в чате, и оформленная накладная снова становилась
//    заказом). Товар при этом оставался списанным, и удаление такого заказа
//    НЕ возвращало его на склад — остаток молча терялся.
//
//  • status === "final" — для накладных, выписанных до того, как отметка
//    вообще появилась. Таких в базе больше тысячи позиций: поля нет, а
//    себестоимость записана, то есть склад по ним трогали. Судить о них
//    только по отметке нельзя — их удаление тоже не вернуло бы товар.
//
// Явного applied: false в базе не бывает, поэтому оно здесь только как
// защита: если кто-то однажды напишет его осознанно, мы это уважим.
export const списанные = (sale) => {
  const позиции = (sale && sale.items) || [];
  const оформлена = !!sale && sale.status === "final";
  return позиции.filter(it => it.applied === true || (оформлена && it.applied !== false));
};

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
