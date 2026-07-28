// POST /api/send-guide — разослать клиентам видео-инструкцию «Как зарегистрироваться» (GIF).
// Body: { lang: "ru" | "uz", chat_id?: "..." }  — если chat_id задан, шлём только ему (тест).
// Гард: admin-токен склада (getUser). Файл берётся по публичной ссылке /guide/guide-<lang>.gif.
import { getUser } from "./lib/auth.js";
import { sget } from "./lib/supa.js";

const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL || "https://generalmodern.uz";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CAPTION = {
  ru: "📹 Как зарегистрироваться на сайте и в боте — короткая инструкция.\n\nПосле регистрации у вас будет: каталог, заказы, ваш долг и накладные в PDF.",
  uz: "📹 Saytda va botda qanday ro'yxatdan o'tish — qisqa yo'riqnoma.\n\nRo'yxatdan o'tgach: katalog, buyurtmalar, qarzingiz va PDF fakturalar mavjud bo'ladi.",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  if (!CLIENT_TOKEN) return res.status(500).json({ error: "CLIENT_BOT_TOKEN не задан на сервере" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const lang = body?.lang === "uz" ? "uz" : "ru";
  const only = body?.chat_id ? String(body.chat_id).replace(/[^\d-]/g, "") : null;
  const animation = `${PUBLIC_URL}/guide/guide-${lang}.gif`;
  const caption = CAPTION[lang];
  const reply_markup = { inline_keyboard: [[{ text: "🌐 Открыть сайт", url: PUBLIC_URL }]] };

  try {
    let chatIds;
    if (only) chatIds = [only];
    else {
      const customers = await sget("customers?tg_chat_id=not.is.null&select=tg_chat_id");
      chatIds = [...new Set(customers.map(c => c.tg_chat_id).filter(Boolean))];
    }
    if (!chatIds.length) return res.status(200).json({ ok: true, sent: 0, failed: 0, recipients: 0 });

    let sent = 0, failed = 0;
    for (let i = 0; i < chatIds.length; i++) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${CLIENT_TOKEN}/sendAnimation`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatIds[i], animation, caption, reply_markup }),
        });
        const j = await r.json();
        if (j.ok) sent++; else failed++;
      } catch { failed++; }
      if ((i + 1) % 20 === 0) await sleep(1000); // троттлинг, чтобы Telegram не ограничил
    }
    return res.status(200).json({ ok: true, sent, failed, recipients: chatIds.length });
  } catch (e) {
    console.error("send-guide error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
