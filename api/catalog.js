// GET /api/catalog — публичный каталог (без цен, без авторизации)
import { sget } from "./lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // пробуем catalog_view, если нет — берём products напрямую
    let products = [];
    try {
      products = await sget("catalog_view?select=id,name,category,photo_url,status&order=category.asc,name.asc");
    } catch {
      const raw = await sget("products?select=id,name,category,photo_url,qty&order=category.asc,name.asc");
      products = raw.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category || "",
        photo_url: p.photo_url || null,
        status: (p.qty || 0) > 0 ? "available" : "out_of_stock",
      }));
    }
    return res.status(200).json(products);
  } catch (e) {
    console.error("catalog error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
