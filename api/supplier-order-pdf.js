// POST /api/supplier-order-pdf — PDF заказа поставщику (фото+кол-во+себестоимость).
// Гард: admin-токен склада (getUser). Тело: { supplier, currency, items:[{product_id,qty,cost,currency}] }
import { getUser } from "./lib/auth.js";
import { sget } from "./lib/supa.js";
import { buildSupplierOrderPDF } from "./lib/pdf.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизовано" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return res.status(400).json({ error: "Пустой список" });
  const supplier = String(body?.supplier || "").slice(0, 120);
  const currency = ["yuan", "usd", "som"].includes(body?.currency) ? body.currency : "yuan";

  try {
    const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
    let products = [];
    if (ids.length) products = await sget(`products?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,name,photo_url,photos`);
    const bytes = await buildSupplierOrderPDF({ items, supplier, currency, products });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="zakaz-postavshiku-${new Date().toISOString().slice(0, 10)}.pdf"`);
    return res.status(200).end(Buffer.from(bytes));
  } catch (e) {
    console.error("supplier-order-pdf error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
