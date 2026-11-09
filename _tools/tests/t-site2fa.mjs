// ========================================================================
//  КОД ПРИ ВХОДЕ НА САЙТ — И ВЛАДЕЛЬЦУ ТОЖЕ.
//  node _tools/tests/t-site2fa.mjs
//
//  Было: владелец входил на сайт по одному паролю, код ему не слали
//  (api/client/login-start.js возвращал code_required:false), и вход с
//  доверенного устройства тоже проходил без кода.
//
//  Стало: владельцу код приходит ВСЕГДА — он сам попросил видеть каждую
//  попытку войти под собой. Клиентам доверенное устройство код
//  по-прежнему заменяет: им эта проверка нужна от чужих, а не от себя.
//
//  Здесь же стережём, что владелец не запрётся снаружи: если в его
//  аккаунте не оказалось chat_id, код уходит на ADMIN_CHAT_ID из .env.
// ========================================================================

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

const корень = new URL("../../", import.meta.url);

const ВЛАДЕЛЕЦ = "974090119";        // normPhone оставляет девять цифр (api/lib/siteadmin.js)
const КЛИЕНТ   = "901112233";

process.env.CLIENT_BOT_TOKEN = "123:тест";
process.env.ADMIN_CHAT_ID = "837138321";
process.env.SUPABASE_URL = "https://тест.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "тест";

// ---------- поддельная база и Telegram ----------
let аккаунты = [];
let посланные = [];
let последнийПатч = null;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes("api.telegram.org")) {
    посланные.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "ok" };
  }
  // PostgREST
  if (u.includes("blocked_phones")) return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
  if (u.includes("site_accounts")) {
    if ((opts.method || "GET").toUpperCase() === "PATCH") {
      последнийПатч = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => [{}], text: async () => "[{}]" };
    }
    const м = u.match(/phone=eq\.([^&]+)/);
    const тел = м ? decodeURIComponent(м[1]) : "";
    return { ok: true, status: 200, json: async () => аккаунты.filter(a => a.phone === тел), text: async () => "[]" };
  }
  if (u.includes("customers")) return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
  return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
};

const { default: loginStart } = await import(new URL("api/client/login-start.js", корень));
const { hashDevice } = await import(new URL("api/lib/clientauth.js", корень));

function зов(body, headers = {}) {
  const req = { method: "POST", body, headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "cf-ipcountry": "UZ", "cf-ipcity": "Tashkent", ...headers } };
  let статус = 200, ответ = null;
  const res = { status(s) { статус = s; return res; }, json(j) { ответ = j; return res; }, setHeader() {}, end() { return res; } };
  return loginStart(req, res).then(() => ({ статус, ...(ответ || {}) }));
}
const чисто = () => { посланные = []; последнийПатч = null; };

// ---------- 1. Владельцу код приходит ----------
{
  чисто();
  аккаунты = [{ id: "a1", phone: ВЛАДЕЛЕЦ, chat_id: "837138321", customer_id: null, known_devices: [], login_code: null, login_code_exp: null }];
  const r = await зов({ phone: ВЛАДЕЛЕЦ });
  ok("владельцу код нужен", r.code_required === true && r.статус === 200);
  ok("сообщение ушло", посланные.length === 1);
  // Код ИМЕННО моноширинный (одинарные кавычки Markdown), а не жирный:
  // по моноширинному Telegram даёт «нажать и скопировать» одним
  // касанием, и дальше сайт вставляет его сам (js/kodizbufera.js).
  // По жирному Telegram копировать не даёт — его выделяли вручную.
  ok("код моноширинный — нажатием копируется", /`\d{6}`/.test(посланные[0].text));
  ok("и не жирный", !/\*\d{6}\*/.test(посланные[0].text));
  ok("код записан в аккаунт хэшем", !!последнийПатч?.login_code && последнийПатч.login_code.length === 64);
}

// ---------- 2. В сообщении видно, откуда входят ----------
{
  чисто();
  аккаунты = [{ id: "a1", phone: ВЛАДЕЛЕЦ, chat_id: "837138321", known_devices: [] }];
  await зов({ phone: ВЛАДЕЛЕЦ });
  const т = посланные[0].text;
  ok("виден город", /Tashkent/.test(т));
  ok("видно устройство", /Safari/.test(т));
  ok("видно время", /Время:/.test(т));
  ok("есть предупреждение «если это не вы»", /Если это не вы/.test(т));
}

// ---------- 3. Доверенное устройство владельца код НЕ отменяет ----------
{
  чисто();
  const моё = "устройство-владельца";
  аккаунты = [{ id: "a1", phone: ВЛАДЕЛЕЦ, chat_id: "837138321", known_devices: [hashDevice(моё)] }];
  const r = await зов({ phone: ВЛАДЕЛЕЦ, device_id: моё });
  ok("со своего компьютера владельцу код всё равно шлём", r.code_required === true && посланные.length === 1);
}

// ---------- 4. Клиенту доверенное устройство код заменяет ----------
{
  чисто();
  const своё = "устройство-клиента";
  аккаунты = [{ id: "c1", phone: КЛИЕНТ, chat_id: "555", known_devices: [hashDevice(своё)] }];
  const r = await зов({ phone: КЛИЕНТ, device_id: своё });
  ok("клиенту с доверенного устройства код не нужен", r.code_required === false);
  ok("и сообщение ему не шлём", посланные.length === 0);
}

// ---------- 5. Обычному клиенту код приходит ----------
{
  чисто();
  аккаунты = [{ id: "c1", phone: КЛИЕНТ, chat_id: "555", known_devices: [] }];
  const r = await зов({ phone: КЛИЕНТ });
  ok("клиенту с нового устройства код нужен", r.code_required === true && посланные.length === 1);
  ok("клиенту шлём на ЕГО чат", String(посланные[0].chat_id) === "555");
}

// ---------- 6. Владелец не запирается снаружи ----------
{
  чисто();
  аккаунты = [{ id: "a1", phone: ВЛАДЕЛЕЦ, chat_id: null, customer_id: null, known_devices: [] }];
  const r = await зов({ phone: ВЛАДЕЛЕЦ });
  ok("без chat_id в аккаунте код уходит на ADMIN_CHAT_ID", r.code_required === true && посланные.length === 1);
  ok("и именно на личный чат владельца", String(посланные[0].chat_id) === "837138321");
}

// ---------- 7. Клиенту без chat_id — понятное объяснение ----------
{
  чисто();
  аккаунты = [{ id: "c1", phone: КЛИЕНТ, chat_id: null, customer_id: null, known_devices: [] }];
  const r = await зов({ phone: КЛИЕНТ });
  ok("клиента без бота отправляем в бота", r.статус === 409 && /Telegram/.test(r.error || ""));
  ok("и ничего не шлём", посланные.length === 0);
}

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nКОД ПРИ ВХОДЕ НА САЙТ В ПОРЯДКЕ");
process.exit(плохо ? 1 : 0);
