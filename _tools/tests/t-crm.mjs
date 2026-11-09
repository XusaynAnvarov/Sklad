// ========================================================================
//  CRM: регистрация, привязка, гео, риск.   node _tools/tests/t-crm.mjs
//
//  Проверяем чистые функции api/lib/crm.js — то, от чего зависит, сольются
//  ли чужие аккаунты, создастся ли дубль, и не появится ли выдуманный город.
//  База и Telegram не нужны.
// ========================================================================
const корень = new URL("../../", import.meta.url);
const crm = await import(new URL("api/lib/crm.js", корень));
const { toE164, phone9, decideLink, parseStartPayload, geoFromHeaders, parseUA, nearestCity, cityByName, computeRisk, newClientMessage } = crm;

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ---------- телефон → E.164 ----------
ok("9 цифр → +998", toE164("901234567") === "+998901234567");
ok("Telegram без плюса", toE164("998901234567") === "+998901234567");
ok("со скобками и дефисами", toE164("+998 (90) 123-45-67") === "+998901234567");
ok("8 + 9 цифр", toE164("8 90 123 45 67") === "+998901234567");
ok("00 в начале", toE164("00998901234567") === "+998901234567");
ok("казахский номер не портится", toE164("77011234567") === "+77011234567");
ok("мусор → null", toE164("12") === null && toE164("") === null);
ok("phone9 совпадает с normPhone проекта", phone9("+998 90 123 45 67") === "901234567");

// ---------- привязка: никогда не сливаем по неоднозначному номеру ----------
ok("нет совпадений → лид", decideLink([]).link_status === "lead" && decideLink([]).customer_id === null);
ok("одно совпадение → привязка", decideLink([{ id: "a" }]).customer_id === "a");
const два = decideLink([{ id: "a" }, { id: "b" }]);
ok("два клиента с номером → ручная проверка, без привязки", два.link_status === "review" && два.customer_id === null && два.candidates.length === 2);
ok("undefined не падает", decideLink(undefined).link_status === "lead");

// ---------- /start <payload> ----------
ok("QR-код", parseStartPayload("/start qr_shop").entry_point === "deeplink:qr_shop");
ok("кампания", parseStartPayload("/start c_autumn").entry_point === "campaign:autumn");
ok("реферал", parseStartPayload("/start ref_AB12").ref_code === "AB12");
const u = parseStartPayload("/start utm_ig_story");
ok("utm", u.utm.source === "ig" && u.utm.campaign === "story");
ok("verify_ — это регистрация сайта, не реклама", parseStartPayload("/start verify_" + "a".repeat(48)) === null);
ok("голый /start — без точки входа", parseStartPayload("/start") === null);
ok("недопустимые символы отбрасываются", parseStartPayload("/start <script>") === null);

// ---------- гео по IP: ничего не придумываем ----------
const g1 = geoFromHeaders({ "cf-ipcountry": "UZ", "cf-ipcity": "Tashkent", "cf-region": "Toshkent" });
ok("город из Cloudflare", g1.country === "Узбекистан" && g1.city === "Tashkent" && g1.geo_accuracy === "city");
const g2 = geoFromHeaders({ "cf-ipcountry": "KZ" });
ok("только страна → город пустой, точность country", g2.country_code === "KZ" && g2.city === null && g2.geo_accuracy === "country");
const g3 = geoFromHeaders({});
ok("нет заголовков → всё пусто и есть причина", g3.country === null && g3.city === null && !!g3.reason);
const g4 = geoFromHeaders({ "cf-ipcountry": "T1" });
ok("Tor → страна скрыта, флаг tor", g4.country === null && g4.tor === true);
ok("XX → неизвестно", geoFromHeaders({ "cf-ipcountry": "XX" }).country_code === null);

// ---------- устройство ----------
const ios = parseUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
ok("iPhone Safari", ios.device === "mobile" && ios.os === "iOS" && ios.browser === "Safari");
const win = parseUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
ok("Windows Chrome", win.device === "desktop" && win.os === "Windows" && win.browser === "Chrome");
ok("бот распознан", parseUA("Googlebot/2.1").device === "bot");
ok("пустой UA → всё null, не «Chrome по умолчанию»", Object.values(parseUA("")).every(v => v === null));

// ---------- город из координат ----------
ok("центр Ташкента", nearestCity(41.30, 69.24)?.city === "Ташкент");
ok("Андижан", nearestCity(40.78, 72.35)?.city === "Андижан");
ok("Алматы → Казахстан", nearestCity(43.25, 76.92)?.country === "Казахстан");
ok("середина пустыни → не определено", nearestCity(43.0, 63.0) === null);
ok("мусорные координаты → null", nearestCity("x", 999) === null);
ok("кнопка города даёт страну", cityByName("Самарканд")?.country === "Узбекистан");
ok("незнакомый город → null (страну не угадываем)", cityByName("Чуст") === null);

// ---------- риск: другая страна сама по себе не блок ----------
ok("обычный вход — без риска", computeRisk({ kind: "login_ok", priorOkLogins: 5, knownCountries: ["UZ"], country_code: "UZ" }).score === 0);
const стр = computeRisk({ kind: "login_ok", priorOkLogins: 5, knownCountries: ["UZ"], country_code: "TR" });
ok("новая страна со знакомого устройства — низкий риск", стр.level === "low");
ok("первый вход из другой страны — без риска (нет истории)", computeRisk({ kind: "login_ok", priorOkLogins: 0, knownCountries: [], country_code: "TR" }).score === 0);
ok("новое устройство + новая страна — средний", computeRisk({ kind: "login_ok", priorOkLogins: 5, knownCountries: ["UZ"], country_code: "TR", newDevice: true }).level === "medium");
ok("5 неудачных входов — средний", computeRisk({ kind: "login_fail", failsPhone15m: 5 }).level === "medium");
ok("10 неудачных — высокий", computeRisk({ kind: "login_fail", failsPhone15m: 10 }).level === "high");
ok("перебор номеров с IP — повод", computeRisk({ kind: "login_fail", failsPhone15m: 1, phonesFromIp1h: 4 }).score >= 60);
ok("флуд к боту", computeRisk({ botMsgsPerMin: 35 }).score >= 60);
ok("риск не больше 100", computeRisk({ kind: "login_fail", failsPhone15m: 20, phonesFromIp1h: 9, tor: true, impersonation: true }).score === 100);

// ---------- уведомление: нет данных → «Не определено», не выдумка ----------
const msg = newClientMessage({ first_name: "Aziz", phone: "+998901234567", tg_user_id: "123", source: "telegram", entry_point: "deeplink:qr_shop", num: 7, registered_at: "2026-11-09T09:35:00Z" }, { statusLine: "Новый клиент" });
ok("город неизвестен → «Не определено»", /Город: Не определено/.test(msg));
ok("страна неизвестна → объяснение", /Страна: Не определено \(Telegram не передаёт/.test(msg));
ok("время по Ташкенту", /14:35 \(Ташкент\)/.test(msg));
ok("телефон красиво", msg.includes("+998 90 123 45 67"));
ok("QR-код в кампании", msg.includes("QR-код: shop"));
const xss = newClientMessage({ first_name: "<b>x</b>", tg_username: "a<i>", num: 1 }, { statusLine: "s" });
ok("HTML из имени экранируется", !xss.includes("<b>x</b>") && xss.includes("&lt;b&gt;x&lt;/b&gt;"));

console.log(плохо ? `\n❌ Ошибок: ${плохо}` : "\n✅ Все проверки CRM пройдены");
process.exit(плохо ? 1 : 0);
