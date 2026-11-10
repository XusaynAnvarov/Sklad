// ========================================================================
//  СБОРКА И ОТПРАВКА.   node _tools/tests/t-fulfillment.mjs
//
//  1. Расчёты доски (js/fulfillment-core.js): кто в учёте, разделы,
//     счётчики, фильтры, история, шкала.
//  2. Серверное ядро (api/lib/fulfillment.js) с подменённым fetch:
//     ошибки базы → понятные ответы, клиент не видит внутренних данных,
//     уведомление уходит только после успешной записи.
//  3. Ручка /api/admin/fulfillment: без входа и с гостевым токеном
//     менять этапы нельзя.
//
//  Саму SQL-функцию (блокировки, запрет пропуска этапа, журнал с хэшами)
//  проверяли на настоящем Postgres (PGlite) — см. db/order-fulfillment-migration.sql.
// ========================================================================
process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_KEY = "k";
process.env.CLIENT_BOT_TOKEN = "client";
process.env.SITE_JWT_SECRET = "test-secret";
process.env.DB_MODE = "supabase";

const корень = new URL("../../", import.meta.url);
const core = await import(new URL("js/fulfillment-core.js", корень));
const lib = await import(new URL("api/lib/fulfillment.js", корень));
const { signRoleJWT } = await import(new URL("api/lib/tg.js", корень));
const handler = (await import(new URL("api/admin/fulfillment.js", корень))).default;

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ---------------- 1. расчёты доски ----------------
const since = "2026-11-10T00:00:00Z";
const sale = (id, extra = {}) => ({ id, status: "final", date: "2026-11-10T08:00:00Z", created_at: "2026-11-10T08:00:00Z", currency: "som",
  items: [{ product_id: "p1", qty: 3, unit_price: 1000, currency: "som" }, { product_id: "p2", qty: 2, unit_price: 5, currency: "usd", paid: true }], ...extra });
const sales = [
  sale("a0000000-0000-4000-8000-000000000001", { customer_id: "c1" }),
  sale("a0000000-0000-4000-8000-000000000002", { date: "2026-11-11T08:00:00Z" }),
  sale("a0000000-0000-4000-8000-000000000003", { date: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }),  // старая
  sale("a0000000-0000-4000-8000-000000000004", { status: "order" }),                                                   // не оформлена
  sale("a0000000-0000-4000-8000-000000000005", { source: "refund" }),                                                  // возврат
  sale("a0000000-0000-4000-8000-000000000006", { date: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }),  // старая, но взята в учёт
];
const state = {
  since,
  rows: [
    { sale_id: "a0000000-0000-4000-8000-000000000002", stage: "shipped", version: 2, shipped_at: "2026-11-11T10:00:00Z", tracking: "TRK-9", carrier: "BTS", packed_by: "Али", shipped_by: "Али", ship_comment: "внутреннее" },
    { sale_id: "a0000000-0000-4000-8000-000000000006", stage: "placed", version: 0 },
  ],
  log: [
    { id: 2, sale_id: "a0000000-0000-4000-8000-000000000002", action: "ship", from_stage: "packed", to_stage: "shipped", actor: "Али", at: "2026-11-11T10:00:00Z", carrier: "BTS", tracking: "TRK-9" },
    { id: 1, sale_id: "a0000000-0000-4000-8000-000000000002", action: "pack", from_stage: "placed", to_stage: "packed", actor: "Али", at: "2026-11-11T09:00:00Z" },
  ],
};
const заказы = core.собратьЗаказы(sales, state, [{ id: "c1", name: "Олтин", contact: "+998901234567" }]);
const ids = заказы.map(z => z.id.slice(-1));
ok("в учёте: новые и взятые вручную; без старых, неоформленных и возвратов", JSON.stringify([...ids].sort()) === JSON.stringify(["1", "2", "6"]));
ok("неизвестный этап → placed", заказы.find(z => z.id.endsWith("1")).stage === "placed");
const n = core.счётчики(заказы);
ok("счётчики", n.placed === 2 && n.packed === 0 && n.shipped === 1);
const z1 = заказы.find(z => z.id.endsWith("1"));
ok("итог по валютам и штукам (оплата не влияет)", z1.totals.som === 3000 && z1.totals.usd === 10 && z1.штук === 5 && z1.позиций === 2);
ok("имя клиента из склада", z1.клиент === "Олтин");
ok("поиск по номеру", core.отфильтровать(заказы, { q: "№ " + core.номерЗаказа(z1.id) }).length === 1);
ok("поиск по треку", core.отфильтровать(заказы, { q: "trk-9" }).map(z => z.id.slice(-1)).join() === "2");
ok("поиск по товару", core.отфильтровать(заказы, { q: "фурнитура" }, id => id === "p1" ? "Фурнитура Blum" : "").length === 3);
ok("фильтр этапа", core.отфильтровать(заказы, { stage: "shipped" }).length === 1);
ok("фильтр клиента", core.отфильтровать(заказы, { customer: "c1" }).length === 1);
ok("фильтр периода", core.отфильтровать(заказы, { from: "2026-11-11", to: "2026-11-11" }).map(z => z.id.slice(-1)).join() === "2");
const ист = core.история(заказы.find(z => z.id.endsWith("2")));
ok("история по порядку: оформлен → сборка → отправка", ист.map(e => e.kind).join() === "placed,pack,ship" && ист[2].text.includes("TRK-9") && ист[1].who === "Али");
ok("шкала", JSON.stringify(core.шкала("packed").map(p => p.state)) === JSON.stringify(["done", "current", "todo"]));
ok("номер как в PDF", core.номерЗаказа("a0000000-0000-4000-8000-0000001234ab") === "1234AB" && lib.номерЗаказа("a0000000-0000-4000-8000-0000001234ab") === "1234AB");

// ---------------- 2. серверное ядро ----------------
ok("клиент: только этап, время и доставка", (() => {
  const v = lib.дляКлиента(sales[1], state.rows[0], since);
  return v && v.stage === "shipped" && v.tracking === "TRK-9" && !("shipped_by" in v) && !("packed_by" in v) && !("ship_comment" in v) && !JSON.stringify(v).includes("внутреннее");
})());
ok("клиент: старая накладная вне учёта → нет шкалы", lib.дляКлиента(sales[2], null, since) === null);
ok("клиент: собран — без данных доставки", (() => {
  const v = lib.дляКлиента(sales[0], { stage: "packed", packed_at: "x", carrier: "BTS", tracking: "T" }, since);
  return v.stage === "packed" && v.carrier === null && v.tracking === null;
})());

const ошибки = {
  "ff:conflict:packed": [409, "conflict"], "ff:bad_step:placed": [409, "bad_step"], "ff:not_final": [400, "not_final"],
  "ff:not_tracked": [400, "not_tracked"], "ff:refund": [400, "refund"], "ff:reason_required": [400, "reason_required"],
  'relation "order_fulfillment" does not exist': [503, "not_migrated"], "что-то сломалось": [500, "db"],
};
for (const [msg, [st, code]] of Object.entries(ошибки)) {
  const e = lib.перевести(msg);
  ok(`ошибка «${msg}» → ${st} ${code}`, e.status === st && e.code === code && !e.message.includes(msg.slice(0, 12)));
}
ok("этап в conflict берётся только из известных", lib.перевести("ff:conflict:hack").stage === undefined);

// подменённая сеть: база PostgREST + Telegram
let вызовы = [];
let rpcОтвет = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  вызовы.push({ u, body: opts.body ? JSON.parse(opts.body) : null });
  if (u.includes("/rest/v1/rpc/fulfillment_transition")) return rpcОтвет();
  if (u.includes("/rest/v1/sales?")) return new Response(JSON.stringify([{ id: "a0000000-0000-4000-8000-000000000001", customer_id: "c0000000-0000-4000-8000-000000000001", date: "2026-11-10T08:00:00Z" }]));
  if (u.includes("/rest/v1/customers?")) return new Response(JSON.stringify([{ id: "c1", tg_chat_id: "777", tg_lang: "uz" }]));
  if (u.includes("api.telegram.org")) return new Response(JSON.stringify({ ok: true }));
  return new Response("[]");
};
const ok409 = () => new Response(JSON.stringify({ code: "P0001", message: "ff:conflict:packed" }), { status: 400 });
const okRow = (stage) => () => new Response(JSON.stringify({ sale_id: "a0000000-0000-4000-8000-000000000001", stage, version: 1, carrier: "BTS", tracking: "T-1" }));

function мокОтвет() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const админ = "Bearer " + signRoleJWT("test-secret", "admin", 3600);
const гость = "Bearer " + signRoleJWT("test-secret", "guest", 3600);
const тело = { sale_id: "a0000000-0000-4000-8000-000000000001", action: "pack", expected: "placed", actor: "Хусайн" };

// без входа / гость
let res = мокОтвет(); вызовы = [];
await handler({ method: "POST", headers: {}, body: тело, query: {} }, res);
ok("без входа — 401 и в базу не ходили", res.statusCode === 401 && вызовы.length === 0);
res = мокОтвет(); вызовы = [];
await handler({ method: "POST", headers: { authorization: гость }, body: тело, query: {} }, res);
ok("гость (просмотр) не меняет этап — 401", res.statusCode === 401 && вызовы.length === 0);

// конфликт — уведомления нет
rpcОтвет = ok409; res = мокОтвет(); вызовы = [];
await handler({ method: "POST", headers: { authorization: админ }, body: тело, query: {} }, res);
ok("конфликт → 409 с актуальным этапом", res.statusCode === 409 && res.body.stage === "packed");
ok("при конфликте Telegram не трогаем", !вызовы.some(c => c.u.includes("telegram")));

// успех — сначала запись, потом уведомление
rpcОтвет = okRow("packed"); res = мокОтвет(); вызовы = [];
await handler({ method: "POST", headers: { authorization: админ }, body: тело, query: {} }, res);
const iRpc = вызовы.findIndex(c => c.u.includes("rpc/fulfillment_transition"));
const iTg = вызовы.findIndex(c => c.u.includes("telegram"));
ok("успех → 200 и строка этапа", res.statusCode === 200 && res.body.row.stage === "packed" && res.body.notified === true);
ok("уведомление — после записи в базу", iRpc >= 0 && iTg > iRpc);
ok("уведомление на языке клиента", /yig‘ildi/.test(вызовы[iTg].body.text) && вызовы[iTg].body.chat_id === "777");
ok("в функцию ушли ожидаемый этап и ответственный", вызовы[iRpc].body.p_expected === "placed" && вызовы[iRpc].body.p_actor === "Хусайн" && вызовы[iRpc].body.p_action === "pack");

// исправление — клиенту не пишем
rpcОтвет = okRow("placed"); res = мокОтвет(); вызовы = [];
await handler({ method: "POST", headers: { authorization: админ }, body: { ...тело, action: "correct", expected: "packed", reason: "ошибся" }, query: {} }, res);
ok("исправление записано, клиенту без сообщения", res.statusCode === 200 && !вызовы.some(c => c.u.includes("telegram")));

// мусор во входе — до базы не доходит
for (const [имя, b] of [["чужой id", { ...тело, sale_id: "1;drop" }], ["неизвестное действие", { ...тело, action: "delete" }], ["неизвестный этап", { ...тело, expected: "lost" }]]) {
  res = мокОтвет(); вызовы = [];
  await handler({ method: "POST", headers: { authorization: админ }, body: b, query: {} }, res);
  ok(`${имя} → 400 без обращения к базе`, res.statusCode === 400 && вызовы.length === 0);
}

// ---------------- 4. доска: порядок и «срочно» ----------------
const к = (id, stage, extra = {}) => ({ id, stage, дата: extra.дата || "2026-11-10T08:00:00Z", row: extra.row || null, sort_key: extra.sort_key ?? null, срочно: !!extra.срочно, totals: extra.totals || { som: 0, usd: 0, yuan: 0 } });
const колонка = [
  к("a", "placed", { дата: "2026-11-10T09:00:00Z" }),
  к("b", "placed", { дата: "2026-11-10T07:00:00Z" }),
  к("c", "placed", { дата: "2026-11-10T08:00:00Z", sort_key: 2048 }),
  к("d", "placed", { дата: "2026-11-10T10:00:00Z", sort_key: 1024, срочно: true }),
];
ok("ручной порядок: сначала по ключу, новые без места — в конце по дате",
  core.упорядочить(колонка, "placed").map(z => z.id).join("") === "dcba".replace("cba", "cba") && core.упорядочить(колонка, "placed").map(z => z.id).join("") === "dcba");
const отпр = [к("x", "shipped", { sort_key: 1024, row: { shipped_at: "2026-11-10T01:00:00Z" } }), к("y", "shipped", { row: { shipped_at: "2026-11-10T05:00:00Z" } })];
ok("в «Отправленных» новые без места — сверху", core.упорядочить(отпр, "shipped").map(z => z.id).join("") === "yx");
ok("сортировка «сначала старые» не смотрит на ручной порядок", core.упорядочить(колонка, "placed", "old").map(z => z.id).join("") === "bcad");
ok("«срочные сверху»", core.упорядочить(колонка, "placed", "urgent")[0].id === "d");
ok("по сумме", core.упорядочить([к("p", "placed", { totals: { som: 0, usd: 5, yuan: 0 } }), к("q", "placed", { totals: { som: 0, usd: 50, yuan: 0 } })], "placed", "sum", (v) => v).map(z => z.id).join("") === "qp");
ok("вставка без повторов", core.вставитьВПорядок(["a", "b", "c", "d"], "a", 2).join("") === "bcad" && core.вставитьВПорядок(["a", "b"], "z", 9).join("") === "abz");
ok("переходы: вперёд по одному — да", core.переход("placed", "packed").kind === "pack" && core.переход("packed", "shipped").kind === "ship");
ok("переходы: перескок и назад — нет", core.переход("placed", "shipped").kind === null && core.переход("shipped", "packed").kind === null && core.переход("packed", "placed").kind === null);
ok("переход внутри колонки — перестановка", core.переход("packed", "packed").kind === "reorder");

// сервер: reorder / urgent
let пишем = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes("/rest/v1/order_board")) { пишем.push(JSON.parse(opts.body)); return new Response("", { status: 201 }); }
  return new Response("[]");
};
const ids3 = ["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002", "a0000000-0000-4000-8000-000000000003"];
res = мокОтвет(); пишем = [];
await handler({ method: "POST", headers: { authorization: админ }, body: { action: "reorder", ids: ids3, actor: "Хусайн" }, query: {} }, res);
ok("порядок записан ключами 1024, 2048, …", res.statusCode === 200 && пишем[0].map(r => r.sort_key).join() === "1024,2048,3072" && !("urgent" in пишем[0][0]));
res = мокОтвет(); пишем = [];
await handler({ method: "POST", headers: { authorization: админ }, body: { action: "reorder", ids: [ids3[0], ids3[0]] }, query: {} }, res);
ok("повтор в порядке — 400, без записи", res.statusCode === 400 && !пишем.length);
res = мокОтвет(); пишем = [];
await handler({ method: "POST", headers: { authorization: админ }, body: { action: "reorder", ids: ["x;drop"] }, query: {} }, res);
ok("чужой id в порядке — 400", res.statusCode === 400 && !пишем.length);
res = мокОтвет(); пишем = [];
await handler({ method: "POST", headers: { authorization: гость }, body: { action: "reorder", ids: ids3 }, query: {} }, res);
ok("гость порядок не меняет", res.statusCode === 401 && !пишем.length);
res = мокОтвет(); пишем = [];
await handler({ method: "POST", headers: { authorization: админ }, body: { action: "urgent", sale_id: ids3[1], urgent: true }, query: {} }, res);
ok("«срочно» записано без ключа порядка", res.statusCode === 200 && пишем[0][0].urgent === true && !("sort_key" in пишем[0][0]));
res = мокОтвет(); пишем = [];
await handler({ method: "POST", headers: { authorization: админ }, body: { action: "urgent", sale_id: ids3[1], urgent: "да" }, query: {} }, res);
ok("«срочно» не булево — 400", res.statusCode === 400 && !пишем.length);
globalThis.fetch = async () => new Response(JSON.stringify({ code: "42P01", message: 'relation "order_board" does not exist' }), { status: 404 });
res = мокОтвет();
await handler({ method: "POST", headers: { authorization: админ }, body: { action: "reorder", ids: ids3 }, query: {} }, res);
ok("без таблицы доски — 503 с подсказкой", res.statusCode === 503 && res.body.code === "board_not_migrated");

console.log(плохо ? `\n${плохо} провал(ов)` : "\nВсе проверки прошли");
process.exit(плохо ? 1 : 0);
