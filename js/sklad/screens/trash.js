// Корзина: удалённые товары, клиенты, накладные, приходы и оплаты.
// Раз с телефона разрешено удалять — здесь всё это можно вернуть.
// Удаление сначала кладёт копию сюда, поэтому промах пальцем не стоит данных.
import { el } from "../app.js?v=20260822a";
import { toast, confirmDialog, modal } from "../../ui.js?v=20260822a";
import { fmt } from "../../fx.js?v=20260822a";

const ТИП = { products: "Товар", customers: "Клиент", sales: "Накладная", purchases: "Приход", payments: "Оплата" };
const когда = (d) => { const t = new Date(d); return isFinite(t) ? t.toLocaleString("ru-RU") : "—"; };

function имя(it) {
  const d = it.data || {};
  if (it.entity === "products" || it.entity === "customers") return d.name || "—";
  if (it.entity === "sales") {
    const сумма = (d.items || []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0);
    return "Накладная от " + (d.date ? new Date(d.date).toLocaleDateString("ru-RU") : "—")
      + (сумма ? " · " + Math.round(сумма).toLocaleString("ru-RU") : "");
  }
  if (it.entity === "purchases") return "Приход " + (d.supplier || "") + " от " + (d.date ? new Date(d.date).toLocaleDateString("ru-RU") : "—");
  if (it.entity === "payments") return "Оплата " + fmt(Number(d.amount) || 0, d.currency || "som");
  return d.name || d.id || "—";
}

export default async function render(box, ctx) {
  let items = [], products = [], customers = [];
  try {
    [items, products, customers] = await Promise.all([
      ctx.db.trash.list(),
      ctx.db.products.list().catch(() => []),
      ctx.db.customers.list().catch(() => []),
    ]);
  } catch (e) {
    box.append(el("div.mini-empty", { text: "Корзина недоступна: " + (e.message || e) }));
    return;
  }
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const cmap = Object.fromEntries((customers || []).map(c => [c.id, c.name]));

  let список = (Array.isArray(items) ? items : [])
    .sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0));

  const list = el("div.mini-list");
  box.append(el("div.hint", { style: { marginBottom: "10px" },
    text: "Нажмите на строку, чтобы посмотреть, что внутри, и вернуть." }), list);

  function draw() {
    list.innerHTML = "";
    if (!список.length) { list.append(el("div.mini-empty", { text: "Корзина пуста" })); return; }
    список.slice(0, 100).forEach(it => {
      list.append(el("div.mini-row", { onclick: () => открыть(it) }, [
        el("div.info", {}, [
          el("div.nm", { text: имя(it) }),
          el("div.sku", { text: (ТИП[it.entity] || it.entity) + " · удалено " + когда(it.deleted_at) }),
        ]),
        el("div.qty", { text: "вернуть" }),
      ]));
    });
    if (список.length > 100) list.append(el("div.hint", { text: "Показаны последние 100." }));
  }

  function содержимое(it) {
    const d = it.data || {};
    if (it.entity === "sales" || it.entity === "purchases") {
      const приход = it.entity === "purchases";
      const строки = (d.items || []).map(i => {
        const p = pmap[i.product_id] || {};
        const qty = Number(i.qty) || 0;
        const цена = приход ? (Number(i.unit_cost) || 0) : (Number(i.unit_price) || 0);
        const cur = i.currency || d.currency || "som";
        return el("div.mini-row", {}, [
          el("div.info", {}, [
            el("div.nm", { text: p.name || i.product_id || "?" }),
            el("div.sku", { text: qty + " × " + fmt(цена, cur) }),
          ]),
          el("div.qty", { text: fmt(qty * цена, cur) }),
        ]);
      });
      return el("div", {}, [
        el("div.sku", { style: { marginBottom: "8px" },
          text: (d.customer_id && cmap[d.customer_id] ? "Клиент: " + cmap[d.customer_id] + " · " : "")
            + "позиций: " + (d.items || []).length }),
        строки.length ? el("div.mini-list", {}, строки) : el("div.mini-empty", { text: "Позиций нет" }),
      ]);
    }
    const поля = [];
    if (d.name) поля.push(["Название", d.name]);
    if (d.category) поля.push(["Категория", d.category]);
    if (d.sku) поля.push(["Артикул", d.sku]);
    if (d.contact) поля.push(["Контакт", d.contact]);
    if (d.stock_qty != null) поля.push(["Остаток был", String(d.stock_qty)]);
    if (d.amount != null) поля.push(["Сумма", fmt(d.amount, d.currency || "som")]);
    if (d.date) поля.push(["Дата", new Date(d.date).toLocaleDateString("ru-RU")]);
    if (d.customer_id && cmap[d.customer_id]) поля.push(["Клиент", cmap[d.customer_id]]);
    if (!поля.length) return el("div.mini-empty", { text: "Показывать нечего" });
    return el("div.mini-list", {}, поля.map(([k, v]) => el("div.mini-row", {}, [
      el("div.info", {}, [el("div.sku", { text: k }), el("div.nm", { text: String(v) })]),
    ])));
  }

  function открыть(it) {
    modal({
      title: имя(it),
      body: el("div", {}, [
        el("div.sku", { style: { marginBottom: "10px" }, text: (ТИП[it.entity] || it.entity) + " · удалено " + когда(it.deleted_at) }),
        содержимое(it),
        it.entity === "sales" ? el("div.hint", { style: { marginTop: "10px" },
          text: "Возврат накладной вернёт долг клиента. Товар на склад НЕ спишется заново — он вернулся туда при удалении." }) : null,
      ].filter(Boolean)),
      actions: [
        { label: "Закрыть", kind: "btn-outline", onClick: c => c() },
        { label: "Стереть навсегда", kind: "btn-outline", onClick: (close) => {
          confirmDialog("Стереть навсегда? Вернуть будет нельзя.", async () => {
            try {
              await ctx.db.trash.purge(it.id);
              список = список.filter(x => x.id !== it.id);
              close(); draw();
              toast("Стёрто навсегда", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          });
        } },
        { label: "Вернуть", kind: "btn-primary", onClick: (close) => {
          confirmDialog("Вернуть «" + имя(it) + "»?", async () => {
            try {
              await ctx.db.trash.restore(it);
              список = список.filter(x => x.id !== it.id);
              close(); draw();
              toast("Восстановлено", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          });
        } },
      ],
    });
  }

  draw();
}
