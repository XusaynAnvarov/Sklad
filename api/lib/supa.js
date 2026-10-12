// ========================================================================
//  Мини-обёртка Supabase REST (service-ключ, серверная сторона)
// ========================================================================
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
import { забыть } from "./memcache.js";
// Своя база на этом же сервере — включается настройкой DB_MODE=local.
// Пока она выключена, всё работает через Supabase, как раньше.
import { СВОЯ_БАЗА, pgGet, pgUpsert, pgPatch, pgDelete } from "./pg.js";

// Любая запись — бот, заказ клиента, оплата — стирает короткую память
// сервера: иначе склад и каталог несколько секунд показывали бы старое.
const устарело = () => { забыть("db:"); забыть("catalog"); };

const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

// Идентификаторы уходят прямо в фильтр PostgREST (id=eq.… / id=in.(…)),
// поэтому пропускаем только безопасный набор символов — даже если значение
// пришло из подписанного токена или из самой базы.
export const okId = (v) => /^[\w-]{1,64}$/.test(String(v || ""));

export async function sget(path) {
  if (СВОЯ_БАЗА) return pgGet(path);
  const r = await fetch(URL + "/rest/v1/" + path, { headers: H });
  if (!r.ok) throw new Error("supabase GET " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}
export async function supsert(table, body) {
  if (СВОЯ_БАЗА) { await pgUpsert(table, body); return; }
  const r = await fetch(URL + "/rest/v1/" + table, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(body) });
  устарело();
  if (!r.ok) throw new Error("supabase UPSERT " + r.status + ": " + (await r.text()).slice(0, 200));
}
export async function spatch(path, body) {
  if (СВОЯ_БАЗА) return pgPatch(path, body);
  const r = await fetch(URL + "/rest/v1/" + path, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(body) });
  устарело();
  if (!r.ok) throw new Error("supabase PATCH " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}

// Удалить строки по условию (например site_accounts?id=eq.…).
export async function sdelete(path) {
  if (СВОЯ_БАЗА) { await pgDelete(path); return; }
  const r = await fetch(URL + "/rest/v1/" + path, { method: "DELETE", headers: H });
  устарело();
  if (!r.ok) throw new Error("supabase DELETE " + r.status + ": " + (await r.text()).slice(0, 200));
}

// Вставить строки и ПОЛУЧИТЬ записанное обратно (supsert ответа не ждёт).
export async function sinsert(table, body) {
  if (СВОЯ_БАЗА) return pgUpsert(table, body);
  const r = await fetch(URL + "/rest/v1/" + table, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
  устарело();
  if (!r.ok) throw new Error("supabase INSERT " + r.status + ": " + (await r.text()).slice(0, 200));
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}
