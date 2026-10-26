// ========================================================================
//  ДОСИНХРОНИЗАЦИЯ БАЗЫ ПЕРЕД ПЕРЕЕЗДОМ.
//
//  Зачем. Данные в новую базу скопированы заранее, но склад продолжал
//  работать в старой: появились новые накладные, оплаты, изменились
//  остатки. Этот скрипт догоняет новую базу до старой — слово в слово:
//    • новые и изменённые строки перезаписывает (upsert по ключу);
//    • строки, которых в старой базе уже нет, удаляет из новой;
//    • в конце сверяет количество строк в обеих базах.
//  Запускать можно сколько угодно раз: результат один и тот же.
//
//  Откуда берёт доступы — из .env приложения:
//    SUPABASE_URL + SUPABASE_SERVICE_KEY          — откуда читать (старая);
//    SUPABASE_URL_NEW + SUPABASE_SERVICE_KEY_NEW  — куда писать (новая).
//  Ключи в коде НЕ хранятся.
//
//  Запуск:  node _tools/sync-to-frankfurt.mjs            — синхронизировать
//           node _tools/sync-to-frankfurt.mjs --проверить — только сверить
// ========================================================================
import fs from "node:fs";

const ФАЙЛ_ENV = process.env.ENVFILE || "/var/www/skladanvarov/.env";
const СТРАНИЦА = 1000;   // сколько строк читаем за раз
const ПАЧКА = 200;       // сколько строк пишем за раз

// Порядок важен: сначала то, на что ссылаются (клиенты, товары).
const ТАБЛИЦЫ = [
  ["settings", "id"],
  ["customers", "id"],
  ["products", "id"],
  ["purchases", "id"],
  ["sales", "id"],
  ["payments", "id"],
  ["videos", "id"],
  ["site_accounts", "id"],
  ["site_verifications", "token"],
  ["blocked_phones", "phone"],
  ["bot_sessions", "chat_id"],
  ["stock_log", "id"],
  ["trash", "id"],
];

// ---------- доступы ----------
function окружение() {
  const текст = fs.existsSync(ФАЙЛ_ENV) ? fs.readFileSync(ФАЙЛ_ENV, "utf8") : "";
  const из = (ключ) => {
    const найдено = текст.match(new RegExp("^" + ключ + "=(.*)$", "m"));
    const знач = (process.env[ключ] || (найдено ? найдено[1] : "") || "").trim();
    return знач.replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  };
  const о = {
    староеURL: из("SUPABASE_URL"),
    старыйКлюч: из("SUPABASE_SERVICE_KEY"),
    новоеURL: из("SUPABASE_URL_NEW"),
    новыйКлюч: из("SUPABASE_SERVICE_KEY_NEW"),
  };
  const нет = Object.entries(о).filter(([, v]) => !v).map(([k]) => k);
  if (нет.length) {
    console.error("Не хватает доступов: " + нет.join(", ") + " (файл " + ФАЙЛ_ENV + ")");
    process.exit(2);
  }
  if (о.староеURL === о.новоеURL) {
    console.error("Старая и новая база — один адрес. Переезд не нужен.");
    process.exit(2);
  }
  return о;
}

const о = окружение();
const ref = (адрес) => (адрес.match(/https:\/\/([^.]+)\./) || [])[1] || адрес;

function шапка(ключ, ещё) {
  return Object.assign({
    apikey: ключ,
    Authorization: "Bearer " + ключ,
    "Content-Type": "application/json",
  }, ещё || {});
}

async function запрос(база, ключ, путь, настройки) {
  const ответ = await fetch(база + "/rest/v1" + путь, Object.assign({}, настройки, {
    headers: шапка(ключ, (настройки || {}).headers),
  }));
  if (!ответ.ok) {
    const текст = await ответ.text().catch(() => "");
    throw new Error(ответ.status + " " + путь.slice(0, 60) + " :: " + текст.slice(0, 300));
  }
  const тело = await ответ.text();
  return тело ? JSON.parse(тело) : null;
}

// Читаем таблицу целиком, страницами.
async function прочитать(база, ключ, таблица, ключПоля, только) {
  const всё = [];
  for (let сдвиг = 0; ; сдвиг += СТРАНИЦА) {
    const поля = только || "*";
    const часть = await запрос(база, ключ, "/" + таблица + "?select=" + поля
      + "&order=" + ключПоля + ".asc&limit=" + СТРАНИЦА + "&offset=" + сдвиг);
    всё.push(...(часть || []));
    if (!часть || часть.length < СТРАНИЦА) break;
  }
  return всё;
}

async function счёт(база, ключ, таблица) {
  const ответ = await fetch(база + "/rest/v1/" + таблица + "?select=" + ключТаблицы(таблица) + "&limit=1", {
    headers: шапка(ключ, { Prefer: "count=exact", Range: "0-0" }),
  });
  const диапазон = ответ.headers.get("content-range") || "";
  return Number(диапазон.split("/")[1] || "0") || 0;
}

const ключТаблицы = (таблица) => (ТАБЛИЦЫ.find(([т]) => т === таблица) || [, "id"])[1];

// ---------- перенос одной таблицы ----------
async function перенести(таблица, пк) {
  const строки = await прочитать(о.староеURL, о.старыйКлюч, таблица, пк);
  let записано = 0;
  for (let i = 0; i < строки.length; i += ПАЧКА) {
    const пачка = строки.slice(i, i + ПАЧКА);
    await запрос(о.новоеURL, о.новыйКлюч, "/" + таблица + "?on_conflict=" + пк, {
      method: "POST",
      body: JSON.stringify(пачка),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
    записано += пачка.length;
  }

  // Удаляем в новой то, что в старой уже удалили.
  const были = new Set(строки.map(с => String(с[пк])));
  const вНовой = await прочитать(о.новоеURL, о.новыйКлюч, таблица, пк, пк);
  const лишние = вНовой.map(с => String(с[пк])).filter(id => !были.has(id));
  for (let i = 0; i < лишние.length; i += 100) {
    const часть = лишние.slice(i, i + 100).map(знач => JSON.stringify(String(знач)));
    await запрос(о.новоеURL, о.новыйКлюч, "/" + таблица + "?" + пк + "=in.(" + часть.join(",") + ")", {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }

  return { записано, удалено: лишние.length };
}

// ---------- сверка ----------
async function сверить() {
  let всёСходится = true;
  console.log("\nтаблица              старая   новая");
  for (const [т] of ТАБЛИЦЫ) {
    const [старых, новых] = await Promise.all([
      счёт(о.староеURL, о.старыйКлюч, т),
      счёт(о.новоеURL, о.новыйКлюч, т),
    ]);
    const ок = старых === новых;
    if (!ок) всёСходится = false;
    console.log(т.padEnd(20) + String(старых).padStart(6) + String(новых).padStart(8)
      + (ок ? "   ок" : "   РАСХОЖДЕНИЕ"));
  }
  return всёСходится;
}

// ---------- запуск ----------
const толькоПроверить = process.argv.includes("--проверить") || process.argv.includes("--check");
console.log("старая база: " + ref(о.староеURL) + "   новая база: " + ref(о.новоеURL));

if (!толькоПроверить) {
  for (const [т, пк] of ТАБЛИЦЫ) {
    const начало = Date.now();
    try {
      const итог = await перенести(т, пк);
      console.log(т.padEnd(20) + "перенесено " + String(итог.записано).padStart(5)
        + ", удалено лишних " + итог.удалено + "   (" + (Date.now() - начало) + " мс)");
    } catch (ошибка) {
      console.error(т.padEnd(20) + "ОШИБКА: " + (ошибка.message || ошибка));
      process.exit(1);
    }
  }
}

const сошлось = await сверить();
console.log(сошлось ? "\nБазы совпадают — можно переключать." : "\nЕСТЬ РАСХОЖДЕНИЯ — переключать нельзя.");
process.exit(сошлось ? 0 : 1);
