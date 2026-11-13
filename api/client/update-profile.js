// POST /api/client/update-profile — изменить имя и/или телефон в профиле клиента
// Body: { name?, phone?, code? }
//
// Телефон — это и логин на сайте, а администратор определяется по номеру.
// Поэтому новый номер меняется ТОЛЬКО по коду из Telegram владельца этого
// номера (шаг 1 — /api/client/phone-code). Без кода чужой свободный номер
// себе не поставить: служебные, заблокированные и занятые отклоняются ещё
// до выдачи кода и проверяются здесь повторно.
import { getValidClient, normPhone, signToken } from "../lib/clientauth.js";
import { sget, spatch, okId } from "../lib/supa.js";
import { проверитьНомер, проверитьКод } from "../lib/phonechange.js";

const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  res.setHeader("Cache-Control", "private, no-store");

  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id || !okId(client.customer_id)) return res.status(400).json({ error: "Профиль не привязан к аккаунту" });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const name = String(body?.name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100);
  const phone = String(body?.phone ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 30);
  const code = String(body?.code ?? "").trim().slice(0, 10);

  if (!name && !phone) return res.status(400).json({ error: "Нечего обновлять" });

  try {
    const customerPatch = {};
    if (name) customerPatch.name = name;
    let новыйТокен = null;

    if (phone) {
      const newPhone = normPhone(phone);
      if (newPhone.length < 9) return res.status(400).json({ error: "Неверный формат телефона (нужно 9 цифр)" });
      // текущий логин — из базы, не из токена
      const acc = (await sget(`site_accounts?id=eq.${encodeURIComponent(client.sub)}&select=id,phone,chat_id`))[0];
      if (!acc) return res.status(401).json({ error: "Не авторизован" });

      if (newPhone !== normPhone(acc.phone)) {
        if (!code) return res.status(400).json({ need_code: true, error: "Подтвердите новый номер кодом из Telegram" });
        const п = await проверитьНомер(phone, client);
        if (!п.ok) return res.status(п.status).json({ error: п.error });
        const к = проверитьКод(String(client.customer_id), newPhone, code);
        if (!к.ok) return res.status(400).json({ error: к.error });

        // логин переезжает на новый номер, коды входа — в его Telegram
        await spatch(`site_accounts?id=eq.${encodeURIComponent(acc.id)}`, { phone: newPhone, ...(к.chat_id ? { chat_id: String(к.chat_id) } : {}) });
        const { iat, exp, ...прежний } = client;
        новыйТокен = signToken({ ...прежний, phone: newPhone });

        // предупредить прежний Telegram: если менял не владелец — он узнает
        if (CLIENT_TOKEN && acc.chat_id && String(acc.chat_id) !== String(к.chat_id)) {
          const хвост = newPhone.slice(-4);
          fetch(`https://api.telegram.org/bot${CLIENT_TOKEN}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: acc.chat_id, text: `ℹ️ Номер для входа на generalmodern.uz изменён на …${хвост}. Если это сделали не вы — срочно свяжитесь с менеджером.` }),
          }).catch(() => {});
        }
      }
      customerPatch.contact = phone;
    }

    if (Object.keys(customerPatch).length) {
      await spatch(`customers?id=eq.${encodeURIComponent(client.customer_id)}`, customerPatch);
    }

    return res.status(200).json(новыйТокен ? { ok: true, token: новыйТокен } : { ok: true });
  } catch (e) {
    console.error("update-profile error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
