// GET /api/catalog — публичный каталог (без цен, без авторизации)
// Статусы: in_stock / out_stock / soon (site_status='soon') / hidden (скрыт)
// Порядок: сначала новые (created_at desc), потом по категории
import { sget } from "./lib/supa.js";

const NEW_DAYS = 14; // товар считается «новинкой» N дней после добавления

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    let raw = [];
    try {
      raw = await sget(
        "products?select=id,name,category,photo_url,stock_qty,site_status,created_at&order=created_at.desc,name.asc"
      );
    } catch {
      // fallback если site_status ещё не добавлена в Supabase
      raw = await sget(
        "products?select=id,name,category,photo_url,stock_qty,created_at&order=created_at.desc,name.asc"
      );
    }

    const now = Date.now();
    const products = raw
      .filter(p => p.site_status !== "hidden")
      .map(p => {
        let status;
        if (p.site_status === "soon") {
          status = "soon";
        } else if ((p.stock_qty || 0) > 0) {
          status = "in_stock";
        } else {
          status = "out_stock";
        }

        const ageDays = p.created_at
          ? (now - new Date(p.created_at).getTime()) / 86400000
          : 999;

        return {
          id: p.id,
          name: p.name,
          category: p.category || "",
          photo_url: p.photo_url || null,
          status,
          is_new: ageDays <= NEW_DAYS,
        };
      });

    return res.status(200).json(products);
  } catch (e) {
    console.error("catalog error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
