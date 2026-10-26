// ========================================================================
//  ПЕРЕНОС ФАЙЛОВ ХРАНИЛИЩА ПРИ ПЕРЕЕЗДЕ БАЗЫ.
//
//  Таблицы и файлы в Supabase живут отдельно: перенос базы файлы НЕ
//  переносит. В базе остаются только пути (products.photo_url,
//  videos.path), а сами фото и видео лежат в хранилище того проекта, где
//  их загрузили. Поэтому после переезда картинки какое-то время ещё
//  открываются — из кэша сервера — и ломаются, когда кэш истекает.
//
//  Скрипт копирует файлы из хранилища старой базы в новую:
//    • перебирает корзины product-photos и product-videos вместе с
//      вложенными папками;
//    • пропускает то, что уже лежит в новой базе с тем же размером, —
//      поэтому его можно запускать повторно, догоняя остаток;
//    • переносит по несколько файлов сразу, с показом хода работы.
//
//  Доступы берёт из двух файлов .env и в коде не хранит:
//    новая база  — /var/www/skladanvarov/.env
//    старая база — /root/env-before-frankfurt.bak (можно задать аргументом)
//
//  Запуск:  node _tools/copy-storage.mjs
//           node _tools/copy-storage.mjs --проверить        — только сверить
//           node _tools/copy-storage.mjs --откуда=/путь/.bak
// ========================================================================
import fs from "node:fs";

const КОРЗИНЫ = ["product-photos", "product-videos"];
const ОДНОВРЕМЕННО = 4;      // столько файлов тянем параллельно
const ЗА_РАЗ = 1000;         // размер страницы при перечислении

const дов = (имя, поумолчанию) => {
  const найдено = process.argv.find(a => a.startsWith("--" + имя + "="));
  return найдено ? найдено.slice(имя.length + 3) : поумолчанию;
};

const ФАЙЛ_НОВОЙ = дов("куда", "/var/www/skladanvarov/.env");
const ФАЙЛ_СТАРОЙ = дов("откуда", "/root/env-before-frankfurt.bak");

// ---------- доступы ----------
function доступы(файл, подпись) {
  // ﻿ — невидимый символ в начале файла, из-за него не находится
  // первая строка. Срезаем.
  const текст = (fs.existsSync(файл) ? fs.readFileSync(файл, "utf8") : "").replace(/^﻿/, "");
  const из = (ключ) => {
    const найдено = текст.match(new RegExp("^" + ключ + "=(.*)$", "m"));
    return (найдено ? найдено[1] : "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  };
  const о = { url: из("SUPABASE_URL"), ключ: из("SUPABASE_SERVICE_KEY") };
  if (!о.url || !о.ключ) {
    console.error("Нет доступов к " + подпись + " базе в файле " + файл);
    process.exit(2);
  }
  return о;
}

const старая = доступы(ФАЙЛ_СТАРОЙ, "старой");
const новая = доступы(ФАЙЛ_НОВОЙ, "новой");
const ref = (адрес) => (адрес.match(/https:\/\/([^.]+)\./) || [])[1] || адрес;

if (старая.url === новая.url) {
  console.error("Старая и новая база — один адрес. Переносить нечего.");
  process.exit(2);
}

const шапка = (ключ, ещё) => Object.assign({ apikey: ключ, Authorization: "Bearer " + ключ }, ещё || {});
const мб = (байт) => (байт / 1048576).toFixed(1) + " МБ";

// ---------- перечисление файлов (с вложенными папками) ----------
async function перечислить(база, ключ, корзина, папка = "") {
  const всё = [];
  for (let сдвиг = 0; ; сдвиг += ЗА_РАЗ) {
    const ответ = await fetch(база + "/storage/v1/object/list/" + корзина, {
      method: "POST",
      headers: шапка(ключ, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: папка, limit: ЗА_РАЗ, offset: сдвиг,
        sortBy: { column: "name", order: "asc" } }),
    });
    if (!ответ.ok) {
      throw new Error("не удалось перечислить " + корзина + "/" + папка
        + ": " + ответ.status + " " + (await ответ.text()).slice(0, 200));
    }
    const список = await ответ.json();
    for (const запись of список) {
      const путь = папка ? папка + "/" + запись.name : запись.name;
      // У папки нет id и размера — заходим внутрь.
      if (!запись.id) всё.push(...await перечислить(база, ключ, корзина, путь));
      else всё.push({ путь, размер: Number((запись.metadata || {}).size) || 0 });
    }
    if (список.length < ЗА_РАЗ) break;
  }
  return всё;
}

// ---------- перенос одного файла ----------
async function перенести(корзина, файл) {
  const откуда = await fetch(старая.url + "/storage/v1/object/" + корзина + "/" + encodeURI(файл.путь),
    { headers: шапка(старая.ключ) });
  if (!откуда.ok) throw new Error("скачать не удалось: " + откуда.status);
  const тип = откуда.headers.get("content-type") || "application/octet-stream";
  const данные = Buffer.from(await откуда.arrayBuffer());

  const куда = await fetch(новая.url + "/storage/v1/object/" + корзина + "/" + encodeURI(файл.путь), {
    method: "POST",
    headers: шапка(новая.ключ, { "Content-Type": тип, "x-upsert": "true", "cache-control": "3600" }),
    body: данные,
  });
  if (!куда.ok) throw new Error("загрузить не удалось: " + куда.status + " " + (await куда.text()).slice(0, 160));
  return данные.length;
}

// ---------- работа по корзине ----------
async function покорзине(корзина, толькоПроверить) {
  const было = await перечислить(старая.url, старая.ключ, корзина);
  const стало = await перечислить(новая.url, новая.ключ, корзина);
  const есть = new Map(стало.map(ф => [ф.путь, ф.размер]));
  const надо = было.filter(ф => есть.get(ф.путь) !== ф.размер);

  console.log("\n" + корзина + ": в старой " + было.length + " файлов ("
    + мб(было.reduce((с, ф) => с + ф.размер, 0)) + "), в новой " + стало.length
    + ", перенести " + надо.length);
  if (толькоПроверить || !надо.length) return { всего: было.length, перенесено: 0, ошибки: [] };

  let готово = 0, байт = 0;
  const ошибки = [];
  const очередь = [...надо];
  const работник = async () => {
    for (;;) {
      const файл = очередь.shift();
      if (!файл) return;
      try { байт += await перенести(корзина, файл); }
      catch (сбой) { ошибки.push(файл.путь + " — " + (сбой.message || сбой)); }
      готово++;
      if (готово % 50 === 0 || готово === надо.length) {
        console.log("   " + готово + " из " + надо.length + "   " + мб(байт));
      }
    }
  };
  await Promise.all(Array.from({ length: ОДНОВРЕМЕННО }, работник));
  return { всего: было.length, перенесено: готово - ошибки.length, ошибки };
}

// ---------- запуск ----------
const толькоПроверить = process.argv.includes("--проверить") || process.argv.includes("--check");
console.log("файлы: из " + ref(старая.url) + " в " + ref(новая.url));

const сбои = [];
for (const корзина of КОРЗИНЫ) {
  const итог = await покорзине(корзина, толькоПроверить);
  сбои.push(...итог.ошибки);
}

if (сбои.length) {
  console.log("\nНе перенеслось " + сбои.length + " файлов:");
  сбои.slice(0, 10).forEach(с => console.log("   " + с));
  console.log("Запустите скрипт ещё раз — он догонит остаток.");
  process.exit(1);
}
console.log(толькоПроверить ? "\nПроверка закончена." : "\nВсе файлы на месте.");
