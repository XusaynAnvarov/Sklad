// ========================================================================
//  РЕЗЕРВНАЯ КОПИЯ БАЗЫ.
//
//  На бесплатном плане Supabase копий не делает вообще — на странице
//  проекта так и написано: «резервных копий нет». В базе лежат накладные,
//  долги клиентов и остатки; если что-то случится, восстанавливать будет
//  неоткуда. Поэтому копию делаем сами.
//
//  Читаем через тот же /api/admin/db, что и весь склад: он уже умеет
//  отдавать таблицу целиком, страницами. Ничего не пишем — только читаем.
// ========================================================================

// Что выгружаем. Порядок важен для восстановления: сначала справочники,
// потом документы, которые на них ссылаются.
export const ТАБЛИЦЫ = ["products", "customers", "sales", "purchases", "payments", "videos", "settings"];

const дваЗнака = (n) => String(n).padStart(2, "0");

// Имя файла с датой и временем: копий будет много, и они не должны
// затирать друг друга в папке «Загрузки».
export function имяФайла(d = new Date()) {
  return "sklad-" + d.getFullYear() + дваЗнака(d.getMonth() + 1) + дваЗнака(d.getDate())
    + "-" + дваЗнака(d.getHours()) + дваЗнака(d.getMinutes()) + ".json";
}

// Сколько записей в копии — по этому числу видно, что копия не пустая.
export function пересчитать(данные) {
  const итог = {};
  let всего = 0;
  for (const t of ТАБЛИЦЫ) {
    const v = данные[t];
    let n = 0;
    if (Array.isArray(v)) n = v.length;
    // настройки — одна запись, но пустой объект записью не считаем:
    // иначе копия совсем пустой базы выглядела бы непустой
    else if (v && typeof v === "object") n = Object.keys(v).length ? 1 : 0;
    else if (v) n = 1;
    итог[t] = n;
    всего += n;
  }
  return { поТаблицам: итог, всего };
}

// Собрать копию. onStep вызывается после каждой таблицы — чтобы показывать,
// что происходит: на большой базе это не мгновенно.
export async function собрать(db, onStep) {
  const данные = {};
  const ошибки = [];
  for (const t of ТАБЛИЦЫ) {
    try {
      if (t === "settings") данные[t] = await db.getSettings();
      else данные[t] = await db[t].list();
    } catch (e) {
      данные[t] = [];
      ошибки.push(t + ": " + (e.message || e));
    }
    if (onStep) onStep(t, данные[t]);
  }
  const счёт = пересчитать(данные);
  return {
    формат: "general-modern-backup",
    версия: 1,
    когда: new Date().toISOString(),
    записей: счёт.поТаблицам,
    всего: счёт.всего,
    ошибки,
    данные,
  };
}

// Отдать файл пользователю. В Telegram скачивание бывает заблокировано,
// поэтому вызывающий код должен быть готов к отказу.
export function скачать(копия, имя) {
  const текст = JSON.stringify(копия, null, 1);
  const blob = new Blob([текст], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = имя || имяФайла();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return текст.length;
}
