// ========================================================================
//  ЖУРНАЛ ИЗМЕНЕНИЙ ОСТАТКОВ.
//
//  Склад хранит только нынешний остаток, поэтому вопрос «откуда взялись
//  эти 300 штук» раньше оставался без ответа. Теперь каждая запись
//  остатка оставляет строку: было, стало, когда, почему.
//
//  Пишем ЗДЕСЬ, на сервере, а не в браузере: через этот же сервер идут и
//  склад на сайте, и склад в телефоне, — значит ни одно изменение не
//  пройдёт мимо журнала.
//
//  Таблицы может не быть (db/stock-log-migration.sql ещё не выполнен) —
//  тогда журнал молча не ведётся: ломать из-за него запись остатков
//  нельзя.
// ========================================================================
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const заголовки = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

let таблицаЕсть = null;          // null — ещё не проверяли
export const журналВедётся = () => таблицаЕсть !== false;

const число = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

// Остатки товаров ДО записи: одним запросом.
export async function остаткиДо(ids) {
  const чистые = [...new Set((ids || []).map(String).filter(id => /^[\w-]{1,64}$/.test(id)))];
  if (!чистые.length || таблицаЕсть === false) return {};
  try {
    const r = await fetch(`${SB_URL}/rest/v1/products?id=in.(${чистые.map(x => `"${x}"`).join(",")})&select=id,name,stock_qty`, { headers: заголовки });
    if (!r.ok) return {};
    const rows = await r.json();
    return Object.fromEntries(rows.map(p => [String(p.id), p]));
  } catch { return {}; }
}

// Записать изменения. rows — то, что записали в products; было — снимок «до».
export async function записать(rows, было, { причина = "", документ = "", кто = "" } = {}) {
  if (таблицаЕсть === false) return 0;
  const строки = [];
  for (const row of rows || []) {
    if (!row || row.stock_qty === undefined) continue;     // остаток не трогали
    const старое = было[String(row.id)] || {};
    const b = число(старое.stock_qty), a = число(row.stock_qty);
    if (b !== null && a !== null && Math.abs(a - b) < 0.0001) continue;   // ничего не изменилось
    строки.push({
      product_id: String(row.id),
      name: старое.name || row.name || null,
      before_qty: b, after_qty: a,
      diff: b === null || a === null ? null : Math.round((a - b) * 1000) / 1000,
      reason: причина || null, doc: документ || null, who: кто || null,
    });
  }
  if (!строки.length) return 0;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/stock_log`, {
      method: "POST", headers: { ...заголовки, Prefer: "return=minimal" }, body: JSON.stringify(строки),
    });
    if (r.ok) { таблицаЕсть = true; return строки.length; }
    const текст = (await r.text()).slice(0, 200);
    // таблицы нет — журнал просто не ведём, дальше не пробуем
    if (/stock_log/.test(текст) && /(does not exist|schema cache|PGRST205)/.test(текст)) таблицаЕсть = false;
    return 0;
  } catch { return 0; }
}
