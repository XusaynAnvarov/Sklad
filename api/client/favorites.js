// /api/client/favorites — избранное клиента, общее для всех его устройств.
//   GET                          → { ids: [...] }  или { unavailable: true }, если таблицы ещё нет
//   POST { product_id, on }      → поставить/снять звёздочку
//   POST { merge: [ids] }        → перенести отмеченное на устройстве (до 200 за раз)
// Клиент — только из токена. Таблица: db/client-favorites-migration.sql.
import { getValidClient } from "../lib/clientauth.js";
import { sget, supsert, sdelete, okId } from "../lib/supa.js";

const МАКС = 500;                 // избранного на клиента
const ЛИМИТ = 300;                // запросов на клиента за 10 минут
const счёт = new Map();
function многоЗапросов(id) {
  const now = Date.now();
  const l = (счёт.get(id) || []).filter(t => now - t < 600e3);
  l.push(now); счёт.set(id, l);
  if (счёт.size > 5000) for (const [k, v] of счёт) if (!v.some(t => now - t < 600e3)) счёт.delete(k);
  return l.length > ЛИМИТ;
}
const ключ = (cid, pid) => `${cid}:${pid}`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  const cid = String(client.customer_id || "");
  if (!okId(cid)) return res.status(400).json({ error: "Профиль не привязан к аккаунту" });
  if (многоЗапросов(cid)) return res.status(429).json({ error: "Слишком много запросов" });

  let есть;
  try {
    есть = await sget(`client_favorites?customer_id=eq.${encodeURIComponent(cid)}&select=product_id&order=created_at.asc&limit=${МАКС}`);
  } catch {
    // таблица ещё не создана — кабинет продолжит хранить избранное в браузере
    return res.status(200).json({ unavailable: true });
  }
  const ids = new Set(есть.map(r => String(r.product_id)));

  if (req.method === "GET") return res.status(200).json({ ids: [...ids] });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  try {
    if (Array.isArray(body?.merge)) {
      const новые = [...new Set(body.merge.slice(0, 200).map(String))].filter(id => okId(id) && !ids.has(id));
      const место = Math.max(0, МАКС - ids.size);
      const теперь = new Date().toISOString();
      const строки = новые.slice(0, место).map(pid => ({ id: ключ(cid, pid), customer_id: cid, product_id: pid, created_at: теперь }));
      if (строки.length) await supsert("client_favorites", строки);
      строки.forEach(r => ids.add(r.product_id));
      return res.status(200).json({ ids: [...ids] });
    }
    const pid = String(body?.product_id || "");
    if (!okId(pid)) return res.status(400).json({ error: "Неверный товар" });
    if (body?.on) {
      if (!ids.has(pid)) {
        if (ids.size >= МАКС) return res.status(409).json({ error: `В избранном не больше ${МАКС} товаров` });
        await supsert("client_favorites", { id: ключ(cid, pid), customer_id: cid, product_id: pid, created_at: new Date().toISOString() });
      }
    } else if (ids.has(pid)) {
      await sdelete(`client_favorites?id=eq.${encodeURIComponent(ключ(cid, pid))}`);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("favorites error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
