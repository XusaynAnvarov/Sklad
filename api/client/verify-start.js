// POST /api/client/verify-start  — начать верификацию телефона через Telegram
// Body: { phone }
// Returns: { token, bot_url }
import { normPhone, genVerifToken } from "../lib/clientauth.js";
import { sget, supsert } from "../lib/supa.js";

const BOT = process.env.CLIENT_BOT_USERNAME || "generalmodernbot";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const phone = normPhone(body?.phone);
  if (phone.length < 7) return res.status(400).json({ error: "Некорректный номер телефона" });

  try {
    // проверяем блокировку
    const blocked = await sget(`blocked_phones?phone=eq.${encodeURIComponent(phone)}&select=phone`);
    if (blocked.length) return res.status(403).json({ error: "Этот номер заблокирован. Обратитесь к продавцу." });

    // проверяем, нет ли уже аккаунта
    const exists = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (exists.length) return res.status(409).json({ error: "Аккаунт с таким номером уже существует" });

    // удаляем старые верификации для этого телефона
    try { await fetch(process.env.SUPABASE_URL + "/rest/v1/site_verifications?phone=eq." + encodeURIComponent(phone), {
      method: "DELETE",
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + process.env.SUPABASE_SERVICE_KEY },
    }); } catch {}

    const token = genVerifToken();
    const expires_at = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 час
    await supsert("site_verifications", { token, phone, verified: false, expires_at, created_at: new Date().toISOString() });

    return res.status(200).json({
      token,
      bot_url: `https://t.me/${BOT}?start=verify_${token}`,
    });
  } catch (e) {
    console.error("verify-start error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
