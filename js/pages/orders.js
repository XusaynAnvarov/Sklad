// ========================================================================
//  СТРАНИЦА «ЗАКАЗЫ» — новые заказы из бота и с сайта (status='order').
//  Разделены по вкладкам: «С сайта» | «Из бота» | «Подтверждённые».
// ========================================================================
import { el, toast, confirmDialog } from "../ui.js?v=20260815a";
import { icon } from "../icons.js?v=20260815a";
import { openEditor, deleteSale } from "./sales.js?v=20260815a";

export default async function render(page, ctx) {
  const [sales, customers, products] = await Promise.all([
    ctx.db.sales.list(), ctx.db.customers.list(), ctx.db.products.list(),
  ]);
  const active = sales.filter(s => ["order", "pending_confirm", "confirmed"].includes(s.status)).sort((a, b) => new Date(b.date) - new Date(a.date));
  const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  ctx.setNavBadge && ctx.setNavBadge("orders", active.filter(o => o.status !== "pending_confirm").length);

  const fromSite = active.filter(s => s.source === "site");
  const fromBot  = active.filter(s => s.source === "bot" || !s.source);
  const confirmed = active.filter(s => s.status === "confirmed");

  const ordBadge = (s) => {
    if (s.status === "confirmed") return el("span.badge.ok", {}, [icon("check", { size: 13 }), "клиент подтвердил"]);
    if (s.status === "pending_confirm") return el("span.badge.transit", {}, [icon("clock", { size: 13 }), "ждём подтверждения"]);
    const src = s.source === "site" ? "с сайта" : "из бота";
    return el("span.badge.order", {}, [icon("alert", { size: 13 }), "новый · " + src]);
  };

  page.append(el("div.topbar", {}, [
    el("div", {}, [
      el("h1", { text: "Заказы" }),
      el("div.sub", { text: `С сайта: ${fromSite.length} · Из бота: ${fromBot.length} · Подтверждённые: ${confirmed.length}` }),
    ]),
  ]));

  page.append(el("div.hint", { text: "Откройте заказ → проставьте цены → «На подтверждение клиенту». Когда клиент подтвердит, оформите: «Оформить (склад + PDF)»." }));

  // вкладки
  const TABS = [
    { id: "site",   label: "С сайта",         items: fromSite, badge: fromSite.filter(o => o.status !== "pending_confirm").length },
    { id: "bot",    label: "Из бота",          items: fromBot,  badge: fromBot.filter(o => o.status !== "pending_confirm").length },
    { id: "conf",   label: "Подтверждённые",   items: confirmed, badge: confirmed.length },
  ];
  let activeTab = "site";
  if (!fromSite.length && fromBot.length) activeTab = "bot";
  if (!fromSite.length && !fromBot.length && confirmed.length) activeTab = "conf";

  const tabBar = el("div", { style: { display: "flex", gap: "6px", margin: "14px 0 10px" } });
  const tabContent = el("div");
  page.append(tabBar, tabContent);

  function renderTabs() {
    tabBar.innerHTML = "";
    TABS.forEach(t => {
      const btn = el("button.btn.btn-outline.btn-sm", {}, [
        t.label + " ",
        t.badge > 0 ? el("span.badge.order", { text: String(t.badge), style: { marginLeft: "4px" } }) : null,
      ]);
      if (t.id === activeTab) btn.classList.add("active");
      btn.addEventListener("click", () => { activeTab = t.id; renderTabs(); renderList(); });
      tabBar.append(btn);
    });
  }

  function renderList() {
    tabContent.innerHTML = "";
    const tab = TABS.find(t => t.id === activeTab);
    if (!tab || !tab.items.length) {
      tabContent.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("cart", { size: 40 })]), el("p", { text: "Заказов нет" })]));
      return;
    }
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } });
    tab.items.forEach(s => {
      const linked = !!s.customer_id;
      const fromName = linked ? (cmap[s.customer_id] || "Клиент") : ((s.order_from && s.order_from.name) || "Гость");
      const items = s.items || [];
      const preview = items.slice(0, 6).map(it => (pmap[it.product_id]?.name || "?") + " ×" + it.qty).join(", ") + (items.length > 6 ? " …" : "");
      const srcBadge = s.source === "site"
        ? el("span.badge.cur", { text: "с сайта" })
        : el("span.badge.transit", { text: "бот" });
      const card = el("div.card.reveal", {
        style: { cursor: "pointer" },
        onclick: () => openEditor(ctx, s, customers, products, s.customer_id),
      }, [
        el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, [
          el("div", {}, [
            el("div", { style: { fontWeight: "800", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } }, [
              icon("user", { size: 17 }), " " + fromName + "  ",
              linked ? el("span.badge.ok", { text: "клиент" }) : el("span.badge.order", { text: "не привязан" }),
              srcBadge,
            ]),
            el("div.muted", { style: { fontSize: "13px", marginTop: "2px" }, text: new Date(s.date).toLocaleString("ru-RU") + " · " + items.length + " поз." }),
            (!linked && s.order_from && s.order_from.phone) ? el("div.muted", { style: { fontSize: "12px" }, text: "тел: " + s.order_from.phone }) : null,
          ]),
          ordBadge(s),
        ]),
        el("div", { style: { marginTop: "8px", fontSize: "13px", color: "var(--muted)" }, text: preview }),
        el("div", { style: { marginTop: "10px", display: "flex", gap: "8px" } }, [
          el("button.btn.btn-primary.btn-sm", { text: "Открыть и оформить →", onclick: (e) => { e.stopPropagation(); openEditor(ctx, s, customers, products, s.customer_id); } }),
          el("button.btn.btn-danger.btn-sm", { onclick: (e) => { e.stopPropagation(); confirmDialog("Удалить этот заказ?", () => deleteSale(ctx, s, products)); } }, [icon("trash", { size: 15 }), "Удалить"]),
        ]),
      ]);
      wrap.append(card);
    });
    tabContent.append(wrap);
    requestAnimationFrame(() => tabContent.querySelectorAll(".reveal").forEach((n, i) => setTimeout(() => n.classList.add("in"), i * 40)));
  }

  renderTabs();
  renderList();
}
