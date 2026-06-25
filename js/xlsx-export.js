// ========================================================================
//  Экспорт накладных в Excel (.xlsx) — скачивание на компьютер с сайта.
//  SheetJS через CDN. Без сервера и без Telegram (всё на клиенте).
// ========================================================================
import { CUR } from "./fx.js";

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

// Полная карточка клиента → профессиональный .xlsx: инфо + долг + все накладные + товары + оплаты.
// info = { turnover:{som,usd,yuan}, paid:{...}, debt:{...}, advance:{...}, lastPay:{...}|null }
export async function exportCustomerCard(customer, sales, payments, products, info = {}) {
  const ExcelJS = await libExcel();
  const pmap = Object.fromEntries(products.map(p => [p.id, p.name]));
  const NAVY = "FF16233B", NAVY2 = "FF22324F", GOLD = "FFD9B45A", RED = "FFB42318", GREEN = "FF067647", BD = "FFD0D5DD";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Клиент");
  ws.columns = [{ width: 6 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }];
  const thin = { style: "thin", color: { argb: BD } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const saleSum = (s) => { const o = {}; (s.items || []).forEach(it => { const c = it.currency || s.currency; o[c] = (o[c] || 0) + (it.qty || 0) * (it.unit_price || 0); }); return o; };

  ws.mergeCells("A1:F1");
  Object.assign(ws.getCell("A1"), { value: "GENERAL MODERN", font: { bold: true, size: 22, color: { argb: GOLD } }, alignment: { horizontal: "center", vertical: "middle" }, fill: fill(NAVY) });
  ws.getRow(1).height = 36;
  ws.mergeCells("A2:F2");
  Object.assign(ws.getCell("A2"), { value: "Карточка клиента", font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } }, alignment: { horizontal: "center" }, fill: fill(NAVY2) });
  ws.addRow([]);

  const info2 = (label, val, color) => { const r = ws.addRow(["", label, val]); r.getCell(2).font = { bold: true }; if (color) r.getCell(3).font = { bold: true, color: { argb: color } }; ws.mergeCells(`C${r.number}:F${r.number}`); };
  info2("Клиент:", customer?.name || "—");
  if (customer?.contact) info2("Контакт:", customer.contact);
  info2("Оборот всего:", moneyStr(info.turnover));
  info2("Оплачено:", moneyStr(info.paid), GREEN);
  const debtStr = moneyStr(info.debt), advStr = moneyStr(info.advance);
  if (debtStr !== "0") info2("Общий долг:", debtStr, RED);
  else if (advStr !== "0") info2("Аванс (наш долг):", advStr, GREEN);
  else info2("Долг:", "нет долга", GREEN);
  const lp = info.lastPay;
  info2("Последняя оплата:", lp ? `${nf(lp.amount)} ${SIGN[lp.currency] || lp.currency} — ${new Date(lp.date).toLocaleDateString("ru-RU")}` : "нет оплат");
  ws.addRow([]);

  // Накладные
  ws.addRow(["", "НАКЛАДНЫЕ"]).getCell(2).font = { bold: true, size: 12 };
  const ih = ws.addRow(["№", "Дата", "Сумма", "", "Позиций", ""]);
  ih.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(NAVY2); c.alignment = { horizontal: "center" }; c.border = box; });
  ws.mergeCells(`C${ih.number}:D${ih.number}`); ws.mergeCells(`E${ih.number}:F${ih.number}`);
  [...sales].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((s, i) => {
    const r = ws.addRow([i + 1, new Date(s.date).toLocaleDateString("ru-RU"), moneyStr(saleSum(s)), "", (s.items || []).length, ""]);
    r.eachCell(c => { c.border = box; });
    ws.mergeCells(`C${r.number}:D${r.number}`); ws.mergeCells(`E${r.number}:F${r.number}`);
    if (i % 2) r.eachCell(c => { c.fill = fill("FFF6F8FB"); });
  });
  ws.addRow([]);

  // Заказанные товары (агрегат)
  const agg = {};
  sales.forEach(s => (s.items || []).forEach(it => {
    const a = agg[it.product_id] = agg[it.product_id] || { qty: 0, last: 0, cur: it.currency, date: null };
    a.qty += Number(it.qty) || 0;
    if (!a.date || new Date(s.date) >= new Date(a.date)) { a.date = s.date; a.last = it.unit_price; a.cur = it.currency || s.currency; }
  }));
  ws.addRow(["", "ЗАКАЗАННЫЕ ТОВАРЫ"]).getCell(2).font = { bold: true, size: 12 };
  const ph = ws.addRow(["", "Товар", "Всего", "Посл. цена", "Посл. заказ", ""]);
  ph.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(NAVY2); c.alignment = { horizontal: "center" }; c.border = box; });
  ws.mergeCells(`E${ph.number}:F${ph.number}`);
  Object.entries(agg).sort((a, b) => b[1].qty - a[1].qty).forEach(([pid, a]) => {
    const r = ws.addRow(["", pmap[pid] || "?", a.qty, `${nf(a.last)} ${SIGN[a.cur] || a.cur}`, a.date ? new Date(a.date).toLocaleDateString("ru-RU") : "—", ""]);
    r.eachCell(c => { c.border = box; });
    ws.mergeCells(`E${r.number}:F${r.number}`);
  });
  ws.addRow([]);

  // Оплаты
  ws.addRow(["", "ИСТОРИЯ ОПЛАТ"]).getCell(2).font = { bold: true, size: 12 };
  const oh = ws.addRow(["", "Дата", "Сумма", "Комментарий", "", ""]);
  oh.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(NAVY2); c.alignment = { horizontal: "center" }; c.border = box; });
  ws.mergeCells(`D${oh.number}:F${oh.number}`);
  [...payments].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
    const r = ws.addRow(["", new Date(p.date).toLocaleDateString("ru-RU"), `${nf(p.amount)} ${SIGN[p.currency] || p.currency}`, p.note || "—", "", ""]);
    r.eachCell(c => { c.border = box; });
    ws.mergeCells(`D${r.number}:F${r.number}`);
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `klient-${safe(customer?.name)}-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
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
