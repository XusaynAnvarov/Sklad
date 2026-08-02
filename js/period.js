// ========================================================================
//  ПЕРИОДЫ: месяцы, годы, сезоны — общий модуль для Дашборда и Отчётов.
//  Чтобы обе страницы считали «Июль 2026» и «Зима 2026» одинаково.
//  Сезоны: зима = дек–фев, весна = март–май, лето = июнь–авг, осень = сен–ноя.
// ========================================================================

export const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const SEASONS = [["winter", "Зима"], ["spring", "Весна"], ["summer", "Лето"], ["autumn", "Осень"]];
export const SEASON_ICON = { winter: "❄", spring: "🌱", summer: "☀", autumn: "🍂" };
export const SEASON_LABEL = { winter: "Зима", spring: "Весна", summer: "Лето", autumn: "Осень" };

// какому сезону принадлежит дата
export function seasonOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return null;
  const m = d.getMonth();
  if (m === 11 || m === 0 || m === 1) return "winter";
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  return "autumn";
}

// сезон, который идёт следующим (для советов «скоро зима — закажите»)
export function nextSeason(cur) {
  const order = ["winter", "spring", "summer", "autumn"];
  const i = order.indexOf(cur || seasonOf(new Date()));
  return order[(i + 1) % 4];
}

// "2026-07" из даты
export function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return null;
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
// "Июль 2026" из "2026-07"
export function monthLabel(key) {
  const [y, m] = String(key || "").split("-").map(Number);
  if (!y || !m) return String(key || "");
  return `${MONTHS[m - 1]} ${y}`;
}
// "июл 26" — короткая подпись для оси диаграммы
export function monthShort(key) {
  const [y, m] = String(key || "").split("-").map(Number);
  if (!y || !m) return String(key || "");
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

// проверка даты на выбранный период: all | this_month | last_month | y:YYYY | m:YYYY-MM | s:YYYY-<season>
export function matchPeriod(dateStr, sel) {
  if (!sel || sel === "all") return true;
  const d = new Date(dateStr); if (isNaN(d)) return false;
  const y = d.getFullYear(), m = d.getMonth(), now = new Date();
  if (sel === "today") return d.toDateString() === now.toDateString();
  if (sel === "this_month") return y === now.getFullYear() && m === now.getMonth();
  if (sel === "last_month") { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return y === lm.getFullYear() && m === lm.getMonth(); }
  if (sel === "this_year") return y === now.getFullYear();
  if (sel.startsWith("y:")) return y === Number(sel.slice(2));
  if (sel.startsWith("m:")) { const [yy, mm] = sel.slice(2).split("-").map(Number); return y === yy && m === mm - 1; }
  if (sel.startsWith("s:")) {
    const [yy, season] = sel.slice(2).split("-"); const Y = Number(yy);
    // зима 2026 = декабрь 2025 + январь/февраль 2026
    if (season === "winter") return (y === Y - 1 && m === 11) || (y === Y && (m === 0 || m === 1));
    if (season === "spring") return y === Y && m >= 2 && m <= 4;
    if (season === "summer") return y === Y && m >= 5 && m <= 7;
    if (season === "autumn") return y === Y && m >= 8 && m <= 10;
  }
  return true;
}

// подпись выбранного периода для заголовков
export function periodLabel(sel, opts) {
  const found = (opts || []).find(o => o.value === sel);
  if (found) return found.label;
  if (!sel || sel === "all") return "Всё время";
  if (sel.startsWith("m:")) return monthLabel(sel.slice(2));
  return sel;
}

// варианты периода из дат продаж: всё / этот-прошлый месяц / годы / сезоны / конкретные месяцы
export function buildPeriodOptions(...lists) {
  const years = new Set(), months = new Set();
  lists.flat().forEach(s => {
    const d = new Date(s && s.date); if (isNaN(d)) return;
    years.add(d.getFullYear()); months.add(monthKey(d));
  });
  const yearsArr = [...years].sort((a, b) => b - a);
  const monthsArr = [...months].sort().reverse().slice(0, 24);
  const opts = [
    { value: "all", label: "Всё время" },
    { value: "today", label: "Сегодня" },
    { value: "this_month", label: "Этот месяц" },
    { value: "last_month", label: "Прошлый месяц" },
    { value: "this_year", label: "Этот год" },
  ];
  yearsArr.forEach(y => opts.push({ value: "y:" + y, label: y + " год" }));
  yearsArr.forEach(y => SEASONS.forEach(([k, lbl]) => opts.push({ value: `s:${y}-${k}`, label: `${lbl} ${y}` })));
  monthsArr.forEach(ym => opts.push({ value: "m:" + ym, label: monthLabel(ym) }));
  return opts;
}

// список месяцев, где было хоть какое-то движение (по возрастанию: "2025-11", "2025-12", …)
export function monthsWithData(...lists) {
  const set = new Set();
  lists.flat().forEach(x => { const k = monthKey(x && x.date); if (k) set.add(k); });
  return [...set].sort();
}
