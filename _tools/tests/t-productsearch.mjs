// ========================================================================
//  ПОИСК ТОВАРА И РАЗДАЧА КОДОВ.  node _tools/tests/t-productsearch.mjs
//
//  Клиент пишет код из печатного каталога как придётся — «lp17», «LP 017».
//  Владелец набирает это в любом поиске склада и сразу видит товар.
// ========================================================================
import { readFileSync } from "node:fs";

const корень = new URL("../../", import.meta.url);
const { подходит } = await import(new URL("js/productsearch.js", корень));
const { подписьКода } = await import(new URL("js/catalogcode.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ---------- поиск ----------
{
  const p = { name: "Лапка бека (6-4)", category: "Лапки", sku: "KDP-10", code: "LP-017" };
  ok("пустой запрос — подходит всё", подходит(p, "") && подходит(p, "   "));
  ok("по названию без учёта регистра", подходит(p, "ЛАПКА БЕКА"));
  ok("по категории", подходит(p, "лапк"));
  ok("по артикулу", подходит(p, "kdp-10"));
  ok("по коду как есть", подходит(p, "LP-017"));
  ok("по коду как пишут клиенты: lp17, LP 017, lp-0017",
     ["lp17", "LP 017", "lp-0017", "Lp_17"].every(q => подходит(p, q)));
  ok("часть кода тоже ищется: «LP-0»", подходит(p, "LP-0"));
  ok("чужой код не подходит: LP-18, NJ-017", !подходит(p, "lp18") && !подходит(p, "NJ-017"));
  ok("LP-1 не находит LP-017 по номеру", !подходит(p, "lp 1"));
  ok("товар без кода не падает", подходит({ name: "Кайчи" }, "кай") && !подходит({ name: "Кайчи" }, "lp17"));
  ok("пустой товар не падает", подходит(null, "x") === false);
}

// ---------- подпись под названием ----------
{
  ok("код и артикул", подписьКода({ code: "LP-017", sku: "KDP-10" }) === "LP-017 · Арт.: KDP-10");
  ok("только код", подписьКода({ code: "LP-017" }) === "LP-017");
  ok("только артикул — как раньше", подписьКода({ sku: "KDP-10" }) === "Арт.: KDP-10");
  ok("ничего — пусто", подписьКода({}) === "" && подписьКода(null) === "");
}

// ---------- все места поиска берут общую функцию ----------
{
  const МЕСТА = ["js/catalog.js", "js/order/screens/catalog.js", "js/pages/products.js", "js/site/catalog.js",
    "js/sklad/screens/arrival.js", "js/sklad/screens/sale.js", "js/sklad/screens/labels.js", "js/sklad/screens/products.js"];
  for (const f of МЕСТА) ok("общий поиск: " + f, readFileSync(new URL(f, корень), "utf8").includes("productsearch.js"));
  ok("сканер находит товар по коду", readFileSync(new URL("js/sklad/qr.js", корень), "utf8").includes("компактныйКод"));
}

// ---------- ручка раздачи кодов ----------
{
  process.env.SUPABASE_URL = "http://база";
  process.env.SUPABASE_SERVICE_KEY = "тест";
  process.env.SITE_JWT_SECRET = "тест-секрет";

  // Подставная база: товары и журнал записей.
  let товары = [
    { id: "a", name: "Лапка 2", category: "Лапки", code: null, created_at: "2026-06-02T00:00:00Z" },
    { id: "b", name: "Лапка 1", category: "Лапки", code: null, created_at: "2026-06-01T00:00:00Z" },
    { id: "c", name: "Нож", category: "Ножы", code: "NJ-004", created_at: "2026-05-01T00:00:00Z" },
    { id: "d", name: "Лента", category: "Ленты", code: null, created_at: "2026-06-03T00:00:00Z" },
  ];
  let колонкаЕсть = true;
  const записи = [];
  globalThis.fetch = async (url, opt = {}) => {
    const u = new URL(url);
    const ответ = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (!opt.method || opt.method === "GET") {
      if (!колонкаЕсть) return ответ(400, { code: "42703", message: "column products.code does not exist" });
      const off = Number(u.searchParams.get("offset") || 0);
      return ответ(200, off ? [] : товары.map(p => ({ ...p })));
    }
    if (opt.method === "PATCH") {
      const id = decodeURIComponent(u.searchParams.get("id")).replace("eq.", "");
      const тело = JSON.parse(opt.body);
      записи.push({ id, ...тело, фильтр: u.searchParams.get("code") });
      const p = товары.find(x => x.id === id);
      if (!p || p.code) return ответ(200, []);
      p.code = тело.code;
      return ответ(200, [p]);
    }
    return ответ(500, {});
  };

  // Настоящий токен владельца — тот же формат, что выдаёт вход.
  const { createHmac } = await import("node:crypto");
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const голова = b64({ alg: "HS256", typ: "JWT" });
  const токен = (role) => {
    const тело = b64({ role, exp: Math.floor(Date.now() / 1000) + 600 });
    return голова + "." + тело + "." + createHmac("sha256", "тест-секрет").update(голова + "." + тело).digest("base64url");
  };

  const { default: handler } = await import(new URL("api/admin/catalog-codes.js", корень));
  const вызвать = async (method, role, body) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ method, headers: role ? { authorization: "Bearer " + токен(role) } : {}, body }, res);
    return res;
  };

  ok("без входа — 401", (await вызвать("GET")).code === 401);
  ok("гостю — нельзя даже смотреть", (await вызвать("GET", "guest")).code === 401);

  const просмотр = await вызвать("GET", "admin");
  ok("просмотр ничего не пишет", просмотр.code === 200 && записи.length === 0);
  const коды = Object.fromEntries((просмотр.body.выдать || []).map(x => [x.id, x.code]));
  ok("старшему товару меньший номер: b → LP-001, a → LP-002", коды.b === "LP-001" && коды.a === "LP-002");
  ok("у кого код есть — не трогаем", !("c" in коды) && просмотр.body.сКодом === 1 && просмотр.body.всего === 4);
  ok("новый раздел получает буквы и показан отдельно: " + JSON.stringify(просмотр.body.новыеРазделы),
     /^[A-Z]{2}-001$/.test(коды.d || "") && Object.keys(просмотр.body.новыеРазделы).join() === "Ленты");

  ok("запись без подтверждённого числа — отказ", (await вызвать("POST", "admin", {})).code === 409 && записи.length === 0);
  ok("число не совпало (список изменился) — отказ", (await вызвать("POST", "admin", { ожидается: 2 })).code === 409 && записи.length === 0);
  ok("гость записать не может", (await вызвать("POST", "guest", { ожидается: 3 })).code === 401 && записи.length === 0);

  // Пока владелец смотрел список, товару «a» дали код в карточке.
  товары.find(p => p.id === "a").code = "LP-009";
  const устарел = await вызвать("POST", "admin", { ожидается: 3 });
  ok("товар получил код, пока смотрели, — число другое, отказ", устарел.code === 409 && записи.length === 0);

  const запись = await вызвать("POST", "admin", { ожидается: 2 });
  ok("запись прошла: " + JSON.stringify(запись.body), запись.code === 200 && запись.body.записано === 2 && запись.body.ошибки.length === 0);
  ok("пишется только поле code и только тем, у кого его нет",
     записи.every(z => Object.keys(z).sort().join() === "code,id,фильтр" && z.фильтр === "is.null"));
  ok("номер продолжает выданный в карточке: b → LP-010", товары.find(p => p.id === "b").code === "LP-010");
  ok("повторный просмотр — выдавать нечего", (await вызвать("GET", "admin")).body.выдать.length === 0);

  колонкаЕсть = false;
  const доМиграции = await вызвать("GET", "admin");
  ok("до миграции — понятное сообщение", доМиграции.code === 409 && доМиграции.body.колонка === false);
}

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nПОИСК И РАЗДАЧА КОДОВ В ПОРЯДКЕ");
process.exit(плохо ? 1 : 0);
