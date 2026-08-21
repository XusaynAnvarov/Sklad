// ========================================================================
//  ДАШБОРД — мультивалютные итоги: продажи, себестоимость, приход, остаток
// ========================================================================
import { el, animateCount, modal, input, toast, confirmDialog, select } from "../ui.js?v=20260821e";
import { fmt, convert, toUSD, CUR } from "../fx.js?v=20260821e";
import { statusOf, placeholder, openForm as openProductForm } from "./products.js?v=20260821e";
import { ensureBatches, sumQty, costOutlook } from "../inventory.js?v=20260821e";
import { sparkline } from "../charts.js?v=20260821e";
import { debtByCur, onlyPositive } from "../debt.js?v=20260821e";
import { icon } from "../icons.js?v=20260821e";
import { openStockFix, unappliedSales } from "./stock_fix.js?v=20260821e";
import { matchPeriod, buildPeriodOptions, monthsWithData, monthKey, monthLabel } from "../period.js?v=20260821e";
import { loadRules, saveRules, aggregate, itemRevenueUSD, itemProfitUSD, itemRealProfitUSD, ruleGroups } from "../profit.js?v=20260821e";
import { buildAdvice } from "../advice.js?v=20260821e";
import { thumb } from "../img.js?v=20260821e";

// Всплывающий список товаров (название + остаток), с поиском.
// onPick(product) — по клику открыть товар на редактирование.
// badgeText(p) — своя подпись справа (по умолчанию «ост: N»).
function productListModal(title, list, onPick, onZero, badgeText) {
  const search = input({ placeholder: "Поиск…", style: { marginBottom: "12px" } });
  const box = el("div");
  let m;
  const draw = (q = "") => {
    box.innerHTML = "";
    const f = list.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
    if (!f.length) { box.append(el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Ничего нет" })])); return; }
    f.forEach(p => box.append(el("div.card", { style: { padding: "10px 12px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center", cursor: onPick ? "pointer" : "default" }, title: onPick ? "Открыть и изменить" : "", onclick: onPick ? () => { m && m.close(); onPick(p); } : null }, [
      el("img.thumb", { src: p.photo_url ? thumb(p.photo_url, 38) : placeholder(p.name), loading: "lazy", decoding: "async", style: { width: "38px", height: "38px" }, onerror: function () { this.src = placeholder(p.name); } }),
      el("div", { style: { flex: "1" } }, [el("div", { style: { fontWeight: "600" }, text: p.name }), onPick ? el("div.muted", { style: { fontSize: "11px" }, text: "нажмите, чтобы изменить" }) : null]),
      badgeText ? el("span.badge.transit", { text: badgeText(p) }) : el("span" + (Number(p.stock_qty) > 0 ? ".badge.ok" : ".badge.order"), { text: "ост: " + (Number(p.stock_qty) || 0) }),
      ...(onZero ? [el("button.btn.btn-danger.btn-sm", { title: "Нет в наличии — обнулить остаток", onclick: async (e) => { e.stopPropagation(); try { await onZero(p); const i = list.indexOf(p); if (i >= 0) list.splice(i, 1); draw(search.value); toast("Остаток обнулён", "ok"); } catch (err) { toast("Ошибка: " + (err.message || err), "err"); } } }, ["→ 0"])] : []),
    ])));
  };
  search.addEventListener("input", () => draw(search.value));
  draw();
  // массовое обнуление — когда список про остаток (передан onZero)
  const head = onZero ? el("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "10px" } }, [
    el("button.btn.btn-danger.btn-sm", { title: "Обнулить остаток у всех показанных товаров", onclick: () => confirmDialog(`Обнулить остаток у всех (${list.length})? Товары, которых физически нет, станут «под заказ».`, async () => {
      const snapshot = [...list];
      for (const p of snapshot) { try { await onZero(p); } catch {} }
      list.length = 0; draw(""); toast("Остатки обнулены", "ok");
    }) }, ["🧹 Обнулить все показанные"]),
  ]) : null;
  m = modal({ title: `${title} (${list.length})`, wide: true, body: el("div", {}, [head, search, box].filter(Boolean)), actions: [{ label: "Закрыть", kind: "btn-outline", onClick: c => c() }] });
}

// «проверено» — отметка, что себестоимость товара просмотрена при текущей стоимости (localStorage)
export function costAck() { try { return JSON.parse(localStorage.getItem("gm_cost_ack") || "{}"); } catch { return {}; } }
function ackAllCost(list) { try { const a = costAck(); list.forEach(p => { a[p.id] = Number(p.cost_yuan) || 0; }); localStorage.setItem("gm_cost_ack", JSON.stringify(a)); } catch {} }

// Всплывающий список товаров с битой себестоимостью (себест. > цены)
function costWarnModal(list, onPick, ctx) {
  const box = el("div");
  let m;
  list.forEach(p => box.append(el("div.card", { style: { padding: "10px 12px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", cursor: onPick ? "pointer" : "default" }, title: onPick ? "Открыть и изменить" : "", onclick: onPick ? () => { m && m.close(); onPick(p); } : null }, [
    el("div", { style: { flex: "1", minWidth: "140px", fontWeight: "600" }, text: p.name }),
    el("span.badge.order", { text: "себест: " + fmt(p.cost_yuan, "yuan") }),
    el("span.badge.ok", { text: "цена: " + fmt(p.price_yuan, "yuan") }),
  ])));
  m = modal({
    title: `Проверьте себестоимость (${list.length})`, wide: true,
    body: el("div", {}, [el("div.hint", { text: "Нажмите на товар, чтобы открыть и поправить. Или «Я всё проверил» — скрыть предупреждение." }), box]),
    actions: [
      { label: "✓ Я всё проверил — скрыть", kind: "btn-primary", onClick: async (c) => { ackAllCost(list); try { for (const p of list) await ctx.db.products.upsert({ id: p.id, cost_ack_yuan: Number(p.cost_yuan) || 0 }); } catch (e) { /* колонки cost_ack_yuan ещё нет — останется локальная отметка */ } c(); ctx && ctx.refresh && ctx.refresh(); } },
      { label: "Закрыть", kind: "btn-outline", onClick: c => c() },
    ],
  });
}

// Всплывающий список оплат: кто, сколько, когда
function paymentsModal(title, list, cmap) {
  const box = el("div");
  if (!list.length) box.append(el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Оплат нет" })]));
  [...list].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => box.append(el("div.card", { style: { padding: "10px 12px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center" } }, [
    el("div", { style: { flex: "1", minWidth: "120px" } }, [
      el("div", { style: { fontWeight: "600" }, text: cmap[p.customer_id] || "—" }),
      el("div.muted", { style: { fontSize: "12px" }, text: new Date(p.date).toLocaleDateString("ru-RU") + (p.note ? " · " + p.note : "") }),
    ]),
    el("strong", { text: fmt(p.amount, p.currency) }),
  ])));
  modal({ title: `${title} (${list.length})`, wide: true, body: box, actions: [{ label: "Закрыть", kind: "btn-outline", onClick: c => c() }] });
}

const cfg = window.APP_CONFIG || {};

// подписи «в чём показаны суммы» (склонение вручную — автоматом получается «в долларх»)
const CUR_IN = { som: "в сумах", usd: "в долларах", yuan: "в юанях" };

// прибыль-%: читаем из настроек (облако) с резервом в localStorage
function readPct(settings) {
  let p = (settings && settings.profit_pct) || null;
  if (!p) { try { p = JSON.parse(localStorage.getItem("sklad_profit_pct") || "null"); } catch { } }
  p = p || {};
  return { som: +p.som || 0, usd: +p.usd || 0, yuan: +p.yuan || 0 };
}
async function savePct(ctx, pct) {
  try { localStorage.setItem("sklad_profit_pct", JSON.stringify(pct)); } catch { }
  try { await ctx.db.saveSettings({ profit_pct: pct }); } catch { }
}

export default async function render(page, ctx) {
  const [products, sales, purchases, customers, payments] = await Promise.all([
    ctx.db.products.list(), ctx.db.sales.list(), ctx.db.purchases.list(),
    ctx.db.customers.list(), ctx.db.payments.list(),
  ]);
  const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const editProduct = (p) => openProductForm(ctx, p, cats);

  // общий долг клиентов по валютам (без конвертации, текущий)
  const totalDebt = { som: 0, usd: 0, yuan: 0 };
  // Долг считает общий js/debt.js — тот же, что на странице клиента и в
  // складе в телефоне. Раньше здесь была своя копия, и цифры расходились.
  {
    const salesOf = {}, paysOf = {};
    sales.forEach(s => { if (s.customer_id) (salesOf[s.customer_id] = salesOf[s.customer_id] || []).push(s); });
    payments.forEach(p => { if (p.customer_id) (paysOf[p.customer_id] = paysOf[p.customer_id] || []).push(p); });
    customers.forEach(c => {
      const d = onlyPositive(debtByCur(salesOf[c.id] || [], paysOf[c.id] || [], c));
      ["som", "usd", "yuan"].forEach(k => { totalDebt[k] += d[k]; });
    });
  }

  // прибыль-% (по валютам): облако с резервом в localStorage
  const settings = await ctx.db.getSettings().catch(() => ({}));
  const pct = readPct(settings);

  // правила прибыли по группам товаров (иглы 10%, ножи $5/шт и т.д.)
  let rules = loadRules(settings);

  // Валюта отображения итогов, таблицы месяцев и карточек групп.
  // Внутри всё считается в долларах, здесь только пересчёт для показа — по курсу из Настроек.
  // По умолчанию — сум: владелец ведёт дела в сумах.
  let curView = "som";
  try { const v = localStorage.getItem("gm_dash_cur"); if (v && CUR[v]) curView = v; } catch { }
  const money = (usdAmount) => fmt(convert(usdAmount, "usd", curView), curView);
  // Переключатель нужен в нескольких местах страницы, поэтому создаём каждый раз новый
  // элемент — все они меняют один и тот же curView и перерисовывают дашборд.
  function makeCurTabs() {
    const tabs = el("div.pill-tabs", {});
    [["Сум", "som"], ["Доллар $", "usd"], ["Юань ¥", "yuan"]].forEach(([label, val]) => {
      const b = el("button", { text: label, onclick: () => {
        curView = val;
        try { localStorage.setItem("gm_dash_cur", val); } catch { }
        compute();
      } });
      b.dataset.cur = val;
      if (val === curView) b.classList.add("active");
      tabs.append(b);
    });
    return tabs;
  }
  // советы считаются по всей истории — они про «сейчас», а не про выбранный период
  const advice = buildAdvice(products, sales, rules, pct);

  let period = "all";
  const periodOpts = buildPeriodOptions(sales, payments);
  const periodSel = select(periodOpts, period, { style: { minWidth: "170px" } });
  periodSel.addEventListener("change", () => { setPeriod(periodSel.value); });

  const periodTabs = el("div.pill-tabs", {}, [
    tab("Сегодня", "today"), tab("Месяц", "this_month"), tab("Год", "this_year"), tab("Всё время", "all"),
  ]);
  function tab(label, val) {
    const b = el("button", { text: label, onclick: () => setPeriod(val) });
    b.dataset.period = val;
    if (val === "all") b.classList.add("active");
    return b;
  }
  // единая точка смены периода: вкладки и выпадающий список всегда согласованы
  function setPeriod(val) {
    period = val;
    [...periodTabs.children].forEach(c => c.classList.toggle("active", c.dataset.period === val));
    if (periodSel.value !== val) periodSel.value = periodOpts.some(o => o.value === val) ? val : "";
    compute();
  }
  const periodLabelOf = (val) => (periodOpts.find(o => o.value === val) || {}).label || "за всё время";

  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Дашборд" }), el("div.sub", { text: db_mode(ctx) })]),
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" } }, [periodTabs, periodSel]),
  ]));

  const wrap = el("div");
  page.append(wrap);

  function compute() {
    const fSales = sales.filter(s => matchPeriod(s.date, period));
    const fPays = payments.filter(p => matchPeriod(p.date, period));
    const perLabel = period === "all" ? "за всё время" : "— " + periodLabelOf(period);

    // оплаты клиентов за период по валютам
    const payTotals = { som: 0, usd: 0, yuan: 0 };
    fPays.forEach(p => { if (payTotals[p.currency] !== undefined) payTotals[p.currency] += Number(p.amount) || 0; });
    const payCard = (label, amount, cur) => {
      const v = el("div.st-value");
      const c = el("div.stat-card.reveal", { style: { cursor: "pointer" }, title: "Показать оплаты", onclick: () => paymentsModal("Оплаты " + perLabel + " — " + CUR[cur].label, fPays.filter(p => p.currency === cur), cmap) }, [el("div.st-label", { text: label + " ›" }), v]);
      animateCount(v, amount, n => fmt(n, cur));
      return c;
    };

    // предупреждения по данным
    const noPrice = products.filter(p => (Number(p.cost_yuan) || 0) <= 0 && (Number(p.cost_usd) || 0) <= 0);
    const ack = costAck();
    // «битая» себестоимость: сравниваем цену ТОЙ партии, что продаётся сейчас (FIFO),
    // а не цену последнего прихода — иначе ругались на товар, который пока идёт
    // по старой дешёвой цене. Отмеченные как проверенные исключаем.
    const fifoCost = (p) => { const o = costOutlook(ensureBatches(p)); return o ? o.cost_yuan : (Number(p.cost_yuan) || 0); };
    const badCost = products.filter(p => Number(p.price_yuan) > 0 && fifoCost(p) > Number(p.price_yuan) && Number(ack[p.id]) !== Number(p.cost_yuan) && Number(p.cost_ack_yuan) !== Number(p.cost_yuan));
    // новый приход дороже цены продажи — старый товар ещё продаётся нормально,
    // но после него пойдёт убыток, если не поднять цену
    const nextTooPricey = products.map(p => {
      const price = Number(p.price_yuan) || 0; if (price <= 0) return null;
      const o = costOutlook(ensureBatches(p));
      return (o && o.next && o.next.cost_yuan > price) ? p : null;
    }).filter(Boolean);

    // --- один общий проход: итоги, разбивка по группам правил и «без правила» ---
    const pmap = Object.fromEntries(products.map(p => [p.id, p]));
    const agg = aggregate(fSales, pmap, rules, pct);
    const salesUSD = agg.total.rev, profitUSD = agg.total.profit, realProfitUSD = agg.total.real;
    // ВАЖНО: в карточки «% прибыли» идёт оборот ТОЛЬКО тех товаров, у которых нет
    // своего правила. Иглы и ножи считаются отдельными карточками ниже.
    const turnByCur = agg.noRuleByCur;
    const profitByCur = { som: 0, usd: 0, yuan: 0 };
    ["som", "usd", "yuan"].forEach(c => profitByCur[c] = turnByCur[c] * (pct[c] || 0) / 100);

    // --- дневные ряды за последние 14 дней (для мини-графиков) ---
    const DAYS = 14, today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const salesSeries = new Array(DAYS).fill(0), profitSeries = new Array(DAYS).fill(0), realProfitSeries = new Array(DAYS).fill(0);
    sales.forEach(s => {
      const d = new Date(s.date); d.setHours(0, 0, 0, 0);
      const idx = DAYS - 1 - Math.round((today0 - d) / 86400000);
      if (idx < 0 || idx >= DAYS) return;
      (s.items || []).forEach(it => {
        const p = pmap[it.product_id];
        const rev = itemRevenueUSD(it, s); if (!isFinite(rev)) return;
        salesSeries[idx] += rev;
        profitSeries[idx] += itemProfitUSD(it, s, p, rules, pct);
        realProfitSeries[idx] += itemRealProfitUSD(it, s, p);
      });
    });

    // --- помесячная сводка (таблица «Все месяцы») ---
    const monthKeys = monthsWithData(sales, payments);
    const monthAgg = {};
    monthKeys.forEach(k => monthAgg[k] = { rev: 0, profit: 0, paid: 0 });
    sales.forEach(s => {
      const k = monthKey(s.date); if (!monthAgg[k]) return;
      (s.items || []).forEach(it => {
        const p = pmap[it.product_id];
        monthAgg[k].rev += itemRevenueUSD(it, s);
        monthAgg[k].profit += itemProfitUSD(it, s, p, rules, pct);
      });
    });
    payments.forEach(pm => { const k = monthKey(pm.date); if (monthAgg[k]) monthAgg[k].paid += toUSD(Number(pm.amount) || 0, pm.currency); });

    // --- склад (себестоимость, USD) + кол-во и статусы ---
    let stockUSD = 0, stockUnits = 0, inStock = 0, onOrder = 0;
    products.forEach(p => {
      const bs = ensureBatches(p);
      stockUSD += bs.reduce((t, b) => t + (Number(b.qty) || 0) * (Number(b.cost_usd) || 0), 0);
      stockUnits += Number(p.stock_qty) || 0;
      if (statusOf(p) === "in_stock") inStock++; else onOrder++;
    });
    // --- заканчивается на складе (остаток ≤ порога) — пора заказать ---
    const LOW_STOCK = 5;
    const lowStock = products.filter(p => { const q = Number(p.stock_qty) || 0; return q > 0 && q <= LOW_STOCK && statusOf(p) === "in_stock"; }).sort((a, b) => (Number(a.stock_qty) || 0) - (Number(b.stock_qty) || 0));
    // --- ЧТО ЗАКАЗАТЬ по продажам: продавалось за 30 дней И остаток мал/закончился ---
    const since30 = Date.now() - 30 * 864e5;
    const sold30 = {};
    sales.forEach(s => { if (new Date(s.date).getTime() < since30) return; (s.items || []).forEach(it => { sold30[it.product_id] = (sold30[it.product_id] || 0) + (Number(it.qty) || 0); }); });
    const reorder = products.map(p => ({ p, stock: Number(p.stock_qty) || 0, sold: sold30[p.id] || 0 }))
      .filter(x => x.stock <= LOW_STOCK && x.sold > 0)
      .sort((a, b) => b.sold - a.sold);
    // --- заказы, ещё НЕ списанные со склада (не оформлены) ---
    const pendingOrders = sales.filter(s => ["order", "pending_confirm", "confirmed"].includes(s.status));
    // --- в дороге: приходы со статусом ≠ «пришёл» (+ карта по товарам для списка) ---
    let transitUSD = 0;
    const transitMap = {}; // product_id → { qty, suppliers:Set }
    purchases.filter(s => s.status !== "arrived").forEach(s => (s.items || []).forEach(it => {
      transitUSD += toUSD(it.qty * it.unit_cost, it.currency || s.currency);
      const k = String(it.product_id); if (!k) return;
      if (!transitMap[k]) transitMap[k] = { qty: 0, suppliers: new Set() };
      transitMap[k].qty += Number(it.qty) || 0;
      if (s.supplier) transitMap[k].suppliers.add(s.supplier);
    }));
    const totalStockUSD = stockUSD + transitUSD;
    // нет на складе, но едет
    const transitOOS = products.filter(p => (Number(p.stock_qty) || 0) <= 0 && transitMap[String(p.id)]);
    // остаток не сходится с суммой партий (фантомные «1» с пустыми партиями → станут 0)
    const mismatch = products.filter(p => sumQty(ensureBatches(p)) !== (Number(p.stock_qty) || 0));

    wrap.innerHTML = "";

    // предупреждения
    if (badCost.length) wrap.append(warnCard("alert", `Проверьте себестоимость: ${badCost.length} товаров`, "Себестоимость выше цены продажи — искажает прибыль. Нажмите, чтобы посмотреть.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)", () => costWarnModal(badCost, editProduct, ctx)));
    if (nextTooPricey.length) wrap.append(warnCard("truck", `Новый приход дороже цены продажи: ${nextTooPricey.length} товаров`, "Пока продаётся старый (дешёвый) товар — всё в порядке. Но когда он закончится, пойдёт убыток: поднимите цену заранее. Нажмите — список.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)",
      () => { location.hash = "#stock_check"; }));
    if (noPrice.length) wrap.append(warnCard("tag", `Товары без цены (себестоимости): ${noPrice.length}`, "Нажмите, чтобы открыть список и вписать себестоимость.", "rgba(245,197,66,.6)", "rgba(245,197,66,.10)", () => productListModal("Товары без себестоимости", noPrice, editProduct)));
    if (lowStock.length) wrap.append(warnCard("box", `Заканчивается на складе: ${lowStock.length} товаров`, `Остаток ≤ ${LOW_STOCK}. «→ 0» — если товара физически нет (обнулить). Или нажмите на товар, чтобы изменить.`, "rgba(245,158,11,.6)", "rgba(245,158,11,.08)", () => productListModal(`Заканчивается на складе (остаток ≤ ${LOW_STOCK})`, lowStock.slice(), editProduct, async (p) => {
      p.stock_qty = 0; p.batches = [];
      try { await ctx.db.products.upsert({ id: p.id, stock_qty: 0, batches: [] }); }
      catch { await ctx.db.products.upsert({ id: p.id, stock_qty: 0 }); }
    })));
    if (pendingOrders.length) wrap.append(warnCard("cart", `Заказы не оформлены: ${pendingOrders.length}`, "Эти заказы ещё НЕ списаны со склада. Оформите их в «Заказы» — тогда остаток уменьшится.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)", () => { location.hash = "#orders"; }));
    // накладные оформлены, но товар со склада не списался — можно списать одним действием
    const unapplied = unappliedSales(sales, 7);
    if (unapplied.length) wrap.append(warnCard("receipt", `Проверьте списание со склада: ${unapplied.length} накладных`, "Нет отметки, что товар ушёл с остатка. Нажмите — сверить «было → станет» и списать нужные.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)",
      () => { location.hash = "#stock_check"; }));
    // ушли в минус: продали больше, чем было — эти товары нужно докупить
    const negative = products.filter(p => (Number(p.stock_qty) || 0) < 0).sort((a, b) => (Number(a.stock_qty) || 0) - (Number(b.stock_qty) || 0));
    if (negative.length) wrap.append(warnCard("alert", `Ушли в минус: ${negative.length} товаров`, "Продано больше, чем было на складе. Нажмите — список, сколько нужно докупить.", "rgba(239,68,68,.55)", "rgba(239,68,68,.08)",
      () => { location.hash = "#stock_check"; }));
    // нет на складе, но товар уже в пути
    if (transitOOS.length) wrap.append(warnCard("truck", `В пути (нет на складе): ${transitOOS.length} товаров`, "Этих товаров нет на складе, но они уже едут. Нажмите — список с количеством и поставщиком.", "rgba(59,130,246,.5)", "rgba(59,130,246,.08)",
      () => productListModal("В пути — нет на складе", transitOOS.slice(), editProduct, null, (p) => { const t = transitMap[String(p.id)]; return "🚚 в пути: " + (t?.qty || 0) + (t?.suppliers.size ? " · " + [...t.suppliers].join(", ") : ""); })));
    // остаток не сходится с партиями — пересчитать
    if (mismatch.length) wrap.append(warnCard("box", `Остаток не сходится с партиями: ${mismatch.length}`, "Возможны «фантомные» остатки (напр. «1», но товара нет). Нажмите — пересчитать остаток по партиям.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)",
      () => confirmDialog(`Пересчитать остаток по партиям у ${mismatch.length} товаров? (фантомные станут 0)`, async () => {
        for (const p of mismatch) { const q = sumQty(ensureBatches(p)); try { await ctx.db.products.upsert({ id: p.id, stock_qty: q, batches: ensureBatches(p) }); } catch { try { await ctx.db.products.upsert({ id: p.id, stock_qty: q }); } catch {} } }
        toast("Остатки пересчитаны", "ok"); ctx.refresh();
      })));

    // что заказать (по продажам): заканчивается И продаётся
    if (reorder.length) {
      wrap.append(el("div.section-h", { text: "Что заказать — продаётся, но заканчивается" }));
      const rtb = el("tbody");
      reorder.slice(0, 40).forEach(x => rtb.append(el("tr", { style: { cursor: "pointer" }, title: "Открыть товар", onclick: () => editProduct(x.p) }, [
        el("td", {}, [el("strong", { text: x.p.name })]),
        el("td", {}, [el("span.badge.order", { text: "ост: " + x.stock })]),
        el("td", {}, [el("strong", { text: x.sold }), el("span.muted", { text: " шт за 30 дн", style: { fontSize: "12px" } })]),
      ])));
      wrap.append(el("div", { style: { overflowX: "auto", marginBottom: "14px" } }, [el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, ["Товар", "Остаток", "Продажи"].map(h => el("th", { text: h })))]), rtb,
      ])]));
    }

    // ---------- ТОП-3 СОВЕТА (полный список — в Отчётах) ----------
    if (advice.length) {
      wrap.append(el("div.section-h", { text: "Советы — что сделать сейчас" }));
      advice.slice(0, 3).forEach(a => wrap.append(el("div.advice." + a.level + ".reveal", { onclick: () => { location.hash = "#reports"; }, title: "Открыть Отчёты" }, [
        el("div.advice-ic", {}, [icon(a.ic, { size: 22 })]),
        el("div", { style: { flex: "1", minWidth: "0" } }, [
          el("div.advice-t", { text: a.title }),
          el("div.advice-s", { text: a.text }),
        ]),
        el("span.advice-n", { text: (a.items || []).length + " ›" }),
      ])));
      if (advice.length > 3) wrap.append(el("div.hint", { text: `Ещё советов: ${advice.length - 3} — смотрите в разделе «Отчёты».`, style: { marginTop: "-6px", marginBottom: "16px" } }));
    }

    // оборот + прибыль (всего) — в выбранной валюте
    wrap.append(el("div", { style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", margin: "28px 0 14px" } }, [
      el("div.section-h", { text: "Оборот и прибыль " + perLabel, style: { margin: 0 } }),
      makeCurTabs(),
    ]));
    wrap.append(el("div.stat-grid", {}, [
      bigCard("Оборот всего", salesUSD, "wallet", true, salesSeries),
      bigCard("Прибыль (по правилам)", profitUSD, "chart", true, profitSeries, "по правилам групп + общий % у остальных"),
      bigCard("Реальная прибыль (по себест.)", realProfitUSD, "chart", false, realProfitSeries, "для сверки, если себестоимость заполнена"),
    ]));

    // ---------- ВСЕ МЕСЯЦЫ ----------
    if (monthKeys.length) {
      wrap.append(el("div.section-h", { text: "Все месяцы — нажмите на месяц, чтобы посмотреть его отдельно" }));
      const mtb = el("tbody");
      [...monthKeys].reverse().forEach((k) => {
        const cur = monthAgg[k];
        const i = monthKeys.indexOf(k);
        const prev = i > 0 ? monthAgg[monthKeys[i - 1]] : null;
        const delta = prev && prev.rev > 0 ? ((cur.rev - prev.rev) / prev.rev) * 100 : null;
        const active = period === "m:" + k;
        mtb.append(el("tr" + (active ? ".month-active" : ""), { style: { cursor: "pointer" }, title: "Показать дашборд за " + monthLabel(k), onclick: () => setPeriod("m:" + k) }, [
          el("td", {}, [el("strong", { text: monthLabel(k) })]),
          el("td", { text: money(cur.rev) }),
          el("td", {}, [el("strong", { text: money(cur.profit), style: { color: cur.profit >= 0 ? "#34d399" : "#f87171" } })]),
          el("td", { text: money(cur.paid) }),
          el("td", {}, [delta == null
            ? el("span.muted", { text: "—" })
            : el("span" + (delta >= 0 ? ".delta-up" : ".delta-down"), { text: (delta >= 0 ? "▲ " : "▼ ") + Math.abs(delta).toFixed(0) + "%" })]),
        ]));
      });
      wrap.append(el("div", { style: { overflowX: "auto", marginBottom: "16px" } }, [el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, ["Месяц", "Оборот", "Прибыль", "Оплачено", "К прошлому"].map(h => el("th", { text: h })))]), mtb,
      ])]));
      wrap.append(el("div.hint", { text: "Суммы показаны " + CUR_IN[curView] + " — валюту переключайте выше, курс задаётся в Настройках.", style: { marginTop: "-10px" } }));
    }

    // ---------- ОТДЕЛЬНЫЕ КАРТОЧКИ ГРУПП (иглы, ножи, …) ----------
    // Их оборот НЕ входит в карточки «% прибыли» ниже — у каждой группы свой расчёт.
    const groups = ruleGroups(rules);
    if (groups.length) {
      wrap.append(el("div", { style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", margin: "28px 0 14px" } }, [
        el("div.section-h", { text: "Прибыль по группам товаров " + perLabel, style: { margin: 0 } }),
        makeCurTabs(),
      ]));
      wrap.append(el("div.hint", { text: "Значение (% или $ за штуку) можно менять прямо в карточке — оно сразу применится ко всем товарам группы.", style: { marginTop: "-4px" } }));
      wrap.append(el("div.stat-grid", {}, groups.map(g => groupCard(g, agg.byGroup[g.group]))));
    }

    // оборот и прибыль по валютам (% задаёт владелец)
    const excluded = groups.map(g => g.group);
    wrap.append(el("div.section-h", { text: "Остальные товары — оборот и прибыль по валютам (% впишите сами)" }));
    wrap.append(el("div.hint", {
      text: excluded.length
        ? `Здесь только товары БЕЗ своего правила. Суммы этих групп сюда НЕ входят: ${excluded.join(", ")} — у них карточки выше со своим расчётом.`
        : "Здесь товары, у которых нет своего правила прибыли.",
      style: { marginTop: "-4px" },
    }));
    wrap.append(el("div.stat-grid", {}, [
      profitCard("som", turnByCur.som, profitByCur.som, excluded),
      profitCard("usd", turnByCur.usd, profitByCur.usd, excluded),
      profitCard("yuan", turnByCur.yuan, profitByCur.yuan, excluded),
    ]));

    // долги клиентов (по валютам, текущие)
    wrap.append(el("div.section-h", { text: "Долги клиентов (по валютам)" }));
    wrap.append(el("div.stat-grid", {}, [
      curCard("Долг в сумах", totalDebt.som, "som"),
      curCard("Долг в долларах", totalDebt.usd, "usd"),
      curCard("Долг в юанях", totalDebt.yuan, "yuan"),
    ]));

    // оплаты клиентов за период
    wrap.append(el("div.section-h", { text: "Оплаты клиентов " + perLabel + " (нажмите для детализации)" }));
    wrap.append(el("div.stat-grid", {}, [
      payCard("Оплачено сум", payTotals.som, "som"),
      payCard("Оплачено $", payTotals.usd, "usd"),
      payCard("Оплачено ¥", payTotals.yuan, "yuan"),
    ]));

    // стоимость товара: склад / в дороге / всего (в $ и сумах)
    wrap.append(el("div.section-h", { text: "Стоимость товара (в долларах и сумах)" }));
    wrap.append(el("div.stat-grid", {}, [
      dualCard("На складе", stockUSD, "box"),
      dualCard("В дороге", transitUSD, "truck"),
      dualCard("Всего (склад + дорога)", totalStockUSD, "sigma"),
    ]));
    wrap.append(el("div.stat-grid", {}, [
      miniCard("Единиц на складе", stockUnits, "hash"),
      miniCard("Есть в наличии", inStock, "check", () => productListModal("Товары в наличии", products.filter(p => statusOf(p) === "in_stock"), editProduct)),
      miniCard("Под заказ", onOrder, "clock", () => productListModal("Товары под заказ", products.filter(p => statusOf(p) === "on_order"), editProduct)),
    ]));

    // пошаговое появление карточек
    requestAnimationFrame(() => wrap.querySelectorAll(".reveal").forEach((n, i) => setTimeout(() => n.classList.add("in"), i * 35)));
  }

  // карточка-предупреждение (кликабельная)
  function warnCard(ic, title, sub, bColor, bg, onclick) {
    return el("div.card.reveal", { style: { marginBottom: "16px", cursor: "pointer", borderColor: bColor, background: bg }, onclick }, [
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, [
        el("span", { style: { color: "var(--warn)", display: "flex" } }, [icon(ic, { size: 24 })]),
        el("div", {}, [el("div", { style: { fontWeight: "700" }, text: title }), el("div.muted", { style: { fontSize: "13px" }, text: sub })]),
      ]),
    ]);
  }
  function bigCard(label, usd, ic, grad, series, sub) {
    const v = el("div.st-value");
    const c = el("div" + (grad ? ".stat-card.grad.reveal" : ".stat-card.reveal"), {}, [
      el("div.st-ic", {}, [icon(ic, { size: 22 })]), el("div.st-label", { text: label }), v,
      el("div.st-sub", { text: sub || (CUR_IN[curView] + " · 14 дней") }),
    ]);
    animateCount(v, convert(usd, "usd", curView), n => fmt(n, curView));
    if (series && series.some(x => x > 0)) {
      const sw = el("div", { style: { marginTop: "12px" } });
      sw.innerHTML = sparkline(series, { color: grad ? "rgba(255,255,255,.85)" : "#a78bfa", height: 50 });
      c.append(sw);
    }
    return c;
  }
  // карточка валюты: оборот (нативно) + поле «%» + прибыль.
  // excluded — названия групп, чьи товары сюда НЕ входят (иглы, ножи…): пишем прямо
  // в карточке, чтобы было видно, что их суммы отсюда убраны.
  function profitCard(cur, turn, profit, excluded) {
    const v = el("div.st-value");
    const pv = el("div", { style: { marginTop: "8px", fontWeight: "700", color: "var(--ok)" }, text: "Прибыль: " + fmt(profit, cur) });
    const inp = input({ type: "number", step: "0.1", value: pct[cur] || "", placeholder: "0", style: { width: "92px", padding: "8px 10px", textAlign: "center" } });
    inp.addEventListener("change", async () => { pct[cur] = +inp.value || 0; await savePct(ctx, pct); compute(); });
    const c = el("div.stat-card.reveal", {}, [
      el("div.st-label", { text: "Оборот · " + CUR[cur].label }), v,
      excluded && excluded.length ? el("div.st-sub", { text: "без: " + excluded.join(", ") }) : null,
      el("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" } }, [inp, el("span.muted", { text: "% прибыли" })]),
      pv,
    ].filter(Boolean));
    animateCount(v, turn, n => fmt(n, cur));
    return c;
  }
  // Карточка группы товаров со своим правилом (Иглы, Ножи, …).
  // Оборот этой группы НЕ входит в карточки «% прибыли» по валютам.
  // Меняем число прямо здесь → оно сохраняется во ВСЕ правила группы.
  function groupCard(g, data) {
    const d = data || { rev: 0, profit: 0, qty: 0 };
    const isFixed = g.mode === "fixed_usd";
    const v = el("div.st-value");
    const pv = el("div", { style: { marginTop: "8px", fontWeight: "700", color: "var(--ok)" }, text: "Прибыль: " + money(d.profit) });
    const inp = input({
      type: "number", step: isFixed ? "0.5" : "0.1", min: "0", value: g.value,
      style: { width: "92px", padding: "8px 10px", textAlign: "center" },
    });
    inp.addEventListener("change", async () => {
      const val = +inp.value || 0;
      rules = rules.map(r => (r.group === g.group ? { ...r, value: val } : r));
      const res = await saveRules(ctx, rules);
      toast(res.ok ? `${g.group}: ${isFixed ? "$" + val + " за штуку" : val + "% от выручки"}` : "Сохранили в браузере; в облако не ушло: " + res.error, res.ok ? "ok" : "err");
      compute();
    });
    const c = el("div.stat-card.reveal", { style: { borderColor: "rgba(217,180,90,.35)" } }, [
      el("div.st-label", { text: g.group + " · оборот" }), v,
      el("div.st-sub", { text: isFixed ? `продано ${d.qty} шт · ${g.keys.length} товар(ов)` : `${g.keys.join(", ")}` }),
      el("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" } }, [
        inp, el("span.muted", { text: isFixed ? "$ чистой прибыли за штуку" : "% прибыли" }),
      ]),
      pv,
    ]);
    animateCount(v, convert(d.rev, "usd", curView), n => fmt(n, curView));
    return c;
  }
  function curCard(label, amount, cur) {
    const v = el("div.st-value");
    const c = el("div.stat-card.reveal", {}, [el("div.st-label", { text: label }), v]);
    animateCount(v, amount, n => fmt(n, cur));
    return c;
  }
  // карточка с двумя валютами: $ крупно + сум подписью
  function dualCard(label, usd, ic) {
    const v = el("div.st-value");
    const c = el("div.stat-card.reveal", {}, [el("div.st-ic", {}, [icon(ic, { size: 22 })]), el("div.st-label", { text: label }), v, el("div.st-sub", { text: fmt(convert(usd, "usd", "som"), "som") })]);
    animateCount(v, usd, n => "$" + Math.round(n).toLocaleString("ru-RU"));
    return c;
  }
  function miniCard(label, num, ic, onclick) {
    const v = el("div.st-value");
    const props = onclick ? { style: { cursor: "pointer" }, onclick, title: "Показать список" } : {};
    const c = el("div.stat-card.reveal", props, [el("div.st-ic", {}, [icon(ic, { size: 22 })]), el("div.st-label", { text: label + (onclick ? " ›" : "") }), v]);
    animateCount(v, num, n => Math.round(n).toLocaleString("ru-RU"));
    return c;
  }

  compute();
}

function db_mode(ctx) {
  return ctx.db.mode === "supabase" ? "Данные: облако (Supabase)" : "Демо-режим (данные в браузере)";
}
