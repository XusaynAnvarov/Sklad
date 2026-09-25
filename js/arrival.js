// ========================================================================
//  ОПРИХОДОВАНИЕ — товар с поступления попадает на склад.
//  Один расчёт для склада на сайте и для склада в телефоне.
//
//  Главное правило: себестоимость НЕ перескакивает на цену нового прихода.
//  Пока на полке лежит старая партия, продаётся именно она — значит и цена
//  показывается её. Новая цена вступит в силу сама, когда FIFO доест
//  старую партию. Иначе прибыль по старому товару считалась бы по новой
//  цене и врала.
// ========================================================================
import { ensureBatches, sumQty, costAfter, currentCost } from "./inventory.js?v=20260925c";
import { convert } from "./fx.js?v=20260925c";
import { isShop } from "./purchase.js?v=20260925c";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Зачислить пришедшее на склад.
// Порядок важен: сперва закрываем «долговые» партии (отрицательные — это
// товар, который продали, когда его уже не было), и лишь остаток кладём
// новой партией В КОНЕЦ очереди, чтобы старые запасы продавались первыми.
export function зачислить(batches, qty, cost_yuan, cost_usd, when, откуда) {
  const список = (batches || []).map(b => ({ ...b }));
  let осталось = Number(qty) || 0;

  for (const b of список) {
    if (осталось <= 0) break;
    const q = Number(b.qty) || 0;
    if (q >= 0) continue;                       // долги идут первыми
    const покрыть = Math.min(осталось, -q);
    b.qty = q + покрыть;
    осталось -= покрыть;
  }

  const оставить = список.filter(b => Math.abs(Number(b.qty) || 0) > 0.0001);
  if (осталось > 0.0001) {
    // откуда — номер поступления. По нему видно, что этот приход уже
    // зачислен, и повторное нажатие не задваивает остаток.
    оставить.push({ qty: осталось, cost_yuan, cost_usd, date: when || new Date().toISOString(), ...(откуда ? { src: откуда } : {}) });
  }
  return оставить;
}

// Что записать по каждому товару поступления. Ничего не пишет — только считает,
// поэтому проверяется тестом без базы.
export function arrivalRows(purchase, products) {
  const shop = isShop(purchase);
  const when = purchase.date || new Date().toISOString();
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const rows = [];

  for (const it of (purchase.items || [])) {
    const p = pmap[it.product_id];
    if (!p) continue;
    const cur = it.currency || purchase.currency;
    const batches = ensureBatches(p);
    // Этот товар из этого же поступления уже зачислен — второй раз не кладём.
    // Оприходование сорвалось на середине (закрыли вкладку, оборвалась связь)
    // — жмём «Оприходовать» снова, и допишется только то, чего не хватает.
    if (purchase.id && batches.some(b => b && b.src === purchase.id)) continue;
    const own = currentCost(batches);

    // Из магазина берём НАШУ складскую цену: сколько отдали в магазине —
    // наше дело, но если записать ту цену, себестоимость и прибыль поедут.
    //
    // ВАЖНО про запасной путь. Когда товар КОНЧИЛСЯ, партий не остаётся, и
    // currentCost честно отвечает нулём — брать цену неоткуда. Раньше этот
    // ноль и записывался: приход из магазина обнулял себестоимость товара.
    // А из магазина докупают ровно то, что кончилось, — поэтому попадало
    // почти каждый раз. Берём последнюю известную цену из карточки товара.
    const своя = {
      cost_yuan: own.cost_yuan || Number(p.cost_yuan) || 0,
      cost_usd: own.cost_usd || Number(p.cost_usd) || 0,
    };
    // У поставщика цена приходит из накладной. Если её не вписали, ноль
    // записывать тоже нельзя — оставляем то, что знали о товаре раньше.
    const отПоставщика = {
      cost_yuan: r2(convert(it.unit_cost, cur, "yuan")) || Number(p.cost_yuan) || 0,
      cost_usd: r2(convert(it.unit_cost, cur, "usd")) || Number(p.cost_usd) || 0,
    };
    const cy = shop ? своя.cost_yuan : отПоставщика.cost_yuan;
    const cu = shop ? своя.cost_usd : отПоставщика.cost_usd;
    // Приход СНАЧАЛА ГАСИТ ДОЛГ, и только остаток становится новой партией.
    // Раньше долг оставался висеть отдельной строкой рядом с приходом:
    // общее количество сходилось, но себестоимость система брала с первой
    // ПОЛОЖИТЕЛЬНОЙ партии, и на складе с долгом −60 и старыми 900 шт по
    // ¥12,5 она показывала цену мелкой новой партии, а не настоящую.
    const next = зачислить(batches, Number(it.qty) || 0, cy, cu, when, purchase.id);
    const cc = costAfter(next, { cost_yuan: cy, cost_usd: cu });

    const row = { id: p.id, stock_qty: sumQty(next), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches: next };
    // last_arrival_at поднимает товар в начало каталога и метит новинкой.
    // Приход из магазина — пополнение, а не новинка: давно продающийся товар
    // не должен всплывать наверх после каждой добавки.
    if (!shop) row.last_arrival_at = new Date().toISOString();
    rows.push(row);
    // держим объект товара в списке в согласии с тем, что записали
    p.batches = next; p.cost_yuan = cc.cost_yuan; p.cost_usd = cc.cost_usd; p.stock_qty = row.stock_qty;
  }
  return rows;
}

// Записать пакетом, одним запросом. Поштучно 43 позиции пишутся полминуты:
// выглядит как «зависло», владелец закрывает вкладку или жмёт ещё раз — и
// половина прихода остаётся незачисленной, а половина попадает дважды.
// Если пакет не прошёл — пробуем без партий и лишь потом по одному,
// и обязательно сообщаем об ошибке наверх.
export async function записатьПачкой(db, rows, наПрогресс) {
  if (!rows.length) return 0;
  const безПартий = () => rows.map(({ batches, ...rest }) => rest);
  if (typeof db.products.upsertMany === "function") {
    try { await db.products.upsertMany(rows); if (наПрогресс) наПрогресс(rows.length, rows.length); return rows.length; } catch { }
    try { await db.products.upsertMany(безПартий()); if (наПрогресс) наПрогресс(rows.length, rows.length); return rows.length; } catch { }
  }
  let n = 0;
  for (const row of rows) {
    try { await db.products.upsert(row); }
    catch { const { batches, ...noBatches } = row; await db.products.upsert(noBatches); }
    if (наПрогресс) наПрогресс(++n, rows.length);
  }
  return rows.length;
}

export async function applyArrival(db, purchase, products, наПрогресс) {
  const rows = arrivalRows(purchase, products);
  return записатьПачкой(db, rows, наПрогресс);
}

// Снять зачисление этого поступления: убираем ровно те партии, которые он
// положил (по метке src). Старые приходы метки не имеют — для них, как и
// раньше, списываем количество позиции по очереди (FIFO).
export function откатитьПриход(purchase, products, consumeFIFO) {
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const rows = [];
  for (const it of (purchase.items || [])) {
    const p = pmap[it.product_id];
    if (!p) continue;
    const batches = ensureBatches(p);
    const свои = purchase.id ? batches.filter(b => b && b.src === purchase.id) : [];
    let next;
    if (свои.length) {
      // убираем одну партию этого прихода — последнюю из положенных
      const лишняя = свои[свои.length - 1];
      let убрали = false;
      next = batches.filter(b => (b === лишняя && !убрали ? (убрали = true, false) : true));
    } else {
      next = consumeFIFO(batches, Number(it.qty) || 0).batches;
    }
    const cc = costAfter(next, p);
    rows.push({ id: p.id, stock_qty: sumQty(next), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches: next });
    p.batches = next; p.stock_qty = sumQty(next);
  }
  return rows;
}
