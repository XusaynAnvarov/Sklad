// POST /api/client/ask — вопрос клиента администратору (запрос цены или
// просто сообщение). Уходит владельцу в Telegram (@XusaynBot → ADMIN_CHAT_ID).
// Тело: { text, product_id? }. Имя и телефон берём из карточки клиента,
// а не из запроса — подписаться чужим именем нельзя.
import { getValidClient } from "../lib/clientauth.js";
import { sget, okId } from "../lib/supa.js";

const ЛИМИТ = 8;                 // сообщений в час с одного клиента
const окно = new Map();          // customer_id → [время отправки]

function можно(id) {
  const сейчас = Date.now();
  const было = (окно.get(id) || []).filter(t => сейчас - t < 3600e3);
  if (было.length >= ЛИМИТ) { окно.set(id, было); return false; }
  было.push(сейчас); окно.set(id, было);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id || !okId(client.customer_id)) return res.status(400).json({ error: "Аккаунт не привязан к складу" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const текст = String(body?.text || "").trim().slice(0, 1000);
  const pid = body?.product_id && okId(body.product_id) ? String(body.product_id) : null;
  if (!текст && !pid) return res.status(400).json({ error: "Напишите сообщение" });
  if (!можно(String(client.customer_id))) return res.status(429).json({ error: "Слишком много сообщений. Попробуйте через час." });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!token || !chatId) return res.status(503).json({ error: "Связь с администратором не настроена" });

  try {
    const [c] = await sget(`customers?id=eq.${encodeURIComponent(client.customer_id)}&select=name,contact`);
    let товар = "";
    if (pid) {
      const [p] = await sget(`products?id=eq.${encodeURIComponent(pid)}&select=name,sku`);
      if (p) товар = `\nТовар: ${p.name}${p.sku ? " (арт. " + p.sku + ")" : ""}`;
    }
    const заголовок = pid && !текст ? "💰 Запрос цены с сайта" : "💬 Сообщение из кабинета";
    const msg = `${заголовок}\nКлиент: ${c?.name || "—"}${c?.contact ? " · " + c.contact : ""}${товар}${текст ? "\n\n" + текст : ""}`;
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    });
    if (!r.ok) throw new Error("telegram " + r.status);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("client/ask error", e.message || e);
    return res.status(500).json({ error: "Не удалось отправить. Попробуйте позже." });
  }
}
