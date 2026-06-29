// ========================================================================
//  КОРЗИНА — удалённые товары/клиенты/накладные/приходы/оплаты.
//  Удаление сначала кладёт копию сюда → можно восстановить или стереть навсегда.
// ========================================================================
import { el, toast, confirmDialog, showLoader, hideLoader } from "../ui.js";
import { icon } from "../icons.js";

const ENTITY_RU = { products: "Товар", customers: "Клиент", sales: "Накладная", purchases: "Приход", payments: "Оплата" };

function labelOf(it) {
  const d = it.data || {};
  if (it.entity === "products" || it.entity === "customers") return d.name || "—";
  if (it.entity === "sales") { const sum = (d.items || []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0); return "Накладная " + (d.date ? new Date(d.date).toLocaleDateString("ru-RU") : "") + (sum ? " · " + Math.round(sum).toLocaleString("ru-RU") : ""); }
  if (it.entity === "purchases") return "Приход " + (d.date ? new Date(d.date).toLocaleDateString("ru-RU") : "");
  if (it.entity === "payments") return "Оплата " + (Number(d.amount) || 0).toLocaleString("ru-RU") + " " + (d.currency || "");
  return d.name || d.id || "—";
}

export default async function renderTrash(page, ctx) {
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Корзина" }), el("div.sub", { text: "Удалённое можно вернуть. «Навсегда» — стирает без возврата." })])]));

  let items = [];
  showLoader();
  try { items = await ctx.db.trash.list(); } catch (e) { hideLoader(); page.append(el("div.empty", {}, [el("p", { text: "Корзина недоступна (нужна таблица trash в базе): " + (e.message || e) })])); return; }
  hideLoader();
  items = (Array.isArray(items) ? items : []).sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0));

  if (!items.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("trash", { size: 40 })]), el("p", { text: "Корзина пуста" })])); return; }

  const tb = el("tbody");
  items.forEach(it => {
    tb.append(el("tr", {}, [
      el("td", {}, [el("span.badge", { text: ENTITY_RU[it.entity] || it.entity })]),
      el("td", {}, [el("strong", { text: labelOf(it) })]),
      el("td", { text: it.deleted_at ? new Date(it.deleted_at).toLocaleString("ru-RU") : "—" }),
      el("td.right", {}, [el("div.row-actions", {}, [
        el("button.btn.btn-ok.btn-sm", { onclick: async () => {
          showLoader("Восстановление…");
          try { await ctx.db.trash.restore(it); toast("Восстановлено", "ok"); ctx.refresh(); }
          catch (e) { toast("Не удалось: " + (e.message || e), "err"); } finally { hideLoader(); }
        } }, [icon("undo", { size: 15 }), "Вернуть"]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить навсегда", onclick: () => confirmDialog("Стереть навсегда? Восстановить будет нельзя.", async () => {
          try { await ctx.db.trash.purge(it.id); toast("Удалено навсегда", "ok"); ctx.refresh(); } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
        }) }, [icon("trash", { size: 15 })]),
      ])]),
    ]));
  });
  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["Тип", "Что", "Когда удалено", ""].map(h => el("th", { text: h })))]),
    tb,
  ])]));
}
