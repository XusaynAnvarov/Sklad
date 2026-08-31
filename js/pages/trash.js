// ========================================================================
//  КОРЗИНА — удалённые товары/клиенты/накладные/приходы/оплаты.
//  Удаление сначала кладёт копию сюда → можно посмотреть, восстановить или стереть.
// ========================================================================
import { el, toast, confirmDialog, modal, showLoader, hideLoader } from "../ui.js?v=20260831a";
import { fmt } from "../fx.js?v=20260831a";
import { icon } from "../icons.js?v=20260831a";

const ENTITY_RU = { products: "Товар", customers: "Клиент", sales: "Накладная", purchases: "Приход", payments: "Оплата" };

function labelOf(it) {
  const d = it.data || {};
  if (it.entity === "products" || it.entity === "customers") return d.name || "—";
  if (it.entity === "sales") { const sum = (d.items || []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0); return "Накладная " + (d.date ? new Date(d.date).toLocaleDateString("ru-RU") : "") + (sum ? " · " + Math.round(sum).toLocaleString("ru-RU") : ""); }
  if (it.entity === "purchases") return "Приход " + (d.date ? new Date(d.date).toLocaleDateString("ru-RU") : "");
  if (it.entity === "payments") return "Оплата " + (Number(d.amount) || 0).toLocaleString("ru-RU") + " " + (d.currency || "");
  return d.name || d.id || "—";
}

// Просмотр содержимого удалённой записи (для накладной/прихода — таблица товаров)
function viewItem(it, pmap, cmap) {
  const d = it.data || {};
  if (it.entity === "sales" || it.entity === "purchases") {
    const isPurch = it.entity === "purchases";
    const rows = (d.items || []).map((i, n) => {
      const p = pmap[i.product_id] || {};
      const qty = Number(i.qty) || 0;
      const price = isPurch ? (Number(i.unit_cost) || 0) : (Number(i.unit_price) || 0);
      const cur = i.currency || d.currency || "som";
      return el("tr", {}, [
        el("td", { text: n + 1 }),
        el("td", {}, [el("strong", { text: p.name || i.product_id || "?" })]),
        el("td", { text: qty }),
        el("td", { text: fmt(price, cur) }),
        el("td", {}, [el("strong", { text: fmt(qty * price, cur) })]),
      ]);
    });
    const meta = "Дата: " + (d.date ? new Date(d.date).toLocaleDateString("ru-RU") : "—")
      + (d.customer_id ? " · Клиент: " + (cmap[d.customer_id] || "—") : "")
      + " · Позиций: " + (d.items || []).length;
    modal({
      title: labelOf(it), wide: true,
      body: el("div", {}, [
        el("div.hint", { text: meta }),
        el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
          el("thead", {}, [el("tr", {}, ["#", "Товар", "Кол-во", "Цена", "Сумма"].map(h => el("th", { text: h })))]),
          el("tbody", {}, rows.length ? rows : [el("tr", {}, [el("td", { text: "Позиций нет" })])]),
        ])]),
      ]),
      actions: [{ label: "Закрыть", kind: "btn-outline", onClick: c => c() }],
    });
    return;
  }
  // прочее (товар/клиент/оплата) — ключевые поля
  const lines = [];
  if (d.name) lines.push(["Название", d.name]);
  if (d.category) lines.push(["Категория", d.category]);
  if (d.contact) lines.push(["Контакт", d.contact]);
  if (Array.isArray(d.phones) && d.phones.length) lines.push(["Телефоны", d.phones.join(", ")]);
  if (d.amount != null) lines.push(["Сумма", fmt(d.amount, d.currency || "som")]);
  if (d.date) lines.push(["Дата", new Date(d.date).toLocaleDateString("ru-RU")]);
  if (d.customer_id && cmap[d.customer_id]) lines.push(["Клиент", cmap[d.customer_id]]);
  modal({
    title: labelOf(it),
    body: el("div", {}, lines.length ? lines.map(([k, v]) => el("div", { style: { padding: "5px 0", borderBottom: "1px solid var(--border)" } }, [el("span.muted", { text: k + ": " }), el("strong", { text: String(v) })])) : [el("p", { text: "Нет данных для показа" })]),
    actions: [{ label: "Закрыть", kind: "btn-outline", onClick: c => c() }],
  });
}

export default async function renderTrash(page, ctx) {
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Корзина" }), el("div.sub", { text: "Нажмите на строку, чтобы посмотреть содержимое. «Вернуть» — восстановить, «Навсегда» — стереть." })])]));

  let items = [], products = [], customers = [];
  showLoader();
  try {
    [items, products, customers] = await Promise.all([
      ctx.db.trash.list(),
      ctx.db.products.list().catch(() => []),
      ctx.db.customers.list().catch(() => []),
    ]);
  } catch (e) { hideLoader(); page.append(el("div.empty", {}, [el("p", { text: "Корзина недоступна (нужна таблица trash в базе): " + (e.message || e) })])); return; }
  hideLoader();
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const cmap = Object.fromEntries((customers || []).map(c => [c.id, c.name]));
  items = (Array.isArray(items) ? items : []).sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0));

  if (!items.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("trash", { size: 40 })]), el("p", { text: "Корзина пуста" })])); return; }

  const tb = el("tbody");
  items.forEach(it => {
    tb.append(el("tr", { style: { cursor: "pointer" }, title: "Посмотреть содержимое",
      onclick: (e) => { if (e.target.closest("button")) return; viewItem(it, pmap, cmap); } }, [
      el("td", {}, [el("span.badge", { text: ENTITY_RU[it.entity] || it.entity })]),
      el("td", {}, [el("strong", { text: labelOf(it) }), " ", el("span.muted", { text: "▾", style: { fontSize: "11px" } })]),
      el("td", { text: it.deleted_at ? new Date(it.deleted_at).toLocaleString("ru-RU") : "—" }),
      el("td.right", {}, [el("div.row-actions", {}, [
        el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Посмотреть", onclick: () => viewItem(it, pmap, cmap) }, [icon("search", { size: 15 })]),
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
