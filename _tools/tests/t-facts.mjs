// ========================================================================
//  СВЕДЕНИЯ О ТОВАРЕ.   node _tools/tests/t-facts.mjs
//
//  Экран «Сведения о товарах» сохраняет набор сведений одного товара.
//  Проверяем правила (api/lib/facts.js) и саму ручку (api/admin/facts.js):
//   • «проверено» без источника — нельзя, с понятной фразой;
//   • неизвестный вид отбрасывается, пустая строка = удалить;
//   • сведения, которых экран не знает, при сохранении не удаляются;
//   • гость читает, но не меняет; без входа — ничего.
// ========================================================================
import crypto from "crypto";
process.env.SITE_JWT_SECRET = process.env.SITE_JWT_SECRET || "test-secret-facts-0123456789abcdef";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "service-test";

const корень = new URL("../../", import.meta.url);
const Ф = await import(new URL("api/lib/facts.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ---------------------------------------------------------------- правила
{
  const р = Ф.проверитьСведения([
    { key: "название", value: "  Поворотное колесо  ", source: "карточка", confidence: "подтверждено" },
    { key: "свойство", value: "Ø 50 мм", source: "карточка" },
    { key: "свойство", value: "Тормоз", source: "" },
    { key: "свойство", value: "   " },
    { key: "выдумка", value: "что-то", source: "x" },
    { key: "описание", value: "Колесо", source: "к", confidence: "что-то странное" },
  ]);
  ok("правильный набор принимается", р.ok);
  ok("пробелы по краям убираются", р.строки.find((с) => с.key === "название").value === "Поворотное колесо");
  ok("свойства нумеруются по порядку", р.строки.filter((с) => с.key === "свойство").map((с) => с.sort).join() === "1,2");
  ok("пустая строка не сохраняется", р.строки.filter((с) => с.key === "свойство").length === 2);
  ok("неизвестный вид отброшен", !р.строки.some((с) => с.key === "выдумка"));
  ok("странный уровень проверки → «требует проверки»", р.строки.find((с) => с.key === "описание").confidence === "требует проверки");

  const без = Ф.проверитьСведения([{ key: "описание", value: "Колесо", source: "", confidence: "подтверждено" }]);
  ok("«проверено» без источника — понятная ошибка", !без.ok && /источник/.test(без.ошибки[0]));
  ok("два описания нельзя", !Ф.проверитьСведения([{ key: "описание", value: "а" }, { key: "описание", value: "б" }]).ok);
  ok("свойств не больше 8", !Ф.проверитьСведения(Array.from({ length: 9 }, (_, i) => ({ key: "свойство", value: "с" + i }))).ok);
  ok("длинный текст обрезается по пределу вида", Ф.проверитьСведения([{ key: "название", value: "я".repeat(500) }]).строки[0].value.length === 120);

  const св = Ф.сводкаСведений([
    { product_id: "p1", key: "название", value: "Колесо", source: "к", confidence: "подтверждено" },
    { product_id: "p1", key: "описание", value: "о", source: "", confidence: "требует проверки" },
    { product_id: "p1", key: "чужое_поле", value: "x", source: "x", confidence: "подтверждено" },
  ]);
  ok("сводка: всего, проверено, без источника, есть описание",
    св[0].всего === 2 && св[0].проверено === 1 && св[0].безИсточника === 1 && св[0].описание && св[0].название === "Колесо");
}

// --------------------------------------------------- ручка на поддельной базе
const ТОВАР = "11111111-2222-3333-4444-555555555555";
let база = [];
const запросы = [];
globalThis.fetch = async (адрес, о = {}) => {
  const u = new URL(String(адрес));
  const таблица = u.pathname.replace("/rest/v1/", "");
  const метод = (о.method || "GET").toUpperCase();
  запросы.push(`${метод} ${таблица}`);
  const ответ = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  const фильтр = (r) => [...u.searchParams.entries()].every(([к, в]) => !["select", "order", "limit"].includes(к) ? String(r[к]) === в.replace(/^eq\./, "") : true);
  if (таблица === "products") return ответ(u.searchParams.get("id") === "eq." + ТОВАР ? [{ id: ТОВАР }] : []);
  if (таблица === "crm_audit") return ответ([]);
  if (метод === "GET") return ответ(база.filter(фильтр));
  if (метод === "POST") {
    for (const с of JSON.parse(о.body)) {
      const i = база.findIndex((r) => r.product_id === с.product_id && r.key === с.key && r.sort === с.sort);
      if (i >= 0) база[i] = { ...база[i], ...с }; else база.push(с);
    }
    return new Response("", { status: 201 });
  }
  if (метод === "DELETE") { база = база.filter((r) => !фильтр(r)); return new Response(null, { status: 204 }); }
  return ответ([]);
};

const { секретПодписи } = await import(new URL("api/lib/jwtsecret.js", корень));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const токен = (role) => {
  const h = b64({ alg: "HS256" }), p = b64({ role, exp: Math.floor(Date.now() / 1000) + 600 });
  return `${h}.${p}.${crypto.createHmac("sha256", секретПодписи()).update(h + "." + p).digest().toString("base64url")}`;
};
const ручка = (await import(new URL("api/admin/facts.js", корень))).default;
const вызвать = async (method, { роль = "admin", query = {}, body } = {}) => {
  const res = { код: 0, тело: null, setHeader() {}, status(c) { this.код = c; return this; }, json(d) { this.тело = d; return this; } };
  await ручка({ method, query, body, headers: роль ? { authorization: "Bearer " + токен(роль) } : {} }, res);
  return res;
};

{
  база = [
    { product_id: ТОВАР, key: "описание", sort: 0, value: "старое", source: "к", confidence: "требует проверки" },
    { product_id: ТОВАР, key: "свойство", sort: 1, value: "лишнее", source: "к", confidence: "требует проверки" },
    { product_id: ТОВАР, key: "количество", sort: 0, value: "50", source: "карточка владельца", confidence: "подтверждено" },
    { product_id: ТОВАР, key: "поле_картинки", sort: 0, value: "не трогать", source: "x", confidence: "подтверждено" },
  ];
  const р = await вызвать("POST", { body: { product: ТОВАР, факты: [
    { key: "название", value: "Поворотное колесо", source: "карточка", confidence: "подтверждено" },
    { key: "описание", value: "новое", source: "к" },
    { key: "количество", value: "50", source: "карточка владельца", confidence: "подтверждено" },
  ] } });
  ok("админ сохраняет", р.код === 200 && р.тело.сохранено === 3);
  ok("описание обновилось", база.find((r) => r.key === "описание").value === "новое");
  ok("убранное свойство удалено", !база.some((r) => r.key === "свойство"));
  ok("неизвестное экрану поле карточки не тронуто", база.some((r) => r.key === "поле_картинки"));
  const н = база.find((r) => r.key === "название");
  ok("«проверено» впервые — записано, кто и когда", н.confirmed_by === "владелец (склад)" && !!н.confirmed_at);

  const гость = await вызвать("POST", { роль: "guest", body: { product: ТОВАР, факты: [] } });
  ok("гость не меняет", гость.код === 401);
  ok("гость читает", (await вызвать("GET", { роль: "guest", query: { product: ТОВАР } })).код === 200);
  ok("без входа — ничего", (await вызвать("GET", { роль: null })).код === 401);
  ok("кривой номер товара отбрасывается", (await вызвать("POST", { body: { product: "1 or 1=1", факты: [] } })).код === 400);
  ok("несуществующий товар — 404", (await вызвать("POST", { body: { product: "99999999-2222-3333-4444-555555555555", факты: [] } })).код === 404);
  const плохие = await вызвать("POST", { body: { product: ТОВАР, факты: [{ key: "описание", value: "x", confidence: "подтверждено" }] } });
  ok("«проверено» без источника — 400 с понятной фразой", плохие.код === 400 && /источник/.test(плохие.тело.error));
  const св = await вызвать("GET");
  ok("сводка по товарам отдаётся", св.код === 200 && св.тело.сводка?.[0]?.product_id === ТОВАР);
}

console.log(плохо ? `\n❌ Провалено проверок: ${плохо}` : "\n✅ Всё сошлось");
process.exit(плохо ? 1 : 0);
