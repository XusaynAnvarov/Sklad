// ========================================================================
//  ВХОД В СКЛАД ПО КОДУ.  node _tools/tests/t-admin2fa.mjs
//
//  Владелец: «сделай так, чтобы пришёл код для подтверждения в Telegram,
//  даже для меня — чтобы знать, я это или нет».
//
//  Что здесь стережём:
//    • один пароль больше не пускает — нужен ещё код;
//    • код без пароля тоже не пускает: перехватив сообщение, в склад не
//      попасть;
//    • подбор кода ограничен пятью попытками;
//    • код не шлётся чаще раза в минуту — иначе любой, кто знает пароль,
//      завалит владельца сообщениями;
//    • и главное: владелец НЕ ЗАПИРАЕТСЯ СНАРУЖИ. Нет бота или стоит
//      ADMIN_2FA=off — вход работает по паролю, как раньше.
// ========================================================================

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

const корень = new URL("../../", import.meta.url);

// ---------- поддельное окружение ----------
const ЛОГИН = "hozyain", ПАРОЛЬ = "очень-длинный-пароль";
let посланные = [];

// Telegram подменяем на свой: ничего наружу не уходит, а код забираем
// из текста сообщения — ровно как его увидит владелец.
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("api.telegram.org")) {
    const тело = JSON.parse(opts.body);
    посланные.push(тело.text);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  throw new Error("неожиданный запрос наружу: " + u);
};

process.env.ADMIN_LOGIN = ЛОГИН;
process.env.ADMIN_PASSWORD = ПАРОЛЬ;
process.env.SITE_JWT_SECRET = "тест";
process.env.CLIENT_BOT_TOKEN = "123:тест";
process.env.TELEGRAM_BOT_TOKEN = "123:тест";
process.env.ADMIN_CHAT_ID = "837138321";
delete process.env.ADMIN_2FA;

const { default: handler } = await import(new URL("api/admin-auth.js", корень));
const { забыть } = await import(new URL("api/lib/memcache.js", корень));

// Минимальные req/res, каких ждёт обработчик.
function зов(body, headers = {}) {
  const req = { method: "POST", body, headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130", ...headers } };
  let статус = 200, ответ = null;
  const res = {
    setHeader() {},
    status(s) { статус = s; return res; },
    json(j) { ответ = j; return res; },
    end() { return res; },
  };
  return handler(req, res).then(() => ({ статус, ...ответ }));
}
const кодИзСообщения = (t) => (String(t).match(/<code>(\d{6})<\/code>/) || [])[1];
const чисто = () => { забыть("admin2fa"); посланные = []; };

// ---------- 1. Пароля мало: приходит код ----------
{
  чисто();
  const r = await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  ok("на верный пароль токен НЕ выдаётся", !r.token);
  ok("сервер просит код", r.needCode === true && r.статус === 200);
  ok("сообщение ушло владельцу", посланные.length === 1);
  const т = посланные[0];
  ok("в сообщении есть шестизначный код", /<code>\d{6}<\/code>/.test(т));
  ok("видно, откуда вход", /Откуда:/.test(т) && /Адрес:/.test(т) && /Время:/.test(т));
  ok("видно устройство", /Chrome/.test(т));
  ok("есть предупреждение «если это не вы»", /Если это не вы/.test(т));
}

// ---------- 2. Верный код пускает ----------
{
  чисто();
  await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  const code = кодИзСообщения(посланные[0]);
  const r = await зов({ login: ЛОГИН, password: ПАРОЛЬ, code });
  ok("верный код выдаёт ключ", typeof r.token === "string" && r.token.split(".").length === 3);
  const полезное = JSON.parse(Buffer.from(r.token.split(".")[1], "base64url").toString());
  ok("в ключе роль владельца", полезное.role === "admin");

  const ещё = await зов({ login: ЛОГИН, password: ПАРОЛЬ, code });
  ok("тот же код второй раз не работает", !ещё.token);
}

// ---------- 3. Код без пароля не пускает ----------
{
  чисто();
  await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  const code = кодИзСообщения(посланные[0]);
  const r = await зов({ login: ЛОГИН, password: "не тот пароль", code });
  ok("перехваченный код без пароля бесполезен", !r.token && r.статус === 401);
}

// ---------- 4. Подбор кода ограничен ----------
{
  чисто();
  await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  const верный = кодИзСообщения(посланные[0]);
  const мимо = верный === "000000" ? "111111" : "000000";
  let последний;
  for (let i = 0; i < 5; i++) последний = await зов({ login: ЛОГИН, password: ПАРОЛЬ, code: мимо });
  ok("после пяти промахов код сгорает", последний.статус === 429);
  const r = await зов({ login: ЛОГИН, password: ПАРОЛЬ, code: верный });
  ok("сгоревший код уже не пускает", !r.token);
  ok("о подборе сообщили владельцу", посланные.some(t => /неверно пять раз/.test(t)));
}

// ---------- 5. Код не шлётся чаще раза в минуту ----------
{
  чисто();
  await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  const r = await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  ok("второй код сразу не шлём", посланные.length === 1);
  ok("но вход не ломаем — всё ещё ждём код", r.needCode === true);
  ok("говорим, через сколько можно повторить", /через \d+ с/.test(r.note || ""));
}

// ---------- 6. Неверный пароль кода не вызывает ----------
{
  чисто();
  const r = await зов({ login: ЛОГИН, password: "подбор" });
  ok("на чужой пароль код не отправляется", посланные.length === 0);
  ok("на чужой пароль — 401", r.статус === 401 && !r.token);
}

// ---------- 7. Владелец не запирается снаружи ----------
{
  чисто();
  const было = process.env.ADMIN_CHAT_ID;
  delete process.env.ADMIN_CHAT_ID;                 // бот не настроен
  const r = await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  ok("без настроенного бота пускаем по паролю", typeof r.token === "string");
  process.env.ADMIN_CHAT_ID = было;

  process.env.ADMIN_2FA = "off";                    // выключили вручную
  чисто();
  const r2 = await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  ok("ADMIN_2FA=off пускает по паролю", typeof r2.token === "string");
  ok("при выключенной проверке код не шлём", посланные.length === 0);
  delete process.env.ADMIN_2FA;
}

// ---------- 8. Telegram молчит — не пускаем молча ----------
{
  чисто();
  const прежний = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ ok: false }) });
  const r = await зов({ login: ЛОГИН, password: ПАРОЛЬ });
  ok("не доставили код — ключ не выдаём", !r.token && r.статус === 502);
  ok("и говорим, что делать", /Повторите/.test(r.error || ""));
  globalThis.fetch = прежний;
}

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nВХОД В СКЛАД ПО КОДУ В ПОРЯДКЕ");
process.exit(плохо ? 1 : 0);
