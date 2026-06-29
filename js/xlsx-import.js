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

// --- Фолбэк для файлов БЕЗ строки заголовков (напр. экспортированная накладная:
//     № | Товар | Кол-во | Цена | Сумма | Валюта, иногда с шапкой/итогами) ---
const isNumeric = (v) => v !== "" && v != null && isFinite(num(v)) && /\d/.test(String(v));
const CUR_RE = /^(сум|сом|som|uzs|\$|usd|долл\w*|¥|юан\w*|yuan|cny)$/i;
const SKIP_RE = /^(№|n|no|название|наименование|товар|категория|кол-?во|количество|цена|себестоимость|сумма|валюта|итого|клиент|дата|general\s*modern.*)$/i;

function positionalRow(row, kind) {
  if (!Array.isArray(row)) return null;
  const cells = row.map(c => (c == null ? "" : c));
  // имя = первая текстовая ячейка (не число, не валюта); № в начале пропускаем
  let nameIdx = -1;
  for (let i = 0; i < cells.length; i++) {
    const s = String(cells[i]).trim();
    if (!s || isNumeric(s) || CUR_RE.test(s)) continue;
    if (SKIP_RE.test(s.replace(/[:.\s]+$/, ""))) return null; // заголовок/шапка/итог (терпим к «Дата:», «ИТОГО:») — пропускаем
    nameIdx = i; break;
  }
  if (nameIdx < 0) return null;
  const name = String(cells[nameIdx]).trim();
  const nums = [];
  for (let i = nameIdx + 1; i < cells.length; i++) if (isNumeric(cells[i])) nums.push(num(cells[i]));
  if (!nums.length) return null;                 // нет чисел после имени → не товарная строка
  let currency = "";
  for (const c of cells) { const s = String(c).trim(); if (CUR_RE.test(s)) { currency = normCur(s); break; } }
  if (kind === "sale") return { name, qty: nums[0] || 1, price: nums[1] != null ? nums[1] : 0, currency };
  if (kind === "purchase") return { name, qty: nums[0] || 1, cost: nums[1] != null ? nums[1] : 0 };
  if (kind === "products") return { name, category: "", qty: nums[0] || 0, cost: nums[1] != null ? nums[1] : 0, currency: currency || "yuan" };
  return null;
}

export async function parseRows(file, kind) {
  const XLSX = await lib();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // 1) по заголовкам (шаблон)
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const out = rows.map(r => normalize(r, kind)).filter(Boolean);
  if (out.length) return out;
  // 2) фолбэк по позиции (файл без заголовков, напр. экспортированная накладная)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  return aoa.map(row => positionalRow(row, kind)).filter(Boolean);
}

// Скрытый file-input для выбора .xlsx → onPick(File)
export function pickFile(onPick) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".xlsx,.xls,.csv"; inp.style.display = "none";
  inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) onPick(f); };
  document.body.append(inp); inp.click();
}
