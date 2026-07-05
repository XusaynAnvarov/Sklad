// GET /api/videos — список видео (только id+title) для ВОШЕДШИХ клиентов.
import { getValidClient } from "./lib/clientauth.js";
import { sget } from "./lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Войдите, чтобы смотреть видео" });
  try {
    const rows = await sget("videos?select=id,title,created_at,product_id&order=created_at.desc");
    if (!Array.isArray(rows) || !rows.length) return res.status(200).json([]);
    // подтянуть фото+имя привязанных товаров (чтобы клиент видел, к какому товару видео)
    const pids = [...new Set(rows.map(v => v.product_id).filter(Boolean))];
    let pmap = {};
    if (pids.length) {
      try {
        const prods = await sget(`products?id=in.(${pids.map(encodeURIComponent).join(",")})&select=id,name,photo_url,photos`);
        prods.forEach(p => { pmap[p.id] = { name: p.name, photo: (p.photos && p.photos[0]) || p.photo_url || null }; });
      } catch {}
    }
    return res.status(200).json(rows.map(v => {
      const p = v.product_id ? pmap[v.product_id] : null;
      return { id: v.id, title: v.title || "", product_name: p?.name || null, product_photo: p?.photo || null };
    }));
  } catch (e) {
    return res.status(200).json([]); // таблицы ещё нет — пустой список
  }
}
