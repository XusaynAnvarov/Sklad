// POST /api/client/register — завершить регистрацию после Telegram-верификации
// Body: { verif_token, password }
// Returns: { token } (JWT для входа)
import { normPhone, hashPassword, signToken, genSessionId } from "../lib/clientauth.js";
import { sget, supsert, spatch } from "../lib/supa.js";

const MIN_PASS = 6;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const { verif_token, password } = body || {};
  if (!verif_token) return res.status(400).json({ error: "Токен верификации обязателен" });
  if (!password || String(password).length < MIN_PASS) return res.status(400).json({ error: `Пароль должен быть не менее ${MIN_PASS} символов` });

  try {
    // проверяем верификацию
    const rows = await sget(`site_verifications?token=eq.${encodeURIComponent(verif_token)}&select=*`);
    const v = rows[0];
    if (!v) return res.status(404).json({ error: "Токен не найден" });
    if (!v.verified) return res.status(400).json({ error: "Telegram не подтверждён. Сначала подтвердите номер." });
    if (new Date(v.expires_at) < new Date()) return res.status(410).json({ error: "Токен истёк. Начните регистрацию заново." });

    const phone = normPhone(v.phone);

    // повторная проверка блокировки
    const blocked = await sget(`blocked_phones?phone=eq.${encodeURIComponent(phone)}&select=phone`);
    if (blocked.length) return res.status(403).json({ error: "Этот номер заблокирован." });

    // проверяем, нет ли уже аккаунта
    const exists = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (exists.length) return res.status(409).json({ error: "Аккаунт уже существует. Войдите." });

    // ищем клиента по телефону в складе
    let customer_id = null;
    let origin = "site"; // по умолчанию — пришёл напрямую с сайта
    const all = await sget("customers?select=id,contact,tg_chat_id");
    const match = all.find(c => c.contact && normPhone(c.contact) === phone && phone.length >= 7);
    if (match) {
      customer_id = match.id;
      origin = "warehouse"; // уже был клиентом склада
      // привязываем tg_chat_id если не был
      if (!match.tg_chat_id && v.chat_id) {
        try { await spatch(`customers?id=eq.${match.id}`, { tg_chat_id: String(v.chat_id) }); } catch {}
      }
    } else {
      // создаём нового клиента в складе
      const SUPA = process.env.SUPABASE_URL;
      const KEY = process.env.SUPABASE_SERVICE_KEY;
      const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=representation" };
      const r = await fetch(SUPA + "/rest/v1/customers", {
        method: "POST", headers: H,
        body: JSON.stringify({ name: phone, contact: phone, tg_chat_id: v.chat_id ? String(v.chat_id) : null }),
      });
      if (r.ok) {
        const created = await r.json();
        customer_id = (Array.isArray(created) ? created[0] : created)?.id || null;
      }
    }

    const password_hash = await hashPassword(password);
    const baseAcc = {
      phone, password_hash, customer_id, tg_verified: true,
      created_at: new Date().toISOString(), last_login: new Date().toISOString(),
    };
    // origin/tg_username — если колонок ещё нет, пишем без них (фолбэк)
    try { await supsert("site_accounts", { ...baseAcc, origin, tg_username: v.tg_username || null }); }
    catch { await supsert("site_accounts", baseAcc); }

    // удаляем использованный токен верификации
    try {
      await fetch(process.env.SUPABASE_URL + "/rest/v1/site_verifications?token=eq." + encodeURIComponent(verif_token), {
        method: "DELETE",
        headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + process.env.SUPABASE_SERVICE_KEY },
      });
    } catch {}

    const accounts = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=id,customer_id`);
    const acc = accounts[0];
    // активная сессия для нового аккаунта (single-session)
    const sid = genSessionId();
    try { await spatch(`site_accounts?id=eq.${acc.id}`, { session_id: sid, chat_id: v.chat_id ? String(v.chat_id) : null }); } catch {}
    // уведомление владельцу: новый клиент зарегистрировался (через сайт + Telegram-верификацию)
    try {
      const AT = process.env.TELEGRAM_BOT_TOKEN, AC = process.env.ADMIN_CHAT_ID;
      if (AT && AC) {
        const head = match ? "Клиент склада завершил регистрацию на сайте" : "🆕 НОВЫЙ клиент зарегистрировался";
        await fetch(`https://api.telegram.org/bot${AT}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: AC, text: `✅ Регистрация\n\n${head}\nНомер: ${phone}\nUsername: ${v.tg_username ? "@" + v.tg_username : "—"}\nchat_id: ${v.chat_id || "—"}` }),
        });
      }
    } catch {}

    const jwt = signToken({ sub: acc.id, customer_id: acc.customer_id, phone, sid });
    return res.status(200).json({ token: jwt, customer_id: acc.customer_id });
  } catch (e) {
    console.error("register error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
