// ========================================================================
//  ОКНО «ВОЗВРАТ ОТ КЛИЕНТА» — склад на компьютере.
//
//  Две дороги в одном окне:
//    1. «Из его покупок» — список того, что клиент брал, с полем
//       «сколько вернул». Видно, сколько ещё можно вернуть: дважды одно и
//       то же не вернётся.
//    2. «Суммой» — для старого товара, которого в списке нет: вписывается
//       сумма, и по желанию выбирается товар, чтобы он вернулся на склад.
//
//  Что происходит при сохранении (js/refund.js):
//    • товар возвращается на склад теми же партиями;
//    • записывается накладная-возврат (количества с минусом);
//    • долг клиента уменьшается сам, а если вернули больше долга —
//      появляется «Аванс: мы должны клиенту». Следующая выдача товара
//      этот аванс съедает.
// ========================================================================
import { el, toast, modal, input, select, field, showLoader, hideLoader } from "../ui.js?v=20261027c";
import { icon } from "../icons.js?v=20261027c";
import { fmt, CUR } from "../fx.js?v=20261027c";
import { покупки, составить, подписьВозврата, выплаты } from "../refund.js?v=20261027c";
import { подходит } from "../productsearch.js?v=20261027c";
import { изменениеСклада } from "../db.js?v=20261027c";
import { подписьКода } from "../catalogcode.js?v=20261027c";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function openRefund(ctx, клиент, sales, products) {
  const список = покупки(sales, клиент.id, products);
  const выбрано = new Map();          // product_id → { qty, цена, валюта, cogs… }

  // ---------- вкладки ----------
  let режим = список.length ? "покупки" : "сумма";
  const вкладки = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" } });
  const тело = el("div");
  const итогСтрока = el("div", { style: { fontWeight: "700", fontSize: "15px", marginTop: "10px" } });

  // Чем рассчитались с клиентом. По умолчанию — в счёт долга: так возврат
  // уменьшает его долг, а если долга нет, мы остаёмся должны ему. Если
  // деньги отданы на руки — ставим вторую отметку, иначе клиент навсегда
  // останется «авансом», хотя расчёт уже закрыт.
  const деньгамиГалка = el("input", { type: "checkbox" });
  const деньгамиПоле = el("label", {
    style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", cursor: "pointer", fontSize: "14px" },
  }, [деньгамиГалка, el("span", { text: "Вернули деньгами (отдали наличные/перевод)" })]);
  const деньгамиПодсказка = el("div.hint", { style: { marginTop: "4px" },
    text: "Без отметки возврат уменьшит долг клиента, а если долга нет — мы останемся должны ему. С отметкой расчёт закрывается: в оплатах появится строка «Возврат денег»." });

  const кнопкаВкладки = (ид, текст) => el("button.btn.btn-sm" + (режим === ид ? ".btn-primary" : ".btn-outline"), {
    text: текст,
    onclick: () => { режим = ид; нарисовать(); },
  });

  // ---------- вкладка 1: из покупок ----------
  function списокПокупок() {
    if (!список.length) {
      return el("div.empty", { style: { padding: "20px" } }, [
        el("p", { text: "У этого клиента ещё нет выданных накладных — возвращать нечего. Воспользуйтесь вкладкой «Суммой»." }),
      ]);
    }
    // Сколько всего у него куплено — чтобы было видно, что список полный
    const всегоШтук = список.reduce((s, п) => s + п.куплено, 0);
    const вернулось = список.reduce((s, п) => s + п.возвращено, 0);
    const шапкаСписка = el("div.muted", { style: { fontSize: "13px", marginBottom: "8px" },
      text: "Клиент купил " + список.length + " наименований, всего " + всегоШтук + " шт"
        + (вернулось ? " · уже вернул " + вернулось + " шт" : "") });

    // Поиск с лупой и кнопкой «очистить»: у постоянных клиентов список
    // на полсотни позиций, и листать его пальцем — долго.
    const поиск = input({ type: "search", placeholder: "Поиск: название, артикул или код…",
      style: { flex: "1", minHeight: "42px", fontSize: "15px" } });
    const очистить = el("button.btn.btn-outline.btn-sm", { title: "Очистить поиск", onclick: () => { поиск.value = ""; нарисоватьСтроки(); поиск.focus(); } }, [icon("x", { size: 15 })]);
    const строкаПоиска = el("div", { style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px" } }, [
      el("span", { style: { display: "flex", color: "var(--muted)" } }, [icon("search", { size: 18 })]),
      поиск, очистить,
    ]);
    const счётНайденных = el("div.muted", { style: { fontSize: "12px", marginBottom: "6px" } });
    const строки = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", maxHeight: "44vh", overflowY: "auto" } });

    const нарисоватьСтроки = () => {
      const q = поиск.value.trim().toLowerCase();
      строки.innerHTML = "";
      const видимые = список.filter(п => !q || подходит(п.товар || { name: п.name }, q));
      счётНайденных.textContent = q
        ? "Найдено: " + видимые.length + " из " + список.length
        : (выбрано.size ? "Выбрано к возврату: " + выбрано.size : "");
      if (!видимые.length) { строки.append(el("div.muted", { style: { padding: "8px" }, text: "Ничего не найдено — проверьте название или вкладку «Суммой»" })); return; }

      видимые.forEach(п => {
        const уже = выбрано.get(п.product_id);
        const поле = input({
          type: "number", min: "0", step: "1", placeholder: "0",
          value: уже ? String(уже.qty) : "",
          style: { width: "92px", textAlign: "center" },
        });
        поле.addEventListener("input", () => {
          const v = Number(поле.value) || 0;
          if (v <= 0) { выбрано.delete(п.product_id); }
          else {
            if (v > п.осталось) { поле.value = String(п.осталось); toast("Больше, чем покупал: можно вернуть " + п.осталось, "err"); }
            выбрано.set(п.product_id, {
              product_id: п.product_id, name: п.name,
              qty: Number(поле.value) || 0, unit_price: п.цена, currency: п.валюта,
              cogs_yuan: п.cogs_yuan, cogs_usd: п.cogs_usd,
            });
          }
          обновитьИтог();
          счётНайденных.textContent = поиск.value.trim()
            ? счётНайденных.textContent
            : (выбрано.size ? "Выбрано к возврату: " + выбрано.size : "");
        });
        строки.append(el("div.card", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px" } }, [
          el("div", { style: { flex: "1 1 200px", minWidth: "0" } }, [
            el("div", { style: { fontWeight: "600" }, text: п.name }),
            el("div.muted", { style: { fontSize: "11px" },
              text: (подписьКода(п.товар || {}) ? подписьКода(п.товар) + " · " : "")
                + "куплено " + п.куплено + " шт"
                + (п.возвращено ? " · уже вернул " + п.возвращено : "")
                + " · по " + fmt(п.цена, п.валюта)
                + " · " + new Date(п.когда).toLocaleDateString("ru-RU") }),
          ]),
          el("div", { style: { textAlign: "right", minWidth: "86px" } }, [
            el("div.muted", { style: { fontSize: "11px" }, text: "можно вернуть" }),
            el("div", { style: { fontWeight: "700" }, text: String(п.осталось) }),
          ]),
          поле,
        ]));
      });
    };
    поиск.addEventListener("input", нарисоватьСтроки);
    нарисоватьСтроки();
    // Курсор сразу в поиске: чаще всего нужный товар ищут, а не листают.
    setTimeout(() => { try { поиск.focus(); } catch { } }, 50);
    return el("div", {}, [шапкаСписка, строкаПоиска, счётНайденных, строки]);
  }

  // ---------- вкладка 2: суммой ----------
  const fСумма = input({ type: "number", step: "0.01", placeholder: "Сколько возвращаем" });
  const fВалюта = select(Object.values(CUR).map(x => ({ value: x.code, label: x.label })), "som");
  const fПричина = input({ placeholder: "За что возврат (необязательно)" });
  const fТовар = input({ type: "search", placeholder: "Товар на склад (необязательно): название, артикул или код" });
  const fКол = input({ type: "number", min: "0", step: "1", placeholder: "Сколько штук" });
  const найденный = el("div", { style: { fontSize: "12px", marginTop: "4px" } });
  let товарНаСклад = null;

  fТовар.addEventListener("input", () => {
    const q = fТовар.value.trim().toLowerCase();
    найденный.innerHTML = "";
    товарНаСклад = null;
    if (q.length < 2) return;
    (products || []).filter(p => подходит(p, q)).slice(0, 5).forEach(p => {
      найденный.append(el("div.card", {
        style: { padding: "6px 8px", marginTop: "4px", cursor: "pointer" },
        onclick: () => {
          товарНаСклад = p;
          fТовар.value = p.name;
          найденный.innerHTML = "";
          найденный.append(el("div", { style: { color: "var(--ok)" }, text: "На склад вернётся: " + p.name }));
        },
      }, [el("div", { text: p.name }), el("div.muted", { style: { fontSize: "11px" }, text: "остаток " + (Number(p.stock_qty) || 0) })]));
    });
  });

  function формаСуммой() {
    return el("div", {}, [
      el("div.row2", {}, [field("Сумма возврата", fСумма), field("Валюта", fВалюта)]),
      field("За что", fПричина),
      el("div.hint", { style: { marginBottom: "8px" },
        text: "Долг клиента уменьшится на эту сумму. Если долга нет — склад покажет «Аванс: мы должны клиенту», и при следующей выдаче товара он спишется сам." }),
      el("div.section-h", { text: "Вернуть товар на склад (необязательно)" }),
      el("div.row2", {}, [field("Товар", fТовар), field("Количество", fКол)]),
      найденный,
      el("div.hint", { text: "Если товара на складе больше нет или он не нужен — оставьте пустым: вернутся только деньги." }),
    ]);
  }

  // ---------- итог ----------
  function собратьПозиции() {
    if (режим === "покупки") return [...выбрано.values()].filter(п => п.qty > 0);
    const сумма = Number(fСумма.value) || 0;
    if (сумма <= 0) return [];
    const кол = Number(fКол.value) || 0;
    // Товар выбрали — возвращаем его, а цену ставим так, чтобы итог был
    // ровно вписанной суммой: владелец думает деньгами, а не ценой за штуку.
    if (товарНаСклад && кол > 0) {
      return [{
        product_id: товарНаСклад.id, name: товарНаСклад.name,
        qty: кол, unit_price: r2(сумма / кол), currency: fВалюта.value,
        cogs_yuan: Number(товарНаСклад.cost_yuan) || 0, cogs_usd: Number(товарНаСклад.cost_usd) || 0,
      }];
    }
    return [{ product_id: null, name: fПричина.value.trim() || "Возврат деньгами", qty: 1, unit_price: сумма, currency: fВалюта.value }];
  }

  function обновитьИтог() {
    const { сумма } = составить({ customer_id: клиент.id, позиции: собратьПозиции(), товары: products });
    const части = [];
    ["som", "yuan", "usd"].forEach(c => { if (сумма[c]) части.push(fmt(сумма[c], c)); });
    итогСтрока.textContent = части.length ? "Долг уменьшится на: " + части.join(" + ") : "Ничего не выбрано";
  }
  [fСумма, fКол].forEach(поле => поле.addEventListener("input", обновитьИтог));
  fВалюта.addEventListener && fВалюта.addEventListener("change", обновитьИтог);

  function нарисовать() {
    вкладки.innerHTML = "";
    вкладки.append(кнопкаВкладки("покупки", "Из его покупок"), кнопкаВкладки("сумма", "Суммой"));
    тело.innerHTML = "";
    тело.append(режим === "покупки" ? списокПокупок() : формаСуммой());
    обновитьИтог();
  }
  нарисовать();

  modal({
    title: "Возврат — " + клиент.name,
    wide: true,
    body: el("div", {}, [вкладки, тело, итогСтрока, деньгамиПоле, деньгамиПодсказка]),
    actions: [
      { label: "Отмена", kind: "btn-outline", onClick: x => x() },
      {
        label: "Принять возврат", kind: "btn-primary", onClick: async (close) => {
          const позиции = собратьПозиции();
          if (!позиции.length) { toast("Укажите, что возвращаем", "err"); return; }

          const { накладная, строки, сумма, ошибки } = составить({
            customer_id: клиент.id, позиции, товары: products,
            причина: режим === "сумма" ? fПричина.value.trim() : "",
          });
          if (ошибки.length) { toast(ошибки[0], "err"); return; }

          showLoader("Принимаем возврат…");
          try {
            // Сначала склад, потом накладная: если запись склада сорвётся,
            // возврат не будет записан наполовину.
            изменениеСклада("Возврат от клиента: " + клиент.name);
            if (строки.length) {
              try { await ctx.db.products.upsertMany(строки); }
              catch { for (const r of строки) { try { await ctx.db.products.upsert(r); } catch { await ctx.db.products.upsert((({ batches, ...x }) => x)(r)); } } }
            }
            await ctx.db.sales.upsert(накладная);

            // Отдали деньги на руки — записываем выплату (оплата с минусом),
            // иначе клиент остался бы «авансом» при закрытом расчёте.
            if (деньгамиГалка.checked) {
              const строкиВыплат = выплаты({
                customer_id: клиент.id, сумма, дата: накладная.date,
                комментарий: режим === "сумма" ? fПричина.value.trim() : "",
              });
              for (const в of строкиВыплат) {
                try { await ctx.db.payments.upsert(в); }
                catch { const { method, ...без } = в; await ctx.db.payments.upsert(без); }
              }
            }

            hideLoader();
            toast(подписьВозврата(накладная, сумма) + (деньгамиГалка.checked ? " — принят, деньги возвращены" : " — принят"), "ok");
            close();
            ctx.refresh();
          } catch (e) {
            hideLoader();
            toast("Не удалось: " + (e.message || e), "err");
          }
        },
      },
    ],
  });
}
