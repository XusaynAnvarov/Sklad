// ========================================================================
//  ДАШБОРД — мультивалютные итоги: продажи, себестоимость, приход, остаток
// ========================================================================
import { el, animateCount, modal, input, toast, confirmDialog, select } from "../ui.js?v=20261113d";
import { fmt, convert, toUSD, CUR } from "../fx.js?v=20261113d";
import { statusOf, placeholder, openForm as openProductForm } from "./products.js?v=20261113d";
import { картаДороги, вДороге, едетВместоНет, подписьДороги } from "../transit.js?v=20261113d";
import { ensureBatches, sumQty, costOutlook } from "../inventory.js?v=20261113d";
import { sparkline } from "../charts.js?v=20261113d";
import { debtByCur, onlyPositive } from "../debt.js?v=20261113d";
import { icon } from "../icons.js?v=20261113d";
import { openStockFix, unappliedSales } from "./stock_fix.js?v=20261113d";
import { matchPeriod, buildPeriodOptions, monthsWithData, monthKey, monthLabel } from "../period.js?v=20261113d";
import { loadRules, saveRules, aggregate, itemRevenueUSD, itemProfitUSD, itemRealProfitUSD, ruleGroups } from "../profit.js?v=20261113d";
import { buildAdvice } from "../advice.js?v=20261113d";
import { thumb } from "../img.js?v=20261113d";

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

// «1 товар», «2 товара», «5 товаров» — число вместе со словом.
function сколько(n, одна, две, пять) {
  const a = Math.abs(n) % 100, b = a % 10;
  const слово = a > 10 && a < 20 ? пять : b === 1 ? одна : b >= 2 && b <= 4 ? две : пять;
  return n + " " + слово;
}

// График «Продажи и прибыль» за 14 дней. Обе линии в одном масштабе —
// прибыль читается как доля оборота. Рисунок тянется на всю высоту
// панели (preserveAspectRatio="none"), а толщина линий от растяжения не
// меняется (vector-effect). Цвета — через style: атрибуты SVG не
// понимают переменные CSS.
function графикПродаж(оборот, прибыль) {
  const W = 280, H = 100, n = оборот.length;
  const max = Math.max(1, ...оборот, ...прибыль);
  const min = Math.min(0, ...прибыль);
  const x = i => ((i * W) / Math.max(1, n - 1)).toFixed(1);
  const y = v => (H - ((v - min) / (max - min)) * H).toFixed(1);
  const точки = ряд => ряд.map((v, i) => x(i) + "," + y(v)).join(" ");
  const ноль = y(0);
  const линия = "fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round";
  return `<svg viewBox="-2 -4 ${W + 4} ${H + 8}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" x2="${W}" y1="${ноль}" y2="${ноль}" style="stroke:currentColor;stroke-opacity:.25" vector-effect="non-scaling-stroke"/>
    <polygon points="0,${ноль} ${точки(оборот)} ${W},${ноль}" style="fill:var(--accent);fill-opacity:.12"/>
    <polyline points="${точки(оборот)}" style="stroke:var(--accent);${линия}" vector-effect="non-scaling-stroke"/>
    <polyline points="${точки(прибыль)}" style="stroke:var(--ok);${линия}" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

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

  // ------------------------------------------------------------------
  //  РАСКЛАДКА ДАШБОРДА
  //
  //  Первый экран: заголовок с периодом, шесть финансовых показателей и
  //  полоса компактных панелей. Высоту первого экрана задаёт
  //  css/glassos.css (.gm-экран) — он занимает ровно рабочую область,
  //  поэтому на рабочем разрешении прокручивать ничего не нужно.
  //
  //  Ниже, за первым экраном, остаётся ВСЁ, что было раньше: советы,
  //  «что заказать», все месяцы, группы товаров, проценты по валютам,
  //  долги, оплаты и стоимость товара. Ни одна цифра не убрана — она
  //  просто перестала бороться за место с главным.
  // ------------------------------------------------------------------
  const topbar = el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Дашборд" }), el("div.sub", { text: db_mode(ctx) })]),
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" } }, [periodTabs, periodSel]),
  ]);
  const kpiHost = el("div.gm-kpi");
  const boardHost = el("div.gm-board");
  // .gm-сквозной — чтобы лесенка появления (js/glassos.js) считала
  // блоками сами показатели и панели, а не одну общую обёртку.
  page.append(el("div.gm-экран.gm-сквозной", {}, [topbar, kpiHost, boardHost]));

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
    // Товар, которого нет на складе, но он уже едет, — это не «под заказ»:
    // заказывать его второй раз не нужно. Считаем дорогу до обхода.
    const дорога = картаДороги(purchases);
    products.forEach(p => {
      const bs = ensureBatches(p);
      stockUSD += bs.reduce((t, b) => t + (Number(b.qty) || 0) * (Number(b.cost_usd) || 0), 0);
      stockUnits += Number(p.stock_qty) || 0;
      if (statusOf(p) === "in_stock") inStock++;
      else if (!едетВместоНет(дорога, p)) onOrder++;   // едущее — не «под заказ»
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
    // --- деньги вне склада: «в дороге» и «в заказанных товарах» ---
    //
    // ВАЖНО, ЧТОБЫ НЕ СЧИТАТЬ ОДНИ ДЕНЬГИ ДВАЖДЫ. У прихода два
    // состояния: «пришёл» (arrived) — товар уже на складе и его
    // стоимость сидит в партиях, и всё остальное — товар оплачен или
    // заказан, но до склада не дошёл.
    //
    // Техзадание просит показать эти «не дошедшие» деньги двумя разными
    // показателями: что уже едет и что только заказано поставщику.
    // В базе такого различия не было — был один статус «в дороге».
    // Поэтому вводится третий статус "ordered" («заказан, ещё не
    // выехал»), и он НЕ меняет ни одной существующей цифры: пока
    // владелец не начнёт им пользоваться, заказанных приходов нет,
    // и показатель честно говорит «нет данных» вместо нуля.
    //
    // Суммы не пересекаются: каждый приход попадает ровно в одну
    // корзину по своему статусу.
    let transitUSD = 0, orderedUSD = 0, orderedCount = 0;
    purchases.forEach(s => {
      if (s.status === "arrived") return;                 // уже на складе
      const заказан = s.status === "ordered";
      let сумма = 0;
      (s.items || []).forEach(it => { сумма += toUSD(it.qty * it.unit_cost, it.currency || s.currency); });
      if (заказан) { orderedUSD += сумма; orderedCount++; } else { transitUSD += сумма; }
    });
    // «Всего» по-прежнему вся стоимость товара вне продажи: склад + дорога + заказы.
    const totalStockUSD = stockUSD + transitUSD + orderedUSD;
    // нет на складе, но едет
    const transitOOS = products.filter(p => едетВместоНет(дорога, p));
    const вПути = products.filter(p => вДороге(дорога, p));
    // остаток не сходится с суммой партий (фантомные «1» с пустыми партиями → станут 0)
    const mismatch = products.filter(p => sumQty(ensureBatches(p)) !== (Number(p.stock_qty) || 0));

    wrap.innerHTML = "";
    kpiHost.innerHTML = "";
    boardHost.innerHTML = "";

    // Всё, что требует внимания, собирается в один список и показывается
    // компактными строками в панели «Требует внимания» на первом экране.
    // Раньше это были девять широких карточек, которые занимали экран
    // целиком и отодвигали цифры за край.
    const внимание = [];

    // предупреждения
    if (badCost.length) внимание.push(вним("alert", `Проверьте себестоимость: ${сколько(badCost.length, "товар", "товара", "товаров")}`, "Себестоимость выше цены продажи — искажает прибыль. Нажмите, чтобы посмотреть.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)", () => costWarnModal(badCost, editProduct, ctx)));
    if (nextTooPricey.length) внимание.push(вним("truck", `Новый приход дороже цены продажи: ${сколько(nextTooPricey.length, "товар", "товара", "товаров")}`, "Пока продаётся старый (дешёвый) товар — всё в порядке. Но когда он закончится, пойдёт убыток: поднимите цену заранее. Нажмите — список.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)",
      () => { location.hash = "#stock_check"; }));
    if (noPrice.length) внимание.push(вним("tag", `Товары без цены (себестоимости): ${noPrice.length}`, "Нажмите, чтобы открыть список и вписать себестоимость.", "rgba(245,197,66,.6)", "rgba(245,197,66,.10)", () => productListModal("Товары без себестоимости", noPrice, editProduct)));
    if (lowStock.length) внимание.push(вним("box", `Заканчивается на складе: ${сколько(lowStock.length, "товар", "товара", "товаров")}`, `Остаток ≤ ${LOW_STOCK}. «→ 0» — если товара физически нет (обнулить). Или нажмите на товар, чтобы изменить.`, "rgba(245,158,11,.6)", "rgba(245,158,11,.08)", () => productListModal(`Заканчивается на складе (остаток ≤ ${LOW_STOCK})`, lowStock.slice(), editProduct, async (p) => {
      p.stock_qty = 0; p.batches = [];
      try { await ctx.db.products.upsert({ id: p.id, stock_qty: 0, batches: [] }); }
      catch { await ctx.db.products.upsert({ id: p.id, stock_qty: 0 }); }
    })));
    if (pendingOrders.length) внимание.push(вним("cart", `Заказы не оформлены: ${pendingOrders.length}`, "Эти заказы ещё НЕ списаны со склада. Оформите их в «Заказы» — тогда остаток уменьшится.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)", () => { location.hash = "#orders"; }));
    // накладные оформлены, но товар со склада не списался — можно списать одним действием
    const unapplied = unappliedSales(sales, 7);
    if (unapplied.length) внимание.push(вним("receipt", `Проверьте списание со склада: ${сколько(unapplied.length, "накладная", "накладные", "накладных")}`, "Нет отметки, что товар ушёл с остатка. Нажмите — сверить «было → станет» и списать нужные.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)",
      () => { location.hash = "#stock_check"; }));
    // ушли в минус: продали больше, чем было — эти товары нужно докупить
    const negative = products.filter(p => (Number(p.stock_qty) || 0) < 0).sort((a, b) => (Number(a.stock_qty) || 0) - (Number(b.stock_qty) || 0));
    if (negative.length) внимание.push(вним("alert", `Ушли в минус: ${сколько(negative.length, "товар", "товара", "товаров")}`, "Продано больше, чем было на складе. Нажмите — список, сколько нужно докупить.", "rgba(239,68,68,.55)", "rgba(239,68,68,.08)",
      () => { location.hash = "#stock_check"; }));
    // нет на складе, но товар уже в пути
    if (transitOOS.length) внимание.push(вним("truck", `В пути (нет на складе): ${сколько(transitOOS.length, "товар", "товара", "товаров")}`, "Этих товаров нет на складе, но они уже едут. Нажмите — список с количеством и поставщиком.", "rgba(59,130,246,.5)", "rgba(59,130,246,.08)",
      () => productListModal("В пути — нет на складе", transitOOS.slice(), editProduct, null, (p) => "🚚 " + подписьДороги(вДороге(дорога, p)))));
    // остаток не сходится с партиями — пересчитать
    if (mismatch.length) внимание.push(вним("box", `Остаток не сходится с партиями: ${mismatch.length}`, "Возможны «фантомные» остатки (напр. «1», но товара нет). Нажмите — пересчитать остаток по партиям.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)",
      () => confirmDialog(`Пересчитать остаток по партиям у ${сколько(mismatch.length, "товара", "товаров", "товаров")}? (фантомные станут 0)`, async () => {
        for (const p of mismatch) { const q = sumQty(ensureBatches(p)); try { await ctx.db.products.upsert({ id: p.id, stock_qty: q, batches: ensureBatches(p) }); } catch { try { await ctx.db.products.upsert({ id: p.id, stock_qty: q }); } catch {} } }
        toast("Остатки пересчитаны", "ok"); ctx.refresh();
      })));

    // ================================================================
    //  ПЕРВЫЙ ЭКРАН: шесть показателей и панели
    // ================================================================
    рисоватьПоказатели({
      оборот: salesUSD, прибыль: profitUSD,
      долг: totalDebt, оплачено: payTotals,
      дорога: transitUSD, заказано: orderedUSD, заказовШтук: orderedCount,
    });
    рисоватьПанели({
      salesUSD, profitUSD, realProfitUSD, salesSeries, profitSeries,
      внимание, fSales, reorder, stockUnits, inStock, onOrder, вПути,
      stockUSD, transitUSD, orderedUSD, totalStockUSD, perLabel,
    });

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
          el("td", {}, [el("strong", { text: money(cur.profit), style: { color: cur.profit >= 0 ? "var(--ok)" : "var(--danger)" } })]),
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
      dualCard("В заказанных товарах", orderedUSD, "cart"),
      dualCard("Всего (склад + дорога + заказы)", totalStockUSD, "sigma"),
    ]));
    wrap.append(el("div.stat-grid", {}, [
      miniCard("Единиц на складе", stockUnits, "hash"),
      miniCard("Есть в наличии", inStock, "check", () => productListModal("Товары в наличии", products.filter(p => statusOf(p) === "in_stock"), editProduct)),
      miniCard("Под заказ", onOrder, "clock", () => productListModal("Товары под заказ", products.filter(p => statusOf(p) === "on_order" && !едетВместоНет(дорога, p)), editProduct)),
      miniCard("В дороге", вПути.length, "truck", () => productListModal("Товары в дороге", вПути.slice(), editProduct, null, (p) => "🚚 " + подписьДороги(вДороге(дорога, p)))),
    ]));

    // пошаговое появление карточек
    requestAnimationFrame(() => wrap.querySelectorAll(".reveal").forEach((n, i) => setTimeout(() => n.classList.add("in"), i * 35)));
  }

  // Описание того, что требует внимания. Раньше каждое было широкой
  // карточкой и девять таких занимали весь экран. Теперь это запись в
  // списке: панель «Требует внимания» рисует из неё компактную строку,
  // а нажатие открывает то же самое, что открывало раньше.
  function вним(ic, title, sub, bColor, bg, onclick) {
    // Красная кромка приходила только от «ушли в минус» — по ней и
    // отличаем срочное от обычного предупреждения.
    const уровень = /239,\s*68,\s*68/.test(String(bColor)) ? "danger"
      : /59,\s*130,\s*246/.test(String(bColor)) ? "info" : "warn";
    return { ic, title, sub, onclick, уровень };
  }

  // ==================================================================
  //  ШЕСТЬ ФИНАНСОВЫХ ПОКАЗАТЕЛЕЙ
  //
  //  Все суммы — из тех же расчётов, что и раньше: оборот и прибыль
  //  считает js/profit.js (aggregate), долг — js/debt.js, оплаты и
  //  приходы берутся как есть. Ничего не придумано: если данных для
  //  расчёта нет, в карточке стоит «нет данных», а не ноль — иначе
  //  пустая база выглядела бы как «ничего не продали».
  //
  //  Мультивалютные суммы (долг, оплаты) приводятся к выбранной валюте
  //  показа по курсу из Настроек — так же, как остальной дашборд.
  // ==================================================================
  function рисоватьПоказатели({ оборот, прибыль, долг, оплачено, дорога, заказано, заказовШтук }) {
    const вПоказе = (поВалютам) => ["som", "usd", "yuan"]
      .reduce((сумма, c) => сумма + convert(Number(поВалютам[c]) || 0, c, curView), 0);
    const естьПродажи = fSalesДляПериода().length > 0;
    const долгВсего = вПоказе(долг);
    const оплатВсего = вПоказе(оплачено);
    const былиОплаты = ["som", "usd", "yuan"].some(c => (Number(оплачено[c]) || 0) !== 0);

    const карточки = [
      {
        ic: "wallet", вид: "", label: "Оборот",
        есть: естьПродажи, знач: money(оборот), дельта: дельтаПоказателя("оборот"),
        tip: "Сумма всех продаж за выбранный период. Каждая позиция пересчитана в доллары по курсу накладной, затем в валюту показа по курсу из Настроек.",
      },
      {
        ic: "chart", вид: прибыль >= 0 ? "gm-k-ok" : "gm-k-danger", label: "Прибыль",
        есть: естьПродажи, знач: money(прибыль), дельта: дельтаПоказателя("прибыль"),
        tip: "По правилам групп товаров (иглы, ножи и т.д.) плюс общий процент у остальных. Прибыль по фактической себестоимости — в панели «Продажи и прибыль».",
      },
      {
        ic: "user", вид: долгВсего > 0 ? "gm-k-warn" : "gm-k-ok", label: "Должники",
        есть: true, знач: fmt(долгВсего, curView),
        под: подписьПоВалютам(долг),
        tip: "Текущий долг всех клиентов: выданные накладные минус оплаты, по каждой валюте отдельно. Переплаты в минус не уходят. Показатель текущий — от выбранного периода не зависит.",
      },
      {
        ic: "check", вид: "gm-k-ok", label: "Оплачено",
        есть: былиОплаты, знач: fmt(оплатВсего, curView),
        // Юани в подписи не показываем: клиенты платят в сумах и долларах,
        // а юаневая строка — это копейки от редких расчётов, и она только
        // удлиняла подпись до третьей строки. В общую сумму юани входят.
        под: подписьПоВалютам(оплачено, ["som", "usd"]),
        дельта: дельтаПоказателя("оплачено"),
        tip: "Деньги, полученные от клиентов за выбранный период. В сумму входят все валюты; под ней расписаны сумы и доллары.",
      },
      {
        ic: "truck", вид: "", label: "Деньги в дороге",
        есть: дорога > 0, знач: money(дорога),
        под: "себестоимость · " + fmt(convert(дорога, "usd", "som"), "som"),
        tip: "Себестоимость товара, который оплачен или отправлен, но на склад ещё не поступил (приходы со статусом «В дороге»). В остаток склада эти деньги не входят — двойного счёта нет.",
      },
      {
        ic: "cart", вид: "", label: "В заказанных товарах",
        есть: заказовШтук > 0, знач: money(заказано),
        под: заказовШтук ? заказовШтук + " заказ(ов) поставщику" : "отметьте приход статусом «Заказан»",
        tip: "Деньги, вложенные в оформленные заказы поставщику, которые ещё не выехали (статус прихода «Заказан»). Считается отдельно от «в дороге», чтобы одни и те же деньги не попали в два показателя. Пока ни один приход не отмечен этим статусом, показатель честно пуст.",
      },
    ];

    карточки.forEach(к => {
      const знач = к.есть
        ? el("div.gm-k-val", { text: к.знач })
        : el("div.gm-k-val.gm-нет", { text: "нет данных" });
      const низ = [];
      if (к.есть) {
        if (к.дельта) низ.push(el("span.gm-k-delta." + к.дельта.сторона, { text: к.дельта.текст }));
        if (к.под) низ.push(el("span", { text: к.под }));
      } else {
        // Данных нет — объясняем почему, но ровно один раз.
        низ.push(el("span", { text: к.под || "за период данных нет" }));
      }
      // Класс stat-card добавлен не для красоты: на телефоне слой
      // GlassOS отключён, и карточку оформляет css/theme.css — тот же
      // вид, что был у показателей до редизайна. На компьютере правила
      // .gm-kpi .gm-k весят больше и побеждают.
      kpiHost.append(el("div.gm-k.stat-card" + (к.вид ? "." + к.вид : ""), { "data-tip": к.tip }, [
        el("div.gm-k-top", {}, [
          el("div.gm-k-ic", {}, [icon(к.ic, { size: 15 })]),
          el("div.gm-k-lab", { text: к.label }),
        ]),
        знач,
        низ.length ? el("div.gm-k-sub", {}, низ) : null,
      ].filter(Boolean)));
    });
  }

  // Продажи выбранного периода нужны в двух местах — считаем одним кодом.
  function fSalesДляПериода() { return sales.filter(s => matchPeriod(s.date, period)); }

  // Какой период считать «прошлым» для сравнения. Для «всего времени»
  // прошлого нет, поэтому индикатор изменения там не показывается.
  // Для сегодняшнего дня прошлое — вчера; matchPeriod такого значения не
  // знает, поэтому для него возвращается ключ конкретного дня.
  function предыдущийПериод(сел) {
    const n = new Date();
    if (сел === "today") {
      const в = new Date(n); в.setDate(в.getDate() - 1);
      return "d:" + в.toISOString().slice(0, 10);
    }
    if (сел === "this_month") return "last_month";
    if (сел === "this_year") return "y:" + (n.getFullYear() - 1);
    if (сел === "last_month") {
      const d = new Date(n.getFullYear(), n.getMonth() - 2, 1);
      return "m:" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    }
    if (String(сел).startsWith("m:")) {
      const [yy, mm] = сел.slice(2).split("-").map(Number);
      const d = new Date(yy, mm - 2, 1);
      return "m:" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    }
    if (String(сел).startsWith("y:")) return "y:" + (Number(сел.slice(2)) - 1);
    return null;      // всё время, сезоны — сравнивать не с чем
  }

  // matchPeriod не умеет «конкретный день» — добавляем только здесь,
  // чтобы не менять общий модуль периодов, которым живут другие разделы.
  function вПериоде(дата, сел) {
    if (String(сел).startsWith("d:")) {
      const d = new Date(дата);
      return !isNaN(d) && d.toISOString().slice(0, 10) === сел.slice(2);
    }
    return matchPeriod(дата, сел);
  }

  // Подпись «сколько в каждой валюте» — чтобы пересчёт в одну валюту не
  // скрывал, что часть долга в юанях, а часть в сумах.
  function подписьПоВалютам(поВалютам, какие) {
    const части = (какие || ["som", "usd", "yuan"])
      .filter(c => Math.abs(Number(поВалютам[c]) || 0) > 0.009)
      .map(c => fmt(поВалютам[c], c));
    return части.length > 1 ? части.join(" · ") : "";
  }

  // Изменение к предыдущему такому же периоду. Если сравнивать не с чем
  // (выбрано «всё время» или в прошлом периоде нуль) — индикатора нет:
  // «+∞ %» не значит ничего.
  function дельтаПоказателя(что) {
    const прошлый = предыдущийПериод(period);
    if (!прошлый) return null;
    const сейчас = значениеЗа(period, что);
    const было = значениеЗа(прошлый, что);
    if (!isFinite(было) || Math.abs(было) < 0.01) return null;
    const проц = ((сейчас - было) / Math.abs(было)) * 100;
    if (!isFinite(проц)) return null;
    const вверх = проц >= 0;
    return { сторона: вверх ? "up" : "down", текст: (вверх ? "▲ " : "▼ ") + Math.abs(проц).toFixed(0) + "%" };
  }

  function значениеЗа(пер, что) {
    if (что === "оплачено") {
      return payments.filter(p => вПериоде(p.date, пер))
        .reduce((т, p) => т + toUSD(Number(p.amount) || 0, p.currency), 0);
    }
    const pmap = Object.fromEntries(products.map(p => [p.id, p]));
    const a = aggregate(sales.filter(s => вПериоде(s.date, пер)), pmap, rules, pct);
    return что === "прибыль" ? a.total.profit : a.total.rev;
  }

  // ==================================================================
  //  ПАНЕЛИ ПЕРВОГО ЭКРАНА
  // ==================================================================
  function рисоватьПанели(д) {
    // --- 1. Продажи и прибыль: график за 14 дней и три итога ---
    let график;
    if (д.salesSeries.some(x => x > 0)) {
      const рисунок = el("div.gm-график");
      рисунок.innerHTML = графикПродаж(д.salesSeries, д.profitSeries);
      const день = k => { const d = new Date(); d.setDate(d.getDate() - k); return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }); };
      график = [рисунок, el("div.gm-график-подпись", {}, [
        el("span", { text: день(д.salesSeries.length - 1) }),
        el("span.gm-легенда", {}, [el("i.об"), "Оборот", el("i.пр"), "Прибыль · 14 дней"]),
        el("span", { text: "сегодня" }),
      ])];
    } else {
      график = [el("div.hint", { text: "Продаж за последние 14 дней не было — графику нечего показать." })];
    }
    const итог = (подпись, usd, цвет) => el("div", { style: { minWidth: "0" } }, [
      el("div.gm-k-lab", { text: подпись }),
      el("div", { style: { fontWeight: "800", fontSize: "1rem", color: цвет || "inherit", whiteSpace: "nowrap" }, text: money(usd) }),
    ]);
    boardHost.append(панель("Продажи и прибыль " + д.perLabel, "chart", [
      el("div", { style: { display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "6px" } }, [
        итог("Оборот", д.salesUSD),
        итог("Прибыль по правилам", д.profitUSD, "var(--ok)"),
        итог("По себестоимости", д.realProfitUSD, "var(--muted)"),
      ]),
      ...график,
    ], { ещё: ["Отчёты", () => { location.hash = "#/reports"; }], вкладки: makeCurTabs(), класс: "gm-panel-chart" }));

    // --- 2. Требует внимания ---
    const строки = д.внимание.map(в => el("div.gm-li.gm-li-wrap", { onclick: в.onclick, "data-tip": в.sub }, [
      el("span", {
        style: {
          display: "flex", flex: "0 0 auto",
          color: в.уровень === "danger" ? "var(--danger)" : в.уровень === "info" ? "#60a5fa" : "var(--warn)",
        },
      }, [icon(в.ic, { size: 16 })]),
      el("span.gm-li-t", { text: в.title }),
      el("span.gm-li-s", { text: "›" }),
    ]));
    boardHost.append(панель(
      строки.length ? `Требует внимания · ${строки.length}` : "Требует внимания",
      строки.length ? "alert" : "check",
      строки.length ? строки : [el("div.hint", { text: "Всё в порядке: цены на месте, остатки сходятся, заказы оформлены." })],
    ));

    // --- 3. Склад ---
    const числа = el("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "8px" } }, [
      итог2("Единиц", д.stockUnits),
      итог2("В наличии", д.inStock),
      итог2("Под заказ", д.onOrder),
      итог2("В дороге", д.вПути.length),
    ]);
    const заказать = д.reorder.slice(0, 20).map(x => el("div.gm-li", { onclick: () => editProduct(x.p) }, [
      el("span.gm-li-t", { text: x.p.name }),
      el("span.gm-li-s", { text: "ост. " + x.stock }),
      el("span.gm-li-v", { text: x.sold + " шт/30дн" }),
    ]));
    boardHost.append(панель("Состояние склада", "box", [
      числа,
      el("div.gm-k-lab", { text: заказать.length ? "Продаётся, но заканчивается" : "" }),
      ...(заказать.length ? заказать : [el("div.hint", { text: "Докупать пока нечего — у ходовых товаров остаток в порядке." })]),
    ], { ещё: ["Товары", () => { location.hash = "#/products"; }] }));

    // --- 4. Последние продажи ---
    const последние = [...д.fSales]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20)
      .map(s => {
        const сумма = (s.items || []).reduce((т, it) => т + itemRevenueUSD(it, s), 0);
        return el("div.gm-li", { onclick: () => { location.hash = "#/sales"; } }, [
          el("span.gm-li-t", { text: cmap[s.customer_id] || "Без клиента" }),
          el("span.gm-li-s", { text: new Date(s.date).toLocaleDateString("ru-RU") }),
          el("span.gm-li-v", { text: money(сумма) }),
        ]);
      });
    boardHost.append(панель("Последние продажи " + д.perLabel, "receipt",
      последние.length ? последние : [el("div.hint", { text: "За выбранный период продаж не было." })],
      { ещё: ["Продажи", () => { location.hash = "#/sales"; }] }));

    // --- 5. Деньги в товаре ---
    boardHost.append(панель("Деньги в товаре", "sigma", [
      строкаДенег("На складе", д.stockUSD),
      строкаДенег("В дороге", д.transitUSD),
      строкаДенег("В заказанных", д.orderedUSD),
      el("div", { style: { borderTop: "1px solid var(--glass-line)", marginTop: "6px", paddingTop: "6px" } },
        [строкаДенег("Всего", д.totalStockUSD, true)]),
    ]));

    // --- 6. Быстрые действия ---
    const действие = (подпись, ic, куда) => {
      const b = el("button", {}, [icon(ic, { size: 15 }), el("span", { text: подпись })]);
      b.type = "button";
      b.addEventListener("click", () => { location.hash = "#/" + куда; });
      return b;
    };
    boardHost.append(панель("Быстрые действия", "sparkle", [
      el("div.gm-quick", {}, [
        действие("Новая продажа", "receipt", "sales"),
        действие("Новый приход", "truck", "purchases"),
        действие("Заказ поставщику", "cart", "supplier_order"),
        действие("Проверка склада", "check", "stock_check"),
        действие("Товары", "box", "products"),
        действие("Клиенты", "user", "customers"),
        действие("Отчёты", "chart", "reports"),
        действие("Настройки", "settings", "settings"),
      ]),
    ]));
  }

  function итог2(подпись, число) {
    return el("div", {}, [
      el("div.gm-k-lab", { text: подпись }),
      el("div", { style: { fontWeight: "800", fontSize: "1rem" }, text: Math.round(Number(число) || 0).toLocaleString("ru-RU") }),
    ]);
  }

  function строкаДенег(подпись, usd, жирно) {
    return el("div.gm-li", { style: { cursor: "default" } }, [
      el("span.gm-li-t", { text: подпись, style: жирно ? { fontWeight: "700" } : null }),
      el("span.gm-li-s", { text: "$" + Math.round(usd).toLocaleString("ru-RU") }),
      el("span.gm-li-v", { text: fmt(convert(usd, "usd", curView), curView) }),
    ]);
  }

  // Стеклянная панель первого экрана: заголовок, необязательные вкладки
  // валюты и кнопка «подробнее», содержимое со своей прокруткой.
  function панель(заголовок, ic, содержимое, опции = {}) {
    const шапка = el("div.gm-panel-h", {}, [
      el("span", { style: { display: "flex", color: "var(--accent)" } }, [icon(ic, { size: 15 })]),
      el("span", { text: заголовок }),
    ]);
    if (опции.вкладки) шапка.append(el("div", { style: { marginLeft: "auto" } }, [опции.вкладки]));
    if (опции.ещё) {
      const [подпись, действие] = опции.ещё;
      const b = el("button.gm-panel-more", { text: подпись + " ›", onclick: действие });
      b.type = "button";
      if (!опции.вкладки) b.style.marginLeft = "auto";
      шапка.append(b);
    }
    // .card — по той же причине: на телефоне панель оформляет тема.
    return el("div.gm-panel.card" + (опции.класс ? "." + опции.класс : ""), {}, [шапка, el("div.gm-panel-body", {}, содержимое)]);
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
