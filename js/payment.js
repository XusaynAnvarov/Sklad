// ========================================================================
//  СПОСОБЫ ОПЛАТЫ — один справочник на склад, отчёты и Telegram-бота.
//  Нужен, чтобы было видно, ОТКУДА пришли деньги: наличными в руки,
//  переводом на карту через приложение банка, картой через терминал
//  или перечислением со счёта на счёт.
//  Хранится в payments.method. У старых оплат колонки нет — показываем
//  «не указан», ничего не ломая.
// ========================================================================

export const PAY_METHODS = [
  { value: "cash", label: "Наличные", icon: "💵" },
  { value: "card_transfer", label: "Перевод на карту", icon: "📲" },
  { value: "card", label: "Пластиковая карта", icon: "💳" },
  { value: "transfer", label: "Перечисление", icon: "🏦" },
];

export const DEFAULT_METHOD = "cash";
const BY_VALUE = Object.fromEntries(PAY_METHODS.map(m => [m.value, m]));

// Название способа для интерфейса. Пусто/неизвестное → «Не указан».
export function methodLabel(v) {
  const m = BY_VALUE[String(v || "").trim()];
  return m ? m.label : "Не указан";
}
// То же со значком — для Telegram и списков
export function methodText(v) {
  const m = BY_VALUE[String(v || "").trim()];
  return m ? `${m.icon} ${m.label}` : "— Не указан";
}
// Варианты для select() из js/ui.js
export function methodOptions() {
  return PAY_METHODS.map(m => ({ value: m.value, label: `${m.icon} ${m.label}` }));
}
// Известен ли способ (для проверки перед сохранением)
export function isKnownMethod(v) { return !!BY_VALUE[String(v || "").trim()]; }

// Разложить оплаты по способам: { method: { som, usd, yuan, count } }.
// Порядок как в PAY_METHODS, неизвестные — в конце под ключом "".
export function byMethod(payments) {
  const out = {};
  const add = (key) => (out[key] = out[key] || { som: 0, usd: 0, yuan: 0, count: 0 });
  PAY_METHODS.forEach(m => add(m.value));
  (payments || []).forEach(p => {
    const key = isKnownMethod(p && p.method) ? String(p.method).trim() : "";
    const a = add(key);
    const c = p && p.currency;
    if (a[c] !== undefined) a[c] += Number(p.amount) || 0;
    a.count++;
  });
  // способы без единой оплаты не показываем
  Object.keys(out).forEach(k => { if (!out[k].count) delete out[k]; });
  return out;
}
