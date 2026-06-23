// GET  /api/admin/db?table=products[&id=xxx]   → list / get
// POST /api/admin/db  { table, op, data, id }   → upsert / delete / getSettings / saveSettings
import { getUser } from "../lib/auth.js";
import { sget, supsert, spatch } from "../lib/supa.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbFetch(path, method = "GET", body) {
  const headers = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: "return=representation" };
  const r = await fetch(SB_URL + "/rest/v1/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error("Supabase " + method + " " + r.status + ": " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  try {
    if (req.method === "GET") {
      const { table, id } = req.query || {};
      if (!table) return res.status(400).json({ error: "table required" });
      if (id) {
        const rows = await sbFetch(`${table}?id=eq.${id}&limit=1`);
        return res.json((rows && rows[0]) || null);
      }
      // settings — одна строка
      if (table === "settings") {
        const rows = await sbFetch("settings?limit=1");
        return res.json((rows && rows[0]) || null);
      }
      const rows = await sbFetch(`${table}?order=created_at.desc`);
      return res.json(rows || []);
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
      const { table, op, data, id } = body || {};
      if (!table) return res.status(400).json({ error: "table required" });

      if (op === "delete" || op === "remove") {
        if (!id) return res.status(400).json({ error: "id required for delete" });
        await sbFetch(`${table}?id=eq.${id}`, "DELETE");
        return res.json({ ok: true });
      }

      if (op === "saveSettings") {
        // обновляем первую строку settings
        const rows = await sbFetch("settings?limit=1");
        const cur = rows && rows[0];
        if (!cur) return res.status(500).json({ error: "settings row not found" });
        const updated = await sbFetch(`settings?id=eq.${cur.id}`, "PATCH", data);
        return res.json((updated && updated[0]) || cur);
      }

      // upsert
      if (!data) return res.status(400).json({ error: "data required" });
      if (data.id) {
        // update existing
        const updated = await sbFetch(`${table}?id=eq.${data.id}`, "PATCH", data);
        return res.json((updated && updated[0]) || data);
      } else {
        // insert new
        const inserted = await sbFetch(table, "POST", data);
        return res.json((Array.isArray(inserted) ? inserted[0] : inserted) || data);
      }
    }

    if (req.method === "DELETE") {
      const { table, id } = req.query || {};
      if (!table || !id) return res.status(400).json({ error: "table and id required" });
      await sbFetch(`${table}?id=eq.${id}`, "DELETE");
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
