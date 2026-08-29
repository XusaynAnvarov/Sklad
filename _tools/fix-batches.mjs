// ========================================================================
//  ПРИВЕСТИ ПАРТИИ В ПОРЯДОК — разовый пересчёт уже накопленного.
//
//  Что чинит:
//    1) долговые партии (минус), которые не погасились приходом;
//    2) порядок партий — должны идти от старых к новым, иначе дорогой
//       товар продаётся раньше дешёвого и себестоимость завышена;
//    3) себестоимость в карточке — по первой партии в очереди.
//
//  ОБЩЕЕ КОЛИЧЕСТВО НЕ МЕНЯЕТСЯ НИКОГДА. Пересчёт только переставляет и
//  схлопывает партии; если сумма хоть на копейку разойдётся — товар
//  пропускается и попадает в отчёт.
//
//  Запускать НА СЕРВЕРЕ, из папки приложения:
//      node _tools/fix-batches.mjs            — только показать
//      node _tools/fix-batches.mjs --записать — применить
// ========================================================================
import { readFileSync, writeFileSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const КОРЕНЬ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ПИСАТЬ = process.argv.includes("--записать");

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
const ЗАГОЛОВКИ = { apikey: КЛЮЧ, Authorization: "Bearer " + КЛЮЧ, "Content-Type": "application/json" };

async function всеТовары() {
  const строки = [];
  for (let i = 0; i < 200; i++) {
    const r = await fetch(`${URL_БАЗЫ}/rest/v1/products?select=id,name,sku,stock_qty,cost_yuan,cost_usd,batches&limit=1000&offset=${строки.length}`, { headers: ЗАГОЛОВКИ });
    if (!r.ok) throw new Error("Чтение: " + r.status + " " + (await r.text()).slice(0, 200));
    const часть = await r.json();
    if (!часть.length) break;
    строки.push(...часть);
    if (часть.length < 1000) break;
  }
  return строки;
}

const ч = (n) => Math.round((Number(n) || 0) * 100) / 100;
const сумма = (bs) => ч((bs || []).reduce((s, b) => s + (Number(b.qty) || 0), 0));
const дата = (b) => Date.parse(b && b.date) || 0;

// Пересобрать партии: по датам, долги гасятся самыми ранними приходами.
export function пересобрать(партии) {
  const было = (партии || []).map(b => ({ ...b, qty: Number(b.qty) || 0 }))
    .filter(b => Math.abs(b.qty) > 0.0001);
  if (!было.length) return [];

  // по датам: сперва старые. Без даты — считаем самыми ранними.
  const поПорядку = [...было].sort((a, b) => дата(a) - дата(b));

  const долги = поПорядку.filter(b => b.qty < 0);
  const приходы = поПорядку.filter(b => b.qty > 0);
  let долг = -долги.reduce((s, b) => s + b.qty, 0);      // положительное число

  const итог = [];
  for (const b of приходы) {
    if (долг <= 0.0001) { итог.push({ ...b }); continue; }
    const покрыть = Math.min(долг, b.qty);
    долг -= покрыть;
    const остаток = ч(b.qty - покрыть);
    if (остаток > 0.0001) итог.push({ ...b, qty: остаток });
  }
  // приходов не хватило — долг остаётся, по цене самого раннего долга
  if (долг > 0.0001) итог.push({ ...долги[0], qty: ч(-долг), shortage: true });
  return итог;
}

// Разбор и запись — только при прямом запуске. Тест подключает файл,
// чтобы проверить пересобрать(), и до базы дело доходить не должно.
async function главное() {
const товары = await всеТовары();
console.log(`Товаров: ${товары.length}\nРежим: ${ПИСАТЬ ? "ЗАПИСЫВАЮ" : "только показываю"}\n`);

const кПравке = [], пропущены = [];

for (const p of товары) {
  const было = Array.isArray(p.batches) ? p.batches : [];
  if (!было.length) continue;

  const стало = пересобрать(было);

  // Количество обязано совпасть до копейки. Иначе не трогаем вовсе.
  if (Math.abs(сумма(стало) - сумма(было)) > 0.001) {
    пропущены.push({ p, было: сумма(было), стало: сумма(стало) });
    continue;
  }

  const первая = стало.find(b => b.qty > 0) || стало[0];
  const новаяЦена = { cost_yuan: ч(первая ? первая.cost_yuan : p.cost_yuan), cost_usd: ч(первая ? первая.cost_usd : p.cost_usd) };

  const порядокИзменился = JSON.stringify(было.map(b => [ч(b.qty), ч(b.cost_yuan), String(b.date || "").slice(0, 10)]))
    !== JSON.stringify(стало.map(b => [ч(b.qty), ч(b.cost_yuan), String(b.date || "").slice(0, 10)]));
  const ценаИзменилась = Math.abs(ч(p.cost_yuan) - новаяЦена.cost_yuan) > 0.001
    || Math.abs(ч(p.cost_usd) - новаяЦена.cost_usd) > 0.001;

  if (порядокИзменился || ценаИзменилась) {
    кПравке.push({ p, стало, новаяЦена, былиДолги: было.some(b => (Number(b.qty) || 0) < 0) });
  }
}

console.log(`К правке: ${кПравке.length}`);
console.log(`Из них с долгами, которые закроются: ${кПравке.filter(x => x.былиДолги).length}`);
console.log(`Пропущено (количество разошлось бы): ${пропущены.length}\n`);

for (const x of кПравке.slice(0, 40)) {
  const было = ч(x.p.cost_yuan), стало = x.новаяЦена.cost_yuan;
  const знак = стало < было ? "↓" : стало > было ? "↑" : " ";
  console.log(`  ${x.p.name}${x.p.sku ? " [" + x.p.sku + "]" : ""}`);
  console.log(`      себестоимость: ¥${было} ${знак} ¥${стало}   остаток: ${сумма(x.стало)}${x.былиДолги ? "   (долг закроется)" : ""}`);
}
if (кПравке.length > 40) console.log(`  … и ещё ${кПравке.length - 40}`);

for (const x of пропущены) {
  console.log(`  ПРОПУЩЕН ${x.p.name}: было ${x.было}, вышло бы ${x.стало}`);
}

if (!ПИСАТЬ) {
  console.log("\nНичего не записано. Чтобы применить: node _tools/fix-batches.mjs --записать");
  return;
}

// ---------------- запись ----------------
// Перед правкой кладём копию рядом: откатиться должно быть чем.
const копия = join(КОРЕНЬ, `products-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
writeFileSync(копия, JSON.stringify(товары, null, 1));
console.log("\nКопия до правки: " + копия);

let записано = 0, ошибок = 0;
for (const x of кПравке) {
  const r = await fetch(`${URL_БАЗЫ}/rest/v1/products?id=eq.${encodeURIComponent(x.p.id)}`, {
    method: "PATCH", headers: ЗАГОЛОВКИ,
    body: JSON.stringify({ batches: x.стало, stock_qty: сумма(x.стало), cost_yuan: x.новаяЦена.cost_yuan, cost_usd: x.новаяЦена.cost_usd }),
  });
  if (r.ok) записано++;
  else { ошибок++; console.log("  не записан: " + x.p.name + " — " + r.status + " " + (await r.text()).slice(0, 120)); }
}
console.log(`\nЗаписано: ${записано}, ошибок: ${ошибок}`);

}

// Запущен напрямую — работаем. Подключён из теста — молчим.
// Сверяем имя файла целиком: endsWith ловил и «t-fix-batches.mjs».
if (basename(process.argv[1] || "") === "fix-batches.mjs") await главное();