// ========================================================================
//  ЯДРО ИИ-АГЕНТОВ.   node _tools/tests/t-agents-core.mjs
//
//  1. Время (api/lib/agents/time.js): расчёт следующего запуска для всех
//     видов расписаний по Ташкенту, тихие часы, ключи суток и недели.
//  2. Права (api/lib/agents/права.js): по умолчанию только чтение,
//     остатки не меняет никто, субагент права не расширяет.
//  3. Чистый текст (api/lib/agents/чисто.js): ни один токен не попадает
//     в отчёт. Это условие выхода — без него агенты не выкладываются.
//  4. Ядро (api/lib/agents/core.js) с подменённым fetch: захват задачи
//     достаётся одному, прогон пишется в журнал, неудачи идут с
//     выдержкой 5 / 15 / 60 минут, просроченная аренда подбирается.
//  5. Ручка /api/admin/agents: без входа и с гостевым пропуском менять
//     ничего нельзя.
// ========================================================================
process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_KEY = "service-key-очень-секретный-1234567890";
process.env.SITE_JWT_SECRET = "test-secret";
process.env.CLIENT_BOT_TOKEN = "1234567890:AAH-тестовый-токен-бота-ЗДЕСЬ-длинный";
process.env.TELEGRAM_BOT_TOKEN = "9876543210:BBH-тестовый-админский-бот-длинный";
process.env.ADMIN_CHAT_ID = "837138321";
process.env.DB_MODE = "supabase";

const корень = new URL("../../", import.meta.url);

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ======================================================================
//  1. ВРЕМЯ
// ======================================================================
const T = await import(new URL("api/lib/agents/time.js", корень));

// Ташкент = UTC+5. 22 ноября 2026, 03:00 UTC = 08:00 в Ташкенте.
const ноя22_03utc = Date.parse("2026-11-22T03:00:00Z");

{
  const next = T.следующийЗапуск({ вид: "daily", время: "08:30" }, ноя22_03utc);
  ok("ежедневно 08:30 → сегодня 03:30 UTC", new Date(next).toISOString() === "2026-11-22T03:30:00.000Z");
}
{
  // 08:00 уже прошло (сейчас ровно 08:00) — значит завтра.
  const next = T.следующийЗапуск({ вид: "daily", время: "08:00" }, ноя22_03utc);
  ok("ежедневно: время «прямо сейчас» уходит на завтра", new Date(next).toISOString() === "2026-11-23T03:00:00.000Z");
}
{
  const next = T.следующийЗапуск({ вид: "daily", время: ["09:00", "18:00"] }, ноя22_03utc);
  ok("два времени в сутки: берётся ближайшее", new Date(next).toISOString() === "2026-11-22T04:00:00.000Z");
}
{
  // 22 ноября 2026 — воскресенье. Ближайший понедельник — 23-е.
  ok("день недели считается по Ташкенту (вс = 7)", T.деньНедели(ноя22_03utc) === 7);
  const next = T.следующийЗапуск({ вид: "weekly", день: 1, время: "11:00" }, ноя22_03utc);
  ok("еженедельно пн 11:00 → 23 ноября 06:00 UTC", new Date(next).toISOString() === "2026-11-23T06:00:00.000Z");
}
{
  const next = T.следующийЗапуск({ вид: "monthly", число: 1, время: "09:00" }, ноя22_03utc);
  ok("ежемесячно 1-го 09:00 → 1 декабря 04:00 UTC", new Date(next).toISOString() === "2026-12-01T04:00:00.000Z");
}
{
  const next = T.следующийЗапуск({ вид: "interval", минут: 360 }, ноя22_03utc);
  ok("промежуток 6 часов", next === ноя22_03utc + 6 * 3600e3);
}
ok("мусорное расписание не превращается в выдуманное время", T.следующийЗапуск({ вид: "каждый вторник" }) === null);
ok("время без цифр отвергается", T.разборВремени("девять ноль ноль") === null && T.разборВремени("25:00") === null);
ok("время 09:00 разбирается в 540 минут", T.разборВремени("09:00") === 540);

// Следующий запуск всегда СТРОГО после «от»: иначе агент зациклится,
// получая после прогона то же самое время.
{
  let т = ноя22_03utc, зациклился = false;
  for (let i = 0; i < 40; i++) {
    const n = T.следующийЗапуск({ вид: "daily", время: ["09:00", "18:00"] }, т);
    if (n <= т) { зациклился = true; break; }
    т = n;
  }
  ok("расписание не зацикливается на одном и том же времени", !зациклился);
}

{
  // Тихие часы с 22:00 до 08:00 — промежуток через полночь.
  const тихо = { тихо: { с: "22:00", до: "08:00" } };
  const ночь = Date.parse("2026-11-21T18:30:00Z");   // 23:30 Ташкент
  const утро = Date.parse("2026-11-22T05:00:00Z");   // 10:00 Ташкент
  ok("тихий час ночью", T.тихийЧас(тихо, ночь) === true);
  ok("утром не тихий час", T.тихийЧас(тихо, утро) === false);
  ok("без настройки тихих часов — всегда можно писать", T.тихийЧас({}, ночь) === false);
}

ok("ключ суток по Ташкенту", T.суткиКлюч(Date.parse("2026-11-21T19:30:00Z")) === "2026-11-22");
ok("ключ месяца по Ташкенту", T.месяцКлюч(ноя22_03utc) === "2026-11");
ok("ключ недели", /^2026-W\d\d$/.test(T.неделяКлюч(ноя22_03utc)));

// ======================================================================
//  2. ПРАВА
// ======================================================================
const П = await import(new URL("api/lib/agents/права.js", корень));
{
  const склад = П.пропуск("warehouse");
  const заказы = П.пропуск("orders");

  ok("склад читает товары", склад.можноЧитать("products?select=*") === true);
  let поймали = false;
  try { склад.проверитьЗапись("products"); } catch (e) { поймали = e instanceof П.ОтказДоступа; }
  ok("НИ ОДИН агент не меняет остатки товаров", поймали);

  поймали = false;
  try { заказы.проверитьЗапись("order_fulfillment"); } catch (e) { поймали = true; }
  ok("агент заказов не меняет этапы заказов", поймали);

  поймали = false;
  try { заказы.проверитьЗапись("sales"); } catch (e) { поймали = true; }
  ok("агент заказов не пишет в продажи", поймали);

  поймали = false;
  try { склад.проверитьЗапись("agent_approvals"); } catch (e) { поймали = true; }
  ok("служебные таблицы ведёт только ядро", поймали);

  ok("складу разрешены свои пороги закупки", склад.проверитьЗапись("product_policy") === "product_policy");

  // Субагент сужает права родителя и не может их расширить.
  const узкий = склад.сузить(["products", "product_policy"]);
  ok("субагент не получает прав больше родителя", узкий.пишет.join() === "product_policy");
  const пустой = заказы.сузить(["product_policy"]);
  ok("субагент агента без прав записи тоже без прав", пустой.пишет.length === 0);

  поймали = false;
  try { П.пропуск("самозванец"); } catch (e) { поймали = true; }
  ok("незарегистрированный агент не получает пропуск", поймали);
}

// ======================================================================
//  3. ЧИСТЫЙ ТЕКСТ — условие выхода этапа
// ======================================================================
const Ч = await import(new URL("api/lib/agents/чисто.js", корень));
{
  const сервисный = process.env.SUPABASE_SERVICE_KEY;
  const ботовый = process.env.CLIENT_BOT_TOKEN;

  const т1 = Ч.безопасныйТекст("Ошибка: apikey " + сервисный + " отвергнут");
  ok("сервисный ключ не попадает в отчёт", !т1.includes(сервисный) && т1.includes("[скрыто]"));

  const т2 = Ч.безопасныйТекст("getWebhookInfo вернул url https://x/bot" + ботовый);
  ok("токен бота не попадает в отчёт", !т2.includes(ботовый));

  const т3 = Ч.безопасныйТекст('{"password":"ОченьСложный123","user":"admin"}');
  ok("пароль из поля вычищается", !т3.includes("ОченьСложный123") && т3.includes("admin"));

  const т4 = Ч.безопасныйТекст("Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.signature-часть-токена");
  ok("JWT не попадает в отчёт", !т4.includes("eyJyb2xlIjoiYWRtaW4ifQ"));

  const т5 = Ч.безопасныйТекст("ключ sk-abcdefghijklmnopqrstuvwxyz012345 истёк");
  ok("ключ OpenAI не попадает в отчёт", !т5.includes("sk-abcdefghijklmnopqrstuvwxyz012345"));

  const т6 = Ч.безопасныйТекст("postgres://admin:ОченьСложный@127.0.0.1:5432/sklad");
  ok("строка подключения с паролем не попадает в отчёт", !т6.includes("ОченьСложный"));

  const о = Ч.безопасныйОбъект({ имя: "склад", token: ботовый, вложено: { secret: сервисный, товаров: 949 } });
  ok("объект чистится вглубь", о.token === "[скрыто]" && о.вложено.secret === "[скрыто]" && о.вложено.товаров === 949);

  ok("обычный текст не калечится", Ч.безопасныйТекст("Кончился товар AP-052, осталось 0 шт") === "Кончился товар AP-052, осталось 0 шт");
}

// ======================================================================
//  4. ЯДРО с подменённым fetch
//
//  Поддельная база говорит на том же языке, что PostgREST: фильтры
//  eq / is / lt / lte / in, Prefer: return=representation, нарушение
//  уникального индекса отдаётся как 409 duplicate key.
// ======================================================================
const база = { agent_state: [], agent_runs: [], agent_subruns: [], agent_notices: [], agent_approvals: [], agent_budget: [], crm_audit: [] };
let телеграмОтправлено = 0;

function подходит(строка, фильтры) {
  for (const [поле, выражение] of фильтры) {
    const [оп, ...хвост] = String(выражение).split(".");
    const значение = хвост.join(".");
    const v = строка[поле];
    if (оп === "eq" && String(v) !== значение) return false;
    if (оп === "is") {
      const ждём = значение === "true" ? true : значение === "false" ? false : null;
      if (v !== ждём) return false;
    }
    if (оп === "lt" && !(new Date(v ?? 0) < new Date(значение))) return false;
    if (оп === "lte" && !(new Date(v ?? 0) <= new Date(значение))) return false;
    if (оп === "gte" && !(new Date(v ?? 0) >= new Date(значение))) return false;
    if (оп === "in") {
      const набор = значение.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      if (!набор.includes(String(v))) return false;
    }
  }
  return true;
}

globalThis.fetch = async (адрес, настройки = {}) => {
  const u = new URL(String(адрес));
  if (u.hostname === "api.telegram.org") { телеграмОтправлено++; return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "{}" }; }

  const таблица = u.pathname.replace("/rest/v1/", "");
  if (!база[таблица]) база[таблица] = [];
  const фильтры = [...u.searchParams.entries()].filter(([k]) => !["select", "order", "limit", "offset"].includes(k));
  const метод = (настройки.method || "GET").toUpperCase();
  const тело = настройки.body ? JSON.parse(настройки.body) : null;
  const ответ = (данные, статус = 200) => ({
    ok: статус < 400, status: статус,
    json: async () => данные,
    text: async () => (typeof данные === "string" ? данные : JSON.stringify(данные)),
  });

  if (метод === "GET") {
    let строки = база[таблица].filter((r) => подходит(r, фильтры));
    const порядок = u.searchParams.get("order");
    if (порядок) {
      const [поле, напр] = порядок.split(".");
      строки = [...строки].sort((a, b) => (String(a[поле] ?? "") < String(b[поле] ?? "") ? -1 : 1) * (напр === "desc" ? -1 : 1));
    }
    const лимит = Number(u.searchParams.get("limit"));
    return ответ(лимит ? строки.slice(0, лимит) : строки);
  }

  if (метод === "POST") {
    const строки = [].concat(тело);
    const ключи = { agent_budget: ["agent_id", "period", "bucket"] };
    const пк = ключи[таблица] || ["id"];
    const записанные = [];
    for (const с of строки) {
      // Уникальные индексы: dedup_key у уведомлений, idem_key у согласований.
      for (const поле of ["dedup_key", "idem_key"]) {
        if (с[поле] && база[таблица].some((r) => r[поле] === с[поле]))
          return ответ("duplicate key value violates unique constraint", 409);
      }
      const есть = база[таблица].find((r) => пк.every((k) => String(r[k]) === String(с[k])));
      if (есть) Object.assign(есть, с); else база[таблица].push({ ...с });
      записанные.push(есть || база[таблица][база[таблица].length - 1]);
    }
    return ответ(записанные);
  }

  if (метод === "PATCH") {
    const найдены = база[таблица].filter((r) => подходит(r, фильтры));
    найдены.forEach((r) => Object.assign(r, тело));
    return ответ(найдены);
  }
  if (метод === "DELETE") { база[таблица] = база[таблица].filter((r) => !подходит(r, фильтры)); return ответ([]); }
  return ответ([], 405);
};

const C = await import(new URL("api/lib/agents/core.js", корень));

// Строки состояния заводятся сами при первом обращении.
{
  const строки = await C.строкиСостояния();
  ok("состояние заводится для всех шести агентов", строки.length === C.ОПИСАНИЯ.length);
  ok("у нового агента сразу есть срок запуска", строки.every((с) => !!с.next_run_at));
  ok("аренда у нового агента свободна", строки.every((с) => new Date(с.running_until) < new Date()));
}

// Ручной прогон неподключённого агента: ядро работает, результат честный.
// Все пять агентов уже подключены. Чтобы проверить честный путь «работа
// не подключена», на время теста убираем дизайн из списка реализаций.
{
  const сохранено = C._реализации.design;
  delete C._реализации.design;
  const r = await C.запустить("design", { trigger: "manual" });
  C._реализации.design = сохранено;
  ok("ручной прогон берётся", r.взято === true);
  ok("неподключённый агент честно отмечается пропущенным", r.статус === "skipped");
  const прогон = база.agent_runs.find((п) => п.id === r.runId);
  ok("прогон записан в журнал", !!прогон && прогон.status === "skipped" && !!прогон.finished_at);
  ok("результат не выдуман", /этапе 6/.test(прогон.summary));
  const состояние = база.agent_state.find((с) => с.id === "design");
  ok("аренда отпущена после прогона", new Date(состояние.running_until) < new Date());
  ok("после успеха счётчик неудач обнулён", состояние.fails === 0);
}

// Захват: вторая попытка, пока первая держит аренду, ничего не получает.
{
  const занятый = база.agent_state.find((с) => с.id === "security");
  занятый.running_until = new Date(Date.now() + 5 * 60e3).toISOString();
  const r = await C.запустить("security", { trigger: "manual" });
  ok("занятую задачу второй раз не берут", r.взято === false);
  занятый.running_until = "1970-01-01T00:00:00Z";
}

// Просроченная аренда подбирается заново: процесс мог умереть.
{
  const с = база.agent_state.find((x) => x.id === "security");
  с.running_until = new Date(Date.now() - 60e3).toISOString();
  const r = await C.запустить("security", { trigger: "manual" });
  ok("просроченная аренда подбирается", r.взято === true);
}

// Неудача: выдержки 5 / 15 / 60 минут, на третьей — тревога владельцу.
{
  C.подключить("design", async () => { throw new Error("база не ответила, ключ " + process.env.SUPABASE_SERVICE_KEY); });
  const было = телеграмОтправлено;

  const r1 = await C.запустить("design", { trigger: "manual" });
  const с1 = база.agent_state.find((x) => x.id === "design");
  const пауза1 = (Date.parse(с1.next_run_at) - Date.now()) / 60e3;
  ok("первая неудача → повтор через 5 минут", r1.статус === "error" && пауза1 > 4 && пауза1 <= 5.1);
  ok("в журнал ошибки не утёк сервисный ключ", !JSON.stringify(база.agent_runs).includes(process.env.SUPABASE_SERVICE_KEY));

  await C.запустить("design", { trigger: "manual" });
  const пауза2 = (Date.parse(база.agent_state.find((x) => x.id === "design").next_run_at) - Date.now()) / 60e3;
  ok("вторая неудача → повтор через 15 минут", пауза2 > 14 && пауза2 <= 15.1);

  await C.запустить("design", { trigger: "manual" });
  const с3 = база.agent_state.find((x) => x.id === "design");
  ok("третья неудача → счётчик 3", с3.fails === 3);
  ok("после третьей неудачи владелец получает уведомление", база.agent_notices.some((у) => у.kind === "agent_fail" && у.level === "danger"));
  ok("тревога ушла в Telegram", телеграмОтправлено > было);

  // Четвёртая неудача не плодит второе такое же уведомление в те же сутки.
  const уведомлений = база.agent_notices.length;
  await C.запустить("design", { trigger: "manual" });
  ok("повторная неудача не плодит одинаковые уведомления", база.agent_notices.length === уведомлений);
}

// Подключённый агент: контекст, субагенты, уведомления, согласования.
{
  C.подключить("orders", async (ctx) => {
    const товары = await ctx.читать("products?select=id,name");
    const шаги = await ctx.субагенты([
      { имя: "Проверка просрочек", задача: async () => ({ сводка: "просрочено 2" }) },
      { имя: "Проверка нехватки", задача: async () => ({ сводка: "нехватка 1" }) },
    ], 2);
    await ctx.уведомить({ kind: "shortage", level: "warn", title: "Не хватает товара под заказ", body: "AP-052", dedup_key: "shortage:AP-052:2026-W47" });
    await ctx.согласовать({ kind: "purchase", title: "Дозаказать AP-052", payload: { код: "AP-052", кол: 5 }, idem_key: "purchase:AP-052:2026-W47" });
    return { сводка: `проверено товаров: ${товары.length}, шагов: ${шаги.length}`, детали: { шаги } };
  });
  база.products = [{ id: "p1", name: "Раскройная машина" }];

  const r = await C.запустить("orders", { trigger: "manual" });
  ok("подключённый агент отрабатывает", r.статус === "ok");
  ok("агент читает склад через контекст", /проверено товаров: 1/.test(r.сводка));
  ok("субагенты записаны отдельными строками", база.agent_subruns.filter((ш) => ш.run_id === r.runId).length === 2);
  ok("субагенты завершены успешно", база.agent_subruns.every((ш) => ш.status === "ok"));
  ok("уведомление записано", база.agent_notices.some((у) => у.kind === "shortage"));
  ok("предложение ждёт решения, а не выполнено", база.agent_approvals.some((с) => с.kind === "purchase" && с.status === "pending"));

  // Повтор того же прогона не создаёт вторых копий: ключи защищают.
  const уведомлений = база.agent_notices.length, согласований = база.agent_approvals.length;
  await C.запустить("orders", { trigger: "manual" });
  ok("повтор не плодит второе уведомление", база.agent_notices.length === уведомлений);
  ok("повтор не плодит вторую закупку", база.agent_approvals.length === согласований);
}

// Агент не может записать туда, куда ему не разрешено.
{
  C.подключить("telegram", async (ctx) => { await ctx.писать("products", [{ id: "p1", stock_qty: 0 }]); return { сводка: "не должно случиться" }; });
  const r = await C.запустить("telegram", { trigger: "manual" });
  ok("попытка записи без прав валит прогон, а не меняет склад", r.статус === "error" && /не разрешено менять/.test(r.ошибка));
  ok("остаток товара не изменился", база.products[0].stock_qty === undefined);
}

// Решение владельца применяется один раз.
{
  const предложение = база.agent_approvals.find((с) => с.status === "pending");
  const первое = await C.решить(предложение.id, "approved", { кто: "admin" });
  const второе = await C.решить(предложение.id, "rejected", { кто: "admin" });
  ok("решение применяется", первое && первое.status === "approved");
  ok("двойное нажатие ничего не меняет", второе === null);
  ok("решение попало в журнал действий", база.crm_audit.some((з) => з.action === "agent_approval_approved"));
}

// Потолок расходов существует раньше первой траты.
{
  const config = { потолок: { задача: 1, день: 2, месяц: 10 } };
  let поймали = false;
  try { await C.проверитьПотолок("images", 5, config); } catch (e) { поймали = e instanceof C.ПревышенПотолок; }
  ok("дорогая задача останавливается потолком задачи", поймали);

  await C.записатьРасход("images", 1.5);
  поймали = false;
  try { await C.проверитьПотолок("images", 0.9, config); } catch (e) { поймали = e instanceof C.ПревышенПотолок; }
  ok("дневной потолок считается по уже потраченному", поймали);
  ok("в пределах потолка работа разрешена", (await C.проверитьПотолок("images", 0.4, config)) === true);
}

// Тик по расписанию: берётся только тот, кому пришёл срок.
{
  for (const с of база.agent_state) { с.enabled = false; с.running_until = "1970-01-01T00:00:00Z"; }
  const цель = база.agent_state.find((с) => с.id === "warehouse");
  цель.enabled = true;
  цель.next_run_at = new Date(Date.now() - 1000).toISOString();
  const r = await C.тик();
  ok("тик запускает того, кому пришёл срок", r.запущено.some((з) => з.id === "warehouse"));
  // Склад подключён по-настоящему (api/lib/agents/warehouse.js) —
  // значит прогон не «пропущен», а выполнен на тех данных, что есть.
  ok("подключённый склад прогоняется, а не пропускается",
    r.запущено.find((з) => з.id === "warehouse")?.статус === "ok");
  const после = база.agent_state.find((с) => с.id === "warehouse");
  ok("после прогона срок сдвинулся вперёд", Date.parse(после.next_run_at) > Date.now());

  const r2 = await C.тик();
  ok("второй тик подряд никого не запускает", r2.запущено.length === 0);
}

// ======================================================================
//  5. РУЧКА /api/admin/agents
// ======================================================================
{
  const { signRoleJWT } = await import(new URL("api/lib/tg.js", корень));
  const handler = (await import(new URL("api/admin/agents.js", корень))).default;
  const админ = "Bearer " + signRoleJWT("test-secret", "admin", 3600);
  const гость = "Bearer " + signRoleJWT("test-secret", "guest", 3600);

  const ответ = () => {
    const r = { код: 0, тело: null, setHeader() {}, status(c) { r.код = c; return r; }, json(b) { r.тело = b; return r; } };
    return r;
  };
  const вызов = async (req) => { const r = ответ(); await handler({ query: {}, headers: {}, ...req }, r); return r; };

  let r = await вызов({ method: "GET" });
  ok("без входа состояние не отдаётся", r.код === 401);

  r = await вызов({ method: "GET", headers: { authorization: гость } });
  ok("гость видит состояние агентов", r.код === 200 && Array.isArray(r.тело.агенты));

  r = await вызов({ method: "POST", headers: { authorization: гость }, body: { action: "run", id: "warehouse" } });
  ok("гость не может запустить агента", r.код === 401);

  r = await вызов({ method: "POST", headers: {}, body: { action: "approve", id: "00000000-0000-4000-8000-000000000001" } });
  ok("без входа решение не принимается", r.код === 401);

  r = await вызов({ method: "POST", headers: { authorization: админ }, body: { action: "запусти-ка", id: "warehouse" } });
  ok("непонятное действие отклоняется", r.код === 400);

  r = await вызов({ method: "POST", headers: { authorization: админ }, body: { action: "schedule", id: "warehouse", schedule: { вид: "каждый вторник" } } });
  ok("невыполнимое расписание не сохраняется", r.код === 500 || r.код === 400);

  r = await вызов({ method: "POST", headers: { authorization: админ }, body: { action: "schedule", id: "warehouse", schedule: { вид: "daily", время: "07:15" } } });
  ok("админ меняет расписание", r.код === 200 && база.agent_state.find((с) => с.id === "warehouse").schedule.время === "07:15");

  r = await вызов({ method: "DELETE", headers: { authorization: админ } });
  ok("чужой метод отклоняется", r.код === 405);
}

// Опции ручного запуска («Собрать посты заново») доходят до работы агента.
// В самом конце файла: подключить() подменяет работу до конца процесса.
{
  const состояние = база.agent_state.find((с) => с.id === "design");
  if (состояние) { состояние.running_until = new Date(0).toISOString(); состояние.enabled = true; }
  let увидел = null;
  C.подключить("design", (ctx) => { увидел = ctx.опции; return { сводка: "проверка опций" }; });
  const r = await C.запустить("design", { trigger: "manual", опции: { заново: true } });
  ok("опции ручного запуска доходят до агента", r.взято === true && увидел?.заново === true);
  const r2 = await C.запустить("design", { trigger: "manual" });
  ok("без опций — пустые опции, а не ошибка", r2.взято === true && увидел && Object.keys(увидел).length === 0);
  ok("у каждого агента есть понятная кнопка и объяснение «Как работает»",
    C.ОПИСАНИЯ.every((о) => о.действие && Array.isArray(о.как) && о.как.length >= 2));
}
console.log(плохо ? `\n❌ Провалено проверок: ${плохо}` : "\n✅ Всё сошлось");
process.exit(плохо ? 1 : 0);
