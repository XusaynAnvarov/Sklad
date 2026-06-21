// ========================================================================
//  СТРАНИЦА «ЗАКАЗЫ» — новые заказы из Telegram-бота (status='order').
//  Владелец открывает заказ → проставляет цены/убирает позиции →
//  «Подтвердить и отправить клиенту» (в редакторе продажи).
// ========================================================================
import { el, toast, confirmDialog } from "../ui.js";
import { icon } from "../icons.js";
import { openEditor } from "./sales.js";
import { placeholder } from "./products.js";

export default async function render(page, ctx) {
  const [sales, customers, products] = await Promise.all([
    ctx.db.sales.list(), ctx.db.customers.list(), ctx.db.products.list(),
  ]);
  const orders = sales.filter(s => ["order", "pending_confirm", "confirmed"].includes(s.status)).sort((a, b) => new Date(b.date) - new Date(a.date));
  const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  // в меню считаем только требующие действий (новые + подтверждённые клиентом)
  ctx.setNavBadge && ctx.setNavBadge("orders", orders.filter(o => o.status !== "pending_confirm").length);

  const ordBadge = (st) =>
    st === "confirmed" ? el("span.badge.ok", {}, [icon("check", { size: 13 }), "клиент подтвердил"])
    : st === "pending_confirm" ? el("span.badge.transit", {}, [icon("clock", { size: 13 }), "ждём подтверждения"])
    : el("span.badge.order", {}, [icon("alert", { size: 13 }), "новый заказ"]);

  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Заказы из бота" }), el("div.sub", { text: `Новых: ${orders.length}` })]),
  ]));

  if (!orders.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("cart", { size: 40 })]), el("p", { text: "Новых заказов нет" })])); return; }

  page.append(el("div.hint", { text: "Откройте заказ → проставьте цены → «📤 На подтверждение клиенту». Когда клиент подтвердит (✅), оформите: «✅ Оформить (склад + PDF)»." }));

  const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" } });
  orders.forEach(s => {
    const linked = !!s.customer_id;
    const fromName = linked ? (cmap[s.customer_id] || "Клиент") : ((s.order_from && s.order_from.name) || "Гость");
    const items = s.items || [];
    const preview = items.slice(0, 6).map(it => (pmap[it.product_id]?.name || "?") + " ×" + it.qty).join(", ") + (items.length > 6 ? " …" : "");
    const card = el("div.card.reveal", {
      style: { cursor: "pointer", borderColor: "rgba(124,92,255,.5)", background: "rgba(124,92,255,.06)" },
      onclick: () => openEditor(ctx, s, customers, products, s.customer_id),
    }, [
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, [
        el("div", {}, [
          el("div", { style: { fontWeight: "800", fontSize: "16px" } }, [
            icon("user", { size: 17 }), " " + fromName + "  ",
            linked ? el("span.badge.cur", { text: "клиент" }) : el("span.badge.order", { text: "не привязан" }),
          ]),
          el("div.muted", { style: { fontSize: "13px", marginTop: "2px" }, text: new Date(s.date).toLocaleString("ru-RU") + " · " + items.length + " поз." }),
          (!linked && s.order_from && s.order_from.username) ? el("div.muted", { style: { fontSize: "12px" }, text: "@" + s.order_from.username }) : null,
        ]),
        ordBadge(s.status),
      ]),
      el("div", { style: { marginTop: "8px", fontSize: "13px", color: "var(--muted)" }, text: preview }),
      el("div", { style: { marginTop: "10px", display: "flex", gap: "8px" } }, [
        el("button.btn.btn-primary.btn-sm", { text: "Открыть и оформить →", onclick: (e) => { e.stopPropagation(); openEditor(ctx, s, customers, products, s.customer_id); } }),
        el("button.btn.btn-danger.btn-sm", { onclick: (e) => { e.stopPropagation(); confirmDialog("Удалить этот заказ? Он исчезнет из списка.", async () => { await ctx.db.sales.remove(s.id); ctx.setNavBadge && ctx.setNavBadge("orders", Math.max(0, orders.length - 1)); toast("Заказ удалён", "ok"); ctx.refresh(); }); } }, [icon("trash", { size: 15 }), "Удалить заказ"]),
      ]),
    ]);
    wrap.append(card);
  });
  page.append(wrap);
  requestAnimationFrame(() => page.querySelectorAll(".reveal").forEach((n, i) => setTimeout(() => n.classList.add("in"), i * 40)));
}
