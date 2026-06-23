// POST /api/client/update-profile — изменить имя и/или телефон в профиле клиента
import { getClient, normPhone } from "../lib/clientauth.js";
import { sget, spatch } from "../lib/supa.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const client = getClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id) return res.status(400).json({ error: "Профиль не привязан к аккаунту" });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const { name, phone } = body || {};

  if (!name?.trim() && !phone?.trim())
    return res.status(400).json({ error: "Нечего обновлять" });

  try {
    const customerPatch = {};
    if (name?.trim()) customerPatch.name = name.trim();

    if (phone?.trim()) {
      const newPhone = normPhone(phone);
      if (newPhone.length < 9)
        return res.status(400).json({ error: "Неверный формат телефона (нужно 9 цифр)" });

      // Проверка уникальности
      const existing = await sget(`site_accounts?phone=eq.${newPhone}&select=id,customer_id`);
      const conflict = existing.find(a => a.customer_id !== client.customer_id);
      if (conflict) return res.status(409).json({ error: "Этот номер уже привязан к другому аккаунту" });

      await spatch(`site_accounts?customer_id=eq.${client.customer_id}`, { phone: newPhone });
      customerPatch.contact = phone.trim();
    }

    if (Object.keys(customerPatch).length) {
      await spatch(`customers?id=eq.${client.customer_id}`, customerPatch);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("update-profile error", e);
    return res.status(500).json({ error: e.message });
  }
}
