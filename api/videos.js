// GET /api/videos — список видео (только id+title) для ВОШЕДШИХ клиентов.
import { getValidClient } from "./lib/clientauth.js";
import { sget } from "./lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Войдите, чтобы смотреть видео" });
  try {
    const rows = await sget("videos?select=id,title,created_at&order=created_at.desc");
    return res.status(200).json(Array.isArray(rows) ? rows.map(v => ({ id: v.id, title: v.title || "" })) : []);
  } catch (e) {
    return res.status(200).json([]); // таблицы ещё нет — пустой список
  }
}
