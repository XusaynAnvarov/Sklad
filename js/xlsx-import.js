// ========================================================================
//  Импорт из Excel (SheetJS через CDN). Шаблоны с фиксированными колонками
//  и толерантный парсинг (регистр/синонимы заголовков).
//  kind: "products" | "purchase" | "sale"
// ========================================================================
let _xlsx = null;
async function lib() { if (!_xlsx) _xlsx = await import("https://esm.sh/xlsx@0.18.5"); return _xlsx; }

const HEADERS = {
  products: ["Название", "Категория", "Количество", "Себестоимость", "Валюта"],
  purchase: ["Название", "Количество", "Себестоимость"],
  sale: ["Название", "Количество", "Цена"],
};
const SAMPLE = {
  products: ["Пример: Наушники TWS", "Электроника", 10, 50, "юань"],
  purchase: ["Пример: Наушники TWS", 10, 50],
  sale: ["Пример: Наушники TWS", 2, 80],
};

export async function downloadTemplate(kind) {
  const XLSX = await lib();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS[kind], SAMPLE[kind]]);
  ws["!cols"] = HEADERS[kind].map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Шаблон");
  XLSX.writeFile(wb, `shablon-${kind}.xlsx`);
}

function pick(low, keys) { for (const k of keys) { const v = low[k]; if (v !== undefined && v !== "") return v; } return ""; }
function num(v) { const n = parseFloat(String(v).replace(",", ".").replace(/[^\d.\-]/g, "")); return isFinite(n) ? n : 0; }
function normCur(v) { v = String(v).toLowerCase(); if (/юан|yuan|cny|¥/.test(v)) return "yuan"; if (/долл|usd|\$/.test(v)) return "usd"; if (/сум|som|uzs/.test(v)) return "som"; return "yuan"; }

function normalize(row, kind) {
  const low = {}; for (const k in row) low[String(k).trim().toLowerCase()] = row[k];
  const name = String(pick(low, ["название", "наименование", "товар", "name"])).trim();
  if (!name) return null;
  const qty = num(pick(low, ["количество", "кол-во", "колво", "qty", "остаток"]));
  if (kind === "products") return { name, category: String(pick(low, ["категория", "category"])).trim(), qty, cost: num(pick(low, ["себестоимость", "себест", "cost", "цена"])), currency: normCur(pick(low, ["валюта", "currency"])) };
  if (kind === "purchase") return { name, qty, cost: num(pick(low, ["себестоимость", "себест", "cost", "цена", "price"])) };
  if (kind === "sale") return { name, qty, price: num(pick(low, ["цена", "price", "стоимость", "сумма за ед"])) };
  return null;
}

export async function parseRows(file, kind) {
  const XLSX = await lib();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  return rows.map(r => normalize(r, kind)).filter(Boolean);
}

// Скрытый file-input для выбора .xlsx → onPick(File)
export function pickFile(onPick) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".xlsx,.xls,.csv"; inp.style.display = "none";
  inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) onPick(f); };
  document.body.append(inp); inp.click();
}
