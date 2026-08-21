// ========================================================================
//  ССЫЛКА ДЛЯ ПРОВЕРКИ.
//  Владелец хочет дать одному человеку посмотреть склад и поискать ошибки.
//  Отдаём ссылку с гостевым токеном: он открывает склад в обычном браузере,
//  БЕЗ Telegram, и работает только на просмотр — сервер не пустит гостя ни
//  на одну запись (api/lib/auth.js, api/admin/db.js).
//
//  Срок жизни короткий и задаётся при выдаче. Ссылка без срока живёт вечно
//  и рано или поздно оказывается там, где ей быть не нужно.
// ========================================================================
import { getUser } from "../lib/auth.js";
import { signRoleJWT } from "../lib/tg.js";

const PUBLIC_URL = process.env.PUBLIC_URL || "https://generalmodern.uz";
const ЧАСОВ_ПО_УМОЛЧАНИЮ = 24;
const МАКСИМУМ_ЧАСОВ = 24 * 14;          // две недели — дольше проверка не длится

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });

  // Выдать ссылку может ТОЛЬКО владелец. Гостю здесь делать нечего —
  // иначе он выпишет себе новую ссылку, когда истечёт старая.
  const user = await getUser(req);
  if (!user || user.role !== "admin") return res.status(401).json({ error: "Не авторизован" });

  const secret = process.env.SITE_JWT_SECRET;
  if (!secret) return res.status(500).json({ error: "SITE_JWT_SECRET не задан" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  let часов = Number((body || {}).hours);
  if (!isFinite(часов) || часов <= 0) часов = ЧАСОВ_ПО_УМОЛЧАНИЮ;
  часов = Math.min(Math.round(часов), МАКСИМУМ_ЧАСОВ);

  const token = signRoleJWT(secret, "guest", часов * 3600);
  const url = `${PUBLIC_URL}/sklad?guest=${encodeURIComponent(token)}`;

  return res.json({
    url,
    hours: часов,
    expires_at: new Date(Date.now() + часов * 3600 * 1000).toISOString(),
    note: "Только просмотр. Менять данные по этой ссылке нельзя.",
  });
}
