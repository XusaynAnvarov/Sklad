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


// Собрать таблицу целиком, страница за страницей.
// База отдаёт не больше своей планки за раз, поэтому размер страницы берём
// не на веру, а из первого же ответа: сколько строк реально пришло — столько
// и считаем страницей. Иначе при планке меньше PAGE мы бы решили, что данные
// кончились, и молча потеряли остальное.
export async function listAll(table, order, get, { PAGE = 1000, MAX_PAGES = 200 } = {}) {
  const all = [];
  let step = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const chunk = await get(`${table}?${order}&limit=${PAGE}&offset=${all.length}`);
    if (!Array.isArray(chunk) || !chunk.length) break;
    if (!step) step = chunk.length;
    all.push(...chunk);
    if (chunk.length < step) break;      // последняя, неполная страница
  }
  return all;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Гостя пускаем — но дальше только на чтение (см. проверку метода ниже).
  // Гостевая ссылка нужна, чтобы человек посмотрел склад и поискал ошибки;
  // менять что-либо он не должен даже случайно.
  const user = await getUser(req, { allowGuest: true });
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  if (user.role === "guest" && req.method !== "GET" && req.method !== "OPTIONS") {
    return res.status(403).json({ error: "Гостевой доступ — только просмотр" });
  }

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
      // Явная порция — для выгрузки в бэкап: ?limit=&offset=
      const lim = req.query?.limit, off = req.query?.offset;
      const ORDER = "order=created_at.desc,id.asc";   // id — чтобы порядок был устойчив между страницами
      if (lim !== undefined) {
        const rows = await sbGet(`${table}?${ORDER}&limit=${encodeURIComponent(lim)}&offset=${encodeURIComponent(off || 0)}`);
        return res.json(rows || []);
      }
      // Без limit отдаём ВСЁ, страница за страницей.
      // Раньше здесь был один запрос без limit — и база молча обрезала ответ
      // на своей планке (тысяча строк). Товар, заведённый раньше последней
      // тысячи, до приложения просто не доезжал: наклейка читалась, номер
      // разбирался, а товар «не находился». Тем же обрезанием тихо портились
      // отчёты — в них не попадало ничего старше последней тысячи продаж.
      return res.json(await listAll(table, ORDER, sbGet));
    }

    // ── POST: upsert / delete / save-settings ─────────────────────────────
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
      const { table, op, data, id } = body || {};
      if (!table) return res.status(400).json({ error: "table required" });
      if (!TABLES.has(table)) return res.status(400).json({ error: "Неизвестная таблица" });

      // ПАКЕТНАЯ запись: data — массив записей, один запрос от браузера
      // вместо N. К базе всё равно идёт по запросу на строку, но это
      // сервер рядом с базой, а не телефон через мобильный интернет.
      //
      // ОБНОВЛЯЕМ (PATCH), а не upsert-ом. Раньше здесь был POST с
      // resolution=merge-duplicates, и он падал на КАЖДОМ сохранении
      // накладной: приходят неполные строки (id, остаток, себестоимость,
      // партии), Postgres проверяет NOT NULL до разрешения конфликта —
      // и ругался «null value in column "name"». Браузер молча откатывался
      // на поштучную запись, то есть два лишних запроса каждый раз.
      // Строки, которой ещё нет, вставляем отдельно — так восстанавливают
      // запись из корзины.
      if (op === "upsert_many") {
        if (!Array.isArray(data)) return res.status(400).json({ error: "data должен быть массивом" });
        const rows = data.filter(r => r && typeof r === "object");
        if (!rows.length) return res.json([]);
        if (rows.length > 500) return res.status(400).json({ error: "слишком много записей (максимум 500)" });
        if (!rows.every(r => okId(r.id))) return res.status(400).json({ error: "у каждой записи должен быть корректный id" });
        const out = await Promise.all(rows.map(async (row) => {
          const patched = await sbPatch(`${table}?id=eq.${encodeURIComponent(row.id)}`, row);
          if (patched && patched.length) return patched[0];
          const created = await sbPost(table, row);          // записи не было — создаём
          return (Array.isArray(created) ? created[0] : created) || row;
        }));
        return res.json(out);
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
