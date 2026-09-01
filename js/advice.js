// ========================================================================
//  СОВЕТЫ — что сделать по данным склада и продаж.
//  Считаются по ВСЕЙ истории (не по выбранному периоду): совет должен быть
//  про «сейчас», а не про выбранный в фильтре месяц.
//  Три группы: сезон · деньги · склад.
//  Используют и Отчёты (полный список), и Дашборд (топ-3).
// ========================================================================
import { seasonOf, nextSeason, SEASON_LABEL, SEASON_ICON } from "./period.js?v=20260901a";
import { itemRevenueUSD, itemProfitUSD, ruleFor } from "./profit.js?v=20260901a";
import { ensureBatches } from "./inventory.js?v=20260901a";

const DAY = 86400000;
export const LOW_STOCK = 5;   // «заканчивается» — общий порог для советов и полоски на карточке
const STALE_DAYS = 90;        // «залежалось»
const SEASON_MIN_QTY = 6;     // меньше — статистика ничего не значит
const SEASON_FACTOR = 1.6;    // в сезон продавалось хотя бы в 1.6 раза лучше среднего

const stockOf = (p) => Number(p?.stock_qty) || 0;
const stockCostUSD = (p) => ensureBatches(p).reduce((t, b) => t + (Number(b.qty) || 0) * (Number(b.cost_usd) || 0), 0);

// Собрать все советы. sales — ВСЕ продажи, products — все товары.
export function buildAdvice(products, sales, rules, pct) {
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const now = Date.now();
  const cur = seasonOf(new Date()), next = nextSeason(cur);

  // разбор истории продаж: сколько продано всего, когда последний раз, сколько по сезонам
  const stat = {};   // product_id → { qty, last, bySeason{}, seasons:Set, rev, profit }
  (sales || []).forEach(s => {
    const t = new Date(s.date).getTime();
    const sea = seasonOf(s.date);
    (s.items || []).forEach(it => {
      const a = stat[it.product_id] = stat[it.product_id] || { qty: 0, last: 0, bySeason: { winter: 0, spring: 0, summer: 0, autumn: 0 }, seasons: new Set(), rev: 0, profit: 0 };
      const q = Number(it.qty) || 0;
      a.qty += q;
      if (isFinite(t) && t > a.last) a.last = t;
      if (sea) { a.bySeason[sea] += q; a.seasons.add(sea + ":" + new Date(s.date).getFullYear()); }
      a.rev += itemRevenueUSD(it, s);
      a.profit += itemProfitUSD(it, s, pmap[it.product_id], rules, pct);
    });
  });

  const sold30 = {};
  (sales || []).forEach(s => { if (now - new Date(s.date).getTime() > 30 * DAY) return; (s.items || []).forEach(it => { sold30[it.product_id] = (sold30[it.product_id] || 0) + (Number(it.qty) || 0); }); });

  const out = [];

  // ---------- 1. СЕЗОН: скоро сезон, а товара мало ----------
  [cur, next].forEach((sea, idx) => {
    const items = [];
    (products || []).forEach(p => {
      const a = stat[p.id]; if (!a || a.qty < SEASON_MIN_QTY) return;
      const inSeason = a.bySeason[sea] || 0;
      if (inSeason <= 0) return;
      const share = inSeason / a.qty;
      // сезонность: доля сезона заметно выше «ровных» 25%
      if (share < 0.25 * SEASON_FACTOR) return;
      const st = stockOf(p);
      if (st > LOW_STOCK) return;
      // сколько брали в такой сезон в среднем за год — столько и советуем
      const years = new Set([...a.seasons].filter(k => k.startsWith(sea + ":")).map(k => k.split(":")[1]));
      const perSeason = Math.round(inSeason / Math.max(1, years.size));
      items.push({ p, need: Math.max(1, perSeason - Math.max(0, st)), share, stock: st, wasSold: inSeason });
    });
    if (!items.length) return;
    items.sort((a, b) => b.need - a.need);
    out.push({
      id: "season_" + sea + "_" + idx,
      kind: "season", ic: "truck", level: "warn",
      title: `${SEASON_ICON[sea]} ${idx === 0 ? "Сейчас" : "Скоро"} ${SEASON_LABEL[sea].toLowerCase()} — закажите сезонные товары (${items.length})`,
      text: `Эти товары в ${SEASON_LABEL[sea].toLowerCase()} продаются заметно лучше, а на складе их почти нет.`,
      items: items.slice(0, 40).map(x => ({
        p: x.p,
        badge: `нужно ~${x.need} шт`,
        sub: `ост: ${x.stock} · в ${SEASON_LABEL[sea].toLowerCase()} продано ${x.wasSold} шт (${Math.round(x.share * 100)}% всех продаж)`,
      })),
      weight: 100 + items.length,
    });
  });

  // ---------- 2. ДЕНЬГИ: продаём в минус или почти без прибыли ----------
  const lowMargin = [];
  (products || []).forEach(p => {
    const a = stat[p.id]; if (!a || a.rev <= 0 || a.qty <= 0) return;
    const margin = a.profit / a.rev * 100;
    if (margin >= 5) return;
    lowMargin.push({ p, margin, rev: a.rev, profit: a.profit, qty: a.qty, rule: ruleFor(p, rules) });
  });
  if (lowMargin.length) {
    lowMargin.sort((a, b) => a.margin - b.margin);
    const loss = lowMargin.filter(x => x.profit < 0).length;
    out.push({
      id: "money_low_margin",
      kind: "money", ic: "alert", level: loss ? "danger" : "warn",
      title: loss ? `Продаём в минус: ${loss} товаров` : `Прибыль почти нулевая: ${lowMargin.length} товаров`,
      text: "Проверьте цену продажи, себестоимость или правило прибыли для этих товаров.",
      items: lowMargin.slice(0, 40).map(x => ({
        p: x.p,
        badge: `${x.margin.toFixed(1)}%`,
        sub: `продано ${x.qty} шт · выручка $${Math.round(x.rev)} · прибыль $${Math.round(x.profit)}${x.rule ? " · правило: " + (x.rule.mode === "fixed_usd" ? "$" + x.rule.value + "/шт" : x.rule.value + "%") : ""}`,
        bad: x.profit < 0,
      })),
      weight: loss ? 200 + loss : 60,
    });
  }

  // ---------- 3. СКЛАД: залежалось (деньги заморожены) ----------
  const stale = [];
  (products || []).forEach(p => {
    const st = stockOf(p); if (st <= 0) return;
    const a = stat[p.id];
    const last = a ? a.last : 0;
    if (last && now - last < STALE_DAYS * DAY) return;
    const frozen = stockCostUSD(p);
    if (frozen <= 0) return;
    stale.push({ p, st, frozen, days: last ? Math.round((now - last) / DAY) : null });
  });
  if (stale.length) {
    stale.sort((a, b) => b.frozen - a.frozen);
    const totalFrozen = stale.reduce((t, x) => t + x.frozen, 0);
    out.push({
      id: "stock_stale",
      kind: "stock", ic: "box", level: "info",
      title: `Залежалось: ${stale.length} товаров на $${Math.round(totalFrozen).toLocaleString("ru-RU")}`,
      text: `Есть на складе, но не продавалось больше ${STALE_DAYS} дней — деньги стоят. Можно сделать скидку или предложить клиентам.`,
      items: stale.slice(0, 40).map(x => ({
        p: x.p,
        badge: "$" + Math.round(x.frozen).toLocaleString("ru-RU"),
        sub: `ост: ${x.st} · ${x.days ? "последняя продажа " + x.days + " дн. назад" : "не продавалось ни разу"}`,
      })),
      weight: Math.min(150, 40 + Math.round(totalFrozen / 100)),
    });
  }

  // ---------- 4. СКЛАД: заканчивается, а спрос есть ----------
  const ending = (products || []).map(p => ({ p, st: stockOf(p), s30: sold30[p.id] || 0 }))
    .filter(x => x.s30 > 0 && x.st <= LOW_STOCK)
    .sort((a, b) => b.s30 - a.s30);
  if (ending.length) {
    out.push({
      id: "stock_ending",
      kind: "stock", ic: "cart", level: "warn",
      title: `Заканчивается, но продаётся: ${ending.length} товаров`,
      text: `Остаток ≤ ${LOW_STOCK}, а за последние 30 дней спрос был. Закажите, пока не ушли в минус.`,
      items: ending.slice(0, 40).map(x => ({
        p: x.p,
        badge: x.st < 0 ? `минус ${Math.abs(x.st)}` : `ост: ${x.st}`,
        sub: `продано ${x.s30} шт за 30 дней`,
        bad: x.st < 0,
      })),
      weight: 120 + ending.length,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}
