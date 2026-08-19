// Главная: три числа, ради которых чаще всего заходят, и крупные действия.
import { el, go } from "../app.js?v=20260819c";
import { icon } from "../../icons.js?v=20260819c";
import { matchPeriod } from "../../period.js?v=20260819c";
import { loadRules, aggregate } from "../../profit.js?v=20260819c";
import { curStr } from "../../fx.js?v=20260819c";

const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("ru-RU");

export default async function render(box, ctx) {
  const [products, sales, customers, payments, settings] = await Promise.all([
    ctx.db.products.list(), ctx.db.sales.list(), ctx.db.customers.list(),
    ctx.db.payments.list(), ctx.db.getSettings().catch(() => ({})),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const rules = loadRules(settings);
  let pct = (settings && settings.profit_pct) || null;
  if (!pct) { try { pct = JSON.parse(localStorage.getItem("sklad_profit_pct") || "null"); } catch { } }

  const fSales = sales.filter(s => matchPeriod(s.date, "this_month"));
  const agg = aggregate(fSales, pmap, rules, pct || {});

  // долг клиентов = продано минус оплачено, по всем валютам
  const debt = { som: 0, usd: 0, yuan: 0 };
  sales.filter(s => s.status === "final").forEach(s => {
    (s.items || []).forEach(it => {
      const c = it.currency || s.currency;
      if (debt[c] !== undefined) debt[c] += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    });
  });
  payments.forEach(p => { const c = p.currency; if (debt[c] !== undefined) debt[c] -= Number(p.amount) || 0; });
  Object.keys(debt).forEach(k => { if (debt[k] < 0) debt[k] = 0; });

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
    act("chart", "Отчёт", "что продаётся", "report"),
    act("tag", "Наклейки", "QR для сканера", "labels"),
  ]));

  // сколько товаров требует внимания — цифра, а не украшение
  const low = products.filter(p => (Number(p.stock_qty) || 0) <= 5 && (Number(p.stock_qty) || 0) > 0).length;
  const neg = products.filter(p => (Number(p.stock_qty) || 0) < 0).length;
  if (low || neg) {
    box.append(el("div.mini-sec", { text: "Требует внимания" }));
    box.append(el("div.mini-list", {}, [
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
