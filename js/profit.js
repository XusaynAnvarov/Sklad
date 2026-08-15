// ========================================================================
//  ПРИБЫЛЬ ПО ГРУППАМ ТОВАРОВ
//  У разных товаров прибыль считается по-разному:
//    • иглы (категория «Нинала») — 10% от выручки;
//    • Нож-70 / Нож-90 / Нож-100 / Нож-125 — чистые $5 с каждой штуки;
//    • всё остальное — общий процент валюты (Дашборд → «% прибыли»).
//  Правила задаёт владелец в Настройках → «Прибыль по группам товаров».
//  Хранятся в settings.profit_rules, резерв — localStorage.
// ========================================================================
import { toUSD } from "./fx.js?v=20260815c";

const LS_KEY = "gm_profit_rules";

// Базовые правила — подставляются, когда владелец ещё ничего не настроил.
// group — под каким названием группа показывается отдельной карточкой на Дашборде.
// Правки числа в этой карточке меняют value у ВСЕХ правил группы.
export const DEFAULT_RULES = [
  { id: "r_needles", kind: "category", key: "Нинала", mode: "pct", value: 10, group: "Иглы", note: "" },
  { id: "r_knife70", kind: "name", key: "Нож-70", mode: "fixed_usd", value: 5, group: "Ножи", note: "" },
  { id: "r_knife90", kind: "name", key: "Нож-90", mode: "fixed_usd", value: 5, group: "Ножи", note: "" },
  { id: "r_knife100", kind: "name", key: "Нож-100", mode: "fixed_usd", value: 5, group: "Ножи", note: "" },
  { id: "r_knife125", kind: "name", key: "Нож-125", mode: "fixed_usd", value: 5, group: "Ножи", note: "" },
];

export const KIND_LABEL = { category: "Категория", name: "Название товара", contains: "Содержит в названии" };
export const MODE_LABEL = { pct: "% от выручки", fixed_usd: "$ за штуку" };

// нормализация одного правила (защита от мусора в базе)
function normRule(r, i) {
  if (!r || typeof r !== "object") return null;
  const kind = ["category", "name", "contains"].includes(r.kind) ? r.kind : "category";
  const mode = r.mode === "fixed_usd" ? "fixed_usd" : "pct";
  const key = String(r.key || "").trim();
  const value = Number(r.value) || 0;
  if (!key) return null;
  // группа не задана — правило само себе группа (отдельная карточка с этим названием)
  const group = String(r.group || "").trim() || key;
  return { id: String(r.id || "r" + i + "_" + key), kind, key, mode, value, group, note: String(r.note || "") };
}

// правила из настроек (облако) с резервом в localStorage; пусто → базовые
export function loadRules(settings) {
  let raw = settings && settings.profit_rules;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
  if (!Array.isArray(raw) || !raw.length) {
    try { const ls = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (Array.isArray(ls)) raw = ls; } catch { }
  }
  if (!Array.isArray(raw)) return DEFAULT_RULES.map(r => ({ ...r }));
  const list = raw.map(normRule).filter(Boolean);
  return list.length ? list : DEFAULT_RULES.map(r => ({ ...r }));
}

// сохранить: сперва локально (чтобы не потерять), потом в облако
export async function saveRules(ctx, rules) {
  const clean = (rules || []).map(normRule).filter(Boolean);
  try { localStorage.setItem(LS_KEY, JSON.stringify(clean)); } catch { }
  try { await ctx.db.saveSettings({ profit_rules: clean }); } catch (e) { return { ok: false, error: e.message || String(e) }; }
  return { ok: true };
}

// подобрать правило для товара: точное название → содержит → категория
export function ruleFor(product, rules) {
  if (!product || !Array.isArray(rules)) return null;
  const name = String(product.name || "").trim().toLowerCase();
  const cat = String(product.category || "").trim().toLowerCase();
  const byName = rules.find(r => r.kind === "name" && r.key.trim().toLowerCase() === name);
  if (byName) return byName;
  const byPart = rules.find(r => r.kind === "contains" && name.includes(r.key.trim().toLowerCase()));
  if (byPart) return byPart;
  const byCat = rules.find(r => r.kind === "category" && r.key.trim().toLowerCase() === cat);
  return byCat || null;
}

// выручка позиции в долларах
export function itemRevenueUSD(item, sale) {
  const cur = (item && item.currency) || (sale && sale.currency) || "som";
  const v = toUSD((Number(item?.qty) || 0) * (Number(item?.unit_price) || 0), cur);
  return isFinite(v) ? v : 0;
}

// ПРИБЫЛЬ ПО ПРАВИЛАМ (в $). pct — общий % по валютам {som,usd,yuan} для товаров без правила.
export function itemProfitUSD(item, sale, product, rules, pct) {
  const rule = ruleFor(product, rules);
  if (rule) {
    if (rule.mode === "fixed_usd") return (Number(item?.qty) || 0) * rule.value;
    return itemRevenueUSD(item, sale) * (rule.value / 100);
  }
  const cur = (item && item.currency) || (sale && sale.currency) || "som";
  const p = (pct && pct[cur]) || 0;
  return itemRevenueUSD(item, sale) * (p / 100);
}

// РЕАЛЬНАЯ прибыль (в $) — выручка минус себестоимость, записанная при оформлении накладной
export function itemCogsUSD(item, product) {
  if (item && item.cogs_usd != null) { const v = Number(item.cogs_usd); return isFinite(v) ? v : 0; }
  const v = (Number(product?.cost_usd) || 0) * (Number(item?.qty) || 0);
  return isFinite(v) ? v : 0;
}
export function itemRealProfitUSD(item, sale, product) {
  return itemRevenueUSD(item, sale) - itemCogsUSD(item, product);
}

// короткая подпись правила для интерфейса: «Нинала → 10%» / «Нож-100 → $5/шт»
export function ruleText(rule) {
  if (!rule) return "общий %";
  return rule.mode === "fixed_usd" ? `$${rule.value}/шт` : `${rule.value}%`;
}

// Группы правил: [{ group, mode, value, keys[] }] — по одной карточке на группу.
// Если внутри группы правила разной величины, берём величину первого (карточка её и правит).
export function ruleGroups(rules) {
  const out = [];
  (rules || []).forEach(r => {
    let g = out.find(x => x.group === r.group);
    if (!g) { g = { group: r.group, mode: r.mode, value: r.value, keys: [] }; out.push(g); }
    g.keys.push(r.key);
  });
  return out;
}

// Пройти по всем продажам одним махом: возвращает итоги и разбивку по товарам.
// Один общий цикл, чтобы Дашборд и Отчёты не считали каждый по-своему.
export function aggregate(sales, pmap, rules, pct) {
  const total = { rev: 0, profit: 0, real: 0, qty: 0 };
  const byProduct = {};   // product_id → { qty, rev, profit, real }
  const byCategory = {};  // категория  → { qty, rev, profit, real }
  const byGroup = {};     // группа правил → { qty, rev, profit, real, revCur{} }
  // товары БЕЗ своего правила — оборот в родной валюте (для карточек «% прибыли»)
  const noRuleByCur = { som: 0, usd: 0, yuan: 0 };
  const noRule = { rev: 0, profit: 0, qty: 0 };

  (sales || []).forEach(s => (s.items || []).forEach(it => {
    const p = pmap[it.product_id];
    const rev = itemRevenueUSD(it, s);
    const prof = itemProfitUSD(it, s, p, rules, pct);
    const real = itemRealProfitUSD(it, s, p);
    const qty = Number(it.qty) || 0;
    total.rev += rev; total.profit += prof; total.real += real; total.qty += qty;

    const a = byProduct[it.product_id] = byProduct[it.product_id] || { qty: 0, rev: 0, profit: 0, real: 0 };
    a.qty += qty; a.rev += rev; a.profit += prof; a.real += real;

    const cat = (p && p.category) || "Без категории";
    const c = byCategory[cat] = byCategory[cat] || { qty: 0, rev: 0, profit: 0, real: 0 };
    c.qty += qty; c.rev += rev; c.profit += prof; c.real += real;

    const rule = ruleFor(p, rules);
    const cur = (it.currency) || s.currency || "som";
    if (rule) {
      const g = byGroup[rule.group] = byGroup[rule.group] || { qty: 0, rev: 0, profit: 0, real: 0, mode: rule.mode, value: rule.value, revCur: { som: 0, usd: 0, yuan: 0 } };
      g.qty += qty; g.rev += rev; g.profit += prof; g.real += real;
      if (g.revCur[cur] !== undefined) g.revCur[cur] += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    } else {
      noRule.rev += rev; noRule.profit += prof; noRule.qty += qty;
      if (noRuleByCur[cur] !== undefined) noRuleByCur[cur] += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    }
  }));
  return { total, byProduct, byCategory, byGroup, noRule, noRuleByCur };
}
