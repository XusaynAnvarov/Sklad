// Отчёт мини-приложения: только ОБОРОТЫ, без прибыли.
// Подробная аналитика с правилами прибыли живёт в складе на сайте — здесь
// приложение для случая «ноутбука нет под рукой», дублировать её незачем.
// Обороты считаем по фактическим ценам позиций и сводим в сумы.
import { el } from "../app.js?v=20260820a";
import { matchPeriod, buildPeriodOptions } from "../../period.js?v=20260820a";
import { byMethod, methodLabel } from "../../payment.js?v=20260820a";
import { isShop } from "../../purchase.js?v=20260820a";
import { curStr, convert } from "../../fx.js?v=20260820a";

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
  const [products, sales, payments, purchases] = await Promise.all([
    ctx.db.products.list(), ctx.db.sales.list(),
    ctx.db.payments.list(), ctx.db.purchases.list().catch(() => []),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));

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

    body.append(el("div.mini-nums", {}, [
      el("div.mini-num", {}, [el("div.l", { text: "Оборот" }), el("div.v", { text: som(turnover) })]),
      el("div.mini-num", {}, [el("div.l", { text: "Продано" }), el("div.v", { text: pieces + " шт" })]),
      el("div.mini-num", {}, [el("div.l", { text: "Накладных" }), el("div.v", { text: String(fSales.length) })]),
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
