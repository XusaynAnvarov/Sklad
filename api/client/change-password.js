// POST /api/client/change-password — клиент меняет свой пароль (или админ — свой)
// Body: { current, new }  (требуется JWT клиента)
import { getClient, verifyPassword, hashPassword } from "../lib/clientauth.js";
import { sget, spatch } from "../lib/supa.js";

const MIN_PASS = 6;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const me = getClient(req);
  if (!me || !me.sub) return res.status(401).json({ error: "Не авторизовано" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { current, new: newPass } = body || {};
  if (!current || !newPass) return res.status(400).json({ error: "Укажите текущий и новый пароль" });
  if (String(newPass).length < MIN_PASS) return res.status(400).json({ error: `Новый пароль не менее ${MIN_PASS} символов` });

  try {
    const accs = await sget(`site_accounts?id=eq.${encodeURIComponent(me.sub)}&select=id,password_hash`);
    const acc = accs[0];
    if (!acc) return res.status(404).json({ error: "Аккаунт не найден" });

    const ok = await verifyPassword(current, acc.password_hash);
    if (!ok) return res.status(403).json({ error: "Текущий пароль неверный" });

    const password_hash = await hashPassword(newPass);
    await spatch(`site_accounts?id=eq.${encodeURIComponent(me.sub)}`, { password_hash });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("change-password error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
