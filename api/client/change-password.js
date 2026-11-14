// POST /api/client/change-password — клиент меняет свой пароль (или админ — свой)
// Body: { current, new }  (требуется JWT клиента)  → { ok, token }
//
// После смены пароля ВСЕ прежние входы закрываются: в токене лежит отпечаток
// пароля (clientauth.js), он больше не совпадёт. Этому устройству сразу
// выдаётся новый токен — здесь человек остаётся в кабинете. Доверенные
// устройства тоже сбрасываются: на чужом телефоне снова понадобится код.
import { getValidClient, verifyPassword, hashPassword, отпечатокПароля, обновитьТокен, меткаОтзыва } from "../lib/clientauth.js";
import { sget, spatch } from "../lib/supa.js";

const MIN_PASS = 6;
const MAX_PASS = 200;

// не больше 10 неверных «текущих паролей» в час на аккаунт
const промахи = new Map();
function многоПромахов(id) {
  const now = Date.now();
  const l = (промахи.get(id) || []).filter(t => now - t < 3600e3);
  промахи.set(id, l);
  if (промахи.size > 5000) for (const [k, v] of промахи) if (!v.length) промахи.delete(k);
  return l.length >= 10;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "private, no-store");
  const me = await getValidClient(req);
  if (!me || !me.sub) return res.status(401).json({ error: "Не авторизовано" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { current, new: newPass } = body || {};
  if (!current || !newPass) return res.status(400).json({ error: "Укажите текущий и новый пароль" });
  if (String(newPass).length < MIN_PASS) return res.status(400).json({ error: `Новый пароль не менее ${MIN_PASS} символов` });
  if (String(newPass).length > MAX_PASS) return res.status(400).json({ error: "Слишком длинный пароль" });

  const id = String(me.sub);
  if (многоПромахов(id)) return res.status(429).json({ error: "Слишком много попыток. Попробуйте через час." });

  try {
    const accs = await sget(`site_accounts?id=eq.${encodeURIComponent(id)}&select=id,password_hash`);
    const acc = accs[0];
    if (!acc) return res.status(404).json({ error: "Аккаунт не найден" });

    const ok = await verifyPassword(String(current), acc.password_hash);
    if (!ok) { промахи.get(id).push(Date.now()); return res.status(403).json({ error: "Текущий пароль неверный" }); }

    const password_hash = await hashPassword(String(newPass));
    try {
      await spatch(`site_accounts?id=eq.${encodeURIComponent(id)}`, { password_hash, session_id: меткаОтзыва(), known_devices: [] });
    } catch {
      await spatch(`site_accounts?id=eq.${encodeURIComponent(id)}`, { password_hash });
    }
    промахи.delete(id);
    return res.status(200).json({ ok: true, token: обновитьТокен(me, { pv: отпечатокПароля(password_hash) }) });
  } catch (e) {
    console.error("change-password error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
