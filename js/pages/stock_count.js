// ========================================================================
//  ПЕРЕСЧЁТ СКЛАДА ЧЕРЕЗ EXCEL — раздел внутри «Проверки склада».
//
//  Так владелец снимает остатки: выгрузил лист, обошёл полки, вписал в
//  колонку «Факт на полке» то, что лежит, загрузил файл назад. Склад
//  подвинется на разницу — одной пачкой, а не по товару за раз.
//
//  Три правила, которые тут важнее скорости:
//  1. Пустая клетка — «не считал». Склад на 941 товар за один обход не
//     проходят, и незаполненные строки не должны ничего обнулять.
//  2. Сначала СВОДКА, потом запись. Владелец видит каждую строку
//     «было → стало» и может скачать лист расхождений до записи.
//  3. Каждая правка попадает в журнал с причиной «Пересчёт склада» —
//     потом видно, откуда взялось число (js/pages/stock_history.js).
// ========================================================================
import { el, toast, confirmDialog, showLoader, hideLoader } from "../ui.js?v=20261006b";
import { icon } from "../icons.js?v=20261006b";
import { изменениеСклада } from "../db.js?v=20261006b";
import { сверитьЛист, строкаПересчёта } from "../stockcount.js?v=20261006b";
import { exportStockCountSheet, exportCountDiff } from "../xlsx-export.js?v=20261006b";
import { parseRows, pickFile } from "../xlsx-import.js?v=20261006b";
import { подписьКода } from "../catalogcode.js?v=20261006b";

const знак = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100);
const ПАЧКА = 150;                 // товаров в одном запросе на запись

function плитка(подпись, значение, вид = "") {
  const цвет = вид === "warn" ? "var(--danger)" : (вид === "ok" ? "var(--ok)" : "");
  return el("div.card", { style: { padding: "10px 14px", minWidth: "118px" } }, [
    el("div.muted", { style: { fontSize: "12px" }, text: подпись }),
    el("div", { style: { fontWeight: "800", fontSize: "20px", color: цвет || "inherit" }, text: String(значение) }),
  ]);
}

export function пересчётПоExcel(page, ctx, products) {
  let итог = null;                 // что дала сверка загруженного листа

  const карточка = el("div.card", { style: { padding: "16px", marginBottom: "16px" } });
  карточка.append(
    el("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" } }, [
      el("span", { style: { display: "flex", color: "var(--accent)" } }, [icon("box", { size: 18 })]),
      el("div", { style: { fontWeight: "700", fontSize: "16px" }, text: "Пересчёт склада через Excel" }),
    ]),
    el("div.muted", { style: { fontSize: "13px", marginBottom: "12px" },
      text: "Выгрузите лист, обойдите полки и впишите в колонку «Факт на полке» то, что лежит. Пустые клетки склад не тронет — считать можно частями." }),
  );

  const кнВыгрузить = el("button.btn.btn-outline", {}, [icon("download", { size: 16 }), "Выгрузить лист (" + products.length + " товаров)"]);
  const кнЗагрузить = el("button.btn.btn-primary", {}, [icon("upload", { size: 16 }), "Загрузить заполненный лист"]);
  карточка.append(el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" } }, [кнВыгрузить, кнЗагрузить]));

  const тело = el("div");
  карточка.append(тело);
  page.append(карточка);

  кнВыгрузить.addEventListener("click", async () => {
    кнВыгрузить.disabled = true;
    showLoader("Готовим лист…");
    try {
      const сколько = await exportStockCountSheet(products);
      toast("Лист готов: " + сколько + " товаров, раздел за разделом", "ok");
    } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
    finally { hideLoader(); кнВыгрузить.disabled = false; }
  });

  кнЗагрузить.addEventListener("click", () => pickFile(async (file) => {
    showLoader("Читаем лист…");
    try {
      const строки = await parseRows(file, "count");
      if (!строки.length) throw new Error("В файле не нашлось строк. Нужны колонки «Товар» и «Факт на полке».");
      итог = сверитьЛист(строки, products);
      нарисовать();
    } catch (e) { toast("Не удалось прочитать: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }));

  function нарисовать() {
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
      text: "Прибавится " + знак(вверх) + " шт, спишется " + знак(вниз) + " шт по " + расхождения.length + " товарам." }));

    const кнЛист = el("button.btn.btn-outline", {
      onclick: () => exportCountDiff(расхождения).catch(e => toast("Не удалось: " + (e.message || e), "err")),
    }, [icon("download", { size: 16 }), "Скачать расхождения"]);
    const кнПрименить = el("button.btn.btn-primary", {}, [icon("check", { size: 16 }), "Применить к складу"]);
    кнПрименить.addEventListener("click", () => применить(кнПрименить, расхождения));
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

  async function применить(кнопка, расхождения) {
    // Окно подтверждения переносы строк не показывает, поэтому коротко:
    // подробная таблица «было → стало» и так перед глазами, выше.
    const штук = расхождения.reduce((s, r) => s + Math.abs(r.разница), 0);
    confirmDialog(
      "Подвинуть склад по " + расхождения.length + " товарам (всего " + Math.round(штук) + " шт)? "
      + "Остальные товары не изменятся, каждая правка попадёт в историю остатков.",
      async () => {
        кнопка.disabled = true;
        showLoader("Записываем пересчёт…");
        // Причина для журнала — своя, чтобы в истории было видно, что число
        // пришло из пересчёта, а не из накладной.
        изменениеСклада("Пересчёт склада (лист Excel от " + new Date().toLocaleDateString("ru-RU") + ")");
        const строки = расхождения.map(r => строкаПересчёта(r.p, r.факт)).filter(Boolean);
        let записано = 0; const плохо = [];
        try {
          for (let i = 0; i < строки.length; i += ПАЧКА) {
            const часть = строки.slice(i, i + ПАЧКА);
            showLoader("Записываем пересчёт… " + Math.min(i + часть.length, строки.length) + " из " + строки.length);
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
        if (плохо.length) toast("Записано " + записано + ", не прошло " + плохо.length + " — проверьте связь и загрузите лист снова", "err");
        else toast("Пересчёт записан: " + записано + " товаров", "ok");
        ctx.refresh();
      });
  }
}
