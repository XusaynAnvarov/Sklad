// ========================================================================
//  ОТЧЁТЫ: топ товаров, топ клиентов (повторные покупки), долги/оборот
// ========================================================================
import { el, modal, select } from "../ui.js";
import { fmt, sumByCur, curStr, toUSD } from "../fx.js";

const isPaid = (s) => (s.items || []).length > 0 && s.items.every(i => i.paid);

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const SEASONS = [["winter", "Зима"], ["spring", "Весна"], ["summer", "Лето"], ["autumn", "Осень"]];

// проверка даты на выбранный период: all | this_month | last_month | y:YYYY | m:YYYY-MM | s:YYYY-<season>
function matchPeriod(dateStr, sel) {
  if (!sel || sel === "all") return true;
  const d = new Date(dateStr); if (isNaN(d)) return false;
  const y = d.getFullYear(), m = d.getMonth(), now = new Date();
  if (sel === "this_month") return y === now.getFullYear() && m === now.getMonth();
  if (sel === "last_month") { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return y === lm.getFullYear() && m === lm.getMonth(); }
  if (sel.startsWith("y:")) return y === Number(sel.slice(2));
  if (sel.startsWith("m:")) { const [yy, mm] = sel.slice(2).split("-").map(Number); return y === yy && m === mm - 1; }
  if (sel.startsWith("s:")) {
    const [yy, season] = sel.slice(2).split("-"); const Y = Number(yy);
    if (season === "winter") return (y === Y - 1 && m === 11) || (y === Y && (m === 0 || m === 1));
    if (season === "spring") return y === Y && m >= 2 && m <= 4;
    if (season === "summer") return y === Y && m >= 5 && m <= 7;
    if (season === "autumn") return y === Y && m >= 8 && m <= 10;
  }
  return true;
}

// варианты периода из дат продаж: всё / этот-прошлый месяц / годы / сезоны / конкретные месяцы
function buildPeriodOptions(sales) {
  const years = new Set(), months = new Set();
  sales.forEach(s => { const d = new Date(s.date); if (isNaN(d)) return; years.add(d.getFullYear()); months.add(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); });
  const yearsArr = [...years].sort((a, b) => b - a);
  const monthsArr = [...months].sort().reverse().slice(0, 18);
  const opts = [
    { value: "all", label: "Всё время" },
    { value: "this_month", label: "Этот месяц" },
    { value: "last_month", label: "Прошлый месяц" },
  ];
  yearsArr.forEach(y => opts.push({ value: "y:" + y, label: y + " год" }));
  yearsArr.forEach(y => SEASONS.forEach(([k, lbl]) => opts.push({ value: `s:${y}-${k}`, label: `${lbl} ${y}` })));
  monthsArr.forEach(ym => { const [y, mm] = ym.split("-").map(Number); opts.push({ value: "m:" + ym, label: `${MONTHS[mm - 1]} ${y}` }); });
  return opts;
}

export default async function render(page, ctx) {
  const [products, sales, customers, payments] = await Promise.all([
    ctx.db.products.list(), ctx.db.sales.list(), ctx.db.customers.list(), ctx.db.payments.list(),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));

  let period = "this_month";
  const periodOpts = buildPeriodOptions(sales);
  const periodLabel = () => (periodOpts.find(o => o.value === period) || {}).label || "";
  const periodSel = select(periodOpts, period, { style: { minWidth: "190px" } });
  periodSel.addEventListener("change", () => { period = periodSel.value; draw(); });
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Отчёты" }), el("div.sub", { text: "Аналитика продаж и долгов" })]), periodSel]));
  const wrap = el("div"); page.append(wrap);

  function table(headers, rows) {
    return el("div", { style: { overflowX: "auto", marginBottom: "10px" } }, [el("table.tbl", {}, [
      el("thead", {}, [el("tr", {}, headers.map(h => el("th", { text: h })))]),
      el("tbody", {}, rows),
    ])]);
  }

  function draw() {
    wrap.innerHTML = "";
    const fSales = sales.filter(s => matchPeriod(s.date, period));
    const fPays = payments.filter(p => matchPeriod(p.date, period));

    // ---------- ТОП ТОВАРОВ ----------
    const prodAgg = {};
    fSales.forEach(s => (s.items || []).forEach(it => {
      const a = prodAgg[it.product_id] = prodAgg[it.product_id] || { qty: 0, rev: { som: 0, usd: 0, yuan: 0 } };
      a.qty += Number(it.qty) || 0;
      const c = it.currency || s.currency; if (a.rev[c] !== undefined) a.rev[c] += it.qty * it.unit_price;
    }));
    const topProd = Object.entries(prodAgg).sort((x, y) => y[1].qty - x[1].qty).slice(0, 20);
    wrap.append(el("div.section-h", { text: "Топ товаров — " + periodLabel() + " (" + topProd.length + ")" }));
    wrap.append(topProd.length ? table(["#", "Товар", "Продано", "Выручка"], topProd.map(([id, a], i) => el("tr", {}, [
      el("td", { text: i + 1 }),
      el("td", {}, [el("strong", { text: pmap[id]?.name || "?" })]),
      el("td", {}, [el("strong", { text: a.qty })]),
      el("td", { text: curStr(a.rev) }),
    ]))) : el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Нет продаж за период" })]));

    // ---------- ТОП КЛИЕНТОВ (повторные покупки) ----------
    const cliAgg = {};
    fSales.forEach(s => { if (!s.customer_id) return; const a = cliAgg[s.customer_id] = cliAgg[s.customer_id] || { inv: 0, items: 0, rev: { som: 0, usd: 0, yuan: 0 } }; a.inv++; a.items += (s.items || []).length; (s.items || []).forEach(it => { const c = it.currency || s.currency; if (a.rev[c] !== undefined) a.rev[c] += it.qty * it.unit_price; }); });
    const topCli = Object.entries(cliAgg).sort((x, y) => y[1].inv - x[1].inv).slice(0, 20);
    wrap.append(el("div.section-h", { text: "Клиенты по повторным покупкам (нажмите на строку)" }));
    wrap.append(topCli.length ? table(["#", "Клиент", "Накладных", "Позиций", "Оборот"], topCli.map(([id, a], i) => el("tr", { style: { cursor: "pointer" }, title: "Какие товары покупал повторно", onclick: () => repeatModal(id) }, [
      el("td", { text: i + 1 }),
      el("td", {}, [el("strong", { text: cmap[id] || "—" })]),
      el("td", {}, [el("strong", { text: a.inv })]),
      el("td", { text: a.items }),
      el("td", { text: curStr(a.rev) }),
    ]))) : el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Нет данных" })]));

    // какие товары клиент покупал повторно (за выбранный период)
    function repeatModal(custId) {
      const agg = {};
      fSales.filter(s => s.customer_id === custId).forEach(s => (s.items || []).forEach(it => {
        const a = agg[it.product_id] = agg[it.product_id] || { qty: 0, invoices: new Set(), rev: { som: 0, usd: 0, yuan: 0 } };
        a.qty += Number(it.qty) || 0; a.invoices.add(s.id);
        const c = it.currency || s.currency; if (a.rev[c] !== undefined) a.rev[c] += it.qty * it.unit_price;
      }));
      const rows = Object.entries(agg).map(([pid, a]) => ({ pid, qty: a.qty, times: a.invoices.size, rev: a.rev }))
        .sort((x, y) => y.times - x.times || y.qty - x.qty);
      const repeats = rows.filter(r => r.times >= 2);
      const box = el("div");
      if (!rows.length) box.append(el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Нет покупок за период" })]));
      else box.append(table(["Товар", "Куплен раз", "Всего шт", "Сумма"], rows.map(r => el("tr", {}, [
        el("td", {}, [el("strong", { text: pmap[r.pid]?.name || "?" })]),
        el("td", {}, [r.times >= 2 ? el("span.badge.order", { text: r.times + " раз" }) : el("span.muted", { text: r.times + " раз" })]),
        el("td", { text: r.qty }),
        el("td", { text: curStr(r.rev) }),
      ]))));
      modal({
        title: `Повторные покупки — ${cmap[custId] || "клиент"}`, wide: true,
        body: el("div", {}, [el("div.hint", { text: repeats.length ? `Повторно (в ≥2 накладных): ${repeats.length} товаров` : "Повторных покупок за период нет." }), box]),
        actions: [{ label: "Закрыть", kind: "btn-outline", onClick: c => c() }],
      });
    }

    // ---------- ОБОРОТ / ОПЛАЧЕНО / ДОЛГ ПО КЛИЕНТАМ ----------
    const rows = customers.map(c => {
      const cs = fSales.filter(s => s.customer_id === c.id);
      const turn = { som: 0, usd: 0, yuan: 0 };
      cs.forEach(s => (s.items || []).forEach(it => { const cc = it.currency || s.currency; if (turn[cc] !== undefined) turn[cc] += it.qty * it.unit_price; }));
      const paid = { som: 0, usd: 0, yuan: 0 };
      fPays.filter(p => p.customer_id === c.id).forEach(p => { if (paid[p.currency] !== undefined) paid[p.currency] += p.amount; });
      // текущий долг (всё время): неоплаченные позиции + старый долг − все оплаты
      const debt = { som: 0, usd: 0, yuan: 0 };
      sales.filter(s => s.customer_id === c.id).forEach(s => (s.items || []).forEach(it => { const cc = it.currency || s.currency; if (debt[cc] !== undefined) debt[cc] += it.qty * it.unit_price; }));
      const od = c.opening_debt || {}; ["som", "usd", "yuan"].forEach(k => debt[k] += Number(od[k]) || 0);
      payments.filter(p => p.customer_id === c.id).forEach(p => { if (debt[p.currency] !== undefined) debt[p.currency] -= Number(p.amount) || 0; });
      ["som", "usd", "yuan"].forEach(k => debt[k] = Math.max(0, debt[k]));
      const turnUSD = ["som", "usd", "yuan"].reduce((t, k) => t + toUSD(turn[k], k), 0);
      return { c, turn, paid, debt, turnUSD };
    }).filter(r => r.turnUSD > 0 || curStr(r.debt) !== "0" || curStr(r.paid) !== "0")
      .sort((a, b) => b.turnUSD - a.turnUSD);

    wrap.append(el("div.section-h", { text: "Оборот, оплачено и долг по клиентам" }));
    wrap.append(rows.length ? table(["Клиент", "Оборот", "Оплачено", "Долг"], rows.map(r => el("tr", {}, [
      el("td", {}, [el("strong", { text: r.c.name })]),
      el("td", { text: curStr(r.turn) }),
      el("td", {}, [el("span", { style: { color: "#34d399" }, text: curStr(r.paid) })]),
      el("td", {}, [curStr(r.debt) === "0" ? el("span.muted", { text: "0" }) : el("span", { style: { color: "#fbbf24" }, text: curStr(r.debt) })]),
    ]))) : el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Нет данных" })]));
  }
  draw();
}
