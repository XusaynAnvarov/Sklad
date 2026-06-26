// ========================================================================
//  Загрузка фото в Supabase Storage через сервисный ключ (минуя RLS).
//  Принимает { dataUrl, name } → кладёт в бакет product-photos → отдаёт { url }.
// ========================================================================
import { getUser } from "./lib/auth.js";

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });
  if (!SUPA_URL || !SERVICE) return res.status(500).json({ error: "Не заданы SUPABASE_URL/SERVICE_KEY" });

  // Только авторизованный админ (Supabase Auth JWT) может загружать файлы.
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизовано" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { dataUrl, name } = body || {};
  const m = /^data:(image\/\w+);base64,(.*)$/s.exec(dataUrl || "");
  if (!m) return res.status(400).json({ error: "Неверный формат фото" });

  const ext = (m[1].split("/")[1] || "jpg").replace("jpeg", "jpg");
  const safe = String(name || "photo").replace(/\.[^.]+$/, "").replace(/[^\w\-]/g, "_").slice(-40);
  const path = `${Date.now()}_${safe || "photo"}.${ext}`;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 6 * 1024 * 1024) return res.status(413).json({ error: "Файл больше 6 МБ" });

  const SB = { apikey: SERVICE, Authorization: "Bearer " + SERVICE };
  try {
    let r = await fetch(`${SUPA_URL}/storage/v1/object/product-photos/${path}`, {
      method: "POST",
      headers: { ...SB, "Content-Type": m[1], "x-upsert": "true" },
      body: buf,
    });
    // если бакета нет — создаём публичный и пробуем снова
    if (!r.ok) {
      const txt = await r.text();
      if (/bucket not found/i.test(txt) || r.status === 404 || r.status === 400) {
        await fetch(`${SUPA_URL}/storage/v1/bucket`, {
          method: "POST",
          headers: { ...SB, "Content-Type": "application/json" },
          body: JSON.stringify({ id: "product-photos", name: "product-photos", public: true, file_size_limit: 8388608 }),
        }).catch(() => {});
        r = await fetch(`${SUPA_URL}/storage/v1/object/product-photos/${path}`, {
          method: "POST",
          headers: { ...SB, "Content-Type": m[1], "x-upsert": "true" },
          body: buf,
        });
      }
      if (!r.ok) return res.status(500).json({ error: "Storage: " + (await r.text()).slice(0, 200) });
    }
    return res.status(200).json({ url: `${SUPA_URL}/storage/v1/object/public/product-photos/${path}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
