// POST /api/client/login-start — шаг 1 входа: отправить одноразовый код в Telegram-бот клиента
// Body: { phone }  → Returns { ok:true }
import { normPhone, genCode, hashCode, hashDevice } from "../lib/clientauth.js";
import { sget, spatch } from "../lib/supa.js";
import { isAdminPhone } from "../lib/siteadmin.js";

const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const BOT = process.env.CLIENT_BOT_USERNAME || "generalmodernbot";
const PUBLIC_URL = process.env.PUBLIC_URL || "https://generalmodern.uz";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const phone = normPhone(body?.phone);
  const deviceId = String(body?.device_id || "");
  if (phone.length < 7) return res.status(400).json({ error: "Некорректный номер телефона" });

  // администратору код из Telegram не нужен — вход по паролю
  if (isAdminPhone(phone)) return res.status(200).json({ ok: true, code_required: false });

  try {
    const blocked = await sget(`blocked_phones?phone=eq.${encodeURIComponent(phone)}&select=phone`);
    if (blocked.length) return res.status(403).json({ error: "Этот номер заблокирован. Обратитесь к продавцу." });

    let rows;
    try { rows = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=id,customer_id,chat_id,known_devices`); }
    catch { rows = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=id,customer_id,chat_id`); }
    const acc = rows[0];
    if (!acc) return res.status(404).json({ error: "Аккаунт не найден. Сначала зарегистрируйтесь." });

    // известное (доверенное) устройство → код не нужен, вход по паролю
    const known = Array.isArray(acc.known_devices) ? acc.known_devices : [];
    if (deviceId && known.includes(hashDevice(deviceId)))
      return res.status(200).json({ ok: true, code_required: false });

    // chat_id: из аккаунта, иначе из привязанного клиента склада
    let chatId = acc.chat_id || null;
    if (!chatId && acc.customer_id) {
      try { const c = (await sget(`customers?id=eq.${acc.customer_id}&select=tg_chat_id`))[0]; chatId = c?.tg_chat_id || null; } catch {}
    }
    if (!chatId) return res.status(409).json({ error: `Откройте Telegram-бота @${BOT} и нажмите /start, затем повторите вход.` });
    if (!CLIENT_TOKEN) return res.status(500).json({ error: "CLIENT_BOT_TOKEN не задан на сервере" });

    const code = genCode();
    const exp = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 минут
    try {
      await spatch(`site_accounts?id=eq.${acc.id}`, { login_code: hashCode(code), login_code_exp: exp, login_attempts: 0, chat_id: String(chatId) });
    } catch (e) {
      return res.status(500).json({ error: "Колонки кода входа не созданы — запустите db/site-auth.sql в Supabase" });
    }

    const text = `🔐 Код для входа на generalmodern.uz:\n\n*${code}*\n\nДействует 5 минут. Никому не сообщайте этот код.`;
    const reply_markup = { inline_keyboard: [[{ text: "🌐 Вернуться на сайт", url: PUBLIC_URL }]] };
    const r = await fetch(`https://api.telegram.org/bot${CLIENT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", reply_markup }),
    });
    const j = await r.json();
    if (!j.ok) return res.status(502).json({ error: `Не удалось отправить код. Откройте бота @${BOT}, нажмите /start и повторите.` });

    return res.status(200).json({ ok: true, code_required: true });
  } catch (e) {
    console.error("login-start error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
