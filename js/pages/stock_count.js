// ========================================================================
//  ПЕРЕСЧЁТ СКЛАДА — раздел внутри «Проверки склада».
//
//  Два пути, один выбор раздела:
//   • НА ЭКРАНЕ — выбрал «Лапки», увидел все лапки с фото, артикулом и
//     одним полем, вписал что лежит, подтвердил — остаток сразу стал таким.
//   • ЧЕРЕЗ EXCEL — та же «Лапки» выгружается листом (с фото), его можно
//     распечатать, обойти полки без интернета и загрузить назад.
//
//  Правила, которые важнее скорости:
//  1. Пустое поле — «не считал». Склад на 941 товар за один обход не
//     проходят, и незаполненное не должно ничего обнулять.
//  2. Перед записью — сводка «было → стало». Владелец видит каждую строку.
//  3. Введённое держим в браузере: закрыл вкладку или сел телефон — цифры
//     не пропали.
//  4. Каждая правка идёт в журнал с причиной «Пересчёт: Лапки» — потом
//     видно, откуда взялось число (js/pages/stock_history.js).
// ========================================================================
import { el, toast, input, confirmDialog, showLoader, hideLoader, setLoaderText } from "../ui.js?v=20261010e";
import { icon } from "../icons.js?v=20261010e";
import { изменениеСклада } from "../db.js?v=20261010e";
import { сверитьЛист, строкаПересчёта } from "../stockcount.js?v=20261010e";
import { exportStockCountSheet, exportCountDiff, списокДляПересчёта } from "../xlsx-export.js?v=20261010e";
import { parseRows, pickFile } from "../xlsx-import.js?v=20261010e";
import { подписьКода } from "../catalogcode.js?v=20261010e";
import { поставитьСнимок } from "../img.js?v=20261010e";
import { placeholder } from "./products.js?v=20261010e";

const знак = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100);
const ПАЧКА = 150;                       // товаров в одном запросе на запись
const ЧЕРНОВИК = "gm:пересчёт:";         // + раздел (вписанное, но не сохранённое)
const ОБХОД = "gm:обход:";               // + раздел (что уже посчитали и записали)

// Черновик держим в браузере: обход полок длится часами, вкладка может
// закрыться, телефон — уснуть. Потерять введённое нельзя.
function взятьЧерновик(раздел) {
  try { return JSON.parse(localStorage.getItem(ЧЕРНОВИК + раздел) || "{}") || {}; }
  catch { return {}; }
}
function сохранитьЧерновик(раздел, данные) {
  try {
    if (Object.keys(данные).length) localStorage.setItem(ЧЕРНОВИК + раздел, JSON.stringify(данные));
    else localStorage.removeItem(ЧЕРНОВИК + раздел);
  } catch { /* приватный режим — ну и ладно, экран работает */ }
}

// Что в разделе уже пересчитано: { id товара: "07.10" }. Нужно, чтобы,
// вернувшись к «Лапкам» через день, видеть ОСТАВШИЕСЯ 100, а не все 120.
function взятьОбход(раздел) {
  try { return JSON.parse(localStorage.getItem(ОБХОД + раздел) || "{}") || {}; }
  catch { return {}; }
}
function сохранитьОбход(раздел, данные) {
  try {
    if (Object.keys(данные).length) localStorage.setItem(ОБХОД + раздел, JSON.stringify(данные));
    else localStorage.removeItem(ОБХОД + раздел);
  } catch { /* приватный режим — ну и ладно */ }
}

function плитка(подпись, значение, вид = "") {
  const цвет = вид === "warn" ? "var(--danger)" : (вид === "ok" ? "var(--ok)" : "");
  return el("div.card", { style: { padding: "10px 14px", minWidth: "118px" } }, [
    el("div.muted", { style: { fontSize: "12px" }, text: подпись }),
    el("div", { style: { fontWeight: "800", fontSize: "20px", color: цвет || "inherit" }, text: String(значение) }),
  ]);
}

export function пересчётПоExcel(page, ctx, products) {
  let раздел = "";                        // выбранный раздел ("" = весь склад)
  let режим = "осталось";                 // осталось | все | сделано
  let видимые = products;                 // что сейчас на экране — это же уходит в Excel
  let итог = null;                        // сверка загруженного листа

  const карточка = el("div.card", { style: { padding: "16px", marginBottom: "16px" } });
  карточка.append(
    el("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" } }, [
      el("span", { style: { display: "flex", color: "var(--accent)" } }, [icon("box", { size: 18 })]),
      el("div", { style: { fontWeight: "700", fontSize: "16px" }, text: "Пересчёт склада" }),
    ]),
    el("div.muted", { style: { fontSize: "13px", marginBottom: "12px" },
      text: "Выберите раздел — и считайте прямо на экране или выгрузите его в Excel. Пустое поле склад не тронет: считать можно частями." }),
  );

  // ---------- разделы ----------
  const разделы = [...new Set(products.map(p => String(p.category || "")).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"));
  const сколько = (к) => products.filter(p => (!к || String(p.category || "") === к)).length;

  const полоса = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" } });
  const кнопкаРаздела = (значение, подпись) => {
    const b = el("button.btn.btn-sm" + (значение === раздел ? ".btn-primary" : ".btn-outline"), {
      text: подпись + " · " + сколько(значение), "data-cat": значение,
      onclick: () => { раздел = значение; режим = "осталось"; обновитьПолосу(); нарисоватьСписок(); },
    });
    return b;
  };
  const обновитьПолосу = () => {
    [...полоса.children].forEach(b => {
      const свой = (b.getAttribute("data-cat") || "") === раздел;
      b.className = "btn btn-sm " + (свой ? "btn-primary" : "btn-outline");
    });
  };
  полоса.append(кнопкаРаздела("", "Весь склад"));
  разделы.forEach(к => полоса.append(кнопкаРаздела(к, к)));
  карточка.append(полоса);

  // ---------- кнопки Excel ----------
  const фотоГалка = el("input", { type: "checkbox", checked: "checked" });
  const фотоПоле = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" } },
    [фотоГалка, el("span", { text: "с фото" })]);
  const кнВыгрузить = el("button.btn.btn-outline", {}, [icon("download", { size: 16 }), "Выгрузить в Excel"]);
  const кнЗагрузить = el("button.btn.btn-outline", {}, [icon("upload", { size: 16 }), "Загрузить заполненный лист"]);
  карточка.append(el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" } },
    [кнВыгрузить, фотоПоле, кнЗагрузить]));

  const списокБокс = el("div");
  const тело = el("div");
  карточка.append(списокБокс, тело);
  page.append(карточка);

  кнВыгрузить.addEventListener("click", async () => {
    кнВыгрузить.disabled = true;
    // Фото тяжёлые: по всему складу их 900 — файл будет неподъёмным.
    const сФото = Boolean(раздел) && фотоГалка.checked;
    showLoader("Готовим лист…");
    try {
      // Выгружаем ровно то, что на экране: выбрано «осталось посчитать» —
      // в листе будут только они, печатать лишнее не придётся.
      const n = await exportStockCountSheet(видимые, { категория: раздел, сФото, наПрогресс: setLoaderText });
      toast("Лист готов: " + n + " товаров" + (раздел ? " · " + раздел : ""), "ok");
    } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
    finally { hideLoader(); кнВыгрузить.disabled = false; }
  });

  кнЗагрузить.addEventListener("click", () => pickFile(async (file) => {
    showLoader("Читаем лист…");
    try {
      const строки = await parseRows(file, "count");
      if (!строки.length) throw new Error("В файле не нашлось строк. Нужны колонки «Товар» и «Факт на полке».");
      итог = сверитьЛист(строки, products);
      нарисоватьСводку();
    } catch (e) { toast("Не удалось прочитать: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }));

  // ====================================================================
  //  СЧЁТ НА ЭКРАНЕ
  // ====================================================================
  function нарисоватьСписок() {
    итог = null;
    тело.replaceChildren();
    списокБокс.replaceChildren();
    фотоПоле.style.display = раздел ? "flex" : "none";
    if (!раздел) {
      списокБокс.append(el("div.muted", { style: { fontSize: "13px", padding: "4px 0" },
        text: "Выберите раздел, чтобы считать прямо здесь. Для всего склада сразу удобнее выгрузить лист в Excel." }));
      return;
    }

    const всеТовары = списокДляПересчёта(products, раздел);
    const черновик = взятьЧерновик(раздел);
    const пройдено = взятьОбход(раздел);          // что уже посчитали и сохранили

    // Полки обходят за несколько заходов. Вернувшись, владелец должен
    // видеть ОСТАВШИЕСЯ, а не все 120 заново — иначе непонятно, где он
    // остановился. Поэтому обход помнится, и по умолчанию показываем остаток.
    const сделано = всеТовары.filter(p => пройдено[p.id]);
    const осталось = всеТовары.filter(p => !пройдено[p.id]);
    if (режим === "осталось" && !сделано.length) режим = "все";
    const товары = режим === "осталось" ? осталось : (режим === "сделано" ? сделано : всеТовары);
    видимые = товары.length ? товары : всеТовары;

    const фильтры = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", margin: "2px 0 8px" } });
    if (сделано.length) {
      [["осталось", "Осталось посчитать · " + осталось.length],
       ["все", "Весь раздел · " + всеТовары.length],
       ["сделано", "Уже посчитано · " + сделано.length]].forEach(([знач, подпись]) => {
        фильтры.append(el("button.btn.btn-sm" + (знач === режим ? ".btn-primary" : ".btn-outline"), {
          text: подпись, onclick: () => { режим = знач; нарисоватьСписок(); },
        }));
      });
      фильтры.append(el("button.btn.btn-outline.btn-sm", {
        text: "Начать обход заново",
        onclick: () => confirmDialog(
          "Снять отметки «посчитано» в разделе «" + раздел + "»? Остатки не изменятся — просто начнём обход сначала.",
          () => { сохранитьОбход(раздел, {}); режим = "все"; нарисоватьСписок(); }),
      }));
    }

    const счётчик = el("div.muted", { style: { fontSize: "13px" } });
    const кнСохранить = el("button.btn.btn-primary", { disabled: "disabled" }, [icon("check", { size: 16 }), "Сохранить посчитанное"]);
    const кнОчистить = el("button.btn.btn-outline.btn-sm", { text: "Очистить введённое" });

    const обновитьНиз = () => {
      const n = Object.keys(черновик).length;
      счётчик.textContent = "Заполнено " + n + " из " + товары.length + (n ? " · остальные не изменятся" : "");
      кнСохранить.disabled = n === 0;
      кнСохранить.replaceChildren(icon("check", { size: 16 }), document.createTextNode(n ? "Сохранить посчитанное: " + n : "Сохранить посчитанное"));
    };

    const строки = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", margin: "4px 0 12px" } });
    товары.forEach(p => {
      const было = Number(p.stock_qty) || 0;
      const поле = input({ type: "number", inputmode: "numeric", placeholder: "факт", style: { width: "110px", minHeight: "40px", fontSize: "16px", textAlign: "center" } });
      if (черновик[p.id] !== undefined) поле.value = String(черновик[p.id]);

      const фото = el("img", {
        style: { width: "46px", height: "46px", objectFit: "cover", borderRadius: "8px", background: "var(--bg2)", flex: "0 0 auto" },
        alt: p.name || "",
      });
      поставитьСнимок(фото, (p.photos && p.photos[0]) || p.photo_url || "", placeholder(p.name || "?"), 120, true);

      const строка = el("div.card", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px" } }, [
        фото,
        el("div", { style: { flex: "1 1 220px", minWidth: "0" } }, [
          el("div", { style: { fontWeight: "600", lineHeight: "1.25" }, text: p.name || "—" }),
          el("div.muted", { style: { fontSize: "11px" }, text: подписьКода(p) || "без кода" }),
          пройдено[p.id]
            ? el("div", { style: { fontSize: "11px", color: "var(--ok)", display: "flex", alignItems: "center", gap: "4px" } },
                [icon("check", { size: 12 }), "посчитано " + пройдено[p.id]])
            : null,
        ].filter(Boolean)),
        el("div", { style: { textAlign: "right", minWidth: "92px" } }, [
          el("div.muted", { style: { fontSize: "11px" }, text: "в складе" }),
          el("div", { style: { fontWeight: "700" }, text: String(было) }),
        ]),
        поле,
      ]);

      поле.addEventListener("input", () => {
        const v = поле.value.trim();
        if (v === "" || !isFinite(Number(v))) delete черновик[p.id];
        else черновик[p.id] = Number(v);
        const свой = черновик[p.id];
        строка.style.borderColor = свой === undefined ? "" : (свой === было ? "var(--ok)" : "var(--accent)");
        сохранитьЧерновик(раздел, черновик);
        обновитьНиз();
      });
      if (черновик[p.id] !== undefined) строка.style.borderColor = черновик[p.id] === было ? "var(--ok)" : "var(--accent)";
      строки.append(строка);
    });

    кнОчистить.addEventListener("click", () => {
      confirmDialog("Убрать всё, что вписали в разделе «" + раздел + "»? Склад не изменится.", () => {
        Object.keys(черновик).forEach(k => delete черновик[k]);
        сохранитьЧерновик(раздел, черновик);
        нарисоватьСписок();
      });
    });

    кнСохранить.addEventListener("click", () => {
      const расхождения = [];
      let сошлось = 0;
      товары.forEach(p => {
        const факт = черновик[p.id];
        if (факт === undefined) return;
        const было = Number(p.stock_qty) || 0;
        if (Math.abs(факт - было) < 0.0001) { сошлось++; return; }
        расхождения.push({ p, было, факт, разница: Math.round((факт - было) * 100) / 100 });
      });
      if (!расхождения.length) {
        if (!сошлось) { toast("Ничего не вписано", "err"); return; }
        // Склад менять нечего, но товары ПЕРЕСЧИТАНЫ — отмечаем, чтобы
        // они ушли из списка «осталось посчитать».
        const сегодня = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
        Object.keys(черновик).forEach(id => { пройдено[id] = сегодня; });
        сохранитьОбход(раздел, пройдено);
        Object.keys(черновик).forEach(k => delete черновик[k]);
        сохранитьЧерновик(раздел, черновик);
        toast("Всё сошлось: " + сошлось + " товаров отмечены посчитанными", "ok");
        режим = "осталось";
        нарисоватьСписок();
        return;
      }
      // Отмечаем посчитанным ВСЁ, что вписали, — и совпавшее тоже: товар
      // пересчитан, даже если остаток сошёлся.
      const посчитаны = Object.keys(черновик);
      применить(кнСохранить, расхождения, раздел, () => {
        const сегодня = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
        посчитаны.forEach(id => { пройдено[id] = сегодня; });
        сохранитьОбход(раздел, пройдено);
        Object.keys(черновик).forEach(k => delete черновик[k]);
        сохранитьЧерновик(раздел, черновик);
        режим = "осталось";
      });
    });

    списокБокс.append(
      el("div.muted", { style: { fontSize: "13px", marginBottom: "6px" },
        text: "Раздел «" + раздел + "»: " + всеТовары.length + " товаров"
          + (сделано.length ? " · посчитано " + сделано.length + ", осталось " + осталось.length : "")
          + ". Вписывайте только то, что пересчитали." }),
      фильтры,
      строки,
      el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, [кнСохранить, кнОчистить, счётчик]),
    );
    обновитьНиз();
  }

  // ====================================================================
  //  СВОДКА ПО ЗАГРУЖЕННОМУ ЛИСТУ
  // ====================================================================
  function нарисоватьСводку() {
    списокБокс.replaceChildren();
    тело.replaceChildren();
    if (!итог) return;
    const { расхождения, совпало, пустые, ненайденные, посчитано } = итог;

    тело.append(el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" } }, [
      плитка("Посчитано", посчитано),
      плитка("Сошлось", совпало, совпало ? "ok" : ""),
      плитка("Расхождений", расхождения.length, расхождения.length ? "warn" : "ok"),
      плитка("Не считали", пустые),
      ненайденные.length ? плитка("Не нашли товар", ненайденные.length, "warn") : null,
    ].filter(Boolean)));

    if (!расхождения.length) {
      тело.append(el("div.muted", { style: { padding: "8px 0" },
        text: посчитано
          ? "Всё сошлось: по посчитанным товарам склад совпадает с полкой. Менять нечего."
          : "В листе не заполнена ни одна клетка «Факт на полке»." }));
      хвост();
      return;
    }

    const строки = el("tbody");
    расхождения.forEach(({ p, было, факт, разница }) => строки.append(el("tr", {}, [
      el("td", {}, [
        el("div", { style: { fontWeight: "600" }, text: p.name || "—" }),
        el("div.muted", { style: { fontSize: "11px" }, text: подписьКода(p) || "" }),
      ]),
      el("td", { text: p.category || "—" }),
      el("td.right", { text: String(было) }),
      el("td.right", {}, [el("b", { text: String(факт) })]),
      el("td.right", {}, [el("b", { style: { color: разница > 0 ? "var(--ok)" : "var(--danger)" }, text: знак(разница) })]),
    ])));
    тело.append(el("div", { style: { overflowX: "auto", marginBottom: "12px" } }, [
      el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, ["Товар", "Раздел", "Было в складе", "Факт на полке", "Разница"].map(h => el("th", { text: h })))]),
        строки,
      ]),
    ]));

    const вверх = расхождения.filter(r => r.разница > 0).reduce((a, r) => a + r.разница, 0);
    const вниз = расхождения.filter(r => r.разница < 0).reduce((a, r) => a + r.разница, 0);
    тело.append(el("div.muted", { style: { fontSize: "13px", marginBottom: "10px" },
      text: "Прибавится " + Math.round(вверх) + " шт, спишется " + Math.abs(Math.round(вниз)) + " шт по " + расхождения.length + " товарам." }));

    const кнЛист = el("button.btn.btn-outline", {
      onclick: () => exportCountDiff(расхождения, раздел).catch(e => toast("Не удалось: " + (e.message || e), "err")),
    }, [icon("download", { size: 16 }), "Скачать расхождения"]);
    const кнПрименить = el("button.btn.btn-primary", {}, [icon("check", { size: 16 }), "Применить к складу"]);
    кнПрименить.addEventListener("click", () => применить(кнПрименить, расхождения, раздел));
    тело.append(el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [кнПрименить, кнЛист]));
    хвост();
  }

  function хвост() {
    const { ненайденные, повторы } = итог;
    if (ненайденные.length) {
      тело.append(el("div.muted", { style: { fontSize: "12px", marginTop: "10px" },
        text: "Не нашли на складе (строки пропущены): " + ненайденные.slice(0, 12).join(", ")
          + (ненайденные.length > 12 ? " и ещё " + (ненайденные.length - 12) : "") }));
    }
    if (повторы.length) {
      тело.append(el("div.muted", { style: { fontSize: "12px", marginTop: "6px" },
        text: "Встретились в листе дважды (взяли первое число): " + повторы.slice(0, 8).join(", ") }));
    }
  }

  // ====================================================================
  //  ЗАПИСЬ
  // ====================================================================
  async function применить(кнопка, расхождения, какойРаздел, послеУспеха) {
    // Окно подтверждения переносы строк не показывает, поэтому коротко:
    // подробности («было → стало») и так перед глазами.
    const штук = расхождения.reduce((s, r) => s + Math.abs(r.разница), 0);
    confirmDialog(
      "Поставить новый остаток " + расхождения.length + " товарам (сдвиг " + Math.round(штук) + " шт)? "
      + "Остальные товары не изменятся, каждая правка попадёт в историю остатков.",
      async () => {
        кнопка.disabled = true;
        showLoader("Записываем пересчёт…");
        изменениеСклада("Пересчёт склада" + (какойРаздел ? ": " + какойРаздел : "") + " от " + new Date().toLocaleDateString("ru-RU"));
        const строки = расхождения.map(r => строкаПересчёта(r.p, r.факт)).filter(Boolean);
        let записано = 0; const плохо = [];
        try {
          for (let i = 0; i < строки.length; i += ПАЧКА) {
            const часть = строки.slice(i, i + ПАЧКА);
            setLoaderText("Записываем пересчёт… " + Math.min(i + часть.length, строки.length) + " из " + строки.length);
            try { await ctx.db.products.upsertMany(часть); записано += часть.length; }
            catch {
              // Пачка не прошла (оборвалась связь, отказ базы) — доводим по
              // одному, чтобы не потерять весь обход полок.
              for (const r of часть) {
                try { await ctx.db.products.upsert(r); записано++; }
                catch { плохо.push(r.id); }
              }
            }
          }
        } finally { hideLoader(); }
        if (плохо.length) {
          toast("Записано " + записано + ", не прошло " + плохо.length + " — проверьте связь и повторите", "err");
        } else {
          toast("Остатки обновлены: " + записано + " товаров", "ok");
          if (послеУспеха) послеУспеха();
        }
        ctx.refresh();
      });
  }

  нарисоватьСписок();
}
