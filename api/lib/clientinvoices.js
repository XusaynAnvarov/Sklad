// ========================================================================
//  НАКЛАДНЫЕ КЛИЕНТА — один расчёт для чата бота и мини-приложения.
//
//  Клиенту показываем только оформленные накладные (final): черновики,
//  заказы на расчёте и отменённые — это не накладные, они живут в
//  «Мои заказы».
//
//  Остаток долга по накладной считаем так же, как в акте сверки и на сайте:
//  оплаты гасят накладные по очереди, старые первыми, перед ними — старый
//  долг (opening_debt). Каждая валюта отдельно.
// ========================================================================
import { allocatePayments } from "./debt.js";

const ВАЛЮТЫ = ["som", "usd", "yuan"];
const ЗНАК = { usd: "$", yuan: "¥" };
const порог = (c) => (c === "som" ? 1 : 0.01);

// Только нужное: [{ id, date, totals: {som,usd,yuan}, remaining: {…} }],
// новые сверху.
export function накладныеКлиента(sales, payments, openingDebt) {
  const оформленные = (sales || []).filter(s => s && s.status === "final");
  const разнесено = allocatePayments(оформленные, payments || [], openingDebt || {});
  return оформленные
    .map(s => {
      const р = разнесено.get(String(s.id)) || {};
      return {
        id: s.id,
        date: s.date,
        totals: чисто(р.totals),
        remaining: чисто(р.remainings),
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Только валюты с суммой — пустые нули в ответе не нужны.
function чисто(o) {
  const out = {};
  for (const c of ВАЛЮТЫ) if (o && Math.abs(Number(o[c]) || 0) >= порог(c)) out[c] = Math.round(Number(o[c]) * 100) / 100;
  return out;
}

export const естьДолг = (inv) => Object.keys(inv.remaining || {}).length > 0;

export function деньги(n, c) {
  const v = Number(n) || 0;
  const s = (c === "som" ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString("ru-RU");
  return c === "som" ? s + " сум" : (ЗНАК[c] || "") + s;
}
export const суммой = (o) => ВАЛЮТЫ.filter(c => o && o[c]).map(c => деньги(o[c], c)).join(" + ") || "0";

const датой = (d) => {
  const t = new Date(d);
  if (!isFinite(t)) return "—";
  return String(t.getDate()).padStart(2, "0") + "." + String(t.getMonth() + 1).padStart(2, "0") + "." + t.getFullYear();
};

const СЛОВО_ДОЛГ = { ru: "долг", uz: "qarz", en: "debt" };

// Надпись на кнопке в чате: «14.09.2026 · 1 250 000 сум · долг 450 000 сум».
// У оплаченной накладной — только дата и сумма.
export function подписьКнопки(inv, язык = "ru") {
  const части = [датой(inv.date), суммой(inv.totals)];
  if (естьДолг(inv)) части.push((СЛОВО_ДОЛГ[язык] || СЛОВО_ДОЛГ.ru) + " " + суммой(inv.remaining));
  return части.join(" · ");
}

// Можно ли этому клиенту получить PDF этой накладной.
// Кнопки в чате присылает бот, но данные кнопки можно подделать —
// поэтому проверяем владельца и на сервере.
export function своя(sale, customer) {
  return !!(sale && customer && sale.status === "final" && String(sale.customer_id) === String(customer.id));
}
