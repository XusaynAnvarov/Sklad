// ========================================================================
//  СКВОЗНОЙ ТЕСТ РЕГИСТРАЦИИ ЧЕРЕЗ БОТА.   node _tools/tests/t-crm-flow.mjs
//
//  Настоящий api/bot.js, но база и Telegram подменены в памяти: fetch
//  перехватывается, запросы PostgREST исполняются над массивами. Никаких
//  обращений к боевым серверам.
//
//  Проверяем: лид без дублей, привязку к клиенту склада, отказ сливать
//  при двух владельцах номера, чужой контакт, повтор вебхука, город,
//  и что без таблиц CRM бот работает по-старому.
// ========================================================================
process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_KEY = "k";
process.env.TELEGRAM_WEBHOOK_SECRET = "s";
process.env.CLIENT_BOT_TOKEN = "client";
process.env.TELEGRAM_BOT_TOKEN = "admin";
process.env.ADMIN_CHAT_ID = "1";
process.env.DB_MODE = "supabase";

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ---------------- база в памяти ----------------
let db, crmOff = false, seq = 0, num = 1000;
function reset(customers = []) { db = { customers, crm_clients: [], client_events: [], crm_audit: [], bot_sessions: [], site_verifications: [], sales: [], payments: [] }; crmOff = false; }
const uid = () => "00000000-0000-4000-8000-" + String(++seq).padStart(12, "0");
function match(row, col, op, val) {
  const v = row[col];
  switch (op) {
    case "eq": return String(v) === val;
    case "neq": return String(v) !== val;
    case "gte": return v != null && String(v) >= val;
    case "lte": return v != null && String(v) <= val;
    case "gt": return v != null && String(v) > val;
    case "lt": return v != null && String(v) < val;
    case "is": return val === "null" ? v == null : String(v) === val;
    case "not": return val === "is.null" ? v != null : true;
    case "in": return val.replace(/^\(|\)$/g, "").split(",").includes(String(v));
    case "cs": { const need = JSON.parse(val); return Array.isArray(v) && need.every(x => v.map(String).includes(String(x))); }
  }
  throw new Error("op " + op);
}
function query(path) {
  const [t, qs = ""] = path.split("?");
  let rows = db[t]; let limit = null, order = null;
  if (!rows) return null;
  rows = rows.slice();
  for (const part of qs.split("&").filter(Boolean)) {
    const i = part.indexOf("="), k = decodeURIComponent(part.slice(0, i)), v = decodeURIComponent(part.slice(i + 1));
    if (k === "select") continue;
    if (k === "limit") { limit = +v; continue; }
    if (k === "order") { order = v; continue; }
    const d = v.indexOf(".");
    rows = rows.filter(r => match(r, k, v.slice(0, d), v.slice(d + 1)));
  }
  if (order) { const [c, dir] = order.split(","[0]).toString().split("."); rows.sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (dir === "desc" ? -1 : 1)); }
  return limit ? rows.slice(0, limit) : rows;
}
const tgCalls = [];
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url.startsWith("https://api.telegram.org/")) {
    const [, bot, method] = url.match(/bot([^/]+)\/(\w+)/);
    tgCalls.push({ bot, method, body: opt.body ? JSON.parse(opt.body) : {} });
    return json({ ok: true, result: method === "getChatAdministrators" ? [] : { message_id: 1 } });
  }
  if (!url.startsWith("http://db.test/rest/v1/")) throw new Error("неожиданный адрес " + url);
  const path = url.slice("http://db.test/rest/v1/".length);
  const t = path.split("?")[0];
  if (crmOff && /^(crm_clients|client_events|crm_audit)$/.test(t)) return new Response(JSON.stringify({ code: "PGRST205", message: `Could not find the table 'public.${t}'` }), { status: 404 });
  const method = opt.method || "GET";
  if (method === "GET") { const r = query(path); return r ? json(r) : new Response("no table " + t, { status: 404 }); }
  if (method === "POST") {
    const body = JSON.parse(opt.body); const list = Array.isArray(body) ? body : [body]; const out = [];
    for (const r of list) {
      const key = t === "bot_sessions" ? "chat_id" : "id";
      const row = { ...r };
      if (t === "client_events" && row.dedup_key && db[t].some(x => x.dedup_key === row.dedup_key)) return new Response('{"code":"23505","message":"duplicate key client_events_dedup"}', { status: 409 });
      if (t === "crm_clients" && row.tg_user_id && db[t].some(x => x.tg_user_id === row.tg_user_id)) return new Response('{"code":"23505","message":"duplicate key crm_clients_tg_unique"}', { status: 409 });
      const was = row[key] != null && db[t].find(x => String(x[key]) === String(row[key]));
      if (was) { Object.assign(was, row); out.push(was); continue; }
      if (key === "id" && !row.id) row.id = uid();
      if (!row.created_at) row.created_at = new Date().toISOString();
      if (t === "crm_clients" && row.num == null) row.num = ++num;
      db[t].push(row); out.push(row);
    }
    return json(out, 201);
  }
  if (method === "PATCH") { const rows = query(path); const b = JSON.parse(opt.body); rows.forEach(r => Object.assign(r, b)); return json(rows); }
  if (method === "DELETE") { const rows = query(path); db[t] = db[t].filter(r => !rows.includes(r)); return new Response("", { status: 204 }); }
};

const { default: bot } = await import(new URL("../../api/bot.js", import.meta.url));
let upd = 100;
async function send(update) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, send() { return this; }, json() { return this; } };
  await bot({ method: "POST", headers: { "x-telegram-bot-api-secret-token": "s" }, body: { update_id: update.update_id ?? ++upd, ...update } }, res);
  return res;
}
const from = (id, extra = {}) => ({ id, is_bot: false, first_name: "Aziz", last_name: "Karimov", username: "aziz_k", language_code: "ru", ...extra });
const msg = (id, extra, fr = from(id)) => ({ message: { message_id: 1, chat: { id, type: "private" }, from: fr, date: 0, ...extra } });
const contact = (id, phone, owner = id) => msg(id, { contact: { phone_number: phone, user_id: owner, first_name: "Aziz" } });
const adminMsgs = () => tgCalls.filter(c => c.bot === "admin" && c.method === "sendMessage").map(c => c.body.text);
const clientMsgs = (id) => tgCalls.filter(c => c.bot === "client" && c.method === "sendMessage" && String(c.body.chat_id) === String(id));
const tick = () => new Promise(r => setTimeout(r, 20));

// ---------- 1. новый человек: /start с QR → номер → лид ----------
reset([{ id: "c-old", name: "Старый клиент", contact: "+998 91 111 11 11" }]);
await send(msg(500, { text: "/start qr_shop" }));
ok("первое обращение создаёт карточку started", db.crm_clients.length === 1 && db.crm_clients[0].link_status === "started");
ok("точка входа — QR-код", db.crm_clients[0].entry_point === "deeplink:qr_shop");
ok("запуск бота записан", db.client_events.some(e => e.kind === "bot_start"));
await send(contact(500, "998901234567"));
let c = db.crm_clients[0];
ok("после номера — лид с E.164", c.link_status === "lead" && c.phone === "+998901234567" && c.phone9 === "901234567");
ok("дата регистрации и согласия", !!c.registered_at && !!c.consent_at);
ok("в склад лид НЕ попал", db.customers.length === 1);
const notif = adminMsgs().filter(t => t.includes("НОВЫЙ КЛИЕНТ"));
ok("владельцу ушло одно уведомление", notif.length === 1);
ok("в уведомлении город «Не определено», не выдуман", /Город: Не определено/.test(notif[0]));
const кнопка = tgCalls.find(x => x.bot === "admin" && x.body.reply_markup?.inline_keyboard)?.body.reply_markup.inline_keyboard[0][0];
ok("кнопка «Открыть карточку клиента» ведёт в админку", кнопка?.text === "Открыть карточку клиента" && кнопка.url.includes("/admin#/crm?id=" + c.id));
ok("старое «номер не найден» не продублировано", !adminMsgs().some(t => t.includes("номер не найден")));
ok("клиенту предложили указать город (необязательно)", clientMsgs(500).some(m => /города/.test(m.body.text)));

// ---------- 2. повторный /start и номер — без дублей ----------
await send(msg(500, { text: "/start" }));
await send(contact(500, "+998 90 123 45 67"));
ok("повтор не создаёт вторую карточку", db.crm_clients.length === 1);
ok("повтор не шлёт второе уведомление", adminMsgs().filter(t => t.includes("НОВЫЙ КЛИЕНТ")).length === 1);

// ---------- 3. повтор вебхука (тот же update_id) ----------
const до = db.client_events.length;
await send({ update_id: 777, ...contact(500, "998901234567") });
await send({ update_id: 777, ...contact(500, "998901234567") });
ok("повтор вебхука не пишет событие дважды", db.client_events.filter(e => e.dedup_key === "tg:777").length === 1 && db.client_events.length === до + 1);

// ---------- 4. город кнопкой ----------
await send({ callback_query: { id: "q1", from: from(500), data: "city:Андижан", message: { message_id: 9, chat: { id: 500 } } } });
c = db.crm_clients[0];
ok("город записан со страной и источником «указал сам»", c.city === "Андижан" && c.country === "Узбекистан" && c.geo_source === "user_city");
ok("вручную указанный город — событие location", db.client_events.some(e => e.kind === "location" && e.city === "Андижан"));

// ---------- 5. геопозиция: координаты не храним ----------
await send(msg(501, { text: "/start" }, from(501, { username: "geo" })));
await send(contact(501, "998935554433"));
await send(msg(501, { location: { latitude: 41.31, longitude: 69.25 } }, from(501)));
const g = db.crm_clients.find(x => x.tg_user_id === "501");
ok("по геопозиции — ближайший город", g.city === "Ташкент" && g.geo_source === "location");
ok("координаты нигде не сохранены", !JSON.stringify(db).includes("69.25"));

// ---------- 6. чужой контакт ----------
reset([{ id: "c1", name: "Жертва", contact: "901112233" }]);
tgCalls.length = 0;
await send(msg(600, { text: "/start" }));
await send(contact(600, "998901112233", 999));
ok("чужой контакт: привязки нет", !db.crm_clients[0].customer_id && !db.crm_clients[0].registered_at);
ok("чужой контакт: tg_chat_id жертве не записан", !db.customers[0].tg_chat_id);
ok("чужой контакт: событие impersonation с высоким риском", db.client_events.some(e => e.kind === "impersonation" && e.risk >= 70));
ok("владелец получил одно (не два) предупреждение", adminMsgs().filter(t => /ЧУЖОМУ|Подозрительная/.test(t)).length === 1);

// ---------- 7. существующий клиент склада ----------
reset([{ id: "c1", name: "Азиз (склад)", contact: "+998 90 777 66 55" }]);
tgCalls.length = 0;
await send(msg(700, { text: "/start" }));
await send(contact(700, "998907776655"));
ok("найден по номеру → привязан", db.crm_clients[0].customer_id === "c1" && db.crm_clients[0].link_status === "linked");
ok("Telegram записан в карточку склада", db.customers[0].tg_chat_id === "700");
ok("уведомление: существующий клиент", adminMsgs().some(t => t.includes("Существующий клиент склада")));
ok("старое «подключился к боту» не продублировано", !adminMsgs().some(t => t.includes("подключился к Telegram-боту")));

// ---------- 8. номер у двух клиентов — ничего не сливаем ----------
reset([{ id: "a", name: "Магазин А", contact: "901234000" }, { id: "b", name: "Магазин Б", phones: ["+998901234000"] }]);
tgCalls.length = 0;
await send(msg(800, { text: "/start" }));
await send(contact(800, "998901234000"));
ok("номер у двух → review, без привязки", db.crm_clients[0].link_status === "review" && !db.crm_clients[0].customer_id);
ok("ни одному клиенту Telegram не записан", !db.customers.some(x => x.tg_chat_id));
ok("уведомление просит ручную проверку", adminMsgs().some(t => t.includes("нужна ручная проверка")));

// ---------- 9. без таблиц CRM — по-старому ----------
reset([]);
crmOff = true; tgCalls.length = 0;
await send(msg(900, { text: "/start" }));
await send(contact(900, "998905550000"));
ok("без CRM бот не падает и шлёт старое уведомление", adminMsgs().some(t => t.includes("номер не найден")));
ok("клиенту — прежний ответ", clientMsgs(900).some(m => /не найден/.test(m.body.text)));

// ---------- 10. флуд ----------
reset([]); tgCalls.length = 0;
for (let i = 0; i < 45; i++) await send(msg(1000, { text: "spam " + i }));
ok("флуд записан событием", db.client_events.some(e => e.kind === "bot_flood" && e.risk >= 60));
const ответов = clientMsgs(1000).length;
ok("после 40 сообщений в минуту бот перестаёт отвечать", ответов <= 41);

await tick();
console.log(плохо ? `\n❌ Ошибок: ${плохо}` : "\n✅ Сквозной сценарий регистрации пройден");
process.exit(плохо ? 1 : 0);
