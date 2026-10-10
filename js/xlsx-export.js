// ========================================================================
//  Экспорт накладных в Excel (.xlsx) — скачивание на компьютер с сайта.
//  SheetJS через CDN. Без сервера и без Telegram (всё на клиенте).
// ========================================================================
import { CUR } from "./fx.js?v=20261010c";
import { thumb } from "./img.js?v=20261010c";

let _xlsx = null;
async function lib() { if (!_xlsx) _xlsx = await import("https://esm.sh/xlsx@0.18.5"); return _xlsx; }
const curLabel = (c) => (CUR[c]?.label || c);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const safe = (s) => String(s || "").replace(/[^\wа-яёА-ЯЁ \-]/gi, "").trim().slice(0, 30) || "client";

// Одна накладная → отдельный .xlsx (шапка + позиции + итог).
export async function exportInvoice(sale, customer, products) {
  const XLSX = await lib();
  const pmap = Object.fromEntries(products.map(p => [p.id, p.name]));
  const aoa = [
    ["GENERAL MODERN — Накладная"],
    ["Клиент:", customer?.name || "—"],
    ["Дата:", new Date(sale.date).toLocaleDateString("ru-RU")],
    [],
    ["№", "Товар", "Кол-во", "Цена", "Сумма", "Валюта"],
  ];
  const byCur = {};
  (sale.items || []).forEach((it, i) => {
    const c = it.currency || sale.currency;
    const sum = r2((it.qty || 0) * (it.unit_price || 0));
    byCur[c] = (byCur[c] || 0) + sum;
    aoa.push([i + 1, pmap[it.product_id] || "?", Number(it.qty) || 0, r2(it.unit_price), sum, curLabel(c)]);
  });
  aoa.push([]);
  Object.entries(byCur).forEach(([c, v]) => aoa.push(["", "", "", "ИТОГО:", r2(v), curLabel(c)]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Накладная");
  XLSX.writeFile(wb, `nakladnaya-${safe(customer?.name)}-${new Date(sale.date).toISOString().slice(0, 10)}.xlsx`);
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
  const pmap = Object.fromEntries(products.map(p => [p.id, p.name]));
  const NAVY = "FF16233B", NAVY2 = "FF22324F", GOLD = "FFD9B45A", RED = "FFB42318", GREEN = "FF067647", BD = "FFD0D5DD";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Накладная");
  ws.columns = [{ width: 6 }, { width: 38 }, { width: 11 }, { width: 15 }, { width: 17 }, { width: 8 }];
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  ws.mergeCells("A1:F1");
  Object.assign(ws.getCell("A1"), { value: "GENERAL MODERN", font: { bold: true, size: 22, color: { argb: GOLD } }, alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY) });
  ws.getRow(1).height = 36;
  ws.mergeCells("A2:F2");
  Object.assign(ws.getCell("A2"), { value: "Накладная", font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } }, alignment: { horizontal: "center" }, fill: fill(NAVY2) });
  ws.getRow(2).height = 20;
  ws.addRow([]);

  const info2 = (label, val) => { const r = ws.addRow(["", label, val]); r.getCell(2).font = { bold: true }; ws.mergeCells(`C${r.number}:F${r.number}`); };
  info2("Клиент:", customer?.name || "—");
  if (customer?.contact) info2("Контакт:", customer.contact);
  info2("Дата:", new Date(sale.date).toLocaleDateString("ru-RU"));
  ws.addRow([]);

  const head = ws.addRow(["№", "Товар", "Кол-во", "Цена", "Сумма", "Вал."]);
  head.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(NAVY2); c.alignment = { horizontal: "center" }; c.border = box; });

  const byCur = {};
  (sale.items || []).forEach((it, i) => {
    const cur = it.currency || sale.currency, sum = r2((it.qty || 0) * (it.unit_price || 0));
    byCur[cur] = (byCur[cur] || 0) + sum;
    const r = ws.addRow([i + 1, pmap[it.product_id] || "?", Number(it.qty) || 0, r2(it.unit_price), sum, SIGN[cur] || cur]);
    r.eachCell(c => { c.border = box; });
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(3).alignment = { horizontal: "center" };
    [4, 5].forEach(n => { r.getCell(n).numFmt = "#,##0"; r.getCell(n).alignment = { horizontal: "right" }; });
    r.getCell(6).alignment = { horizontal: "center" };
    if (i % 2) r.eachCell(c => { c.fill = fill("FFF6F8FB"); });
  });
  Object.entries(byCur).forEach(([cur, v]) => {
    const r = ws.addRow(["", "", "", "ИТОГО:", r2(v), SIGN[cur] || cur]);
    r.getCell(4).font = { bold: true }; r.getCell(4).alignment = { horizontal: "right" };
    r.getCell(5).font = { bold: true }; r.getCell(5).numFmt = "#,##0"; r.getCell(5).alignment = { horizontal: "right" };
    r.getCell(6).font = { bold: true };
  });
  ws.addRow([]);

  const debtStr = moneyStr(info.debt), advStr = moneyStr(info.advance);
  const showAdv = debtStr === "0" && advStr !== "0";
  const dRow = ws.addRow(["", showAdv ? "Аванс (мы должны клиенту):" : "Общий долг клиента:", showAdv ? advStr : debtStr]);
  dRow.getCell(2).font = { bold: true, size: 12 };
  dRow.getCell(3).font = { bold: true, size: 12, color: { argb: showAdv ? GREEN : RED } };
  ws.mergeCells(`C${dRow.number}:F${dRow.number}`);
  dRow.eachCell(c => { c.fill = fill(showAdv ? "FFEAF7EE" : "FFFDECEC"); });

  const lp = info.lastPay;
  const pRow = ws.addRow(["", "Последняя оплата:", lp ? `${nf(lp.amount)} ${SIGN[lp.currency] || lp.currency} — ${new Date(lp.date).toLocaleDateString("ru-RU")}` : "нет оплат"]);
  pRow.getCell(2).font = { bold: true }; ws.mergeCells(`C${pRow.number}:F${pRow.number}`);
  ws.addRow([]);
  const f = ws.addRow(["", "Спасибо за покупку! GENERAL MODERN"]);
  f.getCell(2).font = { italic: true, color: { argb: "FF667085" } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `nakladnaya-${safe(customer?.name)}-${new Date(sale.date).toISOString().slice(0, 10)}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// --- Заказ поставщику → .xlsx с ФОТО товара (ExcelJS addImage) ---
async function urlToDataUrl(url) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch { return null; }
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
  ws.columns = [{ width: 5 }, { width: 15 }, { width: 40 }, { width: 9 }, { width: 10 }, { width: 15 }, { width: 16 }];
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  ws.mergeCells("A1:G1");
  Object.assign(ws.getCell("A1"), { value: "GENERAL MODERN — " + L.po, font: { bold: true, size: 18, color: { argb: GOLD } }, alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY) });
  ws.getRow(1).height = 34;
  const inf = ws.addRow(["", L.supplier + ":", supplier || "—"]); inf.getCell(2).font = { bold: true }; ws.mergeCells(`C${inf.number}:G${inf.number}`);
  const inf2 = ws.addRow(["", L.date + ":", new Date().toLocaleDateString("ru-RU")]); inf2.getCell(2).font = { bold: true }; ws.mergeCells(`C${inf2.number}:G${inf2.number}`);
  ws.addRow([]);

  const head = ws.addRow([L.num, L.photo, L.name, L.unit, L.qty, L.price, L.sum]);
  head.height = 22;
  head.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(HEADBLUE); c.alignment = { horizontal: "center", vertical: "middle" }; c.border = box; });

  // фото тянем параллельно
  const photos = await Promise.all(items.map(it => {
    const p = pmap[it.product_id] || {};
    const url = (p.photos && p.photos[0]) || p.photo_url || null;
    return url ? urlToDataUrl(url) : Promise.resolve(null);
  }));

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
    const dataUrl = photos[i];
    if (dataUrl) {
      const ext = /png/i.test(dataUrl.slice(0, 20)) ? "png" : "jpeg";
      const base64 = dataUrl.replace(/^data:[^,]*,/, ""); // ExcelJS ждёт «сырой» base64 без data-URI префикса
      const imgId = wb.addImage({ base64, extension: ext });
      // фото по центру ячейки B, с полями — аккуратно и без наложения на соседние строки
      ws.addImage(imgId, { tl: { col: 1.18, row: r.number - 1 + 0.14 }, ext: { width: 70, height: 70 }, editAs: "oneCell" });
    }
  });
  const tr = ws.addRow(["", "", "", "", "", L.total, r2(total)]);
  tr.getCell(6).font = { bold: true, size: 12 }; tr.getCell(6).alignment = { horizontal: "right" };
  tr.getCell(7).font = { bold: true, size: 12 }; tr.getCell(7).numFmt = numFmt; tr.getCell(7).alignment = { horizontal: "right" };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `zakaz-postavshiku-${safe(supplier)}-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// --- Накладная КЛИЕНТА из кабинета → .xlsx с фото товара ---
// inv: { date, currency, total, covered, remaining, items:[{product_name, photo, qty, unit_price, currency}] }
export async function exportClientInvoiceExcel(inv, customerName) {
  const ExcelJS = await libExcel();
  const NAVY = "FF16233B", HEAD = "FF22324F", ROW = "FFF6F8FB", GOLD = "FFD9B45A", BD = "FFD0D5DD";
  const RED = "FFB42318", GREEN = "FF067647";
  const cur0 = inv.currency || "som";
  const numFmt = cur0 === "som" ? '#,##0" сум"' : cur0 === "usd" ? '"$"#,##0.00' : '"¥ "#,##0.00';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Накладная");
  ws.columns = [{ width: 5 }, { width: 15 }, { width: 40 }, { width: 10 }, { width: 14 }, { width: 16 }];
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  ws.mergeCells("A1:F1");
  Object.assign(ws.getCell("A1"), { value: "GENERAL MODERN", font: { bold: true, size: 20, color: { argb: GOLD } }, alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY) });
  ws.getRow(1).height = 34;
  ws.mergeCells("A2:F2");
  Object.assign(ws.getCell("A2"), { value: "Накладная", font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } }, alignment: { horizontal: "center" }, fill: fill(HEAD) });
  ws.getRow(2).height = 20;
  ws.addRow([]);
  const info = (label, val) => { const r = ws.addRow(["", label, val]); r.getCell(2).font = { bold: true }; ws.mergeCells(`C${r.number}:F${r.number}`); };
  info("Клиент:", customerName || "—");
  info("Дата:", new Date(inv.date).toLocaleDateString("ru-RU"));
  info("№ накладной:", String(inv.id || "").slice(-6).toUpperCase());
  ws.addRow([]);

  const head = ws.addRow(["№", "Фото", "Товар", "Кол-во", "Цена", "Сумма"]);
  head.height = 22;
  head.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(HEAD); c.alignment = { horizontal: "center", vertical: "middle" }; c.border = box; });

  // фото тянем параллельно (как в заказе поставщику)
  const items = inv.items || [];
  const photos = await Promise.all(items.map(it => (it.photo ? urlToDataUrl(it.photo) : Promise.resolve(null))));

  let total = 0;
  items.forEach((it, i) => {
    const cur = it.currency || cur0;
    const sum = r2((Number(it.qty) || 0) * (Number(it.unit_price) || 0));
    total += sum;
    const r = ws.addRow([i + 1, "", it.product_name || "—", Number(it.qty) || 0, r2(it.unit_price), sum]);
    r.height = 76;
    r.eachCell(c => { c.border = box; if (i % 2) c.fill = fill(ROW); });
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; r.getCell(3).font = { bold: true };
    r.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    [5, 6].forEach(n => { r.getCell(n).numFmt = numFmt; r.getCell(n).alignment = { horizontal: "right", vertical: "middle" }; });
    const dataUrl = photos[i];
    if (dataUrl) {
      const ext = /png/i.test(dataUrl.slice(0, 20)) ? "png" : "jpeg";
      const base64 = dataUrl.replace(/^data:[^,]*,/, "");
      const imgId = wb.addImage({ base64, extension: ext });
      ws.addImage(imgId, { tl: { col: 1.18, row: r.number - 1 + 0.14 }, ext: { width: 70, height: 70 }, editAs: "oneCell" });
    }
  });

  const tr = ws.addRow(["", "", "", "", "ИТОГО:", r2(total)]);
  tr.getCell(5).font = { bold: true, size: 12 }; tr.getCell(5).alignment = { horizontal: "right" };
  tr.getCell(6).font = { bold: true, size: 12 }; tr.getCell(6).numFmt = numFmt; tr.getCell(6).alignment = { horizontal: "right" };

  // оплачено / остаток по этой накладной
  const line = (label, value, color, bg) => {
    const r = ws.addRow(["", label, "", "", "", r2(value)]);
    r.getCell(2).font = { bold: true };
    ws.mergeCells(`B${r.number}:E${r.number}`);
    r.getCell(6).font = { bold: true, color: { argb: color } };
    r.getCell(6).numFmt = numFmt; r.getCell(6).alignment = { horizontal: "right" };
    if (bg) { r.getCell(2).fill = fill(bg); r.getCell(6).fill = fill(bg); }
  };
  if (inv.covered != null) line("Оплачено по этой накладной:", inv.covered, GREEN, "FFEAF7EE");
  if (inv.remaining != null) line("Остаток долга:", inv.remaining, (Number(inv.remaining) || 0) > 0.01 ? RED : GREEN, (Number(inv.remaining) || 0) > 0.01 ? "FFFDECEC" : "FFEAF7EE");

  ws.addRow([]);
  const f = ws.addRow(["", "Спасибо за покупку! GENERAL MODERN"]);
  f.getCell(2).font = { italic: true, color: { argb: "FF667085" } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `nakladnaya-${new Date(inv.date).toISOString().slice(0, 10)}.xlsx`; a.click();
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
      const url = (p.photos && p.photos[0]) || p.photo_url || null;
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
