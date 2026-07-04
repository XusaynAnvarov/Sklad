// ========================================================================
//  Подписанный URL для ЗАГРУЗКИ видео напрямую в приватный бакет Supabase
//  (минуя VPS/nginx — большие файлы проходят). Гард: admin-токен склада.
//  Бакет product-videos — ПРИВАТНЫЙ (создаётся при необходимости).
// ========================================================================
import { getUser } from "./lib/auth.js";

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = "product-videos";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });
  if (!SUPA_URL || !SERVICE) return res.status(500).json({ error: "Не заданы SUPABASE_URL/SERVICE_KEY" });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизовано" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const name = (body && body.name) || "video";
  const ext = (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safe = String(name).replace(/\.[^.]+$/, "").replace(/[^\w\-]/g, "_").slice(-40) || "video";
  const path = `${Date.now()}_${safe}.${ext}`;

  const SB = { apikey: SERVICE, Authorization: "Bearer " + SERVICE };
  // ВАЖНО: с Content-Type: application/json Supabase требует непустое тело → шлём "{}"
  const sign = () => fetch(`${SUPA_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: { ...SB, "Content-Type": "application/json" }, body: "{}" });

  // Гарантируем существование приватного бакета ДО подписи (иначе sign → 404 "resource does not exist")
  const ensureBucket = async () => {
    const g = await fetch(`${SUPA_URL}/storage/v1/bucket/${BUCKET}`, { headers: SB });
    if (g.ok) return null; // бакет уже есть
    // БЕЗ file_size_limit: явный лимит (100МБ) может превышать глобальный лимит
    // проекта → Supabase отвечает 413. Без него бакет наследует глобальный лимит.
    const mkBody = { id: BUCKET, name: BUCKET, public: false };
    let c = await fetch(`${SUPA_URL}/storage/v1/bucket`, {
      method: "POST", headers: { ...SB, "Content-Type": "application/json" },
      body: JSON.stringify(mkBody),
    });
    if (c.ok) return null;
    let txt = await c.text();
    // "already exists" — это ок (гонка/параллельный запрос)
    if (/exist/i.test(txt)) return null;
    return "Не удалось создать бакет: " + txt.slice(0, 200);
  };

  try {
    const bucketErr = await ensureBucket();
    if (bucketErr) return res.status(500).json({ error: bucketErr });

    let r = await sign();
    if (!r.ok) return res.status(500).json({ error: "Storage sign: " + (await r.text()).slice(0, 200) });

    const j = await r.json(); // { url: "/object/upload/sign/<bucket>/<path>?token=..." }
    return res.status(200).json({ path, uploadUrl: `${SUPA_URL}/storage/v1${j.url}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
