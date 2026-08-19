// Отчёт: что продаётся лучше всего, полный список и сколько денег пришло.
import { el } from "../app.js?v=20260819g";
import { icon } from "../../icons.js?v=20260819g";
import { matchPeriod, buildPeriodOptions } from "../../period.js?v=20260819g";
import { loadRules, aggregate } from "../../profit.js?v=20260819g";
import { byMethod, methodLabel } from "../../payment.js?v=20260819g";
import { isShop } from "../../purchase.js?v=20260819g";
import { curStr, convert } from "../../fx.js?v=20260819g";

const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("ru-RU");

export default async function render(box, ctx) {
  const [products, sales, payments, settings, purchases] = await Promise.all([
    ctx.db.products.list(), ctx.db.sales.list(),
    ctx.db.payments.list(), ctx.db.getSettings().catch(() => ({})),
    ctx.db.purchases.list().catch(() => []),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const rules = loadRules(settings);
  let pct = (settings && settings.profit_pct) || null;
  if (!pct) { try { pct = JSON.parse(localStorage.getItem("sklad_profit_pct") || "null"); } catch { } }
  pct = pct || {};

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
    const fSales = sales.filter(s => matchPeriod(s.date, period));
    const fPays = payments.filter(p => matchPeriod(p.date, period));
    const agg = aggregate(fSales, pmap, rules, pct);

    // ---------- три числа ----------
    const paid = { som: 0, usd: 0, yuan: 0 };
    fPays.forEach(p => { const c = p.currency; if (paid[c] !== undefined) paid[c] += Number(p.amount) || 0; });
    body.append(el("div.mini-nums", {}, [
      el("div.mini-num", {}, [el("div.l", { text: "Выручка" }), el("div.v", { text: usd(agg.total.rev) })]),
      el("div.mini-num.good", {}, [el("div.l", { text: "Прибыль" }), el("div.v", { text: usd(agg.total.profit) })]),
      el("div.mini-num", {}, [el("div.l", { text: "Пришло денег" }), el("div.v", { text: curStr(paid) })]),
    ]));

    // ---------- сколько денег пришло, по способам ----------
    const methods = byMethod(fPays);
    const mRows = Object.entries(methods);
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

    // ---------- что продавалось: по штукам, сверху лучшие ----------
    const byProd = {};
    fSales.forEach(s => (s.items || []).forEach(it => {
      const id = it.product_id; if (!id) return;
      const a = byProd[id] = byProd[id] || { qty: 0, som: 0 };
      const qty = Number(it.qty) || 0;
      const price = Number(it.unit_price) || 0;
      const cur = it.currency || s.currency || "som";
      a.qty += qty;
      // оборот в сумах: доллары и юани переводим по курсу, чтобы в колонке
      // было одно понятное число, а не три разных валюты
      a.som += cur === "som" ? qty * price : convert(qty * price, cur, "som");
    }));

    const rows = Object.entries(byProd)
      .map(([id, a]) => ({ id, name: (pmap[id] || {}).name || "—", sku: (pmap[id] || {}).sku || "", ...a }))
      .sort((a, b) => b.som - a.som || b.qty - a.qty);

    if (!rows.length) {
      body.append(el("div.mini-empty", { text: "За этот период продаж не было" }));
      return;
    }

    // ---------- ПРИХОД ИЗ МАГАЗИНОВ ----------
    // Что и от кого приехало за период. Считаем так же, как отчёт склада
    // на сайте, чтобы цифры совпадали.
    const shopArr = (purchases || []).filter(p => isShop(p) && p.status === "arrived" && matchPeriod(p.date, period));
    if (shopArr.length) {
      const byShop = {}, lines2 = [];
      shopArr.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
        const shop = p.supplier || "—";
        const b = byShop[shop] || (byShop[shop] = { qty: 0, times: 0 });
        b.times++;
        (p.items || []).forEach(it => {
          const q = Number(it.qty) || 0;
          b.qty += q;
          lines2.push({ date: p.date, shop, name: (pmap[it.product_id] || {}).name || "—", qty: q });
        });
      });
      body.append(el("div.mini-sec", { text: "Приход из магазинов" }));
      const sum = el("div.mini-list");
      Object.entries(byShop).sort((a, b) => b[1].qty - a[1].qty).forEach(([shop, b]) => {
        sum.append(el("div.mini-row", {}, [
          el("div.info", {}, [
            el("div.nm", { text: shop }),
            el("div.sku", { text: b.times + " поступлений" }),
          ]),
          el("div.qty", { text: b.qty + " шт" }),
        ]));
      });
      body.append(sum);
      const det = el("div.mini-list", { style: { marginTop: "8px" } });
      lines2.slice(0, 40).forEach(l => det.append(el("div.mini-row", {}, [
        el("div.info", {}, [
          el("div.nm", { text: l.name }),
          el("div.sku", { text: new Date(l.date).toLocaleDateString("ru-RU") + " · " + l.shop }),
        ]),
        el("div.qty", { text: "+" + l.qty }),
      ])));
      body.append(det);
    }

    body.append(el("div.mini-sec", { text: "Что продавалось — " + rows.length + " товаров" }));
    const list = el("div.mini-list");
    let shown = 0;
    const PAGE = 25;
    const more = el("div");

    function chunk() {
      rows.slice(shown, shown + PAGE).forEach((r, i) => {
        const place = shown + i + 1;
        list.append(el("div.mini-row", {}, [
          el("div.qty", { style: { color: place <= 3 ? "var(--accent)" : "var(--muted)", minWidth: "26px" }, text: String(place) }),
          el("div.info", {}, [
            el("div.nm", { text: r.name }),
            el("div.sku", { text: r.qty + " шт" + (r.sku ? " · Арт.: " + r.sku : "") }),
          ]),
          el("div.qty", { text: Math.round(r.som).toLocaleString("ru-RU") + " сум" }),
        ]));
      });
      shown += Math.min(PAGE, rows.length - shown);
      more.innerHTML = "";
      if (shown < rows.length) {
        more.append(el("button.btn.btn-outline", {
          style: { width: "100%", marginTop: "10px", minHeight: "44px", justifyContent: "center" },
          text: "Показать ещё (" + (rows.length - shown) + ")",
          onclick: chunk,
        }));
      }
    }
    chunk();
    body.append(list, more);
  }

  draw();
}
