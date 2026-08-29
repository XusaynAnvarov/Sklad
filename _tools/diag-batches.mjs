// ========================================================================
//  РАЗБОР ПАРТИЙ И СЕБЕСТОИМОСТИ — только читает, ничего не меняет.
//
//  Запускать НА СЕРВЕРЕ, из папки приложения:
//      node _tools/diag-batches.mjs
//  Ключ базы берётся из .env и никуда не отправляется.
//
//  Ищет:
//    • остаток в карточке не сходится с суммой партий;
//    • партии стоят не по датам (новая раньше старой) — тогда дорогой
//      товар продаётся раньше дешёвого и себестоимость завышена;
//    • нулевую себестоимость при непустом складе;
//    • «долговые» партии с отрицательным количеством.
// ========================================================================
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const КОРЕНЬ = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env читаем сами: сервер запускается через pm2, переменных в консоли нет
function env() {
  const из = {};
  try {
    for (const строка of readFileSync(join(КОРЕНЬ, ".env"), "utf8").split("\n")) {
      const i = строка.indexOf("=");
      if (i > 0 && !строка.trim().startsWith("#")) из[строка.slice(0, i).trim()] = строка.slice(i + 1).trim();
    }
  } catch { }
  return { ...из, ...process.env };
}
const E = env();
const URL_БАЗЫ = (E.SUPABASE_URL || "").replace(/\/+$/, "");
const КЛЮЧ = E.SUPABASE_SERVICE_KEY;
if (!URL_БАЗЫ || !КЛЮЧ) { console.error("Нет SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(1); }

async function все(таблица, поля) {
  const строки = [];
  for (let стр = 0; стр < 200; стр++) {
    const r = await fetch(`${URL_БАЗЫ}/rest/v1/${таблица}?select=${поля}&limit=1000&offset=${строки.length}`,
      { headers: { apikey: КЛЮЧ, Authorization: "Bearer " + КЛЮЧ } });
    if (!r.ok) throw new Error(таблица + ": " + r.status + " " + (await r.text()).slice(0, 200));
    const часть = await r.json();
    if (!часть.length) break;
    строки.push(...часть);
    if (часть.length < 1000) break;
  }
  return строки;
}

const ч = (n) => Math.round((Number(n) || 0) * 100) / 100;
const сумма = (bs) => (bs || []).reduce((s, b) => s + (Number(b.qty) || 0), 0);
const дата = (b) => Date.parse(b && b.date) || 0;

const товары = await все("products", "id,name,sku,stock_qty,cost_yuan,cost_usd,batches");
console.log("Товаров в базе:", товары.length);

const беды = { расхождение: [], порядок: [], ноль: [], минус: [] };

for (const p of товары) {
  const bs = Array.isArray(p.batches) ? p.batches : [];
  const остаток = Number(p.stock_qty) || 0;

  if (bs.length && Math.abs(сумма(bs) - остаток) > 0.001)
    беды.расхождение.push({ p, вКарточке: остаток, поПартиям: ч(сумма(bs)) });

  // партии должны идти от старых к новым: первой продаётся верхняя
  const сДатами = bs.filter(b => (Number(b.qty) || 0) > 0 && дата(b));
  for (let i = 1; i < сДатами.length; i++) {
    if (дата(сДатами[i]) < дата(сДатами[i - 1])) {
      беды.порядок.push({
        p,
        первая: `${сДатами[0].qty} × ¥${ч(сДатами[0].cost_yuan)} · ${String(сДатами[0].date).slice(0, 10)}`,
        старейшая: (() => { const s = [...сДатами].sort((a, b) => дата(a) - дата(b))[0];
          return `${s.qty} × ¥${ч(s.cost_yuan)} · ${String(s.date).slice(0, 10)}`; })(),
      });
      break;
    }
  }

  const естьПоложительные = bs.some(b => (Number(b.qty) || 0) > 0);
  if (естьПоложительные && !(Number(p.cost_yuan) > 0) && !(Number(p.cost_usd) > 0))
    беды.ноль.push({ p });

  const долг = bs.filter(b => (Number(b.qty) || 0) < 0);
  if (долг.length) беды.минус.push({ p, сколько: ч(долг.reduce((s, b) => s + Number(b.qty), 0)) });
}

const строка = (x) => `    ${x.p.name}${x.p.sku ? " [" + x.p.sku + "]" : ""}`;

console.log("\n=== 1. ПАРТИИ НЕ ПО ДАТАМ (дорогое продаётся раньше дешёвого):", беды.порядок.length);
беды.порядок.slice(0, 25).forEach(x =>
  console.log(строка(x) + "\n        продаётся: " + x.первая + "   а должна: " + x.старейшая));
if (беды.порядок.length > 25) console.log("    … и ещё " + (беды.порядок.length - 25));

console.log("\n=== 2. ОСТАТОК НЕ СХОДИТСЯ С ПАРТИЯМИ:", беды.расхождение.length);
беды.расхождение.slice(0, 25).forEach(x =>
  console.log(строка(x) + `   в карточке ${x.вКарточке}, по партиям ${x.поПартиям}`));
if (беды.расхождение.length > 25) console.log("    … и ещё " + (беды.расхождение.length - 25));

console.log("\n=== 3. НУЛЕВАЯ СЕБЕСТОИМОСТЬ ПРИ НЕПУСТОМ СКЛАДЕ:", беды.ноль.length);
беды.ноль.slice(0, 25).forEach(x => console.log(строка(x)));
if (беды.ноль.length > 25) console.log("    … и ещё " + (беды.ноль.length - 25));

console.log("\n=== 4. ДОЛГОВЫЕ ПАРТИИ (минус):", беды.минус.length);
беды.минус.slice(0, 25).forEach(x => console.log(строка(x) + `   ${x.сколько}`));
if (беды.минус.length > 25) console.log("    … и ещё " + (беды.минус.length - 25));

// ---------- подробно по названию, если передали ----------
const искать = process.argv[2];
if (искать) {
  console.log("\n=== ПОДРОБНО: «" + искать + "» ===");
  const найдено = товары.filter(p => (p.name || "").toLowerCase().includes(искать.toLowerCase()));
  if (!найдено.length) console.log("  не найден");
  for (const p of найдено) {
    console.log(`\n  ${p.name}${p.sku ? " [" + p.sku + "]" : ""}`);
    console.log(`    остаток в карточке: ${p.stock_qty}`);
    console.log(`    себестоимость: ¥${ч(p.cost_yuan)} / $${ч(p.cost_usd)}`);
    const bs = Array.isArray(p.batches) ? p.batches : [];
    console.log(`    партии (в том порядке, в каком продаются): ${bs.length}`);
    bs.forEach((b, i) => console.log(
      `      ${i + 1}) ${b.qty} × ¥${ч(b.cost_yuan)} · ${String(b.date || "—").slice(0, 10)}${b.shortage ? "  (долг)" : ""}`));
    console.log(`    сумма партий: ${ч(сумма(bs))}`);
  }
}
