// ========================================================================
//  ПОСТЫ В КАНАЛ: ОПИСАНИЕ, ВИДЕО РЯДОМ С ФОТО, ОБНОВЛЕНИЕ ЧЕРНОВИКОВ.
//      node _tools/tests/t-agents-posts.mjs
//
//  Владелец 24.11: «в описании должно быть больше информации» и «видео
//  товара рядом с фото». Проверяем:
//   1. В пост идут только факты С ИСТОЧНИКОМ — догадка о запчасти хуже
//      пустого места.
//   2. Товар с видео уходит одним альбомом: фото + сам ролик файлом
//      (ролики в закрытом хранилище, ссылка не открылась бы).
//   3. Черновик, который ещё ждёт решения, пересобирается, когда в
//      карточке появились факты, и владелец получает свежую карточку.
// ========================================================================
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";

// Кэш видео — во временной папке, и ролик кладём туда заранее:
// так проверяется отправка файла без похода в хранилище.
const кэш = mkdtempSync(join(tmpdir(), "gm-posts-"));
process.env.CACHE_DIR = кэш;
process.env.CLIENT_BOT_TOKEN = "TEST_CLIENT";
process.env.ADMIN_CHAT_ID = "837138321";
const ПУТЬ_ВИДЕО = "1785668412759_IMG_2415.mp4";
mkdirSync(join(кэш, "video"), { recursive: true });
writeFileSync(join(кэш, "video", createHash("sha1").update(ПУТЬ_ВИДЕО).digest("hex") + ".vid"), Buffer.alloc(2048, 7));

const корень = new URL("../../", import.meta.url);
const Т = await import(new URL("api/lib/agents/texts.js", корень));
const А = await import(new URL("api/lib/agents/telegram.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// Поддельный Telegram: запоминаем метод и поля (и для JSON, и для файлов).
const телеграм = [];
globalThis.fetch = async (url, opts = {}) => {
  // Хранилище в тесте «пустое»: всё, что не Telegram, — не найдено.
  if (!String(url).startsWith("https://api.telegram.org/")) return new Response("not found", { status: 404 });
  const метод = String(url).split("/").pop().split("?")[0];
  let поля = {};
  if (opts.body instanceof FormData) {
    for (const [к, з] of opts.body.entries()) поля[к] = typeof з === "string" ? з : { файл: true, тип: з.type, размер: з.size };
  } else if (opts.body) поля = JSON.parse(opts.body);
  телеграм.push({ метод, поля, файлом: opts.body instanceof FormData });
  const result = метод === "getChatAdministrators" ? [] : метод === "getMe" ? { id: 1, username: "testbot" } : { message_id: 1 };
  return new Response(JSON.stringify({ ok: true, result }));
};

// ---------------------------------------------------------------- 1. факты
{
  const факты = [
    { key: "описание", value: "Лапка для притачивания молнии на прямострочной машине.", source: "juki.co.jp", confidence: "требует проверки", sort: 0 },
    { key: "свойство", value: "Узкая подошва", source: "фото товара", confidence: "требует проверки", sort: 1 },
    { key: "свойство", value: "Выдуманное свойство", source: "", confidence: "требует проверки", sort: 2 },
    { key: "совместимость", value: "JUKI DDL-8700, DDL-9000", source: "juki.co.jp", confidence: "подтверждено", sort: 0 },
    { key: "предупреждение", value: "Не найдено", source: "поиск", confidence: "не найдено", sort: 0 },
  ];
  const ф = Т.фактыДляПоста(факты);
  ok("факт без источника в пост не идёт", !ф.свойства.includes("Выдуманное свойство") && ф.свойства.length === 1);
  ok("«не найдено» в пост не идёт", ф.предупреждение === "");
  ok("источники собраны без повторов", ф.источники.length === 2);

  const п = Т.постТовара({ name: "Лапка молнии", code: "LP-1", category: "Лапки", stock_qty: 5, photo_url: "u" },
    { ссылка: "https://generalmodern.uz/p/lp-1", факты, видео: true });
  ok("описание в посте", п.текст.includes("притачивания молнии"));
  ok("свойства списком", п.текст.includes("• Узкая подошва"));
  ok("совместимость отдельной строкой", п.текст.includes("Подходит: JUKI DDL-8700"));
  ok("про видео сказано, ссылки на файл нет", п.текст.includes("Видео") && !/\.mp4/.test(п.текст));
  ok("ссылка «Заказать» в самом тексте (у альбома нет кнопок)", п.текст.includes("Заказать: https://generalmodern.uz/p/lp-1"));
  ok("описание и совместимость не пропущены", !п.пропуски.includes("описание") && !п.пропуски.includes("совместимость"));

  const понятное = Т.постТовара({ name: "Гилдирак", code: "PR-012", category: "Приборы для машин", stock_qty: 5, photo_url: "u" },
    { факты: [{ key: "название", value: "Поворотное колесо с тормозом", source: "карточка товара" }] });
  ok("заголовок — понятное название из карточки", понятное.текст.startsWith("<b>Поворотное колесо с тормозом</b>"));
  ok("складское название — строкой ниже", понятное.текст.split("\n")[1] === "Гилдирак · Приборы для машин");
  const безИсточника = Т.постТовара({ name: "Гилдирак", code: "X", stock_qty: 5, photo_url: "u" },
    { факты: [{ key: "название", value: "Выдуманное", source: "" }] });
  ok("название без источника не подменяет складское", безИсточника.текст.startsWith("<b>Гилдирак</b>"));

  const пусто = Т.постТовара({ name: "Гилдирак", code: "X-1", category: "Разное", stock_qty: 5, photo_url: "u" });
  ok("без фактов — честный пропуск, а не выдумка", пусто.пропуски.includes("описание") && пусто.пропуски.includes("совместимость"));
  ok("в видеорубрике три товара в неделю", Т.РУБРИКИ.find((р) => р.откуда === "видео").сколько === 3);
}

// ---------------------------------------------------- 2. альбом фото+видео
{
  телеграм.length = 0;
  const р = await А.послатьПост("TEST_CLIENT", {
    chat_id: "837138321", текст: "<b>Лапка</b>\nОписание", фото: "https://example.com/photo.jpg",
    видео: { path: ПУТЬ_ВИДЕО },
  });
  const а = телеграм.find((x) => x.метод === "sendMediaGroup");
  ok("товар с видео уходит альбомом", р.ok && !!а);
  const media = а ? JSON.parse(а.поля.media) : [];
  ok("в альбоме фото и видео рядом", media[0]?.type === "photo" && media[1]?.type === "video");
  ok("подпись — под фото, с разметкой", media[0]?.caption === "<b>Лапка</b>\nОписание" && media[0]?.parse_mode === "HTML");
  ok("ролик загружен файлом, а не ссылкой", а?.поля.video?.файл === true && media[1]?.media === "attach://video");
  ok("одно сообщение, без лишних", телеграм.filter((x) => /^send/.test(x.метод)).length === 1);

  телеграм.length = 0;
  const длинный = "Очень длинный текст. ".repeat(80);
  await А.послатьПост("TEST_CLIENT", { chat_id: "1", текст: длинный, фото: "https://example.com/p.jpg", видео: { path: ПУТЬ_ВИДЕО } });
  ok("длинный пост: альбом без подписи, текст следом",
    телеграм[0]?.метод === "sendMediaGroup" && !JSON.parse(телеграм[0].поля.media)[0].caption && телеграм[1]?.метод === "sendMessage");

  телеграм.length = 0;
  await А.послатьПост("TEST_CLIENT", { chat_id: "1", текст: "t", фото: "https://example.com/p.jpg", видео: { path: "нет-такого.mp4" } });
  ok("ролика нет на диске и в хранилище — пост уходит фото, а не теряется",
    телеграм.some((x) => x.метод === "sendPhoto"));
}

// ------------------------------------------- 3. обновление ждущих черновиков
{
  телеграм.length = 0;
  const ID = "11111111-2222-3333-4444-555555555555";
  const товар = { id: ID, code: "LP-214", name: "Петля лапка", category: "Лапки", stock_qty: 3, photo_url: "https://example.com/p.jpg", last_arrival_at: "2025-01-01" };
  const ждёт = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Подборка", created_at: new Date().toISOString(),
    payload: { рубрика: "Подборка под машину", тест: true, товары: [{ id: ID, код: "LP-214", name: "Петля лапка", фото: товар.photo_url, текст: "<b>старый текст</b>" }] },
  };
  const обновления = [];
  const ctx = {
    config: { канал: "@generalmodern_test" },
    читать: async (путь) => {
      if (путь.startsWith("products")) return [товар];
      if (путь.startsWith("product_fact")) return [{ product_id: ID, key: "описание", value: "Лапка для обмётки петель.", source: "сайт производителя", confidence: "требует проверки" }];
      if (путь.startsWith("agent_approvals") && путь.includes("status=eq.pending")) return [ждёт];
      if (путь.startsWith("agent_approvals")) return [ждёт];
      return [];
    },
    уведомить: async (у) => у,
    согласовать: async () => null,
    обновитьСогласование: async (id, payload) => { обновления.push({ id, payload }); return { id, payload }; },
  };
  const р = await А.прогон(ctx);
  ok("ждущий черновик пересобран с фактами",
    обновления.length === 1 && обновления[0].payload.товары[0].текст.includes("обмётки петель"));
  ok("товары в черновике те же — подменять нельзя", обновления[0]?.payload.товары.map((т) => т.id).join() === ID);
  ok("владельцу пришла свежая карточка с пометкой «обновлён»",
    телеграм.some((x) => x.метод === "sendMessage" && /Черновик обновлён/.test(x.поля.text || "")));
  ok("в сводке прогона сказано, сколько обновлено", /Обновлено ждущих черновиков: 1/.test(р.сводка));

  телеграм.length = 0; обновления.length = 0;
  ждёт.payload = обновления.length ? ждёт.payload : { ...ждёт.payload, товары: [{ ...ждёт.payload.товары[0], текст: (await (async () => {
    const t = Т.постТовара(товар, { ссылка: "https://generalmodern.uz/p/lp-214", факты: [{ key: "описание", value: "Лапка для обмётки петель.", source: "сайт производителя" }] });
    return t.текст;
  })()) }] };
  await А.прогон(ctx);
  ok("если ничего не поменялось — черновик не трогается и карточка не шлётся",
    обновления.length === 0 && !телеграм.some((x) => /Черновик обновлён/.test(x.поля.text || "")));
}

console.log(плохо ? `\n❌ Провалено проверок: ${плохо}` : "\n✅ Всё сошлось");
process.exit(плохо ? 1 : 0);
