// POST /api/admin-site/reset-client-password — владелец задаёт новый пароль клиенту
// Body: { account_id, new }  (требуется getSiteAdmin)
import { getSiteAdmin } from "../lib/siteadmin.js";
import { hashPassword } from "../lib/clientauth.js";
import { sget, spatch } from "../lib/supa.js";

const MIN_PASS = 6;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!getSiteAdmin(req)) return res.status(401).json({ error: "Только для администратора" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { account_id, new: newPass } = body || {};
  if (!account_id || !newPass) return res.status(400).json({ error: "Укажите account_id и новый пароль" });
  if (String(newPass).length < MIN_PASS) return res.status(400).json({ error: `Пароль не менее ${MIN_PASS} символов` });

  try {
    const accs = await sget(`site_accounts?id=eq.${encodeURIComponent(account_id)}&select=id`);
    if (!accs[0]) return res.status(404).json({ error: "Клиент не найден" });

    const password_hash = await hashPassword(newPass);
    await spatch(`site_accounts?id=eq.${encodeURIComponent(account_id)}`, { password_hash });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("reset-client-password error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
