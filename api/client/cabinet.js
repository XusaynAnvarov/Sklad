// GET /api/client/cabinet — всё для личного кабинета одним ответом:
// сводка, накладные с фото, заказы, оплаты, история цен по товарам.
//
// Доступ: клиент определяется ТОЛЬКО по customer_id из подписанного токена.
// Параметров у запроса нет — подменить чужой id негде. Каждая выборка ниже
// отфильтрована по этому customer_id, поэтому чужие цены и накладные сюда
// попасть не могут. Закупочные цены и себестоимость не читаются вовсе.
import { getValidClient } from "../lib/clientauth.js";
import { sget, okId } from "../lib/supa.js";
import { этапыДляНакладных } from "../lib/fulfillment.js";
import { собратьКабинет } from "../lib/cabinetdata.js";
import { главноеФото } from "../../js/photo.js";

const eid = (v) => encodeURIComponent(String(v || ""));

// Товары читаем пачками: длинный список id не влезет в один адрес.
// От полного набора полей к скромному — на старой базе unit/code может не быть.
const ПОЛЯ = [
  "id,name,category,sku,code,unit,photo_url,photos",
  "id,name,category,sku,photo_url,photos",
  "id,name,category,photo_url",
];
async function товарыПоId(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 120) {
    const часть = ids.slice(i, i + 120);
    let строки = null, ошибка = null;
    for (const поля of ПОЛЯ) {
      try { строки = await sget(`products?id=in.(${eid(часть.join(","))})&select=${поля}`); break; }
      catch (e) { ошибка = e; }
    }
    if (!строки) throw ошибка;
    out.push(...строки);
  }
  return out.map(p => ({
    id: p.id,
    name: p.name || "",
    sku: p.sku || p.code || "",
    unit: p.unit || "шт",
    category: p.category || "",
    photo: главноеФото(p) || null,
  }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id) return res.status(200).json(собратьКабинет({ customer: null, sales: [], payments: [], products: [] }));
  if (!okId(client.customer_id)) return res.status(400).json({ error: "Неверный клиент" });

  try {
    const cid = eid(client.customer_id);
    const [customers, sales, payments] = await Promise.all([
      sget(`customers?id=eq.${cid}&select=id,name,contact,opening_debt`),
      sget(`sales?customer_id=eq.${cid}&select=id,date,created_at,currency,status,source,items&order=date.desc`),
      sget(`payments?customer_id=eq.${cid}&select=id,amount,currency,date,note&order=date.desc`),
    ]);
    const ids = [...new Set((sales || []).flatMap(s => (s.items || []).map(i => i.product_id)).filter(okId).map(String))];
    const [products, этапы] = await Promise.all([
      ids.length ? товарыПоId(ids) : [],
      этапыДляНакладных(sales || []),
    ]);
    return res.status(200).json(собратьКабинет({ customer: customers[0] || null, sales, payments, products, этапы }));
  } catch (e) {
    console.error("client/cabinet error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
