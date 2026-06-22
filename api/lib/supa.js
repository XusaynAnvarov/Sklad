// ========================================================================
//  Мини-обёртка Supabase REST (service-ключ, серверная сторона)
// ========================================================================
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

export async function sget(path) {
  const r = await fetch(URL + "/rest/v1/" + path, { headers: H });
  if (!r.ok) throw new Error("supabase GET " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}
export async function supsert(table, body) {
  const r = await fetch(URL + "/rest/v1/" + table, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("supabase UPSERT " + r.status + ": " + (await r.text()).slice(0, 200));
}
export async function spatch(path, body) {
  const r = await fetch(URL + "/rest/v1/" + path, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("supabase PATCH " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}

export default (_, res) => res?.status(404).json({ error: 'Not an endpoint' });
