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
