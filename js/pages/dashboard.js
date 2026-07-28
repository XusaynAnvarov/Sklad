// ========================================================================
//  ДАШБОРД — мультивалютные итоги: продажи, себестоимость, приход, остаток
// ========================================================================
import { el, animateCount, modal, input, toast, confirmDialog } from "../ui.js";
import { fmt, convert, toUSD, CUR } from "../fx.js";
import { statusOf, placeholder, openForm as openProductForm } from "./products.js";
import { ensureBatches, sumQty } from "../inventory.js";
import { sparkline } from "../charts.js";
import { icon } from "../icons.js";

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
      el("img.thumb", { src: p.photo_url || placeholder(p.name), style: { width: "38px", height: "38px" }, onerror: function () { this.src = placeholder(p.name); } }),
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

function inPeriod(dateStr, period) {
  if (period === "all") return true;
  const d = new Date(dateStr), now = new Date();
  if (period === "day") return d.toDateString() === now.toDateString();
  if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === "year") return d.getFullYear() === now.getFullYear();
  return true;
}

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
  customers.forEach(c => {
    const d = { som: 0, usd: 0, yuan: 0 };
    sales.forEach(s => { if (s.customer_id === c.id) (s.items || []).forEach(it => { const cc = it.currency || s.currency; if (d[cc] !== undefined) d[cc] += it.qty * it.unit_price; }); });
    const od = c.opening_debt || {};
    ["som", "usd", "yuan"].forEach(k => d[k] += Number(od[k]) || 0);
    payments.forEach(p => { if (p.customer_id === c.id && d[p.currency] !== undefined) d[p.currency] -= Number(p.amount) || 0; });
    ["som", "usd", "yuan"].forEach(k => { if (d[k] > 0) totalDebt[k] += d[k]; });
  });

  // прибыль-% (по валютам): облако с резервом в localStorage
  const settings = await ctx.db.getSettings().catch(() => ({}));
  const pct = readPct(settings);

  let period = "all";
  const periodTabs = el("div.pill-tabs", {}, [
    tab("Сегодня", "day"), tab("Месяц", "month"), tab("Год", "year"), tab("Всё время", "all"),
  ]);
  function tab(label, val) {
    const b = el("button", { text: label, onclick: () => { period = val; [...periodTabs.children].forEach(c => c.classList.remove("active")); b.classList.add("active"); compute(); } });
    if (val === "all") b.classList.add("active");
    return b;
  }

  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Дашборд" }), el("div.sub", { text: db_mode(ctx) })]),
    periodTabs,
  ]));

  const wrap = el("div");
  page.append(wrap);

  function compute() {
    const fSales = sales.filter(s => inPeriod(s.date, period));
    const fPays = payments.filter(p => inPeriod(p.date, period));
    const perLabel = period === "day" ? "за сегодня" : period === "month" ? "за месяц" : period === "year" ? "за год" : "за всё время";

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
    // «битая» себестоимость, исключая отмеченные как проверенные (локально gm_cost_ack ИЛИ в базе cost_ack_yuan)
    const badCost = products.filter(p => Number(p.price_yuan) > 0 && Number(p.cost_yuan) > Number(p.price_yuan) && Number(ack[p.id]) !== Number(p.cost_yuan) && Number(p.cost_ack_yuan) !== Number(p.cost_yuan));

    // --- оборот по валютам (нативно) + всего в $; прибыль = оборот × % ---
    const turnByCur = { som: 0, usd: 0, yuan: 0 };
    fSales.forEach(s => (s.items || []).forEach(it => { const c = it.currency || s.currency; if (turnByCur[c] !== undefined) turnByCur[c] += it.qty * it.unit_price; }));
    const salesUSD = ["som", "usd", "yuan"].reduce((t, c) => t + toUSD(turnByCur[c], c), 0);
    const profitByCur = { som: 0, usd: 0, yuan: 0 };
    ["som", "usd", "yuan"].forEach(c => profitByCur[c] = turnByCur[c] * (pct[c] || 0) / 100);
    const profitUSD = ["som", "usd", "yuan"].reduce((t, c) => t + toUSD(profitByCur[c], c), 0);

    // --- РЕАЛЬНАЯ прибыль = выручка − себестоимость (cogs_usd хранится на позиции при оформлении) ---
    const pmap = Object.fromEntries(products.map(p => [p.id, p]));
    const cogsUSDof = (it) => it.cogs_usd != null ? Number(it.cogs_usd) : (Number(pmap[it.product_id]?.cost_usd) || 0) * (Number(it.qty) || 0);
    let realProfitUSD = 0;
    fSales.forEach(s => (s.items || []).forEach(it => { const c = it.currency || s.currency; const rev = toUSD(it.qty * it.unit_price, c); const cogs = cogsUSDof(it); if (isFinite(rev) && isFinite(cogs)) realProfitUSD += rev - cogs; }));

    // --- дневные ряды за последние 14 дней (для мини-графиков) ---
    const DAYS = 14, today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const salesSeries = new Array(DAYS).fill(0), profitSeries = new Array(DAYS).fill(0), realProfitSeries = new Array(DAYS).fill(0);
    sales.forEach(s => {
      const d = new Date(s.date); d.setHours(0, 0, 0, 0);
      const idx = DAYS - 1 - Math.round((today0 - d) / 86400000);
      if (idx < 0 || idx >= DAYS) return;
      (s.items || []).forEach(it => { const c = it.currency || s.currency; const usd = toUSD(it.qty * it.unit_price, c); if (!isFinite(usd)) return; salesSeries[idx] += usd; profitSeries[idx] += usd * ((pct[c] || 0) / 100); const cg = cogsUSDof(it); if (isFinite(cg)) realProfitSeries[idx] += usd - cg; });
    });

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
    if (noPrice.length) wrap.append(warnCard("tag", `Товары без цены (себестоимости): ${noPrice.length}`, "Нажмите, чтобы открыть список и вписать себестоимость.", "rgba(245,197,66,.6)", "rgba(245,197,66,.10)", () => productListModal("Товары без себестоимости", noPrice, editProduct)));
    if (lowStock.length) wrap.append(warnCard("box", `Заканчивается на складе: ${lowStock.length} товаров`, `Остаток ≤ ${LOW_STOCK}. «→ 0» — если товара физически нет (обнулить). Или нажмите на товар, чтобы изменить.`, "rgba(245,158,11,.6)", "rgba(245,158,11,.08)", () => productListModal(`Заканчивается на складе (остаток ≤ ${LOW_STOCK})`, lowStock.slice(), editProduct, async (p) => {
      p.stock_qty = 0; p.batches = [];
      try { await ctx.db.products.upsert({ id: p.id, stock_qty: 0, batches: [] }); }
      catch { await ctx.db.products.upsert({ id: p.id, stock_qty: 0 }); }
    })));
    if (pendingOrders.length) wrap.append(warnCard("cart", `Заказы не оформлены: ${pendingOrders.length}`, "Эти заказы ещё НЕ списаны со склада. Оформите их в «Заказы» — тогда остаток уменьшится.", "rgba(245,158,11,.6)", "rgba(245,158,11,.08)", () => { location.hash = "#orders"; }));
    // ушли в минус: продали больше, чем было — эти товары нужно докупить
    const negative = products.filter(p => (Number(p.stock_qty) || 0) < 0).sort((a, b) => (Number(a.stock_qty) || 0) - (Number(b.stock_qty) || 0));
    if (negative.length) wrap.append(warnCard("alert", `Ушли в минус: ${negative.length} товаров`, "Продано больше, чем было на складе. Нажмите — список, сколько нужно докупить.", "rgba(239,68,68,.55)", "rgba(239,68,68,.08)",
      () => productListModal("Не хватает на складе (минус)", negative.slice(), editProduct, null, (p) => "не хватает: " + Math.abs(Number(p.stock_qty) || 0))));
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

    // оборот + прибыль (всего, $)
    wrap.append(el("div.section-h", { text: "Оборот и прибыль " + perLabel }));
    wrap.append(el("div.stat-grid", {}, [
      bigCard("Оборот всего", salesUSD, "wallet", true, salesSeries),
      bigCard("Реальная прибыль (по себест.)", realProfitUSD, "chart", true, realProfitSeries),
      bigCard("Прибыль по % (оценка)", profitUSD, "chart", false, profitSeries),
    ]));

    // оборот и прибыль по валютам (% задаёт владелец)
    wrap.append(el("div.section-h", { text: "Оборот и прибыль по валютам (% впишите сами)" }));
    wrap.append(el("div.stat-grid", {}, [
      profitCard("som", turnByCur.som, profitByCur.som),
      profitCard("usd", turnByCur.usd, profitByCur.usd),
      profitCard("yuan", turnByCur.yuan, profitByCur.yuan),
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
  function bigCard(label, usd, ic, grad, series) {
    const v = el("div.st-value");
    const c = el("div" + (grad ? ".stat-card.grad.reveal" : ".stat-card.reveal"), {}, [
      el("div.st-ic", {}, [icon(ic, { size: 22 })]), el("div.st-label", { text: label }), v, el("div.st-sub", { text: "в долларах · 14 дней" }),
    ]);
    animateCount(v, usd, n => "$" + Math.round(n).toLocaleString("ru-RU"));
    if (series && series.some(x => x > 0)) {
      const sw = el("div", { style: { marginTop: "12px" } });
      sw.innerHTML = sparkline(series, { color: grad ? "rgba(255,255,255,.85)" : "#a78bfa", height: 50 });
      c.append(sw);
    }
    return c;
  }
  // карточка валюты: оборот (нативно) + поле «%» + прибыль
  function profitCard(cur, turn, profit) {
    const v = el("div.st-value");
    const pv = el("div", { style: { marginTop: "8px", fontWeight: "700", color: "var(--ok)" }, text: "Прибыль: " + fmt(profit, cur) });
    const inp = input({ type: "number", step: "0.1", value: pct[cur] || "", placeholder: "0", style: { width: "92px", padding: "8px 10px", textAlign: "center" } });
    inp.addEventListener("change", async () => { pct[cur] = +inp.value || 0; await savePct(ctx, pct); compute(); });
    const c = el("div.stat-card.reveal", {}, [
      el("div.st-label", { text: "Оборот · " + CUR[cur].label }), v,
      el("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" } }, [inp, el("span.muted", { text: "% прибыли" })]),
      pv,
    ]);
    animateCount(v, turn, n => fmt(n, cur));
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
