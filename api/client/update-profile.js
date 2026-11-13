// POST /api/client/update-profile — изменить имя и/или телефон в профиле клиента
//
// Телефон — это и логин на сайте, а администратор определяется по номеру.
// Поэтому на чужие служебные номера сменить нельзя: иначе клиент поставил бы
// себе номер владельца и вошёл бы в панель администратора. Заблокированные
// номера тоже отклоняются — как при входе.
import { getValidClient, normPhone } from "../lib/clientauth.js";
import { sget, spatch, okId } from "../lib/supa.js";
import { isAdminPhone } from "../lib/siteadmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  res.setHeader("Cache-Control", "private, no-store");

  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id || !okId(client.customer_id)) return res.status(400).json({ error: "Профиль не привязан к аккаунту" });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const name = String(body?.name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100);
  const phone = String(body?.phone ?? "").trim().slice(0, 30);

  if (!name && !phone) return res.status(400).json({ error: "Нечего обновлять" });

  try {
    const customerPatch = {};
    if (name) customerPatch.name = name;

    if (phone) {
      const newPhone = normPhone(phone);
      if (newPhone.length < 9)
        return res.status(400).json({ error: "Неверный формат телефона (нужно 9 цифр)" });
      // свой номер владелец может оставить, чужой служебный — нет
      if (isAdminPhone(newPhone) && !isAdminPhone(client.phone))
        return res.status(409).json({ error: "Этот номер уже привязан к другому аккаунту" });

      const blocked = await sget(`blocked_phones?phone=eq.${encodeURIComponent(newPhone)}&select=phone`).catch(() => []);
      if (blocked.length) return res.status(409).json({ error: "Этот номер нельзя использовать" });

      // Проверка уникальности
      const existing = await sget(`site_accounts?phone=eq.${encodeURIComponent(newPhone)}&select=id,customer_id`);
      const conflict = existing.find(a => String(a.customer_id) !== String(client.customer_id));
      if (conflict) return res.status(409).json({ error: "Этот номер уже привязан к другому аккаунту" });

      await spatch(`site_accounts?customer_id=eq.${encodeURIComponent(client.customer_id)}`, { phone: newPhone });
      customerPatch.contact = phone;
    }

    if (Object.keys(customerPatch).length) {
      await spatch(`customers?id=eq.${encodeURIComponent(client.customer_id)}`, customerPatch);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("update-profile error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
