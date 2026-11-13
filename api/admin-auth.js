// POST /api/admin-auth — вход в склад.
//
//  Два шага:
//    1) { login, password }        → пароль верный → код уходит владельцу
//                                     в Telegram, в ответ { needCode: true }
//    2) { login, password, code }  → код сошёлся   → в ответ { token }
//
//  Зачем второй шаг. Раньше хватало логина и пароля, и вход проходил
//  молча: кто угодно, подобравший пароль, работал бы в складе, а владелец
//  об этом не узнал бы. Теперь каждая попытка входа приходит ему в
//  Telegram вместе с тем, ОТКУДА она — город, адрес, браузер и время.
//  Даже если он входит сам: так видно, он это или нет.
//
//  Пароль проверяется на ОБОИХ шагах. Код сам по себе дверь не открывает:
//  перехватив сообщение, без пароля в склад не попасть.
//
//  Страховка от «не могу войти». Если бот не настроен (нет CLIENT_BOT_TOKEN
//  или ADMIN_CHAT_ID) — вход работает по-старому, только по паролю, иначе
//  владелец остался бы заперт снаружи. Тот же выход, если Telegram молчит:
//  ADMIN_2FA=off в .env на сервере выключает проверку кодом.
//
//  Проверяет: data/admin-creds.json (PBKDF2) → .env ADMIN_LOGIN/ADMIN_PASSWORD (plain)
import crypto from "crypto";
import { readFileSync } from "fs";
import { секретПодписи } from "./lib/jwtsecret.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { verifyPassword, genCode, hashCode, verifyCode } from "./lib/clientauth.js";
import { взять, положить, забыть } from "./lib/memcache.js";
import { sendAdmin, geoFromHeaders, clientIp, parseUA, countryName, esc } from "./lib/crm.js";
// Запасной канал для кода: SMS. Если бот упал, владелец иначе не попадёт
// в собственный склад (api/lib/sms.js).
import { отправитьSMS, смсНастроены, каналКода, номерДляSMS } from "./lib/sms.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const CREDS_FILE = join(__dir, "../data/admin-creds.json");

const ЖИВЁТ = 5 * 60;          // сколько секунд годен код
const ПОВТОР = 60;             // не чаще одного кода в минуту — иначе Telegram завалим
const ПОПЫТОК = 5;             // столько раз можно ошибиться, дальше код сгорает
const КЛЮЧ = "admin2fa";       // код всегда один: владелец в складе один

function readCreds() {
  try { return JSON.parse(readFileSync(CREDS_FILE, "utf8")); } catch { return null; }
}

function signJWT(secret) {
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ role: "admin", iat: now, exp: now + 30 * 24 * 3600 })).toString("base64url");
  const sig     = crypto.createHmac("sha256", secret).update(header + "." + payload).digest().toString("base64url");
  return `${header}.${payload}.${sig}`;
}

// Проверка кодом включена, только если есть кому его слать.
const кодомПроверяем = () =>
  String(process.env.ADMIN_2FA || "").toLowerCase() !== "off"
  && !!process.env.CLIENT_BOT_TOKEN && !!process.env.ADMIN_CHAT_ID;

// Откуда пришли — то, по чему владелец и узнаёт себя.
function откуда(req) {
  const g = geoFromHeaders(req.headers || {});
  const u = parseUA((req.headers || {})["user-agent"]);
  const место = [g.city, g.region, countryName(g.country_code) || g.country_code].filter(Boolean).join(", ");
  const устройство = [u.browser, u.os].filter(Boolean).join(" · ");
  return {
    место: место || "место не определилось",
    устройство: устройство || "устройство не определилось",
    ip: clientIp(req) || "адрес не определился",
  };
}

// Телефон владельца для SMS: берём из .env. Без него второго канала нет,
// и это не беда — Telegram работает как работал.
const ТЕЛЕФОН_ВЛАДЕЛЬЦА = () => process.env.ADMIN_PHONE || "";

async function послатьКод(req, code) {
  const о = откуда(req);
  const когда = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" });
  const текст =
    `🔐 <b>Вход в склад</b>\n\n` +
    // <code> — Telegram даёт по нему «нажать и скопировать» одним
    // касанием; на складе код тогда вставится сам.
    `<code>${code}</code>\n` +
    `👆 Нажмите на код — он скопируется. В складе вставится сам.\n` +
    `Годен ${ЖИВЁТ / 60} минут.\n\n` +
    `Откуда: ${esc(о.место)}\n` +
    `Устройство: ${esc(о.устройство)}\n` +
    `Адрес: <code>${esc(о.ip)}</code>\n` +
    `Время: ${esc(когда)}\n\n` +
    `<b>Если это не вы — никому не называйте код и смените пароль склада</b> ` +
    `(Настройки → Смена логина / пароля).`;

  const канал = каналКода();
  const смсМожно = смсНастроены() && !!номерДляSMS(ТЕЛЕФОН_ВЛАДЕЛЬЦА());
  let ушло = false;

  if (канал !== "sms" || !смсМожно) ушло = await sendAdmin(текст, { html: true });

  // SMS: либо так выбран канал, либо Telegram не ответил. Второй канал
  // тут важнее, чем на сайте: если бот упал, владелец без него не
  // попадёт в собственный склад.
  if (смсМожно && (канал !== "telegram" || !ушло)) {
    const с = await отправитьSMS(ТЕЛЕФОН_ВЛАДЕЛЬЦА(),
      `Kod vhoda v sklad: ${code}. Deystvuet ${ЖИВЁТ / 60} minut. Nikomu ne soobshchayte.`);
    if (с.ok) ушло = true;
    else console.error("admin-auth: SMS не ушла —", с.error);
  }
  return ушло;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const { login, password, code } = body || {};

  if (!login || !password)
    return res.status(400).json({ error: "Введите логин и пароль" });

  const creds = readCreds(); // из data/admin-creds.json (после смены через UI)
  let ok = false;

  if (creds?.login && creds?.password_hash) {
    // PBKDF2-хэш (после первой смены через UI)
    ok = login.trim() === creds.login && await verifyPassword(password, creds.password_hash);
  } else {
    // Первичные значения из .env
    const ENV_LOGIN    = process.env.ADMIN_LOGIN    || "";
    const ENV_PASSWORD = process.env.ADMIN_PASSWORD || "";
    if (!ENV_LOGIN || !ENV_PASSWORD)
      return res.status(500).json({ error: "ADMIN_LOGIN и ADMIN_PASSWORD не заданы на сервере (.env)" });
    ok = login.trim() === ENV_LOGIN && password === ENV_PASSWORD;
  }

  if (!ok) return res.status(401).json({ error: "Неверный логин или пароль" });

  const secret = секретПодписи();

  // Бот не настроен или проверку выключили — пускаем по паролю, как раньше.
  if (!кодомПроверяем()) {
    console.warn("admin-auth: вход без кода (ADMIN_2FA=off или бот не настроен)");
    return res.status(200).json({ token: signJWT(secret) });
  }

  const ждёт = взять(КЛЮЧ);

  // ---------- шаг 2: пришёл код ----------
  if (code) {
    if (!ждёт) return res.status(400).json({ error: "Код устарел. Войдите заново." });
    if (verifyCode(String(code).trim(), ждёт.хэш)) {
      забыть(КЛЮЧ);
      return res.status(200).json({ token: signJWT(secret) });
    }
    // Счётчик живёт столько же, сколько сам код: иначе подбор не ограничен.
    const осталось = Math.max(0, Math.round((ждёт.до - Date.now()) / 1000));
    ждёт.ошибок = (ждёт.ошибок || 0) + 1;
    if (ждёт.ошибок >= ПОПЫТОК) {
      забыть(КЛЮЧ);
      sendAdmin("⚠️ Код от склада ввели неверно пять раз подряд — код сгорел.").catch(() => {});
      return res.status(429).json({ error: "Код введён неверно пять раз. Войдите заново." });
    }
    положить(КЛЮЧ, ждёт, осталось || 1);
    return res.status(401).json({ error: `Код неверный. Осталось попыток: ${ПОПЫТОК - ждёт.ошибок}` });
  }

  // ---------- шаг 1: пароль верный, нужен код ----------
  // Код уже слали минуту назад — второй не шлём: иначе любой, кто знает
  // пароль, завалит владельца сообщениями.
  if (ждёт && Date.now() - ждёт.послан < ПОВТОР * 1000) {
    const ждать = Math.ceil((ПОВТОР * 1000 - (Date.now() - ждёт.послан)) / 1000);
    return res.status(200).json({ needCode: true, note: `Код уже отправлен в Telegram. Новый можно запросить через ${ждать} с.` });
  }

  const свежий = genCode();
  const ушло = await послатьКод(req, свежий);
  if (!ушло) {
    // Телеграм не ответил. Запирать владельца снаружи нельзя — но и
    // пускать молча тоже: пишем в журнал сервера и просим повторить.
    console.error("admin-auth: код не ушёл в Telegram");
    return res.status(502).json({ error: "Не удалось отправить код в Telegram. Повторите через минуту." });
  }
  положить(КЛЮЧ, { хэш: hashCode(свежий), послан: Date.now(), до: Date.now() + ЖИВЁТ * 1000, ошибок: 0 }, ЖИВЁТ);
  return res.status(200).json({ needCode: true });
}
