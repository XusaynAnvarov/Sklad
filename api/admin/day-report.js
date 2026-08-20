// ========================================================================
//  POST /api/admin/day-report — итоги дня владельцу в Telegram.
//  Body: { date } — необязательно, по умолчанию сегодня (Ташкент, UTC+5).
//  Считает только ОБОРОТЫ: прибыль по правилам живёт в складе на сайте.
//  Доступ: токен склада (getUser). Тот же расчёт зовёт вечерняя рассылка.
//  ENV: CLIENT_BOT_TOKEN, ADMIN_CHAT_ID
// ========================================================================
import { getUser } from "../lib/auth.js";
import { sget } from "../lib/supa.js";

const BOT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const ADMIN_CHAT = process.env.ADMIN_CHAT_ID;
const TZ_OFFSET_H = 5;                       // Ташкент, UTC+5

const SIGN = { som: "сум", usd: "$", yuan: "¥" };
const money = (n, cur) => {
  const v = Number(n) || 0;
  const s = (cur === "som" ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString("ru-RU");
  return cur === "som" ? s + " сум" : (SIGN[cur] || "") + s;
};

// Границы суток по местному времени: день считается «с полуночи в Ташкенте»
export function dayRange(d) {
  const base = d ? new Date(d) : new Date();
  const local = new Date(base.getTime() + TZ_OFFSET_H * 3600e3);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), day = local.getUTCDate();
  const from = new Date(Date.UTC(y, m, day) - TZ_OFFSET_H * 3600e3);
  return { from, to: new Date(from.getTime() + 86400e3), label: local.toISOString().slice(0, 10) };
}

// Сводка дня: обороты по валютам, штуки, две группы, топ-3 товара.
export function buildSummary(sales, products, from, to) {
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p.name]));
  const zero = () => ({ som: 0, usd: 0, yuan: 0 });
  const all = zero(), quick = zero(), client = zero();
  let pieces = 0, quickN = 0, clientN = 0;
  const byProd = {};

  const inDay = (sales || []).filter(s => {
    if (s.status !== "final") return false;
    const t = new Date(s.date).getTime();
    return t >= from.getTime() && t < to.getTime();
  });

  inDay.forEach(s => {
    const isQuick = s.source === "quick" || !s.customer_id;
    if (isQuick) quickN++; else clientN++;
    (s.items || []).forEach(it => {
      const qty = Number(it.qty) || 0, price = Number(it.unit_price) || 0;
      const cur = it.currency || s.currency || "som";
      const sum = qty * price;
      pieces += qty;
      if (all[cur] !== undefined) {
        all[cur] += sum;
        (isQuick ? quick : client)[cur] += sum;
      }
      const a = byProd[it.product_id] = byProd[it.product_id] || { qty: 0 };
      a.qty += qty;
    });
  });

  const top = Object.entries(byProd)
    .map(([id, a]) => ({ name: pmap[id] || "—", qty: a.qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 3);

  return { count: inDay.length, pieces, all, quick, client, quickN, clientN, top };
}

const curLine = (m) => {
  const parts = Object.entries(m).filter(([, v]) => Math.abs(v) > 0.009).map(([c, v]) => money(v, c));
  return parts.length ? parts.join(" + ") : "0";
};

export function formatMessage(sum, label) {
  const lines = [
    `📊 Итоги дня — ${label.split("-").reverse().join(".")}`,
    "",
    `Оборот: ${curLine(sum.all)}`,
    `Продано: ${sum.pieces} шт · накладных ${sum.count}`,
    "",
    `Быстрые продажи (${sum.quickN}): ${curLine(sum.quick)}`,
    `Клиентам (${sum.clientN}): ${curLine(sum.client)}`,
  ];
  if (sum.top.length) {
    lines.push("", "Больше всего продали:");
    sum.top.forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${t.qty} шт`));
  }
  if (!sum.count) lines.push("", "Сегодня продаж не было.");
  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  if (!BOT_TOKEN || !ADMIN_CHAT) {
    console.error("day-report: не заданы CLIENT_BOT_TOKEN или ADMIN_CHAT_ID");
    return res.status(500).json({ error: "Сервер не настроен" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  try {
    const { from, to, label } = dayRange(body && body.date);
    const [sales, products] = await Promise.all([
      sget(`sales?status=eq.final&date=gte.${encodeURIComponent(from.toISOString())}&select=id,date,currency,status,source,customer_id,items`),
      sget("products?select=id,name"),
    ]);
    const sum = buildSummary(sales, products, from, to);
    const text = formatMessage(sum, label);

    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: String(ADMIN_CHAT), text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.error("day-report: Telegram ответил", r.status);
      return res.status(502).json({ error: "Telegram не принял сообщение" });
    }
    return res.status(200).json({ ok: true, sent: true });
  } catch (e) {
    console.error("day-report error", e);
    return res.status(500).json({ error: "Не удалось собрать итоги" });
  }
}
