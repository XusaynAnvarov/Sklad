// ========================================================================
//  ИСТОРИЯ ИЗМЕНЕНИЙ ОСТАТКОВ — раздел внутри «Проверки склада».
//
//  Отвечает на вопрос, на который склад раньше ответить не мог: откуда
//  взялись эти штуки, когда и почему. Журнал ведёт сервер при каждой
//  записи остатка (api/lib/stocklog.js).
//
//  Здесь же остаток можно исправить: вписать, сколько лежит на полке, —
//  по одному товару или сразу по нескольким. Ничего не удаляется: правка
//  остатка это такое же движение склада и тоже попадает в журнал.
// ========================================================================
import { el, toast, input, confirmDialog, showLoader, hideLoader } from "../ui.js?v=20261010h";
import { icon } from "../icons.js?v=20261010h";
import { authHeaders, изменениеСклада } from "../db.js?v=20261010h";
import { setStock } from "../sklad/stock.js?v=20261010h";
import { подписьКода } from "../catalogcode.js?v=20261010h";

const когда = (d) => {
  const t = new Date(d);
  if (!isFinite(t)) return "—";
  return t.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const знак = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100);

export function историяОстатков(page, ctx, products) {
  const pmap = Object.fromEntries((products || []).map(p => [String(p.id), p]));

  const карточка = el("div.card", { style: { padding: "16px", marginBottom: "16px" } });
  // Раздел сворачивается: на «Проверке склада» он не главный, а журнал за
  // 7 дней — это сотни строк. Открывается по щелчку, и выбор запоминается.
  const стрелка = el("span.muted", { style: { marginLeft: "auto", fontSize: "13px" }, text: "▾" });
  const шапка = el("div", {
    style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap", cursor: "pointer", userSelect: "none" },
    title: "Показать или скрыть историю",
  }, [
    el("span", { style: { display: "flex", color: "var(--accent)" } }, [icon("clock", { size: 18 })]),
    el("div", { style: { fontWeight: "700", fontSize: "16px" }, text: "История изменений остатков" }),
    стрелка,
  ]);
  const пояснение = el("div.muted", { style: { fontSize: "13px", marginBottom: "10px" },
    text: "Видно, у какого товара остаток менялся, на сколько и почему. Здесь же можно вписать настоящее количество с полки." });

  // ---- период ----
  let дней = 7, сДаты = "", поДату = "", толькоРост = false;
  const кнопкиПериода = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" } });
  const сПоле = input({ type: "date", style: { maxWidth: "165px" } });
  const поПоле = input({ type: "date", style: { maxWidth: "165px" } });
  const свой = el("div", { style: { display: "none", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "8px" } }, [
    el("span.muted", { style: { fontSize: "13px" }, text: "с" }), сПоле,
    el("span.muted", { style: { fontSize: "13px" }, text: "по" }), поПоле,
    el("button.btn.btn-outline.btn-sm", { text: "Показать", onclick: () => { сДаты = сПоле.value; поДату = поПоле.value; дней = 0; загрузить(); } }),
  ]);
  [[7, "7 дней"], [30, "30 дней"], [90, "90 дней"], [0, "Свой период"]].forEach(([n, подпись]) => {
    кнопкиПериода.append(el("button.btn.btn-sm" + (n === дней ? ".btn-primary" : ".btn-outline"), {
      text: подпись, "data-days": String(n),
      onclick: () => {
        дней = n; сДаты = ""; поДату = "";
        свой.style.display = n === 0 ? "flex" : "none";
        [...кнопкиПериода.children].forEach(b => {
          const свой_ли = Number(b.getAttribute("data-days")) === n;
          b.className = "btn btn-sm " + (свой_ли ? "btn-primary" : "btn-outline");
        });
        if (n) загрузить();
      },
    }));
  });
  const фильтрРоста = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", marginBottom: "8px" } }, [
    el("input", { type: "checkbox", onchange: (e) => { толькоРост = e.target.checked; нарисовать(); } }),
    el("span", { text: "только те, где остаток вырос" }),
  ]);

  const тело = el("div");
  const низ = el("div", { style: { marginTop: "10px" } });
  const содержимое = el("div", {}, [пояснение, кнопкиПериода, свой, фильтрРоста, тело, низ]);
  карточка.append(шапка, содержимое);
  page.append(карточка);

  // Открыто или свёрнуто — помним между заходами.
  const КЛЮЧ = "gm:история-остатков:открыта";
  let открыта = false;
  try { открыта = localStorage.getItem(КЛЮЧ) === "1"; } catch { }
  let читали = false;
  const показать = (да) => {
    открыта = да;
    содержимое.style.display = да ? "" : "none";
    стрелка.textContent = да ? "▾" : "▸";
    try { localStorage.setItem(КЛЮЧ, да ? "1" : "0"); } catch { }
    // Журнал тянем только когда раздел открыли: страница грузится быстрее.
    if (да && !читали) { читали = true; загрузить(); }
  };
  шапка.addEventListener("click", () => показать(!открыта));

  // ---- данные ----
  let записи = [];
  const правки = new Map();       // товар → сколько вписали

  async function загрузить() {
    тело.replaceChildren(el("div.muted", { text: "Читаю историю…" }));
    низ.replaceChildren();
    const адрес = "/api/admin/stock-log?" + (дней ? `дней=${дней}` : `с=${encodeURIComponent(сДаты)}&по=${encodeURIComponent(поДату)}`) + "&сколько=1000";
    try {
      const r = await fetch(адрес, { headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Ошибка " + r.status);
      if (!d.ведётся) {
        тело.replaceChildren(el("div.card", { style: { padding: "12px", borderColor: "rgba(245,158,11,.4)" } }, [
          el("div", { style: { fontWeight: "700", marginBottom: "4px" }, text: "История пока не ведётся" }),
          el("div.muted", { style: { fontSize: "13px" }, text: d.подсказка || "Выполните db/stock-log-migration.sql в Supabase — после этого каждое изменение остатка будет записываться: было, стало, когда и почему." }),
          el("div.muted", { style: { fontSize: "13px", marginTop: "6px" }, text: "Прошлые изменения восстановить неоткуда: раньше склад хранил только нынешний остаток." }),
        ]));
        return;
      }
      записи = d.изменения || [];
      нарисовать();
    } catch (e) {
      тело.replaceChildren(el("div.muted", { text: "Не удалось прочитать историю: " + (e.message || e) }));
    }
  }

  function нарисовать() {
    правки.clear();
    const список = толькоРост ? записи.filter(z => Number(z.diff) > 0) : записи;
    тело.replaceChildren();
    низ.replaceChildren();
    if (!список.length) {
      тело.append(el("div.muted", { style: { padding: "8px 0" }, text: записи.length ? "За этот период остаток нигде не вырос." : "За этот период изменений не было." }));
      return;
    }

    const строки = el("tbody");
    for (const z of список) {
      const p = pmap[String(z.product_id)];
      const поле = input({ type: "number", placeholder: "факт", style: { width: "90px" } });
      poleWatch(поле, z.product_id);
      строки.append(el("tr", {}, [
        el("td", {}, [
          el("div", { style: { fontWeight: "600" }, text: (p && p.name) || z.name || "товар удалён" }),
          el("div.muted", { style: { fontSize: "11px" }, text: (p && подписьКода(p)) || "" }),
        ]),
        el("td.right", { text: z.before_qty === null ? "—" : String(z.before_qty) }),
        el("td.right", {}, [el("b", { style: { color: Number(z.diff) > 0 ? "var(--ok)" : "var(--danger)" }, text: z.diff === null ? "—" : знак(Number(z.diff)) })]),
        el("td.right", { text: z.after_qty === null ? "—" : String(z.after_qty) }),
        el("td", { text: когда(z.created_at) }),
        el("td", { text: z.reason || "—" }),
        el("td", {}, [p ? поле : el("span.muted", { text: "—" })]),
      ]));
    }
    тело.append(el("div", { style: { overflowX: "auto" } }, [
      el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, ["Товар", "Было", "Изменение", "Стало", "Когда", "Причина", "Факт на полке"].map(h => el("th", { text: h })))]),
        строки,
      ]),
    ]));

    const счёт = el("span.muted", { style: { fontSize: "13px" }, text: `Записей: ${список.length}` });
    const кнопка = el("button.btn.btn-primary", { text: "Исправить остатки", disabled: "disabled" });
    кнопка.addEventListener("click", () => исправить(кнопка));
    низ.append(el("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } }, [кнопка, счёт]));

    function poleWatch(поле, id) {
      поле.addEventListener("input", () => {
        const v = поле.value.trim();
        if (v === "") правки.delete(String(id)); else правки.set(String(id), Number(v));
        кнопка.disabled = правки.size === 0;
        кнопка.textContent = правки.size ? `Исправить остатки: ${правки.size}` : "Исправить остатки";
      });
    }
  }

  async function исправить(кнопка) {
    const список = [...правки.entries()].filter(([, v]) => Number.isFinite(v));
    if (!список.length) return;
    const текст = список.slice(0, 8).map(([id, v]) => `• ${(pmap[id] || {}).name || id}: ${(pmap[id] || {}).stock_qty ?? "?"} → ${v}`).join("\n");
    confirmDialog(`Поставить настоящий остаток ${список.length} товарам?\n\n${текст}${список.length > 8 ? "\n…" : ""}`, async () => {
      кнопка.disabled = true;
      showLoader("Исправляем…");
      изменениеСклада("Проверка склада: исправление остатка");
      const плохо = [];
      for (const [id, want] of список) {
        try { await setStock(ctx.db, id, want); }
        catch (e) { плохо.push(((pmap[id] || {}).name || id) + ": " + (e.message || e)); }
      }
      hideLoader();
      if (плохо.length) { toast("Не удалось: " + плохо.length, "err"); console.warn("[проверка склада]", плохо); }
      else toast(`Остатки исправлены: ${список.length}`, "ok");
      ctx.refresh();
    });
  }

  показать(открыта);
}
