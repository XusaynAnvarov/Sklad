// GET /api/video-url?id=… — временная (signed) ссылка на видео для ВОШЕДШЕГО клиента.
// Ссылка живёт 5 минут → переслать бесполезно. Бакет приватный.
import { getValidClient } from "./lib/clientauth.js";
import { sget } from "./lib/supa.js";

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = "product-videos";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "id required" });
  if (!SUPA_URL || !SERVICE) return res.status(500).json({ error: "Не заданы SUPABASE_URL/SERVICE_KEY" });
  try {
    const rows = await sget(`videos?id=eq.${encodeURIComponent(id)}&select=path`);
    const path = rows[0]?.path;
    if (!path) return res.status(404).json({ error: "Видео не найдено" });
    const r = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!r.ok) return res.status(500).json({ error: "sign: " + (await r.text()).slice(0, 150) });
    const j = await r.json(); // { signedURL: "/object/sign/<bucket>/<path>?token=..." }
    return res.status(200).json({ url: `${SUPA_URL}/storage/v1${j.signedURL}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
