// ========================================================================
//  ОТЧЁТЫ: итоги, диаграммы (месяцы · категории · сезоны · топ-полосы),
//  сезонность товаров, советы, топ товаров/клиентов, долги и оборот.
// ========================================================================
import { el, modal, select } from "../ui.js?v=20260809a";
import { curStr, toUSD } from "../fx.js?v=20260809a";
import { SEASON_LABEL, SEASON_ICON, matchPeriod, buildPeriodOptions, monthsWithData, monthKey, monthShort, seasonOf } from "../period.js?v=20260809a";
import { loadRules, aggregate, itemRevenueUSD, itemProfitUSD, ruleFor, ruleText, ruleGroups } from "../profit.js?v=20260809a";
import { barChart, donutChart, hBars, seasonChart, miniSeason, noData } from "../charts.js?v=20260809a";
import { buildAdvice } from "../advice.js?v=20260809a";
import { placeholder } from "./products.js?v=20260809a";
import { icon } from "../icons.js?v=20260809a";
import { thumb } from "../img.js?v=20260809a";

const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("ru-RU");

export default async function render(page, ctx) {
  const [products, sales, customers, payments, settings] = await Promise.all([
    ctx.db.products.list(), ctx.db.sales.list(), ctx.db.customers.list(), ctx.db.payments.list(),
    ctx.db.getSettings().catch(() => ({})),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));

  const rules = loadRules(settings);
  let pct = (settings && settings.profit_pct) || null;
  if (!pct) { try { pct = JSON.parse(localStorage.getItem("sklad_profit_pct") || "null"); } catch { } }
  pct = pct || {};

  let period = "this_month";
  let catMetric = "rev";                       // что показывает круговая: выручка или прибыль
  const periodOpts = buildPeriodOptions(sales, payments);
  const periodLabel = () => (periodOpts.find(o => o.value === period) || {}).label || "";
  const periodSel = select(periodOpts, period, { style: { minWidth: "190px" } });
  periodSel.addEventListener("change", () => { period = periodSel.value; draw(); });
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Отчёты" }), el("div.sub", { text: "Аналитика продаж, прибыли и сезонов" })]), periodSel]));
  const wrap = el("div"); page.append(wrap);

  // советы считаются по всей истории — они про «сейчас», а не про выбранный месяц
  const advice = buildAdvice(products, sales, rules, pct);

  // подпись под «Прибыль (по правилам)» — из реальных правил, а не зашитая в код,
  // иначе после смены значения на Дашборде текст врал бы («иглы 10%», когда там уже 15%)
  const rulesSummary = ruleGroups(rules).length
    ? ruleGroups(rules).map(g => `${g.group} ${g.mode === "fixed_usd" ? "$" + g.value + "/шт" : g.value + "%"}`).join(" · ") + " · остальное — общий %"
    : "общий % по валютам";

  function table(headers, rows) {
    return el("div", { style: { overflowX: "auto", marginBottom: "10px" } }, [el("table.tbl", {}, [
      el("thead", {}, [el("tr", {}, headers.map(h => el("th", { text: h })))]),
      el("tbody", {}, rows),
    ])]);
  }
  const miniCard = (label, val, color, override, sub) => el("div.stat-card", {}, [
    el("div.st-label", { text: label }),
    el("div.st-value", { text: override != null ? override : usd(val), style: color ? { color } : {} }),
    sub ? el("div.st-sub", { text: sub }) : null,
  ].filter(Boolean));

  // блок-диаграмма: заголовок + SVG (SVG строится строкой, поэтому innerHTML)
  function chartBox(title, html, hint) {
    const body = el("div.chart-box");
    body.innerHTML = html;
    return el("div", { style: { marginBottom: "18px" } }, [
      el("div.section-h", { text: title }),
      hint ? el("div.hint", { text: hint, style: { marginTop: "-4px" } }) : null,
      body,
    ].filter(Boolean));
  }

  // модалка со списком товаров из совета
  function adviceModal(adv) {
    const box = el("div");
    (adv.items || []).forEach(x => box.append(el("div.card", { style: { padding: "10px 12px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } }, [
      el("img.thumb", { src: x.p.photo_url ? thumb(x.p.photo_url, 42) : placeholder(x.p.name), loading: "lazy", decoding: "async", style: { width: "42px", height: "42px" }, onerror: function () { this.src = placeholder(x.p.name); } }),
      el("div", { style: { flex: "1", minWidth: "150px" } }, [
        el("div", { style: { fontWeight: "600" }, text: x.p.name }),
        el("div.muted", { style: { fontSize: "12px" }, text: x.sub || "" }),
      ]),
      el("span" + (x.bad ? ".badge.order" : ".badge.transit"), { text: x.badge || "" }),
    ])));
    modal({
      title: adv.title, wide: true,
      body: el("div", {}, [el("div.hint", { text: adv.text }), box]),
      actions: [{ label: "Закрыть", kind: "btn-outline", onClick: c => c() }],
    });
  }

  function draw() {
    wrap.innerHTML = "";
    const fSales = sales.filter(s => matchPeriod(s.date, period));
    const fPays = payments.filter(p => matchPeriod(p.date, period));
    const agg = aggregate(fSales, pmap, rules, pct);

    // ---------- ИТОГИ ----------
    const margin = agg.total.rev > 0 ? (agg.total.profit / agg.total.rev * 100) : 0;
    wrap.append(el("div.section-h", { text: "Итоги — " + periodLabel() + " (в $ по курсу)" }));
    wrap.append(el("div.stat-grid", {}, [
      miniCard("Выручка", agg.total.rev),
      miniCard("Прибыль (по правилам)", agg.total.profit, agg.total.profit >= 0 ? "#34d399" : "#f87171", null, rulesSummary),
      miniCard("Реальная (по себест.)", agg.total.real, agg.total.real >= 0 ? "#34d399" : "#f87171", null, "для сверки, если себестоимость заполнена"),
      miniCard("Маржа", margin, agg.total.profit >= 0 ? "#34d399" : "#f87171", margin.toFixed(1) + "%"),
    ]));

    // ---------- СОВЕТЫ ----------
    if (advice.length) {
      wrap.append(el("div.section-h", { text: "Советы — что сделать сейчас (" + advice.length + ")" }));
      advice.forEach(a => wrap.append(el("div.advice." + a.level, { onclick: () => adviceModal(a), title: "Показать список товаров" }, [
        el("div.advice-ic", {}, [icon(a.ic, { size: 22 })]),
        el("div", { style: { flex: "1", minWidth: "0" } }, [
          el("div.advice-t", { text: a.title }),
          el("div.advice-s", { text: a.text }),
        ]),
        el("span.advice-n", { text: (a.items || []).length + " ›" }),
      ])));
    }

    // ---------- ДИАГРАММА ПО МЕСЯЦАМ ----------
    const months = monthsWithData(sales).slice(-24);
    const monthAgg = {};
    months.forEach(k => monthAgg[k] = { rev: 0, profit: 0 });
    sales.forEach(s => {
      const k = monthKey(s.date); if (!monthAgg[k]) return;
      (s.items || []).forEach(it => {
        const p = pmap[it.product_id];
        monthAgg[k].rev += itemRevenueUSD(it, s);
        monthAgg[k].profit += itemProfitUSD(it, s, p, rules, pct);
      });
    });
    const monthRows = months.map(k => ({ key: k, label: monthShort(k), a: monthAgg[k].rev, b: monthAgg[k].profit }));
    const monthsBox = chartBox("Оборот и прибыль по месяцам", monthRows.length ? barChart(monthRows, { height: 250 }) : noData("Продаж пока нет"), "Нажмите на месяц — отчёт пересчитается за него");
    wrap.append(monthsBox);
    monthsBox.querySelectorAll(".bar-g").forEach(g => g.addEventListener("click", () => {
      const k = g.getAttribute("data-key"); if (!k) return;   // data-key = "2026-07"
      const v = "m:" + k;
      if (periodOpts.some(o => o.value === v)) { period = v; periodSel.value = v; draw(); }
    }));

    // ---------- КРУГОВАЯ ПО КАТЕГОРИЯМ ----------
    const catRows = Object.entries(agg.byCategory).map(([name, a]) => ({ name, ...a }))
      .sort((x, y) => y[catMetric === "rev" ? "rev" : "profit"] - x[catMetric === "rev" ? "rev" : "profit"]);
    const catToggle = el("div.pill-tabs", { style: { marginBottom: "10px" } }, [
      el("button" + (catMetric === "rev" ? ".active" : ""), { text: "По обороту", onclick: () => { catMetric = "rev"; draw(); } }),
      el("button" + (catMetric === "profit" ? ".active" : ""), { text: "По прибыли", onclick: () => { catMetric = "profit"; draw(); } }),
    ]);
    wrap.append(el("div.section-h", { text: "Категории товаров — " + periodLabel() }));
    wrap.append(catToggle);
    const donutBox = el("div.chart-box");
    donutBox.innerHTML = catRows.length
      ? donutChart(catRows.map(c => ({ label: c.name, value: catMetric === "rev" ? c.rev : c.profit })), {
          centerLabel: catMetric === "rev" ? "оборот" : "прибыль",
          centerValue: usd(catRows.reduce((t, c) => t + (catMetric === "rev" ? c.rev : c.profit), 0)),
        })
      : noData();
    wrap.append(donutBox);
    if (catRows.length) {
      wrap.append(table(["Категория", "Продано", "Выручка", "Прибыль", "Маржа"], catRows.slice(0, 30).map(c => el("tr", {}, [
        el("td", {}, [el("strong", { text: c.name })]),
        el("td", { text: c.qty }),
        el("td", { text: usd(c.rev) }),
        el("td", {}, [el("strong", { text: usd(c.profit), style: { color: c.profit >= 0 ? "#34d399" : "#f87171" } })]),
        el("td", { text: (c.rev > 0 ? (c.profit / c.rev * 100).toFixed(1) : "0") + "%" }),
      ]))));
    }

    // ---------- СЕЗОНЫ ----------
    const bySeason = { winter: { rev: 0, profit: 0 }, spring: { rev: 0, profit: 0 }, summer: { rev: 0, profit: 0 }, autumn: { rev: 0, profit: 0 } };
    const prodSeason = {};  // product_id → {winter,spring,summer,autumn} в штуках
    sales.forEach(s => {
      const sea = seasonOf(s.date); if (!sea) return;
      (s.items || []).forEach(it => {
        const p = pmap[it.product_id];
        bySeason[sea].rev += itemRevenueUSD(it, s);
        bySeason[sea].profit += itemProfitUSD(it, s, p, rules, pct);
        const a = prodSeason[it.product_id] = prodSeason[it.product_id] || { winter: 0, spring: 0, summer: 0, autumn: 0, total: 0 };
        const q = Number(it.qty) || 0; a[sea] += q; a.total += q;
      });
    });
    wrap.append(chartBox("Сезоны — за всё время", seasonChart(bySeason), "Зима: дек–фев · Весна: мар–май · Лето: июн–авг · Осень: сен–ноя"));

    // сезонные товары: один сезон даёт ≥40% продаж при ≥10 проданных штук
    const seasonal = Object.entries(prodSeason).map(([pid, a]) => {
      const best = ["winter", "spring", "summer", "autumn"].reduce((x, k) => (a[k] > a[x] ? k : x), "winter");
      return { pid, a, best, share: a.total > 0 ? a[best] / a.total : 0 };
    }).filter(x => x.a.total >= 10 && x.share >= 0.4).sort((x, y) => y.share - x.share || y.a.total - x.a.total);

    wrap.append(el("div.section-h", { text: "Сезонные товары (" + seasonal.length + ")" }));
    wrap.append(el("div.hint", { text: "Товары, у которых один сезон даёт 40% и больше всех продаж. Их стоит закупать перед сезоном.", style: { marginTop: "-4px" } }));
    if (seasonal.length) {
      wrap.append(table(["Товар", "Пик", "Доля пика", "Продано всего", "Остаток", "Разбивка по сезонам"], seasonal.slice(0, 40).map(x => {
        const p = pmap[x.pid] || { name: "?" };
        const st = Number(p.stock_qty) || 0;
        const cell = el("td"); cell.innerHTML = miniSeason(x.a);
        return el("tr", {}, [
          el("td", {}, [el("strong", { text: p.name })]),
          el("td", {}, [el("span.badge.transit", { text: SEASON_ICON[x.best] + " " + SEASON_LABEL[x.best] })]),
          el("td", {}, [el("strong", { text: Math.round(x.share * 100) + "%" })]),
          el("td", { text: x.a.total }),
          el("td", {}, [el("span" + (st > 0 ? ".badge.ok" : ".badge.order"), { text: String(st) })]),
          cell,
        ]);
      })));
    } else {
      wrap.append(el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Пока нет товаров с явной сезонностью — нужно больше продаж за разные сезоны" })]));
    }

    // ---------- ТОП ТОВАРОВ (полосы + таблица) ----------
    const prodRows = Object.entries(agg.byProduct).map(([id, a]) => ({ id, name: pmap[id]?.name || "?", ...a }));
    const topRev = [...prodRows].sort((x, y) => y.rev - x.rev).slice(0, 10);
    wrap.append(chartBox("Топ-10 товаров по обороту — " + periodLabel(),
      topRev.length ? hBars(topRev.map(r => ({ label: r.name, value: r.rev, sub: r.qty + " шт" }))) : noData()));

    const topProfit = [...prodRows].filter(r => r.profit !== 0).sort((x, y) => y.profit - x.profit).slice(0, 10);
    wrap.append(chartBox("Топ-10 товаров по прибыли",
      topProfit.length ? hBars(topProfit.map(r => ({ label: r.name, value: r.profit, sub: ruleText(ruleFor(pmap[r.id], rules)) })), { color: "#34d399" }) : noData()));

    const topQty = [...prodRows].sort((x, y) => y.qty - x.qty).slice(0, 20);
    wrap.append(el("div.section-h", { text: "Топ товаров по количеству — " + periodLabel() }));
    wrap.append(topQty.length ? table(["#", "Товар", "Продано", "Выручка", "Прибыль", "Правило"], topQty.map((r, i) => el("tr", {}, [
      el("td", { text: i + 1 }),
      el("td", {}, [el("strong", { text: r.name })]),
      el("td", {}, [el("strong", { text: r.qty })]),
      el("td", { text: usd(r.rev) }),
      el("td", {}, [el("strong", { text: usd(r.profit), style: { color: r.profit >= 0 ? "#34d399" : "#f87171" } })]),
      el("td", {}, [el("span.muted", { style: { fontSize: "12px" }, text: ruleText(ruleFor(pmap[r.id], rules)) })]),
    ]))) : el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Нет продаж за период" })]));

    // ---------- ТОП КЛИЕНТОВ ----------
    const cliAgg = {};
    fSales.forEach(s => {
      if (!s.customer_id) return;
      const a = cliAgg[s.customer_id] = cliAgg[s.customer_id] || { inv: 0, items: 0, rev: { som: 0, usd: 0, yuan: 0 }, revUSD: 0 };
      a.inv++; a.items += (s.items || []).length;
      (s.items || []).forEach(it => { const c = it.currency || s.currency; if (a.rev[c] !== undefined) a.rev[c] += it.qty * it.unit_price; a.revUSD += itemRevenueUSD(it, s); });
    });
    const cliRows = Object.entries(cliAgg).map(([id, a]) => ({ id, name: cmap[id] || "—", ...a }));
    const topCliBars = [...cliRows].sort((x, y) => y.revUSD - x.revUSD).slice(0, 10);
    wrap.append(chartBox("Топ-10 клиентов по обороту — " + periodLabel(),
      topCliBars.length ? hBars(topCliBars.map(r => ({ label: r.name, value: r.revUSD, sub: r.inv + " накл." })), { color: "#60a5fa" }) : noData()));

    const topCli = [...cliRows].sort((x, y) => y.inv - x.inv).slice(0, 20);
    wrap.append(el("div.section-h", { text: "Клиенты по повторным покупкам (нажмите на строку)" }));
    wrap.append(topCli.length ? table(["#", "Клиент", "Накладных", "Позиций", "Оборот"], topCli.map((r, i) => el("tr", { style: { cursor: "pointer" }, title: "Какие товары покупал повторно", onclick: () => repeatModal(r.id) }, [
      el("td", { text: i + 1 }),
      el("td", {}, [el("strong", { text: r.name })]),
      el("td", {}, [el("strong", { text: r.inv })]),
      el("td", { text: r.items }),
      el("td", { text: curStr(r.rev) }),
    ]))) : el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Нет данных" })]));

    // какие товары клиент покупал повторно (за выбранный период)
    function repeatModal(custId) {
      const agg2 = {};
      fSales.filter(s => s.customer_id === custId).forEach(s => (s.items || []).forEach(it => {
        const a = agg2[it.product_id] = agg2[it.product_id] || { qty: 0, invoices: new Set(), rev: { som: 0, usd: 0, yuan: 0 } };
        a.qty += Number(it.qty) || 0; a.invoices.add(s.id);
        const c = it.currency || s.currency; if (a.rev[c] !== undefined) a.rev[c] += it.qty * it.unit_price;
      }));
      const rows = Object.entries(agg2).map(([pid, a]) => ({ pid, qty: a.qty, times: a.invoices.size, rev: a.rev }))
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
