// Универсальный CRUD-прокси для склад-панели.
// Запросы идут через service_key — RLS полностью минуется.
//
// GET  /api/admin/db?table=products          → [] (list)
// GET  /api/admin/db?table=products&id=xxx   → {} (single)
// POST /api/admin/db  {table, op:"upsert",   data:{...}}
// POST /api/admin/db  {table, op:"delete",   id:"..."}
// POST /api/admin/db  {table:"settings", op:"save", data:{...}}
import { getUser } from "../lib/auth.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders(extra = {}) {
  return { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", ...extra };
}

// Белый список таблиц. Запросы идут с сервисным ключом (RLS не действует),
// поэтому имя таблицы нельзя брать из запроса как есть — иначе через эту ручку
// достанут любую таблицу базы, включая учётные записи клиентов.
const TABLES = new Set(["products", "customers", "sales", "purchases", "payments", "videos", "trash", "settings"]);
// id у нас — uuid или короткий слаг; ничего другого в фильтр не пускаем
const okId = (v) => /^[\w-]{1,64}$/.test(String(v || ""));

async function sbGet(path) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: sbHeaders() });
  if (!r.ok) throw new Error("DB GET " + r.status + ": " + (await r.text()).slice(0, 300));
  return r.json();
}
async function sbPost(path, body) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, {
    method: "POST", headers: sbHeaders({ Prefer: "return=representation" }), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("DB POST " + r.status + ": " + (await r.text()).slice(0, 300));
  const txt = await r.text(); return txt ? JSON.parse(txt) : null;
}
async function sbPatch(path, body) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, {
    method: "PATCH", headers: sbHeaders({ Prefer: "return=representation" }), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("DB PATCH " + r.status + ": " + (await r.text()).slice(0, 300));
  const txt = await r.text(); return txt ? JSON.parse(txt) : null;
}
async function sbDelete(path) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { method: "DELETE", headers: sbHeaders() });
  if (!r.ok) throw new Error("DB DELETE " + r.status + ": " + (await r.text()).slice(0, 300));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_KEY не заданы" });

  try {
    // ── GET: list или single ──────────────────────────────────────────────
    if (req.method === "GET") {
      const table = req.query?.table;
      const id    = req.query?.id;
      if (!table) return res.status(400).json({ error: "table required" });
      if (!TABLES.has(table)) return res.status(400).json({ error: "Неизвестная таблица" });

      if (id) {
        if (!okId(id)) return res.status(400).json({ error: "Неверный id" });
        const rows = await sbGet(`${table}?id=eq.${encodeURIComponent(id)}&limit=1`);
        return res.json((rows && rows[0]) || null);
      }
      // ПАКЕТНОЕ чтение: ?ids=a,b,c — одним запросом вместо N.
      // Ради этого и сделано: при сохранении накладной на 50 позиций браузер
      // раньше слал по 3 запроса на товар и упирался в лимит соединений.
      const idsRaw = req.query?.ids;
      if (idsRaw) {
        const ids = String(idsRaw).split(",").map(s => s.trim()).filter(Boolean);
        if (!ids.length) return res.json([]);
        if (ids.length > 500) return res.status(400).json({ error: "слишком много id (максимум 500)" });
        if (!ids.every(okId)) return res.status(400).json({ error: "Неверный id в списке" });
        const rows = await sbGet(`${table}?id=in.(${encodeURIComponent(ids.join(","))})`);
        return res.json(rows || []);
      }
      if (table === "settings") {
        const rows = await sbGet("settings?limit=1");
        return res.json((rows && rows[0]) || null);
      }
      // пагинация для полной выгрузки (бэкап): ?limit=&offset=
      const lim = req.query?.limit, off = req.query?.offset;
      let q = `${table}?order=created_at.desc`;
      if (lim !== undefined) q += `&limit=${encodeURIComponent(lim)}&offset=${encodeURIComponent(off || 0)}`;
      const rows = await sbGet(q);
      return res.json(rows || []);
    }

    // ── POST: upsert / delete / save-settings ─────────────────────────────
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
      const { table, op, data, id } = body || {};
      if (!table) return res.status(400).json({ error: "table required" });
      if (!TABLES.has(table)) return res.status(400).json({ error: "Неизвестная таблица" });

      // ПАКЕТНАЯ запись: data — массив записей, один запрос вместо N.
      // PostgREST сам делает upsert по первичному ключу при resolution=merge-duplicates.
      if (op === "upsert_many") {
        if (!Array.isArray(data)) return res.status(400).json({ error: "data должен быть массивом" });
        const rows = data.filter(r => r && typeof r === "object");
        if (!rows.length) return res.json([]);
        if (rows.length > 500) return res.status(400).json({ error: "слишком много записей (максимум 500)" });
        if (!rows.every(r => okId(r.id))) return res.status(400).json({ error: "у каждой записи должен быть корректный id" });
        const r = await fetch(SB_URL + "/rest/v1/" + table, {
          method: "POST",
          headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=representation" }),
          body: JSON.stringify(rows),
        });
        if (!r.ok) throw new Error("DB UPSERT_MANY " + r.status + ": " + (await r.text()).slice(0, 300));
        const txt = await r.text();
        return res.json(txt ? JSON.parse(txt) : rows);
      }

      if (op === "delete" || op === "remove") {
        if (!id) return res.status(400).json({ error: "id required for delete" });
        if (!okId(id)) return res.status(400).json({ error: "Неверный id" });
        await sbDelete(`${table}?id=eq.${encodeURIComponent(id)}`);
        return res.json({ ok: true });
      }

      if (op === "save" || op === "saveSettings") {
        const rows  = await sbGet("settings?limit=1");
        const cur   = rows && rows[0];
        if (!cur) {
          // строки настроек ещё нет — создаём (singleton)
          const created = await sbPost("settings", data);
          return res.json((Array.isArray(created) ? created[0] : created) || data);
        }
        const patched = await sbPatch(`settings?id=eq.${cur.id}`, data);
        return res.json((patched && patched[0]) || { ...cur, ...data });
      }

      if (!data) return res.status(400).json({ error: "data required" });

      if (data.id) {
        if (!okId(data.id)) return res.status(400).json({ error: "Неверный id" });
        // обновление существующей записи; если её НЕТ (напр. восстановление из корзины) — вставляем заново с тем же id
        const rows = await sbPatch(`${table}?id=eq.${encodeURIComponent(data.id)}`, data);
        if (rows && rows.length) return res.json(rows[0]);
        const created = await sbPost(table, data);
        return res.json((Array.isArray(created) ? created[0] : created) || data);
      } else {
        // вставка новой записи
        const rows = await sbPost(table, data);
        return res.json((Array.isArray(rows) ? rows[0] : rows) || data);
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("[admin/db]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
