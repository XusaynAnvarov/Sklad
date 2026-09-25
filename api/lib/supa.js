// ========================================================================
//  Мини-обёртка Supabase REST (service-ключ, серверная сторона)
// ========================================================================
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
import { забыть } from "./memcache.js";

// Любая запись — бот, заказ клиента, оплата — стирает короткую память
// сервера: иначе склад и каталог несколько секунд показывали бы старое.
const устарело = () => { забыть("db:"); забыть("catalog"); };

const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

// Идентификаторы уходят прямо в фильтр PostgREST (id=eq.… / id=in.(…)),
// поэтому пропускаем только безопасный набор символов — даже если значение
// пришло из подписанного токена или из самой базы.
export const okId = (v) => /^[\w-]{1,64}$/.test(String(v || ""));

export async function sget(path) {
  const r = await fetch(URL + "/rest/v1/" + path, { headers: H });
  if (!r.ok) throw new Error("supabase GET " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}
export async function supsert(table, body) {
  const r = await fetch(URL + "/rest/v1/" + table, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(body) });
  устарело();
  if (!r.ok) throw new Error("supabase UPSERT " + r.status + ": " + (await r.text()).slice(0, 200));
}
export async function spatch(path, body) {
  const r = await fetch(URL + "/rest/v1/" + path, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(body) });
  устарело();
  if (!r.ok) throw new Error("supabase PATCH " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}
