// ========================================================================
//  POST /api/track — отметка визита на сайт / в мини-приложение.
//
//  Что пишем: время, страницу, источник (referrer, utm), приблизительную
//  страну/город по IP (заголовки Cloudflare), тип устройства и браузер.
//  Никаких внешних счётчиков и сторонних скриптов слежения.
//
//  Публичный адрес, поэтому:
//   • не больше 20 отметок в минуту с одного IP (остальное молча отбрасываем);
//   • личность берём ТОЛЬКО из подписанных данных: токен входа сайта или
//     initData Telegram Mini App (подпись проверяется). Что прислали в теле
//     «просто так», на личность не влияет.
// ========================================================================
import { recordEvent, clientIp, parseUA, findCrmByTg, refreshIpGeo } from "./lib/crm.js";
import { getClient } from "./lib/clientauth.js";
import { verifyInitData } from "./lib/tg.js";

const окно = new Map();
function многоСIp(ip) {
  const now = Date.now();
  const arr = (окно.get(ip) || []).filter(t => t > now - 60e3);
  arr.push(now); окно.set(ip, arr);
  if (окно.size > 5000) for (const [k, v] of окно) if (!v.length || v[v.length - 1] < now - 60e3) окно.delete(k);
  return arr.length > 20;
}
const кусок = (v, n) => (typeof v === "string" && v ? v.slice(0, n) : null);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ip = clientIp(req) || "?";
  if (многоСIp(ip)) return res.status(204).end();
  if (parseUA(req.headers["user-agent"]).device === "bot") return res.status(204).end();

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b && typeof b === "object" ? b : {};

  // utm: только известные ключи и короткие значения
  let utm = null;
  if (b.utm && typeof b.utm === "object") {
    utm = {};
    for (const k of ["source", "medium", "campaign", "content", "term"]) { const v = кусок(b.utm[k], 80); if (v) utm[k] = v; }
    if (!Object.keys(utm).length) utm = null;
  }

  const ev = { kind: "site_visit", channel: "site", ok: true, path: кусок(b.path, 200), referrer: кусок(b.referrer, 300), utm };

  // вошедший клиент сайта
  const who = getClient(req);
  if (who?.sub) Object.assign(ev, { site_account_id: who.sub, customer_id: who.customer_id || null, phone9: who.phone || null });

  // Mini App: подпись initData проверяем ботом клиента
  if (typeof b.initData === "string" && b.initData) {
    const user = verifyInitData(b.initData, process.env.CLIENT_BOT_TOKEN);
    if (user?.id) {
      ev.channel = "miniapp"; ev.kind = "miniapp_open";
      const crm = await findCrmByTg(String(user.id));
      if (crm) { ev.crm_client_id = crm.id; ev.customer_id = ev.customer_id || crm.customer_id; ev.phone9 = ev.phone9 || crm.phone9; refreshIpGeo(crm, req).catch(() => {}); }
    }
  }
  recordEvent(req, ev).catch(() => {});
  return res.status(204).end();
}
