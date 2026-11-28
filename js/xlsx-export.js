// ========================================================================
//  Экспорт накладных в Excel (.xlsx) — скачивание на компьютер с сайта.
//  SheetJS через CDN. Без сервера и без Telegram (всё на клиенте).
// ========================================================================
import { CUR } from "./fx.js?v=20261127d";
import { thumb } from "./img.js?v=20261127d";
// В выгрузках показываем ГЛАВНОЕ фото товара — то же, что в списках.
import { главноеФото } from "./photo.js?v=20261127d";

let _xlsx = null;
async function lib() { if (!_xlsx) _xlsx = await import("https://esm.sh/xlsx@0.18.5"); return _xlsx; }
const curLabel = (c) => (CUR[c]?.label || c);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const safe = (s) => String(s || "").replace(/[^\wа-яёА-ЯЁ \-]/gi, "").trim().slice(0, 30) || "client";

// Накладная со страницы «Продажи». Раньше это была голая таблица без
// стилей и без фото — владелец попросил фото, поэтому лист теперь
// собирает тот же построитель, что и
// накладную со страницы «Клиенты». Отличие одно: здесь нет блока
// расчётов с клиентом, его просто нечем заполнить.
export async function exportInvoice(sale, customer, products) {
  return exportCustomerInvoice(sale, customer, products, {});
}

// --- Красивая накладная клиента (ExcelJS: стили, цвета, границы) ---
let _exceljs = null;
async function libExcel() { if (!_exceljs) { const m = await import("https://esm.sh/exceljs@4.4.0"); _exceljs = m.default || m; } return _exceljs; }
const SIGN = { som: "сум", usd: "$", yuan: "¥" };
const nf = (n) => new Intl.NumberFormat("ru-RU").format(r2(n));
function moneyStr(o = {}) {
  const a = [];
  ["som", "usd", "yuan"].forEach(c => { if (Math.abs(o[c] || 0) >= (c === "som" ? 1 : 0.01)) a.push(nf(o[c]) + " " + SIGN[c]); });
  return a.length ? a.join("  +  ") : "0";
}

// Одна накладная клиента → профессиональный .xlsx (фирма, клиент, долг, последняя оплата).
// info = { debt:{som,usd,yuan}, advance:{...}, lastPay:{amount,currency,date}|null }
export async function exportCustomerInvoice(sale, customer, products, info = {}) {
  const ExcelJS = await libExcel();
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const NAVY = "FF16233B", NAVY2 = "FF22324F", GOLD = "FFD9B45A", RED = "FFB42318", GREEN = "FF067647", BD = "FFD0D5DD";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Накладная");
  // Колонок семь: к прежним добавилось «Фото».
  // B узкая по буквам, но строка высотой 76 — снимок 70 px ложится в неё
  // с полями и не наезжает на соседнюю.
  ws.columns = [{ width: 6 }, { width: 12 }, { width: 40 }, { width: 11 }, { width: 15 }, { width: 17 }, { width: 8 }];
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  ws.mergeCells("A1:G1");
  Object.assign(ws.getCell("A1"), { value: "GENERAL MODERN", font: { bold: true, size: 22, color: { argb: GOLD } }, alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY) });
  ws.getRow(1).height = 36;
  ws.mergeCells("A2:G2");
  Object.assign(ws.getCell("A2"), { value: "Накладная", font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } }, alignment: { horizontal: "center" }, fill: fill(NAVY2) });
  ws.getRow(2).height = 20;
  ws.addRow([]);

  const info2 = (label, val) => { const r = ws.addRow(["", label, val]); r.getCell(2).font = { bold: true }; ws.mergeCells(`C${r.number}:H${r.number}`); };
  info2("Клиент:", customer?.name || "—");
  if (customer?.contact) info2("Контакт:", customer.contact);
  info2("Дата:", new Date(sale.date).toLocaleDateString("ru-RU"));
  ws.addRow([]);

  const head = ws.addRow(["№", "Фото", "Товар", "Кол-во", "Цена", "Сумма", "Вал."]);
  head.height = 22;
  head.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(NAVY2); c.alignment = { horizontal: "center", vertical: "middle" }; c.border = box; });

  // Снимки тянем заранее и параллельно — по одному разу на товар: один
  // и тот же товар попадает в накладную несколькими строками.
  const позиции = sale.items || [];
  const снимки = await снимкиТоваров(позиции.map(it => pmap[it.product_id]));

  const byCur = {};
  позиции.forEach((it, i) => {
    const p = pmap[it.product_id] || { name: "?" };
    const cur = it.currency || sale.currency, sum = r2((it.qty || 0) * (it.unit_price || 0));
    byCur[cur] = (byCur[cur] || 0) + sum;
    const r = ws.addRow([i + 1, "", p.name || "?", Number(it.qty) || 0, r2(it.unit_price), sum, SIGN[cur] || cur]);
    r.height = 76;
    r.eachCell(c => { c.border = box; c.alignment = { ...(c.alignment || {}), vertical: "middle" }; });
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    r.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    [5, 6].forEach(n => { r.getCell(n).numFmt = "#,##0"; r.getCell(n).alignment = { horizontal: "right", vertical: "middle" }; });
    r.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
    if (i % 2) r.eachCell(c => { c.fill = fill("FFF6F8FB"); });
    вставитьСнимок(wb, ws, снимки[i], r.number);
  });
  Object.entries(byCur).forEach(([cur, v]) => {
    const r = ws.addRow(["", "", "", "", "ИТОГО:", r2(v), SIGN[cur] || cur]);
    // Итог латунью — так же, как в PDF: строка видна сразу, не ища глазами.
    [5, 6, 7].forEach(n => {
      const c = r.getCell(n);
      c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      c.fill = fill("FF8F6720");
      c.border = box;
      c.alignment = { horizontal: n === 7 ? "center" : "right" };
    });
    r.getCell(6).numFmt = "#,##0";
  });
  ws.addRow([]);

  // Блок расчётов нужен только там, откуда их передали (страница
  // «Клиенты»). Со страницы «Продажи» данных о долге нет, и строка
  // «Общий долг: 0» там только путала бы.
  if (info && (info.debt || info.advance || info.lastPay)) {
    const debtStr = moneyStr(info.debt), advStr = moneyStr(info.advance);
    const showAdv = debtStr === "0" && advStr !== "0";
    const dRow = ws.addRow(["", showAdv ? "Аванс (мы должны клиенту):" : "Общий долг клиента:", showAdv ? advStr : debtStr]);
    dRow.getCell(2).font = { bold: true, size: 12 };
    dRow.getCell(3).font = { bold: true, size: 12, color: { argb: showAdv ? GREEN : RED } };
    ws.mergeCells(`C${dRow.number}:H${dRow.number}`);
    dRow.eachCell(c => { c.fill = fill(showAdv ? "FFEAF7EE" : "FFFDECEC"); });

    const lp = info.lastPay;
    const pRow = ws.addRow(["", "Последняя оплата:", lp ? `${nf(lp.amount)} ${SIGN[lp.currency] || lp.currency} — ${new Date(lp.date).toLocaleDateString("ru-RU")}` : "нет оплат"]);
    pRow.getCell(2).font = { bold: true }; ws.mergeCells(`C${pRow.number}:H${pRow.number}`);
    ws.addRow([]);
  }
  const f = ws.addRow(["", "Спасибо за покупку! GENERAL MODERN"]);
  f.getCell(2).font = { italic: true, color: { argb: "FF667085" } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `nakladnaya-${safe(customer?.name)}-${new Date(sale.date).toISOString().slice(0, 10)}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// --- Фото товара в листе (ExcelJS addImage) ---
async function urlToDataUrl(url) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch { return null; }
}

// Снимок для ячейки: уменьшаем прямо в браузере.
//
// Почему не на сервере: уменьшение у Supabase выключено (тариф отвечает
// 403), и /api/img отдаёт оригинал — около 250 КБ на снимок при ячейке
// в 70 px. Накладная на двадцать позиций весила бы пять мегабайт, а её
// клиенту ещё отправлять. Здесь же под рукой canvas: перерисовываем в
// 300 px по длинной стороне и жмём в JPEG — выходит около 20 КБ.
//
// Не вышло (битый файл, чужой домен без CORS) — возвращаем как было:
// тяжёлый снимок лучше, чем пустая ячейка.
const РАЗМЕР_СНИМКА = 300;
function уменьшить(dataUrl) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      try {
        const k = Math.min(1, РАЗМЕР_СНИМКА / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * k));
        c.height = Math.max(1, Math.round(im.height * k));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.78));
      } catch { res(dataUrl); }
    };
    im.onerror = () => res(dataUrl);
    im.src = dataUrl;
  });
}

// Снимки для списка товаров — по одному запросу на товар, а не на строку:
// один и тот же товар попадает в накладную несколькими строками.
// Адрес берём через thumb(): прямой адрес из базы у товаров, заведённых
// до переезда, ведёт на прежний проект Supabase и не отвечает.
async function снимкиТоваров(товары) {
  const адреса = товары.map(p => главноеФото(p) || null);
  const нужные = [...new Set(адреса.filter(Boolean))];
  const готовые = new Map();
  await Promise.all(нужные.map(async (u) => {
    const сырой = await urlToDataUrl(thumb(u, РАЗМЕР_СНИМКА));
    готовые.set(u, сырой ? await уменьшить(сырой) : null);
  }));
  return адреса.map(u => (u ? готовые.get(u) : null) || null);
}

// Кладём снимок в колонку B выбранной строки. Высоту строки (76) ставит
// вызывающий: иначе картинка наезжает на соседнюю.
function вставитьСнимок(wb, ws, dataUrl, номерСтроки) {
  if (!dataUrl) return;
  const ext = /png/i.test(dataUrl.slice(0, 20)) ? "png" : "jpeg";
  const base64 = dataUrl.replace(/^data:[^,]*,/, "");   // ExcelJS ждёт «сырой» base64
  const imgId = wb.addImage({ base64, extension: ext });
  ws.addImage(imgId, { tl: { col: 1.18, row: номерСтроки - 1 + 0.14 }, ext: { width: 70, height: 70 }, editAs: "oneCell" });
}
// Локализация ярлыков (всё, кроме названия товара). Название товара НЕ переводим.
export const SO_LABELS = {
  ru: { po: "Заказ поставщику", supplier: "Поставщик", date: "Дата", num: "№", photo: "Фото товара", name: "Наименование", unit: "Ед.изм", qty: "Кол-во", price: "Цена", sum: "Сумма", total: "ИТОГО", pcs: "шт" },
  uz: { po: "Yetkazib beruvchiga buyurtma", supplier: "Yetkazib beruvchi", date: "Sana", num: "№", photo: "Mahsulot rasmi", name: "Nomi", unit: "Oʻlchov", qty: "Soni", price: "Narxi", sum: "Summa", total: "JAMI", pcs: "dona" },
  zh: { po: "采购订单", supplier: "供应商", date: "日期", num: "序号", photo: "产品图片", name: "品名", unit: "单位", qty: "数量", price: "单价", sum: "金额", total: "合计", pcs: "个" },
  en: { po: "Purchase order", supplier: "Supplier", date: "Date", num: "No.", photo: "Photo", name: "Name", unit: "Unit", qty: "Qty", price: "Price", sum: "Amount", total: "TOTAL", pcs: "pcs" },
};

// items = [{product_id, qty, cost, currency}]; lang = ru|uz|zh|en
export async function exportSupplierOrderExcel(items, supplier, currency, products, lang = "ru") {
  const ExcelJS = await libExcel();
  const L = SO_LABELS[lang] || SO_LABELS.ru;
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const sign = SIGN[currency] || currency;
  const numFmt = currency === "som" ? `#,##0" ${sign}"` : `"${sign} "#,##0.00`;
  const NAVY = "FF16233B", HEADBLUE = "FF2F5597", ROW = "FFDDEBF7", GOLD = "FFD9B45A", BD = "FFBFC7D5";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((L.po || "Order").slice(0, 28));
  ws.columns = [{ width: 5 }, { width: 12 }, { width: 40 }, { width: 9 }, { width: 10 }, { width: 15 }, { width: 16 }];
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  ws.mergeCells("A1:G1");
  Object.assign(ws.getCell("A1"), { value: "GENERAL MODERN — " + L.po, font: { bold: true, size: 18, color: { argb: GOLD } }, alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY) });
  ws.getRow(1).height = 34;
  const inf = ws.addRow(["", L.supplier + ":", supplier || "—"]); inf.getCell(2).font = { bold: true }; ws.mergeCells(`C${inf.number}:H${inf.number}`);
  const inf2 = ws.addRow(["", L.date + ":", new Date().toLocaleDateString("ru-RU")]); inf2.getCell(2).font = { bold: true }; ws.mergeCells(`C${inf2.number}:H${inf2.number}`);
  ws.addRow([]);

  const head = ws.addRow([L.num, L.photo, L.name, L.unit, L.qty, L.price, L.sum]);
  head.height = 22;
  head.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(HEADBLUE); c.alignment = { horizontal: "center", vertical: "middle" }; c.border = box; });

  const photos = await снимкиТоваров(items.map(it => pmap[it.product_id]));

  let total = 0;
  items.forEach((it, i) => {
    const p = pmap[it.product_id] || { name: "?" };
    const sum = r2((Number(it.qty) || 0) * (Number(it.cost) || 0));
    total += sum;
    const r = ws.addRow([i + 1, "", p.name || "?", L.pcs, Number(it.qty) || 0, r2(it.cost), sum]);
    r.height = 76; // выше картинки (70px) → фото помещается с полями, не наезжает на соседний ряд
    r.eachCell(c => { c.border = box; c.fill = fill(ROW); });
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; r.getCell(3).font = { bold: true };
    r.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    [6, 7].forEach(n => { r.getCell(n).numFmt = numFmt; r.getCell(n).alignment = { horizontal: "right", vertical: "middle" }; });
    вставитьСнимок(wb, ws, photos[i], r.number);
  });
  const tr = ws.addRow(["", "", "", "", "", L.total, r2(total)]);
  [6, 7].forEach(n => {
    const c = tr.getCell(n);
    c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF8F6720");
    c.border = box;
    c.alignment = { horizontal: "right" };
  });
  tr.getCell(7).numFmt = numFmt;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `zakaz-postavshiku-${safe(supplier)}-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ======================================================================
//  ПЛАН ЗАКУПКИ ОТ АГЕНТА СКЛАДА → .xlsx на шесть листов.
//
//  Считает агент (api/lib/agents/warehouse.js), здесь только вёрстка
//  книги. Нарочно: иначе браузер повторял бы логику агента, и числа в
//  разделе однажды разошлись бы с числами в файле.
//
//  Листы: срочная закупка · скоро закончатся · сезонная закупка ·
//  постоянно продающиеся · медленные · общая аналитика.
//
//  На каждом товарном листе: автофильтр, закреплённая шапка, итоговая
//  строка формулой (а не числом — чтобы правка количества пересчитала
//  сумму прямо в Excel) и цвет строки по светофору.
// ======================================================================
const ЗАКУПКА_ЦВЕТА = {
  "🔴": "FFFDE1E1", "🟠": "FFFDEBD6", "🟡": "FFFEF6D5", "🟢": "FFE6F4E9", "⚪": "FFF0F0F2",
};
// Экспортируется ради теста: он сверяет, что каждая колонка имеет пару
// в строках, которые присылает агент. Иначе колонка молча пустеет.
export const ЗАКУПКА_КОЛОНКИ = [
  { ключ: "код", имя: "Код", ширина: 12 },
  { ключ: "имя", имя: "Наименование", ширина: 42 },
  { ключ: "цвет", имя: "Светофор", ширина: 10, центр: true },
  { ключ: "остаток", имя: "Остаток", ширина: 10, центр: true },
  { ключ: "резерв", имя: "Обещано", ширина: 10, центр: true },
  { ключ: "вПути", имя: "В пути", ширина: 9, центр: true },
  { ключ: "продаж30", имя: "Продано за 30 дн.", ширина: 16, центр: true },
  { ключ: "рекомендовано", имя: "Заказать", ширина: 11, центр: true, жирный: true },
  { ключ: "себестUSD", имя: "Закуп. цена, $", ширина: 14, деньги: true },
  { ключ: "сумма", имя: "Сумма, $", ширина: 13, деньги: true, формула: true },
  { ключ: "поставщик", имя: "Поставщик", ширина: 18 },
  { ключ: "срокДней", имя: "Срок, дн.", ширина: 10, центр: true },
  { ключ: "срокОткуда", имя: "Срок откуда", ширина: 14 },
  { ключ: "приоритет", имя: "Приоритет", ширина: 13, центр: true },
  { ключ: "кончится", имя: "Кончится", ширина: 12, центр: true },
  { ключ: "причина", имя: "Причина", ширина: 46 },
];

export async function exportPurchasePlanExcel(листы, { когда = new Date() } = {}) {
  if (!листы) throw new Error("Агент ещё не прогонялся — выгружать нечего");
  const ExcelJS = await libExcel();
  const NAVY = "FF16233B", HEADBLUE = "FF2F5597", GOLD = "FFD9B45A", BD = "FFBFC7D5";
  const wb = new ExcelJS.Workbook();
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  const лист = (имя, строки, подпись) => {
    const ws = wb.addWorksheet(имя.slice(0, 28));
    ws.columns = ЗАКУПКА_КОЛОНКИ.map((к) => ({ width: к.ширина }));
    const последняя = String.fromCharCode(64 + ЗАКУПКА_КОЛОНКИ.length);

    ws.mergeCells(`A1:${последняя}1`);
    Object.assign(ws.getCell("A1"), {
      value: "GENERAL MODERN — " + имя,
      font: { bold: true, size: 16, color: { argb: GOLD } },
      alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY),
    });
    ws.getRow(1).height = 30;

    const п = ws.addRow([подпись || ""]);
    ws.mergeCells(`A${п.number}:${последняя}${п.number}`);
    п.getCell(1).font = { italic: true, color: { argb: "FF6B6B76" } };
    п.getCell(1).alignment = { wrapText: true, vertical: "middle" };
    if ((подпись || "").length > 110) п.height = 30;
    ws.addRow([]);

    const шапка = ws.addRow(ЗАКУПКА_КОЛОНКИ.map((к) => к.имя));
    шапка.height = 30;
    шапка.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = fill(HEADBLUE);
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = box;
    });
    // Шапка остаётся на экране при прокрутке, и по ней же фильтры.
    ws.views = [{ state: "frozen", ySplit: шапка.number }];
    ws.autoFilter = { from: { row: шапка.number, column: 1 }, to: { row: шапка.number, column: ЗАКУПКА_КОЛОНКИ.length } };

    if (!строки.length) {
      const пусто = ws.addRow(["Пусто — и это хорошо: по этому листу ничего делать не нужно"]);
      ws.mergeCells(`A${пусто.number}:${последняя}${пусто.number}`);
      пусто.getCell(1).font = { italic: true, color: { argb: "FF6B6B76" } };
      return ws;
    }

    const первая = шапка.number + 1;
    for (const с of строки) {
      const r = ws.addRow(ЗАКУПКА_КОЛОНКИ.map((к) => {
        if (к.ключ === "сумма") return null;                   // ниже поставим формулу
        const v = с[к.ключ];
        return v === null || v === undefined ? "" : v;
      }));
      const фон = ЗАКУПКА_ЦВЕТА[с.цвет] || "FFFFFFFF";
      r.eachCell((c) => { c.border = box; c.fill = fill(фон); c.alignment = { vertical: "middle" }; });
      ЗАКУПКА_КОЛОНКИ.forEach((к, i) => {
        const c = r.getCell(i + 1);
        if (к.центр) c.alignment = { horizontal: "center", vertical: "middle" };
        if (к.жирный) c.font = { bold: true };
        if (к.деньги) { c.numFmt = '"$ "#,##0.00'; c.alignment = { horizontal: "right", vertical: "middle" }; }
      });
      r.getCell(2).alignment = { vertical: "middle", wrapText: true };
      r.getCell(16).alignment = { vertical: "middle", wrapText: true };
      // Сумма — формула: поправили «Заказать» прямо в Excel, сумма
      // и итог пересчитались сами.
      r.getCell(10).value = { formula: `H${r.number}*I${r.number}` };
    }

    const итог = ws.addRow([]);
    итог.getCell(9).value = "ИТОГО";
    итог.getCell(10).value = { formula: `SUM(J${первая}:J${итог.number - 1})` };
    [9, 10].forEach((n) => {
      const c = итог.getCell(n);
      c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      c.fill = fill("FF8F6720");
      c.border = box;
      c.alignment = { horizontal: "right" };
    });
    итог.getCell(10).numFmt = '"$ "#,##0.00';
    return ws;
  };

  const л = листы;
  лист("Срочная закупка", л.срочная || [],
    "Кончились ходовые товары и те, что кончатся раньше, чем приедет новое. Это первое, что стоит заказать.");
  лист("Скоро закончатся", л.скоро || [],
    "Остаток подошёл к точке заказа или запаса меньше чем на месяц.");
  лист("Сезонная закупка", л.сезонная || [],
    л.сезоннаяПричина
      ? "Сезонность не считается: " + л.сезоннаяПричина + ". Лист оставлен пустым намеренно — выдумывать сезонный коэффициент агент не станет."
      : "Товары с учётом сезонного коэффициента.");
  лист("Постоянно продающиеся", л.постоянные || [],
    "Что продавалось за последние 30 дней, по убыванию количества. Эти товары не должны кончаться.");
  лист("Медленные", л.медленные || [],
    "Лежат на складе, но за 90 дней ни одной выдачи. Отсортированы по сумме замороженных денег.");

  // ---------------- шестой лист: общая аналитика ----------------
  {
    const a = л.аналитика || {};
    const ws = wb.addWorksheet("Общая аналитика");
    ws.columns = [{ width: 38 }, { width: 22 }, { width: 46 }];
    ws.mergeCells("A1:C1");
    Object.assign(ws.getCell("A1"), {
      value: "GENERAL MODERN — Общая аналитика склада",
      font: { bold: true, size: 16, color: { argb: GOLD } },
      alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY),
    });
    ws.getRow(1).height = 30;
    ws.addRow([]);

    const раздел = (имя) => {
      const r = ws.addRow([имя]);
      ws.mergeCells(`A${r.number}:C${r.number}`);
      r.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      r.getCell(1).fill = fill(HEADBLUE);
      r.getCell(1).alignment = { vertical: "middle" };
      r.height = 22;
    };
    const пара = (имя, значение, примечание = "") => {
      const r = ws.addRow([имя, значение, примечание]);
      r.getCell(2).font = { bold: true };
      r.getCell(3).font = { italic: true, color: { argb: "FF6B6B76" } };
      r.getCell(3).alignment = { wrapText: true, vertical: "middle" };
      r.eachCell((c) => { c.border = box; });
    };

    раздел("Светофор остатков");
    const св = a.светофор || {};
    пара("🔴 кончились", св["🔴"] || 0, "Ходовые на нуле — прямая потеря выручки");
    пара("🟠 кончатся раньше поставки", св["🟠"] || 0, "Заказывать сегодня");
    пара("🟡 пора заказывать", св["🟡"] || 0, "Остаток дошёл до точки заказа");
    пара("🟢 хватает", св["🟢"] || 0, "");
    пара("⚪ без движения", св["⚪"] || 0, "Деньги стоят на полке");
    пара("Всего товаров", a.товаров || 0, "");
    ws.addRow([]);

    раздел("Деньги");
    пара("Заморожено в медленных, $", a.деньгиНаПолке || 0, "Закупочная стоимость того, что не продаётся");
    ws.addRow([]);

    раздел("История продаж");
    пара("Глубина истории, дней", a.историяДней || 0,
      (a.историяДней || 0) < 400
        ? "Для сезонности и сравнения с прошлым годом нужно от 400 дней. Пока их нет, агент эти цифры не считает."
        : "Хватает на сезонность и сравнение с прошлым годом");
    пара("Первая накладная", a.историяОт || "—", "");
    ws.addRow([]);

    раздел("Классы товаров");
    const кл = a.классы || {};
    пара("Постоянно продающихся", кл.постоянных || 0, "Три и больше выдач за квартал");
    пара("Самых частых", кл.частых || 0, "Шесть и больше выдач за квартал");
    пара("Не продавались полгода", кл.мёртвых || 0, "");
    пара("Просевших", кл.просевших || 0, "Продавались, и спрос упал больше чем вдвое");
    пара("Новых в спросе", кл.новых || 0, "В прошлом месяце не брали, в этом пошли");
    ws.addRow([]);

    раздел("Сроки поставки — посчитаны по вашим приходам");
    const ш = ws.addRow(["Поставщик", "Дней", "По скольким поставкам"]);
    ш.eachCell((c) => { c.font = { bold: true }; c.border = box; c.fill = fill("FFEFF3F9"); });
    for (const с of a.сроки || []) {
      const r = ws.addRow([с.поставщик, с.дней, с.поставок + (с.надёжно ? "" : " — мало, срок приблизительный")]);
      r.eachCell((c) => { c.border = box; });
      r.getCell(2).alignment = { horizontal: "center" };
    }
    if (!(a.сроки || []).length) ws.addRow(["Сроков нет: ни в одном приходе не отмечено, когда товар оприходован"]);
    ws.addRow([]);

    раздел("Чего не хватило для расчёта");
    const пр = a.пробелы || {};
    const ключи = Object.keys(пр);
    if (!ключи.length) пара("Всё посчитано", "—", "");
    for (const к of ключи) пара(к, пр[к], "товаров с этой нехваткой");
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plan-zakupki-${когда.toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// --- Накладная КЛИЕНТА из кабинета → .xlsx с фото товара ---
// inv: { date, currency, total, covered, remaining, items:[{product_name, photo, qty, unit_price, currency}] }
// Ярлыки накладной клиента (кабинет на сайте: ru | uz | en). Названия товаров не переводим.
export const CI_LABELS = {
  ru: { sheet: "Накладная", title: "Накладная", client: "Клиент:", date: "Дата:", no: "№ накладной:", num: "№", photo: "Фото", item: "Товар", qty: "Кол-во", price: "Цена", sum: "Сумма", total: "ИТОГО:", paid: "Оплачено по этой накладной:", left: "Остаток долга:", thanks: "Спасибо за покупку! GENERAL MODERN", som: "сум", file: "nakladnaya", locale: "ru-RU" },
  uz: { sheet: "Yuk xati", title: "Yuk xati", client: "Mijoz:", date: "Sana:", no: "Yuk xati №:", num: "№", photo: "Rasm", item: "Mahsulot", qty: "Soni", price: "Narxi", sum: "Summa", total: "JAMI:", paid: "Shu yuk xati bo‘yicha to‘langan:", left: "Qarz qoldig‘i:", thanks: "Xaridingiz uchun rahmat! GENERAL MODERN", som: "so‘m", file: "yuk-xati", locale: "ru-RU" },
  en: { sheet: "Invoice", title: "Invoice", client: "Customer:", date: "Date:", no: "Invoice No.:", num: "No.", photo: "Photo", item: "Item", qty: "Qty", price: "Price", sum: "Amount", total: "TOTAL:", paid: "Paid on this invoice:", left: "Balance due:", thanks: "Thank you for your purchase! GENERAL MODERN", som: "sum", file: "invoice", locale: "en-GB" },
};

export async function exportClientInvoiceExcel(inv, customerName, lang = "ru") {
  const ExcelJS = await libExcel();
  const L = CI_LABELS[lang] || CI_LABELS.ru;
  const NAVY = "FF16233B", HEAD = "FF22324F", ROW = "FFF6F8FB", GOLD = "FFD9B45A", BD = "FFD0D5DD";
  const RED = "FFB42318", GREEN = "FF067647";
  const cur0 = inv.currency || "som";
  const numFmt = cur0 === "som" ? `#,##0" ${L.som}"` : cur0 === "usd" ? '"$"#,##0.00' : '"¥ "#,##0.00';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(L.sheet);
  ws.columns = [{ width: 5 }, { width: 12 }, { width: 40 }, { width: 10 }, { width: 14 }, { width: 16 }];
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  ws.mergeCells("A1:F1");
  Object.assign(ws.getCell("A1"), { value: "GENERAL MODERN", font: { bold: true, size: 20, color: { argb: GOLD } }, alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY) });
  ws.getRow(1).height = 34;
  ws.mergeCells("A2:F2");
  Object.assign(ws.getCell("A2"), { value: L.title, font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } }, alignment: { horizontal: "center" }, fill: fill(HEAD) });
  ws.getRow(2).height = 20;
  ws.addRow([]);
  const info = (label, val) => { const r = ws.addRow(["", label, val]); r.getCell(2).font = { bold: true }; ws.mergeCells(`C${r.number}:G${r.number}`); };
  info(L.client, текстВКлетку(customerName || "—"));
  info(L.date, new Date(inv.date).toLocaleDateString(L.locale));
  info(L.no, String(inv.id || "").slice(-6).toUpperCase());
  ws.addRow([]);

  const head = ws.addRow([L.num, L.photo, L.item, L.qty, L.price, L.sum]);
  head.height = 22;
  head.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(HEAD); c.alignment = { horizontal: "center", vertical: "middle" }; c.border = box; });

  // Снимок берём через thumb: в поле photo лежит адрес прямо из базы,
  // а он и тяжёлый (оригинал), и у старых товаров ведёт на прежний проект.
  const items = inv.items || [];
  const photos = await снимкиТоваров(items.map(it => (it.photo ? { photo_url: it.photo } : null)));

  let total = 0;
  items.forEach((it, i) => {
    const cur = it.currency || cur0;
    const sum = r2((Number(it.qty) || 0) * (Number(it.unit_price) || 0));
    total += sum;
    const r = ws.addRow([i + 1, "", текстВКлетку(it.product_name || "—"), Number(it.qty) || 0, r2(it.unit_price), sum]);
    r.height = 76;
    r.eachCell(c => { c.border = box; if (i % 2) c.fill = fill(ROW); });
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; r.getCell(3).font = { bold: true };
    r.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    [5, 6].forEach(n => { r.getCell(n).numFmt = numFmt; r.getCell(n).alignment = { horizontal: "right", vertical: "middle" }; });
    вставитьСнимок(wb, ws, photos[i], r.number);
  });

  const tr = ws.addRow(["", "", "", "", L.total, r2(total)]);
  [5, 6].forEach(n => {
    const c = tr.getCell(n);
    c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    c.fill = fill("FF8F6720");
    c.border = box;
    c.alignment = { horizontal: "right" };
  });
  tr.getCell(6).numFmt = numFmt;

  // оплачено / остаток по этой накладной
  const line = (label, value, color, bg) => {
    const r = ws.addRow(["", label, "", "", "", r2(value)]);
    r.getCell(2).font = { bold: true };
    // Объединяем B..E, а НЕ B..F: сумма лежит в F, и объединение до неё
    // её проглатывало — в листе оставалась подпись без числа.
    ws.mergeCells(`B${r.number}:E${r.number}`);
    r.getCell(6).font = { bold: true, color: { argb: color } };
    r.getCell(6).numFmt = numFmt; r.getCell(6).alignment = { horizontal: "right" };
    if (bg) { r.getCell(2).fill = fill(bg); r.getCell(6).fill = fill(bg); }
  };
  if (inv.covered != null) line(L.paid, inv.covered, GREEN, "FFEAF7EE");
  if (inv.remaining != null) line(L.left, inv.remaining, (Number(inv.remaining) || 0) > 0.01 ? RED : GREEN, (Number(inv.remaining) || 0) > 0.01 ? "FFFDECEC" : "FFEAF7EE");

  ws.addRow([]);
  const f = ws.addRow(["", L.thanks]);
  f.getCell(2).font = { italic: true, color: { argb: "FF667085" } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${L.file}-${new Date(inv.date).toISOString().slice(0, 10)}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Все накладные (плоская таблица: строка = позиция). customers/products — массивы.
export async function exportAllSales(sales, customers, products) {
  const XLSX = await lib();
  const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const pmap = Object.fromEntries(products.map(p => [p.id, p.name]));
  const aoa = [["Дата", "Клиент", "Товар", "Кол-во", "Цена", "Сумма", "Валюта", "Оплата"]];
  [...sales].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(s => {
    (s.items || []).forEach(it => {
      const c = it.currency || s.currency;
      aoa.push([
        new Date(s.date).toLocaleDateString("ru-RU"),
        cmap[s.customer_id] || "—",
        pmap[it.product_id] || "?",
        Number(it.qty) || 0, r2(it.unit_price), r2((it.qty || 0) * (it.unit_price || 0)),
        curLabel(c), it.paid ? "оплачено" : "в долг",
      ]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Накладные");
  XLSX.writeFile(wb, `nakladnye-${new Date().toISOString().slice(0, 10)}.xlsx`);
}


// ========================================================================
//  ЛИСТ ДЛЯ ПЕРЕСЧЁТА СКЛАДА.
//
//  Владелец идёт по полкам и вписывает в жёлтую колонку «Факт на полке»
//  то, что реально лежит. Поэтому лист сделан как рабочая бумага, а не как
//  выгрузка: фирменная шапка, закреплённые заголовки, раздел за разделом,
//  печать влезает в ширину A4.
//
//  Пустая клетка «Факт» значит «не считал» и остаток не тронет
//  (js/stockcount.js) — об этом написано прямо в шапке листа.
//
//  Фото кладём только когда считают ОДИН раздел: 900 картинок превратят
//  файл в сотню мегабайт, и Excel будет открывать его минуту.
// ========================================================================
// Excel видит в клетке, начинающейся с «=», «+», «-» или «@», ФОРМУЛУ.
// Название товара приходит из базы, а туда оно попадает и из заказов
// клиентов, и из загруженных файлов. Поэтому перед записью такой текст
// обезвреживаем апострофом: Excel покажет его как обычную строку.
const текстВКлетку = (v) => {
  const s = String(v == null ? "" : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
};

export function списокДляПересчёта(products, категория = "") {
  return [...(products || [])]
    .filter(p => p && p.id && (!категория || String(p.category || "") === категория))
    .sort((a, b) =>
      String(a.category || "яяя").localeCompare(String(b.category || "яяя"), "ru") ||
      String(a.name || "").localeCompare(String(b.name || ""), "ru"));
}

export async function exportStockCountSheet(products, настройки = {}) {
  const { категория = "", сФото = false, наПрогресс } = настройки;
  const ExcelJS = await libExcel();
  const список = списокДляПересчёта(products, категория);
  const NAVY = "FF16233B", NAVY2 = "FF22324F", GOLD = "FFD9B45A";
  const ЖЁЛТЫЙ = "FFFFF4CC", ЗЕБРА = "FFF6F8FB", BD = "FFBFC7D5";

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Пересчёт");
  const колонки = сФото
    ? [{ width: 5 }, { width: 13 }, { width: 11 }, { width: 14 }, { width: 42 }, { width: 18 }, { width: 16 }, { width: 16 }]
    : [{ width: 5 }, { width: 11 }, { width: 14 }, { width: 42 }, { width: 18 }, { width: 16 }, { width: 16 }];
  ws.columns = колонки;
  const последняя = String.fromCharCode(64 + колонки.length);        // A..H
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  ws.mergeCells("A1:" + последняя + "1");
  Object.assign(ws.getCell("A1"), {
    value: "GENERAL MODERN — пересчёт склада",
    font: { bold: true, size: 18, color: { argb: GOLD } },
    alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY),
  });
  ws.getRow(1).height = 34;

  ws.mergeCells("A2:" + последняя + "2");
  Object.assign(ws.getCell("A2"), {
    value: (категория ? "Раздел: " + текстВКлетку(категория) : "Весь склад")
      + " · товаров: " + список.length
      + " · лист от " + new Date().toLocaleDateString("ru-RU"),
    font: { bold: true, size: 11, color: { argb: "FFFFFFFF" } },
    alignment: { horizontal: "center" }, fill: fill(NAVY2),
  });
  ws.getRow(2).height = 20;

  ws.mergeCells("A3:" + последняя + "3");
  Object.assign(ws.getCell("A3"), {
    value: "Впишите количество в жёлтую колонку «Факт на полке». Пустую клетку склад не тронет — считать можно частями.",
    font: { italic: true, size: 10, color: { argb: "FF667085" } },
    alignment: { horizontal: "center" },
  });
  ws.addRow([]);

  const заголовки = сФото
    ? ["№", "Фото", "Код", "Артикул", "Товар", "Раздел", "Остаток в складе", "Факт на полке"]
    : ["№", "Код", "Артикул", "Товар", "Раздел", "Остаток в складе", "Факт на полке"];
  const шапка = ws.addRow(заголовки);
  шапка.height = 24;
  шапка.eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill(NAVY2);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = box;
  });
  const строкаШапки = шапка.number;

  // фото тянем параллельно и уменьшенными — лист должен остаться лёгким
  let фото = [];
  if (сФото) {
    if (наПрогресс) наПрогресс("Готовим фото…");
    фото = await Promise.all(список.map(p => {
      const url = главноеФото(p) || null;
      return url ? urlToDataUrl(thumb(url, 160)) : Promise.resolve(null);
    }));
  }

  const остатокК = колонки.length - 1, фактК = колонки.length, имяК = сФото ? 5 : 4;
  список.forEach((p, i) => {
    const поля = [текстВКлетку(p.code), текстВКлетку(p.sku), текстВКлетку(p.name), текстВКлетку(p.category), Number(p.stock_qty) || 0, ""];
    const данные = сФото ? [i + 1, "", ...поля] : [i + 1, ...поля];
    const r = ws.addRow(данные);
    if (сФото) r.height = 72;
    r.eachCell(c => { c.border = box; c.alignment = { vertical: "middle" }; });
    if (i % 2) r.eachCell(c => { c.fill = fill(ЗЕБРА); });
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(имяК).font = { bold: true };
    r.getCell(имяК).alignment = { vertical: "middle", wrapText: true };
    r.getCell(остатокК).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(остатокК).numFmt = "#,##0";
    // клетка под запись: жёлтая, крупная, в золотой рамке — видно, куда писать
    const ф = r.getCell(фактК);
    ф.fill = fill(ЖЁЛТЫЙ);
    ф.numFmt = "#,##0";
    ф.font = { bold: true, size: 12 };
    ф.alignment = { horizontal: "center", vertical: "middle" };
    ф.border = {
      top: thin, bottom: thin,
      left: { style: "medium", color: { argb: GOLD } },
      right: { style: "medium", color: { argb: GOLD } },
    };

    if (сФото && фото[i]) {
      const ext = /png/i.test(фото[i].slice(0, 20)) ? "png" : "jpeg";
      const base64 = фото[i].replace(/^data:[^,]*,/, "");   // ExcelJS ждёт «сырой» base64
      const imgId = wb.addImage({ base64, extension: ext });
      ws.addImage(imgId, { tl: { col: 1.15, row: r.number - 1 + 0.12 }, ext: { width: 66, height: 66 }, editAs: "oneCell" });
    }
    if (наПрогресс && i && i % 100 === 0) наПрогресс("Собираем лист… " + i + " из " + список.length);
  });

  // шапка не уезжает при прокрутке, есть фильтр, печать влезает в ширину
  ws.views = [{ state: "frozen", ySplit: строкаШапки }];
  ws.autoFilter = {
    from: { row: строкаШапки, column: 1 },
    to: { row: строкаШапки + список.length, column: колонки.length },
  };
  ws.pageSetup = {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    printTitlesRow: строкаШапки + ":" + строкаШапки,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  ws.headerFooter = { oddFooter: "&LGENERAL MODERN · пересчёт&RСтр. &P из &N" };

  const buf = await wb.xlsx.writeBuffer();
  скачатьФайл(buf, "pereschet-" + (категория ? safe(категория) + "-" : "") + new Date().toISOString().slice(0, 10) + ".xlsx");
  return список.length;
}

// Лист расхождений — чтобы перед записью осталась бумага: что было,
// что стало и на сколько разошлось.
export async function exportCountDiff(расхождения, категория = "") {
  const ExcelJS = await libExcel();
  const NAVY = "FF16233B", NAVY2 = "FF22324F", GOLD = "FFD9B45A", BD = "FFBFC7D5";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Расхождения");
  ws.columns = [{ width: 5 }, { width: 11 }, { width: 42 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 12 }];
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  ws.mergeCells("A1:G1");
  Object.assign(ws.getCell("A1"), {
    value: "GENERAL MODERN — расхождения после пересчёта",
    font: { bold: true, size: 16, color: { argb: GOLD } },
    alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY),
  });
  ws.getRow(1).height = 30;
  ws.mergeCells("A2:G2");
  Object.assign(ws.getCell("A2"), {
    value: (категория ? "Раздел: " + текстВКлетку(категория) + " · " : "") + new Date().toLocaleString("ru-RU"),
    font: { size: 11, color: { argb: "FFFFFFFF" } },
    alignment: { horizontal: "center" }, fill: fill(NAVY2),
  });
  ws.addRow([]);

  const шапка = ws.addRow(["№", "Код", "Товар", "Раздел", "Было в складе", "Факт на полке", "Разница"]);
  шапка.eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill(NAVY2);
    c.alignment = { horizontal: "center", wrapText: true };
    c.border = box;
  });

  (расхождения || []).forEach(({ p, было, факт, разница }, i) => {
    const r = ws.addRow([i + 1, текстВКлетку(p.code), текстВКлетку(p.name), текстВКлетку(p.category), было, факт, разница]);
    r.eachCell(c => { c.border = box; });
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(3).font = { bold: true };
    [5, 6, 7].forEach(n => { r.getCell(n).alignment = { horizontal: "center" }; r.getCell(n).numFmt = "#,##0"; });
    r.getCell(7).font = { bold: true, color: { argb: разница > 0 ? "FF067647" : "FFB42318" } };
  });

  const buf = await wb.xlsx.writeBuffer();
  скачатьФайл(buf, "rashozhdeniya-" + new Date().toISOString().slice(0, 10) + ".xlsx");
}

function скачатьФайл(buf, имя) {
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = имя; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
