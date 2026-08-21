// Главная: три числа, ради которых чаще всего заходят, и крупные действия.
import { el, go } from "../app.js?v=20260821c";
import { icon } from "../../icons.js?v=20260821c";
import { matchPeriod } from "../../period.js?v=20260821c";
import { loadRules, aggregate } from "../../profit.js?v=20260821c";
import { curStr } from "../../fx.js?v=20260821c";
import { toast } from "../../ui.js?v=20260821c";
import { debtByCur, onlyPositive } from "../../debt.js?v=20260821c";
import { findProblems } from "../../stockcheck.js?v=20260821c";

const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("ru-RU");

export default async function render(box, ctx) {
  const [products, sales, customers, payments, settings, purchases] = await Promise.all([
    ctx.db.products.list(), ctx.db.sales.list(), ctx.db.customers.list(),
    ctx.db.payments.list(), ctx.db.getSettings().catch(() => ({})),
    ctx.db.purchases.list().catch(() => []),
  ]);

  // Итоги дня приходят в бот — чтобы посмотреть их, не открывая приложение.
  // Считает и отправляет сервер: там же лежит вечерняя автоотправка.
  const dayReport = () => {
    const b = el("button.mini-act.wide", {}, [
      icon("send", { size: 22 }),
      el("div", {}, [el("div", { text: "Отчёт за сегодня" }), el("div.sub", { text: "пришлём в бот" })]),
    ]);
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const r = await fetch("/api/admin/day-report", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem("sklad_admin_token") || "") },
          body: JSON.stringify({}),
        });
        if (r.ok) toast("Итоги дня отправлены в бот", "ok");
        else { const j = await r.json().catch(() => ({})); toast(j.error || "Не удалось отправить", "err"); }
      } catch (e) { toast("Нет связи с сервером", "err"); }
      finally { b.disabled = false; }
    });
    return b;
  };
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const rules = loadRules(settings);
  let pct = (settings && settings.profit_pct) || null;
  if (!pct) { try { pct = JSON.parse(localStorage.getItem("sklad_profit_pct") || "null"); } catch { } }

  const fSales = sales.filter(s => matchPeriod(s.date, "this_month"));
  const agg = aggregate(fSales, pmap, rules, pct || {});

  // Долг — общим расчётом (js/debt.js), тем же, что на странице клиента и
  // на сайте. Здесь была своя копия, и она забывала старый долг клиентов.
  const salesOf = {}, paysOf = {};
  sales.forEach(s => { if (s.customer_id) (salesOf[s.customer_id] = salesOf[s.customer_id] || []).push(s); });
  payments.forEach(p => { if (p.customer_id) (paysOf[p.customer_id] = paysOf[p.customer_id] || []).push(p); });
  const debt = { som: 0, usd: 0, yuan: 0 };
  customers.forEach(c => {
    const d = onlyPositive(debtByCur(salesOf[c.id] || [], paysOf[c.id] || [], c));
    ["som", "usd", "yuan"].forEach(k => { debt[k] += d[k]; });
  });

  box.append(el("div.mini-nums", {}, [
    el("div.mini-num", {}, [el("div.l", { text: "Выручка" }), el("div.v", { text: usd(agg.total.rev) })]),
    el("div.mini-num.good", {}, [el("div.l", { text: "Прибыль" }), el("div.v", { text: usd(agg.total.profit) })]),
    el("div.mini-num.warn", {}, [el("div.l", { text: "Долг" }), el("div.v", { text: curStr(debt) })]),
  ]));

  const act = (ic, label, sub, to, wide) => el("button.mini-act" + (wide ? ".wide" : ""), { onclick: () => go(to) }, [
    icon(ic, { size: 22 }),
    el("div", {}, [el("div", { text: label }), sub ? el("div.sub", { text: sub }) : null].filter(Boolean)),
  ]);

  box.append(el("div.mini-acts", {}, [
    act("cart", "Продажа", "клиенту или быстро", "sale"),
    act("box", "Товары", products.length + " позиций", "products"),
    act("chart", "Отчёт", "обороты и прибыль", "report"),
    act("truck", "Приход", "из магазина и из Китая", "purchases"),
    act("receipt", "Документы", "накладные, оплаты", "docs"),
    act("tag", "Наклейки", "QR для сканера", "labels"),
    dayReport(),
  ]));

  // Что требует внимания — цифрой, а не украшением. Нажатие ведёт туда,
  // где это чинится: смысл экрана в том, чтобы не искать разделы вручную.
  const low = products.filter(p => (Number(p.stock_qty) || 0) <= 5 && (Number(p.stock_qty) || 0) > 0).length;
  const neg = products.filter(p => (Number(p.stock_qty) || 0) < 0).length;
  const заказы = sales.filter(s => ["order", "pending_confirm", "confirmed"].includes(s.status)).length;
  const вДороге = (purchases || []).filter(s => s.status !== "arrived").length;
  const расхождения = findProblems(products, sales).total;

  const строка = (cls, имя, подпись, число, куда) => el("div.mini-row" + cls, { onclick: () => go(куда) }, [
    el("div.info", {}, [el("div.nm", { text: имя }), el("div.sku", { text: подпись })]),
    el("div.qty" + cls, { text: String(число) }),
  ]);

  if (low || neg || заказы || вДороге || расхождения) {
    box.append(el("div.mini-sec", { text: "Требует внимания" }));
    box.append(el("div.mini-list", {}, [
      заказы ? строка(".low", "Заказы ждут", "оформить и выдать", заказы, "orders") : null,
      расхождения ? строка(".low", "Расхождения на складе", "остатки не сходятся", расхождения, "check") : null,
      вДороге ? строка(".low", "В дороге", "приход ещё не оприходован", вДороге, "purchases") : null,
      neg ? el("div.mini-row.neg", { onclick: () => go("products", { f: "neg" }) }, [
        el("div.info", {}, [el("div.nm", { text: "Ушли в минус" }), el("div.sku", { text: "продано больше, чем было" })]),
        el("div.qty.neg", { text: String(neg) }),
      ]) : null,
      low ? el("div.mini-row.low", { onclick: () => go("products", { f: "low" }) }, [
        el("div.info", {}, [el("div.nm", { text: "Заканчиваются" }), el("div.sku", { text: "остаток 5 и меньше" })]),
        el("div.qty.low", { text: String(low) }),
      ]) : null,
    ].filter(Boolean)));
  }
}
