// POST /api/client/login — вход по телефону и паролю
// Body: { phone, password }
// Returns: { token, customer_id }
import { normPhone, verifyPassword, signToken } from "../lib/clientauth.js";
import { sget, spatch } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const phone = normPhone(body?.phone);
  const password = String(body?.password || "");
  if (phone.length < 7 || !password) return res.status(400).json({ error: "Введите номер телефона и пароль" });

  try {
    // проверяем блокировку
    const blocked = await sget(`blocked_phones?phone=eq.${encodeURIComponent(phone)}&select=phone`);
    if (blocked.length) return res.status(403).json({ error: "Этот номер заблокирован. Обратитесь к продавцу." });

    const rows = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=*`);
    const acc = rows[0];
    // одинаковое сообщение при неверном номере и пароле (защита от энумерации)
    if (!acc) return res.status(401).json({ error: "Неверный номер или пароль" });

    const ok = await verifyPassword(password, acc.password_hash);
    if (!ok) return res.status(401).json({ error: "Неверный номер или пароль" });

    try { await spatch(`site_accounts?id=eq.${acc.id}`, { last_login: new Date().toISOString() }); } catch {}

    const jwt = signToken({ sub: acc.id, customer_id: acc.customer_id, phone });
    return res.status(200).json({ token: jwt, customer_id: acc.customer_id });
  } catch (e) {
    console.error("login error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
