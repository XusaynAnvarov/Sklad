// POST /api/client/login — шаг 2 входа: код из Telegram + пароль
// Body: { phone, code, password }  → Returns { token, customer_id }
// Каждый успешный вход выдаёт новый session_id → прежнее устройство «выкидывает».
import { normPhone, verifyPassword, verifyCode, signToken, genSessionId, hashDevice } from "../lib/clientauth.js";
import { sget, spatch } from "../lib/supa.js";
import { isAdminPhone } from "../lib/siteadmin.js";

const MAX_ATTEMPTS = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const phone = normPhone(body?.phone);
  const code = String(body?.code || "").trim();
  const password = String(body?.password || "");
  const deviceId = String(body?.device_id || "");
  if (phone.length < 7 || !password) return res.status(400).json({ error: "Введите номер телефона и пароль" });

  try {
    const blocked = await sget(`blocked_phones?phone=eq.${encodeURIComponent(phone)}&select=phone`);
    if (blocked.length) return res.status(403).json({ error: "Этот номер заблокирован. Обратитесь к продавцу." });

    const rows = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=*`);
    const acc = rows[0];
    if (!acc) return res.status(401).json({ error: "Неверный номер или пароль" });

    // известное (доверенное) устройство → код не нужен
    const known = Array.isArray(acc.known_devices) ? acc.known_devices : [];
    const isKnownDevice = !!deviceId && known.includes(hashDevice(deviceId));

    // ----- проверка кода из Telegram (админу и на известном устройстве код не нужен — только пароль) -----
    // login_code === undefined → колонки 2FA ещё не созданы (db/site-auth.sql не запущен) → вход только по паролю (миграция);
    // login_code === null → код не запрашивали → нужен шаг login-start;
    // login_code строка → сверяем код.
    if (!isAdminPhone(phone) && !isKnownDevice && acc.login_code !== undefined) {
      if (acc.login_code === null) return res.status(401).json({ error: "Сначала получите код в Telegram" });
      if (!acc.login_code_exp || new Date(acc.login_code_exp) < new Date())
        return res.status(401).json({ error: "Код устарел — запросите новый" });
      if ((acc.login_attempts || 0) >= MAX_ATTEMPTS)
        return res.status(429).json({ error: "Слишком много попыток — запросите новый код" });
      if (!code) return res.status(400).json({ error: "Введите код из Telegram" });
      if (!verifyCode(code, acc.login_code)) {
        try { await spatch(`site_accounts?id=eq.${acc.id}`, { login_attempts: (acc.login_attempts || 0) + 1 }); } catch {}
        return res.status(401).json({ error: "Неверный код" });
      }
    }

    // ----- проверка пароля -----
    const ok = await verifyPassword(password, acc.password_hash);
    if (!ok) return res.status(401).json({ error: "Неверный номер или пароль" });

    // ----- успех: новая сессия, сброс кода, запоминаем устройство -----
    const sid = genSessionId();
    // добавляем это устройство в доверенные (макс. 10), если ещё нет
    let known_devices = known;
    if (deviceId && !isKnownDevice) known_devices = [...new Set([...known, hashDevice(deviceId)])].slice(-10);
    try {
      await spatch(`site_accounts?id=eq.${acc.id}`, {
        last_login: new Date().toISOString(), session_id: sid,
        login_code: null, login_code_exp: null, login_attempts: 0,
        known_devices,
      });
    } catch {
      try { await spatch(`site_accounts?id=eq.${acc.id}`, { last_login: new Date().toISOString() }); } catch {}
    }

    const jwt = signToken({ sub: acc.id, customer_id: acc.customer_id, phone, sid });
    return res.status(200).json({ token: jwt, customer_id: acc.customer_id });
  } catch (e) {
    console.error("login error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
