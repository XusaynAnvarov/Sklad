// ========================================================================
//  CRM + БЕЗОПАСНОСТЬ: общий модуль для бота, сайта и админ-панели.
//
//  Правило всего модуля: ничего не придумываем. Если Telegram, Cloudflare
//  или браузер не дали данные — поле остаётся пустым, а панель пишет
//  «Не определено» и объясняет почему.
//
//  Все записи — «мягкие»: если миграция db/crm-security-migration.sql
//  ещё не применена, функции молча ничего не делают, и бот/сайт работают
//  как раньше. Ошибку отсутствия таблиц печатаем в журнал один раз.
// ========================================================================
import crypto from "node:crypto";
import { секретПодписи } from "./jwtsecret.js";
import { sget, sinsert, spatch, supsert, okId } from "./supa.js";

const ADMIN_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = () => process.env.ADMIN_CHAT_ID;
const PUBLIC_URL = () => process.env.PUBLIC_URL || "https://generalmodern.uz";
export const CONSENT_VERSION = "2026-11-09";
export const IP_RETENTION_DAYS = 30;
export const VISIT_RETENTION_DAYS = 180;
export const EVENT_RETENTION_DAYS = 365;

// ---------- таблицы ещё не созданы? ----------
let предупреждено = false;
function нетТаблиц(e) {
  const m = String(e?.message || e);
  const нет = /crm_clients|client_events|crm_audit/.test(m) && /(does not exist|42P01|404|PGRST205|Could not find)/i.test(m);
  if (нет && !предупреждено) {
    предупреждено = true;
    console.warn("[crm] таблицы CRM ещё не созданы — запустите db/crm-security-migration.sql. До этого CRM ничего не пишет.");
  }
  return нет;
}
async function мягко(fn, fallback = null) {
  try { return await fn(); } catch (e) {
    // 23505 — повтор (тот же update_id Telegram или параллельная вставка): это норма, не ошибка
    if (!нетТаблиц(e) && !/23505|duplicate key/i.test(String(e.message))) console.warn("[crm]", e.message);
    return fallback;
  }
}

// ======================================================================
//  ТЕЛЕФОН → E.164
//  Узбекские номера бывают в любом виде: 901234567, 8 90 123 45 67,
//  998901234567, +998 (90) 123-45-67. Telegram присылает без «+».
// ======================================================================
export function toE164(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  // локальный узбекский формат: 9 цифр (оператор + номер) или 8 + 9 цифр
  if (d.length === 9) d = "998" + d;
  else if (d.length === 10 && d.startsWith("8")) d = "998" + d.slice(1);
  if (d.length < 10 || d.length > 15) return null;
  return "+" + d;
}
export const phone9 = (raw) => String(raw || "").replace(/\D/g, "").slice(-9);
export function prettyPhone(e164) {
  const d = String(e164 || "").replace(/\D/g, "");
  const m = d.match(/^998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : (e164 || "");
}

// ======================================================================
//  ГЕО ПО IP — заголовки Cloudflare (сайт стоит за Cloudflare).
//  CF-IPCountry приходит всегда; город/регион — только если в Cloudflare
//  включено «Managed Transforms → Add visitor location headers».
//  Это ПРИБЛИЗИТЕЛЬНО: VPN, прокси и мобильные операторы (у которых один
//  выход в интернет на всю страну) дают чужой или столичный город.
// ======================================================================
let имена = null;
export function countryName(code) {
  const c = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === "XX" || c === "T1") return null;
  try { имена = имена || new Intl.DisplayNames(["ru"], { type: "region" }); return имена.of(c) || c; } catch { return c; }
}
const hdr = (h, k) => { const v = h?.[k] ?? h?.[k.toLowerCase()]; return Array.isArray(v) ? v[0] : v; };
// город из заголовка может прийти в URL-кодировке или latin-1
function чистыйТекст(v) {
  let s = String(v || "").trim();
  if (!s) return null;
  try { if (/%[0-9a-f]{2}/i.test(s)) s = decodeURIComponent(s); } catch {}
  return s.slice(0, 80) || null;
}
export function geoFromHeaders(headers) {
  const code = String(hdr(headers, "cf-ipcountry") || "").toUpperCase();
  const city = чистыйТекст(hdr(headers, "cf-ipcity"));
  const region = чистыйТекст(hdr(headers, "cf-region"));
  const tor = code === "T1";
  if (!code || code === "XX" || tor) {
    return { country_code: null, country: null, region: null, city: null, geo_source: code ? "ip_cloudflare" : null,
      geo_accuracy: null, tor, reason: tor ? "Вход через Tor — страна скрыта" : (code ? "Cloudflare не знает страну этого IP" : "Нет геозаголовков Cloudflare") };
  }
  return {
    country_code: code, country: countryName(code), region, city,
    geo_source: "ip_cloudflare", geo_accuracy: city ? "city" : region ? "region" : "country", tor: false,
    reason: city ? null : "Cloudflare передал только страну (город не включён в заголовках)",
  };
}
export function clientIp(req) {
  const h = req?.headers || {};
  const ip = hdr(h, "cf-connecting-ip") || String(hdr(h, "x-forwarded-for") || "").split(",")[0].trim() || hdr(h, "x-real-ip") || req?.socket?.remoteAddress || "";
  return String(ip).slice(0, 64) || null;
}
export function ipHash(ip) {
  if (!ip) return null;
  const secret = секретПодписи();
  return crypto.createHmac("sha256", secret).update("ip:" + ip).digest("hex").slice(0, 32);
}

// ======================================================================
//  УСТРОЙСТВО ПО User-Agent — только то, что в нём явно написано.
// ======================================================================
export function parseUA(uaRaw) {
  const ua = String(uaRaw || "");
  if (!ua) return { device: null, os: null, browser: null };
  const bot = /bot|crawl|spider|slurp|curl|wget|python-requests|httpclient|headless/i.test(ua);
  const tablet = /ipad|tablet|(android(?!.*mobile))/i.test(ua);
  const mobile = !tablet && /mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua);
  const device = bot ? "bot" : tablet ? "tablet" : mobile ? "mobile" : (/windows|macintosh|x11|linux/i.test(ua) ? "desktop" : null);
  const os = /windows phone/i.test(ua) ? "Windows Phone" : /android/i.test(ua) ? "Android" : /iphone|ipad|ipod/i.test(ua) ? "iOS"
    : /windows nt/i.test(ua) ? "Windows" : /mac os x|macintosh/i.test(ua) ? "macOS" : /cros/i.test(ua) ? "ChromeOS" : /linux/i.test(ua) ? "Linux" : null;
  const browser = /telegram/i.test(ua) ? "Telegram" : /yabrowser/i.test(ua) ? "Яндекс Браузер" : /edg\//i.test(ua) ? "Edge"
    : /opr\/|opera/i.test(ua) ? "Opera" : /samsungbrowser/i.test(ua) ? "Samsung Internet" : /firefox|fxios/i.test(ua) ? "Firefox"
    : /crios|chrome\//i.test(ua) ? "Chrome" : /safari/i.test(ua) && /version\//i.test(ua) ? "Safari" : null;
  return { device, os, browser };
}

// ======================================================================
//  ГОРОД ИЗ КООРДИНАТ — без внешних сервисов: ближайший город из списка.
//  Дальше 60 км ни от одного — честно «не определено».
// ======================================================================
export const CITIES = [
  // Узбекистан: столица и центры областей
  ["UZ", "Ташкент", "Ташкент", 41.311, 69.279], ["UZ", "Андижанская обл.", "Андижан", 40.783, 72.344],
  ["UZ", "Ферганская обл.", "Фергана", 40.384, 71.786], ["UZ", "Ферганская обл.", "Коканд", 40.528, 70.943],
  ["UZ", "Наманганская обл.", "Наманган", 40.998, 71.672], ["UZ", "Самаркандская обл.", "Самарканд", 39.654, 66.976],
  ["UZ", "Бухарская обл.", "Бухара", 39.768, 64.421], ["UZ", "Навоийская обл.", "Навои", 40.103, 65.374],
  ["UZ", "Кашкадарьинская обл.", "Карши", 38.861, 65.789], ["UZ", "Сурхандарьинская обл.", "Термез", 37.224, 67.278],
  ["UZ", "Джизакская обл.", "Джизак", 40.115, 67.842], ["UZ", "Сырдарьинская обл.", "Гулистан", 40.490, 68.784],
  ["UZ", "Хорезмская обл.", "Ургенч", 41.550, 60.631], ["UZ", "Каракалпакстан", "Нукус", 42.461, 59.617],
  ["UZ", "Ташкентская обл.", "Чирчик", 41.469, 69.582], ["UZ", "Ташкентская обл.", "Ангрен", 41.017, 70.144],
  ["UZ", "Ташкентская обл.", "Алмалык", 40.844, 69.598],
  // соседи и частые направления
  ["KZ", "Алматы", "Алматы", 43.238, 76.946], ["KZ", "Астана", "Астана", 51.169, 71.449], ["KZ", "Туркестанская обл.", "Шымкент", 42.341, 69.590],
  ["KG", "Бишкек", "Бишкек", 42.875, 74.570], ["KG", "Ошская обл.", "Ош", 40.513, 72.816],
  ["TJ", "Душанбе", "Душанбе", 38.560, 68.774], ["TJ", "Согдийская обл.", "Худжанд", 40.283, 69.622],
  ["TM", "Ашхабад", "Ашхабад", 37.960, 58.326], ["RU", "Москва", "Москва", 55.756, 37.617],
  ["RU", "Санкт-Петербург", "Санкт-Петербург", 59.939, 30.316], ["CN", "Чжэцзян", "Иу", 29.306, 120.075],
  ["CN", "Гуандун", "Гуанчжоу", 23.129, 113.264], ["TR", "Стамбул", "Стамбул", 41.008, 28.978],
  ["AE", "Дубай", "Дубай", 25.205, 55.271],
];
function км(a1, o1, a2, o2) {
  const r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  const x = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}
export function nearestCity(lat, lon, maxKm = 60) {
  const a = Number(lat), o = Number(lon);
  if (!isFinite(a) || !isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) return null;
  let best = null;
  for (const [cc, region, city, la, lo] of CITIES) {
    const d = км(a, o, la, lo);
    if (!best || d < best.km) best = { country_code: cc, country: countryName(cc), region, city, km: Math.round(d) };
  }
  return best && best.km <= maxKm ? best : null;
}
// Город, выбранный кнопкой в боте
export const CITY_BUTTONS = ["Ташкент", "Андижан", "Фергана", "Наманган", "Самарканд", "Бухара", "Карши", "Нукус"];
export function cityByName(name) {
  const n = String(name || "").trim().toLowerCase();
  const hit = CITIES.find(c => c[2].toLowerCase() === n);
  return hit ? { country_code: hit[0], country: countryName(hit[0]), region: hit[1], city: hit[2] } : null;
}

// ======================================================================
//  РИСК. Чистая функция — проверяется тестом _tools/tests/t-crm.mjs.
//  Другая страна сама по себе НЕ повод блокировать: она лишь добавляет
//  баллы, и то только когда есть история, с которой сравнивать.
// ======================================================================
export function computeRisk(s = {}) {
  let score = 0; const flags = [];
  const add = (n, f) => { score += n; flags.push(f); };
  if (s.kind === "login_fail") {
    if ((s.failsPhone15m || 0) >= 10) add(70, "10+ неудачных входов по номеру за 15 мин");
    else if ((s.failsPhone15m || 0) >= 5) add(45, "5+ неудачных входов по номеру за 15 мин");
  }
  if ((s.phonesFromIp1h || 0) >= 3) add(60, "перебор разных номеров с одного IP за час");
  if ((s.regsFromIp1h || 0) >= 5) add(55, "частые попытки регистрации с одного IP");
  if (s.kind === "login_ok") {
    const история = (s.priorOkLogins || 0) >= 2;
    const новаяСтрана = история && s.country_code && Array.isArray(s.knownCountries) && s.knownCountries.length && !s.knownCountries.includes(s.country_code);
    if (s.newDevice && новаяСтрана) add(45, "новое устройство и новая страна");
    else if (новаяСтрана) add(15, "вход из страны, откуда раньше не входили");
    else if (s.newDevice && история) add(10, "новое устройство");
  }
  if (s.tor) add(25, "вход через Tor");
  if ((s.botMsgsPerMin || 0) >= 30) add(60, "массовые запросы к боту");
  if (s.impersonation) add(80, "попытка выдать чужой номер за свой");
  score = Math.min(100, score);
  return { score, flags, level: score >= 70 ? "high" : score >= 40 ? "medium" : score > 0 ? "low" : "none" };
}

// ======================================================================
//  ЗАПИСЬ СОБЫТИЯ
// ======================================================================
const minutesAgo = (m) => new Date(Date.now() - m * 60e3).toISOString();
async function count(path) { const r = await мягко(() => sget(path), []); return Array.isArray(r) ? r.length : 0; }

// Собираем сигналы для риска из истории — только для событий, где это важно.
async function сигналы(kind, ev) {
  const s = { kind, tor: !!ev._tor };
  const p9 = ev.phone9 && okId(ev.phone9) ? ev.phone9 : null;
  const ih = ev.ip_hash && okId(ev.ip_hash) ? ev.ip_hash : null;
  if (kind === "login_fail" && p9) s.failsPhone15m = 1 + await count(`client_events?phone9=eq.${p9}&kind=eq.login_fail&created_at=gte.${encodeURIComponent(minutesAgo(15))}&select=id&limit=50`);
  if ((kind === "login_fail" || kind === "login_code") && ih) {
    const rows = await мягко(() => sget(`client_events?ip_hash=eq.${ih}&kind=in.(login_fail,login_code)&created_at=gte.${encodeURIComponent(minutesAgo(60))}&select=phone9&limit=200`), []);
    s.phonesFromIp1h = new Set([...(rows || []).map(r => r.phone9), ev.phone9].filter(Boolean)).size;
  }
  if ((kind === "verify_start" || kind === "register") && ih) s.regsFromIp1h = 1 + await count(`client_events?ip_hash=eq.${ih}&kind=in.(verify_start,register)&created_at=gte.${encodeURIComponent(minutesAgo(60))}&select=id&limit=50`);
  if (kind === "login_ok" && p9) {
    const prev = await мягко(() => sget(`client_events?phone9=eq.${p9}&kind=eq.login_ok&select=country_code,device_hash&order=created_at.desc&limit=50`), []) || [];
    s.priorOkLogins = prev.length;
    s.knownCountries = [...new Set(prev.map(r => r.country_code).filter(Boolean))];
    s.country_code = ev.country_code;
    s.newDevice = !!ev.device_hash && prev.length > 0 && !prev.some(r => r.device_hash === ev.device_hash);
  }
  if (ev._botMsgsPerMin) s.botMsgsPerMin = ev._botMsgsPerMin;
  if (ev._impersonation) s.impersonation = true;
  return s;
}

// Тревога владельцу — не чаще раза в 30 минут на один и тот же повод.
const тревоги = new Map();
async function тревога(ключ, текст) {
  const now = Date.now();
  if ((тревоги.get(ключ) || 0) > now - 30 * 60e3) return;
  тревоги.set(ключ, now);
  if (тревоги.size > 2000) for (const [k, t] of тревоги) if (t < now - 30 * 60e3) тревоги.delete(k);
  await sendAdmin(текст, { html: true });
}

// req — входящий запрос (для IP/UA/гео), можно null (бот: IP нет).
// extra — поля события (kind, channel, ok, phone9, crm_client_id, …).
export async function recordEvent(req, extra = {}) {
  const h = req?.headers || {};
  const geo = req ? geoFromHeaders(h) : {};
  const ip = req ? clientIp(req) : null;
  const ua = req ? String(hdr(h, "user-agent") || "").slice(0, 300) : "";
  const { device, os, browser } = parseUA(ua);
  const ev = {
    kind: extra.kind, channel: extra.channel || (req ? "site" : "telegram"), ok: extra.ok ?? null,
    dedup_key: extra.dedup_key || null,
    crm_client_id: extra.crm_client_id || null, customer_id: extra.customer_id || null, site_account_id: extra.site_account_id || null,
    phone9: extra.phone9 || null, path: extra.path ? String(extra.path).slice(0, 200) : null,
    referrer: extra.referrer ? String(extra.referrer).slice(0, 300) : null, utm: extra.utm || null,
    ip, ip_hash: ipHash(ip),
    country_code: extra.country_code ?? geo.country_code ?? null, country: extra.country ?? geo.country ?? null,
    region: extra.region ?? geo.region ?? null, city: extra.city ?? geo.city ?? null,
    geo_source: extra.geo_source ?? geo.geo_source ?? null,
    device: extra.device ?? device, os: extra.os ?? os, browser: extra.browser ?? browser, ua: ua || null,
    device_hash: extra.device_hash || null,
    _tor: !!geo.tor, _botMsgsPerMin: extra.botMsgsPerMin, _impersonation: extra.impersonation,
  };
  const risk = computeRisk(await сигналы(ev.kind, ev));
  ev.risk = risk.score; ev.flags = risk.flags.length ? risk.flags : null;
  delete ev._tor; delete ev._botMsgsPerMin; delete ev._impersonation;
  const saved = await мягко(async () => (await sinsert("client_events", ev))?.[0] || ev);
  // silent — владелец уже получил своё уведомление об этом (например, о чужом контакте)
  if (risk.level === "high" && !extra.silent) {
    const где = [ev.city, ev.country].filter(Boolean).join(", ") || "Не определено";
    await тревога(`${ev.kind}:${ev.phone9 || ev.ip_hash || ev.crm_client_id}`,
      `🚨 <b>Подозрительная активность</b> (риск ${risk.score}/100)\n\n` +
      `Событие: ${esc(KIND_RU[ev.kind] || ev.kind)}\n` +
      (ev.phone9 ? `Номер: ${esc(prettyPhone(toE164(ev.phone9)))}\n` : "") +
      `Откуда (примерно): ${esc(где)}\n` +
      `Устройство: ${esc([ev.device, ev.os, ev.browser].filter(Boolean).join(" · ") || "Не определено")}\n` +
      `Признаки: ${esc(risk.flags.join("; "))}\n\nКлиент не заблокирован автоматически — решение за вами.`);
  }
  return { event: saved, risk };
}
export const KIND_RU = {
  site_visit: "Визит на сайт", login_ok: "Вход на сайт", login_fail: "Неудачный вход", login_code: "Запрос кода входа",
  register: "Регистрация на сайте", verify_start: "Начало регистрации", bot_start: "Запуск бота", bot_contact: "Поделился номером",
  bot_flood: "Массовые запросы к боту", location: "Указал местоположение", impersonation: "Чужой номер", miniapp_open: "Открыл мини-приложение",
};

// ======================================================================
//  УВЕДОМЛЕНИЯ ВЛАДЕЛЬЦУ — только в личный чат ADMIN_CHAT_ID через
//  админ-бота. Никаких групп: персональные данные туда не уходят.
// ======================================================================
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export async function sendAdmin(text, { html = false, buttons = null } = {}) {
  const T = ADMIN_TOKEN(), C = ADMIN_CHAT();
  if (!T || !C) return false;
  // Повтор при сетевом сбое или 429 от Telegram: 3 попытки с паузой.
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${T}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: String(C), text, ...(html ? { parse_mode: "HTML" } : {}), disable_web_page_preview: true,
          ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) }),
      });
      if (r.ok) return true;
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) { await new Promise(z => setTimeout(z, Math.min(5000, (j.parameters?.retry_after || 1) * 1000))); continue; }
      if (r.status >= 500) { await new Promise(z => setTimeout(z, 700 * (i + 1))); continue; }
      console.warn("[crm] Telegram не принял уведомление:", r.status, j.description); return false;
    } catch { await new Promise(z => setTimeout(z, 700 * (i + 1))); }
  }
  return false;
}
const НЕТ = "Не определено";
export const SOURCE_RU = { telegram: "Telegram-бот", site: "Сайт", miniapp: "Мини-приложение" };
export function entryRu(e) {
  const s = String(e || "");
  if (!s) return null;
  if (s.startsWith("deeplink:qr")) return "QR-код: " + s.slice(12).replace(/_/g, " ");
  if (s.startsWith("deeplink:")) return "Ссылка t.me: " + s.slice(9).replace(/_/g, " ");
  if (s.startsWith("campaign:")) return "Кампания: " + s.slice(9).replace(/_/g, " ");
  if (s.startsWith("ref:")) return "Приглашение: " + s.slice(4);
  if (s === "bot_direct") return "Открыл бота напрямую";
  return s;
}
export function newClientMessage(c, { statusLine }) {
  const tz = { timeZone: "Asia/Tashkent" };
  const at = new Date(c.registered_at || Date.now());
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || НЕТ;
  const geoNote = c.city || c.country ? "" : " (Telegram не передаёт город — клиенту предложено указать)";
  return (
    `🔔 <b>НОВЫЙ КЛИЕНТ</b>\n\n` +
    `👤 Имя: ${esc(name)}\n` +
    `📱 Телефон: ${esc(prettyPhone(c.phone) || НЕТ)}\n` +
    `💬 Telegram: ${c.tg_username ? "@" + esc(c.tg_username) : "нет username"}\n` +
    `🆔 Telegram ID: ${esc(c.tg_user_id || НЕТ)}\n` +
    `📍 Страна: ${esc(c.country || НЕТ)}${geoNote}\n` +
    `🏙 Город: ${esc(c.city || НЕТ)}\n` +
    `🌐 Источник: ${esc(SOURCE_RU[c.source] || c.source || НЕТ)}\n` +
    `🔗 Кампания: ${esc(entryRu(c.entry_point) || НЕТ)}\n` +
    `📅 Дата: ${at.toLocaleDateString("ru-RU", tz)}\n` +
    `🕒 Время: ${at.toLocaleTimeString("ru-RU", { ...tz, hour: "2-digit", minute: "2-digit" })} (Ташкент)\n` +
    `🆕 Статус: ${esc(statusLine)}\n` +
    `📦 CRM ID: ${esc(c.num ?? НЕТ)}`
  );
}
export const cardUrl = (id) => `${PUBLIC_URL()}/admin#/crm?id=${encodeURIComponent(id)}`;

// ======================================================================
//  РЕГИСТРАЦИЯ ИЗ TELEGRAM
// ======================================================================
// Разбор /start <payload>. Telegram допускает [A-Za-z0-9_-], до 64 знаков.
//   qr_shop        → deeplink:qr_shop      (QR-код магазина)
//   c_autumn_sale  → campaign:autumn_sale  (рекламная кампания)
//   ref_AB12       → ref:AB12              (приглашение)
//   utm_ig_story   → utm {source: ig, campaign: story}
export function parseStartPayload(text) {
  const m = String(text || "").trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})$/);
  if (!m) return null;
  const p = m[1];
  if (/^verify_/i.test(p)) return null;               // это регистрация на сайте, не реклама
  if (/^ref_/i.test(p)) return { entry_point: "ref:" + p.slice(4), ref_code: p.slice(4) };
  if (/^c_/i.test(p)) return { entry_point: "campaign:" + p.slice(2) };
  if (/^utm_/i.test(p)) { const [source, ...rest] = p.slice(4).split("_"); return { entry_point: "campaign:" + p.slice(4), utm: { source, campaign: rest.join("_") || null } }; }
  return { entry_point: "deeplink:" + p };
}

export async function findCrmByTg(tgId) {
  if (!okId(tgId)) return null;
  return мягко(async () => (await sget(`crm_clients?tg_user_id=eq.${tgId}&select=*`))[0] || null);
}
// Первое обращение к боту: карточка «started» (без телефона) — так мы
// знаем дату первого контакта и точку входа ещё до регистрации.
export async function touchTelegram(from, { entry } = {}) {
  if (!from?.id || from.is_bot) return null;
  const tgId = String(from.id);
  const now = new Date().toISOString();
  const was = await findCrmByTg(tgId);
  const профиль = { tg_username: from.username || null, first_name: from.first_name || null, last_name: from.last_name || null, tg_lang: from.language_code || null };
  if (was) {
    const patch = { ...профиль, last_active_at: now, updated_at: now };
    // точку входа не перезаписываем: важна ПЕРВАЯ (откуда пришёл)
    if (entry && !was.entry_point) Object.assign(patch, entry);
    await мягко(() => spatch(`crm_clients?id=eq.${was.id}`, patch));
    return { ...was, ...patch };
  }
  const row = { tg_user_id: tgId, ...профиль, source: "telegram", entry_point: entry?.entry_point || "bot_direct",
    utm: entry?.utm || null, ref_code: entry?.ref_code || null, link_status: "started", first_seen_at: now, last_active_at: now };
  const ins = await мягко(() => sinsert("crm_clients", row));
  if (ins?.[0]) return ins[0];
  return findCrmByTg(tgId);   // параллельный запрос успел создать — берём его
}

// Решение о привязке — чистая функция (тест t-crm.mjs).
// Привязываем автоматически, только если номер принадлежит РОВНО ОДНОМУ
// клиенту склада. Два и больше — на ручную проверку, ничего не сливаем.
export function decideLink(matches) {
  const list = Array.isArray(matches) ? matches : [];
  if (list.length === 1) return { link_status: "linked", customer_id: list[0].id };
  if (list.length > 1) return { link_status: "review", customer_id: null, candidates: list.map(c => c.id) };
  return { link_status: "lead", customer_id: null };
}

// Контакт подтверждён (свой номер — проверено в bot.js).
// matches — клиенты склада с этим номером. Возвращает {crm, isNew}.
export async function registerTelegramContact(from, phoneRaw, matches, { dedupKey } = {}) {
  const now = new Date().toISOString();
  const e164 = toE164(phoneRaw), p9 = phone9(phoneRaw);
  let crm = await touchTelegram(from);
  if (!crm?.id) return { crm: null, isNew: false };          // таблиц нет — CRM выключена
  const впервые = !crm.registered_at;
  const d = decideLink(matches);
  const patch = { phone: e164, phone9: p9, last_active_at: now, updated_at: now };
  if (впервые) { patch.registered_at = now; patch.consent_at = now; patch.consent_version = CONSENT_VERSION; }
  // Привязку уже связанного не трогаем; новую ставим по решению выше.
  if (!crm.customer_id) { patch.link_status = d.link_status; if (d.customer_id) patch.customer_id = d.customer_id; }
  // Номер сменился у уже связанного аккаунта — не перепривязываем молча.
  else if (crm.phone9 && crm.phone9 !== p9) patch.link_status = "review";
  await мягко(() => spatch(`crm_clients?id=eq.${crm.id}`, patch));
  crm = { ...crm, ...patch };
  await recordEvent(null, { kind: "bot_contact", channel: "telegram", ok: true, crm_client_id: crm.id, customer_id: crm.customer_id, phone9: p9, dedup_key: dedupKey });
  if (впервые) {
    const statusLine = crm.link_status === "linked" ? "Существующий клиент склада — Telegram привязан"
      : crm.link_status === "review" ? `Номер есть у ${d.candidates?.length || "нескольких"} клиентов склада — нужна ручная проверка`
      : "Новый клиент (лид, в складе ещё нет)";
    await sendAdmin(newClientMessage(crm, { statusLine }), { html: true, buttons: [[{ text: "Открыть карточку клиента", url: cardUrl(crm.id) }]] });
  }
  return { crm, isNew: впервые, decision: d };
}

// Город/местоположение из бота (добровольно).
export async function setTelegramGeo(from, geo, { dedupKey } = {}) {
  const crm = await findCrmByTg(String(from?.id || ""));
  if (!crm) return null;
  const now = new Date().toISOString();
  const patch = { country_code: geo.country_code || null, country: geo.country || null, region: geo.region || null, city: geo.city || null,
    geo_source: geo.geo_source, geo_accuracy: geo.geo_accuracy, geo_updated_at: now, last_active_at: now, updated_at: now };
  await мягко(() => spatch(`crm_clients?id=eq.${crm.id}`, patch));
  await recordEvent(null, { kind: "location", channel: "telegram", ok: true, crm_client_id: crm.id, customer_id: crm.customer_id, phone9: crm.phone9,
    country_code: patch.country_code, country: patch.country, region: patch.region, city: patch.city, geo_source: patch.geo_source, dedup_key: dedupKey });
  // свежему клиенту (зарегистрировался в последние сутки) — короткое дополнение к уведомлению
  if (crm.registered_at && Date.now() - new Date(crm.registered_at).getTime() < 864e5) {
    await sendAdmin(`📍 Клиент CRM ${esc(crm.num)} (${esc([crm.first_name, crm.last_name].filter(Boolean).join(" ") || "без имени")}) указал: ` +
      `${esc([patch.city, patch.country].filter(Boolean).join(", ") || "Не определено")} — ${patch.geo_source === "location" ? "по геопозиции (≈10 км)" : "выбрал сам"}`, { html: true });
  }
  return { ...crm, ...patch };
}

// Сайт: аккаунт создан/вошёл — подтягиваем CRM-карточку по номеру.
// Склеиваем ТОЛЬКО по подтверждённому через Telegram номеру (сайт
// регистрирует номер лишь после подтверждения контакта в боте).
export async function linkSiteAccount({ phone, site_account_id, customer_id, tg_chat_id, tg_username, req }) {
  const p9 = phone9(phone);
  if (!okId(p9)) return null;
  const now = new Date().toISOString();
  let crm = tg_chat_id && okId(tg_chat_id) ? await findCrmByTg(String(tg_chat_id)) : null;
  if (!crm) crm = await мягко(async () => (await sget(`crm_clients?phone9=eq.${p9}&select=*&order=created_at.asc&limit=1`))[0] || null);
  const geo = req ? geoFromHeaders(req.headers) : {};
  if (crm) {
    const patch = { site_account_id: site_account_id || crm.site_account_id || null, last_active_at: now, updated_at: now };
    if (!crm.customer_id && customer_id) { patch.customer_id = customer_id; patch.link_status = "linked"; }
    if (!crm.registered_at) { patch.registered_at = now; patch.consent_at = now; patch.consent_version = CONSENT_VERSION; }
    if (!crm.phone) { patch.phone = toE164(phone); patch.phone9 = p9; }
    await мягко(() => spatch(`crm_clients?id=eq.${crm.id}`, patch));
    return { ...crm, ...patch };
  }
  const row = { phone: toE164(phone), phone9: p9, site_account_id: site_account_id || null, customer_id: customer_id || null,
    tg_user_id: tg_chat_id ? String(tg_chat_id) : null, tg_username: tg_username || null,
    source: "site", entry_point: "site", link_status: customer_id ? "linked" : "lead",
    first_seen_at: now, registered_at: now, last_active_at: now, consent_at: now, consent_version: CONSENT_VERSION,
    ...(geo.country_code ? { country_code: geo.country_code, country: geo.country, region: geo.region, city: geo.city, geo_source: "ip_cloudflare", geo_accuracy: geo.geo_accuracy, geo_updated_at: now } : {}) };
  return мягко(async () => (await sinsert("crm_clients", row))?.[0] || null);
}

// Подтянуть приблизительное гео по IP в карточку, если точнее ничего нет.
export async function refreshIpGeo(crm, req) {
  if (!crm?.id || !req) return;
  if (crm.geo_source === "location" || crm.geo_source === "user_city") return;   // своё указание клиента важнее IP
  const g = geoFromHeaders(req.headers);
  if (!g.country_code) return;
  const now = new Date().toISOString();
  await мягко(() => spatch(`crm_clients?id=eq.${crm.id}`, { country_code: g.country_code, country: g.country, region: g.region, city: g.city,
    geo_source: "ip_cloudflare", geo_accuracy: g.geo_accuracy, geo_updated_at: now, last_active_at: now, updated_at: now }));
}

// ======================================================================
//  ФЛУД К БОТУ — счётчик в памяти: сообщений от одного чата в минуту.
// ======================================================================
const поток = new Map();
export function botRate(chatId) {
  const k = String(chatId), now = Date.now();
  const arr = (поток.get(k) || []).filter(t => t > now - 60e3);
  arr.push(now); поток.set(k, arr);
  if (поток.size > 5000) for (const [kk, v] of поток) if (!v.length || v[v.length - 1] < now - 60e3) поток.delete(kk);
  return arr.length;
}

// ======================================================================
//  ХРАНЕНИЕ: IP стираем через 30 дней, визиты — через 180, прочее — 365.
//  Зовётся раз в сутки из server.js.
// ======================================================================
export async function purgeOld() {
  const d = (n) => encodeURIComponent(new Date(Date.now() - n * 864e5).toISOString());
  const { sdelete } = await import("./supa.js");
  await мягко(() => spatch(`client_events?ip=not.is.null&created_at=lt.${d(IP_RETENTION_DAYS)}`, { ip: null, ua: null }));
  await мягко(() => sdelete(`client_events?kind=eq.site_visit&created_at=lt.${d(VISIT_RETENTION_DAYS)}`));
  await мягко(() => sdelete(`client_events?created_at=lt.${d(EVENT_RETENTION_DAYS)}`));
}

// Журнал действий сотрудников
export async function audit(actor, action, target, details) {
  await мягко(() => supsert("crm_audit", { actor: String(actor || "admin"), action, target: String(target || ""), details: details || null, created_at: new Date().toISOString() }));
}
