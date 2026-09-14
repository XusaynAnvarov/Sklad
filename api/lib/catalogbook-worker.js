// ========================================================================
//  СБОРКА ПЕЧАТНОГО КАТАЛОГА — В ОТДЕЛЬНОМ ПОТОКЕ.
//
//  Книга на 70+ страниц с сотнями фото собирается больше минуты, а pdf-lib
//  всё это время занимает процессор целиком. В основном потоке сервера
//  на эту минуту замерли бы сайт, склад и бот. Поэтому сборка идёт здесь,
//  а основной поток только получает сообщения о ходе.
//
//  Файл пишется во временный и переименовывается в конце: недособранную
//  книгу скачать нельзя.
// ========================================================================
import { parentPort, workerData } from "worker_threads";
import { writeFileSync, renameSync, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";
import { sget } from "./supa.js";
import { оригинал, снимок } from "./imgproxy.js";
import { собрать, шрифтыСДиска, путьСнимка, ориентацияJpeg } from "./catalogbook.js";

const { язык, образец, файл } = workerData;
const ход = (m) => parentPort.postMessage({ вид: "ход", ...m });

// Все товары страницами: база отдаёт не больше тысячи строк за раз.
async function всеТовары() {
  const ПОЛЯ = "id,name,category,code,photo_url,photos,site_status,created_at";
  const out = [];
  for (let off = 0; off < 100000; ) {
    const часть = await sget(`products?select=${ПОЛЯ}&order=created_at.asc,id.asc&limit=1000&offset=${off}`);
    if (!Array.isArray(часть) || !часть.length) break;
    out.push(...часть);
    off += часть.length;
    if (часть.length < 1000) break;
  }
  return out;
}

// Фото для печати: оригинал. Если в оригинале телефон записал поворот
// (EXIF), PDF его не учтёт и снимок ляжет боком — тогда берём копию,
// которую Supabase уже повернул сам.
async function снимокДляПечати(путь) {
  const ор = await оригинал(путь);
  if (ор && ориентацияJpeg(ор.байты) <= 1) return ор.байты;
  const копия = await снимок(путь, 1200);
  return копия ? копия.байты : (ор ? ор.байты : null);
}

try {
  ход({ этап: "товары", готово: 0, всего: 0 });
  const товары = await всеТовары();
  const [настройки] = await sget("settings?select=catalog_info&limit=1").catch(() => [null]);
  const инфо = (настройки && настройки.catalog_info) || {};

  // Фото заранее, по нескольку разом: при первой сборке их качают из
  // Supabase, по одному это заняло бы минуты. Дальше — с диска.
  // Образцу нужно десятка три фото — их достанем по ходу, не качая все.
  const пути = образец ? [] : [...new Set(товары.filter(p => p.site_status !== "hidden").map(путьСнимка).filter(Boolean))];
  const готовые = new Map();
  let i = 0, сделано = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < пути.length) {
      const путь = пути[i++];
      try { готовые.set(путь, await снимокДляПечати(путь)); } catch { готовые.set(путь, null); }
      сделано++;
      if (сделано % 10 === 0 || сделано === пути.length) ход({ этап: "фото", готово: сделано, всего: пути.length });
    }
  }));

  const итог = await собрать({
    товары, язык, инфо, образец,
    достатьСнимок: async (путь) => (готовые.has(путь) ? готовые.get(путь) : снимокДляПечати(путь)),
    шрифты: шрифтыСДиска(new URL("../../", import.meta.url)),
    наПрогресс: (p) => { if (p.этап === "страницы") ход(p); },
  });

  ход({ этап: "сохранение", готово: 0, всего: 1 });
  mkdirSync(dirname(файл), { recursive: true });
  const временный = файл + ".part";
  writeFileSync(временный, итог.байты);
  renameSync(временный, файл);
  parentPort.postMessage({ вид: "готово", страниц: итог.страниц, всегоСтраниц: итог.всегоСтраниц, байт: итог.байты.length, товаров: товары.length });
} catch (e) {
  try { unlinkSync(файл + ".part"); } catch { }
  parentPort.postMessage({ вид: "ошибка", ошибка: String((e && e.message) || e) });
}
