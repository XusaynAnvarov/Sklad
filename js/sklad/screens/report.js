// Отчёт: обороты, прибыль и долги — числами.
// Диаграммы и разбор по категориям остались на сайте: на телефоне они
// мелкие и нечитаемые, а цифра нужна одна и сразу.
// Обороты считаем по фактическим ценам позиций и сводим в сумы.
// Прибыль считает общий js/profit.js — тот же, что в отчётах сайта.
import { el } from "../app.js?v=20260822b";
import { matchPeriod, buildPeriodOptions } from "../../period.js?v=20260822b";
import { byMethod, methodLabel } from "../../payment.js?v=20260822b";
import { isShop } from "../../purchase.js?v=20260822b";
import { curStr, convert } from "../../fx.js?v=20260822b";
import { loadRules, aggregate } from "../../profit.js?v=20260822b";
import { debtByCur, onlyPositive } from "../../debt.js?v=20260822b";

const som = (n) => Math.round(Number(n) || 0).toLocaleString("ru-RU") + " сум";

// Оборот одной продажи в сумах: доллары и юани переводим по курсу,
// чтобы в колонке было одно понятное число.
export function saleSom(s) {
  return (s.items || []).reduce((t, it) => {
    const qty = Number(it.qty) || 0, price = Number(it.unit_price) || 0;
    const cur = it.currency || s.currency || "som";
    return t + (cur === "som" ? qty * price : convert(qty * price, cur, "som"));
  }, 0);
}
export const isQuick = (s) => s.source === "quick" || !s.customer_id;

export default async function render(box, ctx) {
  const [products, sales, payments, purchases, customers, settings] = await Promise.all([
    ctx.db.products.list(), ctx.db.sales.list(),
    ctx.db.payments.list(), ctx.db.purchases.list().catch(() => []),
    ctx.db.customers.list().catch(() => []), ctx.db.getSettings().catch(() => ({})),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));

  // Правила прибыли настроены на сайте — берём их как есть, чтобы цифра
  // в телефоне и на компьютере была одна и та же.
  const rules = loadRules(settings);
  let pct = (settings && settings.profit_pct) || null;
  if (!pct) { try { pct = JSON.parse(localStorage.getItem("sklad_profit_pct") || "null"); } catch { } }

  // Долг клиентов — на весь срок, а не за период: это не оборот, это
  // сколько людям сейчас за нами числится.
  const salesOf = {}, paysOf = {};
  sales.forEach(s => { if (s.customer_id) (salesOf[s.customer_id] = salesOf[s.customer_id] || []).push(s); });
  payments.forEach(p => { if (p.customer_id) (paysOf[p.customer_id] = paysOf[p.customer_id] || []).push(p); });
  const долг = { som: 0, usd: 0, yuan: 0 };
  (customers || []).forEach(c => {
    const d = onlyPositive(debtByCur(salesOf[c.id] || [], paysOf[c.id] || [], c));
    ["som", "usd", "yuan"].forEach(k => { долг[k] += d[k]; });
  });

  let period = "this_month";
  const opts = buildPeriodOptions(sales, payments);
  const sel = el("select.inp", { style: { width: "100%", minHeight: "44px", fontSize: "16px", marginBottom: "12px" } });
  opts.forEach(o => sel.append(el("option", { value: o.value, text: o.label })));
  sel.value = period;
  const body = el("div");
  sel.addEventListener("change", () => { period = sel.value; draw(); });
  box.append(sel, body);

  function draw() {
    body.innerHTML = "";
    const fSales = sales.filter(s => s.status === "final" && matchPeriod(s.date, period));
    const fPays = payments.filter(p => matchPeriod(p.date, period));

    // ---------- главные числа ----------
    let turnover = 0, pieces = 0, quickSom = 0, clientSom = 0, quickN = 0, clientN = 0;
    fSales.forEach(s => {
      const v = saleSom(s);
      turnover += v;
      (s.items || []).forEach(it => { pieces += Number(it.qty) || 0; });
      if (isQuick(s)) { quickSom += v; quickN++; } else { clientSom += v; clientN++; }
    });

    const итог = aggregate(fSales, pmap, rules, pct || {});
    const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("ru-RU");

    body.append(el("div.mini-nums", {}, [
      el("div.mini-num", {}, [el("div.l", { text: "Оборот" }), el("div.v", { text: som(turnover) })]),
      el("div.mini-num", {}, [el("div.l", { text: "Продано" }), el("div.v", { text: pieces + " шт" })]),
      el("div.mini-num", {}, [el("div.l", { text: "Накладных" }), el("div.v", { text: String(fSales.length) })]),
    ]));
    body.append(el("div.mini-nums", {}, [
      el("div.mini-num.good", {}, [el("div.l", { text: "Прибыль" }), el("div.v", { text: usd(итог.total.profit) })]),
      el("div.mini-num", {}, [el("div.l", { text: "Выручка $" }), el("div.v", { text: usd(итог.total.rev) })]),
      el("div.mini-num.warn", {}, [el("div.l", { text: "Долг клиентов" }), el("div.v", { text: curStr(долг) })]),
    ]));

    // ---------- две группы продаж ----------
    body.append(el("div.mini-sec", { text: "Откуда оборот" }));
    const groups = el("div.mini-list");
    groups.append(el("div.mini-row", {}, [
      el("div.info", {}, [
        el("div.nm", { text: "Быстрые продажи" }),
        el("div.sku", { text: quickN + " накладных · за наличные" }),
      ]),
      el("div.qty", { text: som(quickSom) }),
    ]));
    groups.append(el("div.mini-row", {}, [
      el("div.info", {}, [
        el("div.nm", { text: "Продажи клиентам" }),
        el("div.sku", { text: clientN + " накладных" }),
      ]),
      el("div.qty", { text: som(clientSom) }),
    ]));
    body.append(groups);

    // ---------- откуда пришли деньги ----------
    const mRows = Object.entries(byMethod(fPays));
    if (mRows.length) {
      body.append(el("div.mini-sec", { text: "Откуда пришли деньги" }));
      const list = el("div.mini-list");
      mRows.forEach(([m, a]) => list.append(el("div.mini-row", {}, [
        el("div.info", {}, [
          el("div.nm", { text: methodLabel(m) }),
          el("div.sku", { text: a.count + " оплат" }),
        ]),
        el("div.qty", { text: curStr(a) }),
      ])));
      body.append(list);
    }

    // ---------- приход из магазинов ----------
    const shopArr = (purchases || []).filter(p => isShop(p) && p.status === "arrived" && matchPeriod(p.date, period));
    if (shopArr.length) {
      const byShop = {}, lines = [];
      shopArr.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
        const shop = p.supplier || "—";
        const b = byShop[shop] || (byShop[shop] = { qty: 0, times: 0 });
        b.times++;
        (p.items || []).forEach(it => {
          const q = Number(it.qty) || 0;
          b.qty += q;
          lines.push({ date: p.date, shop, name: (pmap[it.product_id] || {}).name || "—", qty: q });
        });
      });
      body.append(el("div.mini-sec", { text: "Приход из магазинов" }));
      const sum = el("div.mini-list");
      Object.entries(byShop).sort((a, b) => b[1].qty - a[1].qty).forEach(([shop, b]) => {
        sum.append(el("div.mini-row", {}, [
          el("div.info", {}, [el("div.nm", { text: shop }), el("div.sku", { text: b.times + " поступлений" })]),
          el("div.qty", { text: b.qty + " шт" }),
        ]));
      });
      body.append(sum);
      const det = el("div.mini-list", { style: { marginTop: "8px" } });
      lines.forEach(l => det.append(el("div.mini-row", {}, [
        el("div.info", {}, [
          el("div.nm", { text: l.name }),
          el("div.sku", { text: new Date(l.date).toLocaleDateString("ru-RU") + " · " + l.shop }),
        ]),
        el("div.qty", { text: "+" + l.qty }),
      ])));
      body.append(det);
    }

    // ---------- что продавалось ----------
    const byProd = {};
    fSales.forEach(s => (s.items || []).forEach(it => {
      const id = it.product_id; if (!id) return;
      const a = byProd[id] = byProd[id] || { qty: 0, som: 0 };
      const qty = Number(it.qty) || 0, price = Number(it.unit_price) || 0;
      const cur = it.currency || s.currency || "som";
      a.qty += qty;
      a.som += cur === "som" ? qty * price : convert(qty * price, cur, "som");
    }));
    const rows = Object.entries(byProd)
      .map(([id, a]) => ({ name: (pmap[id] || {}).name || "—", sku: (pmap[id] || {}).sku || "", ...a }))
      .sort((a, b) => b.som - a.som || b.qty - a.qty);

    if (!rows.length) { body.append(el("div.mini-empty", { text: "За этот период продаж не было" })); return; }

    body.append(el("div.mini-sec", { text: "Что продавалось — " + rows.length + " товаров" }));
    const list = el("div.mini-list");
    // показываем ВСЕ товары: обрезка списка прятала часть продаж
    rows.forEach((r, i) => list.append(el("div.mini-row", {}, [
      el("div.qty", { style: { color: i < 3 ? "var(--accent)" : "var(--muted)", minWidth: "26px" }, text: String(i + 1) }),
      el("div.info", {}, [
        el("div.nm", { text: r.name }),
        el("div.sku", { text: r.qty + " шт" + (r.sku ? " · Арт.: " + r.sku : "") }),
      ]),
      el("div.qty", { text: som(r.som) }),
    ])));
    body.append(list);
  }

  draw();
}
