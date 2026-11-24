// ========================================================================
//  «СНОВА В НАЛИЧИИ».   node _tools/tests/t-stock-wait.mjs
//
//  Клиент жмёт «Сообщить о поступлении» → бот записывает ожидание →
//  товар появился → бот пишет ОДИН раз. Проверяем:
//   1. разбор ссылки t.me/<бот>?start=wait_<КОД> — только честный код;
//   2. подписка: товар уже есть / нет / повтор / таблицы нет;
//   3. рассылка: только товарам в наличии, один раз, второй проход молчит;
//      не дошло (бот остановлен) — второй раз не навязываемся;
//   4. «Не ждать» снимает только своё ожидание;
//   5. сам бот: /start wait_PR-012 и кнопка «Не ждать».
// ========================================================================
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "service-test";
process.env.CLIENT_BOT_TOKEN = "TEST_CLIENT";
process.env.ADMIN_CHAT_ID = "837138321";
process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret";

const корень = new URL("../../", import.meta.url);
const С = await import(new URL("api/lib/stockwait.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ---------------------------------------------------------- поддельная база
const ТОВАРЫ = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", code: "PR-012", name: "Гилдирак <опт>", stock_qty: 0 },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", code: "LP-054", name: "Лапка MT-18", stock_qty: 25 },
];
let ждут = [];
let нетТаблицы = false;
let nid = 0;
const телеграм = [];
const подходит = (r, u) => [...u.searchParams.entries()].every(([к, в]) => {
  if (["select", "order", "limit"].includes(к)) return true;
  if (в === "is.null") return r[к] == null;
  return String(r[к]) === в.replace(/^eq\./, "");
});
globalThis.fetch = async (адрес, о = {}) => {
  const u = new URL(String(адрес));
  const ответ = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  if (u.hostname === "api.telegram.org") {
    const метод = u.pathname.split("/").pop();
    телеграм.push({ метод, тело: о.body ? JSON.parse(о.body) : {} });
    return ответ({ ok: true, result: { message_id: 1 } });
  }
  const таблица = u.pathname.replace("/rest/v1/", "");
  const метод = (о.method || "GET").toUpperCase();
  if (таблица === "products") return ответ(ТОВАРЫ.filter((r) => подходит(r, u)));
  if (таблица === "stock_wait") {
    if (нетТаблицы) return ответ({ message: 'relation "stock_wait" does not exist', code: "42P01" }, 404);
    if (метод === "GET") {
      return ответ(ждут.filter((r) => подходит(r, u)).map((r) => ({ ...r, products: ТОВАРЫ.find((т) => т.id === r.product_id) })));
    }
    if (метод === "POST") {
      const [с] = JSON.parse(о.body);
      if (ждут.some((r) => r.product_id === с.product_id && r.chat_id === с.chat_id && !r.notified_at && !r.canceled_at))
        return ответ({ code: "23505", message: "duplicate key value violates unique constraint \"stock_wait_active\"" }, 409);
      const r = { id: `bbbbbbbb-0000-4000-8000-${String(++nid).padStart(12, "0")}`, notified_at: null, canceled_at: null, ...с };
      ждут.push(r);
      return ответ([r], 201);
    }
    if (метод === "PATCH") {
      const н = ждут.filter((r) => подходит(r, u));
      н.forEach((r) => Object.assign(r, JSON.parse(о.body)));
      return ответ(н);
    }
  }
  return ответ([]);
};

// ------------------------------------------------------------------ разбор
ok("ссылка с кодом разбирается", С.разобратьПараметр("wait_PR-012") === "PR-012");
ok("регистр кода не важен", С.разобратьПараметр("wait_pr-012") === "PR-012");
for (const плохой of ["wait_", "wait_PR012", "wait_PR-012;drop", "verify_abc", "wait_ПР-012"]) {
  ok(`«${плохой}» не принимается`, С.разобратьПараметр(плохой) === null);
}
ok("параметр собирается", С.параметрОжидания("PR-012") === "wait_PR-012");

// ---------------------------------------------------------------- подписка
{
  const есть = await С.ждать({ chatId: 111, код: "LP-054" });
  ok("товар уже в наличии — не подписываем, а говорим", есть.ок && есть.вНаличии && ждут.length === 0);
  const р = await С.ждать({ chatId: 111, код: "PR-012", source: "site", lang: "uz" });
  ok("товара нет — ожидание записано", р.ок && !р.вНаличии && ждут.length === 1 && ждут[0].lang === "uz" && ждут[0].source === "site");
  ok("номер ожидания возвращается (для кнопки «Не ждать»)", р.id === ждут[0].id);
  const повтор = await С.ждать({ chatId: 111, код: "PR-012" });
  ok("повторное нажатие не плодит ожиданий", повтор.ок && повтор.уже && ждут.length === 1);
  ok("неизвестный товар", (await С.ждать({ chatId: 111, код: "ZZ-999" })).нетТовара === true);
  ok("кривой код отбрасывается", !(await С.ждать({ chatId: 111, код: "1 or 1=1" })).ок);
  нетТаблицы = true;
  ok("таблицы нет — честно «недоступно»", (await С.ждать({ chatId: 222, код: "PR-012" })).нетТаблицы === true);
  нетТаблицы = false;
}

// ----------------------------------------------------------------- рассылка
{
  телеграм.length = 0;
  const послано = [];
  const отправить = async (чат, текст, кнопки) => { послано.push({ чат, текст, кнопки }); return true; };
  let р = await С.разослать({ отправить });
  ok("товара нет — никому не пишем", р.отправлено === 0 && послано.length === 0);

  ТОВАРЫ[0].stock_qty = 960;
  р = await С.разослать({ отправить });
  ok("товар появился — ждущему написали", р.отправлено === 1 && послано[0].чат === 111);
  ok("текст на языке клиента, имя экранировано", /Yana sotuvda/.test(послано[0].текст) && /&lt;опт&gt;/.test(послано[0].текст));
  ok("кнопка ведёт на страницу товара", послано[0].кнопки[0][0].url === "https://generalmodern.uz/p/pr-012");
  ok("ожидание закрыто", !!ждут[0].notified_at);
  р = await С.разослать({ отправить });
  ok("второй проход второй раз не пишет", р.отправлено === 0 && послано.length === 1);

  await С.ждать({ chatId: 333, код: "PR-012" });          // уже в наличии → не записали
  ТОВАРЫ[0].stock_qty = 0;
  await С.ждать({ chatId: 333, код: "PR-012" });
  ТОВАРЫ[0].stock_qty = 5;
  const неДошло = await С.разослать({ отправить: async () => false });
  ok("не дошло (бот остановлен) — посчитано", неДошло.неДошло === 1);
  ok("и второй раз не навязываемся", (await С.разослать({ отправить })).отправлено === 0);

  // Лимит за проход.
  ТОВАРЫ[0].stock_qty = 0;
  for (let i = 0; i < 30; i++) await С.ждать({ chatId: 1000 + i, код: "PR-012" });
  ТОВАРЫ[0].stock_qty = 3;
  ok("за проход — не больше лимита", (await С.разослать({ отправить: async () => true, лимит: 25 })).отправлено === 25);
  ok("остальные — следующим проходом", (await С.разослать({ отправить: async () => true })).отправлено === 5);
}

// ------------------------------------------------------------- «Не ждать»
{
  ТОВАРЫ[0].stock_qty = 0;
  const р = await С.ждать({ chatId: 444, код: "PR-012" });
  ok("чужое ожидание снять нельзя", (await С.неЖдать(р.id, 555)) === false);
  ok("своё — можно", (await С.неЖдать(р.id, 444)) === true);
  ok("повторно — уже закрыто", (await С.неЖдать(р.id, 444)) === false);
  ok("кривой номер отбрасывается", (await С.неЖдать("1;drop", 444)) === false);
}

// ---------------------------------------------------------------- сам бот
{
  const бот = (await import(new URL("api/bot.js", корень))).default;
  const ответ = () => { const r = { код: 0, status(c) { r.код = c; return r; }, send() { return r; }, json() { return r; }, setHeader() {} }; return r; };
  const заголовки = { "x-telegram-bot-api-secret-token": "hook-secret" };
  const сообщение = (кто, text) => ({ method: "POST", headers: заголовки, body: { update_id: Math.floor(Math.random() * 1e9), message: {
    message_id: 1, text, chat: { id: кто, type: "private" }, from: { id: кто, first_name: "Тест", language_code: "ru" },
  } } });

  телеграм.length = 0;
  ТОВАРЫ[0].stock_qty = 0;
  await бот(сообщение(777, "/start wait_PR-012"), ответ());
  const подписан = ждут.find((r) => r.chat_id === 777 && !r.notified_at && !r.canceled_at);
  ok("бот: ссылка со страницы товара подписывает", !!подписан);
  const подтверждение = телеграм.find((x) => x.метод === "sendMessage" && /как только/i.test(x.тело.text || ""));
  ok("бот: отвечает, что напишет, и даёт кнопку «Не ждать»",
    !!подтверждение && подтверждение.тело.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `wt:no:${подписан?.id}`);

  телеграм.length = 0;
  await бот({ method: "POST", headers: заголовки, body: { update_id: 987654, callback_query: {
    id: "cq", data: `wt:no:${подписан?.id}`, from: { id: 777 }, message: { message_id: 5, chat: { id: 777 } },
  } } }, ответ());
  ok("бот: «Не ждать» снимает ожидание", !!подписан?.canceled_at);
  ok("бот: и подтверждает", телеграм.some((x) => /больше не жду/.test(x.тело?.text || "")));

  телеграм.length = 0;
  ТОВАРЫ[1].stock_qty = 25;
  await бот(сообщение(778, "/start wait_LP-054"), ответ());
  ok("бот: товар уже есть — так и говорит, с кнопкой «Заказать»",
    телеграм.some((x) => /уже есть в наличии/.test(x.тело?.text || "") && x.тело.reply_markup?.inline_keyboard?.[0]?.[0]?.url));
}

// ------------------------------------------------------- страница товара
{
  const R = await import(new URL("api/seo/render.js", корень)).catch(() => null);
  if (R?.страницаТовара) {
    const т = { code: "PR-012", name: "Гилдирак", status: "out_stock", photos: [], mentions: [], cat: { slug: "x", ru: "Приборы", uz: "Asboblar", en: "Tools" }, ov: {}, price: null };
    let html = "";
    try { html = R.страницаТовара(т, "ru", null); } catch (e) { html = "ОШИБКА " + e.message; }
    ok("страница товара без остатка: кнопка «Сообщить о поступлении» в бота",
      /https:\/\/t\.me\/generalmodernbot\?start=wait_PR-012/.test(html) && /Сообщить о поступлении/.test(html));
    const есть = (() => { try { return R.страницаТовара({ ...т, status: "in_stock" }, "ru", null); } catch (e) { return "ОШИБКА " + e.message; } })();
    ok("товар в наличии: обычная кнопка заказа", !/start=wait_/.test(есть));
  }
}

console.log(плохо ? `\n❌ Провалено проверок: ${плохо}` : "\n✅ Всё сошлось");
process.exit(плохо ? 1 : 0);
