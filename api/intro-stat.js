// ========================================================================
//  POST /api/intro-stat { event, device, lang, at_sec } — счётчик интро.
//
//  Без персональных данных: сервер только прибавляет единицу к счётчику
//  дня. IP используется лишь в памяти для ограничения частоты и нигде
//  не сохраняется.
// ========================================================================
import { отметить } from "./lib/introstore.js";

const окно = new Map();          // ip → { n, до }
const ЛИМИТ = 30;                 // событий в минуту с одного адреса

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ip = String(req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "");
  const сейчас = Date.now();
  const з = окно.get(ip);
  if (!з || з.до < сейчас) окно.set(ip, { n: 1, до: сейчас + 60e3 });
  else if (++з.n > ЛИМИТ) return res.status(429).json({ error: "Слишком часто" });
  if (окно.size > 5000) for (const [k, v] of окно) if (v.до < сейчас) окно.delete(k);

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const ok = отметить({
    event: String(body?.event || ""),
    device: String(body?.device || ""),
    lang: String(body?.lang || ""),
    at_sec: body?.at_sec,
  });
  res.setHeader("Cache-Control", "no-store");
  return res.status(ok ? 204 : 400).end();
}
