// GET /api/catalog — публичный каталог (без цен, без авторизации)
// Статусы: in_stock / out_stock / soon (site_status='soon') / hidden (скрыт)
// Порядок: сначала новые (created_at desc), потом по категории
import { sget } from "./lib/supa.js";
import { getSiteAdmin } from "./lib/siteadmin.js";

const NEW_DAYS = 7; // товар считается «новинкой» N дней после добавления или последнего прихода

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  // Ответ владельцу НЕ кэшируем: в нём есть остаток и продажи за неделю,
  // которые клиентам видеть нельзя (артикул теперь общий — его показываем всем).
  const isOwner = !!getSiteAdmin(req);
  if (isOwner) { res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Vary", "Authorization"); }
  else res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");

  try {
    let raw = [];
    try {
      raw = await sget(
        "products?select=id,name,category,sku,photo_url,photos,stock_qty,site_status,created_at,last_arrival_at&order=created_at.desc,name.asc"
      );
    } catch {
      try {
        raw = await sget(
          "products?select=id,name,category,photo_url,photos,stock_qty,site_status,created_at,last_arrival_at&order=created_at.desc,name.asc"
        );
      } catch {
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
      }
    }

    const freshness = p => Math.max(
      p.created_at ? new Date(p.created_at).getTime() : 0,
      p.last_arrival_at ? new Date(p.last_arrival_at).getTime() : 0
    );
    raw.sort((a, b) => freshness(b) - freshness(a));

    // Товары в активных приходах «В дороге» → статус «Скоро» если нет остатка
    let transitIds = new Set();
    try {
      const inTransit = await sget("purchases?status=eq.in_transit&select=items");
      inTransit.forEach(p => (p.items || []).forEach(it => { if (it.product_id) transitIds.add(String(it.product_id)); }));
    } catch {}

    // Сколько единиц куплено за последние 7 дней (только оформленные накладные final)
    const weekMap = {};
    try {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const recent = await sget("sales?status=eq.final&date=gte." + encodeURIComponent(since) + "&select=items,date");
      recent.forEach(s => (s.items || []).forEach(it => { if (it.product_id) weekMap[it.product_id] = (weekMap[it.product_id] || 0) + (Number(it.qty) || 0); }));
    } catch {}

    const now = Date.now();
    const products = raw
      .filter(p => p.site_status !== "hidden")
      .map(p => {
        let status;
        if (p.site_status === "soon") {
          status = "soon";
        } else if (transitIds.has(String(p.id)) && (p.stock_qty || 0) <= 0) {
          status = "soon";
        } else if ((p.stock_qty || 0) > 0) {
          status = "in_stock";
        } else {
          status = "out_stock";
        }

        const ref = freshness(p);
        const ageDays = ref ? (now - ref) / 86400000 : 999;

        return {
          id: p.id,
          // Полное название, как в складе: клиенты ищут детали по артикулу,
          // поэтому он должен остаться и внутри имени. Отдельным полем sku — тоже.
          name: p.name,
          sku: p.sku || "",
          category: p.category || "",
          photo_url: p.photo_url || null,
          // все фото товара (для галереи у клиента); если колонки photos нет — из photo_url
          photos: (Array.isArray(p.photos) && p.photos.length) ? p.photos : (p.photo_url ? [p.photo_url] : []),
          status,
          is_new: ageDays <= NEW_DAYS,
          // ХИТ недели — только признак (да/нет). Само число продаж клиенту не отдаём.
          hit: (weekMap[p.id] || 0) > 0,
          // Числа (остаток, продажи за неделю) — ТОЛЬКО владельцу.
          // Клиент видит лишь «есть / нет / скоро» — ни количества, ни цен.
          ...(isOwner ? {
            stock: Number(p.stock_qty) || 0,
            week_sold: weekMap[p.id] || 0,
          } : {}),
        };
      });

    return res.status(200).json(products);
  } catch (e) {
    console.error("catalog error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
