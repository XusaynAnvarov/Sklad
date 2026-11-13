// POST /api/client/phone-code — шаг 1 смены телефона в кабинете.
// Body: { phone }  → { ok:true }  или ошибка; need_bot:true, если у нового
// номера ещё нет Telegram, который поделился этим контактом с ботом.
// Код уходит в Telegram ВЛАДЕЛЬЦА НОВОГО НОМЕРА (см. api/lib/phonechange.js).
import { getValidClient, normPhone } from "../lib/clientauth.js";
import { okId } from "../lib/supa.js";
import { проверитьНомер, чатНомера, можноВыдать, выдатьКод, забыть } from "../lib/phonechange.js";

const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const BOT = process.env.CLIENT_BOT_USERNAME || "generalmodernbot";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  res.setHeader("Cache-Control", "private, no-store");

  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id || !okId(client.customer_id)) return res.status(400).json({ error: "Профиль не привязан к аккаунту" });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const raw = String(body?.phone ?? "").trim().slice(0, 30);
  if (normPhone(raw) === normPhone(client.phone)) return res.status(400).json({ error: "Это ваш текущий номер" });

  try {
    const п = await проверитьНомер(raw, client);
    if (!п.ok) return res.status(п.status).json({ error: п.error });

    const cid = String(client.customer_id);
    const стоп = можноВыдать(cid);
    if (стоп) return res.status(429).json({ error: стоп });

    const chat = await чатНомера(п.phone);
    if (!chat || !CLIENT_TOKEN) {
      return res.status(409).json({
        need_bot: true, bot_url: `https://t.me/${BOT}`,
        error: `С Telegram нового номера откройте бота @${BOT}, нажмите /start и «Поделиться номером». Потом запросите код снова.`,
      });
    }

    const code = выдатьКод(cid, п.phone, chat);
    const text = `🔐 Код для смены номера в кабинете generalmodern.uz:\n\n\`${code}\`\n\n👆 Нажмите на код — он скопируется.\n\nДействует 5 минут. Если это не вы — ничего не вводите и никому не сообщайте код.`;
    let ушло = false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${CLIENT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, parse_mode: "Markdown" }),
      });
      ушло = !!(await r.json().catch(() => null))?.ok;
    } catch {}
    if (!ушло) {
      забыть(cid);
      return res.status(502).json({ error: `Не удалось отправить код. Откройте бота @${BOT}, нажмите /start и повторите.` });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("phone-code error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
