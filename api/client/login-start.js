// POST /api/client/login-start — шаг 1 входа: отправить одноразовый код в Telegram-бот клиента
// Body: { phone }  → Returns { ok:true }
import { normPhone, genCode, hashCode, hashDevice } from "../lib/clientauth.js";
import { sget, spatch } from "../lib/supa.js";
import { isAdminPhone } from "../lib/siteadmin.js";
import { recordEvent, geoFromHeaders, parseUA, countryName } from "../lib/crm.js";
// Второй канал для кода: SMS. Нужен и тем, у кого нет бота, и ради того,
// что код из SMS телефон подставляет в поле сам (см. api/lib/sms.js).
import { отправитьSMS, смсНастроены, каналКода, номерДляSMS } from "../lib/sms.js";
const журнал = (req, extra) => { recordEvent(req, { channel: "site", kind: "login_code", ...extra }).catch(() => {}); };

const CLIENT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const BOT = process.env.CLIENT_BOT_USERNAME || "generalmodernbot";
const PUBLIC_URL = process.env.PUBLIC_URL || "https://generalmodern.uz";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const phone = normPhone(body?.phone);
  const deviceId = String(body?.device_id || "");
  if (phone.length < 7) return res.status(400).json({ error: "Некорректный номер телефона" });

  // Раньше владельцу код не слали — он входил по одному паролю. Теперь
  // слать: он сам попросил видеть каждую попытку входа, чтобы понимать,
  // он это или кто-то другой. Поэтому обхода здесь больше нет.
  const владелец = isAdminPhone(phone);

  try {
    const blocked = await sget(`blocked_phones?phone=eq.${encodeURIComponent(phone)}&select=phone`);
    if (blocked.length) return res.status(403).json({ error: "Этот номер заблокирован. Обратитесь к продавцу." });

    let rows;
    try { rows = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=id,customer_id,chat_id,known_devices,login_code_exp`); }
    catch { rows = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=id,customer_id,chat_id`); }
    const acc = rows[0];
    if (!acc) { журнал(req, { ok: false, phone9: phone }); return res.status(404).json({ error: "Аккаунт не найден. Сначала зарегистрируйтесь." }); }

    // Известное (доверенное) устройство → код не нужен, вход по паролю.
    // Владельца это не касается: ему код нужен именно затем, чтобы знать
    // о каждом входе, в том числе со своего привычного компьютера.
    const known = Array.isArray(acc.known_devices) ? acc.known_devices : [];
    if (!владелец && deviceId && known.includes(hashDevice(deviceId)))
      return res.status(200).json({ ok: true, code_required: false });

    // chat_id: из аккаунта, иначе из привязанного клиента склада
    let chatId = acc.chat_id || null;
    if (!chatId && acc.customer_id) {
      try { const c = (await sget(`customers?id=eq.${acc.customer_id}&select=tg_chat_id`))[0]; chatId = c?.tg_chat_id || null; } catch {}
    }
    // Владельцу — в крайнем случае на его личный чат из .env: иначе, если
    // в аккаунте не оказалось chat_id, он остался бы заперт снаружи.
    if (!chatId && владелец) chatId = process.env.ADMIN_CHAT_ID || null;

    // Бота может и не быть. Раньше это была стена: «откройте бота и
    // нажмите /start» — и войти никак. Теперь, если на сервере заданы
    // доступы Eskiz, код уходит обычной SMS, и бот не нужен вовсе.
    const канал = каналКода();
    const смсМожно = смсНастроены() && !!номерДляSMS(phone);
    const шлёмSMS = смсМожно && (канал === "sms" || канал === "both" || !chatId);
    const шлёмTG = !!chatId && !!CLIENT_TOKEN && (канал !== "sms" || !смсМожно);

    if (!шлёмTG && !шлёмSMS) {
      return res.status(409).json({ error: `Откройте Telegram-бота @${BOT} и нажмите /start, затем повторите вход.` });
    }

    // НЕ ЧАЩЕ ОДНОГО КОДА В МИНУТУ.
    // Без этого любой человек мог вбить чужой номер и жать «Получить код»
    // сколько угодно: владельцу номера летел поток сообщений от бота, а
    // самого бота Telegram мог временно заблокировать за рассылку.
    // Отдельная колонка не нужна: срок действия уже лежит в login_code_exp
    // и равен «выдали + 5 минут». Если до конца осталось больше четырёх
    // минут — значит код выдан меньше минуты назад.
    const доКонца = acc.login_code_exp ? (new Date(acc.login_code_exp).getTime() - Date.now()) : 0;
    if (доКонца > 4 * 60 * 1000) {
      const ждать = Math.max(1, Math.ceil((доКонца - 4 * 60 * 1000) / 1000));
      // Куда именно отправили — зависит от канала, поэтому не называем
      // Telegram: человек мог получить код обычной SMS.
      return res.status(429).json({ error: `Код уже отправлен. Повторить можно через ${ждать} с.` });
    }

    const code = genCode();
    const exp = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 минут
    try {
      const патч = { login_code: hashCode(code), login_code_exp: exp, login_attempts: 0 };
      if (chatId) патч.chat_id = String(chatId);   // без бота колонку не трогаем
      await spatch(`site_accounts?id=eq.${acc.id}`, патч);
    } catch (e) {
      return res.status(500).json({ error: "Колонки кода входа не созданы — запустите db/site-auth.sql в Supabase" });
    }

    // Откуда вход — по этому и понятно, ты это или нет. Город и страну
    // даёт Cloudflare, браузер с системой — строка user-agent.
    const g = geoFromHeaders(req.headers || {});
    const u = parseUA((req.headers || {})["user-agent"]);
    const место = [g.city, g.region, countryName(g.country_code) || g.country_code].filter(Boolean).join(", ");
    const устройство = [u.browser, u.os].filter(Boolean).join(" · ");
    const откуда =
      `\n\nОткуда: ${место || "место не определилось"}` +
      `\nУстройство: ${устройство || "устройство не определилось"}` +
      `\nВремя: ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })}`;

    // Код моноширинным (одинарные кавычки Markdown), а НЕ жирным: по
    // моноширинному Telegram даёт «нажать и скопировать» одним касанием.
    // По жирному не даёт — его приходилось выделять вручную.
    const text = `🔐 Код для входа на generalmodern.uz:\n\n\`${code}\`\n\n👆 Нажмите на код — он скопируется. На сайте вставится сам.\n\nДействует 5 минут. Никому не сообщайте этот код.`
      + откуда
      + `\n\nЕсли это не вы — не вводите код и смените пароль.`;
    const reply_markup = { inline_keyboard: [[{ text: "🌐 Вернуться на сайт", url: PUBLIC_URL }]] };

    // Текст SMS короткий и без лишнего: телефон подставляет код в поле
    // сам, и чем проще сообщение, тем надёжнее он его узнаёт. Город и
    // браузер в SMS не пишем — это платные символы, а в Telegram они и
    // так есть.
    const смсТекст = `Kod: ${code}. generalmodern.uz. Deystvuet 5 minut. Nikomu ne soobshchayte.`;

    let ушло = false;
    const беды = [];

    if (шлёмTG) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${CLIENT_TOKEN}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", reply_markup }),
        });
        const j = await r.json();
        if (j.ok) ушло = true; else беды.push("Telegram: " + (j.description || "отказ"));
      } catch (e) { беды.push("Telegram: " + e.message); }
    }

    // SMS шлём, если так выбран канал — или если в Telegram не ушло.
    if (шлёмSMS && (канал !== "telegram" || !ушло)) {
      const с = await отправитьSMS(phone, смсТекст);
      if (с.ok) ушло = true; else беды.push("SMS: " + с.error);
    }

    if (!ушло) {
      console.error("login-start: код не доставлен —", беды.join(" | "));
      return res.status(502).json({ error: `Не удалось отправить код. Откройте бота @${BOT}, нажмите /start и повторите.` });
    }

    журнал(req, { ok: true, phone9: phone, site_account_id: acc.id, customer_id: acc.customer_id });
    // Куда именно ушёл код — чтобы на экране написать честно.
    return res.status(200).json({ ok: true, code_required: true, канал: шлёмSMS && !шлёмTG ? "sms" : (шлёмSMS && шлёмTG ? "both" : "telegram") });
  } catch (e) {
    console.error("login-start error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
