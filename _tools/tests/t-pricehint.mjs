// ========================================================================
//  ПОДСКАЗКА ПРОШЛОЙ ЦЕНЫ в редакторе накладной.  node _tools/tests/t-pricehint.mjs
//
//  Жалоба владельца: «не показывает последнюю купленную цену у всех клиентов».
//
//  Расчёт был верный — на боевых данных для «Сирож Акам» и «Яшил аппарат»
//  он давал ¥37, «его цена от 29.08.2026». Ломалось ОТОБРАЖЕНИЕ: цены
//  грузятся из базы не мгновенно, строку под полем цены рисует refreshAdd(),
//  а загрузка звала только drawCart(). Владелец выбирал товар, потом
//  клиента — и подсказка навсегда оставалась той, что посчиталась ДО
//  выбора клиента, то есть общей.
// ========================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const КОРЕНЬ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ч = (f) => readFileSync(join(КОРЕНЬ, f), "utf8");

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ---------- сам расчёт ----------
{
  const { freshFirst, lastForCustomerMap, lastAnyMap, suggestPrice, priceNote } =
    await import(new URL("../../js/prices.js", import.meta.url));

  // Тот же случай, что на боевом складе: в один день товар ушёл и этому
  // клиенту (¥37), и другому — позже и дороже (108 000 сум). Общей ценой
  // становится последняя продажа кому угодно, то есть цена другого.
  const продажи = [
    { id: "s2", customer_id: "маруф", status: "final", date: "2026-08-29T15:00:00Z",
      items: [{ product_id: "яшил", qty: 40, unit_price: 108000, currency: "som" }] },
    { id: "s1", customer_id: "сирож", status: "final", date: "2026-08-29T13:17:00Z",
      items: [{ product_id: "яшил", qty: 8, unit_price: 37, currency: "yuan" }] },
  ];
  const свежие = freshFirst(продажи);
  const свои = lastForCustomerMap(свежие, "сирож");
  const общие = lastAnyMap(свежие);

  const его = suggestPrice("яшил", { ownMap: свои, anyMap: общие });
  ok("своя цена клиента находится: " + его.price + " " + его.currency, его.price === 37 && его.own === true);
  ok("и подписана как своя: " + priceNote(его), priceNote(его).startsWith("его цена от"));

  // Клиент, который этот товар не брал, получает общую цену.
  const чужой = suggestPrice("яшил", { ownMap: lastForCustomerMap(свежие, "умар"), anyMap: общие });
  ok("кто не брал — получает общую цену", чужой.price === 108000 && чужой.own === false);
  ok("и она подписана как общая", priceNote(чужой).startsWith("общая цена от"));
}

// ---------- отображение ----------
{
  const s = ч("js/pages/sales.js");
  ok("после загрузки цен перерисовывается чек", /loadLastPrices[\s\S]{0,700}?drawCart\(\);/.test(s));
  ok("и строка под полем цены тоже", /loadLastPrices[\s\S]{0,700}?refreshAdd\(\);/.test(s));

  // Пока считали одного клиента, владелец мог выбрать другого —
  // старый ответ не должен затирать новый.
  ok("устаревший ответ отбрасывается", s.includes("if (кому !== state.customer_id) return;"));
  ok("запомнили, для кого считали", s.includes("const кому = state.customer_id;"));

  ok("обе карты цен берутся одним расчётом", s.includes("ctx.db.priceHints(кому)"));
  ok("подсказка подписывает, чья это цена", s.includes("li.own ?"));
}

// ---------- телефон считает так же ----------
{
  const тел = ч("js/sklad/screens/sale.js");
  ok("телефон берёт тот же расчёт", тел.includes('from "../../prices.js'));
  // Там продажи загружены заранее и карта считается на месте — гонки нет.
  ok("в телефоне подсказка считается без запроса", тел.includes("const hintFor = (productId) =>"));
}

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nПОДСКАЗКА ЦЕНЫ ПОКАЗЫВАЕТ ЦЕНУ ЭТОГО КЛИЕНТА");
process.exit(плохо ? 1 : 0);
