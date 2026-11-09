// ========================================================================
//  SEO: внешние сервисы — Google Search Console (реальные показы, клики,
//  CTR, позиции) и IndexNow (Bing, Яндекс: мгновенное уведомление о новых
//  страницах).
//
//  Search Console: нужен сервисный аккаунт Google с доступом к ресурсу.
//  JSON ключа кладётся на сервер в .env: GSC_SERVICE_ACCOUNT=<base64 JSON>.
//  Пока его нет — панель честно пишет «не подключено», ничего не выдумывая.
// ========================================================================
import { createSign } from "crypto";
import { настройки } from "./store.js";
import { помнить } from "../lib/memcache.js";
import { abs } from "./render.js";

function ключGSC() {
  const raw = process.env.GSC_SERVICE_ACCOUNT || "";
  if (!raw) return null;
  try {
    const txt = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const k = JSON.parse(txt);
    return k.client_email && k.private_key ? k : null;
  } catch { return null; }
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function токенGoogle(k) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: k.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sign = createSign("RSA-SHA256"); sign.update(head + "." + body);
  const jwt = head + "." + body + "." + b64url(sign.sign(k.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || "Google не выдал токен");
  return j.access_token;
}

async function запросGSC(token, property, body) {
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "Search Console вернул ошибку " + r.status);
  return j.rows || [];
}

// Сводка за 28 дней + запросы + динамика по дням
export async function статистикаGSC() {
  const k = ключGSC();
  const property = настройки().gsc_property;
  if (!k) return { connected: false, reason: "Не подключено: на сервере нет ключа сервисного аккаунта (GSC_SERVICE_ACCOUNT)." };
  return помнить("seo:gsc", 1800, async () => {
    try {
      const token = await токенGoogle(k);
      const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
      const range = { startDate: d(30), endDate: d(2) };       // данные GSC запаздывают на 2–3 дня
      const [итог, запросы, дни, страницы] = await Promise.all([
        запросGSC(token, property, { ...range }),
        запросGSC(token, property, { ...range, dimensions: ["query"], rowLimit: 50 }),
        запросGSC(token, property, { ...range, dimensions: ["date"] }),
        запросGSC(token, property, { ...range, dimensions: ["page"], rowLimit: 20 }),
      ]);
      const t = итог[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      return { connected: true, property, range, totals: { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position },
        queries: запросы.map(r => ({ q: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
        days: дни.map(r => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
        pages: страницы.map(r => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position })) };
    } catch (e) {
      return { connected: false, property, reason: "Ключ есть, но Search Console не ответил: " + e.message +
        ". Проверьте, что сервисный аккаунт добавлен пользователем ресурса " + property + "." };
    }
  });
}

// ------------------------------------------------------------------
//  IndexNow: сообщаем Bing и Яндексу о новых/изменённых адресах.
//  Работает, только если владелец включил это в настройках SEO.
// ------------------------------------------------------------------
export async function отправитьIndexNow(urls) {
  const s = настройки();
  if (!s.indexnow || !/^[a-f0-9]{32}$/.test(s.indexnow_key || "") || !urls.length) return { sent: 0 };
  const host = new URL(abs("/")).host;
  const body = JSON.stringify({ host, key: s.indexnow_key, keyLocation: abs(`/indexnow-${s.indexnow_key}.txt`), urlList: urls.slice(0, 10000) });
  // Шлём каждому поисковику напрямую: общий узел api.indexnow.org на
  // новом ключе отвечал 403, а Bing и Яндекс тот же ключ принимают сразу.
  const итоги = {};
  for (const [имя, url] of [["bing", "https://www.bing.com/indexnow"], ["yandex", "https://yandex.com/indexnow"]]) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
      итоги[имя] = r.status;
    } catch (e) { итоги[имя] = 0; }
  }
  const ok = Object.values(итоги).some(c => c >= 200 && c < 300);
  return { sent: ok ? urls.length : 0, status: итоги };
}
