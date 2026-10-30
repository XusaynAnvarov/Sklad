// ========================================================================
//  ПРОГОН «ПЕРЕЖАТЬ ФОТО ТОВАРОВ»
//
//  Зачем. Снимки в хранилище весят в среднем 117 КБ, а 653 файла — больше
//  150 КБ, самый большой 2,6 МБ. В накладной снимок показывается размером
//  с ноготь, но в PDF ложится целиком: накладная на 27 позиций выходила
//  около шести мегабайт, а её ещё отправлять клиенту в Telegram.
//  Уменьшить на сервере нечем — у Supabase преобразование картинок
//  отключено тарифом (отвечает 403). Зато здесь, в браузере, есть canvas.
//
//  Что делает: берёт снимок, перерисовывает в МАКС_СТОРОНА по длинной
//  стороне, жмёт в JPEG и кладёт в хранилище НОВЫМ файлом, а у товара
//  подменяет адрес. Старый файл остаётся на месте — это и есть откат:
//  ничего не стирается и не перезаписывается.
//
//  Прогон безопасно прерывать и запускать снова: уже пережатые снимки он
//  узнаёт по весу и пропускает.
// ========================================================================

import { путьХранилища } from "./img.js?v=20261030n";

const МАКС_СТОРОНА = 1000;   // с запасом: в PDF снимок печатается не крупнее 100 pt
const КАЧЕСТВО = 0.8;
const ПОРОГ = 70 * 1024;     // легче этого не трогаем — выигрыша не будет
const ЗА_РАЗ = 3;            // столько снимков в работе одновременно

// Скачиваем через свой сервер: адрес из базы у товаров, заведённых до
// переезда, ведёт на прежний проект Supabase и не отвечает.
async function взятьСнимок(путь) {
  const r = await fetch("/api/img?w=1200&p=" + encodeURIComponent(путь));
  if (!r.ok) throw new Error("не скачался (" + r.status + ")");
  const b = await r.blob();
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error("не прочитался"));
    fr.readAsDataURL(b);
  });
  return { dataUrl, размер: b.size };
}

function уменьшить(dataUrl) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, МАКС_СТОРОНА / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(im.width * k));
      c.height = Math.max(1, Math.round(im.height * k));
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      res({ dataUrl: c.toDataURL("image/jpeg", КАЧЕСТВО), ш: c.width, в: c.height });
    };
    im.onerror = () => rej(new Error("не открылся как картинка"));
    im.src = dataUrl;
  });
}

const весDataUrl = (d) => Math.round((d.length - (d.indexOf(",") + 1)) * 0.75);

// Один снимок: вернуть новый адрес или null, если трогать не нужно.
async function пережатьОдин(db, адрес) {
  const путь = путьХранилища(адрес);
  if (!путь) return { пропуск: "чужой адрес" };
  const { dataUrl, размер } = await взятьСнимок(путь);
  if (размер <= ПОРОГ) return { пропуск: "и так лёгкий", было: размер };
  const малый = await уменьшить(dataUrl);
  const стало = весDataUrl(малый.dataUrl);
  // Выигрыш меньше четверти не стоит нового файла в хранилище.
  if (стало > размер * 0.75) return { пропуск: "выигрыша нет", было: размер, стало };
  const имя = путь.split("/").pop().replace(/\.[^.]+$/, "") + "_m.jpg";
  const новый = await db.uploadPhotoDataUrl(малый.dataUrl, имя);
  return { новый, было: размер, стало };
}

// Главный прогон. наПрогресс({сделано, всего, имя, итог}); стоп() → прервать.
export async function пережатьФото(db, { наПрогресс, стоп } = {}) {
  const товары = await db.products.list();
  const цели = товары.filter(p => (Array.isArray(p.photos) && p.photos.length) || p.photo_url);
  const итог = { товаров: цели.length, снимков: 0, пережато: 0, пропущено: 0, ошибок: 0, былоБайт: 0, сталоБайт: 0, ошибки: [] };

  for (let i = 0; i < цели.length; i++) {
    if (стоп && стоп()) break;
    const p = цели[i];
    const адреса = (Array.isArray(p.photos) && p.photos.length) ? [...p.photos] : [p.photo_url];
    let менялось = false;

    // Снимки одного товара идут пачками: по одному долго, все разом —
    // телефон не вытянет (каждый кадр разворачивается в память).
    for (let н = 0; н < адреса.length; н += ЗА_РАЗ) {
      const кусок = адреса.slice(н, н + ЗА_РАЗ);
      const готово = await Promise.all(кусок.map(async (адрес, j) => {
        итог.снимков++;
        try { return await пережатьОдин(db, адрес); }
        catch (e) { итог.ошибок++; итог.ошибки.push((p.name || "?") + ": " + e.message); return { пропуск: "ошибка" }; }
      }));
      готово.forEach((р, j) => {
        if (р.было) итог.былоБайт += р.было;
        if (р.новый) {
          итог.сталоБайт += р.стало; итог.пережато++;
          адреса[н + j] = р.новый; менялось = true;
        } else {
          итог.пропущено++;
          if (р.было) итог.сталоБайт += р.было;
        }
      });
    }

    if (менялось) {
      const патч = { ...p };
      if (Array.isArray(p.photos) && p.photos.length) { патч.photos = адреса; патч.photo_url = адреса[0]; }
      else патч.photo_url = адреса[0];
      try { await db.products.upsert(патч); }
      catch (e) { итог.ошибок++; итог.ошибки.push((p.name || "?") + ": запись — " + e.message); }
    }

    if (наПрогресс) наПрогресс({ сделано: i + 1, всего: цели.length, имя: p.name || "", итог });
  }
  return итог;
}
